# Riftline — Modern Atmospheric Pixel-Art & Audio Overhaul Plan

**Art Direction:** Modern, atmospheric 3D pixel art inspired by *Dead Cells* and *Inscryption* — partially pixelated 3D silhouettes with crisp sub-native texel alignment, stepped cel/toon lighting with ordered Bayer dithering, moody dark palettes, vibrant HDR bloom over emissives, tactile surface grain, and deep atmospheric fog. Smooth 60+ FPS animations and razor-sharp combat readability across desktop and mobile.

**Audio Direction:** Atmospheric dark electronic music with subtle chiptune lead/arp accents, warm analog-style dark synths, and cohesive biome-specific themes + punchy stylized SFX.

---

## Phase Ownership

- **Phase 1 (GLM-5.3 — Foundation & Showcase):**
  - Architectural plan & visual style guide (`PIXEL_ART_PLAN.md`)
  - Shared pixel-art color & palette registry (`src/render/biome-palettes.js`)
  - Shared pixel-art shader primitives & canvas textures (`src/render/pixel-art.js`)
  - Low-res offscreen HDR render target + HDR bloom + filmic tone-mapping + ordered dithering + nearest-neighbor crisp upscale pipeline (`src/render/pixel-pipeline.js`)
  - Material-level stepped lighting, rim highlights, ordered dithering & crisp atlas sampling (`src/render/world-material.js`)
  - Floor shader quantized lighting & atmospheric dither (`src/render/surface-shader.js`)
  - Integration in `src/render/renderer.js` and `src/render/materials.js`
  - Representative demonstration in **Blackout City (`city`)** with player walker, early enemies, and combat effects
  - Audio overhaul hook (`src/audio/music-params.js` wired into `src/audio/sound.js`)
- **Phase 2 (GLM-5.3-Flash — Full Content Rollout & Audio Overhaul):**
  - Remaining 5 biomes (`shelf`, `marsh`, `core`, `caldera`, `flats`) visual polish, prop/texture styling & palette tuning
  - Full enemy roster, bosses, weapons, projectiles, traps, hazards, and boss-card effects visual styling
  - Menus, HUD & UI pixel-art / Inscryption-inspired dark-tactile styling
  - Complete soundtrack & SFX overhaul using `src/audio/music-params.js` and `src/audio/sound.js`

---

## Visual Style Guide

### 1. Pixel Density & Resolution Scaling
- **Internal Render Resolution:** Target a vertical pixel height of **~360–440 logical pixel rows** (`targetHeight = clamp(round(cssHeight / pixelSize), 270, 540)`), where `pixelSize` is computed dynamically from viewport height (`~2.5` CSS px on 900p–1080p desktop, `~2.0` CSS px on mobile landscape) so pixels feel consistent and finely detailed (Dead Cells-density, never chunky 8-bit blocks).
- **Upscaling:** `NearestFilter` on the low-res `WebGLRenderTarget` color texture; composited cleanly to the full native-DPR WebGL canvas in a single fullscreen pass.
- **UI & Overlay Layer (`#ov`):** Remains at full native resolution so typography, damage numbers, card descriptions, and touch joysticks stay razor-sharp (matching *Dead Cells* / *Celeste* crisp UI over pixel world).

### 2. Lighting & Shading Model
- **Three-Tier Lighting:**
  1. **Stepped Diffuse & Specular (`world-material.js`):** Quantize diffuse luminance into **4 smooth-stepped tonal bands** (`0.18, 0.45, 0.78, 1.0`) blended with a **4×4 Bayer dither matrix** (`ditherStrength ~ 0.14`) so curved and chamfered armor faces transition with crisp pixel-art dithering rather than flat plastic gradients.
  2. **Stylized Fresnel Rim Light:** Biome-tinted rim highlight (`pow(1 - N·V, 2.6)`) separates dark player/enemy silhouettes from dark atmospheric arenas.
  3. **Ordered Dithered Fog & Vignette:** Screen-space Bayer dither applied before final quantization eliminates dark-gradient banding in *Inscryption*-style shadow zones.
