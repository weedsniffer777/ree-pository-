// Race HUD: a slick racing layout worn down to gunmetal and rust. Top left: race position,
// lap and lap times, standings under them. Top right: pause and the dev kit. Bottom left:
// a square heading-up minimap (faint yard geometry, the circuit as a bright line, racers
// as dots). Bottom right: tacho with simulated gears, speed and the boost bar. Centred
// yellow tutorial cards still spotlight the HUD part they are about.

import { XRay, damageColor } from './xray.js';

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
/* phones: no selection, long-press callouts, magnifier or tap highlight anywhere in the game */
html, body, #hud, #hud * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
#hud .touch, #hud .touch * { touch-action: none; }
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

/* armor: top-down car, four zones + core, green -> grey -> black */
#hud .armor { position: absolute; left: calc(var(--gx) + 186px); bottom: calc(var(--gyb) - 8px); width: 134px; height: 236px; filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)); }
#hud .armor canvas { width: 100%; height: calc(100% - 34px); display: block; }
#hud .armor .hp { text-align: center; font: 900 32px/1 var(--display); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; text-shadow: 0 2px 0 rgba(0,0,0,0.65); white-space: nowrap; }
#hud .armor .hp .lbl { font-size: 11px; margin-right: 2px; }
#hud .armor .hp small { font-size: 15px; color: var(--dim); }
/* lock-on, military fire-control style: white reticle with mil ticks; a lock is phosphor
   green corner brackets + LOCK and range. No outlines, just a soft glow on the lock. */
#hud { --lock: #5dff7a; --ret: rgba(255,255,255,0.9); --mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; }
#hud .ret { position: absolute; left: 0; top: 0; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.6); transform: translate(-50%, -50%); }
#hud .ret b { position: absolute; background: var(--ret); }
#hud .ret b:nth-of-type(1) { left: 50%; top: -1px; width: 1.5px; height: 12px; margin-left: -0.75px; }
#hud .ret b:nth-of-type(2) { left: 50%; bottom: -1px; width: 1.5px; height: 12px; margin-left: -0.75px; }
#hud .ret b:nth-of-type(3) { top: 50%; left: -1px; height: 1.5px; width: 12px; margin-top: -0.75px; }
#hud .ret b:nth-of-type(4) { top: 50%; right: -1px; height: 1.5px; width: 12px; margin-top: -0.75px; }
#hud .ret > i { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px; background: var(--ret); }
#hud .ret.lock { border-color: rgba(93,255,122,0.9); }
#hud .ret.lock b, #hud .ret.lock > i { background: var(--lock); }
#hud .ret.far { border-color: rgba(255,59,38,0.9); animation: farBlink 0.5s steps(1) infinite; }
#hud .ret.far b, #hud .ret.far > i { background: #ff3b26; }
@keyframes farBlink { 50% { border-color: rgba(255,255,255,0.9); } }
/* gun heat: a thin vertical bar beside the reticle, filling from the bottom; overheated,
   reticle and bar flash red / white */
