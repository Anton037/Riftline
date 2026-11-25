# Testing Riftline

The routine gate runs focused Node contracts and sequential browser checks.

| Command | Coverage | Deadline |
|---|---|---|
| `npm run check` | Formatting, lint, build and standard tests | Test subprocess 240 s |
| `npm test` | Node contracts, desktop & tablet/phone flows, onboarding, progression and worker update | Build 30 s; tests 240 s |
| `npm run test:unit` | Saves, deterministic simulation, data and render geometry | 60 s |
| `npm run e2e` | Desktop KB/mouse, touch, onboarding/audio, progression and worker update | Game flows 25–35 s; worker 20 s; process 180 s |
| `npm run test:render` | Same browser checks with actual drawing | Game flows 180 s each; process 600 s |
| `npm run audit:visual` | Six biomes and bosses on tablet and landscape phone, High | 240 s per layout |
| `node tools/verify.js equipment <tag>` | Seven weapons, all 25 enemies, smoke/rockets and FPS controls | 240 s |
| `npm run verify:combat` | Every current boss pattern/Overdrive, seven weapons and biome beam/trap skins | 300 s |
| `npm run verify:abilities` | Power phases across all biomes, shield, portals and nine Snow Ridge views on tablet/phone | 300 s per layout |
| `npm run verify:audio` | Optional synthesized sound, mix and voice checks | 420 s |
| `npm run verify:audio-budget` | Optional audio scheduler/real-node parity | 180 s |
| `npm run probe:audio` | Audio fault recovery | 120 s |
| `npm run probe:mix` / `probe:music` / `probe:place` | Optional sound measurements | 300 / 420 / 180 s |

The map geometry suite is part of the normal gate. `node --test tests/map-geometry.test.mjs` runs its
252-layout scene audit on its own. It checks transformed triangle faces, collision footprints, exterior
bounds, animation samples and GPU reed wind extrema. Conservative bounds include maximum wind
sway, and crossing faces still receive full clipping; a broad solid spanning the arena guards this path.
Natural cap meshes must be closed and fit their authored envelopes; snow follows real surface faces.
For centre/edge/corner screenshots use `node tools/verify.js visual <tag> tablet all 60 map` or
`node tools/verify.js visual <tag> land all 30 map`; each covers nine views in every biome.

## Standard contracts

- Node checks cover seeded finite combat for each weapon, deterministic hazard and trap placement across all six biomes,
  snapshot restoration, biome/boss/hazard references, upgrade data, release notes, atmosphere budgeting, static mesh
  bounds, `freezeStatic()` zero-matrix-update invariants, O(1) GPU particle ring expiration, 3D variant/elite gear
  bounds, and the 1,800-triangle enemy / 6,500-triangle hero & boss kit budgets (`aPartMeta` GPU sub-part channels
  enforced across all 25 enemies). Combat contracts exercise actual AI for every boss pattern/phase and all ranged enemies,
  preserve source identity through effects/sound, reject orphan content and bound Spark Wand rendering at 420 shots.
  Power contracts follow actual Fire Burst/Gravity Bell/Shield events, deduplicate Fire Burst sound, preserve enemy-warning pools,
  cap concurrent effects and keep the aurora outside the arena at sway extrema.
  Exact rays cover thin/nearby obstacles, diagonal boxes, arena edges and zero reach; live
  beam/gadget checks exercise cover protection.
- Save checks cover round-trip persistence, migration, unknown future fields, bounded imports and corrupt-save recovery
  when storage is full. Failed writes retain existing recovery copies and old progress. The desktop flow checks
  that a boss medal is saved alongside progress from another tab.
- Choice snapshots keep the RNG through rerolls, seals and repeated resumes.
- The desktop flow covers modifier passthrough, keyboard movement and card shortcuts, mouse aim, right-click dash,
  buffered actions, the in-run performance overlay and the resume countdown. It checks that backgrounding during
  the countdown returns to Pause without advancing the world.
- The tablet and phone flows cover landscape multitouch, device-specific input, pause when rotating to portrait,
  settings, resizing and offline run continuation.
- Empty profiles exercise touch and desktop onboarding, desktop prompts on touch-capable PCs, real WebAudio pause and backgrounding,
  and safe resume. The menu flow verifies workshop upgrades and milestone rewards, then purchases a repair
  at Roadside Forge and resumes that checkpoint before entering the next area at a narrow viewport.
- Combat regressions cover native arm traits, Heat Shatter, Perfect Dash, micro-hitstop, Boss recovery
  windows and phase gates, Master Craft rolls, wave cleanup rewards, and the Endless burst cap.
