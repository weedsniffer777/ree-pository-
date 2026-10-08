import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

// Cartoon machine-gun fire: chunky additive tracers, star-shaped muzzle flashes with a
// light pop, and dust/spark puffs where rounds land.

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const spikes = 7;
  for (const [rad, inner, col] of [[62, 20, 'rgba(255,120,30,0.95)'], [44, 14, 'rgba(255,214,90,1)'], [24, 9, 'rgba(255,255,235,1)']]) {
    g.fillStyle = col;
    g.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2;
      const rr = k % 2 ? inner : rad * (0.75 + 0.25 * ((k * 37) % 5) / 4);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export class Tracers {
  constructor(scene, max = 60) {
    this.items = [];
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2); // along +Z, 0..1
    for (let k = 0; k < max; k++) {
      const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffe0c8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.scale.set(0.4, 0.4, 1);
      outer.add(core);
      outer.visible = false;
      outer.frustumCulled = false;
      core.frustumCulled = false;
      scene.add(outer);
      this.items.push({ mesh: outer, core, a: new THREE.Vector3(), b: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, alive: false, onHit: null });
    }
    this.next = 0;
  }

  fire(from, to, color = 0xff2a1a, onHit = null) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.a.copy(from);
    it.b.copy(to);
    it.len = from.distanceTo(to);
    it.dir.subVectors(to, from).normalize();
    it.t = 0;
    it.alive = true;
    it.onHit = onHit;
    it.mesh.material.color.setHex(color);
    it.mesh.visible = true;
  }

  update(dt) {
    const SPEED = 420, LEN = 7, R = 0.07;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt * SPEED;
      const head = Math.min(it.t, it.len);
      const tail = Math.max(0, it.t - LEN);
      if (tail >= it.len) {
        it.alive = false;
        it.mesh.visible = false;
        continue;
      }
      if (it.onHit && it.t >= it.len) { it.onHit(); it.onHit = null; }
      it.mesh.position.copy(it.a).addScaledVector(it.dir, tail);
      it.mesh.lookAt(it.mesh.position.clone().add(it.dir));
      it.mesh.scale.set(R, R, Math.max(0.01, head - tail));
    }
  }
}

// Twin forward guns on a car. Options: light (muzzle flash light, player only), color
// (tracer), rate (rounds/s), spread (m at 60 m), hitTest(origin, dir, range, shooter) ->
// { d, point, ... } | null for vehicles, onTargetHit(hit) when such a round arrives.
export class Guns {
  constructor(model, scene, { tracers, dust, sparks, height = terrainHeight, light = true, color = 0xff2a1a, rate = 14, spread = 1.6, hitTest = null, onTargetHit = null, blockTest = null, onShot = null }) {
    this.height = height;
    Object.assign(this, { color, rate, spread, hitTest, onTargetHit, blockTest, onShot });
    this.tracers = tracers;
    this.dust = dust;
    this.sparks = sparks;
    this.guns = ['GUN_L', 'GUN_R']
      .map((n) => model.getObjectByName(n)?.getObjectByName('part_browning_m2'))
      .filter(Boolean);
    const tex = starTexture();
    this.flashes = this.guns.map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      return { sprite: s, life: 0 };
    });
    this.light = light ? new THREE.PointLight(0xffb35a, 0, 9, 2) : { intensity: 0, position: new THREE.Vector3() };
    if (light) scene.add(this.light);
    this.cool = 0;
    this.side = 0;
    this.kick = 0;
    this.tmp = new THREE.Vector3();
    this.fwd = new THREE.Vector3();
  }

  update(dt, firing, car, aim = null) {
    this.cool -= dt;
    for (const f of this.flashes) {
      f.life -= dt;
      f.sprite.visible = f.life > 0;
    }
    this.light.intensity = Math.max(0, this.light.intensity - dt * 120);
    this.kick = Math.max(0, this.kick - dt * 6);
    if (!firing || !this.guns.length) return;
    while (this.cool <= 0) {
      this.cool += 1 / this.rate; // rounds/s across both guns
      this.shoot(car, aim);
    }
  }

  shoot(car, aimAt = null) {
    const k = this.side;
    this.side = (this.side + 1) % this.guns.length;
    const gun = this.guns[k];
    const muzzle = gun.localToWorld(this.tmp.copy(gun.userData.muzzle));
    this.fwd.set(Math.sin(car.yaw), 0, Math.cos(car.yaw));
    // slight spread, rounds converge ~60 m ahead
    const aim = aimAt ? aimAt.clone() : new THREE.Vector3(car.x, car.y + 0.9, car.z).addScaledVector(this.fwd, 60);
    const sp = this.spread * (aimAt ? Math.max(0.5, aim.distanceTo(muzzle) / 60) : 1);
    aim.x += (Math.random() - 0.5) * sp;
    aim.y += (Math.random() - 0.4) * sp * 0.6;
    aim.z += (Math.random() - 0.5) * sp;
    const dir = aim.sub(muzzle).normalize();
    // march to the ground or max range
    let hit = null;
    const p = new THREE.Vector3();
    for (let d = 2; d <= 160; d += 1.5) {
      p.copy(muzzle).addScaledVector(dir, d);
      if (p.y <= this.height(p.x, p.z) || this.blockTest?.(p)) { hit = p.clone(); break; }
    }
    const start = muzzle.clone();
    const veh = this.hitTest?.(start, dir, hit ? hit.distanceTo(start) : 160, car);
    if (veh) this.tracers.fire(start, veh.point, this.color, () => { this.sparkAt(veh.point); this.onTargetHit?.(veh); });
    else {
      const end = hit ?? muzzle.clone().addScaledVector(dir, 160);
      this.tracers.fire(start, end, this.color, hit ? () => this.impact(hit) : null);
    }

    const f = this.flashes[k];
    f.sprite.position.copy(start).addScaledVector(dir, 0.35);
    f.sprite.scale.setScalar(0.9 + Math.random() * 0.6);
    f.sprite.material.rotation = Math.random() * Math.PI * 2;
    f.life = 0.045;
    f.sprite.visible = true;
    this.light.position.copy(start);
    this.light.intensity = 9;
    this.kick = 1;
    this.onShot?.(start, dir, car, k);
    // smoke wisp at the muzzle
    this.dust.emit(start.x, start.y, start.z, car.vx * 0.9, 0.5, car.vz * 0.9, 0.25, 0.4, 0.75, 0.72, 0.68);
  }

  sparkAt(p) {
    for (let k = 0; k < 14; k++) this.sparks.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 14, 1 + Math.random() * 7, (Math.random() - 0.5) * 14, 0.11 + Math.random() * 0.06, 0.2 + Math.random() * 0.3, 1.0, 0.8 + Math.random() * 0.2, 0.35);
    this.sparks.emit(p.x, p.y, p.z, 0, 0, 0, 0.9, 0.07, 1.0, 0.9, 0.6); // white-hot flash at the strike
    this.dust.emit(p.x, p.y, p.z, 0, 1, 0, 0.6, 0.7, 0.3, 0.29, 0.28);
  }

  impact(p) {
    for (let k = 0; k < 3; k++) this.dust.emit(p.x, p.y + 0.1, p.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.5 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 0.86, 0.7, 0.5);
    for (let k = 0; k < 4; k++) this.sparks.emit(p.x, p.y + 0.1, p.z, (Math.random() - 0.5) * 8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8, 0.06, 0.18 + Math.random() * 0.15, 1.0, 0.8, 0.4);
  }
}
