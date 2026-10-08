// Closed-loop track definitions. pts are control points in metres (x, z; the car starts at
// the first point heading toward the second); elev is sine harmonics of the lap; width is
// [lap fraction, road width scale] pairs eased around the lap; zones/features are placed
// by lap fraction. 'highway' tracks are open roads (fence, power line, signs, rails on
// curve outsides, bridges, side roads); 'yard' tracks are walled and zoned.

export const TRACKS = {
  desert: {
    name: 'Desert Highway', kind: 'highway', walls: 'rails', seed: 4242,
    pts: [
      [0, 0], [0, 300], [0, 600], [-30, 800], [-120, 930], [-260, 980], [-420, 950], [-540, 860],
      [-600, 720], [-580, 560], [-500, 440], [-380, 380], [-300, 300], [-290, 180], [-360, 60],
      [-340, -80], [-240, -150], [-120, -130], [-40, -70],
    ],
    elev: [[6, 1, 0.4], [2.8, 2, 1.7], [1.2, 5, 0.3]],
    width: [[0, 1], [0.1, 1], [0.17, 1.3], [0.27, 1], [0.6, 1], [0.68, 1.3], [0.78, 1]],
    sky: ['#6aaed6', '#aed2e6', '#f3d5b2'], fog: ['#f3d5b2', 120, 950],
    sun: [0xffdcae, 3.6], hemi: [0xe6eef4, 0xd9a06a, 1.9],
    grade: { saturation: 1.58, contrast: 1.04, lift: 0.07, toon: 0.45 },
    road: { centre: 'double', sand: true },
    ground: { a: '#d6965a', b: '#e4b07a', dark: '#b77a48', pale: '#ecc898', rock: '#a55636', gravel: '#c79a6c' },
    hills: 52, density: { bush: 1, grass: 1, sag: 1, rock: 1 },
    features: [
      { type: 'bridge', at: 0.16 }, { type: 'bridge', at: 0.63 },
      { type: 'sideroad', at: 0.08, side: 1 }, { type: 'sideroad', at: 0.4, side: -1 }, { type: 'sideroad', at: 0.82, side: 1 },
      { type: 'billboard', at: 0.05, side: 1 }, { type: 'billboard', at: 0.3, side: -1 }, { type: 'billboard', at: 0.55, side: 1 }, { type: 'billboard', at: 0.9, side: -1 },
      { type: 'tower', at: 0.46, side: 1 }, { type: 'windpump', at: 0.72, side: -1 },
    ],
  },
  salt: {
    name: 'Salt Flats', kind: 'highway', walls: 'rails', seed: 515,
    pts: [
      [0, 0], [0, 300], [0, 650], [0, 950], [-30, 1060], [-110, 1115], [-190, 1060], [-215, 950],
      [-215, 800], [-185, 700], [-245, 600], [-215, 480], [-215, 300], [-235, 150], [-190, 50], [-100, 10],
    ],
    elev: [[2.2, 1, 0.2], [1.0, 3, 1.1]],
    width: [[0, 1.25], [0.18, 1.25], [0.3, 1], [0.5, 1], [0.58, 1.35], [0.75, 1], [0.9, 1.25]],
    sky: ['#7db8dc', '#c3dceb', '#f4ece0'], fog: ['#f1eadf', 160, 1100],
    sun: [0xfff0d8, 3.8], hemi: [0xeef4f8, 0xe2d4bc, 2.1],
    grade: { saturation: 1.4, contrast: 1.04, lift: 0.07, toon: 0.4 },
    road: { centre: 'dashed', sand: true },
    ground: { a: '#e6dccb', b: '#f1ebe0', dark: '#d2c3aa', pale: '#faf6ef', rock: '#b38a6c', gravel: '#d8ccb8' },
    hills: 30, density: { bush: 0.15, grass: 0.2, sag: 0, rock: 0.3 },
    features: [
      { type: 'bridge', at: 0.37 },
      { type: 'sideroad', at: 0.12, side: -1 }, { type: 'sideroad', at: 0.55, side: 1 }, { type: 'sideroad', at: 0.88, side: -1 },
      { type: 'billboard', at: 0.2, side: 1 }, { type: 'billboard', at: 0.68, side: -1 },
      { type: 'tower', at: 0.1, side: 1 }, { type: 'windpump', at: 0.8, side: 1 },
    ],
  },
  dustbowl: {
    name: 'Dust Bowl', kind: 'highway', walls: 'rails', seed: 909,
    pts: [
      [0, 0], [0, 200], [-10, 420], [-60, 565], [-150, 635], [-245, 590], [-335, 645], [-425, 600],
      [-470, 500], [-440, 390], [-365, 320], [-275, 320], [-225, 250], [-255, 170], [-345, 120],
      [-345, 30], [-265, -45], [-150, -55], [-60, -30],
    ],
    elev: [[7, 1, 0.4], [3.2, 2, 1.7], [1.4, 5, 0.3]],
    width: [[0, 1], [0.12, 1.25], [0.25, 0.9], [0.5, 1], [0.62, 1.3], [0.8, 0.9], [0.92, 1]],
    sky: ['#6aaed6', '#aed2e6', '#f0cda6'], fog: ['#efc9a0', 110, 900],
    sun: [0xffd4a4, 3.6], hemi: [0xe6eef4, 0xd08a58, 1.9],
    grade: { saturation: 1.58, contrast: 1.05, lift: 0.07, toon: 0.45 },
    road: { centre: 'double', sand: true },
    ground: { a: '#c8794a', b: '#d99260', dark: '#a65c36', pale: '#e3a676', rock: '#9c4128', gravel: '#b8805a' },
    hills: 80, density: { bush: 0.6, grass: 0.5, sag: 0.45, rock: 1.8 },
    features: [
      { type: 'bridge', at: 0.3 },
      { type: 'sideroad', at: 0.15, side: -1 }, { type: 'sideroad', at: 0.7, side: 1 },
      { type: 'billboard', at: 0.06, side: -1 }, { type: 'billboard', at: 0.5, side: 1 },
      { type: 'windpump', at: 0.88, side: -1 }, { type: 'tower', at: 0.58, side: -1 },
    ],
  },
  yard: {
    name: 'Yard', kind: 'yard', walls: 'both', seed: 777,
    pts: [
      [0, 0], [0, 200], [0, 420], [-20, 540], [-90, 600], [-190, 610], [-270, 570], [-330, 490],
      [-330, 400], [-270, 340], [-180, 330], [-125, 270], [-135, 185], [-215, 145], [-305, 155],
      [-385, 105], [-395, 5], [-335, -65], [-235, -60], [-165, -105], [-90, -90], [-30, -50],
    ],
    elev: [[1.8, 1, 1.2], [0.9, 3, 0.2]],
    width: [[0, 1.2], [0.1, 1.2], [0.18, 1], [0.3, 0.85], [0.38, 0.9], [0.45, 1.3], [0.58, 1.55], [0.66, 1.55], [0.74, 1], [0.85, 0.85], [0.93, 1.1]],
    sky: ['#8a98a2', '#b4bcc0', '#d3cabb'], fog: ['#c4bbab', 90, 650],
    sun: [0xffe8cc, 3.1], hemi: [0xd8dfe3, 0xa89c8a, 1.8],
    grade: { saturation: 1.0, contrast: 1.1, lift: 0.06, toon: 0.35 },
    road: { centre: 'none', sand: false },
    ground: { a: '#8f8472', b: '#a09584', dark: '#6f6659', pale: '#b3a999', rock: '#7b6f60', gravel: '#857b6d' },
    hills: 10,
    zones: [
      { a: 0, b: 0.1, style: 'sheet' }, { a: 0.1, b: 0.3, style: 'trestle' }, { a: 0.3, b: 0.42, style: 'fence' },
      { a: 0.42, b: 0.56, style: 'containers' }, { a: 0.56, b: 0.7, style: 'open' }, { a: 0.7, b: 0.84, style: 'trestle' },
      { a: 0.84, b: 0.93, style: 'fence' }, { a: 0.93, b: 1, style: 'sheet' },
    ],
    features: [
      { type: 'crane', at: 0.14 }, { type: 'crane', at: 0.2 }, { type: 'crane', at: 0.26 }, { type: 'crane', at: 0.74, load: true },
      { type: 'crane', at: 0.79 },
      { type: 'sideroad', at: 0.34, side: -1 }, { type: 'sideroad', at: 0.39, side: 1 }, { type: 'sideroad', at: 0.88, side: 1 },
    ],
  },
};
