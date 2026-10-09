import * as THREE from 'three';
import { S, STEP, I_START, LOOP, wAt, RAIL_LAT, ROAD_HALF, ROAD_BEVEL, nearest, corridor, pointAt } from './route.js';
import { roadSurfaceY } from '../level/road.js';
import { railSide } from './world.js';

// The world supplies terrain height; set once at startup.
let terrainHeight = () => 0;
let terrainHeightN = null;
export function setTerrain(fn, fnN) { terrainHeight = fn; terrainHeightN = fnN; }

// Arcade car: forward/lateral velocity split with grip (drift comes from low lateral
// grip), speed-scaled steering, nitro, ground following from four wheel samples,
// ballistic airtime off crests, circle/box collisions, corridor and guardrail limits.

const G = 24;
const TOP_V = 45.8, BOOST_V = 58.3, REV_V = TOP_V * 0.5; // 165 / 210 km/h forward, 82 reverse
const WB_F = 1.3, WB_R = -1.25, TRACK = 0.77, WHEEL_R = 0.332;
// Hitbox: a row of circles fitted to the model's footprint (see fitHitbox).
export function fitHitbox(model) {
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model);
  const hx = Math.max(-bb.min.x, bb.max.x), z0 = bb.min.z, z1 = bb.max.z;
  const r = hx, n = Math.max(2, Math.ceil((z1 - z0 - 2 * r) / (r * 0.9)) + 1);
  const offs = [];
  for (let k = 0; k < n; k++) offs.push(z0 + r + ((z1 - z0 - 2 * r) * k) / (n - 1));
  return { r, offs, hx, hz0: z0, hz1: z1 };
}
const SURF = {
  road: { grip: 9, lat: 30, drag: 0.12, max: 1 },
  sand: { grip: 5.5, lat: 20, drag: 0.45, max: 0.82 },
};

export function groundAt(x, z, n) {
  let h = n && terrainHeightN ? terrainHeightN(x, z, n) : terrainHeight(x, z);
  if (n) {
    const w = wAt(n.i);
    if (Math.abs(n.lat) < ROAD_BEVEL * w) h = Math.max(h, n.y + roadSurfaceY(n.lat / w));
  }
  return h;
}

export class CarController {
  constructor(model, colliders) {
    this.model = model;
    this.colliders = colliders;
    this.rig = new THREE.Group();
    this.body = new THREE.Group();
    this.rig.add(this.body);
    this.body.add(model);
    this.wheels = model.userData.wheels;
    this.events = { impact: 0, land: 0 };
    this.hitbox = fitHitbox(model);
    this.reset(I_START, 1.85);
  }

  reset(i, lat = 1.85) {
    const p = pointAt(i, lat);
    Object.assign(this, {
      x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0, vy: 0, vf: 0, vl: 0, steerS: 0, yawRate: 0,
      nitro: 1, boost: 1, drift: 0, driftMode: false, prevBrake: false, stopT: 0, revOK: false, spun: false, clutch: 1, skid: 0, boosting: false, airborne: false, pitch: 0, roll: 0, accP: 0, lean: 0,
      bob: 0, bobV: 0, hint: i, prevLat: lat, onRoad: true, prevVf: 0,
    });
    this.n = nearest(this.x, this.z, i);
    this.near = null; this.spin = 0;
    this.y = this.prevG = this.groundCenter();
    this.sync(0);
  }

  wheelPos(fz, sx) {
    const fx = Math.sin(this.yaw), fzz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    return [this.x + fx * fz + rx * sx, this.z + fzz * fz + rz * sx];
  }

