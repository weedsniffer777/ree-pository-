import * as THREE from 'three';
import { mesh, box, cyl, tube } from '../lib/geo.js';
import { makeCanvas, rust as paintRust } from '../lib/skin.js';
import { rng } from './noise.js';
import {
  STEP, GAS, LAKE, FENCE, I_BLOCK_BACK, I_BLOCK_FAR, I_LAKE_IN, idxForZ, pointAt, gasToWorld, nearest,
} from './track.js';
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

// ---------- Gas station (local frame: +z along the road, local x = -lat) ----------
function gasStation(colliders) {
  const p = pointAt(GAS.i, 0);
  const g = new THREE.Group();
  g.position.set(p.x, GAS.y, p.z);
  g.rotation.y = p.yaw;
  const toW = (lx, lz) => gasToWorld(lz, -lx);
  const boxC = (lx, lz, hx, hz) => { const w = toW(lx, lz); colliders.push({ type: 'box', x: w.x, z: w.z, yaw: p.yaw, hx, hz }); };
  const circC = (lx, lz, rr) => { const w = toW(lx, lz); colliders.push({ type: 'circle', x: w.x, z: w.z, r: rr }); };
  const HL = GAS.halfLen;

  const concrete = tex(512, 512, (cg, w, h) => {
    const r = rng(17);
    cg.fillStyle = '#b9b2a6'; cg.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const v = 150 + r() * 70; cg.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; cg.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 14; i++) {
      const x = r() * w, y = r() * h, rad = 10 + r() * 45;
      const gr = cg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(40,36,32,0.45)'); gr.addColorStop(1, 'rgba(40,36,32,0)');
      cg.fillStyle = gr; cg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    cg.strokeStyle = 'rgba(50,46,42,0.75)'; cg.lineWidth = 3;
    for (const v of [1, 256, 511]) { cg.beginPath(); cg.moveTo(v, 0); cg.lineTo(v, h); cg.stroke(); cg.beginPath(); cg.moveTo(0, v); cg.lineTo(w, v); cg.stroke(); }
    cg.strokeStyle = 'rgba(40,36,32,0.6)'; cg.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { cg.beginPath(); let x = r() * w, y = r() * h; cg.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; cg.lineTo(x, y); } cg.stroke(); }
  }, true);
  const slabW = GAS.latOut - GAS.latIn;
  concrete.repeat.set(slabW / 6, (HL * 2) / 6);
  g.add(mesh(new THREE.PlaneGeometry(slabW, HL * 2).rotateX(-Math.PI / 2), std(0xffffff, { map: concrete, roughness: 0.9 }), { pos: [-(GAS.latIn + GAS.latOut) / 2, 0.045, 0] }));

  // Curbs with two driveways, landscape strip with the price pylon
  const curbM = std(0xc9c3b8, { roughness: 0.9 });
  for (const [z0, z1] of [[-HL, -29], [-15, 15], [29, HL]]) g.add(box(0.3, 0.16, z1 - z0, curbM, { pos: [-7.05, 0.1, (z0 + z1) / 2] }));
  g.add(box(0.3, 0.16, 30, curbM, { pos: [-10.15, 0.1, 0] }));
  g.add(box(2.8, 0.12, 30, std(0x9a8670, { roughness: 1 }), { pos: [-8.6, 0.08, 0] }));
  const agave = std(0x6f7a4c, { flatShading: true });
  for (const z of [-6, 2, 9]) for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    g.add(cyl(0, 0.06, 0.7, 4, agave, { pos: [-8.6 + Math.cos(a) * 0.18, 0.4, z + Math.sin(a) * 0.18], rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] }));
  }

  // Canopy
  const fascia = tex(512, 64, (cg, w, h) => {
    cg.fillStyle = '#eeebe4'; cg.fillRect(0, 0, w, h);
    cg.fillStyle = '#c42a1e'; cg.fillRect(0, 22, w, 20);
    cg.fillStyle = '#1f4c96'; cg.fillRect(0, 46, w, 5);
    weather(cg, w, h, 23);
  });
  const fasciaM = std(0xffffff, { map: fascia, roughness: 0.6 });
  const CX = -22, CW = 14, CL = 24, CY = 5.0;
  g.add(box(CW, 0.3, CL, std(0xd8d4cc), { pos: [CX, CY + 0.45, 0] }));
  g.add(box(CW - 0.2, 0.05, CL - 0.2, std(0xe9e6df, { roughness: 0.7 }), { pos: [CX, CY, 0] }));
  for (const s of [-1, 1]) {
    g.add(box(CW + 0.3, 0.9, 0.15, fasciaM, { pos: [CX, CY + 0.4, s * (CL / 2 + 0.07)] }));
    g.add(box(0.15, 0.9, CL + 0.3, fasciaM, { pos: [CX + s * (CW / 2 + 0.07), CY + 0.4, 0] }));
  }
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 0.9 });
  for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) g.add(box(1.0, 0.04, 0.55, lamp, { pos: [CX - 4 + a * 4, CY - 0.03, -9.6 + b * 4.8] }));

  // Islands, pillars, pumps, bollards, bins
  const islandM = std(0xc4bdb1, { roughness: 0.9 });
  const yellow = std(0xe0b22a, { roughness: 0.6 });
  const pillarM = metal(0xd9d6cf, { roughness: 0.45, metalness: 0.3 });
  const pumpNo = [1, 2, 3, 4];
  for (const [k, ix] of [-18.5, -25.5].entries()) {
    g.add(box(1.3, 0.2, 7.4, islandM, { pos: [ix, 0.15, 0] }));
    for (const s of [-1, 1]) {
      g.add(cyl(0.65, 0.65, 0.2, 16, islandM, { pos: [ix, 0.15, s * 3.7], rot: [0, 0, 0] }));
      g.add(box(0.45, CY - 0.25, 0.45, pillarM, { pos: [ix, 0.25 + (CY - 0.25) / 2, s * 2.9] }));
      g.add(box(0.5, 0.35, 0.5, std(0x2a2c2f), { pos: [ix, 0.42, s * 2.9] }));
      g.add(cyl(0.09, 0.09, 1.0, 10, yellow, { pos: [ix, 0.75, s * 3.95] }));
      g.add(cyl(0.22, 0.2, 0.85, 12, std(0x2b2e31, { roughness: 0.5, metalness: 0.4 }), { pos: [ix + 0.32, 0.67, s * 2.2] }));
      const pm = pump(pumpNo[k * 2 + (s > 0 ? 1 : 0)]);
      pm.position.set(ix, 0.25, s * 1.15);
      g.add(pm);
      circC(ix, s * 2.9, 0.4);
    }
    boxC(ix, 0, 0.75, 4.2);
  }
  // oil stains beside the pumps
  const stain = tex(128, 128, (cg) => { const gr = cg.createRadialGradient(64, 64, 0, 64, 64, 62); gr.addColorStop(0, 'rgba(25,22,20,0.55)'); gr.addColorStop(1, 'rgba(25,22,20,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 128, 128); });
  const stainM = new THREE.MeshStandardMaterial({ map: stain, transparent: true, depthWrite: false, roughness: 0.4 });
  const sr = rng(4);
  for (const ix of [-18.5, -25.5]) for (const s of [-1, 1]) for (const zz of [-1.2, 1.2]) {
    const st = mesh(new THREE.PlaneGeometry(1.6 + sr(), 1.3 + sr()).rotateX(-Math.PI / 2), stainM, { pos: [ix + s * 2.0, 0.05, zz + (sr() - 0.5)] });
    st.castShadow = false;
    g.add(st);
  }

  // Store
  const stucco = tex(256, 256, (cg, w, h) => {
    const r = rng(29);
    cg.fillStyle = '#d6c3a1'; cg.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 'rgba(120,96,70,' : 'rgba(250,240,220,'; cg.fillStyle = v + (r() * 0.15) + ')'; cg.fillRect(r() * w, r() * h, 2, 2); }
  }, true);
  stucco.repeat.set(3, 1);
  const wallM = std(0xffffff, { map: stucco, roughness: 0.95 });
  const SX = -42.5, SW = 8, SL = 18, SH = 4.2;
  g.add(box(SW, SH, SL, wallM, { pos: [SX, SH / 2, 0] }));
  g.add(box(SW + 0.06, 0.45, SL + 0.06, std(0x8c8478), { pos: [SX, 0.22, 0] }));
  g.add(box(SW + 0.3, 0.6, SL + 0.3, wallM, { pos: [SX, SH + 0.3, 0] }));
  g.add(box(SW + 0.4, 0.08, SL + 0.4, metal(0x8a8f94), { pos: [SX, SH + 0.64, 0] }));
  const glassM = new THREE.MeshStandardMaterial({ color: 0x1b2329, roughness: 0.08, metalness: 0.7 });
  const frameM = metal(0xb9bec3, { roughness: 0.35 });
  const fx = SX + SW / 2 + 0.02;
  g.add(box(0.04, 2.5, 14, glassM, { pos: [fx, 1.75, 0] }));
  for (let k = 0; k <= 9; k++) g.add(box(0.08, 2.6, 0.08, frameM, { pos: [fx + 0.02, 1.75, -7 + k * (14 / 9)] }));
  for (const y of [0.48, 1.3, 3.02]) g.add(box(0.08, 0.08, 14.1, frameM, { pos: [fx + 0.02, y, 0] }));
  g.add(box(0.1, 0.06, 1.2, metal(0xd0d4d8), { pos: [fx + 0.08, 1.15, 0.6] })); // door push bar
  g.add(box(1.2, 0.12, 15, std(0x23508f, { roughness: 0.6 }), { pos: [fx + 0.6, 3.35, 0], rot: [0, 0, -0.25] })); // awning
  g.add(box(2.0, 0.15, SL, std(0xc7c1b6), { pos: [fx + 1.0, 0.12, 0] })); // sidewalk
  // roof units
  for (const z of [-4, 3.5]) {
    g.add(box(1.6, 1.0, 1.3, metal(0x9da2a6), { pos: [SX - 1, SH + 1.1, z] }));
    g.add(cyl(0.45, 0.45, 0.06, 16, std(0x2a2c2e), { pos: [SX - 1, SH + 1.62, z] }));
  }
  g.add(cyl(0.08, 0.08, 1.2, 8, metal(), { pos: [SX + 2, SH + 1.2, -7] }));
  // ice chest with a snowflake symbol, propane cage, air machine, dumpster
  const snow = tex(128, 64, (cg, w, h) => {
    cg.fillStyle = '#eef1f3'; cg.fillRect(0, 0, w, h);
    cg.fillStyle = '#2c63b8'; cg.fillRect(0, 0, w, 14);
    cg.strokeStyle = '#2c63b8'; cg.lineWidth = 4; cg.translate(64, 40);
    for (let k = 0; k < 3; k++) { cg.rotate(Math.PI / 3); cg.beginPath(); cg.moveTo(-18, 0); cg.lineTo(18, 0); cg.stroke(); }
  });
  g.add(box(0.8, 1.15, 1.9, [std(0xeef1f3), std(0xeef1f3), std(0xeef1f3), std(0xeef1f3), std(0xeef1f3), std(0xeef1f3)], { pos: [fx + 0.6, 0.62, -5.5] }));
  g.add(mesh(new THREE.PlaneGeometry(1.9, 0.95), std(0xffffff, { map: snow }), { pos: [fx + 1.01, 0.68, -5.5], rot: [0, Math.PI / 2, 0] }));
  boxC(fx + 0.6, -5.5, 0.45, 1.0);
  const cage = new THREE.Group();
  cage.position.set(fx + 0.7, 0.2, 6.2);
  const cageM = metal(0x7f858a);
  for (const [dx, dz] of [[-0.45, -0.75], [0.45, -0.75], [-0.45, 0.75], [0.45, 0.75]]) cage.add(box(0.05, 1.5, 0.05, cageM, { pos: [dx, 0.75, dz] }));
  for (const y of [0.02, 0.75, 1.5]) { cage.add(box(0.95, 0.04, 0.04, cageM, { pos: [0, y, -0.75] })); cage.add(box(0.95, 0.04, 0.04, cageM, { pos: [0, y, 0.75] })); cage.add(box(0.04, 0.04, 1.55, cageM, { pos: [-0.45, y, 0] })); cage.add(box(0.04, 0.04, 1.55, cageM, { pos: [0.45, y, 0] })); }
  for (let k = 0; k < 6; k++) cage.add(cyl(0.15, 0.15, 0.55, 12, std(0xeeeeea, { roughness: 0.4 }), { pos: [-0.2 + (k % 2) * 0.4, 0.33 + Math.floor(k / 4) * 0.7, -0.5 + (k % 3) * 0.5] }));
  g.add(cage);
  boxC(fx + 0.7, 6.2, 0.55, 0.85);
  const air = new THREE.Group();
  air.position.set(-31, 0, -11.5);
  air.add(box(0.12, 1.0, 0.12, metal(), { pos: [0, 0.5, 0] }));
  air.add(box(0.45, 0.75, 0.32, std(0xc42a1e, { roughness: 0.5 }), { pos: [0, 1.25, 0] }));
  air.add(mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 18), std(0x151515), { pos: [0.27, 1.0, 0], rot: [0, Math.PI / 2, 0] }));
  g.add(air);
  circC(-31, -11.5, 0.35);
  g.add(box(1.8, 1.3, 2.4, std(0x2f5136, { roughness: 0.7, metalness: 0.3 }), { pos: [-43, 0.7, -11.6] }));
  g.add(box(1.85, 0.08, 2.45, std(0x1f2a22), { pos: [-43, 1.39, -11.6], rot: [0, 0, 0.12] }));
  boxC(-43, -11.6, 1.0, 1.3);
  boxC(SX, 0, SW / 2 + 0.1, SL / 2 + 0.1);
  // parking stripes in front of the store
  const paint = std(0xe9e6df, { roughness: 0.8 });
  for (let k = 0; k <= 6; k++) g.add(box(5, 0.01, 0.12, paint, { pos: [fx + 4.5, 0.052, -8.1 + k * 2.7] }));

  // Price pylon: flame symbol + three LED price rows (digits only)
  const prices = tex(256, 512, (cg, w, h) => {
    cg.fillStyle = '#f0ede6'; cg.fillRect(0, 0, w, 170);
    cg.fillStyle = '#d23a1e';
    cg.beginPath(); cg.moveTo(128, 18); cg.bezierCurveTo(196, 80, 186, 150, 128, 156); cg.bezierCurveTo(70, 150, 60, 80, 128, 18); cg.fill();
    cg.fillStyle = '#f2a51c';
    cg.beginPath(); cg.moveTo(128, 70); cg.bezierCurveTo(160, 104, 156, 140, 128, 142); cg.bezierCurveTo(100, 140, 96, 104, 128, 70); cg.fill();
    const rows = [['#2f8f3a', '3.49'], ['#2c63b8', '3.89'], ['#c42a1e', '4.29']];
    rows.forEach(([chip, val], k) => {
      const y0 = 178 + k * 110;
      cg.fillStyle = '#121314'; cg.fillRect(0, y0, w, 104);
      cg.fillStyle = chip; cg.fillRect(14, y0 + 30, 40, 40);
      cg.shadowColor = '#ff4a1c'; cg.shadowBlur = 14;
      digits(cg, val, 158, y0 + 54, 62, '#ff4a1c');
      cg.shadowBlur = 0;
    });
    weather(cg, w, h, 31);
  });
  const pylon = new THREE.Group();
  pylon.position.set(-8.6, 0.14, -12);
  for (const x of [-0.9, 0.9]) pylon.add(box(0.22, 6.2, 0.22, metal(0x8c9196), { pos: [x, 3.1, 0] }));
  pylon.add(box(2.2, 4.4, 0.32, std(0x2a2c2f), { pos: [0, 4.3, 0] }));
  for (const s of [-1, 1]) pylon.add(mesh(new THREE.PlaneGeometry(2.1, 4.2), std(0xffffff, { map: prices, roughness: 0.5, emissive: 0x222222, emissiveMap: prices }), { pos: [0, 4.3, s * 0.165], rot: [0, s > 0 ? 0 : Math.PI, 0] }));
  pylon.add(box(2.6, 0.8, 0.9, std(0x8c7b66, { roughness: 1 }), { pos: [0, 0.4, 0] }));
  g.add(pylon);
  circC(-8.6, -12, 1.4);

  bakeGroup(g);
  return g;
}

