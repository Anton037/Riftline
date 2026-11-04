// Renderer data/geometry contracts without GPU timing or screenshot comparisons.
import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, BoxGeometry, MeshLambertMaterial, Box3 } from "three";
import { mergeStaticMeshes } from "../src/render/static-meshes.js";
import { biomeList } from "../src/data/biomes.js";
import { biomeAtmosphere, atmosphereDensity } from "../src/data/atmosphere.js";

test("all six atmospheres are defined and yield to a busy combat pool", () => {
  assert.deepEqual(Object.keys(biomeAtmosphere).sort(), biomeList.map((b) => b.id).sort());
  for (const layers of Object.values(biomeAtmosphere))
    for (const layer of layers) {
      assert.ok(layer.rate > 0 && Number.isFinite(layer.rate));
      assert.ok(layer.life[0] > 0 && layer.life[1] >= layer.life[0]);
    }
  assert.ok(atmosphereDensity(1400, 100) > atmosphereDensity(1400, 500));
  assert.equal(atmosphereDensity(1400, 1000), 0);
});

test("static batching preserves transformed bounds and moving/transparent meshes", () => {
  const group = new Group(),
    material = new MeshLambertMaterial();
  for (let i = 0; i < 4; i++) {
    const mesh = new Mesh(new BoxGeometry(1, 2, 3), material);
    mesh.position.set(i * 3, i * 0.2, -i);
    mesh.rotation.y = i * 0.25;
    group.add(mesh);
  }
  const moving = group.children[0];
  const glass = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ transparent: true, opacity: 0.5 }));
  group.add(glass);
  const before = new Box3().setFromObject(group);
  mergeStaticMeshes(group, new Set([moving]));
  const after = new Box3().setFromObject(group);
  assert.equal(group.children.length, 3);
  assert.equal(moving.parent, group);
  assert.equal(glass.parent, group);
  assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5);
});
