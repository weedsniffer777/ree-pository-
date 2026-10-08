// Endless-mode HUD in a road-sign language: green mile-marker plate for distance, a
// speed-limit plate for speed, hazard-striped boost, a stencilled area bar where you
// race the war machine, slam-in warning bands, and yellow tutorial plates.

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

/* area bar: you vs the war machine */
#hud .area { position: absolute; top: calc(18px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(560px, calc(100% - 300px)); min-width: 260px; }
#hud .area .row { display: flex; justify-content: space-between; align-items: baseline; font: 900 18px/1 var(--display); letter-spacing: 0.08em; text-transform: uppercase; text-shadow: 2px 2px 0 var(--black); margin-bottom: 6px; }
#hud .area .row span:last-child { color: var(--yellow); }
#hud .lane { position: relative; height: 18px; background: #2b2a29; border: 2px solid var(--black); box-shadow: 0 4px 0 rgba(0,0,0,0.3); overflow: visible; }
#hud .lane::before { content: ''; position: absolute; left: 6px; right: 26px; top: 7px; height: 2px; background: repeating-linear-gradient(90deg, var(--yellow) 0 12px, transparent 12px 22px); opacity: 0.75; }
#hud .lane .done { position: absolute; inset: 0 auto 0 0; width: 0; background: rgba(242,194,27,0.22); }
#hud .lane .danger { position: absolute; top: 0; bottom: 0; left: 0; width: 0; background: linear-gradient(90deg, rgba(215,38,30,0.15), rgba(215,38,30,0.75)); }
#hud .lane .flag { position: absolute; right: -2px; top: -2px; bottom: -2px; width: 22px; background: conic-gradient(var(--white) 25%, var(--black) 0 50%, var(--white) 0 75%, var(--black) 0) 0 0 / 11px 11px; border: 2px solid var(--black); }
#hud .mark { position: absolute; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; transition: left 0.08s linear; }
#hud .mark svg { width: 100%; height: 100%; filter: drop-shadow(1px 2px 0 var(--black)); }
#hud .mark.you { z-index: 2; }
#hud .mark.beast { width: 38px; height: 38px; margin: -19px 0 0 -19px; }
#hud .area .status { margin-top: 6px; text-align: center; font: 800 12px/1 var(--sign); letter-spacing: 0.16em; text-transform: uppercase; text-shadow: 1px 1px 0 var(--black); min-height: 12px; }
#hud .area .status.hot { color: #ff8a7a; }
#hud .area.flash .lane { animation: flash 0.32s steps(2) 6; }
@keyframes flash { 50% { border-color: var(--red); box-shadow: 0 0 0 3px var(--red), 0 0 18px var(--red); } }
#hud .area.caught .lane { animation: flash 0.5s steps(2) infinite; }

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

/* tutorial plate */
#hud .tip { position: absolute; left: 50%; bottom: calc(26px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--yellow); color: var(--black); border: 3px solid var(--black); border-radius: 6px; padding: 9px 16px 8px; font: 800 17px/1.1 var(--sign); letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0 6px 0 rgba(0,0,0,0.3); white-space: nowrap; transition: opacity 0.25s, transform 0.25s; }
#hud .tip kbd { background: var(--black); color: var(--yellow); border-bottom-color: #000; }
#hud .tip.out { opacity: 0; transform: translate(-50%, 12px); }

