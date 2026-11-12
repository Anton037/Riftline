# Riftline

**Riftline** is a 3D arena roguelite wave shooter for the browser — one arena, six biomes, escalating waves, one broken drone against all of it. Built with three.js and WebAudio, no framework, no build-time game engine: the game IS the code in `src/`.

**Play it:** https://anton037.github.io/Riftline/ — installable (PWA), runs offline after the first visit, a touch-only game for phones and tablets in landscape.

## What's in the game

- **7 weapons**, each with its own projectile behaviour, plus one evolution path per weapon
- **25 enemy types** with late-run role diversity, champions, elites and **6 bosses** (one per biome cycle), each with phases, enrage and a boss card reward
- **6 biomes** — Blackout City, the Glowmarsh, the Aurora Shelf, the Shattered Core, the Ashfall Caldera and the Glass Flats — each with its own floor, props, hazards (live vents, ice, acid, portals, magma vents, dust devils that move), light, music theme and soundscape
- A 20-wave run crosses Blackout City, two of the other four places, and the Shattered Core; Endless walks all six
- **62 run upgrades** including 13 evolutions, rarer cards offered more often, no duplicates in one offer
- **19 persistent workshop modules**, milestones through wave 200, threat levels, medals
- **Endless** continuation with escalating mutators after the main run
- A dynamic wave director that mixes 12+ encounter modes instead of a fixed spawn table

## Controls

| Action | Touch control |
|---|---|
| Move | Drag the left side |
| Aim / fire | Drag the right side; auto-fire is enabled by default |
| Dash / Nova / gadget | Tap the corresponding action button |
| Pause | Tap the pause button |

Hold the device in landscape. Move and resize the controls in Settings. Keyboard, mouse and
controller gameplay are not supported. Menus keep native browser accessibility and text entry.

## Development

```
npm install          # node 22.13+ or 24+
npm run build        # bundle src/ into dist/ (esbuild), substitute version + build id
npm run dev          # rebuild after source, public asset or package metadata changes
npm run serve        # serve dist/ for a quick look
npm test             # focused unit contracts + touch/onboarding/progression flows + worker update check
npm run audit:visual # all six biomes + bosses, tablet and landscape phone, metrics and images
npm run e2e          # the bounded touch and worker browser checks
npm run test:render  # same flows with real pixel drawing
npm run verify:audio # optional recorded/physical audio catalog (several minutes)
npm run lint         # catch undefined names and unused game declarations
npm run format       # prettier
```

### Project docs

- `docs/DEVELOPMENT.md` — the code history, the working rules and the release steps
- `docs/ROADMAP.md` — the owner's wishes and decisions (read at the start of a session)
- `docs/TESTING.md` — current test groups, CI routing and reasons for removing redundant work
- `docs/GITHUB.md` — the repository settings only the owner can change

### Which renderer the browser suites use

Every browser-driven suite launches Chromium through `tools/browser.js`, so the backend is chosen
in one place instead of in each file. Set `RIFT_RENDERER` to pick it:

| `RIFT_RENDERER` | Effect |
|---|---|
| unset / `auto` | prefer the real GPU; Chromium falls back to software when there is none. The default, and correct on both a workstation and a GPU-less runner |
| `gpu` | force the hardware path — fails loudly rather than silently measuring software rendering |
| `swiftshader` | force software rasterisation, for byte-identical frame pacing or to reproduce a driver bug |

This matters: software rendering managed 4 fps on a machine whose GPU ran the same build at 61 fps, so a
frame-rate assertion tuned on one measures the host, not the game.

### Probes (measure a change instead of guessing)

The npm probe commands build once, start a temporary server and run with a hard deadline.
Their entire process tree is cleaned up after success, failure or cancellation.

| Probe | Answers |
|---|---|
| `npm run probe:mix` | the mix balance at the default volumes, per bus, from numbers rather than taste |
| `npm run probe:music` | optional music spectra, loudness and rhythm measurements |
| `npm run probe:place` | ambience peak levels relative to weapon sounds |
| `npm run probe:audio` | chaos checks of the audio engine's failure paths |

### Test groups

`npm test` builds once and runs focused Node contracts and five browser checks. `npm run check` adds
formatting and lint. The tablet touch flow covers settings, movement, dash, pause, upgrades, offline
save reload, continue and death. The phone flow covers simultaneous sticks and dash, cancellation,
pause and resume. A fresh profile exercises onboarding and real WebAudio background/resume, and
practice checks preserve real progress and a saved run. A small real-worker fixture checks failed installs and same-version updates.
Default game flows skip GPU draw calls; `npm run test:render` draws real pixels.
See [docs/TESTING.md](docs/TESTING.md) for deadlines, specialist commands and limits.

