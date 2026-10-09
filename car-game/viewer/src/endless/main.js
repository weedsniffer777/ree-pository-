import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { screenPass } from './screen.js';
import { buildStarterCoupe } from '../models/cars/starterCoupe.js';
import { S, STEP, I_START, LOOP, pointAt, ensure } from './route.js';
import { World } from './world.js';
import { TrackWorld } from './trackworld.js';
import { currentMap } from './maps.js';
import { settings, held } from './settings.js';
import { biomeIndexAt, BIOMES } from './biomes.js';
import { bakeGroup } from '../level/bake.js';
import { CarController, setTerrain } from './car.js';
import { Dust, addFlames } from '../level/fx.js';
import { createHud } from './hud.js';
import { Pursuer, areaOf } from './pursuer.js';
import { Skids } from './skids.js';
import { SpeedLines } from './speedlines.js';
import { Race } from './race.js';
import { Booms, Bits, LineSparks } from './boom.js';
import { bakeCar } from './carparts.js';
import { Glass } from './glass.js';
import { nearest, wAt, RAIL_LAT } from './route.js';
import { createDevKit } from './devkit.js';
import { Tracers, Guns } from '../level/combat.js';

// Endless highway. Debug/screenshot params:
// ?at=<m from start>&lat=<m>&view=chase|high|side|front|aerial|overview|back&orbit=<deg>&auto=1&sim=<s>&ui=0&stats=1&tut=1

const params = new URLSearchParams(location.search);
const MAP = currentMap();
const THEME = LOOP.def; // set on closed-loop circuits
const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
const tBuild = performance.now();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); // the frame is drawn into the composer's target, so canvas MSAA only cost time
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.info.autoReset = false;
document.getElementById('app').appendChild(renderer.domElement);

const HORIZON = new THREE.Color(THEME ? THEME.fog[0] : '#f3d5b2');
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON);
scene.fog = THEME ? new THREE.Fog(HORIZON, THEME.fog[1], THEME.fog[2]) : new THREE.Fog(HORIZON, 140, 1150);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const grade = screenPass(renderer); // tone map + output + windscreen glass + grade, one pass
const GR = THEME ? THEME.grade : { saturation: 1.58, contrast: 1.04, lift: 0.07, toon: 0.45 };
grade.uniforms.saturation.value = GR.saturation;
grade.uniforms.contrast.value = GR.contrast;
grade.uniforms.lift.value = GR.lift;
renderer.toneMappingExposure = GR.exposure ?? 1.12; // desert maps run a touch brighter
grade.uniforms.toon.value = GR.toon; // punchier than the garage; the sky dome is pre-desaturated to match
composer.addPass(grade);

