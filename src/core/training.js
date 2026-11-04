// Isolated boss practice: real arenas and attacks, a fixed kit, and no persistent rewards.
import { World } from "./world.js";
import { computeStats } from "./stats.js";
import { bossByBiome } from "../data/enemies.js";
import { biomesById } from "../data/biomes.js";
import { own } from "./util.js";

export const TRAINING_PHASES = { full: 1, phase: 0.6, enraged: 0.18 };
export const TRAINING_KIT = { hp: 3, dmg: 3, rate: 3, speed: 2, gcells: 1, shield: 1 };

export function createTrainingWorld({ biome, phase = "full", weapon = "pulse", threat = 0 }) {
  if (!own(bossByBiome, biome) || !biomesById[biome]) throw new Error("Unknown training arena");
  if (!own(TRAINING_PHASES, phase)) phase = "full";
  const world = new World({ seed: 731, weapon, threat, ws: {} });
  world.training = { biome, phase, hpFraction: TRAINING_PHASES[phase] };
  world.route = [biome];
  world.up = { ...TRAINING_KIT };
  world.stats = computeStats(world.weapon, world.up, world.ws);
  world.player.hp = world.stats.maxHp;
  world.fx.length = 0;
  world.startWave(5, 100);
  world.plan = [];
  world.planTotal = 0;
  world.planIdx = 0;
  world.spawnBoss(bossByBiome[biome]);
  world.bossPending = null;
  // Later patterns need enough live hull to practise a full attack cycle, not a nearly dead boss.
  world.boss.maxHp = world.boss.hp = Math.max(4500 * world.tm.boss, world.boss.maxHp);
  return world;
}
