import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, rng } from './noise.js';
import { S, LAKE, GAS, ROAD_BEVEL, I_BLOCK_BACK, I_BLOCK_FAR, gasLocal, nearest, openDist, lakeSD } from './track.js';
import { terrainHeight } from './terrain.js';

// Sonoran-style scatter: creosote bushes, dry grass, saguaros, ocotillo, rocks,
// boulders ringing the arena, and far mesas on the horizon.

const vcMat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, ...o });

function displace(geo, amp, freq, seed) {
  const n = makeNoise2D(seed);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * n(x * freq + z * 0.73 * freq, y * freq + z * 0.31 * freq);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function colorize(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function bushGeo() {
  const r = rng(3);
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const g = new THREE.IcosahedronGeometry(0.2 + r() * 0.16, 0);
    g.scale(1, 0.8 + r() * 0.5, 1);
    const a = r() * Math.PI * 2, d = r() * 0.45;
    g.translate(Math.cos(a) * d, 0.22 + r() * 0.5 - d * 0.3, Math.sin(a) * d);
    parts.push(g);
  }
  const g = displace(mergeGeometries(parts), 0.2, 2.4, 9);
  const lo = new THREE.Color('#3f4626'), hi = new THREE.Color('#8a9150');
  return colorize(g, (c, x, y) => c.copy(lo).lerp(hi, Math.min(1, y / 1.0)));
}

function grassGeo() {
  const r = rng(5);
  const pos = [], col = [];
  const base = new THREE.Color('#8a6a3c'), tip = new THREE.Color('#e0bf7c');
  for (let k = 0; k < 12; k++) {
    const a = r() * Math.PI * 2, lean = 0.15 + r() * 0.35, h = 0.35 + r() * 0.4, w = 0.03;
    const ox = (r() - 0.5) * 0.15, oz = (r() - 0.5) * 0.15;
    const px = Math.cos(a + Math.PI / 2) * w, pz = Math.sin(a + Math.PI / 2) * w;
    pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean * h, h, oz + Math.sin(a) * lean * h);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function ribbed(geo, ribs = 14, depth = 0.08) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + depth * Math.cos(ribs * Math.atan2(z, x));
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  return geo;
}

function saguaroGeo(arms, seed) {
  const r = rng(seed);
  const h = 5;
  const parts = [
    ribbed(new THREE.CylinderGeometry(0.28, 0.32, h, 14, 8, true).translate(0, h / 2, 0)),
    ribbed(new THREE.SphereGeometry(0.28, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h, 0)),
  ];
  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2 + r() * 1.2;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const y0 = 1.6 + r() * 1.3, out = 0.75 + r() * 0.3, up = 1.2 + r() * 1.3;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * 0.15, y0, dz * 0.15), new THREE.Vector3(dx * out * 0.75, y0 + 0.05, dz * out * 0.75),
      new THREE.Vector3(dx * out, y0 + 0.45, dz * out), new THREE.Vector3(dx * out, y0 + up, dz * out),
    ]);
    parts.push(new THREE.TubeGeometry(path, 12, 0.19, 10, false));
    parts.push(new THREE.SphereGeometry(0.19, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(dx * out, y0 + up, dz * out));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  const dark = new THREE.Color('#3f5a31'), light = new THREE.Color('#6f8d4f');
  return colorize(g, (c, x, y, z) => c.copy(dark).lerp(light, 0.5 + 0.5 * Math.cos(14 * Math.atan2(z, x))).multiplyScalar(0.85 + 0.15 * Math.min(1, y / 5)));
}

function ocotilloGeo() {
  const r = rng(8);
  const parts = [];
  for (let k = 0; k < 11; k++) {
    const a = r() * Math.PI * 2, spread = 0.35 + r() * 0.5, h = 2.4 + r() * 1.6;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06),
      new THREE.Vector3(Math.cos(a) * spread * 0.4, h * 0.4, Math.sin(a) * spread * 0.4),
      new THREE.Vector3(Math.cos(a) * spread, h, Math.sin(a) * spread),
    ]);
    parts.push(new THREE.TubeGeometry(path, 8, 0.03, 5, false));
    parts.push(new THREE.ConeGeometry(0.045, 0.22, 5).translate(Math.cos(a) * spread, h + 0.1, Math.sin(a) * spread));
  }
  const g = mergeGeometries(parts);
  const stem = new THREE.Color('#5f6844'), tip = new THREE.Color('#c0402a');
  return colorize(g, (c, x, y) => c.copy(stem).lerp(tip, y > 2.6 ? Math.min(1, (y - 2.6) * 1.2) * 0.25 : 0));
}

