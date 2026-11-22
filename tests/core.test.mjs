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
  const options = { seed: 731, weapon: "pulse", threat: 1, ws: {} };
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
  const w = new World({ seed: 42, weapon: "pulse", threat: 0, ws: {} });
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
  const a = new World({ seed: 1, weapon: "pulse", threat: 0, ws: { reroll: 3, banish: 2 } });
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
  assert.equal(a.banish(card), true);
  assert.equal(b.banish(card), true);
  assert.deepEqual(b.offer, a.offer);
  const old = a.snapshot();
  delete old.offerRng;
  assert.ok(new World({ snap: cleanRun(old), ws: {} }).offer.length);
  for (const invalid of [-1, 2 ** 32, NaN, "123"])
    assert.equal(cleanRun({ ...old, offerRng: invalid }).offerRng, undefined);
});

test("Armor Core reduces enemy hits but never stacks on map hazard resistance", () => {
  const w = new World({ seed: 42, weapon: "pulse", threat: 0, ws: { armorCore: 5 } });
  const loss = (source) => {
    w.player.hp = w.stats.maxHp;
    w.player.iT = 0;
    w.player.chipAcc = 0;
    w.hurtPlayer(30, null, null, source, true);
    return w.stats.maxHp - w.player.hp;
  };
  assert.equal(loss("grunt"), 24);
  for (const source of ["lava", "shock", "acid", "trap", "devil"]) assert.equal(loss(source), 30, source);
});

