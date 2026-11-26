// Frame caps must keep their average across display refresh rates without bursts after backgrounding.
import test from "node:test";
import assert from "node:assert/strict";
import { makePacer, paceFrame } from "../src/render/pacing.js";
import { WebGL2Engine } from "../src/engine/webgl2.js";
test("FPS limits follow elapsed time on 30–144 Hz displays", () => {
  for (const hz of [30, 60, 90, 120, 144])
    for (const fps of [30, 60, 120]) {
      const p = makePacer();
      let drawn = 0;
      for (let i = 0; i < hz * 10; i++) if (paceFrame(p, 100 + (i * 1000) / hz, fps)) drawn++;
      assert.ok(Math.abs(drawn - Math.min(hz, fps) * 10) <= 1, `${fps} FPS at ${hz} Hz: ${drawn}`);
    }
});
test("changing limits and resuming discard missed deadlines", () => {
  const p = makePacer();
  assert.equal(paceFrame(p, 100, 30), true);
  assert.equal(paceFrame(p, 108, 30), false);
  assert.equal(paceFrame(p, 110, 120), true);
  assert.equal(paceFrame(p, 111, 120), false);
  assert.equal(paceFrame(p, 10000, 60), true);
  assert.equal(paceFrame(p, 10001, 60), false);
});
test("mobile 60 Hz rAF jitter does not cause false half-rate frame drops", () => {
  const p = makePacer();
  const jitter = [0, -1.2, 0.9, -0.8, 1.1, -1.4, 0.6, -0.5];
  let drawn = 0;
  for (let i = 0; i < 600; i++) {
    const t = 100 + (i * 1000) / 60 + jitter[i % jitter.length];
    if (paceFrame(p, t, 60)) drawn++;
  }
  assert.equal(drawn, 600);
});

test("60.2 Hz display does not periodically skip frames under a 60 FPS limit", () => {
  const p = makePacer();
  let drawn = 0;
  for (let i = 0; i < 602; i++) {
    if (paceFrame(p, 100 + (i * 1000) / 60.2, 60)) drawn++;
  }
  assert.equal(drawn, 602);
});

test("adaptive resolution respects the display and FPS cap, and recovers after sustained smooth frames", () => {
  const pacer = makePacer();
  const engine = {
    adaptiveScale: true,
    isMobile: true,
    gl: { isContextLost: () => false },
    renderScale: 1,
    _targetFrameMs: 0,
    _lastScaleChangeTs: 0,
    _lastUpscaleTs: -Infinity,
    _initPostTargets() {},
  };
  let now = 0;
  function renderFor(hz, cap, seconds) {
    for (let i = 0; i < hz * seconds; i++) {
      now += 1000 / hz;
      if (paceFrame(pacer, now, cap)) {
        WebGL2Engine.prototype.updateAdaptiveScale.call(engine, now, Math.max(1000 / pacer.limit, pacer.refreshMs));
      }
    }
    return engine.renderScale;
  }
  assert.equal(renderFor(60, 120, 6), 1, "a 60 Hz display should stay sharp at the 120 FPS limit");
  assert.equal(renderFor(60, 30, 3), 1, "the 30 FPS limit should be respected even on a faster display");
  assert.equal(renderFor(30, 60, 8), 0.65, "sustained missed frames should lower resolution");
  now += 2000;
  assert.equal(renderFor(60, 60, 11), 1, "frames meeting their budget should restore resolution");
  assert.equal(renderFor(120, 120, 2), 1, "a faster display cadence should be learned");
  assert.ok(pacer.refreshMs < 9);
  assert.equal(renderFor(5, 60, 8), 0.65, "sustained severe stalls should still lower resolution");
});

test("the pacer has a usable resolution budget before it measures a fast display", () => {
  const p = makePacer();
  for (let i = 0; i < 10; i++) paceFrame(p, i * 250, 60);
  assert.equal(p.refreshMs, 1000 / 30);
});
