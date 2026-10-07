import * as THREE from 'three';

// World-space texture painting. A canvas covers a fixed world rectangle and triangles get
// planar UVs over the same rectangle (loft.projectAndGroup), so wear and rust are painted
// at real coordinates and line up across the body and the plates welded onto it.

export const Z0 = -2.5;
export const ZL = 5.0;
export const YH = 1.4;

export const UV = {
  side: (x, y, z) => [(z - Z0) / ZL, y / YH],
  top: (x, y, z) => [(z - Z0) / ZL, (x + 1) / 2],
  front: (x, y) => [(x + 1) / 2, y / YH],
  back: (x, y) => [(x + 1) / 2, y / YH],
};

export const GUNMETAL = '#3b4046';

export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h, toU, toV) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const P = (a, b) => [toU(a) * w, (1 - toV(b)) * h];
  return { c, g, P, w, h, ppm: (toU(1) - toU(0)) * w };
}

export function toTexture(canvas, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function fillPoly(cv, pts, style) {
  const { g, P } = cv;
  g.beginPath();
  pts.forEach(([a, b], i) => (i ? g.lineTo(...P(a, b)) : g.moveTo(...P(a, b))));
  g.closePath();
  g.fillStyle = style;
  g.fill();
}

export function strokePoly(cv, pts, style, width, close = true) {
  const { g, P } = cv;
  g.beginPath();
  pts.forEach(([a, b], i) => (i ? g.lineTo(...P(a, b)) : g.moveTo(...P(a, b))));
  if (close) g.closePath();
  g.strokeStyle = style;
  g.lineWidth = width;
  g.stroke();
}

export const rectPts = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];

// ---- Gunmetal paint: matte, layered grime, faint vertical staining ----
export function paintGunmetal(cv, seed, { stains = true } = {}) {
  const { g, w, h } = cv;
  const r = rng(seed);
  g.fillStyle = GUNMETAL;
  g.fillRect(0, 0, w, h);
  const blot = (count, rMin, rMax, dark, light) => {
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.55 ? `rgba(18,20,23,${dark * r()})` : `rgba(120,128,136,${light * r()})`;
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };
  blot(Math.round((w * h) / 9000), w * 0.02, w * 0.08, 0.35, 0.18); // large mottling
  blot(Math.round((w * h) / 1800), 4, 18, 0.3, 0.15); // medium
  for (let i = 0; i < (w * h) / 60; i++) { // fine grain
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.12})` : `rgba(160,168,176,${r() * 0.07})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  if (stains) {
    for (let i = 0; i < w / 6; i++) { // grime run-down
      const x = r() * w, y = r() * h * 0.6, len = 20 + r() * h * 0.4;
      const gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(20,18,16,${0.05 + r() * 0.12})`);
      gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr;
      g.fillRect(x, y, 1 + r() * 3, len);
    }
  }
  scratchesPx(g, r, w, h, Math.round((w * h) / 9000));
}

function scratchesPx(g, r, w, h, count) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, len = 6 + r() * 40, ang = (r() - 0.5) * 1.2;
    g.strokeStyle = `rgba(150,158,165,${0.15 + r() * 0.25})`;
    g.lineWidth = r() < 0.8 ? 1 : 1.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
}

// Ground-down bare metal along an edge (lighter, jagged)
export function edgeWear(cv, pts, seed, widthM = 0.02) {
  const { g, P, ppm } = cv;
  const r = rng(seed);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, b0] = pts[i];
    const [a1, b1] = pts[i + 1];
    const steps = Math.max(2, Math.round(Math.hypot(a1 - a0, b1 - b0) * ppm / 3));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [x, y] = P(a0 + (a1 - a0) * t, b0 + (b1 - b0) * t);
      const rad = widthM * ppm * (0.2 + r() * 0.8);
      g.fillStyle = `rgba(118,124,130,${0.15 + r() * 0.35})`;
      g.fillRect(x - rad / 2, y - rad / 2, rad, rad * (0.4 + r() * 0.6));
    }
  }
}

// Corrosion: a dark-brown core, orange-brown mottling feathering into the gunmetal,
// plus short drips running down. `pts` are seed points [a, b] in world coords;
// `down` is the canvas direction gravity runs (side textures: +1).
export function rust(cv, pts, seed, { size = 0.12, density = 1, drips = true, down = 1 } = {}) {
  const { g, P, ppm } = cv;
  const r = rng(seed);
  const R = size * ppm;
  for (const [a, b] of pts) {
    const [cx, cy] = P(a, b);
    const n = Math.round(R * R * 0.06 * density) + 12;
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * R;
      const x = cx + Math.cos(ang) * d * 1.3;
      const y = cy + Math.sin(ang) * d * 0.8;
      const core = 1 - d / R;
      const tone = r();
      const col = core > 0.6 && tone < 0.6 ? [52, 30, 18] : tone < 0.55 ? [92, 52, 28] : tone < 0.85 ? [118, 66, 32] : [140, 82, 40];
      const s = 1 + r() * (2 + core * 4);
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.15 + core * 0.55) * (0.5 + r() * 0.5)})`;
      g.fillRect(x, y, s, s * (0.6 + r() * 0.8));
    }
    if (drips) {
      for (let i = 0; i < 3 + R / 8; i++) {
        const x = cx + (r() - 0.5) * R * 1.4;
        const len = R * (0.4 + r() * 1.4);
        const gr = g.createLinearGradient(0, cy, 0, cy + down * len);
        gr.addColorStop(0, `rgba(96,54,28,${0.25 + r() * 0.3})`);
        gr.addColorStop(1, 'rgba(96,54,28,0)');
        g.fillStyle = gr;
        g.fillRect(x, down > 0 ? cy : cy - len, 1 + r() * 2, len);
      }
    }
  }
}

