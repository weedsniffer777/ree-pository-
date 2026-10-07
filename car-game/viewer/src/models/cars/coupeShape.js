// Shared dimensions and surface samplers for the starter coupe.
// Metres, +Y up, +Z forward, origin at ground centre. ~4.5m long, ~1.82m wide, ~1.28m tall.

export const AXLE_Y = 0.33;
export const AXLE_F = 1.3;
export const AXLE_R = -1.25;
export const TRACK_X = 0.77;
export const WHEEL_R = 0.332;
export const ARCH_R = 0.385;

// Body cross-sections, front to back: z, half-width, bottom, shoulder (belt), top
export const BODY = [
  [2.24, 0.8, 0.3, 0.52, 0.64],
  [2.18, 0.87, 0.25, 0.56, 0.7],
  [2.0, 0.9, 0.22, 0.6, 0.74],
  [1.3, 0.905, 0.2, 0.64, 0.8],
  [0.85, 0.905, 0.2, 0.68, 0.84],
  [-0.4, 0.91, 0.2, 0.72, 0.87],
  [-1.25, 0.915, 0.21, 0.74, 0.89],
  [-1.9, 0.91, 0.23, 0.74, 0.9],
  [-2.14, 0.885, 0.27, 0.73, 0.9],
  [-2.22, 0.82, 0.32, 0.7, 0.86],
];

// Greenhouse: z, roof height (null = meets the body). Windshield pushed forward, flatter roof.
export const CABIN = [
  [0.92, null], [0.6, 1.02], [0.35, 1.16], [0.15, 1.255], [-0.2, 1.275],
  [-0.75, 1.27], [-1.1, 1.17], [-1.5, 1.03], [-1.86, null],
];

export function lerpTable(table, z, col) {
  for (let i = 0; i < table.length - 1; i++) {
    const z0 = table[i][0];
    const z1 = table[i + 1][0];
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1);
      return table[i][col] + (table[i + 1][col] - table[i][col]) * t;
    }
  }
  return z > table[0][0] ? table[0][col] : table[table.length - 1][col];
}

export const bodyRow = (z) => [1, 2, 3, 4].map((c) => lerpTable(BODY, z, c));
export const bodyTop = (z) => lerpTable(BODY, z, 4);

// Angular section: flat sides, chamfered shoulder, nearly flat top.
export function bodyHalf(z) {
  const [w, yb, belt, yt] = bodyRow(z);
  return [[0, yb], [w - 0.07, yb], [w, yb + 0.1], [w, belt], [w - 0.05, yt - 0.02], [w - 0.16, yt], [0, yt + 0.01]];
}

export const cabinBase = (z) => bodyTop(z) - 0.04;
export const cabinRows = CABIN.map(([z, top]) => [z, top ?? cabinBase(z) + 0.01]);
export const cabinTop = (z) => lerpTable(cabinRows, z, 1);

export function cabinHalf(z, top) {
  const yb = cabinBase(z);
  return [[0, yb], [0.8, yb], [0.68, Math.max(yb, top - 0.05)], [0.62, top], [0, top + 0.005]];
}

const interp = (pts, key, v, out) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i][key];
    const b = pts[i + 1][key];
    if ((v >= Math.min(a, b) && v <= Math.max(a, b)) && a !== b) {
      const t = (v - a) / (b - a);
      return pts[i][out] + (pts[i + 1][out] - pts[i][out]) * t;
    }
  }
  return v < Math.min(pts[0][key], pts[pts.length - 1][key]) ? pts[0][out] : pts[pts.length - 1][out];
};

// x of the body side at height y (right side; mirror for left)
export const sideX = (z, y) => interp(bodyHalf(z).slice(1, 5), 1, y, 0);
// y of the body top at lateral offset |x|
export const topY = (z, x) => interp(bodyHalf(z).slice(4), 0, Math.abs(x), 1);

// Windshield and rear-glass lines in (z, y)
export const WS = { base: [0.92, cabinBase(0.92)], top: [0.15, cabinTop(0.15)] };
export const RG = { top: [-0.75, cabinTop(-0.75)], base: [-1.86, cabinBase(-1.86)] };
export const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
