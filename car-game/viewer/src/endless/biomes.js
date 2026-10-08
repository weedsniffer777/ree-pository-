import * as THREE from 'three';

// Biomes in the order you reach them. Each run cycles through this list; numbers and
// colours are blended across BLEND metres at every boundary. A biome is pure data:
// terrain palette and shape, scatter densities and landmark odds.
const C = (h) => new THREE.Color(h);

export const BIOMES = [
  {
    name: 'Desert Highway', len: 2600,
    sandA: C('#d6965a'), sandB: C('#e4b07a'), dark: C('#b77a48'), pale: C('#ecc898'),
    rockA: C('#a55636'), rockB: C('#c47a50'), rockD: C('#7d4530'), gravel: C('#c79a6c'),
    hills: 52, hillStart: 34, crags: 18, dunes: 5, edge: 30,
    bush: 1, grass: 1, saguaro: 1, ocotillo: 1, rocks: 1, boulders: 1,
    billboard: 0.35, tower: 0.16, windpump: 0.1,
  },
  {
    name: 'Salt Flats', len: 2400,
    sandA: C('#e6dccb'), sandB: C('#f1ebe0'), dark: C('#d2c3aa'), pale: C('#faf6ef'),
    rockA: C('#b38a6c'), rockB: C('#cfae90'), rockD: C('#8f6a52'), gravel: C('#d8ccb8'),
    hills: 30, hillStart: 150, crags: 4, dunes: 0.5, edge: 26,
    bush: 0.12, grass: 0.2, saguaro: 0, ocotillo: 0.05, rocks: 0.25, boulders: 0.2,
    billboard: 0.25, tower: 0.08, windpump: 0.02,
  },
  {
    name: 'Red Canyon', len: 2600,
    sandA: C('#c8794a'), sandB: C('#d99260'), dark: C('#a65c36'), pale: C('#e3a676'),
    rockA: C('#9c4128'), rockB: C('#c0603a'), rockD: C('#6e2c1c'), gravel: C('#b8805a'),
    hills: 78, hillStart: 26, crags: 34, dunes: 3, edge: 40,
    bush: 0.6, grass: 0.5, saguaro: 0.45, ocotillo: 0.8, rocks: 1.4, boulders: 2,
    billboard: 0.12, tower: 0.05, windpump: 0.04,
  },
];

const BLEND = 300;
const TOTAL = BIOMES.reduce((a, b) => a + b.len, 0);

// Which biome (index and run-relative number) a distance from the start falls in.
export function biomeIndexAt(d) {
  let s = ((Math.max(0, d) % TOTAL) + TOTAL) % TOTAL;
  for (let k = 0; k < BIOMES.length; k++) {
    if (s < BIOMES[k].len) return k;
    s -= BIOMES[k].len;
  }
  return 0;
}

const out = {};
for (const [key, v] of Object.entries(BIOMES[0])) out[key] = v instanceof THREE.Color ? v.clone() : v;

// Blended parameters at distance d from the start (reuses one object; copy if kept).
export function biomeAt(d) {
  d = Math.max(0, d);
  let s = d % TOTAL;
  let k = 0;
  while (s >= BIOMES[k].len) { s -= BIOMES[k].len; k++; }
  const A = BIOMES[k];
  const B = BIOMES[(k + 1) % BIOMES.length];
  const t = Math.max(0, (s - (A.len - BLEND)) / BLEND);
  const tt = t * t * (3 - 2 * t);
  for (const key of Object.keys(A)) {
    const a = A[key], b = B[key];
    if (a instanceof THREE.Color) out[key].copy(a).lerp(b, tt);
    else if (typeof a === 'number') out[key] = a + (b - a) * tt;
    else out[key] = tt < 0.5 ? a : b;
  }
  return out;
}
