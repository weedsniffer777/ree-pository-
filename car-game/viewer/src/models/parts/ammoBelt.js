import * as THREE from 'three';

// Linked .50 cal belt along a curve. Instanced: one draw per component.
const BRASS = new THREE.MeshStandardMaterial({ color: 0xa8843a, roughness: 0.45, metalness: 0.8 });
const TIP = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.5, metalness: 0.7 });
const LINK = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.7, metalness: 0.6 });

const CASE_LEN = 0.099;

export function buildAmmoBelt(points, { spacing = 0.022, forward = new THREE.Vector3(0, 0, 1) } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const count = Math.max(2, Math.floor(curve.getLength() / spacing));
  const caseGeo = new THREE.CylinderGeometry(0.0105, 0.0105, CASE_LEN, 8);
  const tipGeo = new THREE.ConeGeometry(0.0095, 0.045, 8);
  const linkGeo = new THREE.BoxGeometry(0.026, 0.07, 0.016);
  const cases = new THREE.InstancedMesh(caseGeo, BRASS, count);
  const tips = new THREE.InstancedMesh(tipGeo, TIP, count);
  const links = new THREE.InstancedMesh(linkGeo, LINK, count);

  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let prev = null;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    // cartridge axis: start as close to "forward" as possible, then carry it along the
    // belt (parallel transport) so it never flips or twists between neighbouring rounds
    const a = (prev ?? forward).clone();
    a.sub(t.clone().multiplyScalar(t.dot(a)));
    if (a.lengthSq() < 1e-4) a.crossVectors(t, up);
    a.normalize();
    prev = a;
    // orient Y along the cartridge, Z along the belt so links face the right way
    const zAxis = t.clone().sub(a.clone().multiplyScalar(t.dot(a))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(a, zAxis);
    m.makeBasis(xAxis, a, zAxis);
    q.setFromRotationMatrix(m);
    m.compose(p, q, one);
    cases.setMatrixAt(i, m);
    links.setMatrixAt(i, m);
    m.compose(p.clone().add(a.clone().multiplyScalar(CASE_LEN / 2 + 0.02)), q, one);
    tips.setMatrixAt(i, m);
  }
  const g = new THREE.Group();
  g.name = 'ammo_belt';
  for (const im of [cases, tips, links]) {
    im.castShadow = true;
    im.instanceMatrix.needsUpdate = true;
    g.add(im);
  }
  return g;
}
