# Development

## Code and assets

The game uses ES modules, Three.js and WebAudio. `src/main.js` owns the application lifecycle and
connects the simulation, rendering, audio, input and UI systems. `build.js` bundles the application and
copies the public assets into `dist/`. `npm run dev` watches source, public assets and package metadata;
rebuilds are serialized to avoid overlapping writes.

Keep gameplay randomness in the seeded simulation. Cosmetic randomness belongs in rendering and audio.
Save compatibility and stable seeded layouts have active regression fixtures in `tests/fixtures/`.
These fixtures protect existing progress and world generation.

Painted textures and the recorded sound bank are runtime assets under `public/`. Audio source URLs,
hashes and offsets are maintained by `tools/audio-sources.json`, `tools/build-audio-bank.py` and
`src/audio/source-bank.js`. The optional bank rebuild needs Python 3 and ffmpeg. Preserve the asset
credits and third-party notices that ship with the game.

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
