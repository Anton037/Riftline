// Phase 4 capture: each boss kit + the player hero, paused runs on fixed settings.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const outDir = process.argv[2] || "verification-output/art-redesign/bosses";
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

const bossIds = await page.evaluate(() => {
  const T = window.__riftTest;
  for (const src of [T.bossDefs, T.game?.bossDefs, T.game?.world?.bossDefs, T.data?.bossDefs]) {
    if (src) return Object.keys(src);
  }
  return ["warden", "queen", "prism", "core"];
});
for (const id of bossIds) {
  const ok = await page.evaluate((bossId) => {
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
    g.intro = null;
    w.god = true;
    w.player.iT = 0;
    r.focusOn(null);
    const p = w.player;
    w.spawnBoss(bossId);
    const e = w.boss;
    if (!e) return false;
    e.spawnT = 0;
    p.x = e.x;
    p.y = e.y + 5.5;
    p.vx = 0;
    p.vy = 0;
    r.menuA = 0;
    const draw = r.renderer.render;
    try {
      r.renderer.render = () => {};
      for (let i = 0; i < 11; i++) r.frame(1 / 12, w);
    } finally {
      r.renderer.render = draw;
    }
    for (let i = 0; i < 8; i++) r.frame(1 / 12, w);
    r.frame(1 / 12, w);
    T.ui.hud(w);
    return w.arena.biome.id;
  }, id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, `boss-${id}.png`) });
  console.log(`captured ${id} (spawned: ${ok})`);
}
await browser.close();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (errors.length) {
  console.log("ERRORS:", errors.slice(0, 6));
  process.exit(1);
}
