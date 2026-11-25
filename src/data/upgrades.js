// Run upgrades, evolutions, and boss rewards.

const rarityNames = ["", "Common", "Rare", "Epic", "Legendary", "Master Craft", "Boss"];
const rarityWeights = [0, 42, 32, 20, 6],
  bossRarityWeights = [0, 0, 42, 44, 14];

const upgradeList = [
  // Common (Rarity 1)
  { id: "dmg", name: "Stronger Shots", rarity: 1, max: 12, icon: "burst", desc: () => "+18% damage" },
  { id: "rate", name: "Faster Shots", rarity: 1, max: 10, icon: "rate", desc: () => "+15% fire rate" },
  { id: "hp", name: "More Health", rarity: 1, max: 10, icon: "shield", desc: () => "+25 max HP and mend 25 HP" },
  {
    id: "speed",
    name: "Fast Boots",
    rarity: 1,
    max: 6,
    icon: "wing",
    desc: () => "+10% move speed, -8% dash and ward cooldown",
  },
  {
    id: "crit",
    name: "Sharp Aim",
    rarity: 1,
    max: 8,
    icon: "crosshair",
    desc: () => "+10% crit chance, +6% crit damage, +6% shot speed and range",
  },
  {
    id: "heal",
    name: "Healing Drink",
    rarity: 1,
    max: 99,
    icon: "heart",
    desc: () => "Restore 45% of max HP",
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
    name: "Spinning Blades",
    rarity: 2,
    max: 4,
    icon: "orbit",
    desc: () => "+1 orbiting brass blade that slices enemies and intercepts shots",
  },
  {
    id: "shield",
    name: "Mirror Shield",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level) => "Block 1 hit every " + [12, 8, 5][Math.min(level, 2)] + " s (min 3.5 s cooldown)",
  },
  {
    id: "regen",
    name: "Slow Healing",
    rarity: 2,
    max: 5,
    icon: "heart",
    desc: (level) => `Restore ${(0.8 * (level + 1)).toFixed(1)} HP per second`,
  },
  {
    id: "iceShot",
    name: "Ice Shot",
    rarity: 2,
    max: 3,
    icon: "snow",
    desc: (level) => `${25 * (level + 1)}% chance to chill enemies (45% slow; 30% on bosses)`,
  },
  {
    id: "shockDash",
    name: "Shock Dash",
    rarity: 2,
    max: 2,
    icon: "wing",
    desc: (level) => `Dashing through enemies jolts them for ${level ? 90 : 60} damage`,
  },
  {
    id: "extraBells",
    name: "Extra Bells",
    rarity: 2,
    max: 3,
    icon: "target",
    desc: () => "+1 Gravity Bell charge and 12% faster recharge",
  },
  {
    id: "wideBell",
    name: "Wide Bell",
    rarity: 2,
    max: 4,
    icon: "burst",
    desc: () => "Gravity Bell: +30% blast damage, +15% pull and blast radius",
  },
  {
    id: "fireWave",
    name: "Fire Wave",
    rarity: 2,
    max: 3,
    icon: "burst",
    desc: (level, count = level + 1) =>
      `Every 120 base weapon damage unleashes a 5.5 m ember cone (${55 + 25 * count} damage + knockback)`,
  },
  {
    id: "hotBellows",
    name: "Hot Bellows",
    rarity: 2,
    max: 2,
    icon: "fireBellows",
    desc: (level, count = level + 1) =>
      `Set off a charging bell or vent, dash near an active hazard, or take hazard damage for +${count === 1 ? 25 : 45}% fire rate for 4.5 s and +${count === 1 ? 12 : 18}% Fire Burst charge`,
  },
  {
    id: "shieldPulse",
    name: "Shield Pulse",
    rarity: 2,
    max: 2,
    icon: "shield",
    desc: (level) =>
      `Blocking a hit, taking HP damage, or grazing a shot with dash emits a ${level ? 4.2 : 3.5} m pulse (${level ? 85 : 55} damage) that clears enemy shots`,
  },
  {
    id: "closeShot",
    name: "Close Shot",
    rarity: 2,
    max: 3,
    icon: "shield",
    desc: (level, count = level + 1) =>
      `Deal +${16 * count}% damage to enemies within 5.5 m and take -${12 * count}% contact damage`,
  },

  // Epic (Rarity 3)
  { id: "extraShots", name: "Extra Shots", rarity: 3, max: 4, icon: "fan", desc: () => "+1 shot per volley" },
  {
    id: "bounceShot",
    name: "Bouncing Shots",
    rarity: 3,
    max: 3,
    icon: "bounce",
    desc: () => "Shots ricochet to +1 nearby enemy",
  },
  {
    id: "blastShot",
    name: "Blast Shot",
    rarity: 3,
    max: 5,
    icon: "burst",
    desc: (level) => `Hits burst for ${30 + 10 * level}% splash damage around the target`,
  },
  {
    id: "sparkChain",
    name: "Spark Chain",
    rarity: 3,
    max: 3,
    icon: "bolt",
    desc: (level, count = level + 1) =>
      `${15 + 10 * count}% chance for hits to arc lightning to ${1 + count} enemies (+1 jump on Spark Wand)`,
  },
  {
    id: "seeker",
    name: "Seeking Shots",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: () => "Shots gently curve toward nearby enemies",
  },
  {
    id: "burningShot",
    name: "Burning Shots",
    rarity: 3,
    max: 3,
    icon: "fireBellows",
    desc: (level, count = level + 1) =>
      `Hits ignite enemies for ${11 + 11 * count}% damage/s over 3 s (stacks up to 5 times)`,
  },
  {
    id: "healingDrops",
    name: "Healing Drops",
    rarity: 3,
    max: 4,
    icon: "heart",
    desc: (level, count = level + 1) =>
      `Defeating enemies has a ${12 + 6 * count}% chance to mend ${5 + count} HP (every 25th boss hit drops a mend orb)`,
  },
  {
    id: "backShot",
    name: "Back Shot",
    rarity: 3,
    max: 2,
    icon: "fan",
    desc: (level) =>
      (level === 0 ? "Fire extra shots backward" : "Fire extra shots backward and to both sides") +
      " at 75% damage (scales with Extra Shots)",
  },
  {
    id: "extraCharge",
    name: "Extra Charge",
    rarity: 3,
    max: 4,
    icon: "star",
    desc: (level) => `Fire Burst charges 30% faster, +${level < 2 ? 25 : 10}% radius, and each kill adds 1% charge`,
  },
  {
    id: "fireBell",
    name: "Fire Bell",
    rarity: 3,
    max: 1,
    icon: "fireBellows",
    desc: () =>
      "Gravity Bell tugs bosses (35%), marks pulled enemies for +25% damage taken (3.5 s), and leaves a 4 s ember pool",
  },
  {
    id: "hunter",
    name: "Heavy Hunter",
    rarity: 3,
    max: 3,
    icon: "target",
    desc: (level, count = level + 1) =>
      `+${5 + 15 * count}% damage against elites, champions, bosses, and enemies below 35% HP (2\u00d7 to wards)`,
  },
  {
    id: "echo",
    name: "Echo Shot",
    rarity: 3,
    max: 2,
    icon: "rate",
    desc: (level) =>
      level === 0
        ? "Every 4th attack rings a second echo volley 0.10 s later at 80% damage"
        : "Every 3rd attack rings a second echo volley 0.10 s later at 95% damage",
  },
  {
    id: "acidCoat",
    name: "Acid Coat",
    rarity: 3,
    max: 2,
    icon: "mossHelpers",
    desc: (level, count = level + 1) =>
      `${count === 1 ? 35 : 60}% of hits (100% on blasts) glaze enemies for 3.5 s (+${count === 1 ? 20 : 35}% damage taken, +${count === 1 ? 12 : 20}% on bosses)`,
  },
  {
    id: "dashBoost",
    name: "Dash Boost",
    rarity: 3,
    max: 2,
    icon: "dash",
    desc: (level, count = level + 1) =>
      `For 1.0 s after dashing, your weapon shots deal +${count === 1 ? 20 : 35}% damage`,
  },
  {
    id: "bellWave",
    name: "Bell Wave",
    rarity: 3,
    max: 2,
    icon: "star",
    desc: (level) =>
      `Combos linger ${level ? 1 : 0.5} s longer. Every ${level ? 12 : 15} combo kills (or 18th boss hit) rings a ${level ? 4.2 : 3.6} m blast (${level ? 95 : 65} damage)`,
  },
  {
    id: "superCrit",
    name: "Big Crits",
    rarity: 3,
    max: 2,
    icon: "crosshair",
    desc: (level, count = level + 1) =>
      `Critical hits have a ${30 * count}% chance (+crit chance above 60%) to Super-Crit for 3.0\u00d7 damage and cleave a nearby enemy`,
  },
  {
    id: "momentum",
    name: "Growing Shots",
    rarity: 3,
    max: 2,
    icon: "pierce",
    desc: (level, count = level + 1) =>
      `Each pierce or ricochet empowers that shot by +${count === 1 ? 22 : 38}% damage and +15% size`,
  },
  {
    id: "hotShot",
    name: "Hot Shot",
    rarity: 3,
    max: 2,
    icon: "fireBellows",
    desc: (level, count = level + 1) =>
      `Hitting a burning enemy deals +${count === 1 ? 18 : 32}% bonus damage and pops 0.35 s of its burn immediately`,
  },
  {
    id: "bellBoost",
    name: "Bell Boost",
    rarity: 3,
    max: 2,
    icon: "target",
    desc: (level, count = level + 1) =>
      `Enemies inside Gravity Bell take +${count === 1 ? 25 : 45}% damage; each kill inside refunds 15% cooldown`,
  },

  // Legendary (Rarity 4)
  {
    id: "helperWisps",
    name: "Helper Wisps",
    rarity: 4,
    max: 2,
    icon: "dartSprite",
    desc: (level) =>
      level === 0 ? "2 guiding wisps orbit beside you and fire at enemies" : "+1 guiding wisp and +35% wisp fire rate",
  },
  {
    id: "killStreak",
    name: "Quick Streak",
    rarity: 4,
    max: 1,
    icon: "rate",
    desc: () => "Each kill (or every 10th boss hit) grants +4% fire rate for 4 s (stacks up to 40%)",
  },
  {
    id: "largeShots",
    name: "Large Shots",
    rarity: 4,
    max: 1,
    icon: "burst",
    desc: () => "+60% shot size, +45% damage, -12% fire rate",
  },
  {
    id: "timeDash",
    name: "Time Dash",
    rarity: 4,
    max: 1,
    icon: "clock",
    desc: () => "Dashing slows enemies and enemy shots by 45% for 1.1 s (4.0 s cooldown)",
  },

  // Masterworks / Evolutions (Rarity 5)
  {
    id: "halo",
    name: "Golden Halo",
    rarity: 5,
    max: 1,
    icon: "orbit",
    evo: { orbit: 2, shield: 1 },
    desc: () => "Spinning Blades grow wider, larger, and deal 2\u00d7 damage. Mirror Shield recharges 30% faster.",
  },
  {
    id: "fireflyShots",
    name: "Firefly Shots",
    rarity: 5,
    max: 1,
    icon: "burst",
    evo: { blastShot: 2, seeker: 1 },
    desc: () => "Powder blasts scatter 2 seeking ember bomblets that burst in a 1.5 m area (38% damage).",
  },
  {
    id: "storm",
    name: "Spark Storm",
    rarity: 5,
    max: 1,
    icon: "bolt",
    evo: { sparkChain: 2, rate: 1 },
    desc: () => "+30% lightning chance. Spark Chain arcs leap to 4 enemies.",
  },
  {
    id: "wildfire",
    name: "Wildfire",
    rarity: 5,
    max: 1,
    icon: "fireBellows",
    evo: { burningShot: 2, dmg: 1 },
    desc: () =>
      "Burning enemies take +20% damage, and burst on death (30 + 25% max HP damage) while spreading embers nearby.",
  },
  {
    id: "ghostDash",
    name: "Ghost Dash",
    rarity: 5,
    max: 1,
    icon: "wing",
    evo: { shockDash: 1, speed: 2 },
    desc: () => "+1 Dash Charge (2 max), -35% dash cooldown, and dashing leaves a crackling trail (65 DPS, 35% slow).",
  },
  {
    id: "wispSwarm",
    name: "Wisp Swarm",
    rarity: 5,
    max: 1,
    icon: "dartSprite",
    evo: { helperWisps: 1, extraShots: 1 },
    desc: () => "+1 guiding wisp, and all wisps fire a 3-bolt fan.",
  },
  {
    id: "fireWell",
    name: "Fire Well",
    rarity: 5,
    max: 1,
    icon: "collapse",
    evo: { extraBells: 1, wideBell: 2 },
    desc: () =>
      "Gravity Bell pulls 40% wider and fires 8 weapon bolts outward on collapse. Fire Burst drops a free Chime.",
  },
  {
    id: "sunGun",
    name: "Sun Gun",
    rarity: 5,
    max: 1,
    icon: "rate",
    weapon: "lanternGun",
    evo: { rate: 2, extraShots: 1 },
    desc: () => "Every 4th shot is a solar bolt: 2.4\u00d7 damage, +2 pierce, and a 1.8 m burst on hit.",
  },
  {
    id: "stormShotgun",
    name: "Storm Shotgun",
    rarity: 5,
    max: 1,
    icon: "fan",
    weapon: "brassShotgun",
    evo: { extraShots: 1, pierce: 1 },
    desc: () => "+2 brass shot per volley, and every pellet ricochets once.",
  },
  {
    id: "stormWand",
    name: "Storm Wand",
    rarity: 5,
    max: 1,
    icon: "bolt",
    weapon: "sparkWand",
    evo: { rate: 1, crit: 2 },
    desc: () =>
      "Arcs leap to 4 enemies (82% damage kept); unused jumps strike the primary target again for 45% damage each.",
  },
  {
    id: "starLance",
    name: "Bright Spear",
    rarity: 5,
    max: 1,
    icon: "pierce",
    weapon: "starSpear",
    evo: { pierce: 1, crit: 1 },
    desc: () =>
      "Lances pass through cover, pierce all enemies, gain +22% damage per target pierced, and deal +30% crit damage to bosses.",
  },
  {
    id: "wideBlast",
    name: "Wide Blast",
    rarity: 5,
    max: 1,
    icon: "burst",
    weapon: "emberLauncher",
    evo: { blastShot: 1, dmg: 2 },
    desc: () => "Mortar blasts are 35% wider and ignite every enemy caught in the burst.",
  },
  {
    id: "twinRings",
    name: "Twin Rings",
    rarity: 5,
    max: 1,
    icon: "orbit",
    weapon: "ringBlade",
    evo: { rate: 2, crit: 1 },
    desc: () => "Chakrams are 40% larger, deal 35% more damage, and curve toward enemies.",
  },
  {
    id: "dragon",
    name: "Dragon Fire",
    rarity: 5,
    max: 1,
    icon: "fireBellows",
    weapon: "fireBellows",
    evo: { burningShot: 1, dmg: 2 },
    desc: () => "Hearth plumes reach 30% farther and burn twice as fiercely.",
  },

  // Boss Rewards (Rarity 6)
  {
    id: "bellCage",
    name: "Bell Cage",
    rarity: 6,
    max: 1,
    boss: "bellKeeper",
    icon: "bellCage",
    desc: () =>
      "Every 7 s a 3.4 m gilded cage drops on the largest pack (50 DPS for 3 s), binding enemies and slowing bosses by 30%",
  },
  {
    id: "iceShards",
    name: "Ice Shards",
    rarity: 6,
    max: 1,
    boss: "iceCrystal",
    icon: "snow",
    desc: () =>
      "Felled enemies (and every 15th boss hit) burst into 5 frost splinters (22 damage, pierce 2 enemies, 1.8 s chill)",
  },
  {
    id: "mossHelpers",
    name: "Moss Helpers",
    rarity: 6,
    max: 1,
    boss: "mossQueen",
    icon: "mossHelpers",
    desc: () =>
      "Every 6 kills (or 18th boss hit) spawns a seeking spore (up to 5) that bursts for 75 damage and glazes enemies for 3.5 s",
  },
  {
    id: "collapse",
    name: "Star Pull",
    rarity: 6,
    max: 1,
    boss: "starHeart",
    icon: "collapse",
    desc: () => "Your Fire Burst pulls enemies across the whole arena, then bursts 50% stronger",
  },
  {
    id: "forgeGift",
    name: "Forge Gift",
    rarity: 6,
    max: 1,
    boss: "emberKing",
    icon: "forgeGift",
    desc: () =>
      "Every 14 kills (or 20th boss hit) drops a molten ingot: 80 blast damage, +35% fire rate & damage for 4 s, 18 shards, and 12 HP",
  },
  {
    id: "dragonFang",
    name: "Dragon Fang",
    rarity: 6,
    max: 1,
    boss: "sandDragon",
    icon: "shard",
    desc: () => "Every 10 kills (or 16th boss hit) fires 6 piercing sunglass fangs (34 damage, pierce 2 enemies)",
  },
];

const upgradesById = Object.fromEntries(upgradeList.map((upgrade) => [upgrade.id, upgrade]));

export { rarityWeights, bossRarityWeights, upgradeList, rarityNames, upgradesById };
