import * as THREE from 'three';
import { rng, smoothstep } from '../level/noise.js';
import { std } from '../level/structures.js';
import { roadSurfaceY } from '../level/road.js';
import { box, tube } from '../lib/geo.js';
import { bakeGroup } from '../level/bake.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S, LOOP, ROAD_HALF, RAIL_LAT, wAt, pointAt } from './route.js';

// The decor kit. A track's `decor` list is data; applyDecor() turns each entry into
// geometry using three libraries:
//   FENCES  strips along the road side (barbed, woodrail, ranch, cable, pipe, chainlink,
//           sheet, trestle, concrete, netting, tires, hay, sandbags, containers)
//   MARKS   painted road decals (hatch, crosswalk, stopline, arrow, number, wear)
//   PROPS   instanced props (cone, barrel, tires, crate, bale, block, sandbag, pallet) and
//           GROUPS baked set pieces (bleacher, tent, tower)
// Entries (all positions are lap fractions 0..1; lat is metres from the centre line):
//   { fence: 'woodrail', a, b, side: 'both'|1|-1, abs: 19.5 | off: 2.4, fallback? }
//   { mark: 'hatch', at, len, lat: [lo, hi] (fractions of half width), sym? }
//   { scatter: 'barrel', a, b, side, abs: [lo, hi] | off: [lo, hi], every, p, cluster: [n, r], scale: [lo, hi], mix? }
//   { group: 'bleacher', at, side, off }

export const hash = (a, b = 0) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const C = (h) => new THREE.Color(h);
export const WHITE = new THREE.Color(1, 1, 1);
export const wrap = (i) => ((Math.round(i) % LOOP.n) + LOOP.n) % LOOP.n;
export const RL = (i) => RAIL_LAT * wAt(i); // barrier line
export const EDGE = (i) => ROAD_BEVEL_W * wAt(i); // edge of the asphalt
const ROAD_BEVEL_W = 6.6;
export const toWorld = (cx, cz, yaw, lx, lz) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

export const tex = (c, rep = true) => {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

// Vertical ribs on grey (corrugated sheet / containers); tinted per instance or baked in.
export function ribTexture({ panels = 1, tint = null, seed = 5, rust = 0.5 } = {}) {
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

export function chainTexture(cell = 1) {
  const [c, g] = canvas(64, 64);
  g.strokeStyle = 'rgba(176,181,185,0.95)';
  g.lineWidth = 2.2 / cell;
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.stroke();
  return tex(c);
}

const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ'; // yaw first, then tilt in the object's own frame
export function inst(geo, mat, list, { shadow = true } = {}) {
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
export const UNIT = new THREE.BoxGeometry(1, 1, 1);

const pick = (arr, k) => arr[Math.floor(k * arr.length) % arr.length];
const WOOD = [0x6d5a45, 0x7a644c, 0x5f4e3b, 0x846c52].map(C);
const STEEL = [0x7d8286, 0x6f7479, 0x8b9094].map(C);
const RUST = [0x7a3f26, 0x8a4a2c, 0x6b3a28, 0x9a5a38, 0x5e3322].map(C);
const kitMat = (tw) => (tw.kitMat ??= new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.15 }));

// Contiguous runs of sample indices in [a, b) (lap fractions); `skip` splits at bad samples.
function lapRuns(a, b, skip = null, minLen = 3) {
  const N = LOOP.n, out = [];
  let cur = null;
  for (let i = Math.floor(a * N); i < Math.floor(b * N); i++) {
    if (skip && skip(i)) { if (cur && cur.length >= minLen) out.push(cur); cur = null; } else (cur ??= []).push(i);
  }
  if (cur && cur.length >= minLen) out.push(cur);
  return out;
}
const tight = (i) => Math.abs(S.k[wrap(i)]) > 0.02;

// ---------------------------------------------------------------- fences
//
// Every fence builder takes a list of pieces { idx: [sample indices], lat: i => signed lat }
// and emits one batch of geometry for all of them, so a mixed fence of 200 pieces still
// costs a handful of draw calls.

const merged = (geos, mat) => {
  if (!geos.length) return null;
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
};

// Posts every `step` samples with rails between them, following slope and curve.
function postRail(tw, side, pieces, cfg, out = { posts: [], rails: [] }) {
  for (const { idx, lat: latOf } of pieces) {
    for (let k = 0; k < idx.length; k += cfg.step) {
      const i = idx[k], lat = latOf(i), p = pointAt(i, lat), y = tw.gl(i, lat);
      if (hash(i, side + 5) < (cfg.skip ?? 0)) continue;
      const j = idx[Math.min(idx.length - 1, k + cfg.step)], lat2 = latOf(j), q = pointAt(j, lat2), y2 = tw.gl(j, lat2);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z), len = Math.hypot(q.x - p.x, q.z - p.z);
      const c = cfg.colors ? pick(cfg.colors, hash(i, side + 9)) : WHITE;
      out.posts.push({ x: p.x, y: y + cfg.ph / 2, z: p.z, ry: yaw + (hash(i, 3) - 0.5) * (cfg.twist ?? 0.2), rz: (hash(i, 4) - 0.5) * (cfg.lean ?? 0.05), sx: cfg.pw, sy: cfg.ph * (0.95 + hash(i, 6) * 0.1), sz: cfg.pd ?? cfg.pw, c });
      if (j === i || len < 0.2) continue;
      for (const r of cfg.rails) {
        if (hash(i, r.y * 100 + side) < (cfg.railSkip ?? 0)) continue;
        const pitch = Math.atan2(y2 - y, len);
        out.rails.push({ x: (p.x + q.x) / 2, y: (y + y2) / 2 + r.y, z: (p.z + q.z) / 2, ry: yaw, rx: -pitch, sx: r.t, sy: r.h, sz: len + 0.05, c: r.c ?? c });
      }
    }
  }
  return out;
}
const addPR = (tw, out, shadow = true) => tw.add(inst(UNIT, kitMat(tw), out.posts), inst(UNIT, kitMat(tw), out.rails, { shadow }));

