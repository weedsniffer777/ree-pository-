// Race HUD: a slick racing layout worn down to gunmetal and rust. Top left: race position,
// lap and lap times, standings under them. Top right: pause and the dev kit. Bottom left:
// a square heading-up minimap (faint yard geometry, the circuit as a bright line, racers
// as dots). Bottom right: tacho with simulated gears, speed and the boost bar. Centred
// yellow tutorial cards still spotlight the HUD part they are about.

const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.62  0 0 0 0 0.33  0 0 0 0 0.16  0 0 0 0.55 -0.12'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const CSS = `
#hud { --yellow: #f2c21b; --black: #0e0f11; --white: #ece6d9; --dim: rgba(236,230,217,0.55); --rust: #d8642a; --rustD: #8c3a1c; --red: #d7261e;
  --panel: linear-gradient(160deg, rgba(30,31,33,0.86), rgba(14,15,17,0.82));
  --display: 'Big Shoulders Stencil Display', 'Arial Narrow', Impact, sans-serif;
  --sign: 'Overpass', 'Arial Narrow', system-ui, sans-serif;
  --cut: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  --gx: calc(16px + env(safe-area-inset-left, 0px)); --gxr: calc(16px + env(safe-area-inset-right, 0px));
  --gy: calc(16px + env(safe-area-inset-top, 0px)); --gyb: calc(16px + env(safe-area-inset-bottom, 0px));
  position: fixed; inset: 0; pointer-events: none; color: var(--white); font-family: var(--sign); }
#hud .panel { position: relative; background: ${NOISE}, var(--panel); clip-path: var(--cut); }
#hud .panel::before { content: ''; position: absolute; left: 12px; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, var(--rust), rgba(216,100,42,0.15)); }
#hud .lbl { font: 800 10px/1 var(--sign); letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim); }
#hud .num { font-family: var(--display); font-weight: 900; font-variant-numeric: tabular-nums; }

/* top left: position, lap, standings */
#hud .tl { position: absolute; left: var(--gx); top: var(--gy); display: grid; gap: 6px; width: 236px; }
#hud .head { display: flex; align-items: stretch; padding: 8px 12px 8px 14px; gap: 14px; }
#hud .pos { display: flex; align-items: baseline; line-height: 0.8; padding-right: 14px; border-right: 1px solid rgba(236,230,217,0.14); }
#hud .pos b { font: 900 54px/0.8 var(--display); transform: skewX(-6deg); text-shadow: 0 2px 0 rgba(0,0,0,0.5); }
#hud .pos span { font: 900 20px/1 var(--display); color: var(--dim); margin-left: 3px; }
#hud .lap { display: grid; align-content: center; gap: 3px; }
#hud .lap .n { font: 900 19px/1 var(--display); letter-spacing: 0.06em; }
#hud .lap .t { font: 800 15px/1 var(--sign); font-variant-numeric: tabular-nums; }
#hud .lap .b { font: 700 11px/1 var(--sign); font-variant-numeric: tabular-nums; color: var(--dim); }
#hud .board { display: grid; gap: 2px; }
#hud .row { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; height: 22px; padding: 0 10px 0 8px; background: rgba(14,15,17,0.55); font: 800 12px/1 var(--sign); letter-spacing: 0.06em; text-transform: uppercase; }
#hud .row i { font: 900 15px/1 var(--display); font-style: normal; color: var(--dim); }
#hud .row em { font-style: normal; font-size: 11px; color: var(--dim); font-variant-numeric: tabular-nums; }
#hud .row.you { background: linear-gradient(90deg, rgba(216,100,42,0.55), rgba(140,58,28,0.35)); box-shadow: inset 3px 0 0 var(--rust); }
#hud .row.you i, #hud .row.you em { color: var(--white); }
#hud .row.out { opacity: 0.4; text-decoration: line-through; }

