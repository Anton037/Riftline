// Wave planning: spawn plans, wave events and upgrade offers.

import { enemyDefs, enemyOrder, spawnWeights, heavyEnemies } from "../data/enemies.js";
import { clamp, weightedPick } from "./util.js";
import { rarityWeights, bossRarityWeights, upgradeList } from "../data/upgrades.js";
import { RL_BIOME_INFO } from "../data/biomes.js";

const waveEvents = {
  goldCart: {
    id: "goldCart",
    name: "Gold Cart",
    desc: "A golden merchant carriage crosses the arena · elites grant speed & fire rate · shards +50%",
    shardMul: 1.5,
    plan: { budget: 0.6, elite: 0.5 },
  },
  starfall: {
    id: "starfall",
    name: "Falling Stars",
    desc: "Falling comets strike enemies (65 damage) and scatter clusters of 3–5 shards",
    shardMul: 1,
    plan: { weights: { smallBug: 3, firePot: 1.6 } },
  },
  snowWind: {
    id: "snowWind",
    name: "Snow Wind",
    desc: "Ice improves grip and recharges dash faster · shards +25%",
    shardMul: 1.25,
    biome: "snowRidge",
    plan: {},
  },
  sandstorm: {
    id: "sandstorm",
    name: "Sandstorm",
    desc: "More whirlwinds roam · dash by one to release shards · shards +25%",
    shardMul: 1.25,
    biome: "sunDunes",
    plan: {},
  },
  fireflies: {
    id: "fireflies",
    name: "Fireflies",
    desc: "Fireflies heal you and boost movement speed · shards +25%",
    shardMul: 1.25,
    biome: "mossBog",
    plan: {},
  },
  festival: {
    id: "festival",
    name: "Lantern Festival",
    desc: "Lanterns make you fire faster · bells ring in order · shards +25%",
    shardMul: 1.25,
    biome: "lanternYard",
    plan: {},
  },
  starPaths: {
    id: "starPaths",
    name: "Star Paths",
    desc: "Paths link portals (+25% speed, slows enemies) · warped shots deal +35% damage · shards +25%",
    shardMul: 1.25,
    biome: "starHall",
    plan: {},
  },
  hotWind: {
    id: "hotWind",
    name: "Hot Wind",
    desc: "Lava vents burn enemies and charge Fire Burst faster · shards +25%",
    shardMul: 1.25,
    biome: "emberHill",
    plan: {},
  },
};

const EVENT_CHANCE = 0.2;

// Cards that do nothing for the active weapon are excluded from offers.
function deadForWeapon(id, weapon, owned) {
  if (weapon === "ringBlade") return id === "bounceShot" || id === "pierce";
  if (weapon === "starSpear") return id === "pierce" && (owned.starLance || 0) > 0;
  return false;
}