/* slam-in warning band */
#hud .band { position: absolute; left: 0; right: 0; top: 30%; text-align: center; padding: 12px 16px 14px; background: repeating-linear-gradient(-45deg, var(--red) 0 22px, var(--blood) 22px 44px); border-top: 4px solid var(--black); border-bottom: 4px solid var(--black); }
#hud .band.good { background: repeating-linear-gradient(-45deg, var(--yellow) 0 22px, #d9a90f 22px 44px); color: var(--black); }
#hud .band h2 { margin: 0; font: 900 clamp(30px, 6vw, 60px)/0.95 var(--display); letter-spacing: 0.05em; text-transform: uppercase; transform: skewX(-8deg); text-shadow: 3px 3px 0 var(--black); }
#hud .band.good h2 { text-shadow: 3px 3px 0 rgba(255,255,255,0.4); }
#hud .band p { margin: 6px 0 0; font: 800 14px/1 var(--sign); letter-spacing: 0.18em; text-transform: uppercase; }
#hud .band.in { animation: slam 0.35s cubic-bezier(.2,1.6,.4,1) both; }
#hud .band.outa { animation: leave 0.4s ease-in both; }
@keyframes slam { from { transform: scale(1.5) rotate(-2deg); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes leave { to { transform: translateY(-20px); opacity: 0; } }

/* area title card */
#hud .title { position: absolute; top: 22%; left: 50%; transform: translateX(-50%); text-align: center; transition: opacity 0.7s; }
#hud .title h3 { margin: 0; font: 900 clamp(34px, 7vw, 68px)/0.9 var(--display); letter-spacing: 0.04em; text-transform: uppercase; transform: skewX(-8deg); text-shadow: 3px 4px 0 var(--black); }
#hud .title p { display: inline-block; margin: 8px 0 0; padding: 5px 12px 4px; font: 800 13px/1 var(--sign); letter-spacing: 0.18em; text-transform: uppercase; }

#hud .debug { position: absolute; top: calc(96px + env(safe-area-inset-top, 0px)); left: 16px; margin: 0; font: 12px/1.5 ui-monospace, monospace; background: rgba(0,0,0,0.6); padding: 8px 10px; white-space: pre; }
#hud .touch { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
#hud .touch .btn { position: absolute; width: 78px; height: 78px; border-radius: 50%; border: 3px solid var(--black); display: grid; place-items: center; font: 900 15px/1 var(--display); letter-spacing: 0.08em; box-shadow: 0 5px 0 rgba(0,0,0,0.35); }
#hud .touch .boostBtn { right: 20px; bottom: calc(190px + env(safe-area-inset-bottom, 0px)); background: var(--yellow); color: var(--black); }
#hud .touch .fireBtn { right: 108px; bottom: calc(170px + env(safe-area-inset-bottom, 0px)); background: var(--red); }
#hud .touch .brakeBtn { right: 20px; bottom: calc(280px + env(safe-area-inset-bottom, 0px)); width: 60px; height: 60px; background: var(--white); color: var(--black); }
#hud .touch .btn.down { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
@media (max-width: 720px) {
  #hud .area { top: calc(84px + env(safe-area-inset-top, 0px)); width: calc(100% - 32px); }
  #hud .speed .n { font-size: 38px; }
  #hud .boost { width: 150px; }
}
`;

const YOU = '<svg viewBox="0 0 30 30"><path d="M15 3l9 22-9-5-9 5z" fill="#f2c21b" stroke="#16171a" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const BEAST = '<svg viewBox="0 0 40 40"><path d="M4 26V17l5-1 3-6h12l2 6h7l3 4v6z" fill="#d7261e" stroke="#16171a" stroke-width="2.4" stroke-linejoin="round"/><path d="M36 20l3-2v6l-3-1zM12 10l1-4 2 4M18 10l1-4 2 4" fill="#16171a" stroke="#16171a" stroke-width="1.6"/><circle cx="11" cy="28" r="4" fill="#16171a"/><circle cx="29" cy="28" r="4" fill="#16171a"/><rect x="14" y="13" width="7" height="4" fill="#16171a"/></svg>';

export function createHud({ touch = false } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="dist plate"><div class="v">0.00<small>km</small></div><div class="b">Best 0.00 km</div></div>
    <div class="area">
      <div class="row"><span class="aname">Area 1</span><span class="anext">Desert Highway</span></div>
      <div class="lane"><div class="done"></div><div class="danger"></div><div class="flag"></div>
        <div class="mark beast" hidden>${BEAST}</div><div class="mark you">${YOU}</div></div>
      <div class="status"></div>
    </div>
    <div class="gauge">
      <div class="speed"><div class="k">SPEED</div><div class="n">0</div><div class="u">KM/H</div></div>
      <div class="boost"><div class="lbl"><span>BOOST</span><span class="bk"><kbd>Shift</kbd></span></div><div class="bar"><i></i></div></div>
      <div class="cruise"><kbd>E</kbd>CRUISE</div>
    </div>
    <div class="tip out"></div>
    <div class="band" hidden><h2></h2><p></p></div>
    <div class="title" hidden><h3></h3><p class="plate"></p></div>
    <pre class="debug" hidden></pre>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const t = { steer: 0, boost: false, brake: false, fire: false, active: touch };
  if (touch) {
    const layer = document.createElement('div');
    layer.className = 'touch';
    layer.innerHTML = '<div class="btn brakeBtn">BRAKE</div><div class="btn fireBtn">FIRE</div><div class="btn boostBtn">BOOST</div>';
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
    let sid = null, sx = 0;
    layer.addEventListener('pointerdown', (e) => { if (e.target !== layer) return; sid = e.pointerId; sx = e.clientX; layer.setPointerCapture(e.pointerId); });
    layer.addEventListener('pointermove', (e) => { if (e.pointerId === sid) t.steer = Math.max(-1, Math.min(1, (e.clientX - sx) / (innerWidth * 0.12))); });
    const end = (e) => { if (e.pointerId === sid) { sid = null; t.steer = 0; } };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    $('.cruise').hidden = true;
    $('.bk').hidden = true;
  }

  let bandT = 0, titleT = 0, tipKey = null;
  const area = $('.area');
  return {
    touch: t,
    set({ speed, boost, boosting, cruise, dist, best }) {
      $('.speed .n').textContent = String(Math.round(speed));
      $('.boost .bar i').style.width = `${Math.round(boost * 100)}%`;
      $('.boost').classList.toggle('on', boosting);
      $('.cruise').classList.toggle('on', cruise);
      $('.dist .v').firstChild.textContent = (dist / 1000).toFixed(2);
      $('.dist .b').textContent = `Best ${(best / 1000).toFixed(2)} km`;
    },
    // you/beast as fractions 0..1 of the current area (beast null when away)
    area({ k, name, you, beast, status, hot, caught }) {
      $('.aname').textContent = `Area ${k + 1}`;
      $('.anext').textContent = name;
      const yp = Math.max(0, Math.min(1, you));
      $('.mark.you').style.left = `${(yp * 100).toFixed(2)}%`;
      $('.lane .done').style.width = `${(yp * 100).toFixed(2)}%`;
      const b = $('.mark.beast');
      const d = $('.lane .danger');
      if (beast === null) { b.hidden = true; d.style.width = '0'; }
      else {
        const bp = Math.max(-0.03, Math.min(1, beast));
        b.hidden = false;
        b.style.left = `${(bp * 100).toFixed(2)}%`;
        d.style.left = `${(Math.max(0, bp) * 100).toFixed(2)}%`;
        d.style.width = `${(Math.max(0, yp - Math.max(0, bp)) * 100).toFixed(2)}%`;
      }
      const st = $('.area .status');
      st.textContent = status;
      st.classList.toggle('hot', !!hot);
      area.classList.toggle('caught', !!caught);
    },
    flashArea() {
      area.classList.remove('flash');
      void area.offsetWidth;
      area.classList.add('flash');
    },
    band(title, sub, kind = 'bad', ms = 2600) {
      const b = $('.band');
      b.className = `band in${kind === 'good' ? ' good' : ''}`;
      b.querySelector('h2').textContent = title;
      b.querySelector('p').textContent = sub;
      b.hidden = false;
      clearTimeout(bandT);
      bandT = setTimeout(() => { b.classList.add('outa'); setTimeout(() => { b.hidden = true; }, 400); }, ms);
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
    // tutorial plate; html allows <kbd>; null hides
    tip(key, html) {
      const el = $('.tip');
      if (key === tipKey) return;
      tipKey = key;
      if (!html) { el.classList.add('out'); return; }
      el.innerHTML = html;
      el.classList.remove('out');
    },
    debug(text) { const d = $('.debug'); if (!d.hidden) d.textContent = text; },
    toggleDebug() { const d = $('.debug'); d.hidden = !d.hidden; },
    hide() { root.style.display = 'none'; },
  };
}
