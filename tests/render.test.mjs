// Renderer data/geometry contracts without GPU timing or screenshot comparisons.
import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, BoxGeometry, MeshLambertMaterial, Box3, Vector3, Quaternion } from "three";
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

// Chamfers must preserve collision-sized bounds and form a closed outward-facing solid.
test("armour chamfers are closed, outward facing and stay inside the original box", async () => {
  const { armorBox } = await import("../src/render/armor-geometry.js");
  for (const size of [
    [2, 1, 3],
    [0.04, 0.08, 0.3],
    [8, 0.2, 2],
  ]) {
    const geometry = armorBox(...size);
    const p = geometry.attributes.position,
      normals = geometry.attributes.normal;
    const edges = new Map(),
      key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(",");
    const indices = geometry.index.array;
    assert.equal(indices.length / 3, 44);
    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = indices[i + j],
          b = indices[i + ((j + 1) % 3)];
        const edge = [key(a), key(b)].sort().join("/");
        edges.set(edge, (edges.get(edge) || 0) + 1);
        const position = [p.getX(a), p.getY(a), p.getZ(a)];
        position.forEach((v, axis) => assert.ok(Number.isFinite(v) && Math.abs(v) <= size[axis] / 2 + 1e-6));
        assert.ok(position[0] * normals.getX(a) + position[1] * normals.getY(a) + position[2] * normals.getZ(a) > 0);
      }
    }
    assert.ok([...edges.values()].every((n) => n === 2));
    geometry.dispose();
  }
});

test("all redesigned enemy and hero kits produce finite bounded geometry", async () => {
  const { enemyGeometry, buildPlayerModel, buildBossModel } = await import("../src/render/models.js");
  const { enemyDefs, bossDefs } = await import("../src/data/enemies.js");
  const { weaponDefs } = await import("../src/data/weapons.js");
  const check = (geometry) => {
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.computeBoundingSphere();
    assert.ok(Number.isFinite(geometry.boundingSphere.radius) && geometry.boundingSphere.radius < 30);
    geometry.dispose();
  };
  for (const [type, def] of Object.entries(enemyDefs)) {
    const model = enemyGeometry(type, def.color);
    const triangles = Object.values(model).reduce(
      (sum, g) => sum + (g.index?.count ?? g.attributes.position.count) / 3,
      0,
    );
    assert.ok(triangles <= 810, `${type}: ${triangles} triangles exceeds the mobile kit budget`);
    check(model.body);
    check(model.glow);
  }
  const models = [
    ...Object.entries(weaponDefs).map(([id, def]) => buildPlayerModel(id, def.color)),
    ...Object.entries(bossDefs).map(([id, def]) => buildBossModel(id, def.color)),
  ];
  for (const model of models) {
    model.group.traverse((o) => {
      if (o.geometry) check(o.geometry);
    });
  }
});

test("Caldera ridges rotate the entire decorated model with their collision footprint", async () => {
  const { calderaRidgeParts } = await import("../src/render/caldera-ridge.js");
  const horizontal = calderaRidgeParts({ x: 0, y: 0, w: 4, h: 1 });
  const vertical = calderaRidgeParts({ x: 0, y: 0, w: 1, h: 4 });
  assert.equal(horizontal.length, vertical.length);
  const bounds = (part) => {
    part.geometry.computeBoundingBox();
    return part.geometry.boundingBox;
  };
  for (let i = 0; i < horizontal.length; i++) {
    assert.equal(horizontal[i].role, vertical[i].role);
    const h = bounds(horizontal[i]),
      v = bounds(vertical[i]);
    assert.ok(Math.abs(h.min.x + v.max.z) < 1e-5);
    assert.ok(Math.abs(h.max.x + v.min.z) < 1e-5);
    assert.ok(Math.abs(h.max.z - v.max.x) < 1e-5);
    assert.ok(Math.abs(h.min.y - v.min.y) < 1e-5);
    assert.ok(v.max.x <= 1.04 && v.min.x >= -1.04, "all details must stay on the narrow collision footprint");
  }
  assert.ok(bounds(horizontal[0]).min.y >= 0 && bounds(horizontal[0]).min.y < 0.02, "ridge must sit on the floor");
  const seamCenters = vertical
    .filter((p) => p.role === "emberMat")
    .map((p) => {
      const box = bounds(p);
      return (box.min.z + box.max.z) / 2;
    });
  assert.ok(Math.max(...seamCenters) - Math.min(...seamCenters) > 3.5, "fissures must span the long axis");
  for (const p of [...horizontal, ...vertical]) p.geometry.dispose();
});

