# Riftline 3.61 — consistency review and update

Review date: 3 November 2026. Baseline: `d97857e9270dc88835740750b7d20ea7fe35c091` (3.60.0).

## Scope and evidence

The request was to review the whole game against explicit criteria and update it, with priority on unequal
biome and effect quality. This update addresses the rendering and verification problems found in that review.
It keeps the six place identities, simulation rules, saves, progression and synthesized audio architecture.

Evidence is source inspection, fixed-seed in-engine screenshots of all six biomes and their bosses, desktop
and landscape-touch browser checks, renderer counters and automated simulation/save/data tests. This is
not a listening review, a real-device performance benchmark or a complete human playtest. A larger engine
migration or new progression mechanic would need different evidence; neither follows from these findings.

## Criteria

Visual scores are reviewer judgments, not instrument measurements. A score of 1 means a missing or broken
layer, 2 means conspicuous inconsistency, 3 means usable with visible limitations, 4 means coherent in the
reviewed scenes, and 5 requires confirmation in live fights on real target devices. This review cannot award 5.

| Criterion | Weight | Acceptance question |
| --- | ---: | --- |
| Combat readability | 40% | Do silhouettes, type colours and dangerous areas read before decorative lines? |
| Material/detail quality | 25% | Does the floor suggest the place's material at the actual play camera, without a dominant generic grid? |
| Atmosphere and identity | 15% | Are lighting, weather and colour coherent and distinct, including at lower quality? |
| Render efficiency | 20% | Does static detail avoid unnecessary per-object drawing and leave room for combat effects? |

The render-efficiency score uses the regular encounter's measured draw calls: at most 80 = 4, 81–100 = 3,
101–130 = 2, above 130 = 1. This is a comparison threshold for these identical scenes, not an FPS promise.
The weighted score is `0.40 × readability + 0.25 × material + 0.15 × atmosphere + 0.20 × efficiency`.

## Findings and changes

1. **The old screenshot coverage was incomplete.** The biome and attack suites copied a normal run's route,
   which contains only four of six places. Both now explicitly enumerate the six-place matrix. Glass Flats
   gets a dedicated attack stage using the Glasswyrm's stomps/rain and local enemy hazards. The new
   `npm run audit:visual` records twelve fixed-run-seed scenes per profile and a machine-readable metrics file.
2. **Floor detail and combat used the same visual emphasis.** Bright, continuous ice, hex, marsh and glass
   contours competed with warnings. The Shelf now has broken hairline fractures buried by snow and wind
   grain. The Core has mottled slate tiles, quieter bevels, sparse lit seams and dimmer decorative runes.
   Marsh veins, molten bounce and glass joints are calmer. Asphalt puddles and glass get fine surface grain.
3. **Biome coatings erased enemy identity unevenly.** In the marsh, caldera and void, the skin shader could
   replace most of the enemy's base light. All six coatings now share 42% coverage, preserving type colours
   while retaining frost, wet sheen, embers and rim light. The hit flash is applied afterwards at full strength.
4. **Weather was difficult to compare or tune.** Six separate hand-coded branches have become named layer
   data with emission rate, lifetime, size, colour, drift and drag. The nominal emission rates are preserved;
   several formerly identical particles now have small size variation. Rates × lifetimes make sustained
   occupancy comparable even though rain lives far less time than snow.
5. **Decorative effects competed for the combat pool.** Atmosphere density now falls with pool pressure,
   and weather, prop emissions and skin motes stop adding particles at 30% total occupancy. Hits and other
   combat effects still use the full pool through the existing admission rules. This is priority admission,
   not eviction: weather already alive expires naturally.
6. **Static detail had unequal CPU/draw cost.** Compatible opaque siblings are baked per material, including
   scenery and boss body parts. Transforms and indexed geometry are preserved. Spinning objects, animated
   parent groups, instancing, shader materials and translucent surfaces retain their identities. Geometry
   attribute signatures prevent incompatible merges. Translucent ice/glass bosses retain more meshes;
   a universal “7–10 boss meshes” target would be misleading here.

7. **The mobile boss bar crossed the boss model.** The 520 px header bar occupied the upper fight area
   on an 844 × 390 screen, cutting through the staged boss and competing with wave/combo readouts.
   On landscape phones it now sits low between the sticks, at most 42% of the viewport width, with a
   compact label and bar. The visual matrix asserts its bounds so this fix cannot silently disappear.

## Scores and measured results

The following scores apply to the reviewed fixed scenes. In particular, an unchanged City score means
its smaller surface refinement did not justify moving a whole rubric level. Other places had larger gaps.

