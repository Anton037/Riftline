// Ground-up stylized storybook diorama arena & exterior world builder for all 6 biomes:
// sculpted cover monoliths, fortified gateways/bridges, rich lived-in exterior worlds, aurora ribbons & ambient weather.

import { Color, Vec2 } from "../engine/math.js";
import {
  box,
  beveledBox as rawBeveledBox,
  cylinder as rawCylinder,
  cone as rawCone,
  octahedron as rawOctahedron,
  torus as rawTorus,
  plane,
  lathe,
  sculptedRock as rawSculptedRock,
  sculptedCrystal as rawSculptedCrystal,
  sculptedCap as rawSculptedCap,
  snowCoat as rawSnowCoat,
  Geometry,
  mergeGeometries,
} from "../engine/geometry.js";
import { Material, MeshNode, Node, mergeStaticNodes } from "../engine/scene.js";
import { createGroundOcclusion } from "./ground-occlusion.js";
import { createSkyBackdrop } from "./arena-backdrop.js";
import { hexColor, worldMaterial, emissiveMaterial, setWorldShadows } from "./materials.js";
import { GLAZES, FINISH } from "./palette.js";
import { TAU, hashString, makeRng } from "../core/util.js";
import { atmosphereDensity, biomeAtmosphere } from "../data/atmosphere.js";

const GEO_CACHE = new Map();
function cachedGeo(key, build) {
  let g = GEO_CACHE.get(key);
  if (!g) {
    if (GEO_CACHE.size > 2048) GEO_CACHE.clear();
    g = build();
    g.shared = true;
    g._cacheKey = key;
    g.computeBounds();
    GEO_CACHE.set(key, g);
  }
  return g;
}
const qk = (n) => Math.round(n * 10000);
const beveledBox = (w = 1, h = 1, d = 1, b = 0.08) =>
  cachedGeo(`bb:${qk(w)}:${qk(h)}:${qk(d)}:${qk(b)}`, () => rawBeveledBox(w, h, d, b));
const cylinder = (rt = 0.5, rb = 0.5, h = 1, segs = 12, open = false) =>
  cachedGeo(`cyl:${qk(rt)}:${qk(rb)}:${qk(h)}:${segs}:${open ? 1 : 0}`, () => rawCylinder(rt, rb, h, segs, open));
const cone = (r = 0.5, h = 1, segs = 10) => cachedGeo(`cone:${qk(r)}:${qk(h)}:${segs}`, () => rawCone(r, h, segs));
const octahedron = (r = 1) => cachedGeo(`oct:${qk(r)}`, () => rawOctahedron(r));
const torus = (r = 0.5, tube = 0.12, radSegs = 6, tubSegs = 16, arc = TAU) =>
  cachedGeo(`tor:${qk(r)}:${qk(tube)}:${radSegs}:${tubSegs}:${qk(arc)}`, () =>
    rawTorus(r, tube, radSegs, tubSegs, arc),
  );
const sculptedRock = (rx = 1, ry = 1, rz = 1, detail = 1, seed = 1) =>
  cachedGeo(`rk:${qk(rx)}:${qk(ry)}:${qk(rz)}:${detail}:${seed}`, () => rawSculptedRock(rx, ry, rz, detail, seed));
const sculptedCrystal = (w = 1, h = 1, d = 1, seed = 1) =>
  cachedGeo(`cr:${qk(w)}:${qk(h)}:${qk(d)}:${seed}`, () => rawSculptedCrystal(w, h, d, seed));
const sculptedCap = (r = 1, h = 0.5, seed = 1) =>
  cachedGeo(`cap:${qk(r)}:${qk(h)}:${seed}`, () => rawSculptedCap(r, h, seed));
const snowCoat = (sourceGeo, lift = 0.025, minNy = 0.45) =>
  sourceGeo?._cacheKey
    ? cachedGeo(`sc:${sourceGeo._cacheKey}:${qk(lift)}:${qk(minNy)}`, () => rawSnowCoat(sourceGeo, lift, minNy))
    : rawSnowCoat(sourceGeo, lift, minNy);

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

