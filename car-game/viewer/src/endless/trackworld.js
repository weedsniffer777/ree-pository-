import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, rng } from '../level/noise.js';
import { paintRoad, LATS as ROAD_LATS, DY as ROAD_DY, roadSurfaceY } from '../level/road.js';
import { std, billboard, waterTower } from '../level/structures.js';
import { vcMat, bushGeo, grassGeo, saguaroGeo, rockGeo, mesaGeo, instanced } from '../level/props.js';
import { bakeGroup } from '../level/bake.js';
import { S, LOOP, ROAD_HALF, ROAD_BEVEL, RAIL_LAT, pointAt, nearest, gridNearest } from './route.js';

// A closed-loop circuit built once at load: one terrain heightfield in two layers (a fine
// mesh near the road, a coarse one over everything, the coarse one sunk under the fine so
// there are no cracks), the asphalt ribbon, a start line and gantry, jersey-barrier walls
// on both sides, and themed dressing ('desert' scatter, or the 'yard' of corrugated sheet,
// containers and floodlights). The car only needs heightAt / heightAtN and `colliders`.

const nA = makeNoise2D(11), nB = makeNoise2D(23), nC = makeNoise2D(37), nD = makeNoise2D(51);
const hash = (a, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const C = (h) => new THREE.Color(h);
const roadN = (x, z, rings = 3) => {
  const i = gridNearest(x, z, rings);
  return i < 0 ? null : nearest(x, z, i);
};

const NEAR = 3, NEAR_R = 62; // fine terrain: cell size, reach from the road
const FAR = 12, FAR_M = 520; // coarse terrain: cell size, margin around the loop
const DISC_Y = -14.2;

function checkerTexture(a = '#f2efe6', b = '#16171a') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 64, 64);
  g.fillStyle = b; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Vertical ribs on grey: tinted per instance (containers) or baked in (corrugated sheet).
