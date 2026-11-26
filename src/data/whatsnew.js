// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "5.2.12",
    title: "Clearer HUD and settings",
    items: [
      "Settings switches respond to taps on Safari, including after restoring defaults.",
      "The performance readout sits under the pause button, clear of boss health.",
      "Tutorial tips and combat notices take turns, and reward feedback leaves the cards clear.",
      "If a saved touch layout covers a readout, the default buttons are used for that screen.",
      "The wave counter shows the correct number of enemies when a group arrives in stages.",
    ],
  },
  {
    version: "5.2.11",
    title: "Clearer arenas",
    items: [
      "Traps and enemy arrivals leave room around cover, hazards, and each other.",
      "Shootable relics are gone, and shooting a mine clears it without leaving a hazard.",
      "Lantern Yard has a bell workshop, and a wooden path crosses Moss Bog.",
      "Quieter floors make warnings easier to see in Ember Hill and Star Hall.",
      "Guard shots come from their barrels, and Moss Healers show who they’re healing.",
    ],
  },
  {
    version: "5.2.10",
    title: "Safer Forge taps",
    items: ["Continuing to the Roadside Forge keeps your purchases and shards until you tap an item."],
  },
];