- **Shadows:** `PCFShadowMap` rendered at 1024² with softened contact occlusion (`ground-occlusion.js`), stepped cleanly on the floor shader.

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
- **Procedural Particle/FX Textures (`pixel-art.js`):** Pixel-snapped 64×64 / 32×32 glow, spark-diamond, contact-shadow, and ring textures with `NearestFilter` / `magFilter = NearestFilter`, replacing smooth airbrush gradients with crisp pixel-art sprites.
- **Emissive HDR Discipline:** Additive VFX and glow layers (`toneMapped: false`) render > 1.0 into the `HalfFloatType` scene buffer so the bloom pass creates authentic *Dead Cells*-style atmospheric light halos around shots, sparks, lamps, and enemy cores.

### 5. Combat Readability Rules
1. Player walker, active projectiles, hazard telegraphs (`warnColor`), and enemy glowing eyes/cores sit above the shadow-tinted grade and trigger HDR bloom.
2. Enemy hit flashes (`aFlash`) punch sharply to warm white without blowing out silhouettes.
3. Bloom threshold (`~0.72–0.85`) ensures arena floor textures never smear or wash out gameplay telegraphs.

---

## Implementation Status & Roadmap

### Phase 1 — Completed in This Branch (`pixel-art-overhaul`)
- [x] Codebase audit & architectural plan (`PIXEL_ART_PLAN.md`)
- [x] `src/render/biome-palettes.js` — Per-biome pixel-art palette, rim, and post-grade definitions (`BIOME_PALETTES`, `PIXEL_MATERIAL_UNIFORMS`, `applyBiomePaletteUniforms`)
- [x] `src/render/pixel-art.js` — Shared GLSL snippets (`GLSL_BAYER4`, `GLSL_STEPPED_GRADE`, `GLSL_NEUTRAL_TONEMAP`, `GLSL_LINEAR_TO_SRGB`) and crisp nearest-neighbor procedural sprite textures (`makePixelGlowTexture`, `makePixelShadowTexture`, `makePixelSparkTexture`)
- [x] `src/render/pixel-pipeline.js` — Offscreen `HalfFloatType` low-res target, dual-pass separable HDR bloom, Khronos Neutral tone mapping + Bayer 4×4 dithering + biome grade composite pass (`PixelPipeline`, `computePixelResolution`)
- [x] `src/render/world-material.js` — Stepped 4-band lighting (`pxStepLight`), Bayer 4×4 dithering, and biome rim highlight (`uPxRimColor`/`uPxShadowTint`/`uPxRimStrength`) integrated into `paintMaterial`, preserving `art.test.mjs` shader-composition idempotence
- [x] `src/render/surface-shader.js` — Quantized floor diffuse/specular lighting, Bayer 4×4 dithered transitions, and stepped dynamic flash light falloff
- [x] `src/render/renderer.js` — Wired `PixelPipeline`, switched `terrainAtlas`/`finishAtlas` & procedural textures to `NearestFilter`, wired per-biome palette uniform updates in `setBiome()`, and replaced airbrush sprite textures with crisp pixel-art sprites
- [x] `src/audio/music-params.js` & `src/audio/sound.js` — Central per-biome music parameter registry (`MUSIC_BIOME_PARAMS`, `getBiomeMusicParams`) wired into `SoundEngine` chord/voice tables and step context (`c.scale`, `c.synthStyle`)
- [x] `tests/render.test.mjs` — Added resolution, palette coverage, and music-param contract assertions

---

## Phase 2 Instructions for GLM-5.3-Flash

Continue on branch `pixel-art-overhaul`. Keep all simulation mechanics, saves, mobile controls, and `tests/*.test.mjs` contracts intact. Run `npm run format && npm run lint && npm run test:unit && npm run test:render` after major changes, and use `node tools/verify.js visual <tag> tablet <biome> 60` + `read_image` to visually verify every biome.

### 1. Remaining Biomes Visual Overhaul
- **Files:** `src/render/biome-visuals.js`, `src/render/biome-props.js`, `src/render/surface-shader.js`, `src/render/biome-palettes.js`, `src/render/aurora.js`, `src/render/caldera-ridge.js`, `src/render/map-architecture.js`
- **Tasks:**
  1. Tune `BIOME_PALETTES` (`src/render/biome-palettes.js`) and `RL_BIOME_LOOK` (`src/render/biome-visuals.js`) for `shelf`, `marsh`, `core`, `caldera`, and `flats` after inspecting `node tools/verify.js visual p2 tablet all 60`.
  2. Add subtle pixel-quantized / dithered texture motifs to the floor shader styles (`st == 2, 3, 4, 6, 7` in `src/render/surface-shader.js`) and `aurora.js` curtains (stepped color bands + shimmer dither).
  3. Ensure `public/textures/terrain-atlas.webp` and `surface-atlas.webp` (or procedural shader detail layered over them) harmonize cleanly with `NearestFilter` across all 6 biomes without harsh tile seams.
  4. Keep `addBiomeDetail` and `addMapArchitecture` within all `tests/render.test.mjs`, `tests/art.test.mjs`, and `tests/map-geometry.test.mjs` spatial contracts.

