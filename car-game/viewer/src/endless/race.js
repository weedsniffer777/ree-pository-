import { Scars } from './scars.js';
import * as THREE from 'three';
import { S, STEP, LOOP, wAt, RAIL_LAT, pointAt } from './route.js';
import { roadSurfaceY } from '../level/road.js';
import { Guns } from '../level/combat.js';
import { paintTopSkin } from '../models/cars/starterCoupe.js';
import { bakeGroup } from '../level/bake.js';
import { partsOf, charModel, unchar, Wreckage } from './carparts.js';
import { Holes } from './holes.js';
import { CarController } from './car.js';
import { AI, think } from './ai.js';

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

// ---------------------------------------------------------------- damage tuning
// Two kinds of melee damage. IMPACT: the hit of a collision, by closing speed (an intact
// ram adds to it). CONTACT: damage per second while touching: spiked wheels grinding a
// car alongside, the dozer blade pressed into one, and scraping / being pinned against a
// wall. Gun damage per round is set where the guns are wired (0.05 player, 0.022 AI).
export const DMG = {
  impactFrom: 5, // m/s of closing speed before a collision hurts
  impactPer: 0.012, // armor per m/s above that
  ramBonus: 1.5, // an intact ram hitting multiplies the impact it deals ...
  ramSelf: 0.5, // ... and what it takes itself
  spikes: 0.15, // per second, scraping alongside at speed
  dozer: 0.12, // per second, blade pressed into a car
  wallScrape: 0.03, // per second against a wall, plus ...
  wallScrapeV: 0.0025, // ... this per m/s of sliding along it; fades to 0 below scrapeFrom
  scrapeFrom: 26.8, scrapeFull: 34, // m/s along the wall: nothing below 60 mph
  wallImpactFrom: 7, wallImpactPer: 0.018, // slamming a wall
};

// ---------------------------------------------------------------- armor
const ZONES = ['front', 'back', 'left', 'right'];
const STAGES = [[1, 0.66], [2, 0.33], [3, 0]]; // armor chunk stage, and the side's armor level it comes off at
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
  const keyOf = (x) => (skins.has(x) || x.userData.brake ? x.uuid : [x.type, q(x.color), x.map?.uuid, x.transparent, x.emissive && x.emissive.getHex() ? q(x.emissive) : '', x.blending].join('|'));
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
  template = { model: m, skins: ud.skins, brakeMats: ud.brakeMats };
  return template;
}

