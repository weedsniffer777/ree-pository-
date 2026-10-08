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

// Desert homestead at the end of a side road: a corrugated shed with a lean-to, a water
// tank on a timber stand, a carport, drums, tyres and a scrap of fence.
export function homestead(seed = 1) {
  const m = mats(), g = new THREE.Group(), r = rng(seed);
  const shed = warehouse({ W: 7, L: 10, E: 3.2, pitch: 0.3, seed: 900 + seed, base: [150 + r() * 20, 120, 96], roof: [126, 110, 94], rust: 1.2, doors: 1, leanTo: r() < 0.6 });
  g.add(shed);
  const wood = std(0x6d5a45, { roughness: 1 }), tankM = new THREE.MeshStandardMaterial({ map: corrugated(940 + seed, [150, 152, 150], 1.0), roughness: 0.7, metalness: 0.4 });
  const tx = -9, tz = 8;
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) bar(g, [tx + dx, 0, tz + dz], [tx + dx * 0.8, 5, tz + dz * 0.8], 0.22, 0.22, wood);
  bar(g, [tx - 1.3, 0.4, tz - 1.3], [tx + 1.0, 4.6, tz + 1.0], 0.1, 0.1, wood);
  bx(g, 3.0, 0.2, 3.0, wood, tx, 5.1, tz);
  const tank = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 18), 2.5, 0.65), tankM);
  tank.position.set(tx, 6.5, tz); g.add(tank);
  cy(g, 0.2, 1.65, 0.5, 18, m.steel, tx, 8.05, tz);
  for (const [x, z] of [[8, -5], [8, 1], [13, -5], [13, 1]]) cy(g, 0.07, 0.07, 2.6, 6, m.steel, x, 1.3, z); // carport
  bx(g, 6.4, 0.08, 7.4, tankM, 10.5, 2.65, -2, 0);
  for (let k = 0; k < 5; k++) cy(g, 0.3, 0.3, 0.9, 10, std([0x6b4a3a, 0x4f5a4a, 0x7a5232][k % 3], { roughness: 0.8 }), -5 + (k % 3) * 0.7, 0.45, -7 + Math.floor(k / 3) * 0.7);
  for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 6, 10), m.rubber); t.rotation.x = Math.PI / 2; t.position.set(4 + r() * 2, 0.14 + (k % 2) * 0.28, -8 + r()); g.add(t); }
  for (let k = 0; k < 6; k++) bar(g, [-14 + k * 2.6, 0, -12], [-14 + k * 2.6, 1.3, -12], 0.12, 0.12, wood);
  bar(g, [-14, 0.9, -12], [-1, 0.9, -12], 0.08, 0.12, wood);
  bar(g, [-14, 0.5, -12], [-1, 0.5, -12], 0.08, 0.12, wood);
  return g;
}

// ---------------------------------------------------------------- big buildings
//
// Shared material sets so dozens of buildings merge into a handful of draw calls.

function officeTexture(seed, brick) {
  const [c, g] = canvas(128, 128);
  const r = rng(seed);
  g.fillStyle = brick; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, 128, 1);
    for (let x = (y / 6) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 1, 6);
  }
  for (let k = 0; k < 1200; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,16,12' : '230,220,200'},${r() * 0.12})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  g.fillStyle = '#b8b1a2'; g.fillRect(18, 86, 92, 4);
  g.fillStyle = '#1f2a2f'; g.fillRect(20, 30, 88, 56);
  if (r() < 0.3) { g.fillStyle = 'rgba(210,190,120,0.3)'; g.fillRect(20, 30, 88, 56); }
  g.fillStyle = 'rgba(160,175,170,0.2)'; g.fillRect(20, 30, 88, 14);
  g.fillStyle = '#4e4e4b'; for (const x of [20, 49, 78, 106]) g.fillRect(x - 1, 30, 3, 56);
  g.fillRect(20, 57, 88, 3);
  return tex(c);
}

