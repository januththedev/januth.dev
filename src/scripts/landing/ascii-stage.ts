import * as THREE from 'three';
import { buildHead } from './head-geometry';

/**
 * The landing's one WebGL canvas.
 *
 * Pass 1 renders the faceted head into a small render target — two texels per
 * text cell. Red carries the lit surface, green carries the glowing seams
 * between chunks.
 *
 * Pass 2 is a full-screen shader that turns every cell into a glyph from a
 * pre-drawn atlas. It also draws the intro's burst field and the shockwave of
 * the final blast procedurally, so the whole sequence is one draw call.
 *
 * The break, in four stages (all driven from landing.ts):
 *   crack    the seams between chunks light up and open a hair
 *   explode  chunks drift apart into an exploded view, tumbling slowly
 *   fly      chunks blast past the camera, staggered
 *   blast    a ring of characters rips outward from the head
 */

export interface StageState {
  /** intro field: 0 = nothing, 1 = burst covers the screen */
  burst: number;
  /** intro field: 0 = full, 1 = drained to black */
  drain: number;
  /** head dissolve-in, 0..1 */
  assemble: number;
  crack: number;
  explode: number;
  fly: number;
  blast: number;
  /** final dissolve of anything left, 0..1 */
  out: number;
  /** 0 = head sits right of the text, 1 = centred */
  centre: number;
  /** overall head brightness (dimmed behind text on narrow screens) */
  dim: number;
}

export interface AsciiStage {
  state: StageState;
  /** draw one frame; `now` in ms */
  render(now: number): void;
  resize(): void;
  setPointer(x: number, y: number): void;
  dispose(): void;
}

const RAMP = ' .:-=+*#%@';
const CODE = '01{}<>/;=_';

function makeAtlas(font: string): THREE.CanvasTexture {
  const cw = 48;
  const ch = 76;
  const c = document.createElement('canvas');
  c.width = cw * 10;
  c.height = ch * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(ch * 0.74)}px ${font}`;
  [RAMP, CODE].forEach((row, r) => {
    [...row].forEach((chr, i) => g.fillText(chr, i * cw + cw / 2, r * ch + ch / 2 + 2));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

const HEAD_VERT = /* glsl */ `
  uniform float uCrack;
  uniform float uExplode;
  uniform float uFly;
  uniform float uTime;
  attribute vec3 aCenter;
  attribute vec3 aRand;
  attribute vec3 aBary;
  attribute vec3 aSeam;
  attribute float aEye;
  attribute float aTone;
  varying float vEye;
  varying float vTone;
  varying vec3 vView;
  varying vec3 vBary;
  varying vec3 vSeam;
  varying float vFly;
  varying float vEx;
  varying float vFacet;
  varying float vFade;
  varying float vY;

  mat3 rotAxis(vec3 a, float ang) {
    float s = sin(ang), c = cos(ang), oc = 1.0 - c;
    return mat3(
      oc*a.x*a.x + c,     oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
      oc*a.x*a.y - a.z*s, oc*a.y*a.y + c,     oc*a.y*a.z + a.x*s,
      oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c
    );
  }

  void main() {
    vec3 c = aCenter;
    vec3 local = position - c;
    vec3 axis = normalize(aRand * 2.0 - 1.0 + vec3(0.001));
    vec3 away = normalize(c - vec3(0.0, -0.25, -0.1));

    // 1. crack — the seams open a hair
    local *= 1.0 - uCrack * 0.09;

    // 2. explode — staggered drift into an exploded view, slow tumble
    float ex = clamp(uExplode * 1.5 - aRand.x * 0.5, 0.0, 1.0);
    ex = ex * ex * (3.0 - 2.0 * ex);
    float bob = sin(uTime * 0.9 + aRand.x * 6.28) * 0.05 * ex;
    vec3 push = away * ex * (0.1 + aRand.z * 0.26) + vec3(0.0, bob, 0.0);
    float ang = ex * (0.18 + aRand.y * 0.5) + sin(uTime * 0.6 + aRand.z * 6.28) * 0.08 * ex;

    // 3. fly — staggered blast past the camera
    float fl = clamp(uFly * 1.7 - aRand.y * 0.7, 0.0, 1.0);
    fl = fl * fl;
    push += (away * vec3(1.6, 1.3, 0.4) + vec3(0.0, 0.0, 1.3)) * fl * (5.5 + aRand.z * 5.0);
    ang += fl * (4.0 + aRand.x * 7.0);

    vec3 p = c + rotAxis(axis, ang) * local + push;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = mv.xyz;
    vBary = aBary;
    vSeam = aSeam;
    vFly = fl;
    vEx = ex;
    vFacet = aRand.y;
    vY = position.y;
    vEye = aEye;
    vTone = aTone;
    // pieces fade as they rush the camera, so they streak past instead of filling the screen
    vFade = smoothstep(0.6, 2.6, -mv.z) * (1.0 - smoothstep(0.75, 1.0, fl));
    gl_Position = projectionMatrix * mv;
  }
