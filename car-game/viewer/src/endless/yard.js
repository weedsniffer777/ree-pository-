import * as THREE from 'three';
import { rng, makeNoise2D, fbm } from '../level/noise.js';
import { std } from '../level/structures.js';
import { bakeGroup } from '../level/bake.js';
import { S, LOOP, pointAt, gridNearest } from './route.js';
import { hash, C, RL, toWorld, tex, canvas, chainTexture as chainTex } from './kit.js';

// Container terminal set pieces, modelled on the real thing, and the lot generator that
// fills the ground around the circuit with them. Local frames: X across, Z along, Y up,
// origin on the ground at the centre of the footprint.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Box from a to b with a w x h cross-section.
function bar(g, a, b, w, h, mat) {
  const A = V(...a), B = V(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, A.distanceTo(B)), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.lookAt(B);
  g.add(m);
  return m;
}
function bx(g, w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
  return m;
}
function cy(g, rt, rb, h, seg, mat, x, y, z, { rx = 0, rz = 0, open = false } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  g.add(m);
  return m;
}
const scaleUV = (geo, su, sv) => {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
};
// BoxGeometry whose uvs repeat once per `cell` metres on every face.
function boxUV(w, h, d, cell = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / cell, (uv.getY(i) * sv) / cell);
  }
  return g;
}
const panel = (g, w, h, d, mat, x, y, z, cell = 4) => {
  const m = new THREE.Mesh(boxUV(w, h, d, cell), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
};

// ---------------------------------------------------------------- textures

// Corrugated sheet, 4 m per tile: ribs, mismatched replacement sheets, rust blooms and runs.
export function corrugated(seed, base, rust = 0.6, { horizontal = false } = {}) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  for (let p = 0; p < 4; p++) {
    const swap = r() < 0.18, v = 0.86 + r() * 0.22;
    const col = swap ? [base[0] * 0.8 + 30, base[1] * 0.8 + 28, base[2] * 0.8 + 24] : base;
    g.fillStyle = `rgb(${col[0] * v},${col[1] * v},${col[2] * v})`;
    g.fillRect(p * 64, 0, 64, 256);
  }
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x, 0, 2, 256);
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.fillRect(x + 4, 0, 3, 256);
  }
  for (let k = 0; k < 40 * rust; k++) { // rust blooms
    const x = r() * 256, y = r() < 0.6 ? 200 + r() * 56 : r() * 256, rad = 6 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${120 + r() * 30},${58 + r() * 20},${28},${0.35 + r() * 0.35})`); gr.addColorStop(1, 'rgba(110,55,25,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let k = 0; k < 30 * rust; k++) { // runs from fixings
    const x = Math.floor(r() * 32) * 8 + 5, y = r() < 0.5 ? 0 : 100 + r() * 60, len = 40 + r() * 150;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(105,52,24,${0.35 + r() * 0.3})`); gr.addColorStop(1, 'rgba(105,52,24,0)');
    g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 3, len);
  }
  const dirt = g.createLinearGradient(0, 180, 0, 256);
  dirt.addColorStop(0, 'rgba(40,32,24,0)'); dirt.addColorStop(1, 'rgba(40,32,24,0.45)');
  g.fillStyle = dirt; g.fillRect(0, 180, 256, 76);
  for (let k = 0; k < 5 * rust; k++) { g.fillStyle = 'rgba(15,12,10,0.85)'; g.fillRect(r() * 250, r() * 250, 2 + r() * 5, 2 + r() * 4); } // holes
  for (let k = 0; k < 1800; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,24,18' : '230,225,210'},${r() * 0.1})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  if (horizontal) { // rotate for roller doors / roof runs
    const [c2, g2] = canvas(256, 256);
    g2.translate(128, 128); g2.rotate(Math.PI / 2); g2.drawImage(c, -128, -128);
    return tex(c2);
  }
  return tex(c);
}

// Concrete apron: 6 m slabs (two per 12 m tile), joints, tyre polish, oil, cracks, patches.
function slabTexture() {
  const [c, g] = canvas(512, 512);
  const r = rng(404);
  for (let sx = 0; sx < 4; sx++) for (let sz = 0; sz < 4; sz++) {
    const v = 0.93 + r() * 0.1;
    g.fillStyle = `rgb(${140 * v},${139 * v},${135 * v})`;
    g.fillRect(sx * 128, sz * 128, 128, 128);
  }
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let p = 0; p < 512 * 512; p++) { const n = (r() - 0.5) * 16; d[p * 4] += n; d[p * 4 + 1] += n; d[p * 4 + 2] += n; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 9; k++) { // oil and water stains
    const x = r() * 512, y = r() * 512, rad = 10 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(20,18,16,${0.06 + r() * 0.12})`); gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let k = 0; k < 3; k++) { // patch repairs
    const x = Math.floor(r() * 4) * 128, y = Math.floor(r() * 4) * 128;
    g.fillStyle = `rgba(${r() < 0.5 ? '96,94,90' : '160,158,152'},0.35)`; g.fillRect(x, y, 128, 128);
  }
  g.strokeStyle = 'rgba(40,38,36,0.6)'; g.lineWidth = 2;
  for (let t = 0; t <= 512; t += 128) { g.beginPath(); g.moveTo(t, 0); g.lineTo(t, 512); g.moveTo(0, t); g.lineTo(512, t); g.stroke(); }
  g.lineWidth = 1.4;
  for (let k = 0; k < 14; k++) { // cracks
    let x = r() * 512, y = r() * 512;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}
let _slab = null;
export const slabMap = () => (_slab ??= slabTexture());

// Steel plate courses with rust weeping from the seams (tanks, silos).
function plateTexture(seed, base) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 256, 2);
    for (let x = (y / 42) % 2 ? 0 : 40; x < 256; x += 80) g.fillRect(x, y, 2, 42);
    for (let k = 0; k < 6; k++) {
      const x = r() * 256, len = 10 + r() * 50;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(118,62,30,${0.25 + r() * 0.35})`); gr.addColorStop(1, 'rgba(118,62,30,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 3, len);
    }
  }
  const dirt = g.createLinearGradient(0, 200, 0, 256);
  dirt.addColorStop(0, 'rgba(50,40,30,0)'); dirt.addColorStop(1, 'rgba(50,40,30,0.4)');
  g.fillStyle = dirt; g.fillRect(0, 200, 256, 56);
  return tex(c);
}

function hazardTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#e0b52a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1b1b1c';
  for (let k = -64; k < 128; k += 32) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 16, 64); g.lineTo(k + 80, 0); g.lineTo(k + 64, 0); g.closePath(); g.fill(); }
  return tex(c);
}

