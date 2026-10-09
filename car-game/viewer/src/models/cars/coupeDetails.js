import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { mesh, box, cyl, tube, slabAlong, socket } from '../../lib/geo.js';
import { loftRings, projectAndGroup } from '../../lib/loft.js';
import { UV, gunmetalMaterial, weldMaterial, darkMaterial, steelMaterial, glassMaterial } from '../../lib/skin.js';
import { glowMat } from '../../lib/materials.js';
import { sideX, topY, bodyTop, cabinBase, cabinTop, WS, RG, along } from './coupeShape.js';
import { buildCautionPlow } from '../parts/cautionPlow.js';
import { buildBrowningM2 } from '../parts/browningM2.js';
import { buildFeed } from '../parts/ammoFeed.js';
import { buildEngineV8, buildRadiator } from '../parts/engineV8.js';

const deg = THREE.MathUtils.degToRad;

export function addDetails(car, { skinMats, dloRear }) {
  const metal = gunmetalMaterial();
  const weld = weldMaterial();
  const dark = darkMaterial();

  // =================== Armor: plates grown from the body surface ===================
  const armor = new THREE.Group();
  armor.name = 'armor';
  car.add(armor);
  // Armor comes off in big chunks, three stages per side: stage 1 goes when that side is
  // down to 2/3, stage 2 at 1/3, stage 3 when it's stripped. Every piece remembers its zone
  // and stage; the car groups them into one detachable part per zone and stage.
  //   front: hood plates / windshield cage + brows / dozer blade
  //   back:  ducktail spoiler / rear-window louvres, trunk plate + light cages / bumper
  //   sides: fender + quarter plates + skirt / window bars + louvres / the big door plate
  const tag = (o, zone, stage) => { o.userData.zone = zone; o.userData.stage = stage; armor.add(o); return o; };
  const plate = (opts, zone, stage) => {
    const n0 = armor.children.length;
    conformalPlate({ ...opts, skinMats: plateMats, weld, group: armor }); // bare bolted steel over the paint
    for (const c of armor.children.slice(n0)) { c.userData.zone = zone; c.userData.stage = stage; }
  };
  const boltMat = steelMaterial(0x5d6369), plateMats = Array(4).fill(metal);
  // bolt heads: on a side plate (axis out along x) or a top plate (axis up)
  const sideBolt = (s, z, y, out, zone, stage) => tag(cyl(0.016, 0.016, 0.014, 6, boltMat, { pos: [s * (sideX(z, y) + out), y, z], rot: [0, 0, Math.PI / 2] }), zone, stage);
  const topBolt = (x, z, out, zone, stage) => tag(cyl(0.016, 0.016, 0.014, 6, boltMat, { pos: [x, topY(z, x) + out, z] }), zone, stage);
  const sideS = (y0, y1, k) => (z) => Array.from({ length: k }, (_, i) => { const y = y0 + ((y1 - y0) * i) / (k - 1); return [sideX(z, y), y]; });
  const topS = (x0, x1, k) => (z) => Array.from({ length: k }, (_, i) => { const x = x0 + ((x1 - x0) * i) / (k - 1); return [x, topY(z, x)]; });
  for (const s of [-1, 1]) {
    const zs = s > 0 ? 'left' : 'right'; // +x is the car's left
    plate({ z0: 0.8, z1: -0.38, sample: sideS(0.36, 0.79, 6), side: s, thick: 0.06, bev: 0.05 }, zs, 3); // door: the big slab
    for (const z of [0.72, 0.21, -0.3]) for (const y of [0.42, 0.73]) sideBolt(s, z, y, 0.062, zs, 3);
    plate({ z0: 2.14, z1: 1.74, sample: sideS(0.32, 0.62, 5), side: s, thick: 0.045 }, zs, 1); // front fender
    plate({ z0: -1.67, z1: -2.1, sample: sideS(0.36, 0.76, 5), side: s, thick: 0.045 }, zs, 1); // rear quarter
    for (const z of [2.06, 1.82]) sideBolt(s, z, 0.47, 0.047, zs, 1);
    for (const z of [-1.75, -2.02]) sideBolt(s, z, 0.56, 0.047, zs, 1);
    plate({ z0: 0.9, z1: -0.84, sample: sideS(0.21, 0.35, 4), side: s, thick: 0.05 }, zs, 1); // rocker skirt
    plate({ z0: 2.1, z1: 0.98, sample: topS(0.87, 0.3, 7), side: s, steps: 4, thick: 0.05 }, 'front', 1); // hood
    for (const z of [2.0, 1.55, 1.1]) for (const x of [0.36, 0.8]) topBolt(s * x, z, 0.052, 'front', 1);
  }
  plate({ z0: -1.93, z1: -2.16, sample: topS(0.82, -0.82, 9), side: 1, thick: 0.045 }, 'back', 2); // trunk lid
  // angular brows over the headlights, and a centre piece bridging them over the grille
  for (const s of [-1, 1]) tag(box(0.44, 0.04, 0.16, metal, { pos: [s * 0.62, 0.632, 2.25], rot: [0.55, 0, s * 0.06] }), 'front', 2);
  tag(box(0.82, 0.04, 0.16, metal, { pos: [0, 0.618, 2.25], rot: [0.55, 0, 0] }), 'front', 2);
  // door gun slits and a hinge strap (they go with the door plate)
  for (const s of [-1, 1]) {
    const zs = s > 0 ? 'left' : 'right';
    tag(box(0.012, 0.035, 0.36, dark, { pos: [s * (sideX(0.2, 0.62) + 0.063), 0.62, 0.25] }), zs, 3);
    tag(box(0.02, 0.05, 0.14, metal, { pos: [s * (sideX(0.7, 0.5) + 0.07), 0.5, 0.7] }), zs, 3);
    tag(box(0.02, 0.05, 0.14, metal, { pos: [s * (sideX(0.7, 0.68) + 0.07), 0.68, 0.7] }), zs, 3);
  }

  // =================== Front: 80s Japanese nose ===================
  // Slim flush headlamps tilted back with the nose and turned round its corners, in
  // recessed housings with chrome bezels; a narrow slot grille with a chamfered surround;
  // a wraparound bumper in the body's worn paint with angled faces, amber lamps set into
  // its corners, an air dam with fog lamps and a raked splitter under it.
  const chrome = steelMaterial(0x8a9096), FZ = 2.252, LY = 0.5;
  const lamp = (s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.5, LY, FZ);
    g.rotation.set(-0.14, s * 0.1, 0, 'YXZ'); // leans back with the nose, wraps toward the corner
    // tall enough to fill the face between the bumper and the brows
    g.add(box(0.38, 0.125, 0.03, chrome, { pos: [0, 0, -0.004] })); // bezel
    g.add(box(0.35, 0.105, 0.03, darkMaterial(0x0a0b0c), { pos: [0, 0, 0.002] })); // recess
    for (const dx of [-0.085, 0.085]) {
      g.add(box(0.15, 0.088, 0.01, darkMaterial(0x2a2d30), { pos: [dx, 0, 0.012] })); // reflector bowl
      g.add(box(0.144, 0.08, 0.008, glowMat('light', 0.5), { pos: [dx, 0.002, 0.019] })); // lens
      g.add(box(0.144, 0.004, 0.006, chrome, { pos: [dx, -0.014, 0.024] })); // lens divider
    }
    g.add(box(0.008, 0.105, 0.02, chrome, { pos: [0, 0, 0.018] })); // centre mullion
    return g;
  };
  for (const s of [-1, 1]) car.add(lamp(s));
  // slot grille: dark slot inside a chamfered surround, small blank badge
  car.add(box(0.5, 0.115, 0.02, chrome, { pos: [0, LY, FZ - 0.002], rot: [-0.14, 0, 0] }));
  car.add(box(0.47, 0.095, 0.03, darkMaterial(0x060606), { pos: [0, LY, FZ + 0.003], rot: [-0.14, 0, 0] }));
  for (let k = -5; k <= 5; k++) car.add(box(0.004, 0.09, 0.01, metal, { pos: [k * 0.04, LY, FZ + 0.016], rot: [-0.14, 0, 0] }));
  for (const y of [-0.03, 0.03]) car.add(box(0.46, 0.004, 0.01, metal, { pos: [0, LY + y, FZ + 0.017], rot: [-0.14, 0, 0] }));
  car.add(box(0.05, 0.03, 0.01, chrome, { pos: [0, LY, FZ + 0.026], rot: [-0.14, 0, 0] }));
  // bumper: three stacked layers traced in plan with chamfered corners (a tucked chin, the
  // main band, a narrower sloped top), so every face is slightly angled
  const plan = (y0, h, front, half, cut) => {
    const sh = new THREE.Shape();
    [[-half, 2.2], [-half, front - cut], [-half + cut * 1.2, front], [half - cut * 1.2, front], [half, front - cut], [half, 2.2]]
      .forEach(([x, z], k) => (k ? sh.lineTo(x, z) : sh.moveTo(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, y0 + h, 0);
    return mesh(projectAndGroup(toCreasedNormals(g, deg(25)), [UV.side, UV.top, UV.front, UV.back]), skinMats);
  };
  car.add(plan(0.25, 0.07, 2.345, 0.8, 0.1)); // chin
  car.add(plan(0.32, 0.09, 2.375, 0.85, 0.11)); // main band
  car.add(plan(0.41, 0.025, 2.35, 0.83, 0.12)); // top step
  for (const s of [-1, 1]) {
    // amber corner lamps on the chamfers, fog lamps in the chin
    const rot = [0, s * 0.69, 0], cx = s * 0.787, cz = 2.322;
    car.add(box(0.13, 0.05, 0.008, chrome, { pos: [cx + s * 0.002, 0.365, cz], rot }));
    car.add(box(0.12, 0.04, 0.012, glowMat('#e08a1c', 0.5), { pos: [cx + s * 0.004, 0.365, cz + 0.004], rot }));
    car.add(box(0.075, 0.035, 0.012, glowMat('light', 0.35), { pos: [s * 0.3, 0.285, 2.348] }));
  }
  car.add(box(0.42, 0.04, 0.012, darkMaterial(0x050505), { pos: [0, 0.285, 2.348] })); // air dam slot
  car.add(box(1.44, 0.016, 0.07, darkMaterial(0x141516), { pos: [0, 0.244, 2.33], rot: [0.12, 0, 0] })); // thin raked splitter

  // =================== Exposed supercharged V8 in the hood opening ===================
  const engine = buildEngineV8();
  engine.position.set(0, 0.42, 1.52);
  engine.rotation.x = 0.04;
  car.add(engine);
  const rad = buildRadiator();
  rad.position.set(0, 0.62, 1.95);
  car.add(rad);
  car.add(socket('HOOD', [0, 1.2, 1.52]));

  // =================== Roof rack + four lamps ===================
  const RY = 1.37;
  const rack = new THREE.Group();
  rack.name = 'roof_rack';
  Object.assign(rack.userData, { part: 'rack', armor: true }); // only comes off when the car goes up
  car.add(rack);
  for (const s of [-1, 1]) {
    for (const z of [0.1, -0.86]) rack.add(tube([s * 0.55, cabinTop(z) - 0.01, z], [s * 0.58, RY, z], 0.018, metal, 6));
    rack.add(tube([s * 0.58, RY, 0.2], [s * 0.58, RY, -0.94], 0.02, metal, 6));
  }
  for (const z of [0.2, -0.94]) rack.add(tube([-0.58, RY, z], [0.58, RY, z], 0.02, metal, 6));
  for (let i = 1; i < 6; i++) rack.add(box(1.14, 0.012, 0.04, metal, { pos: [0, RY - 0.005, 0.2 - i * 0.19] }));
  rack.add(box(1.2, 0.03, 0.05, metal, { pos: [0, RY + 0.05, 0.22] }));
  for (const s of [-1, 1]) rack.add(tube([s * 0.58, RY, 0.2], [s * 0.6, RY + 0.05, 0.22], 0.015, metal, 6));
  for (const x of [-0.42, -0.14, 0.14, 0.42]) {
    rack.add(box(0.03, 0.06, 0.03, metal, { pos: [x, RY + 0.09, 0.22] }));
    rack.add(cyl(0.075, 0.068, 0.1, 16, dark, { pos: [x, RY + 0.16, 0.23], rot: [Math.PI / 2, 0, 0] }));
    rack.add(cyl(0.062, 0.062, 0.01, 16, glowMat('light', 0.6), { pos: [x, RY + 0.16, 0.282], rot: [Math.PI / 2, 0, 0] }));
    rack.add(mesh(new THREE.TorusGeometry(0.07, 0.008, 4, 18), steelMaterial(0x6b7177), { pos: [x, RY + 0.16, 0.284] }));
    for (const r of [deg(45), deg(-45)]) rack.add(box(0.008, 0.13, 0.008, metal, { pos: [x, RY + 0.16, 0.292], rot: [0, 0, r] }));
  }
  car.add(socket('ROOF_MAIN', [0, RY + 0.02, -0.4]));

  // =================== Windshield cage, door-window bars, rear louvres ===================
  for (let i = 0; i < 5; i++) {
    const x = -0.44 + i * 0.22;
    tag(slabAlong(...along(WS.base, WS.top, 0.06), ...along(WS.base, WS.top, 0.8), 0.028, 0.022, metal, 0.03, x), 'front', 2);
  }
  // visor: armor plate over the top of the windshield, folding back onto the roof
  const visorA = along(WS.base, WS.top, 0.74);
  const roofEnd = [-0.12, cabinTop(-0.12)];
  car.add(skinned(slabAlong(...visorA, ...WS.top, 1.34, 0.03, metal, 0.03), skinMats));
  car.add(skinned(slabAlong(...WS.top, ...roofEnd, 1.3, 0.03, metal, 0.02), skinMats));
  car.add(skinned(slabAlong(...along(WS.base, WS.top, 0.7), ...visorA, 1.34, 0.03, metal, 0.05), skinMats)); // chamfered lip
  for (const x of [-0.67, 0.67]) car.add(tube([x, visorA[1] + 0.03, visorA[0] + 0.02], [x * 0.97, WS.top[1] + 0.03, WS.top[0]], 0.007, weld, 4));
  car.add(tube([-0.67, visorA[1] + 0.01, visorA[0] + 0.035], [0.67, visorA[1] + 0.01, visorA[0] + 0.035], 0.007, weld, 4));
  for (const t of [0.36, 0.7]) tag(slabAlong(...along(WS.base, WS.top, t - 0.02), ...along(WS.base, WS.top, t + 0.02), 1.2, 0.022, metal, 0.045), 'front', 2);
  for (const s of [-1, 1]) {
    for (const z of [0.3, 0.02, -0.24]) {
      const yb = cabinBase(z) + 0.03;
      const yt = cabinTop(z) - 0.07;
      const xAt = (y) => 0.8 - 0.12 * ((y - cabinBase(z)) / Math.max(0.05, cabinTop(z) - 0.05 - cabinBase(z)));
      tag(tube([s * (xAt(yb) + 0.012), yb, z], [s * (xAt(yt) + 0.012), yt, z], 0.011, metal, 6), s > 0 ? 'left' : 'right', 2);
    }
  }
  for (let i = 0; i < 9; i++) {
    const t = 0.06 + i * 0.1;
    const l = slabAlong(...along(RG.top, RG.base, t), ...along(RG.top, RG.base, t + 0.07), 1.1, 0.012, metal, 0.035);
    l.rotation.x += 0.45;
    tag(l, 'back', 2);
  }
  for (const x of [-0.56, 0, 0.56]) tag(slabAlong(...along(RG.top, RG.base, 0.03), ...along(RG.top, RG.base, 0.96), 0.035, 0.03, metal, 0.05, x), 'back', 2);
  // R17-style louvres filling the rear quarter openings
  for (const s of [-1, 1]) {
    for (let z = -0.58; z > -1.56; z -= 0.09) {
      const yb = cabinBase(z) + 0.035;
      const yt = cabinTop(z) - 0.078;
      if (yt - yb < 0.04) continue;
      tag(box(0.012, yt - yb, 0.04, metal, { pos: [s * 0.715, (yb + yt) / 2, z], rot: [0, 0, s * 0.12] }), s > 0 ? 'left' : 'right', 2); // flat bars leaning with the glass, like the front window bars
    }
  }

  // =================== Sides: mirrors, handles, side pipes ===================
  for (const s of [-1, 1]) {
    car.add(tube([s * 0.86, 0.84, 0.78], [s * 0.98, 0.9, 0.74], 0.012, metal, 6));
    car.add(box(0.14, 0.08, 0.05, metal, { pos: [s * 1.02, 0.92, 0.74], rot: [0.1, s * 0.25, 0] }));
    {
      const hx = sideX(-0.2, 0.7) + 0.06, zs = s > 0 ? 'left' : 'right'; // door plate surface
      tag(box(0.006, 0.05, 0.18, dark, { pos: [s * (hx + 0.003), 0.7, -0.2] }), zs, 3);
      for (const z of [-0.13, -0.27]) tag(box(0.03, 0.022, 0.022, metal, { pos: [s * (hx + 0.018), 0.7, z] }), zs, 3);
      tag(cyl(0.01, 0.01, 0.17, 8, steelMaterial(0x5d6369), { pos: [s * (hx + 0.034), 0.7, -0.2], rot: [Math.PI / 2, 0, 0] }), zs, 3);
      for (const z of [-0.115, -0.285]) tag(cyl(0.007, 0.007, 0.004, 6, steelMaterial(), { pos: [s * (hx + 0.007), 0.7, z], rot: [0, 0, Math.PI / 2] }), zs, 3);
    }
    const heat = new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.6, metalness: 0.6 });
    for (const [dy, dx, zEnd] of [[0, 0, -0.78], [0.075, 0.012, -0.6]]) {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.8, 0.5 + dy, 0.9), new THREE.Vector3(s * 0.95, 0.42 + dy, 0.86),
        new THREE.Vector3(s * (1.0 + dx), 0.31 + dy, 0.74), new THREE.Vector3(s * (1.0 + dx), 0.31 + dy, 0.2),
        new THREE.Vector3(s * (1.0 + dx), 0.31 + dy, zEnd),
      ]);
      car.add(mesh(new THREE.TubeGeometry(path, 32, 0.038, 8), heat));
      const tip = path.getPointAt(1);
      car.add(mesh(new THREE.TorusGeometry(0.038, 0.006, 4, 12), heat, { pos: [tip.x, tip.y, tip.z] }));
      car.add(cyl(0.032, 0.032, 0.005, 10, darkMaterial(0x050505), { pos: [tip.x, tip.y, tip.z + 0.01], rot: [Math.PI / 2, 0, 0] }));
    }
    for (const z of [0.4, -0.3]) car.add(box(0.06, 0.04, 0.04, metal, { pos: [s * 0.97, 0.33, z] }));
  }

  // =================== Rear: tail panel, caged lights, ducktail, armored bumper, exhausts ===================
  car.add(box(1.56, 0.17, 0.03, dark, { pos: [0, 0.66, -2.235] }));
  for (let i = 0; i < 4; i++) car.add(box(0.3, 0.012, 0.02, metal, { pos: [0, 0.6 + i * 0.04, -2.25] }));
  // brake lights: one material per side so each lights up under braking and can be blown out
  const brakeMats = { L: glowMat('#c8261a', 0.65).clone(), R: glowMat('#c8261a', 0.65).clone(), LA: glowMat('#e08a1c', 0.5).clone(), RA: glowMat('#e08a1c', 0.5).clone() };
  for (const k in brakeMats) brakeMats[k].userData.brake = k; // LA / RA: the amber lamp on that side
  car.userData.brakeMats = brakeMats;
  for (const s of [-1, 1]) {
    car.add(box(0.36, 0.14, 0.05, dark, { pos: [s * 0.6, 0.66, -2.245] }));
    for (let i = 0; i < 4; i++) {
      const x = s * (0.47 + i * 0.085);
      car.add(box(0.075, 0.1, 0.02, brakeMats[(s > 0 ? 'L' : 'R') + (i === 0 ? 'A' : '')], { pos: [x, 0.66, -2.272] }));
    }
    // welded guard cage
    for (let i = 0; i < 4; i++) tag(tube([s * (0.44 + i * 0.105), 0.585, -2.31], [s * (0.44 + i * 0.105), 0.735, -2.31], 0.007, metal, 5), 'back', 2);
    for (const y of [0.6, 0.72]) tag(tube([s * 0.43, y, -2.31], [s * 0.78, y, -2.31], 0.007, metal, 5), 'back', 2);
    for (const x of [0.43, 0.78]) tag(box(0.015, 0.015, 0.07, metal, { pos: [s * x, 0.66, -2.28] }), 'back', 2);
  }
  const duck = extrudeProfile([[-2.02, bodyTop(-2.02) + 0.03], [-2.27, 1.0], [-2.28, 0.97], [-2.2, 0.88]], 1.66);
  tag(mesh(projectAndGroup(toCreasedNormals(duck, deg(25)), [UV.side, UV.top, UV.front, UV.back]), skinMats), 'back', 1);
  const bumper = extrudeProfile([[-2.14, 0.2], [-2.32, 0.23], [-2.38, 0.33], [-2.36, 0.47], [-2.2, 0.5], [-2.14, 0.48]], 1.88);
  tag(mesh(projectAndGroup(toCreasedNormals(bumper, deg(25)), [UV.side, UV.top, UV.front, UV.back]), skinMats), 'back', 3);
  for (const x of [-0.78, -0.3, 0.3, 0.78]) tag(box(0.03, 0.27, 0.2, metal, { pos: [x, 0.36, -2.33] }), 'back', 3);
  {
    const shackle = new THREE.MeshStandardMaterial({ color: 0xb8962a, roughness: 0.65, metalness: 0.4 });
    // tow hook: bolted to the bumper, so it goes with it
    tag(box(0.16, 0.05, 0.1, metal, { pos: [0, 0.215, -2.33] }), 'back', 3);
    for (const x of [-0.035, 0.035]) tag(box(0.016, 0.07, 0.08, metal, { pos: [x, 0.17, -2.38] }), 'back', 3);
    tag(cyl(0.011, 0.011, 0.11, 8, steelMaterial(), { pos: [0, 0.16, -2.39], rot: [0, 0, Math.PI / 2] }), 'back', 3);
    for (const x of [-0.055, 0.055]) tag(cyl(0.016, 0.016, 0.012, 6, steelMaterial(), { pos: [x, 0.16, -2.39], rot: [0, 0, Math.PI / 2] }), 'back', 3);
    const d = mesh(new THREE.TorusGeometry(0.038, 0.011, 8, 16, Math.PI), shackle, { pos: [0, 0.16, -2.39] });
    d.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.5); // hangs back and down from the pin
    tag(d, 'back', 3);
  }
  for (const s of [-1, 1]) {
    for (const x of [0.36, 0.46]) {
      const pipe = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * (x - 0.08), 0.3, -1.78), new THREE.Vector3(s * (x - 0.03), 0.22, -1.98),
        new THREE.Vector3(s * x, 0.18, -2.18), new THREE.Vector3(s * x, 0.175, -2.4),
      ]);
      car.add(mesh(new THREE.TubeGeometry(pipe, 20, 0.036, 10), steelMaterial(0x6a625b)));
      car.add(mesh(new THREE.TorusGeometry(0.036, 0.006, 4, 12), steelMaterial(0x6a625b), { pos: [s * x, 0.175, -2.4] }));
      car.add(box(0.05, 0.06, 0.02, metal, { pos: [s * x, 0.215, -2.12] })); // hanger
      car.add(cyl(0.028, 0.028, 0.005, 10, darkMaterial(0x050505), { pos: [s * x, 0.175, -2.401], rot: [Math.PI / 2, 0, 0] }));
    }
  }
  // fuel filler on the rear deck
  const fz = -1.9;
  car.add(cyl(0.065, 0.065, 0.025, 14, steelMaterial(0x6d7379), { pos: [0.55, topY(fz, 0.55) + 0.012, fz] }));
  car.add(cyl(0.05, 0.05, 0.02, 14, metal, { pos: [0.55, topY(fz, 0.55) + 0.03, fz] }));
  car.add(socket('REAR', [0, 0.36, -2.4], [0, Math.PI, 0]));
  car.add(socket('EXHAUST_L', [0.41, 0.175, -2.41], [0, Math.PI, 0]));
  car.add(socket('EXHAUST_R', [-0.41, 0.175, -2.41], [0, Math.PI, 0]));

  // =================== Attachments: dozer, twin Brownings + belts ===================
  const front = socket('FRONT', [0, 0.36, 2.42]);
  // the dozer blade: its own part (a ram, like the guns), torn off with the front armor's last stage
  Object.assign(front.userData, { part: 'dozer', zone: 'front', stage: 3 });
  car.add(front);
  const plow = buildCautionPlow();
  plow.userData.attachment = true;
  front.add(plow);

  for (const s of [-1, 1]) {
    const gz = 1.4;
    const gx = s * 0.66;
    const gy = topY(gz, gx) + 0.03;
    const mount = socket(s > 0 ? 'GUN_L' : 'GUN_R', [gx, gy, gz]);
    mount.userData.part = 'gun';
    car.add(mount);
    const gun = buildBrowningM2({ feedSide: -s });
    gun.userData.attachment = true;
    mount.add(gun);
    // ammo feed: the mount's variant (a belt into an armored hood chute), its own part so
    // it comes away with the gun
    mount.userData.feed = 'beltChute';
    const feed = buildFeed(mount.userData.feed, { feedPoint: gun.userData.feedPoint.clone().add(mount.position), side: s, at: [s * 0.36, 1.0], topY });
    if (feed) car.add(feed);
  }
}

