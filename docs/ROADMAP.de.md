# Riftline — current plan

## Direction

Riftline is a touch-only landscape game for phones and tablets. Keep gameplay, readable warnings,
biome art and audio coherent. Keep routine checks short and run specialist checks only when relevant.
The owner merges pull requests. Work remains cumulative with the 3.61.0 graphics/test cleanup.

## 4.1.1 follow-up: walker, biomes and impacts

- Rebuild the player around an attached stabilized weapon bearing, with new armor, legs, feet and muzzle placement.
- Remove unowned floor rings, decal discs, Caldera lamps/studs and duplicate natural-biome pedestals; sculpt ice and glass props.
- Carry target material through damage events into impact sound and particles; keep critical hits in the same material family.
- Keep the drawing buffer when adjusting settings; remove retired graphics-tier shaders and unused mouse projection.
- Align startup diagnostics with the FPS controls and assert their results in the browser flow.
- Watch source, public assets and release metadata in development, with serialized rebuilds.
- Refresh current audio/pacing documentation; retain the required patched dependency overrides and useful verification tools.

## 4.1 world, equipment and sound update

- Painted terrain across all six biomes; material-specific armor, steel, hide, bark and crystal finishes on characters, bosses and scenery.
- Matching painted equipment panels and quieter menu accents, preserving rarity signals and touch layout.
- High detail by default, with a 30/60/120 FPS cap replacing Auto/Saver and 60 FPS as the default.
- Baked ground contact and a directional shadow pass; layered walker armor, detailed barrels and physical projectile/effect treatment.
- Rebuilt SFX and place accents around a compact CC0 recording bank, damped physical bodies and bounded buffer reuse.
- Sculpted basalt, smaller street covers, quieter ice surfaces and translucent dust vortices.
- The [art review](ART-REVIEW-4.1.md) records the art brief, actual game comparisons and resource cost.

## V4 visual update

- Six-biome terrain and material redesign with city streets, wind-shaped snow, broken marsh colonies, fractured Core slabs, localized volcanic seams and glass deposits in sand.
- Collision-aligned architecture and distinct landmarks, richer street props, readable hazard metal and a brighter walker chassis.
- Full transformed-geometry audit across 252 maps, every director mode and all edge/corner views: [geometry review](GEOMETRY-AUDIT-4.0.md).
- Full scope and visual acceptance are documented in [the v4 review](V4-VISUAL-REVIEW.md).

## Implemented in 3.64.0

- Exact cover intersections for beams, aim lines and gadget targeting, including close-wall landing and beam endpoint protection.
- Steady outlined charge lanes and sniper locks; a more readable sniper scope and lens.
- Protect every mapped charge/aim cue under voice pressure, with revised charger/leaper recipes.
- Visual review adds charge/sniper scenes and skips discarded settling draws while retaining real final pixel rendering.
- Review criteria, the applied improvement prompt, before/after captures, audio reel and verification are in [the review](REVIEW-3.64.md).

## Implemented in 3.63.0

- Six material floors with relief normals and directional sheen in one pass.
- New walker torso/shoulder armor, planar chamfers and metal highlights on actors and substantial props.
- Compact muzzle jets, directional hit sparks, twin dash trails and shorter Nova ions.
- Redesigned weapon, hit, explosion, Dash and Nova sound layers.
- Before/after contact sheets, walker previews and a sound reel in [the design review](DESIGN-3.63.md).
- Closed-geometry/bounds checks for armor and generated kits; quality and actual-drawing acceptance tracked in the review.

## Implemented in 3.62.0

- Protect open dialogs from idle updates, including app backgrounding.
- Recover held saves through confirmed import/reset; report write failures and retain previous progress.
- Preserve the card RNG across resumed choices, rerolls and banishes.
- Finish touch-only action filtering; use the map-hazard armour rules for dust devils.
- Count current Codex discoveries and retain remembered retired bosses/Overdrives in an archive.
- Add boss training for all six arenas and three starting pattern stages, with a fixed kit and no profile rewards.
- Add steady two-tone warning outlines, hostile-shot footprints and quieter Marsh/Core floor seams.
- Protect sniper, beam and trap warning voices and duck the background mix briefly.
- Correct the biome mix fixtures and place-sound peak checks; remove decorative rendering from audio probes.
- Add targeted save/choice regressions, first-run touch/audio/background coverage and practice isolation checks.
- Refresh dependencies and the action pin, include scripts in formatting, and remove the already-applied patch.
- Explain wave checkpoints on Home. A saved card choice still resumes at the choice itself.

## Implemented in the cumulative 3.61.0 update

- Six-biome material/weather pass, static batching, Shattered Core landmark and mobile boss HUD.
- Beam warning lanes, prioritized boss sounds, first-card hint and accurate death recap.
- Removed historical test chains, dead audio helpers and controller/keyboard/mouse gameplay.
- Phone haptics retained; phone multitouch and tablet player flows replace desktop gameplay tests.
- Content-addressed bundles and scope-specific offline snapshots; previous-bundle lookup and failed-install cleanup.
- A short browser regression for real service-worker updates, alongside the offline saved-run flow.
- Bounded optional verification/probe commands and retained visual CI artifacts.
- Visual audit supports High, Auto and Saver on phone/tablet layouts.

## Still requires acceptance

- Actual iPhone/iPad/Android frame pacing, heating, speaker mix and background/resume behaviour.
- Visual review of every boss attack/phase, not just the encounter snapshots.
- Long-session memory and late-wave balance with actual play; scripted checks cannot establish fun or fairness.
- GitHub integration and publication: the owner merges the reviewed branch after checks.

## Historical decisions

[Earlier roadmap](archive/ROADMAP-through-3.61.md) records prior decisions and superseded test policies.
[Testing](TESTING.md) is the current command/coverage reference. [Visual review](VISUAL-REVIEW-3.61.md)
records the previous art pass and its measurement limits.