function ribTexture({ panels = 1, tint = null, seed = 5, rust = 0.5 } = {}) {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let p = 0; p < panels; p++) {
    const x0 = (W / panels) * p, w = W / panels;
    const base = tint ? tint[Math.floor(r() * tint.length)] : [170, 170, 170];
    const v = 0.8 + r() * 0.3;
    g.fillStyle = `rgb(${base[0] * v},${base[1] * v},${base[2] * v})`;
    g.fillRect(x0, 0, w, H);
    for (let x = 0; x < w; x += 8) { // rib: light edge, dark valley
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x0 + x, 0, 2, H);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 + x + 4, 0, 3, H);
    }
    for (let k = 0; k < 6 * rust; k++) { // rust runs
      const x = x0 + r() * w, len = 40 + r() * 160;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(110,62,34,${0.25 + r() * 0.3})`); gr.addColorStop(1, 'rgba(110,62,34,0)');
      g.fillStyle = gr; g.fillRect(x, r() < 0.5 ? 0 : H - len, 3 + r() * 9, len);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0, 0, 2, H); // panel seam
  }
  for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,24,18' : '230,225,210'},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class TrackWorld {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.colliders = [];
    this.hint = 0;
    this.hill = 0;
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
    this.buildTerrain();
    this.buildRoad();
    this.buildStart();
    this.buildWalls();
    if (def.kind === 'desert') this.buildDesert();
    else this.buildYard();
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(4000, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: this.pal.a, roughness: 1 }));
    this.disc.position.y = DISC_Y;
    scene.add(this.disc);
  }

  update() {}
  tick() {}
  follow(x, z) { this.disc.position.x = x; this.disc.position.z = z; }

  // Used by the camera and effects at arbitrary points, so look the road up from scratch.
  heightAt(x, z) {
    return this.terrainH(x, z, roadN(x, z, 3));
  }

  heightAtN(x, z, n) { return this.terrainH(x, z, n); }

  // Ground height. Flush with the road under the walls, then eases out to the rolling
  // base terrain; the terrain keeps following the road's elevation for ~90 m so the
  // circuit sits on a natural rise instead of a causeway. Sets this.hill as a side effect.
  terrainH(x, z, n) {
    const d = n ? Math.abs(n.lat) : 999;
    const gentle = fbm(nA, x / 34, z / 34, 3) * 0.8 + fbm(nB, x / 8, z / 8, 2) * 0.1;
    const hill = (fbm(nC, x / 260, z / 260, 5) * 0.55 + 0.5) * this.def.hills * smoothstep(30, 95, d);
    this.hill = hill;
    const roadY = n ? n.y : 0;
    const far = gentle + hill + roadY * (1 - smoothstep(20, 90, d));
    const t = smoothstep(ROAD_HALF + 1, ROAD_HALF + 18, d);
    return (roadY - 0.1) * (1 - t) + far * t;
  }

  colorAt(x, z, d, hill, out) {
    const p = this.pal;
    out.copy(p.a).lerp(p.b, fbm(nA, x / 60, z / 60, 3) * 0.5 + 0.5);
    out.lerp(p.dark, smoothstep(0.1, 0.45, fbm(nD, x / 25, z / 25, 3)) * 0.45);
    out.lerp(p.pale, smoothstep(0.25, 0.6, fbm(nB, x / 12, z / 45, 2)) * 0.3);
    out.lerp(p.rock, smoothstep(6, 40, hill) * 0.85);
    out.lerp(p.gravel, (1 - smoothstep(8, 22, d)) * 0.55);
    return out;
  }

  buildTerrain() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
    const tmp = new THREE.Color();
    const b = this.box;
    // ---- fine layer: only cells within reach of the road ----
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
      this.group.add(m);
    }
    // ---- coarse layer over everything, sunk beneath the fine one near the road ----
    {
      const x0 = Math.floor((b.minx - FAR_M) / FAR) * FAR, z0 = Math.floor((b.minz - FAR_M) / FAR) * FAR;
      const nx = Math.ceil((b.maxx + FAR_M - x0) / FAR), nz = Math.ceil((b.maxz + FAR_M - z0) / FAR);
      const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const x = x0 + i * FAR, z = z0 + j * FAR, n = roadN(x, z, 3);
        const d = n ? Math.abs(n.lat) : 999;
        let h = this.terrainH(x, z, n);
        if (n) h -= 1.4 * (1 - smoothstep(42, 60, d));
        const edge = Math.min(i, nx - i, j, nz - j) * FAR; // roll off into the disc at the border
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
      this.group.add(m);
    }
  }

  buildRoad() {
    const N = LOOP.n, m = ROAD_LATS.length, rows = N + 1;
    const rp = new Float32Array(rows * m * 3), ruv = new Float32Array(rows * m * 2);
    for (let a = 0; a < rows; a++) {
      const i = a % N;
      for (let j = 0; j < m; j++) {
        const p = pointAt(i, ROAD_LATS[j]), q = a * m + j;
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
    const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: paintRoad(this.def.road), roughness: 0.93 }));
    road.receiveShadow = true;
    this.group.add(road);
  }

  // Chequered line across the road and an overhead gantry at sample 0.
  buildStart() {
    const lats = [-ROAD_HALF, -ROAD_HALF / 2, 0, ROAD_HALF / 2, ROAD_HALF];
    const pos = [], uv = [], idx = [];
    for (const [r, i] of [[0, -2], [1, 2]]) {
      lats.forEach((lat, j) => {
        const p = pointAt(i, lat);
        pos.push(p.x, S.y[((i % LOOP.n) + LOOP.n) % LOOP.n] + roadSurfaceY(lat) + 0.02, p.z);
        uv.push(((lat + ROAD_HALF) / (2 * ROAD_HALF)) * 12, r * 4);
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
    this.group.add(line);

    const desert = this.def.kind === 'desert';
    const steel = std(desert ? 0x3b3d40 : 0x4a4c4e, { roughness: 0.55, metalness: 0.6 });
    const tex = checkerTexture();
    tex.repeat.set(18, 1);
    const beamMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const gantry = new THREE.Group();
    const half = ROAD_HALF + 2.2, H = 7;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), steel);
      post.position.set(s * half, H / 2, 0);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), steel);
      brace.position.set(s * (half - 0.9), H - 1.4, 0);
      brace.rotation.z = -s * 0.6;
      gantry.add(post, brace);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 1.1, 0.5), beamMat);
    beam.position.y = H - 0.2;
    gantry.add(beam);
    for (const x of [-4, -1.3, 1.3, 4]) { // lamps
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
      lamp.position.set(x, H - 0.95, 0.4);
      gantry.add(lamp);
    }
    const p = pointAt(0, 0);
    gantry.position.set(p.x, S.y[0], p.z);
    gantry.rotation.y = p.yaw;
    gantry.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(gantry);
  }

  // Extrudes a cross-section along the lap on one side. prof = [inset toward the road, height].
  ribbon(side, prof, { color, uv } = {}) {
    const N = LOOP.n, m = prof.length, rows = N + 1;
    const pos = new Float32Array(rows * m * 3), col = color ? new Float32Array(rows * m * 3) : null, tc = uv ? new Float32Array(rows * m * 2) : null;
    const c = [0, 0, 0];
    for (let a = 0; a < rows; a++) {
      const i = a % N;
      for (let j = 0; j < m; j++) {
        const [inset, h] = prof[j];
        const p = pointAt(i, side * (RAIL_LAT - inset)), q = a * m + j;
        pos[q * 3] = p.x; pos[q * 3 + 1] = S.y[i] - 0.1 + h; pos[q * 3 + 2] = p.z;
        if (col) { color(i, j, h, c); col[q * 3] = c[0]; col[q * 3 + 1] = c[1]; col[q * 3 + 2] = c[2]; }
        if (tc) { const t = uv(a, j, h); tc[q * 2] = t[0]; tc[q * 2 + 1] = t[1]; }
      }
    }
    const idx = [];
    for (let a = 0; a < rows - 1; a++) for (let j = 0; j < m - 1; j++) {
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

  // Jersey barriers along both edges: sloped foot, a paint band (chevrons through the
  // tight corners, a plain stripe on the straights), grimy base, joints every 3 m.
  buildWalls() {
    const desert = this.def.kind === 'desert';
    const concrete = desert ? [0.74, 0.71, 0.65] : [0.5, 0.49, 0.46];
    const stripe = desert ? [0.86, 0.84, 0.78] : [0.66, 0.64, 0.58];
    const warn = desert ? [0.88, 0.7, 0.14] : [0.66, 0.54, 0.2];
    const prof = [[0.32, 0], [0.32, 0.12], [0.14, 0.34], [0.07, 0.5], [0.05, 0.8], [0.04, 0.95], [-0.28, 0.95], [-0.28, 0]];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const g = this.ribbon(side, prof, {
        color: (i, j, h, out) => {
          const tight = Math.abs(S.k[i]) > 0.011;
          const joint = i % 3 === 0 ? 0.82 : 1;
          const v = (0.88 + 0.12 * hash(Math.floor(i / 3), side)) * joint;
          let base = concrete;
          if (j === 3 || j === 4) base = tight ? (Math.floor(i / 2) % 2 ? warn : [0.1, 0.1, 0.11]) : stripe;
          const grime = h < 0.2 ? 0.7 : h > 0.9 ? 1.05 : 1;
          out[0] = base[0] * v * grime; out[1] = base[1] * v * grime; out[2] = base[2] * v * grime;
        },
      });
      const wall = new THREE.Mesh(g, mat);
      wall.castShadow = wall.receiveShadow = true;
      this.group.add(wall);
    }
  }

  place(proto, i, lat, yawOff = 0) {
    const p = pointAt(i, lat);
    const o = proto.clone();
    o.position.set(p.x, this.terrainH(p.x, p.z, roadN(p.x, p.z, 2)) - 0.05, p.z);
    o.rotation.y = p.yaw + yawOff;
    this.group.add(o);
    return o;
  }

  buildDesert() {
    const r = rng(4242);
    const veg = vcMat(), vegSmooth = vcMat({ flatShading: false }), grass = vcMat({ flatShading: false, side: THREE.DoubleSide });
    const geo = { bush: bushGeo(), grass: grassGeo(), sag: [saguaroGeo(0, 20), saguaroGeo(1, 21), saguaroGeo(2, 22)], pebble: rockGeo(0, 31, 0.25), rock: rockGeo(1, 41, 0.3), boulder: rockGeo(1, 47, 0.35), mesa: mesaGeo(5) };
    const b = this.box, M = 150;
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
    const bushes = scatter(520, RAIL_LAT + 3, 130, () => { const s = 0.55 + r() * 0.75; return { ry: r() * 6.3, sx: s, sy: s * (0.6 + r() * 0.6), sz: s * (0.8 + r() * 0.4) }; });
    lowY(bushes, -0.08);
    this.group.add(instanced(geo.bush, veg, bushes));
    const tufts = scatter(750, RAIL_LAT + 2, 70, () => ({ ry: r() * 6.3, s: 0.7 + r() * 0.9 }));
    this.group.add(instanced(geo.grass, grass, tufts, false));
    const sag = [[], [], []];
    for (const p of scatter(70, RAIL_LAT + 6, 140, () => ({ ry: r() * 6.3, s: 0.75 + r() * 0.55 }))) sag[Math.floor(r() * 3)].push(p);
    sag.forEach((list, q) => { lowY(list, -0.1); if (list.length) this.group.add(instanced(geo.sag[q], vegSmooth, list)); });
    this.group.add(instanced(geo.pebble, veg, scatter(260, RAIL_LAT + 2, 110, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.4, s: 0.12 + r() * 0.3 })), false));
    const rocks = scatter(150, RAIL_LAT + 5, 160, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 0.6 + r() * 1.6 }));
    lowY(rocks, -0.2);
    this.group.add(instanced(geo.rock, veg, rocks));
    const bould = scatter(40, 24, 200, () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 2.5 + r() * 5 }));
    lowY(bould, -0.8);
    this.group.add(instanced(geo.boulder, veg, bould));
    // distant mesas ringing the loop
    const mesas = [];
    for (let q = 0; q < 26; q++) {
      const a = (q / 26) * Math.PI * 2 + r() * 0.2;
      const rad = 70 + r() * 110, dist = Math.max(b.maxx - b.minx, b.maxz - b.minz) * 0.5 + 330 + r() * 160;
      mesas.push({ x: b.cx + Math.cos(a) * dist, y: -16, z: b.cz + Math.sin(a) * dist * 1.1, sx: rad * (0.8 + r() * 0.6), sy: 45 + r() * 70, sz: rad, ry: r() * 6.3 });
    }
    this.group.add(instanced(geo.mesa, veg, mesas, false));
    // billboards and a water tower around the infield
    const bake = (o) => { bakeGroup(o); return o; };
    const boards = [61, 62, 63].map((s) => bake(billboard(s)));
    const tower = bake(waterTower());
    const N = LOOP.n;
    [[0.07, 1, 30, 0.45], [0.31, -1, 34, -0.45], [0.55, 1, 31, 0.5], [0.8, -1, 33, -0.4]].forEach(([f, side, lat, yaw], q) => {
      this.place(boards[q % 3], Math.floor(f * N), side * lat, Math.PI + yaw);
    });
    this.place(tower, Math.floor(0.42 * N), 52, 1.1);
  }

  buildYard() {
    const r = rng(777);
    const N = LOOP.n;
    // ---- corrugated sheet wall, posts, razor wire ----
    const OUT = 2.4; // metres behind the barrier
    const sheet = new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 4, seed: 9, rust: 1, tint: [[150, 146, 138], [128, 132, 134], [150, 118, 96], [112, 120, 126]] }), roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const g = this.ribbon(side, [[-OUT, 0], [-OUT, 3.4]], { uv: (a, j) => [a / 9.6, j] });
      const m = new THREE.Mesh(g, sheet);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      const posts = [], wire = [];
      for (let i = 0; i < N; i += 4) {
        const p = pointAt(i, side * (RAIL_LAT + OUT + 0.15));
        posts.push({ x: p.x, y: S.y[i] - 0.1 + 1.95, z: p.z, ry: p.yaw });
      }
      for (let i = 0; i < N; i += 2) {
        const a = pointAt(i, side * (RAIL_LAT + OUT + 0.2)), b = pointAt(i + 1, side * (RAIL_LAT + OUT + 0.2)), c = pointAt(i + 2, side * (RAIL_LAT + OUT + 0.2));
        const y = S.y[i] - 0.1 + 3.55, y1 = S.y[(i + 1) % N] - 0.1 + 3.55, y2 = S.y[(i + 2) % N] - 0.1 + 3.55;
        wire.push(a.x, y, a.z, b.x, y1 + 0.38, b.z, b.x, y1 + 0.38, b.z, c.x, y2, c.z, a.x, y + 0.2, a.z, c.x, y2 + 0.2, c.z);
      }
      this.group.add(instanced(new THREE.BoxGeometry(0.2, 3.9, 0.2), std(0x3f4143, { roughness: 0.6, metalness: 0.5 }), posts));
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2826 })));
    }
    // ---- shipping containers in stacks outside the wall ----
    const tints = [0x7a4a3c, 0x44586c, 0x55645a, 0x9a7f3c, 0xa8a193, 0x6c3d36].map(C);
    const cmat = new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 1, seed: 3, rust: 0.8 }), roughness: 0.7, metalness: 0.3 });
    const boxes = [];
    const placed = [];
    for (let q = 0; q < 700 && boxes.length < 260; q++) {
      const i = Math.floor(r() * N), side = r() < 0.5 ? -1 : 1;
      const lat = side * (RAIL_LAT + OUT + 8 + r() * 34);
      const p = pointAt(i, lat);
      const n = roadN(p.x, p.z, 2);
      if (!n || Math.abs(n.lat) < RAIL_LAT + OUT + 5) continue;
      if (placed.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 15)) continue;
      placed.push(p);
      const y = this.terrainH(p.x, p.z, n), ry = p.yaw + (r() < 0.2 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.06;
      const h = r() < 0.5 ? 1 : r() < 0.6 ? 2 : 3;
      for (let k = 0; k < h; k++) boxes.push({ x: p.x, y: y + 1.3 + k * 2.6, z: p.z, ry: ry + (r() - 0.5) * 0.05, tint: tints[Math.floor(r() * tints.length)] });
    }
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(12.2, 2.6, 2.4), cmat, boxes.length);
    const o = new THREE.Object3D();
    boxes.forEach((t, k) => {
      o.position.set(t.x, t.y, t.z); o.rotation.set(0, t.ry, 0); o.updateMatrix();
      cm.setMatrixAt(k, o.matrix); cm.setColorAt(k, t.tint);
    });
    cm.castShadow = cm.receiveShadow = true;
    this.group.add(cm);
    // ---- floodlight towers ----
    const poles = [], heads = [];
    for (let i = 20; i < N; i += 110) {
      const side = (i / 110) % 2 < 1 ? 1 : -1;
      const p = pointAt(i, side * (RAIL_LAT + OUT + 3.5)), y = this.terrainH(p.x, p.z, roadN(p.x, p.z, 2));
      poles.push({ x: p.x, y: y + 7.5, z: p.z, ry: p.yaw });
      heads.push({ x: p.x, y: y + 15.2, z: p.z, ry: p.yaw + Math.PI / 2 });
    }
    this.group.add(instanced(new THREE.CylinderGeometry(0.18, 0.3, 15, 8), std(0x4a4c4e, { roughness: 0.6, metalness: 0.5 }), poles));
    this.group.add(instanced(new THREE.BoxGeometry(4.2, 0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff0c8 }), heads, false));
    // ---- barrels and stacked barrier blocks between barrier and sheet on the outside of corners ----
    const barrels = [], blocks = [];
    for (let i = 0; i < N; i += 7) {
      if (Math.abs(S.k[i]) < 0.012 || hash(i, 91) < 0.35) continue;
      const side = S.k[i] > 0 ? -1 : 1;
      const p = pointAt(i, side * (RAIL_LAT + 1.2)), y = S.y[i] - 0.1;
      if (hash(i, 92) < 0.5) barrels.push({ x: p.x, y: y + 0.45, z: p.z, ry: r() * 6, s: 0.9 + r() * 0.2 });
      else blocks.push({ x: p.x, y: y + 0.4, z: p.z, ry: p.yaw + (r() - 0.5) * 0.3 });
    }
    this.group.add(instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), std(0x6b4a3a, { roughness: 0.8, metalness: 0.3 }), barrels));
    this.group.add(instanced(new THREE.BoxGeometry(0.7, 0.8, 1.6), std(0x8f8b82, { roughness: 0.95 }), blocks));
  }
}
