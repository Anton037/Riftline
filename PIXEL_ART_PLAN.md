# Riftline â€” Modern Atmospheric Pixel-Art & Audio Overhaul Plan

**Art Direction:** Modern, atmospheric 3D pixel art inspired by *Dead Cells* and *Inscryption* â€” partially pixelated 3D silhouettes with crisp sub-native texel alignment, stepped cel/toon lighting with ordered Bayer dithering, moody dark palettes, vibrant HDR bloom over emissives, tactile surface grain, and deep atmospheric fog. Smooth 60+ FPS animations and razor-sharp combat readability across desktop and mobile.

**Audio Direction:** Atmospheric dark electronic music with subtle chiptune lead/arp accents, warm analog-style dark synths, and cohesive biome-specific themes + punchy stylized SFX.

---

## Phase Ownership

- **Phase 1 (GLM-5.3 â€” Foundation & Showcase):**
  - Architectural plan & visual style guide (`PIXEL_ART_PLAN.md`)
  - Shared pixel-art color & palette registry (`src/render/biome-palettes.js`)
  - Shared pixel-art shader primitives & canvas textures (`src/render/pixel-art.js`)
  - Low-res offscreen HDR render target + HDR bloom + filmic tone-mapping + ordered dithering + nearest-neighbor crisp upscale pipeline (`src/render/pixel-pipeline.js`)
  - Material-level stepped lighting, rim highlights, ordered dithering & crisp atlas sampling (`src/render/world-material.js`)
  - Floor shader quantized lighting & atmospheric dither (`src/render/surface-shader.js`)
  - Integration in `src/render/renderer.js` and `src/render/materials.js`
  - Representative demonstration in **Blackout City (`city`)** with player walker, early enemies, and combat effects
  - Audio overhaul hook (`src/audio/music-params.js` wired into `src/audio/sound.js`)
- **Phase 2 (GLM-5.3-Flash â€” Full Content Rollout & Audio Overhaul):**
  - Remaining 5 biomes (`shelf`, `marsh`, `core`, `caldera`, `flats`) visual polish, prop/texture styling & palette tuning
  - Full enemy roster, bosses, weapons, projectiles, traps, hazards, and boss-card effects visual styling
  - Menus, HUD & UI pixel-art / Inscryption-inspired dark-tactile styling
  - Complete soundtrack & SFX overhaul using `src/audio/music-params.js` and `src/audio/sound.js`

---

## Visual Style Guide

### 1. Pixel Density & Resolution Scaling
- **Internal Render Resolution:** Target a vertical pixel height of **~360â€“440 logical pixel rows** (`targetHeight = clamp(round(cssHeight / pixelSize), 270, 540)`), where `pixelSize` is computed dynamically from viewport height (`~2.5` CSS px on 900pâ€“1080p desktop, `~2.0` CSS px on mobile landscape) so pixels feel consistent and finely detailed (Dead Cells-density, never chunky 8-bit blocks).
- **Upscaling:** `NearestFilter` on the low-res `WebGLRenderTarget` color texture; composited cleanly to the full native-DPR WebGL canvas in a single fullscreen pass.
- **UI & Overlay Layer (`#ov`):** Remains at full native resolution so typography, damage numbers, card descriptions, and touch joysticks stay razor-sharp (matching *Dead Cells* / *Celeste* crisp UI over pixel world).

### 2. Lighting & Shading Model
- **Three-Tier Lighting:**
  1. **Stepped Diffuse & Specular (`world-material.js`):** Quantize diffuse luminance into **4 smooth-stepped tonal bands** (`0.18, 0.45, 0.78, 1.0`) blended with a **4Ã—4 Bayer dither matrix** (`ditherStrength ~ 0.14`) so curved and chamfered armor faces transition with crisp pixel-art dithering rather than flat plastic gradients.
  2. **Stylized Fresnel Rim Light:** Biome-tinted rim highlight (`pow(1 - NÂ·V, 2.6)`) separates dark player/enemy silhouettes from dark atmospheric arenas.
  3. **Ordered Dithered Fog & Vignette:** Screen-space Bayer dither applied before final quantization eliminates dark-gradient banding in *Inscryption*-style shadow zones.
