// Bounded Node commands with process-tree cleanup, including a failed probe's Chromium children.
import { spawn, spawnSync } from "node:child_process";

export function runNode(args, { timeout = 30000, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env, detached: process.platform !== "win32" });
    let timedOut = false,
      interrupted = 0,
      finished = false;
    const stop = () => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32")
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* The process tree may already have exited. */
      }
    };
    const onInterrupt = () => {
      stop();
      interrupted = 130;
    };
    const onTerminate = () => {
      stop();
      interrupted = 143;
    };
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`Command exceeded ${timeout / 1000}s: ${args[0]}`);
      stop();
    }, timeout);
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stop();
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
      resolve(interrupted || (timedOut ? 124 : code));
    };
    child.once("error", (error) => {
      console.error(error.message);
      finish(1);
    });
    child.once("close", (code) => finish(code ?? 1));
  });
}
