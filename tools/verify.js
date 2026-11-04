// Optional visual/audio verification, kept outside the short test suite.
import { spawn } from "node:child_process";
import path from "node:path";
import { serve } from "./serve.js";
const [kind, ...extra] = process.argv.slice(2);
if (!["visual", "audio", "audio-budget"].includes(kind)) {
  console.error("Use visual, audio or audio-budget");
  process.exit(2);
}
const build = spawn(process.execPath, ["build.js"], { stdio: "inherit" });
const built = await new Promise((resolve) => build.on("close", resolve));
if (built !== 0) process.exit(built || 1);
const { server, url } = await serve(path.resolve("dist"), 0);
const child = spawn(process.execPath, [path.resolve("tools/verification", `${kind}.mjs`), url, ...extra], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    child.kill(signal);
    server.close();
  });
child.on("close", (code) => {
  server.close();
  process.exitCode = code ?? 1;
});
