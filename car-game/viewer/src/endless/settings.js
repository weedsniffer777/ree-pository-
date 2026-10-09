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
