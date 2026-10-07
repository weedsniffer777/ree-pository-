import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise2D, rng } from './noise.js';
import { S, I_ARENA, ARENA, GAS, ROAD_BEVEL, FENCE, idxForZ, pointAt, gasLocal, nearest } from './track.js';
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

export function buildProps(exclusions = []) {
  const group = new THREE.Group();
  group.name = 'props';
  const colliders = [];
  const r = rng(2026);
  const I0 = idxForZ(-260);
  const I1 = Math.min(S.count - 1, I_ARENA + 150);

  const sample = (latMax, power, latMin = ROAD_BEVEL + 1.4) => {
    const i = I0 + Math.floor(r() * (I1 - I0));
    const side = r() < 0.5 ? -1 : 1;
    const lat = side * (latMin + Math.pow(r(), power) * (latMax - latMin));
    const p = pointAt(i, lat);
    return { x: p.x + (r() - 0.5) * 2, z: p.z + (r() - 0.5) * 2, i };
  };
  const blocked = (pt, pad = 0, roadPad = 1.2) => {
    const g = gasLocal(pt.x, pt.z);
    if (g.lat > 3 && g.lat < GAS.latOut + 3 && Math.abs(g.along) < GAS.halfLen + 5) return true;
    const n = nearest(pt.x, pt.z, pt.i);
    if (Math.abs(n.lat) < ROAD_BEVEL + roadPad + pad) return true;
    pt.lat = n.lat;
    if (Math.hypot(pt.x - ARENA.x, pt.z - ARENA.z) < ARENA.r - 2) return true;
    for (const e of exclusions) if (Math.hypot(pt.x - e.x, pt.z - e.z) < e.r + pad) return true;
    return false;
  };
  const scatter = (count, latMax, power, opts = {}) => {
    const out = [];
    for (let k = 0; k < count * 3 && out.length < count; k++) {
      const pt = sample(latMax, power, opts.latMin);
      if (blocked(pt, opts.pad ?? 0, opts.roadPad)) continue;
      if (opts.outside && Math.abs(pt.lat) < FENCE + 1.5) continue;
      if (opts.inside && Math.abs(pt.lat) > FENCE - 1.5) continue;
      pt.y = terrainHeight(pt.x, pt.z);
      out.push(pt);
    }
    return out;
  };

  // Creosote
  const bushes = scatter(2600, 230, 2.2).map((p) => ({ ...p, y: p.y - 0.08, ry: r() * 6.3, s: 0.55 + r() * 0.75, sy: 0.6 + r() * 0.6 }));
  bushes.forEach((b) => { b.sx = b.s; b.sz = b.s * (0.8 + r() * 0.4); });
  group.add(instanced(bushGeo(), vcMat(), bushes));

  // Dry grass tufts, denser near the road
  const tufts = scatter(5200, 70, 1.8, { roadPad: 0.3 }).map((p) => ({ ...p, ry: r() * 6.3, s: 0.7 + r() * 0.9 }));
  group.add(instanced(grassGeo(), vcMat({ flatShading: false, side: THREE.DoubleSide }), tufts, false));

  // Saguaros: mostly beyond the fences; a few inside the corridor are solid obstacles
  const sagMat = vcMat({ flatShading: false });
  const sag = [[], [], []];
  for (const p of scatter(240, 260, 1.6, { outside: true, pad: 2 })) sag[Math.floor(r() * 3)].push({ ...p, y: p.y - 0.1, ry: r() * 6.3, s: 0.75 + r() * 0.55 });
  for (const p of scatter(16, FENCE - 2, 1, { latMin: 9, inside: true, pad: 2 })) {
    sag[1 + Math.floor(r() * 2)].push({ ...p, y: p.y - 0.1, ry: r() * 6.3, s: 0.8 + r() * 0.3 });
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.42 });
  }
  sag.forEach((list, k) => group.add(instanced(saguaroGeo(k, 20 + k), sagMat, list)));

  // Ocotillo
  const oco = scatter(150, 200, 1.6, { latMin: 10, pad: 1 }).map((p) => ({ ...p, ry: r() * 6.3, s: 0.7 + r() * 0.5 }));
  group.add(instanced(ocotilloGeo(), vcMat({ flatShading: false }), oco));
  for (const p of oco) if (Math.abs(p.lat) < FENCE) colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.35 });

  // Rocks: pebbles everywhere, medium rocks and boulders outside the corridor
  const pebbles = scatter(1700, 120, 1.7, { roadPad: 0.4 }).map((p) => ({ ...p, y: p.y - 0.05, ry: r() * 6.3, rx: (r() - 0.5) * 0.4, s: 0.12 + r() * 0.3 }));
  group.add(instanced(rockGeo(0, 31, 0.25), vcMat(), pebbles, false));
  const mids = scatter(480, 220, 1.4, { outside: true }).map((p) => ({ ...p, y: p.y - 0.2, ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 0.6 + r() * 1.6 }));
  const boulders = scatter(190, 280, 1.2, { latMin: 40, outside: true, pad: 3 }).map((p) => ({ ...p, y: p.y - 0.8, ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 2.5 + r() * 5 }));

  // Boulder ring around the arena, open where the road comes in
  const entry = pointAt(I_ARENA - 80);
  const aEntry = Math.atan2(entry.z - ARENA.z, entry.x - ARENA.x);
  for (let k = 0; k < 54; k++) {
    const a = (k / 54) * Math.PI * 2 + r() * 0.05;
    const d = Math.atan2(Math.sin(a - aEntry), Math.cos(a - aEntry));
    if (Math.abs(d) < 0.32) continue;
    const s = 1.8 + r() * 2.8;
    const rr = ARENA.r + 1.6 + s * 0.7;
    const x = ARENA.x + Math.cos(a) * rr, z = ARENA.z + Math.sin(a) * rr;
    boulders.push({ x, y: terrainHeight(x, z) - 0.5, z, ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s });
  }
  group.add(instanced(rockGeo(1, 41, 0.3), vcMat(), mids));
  group.add(instanced(rockGeo(1, 47, 0.35), vcMat(), boulders));

  // Mesas on the horizon
  const mesas = [];
  const mr = rng(88);
  const clearOfRoute = (x, z, rad) => {
    for (let i = 0; i < S.count; i += 20) if (Math.hypot(x - S.px[i], z - S.pz[i]) < rad * 1.8 + 380) return false;
    return true;
  };
  for (let k = 0, tries = 0; mesas.length < 14 && tries < 200; tries++) {
    const a = mr() * Math.PI * 2;
    const dist = 700 + mr() * 500;
    const x = Math.cos(a) * dist, z = 780 + Math.sin(a) * dist * 1.1;
    const rad = 70 + mr() * 120, h = 45 + mr() * 70;
    if (!clearOfRoute(x, z, rad)) continue;
    k++;
    mesas.push({ x, y: terrainHeight(x, z) - 12, z, sx: rad * (0.8 + mr() * 0.6), sy: h, sz: rad, ry: mr() * 6.3 });
  }
  group.add(instanced(mesaGeo(5), vcMat(), mesas, false));

  // Far ground disc so the horizon never shows the terrain's edge
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd49a62, roughness: 1 }));
  disc.position.set(0, -14, 800);
  group.add(disc);

  return { group, colliders };
}
