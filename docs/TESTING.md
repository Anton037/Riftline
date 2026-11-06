# Testing Riftline

Keep the routine gate short. Focused Node contracts and five browser checks cover the critical paths;
there is no historical release assertion catalog, always-on soak or hidden extended test chain.

| Command | Coverage | Deadline |
|---|---|---|
| `npm run check` | Formatting, lint, build and standard tests | Test subprocess 75 s |
| `npm test` | Node contracts, tablet/phone flows, onboarding, training and worker update | Build 30 s; tests 75 s |
| `npm run test:unit` | Saves, deterministic simulation, data and render geometry | 75 s |
| `npm run e2e` | Touch, onboarding/audio, training and worker update | Game flows 25–30 s; worker 20 s; process 75 s |
| `npm run test:render` | Same browser checks with actual drawing | Game flows 180 s each; process 600 s |
| `npm run audit:visual` | Six biomes and bosses on tablet and landscape phone, High | 240 s per layout |
| `npm run verify:audio` | Optional synthesized sound correctness | 420 s |
| `npm run verify:audio-budget` | Optional audio scheduler/real-node parity | 180 s |
| `npm run probe:audio` | Audio fault recovery | 120 s |
| `npm run probe:mix` / `probe:music` / `probe:place` | Optional sound measurements | 300 / 420 / 180 s |

## Standard contracts

- Node checks cover seeded finite combat for each weapon, snapshot restoration, biome/boss/hazard
  references, upgrade data, release notes, atmosphere budgeting and static mesh bounds.
- Save checks cover round-trip persistence, migration, unknown future fields and corrupt-save recovery
  when storage is full. Failed explicit imports/resets retain old progress; successful ones recover held saves.
- Choice snapshots keep the RNG through rerolls, banishes and repeated resumes. Every training boss and
  starting phase uses the matching arena and finishes without a normal upgrade reward.
- The tablet flow uses touch for settings, movement, dash, pause/resume, card choice, offline reload,
  saved-run continuation, death recap and returning home. Death/wave completion are arranged through
  the simulation interface rather than waiting through whole fights. An import dialog survives a pending
  update during a simulated visibility change, and mouse/pen action events are ignored.
- The landscape phone flow holds both sticks and taps dash with a third finger, cancels the touches,
  then pauses/resumes. A gamepad API counter must stay at zero.
- A fresh profile uses real touch through all four tutorial coaches and real WebAudio through pause,
  simulated backgrounding and resume. Kills are arranged through the simulation interface.
- Training starts, wins, retries and loses through the real game/UI flow without changing the saved run,
  currency, statistics or discoveries. The Codex archive retains old discoveries outside completion totals.
- The worker fixture uses the real worker source with small pages. It installs A, rejects an incomplete
  release, installs B with the same product version/build but different content identity, activates B
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
# One biome on a phone in Saver (the saved setting is named battery)
node tools/verify.js visual review land void battery
# Every biome on a tablet in Auto
node tools/verify.js visual review tablet all auto
```

Arguments after `visual`: output tag, layout (`land`/`phone` or `tablet`), biome ID or `all`, quality
(`high`, `auto`, `battery`). Screenshots and metrics go to `verification-output/<tag>-<layout>-<quality>/`.
Each biome has encounter, boss and warning/projectile scenes. These are staged encounters, not a claim that every boss attack/phase has been visually reviewed.
Auto captures its starting configuration, not sustained thermal adaptation. Use a physical device for that.

All npm probes use the same temporary server and bounded process wrapper. Cleanup runs after failure,
timeout and cancellation, including orphan Chromium children. Direct scripts take a base URL and expect
an already running server. `RIFT_RENDERER=swiftshader` selects software drawing; `tools/browser.js` owns
backend flags. Software frame times are not mobile GPU benchmarks.

## CI and acceptance

PRs run `npm run check`. Pages runs the Node contracts and builds without downloading Chromium.
Both normal jobs have a five-minute ceiling. The manual verification workflow runs the selected
specialist check and uploads visual screenshots/metrics even after failures (seven-day retention).

Before release, play boss fights on a phone/tablet in landscape. Check warnings against bright ice/glass,
multitouch ownership, speaker audibility, Auto/Saver frame pacing and several minutes of heat/memory.
Keep an old run open during a real deployment; apply the update outside the run and continue offline.
These physical-device, full published-release, long-session and balance checks remain manual.

## Measured duration

The suite includes focused audit regressions for saves, calendars, enemy buffs, traps, projectile collision and summons. It runs without GPU drawing by default; the optional drawing suite
has a separate deadline because software rasterisation is much slower. Timing depends on hardware
and CI load; these deadlines are not a mobile FPS target.
