// Endless-mode HUD in a road-sign language: green mile-marker plate for distance, a
// speed-limit plate for speed, hazard-striped boost, a thin pursuit line (you vs the
// pursuer), and centred yellow tutorial cards with a spotlight on the HUD part in question.

const CSS = `
#hud { --yellow: #f2c21b; --black: #16171a; --green: #0f6b3e; --white: #f2efe6; --red: #d7261e; --blood: #9e1410;
  --display: 'Big Shoulders Stencil Display', 'Arial Narrow', Impact, sans-serif;
  --sign: 'Overpass', 'Arial Narrow', system-ui, sans-serif;
  position: fixed; inset: 0; pointer-events: none; color: var(--white); font-family: var(--sign); }
#hud .plate { background: var(--green); border: 3px solid var(--white); border-radius: 7px; box-shadow: 0 0 0 2px var(--green), 0 6px 0 rgba(0,0,0,0.35); }

/* distance: mile-marker plate */
#hud .dist { position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); left: 16px; padding: 6px 14px 7px; text-align: left; }
#hud .dist .v { font: 800 30px/1 var(--sign); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
#hud .dist .v small { font-size: 15px; font-weight: 700; margin-left: 3px; }
#hud .dist .b { font: 700 11px/1 var(--sign); letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-top: 4px; }

/* pursuit line: you (white) vs the pursuer (red) across the area; no text */
#hud .track { position: absolute; top: calc(30px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(380px, calc(100% - 320px)); min-width: 200px; height: 3px; border-radius: 2px; background: rgba(242,239,230,0.28); box-shadow: 0 1px 0 rgba(0,0,0,0.35); }
#hud .track .done { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: 2px; background: rgba(242,239,230,0.85); }
#hud .track .gap { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: rgba(215,38,30,0.75); }
#hud .track .end { position: absolute; right: -1px; top: -5px; width: 3px; height: 13px; border-radius: 2px; background: rgba(242,239,230,0.85); }
#hud .track .dot { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; border: 2px solid var(--black); }
#hud .track .you { background: var(--white); z-index: 2; }
#hud .track .them { background: var(--red); }
#hud .track .them.hot { animation: hot 0.6s ease-in-out infinite; }
#hud .track .them.pulse { animation: pulse 0.45s ease-out 3; }
@keyframes hot { 50% { box-shadow: 0 0 0 4px rgba(215,38,30,0.45), 0 0 14px rgba(215,38,30,0.9); } }
@keyframes pulse { from { box-shadow: 0 0 0 0 rgba(215,38,30,0.9); } to { box-shadow: 0 0 0 12px rgba(215,38,30,0); } }

/* speed: speed-limit plate + boost + cruise */
#hud .gauge { position: absolute; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; justify-items: end; gap: 8px; }
#hud .speed { background: var(--white); color: var(--black); border: 3px solid var(--black); border-radius: 8px; padding: 5px 12px 6px; min-width: 112px; text-align: center; box-shadow: 0 6px 0 rgba(0,0,0,0.3); }
#hud .speed .k { font: 800 10px/1 var(--sign); letter-spacing: 0.2em; }
#hud .speed .n { font: 800 50px/0.95 var(--sign); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
#hud .speed .u { font: 700 10px/1 var(--sign); letter-spacing: 0.2em; }
#hud .boost { width: 200px; }
#hud .boost .lbl { display: flex; justify-content: space-between; font: 900 15px/1 var(--display); letter-spacing: 0.12em; text-shadow: 2px 2px 0 var(--black); margin-bottom: 4px; }
#hud .boost .bar { height: 14px; border: 2px solid var(--black); background: rgba(22,23,26,0.65); position: relative; overflow: hidden; }
#hud .boost .bar i { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(-45deg, var(--yellow) 0 8px, var(--black) 8px 16px); }
#hud .boost.on .bar i { background: repeating-linear-gradient(-45deg, #ffe07a 0 8px, #ff7a14 8px 16px); }
#hud .cruise { font: 800 11px/1 var(--sign); letter-spacing: 0.16em; padding: 5px 8px 4px; border: 2px solid var(--black); background: rgba(22,23,26,0.6); color: rgba(242,239,230,0.55); }
#hud .cruise.on { background: var(--green); color: var(--white); border-color: var(--white); }
#hud kbd { display: inline-block; min-width: 1.5em; padding: 2px 5px 1px; margin-right: 6px; background: var(--white); color: var(--black); border-radius: 3px; border-bottom: 2px solid #9a968c; font: 800 0.95em/1 var(--sign); text-align: center; text-shadow: none; letter-spacing: 0.02em; }

/* tutorial: centred card, plus a dimmed screen with a cut-out over the HUD part it is about */
#hud .spot { position: absolute; border-radius: 10px; box-shadow: 0 0 0 200vmax rgba(10,10,12,0.42), 0 0 0 3px var(--yellow), 0 0 22px 4px rgba(242,194,27,0.6); transition: left 0.3s, top 0.3s, width 0.3s, height 0.3s, opacity 0.3s; opacity: 0; }
#hud .spot.on { opacity: 1; }
#hud .card { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); background: var(--yellow); color: var(--black); border: 3px solid var(--black); border-radius: 8px; padding: 12px 22px 11px; text-align: center; box-shadow: 0 7px 0 rgba(0,0,0,0.35); max-width: calc(100% - 32px); transition: opacity 0.25s, transform 0.25s, background 0.2s; }
#hud .card h4 { margin: 0; font: 900 clamp(22px, 3.4vw, 32px)/1 var(--display); letter-spacing: 0.05em; text-transform: uppercase; }
#hud .card p { margin: 7px 0 0; font: 800 14px/1.2 var(--sign); letter-spacing: 0.08em; text-transform: uppercase; }
#hud .card p:empty { display: none; }
#hud .card kbd { background: var(--black); color: var(--yellow); border-bottom-color: #000; }
#hud .card.ok { background: #7fd36a; }
#hud .card.warn { background: var(--red); color: var(--white); }
#hud .card.warn kbd { background: var(--white); color: var(--black); }
#hud .card.out { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
#hud .card.in { animation: cardIn 0.32s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes cardIn { from { transform: translate(-50%, -50%) scale(1.25); opacity: 0; } }

/* area title card */
#hud .title { position: absolute; top: 12%; left: 50%; transform: translateX(-50%); text-align: center; transition: opacity 0.7s; }
#hud .title h3 { margin: 0; font: 900 clamp(34px, 7vw, 68px)/0.9 var(--display); letter-spacing: 0.04em; text-transform: uppercase; transform: skewX(-8deg); text-shadow: 3px 4px 0 var(--black); }
#hud .title p { display: inline-block; margin: 8px 0 0; padding: 5px 12px 4px; font: 800 13px/1 var(--sign); letter-spacing: 0.18em; text-transform: uppercase; }

#hud .debug { position: absolute; top: calc(96px + env(safe-area-inset-top, 0px)); left: 16px; margin: 0; font: 12px/1.5 ui-monospace, monospace; background: rgba(0,0,0,0.6); padding: 8px 10px; white-space: pre; }
#hud .touch { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
#hud .touch .btn { position: absolute; width: 78px; height: 78px; border-radius: 50%; border: 3px solid var(--black); display: grid; place-items: center; font: 900 15px/1 var(--display); letter-spacing: 0.08em; box-shadow: 0 5px 0 rgba(0,0,0,0.35); }
#hud .touch .boostBtn { right: 20px; bottom: calc(190px + env(safe-area-inset-bottom, 0px)); background: var(--yellow); color: var(--black); }
#hud .touch .fireBtn { right: 108px; bottom: calc(170px + env(safe-area-inset-bottom, 0px)); background: var(--red); }
#hud .touch .brakeBtn { right: 20px; bottom: calc(280px + env(safe-area-inset-bottom, 0px)); width: 60px; height: 60px; background: var(--white); color: var(--black); }
#hud .touch .steerL, #hud .touch .steerR { bottom: calc(26px + env(safe-area-inset-bottom, 0px)); width: 92px; height: 92px; border-radius: 22px; background: rgba(242,239,230,0.55); color: var(--black); font-size: 30px; }
#hud .touch .steerL { left: calc(16px + env(safe-area-inset-left, 0px)); }
#hud .touch .steerR { left: calc(116px + env(safe-area-inset-left, 0px)); }
#hud .touch .btn.down { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
/* phones held sideways: the portrait layout, compacted, buttons left of the gauge */
@media (orientation: landscape) and (max-height: 520px) {
  #hud .gauge { right: calc(14px + env(safe-area-inset-right, 0px)); bottom: calc(12px + env(safe-area-inset-bottom, 0px)); gap: 6px; }
  #hud .speed { min-width: 88px; padding: 3px 10px 4px; }
  #hud .speed .n { font-size: 32px; }
  #hud .boost { width: 120px; }
  #hud .boost .lbl { font-size: 12px; }
  #hud .boost .bar { height: 10px; }
  #hud .dist { left: calc(14px + env(safe-area-inset-left, 0px)); top: 10px; padding: 4px 10px 5px; }
  #hud .dist .v { font-size: 22px; }
  #hud .track { top: 20px; width: min(320px, calc(100% - 360px)); }
  #hud .title { top: 18%; }
  #hud .title h3 { font-size: 34px; }
  #hud .card { top: 34%; padding: 8px 16px 7px; }
  #hud .card h4 { font-size: 20px; }
  #hud .card p { font-size: 12px; }
  #hud .touch .btn { width: 64px; height: 64px; font-size: 13px; }
  #hud .touch .boostBtn { right: calc(150px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .fireBtn { right: calc(226px + env(safe-area-inset-right, 0px)); bottom: calc(40px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .brakeBtn { right: calc(156px + env(safe-area-inset-right, 0px)); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); width: 52px; height: 52px; font-size: 12px; }
  #hud .touch .steerL, #hud .touch .steerR { width: 78px; height: 78px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
  #hud .touch .steerR { left: calc(104px + env(safe-area-inset-left, 0px)); }
}
@media (max-width: 720px) {
  #hud .track { top: calc(90px + env(safe-area-inset-top, 0px)); width: calc(100% - 64px); }
  #hud .speed .n { font-size: 38px; }
  #hud .boost { width: 150px; }
}
`;

