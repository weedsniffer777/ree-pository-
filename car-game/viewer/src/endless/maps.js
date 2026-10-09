// Maps and levels. A map is a track (layout, look, decor); a level is what you pick to
// play: a numbered map with its own setup. Desert Highway is level 1, and the first time
// it's ever played it's the tutorial. The dev kit switches levels by storing the choice
// and reloading, so every module can read the current map once at import time.

export const MAPS = [
  { id: 'desert', name: 'Desert Highway', track: true },
  { id: 'salt', name: 'Salt Flats', track: true },
  { id: 'dustbowl', name: 'Dust Bowl', track: true },
  { id: 'yard', name: 'Yard', track: true },
];

export const LEVELS = [
  { n: 1, map: 'desert', name: 'Desert Highway', tutorial: true },
  { n: 2, map: 'salt', name: 'Salt Flats' },
  { n: 3, map: 'dustbowl', name: 'Dust Bowl' },
  { n: 4, map: 'yard', name: 'The Yard' },
];

const KEY = 'endless.level';

export function currentLevel() {
  let n = null;
  try { n = Number(new URLSearchParams(location.search).get('level') || localStorage.getItem(KEY)); } catch { /* ignore */ }
  return LEVELS.find((l) => l.n === n) ?? LEVELS[0];
}

// ?map= still loads a bare map (screenshots, tests); otherwise the current level's map
export function currentMap() {
  let id = null;
  try { id = new URLSearchParams(location.search).get('map'); } catch { /* ignore */ }
  return MAPS.find((m) => m.id === (id ?? currentLevel().map)) ?? MAPS[0];
}

export function switchLevel(n) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* ignore */ }
  const u = new URL(location.href);
  for (const k of ['map', 'level', 'at']) u.searchParams.delete(k);
  location.href = u.toString();
}
