import * as THREE from 'three';
import { S, STEP, LOOP, wAt, RAIL_LAT, pointAt } from './route.js';
import { roadSurfaceY } from '../level/road.js';
import { Guns } from '../level/combat.js';
import { paintTopSkin } from '../models/cars/starterCoupe.js';
import { bakeGroup } from '../level/bake.js';
import { partsOf, charModel, unchar, Wreckage } from './carparts.js';

// Closed-loop race: the player plus seven AI rivals on the same model, each with its own
// streak colour. Rolling start mid-pack behind the line, three laps, four-zone armor on
// every car (front/back/left/right, then the core), guns on everyone, car-to-car contact.
// AI cars are kinematic: they ride the track spline at (progress, lateral offset) with a
// speed profile from the curvature, lane changes around slower cars, and rubber-banding.

export const LAPS = 3;
const PACE = 33; // m/s everyone carries when the intro opens
export const ROSTER = [
  { name: 'You', color: [142, 32, 26], hex: '#e0402e' },
  { name: 'Orange', color: [214, 96, 24], hex: '#ff8a2a' },
  { name: 'Yellow', color: [206, 170, 30], hex: '#ffd23a' },
  { name: 'Green', color: [52, 132, 74], hex: '#4fcf72' },
  { name: 'Teal', color: [40, 130, 140], hex: '#3fd0d6' },
  { name: 'Blue', color: [44, 82, 168], hex: '#5a8cff' },
  { name: 'Purple', color: [118, 52, 150], hex: '#b56cff' },
  { name: 'White', color: [196, 196, 188], hex: '#f2f2ea' },
];
const PLAYER_SLOT = 4; // 5th on the grid

// ---------------------------------------------------------------- armor
const ZONES = ['front', 'back', 'left', 'right'];
export class Armor {
  constructor() { this.reset(); }
  reset() { this.z = { front: 1, back: 1, left: 1, right: 1 }; this.core = 1; this.wrecked = false; this.flash = { front: 0, back: 0, left: 0, right: 0 }; }
  // zone from a point in the car's local frame (lx right, lz forward) and its half size
  static zoneOf(lx, lz, hx, hz) {
    if (Math.abs(lz) / hz > Math.abs(lx) / hx) return lz > 0 ? 'front' : 'back';
    return lx > 0 ? 'right' : 'left';
  }
  hit(zone, dmg) {
    if (this.wrecked) return;
    this.flash[zone] = 0.25;
    const a = this.z[zone], left = Math.max(0, dmg - a);
    this.z[zone] = Math.max(0, a - dmg);
    if (left > 0) this.core -= left * 1.6;
    if (this.core <= 0) { this.core = 0; this.wrecked = true; }
  }
  get worst() { return Math.min(...ZONES.map((k) => this.z[k])); }
}

// Darken a car's painted skins toward burnt black as its zones go.
function wear(mats, a) {
  const k = (v) => 0.16 + 0.84 * v;
  mats.side?.color.setScalar(k(Math.min(a.z.left, a.z.right) * 0.6 + 0.4 * a.core));
  mats.front?.color.setScalar(k(a.z.front * 0.7 + 0.3 * a.core));
  mats.back?.color.setScalar(k(a.z.back * 0.7 + 0.3 * a.core));
  mats.top?.color.setScalar(k((a.z.front + a.z.back + a.z.left + a.z.right) / 4 * 0.6 + 0.4 * a.core));
}

// Rival template, built once: the player's model with look-alike materials merged (the parts
// each carry their own material instance) and everything but the wheels baked into a few
// meshes, so a rival costs a handful of draw calls.
let template = null;
function rivalTemplate(model) {
  if (template) return template;
  const ud = model.userData;
  model.userData = {};
  const m = model.clone(true);
  model.userData = ud;
  for (const n of ['flames', 'flame_light']) m.getObjectByName(n)?.removeFromParent();
  const skins = new Set(Object.values(ud.skins)), canon = new Map();
  // close-enough colours share a material (rivals are seen at speed, not in the garage)
  const q = (c) => (c ? [c.r, c.g, c.b].map((v) => Math.round(Math.sqrt(v) * 4)).join(',') : '');
  const keyOf = (x) => (skins.has(x) ? x.uuid : [x.type, q(x.color), x.map?.uuid, x.transparent, x.emissive && x.emissive.getHex() ? q(x.emissive) : '', x.blending].join('|'));
  const dedupe = (x) => { const k = keyOf(x); if (!canon.has(k)) canon.set(k, x); return canon.get(k); };
  m.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(dedupe) : dedupe(o.material); });
  // small bolt-ons get one flat material each (seen at speed, they read the same)
  const flat = { wheel: new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.7, metalness: 0.4 }), gun: new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.5, metalness: 0.7 }), rack: new THREE.MeshStandardMaterial({ color: 0x35373a, roughness: 0.6, metalness: 0.6 }) };
  for (const part of partsOf(m)) {
    const fm = flat[part.userData.part];
    if (fm) part.traverse((o) => { if (o.isMesh && !(o.material.blending === THREE.AdditiveBlending)) o.material = fm; });
  }
  // chassis and each detachable part baked on their own (rival wheels don't spin)
  bakeGroup(m, { skip: (o) => !!o.userData.part });
  for (const part of partsOf(m)) bakeGroup(part);
  let meshes = 0;
  m.traverse((o) => { if (o.isMesh) meshes++; });
  window.__dbg = { ...window.__dbg, rivalMeshes: meshes };
  template = { model: m, skins: ud.skins };
  return template;
}

// A rival: the template with its own skin materials (own streak colour, own damage).
function cloneCar(base, color) {
  const { model, skins } = rivalTemplate(base);
  const m = model.clone(true);
  const src = skins, mats = { side: src.side.clone(), front: src.front.clone(), back: src.back.clone(), top: paintTopSkin(color) };
  const map = new Map([[src.side, mats.side], [src.front, mats.front], [src.back, mats.back], [src.top, mats.top]]);
  m.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map((x) => map.get(x) ?? x);
    else if (map.has(o.material)) o.material = map.get(o.material);
    o.castShadow = o.geometry.attributes.position.count > 3000; // only the big panels throw shadows
  });
  const wheels = [];
  return { model: m, mats, wheels };
}

// ---------------------------------------------------------------- AI speed profile
let profile = null;
function speedProfile(aLat, dec) {
  const N = LOOP.n, v = new Float32Array(N), H = 6;
  for (let i = 0; i < N; i++) {
    const a = (i - H + N) % N, b = (i + H) % N;
    let dh = Math.atan2(S.tx[b], S.tz[b]) - Math.atan2(S.tx[a], S.tz[a]);
    dh = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));
    const k = dh / (2 * H * STEP);
    v[i] = k > 1e-4 ? Math.sqrt(aLat / k) : 99;
  }
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % N] ** 2 + 2 * dec * STEP));
  return v;
}

// ---------------------------------------------------------------- racers
const wrapI = (i) => ((Math.floor(i) % LOOP.n) + LOOP.n) % LOOP.n;
const latMax = (i) => RAIL_LAT * wAt(wrapI(i)) - 1.3;

