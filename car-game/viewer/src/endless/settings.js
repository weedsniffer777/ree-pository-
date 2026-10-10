// Player settings, saved in this browser: key bindings, fire mode, free-look sensitivity,
// volume (for when there's sound). Phones default to auto fire, keyboards to manual.

export const ACTIONS = [
  ['throttle', 'Throttle', ['KeyW', 'ArrowUp']],
  ['brake', 'Brake / drift / reverse', ['KeyS', 'ArrowDown']],
  ['left', 'Steer left', ['KeyA', 'ArrowLeft']],
  ['right', 'Steer right', ['KeyD', 'ArrowRight']],
  ['boost', 'Boost', ['ShiftLeft', 'ShiftRight']],
  ['fire', 'Fire', ['Space']],
  ['look', 'Free look (hold, or right mouse)', ['KeyC']],
  ['back', 'Look back (hold)', ['KeyX']],
];

const KEY = 'endless.settings';
const touchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function defaults() {
  return {
    keys: Object.fromEntries(ACTIONS.map(([a, , codes]) => [a, [...codes]])),
    fire: touchDevice ? 'auto' : 'manual', // auto: the guns fire whenever something is locked
    sens: 1.6, // free-look mouse sensitivity
    volume: 0.8,
    quality: 'high', // graphics preset: 'max' | 'high'
  };
}

function load() {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...d, ...s, keys: { ...d.keys, ...(s.keys || {}) } };
  } catch { return d; }
}

export const settings = load();

// Graphics presets, applied once at load (changing one restarts the race). Max is the
// full look; High trades a little sharpness and some effects for speed.
const PRESETS = {
  max: { pixelRatio: 1.75, shadowSize: [3072, 4096], shadowHalf: [95, 130], softShadows: true, smallShadows: true, reflectAll: true, simpleScenery: false, smoke: 1, standIn: 30 },
  high: { pixelRatio: 1.25, shadowSize: [2048, 2048], shadowHalf: [75, 100], softShadows: false, smallShadows: false, reflectAll: false, simpleScenery: true, smoke: 0.6, standIn: 20 },
};
let qOverride = null;
try { qOverride = new URLSearchParams(location.search).get('q'); } catch { /* ignore */ } // ?q=max|high (screenshots)
export const Q = PRESETS[qOverride ?? settings.quality] ?? PRESETS.high;

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export function resetKeys() {
  settings.keys = defaults().keys;
  saveSettings();
}

// is the action's key down, in a set of held key codes
export const held = (keys, action) => settings.keys[action].some((c) => keys.has(c));

// "KeyW" -> "W", "ArrowUp" -> "↑", "ShiftLeft" -> "L Shift"
export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace' };
  return map[code] ?? code;
}