- The worker fixture uses the real worker source with small pages. It installs A, rejects incomplete and mixed
  releases, preserves unrelated URLs and caches, installs B with the same product version/build but different content identity, activates B
  while the A page stays open, stops the server, fetches A's bundle offline, then reloads offline into B.
  Lifecycle events and an awaited fixture-only message identify the activated B before cutting the network; a transient waiting worker or an
  unrelated controller change cannot be mistaken for completion of the update.
  A second deployment's cache must remain untouched. This is a worker integration test, not a full
  two-release game migration or real-device acceptance test.

Default game flows suppress WebGL draw calls. Simulation, renderer setup, DOM and inputs still run,
but a passing test says nothing about pixel quality or FPS. `test:render` enables real drawing.
Browser failures and console errors fail the player flows. Each flow has fresh storage and a server.
No arbitrary sleep is used to wait for gameplay. The runner terminates its process group on timeout.

## Targeted visual review

```sh
# One biome on a phone with the 30 FPS cap, retaining High detail
node tools/verify.js visual review land starHall 30
# Every biome on a tablet with the default 60 FPS cap
node tools/verify.js visual review tablet all 60
# Seven weapons, eight player turn/lean/recoil views, all 25 enemies, smoke/rockets and FPS controls
node tools/verify.js equipment review
# Every current boss attack, seven weapons and elemental traps
node tools/verify.js combat review
# Smaller phone capture: weapons, Overdrives and beam/trap skins
node tools/verify.js combat review land phone-review
# Recapture just the six biome boss portraits after model changes
node tools/verify.js visual review tablet all 60 boss
```

Arguments after `visual`: output tag, layout (`land`/`phone` or `tablet`), biome ID or `all`, FPS limit
(`30`, `60`, `120`). Screenshots and metrics go to `verification-output/<tag>-<layout>-<fps>fps/`.
All limits retain High detail, shadows and the full particle budget.
Each biome has encounter, boss, warning/projectile and charge/sniper telegraph scenes. These are staged
encounters. The combat review separately stages each unique current boss pattern, including the Star Heart’s
middle phase, Overdrives and close-ups of every boss. Node contracts exercise all normal/enraged phase combinations.
The capture freezes the live loop after boot, advances twelve settling updates with only the final WebGL
submission, and captures real pixels. FPS limits are pacing ceilings; the staged capture is not a sustained performance benchmark.
Use a physical device for that.

All npm probes use the same temporary server and bounded process wrapper. Cleanup runs after failure,
timeout and cancellation, including orphan Chromium children. Direct scripts take a base URL and expect
an already running server. `RIFT_RENDERER=swiftshader` selects software drawing; `tools/browser.js` owns
backend flags. Software frame times are not mobile GPU benchmarks.

## CI and acceptance

PRs run `npm run check`. Pages runs the Node contracts and builds without downloading Chromium.
Both normal jobs have a five-minute ceiling. The manual verification workflow runs the selected
specialist check and uploads biome/equipment/combat/ability screenshots and metrics even after failures (seven-day retention).

Before release, play boss fights on a phone/tablet in landscape. Check warnings against bright ice/glass,
multitouch ownership, speaker audibility, 30/60/120 FPS pacing and several minutes of heat/memory.
Keep an old run open during a real deployment; apply the update outside the run and continue offline.
These physical-device, full published-release, long-session and balance checks remain manual.

## Measured duration

The suite includes focused audit regressions for saves, enemy buffs, traps, projectile collision and summons. It runs without GPU drawing by default; the optional drawing suite
has a separate deadline because software rasterisation is much slower. Timing depends on hardware
and CI load; these deadlines are not a mobile FPS target.

`node tools/verify.js visual <tag> tablet all 60 overview` captures one centred game view per biome for
matched art comparisons. The visual checks also require the painterly terrain and surface atlases to load and verify
that sun shadows stay enabled at every FPS setting. `tests/art.test.mjs` checks closed sculpted geometry, positive
signed-volume outward winding across all solid primitives, deterministic feathered ground-contact masks, GLSL 300 es
shader validity and zero Three.js dependencies.

The worker fixture observes registration and controller state synchronously; asynchronous identity replies do not
serialize lifecycle notifications. Failed activation includes the worker states in its error for diagnosis.

`tests/physical-audio.test.mjs` checks source-bank regions, finite faded physical bodies and the 48-entry cache bound; weather and wildlife must remain independent of the material recordings.
The full audio health suite requires the synthesized bank to decode, then checks samples, tails, mixing, continuous
fire and voice protection. Its cache includes the binary bank, so changing the bank invalidates previous results.
Rebuild the synthesized bank with `python tools/build-audio-bank.py` (Python 3), then format `src/audio/source-bank.js`.

Player geometry checks cover 1,344 combinations of weapon, body facing, aim and walking/banking/dash pose.
The weapon bearing must stay connected and the muzzle must follow the independent aim. Material checks cover
damage-event identity, normal/critical hit families and shield impacts; the audio catalog renders each family.
