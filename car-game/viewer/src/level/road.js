import * as THREE from 'three';
import { S, STEP, I_END, I_FINISH, I_MERGE, ROAD_HALF, ROAD_BEVEL, LANE, RAILS, RAIL_LAT, SIDE, pointAt } from './track.js';
import { rng } from './noise.js';
import { terrainHeight } from './terrain.js';
import { smoothstep } from './noise.js';

// Two-lane desert highway: crowned asphalt ribbon with a painted 64 m texture
// (wheel paths, patches, thermal cracks, tar snakes, worn lines, rumble strips,
// sand drifting onto the shoulders), W-beam guardrails and delineator posts.

const TEX_LEN = 64;
const LATS = [-ROAD_BEVEL, -ROAD_HALF, -LANE, 0, LANE, ROAD_HALF, ROAD_BEVEL];
const DY = [-0.08, 0.05, 0.1, 0.13, 0.1, 0.05, -0.08];

// Surface height above the centre-line elevation at |lat|.
export function roadSurfaceY(lat) {
  const a = Math.abs(lat);
  for (let j = 3; j < LATS.length - 1; j++) {
    if (a <= LATS[j + 1]) return DY[j] + ((DY[j + 1] - DY[j]) * (a - LATS[j])) / (LATS[j + 1] - LATS[j]);
  }
  return DY[DY.length - 1];
}

export function buildRoad() {
  const group = new THREE.Group();
  group.name = 'road';

  const rows = I_END + 1;
  const m = LATS.length;
  const pos = new Float32Array(rows * m * 3);
  const uv = new Float32Array(rows * m * 2);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < m; j++) {
      const p = pointAt(i, LATS[j]);
      const k = i * m + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = S.y[i] + DY[j]; pos[k * 3 + 2] = p.z;
      uv[k * 2] = (LATS[j] + ROAD_BEVEL) / (2 * ROAD_BEVEL);
      uv[k * 2 + 1] = (i * STEP) / TEX_LEN;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paintRoad(), roughness: 0.93, metalness: 0 }));
  road.receiveShadow = true;
  group.add(road);

  const railMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
  const posts = [];
  for (const rail of RAILS) {
    group.add(railMesh(rail, railMat));
    for (let i = rail.i0; i <= rail.i1; i += 2) {
      const p = pointAt(i, rail.side * (RAIL_LAT + 0.22));
      posts.push({ x: p.x, y: terrainHeight(p.x, p.z) + 0.33, z: p.z, yaw: p.yaw });
    }
  }
  group.add(instances(new THREE.BoxGeometry(0.1, 0.86, 0.16), new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.6, metalness: 0.6 }), posts));

  // Delineators: white reflectors on the right, amber on the left.
  const dPosts = [], dWhite = [], dAmber = [];
  for (let i = 40; i < I_FINISH - 20; i += Math.round(50 / STEP)) {
    for (const side of [-1, 1]) {
      if (RAILS.some((r) => r.side === side && i >= r.i0 - 8 && i <= r.i1 + 8)) continue;
      if (side === 1 && Math.abs(i - I_MERGE) * STEP < 40) continue;
      const p = pointAt(i, side * (ROAD_BEVEL + 1.1));
      const y = terrainHeight(p.x, p.z);
      dPosts.push({ x: p.x, y: y + 0.55, z: p.z, yaw: p.yaw });
      const q = pointAt(i, side * (ROAD_BEVEL + 1.1));
      (side === 1 ? dWhite : dAmber).push({ x: q.x - Math.sin(p.yaw) * 0.025, y: y + 0.95, z: q.z - Math.cos(p.yaw) * 0.025, yaw: p.yaw });
    }
  }
  group.add(instances(new THREE.BoxGeometry(0.09, 1.1, 0.04), new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.6 }), dPosts));
  group.add(instances(new THREE.BoxGeometry(0.07, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x777777, roughness: 0.2, metalness: 0.4 }), dWhite));
  group.add(instances(new THREE.BoxGeometry(0.07, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: 0xf2a21b, emissive: 0x6b3d00, roughness: 0.2, metalness: 0.4 }), dAmber));
  group.add(sideRoad());
  return group;
}

