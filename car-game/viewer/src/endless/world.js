import * as THREE from 'three';
import { makeNoise2D, fbm, smoothstep, rng } from '../level/noise.js';
import { paintRoad, LATS as ROAD_LATS, DY as ROAD_DY } from '../level/road.js';
import { FACES, std, metal, billboard, waterTower, windpump, shed } from '../level/structures.js';
import { vcMat, bushGeo, grassGeo, saguaroGeo, ocotilloGeo, rockGeo, mesaGeo, instanced } from '../level/props.js';
import { box, cyl, tube, mesh } from '../lib/geo.js';
import { bakeGroup } from '../level/bake.js';
import {
  S, STEP, I_START, ROAD_HALF, ROAD_BEVEL, FENCE, RAIL_LAT, ensure, pointAt, nearest,
} from './route.js';
import { biomeAt } from './biomes.js';

// Streams the world in chunks of CH metres along the endless route: road-aligned
// faceted terrain, asphalt, guardrails on sharp curves, fences, a power line, signs,
// landmarks and scatter. Everything is deterministic per sample index, so chunk
// borders line up and nothing pops when a neighbour is rebuilt.

export const CH = 160;
const RS = 4; // terrain row spacing (samples)
const AHEAD = 6; // chunks kept in front of the car
const BEHIND = 1;
const LAT = (() => {
  const pos = [0];
  let x = 0, step = 2.5;
  while (x < 380) {
    if (x > 40) step = Math.min(24, step * 1.12);
    x += step;
    pos.push(Math.min(380, x));
  }
  return [...pos.slice(1).reverse().map((v) => -v), ...pos];
})();
const COLS = LAT.length;