/* top right: pause (+ the dev kit, moved in here) */
#hud .tr { position: absolute; right: var(--gxr); top: var(--gy); display: flex; gap: 8px; align-items: flex-start; pointer-events: auto; }
#hud .tr #devkit { position: relative; top: auto; right: auto; }
#hud .tr #devkit .open { height: 38px; background: ${NOISE}, rgba(14,15,17,0.8); border: 1px solid rgba(236,230,217,0.16); border-radius: 0; clip-path: var(--cut); color: var(--white); padding: 0 12px; }
#hud .tr #devkit .open:hover, #hud .tr #devkit.on .open { background: var(--rust); color: var(--black); }
#hud .pause { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(236,230,217,0.16); background: ${NOISE}, rgba(14,15,17,0.8); clip-path: var(--cut); cursor: pointer; padding: 0; }
#hud .pause::before { content: ''; width: 12px; height: 14px; border-left: 4px solid var(--white); border-right: 4px solid var(--white); box-sizing: border-box; }
#hud .pause:hover { background: var(--rust); }

/* bottom left: minimap */
#hud .map { position: absolute; left: var(--gx); bottom: var(--gyb); width: 176px; height: 176px; }
#hud .map canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .map::after { content: ''; position: absolute; inset: 0; box-shadow: inset 0 0 26px 8px rgba(8,9,10,0.9); pointer-events: none; }

/* bottom right: tacho, speed, gear, boost */
#hud .gauge { position: absolute; right: var(--gxr); bottom: var(--gyb); width: 214px; display: grid; justify-items: center; }
#hud .speed { position: relative; width: 214px; height: 190px; }
#hud .speed canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#hud .speed .rd { position: absolute; left: 0; right: 0; top: 74px; text-align: center; }
#hud .speed .v { font: 900 54px/0.8 var(--display); letter-spacing: 0.01em; transform: skewX(-6deg); text-shadow: 0 2px 0 rgba(0,0,0,0.55); }
#hud .speed .u { margin-top: 6px; }
#hud .speed .g { position: absolute; left: 50%; top: 140px; transform: translateX(-50%); min-width: 34px; height: 30px; display: grid; place-items: center; font: 900 24px/1 var(--display); color: var(--black); background: var(--white); clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%); }
#hud .speed .g.shift { background: var(--rust); }
#hud .boost { width: 200px; margin-top: -2px; }
#hud .boost .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
#hud .boost .bar { height: 10px; background: rgba(14,15,17,0.75); position: relative; overflow: hidden; clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%); }
#hud .boost .bar i { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(-55deg, var(--rust) 0 7px, var(--rustD) 7px 14px); }
#hud .boost.on .bar i { background: repeating-linear-gradient(-55deg, #ffd27a 0 7px, #ff7a14 7px 14px); }
#hud kbd { display: inline-block; min-width: 1.4em; padding: 2px 5px 1px; background: var(--white); color: var(--black); border-radius: 2px; font: 800 10px/1 var(--sign); text-align: center; letter-spacing: 0.04em; }

/* pause screen */
#hud .paused { position: absolute; inset: 0; display: grid; place-items: center; align-content: center; gap: 14px; background: rgba(8,9,10,0.62); pointer-events: auto; }
#hud .paused[hidden] { display: none; }
#hud .paused h2 { margin: 0 0 6px; font: 900 64px/0.9 var(--display); letter-spacing: 0.08em; transform: skewX(-6deg); }
#hud .paused button { width: 220px; height: 46px; border: 0; cursor: pointer; font: 900 20px/1 var(--display); letter-spacing: 0.14em; color: var(--white); background: ${NOISE}, rgba(30,31,33,0.95); clip-path: var(--cut); }
#hud .paused button:hover, #hud .paused button.main { background: var(--rust); color: var(--black); }

/* tutorial: centred card, plus a dimmed screen with a cut-out over the HUD part it is about */
#hud .spot { position: absolute; border-radius: 10px; box-shadow: 0 0 0 200vmax rgba(10,10,12,0.42), 0 0 0 3px var(--yellow), 0 0 22px 4px rgba(242,194,27,0.6); transition: left 0.3s, top 0.3s, width 0.3s, height 0.3s, opacity 0.3s; opacity: 0; }
#hud .spot.on { opacity: 1; }
#hud .card { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); background: var(--yellow); color: var(--black); clip-path: var(--cut); padding: 12px 22px 11px; text-align: center; max-width: calc(100% - 32px); transition: opacity 0.25s, transform 0.25s, background 0.2s; }
#hud .card h4 { margin: 0; font: 900 clamp(22px, 3.4vw, 32px)/1 var(--display); letter-spacing: 0.05em; text-transform: uppercase; }
#hud .card p { margin: 7px 0 0; font: 800 14px/1.2 var(--sign); letter-spacing: 0.08em; text-transform: uppercase; }
#hud .card p:empty { display: none; }
#hud .card kbd { background: var(--black); color: var(--yellow); }
#hud .card.ok { background: #7fd36a; }
#hud .card.warn { background: var(--red); color: var(--white); }
#hud .card.warn kbd { background: var(--white); color: var(--black); }
#hud .card.out { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
#hud .card.in { animation: cardIn 0.32s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes cardIn { from { transform: translate(-50%, -50%) scale(1.25); opacity: 0; } }