Continue restarts a fighting checkpoint at the beginning of its wave. A checkpoint at the card
choice keeps its offer and the RNG for subsequent rerolls and banishes.

The ESLint dependency overrides select patched minimatch 11.0.1 while ESLint and config-array
still request 10.x. Remove these overrides once their supported ranges include the fixed release.

Audio catalog renders and six-biome screenshots are manual tools under `tools/verification/`.
`npm run verify:audio -- --full` ignores the passing cache and renders fresh samples.

### What lint catches

`no-undef` exists because of 3.45.0: the HUD's buff row read a local variable from a neighbouring function as a bare identifier — legal at parse time, invisible to esbuild and to every test (no test had a buff on screen), and it killed a real player's run the first time they dashed. A static undefined-name check fails that class before it ships. Unused declarations in game code are also flagged.

## Architecture

```
src/
  main.js          boot, wiring, the frame loop, run lifecycle, crash path
  core/
    world.js       the simulation: step, player, enemies, projectiles, economy
    waves.js       wave director: encounter modes, biome cycling, bosses
    ai.js          enemy behaviour
    arena.js       arena geometry, hazards, props
    save.js        localStorage save, snapshot sanitize, import/export
    diagnostics.js health checks, run monitor (test-only), post-run audit, crash reports
    ...            difficulty, mutators, medals, stats, traps, walk (the walker), util
  render/
    renderer.js    three.js scene, enemy/projectile meshes, biome visuals, effects
    overlay.js     2D HUD canvas: health bars, off-screen markers, hints
    interp.js      interpolation between simulation steps
    pacing.js      30/60/120 FPS deadlines, independent of the 60 Hz simulation
  audio/
    sound.js       routing, voice budgets, synthesized music, room tones, event beds
    physical-voices.js recorded material voices and modeled environmental accents
    source-bank.js offsets into the compact CC0 recording bank
    place.js       the sounds of the place: biome far-scenes, hazard proximity loops
  ui/
    ui.js          screens, HUD DOM, banners, cards, settings
    input.js       touch sticks, buttons and pointer ownership
    haptics.js     phone vibration and best-effort switch feedback
    hud-layout.js  safe areas, HUD element placement
  data/            weapons, enemies, biomes, upgrades, progression, what's new
  sw.js            service worker: one cache per build, updates apply when idle
build.js           esbuild bundling + __RL_*__ placeholder substitution
tests/             the suites above
tools/             test runner, optional verification, dev server
```

**Sound:** WebAudio combines a compact CC0 recording bank with damped material bodies and modeled weather,
wildlife and machinery. The synthesized score retains its biome arrangements. The bank is precached for offline
play; [source credits and pinned recordings](public/audio/SOURCES.md) accompany the optional asset builder.
The offline renderer checks real samples, mixing, continuous fire and voice limits.

## Releases

One version, one branch, one pull request: bump `version` and the build id in `package.json` (`r<version-digits>a<MMDD><letter>-r1`), add the top entry in `src/data/whatsnew.js` (the QA checks that it matches the game version), Prettier clean, suite green. Merging to `main` deploys to GitHub Pages. The service worker serves the new build the next time the game is opened and applies it when the player is idle.

## When something breaks

The game keeps its own flight recorder. A crashed run shows a report (version, device, health checks, the exact frame errors) with a **copy** button — paste it into an issue and it pins the bug down fast. Health checks also run at boot in every test session, so most breakage is caught before it ships.

The 4.1 review covers the painted worlds, characters/equipment, physical sound sources and the 30/60/120 FPS
control: [art and sound review](docs/ART-REVIEW-4.1.md). High detail is standard at every FPS limit; the default is 60.
Recording credits and pinned source links are in [audio sources](public/audio/SOURCES.md).

The [4.1.1 checkup](docs/CHECKUP-4.1.1.md) covers the connected walker, biome cleanup, material-specific hits,
repository maintenance and the checks actually performed.

The [4.2 combat review](docs/COMBAT-REVIEW-4.2.md) covers distinct weapon flight, matching boss/enemy
effects and sound, the volcanic Tyrant model, painted surface relief and complete retired-content removal.
