// Frame caps must keep their average across display refresh rates without bursts after backgrounding.
import test from "node:test";
import assert from "node:assert/strict";
import { makePacer, paceFrame } from "../src/render/pacing.js";
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
