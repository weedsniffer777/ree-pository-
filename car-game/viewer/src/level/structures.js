import * as THREE from 'three';
import { mesh, box, cyl, tube } from '../lib/geo.js';
import { makeCanvas, rust as paintRust } from '../lib/skin.js';
import { rng } from './noise.js';
import { STEP, I_FINISH, RAIL_LAT, FENCE, idxForZ, pointAt, sideDist } from './track.js';
import { terrainHeight } from './terrain.js';
import { bakeGroup } from './bake.js';

// Roadside world for Level 1. No words anywhere: signs and buildings use only
// numbers, symbols, colour and shape.

const FONT = '"DejaVu Sans", "Arial Black", Arial, sans-serif';
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });
const metal = (color = 0x8d9297, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.6, ...o });

function tex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function weather(g, w, h, seed, holes = 0) {
  const r = rng(seed);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < (w * h) / 40; i++) {
    g.fillStyle = r() < 0.6 ? `rgba(80,60,40,${r() * 0.14})` : `rgba(255,250,240,${r() * 0.12})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
  const gr = g.createLinearGradient(0, h, 0, h * 0.35);
  gr.addColorStop(0, 'rgba(170,125,80,0.28)');
  gr.addColorStop(1, 'rgba(170,125,80,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < holes; i++) {
    const x = w * (0.2 + r() * 0.6), y = h * (0.2 + r() * 0.6);
    g.fillStyle = 'rgba(205,205,210,0.95)';
    g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.fillStyle = '#121212';
    g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  g.restore();
}

// ---------- Sign faces (front texture + silhouette for the metal back) ----------
const SHAPES = {
  circle: (g, w, h) => { g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); },
  diamond: (g, w, h) => { g.beginPath(); g.moveTo(w / 2, 3); g.lineTo(w - 3, h / 2); g.lineTo(w / 2, h - 3); g.lineTo(3, h / 2); g.closePath(); },
  rect: (g, w, h) => { g.beginPath(); g.rect(2, 2, w - 4, h - 4); },
  shield: (g, w, h) => {
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.1);
    g.quadraticCurveTo(w * 0.3, h * 0.02, w * 0.5, h * 0.1);
    g.quadraticCurveTo(w * 0.7, h * 0.02, w * 0.88, h * 0.1);
    g.quadraticCurveTo(w * 0.98, h * 0.55, w * 0.5, h * 0.97);
    g.quadraticCurveTo(w * 0.02, h * 0.55, w * 0.12, h * 0.1);
    g.closePath();
  },
};

function signFace(w, h, shape, draw, seed, holes = 0) {
  const front = tex(w, h, (g) => {
    SHAPES[shape](g, w, h);
    g.save();
    g.clip();
    draw(g, w, h);
    g.restore();
    weather(g, w, h, seed, holes);
  });
  const sil = tex(w, h, (g) => { g.fillStyle = '#fff'; SHAPES[shape](g, w, h); g.fill(); });
  return { front, sil };
}

const digits = (g, text, x, y, size, color = '#111') => {
  g.fillStyle = color;
  g.font = `bold ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
};

