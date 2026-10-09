// AI brain for the rivals. Every `thinkEvery` seconds a rival:
//   1. picks a target: every other live car gets a score from TARGET weights
//      (closeness, being the player, grudges, cutting across me, low HP, being ahead);
//      it only switches when a new target clearly beats the current one;
//   2. scores each BEHAVIOUR (race, hunt, ram, pit, tail, evade, flee) and runs the
//      best one; the current behaviour gets a small `stickiness` bonus so it doesn't
//      flicker.
// A behaviour's act() writes a plan: { lat (lane to drive), speed (m/s), fire (a body
// or null), boost (bool) }. race.js turns the plan into steering / throttle / guns.
// To add a new tactic or weapon: add an entry to BEHAVIOURS with score() and act(), and
// a weight for it in each personality.
//
// Tuning lives in AI below. Scores are roughly 0..1 before weights; a personality's
// numbers multiply them. Ask for changes as e.g. "fighters: ram 1.4" or "target.player 0.8".

export const AI = {
  thinkEvery: 0.25, // seconds between decisions
  stickiness: 0.15, // bonus for keeping the behaviour already running
  switchTarget: 1.3, // a new target must score this many times the current one
  memory: 7, // seconds a grudge (being shot / rammed / cut off) lasts
  boostMeter: 0.35, // only boost with at least this much in the tank
  boostRegen: 0.03, // boost refill per second (on top of what hits give)
  straightBoost: 0.6, // racing: boost on a straight when the tank is above this

  // what makes a car a good target (higher = more attractive)
  target: {
    near: 1.0, // closeness, fading out by `range`
    range: 70, // metres
    player: 0.45, // extra pull toward the player
    grudge: 1.6, // shot or rammed me recently (scaled by how hard)
    crossed: 0.8, // cut across in front of me
    weak: 0.5, // low hull HP: finish it off
    ahead: 0.3, // in front of me (easy to shoot)
  },

  // per-personality multipliers on each behaviour's score, plus traits
  personalities: {
    fighter: {
      race: 0.6, hunt: 1.1, ram: 1.1, pit: 1.0, tail: 0.9, evade: 0.6, flee: 0.4,
      aggression: 1.0, caution: 0.4, accuracy: 1.0, boostUse: 0.7,
    },
    racer: {
      race: 1.1, hunt: 0.55, ram: 0.35, pit: 0.3, tail: 0.5, evade: 1.1, flee: 1.0,
      aggression: 0.45, caution: 1.0, accuracy: 0.7, boostUse: 1.0,
    },
  },
};

// ---------------------------------------------------------------- helpers
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// metres `o` is ahead of me along the track (negative = behind)
export const gap = (me, o) => o.prog - me.prog;

// ---------------------------------------------------------------- target choice
export function pickTarget(r, ctx) {
  const W = AI.target, now = ctx.t;
  let best = null, bestScore = 0, curScore = 0;
  for (const o of ctx.all) {
    if (o.ref === r || o.ref.armor.wrecked) continue;
    const g = gap(ctx.me, o), d = Math.hypot(g, o.lat - ctx.me.lat);
    if (d > W.range * 1.4) continue;
    const grudge = r.mem.grudge.get(o.ref), crossed = r.mem.crossed.get(o.ref);
    let s = W.near * clamp01(1 - d / W.range);
    if (o.ref === ctx.player) s += W.player;
    if (grudge && now - grudge.t < AI.memory) s += W.grudge * clamp01(grudge.amount) * (1 - (now - grudge.t) / AI.memory);
    if (crossed && now - crossed < AI.memory) s += W.crossed * (1 - (now - crossed) / AI.memory);
    s += W.weak * (1 - o.ref.armor.core);
    if (g > 3) s += W.ahead;
    if (o.ref === r.target?.ref) curScore = s;
    if (s > bestScore) { bestScore = s; best = o; }
  }
  if (r.target && !r.target.ref.armor.wrecked && curScore > 0 && bestScore < curScore * AI.switchTarget) {
    return ctx.all.find((o) => o.ref === r.target.ref) ?? best;
  }
  return best;
}

