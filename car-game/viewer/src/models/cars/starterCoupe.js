import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, box, cyl, tube, slabAlong, socket } from '../../lib/geo.js';
import { loft, projectAndGroup } from '../../lib/loft.js';
import {
  UV, Z0, ZL, YH, makeCanvas, toTexture, paintGunmetal, fillPoly, rust, along as seedsAlong,
  edgeWear, dust, paintStreak, glassMaterial, darkMaterial, gunmetalMaterial,
} from '../../lib/skin.js';
import {
  AXLE_Y, AXLE_F, AXLE_R, TRACK_X, ARCH_R, BODY, bodyHalf, bodyTop, cabinRows, cabinHalf,
  cabinBase, cabinTop, WS, RG, along,
} from './coupeShape.js';
import { buildSpikedWheel } from '../parts/spikedWheel.js';
import { addDetails } from './coupeDetails.js';

// Starter car v3: realistic 70s wedge/fastback coupe, fully armored in matte gunmetal.
// References: Esprit rear, R17 greenhouse/louvres, Death Race Mustang armor.

const deg = THREE.MathUtils.degToRad;

export function buildStarterCoupe() {
  const car = new THREE.Group();
  car.name = 'starter_coupe';
  const skins = paintSkins();
  car.userData.skins = skins;
  const skinMats = [skins.side, skins.top, skins.front, skins.back];
  const interior = darkMaterial(0x24272a);
  const well = darkMaterial(0x0e0f10);
  const frame = gunmetalMaterial();
  const ev = new Evaluator();
  ev.useGroups = true;
  const project = (geo, keep) => projectAndGroup(geo, [UV.side, UV.top, UV.front, UV.back], keep);

  // ---- Body shell: angular loft, minus wheel arches, interior tub and door gaps ----
  let shell = new Brush(loft(BODY.map(([z]) => ({ z, half: bodyHalf(z) }))), skins.side);
  shell.updateMatrixWorld();
  const cut = (geo, material, pos, rot = [0, 0, 0]) => {
    const b = new Brush(geo, material);
    b.position.set(...pos);
    b.rotation.set(...rot);
    b.updateMatrixWorld();
    shell = ev.evaluate(shell, b, SUBTRACTION);
  };
  for (const z of [AXLE_F, AXLE_R]) {
    for (const s of [-1, 1]) cut(new THREE.CylinderGeometry(ARCH_R, ARCH_R, 0.42, 32).rotateZ(Math.PI / 2), well, [s * 0.83, AXLE_Y + 0.03, z]);
  }
  cut(new THREE.BoxGeometry(1.5, 0.8, 2.55), interior, [0, 0.72, -0.43]); // cabin tub, floor at y=0.32
  cut(new THREE.BoxGeometry(0.68, 0.5, 0.74), interior, [0, 0.82, 1.55]); // engine bay opening
  const gap = darkMaterial(0x0b0c0d);
  for (const s of [-1, 1]) {
    for (const z of [0.82, -0.4]) cut(new THREE.BoxGeometry(0.06, 0.62, 0.007), gap, [s * 0.92, 0.55, z]);
  }
  // rear wheel tubs: the arches open into the cabin tub, so close them off
  for (const s of [-1, 1]) {
    const tubMat = darkMaterial(0x111214);
    tubMat.side = THREE.DoubleSide;
    const roof = mesh(new THREE.CylinderGeometry(ARCH_R + 0.005, ARCH_R + 0.005, 0.3, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), tubMat);
    roof.position.set(s * 0.77, AXLE_Y + 0.03, AXLE_R);
    car.add(roof);
    car.add(box(0.02, ARCH_R + 0.1, ARCH_R * 2 + 0.02, tubMat, { pos: [s * 0.625, AXLE_Y + 0.03 + (ARCH_R + 0.1) / 2 - 0.06, AXLE_R] }));
  }
  const bodyMesh = mesh(project(toCreasedNormals(shell.geometry, deg(25)), [well, interior, gap].map((m) => shell.material.indexOf(m))), [...skinMats, well, interior, gap]);
  bodyMesh.name = 'body';
  car.add(bodyMesh);

  // ---- Greenhouse: hollow shell with real window openings ----
  let cab = new Brush(loft(cabinRows.map(([z, top]) => ({ z, half: cabinHalf(z, top) }))), skins.side);
  cab.updateMatrixWorld();
  const cabCut = (brush) => { brush.updateMatrixWorld(); cab = ev.evaluate(cab, brush, SUBTRACTION); };
  const innerRows = [0.8, 0.6, 0.35, 0.15, -0.2, -0.75, -1.1, -1.5, -1.74].map((z) => {
    const yb = cabinBase(z);
    const top = cabinTop(z);
    return { z, half: [[0, yb - 0.2], [0.755, yb - 0.2], [0.755, yb], [0.645, Math.max(yb + 0.005, top - 0.085)], [0.585, top - 0.045], [0, top - 0.04]] };
  });
  cabCut(new Brush(loft(innerRows), interior));
  cabCut(slabBrush(...along(WS.base, WS.top, 0.1), ...along(WS.base, WS.top, 0.93), 1.14, 0.3, frame));
  cabCut(slabBrush(...along(RG.top, RG.base, 0.07), ...along(RG.top, RG.base, 0.88), 1.06, 0.3, frame));
  const dloFront = dlo(0.62, -0.38);
  const dloRear = dlo(-0.5, -1.6);
  for (const shape of [dloFront, dloRear]) cabCut(new Brush(extrudeX(shape, 2.2), frame));
  const cabMesh = mesh(project(toCreasedNormals(cab.geometry, deg(25)), [interior, frame].map((m) => cab.material.indexOf(m))), [...skinMats, interior, frame]);
  cabMesh.name = 'cabin';
  car.add(cabMesh);

  // ---- Glass ----
  const glass = glassMaterial();
  car.add(slabAlong(...along(WS.base, WS.top, 0.02), ...along(WS.base, WS.top, 0.98), 1.3, 0.008, glass, -0.022));
  car.add(slabAlong(...along(RG.top, RG.base, 0.02), ...along(RG.top, RG.base, 0.95), 1.2, 0.008, glass, -0.022));
  for (const s of [-1, 1]) {
    const pane = mesh(extrudeX(dloFront.map(([z, y]) => [z, y]), 0.006, 0.02), glass);
    pane.position.x = s * 0.668;
    car.add(pane);
  }

  addInterior(car);

  // ---- Wheels ----
  const wheels = {};
  for (const [key, s, z] of [['fl', 1, AXLE_F], ['fr', -1, AXLE_F], ['rl', 1, AXLE_R], ['rr', -1, AXLE_R]]) {
    const steer = new THREE.Group();
    steer.name = `wheel_${key}_steer`;
    steer.position.set(s * TRACK_X, AXLE_Y, z);
    const spin = buildSpikedWheel(s);
    spin.name = `wheel_${key}`;
    steer.add(spin);
    car.add(steer);
    wheels[key] = { steer, spin, front: z > 0 };
  }
  car.userData.wheels = wheels;

  // ---- Everything bolted on: armor, lights, rack, blower, exhausts, rear, guns, dozer ----
  addDetails(car, { skinMats, dloFront, dloRear });

  for (const so of [
    socket('SIDE_L', [0.97, 0.55, 0.2], [0, Math.PI / 2, 0]),
    socket('SIDE_R', [-0.97, 0.55, 0.2], [0, -Math.PI / 2, 0]),
    socket('HUB_FL', [TRACK_X + 0.12, AXLE_Y, AXLE_F]),
    socket('HUB_FR', [-TRACK_X - 0.12, AXLE_Y, AXLE_F]),
    socket('HUB_RL', [TRACK_X + 0.12, AXLE_Y, AXLE_R]),
    socket('HUB_RR', [-TRACK_X - 0.12, AXLE_Y, AXLE_R]),
  ]) car.add(so);

  return car;
}

