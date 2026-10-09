import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Damage readout: the car model itself as a glowing x-ray, seen from above and behind,
// split into four armor sectors (front / back / left / right) with seams between them,
// and a solid core box inside for the hull HP. Its own small renderer; it only redraws
// when a value changes or something is flashing.

const VERT = `
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 cF; uniform vec3 cB; uniform vec3 cL; uniform vec3 cR;
uniform float zc; uniform float hz; uniform float hx;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
// rectangular panels: a nose band, a tail band, and a side band each side between them
void main() {
  float nz = (vP.z - zc) / hz, nx = vP.x / hx;
  vec3 ok = vec3(0.45, 1.0, 0.5);
  vec3 c = ok; // the hull reads as one healthy ghost; panels only show once they're hurt
  float seam = 0.0;
  if (nz > 0.58) { c = cF; seam = smoothstep(0.05, 0.0, nz - 0.58); }
  else if (nz < -0.58) { c = cB; seam = smoothstep(0.05, 0.0, -0.58 - nz); }
  else if (abs(nx) > 0.5) { c = nx < 0.0 ? cR : cL; seam = max(smoothstep(0.05, 0.0, abs(nx) - 0.5), smoothstep(0.05, 0.0, 0.58 - abs(nz))); }
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = 0.08 + pow(rim, 2.2) * 0.9;
  a *= 1.0 - seam * 0.85 * step(0.04, distance(c, ok));
  gl_FragColor = vec4(c * a * 1.6, 1.0);
}`;

// Condition colour: green (full) -> yellow -> orange -> red -> black (gone).
const STOPS = [[0, [0.05, 0.03, 0.03]], [0.25, [1, 0.12, 0.06]], [0.5, [1, 0.55, 0.1]], [0.75, [1, 0.92, 0.2]], [1, [0.45, 1, 0.5]]];
export function damageColor(v) {
  v = Math.max(0, Math.min(1, v));
  for (let k = 1; k < STOPS.length; k++) {
    const [a, ca] = STOPS[k - 1], [b, cb] = STOPS[k];
    if (v <= b) { const u = (v - a) / (b - a); return ca.map((c, j) => c + (cb[j] - c) * u); }
  }
  return STOPS[STOPS.length - 1][1];
}

export class XRay {
  constructor(canvas, model, hitbox) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    // one geometry from the model's meshes, positions + normals only
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert(), geos = [];
    model.traverse((o) => {
      if (!o.isMesh || !o.visible || o.material.blending === THREE.AdditiveBlending) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', o.geometry.attributes.position.clone());
      g.setAttribute('normal', o.geometry.attributes.normal.clone());
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      geos.push(g.index ? g.toNonIndexed() : g);
    });
    const geo = mergeGeometries(geos, false);
    const { hx, hz0, hz1 } = hitbox;
    this.u = {
      cF: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, cL: { value: new THREE.Color() }, cR: { value: new THREE.Color() },
      zc: { value: (hz0 + hz1) / 2 }, hz: { value: (hz1 - hz0) / 2 }, hx: { value: hx },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.car = new THREE.Mesh(geo, mat);
    this.scene.add(this.car);
    // hull HP: a solid box in the cabin, plus a brighter outline
    this.coreM = new THREE.MeshBasicMaterial({ color: 0x6fd36a, transparent: true, opacity: 0.85, depthWrite: false });
    this.core = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.45, 1.9), this.coreM);
    this.core.position.set(0, 0.62, (hz0 + hz1) / 2 - 0.15);
    this.scene.add(this.core);
    this.edge = new THREE.LineSegments(new THREE.EdgesGeometry(this.core.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    this.core.add(this.edge);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(0, 9.6, -4.7);
    this.cam.lookAt(0, 0, 0.2);
    this.key = '';
  }

  // armor: { z: { front, back, left, right }, core, flash: {...} }, t: seconds (pulse)
  update(a, t) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const pulse = a.core < 0.3 && !a.wrecked ? Math.round((Math.sin(t * 9) * 0.5 + 0.5) * 6) : 0;
    const key = [a.z.front, a.z.back, a.z.left, a.z.right, a.core].map((v) => v.toFixed(2)).join() + Object.values(a.flash).map((f) => (f > 0 ? 1 : 0)).join('') + pulse + w + 'x' + h;
    if (key === this.key) return;
    this.key = key;
    if (this.canvas.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    // hit flash: a hot orange pop rather than white
    const set = (c, v, f) => (f > 0 ? c.setRGB(1, 0.42, 0.08) : c.setRGB(...damageColor(v)));
    set(this.u.cF.value, a.z.front, a.flash.front);
    set(this.u.cB.value, a.z.back, a.flash.back);
    set(this.u.cL.value, a.z.left, a.flash.left);
    set(this.u.cR.value, a.z.right, a.flash.right);
    const hp = a.core;
    this.coreM.color.setRGB(...damageColor(hp));
    this.coreM.opacity = 0.35 + 0.5 * (pulse / 6 * 0.5 + 0.5) * (hp > 0 ? 1 : 0.2);
    this.core.scale.y = 0.25 + 0.75 * hp; // drains as HP falls
    this.r.render(this.scene, this.cam);
  }
}
