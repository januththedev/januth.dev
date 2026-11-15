import * as THREE from 'three';

/**
 * The landing's head, built procedurally — no model file, no licence.
 *
 * One faceted head. The face is built like a faceted mask: hand-placed points
 * along the brow, eye slots, nose ridge, lips and chin, Delaunay-triangulated
 * and pushed forward by a depth function, so it reads as big flat planes, with
 * mesh panels in the eye slots. Behind it, a plain low-poly skull, a short neck
 * and shoulders.
 *
 * The surface is cut into chunks — clusters of neighbouring facets — and each
 * vertex carries its chunk's centre, a random triple and, per triangle, which
 * of its edges lie on a chunk boundary. The shader uses that to light the
 * seams and to pull the head apart chunk by chunk.
 */

const gauss = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const pair = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
  gauss(x, y, cx, cy, sx, sy) + gauss(x, y, -cx, cy, sx, sy);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** deterministic PRNG so every visitor sees the same fracture */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/* ---------------- the face: big flat facets, like a faceted mask ---------------- */

/** a sharp-edged pyramid bump, for crisp facets */
const peak = (x: number, y: number, cx: number, cy: number, r: number) =>
  Math.max(0, 1 - Math.hypot(x - cx, y - cy) / r);

// right half (x ≥ 0) of the face's points, in face space: x ±0.95, y +1.12…-1.3
const OUTLINE: [number, number][] = [
  [0, 1.12], [0.3, 1.12], [0.6, 1.07], [0.82, 0.93], [0.93, 0.68], [0.96, 0.38], [0.95, 0.08],
  [0.9, -0.22], [0.8, -0.52], [0.66, -0.8], [0.5, -1.04], [0.32, -1.2], [0.15, -1.28], [0, -1.3],
];
const EYE: [number, number][] = [
  [0.22, 0.2], [0.3, 0.28], [0.52, 0.28], [0.6, 0.2], [0.52, 0.12], [0.3, 0.12],
];
const FEATURES: [number, number][] = [
  // forehead + the two pyramids
  [0.18, 0.97], [0, 0.86], [0.38, 0.86], [0.64, 0.82], [0.2, 0.68], [0.5, 0.64], [0, 0.66], [0.78, 0.62],
  // brow ridge
  [0, 0.44], [0.13, 0.43], [0.33, 0.45], [0.56, 0.43], [0.78, 0.36],
  // nose: ridge, tip, wings, base
  [0, 0.3], [0.08, 0.27], [0.09, 0.02], [0, -0.04], [0.11, -0.22], [0, -0.33], [0.12, -0.36],
  [0.19, -0.32], [0.09, -0.43], [0, -0.44], [0.2, 0.0], [0.21, -0.17],
  // under the eyes, cheekbones, cheeks
  [0.35, 0.02], [0.6, 0.02], [0.8, 0.12], [0.45, -0.18], [0.7, -0.2], [0.33, -0.4], [0.58, -0.45],
  // lips, mouth line, chin
  [0, -0.57], [0.14, -0.55], [0.3, -0.62], [0, -0.67], [0.18, -0.67], [0.36, -0.68],
  [0, -0.79], [0.2, -0.78], [0, -0.9], [0.25, -0.92], [0.42, -0.84], [0.58, -0.64],
  [0, -1.1], [0.2, -1.08], [0.38, -0.98],
];

function faceDepth(x: number, y: number): number {
  const ax = Math.abs(x);
  // a wide, gently curved shell that wraps back at the sides
  let z = 0.42 + 0.64 * Math.sqrt(Math.max(0, 1 - (x / 0.99) ** 2)) - 0.12 * (y / 1.2) ** 2;
  // nose: an angular wedge growing from the bridge to the tip
  const t = smooth(0.32, -0.33, y) * (1 - smooth(-0.33, -0.45, y));
  const w = 0.09 + 0.11 * smooth(0.3, -0.36, y);
  z += (0.06 + 0.34 * t) * Math.max(0, 1 - ax / w) * (y < 0.34 && y > -0.46 ? 1 : 0);
  z -= 0.18 * pair(x, y, 0.41, 0.2, 0.24, 0.13); // eye sockets
  z += 0.08 * Math.exp(-(((y - 0.44) / 0.07) ** 2)) * (1 - smooth(0.75, 0.95, ax)); // brow ridge
  z += 0.11 * pair(x, y, 0.6, -0.04, 0.18, 0.14); // cheekbones
  z -= 0.05 * pair(x, y, 0.27, -0.44, 0.06, 0.14); // grooves beside the mouth
  z += 0.09 * gauss(x, y, 0, -0.58, 0.3, 0.05); // upper lip (calm, not pouting)
  z -= 0.08 * gauss(x, y, 0, -0.67, 0.36, 0.025); // mouth line
  z += 0.08 * gauss(x, y, 0, -0.78, 0.24, 0.06); // lower lip
  z -= 0.05 * gauss(x, y, 0, -0.9, 0.24, 0.045); // under the lip
  z += 0.08 * gauss(x, y, 0, -1.09, 0.24, 0.1); // chin
  z += 0.1 * (peak(x, y, 0.18, 0.97, 0.22) + peak(x, y, -0.18, 0.97, 0.22)); // forehead pyramids
  return z;
}

