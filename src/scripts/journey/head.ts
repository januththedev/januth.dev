import * as THREE from 'three';
import { AsciiEffect } from 'three/examples/jsm/effects/AsciiEffect.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

/**
 * The spinning ASCII avatar — port of elvisdragonmao's intro (Apache-2.0):
 * three.js renders a 3D object, AsciiEffect turns the frame into characters,
 * and scroll keyframes fly the camera while the mesh spins.
 *
 * Object: `public/models/avatar.stl` if you drop one there (a head scan of
 * your own, say) — otherwise an extruded "JN" built from three's bold font.
 */

// camera keyframes from the original — proven composition over four segments
const KEYFRAMES = [
  {
    rx: 1.5707953337814393, ry: -9.503825893487959e-7, rz: 1.2544634559949106,
    px: -0.18851380350171026, py: 0.003374259693436188, pz: 0.03300631548899701,
  },
  {
    px: -2.1797208198865823, py: 0.7456858904043902, pz: 1.259941607611314,
    rx: -0.10187680375576487, ry: -1.3965809813885177, rz: -0.10034508895856986,
  },
  {
    px: -1.1034436569318822, py: 0.7620751528401553, pz: 1.9652184488834998,
    rx: -0.029276658833755884, ry: -0.18859301653013388, rz: -0.005490215016934513,
  },
  {
    px: 3.6492892876810172, py: 1.4758908576810172, pz: 4.25,
    rx: -0.2220876074269339, ry: 0.684948575340779, rz: 0.14189637418696438,
  },
  {
    px: 3.6492892876810172, py: 1.4758908576810172, pz: 4.25,
    rx: -0.2220876074269339, ry: 0.684948575340779, rz: 0.14189637418696438,
  },
];

export interface JourneyHead {
  setProgress(t: number): void;
  dispose(): void;
}

export async function initJourneyHead(container: HTMLElement): Promise<JourneyHead | null> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null; // no WebGL → CSS-only journey (big-title still works)
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // opaque black — required for the ASCII inversion
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);

  // same two-light flat-shaded look as the original
  const light1 = new THREE.PointLight(0xffffff, 1, 0, 0);
  light1.position.set(100, 100, 400);
  scene.add(light1);
  const light2 = new THREE.PointLight(0xffffff, 0.5, 0, 0);
  light2.position.set(-500, 100, -400);
  scene.add(light2);

  const material = new THREE.MeshStandardMaterial();
  material.flatShading = true;
  material.side = THREE.DoubleSide;

  // phones get a slightly coarser grid: chunkier chars (more drama) + cheaper frames
  const portrait = innerWidth < 720;
  const effect = new AsciiEffect(renderer, ' .:-+*=%@#', {
    invert: true,
    resolution: portrait ? 0.16 : 0.205,
  });
  effect.setSize(innerWidth, innerHeight);
  const dom = effect.domElement as HTMLElement;
  dom.classList.add('jn-ascii-frame');
  container.appendChild(dom);

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(mesh);

  let hasModel = false;
  const applyGeometry = (geometry: THREE.BufferGeometry) => {
    geometry.computeVertexNormals();
    geometry.center();
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    // normalize scale so the shared keyframes frame it like the original head
    const maxDim = Math.max(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z
    );
    const s = 1.7 / maxDim;
    geometry.scale(s, s, s);
    geometry.computeBoundingBox();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    hasModel = true;
  };

  // STL if the user supplies one, else extruded JN from the bundled bold font
  try {
    const probe = await fetch('/models/avatar.stl', { method: 'HEAD' });
    if (probe.ok) {
      await new Promise<void>((resolve, reject) => {
        new STLLoader().load('/models/avatar.stl', (geometry) => {
          applyGeometry(geometry);
          resolve();
        }, undefined, reject);
      });
    }
  } catch {
    /* fall through to text */
  }

  if (!hasModel) {
    await new Promise<void>((resolve) => {
      new FontLoader().load('/fonts/helvetiker_bold.typeface.json', (font) => {
        const geo = new TextGeometry('JN', {
          font,
          size: 1,
          depth: 0.42,
          curveSegments: 6,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.02,
          bevelSegments: 2,
        });
        applyGeometry(geo);
        resolve();
      }, undefined, () => resolve());
    });
  }

  // ---------- animation ----------
  let progress = 0;
  let rafId = 0;
  let lastMs = performance.now();

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastMs) / 1000);
    lastMs = now;
    mesh.rotation.z += dt / 3; // the signature spin

    // fly the camera through the keyframes on journey progress; on portrait
    // phones the framing is recomposed (slightly back, head eased right) so the
    // object stays dominant instead of shrinking with the viewport
    const zoom = portrait ? 1.28 : 1;
    const shiftX = portrait ? -0.45 : 0;
    const u = Math.min(progress, 0.9999) * (KEYFRAMES.length - 1);
    const i = Math.floor(u);
    const f = u - i;
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    camera.position.set(
      (a.px + (b.px - a.px) * f) * zoom + shiftX + 0.2 + (innerWidth - 1536) * 0.0004,
      (a.py + (b.py - a.py) * f) * zoom,
      (a.pz + (b.pz - a.pz) * f) * zoom
    );
    camera.rotation.set(
      a.rx + (b.rx - a.rx) * f,
      a.ry + (b.ry - a.ry) * f,
      a.rz + (b.rz - a.rz) * f
    );

    if (hasModel) effect.render(scene, camera);
  };
  rafId = requestAnimationFrame(tick);

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    effect.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  return {
    setProgress(t: number) {
      progress = t;
    },
    dispose() {
      cancelAnimationFrame(rafId);
      removeEventListener('resize', onResize);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      dom.remove();
    },
  };
}
