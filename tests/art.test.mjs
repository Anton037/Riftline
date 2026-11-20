// Spatial, sculpted-geometry, shader and contact-AO contracts for the custom WebGL2 painterly art pass.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  box,
  beveledBox,
  cylinder,
  cone,
  sphere,
  octahedron,
  icosahedron,
  torus,
  closedLathe,
  sculptedRock,
  sculptedCrystal,
  sculptedCap,
  snowCoat,
} from "../src/engine/geometry.js";
import { stylizedProgram, floorProgram, postCompositeProgram } from "../src/engine/shaders.js";
globalThis.__RL_VERSION__ ??= "test";
globalThis.__RL_BUILD__ ??= "test";
const { createGroundOcclusion } = await import("../src/render/ground-occlusion.js");

function signedVolume(g) {
  const p = g.positions;
  const ids = g.indices;
  const count = ids ? ids.length : p.length / 3;
  let vol = 0;
  for (let i = 0; i < count; i += 3) {
    const a = (ids ? ids[i] : i) * 3;
    const b = (ids ? ids[i + 1] : i + 1) * 3;
    const c = (ids ? ids[i + 2] : i + 2) * 3;
    vol +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return vol / 6;
}

test("natural sculpted mushroom caps are closed within their collision envelope; snow coats follow sculpted faces", () => {
  for (const radius of [0.2, 1, 3]) {
    for (const seed of [1, 42, -12]) {
      const height = radius * 0.6;
      const g = sculptedCap(radius, height, seed);
      const p = g.positions;
      const ids = g.indices;
      const edges = new Map();
      assert.ok(p.every(Number.isFinite));
      assert.ok(ids.length / 3 <= 300);
      for (let j = 0; j < g.vertexCount; j++) {
        assert.ok(Math.hypot(p[j * 3], p[j * 3 + 2]) <= radius + 1e-5);
        assert.ok(p[j * 3 + 1] >= -1e-6 && p[j * 3 + 1] <= height + 1e-5);
      }
      for (let i = 0; i < ids.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          const edge = [ids[i + j], ids[i + ((j + 1) % 3)]].sort((x, y) => x - y).join(":");
          edges.set(edge, (edges.get(edge) || 0) + 1);
        }
      }
      assert.ok(signedVolume(g) > radius * radius * height * 0.08, "closed cap must have positive outward volume");
      assert.ok(
        [...edges.values()].every((n) => n === 2),
        "cap must be a closed manifold",
      );
      g.dispose();
    }
  }
  const rock = sculptedRock(4, 3, 2, 42);
  const coat = snowCoat(rock);
  assert.ok(coat.vertexCount > 0 && coat.positions.every(Number.isFinite));
  for (let i = 0; i < coat.vertexCount; i++) {
    assert.ok(coat.positions[i * 3 + 1] > 1.4);
  }
  rock.dispose();
  coat.dispose();
});

test("sculpted rocks and crystal shards are closed solids grounded inside their authored envelopes", () => {
  for (const [w, h, d] of [
    [0.5, 0.9, 0.5],
    [6, 1.4, 2],
    [2, 1.8, 1.4],
  ]) {
    for (const seed of [1, 42, 731]) {
      for (const round of [false, true]) {
        const g = sculptedRock(w, h, d, seed, round);
        const b = g.computeBounds();
        assert.ok(b.min.y >= -1e-4 && b.min.y < 0.01 && b.max.y <= h + 1e-4);
        assert.ok(b.min.x >= -w / 2 - 1e-4 && b.max.x <= w / 2 + 1e-4);
        assert.ok(b.min.z >= -d / 2 - 1e-4 && b.max.z <= d / 2 + 1e-4);
        assert.ok(g.positions.every(Number.isFinite));
        assert.ok(signedVolume(g) > 0, "rock must have outward-facing winding");
        const edges = new Map();
        const ids = g.indices;
        const key = (vi) =>
          [g.positions[vi * 3], g.positions[vi * 3 + 1], g.positions[vi * 3 + 2]].map((v) => v.toFixed(5)).join(",");
        for (let i = 0; i < ids.length; i += 3) {
          for (let j = 0; j < 3; j++) {
            const edge = [key(ids[i + j]), key(ids[i + ((j + 1) % 3)])].sort().join("/");
            edges.set(edge, (edges.get(edge) || 0) + 1);
          }
        }
        assert.ok(
          [...edges.values()].every((c) => c === 2),
          "rock must be a closed manifold",
        );
        g.dispose();
      }
      const crystal = sculptedCrystal(w, h, d, seed);
      const cb = crystal.computeBounds();
      assert.ok(cb.min.y >= -1e-4 && cb.max.y <= h + 1e-4);
      assert.ok(cb.min.x >= -w / 2 - 1e-4 && cb.max.x <= w / 2 + 1e-4);
      assert.ok(cb.min.z >= -d / 2 - 1e-4 && cb.max.z <= d / 2 + 1e-4);
      assert.ok(signedVolume(crystal) > 0, "crystal must have outward-facing winding");
      crystal.dispose();
    }
  }
});

