// The war machine, as a position along the route (no model yet). The run is split into
// areas; each area starts with you alone, then the war machine rolls back in behind you
// and closes the gap. Reach the end of the area and it falls back until the next one.
// Phases (by gap) drive the warnings now and the attacks later.

const FIRST_AREA = 700;
const AREA = 1100;
const CRUISE = 41.7; // m/s, the player's cruise speed

export const PHASES = [
  { key: 'chase', min: 150, label: 'War machine behind you' },
  { key: 'guns', min: 90, label: 'In gun range' },
  { key: 'artillery', min: 45, label: 'Shells incoming' },
  { key: 'charge', min: 12, label: 'Ramming distance' },
  { key: 'caught', min: -Infinity, label: 'It is on you' },
];

export function areaOf(dist) {
  if (dist < FIRST_AREA) return { k: 0, start: 0, len: FIRST_AREA };
  const k = 1 + Math.floor((dist - FIRST_AREA) / AREA);
  return { k, start: FIRST_AREA + (k - 1) * AREA, len: AREA };
}

export class Predator {
  constructor() {
    this.area = 0;
    this.state = 'away';
    this.timer = Infinity; // first area is the tutorial: no war machine
    this.pos = -Infinity;
    this.phase = null;
  }

  get active() { return this.state === 'hunting'; }

  // Returns a list of events: 'enter', 'escape', 'area', and phase keys on change.
  update(dt, dist) {
    const ev = [];
    const a = areaOf(dist);
    if (a.k !== this.area) {
      ev.push(this.active ? 'escape' : 'area');
      this.area = a.k;
      this.state = 'away';
      this.phase = null;
      this.timer = Math.max(4, 8 - a.k * 0.5);
    }
    if (this.state === 'away') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'hunting';
        this.pos = dist - 200;
        ev.push('enter');
      }
      return ev;
    }
    // a little faster than your cruise: hold speed and you just make the flag
    const speed = Math.min(62, CRUISE * (1.25 + 0.02 * (a.k - 1)));
    this.pos = Math.min(dist - 2, this.pos + speed * dt);
    const gap = dist - this.pos;
    const ph = PHASES.find((p) => gap >= p.min).key;
    if (ph !== this.phase) {
      this.phase = ph;
      ev.push(ph);
    }
    return ev;
  }

  // Kills and big hits shove it back (used once enemies exist).
  pushBack(m) {
    if (this.active) this.pos -= m;
  }

  gap(dist) {
    return this.active ? dist - this.pos : Infinity;
  }
}
