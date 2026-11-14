// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "4.1.1",
    title: "Grounded worlds, connected walker",
    items: [
      "The rebuilt walker keeps its gun attached while turning, walking and firing.",
      "Stray floor rings, volcanic lamps and block pedestals give way to natural rock, ice and glass.",
      "Enemy impacts match armor, flesh, stone, energy and crystal, including critical hits.",
      "Adjusting frame rate, sound or HUD settings no longer briefly clears the scene.",
    ],
  },
  {
    version: "4.1.0",
    title: "Painted worlds, physical sound",
    items: [
      "All six worlds gain painted terrain, weathered materials, grounded shadows and sculpted volcanic rock.",
      "Painted characters, layered walker armor, detailed weapon barrels and tactile equipment panels carry the new look through the game.",
      "Material smoke, physical rockets and quieter sparks and glows make the action clearer.",
      "Combat sound is rebuilt around physical recordings, weighty weapon reports and distinct material impacts, with new ambience accents.",
      "High detail is standard; choose a 30, 60 or 120 FPS limit, with 60 FPS as the default.",
    ],
  },
];