  groundCenter() {
    const h = [];
    for (const [fz, sx] of [[WB_F, -TRACK], [WB_F, TRACK], [WB_R, -TRACK], [WB_R, TRACK]]) {
      const [x, z] = this.wheelPos(fz, sx);
      h.push(groundAt(x, z, nearest(x, z, this.hint)));
    }
    // h: FL(left = -right), FR, RL, RR
    this.gPitch = Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, WB_F - WB_R);
    this.gRoll = Math.atan2((h[0] + h[2]) / 2 - (h[1] + h[3]) / 2, TRACK * 2);
    return (h[0] + h[1] + h[2] + h[3]) / 4;
  }

  step(dt, inp) {
    this.input = inp;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const n0 = this.n;
    this.onRoad = Math.abs(n0.lat) < ROAD_HALF * wAt(n0.i) + 0.3;
    const surf = this.onRoad ? SURF.road : SURF.sand;

    // speed-sensitive steering response: quick at low speed, calmer at cruise
    this.steerS += (inp.steer - this.steerS) * Math.min(1, dt * (8 - Math.min(3, Math.abs(vf) / 15)));
    this.boosting = false;
    this.wheelspin = 0;
    this.skid = 0;
    if (!this.airborne) {
      this.boosting = inp.boost && this.boost > 0.02 && inp.throttle > 0;
      // top 165 km/h on the throttle, boost 210
      const want = Math.min(inp.cap || Infinity, (this.boosting ? BOOST_V : TOP_V) * surf.max);
      const sm = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
      const spd0 = Math.hypot(vf, vl);
      const slip = Math.abs(Math.atan2(vl, Math.abs(vf))); // 0 = rolling straight (either way), PI/2 = fully sideways
      // Spun: a slide carried the car past 90 deg so it's now travelling backwards. That's
      // still the slide (steering keeps turning the nose the way you press), not reverse gear.
      if (vf < -1 && spd0 > 6 && this.drift > 0.3) this.spun = true;
      if (vf > 1 || spd0 < 3) this.spun = false;
      // Drift amount: S + a turn key at speed kicks the tail loose; after that the slide
      // keeps itself going for as long as the car is sideways, and the tyres find their grip
      // again gradually as it lines back up (no switch).
      const kick = inp.brake > 0 && vf > 6 && Math.abs(this.steerS) > 0.3 ? Math.min(1, Math.abs(this.steerS)) * Math.min(1, (vf - 6) / 14) : 0;
      const hold = sm(0.12, 0.7, slip) * Math.min(1, (spd0 - 4) / 8);
      const driftWant = Math.max(kick, hold * 0.8, this.spun && !(inp.brake > 0) ? 0.6 : 0);
      this.drift += (driftWant - this.drift) * Math.min(1, dt * (driftWant > this.drift ? 2.2 : 1.1));
      this.driftMode = this.drift > 0.35;
      const D = this.drift;
      // the drive is out while the car is well into a slide: it carries on by momentum
      this.clutch = 1 - 0.8 * sm(0.3, 0.8, D);
      const cl = this.clutch;
      if (inp.throttle > 0 && vf < want) {
        const a = (this.boosting ? 20 : 11) * inp.throttle * cl * Math.max(0.18, 1 - (Math.max(0, vf) / want) ** 2);
        vf += a * dt;
      }
      if (vf > want) vf -= (vf - want) * (inp.throttle ? 0.6 : 0.25) * (0.2 + 0.8 * cl) * dt;
      // S: a firm stop when going straight; in a slide it mostly unloads the rear instead of
      // stopping the car. Travelling backwards it's reverse throttle (up to half top speed);
      // stopped, a beat and it backs up on its own.
      if (!inp.brake) { this.stopT = 0; this.revOK = false; }
      if (inp.brake > 0 && !this.prevBrake && Math.abs(vf) < 1.5) this.revOK = true;
      this.prevBrake = inp.brake > 0;
      const braking = inp.brake > 0 && vf > 6;
      if (inp.brake > 0) {
        if (vf < -3) { if (vf > -REV_V) vf = Math.max(-REV_V, vf - 9 * dt); }
        else if (vf > 0.5) vf -= (7 + 13 * Math.min(1, vf / 22)) * (1 - 0.85 * Math.max(D, kick * (0.4 + 0.6 * sm(0, 0.08, slip)))) * dt; // eases off as the slide angle opens
        else if (this.revOK || (this.stopT += dt) > 0.3) vf = Math.max(-REV_V, vf - 9 * dt);
        else vf = Math.max(0, vf - 7 * dt);
      }
      if (!inp.throttle && !inp.brake) vf -= vf * (this.dead ? 1.1 : 0.06 + 0.24 * cl) * dt;
      vf -= vf * surf.drag * dt * 0.35;
      this.braking = braking;
      this.drifting = D > 0.5;
      // Momentum: the velocity keeps its size and the tyres swing it round toward where the
      // car points, but only as hard as they can pull sideways (aLat, m/s^2). Sliding tyres
      // pull far less, so in a drift the nose comes round faster than the path does and
      // the car carries wide on its old line. Scrub bleeds a little speed with the slip.
      const grip = surf.grip * (1 - 0.7 * D), aLat = surf.lat * (1 - 0.7 * D);
      const spd = Math.hypot(vf, vl); // after throttle and brakes
      if (spd > 0.3) {
        const fwd = vf >= 0 ? 1 : -1;
        let beta = Math.atan2(vl, Math.abs(vf));
        const turn = Math.min(Math.abs(beta) * (1 - Math.exp(-grip * dt)), (aLat / Math.max(spd, 1)) * dt);
        beta -= Math.sign(beta) * turn;
        const sb = Math.abs(Math.sin(beta));
        const scrub = Math.exp(-dt * (0.04 + 0.12 * sb ** 1.5 * (0.5 + 0.5 * D) + 0.06 * sb * (1 - D)) * (spd > 12 ? 1 : 2));
        const s2 = spd * scrub;
        vf = fwd * s2 * Math.cos(beta);
        vl = s2 * Math.sin(beta);
      }
      this.wheelspin = inp.throttle > 0 ? Math.max(Math.abs(this.yawRate) > 0.9 ? 1 : 0, 1 - Math.abs(vf) / 7) : 0;
      this.skid = Math.max(Math.min(1, (Math.abs(vl) - 2) / 4), braking && D < 0.3 ? 0.75 : 0, this.wheelspin > 0.5 && Math.abs(vf) < 12 ? 0.8 : 0);
      // turn rate falls off with speed (a squared term so top speed and boost are clearly
      // heavier: ~1.8 rad/s at 36 km/h, ~0.6 at 165); a slide adds a little rotation. A
      // spun car keeps the steering the way it was (A always swings the nose left), so it
      // doesn't flip when the travel crosses into backwards.
      // While sliding the turn rate comes from the car's whole speed, not its forward part
      // (which passes through zero at 90 deg), so a slide rotates evenly all the way round.
      const slideW = Math.max(sm(0.15, 0.45, D), this.spun ? 1 : 0);
      const sp = Math.abs(vf) + (spd0 - Math.abs(vf)) * slideW;
      const dir = THREE.MathUtils.clamp(vf / 2.5, -1, 1) * (1 - slideW) + slideW;
      // the further sideways, the less extra rotation, so a held slide settles at an angle
      this.yawRate = -this.steerS * 2.4 * Math.min(1, sp / 4) / (1 + sp / 30 + (sp / 40) ** 2) * dir * (1 + 0.9 * D - 0.55 * sm(0.35, 1.2, slip));
    } else {
      this.yawRate *= Math.exp(-dt * 2);
    }
    this.yaw += (this.yawRate + this.spin) * dt;
    // spin from side impacts (PIT maneuvers): decays, and loosens the grip while it lasts
    this.spin *= Math.exp(-dt * 2.2);
    if (Math.abs(this.spin) > 0.8) this.drift = Math.max(this.drift, 0.75);
    if (this.boosting) this.boost = Math.max(0, this.boost - dt / 3.4);
    this.nitro = this.boost; // legacy name used by shared effects

    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    const px = this.x, pz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.accP += ((vf - this.prevVf) / dt * 0.004 - this.accP) * Math.min(1, dt * 6);
    this.prevVf = vf;

    this.collide();
    this.limit();

    // Vertical: ballistic with ground contact
    let gC = this.groundCenter();
    // ground rising steeper than ~45 deg (dune cut faces, embankments) is a wall, not a ramp:
    // step back out of it and lose the speed going into it
    const moved = Math.hypot(this.x - px, this.z - pz);
    if (!this.airborne && moved > 1e-4 && gC - this.y > Math.max(0.25, moved * 1.0)) {
      const dx = (this.x - px) / moved, dz = (this.z - pz) / moved, into = this.vx * dx + this.vz * dz;
      this.x = px; this.z = pz;
      if (into > 0) { this.vx -= dx * into * 0.85; this.vz -= dz * into * 0.85; if (into > 3) { this.events.impact = Math.max(this.events.impact, into); this.onImpact?.(into, -dx, -dz); } }
      gC = this.groundCenter();
    }
    this.vy -= G * dt;
    this.y += this.vy * dt;
    if (this.y <= gC) {
      if (this.airborne && this.vy < -3) { this.events.land = Math.max(this.events.land, -this.vy); this.bobV += this.vy * 0.08; }
      this.y = gC;
      this.vy = Math.max(this.vy, Math.min(8, (gC - this.prevG) / dt)); // crests can lift the car, never fling it
      this.airborne = false;
    } else if (this.y > gC + 0.25) {
      this.airborne = true;
    }
    this.prevG = gC;
    const k = Math.min(1, dt * (this.airborne ? 1.5 : 12));
    this.pitch += ((this.airborne ? this.pitch - 0.15 * dt : this.gPitch) - this.pitch) * k;
    this.roll += ((this.airborne ? this.roll : this.gRoll) - this.roll) * k;
    this.lean += (THREE.MathUtils.clamp(this.yawRate * vf * 0.0035, -0.07, 0.07) - this.lean) * Math.min(1, dt * 6);
    this.bobV += (-this.bob * 160 - this.bobV * 12) * dt;
    this.bob += this.bobV * dt;
    this.vf = vf;
    this.vl = vl;
  }

  addBoost(x) {
    this.boost = Math.min(1, this.boost + x);
  }

  hit(v) {
    this.events.impact = Math.max(this.events.impact, v);
  }

  collide() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // only obstacles near the car (re-gathered every ~12 m): eight physics cars stay cheap
    if (!this.near || Math.abs(this.x - this.nearX) > 12 || Math.abs(this.z - this.nearZ) > 12) {
      this.near = this.colliders.filter((c) => Math.abs(c.x - this.x) < 40 && Math.abs(c.z - this.z) < 40);
      this.nearX = this.x; this.nearZ = this.z;
    }
    for (const c of this.near) {
      if (Math.abs(c.x - this.x) > 14 || Math.abs(c.z - this.z) > 14) continue;
      const HIT_R = this.hitbox.r;
      for (const o of this.hitbox.offs) {
        const cx = this.x + fx * o, cz = this.z + fz * o;
        let nx, nz, pen;
        if (c.type === 'circle') {
          const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
          if (d >= c.r + HIT_R || d < 1e-5) continue;
          nx = dx / d; nz = dz / d; pen = c.r + HIT_R - d;
        } else {
          const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
          const dx = cx - c.x, dz = cz - c.z;
          const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d >= HIT_R) continue;
          if (d < 1e-5) { // centre inside: push out along the shallow axis
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; d = -px; } else { ex = 0; ez = Math.sign(lz) || 1; d = -pz; }
          } else { ex /= d; ez /= d; }
          nx = ex * cs + ez * sn; nz = -ex * sn + ez * cs; pen = HIT_R - d;
        }
        this.x += nx * pen;
        this.z += nz * pen;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.onImpact?.(-vn, nx, nz);
          const e = 0.85; // walls take away most of the speed going into them, no bounce back
          this.vx -= nx * vn * e;
          this.vz -= nz * vn * e;
          this.hit(-vn);
        }
      }
    }
  }

  pushLat(i, dl) {
    const rx = -S.tz[i], rz = S.tx[i];
    this.x -= rx * dl;
    this.z -= rz * dl;
    const vn = this.vx * rx + this.vz * rz;
    // scraping along (or pinned against) the wall: the race turns this into contact damage
    this.scrape = { nx: rx * Math.sign(dl), nz: rz * Math.sign(dl), v: Math.abs(this.vx * S.tx[i] + this.vz * S.tz[i]) };
    if (vn * dl > 0) {
      this.onImpact?.(Math.abs(vn), rx * -Math.sign(dl), rz * -Math.sign(dl));
      const e = 0.85; // no bounce: just most of the speed into the wall is lost
      this.vx -= rx * vn * e;
      this.vz -= rz * vn * e;
      this.hit(Math.abs(vn));
    }
  }

  // Fenced highway corridor, guardrails, and the ends of the route.
  limit() {
    let n = nearest(this.x, this.z, this.hint);
    this.hint = n.i;
    const lim = corridor(n.i);
    if (n.lat > lim.right) this.pushLat(n.i, n.lat - lim.right);
    else if (n.lat < -lim.left) this.pushLat(n.i, n.lat + lim.left);
    const along = (lo, hi) => {
      const i = n.i < lo ? lo : hi;
      const back = (n.i < lo ? lo - n.i : hi - n.i) * STEP;
      this.x += S.tx[i] * back;
      this.z += S.tz[i] * back;
      const vn = this.vx * S.tx[i] + this.vz * S.tz[i];
      if ((n.i < lo && vn < 0) || (n.i > hi && vn > 0)) { this.vx -= S.tx[i] * vn * 0.85; this.vz -= S.tz[i] * vn * 0.85; this.hit(Math.abs(vn)); }
    };
    if (!LOOP.on) {
      const lo = I_START - 100, hi = S.count - 50;
      if (n.i < lo || n.i > hi) along(lo, hi);
    }
    n = nearest(this.x, this.z, this.hint);
    // Barriers: loop circuits have both sides walled; the highway only rails the outside of sharp curves.
    const sides = LOOP.on && LOOP.walls === 'both' ? [-1, 1] : railSide(n.i) ? [railSide(n.i)] : [];
    const RL = RAIL_LAT * wAt(n.i);
    for (const side of sides) {
      const ls = n.lat * side, prev = this.prevLat * side;
      let tgt = null;
      if (prev <= RL && ls > RL - 1.0) tgt = RL - 1.0;
      else if (prev > RL && ls < RL + 1.0) tgt = RL + 1.0;
      if (tgt !== null) { this.pushLat(n.i, (ls - tgt) * side); n = nearest(this.x, this.z, this.hint); }
    }
    // the centre is held off the wall above; the body's corners must not poke through either
    if (sides.length) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx, { hx, hz0, hz1 } = this.hitbox;
      for (const [sx, sz] of [[hx, hz1], [-hx, hz1], [hx, hz0], [-hx, hz0]]) {
        const cn = nearest(this.x + fx * sz + rx * sx, this.z + fz * sz + rz * sx, n.i);
        const lim = RAIL_LAT * wAt(cn.i) - 0.2;
        for (const side of sides) {
          if (n.lat * side >= RAIL_LAT * wAt(n.i)) continue; // car is outside this wall
          const over = cn.lat * side - lim;
          if (over > 0 && over < 3) this.pushLat(cn.i, over * side);
        }
      }
    }
    this.n = nearest(this.x, this.z, this.hint);
    this.prevLat = this.n.lat;
  }

  sync(dt) {
    this.rig.position.set(this.x, this.y, this.z);
    this.rig.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    this.body.position.y = this.bob;
    this.body.rotation.set(THREE.MathUtils.clamp(this.accP, -0.04, 0.04), 0, this.lean);
    if (!this.wheels) return;
    for (const w of Object.values(this.wheels)) {
      w.spin.rotation.x += (this.vf / WHEEL_R) * dt;
      if (w.front) w.steer.rotation.y = -this.steerS * 0.5;
    }
  }
}