#hud .ret .heatv { position: absolute; left: calc(100% + 12px); top: 15%; height: 70%; width: 5px; background: rgba(14,15,17,0.45); text-decoration: none; }
#hud .ret .heatv i { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(0deg, #e9d24a, #ff9a2a 55%, #ff3b1a); }
#hud .ret.hot { animation: hotRing 0.3s steps(1) infinite; }
#hud .ret.hot b, #hud .ret.hot > i, #hud .ret.hot .heatv i { animation: hotFill 0.3s steps(1) infinite; }
@keyframes hotRing { 0% { border-color: #ff3b26; } 50% { border-color: #fff; } }
@keyframes hotFill { 0% { background: #ff3b26; } 50% { background: #fff; } }
/* tags: solid coloured boxes so the text reads on any background */
#hud .tag { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); padding: 3px 7px 2px; font: 800 11px/1 var(--mono); letter-spacing: 0.12em; white-space: nowrap; }
#hud .ret .tag { background: #ff3b26; color: #fff; animation: tagBlink 0.5s steps(1) infinite; }
@keyframes tagBlink { 50% { background: #fff; color: #ff3b26; } }
#hud .lockbox { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); filter: drop-shadow(0 0 5px rgba(93,255,122,0.45));
  --c: var(--lock); --l: 30%; --w: 2px;
  background:
    linear-gradient(var(--c), var(--c)) top left / var(--l) var(--w) no-repeat, linear-gradient(var(--c), var(--c)) top left / var(--w) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) top right / var(--l) var(--w) no-repeat, linear-gradient(var(--c), var(--c)) top right / var(--w) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom left / var(--l) var(--w) no-repeat, linear-gradient(var(--c), var(--c)) bottom left / var(--w) var(--l) no-repeat,
    linear-gradient(var(--c), var(--c)) bottom right / var(--l) var(--w) no-repeat, linear-gradient(var(--c), var(--c)) bottom right / var(--w) var(--l) no-repeat; }
#hud .lockbox i { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; background: var(--lock); }
#hud .lockbox .tag { top: calc(100% + 6px); background: var(--lock); color: #0b140d; }
#hud .lockbox.new { animation: lockIn 0.32s steps(1) both; }
@keyframes lockIn { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1.6); } 25% { opacity: 0; } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 75% { opacity: 0; } 100% { opacity: 1; } }
/* white flash on kills / crits */
#hud .flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
/* hits: centre hitmarker, combo / critical / destroyed popups, damage vignette, cracked glass */
#hud .hm { position: absolute; left: 50%; top: 44%; width: 44px; height: 44px; margin: -22px 0 0 -22px; opacity: 0; filter: drop-shadow(0 0 1px rgba(0,0,0,0.8)) drop-shadow(0 0 1px rgba(0,0,0,0.6)); } /* one outline round the whole mark */
#hud .hm i { position: absolute; left: 50%; top: 50%; width: 15px; height: 4px; margin: -2px 0 0 -7.5px; background: #fff; }
#hud .hm i:nth-child(1) { transform: rotate(45deg) translateX(-13px); } #hud .hm i:nth-child(2) { transform: rotate(135deg) translateX(-13px); }
#hud .hm i:nth-child(3) { transform: rotate(225deg) translateX(-13px); } #hud .hm i:nth-child(4) { transform: rotate(315deg) translateX(-13px); }
#hud .hm.crit i { background: var(--rust); width: 20px; } #hud .hm.kill i { background: var(--red); width: 26px; height: 6px; }
#hud .hm.go { animation: hm 0.28s ease-out both; } #hud .hm.go.crit { animation-duration: 0.45s; } #hud .hm.go.kill { animation: hmk 0.8s ease-out both; }
@keyframes hm { from { opacity: 1; transform: scale(1.35); } 60% { opacity: 1; } to { opacity: 0; transform: scale(1); } }
@keyframes hmk { from { opacity: 1; transform: scale(2.2) rotate(20deg); } 50% { opacity: 1; transform: scale(1.3); } to { opacity: 0; transform: scale(1.2); } }
#hud .pops { position: absolute; left: calc(50% + 70px); top: 36%; display: grid; gap: 2px; justify-items: start; }
#hud .pop { font: 900 30px/1 var(--display); letter-spacing: 0.06em; color: var(--white); -webkit-text-stroke: 2px #0e0f11; paint-order: stroke fill; transform: skewX(-8deg); animation: popIn 0.25s cubic-bezier(.2,1.8,.4,1) both, popOut 0.4s 1.1s ease-in forwards; text-shadow: 0 3px 0 rgba(0,0,0,0.5); }
#hud .pop.combo { font-size: 38px; color: #ffd27a; }
#hud .pop.crit { font-size: 34px; color: var(--rust); }
#hud .pop.kill { font-size: 52px; color: #ff3b26; animation: popIn 0.35s cubic-bezier(.2,1.8,.4,1) both, popOut 0.5s 1.8s ease-in forwards; }
#hud .pop small { font-size: 0.55em; margin-left: 8px; color: var(--white); }
@keyframes popIn { from { transform: skewX(-8deg) scale(1.9); opacity: 0; } }
@keyframes popOut { to { transform: skewX(-8deg) translateY(-14px); opacity: 0; } }
#hud .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 45%, rgba(150,10,6,0.55) 80%, rgba(60,0,0,0.9) 100%); opacity: 0; }
#hud .glass { position: absolute; inset: 0; overflow: hidden; }
#hud .glass .crack { position: absolute; width: 0; height: 0; animation: crack 0.12s ease-out both; }
#hud .glass .crack canvas { position: absolute; left: 0; top: 0; width: 760px; height: 760px; opacity: 0.85; }
#hud .glass .crack::before { content: ''; position: absolute; left: -40px; top: -40px; width: 80px; height: 80px; border-radius: 50%; backdrop-filter: blur(3px) brightness(1.15); -webkit-backdrop-filter: blur(3px) brightness(1.15); }
@keyframes crack { from { opacity: 0; transform: scale(0.85); } }
/* intro: black halves split open from a seam across the middle */
#hud .intro { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
#hud .intro i { position: absolute; left: 0; right: 0; height: 50.5%; background: #070708; transition: transform 0.85s cubic-bezier(.7,0,.2,1); }
#hud .intro .t { top: 0; }
#hud .intro .b { bottom: 0; }
#hud .intro.open .t { transform: translateY(-101%); }
#hud .intro.open .b { transform: translateY(101%); }
#hud .intro.instant i { transition: none; }

/* countdown */
#hud .count { position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%) skewX(-6deg); font: 900 clamp(70px, 14vw, 150px)/1 var(--display); color: var(--white); -webkit-text-stroke: 3px #0e0f11; paint-order: stroke fill; text-shadow: 0 5px 0 rgba(0,0,0,0.55); }
#hud .count.go { color: var(--rust); }
#hud .count.pop { animation: pop 0.45s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes pop { from { transform: translate(-50%, -50%) skewX(-6deg) scale(1.6); opacity: 0; } }
/* results */
#hud .results { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(8,9,10,0.66); pointer-events: auto; }
#hud .results[hidden] { display: none; }
#hud .results .box { width: min(420px, calc(100% - 32px)); padding: 18px 20px 20px; display: grid; gap: 10px; }
#hud .results h2 { margin: 0; font: 900 76px/0.85 var(--display); letter-spacing: 0.04em; transform: skewX(-6deg); }
#hud .results.win h2 { color: var(--rust); }
#hud .results .sub { font: 800 13px/1 var(--sign); letter-spacing: 0.2em; text-transform: uppercase; color: var(--dim); }
#hud .results .list { display: grid; gap: 2px; max-height: 44vh; overflow: hidden; }
#hud .results .row { grid-template-columns: 22px 1fr auto; }
#hud .results button { height: 50px; border: 0; cursor: pointer; font: 900 24px/1 var(--display); letter-spacing: 0.14em; color: var(--black); background: var(--rust); clip-path: var(--cut); margin-top: 6px; }
#hud .results button:hover { background: #f07a3a; }
#hud .row b { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }

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
  #hud .armor { left: calc(var(--gx) + 118px); width: 88px; height: 152px; }
  #hud .armor canvas { height: calc(100% - 24px); }
  #hud .armor .hp { font-size: 22px; } #hud .armor .hp small { font-size: 11px; }
  #hud .pop { font-size: 22px; } #hud .pop.combo { font-size: 28px; } #hud .pop.kill { font-size: 38px; }
  #hud .glass .crack canvas { width: 460px; height: 460px; }
  #hud .results h2 { font-size: 50px; }
  #hud .results .box { gap: 6px; padding: 12px 16px 14px; }
  #hud .results .list { max-height: 46vh; }
  #hud .results button { height: 40px; font-size: 20px; }
  #hud .count { top: 30%; }
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
  #hud .armor { left: calc(var(--gx) + 140px); width: 104px; height: 184px; }
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
    <div class="armor"><div class="hp"><span class="lbl">HP</span><b>100</b><small>/100</small></div><canvas></canvas></div>
    <div class="glass"></div>
    <div class="vig"></div>
    <div class="flash"></div>
    <div class="ret" hidden><b></b><b></b><b></b><b></b><i></i><span class="tag" hidden></span><s class="heatv"><i></i></s></div>
    <div class="lockbox" hidden><i></i><span class="tag">LOCK 000M</span></div>
    <div class="hm"><i></i><i></i><i></i><i></i></div>
    <div class="pops"></div>
    <div class="count" hidden></div>
    <div class="intro shut instant"><i class="t"></i><i class="b"></i></div>
    <div class="results" hidden><div class="box panel"><h2></h2><div class="sub"></div><div class="list"></div><div class="sub best"></div><button>PLAY AGAIN</button></div></div>
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
  // and no context menu / selection start from a held finger
  for (const ev of ['contextmenu', 'selectstart', 'dragstart']) document.addEventListener(ev, (e) => e.preventDefault());
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

  // ---- minimap: the whole circuit, start straight pointing up, racers as dots ----
  const mc = $('.map canvas'), mx = mc.getContext('2d');
  let mapImg = null, toMap = null, mapYaw = 0, dots = [];
  function buildMap(world, S, n, startI) {
    const dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(($('.map').clientWidth || 176) * dpr);
    const i0 = ((startI % n) + n) % n, y0 = Math.atan2(S.tx[i0], S.tz[i0]);
    const f0 = [Math.sin(y0), Math.cos(y0)], r0 = [-Math.cos(y0), Math.sin(y0)];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < n; i += 4) {
      const u = S.px[i] * r0[0] + S.pz[i] * r0[1], v = -(S.px[i] * f0[0] + S.pz[i] * f0[1]);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const sc = (px * 0.84) / Math.max(u1 - u0, v1 - v0), uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    const T = [sc * r0[0], -sc * f0[0], sc * r0[1], -sc * f0[1], px / 2 - sc * uc, px / 2 - sc * vc];
    toMap = (x, z) => [T[0] * x + T[2] * z + T[4], T[1] * x + T[3] * z + T[5]];
    mapYaw = y0;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.setTransform(...T);
    g.lineJoin = g.lineCap = 'round';
    const map = world.map ?? { roads: [], rects: [] }, pxm = 1 / sc;
    for (const rc of map.rects) {
      g.save();
      g.translate(rc.x, rc.z);
      g.rotate(-rc.yaw);
      g.fillStyle = 'rgba(236,230,217,0.07)';
      g.fillRect(-rc.hx, -rc.hz, rc.hx * 2, rc.hz * 2);
      g.restore();
    }
    g.strokeStyle = 'rgba(236,230,217,0.08)';
    for (const rd of map.roads) {
      g.lineWidth = Math.max(rd.w, 1.5 * dpr * pxm);
      g.beginPath();
      rd.pts.forEach(([x, z], k) => (k ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.stroke();
    }
    const loop = () => { g.beginPath(); for (let i = 0; i <= n; i += 2) { const k = i % n; i ? g.lineTo(S.px[k], S.pz[k]) : g.moveTo(S.px[k], S.pz[k]); } g.closePath(); };
    loop(); g.strokeStyle = 'rgba(255,150,70,0.28)'; g.lineWidth = 6 * dpr * pxm; g.stroke();
    loop(); g.strokeStyle = '#f4efe4'; g.lineWidth = 2.2 * dpr * pxm; g.stroke();
    const tx = S.tx[i0], tz = S.tz[i0], L = 7 * dpr * pxm;
    g.strokeStyle = '#ff7a2c'; g.lineWidth = 3 * dpr * pxm;
    g.beginPath(); g.moveTo(S.px[i0] - tz * L, S.pz[i0] + tx * L); g.lineTo(S.px[i0] + tz * L, S.pz[i0] - tx * L); g.stroke();
    mapImg = c;
  }
  function drawMap(x, z, yaw) {
    if (!mapImg || !$('.map').clientWidth) return;
    const dpr = Math.min(2, devicePixelRatio || 1), px = mapImg.width;
    if (mc.width !== px) mc.width = mc.height = px;
    const g = mx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.drawImage(mapImg, 0, 0);
    for (const d of dots) {
      const [sx, sy] = toMap(d.x, d.z);
      g.fillStyle = '#0e0f11';
      g.beginPath(); g.arc(sx, sy, 4.6 * dpr, 0, Math.PI * 2); g.fill();
      g.fillStyle = d.color;
      g.beginPath(); g.arc(sx, sy, 3.3 * dpr, 0, Math.PI * 2); g.fill();
    }
    const [sx, sy] = toMap(x, z);
    g.setTransform(dpr, 0, 0, dpr, sx, sy);
    g.rotate(mapYaw - yaw);
    g.fillStyle = '#ff8a3a'; g.strokeStyle = '#0e0f11'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7.5); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke();
  }

  // ---- damage feedback ----
  let xray = null, vigT = 0, vigBase = 0, hpShown = -1, flashV = 0;
  const cracks = [];
  const flashEl = $('.flash');
  const vig = $('.vig'), hm = $('.hm'), pops = $('.pops'), glass = $('.glass');
  // Bullet-strike on the windscreen: a crushed, frosted pit; radial cracks that taper and
  // branch, a few running long; spider-web rings joining neighbouring rays in jagged
  // steps; loose chips near the centre. Each line is drawn as a refraction pair (dark
  // offset under a bright edge) so it reads as broken glass, not white scribbles.
  const crackCanvas = (seed) => {
    const S = 900, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    g.translate(S / 2, S / 2);
    g.lineCap = g.lineJoin = 'round';
    const stroke = (pts, w) => {
      const path = () => { g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); };
      g.save(); g.translate(1.2, 1.4); path(); g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = w + 1.2; g.stroke(); g.restore();
      path(); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = w + 5; g.stroke();
      path(); g.strokeStyle = 'rgba(245,250,255,0.82)'; g.lineWidth = w; g.stroke();
      // the far fracture face catches light on the other side of the line
      g.save(); g.translate(-0.7, -0.9); path(); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(0.4, w * 0.35); g.stroke(); g.restore();
    };
    // hairline fractures and glints along a crack, the fine detail real breaks have
    const detail = (pts) => {
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], a = Math.atan2(y1 - y0, x1 - x0);
        if (rnd() < 0.5) {
          const b = a + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.9), l = 4 + rnd() * 13, mx = x1 + (rnd() - 0.5) * 3, my = y1 + (rnd() - 0.5) * 3;
          g.strokeStyle = `rgba(240,248,255,${0.35 + rnd() * 0.35})`; g.lineWidth = 0.55;
          g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(b) * l * 0.5 + (rnd() - 0.5) * 2, my + Math.sin(b) * l * 0.5); g.lineTo(mx + Math.cos(b) * l, my + Math.sin(b) * l); g.stroke();
        }
        if (rnd() < 0.14) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x1 - 1 + (rnd() - 0.5) * 4, y1 - 1 + (rnd() - 0.5) * 4, 1.5 + rnd() * 1.5, 1.5 + rnd() * 1.5); }
      }
    };
    // a crack: wandering polyline, tapering, sometimes forking
    const rays = [];
    const crack = (x, y, a, len, w, depth) => {
      const pts = [[x, y]];
      let d = 0;
      while (d < len) {
        const st = 9 + rnd() * 16;
        a += (rnd() - 0.5) * 0.32;
        x += Math.cos(a) * st; y += Math.sin(a) * st; d += st;
        pts.push([x, y]);
        if (depth < 2 && rnd() < 0.09) crack(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.5), len * (0.25 + rnd() * 0.3), w * 0.6, depth + 1);
      }
      // taper: draw in a few chunks getting thinner
      const n = pts.length, chunks = 4;
      for (let k = 0; k < chunks; k++) stroke(pts.slice(Math.floor((k * n) / chunks), Math.floor(((k + 1) * n) / chunks) + 1), Math.max(0.5, w * (1 - k / chunks)));
      detail(pts);
      return pts;
    };
    const nr = 13 + Math.floor(rnd() * 7);
    for (let k = 0; k < nr; k++) {
      const a = (k / nr) * Math.PI * 2 + (rnd() - 0.5) * 0.35, long = rnd() < 0.25;
      rays.push({ a, pts: crack(Math.cos(a) * 10, Math.sin(a) * 10, a, long ? 330 + rnd() * 110 : 120 + rnd() * 160, 2.1 + rnd() * 0.8, 0) });
    }
    rays.sort((p, q) => p.a - q.a);
    // spider-web rings between neighbouring rays, denser near the strike
    const at = (pts, rad) => pts.find(([x, y]) => Math.hypot(x, y) >= rad) ?? null;
    for (const [rad, prob] of [[30, 0.95], [55, 0.9], [88, 0.75], [128, 0.55], [175, 0.35], [230, 0.2]]) {
      for (let k = 0; k < rays.length; k++) {
        if (rnd() > prob) continue;
        const A = at(rays[k].pts, rad * (0.9 + rnd() * 0.2)), B = at(rays[(k + 1) % rays.length].pts, rad * (0.9 + rnd() * 0.2));
        if (!A || !B) continue;
        const pts = [A];
        for (let q = 1; q < 4; q++) { const u = q / 4; pts.push([A[0] + (B[0] - A[0]) * u + (rnd() - 0.5) * 7, A[1] + (B[1] - A[1]) * u + (rnd() - 0.5) * 7]); }
        pts.push(B);
        stroke(pts, rad < 60 ? 1.3 : 0.9);
      }
    }
    // crushed centre: frosted pit with fine fractures and a dark hole
    const fr = g.createRadialGradient(0, 0, 0, 0, 0, 34);
    fr.addColorStop(0, 'rgba(255,255,255,0.75)'); fr.addColorStop(0.5, 'rgba(235,240,245,0.4)'); fr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fr; g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.7;
    for (let k = 0; k < 160; k++) {
      const a = rnd() * Math.PI * 2, d0 = rnd() * 26, l = 3 + rnd() * 10;
      g.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`;
      g.beginPath(); g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0); g.lineTo(Math.cos(a + (rnd() - 0.5)) * (d0 + l), Math.sin(a + (rnd() - 0.5)) * (d0 + l)); g.stroke();
    }
    g.fillStyle = 'rgba(20,22,26,0.55)'; g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fill();
    // loose chips: small facets catching the light
    for (let k = 0; k < 18; k++) {
      const a = rnd() * Math.PI * 2, d0 = 14 + rnd() * 50, s0 = 3 + rnd() * 7;
      g.fillStyle = `rgba(255,255,255,${0.08 + rnd() * 0.18})`;
      g.beginPath();
      for (let q = 0; q < 3 + Math.floor(rnd() * 2); q++) { const b = a + q * 2.1 + rnd(); g.lineTo(Math.cos(a) * d0 + Math.cos(b) * s0, Math.sin(a) * d0 + Math.sin(b) * s0); }
      g.fill();
    }
    return c;
  };

  let titleT = 0, cardKey = null, boardKey = '';
  const spot = $('.spot'), card = $('.card');
  return {
    touch: t,
    set onPause(fn) { onPause = fn; },
    // speed km/h (signed), boost 0..1, lap number, current / best lap seconds
    set({ speed, boost, boosting, throttle, lap, laps, lapT, bestLap, heat = 0, overheated = false, dt = 1 / 60 }) {
      $('.ret .heatv i').style.height = `${Math.round(heat * 100)}%`;
      $('.ret').classList.toggle('hot', overheated);
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
        $('.lap .n').textContent = laps ? `LAP ${lap}/${laps}` : `LAP ${lap}`;
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
      $('.board').innerHTML = rows.map((r, k) => `<div class="row${r.you ? ' you' : ''}${r.out ? ' out' : ''}"><i>${k + 1}</i><span>${r.color ? `<b style="background:${r.color}"></b>` : ''}${r.name}</span><em>${r.gap ?? ''}</em></div>`).join('');
    },
    map: buildMap,
    mapUpdate: drawMap,
    mapDots(list) { dots = list; },
    armorModel(model, hitbox) { if (root.style.display !== 'none') xray = new XRay($('.armor canvas'), model, hitbox); },
    armor(a, t = performance.now() / 1000, dt = 1 / 60) {
      xray?.update(a, t);
      const now = performance.now() / 1000;
      for (let k = cracks.length - 1; k >= 0; k--) {
        const age = now - cracks[k].t0;
        if (age > 7.5) { cracks[k].w.remove(); cracks.splice(k, 1); } else if (age > 6) cracks[k].w.style.opacity = String(1 - (age - 6) / 1.5);
      }
      const hp = Math.ceil(a.core * 100);
      if (hp !== hpShown) {
        hpShown = hp;
        const el = $('.armor .hp b'), [r, g, b] = damageColor(a.core);
        el.textContent = String(hp);
        el.style.color = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      }
      flashV = Math.max(0, flashV - dt * 5);
      flashEl.style.opacity = flashV.toFixed(3);
      // red vignette: flashes on damage, settles to a glow that grows as HP drops
      vigBase = a.wrecked ? 0.9 : Math.max(0, (0.55 - a.core) * 1.2);
      vigT = Math.max(0, vigT - dt * 2.2);
      vig.style.opacity = Math.min(1, vigBase + vigT).toFixed(3);
    },
    flash(v) { flashV = Math.max(flashV, v); },
    // reticle centre / radius in px (null hides); lock box at a screen point, size px (null hides)
    reticle(x, y, r) {
      const el = $('.ret');
      if (x === null) { el.hidden = true; return; }
      el.hidden = false;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${r * 2}px`, height: `${r * 2}px` });
    },
    lock(x, y, size, id, dist = 0) {
      const el = $('.lockbox');
      if (x === null) { el.hidden = true; el.dataset.id = ''; return; }
      if (el.dataset.id !== String(id)) { el.dataset.id = String(id); el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); }
      el.hidden = false;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
      el.querySelector('.tag').textContent = `LOCK ${String(Math.round(dist)).padStart(3, '0')}M`;
    },
    // 'idle' (white), 'lock' (green), 'far' (red: a target in the circle beyond lock range)
    reticleState(state, dist = 0) {
      const el = $('.ret'), tag = el.querySelector('.tag');
      el.classList.toggle('lock', state === 'lock');
      el.classList.toggle('far', state === 'far');
      tag.hidden = state !== 'far';
      if (state === 'far') tag.textContent = `OUT OF RANGE ${String(Math.round(dist)).padStart(3, '0')}M`;
    },
    hurt(amount) { vigT = Math.min(0.9, vigT + 0.18 + amount * 4); },
    // cracked glass on a solid chunk of damage while hurt (race decides when); at most 3
    // on screen, each fading out after ~6 s; cleared on a new race
    crack() {
      const w = document.createElement('div'), c = crackCanvas(1 + Math.floor(Math.random() * 1e6));
      w.className = 'crack';
      const x = Math.random() < 0.5 ? 6 + Math.random() * 22 : 70 + Math.random() * 22, y = 12 + Math.random() * 55;
      w.style.left = `${x}%`; w.style.top = `${y}%`;
      c.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;
      w.append(c);
      glass.append(w);
      cracks.push({ w, t0: performance.now() / 1000 });
      while (cracks.length > 3) cracks.shift().w.remove();
    },
    clearCracks() { glass.innerHTML = ''; cracks.length = 0; vigT = 0; },
    hitmarker(kind = 'hit') {
      hm.className = 'hm';
      void hm.offsetWidth;
      hm.className = `hm go ${kind}`;
    },
    // kind: 'combo' (replaces the running combo line), 'crit', 'kill'
    popup(html, kind = '') {
      if (kind === 'combo') {
        const old = pops.querySelector('.combo');
        if (old) old.remove();
      }
      const el = document.createElement('div');
      el.className = `pop ${kind}`;
      el.innerHTML = html;
      pops.prepend(el);
      while (pops.children.length > 4) pops.lastChild.remove();
      setTimeout(() => el.remove(), kind === 'kill' ? 2400 : 1600);
    },
    // open = true splits the black open; false closes it (instantly when snap)
    intro(open, snap = false) {
      const el = $('.intro');
      el.classList.toggle('instant', snap);
      el.classList.toggle('open', open);
      el.classList.toggle('shut', !open);
      if (snap) void el.offsetWidth;
    },
    countdown(text) {
      const el = $('.count');
      if (text === null) { el.hidden = true; el.textContent = ''; return; }
      if (el.textContent === text) return;
      el.hidden = false;
      el.textContent = text;
      el.className = `count pop${text === 'GO' ? ' go' : ''}`;
    },
    // race over: { title, sub, win, rows: [{ pos, name, you, color, time }], best, onAgain } or null
    results(r) {
      const el = $('.results');
      if (!r) { el.hidden = true; return; }
      el.classList.toggle('win', !!r.win);
      el.querySelector('h2').textContent = r.title;
      el.querySelector('.sub').textContent = r.sub;
      el.querySelector('.best').textContent = r.best ? `Best lap ${r.best}` : '';
      el.querySelector('.list').innerHTML = r.rows.map((x) => `<div class="row${x.you ? ' you' : ''}"><i>${x.pos}</i><span><b style="background:${x.color}"></b>${x.name}</span><em>${x.time}</em></div>`).join('');
      el.querySelector('button').onclick = () => { el.hidden = true; r.onAgain(); };
      el.hidden = false;
    },
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