const WM = {};
function wmats() {
  if (WM.ready) return WM;
  const mk = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide, ...o });
  WM.walls = [[150, 118, 96], [128, 134, 138], [158, 152, 140], [112, 124, 132], [140, 96, 74], [176, 170, 156]].map((b, k) => mk(corrugated(500 + k * 7, b, 0.5 + (k % 3) * 0.35)));
  WM.roofs = [[130, 104, 86], [118, 120, 122], [146, 134, 118]].map((b, k) => mk(corrugated(600 + k * 7, b, 0.9)));
  WM.doors = [[110, 120, 130], [140, 110, 80], [96, 104, 100]].map((b, k) => mk(corrugated(700 + k * 3, b, 0.7, { horizontal: true }), { side: THREE.FrontSide }));
  WM.office = ['#8c5c4a', '#8d8b84', '#9a7a5e'].map((b, k) => new THREE.MeshStandardMaterial({ map: officeTexture(800 + k, b), roughness: 0.9 }));
  WM.sky = std(0xc9c6b8, { roughness: 0.4 });
  WM.goods = [0x8a6e4b, 0x9c9488, 0x6b5b4a, 0x5d6b4f, 0x7a4a3c].map((h) => std(h, { roughness: 0.9 }));
  WM.ready = true;
  return WM;
}

// Gable profile across n spans, for end walls and roof planes.
function spanRoofs(g, W, L, E, n, pitch, roofM, m) {
  const sw = W / n;
  for (let k = 0; k < n; k++) {
    const x0 = -W / 2 + k * sw, xc = x0 + sw / 2, half = sw / 2 + (k === 0 || k === n - 1 ? 0.5 : 0.05);
    const ang = Math.atan(pitch), slope = half / Math.cos(ang);
    for (const sx of [-1, 1]) {
      const rm = new THREE.Mesh(boxUV(slope, 0.1, L + 1.0, 4), roofM);
      rm.position.set(xc + sx * half / 2, E + (sw / 2 - half / 2) * pitch + 0.08, 0);
      rm.rotation.z = -sx * ang;
      g.add(rm);
      const sk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, L * 0.85), wmats().sky);
      sk.position.set(xc + sx * half * 0.45, E + (sw / 2 - half * 0.45) * pitch + 0.16, 0);
      sk.rotation.z = -sx * ang;
      g.add(sk);
    }
    bx(g, 0.6, 0.3, L + 1.0, m.dark, xc, E + (sw / 2) * pitch + 0.12, 0);
    for (let z = -L / 2 + 6; z < L / 2 - 4; z += 10) cy(g, 0.32, 0.38, 0.8, 10, m.steel, xc, E + (sw / 2) * pitch + 0.5, z);
    if (k > 0) bx(g, 0.5, 0.3, L + 1.0, m.dark, x0, E - 0.05, 0); // valley gutter
  }
  for (const sz of [-1, 1]) {
    const pts = [new THREE.Vector2(-W / 2, 0.6), new THREE.Vector2(W / 2, 0.6), new THREE.Vector2(W / 2, E)];
    for (let k = n - 1; k >= 0; k--) { const x0 = -W / 2 + k * sw; pts.push(new THREE.Vector2(x0 + sw / 2, E + (sw / 2) * pitch), new THREE.Vector2(x0, E)); }
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    const gm = new THREE.Mesh(geo, g.userData.wallM);
    gm.position.z = sz * L / 2;
    g.add(gm);
  }
}

