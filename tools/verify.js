// Optional visual/audio checks share a bounded process runner and an ephemeral local server.
import path from "node:path";
import { serve } from "./serve.js";
import { runNode } from "./process.js";
const [kind, ...extra] = process.argv.slice(2);
const suites = {
  visual: ["tools/verification/visual.mjs", 240000],
  equipment: ["tools/verification/equipment.mjs", 240000],
  audio: ["tools/verification/audio.mjs", 420000],
  "audio-budget": ["tools/verification/audio-budget.mjs", 180000],
  "probe-audio": ["scripts/rl-audio-check.mjs", 120000],
  mix: ["scripts/rl-mix-probe.mjs", 300000],
  music: ["scripts/rl-music-probe.mjs", 420000],
  place: ["scripts/rl-place-peaks.mjs", 180000],
};
if (!suites[kind]) {
  console.error(`Use ${Object.keys(suites).join(", ")}`);
  process.exit(2);
}
const built = await runNode(["build.js"]);
if (built !== 0) process.exit(built);
const { server, url } = await serve(path.resolve("dist"), 0);
try {
  const [script, timeout] = suites[kind];
  process.exitCode = await runNode([script, url, ...extra], { timeout });
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
