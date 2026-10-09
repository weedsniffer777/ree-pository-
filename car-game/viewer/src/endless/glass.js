import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Shattered windscreen as a post pass on the finished frame. Each strike is a web of
// shards: radial cracks from the impact, rings joining them. Every shard shifts the
// image behind it a little (glass pieces sit at slightly different angles, so the view
// through them breaks up), the pit at the centre is crushed white frost, and the crack
// lines carry a bright fracture face, a dark edge and a touch of colour fringing.
// Two screen-sized maps drive it: disp (RG = shard offset, B = frost) and lines (RGBA).

const Shader = {
  uniforms: { tDiffuse: { value: null }, tDisp: { value: null }, tLines: { value: null }, px: { value: new THREE.Vector2(1 / 1280, 1 / 720) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tDisp, tLines; uniform vec2 px; varying vec2 vUv;
    void main(){
      vec4 d = texture2D(tDisp, vUv);
      vec2 off = (d.rg - 0.5) * 0.09;
      float frost = d.b;
      vec3 c = texture2D(tDiffuse, vUv + off).rgb;
      // crushed glass: scatter the view and wash it towards white
      if (frost > 0.01) {
        vec2 r = px * (2.0 + frost * 9.0);
        vec3 b = texture2D(tDiffuse, vUv + off + vec2(r.x, r.y)).rgb + texture2D(tDiffuse, vUv + off - vec2(r.x, r.y)).rgb
               + texture2D(tDiffuse, vUv + off + vec2(-r.x, r.y)).rgb + texture2D(tDiffuse, vUv + off + vec2(r.x, -r.y)).rgb;
        c = mix(c, b * 0.25, min(1.0, frost * 1.4));
        c = mix(c, vec3(0.86, 0.9, 0.93), frost * 0.55);
      }
      vec4 l = texture2D(tLines, vUv);
      // colour fringe along the cracks
      float fr = texture2D(tLines, vUv + vec2(px.x * 2.0, 0.0)).a - l.a;
      c.r += fr * 0.12; c.b -= fr * 0.12;
      c = mix(c, l.rgb, l.a);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Glass {
  constructor(composer) {
    this.pass = new ShaderPass(Shader);
    this.pass.enabled = false;
    composer.addPass(this.pass);
    this.cracks = [];
    this.disp = document.createElement('canvas');
    this.lines = document.createElement('canvas');
    this.tDisp = new THREE.CanvasTexture(this.disp);
    this.tLines = new THREE.CanvasTexture(this.lines);
    for (const t of [this.tDisp, this.tLines]) { t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; }
    this.tDisp.colorSpace = THREE.NoColorSpace;
    this.pass.uniforms.tDisp.value = this.tDisp;
    this.pass.uniforms.tLines.value = this.tLines;
    this.dirty = true;
  }

  // a new strike somewhere toward the screen's edge (keeps the road ahead readable)
  add() {
    const W = 1280, H = Math.round(1280 * innerHeight / Math.max(1, innerWidth));
    if (this.disp.width !== W || this.disp.height !== H) { for (const c of [this.disp, this.lines]) { c.width = W; c.height = H; } this.cracks.length = 0; }
    const side = Math.random() < 0.5 ? -1 : 1;
    const cx = W / 2 + side * W * (0.18 + Math.random() * 0.24), cy = H * (0.18 + Math.random() * 0.6);
    this.cracks.push({ ...this.build(cx, cy, Math.min(W, H) * (0.42 + Math.random() * 0.2)), t0: performance.now() / 1000, a: 1 });
    while (this.cracks.length > 3) this.cracks.shift();
    this.dirty = true;
  }
  clear() { this.cracks.length = 0; this.dirty = true; }

  build(cx, cy, R) {
    let seed = 1 + Math.floor(Math.random() * 1e6);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const nr = 12 + Math.floor(rnd() * 7), rays = [];
    for (let k = 0; k < nr; k++) {
      let a = (k / nr) * Math.PI * 2 + (rnd() - 0.5) * 0.4, x = cx, y = cy, d = 0;
      const pts = [[x, y]], len = R * (0.45 + rnd() * 0.75) * (rnd() < 0.2 ? 1.6 : 1), branches = [];
      while (d < len) {
        const st = 8 + rnd() * 16;
        a += (rnd() - 0.5) * 0.3;
        x += Math.cos(a) * st; y += Math.sin(a) * st; d += st;
        pts.push([x, y]);
        if (rnd() < 0.07) { // a fork
          let b = a + (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.5), bx = x, by = y;
          const bp = [[bx, by]];
          for (let q = 0, bl = len * (0.15 + rnd() * 0.25); q < bl; q += 12) { b += (rnd() - 0.5) * 0.4; bx += Math.cos(b) * 12; by += Math.sin(b) * 12; bp.push([bx, by]); }
          branches.push(bp);
        }
      }
      rays.push({ pts, branches });
    }
    const at = (pts, rad) => pts.find(([x, y]) => Math.hypot(x - cx, y - cy) >= rad) ?? null;
    const rings = [R * 0.075, R * 0.15, R * 0.24, R * 0.36, R * 0.52, R * 0.7]; // ring 0 = the piece that's gone
    // shards: the cells between neighbouring rays and successive rings
    const cells = [];
    for (let k = 0; k < nr; k++) {
      const A = rays[k].pts, B = rays[(k + 1) % nr].pts;
      let prevA = A[0], prevB = B[0];
      for (let q = 0; q < rings.length; q++) {
        const pa = at(A, rings[q]), pb = at(B, rings[q]);
        if (!pa || !pb) break;
        const mid = [(prevA[0] + pa[0] + pb[0] + prevB[0]) / 4, (prevA[1] + pa[1] + pb[1] + prevB[1]) / 4];
        // some shards sit visibly pushed in or popped out: stronger shift, a tint, a lit bevel
        const deep = q > 0 && rnd() < 0.3, out = rnd() < 0.5 ? 1 : -1;
        const ang = Math.atan2(mid[1] - cy, mid[0] - cx) + (rnd() - 0.5) * 1.6, mag = (0.25 + rnd() * 0.75) * (q < 2 ? 0.6 : 1) * (deep ? 2.4 : 1);
        cells.push({ poly: [prevA, pa, pb, prevB], hole: q === 0, deep, out, dx: Math.cos(ang) * mag, dy: Math.sin(ang) * mag, frost: q === 0 ? 0 : q === 1 ? 0.85 : q === 2 ? 0.3 : 0 });
        prevA = pa; prevB = pb;
      }
    }
    // ring segments joining the rays, jagged
    const webs = [];
    rings.forEach((rad, q) => {
      if (q === 0) return;
      for (let k = 0; k < nr; k++) {
        if (rnd() > 0.95 - q * 0.1) continue;
        const pa = at(rays[k].pts, rad), pb = at(rays[(k + 1) % nr].pts, rad);
        if (!pa || !pb) continue;
        const seg = [pa];
        for (let s = 1; s < 4; s++) { const u = s / 4; seg.push([pa[0] + (pb[0] - pa[0]) * u + (rnd() - 0.5) * 6, pa[1] + (pb[1] - pa[1]) * u + (rnd() - 0.5) * 6]); }
        seg.push(pb);
        webs.push({ seg, w: q < 3 ? 1.4 : 0.9 });
      }
    });
    const chips = [];
    for (let k = 0; k < 26; k++) { const a = rnd() * Math.PI * 2, d = R * (0.09 + rnd() * 0.14); chips.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rnd() * 6, rnd() * 6]); }
    return { cx, cy, R, holeR: rings[0], rays, cells, webs, chips, seed: Math.floor(rnd() * 1e6) };
  }

  render() {
    const W = this.disp.width, H = this.disp.height, d = this.disp.getContext('2d'), l = this.lines.getContext('2d');
    d.globalCompositeOperation = 'source-over';
    d.fillStyle = 'rgb(128,128,0)'; d.fillRect(0, 0, W, H);
    l.clearRect(0, 0, W, H);
    l.lineCap = l.lineJoin = 'round';
    for (const c of this.cracks) {
      const A = c.a;
      const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
      for (const cell of c.cells) {
        if (cell.hole) continue; // the missing piece: a clean view straight through
        d.fillStyle = `rgb(${Math.round(128 + cell.dx * 70 * A)},${Math.round(128 + cell.dy * 70 * A)},${Math.round(cell.frost * 255 * A)})`;
        poly(d, cell.poly); d.fill();
        if (cell.deep) {
          // tilted shard: a tint, an inner shadow round its rim, a thick lit bevel on the
          // edge toward the light and a thick dark one opposite (swapped when pushed in)
          poly(l, cell.poly);
          l.fillStyle = cell.out > 0 ? `rgba(225,235,245,${0.12 * A})` : `rgba(8,10,14,${0.16 * A})`;
          l.fill();
          l.save(); poly(l, cell.poly); l.clip();
          poly(l, cell.poly); l.strokeStyle = `rgba(0,0,0,${0.32 * A})`; l.lineWidth = 9; l.stroke();
          l.restore();
          const P = cell.poly, top = P[0][1] + P[1][1] < P[3][1] + P[2][1];
          const lit = top ? [P[0], P[1]] : [P[3], P[2]], dark = top ? [P[3], P[2]] : [P[0], P[1]];
          const [hi, lo] = cell.out > 0 ? [lit, dark] : [dark, lit];
          l.lineCap = 'round';
          l.strokeStyle = `rgba(255,255,255,${0.75 * A})`; l.lineWidth = 3;
          l.beginPath(); l.moveTo(hi[0][0], hi[0][1]); l.lineTo(hi[1][0], hi[1][1]); l.stroke();
          l.strokeStyle = `rgba(0,0,0,${0.55 * A})`; l.lineWidth = 4.5;
          l.beginPath(); l.moveTo(lo[0][0] + 1.5, lo[0][1] + 2); l.lineTo(lo[1][0] + 1.5, lo[1][1] + 2); l.stroke();
        }
      }
      // the hole: jagged rim with the glass's thickness catching the light
      const rim = c.cells.filter((cell) => cell.hole).map((cell) => cell.poly[1]);
      if (rim.length > 2) {
        poly(l, rim); l.strokeStyle = `rgba(170,205,200,${0.75 * A})`; l.lineWidth = 3.2; l.stroke();
        l.save(); l.translate(1.3, 1.6); poly(l, rim); l.strokeStyle = `rgba(10,12,14,${0.55 * A})`; l.lineWidth = 1.6; l.stroke(); l.restore();
        poly(l, rim); l.strokeStyle = `rgba(255,255,255,${0.9 * A})`; l.lineWidth = 1; l.stroke();
      }
      // nothing is drawn inside the knocked-out centre
      const clip = (pts) => pts.filter(([x, y]) => Math.hypot(x - c.cx, y - c.cy) >= c.holeR * 1.04);
      // dark crack edges fade out as the cracks run away from the strike
      const fadeAt = (pts) => { const [x, y] = pts[Math.floor(pts.length / 2)]; return Math.max(0, 1 - Math.hypot(x - c.cx, y - c.cy) / (c.R * 0.75)); };
      const line = (pts, w) => {
        const path = () => { l.beginPath(); pts.forEach(([x, y], k) => (k ? l.lineTo(x, y) : l.moveTo(x, y))); };
        l.save(); l.translate(0.9, 1.1); path(); l.strokeStyle = `rgba(10,12,14,${0.5 * A * fadeAt(pts)})`; l.lineWidth = w + 1; l.stroke(); l.restore();
        path(); l.strokeStyle = `rgba(235,242,248,${0.85 * A})`; l.lineWidth = w; l.stroke();
        l.save(); l.translate(-0.6, -0.7); path(); l.strokeStyle = `rgba(255,255,255,${0.5 * A})`; l.lineWidth = Math.max(0.4, w * 0.35); l.stroke(); l.restore();
      };
      for (const ray of c.rays) {
        // cracks start at the hole's rim, not at a point in the middle
        const pts = clip(ray.pts), n = pts.length;
        if (n < 2) continue;
        for (let k = 0; k < 4; k++) line(pts.slice(Math.floor((k * n) / 4), Math.floor(((k + 1) * n) / 4) + 1), Math.max(0.5, 2.2 * (1 - k / 4)));
        for (const b of ray.branches) { const bp = clip(b); if (bp.length > 1) line(bp, 0.8); }
      }
      for (const wb of c.webs) { const wp = clip(wb.seg); if (wp.length > 1) line(wp, wb.w); }
      for (const [x, y, s, r] of c.chips) { l.fillStyle = `rgba(255,255,255,${0.35 * A})`; l.beginPath(); for (let q = 0; q < 3; q++) l.lineTo(x + Math.cos(r + q * 2.1) * s, y + Math.sin(r + q * 2.1) * s); l.fill(); }
    }
    this.tDisp.needsUpdate = this.tLines.needsUpdate = true;
  }

  // fade each strike out ~6 s after it lands
  update() {
    const now = performance.now() / 1000;
    for (let k = this.cracks.length - 1; k >= 0; k--) {
      const c = this.cracks[k], age = now - c.t0, a = age > 6 ? Math.max(0, 1 - (age - 6) / 1.5) : 1;
      if (a <= 0) { this.cracks.splice(k, 1); this.dirty = true; continue; }
      if (Math.abs(a - c.a) > 0.04) { c.a = a; this.dirty = true; }
    }
    this.pass.enabled = this.cracks.length > 0;
    if (this.dirty && this.cracks.length) this.render();
    this.dirty = false;
    this.pass.uniforms.px.value.set(1 / innerWidth, 1 / innerHeight);
  }
}