const M = {}; // shared materials
function mats() {
  if (M.ready) return M;
  M.dark = std(0x2c2e30, { roughness: 0.6, metalness: 0.5 });
  M.steel = std(0x7a7f84, { roughness: 0.55, metalness: 0.55 });
  M.glass = std(0x1d272c, { roughness: 0.15, metalness: 0.7 });
  M.yellow = std(0xd3a527, { roughness: 0.6, metalness: 0.3 });
  M.hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 });
  M.concrete = std(0x9a968c, { roughness: 0.95 });
  M.rubber = std(0x1d1d1e, { roughness: 0.9 });
  M.glow = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  M.red = new THREE.MeshBasicMaterial({ color: 0xff3a24 });
  M.house = new THREE.MeshStandardMaterial({ map: corrugated(51, [205, 203, 196], 0.25), roughness: 0.7, metalness: 0.3 });
  M.ready = true;
  return M;
}
const paint = (hex) => std(hex, { roughness: 0.55, metalness: 0.35 });

// ---------------------------------------------------------------- cranes

// Ship-to-shore quay crane. Box-section legs on rail bogies, portal and tie beams, two
// trolley girders running across the road into a long boom (toward +X) and a backreach,
// an A-frame with forestays and backstays, machinery house, trolley with hanging cab,
// headblock and spreader, a stair tower and aviation lights.
export function stsCrane({ main = 0x3d6e99, upper = 0xd8d4c8, load = false, tint = 0x55645a } = {}) {
  const m = mats(), g = new THREE.Group(), P = paint(main), U = paint(upper);
  const GX = 17, LZ = 9, PT = 36, GY = 40.5, back = -GX - 24, tip = GX + 58;
  for (const sx of [-1, 1]) {
    const x = sx * GX;
    bx(g, 2.6, 2.0, 2 * LZ + 9, P, x, 2.4, 0); // sill beam
    for (const sz of [-1, 1]) {
      bx(g, 3.0, 1.0, 6, m.dark, x, 0.95, sz * (LZ + 1.6)); // bogie
      for (const k of [-2.2, -0.75, 0.75, 2.2]) cy(g, 0.5, 0.5, 0.55, 12, m.dark, x, 0.5, sz * (LZ + 1.6) + k, { rz: Math.PI / 2 });
      bx(g, 2.7, 0.6, 1.6, m.hazard, x, 3.5, sz * (LZ + 4)); // buffer ends
      bar(g, [x, 3.2, sz * LZ], [x * 0.985, PT, sz * LZ * 0.93], 2.4, 2.4, P); // legs
    }
    bar(g, [x, 19, -LZ], [x, 19, LZ], 1.6, 1.8, P); // tie beam
    bar(g, [x, 4, -LZ], [x, 18.4, 0], 0.9, 0.9, P); // braces
    bar(g, [x, 4, LZ], [x, 18.4, 0], 0.9, 0.9, P);
    bar(g, [x, PT, -LZ], [x, PT, LZ], 2.2, 2.8, P); // side head beam
    for (const sz of [-2.4, 2.4]) bar(g, [x, PT, sz], [x, GY - 1.6, sz], 1.2, 1.2, P); // girder supports
  }
  for (const sz of [-1, 1]) bx(g, 2 * GX + 2.4, 3.0, 2.2, P, 0, PT, sz * LZ * 0.93); // portal beams
  // trolley girders: backreach, over the road, and out along the boom (slight rise)
  for (const sz of [-2.4, 2.4]) {
    bar(g, [back, GY, sz], [GX, GY, sz], 1.6, 3.2, P);
    bar(g, [GX, GY, sz], [tip, GY + 1.2, sz], 1.5, 2.8, P);
    bar(g, [back, GY + 1.95, sz + Math.sign(sz) * 1.0], [tip, GY + 3.0, sz + Math.sign(sz) * 1.0], 0.06, 0.06, m.steel); // handrail
  }
  for (let x = back + 2; x < tip; x += 9) bx(g, 1.0, 0.9, 4.8, P, x, GY - 1.1 + Math.max(0, (x - GX) / (tip - GX)) * 1.2, 0); // cross ties
  bx(g, 2.2, 3.4, 6.4, m.dark, tip + 0.8, GY + 1.3, 0); // boom tip
  // A-frame and stays
  const AX = 11, AY = 66;
  for (const sz of [-1, 1]) {
    bar(g, [GX, PT + 1, sz * LZ * 0.85], [AX, AY, sz * 2.6], 1.8, 1.8, U);
    bar(g, [-GX, PT + 1, sz * LZ * 0.85], [AX, AY, sz * 2.6], 1.6, 1.6, U);
    bar(g, [AX, AY, sz * 2.4], [GX + 26, GY + 1.7, sz * 2.4], 0.35, 0.35, m.steel); // forestays
    bar(g, [AX, AY, sz * 2.4], [tip - 3, GY + 2.6, sz * 2.4], 0.35, 0.35, m.steel);
    bar(g, [AX, AY, sz * 2.4], [back + 3, GY + 1.6, sz * 2.4], 0.4, 0.4, m.steel); // backstay
    bar(g, [-GX + 1, PT + 1, sz * LZ * 0.85], [GX - 1, PT + 1, sz * LZ * 0.85], 1.0, 1.0, U);
  }
  bx(g, 2.6, 2.6, 6.8, U, AX, AY, 0); // apex
  bx(g, 0.5, 0.5, 0.5, m.red, AX, AY + 1.6, 0);
  bx(g, 0.5, 0.5, 0.5, m.red, tip + 0.8, GY + 3.3, 0);
  // machinery and electrical houses on the backreach
  panel(g, 9, 6, 13, m.house, back + 9, GY + 4.7, 0);
  bx(g, 9.4, 0.5, 13.4, m.dark, back + 9, GY + 7.9, 0);
  panel(g, 6, 4, 6, m.house, back + 19, GY + 3.7, 0);
  // trolley, hanging cab, hoist and spreader
  const TX = GX + 31;
  bx(g, 7, 2.4, 6.6, m.dark, TX, GY + 3.2, 0);
  bx(g, 3.2, 2.7, 2.8, U, TX - 2.2, GY - 3.3, 0);
  bx(g, 3.25, 1.1, 2.85, m.glass, TX - 2.2, GY - 3.0, 0);
  const HY = load ? 21 : 27;
  for (const dx of [-0.9, 0.9]) for (const dz of [-1.2, 1.2]) bar(g, [TX + dx, GY - 1.6, dz], [TX + dx, HY + 1.0, dz * 2.2], 0.07, 0.07, m.dark);
  bx(g, 2.4, 0.9, 3.2, m.dark, TX, HY + 0.9, 0);
  bx(g, 2.5, 0.5, 12.3, m.yellow, TX, HY, 0);
  if (load) {
    const cm = new THREE.MeshStandardMaterial({ map: corrugated(77, [150, 150, 150], 0.4), color: tint, roughness: 0.7, metalness: 0.3 });
    panel(g, 2.44, 2.6, 12.2, cm, TX, HY - 1.6, 0, 3);
  }
  // stair tower on a landside leg: switchback flights and landings
  for (let k = 0; k < 11; k++) {
    const y0 = 3.4 + k * 3, z0 = k % 2 ? 3.2 : -3.2;
    bar(g, [-GX - 2.4, y0, z0], [-GX - 2.4, y0 + 3, -z0], 1.0, 0.18, m.steel);
    bar(g, [-GX - 2.9, y0 + 1, z0], [-GX - 2.9, y0 + 4, -z0], 0.05, 0.05, m.steel);
    bx(g, 1.4, 0.15, 1.4, m.steel, -GX - 2.4, y0 + 3, -z0);
  }
  return g;
}