`;

const HEAD_FRAG = /* glsl */ `
  uniform float uGlow;
  varying vec3 vView;
  varying vec3 vBary;
  varying vec3 vSeam;
  varying float vFly;
  varying float vEx;
  varying float vFacet;
  varying float vFade;
  varying float vY;
  varying float vEye;
  varying float vTone;
  void main() {
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    // a high, raking key so brows, nose and cheekbones throw shadows
    vec3 key = normalize(vec3(-0.55, 0.75, 0.45));
    vec3 fill = normalize(vec3(0.6, -0.1, 0.8));
    vec3 rim = normalize(vec3(0.9, 0.2, -0.25));
    float lum = 0.02
      + 0.95 * max(dot(n, key), 0.0)
      + 0.3 * max(dot(n, fill), 0.0)
      + 0.3 * pow(max(dot(n, rim), 0.0), 2.0);
    lum *= mix(0.5, 1.0, smoothstep(-1.45, -0.95, vY)); // shoulders recede
    lum = pow(clamp(lum, 0.0, 1.2), 1.25);
    lum *= 0.6 + 0.8 * vTone;             // each facet its own tone, like a faceted mask
    lum *= gl_FrontFacing ? 1.0 : 0.25;
    lum *= 1.0 + vFly * 0.9;              // flying pieces catch the light

    // seams: distance to the triangle's chunk-boundary edges, in screen space
    vec3 w = fwidth(vBary) * 1.6;
    vec3 near = 1.0 - smoothstep(vec3(0.0), w, vBary);
    float seam = max(max(near.x * vSeam.x, near.y * vSeam.y), near.z * vSeam.z);
    // the head's facets read faintly even before it breaks
    // before the break the chunk seams show as dark lines: the boxes are visible from the start
    lum *= 1.0 - seam * 0.75 * (1.0 - uGlow);
    float glow = clamp(seam * uGlow * (1.0 + vEx), 0.0, 1.0);
    // eye slots: a mesh panel the ASCII pass draws as a lattice
    float eye = vEye * vFade * (1.0 - vFly);
    gl_FragColor = vec4(lum * vFade, glow * vFade, eye, 1.0);
  }