// Plate whose inner face follows the body surface, with chamfered edges and weld beads.
// sample(z) -> K points [x, y] on the right-side surface, ordered so (dy, -dx) points out.
function conformalPlate({ z0, z1, sample, side = 1, thick = 0.03, bev = 0.04, steps = 3, skinMats, weld, group }) {
  const zs = [z0];
  for (let i = 0; i <= steps; i++) zs.push(z0 - bev + ((z1 + bev) - (z0 - bev)) * (i / steps));
  zs.push(z1);
  const rings = [];
  const weldA = [];
  const weldB = [];
  zs.forEach((z, zi) => {
    const pts = sample(z);
    const k = pts.length;
    const end = zi === 0 || zi === zs.length - 1;
    const inner = [];
    const outer = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(k - 1, i + 1)];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const edge = i === 0 || i === k - 1;
      const t = thick * (end ? 0.35 : 1) * (edge ? 0.4 : 1);
      inner.push([(p[0] - nx * 0.006) * side, p[1] - ny * 0.006, z]);
      outer.push([(p[0] + nx * t) * side, p[1] + ny * t, z]);
      if (i === 0) weldA.push(new THREE.Vector3((p[0] + nx * 0.006) * side, p[1] + ny * 0.006, z));
      if (i === k - 1) weldB.push(new THREE.Vector3((p[0] + nx * 0.006) * side, p[1] + ny * 0.006, z));
    });
    let ring = [...inner, ...outer.reverse()];
    if (side > 0) ring = ring.reverse();
    rings.push(ring);
  });
  const geo = toCreasedNormals(loftRings(rings, { caps: 'strip' }), deg(30));
  group.add(mesh(projectAndGroup(geo, [UV.side, UV.top, UV.front, UV.back]), skinMats));
  for (const line of [weldA, weldB]) {
    group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), line.length * 3, 0.007, 4), weld));
  }
}

// Bake a mesh's transform and repaint it with the body skins (world-space UVs) so a
// bolt-on piece shares the exact paint, wear and rust of the panel under it.
function skinned(m, skinMats) {
  m.updateMatrix();
  const geo = m.geometry.clone().applyMatrix4(m.matrix).toNonIndexed();
  geo.clearGroups();
  const out = mesh(projectAndGroup(toCreasedNormals(geo, deg(25)), [UV.side, UV.top, UV.front, UV.back]), skinMats);
  return out;
}

function extrudeProfile(outline, width) {
  const s = new THREE.Shape();
  outline.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}
