import * as THREE from 'three';
import { mat, glowMat, cautionMat } from '../../lib/materials.js';
import { mesh, box, cyl, tube, extrudeSide, profile, slabAlong, socket } from '../../lib/geo.js';
import { buildCautionPlow } from '../parts/cautionPlow.js';

// Starter car: 70s muscle coupe turned wasteland brute. See car-game/CAR_SPEC_STARTER.md.

const AXLE_Y = 0.46;
const AXLE_Z = 1.35;
const WHEEL_R = 0.46;
const WHEEL_W = 0.42;
const WHEEL_X = 1.0;
const ARCH_R = 0.56;
const BODY_W = 2.0; // plus bevel = about 2.1
const BOTTOM = 0.45;

// Side-profile keypoints (z, y)
const COWL = [0.5, 1.12];
const WS_TOP = [-0.15, 1.6];
const ROOF_END = [-0.85, 1.62];
const FASTBACK_END = [-1.65, 1.12];

export function buildStarterCoupe({ withAttachments = true } = {}) {
  const car = new THREE.Group();
  car.name = 'starter_coupe';

  const steel = mat('steel');
  const dark = mat('darkSteel');
  const rust = mat('rust');
  const black = mat('black');
  const glass = mat('glass', { roughness: 0.3, metalness: 0.3 });

  // ---- Lower body: one extruded side profile with wheel arches cut out ----
  const s = new THREE.Shape();
  s.moveTo(2.2, BOTTOM);
  s.lineTo(2.28, 0.72);
  s.lineTo(2.22, 1.0);
  s.lineTo(1.7, 1.06);
  s.lineTo(...COWL);
  s.lineTo(-1.6, 1.12);
  s.lineTo(-2.2, 1.08);
  s.lineTo(-2.28, 0.8);
  s.lineTo(-2.2, BOTTOM);
  s.lineTo(-AXLE_Z - ARCH_R, BOTTOM);
  s.absarc(-AXLE_Z, AXLE_Y, ARCH_R, Math.PI, 0, true);
  s.lineTo(AXLE_Z - ARCH_R, BOTTOM);
  s.absarc(AXLE_Z, AXLE_Y, ARCH_R, Math.PI, 0, true);
  s.closePath();
  const body = extrudeSide(s, BODY_W, steel, 0.05);
  body.name = 'body';
  car.add(body);

  // Dark wheel wells so you can't see through the arches
  for (const z of [AXLE_Z, -AXLE_Z]) car.add(box(1.4, 0.5, 1.05, black, { pos: [0, 0.78, z] }));

  // ---- Cabin / greenhouse ----
  const cabin = extrudeSide(profile([[0.45, 1.12], WS_TOP, ROOF_END, FASTBACK_END]), 1.6, steel, 0.03);
  cabin.name = 'cabin';
  car.add(cabin);

  // Windshield glass + welded bars
  car.add(slabAlong(0.45, 1.12, ...WS_TOP, 1.36, 0.02, glass, 0.035));
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const z = THREE.MathUtils.lerp(0.45, WS_TOP[0], t);
    const y = THREE.MathUtils.lerp(1.12, WS_TOP[1], t);
    car.add(tube([-0.66, y + 0.06, z + 0.04], [0.66, y + 0.06, z + 0.04], 0.022, dark, 5));
  }
  car.add(tube([0, 1.18, 0.47], [0, 1.66, -0.12], 0.025, dark, 5));

  // Fastback glass + louvres (the rear view the chase camera sees)
  car.add(slabAlong(...ROOF_END, ...FASTBACK_END, 1.4, 0.02, glass, 0.035));
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const z = THREE.MathUtils.lerp(ROOF_END[0], FASTBACK_END[0], t);
    const y = THREE.MathUtils.lerp(ROOF_END[1], FASTBACK_END[1], t);
    const l = box(1.46, 0.035, 0.15, dark, { pos: [0, y + 0.07, z - 0.02] });
    l.rotation.x = -0.25;
    car.add(l);
  }

  // Side windows + vertical bars
  const sideWin = profile([[0.3, 1.2], [-0.12, 1.52], [-0.8, 1.54], [-1.35, 1.2]]);
  for (const side of [-1, 1]) {
    const w = extrudeSide(sideWin, 0.02, glass);
    w.position.x = side * 0.835;
    car.add(w);
    for (const z of [0.05, -0.3, -0.65, -1.0]) {
      const top = z > -0.12 ? 1.2 + (0.3 - z) * 0.76 : z > -0.8 ? 1.53 : 1.2 + (z + 1.35) * 0.62;
      car.add(tube([side * 0.86, 1.18, z], [side * 0.86, top, z], 0.02, dark, 5));
    }
  }

  // ---- Front ----
  car.add(box(1.5, 0.24, 0.06, black, { pos: [0, 0.84, 2.29] })); // grille
  for (let i = 0; i < 5; i++) car.add(box(1.46, 0.025, 0.04, dark, { pos: [0, 0.76 + i * 0.04, 2.32] }));
  for (const x of [-0.82, -0.62, 0.62, 0.82]) {
    car.add(cyl(0.075, 0.075, 0.06, 8, glowMat('light', 0.7), { pos: [x, 0.86, 2.3], rot: [Math.PI / 2, 0, 0] }));
  }
  car.add(box(2.1, 0.16, 0.2, dark, { pos: [0, 0.56, 2.28] })); // front bumper

  // ---- Hood: rust armor plates + exposed blower ----
  for (const x of [-0.55, 0.55]) {
    const p = box(0.72, 0.035, 0.95, rust, { pos: [x, 1.15, 1.15], rot: [0.05, 0, 0] });
    car.add(p);
    for (const [dx, dz] of [[-0.3, -0.4], [0.3, -0.4], [-0.3, 0.4], [0.3, 0.4]]) {
      car.add(cyl(0.025, 0.025, 0.03, 6, dark, { pos: [x + dx, 1.175, 1.15 + dz] }));
    }
  }
  car.add(box(0.5, 0.12, 0.62, dark, { pos: [0, 1.2, 1.0] }));
  for (const x of [-0.11, 0.11]) {
    car.add(cyl(0.11, 0.11, 0.56, 8, mat('chrome'), { pos: [x, 1.34, 1.0], rot: [Math.PI / 2, 0, 0] }));
  }
  car.add(box(0.42, 0.14, 0.3, dark, { pos: [0, 1.5, 1.05] })); // scoop
  car.add(box(0.36, 0.09, 0.02, black, { pos: [0, 1.5, 1.21] }));

  // ---- Sides: door armor with slit, side exhausts, flares ----
  for (const side of [-1, 1]) {
    car.add(box(0.05, 0.42, 1.15, dark, { pos: [side * 1.07, 0.8, -0.1] }));
    car.add(box(0.02, 0.055, 0.6, black, { pos: [side * 1.1, 0.9, -0.05] }));
    for (const [dy, dz] of [[-0.16, -0.5], [0.16, -0.5], [-0.16, 0.42], [0.16, 0.42]]) {
      car.add(cyl(0.025, 0.025, 0.03, 6, steel, { pos: [side * 1.1, 0.8 + dy, -0.1 + dz], rot: [0, 0, Math.PI / 2] }));
    }
    // rust patch on the rear quarter
    car.add(box(0.02, 0.22, 0.4, rust, { pos: [side * 1.056, 0.72, -1.82] }));
    // side exhaust run
    car.add(tube([side * 1.12, 0.5, 0.75], [side * 1.12, 0.5, -0.75], 0.06, mat('chrome'), 6));
    car.add(cyl(0.075, 0.075, 0.12, 6, black, { pos: [side * 1.12, 0.5, -0.8], rot: [Math.PI / 2, 0, 0] }));

    // fender flares over each wheel
    for (const z of [AXLE_Z, -AXLE_Z]) {
      const arc = new THREE.Shape();
      arc.absarc(0, 0, ARCH_R + 0.13, Math.PI, 0, true);
      arc.lineTo(ARCH_R, 0);
      arc.absarc(0, 0, ARCH_R, 0, Math.PI, false);
      arc.closePath();
      const flare = extrudeSide(arc, 0.22, dark, 0, 7);
      flare.position.set(side * 1.1, AXLE_Y, z);
      car.add(flare);
    }
  }

  // ---- Rear: bumper w/ caution tape, taillights, spoiler, exhausts, jerry cans ----
  car.add(box(2.12, 0.18, 0.2, cautionMat(8, 1), { pos: [0, 0.58, -2.3] }));
  for (const x of [-0.6, 0.6]) car.add(box(0.62, 0.1, 0.03, glowMat('tail', 0.9), { pos: [x, 0.9, -2.3] }));
  car.add(box(0.5, 0.14, 0.03, black, { pos: [0, 0.9, -2.3] })); // blank plate area, no text

  for (const x of [-0.75, 0.75]) car.add(box(0.06, 0.32, 0.3, dark, { pos: [x, 1.3, -2.05] }));
  car.add(box(2.1, 0.06, 0.38, dark, { pos: [0, 1.48, -2.1], rot: [-0.08, 0, 0] }));
  for (const x of [-1.05, 1.05]) car.add(box(0.05, 0.26, 0.46, dark, { pos: [x, 1.5, -2.1] }));

  for (const x of [-0.42, 0.42]) {
    car.add(cyl(0.065, 0.065, 0.3, 8, mat('chrome'), { pos: [x, 0.44, -2.3], rot: [Math.PI / 2, 0, 0] }));
    car.add(cyl(0.05, 0.05, 0.02, 8, black, { pos: [x, 0.44, -2.46], rot: [Math.PI / 2, 0, 0] }));
  }

  for (const x of [-0.42, 0.42]) {
    car.add(box(0.22, 0.27, 0.3, mat('olive'), { pos: [x, 1.31, -1.92] }));
    car.add(box(0.05, 0.06, 0.05, black, { pos: [x + 0.06, 1.47, -1.86] }));
  }

  // Flag poles from the spoiler endplates
  for (const [x, color] of [[-1.05, 'caution'], [1.05, 'steel']]) {
    car.add(tube([x, 1.4, -2.2], [x, 2.75, -2.2], 0.02, dark, 5));
    const tri = new THREE.Shape();
    tri.moveTo(0, 0);
    tri.lineTo(0.5, -0.16);
    tri.lineTo(0, -0.32);
    tri.closePath();
    const flag = mesh(new THREE.ShapeGeometry(tri), mat(color, { side: THREE.DoubleSide }));
    flag.rotation.y = Math.PI / 2; // shape +x maps to -Z, so the flag trails backward
    flag.position.set(x, 2.72, -2.2);
    flag.name = 'flag';
    car.add(flag);
  }

  // ---- Roll cage + roof rack ----
  const RACK_Y = 1.78;
  for (const side of [-1, 1]) {
    car.add(tube([side * 0.8, 1.14, 0.45], [side * 0.74, RACK_Y, -0.05], 0.045, dark));
    car.add(tube([side * 0.82, 1.14, -1.62], [side * 0.74, RACK_Y, -1.1], 0.045, dark));
    car.add(tube([side * 0.74, RACK_Y, 0.08], [side * 0.74, RACK_Y, -1.18], 0.045, dark));
  }
  for (const z of [0.08, -1.18]) car.add(tube([-0.74, RACK_Y, z], [0.74, RACK_Y, z], 0.045, dark));
  for (let i = 0; i < 7; i++) car.add(box(1.44, 0.03, 0.06, dark, { pos: [0, RACK_Y - 0.02, -0.02 - i * 0.17] }));

  // Spotlights along the front edge of the rack
  for (const x of [-0.54, -0.18, 0.18, 0.54]) {
    car.add(tube([x, RACK_Y, 0.08], [x, RACK_Y + 0.1, 0.08], 0.018, dark, 5));
    car.add(cyl(0.1, 0.1, 0.09, 10, dark, { pos: [x, RACK_Y + 0.18, 0.1], rot: [Math.PI / 2, 0, 0] }));
    car.add(cyl(0.085, 0.085, 0.02, 10, glowMat('light', 0.9), { pos: [x, RACK_Y + 0.18, 0.155], rot: [Math.PI / 2, 0, 0] }));
  }

  // Spare tire on the back of the rack
  car.add(cyl(0.28, 0.28, 0.14, 12, mat('tire'), { pos: [0.38, RACK_Y + 0.08, -0.92] }));
  car.add(cyl(0.12, 0.12, 0.15, 8, mat('steel'), { pos: [0.38, RACK_Y + 0.08, -0.92] }));

  // Yellow smiley on the roof hatch (visible through the rack)
  car.add(cyl(0.16, 0.16, 0.02, 12, mat('caution'), { pos: [-0.32, 1.66, -0.5] }));
  for (const x of [-0.37, -0.27]) car.add(box(0.025, 0.012, 0.05, black, { pos: [x, 1.675, -0.46] }));
  const smile = mesh(new THREE.TorusGeometry(0.075, 0.012, 3, 8, Math.PI), black);
  smile.rotation.set(Math.PI / 2, 0, 0);
  smile.position.set(-0.32, 1.675, -0.53);
  car.add(smile);

  // ---- Wheels ----
  const wheels = {};
  for (const [key, x, z] of [['fl', 1, 1], ['fr', -1, 1], ['rl', 1, -1], ['rr', -1, -1]]) {
    const steer = new THREE.Group();
    steer.name = `wheel_${key}_steer`;
    steer.position.set(x * WHEEL_X, AXLE_Y, z * AXLE_Z);
    const spin = buildWheel(x);
    spin.name = `wheel_${key}`;
    steer.add(spin);
    car.add(steer);
    wheels[key] = { steer, spin, front: z > 0 };
  }
  car.userData.wheels = wheels;

  // ---- Sockets ----
  const hubs = { HUB_FL: [WHEEL_X, 1], HUB_FR: [-WHEEL_X, 1], HUB_RL: [WHEEL_X, -1], HUB_RR: [-WHEEL_X, -1] };
  const sockets = [
    socket('ROOF_MAIN', [0, RACK_Y + 0.02, -0.45]),
    socket('ROOF_RACK_L', [0.5, RACK_Y + 0.02, -0.3]),
    socket('ROOF_RACK_R', [-0.5, RACK_Y + 0.02, -0.3]),
    socket('FRONT', [0, 0.56, 2.4]),
    socket('HOOD', [0, 1.6, 1.05]),
    socket('SIDE_L', [1.15, 0.85, -0.1], [0, Math.PI / 2, 0]),
    socket('SIDE_R', [-1.15, 0.85, -0.1], [0, -Math.PI / 2, 0]),
    socket('REAR', [0, 0.6, -2.42], [0, Math.PI, 0]),
    socket('EXHAUST_L', [0.42, 0.44, -2.47], [0, Math.PI, 0]),
    socket('EXHAUST_R', [-0.42, 0.44, -2.47], [0, Math.PI, 0]),
    ...Object.entries(hubs).map(([n, [x, z]]) => socket(n, [x + Math.sign(x) * 0.24, AXLE_Y, z * AXLE_Z])),
  ];
  for (const so of sockets) car.add(so);

  if (withAttachments) {
    const plow = buildCautionPlow();
    car.getObjectByName('FRONT').add(plow);
  }

  return car;
}

