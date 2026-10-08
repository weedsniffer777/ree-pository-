import * as THREE from 'three';
import { nearest } from './route.js';
import { groundAt } from './car.js';

// Tyre marks: a ring buffer of thin quads laid behind each rear wheel while the car
// slides, brakes hard or spins up. Rubber on asphalt, darker ruts on sand. Oldest marks
// are overwritten, so the cost is fixed.

const MAX = 2400; // segments
const SEG = 0.4; // metres between points
const HALF_W = 0.13;
const REAR = -1.25, TRACK = 0.77;

export class Skids {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 4 * 3);
    this.col = new Float32Array(MAX * 4 * 4);
    const idx = new Uint32Array(MAX * 6);
    for (let k = 0; k < MAX; k++) idx.set([k * 4, k * 4 + 2, k * 4 + 1, k * 4 + 1, k * 4 + 2, k * 4 + 3], k * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.head = 0;
    this.wheels = [null, null]; // last point per rear wheel: {x, y, z, lx, lz, rx, rz}
    this.dirty = false;
  }

  update(car) {
    const on = car.skid > 0.15 && !car.airborne;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
    for (let w = 0; w < 2; w++) {
      if (!on) { this.wheels[w] = null; continue; }
      const sx = w ? TRACK : -TRACK;
      const x = car.x + fx * REAR + rx * sx, z = car.z + fz * REAR + rz * sx;
      const last = this.wheels[w];
      if (last && Math.hypot(x - last.x, z - last.z) < SEG) continue;
      const n = nearest(x, z, car.hint);
      const y = groundAt(x, z, n) + 0.025;
      // strip runs along the travel direction and widens with slip, like a tyre scrubbing sideways
      const sp = Math.hypot(car.vx, car.vz) || 1;
      const hw = HALF_W * (1 + 1.4 * Math.min(1, Math.abs(car.vl) / sp));
      const px = (car.vz / sp) * hw, pz = (-car.vx / sp) * hw;
      const p = { x, y, z, lx: x - px, lz: z - pz, rx: x + px, rz: z + pz };
      if (last && Math.hypot(x - last.x, z - last.z) < 3) this.segment(last, p, car.skid, Math.abs(n.lat) < 6.4);
      this.wheels[w] = p;
    }
    if (this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.dirty = false;
    }
  }

  segment(a, b, k, road) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos.set([a.lx, a.y, a.lz, a.rx, a.y, a.rz, b.lx, b.y, b.lz, b.rx, b.y, b.rz], i * 12);
    const c = road ? [0.05, 0.05, 0.05, 0.25 + 0.4 * k] : [0.45, 0.3, 0.19, 0.3 + 0.3 * k];
    for (let v = 0; v < 4; v++) this.col.set(c, i * 16 + v * 4);
    this.dirty = true;
  }

  clear() {
    this.col.fill(0);
    this.wheels = [null, null];
    this.dirty = true;
  }
}