/** Multi-curtain stylized aurora ribbons & polar starfield strictly outside the Aurora Shelf arena bounds. */
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
    { z: -H - 10.8, y: 6.2, span: W * 2.65, height: 9.4, curve: 3.0 },
    { z: -H - 15.0, y: 8.2, span: W * 3.05, height: 11.4, curve: -3.5 },
    { z: -H - 19.4, y: 10.2, span: W * 3.45, height: 12.2, curve: 2.9 },
    { z: -H - 23.8, y: 12.0, span: W * 3.85, height: 11.0, curve: -2.4 },
  ];
  for (const r of ribbons) {
    const segs = 36;
    const pos = [],
      norm = [],
      uv = [],
      idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = (u - 0.5) * r.span;
      const zOff = Math.sin(u * Math.PI * 2) * r.curve + Math.cos(u * Math.PI * 3) * (r.curve * 0.28);
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
  const starMat = emissiveMaterial({
    color: 0xe6f8ff,
    emissiveIntensity: 1.32,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const starParts = [];
  for (let i = 0; i < 28; i++) {
    const sx = (i / 27 - 0.5) * W * 3.2 + Math.sin(i * 2.3) * 1.4;
    const sy = 7.2 + (i % 7) * 1.65 + Math.cos(i * 1.7) * 0.45;
    const sz = -H - 12.5 - (i % 5) * 2.6;
    starParts.push(octahedron(0.11 + (i % 3) * 0.04).translate(sx, sy, sz));
  }
  const starMesh = new MeshNode(mergeGeometries(starParts), starMat);
  starMesh.renderOrder = 2;
  group.add(starMesh);
  group.userData.material = mat;
  return group;
}

/** 4 distinct sculpted cover archetypes per biome (24 total), strictly bounded inside each obstacle's collision footprint. */
function buildCover(view, biomeId, obstacles, rng) {
  const props = view.obsGroup;
  const look = GLAZES[biomeId] || GLAZES.courtyard;

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
    const variant = (i + (seed & 3)) % 4;
    const isCircle = obs.t === "c";
    const w = isCircle ? obs.r * 2 : obs.w * 2;
    const d = isCircle ? obs.r * 2 : obs.h * 2;
    const rad = isCircle ? obs.r : Math.min(obs.w, obs.h);

    if (biomeId === "courtyard") {
      // 4 Archetypes: 0 = Garden Lantern Shrine, 1 = Brass Vacuum-Tube Transformer Kiosk,
      //               2 = Stone Bonsai/Bamboo Planter, 3 = Arched Courtyard Spirit Screen
      const slateBase = isCircle
        ? cylinder(rad * 0.91, rad * 0.96, 0.34, 8)
        : beveledBox(w * 0.95, 0.34, d * 0.95, 0.1);
      place(props, slateBase, baseMat("stone", 0x1a2836), obs.x, 0.17, obs.y);

      if (variant === 0) {
        const h = isCircle ? 2.48 : 2.04;
        const body = isCircle
          ? cylinder(rad * 0.7, rad * 0.82, h - 0.54, 8)
          : beveledBox(w * 0.82, h - 0.54, d * 0.82, 0.12);
        place(props, body, baseMat("armor", look.body), obs.x, 0.34 + (h - 0.54) * 0.5, obs.y);
        const band = isCircle ? cylinder(rad * 0.78, rad * 0.78, 0.09, 8) : beveledBox(w * 0.86, 0.09, d * 0.86, 0.04);
        place(props, band, baseMat("metal", FINISH.brass), obs.x, h * 0.52, obs.y);
        const eave = isCircle
          ? cylinder(rad * 0.55, rad * 0.93, 0.26, 8).toFlatShaded()
          : beveledBox(w * 0.93, 0.22, d * 0.93, 0.07);
        place(props, eave, baseMat("stone", 0x203546), obs.x, h - 0.06, obs.y);
        place(props, cylinder(rad * 0.3, rad * 0.34, 0.36, 6), glowMat(look.light, 1.24), obs.x, h + 0.22, obs.y);
        place(
          props,
          cylinder(rad * 0.06, rad * 0.64, 0.32, 6).toFlatShaded(),
          baseMat("basalt", 0x1a2d3c),
          obs.x,
          h + 0.54,
          obs.y,
        );
        place(props, octahedron(rad * 0.11), baseMat("metal", FINISH.brass), obs.x, h + 0.76, obs.y, 0, 1, 1.4, 1);
      } else if (variant === 1) {
        // Brass-Trimmed Transformer Kiosk with Warm Vacuum Tubes
        const h = isCircle ? 2.15 : 1.92;
        const cab = isCircle
          ? cylinder(rad * 0.76, rad * 0.8, h - 0.46, 8)
          : beveledBox(w * 0.82, h - 0.46, d * 0.82, 0.1);
        place(props, cab, baseMat("metal", 0x263848), obs.x, 0.34 + (h - 0.46) * 0.5, obs.y);
        const trimTop = isCircle
          ? cylinder(rad * 0.82, rad * 0.82, 0.12, 8)
          : beveledBox(w * 0.86, 0.12, d * 0.86, 0.04);
        place(props, trimTop, baseMat("metal", FINISH.brass), obs.x, h - 0.06, obs.y);
        for (let t = 0; t < 3; t++) {
          const a = (t / 3) * TAU + 0.4;
          const tr = rad * 0.34;
          const tx = obs.x + Math.cos(a) * tr;
          const tz = obs.y + Math.sin(a) * tr;
          place(
            props,
            cylinder(rad * 0.11, rad * 0.12, 0.44, 7),
            glowMat(t === 0 ? look.accent : look.light, 1.22),
            tx,
            h + 0.22,
            tz,
          );
          place(props, cylinder(rad * 0.13, rad * 0.13, 0.07, 7), baseMat("metal", FINISH.copper), tx, h + 0.46, tz);
        }
      } else if (variant === 2) {
        // Stone Bonsai / Bamboo Courtyard Planter
        const rimH = 0.78;
        const basin = isCircle ? cylinder(rad * 0.88, rad * 0.82, rimH, 8) : beveledBox(w * 0.88, rimH, d * 0.88, 0.09);
        place(props, basin, baseMat("stone", 0x283a4c), obs.x, 0.34 + rimH * 0.5, obs.y);
        const trimRim = isCircle
          ? cylinder(rad * 0.91, rad * 0.91, 0.08, 8)
          : beveledBox(w * 0.91, 0.08, d * 0.91, 0.03);
        place(props, trimRim, baseMat("metal", FINISH.brass), obs.x, 0.34 + rimH, obs.y);
        place(
          props,
          cylinder(rad * 0.13, rad * 0.22, 1.05, 6),
          baseMat("wood", 0x4e3526),
          obs.x - rad * 0.08,
          1.48,
          obs.y,
          0,
          1,
          1,
          1,
          0.14,
        );
        place(props, sculptedCap(rad * 0.68, rad * 0.38, seed + 9), baseMat("organic", 0x2e6e58), obs.x, 1.98, obs.y);
        place(
          props,
          sculptedCap(rad * 0.46, rad * 0.28, seed + 21),
          baseMat("organic", 0x3e8868),
          obs.x + rad * 0.18,
          2.28,
          obs.y - rad * 0.12,
        );
        place(
          props,
          beveledBox(rad * 0.26, 0.28, rad * 0.26, 0.04),
          glowMat(look.light, 1.2),
          obs.x - rad * 0.3,
          1.28,
          obs.y + rad * 0.22,
        );
      } else {
        // Arched Courtyard Spirit Screen
        const h = isCircle ? 2.18 : 2.02;
        const frameW = isCircle ? rad * 1.42 : w * 0.86;
        const frameD = isCircle ? rad * 0.72 : d * 0.78;
        place(
          props,
          beveledBox(frameW, h - 0.42, frameD, 0.09),
          baseMat("stone", 0x223446),
          obs.x,
          0.34 + (h - 0.42) * 0.5,
          obs.y,
        );
        place(
          props,
          beveledBox(frameW * 0.74, (h - 0.42) * 0.56, frameD * 1.05, 0.03),
          glowMat(look.light, 1.14),
          obs.x,
          h * 0.62,
          obs.y,
        );
        place(
          props,
          beveledBox(frameW * 1.04, 0.1, frameD * 1.08, 0.03),
          baseMat("metal", FINISH.brass),
          obs.x,
          h - 0.12,
          obs.y,
        );
        place(
          props,
          beveledBox(frameW * 1.06, 0.22, frameD * 1.12, 0.06),
          baseMat("basalt", 0x1a2b3c),
          obs.x,
          h + 0.06,
          obs.y,
        );
      }
    } else if (biomeId === "shelf") {
      // 4 Archetypes: 0 = Snow-Draped Rune Cairn, 1 = Sapphire Ice-Crystal Cluster,
      //               2 = Frosted Expedition Supply Crate/Sled + Storm Lantern, 3 = Carved Glacier Arch
      if (variant === 0) {
        const h = isCircle ? 2.5 : 1.94;
        const rock = sculptedRock(w * 0.94, h, d * 0.94, seed, isCircle);
        place(props, rock, baseMat("stone", 0x355c82), obs.x, 0, obs.y);
        const coat = snowCoat(rock, 0.082, 0.38);
        if (coat.vertexCount > 0) place(props, coat, baseMat("stone", 0xd4eefc), obs.x, 0, obs.y);
        const band = isCircle ? cylinder(rad * 0.8, rad * 0.84, 0.09, 8) : beveledBox(w * 0.84, 0.09, d * 0.84, 0.04);
        place(props, band, baseMat("metal", FINISH.copper), obs.x, h * 0.36, obs.y);
        const rune = isCircle ? cylinder(rad * 0.77, rad * 0.8, 0.07, 8) : beveledBox(w * 0.81, 0.07, d * 0.81, 0.03);
        place(props, rune, glowMat(look.trim, 1.04), obs.x, h * 0.48, obs.y);
        place(props, octahedron(rad * 0.22), glowMat(look.accent, 1.18), obs.x, h * 1.02, obs.y, 0, 1, 1.45, 1);
      } else if (variant === 1) {
        // Sapphire Ice-Crystal Cluster
        const h = isCircle ? 2.58 : 2.12;
        const base = sculptedRock(w * 0.92, h * 0.38, d * 0.92, seed + 3, isCircle);
        place(props, base, baseMat("stone", 0xcce8f8), obs.x, 0, obs.y);
        place(
          props,
          sculptedCrystal(rad * 0.68, h * 0.92, rad * 0.68, seed + 7),
          baseMat("crystal", 0x3298cc),
          obs.x,
          h * 0.16,
          obs.y,
          rng.range(0, TAU),
        );
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * TAU + 0.5;
          const sx = obs.x + Math.cos(a) * rad * 0.32;
          const sz = obs.y + Math.sin(a) * rad * 0.32;
          place(
            props,
            sculptedCrystal(rad * 0.38, h * 0.62, rad * 0.38, seed + 19 + k * 7),
            k === 0 ? glowMat(look.trim, 1.08) : baseMat("crystal", 0x62c4ec),
            sx,
            h * 0.14,
            sz,
            a,
          );
        }
      } else if (variant === 2) {
        // Frosted Expedition Supply Sled / Crate Stack with Warm Storm Lantern
        const basePlinth = isCircle
          ? cylinder(rad * 0.9, rad * 0.95, 0.28, 8)
          : beveledBox(w * 0.92, 0.28, d * 0.92, 0.08);
        place(props, basePlinth, baseMat("stone", 0xd2ecfa), obs.x, 0.14, obs.y);
        const cw = isCircle ? rad * 1.18 : w * 0.8;
        const cd = isCircle ? rad * 1.18 : d * 0.8;
        place(props, beveledBox(cw, 0.92, cd, 0.08), baseMat("wood", 0x563a28), obs.x, 0.72, obs.y);
        place(props, beveledBox(cw * 1.03, 0.09, cd * 1.03, 0.03), baseMat("metal", FINISH.copper), obs.x, 0.72, obs.y);
        place(props, beveledBox(cw * 0.96, 0.14, cd * 0.96, 0.05), baseMat("stone", 0xd8f0fc), obs.x, 1.22, obs.y);
        place(
          props,
          beveledBox(cw * 0.62, 0.58, cd * 0.62, 0.06),
          baseMat("wood", 0x483022),
          obs.x - cw * 0.1,
          1.54,
          obs.y,
        );
        // Warm amber storm lantern contrasting against cool snow
        const lx = obs.x + cw * 0.22;
        const lz = obs.y + cd * 0.12;
        place(props, cylinder(0.14, 0.16, 0.34, 6), glowMat(0xffbe64, 1.32), lx, 1.46, lz);
        place(props, cone(0.2, 0.16, 6), baseMat("metal", FINISH.copper), lx, 1.7, lz);
      } else {
        // Carved Glacier Arch
        const h = isCircle ? 2.28 : 1.98;
        const alongX = !isCircle && obs.w >= obs.h;
        const span = (isCircle ? rad : alongX ? obs.w : obs.h) * 0.52;
        const pillarR = Math.min(rad * 0.36, 0.44);
        for (const s of [-1, 1]) {
          const px = obs.x + (alongX || isCircle ? s * span : 0);
          const pz = obs.y + (!alongX && !isCircle ? s * span : 0);
          place(
            props,
            cylinder(pillarR * 0.88, pillarR, h * 0.78, 7).toFlatShaded(),
            baseMat("ice", 0x3b7ca8),
            px,
            h * 0.39,
            pz,
          );
        }
        const lintelW = alongX || isCircle ? (span + pillarR * 0.85) * 2 : pillarR * 2.1;
        const lintelD = !alongX && !isCircle ? (span + pillarR * 0.85) * 2 : pillarR * 2.1;
        place(props, beveledBox(lintelW, 0.38, lintelD, 0.09), baseMat("ice", 0x54a2cc), obs.x, h * 0.84, obs.y);
        place(
          props,
          beveledBox(lintelW * 0.94, 0.14, lintelD * 0.94, 0.05),
          baseMat("stone", 0xd8f0fc),
          obs.x,
          h * 0.97,
          obs.y,
        );
        place(props, octahedron(rad * 0.2), glowMat(look.trim, 1.18), obs.x, h * 0.62, obs.y);
      }
    } else if (biomeId === "marsh") {
      // 4 Archetypes: 0 = Spotted Velvet Toadstool Colony, 1 = Hollow Mossy Log Shrine,
      //               2 = Reed-Wrapped Bog Cairn + Glowing Frog, 3 = Bulbous Spore-Pot Amphora
      const h = isCircle ? 1.62 : 1.38;
      const stone = sculptedRock(w * 0.93, h * 0.68, d * 0.93, seed, isCircle);
      place(props, stone, baseMat("stone", 0x224234), obs.x, 0, obs.y);

      if (variant === 0) {
        const capColor = i % 2 === 0 ? 0x2a8e68 : 0x369a82;
        const cr = Math.min(rad * 0.84, 0.92);
        place(props, cylinder(cr * 0.2, cr * 0.28, 0.86, 8), baseMat("organic", 0x829c7e), obs.x, h * 0.68, obs.y);
        place(props, sculptedCap(cr, cr * 0.58, seed + 13), baseMat("organic", capColor), obs.x, h + 0.24, obs.y);
        place(props, cylinder(cr * 0.62, cr * 0.42, 0.1, 10), glowMat(look.accent, 1.16), obs.x, h + 0.25, obs.y);
        const subA = (seed % 628) * 0.01;
        const sx = obs.x + Math.cos(subA) * rad * 0.4;
        const sz = obs.y + Math.sin(subA) * rad * 0.4;
        place(props, cylinder(rad * 0.09, rad * 0.13, 0.44, 6), baseMat("organic", 0x829c7e), sx, h * 0.62, sz);
        place(props, sculptedCap(rad * 0.36, rad * 0.24, seed + 41), baseMat("organic", 0xd4964a), sx, h - 0.02, sz);
        for (let sp = 0; sp < 4; sp++) {
          const sa = (sp / 4) * TAU + seed;
          place(
            props,
            octahedron(cr * 0.12),
            glowMat(0xffe694, 1.06),
            obs.x + Math.cos(sa) * cr * 0.42,
            h + 0.24 + cr * 0.42,
            obs.y + Math.sin(sa) * cr * 0.42,
            sa,
            1,
            0.42,
            1,
          );
        }
      } else if (variant === 1) {
        // Hollow Mossy Log Shrine with warm amber spore-lantern nested in its front hollow alcove
        const logR = rad * 0.72;
        const logH = 1.18;
        place(
          props,
          cylinder(logR * 0.88, logR, logH, 9),
          baseMat("wood", 0x3b2d22),
          obs.x,
          h * 0.52 + logH * 0.5,
          obs.y,
        );
        // Dark hollow recess collar on the front face
        place(
          props,
          beveledBox(logR * 0.72, logH * 0.52, logR * 0.36, 0.04),
          baseMat("wood", 0x1b140f),
          obs.x,
          h * 0.52 + logH * 0.48,
          obs.y + logR * 0.78,
        );
        place(
          props,
          sculptedCap(logR * 1.06, logR * 0.48, seed + 17),
          baseMat("organic", 0x326e48),
          obs.x,
          h * 0.52 + logH + 0.02,
          obs.y,
        );
        place(
          props,
          octahedron(rad * 0.24),
          glowMat(0xffd878, 1.38),
          obs.x,
          h * 0.52 + logH * 0.48,
          obs.y + logR * 0.92,
          0,
          1,
          1.25,
          1,
        );
      } else if (variant === 2) {
        // Reed-Wrapped Bog Cairn with perched glowing bog-frog & lantern
        place(
          props,
          sculptedRock(w * 0.68, 0.72, d * 0.68, seed + 23, true),
          baseMat("stone", 0x2c5240),
          obs.x,
          h * 0.58,
          obs.y,
        );
        place(
          props,
          torus(rad * 0.58, 0.055, 5, 12),
          baseMat("wood", 0x6c5236),
          obs.x,
          h * 0.82,
          obs.y,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
        // Tiny perched jade bog-frog with glowing golden vocal sac
        const fy = h * 0.58 + 0.74;
        place(props, octahedron(rad * 0.22), baseMat("organic", 0x48b878), obs.x, fy, obs.y, 0.4, 1.1, 0.72, 1.25);
        place(props, octahedron(rad * 0.13), glowMat(0xffe082, 1.24), obs.x, fy - 0.02, obs.y + rad * 0.14);
      } else {
        // Bulbous Bioluminescent Spore-Pot
        const pot = lathe(
          [
            [rad * 0.38, 0],
            [rad * 0.76, 0.42],
            [rad * 0.68, 0.86],
            [rad * 0.42, 1.18],
            [rad * 0.52, 1.32],
          ],
          10,
        );
        place(props, pot, baseMat("organic", 0x3a6a58), obs.x, h * 0.52, obs.y);
        place(
          props,
          torus(rad * 0.46, 0.06, 5, 12),
          glowMat(look.accent, 1.22),
          obs.x,
          h * 0.52 + 1.32,
          obs.y,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
      }
    } else if (biomeId === "core") {
      // 4 Archetypes: 0 = Amethyst Crystal Obelisk, 1 = Brass Celestial Orrery Pedestal,
      //               2 = Levitating Rune Library Monolith, 3 = Fractured Star-Glass Sundial
      const h = isCircle ? 2.44 : 2.04;
      const monolith = sculptedRock(w * 0.93, h * 0.56, d * 0.93, seed, isCircle);
      place(props, monolith, baseMat("basalt", 0x1d163c), obs.x, 0, obs.y);
      const kintsugi = isCircle
        ? cylinder(rad * 0.82, rad * 0.86, 0.08, 8)
        : beveledBox(w * 0.85, 0.08, d * 0.85, 0.04);
      place(props, kintsugi, baseMat("metal", FINISH.brass), obs.x, h * 0.34, obs.y);

      if (variant === 0) {
        place(
          props,
          sculptedCrystal(rad * 0.66, h * 0.84, rad * 0.66, seed + 17),
          baseMat("crystal", 0x6a44c2),
          obs.x,
          h * 0.36,
          obs.y,
          rng.range(0, TAU),
        );
      } else if (variant === 1) {
        // Brass Celestial Orrery Pedestal
        place(
          props,
          cylinder(rad * 0.42, rad * 0.56, h * 0.44, 8),
          baseMat("basalt", 0x281e50),
          obs.x,
          h * 0.52,
          obs.y,
        );
        place(
          props,
          torus(rad * 0.62, 0.052, 5, 16),
          baseMat("metal", FINISH.brass),
          obs.x,
          h * 0.88,
          obs.y,
          0.3,
          1,
          1,
          1,
          0.55,
        );
        place(
          props,
          torus(rad * 0.44, 0.042, 5, 14),
          glowMat(look.trim, 1.14),
          obs.x,
          h * 0.88,
          obs.y,
          -0.5,
          1,
          1,
          1,
          -0.65,
        );
      } else if (variant === 2) {
        // Levitating Rune-Inscribed Library Monolith
        const mw = isCircle ? rad * 1.15 : w * 0.72;
        const md = isCircle ? rad * 0.78 : d * 0.72;
        place(props, beveledBox(mw, h * 0.46, md, 0.08), baseMat("basalt", 0x241b48), obs.x, h * 0.76, obs.y, 0.08);
        place(
          props,
          beveledBox(mw * 1.04, 0.08, md * 1.04, 0.02),
          glowMat(look.trim, 1.2),
          obs.x,
          h * 0.76,
          obs.y,
          0.08,
        );
      } else {
        // Fractured Star-Glass Sundial
        place(props, cylinder(rad * 0.76, rad * 0.8, 0.12, 10), baseMat("metal", FINISH.brass), obs.x, h * 0.48, obs.y);
        place(
          props,
          sculptedCrystal(rad * 0.54, h * 0.66, rad * 0.32, seed + 31),
          glowMat(look.trim, 1.14),
          obs.x,
          h * 0.5,
          obs.y,
          0.4,
          1,
          1,
          1,
          0.28,
        );
      }
      const gem = octahedron(rad * 0.36)
        .scale(0.85, 1.4, 0.85)
        .translate(obs.x, h + 0.28, obs.y);
      (i % 2 ? coreGemPartsB : coreGemPartsA).push(gem);
    } else if (biomeId === "caldera") {
      // 4 Archetypes: 0 = Bronze-Banded Dwarven Anvil, 1 = Glowing Magma-Veined Crag,
      //               2 = Iron-Caged Hearth Brazier, 3 = Slag-Crucible Foundry Pillar
      const h = isCircle ? 2.38 : 1.96;
      place(
        props,
        isCircle
          ? cylinder(rad * 0.88, rad * 0.94, 0.44, 6).toFlatShaded()
          : beveledBox(w * 0.93, 0.44, d * 0.93, 0.09),
        baseMat("basalt", 0x2c1d1f),
        obs.x,
        0.22,
        obs.y,
      );
      if (variant === 0) {
        // Bronze-Banded Dwarven Anvil on Basalt Plinth
        const aw = isCircle ? rad * 1.24 : w * 0.78;
        const ad = isCircle ? rad * 0.84 : d * 0.72;
        place(props, beveledBox(aw * 0.74, 0.68, ad * 0.82, 0.08), baseMat("metal", 0x3a3238), obs.x, 0.76, obs.y);
        place(props, beveledBox(aw, 0.46, ad, 0.08), baseMat("metal", 0x484046), obs.x, 1.32, obs.y);
        place(props, beveledBox(aw * 0.82, 0.09, ad * 1.04, 0.02), baseMat("metal", FINISH.copper), obs.x, 1.08, obs.y);
        place(props, beveledBox(aw * 0.62, 0.1, ad * 0.88, 0.02), glowMat(0xf06820, 1.24), obs.x, 0.62, obs.y);
      } else if (variant === 1) {
        // Glowing Magma-Veined Crag
        place(
          props,
          sculptedRock(w * 0.9, h * 0.92, d * 0.9, seed + 7, isCircle),
          baseMat("basalt", 0x422828),
          obs.x,
          0.2,
          obs.y,
        );
        place(
          props,
          sculptedCrystal(rad * 0.52, h * 0.72, rad * 0.52, seed + 29),
          glowMat(0xf2641c, 1.28),
          obs.x,
          0.36,
          obs.y,
          rng.range(0, TAU),
        );
      } else if (variant === 2) {
        // Iron-Caged Hearth Brazier
        place(
          props,
          cylinder(rad * 0.66, rad * 0.54, h * 0.56, 6).toFlatShaded(),
          baseMat("metal", 0x383036),
          obs.x,
          0.44 + h * 0.28,
          obs.y,
        );
        place(
          props,
          torus(rad * 0.68, 0.065, 5, 12),
          baseMat("metal", FINISH.copper),
          obs.x,
          0.44 + h * 0.52,
          obs.y,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
        place(props, octahedron(rad * 0.42), glowMat(0xff9c38, 1.3), obs.x, 0.44 + h * 0.58, obs.y, 0, 1, 1.15, 1);
      } else {
        // Slag-Crucible Foundry Pillar
        place(
          props,
          cylinder(rad * 0.64, rad * 0.74, h * 0.78, 6).toFlatShaded(),
          baseMat("basalt", 0x4c2e2c),
          obs.x,
          0.4 + h * 0.39,
          obs.y,
          Math.PI / 6,
        );
        place(
          props,
          torus(rad * 0.68, 0.07, 5, 12),
          baseMat("metal", FINISH.brass),
          obs.x,
          0.4 + h * 0.68,
          obs.y,
          0,
          1,
          1,
          1,
          Math.PI / 2,
        );
        place(props, cylinder(rad * 0.48, rad * 0.48, 0.14, 8), glowMat(0xff8228, 1.28), obs.x, 0.4 + h * 0.78, obs.y);
      }
    } else {
      // Glass Flats — 4 Archetypes: 0 = Stratified Ochre Hoodoo Mesa, 1 = Turquoise Desert-Glass Spire Cluster,
      //                             2 = Brass Sun-Compass & Urns under Canopy, 3 = Vitrified Fulgurite Arch
      const h = isCircle ? 2.32 : 1.88;
      const baseMesa = sculptedRock(w * 0.94, h * 0.48, d * 0.94, seed, isCircle);
      place(props, baseMesa, baseMat("sandstone", 0x8e5e34), obs.x, 0, obs.y);

      if (variant === 0) {
        place(
          props,
          sculptedRock(w * 0.78, h * 0.92, d * 0.78, seed + 5, isCircle),
          baseMat("sandstone", 0xc29052),
          obs.x,
          0.12,
          obs.y,
        );
        const band = isCircle ? cylinder(rad * 0.78, rad * 0.8, 0.08, 8) : beveledBox(w * 0.8, 0.08, d * 0.8, 0.03);
        place(props, band, baseMat("metal", FINISH.brass), obs.x, h * 0.48, obs.y);
        place(props, octahedron(rad * 0.24), glowMat(look.trim, 1.12), obs.x, h * 0.98, obs.y, 0, 1, 1.3, 1);
      } else if (variant === 1) {
        place(
          props,
          sculptedCrystal(rad * 0.66, h * 0.9, rad * 0.66, seed + 23),
          baseMat("crystal", 0x26a89c),
          obs.x,
          h * 0.28,
          obs.y,
          rng.range(0, TAU),
        );
        for (let p = 0; p < 3; p++) {
          const pa = (p / 3) * TAU + seed;
          place(
            props,
            sculptedCrystal(rad * 0.34, h * 0.54, rad * 0.34, seed + 53 + p),
            glowMat(look.trim, 1.1),
            obs.x + Math.cos(pa) * rad * 0.32,
            h * 0.24,
            obs.y + Math.sin(pa) * rad * 0.32,
            pa,
          );
        }
      } else if (variant === 2) {
        // Ancient Brass Sun-Compass & Amphora under Cloth Canopy
        place(
          props,
          cylinder(rad * 0.68, rad * 0.74, 0.14, 10),
          baseMat("metal", FINISH.brass),
          obs.x,
          h * 0.44,
          obs.y,
        );
        place(props, octahedron(rad * 0.24), glowMat(look.accent, 1.2), obs.x, h * 0.62, obs.y, 0, 1, 1.35, 1);
        const canW = isCircle ? rad * 1.26 : w * 0.82;
        const canD = isCircle ? rad * 1.26 : d * 0.82;
        for (const px of [-1, 1]) {
          for (const pz of [-1, 1]) {
            place(
              props,
              cylinder(0.05, 0.06, 1.05, 6),
              baseMat("wood", 0x6e4e32),
              obs.x + px * canW * 0.36,
              h * 0.44 + 0.52,
              obs.y + pz * canD * 0.36,
            );
          }
        }
        place(
          props,
          beveledBox(canW, 0.08, canD, 0.03),
          baseMat("organic", 0xe8dcc4),
          obs.x,
          h * 0.44 + 1.04,
          obs.y,
          0,
          1,
          1,
          1,
          0.1,
        );
      } else {
        // Vitrified Fulgurite Arch
        const alongX = !isCircle && obs.w >= obs.h;
        const span = (isCircle ? rad : alongX ? obs.w : obs.h) * 0.5;
        const pr = Math.min(rad * 0.34, 0.42);
        for (const s of [-1, 1]) {
          const px = obs.x + (alongX || isCircle ? s * span : 0);
          const pz = obs.y + (!alongX && !isCircle ? s * span : 0);
          place(
            props,
            cylinder(pr * 0.82, pr, h * 0.72, 7).toFlatShaded(),
            baseMat("sandstone", 0xb88448),
            px,
            h * 0.42,
            pz,
          );
        }
        const archW = alongX || isCircle ? (span + pr * 0.8) * 2 : pr * 2.0;
        const archD = !alongX && !isCircle ? (span + pr * 0.8) * 2 : pr * 2.0;
        place(props, beveledBox(archW, 0.28, archD, 0.08), baseMat("crystal", 0x26a89c), obs.x, h * 0.82, obs.y);
        place(props, octahedron(rad * 0.22), glowMat(look.accent, 1.18), obs.x, h * 0.98, obs.y);
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
  const look = GLAZES[biome.id] || GLAZES.courtyard;
  const surface =
    biome.id === "courtyard"
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

  let lampLens = null;

  // =========================================================================
  // BIOME 1: LANTERN COURTYARD — Wrought-Brass Balustrades, Paper-Screen Pavilions & Canal Viaduct
  // =========================================================================
  if (biome.id === "courtyard") {
    lampLens = emissiveMaterial({ color: look.light, emissiveIntensity: 1.24 });
    const lampGeos = [];
    const addLampGeo = (g) => lampGeos.push(g);
    const brassMat = mat("metal", FINISH.brass);
    const quayMat = mat("stone", 0x1d2d3d);
    const roofSlate = mat("stone", 0x1a2838);
    const roofCopper = mat("metal", 0x2c5658);
    const woodMat = mat("wood", 0x483226);
    const tealWin = glow(look.accent, 1.02);
    const swayBrass = worldMaterial({ color: FINISH.brass, surface: "metal" });

    // Bespoke Perimeter: Rain-slate stepped plinth + arched brass storm-drain grates + wrought-brass courtyard balustrade
    for (const sz of [-1, 1]) {
      const zCurb = sz * (H + 0.72);
      place(props, beveledBox(W * 2 + 2.2, 0.42, 0.96, 0.08), quayMat, 0, 0.21, zCurb);
      place(props, beveledBox(W * 2 + 2.1, 0.14, 0.42, 0.04), roofSlate, 0, 0.98, zCurb);
      place(props, box(W * 2 + 1.8, 0.06, 0.14), brassMat, 0, 1.07, sz * (H + 0.56));
      const posts = Math.max(8, Math.round(W * 1.1));
      for (let p = 0; p <= posts; p++) {
        const px = -W + (p / posts) * (W * 2);
        place(props, cylinder(0.055, 0.07, 0.54, 6), brassMat, px, 0.68, zCurb);
        if (p < posts && p % 2 === 0) {
          // Arched storm-drain grate along the slate curb
          const gx = px + W / posts;
          place(props, torus(0.22, 0.035, 5, 10), brassMat, gx, 0.24, sz * (H + 0.3), 0, 1, 1, 1, 0);
        }
      }
    }
    for (const sx of [-1, 1]) {
      const xCurb = sx * (W + 0.72);
      place(props, beveledBox(0.96, 0.42, H * 2 + 0.6, 0.08), quayMat, xCurb, 0.21, 0);
      place(props, beveledBox(0.42, 0.14, H * 2 + 0.6, 0.04), roofSlate, xCurb, 0.98, 0);
      place(props, box(0.14, 0.06, H * 2 + 0.4), brassMat, sx * (W + 0.56), 1.07, 0);
      const posts = Math.max(8, Math.round(H * 1.1));
      for (let p = 0; p <= posts; p++) {
        const pz = -H + (p / posts) * (H * 2);
        place(props, cylinder(0.055, 0.07, 0.54, 6), brassMat, xCurb, 0.68, pz);
      }
    }

    // 4 Corner Landmarks: Warm Paper-Screen Gatehouse Corner Pavilions with Gently Swaying Hanging Lanterns
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 1.85);
        const cz = sz * (H + 1.85);
        place(props, beveledBox(2.35, 0.62, 2.35, 0.12), quayMat, cx, 0.31, cz);
        place(props, beveledBox(1.76, 1.88, 1.76, 0.1), woodMat, cx, 1.56, cz);
        // Warm glowing shoji paper-screen panels
        addLampGeo(box(1.42, 1.24, 1.82).translate(cx, 1.62, cz));
        addLampGeo(box(1.82, 1.24, 1.42).translate(cx, 1.62, cz));
        // Double-tiered curved pagoda roof + brass finial
        place(props, cone(1.92, 0.78, 4).toFlatShaded(), roofSlate, cx, 2.74, cz, Math.PI / 4);
        place(props, beveledBox(1.18, 0.56, 1.18, 0.08), woodMat, cx, 3.24, cz);
        addLampGeo(box(0.92, 0.34, 1.22).translate(cx, 3.26, cz));
        place(props, cone(1.36, 0.72, 4).toFlatShaded(), roofCopper, cx, 3.78, cz, Math.PI / 4);
        place(props, octahedron(0.18), brassMat, cx, 4.26, cz, 0, 1, 1.5, 1);
        // Gently swaying hanging brass eave-lanterns outside the arena (pivoted from top hook)
        const lx = cx + sx * 0.95;
        const lz = cz + sz * 0.95;
        const lanternPivot = new Node();
        lanternPivot.position.set(lx, 2.49, lz);
        place(lanternPivot, rawCylinder(0.025, 0.025, 0.42, 5), swayBrass, 0, -0.21, 0);
        place(lanternPivot, octahedron(0.2), swayBrass, 0, -0.53, 0, 0, 0.85, 1.25, 0.85);
        place(lanternPivot, octahedron(0.16), lampLens, 0, -0.53, 0);
        props.add(lanternPivot);
        view.rlAnim.push({ o: lanternPivot, k: "sway", s: 1.45, a: 0.08, ph: sx * 1.1 + sz * 1.7 });
      }
    }

    // Distant Northern Elevated Brass-and-Slate Tram Viaduct & Lit Tram Car Silhouette
    const vz = -(H + 17.8);
    if (safeExterior(0, vz, 3.0, W, H, 0.6)) {
      place(props, beveledBox(W * 2.5, 0.56, 1.45, 0.08), quayMat, 0, 6.8, vz);
      place(props, box(W * 2.5, 0.12, 1.54), brassMat, 0, 7.12, vz);
      for (let vx = -W * 1.1; vx <= W * 1.1; vx += 6.2) {
        place(props, beveledBox(1.1, 6.8, 1.2, 0.1), roofSlate, vx, 3.4, vz);
      }
      // Cozy lit evening tram car gliding smoothly across the distant northern viaduct
      const tramNode = new Node();
      tramNode.position.set(0, 7.82, vz);
      place(tramNode, beveledBox(4.8, 1.35, 1.18, 0.14), roofCopper, 0, 0, 0);
      place(tramNode, box(4.2, 0.52, 1.24), lampLens, 0, 0.1, 0);
      props.add(tramNode);
      view.rlAnim.push({ o: tramNode, k: "tram", bx: 0, span: W * 0.88, s: 0.22, ph: 0.7 });
    }

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

    // Gently bobbing wooden canal skiffs/gondolas floating in the canal moat (maxY <= 0.68)
    const boatSpots = [
      [-W * 0.58, -(H + 4.2), 0.08],
      [W * 0.56, -(H + 4.6), -0.12],
      [-W * 0.54, H + 4.3, 0.1],
      [W * 0.58, H + 4.1, -0.06],
      [-(W + 4.3), -H * 0.52, Math.PI * 0.52],
      [W + 4.4, H * 0.5, Math.PI * 0.48],
    ];
    for (let bi = 0; bi < boatSpots.length; bi++) {
      const [bx, bz, bry] = boatSpots[bi];
      const boat = new Node();
      boat.position.set(bx, 0, bz);
      boat.rotation.y = bry;
      place(boat, beveledBox(2.4, 0.28, 0.86, 0.12), woodMat, 0, 0.16, 0);
      place(boat, beveledBox(1.1, 0.24, 0.66, 0.06), roofSlate, 0, 0.38, 0);
      place(boat, octahedron(0.14), lampLens, 0.95, 0.38, 0);
      props.add(boat);
      view.rlAnim.push({ o: boat, k: "bob", s: 1.45 + bi * 0.18, b: 0, a: 0.055, ph: bi * 1.15, tilt: 0.045 });
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
      // Warm glowing multi-story windows framed by recessed dark timber mullions & sills
      for (const wy of [0.6 + bh * 0.28, 0.6 + bh * 0.74]) {
        place(props, box(bw * 0.7, 0.52, bd * 0.96), darkMat, hx, wy, hz);
        place(props, box(bw * 0.96, 0.52, bd * 0.7), darkMat, hx, wy, hz);
        place(props, box(bw * 0.74, 0.08, bd * 0.99), brassMat, hx, wy - 0.26, hz);
        place(props, box(bw * 0.99, 0.08, bd * 0.74), brassMat, hx, wy - 0.26, hz);
        const wGeo = box(bw * 0.6, 0.36, bd * 0.975).translate(hx, wy, hz);
        const wGeo2 = box(bw * 0.975, 0.36, bd * 0.6).translate(hx, wy, hz);
        if ((idx + Math.round(wy)) % 4 === 0) {
          place(props, box(bw * 0.6, 0.36, bd * 0.975), tealWin, hx, wy, hz);
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

    // Bespoke Perimeter: Sculpted Sapphire Glacier-Ice Berms, Carved Nordic Rune-Stone Curbing & Pillowy Snowdrifts
    for (const sz of [-1, 1]) {
      const zBerm = sz * (H + 0.78);
      place(props, beveledBox(W * 2 + 2.4, 0.74, 1.08, 0.14), iceMat, 0, 0.37, zBerm);
      place(props, beveledBox(W * 2 + 2.2, 0.24, 0.96, 0.09), snowMat, 0, 0.84, zBerm);
      place(props, box(W * 2 + 1.6, 0.07, 0.14), trimGlow, 0, 0.62, sz * (H + 0.3));
      const cairns = Math.max(6, Math.round(W * 0.65));
      for (let c = 0; c <= cairns; c++) {
        const cx = -W + (c / cairns) * (W * 2);
        place(props, cylinder(0.24, 0.32, 1.12, 6).toFlatShaded(), iceMat, cx, 0.56, sz * (H + 0.92));
        place(props, cone(0.26, 0.24, 6).toFlatShaded(), snowMat, cx, 1.2, sz * (H + 0.92));
      }
    }
    for (const sx of [-1, 1]) {
      const xBerm = sx * (W + 0.78);
      place(props, beveledBox(1.08, 0.74, H * 2 + 0.6, 0.14), iceMat, xBerm, 0.37, 0);
      place(props, beveledBox(0.96, 0.24, H * 2 + 0.5, 0.09), snowMat, xBerm, 0.84, 0);
      place(props, box(0.14, 0.07, H * 2 + 0.4), trimGlow, sx * (W + 0.3), 0.62, 0);
      const cairns = Math.max(6, Math.round(H * 0.65));
      for (let c = 0; c <= cairns; c++) {
        const cz = -H + (c / cairns) * (H * 2);
        place(props, cylinder(0.24, 0.32, 1.12, 6).toFlatShaded(), iceMat, sx * (W + 0.92), 0.56, cz);
        place(props, cone(0.26, 0.24, 6).toFlatShaded(), snowMat, sx * (W + 0.92), 1.2, cz);
      }
    }

    // 4 Corner Landmarks: Warm Crackling Timber-and-Stone Expedition Corner Braziers
    let shelfFlameIdx = 0;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 1.85);
        const cz = sz * (H + 1.85);
        place(props, cylinder(1.25, 1.45, 0.78, 8).toFlatShaded(), darkMat, cx, 0.39, cz);
        place(props, cylinder(1.18, 1.28, 0.18, 8), snowMat, cx, 0.84, cz);
        for (let b = 0; b < 4; b++) {
          const ba = (b / 4) * TAU + Math.PI * 0.25;
          place(
            props,
            beveledBox(0.22, 1.85, 0.22, 0.04),
            timberMat,
            cx + Math.cos(ba) * 0.68,
            1.65,
            cz + Math.sin(ba) * 0.68,
          );
        }
        place(props, cylinder(0.92, 0.56, 0.64, 8), brazierMat, cx, 2.38, cz);
        place(props, torus(0.94, 0.07, 5, 14), brazierMat, cx, 2.68, cz, 0, 1, 1, 1, Math.PI / 2);
        const flameNode = new Node();
        flameNode.position.set(cx, 2.84, cz);
        place(flameNode, octahedron(0.58), hearthGlow, 0, 0.22, 0, 0, 0.95, 1.45, 0.95);
        place(flameNode, octahedron(0.34), hearthGlow, 0.24, 0.02, -0.18, 0.5, 0.8, 1.2, 0.8);
        props.add(flameNode);
        view.rlAnim.push({
          o: flameNode,
          k: "flicker",
          s: 6.2 + shelfFlameIdx * 0.65,
          a: 0.14,
          ph: shelfFlameIdx * 1.35,
        });
        shelfFlameIdx++;
      }
    }

    // Towering Faceted Sapphire Ice Cathedrals on the Northern Ridge
    for (const xCat of [-W * 0.32, W * 0.34]) {
      const zCat = -(H + 13.8);
      if (safeExterior(xCat, zCat, 3.6, W, H, 0.6)) {
        place(
          props,
          sculptedCrystal(2.4, 11.2, 2.4, Math.abs(Math.round(xCat * 13)) + 5),
          spireMat,
          xCat,
          -0.2,
          zCat,
          0.25,
        );
        place(
          props,
          sculptedCrystal(1.4, 7.6, 1.4, Math.abs(Math.round(xCat * 17)) + 9),
          spireMat,
          xCat + 1.6,
          -0.2,
          zCat + 0.6,
          -0.4,
        );
        place(
          props,
          sculptedCrystal(1.3, 6.8, 1.3, Math.abs(Math.round(xCat * 19)) + 3),
          spireMat,
          xCat - 1.5,
          -0.2,
          zCat + 0.5,
          0.6,
        );
      }
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
      // Warm glowing paned cabin windows with recessed dark frames
      place(props, box(lw * 0.66, 0.62, ld * 1.015), darkMat, lx, 0.55 + lh * 0.52, lz, ry);
      place(props, box(lw * 1.015, 0.62, ld * 0.62), darkMat, lx, 0.55 + lh * 0.52, lz, ry);
      place(props, box(lw * 0.54, 0.44, ld * 1.032), hearthGlow, lx, 0.55 + lh * 0.52, lz, ry);
      place(props, box(lw * 1.032, 0.44, ld * 0.5), hearthGlow, lx, 0.55 + lh * 0.52, lz, ry);
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

    // Bespoke Perimeter: Braided Mossy Cypress Roots & Crooked Weathered Boardwalk Pilings with Rope Railings
    for (const sz of [-1, 1]) {
      const zRoot = sz * (H + 0.72);
      place(props, beveledBox(W * 2 + 2.0, 0.42, 0.88, 0.14), mossRoof, 0, 0.21, zRoot);
      place(
        props,
        cylinder(0.055, 0.055, W * 2 + 1.6, 6),
        timberMat,
        0,
        0.92,
        sz * (H + 0.78),
        0,
        1,
        1,
        1,
        0,
        Math.PI / 2,
      );
      const pilings = Math.max(7, Math.round(W * 0.75));
      for (let p = 0; p <= pilings; p++) {
        const px = -W + (p / pilings) * (W * 2);
        const tilt = ((p % 3) - 1) * 0.07;
        place(props, cylinder(0.13, 0.19, 1.16, 6), barkMat, px, 0.58, sz * (H + 0.78), p * 0.6, 1, 1, 1, 0, tilt);
        if (p % 3 === 1) {
          place(props, sculptedCap(0.28, 0.18, p * 13 + 7), capAmber, px, 1.18, sz * (H + 0.78));
        }
      }
    }
    for (const sx of [-1, 1]) {
      const xRoot = sx * (W + 0.72);
      place(props, beveledBox(0.88, 0.42, H * 2 + 0.5, 0.14), mossRoof, xRoot, 0.21, 0);
      place(
        props,
        cylinder(0.055, 0.055, H * 2 + 0.4, 6),
        timberMat,
        sx * (W + 0.78),
        0.92,
        0,
        0,
        1,
        1,
        1,
        Math.PI / 2,
        0,
      );
      const pilings = Math.max(7, Math.round(H * 0.75));
      for (let p = 0; p <= pilings; p++) {
        const pz = -H + (p / pilings) * (H * 2);
        const tilt = ((p % 3) - 1) * 0.07;
        place(props, cylinder(0.13, 0.19, 1.16, 6), barkMat, sx * (W + 0.78), 0.58, pz, p * 0.5, 1, 1, 1, tilt, 0);
      }
    }

    // 4 Corner Landmarks: Glowing Spore-Lantern Corner Posts with Velvet Toadstool Hoods
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 1.85);
        const cz = sz * (H + 1.85);
        place(props, cone(1.35, 1.1, 7).toFlatShaded(), barkMat, cx, 0.55, cz);
        place(props, cylinder(0.22, 0.36, 3.35, 7), barkMat, cx, 1.78, cz, 0, 1, 1, 1, sz * 0.05, -sx * 0.05);
        place(props, sculptedCap(1.18, 0.68, 73), capJade, cx, 3.42, cz);
        place(props, cylinder(0.76, 0.52, 0.12, 9), accentGlow, cx, 3.43, cz);
        // Hanging bioluminescent spore-lantern pods
        for (const off of [-0.68, 0.68]) {
          place(props, cylinder(0.025, 0.025, 0.48, 5), timberMat, cx + off, 3.05, cz);
          place(props, octahedron(0.24), sporeLamp, cx + off, 2.68, cz, 0, 0.9, 1.35, 0.9);
        }
      }
    }

    // Weeping Bog-Willow Silhouettes with Swaying Bioluminescent Vine Curtains on the Northern & Flank Mists
    let willowIdx = 0;
    for (const [wx, wz] of [
      [-W * 0.28, -(H + 13.4)],
      [W * 0.3, -(H + 13.8)],
    ]) {
      if (safeExterior(wx, wz, 3.2, W, H, 0.6)) {
        place(props, cone(1.4, 1.6, 6), barkMat, wx, 0.8, wz);
        place(props, cylinder(0.32, 0.62, 6.4, 7), barkMat, wx, 3.2, wz, 0, 1, 1, 1, 0.08);
        const canopy = new Node();
        canopy.position.set(wx, 6.3, wz);
        place(canopy, sculptedCap(2.6, 1.45, 109), mossRoof, 0, 0, 0);
        for (let v = 0; v < 6; v++) {
          const va = (v / 6) * TAU;
          place(
            canopy,
            cylinder(0.05, 0.02, 2.6, 5),
            v % 2 === 0 ? accentGlow : mossRoof,
            Math.cos(va) * 1.8,
            -1.5,
            Math.sin(va) * 1.8,
          );
        }
        props.add(canopy);
        view.rlAnim.push({ o: canopy, k: "sway", s: 0.95 + willowIdx * 0.22, a: 0.055, ph: willowIdx * 1.9 });
        willowIdx++;
      }
    }

    // Slow-turning mossy wooden bog waterwheel mill beside the northeastern stilt hut
    const mwx = W * 0.42;
    const mwz = -(H + 8.6);
    if (safeExterior(mwx, mwz, 2.5, W, H, 0.55)) {
      place(props, cylinder(0.14, 0.2, 2.8, 6), barkMat, mwx - 0.55, 1.4, mwz);
      place(props, cylinder(0.14, 0.2, 2.8, 6), barkMat, mwx + 0.55, 1.4, mwz);
      const wheel = new Node();
      wheel.position.set(mwx, 1.85, mwz);
      place(wheel, torus(1.42, 0.1, 6, 14), timberMat, 0, 0, 0);
      place(wheel, cylinder(0.18, 0.18, 0.75, 6), barkMat, 0, 0, 0, 0, 1, 1, 1, Math.PI / 2);
      for (let p = 0; p < 8; p++) {
        const pa = (p / 8) * TAU;
        place(wheel, box(0.12, 2.8, 0.12), timberMat, 0, 0, 0, 0, 1, 1, 1, 0, pa);
        place(
          wheel,
          beveledBox(0.42, 0.14, 0.66, 0.03),
          p % 2 === 0 ? mossRoof : timberMat,
          Math.cos(pa) * 1.44,
          Math.sin(pa) * 1.44,
          0,
          0,
          1,
          1,
          1,
          0,
          pa + Math.PI / 2,
        );
      }
      props.add(wheel);
      view.rlAnim.push({ o: wheel, k: "wheel", s: 0.52 });
    }

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

    // Bespoke Perimeter: Fractured Levitating Midnight-Obsidian & Burnished-Brass Astrolabe Curbing
    for (const sz of [-1, 1]) {
      const segs = Math.max(7, Math.round(W * 0.62));
      for (let s = 0; s < segs; s++) {
        const sx0 = -W + ((s + 0.5) / segs) * (W * 2);
        const segW = ((W * 2) / segs) * 0.78;
        const yLift = 0.42 + (s % 2) * 0.14;
        const zPos = sz * (H + 0.78);
        place(props, beveledBox(segW, 0.56, 0.88, 0.09), obsMat, sx0, yLift, zPos);
        place(props, box(segW * 1.03, 0.07, 0.92), kintsugiMat, sx0, yLift + 0.28, zPos);
        place(props, box(segW * 0.72, 0.06, 0.14), violetGlow, sx0, yLift + 0.02, sz * (H + 0.34));
      }
      place(props, beveledBox(W * 2 + 2.8, 0.42, 0.72, 0.08), cliffDark, 0, 0.21, sz * (H + 1.55));
    }
    for (const sx of [-1, 1]) {
      const segs = Math.max(7, Math.round(H * 0.62));
      for (let s = 0; s < segs; s++) {
        const sz0 = -H + ((s + 0.5) / segs) * (H * 2);
        const segD = ((H * 2) / segs) * 0.78;
        const yLift = 0.42 + (s % 2) * 0.14;
        const xPos = sx * (W + 0.78);
        place(props, beveledBox(0.88, 0.56, segD, 0.09), obsMat, xPos, yLift, sz0);
        place(props, box(0.92, 0.07, segD * 1.03), kintsugiMat, xPos, yLift + 0.28, sz0);
        place(props, box(0.14, 0.06, segD * 0.72), violetGlow, sx * (W + 0.34), yLift + 0.02, sz0);
      }
      place(props, beveledBox(0.72, 0.42, H * 2 + 1.6, 0.08), cliffDark, sx * (W + 1.55), 0.21, 0);
    }

    // 4 Corner Landmarks: Monumental Rotating Armillary-Sphere Corner Pylons
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 2.05);
        const cz = sz * (H + 2.05);
        place(props, cylinder(1.18, 1.42, 1.35, 8).toFlatShaded(), cliffDark, cx, 0.68, cz);
        place(props, cylinder(1.24, 1.24, 0.1, 8), kintsugiMat, cx, 1.38, cz);
        const armillary = new Node();
        armillary.position.set(cx, 2.85, cz);
        place(armillary, torus(1.08, 0.068, 6, 20), kintsugiMat, 0, 0, 0, 0.2, 1, 1, 1, 0.48);
        place(armillary, torus(0.82, 0.052, 6, 18), violetGlow, 0, 0, 0, -0.5, 1, 1, 1, -0.62);
        place(armillary, octahedron(0.38), roseGlow, 0, 0, 0, 0, 0.85, 1.45, 0.85);
        props.add(armillary);
        view.rlAnim.push({ o: armillary, k: "spinbob", s: 0.52 * sx * sz, b: 2.85, a: 0.14, ph: sx + sz });
      }
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

    // Bespoke Perimeter: Interlocking Carved Dwarven Basalt-and-Bronze Forge Battlements
    for (const sz of [-1, 1]) {
      const zWall = sz * (H + 0.78);
      place(props, beveledBox(W * 2 + 2.4, 0.78, 1.08, 0.1), basaltDark, 0, 0.39, zWall);
      place(props, box(W * 2 + 2.46, 0.1, 1.14), copperMat, 0, 0.78, zWall);
      const merlons = Math.max(7, Math.round(W * 0.65));
      for (let m = 0; m <= merlons; m++) {
        const mx = -W + (m / merlons) * (W * 2);
        place(props, beveledBox(1.12, 0.44, 0.92, 0.07), basaltMat, mx, 1.04, zWall);
        place(props, box(0.56, 0.12, 0.16), lavaGlow, mx, 0.44, sz * (H + 0.3));
      }
    }
    for (const sx of [-1, 1]) {
      const xWall = sx * (W + 0.78);
      place(props, beveledBox(1.08, 0.78, H * 2 + 0.6, 0.1), basaltDark, xWall, 0.39, 0);
      place(props, box(1.14, 0.1, H * 2 + 0.66), copperMat, xWall, 0.78, 0);
      const merlons = Math.max(7, Math.round(H * 0.65));
      for (let m = 0; m <= merlons; m++) {
        const mz = -H + (m / merlons) * (H * 2);
        place(props, beveledBox(0.92, 0.44, 1.12, 0.07), basaltMat, xWall, 1.04, mz);
        place(props, box(0.16, 0.12, 0.56), lavaGlow, sx * (W + 0.3), 0.44, mz);
      }
    }

    // 4 Corner Landmarks: Roaring Corner Furnace-Chimney Braziers with flickering flame plumes
    let calFlameIdx = 0;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 1.9);
        const cz = sz * (H + 1.9);
        place(props, cylinder(1.38, 1.62, 1.4, 6).toFlatShaded(), basaltDark, cx, 0.7, cz);
        place(props, cylinder(1.02, 1.28, 1.85, 6).toFlatShaded(), ironMat, cx, 2.25, cz);
        place(props, torus(1.12, 0.09, 5, 12), copperMat, cx, 2.15, cz, 0, 1, 1, 1, Math.PI / 2);
        place(props, torus(1.06, 0.09, 5, 12), copperMat, cx, 3.16, cz, 0, 1, 1, 1, Math.PI / 2);
        place(props, box(1.45, 0.42, 1.45), lavaGlow, cx, 1.58, cz);
        const flameNode = new Node();
        flameNode.position.set(cx, 3.28, cz);
        place(flameNode, octahedron(0.62), goldFlame, 0, 0.27, 0, 0, 0.95, 1.45, 0.95);
        props.add(flameNode);
        view.rlAnim.push({
          o: flameNode,
          k: "flicker",
          s: 7.2 + calFlameIdx * 0.75,
          a: 0.18,
          ph: calFlameIdx * 1.45,
        });
        calFlameIdx++;
      }
    }

    // Giant Swinging Dwarven Forge-Hammer & Hanging Bronze Chain Silhouettes on the Northern Horizon
    const zForge = -(H + 16.2);
    if (safeExterior(0, zForge, 4.2, W, H, 0.6)) {
      place(props, beveledBox(1.6, 10.5, 1.6, 0.14), ironMat, -4.2, 5.25, zForge);
      place(props, beveledBox(1.6, 10.5, 1.6, 0.14), ironMat, 4.2, 5.25, zForge);
      place(props, beveledBox(10.6, 1.25, 1.9, 0.14), basaltDark, 0, 10.4, zForge);
      // Swinging pendulum pivot at crossbeam: hanging bronze chain links + monumental dwarven forge hammer
      const hammerPivot = new Node();
      hammerPivot.position.set(0, 10.0, zForge);
      for (let cy = 6.2; cy <= 9.6; cy += 0.85) {
        place(hammerPivot, torus(0.36, 0.08, 5, 10), copperMat, 0, cy - 10.0, 0, (cy * 2) % Math.PI);
      }
      place(hammerPivot, beveledBox(3.8, 1.85, 2.1, 0.16), ironMat, 0, -5.1, 0);
      place(hammerPivot, box(3.9, 0.22, 2.2), copperMat, 0, -5.1, 0);
      place(hammerPivot, box(3.4, 0.26, 1.8), lavaGlow, 0, -5.98, 0);
      props.add(hammerPivot);
      view.rlAnim.push({ o: hammerPivot, k: "swing", s: 1.15, a: 0.24, ph: 0 });
    }

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

    // Helper: Elevated Dwarven Stone Lava-Aqueduct pouring animated glowing molten magma into a crucible basin!
    let pourIdx = 0;
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
      // Spout lip + animated vertical pouring molten magma stream + glowing crucible basin below!
      const dirX = Math.sin(rotY);
      const dirZ = Math.cos(rotY);
      const sx = ax + dirX * 1.15;
      const sz = az + dirZ * 1.15;
      if (safeExterior(sx, sz, 1.8, W, H, 0.45)) {
        place(props, beveledBox(1.1, 0.42, 1.1, 0.08), copperMat, sx, height + 0.18, sz);
        place(props, cylinder(1.45, 1.15, 0.72, 8).toFlatShaded(), basaltDark, sx, 0.36, sz);
        const pourNode = new Node();
        pourNode.position.set(sx, 0, sz);
        place(pourNode, cylinder(0.24, 0.34, height + 0.1, 7), lavaGlow, 0, height * 0.5, 0);
        place(pourNode, cylinder(1.18, 1.18, 0.18, 8), goldFlame, 0, 0.7, 0);
        place(pourNode, octahedron(0.32), goldFlame, 0, 0.92, 0);
        props.add(pourNode);
        view.rlAnim.push({ o: pourNode, k: "pour", s: 4.4 + pourIdx * 0.6, a: 0.14, ph: pourIdx * 1.2 });
        pourIdx++;
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
    const clothMat = worldMaterial({ color: FINISH.ivory, surface: "organic", doubleSide: true });
    const turquoiseGlow = glow(look.trim, 1.12);
    const sunGoldGlow = glow(look.accent, 1.16);
    const bannerParts = [];

    // Bespoke Perimeter: Wind-Sculpted Layered Terracotta Sandstone Curbs, Carved Merlons & Turquoise Tile Inlays
    for (const sz of [-1, 1]) {
      const zCurb = sz * (H + 0.74);
      place(props, beveledBox(W * 2 + 2.3, 0.48, 1.04, 0.12), sandWarm, 0, 0.24, zCurb);
      place(props, beveledBox(W * 2 + 2.0, 0.34, 0.72, 0.1), sandLight, 0, 0.62, zCurb);
      place(props, box(W * 2 + 1.7, 0.07, 0.16), turquoiseGlow, 0, 0.81, sz * (H + 0.48));
      place(props, box(W * 2 + 1.9, 0.06, 0.76), brassMat, 0, 0.49, zCurb);
      const merlons = Math.max(6, Math.round(W * 0.46));
      for (let m = 0; m <= merlons; m++) {
        const mx = -W + 1.6 + (m / merlons) * (W * 2 - 3.2);
        if (Math.abs(mx) < 3.0) continue;
        place(props, beveledBox(0.56, 0.42, 0.46, 0.06), sandLight, mx, 0.96, sz * (H + 0.78));
        if (m % 2 === 0) {
          place(props, octahedron(0.14), brassMat, mx, 1.24, sz * (H + 0.78), 0, 0.9, 1.35, 0.9);
        }
      }
    }
    for (const sx of [-1, 1]) {
      const xCurb = sx * (W + 0.74);
      place(props, beveledBox(1.04, 0.48, H * 2 + 0.6, 0.12), sandWarm, xCurb, 0.24, 0);
      place(props, beveledBox(0.72, 0.34, H * 2 + 0.5, 0.1), sandLight, xCurb, 0.62, 0);
      place(props, box(0.16, 0.07, H * 2 + 0.4), turquoiseGlow, sx * (W + 0.48), 0.81, 0);
      place(props, box(0.76, 0.06, H * 2 + 0.5), brassMat, xCurb, 0.49, 0);
      const merlons = Math.max(5, Math.round(H * 0.46));
      for (let m = 0; m <= merlons; m++) {
        const mz = -H + 1.6 + (m / merlons) * (H * 2 - 3.2);
        if (Math.abs(mz) < 3.0) continue;
        place(props, beveledBox(0.46, 0.42, 0.56, 0.06), sandLight, sx * (W + 0.78), 0.96, mz);
        if (m % 2 === 0) {
          place(props, octahedron(0.14), brassMat, sx * (W + 0.78), 1.24, mz, 0, 0.9, 1.35, 0.9);
        }
      }
    }

    // 4 Corner Landmarks: Woven Desert-Cloth Sun-Awning & Brass Wind-Chime Corner Pavilions
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const cx = sx * (W + 1.95);
        const cz = sz * (H + 1.95);
        place(props, beveledBox(2.4, 0.48, 2.4, 0.1), sandWarm, cx, 0.24, cz);
        for (const pxOff of [-0.88, 0.88]) {
          for (const pzOff of [-0.88, 0.88]) {
            place(props, cylinder(0.12, 0.16, 2.55, 6), sandLight, cx + pxOff, 1.72, cz + pzOff);
            place(props, cylinder(0.16, 0.16, 0.12, 6), brassMat, cx + pxOff, 2.95, cz + pzOff);
          }
        }
        // Woven sun-awning roof + brass finial + hanging wind-chimes
        place(props, cone(1.85, 0.72, 4).toFlatShaded(), sandLight, cx, 3.34, cz, Math.PI / 4);
        place(props, octahedron(0.24), turquoiseGlow, cx, 3.84, cz, 0, 1, 1.4, 1);
        bannerParts.push({ side: sz < 0 ? 0 : 1, geo: plane(1.68, 0.62, 2, 1).translate(cx, 2.68, cz + sz * 0.92) });
        for (const chOff of [-0.36, 0, 0.36]) {
          place(props, cylinder(0.03, 0.03, 0.56 - Math.abs(chOff) * 0.3, 5), brassMat, cx + chOff, 2.58, cz);
        }
      }
    }

    // Jewel-Teal Fused-Glass Oasis Pools & Carved Sandstone Arches outside the Walls
    for (const [ox, oz] of [
      [-W * 0.42, -(H + 5.6)],
      [W * 0.42, -(H + 5.6)],
      [-(W + 5.8), H * 0.34],
      [W + 5.8, -H * 0.34],
    ]) {
      if (safeExterior(ox, oz, 2.4, W, H, 0.5)) {
        place(props, cylinder(2.15, 2.35, 0.14, 10), sandWarm, ox, 0.07, oz);
        place(props, cylinder(1.85, 1.85, 0.16, 10), glassMat, ox, 0.09, oz);
        place(props, torus(1.86, 0.05, 5, 16), turquoiseGlow, ox, 0.17, oz, 0, 1, 1, 1, Math.PI / 2);
      }
    }
    for (const ax of [-W * 0.26, W * 0.28]) {
      const az = -(H + 14.6);
      if (safeExterior(ax, az, 3.8, W, H, 0.6)) {
        place(props, cylinder(0.78, 1.05, 6.2, 7).toFlatShaded(), sandWarm, ax - 2.2, 3.1, az);
        place(props, cylinder(0.78, 1.05, 6.2, 7).toFlatShaded(), sandWarm, ax + 2.2, 3.1, az);
        place(props, beveledBox(5.8, 1.15, 1.5, 0.18), sandLight, ax, 6.4, az);
      }
    }

    // 4 Cardinal Monumental Sandstone Temple Pylon-Gateways + Fluttering Cloth Awnings on all 4 Gates
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
      if (safeExterior(0, gz, 2.0, W, H, 0.45)) {
        bannerParts.push({ side: sz < 0 ? 0 : 1, geo: plane(2.6, 1.15, 2, 2).translate(0, ph - 0.68, gz) });
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
      place(props, octahedron(0.36), sunGoldGlow, gx, ph + 0.64, 0, 0, 0.5, 1.2, 1.2);
      if (safeExterior(gx, 0, 2.0, W, H, 0.45)) {
        bannerParts.push({
          side: sx < 0 ? 2 : 3,
          geo: plane(2.5, 1.05, 2, 2)
            .rotateY(Math.PI / 2)
            .translate(gx, ph - 0.65, 0),
        });
      }
    }

    // Perimeter Sun-Bleached Banner Poles
    for (const s of [-1, 1]) {
      for (const k of [-0.56, 0.56]) {
        const bx = k * W,
          bz = s * (H + 2.45);
        place(props, cylinder(0.1, 0.15, 3.6, 6), brassMat, bx, 1.8, bz);
        if (safeExterior(bx + 0.45, bz, 1.1, W, H, 0.4)) {
          bannerParts.push({
            side: s < 0 ? 0 : 1,
            geo: plane(0.92, 1.35, 1, 2).translate(0.46, 2.75, 0).translate(bx, 0, bz),
          });
        }
      }
    }
    if (bannerParts.length) {
      const bSides = [[], [], [], []];
      for (const b of bannerParts) bSides[b.side].push(b.geo);
      for (const list of bSides) {
        if (list.length) props.add(new MeshNode(mergeGeometries(list), clothMat));
      }
    }

    // Helper: Oasis Palm Tree with curved segmented trunk & layered wind-swaying fan-frond crown
    let palmIdx = 0;
    const palmFrondBright = mat("organic", 0x54a266);
    const buildPalm = (px, pz, scale = 1, lean = 0.18, rot = 0) => {
      if (!safeExterior(px, pz, 2.5 * scale, W, H, 0.55)) return;
      const h = 3.8 * scale;
      place(props, cylinder(0.16 * scale, 0.28 * scale, h, 6), palmTrunk, px, h * 0.48, pz, rot, 1, 1, 1, lean);
      const topX = px + Math.sin(rot) * Math.sin(lean) * h * 0.5;
      const topZ = pz + Math.cos(rot) * Math.sin(lean) * h * 0.5;
      const topY = h * 0.94;
      const crown = new Node();
      crown.position.set(topX, topY, topZ);
      // Lower drooping fronds + upper arched bright fronds
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * TAU + rot;
        place(
          crown,
          cone(0.42 * scale, 1.9 * scale, 4).toFlatShaded(),
          palmFrond,
          Math.cos(fa) * 0.72 * scale,
          -0.14 * scale,
          Math.sin(fa) * 0.72 * scale,
          fa,
          0.65,
          1,
          1,
          1.26,
        );
      }
      for (let f = 0; f < 5; f++) {
        const fa = (f / 5) * TAU + rot + 0.35;
        place(
          crown,
          cone(0.32 * scale, 1.45 * scale, 4).toFlatShaded(),
          palmFrondBright,
          Math.cos(fa) * 0.5 * scale,
          0.16 * scale,
          Math.sin(fa) * 0.5 * scale,
          fa,
          0.62,
          1,
          1,
          0.88,
        );
      }
      props.add(crown);
      view.rlAnim.push({ o: crown, k: "sway", s: 1.65 + (palmIdx % 4) * 0.22, a: 0.085, ph: palmIdx * 1.15 });
      palmIdx++;
    };

    // Animated Desert Brass Sundial & Sailed Wind-Mill Tower on the Northern Horizon
    const wmx = 0.0;
    const wmz = -(H + 14.8);
    if (safeExterior(wmx, wmz, 3.8, W, H, 0.6)) {
      place(props, cylinder(1.6, 2.25, 2.2, 8), sandDeep, wmx, 1.1, wmz);
      place(props, cylinder(1.15, 1.55, 6.2, 8), sandWarm, wmx, 5.1, wmz);
      place(props, torus(1.25, 0.1, 6, 16), brassMat, wmx, 7.6, wmz, 0, 1, 1, 1, Math.PI / 2);
      place(props, cone(1.55, 1.9, 8).toFlatShaded(), sandLight, wmx, 9.1, wmz);
      place(props, octahedron(0.45), sunGoldGlow, wmx, 10.35, wmz, 0, 1, 1.4, 1);
      const sails = new Node();
      sails.position.set(wmx, 7.45, wmz + 1.32);
      place(sails, cylinder(0.24, 0.24, 0.52, 8), brassMat, 0, 0, 0, 0, 1, 1, 1, Math.PI / 2);
      for (let s = 0; s < 6; s++) {
        const sa = (s / 6) * TAU;
        place(
          sails,
          box(0.11, 3.4, 0.08),
          brassMat,
          Math.cos(sa) * 1.65,
          Math.sin(sa) * 1.65,
          0,
          0,
          1,
          1,
          1,
          0,
          sa - Math.PI / 2,
        );
        place(
          sails,
          beveledBox(0.72, 2.3, 0.05, 0.01),
          sandLight,
          Math.cos(sa) * 2.05 - Math.sin(sa) * 0.3,
          Math.sin(sa) * 2.05 + Math.cos(sa) * 0.3,
          0.06,
          0,
          1,
          1,
          1,
          0,
          sa - Math.PI / 2,
        );
      }
      props.add(sails);
      view.rlAnim.push({ o: sails, k: "wheel", s: 0.44 });
    }

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

