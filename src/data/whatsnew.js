// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "3.63.0",
    title: "Surfaces, steel and impact",
    items: [
      "Wet asphalt, blue ice, peat islands, beveled rift slabs, volcanic crust and glass in sand give each arena its own material and light.",
      "The walker wears a new armored torso and shoulders, with shaped edges and metal highlights on machines and boss armor.",
      "Muzzle jets, directional hit sparks and twin dash trails make attacks read at a glance, while Nova clears its centre faster.",
      "Weapons have distinct dry attacks and shorter bodies, with redesigned hit, explosion, dash and Nova sounds.",
    ],
  },
  {
    version: "3.62.1",
    title: "Reliable saves and fairer hazards",
    items: [
      "Repeated Endless boss defeats survive Continue, and unusable saves are backed up before replacement.",
      "Champion rallies expire and every Sunstruck enemy receives its temporary sprint.",
      "Hazmat and Hazard Seal protect against traps, and fast enemy shots collide along their path.",
      "Scattergun damage estimates count extra pellets correctly and invalid challenge dates are rejected.",
      "The Rift Core stops summoning reinforcements into an overcrowded arena.",
    ],
  },
  {
    version: "3.62.0",
    title: "Practice the danger, keep your progress",
    items: [
      "Practise all six bosses with a fixed kit and opening, mid-fight or enraged patterns, while your saved run and records stay untouched.",
      "Updates wait for open dialogs; importing or resetting progress reports storage failures and can recover a held save.",
      "Saved card choices preserve the next reroll and banish, and Continue explains its wave checkpoint.",
      "Warnings gain a steady outline and hostile shots a dark footprint; quieter marsh and Core seams leave more room for danger.",
      "Sniper, beam and trap cues keep their voice in busy fights and briefly lower music and ambience.",
      "The Codex counts current discoveries; remembered retired bosses and Overdrives live in an archive.",
      "DASH, NOVA and Singularity accept touch only, and Dust Devils use the same armour rules as other map hazards.",
    ],
  },
];