function rockGeo(detail, seed, amp) {
  const g = displace(new THREE.DodecahedronGeometry(1, detail), amp, 1.3, seed);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.2, 0);
  const n = makeNoise2D(seed + 1);
  const a = new THREE.Color('#7f4b31'), b = new THREE.Color('#b0754c'), top = new THREE.Color('#c99466');
  return colorize(g, (c, x, y, z) => {
    c.copy(a).lerp(b, 0.5 + 0.5 * n(x * 1.5, z * 1.5));
    if (y > 0.5) c.lerp(top, 0.35);
    if (y < 0.05) c.multiplyScalar(0.7);
  });
}

function mesaGeo(seed) {
  const r = rng(seed);
  const parts = [
    new THREE.CylinderGeometry(0.78, 1, 1, 11, 5).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(1.05, 1.7, 0.4, 11, 2).translate(0, 0.2, 0),
  ];
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  const p = g.attributes.position;
  const n = makeNoise2D(seed);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.18 * n(Math.cos(a) * 2 + seed, y * 3) + 0.06 * r();
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  const rockA = new THREE.Color('#a4583a'), rockB = new THREE.Color('#c98a5e'), band = new THREE.Color('#7c4330');
  return colorize(g, (c, x, y) => {
    c.copy(rockA).lerp(rockB, 0.5 + 0.5 * Math.sin(y * 22));
    if (Math.sin(y * 9 + 1) > 0.85) c.lerp(band, 0.6);
  });
}

function instanced(geo, mat, list, shadows = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const o = new THREE.Object3D();
  list.forEach((t, k) => {
    o.position.set(t.x, t.y, t.z);
    o.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    o.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
  });
  m.count = list.length;
  m.castShadow = shadows;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}


// Layered sandstone butte: talus skirt, 2-4 near-vertical tiers with ledges, flat cap.
// Built as flat-shaded triangle soup in world space; colours follow the strata.
function butte(out, cx, cy, cz, R, Hh, seed, spire = false) {
  const r = rng(seed);
  const sides = spire ? 6 + Math.floor(r() * 2) : 7 + Math.floor(r() * 4);
  const ang = [], rad = [];
  for (let k = 0; k < sides; k++) { ang.push(((k + (r() - 0.5) * 0.5) / sides) * Math.PI * 2); rad.push(0.72 + r() * 0.42); }
  const ring = (y, s, jit = 0) => ang.map((a, k) => [cx + Math.cos(a) * R * s * rad[k] * (1 + (r() - 0.5) * jit), cy + y, cz + Math.sin(a) * R * s * rad[k] * (1 + (r() - 0.5) * jit)]);
  const pal = ['#b4603c', '#cf8a5c', '#9b4a2f', '#ddb07c', '#b8673f', '#8b442c'].map((h) => new THREE.Color(h));
  const cap = new THREE.Color('#d9a26c');
  const talus = new THREE.Color('#bf7b4f');
  const tri = (a, b, c, col) => {
    out.pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) out.col.push(col.r, col.g, col.b);
  };
  const band = (lo, hi, col, shade = 1) => {
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      const c = col.clone().multiplyScalar(shade * (0.92 + r() * 0.12));
      tri(lo[k], hi[k], hi[j], c);
      tri(lo[k], hi[j], lo[j], c);
    }
  };
  const base = -4;
  const footH = spire ? 0.12 * Hh : 0.24 * Hh;
  let lo = ring(base, spire ? 1.5 : 1.75, 0.15);
  let hi = ring(footH, 1.04, 0.05);
  band(lo, hi, talus);
  const tiers = spire ? 3 : 2 + Math.floor(r() * 3);
  let y = footH, s = 1.0;
  for (let t = 0; t < tiers; t++) {
    const h = ((Hh - footH) / tiers) * (0.8 + r() * 0.4);
    const sub = 2 + Math.floor(r() * 2);
    for (let b = 0; b < sub; b++) {
      const y1 = y + h / sub;
      const loR = ring(y, s), hiR = ring(y1, s * (0.97 - r() * 0.02));
      band(loR, hiR, pal[Math.floor(r() * pal.length)]);
      y = y1;
      s *= 0.97;
    }
    if (t < tiers - 1) { // ledge stepping inward
      const inset = spire ? 0.82 : 0.78 + r() * 0.12;
      const a = ring(y, s), b = ring(y, s * inset);
      band(a, b, cap, 1.05);
      // short talus slope on the ledge
      const c2 = ring(y + h * 0.08, s * inset * 0.98);
      band(b, c2, talus, 0.95);
      y += h * 0.08;
      s *= inset * 0.98;
    }
  }
  const top = ring(y, s);
  const centre = [cx, cy + y + (spire ? 0.6 : 0.2), cz];
  for (let k = 0; k < sides; k++) tri(top[k], centre, top[(k + 1) % sides], cap);
}

