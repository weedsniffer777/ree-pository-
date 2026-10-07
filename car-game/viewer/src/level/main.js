import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeShader } from '../lib/grade.js';
import { buildStarterCoupe } from '../models/cars/starterCoupe.js';
import { S, STEP, I_START, I_ARENA, ARENA, pointAt } from './track.js';
import { buildTerrain, terrainHeight } from './terrain.js';
import { buildRoad } from './road.js';
import { buildStructures } from './structures.js';
import { buildProps } from './props.js';
import { bakeGroup } from './bake.js';
import { CarController } from './car.js';
import { Dust, addFlames } from './fx.js';
import { createHud } from './hud.js';

// Level 1: desert highway. Debug/screenshot params:
// ?at=<m from start>&lat=<m>&view=chase|high|side|front|aerial|overview&orbit=<deg>&auto=1&sim=<s>&ui=0&stats=1

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
const tBuild = performance.now();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.info.autoReset = false;
document.getElementById('app').appendChild(renderer.domElement);

const HORIZON = 0xf3d5b2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(HORIZON);
scene.fog = new THREE.Fog(HORIZON, 140, 1150);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
grade.uniforms.saturation.value = 1.4; // punchier than the garage; the sky dome is pre-desaturated to match
composer.addPass(grade);

scene.add(new THREE.HemisphereLight(0xe2ecf2, 0xd09460, 1.55));
const sun = new THREE.DirectionalLight(0xffd3a0, 3.5);
const SUN_DIR = new THREE.Vector3(70, 85, 45).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 320 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const sky = buildSky();
scene.add(sky);

// ---- World ----
scene.add(buildTerrain());
scene.add(buildRoad());
const structures = buildStructures();
scene.add(structures.group);
const props = buildProps(structures.exclusions);
scene.add(props.group);

// ---- Car ----
const model = buildStarterCoupe();
bakeGroup(model, { skip: (o) => o.name.startsWith('wheel_') });
for (const w of Object.values(model.userData.wheels)) bakeGroup(w.spin);
const flames = addFlames(model);
const car = new CarController(model, [...structures.colliders, ...props.colliders]);
scene.add(car.rig);
const startI = () => Math.min(I_ARENA, I_START + Math.round(num('at', 0) / STEP));
car.reset(startI(), num('lat', 1.85));

const dust = new Dust(700);
scene.add(dust.points);
const buildMs = Math.round(performance.now() - tBuild);
window.__scene = scene;

// ---- Input ----
const coarse = matchMedia('(pointer: coarse)').matches;
const hud = createHud({ touch: coarse });
if (params.get('ui') === '0') hud.hide();
if (params.get('stats') === '1') hud.toggleDebug();

const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR') { car.reset(I_START, 1.85); arenaShown = false; hud.banner(false); hud.showHint(); }
  if (e.code === 'F3' || e.code === 'Backquote') hud.toggleDebug();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let orbitYaw = 0, orbitPitch = 0, dragging = false, lastDrag = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { dragging = true; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw -= e.movementX * 0.006;
  orbitPitch = THREE.MathUtils.clamp(orbitPitch + e.movementY * 0.004, -0.2, 0.6);
});
const endDrag = () => { dragging = false; lastDrag = performance.now(); };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

const auto = params.get('auto') === '1';
function autopilot() {
  const n = car.n;
  const look = Math.min(S.count - 1, n.i + Math.round((12 + Math.abs(car.vf) * 0.7) / STEP));
  const tp = pointAt(look, 1.85);
  let diff = Math.atan2(tp.x - car.x, tp.z - car.z) - car.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const steer = THREE.MathUtils.clamp(-diff * 2.4, -1, 1);
  const done = n.i > I_ARENA - 20;
  return { throttle: done ? 0 : 1, brake: done && car.vf > 1 ? 1 : 0, steer, nitro: !done && Math.abs(steer) < 0.12 && car.nitro > 0.4, handbrake: false };
}

function readInput() {
  if (auto) return autopilot();
  const k = (...c) => c.some((x) => keys.has(x));
  const inp = {
    throttle: k('KeyW', 'ArrowUp') ? 1 : 0,
    brake: k('KeyS', 'ArrowDown') ? 1 : 0,
    steer: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
    nitro: k('ShiftLeft', 'ShiftRight'),
    handbrake: k('Space'),
  };
  const t = hud.touch;
  if (t.active) {
    inp.throttle = t.brake ? 0 : 1; // auto-throttle on touch
    inp.brake = t.brake ? 1 : inp.brake;
    inp.steer = t.steer || inp.steer;
    inp.nitro = t.nitro || inp.nitro;
  }
  return inp;
}

