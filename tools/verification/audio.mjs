// Audio correctness, not an automated music critic. Real samples check silence, NaNs, clipping,
// tails, continuous fire and track shutdown. Scheduling checks retain the real voice allocator.
// Small fresh-browser chunks bound native AudioNode/buffer retention. Style analysis lives in scripts/.
import assert from "node:assert/strict";
import { soundCache } from "./audio-cache.mjs";
import { withAudioPage } from "./audio-page.mjs";
const url = process.argv[2] || "http://localhost:8124/index.html";
const cache = await soundCache();
if (cache.data?.health) {
  console.log(`DEEP TEST: cached passing audio health (${cache.data.at}; exact inputs unchanged).`);
  process.exit(0);
}
const start = Date.now();
const result = { catalog: [], music: [], budget: [], continuity: null, fail: [] };
const names = await withAudioPage(url, () => window.__riftTest.game.sound.constructor.catalog().map((s) => s.name));
assert.ok(
  names.length > 0 && new Set(names).size === names.length,
  "Audio catalog must be nonempty and uniquely named",
);
const CHUNK = 24;
for (let at = 0; at < names.length; at += CHUNK) {
  const rows = await withAudioPage(
    url,
    async ({ at, count }) => {
      const E = window.__riftTest.game.sound.constructor;
      const rows = [],
        original = E.prototype.tone;
      let badFrequency = false;
      E.prototype.tone = function (freq, ...args) {
        if (!(freq >= 15 && freq <= 20000)) badFrequency = true;
        return original.call(this, freq, ...args);
      };
      try {
        for (const { name, spec } of E.catalog().slice(at, at + count)) {
          badFrequency = false;
          const r = await E.renderOffline({ ...spec, seed: 7 });
          rows.push({
            name,
            finite: r.finite,
            peak: r.peak,
            rms: r.rms,
            tail: r.maxEnd,
            music: !!spec.music,
            failed: r.failed,
            badFrequency,
          });
        }
      } finally {
        E.prototype.tone = original;
      }
      return rows;
    },
    { at, count: CHUNK },
  );
  for (const r of rows) {
    if (
      !r.finite ||
      r.failed ||
      r.badFrequency ||
      !(r.peak > 0.001 && r.peak < 0.95 && r.rms > 1e-5) ||
      (!r.music && r.tail > 2.05)
    )
      result.fail.push(`sound ${r.name}: ${JSON.stringify(r)}`);
  }
  result.catalog.push(...rows);
  console.log(`[audio] catalog ${result.catalog.length}/${names.length}`);
}
assert.deepEqual(
  result.catalog.map((r) => r.name),
  names,
  "Every catalog sound must be rendered exactly once",
);
for (const biome of ["yard", "vault", "marsh", "void", "club", "flats"]) {
  const part = await withAudioPage(
    url,
    async (biome) => {
      const E = window.__riftTest.game.sound.constructor,
        budget = [],
        music = [],
        fail = [];
      for (const [kind, heat, intensity] of [
        ["fight", 0, 1],
        ["fight", 0, 0.5],
        ["fight", 0, 0.1],
        ["boss", 0, 1],
        ["boss", 1, 1],
        ["boss", 2, 1],
      ]) {
        const spec = { music: kind, biome, heat, intensity },
          a = E.musicBudget({ ...spec, loops: 4 });
        budget.push({ biome, kind, heat, intensity, scheduled: a.scheduled, peak: a.peak });
        if (a.failed || !a.scheduled || a.skipped || a.shed || a.peak > 36) fail.push(`${biome}/${kind}: voice budget`);
        if (intensity === 1 && heat !== 1) {
          const plain = E.musicBudget(spec),
            flooded = E.musicBudget({ ...spec, flood: 24 });
          if (
            plain.scheduled !== flooded.scheduled ||
            JSON.stringify(plain.log) !== JSON.stringify(flooded.log) ||
            !flooded.dropped ||
            flooded.failed
          )
            fail.push(`${biome}/${kind}: sound flood changes or fails to stress music scheduling`);
        }
      }
      for (const kind of ["fight", "boss", "flood"]) {
        const actual = kind === "flood" ? "boss" : kind;
        const seconds = kind === "flood" ? 4 : (6 * 240) / E.trackInfo(actual, biome).bpm;
        const r = await E.renderOffline(
          {
            music: actual,
            biome,
            fromBar: actual === "fight" ? 4 : 0,
            intensity: 0.9,
            heat: kind === "flood" ? 2 : 0,
            flood: kind === "flood",
            stereo: true,
            wav: true,
            seed: 7,
          },
          seconds,
        );
        let rightPeak = 0,
          rightFinite = true;
        for (const sample of r.samplesR) {
          if (!Number.isFinite(sample)) rightFinite = false;
          rightPeak = Math.max(rightPeak, Math.abs(sample));
        }
        music.push({ biome, kind, peak: r.peak, rightPeak, rms: r.rms, notes: r.musicScheduled });
        if (
          !r.finite ||
          !rightFinite ||
          r.failed ||
          !(r.rms > 1e-5) ||
          r.peak >= 0.95 ||
          rightPeak >= 0.95 ||
          !r.musicScheduled ||
          r.musicSkipped ||
          r.musicShed
        )
          fail.push(`${biome}/${kind}: invalid, silent, clipping or missing music`);
      }
      // Real regression: old music and its delay must stop when a track is changed.
      if (["yard", "void", "vault"].includes(biome)) {
        const music = biome === "vault" ? "boss" : "fight";
        const spec = { music, biome, intensity: 0.9, heat: 0.5, wav: true, seed: 5, musicEnd: 6, noBed: true };
        const kept = (await E.renderOffline(spec, 10)).samples;
        const cut = (await E.renderOffline({ ...spec, quietAt: 6 }, 10)).samples;
        const rms = (x, a, b) => {
          let sum = 0;
          const i0 = Math.floor(a * 44100),
            i1 = Math.floor(b * 44100);
          for (let i = i0; i < i1; i++) sum += x[i] ** 2;
          return Math.sqrt(sum / (i1 - i0));
        };
        const before = rms(cut, 4.25, 6.25),
          after = rms(cut, 6.55, 8),
          ringing = rms(kept, 6.55, 8);
        if (!(after < before * 0.12 && ringing > after * 2)) fail.push(`${biome}: old track does not stop`);
      }
      return { budget, music, fail };
    },
    biome,
  );
  result.budget.push(...part.budget);
  result.music.push(...part.music);
  result.fail.push(...part.fail);
  console.log(`[audio] ${biome}: samples, stereo, flood, scheduling${part.fail.length ? " FAILED" : " passed"}`);
}
result.continuity = await withAudioPage(url, async () => {
  const E = window.__riftTest.game.sound.constructor,
    fail = [];
  for (const rate of [1, 0.5]) {
    const r = await E.renderOffline({
      noise: { dur: 1.9, vol: 0.2, opts: { type: "lowpass", f: 4000, rate } },
      seed: 7,
    });
    if (!(r.lastAudible > 1.2)) fail.push(`long noise at rate ${rate} is cut off`);
  }
  const flame = await E.renderOffline({ burst: { id: "flame", n: 26, interval: 1 / 15 }, wav: true, seed: 7 });
  const levels = [],
    win = 1764;
  for (let t = Math.round(0.5 * 44100); t + win <= Math.round(1.5 * 44100); t += win) {
    let sum = 0;
    for (let i = 0; i < win; i++) sum += flame.samples[t + i] ** 2;
    levels.push(Math.sqrt(sum / win));
  }
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const cv = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length) / (mean || 1);
  if (!(mean > 0.003 && cv < 0.3)) fail.push(`continuous flame is silent or pulses (${cv})`);
  return { cv, fail };
});
result.fail.push(...result.continuity.fail);
console.log(
  JSON.stringify(
    {
      sounds: result.catalog.length,
      musicRenders: result.music.length,
      budgets: result.budget.length,
      seconds: +((Date.now() - start) / 1000).toFixed(1),
      fail: result.fail,
    },
    null,
    2,
  ),
);
if (result.fail.length) process.exitCode = 1;
else {
  cache.save({ health: result });
  console.log("DEEP TEST: passed; audio correctness cached.");
}
