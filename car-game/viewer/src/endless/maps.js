// Map registry. The dev kit switches maps by storing the id and reloading, so every
// module can read the current map once at import time.

export const MAPS = [
  { id: 'highway', name: 'Desert Highway', group: 'Highway', at: 0 },
  { id: 'salt', name: 'Salt Flats', group: 'Highway', at: 2600 },
  { id: 'canyon', name: 'Red Canyon', group: 'Highway', at: 5000 },
  { id: 'dustbowl', name: 'Dust Bowl Circuit', group: 'Track', track: true },
  { id: 'terminal', name: 'Terminal Yard', group: 'Track', track: true },
];

const KEY = 'endless.map';

export function currentMap() {
  let id = null;
  try { id = new URLSearchParams(location.search).get('map') || localStorage.getItem(KEY); } catch { /* ignore */ }
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function switchMap(id) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  const u = new URL(location.href);
  u.searchParams.delete('map');
  u.searchParams.delete('at');
  location.href = u.toString();
}