let screenTex;
function pump(n) {
  const g = new THREE.Group();
  const white = std(0xe9e6df, { roughness: 0.5 });
  const red = std(0xb3261e, { roughness: 0.55 });
  const dark = std(0x1d2024, { roughness: 0.4, metalness: 0.3 });
  screenTex ??= tex(128, 96, (cg, w, h) => {
    cg.fillStyle = '#0f1a14'; cg.fillRect(0, 0, w, h);
    cg.shadowColor = '#7dff9a'; cg.shadowBlur = 6;
    digits(cg, '12.48', w / 2, 30, 30, '#9dffb0');
    digits(cg, '3.572', w / 2, 70, 30, '#9dffb0');
  });
  const screen = std(0xffffff, { map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.6, roughness: 0.2 });
  const plate = tex(64, 64, (cg) => { cg.fillStyle = '#f4f2ec'; cg.fillRect(0, 0, 64, 64); digits(cg, String(n), 32, 34, 44); });
  g.add(box(0.8, 0.12, 0.55, std(0x8d8f91), { pos: [0, 0.06, 0] }));
  g.add(box(0.7, 1.05, 0.46, white, { pos: [0, 0.645, 0] }));
  g.add(box(0.74, 0.52, 0.5, red, { pos: [0, 1.43, 0] }));
  g.add(box(0.78, 0.05, 0.54, dark, { pos: [0, 1.715, 0] }));
  g.add(box(0.2, 0.2, 0.2, std(0xffffff, { map: plate }), { pos: [0, 1.84, 0] }));
  const grades = [0x2f8f3a, 0x2c63b8, 0xc42a1e];
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.PlaneGeometry(0.34, 0.25), screen, { pos: [s * 0.372, 1.45, 0], rot: [0, s * Math.PI / 2, 0] }));
    grades.forEach((c, k) => g.add(box(0.012, 0.05, 0.07, std(c), { pos: [s * 0.356, 0.98, -0.1 + k * 0.1] })));
    g.add(box(0.07, 0.22, 0.09, dark, { pos: [s * 0.385, 0.74, 0.14] }));
    g.add(box(0.05, 0.06, 0.2, std(0x2c6e3a), { pos: [s * 0.42, 0.83, 0.14], rot: [0.5, 0, 0] }));
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.33, 1.68, 0.18), new THREE.Vector3(s * 0.62, 1.2, 0.24),
      new THREE.Vector3(s * 0.66, 0.55, 0.2), new THREE.Vector3(s * 0.48, 0.62, 0.16), new THREE.Vector3(s * 0.43, 0.8, 0.12),
    ]);
    g.add(mesh(new THREE.TubeGeometry(hose, 24, 0.022, 6), std(0x151515, { roughness: 0.7 })));
  }
  return g;
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

