# Riftline

A 3D arena roguelite for desktop (mouse and keyboard) and phones/tablets in landscape.

[Play Riftline](https://anton037.github.io/Riftline/)

Fight through six biomes with seven weapons, evolving upgrades, workshop progression and achievements.
Each biome has its own boss, hazards, scenery and soundscape. Complete the 20-wave run or continue into
Endless. Saves and installed game assets work offline after the first successful load.

## Controls

| Action | Touch control | Mouse + Keyboard |
|---|---|---|
| Move | Drag the left stick | `WASD` or Arrow keys |
| Aim / fire | Drag the right stick | Hold left mouse button to aim/fire; auto-fire by default |
| Dash | Tap `DASH` | `Space` / `Shift` |
| Nova | Tap `NOVA` | `E` / `Q` / `F` |
| Singularity | Tap `GADGET` | `G` |
| Pause / Back | Tap Pause | `Esc` / `P` |
| Upgrades / End | Tap card or button | `1`–`4` pick, `B` banish, `R` reroll / retry |

Touch controls work in landscape and can be moved and resized in Settings. High detail is standard;
choose a 30, 60 or 120 FPS cap, with 60 FPS as the default. Input switches automatically between touch
and mouse/keyboard as you use them.

## Development

Use Node.js 22.13+ or 24+.

```sh
npm ci
npm run build
npm run serve
```

The server prints its address. `npm run dev` watches source, assets and package metadata; run the
server in a separate terminal. Serve the game over HTTP or HTTPS so assets, saves and the service
worker behave correctly.

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
| `src/core/` | Deterministic simulation, combat, waves, maps and saves |
| `src/data/` | Weapons, actors, biomes, upgrades and progression |
| `src/engine/` | Custom zero-dependency WebGL2 graphics engine (math, geometry, instancing, shaders, shadows, bloom/ACES) |
| `src/render/` | Stylized painterly / cel-shaded biome arenas, actor and boss models, combat VFX and HUD overlay |
| `src/audio/` | Synthesized material voices, music and environmental sound |
| `src/ui/` | Touch and keyboard/mouse input, screens, HUD and haptics |
| `public/` | Fonts, painterly texture atlases, sound bank, app icons and asset notices |
| `tests/` | Simulation, geometry, shader, browser and worker tests |
| `tools/`, `scripts/` | Build support, verification and asset generation |

`src/main.js` connects the game systems. `build.js` bundles the game into `dist/`, and `src/sw.js`
provides offline installation and updates. GitHub Actions validates pull requests; merging to `main`
builds and deploys GitHub Pages.

## Saves and troubleshooting

A fighting checkpoint resumes at the beginning of its wave. A card-choice checkpoint preserves its
offer and subsequent choice randomness. Settings includes save import/export.
A crash report records the release, device and relevant errors; include it when reporting a problem.

## Asset credits

[Third-party notices](public/THIRD-PARTY-NOTICES.txt) contain the bundled code and font licenses.
[Audio sources](public/audio/SOURCES.md) describe the original synthesized sounds and how to rebuild the bank.
