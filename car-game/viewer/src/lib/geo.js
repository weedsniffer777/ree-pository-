import * as THREE from 'three';

// Small helpers for building procedural low-poly models.
// Convention: metres, +Y up, +Z forward, origin at ground centre of the footprint.

export function mesh(geo, material, { pos = [0, 0, 0], rot = [0, 0, 0], name } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export const box = (w, h, d, material, opts) => mesh(new THREE.BoxGeometry(w, h, d), material, opts);

export const cyl = (rTop, rBot, h, seg, material, opts) =>
  mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material, opts);

// Cylinder between two points.
export function tube(a, b, r, material, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const m = mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

// Extrude a side profile drawn in (z, y) across the X axis, centred on x = 0.
export function extrudeSide(shape, width, material, bevel = 0, curveSegments = 8) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
  g.rotateY(-Math.PI / 2); // shape x -> +Z, extrusion -> -X
  g.translate(width / 2, 0, 0);
  return mesh(g, material);
}

export function profile(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) s.lineTo(z, y);
  s.closePath();
  return s;
}

// Thin box lying along the line (z1,y1)->(z2,y2), pushed out along the surface normal.
export function slabAlong(z1, y1, z2, y2, width, thick, material, offset = 0, x = 0) {
  const dz = z2 - z1;
  const dy = y2 - y1;
  const len = Math.hypot(dz, dy);
  const dzn = dz / len;
  const dyn = dy / len;
  const m = box(width, len, thick, material);
  m.position.set(x, (y1 + y2) / 2 - dzn * offset, (z1 + z2) / 2 + dyn * offset);
  m.rotation.x = Math.atan2(dzn, dyn);
  return m;
}

export function socket(name, pos, rot = [0, 0, 0]) {
  const o = new THREE.Object3D();
  o.name = name;
  o.userData.isSocket = true;
  o.position.set(...pos);
  o.rotation.set(...rot);
  return o;
}

export function countTriangles(root) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.debug) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { tris: Math.round(tris), meshes };
}