function billboard() {
  const g = new THREE.Group();
  const art = tex(1024, 448, (cg, w, h) => {
    const sky = cg.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#f2b066'); sky.addColorStop(1, '#f6d7a0');
    cg.fillStyle = sky; cg.fillRect(0, 0, w, h);
    cg.fillStyle = '#ffe6a8'; cg.beginPath(); cg.arc(760, 170, 92, 0, 7); cg.fill();
    cg.fillStyle = '#a04c2c';
    cg.beginPath(); cg.moveTo(0, 300); cg.lineTo(120, 300); cg.lineTo(150, 220); cg.lineTo(330, 220); cg.lineTo(360, 300); cg.lineTo(620, 300); cg.lineTo(660, 250); cg.lineTo(860, 250); cg.lineTo(900, 300); cg.lineTo(w, 300); cg.lineTo(w, h); cg.lineTo(0, h); cg.fill();
    cg.fillStyle = '#d9a46a'; cg.fillRect(0, 300, w, h - 300);
    cg.fillStyle = '#3a3532'; cg.beginPath(); cg.moveTo(480, 300); cg.lineTo(540, 300); cg.lineTo(760, h); cg.lineTo(260, h); cg.fill();
    cg.fillStyle = '#e8b52c'; for (let k = 0; k < 5; k++) { const t = k / 5; cg.fillRect(508 + t * 4, 306 + t * 130, 4 + t * 6, 10 + t * 12); }
    cg.save(); cg.lineWidth = 14; cg.strokeStyle = '#7a1f16'; cg.font = `bold 230px ${FONT}`; cg.textAlign = 'center'; cg.textBaseline = 'middle';
    cg.strokeText('66', 190, 160); cg.fillStyle = '#f4efe4'; cg.fillText('66', 190, 160); cg.restore();
    const r = rng(77);
    for (let k = 0; k < 9; k++) { // peeled paper strips
      const x = r() * w, y = r() * h, pw = 30 + r() * 140, ph = 20 + r() * 80;
      cg.fillStyle = '#cfc8bc'; cg.beginPath(); cg.moveTo(x, y);
      for (let s = 0; s <= 8; s++) cg.lineTo(x + (pw * s) / 8, y + (r() - 0.5) * 12);
      cg.lineTo(x + pw, y + ph); cg.lineTo(x, y + ph + (r() - 0.5) * 20); cg.fill();
    }
    cg.fillStyle = 'rgba(240,222,192,0.32)'; cg.fillRect(0, 0, w, h);
    weather(cg, w, h, 61);
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


// Debris wall across the highway: jersey barriers, tyre stacks, sandbags, beams, boards.
function debrisWall(seed) {
  const g = new THREE.Group();
  const r = rng(seed);
  const concrete = std(0xbdb6aa, { roughness: 0.95 });
  const shape = new THREE.Shape();
  [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.12, 0.33], [0.08, 0.81], [-0.08, 0.81], [-0.12, 0.33], [-0.3, 0.08]]
    .forEach(([a, y], i) => (i ? shape.lineTo(a, y) : shape.moveTo(a, y)));
  const jersey = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }).translate(0, 0, -1.5).rotateY(Math.PI / 2);
  for (let k = 0; k < 8; k++) {
    const m = mesh(jersey, concrete, { pos: [-10.5 + k * 3.05 + (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.8] });
    m.rotation.y = (r() - 0.5) * 0.25;
    if (k === 2 || k === 6) { m.rotation.z = 0.25; m.position.y = 0.1; }
    g.add(m);
  }
  const tyre = std(0x1c1c1e, { roughness: 0.9 });
  for (const x of [-12.5, -4, 5.5, 12.6]) {
    const h = 3 + Math.floor(r() * 3);
    for (let k = 0; k < h; k++) g.add(mesh(new THREE.TorusGeometry(0.36, 0.14, 8, 18).rotateX(Math.PI / 2), tyre, { pos: [x + (r() - 0.5) * 0.15, 0.14 + k * 0.27, 1.0 + (r() - 0.5) * 0.15] }));
  }
  const sand = std(0xb39c76, { roughness: 1 });
  for (let k = 0; k < 26; k++) {
    const x = -12 + (k % 13) * 1.9 + (r() - 0.5) * 0.3, y = k < 13 ? 0.15 : 0.42;
    const b = mesh(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.7, 1), sand, { pos: [x, y, -1.0] });
    b.rotation.y = (r() - 0.5) * 0.3;
    g.add(b);
  }
  const beam = metal(0x6d5a4c, { roughness: 0.8 });
  for (const [x, ry, rz] of [[-2, 0.4, 0.18], [8, -0.3, 0.12]]) {
    const ib = new THREE.Group();
    ib.add(box(6, 0.04, 0.3, beam, { pos: [0, 0.3, 0] }), box(6, 0.04, 0.3, beam, { pos: [0, 0, 0] }), box(6, 0.3, 0.03, beam, { pos: [0, 0.15, 0] }));
    ib.position.set(x, 0.85, 0.2);
    ib.rotation.set(0, ry, rz);
    g.add(ib);
  }
  const b1 = barricade(); b1.position.set(-6.5, 0, 2.2); b1.rotation.y = 0.15; g.add(b1);
  const b2 = barricade(); b2.position.set(3.5, 0, 2.4); b2.rotation.y = -0.2; g.add(b2);
  return g;
}

