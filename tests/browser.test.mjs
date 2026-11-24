// Desktop (keyboard + mouse), tablet touch, and landscape phone multitouch E2E flows.
// Pixels are optional (--draw); the real simulation, renderer/shader setup, DOM and input handlers run.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { bossPatterns, OVERDRIVE } = await import("../src/core/ai.js");

const visible = (page, id) =>
  page.waitForFunction((id) => {
    const e = document.getElementById(id);
    return e && !e.hidden;
  }, id);

const hidden = (page, id) =>
  page.waitForFunction((id) => {
    const e = document.getElementById(id);
    return !e || e.hidden;
  }, id);

test("off-screen enemy and heal markers point toward their targets", { timeout: 60000 }, async (t) => {
  const { page, errors } = await openGame(t, "desktop");
  const rows = await page.evaluate(() => {
    const { renderer, overlay } = window.__riftTest;
    const cases = [
      { label: "enemy left", x: -18, z: 0, axis: "x", sign: -1 },
      { label: "enemy right", x: 18, z: 0, axis: "x", sign: 1 },
      { label: "enemy above", x: 0, z: -28, axis: "y", sign: -1 },
      { label: "enemy below", x: 0, z: 9, axis: "y", sign: 1 },
      { label: "enemy behind camera", x: 4, z: 35, axis: "y", sign: 1 },
      { label: "enemy in view", x: 0, z: 0 },
      { label: "heal right", x: 18, z: 0, axis: "x", sign: 1, heal: true },
    ];
    const safe = { t: 14, b: 16, l: 12, r: 20 };
    return [
      [1280, 720],
      [720, 320],
      [390, 730],
    ].flatMap(([w, h]) => {
      const camera = new renderer.camera.constructor(44, w / h, 0.5, 190);
      camera.position.set(0, 14, 10);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const view = { w, h, camera, _v: {}, nums: [], project: renderer.project };
      const canvas = document.createElement("canvas");
      const probe = new overlay.constructor(canvas);
      Object.assign(probe, { w, h, dpr: 1 });
      const draw = probe.g;
      let marker;
      draw.rotate = (angle) => {
        const { e: x, f: y } = draw.getTransform();
        marker = { x, y, dx: Math.cos(angle), dy: Math.sin(angle) };
      };
      return cases.map(({ label, x, z, axis, sign, heal }) => {
        marker = null;
        probe.draw(
          view,
          {
            player: { x: 0, y: 0, alive: true, hp: heal ? 20 : 100 },
            stats: { maxHp: 100 },
            enemies: heal ? [] : [{ type: "ironGolem", x, y: z, hp: 100, maxHp: 100 }],
            pickups: heal ? [{ kind: "heal", x, y: z }] : [],
          },
          null,
          { safe },
        );
        return { label: `${label} at ${w}×${h}`, marker, axis, sign, w, h };
      });
    });
  });
  for (const { label, marker, axis, sign, w, h } of rows) {
    if (!axis) {
      assert.equal(marker, null, label);
      continue;
    }
    assert.ok(marker, label);
    assert.ok(marker[`d${axis}`] * sign > 0.8, `${label} pointed the wrong way`);
    assert.ok((marker[axis] - (axis === "x" ? w : h) / 2) * sign > 0, `${label} appeared on the wrong edge`);
  }
  assert.deepEqual(errors, []);
});

