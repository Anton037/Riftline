// Short simulation/data contracts, independent of browser frames and historical release scripts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { World } = await import("../src/core/world.js");
const { weaponOrder, weaponDefs } = await import("../src/data/weapons.js");
const { biomeList, RL_BIOME_HAZARD } = await import("../src/data/biomes.js");
const { bossByBiome, bossDefs } = await import("../src/data/enemies.js");
const { upgradeList } = await import("../src/data/upgrades.js");
const { WHATS_NEW, NEWS_KEEP } = await import("../src/data/whatsnew.js");
const { cleanRun } = await import("../src/core/save.js");
const step = (world, ticks = 240) => {
  for (let i = 0; i < ticks; i++) {
    world.step(1 / 60, { mx: Math.cos(i / 50), my: Math.sin(i / 50), auto: true, dash: i === 30 });
    world.fx.length = 0;
  }
};

test("every weapon runs finite combat without unseeded simulation randomness", () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error("Simulation used Math.random");
  };
  try {
    for (const weapon of weaponOrder) {
      const w = new World({ seed: 918, weapon, threat: 0, ws: {} });
      step(w, 360);
      for (const p of [w.player, ...w.enemies]) assert.ok([p.x, p.y, p.hp].every(Number.isFinite), weapon);
      assert.ok(w.runStats.dashes > 0, `${weapon}: dash was not simulated`);
    }
  } finally {
    Math.random = random;
  }
});

test("same seed and inputs give the same state; run snapshots restore progress", () => {
  const options = { seed: 731, weapon: "lanternGun", threat: 1, ws: {} };
  const a = new World(options),
    b = new World(options);
  step(a);
  step(b);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.shardFrac = 0.4;
  const snapshot = a.snapshot();
  const resumed = new World({ ...options, snap: snapshot });
  assert.equal(resumed.seed, a.seed);
  assert.equal(resumed.weapon, a.weapon);
  assert.equal(resumed.wave, a.wave);
  assert.deepEqual(resumed.up, a.up);
  assert.equal(resumed.shardFrac, 0.4);
});

test("every biome has a boss and hazard; the route reaches all six places", () => {
  assert.equal(biomeList.length, 6);
  const w = new World({ seed: 42, weapon: "lanternGun", threat: 0, ws: {} });
  const reached = new Set();
  for (let wave = 1; wave <= 30; wave++) reached.add(w.biomeFor(wave).id);
  assert.deepEqual([...reached].sort(), biomeList.map((b) => b.id).sort());
  for (const b of biomeList) {
    assert.ok(bossDefs[bossByBiome[b.id]], `${b.id}: boss`);
    assert.ok(RL_BIOME_HAZARD[b.id], `${b.id}: hazard`);
  }
});

test("selectable data references and release identity agree", () => {
  assert.equal(new Set(weaponOrder).size, weaponOrder.length);
  for (const id of weaponOrder) assert.ok(weaponDefs[id]);
  assert.equal(new Set(upgradeList.map((u) => u.id)).size, upgradeList.length);
  for (const u of upgradeList) if (u.weapon) assert.ok(weaponDefs[u.weapon], u.id);
  assert.equal(WHATS_NEW[0].version, pkg.version);
  assert.equal(WHATS_NEW.length, NEWS_KEEP);
});

test("saved choices preserve rerolls and banishes, including after another resume", () => {
  const a = new World({ seed: 1, weapon: "lanternGun", threat: 0, ws: { reroll: 3, seal: 2 } });
  step(a, 360);
  a.beginChoice();
  let b = new World({ snap: cleanRun(JSON.parse(JSON.stringify(a.snapshot()))), ws: {} });
  for (let i = 0; i < 2; i++) {
    assert.equal(a.reroll(), true);
    assert.equal(b.reroll(), true);
    assert.deepEqual(b.offer, a.offer);
    b = new World({ snap: cleanRun(b.snapshot()), ws: {} });
  }
  const card = a.offer[0];
  assert.equal(a.seal(card), true);
  assert.equal(b.seal(card), true);
  assert.deepEqual(b.offer, a.offer);
  const old = a.snapshot();
  delete old.offerRng;
  assert.ok(new World({ snap: cleanRun(old), ws: {} }).offer.length);
  for (const invalid of [-1, 2 ** 32, NaN, "123"])
    assert.equal(cleanRun({ ...old, offerRng: invalid }).offerRng, undefined);
});

test("Armor Core reduces enemy hits but never stacks on map hazard resistance", () => {
  const w = new World({ seed: 42, weapon: "lanternGun", threat: 0, ws: { armor: 5 } });
  const loss = (source) => {
    w.player.hp = w.stats.maxHp;
    w.player.iT = 0;
    w.player.chipAcc = 0;
    w.hurtPlayer(30, null, null, source, true);
    return w.stats.maxHp - w.player.hp;
  };
  assert.equal(loss("kettleGuard"), 24);
  for (const source of ["lava", "shock", "acid", "trap", "devil"]) assert.equal(loss(source), 30, source);
});

test("damage events retain the target type for material-specific hit feedback", () => {
  const w = new World({ seed: 731, weapon: "lanternGun", threat: 0, ws: {} });
  for (const type of ["kettleGuard", "smallBug", "mossHealer"]) {
    const enemy = w.spawnEnemy(type, 3, 3, {});
    w.fx.length = 0;
    w.hurtEnemy(enemy, 1, 1, 0, 0, true);
    const event = w.fx.find((e) => e.k === "dmg");
    assert.ok(event, type);
    assert.equal(event.type, type);
    assert.equal(event.crit, true);
  }
  const shielded = w.spawnEnemy("kettleGuard", -3, 3, {});
  shielded.shield = 100;
  w.fx.length = 0;
  w.hurtEnemy(shielded, 1, 1, 0, 0, false);
  assert.equal(w.fx.find((e) => e.k === "dmg")?.type, "kettleGuard");
  assert.equal(w.fx.find((e) => e.k === "dmg")?.shield, true);
});

