// Fresh browser/context/server per flow, bounded waits and optional pixel rendering.
import { chromium } from "playwright";
import { serve } from "../../tools/serve.js";
import { launchArgs } from "../../tools/browser.js";
import { fileURLToPath } from "node:url";
export async function openGame(t, mode, { fresh = false, audio = false, dpr = 1, viewport } = {}) {
  const profile = mode === true ? "tablet" : mode === false ? "phone" : mode || "phone";
  const isDesktop = profile === "desktop";
  const defaultViewport =
    profile === "desktop"
      ? { width: 1280, height: 720 }
      : profile === "tablet"
        ? { width: 1024, height: 768 }
        : { width: 844, height: 390 };
  const draw = process.env.TEST_DRAW === "1";
  const { server, url } = await serve(fileURLToPath(new URL("../../dist/", import.meta.url)), 0);
  const stopServer = () => {
    if (!server.listening) return;
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  };
  let browser;
  t.after(async () => {
    await browser?.close();
    await stopServer();
  });
  browser = await chromium.launch({ args: launchArgs() });
  t.signal.addEventListener(
    "abort",
    () => {
      void browser.close().catch(() => {});
    },
    { once: true },
  );
  const context = await browser.newContext({
    viewport: viewport || defaultViewport,
    deviceScaleFactor: dpr,
    hasTouch: !isDesktop,
    isMobile: !isDesktop,
  });
  await context.addInitScript(
    ({ draw, fresh, audio }) => {
      window.__gamepadReads = 0;
      navigator.getGamepads = () => {
        window.__gamepadReads++;
        return [];
      };
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      if (!sessionStorage.getItem("test-seeded")) {
        sessionStorage.setItem("test-seeded", "1");
        localStorage.setItem(
          "riftline.save.v1",
          JSON.stringify({
            v: 1,
            game: "riftline",
            seen: fresh ? {} : { tutorial: true },
            settings: { frameRate: 30, sfx: audio ? 0.8 : 0, music: audio ? 0.45 : 0, ambience: audio ? 0.8 : 0 },
          }),
        );
      }
      if (!draw)
        for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
          if (!proto) continue;
          for (const name of [
            "drawElements",
            "drawArrays",
            "drawElementsInstanced",
            "drawArraysInstanced",
            "drawRangeElements",
          ])
            if (proto[name]) proto[name] = function () {};
        }
    },
    { draw, fresh, audio },
  );
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(draw ? 45000 : 6000);
  page.setDefaultNavigationTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__riftTest?.game && window.__riftTest.renderer);
  await page.waitForFunction(
    () =>
      window.__riftTest.renderer.finishAtlasReady &&
      window.__riftTest.renderer.arena.uniforms.uTerrainReady.value === 1 &&
      window.__riftTest.renderer.renderer.info.render.frame > 0,
    null,
    { timeout: 15000 },
  );
  return {
    page,
    errors,
    stopServer,
    press: (selector) => (isDesktop ? page.locator(selector).first().click() : page.locator(selector).first().tap()),
  };
}
