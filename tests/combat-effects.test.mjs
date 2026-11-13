// Exercise real attack state machines and presentation consumers, rather than testing only model construction.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { Group, Mesh } from "three";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { World } = await import("../src/core/world.js"),
  { updateBoss, updateEnemy, bossPatterns, OVERDRIVE } = await import("../src/core/ai.js"),
  { bossDefs, enemyDefs, bossByBiome } = await import("../src/data/enemies.js"),
  { weaponDefs } = await import("../src/data/weapons.js"),
  { BOSS_CARD } = await import("../src/core/boss-cards.js"),
  { TRAP_SKINS } = await import("../src/core/traps.js"),
  { biomeList, biomesById, planBiomeRoute } = await import("../src/data/biomes.js"),
  { buildLayout } = await import("../src/core/arena.js"),
  { makeRng, hashString } = await import("../src/core/util.js"),
  { BOSS_EFFECTS, ENEMY_EFFECTS, WEAPON_EFFECTS, BEAM_EFFECTS, BIOME_TRAP_EFFECTS, shotVoiceFor, attackSurface } =
    await import("../src/data/combat-effects.js"),
  { physicalProfile } = await import("../src/audio/physical-voices.js"),
  { attackVoice, RL_TRAP_SOUND, SoundEngine } = await import("../src/audio/sound.js"),
  { WeaponEffectsView } = await import("../src/render/weapon-effects-view.js"),
  { ActorEffectsView } = await import("../src/render/actor-effects-view.js");
const world = (weapon = "pulse") => new World({ seed: 731, weapon, threat: 0, ws: {} });
const keys = (o) => Object.keys(o).sort();

test("every current actor, weapon and biome has a complete effects identity", () => {
  assert.deepEqual(keys(BOSS_EFFECTS), keys(bossDefs));
  assert.deepEqual(keys(bossDefs), [...new Set(Object.values(bossByBiome))].sort());
  for (const registry of [bossPatterns, OVERDRIVE, BOSS_CARD]) assert.deepEqual(keys(registry), keys(bossDefs));
  assert.deepEqual(keys(ENEMY_EFFECTS), keys(enemyDefs));
  assert.deepEqual(keys(WEAPON_EFFECTS), keys(weaponDefs));
  assert.deepEqual(keys(BIOME_TRAP_EFFECTS), biomeList.map((b) => b.id).sort());
  const trapIds = [...new Set(Object.values(BIOME_TRAP_EFFECTS).flatMap(Object.values))].sort();
  assert.deepEqual(keys(TRAP_SKINS), trapIds, "every defined trap belongs to a current biome");
  assert.deepEqual(keys(RL_TRAP_SOUND), trapIds, "no orphan trap sound mappings");
  assert.equal(new Set(Object.values(BOSS_EFFECTS).map((e) => e.projectile)).size, 6);
  assert.equal(new Set(Object.values(BOSS_EFFECTS).map((e) => e.shot)).size, 6);
  assert.equal(new Set(Object.values(WEAPON_EFFECTS).map((e) => e.projectile)).size, 7);
  for (const [id, fx] of Object.entries(BOSS_EFFECTS)) {
    const p = physicalProfile(shotVoiceFor({ type: "boss", boss: id }));
    assert.equal(p.family, fx.shot, `${id}: must not fall back to another weapon family`);
  }
  for (const styles of Object.values(BIOME_TRAP_EFFECTS))
    for (const skin of Object.values(styles)) assert.ok(RL_TRAP_SOUND[skin]?.warn, skin);
});

