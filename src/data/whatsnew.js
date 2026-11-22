// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "5.1.0",
    title: "Audio overhaul, cleaner effects, full aiming animation & smoother play",
    items: [
      "Overhauled sound & music: unique acoustic effects per weapon and event, richer multi-section music, and distinct boss themes.",
      "Cleaner combat visuals: removed dark outlines on shots and warnings, added meteor shower comets, crucible bomb targets, and a full player death animation.",
      "The hero now always turns to face where the weapon aims, with a proper holding arm and natural movement lean.",
      "Added multi-charge dash pips, 50% boss phase markers, clearer upgrade descriptions, and 8 reworked wave events.",
      "Eliminated audio leaks, per-frame backdrop blurs, and hidden-screen WebGL passes for smooth, cool browser play.",
    ],
  },
  {
    version: "5.0.0",
    title: "GPU-First Engine v2, interactive biome relics and living miniatures",
    items: [
      "A GPU-First WebGL2 Engine v2 drives ring-buffer particles, debris, wake ripples, and sub-part animation on the GPU.",
      "Every biome has bespoke perimeter architecture, corner landmarks, sculpted cover, and interactive relics to spark or shatter.",
      "The Lantern-Artificer, all seven arms, 25 animated foes with 3D variant/elite gear, and six multi-phase guardians come alive.",
      "Six per-biome musical arrangements, scale-tuned reward chimes, and handcrafted surface footsteps enrich every run.",
      "The Home sanctuary plinth, weapon-inspection flourish, relic HUD buffs, and accessible storybook frames complete the overhaul.",
    ],
  },
  {
    version: "4.6.0",
    title: "Storybook diorama worlds, crisp relic cards and combat clarity",
    items: [
      "4x MSAA HDR rendering, 2048 soft hardware-PCF shadows, and delicate dark-ink contours bring every arena to life.",
      "Explore full diorama worlds beyond every arena: canal towns, Nordic lodges, bog huts, astral islands, lava aqueducts, and desert oases.",
      "Upgrade cards and menus now use high-contrast nocturnal velvet frames, jewel rarity badges, and structured stat pills.",
      "Play as a cloaked Lantern-Artificer with seven handcrafted arms against 25 distinct enemy kits and six elevated guardians.",
      "Calmer walkable floors, dark-inked enemy shots, a hero foot compass, and hit-drain bars keep dense fights readable.",
    ],
  },
  {
    version: "4.5.0",
    title: "Cozy biome worlds, adaptive HUD and musical soundscapes",
    items: [
      "Every biome now has its own mood, seamless painterly floors, native traps, organic hazards, and weather.",
      "The HUD, boss bar, menus, and upgrade cards use rounded storybook frames that adapt to each biome.",
      "All 25 enemies, six bosses, and the walker gain richer miniature detail, biome weathering, and punchier effects.",
      "A new cozy score, handcrafted acoustic instruments, musical UI chimes, and biome soundscapes accompany play.",
      "WebGL2 shader, shadow, and instancing optimizations cut uniform and program overhead across busy waves.",
    ],
  },
  {
    version: "4.4.1",
    title: "Steady lamps and engraved combat cues",
    items: [
      "Lantern Courtyard now has warm gallery lamps, ceramic chimes, and rising charged inlays.",
      "The Bellkeeper fires brass seals, and the Storm-Coil traces copper paths.",
      "Mine fuses, beams, summons, and dash effects use steady inlays and visible progress marks.",
      "Biome titles, boss cards, and combat feedback match the glazed interface.",
    ],
  },
];
