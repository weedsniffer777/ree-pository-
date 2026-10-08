// The pursuer, as a position along the route (no model yet). The run is split into
// areas; each area starts with you alone, then the pursuer rolls back in behind you
// and closes the gap. Reach the end of the area and it falls back until the next one.
// Phases (by gap) will drive its attacks once it has a body.

const FIRST_AREA = 700;
const AREA = 1100;
const CRUISE = 41.7; // m/s, the player's cruise speed

export const PHASES = [
  { key: 'chase', min: 150 },
  { key: 'guns', min: 90 },
  { key: 'artillery', min: 45 },
  { key: 'charge', min: 12 },
  { key: 'caught', min: -Infinity },
];

export function areaOf(dist) {
  if (dist < FIRST_AREA) return { k: 0, start: 0, len: FIRST_AREA };
  const k = 1 + Math.floor((dist - FIRST_AREA) / AREA);
  return { k, start: FIRST_AREA + (k - 1) * AREA, len: AREA };
}

export class Pursuer {
  constructor() {
    this.area = 0;
    this.state = 'away';
    this.timer = Infinity; // first area: no pursuer
    this.pos = -Infinity;
    this.phase = null;
    this.enabled = true; // off while the tutorial runs
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
      this.timer = this.enabled ? Math.max(4, 8 - a.k * 0.5) : Infinity;
    }
    if (this.state === 'away') {
      this.timer -= dt;
      if (this.timer <= 0) this.summon(dist, 200, ev);
      return ev;
    }
    // a little faster than your cruise: hold speed and you just make the end of the area
    const speed = Math.min(62, CRUISE * (1.25 + 0.02 * Math.max(0, a.k - 1)));
    this.pos = Math.min(dist - 2, this.pos + speed * dt);
    const gap = dist - this.pos;
    const ph = PHASES.find((p) => gap >= p.min).key;
    if (ph !== this.phase) {
      this.phase = ph;
      ev.push(ph);
    }
    return ev;
  }

  // Bring it in now, `gap` metres behind.
  summon(dist, gap, ev = []) {
    this.enabled = true;
    this.state = 'hunting';
    this.pos = dist - gap;
    ev.push('enter');
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
