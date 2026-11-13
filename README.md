# Riftline

A touch-only 3D arena roguelite for phones and tablets in landscape.

[Play Riftline](https://anton037.github.io/Riftline/)

Fight through six biomes with seven weapons, evolving upgrades, workshop progression and achievements.
Each biome has its own boss, hazards, scenery and soundscape. Complete the 20-wave run or continue into
Endless. Saves and installed game assets work offline after the first successful load.

## Controls

| Action | Touch control |
|---|---|
| Move | Drag the left stick |
| Aim / fire | Drag the right stick; auto-fire is enabled by default |
| Dash, Nova, Singularity | Tap the action buttons |
| Pause | Tap the pause button |

Hold the device in landscape. Controls can be moved and resized in Settings. High detail is standard;
choose a 30, 60 or 120 FPS cap, with 60 FPS as the default. Gameplay uses touch input; menus support
normal browser navigation and text entry.

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
| `npm run e2e` | Touch, onboarding, progression and offline update flows |
| `npm run test:render` | Browser flows with actual WebGL drawing |
| `npm run audit:visual` | All six biomes and bosses on phone and tablet |
| `npm run verify:abilities` | Power phases and scenery on phone and tablet |
| `npm run verify:combat` | Boss attacks, weapons and biome effects |
| `npm run verify:performance` | Reproducible simulation and renderer measurements |
| `npm run verify:audio` | Optional audio rendering and voice-budget checks |

[Development](docs/DEVELOPMENT.md) covers the code, assets and release process.
[Testing](docs/TESTING.md) lists targeted commands, deadlines and coverage.
Generated verification output belongs in the ignored `verification-output/` directory or CI artifacts.

## Project structure

| Path | Contents |
|---|---|
| `src/core/` | Deterministic simulation, combat, waves, maps and saves |
| `src/data/` | Weapons, actors, biomes, upgrades and progression |
| `src/render/` | Three.js models, materials, scenery and effects |
| `src/audio/` | Recorded material voices, music and environmental sound |
| `src/ui/` | Touch input, screens, HUD and haptics |
| `public/` | Fonts, textures, sound bank, app icons and asset notices |
| `tests/` | Simulation, geometry, browser and worker tests |
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
[Audio sources](public/audio/SOURCES.md) credit the recorded sounds and explain how to rebuild the bank.
