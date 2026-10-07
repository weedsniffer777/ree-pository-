import * as THREE from 'three';
import { mat, cautionMat } from '../../lib/materials.js';
import { box, cyl, tube } from '../../lib/geo.js';

// Front attachment. Origin = the FRONT socket; +Z points away from the car.
export function buildCautionPlow() {
  const g = new THREE.Group();
  g.name = 'part_caution_plow';
  const dark = mat('darkSteel');

  const plate = box(2.24, 0.62, 0.07, cautionMat(7, 1), { pos: [0, 0.02, 0.32], rot: [-0.32, 0, 0] });
  g.add(plate);
  g.add(tube([-1.12, 0.31, 0.22], [1.12, 0.31, 0.22], 0.04, dark)); // top rail
  for (const x of [-0.6, 0.6]) g.add(tube([x, 0, -0.05], [x, 0.05, 0.3], 0.05, dark));

  // spike row along the bottom edge
  for (let i = 0; i < 9; i++) {
    const x = -1.0 + i * 0.25;
    g.add(cyl(0, 0.05, 0.3, 5, mat('chrome'), { pos: [x, -0.26, 0.52], rot: [Math.PI / 2, 0, 0] }));
  }
  return g;
}
