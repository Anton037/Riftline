// Regressions discovered by the repository/game audit; real simulation and persisted save shapes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { World } = await import("../src/core/world.js");
const { cleanRun, newSave } = await import("../src/core/save.js");
const { updateEnemy, updateBoss } = await import("../src/core/ai.js");
const { computeStats, buildStatRows } = await import("../src/core/stats.js");
const { dailySpec, recordDaily, dayBefore } = await import("../src/core/daily.js");
const { weeklySpec, weekKey } = await import("../src/core/weekly.js");
const { rlUpdateTraps, TRAP_SKINS } = await import("../src/core/traps.js");
const world = () => new World({ seed: 42, weapon: "pulse", threat: 0, ws: {} });

test("resuming Endless preserves every boss defeat, including repeat bosses", () => {
  const a = world();
  a.endless = true;
  a.bossKills = ["warden", "queen", "warden"];
  const b = new World({ snap: cleanRun(JSON.parse(JSON.stringify(a.snapshot()))), ws: {} });
  assert.deepEqual(b.bossKills, a.bossKills);
});

test("a champion's rally expires on ordinary allies after the champion leaves", () => {
  const w = world();
  const champion = w.spawnEnemy("grunt", 0, 0, { champion: true, noVariant: true });
  const ally = w.spawnEnemy("grunt", 2, 0, { noVariant: true });
  champion.spawnT = ally.spawnT = 0;
  w.hash.build(w.enemies);
  w.variantTick(champion, 1 / 60);
  assert.ok(ally.rallyT > 0);
  champion.dead = true;
  for (let i = 0; i < 30; i++) w.statusTick(ally, 1 / 60);
  assert.ok(ally.rallyT <= 0);
});

test("Sunstruck boosts and expires for every eligible enemy role", () => {
  for (const type of ["grunt", "gunner", "charger", "driller"]) {
    const w = world();
    w.arena.obs = [];
    const e = w.spawnEnemy(type, 0, -10, { noVariant: true });
    e.spawnT = 0;
    e.t = 10;
    e.los = true;
    const base = { ...e };
    updateEnemy(w, base, 1 / 60);
    e.sunT = 0.6;
    updateEnemy(w, e, 1 / 60);
    assert.ok(Math.hypot(e.vx, e.vy) > Math.hypot(base.vx, base.vy) * 2, type);
    assert.equal(e.speed, base.speed, "temporary boost must not compound");
    for (let i = 0; i < 40; i++) updateEnemy(w, e, 1 / 60);
    assert.equal(e.sunT, 0, type);
  }
});

test("calendar keys reject impossible dates and weeks while retaining UTC/ISO boundaries", () => {
  assert.equal(dayBefore("2024-03-01"), "2024-02-29");
  assert.equal(weekKey(Date.parse("2021-01-01T23:59:59Z")), "2020-W53");
  assert.equal(weekKey(Date.parse("2021-01-04T00:00:00Z")), "2021-W01");
  for (const key of ["2026-99-99", "2026-02-30", "2025-02-29"]) {
    assert.notEqual(dailySpec(key).key, key);
    assert.equal(cleanRun({ ...world().snapshot(), daily: key }).daily, "");
    const record = { ...newSave().stats.daily, key: "2026-11-04", days: 1 };
    const before = { ...record };
    assert.equal(recordDaily(record, key, 2, 4), false);
    assert.deepEqual(record, before);
  }
  for (const key of ["2026-W00", "2026-W54", "2021-W53"]) {
    assert.notEqual(weeklySpec(key).key, key);
    assert.equal(cleanRun({ ...world().snapshot(), weekly: key }).weekly, undefined);
  }
});

test("Scattergun DPS includes both extra pellets per Split Chamber level", () => {
  const up = { multishot: 1 };
  const s = computeStats("scatter", up, {});
  const row = buildStatRows("scatter", up, {}, 100).find((r) => r.label === "Damage per second");
  assert.equal(row.now, 10 * 2 * 8 * (1 + s.crit * (s.critMul - 1)));
});

test("map resistance applies to floor, mine and beam traps without enemy armour stacking", () => {
  for (const skin of ["plate", "mine", "laser"]) {
    const loss = (resistance, armor) => {
      const w = world();
      w.arena.obs = [];
      w.stats.hazardResist = resistance;
      w.stats.armor = armor;
      w.player.iT = 0;
      const def = TRAP_SKINS[skin];
      w.traps = [
        {
          id: 1,
          skin,
          fam: def.fam,
          x: 0,
          y: 2,
          a: 0,
          dir: 1,
          t: 1,
          wait: 0,
          st: def.fam === "floor" ? "warn" : def.fam === "mine" ? "fuse" : "idle",
          delay: 0,
        },
      ];
      rlUpdateTraps(w, 1 / 60);
      if (def.fam === "beam") w.updateBeams(def.warn + 0.01);
      return w.stats.maxHp - w.player.hp;
    };
    assert.equal(loss(0.5, 0.5), Math.round(loss(0, 0) * 0.5), skin);
  }
});

test("late-wave enemy shots collide along their path and stop at intervening walls", () => {
  const w = world();
  w.arena.obs = [];
  w.player.x = w.player.y = 0;
  w.player.iT = 0;
  w.shoot(-0.9, 0, 0, 108, 10);
  w.updateEBullets(1 / 60);
  assert.equal(w.player.hp, 90);
  w.eb = [];
  w.player.iT = 0;
  w.arena.obs = [{ t: "b", x: -1.5, y: 0, w: 0.3, h: 1 }];
  w.shoot(-2, 0, 0, 240, 10);
  w.updateEBullets(1 / 60);
  assert.equal(w.player.hp, 90, "wall must stop the shot before it hits the player");
});

test("Core reinforcements include pending spawns in their crowd limit", () => {
  const w = world();
  w.spawnBoss("core");
  const boss = w.boss;
  boss.spawnT = 0;
  for (let i = 0; i < 100; i++) {
    boss.st = "summon";
    boss.n = 0;
    boss.t = 0;
    updateBoss(w, boss, 1 / 60);
  }
  assert.equal(w.enemies.length + w.markers.length, 74);
  w.markers.length -= 4;
  boss.st = "summon";
  boss.n = 0;
  updateBoss(w, boss, 1 / 60);
  assert.equal(w.enemies.length + w.markers.length, 74, "summoning resumes when room returns");
});