class Rival {
  constructor(slot, base, scene, fx) {
    const r = ROSTER[slot];
    Object.assign(this, { slot, name: r.name, hex: r.hex, ai: true });
    const { model, mats, wheels } = cloneCar(base, r.color);
    Object.assign(this, { model, mats, wheels, parts: partsOf(model) });
    this.rig = new THREE.Group();
    this.rig.add(model);
    scene.add(this.rig);
    this.armor = new Armor();
    this.skill = 0.86 + (slot / ROSTER.length) * 0.05 + Math.random() * 0.03; // easy: well under the player's top speed
    this.guns = new Guns(model, scene, { ...fx, light: false, color: 0xffa21c, rate: 5, spread: 3.2 });
    this.burst = 0;
    this.cool = 2 + Math.random() * 3;
  }
  place(prog, lat, v) {
    Object.assign(this, { prog, lat, latT: lat, latV: 0, v, finished: false, finishT: 0, deadT: 0, smokeAcc: 0 });
    this.armor.reset();
    wear(this.mats, this.armor);
    this.pose(0);
  }
  pose(dt) {
    const i0 = Math.floor(this.prog), f = this.prog - i0, a = pointAt(i0, this.lat), b = pointAt(i0 + 1, this.lat);
    this.x = a.x + (b.x - a.x) * f;
    this.z = a.z + (b.z - a.z) * f;
    const ia = wrapI(i0), ib = wrapI(i0 + 1), w = wAt(ia);
    this.y = S.y[ia] + (S.y[ib] - S.y[ia]) * f + roadSurfaceY(this.lat / w);
    this.tx = S.tx[ia]; this.tz = S.tz[ia];
    const slip = this.armor.wrecked ? (this.spin ?? 0) * Math.min(1, this.deadT * 2) : Math.atan2(this.latV, Math.max(4, this.v));
    this.yaw = Math.atan2(this.tx, this.tz) - slip;
    this.vx = this.tx * this.v - this.tz * this.latV;
    this.vz = this.tz * this.v + this.tx * this.latV;
    this.rig.position.set(this.x, this.y, this.z);
    this.rig.visible = Math.hypot(this.x - (Race.camX ?? this.x), this.z - (Race.camZ ?? this.z)) < 420;
    this.rig.rotation.set(-Math.atan2(S.y[ib] - S.y[ia], STEP), this.yaw, 0, 'YXZ');
    for (const wh of this.wheels) wh.rotation.x += (this.v / 0.332) * dt;
  }
  // world displacement / velocity change applied to the spline state
  push(dx, dz) {
    this.prog += (dx * this.tx + dz * this.tz) / STEP;
    this.lat += dx * -this.tz + dz * this.tx;
  }
  kick(dvx, dvz) {
    this.v = Math.max(0, this.v + dvx * this.tx + dvz * this.tz);
    this.latV += dvx * -this.tz + dvz * this.tx;
  }
}

// ---------------------------------------------------------------- race
export class Race {
  constructor({ scene, model, car, fx, hud, gunsHitHook, booms, debris }) {
    Object.assign(this, { scene, car, fx, hud, booms, debris, model, hitstop: 0 });
    this.wreckage = new Wreckage(scene, fx.height);
    this.playerParts = partsOf(model);
    profile ??= speedProfile(17, 9);
    this.player = { name: 'You', hex: ROSTER[0].hex, you: true, armor: new Armor(), mats: model.userData.skins };
    this.hb = car.hitbox;
    this.rivals = [];
    for (let s = 1; s < ROSTER.length; s++) this.rivals.push(new Rival(s, model, scene, fx));
    const hitTest = (o, d, range, shooter) => this.rayHit(o, d, range, shooter);
    for (const r of this.rivals) { r.guns.hitTest = hitTest; r.guns.onTargetHit = (h) => this.damage(h.target, h.zone, 0.022, r, h.point); }
    gunsHitHook(hitTest, (h) => { this.damage(h.target, h.zone, 0.05, this.player, h.point); car.addBoost(0.012); });
    hud.armorModel(rivalTemplate(model).model, this.hb);
    this.reset();
  }

  // already racing: the field strung out ahead of and behind the player (5th), the leader
  // just short of the line, cars in different lanes
  gridSlot(k) {
    const ahead = [0, 16, 34, 52, 70, 88, 108, 128][k]; // metres behind the leader
    const prog = (-24 - ahead) / STEP;
    const lanes = [-0.45, 0.4, -0.1, 0.55, -0.3, 0.2, -0.55, 0.35];
    return { prog, lat: lanes[k] * latMax(wrapI(prog)) * 1.6 };
  }
  reset() {
    const order = [...this.rivals.map((r) => r.slot)];
    order.splice(PLAYER_SLOT, 0, 0);
    order.forEach((slot, k) => {
      const g = this.gridSlot(k);
      if (slot === 0) {
        const i = wrapI(g.prog);
        this.car.reset(i, g.lat);
        const p = pointAt(i, g.lat);
        this.car.vx = Math.sin(p.yaw) * PACE; this.car.vz = Math.cos(p.yaw) * PACE; this.car.vf = PACE;
        this.pProg = g.prog; this.pI = i;
      } else this.rivals.find((r) => r.slot === slot).place(g.prog, g.lat, Math.min(profile[wrapI(g.prog)], PACE + 3));
    });
    this.player.armor.reset();
    wear(this.player.mats, this.player.armor);
    this.wreckage.restoreAll();
    unchar(this.model);
    this.model.position.y = 0;
    for (const r of this.rivals) { unchar(r.model); r.model.position.y = 0; }
    this.kills = 0;
    this.combo = { n: 0, t: -9 };
    this.hud.clearCracks();
    Object.assign(this, { state: 'race', t: 0, raceT: 0, lapStart: 0, lapsDone: 0, bestLap: 0, lastLap: 0, pFinish: 0, shown: false });
    this.hud.results(null);
    // intro: hold on black for a beat, then the screen splits open onto the race
    this.holdUntil = performance.now() + 450;
    this.hud.intro(false, true);
    setTimeout(() => this.hud.intro(true), 450);
  }