test("Caldera decoration keeps the spawn and playable edges clear", async () => {
  globalThis.__RL_VERSION__ ??= "test";
  globalThis.__RL_BUILD__ ??= "test";
  const { makeRng } = await import("../src/core/util.js");
  const { addBiomeDetail } = await import("../src/render/biome-props.js");
  const biome = biomeList.find((b) => b.id === "club");
  for (const seed of [11, 42, 731]) {
    const group = new Group();
    addBiomeDetail({ group }, biome, 18, 18, [], makeRng(seed));
    for (const mesh of group.children) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        assert.ok(Math.hypot(p.getX(i), p.getZ(i) - 2) > 3, `seed ${seed}: decorative vertex in spawn clearing`);
        if (Math.abs(p.getX(i)) < 18 && Math.abs(p.getZ(i)) < 18)
          assert.ok(p.getY(i) < 0.8, `seed ${seed}: tall backdrop overhangs the playable arena`);
      }
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
});

test("v4 architecture stays on solid footprints and outside the arena", async () => {
  const { addMapArchitecture } = await import("../src/render/map-architecture.js");
  for (const biome of biomeList) {
    for (const ob of [
      { t: "b", x: 3, y: -2, w: 0.5, h: 3 },
      { t: "c", x: -3, y: 4, r: 1 },
    ]) {
      const view = { group: new Group(), obsGroup: new Group() };
      addMapArchitecture(view, biome, 15, 12, [ob]);
      const bounds = new Box3().setFromObject(view.obsGroup);
      const w = ob.r ?? ob.w,
        h = ob.r ?? ob.h;
      assert.ok(bounds.min.x >= ob.x - w - 0.001 && bounds.max.x <= ob.x + w + 0.001, biome.id + " x footprint");
      assert.ok(bounds.min.z >= ob.y - h - 0.001 && bounds.max.z <= ob.y + h + 0.001, biome.id + " z footprint");
      assert.ok(bounds.max.y < 0.5, biome.id + " foundations stay low");
      if (ob.t === "c") {
        view.obsGroup.updateMatrixWorld(true);
        for (const mesh of view.obsGroup.children) {
          const positions = mesh.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
            assert.ok(Math.hypot(vertex.x - ob.x, vertex.z - ob.y) <= ob.r + 0.001, biome.id + " circular footprint");
          }
        }
      }
      assert.ok(new Box3().setFromObject(view.group).max.z < -12, biome.id + " landmarks beyond wall");
      for (const group of [view.group, view.obsGroup])
        group.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
    }
  }
});

// Aiming is independent of body yaw, lean and walk sway; the physical bearing remains a shared pivot.
test("every weapon stays attached and aims correctly through turns, banking and recoil", async () => {
  const { buildPlayerModel } = await import("../src/render/models.js"),
    { weaponDefs } = await import("../src/data/weapons.js");
  const a = new Vector3(),
    b = new Vector3(),
    direction = new Vector3(),
    expected = new Vector3(),
    rotation = new Quaternion();
  for (const [weapon, def] of Object.entries(weaponDefs)) {
    const model = buildPlayerModel(weapon, def.color);
    let triangles = 0,
      gunMeshes = 0;
    model.group.traverse((o) => {
      if (o.geometry) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    model.gun.traverse((o) => {
      if (o.geometry) gunMeshes++;
    });
    assert.ok(gunMeshes > 0, `${weapon}: independent weapon geometry is missing`);
    assert.ok(triangles <= 3000, `${weapon}: player exceeds the 3,000-triangle budget including its shield`);
    for (let facing = 0; facing < 8; facing++)
      for (let aim = 0; aim < 8; aim++)
        for (const pose of [0, 1, 2]) {
          model.base.rotation.set(pose === 0 ? 0 : 0.35, (-facing * Math.PI) / 4, pose === 2 ? -0.22 : 0, "YZX");
          model.group.position.set(3, model.setWalk(facing * 0.8, pose === 0 ? 0 : 1, pose === 2 ? 1 : 0, 5), -4);
          model.recoil = 0.07;
          model.aimAt((aim * Math.PI) / 4);
          model.group.updateMatrixWorld(true);
          model.weaponMount.getWorldPosition(a);
          model.turret.getWorldPosition(b);
          assert.ok(a.distanceTo(b) < 1e-8, `${weapon}: bearing separated`);
          direction.set(1, 0, 0).applyQuaternion(model.turret.getWorldQuaternion(rotation));
          expected.set(Math.cos((aim * Math.PI) / 4), 0, Math.sin((aim * Math.PI) / 4));
          assert.ok(direction.distanceTo(expected) < 1e-8, `${weapon}: aim drifts with the body`);
          assert.ok(model.muzzle.getWorldPosition(b).toArray().every(Number.isFinite));
          assert.equal(model.gun.position.x, -0.07);
        }
    model.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) o.material.dispose();
    });
  }
});