const HEMI = THEME ? THEME.hemi : [0xe6eef4, 0xd9a06a, 1.9], SUNL = THEME ? THEME.sun : [0xffdcae, 3.6];
scene.add(new THREE.HemisphereLight(HEMI[0], HEMI[1], HEMI[2]));
const sun = new THREE.DirectionalLight(SUNL[0], SUNL[1]);
const SUN_DIR = new THREE.Vector3(70, 85, 45).normalize();
sun.castShadow = true;
// One big shadow box (instead of a tight one that makes shadows pop in at ~40 m), pushed
// ahead of the car and snapped to whole shadow texels so edges don't crawl as you drive.
const SHADOW = matchMedia('(pointer: coarse)').matches ? { size: 3072, half: 95 } : { size: 4096, half: 130 };
sun.shadow.mapSize.set(SHADOW.size, SHADOW.size);
Object.assign(sun.shadow.camera, { left: -SHADOW.half, right: SHADOW.half, top: SHADOW.half, bottom: -SHADOW.half, near: 1, far: 500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const sky = buildSky(THEME ? THEME.sky : ['#6aaed6', '#aed2e6', '#f3d5b2'], Math.min(1, 1.2 / GR.saturation));
scene.add(sky);

// ---- World ----
const world = THEME ? new TrackWorld(scene, THEME) : new World(scene);
const terrainHeight = (x, z) => world.heightAt(x, z);
setTerrain(terrainHeight, (x, z, n) => world.heightAtN(x, z, n));
const startAt = params.has('at') ? num('at', 0) : (MAP.at || 0);
const startI = () => I_START + Math.round(startAt / STEP);
ensure(startI() + 1500);
world.update(startI(), true);

// ---- Car ----
const model = buildStarterCoupe();
bakeCar(model); // chassis + detachable parts (armor zones, plow, guns, rack, wheels)
const flames = addFlames(model);
const car = new CarController(model, world.colliders);
scene.add(car.rig);
car.reset(startI(), num('lat', 1.85));

const dust = new Dust(900);
scene.add(dust.points);
const embers = new Dust(400, { additive: true, fade: 0.8 });
scene.add(embers.points);
const tracers = new Tracers(scene);
const lineSparks = new LineSparks(scene); // hits, ricochets, scrapes, collisions (embers stay for fire)
const guns = new Guns(model, scene, { tracers, dust, sparks: lineSparks, height: terrainHeight });
// Highway: every round that lands charges boost a little. Races: only hits on cars do.
const gunImpact = guns.impact.bind(guns);
guns.heatCfg = { perShot: 0.017, cool: 0.42, resume: 0.3 }; // ~4 s of fire to overheat
if (!LOOP.on) guns.impact = (p) => { gunImpact(p); car.addBoost(0.0045); };
let runTime = 0, biomeShown = -1, best = 0, freeCam = false, lookBack = false, lockedNow = false;
const pursuer = new Pursuer();
const skids = new Skids(scene);
const streaks = new SpeedLines(scene);
try { best = Number(localStorage.getItem('endless.best') || 0); } catch { /* storage unavailable */ }
const buildMs = Math.round(performance.now() - tBuild);
window.__scene = scene;
window.__game = { car, pursuer, skids };

// ---- Input ----
const coarse = matchMedia('(pointer: coarse)').matches;
const hud = createHud({ touch: coarse });
if (params.get('ui') === '0') hud.hide();
// cracked windscreen: a refracting post pass on the frame replaces the old DOM overlay
const glass = new Glass(grade);
{ const clr = hud.clearCracks.bind(hud); hud.crack = () => glass.add(); hud.clearCracks = () => { clr(); glass.clear(); }; }
if (params.get('stats') === '1') hud.toggleDebug();
// the garage viewer: index.html in dev, garage.html next to the page in the artifact
let devOpen = false, userPaused = false;
const isPaused = () => devOpen || userPaused;
createDevKit({ viewerUrl: import.meta.env.DEV ? 'index.html' : 'garage.html', onStats: () => hud.toggleDebug(), onOpenChange: (on) => { devOpen = on; keys.clear(); } });
hud.onPause = (on) => { userPaused = on; keys.clear(); };
// explosions, wreck debris, and the brass + belt links thrown out of the guns
const booms = new Booms(scene, { dust, sparks: lineSparks, sun: SUN_DIR });
const debris = new Bits(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.45 }), { max: 220, height: terrainHeight, shadow: true });
const casings = new Bits(scene, new THREE.CylinderGeometry(0.022, 0.022, 0.11, 6), new THREE.MeshStandardMaterial({ color: 0xc8963a, roughness: 0.35, metalness: 0.9 }), { max: 140, height: terrainHeight, bounce: 0.45 });
const links = new Bits(scene, new THREE.BoxGeometry(0.075, 0.022, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 0.5, metalness: 0.8 }), { max: 140, height: terrainHeight, bounce: 0.3 });
{
  const tv = new THREE.Vector3(), tp = new THREE.Vector3();
  guns.onShot = (start, dir, c, k) => {
    const side = k === 0 ? 1 : -1, rx = -Math.cos(c.yaw) * side, rz = Math.sin(c.yaw) * side; // left gun throws left
    tp.copy(start).addScaledVector(dir, -0.9);
    tv.set(c.vx + rx * (2.5 + Math.random() * 2), 2 + Math.random() * 2.5, c.vz + rz * (2.5 + Math.random() * 2));
    casings.spawn(tp, tv, { life: 1.4, spin: 30 });
    tv.set(c.vx + rx * (1.2 + Math.random()), 1 + Math.random() * 1.5, c.vz + rz * (1.2 + Math.random()));
    links.spawn(tp, tv, { life: 1.4, spin: 22 });
  };
}
// the circuit's walls and fences stop rounds (both sides walled on loops)
if (LOOP.on && LOOP.walls === 'both') {
  let hint = 0;
  guns.blockTest = (p) => {
    const far = Math.hypot(p.x - S.px[hint], p.z - S.pz[hint]) > 24; // new shot elsewhere: search fresh
    const n = nearest(p.x, p.z, far ? -1 : hint);
    hint = n.i;
    return Math.abs(n.lat) > RAIL_LAT * wAt(n.i) - 0.35 && p.y < S.y[n.i] + 3.4;
  };
}
const race = LOOP.on && params.get('race') !== '0'
  ? new Race({ scene, model, car, hud, booms, debris, renderer, fx: { tracers, dust, sparks: embers, lines: lineSparks, height: terrainHeight }, gunsHitHook: (test, onHit) => { guns.hitTest = test; guns.onTargetHit = onHit; } })
  : null;
if (race) for (const r of race.rivals) r.guns.blockTest = guns.blockTest;
if (LOOP.on) hud.map(world, S, LOOP.n, I_START);
window.__game.race = race;

