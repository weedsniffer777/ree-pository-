# Starter Car: Design Spec (v1, locked for modeling)

Audience: the session that models it. Build it in the model viewer, one piece at a time. No gameplay code yet.

## Concept

A 2-door 70s muscle coupe turned wasteland war machine. "Inspired by", never a replica: **no brand badges, logos or readable plates**.
Think: bare metal and rust, caution tape, a cage, spikes. Chunky, saturated, low-poly, a little toy-like and silly (cartoon proportions, not realism).

## Camera reality

The chase camera sees the car from **behind and above** (about 20-30 degrees pitch). The rear and roof carry the design. Check every decision from that angle.

## Proportions (relative units, tunable)

- Body: length 4.4, width 2.1, height about 1.45 (muscle fastback: long hood, short cabin, sloped rear).
- Wheels: oversize and chunky, radius about 0.46, width about 0.4, wide track, big flared arches.
- Exaggerate: the car should read as a toy-like brute, not a scale model.

## Parts that must be visible (in priority order)

1. **Roll cage over the cabin** (tube frame) with a **roof rack platform**: 4 round spotlights on the front edge, and a gun socket at roof centre-rear.
2. **Rear:** big spoiler, 1-2 tall flag poles with small cloth flags (animate a flutter later), twin exhausts, jerry cans, spare tire on the rack or deck, taillights.
3. **Hub spikes** on all four wheels (they spin).
4. **Front plow:** angled plate with yellow-black caution stripes, spike row along the bottom edge, optional draped chains. This is an **attachment** (see sockets), not baked in.
5. **Hood:** exposed supercharged engine blower poking through, plus riveted rust-coloured armor plates on the hood.
6. **Welded mesh/louvre slats** over the windshield and side windows (strong silhouette stripes).
7. **Side:** armor plates on the doors with slit windows, side-exit exhaust pipes, small yellow smiley on the roof hatch (silly tone). A small painted number on a door is optional.

## Material palette (flat colours, no image textures, no AI images)

| Material | Colour guide | Notes |
|---|---|---|
| Base body | cool gunmetal / bare steel (about #8A95A3) | Main body is cool, so the car reads against warm sand and red enemies |
| Dark steel | about #4B5563 | cage, plates, trim |
| Rust | about #B5532A | **patches only, at most about 30% of the body**, via vertex colours or gradient noise |
| Caution | yellow about #F2C21B and black about #1C1C22 | plow, bumper edges, arches |
| Tires | near black | |
| Glass / mesh | dark with a slight cool tint | |

**Contrast rule:** do not make the whole car rust-orange. Orange car on orange sand and red-orange enemies would vanish. Cool metal base plus warm accents.

## Technical rules

- Procedural from primitives, wedges and extrusions. Flat-shaded, saturated look, with a slight bevel on key edges.
- Budget: about 3-4K triangles for the whole car. Merge by material.
- Origin at the centre of the ground footprint, +Z forward, +Y up, units in metres.
- Separate nodes: 4 wheels (front two have a steering pivot, all spin), body, cage, and each attachment.

### Sockets (named empties, visible as gizmos in the viewer)
`ROOF_MAIN` (gun), `ROOF_RACK_L`, `ROOF_RACK_R`, `FRONT` (plow), `HOOD`, `SIDE_L`, `SIDE_R`, `REAR`, `HUB_FL/FR/RL/RR`, `EXHAUST_L`, `EXHAUST_R` (nitro flame points).

## Acceptance check in the model viewer

- A rear three-quarter view from the chase-camera distance clearly shows cage, gun mount, spoiler, flags and spikes.
- A side view reads as a muscle coupe, not a box.
- Sockets show up as gizmos; wheels spin and steer on a toggle.
- Triangle count shown in the viewer.
- Looks good against a pale sand and a grey asphalt background, with a red-orange goon placed nearby for contrast.

## Style target

Cartoon low-poly, warm saturated lighting and chunky shapes (the low-poly rally reference). The same look is the later map target.
