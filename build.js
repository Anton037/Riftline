// Build: turns the readable sources into the deployable game in dist/.
//   src/main.js + the modules it imports (src/core, data, render, audio, ui) and three.js from
//   npm             -> dist/game-v<version>-<content hash>.js  (one file, bundled and minified by esbuild)
//   src/index.html, src/sw.js, src/build-info.json -> dist/ (placeholders filled in)
//   public/*          -> dist/ (icons, fonts, manifest; copied as they are)
// Version and build id live only in package.json ("version", "riftline.build"). The sources use
// the placeholders __RL_VERSION__, __RL_BUILD__, __RL_VERSION_DASHED__ and __RL_GAME_FILE__.
// Usage: node build.js [--watch]   (watch also serves dist/ on http://localhost:8124)

import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./tools/serve.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(ROOT, ...p);
const DIST = r("dist");
const watch = process.argv.includes("--watch");

function meta() {
  const pkg = JSON.parse(fs.readFileSync(r("package.json"), "utf8"));
  const version = pkg.version,
    build = pkg.riftline && pkg.riftline.build;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json version "${version}" is not x.y.z`);
  // 3.10.0: the version digits may be four (r3100 for 3.10.0)
  if (!/^r\d{3,4}a\d{4}[a-z]-r\d+$/.test(build || ""))
    throw new Error(`package.json riftline.build "${build}" does not look like r233a0926g-r1`);
  return { version, build, dashed: version.replace(/\./g, "-"), gameFile: "game-pending.js" };
}

// Replaces every placeholder; fails if one is left (typo) so a broken contract never ships.
function fill(text, m, name) {
  const out = text
    .replaceAll("__RL_VERSION_DASHED__", m.dashed)
    .replaceAll("__RL_VERSION__", m.version)
    .replaceAll("__RL_BUILD__", m.build)
    .replaceAll("__RL_GAME_FILE__", m.gameFile)
    .replaceAll("__RL_ASSETS__", m.assets);
  const left = out.match(/__RL_[A-Z_]+__/);
  if (left) throw new Error(`${name}: unknown placeholder ${left[0]}`);
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name),
      b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

async function build() {
  const t0 = Date.now();
  const m = meta();
  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(r("public"), DIST);

  // The game is one IIFE: src/main.js, the modules it imports and the parts of three.js they use
  // (the package from node_modules, version pinned in package.json). The version constants are plain identifiers
  // in the source; esbuild swaps them for string literals. The three.js license is in
  // public/THIRD-PARTY-NOTICES.txt, so the bundle carries no license comments.
  await esbuild.build({
    entryPoints: [r("src/main.js")],
    outfile: path.join(DIST, m.gameFile),
    bundle: true,
    format: "iife",
    minify: !watch && !process.env.RL_NO_MINIFY,
    target: "es2020",
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
    define: { __RL_VERSION__: JSON.stringify(m.version), __RL_BUILD__: JSON.stringify(m.build) },
  });

  // The bundle URL changes with its bytes, even when a developer forgets a version bump.
  const digest = (data) => createHash("sha256").update(data).digest("hex").slice(0, 16);
  const bundle = fs.readFileSync(path.join(DIST, m.gameFile));
  const pending = m.gameFile;
  m.gameFile = `game-v${m.version}-${digest(bundle)}.js`;
  fs.renameSync(path.join(DIST, pending), path.join(DIST, m.gameFile));
  // Include HTML, worker logic and public assets so non-JS changes also install a new snapshot.
  const hash = createHash("sha256");
  const hashDir = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) hashDir(file);
      else hash.update(path.relative(ROOT, file)).update("\0").update(fs.readFileSync(file)).update("\0");
    }
  };
  hashDir(DIST);
  for (const f of ["index.html", "sw.js", "build-info.json"]) hash.update(fs.readFileSync(r("src", f)));
  hash.update(JSON.stringify(m));
  m.assets = hash.digest("hex").slice(0, 16);

  for (const f of ["index.html", "sw.js", "build-info.json"]) {
    fs.writeFileSync(path.join(DIST, f), fill(fs.readFileSync(r("src", f), "utf8"), m, f));
  }
  // Small identity file used by startup diagnostics and the update handshake.
  const info = JSON.parse(fs.readFileSync(path.join(DIST, "build-info.json"), "utf8")); // must stay valid JSON
  info.assets = m.assets;
  fs.writeFileSync(path.join(DIST, "build-info.json"), JSON.stringify(info, null, 1) + "\n");

  // Offline contract: every file the service worker precaches must exist in dist/.
  const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
  const files = JSON.parse(sw.match(/const FILES = (\[[^\]]*\]);/)[1]);
  const missing = files.filter((f) => f !== "./" && !fs.existsSync(path.join(DIST, f)));
  if (missing.length) throw new Error(`sw.js precaches missing files: ${missing.join(", ")}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.webmanifest"), "utf8"));
  const icons = manifest.icons.map((i) => i.src).filter((f) => !fs.existsSync(path.join(DIST, f)));
  if (icons.length) throw new Error(`manifest icons missing: ${icons.join(", ")}`);

  const kb = (f) => `${(fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0)} KB`;
  console.log(
    `built Riftline ${m.version} (${m.build}) in ${Date.now() - t0}ms  ${m.gameFile} ${kb(m.gameFile)}, index.html ${kb("index.html")}`,
  );
}

await build();

if (watch) {
  let timer = null;
  fs.watch(r("src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  const { url } = await serve(DIST, 8124);
  console.log(`serving ${url} (rebuilds on change)`);
}