function rrectPoints(hx, hz, rr, spacing) {
  const pts = [];
  const segs = [
    [[hx - rr, -hz], [-(hx - rr), -hz]], null, [[-hx, -(hz - rr)], [-hx, hz - rr]], null,
    [[-(hx - rr), hz], [hx - rr, hz]], null, [[hx, hz - rr], [hx, -(hz - rr)]], null,
  ];
  const corners = [[-(hx - rr), -(hz - rr), Math.PI * 1.5, Math.PI], [-(hx - rr), hz - rr, Math.PI, Math.PI / 2], [hx - rr, hz - rr, Math.PI / 2, 0], [hx - rr, -(hz - rr), 0, -Math.PI / 2]];
  let ci = 0;
  for (const s of segs) {
    if (s) {
      const [[x0, z0], [x1, z1]] = s;
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / spacing));
      for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    } else {
      const [cx, cz, a0, a1] = corners[ci++];
      const n = Math.max(2, Math.round((Math.abs(a1 - a0) * rr) / spacing));
      for (let k = 0; k < n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
    }
  }
  return pts;
}

export function buildStructures() {
  const group = new THREE.Group();
  group.name = 'structures';
  const colliders = [];
  const exclusions = [];
  const updaters = [];
  const r = rng(12);
  const atXZ = (x, z) => ({ x, z, y: terrainHeight(x, z) });

  // Gas station on the lakebed, fenced at the back and sides
  group.add(gasStation(colliders));
  const gasYaw = pointAt(GAS.i).yaw;
  for (const along of [-(GAS.halfLen + 3), GAS.halfLen + 3]) {
    const w = gasToWorld(along, 34);
    colliders.push({ type: 'box', x: w.x, z: w.z, yaw: gasYaw, hx: 14, hz: 0.25 });
  }
  { const w = gasToWorld(0, GAS.latOut + 1); colliders.push({ type: 'box', x: w.x, z: w.z, yaw: gasYaw, hx: 0.25, hz: GAS.halfLen + 3 }); }
  { const c = gasToWorld(0, 28); exclusions.push({ x: c.x, z: c.z, r: 46 }); }

  // Fences: both sides of the intro highway, then broken runs around the lakebed
  const posts = [], wires = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = I_BLOCK_BACK - 30; i < I_LAKE_IN - 6; i += 4) pts.push(pointAt(i, side * FENCE));
    fenceRun(pts, posts, wires, r);
  }
  const loop = [];
  const HL = GAS.halfLen + 3;
  const corners = [[-HL, 20], [-HL, GAS.latOut + 1], [HL, GAS.latOut + 1], [HL, 20]];
  for (let k = 0; k < 3; k++) {
    const [a0, l0] = corners[k], [a1, l1] = corners[k + 1];
    const n = Math.ceil(Math.hypot(a1 - a0, l1 - l0) / 4);
    for (let s = 0; s <= n; s++) { const t = s / n; loop.push(gasToWorld(a0 + (a1 - a0) * t, l0 + (l1 - l0) * t)); }
  }
  fenceRun(loop, posts, wires, r);
  const perim = rrectPoints(LAKE.hx + 14, LAKE.hz + 14, LAKE.r + 14, 4).map(([x, z]) => ({ x: x + LAKE.cx, z: z + LAKE.cz }));
  let run = 0, gap = 0;
  const lakeFence = perim.map((p) => {
    if (Math.abs(nearest(p.x, p.z).lat) < 16) return null;
    if (gap > 0) { gap--; return null; }
    if (++run > 6 + r() * 14) { run = 0; gap = 2 + Math.floor(r() * 9); }
    return p;
  });
  fenceRun(lakeFence, posts, wires, r);
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.07, 1.3, 6), std(0x6b5b4a, { roughness: 1 }), posts.length);
  const o = new THREE.Object3D();
  posts.forEach((p, k) => { o.position.set(p.x, p.y, p.z); o.rotation.set(p.rx, r() * 3, p.rz); o.scale.set(1, p.s, 1); o.updateMatrix(); postMesh.setMatrixAt(k, o.matrix); });
  postMesh.castShadow = true;
  postMesh.computeBoundingSphere();
  group.add(postMesh);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x3b3632 })));

  // Power line: down the left of the highway, then along the lakebed's far side
  const line = [];
  for (let i = idxForZ(-420); i < I_LAKE_IN - 10; i += Math.round(55 / STEP)) { const p = pointAt(i, -31); line.push([p.x, p.z]); }
  const sideX = LAKE.cx + LAKE.hx + 30;
  for (let z = LAKE.cz - LAKE.hz + 20; z < 900; z += 55) line.push([sideX + (z - LAKE.cz) * 0.05, z]);
  const pg = new THREE.Group();
  const poleM = std(0x6a5440, { roughness: 1 });
  const insul = std(0x6b3a22, { roughness: 0.35 });
  const pWires = [];
  let prevArm = null;
  line.forEach(([x, z], k) => {
    const nx = line[Math.min(line.length - 1, k + 1)], pv = line[Math.max(0, k - 1)];
    const yaw = Math.atan2(nx[0] - pv[0], nx[1] - pv[1]);
    const pole = new THREE.Group();
    pole.position.set(x, terrainHeight(x, z), z);
    pole.rotation.set((r() - 0.5) * 0.04, yaw, (r() - 0.5) * 0.04);
    pole.add(cyl(0.12, 0.16, 9.6, 8, poleM, { pos: [0, 4.8, 0] }));
    pole.add(box(2.4, 0.12, 0.12, poleM, { pos: [0, 8.9, 0] }));
    for (const sx of [-1, 1]) pole.add(tube([sx * 0.9, 8.9, 0], [0, 8.2, 0], 0.025, metal(), 4));
    for (const sx of [-1.05, -0.35, 1.05]) pole.add(cyl(0.05, 0.07, 0.18, 8, insul, { pos: [sx, 9.05, 0] }));
    if (k % 5 === 2) {
      pole.add(cyl(0.3, 0.3, 0.8, 12, metal(0x8e9396), { pos: [0, 7.4, 0.32] }));
      pole.add(cyl(0.32, 0.32, 0.05, 12, metal(0x6d7276), { pos: [0, 7.82, 0.32] }));
    }
    pg.add(pole);
    pole.updateMatrixWorld(true);
    const arm = [-1.05, -0.35, 1.05].map((sx) => new THREE.Vector3(sx, 9.14, 0).applyMatrix4(pole.matrixWorld));
    if (prevArm) {
      for (let w = 0; w < 3; w++) {
        let last = prevArm[w];
        for (let s = 1; s <= 10; s++) {
          const t = s / 10;
          const q = new THREE.Vector3().lerpVectors(prevArm[w], arm[w], t);
          q.y -= 4 * t * (1 - t);
          pWires.push(last.x, last.y, last.z, q.x, q.y, q.z);
          last = q;
        }
      }
    }
    prevArm = arm;
    exclusions.push({ x, z, r: 1.5 });
    if (Math.abs(nearest(x, z).lat) < 22 || terrainHeight(x, z) < 1) colliders.push({ type: 'circle', x, z, r: 0.2 });
  });
  bakeGroup(pg);
  group.add(pg);
  const pwGeo = new THREE.BufferGeometry();
  pwGeo.setAttribute('position', new THREE.Float32BufferAttribute(pWires, 3));
  group.add(new THREE.LineSegments(pwGeo, new THREE.LineBasicMaterial({ color: 0x2a2623 })));

  // Signs along the intro (numbers and symbols only)
  const sg = new THREE.Group();
  const iz = idxForZ;
  placeSign(sg, colliders, FACES.speed(65, 1), iz(25), 8.2, 0.9, 0.9);
  placeSign(sg, colliders, FACES.shield(66, 2), iz(70), 8.2, 0.85, 0.85);
  placeSign(sg, colliders, FACES.mile(12, 7), iz(95), -8.0, 0.32, 0.75, 0.8);
  placeSign(sg, colliders, FACES.fuel(false, 5), iz(120), 8.2, 0.95, 0.95);
  placeSign(sg, colliders, FACES.fuel(true, 6), iz(165), 8.2, 0.8, 0.8);
  placeSign(sg, colliders, FACES.bang(14), iz(190), -8.2, 0.95, 0.95);
  placeSign(sg, colliders, FACES.speed(45, 8), iz(-20), 8.2, 0.9, 0.9);
  bakeGroup(sg);
  group.add(sg);

  // Debris walls: behind the start and where the highway leaves the lakebed
  for (const [i, seed] of [[I_BLOCK_BACK, 3], [I_BLOCK_FAR + 2, 4]]) {
    const p = pointAt(i);
    const w = debrisWall(seed);
    w.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    w.rotation.y = p.yaw;
    bakeGroup(w);
    group.add(w);
    colliders.push({ type: 'box', x: p.x, z: p.z, yaw: p.yaw, hx: 13.5, hz: 1.6 });
    exclusions.push({ x: p.x, z: p.z, r: 16 });
  }

  // Ranch windpump + shed, water tower, billboard: the loose ring around the arena
  const put = (obj, x, z, yaw, excl) => {
    obj.position.set(x, terrainHeight(x, z) - 0.05, z);
    obj.rotation.y = yaw;
    group.add(obj);
    exclusions.push({ x, z, r: excl });
  };
  const wp = windpump();
  put(wp.g, LAKE.cx - LAKE.hx - 34, LAKE.cz + 30, 0.9, 6);
  updaters.push((dt) => { wp.rotor.rotation.z -= dt * 2.2; });
  bakeGroup(wp.g, { skip: (obj) => obj.name === 'rotor' });
  colliders.push({ type: 'circle', x: LAKE.cx - LAKE.hx - 34, z: LAKE.cz + 30, r: 1.8 });
  const sh = shed();
  bakeGroup(sh);
  put(sh, LAKE.cx - LAKE.hx - 46, LAKE.cz + 46, 0.3, 6);
  colliders.push({ type: 'box', x: LAKE.cx - LAKE.hx - 46, z: LAKE.cz + 46, yaw: 0.3, hx: 3.2, hz: 2.4 });
  const wt = waterTower();
  bakeGroup(wt);
  const wtx = LAKE.cx + LAKE.hx + 2, wtz = LAKE.cz + LAKE.hz - 18;
  put(wt, wtx, wtz, 0.4, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + 0.4;
    colliders.push({ type: 'circle', x: wtx + Math.cos(a) * 3.3, z: wtz - Math.sin(a) * 3.3, r: 0.3 });
  }
  const bb = billboard();
  bakeGroup(bb);
  const bp = pointAt(idxForZ(110), -32);
  put(bb, bp.x, bp.z, bp.yaw + Math.PI + 0.45, 7);

  void atXZ;
  return { group, colliders, exclusions, update: (dt) => updaters.forEach((f) => f(dt)) };
}
