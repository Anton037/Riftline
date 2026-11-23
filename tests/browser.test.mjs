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
      const ignored = await page.evaluate(() => {
        const input = window.__riftTest.game.input;
        for (const id of ["dashBtn", "novaBtn", "gadgetBtn"])
          document
            .getElementById(id)
            .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 2 }));
        return { ...input.pending, touch: document.body.classList.contains("input-touch") };
      });
      assert.deepEqual(ignored, { dash: 0, nova: 0, gadget: 0, fire: 0, touch: true });
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
      assert.equal(await page.evaluate(() => window.__gamepadReads), 0);
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
        touchInput: document.body.classList.contains("input-touch"),
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
    assert.equal(await page.locator("#settingsControlsCard .pad-control:visible").count(), 0);
    await page.keyboard.press("Escape");
    await visible(page, "home");

    await press("#playBtn");
    await visible(page, "hud");
    await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
    const hudDesktop = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName,
      dashKey: getComputedStyle(document.querySelector("#dashBtn .key")).display !== "none",
      novaKey: getComputedStyle(document.querySelector("#novaBtn .key")).display !== "none",
      gadgetKey: getComputedStyle(document.getElementById("gadgetKey")).display !== "none",
      cursor: getComputedStyle(document.getElementById("touch")).cursor,
      touchInput: document.body.classList.contains("input-touch"),
      audit: window.__riftLayoutAudit(),
    }));
    assert.equal(hudDesktop.activeTag, "BODY");
    assert.equal(hudDesktop.dashKey, true);
    assert.equal(hudDesktop.novaKey, true);
    assert.equal(hudDesktop.gadgetKey, true);
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

    // Mouse LMB aims and fires. RMB alone dashes.
    await page.evaluate(() => {
      window.__riftTest.store.data.settings.autoFire = false;
    });
    const aimPoint = await page.evaluate(() => ({
      x: Math.round(innerWidth * 0.8),
      y: Math.round(innerHeight * 0.45),
    }));
    await page.mouse.move(aimPoint.x, aimPoint.y);
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
      w.player.nova = 100;
      if (w.player.gadgetN < 1) w.player.gadgetN = 1;
      w.spawnEnemy("grunt", w.player.x + 4, w.player.y, {});
    });
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.__riftTest.game.world.player.nova < 100);
    const preGadget = await page.evaluate(() => window.__riftTest.game.world.player.gadgetN);
    await page.keyboard.press("KeyG");
    await page.waitForFunction((n) => window.__riftTest.game.world.player.gadgetN < n, preGadget);

    // Esc pauses, Pause -> Settings -> Esc returns to Pause, P resumes
    await page.keyboard.press("Escape");
    await visible(page, "pause");
    await press("#pauseSetBtn");
    await visible(page, "settings");
    assert.equal(await page.evaluate(() => document.getElementById("settings").classList.contains("in-run")), true);
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

    // Wave clear -> key badges, R reroll, B banish + 1 banish pick, 2 upgrade pick
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.rerolls = 2;
      w.banishes = 1;
      w.ws.banish = 1;
      w.planIdx = w.plan.length;
      w.markers.length = 0;
      w.bossPending = null;
      w.championPending = null;
      for (const e of [...w.enemies]) w.killEnemy(e);
    });
    await visible(page, "choose");
    await page.locator("#cards:not(.locked)").waitFor();
    const chooseBadges = await page.evaluate(() => ({
      cards: [...document.querySelectorAll("#cards .card-key")].map((el) => el.textContent),
      banish: document.querySelector("#banishBtn .card-key")?.textContent,
      reroll: document.querySelector("#rerollBtn .card-key")?.textContent,
      audit: window.__riftLayoutAudit(),
    }));
    assert.deepEqual(chooseBadges.cards, ["1", "2", "3"]);
    assert.equal(chooseBadges.banish, "B");
    assert.equal(chooseBadges.reroll, "R");
    assert.equal(chooseBadges.audit.ok, true, JSON.stringify(chooseBadges.audit.findings));

    const rarityCheck = await page.evaluate(() => {
      const { game, ui } = window.__riftTest;
      const w = game.world;
      const savedOffer = w.offer;
      w.offer = ["dmg", "orbit", "arc", "bloodrush", "halo", "sealgrid"];
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
    const legacyCallouts = /\b(BULLET RING|LASER CROSS|OVERDRIVE|BOMBARDMENT|FROST NOVA)\b/i;
    for (const row of calloutRows) {
      assert.ok(row.label.length > 0, `boss ${row.boss} attack "${row.attack}" must have a callout label`);
      assert.doesNotMatch(
        row.label,
        legacyCallouts,
        `boss ${row.boss} attack "${row.attack}" used legacy callout "${row.label}"`,
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

    // End screen R badge & R retry
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.god = false;
      w.player.iT = 0;
      w.player.dashT = 0;
      w.player.shield = false;
      w.hurtPlayer(99999, null, null, "devil", true);
    });
    await visible(page, "over");
    assert.equal(await page.locator("#retryBtn .card-key").textContent(), "R");
    await page.keyboard.press("KeyR");
    await hidden(page, "over");
    await visible(page, "hud");
    await page.waitForFunction(() => window.__riftTest.game.world?.wave === 1);

    assert.equal(await page.evaluate(() => window.__gamepadReads), 0);
    const padStart = await page.evaluate(() => {
      const { game } = window.__riftTest;
      game.world.hold = true;
      game.store.data.settings.autoFire = false;
      const pad = {
        index: 0,
        connected: true,
        mapping: "standard",
        axes: [0.08, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      };
      window.__fixturePad = pad;
      navigator.getGamepads = () => {
        window.__gamepadReads++;
        return [pad];
      };
      window.dispatchEvent(Object.assign(new Event("gamepadconnected"), { gamepad: pad }));
      return { x: game.world.player.x, dashes: game.world.runStats.dashes };
    });
    await page.waitForFunction(() => window.__gamepadReads > 2);
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.player.x), padStart.x);
    await page.evaluate(() => {
      window.__fixturePad.axes = [1, 0, 1, 0];
    });
    await page.waitForFunction((x) => window.__riftTest.game.world.player.x > x + 0.3, padStart.x);
    assert.ok(await page.locator("#dashBtn .pad-key").isVisible());
    const pressPad = (button, pressed) =>
      page.evaluate(
        ([index, value]) => {
          window.__fixturePad.buttons[index].pressed = value;
        },
        [button, pressed],
      );
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.player.firing), false);
    await pressPad(7, true);
    await page.waitForFunction(() => window.__riftTest.game.world.player.firing);
    await pressPad(7, false);
    await pressPad(0, true);
    await page.waitForFunction((d) => window.__riftTest.game.world.runStats.dashes === d + 1, padStart.dashes);
    await pressPad(0, false);
    await page.evaluate(() => {
      const { player } = window.__riftTest.game.world;
      player.gadgetN = 0;
      player.gadgetT = 0.055;
      player.nova = 100;
      window.__fixturePad.buttons[3].pressed = true;
    });
    await page.waitForFunction(() => window.__riftTest.game.world.singularities.length > 0);
    await pressPad(3, false);
    await pressPad(1, true);
    await page.waitForFunction(() => window.__riftTest.game.world.player.nova < 100);
    await pressPad(1, false);
    await pressPad(9, true);
    await visible(page, "pause");
    await pressPad(9, false);
    const reads = await page.evaluate(() => {
      const pad = window.__fixturePad;
      pad.connected = false;
      window.dispatchEvent(Object.assign(new Event("gamepaddisconnected"), { gamepad: pad }));
      return window.__gamepadReads;
    });
    await page.waitForFunction(() => !document.body.classList.contains("input-gamepad"));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.__gamepadReads), reads);
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