const FACES = {
  speed: (n, seed) => signFace(256, 256, 'circle', (g, w, h) => {
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c4161c'; g.lineWidth = 30;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 18, 0, Math.PI * 2); g.stroke();
    digits(g, String(n), w / 2, h / 2 + 6, 112);
  }, seed, 2),
  shield: (n, seed) => signFace(256, 256, 'shield', (g, w, h) => {
    g.fillStyle = '#121212'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w * 0.07, h * 0.06); g.scale(0.86, 0.86);
    g.fillStyle = '#f2efe8'; SHAPES.shield(g, w, h); g.fill(); g.restore();
    digits(g, String(n), w / 2, h * 0.5, 104);
  }, seed, 1),
  curve: (dir, seed) => signFace(256, 256, 'diamond', (g, w, h) => {
    g.fillStyle = '#f0bd1a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 9;
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.strokeRect(-80, -80, 160, 160); g.restore();
    g.save(); g.translate(w / 2, h / 2); g.scale(dir, 1);
    g.lineWidth = 20; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(-18, 70); g.lineTo(-18, 10); g.quadraticCurveTo(-18, -32, 26, -38); g.stroke();
    g.fillStyle = '#111';
    g.beginPath(); g.moveTo(22, -66); g.lineTo(60, -38); g.lineTo(22, -10); g.closePath(); g.fill();
    g.restore();
  }, seed, 1),
  merge: (seed) => signFace(256, 256, 'diamond', (g, w, h) => {
    g.fillStyle = '#f0bd1a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 9;
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.strokeRect(-80, -80, 160, 160); g.restore();
    g.fillStyle = '#111';
    g.fillRect(w / 2 - 22, 60, 20, 140);
    g.save(); g.translate(w / 2 - 6, 150); g.rotate(-0.6); g.fillRect(0, -10, 70, 18); g.restore();
    g.beginPath(); g.moveTo(w / 2 - 34, 66); g.lineTo(w / 2 - 12, 34); g.lineTo(w / 2 + 10, 66); g.closePath(); g.fill();
  }, seed, 1),
  bang: (seed) => signFace(256, 256, 'diamond', (g, w, h) => {
    g.fillStyle = '#f0bd1a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111'; g.lineWidth = 9;
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.strokeRect(-80, -80, 160, 160); g.restore();
    g.fillStyle = '#111';
    g.fillRect(w / 2 - 11, 62, 22, 86);
    g.beginPath(); g.arc(w / 2, 178, 13, 0, 7); g.fill();
  }, seed, 3),
  chevron: (dir, seed) => signFace(192, 256, 'rect', (g, w, h) => {
    g.fillStyle = '#f0bd1a'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.scale(dir, 1);
    g.fillStyle = '#111';
    g.beginPath(); g.moveTo(-50, -86); g.lineTo(-6, -86); g.lineTo(52, 0); g.lineTo(-6, 86); g.lineTo(-50, 86); g.lineTo(8, 0); g.closePath(); g.fill();
    g.restore();
  }, seed),
  mile: (n, seed) => signFace(96, 224, 'rect', (g, w, h) => {
    g.fillStyle = '#0d6a3b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#eef0ea'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    const s = String(n);
    digits(g, s[0], w / 2, h * 0.32, 74, '#eef0ea');
    if (s[1]) digits(g, s[1], w / 2, h * 0.7, 74, '#eef0ea');
  }, seed),
  fuel: (arrow, seed) => signFace(256, 256, 'rect', (g, w, h) => {
    g.fillStyle = '#1c4c99'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#eef0ea'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#eef0ea';
    if (arrow) {
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
      g.fillRect(-14, -30, 28, 100);
      g.beginPath(); g.moveTo(-50, -26); g.lineTo(0, -86); g.lineTo(50, -26); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillRect(70, 62, 78, 140);
      g.fillStyle = '#1c4c99'; g.fillRect(84, 78, 50, 36);
      g.fillStyle = '#eef0ea'; g.fillRect(60, 196, 98, 14);
      g.strokeStyle = '#eef0ea'; g.lineWidth = 9;
      g.beginPath(); g.moveTo(148, 80); g.lineTo(176, 92); g.lineTo(176, 168); g.quadraticCurveTo(176, 186, 192, 178); g.lineTo(192, 120); g.stroke();
    }
  }, seed, 1),
  barricade: () => tex(512, 64, (g, w, h) => {
    g.fillStyle = '#f1ede4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2571b';
    for (let x = -64; x < w + 64; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.closePath(); g.fill(); }
    weather(g, w, h, 5);
  }),
};

const POST = metal(0x9aa0a5, { roughness: 0.5 });

