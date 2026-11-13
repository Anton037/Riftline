// Import-only conversion metadata. Retired content has no gameplay, models, sounds or UI.
export const LEGACY_WEAPONS = {
  ion: { cost: 1250, to: "tesla" },
  gravity: { cost: 1550, to: "rocket" },
  voidlance: { cost: 1950, to: "rail" },
  bloom: { cost: 2400, to: "rocket" },
  volley: { cost: 1450, to: "scatter" },
  prismcannon: { cost: 1750, to: "tesla" },
  sunlance: { cost: 2200, to: "rail" },
  vortex: { cost: 2450, to: "rocket" },
  razorloop: { cost: 2050, to: "disc" },
  needle: { cost: 1200, to: "pulse" },
  lattice: { cost: 2850, to: "tesla" },
  quasar: { cost: 3300, to: "rocket" },
  cyclone: { cost: 3050, to: "disc" },
  emberrail: { cost: 3900, to: "rail" },
};

export const LEGACY_MODULES = {
  riftBattery: { costs: [260, 540, 980], to: "nova" },
  reactorCore: { costs: [1600, 3400, 6200], to: "nova" },
  routeScanner: { costs: [1800, 3800, 6800], to: "fieldSupply" },
};

const LEGACY_UPGRADES = {
  hammer: { to: "shockdash", k: 2 },
  caliber: { to: "dmg", k: 0.67 },
  kinetic: { to: "dmg", k: 0.54 },
  overclock: { to: "rate", k: 0.67 },
  fortify: { to: "hp", k: 0.75 },
  thruster: { to: "speed", k: 0.63 },
  stabilizer: { to: "crit", k: 0.42 },
  focus: { to: "crit", k: 0.5 },
  deadeye: { to: "crit", k: 0.38 },
  nanorepair: { to: "regen", k: 0.69 },
  leech: { to: "siphon", k: 0.5 },
  aether: { to: "overcharge", k: 0.38 },
  flux: { to: "overcharge", k: 0.2 },
  afterburner: { to: "speed", k: 0.62 },
  coolant: { to: "speed", k: 1.25 },
  phasecoat: { to: "hazmat", k: 0.32 },
  chainlink: { to: "resonance", k: 1 },
  payloadMatrix: { to: "payload", k: 1 },
  scavenger: { to: "supply", k: 1 },
  scavengerNet: { to: "salvager", k: 1 },
  capacitor: { to: "overcharge", k: 1 },
  bounty: { to: "supply", k: 1 },
  velocity: { to: "crit", k: 0.7 },
  magnet: { to: "supply", k: 1 },
  vector: { to: "speed", k: 0.83 },
  glasscore: { to: "dmg", k: 0.67 },
  momentum: { to: "rate", k: 0.67 },
};

export const legacyWeapon = (id) => (Object.hasOwn(LEGACY_WEAPONS, id) ? LEGACY_WEAPONS[id] : null);
export const legacyUpgrade = (id) => (Object.hasOwn(LEGACY_UPGRADES, id) ? LEGACY_UPGRADES[id] : null);