  // Play again: close the split, reset behind it, open again
  again() {
    this.hud.intro(false);
    this.holdUntil = Infinity;
    setTimeout(() => this.reset(), 880);
  }

  get frozen() { return performance.now() < this.holdUntil; }

  get playerLap() { return Math.min(LAPS, Math.max(1, Math.floor(this.pProg / LOOP.n) + 1)); }
  get racing() { return this.state === 'race'; }
  get inputCap() { return 0; }
  get canFire() { return !this.player.armor.wrecked && !this.frozen; }

  // every car as a uniform body for collisions and hit tests
  bodies() {
    const c = this.car;
    const out = this.player.gone ? [] : [{ ref: this.player, x: c.x, y: c.y, z: c.z, yaw: c.yaw, prog: this.pProg }];
    for (const r of this.rivals) if (!r.gone) out.push({ ref: r, x: r.x, y: r.y, z: r.z, yaw: r.yaw, prog: r.prog });
    return out;
  }

  rayHit(o, d, range, shooter) {
    let best = null;
    const { r, offs, hx, hz0, hz1 } = this.hb;
    for (const b of this.bodies()) {
      if (b.ref === shooter || b.ref === shooter?.owner || (shooter === this.car && b.ref === this.player)) continue;
      if (Math.abs(b.x - o.x) > range + 6 || Math.abs(b.z - o.z) > range + 6) continue;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      for (const oz of offs) {
        const cx = b.x + fx * oz - o.x, cz = b.z + fz * oz - o.z;
        const dl = Math.hypot(d.x, d.z) || 1, ux = d.x / dl, uz = d.z / dl;
        const t = cx * ux + cz * uz, px = cx - ux * t, pz = cz - uz * t, h2 = px * px + pz * pz;
        if (h2 > r * r || t < 0) continue;
        const t2d = t - Math.sqrt(r * r - h2), dist = t2d / dl;
        if (dist > range || (best && dist >= best.d)) continue;
        const p = o.clone().addScaledVector(d, dist);
        if (p.y < b.y - 0.2 || p.y > b.y + 1.9) continue;
        const dx = p.x - b.x, dz = p.z - b.z;
        const lz = dx * fx + dz * fz - (hz0 + hz1) / 2, lx = dx * -fz + dz * fx;
        best = { d: dist, point: p, target: b.ref, zone: Armor.zoneOf(lx, lz, hx, (hz1 - hz0) / 2) };
      }
    }
    return best;
  }

