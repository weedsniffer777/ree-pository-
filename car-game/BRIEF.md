# Car Game: Build Brief (DRAFT v0.1, tune before building)

Working title: TBD (placeholder: "Wasteland Rammers"). Status: planning only, no code yet.
Audience for this file: the Claude session that will build the game. Read all of it first.

## 1. Goal

Ship a CrazyGames game that scores 11+/15 on desktop basic launch (9-10 goes to manual review, <9 is rejected).
Score = average playtime + D1 retention + gameplay conversion, 1-5 each. Reference points from our own games:
Shoot Them Off 4/5/5 (accepted range), Stickman Legion 4/3/3 (rejected), Flume 1/2/4 (failed).
Conversion has been fine; **playtime (10+ min) and D1 retention (6%+) are the levers**, so every design choice below serves those two.

Build time budget: 8-12 days total. The first milestone (section 4) must be a complete, extensible loop, not a demo.

## 2. Locked decisions

- **Genre:** vehicle-builder combat ("Crossout-lite"). Build a spiky armored car from parts, drive into arenas, plow through crowds, fight rival vehicles and bosses.
- **Single player only.** No multiplayer, no netcode. AI opponents.
- **3D, low-poly, procedural.** Claude generates models in code (primitives, wedges, extrusions). No AI-generated images. Our existing ~100 weapon models can be mounted as turrets/hardpoints.
- **Camera:** close third-person chase behind and slightly above the car, about 20-30 degrees pitch. Not top-down. Speed sells it: FOV widens on boost, small shake on impact, slight follow lag. The garage uses an orbit camera so players can see their build.
- **Theme:** stylized Mad Max desert. Pale cream sand, teal/pink gradient sky, sunset/dusk lighting. Silly exaggerated vehicles (giant spikes, rams, flamethrowers). Not brown and gritty.
- **Contrast rule:** environment is lower saturation than enemies. Ground stays light. Never orange-on-orange.
- **Enemies:** red/orange goons, plus rival vehicles as bosses. Crowds are the fodder.
- **No gore, ever.** Enemies pop apart: their cosmetics (hats, helmets) fly off, short dust/smoke poof, then nothing remains. **No puddles, no persistent red decals, no blood-coloured particles.** (A red splat puddle got Stickman Legion flagged on CG.) The satisfaction comes from hit-stop, flying cosmetics, a combo counter and crowd physics.
- **Controls:** keyboard (WASD/arrows) plus mobile (drag to steer, auto-throttle, tap for boost/drift). Mobile controls ship in the first build.
- **Structure:** level-based campaign with first-clear rewards, plus an endless mode that unlocks at level 3. Same structure as Tank Fighter, which playtesters rated highest.

## 3. Core loop

1. Pick a level from the map (reward previews shown, like Tank Fighter).
2. Run (about 2 min): drive and ram through goon crowds, weapons auto-fire, pick up scraps, 2-3 pick-one upgrade cards mid-run, finish with a boss or rival vehicle.
3. Earn scraps and first-clear rewards (new part or chassis).
4. Garage: equip parts on the chassis, upgrade parts (common to rare to legendary) with scraps.
5. Next level. A new part or chassis arrives about every level, so there is always a visible carrot.

Return hooks: daily reward, per-level reward previews, unlock cadence, endless-mode best score, offline-free (no idle accrual in v1).

## 4. Milestone A: "complete loop" content (target: first 3-4 days)

Everything below is **data-driven** (definitions in JSON or equivalent) so adding content later is adding data, not code.

| Area | Milestone A target |
|---|---|
| Chassis | 3 (starter buggy, truck, armored van), each with different hardpoint layout |
| Weapons | 6-8, picked from the existing models (e.g. machine gun, shotgun, flamethrower, rocket, mine layer, saw) |
| Other parts | 4-6 (spike ram, armor plating, nitro boost, tires, plus 1-2 passives) |
| Part upgrades | rarity tiers common to rare to legendary, paid with scraps; 1-2 legendary variants |
| Crowd enemies | 4 types (runner, helmet, shield, thrower/bomber) |
| Vehicle enemies | 2 types (raider buggy, heavy truck) |
| Bosses | 2-3, one at end of level 1, then bigger ones; some return as normal enemies later |
| Levels | 5, first-clear rewards on each, hard mode on 1-2 |
| Biomes | 2 desert variants first (dunes, canyon) |
| Endless mode | unlocks at level 3, tracks best score |
| Meta | garage/builder, upgrades, level map, daily reward, scrap currency |
| Tutorial | staged popups (see below), skippable, one-shot |

### First 30 seconds (critical)
- Starter car, no builder UI. Player is driving and hitting a crowd within about 15 seconds.
- Move and auto-fire only. Boost unlocks during level 1, builder after the first run, endless at level 3.
- No wall of text. Popups are one-shot and must never block input during combat.

### Milestone B (days 5-8): expand
5 more levels, 2-3 more biomes (salt flats, oasis, ruined highway), more chassis/weapons/bosses, second hard-mode tier. Same data schema, only new data.

## 5. Systems that must exist and be extensible

- Part/chassis/enemy/level/boss definitions loaded from data; add content without touching engine code.
- Hardpoint attachment system (chassis exposes slots, parts declare slot types).
- Arcade car physics (**not** realistic wheel colliders; they are a bug source). Pooled ragdoll/pop-apart system.
- Save system (progress, parts, upgrades, currency, settings).
- Run system: spawner with wave/level scripting, upgrade-card picker, scrap pickups, combo counter.
- Off-screen threat arrows and a small radar ring (low camera hides distant threats).
- CrazyGames SDK integration (gameplay start/stop events, ads hooks at natural breaks only). Check current SDK docs; do not guess method names.

## 6. Performance and QA (hard requirements before submitting)

Shoot Them Off lost a full launch day to a memory leak that crashed it at 5-10 minutes.
- Cap and pool on-screen enemies and particles; no per-frame allocations in hot paths.
- Debug overlay (FPS, heap, entity counts), toggleable.
- **20-minute soak test** on a low-end device with a flat heap and stable FPS. No submission until this passes.
- Error reporting/telemetry for crashes.
- Arenas: squarish, open, low props only (never tall objects that block the chase camera); fade or pull in the camera if blocked. Distance fog to hide draw distance. No dense grass.

## 7. Visual targets

- Per-level biome swaps, palette stays inside the contrast rule.
- Smashable low props (fences, crates, cones, barrels, hay bales), ramps and berms for air time.
- Thumbnail concept: bright close-up of the armored car mid-impact, goons and cosmetics flying, teal/pink sky, one clear subject. Make 3-4 variants.

## 8. Launch plan

- Launch early in the week (Monday-ish) so the first 500 players hit a working build and there is a week to patch. The 500-player cap fills in about a day; basic launch is 7 days; sub-decision about 3 days.
- Log launch weekday, daily score and every change pushed, to test the weekday hypothesis.
- Target 11+. Do not rely on manual review.

## 9. Kill / iterate rules (set in advance)

- After 48-72h of CG data: strong, so double down; within one score point, so iterate (usually retention hooks or playtime); far off, so stop and move on. No polishing a failing game.

## 10. Open questions (tune these before building)

1. Tech stack: engine and framework (Unity WebGL vs a web 3D library)? Affects asset, physics and perf choices.
2. Title and thumbnail direction.
3. Which 6-8 weapons from the existing set, and how they look mounted.
4. Exact level count and whether hard mode is in Milestone A.
5. Is a daily reward enough as the return hook for v1, or do we add something stronger?
6. Part rarity tiers: 3 tiers (common/rare/legendary) like Tank Fighter, or fewer for v1?