// Multi-span warehouse: ribbed walls, n gabled spans with skylights and vents, a raised
// loading dock with roller doors, bumpers and a canopy on the -X side, gutters, downpipes,
// and a two-storey brick office at the +Z end.
export function bigWarehouse({ W = 40, L = 80, E = 10, spans = 2, pitch = 0.18, v = 0 } = {}) {
  const m = mats(), w = wmats(), g = new THREE.Group();
  const wallM = w.walls[v % w.walls.length], roofM = w.roofs[v % w.roofs.length], doorM = w.doors[v % w.doors.length];
  g.userData.wallM = wallM;
  bx(g, W + 0.4, 0.6, L + 0.4, m.concrete, 0, 0.3, 0);
  for (const sx of [-1, 1]) panel(g, 0.16, E - 0.6, L, wallM, sx * W / 2, 0.6 + (E - 0.6) / 2, 0);
  spanRoofs(g, W, L, E, spans, pitch, roofM, m);
  for (const sx of [-1, 1]) {
    bx(g, 0.28, 0.28, L + 1.2, m.dark, sx * (W / 2 + 0.55), E - 0.05, 0);
    for (const sz of [-1, 1]) cy(g, 0.08, 0.08, E - 0.6, 6, m.dark, sx * (W / 2 + 0.5), 0.6 + (E - 0.6) / 2, sz * (L / 2 - 0.4));
  }
  // dock: raised platform, roller doors every 9 m, bumpers, canopy on brackets
  const dl = L * 0.82;
  bx(g, 3.2, 1.25, dl, m.concrete, -W / 2 - 1.6, 0.62, -L * 0.05);
  bx(g, 3.3, 0.12, dl, m.yellow, -W / 2 - 1.6, 1.28, -L * 0.05);
  for (let z = -L * 0.05 - dl / 2 + 5; z < -L * 0.05 + dl / 2 - 3; z += 9) {
    panel(g, 0.12, 4.6, 3.6, doorM, -W / 2 - 0.1, 1.25 + 2.3, z, 4.6);
    for (const s of [-1, 1]) bx(g, 0.3, 0.5, 0.25, m.rubber, -W / 2 - 3.25, 0.9, z + s * 1.2);
    bx(g, 0.3, 0.2, 0.6, m.glow, -W / 2 - 0.3, 6.6, z);
  }
  bx(g, 4.6, 0.18, dl + 1, roofM, -W / 2 - 2.2, Math.min(E - 0.6, 7.2), -L * 0.05);
  for (let z = -L * 0.05 - dl / 2; z <= -L * 0.05 + dl / 2; z += 9) bar(g, [-W / 2, Math.min(E - 0.6, 7.2) - 2.2, z], [-W / 2 - 4.2, Math.min(E - 0.6, 7.2) - 0.1, z], 0.14, 0.14, m.steel);
  for (let z = -L / 2 + 6; z < L / 2 - 4; z += 14) panel(g, 0.12, 4.6, 4.2, doorM, W / 2 + 0.1, 0.6 + 2.3, z, 4.6); // back doors
  // office block at the +Z end
  const ow = Math.min(W * 0.55, 20), oz = L / 2 + 5.2;
  const off = w.office[v % w.office.length];
  panel(g, ow, 7.2, 10, off, -W / 2 + ow / 2, 3.6, oz, 3.6);
  bx(g, ow + 0.4, 0.6, 10.4, m.concrete, -W / 2 + ow / 2, 7.4, oz);
  bx(g, 2.2, 2.6, 0.2, m.dark, -W / 2 + 3, 1.3, oz + 5.05);
  bx(g, 3.6, 0.15, 1.6, m.dark, -W / 2 + 3, 2.8, oz + 5.8);
  for (let x = -W / 2 + 2; x < -W / 2 + ow - 1; x += 3) cy(g, 0.25, 0.25, 0.5, 8, m.steel, x, 7.95, oz + (x % 2 ? 2 : -2)); // roof units
  return g;
}

// Open-sided transit shed: steel portal frames every 7.5 m, a cladding band under the eaves,
// gabled roof, and pallets and crates stacked on the slab inside.
export function openShed({ W = 32, L = 75, E = 9, v = 0, seed = 1 } = {}) {
  const m = mats(), w = wmats(), g = new THREE.Group(), r = rng(seed);
  const wallM = w.walls[(v + 2) % w.walls.length], roofM = w.roofs[v % w.roofs.length];
  g.userData.wallM = wallM;
  const pitch = 0.16, ridge = E + (W / 2) * pitch;
  bx(g, W + 2, 0.3, L + 2, m.concrete, 0, 0.15, 0);
  const steel = paint([0x5a6b78, 0x8a5a3a, 0x6b6e70][v % 3]);
  for (let z = -L / 2; z <= L / 2 + 0.1; z += 7.5) {
    for (const sx of [-1, 1]) {
      bx(g, 0.5, E, 0.5, steel, sx * W / 2, E / 2, z);
      bar(g, [sx * W / 2, E, z], [0, ridge, z], 0.35, 0.6, steel);
      bar(g, [sx * W / 2, E - 2.2, z], [sx * (W / 2 - 2.4), E + 0.35, z], 0.2, 0.2, steel);
    }
  }
  const ang = Math.atan(pitch), half = W / 2 + 0.7, slope = half / Math.cos(ang);
  for (const sx of [-1, 1]) {
    const rm = new THREE.Mesh(boxUV(slope, 0.1, L + 1.4, 4), roofM);
    rm.position.set(sx * half / 2, E + (W / 2 - half / 2) * pitch + 0.35, 0);
    rm.rotation.z = -sx * ang;
    g.add(rm);
    panel(g, 0.12, 2.4, L, wallM, sx * (W / 2 + 0.3), E - 1.0, 0);
  }
  for (const sz of [-1, 1]) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-W / 2, E - 2.2), new THREE.Vector2(W / 2, E - 2.2), new THREE.Vector2(W / 2, E), new THREE.Vector2(0, ridge), new THREE.Vector2(-W / 2, E)]));
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
    const gm = new THREE.Mesh(geo, wallM);
    gm.position.z = sz * (L / 2 + 0.3);
    g.add(gm);
  }
  for (let row = 0; row < 3; row++) for (let z = -L / 2 + 4; z < L / 2 - 4; z += 3.4) { // goods
    if (r() < 0.25) continue;
    const h = 1 + Math.floor(r() * 3), x = (row - 1) * (W / 3.4);
    for (let k = 0; k < h; k++) bx(g, 2.2 + r() * 0.6, 1.1, 2.4, w.goods[Math.floor(r() * w.goods.length)], x + (r() - 0.5) * 0.6, 0.85 + k * 1.15, z, (r() - 0.5) * 0.1);
  }
  return g;
}

