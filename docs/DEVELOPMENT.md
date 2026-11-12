# Riftline: development notes

How the code is organised and the rules for changing it. The README covers commands, structure and hosting;
release rules are maintained in README and this document.

## How the code got here

Riftline was released as one minified bundle (game code and three.js, built with esbuild) and then
patched by hand for several releases. The module sources the bundle was built from are not part of
the release, so the code was turned back into readable sources step by step:

- 2.4.3: three.js comes from npm (`three`, pinned to 0.187.0 / r187). Each module imports the
  classes it needs by their three.js names (`import { BoxGeometry, Mesh } from "three"`). Updating
  three.js means changing the version in `package.json`, running `npm install` and the full release
  checks.
- 2.4.4: the game code is split into ES modules under `src/`. `build.js` bundles `src/main.js`,
  everything it imports and three.js into one minified file.
- 2.4.5: readable top-level names: `game` (controller), `ui` (instance of `GameUI`), `store`
  (`SaveStore`), `renderer` (`Renderer`), `input` (`Input`), `sound` (`SoundEngine`), `World`
  (simulation), `weaponDefs`, `enemyDefs`, `bossDefs`, `upgradeList`/`upgradesById`,
  `workshopModules`, `milestones`, `threatLevels`, `biomeList`/`biomesById`, `computeStats`,
  `planWave`, `updateEnemy`, `buildLayout` … The imports at the top of each file say where a name
  comes from.
- 2.5.1: the patches of the content packs and later fixes (methods wrapped from outside, up to
  eight times) are folded into the classes and functions, so every method is in one place; local
  variables have readable names; the syntax tricks of the minifier (`!0`, comma chains,
  `a && f()` as a statement …) are plain statements; the self-tests originally had their own module (removed in 3.61.0); `window.__riftTest` uses the real names; Prettier (`.prettierrc`, width
  120) formats everything and CI checks it.

## Testing policy

`docs/TESTING.md` defines the current short standard gate and opt-in specialist checks. The optional audio
render no longer reruns all historical gameplay assertions; it uses bounded browser chunks and a passing
semantic cache. Run `npm run check` during development and the checks appropriate to the changed system.

## Working rules

- Every file starts with a comment that says what it contains. `main.js` imports every module.
- Change classes and functions directly, in the module that owns them; nothing is patched from
  outside. Keep a version comment (`// 2.5.1: …`) only where it explains why code looks the way
  it does.
- An imported binding cannot be assigned. Where one module sets a variable of another, the
  owning module exports a setter (`set_RL_RETIRE_NOTE(v)`).
- `tests/core.test.mjs` exercises deterministic seeds and input streams without stored golden outputs.
  Preserve reproducibility and add focused cases for observable regressions.
- `window.__riftTest` (end of `main.js`) exposes the game, UI, store, renderer, World and biome list for
  the browser tests and probes, plus the real startup health checks.
- `npm run format` formats the code; `npm run format:check` is what CI runs.
- `npm run dev` watches source, public assets and package metadata. Rebuilds serialize and coalesce
  changes received during a build to avoid overlapping writes to `dist/`.

## Versions

The version and build id exist only in `package.json` (`version`, `riftline.build`). The sources use
the placeholders `__RL_VERSION__`, `__RL_BUILD__`, `__RL_VERSION_DASHED__` and `__RL_GAME_FILE__`,
and `build.js` fills them in. That keeps the version contract the game checks at start-up
(HTML meta, script name, JS constants, build-info.json, service-worker cache) consistent. `build.js`
also fails if the service worker would precache a file that does not exist.

For a release: bump `version` and `riftline.build` in `package.json` together (the build id is
`r<version-digits>a<MMDD><letter>-r1`) and run `npm install` (so `package-lock.json` follows), add a player-facing entry
at the top of `src/data/whatsnew.js` (the News tab; `tests/core.test.mjs` checks that its first entry matches the
version), run `npm run release-check`, then run `npm run audit:visual` for a deliberate art review. Since 3.57.0 `src/build-info.json`
is only the identity the game fetches at every start: `build.js` writes just the version and the build id of it to
`dist/build-info.json`, so there is no per-release changelog to maintain there.

## Touch-only input and content identity (3.61.0)

Gameplay accepts touch pointers and on-screen actions only. No gamepad polling, controller haptics,
keyboard shortcuts or mouse aiming remains. Native browser form input is preserved.

The build derives the game bundle URL from its contents and derives the worker cache identity from
the bundle, HTML, worker source, public assets and release metadata. Rebuilding identical inputs is
stable; changing content changes the appropriate identity even without a version bump. Product
version/build constants still identify a release. Each service-worker scope owns separate caches;
the current and one previous complete snapshot are retained. Failed installs are discarded.