| Biome | Readability | Material/detail | Atmosphere | Efficiency | Weighted score / 5 |
| --- | --- | --- | --- | --- | --- |
| Blackout City | 3 → 3 | 3 → 3 | 4 → 4 | 4 → 4 | 3.35 → 3.35 |
| The Aurora Shelf | 2 → 3 | 3 → 4 | 4 → 4 | 3 → 3 | 2.75 → 3.40 |
| The Shattered Core | 2 → 3 | 2 → 3 | 3 → 3 | 2 → 3 | 2.15 → 3.00 |
| Ashfall Caldera | 2 → 3 | 3 → 3 | 4 → 4 | 2 → 4 | 2.55 → 3.35 |
| The Glowmarsh | 2 → 3 | 3 → 3 | 4 → 4 | 1 → 4 | 2.35 → 3.35 |
| The Glass Flats | 3 → 3 | 3 → 4 | 4 → 4 | 2 → 3 | 2.95 → 3.40 |

Each arrow is baseline → update. These judgments should be revisited after real-device playtesting.

| Biome | Regular encounter draw calls | Reduction | Boss scene draw calls | Boss mesh count |
| --- | ---: | ---: | ---: | ---: |
| Blackout City | 60 → 60 | 0% | 65 → 56 | 28 → 19 |
| The Aurora Shelf | 90 → 82 | 9% | 89 → 82 | 33 → 33 |
| The Shattered Core | 110 → 92 | 16% | 78 → 63 | 18 → 12 |
| Ashfall Caldera | 110 → 72 | 35% | 98 → 56 | 32 → 17 |
| The Glowmarsh | 151 → 76 | 50% | 108 → 60 | 38 → 17 |
| The Glass Flats | 113 → 85 | 25% | 78 → 71 | 30 → 30 |

Recorded in Chromium 141 / SwiftShader at 1440 × 900, DPR 1, High, with the same run seed and staged
enemy composition. The scene is paused; transient weather and some effect-pool draws vary, so small one-call
differences are not significant. Draw-call savings are not equivalent to FPS gains. Some triangle counts
increase because a merged mesh is culled as one object. No golden simulation fixtures were changed.

## Whole-game systems review

| Area | Assessment | Decision in this update |
| --- | --- | --- |
| Six biomes and bosses | All have floor, obstacles, hazards, lighting, music and an assigned boss; visual emphasis and cost varied substantially | Apply the shared visual standard and cover all six in the screenshot tools |
| Weapons, upgrades, waves and economy | Existing simulation, data audit and fixed-seed tests provide substantial behavioral coverage | Keep balance stable while improving the visibility of combat |
| Enemy/boss tells | Dedicated attack views and warning geometry already exist; these need contrast against the ground | Preserve warning geometry and timing; quiet the competing floor and skins |
| Desktop and touch UI | Separate responsive layouts and input regression suites exist | Check desktop and landscape touch; do not add another settings switch for an automatic effect budget |
| Saves and offline play | Sanitization, resume and PWA suites already exist | Retain storage schema and validate old saves/offline boot |
| Audio | Biome themes, synthesized effects and audio tests exist | Run available checks; no subjective sound rating without listening |
| Performance | Mesh count and particle occupancy are actionable; software WebGL cannot predict phone GPU speed | Batch static geometry and prioritize combat effects; report draw calls separately from FPS |
| Quality assurance | Extensive tests, but route-based screenshots missed two places | Add full-biome matrix and geometry/atmosphere contract tests to `npm test` |

## Test policy update

The follow-up request explicitly asked to reduce redundant and slow tests. `TESTING.md` now defines
the short standard gate and explicit specialist checks. The optional deep tool is audio
correctness only, uses bounded browser chunks and a functioning CI cache; it completed 361 sounds,
18 music renders and 36 budgets in 250.4 s. Historical gameplay regressions and sound-design analysis
are separate tools. Two overlapping screenshot scripts were removed in favour of the full matrix.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm test
npm run lint
npm run format:check
npm run audit:visual
npm run release-check
```

For a GPU-less host, prefix browser commands with `RIFT_RENDERER=swiftshader`. The fixed-scene matrix writes
`verification-output/current-pc/` and `verification-output/current-land/`, including `metrics.json`. It pins the
run seed and places a fixed ring of eight enemy types around the drone; boss scenes put the boss at the
same relative location. It advances the renderer manually while simulation is paused. Weather uses visual
randomness, so particle counts and individual glints are not pixel-identical between builds. These are
controlled composition checks, not moving-fight benchmarks. The new desktop/touch flows complement them; old attack-view scripts were removed.

## Remaining limits

- The camera primarily shows the playing field, so distant scenery still contributes less than it could.
  More authored landmarks would be a larger art pass, rather than another uniform brightness increase.
- The Frost Prism and Glasswyrm intentionally retain translucent and articulated pieces. Combining those
  requires explicit transparency/animation work and cannot use the opaque merger safely.
- Batching changes frustum granularity: a visible combined object can draw more triangles than separately
  culled pieces. The draw-call savings below must not be presented as an equivalent percentage FPS gain.
- Real-device thermal behavior, touch comfort, long-run readability and listening remain acceptance work.

## Test reset after the visual review

The measurements above describe the completed graphics pass before the final test reset. Historical
golden checks and old E2E chains are removed. `docs/TESTING.md` describes the smaller replacement;
previous test timings and coverage are not claims about this new suite.
