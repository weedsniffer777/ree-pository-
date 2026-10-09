import * as THREE from 'three';

// Split a world's big meshes into tiles so the camera only draws what it can see. Built
// meshes like the terrain and road run the length of the circuit as one mesh, and decor
// is instanced map-wide; either way the whole lot was drawn every frame. Each big mesh is
// cut into `size` m tiles by triangle (normals were computed on the whole mesh first, so
// there are no seams), and each big instanced set is split into one set per tile.

const tileOf = (x, z, size) => `${Math.floor(x / size)},${Math.floor(z / size)}`;

function splitMesh(mesh, size) {
  const g = mesh.geometry, pos = g.attributes.position, index = g.index;
  const tris = index ? index.count / 3 : pos.count / 3;
  const vi = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const buckets = new Map(), v = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.x += pos.getX(vi(t, k)) / 3, v.z += pos.getZ(vi(t, k)) / 3;
    v.applyMatrix4(mesh.matrix);
    const key = tileOf(v.x, v.z, size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  if (buckets.size < 2) return null;
  const out = [];
  for (const list of buckets.values()) {
    const remap = new Map(), idx = [], attrs = {};
    for (const name of Object.keys(g.attributes)) attrs[name] = [];
    for (const t of list) for (let k = 0; k < 3; k++) {
      const o = vi(t, k);
      let n = remap.get(o);
      if (n === undefined) {
        n = remap.size;
        remap.set(o, n);
        for (const [name, a] of Object.entries(g.attributes)) for (let c = 0; c < a.itemSize; c++) attrs[name].push(a.array[o * a.itemSize + c]);
      }
      idx.push(n);
    }
    const ng = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) ng.setAttribute(name, new THREE.BufferAttribute(new a.array.constructor(attrs[name]), a.itemSize, a.normalized));
    ng.setIndex(idx);
    ng.computeBoundingSphere();
    const m = new THREE.Mesh(ng, mesh.material);
    for (const k of ['receiveShadow', 'castShadow', 'renderOrder', 'name']) m[k] = mesh[k];
    m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
    out.push(m);
  }
  return out;
}

function splitInstances(im, size) {
  const M = new THREE.Matrix4(), p = new THREE.Vector3(), buckets = new Map();
  for (let k = 0; k < im.count; k++) {
    im.getMatrixAt(k, M);
    p.setFromMatrixPosition(M).applyMatrix4(im.matrix);
    const key = tileOf(p.x, p.z, size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(k);
  }
  if (buckets.size < 2) return null;
  const out = [], C = new THREE.Color();
  for (const list of buckets.values()) {
    const n = new THREE.InstancedMesh(im.geometry, im.material, list.length);
    list.forEach((k, j) => {
      im.getMatrixAt(k, M); n.setMatrixAt(j, M);
      if (im.instanceColor) { im.getColorAt(k, C); n.setColorAt(j, C); }
    });
    for (const key of ['receiveShadow', 'castShadow', 'renderOrder', 'name']) n[key] = im[key];
    n.position.copy(im.position); n.quaternion.copy(im.quaternion); n.scale.copy(im.scale);
    n.frustumCulled = true;
    n.computeBoundingSphere();
    out.push(n);
  }
  return out;
}

// Tile every big mesh / instanced set directly under `group`.
export function chunkWorld(group, size = 120) {
  for (const o of [...group.children]) {
    if (Array.isArray(o.material) || o.geometry?.groups?.length > 1 || o.morphTargetInfluences) continue;
    let parts = null;
    const triCount = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    // only heavy instanced sets: splitting light ones adds draw calls for little saving
    if (o.isInstancedMesh && o.count > 24 && o.count * triCount(o.geometry) > 20000) parts = splitInstances(o, size);
    else if (o.isMesh && !o.isInstancedMesh && o.geometry.attributes.position.count > 3000) {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      if (b.max.x - b.min.x > size * 1.5 || b.max.z - b.min.z > size * 1.5) parts = splitMesh(o, size);
    }
    if (!parts) continue;
    group.remove(o);
    for (const p of parts) group.add(p);
  }
}

// Small props don't cast shadows (bushes, rocks, cones, posts): their shadows are barely
// visible but every caster is drawn again into the shadow map. Big things keep theirs.
export function trimShadowCasters(group, minRadius = 1.6) {
  const M = new THREE.Matrix4(), sc = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    let scale = Math.max(o.scale.x, o.scale.y, o.scale.z);
    if (o.isInstancedMesh && o.count) { o.getMatrixAt(0, M); M.decompose(p, q, sc); scale *= Math.max(sc.x, sc.y, sc.z); }
    if (o.geometry.boundingSphere.radius * scale < minRadius) o.castShadow = false;
  });
}