function placeSign(group, colliders, face, i, lat, wM, hM, postH = 1.6, turn = 0) {
  const p = pointAt(i, lat);
  const gy = terrainHeight(p.x, p.z);
  const g = new THREE.Group();
  g.position.set(p.x, gy, p.z);
  g.rotation.y = p.yaw + Math.PI + turn;
  g.add(box(0.07, postH + hM * 0.6, 0.07, POST, { pos: [0, (postH + hM * 0.6) / 2, -0.04] }));
  g.add(mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshStandardMaterial({ map: face.front, alphaTest: 0.5, roughness: 0.55, metalness: 0.15 }), { pos: [0, postH + hM / 2, 0.005] }));
  g.add(mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshStandardMaterial({ map: face.sil, color: 0x8b9095, alphaTest: 0.5, roughness: 0.5, metalness: 0.5 }), { pos: [0, postH + hM / 2, -0.004], rot: [0, Math.PI, 0] }));
  group.add(g);
  colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.12 });
}

// ---------- Fences ----------
function fenceRun(points, posts, wires, r) {
  let prev = null;
  for (const p of points) {
    if (!p || r() < 0.06) { prev = null; continue; }
    const y = terrainHeight(p.x, p.z);
    const h = 1.2 + r() * 0.15;
    posts.push({ x: p.x, y: y + h / 2 - 0.1, z: p.z, rx: (r() - 0.5) * 0.12, rz: (r() - 0.5) * 0.12, s: h / 1.3 });
    const cur = { x: p.x, y, z: p.z };
    if (prev && Math.hypot(cur.x - prev.x, cur.z - prev.z) < 9) {
      for (const hh of [0.42, 0.75, 1.05]) {
        if (r() < 0.04) continue; // snapped strand
        const mx = (prev.x + cur.x) / 2, mz = (prev.z + cur.z) / 2, my = (prev.y + cur.y) / 2 + hh - 0.07;
        wires.push(prev.x, prev.y + hh, prev.z, mx, my, mz, mx, my, mz, cur.x, cur.y + hh, cur.z);
      }
    }
    prev = cur;
  }
}

// ---------- Windpump, shed, water tower, billboard ----------
function windpump() {
  const g = new THREE.Group();
  const steel = metal(0x8a8781, { roughness: 0.6 });
  const top = 9;
  const leg = (sx, sz) => [[sx * 1.4, 0, sz * 1.4], [sx * 0.25, top, sz * 0.25]];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) g.add(tube(...leg(sx, sz), 0.05, steel, 6));
  const at = (sx, sz, y) => { const t = y / top; return [sx * (1.4 - 1.15 * t), y, sz * (1.4 - 1.15 * t)]; };
  for (let y = 1.8; y < top; y += 1.8) {
    for (let k = 0; k < 4; k++) {
      const [a, b] = [corners[k], corners[(k + 1) % 4]];
      g.add(tube(at(...a, y), at(...b, y), 0.025, steel, 4));
      g.add(tube(at(...a, y - 1.8), at(...b, y), 0.015, steel, 4));
    }
  }
  g.add(box(0.8, 0.06, 0.8, steel, { pos: [0, top - 0.3, 0] }));
  g.add(box(0.45, 0.4, 0.9, metal(0x6f6c66), { pos: [0, top + 0.25, 0] }));
  g.add(tube([0, top + 0.25, -0.3], [0, top + 0.4, -2.6], 0.04, steel, 6));
  g.add(box(0.02, 1.0, 1.6, metal(0xa7a59f), { pos: [0, top + 0.5, -2.9] }));
  g.add(tube([0, 0.3, 0], [0, top, 0], 0.02, steel, 4));
  g.add(cyl(0.12, 0.12, 0.5, 8, steel, { pos: [0, 0.25, 0] }));
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0, top + 0.3, 0.6);
  rotor.add(cyl(0.12, 0.12, 0.2, 10, steel, { rot: [Math.PI / 2, 0, 0] }));
  const blade = metal(0xb4b1aa, { roughness: 0.5, side: THREE.DoubleSide });
  for (let k = 0; k < 18; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k / 18) * Math.PI * 2;
    const b = box(0.28, 1.2, 0.012, blade, { pos: [0, 1.15, 0] });
    b.rotation.y = 0.45;
    arm.add(b);
    rotor.add(arm);
  }
  for (const rr of [0.6, 1.72]) rotor.add(mesh(new THREE.TorusGeometry(rr, 0.02, 4, 36), steel));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; rotor.add(tube([0, 0, 0], [Math.cos(a) * 1.72, Math.sin(a) * 1.72, 0], 0.015, steel, 4)); }
  g.add(rotor);
  // stock tank
  g.add(cyl(2.0, 2.0, 0.7, 28, metal(0x9fa3a2, { roughness: 0.45 }), { pos: [3.6, 0.35, 0.5] }));
  g.add(cyl(1.92, 1.92, 0.02, 28, new THREE.MeshStandardMaterial({ color: 0x2f4f4c, roughness: 0.1, metalness: 0.2 }), { pos: [3.6, 0.6, 0.5] }));
  return { g, rotor };
}

