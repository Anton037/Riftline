// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.4.1",
    title: "Choose your arena traps",
    items: [
      "Arena traps are off by default, with Impossible available alongside difficulty on Home.",
      "Impossible brings floor hunters in from Wave 1, with mines and sweepers joining before the first boss.",
      "Impossible traps strike harder and reset faster, with staged warnings and steadier sweeper windups.",
      "A friendly mine chain now has a softer cue to match its teal warning ring.",
      "Adaptive resolution responds to sustained stalls on slow graphics hardware.",
    ],
  },
  {
    version: "5.4.0",
    title: "Deep mobile polish & full-game fixes",
    items: [
      "Major mobile smoothness pass: drift-free vsync lock, fixed 4× MSAA over-allocation, TBDR tile invalidation, and zero-alloc combat loops.",
      "Fixed Home screen rebuilding the arena every frame, trimmed distant exterior shadows, and eliminated per-frame DOM and CSS repaints.",
      "Fixed major boss, enemy, and craft bugs across all six areas and removed remaining safe-zone cheese.",
      "Improved touch button spacing, modal tap grace, landscape phone layouts, Forge button clarity, and debuff HUD accuracy.",
      "Hardened iOS Safari audio recovery, restored missing biome wave-event soundscapes, and strengthened cross-tab and wave-clear saves.",
    ],
  },
  {
    version: "5.3.2",
    title: "Sharper fights and clearer traps",
    items: [
      "Resolution now respects the display refresh rate and sharpens again after frame pacing recovers.",
      "Mines, sweepers and floor traps take turns claiming space in crowded arenas.",
      "Shooting a mine can set off nearby vessels with a teal fuse that only harms enemies.",
      "Sweeper warnings stop at cover as soon as they appear.",
      "Music recovers when you return to the game through the browser history.",
    ],
  },
  {
    version: "5.3.1",
    title: "Smoother mobile play & tougher traps",
    items: [
      "Smoother iPhone and Android frame pacing with jitter-tolerant vsync, adaptive scaling fixes, and leaner mobile bloom, wake, and shader work.",
      "Eliminated mobile text-atlas stutters on damage numbers and trimmed high-DPR tablet and phone GPU fillrate.",
      "Hunting floor traps now surface beneath center-campers from Wave 2 onward, and dormant floor plates wake up faster when stepped on.",
      "Sweeping beams now track across your position instead of firing into outer walls, and alternate sweep direction between cycles.",
      "Respawning mines can reclaim the middle of the arena, and detonating a mine chains nearby armed mines.",
    ],
  },
  {
    version: "5.3.0",
    title: "Craft polish and fixes",
    items: [
      "Fire Burst now erupts in warm ember flame, and Fire Bellows, Star Hall beams, and arena props received a visual polish pass.",
      "Refined enemy, boss, and Keeper models, smoother strafe/corpse motion, cleaner damage numbers, and clearer boss callouts.",
      "Added desktop keyboard shortcuts for the Roadside Forge (1–3 and Enter), refined HUD spacing, and unified craft and Guide labels.",
      "Added Roadside Forge arrival and Endless shift chimes alongside smoother, click-free music and resume transitions.",
      "Hardened save parsing and corrupt-save recovery so backups stay readable after reload and oversized imports stay safely bounded.",
    ],
  },
];
