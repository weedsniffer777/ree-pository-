import * as THREE from 'three';

// Pooled soft particles for kicked-up sand and tyre smoke.
export class Dust {
  constructor(max = 700) {
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
      const damp = Math.exp(-dt * 1.6);
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

// Nitro flames out of the four rear tailpipes.
export function addFlames(model) {
  const outer = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const geoO = new THREE.ConeGeometry(0.06, 0.75, 10, 1, true).translate(0, 0.375, 0).rotateX(-Math.PI / 2);
  const geoI = new THREE.ConeGeometry(0.03, 0.35, 8, 1, true).translate(0, 0.175, 0).rotateX(-Math.PI / 2);
  const group = new THREE.Group();
  for (const s of [-1, 1]) {
    for (const x of [0.36, 0.46]) {
      const f = new THREE.Group();
      f.position.set(s * x, 0.175, -2.41);
      f.add(new THREE.Mesh(geoO, outer), new THREE.Mesh(geoI, inner));
      group.add(f);
    }
  }
  group.visible = false;
  model.add(group);
  return {
    update(on) {
      group.visible = on;
      if (!on) return;
      for (const f of group.children) {
        const s = 0.7 + Math.random() * 0.7;
        f.scale.set(1 + Math.random() * 0.3, 1 + Math.random() * 0.3, s);
      }
    },
  };
}
