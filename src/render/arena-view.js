// Ground-up stylized painterly arena builder for all 6 biomes:
// sculpted cover monoliths, perimeter fortifications, exterior vistas, aurora ribbons, animated landmarks and ambient weather.

import { Color, Vec2 } from "../engine/math.js";
import {
  box,
  beveledBox,
  cylinder,
  cone,
  octahedron,
  torus,
  plane,
  lathe,
  sculptedRock,
  sculptedCrystal,
  sculptedCap,
  snowCoat,
  Geometry,
  mergeGeometries,
} from "../engine/geometry.js";
import { Material, MeshNode, Node, mergeStaticNodes } from "../engine/scene.js";
import { createGroundOcclusion } from "./ground-occlusion.js";
import { hexColor, worldMaterial, emissiveMaterial, setWorldShadows } from "./materials.js";
import { GLAZES, FINISH } from "./palette.js";
import { TAU, hashString, makeRng } from "../core/util.js";
import { atmosphereDensity, biomeAtmosphere } from "../data/atmosphere.js";

export const RL_BIOME_LOOK = GLAZES;
export const RL_BIOME_TINT = Object.fromEntries(Object.entries(GLAZES).map(([id, look]) => [id, hexColor(look.trim)]));

function place(parent, geometry, material, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const m = new MeshNode(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

/** Multi-curtain stylized aurora ribbons strictly outside the Aurora Shelf arena bounds. */
export function createAurora(W, H) {
  const group = new Node();
  const mat = new Material({
    shader: "aurora",
    transparent: true,
    additive: true,
    depthWrite: false,
    doubleSide: true,
    fog: false,
  });
  const ribbons = [
    { z: -H - 9.5, y: 6.5, span: W * 2.6, height: 9.5, curve: 3.4 },
    { z: -H - 14.5, y: 9.0, span: W * 3.1, height: 11.5, curve: -4.2 },
  ];
  for (const r of ribbons) {
    const segs = 32;
    const pos = [],
      norm = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = (u - 0.5) * r.span;
      const zOff = Math.sin(u * Math.PI * 2) * r.curve;
      pos.push(x, r.y, r.z + zOff);
      norm.push(0, 0, 1);
      uv.push(u, 0);
      pos.push(x, r.y + r.height, r.z + zOff - 1.2);
      norm.push(0, 0, 1);
      uv.push(u, 1);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2,
        b = a + 1,
        c = a + 2,
        d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const mesh = new MeshNode(new Geometry(pos, norm, uv, idx), mat);
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  group.userData.material = mat;
  return group;
}

/** Sculpted biome-distinct cover obstacles strictly bounded inside each obstacle's collision footprint. */
function buildCover(view, biomeId, obstacles, rng) {
  const props = view.obsGroup;
  const look = GLAZES[biomeId] || GLAZES.city;

  const baseMat = (surface, color) => worldMaterial({ color, surface });
  const glowMat = (color, intensity = 1.5) => emissiveMaterial({ color, emissiveIntensity: intensity });

  const coreGemPartsA = [];
  const coreGemPartsB = [];

  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const seed = hashString(`${biomeId}:obs:${i}:${obs.x}:${obs.y}`);
    const isCircle = obs.t === "c";
    const w = isCircle ? obs.r * 2 : obs.w * 2;
    const d = isCircle ? obs.r * 2 : obs.h * 2;
    const rad = isCircle ? obs.r : Math.min(obs.w, obs.h);

    if (biomeId === "city") {
      // Cozy rain-dappled dusk courtyard lantern pillar / tiled garden shrine wall with warm glowing paper windows
      const h = isCircle ? 2.55 : 2.05;
      const plinth = isCircle ? cylinder(rad * 0.94, rad * 0.98, 0.38, 8) : beveledBox(w * 0.98, 0.38, d * 0.98, 0.12);
      place(props, plinth, baseMat("stone", 0x1a2733), obs.x, 0.19, obs.y);
      const body = isCircle
        ? cylinder(rad * 0.76, rad * 0.86, h - 0.56, 8)
        : beveledBox(w * 0.86, h - 0.56, d * 0.86, 0.14);
      place(props, body, baseMat("armor", look.body), obs.x, 0.38 + (h - 0.56) * 0.5, obs.y);
      // Shingled cozy eaves & brass collar
      const eave = isCircle ? cylinder(rad * 0.68, rad * 0.94, 0.26, 8) : beveledBox(w * 0.95, 0.24, d * 0.95, 0.08);
      place(props, eave, baseMat("metal", 0x223646), obs.x, h - 0.06, obs.y);
      const band = isCircle ? cylinder(rad * 0.83, rad * 0.83, 0.1, 8) : beveledBox(w * 0.88, 0.1, d * 0.88, 0.04);
      place(props, band, glowMat(look.trim, 1.45), obs.x, h * 0.56, obs.y);
      if (isCircle) {
        // Warm paper-glass rooftop lantern with overhanging dark tile hat (clean clearance, zero overlap)
        const lamp = cylinder(rad * 0.27, rad * 0.31, 0.34, 6);
        place(props, lamp, glowMat(look.light, 1.75), obs.x, h + 0.22, obs.y);
        const roof = cylinder(rad * 0.08, rad * 0.64, 0.3, 6).toFlatShaded();
        place(props, roof, baseMat("stone", 0x1d303e), obs.x, h + 0.54, obs.y);
      } else {
        // Cozy glowing side windows inset along the wall top
        const longAxis = Math.max(obs.w, obs.h);
        const span = Math.max(0, longAxis - 0.42);
        for (const s of [-0.55, 0.55]) {
          const lx = obs.x + (obs.w > obs.h ? s * span : 0);
          const lz = obs.y + (obs.h >= obs.w ? s * span : 0);
          place(props, beveledBox(0.32, 0.28, 0.32, 0.06), glowMat(look.light, 1.65), lx, h + 0.18, lz);
          place(props, cone(0.28, 0.18, 4), baseMat("metal", 0x1d303e), lx, h + 0.38, lz, Math.PI / 4);
        }
      }
    } else if (biomeId === "shelf") {
      // Cozy sunlit alpine snow cairn topped with plush snow blanket & faceted glacier ice crystals
      const h = isCircle ? 2.5 : 1.9;
      const rock = sculptedRock(w * 0.96, h, d * 0.96, seed, isCircle);
      place(props, rock, baseMat("stone", 0x5c8ab0), obs.x, 0, obs.y);
      const coat = snowCoat(rock, 0.068, 0.42);
      if (coat.vertexCount > 0) {
        place(props, coat, baseMat("ice", 0xf0fbff), obs.x, 0, obs.y);
      }
      const shard = sculptedCrystal(rad * 0.72, h * 0.78, rad * 0.72, seed + 7);
      place(props, shard, baseMat("crystal", 0x62ccf0), obs.x, h * 0.42, obs.y, rng.range(0, TAU));
      if (isCircle) {
        const subShard = sculptedCrystal(rad * 0.38, h * 0.5, rad * 0.38, seed + 29);
        place(props, subShard, baseMat("crystal", 0x8be4ff), obs.x + rad * 0.22, h * 0.28, obs.y - rad * 0.18, 0.5);
      }
      const core = octahedron(rad * 0.24);
      place(props, core, glowMat(look.accent, 1.55), obs.x, h * 0.98, obs.y, 0, 1, 1.45, 1);
    } else if (biomeId === "marsh") {
      // Cozy mossy swamp stone crowned with cute spotted glowing mushrooms & tiny companion shrooms inside footprint
      const h = isCircle ? 1.75 : 1.45;
      const stone = sculptedRock(w * 0.94, h, d * 0.94, seed, isCircle);
      place(props, stone, baseMat("stone", 0x2c5242), obs.x, 0, obs.y);
      if (isCircle) {
        const stem = lathe(
          [
            [rad * 0.26, 0],
            [rad * 0.18, 0.52],
            [rad * 0.28, 0.88],
          ],
          8,
        );
        place(props, stem, baseMat("organic", 0x628a70), obs.x, h * 0.76, obs.y);
        const cap = sculptedCap(rad * 0.92, rad * 0.58, seed + 13);
        place(props, cap, baseMat("organic", 0x4bc08e), obs.x, h + 0.36, obs.y);
        const gill = cylinder(rad * 0.64, rad * 0.44, 0.1, 10);
        place(props, gill, glowMat(look.accent, 1.55), obs.x, h + 0.38, obs.y);
        // Cute glowing cap spots nestled on top of the mushroom cap
        for (let sp = 0; sp < 4; sp++) {
          const sa = (sp / 4) * TAU + seed;
          const sr = rad * 0.42;
          place(
            props,
            octahedron(rad * 0.13),
            glowMat(look.light, 1.35),
            obs.x + Math.cos(sa) * sr,
            h + 0.36 + rad * 0.42,
            obs.y + Math.sin(sa) * sr,
            sa,
            1,
            0.45,
            1,
          );
        }
      } else {
        // Pair of cute spotted glowing mushrooms safely inside moss wall footprint
        const longAxis = Math.max(obs.w, obs.h);
        const cr = Math.min(rad * 0.84, longAxis * 0.42, 0.6);
        const span = Math.max(0, longAxis - cr - 0.06);
        for (const s of [-0.72, 0.72]) {
          const mx = obs.x + (obs.w > obs.h ? s * span : 0);
          const mz = obs.y + (obs.h >= obs.w ? s * span : 0);
          place(
            props,
            sculptedCap(cr, cr * 0.62, seed + (s > 0 ? 5 : 11)),
            baseMat("organic", 0x4fc492),
            mx,
            h * 0.82,
            mz,
          );
          place(props, cylinder(cr * 0.54, cr * 0.34, 0.08, 8), glowMat(look.accent, 1.55), mx, h * 0.83, mz);
          place(
            props,
            octahedron(cr * 0.18),
            glowMat(look.light, 1.3),
            mx,
            h * 0.82 + cr * 0.54,
            mz,
            0,
            1.1,
            0.45,
            1.1,
          );
        }
      }
    } else if (biomeId === "core") {
      // Deep obsidian altar monolith with faceted radiant amethyst crystal spire & hovering rift gem
      const h = isCircle ? 2.45 : 2.05;
      const monolith = sculptedRock(w * 0.94, h * 0.8, d * 0.94, seed, isCircle);
      place(props, monolith, baseMat("basalt", 0x201942), obs.x, 0, obs.y);
      const crystal = sculptedCrystal(rad * 0.66, h * 0.76, rad * 0.66, seed + 17);
      place(props, crystal, baseMat("crystal", 0x7a54cc), obs.x, h * 0.42, obs.y, rng.range(0, TAU));
      if (isCircle) {
        const ring = torus(rad * 0.62, 0.06, 5, 16);
        place(props, ring, glowMat(look.trim, 1.6), obs.x, h * 0.62, obs.y, 0, 1, 1, 1, Math.PI / 2);
      } else {
        const vein = sculptedCrystal(rad * 0.42, h * 0.58, rad * 0.42, seed + 29);
        place(props, vein, glowMat(look.trim, 1.6), obs.x, h * 0.5, obs.y, rng.range(0, TAU));
      }
      const gem = octahedron(rad * 0.4)
        .scale(0.85, 1.45, 0.85)
        .translate(obs.x, h + 0.34, obs.y);
      (i % 2 ? coreGemPartsB : coreGemPartsA).push(gem);
    } else if (biomeId === "caldera") {
      // Dark charred basalt crags split by warm incandescent orange-gold magma crystal veins
      const h = isCircle ? 2.5 : 2.0;
      const ridge = sculptedRock(w * 0.96, h, d * 0.96, seed, isCircle);
      place(props, ridge, baseMat("basalt", 0x26191b), obs.x, 0, obs.y);
      const spire = sculptedRock(w * 0.58, h * 1.24, d * 0.58, seed + 19, true);
      place(props, spire, baseMat("basalt", 0x3b2222), obs.x, 0, obs.y);
      const vent = sculptedCrystal(rad * 0.46, h * 0.62, rad * 0.46, seed + 31);
      place(props, vent, glowMat(0xff6b1c, 1.75), obs.x, h * 0.48, obs.y, rng.range(0, TAU));
      place(props, octahedron(rad * 0.26), glowMat(look.accent, 1.7), obs.x, h * 1.0, obs.y, 0, 1, 0.78, 1);
    } else {
      // Glass Flats: warm layered terracotta-ochre sandstone mesa & gleaming clustered turquoise desert-glass crystals
      const h = isCircle ? 2.3 : 1.85;
      const baseMesa = sculptedRock(w * 0.96, h * 0.55, d * 0.96, seed, isCircle);
      place(props, baseMesa, baseMat("sandstone", 0xba844e), obs.x, 0, obs.y);
      const topMesa = sculptedRock(w * 0.78, h * 0.96, d * 0.78, seed + 5, isCircle);
      place(props, topMesa, baseMat("sandstone", 0xdeb878), obs.x, 0, obs.y);
      const glass = sculptedCrystal(rad * 0.68, h * 0.84, rad * 0.68, seed + 23);
      place(props, glass, baseMat("crystal", 0x4cd6c6), obs.x, h * 0.44, obs.y, rng.range(0, TAU));
      if (!isCircle) {
        const longAxis = Math.max(obs.w, obs.h);
        const span = Math.max(0, longAxis - rad * 0.58 - 0.14);
        for (const s of [-0.62, 0.62]) {
          const sx = obs.x + (obs.w > obs.h ? s * span : 0);
          const sz = obs.y + (obs.h >= obs.w ? s * span : 0);
          const sub = sculptedCrystal(rad * 0.42, h * 0.68, rad * 0.42, seed + (s > 0 ? 41 : 47));
          place(props, sub, glowMat(look.trim, 1.55), sx, h * 0.42, sz, s * 0.6);
        }
      } else {
        const sideGem = sculptedCrystal(rad * 0.36, h * 0.55, rad * 0.36, seed + 53);
        place(props, sideGem, glowMat(look.trim, 1.5), obs.x + rad * 0.24, h * 0.36, obs.y - rad * 0.18, 0.7);
      }
    }
  }

  // Batched bobbing Core obstacle gems (2 draw calls total instead of 1 per obstacle)
  if (coreGemPartsA.length) {
    const mA = new MeshNode(mergeGeometries(coreGemPartsA), glowMat(look.accent, 1.5));
    props.add(mA);
    view.rlAnim.push({ o: mA, k: "bob", s: 1.35, b: 0, a: 0.14, ph: 0 });
  }
  if (coreGemPartsB.length) {
    const mB = new MeshNode(mergeGeometries(coreGemPartsB), glowMat(look.accent, 1.5));
    props.add(mB);
    view.rlAnim.push({ o: mB, k: "bob", s: 1.35, b: 0, a: 0.14, ph: Math.PI });
  }
}

/** Perimeter framing walls, corner beacons, and rich exterior vista landmarks strictly outside [-W, W] x [-H, H]. */
function buildArchitectureAndVistas(view, biome, W, H, rng) {
  const props = view.sceneryGroup;
  const look = GLAZES[biome.id] || GLAZES.city;
  const surface =
    biome.id === "city"
      ? "metal"
      : biome.id === "shelf"
        ? "ice"
        : biome.id === "marsh"
          ? "wood"
          : biome.id === "caldera"
            ? "basalt"
            : biome.id === "flats"
              ? "sandstone"
              : "stone";

  const wallMat = worldMaterial({ color: look.body, surface });
  const darkMat = worldMaterial({ color: look.base, surface: "basalt" });
  const trimGlow = emissiveMaterial({ color: look.trim, emissiveIntensity: 1.5 });
  const accentGlow = emissiveMaterial({ color: look.accent, emissiveIntensity: 1.5 });

  // Clean low perimeter parapet walls positioned strictly outside W / H so arena floor stays 100% clear
  const wallT = 1.1;
  const wallH = 1.05;
  const offW = W + wallT * 0.5 + 0.18;
  const offH = H + wallT * 0.5 + 0.18;

  // North & South parapets
  for (const sz of [-1, 1]) {
    place(props, beveledBox(W * 2 + wallT * 2 + 0.4, wallH, wallT, 0.16), wallMat, 0, wallH * 0.5, sz * offH);
    place(props, box(W * 2, 0.09, 0.14), trimGlow, 0, wallH + 0.02, sz * (H + 0.28));
  }
  // West & East parapets
  for (const sx of [-1, 1]) {
    place(props, beveledBox(wallT, wallH, H * 2 + 0.36, 0.16), wallMat, sx * offW, wallH * 0.5, 0);
    place(props, box(0.14, 0.09, H * 2), trimGlow, sx * (W + 0.28), wallH + 0.02, 0);
  }

  // Four monumental corner bastions outside the arena corners (beacons merged into 1 draw call)
  const beaconParts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (W + 1.55);
      const cz = sz * (H + 1.55);
      place(props, beveledBox(2.1, 2.8, 2.1, 0.24), darkMat, cx, 1.4, cz);
      place(props, beveledBox(1.55, 0.55, 1.55, 0.12), wallMat, cx, 3.0, cz);
      beaconParts.push(octahedron(0.45).scale(0.85, 1.35, 0.85).translate(cx, 3.85, cz));
    }
  }
  const beaconMesh = new MeshNode(mergeGeometries(beaconParts), accentGlow);
  props.add(beaconMesh);
  view.rlAnim.push({ o: beaconMesh, k: "bob", s: 1.15, b: 0, a: 0.14, ph: 0.4 });

  // Biome-specific exterior vistas & signature landmarks (all strictly outside [-W-2.5, W+2.5] x [-H-2.5, H+2.5])
  let lampLens = null;
  if (biome.id === "city") {
    // Glowing warm amber gallery streetlamps along all four parapets + cozy twilight skyline beyond
    lampLens = emissiveMaterial({ color: look.light, emissiveIntensity: 1.75 });
    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      for (const sz of [-1, 1]) {
        const lx = i * (W * 0.38);
        const lz = sz * (H + 1.75);
        place(props, cylinder(0.14, 0.22, 3.6, 6), darkMat, lx, 1.8, lz);
        place(props, box(0.55, 0.34, 0.55), lampLens, lx, 3.7, lz);
        place(props, cone(0.54, 0.35, 4), darkMat, lx, 4.02, lz, Math.PI / 4);
      }
      for (const sx of [-1, 1]) {
        const lx = sx * (W + 1.75);
        const lz = i * (H * 0.38);
        place(props, cylinder(0.14, 0.22, 3.6, 6), darkMat, lx, 1.8, lz);
        place(props, box(0.55, 0.34, 0.55), lampLens, lx, 3.7, lz);
        place(props, cone(0.54, 0.35, 4), darkMat, lx, 4.02, lz, Math.PI / 4);
      }
    }
    // Skyline towers framing North, West, East horizon
    const towerMat = worldMaterial({ color: 0x162332, surface: "metal" });
    const winMat = emissiveMaterial({ color: look.accent, emissiveIntensity: 1.5 });
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.92 + (i / 15) * Math.PI * 0.84;
      const dist = Math.max(W, H) + 8.5 + rng.range(1, 9);
      const tx = Math.cos(a) * dist * 1.18;
      const tz = Math.sin(a) * dist * 0.95 - 2;
      if (Math.abs(tx) < W + 4.2 && Math.abs(tz) < H + 4.2) continue;
      const th = rng.range(7, 17);
      const tw = rng.range(2.6, 4.8);
      place(props, beveledBox(tw, th, tw, 0.18), towerMat, tx, th * 0.5 - 1.5, tz);
      place(props, box(tw * 0.82, 0.16, tw * 0.82), i % 2 ? lampLens : winMat, tx, th * 0.65 - 1.5, tz);
      place(props, box(tw * 0.65, 0.14, tw * 0.65), i % 3 ? winMat : lampLens, tx, th * 0.82 - 1.5, tz);
    }
  } else if (biome.id === "shelf") {
    // Towering faceted glacier peaks & glowing crystal spires around the exterior snowfield
    const iceMat = worldMaterial({ color: 0x4b8eb4, surface: "ice" });
    const snowMat = worldMaterial({ color: 0xdcf4ff, surface: "ice" });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + rng.range(-0.08, 0.08);
      const dist = Math.max(W, H) + 5.5 + rng.range(0.5, 6.5);
      const px = Math.cos(a) * dist;
      const pz = Math.sin(a) * dist;
      if (Math.abs(px) < W + 3.5 && Math.abs(pz) < H + 3.5) continue;
      const h = rng.range(3.8, 9.5);
      const w = rng.range(2.4, 4.6);
      const peak = sculptedRock(w, h, w, i * 31 + 7, true);
      place(props, peak, iceMat, px, -0.2, pz, rng.range(0, TAU));
      const cap = snowCoat(peak, 0.068, 0.42);
      if (cap.vertexCount > 0) place(props, cap, snowMat, px, -0.2, pz);
      if (i % 3 === 0) {
        place(props, sculptedCrystal(1.3, h * 0.65, 1.3, i * 19), accentGlow, px * 0.92, 0, pz * 0.92, a);
      } else if (i % 3 === 1 && Math.abs(px * 0.9) >= W + 4.2 && Math.abs(pz * 0.9) >= H + 4.2) {
        // Cute cozy snow-frosted alpine pine tree silhouette outside snowfield border
        const tx = px * 0.9,
          tz = pz * 0.9;
        place(props, cylinder(0.18, 0.28, 1.4, 6), darkMat, tx, 0.7, tz);
        place(props, cone(1.35, 2.2, 7), snowMat, tx, 2.1, tz);
        place(props, cone(1.02, 1.8, 7), snowMat, tx, 3.3, tz);
      }
    }
  } else if (biome.id === "marsh") {
    // Giant glowing twilight fungi + 1 batched GPU-animated wind-swaying reed mesh strictly outside arena bounds
    const capMat = worldMaterial({ color: 0x399e78, surface: "organic" });
    const stemMat = worldMaterial({ color: 0x243c34, surface: "wood" });
    const reedMat = worldMaterial({ color: 0x356b4d, surface: "organic", reedWind: true, doubleSide: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng.range(-0.1, 0.1);
      const dist = Math.max(W, H) + 4.8 + rng.range(0.5, 5.5);
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      if (Math.abs(mx) < W + 3.2 && Math.abs(mz) < H + 3.2) continue;
      const sh = rng.range(2.2, 4.8);
      const cr = rng.range(1.1, 2.2);
      place(props, cylinder(cr * 0.18, cr * 0.3, sh, 7), stemMat, mx, sh * 0.5, mz);
      place(props, sculptedCap(cr, cr * 0.55, i * 29 + 3), capMat, mx, sh - 0.15, mz);
      place(props, cylinder(cr * 0.68, cr * 0.45, 0.12, 10), accentGlow, mx, sh - 0.14, mz);
    }
    // Single merged reed mesh animated cleanly in vertex shader via uReedWind (saves 27 draw calls!)
    const reedParts = [];
    for (let i = 0; i < 28; i++) {
      const side = i % 4;
      const u = rng.range(-0.92, 0.92);
      const rx = side < 2 ? u * W : (side === 2 ? -1 : 1) * (W + rng.range(2.8, 4.8));
      const rz = side >= 2 ? u * H : (side === 0 ? -1 : 1) * (H + rng.range(2.8, 4.8));
      const sy = rng.range(0.8, 1.35);
      reedParts.push(
        cone(0.11, 1.9, 5).translate(0, 0.95, 0).rotateY(rng.range(0, TAU)).scale(1, sy, 1).translate(rx, 0, rz),
      );
    }
    const reeds = new MeshNode(mergeGeometries(reedParts), reedMat);
    props.add(reeds);
  } else if (biome.id === "core") {
    // Floating obsidian monolith shards & glowing runes batched into 4 bobbing draw calls (saves 23+ draw calls!)
    const obsMat = worldMaterial({ color: 0x2d2554, surface: "basalt" });
    const shardsA = [];
    const shardsB = [];
    const runesA = [];
    const runesB = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const dist = Math.max(W, H) + 5.2 + rng.range(0.5, 6.0);
      const fx = Math.cos(a) * dist;
      const fz = Math.sin(a) * dist;
      if (Math.abs(fx) < W + 3.4 && Math.abs(fz) < H + 3.4) continue;
      const h = rng.range(2.5, 6.2);
      const fy = rng.range(0.8, 3.6);
      const shardGeo = sculptedCrystal(rng.range(1.2, 2.3), h, rng.range(1.2, 2.3), i * 41)
        .rotateY(a)
        .translate(fx, fy, fz);
      (i % 2 ? shardsB : shardsA).push(shardGeo);
      if (i % 2 === 0) {
        (i % 4 ? runesB : runesA).push(octahedron(0.42).translate(fx, fy + h + 0.55, fz));
      }
    }
    if (shardsA.length) {
      const m = new MeshNode(mergeGeometries(shardsA), obsMat);
      props.add(m);
      view.rlAnim.push({ o: m, k: "bob", s: 0.65, b: 0, a: 0.34, ph: 0 });
    }
    if (shardsB.length) {
      const m = new MeshNode(mergeGeometries(shardsB), obsMat);
      props.add(m);
      view.rlAnim.push({ o: m, k: "bob", s: 0.65, b: 0, a: 0.34, ph: Math.PI });
    }
    if (runesA.length) {
      const m = new MeshNode(mergeGeometries(runesA), accentGlow);
      props.add(m);
      view.rlAnim.push({ o: m, k: "bob", s: 1.25, b: 0, a: 0.26, ph: 0.5 });
    }
    if (runesB.length) {
      const m = new MeshNode(mergeGeometries(runesB), accentGlow);
      props.add(m);
      view.rlAnim.push({ o: m, k: "bob", s: 1.25, b: 0, a: 0.26, ph: 0.5 + Math.PI });
    }
  } else if (biome.id === "caldera") {
    // Dramatic jagged volcanic caldera crags & glowing lava vents ringing the exterior
    const basaltMat = worldMaterial({ color: 0x352324, surface: "basalt" });
    const lavaGlow = emissiveMaterial({ color: 0xff6218, emissiveIntensity: 1.5 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + rng.range(-0.07, 0.07);
      const dist = Math.max(W, H) + 5.0 + rng.range(0.5, 7.0);
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist;
      if (Math.abs(cx) < W + 3.5 && Math.abs(cz) < H + 3.5) continue;
      const h = rng.range(3.6, 10.2);
      const w = rng.range(2.6, 5.2);
      place(props, sculptedRock(w, h, w, i * 37 + 11, true), basaltMat, cx, -0.3, cz, a);
      if (i % 3 === 0) {
        place(props, cylinder(w * 0.35, w * 0.42, 0.22, 7), lavaGlow, cx * 0.9, 0.12, cz * 0.9);
      }
    }
  } else {
    // Glass Flats: wind-eroded desert arches & monumental translucent fused-glass obelisks
    const sandMat = worldMaterial({ color: 0xb28752, surface: "sandstone" });
    const glassMat = worldMaterial({ color: 0x52c8b8, surface: "crystal" });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + rng.range(-0.08, 0.08);
      const dist = Math.max(W, H) + 5.5 + rng.range(0.5, 6.5);
      const gx = Math.cos(a) * dist;
      const gz = Math.sin(a) * dist;
      if (Math.abs(gx) < W + 3.5 && Math.abs(gz) < H + 3.5) continue;
      const h = rng.range(3.4, 8.2);
      if (i % 3 === 0) {
        // Wind-carved desert sandstone arch
        place(props, sculptedRock(1.4, h * 0.72, 1.4, i * 17), sandMat, gx - 1.3, 0, gz);
        place(props, sculptedRock(1.4, h * 0.72, 1.4, i * 17 + 1), sandMat, gx + 1.3, 0, gz);
        place(props, beveledBox(4.2, 0.95, 1.5, 0.22), sandMat, gx, h * 0.72, gz);
      } else {
        place(
          props,
          sculptedCrystal(rng.range(1.2, 2.2), h, rng.range(1.2, 2.2), i * 23),
          i % 2 ? glassMat : sandMat,
          gx,
          0,
          gz,
          a,
        );
      }
    }
  }
  return lampLens;
}

