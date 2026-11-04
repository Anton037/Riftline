// Shared Chromium backend selection for browser checks and optional analysis tools.
export function launchArgs() {
  const mode = process.env.RIFT_RENDERER || "auto";
  if (mode === "swiftshader")
    return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (mode === "gpu") return ["--ignore-gpu-blocklist", "--enable-gpu"];
  if (mode !== "auto") throw new Error(`Unknown RIFT_RENDERER: ${mode}`);
  return ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader"];
}
export const launchArgsWith = (...extra) => [...new Set([...launchArgs(), ...extra.flat()])];
export const rendererMode = () => process.env.RIFT_RENDERER || "auto";
