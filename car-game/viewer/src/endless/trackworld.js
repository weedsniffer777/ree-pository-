import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, rng } from '../level/noise.js';
import { paintRoad, LATS as ROAD_LATS, DY as ROAD_DY, roadSurfaceY } from '../level/road.js';
import { FACES, std, metal, billboard, waterTower, windpump, shed } from '../level/structures.js';
import { vcMat, bushGeo, grassGeo, saguaroGeo, ocotilloGeo, rockGeo, mesaGeo } from '../level/props.js';
import { box, tube } from '../lib/geo.js';
import { bakeGroup } from '../level/bake.js';
import { S, LOOP, ROAD_HALF, ROAD_BEVEL, RAIL_LAT, FENCE, wAt, pointAt, nearest, gridNearest } from './route.js';
import { railSide } from './world.js';

// A closed-loop circuit built once at load. Shared: two-layer terrain heightfield (fine
// near the road, coarse everywhere, the coarse one sunk under the fine so there are no
// cracks), asphalt ribbon with a per-sample width, start line and gantry, then a themed
// dressing pass:
//   'highway': open road with fence, power line, signs, delineators, guardrails on curve
//              outsides, bridges, side roads closed by farm gates, billboards, water towers.
//   'yard':    jersey-barrier walls with zoned backdrops (corrugated sheet, rusty steel
//              trestle, chain-link with gated side roads, container canyons, open ground),
//              warehouses, gantry cranes, floodlights and rubble.
// The car only needs heightAt / heightAtN and `colliders`.

