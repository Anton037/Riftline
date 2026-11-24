// Onboarding, core progression and the simplified menu use real touch paths.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { upgradeList } = await import("../src/data/upgrades.js");
const timeout = process.env.TEST_DRAW === "1" ? 180000 : 30000;

test("a lost graphics context pauses the run and waits for an explicit resume", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, "desktop", { viewport: { width: 800, height: 450 } });
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.world?.time > 0.1);
  await page.keyboard.down("KeyD");
  await page.evaluate(() => {
    const gl = window.__riftTest.renderer.renderer.getContext();
    const extension = gl.getExtension("WEBGL_lose_context");
    window.restoreGraphics = () => extension.restoreContext();
    extension.loseContext();
  });
  const resume = page.locator("#resumeBtn");
  await resume.filter({ hasText: "Waiting for graphics" }).waitFor();
  assert.equal(await resume.isDisabled(), true);
  assert.equal(await page.locator("#restartBtn").isDisabled(), true);
  const frozen = await page.evaluate(() => ({
    time: window.__riftTest.game.world.time,
    frame: window.__riftTest.renderer.renderer.info.render.frame,
  }));
  await page.keyboard.press("Escape");
  assert.deepEqual(
    await page.evaluate(() => {
      const { game } = window.__riftTest;
      return { time: game.world.time, paused: game.paused, resumeAt: game.resumeAt, keys: game.input.keys.size };
    }),
    { time: frozen.time, paused: true, resumeAt: 0, keys: 0 },
  );
  await page.keyboard.up("KeyD");
  await page.evaluate(() => window.restoreGraphics());
  await resume.filter({ hasText: /^Resume$/ }).waitFor();
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.time), frozen.time);
  await press("#resumeBtn");
  await page.waitForFunction(
    ({ time, frame }) =>
      window.__riftTest.game.world.time > time && window.__riftTest.renderer.renderer.info.render.frame > frame,
    frozen,
  );
  assert.deepEqual(errors, ["[riftline] webgl context lost", "[riftline] webgl context restored"]);
});

test("entering Endless writes the exact reward checkpoint before the next frame", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, "desktop");
  await press("#playBtn");
  await page.evaluate(() => {
    const { world } = window.__riftTest.game;
    world.startWave(20);
    world.state = "cleared";
    world.stateT = 3;
    world.shards = 40;
    world.offerBoss = true;
  });
  await page.locator("#endlessBtn").waitFor();
  const saved = await page.evaluate(() => {
    // Read the persistent save in the click's task, before the next animation frame can save it.
    document.getElementById("endlessBtn").click();
    return JSON.parse(localStorage.getItem("riftline.save.v1"));
  });
  assert.equal(saved.run.endless, true);
  assert.ok(saved.run.offer.length > 0);
  assert.equal(saved.shards, 50);
  await page.reload();
  assert.match(await page.locator("#continueBtn").textContent(), /BOSS REWARD/);
  await press("#continueBtn");
  await page.locator("#choose").waitFor();
  const restored = await page.evaluate(() => {
    const { game, store } = window.__riftTest;
    return { seed: game.world.seed, offer: game.world.offer, endless: game.world.endless, bank: store.data.shards };
  });
  assert.deepEqual(restored, { seed: saved.run.seed, offer: saved.run.offer, endless: true, bank: saved.shards });
  assert.deepEqual(errors, []);
});

test("a tablet can swipe through the build list during a reward choice", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, true);
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.mode === "game");
  await page.evaluate(
    (up) => {
      const { world } = window.__riftTest.game;
      world.startWave(15);
      world.up = up;
      world.state = "cleared";
      world.stateT = 3;
    },
    Object.fromEntries(upgradeList.filter(({ repeat }) => !repeat).map(({ id }) => [id, 1])),
  );
  await page.locator("#choose").waitFor();
  const strip = page.locator("#buildStrip");
  assert.equal(await strip.evaluate((el) => el.scrollHeight > el.clientHeight), true);
  const bounds = await strip.boundingBox();
  const point = { id: 1, x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height - 12) };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await touch("touchStart", [point]);
  await touch("touchMove", [{ ...point, y: point.y - 35 }]);
  await touch("touchMove", [{ ...point, y: point.y - 90 }]);
  await touch("touchEnd", []);
  await page.waitForFunction(() => document.getElementById("buildStrip").scrollTop > 0);
  await strip.locator("[data-up]").last().tap();
  await page.locator("#chooseUpInfo").waitFor();
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.state), "choose");
  assert.deepEqual(errors, []);
});

