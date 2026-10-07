import * as THREE from 'three';
import { mesh } from '../../lib/geo.js';

// Placeholder red-orange goon, only for scale and colour contrast checks.
export function buildGoonRef() {
  const g = new THREE.Group();
  g.name = 'ref_goon';
  const m = new THREE.MeshStandardMaterial({ color: 0xe8502a, flatShading: true, roughness: 0.8 });
  g.add(mesh(new THREE.CapsuleGeometry(0.22, 0.8, 3, 8), m, { pos: [0, 0.65, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), m, { pos: [0, 1.48, 0] }));
  return g;
}
