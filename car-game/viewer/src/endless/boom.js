import * as THREE from 'three';

// Explosions and flying bits, drawn comic-book style: hard-edged spiky bursts in flat
// white/yellow/orange/red with a black ink outline, lumpy cartoon clouds that flash from
// fire to sooty smoke and shrink away instead of fading, and an ink shockwave ring. One
// shared flash light (created up front so the light count never changes). Bits: an
// instanced pool of small rigid pieces (debris, shell casings, belt links).

const ink = '#120d0b';
function burstTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  g.translate(128, 128);
  g.lineJoin = 'miter';
  const spikes = 9 + Math.floor(rnd() * 4), lens = Array.from({ length: spikes }, () => 0.7 + rnd() * 0.3);
  const star = (R, inner) => {
    g.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2, rr = k % 2 ? R * inner : R * lens[k >> 1];
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  };
  star(118, 0.5); g.fillStyle = ink; g.fill();
  star(108, 0.5); g.fillStyle = '#d8261a'; g.fill();
  star(84, 0.52); g.fillStyle = '#ff8a1c'; g.fill();
  star(58, 0.55); g.fillStyle = '#ffd43a'; g.fill();
  star(32, 0.6); g.fillStyle = '#fffbe6'; g.fill();
  return new THREE.CanvasTexture(c);
}
// a cartoon cloud: overlapping lobes, flat fill, one darker shade on the underside, ink rim
function cloudTexture(seed, fill, shade) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const lobes = [[128, 128, 62]];
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + rnd() * 0.5, d = 44 + rnd() * 14; lobes.push([128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 30 + rnd() * 16]); }
  const blob = (grow, dy = 0) => { g.beginPath(); for (const [x, y, rr] of lobes) { g.moveTo(x + rr + grow, y + dy); g.arc(x, y + dy, rr + grow, 0, Math.PI * 2); } };
  blob(7); g.fillStyle = ink; g.fill();
  blob(0); g.fillStyle = shade; g.fill();
  g.save(); blob(0); g.clip();
  g.beginPath(); for (const [x, y, rr] of lobes) { g.moveTo(x - 6 + rr, y - 9); g.arc(x - 6, y - 9, rr * 0.86, 0, Math.PI * 2); } g.fillStyle = fill; g.fill();
  g.beginPath(); g.arc(104, 96, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill(); // highlight
  g.restore();
  return new THREE.CanvasTexture(c);
}
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.lineWidth = 14; g.strokeStyle = ink; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 7; g.strokeStyle = '#fff3c8'; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

export class Booms {
  constructor(scene, { dust, sparks, max = 64 }) {
    Object.assign(this, { dust, sparks });
    this.tex = {
      burst: [burstTexture(11), burstTexture(29), burstTexture(47)],
      fire: [cloudTexture(5, '#ffb52e', '#e2541c'), cloudTexture(9, '#ffd04a', '#f07a1c')],
      smoke: [cloudTexture(13, '#5a5450', '#2e2a28'), cloudTexture(17, '#6b6460', '#3a3533')],
      ring: [ringTexture()],
    };
    this.items = [];
    for (let k = 0; k < max; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.burst[0], transparent: true, alphaTest: 0.5, depthWrite: false }));
      s.visible = false;
      s.frustumCulled = false;
      s.renderOrder = 3;
      scene.add(s);
      this.items.push({ s, t: 0, life: 0, size: 1, kind: 'burst', v: new THREE.Vector3(), spin: 0 });
    }
    this.next = 0;
    this.light = new THREE.PointLight(0xff8a3a, 0, 40, 2);
    scene.add(this.light);
  }
  spawn(kind, x, y, z, size, life, v = null, delay = 0) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const set = this.tex[kind === 'fireball' ? 'fire' : kind];
    it.s.material.map = set[Math.floor(Math.random() * set.length)];
    it.s.material.rotation = Math.random() * Math.PI * 2;
    it.s.position.set(x, y, z);
    it.v.set(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0);
    Object.assign(it, { kind, t: -delay, life, size, spin: (Math.random() - 0.5) * 2, swapped: false });
    it.s.visible = false;
  }
  // small: a crit pop. big: a car going up.
  blast(p, vel, big = false) {
    const keep = big ? 0.75 : 0.9, R = big ? 2.2 : 0.6, tv = new THREE.Vector3();
    this.spawn('burst', p.x, p.y + (big ? 1 : 0.3), p.z, big ? 9 : 3.2, big ? 0.22 : 0.14, tv.set(vel.x * keep, 0, vel.z * keep));
    if (big) this.spawn('burst', p.x, p.y + 1.6, p.z, 6.5, 0.3, tv, 0.08);
    this.spawn('ring', p.x, p.y + 0.6, p.z, big ? 14 : 4.5, big ? 0.35 : 0.2, tv);
    const n = big ? 12 : 4;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * R;
      tv.set(vel.x * keep + Math.cos(a) * (big ? 4 : 2), 2 + Math.random() * (big ? 5 : 2.5), vel.z * keep + Math.sin(a) * (big ? 4 : 2));
      this.spawn('fireball', p.x + Math.cos(a) * r, p.y + 0.4 + Math.random() * R * 0.5, p.z + Math.sin(a) * r, (big ? 4.2 : 1.7) * (0.7 + Math.random() * 0.6), (big ? 1.5 : 0.7) * (0.75 + Math.random() * 0.5), tv, Math.random() * (big ? 0.18 : 0.05));
    }
    if (big) for (let k = 0; k < 6; k++) {
      tv.set(vel.x * 0.4 + (Math.random() - 0.5) * 3, 3 + Math.random() * 3, vel.z * 0.4 + (Math.random() - 0.5) * 3);
      this.spawn('smoke', p.x + (Math.random() - 0.5) * 3, p.y + 2 + Math.random() * 2, p.z + (Math.random() - 0.5) * 3, 4.5 + Math.random() * 2.5, 2.2 + Math.random(), tv, 0.25 + Math.random() * 0.3);
    }
    const sp = big ? 40 : 12;
    for (let k = 0; k < sp; k++) this.sparks.emit(p.x, p.y + 0.4, p.z, vel.x * keep + (Math.random() - 0.5) * (big ? 30 : 14), 2 + Math.random() * (big ? 14 : 6), vel.z * keep + (Math.random() - 0.5) * (big ? 30 : 14), big ? 0.18 : 0.12, 0.3 + Math.random() * 0.4, 1.0, 0.85, 0.4);
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
      it.v.multiplyScalar(Math.exp(-dt * 3));
      it.s.material.rotation += it.spin * dt;
      let sc;
      if (it.kind === 'burst') sc = u < 0.3 ? 0.5 + (u / 0.3) * 0.6 : 1.1 * (1 - (u - 0.3) / 0.7); // punch out, then collapse
      else if (it.kind === 'ring') { sc = 0.2 + u * 0.9; it.s.material.opacity = 1 - u; }
      else {
        // clouds pop up, hang, then shrink to nothing; fire turns to soot halfway
        sc = u < 0.15 ? 0.4 + (u / 0.15) * 0.6 : u < 0.55 ? 1 + (u - 0.15) * 0.3 : 1.12 * (1 - (u - 0.55) / 0.45);
        if (it.kind === 'fireball' && !it.swapped && u > 0.45) { it.swapped = true; it.s.material.map = this.tex.smoke[Math.floor(Math.random() * 2)]; }
        it.v.y += dt * 1.5;
      }
      if (it.kind !== 'ring') it.s.material.opacity = 1;
      it.s.scale.setScalar(Math.max(0.01, it.size * sc));
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
