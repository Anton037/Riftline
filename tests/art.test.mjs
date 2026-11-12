// Spatial and resource contracts for the painted-world art pass.
import test from "node:test";
import assert from "node:assert/strict";
import { ShaderLib } from "three";
import { worldMaterial, WORLD_SURFACES } from "../src/render/world-material.js";
import { strataGeometry, shardGeometry } from "../src/render/strata-geometry.js";
import { createGroundOcclusion } from "../src/render/ground-occlusion.js";
import { mushroomCapGeometry, topCoatGeometry } from "../src/render/natural-geometry.js";

test("natural caps are closed within their collision envelope; snow coats follow sculpted faces", () => {
  for (const radius of [0.18, 1, 3])
    for (const seed of [1, 42, -12]) {
      const height = radius * 0.6,
        g = mushroomCapGeometry(radius, height, seed),
        p = g.attributes.position,
        ids = g.index.array,
        edges = new Map();
      assert.ok(p.array.every(Number.isFinite));
      assert.ok(ids.length / 3 <= 300);
      for (let j = 0; j < p.count; j++) {
        assert.ok(Math.hypot(p.getX(j), p.getZ(j)) <= radius + 1e-6);
        assert.ok(p.getY(j) >= 0 && p.getY(j) <= height + 1e-6);
      }
      let volume = 0;
      for (let i = 0; i < ids.length; i += 3) {
        const [a, b, c] = ids.slice(i, i + 3);
        volume +=
          p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c)) +
          p.getY(a) * (p.getZ(b) * p.getX(c) - p.getX(b) * p.getZ(c)) +
          p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c));
        for (let j = 0; j < 3; j++) {
          const edge = [ids[i + j], ids[i + ((j + 1) % 3)]].sort((a, b) => a - b).join(":");
          edges.set(edge, (edges.get(edge) || 0) + 1);
        }
      }
      assert.ok(volume > radius * radius * height, "closed cap must face outward and enclose real volume");
      assert.ok([...edges.values()].every((n) => n === 2));
      g.dispose();
    }
  const rock = strataGeometry(4, 3, 2, 42),
    coat = topCoatGeometry(rock);
  const p = coat.attributes.position,
    source = rock.attributes.position;
  assert.ok(p.count > 0 && p.array.every(Number.isFinite));
  for (let i = 0; i < p.count; i++) {
    assert.ok(p.getY(i) > 1.8);
    assert.ok(
      Array.from({ length: source.count }, (_, j) => j).some(
        (j) =>
          Math.hypot(p.getX(i) - source.getX(j), p.getY(i) - source.getY(j) - 0.025, p.getZ(i) - source.getZ(j)) < 1e-5,
      ),
      "snow must rest on a real sculpted vertex",
    );
  }
  rock.dispose();
  coat.dispose();
});

test("sculpted rock is closed and stays grounded inside its authored envelope", () => {
  for (const [w, h, d] of [
    [0.4, 0.9, 0.4],
    [8, 0.95, 2],
    [2, 1.2, 1.3],
  ])
    for (const seed of [1, 42, 731])
      for (const round of [false, true]) {
        const geometry = strataGeometry(w, h, d, seed, round),
          p = geometry.attributes.position;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        assert.ok(box.min.y >= 0 && box.min.y < 0.001 && box.max.y <= h + 0.001);
        assert.ok(box.min.x >= -w / 2 - 0.001 && box.max.x <= w / 2 + 0.001);
        assert.ok(box.min.z >= -d / 2 - 0.001 && box.max.z <= d / 2 + 0.001);
        assert.ok(p.array.every(Number.isFinite));
        const edges = new Map(),
          ids = geometry.index.array;
        const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(",");
        for (let i = 0; i < ids.length; i += 3)
          for (let j = 0; j < 3; j++) {
            const edge = [key(ids[i + j]), key(ids[i + ((j + 1) % 3)])].sort().join("/");
            edges.set(edge, (edges.get(edge) || 0) + 1);
          }
        assert.ok(
          [...edges.values()].every((count) => count === 2),
          "rock must be a closed solid",
        );
        geometry.dispose();
      }
});

