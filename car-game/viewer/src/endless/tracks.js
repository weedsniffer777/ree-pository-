// Closed-loop track definitions: control points (x, z in metres; the car starts at the
// first point heading toward the second), elevation as sine harmonics of the lap, and
// the look. The route builder turns the points into a smooth loop with a 1 m sample
// step, so a lap is always a whole number of 64 m road-texture repeats.

export const TRACKS = {
  dustbowl: {
    name: 'Dust Bowl Circuit',
    kind: 'desert',
    pts: [
      [0, 0], [0, 200], [-10, 420], [-60, 565], [-150, 635], [-245, 590], [-335, 645], [-425, 600],
      [-470, 500], [-440, 390], [-365, 320], [-275, 320], [-225, 250], [-255, 170], [-345, 120],
      [-345, 30], [-265, -45], [-150, -55], [-60, -30],
    ],
    elev: [[5.5, 1, 0.4], [2.6, 2, 1.7], [1.2, 5, 0.3]],
    sky: ['#6aaed6', '#aed2e6', '#f3d5b2'],
    fog: ['#f3d5b2', 120, 900],
    sun: [0xffdcae, 3.6], hemi: [0xe6eef4, 0xd9a06a, 1.9],
    grade: { saturation: 1.58, contrast: 1.04, lift: 0.07, toon: 0.45 },
    road: { centre: 'none', sand: true },
    ground: { a: '#d6965a', b: '#e4b07a', dark: '#b77a48', pale: '#ecc898', rock: '#a55636', gravel: '#c79a6c' },
    hills: 46,
  },
  terminal: {
    name: 'Terminal Yard',
    kind: 'yard',
    pts: [
      [0, 0], [0, 150], [0, 300], [-30, 385], [-110, 410], [-190, 385], [-255, 335], [-335, 325],
      [-400, 270], [-420, 185], [-375, 100], [-300, 65], [-285, -20],
      [-310, -110], [-245, -175], [-140, -185], [-60, -145], [-10, -70],
    ],
    elev: [[1.6, 1, 1.2], [0.8, 3, 0.2]],
    sky: ['#7c8d99', '#a9b4b9', '#cdc3b4'],
    fog: ['#bdb4a6', 90, 620],
    sun: [0xffe6c8, 3.0], hemi: [0xd5dde2, 0xa39888, 1.7],
    grade: { saturation: 0.95, contrast: 1.1, lift: 0.06, toon: 0.35 },
    road: { centre: 'none', sand: false },
    ground: { a: '#8a7f70', b: '#9b9080', dark: '#6d6458', pale: '#aea496', rock: '#7b6f60', gravel: '#80766a' },
    hills: 14,
  },
};