function instances(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const o = new THREE.Object3D();
  list.forEach((t, k) => {
    o.position.set(t.x, t.y, t.z);
    o.rotation.set(0, t.yaw, 0);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
  });
  m.count = list.length;
  m.castShadow = true;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

// W-beam rail lofted along the road; ends turn down into the ground.
function railMesh({ side, i0, i1 }, mat) {
  const prof = [[0.0, 0.47], [0.06, 0.52], [0.015, 0.585], [0.06, 0.65], [0.0, 0.705], [0.0, 0.725]];
  const n = i1 - i0 + 1;
  const m = prof.length;
  const pos = [], col = [], idx = [];
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const hf = smoothstep(0, 6, Math.min(k, n - 1 - k));
    const base = pointAt(i, side * RAIL_LAT);
    const gy = terrainHeight(base.x, base.z);
    const dirt = 0.82 + 0.18 * Math.sin(k * 0.37) * Math.sin(k * 0.11);
    const rusty = Math.sin(k * 0.21 + side) > 0.8;
    for (const [inset, h] of prof) {
      const p = pointAt(i, side * (RAIL_LAT - inset * hf));
      pos.push(p.x, gy + h * hf - (1 - hf) * 0.05, p.z);
      if (rusty && h < 0.6) col.push(0.45, 0.3, 0.2);
      else col.push(0.62 * dirt, 0.64 * dirt, 0.66 * dirt);
    }
  }
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < m - 1; j++) {
      const a = k * m + j, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function paintRoad() {
  const W = 1024, H = 4096;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = lcg(7);
  const X = (lat) => ((lat + ROAD_BEVEL) / (2 * ROAD_BEVEL)) * W;
  const PX = W / (2 * ROAD_BEVEL);
  const PY = H / TEX_LEN;

  // Aggregate: grey base with light stones and dark pits
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let p = 0, n = W * H; p < n; p++) {
    let v = 80 + (r() - 0.5) * 20;
    const k = r();
    if (k < 0.035) v += 38;
    else if (k < 0.06) v -= 24;
    const o = p * 4;
    d[o] = v + 3; d[o + 1] = v + 1; d[o + 2] = v - 2; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const wrapY = (y, rad, fn) => { fn(y); if (y < rad) fn(y + H); if (y > H - rad) fn(y - H); };

  // Sun-bleached and oily blotches
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 30 + r() * 110, light = r() < 0.55, a = 0.02 + r() * 0.035;
    wrapY(y, rad, (yy) => {
      const gr = g.createRadialGradient(x, yy, 0, x, yy, rad);
      gr.addColorStop(0, light ? `rgba(160,150,138,${a})` : `rgba(20,20,22,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, yy - rad, rad * 2, rad * 2);
    });
  }
  // Polished wheel paths and the oil strip down each lane
  for (const lane of [-1.85, 1.85]) {
    for (const off of [-0.85, 0.85]) {
      const x0 = X(lane + off);
      for (let y = 0; y < H; y += 8) {
        g.fillStyle = `rgba(28,26,25,${0.06 + r() * 0.06})`;
        g.fillRect(x0 - 0.35 * PX + (r() - 0.5) * 6, y, 0.7 * PX, 9);
      }
    }
    for (let y = 0; y < H; y += 6) {
      g.fillStyle = `rgba(16,16,16,${0.03 + r() * 0.07})`;
      g.fillRect(X(lane) - 0.25 * PX + (r() - 0.5) * 10, y, 0.5 * PX, 7);
    }
    for (let i = 0; i < 40; i++) {
      const x = X(lane + (r() - 0.5) * 0.6), y = 60 + r() * (H - 120), rad = 6 + r() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(10,10,10,0.35)');
      gr.addColorStop(1, 'rgba(10,10,10,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // Patches of newer asphalt
  for (let i = 0; i < 7; i++) {
    const x = X(-5.5 + r() * 8.5), y = 200 + r() * (H - 700);
    const pw = (1.2 + r() * 3) * PX, ph = (1.5 + r() * 5) * PY;
    g.fillStyle = 'rgba(40,39,40,0.75)';
    g.fillRect(x, y, pw, ph);
    for (let k = 0; k < (pw * ph) / 25; k++) {
      g.fillStyle = r() < 0.5 ? `rgba(95,92,90,${r() * 0.35})` : `rgba(15,15,15,${r() * 0.35})`;
      g.fillRect(x + r() * pw, y + r() * ph, 2, 2);
    }
    g.strokeStyle = 'rgba(14,14,14,0.75)';
    g.lineWidth = 2;
    g.strokeRect(x, y, pw, ph);
  }
  // Paint: double yellow centre, white edge lines, then wear them down
  const stripes = [[-0.23, -0.11, '#d4a020'], [0.11, 0.23, '#d4a020'], [-3.78, -3.63, '#e2ddd2'], [3.63, 3.78, '#e2ddd2']];
  for (const [a, b, colr] of stripes) {
    g.fillStyle = colr;
    g.fillRect(X(a), 0, X(b) - X(a), H);
  }
  for (const [a, b] of stripes) {
    const x0 = X(a), w = X(b) - X(a);
    for (let k = 0; k < (H * w) / 6; k++) {
      const v = 70 + r() * 25;
      g.fillStyle = `rgba(${v + 3},${v + 1},${v - 2},${0.45 + r() * 0.55})`;
      g.fillRect(x0 + r() * w, r() * H, 1 + r() * 3, 1 + r() * 3);
    }
    for (let k = 0; k < 16; k++) {
      g.fillStyle = 'rgba(80,78,75,0.8)';
      g.fillRect(x0 - 1, r() * H, w + 2, 10 + r() * 90);
    }
  }
  // Rumble strips milled into the shoulders
  for (const side of [-1, 1]) {
    const xc = X(side * 4.25);
    for (let y = 0; y < H; y += 0.3 * PY) {
      g.fillStyle = 'rgba(22,22,22,0.5)';
      g.beginPath();
      g.ellipse(xc, y, 0.2 * PX, 0.06 * PY, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(150,145,138,0.22)';
      g.fillRect(xc - 0.2 * PX, y + 0.06 * PY, 0.4 * PX, 1.5);
    }
  }
  // Cracks: thermal transverse cracks (some sealed with tar), longitudinal joints, alligator patches
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const jitter = (x0, y0, x1, y1, steps, amp) => {
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      pts.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]);
    }
    return pts;
  };
  const crack = (pts, w, tar) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (tar) { g.strokeStyle = 'rgba(14,14,15,0.88)'; g.lineWidth = w + 7; poly(pts); }
    g.strokeStyle = 'rgba(10,10,10,0.92)';
    g.lineWidth = w;
    poly(pts);
  };
  for (let s = 4 + r() * 5; s < TEX_LEN - 3; s += 8 + r() * 9) {
    const y = s * PY, drift = (r() - 0.5) * 40;
    const pts = jitter(X(-6.3), y, X(6.3), y + drift, 40, 10);
    crack(pts, 1.6 + r(), r() < 0.5);
    for (let b = 0; b < 3; b++) {
      const [bx, by] = pts[Math.floor(r() * pts.length)];
      crack(jitter(bx, by, bx + (r() - 0.5) * 120, by + (r() - 0.5) * 140, 8, 8), 1.2, false);
    }
  }
  for (const lat of [-0.5, 0.45, -3.95, 3.95]) {
    for (let s = r() * 6; s < TEX_LEN - 2; s += 6 + r() * 10) {
      const len = 3 + r() * 10;
      if (s + len > TEX_LEN - 1) break;
      crack(jitter(X(lat), s * PY, X(lat + (r() - 0.5) * 0.3), (s + len) * PY, 30, 8), 1.4, r() < 0.4);
      s += len;
    }
  }
  for (let a = 0; a < 4; a++) {
    const cx = X([-2.7, -1.0, 1.0, 2.7][a]), cy = (8 + r() * (TEX_LEN - 16)) * PY;
    let x = cx, y = cy;
    g.strokeStyle = 'rgba(12,12,12,0.85)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 120; k++) {
      const nx = cx + (r() - 0.5) * 1.6 * PX, ny = cy + (r() - 0.5) * 3 * PY;
      if (r() < 0.6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (nx - x) * 0.25, y + (ny - y) * 0.25); g.stroke(); }
      x = nx; y = ny;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 26, y + (r() - 0.5) * 26); g.stroke();
    }
  }
  // Sand blown over the shoulders, crumbling outer edge
  for (const side of [-1, 1]) {
    const gr = g.createLinearGradient(X(side * 4.5), 0, X(side * ROAD_BEVEL), 0);
    gr.addColorStop(0, 'rgba(198,160,114,0)');
    gr.addColorStop(1, 'rgba(198,160,114,0.6)');
    g.fillStyle = gr;
    g.fillRect(Math.min(X(side * 4.5), X(side * ROAD_BEVEL)), 0, Math.abs(X(side * ROAD_BEVEL) - X(side * 4.5)), H);
    for (let k = 0; k < 140; k++) {
      const lat = side * (5.0 + r() * 1.6), y = r() * H;
      g.fillStyle = `rgba(${200 + r() * 20},${160 + r() * 20},${112 + r() * 20},${0.12 + r() * 0.22})`;
      g.beginPath();
      g.ellipse(X(lat), y, (0.12 + r() * 0.35) * PX, (1.5 + r() * 6) * PY, (r() - 0.5) * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    for (let y = 0; y < H; y += 4) {
      const lat = side * (6.0 + r() * 0.6);
      g.fillStyle = r() < 0.6 ? 'rgba(196,158,112,0.85)' : 'rgba(60,58,56,0.8)';
      g.fillRect(X(lat) - 4, y, 4 + r() * 10, 3 + r() * 6);
    }
  }
  for (let k = 0; k < 30; k++) {
    const y = r() * H, len = (2 + r() * 6) * PY;
    const x0 = X(-5 + r() * 10);
    g.fillStyle = 'rgba(205,170,125,0.12)';
    g.beginPath();
    g.ellipse(x0, y, (1 + r() * 3) * PX, len / 2, 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(214,190,160,0.05)';
  g.fillRect(0, 0, W, H);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// Dirt side road ribbon draped over the terrain, fading into the highway shoulder.
function sideRoad() {
  const n = SIDE.count;
  const lats = [-SIDE.halfW - 1.2, -SIDE.halfW, 0, SIDE.halfW, SIDE.halfW + 1.2];
  const pos = [], uv = [], col = [], idx = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = SIDE.px[b] - SIDE.px[a], tz = SIDE.pz[b] - SIDE.pz[a];
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    if (i > 0) along += Math.hypot(SIDE.px[i] - SIDE.px[i - 1], SIDE.pz[i] - SIDE.pz[i - 1]);
    const fade = Math.min(1, (n - 1 - i) / 6);
    lats.forEach((lat, j) => {
      const x = SIDE.px[i] - tz * lat, z = SIDE.pz[i] + tx * lat;
      pos.push(x, terrainHeight(x, z) + 0.05 + (j === 0 || j === 4 ? -0.04 : 0), z);
      uv.push(j / 4, along / 24);
      col.push(1, 1, 1, (j === 0 || j === 4 ? 0 : 1) * (0.3 + 0.7 * fade));
    });
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < 4; j++) {
    const a = i * 5 + j, b = a + 1, c = a + 5, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 1024;
    const g = c.getContext('2d');
    const r = rng(19);
    g.fillStyle = '#b48c62'; g.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 30000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(90,66,44,${r() * 0.25})` : `rgba(230,200,160,${r() * 0.2})`; g.fillRect(r() * 256, r() * 1024, 2 + r() * 3, 2 + r() * 3); }
    for (const x of [78, 178]) for (let y = 0; y < 1024; y += 3) { g.fillStyle = `rgba(80,58,38,${0.12 + r() * 0.12})`; g.fillRect(x - 14 + (r() - 0.5) * 6, y, 28, 4); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,96,70,${0.4 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * 256, r() * 1024, 2 + r() * 4, 2 + r() * 3, 0, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}