/* lap flash */
#hud .title { position: absolute; top: 16%; left: 50%; transform: translateX(-50%); text-align: center; transition: opacity 0.7s; }
#hud .title h3 { margin: 0; font: 900 clamp(34px, 6vw, 60px)/0.9 var(--display); letter-spacing: 0.06em; text-transform: uppercase; transform: skewX(-6deg); text-shadow: 0 3px 0 rgba(0,0,0,0.6); }
#hud .title p { display: inline-block; margin: 8px 0 0; padding: 6px 14px 5px; font: 800 14px/1 var(--sign); letter-spacing: 0.16em; text-transform: uppercase; font-variant-numeric: tabular-nums; }

#hud .debug { position: absolute; top: 50%; left: 16px; transform: translateY(-50%); margin: 0; font: 12px/1.5 ui-monospace, monospace; background: rgba(0,0,0,0.6); padding: 8px 10px; white-space: pre; }
#hud .touch { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
#hud .touch .btn { position: absolute; width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; font: 900 15px/1 var(--display); letter-spacing: 0.1em; color: var(--white); background: ${NOISE}, rgba(14,15,17,0.62); box-shadow: inset 0 0 0 2px rgba(236,230,217,0.22); }
#hud .touch .boostBtn { right: 24px; bottom: calc(262px + env(safe-area-inset-bottom, 0px)); box-shadow: inset 0 0 0 3px var(--rust); }
#hud .touch .fireBtn { right: 112px; bottom: calc(236px + env(safe-area-inset-bottom, 0px)); box-shadow: inset 0 0 0 3px var(--red); }
#hud .touch .brakeBtn { right: 30px; bottom: calc(350px + env(safe-area-inset-bottom, 0px)); width: 62px; height: 62px; font-size: 13px; }
#hud .touch::before { content: ''; position: absolute; top: 0; bottom: 0; width: 50%; opacity: 0; transition: opacity 0.1s; pointer-events: none; }
#hud .touch.sl::before { left: 0; opacity: 1; background: linear-gradient(90deg, rgba(236,230,217,0.13), transparent 70%); }
#hud .touch.sr::before { right: 0; opacity: 1; background: linear-gradient(270deg, rgba(236,230,217,0.13), transparent 70%); }
#hud .touch .btn.down { transform: scale(0.94); background: rgba(216,100,42,0.6); }
/* phones held sideways: compact, buttons left of the gauge */
@media (orientation: landscape) and (max-height: 520px) {
  #hud { --gx: calc(10px + env(safe-area-inset-left, 0px)); --gxr: calc(10px + env(safe-area-inset-right, 0px)); --gy: 8px; --gyb: calc(8px + env(safe-area-inset-bottom, 0px)); }
  #hud .tl { width: 190px; gap: 4px; }
  #hud .head { padding: 5px 10px 5px 12px; gap: 10px; }
  #hud .pos b { font-size: 40px; }
  #hud .pos span { font-size: 16px; }
  #hud .row { height: 17px; font-size: 10px; }
  #hud .row i { font-size: 12px; }
  #hud .map { width: 112px; height: 112px; }
  #hud .gauge, #hud .speed { width: 146px; }
  #hud .speed { height: 130px; }
  #hud .speed .rd { top: 50px; }
  #hud .speed .v { font-size: 38px; }
  #hud .speed .g { top: 96px; height: 24px; min-width: 28px; font-size: 19px; }
  #hud .boost { width: 136px; margin-top: 6px; }
  #hud .title { top: 20%; }
  #hud .title h3 { font-size: 34px; }
  #hud .card { top: 34%; padding: 8px 16px 7px; }
  #hud .card h4 { font-size: 20px; }
  #hud .card p { font-size: 12px; }
  #hud .tr #devkit .open, #hud .pause { height: 32px; }
  #hud .pause { width: 32px; }
  #hud .touch .btn { width: 64px; height: 64px; font-size: 13px; }
  #hud .touch .boostBtn { right: calc(170px + env(safe-area-inset-right, 0px)); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .fireBtn { right: calc(246px + env(safe-area-inset-right, 0px)); bottom: calc(36px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .brakeBtn { right: calc(176px + env(safe-area-inset-right, 0px)); bottom: calc(90px + env(safe-area-inset-bottom, 0px)); width: 52px; height: 52px; font-size: 12px; }
}
@media (max-width: 720px) and (orientation: portrait) {
  #hud .tl { width: 200px; }
  #hud .map { width: 132px; height: 132px; }
  #hud .gauge, #hud .speed { width: 170px; }
  #hud .speed { height: 150px; }
  #hud .speed .rd { top: 58px; }
  #hud .speed .v { font-size: 44px; }
  #hud .speed .g { top: 112px; }
  #hud .boost { width: 160px; }
  #hud .touch .boostBtn { bottom: calc(212px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .fireBtn { bottom: calc(190px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .brakeBtn { bottom: calc(298px + env(safe-area-inset-bottom, 0px)); }
}
`;

// Simulated six-speed box: gear and revs from road speed alone (the player never shifts).
const SHIFT = [0, 48, 84, 118, 150, 180, 240]; // km/h where each gear starts; last is the top
const IDLE = 900, RED = 7000, MAXR = 8000;
function gearFor(kmh, prev) {
  let g = 1;
  while (g < 6 && kmh > SHIFT[g] + (prev > g ? -6 : 2)) g++; // a little hysteresis
  return g;
}

const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function createHud({ touch = false } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="tl">
      <div class="head panel">
        <div class="pos"><b class="num">1</b><span>/1</span></div>
        <div class="lap"><div class="n">LAP 1</div><div class="t">0:00.00</div><div class="b"></div></div>
      </div>
      <div class="board"></div>
    </div>
    <div class="tr"><button class="pause" aria-label="Pause"></button></div>
    <div class="map panel"><canvas></canvas></div>
    <div class="gauge">
      <div class="speed"><canvas></canvas><div class="rd"><div class="v">0</div><div class="u lbl">KM/H</div></div><div class="g">N</div></div>
      <div class="boost"><div class="top"><span class="lbl">Boost</span><span class="bk"><kbd>Shift</kbd></span></div><div class="bar"><i></i></div></div>
    </div>
    <div class="spot"></div>
    <div class="card out"><h4></h4><p></p></div>
    <div class="title" hidden><h3></h3><p class="panel"></p></div>
    <div class="paused" hidden><h2>PAUSED</h2><button class="main" data-a="resume">RESUME</button><button data-a="restart">RESTART</button></div>
    <pre class="debug" hidden></pre>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  // left half of the screen steers left, right half steers right; buttons take their own touches
  const t = { left: false, right: false, boost: false, brake: false, fire: false, active: touch, get steer() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); } };
  if (touch) {
    const layer = document.createElement('div');
    layer.className = 'touch';
    layer.innerHTML = '<div class="btn brakeBtn">BRAKE</div><div class="btn fireBtn">FIRE</div><div class="btn boostBtn">BOOST</div>';
    root.insertBefore(layer, $('.tr'));
    const hold = (el, key) => {
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); t[key] = true; el.classList.add('down'); el.setPointerCapture(e.pointerId); });
      const up = () => { t[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold(layer.querySelector('.boostBtn'), 'boost');
    hold(layer.querySelector('.fireBtn'), 'fire');
    hold(layer.querySelector('.brakeBtn'), 'brake');
    const steerPtr = new Map();
    const side = (e) => (e.clientX < innerWidth / 2 ? -1 : 1);
    const upd = () => {
      const v = [...steerPtr.values()];
      t.left = v.includes(-1);
      t.right = v.includes(1);
      layer.classList.toggle('sl', t.left && !t.right);
      layer.classList.toggle('sr', t.right && !t.left);
    };
    layer.addEventListener('pointerdown', (e) => { if (e.target !== layer) return; steerPtr.set(e.pointerId, side(e)); layer.setPointerCapture(e.pointerId); upd(); });
    layer.addEventListener('pointermove', (e) => { if (steerPtr.has(e.pointerId)) { steerPtr.set(e.pointerId, side(e)); upd(); } });
    const end = (e) => { if (steerPtr.delete(e.pointerId)) upd(); };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    $('.bk').hidden = true;
  }
  // the dev kit button joins the top-right cluster once it exists
  const adopt = () => { const dk = document.getElementById('devkit'); if (dk && dk.parentElement !== $('.tr')) $('.tr').append(dk); };
  adopt();
  setTimeout(adopt, 0);

  // pause
  let onPause = () => {};
  const pausedEl = $('.paused');
  const setPaused = (on) => { pausedEl.hidden = !on; onPause(on); };
  $('.pause').addEventListener('click', () => setPaused(pausedEl.hidden));
  pausedEl.addEventListener('click', (e) => {
    const a = e.target.dataset?.a;
    if (a === 'resume') setPaused(false);
    if (a === 'restart') location.reload();
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' || e.code === 'KeyP') setPaused(pausedEl.hidden); });

  // ---- tacho ----
  const sc = $('.speed canvas'), sx = sc.getContext('2d');
  let gear = 1, rpm = IDLE, shiftT = 0, lastDraw = '';
  const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5; // 270° sweep, gap at the bottom
  function drawTacho(r, w, h, dpr) {
    if (w < 40 || h < 40) return; // hidden or not laid out yet
    if (sc.width !== Math.round(w * dpr)) { sc.width = Math.round(w * dpr); sc.height = Math.round(h * dpr); }
    const g = sx, cx = w / 2, cy = h * 0.53, R = Math.min(w / 2, h * 0.53) - 6;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // dark dial face
    const face = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R + 4);
    face.addColorStop(0, 'rgba(20,21,23,0.82)'); face.addColorStop(1, 'rgba(10,11,12,0.6)');
    g.fillStyle = face;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fill();
    const ang = (v) => A0 + (v / MAXR) * SPAN;
    // track and redline band
    g.lineCap = 'butt';
    g.lineWidth = R * 0.085;
    g.strokeStyle = 'rgba(236,230,217,0.1)';
    g.beginPath(); g.arc(cx, cy, R * 0.9, A0, A0 + SPAN); g.stroke();
    g.strokeStyle = 'rgba(215,38,30,0.45)';
    g.beginPath(); g.arc(cx, cy, R * 0.9, ang(RED), A0 + SPAN); g.stroke();
    // live revs
    const grad = g.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#8c3a1c'); grad.addColorStop(0.6, '#d8642a'); grad.addColorStop(1, '#ffb05a');
    g.strokeStyle = r > RED ? '#ff4a2a' : grad;
    g.beginPath(); g.arc(cx, cy, R * 0.9, A0, ang(r)); g.stroke();
    // ticks and numerals (x1000)
    g.fillStyle = 'rgba(236,230,217,0.75)';
    g.font = `900 ${Math.round(R * 0.15)}px 'Big Shoulders Stencil Display', Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= MAXR / 500; k++) {
      const a = ang(k * 500), major = k % 2 === 0, c = Math.cos(a), s = Math.sin(a);
      g.strokeStyle = k * 500 >= RED ? 'rgba(255,90,60,0.9)' : major ? 'rgba(236,230,217,0.8)' : 'rgba(236,230,217,0.35)';
      g.lineWidth = major ? 2 : 1;
      const r0 = R * (major ? 0.72 : 0.77), r1 = R * 0.8;
      g.beginPath(); g.moveTo(cx + c * r0, cy + s * r0); g.lineTo(cx + c * r1, cy + s * r1); g.stroke();
      if (major) g.fillText(String(k / 2), cx + c * R * 0.6, cy + s * R * 0.6);
    }
    // needle tip
    const a = ang(r);
    g.strokeStyle = '#ece6d9'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78); g.lineTo(cx + Math.cos(a) * R * 1.0, cy + Math.sin(a) * R * 1.0); g.stroke();
  }

  // ---- minimap ----
  const mc = $('.map canvas'), mx = mc.getContext('2d');
  let mapImg = null, mapK = 1, mapMin = [0, 0];
  const VIEW = 420; // metres across the square
  function buildMap(world, S, n, startI) {
    const dpr = Math.min(2, devicePixelRatio || 1), px = $('.map').clientWidth * dpr || 176 * dpr;
    mapK = px / VIEW;
    const b = world.box, M = 260;
    let minx = b.minx - M, minz = b.minz - M, wx = b.maxx - b.minx + 2 * M, wz = b.maxz - b.minz + 2 * M;
    mapK = Math.min(mapK, 4096 / Math.max(wx, wz));
    const c = document.createElement('canvas');
    c.width = Math.ceil(wx * mapK); c.height = Math.ceil(wz * mapK);
    const g = c.getContext('2d');
    g.setTransform(mapK, 0, 0, mapK, -minx * mapK, -minz * mapK);
    g.lineJoin = g.lineCap = 'round';
    const map = world.map ?? { roads: [], rects: [] };
    if (map.water !== undefined) { g.fillStyle = 'rgba(70,110,135,0.16)'; g.fillRect(map.water, minz, minx + wx - map.water, wz); }
    for (const rc of map.rects) {
      g.save();
      g.translate(rc.x, rc.z);
      g.rotate(-rc.yaw);
      g.fillStyle = 'rgba(236,230,217,0.07)';
      g.strokeStyle = 'rgba(236,230,217,0.13)';
      g.lineWidth = 1 / mapK;
      g.fillRect(-rc.hx, -rc.hz, rc.hx * 2, rc.hz * 2);
      g.strokeRect(-rc.hx, -rc.hz, rc.hx * 2, rc.hz * 2);
      g.restore();
    }
    g.strokeStyle = 'rgba(236,230,217,0.1)';
    for (const rd of map.roads) {
      g.lineWidth = rd.w;
      g.beginPath();
      rd.pts.forEach(([x, z], k) => (k ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.stroke();
    }
    const loop = () => { g.beginPath(); for (let i = 0; i <= n; i++) { const k = i % n; i ? g.lineTo(S.px[k], S.pz[k]) : g.moveTo(S.px[k], S.pz[k]); } };
    loop(); g.strokeStyle = 'rgba(236,230,217,0.16)'; g.lineWidth = 26; g.stroke();
    loop(); g.strokeStyle = 'rgba(255,170,90,0.35)'; g.lineWidth = 5.5 / mapK + 3; g.stroke();
    loop(); g.strokeStyle = '#f4efe4'; g.lineWidth = 2.6 / mapK; g.stroke();
    // start / finish: a short bar across the line
    const i0 = ((startI % n) + n) % n, tx = S.tx[i0], tz = S.tz[i0];
    g.strokeStyle = '#ff7a2c'; g.lineWidth = 4 / mapK;
    g.beginPath(); g.moveTo(S.px[i0] - tz * 16, S.pz[i0] + tx * 16); g.lineTo(S.px[i0] + tz * 16, S.pz[i0] - tx * 16); g.stroke();
    mapImg = c; mapMin = [minx, minz];
  }
  function drawMap(x, z, yaw, racers) {
    if (!mapImg || !$('.map').clientWidth) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = $('.map').clientWidth, px = Math.round(w * dpr);
    if (mc.width !== px) { mc.width = mc.height = px; }
    const s = mapK, c = px / 2;
    const fX = Math.sin(yaw), fZ = Math.cos(yaw), rX = -Math.cos(yaw), rZ = Math.sin(yaw);
    // world -> screen, heading up: screen x = d·right, screen y = -d·forward
    const T = [rX * s, -fX * s, rZ * s, -fZ * s, c - s * (rX * x + rZ * z), c + s * (fX * x + fZ * z)];
    const g = mx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.setTransform(...T);
    g.drawImage(mapImg, mapMin[0], mapMin[1], mapImg.width / s, mapImg.height / s);
    for (const rc of racers) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const dx = rc.x - x, dz = rc.z - z, sxp = c + (dx * rX + dz * rZ) * s, syp = c - (dx * fX + dz * fZ) * s;
      g.fillStyle = rc.color ?? '#ff3b26';
      g.beginPath(); g.arc(sxp, syp, 3.4 * dpr, 0, Math.PI * 2); g.fill();
    }
    // you: an arrow at the centre pointing up
    g.setTransform(dpr, 0, 0, dpr, c, c);
    g.fillStyle = '#ff8a3a'; g.strokeStyle = '#0e0f11'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke();
  }

  let titleT = 0, cardKey = null, boardKey = '';
  const spot = $('.spot'), card = $('.card');
  return {
    touch: t,
    set onPause(fn) { onPause = fn; },
    // speed km/h (signed), boost 0..1, lap number, current / best lap seconds
    set({ speed, boost, boosting, throttle, lap, lapT, bestLap, dt = 1 / 60 }) {
      const kmh = Math.abs(speed);
      const ng = speed < -2 ? 'R' : kmh < 3 && !throttle ? 'N' : gearFor(kmh, gear);
      if (typeof ng === 'number' && typeof gear === 'number' && ng !== gear) shiftT = 0.18;
      shiftT = Math.max(0, shiftT - dt);
      let target = IDLE;
      if (typeof ng === 'number') {
        const lo = SHIFT[ng - 1], hi = SHIFT[ng], u = Math.min(1.08, (kmh - lo * 0.55) / (hi - lo * 0.55));
        target = IDLE + 400 + u * (RED - IDLE - 200) * (throttle ? 1 : 0.92);
      } else if (ng === 'R') target = IDLE + kmh * 120;
      if (shiftT > 0) target *= 0.94; // revs dip through the shift
      rpm += (target - rpm) * Math.min(1, dt * (shiftT > 0 ? 16 : 9));
      gear = ng;
      const box = $('.speed'), w = box.clientWidth, h = box.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      const key = `${Math.round(rpm / 20)}|${w}|${h}`;
      if (key !== lastDraw) { lastDraw = key; drawTacho(rpm, w, h, dpr); }
      $('.speed .v').textContent = String(Math.round(kmh));
      const gEl = $('.speed .g');
      gEl.textContent = String(gear);
      gEl.classList.toggle('shift', shiftT > 0 || rpm > RED);
      $('.boost .bar i').style.width = `${Math.round(boost * 100)}%`;
      $('.boost').classList.toggle('on', !!boosting);
      if (lap !== undefined) {
        $('.lap .n').textContent = `LAP ${lap}`;
        $('.lap .t').textContent = fmtT(lapT);
        $('.lap .b').textContent = bestLap ? `BEST ${fmtT(bestLap)}` : '';
      }
    },
    // rows: [{ name, you, gap, out }] in race order
    standings(rows) {
      const key = rows.map((r) => `${r.name}${r.gap ?? ''}${r.out ? 'x' : ''}`).join('|');
      if (key === boardKey) return;
      boardKey = key;
      const me = rows.findIndex((r) => r.you);
      $('.pos b').textContent = String(me + 1);
      $('.pos span').textContent = `/${rows.length}`;
      $('.board').innerHTML = rows.map((r, k) => `<div class="row${r.you ? ' you' : ''}${r.out ? ' out' : ''}"><i>${k + 1}</i><span>${r.name}</span><em>${r.gap ?? ''}</em></div>`).join('');
    },
    map: buildMap,
    mapUpdate: drawMap,
    track() {},
    pulseTrack() {},
    // Tutorial card. html allows <kbd>; spot = HUD part to light up ('speed', 'boost', 'map')
    // or null; kind = '' | 'ok' | 'warn'. key null hides.
    card(key, { title = '', sub = '', spot: sp = null, kind = '' } = {}) {
      if (key === null) {
        if (cardKey !== null) { cardKey = null; card.className = 'card out'; spot.classList.remove('on'); }
        return;
      }
      if (key === cardKey) { card.className = `card${kind ? ` ${kind}` : ''}`; return; }
      cardKey = key;
      card.querySelector('h4').innerHTML = title;
      card.querySelector('p').innerHTML = sub;
      card.className = `card in${kind ? ` ${kind}` : ''}`;
      const el = sp && root.querySelector(`.${sp}`);
      if (el && !el.hidden && el.offsetParent !== null) {
        const r = el.getBoundingClientRect(), pad = 8;
        Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        spot.classList.add('on');
      } else spot.classList.remove('on');
    },
    title(name, sub) {
      const el = $('.title');
      el.querySelector('h3').textContent = name;
      el.querySelector('p').textContent = sub;
      el.hidden = false;
      el.style.opacity = '1';
      clearTimeout(titleT);
      titleT = setTimeout(() => { el.style.opacity = '0'; }, 2800);
    },
    debug(text) { const d = $('.debug'); if (!d.hidden) d.textContent = text; },
    toggleDebug() { const d = $('.debug'); d.hidden = !d.hidden; },
    hide() { root.style.display = 'none'; },
  };
}
