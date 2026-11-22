// Run upgrades, evolutions, and boss rewards.

const rarityNames = ["", "Common", "Rare", "Epic", "Legendary", "Evolution", "Boss"];
const rarityWeights = [0, 42, 32, 20, 6],
  bossRarityWeights = [0, 0, 42, 44, 14];

const upgradeList = [
  // Common (Rarity 1)
  { id: "dmg", name: "Heavy Rounds", rarity: 1, max: 12, icon: "burst", desc: () => "+18% damage" },
  { id: "rate", name: "Rapid Fire", rarity: 1, max: 10, icon: "rate", desc: () => "+15% fire rate" },
  { id: "hp", name: "Extra HP", rarity: 1, max: 10, icon: "shield", desc: () => "+25 max HP and heal 25" },
  {
    id: "speed",
    name: "Swift Boots",
    rarity: 1,
    max: 6,
    icon: "wing",
    desc: () => "+10% move speed, -8% dash and shield cooldown",
  },
  {
    id: "crit",
    name: "Sharp Sight",
    rarity: 1,
    max: 8,
    icon: "crosshair",
    desc: () => "+10% crit chance, +6% crit damage, +6% shot speed and range",
  },
  {
    id: "heal",
    name: "Health Potion",
    rarity: 1,
    max: 99,
    icon: "heart",
    desc: () => "Heal 45% of max HP",
    repeat: true,
  },

  // Rare (Rarity 2)
  {
    id: "pierce",
    name: "Piercing Shots",
    rarity: 2,
    max: 3,
    icon: "pierce",
    desc: () => "Shots pierce +1 enemy",
  },
  {
    id: "orbit",
    name: "Orbiting Blades",
    rarity: 2,
    max: 4,
    icon: "orbit",
    desc: () => "+1 blade circling you. Blocks enemy shots.",
  },
  {
    id: "shield",
    name: "Energy Shield",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level) => "Block 1 hit every " + [12, 8, 5][Math.min(level, 2)] + " s (min 3.5 s cooldown)",
  },
  {
    id: "regen",
    name: "HP Regen",
    rarity: 2,
    max: 5,
    icon: "heart",
    desc: (level) => `Heal ${(0.8 * (level + 1)).toFixed(1)} HP per second`,
  },
  {
    id: "cryo",
    name: "Frost Rounds",
    rarity: 2,
    max: 3,
    icon: "snow",
    desc: (level) => `${25 * (level + 1)}% chance to slow enemies by 45%`,
  },
  {
    id: "shockdash",
    name: "Shock Dash",
    rarity: 2,
    max: 2,
    icon: "wing",
    desc: (level) => `Dashing through enemies deals ${level ? 90 : 60} damage`,
  },
  {
    id: "gcells",
    name: "Extra Grenades",
    rarity: 2,
    max: 3,
    icon: "target",
    desc: () => "+1 Gravity Grenade charge and 12% faster recharge",
  },
  {
    id: "gblast",
    name: "Bigger Grenade",
    rarity: 2,
    max: 4,
    icon: "burst",
    desc: () => "Gravity Grenade: +30% blast damage, +15% pull and blast radius",
  },
  {
    id: "overload",
    name: "Heat Blast",
    rarity: 2,
    max: 3,
    icon: "burst",
    desc: (level, count = level + 1) =>
      `Every 120 base weapon damage fires a 5.5 m fire cone forward (${55 + 25 * count} damage + knockback)`,
  },
  {
    id: "heatsink",
    name: "Hazard Boost",
    rarity: 2,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Triggering a map prop, dashing near a hazard, or taking hazard damage gives +${count === 1 ? 25 : 45}% fire rate for 4.5 s and +${count === 1 ? 12 : 18}% Nova charge`,
  },
  {
    id: "reactive",
    name: "Shockwave Armor",
    rarity: 2,
    max: 2,
    icon: "shield",
    desc: (level) =>
      `Blocking a hit, taking HP damage, or closely dodging a shot with dash emits a ${level ? 4.2 : 3.5} m wave (${level ? 85 : 55} damage) that clears enemy shots`,
  },
  {
    id: "pointblank",
    name: "Close Range",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level, count = level + 1) =>
      `Deal +${16 * count}% damage to enemies within 5.5 m and take -${12 * count}% contact damage`,
  },

  // Epic (Rarity 3)
  { id: "multishot", name: "Multishot", rarity: 3, max: 4, icon: "fan", desc: () => "+1 shot per attack" },
  {
    id: "ricochet",
    name: "Ricochet",
    rarity: 3,
    max: 3,
    icon: "bounce",
    desc: () => "Shots bounce to +1 nearby enemy",
  },
  {
    id: "payload",
    name: "Explosive Shots",
    rarity: 3,
    max: 5,
    icon: "burst",
    desc: (level) => `Hits explode for ${30 + 10 * level}% splash damage around the target`,
  },
  {
    id: "arc",
    name: "Chain Lightning",
    rarity: 3,
    max: 3,
    icon: "bolt",
    desc: (level, count = level + 1) =>
      `${15 + 10 * count}% chance for hits to chain lightning to ${1 + count} enemies (+1 jump on Arc Caster)`,
  },
  {
    id: "seeker",
    name: "Homing Shots",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: () => "Shots gently curve toward nearby enemies",
  },
  {
    id: "thermite",
    name: "Burn Rounds",
    rarity: 3,
    max: 3,
    icon: "flame",
    desc: (level, count = level + 1) => `Hits burn enemies for ${22 * count}% damage/s over 3 s (stacks up to 5 times)`,
  },
  {
    id: "siphon",
    name: "Life Steal",
    rarity: 3,
    max: 4,
    icon: "heart",
    desc: (level, count = level + 1) =>
      `Killing enemies has a ${12 + 6 * count}% chance to heal ${5 + count} HP (every 25th boss hit drops a heal)`,
  },
  {
    id: "rearguard",
    name: "Rear Shots",
    rarity: 3,
    max: 2,
    icon: "fan",
    desc: (level) =>
      (level === 0 ? "Also shoot behind you" : "Also shoot behind you and to both sides") +
      " at 75% damage (scales with multishot)",
  },
  {
    id: "overcharge",
    name: "Nova Charge",
    rarity: 3,
    max: 4,
    icon: "star",
    desc: (level) => `Nova charges 30% faster, +${level < 2 ? 25 : 10}% radius, and each kill adds 1% charge`,
  },
  {
    id: "gfire",
    name: "Fire Grenade",
    rarity: 3,
    max: 1,
    icon: "flame",
    desc: () =>
      "Gravity Grenade pulls bosses (35%), makes pulled enemies take +25% damage for 3.5 s, and leaves a 4 s fire zone",
  },
  {
    id: "hunter",
    name: "Boss Hunter",
    rarity: 3,
    max: 3,
    icon: "target",
    desc: (level, count = level + 1) =>
      `+${5 + 15 * count}% damage against elites, champions, bosses, and enemies below 35% HP (2\u00d7 to shields)`,
  },
  {
    id: "echo",
    name: "Double Shot",
    rarity: 3,
    max: 2,
    icon: "rate",
    desc: (level) =>
      level === 0
        ? "Every 4th attack fires a second echo volley 0.10 s later at 80% damage"
        : "Every 3rd attack fires a second echo volley 0.10 s later at 95% damage",
  },
  {
    id: "acidcoat",
    name: "Acid Coating",
    rarity: 3,
    max: 2,
    icon: "brood",
    desc: (level, count = level + 1) =>
      `${count === 1 ? 35 : 60}% of hits (100% on explosions) weaken enemies for 3.5 s (+${count === 1 ? 20 : 35}% damage taken, +${count === 1 ? 12 : 20}% on bosses)`,
  },
  {
    id: "slipstream",
    name: "Dash Boost",
    rarity: 3,
    max: 2,
    icon: "dash",
    desc: (level, count = level + 1) =>
      `For 1.0 s after dashing, your weapon shots deal +${count === 1 ? 20 : 35}% damage`,
  },
  {
    id: "surge",
    name: "Combo Blast",
    rarity: 3,
    max: 2,
    icon: "star",
    desc: (level) =>
      `Combos last ${level ? 1 : 0.5} s longer. Every ${level ? 12 : 15} combo kills (or 18th boss hit) triggers a ${level ? 4.2 : 3.6} m blast (${level ? 95 : 65} damage)`,
  },
  {
    id: "overcrit",
    name: "Super Crit",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: (level, count = level + 1) =>
      `Critical hits have a ${30 * count}% chance (+crit chance above 60%) to Super-Crit for 3.0\u00d7 damage and hit another enemy`,
  },
  {
    id: "momentum",
    name: "Growing Shots",
    rarity: 3,
    max: 2,
    icon: "pierce",
    desc: (level, count = level + 1) =>
      `Each pierce or bounce increases that shot's damage by +${count === 1 ? 22 : 38}% and size by +15%`,
  },
  {
    id: "stoke",
    name: "Ignite Pop",
    rarity: 3,
    max: 2,
    icon: "flame",
    desc: (level, count = level + 1) =>
      `Hitting a burning enemy deals +${count === 1 ? 18 : 32}% bonus damage and triggers 0.35 s of its burn right away`,
  },
  {
    id: "gsyphon",
    name: "Gravity Trap",
    rarity: 3,
    max: 2,
    icon: "target",
    desc: (level, count = level + 1) =>
      `Enemies inside Gravity Grenade take +${count === 1 ? 25 : 45}% damage; each kill inside refunds 15% cooldown`,
  },

  // Legendary (Rarity 4)
  {
    id: "wingman",
    name: "Mini Drones",
    rarity: 4,
    max: 2,
    icon: "drone",
    desc: (level) =>
      level === 0 ? "2 helper drones fly beside you and shoot enemies" : "+1 helper drone and +35% drone fire rate",
  },
  {
    id: "bloodrush",
    name: "Kill Rush",
    rarity: 4,
    max: 1,
    icon: "rate",
    desc: () => "Each kill gives +4% fire rate for 4 s (stacks up to 40%)",
  },
  {
    id: "colossus",
    name: "Giant Shots",
    rarity: 4,
    max: 1,
    icon: "burst",
    desc: () => "+60% shot size, +45% damage, -12% fire rate",
  },
  {
    id: "chrono",
    name: "Slow-Mo Dash",
    rarity: 4,
    max: 1,
    icon: "clock",
    desc: () => "Dashing slows enemies and enemy shots by 45% for 1.1 s (4.0 s cooldown)",
  },

  // Evolutions (Rarity 5)
  {
    id: "halo",
    name: "Blade Halo",
    rarity: 5,
    max: 1,
    icon: "orbit",
    evo: { orbit: 3, shield: 1 },
    desc: () => "Orbiting Blades become bigger, wider, and deal 2\u00d7 damage. Shield recharges 30% faster.",
  },
  {
    id: "cluster",
    name: "Cluster Bombs",
    rarity: 5,
    max: 1,
    icon: "burst",
    evo: { payload: 2, seeker: 1 },
    desc: () => "Explosive hits launch 2 homing mini-bombs that explode in a 1.5 m area (38% damage).",
  },
  {
    id: "storm",
    name: "Lightning Storm",
    rarity: 5,
    max: 1,
    icon: "bolt",
    evo: { arc: 2, rate: 3 },
    desc: () => "+30% lightning chance. Chain lightning jumps to 4 enemies.",
  },
  {
    id: "inferno",
    name: "Wildfire",
    rarity: 5,
    max: 1,
    icon: "flame",
    evo: { thermite: 2, dmg: 3 },
    desc: () =>
      "Burning enemies take +20% damage, and explode on death (30 + 25% max HP damage) while spreading burn nearby.",
  },
  {
    id: "phantom",
    name: "Double Dash",
    rarity: 5,
    max: 1,
    icon: "wing",
    evo: { shockdash: 1, speed: 2 },
    desc: () =>
      "+1 Dash Charge (2 charges max), -35% dash cooldown, and dashing leaves a damaging trail (65 DPS, 35% slow).",
  },
  {
    id: "gunship",
    name: "Drone Squad",
    rarity: 5,
    max: 1,
    icon: "drone",
    evo: { wingman: 1, multishot: 2 },
    desc: () => "+1 helper drone, and all drones fire a 3-shot spread.",
  },
  {
    id: "blackstar",
    name: "Black Hole",
    rarity: 5,
    max: 1,
    icon: "collapse",
    evo: { gcells: 2, gblast: 2 },
    desc: () =>
      "Gravity Grenade pulls 40% wider and fires 8 weapon shots outward when it bursts. Nova drops a free Grenade.",
  },
  {
    id: "overdrive",
    name: "Super Blaster",
    rarity: 5,
    max: 1,
    icon: "rate",
    weapon: "pulse",
    evo: { rate: 3, multishot: 1 },
    desc: () => "Every 4th shot is a super bolt: 2.4\u00d7 damage, +2 pierce, and a 1.8 m explosion on hit.",
  },
  {
    id: "shredder",
    name: "Heavy Spread",
    rarity: 5,
    max: 1,
    icon: "fan",
    weapon: "scatter",
    evo: { multishot: 1, pierce: 1 },
    desc: () => "+2 pellets per shot, and every pellet bounces once.",
  },
  {
    id: "tempest",
    name: "Thunder Chain",
    rarity: 5,
    max: 1,
    icon: "bolt",
    weapon: "tesla",
    evo: { rate: 2, crit: 2 },
    desc: () =>
      "Bolts jump to 4 enemies (82% damage kept); unused jumps hit the main target again for 45% damage each.",
  },
  {
    id: "lance",
    name: "Piercing Lance",
    rarity: 5,
    max: 1,
    icon: "pierce",
    weapon: "rail",
    evo: { pierce: 1, crit: 1 },
    desc: () =>
      "Shots pass through walls, pierce all enemies, gain +22% damage per target pierced, and deal +30% crit damage to bosses.",
  },
  {
    id: "hellfire",
    name: "Fire Rockets",
    rarity: 5,
    max: 1,
    icon: "burst",
    weapon: "rocket",
    evo: { payload: 1, dmg: 2 },
    desc: () => "Explosions are 35% bigger and set every hit enemy on fire.",
  },
  {
    id: "twinsaw",
    name: "Mega Disc",
    rarity: 5,
    max: 1,
    icon: "orbit",
    weapon: "disc",
    evo: { rate: 2, crit: 1 },
    desc: () => "Discs are 40% larger, deal 35% more damage, and curve toward enemies.",
  },
  {
    id: "dragon",
    name: "Dragon Flame",
    rarity: 5,
    max: 1,
    icon: "flame",
    weapon: "flame",
    evo: { thermite: 1, dmg: 2 },
    desc: () => "Flames reach 30% further and burn twice as hard.",
  },

  // Boss Rewards (Rarity 6)
  {
    id: "sealgrid",
    name: "Shock Cage",
    rarity: 6,
    max: 1,
    boss: "bellkeeper",
    icon: "sealgrid",
    desc: () =>
      "Every 7 s a 3.4 m cage drops on the biggest enemy group (50 DPS for 3 s), trapping enemies and slowing bosses by 30%",
  },
  {
    id: "shardfield",
    name: "Ice Shards",
    rarity: 6,
    max: 1,
    boss: "prism",
    icon: "snow",
    desc: () =>
      "Killed enemies (and every 15th boss hit) burst into 5 ice shards (22 damage, pierce 2 enemies, 1.8 s slow)",
  },
  {
    id: "brood",
    name: "Spore Swarm",
    rarity: 6,
    max: 1,
    boss: "queen",
    icon: "brood",
    desc: () =>
      "Every 6 kills (or 18th boss hit) spawns a homing spore (up to 5) that explodes for 75 damage and weakens enemies for 3.5 s",
  },
  {
    id: "collapse",
    name: "Gravity Nova",
    rarity: 6,
    max: 1,
    boss: "core",
    icon: "collapse",
    desc: () => "Your Nova pulls enemies across the whole map, then explodes 50% stronger",
  },
  {
    id: "tribute",
    name: "Forge Drop",
    rarity: 6,
    max: 1,
    boss: "tyrant",
    icon: "tribute",
    desc: () =>
      "Every 14 kills (or 20th boss hit) drops a fiery ingot: 80 blast damage, +35% fire rate & damage for 4 s, 18 shards, and 12 HP",
  },
  {
    id: "fang",
    name: "Glass Fangs",
    rarity: 6,
    max: 1,
    boss: "wyrm",
    icon: "shard",
    desc: () => "Every 10 kills (or 16th boss hit) fires 6 piercing glass spikes (34 damage, pierce 2 enemies)",
  },
];

const upgradesById = Object.fromEntries(upgradeList.map((upgrade) => [upgrade.id, upgrade]));

export { rarityWeights, bossRarityWeights, upgradeList, rarityNames, upgradesById };
