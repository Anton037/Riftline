# Riftline

A **Tactile Cozy Diorama** 3D arena roguelite for desktop (mouse and keyboard) and phones/tablets in landscape.

[Play Riftline](https://anton037.github.io/Riftline/)

Journey across six handcrafted miniature realms as a cloaked **Lantern-Artificer** wielding seven bespoke arms, interactive realm relics, evolving masterwork crafts, Sanctuary progression, and Wayfarer Journal bounties. Each realm features its own perimeter architecture, corner landmarks, guardian boss, interactive hazards, wave events, tactile surface foley, and modal musical score. Complete the 20-wave expedition or venture into Endless Trials. Saves and installed game assets work offline after the first load.

## Controls

| Action | Touch | Mouse and keyboard | Standard gamepad |
|---|---|---|---|
| Move | Drag left side | `WASD` / Arrow keys | Left stick |
| Aim and fire | Drag right side | Hold left mouse button | Right stick + `RT` |
| Dash | Tap `DASH` | `Space` / `Shift` / Right-click | `A` / `LB` |
| Hearthburst | Tap `BURST` | `E` / `Q` / `F` | `B` / `RB` |
| Gravity Chime | Tap `CHIME` | `G` | `Y` / `LT` |
| Pause | Tap Pause | `Esc` / `P` | Start |
| Menus and craft offers | Tap a card or button | `1`–`5` pick, `B` seal, `R` reroll or retry | D-pad, `A` select, `B` back |

Touch controls work in landscape and can be moved and resized in Settings. High detail is standard;
choose a 30, 60 or 120 FPS cap, with 60 FPS as the default. Input switches automatically between touch,
mouse and keyboard, and connected gamepads as you use them. Press `M` to mute on desktop.

## Development

Use Node.js 22.13+ or 24+.

```sh
npm ci
npm run build
npm run serve
```

The server prints its address. `npm run dev` watches source, assets and package metadata; run
`npm run serve` in a separate terminal (note that `npm run dev` builds into `dist/` without serving).
Serve the game over HTTP or HTTPS so assets, saves and the service worker behave correctly.

| Command | Purpose |
|---|---|
| `npm run check` | Formatting, lint, build and the standard tests |
| `npm run test:unit` | Simulation, saves, data and geometry contracts |
| `npm run e2e` | Desktop, touch, onboarding, progression and offline update flows |
| `npm run test:render` | Browser flows with actual WebGL drawing |
| `npm run audit:visual` | All six biomes and guardians on phone and tablet |
| `npm run verify:abilities` | Power phases and scenery on phone and tablet |
| `npm run verify:combat` | Guardian attacks, armaments and biome effects |
| `npm run verify:audio` | Optional audio rendering and voice-budget checks |

[Development](docs/DEVELOPMENT.md) covers the code, assets and release process.
[Testing](docs/TESTING.md) lists targeted commands, deadlines and coverage.
Generated verification output belongs in the ignored `verification-output/` directory or CI artifacts.

## Project structure

| Path | Contents |
|---|---|
| `src/core/` | Deterministic simulation, combat, interactive biome relics, waves, maps and saves |
| `src/data/` | Armaments, actors, biomes, crafts and progression |
| `src/engine/` | Custom GPU-First WebGL2 Engine v2 (`std140` `FrameUniforms` UBO, stateless GPU particle/debris rings, compact 48B actor instancing, `aPartMeta` GPU sub-part animation, `256×256` GPU wake map, MSAA HDR, texel-snapped rotated-Poisson PCF shadows, frustum culling, Kawase bloom/ACES) |
| `src/render/` | Tactile cozy diorama biome worlds, bespoke perimeters & relics, articulated Lantern-Artificer, 25 GPU-animated foes with 3D variant/elite gear, 6 multi-phase guardians and 2D HUD overlay |
| `src/audio/` | Six per-biome musical arrangements, scale-tuned reward chimes, 6-biome tactile surface foley, acoustic material voices and spatial landmark soundscapes |
| `src/ui/` | Storybook HUD, Sanctuary & Journal/Codex menus, illuminated craft cards, touch, keyboard/mouse and gamepad input |
| `public/` | Fonts, painterly texture atlases, sound bank, app icons and asset notices |
| `tests/` | Simulation, geometry, shader, browser and worker tests |
| `tools/`, `scripts/` | Build support, verification and asset generation |

`src/main.js` connects the game systems. `build.js` bundles the game into `dist/`, and `src/sw.js`
provides offline installation and updates. GitHub Actions validates pull requests; merging to `main`
builds and deploys GitHub Pages.

## Saves and troubleshooting

A fighting checkpoint resumes at the beginning of its wave. A craft-choice checkpoint preserves its
offer and subsequent choice randomness. Settings includes `.json` file and text save import/export,
raw corrupt-save backup inspection/download, and a one-click diagnostic log copy button.
A crash report records the release, device and relevant errors; include it when reporting a problem.

## Asset credits

[Third-party notices](public/THIRD-PARTY-NOTICES.txt) contain the bundled code and font licenses.
[Audio sources](public/audio/SOURCES.md) describe the original synthesized sounds and how to rebuild the bank.