- **Shadows:** `PCFShadowMap` rendered at 1024Â² with softened contact occlusion (`ground-occlusion.js`), stepped cleanly on the floor shader.

### 3. Color Palettes & Atmosphere (`src/render/biome-palettes.js`)
Every biome defines:
- `shadowTint` (deep moody shadow color for shadows/dark areas, never pure dead `#000000`)
- `midTint` (ambient atmosphere tint)
- `highlightTint` (warm/cool specular & bloom key)
- `rimColor` (silhouette separation rim color)
- `grade`: `{ contrast, saturation, lift, bloomThreshold, bloomStrength, dither }`

| Biome | Mood & Inspiration | Shadow Tint | Key / Rim Accent | Bloom Character |
|---|---|---|---|---|
| **Blackout City (`city`)** | Rain-slick noir neon, sodium streetlamps, emergency crimson | `#090d16` | Rim `#6ea8d6`, Accent `#ff334a`, Amber `#ffaa44` | Strong wet reflections, crimson/amber glows |
| **Aurora Shelf (`shelf`)** | Glacial twilight, boreal cyan/emerald shimmer | `#081326` | Rim `#7ce8ff`, Aurora `#5ff0b8` | Soft icy scatter & aurora veil bloom |
| **Glowmarsh (`marsh`)** | Toxic bioluminescent bayou, obsidian peat & spore mist | `#061310` | Rim `#4be8a8`, Spore `#88ff5e` | Vivid teal/lime spore & algae bloom |
| **Shattered Core (`core`)** | Astral obsidian void, cracked violet monoliths, cyan rifts | `#0d0919` | Rim `#b884ff`, Rift `#58d8ff` | Crisp arcane core & rift-line bloom |
| **Ashfall Caldera (`caldera`)** | Basalt soot, incandescent magma fissures, drifting embers | `#160b0a` | Rim `#ff7a3c`, Magma `#ff4414` | Intense hot ember & fissure bloom |
| **Glass Flats (`flats`)** | Sun-bleached ochre dusk, turquoise sea-glass shards | `#1c140d` | Rim `#ffdca8`, Glass `#64d8c8` | Warm dusty shimmer & specular glints |

### 4. Textures & Materials
- **Atlas Filtering:** `terrain-atlas.webp` and `surface-atlas.webp` sampled with `NearestFilter` (`generateMipmaps = false`) for crisp pixel texture fidelity instead of blurred bilinear texels.
- **Procedural Particle/FX Textures (`pixel-art.js`):** Pixel-snapped 64Ã—64 / 32Ã—32 glow, spark-diamond, contact-shadow, and ring textures with `NearestFilter` / `magFilter = NearestFilter`, replacing smooth airbrush gradients with crisp pixel-art sprites.
- **Emissive HDR Discipline:** Additive VFX and glow layers (`toneMapped: false`) render > 1.0 into the `HalfFloatType` scene buffer so the bloom pass creates authentic *Dead Cells*-style atmospheric light halos around shots, sparks, lamps, and enemy cores.

### 5. Combat Readability Rules
1. Player walker, active projectiles, hazard telegraphs (`warnColor`), and enemy glowing eyes/cores sit above the shadow-tinted grade and trigger HDR bloom.
2. Enemy hit flashes (`aFlash`) punch sharply to warm white without blowing out silhouettes.
3. Bloom threshold (`~0.72â€“0.85`) ensures arena floor textures never smear or wash out gameplay telegraphs.

---

## Implementation Status & Roadmap

