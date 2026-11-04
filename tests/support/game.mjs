// Fresh browser/context/server per flow, bounded waits and optional pixel rendering.
import { chromium } from "playwright";
import { serve } from "../../tools/serve.js";
import { launchArgs } from "../../tools/browser.js";
import { fileURLToPath } from "node:url";
export async function openGame(t, touch) {
  const draw = process.env.TEST_DRAW === "1";
  const { server, url } = await serve(fileURLToPath(new URL("../../dist/", import.meta.url)), 0);
  let browser;
  t.after(async () => {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
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
    viewport: touch ? { width: 844, height: 390 } : { width: 960, height: 600 },
    hasTouch: touch,
    isMobile: touch,
  });
  await context.addInitScript((draw) => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    if (!sessionStorage.getItem("test-seeded")) {
      sessionStorage.setItem("test-seeded", "1");
      localStorage.setItem(
        "riftline.save.v1",
        JSON.stringify({
          v: 1,
          game: "riftline",
          seen: { tutorial: true },
          settings: { quality: "battery", sfx: 0, music: 0, ambience: 0 },
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
  }, draw);
  const page = await context.newPage(),
    errors = [];
  page.setDefaultTimeout(draw ? 15000 : 6000);
  page.setDefaultNavigationTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__riftTest?.game && window.__riftTest.renderer);
  return {
    page,
    errors,
    press: (selector) => (touch ? page.locator(selector).first().tap() : page.locator(selector).first().click()),
  };
}
