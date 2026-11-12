// Actual power events and phases must stay distinct, bounded and independent of hostile warnings.
import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh } from "three";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { World } = await import("../src/core/world.js");
const { AbilityEffectsView } = await import("../src/render/ability-effects-view.js");
const { createAurora } = await import("../src/render/aurora.js");
const { SoundEngine } = await import("../src/audio/sound.js");

class Pool {
  constructor(geometry, material, max) {
    this.mesh = new Mesh(geometry, material);
    this.max = max;
    this.n = 0;
    this.transforms = [];
  }
  y(...values) {
    assert.ok(values.every(Number.isFinite));
    if (this.n === this.max) return -1;
    this.transforms.push(values);
    return this.n++;
  }
  yr(...values) {
    return this.y(...values);
  }
  col() {}
}
function fixture() {
  const w = new World({ seed: 731, weapon: "pulse", threat: 0, ws: {} });
  w.startWave(2);
  w.fx = [];
  const warning = () => {
    throw new Error("Player power consumed a hostile-warning resource");
  };
  const r = {
    time: 8,
    scene: new Group(),
    burst() {},
    flash() {},
    addShake() {},
    emit() {},
    beams: { y: warning, seg: warning },
    ring: warning,
    ringPool: { y: warning },
    flashT: 0,
  };
  const view = new AbilityEffectsView(r, Pool);
  const draw = (dt = 1 / 60) => {
    for (const p of view.list) {
      p.n = 0;
      p.transforms = [];
    }
    view.draw(dt, w);
    for (const p of view.list) assert.ok(p.n <= p.max);
  };
  const dispose = () =>
    view.list.forEach((p) => {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
  return { w, r, view, draw, dispose };
}

test("one real Nova produces one bounded wave and one sound, without a screen wash", () => {
  const { w, r, view, draw, dispose } = fixture();
  try {
    w.player.nova = 100;
    w.nova();
    const events = w.fx.filter((e) => e.k === "nova" || (e.k === "boom" && e.kind === "nova"));
    assert.equal(events.length, 2, "exercise the two simulation notifications");
    for (const ev of events) assert.equal(view.event(ev, w, 1), true);
    const played = [];
    SoundEngine.prototype.consume.call({ live: () => true, play: (id) => played.push(id) }, events, w);
    assert.deepEqual(played, ["nova"]);
    assert.equal(view.pulses.length, 1);
    const radius = events.find((e) => e.k === "nova").r;
    r.time += 0.4;
    draw();
    assert.equal(view.wavePool.n, 1);
    assert.ok(Math.abs(view.wavePool.transforms[0][4] - radius) < 1e-8);
    assert.equal(r.flashT, 0);
    r.time += 1;
    draw();
    assert.equal(view.wavePool.n, 0);
    assert.equal(view.pulses.length, 0);
  } finally {
    dispose();
  }
});

test("Singularity flight, pull and collapse use private resources and leave simulation state intact", () => {
  const { w, r, view, draw, dispose } = fixture();
  try {
    w.useGadget({ aim: false });
    let flight = false,
      pull = false,
      collapse = false;
    for (let frame = 0; frame < 150; frame++) {
      for (const e of w.fx) {
        view.event(e, w, 1);
        if (e.k === "boom" && e.kind === "singularity") collapse = true;
      }
      w.fx = [];
      const before = JSON.stringify(w.singularities);
      draw();
      assert.equal(JSON.stringify(w.singularities), before);
      const g = w.singularities[0];
      if (g && !g.done && g.pullT < 0) {
        flight = true;
        assert.equal(view.corePool.n, 1);
        assert.equal(view.fieldPool.n, 1);
      } else if (g && !g.done) {
        pull = true;
        assert.equal(view.fieldPool.n, 2);
        assert.equal(view.fieldPool.transforms[0][4], g.r);
      }
      r.time += 1 / 60;
      w.updateSingularities(1 / 60);
    }
    assert.ok(flight && pull && collapse);
    r.time += 1;
    draw();
    assert.ok(view.list.every((p) => p.n === 0));
  } finally {
    dispose();
  }
});

test("simultaneous powers stay capped and a new world clears transient effects", () => {
  const { w, r, view, draw, dispose } = fixture();
  try {
    w.player.gadgetN = 8;
    for (let i = 0; i < 8; i++) w.useGadget({ aim: false });
    w.updateSingularities(1);
    for (let i = 0; i < 100; i++) view.event({ k: "nova", x: 0, y: 0, r: 5 }, w, 1);
    r.time += 0.1;
    draw();
    assert.equal(view.pulses.length, 32);
    assert.equal(view.wavePool.n, 32);
    assert.equal(view.corePool.n, 8);
    assert.equal(view.fieldPool.n, 16);
    assert.equal(r.scene.children.length, 3);
    view.useWorld({});
    assert.equal(view.pulses.length, 0);
    assert.equal(view.shieldHitAt, -Infinity);
  } finally {
    dispose();
  }
});

test("enemy blocks never trigger the player's Aegis; a real absorbed hit does", () => {
  const { w, r, view, dispose } = fixture();
  try {
    assert.equal(view.event({ k: "block", x: 0, y: 0 }, w, 1), false);
    assert.equal(view.event({ k: "shieldPop", x: 0, y: 0 }, w, 1), false);
    assert.equal(view.shieldHitAt, -Infinity);
    w.player.shield = true;
    w.player.iT = 0;
    w.hurtPlayer(10, 1, 0, "grunt");
    const event = w.fx.find((e) => e.k === "shieldBreak");
    assert.ok(event);
    assert.equal(view.event(event, w, 1), true);
    assert.equal(view.shieldHitAt, r.time);
  } finally {
    dispose();
  }
});

test("aurora ribbons remain outside every arena even at shader sway extrema", () => {
  for (const W of [15, 20])
    for (const H of [15, 20]) {
      const mesh = createAurora(W, H),
        p = mesh.geometry.attributes.position;
      assert.equal(mesh.geometry.index.count / 3, 1728);
      assert.ok(p.array.every(Number.isFinite));
      for (let i = 0; i < p.count; i++) assert.ok(p.getZ(i) + 0.7 < -H - 5);
      assert.equal(mesh.onBeforeRender, Mesh.prototype.onBeforeRender, "no camera-facing reorientation");
      assert.equal(mesh.material.depthWrite, false);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
});