const inPoly = (x: number, y: number, poly: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Bowyer–Watson Delaunay triangulation — fine for a couple of hundred points */
function delaunay(pts: [number, number][]): [number, number, number][] {
  const n = pts.length;
  const all = [...pts, [-20, -20], [20, -20], [0, 25]] as [number, number][];
  let tris: { a: number; b: number; c: number; cx: number; cy: number; r2: number }[] = [];
  const make = (a: number, b: number, c: number) => {
    const [ax, ay] = all[a];
    const [bx, by] = all[b];
    const [cx, cy] = all[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  tris.push(make(n, n + 1, n + 2));
  for (let i = 0; i < n; i++) {
    const [px, py] = all[i];
    const bad = tris.filter((t) => (px - t.cx) ** 2 + (py - t.cy) ** 2 < t.r2 - 1e-12);
    const edges: [number, number][] = [];
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
        const k = edges.findIndex(([q, r]) => (q === v && r === u) || (q === u && r === v));
        if (k >= 0) edges.splice(k, 1);
        else edges.push([u, v]);
      }
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const [u, v] of edges) tris.push(make(u, v, i));
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

// face space → head space
const MX = 0.86;
const MY = 0.87;
const MOFF = 0.04;

/** the faceted face: triangle positions plus an eye flag per triangle */
function buildFace(): { pos: number[]; eye: number[] } {
  const mirror = (list: [number, number][]) =>
    list.flatMap(([x, y]) => (x === 0 ? [[x, y]] : [[x, y], [-x, y]]) as [number, number][]);
  const eyeL = EYE.map(([x, y]) => [-x, y] as [number, number]);
  const pts = [...mirror(OUTLINE), ...mirror(EYE), ...mirror(FEATURES)];
  const uniq: [number, number][] = [];
  for (const q of pts) if (!uniq.some((u) => Math.abs(u[0] - q[0]) < 1e-6 && Math.abs(u[1] - q[1]) < 1e-6)) uniq.push(q);
  const ring: [number, number][] = [...OUTLINE, ...OUTLINE.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];

  const pos: number[] = [];
  const eye: number[] = [];
  for (const [a, b, c] of delaunay(uniq)) {
    const gx = (uniq[a][0] + uniq[b][0] + uniq[c][0]) / 3;
    const gy = (uniq[a][1] + uniq[b][1] + uniq[c][1]) / 3;
    if (!inPoly(gx, gy, ring)) continue;
    const isEye = inPoly(gx, gy, EYE) || inPoly(gx, gy, eyeL) ? 1 : 0;
    const v = [a, b, c].map((k) => {
      const [x, y] = uniq[k];
      const z = faceDepth(x, y) - (isEye ? 0.05 : 0); // eye mesh sits recessed
      return [x * MX, y * MY + MOFF, z];
    });
    const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1]];
    const e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1]];
    if (e1[0] * e2[1] - e1[1] * e2[0] < 0) [v[1], v[2]] = [v[2], v[1]];
    for (const q of v) pos.push(...q);
    eye.push(isEye);
  }
  return { pos, eye };
}

/** the skull behind the face: a plain low-poly head, big facets to match */
function skull(d: THREE.Vector3, out: THREE.Vector3): void {
  const { y, z } = d;
  out.copy(d);
  out.x *= 0.74;
  out.y *= 1.04;
  out.z *= 0.84;
  const jaw = smooth(-0.05, -0.95, y);
  out.x *= 1 - 0.28 * jaw;
  out.z *= 1 - 0.12 * jaw * (z < 0 ? 1 : 0.4);
  if (z < 0 && y > 0) out.z *= 1 + 0.08 * y;
}

function faceted(g: THREE.BufferGeometry): number[] {
  const n = g.index ? g.toNonIndexed() : g;
  return Array.from(n.attributes.position.array as Float32Array);
}