// Side window opening outline in (z, y), following the greenhouse.
function dlo(zFront, zBack) {
  const topEdge = [];
  const botEdge = [];
  for (let z = zFront; z >= zBack - 1e-6; z -= 0.04) {
    const t = cabinTop(z) - 0.078;
    const b = cabinBase(z) + 0.035;
    if (t > b + 0.02) { topEdge.push([z, t]); botEdge.push([z, b]); }
  }
  return [...topEdge, ...botEdge.reverse()];
}

// Extrude a (z, y) outline across X, centred on x = 0 (optionally offset).
function extrudeX(outline, width, offsetX = 0) {
  const s = new THREE.Shape();
  outline.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 + offsetX, 0, 0);
  return g;
}

function slabBrush(z1, y1, z2, y2, width, thick, material) {
  const len = Math.hypot(z2 - z1, y2 - y1);
  const b = new Brush(new THREE.BoxGeometry(width, len, thick), material);
  b.position.set(0, (y1 + y2) / 2, (z1 + z2) / 2);
  b.rotation.x = Math.atan2((z2 - z1) / len, (y2 - y1) / len);
  return b;
}

function addInterior(car) {
  const g = new THREE.Group();
  g.name = 'interior';
  const leather = darkMaterial(0x2c2723);
  const dash = darkMaterial(0x1d1f22);
  const cage = new THREE.MeshStandardMaterial({ color: 0x3a3e43, roughness: 0.7, metalness: 0.5 });
  const FLOOR = 0.32;

  for (const x of [-0.37, 0.37]) {
    g.add(box(0.46, 0.12, 0.5, leather, { pos: [x, FLOOR + 0.12, -0.3] }));
    g.add(box(0.46, 0.56, 0.1, leather, { pos: [x, FLOOR + 0.42, -0.6], rot: [-0.2, 0, 0] }));
    for (const s of [-1, 1]) g.add(box(0.06, 0.3, 0.12, leather, { pos: [x + s * 0.21, FLOOR + 0.42, -0.58], rot: [-0.2, 0, 0] }));
    g.add(box(0.24, 0.16, 0.08, leather, { pos: [x, FLOOR + 0.78, -0.68], rot: [-0.2, 0, 0] }));
  }
  g.add(box(1.46, 0.2, 0.32, dash, { pos: [0, 0.74, 0.72] }));
  g.add(box(1.3, 0.04, 0.12, dash, { pos: [0, 0.85, 0.66] }));
  g.add(box(0.22, 0.24, 0.9, dash, { pos: [0, FLOOR + 0.12, 0.05] }));
  g.add(cyl(0.012, 0.012, 0.18, 6, cage, { pos: [0, FLOOR + 0.3, 0.1], rot: [0.3, 0, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), dash, { pos: [0, FLOOR + 0.39, 0.13] }));
  // steering wheel (left-hand drive: driver on +X), square to the column
  const colA = new THREE.Vector3(0.37, 0.74, 0.74);
  const colB = new THREE.Vector3(0.37, 0.86, 0.46);
  g.add(tube(colA.toArray(), colB.toArray(), 0.022, dash, 8));
  const sw = new THREE.Group();
  sw.position.copy(colB);
  sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), colB.clone().sub(colA).normalize());
  g.add(sw);
  sw.add(mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 28), dash));
  sw.add(cyl(0.04, 0.045, 0.04, 12, dash, { rot: [Math.PI / 2, 0, 0] }));
  for (const a of [Math.PI / 2 + Math.PI, Math.PI / 6 + Math.PI, Math.PI * 5 / 6 + Math.PI]) {
    const sp = box(0.03, 0.15, 0.012, dash, { pos: [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0] });
    sp.rotation.z = a - Math.PI / 2;
    sw.add(sp);
  }
  // inner roll cage
  const hz = -0.88;
  const top = cabinTop(hz) - 0.08;
  for (const s of [-1, 1]) {
    g.add(tube([s * 0.68, FLOOR, hz], [s * 0.6, top, hz], 0.024, cage, 8));
    g.add(tube([s * 0.6, top, hz], [s * 0.56, cabinTop(0.2) - 0.08, 0.2], 0.022, cage, 8));
    g.add(tube([s * 0.56, cabinTop(0.2) - 0.08, 0.2], [s * 0.66, 0.8, 0.72], 0.022, cage, 8));
    g.add(tube([s * 0.6, top, hz], [s * 0.6, 0.85, -1.55], 0.022, cage, 8));
  }
  g.add(tube([-0.6, top, hz], [0.6, top, hz], 0.024, cage, 8));
  g.add(tube([-0.6, top, hz], [0.66, FLOOR + 0.1, hz], 0.022, cage, 8));
  // ammo cans behind the seats feeding the forward guns
  const olive = darkMaterial(0x3f4630);
  for (const x of [-0.35, 0.35]) g.add(box(0.3, 0.2, 0.16, olive, { pos: [x, FLOOR + 0.1, -1.0] }));
  car.add(g);
}

