import assert from "node:assert/strict";
import test from "node:test";
import { openGame } from "./support/game.mjs";

const timeout = process.env.TEST_DRAW === "1" ? 180000 : 30000;
const metric = /^\d+ FPS · \d+\.\d ms CPU$/;

test("portrait leaves the HUD editor and Game Over usable on a phone", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, "phone", { viewport: { width: 390, height: 844 } });
  await press('[data-go="settings"]');
  await press("#hudEditBtn");
  await page.locator("#hudEdit").waitFor();
  assert.equal(await page.locator("#rotate").isVisible(), false);
  await page.locator("#heFixed").tap();
  assert.equal(await page.locator("#heSize").isVisible(), false);
  await press("#heReset");
  assert.equal(await page.locator("#heFixed").isChecked(), false);
  await press("#heSave");
  await press("#settings [data-back]");
  await page.setViewportSize({ width: 844, height: 390 });
  await press("#playBtn");
  await page.evaluate(() => window.__riftTest.game.endRun(false));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.body.dataset.orientation === "portrait");
  assert.equal(await page.locator("#rotate").isVisible(), false);
  await press("#homeBtn");
  await page.locator("#home").waitFor();
  assert.deepEqual(errors, []);
});

test(
  "a phone can restore defaults, turn the performance readout back on, and see it clear of boss HUD",
  { timeout },
  async (t) => {
    const { page, press, errors } = await openGame(t, "phone", { viewport: { width: 568, height: 320 } });
    const toggle = page.locator("#setPerformance"),
      status = page.locator("#performanceSettingStatus"),
      overlay = page.locator("#performanceOverlay");
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).settings.performanceOverlay);
    await press('[data-go="settings"]');
    await press("#setPerformance");
    assert.equal(await toggle.isChecked(), true);
    await press("#defaultsBtn");
    await press("#dlgBtns .primary");
    await page.getByText("Settings restored", { exact: true }).waitFor();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await saved(), false);
    assert.match(await status.textContent(), /^Off\./);
    assert.equal(await overlay.isVisible(), false);

    await press("label:has(#setPerformance) b");
    assert.equal(await toggle.isChecked(), true);
    assert.equal(await saved(), true);
    assert.match(await status.textContent(), /^On\..*during play/);
    assert.equal(await overlay.isVisible(), false);
    await press("#settings [data-back]");
    await press("#playBtn");
    await overlay.filter({ hasText: metric }).waitFor();

    const count = await page.evaluate(() => {
      const { game, ui } = window.__riftTest;
      const w = game.world;
      const original = {
        plan: w.plan,
        planIdx: w.planIdx,
        planTotal: w.planTotal,
        markers: w.markers,
        enemies: w.enemies,
      };
      Object.assign(w, {
        plan: [{ members: Array(5), placed: 2 }, { members: Array(1) }],
        planIdx: 0,
        planTotal: 6,
        markers: Array(2),
        enemies: [],
      });
      ui.hud(w);
      Object.assign(w, original);
      return document.getElementById("hudFoes").textContent;
    });
    assert.equal(count, "6 left");

    // Even when the renderer skips a frame, a live measurement should stay on screen.
    await page.evaluate(() => {
      const { game, ui, renderer } = window.__riftTest;
      const w = game.world;
      const draw = renderer.frame;
      let call = 0;
      renderer.frame = function (...args) {
        if (++call % 3 !== 0) return draw.apply(this, args);
      };
      w.hold = true;
      w.god = true;
      w.spawnBoss("bellKeeper");
      w.fx.length = 0;
      w.combo = 27;
      w.event = "festival";
      w.stats.heatSink = 2;
      Object.assign(w.player, { heatT: 4.5, gildT: 3.2, hopT: 2.8, tractionT: 3.8 });
      ui.hud(w);
      ui.clearTitleCard();
      ui.banner("Phase 2", "The arena shifts", "warn", 10000);
      ui.toast("A combat hint during the phase change", "hint", 10000);
      ui.comboPop(27, 5);
    });
    await page.locator("#bossBar").waitFor();
    const afterSkip = await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        await new Promise(requestAnimationFrame);
        if (document.getElementById("performanceOverlay").hidden) return "hidden";
      }
      return document.getElementById("performanceOverlay").textContent;
    });
    assert.match(afterSkip, metric);
    const hudAudit = await page.evaluate(() => window.__riftLayoutAudit());
    assert.equal(hudAudit.ok, true, JSON.stringify(hudAudit.findings));
    assert.equal(await page.locator("#hudNotices .toast").isVisible(), false);
    assert.equal(await page.locator(".combo-pop").isVisible(), false);
    assert.equal(await page.locator("#banner .bn").isVisible(), true);

    await page.setViewportSize({ width: 480, height: 270 });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--vw") === "480px");
    const shortAudit = await page.evaluate(() => window.__riftLayoutAudit());
    assert.equal(shortAudit.ok, true, JSON.stringify(shortAudit.findings));

    await press("#pauseBtn");
    assert.equal(await overlay.isVisible(), false);
    await press("#pauseSetBtn");
    assert.match(await status.textContent(), /^On\..*resume/);
    await press("#setPerformance");
    assert.equal(await saved(), false);
    await press("#setPerformance");
    assert.equal(await saved(), true);
    await press("#settings [data-back]");
    await press("#resumeBtn");
    await page.locator("#resumeCount").waitFor();
    assert.equal(await overlay.isVisible(), false);
    assert.equal(await page.locator("#bossBar").isVisible(), false);
    await overlay.filter({ hasText: metric }).waitFor();

    // A layout from before the readout was enabled can reserve a button in the same spot.
    await page.setViewportSize({ width: 568, height: 320 });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--vw") === "568px");
    const fitBeforeReadout = await page.evaluate(() => {
      const { game } = window.__riftTest;
      const { settings } = game.store.data;
      const buttons = { dash: "dashBtn", fireBurst: "fireBurstBtn", gravityBell: "gravityBellBtn", pause: "pauseBtn" };
      const layout = Object.fromEntries(
        Object.entries(buttons).map(([name, id]) => {
          const rect = document.getElementById(id).getBoundingClientRect();
          return [
            name,
            { x: (rect.left + rect.width / 2) / innerWidth, y: (rect.top + rect.height / 2) / innerHeight, s: 1 },
          ];
        }),
      );
      const meter = document.getElementById("performanceOverlay").getBoundingClientRect();
      layout.gravityBell = { x: (meter.left + 15) / innerWidth, y: (meter.bottom - 3) / innerHeight, s: 1 };
      settings.performanceOverlay = false;
      settings.hudLayout = { portrait: null, landscape: layout };
      game.settingsChanged(true);
      const fits = document.getElementById("hud").classList.contains("custom");
      settings.performanceOverlay = true;
      game.settingsChanged(true);
      return fits;
    });
    assert.equal(fitBeforeReadout, true);
    await page.waitForFunction(
      () =>
        !document.getElementById("performanceOverlay").hidden &&
        !document.getElementById("hud").classList.contains("custom"),
    );
    assert.ok(await page.evaluate(() => window.__riftTest.store.data.settings.hudLayout.landscape));
    await page.evaluate(() => {
      const { game } = window.__riftTest;
      game.world.beginChoice();
    });
    await page.locator("#choose").waitFor();
    assert.equal(await overlay.isVisible(), false);
    assert.equal(await page.locator("#bossBar").isVisible(), false);
    await page.evaluate(() => window.__riftTest.ui.toast("No new crafts this time. Reroll kept."));
    assert.equal(await page.locator("#chooseNotices .toast").isVisible(), true);
    assert.equal(await page.locator("#toasts .toast").count(), 0);
    assert.deepEqual(errors, []);
  },
);

test("desktop combat readouts and messages clear each other even in a short window", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, "desktop", { viewport: { width: 667, height: 320 } });
  await press('[data-go="settings"]');
  await page.locator("#setPerformance").check();
  await press("#settings [data-back]");
  await press("#playBtn");
  await page.locator("#performanceOverlay").filter({ hasText: metric }).waitFor();
  await page.evaluate(() => {
    const { game, ui } = window.__riftTest;
    const w = game.world;
    w.hold = true;
    w.god = true;
    w.spawnBoss("bellKeeper");
    w.fx.length = 0;
    w.stats.heatSink = 2;
    w.event = "festival";
    Object.assign(w.player, { heatT: 4.5, gildT: 3.2, hopT: 2.8, tractionT: 3.8 });
    ui.hud(w);
    ui.clearTitleCard();
    ui.banner("Champion", "A Shield Guard rallies the pack. Nearby enemies move faster.", "warn", 10000);
    ui.toast("Nearby enemies move faster", "hint", 10000);
  });
  await page.locator("#bossBar").waitFor();
  const audit = await page.evaluate(() => window.__riftLayoutAudit());
  assert.equal(audit.ok, true, JSON.stringify(audit.findings));
  assert.equal(await page.locator("#banner .bn").isVisible(), true);
  assert.equal(await page.locator("#hudNotices .toast").isVisible(), false);
  assert.deepEqual(errors, []);
});
