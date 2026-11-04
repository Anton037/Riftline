// First-run onboarding/audio and isolated practice use the same touch-only paths as a player.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

const timeout = process.env.TEST_DRAW === "1" ? 90000 : 30000;

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
        const e = w.spawnEnemy("grunt", 5 + i, -3, {});
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

test("training and the Codex archive preserve real progress and a resumable run", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, false);
  const before = await page.evaluate(() => {
    const { store, ui, World } = window.__riftTest;
    const w = new World({ seed: 731, weapon: "pulse", threat: 0, ws: {} });
    w.startWave(2);
    store.data.run = w.snapshot();
    store.data.shards = 1234;
    store.data.stats.runs = 4;
    store.save("fixture");
    ui.renderHome();
    return { run: store.data.run, stats: store.data.stats, seen: store.data.seen, shards: store.data.shards };
  });
  assert.match(await page.locator("#continueNote").textContent(), /beginning/);
  await press('[data-go="training"]');
  assert.equal(await page.locator("[data-practice]").count(), 6);
  await page.locator("#trainingPhase").selectOption("enraged");
  await press('[data-practice="marsh"]');
  await page.waitForFunction(() => window.__riftTest.game.world?.boss?.type === "queen");
  await page.waitForFunction(() => document.getElementById("waveLabel").textContent === "TRAINING");
  assert.equal(await page.locator("#waveLabel").textContent(), "TRAINING");
  await press("#pauseBtn");
  await press("#resumeBtn");
  await page.evaluate(() => {
    const w = window.__riftTest.game.world;
    w.killEnemy(w.boss);
    w.waveT = 2;
  });
  await page.waitForFunction(() => !document.getElementById("over").hidden);
  assert.equal(await page.locator("#overTitle").textContent(), "TRAINING CLEAR");
  assert.equal(await page.locator(".payout").isVisible(), false);
  await press("#retryBtn");
  await page.waitForFunction(() => window.__riftTest.game.world?.boss?.type === "queen");
  await page.evaluate(() => {
    const w = window.__riftTest.game.world;
    w.player.shield = false;
    w.player.iT = 0;
    w.player.dashT = 0;
    w.hurtPlayer(99999, null, null, "queen", true);
  });
  await page.waitForFunction(() => !document.getElementById("over").hidden);
  await press("#homeBtn");
  await press("#training [data-back]");
  const after = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("riftline.save.v1"));
    return { run: data.run, stats: data.stats, seen: data.seen, shards: data.shards };
  });
  assert.deepEqual(after, before);
  await press('[data-go="records"]');
  await press('[data-rtab="codex"]');
  assert.equal(await page.locator('[data-cx="boss_forge"]').count(), 0);
  assert.match(await page.locator("#codexList").textContent(), /Bosses 0\/6/);
  await page.evaluate(() => {
    const { store, ui } = window.__riftTest;
    store.data.stats.bosses.forge = 1;
    store.data.seen.od_forge = true;
    ui.renderCodex();
  });
  assert.match(await page.locator('[data-cx="boss_forge"]').textContent(), /THE CRUCIBLE/);
  assert.match(await page.locator("#codexList").textContent(), /Archive/);
  assert.match(await page.locator("#codexList").textContent(), /Bosses 0\/6/);
  assert.deepEqual(errors, []);
});
