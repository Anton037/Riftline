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
const { SaveStore, SAVE_KEY, SAVE_TEXT_LIMIT, newSave, cleanRun } = await import("../src/core/save.js");
const reset = (raw) => {
  entries.clear();
  blocked = false;
  if (raw) entries.set(SAVE_KEY, raw);
};

test("current names preserve boss progress, medals, records and repeated run kills", () => {
  const raw = newSave();
  raw.stats.bosses = { colossus: 4, forge: 2 };
  raw.stats.medals = { colossus: { medal: 3, secs: 48, damage: 0 } };
  raw.milestones = { colossus: true };
  raw.seen = {
    boss_colossus: true,
    od_colossus: true,
    boss_forge: true,
    od_forge: true,
    ev_cinder: true,
    var_showy: true,
  };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "lanternGun",
    wave: 19,
    hp: 100,
    bossKills: ["colossus", "forge", "colossus"],
    takenBy: { colossus: 12 },
    hitLog: [{ src: "colossus", dmg: 12 }],
  };
  raw.history = [{ weapon: "lanternGun", killer: "colossus", wave: 19 }];
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  assert.deepEqual(store.data.stats.bosses, { emberKing: 4, sandDragon: 2 });
  assert.equal(store.data.stats.medals.emberKing.medal, 3);
  assert.equal(store.data.milestones.emberKing, true);
  assert.deepEqual(store.data.seen, {}, "Codex discoveries are discarded");
  assert.deepEqual(store.data.run.bossKills, ["emberKing", "sandDragon", "emberKing"]);
  assert.equal(store.data.run.hitLog[0].src, "emberKing");
  assert.equal(store.data.run.takenBy.emberKing, 12);
  assert.equal(store.data.history[0].killer, "emberKing");
  assert.deepEqual(cleanRun(raw.run).bossKills, store.data.run.bossKills);
  store.data.stats.bosses.emberKing++;
  store.save("test");
  const written = JSON.parse(entries.get(SAVE_KEY));
  assert.equal(written.stats.bosses.emberKing, 5, "new saves persist current IDs");
  assert.deepEqual(written.run.bossKills, ["emberKing", "sandDragon", "emberKing"]);
  assert.equal(written.history[0].killer, "emberKing");
  assert.deepEqual(new SaveStore().data, store.data, "reload is idempotent and keeps all progress");
});

test("mixed alias imports combine counts and keep the best medal without mutating the source", () => {
  reset();
  const store = new SaveStore(),
    raw = newSave();
  raw.stats.bosses = { colossus: 2, emberKing: 3 };
  raw.stats.medals = { colossus: { medal: 3, secs: 52, damage: 0 }, emberKing: { medal: 2, secs: 30, damage: 15 } };
  const text = JSON.stringify(raw),
    parsed = store.parse(text);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.stats.bosses.emberKing, 5);
  assert.equal(parsed.data.stats.medals.emberKing.medal, 3);
  assert.equal(JSON.stringify(raw), text);
  assert.ok(store.restore(parsed));
  assert.equal(new SaveStore().data.stats.bosses.emberKing, 5);
});

