import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, rng } from './noise.js';
import {
  nearest, openDist, lakeSD, ROAD_BEVEL, LAKE, I_BLOCK_BACK, I_BLOCK_FAR, I_LAKE_IN,
} from './track.js';

// Low-poly, flat-shaded desert. The drivable floor (highway + lakebed) is almost flat
// with soft noise undulation; outside it the ground steps up in terraced, faceted
// benches. Cells use a hashed diagonal so the facets don't read as a grid, and
// terrainHeight() interpolates on the exact same triangles.

const nA = makeNoise2D(11);
const nB = makeNoise2D(23);
const nC = makeNoise2D(37);
const nD = makeNoise2D(51);

export const TZ0 = -520;
export const TZ1 = 1000;
export const TDZ = 4;
export const XS = (() => {
  const pos = [0];
  let x = 0, step = 4;
  while (x < 900) {
    if (x > 220) step = Math.min(30, step * 1.1);
    x += step;
    pos.push(x);
  }
  return [...pos.slice(1).reverse().map((v) => -v), ...pos];
})();
const COLS = XS.length;
const ROWS = Math.floor((TZ1 - TZ0) / TDZ) + 1;
const H = new Float32Array(COLS * ROWS);
const diag = (r, c) => (((r * 73856093) ^ (c * 19349663)) >>> 3) & 1;

const terrace = (h, step) => {
  const k = Math.floor(h / step);
  const f = h / step - k;
  return (k + smoothstep(0.55, 0.95, f)) * step;
};

function heightAt(x, z, n) {
  const D = openDist(x, z, n);
  const lat = Math.abs(n.lat);
  // Rock cuts the highway leaves through at both ends
  const cut = n.i > I_BLOCK_FAR - 6 || n.i < I_BLOCK_BACK + 6 ? lat - 9 : Infinity;
  const Dv = Math.min(D, cut);
  const roadFlat = 1 - smoothstep(ROAD_BEVEL + 0.5, ROAD_BEVEL + 6, lat);
  const y0 = n.y * (1 - smoothstep(20, 80, lat));
  const softAmp = 0.22 + 0.78 * smoothstep(-20, 0, D);
  const soft = (fbm(nA, x / 45, z / 45, 3) * 0.7 + fbm(nB, x / 14, z / 14, 2) * 0.08) * softAmp;
  const ditch = n.i < I_LAKE_IN - 10 ? -0.4 * smoothstep(7.2, 9.5, lat) * (1 - smoothstep(11.5, 16, lat)) : 0;
  let h = y0 - 0.03 + (1 - roadFlat) * soft + ditch;
  if (Dv > 0) {
    const foot = smoothstep(0, 22, Dv) * (2.2 + fbm(nC, x / 60, z / 60, 2) * 1.6);
    const ridge = 1 - Math.abs(nD(x / 220, z / 220));
    const mass = smoothstep(12, 120, Dv) * (0.35 + 0.65 * ridge) * (42 + fbm(nC, x / 300, z / 300, 2) * 26);
    h += terrace(foot + mass, 4.2);
  }
  return h;
}

