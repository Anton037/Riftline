# Riftline audit — 6 November 2026

Base: main `5fad1d474a611fdccf9872e9d79b880e41d645f0`; initially clean checkout.
Review branch: `audit/comprehensive-3.62.1`. Release: 3.62.1 / r3621a1106a-r1.
Environment: Linux cloud container, Node 24.22.1, npm 11.9.0, Chromium 156.0.8078.4,
desktop touch emulation, software rendering. Viewports: 1024×768 and 844×390.
No production deployment or personal save was used.

## Confirmed findings and fixes

All nine are fixed with focused regression coverage in `tests/audit.test.mjs` and `tests/save.test.mjs`.
Severity describes player impact, not a security CVSS rating.

| Severity | Reproduction / evidence | Fix location |
|---|---|---|
| Medium | Save and restore boss defeats `[warden, queen, warden]`: last defeat disappeared | `src/core/save.js`, cleanRun preserves the event list |
| Medium | Ordinary ally receives champion rally; kill champion and simulate 0.5 s: rally remained | `src/core/world.js`, statusTick expires rally on every enemy |
| Medium | Sunstruck charger/driller retain timer and never sprint | `src/core/ai.js`, shared temporary speed wrapper |
| Medium | Impossible day/week keys accepted; invalid daily date can throw when updating an existing record | `daily.js`, `weekly.js`, `save.js`: calendar validation and record guards |
| Low | Scattergun + one Split Chamber displayed 147 DPS instead of 168 | `src/core/stats.js`: two extra pellets for cone weapons |
| Medium | Hazard resistance 50% did not reduce floor, mine or beam trap damage | `src/core/traps.js`: apply map resistance, retain separate armour rules |
| Medium | Enemy shot travels from −0.9 to +0.9 in one step through player without damage | `src/core/world.js`: intermediate path collision samples; intervening wall regression |
| High | JSON array/wrong save identity silently replaced without preserving raw data | `src/core/save.js`: reject unusable envelopes, existing backup/hold recovery applies |
| Medium | Core enraged, invulnerable moving player, no firing for 900 simulated seconds: 121 enemies | `src/core/ai.js`: crowd limit includes pending reinforcements; repeated summon regression |

Removed references to absent CLAUDE.md and corrected stale testing counts. No AGENTS.md was found.
The future *product* version with schema v1 retains unknown fields; unsupported schemas are backed up.
Trap protection and sprint fixes intentionally change behavior to match existing descriptions.
Projectile sweeps add collision work for fast shots; mobile performance acceptance remains necessary.

## Coverage and evidence

| Area | Inspected / actually exercised | Limits |
|---|---|---|
| Architecture/build/CI | ES modules, esbuild, three.js, WebAudio, localStorage, worker; scripts, SHA-pinned actions, permissions and Pages base paths reviewed; npm ci/build/lint/format | Not a line-by-line proof of all source or vendor code; only Node 24 run |
| Content | Code inventory: 7 weapons, 25 enemies, 6 biomes, 7 boss definitions (one retired), 62 upgrades including 13 evolutions, 19 workshop modules, 36 milestones | Definitions and interactions reviewed; all upgrade combinations not exhausted |
| Simulation | Every active boss, all three training entry phases, 120 simulated seconds each; all 25 enemy roles, 30 seconds each; all 7 weapons/max applicable upgrades at wave 999, 60 seconds each; finite sampled numeric state | Arranged invulnerability/inputs, no claim of naturally won fights or balanced difficulty |
| Persistence/progression | Standard save migration, future fields, quota/denial recovery, repeated choice resumes/rerolls/banishes; new envelope/repeat boss regressions | No personal save used; cross-tab interleavings not exhausted |
| Input/UI/modes | Existing touch flows inspected and run: settings, tutorial, movement, aiming, third-finger dash, cancellation, pause, arranged choice/death, training isolation, continue | Default tests suppress WebGL and hide webdriver, also disabling the run monitor; Daily/Weekly entry and HUD editing not exhaustively played |
| Rendering | High tablet matrix reached 17 of 18 staged scenes across all six biomes before 240 s limit; saved PNGs; Glasswyrm image visually inspected; real-drawing phone multitouch passed | Tablet drawing flow timed out waiting for choice; no full phase/evolution pixel review, Auto/Saver adaptation or GPU leak proof |
| Audio | Full real offline sample suite passed: 361 sounds, 18 music renders, 36 budgets, no failures (188.2 s); recovery probe passed | Earlier run timed out during browser boot under concurrent graphics load. No subjective listening, physical speakers or iOS audio policy test |
| Offline/update | Tiny real-worker fixture inspected; full A=3.62.0 → B=3.62.1 builds served under /Riftline/: pending update held through gameplay, choice, dialog/background; choice continued with reroll/banish; both scenarios reloaded B offline retaining 1234 shards | Full-game update used draw suppression and arranged choice. Early scratch failures were harness background-pause and rebuilding-served-directory errors; stable copies passed |
| Security/dependencies | npm audit reports zero vulnerabilities; DOM escaping/import bounds and scope-isolated caches reviewed; debug hook local, no network authority | No exhaustive secret-history scan or penetration-test claim |
| Diagnostics | Bounded error records, early-log queue and crash/health pathways inspected | Not every injected failure or malformed log object tested |