export class ArenaView {
  constructor(scene, engine = null) {
    this.scene = scene;
    this.engine = engine;
    this.group = new Node();
    scene.add(this.group);
    this.uniforms = {
      uTerrainReady: { value: 0 },
      uOcclusion: { value: null },
      uGrid: { value: new Color() },
      uGlaze: { value: new Color() },
      uAccent: { value: new Color() },
      uHalf: { value: new Vec2(18, 18) },
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uStyle: { value: 5 },
      uDark: { value: 0 },
    };
    this.floorMat = new Material({
      shader: "floor",
      uniforms: this.uniforms,
      fog: true,
    });
    this.biomeId = null;
    this.layKey = null;
    this.groundOcclusion = null;
    this.rlAnim = [];
    this.rise = 1;
  }

  build(biome, layout, animate = false) {
    layout = layout || { key: biome.id + ":classic", W: biome.W, H: biome.H, obs: biome.obstacles, deco: 0 };
    if (this.layKey === layout.key) return;
    const first = this.layKey == null;
    this.layKey = layout.key;
    this.biomeId = biome.id;

    // Dispose previous arena GPU geometry cleanly
    this.group.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();
      if (obj.geometry) obj.geometry.dispose();
    });
    this.group.clear();

    const look = GLAZES[biome.id] || GLAZES.city;
    this.uniforms.uGrid.value.setHex(look.trim);
    this.uniforms.uGlaze.value.setHex(look.base);
    this.uniforms.uAccent.value.setHex(look.accent);
    this.uniforms.uHalf.value.set(layout.W, layout.H);
    this.uniforms.uStyle.value = look.style;

    this.groundOcclusion?.dispose();
    this.groundOcclusion = createGroundOcclusion(layout.W, layout.H, layout.obs);
    this.uniforms.uOcclusion.value = this.groundOcclusion;
    if (this.engine) this.engine.textures.occlusion = this.groundOcclusion;

    // Stylized painterly arena floor plane
    const floorGeo = plane(120, 120, 1, 1).rotateX(-Math.PI / 2);
    const floor = new MeshNode(floorGeo, this.floorMat);
    floor.receiveShadow = true;
    floor.renderOrder = -1;
    this.group.add(floor);

    const props = new Node();
    this.group.add(props);
    this.obsGroup = props;
    const scenery = new Node();
    this.group.add(scenery);
    this.sceneryGroup = scenery;
    this.rlAnim = [];

    buildCover(this, biome.id, layout.obs, makeRng(hashString(layout.key + ":cover")));
    this.lampLens = buildArchitectureAndVistas(
      this,
      biome,
      layout.W,
      layout.H,
      makeRng(hashString(layout.key + ":arch")),
    );

    if (biome.id === "shelf") {
      const aurora = createAurora(layout.W, layout.H);
      this.group.add(aurora);
      this.rlAnim.push({ o: aurora, k: "aurora" });
    }

    const keep = new Set(this.rlAnim.map((a) => a.o));
    if (this.lampLens) keep.add(this.lampLens);
    setWorldShadows(this.obsGroup);
    setWorldShadows(this.sceneryGroup);
    mergeStaticNodes(this.obsGroup, keep);
    mergeStaticNodes(this.sceneryGroup, keep);

    this.rise = animate && !first ? 0 : 1;
    props.position.y = this.rise < 1 ? -2.4 : 0;
  }

  update(dt, px, pz, pulse) {
    if (this.obsGroup && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 0.65);
      const ease = 1 - Math.pow(1 - this.rise, 3);
      this.obsGroup.position.y = -2.4 * (1 - ease);
    }
    this.uniforms.uTime.value += dt;
    this.uniforms.uPulse.value = pulse;
    const time = this.uniforms.uTime.value;
    if (this.biomeId === "city" && this.lampLens) {
      const dark = this.uniforms.uDark.value;
      const ember = (1.3 + 0.25 * Math.cos(time * 0.9)) * (1 - dark * 0.65);
      this.lampLens.emissiveIntensity = ember;
    }
    for (const anim of this.rlAnim) {
      const obj = anim.o;
      if (anim.k === "spin" || anim.k === "spinbob") obj.rotation.y += dt * anim.s;
      if (anim.k === "bob" || anim.k === "spinbob") {
        obj.position.y = anim.b + Math.sin(time * (anim.s || 1) + anim.ph) * (anim.a || 0.14);
      }
    }
  }
}

