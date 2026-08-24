import * as THREE from 'three';
import { clamp, isCoarsePointer, rand } from '../lib/dom';

/**
 * Hero particle system.
 *
 * ~14k points (6k on touch devices) spring toward morphing targets —
 * the "JN" monogram sampled from an offscreen canvas, a fibonacci sphere,
 * and a (2,3) torus knot. Pointer repels, click bursts, scroll disperses.
 * Springs do all the animation work: switching a particle's target makes it
 * glide over organically, so morphs come free.
 *
 * Returns a dispose() function, or null when WebGL is unavailable.
 */

const MORPH_INTERVAL_MS = 5200;
type TargetSet = Float32Array;

function sampleText(word: string, count: number): TargetSet {
  const W = 340;
  const H = 170;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.floor(H * 0.78)}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, W / 2, H / 2 + H * 0.04);

  const img = ctx.getImageData(0, 0, W, H).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (img[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
    }
  }
  if (!pts.length) pts.push([W / 2, H / 2]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = 100 / Math.max(1, maxX - minX);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y] = pts[i % pts.length];
    out[i * 3] = (x - cx) * scale + rand(-1.5, 1.5);
    out[i * 3 + 1] = -(y - cy) * scale + rand(-1.5, 1.5);
    out[i * 3 + 2] = rand(-18, 18);
  }
  return out;
}

function sphereTargets(count: number): TargetSet {
  const out = new Float32Array(count * 3);
  const R = 52;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    out[i * 3] = Math.cos(theta) * rad * R;
    out[i * 3 + 1] = y * R;
    out[i * 3 + 2] = Math.sin(theta) * rad * R;
  }
  return out;
}

function torusKnotTargets(count: number): TargetSet {
  // p=2 q=3 knot with a small tube scatter so it reads as volume
  const out = new Float32Array(count * 3);
  const p = 2, q = 3, R = 34, tube = 11;
  for (let i = 0; i < count; i++) {
    const t = rand(0, Math.PI * 2);
    const r = Math.cos(q * t) + 2;
    const s = tube * 0.42;
    out[i * 3] = r * Math.cos(p * t) * R * 0.28 + rand(-s, s);
    out[i * 3 + 1] = -Math.sin(q * t) * R * 0.75 + rand(-s, s);
    out[i * 3 + 2] = r * Math.sin(p * t) * R * 0.28 + rand(-s, s);
  }
  return out;
}

export async function initHeroParticles(canvas: HTMLCanvasElement): Promise<(() => void) | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 900);
  camera.position.z = 150;

  const COUNT = isCoarsePointer() ? 6000 : 14000;

  // sample the monogram once the display font is actually loaded
  try { await document.fonts.load(`700 ${Math.floor(170 * 0.78)}px "Space Grotesk"`); } catch {}

  const states: TargetSet[] = [sampleText('JN', COUNT), sphereTargets(COUNT), torusKnotTargets(COUNT)];
  let stateIdx = 0;

  const positions = new Float32Array(COUNT * 3);
  const velocities = new Float32Array(COUNT * 3);
  const springs = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT * 3);

  const cA = new THREE.Color('#22d3ee');
  const cB = new THREE.Color('#8b5cf6');
  const tmpC = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    // start scattered far away — springs assemble the monogram (entrance fx)
    const th = rand(0, Math.PI * 2);
    const ph = Math.acos(rand(-1, 1));
    const r = rand(180, 260);
    positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
    positions[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    positions[i * 3 + 2] = r * Math.cos(ph);
    springs[i] = rand(0.008, 0.022);
    tmpC.copy(cA).lerp(cB, i / COUNT);
    colors[i * 3] = tmpC.r;
    colors[i * 3 + 1] = tmpC.g;
    colors[i * 3 + 2] = tmpC.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 1.7,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geo, mat));

  // ---------- interaction ----------
  let pointerWx = 9999;
  let pointerWy = 9999;
  let halfH = 0;
  let halfW = 0;

  const computeView = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    halfW = halfH * camera.aspect;
  };
  computeView();

  const onResize = () => computeView();
  addEventListener('resize', onResize, { passive: true });

  const ndcToWorld = (clientX: number, clientY: number): [number, number] => [
    (clientX / innerWidth) * 2 * halfW - halfW,
    -((clientY / innerHeight) * 2 * halfH - halfH),
  ];

  const onMove = (e: PointerEvent) => {
    [pointerWx, pointerWy] = ndcToWorld(e.clientX, e.clientY);
  };
  addEventListener('pointermove', onMove, { passive: true });

  const REPEL_R = 26;
  const BURST_R = 62;
  const onDown = (e: PointerEvent) => {
    const [bx, by] = ndcToWorld(e.clientX, e.clientY);
    for (let i = 0; i < COUNT; i++) {
      const dx = positions[i * 3] - bx;
      const dy = positions[i * 3 + 1] - by;
      const d = Math.hypot(dx, dy);
      if (d < BURST_R) {
        const f = (1 - d / BURST_R) * 7;
        velocities[i * 3] += (dx / (d || 1)) * f;
        velocities[i * 3 + 1] += (dy / (d || 1)) * f;
        velocities[i * 3 + 2] += rand(-3, 3);
      }
    }
  };
  canvas.addEventListener('pointerdown', onDown);

  const morphTimer = window.setInterval(() => {
    stateIdx = (stateIdx + 1) % states.length;
  }, MORPH_INTERVAL_MS);

  let heroVisible = true;
  const io = new IntersectionObserver(
    ([entry]) => {
      heroVisible = !!entry?.isIntersecting;
    },
    { threshold: 0.02 }
  );
  io.observe(canvas);

  let scrollP = 0;
  const onScroll = () => {
    scrollP = clamp(scrollY / (innerHeight * 0.85), 0, 1);
  };
  addEventListener('scroll', onScroll, { passive: true });

  // ---------- loop ----------
  let rafId = 0;
  const startMs = performance.now();

  const frame = () => {
    rafId = requestAnimationFrame(frame);
    if (!heroVisible) return;

    const elapsed = (performance.now() - startMs) * 0.001;
    const tx = states[stateIdx];

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;

      let ax = (tx[ix] - positions[ix]) * springs[i];
      let ay = (tx[iy] - positions[iy]) * springs[i];
      let az = (tx[iz] - positions[iz]) * springs[i];

      const dx = positions[ix] - pointerWx;
      const dy = positions[iy] - pointerWy;
      const d = Math.hypot(dx, dy);
      if (d < REPEL_R && d > 0.001) {
        const f = ((REPEL_R - d) / REPEL_R) * 1.4;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }

      velocities[ix] = (velocities[ix] + ax) * 0.92;
      velocities[iy] = (velocities[iy] + ay) * 0.92;
      velocities[iz] = (velocities[iz] + az) * 0.92;

      positions[ix] += velocities[ix];
      positions[iy] += velocities[iy];
      positions[iz] += velocities[iz];

      // faint shimmer keeps idle shapes alive
      positions[iy] += Math.sin(elapsed * 2 + i) * 0.01;
    }

    mat.opacity = 0.95 * (1 - scrollP);
    scene.rotation.y = scrollP * 0.6;
    camera.position.z = 150 + scrollP * 46;

    geo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  };
  rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    clearInterval(morphTimer);
    removeEventListener('resize', onResize);
    removeEventListener('pointermove', onMove);
    removeEventListener('scroll', onScroll);
    canvas.removeEventListener('pointerdown', onDown);
    io.disconnect();
    geo.dispose();
    mat.dispose();
    renderer.dispose();
  };
}
