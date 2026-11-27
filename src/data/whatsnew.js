// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.4.3",
    title: "Safer saves and lighter arena rendering",
    items: [
      "An older tab closing or going into the background no longer restores stale progress.",
      "Arenas reuse static scenery transforms and combine the meshes of moving props.",
    ],
  },
  {
    version: "5.4.2",
    title: "Clearer fights and smoother controls",
    items: [
      "Boss and trap warnings are easier to see against ice, sand, and marsh terrain.",
      "Fixed Fire Well and Ring Blade weapon interactions, Echo Shot cadence, and several boss relic rewards.",
      "Busy fights render more efficiently, and frame pacing adapts better to high-refresh displays.",
      "The HUD editor and Game Over controls work in portrait, with more reliable mouse, touch, and stylus input.",
      "Fight and boss music play at closer levels, with smoother transitions when pausing and resuming.",
      "Workshop purchases check for newer progress from other tabs, and imported saves show refund notices.",
      "Active runs stay open when another tab applies a game update.",
    ],
  },
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
];
