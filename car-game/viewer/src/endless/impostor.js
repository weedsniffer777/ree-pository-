import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft } from '../lib/loft.js';
import { BODY, bodyHalf, cabinRows, cabinHalf, AXLE_Y, AXLE_F, AXLE_R, TRACK_X, WHEEL_R } from '../models/cars/coupeShape.js';

// Baked stand-in for a car seen from a distance. The full-detail car is photographed
// from five sides (left, right, top, front, back) into one 1024 texture; a simple solid
// shell (body, cabin, wheels, a block for the dozer) wears those pictures, each triangle
// taking the view it faces. ~2.5k triangles and one draw call instead of ~55k and ~90.
// Lighting is baked into the pictures, so the shell is drawn unlit.

const SIZE = 1024;
// atlas regions [x, y, w, h] in pixels, and the camera for each view
const VIEWS = [
  { name: 'left', dir: [1, 0, 0], up: [0, 1, 0], r: [0, 0, 1024, 288] },
  { name: 'right', dir: [-1, 0, 0], up: [0, 1, 0], r: [0, 288, 1024, 288] },
  { name: 'top', dir: [0, 1, 0], up: [1, 0, 0], r: [0, 576, 1024, 256] },
  { name: 'front', dir: [0, 0, 1], up: [0, 1, 0], r: [0, 832, 512, 192] },
  { name: 'back', dir: [0, 0, -1], up: [0, 1, 0], r: [512, 832, 512, 192] },
];

let shell = null; // the stand-in shape, shared by every car
function shellGeometry(box) {
  if (shell) return shell;
  const parts = [
    loft(BODY.map(([z]) => ({ z, half: bodyHalf(z) }))),
    loft(cabinRows.map(([z, top]) => ({ z, half: cabinHalf(z, top) }))),
  ];
  for (const z of [AXLE_F, AXLE_R]) for (const s of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 12).rotateZ(Math.PI / 2).translate(s * (TRACK_X + 0.05), AXLE_Y, z));
  }
  // the dozer blade and anything else out past the nose
  const front = 2.3;
  if (box.max.z > front + 0.05) parts.push(new THREE.BoxGeometry(box.max.x * 2, 0.62, box.max.z - front).translate(0, 0.42, (front + box.max.z) / 2));
  const clean = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k); return n; });
  shell = mergeGeometries(clean, false);
  return shell;
}

function cameraFor(v, box) {
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).addScalar(0.04);
  const d = new THREE.Vector3(...v.dir);
  // half-width along the camera's right axis and half-height along its up axis
  const up = new THREE.Vector3(...v.up), right = new THREE.Vector3().crossVectors(d.clone().negate(), up);
  const ext = (a) => Math.abs(a.x) * s.x + Math.abs(a.y) * s.y + Math.abs(a.z) * s.z;
  const hw = ext(right), hh = ext(up);
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 20);
  cam.up.copy(up);
  cam.position.copy(c).addScaledVector(d, 10);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

export class Impostor {
  // model: the car (its local frame is the car's); env: the scene's environment map
  constructor(renderer, model, env, envIntensity = 1) {
    Object.assign(this, { renderer, model });
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.NoColorSpace });
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    this.scene.environmentIntensity = envIntensity;
    this.scene.add(new THREE.HemisphereLight(0xe6eef4, 0xd9a06a, 1.9));
    const sun = new THREE.DirectionalLight(0xffdcae, 3.2);
    sun.position.set(0.5, 1, 0.35);
    this.scene.add(sun);
    // the frame the pictures are taken in, and the shell's UVs into the atlas
    this.box = new THREE.Box3();
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert(), tmp = new THREE.Box3();
    model.traverse((o) => { if (o.isMesh && o.visible) { o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); this.box.union(tmp); } });
    this.cams = VIEWS.map((v) => cameraFor(v, this.box));
    const geo = shellGeometry(this.box).clone(), pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3();
    for (let t = 0; t < pos.count / 3; t++) {
      a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      // the view this face looks out toward (undersides use the top picture; never seen)
      let best = 0, bd = -2;
      VIEWS.forEach((v, k) => { const d = n.x * v.dir[0] + n.y * v.dir[1] + n.z * v.dir[2]; if (d > bd) { bd = d; best = k; } });
      if (n.y < -0.7) best = 2;
      const r = VIEWS[best].r;
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, t * 3 + k).project(this.cams[best]);
        uv[(t * 3 + k) * 2] = (r[0] + (p.x * 0.5 + 0.5) * r[2]) / SIZE;
        uv[(t * 3 + k) * 2 + 1] = (r[1] + (p.y * 0.5 + 0.5) * r[3]) / SIZE;
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.target.texture }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.bake();
  }

  // photograph the car as it is now (paint, wear, missing parts)
  bake() {
    const { renderer: r, model } = this, parent = model.parent, P = model.position.clone(), Q = model.quaternion.clone(), vis = model.visible;
    this.scene.add(model);
    model.position.set(0, 0, 0); model.quaternion.identity(); model.visible = true;
    const prevTarget = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha(), prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    VIEWS.forEach((v, k) => {
      const [x, y, w, h] = v.r;
      this.target.viewport.set(x, y, w, h);
      this.target.scissor.set(x, y, w, h);
      this.target.scissorTest = true;
      r.setRenderTarget(this.target);
      r.render(this.scene, this.cams[k]);
    });
    this.target.scissorTest = false;
    this.target.viewport.set(0, 0, SIZE, SIZE);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.autoUpdate = prevShadow;
    parent?.add(model);
    model.position.copy(P); model.quaternion.copy(Q); model.visible = vis;
  }
}
