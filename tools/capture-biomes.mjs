// Phase 4A capture: the six new biome floors, paused runs on fixed settings.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const outDir = process.argv[2] || "verification-output/art-redesign/floors";
fs.mkdirSync(outDir, { recursive: true });
const { server, url } = await serve(path.resolve("dist"), 0);
const base = `http://localhost:${new URL(url).port}/index.html`;
const browser = await chromium.launch({ args: launchArgs() });
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(base);
await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
await page.waitForTimeout(1500);

const ids = await page.evaluate(() => window.__riftTest.biomeList.map((b) => b.id));
for (const id of ids) {
  const active = await page.evaluate((biomeId) => {
    const T = window.__riftTest;
    const random = Math.random;
    Math.random = () => 0.42;
    try {
      T.game.startRun({});
    } finally {
      Math.random = random;
    }
    const g = T.game,
      w = T.game.world,
      r = T.renderer;
    g.paused = true;
    w.route = T.biomeList.map((b) => b.id);
    w.startWave(w.route.indexOf(biomeId) * 5 + 2);
    g.intro = null;
    w.god = true;
    w.player.iT = 0;
    r.focusOn(null);
    ["grunt", "brute", "gunner", "bulwark", "striker", "splitter", "sniper", "bomber"].forEach((t, i) => {
      const a = (i / 8) * Math.PI * 2;
      const e = w.spawnEnemy(t, Math.cos(a) * 5, 2 + Math.sin(a) * 4, {});
      if (e) e.spawnT = 0;
    });
    r.menuA = 0;
    // advance the renderer manually: the paused loop never rebuilds the arena on its own
    const draw = r.renderer.render;
    try {
      r.renderer.render = () => {};
      for (let i = 0; i < 11; i++) r.frame(1 / 12, w);
    } finally {
      r.renderer.render = draw;
    }
    for (let i = 0; i < 8; i++) r.frame(1 / 12, w);
    T.ui.hud(w);
    return w.arena.biome.id;
  }, id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, `floor-${id}.png`) });
  console.log(`captured ${id} (active biome: ${active})`);
}
await browser.close();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (errors.length) {
  console.log("ERRORS:", errors.slice(0, 6));
  process.exit(1);
}
