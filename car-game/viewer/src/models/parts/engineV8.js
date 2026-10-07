import * as THREE from 'three';
import { mesh, box, cyl, tube } from '../../lib/geo.js';

// Exposed supercharged V8 that sits in the hood opening.
// Origin = bottom centre of the block; +Z = front of the car.
const CAST = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.85, metalness: 0.4 });
const ALU = new THREE.MeshStandardMaterial({ color: 0x8e949a, roughness: 0.45, metalness: 0.75 });
const ALU_DARK = new THREE.MeshStandardMaterial({ color: 0x5b6167, roughness: 0.55, metalness: 0.7 });
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 });
const HEAT = new THREE.MeshStandardMaterial({ color: 0x4d443c, roughness: 0.6, metalness: 0.6 });
const WIRE = new THREE.MeshStandardMaterial({ color: 0x5a1c16, roughness: 0.7, metalness: 0 });
const VOID = new THREE.MeshBasicMaterial({ color: 0x050505 });

function stadiumShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

export function buildEngineV8() {
  const g = new THREE.Group();
  g.name = 'engine_v8';

  // Block + angled heads
  g.add(box(0.36, 0.2, 0.6, CAST, { pos: [0, 0.1, 0] }));
  for (const s of [-1, 1]) {
    const head = new THREE.Group();
    head.position.set(s * 0.17, 0.2, 0);
    head.rotation.z = -s * 0.5;
    g.add(head);
    head.add(box(0.14, 0.1, 0.58, CAST, { pos: [0, 0.05, 0] }));
    // finned valve cover with breather
    head.add(box(0.13, 0.055, 0.56, ALU, { pos: [0, 0.125, 0] }));
    for (let i = 0; i < 7; i++) head.add(box(0.008, 0.03, 0.5, ALU_DARK, { pos: [-0.05 + i * 0.0167, 0.165, 0] }));
    head.add(cyl(0.025, 0.025, 0.05, 10, ALU_DARK, { pos: [0, 0.17, 0.2] }));
    for (const z of [-0.24, 0.24]) head.add(cyl(0.01, 0.01, 0.02, 6, ALU_DARK, { pos: [0.05, 0.155, z] }));
    // spark plug boots along the outer side
    for (let i = 0; i < 4; i++) head.add(cyl(0.011, 0.011, 0.06, 6, WIRE, { pos: [s * 0.08, 0.06, -0.21 + i * 0.14], rot: [0, 0, s * 1.2] }));
    // headers dropping out the side
    for (let i = 0; i < 4; i++) {
      const z = -0.21 + i * 0.14;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.25, 0.22, z), new THREE.Vector3(s * 0.31, 0.2, z),
        new THREE.Vector3(s * 0.34, 0.08, z * 0.8), new THREE.Vector3(s * 0.34, -0.05, z * 0.5),
      ]);
      g.add(mesh(new THREE.TubeGeometry(c, 10, 0.022, 6), HEAT));
    }
  }

  // Intake manifold + supercharger (6-71 style): ribbed case, cog drive, belt to crank
  g.add(box(0.24, 0.08, 0.56, ALU_DARK, { pos: [0, 0.3, 0] }));
  g.add(box(0.3, 0.025, 0.5, ALU, { pos: [0, 0.35, 0] }));
  const caseGeo = new THREE.ExtrudeGeometry(stadiumShape(0.14, 0.075, 0.06), { depth: 0.46, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.23);
  g.add(mesh(caseGeo, new THREE.MeshStandardMaterial({ color: 0xaab0b6, roughness: 0.32, metalness: 0.85 }), { pos: [0, 0.44, 0] }));
  for (let i = 0; i < 9; i++) {
    const rib = new THREE.ExtrudeGeometry(stadiumShape(0.148, 0.083, 0.064), { depth: 0.012, bevelEnabled: false, curveSegments: 5 });
    g.add(mesh(rib, ALU_DARK, { pos: [0, 0.44, -0.22 + i * 0.054] }));
  }
  for (const s of [-1, 1]) g.add(box(0.012, 0.04, 0.44, ALU_DARK, { pos: [s * 0.15, 0.4, 0] })); // case bolts strip
  // front drive: snout, cog pulley, crank pulley, belt
  g.add(cyl(0.035, 0.035, 0.08, 10, ALU_DARK, { pos: [0, 0.44, 0.27], rot: [Math.PI / 2, 0, 0] }));
  const cog = cyl(0.075, 0.075, 0.045, 24, ALU, { pos: [0, 0.44, 0.33], rot: [Math.PI / 2, 0, 0] });
  g.add(cog);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.add(box(0.012, 0.012, 0.045, ALU_DARK, { pos: [Math.cos(a) * 0.078, 0.44 + Math.sin(a) * 0.078, 0.33] }));
  }
  g.add(cyl(0.065, 0.065, 0.04, 20, ALU_DARK, { pos: [0, 0.06, 0.33], rot: [Math.PI / 2, 0, 0] }));
  for (const s of [-1, 1]) g.add(tube([s * 0.075, 0.44, 0.33], [s * 0.066, 0.06, 0.33], 0.009, RUBBER, 4));
  g.add(cyl(0.05, 0.05, 0.03, 12, ALU_DARK, { pos: [0.14, 0.2, 0.32], rot: [Math.PI / 2, 0, 0] })); // idler
  // alternator
  g.add(cyl(0.06, 0.06, 0.1, 12, ALU_DARK, { pos: [-0.2, 0.2, 0.28], rot: [Math.PI / 2, 0, 0] }));

  // Tall triple-throat scoop (three round intakes facing forward) on a riser
  const CHROME = new THREE.MeshStandardMaterial({ color: 0xb9bfc5, roughness: 0.28, metalness: 0.9 });
  g.add(box(0.26, 0.08, 0.3, ALU_DARK, { pos: [0, 0.56, -0.02] }));
  for (const s of [-1, 1]) for (const z of [-0.12, 0.08]) g.add(cyl(0.008, 0.008, 0.08, 6, CHROME, { pos: [s * 0.11, 0.56, z] }));
  const hat = new THREE.Group();
  hat.position.set(0, 0.68, 0.0);
  g.add(hat);
  // body: wide rounded block, sloping top, flared mouth
  const hatShape = stadiumShape(0.2, 0.075, 0.06);
  hat.add(mesh(new THREE.ExtrudeGeometry(hatShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -0.18), CHROME));
  hat.add(box(0.36, 0.02, 0.26, CHROME, { pos: [0, 0.085, -0.04], rot: [0.12, 0, 0] }));
  for (const x of [-0.125, 0, 0.125]) {
    // round throat: open chrome tube with a rolled lip, dark bore and an amber screen deep inside
    hat.add(mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.1, 20, 1, true).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xb9bfc5, roughness: 0.28, metalness: 0.9, side: THREE.DoubleSide }), { pos: [x, 0.0, 0.165] }));
    hat.add(mesh(new THREE.TorusGeometry(0.056, 0.009, 6, 20), CHROME, { pos: [x, 0.0, 0.215] }));
    hat.add(cyl(0.05, 0.05, 0.005, 16, VOID, { pos: [x, 0.0, 0.13], rot: [Math.PI / 2, 0, 0] }));
    hat.add(cyl(0.046, 0.046, 0.004, 16, new THREE.MeshStandardMaterial({ color: 0xc89b2a, roughness: 0.5, metalness: 0.5, emissive: 0x3a2a05 }), { pos: [x, 0.0, 0.15], rot: [Math.PI / 2, 0, 0] }));
    for (const r of [0.6, -0.6]) hat.add(box(0.004, 0.09, 0.004, ALU_DARK, { pos: [x, 0.0, 0.152], rot: [0, 0, r] }));
  }
  hat.add(cyl(0.012, 0.012, 0.03, 8, CHROME, { pos: [0, 0.1, -0.12] })); // wing nut
  // throttle linkage
  g.add(tube([0.13, 0.58, -0.12], [0.13, 0.58, 0.12], 0.006, ALU_DARK, 5));
  g.add(box(0.03, 0.04, 0.008, ALU_DARK, { pos: [0.13, 0.58, 0.12] }));

  // Distributor at the back with plug wires running to each bank
  const dist = [0, 0.38, -0.33];
  g.add(cyl(0.045, 0.04, 0.08, 12, CAST, { pos: dist }));
  g.add(cyl(0.05, 0.05, 0.03, 12, WIRE, { pos: [dist[0], dist[1] + 0.05, dist[2]] }));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = -0.21 + i * 0.14;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.03, dist[1] + 0.06, dist[2] + 0.02), new THREE.Vector3(s * (0.15 + i * 0.01), 0.36, (dist[2] + z) / 2),
        new THREE.Vector3(s * 0.27, 0.26, z),
      ]);
      g.add(mesh(new THREE.TubeGeometry(c, 8, 0.006, 4), WIRE));
    }
  }
  // oil filler + fuel line
  g.add(cyl(0.02, 0.02, 0.04, 8, ALU, { pos: [-0.22, 0.38, -0.2] }));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.12, 0.58, -0.05), new THREE.Vector3(0.22, 0.45, -0.15), new THREE.Vector3(0.3, 0.3, -0.3),
  ]), 8, 0.007, 4), RUBBER));
  return g;
}

// Radiator + fan shroud for the front of the engine bay
export function buildRadiator() {
  const g = new THREE.Group();
  g.add(box(0.66, 0.3, 0.06, CAST, { pos: [0, 0, 0] }));
  for (let i = 0; i < 30; i++) g.add(box(0.004, 0.27, 0.065, ALU_DARK, { pos: [-0.31 + i * 0.0214, 0, 0] }));
  g.add(box(0.3, 0.06, 0.085, ALU, { pos: [0.12, 0.18, 0] }));
  g.add(cyl(0.02, 0.02, 0.04, 8, ALU, { pos: [0.22, 0.225, 0] }));
  return g;
}
