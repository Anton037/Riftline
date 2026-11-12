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
const { createTrainingWorld } = await import("../src/core/training.js");
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

test("every training boss uses its own arena and starting phase, and ends without an upgrade choice", () => {
  for (const biome of biomeList)
    for (const phase of ["full", "phase", "enraged"]) {
      const w = createTrainingWorld({ biome: biome.id, phase });
      assert.equal(w.arena.biome.id, biome.id);
      assert.equal(w.boss.type, bossByBiome[biome.id]);
      assert.equal(w.player.hp, 175);
      assert.equal(w.player.nova, 100);
      assert.equal(w.boss.hp, w.boss.maxHp);
      assert.ok(w.boss.hp >= 4500);
      w.boss.spawnT = 0;
      w.step(1 / 60, { auto: false });
      if (phase === "enraged") assert.equal(w.boss.enraged, true);
      if (phase === "phase" && w.boss.type === "core") assert.equal(w.boss.phaseN, 2);
      w.killEnemy(w.boss);
      w.sweep();
      w.waveT = 2;
      w.checkWaveEnd();
      assert.equal(w.state, "victory");
    }
  assert.throws(() => createTrainingWorld({ biome: "constructor" }));
  assert.ok(createTrainingWorld({ biome: "yard", threat: 5 }).boss.hp > createTrainingWorld({ biome: "yard" }).boss.hp);
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
