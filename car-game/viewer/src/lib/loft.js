import * as THREE from 'three';

// Loft closed rings (ordered front +Z to back -Z). Rings must wind counter-clockwise
// when viewed from +Z so faces point outward. caps: 'fan' | 'strip' | false
// ('strip' suits thin plates whose ring is inner points + outer points reversed).
export function loftRings(rings, { caps = 'fan' } = {}) {
  const n = rings[0].length;
  const pos = [];
  const push = (...pts) => { for (const p of pts) pos.push(p[0], p[1], p[2]); };
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      push(r0[j], r1[k], r0[k]);
      push(r0[j], r1[j], r1[k]);
    }
  }
  const capRing = (ring, front) => {
    const tri = (a, b, c) => (front ? push(a, b, c) : push(a, c, b));
    if (caps === 'fan') {
      const c = ring.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);
      for (let j = 0; j < n; j++) tri(c, ring[j], ring[(j + 1) % n]);
    } else if (caps === 'strip') {
      const h = n / 2;
      for (let i = 0; i < h - 1; i++) {
        const a = ring[i], b = ring[i + 1], c = ring[n - 2 - i], d = ring[n - 1 - i];
        tri(a, b, c);
        tri(a, c, d);
      }
    }
  };
  if (caps) {
    capRing(rings[0], true);
    capRing(rings[rings.length - 1], false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// Mirrored loft: each section gives the right half from bottom-centre (x=0) round to
// top-centre (x=0); the left half is mirrored.
export function loft(sections, opts) {
  return loftRings(sections.map(({ z, half }) => {
    const right = half.map(([x, y]) => [x, y, z]);
    const left = half.slice(1, -1).reverse().map(([x, y]) => [-x, y, z]);
    return [...right, ...left];
  }), opts);
}

// Sort triangles into groups by facing direction and give each a planar UV projection,
// so world-space painted textures land in the right place.
// Groups: 0 side (X), 1 top (Y), 2 front (+Z), 3 back (-Z), then 4.. one per entry of
// `keep` (CSG material indices kept as-is, e.g. wheel wells, cut edges).
export function projectAndGroup(geo, uvFns, keep = []) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uvIn = geo.attributes.uv;
  const triCount = pos.count / 3;
  const matOfTri = new Int16Array(triCount).fill(-1);
  for (const gr of geo.groups) {
    for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) matOfTri[t] = gr.materialIndex;
  }
  const buckets = Array.from({ length: 4 + keep.length }, () => []);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const k = keep.indexOf(matOfTri[t]);
    let g;
    if (k >= 0) g = 4 + k;
    else {
      a.fromBufferAttribute(pos, t * 3);
      b.fromBufferAttribute(pos, t * 3 + 1);
      c.fromBufferAttribute(pos, t * 3 + 2);
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ax >= ay && ax >= az) g = 0;
      else if (ay >= az) g = 1;
      else g = n.z > 0 ? 2 : 3;
    }
    buckets[g].push(t);
  }
  const outPos = [], outNor = [], outUv = [];
  const out = new THREE.BufferGeometry();
  let start = 0;
  buckets.forEach((tris, g) => {
    for (const t of tris) {
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v;
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        outPos.push(x, y, z);
        outNor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        if (g < 4) outUv.push(...uvFns[g](x, y, z));
        else outUv.push(uvIn ? uvIn.getX(i) : 0, uvIn ? uvIn.getY(i) : 0);
      }
    }
    if (tris.length) out.addGroup(start, tris.length * 3, g);
    start += tris.length * 3;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(outNor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  return out;
}