// Dampened rarity pool weighting so larger Rare/Epic pools never dilute individual card weights below Legendaries.
function rollUpgradeOffer(rng, owned, wave, hpFrac, count, boss, exclude = [], weapon = null, banned = []) {
  const pool = upgradeList.filter(
      (upgrade) =>
        !(
          upgrade.evo ||
          banned.includes(upgrade.id) ||
          upgrade.boss ||
          deadForWeapon(upgrade.id, weapon, owned) ||
          (owned[upgrade.id] || 0) >= upgrade.max ||
          (upgrade.id === "heal" && hpFrac > 0.7) ||
          (boss && upgrade.rarity < 2)
        ),
    ),
    weightOf = (upgrade) => {
      let weight = (boss ? bossRarityWeights : rarityWeights)[upgrade.rarity] || 1;
      if (!boss) {
        if (upgrade.rarity === 3) weight += wave * 0.35;
        if (upgrade.rarity === 4) weight += wave * 0.15;
      }
      if (upgrade.id === "heal") {
        weight *= hpFrac < 0.35 ? 3 : 1.2;
      }
      if (exclude.includes(upgrade.id)) {
        weight *= 0.05;
      }
      // Square-root pool-size dampening prevents large Rare/Epic pools from dropping below Legendary per-card weight
      return weight / Math.sqrt(Math.max(1, countRarity(pool, upgrade.rarity)));
    },
    picks = [],
    evos = upgradeList.filter(
      (upgrade) =>
        upgrade.evo &&
        !owned[upgrade.id] &&
        !banned.includes(upgrade.id) &&
        (!upgrade.weapon || upgrade.weapon === weapon) &&
        Object.entries(upgrade.evo).every(([id, need]) => (owned[id] || 0) >= need),
    );
  if (evos.length) {
    const weights = evos.map((upgrade) => (upgrade.weapon ? 3 : 1) * (exclude.includes(upgrade.id) ? 0.05 : 1));
    picks.push(weightedPick(rng, evos, weights).id);
  }
  const left = pool.slice();
  for (; picks.length < count && left.length;) {
    let total = 0;
    for (const upgrade of left) total += weightOf(upgrade);
    let roll = rng.next() * total,
      pick = left[left.length - 1];
    for (const upgrade of left) {
      roll -= weightOf(upgrade);
      if (roll <= 0) {
        pick = upgrade;
        break;
      }
    }
    picks.push(pick.id);
    left.splice(left.indexOf(pick), 1);
  }
  // Never offer only Common cards: upgrade the last slot to Rare or higher
  if (!boss && picks.length > 1 && picks.every((id) => upgradeList.find((upgrade) => upgrade.id === id).rarity < 2)) {
    const better = left.filter((upgrade) => upgrade.rarity >= 2);
    let total = 0;
    for (const upgrade of better) total += weightOf(upgrade);
    if (better.length) {
      let roll = rng.next() * total,
        pick = better[better.length - 1];
      for (const upgrade of better) {
        roll -= weightOf(upgrade);
        if (roll <= 0) {
          pick = upgrade;
          break;
        }
      }
      picks[picks.length - 1] = pick.id;
    }
  }
  return picks;
}

function countRarity(list, rarity) {
  let count = 0;
  for (const upgrade of list) {
    if (upgrade.rarity === rarity) count++;
  }
  return count;
}

function waveBudget(wave, tm) {
  return (16 + 8 * wave + 0.3 * wave * wave) * tm.budget;
}

