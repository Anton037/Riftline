// Bounded, repeatable CPU and WebGL workload measurements. Host timings are not device FPS claims.
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
import { launchArgs } from "../browser.js";
const [url = "http://localhost:8124/", tag = "current"] = process.argv.slice(2),
  out = `verification-output/${tag}-performance`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: launchArgs() });
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem("riftline.save.v1", JSON.stringify({ v: 1, game: "riftline", seen: { tutorial: true } }));
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) =>
      raf((t) => {
        if (!window.__perfManual) fn(t);
      });
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      window.__riftTest?.renderer?.finishAtlasReady &&
      window.__riftTest.renderer.arena.uniforms.uTerrainReady.value === 1,
  );
  await page.tap("body", { position: { x: 10, y: 10 } });
  await page.evaluate(() => {
    const T = window.__riftTest;
    T.game.startRun({});
    window.__perfManual = true;
    T.game.paused = true;
    window.__perfSetup = ({ biome, dense }) => {
      const w = new T.World({ seed: 731, weapon: dense ? "tesla" : "pulse", threat: 0, ws: {} }),
        r = T.renderer;
      w.route = [biome];
      w.startWave(2);
      w.plan = [];
      w.planIdx = 0;
      w.planTotal = 0;
      w.markers = [];
      w.bossPending = null;
      w.enemies = [];
      w.fx = [];
      w.traps = [];
      w.god = true;
      w.player.iT = 0;
      w.player.x = 0;
      w.player.y = 2;
      T.game.world = w;
      T.game.intro = null;
      const n = dense ? 120 : 64,
        types = ["grunt", "gunner", "brute", "bulwark", "striker", "splitter", "sniper", "bomber"];
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996,
          d = 4 + (i % 9) * 0.7,
          e = w.spawnEnemy(types[i % types.length], Math.cos(a) * d, 2 + Math.sin(a) * d, {});
        if (e) Object.assign(e, { spawnT: 0, hp: 1e6, maxHp: 1e6 });
      }
      const count = dense ? 420 : 64;
      for (let i = 0; i < count; i++) w.fire(i * 0.31);
      w.pb = w.pb.slice(0, count);
      w.pb.forEach((b, i) => Object.assign(b, { x: (i % 21) - 10, y: Math.floor(i / 21) - 5, age: 0.15 }));
      for (let i = 0; i < (dense ? 300 : 120); i++)
        w.shoot((i % 21) - 10, Math.floor(i / 21) - 5, i * 0.13, 5, 10, { src: "gunner" });
      w.hash.build(w.enemies);
      w.fx = [];
      r.resetCamera();
      r.focusOn(null);
      r.P.n = 0;
      r.rings = [];
      r.lines = [];
      r.flashes = [];
      r.corpses = [];
      r.smokeView.clear();
      r.abilityView.clear();
      r.time = 8;
      const color = r.arena.uniforms.uGrid.value;
      for (let i = 0; i < (dense ? 1000 : 400); i++)
        r.emit((i % 31) - 15, 0.4 + (i % 5) * 0.2, Math.floor(i / 31) - 10, 0.1, 0.2, 0.1, 10, 0.09, color, {
          drag: 0.1,
        });
      return w;
    };
  });
  const renderer = await page.evaluate(() => {
    const r = window.__riftTest.renderer.renderer,
      gl = r.getContext(),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      name: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      dpr: r.getPixelRatio(),
      shadows: r.shadowMap.enabled,
      maxParticles: window.__riftTest.renderer.maxParticles,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    };
  });
  const rows = [];
  for (const spec of [
    ...["city", "shelf", "marsh", "core", "caldera", "flats"].map((biome) => ({ biome, dense: false })),
    { biome: "city", dense: true },
  ]) {
    const row = await page.evaluate(async (spec) => {
      const T = window.__riftTest,
        r = T.renderer,
        input = { mx: 0.3, my: 0.2, auto: true, fire: false, dash: false };
      const quantile = (a, q) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
      const originalRandom = Math.random;
      let rng = 421;
      Math.random = () => {
        rng ^= rng << 13;
        rng ^= rng >>> 17;
        rng ^= rng << 5;
        return (rng >>> 0) / 4294967296;
      };
      const render = r.renderer.render;
      try {
        let w = window.__perfSetup(spec),
          sim = [];
        for (let i = 0; i < 180; i++) {
          const t = performance.now();
          w.step(1 / 60, input);
          sim.push(performance.now() - t);
          w.fx = [];
        }
        const trace = {
          x: w.player.x,
          y: w.player.y,
          hp: w.player.hp,
          enemies: w.enemies.length,
          pb: w.pb.length,
          eb: w.eb.length,
          rng: w.rng.state,
        };
        w = window.__perfSetup(spec);
        r.renderer.render = () => {};
        for (let i = 0; i < 24; i++) r.frame(1 / 60, w);
        const cpu = [],
          hud = [],
          pieces = {};
        const methods = ["drawWorld", "drawParticles", "updateLights", "drawDebris"];
        const originals = new Map();
        for (const k of methods)
          if (typeof r[k] === "function") {
            originals.set(k, r[k]);
            pieces[k] = 0;
            r[k] = function (...args) {
              const t = performance.now();
              try {
                return originals.get(k).apply(this, args);
              } finally {
                pieces[k] += performance.now() - t;
              }
            };
          }
        try {
          for (let i = 0; i < 180; i++) {
            let t = performance.now();
            r.frame(1 / 60, w);
            cpu.push(performance.now() - t);
            t = performance.now();
            T.ui.hud(w);
            hud.push(performance.now() - t);
          }
        } finally {
          for (const [k, fn] of originals) r[k] = fn;
        }
        for (const k in pieces) pieces[k] /= 180;
        r.renderer.render = render;
        for (let i = 0; i < 2; i++) r.frame(1 / 60, w);
        const gl = r.renderer.getContext(),
          draw = [],
          pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        // Readback includes completion of the full framebuffer; submission timings alone can hide queued work.
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        for (let i = 0; i < 3; i++) {
          const t = performance.now();
          r.frame(1 / 60, w);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          draw.push(performance.now() - t);
        }
        const prototype = Object.getPrototypeOf(r.scene.matrix),
          compose = prototype.compose,
          exp = Math.exp;
        let matrixCompositions = 0,
          exponentials = 0;
        prototype.compose = function (...args) {
          matrixCompositions++;
          return compose.apply(this, args);
        };
        Math.exp = (value) => {
          exponentials++;
          return exp(value);
        };
        try {
          r.frame(1 / 60, w);
        } finally {
          prototype.compose = compose;
          Math.exp = exp;
        }
        return {
          ...spec,
          matrixCompositions,
          exponentials,
          simulationMedian: quantile(sim, 0.5),
          simulationP95: quantile(sim, 0.95),
          renderCpuMedian: quantile(cpu, 0.5),
          renderCpuMean: cpu.reduce((sum, v) => sum + v, 0) / cpu.length,
          renderCpuP95: quantile(cpu, 0.95),
          hudMedian: quantile(hud, 0.5),
          gpuSynchronizedMedian: quantile(draw, 0.5),
          gpuSynchronizedP95: quantile(draw, 0.95),
          pieces,
          calls: r.renderer.info.render.calls,
          triangles: r.renderer.info.render.triangles,
          particles: r.P.n,
          enemies: w.enemies.length,
          pb: w.pb.length,
          eb: w.eb.length,
          trace,
        };
      } finally {
        r.renderer.render = render;
        Math.random = originalRandom;
      }
    }, spec);
    rows.push(row);
    console.log(JSON.stringify(row));

    assert.deepEqual(errors, []);
  }
  // Profile the renderer's actual production code after shader/geometry warm-up.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await page.evaluate(() => {
    const T = window.__riftTest,
      r = T.renderer,
      w = window.__perfSetup({ biome: "city", dense: true }),
      draw = r.renderer.render;
    r.renderer.render = () => {};
    try {
      for (let i = 0; i < 360; i++) {
        r.frame(1 / 60, w);
        T.ui.hud(w);
      }
    } finally {
      r.renderer.render = draw;
    }
  });
  const { profile } = await cdp.send("Profiler.stop");
  fs.writeFileSync(`${out}/cpu.cpuprofile`, JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame.functionName || "(anonymous)"])),
    counts = new Map();
  for (const id of profile.samples || []) counts.set(byId.get(id), (counts.get(byId.get(id)) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 18);
  fs.writeFileSync(
    `${out}/metrics.json`,
    JSON.stringify({ renderer, readbackIncludesTransfer: true, rows, top }, null, 2),
  );
  console.log(JSON.stringify({ renderer, top }));
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