test("removed content converts once without retaining old definitions or losing purchased progress", () => {
  const raw = newSave();
  raw.shards = 100;
  raw.weapons = { lanternGun: true, sparkWand: true, ion: true };
  raw.workshop = { fireBurst: 2, riftBattery: 2, reactorCore: 1, routeScanner: 1 };
  raw.stats.bosses = { forge: 2, crucible: 1, sandDragon: 4 };
  raw.stats.medals = { forge: { medal: 3, secs: 40, damage: 0 }, sandDragon: { medal: 2, secs: 35, damage: 9 } };
  raw.milestones = { forge: true };
  raw.seen = { up_hammer: true };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "lanternGun",
    wave: 10,
    hp: 100,
    up: { hammer: 1 },
    dmgSrc: { hammer: 75 },
    banished: ["caliber"],
    bossKills: ["forge", "crucible", "sandDragon"],
  };
  raw.history = [{ weapon: "ion", killer: "forge", build: ["hammer", "kinetic"], wave: 10 }];
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  assert.equal(store.data.shards, 100 + 1250 + 260 + 540 + 1600 + 1800);
  assert.deepEqual(store.data.workshop, { fireBurst: 2 });
  assert.deepEqual(store.data.stats.bosses, { sandDragon: 7 });
  assert.equal(store.data.stats.medals.sandDragon.medal, 3);
  assert.equal(store.data.milestones.sandDragon, true);
  assert.deepEqual(store.data.run.bossKills, ["sandDragon", "sandDragon", "sandDragon"]);
  assert.deepEqual(store.data.run.up, { shockDash: 2 });
  assert.deepEqual(store.data.seen, {});
  assert.deepEqual(store.data.run.dmgSrc, { shockDash: 75 });
  assert.deepEqual(store.data.run.banished, ["dmg"]);
  assert.equal(store.data.history[0].weapon, "sparkWand");
  assert.equal(store.data.history[0].killer, "sandDragon");
  assert.deepEqual(store.data.history[0].build, ["shockDash", "dmg"]);
  assert.doesNotMatch(store.text(), /"(?:forge|crucible|hammer|ion|riftBattery|reactorCore|routeScanner)"/);
  store.save("test");
  assert.deepEqual(new SaveStore().data, store.data, "conversion must never refund twice");
  assert.deepEqual(cleanRun({ ...raw.run, up: {}, offer: ["hammer"] }).offer, ["shockDash"]);
  assert.deepEqual(cleanRun({ ...raw.run, up: {} }).banished, ["dmg"]);
});

test("progress and settings survive a store round-trip and settings reset", () => {
  reset();
  const store = new SaveStore();
  store.data.shards = 1234;
  store.data.settings.music = 0.2;
  store.data.settings.performanceOverlay = true;
  store.save("test");
  const loaded = new SaveStore();
  assert.equal(loaded.data.shards, 1234);
  assert.equal(loaded.data.settings.music, 0.2);
  assert.equal(loaded.data.settings.performanceOverlay, true);
  loaded.resetSettings();
  assert.equal(new SaveStore().data.shards, 1234);
  assert.deepEqual(new SaveStore().data.settings, newSave().settings);
});

