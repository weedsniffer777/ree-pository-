// In-game HUD: route progress to the boss, speed, nitro, controls hint, debug overlay,
// and touch controls on coarse-pointer devices.

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Chakra Petch', 'Arial Narrow', system-ui, sans-serif; color: #fff; }
#hud .kills { position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: rgba(20,18,16,0.5); padding: 6px 16px 6px 10px; border-bottom: 3px solid #e2571b; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
#hud .kills svg { width: 34px; height: 34px; }
#hud .count { font: 600 28px/1 'Chakra Petch', system-ui, sans-serif; font-variant-numeric: tabular-nums; }
#hud .count span { font-size: 16px; opacity: 0.75; margin-left: 4px; }
#hud .klabel { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.85; }
#hud .pointer { position: absolute; left: 0; top: 0; width: 0; height: 0; }
#hud .pointer svg { position: absolute; width: 34px; height: 34px; left: -17px; top: -17px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
#hud .pointer span { position: absolute; left: -60px; top: 20px; width: 120px; white-space: nowrap; text-align: center; font-size: 12px; letter-spacing: 0.1em; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
#hud .oldprogress { position: absolute; top: calc(16px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); width: min(520px, calc(100% - 32px)); }
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
    <div class="kills">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10.5a7 7 0 0 1 14 0v3l-2 1.4V18H7v-3.1L5 13.5z" fill="#f2efe8" stroke="#17181a" stroke-width="1.2"/><circle cx="9.3" cy="11.2" r="1.8" fill="#17181a"/><circle cx="14.7" cy="11.2" r="1.8" fill="#17181a"/><path d="M10 18v2M12 18v2M14 18v2" stroke="#17181a" stroke-width="1.2"/></svg>
      <div><div class="count"><b>0</b><span>/ 60</span></div><div class="klabel">Kills</div></div>
    </div>
    <div class="pointer" hidden><svg viewBox="0 0 24 24"><path d="M12 2l8 16-8-4-8 4z" fill="#e0b52a" stroke="#17181a" stroke-width="1.5"/></svg><span></span></div>
    <div class="gauge"><div class="speed">0</div><div class="unit">KM/H</div><div class="nitro"><i></i></div></div>
    <div class="hint"><div><b>WASD</b>Drive</div><div><b>Shift</b>Nitro</div><div><b>Space</b>Handbrake</div><div><b>Mouse</b>Drag to look</div><div><b>R</b>Restart</div></div>
    <div class="banner" hidden><h2>The lakebed</h2><p>Enemies arrive in the next build</p></div>
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
    set({ speed, nitro, boosting, kills = 0, total = 60 }) {
      $('.speed').textContent = String(Math.round(speed));
      const n = $('.nitro');
      n.firstChild.style.width = `${Math.round(nitro * 100)}%`;
      n.classList.toggle('on', boosting);
      $('.count b').textContent = String(kills);
      $('.count span').textContent = `/ ${total}`;
    },
    // screen-space pointer: x, y in px, angle in radians (0 = up), label; pass null to hide
    pointer(p) {
      const el = $('.pointer');
      el.hidden = !p;
      if (!p) return;
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.firstChild.style.transform = `rotate(${p.angle}rad)`;
      el.lastChild.textContent = p.label;
    },
    banner(show) { $('.banner').hidden = !show; },
    debug(text) { const d = $('.debug'); if (!d.hidden) d.textContent = text; },
    toggleDebug() { const d = $('.debug'); d.hidden = !d.hidden; },
    showHint() { clearTimeout(hintTimer); $('.hint').style.opacity = '1'; hintTimer = setTimeout(() => { $('.hint').style.opacity = '0'; }, 9000); },
    hide() { root.style.display = 'none'; },
  };
}
