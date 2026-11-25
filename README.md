# Riftline

A **Tactile Cozy Diorama** 3D arena roguelite for desktop (mouse and keyboard) and phones/tablets in landscape.

[Play Riftline](https://anton037.github.io/Riftline/)

Journey across six miniature areas as a cloaked **Lantern Keeper** with seven weapons, Master Crafts, Home progression, and Journal bounties. Each area has its own landmarks, boss, traps, wave events, and music. Complete the 20-wave expedition or venture into Endless Mode. Saves and installed game assets work offline after the first load.

## Controls

| Action | Mobile touch | Desktop keyboard and mouse |
|---|---|---|
| Move | Drag left side | `WASD` / Arrow keys |
| Aim and fire | Drag right side | Hold left mouse button |
| Dash | Tap `DASH` | `Space` / `Shift` / Right-click |
| Fire Burst | Tap `BURST` | `E` / `Q` / `F` |
| Gravity Bell | Tap `BELL` | `G` |
| Pause | Tap Pause | `Esc` / `P` |
| Menus, crafts & Forge | Tap a card or button | Click a card or button, `1`–`5` to pick (`1`–`3` / `Enter` at Forge), `B` to seal, `R` to reroll or retry |

Mobile runs play in landscape. Move or resize the touch controls in Settings. The FPS limit defaults to 60, with
30 and 120 also available. Press `M` to mute on desktop.

## Development

Use Node.js 22.13+ or 24+.

```sh
npm ci
npm run build
npm run serve
```

The server prints its address. `npm run dev` watches source, assets and package metadata and serves `dist/`
on `http://localhost:8124`.
Serve the game over HTTP or HTTPS so assets, saves and the service worker behave correctly.

| Command | Purpose |
|---|---|
| `npm run check` | Formatting, lint, build and the standard tests |
| `npm run test:unit` | Simulation, saves, data and geometry contracts |
| `npm run e2e` | Desktop, touch, onboarding, progression and offline update flows |
| `npm run test:render` | Browser flows with actual WebGL drawing |
| `npm run audit:visual` | All six biomes and bosses on phone and tablet |
| `npm run verify:abilities` | Power phases and scenery on phone and tablet |
| `npm run verify:combat` | Boss attacks, weapons and biome effects |
| `npm run verify:audio` | Optional audio rendering and voice-budget checks |

[Development](docs/DEVELOPMENT.md) covers the code, assets and release process.
[Testing](docs/TESTING.md) lists targeted commands, deadlines and coverage.
Generated verification output belongs in the ignored `verification-output/` directory or CI artifacts.

## Project structure

| Path | Contents |
|---|---|
| `src/core/` | Deterministic simulation, combat, hazards, waves, maps and saves |
| `src/data/` | Weapons, actors, biomes, crafts and progression |
| `src/engine/` | Custom GPU-First WebGL2 Engine v2 (`std140` `FrameUniforms` UBO, stateless GPU particle/debris rings, compact 48B actor instancing, `aPartMeta` GPU sub-part animation, `256×256` GPU wake map, MSAA HDR, texel-snapped rotated-Poisson PCF shadows, frustum culling, Kawase bloom/ACES) |
| `src/render/` | Diorama biomes and landmarks, articulated Lantern Keeper, 25 GPU-animated enemies, 6 multi-phase bosses and 2D HUD overlay |
| `src/audio/` | Six per-biome musical arrangements, scale-tuned reward chimes, 6-biome tactile surface foley, acoustic material voices and spatial landmark soundscapes |
| `src/ui/` | Storybook HUD, Home & Journal/Guide menus, illuminated craft cards, mobile touch and desktop keyboard/mouse |
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