for (const tablet of [true, false])
  test(
    `${tablet ? "tablet player" : "phone multitouch"} flow`,
    { timeout: process.env.TEST_DRAW === "1" ? 180000 : tablet ? 30000 : 25000 },
    async (t) => {
      const started = performance.now();
      const { page, press, errors, stopServer } = await openGame(t, tablet);
      const phase = (name) => t.diagnostic(`${name}: ${((performance.now() - started) / 1000).toFixed(1)} s`);
      if (tablet) {
        const health = await page.evaluate(() => window.__riftTest.health({ context: "browser-test" }));
        assert.deepEqual(
          health.filter((check) => check.status === "FAIL"),
          [],
          "Startup health checks must pass",
        );
        await press('[data-go="settings"]');
        await visible(page, "settings");
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
        await visible(page, "home");
        phase("boot and settings");
      }

      await press("#playBtn");
      await visible(page, "hud");
      await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
      const start = await page.evaluate(() => {
        const w = window.__riftTest.game.world;
        w.god = true;
        return { x: w.player.x, y: w.player.y, dashes: w.runStats.dashes };
      });
      const cdp = await page.context().newCDPSession(page);
      await page.keyboard.press("Space");
      await page.keyboard.press("KeyD");
      await page.keyboard.press("KeyP");
      await page.mouse.click(280, 190, { button: "right" });
      await page.mouse.click(340, 200);
      const ignored = await page.evaluate(() => {
        const { game } = window.__riftTest;
        return {
          keys: game.input.keys.size,
          mouse: game.input.mouse.down || Number.isFinite(game.input.mouse.x),
          paused: game.paused,
          dashes: game.world.runStats.dashes,
          touch: document.documentElement.classList.contains("device-touch"),
        };
      });
      assert.deepEqual(ignored, { keys: 0, mouse: false, paused: false, dashes: start.dashes, touch: true });
      assert.equal(await page.locator("#dashBtn .key").isVisible(), false);
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
      await visible(page, "pause");
      assert.equal(await page.evaluate(() => window.__riftTest.game.paused), true);
      await press("#resumeBtn");
      await page.waitForFunction(() => !window.__riftTest.game.paused);
      const landscape = page.viewportSize();
      await page.setViewportSize({ width: landscape.height, height: landscape.width });
      await page.locator("#rotate").waitFor({ state: "visible" });
      await page.waitForFunction(() => window.__riftTest.game.paused);
      const pausedAt = await page.evaluate(() => {
        const { game } = window.__riftTest;
        game.resume();
        return { time: game.world.time, resumeAt: game.resumeAt };
      });
      assert.equal(pausedAt.resumeAt, 0, "Portrait cannot resume gameplay");
      await page.setViewportSize(landscape);
      await page.locator("#rotate").waitFor({ state: "hidden" });
      await visible(page, "pause");
      assert.equal(await page.evaluate(() => window.__riftTest.game.world.time), pausedAt.time);
      await press("#resumeBtn");
      await page.waitForFunction(() => !window.__riftTest.game.paused);
      phase("move, dash, pause and resume");

      if (!tablet) {
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
      await visible(page, "choose");
      await visible(page, "chooseFirstHint");
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
      await visible(page, "continueBtn");
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
      await visible(page, "over");
      await visible(page, "overCause");
      assert.equal(await page.locator("#overCause").textContent(), "Final hit · Dust devil");
      assert.equal(await page.locator("#overRecap .hit.final .hd").textContent(), `−${hullBeforeFinalHit}`);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run), null);
      await press("#homeBtn");
      await visible(page, "home");
      assert.equal(await page.evaluate(() => !!window.__riftTest.game.crashed), false);
      assert.deepEqual(errors, []);
      phase("death, summary and return home");
    },
  );

