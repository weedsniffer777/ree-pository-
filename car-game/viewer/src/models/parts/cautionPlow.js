import * as THREE from 'three';
import { box, cyl, tube } from '../../lib/geo.js';
import { cautionMaterial, gunmetalMaterial, steelMaterial, darkMaterial } from '../../lib/skin.js';

// Front dozer: shallow V blade in worn hazard stripes, ribbed back, spike row on the
// bottom edge, mounting arms. Origin = FRONT socket; +Z points away from the car.
export function buildCautionPlow() {
  const g = new THREE.Group();
  g.name = 'part_caution_plow';
  const stripes = cautionMaterial(6);
  const metal = gunmetalMaterial();
  const steel = steelMaterial(0x8a9097);
  const dark = darkMaterial();

  const TILT = -0.28; // top leans back
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.y = s * 0.16; // outer ends swept back: chevron points forward at the centre
    half.position.set(0, 0, 0.14);
    g.add(half);
    const blade = box(1.06, 0.52, 0.05, stripes, { pos: [s * 0.51, 0.05, 0.1], rot: [TILT, 0, 0] }); // overlaps past centre: no gap
    half.add(blade);
    // top lip, bottom cutting edge, side cheek
    half.add(box(1.04, 0.05, 0.09, metal, { pos: [s * 0.51, 0.3, 0.03], rot: [TILT, 0, 0] }));
    half.add(box(1.04, 0.06, 0.07, dark, { pos: [s * 0.51, -0.2, 0.19], rot: [TILT, 0, 0] }));
    half.add(box(0.05, 0.5, 0.18, metal, { pos: [s * 1.01, 0.05, 0.06], rot: [TILT, 0, 0] }));
    // back ribs
    for (const x of [0.2, 0.5, 0.8]) half.add(box(0.035, 0.44, 0.1, metal, { pos: [s * x, 0.05, -0.0], rot: [TILT, 0, 0] })); // stays behind the blade
    // spikes along the bottom edge
    for (let i = 0; i < 6; i++) {
      const x = s * (0.08 + i * 0.17);
      const sp = cyl(0, 0.042, 0.26, 6, steel, { pos: [x, -0.21, 0.36], rot: [Math.PI / 2 + 0.12, 0, 0] });
      half.add(sp);
      half.add(cyl(0.05, 0.05, 0.03, 6, dark, { pos: [x, -0.205, 0.23], rot: [Math.PI / 2, 0, 0] }));
    }
  }
  // centre spine where the halves meet
  g.add(box(0.09, 0.56, 0.1, metal, { pos: [0, 0.05, 0.25], rot: [TILT, 0, 0] }));
  g.add(cyl(0, 0.05, 0.32, 6, steel, { pos: [0, -0.2, 0.48], rot: [Math.PI / 2 + 0.12, 0, 0] }));
  // mounting arms back to the chassis
  for (const s of [-1, 1]) {
    g.add(box(0.07, 0.08, 0.4, metal, { pos: [s * 0.45, -0.02, -0.1] }));
    g.add(tube([s * 0.45, 0.02, -0.05], [s * 0.6, 0.2, -0.04], 0.025, metal, 6));
    g.add(cyl(0.03, 0.03, 0.1, 8, dark, { pos: [s * 0.45, -0.02, 0.06], rot: [0, 0, Math.PI / 2] }));
  }
  return g;
}
