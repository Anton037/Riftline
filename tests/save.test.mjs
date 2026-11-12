// Save integrity, migrations and recovery: small real-store tests with isolated in-memory storage.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
globalThis.__RL_VERSION__ = pkg.version;
globalThis.__RL_BUILD__ = pkg.riftline.build;
const entries = new Map();
let blocked = false;
globalThis.localStorage = {
  get length() {
    return entries.size;
  },
  key: (i) => [...entries.keys()][i] ?? null,
  getItem: (k) => entries.get(k) ?? null,
  setItem(k, v) {
    if (blocked) throw new Error("storage full");
    entries.set(k, String(v));
  },
  removeItem: (k) => entries.delete(k),
};
const { SaveStore, SAVE_KEY, newSave, cleanRun } = await import("../src/core/save.js");
const reset = (raw) => {
  entries.clear();
  blocked = false;
  if (raw) entries.set(SAVE_KEY, raw);
};

test("current names preserve boss progress, medals, records and repeated run kills", () => {
  const raw = newSave();
  raw.stats.bosses = { kingpin: 4, forge: 2 };
  raw.stats.medals = { kingpin: { medal: 3, secs: 48, damage: 0 } };
  raw.milestones = { kingpin: true };
  raw.seen = { boss_kingpin: true, od_kingpin: true, boss_forge: true, od_forge: true, ev_raid: true, var_showy: true };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "pulse",
    wave: 19,
    hp: 100,
    bossKills: ["kingpin", "forge", "kingpin"],
    takenBy: { kingpin: 12 },
    hitLog: [{ src: "kingpin", dmg: 12 }],
  };
  raw.history = [{ weapon: "pulse", killer: "kingpin", wave: 19 }];
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  assert.deepEqual(store.data.stats.bosses, { tyrant: 4, wyrm: 2 });
  assert.equal(store.data.stats.medals.tyrant.medal, 3);
  assert.equal(store.data.milestones.tyrant, true);
  assert.deepEqual(store.data.seen, {}, "Codex discoveries are discarded");
  assert.deepEqual(store.data.run.bossKills, ["tyrant", "wyrm", "tyrant"]);
  assert.equal(store.data.run.hitLog[0].src, "tyrant");
  assert.equal(store.data.run.takenBy.tyrant, 12);
  assert.equal(store.data.history[0].killer, "tyrant");
  assert.deepEqual(cleanRun(raw.run).bossKills, store.data.run.bossKills);
  store.data.stats.bosses.tyrant++;
  store.save("test");
  const written = JSON.parse(entries.get(SAVE_KEY));
  assert.equal(written.stats.bosses.tyrant, 5, "new saves persist current IDs");
  assert.deepEqual(written.run.bossKills, ["tyrant", "wyrm", "tyrant"]);
  assert.equal(written.history[0].killer, "tyrant");
  assert.deepEqual(new SaveStore().data, store.data, "reload is idempotent and keeps all progress");
});

test("mixed alias imports combine counts and keep the best medal without mutating the source", () => {
  reset();
  const store = new SaveStore(),
    raw = newSave();
  raw.stats.bosses = { kingpin: 2, tyrant: 3 };
  raw.stats.medals = { kingpin: { medal: 3, secs: 52, damage: 0 }, tyrant: { medal: 2, secs: 30, damage: 15 } };
  const text = JSON.stringify(raw),
    parsed = store.parse(text);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.stats.bosses.tyrant, 5);
  assert.equal(parsed.data.stats.medals.tyrant.medal, 3);
  assert.equal(JSON.stringify(raw), text);
  assert.ok(store.restore(parsed));
  assert.equal(new SaveStore().data.stats.bosses.tyrant, 5);
});

test("removed content converts once without retaining old definitions or losing purchased progress", () => {
  const raw = newSave();
  raw.shards = 100;
  raw.weapons = { pulse: true, tesla: true, ion: true };
  raw.workshop = { nova: 2, riftBattery: 2, reactorCore: 1, routeScanner: 1 };
  raw.stats.bosses = { forge: 2, crucible: 1, wyrm: 4 };
  raw.stats.medals = { forge: { medal: 3, secs: 40, damage: 0 }, wyrm: { medal: 2, secs: 35, damage: 9 } };
  raw.milestones = { forge: true };
  raw.seen = { up_hammer: true };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "pulse",
    wave: 10,
    hp: 100,
    up: { hammer: 1 },
    dmgSrc: { hammer: 75 },
    banished: ["caliber"],
    bossKills: ["forge", "crucible", "wyrm"],
  };
  raw.history = [{ weapon: "ion", killer: "forge", build: ["hammer", "kinetic"], wave: 10 }];
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  assert.equal(store.data.shards, 100 + 1250 + 260 + 540 + 1600 + 1800);
  assert.deepEqual(store.data.workshop, { nova: 2 });
  assert.deepEqual(store.data.stats.bosses, { wyrm: 7 });
  assert.equal(store.data.stats.medals.wyrm.medal, 3);
  assert.equal(store.data.milestones.wyrm, true);
  assert.deepEqual(store.data.run.bossKills, ["wyrm", "wyrm", "wyrm"]);
  assert.deepEqual(store.data.run.up, { shockdash: 2 });
  assert.deepEqual(store.data.seen, {});
  assert.deepEqual(store.data.run.dmgSrc, { shockdash: 75 });
  assert.deepEqual(store.data.run.banished, ["dmg"]);
  assert.equal(store.data.history[0].weapon, "tesla");
  assert.equal(store.data.history[0].killer, "wyrm");
  assert.deepEqual(store.data.history[0].build, ["shockdash", "dmg"]);
  assert.doesNotMatch(store.text(), /"(?:forge|crucible|hammer|ion|riftBattery|reactorCore|routeScanner)"/);
  store.save("test");
  assert.deepEqual(new SaveStore().data, store.data, "conversion must never refund twice");
  assert.deepEqual(cleanRun({ ...raw.run, up: {}, offer: ["hammer"] }).offer, ["shockdash"]);
  assert.deepEqual(cleanRun({ ...raw.run, up: {} }).banished, ["dmg"]);
});

