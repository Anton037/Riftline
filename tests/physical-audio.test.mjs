// Physical source integrity, deterministic fallback and bounded DSP memory without a browser timing dependency.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PhysicalVoices, physicalProfile } from "../src/audio/physical-voices.js";
import { PLACE_IDS } from "../src/audio/place.js";
import { SOURCE_CLIPS } from "../src/audio/source-bank.js";
const ctx = {
  sampleRate: 22050,
  createBuffer(ch, n, sr) {
    const data = new Float32Array(n);
    return { sampleRate: sr, length: n, duration: n / sr, getChannelData: () => data };
  },
};
test("recorded source regions fit the shipped PCM bank and contain real signal", () => {
  const file = fs.readFileSync(new URL("../public/audio/physical-bank.wav", import.meta.url));
  assert.equal(file.toString("ascii", 0, 4), "RIFF");
  assert.equal(file.readUInt32LE(24), 22050);
  const pcm = new Int16Array(file.buffer, file.byteOffset + 44, (file.length - 44) / 2);
  let lastEnd = 0;
  for (const clip of Object.values(SOURCE_CLIPS)) {
    const start = Math.round(clip.start * 22050),
      end = start + Math.round(clip.duration * 22050);
    assert.ok(start >= lastEnd && end <= pcm.length && end > start);
    assert.ok(pcm.subarray(start, end).some((v) => Math.abs(v) > 1000));
    lastEnd = end;
  }
});
test("physical voices produce finite, faded material bodies and bound their cache", () => {
  const bank = new PhysicalVoices(ctx, { decode: false });
  for (const id of [
    "pulse",
    "scatter",
    "tesla",
    "rail",
    "rocket",
    "disc",
    "flame",
    "hit",
    "dArmor",
    "dSquelch",
    "dShatter",
    "windHeavy",
    "tcPlate",
    "click",
    "step",
  ]) {
    const p = physicalProfile(id, { ground: "snow" }),
      a = bank.buffer(p, 1),
      b = bank.buffer(p, 1),
      data = a.getChannelData(0);
    assert.equal(a, b);
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some((v) => Math.abs(v) > 0.01));
    assert.equal(Math.abs(data[0]), 0);
    assert.ok(Math.abs(data.at(-1)) < 0.002);
  }
  for (let i = 0; i < 150; i++) bank.buffer({ ...physicalProfile("impact"), body: 80 + i }, i % 3);
  assert.ok(bank.buffers.size <= 48);
});
test("ambient weather, wildlife and machinery stay independent of weapon and impact transients", () => {
  for (const id of [
    "rainDrop",
    "gutter",
    "wind",
    "bird",
    "owl",
    "cricket",
    "frogChorus",
    "dog",
    "carPass",
    "helicopter",
    "horn",
    "siren",
    "radio",
    "lampBuzz",
  ]) {
    const p = physicalProfile(id, null, true),
      clean = new PhysicalVoices(ctx, { decode: false }),
      noisy = new PhysicalVoices(ctx, { decode: false });
    // A corrupt material bank must not turn an ambient call or gust into a weapon/metal sound.
    noisy.bank = { sampleRate: 22050, getChannelData: () => new Float32Array(22050).fill(0.9) };
    const a = clean.buffer(p, 1).getChannelData(0),
      b = noisy.buffer(p, 1).getChannelData(0);
    assert.deepEqual(a, b, id);
    assert.ok(a.every(Number.isFinite) && a.some((v) => Math.abs(v) > 0.01), id);
    assert.equal(Math.abs(a[0]), 0, id);
    assert.ok(Math.abs(a.at(-1)) < 0.002, id);
  }
});

test("hits and critical hits use the target material; only crystal targets use glass", () => {
  const families = {
    grunt: "hitArmor",
    sniper: "hitArmor",
    beacon: "hitArmor",
    swarmer: "hitOrganic",
    mender: "hitOrganic",
    carrier: "hitOrganic",
    core: "hitStone",
    tyrant: "hitStone",
    prism: "hitCrystal",
    wyrm: "hitCrystal",
    phantom: "hitEnergy",
  };
  for (const [type, family] of Object.entries(families)) {
    const hit = physicalProfile("hit", { type }),
      crit = physicalProfile("crit", { type });
    assert.equal(hit.family, family, type);
    assert.equal(crit.family, family, type);
    assert.equal(hit.sample === "glass", family === "hitCrystal", type);
    assert.ok(crit.gain > hit.gain && hit.dur <= 0.17, type);
  }
  assert.equal(physicalProfile("hit", { type: "grunt", shield: true }).family, "hitEnergy");
});

test("physical voice cache distinguishes filters and excitation without changing procedural weather", () => {
  const voices = new PhysicalVoices(ctx, { decode: false }),
    base = physicalProfile("pulse"),
    filtered = { ...base, lowpass: 900 },
    crackle = { ...base, recordGain: 0, arc: 0.6 };
  const a = voices.buffer(base, 1),
    b = voices.buffer(filtered, 1),
    c = voices.buffer(crackle, 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
  assert.equal(voices.buffer(filtered, 1), b);
  assert.ok(c.getChannelData(0).every(Number.isFinite));
});

test("prefix and place rules map movement, desert/volcanic cues and place accents cleanly", () => {
  assert.equal(physicalProfile("dash").family, "wind");
  assert.equal(physicalProfile("devilNear").family, "wind");
  assert.equal(physicalProfile("deny").family, "ui");
  assert.equal(physicalProfile("bcLock").family, "bcLock");
  assert.equal(physicalProfile("bcShatter").family, "bcShatter");
  assert.equal(physicalProfile("tsPyro").family, "tsPyro");
  assert.equal(physicalProfile("tsSun").family, "tsSun");
  assert.equal(physicalProfile("step", { ground: "frost" }).sample, "snow");
  assert.equal(physicalProfile("step", { ground: "acid" }).sample, "grass");
  for (const id of PLACE_IDS) {
    assert.notEqual(physicalProfile(id, null, true).family, "room", `place ${id} fell back to generic room`);
  }
});
