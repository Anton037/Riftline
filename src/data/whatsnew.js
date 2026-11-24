// Record every significant player-facing change in the release's "What's New" entry.
// Keep each item to one short sentence. The newest entry must match the game version,
// and tests/core.test.mjs checks that the list stays at NEWS_KEEP entries.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.2.2",
    title: "Steadier aim and cleaner shots",
    items: [
      "With Auto Fire off, the Keeper turns toward the mouse without shooting.",
      "Aim assist checks cover from the weapon, and close enemies can be hit at the barrel.",
      "Shots stay on course during quick turns, and Echo Shot repeats from the original spot.",
      "Back Shot respects cover, and helper wisps turn toward what they shoot.",
      "Star Hall and Star Heart use their own portal and aiming effects again.",
    ],
  },
  {
    version: "5.2.1",
    title: "Cleaner menus",
    items: [
      "Settings and menus have fewer shortcut labels, and the shortcuts still work.",
      "Settings can show live FPS and CPU frame time during play.",
      "Screen-edge arrows point toward enemies and healing pickups.",
    ],
  },
  {
    version: "5.2.0",
    title: "Simpler names and clearer shots",
    items: [
      "Weapons, bosses, areas, and crafts have simpler names.",
      "Shots and their flashes now line up with the weapon.",
    ],
  },
  {
    version: "5.1.1",
    title: "Seamless waves, unified storybook polish & smoother play",
    items: [
      "Wave transitions stay silky smooth on phones and desktop, with every realm prepared ahead of battle.",
      "Unified Lantern Keeper arms, crafts, Home modules, Endless omens, and Journal Guide entries across the whole game.",
      "Right-click to dash or bring a controller, and use a perfectly timed dash to graze incoming shots.",
      "Each arm has a native trait, and every Boss leaves an opening between attacks.",
      "Spend run shards at Roadside Forge before you enter the next realm.",
    ],
  },
  {
    version: "5.1.0",
    title: "Acoustic overhaul, cleaner combat effects & full aiming motion",
    items: [
      "Overhauled sound and music with distinct acoustic voices per arm, richer musical arrangements, and signature boss themes.",
      "Cleaner combat visuals with falling Starfall comets, shootable forge bombs, and a full Lantern Keeper defeat animation.",
      "The Lantern Keeper now turns naturally toward your aim with steady weapon handling and movement lean.",
      "Added multi-charge dash pips, 50% boss phase markers, clearer craft descriptions, and 8 reworked realm events.",
    ],
  },
];