### 2. Enemies, Bosses, Weapons & Combat VFX
- **Files:** `src/render/models.js`, `src/render/attacks-view.js`, `src/render/weapon-effects-view.js`, `src/render/ability-effects-view.js`, `src/render/hazards-view.js`, `src/render/traps-view.js`, `src/render/boss-cards-view.js`, `src/render/smoke-view.js`, `src/render/aegis-material.js`
- **Tasks:**
  1. **Models (`src/render/models.js`):** Sharpen silhouette contrast on player walker, enemies, and bosses (e.g., stronger accent emissive trim on eyes/cores so bloom makes threats pop in dark biomes). **Respect strict triangle budgets:** enemy kit `<= 810` tris, player `<= 3000` tris, and `weaponMount`/`turret`/`gun.position.x === -0.07` invariants tested in `tests/render.test.mjs`.
  2. **Projectiles & Shaders:** Update custom shaders in `weapon-effects-view.js` (`flameVertex`/`flameFragment`), `attacks-view.js` (`MARK_DRAW_FRAG` and beam/zone shaders — note `attacks-view.js` mark atlas uses `LinearFilter`, switch/step cleanly if pixelated decals look better), `smoke-view.js`, and `aegis-material.js` to use `GLSL_BAYER4` dithering and stepped alpha/color palettes so all VFX match the pixel-art world.
  3. **Boss Cards (`src/render/boss-cards-view.js`):** Preserve `BossCardView.event` shatter/splinter color distinctions tested in `tests/render.test.mjs`.

### 3. Menus, HUD & Inscryption-Inspired UI Polish
- **Files:** `src/index.html` (CSS styles), `src/render/overlay.js`, `src/ui/ui.js`, `src/ui/hud-layout.js`
- **Tasks:**
  1. Style cards, workshop panels, pause/settings modals, and boss bars with dark textured slate/parchment-iron borders, crisp pixel-beveled corners, subtle scanline/grain accents, and moody Dead Cells / Inscryption contrast while keeping high legibility and mobile touch hitboxes intact.
  2. Update `src/render/overlay.js` (2D `#ov` canvas: damage numbers, offscreen threat pointers, touch stick rings) to use crisp stepped styling aligned with the pixel-art world while remaining sharp at native DPR.

### 4. Soundtrack & SFX Overhaul
- **Files:** `src/audio/music-params.js`, `src/audio/sound.js`, `src/audio/physical-voices.js`, `src/audio/place.js`
- **Tasks:**
  1. Build out the new **atmospheric electronic + subtle chiptune + dark synth** composers inside `src/audio/sound.js` driven by `MUSIC_BIOME_PARAMS` (`c.scale`, `c.synthStyle` already injected into `c` in `note()`).
  2. Add pulse/duty-cycle chiptune voice helpers and detuned dark-synth pad/bass voices to `VOICE` / `kit()` in `src/audio/sound.js`, keeping `MAX_MUSIC_VOICES` and `MAX_VOICES` budgets safe.
  3. Create distinctive calm + boss themes for all 6 biomes (`city`, `shelf`, `marsh`, `core`, `caldera`, `flats`) and refresh weapon/hit/UI synth layers while preserving `tests/physical-audio.test.mjs` and `npm run verify:audio` / `npm run verify:audio-budget`.

### 5. Verification Requirements for Phase 2
- `npm run format:check` & `npm run lint` — must pass with zero issues
- `npm run test:unit` — all 67+ unit & geometry contract tests must pass
- `npm run e2e` & `npm run test:render` — all 7 Playwright browser flows (tablet, phone, desktop, offline SW update) must pass with zero console/page errors
- `npm run audit:visual` + `npm run verify:combat` + `npm run verify:audio` + `npm run verify:audio-budget` — visually inspect generated PNGs in `verification-output/` across all 6 biomes on both tablet and phone!