// ---- Effects ----
const SAND = [0.86, 0.68, 0.48], SMOKE = [0.86, 0.85, 0.83];
let emitAcc = 0;
function emitFx(dt, inp) {
  const speed = Math.hypot(car.vx, car.vz);
  const drifting = Math.abs(car.vl) > 3.2 || (inp.handbrake && speed > 6);
  if (car.airborne || (speed < 4 && !drifting) || (car.onRoad && !drifting)) return;
  emitAcc += dt * (car.onRoad ? 40 : 30 + speed * 2.2);
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
let camYaw = car.yaw, fov = 62, shake = 0;
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
function updateCamera(dt) {
  const view = params.get('view') || 'chase';
  const speed = Math.hypot(car.vx, car.vz);
  const f = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  shake = Math.max(shake, Math.min(0.5, car.events.impact * 0.03 + car.events.land * 0.02));
  car.events.impact = car.events.land = 0;
  shake *= Math.exp(-dt * 7);
  const jx = (Math.random() - 0.5) * shake, jy = (Math.random() - 0.5) * shake;
  if (!dragging && performance.now() - lastDrag > 700) {
    orbitYaw *= Math.exp(-dt * 3);
    orbitPitch *= Math.exp(-dt * 3);
  }
  let target = car.yaw;
  if (car.vf > 5) target += THREE.MathUtils.clamp(Math.atan2(Math.sin(Math.atan2(car.vx, car.vz) - car.yaw), Math.cos(Math.atan2(car.vx, car.vz) - car.yaw)), -0.4, 0.4) * 0.6;
  camYaw = lerpAngle(camYaw, target, 1 - Math.exp(-dt * 6));
  const yawC = camYaw + orbitYaw + THREE.MathUtils.degToRad(num('orbit', 0));
  const [fx, fz] = f(yawC);
  let fovT = 62 + Math.min(speed, 50) * 0.12 + (car.boosting ? 10 : 0);
  if (view === 'chase' || view === 'high') {
    const back = (view === 'high' ? 13 : 6.4) + Math.min(speed, 45) * 0.035;
    const up = (view === 'high' ? 6.5 : 2.3) + orbitPitch * 4;
    const px = car.x - fx * back, pz = car.z - fz * back;
    const py = Math.max(car.y + up, terrainHeight(px, pz) + 0.8);
    camera.position.set(px + jx, py + jy, pz);
    camera.lookAt(car.x + fx * 3.2, car.y + 1.05, car.z + fz * 3.2);
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
  } else if (view === 'overview') {
    camera.position.set(0, 1500, 760);
    camera.up.set(1, 0, 0);
    camera.lookAt(0, 0, 761);
    fovT = 62;
  }
  fov += (fovT - fov) * (1 - Math.exp(-dt * 4));
  if (num('sim', 0) > 0 || view !== 'chase') fov = fovT;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

// ---- Loop ----
const H = 1 / 120;
let acc = 0, last = performance.now(), frames = 0, fpsT = 0, fps = 0, arenaShown = false;

function simulate(seconds) {
  for (let t = 0; t < seconds; t += H) car.step(H, readInput());
}
if (num('sim', 0) > 0) simulate(num('sim', 0));

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  const inp = readInput();
  while (acc >= H) {
    car.step(H, inp);
    emitFx(H, inp);
    acc -= H;
  }
  car.sync(dt);
  flames.update(car.boosting);
  dust.update(dt);
  structures.update(dt);
  updateCamera(dt);
  sky.position.copy(camera.position);
  sun.position.set(car.x + SUN_DIR.x * 150, car.y + SUN_DIR.y * 150, car.z + SUN_DIR.z * 150);
  sun.target.position.set(car.x, car.y, car.z);

  const progress = THREE.MathUtils.clamp((car.n.i - I_START) / (I_ARENA - I_START), 0, 1);
  hud.set({
    speed: Math.abs(car.vf) * 3.6, nitro: car.nitro, boosting: car.boosting, progress,
    dist: (I_ARENA - car.n.i) * STEP,
  });
  const inArena = Math.hypot(car.x - ARENA.x, car.z - ARENA.z) < ARENA.r - 4;
  if (inArena !== arenaShown) { arenaShown = inArena; hud.banner(inArena); }

  renderer.info.reset();
  composer.render();
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  const info = renderer.info.render;
  const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : 'n/a';
  hud.debug(`fps ${fps}\ndraw calls ${info.calls}\ntriangles ${(info.triangles / 1000).toFixed(0)}K\nheap ${mem}\nbuild ${buildMs} ms\ndist ${Math.round((car.n.i - I_START) * STEP)} m  lat ${car.n.lat.toFixed(1)}\n${car.onRoad ? 'road' : 'sand'}${car.airborne ? '  AIR' : ''}`);
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
});

function buildSky() {
  const geo = new THREE.SphereGeometry(4500, 32, 16);
  const top = new THREE.Color('#6aaed6'), mid = new THREE.Color('#aed2e6'), hor = new THREE.Color('#f3d5b2');
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
    c.r = l + (c.r - l) * 0.87; c.g = l + (c.g - l) * 0.87; c.b = l + (c.b - l) * 0.87;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}
