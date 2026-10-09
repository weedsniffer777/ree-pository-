import * as THREE from 'three';

// Bullet holes punched into the actual body panel a round struck (raycast onto the car's
// meshes): a dark hole, a ring of bent-out bare metal petals, a soot halo. They ride
// the panel (so they leave with it if it is torn off). At most three per car; each fades
// after a few seconds, except on a badly hurt car where they stay.

const HOLE = new THREE.CircleGeometry(0.04, 10);
const SOOT = new THREE.RingGeometry(0.06, 0.13, 14);
const RIM = (() => {
  const g = new THREE.RingGeometry(0.036, 0.07, 12, 1);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const r = Math.hypot(p.getX(k), p.getY(k));
    if (r > 0.05) p.setZ(k, 0.006 + Math.random() * 0.014); // petals bent outward
  }
  g.computeVertexNormals();
  return g;
})();

export class Holes {
  constructor() {
    Object.assign(this, { per: new Map(), ray: new THREE.Raycaster(), tv: new THREE.Vector3(), nm: new THREE.Matrix3() });
  }
  // model: the struck car's model; point/dir: where the round arrived and its direction
  add(key, model, point, dir, t) {
    const list = this.per.get(key) ?? [];
    this.per.set(key, list);
    if (list.length && t - list[list.length - 1].t0 < 0.18) return; // a burst makes a few, not dozens
    this.ray.set(this.tv.copy(point).addScaledVector(dir, -1.6), dir);
    this.ray.far = 3.2;
    // meshes only: the model also carries sprites (boost glow), which can't be raycast
    // without a camera and would throw
    const meshes = [];
    model.traverse((o) => { if (o.isMesh && !o.isSprite && o.visible && !o.material.isShaderMaterial && o.material.blending !== THREE.AdditiveBlending) meshes.push(o); });
    const hit = this.ray.intersectObjects(meshes, false).find((h) => h.face);
    if (!hit) return;
    const n = hit.face.normal.clone().applyNormalMatrix(this.nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
    if (n.dot(dir) > 0) n.negate();
    const mk = (geo, color, opacity, depthOff) => new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.6, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: depthOff, polygonOffsetUnits: depthOff }));
    const g = new THREE.Group();
    g.add(mk(SOOT, 0x0c0b0a, 0.55, -2), mk(RIM, 0x9c968c, 1, -3), mk(HOLE, 0x020202, 1, -4));
    g.children[1].material.metalness = 0.9;
    g.position.copy(hit.point).addScaledVector(n, 0.004);
    g.lookAt(this.tv.copy(hit.point).add(n));
    g.rotateZ(Math.random() * Math.PI * 2);
    g.scale.setScalar(0.85 + Math.random() * 0.4);
    hit.object.attach(g);
    list.push({ g, t0: t });
    while (list.length > 3) this.kill(list.shift());
  }
  kill(h) { h.g.removeFromParent(); for (const m of h.g.children) m.material.dispose(); }
  // hp(key) -> hull HP 0..1; holes stop fading below 35%
  update(t, hp) {
    for (const [key, list] of this.per) {
      const keep = hp(key) < 0.35;
      for (let k = list.length - 1; k >= 0; k--) {
        const h = list[k], age = t - h.t0;
        if (keep || age < 3) { for (const m of h.g.children) m.material.opacity = m.userData.o ??= m.material.opacity; continue; }
        const f = 1 - (age - 3) / 2;
        if (f <= 0) { this.kill(h); list.splice(k, 1); continue; }
        for (const m of h.g.children) { m.userData.o ??= m.material.opacity; m.material.opacity = m.userData.o * f; }
      }
    }
  }
  clear() { for (const list of this.per.values()) for (const h of list) this.kill(h); this.per.clear(); }
}
