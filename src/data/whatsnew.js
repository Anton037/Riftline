// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.3.0",
    title: "Craft polish and fixes",
    items: [
      "Fire Burst now erupts in warm ember flame, and Fire Bellows and Star Hall beams render with their full shaders.",
      "Polished enemy, boss, and Keeper models, including Star Heart's core, Bell Keeper's visor, Star Spider legs, and smoother cloak drape.",
      "Refined arena props and hazards across Snow Ridge, Moss Bog, Ember Hill, and Sun Dunes, with faster desert rendering.",
      "Boss phase transitions play cleanly once, and buffered dashes stay reliable during frame drops.",
      "Corrupt-save backups stay readable after reload, and craft, HUD, and Guide labels match across the game.",
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