function clearOfObstacles(obstacles, x, z, pad = 0.85) {
  for (const ob of obstacles) {
    if (ob.t === "c") {
      if (Math.hypot(x - ob.x, z - ob.y) < ob.r + pad) return false;
    } else if (Math.abs(x - ob.x) < ob.w + pad && Math.abs(z - ob.y) < ob.h + pad) {
      return false;
    }
  }
  return true;
}

/** 3D floor edge micro-dressing (maxY <= 0.44 strictly below 0.8) along arena perimeter & corners. */
function buildEdgeDressing(view, biome, W, H, obstacles, rng) {
  const props = view.sceneryGroup;
  const look = GLAZES[biome.id] || GLAZES.courtyard;
  const count = 28;
  const floraMat = worldMaterial({
    color: biome.id === "marsh" ? 0x387c54 : biome.id === "courtyard" ? 0xdca84a : 0x568268,
    surface: "organic",
    wakeReact: 1.0,
    doubleSide: true,
  });
  const stoneMat = worldMaterial({
    color:
      biome.id === "shelf"
        ? 0xd6eefc
        : biome.id === "caldera"
          ? 0x362426
          : biome.id === "flats"
            ? 0xbe7e4c
            : biome.id === "core"
              ? 0x221946
              : 0x223446,
    surface: biome.id === "flats" ? "sandstone" : "stone",
  });
  const trimMat = worldMaterial({ color: FINISH.brass, surface: "metal" });
  const glowMat = emissiveMaterial({ color: look.accent, emissiveIntensity: 1.1 });

  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const u = rng.range(-0.92, 0.92);
    const inset = rng.range(0.42, 1.18);
    const px = side < 2 ? u * (W - 0.8) : (side === 2 ? -1 : 1) * (W - inset);
    const pz = side >= 2 ? u * (H - 0.8) : (side === 0 ? -1 : 1) * (H - inset);
    if (Math.hypot(px, pz - 2) < 3.6 || !clearOfObstacles(obstacles, px, pz, 0.9)) continue;
    const rot = rng.range(0, TAU);

    if (biome.id === "courtyard") {
      // Fallen golden gingko leaves, corner moss cushions & brass courtyard medallions (maxY <= 0.22)
      if (i % 3 === 0) {
        place(props, cylinder(0.32, 0.36, 0.05, 8), trimMat, px, 0.025, pz, rot);
      } else {
        place(props, octahedron(0.18), floraMat, px, 0.04, pz, rot, 1.4, 0.22, 0.9);
        place(props, octahedron(0.13), floraMat, px + 0.22, 0.035, pz - 0.14, rot + 0.9, 1.3, 0.2, 0.85);
      }
    } else if (biome.id === "shelf") {
      // Banked perimeter snowdrifts & tiny sparkling frost-crystal clusters (maxY <= 0.4)
      place(props, cylinder(0.45, 0.62, 0.18, 7).toFlatShaded(), stoneMat, px, 0.09, pz, rot, 1.25, 1, 0.85);
      if (i % 2 === 0) {
        place(props, octahedron(0.14), glowMat, px, 0.24, pz, rot, 0.75, 1.1, 0.75);
      }
    } else if (biome.id === "marsh") {
      // 3D bog lily pads with glowing blossoms & GPU wake-parting low reed tufts (maxY <= 0.44)
      place(props, cylinder(0.38, 0.4, 0.04, 7), floraMat, px, 0.02, pz, rot);
      if (i % 2 === 0) {
        place(props, cone(0.08, 0.38, 5), floraMat, px + 0.12, 0.21, pz, rot);
        place(props, cone(0.07, 0.32, 5), floraMat, px - 0.1, 0.18, pz + 0.08, rot + 0.7);
      } else {
        place(props, octahedron(0.11), glowMat, px, 0.09, pz, rot, 1.1, 0.55, 1.1);
      }
    } else if (biome.id === "core") {
      // Levitating obsidian & brass pebble motes hovering just above the edges (maxY <= 0.4)
      place(props, octahedron(0.14), stoneMat, px, 0.22, pz, rot, 1.1, 0.65, 1.1);
      if (i % 2 === 0) {
        place(props, octahedron(0.08), glowMat, px + 0.18, 0.3, pz - 0.12, rot);
      }
    } else if (biome.id === "caldera") {
      // Cooled hexagonal basalt flagstones & warm ember pebbles (maxY <= 0.34)
      place(props, cylinder(0.34, 0.42, 0.14, 6).toFlatShaded(), stoneMat, px, 0.07, pz, rot);
      if (i % 3 === 0) {
        place(props, octahedron(0.09), glowMat, px + 0.14, 0.16, pz, rot);
      }
    } else {
      // Glass Flats: warm terracotta pottery/amphora shards & turquoise glass pebbles (maxY <= 0.36)
      place(props, cylinder(0.22, 0.3, 0.18, 7).toFlatShaded(), stoneMat, px, 0.09, pz, rot, 1.1, 0.8, 0.85);
      if (i % 2 === 0) {
        place(props, octahedron(0.12), glowMat, px - 0.18, 0.14, pz + 0.1, rot, 0.8, 1.1, 0.8);
      }
    }
  }
}

