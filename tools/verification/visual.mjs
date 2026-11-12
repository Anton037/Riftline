// Fixed-seed visual matrix: every biome, regular encounter and boss, on a tablet or landscape phone.
// Unlike a normal run's route, the matrix never silently skips two places.
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { launchArgs } from "../browser.js";

const url = process.argv[2] || "http://localhost:8124/index.html";
const tag = process.argv[3] || "current";
const mobile = ["land", "phone"].includes(process.argv[4]);
const requestedBiome = process.argv[5] && process.argv[5] !== "all" ? process.argv[5] : null;
const frameRate = +(process.argv[6] || 60);
assert.ok([30, 60, 120].includes(frameRate), `Unknown frame rate: ${frameRate}`);
if (process.argv[7]) assert.ok(["map", "overview"].includes(process.argv[7]), "Unknown visual review mode");
const mapReview = ["map", "overview"].includes(process.argv[7]);
const mapPositions = {
  centre: [0, 0],
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
  northwest: [-1, -1],
  northeast: [1, -1],
  southwest: [-1, 1],
  southeast: [1, 1],
};
const scenes = mapReview
  ? process.argv[7] === "overview"
    ? ["centre"]
    : Object.keys(mapPositions)
  : ["encounter", "boss", "warnings", "telegraphs"];
