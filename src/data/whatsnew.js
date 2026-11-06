// "What's new" tab: short player-facing notes, newest version first. Add an entry per release
// (the first entry has to match the game version; tests/core.test.mjs checks it, and that the list stays
// at NEWS_KEEP entries). Keep every line to one short sentence.
export const NEWS_KEEP = 5;
export const WHATS_NEW = [
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
  {
    version: "3.61.0",
    title: "Six places, one visual standard",
    items: [
      "Touch-only controls: phone vibration stays, while controller and keyboard/mouse gameplay are removed.",
      "Offline updates keep complete snapshots and preserve the previous build for open tabs.",
      "Snow buries the Shelf's bright grid, the Core wears fractured slate, and quieter marsh veins, molten seams and glass edges give enemies and danger more room to read.",
      "Wet asphalt and glass gain finer grain, and biome coatings leave more of each enemy type's own colour visible.",
      "Weather and decorative motes fade back during busy fights so hits and explosions stay readable.",
      "On phones the boss health bar sits between the sticks, leaving the boss and the wave/combo readouts clear.",
      "Beam warnings outline the full danger lane, and boss warning sounds briefly rise above the background mix.",
      "Your first card choice explains permanent Workshop upgrades, and the run recap names the final hit.",
    ],
  },
  {
    version: "3.60.0",
    title: "An arrival that says what is coming",
    items: [
      "Enemies now land with a shape that matches their weight: the light ones arrive in a quick streak, the heavy ones under a slow wide ring and a puff of dust.",
      "Before, all 25 types arrived the same way — same ring, same burst, same size — so the first thing you saw of a Brute looked like the first thing you saw of a Swarmer.",
      "The colour was already each type's own (and gold for an elite); it is unchanged. No damage, speed or spawn-time change.",
    ],
  },
  {
    version: "3.59.0",
    title: "The Weekly Rift",
    items: [
      "THE WEEKLY RIFT joins the Daily: one run a week, the same for every pilot, with a twist — two mutators are pinned for the whole week and are on from wave 1.",
      "Seed, weapon, threat and both mutators come from the ISO week; a new Rift opens every Monday 00:00 UTC.",
      "Like the Daily it ignores your workshop and pacts, so everyone flies the same drone, and it keeps its own best-of-week and a count of the weeks you played.",
      "You reach it on the Rifts page, under the Daily; the home-screen dot now lights up for an unplayed week too.",
      "The Daily Rift and its streak are unchanged.",
    ],
  },
];