// ---------------------------------------------------------------- behaviours
// ctx: { me, all, t, player, room, line (normal racing speed), threat (body on my six or
// null), shotAt (seconds since I was last hit), target (body or null) }
export const BEHAVIOURS = {
  // run the racing line, pass slower cars, shoot whatever wanders into my sights
  race: {
    score: () => 0.5,
    act(r, ctx, plan) {
      plan.lat = r.laneT;
      plan.speed = ctx.line;
      plan.fire = ctx.inSights;
      plan.boost = ctx.straight && r.car.boost > AI.straightBoost; // spend spare boost on straights
    },
  },
  // chase the target and sit in its lane to shoot it
  hunt: {
    score: (r, ctx) => (ctx.target && gap(ctx.me, ctx.target) > 4 && gap(ctx.me, ctx.target) < 60 ? 0.75 : 0),
    act(r, ctx, plan) {
      const t = ctx.target;
      plan.lat = t.lat + Math.sin(ctx.t * 0.7 + r.slot) * 1.2; // a little offset keeps out of its wake
      plan.speed = Math.max(ctx.line * 0.9, t.v + 3);
      plan.fire = t;
      plan.boost = gap(ctx.me, t) > 25;
    },
  },
  // close in hard and hit it; much likelier if it rammed me first
  ram: {
    score(r, ctx) {
      const t = ctx.target;
      if (!t) return 0;
      const g = gap(ctx.me, t);
      if (g < -2 || g > 14) return 0;
      const g2 = r.mem.grudge.get(t.ref);
      return 0.55 + (g2 && g2.ram && ctx.t - g2.t < AI.memory ? 0.5 : 0);
    },
    act(r, ctx, plan) {
      const t = ctx.target;
      plan.lat = t.lat;
      plan.speed = t.v + 9;
      plan.boost = gap(ctx.me, t) > 3;
      plan.fire = gap(ctx.me, t) > 5 ? t : null;
    },
  },
  // PIT: alongside its rear quarter, cut into it to spin it
  pit: {
    score(r, ctx) {
      const t = ctx.target;
      if (!t) return 0;
      const g = gap(ctx.me, t), dl = Math.abs(t.lat - ctx.me.lat);
      return g > 0.5 && g < 4.5 && dl > 1.2 && dl < 4 ? 0.95 : 0;
    },
    act(r, ctx, plan) {
      const t = ctx.target;
      plan.lat = t.lat + Math.sign(t.lat - ctx.me.lat) * 1.6;
      plan.speed = t.v + 3;
    },
  },
  // someone is on MY six: brake and step aside to let them by, then sit on THEIR six
  tail: {
    score(r, ctx) {
      const th = ctx.threat;
      if (!th) return 0;
      const g = -gap(ctx.me, th);
      return g > 3 && g < 30 && r.armor.core > 0.35 ? 0.7 : 0;
    },
    act(r, ctx, plan) {
      const th = ctx.threat;
      plan.lat = th.lat + (th.lat > 0 ? -3.4 : 3.4);
      plan.speed = Math.max(8, th.v - 8);
      r.target = th; // they become my quarry once they're past
    },
  },
  // under fire or tailed: weave, keep speed, boost out of it
  evade: {
    score: (r, ctx) => (ctx.shotAt < 1.6 ? 0.8 : ctx.threat ? 0.55 : 0),
    act(r, ctx, plan) {
      plan.lat = r.laneT + Math.sin(ctx.t * 2.3 + r.slot) * 3;
      plan.speed = ctx.line;
      plan.boost = true;
      plan.fire = ctx.inSights;
    },
  },
  // hurt and hunted by someone other than my own target: run for it
  flee: {
    score(r, ctx) {
      const th = ctx.threat;
      if (!th || (ctx.target && th.ref === ctx.target.ref)) return 0;
      return (1 - r.armor.core) * 1.1;
    },
    act(r, ctx, plan) {
      plan.lat = r.laneT;
      plan.speed = ctx.line * 1.08;
      plan.boost = true;
      plan.fire = ctx.target && gap(ctx.me, ctx.target) > 6 ? ctx.target : null;
    },
  },
};

// one decision: returns the chosen behaviour's name and fills `plan`
export function think(r, ctx, plan) {
  const P = AI.personalities[r.personality];
  ctx.target = r.target = pickTarget(r, ctx);
  let bestName = 'race', bestScore = -1;
  for (const [name, b] of Object.entries(BEHAVIOURS)) {
    let s = b.score(r, ctx) * (P[name] ?? 1);
    if (name === 'hunt' || name === 'ram' || name === 'pit') s *= P.aggression;
    if (name === 'evade' || name === 'flee') s *= P.caution;
    if (name === r.behaviour) s += AI.stickiness;
    if (s > bestScore) { bestScore = s; bestName = name; }
  }
  r.behaviour = bestName;
  Object.assign(plan, { lat: r.laneT, speed: ctx.line, fire: null, boost: false });
  BEHAVIOURS[bestName].act(r, ctx, plan);
  plan.boost = plan.boost && Math.random() < P.boostUse;
  return bestName;
}
