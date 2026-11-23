// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.1.1",
    title: "Seamless waves, unified storybook polish & smoother play",
    items: [
      "Wave transitions stay silky smooth on phones and desktop, with every realm prepared ahead of battle.",
      "Unified Lantern-Artificer arms, crafts, Sanctuary modules, Endless omens, and Journal Codex entries across the whole game.",
      "Right-click to dash or bring a controller, and use a perfectly timed dash to graze incoming shots.",
      "Each arm has a native trait, and every Guardian leaves an opening between attacks.",
      "Spend run shards at Wayfarer's Anvil before you enter the next realm.",
    ],
  },
  {
    version: "5.1.0",
    title: "Acoustic overhaul, cleaner combat effects & full aiming motion",
    items: [
      "Overhauled sound and music with distinct acoustic voices per arm, richer musical arrangements, and signature guardian themes.",
      "Cleaner combat visuals with falling Starfall comets, shootable forge bombs, and a full Lantern-Artificer defeat animation.",
      "The Lantern-Artificer now turns naturally toward your aim with steady weapon handling and movement lean.",
      "Added multi-charge dash pips, 50% guardian phase markers, clearer craft descriptions, and 8 reworked realm events.",
    ],
  },
  {
    version: "5.0.0",
    title: "Interactive realm relics and living diorama worlds",
    items: [
      "Every realm features bespoke perimeter architecture, corner landmarks, sculpted cover, and interactive relics to spark or shatter.",
      "The Lantern-Artificer, all seven handcrafted arms, 25 animated foes with 3D variant gear, and six multi-phase guardians come alive.",
      "Six per-realm musical arrangements, scale-tuned reward chimes, and handcrafted surface footsteps enrich every expedition.",
      "The Home sanctuary plinth, arm-inspection flourish, relic HUD buffs, and gilded storybook frames complete the overhaul.",
    ],
  },
  {
    version: "4.6.0",
    title: "Storybook diorama worlds, crisp craft cards and combat clarity",
    items: [
      "Soft shadows, warm lantern lighting, and delicate ink contours bring every miniature arena to life.",
      "Explore full diorama worlds beyond every arena: canal towns, Nordic lodges, bog huts, astral islands, lava aqueducts, and desert oases.",
      "Craft cards and menus use high-contrast nocturnal velvet frames, jewel rarity badges, and structured stat pills.",
      "Calmer walkable floors, a hero foot compass, and hit-drain bars keep dense fights easy to read.",
    ],
  },
  {
    version: "4.5.0",
    title: "Cozy realm worlds, adaptive HUD and musical soundscapes",
    items: [
      "Every realm has its own mood, painterly floors, native traps, organic hazards, and weather.",
      "The HUD, guardian bar, menus, and craft cards use storybook frames that adapt to each realm.",
      "All 25 foes, six guardians, and the Lantern-Artificer gain miniature detail, realm weathering, and punchier effects.",
      "A cozy modal score, handcrafted acoustic instruments, musical UI chimes, and realm soundscapes accompany play.",
    ],
  },
];