const keys = new Set();
addEventListener('keydown', (e) => {
  if (isPaused()) return; // paused (settings may be listening for a key)
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') location.reload();
  race?.skipEnd();
  if (e.code === 'F3' || e.code === 'Backquote') hud.toggleDebug();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('pointerdown', () => race?.skipEnd()); // skip the ending
addEventListener('blur', () => keys.clear());

// Free camera: hold C or the right mouse button and move the mouse; eases back on release.
let orbitYaw = 0, orbitPitch = 0, rightDrag = false;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2) { rightDrag = true; renderer.domElement.setPointerCapture(e.pointerId); } });
addEventListener('pointerup', (e) => { if (e.button === 2) rightDrag = false; });
addEventListener('pointermove', (e) => {
  if (!freeCam) return;
  orbitYaw -= e.movementX * 0.006 * settings.sens;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch + e.movementY * 0.004 * settings.sens, -0.25, 0.7);
});

const auto = params.get('auto') === '1';
function autopilot() {
  const n = car.n;
  const ahead = n.i + Math.round((12 + Math.abs(car.vf) * 0.7) / STEP), look = LOOP.on ? ahead : Math.min(S.count - 1, ahead);
  const tp = pointAt(look, 1.85);
  let diff = Math.atan2(tp.x - car.x, tp.z - car.z) - car.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const steer = THREE.MathUtils.clamp(-diff * 2.4, -1, 1);
  return { throttle: 1, brake: 0, steer, boost: Math.abs(steer) < 0.12 && car.boost > 0.4 && params.get('boost') !== '0', fire: params.get('fire') === '1' };
}

function readInput() {
  if (race?.state === 'done' || (race && race.player.armor.wrecked)) {
    if (race.player.armor.wrecked || race.parked) return { throttle: 0, brake: 0, steer: 0, boost: false, fire: false }; // the wreck just rolls on
    return { ...autopilot(), boost: car.boost > 0.05, fire: false, cap: 0 }; // flat out past the camera
  }
  if (auto) return { ...autopilot(), cap: race?.inputCap || 0, fire: race ? race.canFire && params.get('fire') === '1' : params.get('fire') === '1' };
  const k = (a) => held(keys, a); // bound keys (settings)
  const w = k('throttle'), sKey = k('brake');
  const t = hud.touch;
  // keyboard: W is the throttle. Phones have no pedal, so they drive on full throttle and
  // BRAKE lifts it. The tutorial rolls along at a fixed lower speed until W is learned.
  const tutDrive = !tut.done && !t.active;
  const inp = {
    throttle: (w || t.active || tutDrive) && !sKey && !t.brake ? 1 : 0, // S lifts the throttle, same as BRAKE on a phone
    cap: race?.inputCap || (tutDrive && !w ? TUT_SPEED : 0),
    brake: sKey || t.brake ? 1 : 0,
    steer: (k('right') ? 1 : 0) - (k('left') ? 1 : 0) || t.steer,
    boost: k('boost') || t.boost,
    // auto fire: shoot whenever something is locked (the fire key still works too)
    fire: (k('fire') || t.fire || (settings.fire === 'auto' && lockedNow)) && !t.gunsOff && (!race || race.canFire), // phones: guns toggle
  };
  freeCam = k('look') || rightDrag;
  lookBack = k('back') || t.back;
  return inp;
}

// ---- Lock-on: the reticle sits where the guns point (60 m ahead, so it rides hills);
// the nearest live rival inside it is locked, boxed, and the guns lead it ----
const LOCK_R = coarse ? 52 : 71, LOCK_MAX = 110, SEEK_MAX = 260, lockV = new THREE.Vector3(), lockAim = new THREE.Vector3();
function updateLock() {
  if (!race || params.get('ui') === '0') return null;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), W = innerWidth, Hh = innerHeight;
  const toScreen = (x, y, z) => { lockV.set(x, y, z).project(camera); return lockV.z < 1 ? [(lockV.x * 0.5 + 0.5) * W, (-lockV.y * 0.5 + 0.5) * Hh] : null; };
  const c0 = toScreen(car.x + fx * 60, car.y + 0.9, car.z + fz * 60);
  if (!c0 || race.player.armor.wrecked || race.state === 'done') { lockedNow = false; hud.reticle(null); hud.lock(null); hud.reticleState('idle'); return null; }
  hud.reticle(c0[0], c0[1], LOCK_R);
  const cands = [];
  for (const r of race.rivals) {
    if (r.armor.wrecked || !r.rig.visible) continue;
    const dx = r.x - car.x, dz = r.z - car.z, d = Math.hypot(dx, dz);
    if (d > SEEK_MAX || d < 3 || dx * fx + dz * fz <= 0) continue;
    const sp = toScreen(r.x, r.y + 0.8, r.z);
    if (!sp || Math.hypot(sp[0] - c0[0], sp[1] - c0[1]) > LOCK_R) continue;
    cands.push({ r, sp, d });
  }
  cands.sort((a, b) => a.d - b.d);
  // nearest in the circle
  const best = cands[0], bd = best?.d ?? Infinity;
  lockedNow = !!best && bd <= LOCK_MAX;
  if (!best) { hud.lock(null); hud.reticleState('idle'); return null; }
  if (bd > LOCK_MAX) {
    // seen, but too far to lock: the guns still match its height (elevation only), so
    // it can be hit by steering onto it by hand
    hud.lock(null); hud.reticleState('far', bd);
    return lockAim.set(car.x + fx * bd, best.r.y + 0.8, car.z + fz * bd);
  }
  hud.reticleState('lock');
  const size = Math.max(30, Math.min(150, 1100 / bd));
  hud.lock(best.sp[0], best.sp[1], size, best.r.slot, bd);
  const lead = bd / 420; // round flight time
  return lockAim.set(best.r.x + best.r.vx * lead, best.r.y + 0.8, best.r.z + best.r.vz * lead);
}

