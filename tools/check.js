// Formatting and lint, followed by the one current test entry point.
import { spawnSync } from "node:child_process";
import path from "node:path";
const run = (...args) => {
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};
run(
  path.resolve("node_modules/prettier/bin/prettier.cjs"),
  "--check",
  "src/**/*.js",
  "tests/**/*.mjs",
  "tools/**/*.{js,mjs}",
  "scripts/**/*.mjs",
  "build.js",
  "eslint.config.mjs",
);
run(path.resolve("node_modules/eslint/bin/eslint.js"), ".");
run("tools/test.js");