// Brick sawtooth-roof works with north-light glazing and a chimney.
export function sawtooth({ W = 44, L = 64, E = 7, teeth = 5, v = 0 } = {}) {
  const m = mats(), w = wmats(), g = new THREE.Group();
  const brick = w.office[v % w.office.length], roofM = w.roofs[(v + 1) % w.roofs.length];
  bx(g, W + 0.4, 0.5, L + 0.4, m.concrete, 0, 0.25, 0);
  for (const sx of [-1, 1]) panel(g, 0.4, E, L, brick, sx * W / 2, E / 2, 0, 3.6);
  for (const sz of [-1, 1]) panel(g, W, E, 0.4, brick, 0, E / 2, sz * L / 2, 3.6);
  const tw = W / teeth, th = 3.2;
  for (let k = 0; k < teeth; k++) {
    const x0 = -W / 2 + k * tw;
    const sh = new THREE.Shape([new THREE.Vector2(x0, E), new THREE.Vector2(x0 + tw, E), new THREE.Vector2(x0 + tw, E + th)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
    geo.translate(0, 0, -L / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    g.add(new THREE.Mesh(geo, [brick, roofM]));
    bx(g, 0.1, th - 0.5, L - 1, m.glass, x0 + tw - 0.06, E + th / 2, 0);
  }
  cy(g, 1.1, 1.5, 26, 12, brick, W / 2 - 4, 13, -L / 2 + 5);
  cy(g, 1.2, 1.2, 0.8, 12, m.dark, W / 2 - 4, 26.2, -L / 2 + 5);
  for (let z = -L / 2 + 6; z < L / 2 - 4; z += 12) { panel(g, 0.12, 4.4, 4.2, w.doors[v % 3], -W / 2 - 0.25, 2.2, z, 4.4); bx(g, 0.3, 0.2, 0.6, m.glow, -W / 2 - 0.4, 5.0, z); }
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

// Oriented rectangle overlap (separating axis), rects { x, z, hx, hz, yaw }.
function obbHit(a, b) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  for (const t of axes) {
    const ax = Math.sin(t), az = Math.cos(t);
    const proj = (o) => {
      const c = o.x * ax + o.z * az;
      const ex = Math.abs(Math.cos(o.yaw - t)) * o.hz + Math.abs(Math.sin(o.yaw - t)) * o.hx;
      return [c - ex, c + ex];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

// The terminal around the circuit. The quay straight is the apron: cranes straddle it on
// rails, booms out over the water and a moored ship, and that side stays open. Everywhere
// else is built up from the track outward: a service road runs parallel behind the fences,
// gated spurs connect it to the track, and the ground beyond is packed with warehouses,
// transit sheds, sawtooth works, container blocks under RTGs, tank farms and silos, all
// squared to the nearest stretch of track.
export function buildTerminal(tw) {
  const def = tw.def, T = def.terminal, b = tw.box, r = rng((def.seed ?? 1) + 5), N = LOOP.n;
  const X0 = b.minx - T.margin, X1 = T.quayX, Z0 = b.minz - T.margin, Z1 = b.maxz + T.margin;
  const APRON = T.apronX ?? -6; // nothing gets built east of this (the quay side)
  const big = new THREE.Group(), containers = [], lines = [], decor = [];
  const tints = [0x7a4a3c, 0x44586c, 0x55645a, 0x9a7f3c, 0xa8a193, 0x6c3d36, 0x3f5a52, 0x8a8478, 0x5c4e6a].map(C);
  const place = (proto, x, z, yaw) => {
    const o = proto.clone();
    o.position.set(x, tw.heightAt(x, z), z);
    o.rotation.y = yaw;
    big.add(o);
    return o;
  };
  const inRect = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1;
  tw.inYard = inRect;

  // ---- quay cranes over the road, on rails, booms out over the water ----
  const craneI = [];
  for (const f of def.features ?? []) {
    if (f.type !== 'quaycrane') continue;
    const i = Math.floor(f.at * N), p = pointAt(i, 0);
    craneI.push(i);
    const o = stsCrane({ main: f.color ?? 0x3d6e99, upper: f.upper ?? 0xd8d4c8, load: !!f.load, tint: tints[craneI.length % tints.length] });
    o.position.set(p.x, S.y[i] - 0.1, p.z);
    o.rotation.y = p.yaw + ((f.side ?? 1) > 0 ? 0 : Math.PI);
    big.add(o);
    for (const s of [-1, 1]) { const q = pointAt(i, s * 17); tw.occupy(q.x, q.z, 15); }
  }
  if (craneI.length) {
    const rails = [];
    for (let i = Math.min(...craneI) - 70; i < Math.max(...craneI) + 70; i++) for (const s of [-17, 17]) {
      const p = pointAt(i, s);
      rails.push({ x: p.x, y: S.y[((i % N) + N) % N] - 0.06, z: p.z, ry: p.yaw, sx: 0.35, sy: 0.12, sz: 1.06, c: C(0x55524d) });
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

  // ---- service road parallel to the track, gated spurs onto it ----
  tw.gateP ??= (() => { const gp = tw.gateProto(); bakeGroup(gp); return gp; })();
  const houseP = gatehouse();
  const SRV = 52; // service road centre, metres beyond the barrier line
  const roads = []; // polylines [[x, z], ...] with width
  const ok = (x, z) => inRect(x, z) && x < APRON && !tw.blocked(x, z, 4);
  for (const side of [-1, 1]) {
    let cur = [];
    const flush = () => { if (cur.length > 6) roads.push({ pts: cur, w: 10 }); cur = []; };
    for (let i = 0; i < N; i += 4) {
      const lat = side * (RL(i) + SRV), p = pointAt(i, lat), n = tw.roadNear(p.x, p.z);
      const mine = !n || Math.abs(n.lat) > RL(n.i) + SRV - 4;
      if (ok(p.x, p.z) && mine) cur.push([p.x, p.z]); else flush();
    }
    flush();
    // spurs every ~240 m where the service road exists behind
    for (let i = Math.floor(r() * 120); i < N; i += 200 + Math.floor(r() * 80)) {
      const far = pointAt(i, side * (RL(i) + SRV)), nf = tw.roadNear(far.x, far.z);
      if (!ok(far.x, far.z) || (nf && Math.abs(nf.lat) < RL(nf.i) + SRV - 4)) continue;
      let clear = true;
      for (let l = RL(i) + 6; l < RL(i) + SRV; l += 4) { const q = pointAt(i, side * l), n = tw.roadNear(q.x, q.z); if (!ok(q.x, q.z) || (n && Math.abs(n.lat) < l - 3)) { clear = false; break; } }
      if (!clear) continue;
      const a = pointAt(i, side * (RL(i) + 2.6));
      roads.push({ pts: [[a.x, a.z], [far.x, far.z]], w: 9 });
      const g = pointAt(i, side * (RL(i) + 2.0)), dir = Math.atan2(far.x - a.x, far.z - a.z);
      place(tw.gateP, g.x, g.z, dir);
      const hp = pointAt(i + 9, side * (RL(i) + 10));
      place(houseP, hp.x, hp.z, dir);
      tw.reserve(i - 9, i + 9);
    }
  }
  {
    const pos = [], uv = [], idx = [];
    for (const rd of roads) {
      let s = 0;
      const base0 = pos.length / 3;
      rd.pts.forEach(([x, z], k) => {
        const [px, pz] = rd.pts[Math.max(0, k - 1)], [nx, nz] = rd.pts[Math.min(rd.pts.length - 1, k + 1)];
        let dx = nx - px, dz = nz - pz;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (k > 0) s += Math.hypot(x - rd.pts[k - 1][0], z - rd.pts[k - 1][1]);
        for (const [j, o] of [[0, -rd.w / 2], [1, 0], [2, rd.w / 2]]) {
          const qx = x - dz * o, qz = z + dx * o;
          pos.push(qx, tw.heightAt(qx, qz) + 0.06, qz);
          uv.push(j / 2, s / 12);
        }
        tw.occupy(x, z, rd.w * 0.8);
      });
      for (let k = 0; k < rd.pts.length - 1; k++) for (let j = 0; j < 2; j++) { const q = base0 + k * 3 + j; idx.push(q, q + 3, q + 1, q + 1, q + 3, q + 4); }
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

  // ---- buildings packed across the ground, squared to the nearest track ----
  const rects = [];
  const counts = { tanks: 0, silos: 0, rtg: 0, mast: 0, containers: 0, buildings: 0 };
  const protos = { rtg: null, mast: null };
  const fits = (rc) => {
    if (rects.some((o) => obbHit({ ...rc, hx: rc.hx + 5, hz: rc.hz + 5 }, o))) return false;
    for (let u = -1; u <= 1; u += 0.5) for (let v = -1; v <= 1; v += 0.5) {
      const [x, z] = toWorld(rc.x, rc.z, rc.yaw, u * rc.hx, v * rc.hz);
      if (!ok(x, z)) return false;
      const n = tw.roadNear(x, z);
      if (n && Math.abs(n.lat) < RL(n.i) + 9) return false;
    }
    return true;
  };
  const cands = [];
  for (let x = X0 + 20; x < APRON - 12; x += 16) for (let z = Z0 + 20; z < Z1 - 20; z += 16) cands.push([x + (r() - 0.5) * 8, z + (r() - 0.5) * 8]);
  for (let k = cands.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [cands[k], cands[j]] = [cands[j], cands[k]]; }
  // nearer the track first, so the frontage fills before the back lots
  cands.sort((p, q) => Math.min(tw.roadDist(p[0], p[1]), 300) - Math.min(tw.roadDist(q[0], q[1]), 300) + (r() - 0.5) * 40);
  for (const [cx, cz] of cands) {
    const ni = gridNearest(cx, cz, 14);
    let yaw = ni >= 0 ? Math.atan2(S.tx[ni], S.tz[ni]) : 0;
    const snap = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(yaw - snap) < 0.3) yaw = snap;
    // face the track: local -X toward the nearest road point
    const tx = ni >= 0 ? S.px[ni] - cx : 0, tz = ni >= 0 ? S.pz[ni] - cz : 0;
    if (tx * Math.cos(yaw) - tz * Math.sin(yaw) > 0) yaw += Math.PI;
    const roll = r();
    let kind = roll < 0.42 ? 'warehouse' : roll < 0.56 ? 'shed' : roll < 0.68 ? 'works' : roll < 0.84 ? 'stack' : roll < 0.92 ? 'tanks' : 'silos';
    if (kind === 'tanks' && counts.tanks >= 3) kind = 'warehouse';
    if (kind === 'silos' && counts.silos >= 3) kind = 'shed';
    if (kind === 'stack' && counts.containers > 1300) kind = 'warehouse';
    // try the big version first, then smaller ones, so every gap gets something
    const R = (a, b2) => a + r() * (b2 - a);
    const tries = {
      warehouse: [[R(30, 48), R(60, 110)], [R(24, 30), R(40, 60)], [R(16, 22), R(28, 40)]],
      shed: [[R(26, 36), R(50, 90)], [R(18, 24), R(30, 46)]],
      works: [[R(36, 50), R(46, 76)], [R(24, 32), R(30, 42)]],
      stack: [[48, 42], [24, 42]], tanks: [[48, 36], [24, 36]], silos: [[44, 18]],
    }[kind];
    let rc = null, sz = null;
    for (const [W, L] of tries) {
      const pad = kind === 'warehouse' ? [8, 22] : [2, 2];
      const cand = { x: cx, z: cz, yaw, hx: W / 2 + pad[0] / 2, hz: L / 2 + pad[1] / 2 };
      if (fits(cand)) { rc = cand; sz = { W, L }; break; }
    }
    if (!rc && kind !== 'warehouse') {
      for (const [W, L] of [[R(18, 24), R(30, 44)], [16, 26]]) {
        const cand = { x: cx, z: cz, yaw, hx: W / 2 + 4, hz: L / 2 + 11 };
        if (fits(cand)) { rc = cand; sz = { W, L }; kind = 'warehouse'; break; }
      }
    }
    if (!rc) continue;
    const singleBlock = kind === 'stack' && sz.W < 30;
    rects.push(rc);
    counts.buildings++;
    const v = Math.floor(r() * 6);
    if (kind === 'warehouse') {
      const L = sz.L, W = sz.W;
      place(bigWarehouse({ W, L, E: W < 20 ? 7 + r() * 2 : 8 + r() * 4, spans: W > 36 ? 3 : W > 28 ? 2 : 1, v }), cx, cz, yaw);
      const pts = [];
      for (let q = 0; q < 5; q++) { const [x, z] = toWorld(cx, cz, yaw, -W / 2 - 8 - r() * 3, (r() - 0.5) * L * 0.7); pts.push([x, z, yaw + (r() - 0.5) * 0.4]); }
      decor.push({ scatter: 'pallet', points: pts.slice(0, 2) }, { scatter: 'skip', points: pts.slice(2, 3) }, { scatter: 'ibc', points: pts.slice(3) });
    } else if (kind === 'shed') place(openShed({ W: sz.W, L: sz.L, E: 8 + r() * 2, v, seed: Math.floor(r() * 999) }), cx, cz, yaw);
    else if (kind === 'works') place(sawtooth({ W: sz.W, L: sz.L, teeth: Math.max(3, Math.round(sz.W / 9)), v }), cx, cz, yaw);
    else if (kind === 'tanks') { counts.tanks++; place(tankFarm({ count: sz.W > 30 ? 2 : 1, R: 7 + r() * 1.5, h: 10 + r() * 5, seed: Math.floor(r() * 999), band: [0x4d6f5a, 0x3f5a78, 0x8a4a32][Math.floor(r() * 3)] }), cx, cz, yaw); }
    else if (kind === 'silos') { counts.silos++; place(siloCluster({ n: 3, R: 3 + r() * 0.5, h: 14 + r() * 4, seed: Math.floor(r() * 999) }), cx - 6, cz, yaw + Math.PI / 2); }
    else if (kind === 'stack') {
      const hmax = 2 + Math.floor(r() * 3);
      for (const bxo of singleBlock ? [0] : [-11, 11]) {
        for (let c = 0; c < 6; c++) for (let row = 0; row < 3; row++) {
          const hgt = Math.max(0, Math.round(hmax * (0.55 + 0.45 * Math.sin((c + 0.5) / 6 * Math.PI)) - r() * 2));
          const [x, z] = toWorld(cx, cz, yaw, bxo + (c - 2.5) * 2.9, (row - 1) * 12.9), y = tw.heightAt(x, z);
          for (let k = 0; k < hgt; k++) containers.push({ x, y: y + 1.3 + k * 2.6, z, ry: yaw + (r() - 0.5) * 0.015, c: tints[Math.floor(r() * tints.length)] });
          counts.containers += hgt;
        }
        for (let c = 0; c <= 6; c++) { const [x, z] = toWorld(cx, cz, yaw, bxo + (c - 3) * 2.9, 0); lines.push({ x, y: tw.heightAt(x, z) + 0.03, z, ry: yaw, sx: 0.12, sy: 0.02, sz: 39.7, c: C(0xd8d2c0) }); }
        if (counts.rtg < 8 && r() < 0.5) {
          counts.rtg++;
          protos.rtg ??= rtgCrane({});
          const [x, z] = toWorld(cx, cz, yaw, bxo + 1.5, (r() - 0.5) * 14);
          place(protos.rtg, x, z, yaw);
        }
      }
    }
    // footprint for scatter avoidance
    const step = Math.min(rc.hx, rc.hz);
    for (let v2 = -rc.hz + step; v2 <= rc.hz - step + 0.1; v2 += step) { const [x, z] = toWorld(cx, cz, yaw, 0, v2); tw.occupy(x, z, Math.max(rc.hx, step) + 2); }
    if (counts.mast < 16 && r() < 0.25) {
      counts.mast++;
      protos.mast ??= highMast();
      const [x, z] = toWorld(cx, cz, yaw, -rc.hx - 3, (r() < 0.5 ? -1 : 1) * rc.hz * 0.8);
      place(protos.mast, x, z, 0);
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
