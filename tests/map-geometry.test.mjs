import test from "node:test";
import assert from "node:assert/strict";
import { Group, Box3, BoxGeometry, CylinderGeometry, Vector3 } from "three";
import { clipToArena, auditArenaGeometry, disposeArena } from "./support/geometry.mjs";
import { keepExteriorPartsOutside } from "../src/render/map-geometry.js";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { biomeList } = await import("../src/data/biomes.js");
const { buildLayout, mapTemplates, placeObstacles } = await import("../src/core/arena.js");
const { makeRng, hashString } = await import("../src/core/util.js");
const { ArenaView } = await import("../src/render/biome-visuals.js");

test("map audit catches triangle crossings even when every vertex is outside", () => {
  const face = [
    [-30, 2, -20],
    [30, 2, -20],
    [0, 2, 30],
  ];
  assert.ok(face.every((p) => Math.abs(p[0]) > 15 || Math.abs(p[2]) > 15));
  assert.ok(clipToArena(face, 15, 15).length >= 3);
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

test("exterior placement preserves complete rotated props beyond every edge", () => {
  for (const [x, z] of [
    [16, 0],
    [-16, 0],
    [0, 16],
    [0, -16],
    [16, -16],
  ]) {
    const body = new CylinderGeometry(4, 8, 12, 9).rotateZ(0.2).rotateY(0.7).translate(x, 5, z);
    const glow = new BoxGeometry(0.5, 2, 0.5).translate(x + 1, 12, z + 1);
    body.computeBoundingBox();
    glow.computeBoundingBox();
    const offset = glow.boundingBox.getCenter(new Vector3()).sub(body.boundingBox.getCenter(new Vector3()));
    keepExteriorPartsOutside({ body: [body], glow: [glow] }, 15, 15, x, z);
    const bounds = body.boundingBox.clone().union(glow.boundingBox);
    assert.ok(bounds.min.x >= 15.34 || bounds.max.x <= -15.34 || bounds.min.z >= 15.34 || bounds.max.z <= -15.34);
    const after = glow.boundingBox.getCenter(new Vector3()).sub(body.boundingBox.getCenter(new Vector3()));
    assert.ok(offset.distanceTo(after) < 1e-5, "body and glow must move together");
    body.dispose();
    glow.dispose();
  }
});

test("all biome map geometry respects walkable space and collision across layouts", () => {
  const failures = [];
  let layouts = 0,
    faces = 0;
  for (const biome of biomeList) {
    const cases = [buildLayout(biome, 731, 5, true)];
    for (const seed of [1, 11, 42, 731, 65535, 4294967295])
      for (const wave of [2, 19, 32, 67]) cases.push(buildLayout(biome, seed, wave, false));
    for (let wave = 1; wave <= 12; wave++) if (wave !== 2) cases.push(buildLayout(biome, 42, wave, false));
    const modes = new Set(cases.map((layout) => layout.director?.mode).filter((mode) => mode && mode !== "boss"));
    assert.equal(modes.size, 12, `${biome.id}: cover every wave-director mode`);
    // Force each authored template, including ones the scorer seldom selects.
    for (const template of mapTemplates[biome.id]) {
      const rng = makeRng(hashString(biome.id + template));
      cases.push({
        key: `${biome.id}:${template}`,
        W: 15,
        H: 15,
        obstacles: placeObstacles(rng, biome.id, template, 15, 15),
      });
    }
    for (const size of [15, 20])
      cases.push({ key: `${biome.id}:bounds:${size}`, W: size, H: size, obstacles: biome.obstacles });
    for (const layout of cases) {
      const view = new ArenaView(new Group());
      try {
        view.build(biome, { ...layout, obs: layout.obstacles });
        const result = auditArenaGeometry(view, layout);
        if (result.issues.length) failures.push(`${biome.id} ${layout.key}: ${result.issues.slice(0, 2).join("; ")}`);
        layouts++;
        faces += result.triangles;
        const animations = view.rlAnim.filter((anim) => anim.o.isObject3D);
        const rotations = animations.map((anim) => anim.o.rotation.y);
        for (const angle of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4])
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
      } finally {
        disposeArena(view);
      }
    }
  }
  assert.deepEqual(failures, [], failures.slice(0, 15).join("\n"));
  assert.equal(layouts, 252);
  assert.ok(faces > 1000000);
});
