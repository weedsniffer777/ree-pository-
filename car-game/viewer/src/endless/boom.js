import * as THREE from 'three';

// Explosions and flying bits. A blast is noise-deformed 3D lobes in two kinds. Fire lobes
// flash white-hot, swell, and burn out fast from their thin edges inward while cooling
// through yellow / orange / red (they never turn into cloud). Smoke lobes are separate:
// dark, sun-lit, they roll upward, billow, and fade out softly over seconds. Plus an
// anamorphic flare on the first instant and a shared flash light (made up front so the
// light count never changes). Bits: an instanced pool of small rigid pieces.

const NOISE = `
vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);} vec4 tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=m289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;
const VS = NOISE + `
uniform float t, seed, mode;
varying float vN; varying vec3 vNorm; varying vec3 vW;
void main(){
  vec3 p = position;
  float sp = mode > 0.5 ? 0.45 : 1.2; // smoke churns slowly
  float n = snoise(p * 1.4 + vec3(seed, seed * 1.7, t * sp * 3.0)) * 0.5 + snoise(p * 3.1 + vec3(seed * 2.3, t * sp * 5.0, 0.)) * 0.22;
  vN = n;
  p *= 1.0 + n * 0.55;
  vNorm = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = `
uniform float t, heat, mode; uniform vec3 sun;
varying float vN; varying vec3 vNorm; varying vec3 vW;
vec3 ramp(float h){
  vec3 c = vec3(0.32, 0.04, 0.01);
  c = mix(c, vec3(1.0, 0.36, 0.05), smoothstep(0.2, 0.42, h));
  c = mix(c, vec3(1.0, 0.78, 0.25), smoothstep(0.42, 0.66, h));
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.7, 0.9, h));
  return c;
}
void main(){
  vec3 n = normalize(vNorm), v = normalize(cameraPosition - vW);
  float facing = abs(dot(n, v));
  if (mode < 0.5) {
    // fire: cools from the edges in, and whatever has cooled is simply gone
    float h = heat * (1.0 - t * 1.2) + vN * 0.45 + facing * 0.25;
    if (h < 0.32) discard; // the dull red fizzle is cut short
    vec3 c = ramp(clamp(h, 0.0, 1.0));
    gl_FragColor = vec4(c * (1.3 + smoothstep(0.3, 0.9, h) * 2.4), 1.0);
  } else {
    // smoke: dark, lit from the sun, soft-edged, fading out slowly as it rises
    float lit = 0.3 + 0.7 * max(dot(n, normalize(sun)), 0.0);
    vec3 c = vec3(0.028, 0.026, 0.025) * (0.6 + lit * 0.9) + vec3(0.22, 0.06, 0.015) * heat * max(0.0, 1.0 - t * 6.0);
    float a = (0.62 + vN * 0.45) * smoothstep(0.0, 0.5, facing) * smoothstep(0.0, 0.05, t) * pow(1.0 - t, 0.85) * 0.97;
    gl_FragColor = vec4(c, a);
  }
}`;

export class Booms {
  static thin = 1; // share of smoke lobes (graphics preset)
  constructor(scene, { dust, sparks, max = 96, sun = new THREE.Vector3(0.4, 1, 0.3) }) {
    Object.assign(this, { dust, sparks });
    const geo = new THREE.IcosahedronGeometry(1, 4);
    this.items = [];
    for (let k = 0; k < max; k++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, seed: { value: Math.random() * 50 }, heat: { value: 1 }, mode: { value: 0 }, sun: { value: sun } }, vertexShader: VS, fragmentShader: FS, transparent: true });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.items.push({ m, t: 0, life: 0, size: 1, grow: 1, v: new THREE.Vector3(), stretch: new THREE.Vector3(1, 1, 1) });
    }
    this.next = 0;
    this.light = new THREE.PointLight(0xffa050, 0, 45, 2);
    scene.add(this.light);
    // anamorphic flare for the first instant: a hot core with a long horizontal streak
    const fc = document.createElement('canvas');
    fc.width = 512; fc.height = 128;
    const g = fc.getContext('2d');
    const st = g.createLinearGradient(0, 0, 512, 0);
    st.addColorStop(0, 'rgba(255,160,80,0)'); st.addColorStop(0.5, 'rgba(255,235,200,0.9)'); st.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = st; g.fillRect(0, 60, 512, 8);
    const gl = g.createRadialGradient(256, 64, 0, 256, 64, 64);
    gl.addColorStop(0, 'rgba(255,255,245,1)'); gl.addColorStop(0.3, 'rgba(255,200,120,0.55)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl; g.fillRect(192, 0, 128, 128);
    this.flares = [0, 1].map(() => {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
      f.visible = false;
      f.renderOrder = 10;
      scene.add(f);
      return { f, t: 0, life: 0, size: 1 };
    });
  }
  // one lobe: heat 1 = white-hot core, ~0.35 = sooty smoke
  puff(x, y, z, size, life, heat, v, delay = 0, smoke = false) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.m.position.set(x, y, z);
    it.v.copy(v);
    it.smoke = smoke;
    it.m.material.uniforms.heat.value = heat;
    it.m.material.uniforms.mode.value = smoke ? 1 : 0;
    it.m.material.depthWrite = !smoke;
    it.m.renderOrder = smoke ? 2 : 0;
    it.m.material.uniforms.seed.value = Math.random() * 50;
    it.stretch.set(0.8 + Math.random() * 0.5, 0.75 + Math.random() * 0.6, 0.8 + Math.random() * 0.5);
    it.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    Object.assign(it, { t: -delay, life, size });
    it.m.visible = false;
  }
  // small: a crit pop. big: a car going up (fireball cluster, then a rolling smoke column)
  blast(p, vel, big = false) {
    const keep = big ? 0.7 : 0.85, tv = new THREE.Vector3();
    const lobes = big ? 9 : 3;
    for (let k = 0; k < lobes; k++) {
      const core = k < (big ? 3 : 1);
      const a = Math.random() * Math.PI * 2, r = core ? Math.random() * 0.6 : (big ? 1.2 : 0.4) + Math.random() * (big ? 2.2 : 0.7);
      tv.set(vel.x * keep + Math.cos(a) * r * 2.2, (core ? 2 : 3.5) + Math.random() * (big ? 6 : 2.5), vel.z * keep + Math.sin(a) * r * 2.2);
      const size = (big ? (core ? 2.6 : 1.7 + Math.random() * 1.6) : (core ? 1.1 : 0.6 + Math.random() * 0.5));
      // fire is brief: it flares and burns out well inside a second
      this.puff(p.x + Math.cos(a) * r, p.y + 0.3 + Math.random() * (big ? 1.2 : 0.4), p.z + Math.sin(a) * r, size, (big ? 0.75 : 0.4) * (0.8 + Math.random() * 0.45), core ? 1.05 : 0.85 + Math.random() * 0.15, tv, core ? 0 : Math.random() * (big ? 0.1 : 0.03));
    }
    // black smoke rolls up out of the fire and hangs, fading slowly
    const smokes = Math.max(1, Math.round((big ? 11 : 3) * Booms.thin)), grow = 1 + (1 - Booms.thin) * 0.4; // fewer, bigger on lighter presets
    for (let k = 0; k < smokes; k++) {
      tv.set(vel.x * (big ? 0.3 : 0.5) + (Math.random() - 0.5) * 2, (big ? 3 : 2) + Math.random() * 2.5, vel.z * (big ? 0.3 : 0.5) + (Math.random() - 0.5) * 2);
      this.puff(p.x + (Math.random() - 0.5) * (big ? 2.5 : 0.8), p.y + (big ? 1.2 + k * 0.45 : 0.8), p.z + (Math.random() - 0.5) * (big ? 2.5 : 0.8),
        (big ? 2.0 + Math.random() * 1.8 : 0.9 + Math.random() * 0.5) * grow, big ? 8 + Math.random() * 4 : 3.5 + Math.random() * 1.5, 1, tv, (big ? 0.12 : 0.08) + k * (big ? 0.05 : 0.04), true);
    }
    for (const [k, f] of this.flares.entries()) {
      if (!big && k) break;
      f.f.position.set(p.x, p.y + 1, p.z);
      Object.assign(f, { t: 0, life: big ? 0.28 : 0.14, size: (big ? 26 : 9) * (k ? 0.55 : 1) });
      f.f.material.rotation = k ? Math.PI / 2 : 0;
    }
    const sp = big ? 50 : 14;
    for (let k = 0; k < sp; k++) this.sparks.emit(p.x, p.y + 0.4, p.z, vel.x * keep + (Math.random() - 0.5) * (big ? 32 : 14), 2 + Math.random() * (big ? 16 : 6), vel.z * keep + (Math.random() - 0.5) * (big ? 32 : 14), big ? 0.16 : 0.11, 0.3 + Math.random() * 0.5, 1.0, 0.85, 0.45);
    this.light.position.set(p.x, p.y + 1.5, p.z);
    this.light.intensity = Math.max(this.light.intensity, big ? 220 : 40);
  }
  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 380);
    for (const f of this.flares) {
      if (f.life <= 0) continue;
      f.t += dt;
      const u = f.t / f.life;
      if (u >= 1) { f.life = 0; f.f.visible = false; continue; }
      f.f.visible = true;
      f.f.scale.set(f.size * (1 + u * 0.4), f.size * 0.25 * (1 + u * 0.4), 1);
      f.f.material.opacity = (1 - u) ** 2;
    }
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.t += dt;
      if (it.t < 0) continue;
      const u = it.t / it.life;
      if (u >= 1) { it.life = 0; it.m.visible = false; continue; }
      it.m.visible = true;
      it.m.material.uniforms.t.value = u;
      it.m.position.addScaledVector(it.v, dt);
      it.v.multiplyScalar(Math.exp(-dt * (it.smoke ? 1.2 : 2.6)));
      it.v.y += dt * (it.smoke ? 0.45 : 1.2); // hot air keeps rising; smoke drifts up slowly
      // fire: violent swell then hold while it burns out; smoke: steady billow outward
      const sc = it.size * (it.smoke ? 0.45 + Math.sqrt(u) * 1.9 : u < 0.15 ? 0.3 + (u / 0.15) * 0.7 : 1 + (u - 0.15) * 0.35);
      it.m.scale.set(sc * it.stretch.x, sc * it.stretch.y, sc * it.stretch.z);
      it.m.rotation.y += dt * 0.6;
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
      // half-height of the rotated box along world up, so tumbled pieces rest on their face
      const { x: qx, y: qy, z: qz, w: qw } = it.q;
      const r10 = 2 * (qx * qy + qz * qw), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qx * qw);
      const gy = this.height(it.p.x, it.p.z) + 0.5 * (Math.abs(r10) * it.s.x + Math.abs(r11) * it.s.y + Math.abs(r12) * it.s.z);
      if (it.p.y < gy) {
        it.p.y = gy;
        if (it.v.y < -2) { it.v.y *= -this.bounce; it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6); } else { it.v.y = 0; it.v.x *= Math.exp(-dt * 5); it.v.z *= Math.exp(-dt * 5); it.w.multiplyScalar(Math.exp(-dt * 6)); }
      }
      this.dq.setFromEuler(this.e.set(it.w.x * dt, it.w.y * dt, it.w.z * dt));
      it.q.multiply(this.dq);
      const fade = Math.min(1, (it.life - it.t) / 0.6);
      this.m.compose(it.p, it.q, this.sv.copy(it.s).multiplyScalar(fade));
      this.mesh.setMatrixAt(k, this.m);
      if (it.burn && onBurn && Math.random() < dt * 24) onBurn(it.p, it.t / it.life);
    }
    this.mesh.count = Math.max(n, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Line sparks: hot streaks, not puffs. Each is a short segment from where it is back along
// its velocity (faster = longer), white-yellow cooling to orange as it dies, falling under
// gravity, drawn additively so they glow. emit() keeps the Dust signature (size ignored).
export class LineSparks {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    scene.add(this.lines);
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.t = new Float32Array(max);
    this.next = 0;
  }
  emit(x, y, z, vx, vy, vz, size, life) {
    const k = this.next;
    this.next = (this.next + 1) % this.max;
    this.p.set([x, y, z], k * 3);
    this.v.set([vx, vy, vz], k * 3);
    this.life[k] = Math.max(0.12, life);
    this.t[k] = 0;
  }
  // a spray from a point: n streaks around `dir` (vx,vy,vz base velocity) with scatter
  burst(x, y, z, bx, by, bz, n, scatter = 8, up = 3) {
    for (let k = 0; k < n; k++) this.emit(x, y, z, bx + (Math.random() - 0.5) * scatter, by + Math.random() * up, bz + (Math.random() - 0.5) * scatter, 0, 0.18 + Math.random() * 0.35);
  }
  update(dt) {
    const P = this.p, V = this.v, pos = this.pos, col = this.col;
    for (let k = 0; k < this.max; k++) {
      const o = k * 6;
      if (this.life[k] <= 0) { pos[o + 3] = pos[o]; pos[o + 4] = pos[o + 1]; pos[o + 5] = pos[o + 2]; col.fill(0, o, o + 6); continue; }
      this.t[k] += dt;
      const u = this.t[k] / this.life[k];
      if (u >= 1) { this.life[k] = 0; col.fill(0, o, o + 6); continue; }
      const i = k * 3;
      V[i + 1] -= 18 * dt;
      const drag = Math.exp(-dt * 1.5);
      V[i] *= drag; V[i + 2] *= drag;
      P[i] += V[i] * dt; P[i + 1] += V[i + 1] * dt; P[i + 2] += V[i + 2] * dt;
      const L = 0.03; // streak = 30 ms of travel
      pos[o] = P[i]; pos[o + 1] = P[i + 1]; pos[o + 2] = P[i + 2];
      pos[o + 3] = P[i] - V[i] * L; pos[o + 4] = P[i + 1] - V[i + 1] * L; pos[o + 5] = P[i + 2] - V[i + 2] * L;
      const b = (1 - u) ** 1.3 * 1.6; // glow fades as it cools
      const r = b, g = b * (0.95 - u * 0.55), bl = b * (0.7 - u * 0.65);
      col[o] = r; col[o + 1] = g; col[o + 2] = Math.max(0, bl);
      col[o + 3] = r * 0.5; col[o + 4] = g * 0.35; col[o + 5] = Math.max(0, bl) * 0.2; // tail dimmer and redder
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