const FENCES = {
  // three strands of barbed wire on leaning wooden posts
  barbed(tw, side, pieces) {
    const posts = [], wires = [];
    for (const { idx, lat } of pieces) {
      const at = (i) => { const p = pointAt(i, lat(i)); return { x: p.x, z: p.z, y: tw.gl(i, lat(i)) }; };
      for (let k = 0; k < idx.length; k += 4) {
        const i = idx[k];
        if (hash(i, side + 7) < 0.06) continue;
        const a = at(i);
        posts.push({ x: a.x, y: a.y + 0.62, z: a.z, rx: (hash(i, side) - 0.5) * 0.12, ry: hash(i, 3) * 3, rz: (hash(i, side + 2) - 0.5) * 0.12, sx: 0.12, sy: 1.25 + hash(i, 5) * 0.2, sz: 0.12, c: pick(WOOD, hash(i, 8)) });
        const j = idx[Math.min(idx.length - 1, k + 4)];
        if (j === i) continue;
        const b = at(j);
        for (const hh of [0.42, 0.75, 1.05]) {
          if (hash(i, hh * 100 + side) < 0.04) continue;
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2 + hh - 0.07;
          wires.push(a.x, a.y + hh, a.z, mx, my, mz, mx, my, mz, b.x, b.y + hh, b.z);
        }
      }
    }
    tw.add(inst(UNIT, kitMat(tw), posts));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    tw.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3b3632 })));
  },
  woodrail(tw, side, pieces) {
    addPR(tw, postRail(tw, side, pieces, { step: 3, pw: 0.15, ph: 1.15, colors: WOOD, skip: 0.04, rails: [{ y: 0.5, t: 0.1, h: 0.13 }, { y: 0.92, t: 0.1, h: 0.13 }], railSkip: 0.05 }));
  },
  ranch(tw, side, pieces) {
    const w = [C(0xe4e0d4), C(0xd9d4c6), C(0xe9e6dc)];
    addPR(tw, postRail(tw, side, pieces, { step: 3, pw: 0.13, ph: 1.4, colors: w, skip: 0.02, rails: [0.45, 0.82, 1.2].map((y) => ({ y, t: 0.05, h: 0.2 })) }));
  },
  cable(tw, side, pieces) {
    addPR(tw, postRail(tw, side, pieces, { step: 5, pw: 0.1, ph: 1.05, colors: STEEL, lean: 0.02, rails: [0.4, 0.7, 0.98].map((y) => ({ y, t: 0.035, h: 0.035, c: C(0x9a9ea2) })) }), false);
  },
  pipe(tw, side, pieces) {
    addPR(tw, postRail(tw, side, pieces, { step: 3, pw: 0.09, ph: 1.1, colors: [C(0xc9a227), C(0xb88a1e)], lean: 0.01, rails: [0.55, 1.05].map((h) => ({ y: h, t: 0.07, h: 0.07 })) }));
  },
  // chain-link mesh on galvanised posts, top rail; some panels sag or are patched
  chainlink(tw, side, pieces) {
    tw.chainMat ??= new THREE.MeshStandardMaterial({ map: chainTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 });
    const geos = [];
    for (const pc of pieces) {
      const H = pc.h ?? 3.0;
      geos.push(tw.ribbon(side, [[0, 0.05], [0, H]], pc.idx, { latFn: pc.lat, uv: (a, j) => [a / 0.35, j * H / 0.35] }));
    }
    const m = merged(geos, tw.chainMat);
    if (m) { m.castShadow = false; tw.add(m); }
    const out = postRail(tw, side, pieces, { step: 3, pw: 0.08, ph: 3.2, colors: STEEL, lean: 0.015, twist: 0, rails: [{ y: 3.0, t: 0.05, h: 0.05 }, { y: 0.1, t: 0.03, h: 0.03 }] });
    addPR(tw, out, false);
    // barbed outriggers on top
    const wire = [];
    for (const { idx, lat } of pieces) for (let k = 0; k + 3 < idx.length; k += 3) {
      const a = pointAt(idx[k], lat(idx[k]) + side * 0.25), b = pointAt(idx[k + 3], lat(idx[k + 3]) + side * 0.25);
      const ya = S.y[wrap(idx[k])] + 3.35, yb = S.y[wrap(idx[k + 3])] + 3.35;
      wire.push(a.x, ya, a.z, b.x, yb, b.z, a.x, ya - 0.18, a.z, b.x, yb - 0.18, b.z);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    tw.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3a3836 })));
  },
  // corrugated sheet wall: panels of mixed age, posts, razor-wire coil
  sheet(tw, side, pieces) {
    tw.sheetMat ??= new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 6, seed: 9, rust: 1.6, tint: [[150, 146, 138], [128, 132, 134], [146, 104, 76], [112, 120, 126], [120, 92, 70], [158, 152, 140]] }), roughness: 0.78, metalness: 0.35, side: THREE.DoubleSide });
    const geos = [];
    for (const pc of pieces) {
      const H = pc.h ?? 3.2;
      geos.push(tw.ribbon(side, [[0, 0], [0, H]], pc.idx, { latFn: pc.lat, uv: (a, j) => [(a + (pc.seed ?? 0)) / 14.4, j] }));
    }
    tw.add(merged(geos, tw.sheetMat));
    addPR(tw, postRail(tw, side, pieces.map((pc) => ({ ...pc, lat: (i) => pc.lat(i) + side * 0.12 })), { step: 4, pw: 0.16, ph: 3.5, colors: [C(0x3f4143), C(0x4a3a30)], lean: 0.01, twist: 0, rails: [{ y: 3.0, t: 0.08, h: 0.12 }, { y: 1.2, t: 0.08, h: 0.12 }] }));
    const wire = [];
    for (const { idx, lat } of pieces) for (let k = 0; k + 2 < idx.length; k += 2) {
      const pts = [0, 1, 2].map((q) => pointAt(idx[k + q], lat(idx[k + q]) + side * 0.15));
      const y = (q) => S.y[wrap(idx[k + q])] - 0.1 + 3.4;
      wire.push(pts[0].x, y(0), pts[0].z, pts[1].x, y(1) + 0.38, pts[1].z, pts[1].x, y(1) + 0.38, pts[1].z, pts[2].x, y(2), pts[2].z, pts[0].x, y(0) + 0.2, pts[0].z, pts[2].x, y(2) + 0.2, pts[2].z);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    tw.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2826 })));
  },
  trestle(tw, side, pieces) {
    const BAY = 4, posts = [], rails = [], diag = [];
    for (const { idx, lat: latOf, h } of pieces) {
      const TH = h ?? 5.4, phi = Math.atan2(TH, BAY), dl = Math.hypot(BAY, TH);
      for (let k = 0; k + BAY < idx.length; k += BAY) {
        const i = idx[k], j = idx[k + BAY], lat = latOf(i), lat2 = latOf(j);
        const p = pointAt(i, lat), q = pointAt(i + BAY / 2, (lat + lat2) / 2), e = pointAt(j, lat2);
        const y = S.y[wrap(i)] - 0.1, c = pick(RUST, hash(i, side + 40)), yaw = Math.atan2(e.x - p.x, e.z - p.z);
        posts.push({ x: p.x, y: y + TH / 2, z: p.z, ry: yaw, sx: 0.28, sy: TH, sz: 0.28, c });
        for (const hy of [0.4, TH - 0.1]) rails.push({ x: q.x, y: y + hy, z: q.z, ry: yaw, sx: 0.18, sy: 0.18, sz: BAY + 0.1, c });
        for (const s of [-1, 1]) diag.push({ x: q.x, y: y + TH / 2, z: q.z, ry: yaw, rx: s * phi, sx: 0.12, sy: 0.12, sz: dl, c });
      }
    }
    const m = kitMat(tw);
    tw.add(inst(UNIT, m, posts), inst(UNIT, m, rails), inst(UNIT, m, diag));
  },
  // precast concrete panels between pilasters; stained, some panels a shade off
  concrete(tw, side, pieces) {
    tw.concMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
    const geos = [];
    for (const pc of pieces) {
      const H = pc.h ?? 2.6;
      geos.push(tw.ribbon(side, [[0.18, 0], [0.18, H], [-0.18, H], [-0.18, 0]], pc.idx, {
        latFn: pc.lat,
        color: (i, j, hh, out) => {
          const panel = Math.floor(i / 3), v = (0.74 + 0.24 * hash(panel, side + 21)) * (i % 3 === 0 ? 0.78 : 1) * (j === 0 || j === 3 ? 0.72 : 1);
          out[0] = 0.62 * v; out[1] = 0.6 * v; out[2] = 0.56 * v;
        },
      }));
    }
    tw.add(merged(geos, tw.concMat));
    addPR(tw, postRail(tw, side, pieces, { step: 6, pw: 0.5, pd: 0.5, ph: 2.9, colors: [C(0x9a968c), C(0x8a867c)], lean: 0, twist: 0, rails: [] }));
  },
  netting(tw, side, pieces) {
    tw.netMat ??= new THREE.MeshStandardMaterial({ map: chainTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, color: 0x3d4144 });
    const geos = pieces.map((pc) => tw.ribbon(side, [[0, 1.4], [0, pc.h ?? 6]], pc.idx, { latFn: pc.lat, uv: (a, j) => [a / 0.9, j * (pc.h ?? 6) / 0.9] }));
    const m = merged(geos, tw.netMat);
    if (m) { m.castShadow = false; tw.add(m); }
    addPR(tw, postRail(tw, side, pieces, { step: 6, pw: 0.14, ph: 6.3, colors: STEEL, lean: 0, twist: 0, rails: [{ y: 6, t: 0.04, h: 0.04 }, { y: 1.4, t: 0.04, h: 0.04 }] }), false);
  },
  tires(tw, side, pieces) {
    const list = [];
    for (const { idx, lat: latOf } of pieces) for (const i of idx) {
      for (const row of [0, 1]) {
        const lat = latOf(i) + side * row * 0.62, p = pointAt(i, lat), y = tw.gl(i, lat);
        for (let h = 0; h < 3 - row; h++) list.push({ x: p.x + (hash(i, h) - 0.5) * 0.1, y: y + 0.15 + h * 0.3, z: p.z, rx: Math.PI / 2, ry: hash(i, h + row * 3) * 6, c: pick([C(0x1d1d1e), C(0x262627), C(0x313133)], hash(i, h + 11)) });
      }
    }
    tw.add(inst(new THREE.TorusGeometry(0.34, 0.14, 6, 10), kitMat(tw), list));
  },
  hay(tw, side, pieces) {
    const list = [];
    for (const { idx, lat: latOf } of pieces) for (let k = 0; k < idx.length; k += 3) {
      const i = idx[k], j = idx[Math.min(idx.length - 1, k + 3)], lat = latOf(i), p = pointAt(i, lat), q = pointAt(j, latOf(j)), y = tw.gl(i, lat);
      const yaw = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI / 2;
      const c = pick([C(0xc9a24f), C(0xb8913f), C(0xd0ac5a)], hash(i, 31));
      list.push({ x: p.x, y: y + 0.62, z: p.z, ry: yaw, rz: Math.PI / 2, c });
      if (hash(i, 32) < 0.7) list.push({ x: p.x, y: y + 1.78, z: p.z, ry: yaw + 0.1, rz: Math.PI / 2, c });
    }
    tw.add(inst(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 10), kitMat(tw), list));
  },
  sandbags(tw, side, pieces) {
    const list = [];
    for (const { idx, lat: latOf } of pieces) for (const i of idx) {
      const lat = latOf(i), p = pointAt(i, lat), y = tw.gl(i, lat), yaw = Math.atan2(S.tx[wrap(i)], S.tz[wrap(i)]);
      for (let h = 0; h < 4; h++) list.push({ x: p.x, y: y + 0.13 + h * 0.26, z: p.z, ry: yaw + (hash(i, h) - 0.5) * 0.15, sx: 0.62, sy: 0.25, sz: 0.5, c: pick([C(0xb9a47a), C(0xa8946b), C(0xc4b08a)], hash(i, h + 50)) });
    }
    tw.add(inst(UNIT, kitMat(tw), list));
  },
  // a row of stacked K-rail blocks, two high in places
  blocks(tw, side, pieces) {
    const list = [];
    for (const { idx, lat: latOf } of pieces) for (let k = 0; k < idx.length; k += 2) {
      const i = idx[k], lat = latOf(i), p = pointAt(i, lat), y = tw.gl(i, lat), yaw = Math.atan2(S.tx[wrap(i)], S.tz[wrap(i)]);
      const c = pick([C(0x8f8b82), C(0x7f7b72), C(0x9a958b)], hash(i, 70));
      list.push({ x: p.x, y: y + 0.42, z: p.z, ry: yaw + (hash(i, 71) - 0.5) * 0.08, sx: 0.62, sy: 0.84, sz: 1.95, c });
      if (hash(i, 72) < 0.35) list.push({ x: p.x, y: y + 1.26, z: p.z, ry: yaw + (hash(i, 73) - 0.5) * 0.15, sx: 0.62, sy: 0.84, sz: 1.95, c });
    }
    tw.add(inst(UNIT, kitMat(tw), list));
  },
  containers(tw, side, pieces) {
    const tints = [0x7a4a3c, 0x44586c, 0x55645a, 0x9a7f3c, 0xa8a193, 0x6c3d36, 0x3f5a52].map(C);
    const list = [];
    for (const { idx, lat: latOf } of pieces) for (let k = 0; k + 13 < idx.length; k += 13) {
      const i = idx[k], lat = latOf(i), p = pointAt(i + 6, lat), h = 1 + Math.floor(hash(i, side + 60) * 3);
      const yaw = Math.atan2(pointAt(i + 12, lat).x - pointAt(i, lat).x, pointAt(i + 12, lat).z - pointAt(i, lat).z);
      for (let q = 0; q < h; q++) list.push({ x: p.x + (hash(i, q + 9) - 0.5) * 0.3, y: S.y[wrap(i)] - 0.1 + 1.3 + q * 2.6, z: p.z, ry: yaw + (hash(i, q + 5) - 0.5) * 0.03, c: pick(tints, hash(i + q, side + 61)) });
    }
    tw.contMat ??= new THREE.MeshStandardMaterial({ map: ribTexture({ panels: 1, seed: 3, rust: 0.8 }), roughness: 0.7, metalness: 0.3 });
    tw.add(inst(new THREE.BoxGeometry(2.44, 2.6, 12.2), tw.contMat, list));
  },
  piperack(tw, side, pieces) {
    addPR(tw, postRail(tw, side, pieces, { step: 8, pw: 0.4, ph: 5.6, colors: STEEL, lean: 0, twist: 0, rails: [{ y: 4.5, t: 0.55, h: 0.55, c: C(0x7d8286) }, { y: 5.15, t: 0.45, h: 0.45, c: C(0x9a4a32) }, { y: 4.85, t: 0.3, h: 0.3, c: C(0xc9a227) }] }));
    const beams = [];
    for (const { idx, lat } of pieces) for (let k = 0; k < idx.length; k += 8) {
      const i = idx[k], l = lat(i), p = pointAt(i, l), y = tw.gl(i, l);
      beams.push({ x: p.x, y: y + 5.55, z: p.z, ry: p.yaw + Math.PI / 2, sx: 0.3, sy: 0.3, sz: 2.4, c: C(0x6f7479) });
    }
    tw.add(inst(UNIT, kitMat(tw), beams));
  },
  // railway siding: ballast bed, sleepers every 0.65 m, two rails
  rails(tw, side, pieces) {
    tw.ballastMat ??= new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 1, flatShading: true });
    const geos = pieces.map((pc) => tw.ribbon(side, [[1.6, 0.0], [1.1, 0.22], [-1.1, 0.22], [-1.6, 0.0]], pc.idx, { latFn: pc.lat, base: -0.12 }));
    const m = merged(geos, tw.ballastMat);
    if (m) { m.castShadow = false; tw.add(m); }
    const sleepers = [], rails = [];
    for (const { idx, lat } of pieces) {
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k], p = pointAt(i, lat(i)), y = S.y[wrap(i)] + 0.12;
        sleepers.push({ x: p.x, y, z: p.z, ry: p.yaw + Math.PI / 2 + (hash(i, 5) - 0.5) * 0.06, sx: 0.22, sy: 0.14, sz: 2.5, c: pick([C(0x4a3f34), C(0x3e352c), C(0x57493b)], hash(i, 2)) });
        if (k % 2) { const p2 = pointAt(i + 0.5, lat(i)); sleepers.push({ x: p2.x, y, z: p2.z, ry: p.yaw + Math.PI / 2, sx: 0.22, sy: 0.14, sz: 2.5, c: C(0x463b31) }); }
      }
      for (const o of [-0.72, 0.72]) postRail(tw, side, [{ idx, lat: (i) => lat(i) + o }], { step: 2, pw: 0.001, ph: 0.001, rails: [{ y: 0.12, t: 0.08, h: 0.14, c: C(0x6a5040) }] }, { posts: [], rails });
    }
    tw.add(inst(UNIT, kitMat(tw), sleepers), inst(UNIT, metalMat(tw), rails, { shadow: false }));
  },
  // cobra-head street lights leaning over the road, every ~45 m
  lamps(tw, side, pieces) {
    const poles = [], arms = [], heads = [], glow = [];
    for (const { idx, lat } of pieces) for (let k = Math.floor(hash(idx[0], side) * 20); k < idx.length; k += 45) {
      const i = idx[k], l = lat(i), p = pointAt(i, l), y = tw.gl(i, l), q = pointAt(i, l - side * 2.6);
      poles.push({ x: p.x, y: y + 4.6, z: p.z, sx: 1, sy: 1, sz: 1 });
      const yaw = Math.atan2(q.x - p.x, q.z - p.z);
      arms.push({ x: (p.x + q.x) / 2, y: y + 9.05, z: (p.z + q.z) / 2, ry: yaw, rx: -0.12, sx: 0.09, sy: 0.09, sz: 2.7 });
      heads.push({ x: q.x, y: y + 9.3, z: q.z, ry: yaw, sx: 0.45, sy: 0.2, sz: 0.9 });
      glow.push({ x: q.x, y: y + 9.18, z: q.z, ry: yaw, sx: 0.36, sy: 0.04, sz: 0.7 });
    }
    const steel = metalMat(tw);
    tw.add(inst(new THREE.CylinderGeometry(0.08, 0.14, 9.2, 8), steel, poles), inst(UNIT, steel, arms), inst(UNIT, steel, heads), inst(UNIT, (tw.lampGlow ??= new THREE.MeshBasicMaterial({ color: 0xffe2a8 })), glow, { shadow: false }));
  },
};
const metalMat = (tw) => (tw.metalMat ??= new THREE.MeshStandardMaterial({ color: 0x7a7f84, roughness: 0.55, metalness: 0.6 }));

