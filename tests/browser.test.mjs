// Full tablet touch flow and a focused landscape phone multitouch check.
// Pixels are optional (--draw); the real simulation, renderer/shader setup, DOM and input handlers run.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

for (const tablet of [true, false])
  test(
    `${tablet ? "tablet player" : "phone multitouch"} flow`,
    { timeout: process.env.TEST_DRAW === "1" ? 60000 : 25000 },
    async (t) => {
      const started = performance.now();
      const { page, press, errors, stopServer } = await openGame(t, tablet);
      const phase = (name) => t.diagnostic(`${name}: ${((performance.now() - started) / 1000).toFixed(1)} s`);
      const visible = (id) =>
        page.waitForFunction((id) => {
          const e = document.getElementById(id);
          return e && !e.hidden;
        }, id);
      if (tablet) {
        await press('[data-go="settings"]');
        await visible("settings");
        await press("#setNumbers");
        assert.equal(await page.evaluate(() => window.__riftTest.renderer.numbers), false);
        await press("#settings [data-back]");
        await visible("home");
        phase("boot and settings");
      }

      await press("#playBtn");
      await visible("hud");
      await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
      const start = await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.god = true;
        return { x: w.player.x, y: w.player.y, dashes: w.runStats.dashes };
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 260, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 220, y: 230, id: 1 }] });
      try {
        await page.waitForFunction((p) => {
          const w = window.__riftTest.game.world;
          return Math.hypot(w.player.x - p.x, w.player.y - p.y) > 1;
        }, start);
        if (!tablet) {
          // Both sticks and DASH must coexist without stealing the movement pointer.
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: 220, y: 230, id: 1 },
              { x: 680, y: 250, id: 2 },
            ],
          });
          const dash = await page.locator("#dashBtn").boundingBox();
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: 220, y: 230, id: 1 },
              { x: 680, y: 250, id: 2 },
              { x: dash.x + dash.width / 2, y: dash.y + dash.height / 2, id: 3 },
            ],
          });
          await page.waitForFunction((p) => window.__riftTest.game.world.runStats.dashes > p.dashes, start);
        }
      } finally {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      }
      if (tablet) await press("#dashBtn");
      await page.waitForFunction((p) => window.__riftTest.game.world.runStats.dashes > p.dashes, start);
      await press("#pauseBtn");
      await visible("pause");
      assert.equal(await page.evaluate(() => window.__riftTest.game.paused), true);
      await press("#resumeBtn");
      await page.waitForFunction(() => !window.__riftTest.game.paused);
      phase("move, dash, pause and resume");

      if (!tablet) {
        assert.equal(await page.evaluate(() => window.__gamepadReads), 0);
        assert.deepEqual(errors, []);
        return;
      }

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
      await visible("chooseFirstHint");
      await press("#cards:not(.locked) .card");
      await page.waitForFunction(
        () => window.__riftTest.game.world.wave === 2 && document.getElementById("choose").hidden,
      );
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run?.wave === 2);
      phase("wave clear and upgrade");

      // Wait until the installed worker controls this page before cutting the network.
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      await stopServer();
      await page.context().setOffline(true);
      const offlinePage = await page.reload();
      assert.ok(offlinePage?.fromServiceWorker(), "Offline navigation should come from the service worker");
      await visible("continueBtn");
      await press("#continueBtn");
      await page.waitForFunction(
        () => window.__riftTest.game.world?.wave === 2 && !document.getElementById("hud").hidden,
      );
      assert.equal(await page.evaluate(() => window.__riftTest.store.data.settings.numbers), false);
      phase("offline reload and saved-run continue");
      const hullBeforeFinalHit = await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.god = false;
        w.player.iT = 0;
        w.player.dashT = 0;
        w.player.shield = false;
        w.hurtPlayer(1, null, null, "devil", true);
        const hull = w.player.hp;
        w.hurtPlayer(99999, null, null, "devil", true);
        return hull;
      });
      await visible("over");
      await visible("overCause");
      assert.equal(await page.locator("#overCause").textContent(), "Final hit · Dust devil");
      assert.equal(await page.locator("#overRecap .hit.final .hd").textContent(), `−${hullBeforeFinalHit}`);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run), null);
      await press("#homeBtn");
      await visible("home");
      assert.equal(await page.evaluate(() => !!window.__riftTest.game.crashed), false);
      assert.equal(await page.evaluate(() => window.__gamepadReads), 0);
      assert.deepEqual(errors, []);
      phase("death, summary and return home");
    },
  );
