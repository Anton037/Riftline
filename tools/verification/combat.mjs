// Real attack frames: every boss pattern, each weapon, all beam families and the new natural traps.
// Simulation advances normally; intermediate draws are skipped and the final pixels are rendered once.
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { launchArgs } from "../browser.js";
import { BOSS_EFFECTS, WEAPON_EFFECTS, SENTINEL_BEAMS } from "../../src/data/combat-effects.js";
import { bossByBiome } from "../../src/data/enemies.js";
const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const { bossPatterns, OVERDRIVE } = await import("../../src/core/ai.js");
const url = process.argv[2] || "http://localhost:8124/",
  tag = process.argv[3] || "current",
  mobile = process.argv[4] === "land",
  out = `verification-output/${tag}-combat-${mobile ? "phone" : "tablet"}`;
fs.mkdirSync(out, { recursive: true });
const times = {
  charge: 0.95,
  ring: 1.45,
  stomp: 1.3,
  summon: 0.8,
  eggs: 0.9,
  spiral: 1.8,
  burst: 1.8,
  rain: 1.2,
  frostbeam: 1.4,
  teleport: 1.2,
  frostnova: 1.2,
  icelances: 1.3,
  glacier: 1.2,
  iceshards: 1.7,
  cross: 1.5,
  lockdown: 1.6,
  whiteout: 1.6,
  plague: 1.8,
  collapse: 1.6,
  firestorm: 2.2,
  rise: 1.4,
  shards: 1.3,
  sunlance: 1.4,
  mirage: 1.7,
  noon: 1.6,
};
const specs = [];
for (const weapon of Object.keys(WEAPON_EFFECTS))
  specs.push({ kind: "weapon", weapon, biome: "city", time: weapon === "rail" ? 0.06 : 0.12 });
specs.push(
  { kind: "weapon", weapon: "tesla", biome: "city", time: 0.28, extra: "chain" },
  { kind: "weapon", weapon: "disc", biome: "city", time: 0.82, extra: "return" },
  { kind: "weapon", weapon: "flame", biome: "city", time: 0.38, extra: "stream" },
);
for (const [boss, attacks] of Object.entries(bossPatterns)) {
  const biome = Object.keys(bossByBiome).find((id) => bossByBiome[id] === boss) || "caldera";
  for (const attack of new Set([...attacks, OVERDRIVE[boss]]))
    specs.push({
      kind: "boss",
      boss,
      attack,
      biome,
      time: times[attack] || 1.4,
      enraged: attack === OVERDRIVE[boss],
      phase: boss === "core" && attack === "cross" ? 2 : undefined,
    });
}
for (const [biome, skin] of Object.entries(SENTINEL_BEAMS)) specs.push({ kind: "beam", biome, skin, time: 1.3 });
for (const [biome, skin, fam] of [
  ["caldera", "magma", "beam"],
  ["caldera", "embermine", "mine"],
  ["flats", "glassmine", "mine"],
])
  for (const phase of ["warn", "fire"]) specs.push({ kind: "trap", biome, skin, fam, phase, time: 0.1 });
