// Phase-3 capture: every redesigned menu surface in one pass (desktop + phone landscape).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const outDir = process.argv[2] || "verification-output/ui-redesign";
fs.mkdirSync(outDir, { recursive: true });
const { server, url } = await serve(path.resolve("dist"), 0);
const base = `http://localhost:${new URL(url).port}/index.html`;
const browser = await chromium.launch({ args: launchArgs() });
const errors = [];

async function shoot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function runViewport(label, viewport, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text()}`));
  await page.goto(base);
  await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
  await page.waitForTimeout(2000);

  await shoot(page, `${label}-home`);
  for (const [id, name] of [
    ["workshop", "workshop"],
    ["records", "records"],
    ["news", "news"],
    ["settings", "settings"],
  ]) {
    await page.click(`.bottom-nav button[data-go="${id}"]`);
    await shoot(page, `${label}-${name}`);
    await page.click("#settings section:not([hidden]) .topbar .icon-btn, [data-back]:visible");
  }

  // in-run surfaces: pause + the upgrade choice over the live pixel-rendered world
  await page.click("#playBtn");
  await page.waitForFunction(() => window.__riftTest?.game.world?.wave > 0, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const { game } = window.__riftTest;
    game.world.god = true;
    game.world.offer = game.world.makeOffer();
    game.ui.showPause(game.world);
    game.ui.showChoose(game.world);
  });
  await page.waitForTimeout(1200); // let the cards arm (650 ms lock) and the banner settle
  await shoot(page, `${label}-choose`);
  await page.evaluate(() => {
    window.__riftTest.ui.showPause(window.__riftTest.game.world);
  });
  await shoot(page, `${label}-pause`);
  await ctx.close();
}

await runViewport("desktop", { width: 1280, height: 800 }, false);
await runViewport("phone", { width: 844, height: 390 }, true);
await browser.close();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (errors.length) {
  console.log("ERRORS:", errors.slice(0, 8));
  process.exit(1);
}
console.log(`captured -> ${outDir}`);
