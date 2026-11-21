// Renderer data/geometry contracts for the custom WebGL2 engine without GPU timing or screenshots.
import test from "node:test";
import assert from "node:assert/strict";
import { Box3, Vec3 } from "../src/engine/math.js";
import { box } from "../src/engine/geometry.js";
import { Material, MeshNode, Node, mergeStaticNodes } from "../src/engine/scene.js";
import { biomeList } from "../src/data/biomes.js";
import { biomeAtmosphere, atmosphereDensity } from "../src/data/atmosphere.js";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";

test("all six atmospheres are defined and yield to a busy combat pool", () => {
  assert.deepEqual(Object.keys(biomeAtmosphere).sort(), biomeList.map((b) => b.id).sort());
  for (const layers of Object.values(biomeAtmosphere)) {
    for (const layer of layers) {
      assert.ok(layer.rate > 0 && Number.isFinite(layer.rate));
      assert.ok(layer.life[0] > 0 && layer.life[1] >= layer.life[0]);
    }
  }
  assert.ok(atmosphereDensity(1400, 100) > atmosphereDensity(1400, 500));
  assert.equal(atmosphereDensity(1400, 1000), 0);
});

test("static batching preserves transformed bounds and moving/transparent meshes", () => {
  const group = new Node();
  const material = new Material({ shader: "stylized", surface: "stone" });
  for (let i = 0; i < 4; i++) {
    const mesh = new MeshNode(box(1, 2, 3), material);
    mesh.position.set(i * 3, i * 0.2, -i);
    mesh.rotation.y = i * 0.25;
    group.add(mesh);
  }
  const moving = group.children[0];
  const glass = new MeshNode(box(1, 1, 1), new Material({ shader: "stylized", transparent: true, opacity: 0.5 }));
  group.add(glass);
  const before = new Box3().setFromObject(group);
  mergeStaticNodes(group, new Set([moving]));
  const after = new Box3().setFromObject(group);
  assert.equal(group.children.length, 3);
  assert.equal(moving.parent, group);
  assert.equal(glass.parent, group);
  assert.ok(Math.hypot(before.min.x - after.min.x, before.min.y - after.min.y, before.min.z - after.min.z) < 1e-5);
  assert.ok(Math.hypot(before.max.x - after.max.x, before.max.y - after.max.y, before.max.z - after.max.z) < 1e-5);
});

test("all 25 enemy kits, 7 player weapon rigs and 6 bosses produce finite bounded geometry within mobile budgets", async () => {
  const { enemyGeometry, buildPlayerModel, buildBossModel, RL_MESH_TYPES } = await import("../src/render/models.js");
  const { enemyDefs, bossDefs } = await import("../src/data/enemies.js");
  const { weaponDefs } = await import("../src/data/weapons.js");
  assert.deepEqual([...RL_MESH_TYPES].sort(), Object.keys(enemyDefs).sort());
  const check = (geometry, label) => {
    assert.ok(geometry.positions.every(Number.isFinite), `${label}: non-finite positions`);
    const b = geometry.computeBounds();
    const sz = b.getSize(new Vec3());
    assert.ok(sz.length() > 0 && sz.length() < 30, `${label}: unreasonable bounds`);
  };
  for (const [type, def] of Object.entries(enemyDefs)) {
    const model = enemyGeometry(type, def.color);
    const triangles = model.body.triangleCount + model.glow.triangleCount;
    assert.ok(triangles <= 1800, `${type}: ${triangles} triangles exceeds the 1800-triangle GPU-First v2 kit budget`);
    assert.ok(
      (model.body.partMeta && model.body.partMeta.some((v, idx) => idx % 4 === 0 && v > 0)) ||
        (model.glow.partMeta && model.glow.partMeta.some((v, idx) => idx % 4 === 0 && v > 0)),
      `${type}: missing GPU sub-part animation metadata (aPartMeta)`,
    );
    check(model.body, `${type}:body`);
    check(model.glow, `${type}:glow`);
  }
  const models = [
    ...Object.entries(weaponDefs).map(([id, def]) => [id, buildPlayerModel(id, def.color)]),
    ...Object.entries(bossDefs).map(([id, def]) => [id, buildBossModel(id, def.color)]),
  ];
  for (const [id, model] of models) {
    let tris = 0;
    model.group.traverse((o) => {
      if (o.geometry) {
        check(o.geometry, id);
        tris += o.geometry.triangleCount;
      }
    });
    assert.ok(tris > 0 && tris <= 6500, `${id}: triangle count ${tris} out of budget`);
  }
});

test("every weapon stays attached and aims horizontally through turns, banking and recoil", async () => {
  const { buildPlayerModel } = await import("../src/render/models.js");
  const { weaponDefs } = await import("../src/data/weapons.js");
  const a = new Vec3();
  const b = new Vec3();
  for (const [weapon, def] of Object.entries(weaponDefs)) {
    const model = buildPlayerModel(weapon, def.color);
    let gunMeshes = 0;
    model.gun.traverse((o) => {
      if (o.geometry) gunMeshes++;
    });
    assert.ok(gunMeshes > 0, `${weapon}: independent weapon geometry missing`);
    for (let facing = 0; facing < 8; facing++) {
      for (let aim = 0; aim < 8; aim++) {
        for (const pose of [0, 1, 2]) {
          model.base.rotation.set(pose === 0 ? 0 : 0.35, (-facing * Math.PI) / 4, pose === 2 ? -0.22 : 0, "YZX");
          model.group.position.set(3, model.setWalk(facing * 0.8, pose === 0 ? 0 : 1, pose === 2 ? 1 : 0, 5), -4);
          model.recoil = 0.07;
          const aimRad = (aim * Math.PI) / 4;
          model.aimAt(aimRad);
          model.group.updateWorldMatrix(true);
          model.weaponMount.getWorldPosition(a);
          model.turret.getWorldPosition(b);
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6, `${weapon}: bearing separated`);
          const e = model.turret.worldMatrix.elements;
          const dx = e[0],
            dy = e[1],
            dz = e[2];
          assert.ok(
            Math.hypot(dx - Math.cos(aimRad), dy, dz - Math.sin(aimRad)) < 1e-6,
            `${weapon}: aim drifts with body`,
          );
          const m = model.muzzle.getWorldPosition(b);
          assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z));
          assert.ok(Math.abs(model.gun.position.x - (0.14 - 0.07)) < 1e-6);
        }
      }
    }
  }
});

test("BossCardView distinguishes Frost Prism shatter from Glasswyrm Fang shatter and splinter hits", async () => {
  const { BossCardView } = await import("../src/render/boss-cards-view.js");
  const bursts = [],
    rings = [];
  const view = new BossCardView({
    burst: (...args) => bursts.push(args),
    ring: (...args) => rings.push(args),
  });
  assert.equal(view.event({ k: "shatter", x: 1, y: 2, r: 0.6 }, {}, 1), true);
  assert.equal(view.event({ k: "shatter", x: 3, y: 4, r: 0.6, glass: true }, {}, 1), true);
  assert.equal(view.event({ k: "splinterHit", x: 5, y: 6 }, {}, 1), true);
  assert.equal(view.event({ k: "splinterHit", x: 7, y: 8, glass: true }, {}, 1), true);
  assert.equal(bursts.length, 4);
  assert.equal(rings.length, 2);
  assert.notEqual(bursts[0][5].getHex(), bursts[1][5].getHex());
  assert.notEqual(rings[0][4].getHex(), rings[1][4].getHex());
  assert.notEqual(bursts[2][5].getHex(), bursts[3][5].getHex());
});

test("all biomes have a distinct painterly palette and a fight and boss score", async () => {
  const { GLAZES } = await import("../src/render/palette.js");
  const { musicTrack, scoreBiomes } = await import("../src/audio/score.js");
  const biomeIds = biomeList.map((biome) => biome.id).sort();
  assert.deepEqual(Object.keys(GLAZES).sort(), biomeIds);
  assert.deepEqual([...scoreBiomes].sort(), biomeIds);
  assert.equal(new Set(Object.values(GLAZES).map((glaze) => glaze.style)).size, biomeIds.length);
  assert.equal(new Set(Object.values(GLAZES).map((glaze) => glaze.base)).size, biomeIds.length);
  for (const id of biomeIds) {
    const fight = musicTrack("fight", id);
    const boss = musicTrack("boss", id);
    assert.ok(fight.bpm > 0 && boss.bpm > fight.bpm, id);
    assert.ok(fight.bars > 0 && boss.bars > 0, id);
  }
});

