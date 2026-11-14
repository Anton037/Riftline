// Presentation identities: shared by the simulation, rendering and audio. No random draws or balance values.
export const BOSS_EFFECTS = {
  warden: {
    projectile: "siren",
    shot: "eshotWarden",
    height: 2.15,
    reach: 1.8,
    color: 0xff3346,
    accent: 0x3d7bff,
    surface: "armor",
    summon: "security",
  },
  queen: {
    projectile: "spore",
    shot: "eshotQueen",
    height: 1.8,
    reach: 1.5,
    color: 0x54ffc8,
    accent: 0xc0ffe2,
    surface: "organic",
    summon: "brood",
  },
  prism: {
    projectile: "shard",
    shot: "eshotPrism",
    height: 1.9,
    reach: 0.4,
    color: 0x8fe8ff,
    accent: 0xe4faff,
    surface: "ice",
    summon: "frost",
  },
  core: {
    projectile: "riftorb",
    shot: "eshotCore",
    height: 2.4,
    reach: 0,
    color: 0xb070ff,
    accent: 0xff4dd8,
    surface: "stone",
    summon: "rift",
  },
  tyrant: {
    projectile: "cinder",
    shot: "eshotTyrant",
    height: 1.8,
    reach: 0.95,
    color: 0xff8c2e,
    accent: 0xffd27a,
    surface: "basalt",
    summon: "ember",
  },
  wyrm: {
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
  swarmer: { motion: "scuttle" },
  grunt: { motion: "tread" },
  gunner: { projectile: "bolt", shot: "eshotGunner", height: 1.0 },
  bomber: { motion: "fuse" },
  splitter: { motion: "brood" },
  mite: { motion: "scuttle" },
  brute: { motion: "heavy" },
  sniper: { projectile: "fast", shot: "snipe", height: 1.0 },
  hive: { motion: "brood" },
  bulwark: { motion: "shield" },
  striker: { motion: "blink" },
  mortar: { motion: "shell" },
  mender: { motion: "heal" },
  leaper: { motion: "leap" },
  turret: { projectile: "turret", shot: "eshotTurret", height: 1.3 },
  charger: { motion: "ram" },
  minebot: { motion: "mine" },
  sapper: { motion: "charge" },
  phantom: { motion: "phase" },
  sentinel: { motion: "beam" },
  carrier: { projectile: "carrier", shot: "eshotCarrier", height: 1.45 },
  drone: { projectile: "drone", shot: "eshotDrone", height: 1.15 },
  driller: { motion: "drill" },
  beacon: { motion: "heal" },
  weaver: { projectile: "weaver", shot: "eshotWeaver", height: 1.2 },
};
export const BEAM_EFFECTS = {
  magma: { warning: "bwFlame" },
  laser: { warning: "bwLaser" },
  cryo: { warning: "bwCryo" },
  acid: { warning: "bwAcid" },
  flame: { warning: "bwFlame" },
  rift: { warning: "bwRift" },
  sun: { warning: "bwFlare" },
};
export const SENTINEL_BEAMS = {
  city: "laser",
  shelf: "cryo",
  marsh: "acid",
  core: "rift",
  caldera: "flame",
  flats: "sun",
};
export const BIOME_TRAP_EFFECTS = {
  city: { floor: "plate", beam: "laser", mine: "mine" },
  shelf: { floor: "icespike", mine: "frost" },
  marsh: { floor: "geyser", mine: "spore" },
  core: { floor: "riftburst", beam: "rift", mine: "riftmine" },
  caldera: { floor: "pyro", beam: "magma", mine: "embermine" },
  flats: { floor: "sunspike", mine: "glassmine" },
};
export const WEAPON_EFFECTS = {
  pulse: { projectile: "pulse-bolt", muzzle: "pulse", shot: "pulse" },
  scatter: { projectile: "shot-tracer", muzzle: "combustion", shot: "scatter" },
  tesla: { projectile: "branching-arc", muzzle: "arc", shot: "tesla" },
  rail: { projectile: "rail-lance", muzzle: "rail", shot: "rail" },
  rocket: { projectile: "exhaust-rocket", muzzle: "backblast", shot: "rocket" },
  disc: { projectile: "returning-blade", muzzle: "mechanical", shot: "disc" },
  flame: { projectile: "flame-tongue", muzzle: "fire", shot: "flame" },
};
export const projectileFor = (source) => BOSS_EFFECTS[source]?.projectile || ENEMY_EFFECTS[source]?.projectile || "orb";
export const shotVoiceFor = (event) =>
  (event.type === "boss" ? BOSS_EFFECTS[event.boss] : ENEMY_EFFECTS[event.type])?.shot || "eshot";

export function attackSurface(kind, source, biome, chill) {
  if (chill || kind === "frost" || kind === "glacier") return "frost";
  if (kind === "stomp") {
    if (source === "tyrant") return "lavaCrack";
    if (source === "wyrm") return "glass";
    return "crack";
  }
  if (kind === "drill" || kind === "shorted") return "crack";
  if (kind === "fire" || kind === "volatile") return "burn";
  if (kind === "rain") {
    const who = source || { marsh: "queen", core: "core", caldera: "tyrant", flats: "wyrm" }[biome];
    return { queen: "acid", core: "rift", tyrant: "molten", wyrm: "glass" }[who] || "target";
  }
  return "target";
}