function shed() {
  const g = new THREE.Group();
  const corr = tex(256, 256, (cg, w, h) => {
    for (let x = 0; x < w; x += 16) {
      const gr = cg.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, '#8d9092'); gr.addColorStop(0.5, '#b5b8b9'); gr.addColorStop(1, '#6f7274');
      cg.fillStyle = gr; cg.fillRect(x, 0, 16, h);
    }
    const cv = { g: cg, P: (a, b) => [a * w, (1 - b) * h], ppm: w };
    paintRust(cv, [[0.2, 0.2], [0.7, 0.3], [0.5, 0.85], [0.1, 0.6]], 3, { size: 0.12 });
  }, true);
  const m = std(0xffffff, { map: corr, roughness: 0.6, metalness: 0.4 });
  g.add(box(6, 2.6, 4.5, m, { pos: [0, 1.3, 0] }));
  for (const s of [-1, 1]) g.add(box(6.4, 0.06, 2.65, m, { pos: [0, 3.05, s * 1.15], rot: [s * 0.4, 0, 0] }));
  g.add(box(0.05, 1.0, 4.5, m, { pos: [-3, 2.8, 0] }));
  g.add(box(0.05, 1.0, 4.5, m, { pos: [3, 2.8, 0] }));
  g.add(box(1.4, 2.1, 0.04, std(0x15161a), { pos: [1.2, 1.05, 2.27] }));
  g.add(cyl(0.3, 0.3, 0.9, 12, std(0x6a3a26, { roughness: 0.8 }), { pos: [-2.3, 0.45, 2.7] }));
  return g;
}