test("the fixed movement stick is optional and stays anchored after reloading", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, false, { fresh: true, viewport: { width: 568, height: 320 } });
  await press('[data-go="settings"]');
  await press("#hudEditBtn");
  const fixed = page.locator("#heFixed");
  await fixed.waitFor();
  assert.equal(await fixed.isChecked(), false);
  await fixed.tap();
  assert.equal(await fixed.isChecked(), true);
  await press("#heSave");
  await page.reload();
  await page.waitForFunction(() => window.__riftTest?.store.data.settings.stickFixed === true);
  await press("#playBtn");
  const cdp = await page.context().newCDPSession(page);
  const move = { x: 160, y: 260, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move] });
  try {
    move.x += 140;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [move] });
    await page.waitForFunction((x) => window.__riftTest.game.input.move.x === x, move.x);
    const stick = await page.evaluate(() => {
      const { input } = window.__riftTest.game;
      const center = input.fixedMove(input.radius());
      const { active, x, ox, oy } = input.move;
      return { active, x, ox, oy, center };
    });
    assert.equal(stick.active, true);
    assert.equal(stick.x, move.x);
    assert.equal(stick.ox, stick.center.x);
    assert.equal(stick.oy, stick.center.y);
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  }
  assert.deepEqual(errors, []);
});

test("a phone can pick its first craft while a movement thumb is still down", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, false, {
    fresh: true,
    viewport: { width: 667, height: 375 },
  });
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.tut?.step === 0);
  const cdp = await page.context().newCDPSession(page);
  const move = { x: 160, y: 260, id: 1 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move] });
  move.x += 60;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [move] });
  try {
    await page.waitForFunction(() => window.__riftTest.game.tut?.step === 1);
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      w.god = true;
      w.planIdx = w.plan.length;
      w.markers.length = 0;
      w.bossPending = null;
      w.championPending = null;
      for (const e of [...w.enemies]) w.killEnemy(e);
    });
    await page.locator("#chooseFirstHint").waitFor({ state: "visible" });
    assert.equal(await page.locator("#chooseScrollHint").isVisible(), false);
    const craft = page.locator("#cards [data-pick]").last();
    await craft.waitFor({ state: "visible" });
    const id = await craft.getAttribute("data-pick");
    const bounds = await craft.boundingBox();
    const tap = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move, tap] });
    const slide = { ...tap, x: tap.x - 36 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [move, slide] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [slide] });
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.state), "choose");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move, tap] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [move, slide] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [move, tap] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [tap] });
    assert.equal(
      await page.evaluate(() => window.__riftTest.game.world.state),
      "choose",
      "A swipe returning to the starting point must not pick a craft",
    );
    await page.evaluate(() => {
      document.addEventListener(
        "pointerup",
        (event) => {
          window.upgradeRelease = {
            primary: event.isPrimary,
            trusted: event.isTrusted,
            card: event.target.closest("[data-pick]")?.dataset.pick,
          };
        },
        { capture: true, once: true },
      );
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [move, tap] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [tap] });
    assert.deepEqual(await page.evaluate(() => window.upgradeRelease), { primary: false, trusted: true, card: id });
    await page.waitForFunction(
      () =>
        window.__riftTest.game.world.wave === 2 &&
        window.__riftTest.game.world.state === "fight" &&
        document.getElementById("choose").hidden,
    );
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run);
    assert.equal(run.wave, 2);
    assert.equal(run.up[id], 1);
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  }
  assert.deepEqual(errors, []);
});