### Phase 1 â€” Completed in This Branch (`pixel-art-overhaul`)
- [x] Codebase audit & architectural plan (`PIXEL_ART_PLAN.md`)
- [x] `src/render/biome-palettes.js` â€” Per-biome pixel-art palette, rim, and post-grade definitions (`BIOME_PALETTES`, `PIXEL_MATERIAL_UNIFORMS`, `applyBiomePaletteUniforms`)
- [x] `src/render/pixel-art.js` â€” Shared GLSL snippets (`GLSL_BAYER4`, `GLSL_STEPPED_GRADE`, `GLSL_NEUTRAL_TONEMAP`, `GLSL_LINEAR_TO_SRGB`) and crisp nearest-neighbor procedural sprite textures (`makePixelGlowTexture`, `makePixelShadowTexture`, `makePixelSparkTexture`)
- [x] `src/render/pixel-pipeline.js` â€” Offscreen `HalfFloatType` low-res target, dual-pass separable HDR bloom, Khronos Neutral tone mapping + Bayer 4Ã—4 dithering + biome grade composite pass (`PixelPipeline`, `computePixelResolution`)
- [x] `src/render/world-material.js` â€” Stepped 4-band lighting (`pxStepLight`), Bayer 4Ã—4 dithering, and biome rim highlight (`uPxRimColor`/`uPxShadowTint`/`uPxRimStrength`) integrated into `paintMaterial`, preserving `art.test.mjs` shader-composition idempotence
- [x] `src/render/surface-shader.js` â€” Quantized floor diffuse/specular lighting, Bayer 4Ã—4 dithered transitions, and stepped dynamic flash light falloff
- [x] `src/render/renderer.js` â€” Wired `PixelPipeline`, switched `terrainAtlas`/`finishAtlas` & procedural textures to `NearestFilter`, wired per-biome palette uniform updates in `setBiome()`, and replaced airbrush sprite textures with crisp pixel-art sprites
- [x] `src/audio/music-params.js` & `src/audio/sound.js` â€” Central per-biome music parameter registry (`MUSIC_BIOME_PARAMS`, `getBiomeMusicParams`) wired into `SoundEngine` chord/voice tables and step context (`c.scale`, `c.synthStyle`)
- [x] `tests/render.test.mjs` â€” Added resolution, palette coverage, and music-param contract assertions

---

## Phase 2 â€” Completed (this branch, commits `fe2b93a`+)

### 1. Remaining Biomes Visual Overhaul â€” âœ… Complete
- `src/render/biome-palettes.js`: regraded **shelf** (contrast 1.07â†’1.12, vignette 0.28â†’0.34: deeper glacial twilight) and **caldera** (bloom 0.48â†’0.5, contrast 1.11â†’1.16, saturation 1.12â†’1.2, vignette 0.36â†’0.38: hotter, moodier ash); `city`, `marsh`, `core`, `flats` verified and kept.
- Floor shader pixel shading is shared across all six styles (stepped diffuse/specular + Bayer dither), so every biome benefits without per-style edits. `aurora.js` curtains already quantize through the composite pipeline.
- **Verification:** `node tools/verify.js visual p2a tablet all 60` â€” 24 scenes, zero errors; inspected screenshots for all six biomes; `p2b` re-verification of shelf/caldera after regrade. Combat readability (warning rings, telegraphs, hazard pools, boss silhouettes) confirmed crisp in every biome.

### 2. Combat VFX Pixel Pass â€” âœ… Complete (targeted, test-safe)
- `src/render/weapon-effects-view.js`: flame ribbon shader now steps heat into 4 bands and dithers the alpha edge with `GLSL_BAYER4` (`flameRibbons` confirmed drawing in `verify:combat`).
- `src/render/aegis-material.js`: shell alpha quantized into 4 pixel-grid steps (center stays smooth below the 0.02 threshold).
- `src/render/smoke-view.js` left as-is: its grain texture is already discrete noise; further dithering adds cost with no visible gain (documented decision).
- `src/render/attacks-view.js` marks/beams left on `LinearFilter`: warnings are gameplay-critical; soft edges keep telegraphs readable at phone distance (documented decision).
- Models (`models.js`) intentionally unchanged: triangle budgets (â‰¤810 enemy / â‰¤3000 player) and aim contracts are load-bearing; bloom + rim lighting already deliver silhouette separation.

### 3. Menus, HUD & UI Pixel Pass â€” âœ… Complete
- `src/index.html`: new final cascade block â€” crisper 8px notches, 2px stepped panel/btn keylines with pixel-shadow, pressed states, header text-shadow, and a CSS-only ordered-dither vignette on `#home` and overlay screens (HUD/gameplay surfaces untouched; no hit-target changes).
- **Verification:** `tools/capture-home.mjs` (new one-off, kept as a utility) â€” home screen captured, no console errors, legibility confirmed.