export function buildHead(chunks = 60): THREE.BufferGeometry {
  const rand = mulberry32(0x4a4e); // "JN"

  // ---- the face: big flat facets with an eye-mesh flag ----
  const face = buildFace();
  const pos: number[] = [...face.pos];
  const eyes: number[] = [...face.eye];

  // ---- the skull behind it: a plain low-poly head (the face covers its front) ----
  const ico = new THREE.IcosahedronGeometry(1, 2);
  const raw = faceted(ico);
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < raw.length; i += 9) {
    const tri: number[] = [];
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      d.set(raw[i + k * 3], raw[i + k * 3 + 1], raw[i + k * 3 + 2]).normalize();
      cz += d.z / 3;
      skull(d, p);
      tri.push(p.x, p.y, p.z);
    }
    if (cz > 0.55) continue; // hidden behind the face anyway
    pos.push(...tri);
    eyes.push(0);
  }
  // ---- a short neck into low shoulders, faceted to match ----
  const neck = new THREE.CylinderGeometry(0.34, 0.42, 0.42, 7, 1, true);
  neck.translate(0, -1.02, -0.08);
  const shoulders = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  shoulders.scale(1.4, 0.5, 0.66);
  shoulders.translate(0, -1.62, -0.12);
  const body = [...faceted(neck), ...faceted(shoulders)];
  pos.push(...body);
  for (let i = 0; i < body.length / 9; i++) eyes.push(0);
  ico.dispose();
  neck.dispose();
  shoulders.dispose();

  const tris = pos.length / 9;

  // ---- chunk the surface: nearest of N seeds picked from triangle centres ----
  const cent = new Float32Array(tris * 3);
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) cent[t * 3 + k] = (pos[t * 9 + k] + pos[t * 9 + 3 + k] + pos[t * 9 + 6 + k]) / 3;
  }
  // farthest-point sampling gives evenly sized chunks
  const seeds: number[] = [Math.floor(rand() * tris)];
  const best = new Float32Array(tris).fill(Infinity);
  while (seeds.length < chunks) {
    const s = seeds[seeds.length - 1];
    let far = 0;
    let farD = -1;
    for (let t = 0; t < tris; t++) {
      const dd =
        (cent[t * 3] - cent[s * 3]) ** 2 + (cent[t * 3 + 1] - cent[s * 3 + 1]) ** 2 + (cent[t * 3 + 2] - cent[s * 3 + 2]) ** 2;
      if (dd < best[t]) best[t] = dd;
      // a little noise so the cuts aren't too regular
      const score = best[t] * (0.75 + rand() * 0.5);
      if (score > farD) {
        farD = score;
        far = t;
      }
    }
    seeds.push(far);
  }
  const owner = new Int32Array(tris);
  for (let t = 0; t < tris; t++) {
    let bi = 0;
    let bd = Infinity;
    for (let s = 0; s < seeds.length; s++) {
      const q = seeds[s];
      const dd = (cent[t * 3] - cent[q * 3]) ** 2 + (cent[t * 3 + 1] - cent[q * 3 + 1]) ** 2 + (cent[t * 3 + 2] - cent[q * 3 + 2]) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = s;
      }
    }
    owner[t] = bi;
  }

  // chunk centres + per-chunk randoms
  const sum = seeds.map(() => [0, 0, 0, 0]);
  for (let t = 0; t < tris; t++) {
    const s = sum[owner[t]];
    s[0] += cent[t * 3];
    s[1] += cent[t * 3 + 1];
    s[2] += cent[t * 3 + 2];
    s[3]++;
  }
  const rnd = seeds.map(() => [rand(), rand(), rand()]);

  // seams: an edge is a seam when the triangle across it is in another chunk
  const key = (i: number) => `${pos[i].toFixed(4)},${pos[i + 1].toFixed(4)},${pos[i + 2].toFixed(4)}`;
  const edgeOwners = new Map<string, number[]>();
  const edgeKey = (a: number, b: number) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  for (let t = 0; t < tris; t++) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(t * 9 + ((e + 1) % 3) * 3, t * 9 + ((e + 2) % 3) * 3);
      const list = edgeOwners.get(k);
      if (list) list.push(owner[t]);
      else edgeOwners.set(k, [owner[t]]);
    }
  }

  const center: number[] = [];
  const rands: number[] = [];
  const bary: number[] = [];
  const seam: number[] = [];
  const eyeAttr: number[] = [];
  const tone: number[] = [];
  for (let t = 0; t < tris; t++) {
    const s = sum[owner[t]];
    // edge e is opposite vertex e
    const flags = [0, 1, 2].map((e) => {
      const list = edgeOwners.get(edgeKey(t * 9 + ((e + 1) % 3) * 3, t * 9 + ((e + 2) % 3) * 3)) ?? [];
      return list.some((o) => o !== owner[t]) || list.length < 2 ? 1 : 0; // open edges (rims) count as seams
    });
    const tt = rand(); // every facet its own tone, like light on a faceted mask
    for (let v = 0; v < 3; v++) {
      center.push(s[0] / s[3], s[1] / s[3], s[2] / s[3]);
      rands.push(...rnd[owner[t]]);
      bary.push(v === 0 ? 1 : 0, v === 1 ? 1 : 0, v === 2 ? 1 : 0);
      seam.push(...flags);
      eyeAttr.push(eyes[t]);
      tone.push(tt);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(rands, 3));
  g.setAttribute('aBary', new THREE.Float32BufferAttribute(bary, 3));
  g.setAttribute('aSeam', new THREE.Float32BufferAttribute(seam, 3));
  g.setAttribute('aEye', new THREE.Float32BufferAttribute(eyeAttr, 1));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  return g;
}