test("old saves migrate and unsupported settings are discarded", () => {
  reset(fs.readFileSync(new URL("fixtures/old-save.json", import.meta.url), "utf8"));
  const store = new SaveStore();
  assert.ok(store.data.weapons.sparkWand);
  assert.equal(store.data.weapon, "sparkWand");
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

test("save reads and imports discard reserved record keys and preserve valid progress", () => {
  const progress = newSave();
  progress.shards = 42;
  progress.stats.medals = Object.fromEntries([
    ["__proto__", { medal: 1, secs: 60 }],
    ["constructor", { medal: 1, secs: 60 }],
    ["colossus", { medal: {}, secs: [] }],
    ["emberKing", { medal: 2, secs: 51 }],
  ]);
  progress.run = { v: 1, seed: 2, weapon: ["pulse"], wave: 5, hp: 100 };
  const text = JSON.stringify(progress);
  reset(text);
  const store = new SaveStore();
  const imported = store.parse(text);
  assert.equal(imported.ok, true);
  for (const data of [store.data, imported.data]) {
    assert.equal(data.shards, 42);
    assert.equal(Object.getPrototypeOf(data.stats.medals), Object.prototype);
    assert.deepEqual(data.stats.medals, { emberKing: { medal: 2, secs: 51, damage: 0 } });
    assert.equal(data.run, null);
  }
  assert.deepEqual(store.parse(text.padEnd(SAVE_TEXT_LIMIT + 1)), { ok: false });
  assert.equal(entries.get(SAVE_KEY), text);
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

test("a failed corrupt-save backup preserves the existing recovery copies", () => {
  const broken = '{"v":1,';
  reset(broken);
  for (let i = 1; i <= 3; i++) entries.set(`${SAVE_KEY}.backup-${i}`, `backup ${i}`);
  const previous = [...entries];
  blocked = true;
  try {
    const held = new SaveStore();
    assert.equal(held.held, true);
    assert.deepEqual([...entries], previous);
  } finally {
    blocked = false;
  }
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

test("shared progress is refreshed before a local purchase even before the storage event arrives", () => {
  reset(JSON.stringify({ ...newSave(), shards: 80 }));
  const shop = new SaveStore();
  const run = new SaveStore();
  run.data.shards = 121;
  run.data.trapMode = "impossible";
  run.save("run-end");
  assert.equal(shop.syncForeign(), true);
  shop.data.shards -= 21;
  shop.data.workshop.healthCoat = 1;
  shop.save("workshop");
  const settled = new SaveStore().data;
  assert.equal(settled.shards, 100);
  assert.equal(settled.workshop.healthCoat, 1);
  assert.equal(settled.trapMode, "impossible");
});

test("a stale pagehide preserves shared progress and a cleared checkpoint", () => {
  const initial = newSave();
  initial.shards = 30;
  initial.run = { v: 1, seed: 731, weapon: "lanternGun", wave: 2, hp: 100 };
  initial.seen.tutorial = true;
  reset(JSON.stringify(initial));
  const finishingTab = new SaveStore();
  const staleTab = new SaveStore();
  finishingTab.data.shards = 120;
  finishingTab.data.stats.kills = 25;
  finishingTab.data.run = null;
  finishingTab.data.settings.music = 0.3;
  finishingTab.data.seen.tutorial = false;
  finishingTab.save("run-end");

  staleTab.data.settings.sfx = 0.5;
  staleTab.save("pagehide");
  const saved = new SaveStore().data;
  assert.equal(saved.shards, 120);
  assert.equal(saved.stats.kills, 25);
  assert.equal(saved.run, null);
  assert.equal(saved.settings.music, 0.3);
  assert.equal(saved.settings.sfx, 0.5);
  assert.equal(saved.seen.tutorial, undefined);
});

test("a new checkpoint survives synchronization with a different tab's purchase", () => {
  const initial = newSave();
  initial.shards = 90;
  reset(JSON.stringify(initial));
  const shop = new SaveStore();
  const run = new SaveStore();
  shop.data.shards = 30;
  shop.data.workshop.healthCoat = 1;
  shop.save("workshop");

  run.data.run = { v: 1, seed: 731, weapon: "lanternGun", wave: 3, hp: 100 };
  run.data.seen.tip_enemy_kettleGuard = true;
  run.save("wave");
  const saved = new SaveStore().data;
  assert.equal(saved.shards, 30);
  assert.equal(saved.workshop.healthCoat, 1);
  assert.equal(saved.run.wave, 3);
  assert.equal(saved.seen.tip_enemy_kettleGuard, true);
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
    boss_bellkeeper: true,
    up_dmg: true,
    ev_duskfall: true,
    tip_dash: true,
    "news_4.1.1": true,
  };
  raw.run = {
    v: 1,
    seed: 731,
    weapon: "lanternGun",
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
  assert.deepEqual(store.data.seen, {
    tutorial: true,
    tip_enemy_kettleGuard: true,
    tip_dash: true,
    "news_4.1.1": true,
  });
  assert.equal(store.data.run.wave, 8);
  assert.deepEqual(store.data.run.up, { dmg: 2 });
  assert.doesNotMatch(store.text(), /"(?:daily|weekly|pacts|startMods|boss_bellkeeper|up_dmg|ev_duskfall)"/);
  store.save("test");
  assert.deepEqual(new SaveStore().data, store.data);
});

test("5.1 saves keep equipment, choices, boss records, forge purchases, and button positions under the new names", () => {
  const raw = newSave();
  raw.ver = "5.1.1";
  raw.weapon = "tesla";
  raw.weapons = { pulse: true, tesla: true };
  raw.workshop = { hull: 2, nova: 1, banish: 1 };
  raw.stats.bosses = { prism: 3, core: 1 };
  raw.stats.clearsBy = { tesla: 3, sparkWand: 2 };
  raw.stats.bestBy = { tesla: 40, sparkWand: 32 };
  raw.milestones = { prism: true };
  raw.seen = { tip_enemy_grunt: true, tip_nova: true };
  raw.history = [{ weapon: "tesla", killer: "core", build: ["cryo", "multishot"], wave: 20 }];
  const point = { x: 0.4, y: 0.5, s: 1 };
  raw.settings.hudLayout = { landscape: { dash: point, nova: point, gadget: point, pause: point } };
  raw.run = {
    v: 1,
    seed: 731,
    wave: 5,
    hp: 57,
    weapon: "tesla",
    nova: 80,
    up: { cryo: 1, multishot: 2 },
    offer: ["cryo", "arc"],
    banished: ["payload"],
    anvil: ["ward", "shuffle"],
    bossKills: ["bellkeeper"],
  };
  reset(JSON.stringify(raw));
  const store = new SaveStore();
  const { data } = store;
  assert.equal(data.weapon, "sparkWand");
  assert.deepEqual(data.workshop, { healthCoat: 2, fireBurst: 1, seal: 1 });
  assert.deepEqual(data.stats.bosses, { iceCrystal: 3, starHeart: 1 });
  assert.deepEqual(data.stats.clearsBy, { sparkWand: 5 });
  assert.deepEqual(data.stats.bestBy, { sparkWand: 40 });
  assert.deepEqual(data.milestones, { iceCrystal: true });
  assert.deepEqual(data.seen, { tip_enemy_kettleGuard: true, tip_fireBurst: true });
  assert.equal(data.history[0].killer, "starHeart");
  assert.deepEqual(data.history[0].build, ["iceShot", "extraShots"]);
  assert.deepEqual(data.settings.hudLayout.landscape.gravityBell, point);
  assert.deepEqual(data.settings.hudLayout.landscape.fireBurst, point);
  assert.equal(data.run.fireBurst, 80);
  assert.deepEqual(data.run.up, { iceShot: 1, extraShots: 2 });
  assert.deepEqual(data.run.offer, ["iceShot", "sparkChain"]);
  assert.deepEqual(data.run.banished, ["blastShot"]);
  assert.deepEqual(data.run.anvil, ["repair", "extraReroll"]);
  assert.equal(data.run.bossKills[0], "bellKeeper");
  assert.equal(store.save("test"), true);
  assert.deepEqual(new SaveStore().data, data);
});

test("corrupt-save backups remain readable after reload and oversized stat maps are bounded", () => {
  reset("{not valid json");
  const first = new SaveStore();
  assert.ok(first.corruptBackupKey);
  first.save("fresh");
  // Simulate a subsequent page load where in-memory corruptBackupRaw is null and only storage backups exist.
  const reloaded = new SaveStore();
  assert.equal(reloaded.corruptBackupRaw, null);
  const backups = reloaded.listBackups();
  assert.ok(backups.length >= 1);
  assert.equal(typeof backups[0].key, "string");
  assert.equal(reloaded.getBackup(backups[0].key), "{not valid json");

  const huge = newSave();
  huge.run = { v: 1, seed: 1, weapon: "lanternGun", wave: 5, hp: 50, dmgSrc: {}, takenBy: {}, bossKills: [] };
  for (let i = 0; i < 120; i++) {
    huge.stats.bosses[`fake_${i}`] = i;
    huge.run.dmgSrc[`src_${i}`] = i;
    huge.run.takenBy[`hit_${i}`] = i;
  }
  for (let i = 0; i < 400; i++) huge.run.bossKills.push("bellKeeper");
  const parsed = reloaded.parse(JSON.stringify(huge));
  assert.equal(parsed.ok, true);
  assert.ok(Object.keys(parsed.data.stats.bosses).length <= 64);
  assert.ok(Object.keys(parsed.data.run.dmgSrc).length <= 64);
  assert.ok(Object.keys(parsed.data.run.takenBy).length <= 64);
  assert.ok(parsed.data.run.bossKills.length <= 256);
});

test("save parser strips reserved prototype keys and bounds seen and future-version kept maps", () => {
  const store = new SaveStore();
  const future = newSave();
  future.ver = "9.0.0";
  future.seen = {};
  for (let i = 0; i < 180; i++) future.seen[`tip_custom_${i}`] = true;
  future.weapons = { lanternGun: true };
  for (let i = 0; i < 90; i++) future.weapons[`futureWeapon_${i}`] = true;
  future.run = ["not-an-object"];

  // Inject reserved keys directly into raw JSON text so JSON.parse encounters them verbatim.
  const raw = JSON.stringify(future).replace(
    '"weapons":{',
    '"weapons":{"__proto__":{"polluted":true},"constructor":"bad","prototype":"bad",',
  );
  const parsed = store.parse(raw);
  assert.equal(parsed.ok, true);
  assert.equal({}.polluted, undefined);
  assert.ok(Object.keys(parsed.data.seen).length <= 128);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.data.weapons, "prototype"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.data.weapons, "constructor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.data.weapons, "__proto__"), false);
  assert.equal(parsed.kept.run, undefined);
  assert.ok(parsed.kept.weapons);
  assert.ok(Object.keys(parsed.kept.weapons).length <= 64);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.kept.weapons, "prototype"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.kept.weapons, "constructor"), false);
});
