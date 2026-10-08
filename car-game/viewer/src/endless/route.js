import * as THREE from 'three';
import { rng } from '../level/noise.js';
import { currentMap } from './maps.js';
import { TRACKS } from './tracks.js';

// Endless route: one sample per metre, generated ahead on demand. Heading is a smooth
// random walk (straights and long sweeping curves, min radius > terrain half-width so
// the road-aligned terrain never folds), clamped so the road always progresses in +Z.
// "lat" is the signed lateral offset from the centre line, positive = driver's right.

export const STEP = 1;
export const ROAD_HALF = 6.1;
export const ROAD_BEVEL = 6.6;
export const LANE = 3.7;
export const FENCE = 19.5;
export const RAIL_LAT = 7.2;
export const START_BACK = 300; // samples of road behind the start line
const MAP = currentMap();
// Closed-loop tracks fill the sample arrays once; indices wrap instead of growing.
export const LOOP = { on: !!MAP.track, n: 0, len: 0, id: MAP.id, def: MAP.track ? TRACKS[MAP.id] : null, walls: 'rails' };
export const wAt = (i) => (LOOP.on ? S.w[((Math.round(i) % LOOP.n) + LOOP.n) % LOOP.n] : 1);
export const I_START = LOOP.on ? 0 : START_BACK;
export const I_END = Infinity; // asphalt everywhere

const MIN_R = 520;
const MAX_HEADING = 0.72;

let cap = 8192;
export const S = {
  count: 0,
  px: new Float32Array(cap), pz: new Float32Array(cap),
  tx: new Float32Array(cap), tz: new Float32Array(cap),
  y: new Float32Array(cap), k: new Float32Array(cap), // k = signed curvature (+ = turning right)
  w: new Float32Array(cap).fill(1), // road width scale (loops vary it around the lap)
};
export const RAILS = []; // { side, i0, i1 } appended as chunks decide them

const r = rng(9001);
let x = 0, z = -START_BACK, h = 0, curv = 0, target = 0, nextChange = START_BACK + 380;

const rawElev = (s) => 2.4 * Math.sin(s / 210 + 0.6) + 1.2 * Math.sin(s / 83 + 1.9) + 0.45 * Math.sin(s / 37);

function grow() {
  cap *= 2;
  for (const key of ['px', 'pz', 'tx', 'tz', 'y', 'k', 'w']) {
    const a = new Float32Array(cap).fill(key === 'w' ? 1 : 0);
    a.set(S[key]);
    S[key] = a;
  }
}

// Make sure samples exist up to index n (exclusive).
export function ensure(n) {
  if (LOOP.on) return;
  while (S.count < n) {
    const i = S.count;
    if (i >= cap) grow();
    if (i >= nextChange) {
      const roll = r();
      if (roll < 0.35) target = 0;
      else target = (r() < 0.5 ? -1 : 1) / (MIN_R + r() * 900);
      // steer back toward +Z when the heading drifts
      if (h > MAX_HEADING * 0.6) target = -Math.abs(target || 1 / 900);
      if (h < -MAX_HEADING * 0.6) target = Math.abs(target || 1 / 900);
      nextChange = i + 140 + Math.floor(r() * 260);
    }
    curv += Math.sign(target - curv) * Math.min(Math.abs(target - curv), 0.000012);
    h += curv * STEP;
    if (Math.abs(h) > MAX_HEADING) { h = Math.sign(h) * MAX_HEADING; curv = 0; }
    // heading h: 0 = +Z; positive turns toward -X (the driver's right)
    const tx = -Math.sin(h), tz = Math.cos(h);
    S.px[i] = x; S.pz[i] = z;
    S.tx[i] = tx; S.tz[i] = tz;
    S.k[i] = curv;
    S.y[i] = rawElev(i * STEP);
    x += tx * STEP;
    z += tz * STEP;
    S.count++;
  }
}

// ---- Closed loop ----
const CELL = 32;
const cells = new Map();
const cellKey = (cx, cz) => cx * 73856093 ^ cz * 19349663;