test("a short phone can browse, reroll and resume a five-card boss offer", { timeout }, async (t) => {
  const landscape = { width: 568, height: 320 };
  const { page, press, errors } = await openGame(t, false, { viewport: landscape });
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.mode === "game");
  await page.evaluate(() => {
    const w = window.__riftTest.game.world;
    w.seed = 706;
    w.startWave(5);
    w.state = "cleared";
    w.stateT = 2.8;
    w.offerBoss = true;
    w.rerolls = 2;
    w.ws.extraChoice = 1;
    w.banishes = 2;
  });
  const cards = page.locator("#cards");
  const picks = cards.locator("[data-pick]");
  const hint = page.locator("#chooseScrollHint");
  await hint.waitFor({ state: "visible" });
  assert.equal(await picks.count(), 5);
  assert.equal(await hint.textContent(), "Swipe for more →");
  const layout = await page.evaluate(() => window.__riftLayoutAudit());
  assert.equal(layout.ok, true, JSON.stringify(layout.findings));
  const readOffer = () => picks.evaluateAll((nodes) => nodes.map((card) => card.dataset.pick));
  const original = await readOffer();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const swipeToEnd = async () => {
    const box = await cards.boundingBox();
    const point = { x: Math.round(box.x + box.width - 40), y: Math.round(box.y + box.height / 2), id: 1 };
    await touch("touchStart", [point]);
    await touch("touchMove", [{ ...point, x: point.x - 100 }]);
    await touch("touchMove", [{ ...point, x: point.x - 325 }]);
    await touch("touchEnd", []);
    await hint.filter({ hasText: /^← Swipe for more$/ }).waitFor();
  };
  await swipeToEnd();
  assert.deepEqual(await readOffer(), original);
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.state), "choose");

  await press("#sealBtn");
  assert.equal(await picks.first().isDisabled(), true);
  assert.equal(await hint.textContent(), "← Swipe for more");
  await page.setViewportSize({ width: landscape.height, height: landscape.width });
  await page.locator("#rotate").waitFor({ state: "visible" });
  await page.locator("#pause").waitFor({ state: "visible" });
  await page.setViewportSize(landscape);
  await page.locator("#rotate").waitFor({ state: "hidden" });
  await press("#resumeBtn");
  await hint.waitFor({ state: "visible" });
  assert.deepEqual(await readOffer(), original);
  assert.equal(await picks.first().isDisabled(), true);
  assert.equal(await hint.textContent(), "← Swipe for more");
  await press("#rerollBtn");
  assert.equal(await page.locator("#rerollTxt").textContent(), "Reroll (1)");
  assert.equal(await page.locator("#sealBtn").getAttribute("aria-pressed"), "false");
  assert.equal(await cards.evaluate((el) => el.scrollLeft), 0);
  assert.equal(await hint.textContent(), "Swipe for more →");
  const rerolled = await readOffer();
  assert.equal(rerolled[0], original[0]);
  assert.ok(rerolled.some((id) => !original.includes(id)));

  await page.setViewportSize({ width: 844, height: 390 });
  await hint.waitFor({ state: "hidden" });
  await page.setViewportSize(landscape);
  await hint.waitFor({ state: "visible" });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  assert.equal((await page.reload()).fromServiceWorker(), true);
  await press("#continueBtn");
  await hint.waitFor({ state: "visible" });
  assert.deepEqual(await readOffer(), rerolled);
  assert.equal(await page.locator("#rerollTxt").textContent(), "Reroll (1)");
  assert.equal(await hint.textContent(), "Swipe for more →");
  await swipeToEnd();
  await picks.last().tap();
  await page.locator("#anvil").waitFor({ state: "visible" });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("riftline.save.v1")).run);
  assert.equal(saved.up[rerolled.at(-1)], 1);
  assert.deepEqual(saved.anvil, []);
  assert.deepEqual(errors, []);
});