test("damage events retain the target type for material-specific hit feedback", () => {
  const w = new World({ seed: 731, weapon: "pulse", threat: 0, ws: {} });
  for (const type of ["grunt", "swarmer", "mender"]) {
    const enemy = w.spawnEnemy(type, 3, 3, {});
    w.fx.length = 0;
    w.hurtEnemy(enemy, 1, 1, 0, 0, true);
    const event = w.fx.find((e) => e.k === "dmg");
    assert.ok(event, type);
    assert.equal(event.type, type);
    assert.equal(event.crit, true);
  }
  const shielded = w.spawnEnemy("grunt", -3, 3, {});
  shielded.shield = 100;
  w.fx.length = 0;
  w.hurtEnemy(shielded, 1, 1, 0, 0, false);
  assert.equal(w.fx.find((e) => e.k === "dmg")?.type, "grunt");
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
      courtyard: "lantern",
      shelf: "rime",
      marsh: "puffball",
      core: "prism",
      caldera: "crucible",
      flats: "sunglass",
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

      const w = new World({ seed: 4242, weapon: "pulse", threat: 0, ws: {} });
      w.arena = arenaA;
      w.enemies.length = 0;
      w.fx.length = 0;
      const prop = w.arena.props[0];
      const foe = w.spawnEnemy("grunt", prop.x + 1.1, prop.y, {});
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
        } else if (kind === "prism") {
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
    // 1. Gilded Caravan grants Gilded Haste on elite defeat
    const wg = new World({ seed: 101, weapon: "pulse", threat: 0, ws: {} });
    wg.event = "gilded";
    const elite = wg.spawnEnemy("grunt", 3, 2, { elite: true });
    wg.killEnemy(elite);
    assert.ok(wg.player.gildT >= 3.0, "Gilded Caravan grants Gilded Haste on elite defeat");

    // 2. Astral Convergence empowers shots warped through portals
    const wc = new World({ seed: 202, weapon: "pulse", threat: 0, ws: {} });
    wc.route = ["core"];
    wc.startWave(17);
    wc.event = "harmonic";
    wc.startBiomeEvent("harmonic", 17);
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
      w: "pulse",
    });
    wc.updateFeatures(1 / 60);
    assert.ok(wc.pb[0].dmg >= 25.9, "Astral Convergence boosts portal-warped player shots by 30%");

    // 3. Armed proximity vessels detonate when shot for 1.5x pack damage without friendly fire
    const wt = new World({ seed: 303, weapon: "pulse", threat: 0, ws: {} });
    wt.arena.obs = [];
    wt.player.x = 0;
    wt.player.y = 0;
    const hpBefore = wt.player.hp;
    wt.traps = [{ id: 1, fam: "mine", skin: "mine", x: 1.5, y: 0, st: "armed", t: 0 }];
    const packFoe = wt.spawnEnemy("brute", 2.6, 0.9, {});
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
      w: "pulse",
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

  // 1. Star-Vault Astrolabe Well pulls enemies inward during warn telegraph
  const wPull = new World({ seed: 41, weapon: "pulse", threat: 0, ws: {} });
  wPull.arena.obs = [];
  wPull.enemies.length = 0;
  const foePull = wPull.spawnEnemy("grunt", 3.5, 0, { noVariant: true });
  foePull.spawnT = 0;
  wPull.hash.build(wPull.enemies);
  wPull.traps = [
    { id: 1, fam: "floor", skin: "riftburst", x: 0, y: 0, st: "warn", t: 0.5, delay: 1.5, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wPull, 0.25);
  assert.ok(foePull.x < 3.4, "riftburst must pull foes inward during telegraph");

  // 2. Caldera Slag Crater ignites foes and leaves a lingering burn pool
  const wBurn = new World({ seed: 42, weapon: "pulse", threat: 0, ws: {} });
  wBurn.arena.obs = [];
  wBurn.enemies.length = 0;
  wBurn.player.x = 12;
  const foeBurn = wBurn.spawnEnemy("brute", 0.5, 0, { noVariant: true });
  foeBurn.spawnT = 0;
  wBurn.hash.build(wBurn.enemies);
  wBurn.traps = [
    { id: 1, fam: "floor", skin: "pyro", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wBurn, 0.05);
  assert.ok(foeBurn.burnT > 0, "pyro crater must ignite nearby foes");
  assert.ok(wBurn.burnPools.length > 0, "pyro crater must leave a lingering burn pool");

  // 3. Glowmarsh Pitcher Spout corrodes foes and spawns a bog pool
  const wBog = new World({ seed: 43, weapon: "pulse", threat: 0, ws: {} });
  wBog.arena.obs = [];
  wBog.arena.acid = [];
  wBog.enemies.length = 0;
  wBog.player.x = 12;
  const foeBog = wBog.spawnEnemy("brute", 0.5, 0, { noVariant: true });
  foeBog.spawnT = 0;
  wBog.hash.build(wBog.enemies);
  wBog.traps = [
    { id: 1, fam: "floor", skin: "geyser", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wBog, 0.05);
  assert.equal(foeBog.corrode, true, "geyser spout must corrode foes");
  assert.ok(wBog.arena.acid.length > 0, "geyser spout must spawn a bog pool");

  // 4. Glass Flats Sun-Glass Spire calms nearby dust devils and strongly knocks foes back
  const wSun = new World({ seed: 44, weapon: "pulse", threat: 0, ws: {} });
  wSun.arena.obs = [];
  wSun.arena.devils = [{ x: 1.5, y: 0, r: 2.2, vx: 1, vy: 0, a: 0, calmT: 0 }];
  wSun.enemies.length = 0;
  wSun.player.x = 12;
  const foeSun = wSun.spawnEnemy("grunt", 1.0, 0, { noVariant: true });
  foeSun.spawnT = 0;
  wSun.hash.build(wSun.enemies);
  wSun.traps = [
    { id: 1, fam: "floor", skin: "sunspike", x: 0, y: 0, st: "warn", t: 0.01, delay: 0.02, a: 0, dir: 1, wait: 0 },
  ];
  rlUpdateTraps(wSun, 0.05);
  assert.ok(wSun.arena.devils[0].calmT > 0, "sunspike must calm nearby dust devils");
  assert.ok(Math.hypot(foeSun.kx, foeSun.ky) > 4, "sunspike must knock foes back strongly");

  // 5. Star-Vault Armillary Lens swings as a pendulum; Caldera Dragon-Kiln beam burns foes
  const wBeam = new World({ seed: 45, weapon: "pulse", threat: 0, ws: {} });
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
  assert.ok(riftBeam.swing > 0, "Star-Vault rift beam must use pendulum swing");
  const startA = riftBeam.a;
  wBeam.updateBeams(magmaBeam.warn + 0.05);
  const foeMagma = wBeam.spawnEnemy(
    "brute",
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
  // 1. Star-Vault prism aura empowers passing player bolts by 25%
  const wPrism = new World({ seed: 501, weapon: "pulse", threat: 0, ws: {} });
  wPrism.arena.obs = [];
  wPrism.arena.props = [{ kind: "prism", x: 3, y: 0, r: 0.8, auraT: 4, cd: 0 }];
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
    w: "pulse",
  });
  wPrism.updatePBullets(1 / 60);
  assert.equal(wPrism.pb[0].prismBoost, true, "bolt passing lit prism aura is marked empowered");
  assert.equal(wPrism.pb[0].dmg, 25, "prism aura empowers passing bolt by +25%");

  // 2. Glass Flats sunglass fires a 5-lance solar fan
  const wSun = new World({ seed: 502, weapon: "pulse", threat: 0, ws: {} });
  wSun.arena.obs = [];
  wSun.enemies.length = 0;
  wSun.pb.length = 0;
  const foe = wSun.spawnEnemy("brute", 6, 0, { noVariant: true });
  foe.spawnT = 0;
  const prop = { kind: "sunglass", x: 0, y: 0, r: 0.8, auraT: 0, cd: 0 };
  wSun.arena.props = [prop];
  wSun.hash.build(wSun.enemies);
  assert.equal(wSun.triggerBiomeProp(prop), true);
  assert.equal(wSun.pb.length, 5, "Glass Flats sunglass relic must launch a 5-lance solar fan");

  // 3. Gilded Caravan elite kill emits bountyPulse with numeric amount > 0 (never undefined)
  const wGild = new World({ seed: 503, weapon: "pulse", threat: 0, ws: {} });
  wGild.event = "gilded";
  wGild.fx.length = 0;
  const elite = wGild.spawnEnemy("grunt", 2, 0, { elite: true });
  wGild.killEnemy(elite);
  const pulse = wGild.fx.find((e) => e.k === "bountyPulse");
  assert.ok(pulse && typeof pulse.amount === "number" && pulse.amount > 0, "bountyPulse must carry numeric amount");

  // 4. Frost Prism splinters credit 'shard', not Glasswyrm 'fang'
  const { updateBossCards } = await import("../src/core/boss-cards.js");
  const wShard = new World({ seed: 504, weapon: "pulse", threat: 0, ws: {} });
  wShard.arena.obs = [];
  wShard.enemies.length = 0;
  const target = wShard.spawnEnemy("brute", 2, 0, { noVariant: true });
  target.spawnT = 0;
  wShard.hash.build(wShard.enemies);
  wShard.splinters = [{ x: 1.9, y: 0, vx: 12, vy: 0, dmg: 30, life: 1, glass: false }];
  updateBossCards(wShard, 1 / 60);
  assert.ok((wShard.dmgSrc.shard || 0) > 0, "Frost Prism splinter must record under dmgSrc.shard");
  assert.equal(wShard.dmgSrc.fang || 0, 0, "Frost Prism splinter must not leak into dmgSrc.fang");
});