// Rubber-tyred gantry crane spanning a container block: box legs, sill beams on paired
// tyres, cross girders, trolley, cab, diesel house, spreader.
export function rtgCrane({ body = 0xd9d6cf, accent = 0x2f5f8a } = {}) {
  const m = mats(), g = new THREE.Group(), B = paint(body), A = paint(accent);
  const SX = 11.8, LZ = 6.6, H = 19;
  for (const sx of [-1, 1]) {
    const x = sx * SX;
    bx(g, 1.7, 1.3, 2 * LZ + 2.8, A, x, 2.2, 0);
    for (const sz of [-1, 1]) {
      for (const dx of [-0.45, 0.45]) cy(g, 0.78, 0.78, 0.55, 14, m.rubber, x + dx, 0.78, sz * (LZ + 0.6), { rz: Math.PI / 2 });
      bx(g, 1.4, 0.6, 2.2, m.dark, x, 1.5, sz * (LZ + 0.6));
      bar(g, [x, 2.8, sz * LZ], [x, H, sz * LZ], 1.2, 1.6, B);
      bar(g, [x, 6, sz * LZ], [x, H - 0.8, 0], 0.55, 0.55, B);
      bx(g, 1.8, 0.5, 0.8, m.hazard, x, 2.3, sz * (LZ + 1.6));
    }
    bx(g, 1.4, 1.6, 2 * LZ + 1.4, B, x, H + 0.4, 0);
  }
  for (const sz of [-1, 1]) bx(g, 2 * SX + 1.6, 1.9, 1.4, B, 0, H + 1.1, sz * LZ);
  bx(g, 4.2, 1.6, 2 * LZ + 1.8, A, 3, H + 2.6, 0); // trolley
  bx(g, 2.3, 2.4, 2.3, B, 1.2, H - 1.4, -LZ + 1.7);
  bx(g, 2.35, 0.9, 2.35, m.glass, 1.2, H - 1.1, -LZ + 1.7);
  bx(g, 3.4, 0.3, 6.4, m.dark, -SX - 2.1, 2.1, 0); // genset platform
  panel(g, 2.6, 2.4, 5.4, m.house, -SX - 2.1, 3.5, 0, 3);
  for (const dx of [-0.8, 0.8]) for (const dz of [-1, 1]) bar(g, [3 + dx, H + 1.6, dz], [3 + dx, H - 6.4, dz * 2], 0.06, 0.06, m.dark);
  bx(g, 2.4, 0.45, 6.2, m.yellow, 3, H - 6.6, 0);
  for (let k = 0; k < 5; k++) bar(g, [SX + 1.4, 2.8 + k * 3.3, k % 2 ? 2 : -2], [SX + 1.4, 6.1 + k * 3.3, k % 2 ? -2 : 2], 0.9, 0.15, m.steel);
  return g;
}

// ---------------------------------------------------------------- buildings

// Rusty corrugated warehouse: plinth, ribbed walls, gable ends, pitched roof with skylight
// strips and ridge vents, gutters and downpipes, roller doors with bollards on the -X side,
// wall lamps, an optional lean-to.
export function warehouse({ W = 26, L = 44, E = 8, pitch = 0.2, seed = 1, base = [150, 120, 98], rust = 0.8, roof = [130, 104, 86], doors = 3, leanTo = false } = {}) {
  const m = mats(), g = new THREE.Group(), r = rng(seed);
  const wall = new THREE.MeshStandardMaterial({ map: corrugated(seed, base, rust), roughness: 0.78, metalness: 0.3, side: THREE.DoubleSide });
  const roofM = new THREE.MeshStandardMaterial({ map: corrugated(seed + 7, roof, rust * 1.2), roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide });
  const door = new THREE.MeshStandardMaterial({ map: corrugated(seed + 3, [96 + r() * 40, 104 + r() * 30, 112], 0.7, { horizontal: true }), roughness: 0.7, metalness: 0.35 });
  const ridge = E + (W / 2) * pitch;
  bx(g, W + 0.4, 0.6, L + 0.4, m.concrete, 0, 0.3, 0);
  for (const sx of [-1, 1]) panel(g, 0.16, E - 0.6, L, wall, sx * W / 2, 0.6 + (E - 0.6) / 2, 0);
  for (const sz of [-1, 1]) { // gable ends
    const sh = new THREE.Shape([new THREE.Vector2(-W / 2, 0.6), new THREE.Vector2(W / 2, 0.6), new THREE.Vector2(W / 2, E), new THREE.Vector2(0, ridge), new THREE.Vector2(-W / 2, E)]);
    const geo = new THREE.ShapeGeometry(sh);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    const gm = new THREE.Mesh(geo, wall);
    gm.position.z = sz * L / 2;
    g.add(gm);
  }
  const ang = Math.atan(pitch), half = W / 2 + 0.6, slope = half / Math.cos(ang);
  for (const sx of [-1, 1]) {
    const rm = new THREE.Mesh(boxUV(slope, 0.1, L + 1.0, 4), roofM);
    rm.position.set(sx * half / 2, E + (W / 2 - half / 2) * pitch + 0.08, 0);
    rm.rotation.z = -sx * ang;
    g.add(rm);
    for (const f of [0.3, 0.68]) { // translucent skylight sheets
      const sk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, L * 0.8), std(0xc9c6b8, { roughness: 0.4 }));
      sk.position.set(sx * half * f, E + (W / 2 - half * f) * pitch + 0.16, 0);
      sk.rotation.z = -sx * ang;
      g.add(sk);
    }
    bx(g, 0.28, 0.28, L + 1.2, m.dark, sx * (half + 0.05), E - 0.05, 0); // gutter
    for (const sz of [-1, 1]) cy(g, 0.08, 0.08, E - 0.6, 6, m.dark, sx * (half - 0.05), 0.6 + (E - 0.6) / 2, sz * (L / 2 - 0.4));
  }
  bx(g, 0.7, 0.3, L + 1.0, m.dark, 0, ridge + 0.12, 0);
  for (let z = -L / 2 + 5; z < L / 2 - 3; z += 8) cy(g, 0.32, 0.38, 0.8, 10, m.steel, 0, ridge + 0.5, z);
  // roller doors on the -X wall, bollards each side, a lamp above each
  const dz = L / (doors + 1);
  for (let k = 1; k <= doors; k++) {
    const z = -L / 2 + k * dz, dw = 4.6 + r() * 1.2, dh = Math.min(E - 1.6, 5 + r() * 1.2);
    panel(g, 0.12, dh, dw, door, -W / 2 - 0.1, 0.6 + dh / 2, z, 5);
    bx(g, 0.35, 0.4, dw + 0.5, m.dark, -W / 2 - 0.2, 0.6 + dh + 0.2, z);
    for (const s of [-1, 1]) cy(g, 0.12, 0.12, 1.2, 8, m.yellow, -W / 2 - 0.6, 0.6, z + s * (dw / 2 + 0.3));
    bx(g, 0.3, 0.2, 0.6, m.glow, -W / 2 - 0.3, 0.6 + dh + 0.7, z);
  }
  bx(g, 0.1, 2.1, 1.0, m.dark, W / 2 + 0.06, 1.65, L / 2 - 4); // personnel door
  bx(g, 0.1, 2.1, 1.0, m.dark, -W / 2 - 0.06, 1.65, L / 2 - 2);
  if (leanTo) {
    const lw = 6, lh = E * 0.55;
    panel(g, 0.14, lh, L * 0.6, wall, W / 2 + lw, lh / 2 + 0.6, -L * 0.15);
    const rl = new THREE.Mesh(boxUV(lw + 0.6, 0.1, L * 0.6 + 0.6, 4), roofM);
    rl.position.set(W / 2 + lw / 2, lh + 0.6 + 0.6, -L * 0.15);
    rl.rotation.z = -0.12;
    g.add(rl);
    for (let z = -L * 0.45; z <= L * 0.15; z += 4) cy(g, 0.1, 0.1, lh, 6, m.steel, W / 2 + lw, 0.6 + lh / 2, z);
  }
  return g;
}

