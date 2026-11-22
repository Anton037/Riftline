// Handcrafted Lantern-Artificer run crafts, masterwork evolutions, and guardian relics.

const rarityNames = ["", "Common", "Rare", "Epic", "Legendary", "Masterwork", "Guardian Relic"];
const rarityWeights = [0, 42, 32, 20, 6],
  bossRarityWeights = [0, 0, 42, 44, 14];

const upgradeList = [
  // Common (Rarity 1)
  { id: "dmg", name: "Sun-Tempered Rounds", rarity: 1, max: 12, icon: "burst", desc: () => "+18% damage" },
  { id: "rate", name: "Clockwork Escapement", rarity: 1, max: 10, icon: "rate", desc: () => "+15% fire rate" },
  { id: "hp", name: "Heartwood Ward", rarity: 1, max: 10, icon: "shield", desc: () => "+25 max Ward and mend 25" },
  {
    id: "speed",
    name: "Wind-Woven Boots",
    rarity: 1,
    max: 6,
    icon: "wing",
    desc: () => "+10% move speed, -8% dash and Glass Ward Bell cooldown",
  },
  {
    id: "crit",
    name: "Prism Sight",
    rarity: 1,
    max: 8,
    icon: "crosshair",
    desc: () => "+10% critical chance, +6% crit power, +6% bolt speed and reach",
  },
  {
    id: "heal",
    name: "Mending Draught",
    rarity: 1,
    max: 99,
    icon: "heart",
    desc: () => "Mend 45% of max Ward",
    repeat: true,
  },

  // Rare (Rarity 2)
  {
    id: "pierce",
    name: "Star-Iron Core",
    rarity: 2,
    max: 3,
    icon: "pierce",
    desc: () => "Shots pierce +1 foe",
  },
  {
    id: "orbit",
    name: "Warding Blades",
    rarity: 2,
    max: 4,
    icon: "orbit",
    desc: () => "+1 gilded blade circling you. Parries hostile shots.",
  },
  {
    id: "shield",
    name: "Glass Ward Bell",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level) => "Block a hit every " + [12, 8, 5][Math.min(level, 2)] + " s (min 3.5 s cooldown)",
  },
  {
    id: "regen",
    name: "Dew-Moss Poultice",
    rarity: 2,
    max: 5,
    icon: "heart",
    desc: (level) => `Mend ${(0.8 * (level + 1)).toFixed(1)} Ward per second`,
  },
  {
    id: "cryo",
    name: "Rime-Glass Rounds",
    rarity: 2,
    max: 3,
    icon: "snow",
    desc: (level) => `${25 * (level + 1)}% chance to chill foes by 45%`,
  },
  {
    id: "shockdash",
    name: "Gale-Spark Step",
    rarity: 2,
    max: 2,
    icon: "wing",
    desc: (level) => `Dashing through foes deals ${level ? 90 : 60} damage`,
  },
  {
    id: "gcells",
    name: "Lodestone Bobbins",
    rarity: 2,
    max: 3,
    icon: "target",
    desc: () => "+1 Lodestone Chime charge and 12% faster recharge",
  },
  {
    id: "gblast",
    name: "Deepening Chime",
    rarity: 2,
    max: 4,
    icon: "burst",
    desc: () => "Lodestone Chime: +30% burst damage, +15% draw and shatter radius",
  },
  {
    id: "overload",
    name: "Kiln Surge",
    rarity: 2,
    max: 3,
    icon: "burst",
    desc: (level, count = level + 1) =>
      `Every 120 base weapon damage dealt vents a 5.5 m directional kiln-flare cone (${55 + 25 * count} damage + knockback)`,
  },
  {
    id: "heatsink",
    name: "Bellows Vent",
    rarity: 2,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Ringing a censer, triggering a relic, dashing near an active hazard, or taking a hazard hit grants +${count === 1 ? 25 : 45}% fire rate for 4.5 s and +${count === 1 ? 12 : 18}% Hearthburst`,
  },
  {
    id: "reactive",
    name: "Mirror Ward",
    rarity: 2,
    max: 2,
    icon: "shield",
    desc: (level) =>
      `Ward Bell blocks, taking Ward damage, or dash-grazing a shot (1.4 m) rings a ${level ? 4.2 : 3.5} m chime wave (${level ? 85 : 55} damage) that shatters shots`,
  },
  {
    id: "pointblank",
    name: "Brazier Stance",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level, count = level + 1) =>
      `Deal +${16 * count}% damage to foes within 5.5 m and take -${12 * count}% contact/melee damage`,
  },

  // Epic (Rarity 3)
  { id: "multishot", name: "Twin-Spout Chamber", rarity: 3, max: 4, icon: "fan", desc: () => "+1 bolt per shot" },
  {
    id: "ricochet",
    name: "Carom Glass",
    rarity: 3,
    max: 3,
    icon: "bounce",
    desc: () => "Shots carom to +1 nearby foe",
  },
  {
    id: "payload",
    name: "Sunburst Shell",
    rarity: 3,
    max: 5,
    icon: "burst",
    desc: (level) => `Hits blossom in a ${30 + 10 * level}% splash around the target`,
  },
  {
    id: "arc",
    name: "Leyline Conduit",
    rarity: 3,
    max: 3,
    icon: "bolt",
    desc: (level, count = level + 1) =>
      `${15 + 10 * count}% chance for hits to arc across ${1 + count} foes (+1 chain on Storm-Coil Rod)`,
  },
  {
    id: "seeker",
    name: "Starlight Fletching",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: () => "Shots curve gently toward foes",
  },
  {
    id: "thermite",
    name: "Cinder-Pitch",
    rarity: 3,
    max: 3,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Hits kindle for ${22 * count}% damage/s over 3 s (stacks up to 5 times on rapid hits)`,
  },
  {
    id: "siphon",
    name: "Vitality Chalice",
    rarity: 3,
    max: 4,
    icon: "heart",
    desc: (level, count = level + 1) =>
      `Defeating foes has a ${12 + 6 * count}% chance to mend ${5 + count} Ward (every 25th Guardian hit drops a mending mote)`,
  },
  {
    id: "rearguard",
    name: "Lantern Backlight",
    rarity: 3,
    max: 2,
    icon: "fan",
    desc: (level) =>
      (level === 0 ? "Also fire astern" : "Also fire a 3-way fan astern and to both flanks") +
      " at 75% damage (scales with bolt count)",
  },
  {
    id: "overcharge",
    name: "Hearth-Stoker",
    rarity: 3,
    max: 4,
    icon: "star",
    desc: (level) => `Hearthburst charges 30% faster, +${level < 2 ? 25 : 10}% radius, each defeat adds 1% charge`,
  },
  {
    id: "gfire",
    name: "Hearthfire Chime",
    rarity: 3,
    max: 1,
    icon: "flame",
    desc: () =>
      "Lodestone Chime tugs Guardians (35%), makes pulled foes take +25% damage for 3.5 s, and leaves a 4 s ember field",
  },
  {
    id: "hunter",
    name: "Guardian's Quarry",
    rarity: 3,
    max: 3,
    icon: "target",
    desc: (level, count = level + 1) =>
      `+${5 + 15 * count}% damage against elites, champions, guardians, and foes below 35% Ward (2\u00d7 to shields and guards)`,
  },
  {
    id: "echo",
    name: "Echoing Bell",
    rarity: 3,
    max: 2,
    icon: "rate",
    desc: (level) =>
      level === 0
        ? "Every 4th shot chimes a second full echo volley 0.10 s later at 80% damage"
        : "Every 3rd shot chimes a full echo volley 0.10 s later at 95% damage",
  },
  {
    id: "acidcoat",
    name: "Spore-Dew Glaze",
    rarity: 3,
    max: 2,
    icon: "brood",
    desc: (level, count = level + 1) =>
      `${count === 1 ? 35 : 60}% of hits (100% on splash) apply 3.5 s Vitriol Glaze (+${count === 1 ? 20 : 35}% damage taken, +${count === 1 ? 12 : 20}% on Guardians) and trail spore-dew`,
  },
  {
    id: "slipstream",
    name: "Tailwind Step",
    rarity: 3,
    max: 2,
    icon: "dash",
    desc: (level, count = level + 1) =>
      `For 1.0 s after completing a dash, weapon shots trail golden wind and deal +${count === 1 ? 20 : 35}% damage`,
  },
  {
    id: "surge",
    name: "Bell-Chime Cadence",
    rarity: 3,
    max: 2,
    icon: "star",
    desc: (level) =>
      `Combos last ${level ? 1 : 0.5} s longer. Every ${level ? 12 : 15} combo defeats (or 18th Guardian hit) rings a ${level ? 4.2 : 3.6} m wave at the target (${level ? 95 : 65} damage)`,
  },
  {
    id: "overcrit",
    name: "Prismatic Refraction",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: (level, count = level + 1) =>
      `Critical hits have a ${30 * count}% chance (+excess crit above 60%) to Super-Crit for 3.0\u00d7 damage and arc a prismatic beam`,
  },
  {
    id: "momentum",
    name: "Kinetic Glass",
    rarity: 3,
    max: 2,
    icon: "pierce",
    desc: (level, count = level + 1) =>
      `Each pierce or carom increases that projectile's damage by +${count === 1 ? 22 : 38}% and size by +15%`,
  },
  {
    id: "stoke",
    name: "Cinder-Bellows",
    rarity: 3,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Hitting a burning foe deals +${count === 1 ? 18 : 32}% bonus damage and immediately detonates 0.35 s of its active burn`,
  },
  {
    id: "gsyphon",
    name: "Resonance Well",
    rarity: 3,
    max: 2,
    icon: "target",
    desc: (level, count = level + 1) =>
      `Foes inside Lodestone Chime take +${count === 1 ? 25 : 45}% damage; each foe defeated inside refunds 15% Chime cooldown`,
  },

  // Legendary (Rarity 4)
  {
    id: "wingman",
    name: "Lantern Sprite",
    rarity: 4,
    max: 2,
    icon: "drone",
    desc: (level) =>
      level === 0
        ? "2 clockwork lantern sprites orbit and fire beside you"
        : "+1 Lantern Sprite and +35% sprite fire rate (0.35 s)",
  },
  {
    id: "bloodrush",
    name: "Zeal Cadence",
    rarity: 4,
    max: 1,
    icon: "rate",
    desc: () => "Each defeat: +4% fire rate for 4 s (stacks to 40%)",
  },
  {
    id: "colossus",
    name: "Greatbell Shot",
    rarity: 4,
    max: 1,
    icon: "burst",
    desc: () => "+60% shot size, +45% damage, -12% fire rate",
  },
  {
    id: "chrono",
    name: "Hourglass Step",
    rarity: 4,
    max: 1,
    icon: "clock",
    desc: () => "Dashing slows foes and their shots by 45% for 1.1 s (4.0 s cooldown)",
  },

  // Masterwork Evolutions (Rarity 5)
  {
    id: "halo",
    name: "Gilded Halo",
    rarity: 5,
    max: 1,
    icon: "orbit",
    evo: { orbit: 3, shield: 1 },
    desc: () => "Warding Blades grow, strike twice as hard and sweep wider. Glass Ward Bell recharges 30% faster.",
  },
  {
    id: "cluster",
    name: "Firefly Volley",
    rarity: 5,
    max: 1,
    icon: "burst",
    evo: { payload: 2, seeker: 1 },
    desc: () => "Primary Sunburst hits launch 2 homing firefly sparks that detonate in a 1.5 m blast (38% damage).",
  },
  {
    id: "storm",
    name: "Tempest Conduit",
    rarity: 5,
    max: 1,
    icon: "bolt",
    evo: { arc: 2, rate: 3 },
    desc: () => "+30% arc chance. Leyline arcs leap across 4 foes.",
  },
  {
    id: "inferno",
    name: "Wildfire",
    rarity: 5,
    max: 1,
    icon: "flame",
    evo: { thermite: 2, dmg: 3 },
    desc: () =>
      "Burning foes take +20% damage, and on defeat erupt in a 2.8 m hearth-blast (30 + 25% max Ward) that spreads their full burn stack.",
  },
  {
    id: "phantom",
    name: "Comet Step",
    rarity: 5,
    max: 1,
    icon: "wing",
    evo: { shockdash: 1, speed: 2 },
    desc: () =>
      "+1 Dash Charge (2 charges max), -35% dash cooldown, and your dash leaves a 1.8 s starlight wake (65 DPS, 35% slow).",
  },
  {
    id: "gunship",
    name: "Twin Sprites",
    rarity: 5,
    max: 1,
    icon: "drone",
    evo: { wingman: 1, multishot: 2 },
    desc: () => "+1 Lantern Sprite joins you, and all sprites fire 3-bolt fans.",
  },
  {
    id: "blackstar",
    name: "Event Horizon",
    rarity: 5,
    max: 1,
    icon: "collapse",
    evo: { gcells: 2, gblast: 2 },
    desc: () =>
      "Lodestone Chime pulls 40% wider and fires 8 primary weapon bolts outward on collapse. Hearthburst drops a free Lodestone Chime.",
  },
  {
    id: "overdrive",
    name: "Solar Repeater",
    rarity: 5,
    max: 1,
    icon: "rate",
    weapon: "pulse",
    evo: { rate: 3, multishot: 1 },
    desc: () => "Every 4th shot is a radiant sun-bolt: 2.4\u00d7 damage, +2 pierce, and a 1.8 m solar splash on hit.",
  },
  {
    id: "shredder",
    name: "Brass Hailstorm",
    rarity: 5,
    max: 1,
    icon: "fan",
    weapon: "scatter",
    evo: { multishot: 1, pierce: 1 },
    desc: () => "+2 brass pellets per blast, and every pellet caroms once.",
  },
  {
    id: "tempest",
    name: "Thunderhead",
    rarity: 5,
    max: 1,
    icon: "bolt",
    weapon: "tesla",
    evo: { rate: 2, crit: 2 },
    desc: () =>
      "Bolts leap across 4 foes (82% retention); unused leaps arc back into the primary target at 45% damage each.",
  },
  {
    id: "lance",
    name: "Astral Lance",
    rarity: 5,
    max: 1,
    icon: "pierce",
    weapon: "rail",
    evo: { pierce: 1, crit: 1 },
    desc: () =>
      "Star-glass needles pass through monoliths, pierce all foes, gain +22% damage per foe or monolith pierced, and deal +30% crit damage to Guardians.",
  },
  {
    id: "hellfire",
    name: "Sun-Bombard",
    rarity: 5,
    max: 1,
    icon: "burst",
    weapon: "rocket",
    evo: { payload: 1, dmg: 2 },
    desc: () => "Blasts are 35% wider and ignite everything caught inside.",
  },
  {
    id: "twinsaw",
    name: "Twin Chakrams",
    rarity: 5,
    max: 1,
    icon: "orbit",
    weapon: "disc",
    evo: { rate: 2, crit: 1 },
    desc: () => "Chakrams are 40% larger, strike 35% harder and curve toward foes outward.",
  },
  {
    id: "dragon",
    name: "Dragon's Bellows",
    rarity: 5,
    max: 1,
    icon: "flame",
    weapon: "flame",
    evo: { thermite: 1, dmg: 2 },
    desc: () => "Kiln-flames reach 30% further and burn twice as fiercely.",
  },

  // Guardian Relics (Rarity 6)
  {
    id: "sealgrid",
    name: "Lantern Cage",
    rarity: 6,
    max: 1,
    boss: "bellkeeper",
    icon: "sealgrid",
    desc: () =>
      "Every 7 s a 3.4 m brass cage drops onto the thickest pack (50 DPS for 3 s), snaring foes that walk into it and slowing Guardians by 30%",
  },
  {
    id: "shardfield",
    name: "Rime-Shard Burst",
    rarity: 6,
    max: 1,
    boss: "prism",
    icon: "snow",
    desc: () =>
      "Defeated foes (and every 15th Guardian hit) burst into 5 sapphire splinters (22 damage, pierces 2 foes, 1.8 s chill)",
  },
  {
    id: "brood",
    name: "Glow-Spore Brood",
    rarity: 6,
    max: 1,
    boss: "queen",
    icon: "brood",
    desc: () =>
      "Every 6 defeats (or 18th Guardian hit) hatches a seeker spore-sprite (up to 5) that blossoms for 75 damage and applies 3.5 s Vitriol Glaze",
  },
  {
    id: "collapse",
    name: "Astral Pull",
    rarity: 6,
    max: 1,
    boss: "core",
    icon: "collapse",
    desc: () => "Your Hearthburst pulls foes screen-wide, then rings out 50% stronger",
  },
  {
    id: "tribute",
    name: "Forge-Lord's Tithe",
    rarity: 6,
    max: 1,
    boss: "tyrant",
    icon: "tribute",
    desc: () =>
      "Every 14 defeats (or 20th Guardian hit) drops a Molten Anvil Ingot: 80 blast damage, +35% fire rate & damage for 4 s, 18 shards, and 12 Ward",
  },
  {
    id: "fang",
    name: "Glasswyrm Fang",
    rarity: 6,
    max: 1,
    boss: "wyrm",
    icon: "shard",
    desc: () =>
      "Every 10 defeats (or 16th Guardian hit) unleashes 6 piercing sunglass lances (34 damage, pierces 2 foes)",
  },
];

const upgradesById = Object.fromEntries(upgradeList.map((upgrade) => [upgrade.id, upgrade]));

export { rarityWeights, bossRarityWeights, upgradeList, rarityNames, upgradesById };
