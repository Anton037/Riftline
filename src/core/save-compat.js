// Import-only conversion metadata. Retired content has no gameplay, models, sounds or UI.
export const LEGACY_WEAPONS = {
  ion: { cost: 1250, to: "sparkWand" },
  gravity: { cost: 1550, to: "emberLauncher" },
  voidlance: { cost: 1950, to: "starSpear" },
  bloom: { cost: 2400, to: "emberLauncher" },
  volley: { cost: 1450, to: "brassShotgun" },
  prismcannon: { cost: 1750, to: "sparkWand" },
  sunlance: { cost: 2200, to: "starSpear" },
  vortex: { cost: 2450, to: "emberLauncher" },
  razorloop: { cost: 2050, to: "ringBlade" },
  needle: { cost: 1200, to: "lanternGun" },
  lattice: { cost: 2850, to: "sparkWand" },
  quasar: { cost: 3300, to: "emberLauncher" },
  cyclone: { cost: 3050, to: "ringBlade" },
  emberrail: { cost: 3900, to: "starSpear" },
};

export const LEGACY_MODULES = {
  riftBattery: { costs: [260, 540, 980], to: "fireBurst" },
  reactorCore: { costs: [1600, 3400, 6200], to: "fireBurst" },
  routeScanner: { costs: [1800, 3800, 6800], to: "supplyChest" },
  hazardSeal: { costs: [1200, 2500, 4500], to: "armor" },
};

const LEGACY_UPGRADES = {
  hammer: { to: "shockDash", k: 2 },
  caliber: { to: "dmg", k: 0.67 },
  kinetic: { to: "dmg", k: 0.54 },
  overclock: { to: "rate", k: 0.67 },
  fortify: { to: "hp", k: 0.75 },
  thruster: { to: "speed", k: 0.63 },
  stabilizer: { to: "crit", k: 0.42 },
  focus: { to: "crit", k: 0.5 },
  deadeye: { to: "crit", k: 0.38 },
  nanorepair: { to: "regen", k: 0.69 },
  leech: { to: "healingDrops", k: 0.5 },
  aether: { to: "extraCharge", k: 0.38 },
  flux: { to: "extraCharge", k: 0.2 },
  afterburner: { to: "speed", k: 0.62 },
  coolant: { to: "speed", k: 1.25 },
  phasecoat: { to: "shield", k: 0.5 },
  hazmat: { to: "shield", k: 1 },
  chainlink: { to: "sparkChain", k: 1 },
  resonance: { to: "sparkChain", k: 1 },
  payloadMatrix: { to: "blastShot", k: 1 },
  scavenger: { to: "extraCharge", k: 1 },
  scavengerNet: { to: "extraCharge", k: 1 },
  supply: { to: "extraCharge", k: 1 },
  salvager: { to: "extraCharge", k: 1 },
  skates: { to: "speed", k: 1 },
  laststand: { to: "hp", k: 1 },
  capacitor: { to: "extraCharge", k: 1 },
  bounty: { to: "extraCharge", k: 1 },
  velocity: { to: "crit", k: 0.7 },
  magnet: { to: "extraCharge", k: 1 },
  vector: { to: "speed", k: 0.83 },
  glasscore: { to: "dmg", k: 0.67 },
};

export const legacyWeapon = (id) => (Object.hasOwn(LEGACY_WEAPONS, id) ? LEGACY_WEAPONS[id] : null);
export const legacyUpgrade = (id) => (Object.hasOwn(LEGACY_UPGRADES, id) ? LEGACY_UPGRADES[id] : null);
