// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "5.2.9",
    title: "Safer pauses and checkpoints",
    items: [
      "If the browser loses graphics, the run pauses until you can see again.",
      "Endless saves as soon as you enter it.",
      "Continue tells you when you're returning to a reward choice or the Roadside Forge.",
      "On tablets, you can swipe through a long list of your crafts while choosing a reward.",
      "When no crafts are available, the reward shows how much HP you actually recovered.",
    ],
  },
];