// Hopper silos in a row on braced legs, roof cones and railings, a catwalk, a head house
// and an inclined conveyor gallery on trestles down to a loading shed.
export function siloCluster({ n = 3, r: R = 3.2, h = 16, seed = 1 } = {}) {
  const m = mats(), g = new THREE.Group(), r = rng(seed);
  const shell = new THREE.MeshStandardMaterial({ map: plateTexture(seed, [196 + r() * 20, 194 + r() * 16, 186]), roughness: 0.6, metalness: 0.4 });
  const LEG = 5.2, CONE = 3.6, top = LEG + CONE + h, pitch = 2 * R + 1.4;
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * pitch;
    const body = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(R, R, h, 28, 1, true), (2 * Math.PI * R) / 4, h / 6), shell);
    body.position.set(x, LEG + CONE + h / 2, 0);
    g.add(body);
    const cone = new THREE.Mesh(scaleUV(new THREE.ConeGeometry(R, CONE, 28, 1, true), 5, 1), shell);
    cone.rotation.x = Math.PI;
    cone.position.set(x, LEG + CONE / 2, 0);
    g.add(cone);
    cy(g, 0.35, 0.35, 1.2, 8, m.steel, x, LEG - 0.5, 0);
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2, b = ((q + 1) / 6) * Math.PI * 2;
      const lx = x + Math.cos(a) * R * 0.92, lz = Math.sin(a) * R * 0.92;
      bar(g, [lx, 0, lz], [lx, LEG + CONE * 0.5, lz], 0.32, 0.32, m.steel);
      bar(g, [lx, 2.4, lz], [x + Math.cos(b) * R * 0.92, 2.4, Math.sin(b) * R * 0.92], 0.14, 0.14, m.steel);
    }
    for (let y = LEG + CONE + 2; y < top; y += 3) { // stiffener rings
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.07, 4, 28), m.steel);
      ring.rotation.x = Math.PI / 2; ring.position.set(x, y, 0); g.add(ring);
    }
    cy(g, 0.15, R * 1.03, 1.8, 28, m.steel, x, top + 0.9, 0);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R * 0.7, 0.04, 4, 24), m.steel);
    rail.rotation.x = Math.PI / 2; rail.position.set(x, top + 1.9, 0); g.add(rail);
    bar(g, [x + R + 0.35, LEG + CONE, 0], [x + R + 0.35, top, 0], 0.5, 0.08, m.steel); // ladder
    for (let y = LEG + CONE + 2.4; y < top; y += 1.2) bar(g, [x + R + 0.1, y, -0.4], [x + R + 0.8, y, 0.4], 0.04, 0.04, m.steel);
  }
  const span = n * pitch;
  bx(g, span, 0.2, 1.3, m.steel, 0, top + 2.4, 0); // catwalk
  for (const s of [-0.6, 0.6]) bar(g, [-span / 2, top + 3.4, s], [span / 2, top + 3.4, s], 0.05, 0.05, m.steel);
  const hx = span / 2 + 2.5;
  panel(g, 5, 5.5, 5, m.house, hx, top + 1.2, 0);
  bx(g, 5.4, 0.3, 5.4, m.dark, hx, top + 4.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(g, [hx + sx * 2.2, 0, sz * 2.2], [hx + sx * 2.2, top - 1.5, sz * 2.2], 0.4, 0.4, m.steel);
  const gx0 = hx + 30, gy0 = 3.2;
  bar(g, [gx0, gy0, 0], [hx + 2.4, top + 1, 0], 2.2, 2.4, m.house); // conveyor gallery
  for (let t = 0.2; t < 0.9; t += 0.22) {
    const x = gx0 + (hx + 2.4 - gx0) * t, y = gy0 + (top + 1 - gy0) * t;
    for (const s of [-1, 1]) bar(g, [x, 0, s * 1.3], [x, y - 1.2, s * 1.0], 0.3, 0.3, m.steel);
    bar(g, [x, y * 0.5, -1.3], [x, y * 0.5, 1.3], 0.2, 0.2, m.steel);
  }
  panel(g, 6, 4.5, 7, m.house, gx0 + 2, 2.25, 0);
  bx(g, 6.4, 0.3, 7.4, m.dark, gx0 + 2, 4.6, 0);
  return g;
}

