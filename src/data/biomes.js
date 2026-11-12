// Biome tables, palettes and the per-run biome route.

// Each biome owns a consistent hazard family.
const RL_BIOME_HAZARD = {
  // 3.4.0: Blackout City's live manholes are vents with an electric skin (they arc instead of erupting)
  city: "vents",
  shelf: "ice",
  core: "portals",
  marsh: "acid",
  // 3.49.0: the Ashfall Caldera: fumaroles - vents with a molten skin (they jet white-hot rock
  // between the spires). The id stays "caldera" for saves and records, like the City in 3.4.0.
  caldera: "vents",
  // 3.53.0: the Glass Flats: dust devils - the first hazard that moves (they wander the glass)
  flats: "devils",
};
const biomeList = [
  {
    // Wet asphalt, worn road markings and emergency lights in a city power cut.
    id: "city",
    name: "Blackout City",
    W: 18,
    H: 18,
    floor: 0x0c0d10,
    grid: 0xe6cf7a,
    accent: 0xff3346,
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
    id: "shelf",
    name: "The Aurora Shelf",
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
    // Broken rift strata and floating debris pulse on the Core's heartbeat.
    id: "core",
    name: "The Shattered Core",
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
    id: "caldera",
    name: "Ashfall Caldera",
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
    id: "marsh",
    name: "The Glowmarsh",
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
    id: "flats",
    name: "The Glass Flats",
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
// 2.4.6: The Shattered Core is always the fourth biome (waves 16–20), so the Rift Core stays the final
// boss. The Aurora Shelf, the Glowmarsh, the Ashfall Caldera and the Glass Flats are shuffled: two
// of them in waves 6–15, the third from wave 21 and the fourth from wave 26 in Endless (3.53.0).
function planBiomeRoute(rng) {
  let ids = biomeList
    .slice(1)
    .map((biome) => biome.id)
    .filter((id) => id !== "core");
  for (let i = ids.length - 1; i > 0; i--) {
    let j = Math.floor(rng.next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ["city", ids[0], ids[1], "core", ...ids.slice(2)];
}

// Enemy mixes and the mechanics that distinguish each biome.
const RL_BIOME_INFO = {
  city: { tag: "Live manholes", mix: { gunner: 2.2, bomber: 1.8, grunt: 1.5, swarmer: 0.6 } },
  // 3.51.0: the Shelf: the blizzard breathes - the thin ice freezes and thaws on a ~20 s cycle, so
  // the slick floor (grip 6.5) swings toward 9.1 at freeze peak and back (world.js step)
  shelf: {
    tag: "Blizzard breath",
    grip: 6.5,
    mix: { bulwark: 2.2, sniper: 2, gunner: 1.8, turret: 2, sentinel: 1.8, swarmer: 0.6, splitter: 0.6 },
  },
  // 3.50.0: the Glowmarsh: grip 24 - the mud clings (the Shelf's slick floor is 6.5, plain ground
  // is 16: here velocity dies fast, so you stop hard and sprint heavy) and mud drags a little speed
  marsh: {
    tag: "Bloom tide",
    grip: 24,
    mud: 0.92,
    mix: { swarmer: 1.6, splitter: 2.4, hive: 2.2, mender: 1.8, sapper: 1.8, carrier: 1.5, gunner: 0.6, beacon: 1.2 },
  },
  core: {
    tag: "Portals",
    mix: { striker: 2.2, phantom: 2.4, weaver: 2.2, leaper: 1.8, drone: 1.8, sniper: 0.6 },
  },
  flats: {
    tag: "Dust devils",
    mix: { gunner: 2, charger: 2, driller: 1.6, mortar: 1.4, sniper: 1.4, brute: 1.2, swarmer: 0.6 },
  },
  caldera: {
    tag: "Magma vents",
    mix: {
      gunner: 2.2,
      brute: 2,
      bomber: 1.8,
      charger: 1.4,
      mortar: 1.6,
      minebot: 1.4,
      driller: 1.2,
      sapper: 1.2,
      swarmer: 0.6,
    },
  },
};
for (const [id, info] of Object.entries(RL_BIOME_INFO)) {
  if (biomesById[id]) {
    biomesById[id].tag = info.tag;
    if (info.grip) {
      biomesById[id].grip = info.grip;
    }
    // 3.50.0: the Glowmarsh's mud drags (a speed multiplier, see World.step)
    if (info.mud) {
      biomesById[id].mud = info.mud;
    }
  }
}

export { RL_BIOME_HAZARD, RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList };
