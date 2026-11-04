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
const quality = process.argv[6] || "high";
assert.ok(["high", "auto", "battery"].includes(quality), `Unknown quality: ${quality}`);
const out = `verification-output/${tag}-${mobile ? "land" : "tablet"}-${quality}`;
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
  await page.goto(url);
  await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
  let ids = await page.evaluate(() => window.__riftTest.biomeList.map((b) => b.id));
  if (requestedBiome) {
    assert.ok(ids.includes(requestedBiome), `Unknown biome: ${requestedBiome}`);
    ids = [requestedBiome];
  }
  const metrics = [];
  for (const id of ids) {
    for (const boss of [false, true]) {
      const row = await page.evaluate(
        ({ id, boss, quality }) => {
          const T = window.__riftTest;
          for (const k of Object.keys(T.store.data.seen)) T.store.data.seen[k] = true;
          T.store.data.settings.quality = quality;
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
          w.startWave(n);
          g.intro = null;
          w.god = true;
          r.focusOn(null);
          if (boss && w.bossPending) {
            w.spawnBoss(w.bossPending);
            w.bossPending = null;
          }
          if (boss && w.boss) {
            w.boss.x = 0;
            w.boss.y = -4;
            w.boss.spawnT = 0;
          }
          if (!boss)
            ["grunt", "brute", "gunner", "bulwark", "striker", "splitter", "sniper", "bomber"].forEach((t, i) => {
              const a = (i / 8) * Math.PI * 2;
              const e = w.spawnEnemy(t, Math.cos(a) * 5, 2 + Math.sin(a) * 4, {});
              if (e) e.spawnT = 0;
            });
          w.time = 8;
          w.fx.length = 0;
          r.P.n = 0;
          r.rings.length = 0;
          r.lines.length = 0;
          r.flashes.length = 0;
          r.time = 8;
          for (let i = 0; i < 12; i++) r.frame(1 / 12, w);
          T.ui.hud(w);
          let bossMeshes = 0;
          if (boss)
            r.bossView?.group.traverse((o) => {
              if (o.isMesh) bossMeshes++;
            });
          return {
            id,
            boss,
            quality,
            actual: w.arena.biome.id,
            bossType: w.boss?.type || null,
            calls: r.renderer.info.render.calls,
            triangles: r.renderer.info.render.triangles,
            particles: r.P.n,
            bossMeshes,
          };
        },
        { id, boss, quality },
      );
      assert.equal(row.actual, id);
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
      await page.screenshot({ path: `${out}/${id}${boss ? "-boss" : ""}.png` });
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