  // Armor soaks a hit on its side until stripped; past that the hull HP (core) takes it.
  // Player hits drive the feedback: hitmarker, combo count, CRITICAL when a side breaks or
  // HP crosses a third, DESTROYED with the kill tally, small blasts on crits.
  damage(target, zone, dmg, attacker = null, point = null) {
    const a = target.armor;
    if (a.wrecked || this.state === 'done' && target === this.player) return;
    const zb = a.z[zone], hb = a.core;
    a.hit(zone, dmg);
    wear(target.mats, a);
    const broke = zb > 0 && a.z[zone] === 0, tier = (h) => (h > 0.66 ? 0 : h > 0.33 ? 1 : 2);
    const crit = broke || tier(a.core) > tier(hb);
    const pos = point ?? new THREE.Vector3(target.x ?? this.car.x, (target.y ?? this.car.y) + 0.8, target.z ?? this.car.z);
    const vel = target === this.player ? new THREE.Vector3(this.car.vx, 0, this.car.vz) : new THREE.Vector3(target.vx, 0, target.vz);
    if (crit || Math.random() < 0.04) this.booms.blast(pos, vel, false);
    if (broke) this.tearOff(target, zone, vel);
    if (attacker === this.player && target !== this.player) {
      const cb = this.combo;
      cb.n = this.raceT - cb.t < 0.75 ? cb.n + 1 : 1;
      cb.t = this.raceT;
      if (crit) { this.hitstop = Math.max(this.hitstop, 0.07); this.hud.flash(0.16); }
      if (a.wrecked) {
        this.hitstop = Math.max(this.hitstop, 0.18);
        this.hud.flash(0.6);
        this.kills++;
        this.hud.hitmarker('kill');
        this.hud.popup(`DESTROYED<small>x${this.kills}</small>`, 'kill');
        this.car.addBoost(0.35);
      } else {
        this.hud.hitmarker(crit ? 'crit' : 'hit');
        if (crit) this.hud.popup(broke ? 'ARMOR BROKEN' : 'CRITICAL', 'crit');
        if (cb.n >= 2) this.hud.popup(`x${cb.n} HIT`, 'combo');
      }
    }
    if (target === this.player) {
      this.hud.hurt(dmg);
      this.car.hit(crit ? 6 : 1.5);
      for (const th of [0.5, 0.25, 0.1]) if (hb > th && a.core <= th) this.hud.crack();
    }
    if (a.wrecked) this.detonate(target);
  }

  // an armor zone stripped: its plates (and with the front, the dozer blade) come away
  tearOff(target, zone, vel) {
    const me = target === this.player, parts = me ? this.playerParts : target.parts, yaw = me ? this.car.yaw : target.yaw;
    const f = [Math.sin(yaw), Math.cos(yaw)], out = { front: f, back: [-f[0], -f[1]], left: [f[1], -f[0]], right: [-f[1], f[0]] }[zone];
    for (const part of parts) {
      if (part.userData.part !== zone) continue;
      const kick = new THREE.Vector3(out[0] * (2 + Math.random() * 3), 2 + Math.random() * 3, out[1] * (2 + Math.random() * 3));
      this.wreckage.detach(part, vel.clone().multiplyScalar(0.9), kick);
    }
  }

  // a car going up: big blast, every bolt-on part blown off with the car's speed, and the
  // chassis left as a charred, burning wreck that slides to a stop and stays solid
  detonate(target) {
    const me = target === this.player, c = this.car;
    const p = new THREE.Vector3(me ? c.x : target.x, (me ? c.y : target.y) + 0.7, me ? c.z : target.z);
    const v = me ? new THREE.Vector3(c.vx, 0, c.vz) : new THREE.Vector3(target.vx, 0, target.vz);
    this.booms.blast(p, v, true);
    const model = me ? this.model : target.model;
    charModel(model);
    for (const part of me ? this.playerParts : target.parts) {
      const kick = new THREE.Vector3((Math.random() - 0.5) * 18, 5 + Math.random() * 9, (Math.random() - 0.5) * 18);
      this.wreckage.detach(part, v.clone().multiplyScalar(0.8 + Math.random() * 0.25), kick, Math.random() < 0.4);
    }
    model.position.y = -0.3; // on its belly with the wheels gone
    const tmp = new THREE.Vector3(), tv = new THREE.Vector3();
    for (let k = 0; k < 12; k++) { // shrapnel
      tmp.set(p.x + (Math.random() - 0.5) * 1.8, p.y + Math.random() * 0.8, p.z + (Math.random() - 0.5) * 3.5);
      tv.set(v.x * (0.7 + Math.random() * 0.3) + (Math.random() - 0.5) * 16, 4 + Math.random() * 12, v.z * (0.7 + Math.random() * 0.3) + (Math.random() - 0.5) * 16);
      this.debris.spawn(tmp, tv, { size: [0.12 + Math.random() * 0.3, 0.05 + Math.random() * 0.15, 0.12 + Math.random() * 0.35], life: 3 + Math.random() * 3, spin: 16, color: [0x1c1c1c, 0x2a2b2c, 0x141414][k % 3], burn: k % 4 === 0 });
    }
    if (me) { c.vx *= 0.5; c.vz *= 0.5; this.over('wrecked'); }
    else { target.deadT = 0; target.spin = (Math.random() - 0.5) * 2.2; target.v *= 0.7; }
    if (!me && this.rivals.every((r) => r.armor.wrecked) && this.state === 'race') this.over('annihilation');
  }