// One or two vertical storage tanks inside a bund wall: plate courses, coloured band,
// cone roof with railing, a spiral stair, base ring, outlet pipes to a manifold.
export function tankFarm({ count = 2, R = 8, h = 12, seed = 1, band = 0x4d6f5a } = {}) {
  const m = mats(), g = new THREE.Group(), r = rng(seed);
  const shell = new THREE.MeshStandardMaterial({ map: plateTexture(seed + 11, [214, 210, 198]), roughness: 0.6, metalness: 0.3 });
  const bandM = std(band, { roughness: 0.6 });
  const pitch = 2 * R + 5, span = count * pitch;
  for (let k = 0; k < count; k++) {
    const x = (k - (count - 1) / 2) * pitch, hh = h * (0.85 + r() * 0.3);
    const body = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(R, R, hh, 36, 1, true), (2 * Math.PI * R) / 6, hh / 6), shell);
    body.position.set(x, 0.6 + hh / 2, 0);
    g.add(body);
    cy(g, R * 1.005, R * 1.005, 1.1, 36, bandM, x, 0.6 + hh * 0.78, 0, { open: true });
    cy(g, R + 0.5, R + 0.7, 0.6, 36, m.concrete, x, 0.3, 0);
    cy(g, 0.6, R * 1.01, R * 0.16, 36, std(0x8a8d90, { roughness: 0.6, metalness: 0.4 }), x, 0.6 + hh + R * 0.08, 0);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.05, 4, 36), m.steel);
    rail.rotation.x = Math.PI / 2; rail.position.set(x, 0.6 + hh + 1.0, 0); g.add(rail);
    const steps = 22, turn = Math.PI * 1.15, a0 = r() * 6;
    for (let s = 0; s < steps; s++) { // spiral stair
      const a = a0 + (s / steps) * turn, b = a0 + ((s + 1) / steps) * turn;
      const y0 = 0.6 + (s / steps) * hh, y1 = 0.6 + ((s + 1) / steps) * hh;
      bar(g, [x + Math.cos(a) * (R + 0.6), y0, Math.sin(a) * (R + 0.6)], [x + Math.cos(b) * (R + 0.6), y1, Math.sin(b) * (R + 0.6)], 0.9, 0.1, m.steel);
      bar(g, [x + Math.cos(a) * (R + 1.0), y0 + 1, Math.sin(a) * (R + 1.0)], [x + Math.cos(b) * (R + 1.0), y1 + 1, Math.sin(b) * (R + 1.0)], 0.05, 0.05, m.steel);
    }
    bar(g, [x, 0.9, R], [x, 0.9, R + 6.5], 0.5, 0.5, m.steel); // outlet pipe
  }
  const bw = span / 2 + 1, bd = R + 6;
  for (const s of [-1, 1]) {
    bx(g, 2 * bw, 1.2, 0.3, m.concrete, 0, 0.6, s * bd);
    bx(g, 0.3, 1.2, 2 * bd, m.concrete, s * bw, 0.6, 0);
  }
  bar(g, [-span / 2, 0.9, R + 6.5], [span / 2, 0.9, R + 6.5], 0.6, 0.6, std(0x8a4a32, { roughness: 0.6, metalness: 0.4 })); // manifold
  for (let x = -span / 2; x <= span / 2; x += 4) bx(g, 0.25, 0.7, 0.8, m.concrete, x, 0.35, R + 6.5);
  panel(g, 4, 3, 5, m.house, span / 2 + 4, 1.5, R + 3);
  return g;
}

// High-mast floodlight: tapered octagonal pole, headframe ring with six lamps, base door.
export function highMast() {
  const m = mats(), g = new THREE.Group();
  cy(g, 0.22, 0.55, 30, 8, m.steel, 0, 15, 0);
  cy(g, 0.9, 0.9, 0.6, 8, m.concrete, 0, 0.3, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.1, 6, 16), m.dark);
  ring.rotation.x = Math.PI / 2; ring.position.y = 29.6; g.add(ring);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = Math.cos(a) * 1.8, z = Math.sin(a) * 1.8;
    const lamp = bx(g, 0.9, 0.35, 0.7, m.dark, x, 29.3, z, -a);
    lamp.rotation.z = 0.5;
    bx(g, 0.8, 0.05, 0.6, m.glow, x * 1.02, 29.1, z * 1.02, -a);
  }
  bx(g, 0.05, 1.4, 0.5, m.dark, 0.5, 1.4, 0);
  return g;
}

// ---------------------------------------------------------------- terminal layout

const nL = makeNoise2D(93);

function streetTexture() {
  const [c, g] = canvas(256, 512);
  const r = rng(61);
  g.fillStyle = '#4b4946'; g.fillRect(0, 0, 256, 512);
  for (let k = 0; k < 9000; k++) { g.fillStyle = r() < 0.5 ? `rgba(20,20,20,${r() * 0.3})` : `rgba(150,146,138,${r() * 0.18})`; g.fillRect(r() * 256, r() * 512, 2 + r() * 2, 2 + r() * 2); }
  for (let k = 0; k < 6; k++) { const x = r() * 200, y = r() * 450; g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(x, y, 30 + r() * 40, 20 + r() * 60); }
  g.fillStyle = 'rgba(226,221,210,0.85)';
  g.fillRect(10, 0, 7, 512); g.fillRect(239, 0, 7, 512);
  for (let y = 0; y < 512; y += 256) g.fillRect(125, y, 6, 128); // 3 m dash, 3 m gap (12 m tile)
  return tex(c);
}

function gatehouse() {
  const m = mats(), g = new THREE.Group();
  panel(g, 3.2, 2.8, 4.2, m.house, 0, 1.6, 0, 3);
  bx(g, 3.27, 0.9, 4.27, m.glass, 0, 2.2, 0);
  bx(g, 4.4, 0.25, 5.4, m.dark, 0, 3.15, 0);
  bx(g, 3.6, 0.2, 4.6, m.concrete, 0, 0.1, 0);
  cy(g, 0.25, 0.25, 1.1, 8, m.dark, 2.2, 0.55, 2.4); // boom pedestal
  bar(g, [2.2, 1.05, 2.4], [2.2, 1.05, 2.4 - 7.5], 0.12, 0.12, m.hazard); // boom arm, down
  for (const z of [-2.6, 2.6]) cy(g, 0.14, 0.14, 1.0, 8, m.yellow, -2.0, 0.5, z);
  return g;
}