test("all boss patterns and Overdrives retain their source through shots, zones, beams and events", (t) => {
  let patterns = 0,
    shots = 0;
  for (const [type, attacks] of Object.entries(bossPatterns)) {
    let bossShots = 0;
    for (const phase of type === "core" ? [1, 2, 3] : [1, 3])
      for (const attack of new Set([...attacks, OVERDRIVE[type]])) {
        const enraged = phase === 3;
        const w = world(),
          biome = Object.keys(bossByBiome).find((id) => bossByBiome[id] === type) || "caldera";
        w.route = [biome];
        w.startWave(5);
        w.arena.obs = [];
        w.enemies = [];
        w.player.x = 8;
        w.player.y = 4;
        w.spawnBoss(type);
        const b = w.boss;
        Object.assign(b, {
          x: 0,
          y: 0,
          spawnT: 0,
          st: attack,
          t: 0,
          t2: 0,
          n: 0,
          spin: 0.2,
          ta: 0,
          enraged,
          phaseN: phase,
        });
        b.hp = b.maxHp * (phase === 2 ? 0.55 : enraged ? 0.25 : 0.9);
        w._src = type;
        w.fx = [];
        w.eb = [];
        w.hazards = [];
        w.beams = [];
        for (let frame = 0; frame < 450 && b.st !== "walk"; frame++) {
          w.time += 1 / 30;
          updateBoss(w, b, 1 / 30);
        }
        assert.equal(b.st, "walk", `${type}/${attack}: pattern did not complete`);
        for (const shot of w.eb) {
          assert.equal(shot.src, type, `${type}/${attack}: lost projectile source`);
          assert.equal(shot.kind, BOSS_EFFECTS[type].projectile, `${type}/${attack}: wrong projectile`);
        }
        for (const h of w.hazards) assert.equal(h.src, type, `${type}/${attack}: lost zone source`);
        for (const beam of w.beams) {
          assert.equal(beam.src, type, `${type}/${attack}: lost beam source`);
          assert.ok(BEAM_EFFECTS[beam.skin], `${type}/${attack}: unthemed beam`);
        }
        for (const event of w.fx) assert.equal(event.src, type, `${type}/${attack}/${event.k}: lost effect source`);
        bossShots += w.eb.length;
        patterns++;
      }
    assert.ok(bossShots > 0, `${type}: no actual shots exercised`);
    shots += bossShots;
  }
  assert.ok(patterns >= 70 && shots > 500, `${patterns} patterns, ${shots} shots`);
  t.diagnostic(`${patterns} normal, middle-phase and enraged attack cases; ${shots} source-checked projectiles.`);
});

test("every ranged enemy uses its own projectile and shot voice in actual AI", () => {
  for (const [type, fx] of Object.entries(ENEMY_EFFECTS)) {
    const w = world();
    w.arena.obs = [];
    w.player.x = 10;
    w.player.y = 0;
    const e = w.spawnEnemy(type, 0, 0, { noVariant: true });
    Object.assign(e, { spawnT: 0, t: 0, los: true });
    w._src = type;
    w.fx = [];
    for (let frame = 0; frame < 300 && !w.eb.length; frame++) {
      w.time += 1 / 30;
      updateEnemy(w, e, 1 / 30);
    }
    if (!fx.projectile) {
      assert.equal(w.eb.length, 0, `${type}: ranged behavior needs an explicit identity`);
      continue;
    }
    assert.ok(w.eb.length, `${type}: no actual shot`);
    for (const shot of w.eb) assert.equal(shot.kind, fx.projectile, type);
    const events = w.fx.filter((e) => e.k === "eshot");
    assert.ok(events.length, type);
    for (const event of events) assert.equal(shotVoiceFor(event), fx.shot, type);
    assert.equal(physicalProfile(fx.shot).family, fx.shot);
  }
});