test(
  "desktop player flow (keyboard + mouse)",
  { timeout: process.env.TEST_DRAW === "1" ? 180000 : 35000 },
  async (t) => {
    const { page, press, errors } = await openGame(t, "desktop");
    const health = await page.evaluate(() => window.__riftTest.health({ context: "browser-desktop" }));
    assert.deepEqual(
      health.filter((check) => check.status === "FAIL"),
      [],
      "Startup health checks must pass on desktop",
    );
    const homeState = await page.evaluate(async () => {
      const specs = ['400 16px "Baskervville"', '700 16px "Instrument Sans"'];
      const loaded = await Promise.all(specs.map((spec) => document.fonts.load(spec)));
      const { store, ui } = window.__riftTest;
      store.data.threatMax = 1;
      ui.stepThreat(1);
      const trial1Desc = document.getElementById("tDesc").textContent;
      ui.stepThreat(-1);
      return {
        desktop: document.body.classList.contains("device-desktop"),
        touchInput: document.documentElement.classList.contains("device-touch"),
        fontsLoaded: loaded.every((faces) => faces.length > 0),
        logoFont: getComputedStyle(document.querySelector("#home .logo")).fontFamily,
        ctaFont: getComputedStyle(document.querySelector("#playBtn")).fontFamily,
        trial1Desc,
        audit: window.__riftLayoutAudit(),
      };
    });
    assert.equal(homeState.desktop, true);
    assert.equal(homeState.touchInput, false);
    assert.equal(homeState.fontsLoaded, true, "Bundled Baskervville & Instrument Sans fonts must load");
    assert.match(homeState.logoFont, /Baskervville/);
    assert.match(homeState.ctaFont, /Instrument Sans/);
    assert.doesNotMatch(homeState.trial1Desc, /Shards ×/, "Trial I description must not duplicate shards multiplier");
    assert.equal(homeState.audit.ok, true, JSON.stringify(homeState.audit.findings));

    await press('[data-go="settings"]');
    await visible(page, "settings");
    const settingsCheck = await page.evaluate(() => {
      const sfxSlider = document.getElementById("setSfx");
      sfxSlider.value = "0.55";
      sfxSlider.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        hasVibration: !!document.getElementById("setVibration") || !!document.getElementById("setVibTest"),
        sfxOut: document.getElementById("setSfxV")?.textContent,
        musicOut: document.getElementById("setMusicV")?.textContent,
        ambOut: document.getElementById("setAmbV")?.textContent,
        updateBtnHidden: document.getElementById("updateReadyBtn")?.hidden,
        audit: window.__riftLayoutAudit(),
      };
    });
    assert.equal(settingsCheck.hasVibration, false, "Vibration setting and test button must be completely removed");
    assert.equal(settingsCheck.sfxOut, "55%", "SFX slider must display live percentage readout");
    assert.match(settingsCheck.musicOut || "", /^\d+%$/, "Music slider must display percentage readout");
    assert.match(settingsCheck.ambOut || "", /^\d+%$/, "Ambience slider must display percentage readout");
    assert.equal(settingsCheck.updateBtnHidden, true, "Update ready button must be hidden until a new SW waits");
    assert.equal(settingsCheck.audit.ok, true, JSON.stringify(settingsCheck.audit.findings));

    await page.locator("#hudEditRow").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#settingsControlsCard").count(), 0);
    const performanceSetting = page.getByRole("checkbox", { name: /Performance overlay/ });
    assert.equal(await performanceSetting.isChecked(), false);
    assert.equal(await page.locator("#performanceOverlay").isVisible(), false);
    await performanceSetting.check();
    assert.equal(await page.locator("#performanceOverlay").isVisible(), false);
    await page.keyboard.press("Escape");
    await visible(page, "home");

    await press("#playBtn");
    await visible(page, "hud");
    await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
    const readout = page.locator("#performanceOverlay");
    await readout.filter({ hasText: /^\d+ FPS · \d+\.\d ms CPU$/ }).waitFor({ state: "visible" });
    const measuredFps = Number.parseInt(await readout.textContent(), 10);
    assert.ok(measuredFps > 0 && measuredFps <= 32, `30 FPS cap measured ${measuredFps} FPS`);
    assert.equal(await page.locator("#pauseBtn .key").count(), 0);

    const hudDesktop = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName,
      dashKey: getComputedStyle(document.querySelector("#dashBtn .key")).display !== "none",
      novaKey: getComputedStyle(document.querySelector("#fireBurstBtn .key")).display !== "none",
      gravityBellKey: getComputedStyle(document.getElementById("gravityBellKey")).display !== "none",
      cursor: getComputedStyle(document.getElementById("touch")).cursor,
      touchInput: document.documentElement.classList.contains("device-touch"),
      audit: window.__riftLayoutAudit(),
    }));
    assert.equal(hudDesktop.activeTag, "BODY");
    assert.equal(hudDesktop.dashKey, true);
    assert.equal(hudDesktop.novaKey, true);
    assert.equal(hudDesktop.gravityBellKey, true);
    assert.equal(hudDesktop.cursor, "none");
    assert.equal(hudDesktop.touchInput, false);
    assert.equal(hudDesktop.audit.ok, true, JSON.stringify(hudDesktop.audit.findings));

    // Modifier combos must pass through to browser shortcuts cleanly.
    await page.keyboard.press("Control+KeyP");
    await page.keyboard.press("Control+Space");
    const modCheck = await page.evaluate(() => ({
      paused: window.__riftTest.game.paused,
      dash: window.__riftTest.game.input.pending.dash,
    }));
    assert.deepEqual(modCheck, { paused: false, dash: 0 });

    const start = await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.god = true;
      return { x: w.player.x, y: w.player.y, dashes: w.runStats.dashes };
    });

    // WASD + Arrow keys movement
    await page.keyboard.down("KeyD");
    await page.waitForFunction((p) => window.__riftTest.game.world.player.x > p.x + 1.2, start);
    await page.keyboard.up("KeyD");
    const afterRight = await page.evaluate(() => window.__riftTest.game.world.player.x);
    await page.keyboard.down("ArrowLeft");
    await page.waitForFunction((x) => window.__riftTest.game.world.player.x < x - 0.8, afterRight);
    await page.keyboard.up("ArrowLeft");

    // Aiming without Auto Fire turns the body and weapon together before the mouse is clicked.
    const beforeAim = await page.evaluate(() => {
      const { game, store } = window.__riftTest;
      store.data.settings.autoFire = false;
      const w = game.world;
      const enemy = w.spawnEnemy("kettleGuard", w.player.x - 5, w.player.y, {});
      enemy.spawnT = 0;
      return w.player.shotN;
    });
    const aimPoint = await page.evaluate(() => ({
      x: Math.round(innerWidth * 0.8),
      y: Math.round(innerHeight * 0.45),
    }));
    await page.mouse.move(aimPoint.x, aimPoint.y);
    await page.waitForFunction((shotN) => {
      const { game, renderer } = window.__riftTest;
      const p = game.world.player;
      const hero = renderer.player;
      return (
        p.manual &&
        !p.firing &&
        p.shotN === shotN &&
        Math.abs(p.aim) < 0.35 &&
        Math.abs(hero.base.rotation.y + p.aim) < 1e-6 &&
        Math.abs(hero.weaponBearing.rotation.y + p.aim) < 1e-6
      );
    }, beforeAim);
    // Mouse LMB fires. RMB alone dashes.
    await page.mouse.down({ button: "left" });
    await page.waitForFunction(() => {
      const p = window.__riftTest.game.world.player;
      return p.manual && p.firing && Math.abs(Math.atan2(Math.sin(p.aim), Math.cos(p.aim))) < 0.35;
    });
    await page.mouse.up({ button: "left" });
    await page.mouse.click(aimPoint.x, aimPoint.y, { button: "right" });
    await page.waitForFunction((d) => window.__riftTest.game.world.runStats.dashes === d + 1, start.dashes);
    assert.equal(await page.evaluate(() => window.__riftTest.game.input.mouse.down), false);
    const beforeHudDash = await page.evaluate(() => {
      const { game } = window.__riftTest;
      game.store.data.settings.autoFire = true;
      game.world.player.dashT = 0;
      game.world.player.dashCdT = 0;
      return game.world.runStats.dashes;
    });

    // Left-click #dashBtn blurs focus so Space works right after; then test E nova and G singularity.
    await press("#dashBtn");
    await page.waitForFunction((d) => window.__riftTest.game.world.runStats.dashes > d, beforeHudDash);
    assert.equal(await page.evaluate(() => document.activeElement?.id || "BODY"), "BODY");
    const dashCount = await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.player.dashT = 0;
      w.player.dashCdT = 0;
      return w.runStats.dashes;
    });
    await page.keyboard.press("Space");
    await page.waitForFunction((d) => window.__riftTest.game.world.runStats.dashes > d, dashCount);

    const bufferDash = (cooldown) =>
      page.evaluate((cd) => {
        const w = window.__riftTest.game.world;
        Object.assign(w.player, { dashCdT: cd, dashT: 0, dashN: 0 });
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
        return w.runStats.dashes;
      }, cooldown);
    const buffered = await bufferDash(0.065);
    await page.waitForFunction((d) => window.__riftTest.game.world.runStats.dashes === d + 1, buffered);
    const expired = await bufferDash(0.28);
    await page.waitForFunction(() => window.__riftTest.game.world.player.dashN > 0);
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.runStats.dashes), expired);

    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.player.fireBurst = 100;
      if (w.player.gadgetN < 1) w.player.gadgetN = 1;
      w.spawnEnemy("kettleGuard", w.player.x + 4, w.player.y, {});
    });
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__riftTest.game.world.player.fireBurst < 100);
    const preGadget = await page.evaluate(() => window.__riftTest.game.world.player.gadgetN);
    await page.keyboard.press("KeyG");
    await page.waitForFunction((n) => window.__riftTest.game.world.player.gadgetN < n, preGadget);

    // Esc pauses, Pause -> Settings -> Esc returns to Pause, P resumes
    await page.keyboard.press("Escape");
    await visible(page, "pause");
    assert.equal(await readout.isVisible(), false);
    assert.equal(await page.locator("#pause .controls-card").count(), 0);
    await press("#pauseSetBtn");
    await visible(page, "settings");
    assert.equal(await page.evaluate(() => document.getElementById("settings").classList.contains("in-run")), true);
    assert.equal(await performanceSetting.isChecked(), true);
    await performanceSetting.uncheck();
    await page.keyboard.press("Escape");
    await hidden(page, "settings");
    await visible(page, "pause");
    await page.keyboard.press("KeyP");
    await visible(page, "resumeCount");
    const interrupted = await page.evaluate(() => {
      const { game } = window.__riftTest;
      const remaining = game.resumeAt - performance.now();
      const time = game.world.time;
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
      return { remaining, time, paused: game.paused };
    });
    assert.ok(interrupted.remaining > 600 && interrupted.remaining <= 800);
    assert.equal(interrupted.paused, true);
    await hidden(page, "resumeCount");
    await visible(page, "pause");
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.time), interrupted.time);
    await page.keyboard.press("KeyP");
    await visible(page, "resumeCount");
    await page.waitForFunction(() => !window.__riftTest.game.paused);
    await hidden(page, "resumeCount");
    assert.equal(await readout.isVisible(), false);

    // Wave clear, reroll, seal, and pick with keyboard shortcuts.
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.rerolls = 2;
      w.banishes = 1;
      w.ws.seal = 1;
      w.planIdx = w.plan.length;
      w.markers.length = 0;
      w.bossPending = null;
      w.championPending = null;
      for (const e of [...w.enemies]) w.killEnemy(e);
    });
    await visible(page, "choose");
    await page.locator("#cards:not(.locked)").waitFor();
    assert.equal(await page.locator("#choose .card-key").count(), 0);
    const choiceAudit = await page.evaluate(() => window.__riftLayoutAudit());
    assert.equal(choiceAudit.ok, true, JSON.stringify(choiceAudit.findings));

    const rarityCheck = await page.evaluate(() => {
      const { game, ui } = window.__riftTest;
      const w = game.world;
      const savedOffer = w.offer;
      w.offer = ["dmg", "orbit", "sparkChain", "killStreak", "halo", "bellCage"];
      ui.renderCards(w);
      const cards = [...document.querySelectorAll("#cards .card")];
      const styles = cards.map((el) => {
        const cs = getComputedStyle(el);
        return {
          cls: el.className,
          bg: cs.backgroundColor,
          border: cs.borderTopColor,
          titleFont: getComputedStyle(el.querySelector("b")).fontFamily,
          badge: el.querySelector(".lv")?.textContent || "",
        };
      });
      w.offer = savedOffer;
      ui.renderCards(w);
      document.getElementById("cards").classList.remove("locked");
      return styles;
    });
    assert.equal(new Set(rarityCheck.map((s) => s.bg)).size, 6, "all 6 card tiers must have distinct card body colors");
    assert.equal(
      new Set(rarityCheck.map((s) => s.border)).size,
      6,
      "all 6 card tiers must have distinct border colors",
    );
    for (const row of rarityCheck) {
      assert.match(row.titleFont, /Baskervville/, "upgrade card titles must use Baskervville serif");
      assert.match(row.badge, /^[◇◆◈★✦♛]\s/, `tier badge must include geometric crest: ${row.badge}`);
    }

    const bossPairs = Object.entries(bossPatterns).flatMap(([boss, attacks]) =>
      [...new Set([...attacks, OVERDRIVE[boss]])].map((attack) => [boss, attack]),
    );
    const calloutRows = await page.evaluate((pairs) => {
      const { overlay } = window.__riftTest;
      const out = pairs.map(([boss, attack]) => {
        overlay.callouts = [];
        overlay.callout(attack, boss);
        return { boss, attack, label: overlay.callouts[0]?.t || "" };
      });
      overlay.callouts = [];
      return out;
    }, bossPairs);
    const obscureCallouts = /\b(carillon|orrery|crucible|crescendo|convergence|rime)\b/i;
    for (const row of calloutRows) {
      assert.ok(row.label.length > 0, `boss ${row.boss} attack "${row.attack}" must have a callout label`);
      assert.doesNotMatch(
        row.label,
        obscureCallouts,
        `boss ${row.boss} attack "${row.attack}" used a term that was meant to be simplified "${row.label}"`,
      );
    }

    await page.keyboard.press("KeyR");
    await page.waitForFunction(() => window.__riftTest.game.world.rerolls === 1);
    await page.keyboard.press("KeyB");
    await page.waitForFunction(() => document.getElementById("cards").classList.contains("banishing"));
    await page.locator("#cards:not(.locked)").waitFor();
    await page.keyboard.press("Digit1");
    await page.waitForFunction(
      () =>
        window.__riftTest.game.world.banishes === 0 &&
        !document.getElementById("cards").classList.contains("banishing"),
    );
    await page.locator("#cards:not(.locked)").waitFor();
    await page.keyboard.press("Digit2");
    await page.waitForFunction(
      () => window.__riftTest.game.world.wave === 2 && document.getElementById("choose").hidden,
    );

    // The keyboard shortcut remains available on the clean end screen.
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.god = false;
      w.player.iT = 0;
      w.player.dashT = 0;
      w.player.shield = false;
      w.hurtPlayer(99999, null, null, "devil", true);
    });
    await visible(page, "over");
    assert.equal(await page.locator("#over kbd").count(), 0);
    await page.keyboard.press("KeyR");
    await hidden(page, "over");
    await visible(page, "hud");
    await page.waitForFunction(() => window.__riftTest.game.world?.wave === 1);

    assert.deepEqual(errors, []);
  },
);