function fillLoop(def) {
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 6000;
  const L = curve.getLength();
  const N = Math.max(64, Math.round(L / 64) * 64);
  while (N > cap) grow();
  const pts = curve.getSpacedPoints(N);
  for (let i = 0; i < N; i++) {
    S.px[i] = pts[i].x; S.pz[i] = pts[i].z;
    const a = pts[(i + 1) % N], b = pts[(i - 1 + N) % N];
    const dx = a.x - b.x, dz = a.z - b.z, l = Math.hypot(dx, dz);
    S.tx[i] = dx / l; S.tz[i] = dz / l;
    let y = 0;
    for (const [amp, harm, ph] of def.elev) y += amp * Math.sin((2 * Math.PI * harm * i) / N + ph);
    S.y[i] = y;
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const h0 = Math.atan2(-S.tx[i], S.tz[i]), h1 = Math.atan2(-S.tx[j], S.tz[j]);
    S.k[i] = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)) / (L / N);
    if (i % 2 === 0) {
      const cx = Math.floor(S.px[i] / CELL), cz = Math.floor(S.pz[i] / CELL), key = cellKey(cx, cz);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
  }
  // road width scale, eased (periodic cosine) between the def's [lap fraction, scale] pairs
  const wp = [...(def.width ?? [[0, 1]])].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < N; i++) {
    const f = i / N, ff = f < wp[0][0] ? f + 1 : f;
    let w = wp[0][1];
    for (let q = 0; wp.length > 1 && q < wp.length; q++) {
      const a = wp[q], b = wp[(q + 1) % wp.length], f0 = a[0], f1 = q + 1 < wp.length ? b[0] : b[0] + 1;
      if (ff >= f0 && ff < f1) { const t = (ff - f0) / (f1 - f0); w = a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t); break; }
    }
    S.w[i] = w;
  }
  S.count = N;
  LOOP.n = N;
  LOOP.len = L;
  LOOP.walls = def.walls ?? 'both';
}
if (LOOP.on) fillLoop(LOOP.def);
else ensure(START_BACK + 2000);

// Index of the road sample nearest (x, z) using the spatial hash; -1 if none within `rings` cells.
export function gridNearest(x, z, rings = 40) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= rings; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const list = cells.get(cellKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const i of list) {
        const ex = x - S.px[i], ez = z - S.pz[i], d = ex * ex + ez * ez;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best >= 0 && bd <= (r * CELL) * (r * CELL)) break;
  }
  return best;
}

function nearestLoop(xq, zq, hint) {
  const N = LOOP.n;
  let c = hint >= 0 ? hint % N : Math.max(0, gridNearest(xq, zq));
  let best = c;
  for (let iter = 0; iter < 80; iter++) {
    let bd = Infinity, bo = 0;
    for (let d = -8; d <= 8; d++) {
      const i = (c + d + N) % N;
      const dx = xq - S.px[i], dz = zq - S.pz[i], q = dx * dx + dz * dz;
      if (q < bd) { bd = q; best = i; bo = d; }
    }
    if (Math.abs(bo) === 8) { c = best; continue; }
    break;
  }
  const dx = xq - S.px[best], dz = zq - S.pz[best];
  const along = dx * S.tx[best] + dz * S.tz[best];
  const lat = -dx * S.tz[best] + dz * S.tx[best];
  const f = best + along / STEP;
  const fl = Math.floor(f), i0 = ((fl % N) + N) % N, i1 = (i0 + 1) % N;
  return { i: best, f, s: f * STEP, lat, y: S.y[i0] + (S.y[i1] - S.y[i0]) * (f - fl) };
}

export function idxForZ(zq) {
  let lo = 0, hi = S.count - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S.pz[m] <= zq) lo = m;
    else hi = m;
  }
  return zq - S.pz[lo] < S.pz[hi] - zq ? lo : hi;
}

export function pointAt(i, lat = 0) {
  i = LOOP.on ? ((Math.round(i) % LOOP.n) + LOOP.n) % LOOP.n : Math.max(0, Math.min(S.count - 1, Math.round(i)));
  return {
    x: S.px[i] - S.tz[i] * lat,
    z: S.pz[i] + S.tx[i] * lat,
    y: S.y[i],
    yaw: Math.atan2(S.tx[i], S.tz[i]),
  };
}

export function nearest(xq, zq, hint = -1) {
  if (LOOP.on) return nearestLoop(xq, zq, hint);
  const N = S.count - 1;
  let c = hint >= 0 ? Math.min(hint, N) : idxForZ(zq);
  let w = hint >= 0 ? 8 : 60;
  let best = c, bd = Infinity;
  for (;;) {
    const a = Math.max(0, c - w), b = Math.min(N, c + w);
    for (let i = a; i <= b; i++) {
      const dx = xq - S.px[i], dz = zq - S.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if ((best === a && a > 0) || (best === b && b < N)) { c = best; w = 8; continue; }
    break;
  }
  const dx = xq - S.px[best], dz = zq - S.pz[best];
  const along = dx * S.tx[best] + dz * S.tz[best];
  const lat = -dx * S.tz[best] + dz * S.tx[best];
  const f = Math.min(N, Math.max(0, best + along / STEP));
  const i0 = Math.floor(f), i1 = Math.min(N, i0 + 1);
  return { i: best, f, s: f * STEP, lat, y: S.y[i0] + (S.y[i1] - S.y[i0]) * (f - i0) };
}

export function corridor() {
  return { left: FENCE - 1.15, right: FENCE - 1.15 };
}
