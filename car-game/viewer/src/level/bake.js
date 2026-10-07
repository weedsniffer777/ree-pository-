import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge every static mesh under `root` into one mesh per material (draw-call cut).
// Subtrees where skip(obj) is true are left untouched (wheels, rotors, ...).
// InstancedMesh, lines and points are left as they are.
export function bakeGroup(root, { skip = () => false } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const victims = [];
  const rel = new THREE.Matrix4();

  const collect = (m) => {
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    const multi = Array.isArray(m.material);
    const mats = multi ? m.material : [m.material];
    const groups = multi && g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[gr.materialIndex];
      if (!mat) continue;
      const part = multi ? slice(g, gr.start, Math.min(gr.count, count - gr.start)) : g;
      part.clearGroups();
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(part);
    }
  };

  const visit = (node) => {
    for (const child of node.children) {
      if (skip(child)) continue;
      if (child.isMesh && !child.isInstancedMesh) {
        collect(child);
        victims.push(child);
      }
      visit(child);
    }
  };
  visit(root);

  for (const v of victims) {
    // keep any non-mesh descendants (sockets etc.) by re-parenting them
    for (const c of [...v.children]) if (!c.isMesh) root.attach(c);
    v.parent?.remove(v);
  }
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

function slice(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const s = a.itemSize;
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * s, (start + count) * s), s));
  }
  return out;
}