// ---------------------------------------------------------------- road marks

function markTexture(kind) {
  if (kind === 'hatch') {
    const [c, g] = canvas(64, 64);
    g.strokeStyle = 'rgba(236,232,220,0.92)';
    g.lineWidth = 7;
    for (let k = -64; k < 128; k += 20) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(1, 0); g.lineTo(1, 64); g.moveTo(63, 0); g.lineTo(63, 64); g.stroke();
    const t = tex(c, false);
    t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  if (kind === 'zebra') {
    const [c, g] = canvas(64, 64);
    g.fillStyle = 'rgba(236,232,220,0.92)';
    g.fillRect(0, 0, 32, 64);
    return tex(c);
  }
  if (kind === 'line') {
    const [c, g] = canvas(8, 8);
    g.fillStyle = 'rgba(236,232,220,0.92)';
    g.fillRect(0, 0, 8, 8);
    return tex(c, false);
  }
  if (kind === 'arrow') {
    const [c, g] = canvas(64, 192);
    g.fillStyle = 'rgba(236,232,220,0.92)';
    g.beginPath();
    g.moveTo(32, 4); g.lineTo(60, 74); g.lineTo(40, 74); g.lineTo(40, 188); g.lineTo(24, 188); g.lineTo(24, 74); g.lineTo(4, 74);
    g.closePath(); g.fill();
    return tex(c, false);
  }
  if (kind === 'patch') {
    const [c, g] = canvas(128, 128);
    const r = rng(77);
    g.fillStyle = 'rgba(32,32,34,0.8)'; g.fillRect(6, 6, 116, 116);
    for (let k = 0; k < 500; k++) { g.fillStyle = r() < 0.5 ? `rgba(110,108,104,${r() * 0.3})` : `rgba(10,10,10,${r() * 0.3})`; g.fillRect(6 + r() * 116, 6 + r() * 116, 2, 2); }
    g.strokeStyle = 'rgba(12,12,12,0.8)'; g.lineWidth = 3; g.strokeRect(6, 6, 116, 116);
    return tex(c, false);
  }
  if (kind === 'skid') {
    const [c, g] = canvas(64, 256);
    g.strokeStyle = 'rgba(14,14,14,0.55)'; g.lineWidth = 7; g.lineCap = 'round';
    for (const x of [22, 42]) { g.beginPath(); g.moveTo(x - 4, 250); g.bezierCurveTo(x + 2, 170, x - 6, 90, x + 8, 6); g.stroke(); }
    return tex(c, false);
  }
  if (kind === 'oil') {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 60);
    gr.addColorStop(0, 'rgba(10,10,10,0.6)'); gr.addColorStop(0.6, 'rgba(10,10,10,0.3)'); gr.addColorStop(1, 'rgba(10,10,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return tex(c, false);
  }
  // numeral, e.g. 'n65'
  const [c, g] = canvas(128, 256);
  g.fillStyle = 'rgba(236,232,220,0.92)';
  g.font = '900 150px "Big Shoulders Stencil Display", Impact, "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(64, 128); g.scale(1, 1.55);
  g.fillText(kind.slice(1), 0, 0, 120);
  g.restore();
  return tex(c, false);
}

function decalMat(tw, kind) {
  tw.decalMats ??= {};
  return (tw.decalMats[kind] ??= new THREE.MeshStandardMaterial({
    map: markTexture(kind), transparent: true, depthWrite: false, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
}

// A painted quad strip over samples i0..i1 between two lateral fractions of the half width.
function strip(tw, kind, i0, i1, lo, hi, uvFn, step = 2) {
  const rows = [];
  for (let i = i0; i <= i1; i += step) rows.push(i);
  if (rows[rows.length - 1] !== i1) rows.push(i1);
  const cols = 3, pos = [], uv = [], idx = [];
  rows.forEach((i, a) => {
    const w = wAt(i), k = wrap(i);
    for (let j = 0; j < cols; j++) {
      const f = lo + ((hi - lo) * j) / (cols - 1), lat = f * ROAD_HALF * w, p = pointAt(i, lat);
      pos.push(p.x, S.y[k] + roadSurfaceY(lat / w) + 0.03, p.z);
      const t = uvFn(a, rows.length - 1, j / (cols - 1), i - i0);
      uv.push(t[0], t[1]);
    }
  });
  for (let a = 0; a < rows.length - 1; a++) for (let j = 0; j < cols - 1; j++) {
    const q = a * cols + j;
    idx.push(q, q + 1, q + cols, q + 1, q + cols + 1, q + cols);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, decalMat(tw, kind));
  m.receiveShadow = true;
  m.renderOrder = 2;
  tw.add(m);
}

const MARKS = {
  // painted gore / no-go block; stripes stay 45 degrees whatever the width
  hatch(tw, e) {
    const i0 = Math.floor(e.at * LOOP.n), len = e.len ?? 40;
    for (const [lo, hi] of e.sym ? [[-e.lat[1], -e.lat[0]], e.lat] : [e.lat]) {
      const wm = (hi - lo) * ROAD_HALF * wAt(i0);
      strip(tw, 'hatch', i0, i0 + len, lo, hi, (a, A, u, d) => [u, d / wm]);
    }
  },
  crosswalk(tw, e) {
    const i0 = Math.floor(e.at * LOOP.n);
    strip(tw, 'zebra', i0, i0 + 3, -0.92, 0.92, (a, A, u) => [u * 11, a / A], 3);
  },
  stopline(tw, e) {
    const i0 = Math.floor(e.at * LOOP.n);
    for (const [lo, hi] of e.sym ? [[-0.95, -0.05], [0.05, 0.95]] : [e.lat ?? [0.05, 0.95]]) strip(tw, 'line', i0, i0 + 1, lo, hi, (a, A, u) => [u, a / A], 1);
  },
  // lane arrows repeated every `every` metres
  arrow(tw, e) {
    const N = LOOP.n;
    for (let i = Math.floor(e.a * N); i < Math.floor(e.b * N); i += e.every ?? 60) {
      const w = wAt(i), lanes = e.lanes ?? [-0.3, 0.3];
      for (const l of lanes) strip(tw, 'arrow', i, i + 5, l - 0.17 / w, l + 0.17 / w, (a, A, u) => [u, a / A], 5);
    }
  },
  // painted numerals (speed limits, lap markers), read from behind
  number(tw, e) {
    const i0 = Math.floor(e.at * LOOP.n), w = wAt(i0), l = e.lane ?? 0.3;
    strip(tw, `n${e.text}`, i0, i0 + 6, l - 0.28 / w, l + 0.28 / w, (a, A, u) => [u, a / A], 6);
  },
  // patches, skids and oil spills sprinkled on the asphalt
  wear(tw, e) {
    const N = LOOP.n, r = rng(Math.floor((e.a + 1) * 1000) + (e.count ?? 100));
    const buckets = { patch: [], skid: [], oil: [] };
    for (let q = 0; q < (e.count ?? 100); q++) {
      const i = Math.floor((e.a + r() * (e.b - e.a)) * N), w = wAt(i), kind = r() < 0.4 ? 'patch' : r() < 0.6 ? 'oil' : 'skid';
      const lat = (r() * 2 - 1) * ROAD_HALF * w * 0.85, p = pointAt(i, lat), k = wrap(i);
      const s = kind === 'oil' ? 0.7 + r() * 1.3 : kind === 'patch' ? 0.9 + r() * 1.8 : 1;
      buckets[kind].push({ x: p.x, y: S.y[k] + roadSurfaceY(lat / w) + 0.035, z: p.z, ry: p.yaw + (kind === 'oil' ? r() * 6 : (r() - 0.5) * 0.4), sx: kind === 'skid' ? 1.1 : s, sy: 1, sz: kind === 'skid' ? 5 + r() * 4 : s * (kind === 'patch' ? 0.8 + r() * 2.2 : 1) });
    }
    for (const [kind, list] of Object.entries(buckets)) {
      const m = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decalMat(tw, kind), list, { shadow: false });
      if (m) { m.castShadow = false; m.renderOrder = 2; tw.add(m); }
    }
  },
};

// ---------------------------------------------------------------- props

const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const PROPS = {
  cone: { colors: [C(0xe0661a)], parts: [{ geo: new THREE.ConeGeometry(0.16, 0.62, 8), dy: 0.33 }, { geo: new THREE.BoxGeometry(0.42, 0.04, 0.42), dy: 0.02, fixed: C(0x1f1f20) }, { geo: cyl(0.115, 0.14, 0.1), dy: 0.34, fixed: C(0xe8e4da) }] },
  barrel: { colors: [C(0x6b4a3a), C(0x4f5a4a), C(0x4d5663), C(0x7a5232)], parts: [{ geo: cyl(0.3, 0.3, 0.9, 10), dy: 0.45 }, { geo: cyl(0.31, 0.31, 0.05, 10), dy: 0.62, fixed: C(0x2a2a2b) }] },
  tires: { colors: [C(0x1f1f20), C(0x2a2a2c)], parts: [0.15, 0.45, 0.75].map((dy) => ({ geo: new THREE.TorusGeometry(0.34, 0.14, 6, 10).rotateX(Math.PI / 2), dy })) },
  crate: { colors: [C(0xc9a227), C(0xb88a1e), C(0x8a5a2a), C(0x6e4a2a), C(0x7d7568)], parts: [{ geo: UNIT, dy: 0.5, scaleBox: true }] },
  bale: { colors: [C(0xc9a24f), C(0xb8913f)], parts: [{ geo: cyl(0.62, 0.62, 1.3, 10).rotateZ(Math.PI / 2), dy: 0.62 }] },
  block: { colors: [C(0x8f8b82), C(0x7f7b72)], parts: [{ geo: new THREE.BoxGeometry(0.7, 0.8, 1.6), dy: 0.4 }] },
  sandbag: { colors: [C(0xb9a47a), C(0xa8946b)], parts: [0.13, 0.39, 0.65].map((dy) => ({ geo: new THREE.BoxGeometry(0.62, 0.25, 0.42), dy })) },
  pipepile: { colors: [C(0x7d8286), C(0x8a4a32)], parts: [{ geo: cyl(0.35, 0.35, 6, 8).rotateX(Math.PI / 2), dy: 0.35 }, { geo: cyl(0.35, 0.35, 6, 8).rotateX(Math.PI / 2).translate(0.6, 0, 0), dy: 0.35 }, { geo: cyl(0.35, 0.35, 6, 8).rotateX(Math.PI / 2).translate(0.3, 0.55, 0), dy: 0.35 }] },
  drum: { colors: [C(0x6b5b4a), C(0x5e5448)], parts: [{ geo: cyl(0.9, 0.9, 0.7, 12).rotateZ(Math.PI / 2), dy: 0.9 }] },
  tire: { colors: [C(0x1f1f20), C(0x2a2a2c)], parts: [{ geo: new THREE.TorusGeometry(0.34, 0.14, 6, 10).rotateX(Math.PI / 2), dy: 0.14 }] },
  scrap: { colors: [C(0x6b4a3a), C(0x7d8286), C(0x5e3322), C(0x8a6e4b)], parts: [{ geo: new THREE.BoxGeometry(2.2, 0.05, 1.2).rotateZ(0.25).rotateX(0.1), dy: 0.3 }] },
  chunk: { colors: [C(0x8f8b82), C(0x7f7b72), C(0x9a958b)], parts: [{ geo: new THREE.DodecahedronGeometry(0.6, 0).scale(1.2, 0.6, 0.9), dy: 0.2 }] },
  skip: { colors: [C(0xa77b24), C(0x5d6b4f), C(0x7a4a3c)], parts: [{ geo: new THREE.BoxGeometry(1.9, 1.3, 3.8), dy: 0.75 }, { geo: new THREE.BoxGeometry(2.0, 0.12, 4.0), dy: 1.42, fixed: C(0x3a3836) }] },
  ibc: { colors: [C(0xe4e0d6), C(0xd8d2c4)], parts: [{ geo: new THREE.BoxGeometry(1.0, 1.0, 1.2), dy: 0.68 }, { geo: new THREE.BoxGeometry(1.1, 0.15, 1.3), dy: 0.08, fixed: C(0x5a5d60) }, { geo: new THREE.BoxGeometry(1.06, 0.04, 1.26), dy: 1.2, fixed: C(0x7d8286) }] },
  puddle: { colors: [C(0x2c2a27)], mat: 'puddle', parts: [{ geo: new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2).scale(1.6, 1, 1), dy: 0.06 }] },
  pallet: { colors: [C(0x8a6e4b), C(0x7a6040)], parts: [{ geo: new THREE.BoxGeometry(1.2, 0.14, 1.0), dy: 0.1 }, { geo: new THREE.BoxGeometry(1.0, 0.7, 0.8), dy: 0.52, fixed: C(0x9c9488) }] },
};

const GROUPS = {
  // stepped steel stand, rows rising away from the track (front faces local +X)
  bleacher() {
    const g = new THREE.Group();
    const seat = std(0x8d9297, { roughness: 0.6, metalness: 0.5 }), steel = std(0x4a4c4e, { roughness: 0.6, metalness: 0.5 });
    const L = 22;
    for (let r = 0; r < 6; r++) {
      g.add(box(0.9, 0.12, L, seat, { pos: [-r * 1.0, 0.7 + r * 0.55, 0] }));
      g.add(box(0.06, 0.4, L, steel, { pos: [-r * 1.0 + 0.45, 0.5 + r * 0.55, 0] }));
    }
    for (let z = -L / 2; z <= L / 2; z += L / 4) for (let r = 0; r < 6; r += 2) g.add(tube([-r * 1.0, 0, z], [-r * 1.0, 0.7 + r * 0.55, z], 0.05, steel, 4));
    g.add(box(0.06, 1.1, L, steel, { pos: [0.5, 1.0, 0] })); // front rail
    return g;
  },
  // pop-up marshal tent
  tent() {
    const g = new THREE.Group();
    const pole = std(0x9aa0a5, { roughness: 0.5, metalness: 0.6 }), cloth = std(0xcfcbc0, { roughness: 0.9 });
    for (const x of [-1.6, 1.6]) for (const z of [-1.6, 1.6]) g.add(tube([x, 0, z], [x, 2.4, z], 0.04, pole, 4));
    const top = box(3.8, 0.05, 3.8, cloth, { pos: [0, 2.7, 0] });
    g.add(top, box(0.9, 0.9, 1.8, std(0x6b6e70, { roughness: 0.8 }), { pos: [0, 0.45, 0] }));
    return g;
  },
  // scaffold marshal post with a roof
  tower() {
    const g = new THREE.Group();
    const steel = std(0x5a5d60, { roughness: 0.6, metalness: 0.5 }), wood = std(0x7a644c, { roughness: 0.95 });
    for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.add(tube([x, 0, z], [x, 5.2, z], 0.07, steel, 4));
    for (const y of [1.8, 3.4]) { g.add(tube([-1.2, y, -1.2], [1.2, y + 1.6, -1.2], 0.04, steel, 4), tube([-1.2, y, 1.2], [1.2, y + 1.6, 1.2], 0.04, steel, 4)); }
    g.add(box(3.0, 0.12, 3.0, wood, { pos: [0, 3.4, 0] }), box(3.4, 0.1, 3.4, steel, { pos: [0, 5.25, 0] }));
    for (const x of [-1.5, 1.5]) g.add(box(0.06, 0.9, 3.0, steel, { pos: [x, 3.95, 0] }));
    return g;
  },
};

// ---------------------------------------------------------------- driver

export function applyDecor(tw, decor = []) {
  const N = LOOP.n, r = rng((tw.def.seed ?? 1) + 31);
  const lists = {};
  const reserved = (i) => (tw.reserved ?? []).some(([a, b]) => wrap(i) >= a && wrap(i) < b);
  const pushProp = (name, x, y, z, ry, s = 1) => {
    const def = PROPS[name], t = { x, y, z, ry, s, c: pick(def.colors, r()) };
    if (def.parts[0].scaleBox) { t.sx = 0.7 + r() * 0.9; t.sy = 0.5 + r() * 0.7; t.sz = 0.7 + r() * 0.9; t.s = undefined; }
    (lists[name] ??= []).push(t);
  };
  for (const e of decor) {
    const sides = e.side === undefined || e.side === 'both' ? [-1, 1] : [e.side];
    if (e.fence) {
      for (const side of sides) {
        const latOf = (off) => (i) => side * (e.abs ?? RL(i) + off);
        const byType = {};
        const put = (name, idx, off, h) => { if (idx.length > 2) (byType[name] ??= []).push({ idx, lat: latOf(off), h, seed: Math.floor(r() * 7) }); };
        if (e.fence === 'mix') {
          // pieces of `piece` metres; the first palette entry dominates, the rest break it up
          const pal = e.palette, total = pal.reduce((t, p) => t + p[1], 0);
          let i = Math.floor(e.a * N);
          const end = Math.floor(e.b * N);
          while (i < end) {
            const len = Math.round(e.piece[0] + r() * (e.piece[1] - e.piece[0]));
            let k = r() * total, choice = pal[0];
            for (const p of pal) { if ((k -= p[1]) <= 0) { choice = p; break; } }
            const [name, , extra = {}] = choice;
            const idx = [];
            for (let q = i; q < Math.min(end, i + len); q++) if (!reserved(q) && !(name === 'containers' && tight(q))) idx.push(q);
            if (name !== 'gap') put(name, idx, (extra.off ?? e.off ?? 2.4) + (r() - 0.5) * (e.jitter ?? 0.5), extra.h ?? (e.h ? e.h * (0.85 + r() * 0.3) : undefined));
            i += len + (r() < (e.gaps ?? 0) ? 2 + Math.floor(r() * 6) : 0);
          }
        } else {
          const skip = (q) => reserved(q) || (e.fence === 'containers' && tight(q));
          for (const run of lapRuns(e.a, e.b, skip)) put(e.fence, run, e.off ?? 2.4, e.h);
          if (e.fence === 'containers') for (const run of lapRuns(e.a, e.b, (q) => reserved(q) || !tight(q))) put(e.fallback ?? 'sheet', run, e.off ?? 2.4, e.h);
        }
        for (const [name, pieces] of Object.entries(byType)) FENCES[name](tw, side, pieces);
      }
    } else if (e.mark) MARKS[e.mark](tw, e);
    else if (e.group) {
      tw.groupProtos ??= {};
      tw.groupProtos[e.group] ??= (() => { const g = GROUPS[e.group](); bakeGroup(g); return g; })();
      for (const side of sides) tw.place(tw.groupProtos[e.group], Math.floor(e.at * N), side * (RL(Math.floor(e.at * N)) + (e.off ?? 10)), side > 0 ? 0 : Math.PI);
    } else if (e.scatter && e.points) {
      for (const [x, z, ry] of e.points) pushProp(e.scatter, x, tw.heightAt(x, z), z, ry ?? r() * 6.3, e.s ?? 1);
    } else if (e.scatter && e.area) {
      // anywhere around the loop between minLat and maxLat from the road, avoiding footprints
      const b = tw.box, M = e.margin ?? 120;
      for (let q = 0; q < e.count; q++) {
        const x = b.minx - M + r() * (b.maxx - b.minx + 2 * M), z = b.minz - M + r() * (b.maxz - b.minz + 2 * M);
        const d = tw.roadDist(x, z);
        if (d < (e.minLat ?? 12) || d > (e.maxLat ?? 200) || tw.blocked(x, z, e.clear ?? 1) || (tw.inYard && !tw.inYard(x, z))) continue;
        const count = e.cluster ? Math.max(1, Math.round(e.cluster[0] * (0.5 + r()))) : 1;
        for (let k = 0; k < count; k++) {
          const name = e.mix ? e.mix[Math.floor(r() * e.mix.length)] : e.scatter, rad = e.cluster ? e.cluster[1] : 0;
          const px = x + (r() - 0.5) * rad * 2, pz = z + (r() - 0.5) * rad * 2;
          pushProp(name, px, tw.heightAt(px, pz), pz, r() * 6.3, e.scale ? e.scale[0] + r() * (e.scale[1] - e.scale[0]) : 1);
        }
      }
    } else if (e.scatter) {
      const range = e.abs ?? e.off ?? [3, 8], [lo, hi] = Array.isArray(range) ? range : [range, range];
      for (const side of sides) {
        for (let i = Math.floor(e.a * N); i < Math.floor(e.b * N); i += Math.max(1, (e.every ?? 10) * (0.6 + 0.8 * r()))) {
          const ii = Math.floor(i);
          if (r() > (e.p ?? 1) || (e.skipTight && tight(ii)) || reserved(ii)) continue;
          const lat = side * (e.abs ? lo + r() * (hi - lo) : RL(ii) + lo + r() * (hi - lo)), p = pointAt(ii, lat), y = tw.gl(ii, lat);
          if (tw.blocked(p.x, p.z, 0.5)) continue;
          const count = e.cluster ? Math.max(1, Math.round(e.cluster[0] * (0.5 + r()))) : 1;
          for (let k = 0; k < count; k++) {
            const name = e.mix ? e.mix[Math.floor(r() * e.mix.length)] : e.scatter, rad = e.cluster ? e.cluster[1] : 0;
            pushProp(name, p.x + (r() - 0.5) * rad * 2, y, p.z + (r() - 0.5) * rad * 2, e.yaw === 'road' ? p.yaw + (r() - 0.5) * 0.3 : r() * 6.3, e.scale ? e.scale[0] + r() * (e.scale[1] - e.scale[0]) : 1);
          }
        }
      }
    }
  }
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x2c2a27, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [name, list] of Object.entries(lists)) {
    for (const part of PROPS[name].parts) {
      const parts = list.map((t) => ({ ...t, y: t.y + (part.scaleBox ? (t.sy ?? 1) / 2 : part.dy * (t.s ?? 1)), c: part.fixed ?? t.c }));
      const m = inst(part.geo, PROPS[name].mat === 'puddle' ? puddleMat : kitMat(tw), parts, { shadow: PROPS[name].mat !== 'puddle' });
      tw.add(m);
    }
  }
}

export { FENCES, MARKS, PROPS, GROUPS, smoothstep };
