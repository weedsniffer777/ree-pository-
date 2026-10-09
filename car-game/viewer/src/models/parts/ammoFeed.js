import * as THREE from 'three';
import { box, mesh } from '../../lib/geo.js';
import { gunmetalMaterial, weldMaterial, darkMaterial } from '../../lib/skin.js';
import { buildAmmoBelt } from './ammoBelt.js';

// Ammo feeds: what carries rounds from inside the car to a gun. Each weapon mount names
// its feed variant (or none); the feed is its own part, so it comes off with the gun.
//   beltChute: an armored chute with a feed hole on the hood, and a link belt from the
//   chute up into the gun's feed tray.
export const FEEDS = {
  beltChute({ feedPoint, side, at, topY }) {
    const metal = gunmetalMaterial(), weld = weldMaterial();
    const g = new THREE.Group();
    const [cx, cz] = at, cy = topY(cz, cx);
    // hollow armored chute, open on top, dark inside
    g.add(box(0.14, 0.012, 0.12, darkMaterial(0x060606), { pos: [cx, cy + 0.01, cz] }));
    for (const dx of [-0.065, 0.065]) g.add(box(0.012, 0.1, 0.12, metal, { pos: [cx + dx, cy + 0.05, cz] }));
    for (const dz of [-0.055, 0.055]) g.add(box(0.142, 0.1, 0.012, metal, { pos: [cx, cy + 0.05, cz + dz] }));
    g.add(mesh(new THREE.TorusGeometry(0.075, 0.006, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), weld, { pos: [cx, cy + 0.1, cz] }));
    const f = feedPoint;
    g.add(buildAmmoBelt([
      f, new THREE.Vector3(side * 0.5, f.y - 0.07, f.z - 0.05), new THREE.Vector3(side * 0.42, cy + 0.24, 1.15),
      new THREE.Vector3(cx, cy + 0.15, cz + 0.03), new THREE.Vector3(cx, cy + 0.03, cz),
    ]));
    return g;
  },
};

// build a mount's feed as a detachable part (null when the weapon has none)
export function buildFeed(variant, opts) {
  if (!variant || !FEEDS[variant]) return null;
  const g = FEEDS[variant](opts);
  Object.assign(g.userData, { part: 'feed', feed: variant, attachment: true });
  return g;
}
