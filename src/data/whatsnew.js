// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "4.0.0",
    title: "Six worlds, rebuilt",
    items: [
      "Six rebuilt environments: worn city streets, wind-carved snow, living marsh banks, fractured Core slabs, cooled volcanic crust and glass-strewn dunes.",
      "Map obstacles gain foundations, layered materials and physical detail, with new landmarks framing each arena.",
      "Weathered manhole metal, cooler glass and brighter walker armor keep the world and combat readable.",
    ],
  },
  {
    version: "3.64.0",
    title: "Read the rush, trust the cover",
    items: [
      "Beams, aim lines and Singularity targeting stop at thin walls and nearby cover.",
      "Charge lanes show steady edges and direction markers, while sniper lock stays bright without rapid flashing.",
      "Snipers carry a more readable scope hood and lens within the same silhouette.",
      "Charge and turret warning sounds keep their voices in busy fights, with clearer charger and leaper cues.",
    ],
  },
  {
    version: "3.63.1",
    title: "A clear path through the Caldera",
    items: [
      "The old black lava-channel rectangle is gone, and decorative fire pillars and molten ponds sit outside the arena.",
      "Pond rocks stay with their ponds instead of collecting near the start, and basalt obstacles have more readable faces.",
      "Vertical lava ridges carry their seams and ember vents along the full ridge instead of bunching them at the centre.",
      "Broken rune etchings distinguish the Core's floor decoration from active circular hazards.",
    ],
  },
];
