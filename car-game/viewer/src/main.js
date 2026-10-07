import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MODELS } from './registry.js';
import { buildGoonRef } from './models/ref/goon.js';
import { countTriangles } from './lib/geo.js';

// URL params let the screenshot script drive the viewer:
// ?model=starter_coupe&view=chase&ground=sand&sockets=1&goon=1&ui=0
const params = new URLSearchParams(location.search);

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xf3d6c0, 30, 70);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.9, 0);

// Warm late-afternoon light, per the style target
scene.add(new THREE.HemisphereLight(0x9fd8e0, 0xe8cfa0, 1.1));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const GROUNDS = { sand: 0xead7ae, asphalt: 0x5c5d63 };
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: GROUNDS.sand, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const goon = buildGoonRef();
goon.position.set(-2.6, 0, 3.2);
goon.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(goon);

// ---- State ----
const state = {
  model: params.get('model') || MODELS[0].id,
  view: params.get('view') || 'chase',
  ground: params.get('ground') || 'sand',
  sockets: params.get('sockets') === '1',
  labels: params.get('labels') === '1',
  spin: params.get('spin') === '1',
  steer: params.get('steer') === '1',
  wire: false,
  goon: params.get('goon') !== '0',
  armor: params.get('armor') !== '0',
  parts: params.get('parts') !== '0',
};
if (params.get('ui') === '0') document.body.classList.add('noui');

let current = null;
const gizmos = [];

function loadModel(id) {
  if (current) scene.remove(current);
  gizmos.length = 0;
  const def = MODELS.find((m) => m.id === id) ?? MODELS[0];
  current = def.build();
  current.traverse((o) => {
    if (!o.userData.isSocket) return;
    const g = new THREE.Group();
    g.userData.debug = true;
    const axes = new THREE.AxesHelper(0.3);
    axes.userData.debug = true;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2bd6, depthTest: false }));
    dot.userData.debug = true;
    dot.renderOrder = 10;
    const el = document.createElement('div');
    el.className = 'sock-label';
    el.textContent = o.name;
    const label = new CSS2DObject(el);
    label.position.y = 0.12;
    label.userData.debug = true;
    g.add(axes, dot, label);
    o.add(g);
    gizmos.push({ g, label });
  });
  scene.add(current);
  applyToggles();
  const { tris, meshes } = countTriangles(current);
  document.getElementById('stats').textContent = `${tris.toLocaleString()} tris · ${meshes} meshes`;
}

function applyToggles() {
  for (const { g, label } of gizmos) {
    g.visible = state.sockets;
    label.visible = state.sockets && state.labels;
    label.element.style.display = label.visible ? '' : 'none';
  }
  goon.visible = state.goon;
  ground.material.color.setHex(GROUNDS[state.ground]);
  current?.traverse((o) => {
    if (o.isMesh && !o.userData.debug) for (const m of [].concat(o.material)) m.wireframe = state.wire;
  });
  const armor = current?.getObjectByName('armor');
  if (armor) armor.visible = state.armor;
  current?.traverse((o) => { if (o.userData.attachment) o.visible = state.parts; });
}

// Camera presets. Car faces +Z, so "chase" sits behind it at -Z.
const VIEWS = {
  chase: { pos: [1.6, 2.6, -6.4], target: [0, 0.7, 0.6] },
  rearClose: { pos: [1.9, 1.3, -4.3], target: [0, 0.6, -1.4] },
  frontClose: { pos: [2.2, 1.6, 4.4], target: [0, 0.8, 1.3] },
  hoodClose: { pos: [1.3, 1.75, 3.1], target: [0, 0.9, 1.0] },
  rearLow: { pos: [1.0, 0.5, -3.7], target: [0, 0.25, -2.3] },
  door: { pos: [2.3, 0.95, -0.2], target: [0.9, 0.7, -0.2] },
  cockpit: { pos: [0.95, 1.45, -0.35], target: [0.37, 0.85, 0.45] },
  wheel: { pos: [2.1, 0.45, 1.3], target: [0.8, 0.33, 1.3] },
  gunRear: { pos: [0.55, 0.55, -1.0], target: [0, 0.27, -0.35] },
  rear34: { pos: [4.0, 2.0, -4.8], target: [0, 0.6, 0] },
  side: { pos: [7.2, 0.9, 0], target: [0, 0.6, 0] },
  front34: { pos: [4.0, 1.8, 5.0], target: [0, 0.6, 0] },
  top: { pos: [0, 9, 0.01], target: [0, 0, 0] },
};
function setView(name) {
  const v = VIEWS[name] ?? VIEWS.chase;
  state.view = name;
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
  refreshButtons();
}

// ---- UI ----
const sel = document.getElementById('model');
for (const cat of [...new Set(MODELS.map((m) => m.category))]) {
  const og = document.createElement('optgroup');
  og.label = cat;
  for (const m of MODELS.filter((x) => x.category === cat)) og.append(new Option(m.name, m.id));
  sel.append(og);
}
sel.value = state.model;
sel.onchange = () => { state.model = sel.value; loadModel(state.model); };

const buttons = [];
function addButton(parent, text, isActive, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = () => { onClick(); refreshButtons(); };
  document.getElementById(parent).append(b);
  buttons.push({ b, isActive });
}
function refreshButtons() {
  for (const { b, isActive } of buttons) b.classList.toggle('active', isActive());
}
for (const v of Object.keys(VIEWS)) addButton('views', v, () => state.view === v, () => setView(v));
for (const gname of Object.keys(GROUNDS)) addButton('grounds', gname, () => state.ground === gname, () => { state.ground = gname; applyToggles(); });
for (const key of ['armor', 'parts', 'sockets', 'labels', 'spin', 'steer', 'wire', 'goon']) {
  addButton('toggles', key, () => state[key], () => { state[key] = !state[key]; applyToggles(); });
}

// ---- Loop ----
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const wheels = current?.userData.wheels;
  if (wheels) {
    for (const w of Object.values(wheels)) {
      if (state.spin) w.spin.rotation.x += dt * 8;
      if (w.front) w.steer.rotation.y = state.steer ? Math.sin(t * 1.2) * 0.45 : 0;
    }
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

loadModel(state.model);
setView(state.view);
frame();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4fb3bf');
  grad.addColorStop(0.55, '#a9d9d6');
  grad.addColorStop(0.8, '#f6c9b5');
  grad.addColorStop(1, '#f3d6c0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
