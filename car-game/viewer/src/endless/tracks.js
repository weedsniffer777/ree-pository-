// Closed-loop track definitions. pts are control points in metres (x, z; the car starts at
// the first point heading toward the second); elev is sine harmonics of the lap; width is
// [lap fraction, road width scale] pairs eased around the lap. features are one-off set
// pieces and decor is the kit's data-driven fences / road marks / scatter (see kit.js);
// everything is placed by lap fraction. 'highway' tracks are open roads; 'yard' tracks are
// walled container terminals.

const FEN = 19.5; // fence line on the highways (matches the physical corridor)
const highwayStart = [
  { group: 'bleacher', at: 0.012, side: 1, off: 14 }, { group: 'tent', at: 0.99, side: -1, off: 12 }, { group: 'tower', at: 0.02, side: -1, off: 12 },
  { mark: 'wear', a: 0, b: 1, count: 170 },
];

export const TRACKS = {
  desert: {
    name: 'Desert Highway', kind: 'highway', walls: 'rails', seed: 4242,
    pts: [ // a 650 m drag north into a hairpin, a fast diagonal west, a tight double back east, two snaps home
      [0, 0], [0, 350], [0, 700], [-20, 790], [-80, 835], [-150, 820], [-185, 760], [-190, 620], [-200, 470],
      [-240, 400], [-320, 380], [-400, 400], [-520, 430], [-640, 420], [-720, 360], [-740, 260], [-690, 190],
      [-560, 170], [-420, 160], [-330, 120], [-300, 40], [-330, -40], [-400, -110], [-380, -190], [-300, -220],
      [-160, -200], [-60, -120], [-15, -50],
    ],
    elev: [[6, 1, 0.4], [2.8, 2, 1.7], [1.2, 5, 0.3]],
    width: [[0, 1], [0.05, 1], [0.08, 1.6], [0.2, 1.6], [0.23, 1], [0.64, 1], [0.66, 1.4], [0.7, 1.4], [0.72, 1]],
    sky: ['#6aaed6', '#aed2e6', '#f3d5b2'], fog: ['#f3d5b2', 120, 950],
    sun: [0xffdcae, 3.6], hemi: [0xe6eef4, 0xd9a06a, 1.9],
    grade: { saturation: 1.58, contrast: 1.04, lift: 0.07, toon: 0.45, exposure: 1.22 },
    road: { centre: 'double', edge: 'none', sand: true },
    ground: { a: '#d6965a', b: '#e4b07a', dark: '#b77a48', pale: '#ecc898', rock: '#a55636', gravel: '#c79a6c' },
    hills: 52, density: { bush: 1, grass: 1, sag: 1, rock: 1 },
    features: [
      { type: 'bridge', at: 0.14 }, { type: 'bridge', at: 0.675 },
      { type: 'sideroad', at: 0.35, side: -1 }, { type: 'sideroad', at: 0.48, side: 1 }, { type: 'sideroad', at: 0.95, side: 1 },
      { type: 'billboard', at: 0.05, side: 1 }, { type: 'billboard', at: 0.22, side: -1 }, { type: 'billboard', at: 0.33, side: 1 }, { type: 'billboard', at: 0.47, side: -1 },
      { type: 'billboard', at: 0.66, side: 1 }, { type: 'billboard', at: 0.9, side: -1 }, { type: 'billboard', at: 0.94, side: 1 },
      { type: 'tower', at: 0.44, side: 1 }, { type: 'tower', at: 0.97, side: -1 }, { type: 'windpump', at: 0.6, side: -1 }, { type: 'windpump', at: 0.36, side: 1 },
    ],
    decor: [
      { fence: 'barbed', a: 0, b: 0.15, abs: FEN }, { fence: 'woodrail', a: 0.15, b: 0.3, abs: FEN }, { fence: 'barbed', a: 0.3, b: 0.5, abs: FEN },
      { fence: 'ranch', a: 0.5, b: 0.62, abs: FEN }, { fence: 'cable', a: 0.62, b: 0.72, abs: FEN }, { fence: 'barbed', a: 0.72, b: 1, abs: FEN },
      { mark: 'lanes' },
      { mark: 'arrow', a: 0.19, b: 0.225, every: 40 }, { mark: 'number', at: 0.035, text: '65', lane: 0.5 }, { mark: 'number', at: 0.5, text: '55', lane: 0.5 },
      { scatter: 'cone', a: 0.125, b: 0.155, abs: [9.4, 10], every: 5 }, { scatter: 'cone', a: 0.66, b: 0.69, abs: [9.4, 10], every: 5 },
      { scatter: 'bale', a: 0.5, b: 0.62, side: 1, abs: [24, 40], every: 14, cluster: [2, 2] },
      { scatter: 'barrel', a: 0.7, b: 0.74, side: -1, abs: [26, 32], every: 12, cluster: [3, 1.6] },
      ...highwayStart,
    ],
  },
  salt: {
    name: 'Salt Flats', kind: 'highway', walls: 'rails', seed: 515,
    pts: [ // a 1.2 km flat-out run into a hairpin, a fast return leg, a tight technical knot, back to the line
      [0, 0], [0, 450], [0, 900], [0, 1250], [-25, 1340], [-90, 1385], [-160, 1365], [-190, 1300], [-200, 1100],
      [-230, 900], [-320, 820], [-420, 800], [-520, 760], [-560, 680], [-540, 600], [-460, 540], [-380, 470],
      [-370, 330], [-420, 220], [-430, 80], [-380, -20], [-280, -70], [-150, -80], [-50, -50],
    ],
    elev: [[2.2, 1, 0.2], [1.0, 3, 1.1]],
    width: [[0, 1], [0.03, 1.6], [0.32, 1.6], [0.36, 1], [0.45, 1], [0.47, 1.4], [0.52, 1.4], [0.54, 1]],
    sky: ['#7db8dc', '#c3dceb', '#f4ece0'], fog: ['#f1eadf', 160, 1100],
    sun: [0xfff0d8, 3.8], hemi: [0xeef4f8, 0xe2d4bc, 2.1],
    grade: { saturation: 1.4, contrast: 1.04, lift: 0.07, toon: 0.4, exposure: 1.22 },
    road: { centre: 'dashed', edge: 'none', sand: true },
    ground: { a: '#e6dccb', b: '#f1ebe0', dark: '#d2c3aa', pale: '#faf6ef', rock: '#b38a6c', gravel: '#d8ccb8' },
    hills: 30, density: { bush: 0.15, grass: 0.2, sag: 0, rock: 0.3 },
    features: [
      { type: 'bridge', at: 0.2 },
      { type: 'sideroad', at: 0.1, side: -1 }, { type: 'sideroad', at: 0.48, side: 1 }, { type: 'sideroad', at: 0.92, side: -1 },
      { type: 'billboard', at: 0.15, side: 1 }, { type: 'billboard', at: 0.3, side: -1 }, { type: 'billboard', at: 0.5, side: -1 },
      { type: 'billboard', at: 0.83, side: 1 }, { type: 'billboard', at: 0.95, side: 1 },
      { type: 'tower', at: 0.08, side: 1 }, { type: 'tower', at: 0.45, side: -1 }, { type: 'windpump', at: 0.77, side: 1 },
    ],
    decor: [
      { fence: 'cable', a: 0, b: 0.3, abs: FEN }, { fence: 'barbed', a: 0.3, b: 0.7, abs: FEN }, { fence: 'woodrail', a: 0.7, b: 1, abs: FEN },
      { mark: 'lanes' },
      { mark: 'arrow', a: 0.05, b: 0.15, every: 70 }, { mark: 'number', at: 0.02, text: '90', lane: 0.5 }, { mark: 'number', at: 0.7, text: '45', lane: 0.5 },
      { scatter: 'cone', a: 0.185, b: 0.215, abs: [9.8, 10.4], every: 5 },
      { scatter: 'barrel', a: 0.1, b: 0.12, side: 1, abs: [26, 32], every: 10, cluster: [3, 1.6] },
      ...highwayStart,
    ],
  },
  dustbowl: {
    name: 'Dust Bowl', kind: 'highway', walls: 'rails', seed: 909,
    pts: [ // short sprints between hairpins: north, double back south, east, double back west, home
      [0, 0], [0, 300], [0, 560], [30, 640], [100, 670], [170, 640], [190, 560], [195, 400], [200, 260],
      [240, 190], [330, 170], [450, 175], [560, 180], [640, 150], [670, 80], [630, 10], [520, -20], [400, -40],
      [300, -60], [220, -120], [120, -150], [40, -110], [5, -50],
    ],
    elev: [[7, 1, 0.4], [3.2, 2, 1.7], [1.4, 5, 0.3]],
    width: [[0, 1], [0.05, 1], [0.07, 1.5], [0.2, 1.5], [0.23, 1], [0.5, 1], [0.52, 1.4], [0.6, 1.4], [0.62, 1]],
    sky: ['#6aaed6', '#aed2e6', '#f0cda6'], fog: ['#efc9a0', 110, 900],
    sun: [0xffd4a4, 3.6], hemi: [0xe6eef4, 0xd08a58, 1.9],
    grade: { saturation: 1.58, contrast: 1.05, lift: 0.07, toon: 0.45, exposure: 1.22 },
    road: { centre: 'double', edge: 'none', sand: true },
    ground: { a: '#c8794a', b: '#d99260', dark: '#a65c36', pale: '#e3a676', rock: '#9c4128', gravel: '#b8805a' },
    hills: 80, density: { bush: 0.6, grass: 0.5, sag: 0.45, rock: 1.8 },
    features: [
      { type: 'bridge', at: 0.12 }, { type: 'bridge', at: 0.56 },
      { type: 'sideroad', at: 0.38, side: 1 }, { type: 'sideroad', at: 0.78, side: -1 },
      { type: 'billboard', at: 0.05, side: -1 }, { type: 'billboard', at: 0.34, side: 1 }, { type: 'billboard', at: 0.53, side: -1 },
      { type: 'billboard', at: 0.75, side: 1 }, { type: 'billboard', at: 0.82, side: -1 },
      { type: 'tower', at: 0.42, side: -1 }, { type: 'tower', at: 0.6, side: 1 }, { type: 'windpump', at: 0.9, side: -1 },
    ],
    decor: [
      { fence: 'woodrail', a: 0, b: 0.3, abs: FEN }, { fence: 'barbed', a: 0.3, b: 0.6, abs: FEN }, { fence: 'cable', a: 0.6, b: 0.8, abs: FEN }, { fence: 'ranch', a: 0.8, b: 1, abs: FEN },
      { mark: 'lanes' },
      { mark: 'arrow', a: 0.4, b: 0.48, every: 55 }, { mark: 'number', at: 0.55, text: '35', lane: 0.5 }, { mark: 'number', at: 0.03, text: '55', lane: 0.5 },
      { scatter: 'cone', a: 0.105, b: 0.135, abs: [9.4, 10], every: 5 }, { scatter: 'cone', a: 0.545, b: 0.575, abs: [9.4, 10], every: 5 },
      { scatter: 'bale', a: 0.8, b: 0.95, side: -1, abs: [24, 40], every: 14, cluster: [2, 2] },
      ...highwayStart,
    ],
  },
  yard: {
    name: 'Yard', kind: 'yard', walls: 'both', seed: 777,
    pts: [
      [0, 0], [0, 200], [0, 420], [-20, 540], [-90, 600], [-190, 610], [-270, 570], [-330, 490],
      [-330, 400], [-270, 340], [-180, 330], [-125, 270], [-135, 185], [-215, 145], [-305, 155],
      [-385, 105], [-395, 5], [-335, -65], [-235, -60], [-165, -105], [-90, -90], [-30, -50],
    ],
    elev: [[1.2, 1, 1.2], [0.6, 3, 0.2]],
    width: [[0, 1.2], [0.1, 1.2], [0.18, 1], [0.3, 0.85], [0.38, 0.9], [0.45, 1.3], [0.58, 1.55], [0.66, 1.55], [0.74, 1], [0.85, 0.85], [0.93, 1.1]],
    sky: ['#8a98a2', '#b4bcc0', '#cfcac0'], fog: ['#c2bfb7', 90, 760],
    sun: [0xffe8cc, 3.1], hemi: [0xd8dfe3, 0xa89c8a, 1.8],
    grade: { saturation: 1.22, contrast: 1.1, lift: 0.06, toon: 0.35, exposure: 1.24 },
    road: { centre: 'none', edge: 'solid', sand: false },
    ground: { slabs: true, a: '#dcdcd9', b: '#ecebe8', dark: '#bebcb8', pale: '#f6f5f2', rock: '#d4d2cd', gravel: '#c8c6c1' },
    hills: 6, bump: 0.25,
    terminal: { quayX: 48, margin: 100, block: 110, ship: 210 },
    features: [
      // ship-to-shore cranes straddle the road (legs 17 m out); the boom reaches toward `side`
      // ship-to-shore cranes on the quay straight, straddling the road, booms out over the water
      { type: 'quaycrane', at: 0.045, side: 1, color: 0x3d6e99 }, { type: 'quaycrane', at: 0.095, side: 1, color: 0xa83a28, load: true },
      { type: 'quaycrane', at: 0.145, side: 1, color: 0xc8762a, upper: 0xcfc8b8 },
    ],
    decor: [
      // perimeter: one dominant type per stretch, broken up by others and the odd gap
      { fence: 'mix', a: 0, b: 0.3, side: 1, off: 2.4, piece: [10, 34], gaps: 0.15, palette: [['sheet', 6], ['chainlink', 3, { off: 1.7 }], ['concrete', 1.5, { off: 2.2 }], ['blocks', 1, { off: 1.4 }], ['gap', 0.6]] },
      { fence: 'mix', a: 0, b: 0.19, side: -1, off: 2.4, piece: [10, 34], gaps: 0.15, palette: [['sheet', 6], ['chainlink', 3, { off: 1.7 }], ['concrete', 1.5, { off: 2.2 }], ['blocks', 1, { off: 1.4 }], ['gap', 0.6]] },
      // first right-hander: a tall solid sheet wall on the outside closes the view ahead
      { fence: 'sheet', a: 0.19, b: 0.3, side: -1, off: 2.4, h: 4.6 },
      { fence: 'mix', a: 0.3, b: 0.44, off: 4.2, piece: [13, 40], palette: [['containers', 6], ['sheet', 2, { off: 2.4 }], ['blocks', 1, { off: 1.4 }]] },
      { fence: 'mix', a: 0.44, b: 0.7, off: 1.8, piece: [10, 30], gaps: 0.2, palette: [['chainlink', 6], ['sheet', 2, { off: 2.4 }], ['tires', 1, { off: 1.4 }], ['blocks', 1.5, { off: 1.4 }], ['gap', 0.8]] },
      { fence: 'mix', a: 0.7, b: 1, off: 2.4, piece: [10, 34], gaps: 0.15, palette: [['sheet', 5], ['concrete', 2.5, { off: 2.2 }], ['chainlink', 2, { off: 1.7 }], ['sandbags', 0.7, { off: 1.3 }], ['gap', 0.5]] },
      { fence: 'lamps', a: 0, b: 1, off: 0.75 },
      { fence: 'piperack', a: 0.72, b: 0.8, side: 1, off: 7.5 },
      // markings: gores at width changes, crosswalks at junctions, numerals, stop lines, wear
      { mark: 'hatch', at: 0.37, len: 70, lat: [0.05, 0.4], sym: true }, { mark: 'hatch', at: 0.55, len: 70, lat: [0.05, 0.45], sym: true }, { mark: 'hatch', at: 0.72, len: 60, lat: [0.05, 0.4], sym: true },
      { mark: 'crosswalk', at: 0.12 }, { mark: 'crosswalk', at: 0.27 }, { mark: 'crosswalk', at: 0.58 }, { mark: 'stopline', at: 0.123, sym: true },
      { mark: 'number', at: 0.07, text: '20', lane: 0.5 }, { mark: 'number', at: 0.46, text: '15', lane: -0.5 }, { mark: 'number', at: 0.8, text: '30', lane: 0.5 },
      { mark: 'arrow', a: 0.3, b: 0.4, every: 45 }, { mark: 'wear', a: 0, b: 1, count: 220 },
      // debris across the apron, clear of the fences, lots and streets
      { scatter: 'puddle', area: true, count: 220, minLat: 19, maxLat: 220, scale: [0.6, 2.2] },
      { scatter: 'chunk', mix: ['chunk', 'tire', 'scrap', 'pallet', 'chunk'], area: true, count: 240, minLat: 19, maxLat: 200, cluster: [2, 2.5] },
      { scatter: 'barrel', mix: ['barrel', 'drum', 'ibc', 'skip'], area: true, count: 70, minLat: 20, maxLat: 160, cluster: [3, 3] },
      { group: 'bleacher', at: 0.97, side: 1, off: 16 }, { group: 'tent', at: 0.985, side: -1, off: 8 }, { group: 'tower', at: 0.02, side: -1, off: 8 },
    ],
  },
};
