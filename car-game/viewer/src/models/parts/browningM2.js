import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { mesh, box, cyl, tube } from '../../lib/geo.js';

// Browning M2 .50 cal on a pintle cradle, mid-high detail.
// Origin = base of the pintle post (bolts to a socket). +Z = muzzle, +Y up.
// feedSide: +1 belt enters from +X, -1 from -X. Returns the group; the belt entry point
// is exposed as userData.feedPoint (local coords).
const PARK = new THREE.MeshStandardMaterial({ color: 0x2f3337, roughness: 0.7, metalness: 0.55 });
const PARK_DARK = new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.75, metalness: 0.5 });
const WORN = new THREE.MeshStandardMaterial({ color: 0x575c61, roughness: 0.55, metalness: 0.6 });
const BAND = new THREE.MeshStandardMaterial({ color: 0x3d3a33, roughness: 0.85, metalness: 0.2 });

let jacketGeo;
function perforatedJacket() {
  if (jacketGeo) return jacketGeo;
  const ev = new Evaluator();
  let j = new Brush(new THREE.CylinderGeometry(0.046, 0.046, 0.3, 18).rotateX(Math.PI / 2), PARK);
  j.updateMatrixWorld();
  for (let i = 0; i < 4; i++) {
    for (const vertical of [false, true]) {
      // through-holes across X (rotated cylinder) and across Y (default axis)
      const hole = new Brush(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 8), PARK);
      if (!vertical) hole.rotation.z = Math.PI / 2;
      hole.position.z = -0.1 + i * 0.065 + (vertical ? 0.03 : 0);
      hole.updateMatrixWorld();
      j = ev.evaluate(j, hole, SUBTRACTION);
    }
  }
  // hollow bore so the holes read as holes
  const bore = new Brush(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 12).rotateX(Math.PI / 2), PARK_DARK);
  bore.updateMatrixWorld();
  j = ev.evaluate(j, bore, SUBTRACTION);
  jacketGeo = j.geometry;
  return jacketGeo;
}

