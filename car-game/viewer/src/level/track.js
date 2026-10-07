import * as THREE from 'three';
import { smoothstep } from './noise.js';

// Level 1 route: a desert highway sampled every ~1 m. Driving direction is +Z.
// "lat" is the signed lateral offset from the centre line, positive = driver's right.

export const ROAD_HALF = 6.1; // asphalt edge (two 3.7 m lanes + paved shoulders)
export const ROAD_BEVEL = 6.6; // where the crumbling asphalt edge meets the ground
export const LANE = 3.7; // centre line to edge line
export const FENCE = 19.5; // ranch fence either side of the corridor
export const RAIL_LAT = 7.2; // guardrail line

const CTRL = [
  [0, -300], [0, -150], [0, 0], [5, 150], [-9, 300], [-27, 450], [-30, 560], [-20, 690],
  [6, 840], [30, 980], [36, 1110], [18, 1250], [3, 1380], [0, 1480], [0, 1620], [0, 1860],
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
export const I_GAS = idxForZ(505);
export const I_ARENA = idxForZ(1480);
export const I_END = Math.min(N, I_ARENA + 40); // asphalt stops inside the arena

// Gentle rolling elevation, flattened at the gas station and the arena.
const rawElev = (s) => 2.4 * Math.sin(s / 210 + 0.6) + 1.2 * Math.sin(s / 83 + 1.9) + 0.45 * Math.sin(s / 37);
const sGas = I_GAS * STEP;
const sArena = I_ARENA * STEP;
for (let i = 0; i <= N; i++) {
  const s = i * STEP;
  let y = rawElev(s);
  y += (rawElev(sGas) - y) * (1 - smoothstep(45, 85, Math.abs(s - sGas)));
  y += (rawElev(sArena) - y) * smoothstep(sArena - 150, sArena - 70, s);
  S.y[i] = y;
}

export const GAS = { i: I_GAS, s: sGas, y: S.y[I_GAS], halfLen: 34, latIn: 6.4, latOut: 47 };
export const ARENA = { i: I_ARENA, s: sArena, x: S.px[I_ARENA], z: S.pz[I_ARENA], y: S.y[I_ARENA], r: 60 };

// Guardrails on the outside of the three main curves. side: +1 right, -1 left.
export const RAILS = [
  { side: -1, i0: idxForZ(240), i1: idxForZ(400) },
  { side: 1, i0: idxForZ(800), i1: idxForZ(930) },
  { side: -1, i0: idxForZ(1150), i1: idxForZ(1290) },
];

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

// Drivable lateral limits for the car centre at sample i.
export function corridor(i) {
  const s = i * STEP;
  const right = Math.abs(s - GAS.s) < GAS.halfLen + 3 ? GAS.latOut - 1.5 : FENCE - 1.15;
  return { left: FENCE - 1.15, right };
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