  // circle-pair contact between every two cars: separate, swap normal velocity, scrape armor
  contacts() {
    const B = this.bodies(), { r, offs, hx, hz0, hz1 } = this.hb, c = this.car;
    for (let a = 0; a < B.length; a++) for (let b = a + 1; b < B.length; b++) {
      const A = B[a], C = B[b];
      if (Math.abs(A.x - C.x) > 9 || Math.abs(A.z - C.z) > 9) continue;
      const fa = [Math.sin(A.yaw), Math.cos(A.yaw)], fc = [Math.sin(C.yaw), Math.cos(C.yaw)];
      let deep = null;
      for (const oa of offs) for (const oc of offs) {
        const ax = A.x + fa[0] * oa, az = A.z + fa[1] * oa, cx = C.x + fc[0] * oc, cz = C.z + fc[1] * oc;
        const dx = ax - cx, dz = az - cz, d = Math.hypot(dx, dz);
        if (d < 2 * r && (!deep || d < deep.d)) deep = { d, nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0, px: (ax + cx) / 2, pz: (az + cz) / 2 };
      }
      if (!deep) continue;
      const pen = 2 * r - deep.d, { nx, nz } = deep;
      const vA = A.ref === this.player ? [c.vx, c.vz] : [A.ref.vx, A.ref.vz];
      const vC = C.ref === this.player ? [c.vx, c.vz] : [C.ref.vx, C.ref.vz];
      const move = (body, s) => {
        if (body.ref === this.player) { c.x += nx * s; c.z += nz * s; } else body.ref.push(nx * s, nz * s);
      };
      const wA = A.ref.armor?.wrecked ? 0.7 : 1, wC = C.ref.armor?.wrecked ? 0.7 : 1; // wrecks are heavy, solid obstacles
      move(A, pen * wA / (wA + wC)); move(C, -pen * wC / (wA + wC));
      const vrel = (vA[0] - vC[0]) * nx + (vA[1] - vC[1]) * nz;
      if (vrel >= 0) continue;
      const j = -1.3 * vrel / 2;
      const kickB = (body, s) => {
        if (body.ref === this.player) { c.vx += nx * s; c.vz += nz * s; c.hit(Math.abs(s)); } else body.ref.kick(nx * s, nz * s);
      };
      kickB(A, j); kickB(C, -j);
      if (-vrel > 4) for (const body of [A, C]) {
        const f = [Math.sin(body.yaw), Math.cos(body.yaw)], dx = deep.px - body.x, dz = deep.pz - body.z;
        const lz = dx * f[0] + dz * f[1] - (hz0 + hz1) / 2, lx = dx * -f[1] + dz * f[0];
        this.damage(body.ref, Armor.zoneOf(lx, lz, hx, (hz1 - hz0) / 2), (-vrel - 4) * 0.025, body === A ? C.ref : A.ref);
      }
    }
  }