/** Richly dressed miniature Home/Workshop Sanctuary Plinth (maxY <= 0.42) under (0, 0, 0) on the Home screen. */
function buildMenuPlinth(view, biome) {
  const props = view.sceneryGroup;
  const look = GLAZES[biome.id] || GLAZES.courtyard;
  const stoneMat = worldMaterial({ color: look.base, surface: "stone" });
  const trimMat = worldMaterial({ color: FINISH.brass, surface: "metal" });
  const copperMat = worldMaterial({ color: FINISH.copper, surface: "metal" });
  const glowMat = emissiveMaterial({ color: look.light || look.accent, emissiveIntensity: 1.26 });

  place(props, cylinder(1.92, 2.12, 0.085, 16), stoneMat, 0, 0.042, 0);
  place(props, torus(1.94, 0.036, 5, 28), trimMat, 0, 0.082, 0, 0, 1, 1, 1, Math.PI / 2);
  place(props, torus(1.32, 0.024, 5, 24), copperMat, 0, 0.086, 0, 0, 1, 1, 1, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI * 0.25;
    const lx = Math.cos(a) * 2.02;
    const lz = Math.sin(a) * 2.02;
    place(props, cylinder(0.13, 0.17, 0.16, 6), trimMat, lx, 0.08, lz);
    place(props, octahedron(0.11), glowMat, lx, 0.24, lz, a, 0.9, 1.3, 0.9);
    place(props, cone(0.15, 0.1, 4), stoneMat, lx, 0.36, lz, a);
  }
}

