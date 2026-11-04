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
const { SaveStore, SAVE_KEY, newSave } = await import("../src/core/save.js");
const reset = (raw) => {
  entries.clear();
  blocked = false;
  if (raw) entries.set(SAVE_KEY, raw);
};

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
  for (const key of ["zoom", "contrast", "shake", "timer", "fps"]) assert.ok(!(key in store.data.settings));
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