  updateRival(r, dt, all) {
    const N = LOOP.n, i = wrapI(r.prog);
    if (r.armor.wrecked) { // slide to a stop, burning
      r.deadT += dt;
      r.v = Math.max(0, r.v - 7 * dt);
      r.latV *= Math.exp(-dt * 3);
      r.lat += r.latV * dt;
      r.prog += r.v * dt / STEP;
      return;
    }
    let want;
    {
      want = Math.min(profile[i], 45.8 * r.skill);
      // rubber band against the player: ease off when well ahead, push when behind
      const gap = (r.prog - this.pProg) * STEP;
      if (!r.finished && this.state === 'race') want *= gap > 60 ? Math.max(0.88, 1 - (gap - 60) / 1500) : gap < -90 ? Math.min(1.1, 1 + (-gap - 90) / 1200) : 1;
      if (r.finished) want = Math.min(want, 22);
      // traffic ahead in my lane: pass on the roomier side or tuck in behind
      if (this.state === 'race') for (const o of all) {
        if (o.ref === r) continue;
        const ahead = (o.prog - r.prog) * STEP, dl = o.lat - r.lat;
        if (ahead < 1 || ahead > 22 || Math.abs(dl) > 2.6) continue;
        const ov = o.ref === this.player ? Math.max(0, this.car.vf) : o.ref.armor.wrecked ? 0 : o.ref.v;
        if (ov >= r.v - 0.5) continue;
        const room = latMax(i), left = o.lat - 3.2, right = o.lat + 3.2;
        const canL = left > -room, canR = right < room;
        if (canL || canR) r.latT = !canR || (canL && Math.abs(left - r.lat) < Math.abs(right - r.lat)) ? left : right;
        else want = Math.min(want, ov);
      }
    }
    r.v += Math.max(-13 * dt, Math.min(8 * dt, want - r.v));
    // steer toward the target lane (slowly drifting it back toward a home lane)
    if (this.state === 'race' && Math.random() < dt * 0.15) r.latT = (Math.random() - 0.5) * 2 * latMax(i) * 0.7;
    r.latT = Math.max(-latMax(i), Math.min(latMax(i), r.latT));
    const wantV = Math.max(-4, Math.min(4, (r.latT - r.lat) * 1.2));
    r.latV += (wantV - r.latV) * Math.min(1, dt * 3);
    r.lat += r.latV * dt;
    if (Math.abs(r.lat) > latMax(i)) { r.lat = Math.sign(r.lat) * latMax(i); r.latV *= -0.3; }
    r.prog += r.v * dt / STEP;
    if (!r.finished && r.prog >= LAPS * N) { r.finished = true; r.finishT = this.raceT; }
    // guns: short bursts at whoever is just ahead and roughly in line
    r.cool -= dt;
    let tgt = null;
    if (this.state === 'race' && r.cool <= 0) for (const o of all) {
      if (o.ref === r || o.ref.armor.wrecked) continue;
      const ahead = (o.prog - r.prog) * STEP;
      if (ahead > 8 && ahead < 70 && Math.abs(o.lat - r.lat) < 4 + ahead * 0.05 && (o.ref === this.player || Math.random() < 0.6)) { tgt = o; break; }
    }
    if (tgt && r.burst <= 0) r.burst = 0.9 + Math.random() * 0.8;
    const firing = r.burst > 0;
    if (firing) { r.burst -= dt; if (r.burst <= 0) r.cool = 2.2 + Math.random() * 2.5; }
    r.aim = r.aim ?? new THREE.Vector3();
    if (tgt) r.aim.set(tgt.x, tgt.y + 0.8, tgt.z);
    r.guns.owner = r;
    r.guns.update(dt, firing && !!tgt, r, tgt ? r.aim : null);
  }

