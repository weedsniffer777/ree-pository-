import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Damage readout: the car model itself as a glowing x-ray, seen from above and behind,
// split into four armor panels (front / back / left / right); everything outside the
// panels is the hull and takes the hull-HP colour. Drawn by the game's own renderer
// straight onto the screen where its (empty) HUD canvas sits, after the frame: no second
// graphics context.

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
uniform vec3 cF; uniform vec3 cB; uniform vec3 cL; uniform vec3 cR; uniform vec3 cH;
uniform float zc; uniform float hz; uniform float hx;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
// rectangular panels: a nose band, a tail band, and a side band each side between them
void main() {
  float nz = (vP.z - zc) / hz, nx = vP.x / hx;
  vec3 c = cH; // the rest of the car: hull HP
  float seam = 0.0;
  if (nz > 0.58) { c = cF; seam = smoothstep(0.05, 0.0, nz - 0.58); }
  else if (nz < -0.58) { c = cB; seam = smoothstep(0.05, 0.0, -0.58 - nz); }
  else if (abs(nx) > 0.5) { c = nx < 0.0 ? cR : cL; seam = max(smoothstep(0.05, 0.0, abs(nx) - 0.5), smoothstep(0.05, 0.0, 0.58 - abs(nz))); }
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = 0.08 + pow(rim, 2.2) * 0.9;
  a *= 1.0 - seam * 0.85 * step(0.04, distance(c, cH)); // seams only where a panel differs from the hull
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
  static renderer = null; // the game's renderer (set once by main)
  // own: a renderer of its own on its canvas (the results screen, where the x-ray sits on
  // a panel the game canvas can't show through; only ever made once the race is over)
  constructor(canvas, model, hitbox, own = false) {
    this.canvas = canvas;
    if (own) { this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); }
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
      cF: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, cL: { value: new THREE.Color() }, cR: { value: new THREE.Color() }, cH: { value: new THREE.Color() },
      zc: { value: (hz0 + hz1) / 2 }, hz: { value: (hz1 - hz0) / 2 }, hx: { value: hx },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
    this.car = new THREE.Mesh(geo, mat);
    this.car.renderOrder = 1;
    // a black silhouette under the glow, so it reads the same over bright ground as it did
    // on its own transparent canvas
    const under = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    this.scene.add(under, this.car);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(0, 9.6, -4.7);
    this.cam.lookAt(0, 0, 0.2);
    this.key = '';
  }

  // armor: { z: { front, back, left, right }, core }: just sets the colours
  update(a) {
    this.u.cF.value.setRGB(...damageColor(a.z.front));
    this.u.cB.value.setRGB(...damageColor(a.z.back));
    this.u.cL.value.setRGB(...damageColor(a.z.left));
    this.u.cR.value.setRGB(...damageColor(a.z.right));
    this.u.cH.value.setRGB(...damageColor(a.core));
    if (this.r) { // own renderer: draw now, at the canvas's size
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      if (this.canvas.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
      this.r.render(this.scene, this.cam);
    }
  }

  // after the frame: draw into the screen rectangle of the HUD canvas (looked up a few
  // times a second, not every frame, so the HUD never forces a layout)
  draw(now) {
    const r = XRay.renderer;
    if (!r || this.r) return;
    if (!this.rect || now - this.rectT > 400) { this.rect = this.canvas.getBoundingClientRect(); this.rectT = now; }
    const { left, top, width: w, height: h } = this.rect;
    if (w < 2 || h < 2 || this.canvas.offsetParent === null) return;
    if (Math.abs(this.cam.aspect - w / h) > 1e-3) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    const H = r.domElement.clientHeight, auto = r.autoClear;
    r.setRenderTarget(null);
    r.autoClear = false;
    r.setViewport(left, H - top - h, w, h);
    r.setScissor(left, H - top - h, w, h);
    r.setScissorTest(true);
    r.render(this.scene, this.cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.clientWidth, H);
    r.autoClear = auto;
  }
}
