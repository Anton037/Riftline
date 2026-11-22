// Sanctuary Workshop crafts, Wayfarer Milestones, and Trial levels.

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
const THREAT_NAMES = ["Wayfarer", "Trial I", "Trial II", "Trial III", "Trial IV", "Trial V"],
  pct = (mul) => Math.round((mul - 1) * 100);
const threatLevels = THREAT_NAMES.map((name, lvl) => {
  const m = threatMods(lvl);
  return {
    lvl,
    name,
    desc:
      lvl === 0
        ? "A gentle expedition across the six miniature realms."
        : `Foes +${pct(m.hp)}% Ward \xB7 +${pct(m.dmg)}% damage \xB7 +${pct(m.budget)}% wave size \xB7 +${Math.round(m.elite * 100)}% elite chance \xB7 guardians +${pct(m.boss)}% Ward \xB7 shards +${pct(m.shards)}%`,
  };
});
const workshopModules = [
  {
    id: "hull",
    name: "Heartwood Plating",
    icon: "shield",
    desc: "+10 max Ward per level",
    costs: [60, 120, 200, 320, 480],
  },
  { id: "power", name: "Kiln Core", icon: "burst", desc: "+5% damage per level", costs: [80, 160, 260, 400, 600] },
  {
    id: "thrust",
    name: "Wayfarer's Stride",
    icon: "wing",
    desc: "+4% move speed per level",
    costs: [60, 130, 220, 340],
  },
  {
    id: "dash",
    name: "Tumble Spring",
    icon: "clock",
    desc: "-8% dash cooldown per level",
    costs: [50, 110, 190, 300],
  },
  { id: "magnet", name: "Lodestone Charm", icon: "magnet", desc: "+20% pickup radius per level", costs: [40, 90, 160] },
  {
    id: "salvage",
    name: "Shard Kiln",
    icon: "shard",
    desc: "+10% star-shards per level",
    costs: [100, 200, 320, 480, 700],
  },
  { id: "reroll", name: "Fate Dice", icon: "reroll", desc: "+1 craft reroll per run", costs: [150, 300, 500] },
  {
    id: "nova",
    name: "Sunburst Phial",
    icon: "star",
    desc: "Every wave begins with at least 25% Hearthburst charge per level",
    costs: [120, 260, 2400, 5200],
  },
  {
    id: "insight",
    name: "Artificer's Lens",
    icon: "eye",
    desc: "Choose from 4 crafts instead of 3",
    costs: [1200],
  },
  { id: "revive", name: "Phoenix Ember", icon: "heart", desc: "Rekindle once per run at 50% Ward", costs: [900] },
  {
    id: "banish",
    name: "Seal of Warding",
    icon: "skull",
    desc: "Seal away a craft card for the rest of the run (once per level)",
    costs: [700, 1400],
  },
];
const milestones = [
  {
    id: "kills100",
    name: "First Lantern",
    desc: "Defeat 100 foes",
    reward: 50,
    test: (save) => save.stats.kills >= 100,
  },
  { id: "wave5", name: "Courtyard Watch", desc: "Reach wave 5", reward: 40, test: (save) => save.stats.bestWave >= 5 },
  {
    id: "bellkeeper",
    name: "Bell Ringer",
    desc: "Defeat the Bellkeeper",
    reward: 100,
    test: (save) => (save.stats.bosses.bellkeeper || 0) > 0,
  },
  {
    id: "queen",
    name: "Toadstool Crown",
    desc: "Defeat the Brood-Empress",
    reward: 150,
    test: (save) => (save.stats.bosses.queen || 0) > 0,
  },
  {
    id: "prism",
    name: "Rime-Breaker",
    desc: "Defeat the Frost Prism",
    reward: 200,
    test: (save) => (save.stats.bosses.prism || 0) > 0,
  },
  {
    id: "wyrm",
    name: "Sunglass Tamer",
    desc: "Defeat the Glasswyrm",
    reward: 150,
    test: (save) => (save.stats.bosses.wyrm || 0) > 0,
  },
  {
    id: "tyrant",
    name: "Anvil Quencher",
    desc: "Defeat the Ash Tyrant",
    reward: 175,
    test: (save) => (save.stats.bosses.tyrant || 0) > 0,
  },
  {
    id: "clear",
    name: "Realms Mended",
    desc: "Clear all 20 waves",
    reward: 400,
    test: (save) => save.stats.clears > 0,
  },
  {
    id: "legend",
    name: "Gilded Curio",
    desc: "Claim a Legendary craft",
    reward: 80,
    test: (save) => save.stats.legendaries > 0,
  },
  {
    id: "flawless",
    name: "Unscathed",
    desc: "Clear wave 8 or later without taking damage",
    reward: 150,
    test: (save) => save.stats.flawless > 0,
  },
  {
    id: "kills2500",
    name: "Sanctuary Warden",
    desc: "Defeat 2,500 foes",
    reward: 200,
    test: (save) => save.stats.kills >= 2500,
  },
  {
    id: "arsenal",
    name: "Master Armory",
    desc: "Unlock every artificer arm",
    reward: 200,
    test: (save) => weaponOrder.every((id) => save.weapons[id]),
  },
  {
    id: "maxed",
    name: "Masterwork",
    desc: "Complete one Sanctuary craft",
    reward: 100,
    test: (save) => workshopModules.some((mod) => (save.workshop[mod.id] || 0) >= mod.costs.length),
  },
  {
    id: "threat2",
    name: "Seasoned Wayfarer",
    desc: "Clear a run on Trial II",
    reward: 400,
    test: (save) => save.stats.bestClearThreat >= 2,
  },
  {
    id: "wave30",
    name: "Starlit Horizon",
    desc: "Reach wave 30",
    reward: 500,
    test: (save) => save.stats.bestWave >= 30,
  },
  {
    id: "allweapons",
    name: "Guild Grandmaster",
    desc: "Clear a run with every arm",
    reward: 800,
    test: (save) => weaponOrder.every((id) => (save.stats.clearsBy[id] || 0) > 0),
  },
  {
    id: "threat5",
    name: "Lantern Sovereign",
    desc: "Clear a run on Trial V",
    reward: 1500,
    test: (save) => save.stats.bestClearThreat >= 5,
  },
  {
    id: "evolve",
    name: "Transmutation",
    desc: "Evolve two crafts into a masterwork",
    reward: 150,
    test: (save) => save.stats.evolved > 0,
  },
  {
    id: "combo50",
    name: "Ringing Chimes",
    desc: "Reach a \xD750 defeat combo",
    reward: 150,
    test: (save) => save.stats.bestCombo >= 50,
  },
  {
    id: "combo150",
    name: "Golden Cadence",
    desc: "Reach a \xD7150 defeat combo",
    reward: 400,
    test: (save) => save.stats.bestCombo >= 150,
  },
  {
    id: "kills5000",
    name: "Realm Keeper",
    desc: "Defeat 5,000 foes",
    reward: 350,
    test: (save) => save.stats.kills >= 5000,
  },
  {
    id: "wave50",
    name: "Deep Expedition",
    desc: "Reach wave 50",
    reward: 700,
    test: (save) => save.stats.bestWave >= 50,
  },
  {
    id: "bosses10",
    name: "Guardian Bane",
    desc: "Defeat 10 guardians total",
    reward: 500,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 10,
  },
  {
    id: "combo300",
    name: "Carillon",
    desc: "Reach a \xD7300 defeat combo",
    reward: 650,
    test: (save) => save.stats.bestCombo >= 300,
  },
  {
    id: "clears5",
    name: "Chronicler",
    desc: "Mend the Realms 5 times",
    reward: 450,
    test: (save) => save.stats.clears >= 5,
  },
  {
    id: "evolve3",
    name: "Master Artificer",
    desc: "Evolve crafts 3 times",
    reward: 450,
    test: (save) => save.stats.evolved >= 3,
  },
  {
    id: "kills10000",
    name: "Legend of the Hearth",
    desc: "Defeat 10,000 foes",
    reward: 900,
    test: (save) => save.stats.kills >= 10000,
  },
  {
    id: "wave75",
    name: "Astral Wayfarer",
    desc: "Reach wave 75",
    reward: 1000,
    test: (save) => save.stats.bestWave >= 75,
  },
  {
    id: "combo500",
    name: "Grand Carillon",
    desc: "Reach a \xD7500 defeat combo",
    reward: 1000,
    test: (save) => save.stats.bestCombo >= 500,
  },
  {
    id: "bosses25",
    name: "Titan-Queller",
    desc: "Defeat 25 guardians total",
    reward: 1200,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 25,
  },
];
workshopModules.push(
  {
    id: "armorCore",
    name: "Filigree Mail",
    icon: "shield",
    desc: "-4% damage from foes per level",
    costs: [220, 420, 760, 1180],
  },
  {
    id: "droneBay",
    name: "Sprite Perch",
    icon: "drone",
    desc: "+1 Lantern Sprite slot per level (requires Lantern Sprite)",
    costs: [950, 1800],
  },
);
milestones.push(
  {
    id: "wave100",
    name: "Eternal Lantern",
    desc: "Reach wave 100",
    reward: 1600,
    test: (save) => save.stats.bestWave >= 100,
  },
  {
    id: "bosses50",
    name: "Mythic Warden",
    desc: "Defeat 50 guardians total",
    reward: 1800,
    test: (save) => Object.values(save.stats.bosses).reduce((sum, count) => sum + count, 0) >= 50,
  },
  {
    id: "allbiomes",
    name: "Six-Realm Pilgrim",
    desc: "Reach wave 26 \u2014 visit all six miniature realms in one run",
    reward: 1100,
    test: (save) => save.stats.bestWave >= 5 * (biomeList.length - 1) + 1,
  },
  {
    id: "weaponClear10",
    name: "Fourfold Craft",
    desc: "Clear runs with at least 4 different arms",
    reward: 600,
    test: (save) => Object.values(save.stats.clearsBy).filter((count) => count > 0).length >= 4,
  },
);
workshopModules.push(
  {
    id: "arsenalLab",
    name: "Clockwork Bench",
    icon: "burst",
    desc: "+6% fire rate per level",
    costs: [1800, 3600, 6500],
  },
  {
    id: "fieldSupply",
    name: "Wayfarer Chests",
    icon: "map",
    desc: "+1 wayfarer chest per wave and +50% chest shards per level (outside guardian waves)",
    costs: [1800, 3800, 6800],
  },
  {
    id: "hazardSeal",
    name: "Weathering Glaze",
    icon: "shield",
    desc: "-15% realm hazard damage per level",
    costs: [1200, 2500, 4500],
  },
);
milestones.push(
  {
    id: "shards100k",
    name: "Star-Vault Keeper",
    desc: "Gather 100,000 total star-shards",
    reward: 2500,
    test: (save) => save.stats.shardsEarned >= 100000,
  },
  {
    id: "evolve10",
    name: "Alchemical Mastery",
    desc: "Evolve crafts 10 times",
    reward: 1200,
    test: (save) => save.stats.evolved >= 10,
  },
);

workshopModules.push(
  {
    id: "starterKit",
    name: "Wayfarer Pack",
    icon: "wrench",
    desc: "Begin every run with 1 random Common craft per level",
    costs: [700, 1600, 3200],
  },
  {
    id: "hazardAttune",
    name: "Leyline Attunement",
    icon: "flame",
    desc: "Near a realm hazard (2 m): +10% damage and +0.5 Ward/s mending per level",
    costs: [1100, 2400, 4600],
  },
  {
    id: "emergencyShield",
    name: "Sanctuary Bell",
    icon: "shield",
    desc: "Once per wave below 30% Ward: 1 s warding bell and 8% mending per level",
    costs: [900, 2200],
  },
);

export { threatMods, milestones, workshopModules, threatLevels };