  update(dt) {
    const N = LOOP.n, c = this.car;
    Race.camX = c.x; Race.camZ = c.z;
    this.t += dt;
    this.raceT += dt;
    // player progress, unwrapped so only forward laps count
    const i = c.n.i;
    this.pProg += ((i - this.pI + N + N / 2) % N) - N / 2;
    this.pI = i;
    const lap = Math.floor(this.pProg / N);
    if (this.state === 'race' && lap >= 1 && lap > (this.lapsDone ?? 0)) {
      this.lapsDone = lap;
      this.lastLap = this.raceT - this.lapStart;
      this.lapStart = this.raceT;
      if (!this.bestLap || this.lastLap < this.bestLap) this.bestLap = this.lastLap;
      if (lap < LAPS) this.hud.title(lap === LAPS - 1 ? 'Final lap' : `Lap ${lap + 1}`, fmt(this.lastLap));
    }
    if (this.state === 'race' && this.pProg >= LAPS * N) { this.pFinish = this.raceT; this.over('finished'); }

    const all = this.bodies().map((b) => ({ ...b, lat: b.ref === this.player ? c.n.lat : b.ref.lat }));
    for (const r of this.rivals) { this.updateRival(r, dt, all); r.pose(dt); }
    this.contacts();
    for (const r of this.rivals) r.pose(0);
    // damage tiers from hull HP: untouched = clean; hurt = light smoke; heavy = black
    // smoke; critical = black smoke and flame licking out of the engine bay
    for (const r of [...this.rivals, this.player]) {
      const a = r.armor;
      if (a.core >= 0.999) continue;
      const tier = a.wrecked ? 3 : a.core > 0.55 ? 1 : a.core > 0.25 ? 2 : 3;
      r.smokeAcc = (r.smokeAcc ?? 0) + dt * [0, 7, 14, 22][tier];
      const me = r === this.player, x = me ? c.x : r.x, y = me ? c.y : r.y, z = me ? c.z : r.z, yaw = me ? c.yaw : r.yaw;
      const vx = me ? c.vx : r.vx, vz = me ? c.vz : r.vz;
      while (r.smokeAcc >= 1) {
        r.smokeAcc -= 1;
        const ex = x + Math.sin(yaw) * 1.6, ez = z + Math.cos(yaw) * 1.6, g = [0, 0.55, 0.2, 0.08][tier];
        this.fx.dust.emit(ex, y + 0.95, ez, vx * 0.4 + (Math.random() - 0.5), 1.5 + Math.random(), vz * 0.4 + (Math.random() - 0.5), (0.7 + Math.random() * 0.7) * (tier === 3 ? 1.5 : 1), 1.2 + Math.random(), g, g * 0.97, g * 0.95);
        if (tier === 3) for (let q = 0; q < 2; q++) this.fx.sparks.emit(ex + (Math.random() - 0.5) * 0.6, y + 0.85, ez + (Math.random() - 0.5) * 0.6, vx * 0.85 + (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2.5, vz * 0.85 + (Math.random() - 0.5) * 1.5, 0.35 + Math.random() * 0.25, 0.25 + Math.random() * 0.2, 1.0, 0.45 + Math.random() * 0.25, 0.08);
      }
    }
    for (const k of ZONES) this.player.armor.flash[k] = Math.max(0, this.player.armor.flash[k] - dt);

    // standings: finishers by time, then by progress; wrecks last
    const rows = [{ ...this.player, prog: this.pProg, finished: this.state === 'done' && this.pFinish > 0, finishT: this.pFinish }, ...this.rivals];
    rows.sort((p, q) => (p.armor.wrecked - q.armor.wrecked) || ((q.finished ? 1 : 0) - (p.finished ? 1 : 0)) || (p.finished && q.finished ? p.finishT - q.finishT : q.prog - p.prog));
    this.order = rows;
    this.hud.standings(rows.map((r) => ({ name: r.name, you: !!r.you, color: r.hex, out: r.armor.wrecked, gap: r.you ? '' : r.armor.wrecked ? 'OUT' : r.finished ? 'FIN' : `${r.prog > this.pProg ? '+' : '-'}${Math.round(Math.abs(r.prog - this.pProg) * STEP)}m` })));
    this.hud.armor(this.player.armor, this.t, dt);
    this.wreckage.update(dt, (q) => {
      this.fx.dust.emit(q.x, q.y + 0.3, q.z, 0, 1.2 + Math.random(), 0, 0.6 + Math.random() * 0.5, 1 + Math.random(), 0.1, 0.09, 0.08);
      this.fx.sparks.emit(q.x, q.y + 0.2, q.z, (Math.random() - 0.5), 1 + Math.random() * 1.5, (Math.random() - 0.5), 0.3, 0.3, 1.0, 0.5, 0.1);
    });
    this.hud.mapDots(this.rivals.filter((r) => !r.armor.wrecked).map((r) => ({ x: r.x, z: r.z, color: r.hex })));
    if (this.state === 'done' && !this.shown && this.t - this.doneT > 1.6) this.showResults();
  }

  over(why) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.why = why;
    this.doneT = this.t;
  }

  showResults() {
    this.shown = true;
    const me = this.order.findIndex((r) => r.you) + 1;
    const ord = (n) => `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`;
    this.hud.results({
      title: this.why === 'wrecked' ? 'WRECKED' : this.why === 'annihilation' ? '1ST' : ord(me),
      sub: this.why === 'wrecked' ? 'Your car is scrap' : this.why === 'annihilation' ? `Last car running · ${this.kills} destroyed` : me === 1 ? 'Winner' : me <= 3 ? 'Podium finish' : 'Finished',
      win: this.why === 'annihilation' || (this.why !== 'wrecked' && me === 1),
      rows: this.order.map((r, k) => ({ pos: k + 1, name: r.name, you: !!r.you, color: r.hex, time: r.armor.wrecked ? 'WRECKED' : r.finished ? fmt(r.finishT) : '—' })),
      best: this.bestLap ? fmt(this.bestLap) : '',
      onAgain: () => this.again(),
    });
  }
}

export const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
