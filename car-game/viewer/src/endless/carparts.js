import * as THREE from 'three';
import { bakeGroup } from '../level/bake.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  // tear `part` off its car: keeps its world pose, takes the car's velocity plus a kick.
  // Parts are grouped around the car's origin, so each is re-hung on a pivot at its own
  // centre first; otherwise it would swing about a point a metre or two away and float.
  detach(part, vel, kick, burn = false) {
    if (part.userData.home) return;
    part.userData.home = { parent: part.parent, pos: part.position.clone(), quat: part.quaternion.clone(), scale: part.scale.clone() };
    this.box.setFromObject(part);
    const pivot = new THREE.Group();
    this.box.getCenter(pivot.position);
    this.scene.add(pivot);
    pivot.attach(part);
    // up to ~240 of the part's own vertices in pivot space: ground contact uses the real
    // lowest point (a bounding box of a curved, rotated plate sits well below the metal)
    pivot.updateMatrixWorld(true);
    const inv = pivot.matrixWorld.clone().invert(), m = new THREE.Matrix4(), q = new THREE.Vector3(), pts = [];
    let total = 0;
    part.traverse((o) => { if (o.isMesh) total += o.geometry.attributes.position.count; });
    const stride = Math.max(1, Math.floor(total / 240));
    part.traverse((o) => {
      if (!o.isMesh) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const pa = o.geometry.attributes.position;
      for (let k = 0; k < pa.count; k += stride) { q.fromBufferAttribute(pa, k).applyMatrix4(m); pts.push(q.x, q.y, q.z); }
    });
    const v = vel.clone().add(kick);
    const w = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    this.items.push({ part, pivot, v, w, t: 0, burn, rest: false, restT: 0, pts: new Float32Array(pts) });
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
      it.pivot.removeFromParent();
    }
    this.items.length = 0;
  }
  update(dt, onBurn) {
    for (const it of this.items) {
      it.t += dt;
      const P = it.pivot, p = P.position;
      if (!it.rest) {
        it.v.y -= 24 * dt;
        p.addScaledVector(it.v, dt);
        this.tq.setFromEuler(this.te.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
        P.quaternion.multiply(this.tq);
        // ground contact by the part's actual lowest point
        P.updateMatrixWorld(true);
        const e = P.matrixWorld.elements, pts = it.pts;
        let low = Infinity;
        for (let k = 0; k < pts.length; k += 3) low = Math.min(low, e[1] * pts[k] + e[5] * pts[k + 1] + e[9] * pts[k + 2] + e[13]);
        const under = this.height(p.x, p.z) + 0.02 - (pts.length ? low : p.y);
        if (under > 0) {
          p.y += under;
          if (it.v.y < -2.5) { it.v.y *= -0.3; it.v.x *= 0.65; it.v.z *= 0.65; it.w.multiplyScalar(0.5); } else {
            it.v.y = Math.max(0, it.v.y);
            it.v.x *= Math.exp(-dt * 4); it.v.z *= Math.exp(-dt * 4);
            it.w.multiplyScalar(Math.exp(-dt * 6));
            if (it.v.lengthSq() < 0.05 && it.w.lengthSq() < 0.05) it.rest = true;
          }
        }
      }
      // settled debris sinks out of sight after a while (keeps the track and draw calls clean)
      if (it.rest && !it.gone) {
        it.restT += dt;
        if (it.restT > 20) { p.y -= dt * 0.25; P.updateMatrixWorld(true); }
        if (it.restT > 24) { it.part.visible = false; it.gone = true; }
      }
      if (it.gone) continue;
      // burning parts: flames for the first seconds, smoke trailing for longer
      if (it.burn && onBurn && it.t < 16 && Math.random() < dt * (it.t < 5 ? 22 : 9)) onBurn(p, it.t, !it.rest);
    }
  }
}

// One model for a whole intact car: every mesh (minus `skip`) baked into the car's space
// and merged per material, instances expanded, so the car draws in a handful of calls
// instead of one per part. Returns [{ mat, geo }]; the caller builds meshes from it.
export function mergeByMaterial(model, skip = () => false) {
  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert(), byMat = new Map(), M = new THREE.Matrix4(), I = new THREE.Matrix4();
  const skipped = (o) => { for (let p = o; p && p !== model; p = p.parent) if (!p.visible || skip(p)) return true; return false; };
  const piece = (geo, start, count, mat, m) => {
    const src = geo.index ? geo.toNonIndexed() : geo, n = Math.min(count, src.attributes.position.count - start), g = new THREE.BufferGeometry();
    const take = (a, size) => new THREE.BufferAttribute(a ? a.array.slice(start * size, (start + n) * size) : new Float32Array(n * size).fill(1), size);
    g.setAttribute('position', take(src.attributes.position, 3));
    g.setAttribute('normal', take(src.attributes.normal, 3));
    g.setAttribute('uv', src.attributes.uv ? take(src.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (mat.vertexColors) g.setAttribute('color', src.attributes.color ? take(src.attributes.color, src.attributes.color.itemSize) : take(null, 3));
    g.applyMatrix4(m);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  };
  model.traverse((o) => {
    if (!o.isMesh || skipped(o)) return;
    const base = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), geo = o.geometry;
    const cnt = (geo.index ?? geo.attributes.position).count;
    const groups = Array.isArray(o.material) ? (geo.groups.length ? geo.groups : [{ start: 0, count: cnt, materialIndex: 0 }]) : [{ start: 0, count: cnt, materialIndex: -1 }];
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, I); M.multiplyMatrices(base, I); } else M.copy(base);
      for (const gr of groups) {
        const mat = gr.materialIndex < 0 ? o.material : o.material[gr.materialIndex];
        if (mat) piece(geo, gr.start, gr.count, mat, M);
      }
    }
  });
  const out = [];
  for (const [mat, list] of byMat) {
    const sets = new Set(list.map((g) => Object.keys(g.attributes).sort().join()));
    if (sets.size > 1) continue; // mismatched attributes: leave that material out rather than break
    out.push({ mat, geo: mergeGeometries(list, false) });
  }
  return out;
}
