import { rng } from '../level/noise.js';

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
export const I_START = START_BACK;
export const I_END = Infinity; // asphalt everywhere

const MIN_R = 520;
const MAX_HEADING = 0.72;

let cap = 8192;
export const S = {
  count: 0,
  px: new Float32Array(cap), pz: new Float32Array(cap),
  tx: new Float32Array(cap), tz: new Float32Array(cap),
  y: new Float32Array(cap), k: new Float32Array(cap), // k = signed curvature (+ = turning right)
};
export const RAILS = []; // { side, i0, i1 } appended as chunks decide them

const r = rng(9001);
let x = 0, z = -START_BACK, h = 0, curv = 0, target = 0, nextChange = START_BACK + 380;

const rawElev = (s) => 2.4 * Math.sin(s / 210 + 0.6) + 1.2 * Math.sin(s / 83 + 1.9) + 0.45 * Math.sin(s / 37);

function grow() {
  cap *= 2;
  for (const key of ['px', 'pz', 'tx', 'tz', 'y', 'k']) {
    const a = new Float32Array(cap);
    a.set(S[key]);
    S[key] = a;
  }
}

// Make sure samples exist up to index n (exclusive).
export function ensure(n) {
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
ensure(START_BACK + 2000);

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
  i = Math.max(0, Math.min(S.count - 1, Math.round(i)));
  return {
    x: S.px[i] - S.tz[i] * lat,
    z: S.pz[i] + S.tx[i] * lat,
    y: S.y[i],
    yaw: Math.atan2(S.tx[i], S.tz[i]),
  };
}

export function nearest(xq, zq, hint = -1) {
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
