import * as THREE from 'three';
import { S, LOOP, STEP, ROAD_HALF, pointAt, wAt } from './route.js';
import { roadSurfaceY } from '../level/road.js';

// Kicker ramps: steel wedges bolted to the road on the longest straights, rising over
// their length and ending in a vertical lip, so anything fast enough leaves the ground.
// rampHeight() feeds every car's ground (player and AI alike); buildRamps() places and
// draws them once per circuit.

const RAMPS = []; // { i0, len, lat, w, h }

// extra ground height at a road sample `n` ({ i, f, lat }) from any ramp there
export function rampHeight(n) {
  if (!RAMPS.length) return 0;
  const N = LOOP.n;
  for (const r of RAMPS) {
    if (Math.abs(n.lat - r.lat) > r.w / 2) continue;
    let s = (n.f ?? n.i) - r.i0;
    if (N) s = ((s % N) + N) % N;
    s *= STEP;
    if (s >= 0 && s <= r.len) return (r.h * s) / r.len;
  }
  return 0;
}

function plateTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6d6f70'; g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) { // diamond tread
    g.fillStyle = 'rgba(210,212,214,0.35)'; g.fillRect(x + 3, y + 6, 9, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, y + 9, 9, 1);
  }
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,60,30' : '30,30,30'},${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 512, 3, 3); }
  // hazard chevrons along the lip (top of the texture = far end)
  g.save(); g.beginPath(); g.rect(0, 0, 256, 70); g.clip();
  for (let x = -80; x < 340; x += 40) { g.fillStyle = (x / 40) % 2 ? '#14120f' : '#f2c21b'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x + 75, 70); g.lineTo(x + 35, 70); g.fill(); }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// pick the middles of the longest straight stretches (excluding the start area)
function pickSpots(def) {
  const N = LOOP.n, straight = new Uint8Array(N), H = 8;
  for (let i = 0; i < N; i++) {
    const a = (i - H + N) % N, b = (i + H) % N;
    let dh = Math.atan2(S.tx[b], S.tz[b]) - Math.atan2(S.tx[a], S.tz[a]);
    dh = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));
    straight[i] = dh / (2 * H * STEP) < 0.0025 ? 1 : 0;
  }
  const runs = [];
  for (let i = 0; i < N; ) {
    if (!straight[i]) { i++; continue; }
    let j = i;
    while (j < i + N && straight[j % N]) j++;
    runs.push({ a: i, b: j });
    i = j;
  }
  const skip = (i) => { const k = ((i % N) + N) % N; return k < 320 || k > N - 60; }; // keep the start straight's grid clear
  const out = [];
  for (const r of runs.sort((p, q) => (q.b - q.a) - (p.b - p.a))) {
    if (r.b - r.a < 140 / STEP || out.length >= (def.ramps ?? 1)) continue;
    const mid = Math.round((r.a + r.b) / 2);
    if (skip(mid)) continue;
    if (out.some((o) => Math.abs(o - mid) < 300)) continue;
    out.push(mid);
  }
  return out;
}

export function buildRamps(scene, def, world) {
  RAMPS.length = 0;
  if (!LOOP.on) return;
  const tex = plateTexture(), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.6 });
  const side = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.7, metalness: 0.5 });
  pickSpots(def).forEach((mid, k) => {
    const w0 = wAt(mid), lat = (k % 2 ? 0.32 : -0.32) * ROAD_HALF * w0; // offset so you can choose to skip it
    const r = { i0: mid - 6, len: 11, lat, w: 6.2, h: 1.35 };
    RAMPS.push(r);
    // deck: a ribbon following the road, rising over its length
    const steps = 11, pos = [], uv = [], idx = [], sp = [], si = [];
    for (let q = 0; q <= steps; q++) {
      const s = (q / steps) * r.len, i = r.i0 + s / STEP, h = (r.h * s) / r.len;
      for (const [u, l] of [[0, -r.w / 2], [1, r.w / 2]]) {
        const p = pointAt(Math.round(i), r.lat + l), w = wAt(Math.round(i));
        const y = S.y[((Math.round(i) % LOOP.n) + LOOP.n) % LOOP.n] + roadSurfaceY((r.lat + l) / w) + 0.02;
        pos.push(p.x, y + h, p.z); uv.push(u, q / steps); // v = 1 at the lip (chevrons)
        sp.push(p.x, y + h, p.z, p.x, y - 0.05, p.z); // side cheek top + bottom
      }
    }
    for (let q = 0; q < steps; q++) { const a = q * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const deck = new THREE.BufferGeometry();
    deck.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    deck.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    deck.setIndex(idx);
    deck.computeVertexNormals();
    // cheeks (left: vertices 0,1 of each row; right: 2,3) and the vertical lip at the end
    for (const off of [0, 2]) for (let q = 0; q < steps; q++) {
      const a = q * 4 + off, b = (q + 1) * 4 + off;
      si.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const L = steps * 4;
    si.push(L, L + 1, L + 2, L + 2, L + 1, L + 3);
    const cheeks = new THREE.BufferGeometry();
    cheeks.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    cheeks.setIndex(si);
    cheeks.computeVertexNormals();
    const m1 = new THREE.Mesh(deck, mat), m2 = new THREE.Mesh(cheeks, side);
    m2.material.side = THREE.DoubleSide;
    for (const m of [m1, m2]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
    // the lip is a solid edge: cars that clip it from the side slide off its cheek
    void world;
  });
}