const out = `verification-output/${tag}-${mobile ? "land" : "tablet"}-${frameRate}fps`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: launchArgs() });
try {
  const page = await browser.newPage({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Keep the live loop for boot, then make staged captures advance only through explicit frames.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        if (!window.__visualManualFrames) fn(t);
      });
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
  await page.waitForFunction(
    () =>
      window.__riftTest.renderer.arena.uniforms.uTerrainReady.value === 1 &&
      window.__riftTest.renderer.finishAtlasReady,
  );
  await page.evaluate(() => {
    window.__visualManualFrames = true;
  });
  let ids = await page.evaluate(() => window.__riftTest.biomeList.map((b) => b.id));
  if (requestedBiome) {
    assert.ok(ids.includes(requestedBiome), `Unknown biome: ${requestedBiome}`);
    ids = [requestedBiome];
  }
  const metrics = [];
  for (const id of ids) {
    for (const scene of scenes) {
      const boss = scene === "boss";
      const row = await page.evaluate(
        ({ id, boss, scene, frameRate, position }) => {
          const T = window.__riftTest;
          for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true;
          T.store.data.settings.frameRate = frameRate;
          T.game.settingsChanged(true);
          const random = Math.random;
          Math.random = () => 0.42;
          try {
            T.game.startRun({});
          } finally {
            Math.random = random;
          }
          const g = T.game,
            w = g.world,
            r = T.renderer;
          g.paused = true;
          w.route = T.biomeList.map((b) => b.id);
          const n = w.route.indexOf(id) * 5 + (boss ? 5 : 2);
          w.endless = n > 20;
          w.startWave(n);
          g.intro = null;
          w.god = true;
          w.player.iT = 0;
          r.focusOn(null);
          if (boss && w.bossPending) {
            w.spawnBoss(w.bossPending);
            w.bossPending = null;
          }
          if (boss && w.boss) {
            w.boss.x = 0;
            w.boss.y = -1.5;
            w.boss.spawnT = 0;
          }
          if (!boss)
            ["grunt", "brute", "gunner", "bulwark", "striker", "splitter", "sniper", "bomber"].forEach((t, i) => {
              const a = (i / 8) * Math.PI * 2;
              const e = w.spawnEnemy(t, Math.cos(a) * 5, 2 + Math.sin(a) * 4, {});
              if (e) e.spawnT = 0;
            });
          if (scene === "warnings") {
            ["stomp", "mortar", "glacier", "plague", "rift", "fire"].forEach((kind, i) => {
              const h = w.hazard({
                x: ((i % 3) - 1) * 4,
                y: Math.floor(i / 3) * 4 - 2,
                r: 1.6,
                kind,
                delay: 2,
                dmg: 10,
              });
              h.t = 0.7 + i * 0.17;
            });
            const beam = w.beam({ x: -6, y: 5, a: 0, len: 12, w: 0.8, warn: 2 });
            beam.t = 1;
            w.updateBeams(0);
            ["orb", "fast", "shard", "spore", "riftorb", "glass"].forEach((kind, i) =>
              w.shoot(-5 + i * 2, 1, 0, 4, 10, { kind }),
            );
          }
          if (scene === "telegraphs") {
            for (const e of w.enemies) {
              if (e.type === "sniper" || e.type === "brute") {
                e.st = 1;
                e.t2 = 0.2;
                e.ta = Math.atan2(w.player.y - e.y, w.player.x - e.x);
                e.face = e.ta;
              }
            }
          }
          if (position) {
            w.player.x = position[0] * (w.arena.W - 0.75);
            w.player.y = position[1] * (w.arena.H - 0.75);
            r.resetCamera();
          }
          w.time = 8;
          w.fx.length = 0;
          r.P.n = 0;
          r.rings.length = 0;
          r.lines.length = 0;
          r.flashes.length = 0;
          r.time = 8;
          // Settle transforms, weather and pools without submitting eleven discarded pixel frames.
          const draw = r.renderer.render;
          try {
            r.renderer.render = () => {};
            for (let i = 0; i < 11; i++) r.frame(1 / 12, w);
          } finally {
            r.renderer.render = draw;
          }
          r.frame(1 / 12, w);
          T.ui.hud(w);
          let bossMeshes = 0;
          if (boss)
            r.bossView?.group.traverse((o) => {
              if (o.isMesh) bossMeshes++;
            });
          return {
            id,
            boss,
            scene,
            frameRate,
            actual: w.arena.biome.id,
            bossType: w.boss?.type || null,
            shadows: r.renderer.shadowMap.enabled,
            atlasReady: r.arena.uniforms.uTerrainReady.value === 1 && r.finishAtlasReady,
            calls: r.renderer.info.render.calls,
            triangles: r.renderer.info.render.triangles,
            particles: r.P.n,
            bossMeshes,
          };
        },
        { id, boss, scene, frameRate, position: mapReview ? mapPositions[scene] : null },
      );
      assert.deepEqual(errors, [], `${id}/${scene}: browser or shader errors`);
      assert.equal(row.actual, id);
      assert.equal(row.atlasReady, true);
      assert.equal(row.shadows, true);
      if (boss) assert.ok(row.bossType, `${id}: missing boss`);
      if (mobile && boss) {
        const placement = await page.evaluate(() => {
          const bar = document.getElementById("bossBar").getBoundingClientRect();
          return { top: bar.top, bottom: bar.bottom, width: bar.width, w: innerWidth, h: innerHeight };
        });
        assert.ok(
          placement.top > placement.h * 0.8 && placement.bottom <= placement.h,
          "Boss bar must leave the upper fight clear",
        );
        assert.ok(placement.width < placement.w * 0.5, "Boss bar must fit between the touch sticks");
      }
      metrics.push(row);
      await page.screenshot({ path: `${out}/${id}${scene === "encounter" ? "" : "-" + scene}.png` });
      console.log(JSON.stringify(row));
    }
  }
  await page.evaluate(() => {
    const r = window.__riftTest.renderer,
      saved = r.P.n;
    try {
      r.P.n = Math.ceil(r.maxParticles * 0.3);
      const n = r.P.n,
        color = r.arena.uniforms.uGrid.value;
      r.emit(0, 1, 0, 0, 0, 0, 1, 0.1, color, { ambient: true });
      if (r.P.n !== n) throw new Error("Atmosphere used the combat reservation");
      r.emit(0, 1, 0, 0, 0, 0, 1, 0.1, color);
      if (r.P.n !== n + 1) throw new Error("Combat could not use its reserved space");
    } finally {
      r.P.n = saved;
    }
  });
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
  assert.deepEqual(errors, []);
  console.log(`Visual matrix: ${metrics.length} scenes, no browser/shader errors.`);
} finally {
  await browser.close();
}
