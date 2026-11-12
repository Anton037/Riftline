// Workshop modules, milestones, threat levels.

import { biomeList } from "./biomes.js";
import { weaponOrder } from "./weapons.js";

const threatMods = (threat) => ({
  hp: 1 + 0.25 * threat,
  dmg: 1 + 0.12 * threat,
  budget: 1 + 0.1 * threat,
  elite: 0.05 * threat,
  shards: 1 + 0.25 * threat,
  boss: 1 + 0.3 * threat,
});
/* 3.58.0: the text is computed from threatMods, the same numbers the run uses. Before, only Threat I said
   what it did ("+25% health, +12% damage") and II-V described themselves ("Only for tuned builds"), so the
   player chose a difficulty without knowing its size. */
const THREAT_NAMES = ["Standard", "Threat I", "Threat II", "Threat III", "Threat IV", "Threat V"],
  pct = (mul) => Math.round((mul - 1) * 100);
const threatLevels = THREAT_NAMES.map((name, lvl) => {
  const m = threatMods(lvl);
  return {
    lvl,
    name,
    desc:
      lvl === 0
        ? "The rift as it is."
        : `Enemies +${pct(m.hp)}% hull \xB7 +${pct(m.dmg)}% damage \xB7 +${pct(m.budget)}% wave size \xB7 +${Math.round(m.elite * 100)}% elite chance \xB7 bosses +${pct(m.boss)}% hull \xB7 shards +${pct(m.shards)}%`,
  };
});
const workshopModules = [
  {
    id: "hull",
    name: "Hull Plating",
    icon: "shield",
    desc: "+10 max HP per level",
    costs: [60, 120, 200, 320, 480],
  },
  { id: "power", name: "Power Core", icon: "burst", desc: "+5% damage per level", costs: [80, 160, 260, 400, 600] },
  { id: "thrust", name: "Thrusters", icon: "wing", desc: "+4% move speed per level", costs: [60, 130, 220, 340] },
  {
    id: "dash",
    name: "Dash Capacitor",
    icon: "clock",
    desc: "-8% dash cooldown per level",
    costs: [50, 110, 190, 300],
  },
  { id: "magnet", name: "Magnet Coil", icon: "magnet", desc: "+20% pickup radius per level", costs: [40, 90, 160] },
  {
    id: "salvage",
    name: "Shard Refinery", // 2.6.0: was "Salvager", the same name as the run upgrade Salvager Core
    icon: "shard",
    desc: "+10% shards per level",
    costs: [100, 200, 320, 480, 700],
  },
  { id: "reroll", name: "Reroll Chip", icon: "reroll", desc: "+1 upgrade reroll per run", costs: [150, 300, 500] },
  {
    id: "nova",
    name: "Nova Cell",
    icon: "star",
    desc: "Every wave starts with at least 25% Nova charge per level",
    costs: [120, 260, 2400, 5200],
  },
  {
    id: "insight",
    name: "Insight Module",
    icon: "eye",
    desc: "Choose from 4 upgrades instead of 3",
    costs: [1200],
  },
  { id: "revive", name: "Second Life", icon: "heart", desc: "Revive once per run at 50% HP", costs: [900] },
  // 3.25.0: take an upgrade card out of the pool for the rest of the run (once per level, at most twice a run)
  {
    id: "banish",
    name: "Banish Protocol",
    icon: "skull",
    desc: "Banish an upgrade card for the rest of the run (once per level)",
    costs: [700, 1400],
  },
];
const milestones = [
  {
    id: "kills100",
    name: "First Contact",
    desc: "Destroy 100 enemies",
    reward: 50,
    test: (save) => save.stats.kills >= 100,
  },
  { id: "wave5", name: "Holding the Line", desc: "Reach wave 5", reward: 40, test: (save) => save.stats.bestWave >= 5 },
  {
    id: "warden",
    name: "Gate Crasher",
    desc: "Defeat the Warden",
    reward: 100,
    test: (save) => (save.stats.bosses.warden || 0) > 0,
  },
  {
    id: "queen",
    name: "Regicide",
    desc: "Defeat the Hive Queen",
    reward: 150,
    test: (save) => (save.stats.bosses.queen || 0) > 0,
  },
  {
    id: "prism",
    name: "Icebreaker", // 2.4.6: was "Shattered Light" / "Defeat Prism"
    desc: "Defeat the Frost Prism",
    reward: 200,
    test: (save) => (save.stats.bosses.prism || 0) > 0,
  },
  {
    id: "wyrm",
    name: "Vitrified",
    desc: "Defeat the Glasswyrm",
    reward: 150,
    test: (save) => (save.stats.bosses.wyrm || 0) > 0,
  },
  // 3.49.0: the Ash Tyrant, boss of the Ashfall Caldera
  {
    id: "tyrant",
    name: "Mountain Falls",
    desc: "Defeat the Ash Tyrant",
    reward: 175,
    test: (save) => (save.stats.bosses.tyrant || 0) > 0,
  },
  { id: "clear", name: "Rift Sealed", desc: "Clear all 20 waves", reward: 400, test: (save) => save.stats.clears > 0 },
  {
    id: "legend",
    name: "Lucky Find",
    desc: "Pick a Legendary upgrade",
    reward: 80,
    test: (save) => save.stats.legendaries > 0,
  },
  {
    id: "flawless",
    name: "Untouchable",
    desc: "Clear wave 8 or later without taking damage",
    reward: 150,
    test: (save) => save.stats.flawless > 0,
  },
  {
    id: "kills2500",
    name: "Exterminator",
    desc: "Destroy 2,500 enemies",
    reward: 200,
    test: (save) => save.stats.kills >= 2500,
  },
  {
    id: "arsenal",
    name: "Full Arsenal",
    desc: "Unlock every weapon",
    reward: 200,
    test: (save) => weaponOrder.every((id) => save.weapons[id]),
  },
  {
    id: "maxed",
    name: "Fine Tuned",
    desc: "Max out one workshop module",
    reward: 100,
    test: (save) => workshopModules.some((mod) => (save.workshop[mod.id] || 0) >= mod.costs.length),
  },
  {
    id: "threat2",
    name: "Heat Seeker",
    desc: "Clear a run on Threat II",
    reward: 400,
    test: (save) => save.stats.bestClearThreat >= 2,
  },
  { id: "wave30", name: "Endless Echo", desc: "Reach wave 30", reward: 500, test: (save) => save.stats.bestWave >= 30 },
  {
    id: "allweapons",
    name: "Master of Arms",
    desc: "Clear a run with every weapon",
    reward: 800,
    test: (save) => weaponOrder.every((id) => (save.stats.clearsBy[id] || 0) > 0),
  },
  {
    id: "threat5",
    name: "Breach Breaker",
    desc: "Clear a run on Threat V",
    reward: 1500,
    test: (save) => save.stats.bestClearThreat >= 5,
  },
  {
    id: "evolve",
    name: "Evolution",
    desc: "Evolve two upgrades into one",
    reward: 150,
    test: (save) => save.stats.evolved > 0,
  },
  {
    id: "combo50",
    name: "Chain Reaction",
    desc: "Reach a \xD750 kill combo",
    reward: 150,
    test: (save) => save.stats.bestCombo >= 50,
  },
  {
    id: "combo150",
    name: "Unstoppable",
    desc: "Reach a \xD7150 kill combo",
    reward: 400,
    test: (save) => save.stats.bestCombo >= 150,
  },
  {
    id: "kills5000",
    name: "Rift Sweeper",
    desc: "Destroy 5,000 enemies",
    reward: 350,
    test: (save) => save.stats.kills >= 5000,
  },
  { id: "wave50", name: "Deep Breach", desc: "Reach wave 50", reward: 700, test: (save) => save.stats.bestWave >= 50 },
  {
    id: "bosses10",
    name: "Boss Hunter",
    desc: "Defeat 10 bosses total",
    reward: 500,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 10,
  },
  {
    id: "combo300",
    name: "Cascade",
    desc: "Reach a \xD7300 kill combo",
    reward: 650,
    test: (save) => save.stats.bestCombo >= 300,
  },
  {
    id: "clears5",
    name: "Veteran",
    desc: "Seal the Rift 5 times",
    reward: 450,
    test: (save) => save.stats.clears >= 5,
  },
  {
    id: "evolve3",
    name: "Master Crafter",
    desc: "Evolve upgrades 3 times",
    reward: 450,
    test: (save) => save.stats.evolved >= 3,
  },
  {
    id: "kills10000",
    name: "World Eater",
    desc: "Destroy 10,000 enemies",
    reward: 900,
    test: (save) => save.stats.kills >= 10000,
  },
  {
    id: "wave75",
    name: "Abyss Walker",
    desc: "Reach wave 75",
    reward: 1000,
    test: (save) => save.stats.bestWave >= 75,
  },
  {
    id: "combo500",
    name: "Riftstorm",
    desc: "Reach a ×500 kill combo",
    reward: 1000,
    test: (save) => save.stats.bestCombo >= 500,
  },
  {
    id: "bosses25",
    name: "Big Game",
    desc: "Defeat 25 bosses total",
    reward: 1200,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 25,
  },
];
workshopModules.push(
  // 2.3.5: Armor Core reduces enemy damage (it gave +8 max HP, next to Hull Plating's +10)
  {
    id: "armorCore",
    name: "Armor Core",
    icon: "shield",
    desc: "-4% damage from enemies per level",
    costs: [220, 420, 760, 1180],
  },
  {
    id: "droneBay",
    name: "Drone Bay",
    icon: "drone",
    desc: "+1 Wingman slot per level (needs the Wingman upgrade)",
    costs: [950, 1800],
  },
);
milestones.push(
  {
    id: "wave100",
    name: "Endless Horizon",
    desc: "Reach wave 100",
    reward: 1600,
    test: (save) => save.stats.bestWave >= 100,
  },
  {
    id: "bosses50",
    name: "Apex Protocol",
    desc: "Defeat 50 bosses total",
    reward: 1800,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 50,
  },
  {
    id: "allbiomes",
    name: "World Walker",
    // 2.4.0: the biome changes after every boss; 3.53.0: six biomes, so wave 26 is the first wave
    // of the sixth (the test reads the roster length, so it moved on its own)
    desc: "Reach wave 26 \u2014 every biome of the rift in one run",
    reward: 1100,
    test: (save) => save.stats.bestWave >= 5 * (biomeList.length - 1) + 1,
  },
  {
    id: "weaponClear10",
    name: "Full Spectrum",
    // 2.4.0: 7 weapons left (was 10 of 21)
    desc: "Clear runs with at least 4 different weapons",
    reward: 600,
    test: (save) => Object.values(save.stats.clearsBy).filter((count) => count > 0).length >= 4,
  },
);
workshopModules.push(
  // 2.3.5: Arsenal Lab raises the fire rate (it gave +5% damage, the same as Power Core)
  { id: "arsenalLab", name: "Arsenal Lab", icon: "burst", desc: "+6% fire rate per level", costs: [1800, 3600, 6500] },
  {
    id: "fieldSupply",
    name: "Field Supply",
    icon: "map",
    desc: "+1 supply cache per wave and +50% cache shards per level (not in boss waves)",
    costs: [1800, 3800, 6800],
  },
  {
    id: "hazardSeal",
    name: "Hazard Seal",
    icon: "shield",
    desc: "-15% map hazard damage per level",
    costs: [1200, 2500, 4500],
  },
);
// 3.39.0: the milestone ladders end where a goal is still seeable (the deep Endless rungs beyond these
// were scroll-past filler; a save that earned a removed one keeps it, it only leaves the list)
milestones.push(
  {
    id: "shards100k",
    name: "Shard Tycoon",
    desc: "Earn 100,000 total shards",
    reward: 2500,
    test: (save) => save.stats.shardsEarned >= 100000,
  },
  {
    id: "evolve10",
    name: "Evolution Engine",
    desc: "Evolve 10 times",
    reward: 1200,
    test: (save) => save.stats.evolved >= 10,
  },
);

workshopModules.push(
  // a head start instead of a stat: common upgrades on every new run (world.js)
  {
    id: "starterKit",
    name: "Starter Kit",
    icon: "wrench",
    desc: "Start every run with 1 random common upgrade per level",
    costs: [700, 1600, 3200],
  },
  // pays off only close to the biome's hazard (vents, ice, acid, portals; Blackout City's manholes are vents)
  {
    id: "hazardAttune",
    name: "Hazard Attunement",
    icon: "flame",
    desc: "Near a map hazard (2 m): +10% damage and +0.5 HP/s repair per level",
    costs: [1100, 2400, 4600],
  },
  // once per wave (Second Life is once per run) and before the hull is gone
  {
    id: "emergencyShield",
    name: "Emergency Shield",
    icon: "shield",
    desc: "Once per wave below 30% hull: 1 s damage barrier and 8% repair per level",
    costs: [900, 2200],
  },
);
const modulesById = Object.fromEntries(workshopModules.map((mod) => [mod.id, mod]));

export { threatMods, milestones, workshopModules, modulesById, threatLevels };
