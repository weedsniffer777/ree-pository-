# Car Game: Build Brief (DRAFT v0.2)

Working title: TBD. Status: planning only, no code yet.
Audience: the Claude session that will build the game. Nothing here is final unless marked agreed.

## 1. Goal

Ship a CrazyGames game that scores 11+/15 on desktop basic launch (9-10 goes to manual review, <9 is rejected).
Score = average playtime + D1 retention + gameplay conversion, 1-5 each. Reference points from our own games:
Shoot Them Off 4/5/5 (accepted range), Stickman Legion 4/3/3 (rejected), Flume 1/2/4 (failed).
Conversion has been fine; **playtime (10+ min) and D1 retention (6%+) are the levers**, so every design choice serves those two.
The first build must be a complete, extensible loop, not a demo.

## 2. Constraint from CG experience

No persistent red decals, puddles or blood-coloured particles (a red splat puddle got Stickman Legion flagged). Enemies pop apart and leave nothing behind.

## 3. Level 1 (draft, the core loop to build first)

- Player starts in the starter car on a desert highway, bordered so the player stays on the road.
- Tutorial is minimal: WASD to move, mouse moves camera, hold mouse to fire the roof machine gun. Nothing else at first.
- Roadblock ahead with enemies; some have guns and shoot back.
- Shift gives nitro. Player blows the roadblock apart, then wipes out a horde beyond it; enemies fly everywhere.
- End: an ugly rival vehicle (e.g. a pickup with a mounted machine gun and goons) charges the player. Destroy it to win.
- Lobby: a new-part popup appears immediately, teaches equip, then tells the player to buy another part.

### First 30 seconds (agreed)
- Starter car, no builder UI. Driving and hitting a crowd within about 15 seconds.
- Move and fire only. Boost, builder and endless unlock gradually.
- No wall of text. Popups are one-shot and never block input during combat.

## 4. Systems that must exist and be extensible (agreed)

- Part/chassis/enemy/level/boss definitions loaded from data; add content without touching engine code.
- Hardpoint attachment system: chassis exposes slots, parts declare slot types. The starter car's roof gun and front plow are real attachments from day one, not baked in.
- Arcade car physics (not realistic wheel colliders; they are a bug source). Pooled pop-apart system.
- Save system (progress, parts, upgrades, currency, settings).
- Run system: spawner with level scripting, upgrade picker, pickups, combo counter.
- Off-screen threat indicators (low camera hides distant threats).
- CrazyGames SDK integration. Check current SDK docs; do not guess method names.

## 5. Performance and QA (agreed, hard requirements before submitting)

Shoot Them Off lost a launch day to a memory leak that crashed it at 5-10 minutes.
- Cap and pool on-screen enemies and particles; no per-frame allocations in hot paths.
- Debug overlay (FPS, heap, entity counts), toggleable.
- **20-minute soak test** on a low-end device with flat heap and stable FPS. No submission until it passes.
- Crash/error telemetry.

## 6. Launch plan (agreed)

- Launch early in the week so the first 500 players hit a working build and there is a week to patch. The 500-player cap fills in about a day; basic launch is 7 days; sub-decision about 3 days.
- Log launch weekday, daily score and every change pushed.
- Target 11+. Do not rely on manual review.

## 7. Kill / iterate rules (agreed)

After 48-72h of CG data: strong, double down; within one score point, iterate; far off, stop and move on.

## 8. Development order (draft, being discussed)

1. Decide the player cars, first enemy, guns and guy models.
2. Build a model viewer (reuse the existing one if possible), then make each model one by one: car, enemies, guns.
3. Environment, then one playable, repeatable Level 1.
4. Content expansion after Level 1 plays well.
