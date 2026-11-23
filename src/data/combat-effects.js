// Presentation identities: shared by the simulation, rendering and audio. No random draws or balance values.
export const BOSS_EFFECTS = {
  bellKeeper: {
    projectile: "brass-seal",
    shot: "eshotKeeper",
    height: 2.15,
    reach: 1.8,
    color: 0xd78e67,
    accent: 0xf4cf95,
    surface: "armor",
    summon: "lanternYard",
  },
  mossQueen: {
    projectile: "spore",
    shot: "eshotQueen",
    height: 1.8,
    reach: 1.5,
    color: 0x8ebc88,
    accent: 0xcbe3a9,
    surface: "organic",
    summon: "mossHelpers",
  },
  iceCrystal: {
    projectile: "shard",
    shot: "eshotPrism",
    height: 1.9,
    reach: 0.4,
    color: 0x9ebfda,
    accent: 0xe6ebe5,
    surface: "ice",
    summon: "frost",
  },
  starHeart: {
    projectile: "riftorb",
    shot: "eshotCore",
    height: 2.4,
    reach: 0,
    color: 0xb39bd2,
    accent: 0xe2b6c6,
    surface: "stone",
    summon: "rift",
  },
  emberKing: {
    projectile: "cinder",
    shot: "eshotTyrant",
    height: 1.8,
    reach: 0.95,
    color: 0xd98661,
    accent: 0xf6bc7e,
    surface: "basalt",
    summon: "ember",
  },
  sandDragon: {
    projectile: "glass",
    shot: "eshotWyrm",
    height: 1.25,
    reach: 1.8,
    color: 0xffd98a,
    accent: 0xfff0c4,
    surface: "crystal",
    summon: null,
  },
};

// Melee/support actors deliberately have no projectile. Every ranged actor has an explicit identity.
export const ENEMY_EFFECTS = {
  smallBug: { motion: "scuttle" },
  kettleGuard: { motion: "tread" },
  brassGuard: { projectile: "bolt", shot: "eshotGunner", height: 1.0 },
  firePot: { motion: "fuse" },
  sporePod: { motion: "mossHelpers" },
  littlePod: { motion: "scuttle" },
  ironGolem: { motion: "heavy" },
  longshot: { projectile: "fast", shot: "snipe", height: 1.0 },
  mushroomNest: { motion: "mossHelpers" },
  shieldGuard: { motion: "shield" },
  blinkBlade: { motion: "blink" },
  bellCannon: { motion: "shell" },
  mossHealer: { motion: "heal" },
  bogHopper: { motion: "leap" },
  watchTower: { projectile: "watchTower", shot: "eshotTurret", height: 1.3 },
  wildBoar: { motion: "ram" },
  mineCart: { motion: "mine" },
  bombMaker: { motion: "charge" },
  starGhost: { motion: "phase" },
  crystalTower: { motion: "beam" },
  supplyKite: { projectile: "supplyKite", shot: "eshotCarrier", height: 1.45 },
  dartSprite: { projectile: "dartSprite", shot: "eshotDrone", height: 1.15 },
  burrowMole: { motion: "drill" },
  healingStone: { motion: "heal" },
  starSpider: { projectile: "starSpider", shot: "eshotWeaver", height: 1.2 },
};
export const BEAM_EFFECTS = {
  magma: { warning: "bwFlame" },
  laser: { warning: "bwLaser" },
  iceShot: { warning: "bwCryo" },
  acid: { warning: "bwAcid" },
  fireBellows: { warning: "bwFlame" },
  rift: { warning: "bwRift" },
  sun: { warning: "bwFlare" },
};
export const SENTINEL_BEAMS = {
  lanternYard: "laser",
  snowRidge: "iceShot",
  mossBog: "acid",
  starHeart: "rift",
  emberHill: "fireBellows",
  sunDunes: "sun",
};
export const BIOME_TRAP_EFFECTS = {
  lanternYard: { floor: "plate", beam: "laser", mine: "mine" },
  snowRidge: { floor: "icespike", beam: "iceShot", mine: "frost" },
  mossBog: { floor: "geyser", beam: "acid", mine: "spore" },
  starHall: { floor: "riftburst", beam: "rift", mine: "riftmine" },
  emberHill: { floor: "pyro", beam: "magma", mine: "embermine" },
  sunDunes: { floor: "sunspike", beam: "sun", mine: "glassmine" },
};
export const WEAPON_EFFECTS = {
  lanternGun: { projectile: "pulse-bolt", muzzle: "lanternGun", shot: "lanternGun" },
  brassShotgun: { projectile: "shot-tracer", muzzle: "combustion", shot: "brassShotgun" },
  sparkWand: { projectile: "arc-inlay", muzzle: "arc", shot: "sparkWand" },
  starSpear: { projectile: "rail-lance", muzzle: "starSpear", shot: "starSpear" },
  emberLauncher: { projectile: "exhaust-rocket", muzzle: "backblast", shot: "emberLauncher" },
  ringBlade: { projectile: "returning-blade", muzzle: "mechanical", shot: "ringBlade" },
  fireBellows: { projectile: "flame-tongue", muzzle: "fire", shot: "fireBellows" },
};
export const projectileFor = (source) => BOSS_EFFECTS[source]?.projectile || ENEMY_EFFECTS[source]?.projectile || "orb";
export const shotVoiceFor = (event) =>
  (event.type === "boss" ? BOSS_EFFECTS[event.boss] : ENEMY_EFFECTS[event.type])?.shot || "eshot";

export function attackSurface(kind, source, biome, chill) {
  if (chill || kind === "frost" || kind === "glacier") return "frost";
  if (kind === "stomp") {
    if (source === "emberKing") return "lavaCrack";
    if (source === "sandDragon") return "glass";
    return "crack";
  }
  if (kind === "drill" || kind === "shorted" || kind === "brimlit") return "crack";
  if (kind === "fire" || kind === "volatile") return "burn";
  if (kind === "rain") {
    const who =
      source || { mossBog: "mossQueen", starHall: "starHeart", emberHill: "emberKing", sunDunes: "sandDragon" }[biome];
    return { mossQueen: "acid", starHeart: "rift", emberKing: "molten", sandDragon: "glass" }[who] || "target";
  }
  return "target";
}
