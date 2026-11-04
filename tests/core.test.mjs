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
