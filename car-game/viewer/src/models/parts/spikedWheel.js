import * as THREE from 'three';
import { mesh, box, cyl } from '../../lib/geo.js';
import { steelMaterial, darkMaterial } from '../../lib/skin.js';

// Deep-dish 6-spoke wheel, chunky tread, brake disc + caliper, hub spike.
// Axis = X. side: +1 outer face points +X, -1 points -X.
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95, metalness: 0 });
const RIM = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.6, metalness: 0.6 });
const LIP = new THREE.MeshStandardMaterial({ color: 0x6f757b, roughness: 0.45, metalness: 0.7 });

export function buildSpikedWheel(side = 1, { radius = 0.332 } = {}) {
  const g = new THREE.Group();
  const k = radius / 0.332;
  const S = (v) => v * k;

  // tire: lathe profile (r, axial) with rounded shoulders
  const prof = [[0.215, -0.12], [0.265, -0.134], [0.305, -0.132], [0.326, -0.115], [0.332, -0.07], [0.332, 0.07], [0.326, 0.115], [0.305, 0.132], [0.265, 0.134], [0.215, 0.12]]
    .map(([r, y]) => new THREE.Vector2(S(r), y));
  g.add(mesh(new THREE.LatheGeometry(prof, 36).rotateZ(Math.PI / 2), RUBBER));
  // tread: two staggered rows of blocks + shoulder lugs
  for (let i = 0; i < 26; i++) {
    for (const row of [-1, 1]) {
      const a = (i / 26) * Math.PI * 2 + (row > 0 ? Math.PI / 26 : 0);
      const b = box(0.1, 0.018, 0.06, RUBBER, { pos: [row * 0.06, Math.cos(a) * S(0.338), Math.sin(a) * S(0.338)] });
      b.rotation.x = a;
      g.add(b);
      if (i % 2 === 0) {
        const l = box(0.03, 0.03, 0.05, RUBBER, { pos: [row * 0.122, Math.cos(a) * S(0.322), Math.sin(a) * S(0.322)] });
        l.rotation.x = a;
        g.add(l);
      }
    }
  }

  // brake disc + caliper (visible through the spokes)
  g.add(cyl(S(0.16), S(0.16), 0.02, 24, steelMaterial(0x5a5f64), { pos: [-side * 0.02, 0, 0], rot: [0, 0, Math.PI / 2] }));
  g.add(box(0.05, S(0.09), S(0.11), darkMaterial(0x7a2a1e), { pos: [-side * 0.0, S(0.13), -S(0.05)] }));

  // rim barrel, deep dish, outer lip
  const open = (rt, rb, h, x) => mesh(
    new THREE.CylinderGeometry(rt, rb, h, 28, 1, true).rotateZ(-side * Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }),
    { pos: [x, 0, 0] },
  );
  g.add(open(S(0.21), S(0.21), 0.22, 0)); // barrel
  g.add(open(S(0.205), S(0.13), 0.07, side * 0.075)); // deep dish wall
  const lip = mesh(new THREE.TorusGeometry(S(0.212), 0.011, 6, 32).rotateY(Math.PI / 2), LIP);
  lip.position.x = side * 0.11;
  g.add(lip);

  // six angular spokes, hub, lug nuts
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = box(0.035, S(0.1), 0.045, RIM, { pos: [side * 0.035, Math.cos(a) * S(0.085), Math.sin(a) * S(0.085)] });
    sp.rotation.x = a;
    g.add(sp);
  }
  g.add(cyl(S(0.065), S(0.075), 0.05, 12, RIM, { pos: [side * 0.05, 0, 0], rot: [0, 0, -side * Math.PI / 2] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    g.add(cyl(0.011, 0.011, 0.03, 6, LIP, { pos: [side * 0.08, Math.cos(a) * S(0.045), Math.sin(a) * S(0.045)], rot: [0, 0, Math.PI / 2] }));
  }

  // hub spike + spinner blades
  const steel = steelMaterial(0x8d939a);
  g.add(cyl(S(0.05), S(0.06), 0.05, 8, darkMaterial(0x2a2d31), { pos: [side * 0.1, 0, 0], rot: [0, 0, -side * Math.PI / 2] }));
  g.add(cyl(0, S(0.048), 0.3, 8, steel, { pos: [side * 0.27, 0, 0], rot: [0, 0, -side * Math.PI / 2] }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const blade = cyl(0, 0.03, 0.16, 4, steel, { pos: [side * 0.14, Math.cos(a) * S(0.07), Math.sin(a) * S(0.07)] });
    blade.rotation.set(a, 0, -side * 0.9);
    g.add(blade);
  }
  return g;
}
