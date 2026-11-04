# Riftline — current plan

## Direction

Riftline is a touch-only landscape game for phones and tablets. Keep gameplay, readable warnings,
biome art and audio coherent. Keep routine checks short and run specialist checks only when relevant.
The owner merges pull requests. Work must remain cumulative with the 3.61.0 graphics/test cleanup.

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
- GitHub integration and publication: the owner applies the cumulative patch and merges after checks.

## Historical decisions

[Earlier roadmap](archive/ROADMAP-through-3.61.md) records prior decisions and superseded test policies.
[Testing](TESTING.md) is the current command/coverage reference. [Visual review](VISUAL-REVIEW-3.61.md)
records the previous art pass and its measurement limits.
