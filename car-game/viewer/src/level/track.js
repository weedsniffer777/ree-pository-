import * as THREE from 'three';
import { makeNoise2D, smoothstep } from './noise.js';

// Level 1: a short desert highway that runs into a dry lakebed arena, crosses it and
// leaves through a rock cut. Both ends are barricaded. Driving direction is +Z.
// "lat" is the signed lateral offset from the centre line, positive = driver's right.

export const ROAD_HALF = 6.1; // asphalt edge (two 3.7 m lanes + paved shoulders)
export const ROAD_BEVEL = 6.6; // where the crumbling asphalt edge meets the ground
export const LANE = 3.7; // centre line to edge line
export const FENCE = 20.5; // ranch fence either side of the intro highway
export const CORRIDOR = 19.5; // drivable half-width of the intro highway
export const RAIL_LAT = 7.2;
export const RAILS = [];

// Lakebed arena: rounded rectangle with a wobbly shoreline
export const LAKE = { cx: 0, cz: 330, hx: 125, hz: 120, r: 38 };

const CTRL = [
  [0, -460], [0, -300], [0, -120], [0, 0], [5, 100], [0, 200], [0, 330], [0, 460],
  [-10, 570], [-26, 700], [-40, 880],
];
const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const LEN = curve.getLength();
const N = Math.round(LEN);
export const STEP = LEN / N;
const pts = curve.getSpacedPoints(N);

export const S = {
  count: N + 1,
  px: new Float32Array(N + 1),
  pz: new Float32Array(N + 1),
  tx: new Float32Array(N + 1),
  tz: new Float32Array(N + 1),
  y: new Float32Array(N + 1),
};
for (let i = 0; i <= N; i++) {
  S.px[i] = pts[i].x;
  S.pz[i] = pts[i].z;
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(N, i + 1)];
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  S.tx[i] = (b.x - a.x) / l;
  S.tz[i] = (b.z - a.z) / l;
}

export function idxForZ(z) {
  let lo = 0, hi = N;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S.pz[m] <= z) lo = m;
    else hi = m;
  }
  return z - S.pz[lo] < S.pz[hi] - z ? lo : hi;
}

export const I_START = idxForZ(0);
export const I_BLOCK_BACK = idxForZ(-40); // debris wall behind the start
export const I_LAKE_IN = idxForZ(LAKE.cz - LAKE.hz); // where the highway reaches the lakebed
export const I_BLOCK_FAR = idxForZ(LAKE.cz + LAKE.hz - 4); // barricade at the far shore
export const I_GAS = idxForZ(258);
export const I_END = N;

// Gentle rolling on the intro, dead flat across the lakebed, climbing through the far cut.
for (let i = 0; i <= N; i++) {
  const s = i * STEP;
  let y = 0.7 * Math.sin(s / 90) + 0.35 * Math.sin(s / 41 + 1);
  y *= 1 - smoothstep(I_LAKE_IN - 70, I_LAKE_IN - 15, i);
  y += Math.max(0, (i - I_BLOCK_FAR - 25) * STEP) * 0.045;
  S.y[i] = y;
}

export const GAS = { i: I_GAS, s: I_GAS * STEP, y: S.y[I_GAS], halfLen: 34, latIn: 6.4, latOut: 47 };
export const ARENA = { x: LAKE.cx, z: LAKE.cz, y: 0, r: Math.min(LAKE.hx, LAKE.hz) };

export function pointAt(i, lat = 0) {
  i = Math.max(0, Math.min(N, Math.round(i)));
  return {
    x: S.px[i] - S.tz[i] * lat,
    z: S.pz[i] + S.tx[i] * lat,
    y: S.y[i],
    yaw: Math.atan2(S.tx[i], S.tz[i]),
  };
}

// Closest centre-line sample. Pass the previous index as `hint` for a cheap local search.
export function nearest(x, z, hint = -1) {
  let c = hint >= 0 ? hint : idxForZ(z);
  let w = hint >= 0 ? 8 : 60;
  let best = c;
  let bd = Infinity;
  for (;;) {
    const a = Math.max(0, c - w);
    const b = Math.min(N, c + w);
    for (let i = a; i <= b; i++) {
      const dx = x - S.px[i], dz = z - S.pz[i];
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if ((best === a && a > 0) || (best === b && b < N)) { c = best; w = 8; continue; }
    break;
  }
  const dx = x - S.px[best], dz = z - S.pz[best];
  const along = dx * S.tx[best] + dz * S.tz[best];
  const lat = -dx * S.tz[best] + dz * S.tx[best];
  const f = Math.min(N, Math.max(0, best + along / STEP));
  const i0 = Math.floor(f);
  const i1 = Math.min(N, i0 + 1);
  return { i: best, s: f * STEP, lat, y: S.y[i0] + (S.y[i1] - S.y[i0]) * (f - i0) };
}

const shore = makeNoise2D(77);
// Signed distance to the lakebed shoreline (negative inside).
export function lakeSD(x, z) {
  const qx = Math.abs(x - LAKE.cx) - (LAKE.hx - LAKE.r);
  const qz = Math.abs(z - LAKE.cz) - (LAKE.hz - LAKE.r);
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - LAKE.r;
  return sd + shore(x / 70, z / 70) * 7;
}

// Signed distance to the edge of the drivable area: lakebed plus the intro highway.
export function openDist(x, z, n = nearest(x, z)) {
  let d = lakeSD(x, z);
  if (n.i >= I_BLOCK_BACK && n.i <= I_LAKE_IN + 30) d = Math.min(d, Math.abs(n.lat) - CORRIDOR);
  return d;
}

export function inLake(x, z) {
  return lakeSD(x, z) < -2;
}

// Gas station frame: along the road tangent at GAS.i, lat to the right.
export function gasLocal(x, z) {
  const i = GAS.i;
  const dx = x - S.px[i], dz = z - S.pz[i];
  return { along: dx * S.tx[i] + dz * S.tz[i], lat: -dx * S.tz[i] + dz * S.tx[i] };
}
export function gasToWorld(along, lat) {
  const i = GAS.i;
  return { x: S.px[i] + S.tx[i] * along - S.tz[i] * lat, z: S.pz[i] + S.tz[i] * along + S.tx[i] * lat };
}