Daily/Weekly seeds, weapon/threat and weekly mutators derive from UTC calendar keys. Workshop/pacts
are excluded. Combat RNG still depends on the input/event sequence: this is not identical results
regardless of play. Fighting snapshots restart the wave; choice snapshots preserve offer RNG.

## Checks and remaining acceptance

Evidence bundle contains baseline/final command logs, simulation JSON, standalone worker repeat,
audio outputs, full-game update JSON, screenshots and one-time investigation scripts.
Baseline standard run: 18/19 passed; worker offline reload intermittently returned A after identifying B.
Standalone repeat passed. This remains an unresolved intermittent observation, not a proven worker fix.
`npm run test:render`: phone flow passed; tablet choice wait failed; do not describe this gate as green.
`npm run audit:visual`: timed out at 240 seconds; do not describe the full matrix as complete.
`npm run verify:audio` and `npm run probe:audio`: passed. `npm audit --json`: zero vulnerabilities.
The final standard gate result is recorded in the appended validation section below.

Before release, a physical Android phone and iPhone/iPad must cover:

- Landscape touch ownership with three fingers, rotation, browser bars/safe areas, HUD edit/reload,
  native import text selection, modal focus, scrolling and unsupported gameplay inputs.
- Naturally complete an early run and every boss phase; inspect warnings on ice/glass and crowded
  projectile/evolution scenes at High, Auto and Saver.
- Resume fighting and choice saves; Daily/Weekly UTC rollover, Endless repeated bosses and training
  success/failure without progression changes.
- At least 15 minutes of crowded play: frame timing, heat, battery, retained GPU/audio resources;
  verify all warning cues on speakers/headphones through mute, lock/background and resume.
- Real installed PWA update with an old tab, open import dialog, pending choice and offline restart.

This audit found and fixed concrete defects; it does not certify every requested runtime scenario.

## Initial validation (superseded by the follow-up below)

`npm run check`: formatting and lint passed; 27/28 tests passed. The existing worker fixture again
failed at offline reload (`tests/update.browser.test.mjs:129`, expected B, observed A). The full-game
A/B scenarios both passed. Release gate is therefore **not green**; keep this branch draft until the
intermittent worker lifecycle behavior is explained and the full gate passes. No assertion weakened.
`git diff --check` passed. The final diff was reviewed for timer expiry, damage stacking, save recovery
and preservation of touch-only gameplay.


## Follow-up: worker lifecycle failure

The failing GitHub job 127848193942 (run 42204667613) reproduced the same offline A/B failure.
The test used `page.waitForFunction(async () => ...)`. In installed Playwright 1.64.1,
`waitForFunctionExpression` tests the returned Promise for truthiness before awaiting its result:
a Promise resolving to false ends polling. Consequently the test cut the network before B had
necessarily claimed the page. Instrumented navigation responses confirmed A still served that reload.

The test now awaits lifecycle events (`updatefound`, worker `statechange`, `controllerchange`)
and asynchronous identity readback in one browser Promise. Only an activated controller identifying
as B completes the wait. The five-second readiness bound and all offline/bundle/cache assertions
remain. No service-worker production behavior was changed for this test defect.
Ten consecutive isolated worker runs passed after this change. Follow-up full-gate and CI results
are recorded in the PR description for its latest commit. Initial failure logs above remain historical.


Software-render follow-up: at the tablet timeout, the live world was unpaused, enemies/markers/pickups
were empty, and the clear animation had advanced only 1.05 simulated seconds (threshold 1.6).
Actual drawing on this software GPU advances simulation slowly because each frame delta is capped.
The optional draw suite now allows 45-second condition waits, 180 seconds per game flow and 600 seconds
for the process. Normal CI/default deadlines and all state assertions are unchanged.
