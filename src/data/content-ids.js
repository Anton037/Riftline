// IDs from previous releases are accepted when loading saves. The layout salts remain stable.
const WEAPONS = {
  pulse: "lanternGun",
  scatter: "brassShotgun",
  tesla: "sparkWand",
  rail: "starSpear",
  rocket: "emberLauncher",
  disc: "ringBlade",
  flame: "fireBellows",
};
const WORKSHOP = {
  hull: "healthCoat",
  power: "shotPower",
  thrust: "walkBoots",
  magnet: "shardPouch",
  salvage: "extraShards",
  nova: "fireBurst",
  insight: "extraChoice",
  banish: "seal",
  armorCore: "armor",
  droneBay: "sparkHelper",
  arsenalLab: "quickTrigger",
  fieldSupply: "supplyChest",
  hazardAttune: "trapPower",
};
const CRAFTS = {
  cryo: "iceShot",
  shockdash: "shockDash",
  gcells: "extraBells",
  gblast: "wideBell",
  overload: "fireWave",
  heatsink: "hotBellows",
  reactive: "shieldPulse",
  pointblank: "closeShot",
  multishot: "extraShots",
  ricochet: "bounceShot",
  payload: "blastShot",
  arc: "sparkChain",
  thermite: "burningShot",
  siphon: "healingDrops",
  rearguard: "backShot",
  overcharge: "extraCharge",
  gfire: "fireBell",
  acidcoat: "acidCoat",
  slipstream: "dashBoost",
  surge: "bellWave",
  overcrit: "superCrit",
  stoke: "hotShot",
  gsyphon: "bellBoost",
  wingman: "helperWisps",
  bloodrush: "killStreak",
  colossus: "largeShots",
  chrono: "timeDash",
  cluster: "fireflyShots",
  inferno: "wildfire",
  phantom: "ghostDash",
  gunship: "wispSwarm",
  blackstar: "fireWell",
  overdrive: "sunGun",
  shredder: "stormShotgun",
  tempest: "stormWand",
  lance: "starLance",
  hellfire: "wideBlast",
  twinsaw: "twinRings",
  sealgrid: "bellCage",
  shardfield: "iceShards",
  brood: "mossHelpers",
  tribute: "forgeGift",
  fang: "dragonFang",
};
const BOSSES_AND_ENEMIES = {
  swarmer: "smallBug",
  grunt: "kettleGuard",
  gunner: "brassGuard",
  bomber: "firePot",
  splitter: "sporePod",
  mite: "littlePod",
  brute: "ironGolem",
  sniper: "longshot",
  hive: "mushroomNest",
  bulwark: "shieldGuard",
  striker: "blinkBlade",
  mortar: "bellCannon",
  mender: "mossHealer",
  leaper: "bogHopper",
  turret: "watchTower",
  charger: "wildBoar",
  minebot: "mineCart",
  sapper: "bombMaker",
  phantom: "starGhost",
  sentinel: "crystalTower",
  carrier: "supplyKite",
  drone: "dartSprite",
  driller: "burrowMole",
  beacon: "healingStone",
  weaver: "starSpider",
  bellkeeper: "bellKeeper",
  queen: "mossQueen",
  prism: "iceCrystal",
  core: "starHeart",
  tyrant: "emberKing",
  wyrm: "sandDragon",
  colossus: "emberKing",
  forge: "sandDragon",
  crucible: "sandDragon",
};
const DAMAGE_SOURCES = {
  nova: "fireBurst",
  singularity: "gravityBell",
  payload: "blastShot",
  wingman: "helperWisps",
  overload: "fireWave",
  tribute: "forgeGift",
  shockdash: "shockDash",
  hammer: "shockDash",
};
const FORGE = {
  ward: "repair",
  kindling: "charge",
  shuffle: "extraReroll",
};
const BIOMES = {
  courtyard: "lanternYard",
  shelf: "snowRidge",
  core: "starHall",
  caldera: "emberHill",
  marsh: "mossBog",
  flats: "sunDunes",
};
const EVENTS = { forgewind: "hotWind" };
const LAYOUT_SEED_IDS = Object.fromEntries(Object.entries(BIOMES).map(([old, current]) => [current, old]));
const BIOME_SEED_IDS = {
  lanternYard: "pavilion",
  snowRidge: "glacier",
  starHall: "sanctum",
  emberHill: "hearth",
  mossBog: "marsh",
  sunDunes: "flats",
};
const EVENT_SEED_IDS = {
  goldCart: "elite",
  starfall: "rain",
  festival: "duskfall",
  snowWind: "whiteout",
  fireflies: "bloom",
  starPaths: "riftstorm",
  hotWind: "cinder",
  sandstorm: "devils",
  ashfall: "cinder",
  forgewind: "cinder",
};