test("all six interactive biome props trigger deterministically from shots and dashes without Math.random", async () => {
  const { Arena, buildLayout } = await import("../src/core/arena.js");
  const { biomesById } = await import("../src/data/biomes.js");
  const random = Math.random;
  Math.random = () => {
    throw new Error("Interactive biome props used Math.random");
  };
  try {
    const expectedKind = {
      lanternYard: "lantern",
      snowRidge: "rime",
      mossBog: "puffball",
      starHall: "iceCrystal",
      emberHill: "crucible",
      sunDunes: "sunglass",
    };
    for (const [id, kind] of Object.entries(expectedKind)) {
      const biome = biomesById[id];
      const layoutA = buildLayout(biome, 4242, 4, false);
      const layoutB = buildLayout(biome, 4242, 4, false);
      const arenaA = new Arena(biome, layoutA);
      const arenaB = new Arena(biome, layoutB);
      assert.equal(arenaA.props.length, 3, `${id}: expected 3 props`);
      assert.deepEqual(arenaA.props, arenaB.props, `${id}: prop placement must be deterministic`);
      for (const p of arenaA.props) {
        assert.equal(p.kind, kind);
        assert.equal(arenaA.blocked(p.x, p.y, p.r), false, `${id}: prop overlaps obstacle`);
        assert.equal(arenaA.outside(p.x, p.y, p.r + 0.5), false, `${id}: prop outside arena`);
      }

      const w = new World({ seed: 4242, weapon: "lanternGun", threat: 0, ws: {} });
      w.arena = arenaA;
      w.enemies.length = 0;
      w.fx.length = 0;
      const prop = w.arena.props[0];
      const foe = w.spawnEnemy("kettleGuard", prop.x + 1.1, prop.y, {});
      foe.hp = foe.maxHp = 500;
      w.hash.build(w.enemies);

      if (kind === "puffball") {
        w.player.x = prop.x;
        w.player.y = prop.y;
        w.player.dashT = 0.2;
        w.player.slowT = 1.0;
        w.updateBiomeProps(1 / 60);
        assert.ok(w.player.hopT > 2.5, "marsh puffball grants spore hop");
        assert.equal(w.player.slowT, 0, "marsh puffball clears slow");
        assert.equal(foe.corrode, true, "marsh puffball marks nearby enemy");
      } else if (kind === "crucible") {
        assert.equal(w.triggerBiomeProp(prop), true);
        assert.ok(prop.fuse > 0.5, "caldera crucible arms telegraph fuse");
        assert.equal(w.fx.find((e) => e.k === "biomeProp")?.state, "arm");
        w.fx.length = 0;
        w.updateBiomeProps(0.65);
        assert.ok(foe.weakenT > 4.0, "caldera crucible weakens enemy armor");
        assert.equal(w.fx.find((e) => e.k === "biomeProp")?.state, "fire");
        const hp0 = foe.hp;
        w.hurtEnemy(foe, 40, 1, 0, 0, false);
        assert.equal(hp0 - foe.hp, 50, "weakened enemy takes 1.25x damage");
      } else {
        if (kind === "sunglass") {
          w.arena.devils = [{ x: prop.x + 1.2, y: prop.y, r: 2.2, vx: 1, vy: 0, a: 0, calmT: 0 }];
        }
        assert.equal(w.triggerBiomeProp(prop), true);
        assert.equal(w.fx.find((e) => e.k === "biomeProp")?.state, "fire", id);
        if (kind === "lantern") {
          assert.ok(prop.auraT > 4.5 && foe.slowT >= 1.3);
        } else if (kind === "rime") {
          assert.ok(w.player.tractionT > 3.5 && foe.slowT >= 2.5);
        } else if (kind === "iceCrystal") {
          assert.ok(prop.auraT > 2.5 && foe.hp < 500);
          w.eb.push({ x: prop.x, y: prop.y, vx: 10, vy: 0, r: 0.2, dmg: 5, life: 2 });
          w.updateEBullets(0.1);
          assert.ok(w.eb[0].x < prop.x + 0.5, "core prism aura slows enemy projectiles");
        } else if (kind === "sunglass") {
          assert.ok(w.arena.devils[0].calmT >= 4.9, "flats sunglass calms nearby dust devil");
        }
      }
      assert.ok((w.dmgSrc.prop || 0) > 0, `${id}: prop damage recorded under 'prop'`);
    }
  } finally {
    Math.random = random;
  }
});