// Container ship moored along the quay: two-tone hull with a pointed bow, deck containers,
// aft accommodation block with a bridge and funnel. Bow toward +Z.
function containerShip(containers, tints, r, x0, z0) {
  const m = mats(), g = new THREE.Group();
  const sh = new THREE.Shape([new THREE.Vector2(-16, -100), new THREE.Vector2(16, -100), new THREE.Vector2(16, 70), new THREE.Vector2(9, 96), new THREE.Vector2(0, 104), new THREE.Vector2(-9, 96), new THREE.Vector2(-16, 70)]);
  const hull = (depth, y, mat) => {
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mm = new THREE.Mesh(geo, mat);
    mm.position.y = y;
    g.add(mm);
  };
  hull(7, -7, std(0x5a2a24, { roughness: 0.8 }));
  hull(9, 0, std(0x2a3640, { roughness: 0.7, metalness: 0.2 }));
  bx(g, 31, 0.3, 160, m.dark, 0, 9.1, 10);
  panel(g, 30, 20, 13, m.house, 0, 19, -88, 3);
  for (let y = 12; y < 28; y += 3.2) bx(g, 30.1, 0.9, 13.1, m.glass, 0, y, -88);
  bx(g, 38, 1.2, 5, m.house, 0, 29, -84);
  bx(g, 38.1, 1.0, 5.1, m.glass, 0, 28.2, -84);
  bx(g, 7, 9, 6, m.dark, 0, 33, -94);
  bx(g, 7.1, 1.5, 6.1, m.red, 0, 35, -94);
  for (let bay = 0; bay < 7; bay++) {
    const z = -66 + bay * 13.2;
    for (let c = 0; c < 12; c++) {
      const h = 2 + Math.floor(r() * 4);
      for (let k = 0; k < h; k++) containers.push({ x: x0 + (c - 5.5) * 2.5, y: 9.2 + 1.3 + k * 2.6, z: z0 + z, ry: 0, c: tints[Math.floor(r() * tints.length)] });
    }
  }
  g.position.set(x0, 0, z0);
  return g;
}