test("explicit attack sources override ambient context and matching surfaces drive both sound and look", () => {
  const w = world();
  w._src = "warden";
  w.fx = [];
  assert.equal(w.hazard({ x: 0, y: 0, r: 1, src: "tyrant" }).src, "tyrant");
  assert.equal(w.beam({ x: 0, y: 0, a: 0, src: "wyrm", skin: "sun" }).src, "wyrm");
  w.explode(0, 0, 1, 0, { kind: "stomp", src: "tyrant" });
  assert.equal(w.fx.at(-1).src, "tyrant");
  const cases = [
    ["stomp", "tyrant", "lavaCrack", "aLava"],
    ["stomp", "warden", "crack", "aQuake"],
    ["stomp", "wyrm", "glass", "aGlass"],
    ["rain", "queen", "acid", "aAcid"],
    ["rain", "core", "rift", "aRift"],
  ];
  for (const [kind, source, surface, voice] of cases) {
    assert.equal(attackSurface(kind, source, "city"), surface);
    assert.equal(attackVoice(kind, source, "city"), voice);
  }
  assert.equal(attackSurface("mortar", "mortar", "shelf", true), "frost");
  assert.equal(attackVoice("mortar", "mortar", "shelf", true), "aIce");
});

class Pool {
  constructor(geometry, material, max = Infinity) {
    this.mesh = new Mesh(geometry, material);
    this.max = max;
    this.n = 0;
  }
  y(...values) {
    assert.ok(values.every(Number.isFinite));
    return this.n < this.max ? this.n++ : -1;
  }
  yr(...values) {
    return this.y(...values);
  }
  seg(...values) {
    return this.y(...values);
  }
  col() {}
  colC() {}
}
test("all seven real player shots reach their distinct render path without mutating simulation shots", () => {
  for (const weapon of keys(weaponDefs)) {
    const w = world(weapon);
    w.fire(0);
    for (const b of w.pb) b.age = 0.15;
    const before = JSON.stringify(w.pb),
      r = {
        scene: new Group(),
        time: 8,
        discPool: new Pool(),
        rocketBodies: new Pool(),
        sprites: { bb: () => 0, colC() {} },
        smokeView: { emit() {} },
        B: {},
      };
    const view = new WeaponEffectsView(r, Pool);
    view.draw(1 / 60, w);
    assert.equal(JSON.stringify(w.pb), before, `${weapon}: rendering changed a live shot`);
    if (weapon === "tesla") assert.ok(view.segmentsPool.n >= 18, "Arc Caster must draw a branching arc");
    else if (weapon === "flame")
      assert.equal(view.flamePool.n, w.pb.length * 2, "Ember Jet must draw crossed flame ribbons");
    else if (weapon === "disc") assert.ok(r.discPool.n > 0);
    else if (weapon === "rocket") assert.ok(r.rocketBodies.n > 0 && view.flamePool.n > 0);
    else assert.ok(view.segmentsPool.n > 0, weapon);
    for (const p of view.list) {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
  }
});

test("every Arc Caster shot remains visible at the simulation projectile cap", () => {
  const w = world("tesla");
  w.fire(0);
  const shot = w.pb[0];
  w.pb = Array.from({ length: 420 }, (_, i) => ({
    ...shot,
    id: i + 1,
    x: (i % 21) - 10,
    y: Math.floor(i / 21) - 10,
    age: 0.2,
  }));
  const r = { scene: new Group(), time: 8 },
    view = new WeaponEffectsView(r, Pool);
  view.draw(1 / 60, w);
  assert.equal(view.segmentsPool.n, 420 * 9, "shorter arcs still render every projectile under saturation");
  assert.ok(view.segmentsPool.n < view.segmentsPool.max);
  for (const p of view.list) {
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
});

test("cached arcs match uncached geometry while phase, motion and detail change", () => {
  class RecordingPool extends Pool {
    constructor(...args) {
      super(...args);
      this.transforms = [];
    }
    seg(...values) {
      this.transforms.push(values);
      return super.seg(...values);
    }
  }
  const w = world("tesla");
  w.fire(0);
  const shot = w.pb[0],
    before = JSON.stringify(shot),
    r = { scene: new Group(), time: 1 },
    referenceR = { scene: new Group(), time: 1 },
    view = new WeaponEffectsView(r, RecordingPool),
    reference = new WeaponEffectsView(referenceR, RecordingPool);
  for (const [time, count, seed] of [
    [1, 8, shot.id],
    [1.01, 4, shot.id],
    [1.02, 8, shot.id],
    [1.07, 4, shot.id],
    [1.07, 8, shot.id + 1],
  ]) {
    r.time = referenceR.time = time;
    for (const v of [view, reference])
      if (v.segmentsPool) {
        v.segmentsPool.n = 0;
        v.segmentsPool.transforms = [];
      }
    const args = [time * 2, -time, 0.7 + time, 0.3 + time, 0.12, seed, 1.4, count];
    view.arc(...args, shot);
    reference.arc(...args);
    assert.deepEqual(view.segmentsPool.transforms, reference.segmentsPool.transforms);
  }
  assert.equal(JSON.stringify(shot), before, "render caching must not add fields to simulation shots");
  for (const v of [view, reference])
    for (const p of v.list) {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
});

test("motion and summon effects no longer borrow unrelated actor palettes", () => {
  const bursts = [],
    rings = [],
    r = {
      burst: (...args) => bursts.push(args),
      ring: (...args) => rings.push(args),
      debrisBurst() {},
      line() {},
      flash() {},
      addShake() {},
      smokeView: { emit() {} },
    };
  const view = new ActorEffectsView(r);
  view.consume({ k: "hatch", src: "tyrant", x: 0, y: 0, big: true }, 1);
  assert.ok(bursts.some((b) => b[5].getHex() === BOSS_EFFECTS.tyrant.color));
  assert.ok(!bursts.some((b) => b[5].getHex() === BOSS_EFFECTS.queen.color));
  bursts.length = rings.length = 0;
  view.consume({ k: "blink", src: "leaper", leap: true, x: 0, y: 0 }, 1);
  assert.equal(rings.length, 0, "a physical leap must not open a teleport ring");
  view.consume({ k: "blink", src: "wyrm", x: 0, y: 0 }, 1);
  assert.ok(!bursts.some((b) => b[5].getHex() === BOSS_EFFECTS.prism.color));
});

test("sound consumption preserves source-aware summons, beam warnings and the Glasswyrm shot", () => {
  const played = [],
    engine = { live: () => true, play: (...args) => played.push(args), bossPush() {}, bossEnd() {}, biome: "caldera" };
  SoundEngine.prototype.consume.call(
    engine,
    [
      { k: "eshot", type: "boss", boss: "wyrm" },
      { k: "hatch", src: "tyrant", big: true },
      { k: "blink", src: "leaper", leap: true },
      { k: "beamWarn", skin: "rift" },
    ],
    null,
  );
  assert.deepEqual(
    played.map((p) => p[0]),
    ["eshotWyrm", "hatch", "leap", "bwRift"],
  );
  assert.equal(played[1][1].src, "tyrant");
  assert.notEqual(
    physicalProfile("hatch", { src: "tyrant" }).sample,
    physicalProfile("hatch", { src: "queen" }).sample,
  );
});

test("canonical biome names preserve pre-update seeded routes and map geometry", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("fixtures/pre-4.2-layouts.json", import.meta.url)));
  for (const row of fixture.layouts) {
    const { key, ...layout } = buildLayout(biomesById[row.biome], row.seed, row.wave, false);
    assert.equal(
      createHash("sha256").update(JSON.stringify(layout)).digest("hex"),
      row.digest,
      `${row.biome}/${row.seed}/${row.wave}`,
    );
  }
  for (const row of fixture.routes)
    assert.deepEqual(planBiomeRoute(makeRng(hashString(row.seed + ":route"))), row.route);
  for (const row of fixture.events) {
    const w = new World({ seed: row.seed, weapon: "pulse", threat: 0, ws: {} });
    w.route = ["caldera"];
    w.endless = true;
    w.startWave(row.wave);
    const a = w.arena,
      features = { obs: a.obs, vents: a.vents, ice: a.ice, acid: a.acid, portals: a.portals, devils: a.devils };
    assert.equal(w.event, row.event);
    assert.equal(
      createHash("sha256").update(JSON.stringify(features)).digest("hex"),
      row.digest,
      `Ashfall event ${row.seed}/${row.wave}`,
    );
  }
});
