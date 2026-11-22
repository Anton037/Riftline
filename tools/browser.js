// Shared Chromium backend selection for browser checks and optional analysis tools.
export function launchArgs() {
  const mode = process.env.RIFT_RENDERER || "auto";
  if (mode === "swiftshader")
    return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (mode === "gpu") return ["--ignore-gpu-blocklist", "--enable-gpu"];
  if (mode !== "auto") throw new Error(`Unknown RIFT_RENDERER: ${mode}`);
  return ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader"];
}
export function launchOptions(extraArgs = []) {
  const opts = { args: [...launchArgs(), ...extraArgs] };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  return opts;
}
