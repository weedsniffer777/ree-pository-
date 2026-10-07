import * as THREE from 'three';
import { FINISH, pointAt } from './track.js';
import { terrainHeight } from './terrain.js';

// Finish line: a row of yellow A-frame road barriers with black/yellow striped boards.
// Driving through knocks every piece flying and ends the level.

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#16171a';
  g.fillRect(0, 0, 512, 48);
  g.fillStyle = '#f2c414';
  for (let x = -48; x < 560; x += 64) {
    g.beginPath();
    g.moveTo(x, 48); g.lineTo(x + 32, 48); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#16171a';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 512, 48);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,20' : '255,250,230'},${Math.random() * 0.15})`; g.fillRect(Math.random() * 512, Math.random() * 48, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function barrier(boardMat, yellow) {
  const g = new THREE.Group();
  const W = 2.6;
  const parts = [];
  const add = (m) => { m.castShadow = true; g.add(m); parts.push(m); return m; };
  const board = add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.24, 0.035), [yellow, yellow, yellow, yellow, boardMat, boardMat]));
  board.position.y = 0.95;
  const tube = (a, b) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, A.distanceTo(B), 8), yellow);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return add(m);
  };
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.05);
    tube([x, 0, -0.32], [x, 1.18, 0]); // front leg / upright
    tube([x, 0, 0.32], [x, 0.9, 0]); // back leg
    tube([x, 0.3, -0.24], [x, 0.3, 0.24]); // spreader
  }
  return { group: g, parts };
}

export function buildFinish() {
  const group = new THREE.Group();
  group.name = 'finish';
  const boardMat = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5, metalness: 0.1 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf0c016, roughness: 0.45, metalness: 0.3 });
  const pieces = [];
  const p0 = pointAt(FINISH.i);
  for (const lat of [-5.2, -2.6, 0, 2.6, 5.2]) {
    const p = pointAt(FINISH.i, lat);
    const b = barrier(boardMat, yellow);
    b.group.position.set(p.x, terrainHeight(p.x, p.z) + (Math.abs(lat) < 6 ? 0.1 : 0), p.z);
    b.group.rotation.y = p0.yaw + (Math.random() - 0.5) * 0.06;
    group.add(b.group);
    b.group.updateMatrixWorld(true);
    for (const m of b.parts) pieces.push({ mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), free: false });
  }

  let broken = false;
  const tmp = new THREE.Vector3();
  return {
    group,
    get broken() { return broken; },
    // returns true on the frame the car smashes through
    update(dt, car) {
      if (!broken && car.n && car.n.i >= FINISH.i - 2 && Math.abs(car.n.lat) < 7.6) {
        broken = true;
        const speed = Math.hypot(car.vx, car.vz);
        for (const pc of pieces) {
          pc.mesh.getWorldPosition(tmp);
          const q = pc.mesh.getWorldQuaternion(new THREE.Quaternion());
          group.attach(pc.mesh);
          pc.mesh.position.copy(tmp).sub(group.position);
          pc.mesh.quaternion.copy(q);
          const near = Math.max(0, 1 - Math.hypot(tmp.x - car.x, tmp.z - car.z) / 6);
          pc.vel.set(car.vx * (0.6 + near * 0.6) + (Math.random() - 0.5) * 5, 3 + Math.random() * 5 + speed * 0.12 * near, car.vz * (0.6 + near * 0.6) + (Math.random() - 0.5) * 5);
          pc.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
          pc.free = true;
        }
        return true;
      }
      if (!broken) return false;
      for (const pc of pieces) {
        if (!pc.free) continue;
        pc.vel.y -= 22 * dt;
        pc.mesh.position.addScaledVector(pc.vel, dt);
        pc.mesh.rotation.x += pc.spin.x * dt;
        pc.mesh.rotation.y += pc.spin.y * dt;
        pc.mesh.rotation.z += pc.spin.z * dt;
        const gy = terrainHeight(pc.mesh.position.x, pc.mesh.position.z) + 0.05;
        if (pc.mesh.position.y < gy) {
          pc.mesh.position.y = gy;
          pc.vel.y = Math.abs(pc.vel.y) * 0.3;
          pc.vel.x *= 0.6; pc.vel.z *= 0.6;
          pc.spin.multiplyScalar(0.5);
          if (Math.hypot(pc.vel.x, pc.vel.y, pc.vel.z) < 0.6) pc.free = false;
        }
      }
      return false;
    },
  };
}