// ---- Effects ----
const SAND = [0.86, 0.68, 0.48], SMOKE = [0.86, 0.85, 0.83];
let emitAcc = 0;
function emitFx(dt, inp) {
  const speed = Math.hypot(car.vx, car.vz);
  const spin = car.wheelspin > 0.3;
  const drifting = Math.abs(car.vl) > 3.2 || (car.braking && Math.abs(car.steerS) > 0.3) || spin;
  if (car.airborne || (speed < 4 && !drifting) || (car.onRoad && !drifting)) return;
  emitAcc += dt * (car.onRoad ? 40 : 30 + speed * 2.2) * (spin ? 1.6 : 1);
  const c = car.onRoad ? SMOKE : SAND;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), rx = -Math.cos(car.yaw), rz = Math.sin(car.yaw);
  while (emitAcc >= 1) {
    emitAcc -= 1;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = car.x + fx * -1.35 + rx * side * 0.8, z = car.z + fz * -1.35 + rz * side * 0.8;
    dust.emit(x, car.y + 0.15, z, -car.vx * 0.12 + (Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.2, -car.vz * 0.12 + (Math.random() - 0.5) * 2,
      0.9 + Math.random() * 1.1, 1.0 + Math.random() * 1.2, c[0], c[1], c[2]);
  }
}