const nA = makeNoise2D(11), nB = makeNoise2D(23), nC = makeNoise2D(37), nD = makeNoise2D(51);
const hash = (a, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const distAt = (i) => (i - I_START) * STEP;

function heightFn(i, lat, x, z, B) {
  const d = Math.abs(lat);
  const gentle = fbm(nA, x / 34, z / 34, 3) * 0.8 + fbm(nB, x / 8, z / 8, 2) * 0.1;
  const dunes = fbm(nB, x / 95, z / 95, 4) * B.dunes;
  const ditch = -0.45 * smoothstep(7.2, 9.5, d) * (1 - smoothstep(11.5, 16, d));
  const tRoad = smoothstep(ROAD_HALF + 1.0, ROAD_HALF + 11, d);
  const hills = (fbm(nC, x / 260, z / 260, 5) * 0.55 + 0.5) * B.hills * smoothstep(B.hillStart, B.hillStart + 116, d);
  const crags = Math.max(0, fbm(nD, x / 70, z / 70, 3)) * B.crags * smoothstep(B.hillStart + 26, B.hillStart + 126, d);
  const edge = smoothstep(250, 380, d) * B.edge;
  return S.y[i] - 0.03 + ditch + tRoad * (gentle + dunes * smoothstep(14, 45, d)) + hills + crags + edge;
}

// Sharp-curve guardrail on the outside: +1 right, -1 left, 0 none.
export function railSide(i) {
  let best = 0;
  for (let j = i - 24; j <= i + 24; j += 4) {
    if (j < 0 || j >= S.count) continue;
    const k = S.k[j];
    if (Math.abs(k) > Math.abs(best)) best = k;
  }
  if (Math.abs(best) < 1 / 900) return 0;
  return best > 0 ? -1 : 1; // turning right -> the outside is on the left
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.colliders = [];
    this.updaters = [];
    this.hint = I_START;
    this.mat = {
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
      road: new THREE.MeshStandardMaterial({ map: paintRoad({ dashed: true }), roughness: 0.93 }),
      rail: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
      post: std(0x6b5b4a, { roughness: 1 }),
      pole: std(0x6a5440, { roughness: 1 }),
      railPost: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.6, metalness: 0.6 }),
      delin: std(0xe8e4da, { roughness: 0.7 }),
      reflector: new THREE.MeshStandardMaterial({ color: 0xffb21a, emissive: 0xff9a10, emissiveIntensity: 0.35, roughness: 0.3 }),
      veg: vcMat(),
      vegSmooth: vcMat({ flatShading: false }),
      grass: vcMat({ flatShading: false, side: THREE.DoubleSide }),
      wire: new THREE.LineBasicMaterial({ color: 0x3b3632 }),
      pwire: new THREE.LineBasicMaterial({ color: 0x2a2623 }),
      signPost: metal(0x9aa0a5, { roughness: 0.5 }),
    };
    this.geo = {
      bush: bushGeo(), grass: grassGeo(), sag: [saguaroGeo(0, 20), saguaroGeo(1, 21), saguaroGeo(2, 22)],
      oco: ocotilloGeo(), pebble: rockGeo(0, 31, 0.25), rock: rockGeo(1, 41, 0.3), boulder: rockGeo(1, 47, 0.35),
      mesa: mesaGeo(5), post: new THREE.CylinderGeometry(0.055, 0.07, 1.3, 6), railPost: new THREE.BoxGeometry(0.1, 0.86, 0.16),
      delin: new THREE.BoxGeometry(0.1, 1.1, 0.07), reflector: new THREE.BoxGeometry(0.11, 0.16, 0.08),
    };
    // Landmark prototypes, baked once and cloned per placement
    const bake = (o, opts) => { bakeGroup(o, opts); return o; };
    this.proto = {
      billboards: [61, 62, 63].map((s) => bake(billboard(s))),
      tower: bake(waterTower()),
      shed: bake(shed()),
    };
    this.signFaces = new Map();
    // Far ground that follows the camera so the horizon never shows an edge
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(4000, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd49a62, roughness: 1 }));
    this.disc.position.y = -14;
    scene.add(this.disc);
  }

  face(key, make) {
    if (!this.signFaces.has(key)) this.signFaces.set(key, make());
    return this.signFaces.get(key);
  }

  // Build/drop chunks around sample index i. `burst` builds everything needed now.
  update(i, burst = false) {
    const kc = Math.floor(i / CH);
    let built = 0;
    for (let k = Math.max(0, kc - BEHIND); k <= kc + AHEAD; k++) {
      if (this.chunks.has(k)) continue;
      if (!burst && built >= 1) break;
      this.build(k);
      built++;
    }
    for (const [k, c] of this.chunks) {
      if (k < kc - BEHIND - 1 || k > kc + AHEAD + 1) this.drop(k, c);
    }
    if (built) this.rebuildColliders();
  }

  follow(x, z) {
    this.disc.position.x = x;
    this.disc.position.z = z;
  }

  tick(dt) {
    for (const f of this.updaters) f(dt);
  }

  rebuildColliders() {
    this.colliders.length = 0;
    for (const c of this.chunks.values()) this.colliders.push(...c.colliders);
  }

  drop(k, c) {
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o.userData.shared) return;
      if (o.geometry && !Object.values(this.geo).includes(o.geometry) && !o.userData.protoGeo) o.geometry.dispose();
    });
    if (c.updater) this.updaters.splice(this.updaters.indexOf(c.updater), 1);
    this.chunks.delete(k);
  }

  // Terrain height anywhere (uses the loaded chunk grid, falls back to the formula).
  heightAt(x, z) {
    const n = nearest(x, z, this.hint);
    this.hint = n.i;
    return this.heightAtN(x, z, n);
  }

  heightAtN(x, z, n) {
    const c = this.chunks.get(Math.floor(n.f / CH));
    if (!c) return heightFn(n.i, n.lat, x, z, biomeAt(distAt(n.i)));
    return c.sample(n.f, n.lat);
  }

  build(k) {
    const i0 = k * CH, i1 = i0 + CH;
    ensure(i1 + 600);
    const group = new THREE.Group();
    group.name = `chunk_${k}`;
    const colliders = [];
    const r = rng(1000 + k * 7919);
    const exclusions = [];

    // ---- Terrain (road-aligned grid) ----
    const rows = CH / RS + 1;
    const H = new Float32Array(rows * COLS);
    const pos = new Float32Array(rows * COLS * 3);
    const col = new Float32Array(rows * COLS * 3);
    const tmp = new THREE.Color(), rock = new THREE.Color();
    for (let rr = 0; rr < rows; rr++) {
      const i = i0 + rr * RS;
      const B = biomeAt(distAt(i));
      for (let c = 0; c < COLS; c++) {
        const p = pointAt(i, LAT[c]);
        const h = heightFn(i, LAT[c], p.x, p.z, B);
        const q = rr * COLS + c;
        H[q] = h;
        pos[q * 3] = p.x; pos[q * 3 + 1] = h; pos[q * 3 + 2] = p.z;
        // colour (slope approximated from height above the road)
        const d = Math.abs(LAT[c]);
        const elev = h - S.y[i];
        tmp.copy(B.sandA).lerp(B.sandB, fbm(nA, p.x / 60, p.z / 60, 3) * 0.5 + 0.5);
        tmp.lerp(B.dark, smoothstep(0.1, 0.45, fbm(nD, p.x / 25, p.z / 25, 3)) * 0.45);
        tmp.lerp(B.pale, smoothstep(0.25, 0.6, fbm(nB, p.x / 12, p.z / 45, 2)) * 0.3);
        const rockiness = smoothstep(6, 26, elev) * 0.85;
        if (rockiness > 0) {
          const strata = 0.5 + 0.5 * Math.sin(h * 0.9 + fbm(nC, p.x / 40, p.z / 40, 2) * 3);
          rock.copy(B.rockA).lerp(B.rockB, strata);
          if (strata > 0.85) rock.lerp(B.rockD, 0.5);
          tmp.lerp(rock, rockiness);
        }
        tmp.lerp(B.gravel, (1 - smoothstep(ROAD_BEVEL, ROAD_BEVEL + 3.5, d)) * 0.4);
        col[q * 3] = tmp.r; col[q * 3 + 1] = tmp.g; col[q * 3 + 2] = tmp.b;
      }
    }
    const idx = [];
    for (let rr = 0; rr < rows - 1; rr++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = rr * COLS + c, b = a + 1, cc = a + COLS, d = cc + 1;
        // positive lat runs toward -X, so swap the winding to keep faces up
        if (hash(i0 + rr * RS, c) < 0.5) idx.push(a, b, cc, b, d, cc);
        else idx.push(a, d, cc, a, b, d);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, this.mat.terrain);
    terrain.receiveShadow = true;
    group.add(terrain);
    const sample = (f, lat) => {
      const rf = Math.min(rows - 1.0001, Math.max(0, (f - i0) / RS));
      const rr = Math.floor(rf), v = rf - rr;
      const lq = Math.min(LAT[COLS - 1] - 1e-3, Math.max(LAT[0], lat));
      let lo = 0, hi = COLS - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LAT[m] <= lq) lo = m; else hi = m; }
      const u = (lq - LAT[lo]) / (LAT[hi] - LAT[lo]);
      const q = rr * COLS + lo;
      return (H[q] * (1 - u) + H[q + 1] * u) * (1 - v) + (H[q + COLS] * (1 - u) + H[q + COLS + 1] * u) * v;
    };
    const ground = (i, lat) => sample(i, lat);

    // ---- Asphalt ----
    {
      const m = ROAD_LATS.length;
      const n = i1 - i0 + 1;
      const rp = new Float32Array(n * m * 3), ruv = new Float32Array(n * m * 2);
      for (let a = 0; a < n; a++) {
        const i = i0 + a;
        for (let j = 0; j < m; j++) {
          const p = pointAt(i, ROAD_LATS[j]);
          const q = a * m + j;
          rp[q * 3] = p.x; rp[q * 3 + 1] = S.y[i] + ROAD_DY[j]; rp[q * 3 + 2] = p.z;
          ruv[q * 2] = (ROAD_LATS[j] + ROAD_BEVEL) / (2 * ROAD_BEVEL);
          ruv[q * 2 + 1] = (i * STEP) / 64;
        }
      }
      const ri = [];
      for (let a = 0; a < n - 1; a++) for (let j = 0; j < m - 1; j++) {
        const q = a * m + j;
        ri.push(q, q + 1, q + m, q + 1, q + m + 1, q + m);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
      g.setIndex(ri);
      g.computeVertexNormals();
      const road = new THREE.Mesh(g, this.mat.road);
      road.receiveShadow = true;
      group.add(road);
    }

    // ---- Guardrails on sharp curves ----
    {
      const prof = [[0.0, 0.47], [0.06, 0.52], [0.015, 0.585], [0.06, 0.65], [0.0, 0.705], [0.0, 0.725]];
      const posts = [];
      for (const side of [-1, 1]) {
        let run = null;
        const flush = () => {
          if (!run || run.length < 2) { run = null; return; }
          const P = [], Cc = [], I = [];
          run.forEach((i, kk) => {
            const startsHere = railSide(i - 6) !== side;
            const endsHere = railSide(i + 6) !== side;
            const fromStart = kk + (startsHere ? 0 : 99), fromEnd = run.length - 1 - kk + (endsHere ? 0 : 99);
            const hf = smoothstep(0, 6, Math.min(fromStart, fromEnd));
            const base = pointAt(i, side * RAIL_LAT);
            const gy = ground(i, side * RAIL_LAT);
            const dirt = 0.82 + 0.18 * Math.sin(i * 0.37) * Math.sin(i * 0.11);
            for (const [inset, hh] of prof) {
              const p = pointAt(i, side * (RAIL_LAT - inset * hf));
              P.push(p.x, gy + hh * hf - (1 - hf) * 0.05, p.z);
              Cc.push(0.62 * dirt, 0.64 * dirt, 0.66 * dirt);
            }
            if (i % 2 === 0) { const pp = pointAt(i, side * (RAIL_LAT + 0.22)); posts.push({ x: pp.x, y: gy + 0.33, z: pp.z, ry: base.yaw }); }
          });
          const pm = prof.length;
          for (let kk = 0; kk < run.length - 1; kk++) for (let j = 0; j < pm - 1; j++) {
            const a = kk * pm + j;
            I.push(a, a + pm, a + 1, a + 1, a + pm, a + pm + 1);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
          g.setIndex(I);
          g.computeVertexNormals();
          const m = new THREE.Mesh(g, this.mat.rail);
          m.castShadow = m.receiveShadow = true;
          group.add(m);
          run = null;
        };
        for (let i = i0; i <= i1; i++) {
          if (railSide(i) === side) (run ??= []).push(i);
          else flush();
        }
        flush();
      }
      if (posts.length) group.add(instanced(this.geo.railPost, this.mat.railPost, posts));
    }

    // ---- Delineator posts every 25 m on both shoulders: the main sense-of-speed ticks ----
    {
      const dp = [], rf = [];
      for (let i = Math.ceil(i0 / 25) * 25; i < i1; i += 25) {
        for (const side of [-1, 1]) {
          if (railSide(i) === side) continue;
          const lat = side * 8.1;
          const p = pointAt(i, lat), y = ground(i, lat);
          const ry = p.yaw + (hash(i, side + 11) - 0.5) * 0.15, rz = (hash(i, side + 13) - 0.5) * 0.08;
          dp.push({ x: p.x, y: y + 0.5, z: p.z, ry, rz });
          rf.push({ x: p.x, y: y + 0.88, z: p.z, ry, rz });
        }
      }
      if (dp.length) {
        group.add(instanced(this.geo.delin, this.mat.delin, dp));
        group.add(instanced(this.geo.reflector, this.mat.reflector, rf, false));
      }
    }

    // ---- Fences (posts every 4 m, three strands; deterministic per sample) ----
    {
      const posts = [], wires = [];
      const postAt = (i, side) => {
        if (hash(i, side + 7) < 0.06) return null;
        const p = pointAt(i, side * FENCE);
        return { x: p.x, z: p.z, y: ground(i, side * FENCE) };
      };
      for (const side of [-1, 1]) {
        for (let i = Math.ceil(i0 / 4) * 4; i < i1; i += 4) {
          const a = postAt(i, side);
          if (!a) continue;
          posts.push({ x: a.x, y: a.y + 0.55, z: a.z, rx: (hash(i, side) - 0.5) * 0.12, ry: hash(i, 3) * 3, rz: (hash(i, side + 2) - 0.5) * 0.12, sy: (1.2 + hash(i, 5) * 0.15) / 1.3 });
          const b = postAt(i + 4, side);
          if (!b) continue;
          const by = i + 4 <= i1 ? b.y : this.heightAtN(b.x, b.z, nearest(b.x, b.z, i + 4));
          for (const hh of [0.42, 0.75, 1.05]) {
            if (hash(i, hh * 100 + side) < 0.04) continue;
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + by) / 2 + hh - 0.07;
            wires.push(a.x, a.y + hh, a.z, mx, my, mz, mx, my, mz, b.x, by + hh, b.z);
          }
        }
      }
      group.add(instanced(this.geo.post, this.mat.post, posts));
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      group.add(new THREE.LineSegments(wg, this.mat.wire));
    }

    // ---- Power line on the left, poles every 55 m ----
    {
      const pg = new THREE.Group();
      const pw = [];
      const arms = (i) => {
        const p = pointAt(i, -27);
        const nb = nearest(p.x, p.z, i);
        const y = i < i1 ? ground(i, -27) : this.heightAtN(p.x, p.z, nb);
        const o = new THREE.Object3D();
        o.position.set(p.x, y, p.z);
        o.rotation.set((hash(i, 1) - 0.5) * 0.04, p.yaw, (hash(i, 2) - 0.5) * 0.04);
        o.updateMatrixWorld(true);
        return { o, pts: [-1.05, -0.35, 1.05].map((sx) => new THREE.Vector3(sx, 9.14, 0).applyMatrix4(o.matrixWorld)) };
      };
      for (let i = Math.ceil(i0 / 55) * 55; i < i1; i += 55) {
        const { o, pts } = arms(i);
        o.add(cyl(0.12, 0.16, 9.6, 8, this.mat.pole, { pos: [0, 4.8, 0] }));
        o.add(box(2.4, 0.12, 0.12, this.mat.pole, { pos: [0, 8.9, 0] }));
        for (const sx of [-1.05, -0.35, 1.05]) o.add(cyl(0.05, 0.07, 0.18, 8, std(0x6b3a22, { roughness: 0.35 }), { pos: [sx, 9.05, 0] }));
        if (hash(i, 9) < 0.25) o.add(cyl(0.3, 0.3, 0.8, 12, metal(0x8e9396), { pos: [0, 7.4, 0.32] }));
        pg.add(o);
        exclusions.push({ x: o.position.x, z: o.position.z, r: 1.5 });
        const next = arms(i + 55).pts;
        for (let w = 0; w < 3; w++) {
          let last = pts[w];
          for (let q = 1; q <= 10; q++) {
            const t = q / 10;
            const v = new THREE.Vector3().lerpVectors(pts[w], next[w], t);
            v.y -= 4 * t * (1 - t);
            pw.push(last.x, last.y, last.z, v.x, v.y, v.z);
            last = v;
          }
        }
      }
      bakeGroup(pg);
      group.add(pg);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pw, 3));
      group.add(new THREE.LineSegments(g, this.mat.pwire));
    }

    // ---- Signs: mile markers, speed limits, curve warnings, chevrons ----
    {
      const sg = new THREE.Group();
      const place = (face, i, lat, w, h, postH = 1.6) => {
        const p = pointAt(i, lat);
        const g = new THREE.Group();
        g.position.set(p.x, ground(i, lat), p.z);
        g.rotation.y = p.yaw + Math.PI;
        g.add(box(0.07, postH + h * 0.6, 0.07, this.mat.signPost, { pos: [0, (postH + h * 0.6) / 2, -0.04] }));
        face.fm ??= new THREE.MeshStandardMaterial({ map: face.front, alphaTest: 0.5, roughness: 0.55 });
        face.bm ??= new THREE.MeshStandardMaterial({ map: face.sil, color: 0x8b9095, alphaTest: 0.5, roughness: 0.5, metalness: 0.5 });
        g.add(mesh(new THREE.PlaneGeometry(w, h), face.fm, { pos: [0, postH + h / 2, 0.005] }));
        g.add(mesh(new THREE.PlaneGeometry(w, h), face.bm, { pos: [0, postH + h / 2, -0.004], rot: [0, Math.PI, 0] }));
        sg.add(g);
        colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.12 });
      };
      for (let i = i0; i < i1; i++) {
        const d = distAt(i);
        if (d > 0 && d % 1609 < 1) {
          const mile = Math.round(d / 1609);
          place(this.face(`mile${mile}`, () => FACES.mile(Math.min(99, mile), mile)), i, 8.0, 0.32, 0.75, 0.8);
        }
        if (d % 2200 > 300 && d % 2200 < 301) place(this.face(`spd${d % 4400 < 2200 ? 65 : 55}`, () => FACES.speed(d % 4400 < 2200 ? 65 : 55, 1)), i, 8.2, 0.9, 0.9);
        // curve warning 150 m before a sharp curve begins
        const ahead = i + 150;
        if (ahead < S.count && Math.abs(S.k[ahead]) > 1 / 900 && Math.abs(S.k[ahead - 1]) <= 1 / 900) {
          const dir = S.k[ahead] > 0 ? 1 : -1;
          place(this.face(`curve${dir}`, () => FACES.curve(dir, 3)), i, 8.2, 0.95, 0.95);
        }
        const rs = railSide(i);
        if (rs && i % 40 === 0) place(this.face(`chev${rs}`, () => FACES.chevron(-rs, 4)), i, rs * (RAIL_LAT + 0.7), 0.55, 0.75, 1.0);
      }
      if (sg.children.length) { bakeGroup(sg); group.add(sg); }
    }

    // ---- Landmarks outside the fences ----
    {
      const B = biomeAt(distAt(i0 + CH / 2));
      const put = (proto, i, lat, yawOff) => {
        const p = pointAt(i, lat);
        const o = proto.clone();
        o.traverse((m) => { m.userData.protoGeo = true; });
        o.position.set(p.x, ground(i, lat) - 0.05, p.z);
        o.rotation.y = p.yaw + yawOff;
        group.add(o);
        exclusions.push({ x: p.x, z: p.z, r: 8 });
        return o;
      };
      if (r() < B.billboard) {
        const right = r() < 0.6;
        put(this.proto.billboards[Math.floor(r() * 3)], i0 + 20 + Math.floor(r() * 120), right ? 32 + r() * 6 : -(35 + r() * 6), Math.PI + (right ? 0.45 : -0.45));
      }
      if (r() < B.tower) put(this.proto.tower, i0 + 20 + Math.floor(r() * 120), (r() < 0.5 ? -1 : 1) * (48 + r() * 14), r() * 6);
      if (r() < B.windpump) {
        const i = i0 + 30 + Math.floor(r() * 100);
        const wp = windpump();
        bakeGroup(wp.g, { skip: (o) => o.name === 'rotor' });
        const p = pointAt(i, 42);
        wp.g.position.set(p.x, ground(i, 42) - 0.05, p.z);
        wp.g.rotation.y = p.yaw + 0.9;
        group.add(wp.g);
        exclusions.push({ x: p.x, z: p.z, r: 7 });
        put(this.proto.shed, i + 14, 52, 0.2);
        const rotor = wp.rotor;
        this._pendingUpdater = (dt) => { rotor.rotation.z -= dt * 2.2; };
      }
    }

    // ---- Scatter ----
    {
      const pick = (latMax, power, latMin = ROAD_BEVEL + 1.4) => {
        const i = i0 + r() * CH;
        const lat = (r() < 0.5 ? -1 : 1) * (latMin + Math.pow(r(), power) * (latMax - latMin));
        const p = pointAt(Math.floor(i), lat);
        const x = p.x + (r() - 0.5) * 2, z = p.z + (r() - 0.5) * 2;
        if (exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) return null;
        const B = biomeAt(distAt(Math.floor(i)));
        return { x, z, lat, y: ground(i, lat), B };
      };
      const scatter = (n, latMax, power, key, extra = () => ({}), latMin) => {
        const out = [];
        for (let q = 0; q < n; q++) {
          const p = pick(latMax, power, latMin);
          if (!p || r() > p.B[key]) continue;
          out.push({ ...p, ...extra(p) });
        }
        return out;
      };
      const bushes = scatter(260, 230, 2.2, 'bush', () => { const s = 0.55 + r() * 0.75; return { ry: r() * 6.3, sx: s, sy: s * (0.6 + r() * 0.6), sz: s * (0.8 + r() * 0.4) }; });
      const fixY = (list, dy) => list.forEach((b) => { const n = nearest(b.x, b.z, i0 + CH / 2); b.y = sample(Math.min(i1, Math.max(i0, n.f)), n.lat) + dy; });
      fixY(bushes, -0.08);
      group.add(instanced(this.geo.bush, this.mat.veg, bushes));
      const tufts = scatter(480, 70, 1.8, 'grass', () => ({ ry: r() * 6.3, s: 0.7 + r() * 0.9 }), ROAD_BEVEL + 0.4);
      fixY(tufts, 0);
      group.add(instanced(this.geo.grass, this.mat.grass, tufts, false));
      const sag = [[], [], []];
      for (const p of scatter(26, 260, 1.6, 'saguaro', () => ({ ry: r() * 6.3, s: 0.75 + r() * 0.55 }), FENCE + 1.5)) sag[Math.floor(r() * 3)].push(p);
      for (const p of scatter(3, FENCE - 2, 1, 'saguaro', () => ({ ry: r() * 6.3, s: 0.8 + r() * 0.3 }), 9)) {
        sag[1 + Math.floor(r() * 2)].push(p);
        colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.42 });
      }
      sag.forEach((list, q) => { fixY(list, -0.1); if (list.length) group.add(instanced(this.geo.sag[q], this.mat.vegSmooth, list)); });
      const oco = scatter(16, 200, 1.6, 'ocotillo', () => ({ ry: r() * 6.3, s: 0.7 + r() * 0.5 }), 10);
      fixY(oco, 0);
      for (const p of oco) if (Math.abs(p.lat) < FENCE) colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.35 });
      if (oco.length) group.add(instanced(this.geo.oco, this.mat.vegSmooth, oco));
      const peb = scatter(180, 120, 1.7, 'rocks', () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.4, s: 0.12 + r() * 0.3 }), ROAD_BEVEL + 0.4);
      fixY(peb, -0.05);
      group.add(instanced(this.geo.pebble, this.mat.veg, peb, false));
      const rocks = scatter(50, 220, 1.4, 'rocks', () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 0.6 + r() * 1.6 }), FENCE + 1.5);
      fixY(rocks, -0.2);
      group.add(instanced(this.geo.rock, this.mat.veg, rocks));
      const bould = scatter(20, 280, 1.2, 'boulders', () => ({ ry: r() * 6.3, rx: (r() - 0.5) * 0.3, s: 2.5 + r() * 5 }), 40);
      fixY(bould, -0.8);
      group.add(instanced(this.geo.boulder, this.mat.veg, bould));
      // distant mesas beyond the terrain edge
      const mesas = [];
      if (r() < 0.6) {
        const i = i0 + Math.floor(r() * CH);
        const p = pointAt(i, (r() < 0.5 ? -1 : 1) * (650 + r() * 400));
        const rad = 70 + r() * 120;
        mesas.push({ x: p.x, y: -16, z: p.z, sx: rad * (0.8 + r() * 0.6), sy: 45 + r() * 70, sz: rad, ry: r() * 6.3 });
      }
      if (mesas.length) group.add(instanced(this.geo.mesa, this.mat.veg, mesas, false));
    }
    group.traverse((o) => { if (o.isInstancedMesh) o.userData.shared = false; });

    this.scene.add(group);
    const chunk = { group, colliders, sample };
    if (this._pendingUpdater) {
      chunk.updater = this._pendingUpdater;
      this.updaters.push(chunk.updater);
      this._pendingUpdater = null;
    }
    this.chunks.set(k, chunk);
  }
}
