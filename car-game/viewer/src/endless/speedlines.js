import * as THREE from 'three';

// Wind streaks: short additive lines parked in the air around the road ahead. They sit
// still in the world, so passing them at speed is what sells it; each is stretched along
// the car's velocity and fades in above ~140 km/h. Recycled once they fall behind.

const N = 90;

export class SpeedLines {
  constructor(scene) {
    this.pts = new Float32Array(N * 3);
    this.pos = new Float32Array(N * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.seeded = false;
  }

  spawn(k, car, ahead) {
    const sp = Math.hypot(car.vx, car.vz) || 1;
    const fx = car.vx / sp, fz = car.vz / sp;
    const side = Math.random() < 0.5 ? -1 : 1;
    const lat = side * (2.5 + Math.random() * 9), up = 0.4 + Math.random() * 5.5;
    const d = ahead ? 25 + Math.random() * 70 : -5 + Math.random() * 95;
    this.pts[k * 3] = car.x + fx * d + fz * lat;
    this.pts[k * 3 + 1] = car.y + up;
    this.pts[k * 3 + 2] = car.z + fz * d - fx * lat;
  }

  update(dt, car, boosting) {
    const sp = Math.hypot(car.vx, car.vz);
    const target = Math.min(1, Math.max(0, (sp - 38) / 9)) * (boosting ? 0.85 : 0.45);
    this.mat.opacity += (target - this.mat.opacity) * Math.min(1, dt * 4);
    this.lines.visible = this.mat.opacity > 0.01;
    if (!this.lines.visible) { this.seeded = false; return; }
    if (!this.seeded) { for (let k = 0; k < N; k++) this.spawn(k, car, false); this.seeded = true; }
    const fx = car.vx / (sp || 1), fz = car.vz / (sp || 1);
    const len = sp * (boosting ? 0.14 : 0.09);
    for (let k = 0; k < N; k++) {
      const x = this.pts[k * 3], y = this.pts[k * 3 + 1], z = this.pts[k * 3 + 2];
      if ((x - car.x) * fx + (z - car.z) * fz < -6) { this.spawn(k, car, true); k--; continue; }
      this.pos.set([x, y, z, x - fx * len, y, z - fz * len], k * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
