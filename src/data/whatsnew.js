// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
  {
    version: "4.6.0",
    title: "Storybook diorama worlds, crisp relic cards and combat clarity",
    items: [
      "4x MSAA HDR rendering, 2048 soft hardware-PCF shadows, and delicate dark-ink contours bring every arena to life.",
      "Explore full diorama worlds beyond every arena: canal towns, Nordic lodges, bog huts, astral islands, lava aqueducts, and desert oases.",
      "Upgrade cards and menus now use high-contrast nocturnal velvet frames, jewel rarity badges, and structured stat pills.",
      "Play as a cloaked Rift-Artificer with seven magitech weapons against 25 distinct enemy kits and six elevated bosses.",
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
      "Blackout City now has warm gallery lamps, ceramic chimes, and rising charged inlays.",
      "The Warden fires brass seals, and the Arc Caster traces copper paths.",
      "Mine fuses, beams, summons, and dash effects use steady inlays and visible progress marks.",
      "Biome titles, boss cards, and combat feedback match the glazed interface.",
    ],
  },
  {
    version: "4.4.0",
    title: "Glazed arenas and an original score",
    items: [
      "Six biomes have new glazed surfaces, engraved floors, scenery, and lighting.",
      "The walker, all seven weapons, enemies, bosses, and combat effects have been redesigned.",
      "An original score and new synthesized sounds accompany every arena and boss fight.",
      "The title screen, menus, HUD, and install icons share the new ceramic and brass style.",
    ],
  },
  {
    version: "4.3.1",
    title: "The Glass Flats rebuilt, clearer combat telegraphs",
    items: [
      "The Glass Flats gains sandstone berms, horizon buttes, dunes, glass-crowned outcrops and cracked sunspike basins.",
      "Glasswyrm fights solo with distinct callouts, while Chargers, Drillers, Weavers, Sentinels, Phantoms and Sunstruck foes telegraph clearly.",
      "Heat Sink responds to dust devils and hazards, saved runs preserve boss card counters, and DPS stats reflect full blast damage.",
      "Physical footsteps, Ashfall ambience and boss card sound ducking are tuned across every arena.",
    ],
  },
];