// Roof/bonnet skin: gunmetal with twin streaks nose to tail (Death Race style), slightly
// off-centre and hand-painted. `color` picks the streak paint (rgb 0..255).
function paintTopCanvas(top, color) {
  paintGunmetal(top, 12, { stains: false });
  fillPoly(top, [[0.86, -0.76], [0.86, 0.76], [-1.72, 0.76], [-1.72, -0.76]], '#1f2225'); // floor seen through glass
  paintStreak(top, 2.26, -2.26, 0.2, 0.17, 41, color);
  paintStreak(top, 2.26, -2.26, -0.2, 0.17, 42, color);
  paintStreak(top, 2.26, -2.26, 0.06, 0.03, 43, color);
  edgeWear(top, [[2.2, -0.85], [2.2, 0.85]], 13, 0.03);
  for (const s of [-1, 1]) edgeWear(top, [[2.2, s * 0.86], [-2.2, s * 0.86]], 14 + s, 0.02);
  rust(top, [[2.1, 0.7], [2.1, -0.65], [0.95, 0.55], [0.95, -0.6], [-2.1, 0.7], [-2.05, -0.6], [-1.95, 0.0]], 15, { size: 0.08, drips: false });
}

// A top skin in another streak colour, for rival cars sharing the model (half resolution).
export function paintTopSkin(color) {
  const top = makeCanvas(1024, 410, (z) => (z - Z0) / ZL, (x) => (x + 1) / 2);
  paintTopCanvas(top, color);
  return new THREE.MeshStandardMaterial({ map: toTexture(top.c), roughness: 0.88, metalness: 0.25 });
}

