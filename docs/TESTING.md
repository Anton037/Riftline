# Testing policy — fresh foundation, 3.61.0

The historical test catalog has been removed at the owner's request. There is one small suite,
using Node's built-in test runner, with ten unit contracts and two browser flows. No release-by-release
assertion collection, stored simulation goldens, hidden deep test or change-selection planner remains.

| Command | Coverage | Deadline |
|---|---|---|
| `npm test` | Build once, ten units and two browser flows | Build 30 s, test process 75 s |
| `npm run test:unit` | Core simulation/data (4), saves (4), rendering helpers (2) | Test process 75 s |
| `npm run e2e` | Desktop and landscape touch player flow | Each flow 25 s, process 75 s |
| `npm run test:render` | Same browser flows with real pixel drawing | Each flow 60 s, process 150 s |
| `npm run check` | Formatting, undefined-name lint, then `npm test` | Same test deadlines |
| `npm run release-check` | Alias of `check` | Same gate, no second chain |
| `npm run audit:visual` | Optional six-biome/boss image and draw-call review | Manual specialist tool |
| `npm run verify:audio` | Optional offline sound/music catalog and voice budgets | Several minutes; passing input cache |
| `npm run verify:audio-budget` | Optional six-biome budget/reference parity | Manual specialist tool |

Run `npm ci` and `npx playwright install --with-deps chromium` before browser checks. Node 22+ is
required. `--no-build` is available through `npm test -- --no-build` for an already current `dist/`.
Unknown test flags fail instead of silently selecting a different suite.

## What the new tests establish

- Every weapon runs finite combat without ambient `Math.random`; seeded inputs reproduce the same
  simulation, and snapshots retain essential run state. All six places have boss/hazard mappings.
  Upgrade/weapon references and current release news are consistent.
- The real SaveStore round-trips settings and run data, migrates a representative old save, preserves
  unknown future fields, and protects corrupt data when backup storage is full. One old-save fixture remains.
- Atmosphere profiles reduce emissions under pressure. Static opaque batching preserves bounds and
  leaves animated/translucent objects intact.
- Both desktop and touch flows use actual UI/input handlers: settings, movement, dash, pause/resume,
  wave completion, upgrade selection, persisted reload/continue, death and return home. Wave completion
  and lethal damage are arranged through the game interface rather than waiting through a full fight.
  Each flow gets an isolated browser, storage and server. Browser errors fail the test.

Default browser tests suppress WebGL draw calls to keep software rasterization from dominating a
functional test. The real simulation, scene/shader setup, DOM, inputs and game loop still run.
They do **not** establish pixel quality, FPS or visual correctness. Use `test:render` and the visual
review tool for real drawing. `RIFT_RENDERER=swiftshader` makes the browser backend explicit on a
GPU-less runner; `tools/browser.js` owns those flags.

There are no fixed sleeps waiting for gameplay. State-based waits have short deadlines and phase
messages show where a failure happened. Flow cancellation closes Chromium; the outer runner kills
its entire child process group at the overall deadline, including orphan browser processes.

## What was removed

The old E2E/QA runners, historical self-tests and their shipped browser bundle, multi-seed audit,
soak/fuzz/balance suites, stored golden catalogs, overlapping screenshot scripts, archive checks and
change-selection router are gone. No compatibility alias secretly runs them. The audio renderer and
visual matrix live as optional development tools in `tools/verification/`, outside `tests/` and CI's
default gate. Sound scheduling still has a separate real-node parity tool.

This is deliberately smaller coverage. Offline/service-worker recovery, broad menu/device layouts,
long sessions, balance, every boss attack, audio quality and real-device comfort need targeted manual
review or a focused future regression when there is a concrete bug. A green gate is not a full game audit.

## CI

Pull requests and Pages builds run `npm run check` once, with a five-minute job ceiling including
installation. Optional verification is manual, selected by name, with a ten-minute job ceiling. There
is no nightly or automatic multi-minute audio/visual chain. Add tests for observable failure modes;
avoid rebuilding the old catalog with assertions that duplicate implementation details.

## Verification of this reset

On the development host with SwiftShader, all twelve replacement tests passed in 27.9 s including
the build; the standalone two-flow E2E run passed in 27.1 s. Units alone passed in 0.8 s. Formatting
and ESLint passed. The separate real-pixel flows passed in 55.4 s. These are observed host timings,
not performance guarantees or device FPS claims.
