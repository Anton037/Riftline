// Phase-2 one-off: capture the home menu screen for UI review.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve } from "../tools/serve.js";
import { launchArgs } from "../tools/browser.js";

const { server, url } = await serve(path.resolve("dist"), 0);
const base = `http://localhost:${url ? new URL(url).port : 8124}/index.html`;
const out = process.argv[3] || "verification-output/home-ui.png";
fs.mkdirSync("verification-output", { recursive: true });
const browser = await chromium.launch({ args: launchArgs() });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(base);
await page.waitForFunction(() => window.__riftTest?.renderer, null, { timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) {
  console.log("ERRORS:", errors.slice(0, 5));
  process.exit(1);
}
console.log("home captured ->", out);
server.closeAllConnections();
await new Promise((r) => server.close(r));