function buildWheel(side) {
  const g = new THREE.Group();
  const tire = cyl(WHEEL_R, WHEEL_R, WHEEL_W, 12, mat('tire'), { rot: [0, 0, Math.PI / 2] });
  g.add(tire);
  // chunky tread blocks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const b = box(WHEEL_W * 0.9, 0.06, 0.12, mat('tire'), {
      pos: [i % 2 ? 0.03 : -0.03, Math.cos(a) * (WHEEL_R + 0.015), Math.sin(a) * (WHEEL_R + 0.015)],
    });
    b.rotation.x = -a;
    g.add(b);
  }
  // rim + hub spike, pointing outward
  g.add(cyl(0.25, 0.25, 0.04, 10, mat('steel'), { pos: [side * (WHEEL_W / 2), 0, 0], rot: [0, 0, Math.PI / 2] }));
  g.add(cyl(0.11, 0.13, 0.08, 8, mat('darkSteel'), { pos: [side * (WHEEL_W / 2 + 0.05), 0, 0], rot: [0, 0, Math.PI / 2] }));
  const spike = cyl(0, 0.09, 0.34, 6, mat('chrome'), { pos: [side * (WHEEL_W / 2 + 0.26), 0, 0], rot: [0, 0, -side * Math.PI / 2] });
  g.add(spike);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = cyl(0, 0.04, 0.16, 4, mat('chrome'), {
      pos: [side * (WHEEL_W / 2 + 0.03), Math.cos(a) * 0.2, Math.sin(a) * 0.2],
    });
    blade.rotation.x = a;
    g.add(blade);
  }
  return g;
}