function waterTower() {
  const g = new THREE.Group();
  const steel = metal(0x9a968f, { roughness: 0.65 });
  const tankTex = tex(512, 256, (cg, w, h) => {
    cg.fillStyle = '#c9c5bd'; cg.fillRect(0, 0, w, h);
    const r = rng(41);
    for (let i = 0; i < 14000; i++) { cg.fillStyle = `rgba(${r() < 0.5 ? '90,80,70' : '240,236,228'},${r() * 0.12})`; cg.fillRect(r() * w, r() * h, 2, 2); }
    for (let x = 0; x < w; x += 64) { cg.fillStyle = 'rgba(80,76,70,0.4)'; cg.fillRect(x, 0, 2, h); }
    const cv = { g: cg, P: (a, b) => [a * w, (1 - b) * h], ppm: w };
    paintRust(cv, [[0.1, 0.9], [0.3, 0.85], [0.55, 0.92], [0.8, 0.88], [0.92, 0.3], [0.4, 0.2]], 9, { size: 0.05 });
  }, true);
  const T = 13.5;
  const corners = [0, 1, 2, 3].map((k) => (k / 4) * Math.PI * 2 + Math.PI / 4);
  const legAt = (a, y) => { const rr = 3.6 - (1.2 * y) / T; return [Math.cos(a) * rr, y, Math.sin(a) * rr]; };
  for (const a of corners) g.add(tube(legAt(a, 0), legAt(a, T), 0.16, steel, 8));
  for (const y of [3.4, 6.8, 10.2]) {
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      g.add(tube(legAt(a, y), legAt(b, y), 0.06, steel, 5));
      g.add(tube(legAt(a, y - 3.4), legAt(b, y), 0.03, steel, 4));
      g.add(tube(legAt(b, y - 3.4), legAt(a, y), 0.03, steel, 4));
    }
  }
  g.add(cyl(3.4, 3.4, 4.6, 32, std(0xffffff, { map: tankTex, roughness: 0.6, metalness: 0.3 }), { pos: [0, T + 2.3, 0] }));
  g.add(mesh(new THREE.SphereGeometry(3.4, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.35, 1), steel, { pos: [0, T, 0] }));
  g.add(mesh(new THREE.ConeGeometry(3.6, 1.5, 32), std(0xb9b5ad, { roughness: 0.6, metalness: 0.3 }), { pos: [0, T + 4.6 + 0.75, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.2, 10, 6), steel, { pos: [0, T + 6.1, 0] }));
  g.add(mesh(new THREE.RingGeometry(3.4, 4.1, 32).rotateX(-Math.PI / 2), std(0x3a3b3c, { side: THREE.DoubleSide }), { pos: [0, T + 0.05, 0] }));
  g.add(mesh(new THREE.TorusGeometry(4.1, 0.04, 4, 48).rotateX(Math.PI / 2), steel, { pos: [0, T + 1.0, 0] }));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.add(tube([Math.cos(a) * 4.1, T, Math.sin(a) * 4.1], [Math.cos(a) * 4.1, T + 1.0, Math.sin(a) * 4.1], 0.025, steel, 4)); }
  const la = corners[0];
  const l0 = legAt(la, 0), l1 = legAt(la, T);
  for (const off of [-0.25, 0.25]) g.add(tube([l0[0] + off, 0, l0[2] + 0.35], [l1[0] + off, T, l1[2] + 0.35], 0.025, steel, 4));
  for (let y = 0.4; y < T; y += 0.35) { const t = y / T; g.add(box(0.5, 0.03, 0.03, steel, { pos: [l0[0] + (l1[0] - l0[0]) * t, y, l0[2] + (l1[2] - l0[2]) * t + 0.35] })); }
  return g;
}

