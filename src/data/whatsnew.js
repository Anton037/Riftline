// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.2.1",
    title: "Cleaner menus",
    items: [
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
  {
    version: "5.0.0",
    title: "Interactive realm relics and living diorama worlds",
    items: [
      "Every realm features bespoke perimeter architecture, corner landmarks, sculpted cover, and interactive relics to spark or shatter.",
      "The Lantern Keeper, all seven handcrafted arms, 25 animated enemies with 3D variant gear, and six multi-phase bosses come alive.",
      "Six per-realm musical arrangements, scale-tuned reward chimes, and handcrafted surface footsteps enrich every expedition.",
      "The Home sanctuary plinth, arm-inspection flourish, relic HUD buffs, and gilded storybook frames complete the overhaul.",
    ],
  },
];
