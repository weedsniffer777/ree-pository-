import * as THREE from 'three';
import { bakeGroup } from '../level/bake.js';

// Cars as a chassis plus bolt-on parts that can come off: four armor zones (plates, and
// the dozer blade with the front), the guns, the roof rack and the wheels. Baking keeps
// each part its own small group so it can be torn off; Wreckage flies the pieces.

const isPart = (o) => !!o.userData.part;

// Merge a car's meshes by material, part by part (wheels keep their spinning hub).
export function bakeCar(model) {
  bakeGroup(model, { skip: (o) => isPart(o) || o.name === 'flames' });
  for (const o of partsOf(model)) {
    if (o.userData.part === 'wheel') { for (const c of o.children) if (/^wheel_(fl|fr|rl|rr)$/.test(c.name)) bakeGroup(c); }
    else bakeGroup(o);
  }
}

export function partsOf(model) {
  const out = [];
  model.traverse((o) => { if (isPart(o) && o !== model) out.push(o); });
  return out;
}

// burnt look: the same material, near black and dull (cached per material)
const charCache = new Map();
export function charred(m) {
  if (!m || m.isShaderMaterial) return m;
  let c = charCache.get(m);
  if (!c) {
    c = m.clone();
    c.color?.multiplyScalar(0.16);
    if ('roughness' in c) c.roughness = 1;
    if ('metalness' in c) c.metalness = 0.15;
    charCache.set(m, c);
  }
  return c;
}
export function charModel(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.mat0 ??= o.material;
    o.material = Array.isArray(o.material) ? o.material.map(charred) : charred(o.material);
  });
}
export function unchar(root) {
  root.traverse((o) => { if (o.isMesh && o.userData.mat0) { o.material = o.userData.mat0; delete o.userData.mat0; } });
}

export class Wreckage {
  constructor(scene, height) {
    Object.assign(this, { scene, height, items: [], tq: new THREE.Quaternion(), te: new THREE.Euler(), box: new THREE.Box3() });
  }
  // tear `part` off its car: keeps its world pose, takes the car's velocity plus a kick
  detach(part, vel, kick, burn = false) {
    if (part.userData.home) return;
    part.userData.home = { parent: part.parent, pos: part.position.clone(), quat: part.quaternion.clone(), scale: part.scale.clone() };
    this.scene.attach(part);
    this.box.setFromObject(part);
    const r = Math.max(0.15, (this.box.max.y - this.box.min.y) * 0.5);
    const v = vel.clone().add(kick);
    const w = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    this.items.push({ part, v, w, r, t: 0, burn, rest: false });
  }
  // put everything back on its car (new race)
  restoreAll() {
    for (const it of this.items) {
      const h = it.part.userData.home;
      h.parent.add(it.part);
      it.part.position.copy(h.pos);
      it.part.quaternion.copy(h.quat);
      it.part.scale.copy(h.scale);
      it.part.visible = true;
      delete it.part.userData.home;
      unchar(it.part);
    }
    this.items.length = 0;
  }
  update(dt, onBurn) {
    for (const it of this.items) {
      it.t += dt;
      const p = it.part.position;
      if (!it.rest) {
        it.v.y -= 24 * dt;
        p.addScaledVector(it.v, dt);
        const gy = this.height(p.x, p.z) + it.r * 0.6;
        if (p.y < gy) {
          p.y = gy;
          if (it.v.y < -2.5) { it.v.y *= -0.3; it.v.x *= 0.65; it.v.z *= 0.65; it.w.multiplyScalar(0.5); } else {
            it.v.y = 0;
            it.v.x *= Math.exp(-dt * 3.5); it.v.z *= Math.exp(-dt * 3.5);
            it.w.multiplyScalar(Math.exp(-dt * 5));
            if (it.v.lengthSq() < 0.05) it.rest = true;
          }
        }
        this.tq.setFromEuler(this.te.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
        it.part.quaternion.multiply(this.tq);
      }
      if (it.burn && onBurn && it.t < 14 && Math.random() < dt * 6) onBurn(p, it.t);
    }
  }
}
