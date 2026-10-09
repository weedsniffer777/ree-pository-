import * as THREE from 'three';

// Explosions and flying bits. Each blast is a cluster of noise-deformed 3D puffs: lumpy,
// uneven lobes that start white-hot, cool through yellow / orange / deep red into dark,
// sun-lit smoke, roll upward and erode away. Cores are small and fierce, the outer lobes
// and the smoke column big and slow, so no blast reads as one even ball. One shared flash
// light (made up front so the light count never changes). Bits: an instanced pool of small
// rigid pieces (debris, shell casings, belt links).

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
uniform float t, seed;
varying float vN; varying vec3 vNorm; varying vec3 vW;
void main(){
  vec3 p = position;
  float n = snoise(p * 1.4 + vec3(seed, seed * 1.7, t * 1.2)) * 0.5 + snoise(p * 3.1 + vec3(seed * 2.3, t * 2.0, 0.)) * 0.22;
  vN = n;
  p *= 1.0 + n * 0.55;
  vNorm = normalize(normalMatrix * normal);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = `
uniform float t, heat; uniform vec3 sun;
varying float vN; varying vec3 vNorm; varying vec3 vW;
vec3 ramp(float h){
  vec3 smoke = vec3(0.09, 0.085, 0.08);
  vec3 c = mix(smoke, vec3(0.45, 0.07, 0.02), smoothstep(0.08, 0.25, h));
  c = mix(c, vec3(1.0, 0.36, 0.05), smoothstep(0.25, 0.45, h));
  c = mix(c, vec3(1.0, 0.78, 0.25), smoothstep(0.45, 0.68, h));
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.7, 0.9, h));
  return c;
}
void main(){
  // dissolve from the thin edges in as the puff ages
  float erode = smoothstep(0.55, 1.0, t) * 1.3;
  if (vN * 0.5 + 0.5 < erode) discard;
  float h = clamp(heat * (1.0 - t * 1.25) + vN * 0.55 + 0.1, 0.0, 1.0);
  vec3 c = ramp(h);
  float lit = 0.35 + 0.65 * max(dot(normalize(vNorm), normalize(sun)), 0.0);
  float glow = smoothstep(0.25, 0.9, h);
  c = mix(c * lit * 1.4, c * (1.4 + glow * 2.2), glow);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Booms {
  constructor(scene, { dust, sparks, max = 56, sun = new THREE.Vector3(0.4, 1, 0.3) }) {
    Object.assign(this, { dust, sparks });
    const geo = new THREE.IcosahedronGeometry(1, 4);
    this.items = [];
    for (let k = 0; k < max; k++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, seed: { value: Math.random() * 50 }, heat: { value: 1 }, sun: { value: sun } }, vertexShader: VS, fragmentShader: FS });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.items.push({ m, t: 0, life: 0, size: 1, grow: 1, v: new THREE.Vector3(), stretch: new THREE.Vector3(1, 1, 1) });
    }
    this.next = 0;
    this.light = new THREE.PointLight(0xffa050, 0, 45, 2);
    scene.add(this.light);
  }
  // one lobe: heat 1 = white-hot core, ~0.35 = sooty smoke
  puff(x, y, z, size, life, heat, v, delay = 0) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.m.position.set(x, y, z);
    it.v.copy(v);
    it.m.material.uniforms.heat.value = heat;
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
      this.puff(p.x + Math.cos(a) * r, p.y + 0.3 + Math.random() * (big ? 1.2 : 0.4), p.z + Math.sin(a) * r, size, (big ? 1.3 : 0.6) * (0.8 + Math.random() * 0.5), core ? 1.05 : 0.8 + Math.random() * 0.15, tv, core ? 0 : Math.random() * (big ? 0.12 : 0.04));
    }
    if (big) for (let k = 0; k < 7; k++) { // the dark column rolling up behind it
      tv.set(vel.x * 0.35 + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 3, vel.z * 0.35 + (Math.random() - 0.5) * 2);
      this.puff(p.x + (Math.random() - 0.5) * 2.5, p.y + 1.5 + k * 0.7, p.z + (Math.random() - 0.5) * 2.5, 2.2 + Math.random() * 1.8, 2.6 + Math.random() * 1.2, 0.42 - k * 0.03, tv, 0.18 + k * 0.07);
    }
    const sp = big ? 50 : 14;
    for (let k = 0; k < sp; k++) this.sparks.emit(p.x, p.y + 0.4, p.z, vel.x * keep + (Math.random() - 0.5) * (big ? 32 : 14), 2 + Math.random() * (big ? 16 : 6), vel.z * keep + (Math.random() - 0.5) * (big ? 32 : 14), big ? 0.16 : 0.11, 0.3 + Math.random() * 0.5, 1.0, 0.85, 0.45);
    this.light.position.set(p.x, p.y + 1.5, p.z);
    this.light.intensity = Math.max(this.light.intensity, big ? 220 : 40);
  }
  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 380);
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.t += dt;
      if (it.t < 0) continue;
      const u = it.t / it.life;
      if (u >= 1) { it.life = 0; it.m.visible = false; continue; }
      it.m.visible = true;
      it.m.material.uniforms.t.value = u;
      it.m.position.addScaledVector(it.v, dt);
      it.v.multiplyScalar(Math.exp(-dt * 2.6));
      it.v.y += dt * 1.2; // hot air keeps rising
      // violent swell, then a slow billow
      const sc = it.size * (u < 0.12 ? 0.25 + (u / 0.12) * 0.75 : 1 + (u - 0.12) * 0.6);
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
