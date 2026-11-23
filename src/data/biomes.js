// Biome tables, palettes and the per-run biome route.

// Each biome owns a consistent hazard family.
const RL_BIOME_HAZARD = {
  // Courtyard vent positions hold charged inlays.
  lanternYard: "vents",
  snowRidge: "ice",
  starHall: "portals",
  mossBog: "acid",
  // 3.49.0: the Ember Hill: fumaroles - vents with a molten skin (they jet white-hot rock
  // between the spires). The id stays "caldera" for saves and records, like the Courtyard.
  emberHill: "vents",
  // 3.53.0: the Sun Dunes: dust devils - the first hazard that moves (they wander the glass)
  sunDunes: "devils",
};
const biomeList = [
  {
    // Teal glaze, brass tile seams and the gallery’s amber lamps.
    id: "lanternYard",
    name: "Lantern Yard",
    W: 18,
    H: 18,
    floor: 0x0c0d10,
    grid: 0xe6cf7a,
    accent: 0xd78e67,
    fog: 0x07080b,
    sky: 0x3a404e,
    ground: 0x0a0b0e,
    wall: 0x1d1f25,
    obstacles: [
      { t: "c", x: -7, y: -7, r: 1.3 },
      { t: "c", x: 7, y: -7, r: 1.3 },
      { t: "c", x: -7, y: 7, r: 1.3 },
      { t: "c", x: 7, y: 7, r: 1.3 },
    ],
  },
  {
    // Indigo snowfields and fractured ice beneath a breathing aurora blizzard.
    id: "snowRidge",
    name: "Snow Ridge",
    W: 18,
    H: 18,
    // 2.3.3: the palette that keeps every biome recognisable at a glance (grid ΔE ≥ 30 to any other biome, checked
    // by rlBiomeDistinct in the deep test); until 3.32.0 main.js patched it in at start-up
    floor: 0x0d1530,
    grid: 0xaee2ff,
    accent: 0x5cc8ff,
    fog: 0x070d1c,
    sky: 0x1a2c52,
    ground: 0x0a1220,
    wall: 0x16233f,
    obstacles: [
      { t: "b", x: -9, y: 0, w: 0.8, h: 3 },
      { t: "b", x: 9, y: 0, w: 0.8, h: 3 },
      { t: "c", x: 0, y: -9.5, r: 1.4 },
      { t: "c", x: 0, y: 9.5, r: 1.4 },
    ],
  },
  {
    // Broken rift strata and floating astrolabes pulse on the Heart's cadence.
    id: "starHall",
    name: "Star Hall",
    W: 17,
    H: 17,
    floor: 854040,
    grid: 10771711,
    accent: 16732120,
    fog: 459791,
    sky: 4860554,
    ground: 525583,
    wall: 1970742,
    obstacles: [
      { t: "c", x: -10, y: -10, r: 1.2 },
      { t: "c", x: 10, y: -10, r: 1.2 },
      { t: "c", x: -10, y: 10, r: 1.2 },
      { t: "c", x: 10, y: 10, r: 1.2 },
    ],
  },
  {
    // Cooled basalt, ash and molten fumaroles beneath the volcano.
    id: "emberHill",
    name: "Ember Hill",
    W: 18,
    H: 18,
    // the base is neutral charcoal so the only warm thing on the field is the molten light itself
    floor: 0x121112,
    grid: 0xffb520,
    accent: 0xffe19a,
    fog: 0x0c0a0b,
    sky: 0x4c1f14,
    ground: 0x0e0c0d,
    wall: 0x241a18,
    obstacles: [
      { t: "b", x: 0, y: -7.6, w: 2.6, h: 0.8 },
      { t: "c", x: -6.5, y: 6.5, r: 1.2 },
      { t: "c", x: 6.5, y: 6.5, r: 1.2 },
      { t: "c", x: -6.5, y: -3, r: 1.1 },
      { t: "c", x: 6.5, y: -3, r: 1.1 },
    ],
  },
  {
    // Dark peat, black water, reeds and mint bioluminescent colonies.
    id: "mossBog",
    name: "Moss Bog",
    W: 18,
    H: 17,
    floor: 0x071310,
    grid: 0x35e8a8,
    accent: 0xb2ffdc,
    fog: 0x04090a,
    sky: 0x11313a,
    ground: 0x050b0c,
    wall: 0x12211f,
    obstacles: [
      { t: "c", x: -8, y: -6, r: 1.4 },
      { t: "c", x: 8, y: 6, r: 1.4 },
      { t: "b", x: 8, y: -7, w: 1.6, h: 0.8 },
      { t: "b", x: -8, y: 7, w: 1.6, h: 0.8 },
    ],
  },
  {
    id: "sunDunes",
    name: "Sun Dunes",
    W: 18,
    H: 17,
    // 2.3.3: the palette rule (grid dE >= 30 to every other grid, checked by rlBiomeDistinct)
    floor: 0x1a130a,
    grid: 0xfff3d6,
    accent: 0xffd27a,
    fog: 0x181209,
    sky: 0x8a7248,
    ground: 0x14100a,
    wall: 0x3a2e1a,
    obstacles: [
      { t: "c", x: -7, y: -4.5, r: 1.35 },
      { t: "c", x: 7, y: 4.5, r: 1.35 },
      { t: "b", x: -5.5, y: 5.5, w: 2.6, h: 0.8 },
      { t: "b", x: 5.5, y: -5.5, w: 2.6, h: 0.8 },
    ],
  },
];
const biomesById = Object.fromEntries(biomeList.map((biome) => [biome.id, biome]));
// 2.4.6: Star Hall is always the fourth biome (waves 16–20), so the Rift Core stays the final
// boss. Snow Ridge, the Moss Bog, the Ember Hill and the Sun Dunes are shuffled: two
// of them in waves 6–15, the third from wave 21 and the fourth from wave 26 in Endless (3.53.0).
function planBiomeRoute(rng) {
  let ids = biomeList
    .slice(1)
    .map((biome) => biome.id)
    .filter((id) => id !== "starHall");
  for (let i = ids.length - 1; i > 0; i--) {
    let j = Math.floor(rng.next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ["lanternYard", ids[0], ids[1], "starHall", ...ids.slice(2)];
}

// Enemy mixes and the mechanics that distinguish each biome.
const RL_BIOME_INFO = {
  lanternYard: { tag: "Bell-censers", mix: { brassGuard: 2.2, firePot: 1.8, kettleGuard: 1.5, smallBug: 0.6 } },
  snowRidge: {
    tag: "Glacier drift",
    grip: 6.5,
    mix: {
      shieldGuard: 2.2,
      longshot: 2,
      brassGuard: 1.8,
      watchTower: 2,
      crystalTower: 1.8,
      smallBug: 0.6,
      sporePod: 0.6,
    },
  },
  mossBog: {
    tag: "Firefly tide",
    grip: 24,
    mud: 0.92,
    mix: {
      smallBug: 1.6,
      sporePod: 2.2,
      bogHopper: 1.8,
      mushroomNest: 2.1,
      mossHealer: 1.8,
      bombMaker: 1.6,
      supplyKite: 1.4,
      brassGuard: 0.6,
      healingStone: 1.2,
    },
  },
  starHall: {
    tag: "Astral portals",
    mix: { blinkBlade: 2.2, starGhost: 2.4, starSpider: 2.2, crystalTower: 1.8, dartSprite: 1.8, longshot: 0.6 },
  },
  sunDunes: {
    tag: "Sunglass whirls",
    mix: { brassGuard: 2, wildBoar: 2, burrowMole: 1.6, bellCannon: 1.4, longshot: 1.4, ironGolem: 1.2, smallBug: 0.6 },
  },
  emberHill: {
    tag: "Forge vents",
    mix: {
      brassGuard: 2.2,
      ironGolem: 2,
      firePot: 1.8,
      wildBoar: 1.4,
      bellCannon: 1.6,
      mineCart: 1.4,
      burrowMole: 1.2,
      bombMaker: 1.2,
      smallBug: 0.6,
    },
  },
};
for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
  if (biomesById[id]) {
    biomesById[id].tag = info.tag;
    if (info.grip) {
      biomesById[id].grip = info.grip;
    }
    // 3.50.0: the Moss Bog's mud drags (a speed multiplier, see World.step)
    if (info.mud) {
      biomesById[id].mud = info.mud;
    }
  }
}

export { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList };
