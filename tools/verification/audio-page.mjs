// Audio-only pages: stop decorative animation once booted, retaining real WebAudio APIs.
import { chromium } from "playwright";
import { launchArgs } from "../browser.js";

export async function openAudioPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.requestAnimationFrame = (fn) => {
      const id = raf((t) => {
        pending.delete(id);
        fn(t);
      });
      pending.add(id);
      return id;
    };
    window.__stopAudioTestFrames = () => {
      for (const id of pending) cancel(id);
      pending.clear();
      window.requestAnimationFrame = () => 0;
    };
  });
  await page.goto(url, { timeout: 90000 });
  await page.waitForFunction(() => window.__riftTest?.game, null, { timeout: 90000 });
  await page.evaluate(() => window.__stopAudioTestFrames());
  return page;
}

export async function withAudioPage(url, fn, arg) {
  const browser = await chromium.launch({ args: launchArgs() });
  try {
    const page = await openAudioPage(browser, url);
    return await page.evaluate(fn, arg);
  } finally {
    await browser.close();
  }
}