### 4. Soundtrack Overhaul â€” âœ… Complete (architecture-preserving rework)
- `src/audio/sound.js`: new `electronicTextureLayer(e, c)` under every fight and boss track:
  - **dark synth bed**: two detuned saws (Â±`subDetuneCents`) an octave under the root + a fifth below, low-passed to the biome's `padCutoff`, swelling over each chord on the pump bus (sidechain breathes with the drums);
  - **chiptune arp**: pulse square two octaves up walking the biome's `scale` every `arpSubdiv` sixteenths, intensity-scaled (`L`), driven harder with boss `heat`, echoing on the delay bus; boss tracks add an octave-down saw stab every fourth arp cell.
- Per-biome identity retained through each biome's own motif voice, pad, bed and chords; the new layer unifies everything into the modern dark-electronic + chiptune style requested.
- `MUSIC_BIOME_PARAMS` (`src/audio/music-params.js`) now drives scales/synth styles/track metadata; `c.kind` added to the step context.
- **Verification:** `npm run verify:audio-budget` â€” all six biomes' calm/boss/flood scheduling matches the real-node reference; `npm run test:unit` audio suites pass.

### 5. SFX
- Kept: the recorded material-voice bank (`PhysicalVoices`) is already material-driven and passes all budget/flood checks; a full re-synthesis was judged higher-risk than value for this pass (documented decision). The music rework carries the atmospheric identity.

### Phase 2 Test Results
- `npm run format` / `npm run lint` â€” pass
- `npm run test:unit` â€” **67/67**
- `npm run e2e` + `npm run test:render` â€” **7/7** browser flows, zero console errors
- `node tools/verify.js visual p2a tablet all 60` â€” **24 scenes, zero errors**
- `npm run verify:combat` â€” **67 rendered scenes, zero errors**
- `npm run verify:audio-budget` â€” **pass (all six biomes)**

### Remaining Limitations / Optional Future Work
- Music is produced by the same motif skeleton with the new electronic texture; a from-scratch recomposition of all 12 themes was deliberately avoided to protect the audio regression suite and mix balance.
- SFX synthesis untouched (material voices remain); UI click/hover synth accents could be revisited later.
- `attacks-view.js` decal atlas keeps linear filtering for gameplay readability (see above).


## Phase 3 — Full Pixel-Art Menu & UI Redesign — ✅ Complete

Goal: repaint every menu surface (home, workshop, achievements, news, settings, upgrade choice,
pause, game-over, dialogs, toasts) in the same Dead Cells / Inscryption language as the 3D world,
while preserving every DOM id/class, layout geometry, touch hit target and test selector.

### What changed
- **Pixel display font** — `Press Start 2P` (OFL, 12.5 KB woff2) vendored into `public/fonts/`
  with its license (`OFL-Press-Start-2P.txt`), referenced by a new `@font-face` in `src/index.html`.
  Applied via one final CSS layer to eyebrows, section headers, titles, button labels, upgrade card
  names and levels, stat labels, chips and key numbers; Barlow keeps long body copy readable.
  It is precached by the service worker (`src/sw.js` `FILES`), so PWA offline sessions render it.
- **One final CSS layer** (`4.4.0 PHASE 3` block at the end of the `<style>` in `src/index.html`)
  that supersedes all earlier paint layers:
  - Panels, cards, rows, dialogs and toasts: flat stepped fills, chunky 2px bone frames
    (`#b7c7c2`), inset ink rims and a 3px top highlight band (clip-path notches eat outer shadows,
    so all depth is inset).
  - Buttons: banded two-tone fills, 2px bone border, `steps()` press feedback; primary actions get
    hard-banded teal (`START RUN`) and amber (continue) fills with dark inset bevels.
  - Upgrade cards: 5px rarity spine, framed icon boxes, crisp double-rim rarity outlines for
    rare/legendary/boss cards, pixel-face card titles and level tags, square boss seal.
  - Controls: square toggles with pixel-knob `steps()` travel, ticked slider tracks with square
    teal thumbs, hard-edged segmented buttons, square badges and scrollbar thumbs.
  - HUD bars: darker tracks with beveled (inset) fills that survive the scaleX drain transform.
  - Logo: hard stepped block shadow (no blur), amber/bone/teal rift line.
  - Menu atmosphere: 3px scanlines + 3px Bayer dither + vignette on every menu screen (pages and
    overlays, never over the HUD or the WebGL surface).
