// Real rendered equipment, all enemy silhouettes, transient effects and the frame-rate control.
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { weaponDefs } from "../../src/data/weapons.js";
import { launchArgs } from "../browser.js";
const url = process.argv[2] || "http://localhost:8124/",
  tag = process.argv[3] || "equipment";
const out = `verification-output/${tag}-equipment`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: launchArgs() });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        if (!window.__visualManualFrames) fn(t);
      });
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      window.__riftTest?.renderer?.finishAtlasReady &&
      window.__riftTest.renderer.arena.uniforms.uTerrainReady.value === 1,
  );
  await page.evaluate(() => {
    window.__visualManualFrames = true;
  });
  await page.locator('[data-go="settings"]').tap();
  assert.equal(await page.locator("#setFrameRate .on").getAttribute("data-v"), "60");
  for (const fps of [30, 120, 60]) {
    await page.locator(`#setFrameRate [data-v="${fps}"]`).tap();
    const state = await page.evaluate(() => {
      const T = window.__riftTest;
      return {
        fps: T.store.data.settings.frameRate,
        detail: T.renderer.dprCap,
        shadows: T.renderer.renderer.shadowMap.enabled,
        particles: T.renderer.maxParticles,
      };
    });
    assert.deepEqual(state, { fps, detail: 2, shadows: true, particles: 1400 });
  }
  await page.screenshot({ path: `${out}/settings.png`, animations: "disabled" });
  const weapons = Object.keys(weaponDefs);
  const metrics = [];
  for (const weapon of weapons) {
    const row = await page.evaluate((weapon) => {
      const T = window.__riftTest,
        r = T.renderer;
      for (const k in T.store.data.seen) T.store.data.seen[k] = true;
      T.store.data.weapons[weapon] = true;
      T.store.data.weapon = weapon;
      const random = Math.random;
      Math.random = () => 0.42;
      try {
        T.game.startRun({});
      } finally {
        Math.random = random;
      }
      const w = T.game.world;
      T.game.paused = true;
      T.game.intro = null;
      w.startWave(2);
      w.god = true;
      w.player.iT = 0;
      w.player.hurtT = 0;
      w.player.x = 0;
      w.player.y = 2;
      w.enemies.length = 0;
      ["grunt", "swarmer", "splitter", "bulwark"].forEach((id, i) => {
        const e = w.spawnEnemy(id, (i % 2 ? 1 : -1) * 3, Math.floor(i / 2) * 5, {});
        e.spawnT = 0;
      });
      r.smokeView.clear();
      r.P.n = 0;
      r.rings.length = 0;
      r.lines.length = 0;
      r.flashes.length = 0;
      w.fx.length = 0;
      r.time = 8;
      w.time = 8;
      const draw = r.renderer.render;
      try {
        r.renderer.render = () => {};
        for (let i = 0; i < 11; i++) r.frame(1 / 12, w);
      } finally {
        r.renderer.render = draw;
      }
      w.fire(0);
      const victim = w.enemies[0];
      w.hurtEnemy(victim, 99999, 1, 0, 0, false);
      r.consume(w.fx, w, T.store.data.settings);
      w.fx.length = 0;
      r.frame(0.04, w);
      r.camera.position.set(7, 8, 11);
      r.camera.lookAt(0.6, 0.6, 2);
      r.renderer.render(r.scene, r.camera);
      T.ui.hud(w);
      return {
        weapon,
        actual: w.weapon,
        smoke: r.smokeView.puffs.length,
        rockets: r.rocketBodies.n,
        particles: r.P.n,
        calls: r.renderer.info.render.calls,
      };
    }, weapon);
    assert.equal(row.actual, weapon);
    assert.ok(row.smoke > 0, `${weapon}: death/weapon smoke missing`);
    if (weapon === "rocket") assert.ok(row.rockets > 0);
    assert.deepEqual(errors, [], `${weapon}: browser/shader errors`);
    metrics.push(row);
    await page.screenshot({ path: `${out}/${weapon}.png`, animations: "disabled" });
    console.log(JSON.stringify(row));
  }
  // Inspect the physical gun bearing from every aim direction while the body banks, walks and tucks its legs.
  for (let turn = 0; turn < 8; turn++) {
    await page.evaluate((turn) => {
      const T = window.__riftTest,
        w = T.game.world,
        r = T.renderer;
      w.enemies.length = 0;
      w.pb.length = 0;
      w.eb.length = 0;
      w.player.x = w.player.y = 0;
      w.player.iT = w.player.hurtT = 0;
      r.corpses.length = 0;
      r.smokeView.clear();
      r.P.n = 0;
      r.lines.length = 0;
      r.rings.length = 0;
      r.flashes.length = 0;
      r.frame(0.01, w);
      const d = r.player,
        angle = (turn * Math.PI) / 4;
      d.base.rotation.set(turn % 2 ? 0.25 : 0, 0, -0.1, "YZX");
      d.group.position.set(0, d.setWalk(turn * 0.8, 0.8, turn === 6 ? 1 : 0, 8), 0);
      d.recoil = 0.07;
      d.aimAt(angle);
      r.camera.position.set(3.2, 2.6, 3.5);
      r.camera.lookAt(0, 0.85, 0);
      r.camera.fov = 34;
      r.camera.updateProjectionMatrix();
      r.renderer.render(r.scene, r.camera);
    }, turn);
    assert.deepEqual(errors, [], `player turn ${turn}: browser/shader errors`);
    await page.screenshot({ path: `${out}/player-turn-${turn}.png`, animations: "disabled" });
  }
  const groups = {
    machines: ["grunt", "gunner", "bomber", "sniper", "bulwark", "mortar", "turret", "charger", "sapper", "driller"],
    organics: ["swarmer", "mite", "splitter", "hive", "leaper", "mender", "carrier"],
    others: ["brute", "striker", "phantom", "sentinel", "minebot", "drone", "beacon", "weaver"],
  };
  for (const [group, ids] of Object.entries(groups)) {
    await page.evaluate((ids) => {
      const T = window.__riftTest,
        w = T.game.world,
        r = T.renderer;
      w.enemies.length = 0;
      r.corpses.length = 0;
      r.smokeView.clear();
      r.P.n = 0;
      r.lines.length = 0;
      r.rings.length = 0;
      w.pb.length = 0;
      w.fx.length = 0;
      ids.forEach((id, i) => {
        const e = w.spawnEnemy(id, ((i % 4) - 1.5) * 3.2, Math.floor(i / 4) * 3.4 - 1, {});
        e.spawnT = 0;
        e.face = -0.6;
      });
      r.frame(0.01, w);
      r.camera.position.set(9, 12, 14);
      r.camera.lookAt(0, 0.6, 2);
      r.renderer.render(r.scene, r.camera);
    }, ids);
    assert.deepEqual(errors, [], `${group}: browser/shader errors`);
    await page.screenshot({ path: `${out}/${group}.png`, animations: "disabled" });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    window.__riftTest.ui.show("settings");
  });
  await page.locator("#setFrameRate").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone-settings.png`, animations: "disabled" });
  const controls = await page.locator("#setFrameRate button").evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }),
  );
  for (const b of controls) {
    assert.ok(b.right <= 844);
    assert.ok(b.width >= 44 && b.height >= 40);
  }
  fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
  assert.deepEqual(errors, []);
  console.log("Equipment: seven weapons, all 25 enemy types, smoke/rocket programs and High at every FPS passed.");
} finally {
  await browser.close();
}