test(
  "multi-viewport responsive layout, portrait menu browsing and WCAG AA contrast audit",
  { timeout: 60000 },
  async (t) => {
    const { page, errors } = await openGame(t, "desktop");
    const contrast = await page.evaluate(() => {
      const parseRgb = (str) => {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const l1 = Math.max(lum(a), lum(b)),
          l2 = Math.min(lum(a), lum(b));
        return (l1 + 0.05) / (l2 + 0.05);
      };
      const probe = document.createElement("div");
      probe.style.color = "var(--mute)";
      probe.style.backgroundColor = "var(--panel)";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const muteRgb = parseRgb(cs.color);
      const panelRgb = parseRgb(cs.backgroundColor);
      probe.remove();
      return { muteRgb, panelRgb, ratio: ratio(muteRgb, panelRgb) };
    });
    assert.ok(
      contrast.ratio >= 4.5,
      `--mute (${contrast.muteRgb}) on --panel (${contrast.panelRgb}) must meet WCAG AA >= 4.5:1 (got ${contrast.ratio.toFixed(2)})`,
    );

    const viewports = [
      [1280, 720],
      [1280, 600],
      [1024, 768],
      [844, 390],
      [667, 375],
      [568, 320],
      [390, 844],
    ];
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(80);
      const res = await page.evaluate(() => ({
        needsRotate: document.body.classList.contains("needs-rotate"),
        audit: window.__riftLayoutAudit(),
      }));
      assert.equal(res.needsRotate, false, `Home menu must stay usable without rotate lock at ${width}x${height}`);
      assert.equal(
        res.audit.ok,
        true,
        `Layout audit failed at ${width}x${height}: ${JSON.stringify(res.audit.findings)}`,
      );
    }
    assert.deepEqual(errors, []);
  },
);