test("Masterwork evolutions validate prerequisites and Powder-Tinker lobs kegs onto flanks", async () => {
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
  const wOffer = new World({ seed: 601, weapon: "pulse", threat: 0, ws: {} });
  wOffer.up = { orbit: 3, shield: 1 }; // prerequisites for Gilded Halo ('halo')
  let sawHalo = false;
  for (let i = 0; i < 12 && !sawHalo; i++) {
    const offer = wOffer.makeOffer();
    assert.equal(new Set(offer).size, offer.length, "offer must never contain duplicate cards");
    for (const id of offer) assert.ok(upgradesById[id], `offer returned unknown card ${id}`);
    if (offer.includes("halo")) sawHalo = true;
  }
  assert.equal(sawHalo, true, "satisfied Masterwork evolution must appear in craft offers");

  // 2. Powder-Tinker (sapper) lobs timed kegs onto the player's flank, distinct from Cinder-Sower (minebot)
  const wAi = new World({ seed: 602, weapon: "pulse", threat: 0, ws: {} });
  wAi.arena.obs = [];
  wAi.player.x = 7;
  wAi.player.y = 0;
  const sapper = wAi.spawnEnemy("sapper", 0, 0, { noVariant: true });
  const minebot = wAi.spawnEnemy("minebot", 0, 0, { noVariant: true });
  Object.assign(sapper, { spawnT: 0, t: 0, los: true });
  Object.assign(minebot, { spawnT: 0, t: 0, los: true });
  wAi.hazards.length = 0;
  updateEnemy(wAi, minebot, 1 / 60);
  const mineH = wAi.hazards.find((h) => h.kind === "mine");
  assert.ok(mineH, "minebot must plant a mine hazard");
  assert.ok(Math.hypot(mineH.x - minebot.x, mineH.y - minebot.y) < 0.2, "minebot plants at its own feet");
  wAi.hazards.length = 0;
  updateEnemy(wAi, sapper, 1 / 60);
  const sapperH = wAi.hazards.find((h) => h.kind === "sapper");
  assert.ok(sapperH, "sapper must lob a powder-keg hazard");
  assert.ok(Number.isFinite(sapperH.sx) && Number.isFinite(sapperH.sy), "sapper hazard must record lob origin");
  assert.ok(Math.hypot(sapperH.x - sapper.x, sapperH.y - sapper.y) > 3, "sapper lobs onto the player's flank");
});
