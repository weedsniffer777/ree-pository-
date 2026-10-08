// Map registry. The dev kit switches maps by storing the id and reloading, so every
// module can read the current map once at import time.

export const MAPS = [
  { id: 'desert', name: 'Desert Highway', track: true },
  { id: 'salt', name: 'Salt Flats', track: true },
  { id: 'dustbowl', name: 'Dust Bowl', track: true },
  { id: 'yard', name: 'Yard', track: true },
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
