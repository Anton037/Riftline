// Phase-3 UI verification: pixel font loads, layout audit stays green on every menu state.
import { chromium } from "playwright";
import path from "node:path";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const { server, url } = await serve(path.resolve("dist"), 0);
const base = `http://localhost:${new URL(url).port}/index.html`;
const browser = await chromium.launch({ args: launchArgs() });
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

async function audit(label, page) {
  const r = await page.evaluate(() => window.__riftLayoutAudit?.() ?? { ok: false });
  check(r.ok === true && r.findings.length === 0, `${label}: layout audit ${JSON.stringify(r)}`);
}

for (const [label, viewport, touch] of [
  ["desktop", { width: 1280, height: 800 }, false],
  ["phone", { width: 844, height: 390 }, true],
]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text()}`));
  await page.goto(base);
  await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
  await page.waitForTimeout(1800);

  check(await page.evaluate(() => document.fonts.check('16px "Press Start 2P"')), `${label}: pixel font loaded`);
  check(
    (await page.evaluate(() => getComputedStyle(document.querySelector("#playBtn")).fontFamily)).includes(
      "Press Start 2P",
    ),
    `${label}: primary button uses pixel face`,
  );
  await audit(`${label} home`, page);

  for (const id of ["workshop", "records", "news", "settings"]) {
    await page.click(`.bottom-nav button[data-go="${id}"]`);
    await page.waitForTimeout(250);
    await audit(`${label} ${id}`, page);
    await page.locator("[data-back]:visible").first().click();
    await page.waitForTimeout(150);
  }

  // in-run: choose + pause audits
  await page.click("#playBtn");
  await page.waitForFunction(() => window.__riftTest?.game.world?.wave > 0, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const { game } = window.__riftTest;
    game.world.god = true;
    game.world.offer = game.world.makeOffer();
    game.ui.showChoose(game.world);
  });
  await page.waitForTimeout(900); // cards stay pointer-locked for 650 ms after render (armT)
  check((await page.locator("#cards .card").count()) > 0, `${label}: upgrade cards rendered`);
  check(
    (await page.evaluate(() => getComputedStyle(document.querySelector("#cards .card b")).fontFamily)).includes(
      "Press Start 2P",
    ),
    `${label}: card titles use pixel face`,
  );
  await audit(`${label} choose`, page);
  await page.evaluate(() => window.__riftTest.ui.showPause(window.__riftTest.game.world));
  await page.waitForTimeout(350);
  await audit(`${label} pause`, page);
  await ctx.close();
}
await browser.close();
server.closeAllConnections();
await new Promise((r) => server.close(r));
if (errors.length) {
  console.log("ERRORS:", errors.slice(0, 8));
  process.exit(1);
}
console.log(failed ? `${failed} checks failed` : "all UI checks passed");
process.exit(failed ? 1 : 0);