function billboard(seed = 77) {
  const g = new THREE.Group();
  const art = tex(1024, 448, (cg, w, h) => {
    const r = rng(seed);
    cg.fillStyle = '#d9d2c4'; cg.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { cg.fillStyle = `rgba(${r() < 0.5 ? '120,105,90' : '250,246,236'},${r() * 0.12})`; cg.fillRect(r() * w, r() * h, 2 + r() * 3, 2); }
    for (let x = 0; x < w; x += 128) { cg.fillStyle = 'rgba(90,80,70,0.25)'; cg.fillRect(x, 0, 2, h); }
    for (let k = 0; k < 10; k++) { // torn paper revealing the grey panel
      const x = r() * w, y = r() * h, pw = 40 + r() * 180, ph = 30 + r() * 120;
      cg.fillStyle = '#8f8a82'; cg.beginPath(); cg.moveTo(x, y);
      for (let q = 0; q <= 8; q++) cg.lineTo(x + (pw * q) / 8, y + (r() - 0.5) * 16);
      cg.lineTo(x + pw, y + ph); cg.lineTo(x, y + ph + (r() - 0.5) * 24); cg.fill();
    }
    for (let k = 0; k < 40; k++) { // rust and grime runs
      const x = r() * w, len = 30 + r() * 160;
      const gr = cg.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(120,70,40,${0.2 + r() * 0.25})`); gr.addColorStop(1, 'rgba(120,70,40,0)');
      cg.fillStyle = gr; cg.fillRect(x, 0, 2 + r() * 5, len);
    }
    weather(cg, w, h, seed + 1);
  });
  const wood = std(0x6e5a45, { roughness: 0.95 });
  for (const x of [-3.8, 0, 3.8]) g.add(cyl(0.17, 0.2, 9, 8, wood, { pos: [x, 4.5, -0.25] }));
  const back = std(0x7c705f, { roughness: 0.95 });
  g.add(box(10, 4.5, 0.15, [back, back, back, back, std(0xffffff, { map: art, roughness: 0.8 }), back], { pos: [0, 6.6, 0] }));
  g.add(box(10.4, 0.06, 0.9, metal(0x6f7377), { pos: [0, 4.2, 0.5] }));
  g.add(tube([-5.2, 5.0, 0.92], [5.2, 5.0, 0.92], 0.025, metal(), 4));
  for (const x of [-4, 0, 4]) {
    g.add(tube([x, 8.85, -0.05], [x, 9.25, 0.9], 0.03, metal(), 4));
    g.add(box(0.5, 0.12, 0.25, metal(0x3a3c3e), { pos: [x, 9.2, 0.95] }));
  }
  return g;
}

function barricade() {
  const g = new THREE.Group();
  const stripes = FACES.barricade();
  const m = std(0xffffff, { map: stripes, roughness: 0.7 });
  for (const y of [0.45, 0.85, 1.25]) g.add(box(2.4, 0.22, 0.04, m, { pos: [0, y, 0] }));
  for (const x of [-1.0, 1.0]) for (const s of [-1, 1]) g.add(tube([x, 1.4, 0], [x, 0, s * 0.45], 0.035, std(0xdedad2), 5));
  return g;
}

export function buildStructures() {
  const group = new THREE.Group();
  group.name = 'structures';
  const colliders = [];
  const exclusions = [];
  const updaters = [];
  const r = rng(12);

  // Fences both sides; a gap where the side road comes through on the right
  const posts = [], wires = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = idxForZ(-220); i < I_FINISH + Math.round(900 / STEP); i += 4) {
      const p = pointAt(i, side * FENCE);
      pts.push(sideDist(p.x, p.z) < 7 ? null : p);
    }
    fenceRun(pts, posts, wires, r);
  }
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.07, 1.3, 6), std(0x6b5b4a, { roughness: 1 }), posts.length);
  const o = new THREE.Object3D();
  posts.forEach((p, k) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, r() * 3, p.rz); o.scale.set(1, p.s, 1); o.updateMatrix(); postMesh.setMatrixAt(k, o.matrix); });
  postMesh.castShadow = true;
  postMesh.computeBoundingSphere();
  group.add(postMesh);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x3b3632 })));

  // Power line on the left
  const pg = new THREE.Group();
  const poleM = std(0x6a5440, { roughness: 1 });
  const insul = std(0x6b3a22, { roughness: 0.35 });
  const pWires = [];
  let prevArm = null;
  for (let i = idxForZ(-250), k = 0; i < I_FINISH + Math.round(1300 / STEP); i += Math.round(55 / STEP), k++) {
    const p = pointAt(i, -27);
    const pole = new THREE.Group();
    pole.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    pole.rotation.set((r() - 0.5) * 0.04, p.yaw, (r() - 0.5) * 0.04);
    pole.add(cyl(0.12, 0.16, 9.6, 8, poleM, { pos: [0, 4.8, 0] }));
    pole.add(box(2.4, 0.12, 0.12, poleM, { pos: [0, 8.9, 0] }));
    for (const x of [-1, 1]) pole.add(tube([x * 0.9, 8.9, 0], [0, 8.2, 0], 0.025, metal(), 4));
    for (const x of [-1.05, -0.35, 1.05]) pole.add(cyl(0.05, 0.07, 0.18, 8, insul, { pos: [x, 9.05, 0] }));
    if (k % 5 === 2) {
      pole.add(cyl(0.3, 0.3, 0.8, 12, metal(0x8e9396), { pos: [0, 7.4, 0.32] }));
      pole.add(cyl(0.32, 0.32, 0.05, 12, metal(0x6d7276), { pos: [0, 7.82, 0.32] }));
    }
    pg.add(pole);
    pole.updateMatrixWorld(true);
    const arm = [-1.05, -0.35, 1.05].map((x) => new THREE.Vector3(x, 9.14, 0).applyMatrix4(pole.matrixWorld));
    if (prevArm) {
      for (let w = 0; w < 3; w++) {
        let last = prevArm[w];
        for (let q = 1; q <= 10; q++) {
          const t = q / 10;
          const v = new THREE.Vector3().lerpVectors(prevArm[w], arm[w], t);
          v.y -= 4 * t * (1 - t);
          pWires.push(last.x, last.y, last.z, v.x, v.y, v.z);
          last = v;
        }
      }
    }
    prevArm = arm;
    exclusions.push({ x: p.x, z: p.z, r: 1.5 });
  }
  bakeGroup(pg);
  group.add(pg);
  const pwGeo = new THREE.BufferGeometry();
  pwGeo.setAttribute('position', new THREE.Float32BufferAttribute(pWires, 3));
  group.add(new THREE.LineSegments(pwGeo, new THREE.LineBasicMaterial({ color: 0x2a2623 })));

  // Signs (numbers and symbols only)
  const sg = new THREE.Group();
  const iz = idxForZ;
  placeSign(sg, colliders, FACES.speed(65, 1), iz(40), 8.2, 0.9, 0.9);
  placeSign(sg, colliders, FACES.shield(66, 2), iz(110), 8.2, 0.85, 0.85);
  placeSign(sg, colliders, FACES.curve(1, 3), iz(190), 8.2, 0.95, 0.95);
  for (const z of [270, 310, 350]) placeSign(sg, colliders, FACES.chevron(1, 4 + z), iz(z), -(RAIL_LAT + 0.7), 0.55, 0.75, 1.0);
  placeSign(sg, colliders, FACES.merge(5), iz(440), 8.2, 0.95, 0.95);
  placeSign(sg, colliders, FACES.mile(12, 7), iz(620), 8.0, 0.32, 0.75, 0.8);
  placeSign(sg, colliders, FACES.speed(55, 8), iz(650), 8.2, 0.9, 0.9);
  placeSign(sg, colliders, FACES.curve(-1, 9), iz(740), 8.2, 0.95, 0.95);
  for (const z of [830, 870, 910]) placeSign(sg, colliders, FACES.chevron(-1, 10 + z), iz(z), RAIL_LAT + 0.7, 0.55, 0.75, 1.0);
  placeSign(sg, colliders, FACES.curve(1, 11), iz(1100), 8.2, 0.95, 0.95);
  for (const z of [1180, 1220, 1260]) placeSign(sg, colliders, FACES.chevron(1, 12 + z), iz(z), -(RAIL_LAT + 0.7), 0.55, 0.75, 1.0);
  placeSign(sg, colliders, FACES.mile(13, 13), iz(1240), -(RAIL_LAT + 1.0), 0.32, 0.75, 0.8);
  placeSign(sg, colliders, FACES.bang(14), iz(1340), 8.2, 0.95, 0.95);
  bakeGroup(sg);
  group.add(sg);

  // Landmarks outside the fences: billboards, water towers, a ranch windpump
  const place = (obj, z, lat, yawOff, excl) => {
    const p = pointAt(idxForZ(z), lat);
    obj.position.set(p.x, terrainHeight(p.x, p.z) - 0.05, p.z);
    obj.rotation.y = p.yaw + yawOff;
    group.add(obj);
    exclusions.push({ x: p.x, z: p.z, r: excl });
  };
  [[150, -34, 61], [600, 33, 62], [980, -36, 63], [1290, 34, 64]].forEach(([z, lat, seed]) => {
    const bb = billboard(seed);
    bakeGroup(bb);
    place(bb, z, lat, Math.PI + (lat < 0 ? -0.45 : 0.45), 7);
  });
  [[330, -46], [820, 48], [1190, -52]].forEach(([z, lat]) => {
    const wt = waterTower();
    bakeGroup(wt);
    place(wt, z, lat, z * 0.01, 8);
  });
  const wp = windpump();
  place(wp.g, 700, -42, 0.9, 6);
  updaters.push((dt) => { wp.rotor.rotation.z -= dt * 2.2; });
  bakeGroup(wp.g, { skip: (obj) => obj.name === 'rotor' });
  const sh = shed();
  bakeGroup(sh);
  place(sh, 716, -52, 0.2, 6);

  return { group, colliders, exclusions, update: (dt) => updaters.forEach((f) => f(dt)) };
}