test(
  "first-run tutorial accepts touch, unlocks audio and resumes safely after backgrounding",
  { timeout },
  async (t) => {
    const { page, press, errors } = await openGame(t, false, { fresh: true, audio: true });
    await press("#playBtn");
    await page.waitForFunction(() => window.__riftTest.game.tut?.step === 0);
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.hold), true);
    await page.evaluate(() => {
      window.__riftTest.game.world.god = true;
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 260, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 220, y: 230, id: 1 }] });
    try {
      await page.waitForFunction(() => window.__riftTest.game.tut?.step === 1);
    } finally {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    }
    assert.equal(await page.evaluate(() => window.__riftTest.game.world.hold), false);
    // Arrange four kills; the live tutorial, not a test timer, advances its coach.
    await page.evaluate(() => {
      const w = window.__riftTest.game.world;
      for (let i = 0; i < 4; i++) {
        const e = w.spawnEnemy("kettleGuard", 5 + i, -3, {});
        w.killEnemy(e);
      }
    });
    await page.waitForFunction(() => window.__riftTest.game.tut?.step === 2);
    await press("#dashBtn");
    await page.waitForFunction(() => window.__riftTest.game.tut?.step === 3);
    await page.waitForFunction(() => window.__riftTest.store.data.seen.tutorial === true);
    await page.waitForFunction(
      () => window.__riftTest.game.sound.ctx?.state === "running" && window.__riftTest.game.sound.musicScheduled > 0,
    );
    const notes = await page.evaluate(() => window.__riftTest.game.sound.musicScheduled);
    await press("#pauseBtn");
    await page.waitForFunction(() => window.__riftTest.game.sound.playKind === "menu");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(() => window.__riftTest.game.sound.ctx.state === "suspended");
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => window.__riftTest.game.paused), true);
    await press("#resumeBtn");
    await page.waitForFunction((notes) => {
      const { game } = window.__riftTest;
      return (
        !game.paused &&
        game.sound.ctx.state === "running" &&
        game.sound.playKind === "fight" &&
        game.sound.musicScheduled > notes
      );
    }, notes);
    assert.deepEqual(errors, []);
  },
);

test("first-run desktop onboarding keeps keyboard and mouse prompts when a touch arrives", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, "desktop", { fresh: true });
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.tut?.step === 0);
  // The run creates the tutorial state before the first frame draws its coach.
  await page
    .locator("#coachText")
    .filter({ hasText: /W A S D or the arrow keys/ })
    .waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.hold), true);
  await page.evaluate(() => {
    window.__riftTest.game.world.god = true;
  });
  await page.keyboard.down("KeyD");
  await page.waitForFunction(() => window.__riftTest.game.tut?.step === 1);
  await page.keyboard.up("KeyD");
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.hold), false);
  assert.match(await page.locator("#coachText").textContent(), /hold the left mouse button to aim yourself/);

  await page.evaluate(() => {
    const w = window.__riftTest.game.world;
    for (let i = 0; i < 4; i++) {
      const e = w.spawnEnemy("kettleGuard", 5 + i, -3, {});
      w.killEnemy(e);
    }
  });
  await page.waitForFunction(() => window.__riftTest.game.tut?.step === 2);
  assert.match(await page.locator("#coachText").textContent(), /Press SPACE or right-click to dash/);

  // A touch on a desktop must neither steer the Keeper nor change the prompts.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 260, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 220, y: 230, id: 1 }] });
  assert.equal(await page.evaluate(() => window.__riftTest.game.input.move.active), false);
  assert.match(await page.locator("#coachText").textContent(), /Press SPACE or right-click to dash/);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });

  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__riftTest.game.tut?.step === 3);
  await page.waitForFunction(() => window.__riftTest.store.data.seen.tutorial === true, null, { timeout: 10000 });
  assert.deepEqual(errors, []);
});

