// Ground-up stylized storybook diorama arena & exterior world builder for all 6 biomes:
// sculpted cover monoliths, fortified gateways/bridges, rich lived-in exterior worlds, aurora ribbons & ambient weather.

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

/** True when a circle of radius `r` centered at `(x, z)` lies strictly outside the walkable `[-W, W] x [-H, H]` box. */
function safeExterior(x, z, r, W, H, pad = 0.35) {
  return Math.abs(x) - r >= W + pad || Math.abs(z) - r >= H + pad;
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
    { z: -H - 10.5, y: 6.5, span: W * 2.75, height: 9.6, curve: 3.2 },
    { z: -H - 15.2, y: 8.8, span: W * 3.15, height: 11.6, curve: -3.8 },
    { z: -H - 20.0, y: 10.8, span: W * 3.55, height: 12.4, curve: 3.0 },
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

  const matCache = new Map();
  const baseMat = (surface, color) => {
    const k = `${surface}:${color}`;
    let m = matCache.get(k);
    if (!m) {
      m = worldMaterial({ color, surface });
      matCache.set(k, m);
    }
    return m;
  };
  const glowMat = (color, intensity = 1.12) => {
    const k = `glow:${color}:${intensity.toFixed(2)}`;
    let m = matCache.get(k);
    if (!m) {
      m = emissiveMaterial({ color, emissiveIntensity: intensity });
      matCache.set(k, m);
    }
    return m;
  };

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
      // Ornate rain-slicked courtyard pagoda lantern-shrine / dressed slate garden wall with warm paper windows
      const h = isCircle ? 2.58 : 2.08;
      const plinth = isCircle ? cylinder(rad * 0.92, rad * 0.98, 0.38, 8) : beveledBox(w * 0.97, 0.38, d * 0.97, 0.11);
      place(props, plinth, baseMat("stone", 0x1a2836), obs.x, 0.19, obs.y);
      const body = isCircle
        ? cylinder(rad * 0.72, rad * 0.84, h - 0.58, 8)
        : beveledBox(w * 0.84, h - 0.58, d * 0.84, 0.13);
      place(props, body, baseMat("armor", look.body), obs.x, 0.38 + (h - 0.58) * 0.5, obs.y);
      // Brass filigree waist band & dark slate eaves
      const band = isCircle ? cylinder(rad * 0.8, rad * 0.8, 0.1, 8) : beveledBox(w * 0.87, 0.09, d * 0.87, 0.04);
      place(props, band, baseMat("metal", FINISH.brass), obs.x, h * 0.52, obs.y);
      const eave = isCircle
        ? cylinder(rad * 0.58, rad * 0.95, 0.28, 8).toFlatShaded()
        : beveledBox(w * 0.95, 0.24, d * 0.95, 0.08);
      place(props, eave, baseMat("stone", 0x203546), obs.x, h - 0.06, obs.y);
      if (isCircle) {
        const lamp = cylinder(rad * 0.29, rad * 0.33, 0.38, 6);
        place(props, lamp, glowMat(look.light, 1.24), obs.x, h + 0.24, obs.y);
        const roof = cylinder(rad * 0.06, rad * 0.68, 0.34, 6).toFlatShaded();
        place(props, roof, baseMat("basalt", 0x1a2d3c), obs.x, h + 0.58, obs.y);
        place(props, octahedron(rad * 0.11), baseMat("metal", FINISH.brass), obs.x, h + 0.8, obs.y, 0, 1, 1.4, 1);
      } else {
        // Warm recessed paper-screen window strips + rooftop lanterns
        place(props, beveledBox(w * 0.68, 0.22, d * 0.88, 0.03), glowMat(look.light, 1.08), obs.x, h * 0.68, obs.y);
        const longAxis = Math.max(obs.w, obs.h);
        const span = Math.max(0, longAxis - 0.44);
        for (const s of [-0.55, 0.55]) {
          const lx = obs.x + (obs.w > obs.h ? s * span : 0);
          const lz = obs.y + (obs.h >= obs.w ? s * span : 0);
          place(props, beveledBox(0.32, 0.3, 0.32, 0.06), glowMat(look.light, 1.22), lx, h + 0.18, lz);
          place(props, cone(0.29, 0.2, 4), baseMat("basalt", 0x1a2d3c), lx, h + 0.41, lz, Math.PI / 4);
        }
      }
    } else if (biomeId === "shelf") {
      // Carved Nordic alpine rune-stones with thick snowdrifts, copper bindings & sapphire glacier crystals
      const h = isCircle ? 2.52 : 1.94;
      const rock = sculptedRock(w * 0.95, h, d * 0.95, seed, isCircle);
      place(props, rock, baseMat("stone", 0x355c82), obs.x, 0, obs.y);
      const coat = snowCoat(rock, 0.082, 0.38);
      if (coat.vertexCount > 0) {
        place(props, coat, baseMat("stone", 0xcce8f8), obs.x, 0, obs.y);
      }
      const copperBand = isCircle
        ? cylinder(rad * 0.8, rad * 0.84, 0.09, 8)
        : beveledBox(w * 0.85, 0.09, d * 0.85, 0.04);
      place(props, copperBand, baseMat("metal", FINISH.copper), obs.x, h * 0.36, obs.y);
      const runeCollar = isCircle
        ? cylinder(rad * 0.77, rad * 0.8, 0.07, 8)
        : beveledBox(w * 0.82, 0.07, d * 0.82, 0.03);
      place(props, runeCollar, glowMat(look.trim, 0.98), obs.x, h * 0.48, obs.y);
      const shard = sculptedCrystal(rad * 0.7, h * 0.82, rad * 0.7, seed + 7);
      place(props, shard, baseMat("crystal", 0x3ca2d2), obs.x, h * 0.42, obs.y, rng.range(0, TAU));
      if (isCircle) {
        const subShard = sculptedCrystal(rad * 0.4, h * 0.54, rad * 0.4, seed + 29);
        place(props, subShard, baseMat("crystal", 0x66c8ec), obs.x + rad * 0.22, h * 0.28, obs.y - rad * 0.18, 0.5);
      }
      place(props, octahedron(rad * 0.23), glowMat(look.accent, 1.16), obs.x, h * 1.0, obs.y, 0, 1, 1.45, 1);
    } else if (biomeId === "marsh") {
      // Mossy bog stone hummocks crowned with multi-tiered spotted toadstool colonies & glowing gills
      const h = isCircle ? 1.68 : 1.42;
      const stone = sculptedRock(w * 0.94, h, d * 0.94, seed, isCircle);
      place(props, stone, baseMat("stone", 0x224234), obs.x, 0, obs.y);
      const capColor = i % 3 === 0 ? 0x2a8e68 : i % 3 === 1 ? 0x369a82 : 0x7c8e42;
      if (isCircle) {
        const stem = lathe(
          [
            [rad * 0.25, 0],
            [rad * 0.17, 0.52],
            [rad * 0.26, 0.9],
          ],
          8,
        );
        place(props, stem, baseMat("organic", 0x829c7e), obs.x, h * 0.74, obs.y);
        const cap = sculptedCap(rad * 0.88, rad * 0.56, seed + 13);
        place(props, cap, baseMat("organic", capColor), obs.x, h + 0.36, obs.y);
        place(props, cylinder(rad * 0.62, rad * 0.42, 0.1, 10), glowMat(look.accent, 1.16), obs.x, h + 0.37, obs.y);
        // Side baby toadstool tucked inside footprint for organic storybook asymmetry
        const subA = (seed % 628) * 0.01;
        const sx = obs.x + Math.cos(subA) * rad * 0.42;
        const sz = obs.y + Math.sin(subA) * rad * 0.42;
        place(props, cylinder(rad * 0.09, rad * 0.13, 0.44, 6), baseMat("organic", 0x829c7e), sx, h * 0.78, sz);
        place(props, sculptedCap(rad * 0.38, rad * 0.26, seed + 41), baseMat("organic", 0xd4964a), sx, h + 0.02, sz);
        for (let sp = 0; sp < 4; sp++) {
          const sa = (sp / 4) * TAU + seed;
          const sr = rad * 0.4;
          place(
            props,
            octahedron(rad * 0.12),
            glowMat(0xffe694, 1.04),
            obs.x + Math.cos(sa) * sr,
            h + 0.36 + rad * 0.42,
            obs.y + Math.sin(sa) * sr,
            sa,
            1,
            0.42,
            1,
          );
        }
      } else {
        const longAxis = Math.max(obs.w, obs.h);
        const cr = Math.min(rad * 0.82, longAxis * 0.42, 0.58);
        const span = Math.max(0, longAxis - cr - 0.08);
        for (const [idxS, s] of [
          [0, -0.7],
          [1, 0.7],
        ]) {
          const mx = obs.x + (obs.w > obs.h ? s * span : 0);
          const mz = obs.y + (obs.h >= obs.w ? s * span : 0);
          const hOff = idxS ? 0.94 : 0.78;
          place(props, cylinder(cr * 0.18, cr * 0.24, 0.42, 6), baseMat("organic", 0x829c7e), mx, h * 0.7, mz);
          place(
            props,
            sculptedCap(cr, cr * 0.62, seed + (s > 0 ? 5 : 11)),
            baseMat("organic", idxS ? capColor : 0xc88c44),
            mx,
            h * hOff,
            mz,
          );
          place(props, cylinder(cr * 0.54, cr * 0.34, 0.08, 8), glowMat(look.accent, 1.14), mx, h * hOff + 0.01, mz);
          place(props, octahedron(cr * 0.16), glowMat(0xffe694, 1.02), mx, h * hOff + cr * 0.54, mz, 0, 1.1, 0.42, 1.1);
        }
      }
    } else if (biomeId === "core") {
      // Carved obsidian sanctuary reliquaries with kintsugi brass seams & amethyst astrolabe prisms
      const h = isCircle ? 2.48 : 2.06;
      const monolith = sculptedRock(w * 0.94, h * 0.8, d * 0.94, seed, isCircle);
      place(props, monolith, baseMat("basalt", 0x1d163c), obs.x, 0, obs.y);
      const kintsugi = isCircle
        ? cylinder(rad * 0.82, rad * 0.86, 0.09, 8)
        : beveledBox(w * 0.86, 0.09, d * 0.86, 0.04);
      place(props, kintsugi, baseMat("metal", FINISH.brass), obs.x, h * 0.36, obs.y);
      const crystal = sculptedCrystal(rad * 0.66, h * 0.78, rad * 0.66, seed + 17);
      place(props, crystal, baseMat("crystal", 0x6a44c2), obs.x, h * 0.42, obs.y, rng.range(0, TAU));
      if (isCircle) {
        const ring = torus(rad * 0.62, 0.058, 5, 16);
        place(props, ring, baseMat("metal", FINISH.brass), obs.x, h * 0.66, obs.y, 0, 1, 1, 1, Math.PI / 2);
      } else {
        const vein = sculptedCrystal(rad * 0.42, h * 0.58, rad * 0.42, seed + 29);
        place(props, vein, glowMat(look.trim, 1.16), obs.x, h * 0.5, obs.y, rng.range(0, TAU));
      }
      const gem = octahedron(rad * 0.4)
        .scale(0.85, 1.45, 0.85)
        .translate(obs.x, h + 0.34, obs.y);
      (i % 2 ? coreGemPartsB : coreGemPartsA).push(gem);
    } else if (biomeId === "caldera") {
      // Sculpted hexagonal basalt column clusters & dwarven forge-braziers with glowing magma grates
      const h = isCircle ? 2.48 : 2.0;
      if (isCircle) {
        place(
          props,
          cylinder(rad * 0.86, rad * 0.94, h * 0.72, 6).toFlatShaded(),
          baseMat("basalt", 0x382426),
          obs.x,
          h * 0.36,
          obs.y,
        );
        place(
          props,
          cylinder(rad * 0.58, rad * 0.66, h * 0.96, 6).toFlatShaded(),
          baseMat("basalt", 0x4e302e),
          obs.x,
          h * 0.48,
          obs.y,
          Math.PI / 6,
        );
        place(
          props,
          torus(rad * 0.68, 0.08, 5, 12),
          baseMat("metal", FINISH.copper),
          obs.x,
          h * 0.74,
          obs.y,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
        place(props, octahedron(rad * 0.34), glowMat(0xee681e, 1.26), obs.x, h * 0.96, obs.y, 0, 1, 0.82, 1);
      } else {
        const ridge = sculptedRock(w * 0.95, h, d * 0.95, seed, false);
        place(props, ridge, baseMat("basalt", 0x382426), obs.x, 0, obs.y);
        const spire = sculptedRock(w * 0.58, h * 1.22, d * 0.58, seed + 19, true);
        place(props, spire, baseMat("basalt", 0x523432), obs.x, 0, obs.y);
        place(
          props,
          beveledBox(w * 0.82, 0.09, d * 0.82, 0.03),
          baseMat("metal", FINISH.copper),
          obs.x,
          h * 0.42,
          obs.y,
        );
        const vent = sculptedCrystal(rad * 0.46, h * 0.62, rad * 0.46, seed + 31);
        place(props, vent, glowMat(0xee5e18, 1.26), obs.x, h * 0.48, obs.y, rng.range(0, TAU));
        place(props, octahedron(rad * 0.26), glowMat(look.accent, 1.18), obs.x, h * 1.0, obs.y, 0, 1, 0.78, 1);
      }
    } else {
      // Glass Flats: carved sandstone temple plinths with glazed turquoise trim & vitrified desert-glass lotuses
      const h = isCircle ? 2.34 : 1.88;
      const baseMesa = sculptedRock(w * 0.95, h * 0.56, d * 0.95, seed, isCircle);
      place(props, baseMesa, baseMat("sandstone", 0x8e5e34), obs.x, 0, obs.y);
      const topMesa = sculptedRock(w * 0.78, h * 0.96, d * 0.78, seed + 5, isCircle);
      place(props, topMesa, baseMat("sandstone", 0xbc8c50), obs.x, 0, obs.y);
      const tileBand = isCircle ? cylinder(rad * 0.8, rad * 0.83, 0.08, 8) : beveledBox(w * 0.83, 0.08, d * 0.83, 0.03);
      place(props, tileBand, baseMat("metal", FINISH.brass), obs.x, h * 0.44, obs.y);
      const glass = sculptedCrystal(rad * 0.64, h * 0.88, rad * 0.64, seed + 23);
      place(props, glass, baseMat("crystal", 0x26a89c), obs.x, h * 0.46, obs.y, rng.range(0, TAU));
      if (!isCircle) {
        const longAxis = Math.max(obs.w, obs.h);
        const span = Math.max(0, longAxis - rad * 0.58 - 0.14);
        for (const s of [-0.62, 0.62]) {
          const sx = obs.x + (obs.w > obs.h ? s * span : 0);
          const sz = obs.y + (obs.h >= obs.w ? s * span : 0);
          const sub = sculptedCrystal(rad * 0.42, h * 0.68, rad * 0.42, seed + (s > 0 ? 41 : 47));
          place(props, sub, glowMat(look.trim, 1.1), sx, h * 0.44, sz, s * 0.6);
        }
      } else {
        for (let p = 0; p < 3; p++) {
          const pa = (p / 3) * TAU + seed;
          const pr = rad * 0.34;
          const petal = sculptedCrystal(rad * 0.32, h * 0.52, rad * 0.32, seed + 53 + p);
          place(
            props,
            petal,
            glowMat(look.trim, 1.06),
            obs.x + Math.cos(pa) * pr,
            h * 0.36,
            obs.y + Math.sin(pa) * pr,
            pa,
          );
        }
      }
    }
  }

  if (coreGemPartsA.length) {
    const mA = new MeshNode(mergeGeometries(coreGemPartsA), glowMat(look.accent, 1.16));
    props.add(mA);
    view.rlAnim.push({ o: mA, k: "bob", s: 1.35, b: 0, a: 0.14, ph: 0 });
  }
  if (coreGemPartsB.length) {
    const mB = new MeshNode(mergeGeometries(coreGemPartsB), glowMat(look.accent, 1.16));
    props.add(mB);
    view.rlAnim.push({ o: mB, k: "bob", s: 1.35, b: 0, a: 0.14, ph: Math.PI });
  }
}