/** Biome-specific ambient atmospheric particles (rain, snow, glowing spores, rift motes, embers, desert dust). */
export function rlAmbient(renderer, dt, world, opts = {}) {
  const biome = renderer.biome;
  if (!biome || !(dt > 0) || dt > 0.25) return;
  const atm = biomeAtmosphere[biome.id];
  if (!atm) return;
  const density = atmosphereDensity(renderer.maxParticles, renderer.P.n);
  if (density <= 0) return;
  const rate = (opts.menu ? 14 : 22) * density * dt;
  const count = Math.floor(rate) + (Math.random() < rate - Math.floor(rate) ? 1 : 0);
  const W = world?.arena?.W || biome.W || 18;
  const H = world?.arena?.H || biome.H || 18;
  const cx = opts.menu ? 0 : renderer.camX;
  const cz = opts.menu ? 0 : renderer.camZ;

  for (let i = 0; i < count; i++) {
    const x = Math.max(-W - 3, Math.min(W + 3, cx + (Math.random() * 2 - 1) * 18));
    const z = Math.max(-H - 3, Math.min(H + 3, cz + (Math.random() * 2 - 1) * 14));
    switch (biome.id) {
      case "city":
        // Falling diagonal rain streaks & warm lamp motes
        if (Math.random() < 0.72) {
          renderer.emit(x, 4 + Math.random() * 4, z, -1.2, -10, 0.8, 0.55, 0.14, hexColor(0x88dce8), {
            ambient: true,
            spark: true,
            drag: 0,
          });
        } else {
          renderer.emit(x, 0.4 + Math.random() * 2, z, 0.2, 0.4, 0.1, 2.2, 0.18, hexColor(FINISH.brass), {
            ambient: true,
            drag: 1,
          });
        }
        break;
      case "shelf":
        // Drifting glacier snowflakes
        renderer.emit(
          x,
          3.2 + Math.random() * 4.5,
          z,
          1.8 + Math.random(),
          -1.1 - Math.random() * 0.6,
          0.6,
          2.6,
          0.22,
          hexColor(0xe6f8ff),
          {
            ambient: true,
            drag: 0.2,
          },
        );
        break;
      case "marsh":
        // Floating bioluminescent mint fireflies/spores
        renderer.emit(
          x,
          0.3 + Math.random() * 2.4,
          z,
          (Math.random() - 0.5) * 0.7,
          0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.7,
          2.8,
          0.2,
          hexColor(0x66ffbe),
          {
            ambient: true,
            drag: 0.6,
          },
        );
        break;
      case "core":
        // Rising violet-magenta rift motes
        renderer.emit(
          x,
          0.2 + Math.random() * 2.2,
          z,
          (Math.random() - 0.5) * 0.8,
          0.9 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.8,
          1.9,
          0.18,
          hexColor(Math.random() < 0.5 ? 0xc27cff : 0xff62b8),
          {
            ambient: true,
            spark: true,
            drag: 0.5,
          },
        );
        break;
      case "caldera":
        // Rising incandescent volcanic embers
        renderer.emit(
          x,
          0.15 + Math.random() * 1.4,
          z,
          (Math.random() - 0.5) * 1.2,
          1.8 + Math.random() * 1.6,
          (Math.random() - 0.5) * 1.2,
          1.8,
          0.19,
          hexColor(Math.random() < 0.6 ? 0xff8a2a : 0xffe078),
          {
            ambient: true,
            spark: true,
            drag: 0.4,
          },
        );
        break;
      default:
        // Swirling warm desert sand/gold motes
        renderer.emit(
          x,
          0.3 + Math.random() * 2.6,
          z,
          2.2 + Math.random() * 1.4,
          0.15,
          (Math.random() - 0.5) * 0.8,
          2.1,
          0.2,
          hexColor(0xf6d896),
          {
            ambient: true,
            drag: 0.3,
          },
        );
    }
  }
}

export function rlSkinParticles(renderer, dt, world) {
  if (!world?.enemies || !(dt > 0) || !renderer.biome) return;
  const col = RL_BIOME_TINT[renderer.biome.id];
  if (!col) return;
  for (const e of world.enemies) {
    if (e.elite && Math.random() < dt * 2.2) {
      renderer.emit(
        e.x + (Math.random() - 0.5) * e.r,
        0.6,
        e.y + (Math.random() - 0.5) * e.r,
        0,
        1.1,
        0,
        0.5,
        0.14,
        col,
        {
          ambient: true,
          spark: true,
          drag: 1.5,
        },
      );
    }
  }
}