const EXTERIOR_CACHE = new Map();

function cloneExteriorNode(src, nodeMap) {
  const dst = src.isMesh ? new MeshNode(src.geometry, src.material) : new Node();
  dst.position.copy(src.position);
  dst.rotation.copy(src.rotation);
  dst.scale.copy(src.scale);
  dst.localMatrix.copy(src.localMatrix);
  dst._isIdentity = src._isIdentity;
  dst.matrixAutoUpdate = src.matrixAutoUpdate;
  dst._matrixDirty = true;
  dst.visible = src.visible;
  dst.castShadow = src.castShadow;
  dst.receiveShadow = src.receiveShadow;
  dst.renderOrder = src.renderOrder;
  dst.frustumCulled = src.frustumCulled;
  nodeMap.set(src, dst);
  for (const ch of src.children) {
    dst.add(cloneExteriorNode(ch, nodeMap));
  }
  return dst;
}

function getExteriorTemplate(biome, W, H) {
  const extKey = `${biome.id}:${W}:${H}`;
  let tpl = EXTERIOR_CACHE.get(extKey);
  if (tpl) return tpl;
  const root = new Node();
  const tmpView = { sceneryGroup: root, rlAnim: [] };
  const lampLens = buildArchitectureAndVistas(tmpView, biome, W, H, makeRng(hashString(`${extKey}:arch`)));
  const keep = new Set(tmpView.rlAnim.map((a) => a.o));
  if (lampLens) keep.add(lampLens);
  setWorldShadows(root);

  root.updateWorldMatrix(true);
  const sceneryInv = root.worldMatrix.clone().invert();
  const sectors = [new Node(), new Node(), new Node(), new Node(), new Node()];
  const walkPartition = (parent) => {
    const keepChildren = [];
    for (const child of parent.children) {
      if (keep.has(child)) {
        keepChildren.push(child);
        continue;
      }
      if (!child.isMesh) {
        walkPartition(child);
        if (child.children.length) keepChildren.push(child);
        continue;
      }
      if (
        child.isInstancedMesh ||
        !child.geometry ||
        child.material?.reedWind ||
        child.material?.transparent ||
        child.material?.additive
      ) {
        keepChildren.push(child);
        continue;
      }
      const b = child.geometry.computeBounds();
      const e = child.worldMatrix.elements;
      const cx = (b.min.x + b.max.x) * 0.5,
        cy = (b.min.y + b.max.y) * 0.5,
        cz = (b.min.z + b.max.z) * 0.5;
      const hx = (b.max.x - b.min.x) * 0.5,
        hy = (b.max.y - b.min.y) * 0.5,
        hz = (b.max.z - b.min.z) * 0.5;
      const wcx = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
      const wcy = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
      const wcz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
      const whx = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
      const why = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
      const whz = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
      let sec = -1;
      if (wcy + why <= 0.78) sec = 4;
      else if (wcz + whz <= -H + 0.001) sec = 0;
      else if (wcz - whz >= H - 0.001) sec = 1;
      else if (wcx + whx <= -W + 0.001) sec = 2;
      else if (wcx - whx >= W - 0.001) sec = 3;
      if (sec >= 0) {
        child.localMatrix.multiplyMatrices(sceneryInv, child.worldMatrix);
        child._isIdentity = false;
        child.matrixAutoUpdate = false;
        child._matrixDirty = false;
        child.parent = sectors[sec];
        sectors[sec].children.push(child);
      } else {
        keepChildren.push(child);
      }
    }
    parent.children = keepChildren;
  };
  walkPartition(root);
  for (const sNode of sectors) {
    if (sNode.children.length) {
      root.add(sNode);
      mergeStaticNodes(sNode, keep);
    }
  }
  mergeStaticNodes(root, keep);
  root.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.shared = true;
      obj.geometry.computeBounds();
    }
  });
  tpl = { root, anims: tmpView.rlAnim, lampLens };
  EXTERIOR_CACHE.set(extKey, tpl);
  return tpl;
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
    this._obsFrozen = false;
  }

  build(biome, layout, animate = false, isMenu = false) {
    layout = layout || {
      key: isMenu ? `${biome.id}:menu` : `${biome.id}:classic`,
      W: biome.W,
      H: biome.H,
      obs: biome.obstacles,
      deco: 0,
    };
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

    const look = GLAZES[biome.id] || GLAZES.courtyard;
    this.uniforms.uGrid.value.setHex(look.trim);
    this.uniforms.uGlaze.value.setHex(look.base);
    this.uniforms.uAccent.value.setHex(look.accent);
    this.uniforms.uHalf.value.set(layout.W, layout.H);
    this.uniforms.uStyle.value = look.style;

    this.groundOcclusion?.dispose();
    this.groundOcclusion = createGroundOcclusion(layout.W, layout.H, layout.obs, layout.props || []);
    this.uniforms.uOcclusion.value = this.groundOcclusion;
    if (this.engine) this.engine.textures.occlusion = this.groundOcclusion;

    // Stylized painterly arena & exterior world plane (160x160 covers all corner vistas cleanly)
    const floorGeo = plane(160, 160, 1, 1).rotateX(-Math.PI / 2);
    const floor = new MeshNode(floorGeo, this.floorMat);
    floor.receiveShadow = true;
    floor.renderOrder = 2;
    floor.frustumCulled = false;
    this.group.add(floor);
    floor.freezeStatic();

    // Lightweight distant sky & horizon gradient ring strictly outside the playable arena
    this.group.add(createSkyBackdrop(biome.id, layout.W, layout.H));

    const props = new Node();
    this.group.add(props);
    this.obsGroup = props;
    const scenery = new Node();
    this.group.add(scenery);
    this.sceneryGroup = scenery;
    this.rlAnim = [];

    buildCover(this, biome.id, layout.obs, makeRng(hashString(layout.key + ":cover")));

    const edgeGroup = new Node();
    const edgeView = { sceneryGroup: edgeGroup, rlAnim: this.rlAnim };
    buildEdgeDressing(edgeView, biome, layout.W, layout.H, layout.obs, makeRng(hashString(layout.key + ":edge")));
    if (isMenu) buildMenuPlinth(edgeView, biome);
    setWorldShadows(edgeGroup);
    mergeStaticNodes(edgeGroup, new Set());
    edgeGroup.freezeStatic();
    this.sceneryGroup.add(edgeGroup);

    const extTpl = getExteriorTemplate(biome, layout.W, layout.H);
    const nodeMap = new Map();
    const extInstance = cloneExteriorNode(extTpl.root, nodeMap);
    this.sceneryGroup.add(extInstance);
    this.lampLens = extTpl.lampLens;
    for (const a of extTpl.anims) {
      const mapped = nodeMap.get(a.o);
      if (mapped) this.rlAnim.push({ ...a, o: mapped });
    }

    if (biome.id === "shelf") {
      const aurora = createAurora(layout.W, layout.H);
      this.group.add(aurora);
      this.rlAnim.push({ o: aurora, k: "aurora" });
    }

    const keep = new Set(this.rlAnim.map((a) => a.o));
    if (this.lampLens) keep.add(this.lampLens);
    setWorldShadows(this.obsGroup);
    mergeStaticNodes(this.obsGroup, keep);

    extInstance.updateWorldMatrix(true);
    for (const child of extInstance.children) {
      if (!keep.has(child)) child.freezeStatic();
    }

    this.rise = animate && !first ? 0 : 1;
    props.position.y = this.rise < 1 ? -2.4 : 0;
    this._obsFrozen = false;
    if (this.rise >= 1) this._freezeCoverStatic(keep);
  }

  _freezeCoverStatic(keepSet = null) {
    if (!this.obsGroup || this._obsFrozen) return;
    const keep = keepSet || new Set(this.rlAnim.map((a) => a.o));
    this.obsGroup.updateWorldMatrix(true);
    for (const child of this.obsGroup.children) {
      if (!keep.has(child)) child.freezeStatic();
    }
    this._obsFrozen = true;
  }

  update(dt, px, pz, pulse) {
    if (this.obsGroup && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 0.65);
      const ease = 1 - Math.pow(1 - this.rise, 3);
      this.obsGroup.position.y = -2.4 * (1 - ease);
      if (this.rise >= 1) this._freezeCoverStatic();
    }
    this.uniforms.uTime.value += dt;
    this.uniforms.uPulse.value = pulse;
    const time = this.uniforms.uTime.value;
    if (this.biomeId === "courtyard" && this.lampLens) {
      const dark = this.uniforms.uDark.value || 0;
      const ember = (1.08 + 0.14 * Math.cos(time * 0.9)) * (1 + dark * 0.28);
      this.lampLens.emissiveIntensity = ember;
    }
    for (const anim of this.rlAnim) {
      const obj = anim.o;
      if (anim.k === "spin" || anim.k === "spinbob") obj.rotation.y += dt * anim.s;
      if (anim.k === "bob" || anim.k === "spinbob") {
        const wave = Math.sin(time * (anim.s || 1) + anim.ph);
        obj.position.y = anim.b + wave * (anim.a || 0.14);
        if (anim.tilt) obj.rotation.x = Math.cos(time * (anim.s || 1) * 0.8 + anim.ph) * anim.tilt;
      } else if (anim.k === "tram") {
        obj.position.x = (anim.bx || 0) + Math.sin(time * (anim.s || 0.22) + (anim.ph || 0)) * (anim.span || 12);
      } else if (anim.k === "swing") {
        obj.rotation.z = Math.sin(time * (anim.s || 1.15) + (anim.ph || 0)) * (anim.a || 0.24);
      } else if (anim.k === "flicker") {
        const f =
          Math.sin(time * (anim.s || 6.5) + (anim.ph || 0)) * 0.6 +
          Math.sin(time * ((anim.s || 6.5) * 1.73) + (anim.ph || 0)) * 0.4;
        const a = anim.a || 0.14;
        obj.scale.set(1 + f * a * 0.5, 1 + f * a, 1 - f * a * 0.45);
        obj.rotation.y = f * 0.24;
      } else if (anim.k === "pour") {
        const p = Math.sin(time * (anim.s || 4.5) + (anim.ph || 0));
        const a = Math.min(0.045, (anim.a || 0.14) * 0.32);
        obj.scale.set(1 + p * a, 1 + p * a * 1.4, 1 - p * a * 0.65);
      } else if (anim.k === "sway") {
        const s = anim.s || 1.7;
        const a = anim.a || 0.085;
        obj.rotation.z = Math.sin(time * s + (anim.ph || 0)) * a;
        obj.rotation.x = Math.cos(time * s * 0.78 + (anim.ph || 0)) * a * 0.7;
      } else if (anim.k === "wheel") {
        obj.rotation.z -= dt * (anim.s || 0.5);
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
      case "courtyard":
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
