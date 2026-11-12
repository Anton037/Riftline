# Touch-only follow-up review — 4 November 2026

This change is cumulative with the six-biome 3.61.0 update. The owner requested removal of all
controller support and clarified that Riftline is a touch-only game.

## Changes

- Removed gamepad polling, menu focus navigation, controller rumble, keyboard gameplay/shortcuts,
  mouse aiming and their hints/styles. Phone haptics and native browser form interaction remain.
- Standard gameplay tests now use a tablet and a landscape phone, with simultaneous sticks and dash.
- Bundle filenames hash JavaScript contents. Offline snapshot identities also cover HTML, public
  files, worker logic and release metadata; the manually maintained product version is not the cache key.
- New caches are isolated by service-worker scope. Failed installs are discarded, and the current
  and previous complete scoped snapshots are retained. Legacy bundle lookup uses full URLs.
- Optional verification and audio probes now share a temporary server, hard deadlines and process-tree
  cleanup. The formerly standalone audio fault probe now starts through the same working npm command.
- Music probe stage summaries skip unrendered tracks instead of dereferencing missing measurements.
- Visual review supports tablet/phone layouts and High/Auto/Saver. The manual workflow saves screenshots
  and metrics for download even when a check fails.
- Current commands and policy are consolidated in README and TESTING. Superseded roadmap proposals have since been removed.
  The shipped build-info source no longer contains obsolete feature claims and old release metadata.

## Evidence

- Standard gate: 13 passing tests, approximately 12 seconds including build on the development host.
- Actual rendering: all three browser checks pass, approximately 31 seconds including build.
- Visual matrix: 48 staged scenes (six biomes, regular encounter and boss, tablet High and phone
  High/Auto/Saver), with no reported browser/shader errors. This is not a screenshot-diff acceptance gate.
- Audio fault-recovery probe: passing, including scheduler failures and recovery.
- Build identity experiment: identical inputs yield identical IDs; an HTML-only change changes the
  snapshot identity while keeping the unchanged JavaScript URL. Original source restored after the experiment.
- Process cleanup experiment: a deliberately hung command with a nested child returns 124 at its
  deadline and leaves no running child.
- Additional simulation review: all six bosses exercised for 90 simulated seconds across high/mid/low
  HP, including enrage and all three Core phases; waves 50, 100 and 200 each exercised for 60 simulated
  seconds. Player/enemy state and sampled beam data remain finite. These ad hoc checks are not new
  mandatory suites and do not prove complete attack coverage or balanced difficulty.

## Remaining acceptance

Actual device FPS/heat, iOS background behaviour, phone-speaker listening, long-session memory,
visual acceptance of every attack and late-game balance still require device play. The worker fixture
checks actual browser installation/activation/offline fetches, but does not replace testing two
published full game releases. Changes are prepared locally for the owner's GitHub integration.
