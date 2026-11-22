// Physical source integrity, deterministic fallback and bounded DSP memory without a browser timing dependency.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
import { PhysicalVoices, physicalProfile } from "../src/audio/physical-voices.js";
import { PLACE_IDS, SCAPE } from "../src/audio/place.js";
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
    "galleryChime",
    "kilnResonance",
    "inlayCharge",
    "stoneEcho",
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

test("Lantern Courtyard ambience uses resonators and leaves illumination to the arena", () => {
  const courtyard = SCAPE.courtyard;
  for (const { id } of courtyard.far) assert.ok(PLACE_IDS.includes(id));
  assert.equal(physicalProfile("galleryChime", null, true).model, "ceramic");
  assert.equal(physicalProfile("kilnResonance", null, true).model, "ceramic");
  assert.ok(courtyard.far.every((cue) => !("light" in cue)));
});

test("all 18 biome trap sounds and 6 mine arming voices synthesize finite non-silent buffers", async () => {
  const { RL_TRAP_SOUND } = await import("../src/audio/sound.js");
  const { TRAP_SKINS } = await import("../src/core/traps.js");
  const bank = new PhysicalVoices(ctx, { decode: false });
  assert.equal(Object.keys(RL_TRAP_SOUND).length, 18, "all 18 biome traps must have sound entries");
  for (const [skin, cues] of Object.entries(RL_TRAP_SOUND)) {
    for (const cueId of [cues.warn, cues.fire].filter(Boolean)) {
      const p = physicalProfile(cueId, { delay: 0.4 });
      const data = bank.buffer(p, 0).getChannelData(0);
      assert.ok(data.every(Number.isFinite), `${skin}/${cueId}: non-finite samples`);
      assert.ok(
        data.some((v) => Math.abs(v) > 0.005),
        `${skin}/${cueId}: silent buffer`,
      );
    }
    if (TRAP_SKINS[skin]?.fam === "mine") {
      const arm = physicalProfile("tArm", skin);
      assert.equal(arm.family, `arm:${skin}`, `${skin}: missing dedicated mine arm voice`);
      const data = bank.buffer(arm, 0).getChannelData(0);
      assert.ok(data.every(Number.isFinite) && data.some((v) => Math.abs(v) > 0.005), `${skin}: silent tArm`);
    }
  }
});

test("regression: physical audio voice lookup maps bOverdrive, bRing, shieldPop, tsRiftMine and hover cleanly", () => {
  const overdrive = physicalProfile("bOverdrive");
  assert.equal(overdrive.warn, true, "bOverdrive must trigger boss warning profile");
  const ring = physicalProfile("bRing");
  assert.notEqual(ring.family, "ui", "bRing must map to a dedicated combat cue, not UI fallback");
  assert.equal(physicalProfile("shieldPop").family, "armor", "shieldPop must map to armor, not organic pop");
  assert.equal(physicalProfile("tsRiftMine").family, "tsRiftMine", "tsRiftMine must match its dedicated riftmine rule");
  const hover = physicalProfile("hover");
  assert.equal(hover.family, "ui", "hover must be a gentle wooden UI click, not a wind gust");
  assert.ok(hover.dur <= 0.05 && hover.gain <= 0.08, "hover click must stay subtle and brief");
});
