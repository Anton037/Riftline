# Development

## Code and assets

The game uses ES modules, a custom zero-dependency WebGL2 (`#version 300 es`) engine (`src/engine/`) and WebAudio.
`src/main.js` owns the application lifecycle and connects the simulation, rendering, audio, input and UI systems.
`build.js` bundles the application and copies the public assets into `dist/`. `npm run dev` watches source, public
assets and package metadata; rebuilds are serialized to avoid overlapping writes.

`src/engine/` provides allocation-free math & Gribb-Hartmann frustum culling (`math.js`), outward-wound procedural and
sculpted mesh builders with per-vertex `aPartMeta` sub-part animation channels (`geometry.js`), frozen static subtrees,
48-byte `CompactInstancePool`s, stateless `GpuParticleRing` / `GpuDebrisRing` buffers and static mesh batching
(`scene.js`), linear-HDR GLSL 300 es diorama shaders (`shaders.js`), and the GPU-First WebGL2 Engine v2 (`webgl2.js`)
with a shared `std140` `FrameUniforms` UBO, a `256×256` GPU arena wake map (`uWakeMap` for footprints, puddle ripples and
parting foliage), a texel-snapped 1024×1024 (high-DPR up to 2048) rotated-Poisson hardware-PCF shadow cascade, 2×–4× MSAA HDR offscreen
rendering (with a 5-tap edge-smoothing fallback), smooth adaptive `renderScale`, 8 dynamic combat point lights,
2-step Kawase selective bloom, ACES filmic tone mapping and context-loss recovery.

Keep gameplay randomness in the seeded simulation. Geometry and placement checks live in
`src/core/arena.js`, with trap and enemy placement in `src/core/traps.js` and `src/core/world.js`.
Cosmetic randomness belongs in rendering and audio.
Save compatibility and stable seeded layouts have active regression fixtures in `tests/fixtures/`.
These fixtures protect existing progress and world generation.

The painterly terrain, surface and VFX atlases (`terrain-atlas.webp`, `surface-atlas.webp`, `vfx-atlas.webp`) and
install icons are generated with `python tools/build-art.py` using Python 3, Pillow and NumPy. Arena biomes, bespoke
perimeter architecture, corner landmarks, sculpted cover, exterior dioramas, articulated hero & weapon rigs, 25 GPU-animated
enemies with 3D variant/elite attachments, 6 multi-phase bosses and combat VFX are assembled in `src/render/` on top
of `src/engine/` and respect the existing simulation footprints.

The 25-clip synthesized sample bank and its clip offsets are generated with
`python tools/build-audio-bank.py` using Python 3. `src/audio/score.js` defines the cozy title theme and six distinct
per-biome fight/boss musical arrangements plus `scoreScaleMidi`, `src/audio/physical-voices.js` and `src/audio/sound.js`
define 6-biome tactile surface foley, enemy/construct material voices and scale-keyed UI and reward chimes, and
`src/audio/place.js` drives spatial landmark and hazard soundscapes. Asset credits and third-party notices ship under
`public/`.

## Verification

Run `npm run check` and specialist checks appropriate to the changed system. [Testing](TESTING.md)
describes the available checks and their limits. Browser tests and probes use `window.__riftTest` to
exercise the real game systems. Verification media, measurements and temporary experiments belong
in `verification-output/`, `work/` or CI artifacts; they are excluded from source control.

`RIFT_RENDERER=auto` prefers the available GPU and permits software fallback. Set it to `gpu` to
require hardware rendering, or `swiftshader` to reproduce software rendering. Software timings are
not measurements of a phone's GPU.

## Release identity and offline updates

`package.json` owns the product version and `riftline.build`. `build.js` substitutes these values into
the application, HTML, bundle URL, build metadata and worker. The bundle URL includes its content
hash; the worker snapshot identity also incorporates HTML, assets and release metadata. Identical
inputs produce stable identities, and changed content creates a new snapshot.

The worker retains the current and one previous complete snapshot for its scope. Incomplete installs
are rejected, active runs retain their installed assets, and updates apply while the player is idle.
`src/build-info.json` is a template for the generated release metadata.

For a product release, update the version/build in `package.json`, synchronize `package-lock.json`,
and add the newest player-facing entry in `src/data/whatsnew.js`. The notes are capped at five entries.
Run the standard gate and the relevant visual/audio checks before merging.

## Deployment

`.github/workflows/test.yml` validates pull requests. `.github/workflows/pages.yml` builds and deploys
`dist/` when `main` changes. GitHub Pages must use GitHub Actions as its source. The optional verification
workflow runs manually and retains its output as a temporary artifact.