test("reworked cozy wave events and shot-detonated proximity vessels are deterministic and functional", () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error("simulation touched Math.random");
  };
  try {
    // 1. Gold Cart grants Gilded Haste on elite defeat
    const wg = new World({ seed: 101, weapon: "lanternGun", threat: 0, ws: {} });
    wg.event = "goldCart";
    const elite = wg.spawnEnemy("kettleGuard", 3, 2, { elite: true });
    wg.killEnemy(elite);
    assert.ok(wg.player.gildT >= 3.0, "Gold Cart grants Gilded Haste on elite defeat");

    // 2. Astral Convergence empowers shots warped through portals
    const wc = new World({ seed: 202, weapon: "lanternGun", threat: 0, ws: {} });
    wc.route = ["starHall"];
    wc.startWave(17);
    wc.event = "starPaths";
    wc.startBiomeEvent("starPaths", 17);
    assert.ok(wc.arena.portals.length >= 1);
    const p = wc.arena.portals[0];
    wc.pb.push({
      id: 99,
      x: p.ax,
      y: p.ay,
      vx: 10,
      vy: 0,
      a: 0,
      r: 0.17,
      dmg: 20,
      life: 1,
      pierce: 0,
      bounce: 0,
      hits: [],
      w: "lanternGun",
    });
    wc.updateFeatures(1 / 60);
    assert.ok(wc.pb[0].dmg >= 25.9, "Astral Convergence boosts portal-warped player shots by 30%");

    // 3. Armed proximity vessels detonate when shot for 1.5x pack damage without friendly fire
    const wt = new World({ seed: 303, weapon: "lanternGun", threat: 0, ws: {} });
    wt.arena.obs = [];
    wt.player.x = 0;
    wt.player.y = 0;
    const hpBefore = wt.player.hp;
    wt.traps = [{ id: 1, fam: "mine", skin: "mine", x: 1.5, y: 0, st: "armed", t: 0 }];
    const packFoe = wt.spawnEnemy("ironGolem", 2.6, 0.9, {});
    packFoe.spawnT = 0;
    const foeHp0 = packFoe.hp;
    wt.hash.build(wt.enemies);
    wt.pb.push({
      id: 100,
      x: 0.5,
      y: 0,
      vx: 90,
      vy: 0,
      a: 0,
      r: 0.17,
      dmg: 10,
      life: 1,
      pierce: 0,
      bounce: 0,
      hits: [],
      w: "lanternGun",
    });
    wt.updatePBullets(1 / 60);
    assert.equal(wt.traps[0].st, "gone", "armed vessel detonates when shot");
    assert.equal(wt.player.hp, hpBefore, "shot-detonated vessel does not hurt the player");
    assert.ok(packFoe.hp <= foeHp0 * 0.74, "shot-detonated vessel deals 1.5x hull fraction damage");
  } finally {
    Math.random = random;
  }
});