/** Perimeter ramparts, cardinal bridges/gates, and rich multi-ring storybook worlds around all 4 arena sides! */
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

  const matCache = new Map();
  const mat = (surf, color) => {
    const k = `${surf}:${color}`;
    let m = matCache.get(k);
    if (!m) {
      m = worldMaterial({ color, surface: surf });
      matCache.set(k, m);
    }
    return m;
  };
  const glow = (color, intensity = 1.08) => {
    const k = `g:${color}:${intensity.toFixed(2)}`;
    let m = matCache.get(k);
    if (!m) {
      m = emissiveMaterial({ color, emissiveIntensity: intensity });
      matCache.set(k, m);
    }
    return m;
  };

  const wallMat = mat(surface, look.body);
  const darkMat = mat("basalt", look.base);
  const trimGlow = glow(look.trim, 0.94);
  const accentGlow = glow(look.accent, 1.1);

  // Clean low perimeter parapet walls positioned strictly outside W / H so arena floor stays 100% clear
  const wallT = 1.12;
  const wallH = 1.06;
  const offW = W + wallT * 0.5 + 0.18;
  const offH = H + wallT * 0.5 + 0.18;

  for (const sz of [-1, 1]) {
    place(props, beveledBox(W * 2 + wallT * 2 + 0.4, wallH, wallT, 0.16), wallMat, 0, wallH * 0.5, sz * offH);
    place(props, box(W * 2, 0.09, 0.14), trimGlow, 0, wallH + 0.02, sz * (H + 0.28));
  }
  for (const sx of [-1, 1]) {
    place(props, beveledBox(wallT, wallH, H * 2 + 0.36, 0.16), wallMat, sx * offW, wallH * 0.5, 0);
    place(props, box(0.14, 0.09, H * 2), trimGlow, sx * (W + 0.28), wallH + 0.02, 0);
  }

  // Four monumental corner bastions outside the arena corners (North & South pairs so bounds stay strictly outside +-H!)
  for (const sz of [-1, 1]) {
    const pairParts = [];
    for (const sx of [-1, 1]) {
      const cx = sx * (W + 1.65);
      const cz = sz * (H + 1.65);
      place(props, beveledBox(2.2, 2.85, 2.2, 0.24), darkMat, cx, 1.42, cz);
      place(props, beveledBox(1.68, 0.56, 1.68, 0.12), wallMat, cx, 3.05, cz);
      pairParts.push(octahedron(0.46).scale(0.85, 1.35, 0.85).translate(cx, 3.92, cz));
    }
    const beaconMesh = new MeshNode(mergeGeometries(pairParts), accentGlow);
    props.add(beaconMesh);
    view.rlAnim.push({ o: beaconMesh, k: "bob", s: 1.15, b: 0, a: 0.14, ph: sz < 0 ? 0.4 : 2.2 });
  }

  let lampLens = null;

  // =========================================================================
  // BIOME 1: BLACKOUT CITY — Canal Moat, Arched Bridges & Cozy Gables Town
  // =========================================================================
  if (biome.id === "city") {
    lampLens = emissiveMaterial({ color: look.light, emissiveIntensity: 1.24 });
    const lampGeos = [];
    const addLampGeo = (g) => lampGeos.push(g);
    const brassMat = mat("metal", FINISH.brass);
    const quayMat = mat("stone", 0x1d2d3d);
    const roofSlate = mat("stone", 0x1a2838);
    const roofCopper = mat("metal", 0x2c5658);
    const woodMat = mat("wood", 0x483226);
    const tealWin = glow(look.accent, 1.02);

    // Stepped stone canal quay embankments around all 4 sides (maxY <= 0.65)
    for (const sz of [-1, 1]) {
      place(props, beveledBox(W * 2 + 4.2, 0.42, 0.95, 0.08), quayMat, 0, 0.21, sz * (H + 1.75));
      place(props, beveledBox(W * 2 + 16.0, 0.36, 1.2, 0.08), quayMat, 0, 0.18, sz * (H + 7.25));
    }
    for (const sx of [-1, 1]) {
      place(props, beveledBox(0.95, 0.42, H * 2 + 2.4, 0.08), quayMat, sx * (W + 1.75), 0.21, 0);
      place(props, beveledBox(1.2, 0.36, H * 2 + 13.6, 0.08), quayMat, sx * (W + 7.25), 0.18, 0);
    }

    // 4 Cardinal Arched Stone-and-Brass Canal Bridges + Courtyard Gateways (N, S, W, E)
    for (const sz of [-1, 1]) {
      const bz = sz * (H + 4.4);
      // Bridge piers & arched stone deck spanning the canal
      place(props, beveledBox(3.8, 0.52, 5.8, 0.1), quayMat, 0, 0.26, bz);
      place(props, beveledBox(3.6, 0.56, 2.8, 0.12), quayMat, 0, 0.66, bz);
      for (const side of [-1.72, 1.72]) {
        place(props, beveledBox(0.28, 0.62, 5.4, 0.05), wallMat, side, 0.72, bz);
        place(props, cylinder(0.16, 0.2, 1.45, 6), darkMat, side, 1.15, bz);
        addLampGeo(box(0.36, 0.3, 0.36).translate(side, 1.98, bz));
        place(props, cone(0.32, 0.22, 4), roofSlate, side, 2.24, bz, Math.PI / 4);
      }
      // Wrought-iron & brass gate arch on inner quay (strictly outside H + 1.8)
      const az = sz * (H + 2.15);
      const gateH = sz < 0 ? 4.4 : 3.4;
      place(props, cylinder(0.22, 0.28, gateH, 8), darkMat, -2.15, gateH * 0.5, az);
      place(props, cylinder(0.22, 0.28, gateH, 8), darkMat, 2.15, gateH * 0.5, az);
      place(props, beveledBox(5.0, 0.38, 0.64, 0.09), darkMat, 0, gateH + 0.1, az);
      place(props, beveledBox(4.1, 0.16, 0.48, 0.05), brassMat, 0, gateH + 0.36, az);
      addLampGeo(box(0.58, 0.38, 0.58).translate(0, gateH - 0.34, az));
    }
    for (const sx of [-1, 1]) {
      const bx = sx * (W + 4.4);
      place(props, beveledBox(5.8, 0.52, 3.8, 0.1), quayMat, bx, 0.26, 0);
      place(props, beveledBox(2.8, 0.56, 3.6, 0.12), quayMat, bx, 0.66, 0);
      for (const side of [-1.72, 1.72]) {
        place(props, beveledBox(5.4, 0.62, 0.28, 0.05), wallMat, bx, 0.72, side);
        place(props, cylinder(0.16, 0.2, 1.45, 6), darkMat, bx, 1.15, side);
        addLampGeo(box(0.36, 0.3, 0.36).translate(bx, 1.98, side));
        place(props, cone(0.32, 0.22, 4), roofSlate, bx, 2.24, side, Math.PI / 4);
      }
    }

    // Moored wooden canal skiffs/gondolas floating in the canal moat (maxY <= 0.68)
    const boatSpots = [
      [-W * 0.58, -(H + 4.2), 0.08],
      [W * 0.56, -(H + 4.6), -0.12],
      [-W * 0.54, H + 4.3, 0.1],
      [W * 0.58, H + 4.1, -0.06],
      [-(W + 4.3), -H * 0.52, Math.PI * 0.52],
      [W + 4.4, H * 0.5, Math.PI * 0.48],
    ];
    for (const [bx, bz, bry] of boatSpots) {
      place(props, beveledBox(2.4, 0.28, 0.86, 0.12), woodMat, bx, 0.16, bz, bry);
      place(props, beveledBox(1.1, 0.24, 0.66, 0.06), roofSlate, bx, 0.38, bz, bry);
      addLampGeo(octahedron(0.14).translate(bx + Math.cos(bry) * 0.95, 0.38, bz - Math.sin(bry) * 0.95));
    }

    // Quayside wrought-iron streetlamps ringing both inner & outer canal banks
    for (const i of [-2, -1, 1, 2]) {
      for (const sz of [-1, 1]) {
        const lx = i * (W * 0.38);
        const lz = sz * (H + 1.8);
        place(props, cylinder(0.12, 0.2, 3.4, 6), darkMat, lx, 1.7, lz);
        addLampGeo(box(0.48, 0.32, 0.48).translate(lx, 3.52, lz));
        place(props, cone(0.48, 0.32, 4), roofSlate, lx, 3.82, lz, Math.PI / 4);
      }
      for (const sx of [-1, 1]) {
        const lx = sx * (W + 1.8);
        const lz = i * (H * 0.38);
        place(props, cylinder(0.12, 0.2, 3.4, 6), darkMat, lx, 1.7, lz);
        addLampGeo(box(0.48, 0.32, 0.48).translate(lx, 3.52, lz));
        place(props, cone(0.48, 0.32, 4), roofSlate, lx, 3.82, lz, Math.PI / 4);
      }
    }

    // Helper: Handcrafted multi-story canal townhouse with pitched roof, chimney, eaves & glowing windows
    const houseWallCols = [0x24364a, 0x2d3f54, 0x353b52, 0x26404e, 0x3d3848];
    const buildHouse = (hx, hz, bw, bh, bd, idx) => {
      const rCheck = Math.hypot(bw * 0.62, bd * 0.62);
      if (!safeExterior(hx, hz, rCheck, W, H, 0.5)) return;
      const wallCol = houseWallCols[idx % houseWallCols.length];
      place(props, beveledBox(bw, 0.6, bd, 0.1), quayMat, hx, 0.3, hz);
      place(props, beveledBox(bw * 0.94, bh, bd * 0.94, 0.14), mat("stone", wallCol), hx, 0.6 + bh * 0.5, hz);
      // Timber/brass story band
      place(props, box(bw * 0.98, 0.14, bd * 0.98), brassMat, hx, 0.6 + bh * 0.52, hz);
      // Pitched storybook gable/hipped roof + brick chimney
      const roofH = 1.45 + (idx % 3) * 0.38;
      const rMat = idx % 4 === 0 ? roofCopper : roofSlate;
      place(
        props,
        cone(Math.max(bw, bd) * 0.78, roofH, 4).toFlatShaded(),
        rMat,
        hx,
        0.6 + bh + roofH * 0.48,
        hz,
        Math.PI / 4,
      );
      place(
        props,
        beveledBox(0.46, 1.25, 0.46, 0.05),
        darkMat,
        hx + bw * 0.24,
        0.6 + bh + roofH * 0.62,
        hz - bd * 0.18,
      );
      // Warm glowing multi-story windows on all 4 facades via slightly proud bands
      for (const wy of [0.6 + bh * 0.28, 0.6 + bh * 0.74]) {
        const wGeo = box(bw * 0.64, 0.42, bd * 0.97).translate(hx, wy, hz);
        const wGeo2 = box(bw * 0.97, 0.42, bd * 0.64).translate(hx, wy, hz);
        if ((idx + Math.round(wy)) % 4 === 0) {
          place(props, box(bw * 0.64, 0.42, bd * 0.97), tealWin, hx, wy, hz);
        } else {
          addLampGeo(wGeo);
          addLampGeo(wGeo2);
        }
      }
    };

    // North Canal Townfront Row + Grand Clocktower
    let hIdx = 0;
    for (let x = -W - 9; x <= W + 9; x += 4.35) {
      if (Math.abs(x) < 2.8) continue; // leave central canal bridge avenue open
      const bw = rng.range(3.2, 4.1);
      const bd = rng.range(3.2, 4.0);
      const bh = rng.range(4.6, 8.2);
      buildHouse(x + rng.range(-0.25, 0.25), -(H + 10.2 + rng.range(0, 1.8)), bw, bh, bd, hIdx++);
    }
    // Grand Northern Canal Clocktower Landmark
    const cxT = -4.6,
      czT = -(H + 13.8);
    if (safeExterior(cxT, czT, 3.2, W, H, 0.5)) {
      place(props, beveledBox(4.2, 12.8, 4.2, 0.2), mat("stone", 0x223448), cxT, 6.4, czT);
      place(props, beveledBox(4.6, 0.42, 4.6, 0.08), brassMat, cxT, 9.4, czT);
      place(props, cylinder(1.25, 1.25, 0.28, 12), lampLens, cxT, 10.8, czT + 2.02, 0, 1, 1, 1, Math.PI / 2);
      place(props, cone(3.2, 3.8, 4).toFlatShaded(), roofCopper, cxT, 14.6, czT, Math.PI / 4);
      place(props, cylinder(0.08, 0.16, 1.8, 6), brassMat, cxT, 17.2, czT);
    }

    // West & East Canal Townfront Rows
    for (const sx of [-1, 1]) {
      for (let z = -H - 5; z <= H + 5; z += 4.5) {
        if (Math.abs(z) < 2.8) continue;
        const bw = rng.range(3.2, 4.0);
        const bd = rng.range(3.3, 4.2);
        const bh = rng.range(4.2, 7.6);
        buildHouse(sx * (W + 10.2 + rng.range(0, 1.6)), z + rng.range(-0.25, 0.25), bw, bh, bd, hIdx++);
      }
    }
    // South Waterfront Low Boathouses & Lantern Pavilions (kept modest height so camera view stays clear)
    for (let x = -W - 7; x <= W + 7; x += 5.4) {
      if (Math.abs(x) < 3.4) continue;
      buildHouse(x, H + 10.4 + rng.range(0, 1.2), rng.range(3.0, 3.8), rng.range(2.6, 3.8), 3.2, hIdx++);
    }

    if (lampGeos.length) {
      // Split lamp geometries into 4 side buckets so each merged mesh has O(1) exterior bounds
      const lampSides = [[], [], [], []];
      for (const g of lampGeos) {
        const b = g.computeBounds();
        const s = b.max.z <= -H ? 0 : b.min.z >= H ? 1 : b.max.x <= -W ? 2 : 3;
        lampSides[s].push(g);
      }
      for (const list of lampSides) {
        if (list.length) props.add(new MeshNode(mergeGeometries(list), lampLens));
      }
    }
  }

  // =========================================================================
  // BIOME 2: AURORA SHELF — Nordic Timber Lodges, Pine Groves & Frozen Fjord
  // =========================================================================
  else if (biome.id === "shelf") {
    const iceMat = mat("ice", 0x386e98);
    const snowMat = mat("stone", 0xd0eaf8);
    const spruceDark = mat("organic", 0x1b4248);
    const spruceMid = mat("organic", 0x26585c);
    const timberMat = mat("wood", 0x4e3526);
    const roofTimber = mat("wood", 0x36241b);
    const brazierMat = mat("metal", FINISH.copper);
    const hearthGlow = glow(0xffb45c, 1.3);
    const spireMat = worldMaterial({
      color: 0x42bce0,
      surface: "crystal",
      emissive: 0x145870,
      emissiveIntensity: 0.44,
    });

    // Pillowy snow coping caps atop all 4 perimeter walls (strictly outside W / H)
    for (const sz of [-1, 1]) {
      place(props, beveledBox(W * 2 + 2.2, 0.2, 0.92, 0.08), snowMat, 0, wallH + 0.06, sz * offH);
    }
    for (const sx of [-1, 1]) {
      place(props, beveledBox(0.92, 0.2, H * 2 + 0.2, 0.08), snowMat, sx * offW, wallH + 0.06, 0);
    }

    // 4 Cardinal Nordic Timber-and-Stone Fjord Causeways + Warm Copper Fire-Braziers
    for (const sz of [-1, 1]) {
      const cz = sz * (H + 4.3);
      place(props, beveledBox(3.4, 0.48, 5.6, 0.1), timberMat, 0, 0.24, cz);
      place(props, beveledBox(3.1, 0.14, 5.3, 0.05), snowMat, 0, 0.52, cz);
      for (const side of [-1.65, 1.65]) {
        const bz = sz * (H + 2.15);
        place(props, cylinder(0.18, 0.26, 2.3, 6), darkMat, side, 1.15, bz);
        place(props, cylinder(0.44, 0.24, 0.36, 6), brazierMat, side, 2.44, bz);
        place(props, octahedron(0.34), hearthGlow, side, 2.78, bz, 0, 1, 1.2, 1);
      }
    }
    for (const sx of [-1, 1]) {
      const cx = sx * (W + 4.3);
      place(props, beveledBox(5.6, 0.48, 3.4, 0.1), timberMat, cx, 0.24, 0);
      place(props, beveledBox(5.3, 0.14, 3.1, 0.05), snowMat, cx, 0.52, 0);
      for (const side of [-1.65, 1.65]) {
        const bx = sx * (W + 2.15);
        place(props, cylinder(0.18, 0.26, 2.3, 6), darkMat, bx, 1.15, side);
        place(props, cylinder(0.44, 0.24, 0.36, 6), brazierMat, bx, 2.44, side);
        place(props, octahedron(0.34), hearthGlow, bx, 2.78, side, 0, 1, 1.2, 1);
      }
    }
    // Additional warm perimeter braziers
    for (const s of [-1, 1]) {
      for (const k of [-0.56, 0.56]) {
        const bx = k * W,
          bz = s * (H + 1.9);
        place(props, cylinder(0.16, 0.24, 2.1, 6), darkMat, bx, 1.05, bz);
        place(props, cylinder(0.4, 0.22, 0.32, 6), brazierMat, bx, 2.24, bz);
        place(props, octahedron(0.3), hearthGlow, bx, 2.55, bz, 0, 1, 1.2, 1);
      }
    }

    // Floating Fjord Ice Floes (strictly outside arena along all 4 fjord moats) & Crystalline Fjord Spires
    for (let i = 0; i < 20; i++) {
      const side = i % 4;
      const u = rng.range(-0.88, 0.88);
      const moatD = rng.range(3.0, 5.8);
      const fx = side < 2 ? u * (W + 2) : (side === 2 ? -1 : 1) * (W + moatD);
      const fz = side >= 2 ? u * (H + 2) : (side === 0 ? -1 : 1) * (H + moatD);
      if ((side < 2 && Math.abs(fx) < 2.9) || (side >= 2 && Math.abs(fz) < 2.9)) continue;
      if (!safeExterior(fx, fz, 2.0, W, H, 0.45)) continue;
      const a = i * 0.7;
      place(props, cylinder(rng.range(0.9, 1.5), rng.range(1.1, 1.7), 0.3, 6).toFlatShaded(), snowMat, fx, 0.15, fz, a);
      if (i % 3 === 0) {
        place(props, sculptedCrystal(0.9, rng.range(2.2, 3.8), 0.9, i * 23), spireMat, fx, 0.1, fz, a);
      }
    }

    // Helper: Cozy Nordic Timber Expedition Lodge with steep snow-laden roof, chimney & warm cabin windows
    const buildLodge = (lx, lz, lw, lh, ld, ry = 0) => {
      const rCheck = Math.hypot(lw * 0.72, ld * 0.72);
      if (!safeExterior(lx, lz, rCheck, W, H, 0.5)) return;
      place(props, beveledBox(lw * 1.06, 0.55, ld * 1.06, 0.1), darkMat, lx, 0.27, lz, ry);
      place(props, beveledBox(lw, lh, ld, 0.12), timberMat, lx, 0.55 + lh * 0.5, lz, ry);
      // Warm glowing paned cabin windows
      place(props, box(lw * 0.58, 0.52, ld * 1.03), hearthGlow, lx, 0.55 + lh * 0.52, lz, ry);
      place(props, box(lw * 1.03, 0.52, ld * 0.54), hearthGlow, lx, 0.55 + lh * 0.52, lz, ry);
      // Steep snow-dusted Nordic A-frame roof + stone chimney
      const roofH = lh * 0.95;
      const rRad = Math.max(lw, ld) * 0.82;
      place(props, cone(rRad, roofH, 4).toFlatShaded(), roofTimber, lx, 0.55 + lh + roofH * 0.46, lz, ry + Math.PI / 4);
      place(
        props,
        cone(rRad * 0.96, roofH * 0.72, 4).toFlatShaded(),
        snowMat,
        lx,
        0.55 + lh + roofH * 0.64,
        lz,
        ry + Math.PI / 4,
      );
      place(
        props,
        beveledBox(0.52, roofH * 0.95, 0.52, 0.06),
        darkMat,
        lx + lw * 0.22,
        0.55 + lh + roofH * 0.52,
        lz - ld * 0.18,
      );
    };

    const lodgeSpots = [
      [-W * 0.62, -(H + 10.2), 3.8, 2.7, 3.2, 0.12],
      [W * 0.58, -(H + 10.6), 4.2, 3.0, 3.4, -0.14],
      [-(W + 10.4), -H * 0.48, 3.4, 2.6, 3.8, 0.2],
      [-(W + 10.8), H * 0.46, 3.6, 2.5, 3.4, -0.15],
      [W + 10.4, -H * 0.44, 3.6, 2.8, 3.6, -0.18],
      [W + 10.6, H * 0.48, 3.4, 2.5, 3.4, 0.14],
      [-(W + 9.6), -(H + 9.8), 3.6, 2.8, 3.6, 0.45],
      [W + 9.8, -(H + 9.6), 3.5, 2.7, 3.5, -0.42],
    ];
    for (const [lx, lz, lw, lh, ld, ry] of lodgeSpots) buildLodge(lx, lz, lw, lh, ld, ry);

    // Helper: Multi-tier snow-laden evergreen pine tree
    const buildPine = (tx, tz, scale = 1) => {
      if (!safeExterior(tx, tz, 1.65 * scale, W, H, 0.4)) return;
      place(props, cylinder(0.16 * scale, 0.26 * scale, 1.3 * scale, 6), timberMat, tx, 0.65 * scale, tz);
      const tiers = [
        [1.42, 1.95, 1.65, spruceDark],
        [1.12, 1.75, 2.85, spruceMid],
        [0.78, 1.45, 3.9, spruceDark],
      ];
      for (const [rad, th, ty, col] of tiers) {
        place(props, cone(rad * scale, th * scale, 7).toFlatShaded(), col, tx, ty * scale, tz);
        place(
          props,
          cone(rad * 0.88 * scale, th * 0.52 * scale, 7).toFlatShaded(),
          snowMat,
          tx,
          (ty + th * 0.26) * scale,
          tz,
        );
      }
    };

    // Dense Alpine Pine Groves encircling all 4 snow-benches
    for (let i = 0; i < 38; i++) {
      const a = (i / 38) * TAU + rng.range(-0.06, 0.06);
      const distR = rng.range(8.4, 15.8);
      const tx = Math.cos(a) * (W + distR);
      const tz = Math.sin(a) * (H + distR);
      if ((Math.abs(tx) < 3.0 && Math.abs(tz) > H) || (Math.abs(tz) < 3.0 && Math.abs(tx) > W)) continue;
      // Avoid overlapping directly onto lodges
      if (lodgeSpots.some(([lx, lz]) => Math.hypot(tx - lx, tz - lz) < 3.4)) continue;
      const sc = tz > H + 4 ? rng.range(0.75, 1.05) : rng.range(0.88, 1.38);
      buildPine(tx, tz, sc);
    }

    // Outer Ring of Sculpted Faceted Alpine Mountain Peaks & Glacier Spires
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.96 + (i / 15) * Math.PI * 0.92;
      const px = Math.cos(a) * (W + rng.range(13.5, 19.5));
      const pz = Math.sin(a) * (H + rng.range(13.5, 19.5));
      if (!safeExterior(px, pz, 3.6, W, H, 0.6)) continue;
      const mh = rng.range(6.2, 12.8);
      const mw = rng.range(3.2, 5.4);
      const peak = sculptedRock(mw, mh, mw, i * 31 + 7, true);
      place(props, peak, iceMat, px, -0.3, pz, a);
      const cap = snowCoat(peak, 0.09, 0.36);
      if (cap.vertexCount > 0) place(props, cap, snowMat, px, -0.3, pz, a);
    }
  }

  // =========================================================================
  // BIOME 3: GLOWMARSH — Stilt-Boardwalk Piers, Bog Huts, Lily Pads & Fungi
  // =========================================================================
  else if (biome.id === "marsh") {
    const capJade = mat("organic", 0x2c8c68);
    const capAmber = mat("organic", 0xc4883e);
    const capTeal = mat("organic", 0x2b847e);
    const stemLight = mat("organic", 0x7e987a);
    const barkMat = mat("wood", 0x2c382c);
    const timberMat = mat("wood", 0x4c3a28);
    const padMat = mat("organic", 0x2e6e48);
    const mossRoof = mat("organic", 0x356b46);
    const reedMat = worldMaterial({ color: 0x3e7852, surface: "organic", reedWind: true, doubleSide: true });
    const sporeLamp = glow(0xffe08a, 1.24);
    const lotusGlow = glow(0xff9ec4, 1.18);

    // 4 Cardinal Wooden Stilt-Boardwalk Piers extending over the glowing bog lagoon
    for (const sz of [-1, 1]) {
      const pz = sz * (H + 4.4);
      place(props, beveledBox(3.1, 0.24, 5.8, 0.06), timberMat, 0, 0.56, pz);
      for (const zOff of [-2.2, 0, 2.2]) {
        for (const xOff of [-1.35, 1.35]) {
          place(props, cylinder(0.14, 0.18, 1.45, 6), barkMat, xOff, 0.5, pz + zOff);
        }
      }
      for (const xOff of [-1.45, 1.45]) {
        const lz = sz * (H + 2.2);
        place(props, cylinder(0.12, 0.16, 2.7, 6), barkMat, xOff, 1.35, lz);
        place(props, sculptedCap(0.48, 0.28, 91), capJade, xOff, 2.68, lz);
        place(props, octahedron(0.22), sporeLamp, xOff, 2.52, lz);
      }
    }
    for (const sx of [-1, 1]) {
      const px = sx * (W + 4.4);
      place(props, beveledBox(5.8, 0.24, 3.1, 0.06), timberMat, px, 0.56, 0);
      for (const xOff of [-2.2, 0, 2.2]) {
        for (const zOff of [-1.35, 1.35]) {
          place(props, cylinder(0.14, 0.18, 1.45, 6), barkMat, px + xOff, 0.5, zOff);
        }
      }
    }

    // 36 Floating Lily Pads & Bioluminescent Water-Lotus Blossoms strictly on the exterior bog lagoon
    for (let i = 0; i < 36; i++) {
      const side = i % 4;
      const u = rng.range(-0.92, 0.92);
      const distL = rng.range(2.4, 7.2);
      const lx = side < 2 ? u * (W + 4) : (side === 2 ? -1 : 1) * (W + distL);
      const lz = side >= 2 ? u * (H + 4) : (side === 0 ? -1 : 1) * (H + distL);
      if ((side < 2 && Math.abs(lx) < 2.5) || (side >= 2 && Math.abs(lz) < 2.5)) continue;
      const pr = rng.range(0.55, 1.15);
      if (!safeExterior(lx, lz, pr + 0.5, W, H, 0.45)) continue;
      const a = i * 1.1;
      place(props, cylinder(pr, pr * 0.95, 0.08, 7), padMat, lx, 0.05, lz, a);
      if (i % 3 === 0) {
        place(props, octahedron(0.22), i % 6 === 0 ? lotusGlow : sporeLamp, lx, 0.18, lz, a, 1.15, 0.7, 1.15);
      }
    }

    // Helper: Cozy Stilt-Perched Bog Herbalist / Witch Lantern Hut
    const buildBogHut = (hx, hz, rad, ry = 0) => {
      if (!safeExterior(hx, hz, rad * 1.65, W, H, 0.5)) return;
      // Wooden stilts & deck
      for (let s = 0; s < 4; s++) {
        const sa = (s / 4) * TAU + 0.78;
        place(
          props,
          cylinder(0.14, 0.18, 1.6, 5),
          barkMat,
          hx + Math.cos(sa) * rad * 0.85,
          0.8,
          hz + Math.sin(sa) * rad * 0.85,
        );
      }
      place(props, cylinder(rad * 1.28, rad * 1.28, 0.22, 8), timberMat, hx, 1.45, hz);
      // Round timber cabin body + glowing amber potion windows
      place(props, cylinder(rad * 0.96, rad * 1.04, 2.0, 8), timberMat, hx, 2.55, hz, ry);
      place(props, box(rad * 1.15, 0.48, rad * 1.98), sporeLamp, hx, 2.55, hz, ry);
      // Curved mushroom-thatch roof + crooked chimney
      place(props, sculptedCap(rad * 1.48, rad * 0.96, Math.round(Math.abs(hx * 7 + hz))), mossRoof, hx, 3.45, hz);
      place(props, cylinder(0.16, 0.22, 1.3, 5), barkMat, hx + rad * 0.55, 4.35, hz - rad * 0.35, 0, 1, 1, 1, 0.14);
    };

    const hutSpots = [
      [-W * 0.58, -(H + 9.6), 1.85, 0.2],
      [W * 0.56, -(H + 10.2), 1.95, -0.3],
      [-(W + 9.8), -H * 0.45, 1.8, 0.4],
      [W + 9.8, -H * 0.42, 1.85, -0.25],
      [-(W + 9.6), H * 0.48, 1.7, 0.15],
      [W + 9.6, H * 0.48, 1.7, -0.2],
    ];
    for (const [hx, hz, hr, hry] of hutSpots) buildBogHut(hx, hz, hr, hry);

    // Multi-tiered Giant Bioluminescent Mushroom Colonies & Gnarled Swamp-Cypress Trees
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + rng.range(-0.08, 0.08);
      const distM = rng.range(6.2, 14.8);
      const mx = Math.cos(a) * (W + distM);
      const mz = Math.sin(a) * (H + distM);
      if (!safeExterior(mx, mz, 2.8, W, H, 0.5)) continue;
      if (hutSpots.some(([hx, hz]) => Math.hypot(mx - hx, mz - hz) < 4.2)) continue;

      if (i % 3 === 0) {
        // Gnarled Swamp-Cypress Tree with buttress roots, canopy domes & hanging spore lantern
        const th = mz > H ? rng.range(3.2, 4.4) : rng.range(4.2, 6.4);
        place(props, cone(1.15, 1.4, 6), barkMat, mx, 0.7, mz);
        place(props, cylinder(0.28, 0.55, th, 6), barkMat, mx, th * 0.5, mz);
        place(props, sculptedCap(1.95, 1.15, i * 17 + 5), mossRoof, mx, th + 0.1, mz);
        place(props, sculptedCap(1.35, 0.88, i * 17 + 9), capJade, mx + 0.9, th - 0.35, mz + 0.4);
        place(props, octahedron(0.24), sporeLamp, mx + 0.85, th - 0.95, mz + 0.35);
      } else {
        // Clustered 2-stem Giant Glowing Toadstools with luminous gills & cap spots
        const sh = mz > H ? rng.range(2.0, 3.2) : rng.range(2.6, 5.2);
        const cr = rng.range(1.15, 2.15);
        const cMat = i % 4 === 1 ? capAmber : i % 2 === 0 ? capJade : capTeal;
        place(props, cylinder(cr * 0.16, cr * 0.28, sh, 7), stemLight, mx, sh * 0.5, mz);
        place(props, sculptedCap(cr, cr * 0.58, i * 29 + 3), cMat, mx, sh - 0.12, mz);
        place(props, cylinder(cr * 0.68, cr * 0.45, 0.12, 9), accentGlow, mx, sh - 0.1, mz);
        place(props, octahedron(cr * 0.16), sporeLamp, mx, sh + cr * 0.48, mz, 0, 1.2, 0.42, 1.2);
        // Companion mushroom
        const subX = mx + Math.cos(a + 1.1) * cr * 0.85;
        const subZ = mz + Math.sin(a + 1.1) * cr * 0.85;
        if (safeExterior(subX, subZ, cr * 0.7, W, H, 0.4)) {
          const sh2 = sh * 0.58;
          const cr2 = cr * 0.58;
          place(props, cylinder(cr2 * 0.18, cr2 * 0.28, sh2, 6), stemLight, subX, sh2 * 0.5, subZ);
          place(props, sculptedCap(cr2, cr2 * 0.6, i * 31 + 7), capAmber, subX, sh2 - 0.08, subZ);
          place(props, cylinder(cr2 * 0.65, cr2 * 0.42, 0.09, 8), accentGlow, subX, sh2 - 0.07, subZ);
        }
      }
    }

    // GPU wind-swaying cattail & reed bank meshes bucketed per side for O(1) exterior bounds
    const reedSides = [[], [], [], []];
    for (let i = 0; i < 44; i++) {
      const side = i % 4;
      const u = rng.range(-0.92, 0.92);
      const rx = side < 2 ? u * (W + 4) : (side === 2 ? -1 : 1) * (W + rng.range(3.2, 7.6));
      const rz = side >= 2 ? u * (H + 4) : (side === 0 ? -1 : 1) * (H + rng.range(3.2, 7.6));
      if ((side < 2 && Math.abs(rx) < 2.4) || (side >= 2 && Math.abs(rz) < 2.4)) continue;
      if (!safeExterior(rx, rz, 0.85, W, H, 0.45)) continue;
      const sy = rng.range(0.85, 1.42);
      reedSides[side].push(
        cone(0.11, 1.95, 5).translate(0, 0.97, 0).rotateY(rng.range(0, TAU)).scale(1, sy, 1).translate(rx, 0, rz),
      );
    }
    for (const list of reedSides) {
      if (list.length) props.add(new MeshNode(mergeGeometries(list), reedMat));
    }
  }

  // =========================================================================
  // BIOME 4: SHATTERED CORE — Floating Sanctuary Cliff-Skirt & Astral Islands
  // =========================================================================
  else if (biome.id === "core") {
    const obsMat = mat("basalt", 0x261d4c);
    const cliffDark = mat("basalt", 0x171132);
    const kintsugiMat = mat("metal", FINISH.brass);
    const crystalMat = mat("crystal", 0x7248d0);
    const roseGlow = glow(look.accent, 1.18);
    const violetGlow = glow(look.trim, 1.12);

    // Stepped Carved Obsidian-and-Gold Cliff Rim Ledges around all 4 outer arena walls (clean outward winding!)
    for (const sz of [-1, 1]) {
      place(props, beveledBox(W * 2 + 2.8, 0.56, 0.72, 0.08), cliffDark, 0, 0.28, sz * (H + 1.55));
      place(props, box(W * 2 + 2.9, 0.07, 0.76), kintsugiMat, 0, 0.56, sz * (H + 1.55));
      place(props, beveledBox(W * 2 + 3.4, 0.28, 0.65, 0.06), obsMat, 0, 0.14, sz * (H + 2.05));
    }
    for (const sx of [-1, 1]) {
      place(props, beveledBox(0.72, 0.56, H * 2 + 1.6, 0.08), cliffDark, sx * (W + 1.55), 0.28, 0);
      place(props, box(0.76, 0.07, H * 2 + 1.7), kintsugiMat, sx * (W + 1.55), 0.56, 0);
      place(props, beveledBox(0.65, 0.28, H * 2 + 2.2, 0.06), obsMat, sx * (W + 2.05), 0.14, 0);
    }

    // 4 Cardinal Broken Floating Sanctuary Stairways & Kintsugi Astral Gates
    for (const sz of [-1, 1]) {
      for (let st = 0; st < 4; st++) {
        const zStep = sz * (H + 2.3 + st * 1.25);
        const yStep = 0.25 + st * 0.36;
        place(props, beveledBox(2.8 - st * 0.24, 0.28, 0.92, 0.06), obsMat, 0, yStep, zStep);
        place(props, box(2.84 - st * 0.24, 0.06, 0.96), kintsugiMat, 0, yStep + 0.14, zStep);
      }
      const gz = sz * (H + 7.2);
      const gh = sz < 0 ? 5.2 : 3.8;
      place(props, beveledBox(0.65, gh, 0.65, 0.1), obsMat, -2.1, gh * 0.5 + 0.8, gz);
      place(props, beveledBox(0.65, gh, 0.65, 0.1), obsMat, 2.1, gh * 0.5 + 0.8, gz);
      place(props, torus(2.15, 0.14, 6, 20), kintsugiMat, 0, gh + 0.6, gz);
      place(props, octahedron(0.45), roseGlow, 0, gh + 0.6, gz, 0, 0.9, 1.4, 0.9);
    }
    for (const sx of [-1, 1]) {
      for (let st = 0; st < 4; st++) {
        const xStep = sx * (W + 2.3 + st * 1.25);
        const yStep = 0.25 + st * 0.36;
        place(props, beveledBox(0.92, 0.28, 2.8 - st * 0.24, 0.06), obsMat, xStep, yStep, 0);
        place(props, box(0.96, 0.06, 2.84 - st * 0.24), kintsugiMat, xStep, yStep + 0.14, 0);
      }
    }

    // 12 Floating Satellite Sanctuary Islands with outward-wound tapered undersides hovering above the starry cosmos!
    const shardsA = [],
      shardsB = [],
      runesA = [],
      runesB = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.26;
      const distI = rng.range(7.8, 15.2);
      const ix = Math.cos(a) * (W + distI);
      const iz = Math.sin(a) * (H + distI);
      const ir = rng.range(2.1, 3.3);
      if (!safeExterior(ix, iz, ir + 1.2, W, H, 0.6)) continue;
      if ((Math.abs(ix) < 3.6 && Math.abs(iz) > H) || (Math.abs(iz) < 3.6 && Math.abs(ix) > W)) continue;
      const coneH = ir * 0.95;
      const iy = iz > H ? rng.range(1.15, 1.8) : rng.range(1.5, 3.2);
      // Outward-wound inverted cone (`rx = Math.PI`, positive determinant!) suspended above y = 0
      place(props, cone(ir, coneH, 7).toFlatShaded(), cliffDark, ix, iy - coneH * 0.5, iz, a, 1, 1, 1, Math.PI, 0);
      place(props, cylinder(ir * 1.02, ir * 0.92, 0.36, 7).toFlatShaded(), obsMat, ix, iy + 0.18, iz, a);
      place(props, cylinder(ir * 1.05, ir * 1.05, 0.09, 7), kintsugiMat, ix, iy + 0.31, iz, a);

      if (i % 3 === 0) {
        // Miniature Kintsugi Temple Pavilion on floating island
        for (let c = 0; c < 4; c++) {
          const ca = (c / 4) * TAU + a;
          place(
            props,
            cylinder(0.12, 0.15, 2.1, 6),
            kintsugiMat,
            ix + Math.cos(ca) * ir * 0.55,
            iy + 1.42,
            iz + Math.sin(ca) * ir * 0.55,
          );
        }
        place(props, cone(ir * 0.82, 1.2, 4).toFlatShaded(), obsMat, ix, iy + 2.95, iz, a + Math.PI / 4);
        runesA.push(
          octahedron(0.42)
            .scale(0.85, 1.4, 0.85)
            .translate(ix, iy + 1.55, iz),
        );
      } else {
        // Giant Amethyst Crystal Cluster + Brass Astrolabe Halo
        const ch = rng.range(2.4, 4.4);
        place(props, sculptedCrystal(ir * 0.48, ch, ir * 0.48, i * 37 + 11), crystalMat, ix, iy + 0.35, iz, a);
        place(props, torus(ir * 0.62, 0.07, 5, 16), kintsugiMat, ix, iy + ch * 0.52, iz, a, 1, 1, 1, 1.1);
        (i % 2 ? runesB : runesA).push(octahedron(0.38).translate(ix, iy + ch + 0.55, iz));
      }
    }

    // Monumental Slowly-Spinning Celestial Astrolabe Rings on the Northern Horizon
    const orrery = new Node();
    orrery.position.set(0, 6.2, -(H + 16.5));
    place(orrery, torus(5.4, 0.16, 6, 28), kintsugiMat, 0, 0, 0, 0.25, 1, 1, 1, 0.35);
    place(orrery, torus(3.8, 0.12, 6, 24), violetGlow, 0, 0, 0, -0.4, 1, 1, 1, -0.55);
    place(orrery, octahedron(0.95), roseGlow, 0, 0, 0, 0, 0.85, 1.45, 0.85);
    if (safeExterior(0, -(H + 16.5), 6.2, W, H, 0.8)) {
      props.add(orrery);
      view.rlAnim.push({ o: orrery, k: "spinbob", s: 0.28, b: 6.2, a: 0.28, ph: 0 });
    }

    // Bobbing peripheral obsidian shards
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const fx = Math.cos(a) * (W + rng.range(5.2, 13.5));
      const fz = Math.sin(a) * (H + rng.range(5.2, 13.5));
      if (!safeExterior(fx, fz, 1.8, W, H, 0.5)) continue;
      const sh = rng.range(1.8, 4.2);
      const fy = rng.range(0.6, 3.2);
      const g = sculptedCrystal(rng.range(0.8, 1.4), sh, rng.range(0.8, 1.4), i * 41)
        .rotateY(a)
        .translate(fx, fy, fz);
      (i % 2 ? shardsB : shardsA).push(g);
    }
    // Bucket animated Core shards & runes by exterior side so animated bounds checks stay O(1)
    const addSideBob = (geos, material, speed, amp, phase) => {
      const buckets = [[], [], [], []];
      for (const g of geos) {
        const b = g.computeBounds();
        const s = b.max.z <= -H ? 0 : b.min.z >= H ? 1 : b.max.x <= -W ? 2 : 3;
        buckets[s].push(g);
      }
      for (let s = 0; s < 4; s++) {
        if (!buckets[s].length) continue;
        const m = new MeshNode(mergeGeometries(buckets[s]), material);
        props.add(m);
        view.rlAnim.push({ o: m, k: "bob", s: speed, b: 0, a: amp, ph: phase + s * 0.8 });
      }
    };
    addSideBob([...shardsA, ...shardsB], obsMat, 0.65, 0.28, 0);
    addSideBob(runesA, roseGlow, 1.2, 0.22, 0.5);
    addSideBob(runesB, violetGlow, 1.2, 0.22, 2.1);
  }

  // =========================================================================
  // BIOME 5: ASHFALL CALDERA — Dwarven Forge Bridges, Lava Aqueducts & Anvils
  // =========================================================================
  else if (biome.id === "caldera") {
    const basaltMat = mat("basalt", 0x3a2526);
    const basaltDark = mat("basalt", 0x26181a);
    const copperMat = mat("metal", FINISH.copper);
    const ironMat = mat("metal", 0x383238);
    const lavaGlow = glow(0xf05c18, 1.28);
    const goldFlame = glow(0xffbe48, 1.22);

    // 4 Cardinal Dwarven Dark-Iron & Basalt Magma Bridges spanning the molten moat
    for (const sz of [-1, 1]) {
      const bz = sz * (H + 4.2);
      place(props, beveledBox(3.8, 0.56, 5.5, 0.1), ironMat, 0, 0.28, bz);
      for (const side of [-1.78, 1.78]) {
        place(props, beveledBox(0.32, 0.36, 5.4, 0.05), basaltDark, side, 0.64, bz);
        place(props, box(0.14, 0.08, 5.42), copperMat, side, 0.84, bz);
        place(props, cylinder(0.34, 0.44, 2.3, 6).toFlatShaded(), basaltMat, side, 1.15, sz * (H + 2.1));
        place(props, torus(0.42, 0.08, 5, 10), copperMat, side, 2.28, sz * (H + 2.1), 0, 1, 1, 1, Math.PI / 2);
        place(props, octahedron(0.34), goldFlame, side, 2.6, sz * (H + 2.1));
      }
    }
    for (const sx of [-1, 1]) {
      const bx = sx * (W + 4.2);
      place(props, beveledBox(5.5, 0.56, 3.8, 0.1), ironMat, bx, 0.28, 0);
      for (const side of [-1.78, 1.78]) {
        place(props, beveledBox(5.4, 0.36, 0.32, 0.05), basaltDark, bx, 0.64, side);
        place(props, box(5.42, 0.08, 0.14), copperMat, bx, 0.84, side);
        place(props, cylinder(0.34, 0.44, 2.3, 6).toFlatShaded(), basaltMat, sx * (W + 2.1), 1.15, side);
        place(props, torus(0.42, 0.08, 5, 10), copperMat, sx * (W + 2.1), 2.28, side, 0, 1, 1, 1, Math.PI / 2);
        place(props, octahedron(0.34), goldFlame, sx * (W + 2.1), 2.6, side);
      }
    }

    // Helper: Elevated Dwarven Stone Lava-Aqueduct pouring glowing molten magma into a crucible basin!
    const buildAqueduct = (ax, az, rotY, height = 5.6) => {
      if (!safeExterior(ax, az, 4.6, W, H, 0.6)) return;
      const alongX = Math.abs(Math.cos(rotY)) > 0.5;
      const spanW = alongX ? 7.2 : 1.7;
      const spanD = alongX ? 1.7 : 7.2;
      for (const off of [-2.4, 2.4]) {
        const px = ax + (alongX ? off : 0);
        const pz = az + (alongX ? 0 : off);
        place(props, beveledBox(1.4, height, 1.4, 0.12), basaltDark, px, height * 0.5, pz);
        place(props, box(1.52, 0.18, 1.52), copperMat, px, height * 0.68, pz);
      }
      // Top channel & glowing molten lava trough
      place(props, beveledBox(spanW, 0.85, spanD, 0.12), basaltMat, ax, height + 0.2, az);
      place(props, box(alongX ? 7.0 : 0.95, 0.22, alongX ? 0.95 : 7.0), lavaGlow, ax, height + 0.58, az);
      // Spout lip + vertical pouring molten magma stream + glowing crucible basin below!
      const dirX = Math.sin(rotY);
      const dirZ = Math.cos(rotY);
      const sx = ax + dirX * 1.15;
      const sz = az + dirZ * 1.15;
      if (safeExterior(sx, sz, 1.8, W, H, 0.45)) {
        place(props, beveledBox(1.1, 0.42, 1.1, 0.08), copperMat, sx, height + 0.18, sz);
        place(props, cylinder(0.24, 0.34, height + 0.1, 7), lavaGlow, sx, height * 0.5, sz);
        place(props, cylinder(1.45, 1.15, 0.72, 8).toFlatShaded(), basaltDark, sx, 0.36, sz);
        place(props, cylinder(1.18, 1.18, 0.18, 8), goldFlame, sx, 0.7, sz);
      }
    };

    buildAqueduct(-W * 0.52, -(H + 9.8), 0, 5.8);
    buildAqueduct(W * 0.52, -(H + 9.8), 0, 5.8);
    buildAqueduct(-(W + 9.8), -H * 0.42, Math.PI / 2, 5.2);
    buildAqueduct(W + 9.8, -H * 0.42, -Math.PI / 2, 5.2);

    // Monumental Dwarven Anvil-Shrines & Foundry Halls on the corners & flanks
    const anvilSpots = [
      [-(W + 9.4), -(H + 9.4)],
      [W + 9.4, -(H + 9.4)],
      [-(W + 9.6), H * 0.48],
      [W + 9.6, H * 0.48],
    ];
    for (const [ax, az] of anvilSpots) {
      if (!safeExterior(ax, az, 3.2, W, H, 0.5)) continue;
      place(props, cylinder(2.3, 2.7, 0.9, 6).toFlatShaded(), basaltDark, ax, 0.45, az);
      place(props, beveledBox(2.2, 1.25, 1.35, 0.12), ironMat, ax, 1.48, az);
      place(props, beveledBox(3.4, 0.72, 1.55, 0.1), ironMat, ax, 2.38, az);
      place(props, box(2.4, 0.14, 1.62), copperMat, ax, 1.96, az);
      place(props, box(1.6, 0.32, 1.42), lavaGlow, ax, 1.25, az);
    }

    // Stepped Giant's Causeway Hexagonal Basalt Colonnade Cliffs around the outer crater rim
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rng.range(-0.05, 0.05);
      const distC = rng.range(7.8, 16.5);
      const cx = Math.cos(a) * (W + distC);
      const cz = Math.sin(a) * (H + distC);
      if (!safeExterior(cx, cz, 3.0, W, H, 0.5)) continue;
      if ((Math.abs(cx) < 3.4 && Math.abs(cz) > H) || (Math.abs(cz) < 3.4 && Math.abs(cx) > W)) continue;
      const ch = cz > H ? rng.range(2.2, 4.4) : rng.range(3.8, 9.6);
      const cr = rng.range(1.2, 2.3);
      place(props, cylinder(cr, cr * 1.12, ch, 6).toFlatShaded(), basaltMat, cx, ch * 0.5 - 0.2, cz, a);
      place(
        props,
        cylinder(cr * 0.72, cr * 0.8, ch * 0.68, 6).toFlatShaded(),
        basaltDark,
        cx + cr * 0.65,
        ch * 0.34 - 0.2,
        cz,
        a + 0.5,
      );
      if (i % 4 === 0) {
        place(props, cylinder(cr * 0.52, cr * 0.58, 0.22, 6), lavaGlow, cx, ch - 0.14, cz);
      }
    }
  }

  // =========================================================================
  // BIOME 6: GLASS FLATS — Oasis Temple Pylons, Colonnades, Palms & Sand Dunes
  // =========================================================================
  else {
    const sandLight = mat("sandstone", 0xc89858);
    const sandWarm = mat("sandstone", 0x9c6c3c);
    const sandDeep = mat("sandstone", 0x78502c);
    const glassMat = mat("crystal", 0x28a89c);
    const brassMat = mat("metal", FINISH.brass);
    const palmTrunk = mat("wood", 0x6e4e32);
    const palmFrond = mat("organic", 0x3e8858);
    const clothMat = worldMaterial({ color: FINISH.ivory, surface: "organic", reedWind: true, doubleSide: true });
    const turquoiseGlow = glow(look.trim, 1.12);
    const sunGoldGlow = glow(look.accent, 1.16);
    const bannerParts = [];

    // 4 Cardinal Monumental Sandstone Temple Pylon-Gateways + Fluttering Cloth Awnings
    for (const sz of [-1, 1]) {
      const gz = sz * (H + 2.55);
      const ph = sz < 0 ? 4.4 : 3.2;
      place(props, beveledBox(4.8, 0.38, 2.8, 0.08), sandWarm, 0, 0.19, sz * (H + 3.4));
      for (const side of [-2.15, 2.15]) {
        place(props, cylinder(0.46, 0.68, ph, 4).toFlatShaded(), sandLight, side, ph * 0.5, gz, Math.PI / 4);
        place(props, box(0.96, 0.16, 0.96), brassMat, side, ph * 0.78, gz);
      }
      place(props, beveledBox(5.4, 0.52, 0.92, 0.1), sandWarm, 0, ph + 0.18, gz);
      place(props, octahedron(0.42), sunGoldGlow, 0, ph + 0.68, gz, 0, 1.3, 1.3, 0.5);
      if (safeExterior(0, gz, 2.8, W, H, 0.45)) {
        bannerParts.push(plane(2.6, 1.15, 2, 2).translate(0, ph - 0.68, gz));
      }
    }
    for (const sx of [-1, 1]) {
      const gx = sx * (W + 2.55);
      const ph = 3.8;
      place(props, beveledBox(2.8, 0.38, 4.8, 0.08), sandWarm, sx * (W + 3.4), 0.19, 0);
      for (const side of [-2.15, 2.15]) {
        place(props, cylinder(0.46, 0.68, ph, 4).toFlatShaded(), sandLight, gx, ph * 0.5, side, Math.PI / 4);
        place(props, box(0.96, 0.16, 0.96), brassMat, gx, ph * 0.78, side);
      }
      place(props, beveledBox(0.92, 0.52, 5.4, 0.1), sandWarm, gx, ph + 0.18, 0);
    }

    // Perimeter Sun-Bleached Banner Poles
    for (const s of [-1, 1]) {
      for (const k of [-0.56, 0.56]) {
        const bx = k * W,
          bz = s * (H + 2.45);
        place(props, cylinder(0.1, 0.15, 3.6, 6), brassMat, bx, 1.8, bz);
        if (safeExterior(bx + 0.45, bz, 1.1, W, H, 0.4)) {
          bannerParts.push(plane(0.92, 1.35, 1, 2).translate(0.46, 2.75, 0).translate(bx, 0, bz));
        }
      }
    }
    if (bannerParts.length) {
      const bSides = [[], []];
      for (const g of bannerParts) {
        bSides[g.computeBounds().max.z <= -H ? 0 : 1].push(g);
      }
      for (const list of bSides) {
        if (list.length) props.add(new MeshNode(mergeGeometries(list), clothMat));
      }
    }

    // Helper: Oasis Palm Tree with curved segmented trunk & lush fan-frond crown
    const buildPalm = (px, pz, scale = 1, lean = 0.18, rot = 0) => {
      if (!safeExterior(px, pz, 2.2 * scale, W, H, 0.5)) return;
      const h = 3.8 * scale;
      place(props, cylinder(0.16 * scale, 0.28 * scale, h, 6), palmTrunk, px, h * 0.48, pz, rot, 1, 1, 1, lean);
      const topX = px + Math.sin(rot) * Math.sin(lean) * h * 0.5;
      const topZ = pz + Math.cos(rot) * Math.sin(lean) * h * 0.5;
      const topY = h * 0.94;
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * TAU + rot;
        place(
          props,
          cone(0.42 * scale, 1.85 * scale, 4).toFlatShaded(),
          palmFrond,
          topX + Math.cos(fa) * 0.72 * scale,
          topY - 0.12 * scale,
          topZ + Math.sin(fa) * 0.72 * scale,
          fa,
          0.65,
          1,
          1,
          1.22,
        );
      }
    };

    // Helper: Ruined Classical Sandstone Colonnade & Vitrified Glass Oasis Shrine
    const buildColonnade = (rx, rz, alongX, idx) => {
      if (!safeExterior(rx, rz, 4.2, W, H, 0.55)) return;
      place(props, beveledBox(alongX ? 6.8 : 2.2, 0.45, alongX ? 2.2 : 6.8, 0.1), sandLight, rx, 0.22, rz);
      for (const s of [-2.4, 0, 2.4]) {
        const cx = rx + (alongX ? s : 0);
        const cz = rz + (alongX ? 0 : s);
        const ch = s === 2.4 && idx % 2 === 0 ? 1.9 : 3.5; // occasional broken ruined column!
        place(props, cylinder(0.32, 0.38, ch, 8), sandLight, cx, 0.45 + ch * 0.5, cz);
        place(props, beveledBox(0.86, 0.24, 0.86, 0.05), brassMat, cx, 0.45 + ch + 0.08, cz);
      }
      // Architrave lintel across standing columns
      const lintelOff = idx % 2 === 0 ? -1.2 : 0;
      const lintelLen = idx % 2 === 0 ? 3.8 : 6.2;
      place(
        props,
        beveledBox(alongX ? lintelLen : 0.95, 0.48, alongX ? 0.95 : lintelLen, 0.08),
        sandWarm,
        rx + (alongX ? lintelOff : 0),
        4.22,
        rz + (alongX ? 0 : lintelOff),
      );
    };

    buildColonnade(-W * 0.54, -(H + 9.2), true, 0);
    buildColonnade(W * 0.54, -(H + 9.2), true, 1);
    buildColonnade(-(W + 9.2), -H * 0.45, false, 2);
    buildColonnade(W + 9.2, -H * 0.45, false, 3);

    // Oasis Palm Groves & Translucent Turquoise Vitrified-Glass Spires around all 4 sides
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + rng.range(-0.06, 0.06);
      const distO = rng.range(5.8, 13.8);
      const ox = Math.cos(a) * (W + distO);
      const oz = Math.sin(a) * (H + distO);
      if (!safeExterior(ox, oz, 2.6, W, H, 0.5)) continue;
      if ((Math.abs(ox) < 3.4 && Math.abs(oz) > H) || (Math.abs(oz) < 3.4 && Math.abs(ox) > W)) continue;
      if (i % 2 === 0) {
        buildPalm(ox, oz, oz > H ? rng.range(0.75, 0.95) : rng.range(0.9, 1.25), 0.16, a);
      } else {
        const gh = oz > H ? rng.range(2.2, 3.8) : rng.range(3.2, 6.8);
        place(props, sculptedCrystal(rng.range(1.0, 1.8), gh, rng.range(1.0, 1.8), i * 29 + 7), glassMat, ox, 0, oz, a);
        place(
          props,
          sculptedCrystal(0.68, gh * 0.55, 0.68, i * 31 + 3),
          turquoiseGlow,
          ox + 0.55,
          0,
          oz - 0.4,
          a + 0.5,
        );
      }
    }

    // Sweeping Sculpted Sand-Dune Ridges & Stepped Desert Ziggurats / Mesas on the Outer Horizon
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * 0.96 + (i / 17) * Math.PI * 0.92;
      const dx = Math.cos(a) * (W + rng.range(13.2, 19.8));
      const dz = Math.sin(a) * (H + rng.range(13.2, 19.8));
      if (!safeExterior(dx, dz, 4.4, W, H, 0.6)) continue;
      if (i === 5 || i === 12) {
        // Distant Stepped Sandstone Temple Ziggurat
        place(props, beveledBox(6.4, 2.2, 6.4, 0.18), sandDeep, dx, 1.1, dz, a * 0.2);
        place(props, beveledBox(4.6, 2.0, 4.6, 0.16), sandWarm, dx, 3.1, dz, a * 0.2);
        place(props, beveledBox(2.8, 1.8, 2.8, 0.14), sandLight, dx, 4.9, dz, a * 0.2);
        place(props, octahedron(0.68), sunGoldGlow, dx, 6.5, dz);
      } else {
        // Sweeping sculpted desert mesa / sand-dune ridge
        const mw = rng.range(4.2, 7.2);
        const mh = rng.range(3.2, 7.6);
        place(props, sculptedRock(mw, mh, mw * 0.65, i * 43 + 9, true), i % 2 ? sandWarm : sandDeep, dx, -0.35, dz, a);
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

    // Stylized painterly arena & exterior world plane (160x160 covers all corner vistas cleanly)
    const floorGeo = plane(160, 160, 1, 1).rotateX(-Math.PI / 2);
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

    // Partition static exterior scenery into directional sectors (N, S, W, E, Low) before batching
    // so merged meshes retain tight side-local AABBs for culling & O(1) bounds verification.
    this.sceneryGroup.updateWorldMatrix(true);
    const sectors = [new Node(), new Node(), new Node(), new Node(), new Node()];
    for (const child of [...this.sceneryGroup.children]) {
      if (keep.has(child) || !child.isMesh || !child.geometry || child.material?.reedWind) continue;
      const b = child.geometry.computeBounds();
      const sx = Math.abs(child.scale.x),
        sy = Math.abs(child.scale.y),
        sz = Math.abs(child.scale.z);
      const rH = Math.hypot(
        Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) * sx,
        Math.max(Math.abs(b.min.z), Math.abs(b.max.z)) * sz,
      );
      const maxY = child.position.y + Math.max(Math.abs(b.min.y), Math.abs(b.max.y)) * sy;
      let sec = -1;
      if (maxY <= 0.78) sec = 4;
      else if (child.position.z + rH <= -layout.H + 0.001) sec = 0;
      else if (child.position.z - rH >= layout.H - 0.001) sec = 1;
      else if (child.position.x + rH <= -layout.W + 0.001) sec = 2;
      else if (child.position.x - rH >= layout.W - 0.001) sec = 3;
      if (sec >= 0) {
        this.sceneryGroup.remove(child);
        sectors[sec].add(child);
      }
    }
    for (const sNode of sectors) {
      if (sNode.children.length) {
        this.sceneryGroup.add(sNode);
        mergeStaticNodes(sNode, keep);
      }
    }
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
      const ember = (1.06 + 0.16 * Math.cos(time * 0.9)) * (1 - dark * 0.52);
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
    const x = Math.max(-W - 8, Math.min(W + 8, cx + (Math.random() * 2 - 1) * 20));
    const z = Math.max(-H - 10, Math.min(H + 8, cz + (Math.random() * 2 - 1) * 16));
    switch (biome.id) {
      case "city":
        if (Math.random() < 0.72) {
          renderer.emit(x, 4 + Math.random() * 4, z, -1.2, -10, 0.8, 0.55, 0.14, hexColor(0x88dce8), {
            ambient: true,
            spark: true,
            drag: 0,
          });
        } else {
          renderer.emit(x, 0.4 + Math.random() * 2.2, z, 0.2, 0.4, 0.1, 2.2, 0.18, hexColor(FINISH.brass), {
            ambient: true,
            drag: 1,
          });
        }
        break;
      case "shelf":
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
        renderer.emit(
          x,
          0.3 + Math.random() * 2.6,
          z,
          (Math.random() - 0.5) * 0.7,
          0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.7,
          2.8,
          0.2,
          hexColor(Math.random() < 0.7 ? 0x66ffbe : 0xffe088),
          {
            ambient: true,
            drag: 0.6,
          },
        );
        break;
      case "core":
        renderer.emit(
          x,
          0.2 + Math.random() * 2.5,
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
        renderer.emit(
          x,
          0.15 + Math.random() * 1.6,
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