test("baked contact shading is deterministic, feathered and leaves open floor clear", () => {
  const empty = createGroundOcclusion(12, 12, [], 128);
  assert.ok(empty.image.data.every((v) => v === 255));
  const obstacles = [
    { t: "c", x: 2, y: -1, r: 1 },
    { t: "b", x: -4, y: 3, w: 2, h: 0.6 },
  ];
  const a = createGroundOcclusion(12, 12, obstacles, 128),
    b = createGroundOcclusion(12, 12, obstacles, 128);
  assert.deepEqual(a.image.data, b.image.data);
  const sample = (x, z) => a.image.data[Math.floor(((z + 12) / 24) * 128) * 128 + Math.floor(((x + 12) / 24) * 128)];
  assert.ok(sample(2, -1) < 190 && sample(-4, 3) < 190, "solid feet need contact shading");
  assert.ok(sample(-9, 9) > 250, "open floor stays clear");
  assert.ok(sample(3.2, -1) < sample(4.5, -1), "penumbra must fade outside the footprint");
  assert.ok(
    a.image.data.some((v) => v > 190 && v < 250),
    "falloff must have intermediate values",
  );
  for (const texture of [empty, a, b]) texture.dispose();
});

// Shared boss fade/material lists must not apply the biome layer twice over painted surfaces.
test("painted material and biome layers compose once when a material is shared", async () => {
  globalThis.__RL_VERSION__ ??= "test";
  globalThis.__RL_BUILD__ ??= "test";
  const { rlSkinMaterial } = await import("../src/render/biome-visuals.js");
  for (const flash of [false, true]) {
    const material = worldMaterial({ surface: "armor", vertexColors: true });
    const compile = () => {
      const shader = {
        uniforms: {},
        vertexShader: ShaderLib.phong.vertexShader,
        fragmentShader: ShaderLib.phong.fragmentShader,
      };
      material.onBeforeCompile(shader);
      return shader;
    };
    rlSkinMaterial(material, flash);
    const once = compile(),
      key = material.customProgramCacheKey();
    rlSkinMaterial(material, flash);
    const repeated = compile();
    assert.equal(repeated.vertexShader, once.vertexShader);
    assert.equal(repeated.fragmentShader, once.fragmentShader);
    assert.equal(material.customProgramCacheKey(), key);
    assert.equal(repeated.uniforms.uArtMap, WORLD_SURFACES.finishMap);
    assert.ok(repeated.uniforms.uSkin, "biome layer must retain its uniforms");
    material.dispose();
  }
});

test("broken ice and glass shards are closed and fit their authored envelopes", () => {
  for (const [w, h, d] of [
    [0.4, 2.1, 0.35],
    [1.4, 1, 0.14],
    [0.18, 0.6, 0.16],
  ]) {
    const geometry = shardGeometry(w, h, d),
      p = geometry.attributes.position,
      indices = geometry.index?.array ?? Array.from({ length: p.count }, (_, i) => i),
      edges = new Map();
    const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(5)).join(",");
    for (let i = 0; i < indices.length; i += 3)
      for (let j = 0; j < 3; j++) {
        const a = indices[i + j],
          b = indices[i + ((j + 1) % 3)],
          edge = [key(a), key(b)].sort().join("/");
        edges.set(edge, (edges.get(edge) || 0) + 1);
        assert.ok(
          Math.abs(p.getX(a)) <= w / 2 + 1e-6 &&
            p.getY(a) >= -1e-6 &&
            p.getY(a) <= h + 1e-6 &&
            Math.abs(p.getZ(a)) <= d / 2 + 1e-6,
        );
      }
    assert.ok([...edges.values()].every((n) => n === 2));
    geometry.dispose();
  }
});