test("reimagined biome traps apply distinct mechanics across all six realms", async () => {
  const { rlUpdateTraps, TRAP_SKINS } = await import("../src/core/traps.js");

  // 1. Star Hall Astrolabe Well pulls enemies inward during warn telegraph
  const wPull = new World({ seed: 41, weapon: "lanternGun", threat: 0, ws: {} });
  wPull.arena.obs = [];
  wPull.enemies.length = 0;
  const foePull = wPull.spawnEnemy("kettleGuard", 3.5, 0, { noVariant: true });
  foePull.spawnT = 0;
  wPull.hash.build(wPull.enemies);
  wPull.traps = [
    { id: 1, fam: "floor", skin: "riftburst", x: 0, y: 0, st: "warn", t: 0.5, delay: 1.5, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wPull, 0.25);
  assert.ok(foePull.x < 3.4, "riftburst must pull foes inward during telegraph");

  // 2. Caldera Slag Crater ignites foes and leaves a lingering burn pool
  const wBurn = new World({ seed: 42, weapon: "lanternGun", threat: 0, ws: {} });
  wBurn.arena.obs = [];
  wBurn.enemies.length = 0;
  wBurn.player.x = 12;
  const foeBurn = wBurn.spawnEnemy("ironGolem", 0.5, 0, { noVariant: true });
  foeBurn.spawnT = 0;
  wBurn.hash.build(wBurn.enemies);
  wBurn.traps = [
    { id: 1, fam: "floor", skin: "pyro", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wBurn, 0.05);
  assert.ok(foeBurn.burnT > 0, "pyro crater must ignite nearby foes");
  assert.ok(wBurn.burnPools.length > 0, "pyro crater must leave a lingering burn pool");

  // 3. Moss Bog Pitcher Spout corrodes foes and spawns a bog pool
  const wBog = new World({ seed: 43, weapon: "lanternGun", threat: 0, ws: {} });
  wBog.arena.obs = [];
  wBog.arena.acid = [];
  wBog.enemies.length = 0;
  wBog.player.x = 12;
  const foeBog = wBog.spawnEnemy("ironGolem", 0.5, 0, { noVariant: true });
  foeBog.spawnT = 0;
  wBog.hash.build(wBog.enemies);
  wBog.traps = [
    { id: 1, fam: "floor", skin: "geyser", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wBog, 0.05);
  assert.equal(foeBog.corrode, true, "geyser spout must corrode foes");
  assert.ok(wBog.arena.acid.length > 0, "geyser spout must spawn a bog pool");

  // 4. Sun Dunes Sun-Glass Spire calms nearby dust devils and strongly knocks foes back
  const wSun = new World({ seed: 44, weapon: "lanternGun", threat: 0, ws: {} });
  wSun.arena.obs = [];
  wSun.arena.devils = [{ x: 1.5, y: 0, r: 2.2, vx: 1, vy: 0, a: 0, calmT: 0 }];
  wSun.enemies.length = 0;
  wSun.player.x = 12;
  const foeSun = wSun.spawnEnemy("kettleGuard", 1.0, 0, { noVariant: true });
  foeSun.spawnT = 0;
  wSun.hash.build(wSun.enemies);
  wSun.traps = [
    { id: 1, fam: "floor", skin: "sunspike", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wSun, 0.05);
  assert.ok(wSun.arena.devils[0].calmT > 0, "sunspike must calm nearby dust devils");
  assert.ok(Math.hypot(foeSun.kx, foeSun.ky) > 4, "sunspike must knock foes back strongly");

  // 5. Star Hall Armillary Lens swings as a pendulum; Caldera Dragon-Kiln beam burns foes
  const wBeam = new World({ seed: 45, weapon: "lanternGun", threat: 0, ws: {} });
  wBeam.arena.obs = [];
  wBeam.enemies.length = 0;
  wBeam.player.x = 12;
  wBeam.traps = [
    { id: 1, fam: "beam", skin: "rift", x: 0, y: 0, st: "idle", t: 0.01, a: 0, dir: 1, wait: 0 },
    { id: 2, fam: "beam", skin: "magma", x: 0, y: 5, st: "idle", t: 0.01, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wBeam, 0.05);
  assert.equal(wBeam.beams.length, 2);
  const riftBeam = wBeam.beams.find((b) => b.skin === "rift");
  const magmaBeam = wBeam.beams.find((b) => b.skin === "magma");
  assert.ok(riftBeam.swing > 0, "Star Hall rift beam must use pendulum swing");
  const startA = riftBeam.a;
  wBeam.updateBeams(magmaBeam.warn + 0.05);
  const foeMagma = wBeam.spawnEnemy(
    "ironGolem",
    magmaBeam.x + Math.cos(magmaBeam.a) * 4,
    magmaBeam.y + Math.sin(magmaBeam.a) * 4,
    { noVariant: true },
  );
  foeMagma.spawnT = 0;
  wBeam.hash.build(wBeam.enemies);
  wBeam.updateBeams(0.1);
  assert.notEqual(riftBeam.a, startA, "pendulum beam angle must oscillate");
  assert.ok(foeMagma.burnT > 0, "Dragon-Kiln trap beam must burn non-boss foes in its path");
});

test("relic auras, bountyPulse amounts and Frost Prism splinter damage attribution stay accurate", async () => {
  // 1. Star Hall prism aura empowers passing player bolts by 25%
  const wPrism = new World({ seed: 501, weapon: "lanternGun", threat: 0, ws: {} });
  wPrism.arena.obs = [];
  wPrism.arena.props = [{ kind: "iceCrystal", x: 3, y: 0, r: 0.8, auraT: 4, cd: 0 }];
  wPrism.pb.push({
    id: 1,
    x: 2.5,
    y: 0,
    vx: 15,
    vy: 0,
    a: 0,
    r: 0.17,
    dmg: 20,
    life: 1,
    pierce: 0,
    bounce: 0,
    hits: [],
    w: "lanternGun",
  });
  wPrism.updatePBullets(1 / 60);
  assert.equal(wPrism.pb[0].prismBoost, true, "bolt passing lit prism aura is marked empowered");
  assert.equal(wPrism.pb[0].dmg, 25, "prism aura empowers passing bolt by +25%");

  // 2. Sun Dunes sunglass fires a 5-lance solar fan
  const wSun = new World({ seed: 502, weapon: "lanternGun", threat: 0, ws: {} });
  wSun.arena.obs = [];
  wSun.enemies.length = 0;
  wSun.pb.length = 0;
  const foe = wSun.spawnEnemy("ironGolem", 6, 0, { noVariant: true });
  foe.spawnT = 0;
  const prop = { kind: "sunglass", x: 0, y: 0, r: 0.8, auraT: 0, cd: 0 };
  wSun.arena.props = [prop];
  wSun.hash.build(wSun.enemies);
  assert.equal(wSun.triggerBiomeProp(prop), true);
  assert.equal(wSun.pb.length, 5, "Sun Dunes sunglass relic must launch a 5-lance solar fan");

  // 3. Gold Cart elite kill emits bountyPulse with numeric amount > 0 (never undefined)
  const wGild = new World({ seed: 503, weapon: "lanternGun", threat: 0, ws: {} });
  wGild.event = "goldCart";
  wGild.fx.length = 0;
  const elite = wGild.spawnEnemy("kettleGuard", 2, 0, { elite: true });
  wGild.killEnemy(elite);
  const lanternGun = wGild.fx.find((e) => e.k === "bountyPulse");
  assert.ok(
    lanternGun && typeof lanternGun.amount === "number" && lanternGun.amount > 0,
    "bountyPulse must carry numeric amount",
  );

  // 4. Frost Prism splinters credit 'shard', not Glasswyrm 'fang'
  const { updateBossCards } = await import("../src/core/boss-cards.js");
  const wShard = new World({ seed: 504, weapon: "lanternGun", threat: 0, ws: {} });
  wShard.arena.obs = [];
  wShard.enemies.length = 0;
  const target = wShard.spawnEnemy("ironGolem", 2, 0, { noVariant: true });
  target.spawnT = 0;
  wShard.hash.build(wShard.enemies);
  wShard.splinters = [{ x: 1.9, y: 0, vx: 12, vy: 0, dmg: 30, life: 1, glass: false }];
  updateBossCards(wShard, 1 / 60);
  assert.ok((wShard.dmgSrc.shard || 0) > 0, "Frost Prism splinter must record under dmgSrc.shard");
  assert.equal(wShard.dmgSrc.fang || 0, 0, "Frost Prism splinter must not leak into dmgSrc.fang");
});

test("Masterwork evolutions validate prerequisites and Bomb Maker lobs kegs onto flanks", async () => {
  const { upgradesById } = await import("../src/data/upgrades.js");
  const { updateEnemy } = await import("../src/core/ai.js");

  // 1. Every Masterwork evolution references valid prerequisites and becomes offerable when met
  const evos = upgradeList.filter((u) => u.evo);
  assert.ok(evos.length >= 10);
  for (const evo of evos) {
    assert.equal(evo.rarity, 5, `${evo.id}: evolution must be rarity 5`);
    for (const [reqId, reqLv] of Object.entries(evo.evo)) {
      assert.ok(upgradesById[reqId], `${evo.id}: unknown prerequisite ${reqId}`);
      assert.ok(reqLv >= 1 && reqLv <= (upgradesById[reqId].max || 99), `${evo.id}: invalid req level for ${reqId}`);
    }
  }
  const wOffer = new World({ seed: 601, weapon: "lanternGun", threat: 0, ws: {} });
  wOffer.up = { orbit: 3, shield: 1 }; // prerequisites for Gilded Halo ('halo')
  let sawHalo = false;
  for (let i = 0; i < 12 && !sawHalo; i++) {
    const offer = wOffer.makeOffer();
    assert.equal(new Set(offer).size, offer.length, "offer must never contain duplicate cards");
    for (const id of offer) assert.ok(upgradesById[id], `offer returned unknown card ${id}`);
    if (offer.includes("halo")) sawHalo = true;
  }
  assert.equal(sawHalo, true, "satisfied Masterwork evolution must appear in craft offers");

  // 2. Bomb Maker (sapper) lobs timed kegs onto the player's flank, distinct from Mine Cart (minebot)
  const wAi = new World({ seed: 602, weapon: "lanternGun", threat: 0, ws: {} });
  wAi.arena.obs = [];
  wAi.player.x = 7;
  wAi.player.y = 0;
  const bombMaker = wAi.spawnEnemy("bombMaker", 0, 0, { noVariant: true });
  const mineCart = wAi.spawnEnemy("mineCart", 0, 0, { noVariant: true });
  Object.assign(bombMaker, { spawnT: 0, t: 0, los: true });
  Object.assign(mineCart, { spawnT: 0, t: 0, los: true });
  wAi.hazards.length = 0;
  updateEnemy(wAi, mineCart, 1 / 60);
  const mineH = wAi.hazards.find((h) => h.kind === "mine");
  assert.ok(mineH, "minebot must plant a mine hazard");
  assert.ok(Math.hypot(mineH.x - mineCart.x, mineH.y - mineCart.y) < 0.2, "minebot plants at its own feet");
  wAi.hazards.length = 0;
  updateEnemy(wAi, bombMaker, 1 / 60);
  const sapperH = wAi.hazards.find((h) => h.kind === "bombMaker");
  assert.ok(sapperH, "sapper must lob a powder-keg hazard");
  assert.ok(Number.isFinite(sapperH.sx) && Number.isFinite(sapperH.sy), "sapper hazard must record lob origin");
  assert.ok(Math.hypot(sapperH.x - bombMaker.x, sapperH.y - bombMaker.y) > 3, "sapper lobs onto the player's flank");
});

test("regression: Bellkeeper sealgrid corridor beams span the arena and damage the player", async () => {
  const { updateBoss } = await import("../src/core/ai.js");
  const w = new World({ seed: 701, weapon: "lanternGun", threat: 0, ws: {} });
  w.route = ["lanternYard"];
  w.startWave(5);
  w.arena.obs = [];
  w.enemies.length = 0;
  w.beams.length = 0;
  const boss = w.spawnBoss("bellKeeper");
  boss.spawnT = 0;
  boss.st = "bellCage";
  boss.n = 0;
  boss.t = 0;
  w.player.x = 0;
  w.player.y = 0;
  w.player.iT = 0;
  w.player.dashT = 0;
  w.player.shield = false;
  updateBoss(w, boss, 0.1);
  assert.ok(w.beams.length >= 4, "Bellkeeper sealgrid must spawn corridor beams");
  // Advance past warn into live beam phase
  const firstWarn = w.beams[0].warn;
  w.updateBeams(firstWarn + 0.05);
  for (const beam of w.beams) {
    assert.ok(beam.cur > 5, `corridor beam must span the arena (got cur=${beam.cur})`);
  }
  // Place player directly on a live corridor beam and confirm real damage
  const liveBeam = w.beams.find((b) => b.live && b.cur > 5);
  assert.ok(liveBeam, "at least one corridor beam must be live");
  w.player.x = liveBeam.x + Math.cos(liveBeam.a) * (liveBeam.cur * 0.5);
  w.player.y = liveBeam.y + Math.sin(liveBeam.a) * (liveBeam.cur * 0.5);
  w.player.iT = 0;
  const hpBefore = w.player.hp;
  w.updateBeams(1 / 60);
  assert.ok(w.player.hp < hpBefore, "live sealgrid corridor beam must damage the player");
});

test("regression: Glasswyrm diveT sets ghost=true and mirage/rise resolve inside arena bounds", async () => {
  const { updateBoss } = await import("../src/core/ai.js");
  const w = new World({ seed: 702, weapon: "lanternGun", threat: 0, ws: {} });
  w.route = ["sunDunes"];
  w.startWave(5);
  w.enemies.length = 0;
  const boss = w.spawnBoss("sandDragon");
  boss.spawnT = 0;
  boss.diveT = 0.5;
  updateBoss(w, boss, 0.05);
  assert.equal(boss.ghost, true, "submerged Glasswyrm (diveT > 0) must be untargetable (ghost=true)");
  boss.diveT = 0.02;
  updateBoss(w, boss, 0.05);
  assert.equal(boss.ghost, false, "surfacing Glasswyrm must restore ghost=false");
  // Trigger mirage phase and verify position stays strictly inside arena and unobstructed
  boss.st = "sandstorm";
  boss.n = 0;
  boss.t = 0;
  w.player.x = w.arena.W - 2.0;
  w.player.y = w.arena.H - 2.0;
  for (let i = 0; i < 40; i++) updateBoss(w, boss, 0.05);
  assert.equal(w.arena.outside(boss.x, boss.y, boss.r * 0.5), false, "Glasswyrm mirage must stay inside arena bounds");
});

test("regression: Moss Bog puffball and trap corrodeT persist across updateFeatures ticks", async () => {
  const { rlUpdateTraps } = await import("../src/core/traps.js");
  const w = new World({ seed: 703, weapon: "lanternGun", threat: 0, ws: {} });
  w.arena.obs = [];
  w.arena.acid = [];
  w.enemies.length = 0;
  const foe = w.spawnEnemy("ironGolem", 1.0, 0, { noVariant: true });
  foe.spawnT = 0;
  w.hash.build(w.enemies);
  const prop = { kind: "puffball", x: 0, y: 0, r: 0.9, cd: 0, fuse: 0 };
  w.arena.props = [prop];
  w.triggerBiomeProp(prop);
  assert.equal(foe.corrode, true, "puffball must corrode nearby foe");
  assert.ok(foe.corrodeT >= 3.5, "puffball must set timed corrodeT");
  // Step updateFeatures + statusTick for 1 second with NO acid pools present — corrode must persist!
  for (let i = 0; i < 60; i++) {
    w.statusTick(foe, 1 / 60);
    w.updateFeatures(1 / 60);
  }
  assert.equal(foe.corrode, true, "puffball corrodeT must not be wiped by updateFeatures when no pools exist");
  // Also verify trap corrodeT persists across updateFeatures
  const foe2 = w.spawnEnemy("ironGolem", 5.0, 0, { noVariant: true });
  foe2.spawnT = 0;
  w.hash.build(w.enemies);
  w.traps = [
    { id: 2, fam: "floor", skin: "geyser", x: 4.8, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(w, 0.05);
  w.arena.acid.length = 0;
  w.statusTick(foe2, 1 / 60);
  w.updateFeatures(1 / 60);
  assert.equal(foe2.corrode, true, "geyser trap corrodeT must persist across updateFeatures");
});

test("regression: shardfield splinters and fang lances pierce across kills", async () => {
  const { updateBossCards } = await import("../src/core/boss-cards.js");
  // 1. Frost Prism splinter pierces through a fatal hit into the second enemy behind it
  const w1 = new World({ seed: 704, weapon: "lanternGun", threat: 0, ws: {} });
  w1.arena.obs = [];
  w1.enemies.length = 0;
  const a1 = w1.spawnEnemy("kettleGuard", 1.0, 0, { noVariant: true });
  const a2 = w1.spawnEnemy("kettleGuard", 2.0, 0, { noVariant: true });
  a1.spawnT = a2.spawnT = 0;
  a1.hp = 5; // dies immediately to the splinter
  a2.hp = a2.maxHp = 500;
  w1.hash.build(w1.enemies);
  w1.splinters = [{ x: 0.4, y: 0, vx: 20, vy: 0, dmg: 30, life: 1, glass: false, pierce: 2, hits: [] }];
  for (let i = 0; i < 12; i++) {
    w1.hash.build(w1.enemies);
    updateBossCards(w1, 1 / 60);
  }
  assert.equal(a1.dead, true, "first foe dies to shardfield splinter");
  assert.ok(a2.hp < 500, "shardfield splinter must pierce across the kill and hit the second foe");

  // 2. Glasswyrm fang lance pierces through a fatal hit into the second enemy behind it
  const w2 = new World({ seed: 705, weapon: "lanternGun", threat: 0, ws: {} });
  w2.arena.obs = [];
  w2.enemies.length = 0;
  const b1 = w2.spawnEnemy("kettleGuard", 1.0, 0, { noVariant: true });
  const b2 = w2.spawnEnemy("kettleGuard", 2.1, 0, { noVariant: true });
  b1.spawnT = b2.spawnT = 0;
  b1.hp = 5;
  b2.hp = b2.maxHp = 500;
  w2.hash.build(w2.enemies);
  w2.splinters = [{ x: 0.4, y: 0, vx: 24, vy: 0, dmg: 40, life: 1, glass: true, pierce: 4, hits: [] }];
  for (let i = 0; i < 12; i++) {
    w2.hash.build(w2.enemies);
    updateBossCards(w2, 1 / 60);
  }
  assert.equal(b1.dead, true, "first foe dies to fang lance");
  assert.ok(b2.hp < 500, "fang lance must pierce across the kill and hit the second foe");
});

test("regression: Boss Waves offer guaranteed Relic as bonus slot and all 18 biome traps unlock in World 1", async () => {
  const { TRAP_SKINS, TRAP_FROM } = await import("../src/core/traps.js");
  assert.equal(Object.keys(TRAP_SKINS).length, 18, "all 6 biomes must have floor, mine, and beam traps (18 total)");
  assert.deepEqual(TRAP_FROM, { floor: 2, mine: 4, beam: 7 });

  const w = new World({ seed: 706, weapon: "lanternGun", threat: 0, ws: {} });
  w.route = ["lanternYard"];
  w.startWave(5);
  w.offerBoss = true;
  w.beginChoice();
  assert.equal(w.offer.length, 4, "Boss Wave must grant 3 regular upgrades + 1 guaranteed bonus Relic slot");
  assert.ok(w.offerExclusive && w.offer[0] === w.offerExclusive, "Relic occupies dedicated slot 0");
  // With Workshop Insight, Boss Wave grants 4 regular + 1 Relic = 5 cards
  const wInsight = new World({ seed: 706, weapon: "lanternGun", threat: 0, ws: { extraChoice: 1 } });
  wInsight.route = ["lanternYard"];
  wInsight.startWave(5);
  wInsight.offerBoss = true;
  wInsight.beginChoice();
  assert.equal(wInsight.offer.length, 5, "Boss Wave with Insight must grant 4 regular + 1 bonus Relic = 5 cards");
});

test("Perfect Dash rewards exactly one near miss early in the dash, without Mirror Shield", () => {
  const w = new World({ seed: 921, weapon: "lanternGun", threat: 0 });
  const p = w.player;
  w.hold = true;
  for (let i = 0; i < 3; i++) w.shoot(p.x + 0.55, p.y + 0.32, 0, 0, 50, { solid: false });
  w.step(1 / 60, { dash: true, mx: 1 });
  assert.equal(w.fx.filter(({ k }) => k === "graze").length, 1);
  assert.equal(p.fireBurst, 8);
  assert.equal(p.hp, w.stats.maxHp);
  assert.ok(p.dashCdT < w.stats.dashCd - 0.3);
  assert.ok(w.hitstopT > 0);

  w.time += 0.13;
  p.grazedDash = false;
  w.updateEBullets(1 / 60);
  assert.equal(w.fx.filter(({ k }) => k === "graze").length, 1, "late dash cannot graze");
});

test("Micro-hitstop coalesces a burst of crits and prioritizes heavier impacts", () => {
  const w = new World({ seed: 922, weapon: "lanternGun", threat: 0 });
  const e = w.spawnEnemy("kettleGuard", 4, 2, {});
  e.maxHp = e.hp = 1000;
  w.hurtEnemy(e, 3, 1, 0, 0, true);
  assert.equal(w.hitstopT, 0.014);
  w.hurtEnemy(e, 3, 1, 0, 0, true, "weapon", { superCrit: true });
  assert.equal(w.hitstopT, 0.028);
  w.time += 0.1;
  w.hitstopT = 0;
  w.hurtEnemy(e, 3, 1, 0, 0, true);
  assert.equal(w.hitstopT, 0);
  w.player.fireBurst = 100;
  w.fireBurst();
  assert.ok(w.hitstopT >= 0.065);
});

test("Guardian recovery openings boost damage for all six fights and cannot skip phases", async () => {
  const { updateBoss, bossPatterns } = await import("../src/core/ai.js");
  for (const [id, patterns] of Object.entries(bossPatterns)) {
    const w = new World({ seed: 923, weapon: "lanternGun", threat: 0 });
    const boss = w.spawnBoss(id);
    boss.spawnT = 0;
    for (let i = 0; i < 500 && !boss.openT; i++) updateBoss(w, boss, 1 / 60);
    assert.ok(boss.openT > 0 && boss.openT <= 0.85, `${id} opens after ${patterns[0]}`);
    const hp = boss.hp;
    w.hurtEnemy(boss, 10, 1, 0, 0, false);
    assert.ok(Math.abs(hp - boss.hp - 12) < 1e-8, id);
    w.hurtEnemy(boss, 1e6, 1, 0, 0, false);
    const gate = boss.hp;
    w.hurtEnemy(boss, 1e6, 1, 0, 0, false);
    assert.equal(boss.hp, gate, id);
    updateBoss(w, boss, 1 / 60);
    assert.equal(boss.phaseN, 2, id);
    assert.equal(boss.openT, 0, id);
  }
});

test("Seven native arm traits affect real shots and Heat Crack has a per-foe cooldown", () => {
  const setup = (weapon) => {
    const w = new World({ seed: 924, weapon, threat: 0 });
    w.stats.crit = 0;
    const e = w.spawnEnemy("kettleGuard", 3, 2, {});
    e.hp = e.maxHp = 1000;
    w.hash.build(w.enemies);
    return [w, e];
  };
  const hit = (weapon, build = {}) => {
    const [w, e] = setup(weapon);
    w.fire(0);
    Object.assign(w.pb[0], build);
    w.bulletHit(w.pb[0], e);
    return 1000 - e.hp;
  };
  const [lanternGun] = setup("lanternGun");
  for (let i = 0; i < 4; i++) lanternGun.fire(0);
  assert.equal(lanternGun.pb[3].dmg, lanternGun.pb[0].dmg * 1.3);
  assert.ok(hit("brassShotgun", { age: 0.05 }) > hit("brassShotgun", { age: 0.3 }));
  assert.ok(hit("sparkWand") > weaponDefs.sparkWand.dmg);
  assert.ok(hit("starSpear", { pierceCount: 2 }) > hit("starSpear"));
  assert.ok(hit("emberLauncher") > weaponDefs.emberLauncher.dmg + weaponDefs.emberLauncher.explodeDmg);
  assert.ok(hit("ringBlade", { back: true }) > hit("ringBlade"));
  const [fireBellows, chilled] = setup("fireBellows");
  chilled.frostT = 2;
  fireBellows.fire(0);
  fireBellows.bulletHit(fireBellows.pb[0], chilled);
  chilled.frostT = 2;
  fireBellows.fire(0);
  fireBellows.bulletHit(fireBellows.pb[1], chilled);
  assert.equal(fireBellows.fx.filter((event) => event.k === "shatter" && event.thermal).length, 1);
  assert.ok(1000 - chilled.hp > weaponDefs.fireBellows.dmg * 2 + 12);
});

test("Wave pacing shortens downtime and keeps uncollected clear rewards", async () => {
  const { planWave } = await import("../src/core/waves.js");
  const { makeRng } = await import("../src/core/util.js");
  const w = new World({ seed: 925, weapon: "lanternGun", threat: 0 });
  const plan = planWave(makeRng(925), 12, w.tm, false);
  assert.ok(plan.length > 1);
  assert.ok(plan.every((group) => group.gap < 2.55));
  w.state = "cleared";
  w.stateT = 2.71;
  w.player.hp = 50;
  w.pickups.push(w.mkPickup("heal", 4, 2, 10), w.mkPickup("shard", 4, 2, 5));
  w.checkWaveEnd();
  assert.equal(w.state, "choose");
  assert.equal(w.shards, 5);
  assert.equal(w.player.hp, 60);
});

test("A Masterwork favors the active arm and deweights a prior offer while respecting seals", async () => {
  const { rollUpgradeOffer } = await import("../src/core/waves.js");
  const owned = { rate: 2, extraShots: 1, orbit: 2, shield: 1 };
  const roll = (n, exclude = [], banned = []) =>
    rollUpgradeOffer({ next: () => n }, owned, 10, 1, 1, false, exclude, "lanternGun", banned)[0];
  assert.equal(roll(0.35), "sunGun");
  assert.equal(roll(0.35, ["sunGun"]), "halo");
  assert.equal(roll(0.99, [], ["sunGun"]), "halo");
  assert.equal(roll(0.99, [], ["halo"]), "sunGun");
});

test("Endless burst cap eases in at wave 40, refills after its window and exempts Fire Burst", async () => {
  const { burstFraction, BURST_WINDOW } = await import("../src/core/difficulty.js");
  assert.equal(burstFraction(39), 1);
  assert.equal(burstFraction(40), 0.97);
  assert.ok(burstFraction(100) > 0.6);
  assert.equal(burstFraction(400), 0.28);
  const w = new World({ seed: 926, weapon: "lanternGun", threat: 0 });
  w.endless = true;
  w.startWave(40);
  const e = w.spawnEnemy("kettleGuard", 4, 5, {});
  e.hp = e.maxHp = 100;
  w.hurtEnemy(e, 1000, 1, 0, 0, false);
  assert.equal(e.hp, 3);
  w.hurtEnemy(e, 1000, 1, 0, 0, false);
  assert.equal(e.hp, 3);
  const second = w.spawnEnemy("kettleGuard", 4, 5, {});
  second.hp = second.maxHp = 100;
  w.hurtEnemy(second, 1000, 1, 0, 0, false);
  w.hurtEnemy(second, 5, 1, 0, 0, false, "fireBurst");
  assert.equal(second.dead, true);
  w.time += BURST_WINDOW + 0.01;
  w.hurtEnemy(e, 5, 1, 0, 0, false);
  assert.equal(e.dead, true);
});

test("Anvil purchases persist with the route, cost, and cargo after a sanitized checkpoint", () => {
  const w = new World({ seed: 927, weapon: "lanternGun", threat: 0 });
  w.startWave(5);
  w.state = "choose";
  w.offer = ["rate"];
  w.shards = 52;
  assert.ok(w.choose("rate"));
  assert.equal(w.state, "anvil");
  assert.equal(w.buyAnvil(0), false, "full Ward should block a repair");
  const rerolls = w.rerolls;
  const cost = w.anvilOffers[2].cost;
  assert.ok(w.buyAnvil(2));
  assert.equal(w.buyAnvil(2), false);
  const snap = cleanRun(w.snapshot());
  const restored = new World({ snap, threat: 0 });
  assert.equal(restored.state, "anvil");
  assert.equal(restored.shards, 52 - cost);
  assert.equal(restored.rerolls, rerolls + 1);
  assert.equal(restored.buyAnvil(2), false);
  assert.ok(restored.leaveAnvil());
  assert.equal(restored.wave, 6);
  assert.equal(restored.state, "fight");
  assert.equal(restored.leaveAnvil(), false);
  assert.equal(restored.snapshot().anvil, undefined);
});

test("a gun at the edge of cover cannot fire through a wall between the body and muzzle", () => {
  const w = new World({ seed: 929, weapon: "lanternGun", threat: 0 });
  w.player.x = w.player.y = 0;
  w.arena.obs = [{ t: "b", x: 0.72, y: 0.2, w: 0.02, h: 0.45 }];
  w.fire(0);
  const event = w.fx.find(({ k }) => k === "shot");
  assert.equal(event.blocked, true);
  assert.ok(Math.abs(event.x - 0.7) < 1e-6);
  assert.equal(w.pb.length, 0);
  assert.ok(w.fx.some(({ k }) => k === "spark"));
});

test("Ring Blade returns to the weapon instead of disappearing into the player's body", () => {
  const w = new World({ seed: 929, weapon: "ringBlade", threat: 0 });
  w.player.x = w.player.y = w.player.aim = 0;
  w.arena.obs = [];
  w.fire(0);
  const bullet = w.pb[0];
  Object.assign(bullet, { back: true, age: 0.8, vx: 0, vy: 0 });
  w.updatePBullets(1 / 60);
  assert.equal(bullet.life, 0);
});
