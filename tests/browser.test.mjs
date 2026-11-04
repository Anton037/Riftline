// Two real-player end-to-end flows: inputs, upgrade, saved-run reload, death and payout.
// Pixels are optional (--draw); the real simulation, renderer/shader setup, DOM and input handlers run.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

for (const touch of [false, true])
  test(
    `${touch ? "touch" : "desktop"} complete player flow`,
    { timeout: process.env.TEST_DRAW === "1" ? 60000 : 25000 },
    async (t) => {
      const started = performance.now();
      const { page, press, errors } = await openGame(t, touch);
      const phase = (name) => t.diagnostic(`${name}: ${((performance.now() - started) / 1000).toFixed(1)} s`);
      const visible = (id) =>
        page.waitForFunction((id) => {
          const e = document.getElementById(id);
          return e && !e.hidden;
        }, id);
      await press('[data-go="settings"]');
      await visible("settings");
      await press("#setNumbers");
      assert.equal(await page.evaluate(() => window.__riftTest.renderer.numbers), false);
      await press("#settings [data-back]");
      await visible("home");
      phase("boot and settings");

      await press("#playBtn");
      await visible("hud");
      await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
      const start = await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.god = true;
        return { x: w.player.x, y: w.player.y, dashes: w.runStats.dashes };
      });
      if (touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 260, id: 1 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 220, y: 230, id: 1 }] });
        try {
          await page.waitForFunction((p) => {
            const w = window.__riftTest.game.world;
            return Math.hypot(w.player.x - p.x, w.player.y - p.y) > 1;
          }, start);
        } finally {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        await press("#dashBtn");
      } else {
        await page.keyboard.down("d");
        try {
          await page.waitForFunction((p) => window.__riftTest.game.world.player.x > p.x + 1, start);
        } finally {
          await page.keyboard.up("d");
        }
        await page.keyboard.press("Space");
      }
      await page.waitForFunction((p) => window.__riftTest.game.world.runStats.dashes > p.dashes, start);
      if (touch) await press("#pauseBtn");
      else await page.keyboard.press("Escape");
      await visible("pause");
      assert.equal(await page.evaluate(() => window.__riftTest.game.paused), true);
      await press("#resumeBtn");
      await page.waitForFunction(() => !window.__riftTest.game.paused);
      phase("move, dash, pause and resume");

      // Prepare the end of a wave; its transition and upgrade selection use the live game loop/UI.
      await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.planIdx = w.plan.length;
        w.markers.length = 0;
        w.bossPending = null;
        w.championPending = null;
        for (const e of [...w.enemies]) w.killEnemy(e);
      });
      await visible("choose");
      await press("#cards:not(.locked) .card");
      await page.waitForFunction(
        () => window.__riftTest.game.world.wave === 2 && document.getElementById("choose").hidden,
      );
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run?.wave === 2);
      phase("wave clear and upgrade");

      await page.reload();
      await visible("continueBtn");
      await press("#continueBtn");
      await page.waitForFunction(
        () => window.__riftTest.game.world?.wave === 2 && !document.getElementById("hud").hidden,
      );
      assert.equal(await page.evaluate(() => window.__riftTest.store.data.settings.numbers), false);
      phase("saved-run reload and continue");
      await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.god = false;
        w.player.iT = 0;
        w.player.dashT = 0;
        w.player.shield = false;
        w.hurtPlayer(99999, null, null, "grunt", true);
      });
      await visible("over");
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run), null);
      await press("#homeBtn");
      await visible("home");
      assert.equal(await page.evaluate(() => !!window.__riftTest.game.crashed), false);
      assert.deepEqual(errors, []);
      phase("death, summary and return home");
    },
  );