// Seed points spread along a polyline (for rust lines along seams, sills, arches)
export function along(pts, spacing, seed, jitter = 0.02) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, b0] = pts[i];
    const [a1, b1] = pts[i + 1];
    const len = Math.hypot(a1 - a0, b1 - b0);
    for (let s = 0; s < len; s += spacing * (0.5 + r())) {
      const t = s / len;
      out.push([a0 + (a1 - a0) * t + (r() - 0.5) * jitter, b0 + (b1 - b0) * t + (r() - 0.5) * jitter]);
    }
  }
  return out;
}

export function dust(cv, b0, b1, alpha = 0.45) {
  const { g, P, w } = cv;
  const y0 = P(0, b0)[1];
  const y1 = P(0, b1)[1];
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, `rgba(170,146,110,${alpha})`);
  gr.addColorStop(1, 'rgba(170,146,110,0)');
  g.fillStyle = gr;
  g.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
}

// ---- Shared materials ----
const matte = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0.25, ...extra });

let tileTex;
// Tileable gunmetal for bolt-on parts that use box UVs
export function gunmetalMaterial() {
  if (!tileTex) {
    const cv = makeCanvas(512, 512, (a) => a, (b) => b);
    paintGunmetal(cv, 31, { stains: false });
    rust(cv, [[0.2, 0.15], [0.8, 0.7], [0.55, 0.35]], 5, { size: 0.06, density: 0.5, drips: false });
    tileTex = toTexture(cv.c, true);
  }
  return matte(tileTex);
}

export const weldMaterial = () => new THREE.MeshStandardMaterial({ color: 0x5a5d60, roughness: 0.95, metalness: 0.3 });
export const glassMaterial = () => new THREE.MeshStandardMaterial({
  color: 0x1e272e, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false,
});
export const darkMaterial = (color = 0x1f2225) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1 });
export const steelMaterial = (color = 0x7f868d) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.65 });

let cautionTex;
// Worn yellow/black hazard stripes for the dozer
export function cautionMaterial(repeatX = 6) {
  if (!cautionTex) {
    const cv = makeCanvas(512, 256, (a) => a, (b) => b);
    const { g } = cv;
    g.fillStyle = '#c9a227';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#17181a';
    for (let i = -256; i < 768; i += 128) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 64, 0); g.lineTo(i + 64 - 256, 256); g.lineTo(i - 256, 256);
      g.closePath(); g.fill();
    }
    const r = rng(77);
    for (let i = 0; i < 9000; i++) { // chipped paint showing gunmetal
      g.fillStyle = r() < 0.5 ? `rgba(59,64,70,${r() * 0.6})` : `rgba(0,0,0,${r() * 0.15})`;
      g.fillRect(r() * 512, r() * 256, 1 + r() * 4, 1 + r() * 3);
    }
    rust(cv, [[0.1, 0.1], [0.4, 0.05], [0.75, 0.12], [0.95, 0.08]], 8, { size: 0.12, drips: true });
    scratchesPx(g, r, 512, 256, 60);
    cautionTex = toTexture(cv.c, true);
  }
  const t = cautionTex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX / 4, 1);
  t.needsUpdate = true;
  return matte(t, { roughness: 0.8 });
}

// Hand-painted streak along Z (top textures): ragged brushed edges, chipped and faded.
export function paintStreak(cv, z0, z1, xc, width, seed, color = [142, 32, 26]) {
  const { g, P, ppm } = cv;
  const r = rng(seed);
  const step = 0.012;
  let drift = 0;
  for (let z = z0; z >= z1; z -= step) {
    drift += (r() - 0.5) * 0.004;
    drift *= 0.97;
    const half = width / 2 + (r() - 0.5) * 0.012;
    const a = P(z, xc + drift - half);
    const b = P(z - step * 1.4, xc + drift + half);
    g.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.82 + r() * 0.15})`;
    g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    // dry-brush bristle streaks along the stroke
    if (r() < 0.6) {
      const y = P(z, xc + drift + (r() - 0.5) * width)[1];
      g.fillStyle = `rgba(${color[0] - 50},${color[1] - 15},${color[2] - 12},0.35)`;
      g.fillRect(a[0], y, step * ppm * 3, 1);
    }
  }
  // chips showing gunmetal underneath + sun fade
  const [x0, y0] = P(z0, xc - width);
  const [x1, y1] = P(z1, xc + width);
  const n = Math.abs((x1 - x0) * (y1 - y0)) / 30;
  for (let i = 0; i < n; i++) {
    const x = Math.min(x0, x1) + r() * Math.abs(x1 - x0);
    const y = Math.min(y0, y1) + r() * Math.abs(y1 - y0);
    g.fillStyle = r() < 0.7 ? `rgba(59,64,70,${0.4 + r() * 0.5})` : `rgba(220,150,120,${r() * 0.15})`;
    g.fillRect(x, y, 1 + r() * 4, 1 + r() * 2);
  }
}
