// Wave planning: spawn plans, wave events and upgrade offers.

import { enemyDefs, enemyOrder, spawnWeights, heavyEnemies } from "../data/enemies.js";
import { clamp, weightedPick } from "./util.js";
import { rarityWeights, bossRarityWeights, upgradeList } from "../data/upgrades.js";
import { RL_BIOME_INFO } from "../data/biomes.js";

const waveEvents = {
  gilded: {
    id: "gilded",
    name: "GILDED CARAVAN",
    desc: "A golden Treasure Automaton crosses the realm · elites grant Gilded Haste · shards +50%",
    shardMul: 1.5,
    plan: { budget: 0.6, elite: 0.5 },
  },
  starfall: {
    id: "starfall",
    name: "STARFALL HARVEST",
    desc: "Telegraphed falling stars crush foes (65 damage) and burst into clusters of 3–5 star-shards",
    shardMul: 1,
    plan: { weights: { swarmer: 3, bomber: 1.6 } },
  },
  aurora: {
    id: "aurora",
    name: "AURORA TAILWIND",
    desc: "Ribbon auroras sweep the shelf · glacier sheets grant Rime Grip & faster dash recharge · shards +25%",
    shardMul: 1.25,
    biome: "shelf",
    plan: {},
  },
  mirage: {
    id: "mirage",
    name: "SUNGLASS MIRAGE",
    desc: "Mirage whirlwinds dance across the flats · dash near a whirlwind to shatter it into shards · shards +25%",
    shardMul: 1.25,
    biome: "flats",
    plan: {},
  },
  nectar: {
    id: "nectar",
    name: "FIREFLY TIDE",
    desc: "Bioluminescent pools breathe · firefly nectar globes mend Ward & grant Spore Hop · shards +25%",
    shardMul: 1.25,
    biome: "marsh",
    plan: {},
  },
  festival: {
    id: "festival",
    name: "LANTERN FESTIVAL",
    desc: "Festival lanterns warm the courtyard: bell-censers toll in sequence & braziers boost fire rate · shards +25%",
    shardMul: 1.25,
    biome: "courtyard",
    plan: {},
  },
  harmonic: {
    id: "harmonic",
    name: "ASTRAL CONVERGENCE",
    desc: "Leyline Ribbons link each portal pair (+25% player speed, slows foes) & portal shots gain +35% damage · shards +25%",
    shardMul: 1.25,
    biome: "core",
    plan: {},
  },
  forgewind: {
    id: "forgewind",
    name: "BELLOWS DRAFT",
    desc: "Great forge bellows roar: rhythmic anvil vents ignite foes & stoke Hearthburst · shards +25%",
    shardMul: 1.25,
    biome: "caldera",
    plan: {},
  },
};

const EVENT_CHANCE = 0.2;

// Cards that do nothing for the active weapon are excluded from offers.
function deadForWeapon(id, weapon, owned) {
  if (weapon === "disc") return id === "ricochet" || id === "pierce";
  if (weapon === "rail") return id === "pierce" && (owned.lance || 0) > 0;
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
    picks.push(evos[Math.floor(rng.next() * evos.length)].id);
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
        hive: 1 + Math.floor(wave / 8),
        brute: 2 + Math.floor(wave / 4),
        sniper: 2 + Math.floor(wave / 4),
        splitter: 3 + Math.floor(wave / 3),
        bulwark: 1 + Math.floor(wave / 6),
        mortar: 1 + Math.floor(wave / 6),
        striker: 2 + Math.floor(wave / 5),
        mender: 1 + Math.floor(wave / 10),
        leaper: 2 + Math.floor(wave / 5),
        turret: 1 + Math.floor(wave / 8),
        charger: 2 + Math.floor(wave / 6),
        minebot: 2 + Math.floor(wave / 8),
        sapper: 1 + Math.floor(wave / 7),
        phantom: 1 + Math.floor(wave / 8),
        sentinel: 1 + Math.floor(wave / 9),
        carrier: 1 + Math.floor(wave / 10),
        drone: 2 + Math.floor(wave / 6),
        driller: 1 + Math.floor(wave / 8),
        beacon: 1 + Math.floor(wave / 14),
        weaver: 1 + Math.floor(wave / 8),
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
      spawns.push({ type, elite: type !== "swarmer" && rng.chance(eliteChance) });
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
      gap = boss ? 7 : Math.max(1.6, 3.2 - wave * 0.06);
    let next = 0;
    for (; next < order.length;) {
      const size = groupSize + rng.int(-1, 1),
        members = [];
      let weight = 0;
      for (; next < order.length && weight < size;) {
        const spawn = order[next++];
        members.push(spawn);
        weight += spawn.type === "swarmer" ? 0.5 : 1;
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
  courtyard: "festival",
  shelf: "aurora",
  marsh: "nectar",
  core: "harmonic",
  caldera: "forgewind",
  flats: "mirage",
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