export function buildBrowningM2({ feedSide = 1 } = {}) {
  const root = new THREE.Group();
  root.name = 'part_browning_m2';

  // --- Pintle post + cradle ---
  root.add(cyl(0.075, 0.085, 0.025, 12, PARK_DARK, { pos: [0, 0.012, 0] }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    root.add(cyl(0.011, 0.011, 0.02, 6, WORN, { pos: [Math.cos(a) * 0.06, 0.03, Math.sin(a) * 0.06] }));
  }
  root.add(cyl(0.028, 0.032, 0.16, 10, PARK, { pos: [0, 0.1, 0] }));
  root.add(cyl(0.04, 0.04, 0.03, 10, PARK_DARK, { pos: [0, 0.18, 0] }));
  for (const s of [-1, 1]) {
    root.add(box(0.012, 0.09, 0.14, PARK, { pos: [s * 0.072, 0.235, 0] }));
    root.add(cyl(0.016, 0.016, 0.02, 8, WORN, { pos: [s * 0.082, 0.255, 0], rot: [0, 0, Math.PI / 2] }));
  }
  root.add(box(0.156, 0.02, 0.12, PARK, { pos: [0, 0.195, 0] }));

  const gun = new THREE.Group();
  gun.position.set(0, 0.255, 0.04); // trunnion
  root.add(gun);

  // --- Receiver ---
  const RZ0 = -0.44, RZ1 = 0.12;
  const rcvLen = RZ1 - RZ0;
  const rcvZ = (RZ0 + RZ1) / 2;
  gun.add(box(0.115, 0.15, rcvLen, PARK, { pos: [0, 0.0, rcvZ] }));
  for (const s of [-1, 1]) {
    // raised side plate + rivet rows
    gun.add(box(0.008, 0.1, rcvLen * 0.7, PARK_DARK, { pos: [s * 0.061, -0.005, rcvZ - 0.04] }));
    for (let i = 0; i < 9; i++) {
      for (const y of [0.055, -0.058]) {
        gun.add(cyl(0.005, 0.005, 0.006, 6, WORN, { pos: [s * 0.0605, y, RZ0 + 0.04 + i * 0.058], rot: [0, 0, Math.PI / 2] }));
      }
    }
    // trunnion block
    gun.add(box(0.012, 0.06, 0.08, PARK_DARK, { pos: [s * 0.064, -0.02, 0.0] }));
  }
  // top cover with latch, rear sight leaf
  gun.add(box(0.11, 0.022, 0.3, PARK_DARK, { pos: [0, 0.086, -0.03] }));
  gun.add(box(0.03, 0.02, 0.05, WORN, { pos: [0, 0.103, 0.09] }));
  gun.add(box(0.035, 0.05, 0.008, PARK, { pos: [0, 0.12, -0.3] }));
  gun.add(box(0.012, 0.02, 0.006, WORN, { pos: [0, 0.15, -0.3] }));
  // backplate, spade grips, butterfly trigger
  gun.add(box(0.13, 0.17, 0.03, PARK_DARK, { pos: [0, -0.005, RZ0 - 0.015] }));
  for (const s of [-1, 1]) {
    gun.add(tube([s * 0.045, -0.04, RZ0 - 0.03], [s * 0.075, -0.12, RZ0 - 0.13], 0.016, BAND, 8));
    gun.add(cyl(0.02, 0.02, 0.012, 8, PARK, { pos: [s * 0.075, -0.12, RZ0 - 0.13], rot: [Math.PI / 2 - 0.6, 0, 0] }));
  }
  gun.add(box(0.06, 0.012, 0.03, WORN, { pos: [0, -0.02, RZ0 - 0.05] }));
  // cocking handle on the side opposite the feed
  const ch = -feedSide;
  gun.add(box(0.01, 0.02, 0.2, PARK_DARK, { pos: [ch * 0.064, 0.03, -0.15] }));
  gun.add(cyl(0.012, 0.012, 0.05, 8, WORN, { pos: [ch * 0.09, 0.03, -0.1], rot: [0, 0, Math.PI / 2] }));
  gun.add(cyl(0.017, 0.017, 0.022, 8, PARK, { pos: [ch * 0.118, 0.03, -0.1], rot: [0, 0, Math.PI / 2] }));
  // feed tray + belt guide on the feed side
  gun.add(box(0.05, 0.035, 0.07, PARK_DARK, { pos: [feedSide * 0.08, 0.06, 0.02] }));
  gun.add(box(0.03, 0.008, 0.075, WORN, { pos: [feedSide * 0.09, 0.08, 0.02] }));
  gun.add(box(0.008, 0.04, 0.07, PARK, { pos: [feedSide * 0.106, 0.045, 0.02] }));
  // ejection port underneath
  gun.add(box(0.06, 0.006, 0.07, PARK_DARK, { pos: [0, -0.077, 0.02] }));

  // --- Barrel jacket, carry handle, barrel, flash hider ---
  const jacket = mesh(perforatedJacket(), PARK);
  jacket.position.set(0, 0.02, RZ1 + 0.15);
  gun.add(jacket);
  gun.add(cyl(0.05, 0.05, 0.03, 18, PARK_DARK, { pos: [0, 0.02, RZ1 + 0.015], rot: [Math.PI / 2, 0, 0] }));
  gun.add(cyl(0.035, 0.035, 0.03, 14, PARK_DARK, { pos: [0, 0.02, RZ1 + 0.31], rot: [Math.PI / 2, 0, 0] }));
  gun.add(cyl(0.022, 0.022, 0.03, 10, BAND, { pos: [0, 0.02, RZ1 + 0.03], rot: [Math.PI / 2, 0, 0] })); // bore dark
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.06, RZ1 + 0.08), new THREE.Vector3(0, 0.13, RZ1 + 0.1),
    new THREE.Vector3(0, 0.14, RZ1 + 0.2), new THREE.Vector3(0, 0.06, RZ1 + 0.24),
  ]);
  gun.add(mesh(new THREE.TubeGeometry(handle, 12, 0.009, 6), PARK_DARK));
  gun.add(cyl(0.016, 0.016, 0.08, 8, BAND, { pos: [0, 0.14, RZ1 + 0.15], rot: [Math.PI / 2, 0, 0] }));
  const BZ0 = RZ1 + 0.32, BZ1 = BZ0 + 0.7;
  gun.add(cyl(0.024, 0.027, BZ1 - BZ0, 12, PARK, { pos: [0, 0.02, (BZ0 + BZ1) / 2], rot: [Math.PI / 2, 0, 0] }));
  gun.add(box(0.008, 0.035, 0.012, PARK_DARK, { pos: [0, 0.055, RZ1 + 0.29] })); // front sight
  const fh = cyl(0.034, 0.034, 0.07, 12, PARK_DARK, { pos: [0, 0.02, BZ1 + 0.03], rot: [Math.PI / 2, 0, 0] });
  gun.add(fh);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    gun.add(box(0.008, 0.02, 0.05, new THREE.MeshBasicMaterial({ color: 0x050505 }), {
      pos: [Math.cos(a) * 0.033, 0.02 + Math.sin(a) * 0.033, BZ1 + 0.035], rot: [0, 0, a],
    }));
  }
  gun.add(cyl(0.02, 0.02, 0.005, 10, new THREE.MeshBasicMaterial({ color: 0x050505 }), { pos: [0, 0.02, BZ1 + 0.066], rot: [Math.PI / 2, 0, 0] }));

  root.userData.feedPoint = new THREE.Vector3(feedSide * 0.11, 0.255 + 0.075, 0.06);
  root.userData.muzzle = new THREE.Vector3(0, 0.275, 0.04 + BZ1 + 0.07);
  return root;
}
