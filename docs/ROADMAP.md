# Riftline — current plan

Riftline is a touch-only landscape game for phones and tablets. Keep the painted world, actors,
weapons and sound coherent, warnings readable, and rendering/audio allocation bounded. High detail
is standard, with 30/60/120 FPS caps and 60 FPS by default. The owner merges reviewed pull requests.

## 4.2 combat identity and cleanup

- Seven weapon treatments: branching arcs, flame ribbons, clipped rail lances, pellet tracers,
  pulse bolts, rocket exhaust and machined returning blades.
- Matching projectiles, elemental attacks, motion, summons and sound for every current boss/enemy.
- Volcanic Tyrant geometry, restrained biome coatings and atlas-based surface relief on painted models.
- Natural Caldera magma/ember traps and Flats glass mines with unchanged gameplay dimensions.
- Delete retired content and its models, AI, rewards and sound entries. Remove Codex, Daily/Weekly
  challenges, pacts and boss training; prioritize normal runs, upgrades and achievements.
  Convert existing saves into current content using a small import boundary.
- Preserve seeded layouts, collision, damage and timing; exercise actual boss state machines and render
  their attacks. Keep normal checks short and specialist GPU/audio checks optional and bounded.
- Record the applied improvement prompt, changes, checks and rendered/audio evidence in the
  [combat review](COMBAT-REVIEW-4.2.md).

## Existing foundations

- The [4.1.1 checkup](CHECKUP-4.1.1.md) covers the connected walker, biome cleanup and material impacts.
- The [4.1 art review](ART-REVIEW-4.1.md) covers painted worlds, equipment, physical recordings and FPS controls.
- The [geometry audit](GEOMETRY-AUDIT-4.0.md) covers transformed geometry across 252 maps and all director modes.
- [Testing](TESTING.md) is the current command, coverage and deadline reference.

## Manual acceptance

Physical iPhone/iPad/Android pacing, heat, speaker balance and long-session behaviour still need device
play. Scripted scenes cannot establish fun or fairness. Full published-release update acceptance stays
with the owner; do not merge or publish automatically.
