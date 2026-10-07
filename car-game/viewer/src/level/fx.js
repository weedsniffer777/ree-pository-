import * as THREE from 'three';

// Pooled soft particles for kicked-up sand and tyre smoke.
export class Dust {
  constructor(max = 700, { additive = false, fade = 1.6 } = {}) {
    this.fade = fade;
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.tint = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('alpha', dyn(this.alpha, 1));
    geo.setAttribute('size', dyn(this.size, 1));
    geo.setAttribute('tint', dyn(this.tint, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: innerHeight / 1.2 } },
      vertexShader: `
        attribute float alpha; attribute float size; attribute vec3 tint;
        uniform float scale; varying float vA; varying vec3 vC;
        void main() {
          vA = alpha; vC = tint;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, r) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  emit(x, y, z, vx, vy, vz, size, life, r, g, b) {
    const k = this.next;
    this.next = (k + 1) % this.max;
    this.pos.set([x, y, z], k * 3);
    this.vel.set([vx, vy, vz], k * 3);
    this.tint.set([r, g, b], k * 3);
    this.life[k] = this.maxLife[k] = life;
    this.size0[k] = size;
  }

  update(dt) {
    for (let k = 0; k < this.max; k++) {
      if (this.life[k] <= 0) { this.alpha[k] = 0; continue; }
      this.life[k] -= dt;
      const t = 1 - Math.max(0, this.life[k]) / this.maxLife[k];
      const damp = Math.exp(-dt * this.fade);
      for (let a = 0; a < 3; a++) {
        this.vel[k * 3 + a] *= damp;
        this.pos[k * 3 + a] += this.vel[k * 3 + a] * dt;
      }
      this.vel[k * 3 + 1] += 0.35 * dt;
      this.alpha[k] = 0.5 * (1 - t) * Math.min(1, t * 8);
      this.size[k] = this.size0[k] * (1 + t * 2.4);
    }
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = at.alpha.needsUpdate = at.size.needsUpdate = at.tint.needsUpdate = true;
  }

  resize() {
    this.mat.uniforms.scale.value = innerHeight / 1.2;
  }
}

// Nitro exhaust: per tailpipe three nested, noise-flickered additive plumes (blue-white
// core, yellow-orange body, long red-orange tail) plus a hot glow at the pipe mouth,
// a point light washing the bumper, embers and a smoke puff when the boost kicks in.
const FLAME_VS = `
  uniform float time, len, seed, stretch;
  varying float vT;
  void main() {
    vec3 p = position;
    float t = clamp(-p.z / len, 0.0, 1.0);
    vT = t;
    p.z *= stretch;
    float w = t * t;
    p.x += (sin(time * 41.0 + t * 13.0 + seed) * 0.018 + sin(time * 23.0 + seed * 3.1) * 0.01) * w;
    p.y += (cos(time * 37.0 + t * 11.0 + seed * 1.7) * 0.016) * w;
    p.xy *= 1.0 + 0.35 * t * (0.5 + 0.5 * sin(time * 53.0 + seed));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FLAME_FS = `
  uniform vec3 cA, cB;
  uniform float opacity, time, seed;
  varying float vT;
  void main() {
    float flick = 0.72 + 0.28 * sin(time * 67.0 + vT * 22.0 + seed) * sin(time * 29.0 + seed * 2.3);
    float a = pow(1.0 - vT, 1.7) * smoothstep(0.0, 0.06, vT + 0.02) * opacity * flick;
    vec3 c = mix(cA, cB, smoothstep(0.0, 0.85, vT));
    gl_FragColor = vec4(c, a);
  }`;

export function addFlames(model) {
  const layers = [
    { r: 0.034, len: 0.32, a: 0xf2f6ff, b: 0x6fb6ff, op: 1.0 },
    { r: 0.056, len: 0.7, a: 0xfff0b0, b: 0xff7a14, op: 0.85 },
    { r: 0.08, len: 1.25, a: 0xff8a20, b: 0xa8200a, op: 0.45 },
  ];
  const mats = [];
  const geos = layers.map((l) => new THREE.CylinderGeometry(0, l.r, l.len, 12, 6, true).translate(0, l.len / 2, 0).rotateX(-Math.PI / 2));
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,150,50,0.6)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const group = new THREE.Group();
  const pipes = [];
  for (const s of [-1, 1]) {
    for (const x of [0.36, 0.46]) {
      const f = new THREE.Group();
      f.position.set(s * x, 0.175, -2.41);
      layers.forEach((l, k) => {
        const m = new THREE.ShaderMaterial({
          uniforms: { time: { value: 0 }, len: { value: l.len }, seed: { value: Math.random() * 10 }, stretch: { value: 1 }, opacity: { value: l.op }, cA: { value: new THREE.Color(l.a) }, cB: { value: new THREE.Color(l.b) } },
          vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        mats.push(m);
        f.add(new THREE.Mesh(geos[k], m));
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(0.28);
      glow.position.z = -0.03;
      f.add(glow);
      group.add(f);
      pipes.push(f);
    }
  }
  const light = new THREE.PointLight(0xff8a3a, 0, 7, 2);
  light.position.set(0, 0.45, -2.9);
  model.add(light);
  group.visible = false;
  model.add(group);
  let ramp = 0, t = 0, wasOn = false;
  const tmp = new THREE.Vector3();
  return {
    pipes,
    // returns true on the frame the boost starts (for a smoke puff)
    update(on, dt, speed, embers) {
      t += dt;
      ramp += ((on ? 1 : 0) - ramp) * Math.min(1, dt * (on ? 14 : 9));
      group.visible = ramp > 0.03;
      light.intensity = ramp * (5 + Math.random() * 3);
      const started = on && !wasOn;
      wasOn = on;
      if (!group.visible) return started;
      const stretch = ramp * (0.75 + Math.min(speed, 50) / 70) * (started ? 1.6 : 1);
      for (const m of mats) { m.uniforms.time.value = t; m.uniforms.stretch.value = stretch * (0.85 + Math.random() * 0.3); }
      for (const f of pipes) f.children[3].scale.setScalar(0.24 + Math.random() * 0.1 * ramp);
      if (embers && on && Math.random() < 0.6) {
        const f = pipes[Math.floor(Math.random() * pipes.length)];
        f.getWorldPosition(tmp);
        embers.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.07, 0.25 + Math.random() * 0.3, 1.0, 0.55, 0.15);
      }
      return started;
    },
  };
}