// The terminal around the circuit: a grid of access streets (cut where they meet the track,
// closed there by gates in the fence line), lots between them, a perimeter fence with
// gatehouses where the streets leave and run on into the distance, and on the east side a
// quay with water, crane rails, bollards and a moored ship under the quay-crane booms.
export function buildTerminal(tw) {
  const def = tw.def, T = def.terminal, b = tw.box, r = rng((def.seed ?? 1) + 5);
  const X0 = b.minx - T.margin, X1 = T.quayX, Z0 = b.minz - T.margin, Z1 = b.maxz + T.margin;
  const big = new THREE.Group(), containers = [], lines = [], decor = [];
  const tints = [0x7a4a3c, 0x44586c, 0x55645a, 0x9a7f3c, 0xa8a193, 0x6c3d36, 0x3f5a52, 0x8a8478, 0x5c4e6a].map(C);
  const place = (proto, x, z, yaw, y = null) => {
    const o = proto.clone();
    o.position.set(x, y ?? tw.heightAt(x, z), z);
    o.rotation.y = yaw;
    big.add(o);
    return o;
  };

  // ---- quay cranes over the road, on rails, booms out over the water ----
  const craneI = [];
  for (const f of def.features ?? []) {
    if (f.type !== 'quaycrane') continue;
    const i = Math.floor(f.at * LOOP.n), p = pointAt(i, 0);
    craneI.push(i);
    const o = stsCrane({ main: f.color ?? 0x3d6e99, upper: f.upper ?? 0xd8d4c8, load: !!f.load, tint: tints[craneI.length % tints.length] });
    o.position.set(p.x, S.y[i] - 0.1, p.z);
    o.rotation.y = p.yaw + ((f.side ?? 1) > 0 ? 0 : Math.PI);
    big.add(o);
    for (const s of [-1, 1]) { const q = pointAt(i, s * 17); tw.occupy(q.x, q.z, 15); }
  }
  if (craneI.length) { // crane rails set in the apron
    const rails = [];
    for (let i = Math.min(...craneI) - 70; i < Math.max(...craneI) + 70; i++) for (const s of [-17, 17]) {
      const p = pointAt(i, s);
      rails.push({ x: p.x, y: S.y[((i % LOOP.n) + LOOP.n) % LOOP.n] - 0.06, z: p.z, ry: p.yaw, sx: 0.35, sy: 0.12, sz: 1.06, c: C(0x55524d) });
    }
    tw.addInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.6 }), rails, false);
  }

  // ---- quay edge, water, moored ship ----
  {
    const m = mats(), qx = T.quayX, len = Z1 - Z0 + 400, zc = (Z0 + Z1) / 2;
    bx(big, 3.4, 4.2, len, m.concrete, qx + 1.4, -1.95, zc);
    bx(big, 0.5, 0.25, len, std(0xc9c3b6, { roughness: 0.9 }), qx + 0.2, 0.2, zc);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, len + 1400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b4d55, roughness: 0.22, metalness: 0.25 }));
    water.position.set(qx + 800, -1.3, zc);
    water.receiveShadow = true;
    tw.add(water);
    const bol = [], fend = [];
    for (let z = Z0 - 150; z < Z1 + 150; z += 16) {
      bol.push({ x: qx - 0.8, y: 0.45, z, c: C(0x2c2e30) });
      fend.push({ x: qx + 3.2, y: -1.2, z: z + 8, sx: 0.8, sy: 2.2, sz: 1.6, c: C(0x1d1d1e) });
    }
    tw.addInst(new THREE.CylinderGeometry(0.3, 0.38, 0.8, 10), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), bol);
    tw.addInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), fend);
    if (T.ship) big.add(containerShip(containers, tints, r, qx + 21, T.ship));
  }

  // ---- street grid; avoid running a street straight into a crane ----
  const xs = [], zs = [];
  for (let x = X0 + T.block; x < X1 - 40; x += T.block) xs.push(x);
  for (let z = Z0 + T.block; z < Z1 - 20; z += T.block) {
    let zz = z;
    for (const i of craneI) if (Math.abs(S.pz[i] - zz) < 34) zz += 40;
    zs.push(zz);
  }
  tw.gateP ??= (() => { const gp = tw.gateProto(); bakeGroup(gp); return gp; })();
  const houseP = gatehouse();
  const segs = [];
  const street = (ax, az, bx2, bz, endA, endB) => {
    const len = Math.hypot(bx2 - ax, bz - az), dx = (bx2 - ax) / len, dz = (bz - az) / len;
    let start = null, prevIn = null;
    const flush = (s1) => { if (start !== null && s1 - start > 8) segs.push({ ax: ax + dx * start, az: az + dz * start, bx: ax + dx * s1, bz: az + dz * s1 }); start = null; };
    for (let s = 0; s <= len; s += 3) {
      const x = ax + dx * s, z = az + dz * s, n = tw.roadNear(x, z);
      const inside = !!n && Math.abs(n.lat) < RL(n.i) + 2.6;
      if (!inside && start === null) start = s;
      if (inside && start !== null) flush(s);
      if (prevIn !== null && inside !== prevIn && n) { // meets the track's fence line: closed gate, fence gap
        const side = Math.sign(n.lat) || 1, q = pointAt(n.i, side * (RL(n.i) + 2.0));
        place(tw.gateP, q.x, q.z, Math.atan2(dx, dz));
        tw.reserve(n.i - 9, n.i + 9);
      }
      prevIn = inside;
    }
    flush(len);
    for (const [end, ex, ez, sgn] of [[endA, ax, az, 1], [endB, bx2, bz, -1]]) {
      if (end !== 'gate') continue;
      // the street's last 120 m runs outside the perimeter: gate and gatehouse on the line,
      // then the road continues into the distance and stops at a row of blocks
      const gx = ex + dx * sgn * 120, gz = ez + dz * sgn * 120;
      place(tw.gateP, gx, gz, Math.atan2(dx, dz));
      place(houseP, gx - dz * 8 + dx * sgn * 6, gz + dx * 8 + dz * sgn * 6, Math.atan2(dx, dz));
      segs.push({ ax: ex, az: ez, bx: ex - dx * sgn * 140, bz: ez - dz * sgn * 140 });
      const bl = [];
      for (let k = -2; k <= 2; k++) bl.push([ex - dx * sgn * 140 - dz * k * 2.1, ez - dz * sgn * 140 + dx * k * 2.1, Math.atan2(dx, dz) + Math.PI / 2]);
      decor.push({ scatter: 'block', points: bl });
    }
  };
  for (const x of xs) street(x, Z0 - 120, x, Z1 + 120, 'gate', 'gate');
  for (const z of zs) street(X0 - 120, z, X1 - 4, z, 'gate', null);
  for (const sg of segs) {
    const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az);
    for (let s = 0; s < L; s += 9) tw.occupy(sg.ax + (sg.bx - sg.ax) * (s / L), sg.az + (sg.bz - sg.az) * (s / L), 7);
  }
  {
    const pos = [], uv = [], idx = [];
    for (const sg of segs) {
      const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), dx = (sg.bx - sg.ax) / len, dz = (sg.bz - sg.az) / len, px = -dz, pz = dx;
      const base = pos.length / 3, rows = Math.ceil(len / 4), yo = 0.05 + (Math.abs(dx) > 0.5 ? 0.02 : 0);
      for (let a = 0; a <= rows; a++) {
        const s = Math.min(len, a * 4);
        for (const [j, o] of [[0, -5], [1, 0], [2, 5]]) {
          const x = sg.ax + dx * s + px * o, z = sg.az + dz * s + pz * o;
          pos.push(x, tw.heightAt(x, z) + yo, z);
          uv.push(j / 2, s / 12);
        }
      }
      for (let a = 0; a < rows; a++) for (let j = 0; j < 2; j++) { const q = base + a * 3 + j; idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const sm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: streetTexture(), roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    sm.receiveShadow = true;
    tw.add(sm);
  }

  // ---- perimeter chain-link (west, north, south) with gaps at the streets ----
  {
    tw.chainMat ??= new THREE.MeshStandardMaterial({ map: chainTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    const sides = [
      { a: [X0, Z0], b: [X1, Z0], along: 'x', cuts: xs }, { a: [X0, Z1], b: [X1, Z1], along: 'x', cuts: xs },
      { a: [X0, Z0], b: [X0, Z1], along: 'z', cuts: zs },
    ];
    const pos = [], uv = [], idx = [], posts = [];
    for (const sd of sides) {
      const [ax, az] = sd.a, [bx2, bz] = sd.b, len = Math.hypot(bx2 - ax, bz - az), dx = (bx2 - ax) / len, dz = (bz - az) / len;
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const base = pos.length / 3;
          for (const [x, z, s] of run) { const y = tw.heightAt(x, z); pos.push(x, y, z, x, y + 3, z); uv.push(s / 0.35, 0, s / 0.35, 3 / 0.35); }
          for (let k = 0; k < run.length - 1; k++) { const q = base + k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        }
        run = [];
      };
      for (let s = 0; s <= len; s += 3) {
        const x = ax + dx * s, z = az + dz * s, c = sd.along === 'x' ? x : z;
        if (sd.cuts.some((v) => Math.abs(v - c) < 6)) { flush(); continue; }
        run.push([x, z, s]);
        posts.push({ x, y: tw.heightAt(x, z) + 1.6, z, c: C(0x7d8286) });
      }
      flush();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    tw.add(new THREE.Mesh(g, tw.chainMat));
    tw.addInst(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.6 }), posts, false);
    tw.inYard = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  }

  // ---- lots: blocks between streets split into ~55 m cells, grid aligned ----
  const counts = { warehouse: 0, tanks: 0, silos: 0, rtg: 0, mast: 0, containers: 0 };
  const caps = { warehouse: 26, tanks: 3, silos: 2, rtg: 7, mast: 14, containers: 1500 };
  const whBases = [[150, 118, 96], [128, 134, 138], [158, 152, 140], [112, 124, 132], [140, 96, 74]];
  const protos = { wh: [], rtg: null, mast: null };
  const getWh = (k) => (protos.wh[k] ??= warehouse({
    W: [24, 28, 22, 26][k % 4], L: [38, 42, 32, 40][k % 4], E: [8, 9, 7, 10][k % 4], pitch: [0.18, 0.22, 0.25, 0.16][k % 4],
    seed: 300 + k * 13, base: whBases[k % whBases.length], roof: whBases[(k + 2) % whBases.length].map((v) => v * 0.85), rust: 0.6 + (k % 3) * 0.3, doors: 2 + (k % 3), leanTo: k % 2 === 1,
  }));
  const gx = [X0, ...xs, X1], gz = [Z0, ...zs, Z1];
  for (let bi = 0; bi < gx.length - 1; bi++) for (let bj = 0; bj < gz.length - 1; bj++) {
    const bx0 = gx[bi] + 6, bx1 = gx[bi + 1] - 6, bz0 = gz[bj] + 6, bz1 = gz[bj + 1] - 6;
    if (bx1 - bx0 < 30 || bz1 - bz0 < 30) continue;
    const nx = Math.max(1, Math.round((bx1 - bx0) / 55)), nz = Math.max(1, Math.round((bz1 - bz0) / 55));
    const cw = (bx1 - bx0) / nx, cd = (bz1 - bz0) / nz;
    for (let ci = 0; ci < nx; ci++) for (let cj = 0; cj < nz; cj++) {
      const cx = bx0 + (ci + 0.5) * cw, cz = bz0 + (cj + 0.5) * cd, half = Math.min(cw, cd) / 2;
      let near = Infinity;
      for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) near = Math.min(near, tw.roadDist(cx + ox * half, cz + oz * half));
      if (near < 19 || tw.blocked(cx, cz, half * 0.6) || cx > X1 - 30) continue;
      const dE = [[cx - gx[bi], [-1, 0]], [gx[bi + 1] - cx, [1, 0]], [cz - gz[bj], [0, -1]], [gz[bj + 1] - cz, [0, 1]]].sort((p, q) => p[0] - q[0])[0][1];
      const yawFace = Math.atan2(dE[1], -dE[0]); // local -X toward the nearest street
      const yawGrid = (ci + cj) % 2 ? 0 : Math.PI / 2;
      const n = fbm(nL, cx / 170, cz / 170, 2), roll = r();
      let kind;
      if (n < -0.1) kind = roll < 0.65 ? 'stack' : roll < 0.9 ? 'storage' : 'empty';
      else if (n > 0.2) kind = roll < 0.3 ? 'tanks' : roll < 0.5 ? 'silos' : roll < 0.9 ? 'warehouse' : 'storage';
      else kind = roll < 0.55 ? 'warehouse' : roll < 0.8 ? 'storage' : roll < 0.95 ? 'stack' : 'empty';
      if (counts[kind] !== undefined && counts[kind] >= caps[kind]) kind = 'storage';
      if (kind === 'stack' && counts.containers > caps.containers) kind = 'empty';
      const Wd = (yaw) => (lx, lz) => toWorld(cx, cz, yaw, lx, lz);
      if (kind === 'stack') {
        const W = Wd(yawGrid), hmax = 2 + Math.floor(r() * 3);
        const blocks = half > 24 && r() < 0.6 ? [-11, 11] : [0];
        for (const bxo of blocks) {
          for (let c = 0; c < 6; c++) for (let row = 0; row < 3; row++) {
            const hgt = Math.max(0, Math.round(hmax * (0.55 + 0.45 * Math.sin((c + 0.5) / 6 * Math.PI)) - r() * 2));
            const [x, z] = W(bxo + (c - 2.5) * 2.9, (row - 1) * 12.9), y = tw.heightAt(x, z);
            for (let k = 0; k < hgt; k++) containers.push({ x, y: y + 1.3 + k * 2.6, z, ry: yawGrid + (r() - 0.5) * 0.015, c: tints[Math.floor(r() * tints.length)] });
            counts.containers += hgt;
          }
          for (let c = 0; c <= 6; c++) { const [x, z] = W(bxo + (c - 3) * 2.9, 0); lines.push({ x, y: tw.heightAt(x, z) + 0.03, z, ry: yawGrid, sx: 0.12, sy: 0.02, sz: 39.7, c: C(0xd8d2c0) }); }
          for (const s2 of [-1, 1]) { const [x, z] = W(bxo + s2 * 10.4, 0); lines.push({ x, y: tw.heightAt(x, z) + 0.03, z, ry: yawGrid, sx: 0.18, sy: 0.02, sz: 42, c: C(0xd3a527) }); }
          if (counts.rtg < caps.rtg && r() < 0.5) {
            counts.rtg++;
            protos.rtg ??= rtgCrane({});
            const [x, z] = W(bxo + 1.5, (r() - 0.5) * 14);
            place(protos.rtg, x, z, yawGrid);
          }
        }
      } else if (kind === 'warehouse') {
        counts.warehouse++;
        place(getWh(Math.floor(r() * 8)), cx, cz, yawFace);
        const W = Wd(yawFace), pts = [];
        for (let q = 0; q < 6; q++) { const [x, z] = W(-17 - r() * 4, (r() - 0.5) * 30); pts.push([x, z, yawFace + (r() - 0.5) * 0.4]); }
        decor.push({ scatter: 'pallet', points: pts.slice(0, 3) }, { scatter: 'ibc', points: pts.slice(3, 5) }, { scatter: 'skip', points: pts.slice(5) });
      } else if (kind === 'tanks') {
        counts.tanks++;
        place(tankFarm({ count: half > 24 ? 2 : 1, R: 7 + r() * 2, h: 10 + r() * 5, seed: Math.floor(r() * 999), band: [0x4d6f5a, 0x3f5a78, 0x8a4a32][Math.floor(r() * 3)] }), cx, cz, yawGrid);
      } else if (kind === 'silos') {
        counts.silos++;
        place(siloCluster({ n: 3, R: 3 + r() * 0.5, h: 14 + r() * 4, seed: Math.floor(r() * 999) }), cx - 8, cz, yawGrid);
      } else if (kind === 'storage') {
        // open storage: rows of pipe stacks, drums, pallets, totes, skips and blocks
        const W = Wd(yawGrid), names = ['pipepile', 'drum', 'pallet', 'ibc', 'barrel', 'block', 'skip', 'crate'];
        const rows = Math.floor(half / 4.5);
        for (let row = 0; row < rows; row++) {
          const name = names[Math.floor(r() * names.length)], pts = [], step = name === 'skip' || name === 'pipepile' ? 7 : 3.2;
          for (let q = -half * 0.8; q < half * 0.8; q += step) { const [x, z] = W((row - (rows - 1) / 2) * 7.5, q + (r() - 0.5)); if (r() < 0.85) pts.push([x, z, yawGrid + (r() - 0.5) * 0.15]); }
          decor.push({ scatter: name, points: pts });
        }
      } else {
        const pts = { puddle: [], chunk: [], tire: [], scrap: [] };
        for (let q = 0; q < 8; q++) { const key = Object.keys(pts)[Math.floor(r() * 4)]; const [x, z] = Wd(0)((r() - 0.5) * half * 1.6, (r() - 0.5) * half * 1.6); pts[key].push([x, z, r() * 6.3]); }
        for (const [k, v] of Object.entries(pts)) if (v.length) decor.push({ scatter: k, points: v });
      }
      tw.occupy(cx, cz, half * 0.95);
      if (counts.mast < caps.mast && r() < 0.3) {
        counts.mast++;
        protos.mast ??= highMast();
        place(protos.mast, cx + (r() < 0.5 ? -1 : 1) * (half - 2), cz + (r() < 0.5 ? -1 : 1) * (half - 2), 0);
      }
    }
  }
  window.__dbg = { ...counts };
  bakeGroup(big);
  big.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tw.add(big);
  tw.contMat ??= new THREE.MeshStandardMaterial({ map: corrugated(3, [170, 170, 170], 0.5), roughness: 0.7, metalness: 0.3 });
  tw.addInst(scaleUV(new THREE.BoxGeometry(2.44, 2.6, 12.2), 3, 1), tw.contMat, containers);
  tw.addInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), lines, false);
  return decor;
}

export { hash, RL };
