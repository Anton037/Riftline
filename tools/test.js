// One small test entry point: unit contracts plus bounded touch and worker checks; no historical chains.
import fs from "node:fs";
import path from "node:path";
import { runNode } from "./process.js";
const args = process.argv.slice(2);
const allowed = new Set(["--unit", "--browser", "--no-build", "--draw"]);
if (args.some((a) => !allowed.has(a)) || (args.includes("--unit") && args.includes("--browser"))) {
  console.error("Use --unit, --browser, --no-build or --draw.");
  process.exit(2);
}
const isBrowser = (f) => f === "browser.test.mjs" || f.endsWith(".browser.test.mjs");
const files = fs
  .readdirSync("tests")
  .filter(
    (f) =>
      f.endsWith(".test.mjs") &&
      (!args.includes("--unit") || !isBrowser(f)) &&
      (!args.includes("--browser") || isBrowser(f)),
  )
  .map((f) => path.join("tests", f));
if (!files.length) throw new Error("No tests selected");
const run = (argv, timeout) =>
  runNode(argv, {
    timeout,
    env: { ...process.env, TEST_DRAW: args.includes("--draw") ? "1" : "0" },
  });
const start = performance.now();
if (files.some((f) => isBrowser(path.basename(f))) && !args.includes("--no-build")) {
  const code = await run(["build.js"], 30000);
  if (code) process.exit(code);
}
process.exitCode = await run(["--test", "--test-concurrency=1", ...files], args.includes("--draw") ? 600000 : 75000);
console.log(`Test run: ${((performance.now() - start) / 1000).toFixed(1)} s`);