test("the focused menu keeps workshop upgrades and achievement rewards working", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, false);
  assert.deepEqual(await page.locator(".bottom-nav [data-go]").evaluateAll((nodes) => nodes.map((n) => n.dataset.go)), [
    "workshop",
    "records",
    "news",
    "settings",
  ]);
  assert.equal(await page.locator("#daily, #pacts, #training").count(), 0);
  assert.equal(await page.locator("#recTabs").count(), 1);
  assert.equal(await page.locator("#codexList").count(), 1);
  await page.evaluate(() => {
    const { store, ui } = window.__riftTest;
    store.data.shards = 100;
    store.data.stats.kills = 100;
    store.save("fixture");
    ui.renderHome();
  });
  await press('[data-go="workshop"]');
  await press('[data-buy="healthCoat"]');
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.workshop.healthCoat), 1);
  await press("#workshop [data-back]");
  await press('[data-go="records"]');
  await press('[data-claim="kills100"]');
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.milestones.kills100), true);
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.shards), 90);
  assert.equal(await page.locator('[data-claim="kills100"]').count(), 0);
  await page.reload();
  await page.waitForFunction(() => window.__riftTest?.store?.data.workshop.healthCoat === 1);
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.shards), 90);
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.mode === "game");
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.stats.maxHp), 110);
  await page.evaluate(() => {
    const { game, ui } = window.__riftTest;
    const w = game.world;
    w.startWave(5);
    w.state = "cleared";
    w.stateT = 1.3;
    w.shards = 55;
    w.player.hp = 50;
    w.offerBoss = true;
    w.ws.seal = 1;
    w.banishes = 2;
    ui.banishMode = true; // An old selection must not carry into a newly opened offer.
  });
  const reward = page.locator("#cards .r6");
  await reward.waitFor({ state: "visible" });
  assert.equal(await page.locator("#sealBtn").getAttribute("aria-pressed"), "false");
  await press("#sealBtn");
  assert.equal(await reward.isDisabled(), true);
  assert.match(await reward.evaluate((card) => getComputedStyle(card, "::after").content), /CAN’T BE SEALED/);
  const sealable = "#cards [data-pick]:not(:disabled)";
  const sealed = await page.locator(sealable).first().getAttribute("data-pick");
  await press(sealable);
  assert.equal(await page.evaluate((id) => window.__riftTest.game.world.banished.includes(id), sealed), true);
  assert.equal(await reward.isEnabled(), true);
  await press("#cards .r6");
  await page.locator("#anvil").waitFor({ state: "visible" });
  assert.equal(await page.locator("#anvilOffers [data-anvil]").count(), 3);
  await press('#anvilOffers [data-anvil="0"]');
  assert.equal(await page.locator("#anvilShards").textContent(), "38");
  assert.match(await page.locator("#anvilHpNum").textContent(), /^89\/110$/);
  assert.ok(await page.locator('#anvilOffers [data-anvil="0"]').isDisabled());
  await press("#anvilPauseBtn");
  await press("#resumeBtn");
  await page.locator("#anvil").waitFor({ state: "visible" });
  assert.equal(await page.locator("#resumeCount").isVisible(), false);
  await page.reload();
  assert.match(await page.locator("#continueBtn").textContent(), /ROADSIDE FORGE/);
  assert.equal(await page.locator("#continueNote").isVisible(), false);
  await press("#continueBtn");
  await page.locator("#anvil").waitFor({ state: "visible" });
  assert.equal(await page.locator("#anvilShards").textContent(), "38");
  assert.ok(await page.locator('#anvilOffers [data-anvil="0"]').isDisabled());
  await page.setViewportSize({ width: 720, height: 320 });
  await page.waitForFunction(() => window.innerHeight === 320);
  const continueBox = await page.locator("#anvilContinueBtn").boundingBox();
  assert.ok(continueBox.y >= 0 && continueBox.y + continueBox.height <= 320);
  await press("#anvilContinueBtn");
  await page.waitForFunction(() => window.__riftTest.game.world?.wave === 6);
  assert.deepEqual(errors, []);
});
