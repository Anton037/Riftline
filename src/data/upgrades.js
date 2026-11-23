// Run upgrades, evolutions, and boss rewards.

const rarityNames = ["", "Common", "Rare", "Epic", "Legendary", "Masterwork", "Guardian"];
const rarityWeights = [0, 42, 32, 20, 6],
  bossRarityWeights = [0, 0, 42, 44, 14];

const upgradeList = [
  // Common (Rarity 1)
  { id: "dmg", name: "Tempered Shot", rarity: 1, max: 12, icon: "burst", desc: () => "+18% damage" },
  { id: "rate", name: "Brisk Trigger", rarity: 1, max: 10, icon: "rate", desc: () => "+15% fire rate" },
  { id: "hp", name: "Stout Heart", rarity: 1, max: 10, icon: "shield", desc: () => "+25 max HP and mend 25 HP" },
  {
    id: "speed",
    name: "Swift Boots",
    rarity: 1,
    max: 6,
    icon: "wing",
    desc: () => "+10% move speed, -8% dash and ward cooldown",
  },
  {
    id: "crit",
    name: "Keen Sight",
    rarity: 1,
    max: 8,
    icon: "crosshair",
    desc: () => "+10% crit chance, +6% crit damage, +6% shot speed and range",
  },
  {
    id: "heal",
    name: "Mending Draught",
    rarity: 1,
    max: 99,
    icon: "heart",
    desc: () => "Restore 45% of max HP",
    repeat: true,
  },

  // Rare (Rarity 2)
  {
    id: "pierce",
    name: "Bodkin Bolts",
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
    desc: () => "+1 orbiting brass blade that slices foes and intercepts shots",
  },
  {
    id: "shield",
    name: "Mirror Ward",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level) => "Block 1 hit every " + [12, 8, 5][Math.min(level, 2)] + " s (min 3.5 s cooldown)",
  },
  {
    id: "regen",
    name: "Hearth Mending",
    rarity: 2,
    max: 5,
    icon: "heart",
    desc: (level) => `Restore ${(0.8 * (level + 1)).toFixed(1)} HP per second`,
  },
  {
    id: "cryo",
    name: "Rime Shot",
    rarity: 2,
    max: 3,
    icon: "snow",
    desc: (level) => `${25 * (level + 1)}% chance to chill foes (45% slow; 30% on guardians)`,
  },
  {
    id: "shockdash",
    name: "Thunder Stride",
    rarity: 2,
    max: 2,
    icon: "wing",
    desc: (level) => `Dashing through foes jolts them for ${level ? 90 : 60} damage`,
  },
  {
    id: "gcells",
    name: "Extra Chimes",
    rarity: 2,
    max: 3,
    icon: "target",
    desc: () => "+1 Gravity Chime charge and 12% faster recharge",
  },
  {
    id: "gblast",
    name: "Resonant Bell",
    rarity: 2,
    max: 4,
    icon: "burst",
    desc: () => "Gravity Chime: +30% blast damage, +15% pull and blast radius",
  },
  {
    id: "overload",
    name: "Kiln Surge",
    rarity: 2,
    max: 3,
    icon: "burst",
    desc: (level, count = level + 1) =>
      `Every 120 base weapon damage unleashes a 5.5 m ember cone (${55 + 25 * count} damage + knockback)`,
  },
  {
    id: "heatsink",
    name: "Bellows Vent",
    rarity: 2,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Triggering a realm relic, dashing near a hazard, or taking hazard damage grants +${count === 1 ? 25 : 45}% fire rate for 4.5 s and +${count === 1 ? 12 : 18}% Hearthburst charge`,
  },
  {
    id: "reactive",
    name: "Aegis Chime",
    rarity: 2,
    max: 2,
    icon: "shield",
    desc: (level) =>
      `Blocking a hit, taking HP damage, or grazing a shot with dash emits a ${level ? 4.2 : 3.5} m pulse (${level ? 85 : 55} damage) that clears enemy shots`,
  },
  {
    id: "pointblank",
    name: "Lantern Guard",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level, count = level + 1) =>
      `Deal +${16 * count}% damage to foes within 5.5 m and take -${12 * count}% contact damage`,
  },

  // Epic (Rarity 3)
  { id: "multishot", name: "Split Chamber", rarity: 3, max: 4, icon: "fan", desc: () => "+1 shot per volley" },
  {
    id: "ricochet",
    name: "Carom Shot",
    rarity: 3,
    max: 3,
    icon: "bounce",
    desc: () => "Shots ricochet to +1 nearby foe",
  },
  {
    id: "payload",
    name: "Powder Shot",
    rarity: 3,
    max: 5,
    icon: "burst",
    desc: (level) => `Hits burst for ${30 + 10 * level}% splash damage around the target`,
  },
  {
    id: "arc",
    name: "Storm Thread",
    rarity: 3,
    max: 3,
    icon: "bolt",
    desc: (level, count = level + 1) =>
      `${15 + 10 * count}% chance for hits to arc lightning to ${1 + count} foes (+1 jump on Stormcoil Wand)`,
  },
  {
    id: "seeker",
    name: "Compass Bolts",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: () => "Shots gently curve toward nearby foes",
  },
  {
    id: "thermite",
    name: "Cinder Shot",
    rarity: 3,
    max: 3,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Hits ignite foes for ${11 + 11 * count}% damage/s over 3 s (stacks up to 5 times)`,
  },
  {
    id: "siphon",
    name: "Hearth Siphon",
    rarity: 3,
    max: 4,
    icon: "heart",
    desc: (level, count = level + 1) =>
      `Defeating foes has a ${12 + 6 * count}% chance to mend ${5 + count} HP (every 25th guardian hit drops a mend orb)`,
  },
  {
    id: "rearguard",
    name: "Rear Ward",
    rarity: 3,
    max: 2,
    icon: "fan",
    desc: (level) =>
      (level === 0 ? "Also fire astern" : "Also fire astern and to both flanks") +
      " at 75% damage (scales with Split Chamber)",
  },
  {
    id: "overcharge",
    name: "Hearth Resonance",
    rarity: 3,
    max: 4,
    icon: "star",
    desc: (level) => `Hearthburst charges 30% faster, +${level < 2 ? 25 : 10}% radius, and each kill adds 1% charge`,
  },
  {
    id: "gfire",
    name: "Hearthfire Chime",
    rarity: 3,
    max: 1,
    icon: "flame",
    desc: () =>
      "Gravity Chime tugs guardians (35%), marks pulled foes for +25% damage taken (3.5 s), and leaves a 4 s ember pool",
  },
  {
    id: "hunter",
    name: "Guardian Bane",
    rarity: 3,
    max: 3,
    icon: "target",
    desc: (level, count = level + 1) =>
      `+${5 + 15 * count}% damage against elites, champions, guardians, and foes below 35% HP (2\u00d7 to wards)`,
  },
  {
    id: "echo",
    name: "Echo-Bell",
    rarity: 3,
    max: 2,
    icon: "rate",
    desc: (level) =>
      level === 0
        ? "Every 4th attack rings a second echo volley 0.10 s later at 80% damage"
        : "Every 3rd attack rings a second echo volley 0.10 s later at 95% damage",
  },
  {
    id: "acidcoat",
    name: "Spore-Dew Glaze",
    rarity: 3,
    max: 2,
    icon: "brood",
    desc: (level, count = level + 1) =>
      `${count === 1 ? 35 : 60}% of hits (100% on blasts) glaze foes for 3.5 s (+${count === 1 ? 20 : 35}% damage taken, +${count === 1 ? 12 : 20}% on guardians)`,
  },
  {
    id: "slipstream",
    name: "Gale Flourish",
    rarity: 3,
    max: 2,
    icon: "dash",
    desc: (level, count = level + 1) =>
      `For 1.0 s after dashing, your weapon shots deal +${count === 1 ? 20 : 35}% damage`,
  },
  {
    id: "surge",
    name: "Bell-Chime Cadence",
    rarity: 3,
    max: 2,
    icon: "star",
    desc: (level) =>
      `Combos linger ${level ? 1 : 0.5} s longer. Every ${level ? 12 : 15} combo kills (or 18th guardian hit) rings a ${level ? 4.2 : 3.6} m blast (${level ? 95 : 65} damage)`,
  },
  {
    id: "overcrit",
    name: "Sun-Crest Crit",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: (level, count = level + 1) =>
      `Critical hits have a ${30 * count}% chance (+crit chance above 60%) to Super-Crit for 3.0\u00d7 damage and cleave a nearby foe`,
  },
  {
    id: "momentum",
    name: "Gathering Arc",
    rarity: 3,
    max: 2,
    icon: "pierce",
    desc: (level, count = level + 1) =>
      `Each pierce or ricochet empowers that shot by +${count === 1 ? 22 : 38}% damage and +15% size`,
  },
  {
    id: "stoke",
    name: "Cinder-Bellows",
    rarity: 3,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Hitting a burning foe deals +${count === 1 ? 18 : 32}% bonus damage and pops 0.35 s of its burn immediately`,
  },
  {
    id: "gsyphon",
    name: "Resonance Well",
    rarity: 3,
    max: 2,
    icon: "target",
    desc: (level, count = level + 1) =>
      `Foes inside Gravity Chime take +${count === 1 ? 25 : 45}% damage; each kill inside refunds 15% cooldown`,
  },

  // Legendary (Rarity 4)
  {
    id: "wingman",
    name: "Lantern Wisps",
    rarity: 4,
    max: 2,
    icon: "drone",
    desc: (level) =>
      level === 0 ? "2 guiding wisps orbit beside you and fire at foes" : "+1 guiding wisp and +35% wisp fire rate",
  },
  {
    id: "bloodrush",
    name: "Kindled Tempo",
    rarity: 4,
    max: 1,
    icon: "rate",
    desc: () => "Each kill (or every 10th guardian hit) grants +4% fire rate for 4 s (stacks up to 40%)",
  },
  {
    id: "colossus",
    name: "Colossus Shot",
    rarity: 4,
    max: 1,
    icon: "burst",
    desc: () => "+60% shot size, +45% damage, -12% fire rate",
  },
  {
    id: "chrono",
    name: "Hourglass Stride",
    rarity: 4,
    max: 1,
    icon: "clock",
    desc: () => "Dashing slows foes and enemy shots by 45% for 1.1 s (4.0 s cooldown)",
  },

  // Masterworks / Evolutions (Rarity 5)
  {
    id: "halo",
    name: "Sun-Ring Halo",
    rarity: 5,
    max: 1,
    icon: "orbit",
    evo: { orbit: 2, shield: 1 },
    desc: () => "Warding Blades grow wider, larger, and deal 2\u00d7 damage. Mirror Ward recharges 30% faster.",
  },
  {
    id: "cluster",
    name: "Firefly Volley",
    rarity: 5,
    max: 1,
    icon: "burst",
    evo: { payload: 2, seeker: 1 },
    desc: () => "Powder blasts scatter 2 seeking ember bomblets that burst in a 1.5 m area (38% damage).",
  },
  {
    id: "storm",
    name: "Thunderhead",
    rarity: 5,
    max: 1,
    icon: "bolt",
    evo: { arc: 2, rate: 1 },
    desc: () => "+30% lightning chance. Storm Thread arcs leap to 4 foes.",
  },
  {
    id: "inferno",
    name: "Wildfire Kiln",
    rarity: 5,
    max: 1,
    icon: "flame",
    evo: { thermite: 2, dmg: 1 },
    desc: () =>
      "Burning foes take +20% damage, and burst on death (30 + 25% max HP damage) while spreading embers nearby.",
  },
  {
    id: "phantom",
    name: "Gale Stride",
    rarity: 5,
    max: 1,
    icon: "wing",
    evo: { shockdash: 1, speed: 2 },
    desc: () => "+1 Dash Charge (2 max), -35% dash cooldown, and dashing leaves a crackling trail (65 DPS, 35% slow).",
  },
  {
    id: "gunship",
    name: "Wisp Choir",
    rarity: 5,
    max: 1,
    icon: "drone",
    evo: { wingman: 1, multishot: 1 },
    desc: () => "+1 guiding wisp, and all wisps fire a 3-bolt fan.",
  },
  {
    id: "blackstar",
    name: "Astral Well",
    rarity: 5,
    max: 1,
    icon: "collapse",
    evo: { gcells: 1, gblast: 2 },
    desc: () =>
      "Gravity Chime pulls 40% wider and fires 8 weapon bolts outward on collapse. Hearthburst drops a free Chime.",
  },
  {
    id: "overdrive",
    name: "Solar Repeater",
    rarity: 5,
    max: 1,
    icon: "rate",
    weapon: "pulse",
    evo: { rate: 2, multishot: 1 },
    desc: () => "Every 4th shot is a solar bolt: 2.4\u00d7 damage, +2 pierce, and a 1.8 m burst on hit.",
  },
  {
    id: "shredder",
    name: "Storm Blunderbuss",
    rarity: 5,
    max: 1,
    icon: "fan",
    weapon: "scatter",
    evo: { multishot: 1, pierce: 1 },
    desc: () => "+2 brass shot per volley, and every pellet ricochets once.",
  },
  {
    id: "tempest",
    name: "Tempest Coil",
    rarity: 5,
    max: 1,
    icon: "bolt",
    weapon: "tesla",
    evo: { rate: 1, crit: 2 },
    desc: () =>
      "Arcs leap to 4 foes (82% damage kept); unused jumps strike the primary target again for 45% damage each.",
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
      "Lances pass through cover, pierce all foes, gain +22% damage per target pierced, and deal +30% crit damage to guardians.",
  },
  {
    id: "hellfire",
    name: "Kiln Salvo",
    rarity: 5,
    max: 1,
    icon: "burst",
    weapon: "rocket",
    evo: { payload: 1, dmg: 2 },
    desc: () => "Mortar blasts are 35% wider and ignite every foe caught in the burst.",
  },
  {
    id: "twinsaw",
    name: "Twin Sunwheel",
    rarity: 5,
    max: 1,
    icon: "orbit",
    weapon: "disc",
    evo: { rate: 2, crit: 1 },
    desc: () => "Chakrams are 40% larger, deal 35% more damage, and curve toward foes.",
  },
  {
    id: "dragon",
    name: "Dragon Bellows",
    rarity: 5,
    max: 1,
    icon: "flame",
    weapon: "flame",
    evo: { thermite: 1, dmg: 2 },
    desc: () => "Hearth plumes reach 30% farther and burn twice as fiercely.",
  },

  // Guardian Relics (Rarity 6)
  {
    id: "sealgrid",
    name: "Bell-Seal Cage",
    rarity: 6,
    max: 1,
    boss: "bellkeeper",
    icon: "sealgrid",
    desc: () =>
      "Every 7 s a 3.4 m gilded cage drops on the largest pack (50 DPS for 3 s), binding foes and slowing guardians by 30%",
  },
  {
    id: "shardfield",
    name: "Rime Splinters",
    rarity: 6,
    max: 1,
    boss: "prism",
    icon: "snow",
    desc: () =>
      "Felled foes (and every 15th guardian hit) burst into 5 frost splinters (22 damage, pierce 2 foes, 1.8 s chill)",
  },
  {
    id: "brood",
    name: "Spore-Dew Brood",
    rarity: 6,
    max: 1,
    boss: "queen",
    icon: "brood",
    desc: () =>
      "Every 6 kills (or 18th guardian hit) spawns a seeking spore (up to 5) that bursts for 75 damage and glazes foes for 3.5 s",
  },
  {
    id: "collapse",
    name: "Astral Pull",
    rarity: 6,
    max: 1,
    boss: "core",
    icon: "collapse",
    desc: () => "Your Hearthburst pulls foes across the whole arena, then bursts 50% stronger",
  },
  {
    id: "tribute",
    name: "Anvil Tribute",
    rarity: 6,
    max: 1,
    boss: "tyrant",
    icon: "tribute",
    desc: () =>
      "Every 14 kills (or 20th guardian hit) drops a molten ingot: 80 blast damage, +35% fire rate & damage for 4 s, 18 shards, and 12 HP",
  },
  {
    id: "fang",
    name: "Glasswyrm Fangs",
    rarity: 6,
    max: 1,
    boss: "wyrm",
    icon: "shard",
    desc: () => "Every 10 kills (or 16th guardian hit) fires 6 piercing sunglass fangs (34 damage, pierce 2 foes)",
  },
];

const upgradesById = Object.fromEntries(upgradeList.map((upgrade) => [upgrade.id, upgrade]));

export { rarityWeights, bossRarityWeights, upgradeList, rarityNames, upgradesById };