test("all solid mesh primitives have outward-facing winding and beveledBox stays within bounds", () => {
  for (const [name, g] of [
    ["box", box(2, 1, 3)],
    ["beveledBox", beveledBox(2, 1, 3)],
    ["cylinder", cylinder(0.4, 0.6, 1.5, 10)],
    ["cone", cone(0.6, 1.4, 8)],
    ["sphere", sphere(0.7, 10, 8)],
    ["octahedron", octahedron(0.8)],
    ["icosahedron", icosahedron(0.8, 1)],
    ["torus", torus(1.0, 0.25, 6, 14)],
    [
      "closedLathe",
      closedLathe(
        [
          [0.3, 0],
          [0.5, 0.4],
          [0.35, 0.8],
          [0.02, 1.0],
        ],
        8,
      ),
    ],
  ]) {
    assert.ok(signedVolume(g) > 0, `${name} must have positive signed volume (outward winding)`);
    g.dispose();
  }
  for (const size of [
    [2, 1, 3],
    [0.4, 0.8, 0.3],
    [8, 0.4, 2],
  ]) {
    const g = beveledBox(...size);
    const b = g.computeBounds();
    assert.ok(b.min.x >= -size[0] / 2 - 1e-5 && b.max.x <= size[0] / 2 + 1e-5);
    assert.ok(b.min.y >= -size[1] / 2 - 1e-5 && b.max.y <= size[1] / 2 + 1e-5);
    assert.ok(b.min.z >= -size[2] / 2 - 1e-5 && b.max.z <= size[2] / 2 + 1e-5);
    const edges = new Map();
    const ids = g.indices;
    for (let i = 0; i < ids.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const edge = [ids[i + j], ids[i + ((j + 1) % 3)]].sort((x, y) => x - y).join(":");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((n) => n === 2),
      "beveledBox must be closed",
    );
    assert.ok(signedVolume(g) > 0, "beveledBox must have outward-facing winding");
    g.dispose();
  }
});

test("baked contact shading is deterministic, feathered and leaves open floor clear", () => {
  const empty = createGroundOcclusion(12, 12, [], 128);
  assert.ok(empty.data[64 * 128 + 64] === 255);
  const obstacles = [
    { t: "c", x: 2, y: -1, r: 1 },
    { t: "b", x: -4, y: 3, w: 2, h: 0.6 },
  ];
  const a = createGroundOcclusion(12, 12, obstacles, 128);
  const b = createGroundOcclusion(12, 12, obstacles, 128);
  assert.deepEqual(a.data, b.data);
  const sample = (x, z) => a.data[Math.floor(((z + 12) / 24) * 128) * 128 + Math.floor(((x + 12) / 24) * 128)];
  assert.ok(sample(2, -1) < 190 && sample(-4, 3) < 190, "solid feet need contact shading");
  assert.ok(sample(-9, 9) > 250, "open floor stays clear");
  assert.ok(sample(3.2, -1) < sample(4.8, -1), "penumbra must fade outside the footprint");
  assert.ok(
    a.data.some((v) => v > 190 && v < 250),
    "falloff must have intermediate values",
  );
  for (const tex of [empty, a, b]) tex.dispose();
});

test("custom WebGL2 GLSL 300 es shaders are valid and zero Three.js dependencies remain", () => {
  const s = stylizedProgram(true);
  const f = floorProgram();
  const p = postCompositeProgram();
  assert.ok(s.vs.startsWith("#version 300 es") && s.fs.startsWith("#version 300 es"));
  assert.ok(f.vs.startsWith("#version 300 es") && f.fs.startsWith("#version 300 es"));
  assert.ok(p.vs.startsWith("#version 300 es") && p.fs.startsWith("#version 300 es"));
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies?.three, undefined, "three.js must be removed from package.json");
});
