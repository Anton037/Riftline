import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { World } = await import("../src/core/world.js");
const { rlShootTrap, rlUpdateTraps, TRAP_SKINS, trapFootprints } = await import("../src/core/traps.js");
const { enemyDefs } = await import("../src/data/enemies.js");

const world = (seed = 731) => new World({ seed, weapon: "lanternGun", threat: 0, ws: {} });
const events = {
  lanternYard: "festival",
  snowRidge: "snowWind",
  mossBog: "fireflies",
  starHall: "starPaths",
  emberHill: "hotWind",
  sunDunes: "sandstorm",
};

function checkPlacement(arena, circles, label) {
  for (let i = 0; i < circles.length; i++) {
    const { x, y, r } = circles[i];
    assert.ok(!arena.outside(x, y, r), `${label}, outside at ${x}, ${y}`);
    assert.ok(!arena.blocked(x, y, r), `${label}, cover overlap at ${x}, ${y}`);
    assert.ok(!arena.featureBlocked(x, y, r), `${label}, hazard overlap at ${x}, ${y}`);
    for (const other of circles.slice(0, i)) {
      assert.ok(Math.hypot(other.x - x, other.y - y) >= r + other.r, `${label}, objects overlap`);
    }
  }
}

test("seeded traps and supply caches leave room around cover and biome event hazards", () => {
  for (const [biome, event] of Object.entries(events)) {
    for (const seed of [42, 731]) {
      const w = world(seed);
      w.route = [biome];
      w.endless = true;
      w.eventFor = () => event;
      for (const wave of [4, 8, 23, 46, 65]) {
        w.startWave(wave);
        assert.ok(w.traps.length > 0, `${biome} ${wave} has no traps`);
        const label = `${biome}, seed ${seed}, wave ${wave}`;
        const sites = trapFootprints(w.traps);
        checkPlacement(w.arena, sites, label);
        for (const { x, y, r } of sites) assert.ok(Math.hypot(x, y - 2) > 4.6 + r, label);
        for (const trap of w.traps.filter(({ fam }) => fam === "beam")) {
          assert.ok(w.arena.rayLen(trap.x, trap.y, trap.a, TRAP_SKINS[trap.skin].len) >= 7, label);
        }
        w.pickups.filter(({ cache }) => cache).forEach(({ x, y }) => sites.push({ x, y, r: 0.35 }));
        checkPlacement(w.arena, sites, label);
      }
      // Restart the same wave after an earlier copy of it acquired temporary cover.
      w.startWave(46);
      const traps = structuredClone(w.traps);
      const caches = w.pickups.filter(({ cache }) => cache).map(({ x, y }) => ({ x, y }));
      w.arena.obs.push({ t: "c", x: 0, y: 0, r: 5, glassSpire: true });
      w.startWave(46, 0, true);
      assert.deepEqual(w.traps, traps);
      assert.deepEqual(
        w.pickups.filter(({ cache }) => cache).map(({ x, y }) => ({ x, y })),
        caches,
      );
      assert.ok(!w.arena.obs.some(({ glassSpire }) => glassSpire));
    }
  }
});

test("a wave waits for space and then places all its enemies at distinct arrivals", () => {
  const w = world();
  const { arena } = w;
  const members = Array.from({ length: 14 }, () => ({ type: "ironGolem", elite: true }));
  w.plan = [{ gap: 2, members }];
  w.groupT = 0;
  arena.obs = [{ t: "b", x: 0, y: 0, w: arena.W, h: arena.H }];
  w.updateSpawns(0.1);
  assert.equal(w.planIdx, 0);
  assert.equal(w.markers.length, 0);

  arena.obs = [{ t: "b", x: -8, y: -8, w: 1.2, h: 3 }];
  arena.vents = [{ x: 8, y: 9, r: 2.4 }];
  arena.acid = [{ x: -8, y: 8, r: 0.3, grow: { to: 3.1 } }];
  arena.portals = [{ ax: 8, ay: -9, bx: -9, by: 1, next: { ax: 11, ay: -5, bx: -12, by: 7 } }];
  w.traps = [{ id: 1, fam: "mine", skin: "mine", x: 0, y: -10, st: "armed" }];
  assert.ok(w.queueEnemySpawn("kettleGuard", { elite: true, champion: true }));
  w.updateSpawns(0.5);
  assert.equal(w.planIdx, 1);
  assert.equal(w.markers.length, 15);
  const markers = w.markers.map((marker) => ({
    ...marker,
    r: enemyDefs[marker.type].r * 1.3 * (marker.champion ? 1.3 : 1),
  }));
  checkPlacement(arena, [...trapFootprints(w.traps), ...markers], "crowded arrivals");
  w.updateMarkers(2);
  assert.equal(w.enemies.length, 15);
  assert.equal(w.markers.length, 0);
});

test("Star Heart's arrival clears the portal and keeps the boss facing the arena", () => {
  const w = world();
  w.route = ["lanternYard", "mossBog", "snowRidge", "starHall"];
  w.startWave(20);
  assert.equal(w.bossPending, "starHeart");
  w.waveT = 2;
  w.updateSpawns(0);
  assert.equal(w.bossPending, null);
  assert.equal(w.boss.type, "starHeart");
  checkPlacement(w.arena, [...trapFootprints(w.traps), w.boss], "boss arrival");
  assert.ok(w.boss.y < w.player.y);
});

test("a respawning mine and a hunting floor trap wait if clear ground is unavailable", () => {
  const w = world();
  const { arena } = w;
  arena.obs = [{ t: "b", x: 0, y: 0, w: arena.W, h: arena.H }];
  const mine = { id: 1, fam: "mine", skin: "mine", x: -8, y: 8, st: "gone", t: 2, respawn: 1 };
  const floor = { id: 2, fam: "floor", skin: "plate", x: 8, y: 8, st: "idle", t: 2, wait: 1, hunt: true };
  w.traps = [mine, floor];
  rlUpdateTraps(w, 0.1);
  assert.equal(mine.st, "gone");
  assert.equal(floor.st, "idle");
  assert.equal(w.fx.filter((event) => event.k === "trapWarn").length, 0);

  arena.obs = [];
  arena.vents = [{ x: w.player.x, y: w.player.y, r: 1.45 }];
  rlUpdateTraps(w, 2);
  assert.equal(mine.st, "unarmed");
  assert.equal(floor.st, "warn");
  checkPlacement(arena, trapFootprints(w.traps), "relocated traps");
});

test("a shot clears even a fusing biome mine without leaving harmful ground", () => {
  for (const skin of ["spore", "frost", "embermine"]) {
    const w = world();
    w.arena.acid = [];
    w.arena.ice = [];
    const trap = { id: 1, x: 0, y: 0, fam: "mine", skin, st: "fuse", t: 0.1 };
    w.traps = [trap];
    const hp = w.player.hp;
    const foe = w.spawnEnemy("kettleGuard", 0.8, 0, { noVariant: true });
    foe.spawnT = 0;
    w.hash.build(w.enemies);
    assert.ok(rlShootTrap(w, { x: 1, y: 0, r: 0.2 }, -1, 0), skin);
    assert.equal(trap.st, "gone");
    assert.equal(w.player.hp, hp);
    assert.ok(foe.hp < foe.maxHp, skin);
    assert.deepEqual([w.arena.acid.length, w.arena.ice.length, w.burnPools.length], [0, 0, 0], skin);
  }
});