const rename = (id, map) => (Object.hasOwn(map, id) ? map[id] : id);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export const currentBiomeId = (id) => rename(id, BIOMES);
export const currentEventId = (id) => rename(id, EVENTS);
export const layoutBiomeSeedId = (id) => rename(id, LAYOUT_SEED_IDS);
export const biomeSeedId = (id) => rename(id, BIOME_SEED_IDS);
export const eventSeedId = (id) => rename(id, EVENT_SEED_IDS);
const weaponId = (id) => rename(id, WEAPONS);
const workshopId = (id) => rename(id, WORKSHOP);
const craftId = (id) => rename(id, CRAFTS);
const actorId = (id) => rename(id, BOSSES_AND_ENEMIES);
const damageId = (id) => rename(actorId(id), DAMAGE_SOURCES);

function record(input, keyOf, combine) {
  if (!object(input)) return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const next = keyOf(key);
    Object.defineProperty(out, next, {
      value: Object.hasOwn(out, next) ? combine(out[next], value) : value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

const sum = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + b : b),
  max = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? Math.max(a, b) : b),
  either = (a, b) => a === true || b === true,
  bestMedal = (a, b) => {
    if (!object(a)) return b;
    if (!object(b)) return a;
    if (a.medal !== b.medal) return a.medal > b.medal ? a : b;
    return (a.secs || Infinity) < (b.secs || Infinity) ? a : b;
  };

export function runContentIds(run) {
  if (!object(run)) return run;
  const out = { ...run };
  if (Object.hasOwn(run, "weapon")) out.weapon = weaponId(run.weapon);
  if (object(run.up)) out.up = record(run.up, craftId, max);
  if (Array.isArray(run.offer)) out.offer = run.offer.map(craftId);
  if (Array.isArray(run.banished)) out.banished = run.banished.map(craftId);
  if (Array.isArray(run.anvil)) out.anvil = run.anvil.map((id) => rename(id, FORGE));
  if (Object.hasOwn(run, "nova")) {
    out.fireBurst = run.fireBurst ?? run.nova;
    delete out.nova;
  }
  if (Array.isArray(run.bossKills)) out.bossKills = run.bossKills.map(actorId);
  if (object(run.dmgSrc)) out.dmgSrc = record(run.dmgSrc, damageId, sum);
  if (object(run.takenBy)) out.takenBy = record(run.takenBy, damageId, sum);
  if (Array.isArray(run.hitLog)) out.hitLog = run.hitLog.map((h) => (object(h) ? { ...h, src: damageId(h.src) } : h));
  return out;
}

export function saveContentIds(save) {
  if (!object(save)) return save;
  const out = { ...save };
  if (Object.hasOwn(save, "weapon")) out.weapon = weaponId(save.weapon);
  if (object(save.weapons)) out.weapons = record(save.weapons, weaponId, either);
  if (object(save.workshop)) out.workshop = record(save.workshop, workshopId, max);
  if (object(save.stats)) {
    out.stats = { ...save.stats };
    if (object(save.stats.bosses)) out.stats.bosses = record(save.stats.bosses, actorId, sum);
    if (object(save.stats.medals)) out.stats.medals = record(save.stats.medals, actorId, bestMedal);
    if (object(save.stats.clearsBy)) out.stats.clearsBy = record(save.stats.clearsBy, weaponId, sum);
    if (object(save.stats.bestBy)) out.stats.bestBy = record(save.stats.bestBy, weaponId, max);
  }
  if (object(save.milestones)) out.milestones = record(save.milestones, actorId, either);
  if (object(save.settings?.hudLayout)) {
    const control = (id) => rename(id, { nova: "fireBurst", gadget: "gravityBell" });
    out.settings = {
      ...save.settings,
      hudLayout: {
        portrait: record(save.settings.hudLayout.portrait, control, (a, b) => b),
        landscape: record(save.settings.hudLayout.landscape, control, (a, b) => b),
      },
    };
  }
  if (object(save.seen)) {
    const prefix = "tip_enemy_";
    out.seen = record(
      save.seen,
      (key) => {
        if (key.startsWith(prefix)) return prefix + actorId(key.slice(prefix.length));
        if (key.startsWith("enemy_")) return prefix + actorId(key.slice(6));
        if (key === "tip_nova") return "tip_fireBurst";
        if (key === "tip_singularity") return "tip_gravityBell";
        return key;
      },
      either,
    );
  }
  if (Array.isArray(save.history))
    out.history = save.history.map((h) =>
      object(h)
        ? {
            ...h,
            weapon: weaponId(h.weapon),
            killer: damageId(h.killer),
            build: Array.isArray(h.build) ? h.build.map(craftId) : h.build,
          }
        : h,
    );
  if (save.run) out.run = runContentIds(save.run);
  return out;
}
