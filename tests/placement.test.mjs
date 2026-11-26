import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { World } = await import("../src/core/world.js");
const { cleanRun } = await import("../src/core/save.js");
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

test("hunting floors, static plates and sweeping beams pressure players who stay put", () => {
  // 1. Wave 2 includes hunting floor traps that surface onto a center-camping player.
  const w = world(731);
  w.startWave(2);
  const hunters = w.traps.filter((t) => t.fam === "floor" && t.hunt);
  assert.ok(hunters.length >= 1, "Wave 2 must include at least one hunting floor trap");
  w.arena.obs = [];
  w.player.x = 0;
  w.player.y = 2;
  w.player.vx = 0;
  w.player.vy = 0;
  hunters[0].t = hunters[0].wait;
  rlUpdateTraps(w, 0.05);
  assert.equal(hunters[0].st, "warn");
  assert.ok(Math.hypot(hunters[0].x - 0, hunters[0].y - 2) < 1.0, "hunting floor trap must surface on center camper");

  // 2. Sweeping beams aim across the player's position instead of blindly into outer walls and alternate sweep dir.
  const wb = world(731);
  wb.arena.obs = [];
  wb.player.x = 0;
  wb.player.y = 2;
  const beamTrap = { id: 1, fam: "beam", skin: "laser", x: -16, y: 2, a: Math.PI, dir: 1, st: "idle", t: 5, wait: 1 };
  wb.traps = [beamTrap];
  rlUpdateTraps(wb, 0.05);
  assert.equal(wb.beams.length, 1);
  assert.ok(wb.arena.rayLen(beamTrap.x, beamTrap.y, beamTrap.a, TRAP_SKINS.laser.len) >= 6);
  // Advance past beam lifetime and confirm sweep direction alternates.
  rlUpdateTraps(wb, beamTrap.span + 0.05);
  assert.equal(beamTrap.st, "idle");
  assert.equal(beamTrap.dir, -1);

  // 3. Static floor traps wake early on proximity.
  const wm = world(731);
  wm.arena.obs = [];
  wm.player.x = 0;
  wm.player.y = 0;
  const plate = {
    id: 1,
    fam: "floor",
    skin: "plate",
    x: 1,
    y: 0,
    st: "idle",
    t: 0,
    wait: 4,
    hunt: false,
    a: 0,
    dir: 1,
  };
  wm.traps = [plate];
  rlUpdateTraps(wm, 0.05);
  assert.ok(plate.wait < 0.6, "static floor trap must wake quickly when player steps near it");
});

test("Endless places all three trap families and a player-shot mine chain remains friendly", () => {
  const w = world(731);
  w.route = ["starHall"];
  w.endless = true;
  w.startWave(23);
  assert.deepEqual(new Set(w.traps.map(({ fam }) => fam)), new Set(["mine", "floor", "beam"]));
  checkPlacement(w.arena, trapFootprints(w.traps), "Star Hall, seed 731, wave 23");
  const [first, second] = w.traps.filter(({ fam }) => fam === "mine");
  const skin = TRAP_SKINS[first.skin];
  rlUpdateTraps(w, skin.arm);
  assert.equal(first.st, "armed");
  assert.equal(second.st, "armed");
  assert.ok(rlShootTrap(w, { x: first.x + 0.1, y: first.y, r: 0.2 }, first.x - 0.1, first.y));
  assert.equal(first.st, "gone");
  assert.equal(second.st, "fuse");
  assert.equal(w.fx.find((ev) => ev.id === second.id && ev.k === "trapWarn").delay, skin.fuse);

  w.player.x = second.x;
  w.player.y = second.y;
  const hp = w.player.hp;
  const enemy = w.spawnEnemy("kettleGuard", second.x, second.y, { noVariant: true });
  enemy.spawnT = 0;
  w.hash.build(w.enemies);
  rlUpdateTraps(w, skin.fuse - 0.01);
  assert.equal(second.st, "fuse");
  rlUpdateTraps(w, 0.02);
  assert.equal(second.st, "gone");
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(w.player.hp, hp);
});

test("Traps Off removes arena traps and Extra Traps throughout a run", () => {
  const w = new World({ seed: 731, trapMode: "off" });
  w.route = ["emberHill"];
  w.endless = true;
  for (const wave of [1, 5, 9, 10, 21, 31, 41, 51, 61, 71]) {
    const preview = w.previewWave(wave);
    w.startWave(wave);
    assert.equal(preview.traps, false);
    assert.notEqual(preview.mutator, "extraTraps");
    assert.equal(w.mods.extraTraps, undefined);
    assert.equal(w.traps.length, 0);
    assert.ok(w.arena.vents.length > 0, "Ember Hill still has its vents");
  }
  assert.equal(new World({ snap: cleanRun(w.snapshot()) }).trapMode, "off");
});

test("Impossible adds early traps, carries into Endless and staggers readable attacks", () => {
  const w = new World({ seed: 731, trapMode: "impossible" });
  assert.ok(w.traps.length && w.traps.every((trap) => trap.hunt));
  w.hold = true;
  rlUpdateTraps(w, 5);
  assert.ok(
    w.traps.every((trap) => trap.st === "idle" && trap.t === 0),
    "the movement tutorial holds traps",
  );
  w.hold = false;
  assert.equal(w.previewWave(5).traps, true);
  for (const wave of [3, 5]) {
    w.startWave(wave);
    assert.deepEqual(new Set(w.traps.map((trap) => trap.fam)), new Set(["floor", "mine", "beam"]));
    checkPlacement(w.arena, trapFootprints(w.traps), `Impossible wave ${wave}`);
  }
  w.startWave(20);
  w.state = "victory";
  assert.ok(w.enterEndless());
  const restored = new World({ snap: cleanRun(w.snapshot()) });
  assert.equal(restored.trapMode, "impossible");
  assert.ok(restored.endless);

  w.startWave(3);
  w.arena.obs = [];
  const floor = { id: 1, fam: "floor", skin: "plate", x: 0, y: 2, st: "idle", wait: 0, t: 0 };
  const beam = { id: 2, fam: "beam", skin: "laser", x: -12, y: 2, a: 0, st: "idle", dir: 1, wait: 0, t: 0 };
  w.traps = [floor, beam];
  w.player.iT = 0;
  w.fx.length = 0;
  rlUpdateTraps(w, 1 / 60);
  assert.equal(floor.st, "warn");
  assert.equal(beam.st, "idle");
  assert.equal(floor.delay, TRAP_SKINS.plate.warn);
  rlUpdateTraps(w, 0.3);
  assert.equal(beam.st, "idle");
  rlUpdateTraps(w, 0.16);
  assert.equal(beam.st, "live");
  const attack = w.beams[0];
  const initialAngle = attack.a;
  w.updateBeams(attack.warn - 0.01);
  assert.equal(attack.a, initialAngle);
  w.updateBeams(0.02);
  assert.ok(attack.a > initialAngle);
  const hp = w.player.hp;
  rlUpdateTraps(w, floor.delay);
  assert.equal(hp - w.player.hp, Math.round(TRAP_SKINS.plate.dmg * 1.75 * w.dmgMul));
  assert.ok(floor.wait < TRAP_SKINS.plate.cd * 0.8);
});