test("progress and settings survive a store round-trip and settings reset", () => {
  reset();
  const store = new SaveStore();
  store.data.shards = 1234;
  store.data.settings.music = 0.2;
  store.save("test");
  const loaded = new SaveStore();
  assert.equal(loaded.data.shards, 1234);
  assert.equal(loaded.data.settings.music, 0.2);
  loaded.resetSettings();
  assert.equal(new SaveStore().data.shards, 1234);
  assert.deepEqual(new SaveStore().data.settings, newSave().settings);
});

test("old saves migrate and unsupported settings are discarded", () => {
  reset(fs.readFileSync(new URL("fixtures/old-save.json", import.meta.url), "utf8"));
  const store = new SaveStore();
  assert.ok(store.data.weapons.tesla);
  assert.equal(store.data.weapon, "tesla");
  for (const key of ["zoom", "contrast", "shake", "timer", "fps", "quality"]) assert.ok(!(key in store.data.settings));
  assert.ok(store.data.shards > 0);
  assert.ok(store.data.run);
});

test("an older build preserves unknown data written by a future build", () => {
  const future = { ...newSave(), ver: "99.0.0", shards: 77, cosmetics: { trail: "future" } };
  reset(JSON.stringify(future));
  const store = new SaveStore();
  store.data.shards++;
  store.save("test");
  const saved = JSON.parse(entries.get(SAVE_KEY));
  assert.equal(saved.shards, 78);
  assert.deepEqual(saved.cosmetics, future.cosmetics);
});

test("corrupt saves are backed up, or held untouched when storage is full", () => {
  const broken = '{"v":1,"game":"riftline","shards":';
  reset(broken);
  const recovered = new SaveStore();
  recovered.save("test");
  assert.ok([...entries].some(([k, v]) => k.startsWith(SAVE_KEY + ".backup-") && v === broken));
  reset(broken);
  blocked = true;
  const held = new SaveStore();
  blocked = false;
  held.save("test");
  assert.equal(entries.get(SAVE_KEY), broken);
  assert.equal(held.storageOk, false);
});

test("confirmed import and reset recover held saves; failed replacements preserve progress", () => {
  const broken = '{"v":1,"game":"riftline","shards":';
  for (const reason of ["import", "reset"]) {
    reset(broken);
    blocked = true;
    const store = new SaveStore();
    const previous = store.data;
    const imported = store.parse(JSON.stringify({ ...newSave(), shards: 77 }));
    const replace = () => (reason === "reset" ? store.reset() : store.restore(imported));
    assert.equal(replace(), false);
    assert.equal(store.data, previous);
    assert.equal(entries.get(SAVE_KEY), broken);
    blocked = false;
    assert.equal(replace(), true);
    assert.equal(store.storageOk, true);
    assert.equal(new SaveStore().data.shards, reason === "reset" ? 0 : 77);
    store.data.shards++;
    store.save("test");
    assert.equal(new SaveStore().data.shards, reason === "reset" ? 1 : 78);
  }
});

test("unusable save identities are backed up before autosave replaces them", () => {
  for (const data of [[], {}, { ...newSave(), game: "other" }, { ...newSave(), v: 2 }]) {
    const raw = JSON.stringify(data);
    reset(raw);
    const store = new SaveStore();
    store.save("test");
    assert.ok([...entries].some(([k, v]) => k.startsWith(SAVE_KEY + ".backup-") && v === raw));
  }
});

test("frame rate limits migrate independently of removed graphics presets", () => {
  for (const frameRate of [30, 60, 120, true, 59, "120", null]) {
    const raw = newSave();
    raw.settings = { ...raw.settings, quality: "battery", frameRate };
    reset(JSON.stringify(raw));
    const store = new SaveStore();
    assert.equal(store.data.settings.frameRate, [30, 60, 120].includes(frameRate) ? frameRate : 60);
    assert.ok(!("quality" in store.data.settings));
    store.save("test");
    assert.equal(new SaveStore().data.settings.frameRate, store.data.settings.frameRate);
  }
});

test("removed modes and discovery tracking leave a playable normal checkpoint", () => {
  const raw = newSave();
  raw.pacts = ["glass"];
  raw.stats.daily = { key: "2026-11-12", wave: 8 };
  raw.stats.weekly = { key: "2026-W46", wave: 10 };
  raw.seen = {
    tutorial: true,
    enemy_grunt: true,
    boss_warden: true,
    up_dmg: true,
    ev_blackout: true,
    tip_dash: true,
    "news_4.1.1": true,
  };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "pulse",
    wave: 8,
    hp: 90,
    up: { dmg: 2 },
    daily: "2026-11-12",
    weekly: "2026-W46",
    pacts: ["glass"],
    startMods: { armored: 1 },
  };
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  assert.deepEqual(store.data.seen, { tutorial: true, tip_enemy_grunt: true, tip_dash: true, "news_4.1.1": true });
  assert.equal(store.data.run.wave, 8);
  assert.deepEqual(store.data.run.up, { dmg: 2 });
  assert.doesNotMatch(store.text(), /"(?:daily|weekly|pacts|startMods|boss_warden|up_dmg|ev_blackout)"/);
  store.save("test");
  assert.deepEqual(new SaveStore().data, store.data);
});