// Close views check material detail and silhouette on every boss, plus the Tyrant's magma lob.
specs.push(
  { kind: "boss", boss: "warden", biome: "city", attack: "ring", time: 1.45, close: true },
  { kind: "boss", boss: "queen", biome: "marsh", attack: "spiral", time: 1.8, close: true },
  { kind: "boss", boss: "prism", biome: "shelf", attack: "icelances", time: 1.3, close: true },
  { kind: "boss", boss: "core", biome: "core", attack: "spiral", time: 1.8, close: true },
  { kind: "boss", boss: "wyrm", biome: "flats", attack: "shards", time: 1.3, close: true },
  { kind: "boss", boss: "tyrant", biome: "caldera", attack: "barrage", time: 1.15, close: true },
  { kind: "boss", boss: "tyrant", biome: "caldera", attack: "rain", time: 0.85, close: true },
);
const browser = await chromium.launch({ args: launchArgs() });
try {
  const page = await browser.newPage({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem(
      "riftline.save.v1",
      JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true }, settings: { sfx: 0, music: 0, ambience: 0 } }),
    );
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        if (!window.__visualManualFrames) fn(t);
      });
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      window.__riftTest?.renderer?.finishAtlasReady &&
      window.__riftTest.renderer.arena.uniforms.uTerrainReady.value === 1,
  );
  await page.evaluate(() => {
    window.__visualManualFrames = true;
    window.__riftTest.game.startRun({});
    window.__riftTest.game.paused = true;
    window.__riftTest.game.intro = null;
  });
  const rows = [];
  const filter = process.argv[5] || "all",
    selected = specs.filter(
      (s) =>
        filter === "all" ||
        (filter === "close" && s.close) ||
        s.kind === filter ||
        s.boss === filter ||
        s.weapon === filter ||
        `${s.boss}-${s.attack}` === filter ||
        (filter === "phone-review" && (s.kind === "weapon" || s.enraged || s.kind === "trap" || s.kind === "beam")),
    );
  assert.ok(selected.length, `Unknown combat filter: ${filter}`);
  for (const spec of selected) {
    const row = await page.evaluate((spec) => {
      const T = window.__riftTest,
        r = T.renderer,
        w = new T.World({ seed: 731, weapon: spec.weapon || "pulse", threat: 0, ws: {} }),
        input = { mx: 0, my: 0, auto: false, fire: false, dash: false };
      T.game.world = w;
      T.game.paused = true;
      T.game.intro = null;
      w.route = [spec.biome];
      w.endless = true;
      w.startWave(spec.kind === "boss" ? 5 : 32);
      w.plan = [];
      w.planIdx = 0;
      w.planTotal = 0;
      w.bossPending = null;
      w.markers = [];
      w.enemies = [];
      w.boss = null;
      w.traps = [];
      w.pb = [];
      w.eb = [];
      w.hazards = [];
      w.beams = [];
      w.fx = [];
      w.player.x = spec.kind === "weapon" ? -3 : 6;
      w.player.y = spec.kind === "weapon" ? 2 : 6;
      w.player.aim = 0;
      w.player.face = 0;
      w.player.fireT = 1e6;
      w.god = true;
      w.time = 8;
      r.time = 8;
      r.focusOn(null);
      r.P.n = 0;
      r.corpses = [];
      r.smokeView.clear();
      r.rings = [];
      r.lines = [];
      r.flashes = [];
      r.attackView.marks = [];
      r.attackView.spikes = [];
      r.attackView.pillars = [];
      if (spec.kind === "boss") {
        w.spawnBoss(spec.boss);
        const b = w.boss;
        Object.assign(b, {
          x: 0,
          y: -2,
          st: spec.attack,
          t: 0,
          t2: 0,
          n: 0,
          ta: 0.7,
          face: 0.7,
          spin: 0.2,
          spawnT: 0,
          enraged: spec.enraged,
          phaseN: spec.phase || (spec.enraged ? 3 : 1),
        });
        b.hp = b.maxHp * (spec.phase === 2 ? 0.55 : spec.enraged ? 0.25 : 0.9);
        b.shieldT = 0;
        b.shielded = false;
      } else if (spec.kind === "weapon") {
        for (const [x, y] of [
          [7, 2],
          [9, 4],
          [5, 5],
        ]) {
          const e = w.spawnEnemy("grunt", x, y, { noVariant: true });
          e.spawnT = 0;
          e.hp = e.maxHp = 1e6;
          e.t = 1e6;
        }
      } else if (spec.kind === "beam") {
        w.beam({ x: -5, y: 0, a: 0.12, len: 16, w: 1.1, warn: 0.8, dur: 3, skin: spec.skin, src: "sentinel" });
      } else if (spec.kind === "trap") {
        w.traps = [
          {
            id: 700,
            skin: spec.skin,
            fam: spec.fam,
            x: 0,
            y: 0,
            a: 0,
            r: 2.2,
            st: spec.fam === "mine" ? "fuse" : "warn",
            t: 0.23,
            unarm: 1.5,
            delay: 0.45,
            done: false,
          },
        ];
        if (spec.fam === "beam")
          w.beam({ x: 0, y: 0, a: 0, len: 14, w: 0.8, warn: 0.8, dur: 3, skin: spec.skin, src: "trap" });
      }
      const realRender = r.renderer.render;
      let seenShots = new Set(),
        seenEvents = new Set(),
        frames = Math.max(1, Math.round(spec.time * 60));
      try {
        r.renderer.render = () => {};
        // Set up the real model before consuming its first muzzle event.
        r.frame(1 / 60, w);
        if (spec.kind === "weapon") {
          w.hash.build(w.enemies);
          w.fire(0);
        }
        for (let frame = 0; frame < frames; frame++) {
          if (spec.kind === "trap") {
            const t = w.traps[0];
            if (spec.fam === "beam") {
              w.beams[0].t = spec.phase === "fire" ? 1.1 : 0.4;
              w.updateBeams(0);
            }
            if (spec.phase === "fire" && frame === 0)
              w.emit("trapFire", { id: t.id, x: 0, y: 0, r: 2.2, skin: spec.skin, fam: spec.fam });
          } else {
            if (spec.extra === "stream" && frame % 4 === 0) w.fire(0);
            w.step(1 / 60, input);
          }
          for (const shot of w.eb) if (shot.src === spec.boss) seenShots.add(shot.kind);
          for (const e of w.fx) seenEvents.add(e.k);
          r.consume(w.fx, w, T.store.data.settings);
          w.fx = [];
          r.frame(1 / 60, w);
        }
      } finally {
        r.renderer.render = realRender;
      }
      r.camera.fov = spec.close ? 38 : 48;
      r.camera.updateProjectionMatrix();
      if (spec.close) {
        r.camera.position.set(7, 5, 8);
        r.camera.lookAt(0, 1.8, -2);
      } else if (spec.kind === "weapon") {
        r.camera.position.set(7, 7, 12);
        r.camera.lookAt(1, 1, 2);
      } else {
        r.camera.position.set(12, 15, 17);
        r.camera.lookAt(0, 0.7, 0);
      }
      r.renderer.render(r.scene, r.camera);
      T.ui.hud(w);
      return {
        ...spec,
        shots: [...seenShots],
        events: [...seenEvents],
        calls: r.renderer.info.render.calls,
        triangles: r.renderer.info.render.triangles,
        arcSegments: r.weaponView.segmentsPool?.n || 0,
        flameRibbons: r.weaponView.flamePool?.n || 0,
        bossColor: r.bossView?.glowMat.color.getHex(),
        shadows: r.renderer.shadowMap.enabled,
        errors: [r.rlTrapErr, r.rlAttackErr, r.rlHazardErr, r.rlBossCardErr, r.rlSkinErr].filter(Boolean).length,
      };
    }, spec);
    assert.deepEqual(errors, [], JSON.stringify(spec));
    assert.equal(row.errors, 0, JSON.stringify(spec));
    assert.equal(row.shadows, true);
    if (spec.kind === "boss" && spec.enraged)
      assert.equal(row.bossColor, BOSS_EFFECTS[spec.boss].accent, `${spec.boss}: enrage must keep its own palette`);
    if (spec.kind === "boss")
      for (const kind of row.shots)
        assert.equal(kind, BOSS_EFFECTS[spec.boss].projectile, `${spec.boss}/${spec.attack}`);
    if (spec.kind === "weapon" && spec.weapon === "tesla" && !spec.extra) assert.ok(row.arcSegments > 0);
    if (spec.kind === "weapon" && spec.weapon === "flame") assert.ok(row.flameRibbons > 0);
    const name =
      spec.kind === "boss"
        ? `${spec.boss}-${spec.attack}${spec.close ? "-close" : ""}`
        : spec.kind === "weapon"
          ? `${spec.weapon}-${spec.extra || "flight"}`
          : `${spec.kind}-${spec.skin}-${spec.phase || "live"}`;
    await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(rows, null, 2));
  console.log(`Combat identity: ${rows.length} rendered scenes; no browser/shader errors.`);
} finally {
  await browser.close();
}
