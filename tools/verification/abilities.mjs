// Actual ability state/phase captures and world-space scenery; no synthetic effect-only mock scene.
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { launchArgs } from "../browser.js";
const [url = "http://localhost:8124/", tag = "current", layout = "tablet", filter = "all"] = process.argv.slice(2);
const phone = layout === "land" || layout === "phone";
const out = `verification-output/${tag}-abilities-${phone ? "phone" : "tablet"}`;
fs.mkdirSync(out, { recursive: true });
const specs = [
  ...[0.07, 0.22, 0.5, 0.85].map((time) => ({ kind: "nova", biome: "city", time })),
  ...[0.15, 0.55].map((time) => ({ kind: "collapse", biome: "city", time })),
  { kind: "surge", biome: "city", time: 0.16 },
  ...[0.12, 0.45, 1, 1.65, 2.05, 2.8].map((time) => ({ kind: "singularity", biome: "city", time })),
  { kind: "searing", biome: "city", time: 2.4 },
  { kind: "shield", biome: "city", time: 0.15 },
  ...[0.08, 0.32].map((time) => ({ kind: "block", biome: "city", time })),
  { kind: "portal", biome: "core", time: 0.4 },
  ...["centre", "north", "south", "east", "west", "northwest", "northeast", "southwest", "southeast"].map(
    (position) => ({ kind: "sky", biome: "shelf", position, time: 0.2 }),
  ),
  ...["shelf", "marsh", "core", "caldera", "flats"].flatMap((biome) => [
    { kind: "nova", biome, time: 0.22 },
    { kind: "singularity", biome, time: 1 },
  ]),
];
const selected = specs.filter(
  (s) =>
    filter === "all" ||
    s.kind === filter ||
    (filter === "before" &&
      ((s.biome === "city" && ["nova", "singularity", "shield"].includes(s.kind) && [0.22, 1, 0.15].includes(s.time)) ||
        s.kind === "portal" ||
        (s.kind === "sky" && ["centre", "north", "east", "south"].includes(s.position)))),
);
assert.ok(selected.length, "Unknown abilities filter");
const browser = await chromium.launch({ args: launchArgs() });
try {
  const page = await browser.newPage({
    viewport: phone ? { width: 844, height: 390 } : { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
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
  });
  const rows = [];
  for (const spec of selected) {
    const row = await page.evaluate((spec) => {
      const T = window.__riftTest,
        r = T.renderer,
        w = new T.World({ seed: 731, weapon: "pulse", threat: 0, ws: {} });
      T.game.world = w;
      T.game.intro = null;
      T.game.paused = true;
      w.route = [spec.biome];
      w.startWave(2);
      w.plan = [];
      w.planIdx = 0;
      w.planTotal = 0;
      w.markers = [];
      w.bossPending = null;
      w.traps = [];
      w.enemies = [];
      w.fx = [];
      w.player.x = -3;
      w.player.y = 0;
      w.player.fireT = 1e6;
      w.god = true;
      if (spec.kind === "sky") {
        const at = {
          centre: [0, 0],
          north: [0, -1],
          south: [0, 1],
          east: [1, 0],
          west: [-1, 0],
          northwest: [-1, -1],
          northeast: [1, -1],
          southwest: [-1, 1],
          southeast: [1, 1],
        }[spec.position];
        w.player.x = at[0] * (w.arena.W - 3);
        w.player.y = at[1] * (w.arena.H - 3);
      } else if (spec.kind === "portal") {
        const p = w.arena.portals[0];
        if (!p) throw new Error("Core portal missing");
        w.player.x = p.ax + 3;
        w.player.y = p.ay + 2;
      } else
        for (const [x, y] of [
          [3, 0],
          [4, 2],
          [4, -2],
        ]) {
          const e = w.spawnEnemy("grunt", x, y, { noVariant: true });
          Object.assign(e, { spawnT: 0, hp: 1e6, maxHp: 1e6, speed: 0 });
        }
      r.resetCamera();
      r.focusOn(null);
      r.time = 8;
      r.P.n = 0;
      r.rings = [];
      r.lines = [];
      r.flashes = [];
      r.corpses = [];
      r.flashT = 0;
      r.smokeView.clear();
      r.attackView.marks = [];
      r.attackView.spikes = [];
      r.attackView.pillars = [];
      if (r.abilityView) r.abilityView.clear();
      const real = r.renderer.render,
        powerDraw = r.abilityView?.draw;
      let borrowedBeams = 0;
      if (powerDraw)
        r.abilityView.draw = function (...args) {
          const before = r.beams.n;
          const result = powerDraw.apply(this, args);
          borrowedBeams += r.beams.n - before;
          return result;
        };
      r.renderer.render = () => {};
      const input = { mx: 0, my: 0, auto: false, fire: false, dash: false };
      const seen = new Set();
      try {
        for (let frame = 0; frame < 12; frame++) r.frame(1 / 60, w);
        w.hash.build(w.enemies);
        if (spec.kind === "nova" || spec.kind === "collapse") {
          if (spec.kind === "collapse") w.stats.collapse = true;
          w.player.nova = 100;
          w.nova();
        } else if (["singularity", "searing"].includes(spec.kind)) {
          w.stats.gadgetFire = spec.kind === "searing";
          w.useGadget({ aim: false });
        } else if (spec.kind === "surge") w.emit("surge", { x: w.player.x, y: w.player.y, r: 4, n: 20 });
        else if (spec.kind === "shield" || spec.kind === "block") {
          w.player.iT = 0;
          w.player.shield = true;
          if (spec.kind === "block") {
            w.player.iT = 0;
            w.god = false;
            w.hurtPlayer(10, 1, 0, "grunt");
            w.god = true;
          }
        }
        for (let frame = 0; frame < Math.max(1, Math.round(spec.time * 60)); frame++) {
          for (const e of w.fx) seen.add(e.k);
          r.consume(w.fx, w, T.store.data.settings);
          w.fx = [];
          w.step(1 / 60, input);
          r.frame(1 / 60, w);
        }
      } finally {
        r.renderer.render = real;
        if (powerDraw) r.abilityView.draw = powerDraw;
      }
      if (![w.player.x, w.player.y, ...r.camera.position.toArray()].every(Number.isFinite))
        throw new Error("Non-finite staged camera/player");
      r.renderer.render(r.scene, r.camera);
      T.ui.hud(w);
      return {
        ...spec,
        events: [...seen],
        calls: r.renderer.info.render.calls,
        triangles: r.renderer.info.render.triangles,
        sharedBeams: r.beams.n,
        borrowedBeams,
        screenFlash: r.flashT,
        rings: r.rings.length,
        particles: r.P.n,
        abilityPools: r.abilityView?.list.map((p) => ({ max: p.max, n: p.n })) || [],
        singularities: w.singularities.map((g) => ({ t: g.t, pullT: g.pullT, r: g.r })),
        errors: [r.rlTrapErr, r.rlHazardErr, r.rlAttackErr, r.rlBossCardErr, r.rlSkinErr].filter(Boolean).length,
      };
    }, spec);
    assert.deepEqual(errors, [], JSON.stringify(spec));
    assert.equal(row.errors, 0, JSON.stringify(spec));
    assert.equal(row.borrowedBeams, 0, "player powers must leave hostile beams available");
    assert.equal(row.screenFlash, 0, "player powers must not wash out the screen");
    assert.ok(row.abilityPools.every((p) => p.n <= p.max));
    if ((spec.kind === "nova" && spec.time === 0.85) || (spec.kind === "singularity" && spec.time === 2.8))
      assert.ok(
        row.abilityPools.every((p) => p.n === 0),
        "expired powers must release every instance",
      );
    const name = `${spec.biome}-${spec.kind}-${spec.position || String(spec.time).replace(".", "_")}`;
    await page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(rows, null, 2));
  console.log(`Abilities/scenery: ${rows.length} scenes; no browser/shader errors.`);
} finally {
  await browser.close();
}