// ---- Camera ----
let camYaw = car.yaw, fov = 62, shake = 0, outroYaw = null, outroPos = null, endCam = null, endShot = null;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
function updateCamera(dt) {
  const view = params.get('view') || 'chase';
  const speed = Math.hypot(car.vx, car.vz);
  const f = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  shake = Math.max(shake, Math.min(0.5, car.events.impact * 0.03 + car.events.land * 0.02));
  car.events.impact = car.events.land = 0;
  shake *= Math.exp(-dt * 7);
  const jx = (Math.random() - 0.5) * shake, jy = (Math.random() - 0.5) * shake;
  let target = car.yaw;
  { // lean the camera toward where the car is travelling, fading in with speed (no snap when sliding sideways)
    const sv = Math.hypot(car.vx, car.vz), off = Math.atan2(Math.sin(Math.atan2(car.vx, car.vz) - car.yaw), Math.cos(Math.atan2(car.vx, car.vz) - car.yaw));
    target += THREE.MathUtils.clamp(Math.sin(off) * 2.5, -1, 1) * 0.24 * Math.min(1, Math.max(0, (sv - 2) / 6)); // sin: continuous all the way round
  }
  camYaw = lerpAngle(camYaw, target, 1 - Math.exp(-dt * 6));
  if (!freeCam) {
    orbitYaw *= Math.exp(-dt * 3);
    orbitPitch *= Math.exp(-dt * 3);
  }
  const yawC = camYaw + orbitYaw + THREE.MathUtils.degToRad(num('orbit', 0)) + (lookBack ? Math.PI : 0); // look back: turn the camera round
  const [fx, fz] = f(yawC);
  // FOV opens with speed (most of it above cruise) and kicks wider on boost
  let fovT = 60 + Math.min(speed, 60) * 0.2 + Math.max(0, Math.min(speed, 60) - 32) * 0.35 + (car.boosting ? 9 : 0); // ~74° flat out
  // fast = a constant fine buzz on top of impact shake
  const buzz = Math.max(0, speed - 36) * 0.0016 + (car.boosting ? 0.02 : 0);
  const bx = (Math.random() - 0.5) * buzz, by = (Math.random() - 0.5) * buzz;
  const outro = race?.state === 'done' && view === 'chase' ? race.t - race.doneT : -1;
  if (outro >= 0) {
    // race over, by shot: 'wreck' a slow orbit pulling back over our burning car; 'kill' a
    // slow-mo look at the final kill; 'pass' a fixed roadside camera ahead that we blast
    // past; 'hero' low, wide and close on the parked car, the finish line behind it
    const shot = race.endShot, k = 1 - Math.exp(-dt * 2.5);
    if (shot !== endShot) { endShot = shot; endCam = null; }
    const look = tmpV2.set(car.x, car.y + 0.7, car.z);
    let px, py, pz, snap = false;
    fovT = 55;
    if (shot === 'wreck') {
      outroYaw ??= camYaw + Math.PI;
      const e = outro, ang = outroYaw + Math.PI + e * 0.32, dist = 7 + Math.min(e, 4) * 2.2, up = 2.4 + Math.min(e, 4) * 1.1;
      px = car.x - Math.sin(ang) * dist; pz = car.z - Math.cos(ang) * dist; py = car.y + up;
    } else if (shot === 'kill' && race.finalKill) {
      const v = race.finalKill;
      if (!endCam) { const a = Math.atan2(car.x - v.x, car.z - v.z) + 0.9; endCam = { a, t: 0 }; }
      endCam.t += dt;
      const a = endCam.a + endCam.t * 0.5;
      px = v.x + Math.sin(a) * 9; pz = v.z + Math.cos(a) * 9; py = v.y + 2.6;
      look.set(v.x, v.y + 0.8, v.z);
      fovT = 50;
    } else if (shot === 'pass') {
      if (!endCam) {
        const ahead = car.n.i + Math.round(Math.max(28, Math.hypot(car.vx, car.vz) * 1.5) / STEP);
        const p = pointAt(LOOP.on ? ahead : Math.min(S.count - 1, ahead), (car.n.lat > 0 ? -1 : 1) * (RAIL_LAT - 1.2));
        endCam = { x: p.x, z: p.z };
        snap = true;
      }
      px = endCam.x; pz = endCam.z; py = terrainHeight(px, pz) + 0.9;
      fovT = 48;
    } else {
      // hero: front three-quarter, low, wide; the car sits left of centre for the results
      if (!endCam) { endCam = { t: 0 }; snap = true; }
      endCam.t += dt;
      const a = car.yaw + 0.78 + endCam.t * 0.012;
      px = car.x + Math.sin(a) * 6.6; pz = car.z + Math.cos(a) * 6.6; py = car.y + 0.5;
      const dx = car.x - px, dz = car.z - pz, dl = Math.hypot(dx, dz) || 1;
      look.set(car.x - (dz / dl) * 2.6, car.y + 0.9, car.z + (dx / dl) * 2.6);
      fovT = 84;
    }
    py = Math.max(py, terrainHeight(px, pz) + 0.4);
    outroPos ??= camera.position.clone();
    if (snap) outroPos.set(px, py, pz); else outroPos.lerp(tmpV.set(px, py, pz), shot === 'hero' || shot === 'pass' ? 1 : k);
    camera.position.copy(outroPos);
    camera.lookAt(look);
    if (snap) fov = fovT;
  } else if (view === 'chase' || view === 'high') {
    outroYaw = null; outroPos = null; endShot = null; endCam = null;
    const back = (view === 'high' ? 13 : 5.5) + Math.min(speed, 45) * 0.03;
    const up = (view === 'high' ? 6.5 : 2.0) + orbitPitch * 4;
    const px = car.x - fx * back, pz = car.z - fz * back;
    const py = Math.max(car.y + up, terrainHeight(px, pz) + 0.8);
    camera.position.set(px + jx + bx, py + jy + by, pz);
    const look = 3.2 * Math.cos(Math.min(Math.abs(orbitYaw), Math.PI / 2)); // orbiting: look at the car itself
    camera.lookAt(car.x + fx * look, car.y + 1.0, car.z + fz * look);
  } else if (view === 'side') {
    camera.position.set(car.x - fz * 7, car.y + 1.4, car.z + fx * 7);
    camera.lookAt(car.x, car.y + 0.7, car.z);
    fovT = 50;
  } else if (view === 'front') {
    camera.position.set(car.x + fx * 9, car.y + 2.2, car.z + fz * 9);
    camera.lookAt(car.x, car.y + 0.8, car.z);
    fovT = 55;
  } else if (view === 'aerial') {
    camera.position.set(car.x - fx * 45, car.y + 34, car.z - fz * 45);
    camera.lookAt(car.x + fx * 45, car.y, car.z + fz * 45);
    fovT = 60;
  } else if (view === 'top' && LOOP.on) {
    scene.fog = null;
    camera.position.set(world.box.cx, 1100, world.box.cz);
    camera.up.set(0, 0, 1);
    camera.lookAt(world.box.cx, 0, world.box.cz + 0.01);
    fovT = 55;
  } else if (view === 'overview') {
    camera.position.set(0, 1500, 760);
    camera.up.set(1, 0, 0);
    camera.lookAt(0, 0, 761);
    fovT = 62;
  }
  fov += (fovT - fov) * (1 - Math.exp(-dt * 4));
  if (num('sim', 0) > 0 || view !== 'chase') fov = fovT;
  grade.uniforms.blur.value += ((car.boosting ? 0.045 : Math.max(0, speed - 44) * 0.002) - grade.uniforms.blur.value) * Math.min(1, dt * 5);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---- HUD pointer: on-screen marker or edge arrow toward a world position ----
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function screenPointer(x, y, z, label) {
  tmpV.set(x, y, z).project(camera);
  const behind = tmpV.z > 1;
  let px = behind ? -tmpV.x : tmpV.x, py = behind ? -tmpV.y : tmpV.y;
  const dist = Math.round(Math.hypot(x - car.x, z - car.z));
  const on = !behind && Math.abs(px) < 0.88 && Math.abs(py) < 0.8;
  let angle = Math.PI;
  if (!on) {
    const k = Math.min(0.88 / Math.max(1e-4, Math.abs(px)), 0.8 / Math.max(1e-4, Math.abs(py)));
    px *= k; py *= k;
    angle = Math.atan2(px, py);
  } else py += 0.16;
  return { x: (px * 0.5 + 0.5) * innerWidth, y: (0.5 - py * 0.5) * innerHeight, angle, label: `${label} ${dist} m` };
}

// ---- Pursuer: the thin line at the top, no text ----
function updatePursuer(dt, dist) {
  const a = areaOf(dist);
  for (const ev of pursuer.update(dt, dist)) {
    if (ev === 'enter') { hud.pulseTrack(); shake = Math.max(shake, 0.2); }
  }
  hud.track({
    you: (dist - a.start) / a.len,
    them: pursuer.active ? (pursuer.pos - a.start) / a.len : null,
    hot: pursuer.active && pursuer.gap(dist) < 90,
  });
}

// ---- First-run tutorial: centred cards, one action at a time, the HUD part lit up ----
// The pursuer stays away until the last step, which brings it in on purpose.
// TODO: an enemy from behind teaches S ("get behind them") and gives the guns a target.
const TUT_SPEED = 22; // m/s, about 80 km/h until you learn W and cruise
const tut = { step: 0, phase: 'wait', t: 0, done: false, acc: 0, left: false, right: false };
try { tut.done = (localStorage.getItem('endless.tutorial.v2') === 'done' || params.has('at') || startAt > 0 || LOOP.on || auto) && params.get('tut') !== '1'; } catch { /* ignore */ }
if (!tut.done) pursuer.enabled = false;
const K = (k) => `<kbd>${k}</kbd>`;
const STEPS = [
  { title: `Hold ${K('W')} to go faster`, sub: 'Let go and you ease off', spot: 'speed', touch: false,
    done: () => (keys.has('KeyW') || keys.has('ArrowUp')) && car.vf > 33 },
  { title: `${K('A')} ${K('D')} to steer`, sub: 'Swing across both lanes', touchTitle: 'Drag to steer',
    done: (dt) => { if (car.steerS < -0.4) tut.left = true; if (car.steerS > 0.4) tut.right = true; return tut.left && tut.right && tut.t > 1; } },
  { title: `Hold ${K('S')} to brake`, sub: 'Let go of W to coast', touchTitle: 'Hold BRAKE to slow down', touchSub: 'Let go to speed back up',
    done: (dt) => (tut.acc += car.braking && !car.driftMode ? dt : 0) > 0.7 },
  { title: `Now ${K('S')} + ${K('A')}/${K('D')} to slide`, sub: 'Brake and steer together: the tail swings out', touchTitle: 'Hold BRAKE and steer to slide', touchSub: 'The tail swings out',
    done: (dt) => (tut.acc += car.driftMode ? dt : 0) > 0.8 },
  { title: `${K('Space')} to fire`, sub: 'Hits charge your boost', spot: 'boost', touchTitle: 'Hold FIRE',
    done: (dt) => (tut.acc += held(keys, 'fire') || hud.touch.fire || (settings.fire === 'auto' && lockedNow) ? dt : 0) > 1.2 },
  { title: 'The pursuer is closing in', sub: `Hold ${K('Shift')} to boost away`, touchSub: 'Hold BOOST to get away', spot: 'track', kind: 'warn',
    enter: () => { pursuer.summon(Math.max(0, (car.n.i - I_START) * STEP), 150); hud.pulseTrack(); slowmo = 1.4; car.addBoost(1); },
    done: (dt) => (tut.acc += car.boosting ? dt : 0) > 1 },
  { title: 'Reach the end of the area', sub: 'It falls back, then comes again', spot: 'track',
    done: () => tut.t > 3.5 },
];
let slowmo = 0;
const steps = () => STEPS.filter((st) => !(hud.touch.active && st.touch === false));
function updateTutorial(dt) {
  if (tut.done) return;
  const list = steps();
  const st = list[tut.step];
  tut.t += dt;
  const touch = hud.touch.active;
  const strip = (h) => (touch ? h.replace(/<kbd>[^<]*<\/kbd>\s*/g, '') : h);
  if (tut.phase === 'wait') { // short gap between cards
    hud.card(null);
    if (tut.t > (tut.step === 0 ? 1.6 : 0.5)) { tut.phase = 'show'; tut.t = 0; tut.acc = 0; st.enter?.(); }
    return;
  }
  const title = touch && st.touchTitle ? st.touchTitle : strip(st.title);
  const sub = touch && st.touchSub ? st.touchSub : strip(st.sub);
  if (tut.phase === 'show') {
    hud.card(tut.step, { title, sub, spot: st.spot, kind: st.kind });
    if (tut.t > 0.5 && st.done(dt)) { tut.phase = 'ok'; tut.t = 0; }
  } else if (tut.phase === 'ok') {
    hud.card(tut.step, { title, sub, spot: st.spot, kind: 'ok' });
    if (tut.t > 0.7) {
      tut.step++;
      tut.phase = 'wait';
      tut.t = 0;
      if (tut.step >= list.length) {
        tut.done = true;
        hud.card(null);
        try { localStorage.setItem('endless.tutorial.v2', 'done'); } catch { /* ignore */ }
      }
    }
  }
}

// ---- Closed-loop lap timing: progress is unwrapped so laps count only forward ----
let lapI = car.n.i, lapProg = 0, lapsDone = 0, lapT = 0, bestLap = 0;
try { bestLap = Number(localStorage.getItem(`endless.lap.${MAP.id}`) || 0); } catch { /* ignore */ }
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function updateLap(dt) {
  const N = LOOP.n, i = car.n.i;
  lapProg += ((i - lapI + N + N / 2) % N) - N / 2;
  lapI = i;
  lapT += dt;
  if (Math.floor(lapProg / N) > lapsDone) {
    lapsDone = Math.floor(lapProg / N);
    if (!bestLap || lapT < bestLap) { bestLap = lapT; try { localStorage.setItem(`endless.lap.${MAP.id}`, String(bestLap)); } catch { /* ignore */ } }
    hud.title(`Lap ${lapsDone}`, fmtT(lapT));
    lapT = 0;
  }
  return {
    dist: Math.max(0, lapProg) * STEP,
    frac: ((lapProg % N) + N) % N / N,
    sub: `Lap ${lapsDone + 1} · ${fmtT(lapT)}${bestLap ? ` · Best ${fmtT(bestLap)}` : ''}`,
  };
}

window.__game.lap = () => ({ lapsDone, lapProg, lapT, bestLap });

// ---- Loop ----
const H = 1 / 120;
let acc = 0, last = performance.now(), frames = 0, fpsT = 0, fps = 0, arenaShown = false;

function simulate(seconds) {
  let k = 0;
  for (let t = 0; t < seconds; t += H) {
    car.step(H, readInput());
    pursuer.update(H, Math.max(0, (car.n.i - I_START) * STEP));
    if (++k % 60 === 0) world.update(car.n.i, true);
  }
  world.update(car.n.i, true);
}
if (num('sim', 0) > 0) simulate(num('sim', 0));

function frame(now) {
  const rdt = isPaused() || race?.frozen ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  // slow motion for dramatic tutorial beats: eases back to full speed
  // a beat of slow motion as your car goes up
  slowmo = Math.max(0, slowmo - rdt);
  let dt = rdt * (slowmo > 0 ? 0.35 + 0.65 * Math.max(0, 1 - slowmo / 0.6) ** 2 : 1);
  // the end sequence: slow motion on our wreck or the final kill, then its timed beats
  if (race) { dt *= race.endScale; race.tickEnd(rdt); }
  // hitstop: the world all but freezes for a beat on crits and kills
  if (race?.hitstop > 0) { race.hitstop -= rdt; dt *= 0.04; }
  acc += dt;
  const inp = readInput();
  while (acc >= H) {
    if (!race?.parked) car.step(H, inp);
    race?.stepAI(H);
    emitFx(H, inp);
    acc -= H;
  }
  car.sync(dt);
  skids.update(car);
  streaks.update(dt, car, car.boosting);
  if (flames.update(car.boosting, dt, Math.hypot(car.vx, car.vz), embers)) {
    for (const f of flames.pipes) {
      f.getWorldPosition(tmpV);
      for (let k = 0; k < 4; k++) dust.emit(tmpV.x, tmpV.y, tmpV.z, -car.vx * 0.2 + (Math.random() - 0.5), 0.6, -car.vz * 0.2 + (Math.random() - 0.5), 0.5, 0.9, 0.55, 0.53, 0.5);
    }
  }
  embers.update(dt);
  lineSparks.update(dt);
  dust.update(dt);
  world.update(car.n.i);
  world.tick(dt);
  world.follow(car.x, car.z);
  updateCamera(dt);
  sky.position.copy(camera.position);
  {
    const ahead = SHADOW.half * 0.45, sx = car.x + Math.sin(car.yaw) * ahead, sz = car.z + Math.cos(car.yaw) * ahead;
    const texel = (SHADOW.half * 2) / SHADOW.size, snap = (v) => Math.round(v / texel) * texel;
    const cx = snap(sx), cz = snap(sz), cy = snap(car.y);
    sun.position.set(cx + SUN_DIR.x * 250, cy + SUN_DIR.y * 250, cz + SUN_DIR.z * 250);
    sun.target.position.set(cx, cy, cz);
  }

  guns.update(dt, inp.fire, car, updateLock());
  booms.update(dt);
  casings.update(dt);
  links.update(dt);
  debris.update(dt, (p, u) => {
    dust.emit(p.x, p.y + 0.2, p.z, 0, 1.2 + Math.random(), 0, 0.6 + Math.random() * 0.5, 1 + Math.random(), 0.1, 0.09, 0.08);
    if (u < 0.6) embers.emit(p.x, p.y + 0.15, p.z, (Math.random() - 0.5), 1 + Math.random() * 1.5, (Math.random() - 0.5), 0.3, 0.3, 1.0, 0.5, 0.1);
  });
  tracers.update(dt);
  runTime += dt;
  const dist = Math.max(0, (car.n.i - I_START) * STEP);
  if (dist > best && !params.has('at') && !startAt && !LOOP.on) { best = dist; if (Math.floor(runTime) % 5 === 0) { try { localStorage.setItem('endless.best', String(Math.round(best))); } catch { /* ignore */ } } }
  const bi = LOOP.on ? 0 : biomeIndexAt(dist);
  if (LOOP.on) biomeShown = 0; else if (bi !== biomeShown) { biomeShown = bi; hud.title(BIOMES[bi].name, dist < 10 ? 'Drive · Survive · Destroy' : `${(dist / 1000).toFixed(1)} km`); }
  if (race) {
    race.update(dt);
    hud.set({ speed: car.vf * 3.6, boost: car.boost, boosting: car.boosting, throttle: inp.throttle, lap: race.playerLap, laps: 3, lapT: race.raceT - race.lapStart, bestLap: race.bestLap, heat: guns.heat, overheated: guns.overheated, dt });
    hud.mapUpdate(car.x, car.z, car.yaw);
  } else if (LOOP.on) {
    updateLap(dt);
    hud.set({ speed: car.vf * 3.6, boost: car.boost, boosting: car.boosting, throttle: inp.throttle, lap: lapsDone + 1, lapT, bestLap, dt });
    hud.mapUpdate(car.x, car.z, car.yaw);
  } else {
    hud.set({ speed: car.vf * 3.6, boost: car.boost, boosting: car.boosting, throttle: inp.throttle, dt });
    updatePursuer(dt, dist);
  }
  updateTutorial(dt);

  renderer.info.reset();
  glass.update();
  composer.render();
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const info = renderer.info.render;
  const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : 'n/a';
  hud.debug(() => `fps ${fps}\ndraw calls ${info.calls}\ntriangles ${(info.triangles / 1000).toFixed(0)}K\nheap ${mem}\nbuild ${buildMs} ms\ndist ${Math.round((car.n.i - I_START) * STEP)} m  lat ${car.n.lat.toFixed(1)}\n${car.onRoad ? 'road' : 'sand'}${car.airborne ? '  AIR' : ''}`); // built only while the overlay is open
  window.__stats = { calls: info.calls, tris: info.triangles, buildMs };
  if (++readyFrames === 3) window.__ready = true;
  requestAnimationFrame(frame);
}
let readyFrames = 0;
requestAnimationFrame((t) => { last = t; frame(t); });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  dust.resize();
  embers.resize();
});

function buildSky(cols, sat) {
  const geo = new THREE.SphereGeometry(4500, 32, 16);
  const top = new THREE.Color(cols[0]), mid = new THREE.Color(cols[1]), hor = new THREE.Color(cols[2]);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 4500;
    if (t <= 0.02) c.copy(hor);
    else if (t < 0.16) c.copy(hor).lerp(mid, (t - 0.02) / 0.14);
    else c.copy(mid).lerp(top, Math.min(1, (t - 0.16) / 0.5));
    // pre-compensate for the level's stronger saturation so the sky reads as in the garage
    const l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
    c.r = l + (c.r - l) * sat; c.g = l + (c.g - l) * sat; c.b = l + (c.b - l) * sat;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}
