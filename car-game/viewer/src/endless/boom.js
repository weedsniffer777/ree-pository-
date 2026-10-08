import * as THREE from 'three';

// Explosions and flying bits. Booms: additive fireball sprites that swell and fade, one
// shared flash light (created up front so the light count never changes). Bits: an
// instanced pool of small rigid pieces (debris, shell casings, belt links) that fly with
// gravity, tumble, skip off the ground and shrink away.

function fireTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,220,1)');
  gr.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  gr.addColorStop(0.55, 'rgba(255,110,30,0.6)');
  gr.addColorStop(0.8, 'rgba(160,40,10,0.18)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Booms {
  constructor(scene, { dust, sparks, max = 48 }) {
    Object.assign(this, { dust, sparks });
    const tex = fireTexture();
    this.items = [];
    for (let k = 0; k < max; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      s.frustumCulled = false;
      scene.add(s);
      this.items.push({ s, t: 0, life: 0, s0: 1, s1: 2, v: new THREE.Vector3() });
    }
    this.next = 0;
    this.light = new THREE.PointLight(0xff8a3a, 0, 40, 2);
    scene.add(this.light);
  }
  ball(x, y, z, size, life, vx = 0, vy = 0, vz = 0, delay = 0) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.s.position.set(x, y, z);
    it.v.set(vx, vy, vz);
    Object.assign(it, { t: -delay, life, s0: size * 0.4, s1: size });
    it.s.material.rotation = Math.random() * Math.PI * 2;
    it.s.visible = false;
  }
  // small: a hit pop. big: a car going up.
  blast(p, vel, big = false) {
    const n = big ? 11 : 3, R = big ? 2.4 : 0.7, keep = big ? 0.75 : 0.9;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * R;
      this.ball(p.x + Math.cos(a) * r, p.y + Math.random() * R * 0.6, p.z + Math.sin(a) * r,
        (big ? 5.5 : 2.2) * (0.6 + Math.random() * 0.6), (big ? 0.75 : 0.32) * (0.7 + Math.random() * 0.6),
        vel.x * keep, 1 + Math.random() * (big ? 4 : 1.5), vel.z * keep, k ? Math.random() * (big ? 0.25 : 0.06) : 0);
    }
    const sp = big ? 46 : 14;
    for (let k = 0; k < sp; k++) this.sparks.emit(p.x, p.y + 0.4, p.z, vel.x * keep + (Math.random() - 0.5) * (big ? 26 : 12), 2 + Math.random() * (big ? 14 : 6), vel.z * keep + (Math.random() - 0.5) * (big ? 26 : 12), big ? 0.16 : 0.1, 0.35 + Math.random() * 0.5, 1.0, 0.7, 0.3);
    const sm = big ? 16 : 4;
    for (let k = 0; k < sm; k++) this.dust.emit(p.x + (Math.random() - 0.5) * R, p.y + 0.6, p.z + (Math.random() - 0.5) * R, vel.x * 0.5 + (Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, vel.z * 0.5 + (Math.random() - 0.5) * 4, big ? 3.2 + Math.random() * 2 : 1.4, big ? 2.6 + Math.random() * 1.5 : 1.2, 0.12, 0.11, 0.1);
    this.light.position.set(p.x, p.y + 1.5, p.z);
    this.light.intensity = Math.max(this.light.intensity, big ? 160 : 30);
  }
  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 360);
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.t += dt;
      if (it.t < 0) continue;
      const u = it.t / it.life;
      if (u >= 1) { it.life = 0; it.s.visible = false; continue; }
      it.s.visible = true;
      it.s.position.addScaledVector(it.v, dt);
      it.v.multiplyScalar(Math.exp(-dt * 2.5));
      it.s.scale.setScalar(it.s0 + (it.s1 - it.s0) * Math.sqrt(u));
      it.s.material.opacity = (1 - u) ** 1.5;
    }
  }
}

export class Bits {
  // geometry per piece, material (vertexColors via instanceColor when colored)
  constructor(scene, geo, mat, { max = 160, height, bounce = 0.35, shadow = false } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.items = [];
    for (let k = 0; k < max; k++) this.items.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), life: 0, t: 0, burn: false });
    Object.assign(this, { height, bounce, next: 0, m: new THREE.Matrix4(), dq: new THREE.Quaternion(), e: new THREE.Euler(), col: new THREE.Color(), sv: new THREE.Vector3() });
  }
  spawn(p, v, { size = [1, 1, 1], life = 3, spin = 10, color = null, burn = false } = {}) {
    const it = this.items[this.next];
    const k = this.next;
    this.next = (this.next + 1) % this.items.length;
    it.p.copy(p); it.v.copy(v);
    it.q.setFromEuler(this.e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    it.w.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    it.s.set(...size);
    Object.assign(it, { life, t: 0, burn });
    if (color !== null) { this.col.set(color); this.mesh.setColorAt(k, this.col); this.mesh.instanceColor.needsUpdate = true; }
  }
  update(dt, onBurn) {
    let n = 0;
    for (let k = 0; k < this.items.length; k++) {
      const it = this.items[k];
      if (it.life <= 0) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(k, this.m); continue; }
      it.t += dt;
      if (it.t >= it.life) { it.life = 0; this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(k, this.m); continue; }
      n = k + 1;
      it.v.y -= 24 * dt;
      it.p.addScaledVector(it.v, dt);
      const gy = this.height(it.p.x, it.p.z) + it.s.y * 0.5;
      if (it.p.y < gy) {
        it.p.y = gy;
        if (it.v.y < -2) { it.v.y *= -this.bounce; it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6); } else { it.v.y = 0; it.v.x *= Math.exp(-dt * 5); it.v.z *= Math.exp(-dt * 5); it.w.multiplyScalar(Math.exp(-dt * 6)); }
      }
      this.dq.setFromEuler(this.e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
      it.q.multiply(this.dq);
      const fade = Math.min(1, (it.life - it.t) / 0.6);
      this.m.compose(it.p, it.q, this.sv.copy(it.s).multiplyScalar(fade));
      this.mesh.setMatrixAt(k, this.m);
      if (it.burn && onBurn && Math.random() < dt * 9) onBurn(it.p, it.t / it.life);
    }
    this.mesh.count = Math.max(n, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