// A rival: the template with its own skin materials (own streak colour, own damage).
function cloneCar(base, color) {
  const { model, skins, brakeMats } = rivalTemplate(base);
  const m = model.clone(true);
  const src = skins, mats = { side: src.side.clone(), front: src.front.clone(), back: src.back.clone(), top: paintTopSkin(color), lamps: Object.fromEntries(Object.entries(brakeMats).map(([k, m]) => [k, m.clone()])) };
  const map = new Map([[src.side, mats.side], [src.front, mats.front], [src.back, mats.back], [src.top, mats.top], ...Object.keys(brakeMats).map((k) => [brakeMats[k], mats.lamps[k]])]);
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

// A rival drives the same physics car as the player (walls, ramps, drift, collisions,
// spin-outs all identical); a driver on top turns the race situation into steer /
// throttle / brake. Personality: racers run their line and dodge fire; fighters hunt a
// target, ride its lane, ram it and go for PIT maneuvers.
class Rival {
  constructor(slot, base, scene, fx, colliders) {
    const r = ROSTER[slot];
    Object.assign(this, { slot, name: r.name, hex: r.hex, ai: true });
    const { model, mats, wheels } = cloneCar(base, r.color);
    Object.assign(this, { model, mats, wheels, parts: partsOf(model), lamps: { mats: mats.lamps, out: {} } });
    this.car = new CarController(model, colliders);
    this.rig = this.car.rig;
    scene.add(this.rig);
    this.armor = new Armor();
    this.personality = 'racer'; // a label for its anger (see AI.rage): racer, killer past half
    this.drifter = slot % 2 === 0; // throws the car into tight corners
    // easy: well under the player's top speed; racers drive faster lines than killers
    this.skill = 0.86 + (slot / ROSTER.length) * 0.05 + Math.random() * 0.03 + 0.025;
    this.guns = new Guns(model, scene, { ...fx, sparks: fx.lines, light: false, color: 0xffa21c, rate: 6.5, spread: 2.2 });
    this.guns.owner = this;
    this.burst = 0;
    this.cool = 2 + Math.random() * 3;
    this.inp = { throttle: 1, brake: 0, steer: 0, boost: false, fire: false, cap: 0 };
  }
  get x() { return this.car.x; } get y() { return this.car.y; } get z() { return this.car.z; }
  get yaw() { return this.car.yaw; } get vx() { return this.car.vx; } get vz() { return this.car.vz; }
  get v() { return this.car.vf; } get lat() { return this.car.n.lat; }
  place(prog, lat, v) {
    const i = wrapI(prog);
    this.car.reset(i, lat);
    const p = pointAt(i, lat);
    this.car.vx = Math.sin(p.yaw) * v; this.car.vz = Math.cos(p.yaw) * v; this.car.vf = v;
    this.car.dead = false;
    Object.assign(this, { prog, pI: i, latT: lat, laneT: lat, rage: 0, personality: 'racer', finished: false, finishT: 0, deadT: 0, smokeAcc: 0, stuckT: 0, hitT: -9, air: null, target: null, behaviour: 'race', thinkT: Math.random() * AI.thinkEvery });
    this.mem = { grudge: new Map(), crossed: new Map(), side: new Map() };
    this.plan = { lat, speed: v, fire: null, boost: false };
    this.car.boost = 1; // full tank, same as the player
    this.armor.reset();
    wear(this.mats, this.armor);
    this.sync(0);
  }
  // progress along the loop, unwrapped so laps count
  track() {
    const N = LOOP.n, i = this.car.n.i;
    this.prog += ((i - this.pI + N + N / 2) % N) - N / 2;
    this.pI = i;
  }
  sync(dt) {
    this.car.sync(dt);
    this.rig.visible = Math.hypot(this.x - (Race.camX ?? this.x), this.z - (Race.camZ ?? this.z)) < 420;
    // a launched wreck tumbles about the body's middle (0.6 m up) while it flies
    if (this.air) {
      const A = this.air;
      this.model.rotation.set(A.rx, 0, A.rz);
      const o = Rival.piv.set(0, 0.6, 0).applyEuler(this.model.rotation);
      const flipped = Math.cos(A.rx) * Math.cos(A.rz) < 0;
      this.model.position.set(-o.x, 0.6 - o.y + (A.landed ? (flipped ? 0.12 : -0.3) : 0), -o.z);
    }
  }
  static piv = new THREE.Vector3();
}

// ---------------------------------------------------------------- race
export class Race {
  constructor({ scene, model, car, fx, hud, gunsHitHook, booms, debris }) {
    Object.assign(this, { scene, car, fx, hud, booms, debris, model, hitstop: 0 });
    this.wreckage = new Wreckage(scene, fx.height);
    this.holes = new Holes();
    this.scars = new Scars();
    // the player's car slamming walls and props costs armor on the side that hit
    this.wallHits(car, () => this.player);
    this.playerParts = partsOf(model);
    profile ??= speedProfile(17, 9);
    this.player = { name: 'You', hex: ROSTER[0].hex, you: true, armor: new Armor(), mats: model.userData.skins, lamps: { mats: model.userData.brakeMats, out: {} } };
    this.hb = car.hitbox;
    this.rivals = [];
    for (let s = 1; s < ROSTER.length; s++) this.rivals.push(new Rival(s, model, scene, fx, car.colliders));
    for (const r of this.rivals) this.wallHits(r.car, () => r);
    const hitTest = (o, d, range, shooter) => this.rayHit(o, d, range, shooter);
    for (const r of this.rivals) { r.guns.hitTest = hitTest; r.guns.onTargetHit = (h) => this.damage(h.target, h.zone, 0.028, r, h.point, 'gun', h.dir); }
    gunsHitHook(hitTest, (h) => { this.damage(h.target, h.zone, 0.05, this.player, h.point, 'gun', h.dir); car.addBoost(0.012); });
    hud.armorModel(rivalTemplate(model).model, this.hb);
    this.reset();
  }

  // already racing: the field strung out ahead of and behind the player (5th), the leader
  // just short of the line, cars in different lanes
  gridSlot(k) {
    const ahead = [0, 16, 34, 52, 70, 88, 108, 128][k]; // metres behind the leader
    const prog = (134 - ahead) / STEP; // the whole field already past the line, on the straight
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
    for (const q of [this.player, ...this.rivals]) q.lamps.out = {};
    this.scars.clear();
    this.holes.clear();
    this.car.dead = false;
    unchar(this.model);
    this.model.position.y = 0;
    for (const r of this.rivals) { unchar(r.model); r.model.position.set(0, 0, 0); r.model.rotation.set(0, 0, 0); }
    this.kills = 0;
    this.dealt = { front: 0, back: 0, left: 0, right: 0, core: 0 }; // HP the player put into each part of the enemies
    this.combo = { n: 0, t: -9 };
    this.hud.clearCracks();
    Object.assign(this, { state: 'race', t: 0, raceT: 0, lapStart: 0, lapsDone: 0, bestLap: 0, lastLap: 0, pFinish: 0, shown: false, endE: 0, endShot: null, finalKill: null, parked: false, placed: false, closing: false, skipping: false });
    this.hud.results(null);
    this.hud.ended(false);
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
    const out = [{ ref: this.player, car: c, x: c.x, y: c.y, z: c.z, yaw: c.yaw, prog: this.pProg }];
    for (const r of this.rivals) if (!(r.air && !r.air.landed && r.car.airborne)) out.push({ ref: r, car: r.car, x: r.x, y: r.y, z: r.z, yaw: r.yaw, prog: r.prog });
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
        best = { d: dist, point: p, dir: d.clone().normalize(), target: b.ref, zone: Armor.zoneOf(lx, lz, hx, (hz1 - hz0) / 2) };
      }
    }
    return best;
  }

  // Armor soaks a hit on its side until stripped; past that the hull HP (core) takes it.
  // Player hits drive the feedback: hitmarker, combo count, CRITICAL when a side breaks or
  // HP crosses a third, DESTROYED with the kill tally, small blasts on crits.
  damage(target, zone, dmg, attacker = null, point = null, cause = 'gun', dir = null) {
    const a = target.armor;
    if (a.wrecked || this.state === 'done' && target === this.player) return;
    // (bullet holes on the bodywork are switched off for now: this.holes.add(...))
    const zb = a.z[zone], hb = a.core;
    if (target.ai) {
      target.hitT = this.t;
      // grudge: who hurt me, how much, and whether they rammed me
      if (attacker && attacker !== target) {
        const g = target.mem.grudge.get(attacker) ?? { amount: 0, t: 0, ram: false };
        g.amount = Math.min(1.5, g.amount * Math.max(0, 1 - (this.t - g.t) / AI.memory) + dmg * 8 + (cause === 'ram' ? 0.5 : 0));
        g.t = this.t;
        g.ram = g.ram || cause === 'ram';
        target.mem.grudge.set(attacker, g);
        target.rage = Math.min(1, (target.rage ?? 0) + dmg * AI.rage.hit + (cause === 'ram' ? AI.rage.ram : 0));
      }
    }
    // critical hits: a share of gun and ram hits land somewhere that matters (anyone can
    // take one, you included), for extra damage and a blast; wall friction never crits
    const lucky = cause === 'gun' ? 0.05 : cause === 'ram' || cause === 'crash' ? 0.12 : 0;
    const critRoll = Math.random() < lucky;
    if (critRoll) dmg *= 2.5;
    a.hit(zone, dmg);
    if (attacker === this.player && target !== this.player) { this.dealt[zone] += (zb - a.z[zone]) * 100; this.dealt.core += (hb - a.core) * 100; }
    wear(target.mats, a);
    const broke = zb > 0 && a.z[zone] === 0, tier = (h) => (h > 0.66 ? 0 : h > 0.33 ? 1 : 2);
    const crit = critRoll || broke || tier(a.core) > tier(hb);
    const pos = point ?? new THREE.Vector3(target.x ?? this.car.x, (target.y ?? this.car.y) + 0.8, target.z ?? this.car.z);
    const vel = target === this.player ? new THREE.Vector3(this.car.vx, 0, this.car.vz) : new THREE.Vector3(target.vx, 0, target.vz);
    if (crit) this.booms.blast(pos, vel, false); // every blast is a crit
    // armor comes off in chunks: stage 1 below 2/3 of that side, stage 2 below 1/3, the last at 0
    for (const [stage, th] of STAGES) if (zb > th && a.z[zone] <= th) this.tearOff(target, zone, vel, stage);
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
        const word = cause === 'ram' ? (Math.random() < 0.5 ? 'RAMMED' : 'CRUSHED') : 'DESTROYED';
        this.hud.popup(`${word}<small>x${this.kills}</small>`, 'kill');
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
      if (crit) { this.hud.flash(0.12); this.hud.hurt(0.05); }
      // the screen cracks on solid chunks of hull damage once HP is under 75
      if (a.core < 0.75) {
        this.crackAcc = (this.crackAcc ?? 0) + (hb - a.core);
        if (this.crackAcc >= 0.05 && this.t - (this.crackT ?? -9) > 1.2) { this.hud.crack(); this.crackAcc = 0; this.crackT = this.t; }
      }
    }
    if (a.wrecked) this.detonate(target, cause);
  }

  // a stage of a side's armor comes away (the front's last stage is the dozer blade)
  tearOff(target, zone, vel, stage = 3) {
    // the rear going: first one brake light is smashed, then the other
    if (zone === 'back') {
      const o = target.lamps.out, side = !o.L && !o.R ? (Math.random() < 0.5 ? 'L' : 'R') : !o.L ? 'L' : 'R';
      if (stage >= 2) o.L = o.R = true; else o[side] = true;
    }
    const me = target === this.player, parts = me ? this.playerParts : target.parts, yaw = me ? this.car.yaw : target.yaw;
    const f = [Math.sin(yaw), Math.cos(yaw)], out = { front: f, back: [-f[0], -f[1]], left: [f[1], -f[0]], right: [-f[1], f[0]] }[zone];
    for (const part of parts) {
      if (part.userData.zone !== zone || (part.userData.stage ?? 3) !== stage) continue;
      // bare metal under it: scarred
      this.scars.addUnder(me ? this.model : target.model, part, zone === 'front' && stage === 1 ? new THREE.Vector3(out[0] * 0.3, 1, out[1] * 0.3) : new THREE.Vector3(out[0], zone === 'front' || zone === 'back' ? 0.3 : 0, out[1])); // hood plates: from above
      // thrown clear and tumbling so you see the plating go
      const kick = new THREE.Vector3(out[0] * (4 + Math.random() * 4), 3.5 + Math.random() * 3, out[1] * (4 + Math.random() * 4));
      this.wreckage.detach(part, vel.clone().multiplyScalar(0.85), kick);
    }
    // a burst of sparks and torn fragments off that side
    const c = target === this.player ? this.car : target.car, px = c.x + out[0] * 1.1, pz = c.z + out[1] * (zone === 'front' || zone === 'back' ? 2.2 : 1.1);
    this.fx.lines.burst(px, c.y + 0.6, pz, c.vx * 0.8 + out[0] * 6, 2, c.vz * 0.8 + out[1] * 6, 20 + stage * 8, 12, 6);
    const tmp = new THREE.Vector3(), tv = new THREE.Vector3();
    for (let k = 0; k < 7; k++) {
      tmp.set(px + (Math.random() - 0.5), c.y + 0.5 + Math.random() * 0.4, pz + (Math.random() - 0.5));
      tv.set(c.vx * 0.8 + out[0] * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3, 3 + Math.random() * 5, c.vz * 0.8 + out[1] * (3 + Math.random() * 5) + (Math.random() - 0.5) * 3);
      this.debris.spawn(tmp, tv, { size: [0.08 + Math.random() * 0.25, 0.02 + Math.random() * 0.04, 0.08 + Math.random() * 0.25], life: 3 + Math.random() * 2, spin: 18, color: [0x2b2d2f, 0x3a3d40, 0x1c1c1c][k % 3] });
    }
  }

  // How a rival goes up. Today a coin flip between a plain blast and one that throws the
  // chassis into the air; later this keys off the kind of kill (ram, crit, overkill...).
  killStyle(target, cause) { return Math.random() < (cause === 'ram' ? 0.7 : 0.45) ? 'launch' : 'plain'; }

  // a car going up: big blast, every bolt-on part blown off with the car's speed, and the
  // chassis left as a charred, burning wreck that slides to a stop and stays solid
  detonate(target, cause = 'gun') {
    const me = target === this.player, c = this.car;
    const p = new THREE.Vector3(me ? c.x : target.x, (me ? c.y : target.y) + 0.7, me ? c.z : target.z);
    const v = me ? new THREE.Vector3(c.vx, 0, c.vz) : new THREE.Vector3(target.vx, 0, target.vz);
    this.booms.blast(p, v, true);
    const model = me ? this.model : target.model;
    charModel(model);
    for (const part of me ? this.playerParts : target.parts) {
      const kick = new THREE.Vector3((Math.random() - 0.5) * 18, 5 + Math.random() * 9, (Math.random() - 0.5) * 18);
      this.wreckage.detach(part, v.clone().multiplyScalar(0.8 + Math.random() * 0.25), kick, Math.random() < 0.85);
    }
    model.position.y = -0.3; // on its belly with the wheels gone
    const tmp = new THREE.Vector3(), tv = new THREE.Vector3();
    for (let k = 0; k < 12; k++) { // shrapnel
      tmp.set(p.x + (Math.random() - 0.5) * 1.8, p.y + Math.random() * 0.8, p.z + (Math.random() - 0.5) * 3.5);
      tv.set(v.x * (0.7 + Math.random() * 0.3) + (Math.random() - 0.5) * 16, 4 + Math.random() * 12, v.z * (0.7 + Math.random() * 0.3) + (Math.random() - 0.5) * 16);
      this.debris.spawn(tmp, tv, { size: [0.12 + Math.random() * 0.3, 0.05 + Math.random() * 0.15, 0.12 + Math.random() * 0.35], life: 3 + Math.random() * 3, spin: 16, color: [0x1c1c1c, 0x2a2b2c, 0x141414][k % 3], burn: k % 2 === 0 });
    }
    if (me) { c.dead = true; c.vx *= 0.85; c.vz *= 0.85; this.over('wrecked'); }
    else {
      const tc = target.car;
      target.deadT = 0;
      tc.dead = true;
      tc.spin += (Math.random() - 0.5) * 4; // the blast slews the wreck round
      tc.vx *= 0.7; tc.vz *= 0.7;
      tc.model.position.y = -0.3;
      if (this.killStyle(target, cause) === 'launch') {
        tc.vx *= 0.75; tc.vz *= 0.75;
        tc.vy = 10 + Math.random() * 4; tc.airborne = true; // real flight, real landing
        target.air = { t: 0, rx: 0, rz: 0, wx: (Math.random() - 0.5) * 6, wz: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3), landed: false };
      }
    }
    if (!me && this.rivals.every((r) => r.armor.wrecked) && this.state === 'race') { this.finalKill = target; this.over('annihilation'); }
  }

  // slamming a wall or prop: impact damage on the side that hit (every car)
  wallHits(car, who) {
    car.onImpact = (v, nx, nz) => {
      if (v < DMG.wallImpactFrom || this.state !== 'race') return;
      const f = [Math.sin(car.yaw), Math.cos(car.yaw)], lz = -nx * f[0] - nz * f[1], lx = -nx * -f[1] - nz * f[0];
      this.damage(who(), Armor.zoneOf(lx, lz, 1, 1), (v - DMG.wallImpactFrom) * DMG.wallImpactPer, null, null, 'wall');
    };
  }
  // scraping or pinned against the wall this frame: contact damage on that side
  scrapes(dt) {
    for (const [car, ref] of [[this.car, this.player], ...this.rivals.map((r) => [r.car, r])]) {
      const sc = car.scrape;
      car.scrape = null;
      if (!sc || ref.armor.wrecked || this.state !== 'race') continue;
      const f = [Math.sin(car.yaw), Math.cos(car.yaw)], lz = sc.nx * f[0] + sc.nz * f[1], lx = sc.nx * -f[1] + sc.nz * f[0];
      const fade = Math.max(0, Math.min(1, (sc.v - DMG.scrapeFrom) / (DMG.scrapeFull - DMG.scrapeFrom)));
      const spark = Math.max(0, Math.min(1, (sc.v - 3) / 7)); // the sparks still fly at any real speed
      if (fade > 0) this.damage(ref, Armor.zoneOf(lx, lz, 1, 1), (DMG.wallScrape + sc.v * DMG.wallScrapeV) * fade * dt, null, null, 'wall');
      // a continuous stream along the wall while scraping (none when barely moving)
      const n = Math.floor(sc.v * dt * 18 * spark + Math.random() * spark);
      for (let q = 0; q < n; q++) {
        const along = (Math.random() - 0.5) * 3.6, f2 = [Math.sin(car.yaw), Math.cos(car.yaw)];
        this.fx.lines.emit(car.x + sc.nx * 1.0 + f2[0] * along, car.y + 0.3 + Math.random() * 0.4, car.z + sc.nz * 1.0 + f2[1] * along, car.vx * 0.75 - sc.nx * 2 + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 2.5, car.vz * 0.75 - sc.nz * 2 + (Math.random() - 0.5) * 3, 0, 0.2 + Math.random() * 0.3);
      }
    }
  }

  // Car-to-car contact, the same for every car: separate the hulls, trade momentum along
  // the contact normal, and spin each car by where it was struck (a hit on the rear
  // quarter swings the tail round: PIT). Damage goes to the struck zone; a car hitting
  // with an intact ram deals far more and takes less; spiked wheels grind down a car
  // they scrape alongside.
  contacts(dt) {
    const B = this.bodies(), { r, offs, hx, hz0, hz1 } = this.hb;
    const zoneOn = (body, px, pz) => {
      const f = [Math.sin(body.yaw), Math.cos(body.yaw)], dx = px - body.x, dz = pz - body.z;
      return Armor.zoneOf(dx * -f[1] + dz * f[0], dx * f[0] + dz * f[1] - (hz0 + hz1) / 2, hx, (hz1 - hz0) / 2);
    };
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
      const pen = 2 * r - deep.d, { nx, nz, px, pz } = deep, ca = A.car, cc = C.car;
      const wA = A.ref.armor.wrecked ? 0.7 : 1, wC = C.ref.armor.wrecked ? 0.7 : 1; // wrecks are heavy, solid obstacles
      ca.x += nx * pen * wA / (wA + wC); ca.z += nz * pen * wA / (wA + wC);
      cc.x -= nx * pen * wC / (wA + wC); cc.z -= nz * pen * wC / (wA + wC);
      const zA = zoneOn(A, px, pz), zC = zoneOn(C, px, pz);
      // spiked wheels: scraping side to side grinds the other car down
      const tx = -nz, tz = nx, vt = (ca.vx - cc.vx) * tx + (ca.vz - cc.vz) * tz;
      if (Math.abs(vt) > 3 && (zA === 'left' || zA === 'right') && (zC === 'left' || zC === 'right')) {
        const g = Math.min(1, Math.abs(vt) / 15) * DMG.spikes * dt;
        if (this.hasSpikes(A.ref)) this.damage(C.ref, zC, g, A.ref, null, 'crash');
        if (this.hasSpikes(C.ref)) this.damage(A.ref, zA, g, C.ref, null, 'crash');
        // continuous shower while they grind
        const n = Math.floor(Math.abs(vt) * dt * 22 + Math.random());
        this.fx.lines.burst(px, (A.y + C.y) / 2 + 0.35, pz, (ca.vx + cc.vx) / 2, 1, (ca.vz + cc.vz) / 2, n, 9, 3);
      }
      // dozer blade pressed into a car: contact damage while it's held there
      if (zA === 'front' && this.hasRam(A.ref)) this.damage(C.ref, zC, DMG.dozer * dt, A.ref, null, 'ram');
      if (zC === 'front' && this.hasRam(C.ref)) this.damage(A.ref, zA, DMG.dozer * dt, C.ref, null, 'ram');
      const vrel = (ca.vx - cc.vx) * nx + (ca.vz - cc.vz) * nz;
      if (vrel >= 0) continue;
      if (-vrel > 2.5) this.fx.lines.burst(px, (A.y + C.y) / 2 + 0.45, pz, (ca.vx + cc.vx) / 2, 1.5, (ca.vz + cc.vz) / 2, Math.min(40, Math.round(-vrel * 3)), 10 + -vrel * 0.6, 5);
      const j = -(A.ref.armor.wrecked || C.ref.armor.wrecked ? 1 : 1.3) * vrel / 2; // wrecks: dead stop, no rebound
      ca.vx += nx * j; ca.vz += nz * j;
      cc.vx -= nx * j; cc.vz -= nz * j;
      // spin from the off-centre impulse (y of r x J); bigger when the tail is hit
      const spinOf = (body, s) => { const rx = px - body.x, rz = pz - body.z; return (rz * nx * s - rx * nz * s) * 0.13; };
      if (!A.ref.armor.wrecked) ca.spin += spinOf(A, j);
      if (!C.ref.armor.wrecked) cc.spin += spinOf(C, -j);
      if (A.ref === this.player) ca.hit(j); if (C.ref === this.player) cc.hit(j);
      if (-vrel > DMG.impactFrom) {
        const base = (-vrel - DMG.impactFrom) * DMG.impactPer;
        const ramA = zA === 'front' && this.hasRam(A.ref), ramC = zC === 'front' && this.hasRam(C.ref);
        // an intact ram adds to the impact it deals and soaks part of its own
        this.damage(A.ref, zA, base * (ramC ? DMG.ramBonus : 1) * (ramA ? DMG.ramSelf : 1), C.ref, null, zC === 'front' ? 'ram' : 'crash');
        this.damage(C.ref, zC, base * (ramA ? DMG.ramBonus : 1) * (ramC ? DMG.ramSelf : 1), A.ref, null, zA === 'front' ? 'ram' : 'crash');
        if (A.ref.ai) A.ref.hitT = this.t; if (C.ref.ai) C.ref.hitT = this.t;
      }
    }
  }
  hasRam(ref) { return (ref === this.player ? this.playerParts : ref.parts).some((p) => p.name === 'FRONT' && !p.userData.home); }
  hasSpikes(ref) { return (ref === this.player ? this.playerParts : ref.parts).some((p) => p.userData.part === 'wheel' && !p.userData.home); }

  // physics step for every rival (called at the fixed physics rate)
  stepAI(h) {
    for (const r of this.rivals) r.car.step(h, r.inp);
  }

  // The driver: pick a speed and a lateral line, then steer at a point down the road.
  updateRival(r, dt, all) {
    const N = LOOP.n, c = r.car, i = c.n.i;
    r.track();
    if (r.armor.wrecked) { // slides to a stop under its own physics, burning
      r.deadT += dt;
      c.dead = true;
      Object.assign(r.inp, { throttle: 0, brake: 0, steer: 0 });
      const A = r.air;
      if (A && !A.landed) { // thrown by the blast: tumble while airborne, settle on wheels or roof
        A.t += dt;
        A.rx += A.wx * dt; A.rz += A.wz * dt;
        if (A.t > 0.25 && !c.airborne) {
          if (!A.bounced && Math.abs(A.wx) + Math.abs(A.wz) > 2) { A.bounced = true; c.vy = 3.5; c.airborne = true; A.wx *= 0.45; A.wz *= 0.45; this.booms.blast(new THREE.Vector3(r.x, r.y + 0.4, r.z), new THREE.Vector3(r.vx, 0, r.vz).multiplyScalar(0.3), false); }
          else { A.landed = true; A.rx = Math.round(A.rx / Math.PI) * Math.PI; A.rz = Math.round(A.rz / Math.PI) * Math.PI; }
        }
      }
      return;
    }
    const v = Math.max(0, c.vf), me = all.find((o) => o.ref === r), room = latMax(i);
    // ---- normal racing speed: the corner profile ahead, rubber band, finishing cool-down
    let line = Math.min(profile[(i + Math.round(v * 0.35)) % N], 45.8 * r.skill);
    const gapP = (r.prog - this.pProg) * STEP;
    if (!r.finished && this.state === 'race') line *= gapP > 60 ? Math.max(0.88, 1 - (gapP - 60) / 1500) : gapP < -90 ? Math.min(1.1, 1 + (-gapP - 90) / 1200) : 1;
    if (r.finished) line = Math.min(line, 22);
    // ---- my racing lane: pass slower traffic on the roomier side, wander a little
    for (const o of all) {
      if (o.ref === r) continue;
      const ahead = (o.prog - r.prog) * STEP, dl = o.lat - me.lat;
      if (ahead < 1 || ahead > 24 || Math.abs(dl) > 2.6) continue;
      const ov = o.ref === this.player ? Math.max(0, this.car.vf) : o.ref.armor.wrecked ? 0 : o.ref.v;
      if (ov >= v - 0.5) continue;
      const left = o.lat - 3.2, right = o.lat + 3.2, canL = left > -room, canR = right < room;
      if (canL || canR) r.laneT = !canR || (canL && Math.abs(left - me.lat) < Math.abs(right - me.lat)) ? left : right;
      else line = Math.min(line, ov);
    }
    if (Math.random() < dt * 0.15) r.laneT = (Math.random() - 0.5) * 2 * room * 0.7;
    r.laneT = Math.max(-room, Math.min(room, r.laneT));
    // ---- what I can see: who's on my six, who's in my sights, who just cut across me
    let threat = null, sights = null;
    for (const o of all) {
      if (o.ref === r || o.ref.armor.wrecked) continue;
      const ahead = (o.prog - r.prog) * STEP, dl = o.lat - me.lat;
      if (ahead < -3 && ahead > -30 && Math.abs(dl) < 3 && (!threat || ahead > (threat.prog - r.prog) * STEP)) threat = o;
      if (ahead > 8 && ahead < 70 && Math.abs(dl) < 2.5 + ahead * 0.05 && !sights) sights = o;
      if (ahead > 2 && ahead < 18) {
        const side = Math.sign(dl), was = r.mem.side.get(o.ref);
        if (was && side && side !== was) r.mem.crossed.set(o.ref, this.t);
        r.mem.side.set(o.ref, side);
      } else r.mem.side.delete(o.ref);
    }
    for (const o of all) o.v = o.ref === this.player ? Math.max(0, this.car.vf) : o.ref.v; // speeds for the brain
    // anger: winds up running in the back half of the field, cools off otherwise
    const place = this.order ? this.order.indexOf(r) : 0;
    r.rage = Math.max(0, Math.min(1, (r.rage ?? 0) + dt * (place >= this.order?.length / 2 ? AI.rage.behind : -AI.rage.decay)));
    r.personality = r.rage > 0.5 ? 'killer' : 'racer';
    // ---- decide (a few times a second), then follow the plan
    r.thinkT -= dt;
    if (this.state === 'race' && !r.finished && r.thinkT <= 0) {
      r.thinkT = AI.thinkEvery;
      think(r, { me, all, t: this.t, player: this.player, room, line, straight: profile[(i + 60) % N] > 44 && line >= 45.8 * r.skill * 0.98, threat, shotAt: this.t - r.hitT, inSights: sights, target: null }, r.plan);
    } else if (this.state !== 'race' || r.finished) Object.assign(r.plan, { lat: r.laneT, speed: line, fire: null, boost: false });
    const plan = r.plan, ptarget = plan.fire && all.find((o) => o.ref === plan.fire.ref);
    const lat = Math.max(-room, Math.min(room, plan.lat));
    const want = Math.min(plan.speed, line * 1.12, 45.8);
    c.addBoost(dt * AI.boostRegen);
    // ---- steer at a point down the road on my line
    const look = 9 + v * 0.55, tp = pointAt(i + Math.round(look / STEP), lat);
    let diff = Math.atan2(tp.x - c.x, tp.z - c.z) - c.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steer = THREE.MathUtils.clamp(-diff * 2.6, -1, 1);
    // brake hard only when well over and fairly straight (braking while steering drifts)
    const over = v - want;
    const flick = r.drifter && Math.abs(steer) > 0.55 && over > 1.5 && v > 18; // brake + steer: a drift into the corner
    Object.assign(r.inp, { steer, throttle: !flick && (over < -0.5 || plan.boost) ? 1 : 0, brake: flick || over > (Math.abs(steer) > 0.3 ? 7 : 3) ? 1 : 0, cap: plan.boost ? 0 : 45.8 * r.skill * (want > 45.8 * r.skill ? 1.05 : 1), boost: plan.boost && c.boost > AI.boostMeter && Math.abs(steer) < 0.3 && over < 2 });
    // ---- unstick: spun round or stopped against something for a while -> back on the road
    r.stuckT = v < 4 || Math.abs(diff) > 1.7 ? r.stuckT + dt : 0;
    if (r.stuckT > 2.5) { r.stuckT = 0; const k = i; c.reset(k, Math.max(-room, Math.min(room, me.lat))); const p = pointAt(k, me.lat); c.vx = Math.sin(p.yaw) * 16; c.vz = Math.cos(p.yaw) * 16; c.vf = 16; r.pI = k; }
    if (!r.finished && r.prog >= LAPS * N) { r.finished = true; r.finishT = this.raceT; }
    // ---- guns: short bursts at whatever the plan says to shoot
    r.cool -= dt;
    // the plan's target, else anything in a cone ahead: calm cars only shoot whoever comes
    // close, angry ones anything in reach
    let shoot = this.state === 'race' && ptarget && !ptarget.ref.armor.wrecked && (ptarget.prog - r.prog) * STEP > 5 ? ptarget : null;
    if (!shoot && this.state === 'race') {
      const reach = AI.guns.reachCalm + (AI.guns.reachAngry - AI.guns.reachCalm) * r.rage;
      let bd = reach;
      for (const o of all) {
        if (o.ref === r || o.ref.armor.wrecked) continue;
        const dx = o.x - r.x, dz = o.z - r.z, d = Math.hypot(dx, dz);
        if (d < 5 || d > bd) continue;
        let ang = Math.atan2(dx, dz) - c.yaw;
        ang = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(ang) < 0.45) { bd = d; shoot = o; }
      }
    }
    if (shoot && r.burst <= 0 && r.cool <= 0) r.burst = 1 + Math.random() * 0.8;
    const firing = r.burst > 0;
    if (firing) { r.burst -= dt; if (r.burst <= 0) r.cool = AI.guns.coolCalm + (AI.guns.coolAngry - AI.guns.coolCalm) * r.rage + Math.random() * 1.5; }
    r.aim = r.aim ?? new THREE.Vector3();
    if (shoot) { // lead the target like the player's lock does
      const lead = Math.hypot(shoot.x - r.x, shoot.z - r.z) / 420, sv = shoot.ref === this.player ? this.car : shoot.ref.car;
      r.aim.set(shoot.x + sv.vx * lead, shoot.y + 0.8, shoot.z + sv.vz * lead);
    }
    r.guns.update(dt, firing && !!shoot, r, shoot ? r.aim : null);
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
    for (const r of this.rivals) this.updateRival(r, dt, all);
    this.contacts(dt);
    this.scrapes(dt);
    for (const r of this.rivals) r.sync(dt);
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
    // brake lights: bright under braking, dead once smashed
    for (const q of [this.player, ...this.rivals]) {
      const on = !q.armor.wrecked && (q === this.player ? this.car.input?.brake : q.inp?.brake) > 0;
      for (const k of ['L', 'R']) {
        const m = q.lamps.mats?.[k], am = q.lamps.mats?.[k + 'A'], dead = q.lamps.out[k];
        if (m) { m.emissiveIntensity = dead || q.armor.wrecked ? 0 : on ? 2.6 : 0.6; m.color.setHex(dead ? 0x1a0d0b : 0xc8261a); }
        if (am) { am.emissiveIntensity = dead || q.armor.wrecked ? 0 : 0.5; am.color.setHex(dead ? 0x1a140b : 0xe08a1c); } // the amber goes with its side
      }
    }

    // standings: finishers by time, then by progress; wrecks last
    const rows = [{ ...this.player, prog: this.pProg, finished: this.state === 'done' && this.pFinish > 0, finishT: this.pFinish }, ...this.rivals];
    rows.sort((p, q) => (p.armor.wrecked - q.armor.wrecked) || ((q.finished ? 1 : 0) - (p.finished ? 1 : 0)) || (p.finished && q.finished ? p.finishT - q.finishT : q.prog - p.prog));
    this.order = rows;
    this.hud.standings(rows.map((r) => ({ name: r.name, you: !!r.you, color: r.hex, out: r.armor.wrecked, gap: r.you ? '' : r.armor.wrecked ? 'OUT' : r.finished ? 'FIN' : `${r.prog > this.pProg ? '+' : '-'}${Math.round(Math.abs(r.prog - this.pProg) * STEP)}m` })));
    this.hud.armor(this.player.armor, this.t, dt);
    this.holes.update(this.t, (key) => (key === 0 ? this.player.armor.core : this.rivals.find((r) => r.slot === key)?.armor.core ?? 1));
    this.wreckage.update(dt, (q, t) => {
      const g = 0.07 + Math.random() * 0.05;
      this.fx.dust.emit(q.x, q.y + 0.25, q.z, (Math.random() - 0.5) * 0.6, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.7, 1.6 + Math.random() * 1.4, g, g * 0.95, g * 0.9);
      if (t < 5) for (let k = 0; k < 2; k++) this.fx.sparks.emit(q.x + (Math.random() - 0.5) * 0.4, q.y + 0.15, q.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, 1.2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0.28 + Math.random() * 0.22, 0.25 + Math.random() * 0.25, 1.0, 0.45 + Math.random() * 0.3, 0.08);
    });
    this.hud.mapDots(this.rivals.filter((r) => !r.armor.wrecked).map((r) => ({ x: r.x, z: r.z, color: r.hex })));
  }

  over(why) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.why = why;
    this.doneT = this.t;
    this.endT = this.raceT;
    this.endE = 0;
    // the camera's outro: dwell on our wreck, or on the final kill, or watch us blast past
    this.endShot = why === 'wrecked' ? 'wreck' : why === 'annihilation' ? 'kill' : 'pass';
    this.hud.ended(true);
    this.hud.clearCracks();
  }

  // The end sequence, on real (unslowed) seconds: the outro shot, the placement slam, the
  // shutters close, and they open on the hero shot with the results.
  static END = { wrecked: { place: 3.5 }, annihilation: { pass: 1.9, place: 3.8 }, finished: { place: 2.4 } };
  tickEnd(rdt) {
    if (this.state !== 'done' || this.shown || this.skipping) return;
    const e = (this.endE += rdt), T = Race.END[this.why];
    if (T.pass && e >= T.pass && this.endShot === 'kill') this.endShot = 'pass';
    if (e >= T.place && !this.placed) {
      this.placed = true;
      const me = this.place;
      if (this.why === 'wrecked') this.hud.placement('DESTROYED', `${this.kills} kill${this.kills === 1 ? '' : 's'}`, 'dead');
      else this.hud.placement(ord(me), this.why === 'annihilation' ? 'Last car running' : me === 1 ? 'Winner' : me <= 3 ? 'Podium' : 'Finished', me === 1 ? 'win' : '');
    }
    if (e >= T.place + 1.3 && !this.closing) { this.closing = true; this.hud.intro(false); }
    if (e >= T.place + 2) { this.hero(); this.showResults(); this.hud.intro(true); }
  }

  // click / tap / key to skip the ending (after its first second): straight to the results
  skipEnd() {
    if (this.state !== 'done' || this.shown || this.endE < 1 || this.skipping) return;
    this.skipping = true;
    this.hud.intro(false);
    setTimeout(() => { this.hero(); this.showResults(); this.hud.intro(true); }, 450);
  }

  // how fast the world runs during the end sequence (slow motion on the big moments)
  get endScale() {
    if (this.state !== 'done') return 1;
    const e = this.endE, ramp = (a, b, lo) => (e < a ? lo : e > b ? 1 : lo + (1 - lo) * (e - a) / (b - a));
    return this.why === 'wrecked' ? ramp(1.8, 2.5, 0.25) : this.why === 'annihilation' ? ramp(1.4, 1.9, 0.2) : 1;
  }

  // our car parked just past the finish line, facing on (a wreck stays where it lies)
  hero() {
    this.endShot = 'hero';
    this.parked = true;
    const c = this.car;
    if (this.why !== 'wrecked') {
      c.reset(Math.round(7 / STEP), 0);
      c.vx = c.vz = c.vf = 0;
    }
    c.sync?.(0);
  }

  get place() { return this.order.findIndex((r) => r.you) + 1; }

  showResults() {
    this.shown = true;
    const me = this.place, dead = this.why === 'wrecked', win = !dead && me === 1;
    const d = this.dealt, dmg = Math.round(d.front + d.back + d.left + d.right + d.core);
    const bonus = dead ? 0 : [1500, 1000, 750, 500, 400, 300, 200, 100][me - 1] ?? 100;
    const score = [[dead ? 'Destroyed' : `${ord(me)} place`, bonus], [`${this.kills} kill${this.kills === 1 ? '' : 's'}`, this.kills * 500], [`${dmg} damage`, dmg * 5]];
    if (this.why === 'annihilation') score.push(['Last car running', 1000]);
    this.hud.results({
      header: dead ? 'DESTROYED' : 'RACE RESULTS',
      badge: dead ? '✕' : ord(me),
      sub: dead ? `Wrecked on lap ${this.playerLap}` : this.why === 'annihilation' ? `Last car running · ${this.kills} destroyed` : me === 1 ? 'Winner' : me <= 3 ? 'Podium finish' : 'Finished',
      time: fmt(this.why === 'finished' ? this.pFinish : this.endT),
      win, dead,
      rows: this.order.map((r, k) => ({ pos: k + 1, name: r.name, you: !!r.you, out: r.armor.wrecked, color: r.hex, car: 'Starter Coupe', time: r.armor.wrecked ? 'WRECKED' : r.finished ? fmt(r.finishT) : r.you && this.why === 'annihilation' ? fmt(this.endT) : '—' })),
      kills: this.kills,
      dealt: d,
      score,
      onNext: () => this.again(),
    });
  }
}

const ord = (n) => `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`;
export const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
