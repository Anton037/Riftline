// Onboarding, core progression and the simplified menu use real touch paths.
import test from "node:test";
import assert from "node:assert/strict";
import { openGame } from "./support/game.mjs";

const timeout = process.env.TEST_DRAW === "1" ? 180000 : 30000;

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

test("the focused menu keeps workshop upgrades and achievement rewards working", { timeout }, async (t) => {
  const { page, press, errors } = await openGame(t, false);
  assert.deepEqual(await page.locator(".bottom-nav [data-go]").evaluateAll((nodes) => nodes.map((n) => n.dataset.go)), [
    "workshop",
    "records",
    "news",
    "settings",
  ]);
  assert.equal(await page.locator("#daily, #pacts, #training, #codexList, #recTabs").count(), 0);
  await page.evaluate(() => {
    const { store, ui } = window.__riftTest;
    store.data.shards = 100;
    store.data.stats.kills = 100;
    store.save("fixture");
    ui.renderHome();
  });
  await press('[data-go="workshop"]');
  await press('[data-buy="hull"]');
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.workshop.hull), 1);
  await press("#workshop [data-back]");
  await press('[data-go="records"]');
  await press('[data-claim="kills100"]');
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.milestones.kills100), true);
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.shards), 90);
  assert.equal(await page.locator('[data-claim="kills100"]').count(), 0);
  await page.reload();
  await page.waitForFunction(() => window.__riftTest?.store?.data.workshop.hull === 1);
  assert.equal(await page.evaluate(() => window.__riftTest.store.data.shards), 90);
  await press("#playBtn");
  await page.waitForFunction(() => window.__riftTest.game.mode === "game");
  assert.equal(await page.evaluate(() => window.__riftTest.game.world.stats.maxHp), 110);
  assert.deepEqual(errors, []);
});
