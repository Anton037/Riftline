import test from "node:test";
import assert from "node:assert/strict";
import { box } from "../src/engine/geometry.js";
import { Material, MeshNode, Node } from "../src/engine/scene.js";
import { clipToArena, auditArenaGeometry, disposeArena } from "./support/geometry.mjs";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { biomeList } = await import("../src/data/biomes.js");
const { buildLayout, mapTemplates, placeObstacles } = await import("../src/core/arena.js");
const { makeRng, hashString } = await import("../src/core/util.js");
const { ArenaView } = await import("../src/render/arena-view.js");

test("prepared arena artwork stays offstage until the matching layout loads", () => {
  const view = new ArenaView(new Node());
  const layouts = biomeList.slice(0, 3).map((biome, i) => {
    const layout = buildLayout(biome, 731, i + 2, false);
    return [biome, { ...layout, obs: layout.obstacles }];
  });
  view.build(...layouts[0]);
  try {
    const current = view.obsGroup;
    const occlusion = view.groundOcclusion;
    view.prefetch(...layouts[1]);
    const prepared = view.prepared;
    assert.equal(view.obsGroup, current);
    assert.equal(view.groundOcclusion, occlusion);
    assert.equal(prepared.group.parent, null);
    view.build(...layouts[1], true);
    assert.equal(view.obsGroup, prepared.obsGroup);
    assert.equal(view.groundOcclusion, prepared.groundOcclusion);
    assert.equal(view.obsGroup.position.y, -2.4);
    view.update(1, 0, 0, 0);
    assert.ok(view.obsGroup.position.y === 0);
    view.prefetch(...layouts[0]);
    view.build(...layouts[2], true);
    assert.equal(view.layKey, layouts[2][1].key);
    assert.equal(view.prepared, null);
    assert.notEqual(view.obsGroup, prepared.obsGroup);
  } finally {
    disposeArena(view);
  }
});

test("map audit catches triangle crossings even when every vertex is outside", () => {
  const face = [
    [-30, 2, -20],
    [30, 2, -20],
    [0, 2, 30],
  ];
  assert.ok(face.every((p) => Math.abs(p[0]) > 15 || Math.abs(p[2]) > 15));
  assert.ok(clipToArena(face, 15, 15).length >= 3);
  const group = new Node();
  const geometry = box(60, 2, 60).translate(0, 2, 0);
  const material = new Material();
  group.add(new MeshNode(geometry, material));
  const audit = auditArenaGeometry(
    { group, obsGroup: new Node(), floorMat: null, rlAnim: [] },
    { W: 15, H: 15, obstacles: [] },
  );
  assert.ok(
    audit.issues.some((s) => s.includes("scenery face crosses")),
    "bounds optimisation must still inspect broad faces crossing the arena",
  );
  geometry.dispose();
  assert.equal(
    clipToArena(
      face.map((p) => [p[0], 0.1, p[2]]),
      15,
      15,
    ).length,
    0,
  );
  assert.equal(
    clipToArena(
      face.map((p) => [p[0], p[1], p[2] - 70]),
      15,
      15,
    ).length,
    0,
  );
});

test("all biome map geometry respects walkable space and collision across 252 layouts", () => {
  const failures = [];
  let layouts = 0;
  let faces = 0;
  for (const biome of biomeList) {
    const cases = [buildLayout(biome, 731, 5, true)];
    for (const seed of [1, 11, 42, 731, 65535, 4294967295]) {
      for (const wave of [2, 19, 32, 67]) cases.push(buildLayout(biome, seed, wave, false));
    }
    for (let wave = 1; wave <= 12; wave++) if (wave !== 2) cases.push(buildLayout(biome, 42, wave, false));
    const modes = new Set(cases.map((layout) => layout.director?.mode).filter((mode) => mode && mode !== "boss"));
    assert.equal(modes.size, 12, `${biome.id}: cover every wave-director mode`);
    for (const template of mapTemplates[biome.id]) {
      const rng = makeRng(hashString(biome.id + template));
      cases.push({
        key: `${biome.id}:${template}`,
        W: 15,
        H: 15,
        obstacles: placeObstacles(rng, biome.id, template, 15, 15),
      });
    }
    for (const size of [15, 20]) {
      cases.push({ key: `${biome.id}:bounds:${size}`, W: size, H: size, obstacles: biome.obstacles });
    }
    for (const layout of cases) {
      const view = new ArenaView(new Node());
      try {
        view.build(biome, { ...layout, obs: layout.obstacles });
        const result = auditArenaGeometry(view, layout);
        if (result.issues.length) failures.push(`${biome.id} ${layout.key}: ${result.issues.slice(0, 2).join("; ")}`);
        layouts++;
        faces += result.triangles;
        const animations = view.rlAnim.filter((anim) => anim.o instanceof Node);
        const rotations = animations.map((anim) => anim.o.rotation.y);
        for (const angle of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4]) {
          for (const sign of [-1, 1]) {
            animations.forEach((anim, i) => {
              if (anim.k === "spin" || anim.k === "spinbob") anim.o.rotation.y = rotations[i] + angle;
              if (anim.k === "bob" || anim.k === "spinbob") anim.o.position.y = anim.b + sign * (anim.a || 0.1);
            });
            if (animations.length) {
              const pose = auditArenaGeometry(view, layout, { animatedOnly: true });
              if (pose.issues.length) failures.push(`${biome.id} ${layout.key} animated: ${pose.issues[0]}`);
            }
          }
        }
      } finally {
        disposeArena(view);
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 15).join("\n"));
  assert.equal(layouts, 252);
  assert.ok(faces > 100000);
});
