# Riftline 5.2.9 quality audit

The starting point was 5.2.8. The audit combines real desktop and touch inputs in Chromium, staged rendered scenes, seeded simulation, and source review. Stage fixtures placed the game at specific waves or populated a long build. They exercise the actual controls, save paths, and rendering from those points.

## Confirmed findings

| Area | Reproduction and cause | Change and verification |
| --- | --- | --- |
| Graphics loss | Force `WEBGL_lose_context` during combat in an 800×450 viewport. On 5.2.8, the world advanced about 0.82 seconds in 800 ms with no graphics. Only the renderer responded to the browser event. | Pause the run, clear held inputs, stop processing frames, and block start and resume actions while graphics are missing. The regression restores the real context, checks that time stayed frozen, and resumes through the pause button. |
| Victory to Endless | Clear a staged wave 20 and click Endless. Read local storage in the same task. On 5.2.8 the active save was empty until the next animation frame. | Save the Endless reward immediately. The regression checks the stored offer, seed, and bank after a reload. |
| Continue labels | Reload a run after a Forge purchase or at a reward choice. The old labels advertised a wave and sometimes described the visit as a restart. | Continue identifies the Roadside Forge, Craft Choice, Boss Reward, or wave. The wave restart note appears on combat checkpoints. Browser checks cover the Forge purchase and opening Endless reward. |
| Tablet craft list | Open a long build during a reward on a 1024×768 touch viewport. The page-level gesture filter blocked the scrollable build strip and its details. | Allow natural scrolling in those two regions. The browser test swipes the list and opens a craft without selecting a reward. |
| Empty craft pool | Advance a seeded world whose crafts are exhausted with 3 HP missing or at full health. The payout message used the potential heal and could claim every craft was maxed. | Report the amount actually recovered and use a neutral message when the offer pool is empty. The regression checks the displayed HP amount and shard payout inputs in both cases. |

## Coverage

| System | Evidence |
| --- | --- |
| Desktop controls and on-screen cues | Chromium keyboard and mouse flow covering movement, aim without firing, aiming while firing, right-click dash, held key recovery, ability keys, input buffering, and an aligned Keeper, weapon, and ground arrow. Reticle and screen-edge cues have projection checks. |
| Phone and tablet controls | Fresh-start tutorial, first reward with a movement finger held, short-phone five-card offer, tablet build scrolling, both stick modes, rotation, pause and resume, and layout at multiple viewports. |
| Home and menus | Workshop purchases, locked weapon previews and trials, Records rewards, What's New, settings, layout editor, and pause, victory, death, retry, and return-to-home paths in the browser suite. |
| Combat, presentation, and maps | 24 rendered landscape-phone scenes across all six biomes. The combat probe rendered 68 cases covering all weapons, boss patterns, beams, and trap examples. The ability probe rendered 37 cases. The unit suite covers all 18 traps, 252 maps, all six bosses' recovery windows, projectile sources, muzzles, and collision checks. |
| Progression and pacing | Seeded tests cover wave transitions, Masterworks, Seal and reroll behavior, empty pools, and the wave-40 burst cap. Staged browser flows exercise the first rewards, Roadside Forge purchase, and the victory-to-Endless transition. |
| Storage and recovery | Save tests exercise old, partial, invalid and corrupt input, storage failures, and existing aliases. Browser checks exercise cross-tab progress, offline reload, exact reward and Forge restoration, and actual WebGL context recovery. The release check uses a real published service-worker update. |
| Audio and mix | Fresh track and mix probes covered all six biomes. Sun Dunes fight flatness was 0.147 against the 0.15 target. The 95th-percentile fight and boss music amplitudes in the mix were 17.4 dB and 7.2 dB below the combat effects comparison. The deep audio check reused a passing result with identical audio inputs. |
| Defensive review | Reviewed the changed input, checkpoint, and graphics recovery paths alongside the save and worker regressions. The npm dependency audit reported zero vulnerabilities. |

## Performance sample

The two builds ran in 568×320 Chrome touch emulation on SwiftShader with the same frame cap. The crowded wave uses seed 527 and 30 staged enemies. Each row samples roughly 2.6 seconds. Renderer-ready time was 6.68 s on 5.2.8 and 5.06 s on 5.2.9 in these runs.

| Scene | 5.2.8 median / p95 frame interval | 5.2.9 median / p95 frame interval | Median renderer CPU time, 5.2.8 / 5.2.9 |
| --- | --- | --- | --- |
| Home | 400 / 450 ms | 367 / 400 ms | 0.7 / 0.7 ms |
| Wave one | 283 / 317 ms | 250 / 283 ms | 0.9 / 0.6 ms |
| Crowded wave 46 | 550 / 550 ms | 483 / 500 ms | 0.8 / 1.0 ms |
| Resumed wave 46 | 450 / 500 ms | 500 / 533 ms | 1.5 / 1.1 ms |

The worst callback interval equals the listed p95 in these short rendered samples. Both builds drew zero frames and advanced the simulation by zero seconds while paused. The sample establishes pause and resume behavior under load. Timing varied between scenes and runs, and hardware performance requires separate measurements.

The rendered captures and runtime checks use emulated screens and a software GPU. Sustained frame pacing and thermal behavior on physical phones, A/B listening on phone speakers, and an uninterrupted manual campaign and Endless run across devices remain open.
