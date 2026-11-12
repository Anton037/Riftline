# 4.2 — distinct combat identities and painted material detail

The Ash Tyrant was still assigned the Warden's red/blue siren slugs. Tracing the actual attacks exposed
other inherited presentation: Queen-style hatching for volcanic summons, Prism-style teleport bursts for
the Glasswyrm and Leaper, a missing Glasswyrm shot voice, generic elemental impacts, City trap hardware in
the Caldera, and a raid-whistle ambience entry. The Tyrant model also retained a gun, chain and coin-like
ornaments from its predecessor. Bosses shared a magenta enrage tint, and older biome shaders painted
moving luminous noise over otherwise finished materials.

## Applied improvement prompt

> Make every supported weapon and actor identifiable through its actual attack silhouette, material,
> motion and sound. Give the Arc Caster branching lightning and the Ember Jet flowing fire. Carry source
> identity through shots, zones, beams, summons, impacts and motion. Use the painted terrain as the quality
> reference: grounded physical materials, readable surface detail and restrained light. Replace inherited
> theme props and obsolete names. Preserve damage, collision, timing, progression and seeded layouts, and
> keep the mobile renderer and audio allocator bounded. Verify real attack frames and saved progress.

## What changed

| Weapon | Flight and release treatment |
| --- | --- |
| Pulse Blaster | Compact blue bolt with a bright core and short sheath |
| Scattergun | Separate warm pellet tracers and a broader combustion release |
| Arc Caster | Moving, branching lightning; terminal discharge and a crackling electrical voice |
| Railgun | Narrow clipped lance and fast slug streak, starting at the physical barrel |
| Rocket Pod | Painted missile casing, animated exhaust and expanding smoke |
| Disc Launcher | Machined toothed blade, spinning highlights and a return trail |
| Ember Jet | Crossed turbulent flame ribbons, growing and fading along the existing shot motion |

Arcs have their own instance buffer, separate from enemy warnings. At the simulation's 420-shot cap they
use shorter branches while retaining every projectile. Rocket/disc pools cover that same cap. Rendering
no longer advances a live disc's simulation fields. Player shots draw at barrel height, and hostile shots
descend visually from their owner's launch height toward the shared combat plane.

| Boss | Projectile and matching attack character |
| --- | --- |
| Warden | Red/blue siren slugs, security hardware and mechanical reports |
| Hive Queen | Painted thorned spores, mint brood bursts and wet organic transients |
| Frost Prism | Physical ice crystals, frost lances, ice movement and cracking impacts |
| Rift Core | Violet ring shots, rift ribbons, resonant phase changes and rift bombardments |
| Ash Tyrant | Basalt cinders, molten fractures, magma lobs, ember summons and volcanic impacts |
| Glasswyrm | Warm glass slivers, fused-glass eruption zones, sand emergence and solar lances |

All bosses retain their own primary/accent palette when enraged. The Tyrant is rebuilt as a living basalt
colossus with chipped strata, overlapping chest plates, rock spines, volcanic feet and molten fissures. Its old gun,
jewelry, coin ring and manufactured chimneys are gone.

The Warden now has layered steel armor, exposed running gear, braced twin cannons and small siren lenses;
its broad luminous panels and floor hoop are removed. The Queen gains overlapping chitin, articulated
legs, clustered eyes, mandibles and small living glowcaps without a floating halo. The Glasswyrm's cool
fused-glass shell contains its warm core, and irregular shards replace its mechanical base rings.
The Core's central sphere gains shaded depth and slow moving energy filaments. Boss halos are quieter
so the material finish remains visible. The Frost Prism retains its sculpted ice and translucency.

All 25 enemy identities are covered. Ranged actors explicitly select bolts, sniper tracers, heavy turret
rounds, drone needles, organic carrier pods or open rift shards. Physical leaps throw dust; blinks retain
their actor/variant color. Mortar frost, healer colors, material-specific death bursts and projectile
dissipation preserve their source. Explicit zone/beam sources override ambient AI context.

Painted characters, weapons and props reuse their existing atlas for shallow normal relief. Biome
weathering now adds restrained snow, wetness, ash, dust or reflected light. Animated contour loops and
indiscriminate siren/vein coatings are removed. Hit flashes brighten the underlying finish. Actual variant
and status cues remain visible. Flame beams also use flowing ribbons, with their original warning width.

The Caldera gains a natural magma spout and embedded ember mines; Flats mines use fused glass. They retain
the replaced traps' damage, dimensions and timing. Caldera ambience uses fumarole air and rock movement.
Weapon, hostile-shot, elemental-impact, beam-warning, summon and movement voices have matching recipes;
the same 19-recording bank is reused. The audio buffer key includes filters and excitation, and procedural
weather remains independent of whether a recording bank has loaded. Audio logging now uses the existing
hook instead of importing the application and UI.

## Name cleanup and compatibility

Active biome IDs are `city`, `shelf`, `marsh`, `core`, `caldera` and `flats`. The Caldera boss, event and
variant use `tyrant`, `ashfall` and `flareheart`. Obsolete theme names, constants, tool arguments and
descriptions are updated in active code.

The retired Crucible is deleted, including its definition, model, AI, Overdrive, projectiles, reward,
particles, UI icon and audio entries. The entire Codex and its discovery tracking are removed. Unused stamping-press and flame-turret
hardware, generic foundry vent shaders/models and an obsolete wave-to-boss table are also deleted.
Old duplicate equipment definitions no longer live in the content catalog. Superseded roadmap and
strategy proposals are removed; versioned review evidence remains available for comparisons.

