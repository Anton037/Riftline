// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "4.3.0",
    title: "Powerful abilities, a natural frozen horizon",
    items: [
      "Nova sends out one rising pressure wave with a single, weighty discharge.",
      "Singularity suspends a dark core inside swirling matter, with distinct flight, pull and collapse effects.",
      "Aegis reacts to absorbed hits; Event Collapse and portals gain clearer, deeper effects.",
      "Natural glaciers, distant northern lights, sculpted Marsh fungi and clearer City edges bring the scenery together.",
      "Arena changes throw up brief material dust instead of glowing obstacle rings.",
    ],
  },
  {
    version: "4.2.0",
    title: "Weapons with character, bosses with identity",
    items: [
      "Arc Caster lightning branches through the air, Ember Jet flames flow, and every weapon has its own shot treatment.",
      "The Ash Tyrant becomes a basalt colossus with molten cinders, volcanic summons and magma bombs.",
      "Boss attacks keep their own materials, sounds and colors, including when enraged.",
      "Painted models gain surface relief; hit flashes preserve their finish and biome traps fit their surroundings.",
      "A focused game: upgrades and achievements stay; Codex, challenges, pacts and training are removed.",
    ],
  },
];