// ---- Painted skins: matte gunmetal, wear on edges, corrosion where water sits ----
function paintSkins() {
  const side = makeCanvas(2048, 574, (z) => (z - Z0) / ZL, (y) => y / YH);
  const top = makeCanvas(2048, 820, (z) => (z - Z0) / ZL, (x) => (x + 1) / 2);
  const front = makeCanvas(512, 358, (x) => (x + 1) / 2, (y) => y / YH);
  const back = makeCanvas(512, 358, (x) => (x + 1) / 2, (y) => y / YH);

  paintGunmetal(side, 11);
  dust(side, 0.18, 0.55, 0.5);
  const shoulder = BODY.map(([z, , , belt]) => [z, belt]);
  edgeWear(side, shoulder, 3, 0.025);
  edgeWear(side, BODY.map(([z, , yb]) => [z, yb + 0.1]), 4, 0.02);
  rust(side, seedsAlong([[-2.15, 0.25], [2.15, 0.25]], 0.18, 5, 0.04), 6, { size: 0.1 });
  for (const az of [AXLE_F, AXLE_R]) {
    const arc = [];
    for (let a = 0.15; a <= Math.PI - 0.15; a += 0.12) arc.push([az + Math.cos(a) * (ARCH_R + 0.03), AXLE_Y + 0.03 + Math.sin(a) * (ARCH_R + 0.03)]);
    rust(side, seedsAlong(arc, 0.12, 7, 0.02), 8, { size: 0.07, density: 0.8 });
  }
  rust(side, [[0.82, 0.8], [-0.4, 0.78], [-2.05, 0.4], [2.02, 0.38], [-1.75, 0.62]], 9, { size: 0.06, density: 0.6 });

  paintTopCanvas(top);

  paintGunmetal(front, 16);
  dust(front, 0.28, 0.5, 0.5);
  rust(front, [[-0.7, 0.34], [0.68, 0.35], [0.0, 0.32]], 17, { size: 0.08 });

  paintGunmetal(back, 18);
  dust(back, 0.3, 0.55, 0.45);
  rust(back, [[-0.7, 0.4], [0.72, 0.42], [-0.3, 0.36], [0.4, 0.82]], 19, { size: 0.08 });

  const m = (cv) => new THREE.MeshStandardMaterial({ map: toTexture(cv.c), roughness: 0.88, metalness: 0.25 });
  return { side: m(side), top: m(top), front: m(front), back: m(back) };
}