export function buildProps(exclusions = []) {
  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];
  const r = rng(2026);
  const BX = 520, Z0 = -260, Z1 = 820;

  const info = (x, z) => {
    const n = nearest(x, z);
    const D = openDist(x, z, n);
    return { n, D, lake: lakeSD(x, z) };
  };
  const blocked = (x, z, n, pad) => {
    if (Math.abs(n.lat) < ROAD_BEVEL + 1.0 + pad) return true;
    const g = gasLocal(x, z);
    if (g.lat > 3 && g.lat < GAS.latOut + 3 && Math.abs(g.along) < GAS.halfLen + 5) return true;
    for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + pad) return true;
    return false;
  };
  // density(D, lake) -> keep probability
  const scatter = (count, box, density, pad = 0) => {
    const out = [];
    for (let k = 0; k < count * 6 && out.length < count; k++) {
      const x = (r() - 0.5) * 2 * box.x, z = box.z0 + r() * (box.z1 - box.z0);
      const it = info(x, z);
      if (blocked(x, z, it.n, pad)) continue;
      if (r() > density(it.D, it.lake, it.n)) continue;
      out.push({ x, z, y: terrainHeight(x, z), D: it.D, lake: it.lake });
    }
    return out;
  };
  const WIDE = { x: BX, z0: Z0, z1: Z1 };
  const NEAR = { x: 230, z0: -120, z1: 560 };
  const edgeLoving = (D, lake) => (lake < -10 ? 0.025 : D < 0 ? 0.55 : D < 50 ? 1 : 0.45);

  // Creosote
  const bushes = scatter(2300, WIDE, edgeLoving).map((p) => ({ ...p, y: p.y - 0.08, ry: r() * 6.3, s: 0.55 + r() * 0.75, sy: 0.6 + r() * 0.6 }));
  bushes.forEach((b) => { b.sx = b.s; b.sz = b.s * (0.8 + r() * 0.4); });
  group.add(instanced(bushGeo(), vcMat(), bushes));

  // Dry grass, hugging the highway and the shoreline
  const tufts = scatter(4800, NEAR, (D, lake) => (lake < -14 ? 0.02 : D < 0 ? 0.8 : D < 25 ? 0.9 : 0.25), -0.7)
    .map((p) => ({ ...p, ry: r() * 6.3, s: 0.7 + r() * 0.9 }));
  group.add(instanced(grassGeo(), vcMat({ flatShading: false, side: THREE.DoubleSide }), tufts, false));

  // Saguaros: on the benches outside, a few on the drivable flats as obstacles
  const sagMat = vcMat({ flatShading: false });
  const sag = [[], [], []];
  for (const p of scatter(220, WIDE, (D) => (D < 4 ? 0 : D < 80 ? 0.9 : 0.4), 2)) sag[Math.floor(r() * 3)].push({ ...p, y: p.y - 0.1, ry: r() * 6.3, s: 0.75 + r() * 0.55 });
  for (const p of scatter(18, NEAR, (D, lake) => (D < -4 && lake > -40 ? 1 : 0), 3)) {
    sag[1 + Math.floor(r() * 2)].push({ ...p, y: p.y - 0.1, ry: r() * 6.3, s: 0.8 + r() * 0.3 });
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.42 });
  }
  sag.forEach((list, k) => group.add(instanced(saguaroGeo(k, 20 + k), sagMat, list)));

  // Ocotillo
  const oco = scatter(150, WIDE, (D) => (D < 2 ? 0.15 : D < 70 ? 1 : 0.3), 1).map((p) => ({ ...p, ry: r() * 6.3, s: 0.7 + r() * 0.5 }));
  group.add(instanced(ocotilloGeo(), vcMat({ flatShading: false }), oco));
  for (const p of oco) if (p.D < 0) colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.35 });

  // Rocks
  const pebbles = scatter(1800, NEAR, (D, lake) => (lake < -12 ? 0.08 : 1), -0.6).map((p) => ({ ...p, y: p.y - 0.05, ry: r() * 6.3, rx: (r() - 0.5) * 0.4, s: 0.12 + r() * 0.3 }));
  group.add(instanced(rockGeo(0, 31, 0.25), vcMat(), pebbles, false));
  const mids = scatter(520, WIDE, (D) => (D < 3 ? 0 : 1)).map((p) => ({ ...p, y: p.y - 0.2, ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 0.6 + r() * 1.6 }));
  group.add(instanced(rockGeo(1, 41, 0.3), vcMat(), mids));

  // Geometric outcrops on the lakebed: cover and things to slide around
  const crag = new THREE.DodecahedronGeometry(1, 0);
  crag.scale(1, 0.75, 1);
  const cragGeo = colorize(crag.toNonIndexed(), (c, x, y) => c.set(y > 0.3 ? '#c98a5c' : '#a65a38'));
  const outcrops = [];
  for (const [cx, cz] of [[-62, 300], [58, 372], [-40, 410], [70, 262]]) {
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 12, z = cz + (r() - 0.5) * 12, s = 1.6 + r() * 2.6;
      outcrops.push({ x, y: terrainHeight(x, z) - s * 0.25, z, ry: r() * 6.3, rx: (r() - 0.5) * 0.4, rz: (r() - 0.5) * 0.4, s });
      colliders.push({ type: 'circle', x, z, r: s * 0.85 });
    }
  }
  group.add(instanced(cragGeo, vcMat(), outcrops));

  // Sandstone buttes and spires ringing the arena
  const soup = { pos: [], col: [] };
  const placed = [];
  const tryButte = (minD, maxD, R0, R1, H0, H1, spire, tries) => {
    for (let k = 0; k < tries; k++) {
      const a = r() * Math.PI * 2, dist = LAKE.hx + 20 + r() * 380;
      const x = LAKE.cx + Math.cos(a) * dist * 1.1, z = LAKE.cz + Math.sin(a) * dist;
      const n = nearest(x, z);
      const D = openDist(x, z, n);
      const R = R0 + r() * (R1 - R0);
      if (D < minD + R || D > maxD) continue;
      if (Math.abs(n.lat) < R * 1.8 + 14) continue; // keep the highway cuts clear
      if (n.i < I_BLOCK_BACK - 60 && Math.abs(n.lat) < 80) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (p.R + R) * 1.6)) continue;
      if (exclusions.some((e) => Math.hypot(e.x - x, e.z - z) < e.r + R * 1.8)) continue;
      let gy = Infinity;
      for (let q = 0; q < 8; q++) { const qa = (q / 8) * Math.PI * 2; gy = Math.min(gy, terrainHeight(x + Math.cos(qa) * R, z + Math.sin(qa) * R)); }
      butte(soup, x, gy, z, R, H0 + r() * (H1 - H0), Math.floor(r() * 1e6), spire);
      placed.push({ x, z, R });
      return;
    }
  };
  for (let k = 0; k < 14; k++) tryButte(14, 160, 14, 38, 22, 52, false, 60);
  for (let k = 0; k < 9; k++) tryButte(8, 120, 3.5, 7, 14, 30, true, 60);
  for (let k = 0; k < 8; k++) tryButte(160, 420, 40, 80, 40, 80, false, 60);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(soup.pos, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(soup.col, 3));
  bg.computeVertexNormals();
  const buttes = new THREE.Mesh(bg, vcMat({ side: THREE.DoubleSide }));
  buttes.castShadow = buttes.receiveShadow = true;
  group.add(buttes);
  for (const p of placed) if (openDist(p.x, p.z) < p.R + 4) colliders.push({ type: 'circle', x: p.x, z: p.z, r: p.R * 0.9 });

  // Distant mesas on the horizon
  const mesas = [];
  const mr = rng(88);
  const clear = (x, z, rad) => {
    for (let i = 0; i < S.count; i += 20) if (Math.hypot(x - S.px[i], z - S.pz[i]) < rad * 1.8 + 420) return false;
    return Math.hypot(x - LAKE.cx, z - LAKE.cz) > rad * 1.8 + 520;
  };
  for (let tries = 0; mesas.length < 14 && tries < 300; tries++) {
    const a = mr() * Math.PI * 2;
    const dist = 750 + mr() * 500;
    const x = LAKE.cx + Math.cos(a) * dist, z = LAKE.cz + Math.sin(a) * dist * 1.1;
    const rad = 70 + mr() * 120, h = 45 + mr() * 70;
    if (!clear(x, z, rad)) continue;
    mesas.push({ x, y: terrainHeight(x, z) - 12, z, sx: rad * (0.8 + mr() * 0.6), sy: h, sz: rad, ry: mr() * 6.3 });
  }
  group.add(instanced(mesaGeo(5), vcMat(), mesas, false));

  const disc = new THREE.Mesh(new THREE.CircleGeometry(4000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd49a62, roughness: 1 }));
  disc.position.set(0, -14, 330);
  group.add(disc);

  void I_BLOCK_FAR;
  return { group, colliders };
}
