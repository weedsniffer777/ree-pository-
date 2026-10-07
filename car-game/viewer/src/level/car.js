import * as THREE from 'three';
import { I_START, I_END, GAS, ROAD_HALF, ROAD_BEVEL, nearest, openDist, pointAt, gasLocal } from './track.js';
import { terrainHeight } from './terrain.js';
import { roadSurfaceY } from './road.js';

// Arcade car: forward/lateral velocity split with grip (drift comes from low lateral
// grip), speed-scaled steering, nitro, ground following from four wheel samples,
// ballistic airtime off crests, circle/box collisions, corridor and guardrail limits.

const G = 24;
const WB_F = 1.3, WB_R = -1.25, TRACK = 0.77, WHEEL_R = 0.332;
const HIT = [-1.75, -0.25, 1.25, 2.6];
const HIT_R = 1.0;
const SURF = {
  road: { grip: 9, drag: 0.12, max: 1 },
  sand: { grip: 5.5, drag: 0.45, max: 0.82 },
};

export function groundAt(x, z, n) {
  let h = terrainHeight(x, z);
  if (n && n.i <= I_END && Math.abs(n.lat) < ROAD_BEVEL) h = Math.max(h, n.y + roadSurfaceY(n.lat));
  const g = gasLocal(x, z);
  if (g.lat > GAS.latIn && g.lat < GAS.latOut && Math.abs(g.along) < GAS.halfLen) h = Math.max(h, GAS.y + 0.045);
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
    this.reset(I_START, 1.85);
  }

  reset(i, lat = 1.85) {
    const p = pointAt(i, lat);
    Object.assign(this, {
      x: p.x, z: p.z, yaw: p.yaw, vx: 0, vz: 0, vy: 0, vf: 0, vl: 0, steerS: 0, yawRate: 0,
      nitro: 1, boosting: false, airborne: false, pitch: 0, roll: 0, accP: 0, lean: 0,
      bob: 0, bobV: 0, hint: i, prevLat: lat, onRoad: true, prevVf: 0,
    });
    this.n = nearest(this.x, this.z, i);
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
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;
    const n0 = this.n;
    const gl = gasLocal(this.x, this.z);
    this.onRoad = (n0.i <= I_END && Math.abs(n0.lat) < ROAD_HALF + 0.3)
      || (gl.lat > GAS.latIn && gl.lat < GAS.latOut && Math.abs(gl.along) < GAS.halfLen);
    const surf = this.onRoad ? SURF.road : SURF.sand;

    this.steerS += (inp.steer - this.steerS) * Math.min(1, dt * 7);
    this.boosting = false;
    this.wheelspin = 0;
    if (!this.airborne) {
      this.boosting = inp.nitro && this.nitro > 0.02 && inp.throttle > 0;
      const vmax = (this.boosting ? 46 : 33) * surf.max;
      if (inp.throttle > 0 && vf < vmax) {
        const a = (this.boosting ? 19 : 8.5) * inp.throttle * Math.max(0.15, 1 - (Math.max(0, vf) / vmax) ** 2);
        vf += a * dt;
      }
      if (vf > vmax) vf -= (vf - vmax) * 0.9 * dt;
      if (inp.brake > 0) {
        if (vf > 0.5) vf -= 30 * dt * inp.brake;
        else vf = Math.max(-11, vf - 10 * dt * inp.brake);
      }
      if (!inp.throttle && !inp.brake) vf -= vf * 0.45 * dt;
      vf -= vf * surf.drag * dt * 0.4;
      if (inp.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
      vl *= Math.exp(-(inp.handbrake ? 1.3 : surf.grip) * dt);
      // rear wheels spinning: throttle at low speed or while rotating hard (donuts, launches)
      this.wheelspin = inp.throttle > 0 ? Math.max(Math.abs(this.yawRate) > 0.9 ? 1 : 0, 1 - Math.abs(vf) / 7) : 0;
      const sp = Math.abs(vf);
      this.yawRate = -this.steerS * 2.3 * Math.min(1, sp / 4) / (1 + sp / 26) * (vf < -0.1 ? -1 : 1) * (inp.handbrake ? 1.5 : 1);
    } else {
      this.yawRate *= Math.exp(-dt * 2);
    }
    this.yaw += this.yawRate * dt;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / 3.2);
    else this.nitro = Math.min(1, this.nitro + dt * 0.1);

    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.accP += ((vf - this.prevVf) / dt * 0.004 - this.accP) * Math.min(1, dt * 6);
    this.prevVf = vf;

    this.collide();
    this.limit();

    // Vertical: ballistic with ground contact
    const gC = this.groundCenter();
    this.vy -= G * dt;
    this.y += this.vy * dt;
    if (this.y <= gC) {
      if (this.airborne && this.vy < -3) { this.events.land = Math.max(this.events.land, -this.vy); this.bobV += this.vy * 0.08; }
      this.y = gC;
      this.vy = Math.max(this.vy, (gC - this.prevG) / dt);
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

  hit(v) {
    this.events.impact = Math.max(this.events.impact, v);
  }

  collide() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const c of this.colliders) {
      if (Math.abs(c.x - this.x) > 14 || Math.abs(c.z - this.z) > 14) continue;
      for (const o of HIT) {
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
          this.vx -= nx * vn * 1.3;
          this.vz -= nz * vn * 1.3;
          this.hit(-vn);
        }
      }
    }
  }

  // Keep the car inside the drivable area (intro highway + lakebed): push back along
  // the gradient of the open-area distance field.
  limit() {
    const n = nearest(this.x, this.z, this.hint);
    this.hint = n.i;
    const M = 1.4;
    const d = openDist(this.x, this.z, n);
    if (d > -M) {
      const e = 0.6;
      const gx = openDist(this.x + e, this.z) - openDist(this.x - e, this.z);
      const gz = openDist(this.x, this.z + e) - openDist(this.x, this.z - e);
      const l = Math.hypot(gx, gz) || 1;
      const nx = gx / l, nz = gz / l;
      this.x -= nx * (d + M);
      this.z -= nz * (d + M);
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= nx * vn * 1.25;
        this.vz -= nz * vn * 1.25;
        this.hit(vn);
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
