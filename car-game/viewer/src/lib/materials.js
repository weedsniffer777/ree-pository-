import * as THREE from 'three';

// Palette from CAR_SPEC_STARTER.md. Cool metal base, warm accents.
export const PALETTE = {
  steel: 0x8a95a3,
  darkSteel: 0x4b5563,
  rust: 0xb5532a,
  caution: 0xf2c21b,
  black: 0x1c1c22,
  tire: 0x232327,
  glass: 0x26313c,
  olive: 0x7a8a3a,
  chrome: 0xc9ced6,
  light: 0xfff1c2,
  tail: 0xff5a2a,
};

const cache = new Map();

export function mat(key, opts = {}) {
  const id = key + JSON.stringify(opts);
  if (!cache.has(id)) {
    cache.set(id, new THREE.MeshStandardMaterial({
      color: PALETTE[key] ?? key,
      flatShading: true,
      roughness: 0.75,
      metalness: 0.15,
      ...opts,
    }));
  }
  return cache.get(id);
}

export function glowMat(key, intensity = 0.8) {
  return mat(key, { emissive: PALETTE[key], emissiveIntensity: intensity, roughness: 0.4 });
}

// Yellow/black hazard stripes, drawn in code (no image assets).
let cautionTex;
export function cautionMat(repeatX = 4, repeatY = 1) {
  if (!cautionTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f2c21b';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1c1c22';
    for (let i = -64; i < 128; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 16, 0);
      g.lineTo(i + 16 - 64, 64);
      g.lineTo(i - 64, 64);
      g.closePath();
      g.fill();
    }
    cautionTex = new THREE.CanvasTexture(c);
    cautionTex.colorSpace = THREE.SRGBColorSpace;
    cautionTex.magFilter = THREE.NearestFilter;
  }
  const t = cautionTex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, flatShading: true, roughness: 0.7, metalness: 0.1 });
}