test("Engine v2 freezeStatic skips matrix recomputation, GpuParticleRing expires in O(1), and 3D variant/elite gear is bounded", async () => {
  const { GpuParticleRing, CompactInstancePool } = await import("../src/engine/scene.js");
  const { variantAttachmentGeometry, affixAttachmentGeometry } = await import("../src/render/models.js");
  const { plane } = await import("../src/engine/geometry.js");

  // 1. Static subtree freezing skips per-frame world matrix updates while preserving world bounds
  const root = new Node();
  for (let i = 0; i < 6; i++) {
    const m = new MeshNode(box(1, 1, 1), new Material({ shader: "stylized" }));
    m.position.set(i * 2, 0.5, -i);
    root.add(m);
  }
  root.freezeStatic();
  Node._matrixUpdates = 0;
  root.updateWorldMatrix(true);
  assert.equal(Node._matrixUpdates, 0, "frozen static subtree must recompute zero world matrices");
  for (const child of root.children) {
    const sphere = child.getWorldSphere();
    assert.ok(sphere.r > 0 && Number.isFinite(sphere.x), "frozen mesh retains valid frustum sphere");
  }

  // 2. Stateless GPU particle ring tracks active count via O(1) time-wheel buckets and wraps cleanly
  let simTime = 0;
  const ring = new GpuParticleRing(plane(1, 1), 64, () => simTime);
  for (let i = 0; i < 40; i++) {
    ring.spawn(i * 0.1, 0.5, 0, 1, 2, 0, simTime, 0.5, 0.2, 1, 0.8, 0.4, 1.5, 4, 0, false, 0.37);
  }
  assert.equal(ring.n, 40);
  assert.equal(ring.d0Start, 0);
  assert.equal(ring.d0End, 40);
  simTime = 0.65;
  ring.advanceTime(simTime);
  assert.equal(ring.n, 0, "expired GPU particles drain in O(1) via time-wheel buckets");

  // 3. CompactInstancePool packs 12 floats (48 bytes) per articulated actor
  const pool = new CompactInstancePool(box(0.5, 0.5, 0.5), new Material({ shader: "stylized" }), 8);
  pool.begin();
  assert.equal(pool.push(1, 0.5, -2, 1.1, 1.2, 0.4, 0.1, -0.05, 2.3, 1, 0.9, 0.8, 0.5, 0.25), 0);
  pool.end();
  assert.equal(pool.mesh.count, 1);
  assert.ok(pool.d.subarray(0, 12).every(Number.isFinite));

  // 4. 3D Biome-Variant & Elite Affix attachment geometries are finite and bounded
  for (const v of ["shorted", "frost", "phase", "corrosive", "sunstruck", "flareheart"]) {
    const kit = variantAttachmentGeometry(v);
    const tris = (kit.body?.triangleCount || 0) + (kit.glow?.triangleCount || 0);
    assert.ok(tris > 0 && tris <= 400, `${v}: ${tris} tris`);
    if (kit.body) assert.ok(kit.body.positions.every(Number.isFinite), `${v}: body`);
    if (kit.glow) assert.ok(kit.glow.positions.every(Number.isFinite), `${v}: glow`);
  }
  for (const a of ["shielded", "hasted", "volatile"]) {
    const kit = affixAttachmentGeometry(a);
    const tris = (kit.body?.triangleCount || 0) + (kit.glow?.triangleCount || 0);
    assert.ok(tris > 0 && tris <= 400, `${a}: ${tris} tris`);
    if (kit.body) assert.ok(kit.body.positions.every(Number.isFinite), `${a}: body`);
    if (kit.glow) assert.ok(kit.glow.positions.every(Number.isFinite), `${a}: glow`);
  }
});
