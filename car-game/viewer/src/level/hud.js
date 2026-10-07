// In-game HUD: route progress to the boss, speed, nitro, controls hint, debug overlay,
// and touch controls on coarse-pointer devices.

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Chakra Petch', 'Arial Narrow', system-ui, sans-serif; color: #fff; }
#hud .progress { position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(520px, calc(100% - 32px)); }
#hud .track { position: relative; height: 10px; background: rgba(20,18,16,0.55); border: 1px solid rgba(255,255,255,0.35); border-radius: 2px; }
#hud .fill { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg, #e0b52a, #e2571b); }
#hud .car { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; background: #fff; border: 2px solid #17181a; border-radius: 50%; left: 0; }
#hud .boss { position: absolute; right: -6px; top: 50%; transform: translate(50%, -50%); width: 26px; height: 26px; }
#hud .plabel { display: flex; justify-content: space-between; margin-top: 6px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
#hud .gauge { position: absolute; right: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); text-align: right; text-shadow: 0 2px 6px rgba(0,0,0,0.5); }
#hud .speed { font: 600 64px/0.9 'Chakra Petch', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
#hud .unit { font-size: 13px; letter-spacing: 0.16em; opacity: 0.85; }
#hud .nitro { margin-top: 8px; width: 190px; height: 12px; border: 1px solid rgba(255,255,255,0.5); background: rgba(20,18,16,0.5); margin-left: auto; position: relative; overflow: hidden; }
#hud .nitro i { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(-45deg, #e0b52a 0 8px, #17181a 8px 16px); }
#hud .nitro.on i { background: repeating-linear-gradient(-45deg, #8fd0ff 0 8px, #2b6fd6 8px 16px); }
#hud .hint { position: absolute; left: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); font-size: 13px; letter-spacing: 0.06em; line-height: 1.7; background: rgba(20,18,16,0.45); padding: 10px 14px; border-left: 3px solid #e0b52a; transition: opacity 1s; }
#hud .hint b { display: inline-block; min-width: 54px; color: #f0c64a; font-weight: 600; }
#hud .banner { position: absolute; top: 34%; left: 50%; transform: translateX(-50%); text-align: center; text-shadow: 0 3px 10px rgba(0,0,0,0.55); transition: opacity 0.6s; }
#hud .banner h2 { margin: 0; font: 600 44px/1 'Chakra Petch', system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
#hud .banner p { margin: 8px 0 0; font-size: 16px; letter-spacing: 0.1em; }
#hud .debug { position: absolute; top: calc(56px + env(safe-area-inset-top, 0px)); left: 16px; margin: 0; font: 12px/1.5 ui-monospace, monospace; background: rgba(0,0,0,0.6); padding: 8px 10px; white-space: pre; }
#hud .touch { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
#hud .touch .btn { position: absolute; bottom: calc(150px + env(safe-area-inset-bottom, 0px)); width: 84px; height: 84px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.7); background: rgba(20,18,16,0.45); display: grid; place-items: center; font-size: 13px; letter-spacing: 0.1em; }
#hud .touch .nitroBtn { right: 24px; }
#hud .touch .brakeBtn { right: 124px; width: 64px; height: 64px; }
#hud .touch .btn.down { background: rgba(224,181,42,0.6); }
@media (max-width: 600px) { #hud .speed { font-size: 46px; } #hud .nitro { width: 140px; } #hud .hint { display: none; } }
`;

export function createHud({ touch = false } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="progress">
      <div class="track"><div class="fill"></div><div class="car"></div>
        <svg class="boss" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#17181a" stroke="#e2571b" stroke-width="2"/><path d="M7 10.5a5 5 0 0 1 10 0v2.5l-1.5 1V16h-7v-2L7 13z" fill="#f2efe8"/><circle cx="10" cy="11" r="1.4" fill="#17181a"/><circle cx="14" cy="11" r="1.4" fill="#17181a"/></svg>
      </div>
      <div class="plabel"><span class="dist">0 m</span><span>Boss</span></div>
    </div>
    <div class="gauge"><div class="speed">0</div><div class="unit">KM/H</div><div class="nitro"><i></i></div></div>
    <div class="hint"><div><b>WASD</b>Drive</div><div><b>Shift</b>Nitro</div><div><b>Space</b>Handbrake</div><div><b>Mouse</b>Drag to look</div><div><b>R</b>Restart</div></div>
    <div class="banner" hidden><h2>Boss arena</h2><p>The boss fight comes next</p></div>
    <pre class="debug" hidden></pre>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const t = { steer: 0, nitro: false, brake: false, active: touch };
  if (touch) {
    const layer = document.createElement('div');
    layer.className = 'touch';
    layer.innerHTML = '<div class="btn brakeBtn">Brake</div><div class="btn nitroBtn">Nitro</div>';
    root.append(layer);
    const nitroBtn = layer.querySelector('.nitroBtn');
    const brakeBtn = layer.querySelector('.brakeBtn');
    const hold = (el, key) => {
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); t[key] = true; el.classList.add('down'); el.setPointerCapture(e.pointerId); });
      const up = () => { t[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    hold(nitroBtn, 'nitro');
    hold(brakeBtn, 'brake');
    let sid = null, sx = 0;
    layer.addEventListener('pointerdown', (e) => { if (e.target !== layer) return; sid = e.pointerId; sx = e.clientX; layer.setPointerCapture(e.pointerId); });
    layer.addEventListener('pointermove', (e) => { if (e.pointerId === sid) t.steer = Math.max(-1, Math.min(1, (e.clientX - sx) / (innerWidth * 0.12))); });
    const end = (e) => { if (e.pointerId === sid) { sid = null; t.steer = 0; } };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    $('.hint').hidden = true;
  }
  let hintTimer = setTimeout(() => { $('.hint').style.opacity = '0'; }, 9000);
  return {
    touch: t,
    set({ speed, nitro, boosting, progress, dist }) {
      $('.speed').textContent = String(Math.round(speed));
      const n = $('.nitro');
      n.firstChild.style.width = `${Math.round(nitro * 100)}%`;
      n.classList.toggle('on', boosting);
      $('.fill').style.width = `${(progress * 100).toFixed(1)}%`;
      $('.car').style.left = `${(progress * 100).toFixed(1)}%`;
      $('.dist').textContent = `${Math.max(0, Math.round(dist))} m`;
    },
    banner(show) { $('.banner').hidden = !show; },
    debug(text) { const d = $('.debug'); if (!d.hidden) d.textContent = text; },
    toggleDebug() { const d = $('.debug'); d.hidden = !d.hidden; },
    showHint() { clearTimeout(hintTimer); $('.hint').style.opacity = '1'; hintTimer = setTimeout(() => { $('.hint').style.opacity = '0'; }, 9000); },
    hide() { root.style.display = 'none'; },
  };
}
