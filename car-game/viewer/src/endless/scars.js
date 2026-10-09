import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

// Scars: where a chunk of armor tore off, the bare metal under it is pocked with rusty
// bullet holes, decals projected onto the car's body and carried with it.

let mat = null;
function scarMaterial() {
  if (mat) return mat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // rust bloom: overlapping soft blobs, ragged at the edge
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 26;
    const grd = g.createRadialGradient(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 0, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 12 + Math.random() * 16);
    grd.addColorStop(0, 'rgba(88,60,44,0.5)');
    grd.addColorStop(1, 'rgba(70,50,38,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  // drips running down
  for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(80,56,42,0.3)'; g.fillRect(50 + Math.random() * 28, 64, 2 + Math.random() * 3, 20 + Math.random() * 34); }
  blob(64, 64, 15, 'rgba(104,72,52,0.85)'); // scorched ring
  blob(64, 64, 10, 'rgba(46,32,24,1)');
  blob(64, 64, 7, 'rgba(14,10,8,1)'); // the hole
  g.strokeStyle = 'rgba(190,186,180,0.7)'; g.lineWidth = 1.5; // torn bright metal at the rim
  g.beginPath(); g.arc(64, 64, 10.5, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9, metalness: 0.2 });
  return mat;
}

export class Scars {
  constructor() {
    this.list = [];
    this.ray = new THREE.Raycaster();
    this.o = new THREE.Object3D();
  }

  // the body meshes a car's scars land on: everything not on a detachable part
  static body(model) {
    if (model.userData.body) return model.userData.body;
    const out = [];
    const walk = (o) => {
      if (o !== model && o.userData.part) return;
      const glassy = [].concat(o.material).some((m) => m.transparent); // no rust on windows
      if (o.isMesh && o.material.blending !== THREE.AdditiveBlending && !glassy && !o.userData.scar) out.push(o);
      for (const ch of o.children) walk(ch);
    };
    walk(model);
    return (model.userData.body = out);
  }

  // stamp a few holes on the body under where `part` was: aimed in from `out` (world)
  addUnder(model, part, out) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(part);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const dir = new THREE.Vector3(-out.x, -out.y, -out.z).normalize(), body = Scars.body(model);
    const inv = model.matrixWorld.clone().invert();
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * sz.x * 0.8, (Math.random() - 0.5) * sz.y * 0.6, (Math.random() - 0.5) * sz.z * 0.8)).addScaledVector(dir, -1.2);
      this.ray.set(p, dir);
      this.ray.far = 3;
      const hit = this.ray.intersectObjects(body, false)[0];
      if (!hit) continue;
      const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      this.o.position.copy(hit.point);
      this.o.lookAt(hit.point.clone().add(nrm));
      this.o.rotateZ(Math.random() * Math.PI * 2);
      const s = 0.22 + Math.random() * 0.16;
      const geo = new DecalGeometry(hit.object, hit.point, this.o.rotation, new THREE.Vector3(s, s, 0.3));
      if (!geo.attributes.position.count) continue;
      geo.applyMatrix4(inv);
      const m = new THREE.Mesh(geo, scarMaterial());
      m.userData.scar = true;
      model.add(m);
      this.list.push(m);
    }
  }

  clear() {
    for (const m of this.list) { m.removeFromParent(); m.geometry.dispose(); }
    this.list.length = 0;
  }
}