export function createHud({ touch = false } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="dist plate"><div class="v">0.00<small>km</small></div><div class="b">Best 0.00 km</div></div>
    <div class="track"><div class="done"></div><div class="gap"></div><div class="end"></div><div class="dot them" hidden></div><div class="dot you"></div></div>
    <div class="gauge">
      <div class="speed"><div class="k">SPEED</div><div class="n">0</div><div class="u">KM/H</div></div>
      <div class="boost"><div class="lbl"><span>BOOST</span><span class="bk"><kbd>Shift</kbd></span></div><div class="bar"><i></i></div></div>
      <div class="cruise"><kbd>E</kbd>CRUISE</div>
    </div>
    <div class="spot"></div>
    <div class="card out"><h4></h4><p></p></div>
    <div class="title" hidden><h3></h3><p class="plate"></p></div>
    <pre class="debug" hidden></pre>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  // left thumb steers (two hold buttons), right thumb fires / boosts / brakes
  const t = { left: false, right: false, boost: false, brake: false, fire: false, active: touch, get steer() { return (this.right ? 1 : 0) - (this.left ? 1 : 0); } };
  if (touch) {
    const layer = document.createElement('div');
    layer.className = 'touch';
    layer.innerHTML = '<div class="btn steerL">&#9664;</div><div class="btn steerR">&#9654;</div><div class="btn brakeBtn">BRAKE</div><div class="btn fireBtn">FIRE</div><div class="btn boostBtn">BOOST</div>';
    root.append(layer);
    const hold = (el, key) => {
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); t[key] = true; el.classList.add('down'); el.setPointerCapture(e.pointerId); });
      const up = () => { t[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold(layer.querySelector('.boostBtn'), 'boost');
    hold(layer.querySelector('.fireBtn'), 'fire');
    hold(layer.querySelector('.brakeBtn'), 'brake');
    hold(layer.querySelector('.steerL'), 'left');
    hold(layer.querySelector('.steerR'), 'right');
    $('.cruise').hidden = true;
    $('.bk').hidden = true;
  }

  let titleT = 0, cardKey = null;
  const track = $('.track'), them = $('.track .them'), spot = $('.spot'), card = $('.card');
  return {
    touch: t,
    set({ speed, boost, boosting, cruise, dist, best, sub }) {
      $('.speed .n').textContent = String(Math.round(speed));
      $('.boost .bar i').style.width = `${Math.round(boost * 100)}%`;
      $('.boost').classList.toggle('on', boosting);
      const cr = $('.cruise');
      if (cr.classList.contains('on') !== cruise) {
        cr.classList.toggle('on', cruise);
        cr.innerHTML = cruise ? '<kbd>E</kbd>CRUISE OFF' : '<kbd>E</kbd>CRUISE';
      }
      $('.dist .v').firstChild.textContent = (dist / 1000).toFixed(2);
      $('.dist .b').textContent = sub ?? `Best ${(best / 1000).toFixed(2)} km`;
    },
    // you/them as fractions 0..1 of the current area (them null when away)
    track({ you, them: tp, hot }) {
      const yp = Math.max(0, Math.min(1, you));
      $('.track .you').style.left = `${(yp * 100).toFixed(2)}%`;
      $('.track .done').style.width = `${(yp * 100).toFixed(2)}%`;
      const g = $('.track .gap');
      if (tp === null) { them.hidden = true; g.style.width = '0'; return; }
      const bp = Math.max(0, Math.min(1, tp));
      them.hidden = false;
      them.style.left = `${(bp * 100).toFixed(2)}%`;
      them.classList.toggle('hot', !!hot && !them.classList.contains('pulse'));
      g.style.left = `${(bp * 100).toFixed(2)}%`;
      g.style.width = `${(Math.max(0, yp - bp) * 100).toFixed(2)}%`;
    },
    pulseTrack() {
      them.classList.remove('pulse', 'hot');
      void them.offsetWidth;
      them.classList.add('pulse');
      setTimeout(() => them.classList.remove('pulse'), 1400);
    },
    // Tutorial card. html allows <kbd>; spot = HUD part to light up ('speed', 'cruise',
    // 'boost', 'track', 'dist') or null; kind = '' | 'ok' | 'warn'. key null hides.
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
        const r = el.getBoundingClientRect(), pad = sp === 'track' ? 14 : 8;
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