`;

const ASCII_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tAtlas;
  uniform vec2 uGrid;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uBurst;
  uniform float uDrain;
  uniform float uAssemble;
  uniform float uOut;
  uniform float uDim;
  uniform float uBlast;
  uniform vec2 uBlastAt;
  uniform vec3 uAccent;
  uniform vec3 uInk;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  vec3 glyph(float index, float row, vec2 cuv) {
    vec2 uv = (vec2(index, 1.0 - row) + vec2(cuv.x, cuv.y)) / vec2(10.0, 2.0);
    return texture2D(tAtlas, uv).rgb;
  }

  void main() {
    vec2 cell = floor(vUv * uGrid);
    vec2 cuv = fract(vUv * uGrid);
    vec2 cc = (cell + 0.5) / uGrid;
    float h = hash(cell);
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);

    // ---- intro field: erupts from behind the centre, then drains top-down ----
    vec2 p = (cc - 0.5) * aspect;
    float d = length(p);
    float ang = atan(p.y, p.x);
    float rays = 0.72 + 0.28 * noise(vec2(ang * 4.0, uTime * 0.5));
    float front = uBurst * 1.35 * rays;
    float stream = noise(vec2(ang * 7.0, d * 9.0 - uTime * 4.5));
    float shimmer = noise(cell * 0.13 + vec2(uTime * 0.4, -uTime * 1.3));
    float field = smoothstep(front, front - 0.42, d) * (0.18 + 0.55 * stream + 0.35 * shimmer);
    float edge = smoothstep(front - 0.09, front, d) * smoothstep(front + 0.04, front, d);
    field = max(field, edge * step(0.002, uBurst) * (0.7 + 0.3 * h));
    field += (1.0 - smoothstep(0.0, 0.22 + uBurst * 0.25, d)) * uBurst * 0.25;
    float drainLine = uDrain * 1.5 - (1.0 - cc.y) * 0.5;
    field *= step(drainLine, h);

    // ---- the blast: a shockwave ring of characters tearing outward ----
    vec2 bp = (cc - uBlastAt) * aspect;
    float bd = length(bp);
    float bang = atan(bp.y, bp.x);
    float radius = 0.08 + uBlast * 1.05;
    // a thin, ragged ring — the edge tears in and out with angle, and thins as it grows
    float rag = (noise(vec2(bang * 6.0, uBlast * 4.0)) - 0.5) * 0.12 * uBlast;
    float ring = exp(-pow((bd - radius - rag) / (0.03 + uBlast * 0.035), 2.0));
    float tear = step(0.28, noise(vec2(bang * 14.0, uBlast * 9.0)));
    float blast = ring * tear * step(0.001, uBlast) * (1.0 - uBlast) * 1.3;

    // ---- the head ----
    vec4 s = texture2D(tScene, cc);
    float on = step(h, uAssemble) * step(uOut, h);
    float lum = s.r * on * uDim;
    float seam = s.g * on;

    vec3 col = vec3(0.0);
    if (s.b > 0.5 && on > 0.5 && seam < 0.3) {
      // the eye slots are a mesh: a lattice of bright points over black
      float lattice = step(0.5, mod(cell.x + cell.y, 2.0));
      col = glyph(lattice > 0.5 ? 7.0 : 1.0, 0.0, cuv) * uInk * (0.45 + 0.6 * lattice) * uDim;
    } else if (seam > 0.3) {
      // glowing seams: bright accent code glyphs flickering along the cracks
      float flick = floor(hash(cell * 1.37 + vec2(floor(uTime * 9.0 + h * 5.0) * 7.1, 1.7)) * 10.0);
      col = glyph(flick, 1.0, cuv) * uAccent * (0.75 + 0.6 * seam);
    } else if (blast > max(lum, field) && blast > 0.05) {
      float v = clamp(blast, 0.0, 1.0);
      float g = floor(hash(cell * 1.37 + vec2(floor(uTime * 12.0) * 7.1, 3.3)) * 10.0);
      col = glyph(g, 1.0, cuv) * mix(uAccent, vec3(1.0), v * 0.5) * (0.5 + 0.8 * v);
    } else if (lum > field && lum > 0.03) {
      float v = clamp(lum, 0.0, 1.0);
      col = glyph(floor(v * 9.99), 0.0, cuv) * uInk * (0.35 + 0.75 * v);
    } else if (field > 0.03) {
      float v = clamp(field, 0.0, 1.0);
      col = glyph(floor(v * 9.99), 0.0, cuv) * mix(uAccent * 0.85, vec3(1.0), v * v * 0.6);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function cssColor(name: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(raw || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function createAsciiStage(canvas: HTMLCanvasElement): AsciiStage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

  // ---------- pass 1: the head ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  camera.position.set(0, 0, 5.2);
  const group = new THREE.Group();
  scene.add(group);

  const head = buildHead();
  const headUniforms = {
    uCrack: { value: 0 },
    uExplode: { value: 0 },
    uFly: { value: 0 },
    uTime: { value: 0 },
    uGlow: { value: 0 },
  };
  const headMat = new THREE.ShaderMaterial({
    vertexShader: HEAD_VERT,
    fragmentShader: HEAD_FRAG,
    uniforms: headUniforms,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(head, headMat);
  mesh.frustumCulled = false; // chunks fly far outside the original bounds
  group.add(mesh);

  const target = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });

  // ---------- pass 2: glyphs ----------
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
  const atlas = makeAtlas(font);
  const asciiUniforms = {
    tScene: { value: target.texture },
    tAtlas: { value: atlas },
    uGrid: { value: new THREE.Vector2(1, 1) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBurst: { value: 0 },
    uDrain: { value: 0 },
    uAssemble: { value: 0 },
    uOut: { value: 0 },
    uDim: { value: 1 },
    uBlast: { value: 0 },
    uBlastAt: { value: new THREE.Vector2(0.5, 0.5) },
    uAccent: { value: cssColor('--accent', '#21dd84') },
    uInk: { value: cssColor('--soft', '#c9cad2') },
  };
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: ASCII_FRAG,
      uniforms: asciiUniforms,
      depthTest: false,
      depthWrite: false,
    })
  );
  quadScene.add(quad);

  const state: StageState = {
    burst: 0, drain: 0, assemble: 0, crack: 0, explode: 0, fly: 0, blast: 0, out: 0, centre: 0, dim: 1,
  };

  let width = 1;
  let height = 1;
  let visibleW = 1;
  const resize = () => {
    width = canvas.clientWidth || innerWidth;
    height = canvas.clientHeight || innerHeight;
    renderer.setSize(width, height, false);
    // character cell: 7px wide on desktop, a little smaller on phones; 1.62 aspect
    const cw = width < 640 ? 5.5 : width < 1100 ? 6.5 : 7;
    const cols = Math.floor(width / cw);
    const rows = Math.floor(height / (cw * 1.62));
    asciiUniforms.uGrid.value.set(cols, rows);
    asciiUniforms.uRes.value.set(width, height);
    target.setSize(cols * 2, rows * 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    visibleW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
    asciiUniforms.uAccent.value = cssColor('--accent', '#21dd84');
    asciiUniforms.uInk.value = cssColor('--soft', '#c9cad2');
  };
  resize();

  let px = 0;
  let py = 0;
  let lx = 0;
  let ly = 0;
  const projected = new THREE.Vector3();

  return {
    state,
    resize,
    setPointer(x, y) {
      px = x;
      py = y;
    },
    render(now) {
      const t = now / 1000;
      lx += (px - lx) * 0.05;
      ly += (py - ly) * 0.05;

      // composition: right of the text on wide screens, centred for the finale
      const wide = width / height > 1.15;
      const restX = wide ? Math.min(visibleW * 0.23, 2.0) : 0;
      const c = state.centre;
      group.position.x = restX * (1 - c);
      group.position.y = (wide ? 0.2 : 0.28) - c * 0.06;
      const scale = (wide ? 0.8 : 0.72) * (1 + c * 0.12 + state.explode * 0.06);
      group.scale.setScalar(scale);

      // idle sway; the exploded view keeps turning slowly so its depth reads
      const sway = 1 - Math.min(1, state.fly * 2);
      group.rotation.y = (Math.sin(t * 0.45) * 0.32 + lx * 0.35) * sway + state.explode * Math.sin(t * 0.25) * 0.35;
      group.rotation.x = (Math.sin(t * 0.31) * 0.05 + ly * 0.12) * sway;
      group.updateMatrixWorld();

      headUniforms.uCrack.value = state.crack;
      headUniforms.uExplode.value = state.explode;
      headUniforms.uFly.value = state.fly;
      headUniforms.uTime.value = t;
      headUniforms.uGlow.value = state.crack;

      renderer.setRenderTarget(target);
      renderer.clear();
      if (state.assemble > 0) renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // the shockwave starts where the head is on screen
      projected.set(0, 0, 0).applyMatrix4(group.matrixWorld).project(camera);
      asciiUniforms.uBlastAt.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);

      asciiUniforms.uTime.value = t;
      asciiUniforms.uBurst.value = state.burst;
      asciiUniforms.uDrain.value = state.drain;
      asciiUniforms.uAssemble.value = state.assemble;
      asciiUniforms.uOut.value = state.out;
      asciiUniforms.uDim.value = state.dim;
      asciiUniforms.uBlast.value = state.blast;
      renderer.render(quadScene, quadCam);
    },
    dispose() {
      head.dispose();
      headMat.dispose();
      (quad.material as THREE.Material).dispose();
      quad.geometry.dispose();
      atlas.dispose();
      target.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