Old spellings are confined to [the compatibility boundary](../src/data/content-ids.js), migration tests
and historical evidence. Save loading translates kills, medals, milestones, death recaps
and records into current IDs. New saves write only current IDs. Removed boss records merge into the
current Flats boss; the removed dash reward becomes two levels of Shock Dash. Purchased duplicate
weapons/modules receive their existing conversion/refund, with only IDs, costs and conversion ratios
kept in [save compatibility metadata](../src/core/save-compat.js). No retired display names or mechanics
remain. Conversion is idempotent. Repeated Endless defeats remain repeated events. Seed compatibility
preserves the original map-director and Ashfall-event streams.

Repeated startup and `visualViewport` notifications no longer force WebGL to reset an unchanged drawing
buffer. CI exposed that race during the settings flow. The browser regression now dispatches repeated
notifications and checks that genuine viewport changes still update the drawing buffer.

## Main game focus

Daily/Weekly challenges, pacts and boss training are deleted: source modules, UI controls/screens,
styles, scheduling, modifiers, payouts and mode-specific tests. The Home menu now has Workshop,
Achievements, News and Settings. Achievements appear before run records; weapon selection and the
Start/Continue controls remain central. Standard runs, Endless continuation, difficulty, upgrades,
workshop purchases, achievements, onboarding, accessibility/settings and save recovery remain.

Existing optional-mode checkpoints become ordinary runs with their earned upgrades and progress.
Obsolete discovery/mode fields are discarded, while tutorial completion, one-time gameplay hints and
release notices remain. No further discovery autosaves occur during combat. Content lookup tables
are assembled once after their definitions.

## What was checked

- `npm run check`: formatting, lint, build and **63/63 tests** in 57.2 seconds (75-second test deadline).
- Actual AI: **75 normal, middle-phase and enraged attack cases**, **2,318 source-checked projectiles**,
  all 25 enemy roles and every ranged shot voice. Registry contracts reject orphan bosses and trap skins.
- Geometry: **252 transformed map layouts** across every biome/director mode, plus **45 pre-update map,
  route and event fixtures**. Exterior volcanoes/props must stay outside walkable space; map surfaces and
  complete collision-aligned models remain covered. **1,344 player pose/aim combinations** check gun attachment.
- Real drawing: **63 tablet + 28 phone combat frames**, covering every unique boss pattern and Overdrive,
  every boss close-up, all seven weapons, six beam families and natural trap warning/fire states.
  **48 biome scenes**, **12 final model portraits**, **20 equipment/turn/settings frames**, and **six menu views**
  passed without browser/shader errors. Both painted atlases load; High detail and shadows stay enabled.
- Source-aware material impacts, explicit zone/beam sources, retained warning dimensions, 420-shot arc
  capacity and rendering without simulation mutation are regression checked. Every Arc Caster shot fits
  its separate segment buffer at the simulation cap.
- Save conversion preserves purchased value, current records, repeated boss defeats and a resumable run.
  Refunds are idempotent; old optional-mode and discovery fields disappear. Touch flows verify workshop
  purchases, one-time achievement claims, reload, offline continuation, tutorial/audio and worker updates.
- Full audio health: **439 sound cases, 18 music renders and 36 voice-budget scenarios** passed in 340.9 seconds.
  The live fault-recovery probe passed. All six biome mixes pass finite-signal, clipping/tail, stereo,
  flood/scheduling and continuous-fire checks. The real-engine comparison reel is linked below.
- Dependency review: all installed direct dependencies are current and `npm audit` reports **zero vulnerabilities**.
  The required patched overrides remain. No new dependency, texture atlas or recording download is added.
  Optional checks remain bounded and manual; the normal test deadline is unchanged.

Shared warning outlines, hostile health bars and status symbols keep their established gameplay meaning.
Presentation changes preserve main-run damage, collision, attack timing and progression. Removed modes
convert to the standard run rules described above. Browser captures use
emulation/software rendering; they do not establish sustained physical-device FPS, heat or speaker balance.
Signal checks verify audio correctness; subjective listening is supported by the comparison reel below.

## Rendered and audio evidence

- [Before/after: Arc Caster, Ember Jet and Tyrant](review-4.2/before-after.jpg)
- [Seven weapon treatments](review-4.2/weapons.jpg) · [All six boss close-ups](review-4.2/bosses.jpg)
- Attack frames: [Warden](review-4.2/attacks-warden.jpg), [Queen](review-4.2/attacks-queen.jpg),
  [Prism](review-4.2/attacks-prism.jpg), [Core](review-4.2/attacks-core.jpg),
  [Tyrant](review-4.2/attacks-tyrant.jpg), [Glasswyrm](review-4.2/attacks-wyrm.jpg)
- [All biomes](review-4.2/biomes.jpg) · [Phone boss views](review-4.2/phone.jpg) ·
  [Player and enemy materials](review-4.2/characters.jpg) · [Focused menus](review-4.2/menus.jpg)
- [Combat audio reel](review-4.2/combat-audio.mp3): two 4.1.1 references, then seven current weapons,
  six boss releases and six material/element impacts. [Exact timeline and signal measurements](review-4.2/audio-timeline.json).
- [Verification summary and resource measurements](review-4.2/verification.json) ·
  [Combat frame metrics](review-4.2/combat-metrics.json) · [Biome frame metrics](review-4.2/biome-metrics.csv)

Frames come from the real game renderer. Comparison plates resize and label screenshots without retouching.
The previous build is the merged 4.1.1 source; current captures exercise 4.2 attacks at fixed simulation times.

[Testing commands](TESTING.md) · [Previous checkup](CHECKUP-4.1.1.md) · [Recording credits](../public/audio/SOURCES.md)