export function buildTerrain() {
  const count = COLS * ROWS;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const dist = new Float32Array(count);
  const lake = new Float32Array(count);
  const elev = new Float32Array(count);
  for (let r = 0; r < ROWS; r++) {
    const z = TZ0 + r * TDZ;
    let hint = -1;
    for (let c = 0; c < COLS; c++) {
      const x = XS[c];
      const n = nearest(x, z, hint);
      hint = n.i;
      const h = heightAt(x, z, n);
      const k = r * COLS + c;
      H[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
      dist[k] = Math.abs(n.lat);
      lake[k] = lakeSD(x, z);
      elev[k] = h - n.y;
    }
  }
  const index = new Uint32Array((COLS - 1) * (ROWS - 1) * 6);
  let o = 0;
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
      if (diag(r, c)) { index[o++] = a; index[o++] = cc; index[o++] = d; index[o++] = a; index[o++] = d; index[o++] = b; }
      else { index[o++] = a; index[o++] = cc; index[o++] = b; index[o++] = b; index[o++] = cc; index[o++] = d; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();

  const nor = geo.attributes.normal.array;
  const col = new Float32Array(count * 3);
  const C = (h) => new THREE.Color(h);
  const sandA = C('#d99a5c'), sandB = C('#e6b47e'), dark = C('#bd7f4b'), pale = C('#efcb98');
  const playaA = C('#d9b98c'), playaB = C('#ccaa7c');
  const rockA = C('#b05a37'), rockB = C('#cf8655'), rockD = C('#86452c'), benchTop = C('#d49662');
  const gravel = C('#ab937c');
  const tmp = new THREE.Color(), rock = new THREE.Color();
  for (let k = 0; k < count; k++) {
    const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
    tmp.copy(sandA).lerp(sandB, fbm(nA, x / 60, z / 60, 3) * 0.5 + 0.5);
    tmp.lerp(dark, smoothstep(0.1, 0.45, fbm(nD, x / 25, z / 25, 3)) * 0.45);
    tmp.lerp(pale, smoothstep(0.25, 0.6, fbm(nB, x / 12, z / 45, 2)) * 0.3);
    const pl = 1 - smoothstep(-14, -2, lake[k]);
    if (pl > 0) tmp.lerp(rock.copy(playaA).lerp(playaB, fbm(nC, x / 30, z / 30, 2) * 0.5 + 0.5), pl);
    const slope = 1 - nor[k * 3 + 1];
    const high = smoothstep(4, 14, elev[k]);
    if (high > 0 || slope > 0.1) {
      const strata = 0.5 + 0.5 * Math.sin(h * 0.75 + fbm(nC, x / 80, z / 80, 2) * 2);
      rock.copy(rockA).lerp(rockB, strata);
      if (strata > 0.86) rock.lerp(rockD, 0.55);
      const r = Math.max(smoothstep(0.1, 0.3, slope), high * 0.5);
      tmp.lerp(rock, r);
      if (slope < 0.06) tmp.lerp(benchTop, high * 0.5);
    }
    tmp.lerp(gravel, (1 - smoothstep(ROAD_BEVEL, ROAD_BEVEL + 2.5, dist[k])) * 0.75 * (1 - pl));
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: sandDetail(), roughness: 1, metalness: 0, flatShading: true,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  const group = new THREE.Group();
  group.add(mesh, playaOverlay());
  return group;
}

export function terrainHeight(x, z) {
  const fr = Math.min(ROWS - 1.0001, Math.max(0, (z - TZ0) / TDZ));
  const r = Math.floor(fr);
  const v = fr - r;
  const cx = Math.min(XS[COLS - 1] - 1e-3, Math.max(XS[0], x));
  let lo = 0, hi = COLS - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (XS[m] <= cx) lo = m;
    else hi = m;
  }
  const u = (cx - XS[lo]) / (XS[hi] - XS[lo]);
  const i = r * COLS + lo;
  const a = H[i], b = H[i + 1], c = H[i + COLS], d = H[i + COLS + 1];
  if (diag(r, lo)) { // triangles (a, c, d) and (a, d, b)
    return v > u ? a + (d - c) * u + (c - a) * v : a + (b - a) * u + (d - b) * v;
  }
  // triangles (a, c, b) and (b, c, d)
  return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Cracked playa clay laid over the lakebed, fading out at the shore.
function playaOverlay() {
  const W = LAKE.hx * 2 + 50, D = LAKE.hz * 2 + 50;
  const geo = new THREE.PlaneGeometry(W, D, 70, 70).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + LAKE.cx, z = p.getZ(i) + LAKE.cz;
    p.setXYZ(i, x, terrainHeight(x, z) + 0.035, z);
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = 1 - smoothstep(-26, -3, lakeSD(x, z));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  const map = crackTile();
  map.repeat.set(W / 9, D / 9);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

function crackTile() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(303);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 214 + (r() - 0.5) * 18;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 16; img.data[i * 4 + 2] = v - 42; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // jittered lattice -> polygon plates, edges drawn wrapped so the tile repeats
  const n = 7, cell = S / n;
  const pt = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) pt.push([x * cell + (r() - 0.5) * cell * 0.7, y * cell + (r() - 0.5) * cell * 0.7]);
  const P = (x, y) => { const q = pt[((y + n) % n) * n + ((x + n) % n)]; return [q[0] + Math.floor(x / n) * S, q[1] + Math.floor(y / n) * S]; };
  const edge = (a, b) => {
    const segs = 10;
    const pts = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const j = k === 0 || k === segs ? 0 : (r() - 0.5) * 9;
      pts.push([a[0] + (b[0] - a[0]) * t + j, a[1] + (b[1] - a[1]) * t + j]);
    }
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [-S, -S], [S, -S], [-S, S]]) {
      g.strokeStyle = 'rgba(236,214,180,0.5)'; g.lineWidth = 5;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy + 1.5) : g.moveTo(x + ox, y + oy + 1.5))); g.stroke();
      g.strokeStyle = 'rgba(120,92,62,0.85)'; g.lineWidth = 2.2;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.stroke();
    }
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      edge(P(x, y), P(x + 1, y));
      edge(P(x, y), P(x, y + 1));
      if (r() < 0.35) edge(P(x, y), P(x + 1, y + 1));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Tiling grain/pebble detail multiplied over the vertex colours (~4 m per tile).
function sandDetail() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const r = rng(91);
  for (let p = 0; p < S * S; p++) {
    const v = 226 + (r() - 0.5) * 30;
    img.data[p * 4] = v; img.data[p * 4 + 1] = v; img.data[p * 4 + 2] = v; img.data[p * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 220; i++) {
    const x = r() * S, y = r() * S, rad = 0.8 + r() * 2.0;
    const tone = r() < 0.5 ? 160 + r() * 40 : 245;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.fillStyle = `rgba(${tone},${tone - 6},${tone - 12},0.85)`;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rad, rad * 0.75, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