function planWave(rng, wave, tm, boss, plan = {}) {
  const mix = RL_BIOME_MIX_CUR;
  let early = [],
    saved = [];
  if (mix) {
    early =
      rlBiomeStart(wave) > 1
        ? Object.keys(mix).filter((id) => mix[id] >= 1 && enemyDefs[id] && enemyDefs[id].from > wave)
        : [];
    const weights = { ...(plan.weights || {}) };
    if (early.length) {
      saved = early.map((id) => enemyDefs[id].from);
      for (const id of early) weights[id] = (weights[id] || 1) * RL_EARLY_WEIGHT_250;
    }
    for (const [id, mul] of Object.entries(mix)) weights[id] = (weights[id] || 1) * mul;
    plan = { ...plan, weights };
  }
  try {
    const start = rlBiomeStart(wave);
    for (const id of early) enemyDefs[id].from = start;
    let budget =
      waveBudget(wave, tm) * (boss ? 0.18 + 0.025 * Math.min(6, Math.floor(wave / 5) - 1) : 1) * (plan.budget || 1);
    const types = enemyOrder.filter((type) => enemyDefs[type].from <= wave && (!boss || !heavyEnemies[type])),
      caps = {
        mushroomNest: 1 + Math.floor(wave / 8),
        ironGolem: 2 + Math.floor(wave / 4),
        longshot: 2 + Math.floor(wave / 4),
        sporePod: 3 + Math.floor(wave / 3),
        shieldGuard: 1 + Math.floor(wave / 6),
        bellCannon: 1 + Math.floor(wave / 6),
        blinkBlade: 2 + Math.floor(wave / 5),
        mossHealer: 1 + Math.floor(wave / 10),
        bogHopper: 2 + Math.floor(wave / 5),
        watchTower: 1 + Math.floor(wave / 8),
        wildBoar: 2 + Math.floor(wave / 6),
        mineCart: 2 + Math.floor(wave / 8),
        bombMaker: 1 + Math.floor(wave / 7),
        starGhost: 1 + Math.floor(wave / 8),
        crystalTower: 1 + Math.floor(wave / 9),
        supplyKite: 1 + Math.floor(wave / 10),
        dartSprite: 2 + Math.floor(wave / 6),
        burrowMole: 1 + Math.floor(wave / 8),
        healingStone: 1 + Math.floor(wave / 14),
        starSpider: 1 + Math.floor(wave / 8),
      },
      counts = {},
      spawns = [],
      eliteChance = plan.elite != null ? plan.elite : wave >= 6 ? 0.035 + 0.006 * wave + tm.elite : 0;
    let tries = 0;
    for (; budget >= 1 && tries++ < 500;) {
      const fits = types.filter((type) => enemyDefs[type].cost <= budget && (counts[type] || 0) < (caps[type] ?? 999));
      if (!fits.length) break;
      const type = weightedPick(
        rng,
        fits,
        fits.map((type) => spawnWeights[type] * ((plan.weights && plan.weights[type]) || 1)),
      );
      counts[type] = (counts[type] || 0) + 1;
      budget -= enemyDefs[type].cost;
      spawns.push({ type, elite: type !== "smallBug" && rng.chance(eliteChance) });
    }
    for (let i = spawns.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
    }
    const quarter = Math.floor(spawns.length / 4),
      head = spawns.slice(0, quarter),
      tail = spawns.slice(quarter),
      heavyHead = head.filter((spawn) => heavyEnemies[spawn.type] || spawn.elite),
      order = head.filter((spawn) => !(heavyEnemies[spawn.type] || spawn.elite)).concat(tail, heavyHead),
      groups = [],
      groupSize = clamp(4 + Math.floor(wave / 2.5), 4, 12),
      gap = boss ? 6.1 : Math.max(1.4, 2.85 - wave * 0.055);
    let next = 0;
    for (; next < order.length;) {
      const size = groupSize + rng.int(-1, 1),
        members = [];
      let weight = 0;
      for (; next < order.length && weight < size;) {
        const spawn = order[next++];
        members.push(spawn);
        weight += spawn.type === "smallBug" ? 0.5 : 1;
      }
      groups.push({ gap: gap * rng.range(0.85, 1.15), members });
    }
    return groups;
  } finally {
    early.forEach((id, k) => (enemyDefs[id].from = saved[k]));
  }
}

let RL_BIOME_MIX_CUR = null;
function set_RL_BIOME_MIX_CUR(mix) {
  return (RL_BIOME_MIX_CUR = mix);
}

const RL_BIOME_EVENT = {
  lanternYard: "festival",
  snowRidge: "snowWind",
  mossBog: "fireflies",
  starHall: "starPaths",
  emberHill: "hotWind",
  sunDunes: "sandstorm",
};

const RL_EARLY_WEIGHT_250 = 0.5;
function rlBiomeStart(wave) {
  return Math.floor((Math.max(1, wave) - 1) / 5) * 5 + 1;
}

function rlEnemyFrom(type, biome, wave) {
  const def = enemyDefs[type];
  if (!def) return 99;
  const mix = RL_BIOME_INFO[biome]?.mix;
  return mix && mix[type] >= 1 && rlBiomeStart(wave) > 1 ? Math.min(def.from, rlBiomeStart(wave)) : def.from;
}

export {
  waveEvents,
  EVENT_CHANCE,
  planWave,
  rollUpgradeOffer,
  set_RL_BIOME_MIX_CUR,
  RL_BIOME_EVENT,
  rlEnemyFrom,
  rlBiomeStart,
};
