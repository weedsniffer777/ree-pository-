import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, rng } from './noise.js';
import { nearest, sideDist, ROAD_HALF, ROAD_BEVEL } from './track.js';

// Heightfield desert: flat driving corridor, shallow ditches, dunes, then rising
// hills and crags that close the world in. Columns are dense near the route.

const nA = makeNoise2D(11);
const nB = makeNoise2D(23);
const nC = makeNoise2D(37);
const nD = makeNoise2D(51);

export const TZ0 = -320;
export const TZ1 = 2950;
export const TDZ = 3.5;
export const XS = (() => {
  const pos = [0];
  let x = 0, step = 2.5;
  while (x < 560) {
    if (x > 115) step = Math.min(20, step * 1.09);
    x += step;
    pos.push(x);
  }
  return [...pos.slice(1).reverse().map((v) => -v), ...pos];
})();
const COLS = XS.length;
const ROWS = Math.floor((TZ1 - TZ0) / TDZ) + 1;
const H = new Float32Array(COLS * ROWS);

function heightAt(x, z, n) {
  let d = Math.abs(n.lat);
  const ds = sideDist(x, z); // the side road carves its own shallow valley
  const dEff = Math.min(d, ds + 1);
  const gentle = fbm(nA, x / 34, z / 34, 3) * 0.8 + fbm(nB, x / 8, z / 8, 2) * 0.1;
  const dunes = fbm(nB, x / 95, z / 95, 4) * 5.0;
  const ditch = -0.45 * smoothstep(7.2, 9.5, d) * (1 - smoothstep(11.5, 16, d)) * smoothstep(5, 10, ds);
  const tRoad = smoothstep(ROAD_HALF + 1.0, ROAD_HALF + 11, dEff);
  const hd = Math.min(d, ds + 16);
  const hills = (fbm(nC, x / 260, z / 260, 5) * 0.55 + 0.5) * 52 * smoothstep(34, 150, hd);
  const crags = Math.max(0, fbm(nD, x / 70, z / 70, 3)) * 18 * smoothstep(60, 160, hd);
  return n.y - 0.03 + ditch + tRoad * (gentle + dunes * smoothstep(14, 45, dEff)) + hills + crags;
}

export function buildTerrain() {
  const count = COLS * ROWS;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const dist = new Float32Array(count);
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
      elev[k] = h - n.y;
    }
  }
  const index = new Uint32Array((COLS - 1) * (ROWS - 1) * 6);
  let o = 0;
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
      index[o++] = a; index[o++] = cc; index[o++] = b;
      index[o++] = b; index[o++] = cc; index[o++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();

  // Vertex colours: warm sand, darker desert pavement, wind streaks, red rock on slopes,
  // grey gravel apron along the asphalt.
  const nor = geo.attributes.normal.array;
  const col = new Float32Array(count * 3);
  const C = (h) => new THREE.Color(h);
  const sandA = C('#d6965a'), sandB = C('#e4b07a'), pale = C('#ecc898'), dark = C('#b77a48');
  const rockA = C('#a55636'), rockB = C('#c47a50'), rockD = C('#7d4530'), gravel = C('#c79a6c');
  const tmp = new THREE.Color(), rock = new THREE.Color();
  for (let k = 0; k < count; k++) {
    const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
    tmp.copy(sandA).lerp(sandB, fbm(nA, x / 60, z / 60, 3) * 0.5 + 0.5);
    tmp.lerp(dark, smoothstep(0.1, 0.45, fbm(nD, x / 25, z / 25, 3)) * 0.55);
    tmp.lerp(pale, smoothstep(0.25, 0.6, fbm(nB, x / 12, z / 45, 2)) * 0.35);
    const slope = 1 - nor[k * 3 + 1];
    const rockiness = Math.max(smoothstep(0.12, 0.35, slope), smoothstep(10, 30, elev[k]) * 0.6);
    if (rockiness > 0) {
      const strata = 0.5 + 0.5 * Math.sin(h * 0.9 + fbm(nC, x / 40, z / 40, 2) * 3);
      rock.copy(rockA).lerp(rockB, strata);
      if (strata > 0.85) rock.lerp(rockD, 0.5);
      tmp.lerp(rock, rockiness);
    }
    tmp.lerp(gravel, (1 - smoothstep(ROAD_BEVEL, ROAD_BEVEL + 3.5, dist[k])) * 0.4);
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: sandDetail(), roughness: 1, metalness: 0, flatShading: true,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function terrainHeight(x, z) {
  const fr = Math.min(ROWS - 1.0001, Math.max(0, (z - TZ0) / TDZ));
  const r = Math.floor(fr);
  const tz = fr - r;
  const cx = Math.min(XS[COLS - 1], Math.max(XS[0], x));
  let lo = 0, hi = COLS - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (XS[m] <= cx) lo = m;
    else hi = m;
  }
  const tx = (cx - XS[lo]) / (XS[hi] - XS[lo]);
  const i = r * COLS + lo;
  return (H[i] * (1 - tx) + H[i + 1] * tx) * (1 - tz) + (H[i + COLS] * (1 - tx) + H[i + COLS + 1] * tx) * tz;
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
    const v = 222 + (r() - 0.5) * 34;
    img.data[p * 4] = v; img.data[p * 4 + 1] = v; img.data[p * 4 + 2] = v; img.data[p * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, rad = 0.8 + r() * 2.2;
    const tone = r() < 0.5 ? 150 + r() * 40 : 245;
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