const nA = makeNoise2D(11), nB = makeNoise2D(23), nC = makeNoise2D(37), nD = makeNoise2D(51);
const hash = (a, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const C = (h) => new THREE.Color(h);
const WHITE = new THREE.Color(1, 1, 1);
const wrap = (i) => ((Math.round(i) % LOOP.n) + LOOP.n) % LOOP.n;
const RL = (i) => RAIL_LAT * wAt(i); // barrier line
const EDGE = (i) => ROAD_BEVEL * wAt(i); // edge of the asphalt
const roadN = (x, z, rings = 3) => {
  const i = gridNearest(x, z, rings);
  return i < 0 ? null : nearest(x, z, i);
};
// world position of a point (lx across-ish, lz along) in an object's frame at yaw
const toWorld = (cx, cz, yaw, lx, lz) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

const NEAR = 3, NEAR_R = 62; // fine terrain: cell size, reach from the road
const FAR = 12, FAR_M = 520; // coarse terrain: cell size, margin around the loop
const DISC_Y = -14.2;

// ---- textures ----
const tex = (c, rep = true) => {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

function checkerTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#16171a'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  return tex(c);
}

// Vertical ribs on grey (corrugated sheet / containers); tinted per instance or baked in.
function ribTexture({ panels = 1, tint = null, seed = 5, rust = 0.5 } = {}) {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  for (let p = 0; p < panels; p++) {
    const x0 = (256 / panels) * p, w = 256 / panels;
    const base = tint ? tint[Math.floor(r() * tint.length)] : [170, 170, 170];
    const v = 0.8 + r() * 0.3;
    g.fillStyle = `rgb(${base[0] * v},${base[1] * v},${base[2] * v})`;
    g.fillRect(x0, 0, w, 256);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x0 + x, 0, 2, 256);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 + x + 4, 0, 3, 256);
    }
    for (let k = 0; k < 6 * rust; k++) {
      const x = x0 + r() * w, len = 40 + r() * 160;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(110,62,34,${0.25 + r() * 0.3})`); gr.addColorStop(1, 'rgba(110,62,34,0)');
      g.fillStyle = gr; g.fillRect(x, r() < 0.5 ? 0 : 256 - len, 3 + r() * 9, len);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0, 0, 2, 256);
  }
  for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,24,18' : '230,225,210'},${r() * 0.12})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  return tex(c);
}

// One 4 x 4 m bay of factory wall: brick or block courses with a mullioned window.
function facadeTexture(brick, seed) {
  const [c, g] = canvas(128, 128);
  const r = rng(seed);
  g.fillStyle = brick; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, y, 128, 1);
    for (let x = (y / 6) % 2 ? 0 : 8; x < 128; x += 16) g.fillRect(x, y, 1, 6);
  }
  for (let k = 0; k < 1500; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,16,12' : '230,220,200'},${r() * 0.12})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  g.fillStyle = '#b8b1a2'; g.fillRect(26, 92, 76, 5); // sill
  g.fillStyle = '#1f2c31'; g.fillRect(28, 28, 72, 64);
  const lit = r() < 0.25;
  if (lit) { g.fillStyle = 'rgba(210,190,120,0.35)'; g.fillRect(28, 28, 72, 64); }
  g.fillStyle = 'rgba(160,175,170,0.22)'; g.fillRect(28, 28, 72, 18);
  g.fillStyle = '#5a5a56';
  for (const x of [28, 52, 76, 100]) g.fillRect(x - 1, 28, 3, 64);
  g.fillRect(28, 58, 72, 3);
  const grd = g.createLinearGradient(0, 100, 0, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = grd; g.fillRect(0, 100, 128, 28);
  return tex(c);
}

function chainTexture() {
  const [c, g] = canvas(64, 64);
  g.strokeStyle = 'rgba(176,181,185,0.95)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.stroke();
  return tex(c);
}

function sideRoadTexture(kind) {
  const [c, g] = canvas(256, 1024);
  const r = rng(19);
  g.fillStyle = kind === 'yard' ? '#4d4a47' : '#b48c62'; g.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 30000; i++) {
    const v = r();
    g.fillStyle = kind === 'yard' ? (v < 0.5 ? `rgba(20,20,20,${r() * 0.3})` : `rgba(150,146,138,${r() * 0.2})`) : (v < 0.5 ? `rgba(90,66,44,${r() * 0.25})` : `rgba(230,200,160,${r() * 0.2})`);
    g.fillRect(r() * 256, r() * 1024, 2 + r() * 3, 2 + r() * 3);
  }
  if (kind !== 'yard') for (const x of [78, 178]) for (let y = 0; y < 1024; y += 3) { g.fillStyle = `rgba(80,58,38,${0.12 + r() * 0.12})`; g.fillRect(x - 14 + (r() - 0.5) * 6, y, 28, 4); }
  return tex(c);
}

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

const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ'; // yaw first, then tilt in the object's own frame
function inst(geo, mat, list, { shadow = true } = {}) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const colored = list.some((t) => t.c);
  list.forEach((t, k) => {
    _o.position.set(t.x, t.y, t.z);
    _o.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    _o.scale.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    _o.updateMatrix();
    m.setMatrixAt(k, _o.matrix);
    if (colored) m.setColorAt(k, t.c ?? WHITE);
  });
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}
const UNIT = new THREE.BoxGeometry(1, 1, 1);

export class TrackWorld {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.colliders = [];
    this.updaters = [];
    this.hint = 0;
    this.hill = 0;
    this.faces = new Map();
    this.pal = Object.fromEntries(Object.entries(def.ground).map(([k, v]) => [k, C(v)]));
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < LOOP.n; i++) {
      minx = Math.min(minx, S.px[i]); maxx = Math.max(maxx, S.px[i]);
      minz = Math.min(minz, S.pz[i]); maxz = Math.max(maxz, S.pz[i]);
    }
    this.box = { minx, maxx, minz, maxz, cx: (minx + maxx) / 2, cz: (minz + maxz) / 2 };
    this.group = new THREE.Group();
    this.group.name = 'track';
    scene.add(this.group);
    this.roadMat = new THREE.MeshStandardMaterial({ map: paintRoad(def.road), roughness: 0.93 });
    this.buildTerrain();
    this.buildRoad();
    this.buildStart();
    if (def.kind === 'highway') this.buildHighway();
    else this.buildYard();
    this.buildFeatures();
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(4000, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: this.pal.a, roughness: 1 }));
    this.disc.position.y = DISC_Y;
    scene.add(this.disc);
  }

  update() {}
  tick(dt) { for (const f of this.updaters) f(dt); }
  follow(x, z) { this.disc.position.x = x; this.disc.position.z = z; }
  add(...objs) { for (const o of objs) if (o) this.group.add(o); }

  // Used by the camera and effects at arbitrary points, so look the road up from scratch.
  heightAt(x, z) { return this.terrainH(x, z, roadN(x, z, 3)); }
  heightAtN(x, z, n) { return this.terrainH(x, z, n); }

  // Ground height. Flush with the road under the barriers, then eases out to the rolling
  // base terrain; it keeps following the road's elevation for ~90 m so the circuit sits on
  // a natural rise. `d` is the distance beyond the (variable-width) road edge. Sets this.hill.
  terrainH(x, z, n) {
    const w = n ? S.w[wrap(n.i)] : 1;
    const d = n ? Math.max(0, Math.abs(n.lat) - ROAD_HALF * (w - 1)) : 999;
    const gentle = fbm(nA, x / 34, z / 34, 3) * 0.8 + fbm(nB, x / 8, z / 8, 2) * 0.1;
    const hill = (fbm(nC, x / 260, z / 260, 5) * 0.55 + 0.5) * this.def.hills * smoothstep(30, 95, d);
    this.hill = hill;
    const roadY = n ? n.y : 0;
    const far = gentle + hill + roadY * (1 - smoothstep(20, 90, d));
    const t = smoothstep(ROAD_HALF + 1, ROAD_HALF + 18, d);
    return (roadY - 0.1) * (1 - t) + far * t;
  }

  // Ground at (sample i, lateral offset) without a nearest-road search.
  gl(i, lat) {
    const p = pointAt(i, lat), k = wrap(i);
    return this.terrainH(p.x, p.z, { i: k, lat, y: S.y[k] });
  }

  colorAt(x, z, d, hill, out) {
    const p = this.pal;
    out.copy(p.a).lerp(p.b, fbm(nA, x / 60, z / 60, 3) * 0.5 + 0.5);
    out.lerp(p.dark, smoothstep(0.1, 0.45, fbm(nD, x / 25, z / 25, 3)) * (this.def.kind === 'yard' ? 0.7 : 0.45));
    out.lerp(p.pale, smoothstep(0.25, 0.6, fbm(nB, x / 12, z / 45, 2)) * 0.3);
    out.lerp(p.rock, smoothstep(6, 40, hill) * 0.85);
    out.lerp(p.gravel, (1 - smoothstep(8, 22, d)) * 0.55);
    return out;
  }

  buildTerrain() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
    const tmp = new THREE.Color();
    const b = this.box;
    {
      const ix0 = Math.floor((b.minx - NEAR_R) / NEAR), ix1 = Math.ceil((b.maxx + NEAR_R) / NEAR);
      const iz0 = Math.floor((b.minz - NEAR_R) / NEAR), iz1 = Math.ceil((b.maxz + NEAR_R) / NEAR);
      const vmap = new Map(), pos = [], col = [], idx = [];
      const vert = (ix, iz) => {
        const key = (ix + 2000) * 8192 + (iz + 2000);
        let v = vmap.get(key);
        if (v !== undefined) return v;
        const x = ix * NEAR, z = iz * NEAR, n = roadN(x, z, 3);
        const h = this.terrainH(x, z, n);
        this.colorAt(x, z, n ? Math.abs(n.lat) : 999, this.hill, tmp);
        v = pos.length / 3;
        pos.push(x, h, z); col.push(tmp.r, tmp.g, tmp.b);
        vmap.set(key, v);
        return v;
      };
      for (let ix = ix0; ix < ix1; ix++) for (let iz = iz0; iz < iz1; iz++) {
        const n = roadN((ix + 0.5) * NEAR, (iz + 0.5) * NEAR, 2);
        if (!n || Math.abs(n.lat) > NEAR_R) continue;
        const a = vert(ix, iz), bb = vert(ix + 1, iz), c = vert(ix, iz + 1), d = vert(ix + 1, iz + 1);
        if (hash(ix, iz) < 0.5) idx.push(a, c, bb, bb, c, d);
        else idx.push(a, c, d, a, d, bb);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.add(m);
    }
    {
      const x0 = Math.floor((b.minx - FAR_M) / FAR) * FAR, z0 = Math.floor((b.minz - FAR_M) / FAR) * FAR;
      const nx = Math.ceil((b.maxx + FAR_M - x0) / FAR), nz = Math.ceil((b.maxz + FAR_M - z0) / FAR);
      const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const x = x0 + i * FAR, z = z0 + j * FAR, n = roadN(x, z, 3);
        const d = n ? Math.abs(n.lat) : 999;
        let h = this.terrainH(x, z, n);
        if (n) h -= 1.4 * (1 - smoothstep(42, 60, d));
        const edge = Math.min(i, nx - i, j, nz - j) * FAR;
        h = DISC_Y + 0.3 + (h - DISC_Y - 0.3) * smoothstep(0, 160, edge);
        this.colorAt(x, z, d, this.hill, tmp);
        const q = (i * (nz + 1) + j) * 3;
        pos[q] = x; pos[q + 1] = h; pos[q + 2] = z;
        col[q] = tmp.r; col[q + 1] = tmp.g; col[q + 2] = tmp.b;
      }
      const idx = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const a = i * (nz + 1) + j, bb = a + (nz + 1), c = a + 1, d = bb + 1;
        if (hash(i, j + 77) < 0.5) idx.push(a, c, bb, bb, c, d);
        else idx.push(a, c, d, a, d, bb);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.add(m);
    }
  }

  buildRoad() {
    const N = LOOP.n, m = ROAD_LATS.length, rows = N + 1;
    const rp = new Float32Array(rows * m * 3), ruv = new Float32Array(rows * m * 2);
    for (let a = 0; a < rows; a++) {
      const i = a % N, w = S.w[i];
      for (let j = 0; j < m; j++) {
        const p = pointAt(i, ROAD_LATS[j] * w), q = a * m + j;
        rp[q * 3] = p.x; rp[q * 3 + 1] = S.y[i] + ROAD_DY[j]; rp[q * 3 + 2] = p.z;
        ruv[q * 2] = (ROAD_LATS[j] + ROAD_BEVEL) / (2 * ROAD_BEVEL);
        ruv[q * 2 + 1] = a / 64; // N is a multiple of 64, so the texture closes seamlessly
      }
    }
    const ri = [];
    for (let a = 0; a < rows - 1; a++) for (let j = 0; j < m - 1; j++) {
      const q = a * m + j;
      ri.push(q, q + 1, q + m, q + 1, q + m + 1, q + m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
    g.setIndex(ri);
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, this.roadMat);
    road.receiveShadow = true;
    this.add(road);
  }

  buildStart() {
    const w0 = S.w[0], hw = ROAD_HALF * w0;
    const lats = [-hw, -hw / 2, 0, hw / 2, hw];
    const pos = [], uv = [], idx = [];
    for (const [r, i] of [[0, -2], [1, 2]]) {
      lats.forEach((lat) => {
        const p = pointAt(i, lat);
        pos.push(p.x, S.y[wrap(i)] + roadSurfaceY(lat / w0) + 0.02, p.z);
        uv.push(((lat + hw) / (2 * hw)) * 12 * w0, r * 4);
      });
    }
    for (let j = 0; j < 4; j++) idx.push(j, j + 1, j + 5, j + 1, j + 6, j + 5);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const line = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    line.receiveShadow = true;
    this.add(line);

    const steel = std(this.def.kind === 'yard' ? 0x4a4c4e : 0x3b3d40, { roughness: 0.55, metalness: 0.6 });
    const ct = checkerTexture();
    ct.repeat.set(18, 1);
    const half = RL(0) + 1.4, H = 7.4;
    const gantry = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), steel);
      post.position.set(s * half, H / 2, 0);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), steel);
      brace.position.set(s * (half - 0.9), H - 1.4, 0);
      brace.rotation.z = -s * 0.6;
      gantry.add(post, brace);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 1.1, 0.5), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 }));
    beam.position.y = H - 0.2;
    gantry.add(beam);
    for (const x of [-half * 0.6, -half * 0.2, half * 0.2, half * 0.6]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
      lamp.position.set(x, H - 0.95, 0.4);
      gantry.add(lamp);
    }
    const p = pointAt(0, 0);
    gantry.position.set(p.x, S.y[0], p.z);
    gantry.rotation.y = p.yaw;
    gantry.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.add(gantry);
  }

  // ---- shared helpers ----

  // Extrudes a cross-section along `rows` (sample indices, may exceed N for a closed run).
  // prof = [inset toward the road, height]; hf(k) tapers a run's ends.
  ribbon(side, prof, rows, { color, uv, hf, base = -0.1 } = {}) {
    const m = prof.length, R = rows.length;
    const pos = new Float32Array(R * m * 3), col = color ? new Float32Array(R * m * 3) : null, tc = uv ? new Float32Array(R * m * 2) : null;
    const c = [0, 0, 0];
    for (let a = 0; a < R; a++) {
      const i = wrap(rows[a]), f = hf ? hf(a, R) : 1;
      for (let j = 0; j < m; j++) {
        const [inset, h] = prof[j];
        const p = pointAt(i, side * (RL(i) - inset * f)), q = a * m + j;
        pos[q * 3] = p.x; pos[q * 3 + 1] = S.y[i] + base + h * f - (1 - f) * 0.05; pos[q * 3 + 2] = p.z;
        if (col) { color(i, j, h, c); col[q * 3] = c[0]; col[q * 3 + 1] = c[1]; col[q * 3 + 2] = c[2]; }
        if (tc) { const t = uv(rows[a], j, h); tc[q * 2] = t[0]; tc[q * 2 + 1] = t[1]; }
      }
    }
    const idx = [];
    for (let a = 0; a < R - 1; a++) for (let j = 0; j < m - 1; j++) {
      const q = a * m + j;
      idx.push(q, q + 1, q + m, q + 1, q + m + 1, q + m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (tc) g.setAttribute('uv', new THREE.BufferAttribute(tc, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Runs of consecutive sample indices where pred(i) holds (no wrapping across the seam).
  runs(pred, minLen = 3) {
    const out = [];
    let cur = null;
    for (let i = 0; i < LOOP.n; i++) {
      if (pred(i)) (cur ??= []).push(i);
      else { if (cur && cur.length >= minLen) out.push(cur); cur = null; }
    }
    if (cur && cur.length >= minLen) out.push(cur);
    return out;
  }

  face(key, make) {
    if (!this.faces.has(key)) this.faces.set(key, make());
    return this.faces.get(key);
  }

  place(proto, i, lat, yawOff = 0) {
    const p = pointAt(i, lat);
    const o = proto.clone();
    o.position.set(p.x, this.terrainH(p.x, p.z, roadN(p.x, p.z, 2)) - 0.05, p.z);
    o.rotation.y = p.yaw + yawOff;
    this.add(o);
    return o;
  }

  styleAt(i) {
    const f = wrap(i) / LOOP.n;
    for (const z of this.def.zones ?? []) if (f >= z.a && f < z.b) return z.style;
    return 'open';
  }

  // ---- highway dressing ----
  buildHighway() {
    const def = this.def, N = LOOP.n, r = rng(def.seed ?? 1);
    // jersey barrier is not used here: guardrails on the outside of tight curves only
    {
      const prof = [[0.0, 0.47], [0.06, 0.52], [0.015, 0.585], [0.06, 0.65], [0.0, 0.705], [0.0, 0.725]];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
      const posts = [];
      for (const side of [-1, 1]) {
        for (const run of this.runs((i) => railSide(i) === side, 6)) {
          const g = this.ribbon(side, prof, run, {
            hf: (a, R) => smoothstep(0, 6, Math.min(a, R - 1 - a)),
            color: (i, j, h, out) => { const d = 0.82 + 0.18 * Math.sin(i * 0.37) * Math.sin(i * 0.11); out[0] = 0.62 * d; out[1] = 0.64 * d; out[2] = 0.66 * d; },
          });
          const m = new THREE.Mesh(g, mat);
          m.castShadow = m.receiveShadow = true;
          this.add(m);
          for (let a = 0; a < run.length; a += 2) {
            const i = run[a], p = pointAt(i, side * (RL(i) + 0.22));
            posts.push({ x: p.x, y: S.y[i] - 0.1 + 0.4, z: p.z, ry: p.yaw });
          }
        }
      }
      this.add(inst(new THREE.BoxGeometry(0.1, 0.86, 0.16), new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.6, metalness: 0.6 }), posts));
    }

    // delineator posts every 25 m just off the shoulder
    {
      const dp = [], rf = [];
      for (let i = 0; i < N; i += 25) for (const side of [-1, 1]) {
        if (railSide(i) === side) continue;
        const lat = side * (EDGE(i) + 1.5), p = pointAt(i, lat), y = this.gl(i, lat);
        const ry = p.yaw + (hash(i, side + 11) - 0.5) * 0.15, rz = (hash(i, side + 13) - 0.5) * 0.08;
        dp.push({ x: p.x, y: y + 0.5, z: p.z, ry, rz });
        rf.push({ x: p.x, y: y + 0.88, z: p.z, ry, rz });
      }
      this.add(inst(new THREE.BoxGeometry(0.1, 1.1, 0.07), std(0xe8e4da, { roughness: 0.7 }), dp));
      this.add(inst(new THREE.BoxGeometry(0.11, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0xffb21a, emissive: 0xff9a10, emissiveIntensity: 0.35, roughness: 0.3 }), rf, { shadow: false }));
    }

    // barbed-wire fence, posts every 4 m
    {
      const posts = [], wires = [];
      const at = (i, side) => {
        if (hash(i, side + 7) < 0.06) return null;
        const p = pointAt(i, side * FENCE);
        return { x: p.x, z: p.z, y: this.gl(i, side * FENCE) };
      };
      for (const side of [-1, 1]) for (let i = 0; i < N; i += 4) {
        const a = at(i, side);
        if (!a) continue;
        posts.push({ x: a.x, y: a.y + 0.55, z: a.z, rx: (hash(i, side) - 0.5) * 0.12, ry: hash(i, 3) * 3, rz: (hash(i, side + 2) - 0.5) * 0.12, sy: (1.2 + hash(i, 5) * 0.15) / 1.3 });
        const b = at(i + 4, side);
        if (!b) continue;
        for (const hh of [0.42, 0.75, 1.05]) {
          if (hash(i, hh * 100 + side) < 0.04) continue;
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2 + hh - 0.07;
          wires.push(a.x, a.y + hh, a.z, mx, my, mz, mx, my, mz, b.x, b.y + hh, b.z);
        }
      }
      this.add(inst(new THREE.CylinderGeometry(0.055, 0.07, 1.3, 6), std(0x6b5b4a, { roughness: 1 }), posts));
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      this.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3b3632 })));
    }

    // power line on the left, poles every 55 m
    {
      const poles = [], arms = [], wire = [];
      const tops = [];
      for (let i = 10; i < N; i += 55) {
        const p = pointAt(i, -27), y = this.gl(i, -27) + (hash(i, 4) - 0.5) * 0.1;
        poles.push({ x: p.x, y: y + 4.7, z: p.z, ry: p.yaw, rz: (hash(i, 6) - 0.5) * 0.04 });
        arms.push({ x: p.x, y: y + 9.0, z: p.z, ry: p.yaw });
        tops.push({ x: p.x, y: y + 9.0, z: p.z, yaw: p.yaw });
      }
      for (let k = 0; k < tops.length; k++) {
        const a = tops[k], b = tops[(k + 1) % tops.length];
        if (Math.hypot(a.x - b.x, a.z - b.z) > 70) continue; // the loop's seam
        for (const off of [-1.1, 0, 1.1]) {
          const ax = a.x + Math.cos(a.yaw) * off, az = a.z - Math.sin(a.yaw) * off, bx = b.x + Math.cos(b.yaw) * off, bz = b.z - Math.sin(b.yaw) * off;
          let px = ax, py = a.y, pz = az;
          for (let s = 1; s <= 6; s++) {
            const t = s / 6, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = a.y + (b.y - a.y) * t - 1.6 * 4 * t * (1 - t);
            wire.push(px, py, pz, x, y, z);
            px = x; py = y; pz = z;
          }
        }
      }
      this.add(inst(new THREE.CylinderGeometry(0.14, 0.18, 9.4, 6), std(0x6a5440, { roughness: 1 }), poles));
      this.add(inst(new THREE.BoxGeometry(2.6, 0.12, 0.12), std(0x6a5440, { roughness: 1 }), arms));
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      this.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2623 })));
    }

    // signs: curve warnings ahead of tight corners, chevrons on their outsides, speed, mile markers
    {
      const sg = new THREE.Group();
      const signPost = metal(0x9aa0a5, { roughness: 0.5 });
      const sign = (face, i, lat, w, h, postH = 1.6) => {
        const p = pointAt(i, lat);
        const g = new THREE.Group();
        g.position.set(p.x, this.gl(i, lat), p.z);
        g.rotation.y = p.yaw + Math.PI;
        g.add(box(0.07, postH + h * 0.6, 0.07, signPost, { pos: [0, (postH + h * 0.6) / 2, -0.04] }));
        face.fm ??= new THREE.MeshStandardMaterial({ map: face.front, alphaTest: 0.5, roughness: 0.55 });
        face.bm ??= new THREE.MeshStandardMaterial({ map: face.sil, color: 0x8b9095, alphaTest: 0.5, roughness: 0.5, metalness: 0.5 });
        const pl = new THREE.PlaneGeometry(w, h);
        const f = new THREE.Mesh(pl, face.fm), bk = new THREE.Mesh(pl, face.bm);
        f.position.set(0, postH + h / 2, 0.005);
        bk.position.set(0, postH + h / 2, -0.004);
        bk.rotation.y = Math.PI;
        g.add(f, bk);
        sg.add(g);
        this.colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.12 });
      };
      let lastCurve = -999;
      for (let i = 0; i < N; i++) {
        const ahead = (i + 150) % N, prev = (ahead - 1 + N) % N;
        if (Math.abs(S.k[ahead]) > 1 / 170 && Math.abs(S.k[prev]) <= 1 / 170 && i - lastCurve > 120) {
          lastCurve = i;
          const dir = S.k[ahead] > 0 ? 1 : -1;
          sign(this.face(`curve${dir}`, () => FACES.curve(dir, 3)), i, EDGE(i) + 1.6, 0.95, 0.95);
        }
        const rs = railSide(i);
        if (rs && i % 40 === 0) sign(this.face(`chev${rs}`, () => FACES.chevron(-rs, 4)), i, rs * (RL(i) + 0.7), 0.55, 0.75, 1.0);
      }
      const dists = [[0.03, 'spd'], [0.5, 'spd']];
      dists.forEach(([f, kind], q) => sign(this.face(`spd${q}`, () => FACES.speed(q ? 55 : 65, 1)), Math.floor(f * N), EDGE(Math.floor(f * N)) + 1.8, 0.9, 0.9));
      const miles = Math.max(1, Math.floor(LOOP.len / 1609));
      for (let m = 1; m <= miles; m++) {
        const i = Math.floor((m * 1609) % N);
        sign(this.face(`mile${m}`, () => FACES.mile(Math.min(99, m), m)), i, EDGE(i) + 1.3, 0.32, 0.75, 0.8);
      }
      bakeGroup(sg);
      this.add(sg);
    }

    this.scatterDesert(r);
  }

  scatterDesert(r) {
    const dn = this.def.density, b = this.box, M = 150;
    const veg = vcMat(), vegSmooth = vcMat({ flatShading: false }), grass = vcMat({ flatShading: false, side: THREE.DoubleSide });
    const geo = {
      bush: bushGeo(), grass: grassGeo(), sag: [saguaroGeo(0, 20), saguaroGeo(1, 21), saguaroGeo(2, 22)], oco: ocotilloGeo(),
      pebble: rockGeo(0, 31, 0.25), rock: rockGeo(1, 41, 0.3), boulder: rockGeo(1, 47, 0.35), mesa: mesaGeo(5),
    };
    const scatter = (count, minLat, maxLat, extra) => {
      const out = [];
      for (let q = 0; q < count; q++) {
        const x = b.minx - M + r() * (b.maxx - b.minx + 2 * M), z = b.minz - M + r() * (b.maxz - b.minz + 2 * M);
        const n = roadN(x, z, 2);
        if (!n || Math.abs(n.lat) < minLat || Math.abs(n.lat) > maxLat) continue;
        out.push({ x, y: this.terrainH(x, z, n), z, ...extra() });
      }
      return out;
    };
    const lowY = (list, dy) => list.forEach((o) => { o.y += dy; });
    const bushes = scatter(520 * dn.bush, 11, 130, () => { const s = 0.55 + r() * 0.75; return { ry: r() * 6.3, sx: s, sy: s * (0.6 + r() * 0.6), sz: s * (0.8 + r() * 0.4) }; });
    lowY(bushes, -0.08);
    this.add(inst(geo.bush, veg, bushes));
    this.add(inst(geo.grass, grass, scatter(750 * dn.grass, 9.5, 70, () => ({ ry: r() * 6.3, s: 0.7 + r() * 0.9 })), { shadow: false }));
    const sag = [[], [], []];
    for (const p of scatter(70 * dn.sag, FENCE + 3, 140, () => ({ ry: r() * 6.3, s: 0.75 + r() * 0.55 }))) sag[Math.floor(r() * 3)].push(p);
    sag.forEach((list, q) => { lowY(list, -0.1); this.add(inst(geo.sag[q], vegSmooth, list)); });
    const oco = scatter(30 * dn.sag, FENCE + 3, 160, () => ({ ry: r() * 6.3, s: 0.7 + r() * 0.5 }));
    this.add(inst(geo.oco, vegSmooth, oco));
    this.add(inst(geo.pebble, veg, scatter(260 * dn.rock, 9.5, 110, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.4, s: 0.12 + r() * 0.3 })), { shadow: false }));
    const rocks = scatter(150 * dn.rock, FENCE + 2, 170, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 0.6 + r() * 1.6 }));
    lowY(rocks, -0.2);
    this.add(inst(geo.rock, veg, rocks));
    const bould = scatter(40 * dn.rock, 24, 200, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 2.5 + r() * 5 }));
    lowY(bould, -0.8);
    this.add(inst(geo.boulder, veg, bould));
    const mesas = [];
    for (let q = 0; q < 26; q++) {
      const a = (q / 26) * Math.PI * 2 + r() * 0.2;
      const rad = 70 + r() * 110, dist = Math.max(b.maxx - b.minx, b.maxz - b.minz) * 0.5 + 330 + r() * 160;
      mesas.push({ x: b.cx + Math.cos(a) * dist, y: -16, z: b.cz + Math.sin(a) * dist * 1.1, sx: rad * (0.8 + r() * 0.6), sy: 45 + r() * 70, sz: rad, ry: r() * 6.3 });
    }
    this.add(inst(geo.mesa, veg, mesas, { shadow: false }));
  }

  // ---- features placed by lap fraction ----
  buildFeatures() {
    const N = LOOP.n, def = this.def, yard = def.kind === 'yard';
    const bake = (o, opts) => { bakeGroup(o, opts); return o; };
    const need = (t) => (def.features ?? []).some((f) => f.type === t);
    const boards = need('billboard') ? [61, 62, 63].map((s) => bake(billboard(s))) : null;
    const tower = need('tower') ? bake(waterTower()) : null;
    const shedP = need('windpump') ? bake(shed()) : null;
    const crane = need('crane') ? bake(this.craneProto(false)) : null;
    const craneLoad = need('crane') ? bake(this.craneProto(true)) : null;
    const gate = need('sideroad') ? bake(this.gateProto()) : null;
    let bb = 0;
    for (const f of def.features ?? []) {
      const i = Math.floor(f.at * N), s = f.side ?? 1;
      if (f.type === 'billboard') this.place(boards[bb++ % 3], i, s * (30 + hash(i, 1) * 6), Math.PI + s * 0.45);
      else if (f.type === 'tower') this.place(tower, i, s * (50 + hash(i, 2) * 10), hash(i, 3) * 6);
      else if (f.type === 'windpump') {
        const wp = windpump();
        bakeGroup(wp.g, { skip: (o) => o.name === 'rotor' });
        const p = pointAt(i, s * 42);
        wp.g.position.set(p.x, this.gl(i, s * 42) - 0.05, p.z);
        wp.g.rotation.y = p.yaw + 0.9;
        this.add(wp.g);
        this.place(shedP, i + 14, s * 52, 0.2);
        const rotor = wp.rotor;
        this.updaters.push((dt) => { rotor.rotation.z -= dt * 2.2; });
      } else if (f.type === 'bridge') this.buildBridge(i);
      else if (f.type === 'sideroad') this.buildSideRoad(i, s, gate, yard);
      else if (f.type === 'crane') this.place(f.load ? craneLoad : crane, i, 0, 0);
    }
  }

  // Cross road on a viaduct passing 7 m over the circuit, with ramps down to the desert.
  buildBridge(i0) {
    i0 = wrap(i0);
    const P = pointAt(i0, 0), tx = S.tx[i0], tz = S.tz[i0], cx = -tz, cz = tx;
    const y0 = S.y[i0], deckH = y0 + 7.8, half = 40, ramp = 56, ext = 150, hw = ROAD_BEVEL;
    const lats = [];
    for (let l = -ext; l <= ext; l += 6) lats.push(l);
    const m = ROAD_LATS.length, pos = new Float32Array(lats.length * m * 3), uv = new Float32Array(lats.length * m * 2);
    const rowY = [];
    lats.forEach((l, a) => {
      const gx = P.x + cx * l, gz = P.z + cz * l;
      const g = this.terrainH(gx, gz, roadN(gx, gz, 3)) + 0.1;
      const t = smoothstep(half, half + ramp, Math.abs(l));
      const y = deckH * (1 - t) + g * t;
      rowY.push(y);
      for (let j = 0; j < m; j++) {
        const q = a * m + j, off = -ROAD_LATS[j];
        pos[q * 3] = gx + tx * off; pos[q * 3 + 1] = y + ROAD_DY[j]; pos[q * 3 + 2] = gz + tz * off;
        uv[q * 2] = (ROAD_LATS[j] + hw) / (2 * hw); uv[q * 2 + 1] = a / 10.67;
      }
    });
    const idx = [];
    for (let a = 0; a < lats.length - 1; a++) for (let j = 0; j < m - 1; j++) {
      const q = a * m + j;
      idx.push(q, q + 1, q + m, q + 1, q + m + 1, q + m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: this.roadMat.map, roughness: 0.93, side: THREE.DoubleSide }));
    road.receiveShadow = road.castShadow = true;
    this.add(road);

    // deck slab, parapets and piers as scaled boxes yawed to the cross axis
    const concrete = std(0x9d9990, { roughness: 0.95 });
    const yaw = Math.atan2(cx, cz);
    const bx = (lat, lz, y, sx, sy, sz) => ({ x: P.x + cx * lat + tx * lz, y, z: P.z + cz * lat + tz * lz, ry: yaw, sx, sy, sz });
    const list = [bx(0, 0, deckH - 0.75, 2 * hw + 0.8, 1.3, 2 * half)];
    for (const s of [-1, 1]) {
      list.push(bx(0, s * (hw + 0.15), deckH + 0.45, 0.5, 0.9, 2 * half)); // parapets
      for (const l of [-14, 14]) { // piers: a cap and two columns
        const gy = this.terrainH(P.x + cx * l, P.z + cz * l, roadN(P.x + cx * l, P.z + cz * l, 3));
        const capY = deckH - 1.9;
        list.push(bx(l, 0, capY, 2 * hw - 1, 1.1, 2));
        const h = capY - gy;
        list.push(bx(l, s * 3.4, gy + h / 2, 1.4, h, 1.4));
        this.colliders.push({ type: 'circle', x: P.x + cx * l + tx * s * 3.4, z: P.z + cz * l + tz * s * 3.4, r: 1.2 });
      }
    }
    lats.forEach((l, a) => { // ramp supports
      if (Math.abs(l) <= half || Math.abs(l) > half + ramp + 6 || a % 2) return;
      const gx = P.x + cx * l, gz = P.z + cz * l, gy = this.terrainH(gx, gz, roadN(gx, gz, 3)), h = rowY[a] - 1 - gy;
      if (h < 1) return;
      for (const s of [-1, 1]) list.push(bx(l, s * 3.4, gy + h / 2, 1.2, h, 1.2));
    });
    this.add(inst(UNIT, concrete, list));
  }

  // A dirt or asphalt road leaving the circuit and ending at a closed gate in the fence.
  buildSideRoad(i0, side, gate, yard) {
    i0 = wrap(i0);
    const startLat = yard ? RL(i0) + 0.8 : EDGE(i0) - 0.4, ang = 0.55 + (hash(i0, 8) - 0.5) * 0.3, len = yard ? 120 : 190;
    const P = pointAt(i0, side * startLat), tx = S.tx[i0], tz = S.tz[i0];
    const ox = side * -tz, oz = side * tx; // outward
    let dx = ox * Math.cos(ang) + tx * Math.sin(ang), dz = oz * Math.cos(ang) + tz * Math.sin(ang);
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const px = -dz, pz = dx;
    const offs = [-5.2, -4, 0, 4, 5.2];
    const pos = [], uv = [], col = [], idx = [];
    const rows = Math.floor(len / 3);
    for (let a = 0; a <= rows; a++) {
      const x = P.x + dx * a * 3, z = P.z + dz * a * 3;
      const fade = smoothstep(0, 10, a * 3);
      offs.forEach((o, j) => {
        const qx = x + px * o, qz = z + pz * o;
        pos.push(qx, this.terrainH(qx, qz, roadN(qx, qz, 2)) + 0.07 + (j === 0 || j === 4 ? -0.04 : 0), qz);
        uv.push(j / 4, a * 3 / 24);
        col.push(1, 1, 1, (j === 0 || j === 4 ? 0 : 1) * (0.25 + 0.75 * fade));
      });
    }
    for (let a = 0; a < rows; a++) for (let j = 0; j < 4; j++) {
      const q = a * 5 + j;
      idx.push(q, q + 1, q + 5, q + 1, q + 6, q + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.sideMat ??= {};
    const kind = yard ? 'yard' : 'dirt';
    this.sideMat[kind] ??= new THREE.MeshStandardMaterial({
      map: sideRoadTexture(kind), vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide,
    });
    const road = new THREE.Mesh(g, this.sideMat[kind]);
    road.receiveShadow = true;
    road.renderOrder = 1;
    this.add(road);
    // closed gate where the road meets the fence line
    const gateLat = yard ? RL(i0) + 1.5 : FENCE, s = (gateLat - startLat) / Math.cos(ang);
    const gp = { x: P.x + dx * s, z: P.z + dz * s };
    const o = gate.clone();
    o.position.set(gp.x, this.terrainH(gp.x, gp.z, roadN(gp.x, gp.z, 2)), gp.z);
    o.rotation.y = Math.atan2(dx, dz);
    this.add(o);
  }

  gateProto() {
    const g = new THREE.Group();
    const galv = std(0x8d9297, { roughness: 0.5, metalness: 0.6 });
    if (!this.chainMat) this.chainMat = new THREE.MeshStandardMaterial({ map: chainTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    for (const x of [-4.4, 0, 4.4]) g.add(box(0.18, 3.5, 0.18, galv, { pos: [x, 1.75, 0] }));
    for (const [x0, x1] of [[-4.3, -0.1], [0.1, 4.3]]) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      g.add(box(w, 0.08, 0.08, galv, { pos: [cx, 3.1, 0] }), box(w, 0.08, 0.08, galv, { pos: [cx, 0.35, 0] }));
      g.add(tube([x0, 0.35, 0], [x1, 3.1, 0], 0.035, galv, 4));
      const pl = new THREE.PlaneGeometry(w, 2.75);
      const uv = pl.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.35, (uv.getY(i) * 2.75) / 0.35);
      const m = new THREE.Mesh(pl, this.chainMat);
      m.position.set(cx, 1.72, 0);
      g.add(m);
    }
    return g;
  }

  // Overhead gantry crane spanning the circuit: lattice legs, a box-truss girder, a trolley
  // and optionally a container hanging from it.
  craneProto(load) {
    const g = new THREE.Group();
    const red = std(0x9b3a22, { roughness: 0.65, metalness: 0.45 }), dark = std(0x2b2c2e, { roughness: 0.6, metalness: 0.5 });
    const half = 19.5, H = 17.5, T = 0.09;
    for (const s of [-1, 1]) {
      for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.add(tube([s * half + dx, 0, dz], [s * half + dx, H, dz], 0.1, red, 5));
      for (let y = 0; y < H - 1; y += 3.5) {
        for (const dz of [-0.8, 0.8]) g.add(tube([s * half - 0.8, y, dz], [s * half + 0.8, y + 3.5, dz], T, red, 4));
        for (const dx of [-0.8, 0.8]) g.add(tube([s * half + dx, y, -0.8], [s * half + dx, y + 3.5, 0.8], T, red, 4));
      }
    }
    const top = H + 0.4, bot = H - 1.2;
    for (const dz of [-0.9, 0.9]) for (const y of [top, bot]) g.add(tube([-half - 1.5, y, dz], [half + 1.5, y, dz], 0.1, red, 5));
    for (let x = -half - 1.5; x < half + 1.5; x += 2.6) {
      const x2 = Math.min(half + 1.5, x + 2.6);
      for (const dz of [-0.9, 0.9]) {
        g.add(tube([x, bot, dz], [x2, top, dz], T, red, 4));
        g.add(tube([x, top, dz], [x, bot, dz], T, red, 4));
      }
      g.add(tube([x, top, -0.9], [x, top, 0.9], T, red, 4));
    }
    const tx = -4;
    g.add(box(3.2, 1.0, 2.6, dark, { pos: [tx, bot - 0.9, 0] }));
    g.add(tube([tx, bot - 1.4, 0], [tx, 9.4, 0], 0.04, dark, 4));
    g.add(box(0.6, 0.5, 0.6, dark, { pos: [tx, 9.2, 0] }));
    if (load) {
      const cm = new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 1, seed: 8, rust: 0.6 }), color: 0x4d6074, roughness: 0.7, metalness: 0.3 });
      g.add(box(2.4, 2.6, 12.2, cm, { pos: [tx, 7.6, 0] }));
      for (const dz of [-5.4, 5.4]) g.add(tube([tx, 9.0, dz], [tx, 8.9 - 0.0, 0], 0.03, dark, 4));
    }
    return g;
  }

  // ---- yard dressing ----
  buildYard() {
    const def = this.def, N = LOOP.n, r = rng(def.seed);
    const concrete = [0.5, 0.49, 0.46], stripe = [0.66, 0.64, 0.58], warn = [0.66, 0.54, 0.2];
    const tight = (i) => Math.abs(S.k[i]) > 0.02;

    // jersey barrier on both sides: the physical wall everywhere
    {
      const prof = [[0.32, 0], [0.32, 0.12], [0.14, 0.34], [0.07, 0.5], [0.05, 0.8], [0.04, 0.95], [-0.28, 0.95], [-0.28, 0]];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true, side: THREE.DoubleSide });
      const rows = Array.from({ length: N + 1 }, (_, i) => i);
      for (const side of [-1, 1]) {
        const g = this.ribbon(side, prof, rows, {
          color: (i, j, h, out) => {
            const t = Math.abs(S.k[i]) > 0.011;
            const v = (0.88 + 0.12 * hash(Math.floor(i / 3), side)) * (i % 3 === 0 ? 0.82 : 1) * (h < 0.2 ? 0.7 : h > 0.9 ? 1.05 : 1);
            const base = j === 3 || j === 4 ? (t ? (Math.floor(i / 2) % 2 ? warn : [0.1, 0.1, 0.11]) : stripe) : concrete;
            out[0] = base[0] * v; out[1] = base[1] * v; out[2] = base[2] * v;
          },
        });
        const wall = new THREE.Mesh(g, mat);
        wall.castShadow = wall.receiveShadow = true;
        this.add(wall);
      }
    }

    // backdrops by zone: sheet / fence get continuous ribbons, trestle gets lattice bays,
    // containers get a stacked canyon wall (sheet through the tightest corners)
    const sheetMat = new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 4, seed: 9, rust: 1, tint: [[150, 146, 138], [128, 132, 134], [150, 118, 96], [112, 120, 126]] }), roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide });
    this.chainMat ??= new THREE.MeshStandardMaterial({ map: chainTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    const galv = std(0x8d9297, { roughness: 0.5, metalness: 0.6 });
    const sheetPred = (i) => { const s = this.styleAt(i); return s === 'sheet' || (s === 'containers' && tight(i)); };
    for (const side of [-1, 1]) {
      for (const run of this.runs(sheetPred)) {
        const g = this.ribbon(side, [[-2.4, 0], [-2.4, 3.4]], run, { uv: (a, j) => [a / 9.6, j] });
        const m = new THREE.Mesh(g, sheetMat);
        m.castShadow = m.receiveShadow = true;
        this.add(m);
        const posts = [], wire = [];
        for (let k = 0; k < run.length; k += 4) {
          const i = run[k], p = pointAt(i, side * (RL(i) + 2.55));
          posts.push({ x: p.x, y: S.y[wrap(i)] - 0.1 + 1.95, z: p.z, ry: p.yaw });
        }
        for (let k = 0; k + 2 < run.length; k += 2) {
          const [a, b, c] = [0, 1, 2].map((q) => pointAt(run[k + q], side * (RL(run[k + q]) + 2.6)));
          const y = (q) => S.y[wrap(run[k + q])] - 0.1 + 3.55;
          wire.push(a.x, y(0), a.z, b.x, y(1) + 0.38, b.z, b.x, y(1) + 0.38, b.z, c.x, y(2), c.z, a.x, y(0) + 0.2, a.z, c.x, y(2) + 0.2, c.z);
        }
        this.add(inst(new THREE.BoxGeometry(0.2, 3.9, 0.2), std(0x3f4143, { roughness: 0.6, metalness: 0.5 }), posts));
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
        this.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2826 })));
      }
      for (const run of this.runs((i) => this.styleAt(i) === 'fence')) {
        const g = this.ribbon(side, [[-1.5, 0], [-1.5, 3.2]], run, { uv: (a, j) => [a / 0.35, j * 3.2 / 0.35] });
        const m = new THREE.Mesh(g, this.chainMat);
        this.add(m);
        const posts = [];
        for (let k = 0; k < run.length; k += 4) {
          const i = run[k], p = pointAt(i, side * (RL(i) + 1.5));
          posts.push({ x: p.x, y: S.y[wrap(i)] - 0.1 + 1.65, z: p.z, ry: p.yaw });
        }
        this.add(inst(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), galv, posts));
      }
    }
    // trestle: rusty steel lattice, one 4 m bay at a time
    {
      const rust = [0x7a3f26, 0x8a4a2c, 0x6b3a28, 0x9a5a38, 0x5e3322].map(C);
      const posts = [], rails = [], diag = [];
      const BAY = 4, TH = 5.4;
      const phi = Math.atan2(TH, BAY), dl = Math.hypot(BAY, TH);
      for (const side of [-1, 1]) for (let i = 0; i < N; i += BAY) {
        if (this.styleAt(i) !== 'trestle' || tight(i)) continue;
        const lat = side * (RL(i) + 2.2), p = pointAt(i, lat), q = pointAt(i + BAY / 2, lat);
        const y = S.y[i] - 0.1, c = rust[Math.floor(hash(i, side + 40) * rust.length)];
        const yaw = Math.atan2(pointAt(i + BAY, lat).x - p.x, pointAt(i + BAY, lat).z - p.z);
        posts.push({ x: p.x, y: y + TH / 2, z: p.z, ry: yaw, sx: 0.28, sy: TH, sz: 0.28, c });
        for (const hy of [0.4, TH - 0.1]) rails.push({ x: q.x, y: y + hy, z: q.z, ry: yaw, sx: 0.18, sy: 0.18, sz: BAY + 0.1, c });
        diag.push({ x: q.x, y: y + TH / 2, z: q.z, ry: yaw, rx: -phi, sx: 0.12, sy: 0.12, sz: dl, c });
        diag.push({ x: q.x, y: y + TH / 2, z: q.z, ry: yaw, rx: phi, sx: 0.12, sy: 0.12, sz: dl, c });
      }
      const rm = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.4 });
      this.add(inst(UNIT, rm, posts), inst(UNIT, rm, rails), inst(UNIT, rm, diag));
    }
    // containers: a stacked canyon wall, 12 m units end to end
    {
      const tints = [0x7a4a3c, 0x44586c, 0x55645a, 0x9a7f3c, 0xa8a193, 0x6c3d36].map(C);
      const list = [];
      for (const side of [-1, 1]) for (let i = 0; i < N; i += 13) {
        if (this.styleAt(i) !== 'containers' || tight(i) || tight((i + 13) % N)) continue;
        const lat = side * (RL(i) + 4.2), p = pointAt(i + 6, lat), h = hash(i, side + 60) < 0.45 ? 2 : 3;
        const yaw = Math.atan2(pointAt(i + 12, lat).x - pointAt(i, lat).x, pointAt(i + 12, lat).z - pointAt(i, lat).z);
        for (let k = 0; k < h; k++) list.push({ x: p.x, y: S.y[wrap(i)] - 0.1 + 1.3 + k * 2.6, z: p.z, ry: yaw + (hash(i, k + 5) - 0.5) * 0.02, c: tints[Math.floor(hash(i + k, side + 61) * tints.length)] });
      }
      const cm = new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 1, seed: 3, rust: 0.8 }), roughness: 0.7, metalness: 0.3 });
      this.add(inst(new THREE.BoxGeometry(2.4, 2.6, 12.2), cm, list));
    }

    this.scatterYard(r, tight);
  }

  scatterYard(r, tight) {
    const N = LOOP.n;
    // warehouses: long brick and block halls parallel to the road, lamps along the eaves
    {
      const brick = new THREE.MeshStandardMaterial({ map: facadeTexture('#8c5c4a', 31), roughness: 0.9 });
      const block = new THREE.MeshStandardMaterial({ map: facadeTexture('#8d8b84', 32), roughness: 0.9 });
      const roof = std(0x5d5a55, { roughness: 1 });
      const types = [
        { geo: boxUV(18, 10, 46), mats: [brick, brick, roof, roof, brick, brick], tall: 10, list: [], depth: 18, len: 46 },
        { geo: boxUV(24, 8, 70), mats: [block, block, roof, roof, block, block], tall: 8, list: [], depth: 24, len: 70 },
        { geo: boxUV(20, 14, 32), mats: [brick, brick, roof, roof, brick, brick], tall: 14, list: [], depth: 20, len: 32 },
      ];
      const placed = [], lamps = [];
      for (let q = 0; q < 500 && placed.length < 46; q++) {
        const i = Math.floor(r() * N), side = r() < 0.5 ? -1 : 1, T = types[Math.floor(r() * 3)];
        if (this.styleAt(i) === 'containers' || this.styleAt(i) === 'sheet') continue;
        const lat = side * (RL(i) + 13 + T.depth / 2 + r() * 22), p = pointAt(i, lat);
        const n = roadN(p.x, p.z, 2);
        if (!n || Math.abs(n.lat) < RL(i) + 12 + T.depth / 2 || placed.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < (o.len + T.len) / 2 + 6)) continue;
        placed.push({ x: p.x, z: p.z, len: T.len });
        const y = this.terrainH(p.x, p.z, n), yaw = p.yaw + (r() < 0.12 ? Math.PI / 2 : 0);
        T.list.push({ x: p.x, y: y + T.tall / 2, z: p.z, ry: yaw, c: C(0xffffff).multiplyScalar(0.85 + r() * 0.25) });
        const face = side > 0 ? 1 : -1; // the face toward the road
        for (let z = -T.len / 2 + 5; z < T.len / 2 - 4; z += 8) {
          const [lx, lz] = toWorld(p.x, p.z, yaw, face * (T.depth / 2 + 0.3), z);
          lamps.push({ x: lx, y: y + T.tall - 0.7, z: lz, ry: yaw });
        }
      }
      for (const T of types) this.add(inst(T.geo, T.mats, T.list));
      this.add(inst(new THREE.BoxGeometry(0.4, 0.3, 1.1), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), lamps, { shadow: false }));
    }
    // floodlight towers
    {
      const poles = [], heads = [];
      for (let i = 20; i < N; i += 110) {
        const side = (i / 110) % 2 < 1 ? 1 : -1;
        const lat = side * (RL(i) + 5), p = pointAt(i, lat), y = this.gl(i, lat);
        poles.push({ x: p.x, y: y + 7.5, z: p.z, ry: p.yaw });
        heads.push({ x: p.x, y: y + 15.2, z: p.z, ry: p.yaw + Math.PI / 2 });
      }
      this.add(inst(new THREE.CylinderGeometry(0.18, 0.3, 15, 8), std(0x4a4c4e, { roughness: 0.6, metalness: 0.5 }), poles));
      this.add(inst(new THREE.BoxGeometry(4.2, 0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), heads, { shadow: false }));
    }
    // piles of rusty machinery, rubble and barrels where the ground is open
    {
      const yellow = [0xc9a227, 0xb88a1e, 0x8a5a2a, 0x6e4a2a, 0xa77b24].map(C), crates = [], rubble = [], barrels = [];
      for (let q = 0; q < 160; q++) {
        const i = Math.floor(r() * N), side = r() < 0.5 ? -1 : 1, st = this.styleAt(i);
        if (st === 'sheet' || st === 'containers') continue;
        const lat = side * (RL(i) + 5 + r() * 16), p = pointAt(i, lat), n = roadN(p.x, p.z, 2);
        if (!n || Math.abs(n.lat) < RL(i) + 4 || st === 'trestle' && Math.abs(n.lat) < RL(i) + 6) continue;
        const y = this.terrainH(p.x, p.z, n), k = 3 + Math.floor(r() * 7);
        for (let c = 0; c < k; c++) crates.push({ x: p.x + (r() - 0.5) * 5, y: y + 0.5 + Math.floor(c / 4) * 0.9, z: p.z + (r() - 0.5) * 5, ry: r() * 6, rx: (r() - 0.5) * 0.2, sx: 0.8 + r() * 1.4, sy: 0.7 + r() * 0.7, sz: 0.8 + r() * 1.2, c: yellow[Math.floor(r() * yellow.length)] });
        if (r() < 0.6) rubble.push({ x: p.x + (r() - 0.5) * 6, y: y - 0.2, z: p.z + (r() - 0.5) * 6, ry: r() * 6, s: 1 + r() * 2.2 });
        if (r() < 0.4) for (let c = 0; c < 4; c++) barrels.push({ x: p.x + (r() - 0.5) * 3, y: y + 0.45, z: p.z + (r() - 0.5) * 3, ry: r() * 6, s: 0.9 + r() * 0.2 });
      }
      this.add(inst(UNIT, std(0xffffff, { roughness: 0.75, metalness: 0.35 }), crates));
      this.add(inst(rockGeo(1, 41, 0.3), vcMat(), rubble));
      this.add(inst(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), std(0x6b4a3a, { roughness: 0.8, metalness: 0.3 }), barrels));
    }
    // barrels and stacked barrier blocks in front of the backdrop on the outside of corners
    {
      const barrels = [], blocks = [];
      for (let i = 0; i < N; i += 7) {
        if (Math.abs(S.k[i]) < 0.012 || hash(i, 91) < 0.35) continue;
        const side = S.k[i] > 0 ? -1 : 1, p = pointAt(i, side * (RL(i) + 1.3)), y = S.y[i] - 0.1;
        if (hash(i, 92) < 0.5) barrels.push({ x: p.x, y: y + 0.45, z: p.z, ry: r() * 6, s: 0.9 + r() * 0.2 });
        else blocks.push({ x: p.x, y: y + 0.4, z: p.z, ry: p.yaw + (r() - 0.5) * 0.3 });
      }
      this.add(inst(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), std(0x6b4a3a, { roughness: 0.8, metalness: 0.3 }), barrels));
      this.add(inst(new THREE.BoxGeometry(0.7, 0.8, 1.6), std(0x8f8b82, { roughness: 0.95 }), blocks));
    }
  }
}