- **Device-size guards** — matching-specificity overrides keep the pixel face legible where the
  responsive layers retuned Chakra sizes (phone landscape `wc-name`, bottom nav, choose cards,
  desktop short windows), plus a `prefers-reduced-motion` fallback for the `steps()` transitions.

### Deliberately untouched
- All DOM ids/classes, grids, gaps, min-heights, hit targets, `window.__riftLayoutAudit()` contract,
  HUD combat readouts (native DPR), service-worker update flow, and the game bundle.
- 3D pixel resolution (`computePixelResolution`) unchanged from Phase 2 tuning (~360-440 rows).

### Phase 3 test results
- `tools/verify-ui.mjs` — new: 22 checks across desktop (1280x800) and phone landscape (844x390):
  pixel font loads, primary buttons and card titles use the pixel face, and the layout audit is
  clean (0 findings) on home, workshop, achievements, news, settings, the upgrade choice and pause
  on both viewports. All pass.
- `tools/capture-ui.mjs` — new: 14 screenshots (both viewports x 7 screens) to
  `verification-output/ui-redesign/`.
- `npm run format:check` / `npm run lint` — pass.
- `npm run test:unit` — 67/67 pass.
- `npm run test:render` — 7/7 pass (after adding the pixel font to the SW precache; the offline
  reload phase 504'd the uncached font before).
- `npm run e2e` — 7/7 pass.

## Phase 4 — Full Art Redesign: new assets in the Dead Cells × Inscryption language — IN PROGRESS

### Research basis (studied from the official store key art of both games)
- **Dead Cells** (store capsule): warm-vs-cool complementary scheme — blazing orange/ember accents against
  deep teal/indigo shadow masses; backlit silhouettes with strong rim light; atmospheric haze layers; near-black
  foreground shapes; tiny emissive details (glowing hand, eyes) carry enormous visual weight on a desaturated
  stone/metal base.
- **Inscryption** (store capsule): oppressive near-black green darkness; bone-cream, ember-amber and deep
  blood-red as the only bright notes; carved/woodcut texture; light is scarce and candle-local — pools of warm
  light surrounded by encroaching dark.
- Shared lessons for Riftline: **value structure first** (~70% dark, ~20% mid, ~10% bright), one saturated hero
  accent per biome, emissive economy, hard rim light, and surfaces that read as *carved/hand-made* rather than
  airbrushed.

### Self-improvement prompt (what "FULL redesign" means here)
"Rebuild the game's visual identity from the asset up. Not a filter pass: new floor plates, a re-imagined
player walker, re-imagined enemy skins and bosses, and per-biome color scripts aligned to the two references.
Keep gameplay, saves, and every test green."

### Scope & sequence
- **4A — Floors (this phase)**: generate a brand-new 3x2 terrain atlas (`tools/gen-atlas.mjs` -> `public/textures/`)
  of hand-authored pixel dungeon plates — Dead Cells slab construction (bold grout, slab shading, cracks,
  per-biome overlays) in Inscryption-dark values. Drop-in same tile layout (city 0,0 / shelf 1,0 / marsh 2,0 /
  core 0,1 / caldera 1,1 / flats 2,1), retuned procedural overlay colors in `surface-shader.js` so the shader
  finishing matches the new plates instead of fighting them.
- **4B — Player**: rebuild `buildPlayerModel` palette + silhouette details: deep indigo armor, teal trim, ember
  core glow (Dead Cells hero read), chunkier bevels, emissive eye/visor; weapon housings restyled to match.
- **4C — Enemies & bosses**: re-skin the 25 enemy palettes + 6 bosses toward biome-accent carapaces with
  emissive eyes/cores (per-instance glow tint already exists), darker mid-tones, stronger rim.
- **4D — Biome color scripts**: retune `RL_BIOME_LOOK` lights/fog + `BIOME_PALETTES` grades so each biome hits a
  reference mood (city: moonlit noir; shelf: cold teal night; marsh: bioluminescent dark; core: violet cathedral;
  caldera: ember forge; flats: hard noon glass).
- **4E — UI + capture verification**: screenshots per biome/phase into `verification-output/`, full test suite.

### Deliberately preserved (as in Phases 1-3)
Gameplay, progression, saves, all DOM ids/classes, HUD readability at native DPR, test selectors,
`computePixelResolution` tuning, and the Phase 3 pixel UI.
