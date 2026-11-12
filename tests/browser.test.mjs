// Full tablet touch flow and a focused landscape phone multitouch check.
// Pixels are optional (--draw); the real simulation, renderer/shader setup, DOM and input handlers run.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

for (const tablet of [true, false])
  test(
    `${tablet ? "tablet player" : "phone multitouch"} flow`,
    { timeout: process.env.TEST_DRAW === "1" ? 180000 : tablet ? 30000 : 25000 },
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
        const health = await page.evaluate(() => window.__riftTest.health({ context: "browser-test" }));
        assert.deepEqual(
          health.filter((check) => check.status === "FAIL"),
          [],
          "Startup health checks must pass",
        );
        await press('[data-go="settings"]');
        await visible("settings");
        await page.evaluate(() => {
          const renderer = window.__riftTest.renderer.renderer,
            original = renderer.setSize;
          window.__settingsResize = { count: 0, restore: () => (renderer.setSize = original) };
          renderer.setSize = function (...args) {
            window.__settingsResize.count++;
            return original.apply(this, args);
          };
        });
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              window.dispatchEvent(new Event("resize"));
              window.dispatchEvent(new Event("resize"));
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }),
        );
        await press('#setFrameRate [data-v="120"]');
        assert.equal(await page.evaluate(() => window.__riftTest.store.data.settings.frameRate), 120);
        assert.equal(await page.evaluate(() => window.__riftTest.renderer.renderer.shadowMap.enabled), true);
        await press('#setFrameRate [data-v="30"]');
        await press("#setNumbers");
        assert.equal(await page.evaluate(() => window.__riftTest.renderer.numbers), false);
        assert.equal(
          await page.evaluate(() => {
            const watched = window.__settingsResize;
            watched.restore();
            return watched.count;
          }),
          0,
          "Settings and repeated viewport notifications must retain the canvas drawing buffer",
        );
        await page.setViewportSize({ width: 1000, height: 740 });
        await page.waitForFunction(() => {
          const r = window.__riftTest.renderer;
          return r.w === 1000 && r.h === 740 && r.canvas.width === Math.floor(1000 * r.dpr);
        });
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.waitForFunction(() => {
          const r = window.__riftTest.renderer;
          return r.w === 1024 && r.h === 768 && r.canvas.height === Math.floor(768 * r.dpr);
        });
        // A phone may background while the player fetches a backup from another app.
        await press("#restoreBtn");
        await page.locator("#saveImport").fill('{"game":"riftline","v":1,"shards":123}');
        const updateState = await page.evaluate(() => {
          let applied = 0;
          const g = window.__riftTest.game;
          g.pendingUpdate = () => applied++;
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          try {
            document.dispatchEvent(new Event("visibilitychange"));
          } finally {
            delete document.visibilityState;
            document.dispatchEvent(new Event("visibilitychange"));
          }
          const result = { applied, pending: !!g.pendingUpdate, text: document.getElementById("saveImport").value };
          g.pendingUpdate = null;
          return result;
        });
        assert.equal(updateState.applied, 0);
        assert.equal(updateState.pending, true);
        assert.equal(updateState.text, '{"game":"riftline","v":1,"shards":123}');
        await press("#dlgBtns button");
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
      const ignored = await page.evaluate(() => {
        const input = window.__riftTest.game.input;
        for (const id of ["dashBtn", "novaBtn", "gadgetBtn"])
          for (const pointerType of ["mouse", "pen"])
            document.getElementById(id).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
        return { ...input.pending };
      });
      assert.deepEqual(ignored, { dash: false, nova: false, gadget: false });
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
      await page.waitForFunction(() => !!window.__riftTest.game.sound.physical?.bank);
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
