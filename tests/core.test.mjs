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
