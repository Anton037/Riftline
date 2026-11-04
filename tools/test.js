// One small test entry point: unit contracts plus two bounded browser flows; no historical chains.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
const allowed = new Set(["--unit", "--browser", "--no-build", "--draw"]);
if (args.some((a) => !allowed.has(a)) || (args.includes("--unit") && args.includes("--browser"))) {
  console.error("Use --unit, --browser, --no-build or --draw.");
  process.exit(2);
}
const files = fs
  .readdirSync("tests")
  .filter(
    (f) =>
      f.endsWith(".test.mjs") &&
      (!args.includes("--unit") || f !== "browser.test.mjs") &&
      (!args.includes("--browser") || f === "browser.test.mjs"),
  )
  .map((f) => path.join("tests", f));
if (!files.length) throw new Error("No tests selected");
let active;
const stop = () => {
  if (active?.pid)
    try {
      process.platform === "win32" ? active.kill("SIGKILL") : process.kill(-active.pid, "SIGKILL");
    } catch {}
};
for (const [name, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
])
  process.once(name, () => {
    stop();
    process.exit(code);
  });
const run = (argv, timeout) =>
  new Promise((resolve) => {
    active = spawn(process.execPath, argv, {
      stdio: "inherit",
      detached: process.platform !== "win32",
      env: { ...process.env, TEST_DRAW: args.includes("--draw") ? "1" : "0" },
    });
    const timer = setTimeout(() => {
      console.error(`Test command exceeded ${timeout / 1000}s`);
      stop();
    }, timeout);
    active.on("error", (e) => {
      console.error(e.message);
      clearTimeout(timer);
      resolve(1);
    });
    active.on("close", (code) => {
      clearTimeout(timer);
      active = null;
      resolve(code ?? 1);
    });
  });
const start = performance.now();
if (files.some((f) => f.endsWith("browser.test.mjs")) && !args.includes("--no-build")) {
  const code = await run(["build.js"], 30000);
  if (code) process.exit(code);
}
process.exitCode = await run(["--test", "--test-concurrency=1", ...files], args.includes("--draw") ? 150000 : 75000);
console.log(`Test run: ${((performance.now() - start) / 1000).toFixed(1)} s`);
