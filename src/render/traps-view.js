// Biome-native diorama trap views (carillon pads, glacier fissures, pitcher spouts, star-wells, slag craters,
// sun-roses, pagoda lighthouse beacons, armillary looms, kiln bellows, and shootable miniature vessels).

import { Color } from "../engine/math.js";
import { cylinder, octahedron, icosahedron, torus, meshPart, mergeGeometries } from "../engine/geometry.js";
import { worldMaterial, emissiveMaterial, hexColor } from "./materials.js";
import { FINISH } from "./palette.js";
import { clamp, TAU, angleDiff } from "../core/util.js";

const WHITE = hexColor(FINISH.ivory);
const WARN = hexColor(FINISH.vermilion);
const tint = new Color();
const hex = hexColor;
const BEAM_SIDES = [-1, 1];

const LOOK = {
  plate: { main: hex(FINISH.brass), alt: hex(0xfff0c4), dust: hex(0x8e9da8) },
  icespike: { main: hex(FINISH.glacier), alt: hex(FINISH.ivory), dust: hex(0xdff6ff) },
  geyser: { main: hex(FINISH.jade), alt: hex(0xd6f5e2), dust: hex(0x1c4a3c) },
  riftburst: { main: hex(FINISH.lavender), alt: hex(0xf6d8a8), dust: hex(0x2a1650) },
  laser: { main: hex(0xf6be58), alt: hex(0xfff1c4), dust: hex(0x9fb4c8) },
  magma: { main: hex(0xff7a1f), alt: hex(0xffd27a), dust: hex(0x746957) },
  rift: { main: hex(0xae7cff), alt: hex(0xf4d29a), dust: hex(0x2a1650) },
  iceShot: { main: hex(FINISH.glacier), alt: hex(0xe8fbff), dust: hex(0xdff6ff) },
  acid: { main: hex(FINISH.jade), alt: hex(0xd6f5e2), dust: hex(0x1c4a3c) },
  mine: { main: hex(0xf4a842), alt: hex(0xffe6a8), dust: hex(0x6e5b48), wick: hex(0xffbc58) },
  frost: { main: hex(FINISH.glacier), alt: hex(FINISH.ivory), dust: hex(0xdff6ff), wick: hex(0xc8f6ff) },
  spore: { main: hex(FINISH.jade), alt: hex(0xd6f5e2), dust: hex(0x1c4a3c), wick: hex(0x98ffba) },
  riftmine: { main: hex(FINISH.lavender), alt: hex(0xf6d8a8), dust: hex(0x2a1650), wick: hex(0xe6b6ff) },
  embermine: { main: hex(0xff8438), alt: hex(0xffd27a), dust: hex(0x523a2c), wick: hex(0xff9e39) },
  glassmine: { main: hex(0x46d8c8), alt: hex(0xfff0c4), dust: hex(0xc8b38b), wick: hex(0xffe08a) },
  pyro: { main: hex(0xff8c32), alt: hex(0xffe9b0), dust: hex(0x3a2418) },
  sunspike: { main: hex(0x42d2c0), alt: hex(0xfff3d6), dust: hex(0xd8c8a8) },
  sun: { main: hex(0xff9a2e), alt: hex(0xffd27a), dust: hex(0xffe0b0) },
};
const ARMING = hex(FINISH.brass);
const TRIGGER = hex(0xffae71);

const easeOut = (k) => 1 - (1 - k) * (1 - k);
const facets = (n, fn) => Array.from({ length: n }, (_, i) => fn((i * TAU) / n, i));
const disk = (r, h, color, y, n = 10) => meshPart(cylinder(r * 0.92, r, h, n), color, { y });
const cone = (rTop, rBot, h, color, y, n = 10) => meshPart(cylinder(rTop, rBot, h, n), color, { y });
const gem = (r, color, p) => meshPart(octahedron(r), color, p);
const stone = (r, color, p) => meshPart(icosahedron(r, 0), color, p);
const bezel = (r, w, color, y, n = 18) => meshPart(torus(r, w, 5, n), color, { y, rx: Math.PI / 2 });

// Organic ring of sculpted diorama stones/roots/rocks around a natural floor hazard
function stoneRing(count, r, colA, colB, sy = 0.52) {
  return facets(count, (a, i) =>
    stone(i % 2 ? 0.2 : 0.16, i % 2 ? colA : colB, {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      y: 0.075,
      ry: -a,
      sx: 1.05,
      sy,
      sz: 1.35,
    }),
  );
}

// Rising crystal / glass-rose bloom cluster
function crystalBloom(color, alt, n, spread = 0.34) {
  return facets(n, (a, i) =>
    gem(i === 0 ? 0.5 : 0.27, i % 2 ? color : alt, {
      x: i === 0 ? 0 : Math.cos(a) * spread,
      z: i === 0 ? 0 : Math.sin(a) * spread,
      y: i === 0 ? 0.44 : 0.26,
      ry: a,
      rz: Math.cos(a) * 0.32,
      sy: i === 0 ? 1.08 : 0.92,
    }),
  );
}

// Bespoke handcrafted 3D diorama models for every biome trap
const MODELS = {
  // --- FLOOR HAZARDS ---
  // Courtyard: sunken bronze carillon basin with a rising brass temple-bell clapper
  plate: () => ({
    body: [
      disk(0.95, 0.08, 0x20303b, 0.04, 8),
      bezel(0.84, 0.045, 0xdca052, 0.095, 16),
      ...facets(4, (a) => stone(0.11, 0x385466, { x: Math.cos(a) * 0.88, z: Math.sin(a) * 0.88, y: 0.1, sy: 0.65 })),
    ],
    glow: [
      bezel(0.58, 0.025, 0xf6c86e, 0.1, 18),
      ...facets(8, (a) => gem(0.085, 0xffe4a0, { x: Math.cos(a) * 0.72, z: Math.sin(a) * 0.72, y: 0.11, sy: 0.24 })),
    ],
    mover: [
      cone(0.14, 0.34, 0.38, 0xe4a852, 0.24, 10),
      bezel(0.34, 0.03, 0xfff0c4, 0.07, 14),
      stone(0.09, 0xb87634, { y: 0.45 }),
    ],
  }),
  // Snow Ridge: snow-crusted glacier rock fissure + erupting sapphire rime spires
  icespike: () => ({
    body: [...stoneRing(9, 0.84, 0x3c6c94, 0x6ba2cc, 0.48), disk(0.76, 0.05, 0x274c6e, 0.028, 7)],
    glow: [bezel(0.56, 0.028, 0x9ce2ff, 0.07, 14)],
    mover: crystalBloom(0x6ec4ee, 0xc8f0ff, 5, 0.34),
  }),
  // Moss Bog: mossy bog-root collar + bulbous botanical pitcher-plant spout
  geyser: () => ({
    body: [
      ...stoneRing(8, 0.8, 0x244834, 0x326444, 0.46),
      cone(0.52, 0.66, 0.26, 0x2f6848, 0.14, 8),
      bezel(0.52, 0.06, 0x56b874, 0.26, 14),
    ],
    glow: [bezel(0.42, 0.032, 0x96f6a6, 0.28, 14)],
    mover: [stone(0.48, 0x62d888, { y: 0.34, sy: 0.72 })],
  }),
  // Star Hall: carved obsidian astrolabe well + spinning gilded star-ring
  riftburst: () => ({
    body: [...stoneRing(6, 0.86, 0x1e1538, 0x352560, 0.58), bezel(0.74, 0.034, 0xc89a5c, 0.1, 16)],
    glow: [bezel(0.54, 0.025, 0xc896f8, 0.11, 16)],
    mover: [
      gem(0.34, 0xb07ef0, { y: 0.0, sy: 1.25 }),
      meshPart(torus(0.52, 0.034, 5, 16), 0xe8bc6c, { rx: 0.65, rz: 0.4 }),
    ],
  }),
  // Ember Hill: jagged charred basalt anvil-fissure + swelling molten slag crest
  pyro: () => ({
    body: [...stoneRing(10, 0.84, 0x2a1b1c, 0x4b2820, 0.54), disk(0.74, 0.05, 0x361a16, 0.028, 7)],
    glow: [bezel(0.62, 0.034, 0xf48c36, 0.075, 16)],
    mover: [stone(0.5, 0xf27028, { y: 0.3, sy: 0.65 })],
  }),
  // Sun Dunes: sun-baked sandstone basin + blooming turquoise-gold desert glass-rose petals
  sunspike: () => ({
    body: [...stoneRing(8, 0.84, 0x764f2c, 0xa87c4a, 0.46), bezel(0.72, 0.032, 0x2ca89a, 0.085, 16)],
    glow: [bezel(0.54, 0.025, 0xf4c868, 0.095, 16)],
    mover: crystalBloom(0x32bca8, 0xf4d078, 6, 0.38),
  }),

  // --- SWEEPING BEACONS & BELLOWS ---
  // Courtyard: miniature pagoda lighthouse tower with curved eaves & spinning Fresnel brass lantern
  laser: () => ({
    body: [
      disk(0.62, 0.16, 0x22323e, 0.08, 8),
      cone(0.38, 0.5, 0.68, 0x365260, 0.48, 8),
      bezel(0.44, 0.04, 0xdca052, 0.82, 16),
      cone(0.14, 0.62, 0.24, 0x26404c, 1.56, 8),
      bezel(0.58, 0.035, 0xe4aa56, 1.45, 16),
    ],
    glow: facets(4, (a) => gem(0.08, 0xffd078, { x: Math.cos(a) * 0.44, z: Math.sin(a) * 0.44, y: 0.52, sy: 0.8 })),
    mover: [
      cone(0.24, 0.28, 0.42, 0xdca052, 0.0, 8),
      meshPart(torus(0.2, 0.04, 5, 14), 0xf6c868, { x: 0.3, ry: Math.PI / 2 }),
    ],
    moverGlow: [stone(0.18, 0xffe8a4, { x: 0.18 }), gem(0.12, 0xfff6d2, { x: 0.32, sx: 0.45 })],
  }),
  // Snow Ridge: Aurora Curtain — frost crystal prism projector on snow-rimmed glacier pedestal
  iceShot: () => ({
    body: [
      ...stoneRing(7, 0.62, 0x3b6d94, 0x7ab4dc, 0.58),
      cone(0.34, 0.48, 0.62, 0x4a82ac, 0.36, 7),
      bezel(0.38, 0.038, 0xc8a468, 0.68, 14),
    ],
    glow: facets(4, (a) => gem(0.085, 0x9ce8ff, { x: Math.cos(a) * 0.42, z: Math.sin(a) * 0.42, y: 0.44, sy: 1.15 })),
    mover: [
      gem(0.28, 0x5aa4d4, { y: 0.0, sx: 1.25, sy: 1.15, sz: 0.85 }),
      meshPart(torus(0.24, 0.032, 5, 14), 0xd4a862, { x: 0.24, ry: Math.PI / 2 }),
      gem(0.16, 0x86ccf2, { x: 0.36, sx: 1.4, sy: 0.55, sz: 0.55 }),
    ],
    moverGlow: [gem(0.2, 0xb8f0ff, { x: 0.16, sy: 1.1 }), gem(0.12, 0xeefcff, { x: 0.42, sx: 0.7 })],
  }),
  // Moss Bog: Pitcher Spout — carved bog-reed spout with bulbous botanical nozzle
  acid: () => ({
    body: [
      ...stoneRing(7, 0.62, 0x224632, 0x346848, 0.54),
      cone(0.32, 0.48, 0.54, 0x2f5e40, 0.3, 8),
      bezel(0.36, 0.045, 0x52b470, 0.56, 14),
    ],
    glow: [bezel(0.34, 0.026, 0x92f4a8, 0.32, 14)],
    mover: [
      stone(0.28, 0x3b7c52, { x: -0.04, y: 0.02, sx: 1.15, sy: 0.92, sz: 0.95 }),
      cone(0.2, 0.14, 0.4, 0x4ca268, 0.04, 8)
        .rotateZ(-Math.PI / 2)
        .translate(0.24, 0.02, 0),
      bezel(0.2, 0.036, 0x74dc92, 0.02, 12)
        .rotateZ(Math.PI / 2)
        .translate(0.42, 0, 0),
    ],
    moverGlow: [stone(0.17, 0x9ef8b4, { x: 0.38, sx: 0.68 })],
  }),
  // Sun Dunes: Heliostat Mirror — gilded brass sun-mirror dish on carved sandstone sundial plinth
  sun: () => ({
    body: [
      disk(0.62, 0.16, 0x8a5e34, 0.08, 8),
      cone(0.34, 0.5, 0.64, 0xb0804c, 0.44, 8),
      bezel(0.42, 0.038, 0x2ca89a, 0.52, 16),
      bezel(0.36, 0.042, 0xe2a854, 0.78, 16),
    ],
    glow: facets(4, (a) => gem(0.08, 0xffd878, { x: Math.cos(a) * 0.44, z: Math.sin(a) * 0.44, y: 0.38, sy: 0.85 })),
    mover: [
      meshPart(torus(0.34, 0.042, 6, 16), 0xe6ad56, { x: 0.08, ry: Math.PI / 2 }),
      cone(0.32, 0.12, 0.18, 0xc88a3c, 0.0, 12)
        .rotateZ(-Math.PI / 2)
        .translate(0.04, 0, 0),
      gem(0.14, 0x36c4b2, { x: 0.28, sx: 1.35, sy: 0.6, sz: 0.6 }),
    ],
    moverGlow: [
      disk(0.25, 0.04, 0xffe294, 0.0, 12)
        .rotateZ(Math.PI / 2)
        .translate(0.12, 0, 0),
      gem(0.13, 0xfff4cc, { x: 0.36, sx: 0.75 }),
    ],
  }),
  // Ember Hill: squat forged-iron dragon-kiln chimney & brass bellows nozzle
  magma: () => ({
    body: [
      ...stoneRing(6, 0.58, 0x2c1b1a, 0x4c2820, 0.72),
      cone(0.42, 0.52, 0.34, 0x3c2220, 0.22, 6),
      bezel(0.45, 0.05, 0xd0682c, 0.38, 12),
    ],
    glow: [bezel(0.36, 0.03, 0xff923c, 0.4, 12)],
    mover: [
      cone(0.26, 0.36, 0.34, 0x5c2c22, 0.0, 6),
      cone(0.18, 0.26, 0.42, 0xc8642c, 0.04, 6)
        .rotateZ(-Math.PI / 2)
        .translate(0.28, 0, 0),
    ],
    moverGlow: [stone(0.18, 0xff9a38, { x: 0.44, sx: 0.6 })],
  }),
  // Star Hall: carved obsidian dais with hovering gilded brass-and-amethyst armillary sphere
  rift: () => ({
    body: [
      disk(0.58, 0.16, 0x1d1438, 0.08, 6),
      cone(0.28, 0.44, 0.56, 0x352460, 0.44, 6),
      bezel(0.36, 0.038, 0xd8a864, 0.72, 16),
    ],
    glow: facets(4, (a) => gem(0.085, 0xd49eff, { x: Math.cos(a) * 0.42, z: Math.sin(a) * 0.42, y: 0.26, sy: 0.7 })),
    mover: [
      meshPart(torus(0.38, 0.035, 5, 16), 0xe2b668, { rx: 0.5 }),
      meshPart(torus(0.32, 0.03, 5, 16), 0x8e62d8, { ry: 0.7, rz: 0.6 }),
      gem(0.16, 0x543a86, { x: 0.34, sx: 1.3, sy: 0.65, sz: 0.65 }),
    ],
    moverGlow: [gem(0.18, 0xecd0ff, { y: 0 }), gem(0.1, 0xfff0c8, { x: 0.42 })],
  }),

  // --- SHOOTABLE PROXIMITY VESSELS ---
  // Courtyard: plump ceramic wick-lantern pot with brass collar & glowing wax wick
  mine: () => ({
    body: [
      stone(0.32, 0x5c4230, { y: 0.22, sy: 0.88 }),
      bezel(0.28, 0.038, 0xe0a450, 0.34, 14),
      cone(0.18, 0.24, 0.12, 0x324b58, 0.42, 8),
    ],
    glow: [gem(0.14, 0xffffff, { y: 0.54, sy: 1.4 }), bezel(0.25, 0.022, 0xffffff, 0.24, 14)],
  }),
  // Snow Ridge: faceted frost-glass bauble perched on a snow cushion
  frost: () => ({
    body: [
      disk(0.34, 0.09, 0x9ecae4, 0.045, 8),
      stone(0.29, 0x5696c4, { y: 0.26, sy: 0.92 }),
      bezel(0.29, 0.028, 0xc8eeff, 0.26, 14),
    ],
    glow: [gem(0.16, 0xffffff, { y: 0.28 }), bezel(0.22, 0.018, 0xffffff, 0.42, 12)],
    mover: [gem(0.14, 0x88d4f4, { y: 0.52, sy: 1.45 })],
  }),
  // Moss Bog: plump speckled puff-cap toadstool on a mossy stem
  spore: () => ({
    body: [cone(0.14, 0.18, 0.24, 0x486e4c, 0.12, 7), stone(0.34, 0x3a8458, { y: 0.34, sy: 0.62 })],
    glow: [
      ...facets(5, (a) => stone(0.065, 0xffffff, { x: Math.cos(a) * 0.23, z: Math.sin(a) * 0.23, y: 0.4, sy: 0.6 })),
      stone(0.1, 0xffffff, { y: 0.52, sy: 0.5 }),
    ],
    mover: [bezel(0.28, 0.024, 0x72e89c, 0.22, 14)],
  }),
  // Star Hall: levitating gilded star-snare urn ringed by an orbit hoop
  riftmine: () => ({
    body: [disk(0.24, 0.07, 0x22173e, 0.035, 6), gem(0.28, 0x5c3e92, { y: 0.34, sy: 1.15 })],
    glow: [gem(0.15, 0xffffff, { y: 0.36 }), bezel(0.28, 0.018, 0xffffff, 0.34, 14)],
    mover: [meshPart(torus(0.35, 0.026, 5, 14), 0xe2b668, { y: 0.34, rx: 0.85 })],
  }),
  // Ember Hill: iron-banded terracotta furnace slag keg
  embermine: () => ({
    body: [
      cone(0.26, 0.3, 0.38, 0x6e3022, 0.2, 8),
      bezel(0.3, 0.036, 0x2c1b1c, 0.14, 12),
      bezel(0.28, 0.036, 0xd87032, 0.32, 12),
    ],
    glow: [stone(0.16, 0xffffff, { y: 0.42, sy: 0.72 }), bezel(0.24, 0.02, 0xffffff, 0.24, 12)],
  }),
  // Sun Dunes: handcrafted sandstone desert amphora crowned with a turquoise glass prism
  glassmine: () => ({
    body: [
      cone(0.22, 0.16, 0.18, 0x9e7040, 0.09, 8),
      cone(0.14, 0.26, 0.24, 0xb8864e, 0.3, 8),
      bezel(0.24, 0.03, 0x2ca89a, 0.2, 14),
    ],
    glow: [gem(0.15, 0xffffff, { y: 0.52, sy: 1.35 }), bezel(0.18, 0.018, 0xffffff, 0.42, 12)],
    mover: [gem(0.13, 0x42c8b8, { y: 0.5, sy: 1.4 })],
  }),
};
const MAX = { floor: 12, beam: 8, mine: 16 };

export class TrapView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.st = new Map();
    this.arr = null;
  }
  build(name, max = 16) {
    return this.get(name, max);
  }
  get(name, max = 16) {
    let set = this.pl[name];
    if (set) return set;
    const fn = MODELS[name] || MODELS.laser;
    const m = fn();
    const mk = (parts, glow) => {
      const mat = glow
        ? emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.14 })
        : worldMaterial({
            color: 0xffffff,
            vertexColors: true,
            surface: ["sunspike", "glassmine", "sun"].includes(name)
              ? "sandstone"
              : name === "geyser" || name === "spore" || name === "acid"
                ? "wood"
                : ["pyro", "magma", "embermine"].includes(name)
                  ? "basalt"
                  : name === "icespike" || name === "frost" || name === "iceShot"
                    ? "ice"
                    : "stone",
          });
      const pool = new this.Pool(mergeGeometries(parts.flat()), mat, max);
      if (!glow) pool.mesh.castShadow = pool.mesh.receiveShadow = true;
      this.r.scene.add(pool.mesh);
      this.list.push(pool);
      pool.mesh.renderOrder = glow ? 3 : 1;
      return pool;
    };
    set = this.pl[name] = {
      body: mk(m.body, false),
      glow: m.glow ? mk(m.glow, true) : null,
      mover: m.mover ? mk(m.mover, false) : null,
      moverGlow: m.moverGlow ? mk(m.moverGlow, true) : null,
    };
    return set;
  }
  state(trap) {
    let s = this.st.get(trap.id);
    if (!s) {
      s = { fire: 9, last: trap.st, x: trap.x, z: trap.y, yaw: trap.a, pop: 9, shat: false };
      this.st.set(trap.id, s);
    }
    return s;
  }
  update(dt, world) {
    const traps = world.traps;
    const r = this.r;
    if (this.arr !== traps) {
      this.arr = traps;
      this.st.clear();
    }
    const quality = Math.min(1, r.maxParticles / 1400);
    for (const trap of traps) {
      const s = this.state(trap);
      const look = LOOK[trap.skin];
      if (!look) continue;
      s.fire += dt;
      s.pop += dt;
      if (trap.st !== s.last) {
        if (trap.st === "unarmed" && s.last === "gone") {
          s.pop = 0;
          s.x = trap.x;
          s.z = trap.y;
          r.ring(trap.x, trap.y, 0.2, 1.3, look.main, 0.4);
          r.burst(trap.x, trap.y, 0.15, 6, 2.5, look.main, 0.5, 0.25, { up: 2, drag: 2 });
        }
        s.last = trap.st;
      }
      if (trap.hunt) {
        const k = Math.min(1, dt * 12);
        s.x += (trap.x - s.x) * k;
        s.z += (trap.y - s.z) * k;
      } else {
        s.x = trap.x;
        s.z = trap.y;
      }
      this[trap.fam](trap, s, look, dt, quality, world);
    }
  }
  warnRing(x, z, radius, k) {
    const r = this.r;
    r.shadows.y(x, 0.03, z, 0, radius * 2.6);
    r.ringPool.colC(r.ringPool.y(x, 0.2, z, 0, radius), WARN, 0.72 + k * 0.35);
    r.discs.colC(r.discs.y(x, 0.19, z, 0, radius * k), WARN, 0.2 + k * 0.16);
    r.ringPool.colC(r.ringPool.y(x, 0.195, z, 0, radius * k), WARN, 0.42);
  }
  floor(trap, s, look, dt, quality) {
    const r = this.r;
    const time = r.time;
    const x = s.x,
      z = s.z,
      rr = trap.r;
    const P = this.get(trap.skin, MAX.floor);
    const warn = trap.st === "warn";
    const k = warn ? clamp(trap.t / trap.delay, 0, 1) : 0;
    const hit = s.fire < 0.3 ? 1 - s.fire / 0.3 : 0;
    P.body.y(x, 0, z, 0, rr, 1, rr);
    const glow = 0.45 + Math.sin(time * 2 + trap.id) * 0.1 + k * 0.7 + hit * 0.7;
    const emit = Math.random() < dt * (3 + k * 22) * quality;
    switch (trap.skin) {
      case "plate": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, glow);
        const lift = warn ? 0.12 + k * 0.65 : s.fire < 0.25 ? 0.05 + (1 - s.fire / 0.25) * 0.12 : 0.1;
        const swing = warn ? Math.sin(time * (12 + k * 14)) * 0.14 * k : 0;
        if (P.mover) P.mover.y(x, lift, z, time * 0.5 + swing, rr * 0.68, rr * 0.68, rr * 0.68);
        if (emit) {
          const a = Math.random() * TAU;
          const d = (0.25 + Math.random() * 0.55) * rr;
          r.emit(x + Math.cos(a) * d, 0.18, z + Math.sin(a) * d, 0, 1.1 + k * 1.8, 0, 0.42, 0.15, look.alt, {
            spark: true,
            drag: 1.4,
          });
        }
        break;
      }
      case "icespike":
      case "sunspike": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.38 + k * 0.9 + hit);
        let h = 0.2;
        if (warn) h = 0.2 + 0.55 * k * k;
        else if (s.fire < 0.07) h = 0.2 + 2.1 * (s.fire / 0.07);
        else if (s.fire < 0.35) h = 2.3 - 0.4 * ((s.fire - 0.07) / 0.28);
        else if (s.fire < 0.5) h = 1.9 * (1 - (s.fire - 0.35) / 0.15);
        else if (s.fire < 1.3) h = 0.2 * easeOut((s.fire - 0.5) / 0.8);
        if (!s.shat && s.fire > 0.35 && s.fire < 0.6) {
          s.shat = true;
          r.debrisBurst(x, z, 0.8, 8, look.dust, 0.14, 6);
          r.burst(x, z, 0.8, 10, 6, WHITE, 0.5, 0.2, { spark: true, drag: 3 });
        }
        if (h > 0.01) P.mover.y(x, 0, z, time * 0.2, rr * 0.9, h, rr * 0.9);
        if (emit)
          r.emit(
            x + (Math.random() - 0.5) * rr * 1.6,
            0.1,
            z + (Math.random() - 0.5) * rr * 1.6,
            0,
            0.5,
            0,
            0.8,
            0.14,
            WHITE,
            { spark: true, drag: 0 },
          );
        break;
      }
      case "geyser":
      case "pyro": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.58 + Math.sin(time * 4 + trap.id) * 0.15 + k * 0.6 + hit);
        const dome = warn
          ? (0.15 + 0.85 * k) * (1 + Math.sin(time * 20) * 0.08 * k)
          : s.fire > 0.5
            ? easeOut(clamp((s.fire - 0.5) / 0.8, 0, 1)) * 0.15
            : 0;
        if (dome > 0.01) P.mover.y(x, 0, z, 0, rr * 0.55 * dome + rr * 0.1, dome * 1.1, rr * 0.55 * dome + rr * 0.1);
        if (s.fire < 0.55) {
          const f = s.fire / 0.55;
          const h = 6 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1)), 0.7);
          r.columns.colC(r.columns.y(x, 0, z, 0, rr * 0.4, h, rr * 0.4), look.main, 0.95 * (1 - f * 0.5));
        }
        if (Math.random() < dt * (1.6 + k * 24) * quality) {
          const a = Math.random() * TAU;
          r.emit(
            x + Math.cos(a) * rr * 0.3,
            0.25,
            z + Math.sin(a) * rr * 0.3,
            0,
            1.2 + k * 2.5,
            0,
            0.6,
            0.2 + k * 0.1,
            Math.random() < 0.5 ? look.main : look.alt,
            {
              drag: 1,
              grow: 0.6,
            },
          );
        }
        break;
      }
      default: {
        P.glow.colC(
          P.glow.y(x, 0, z, time * (0.5 + k * 3), rr, 1, rr),
          WHITE,
          0.5 + Math.sin(time * 3) * 0.1 + k * 0.9 + hit * 1.4,
        );
        let h = 0.55 + Math.sin(time * 2 + trap.id) * 0.1,
          sc = 1;
        if (warn) {
          h += k * 0.8;
          sc = 1 + k * 0.5;
        } else if (s.fire < 0.5) {
          h = 0.4;
          sc = s.fire < 0.08 ? 1.8 : 0.3;
        }
        P.mover.y(x, h, z, time * (1.2 + k * 8), rr * 0.7 * sc, rr * 0.7 * sc, rr * 0.7 * sc);
        if (s.fire < 0.45) {
          const f = s.fire / 0.45;
          r.columns.colC(
            r.columns.y(x, 0, z, 0, rr * 0.3 * (1 - f * 0.4), 5.5 * (1 - f), rr * 0.3 * (1 - f * 0.4)),
            look.main,
            1 - f * 0.4,
          );
        }
        if (warn && Math.random() < dt * 30 * k * quality) {
          const a = Math.random() * TAU;
          const d = rr * (0.8 + Math.random() * 0.25);
          const life = 0.45;
          r.emit(
            x + Math.cos(a) * d,
            0.2 + Math.random() * 0.5,
            z + Math.sin(a) * d,
            (-Math.cos(a) * d) / life,
            0,
            (-Math.sin(a) * d) / life,
            life,
            0.2,
            Math.random() < 0.3 ? look.alt : look.main,
            { drag: 0 },
          );
        }
      }
    }
    if (warn) this.warnRing(x, z, rr, k);
  }
  beam(trap, s, look, dt, quality, world) {
    const r = this.r;
    const time = r.time;
    const x = trap.x,
      z = trap.y;
    const P = this.get(trap.skin, MAX.beam);
    let a1 = null,
      a2 = null,
      bt = 0;
    for (const beam of world.beams) {
      if (beam.skin !== trap.skin || beam.x !== trap.x || beam.y !== trap.y) continue;
      if (a1 === null) {
        a1 = beam.a;
        bt = beam.live ? 1 + beam.t : clamp(beam.t / beam.warn, 0, 1);
      } else a2 = beam.a;
    }
    const target = a1 === null ? trap.a : a1;
    s.yaw += angleDiff(s.yaw, target) * (a1 === null ? Math.min(1, dt * 4) : 1);
    const charge = a1 !== null && bt < 1 ? bt : 0;
    const live = bt >= 1 ? 1 : 0;
    const hover =
      trap.skin === "magma"
        ? 0.56
        : trap.skin === "acid"
          ? 0.78
          : trap.skin === "iceShot"
            ? 1.08 + Math.sin(time * 2.2 + trap.id) * 0.06
            : trap.skin === "sun"
              ? 1.12
              : trap.skin === "rift"
                ? 1.32 + Math.sin(time * 2.4 + trap.id) * 0.1
                : 1.15;
    P.body.y(x, 0, z, 0, 1.35, 1.35, 1.35);
    P.glow.colC(
      P.glow.y(x, 0, z, 0, 1.35, 1.35, 1.35),
      WHITE,
      0.45 + charge * 0.8 + live * 1.1 + Math.sin(time * 4 + trap.id) * 0.1,
    );
    const heads = a2 === null ? 1 : 2;
    for (let i = 0; i < heads; i++) {
      const yaw = i ? a2 : s.yaw;
      const recoil = live ? 0.025 : 0;
      P.mover.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35);
      P.moverGlow.colC(
        P.moverGlow.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35),
        WHITE,
        0.6 + charge * 0.9 + live * 1.2 + Math.sin(time * 9) * 0.08,
      );
    }
    const cy = Math.cos(s.yaw),
      sy = Math.sin(s.yaw);
    if (charge > 0) {
      const tx = x + cy * 1.15,
        tz = z + sy * 1.15;
      if (Math.random() < dt * (14 + charge * 36) * quality) {
        const ang = Math.random() * TAU,
          d = 0.8,
          life = 0.3;
        r.emit(
          tx + Math.cos(ang) * d,
          hover + Math.sin(ang) * d * 0.6,
          tz + Math.sin(ang * 1.7) * d * 0.4,
          (-Math.cos(ang) * d) / life,
          (-Math.sin(ang) * d * 0.6) / life,
          0,
          life,
          0.14,
          look.main,
          { drag: 0, spark: true },
        );
      }
      r.sprites.colC(r.sprites.bb(tx, hover, tz, 0.5 + charge * 1.3, r.B), look.main, 0.4 + charge * 0.5);
    }
    if (live) {
      r.sprites.colC(r.sprites.bb(x + cy * 1.2, hover, z + sy * 1.2, 1.6, r.B), look.main, 0.42);
    }
  }
  drawBeam(beam, ex, ez, len, time, dt) {
    const r = this.r;
    const look = LOOK[beam.skin === "fireBellows" ? "magma" : beam.skin];
    if (!beam.live || !look) return false;
    const ca = Math.cos(beam.a),
      sa = Math.sin(beam.a);
    const b = r.beams;
    const sheen = 0.95 + Math.sin(time * 5) * 0.04;
    if (beam.skin === "fireBellows" || beam.skin === "magma") {
      r.weaponView.flameBeam(beam, len);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 0.08, beam.w * 0.9, 0.03), look.main, 0.24);
      if (Math.random() < dt * 14) {
        const d = Math.random() * len;
        r.emit(beam.x + ca * d, 0.8, beam.y + sa * d, ca, 1.5, sa, 0.4, 0.14, look.main, { drag: 2, grav: -1 });
      }
    } else if (beam.skin === "rift") {
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 8; i++) {
        const along = (len * i) / 8;
        const off = Math.sin(time * 9 + i * 1.3) * beam.w * 0.45 * (i < 8 ? 1 : 0);
        const qx = beam.x + ca * along - sa * off;
        const qz = beam.y + sa * along + ca * off;
        b.colC(b.seg(px, pz, qx, qz, 1, beam.w * 0.92 * sheen, beam.w * 0.56), look.main, 0.64);
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.26, beam.w * 0.26), WHITE, 0.82);
    } else if (beam.skin === "iceShot") {
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * (0.9 + sheen * 0.06), beam.w * 0.6), look.main, 0.56);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.38, beam.w * 0.32), look.alt, 0.66);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.16, beam.w * 0.16), WHITE, 0.82);
      const n = Math.max(4, Math.round(len / 1.4));
      const reach = Math.max(0.22, beam.w * 0.75);
      const thin = Math.max(0.05, beam.w * 0.09);
      for (let i = 1; i < n; i++) {
        const along = (len * (i + 0.3 * Math.sin(i * 2.7 + time * 0.6))) / n;
        for (const side of BEAM_SIDES) {
          const out = side * (beam.w * 0.45);
          const tip = side * (beam.w * 0.45 + reach * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.9 + side))));
          const back = -reach * 0.55;
          b.colC(
            b.seg(
              beam.x + ca * along - sa * out,
              beam.y + sa * along + ca * out,
              beam.x + ca * (along + back) - sa * tip,
              beam.y + sa * (along + back) + ca * tip,
              1,
              thin,
              thin * 0.5,
            ),
            look.main,
            0.68,
          );
        }
      }
    } else if (beam.skin === "acid") {
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 6; i++) {
        const along = (len * i) / 6;
        const qx = beam.x + ca * along;
        const qz = beam.y + sa * along;
        const swell = 0.8 + 0.3 * Math.sin(time * 14 - i * 1.6);
        b.colC(b.seg(px, pz, qx, qz, 1, beam.w * swell * sheen, beam.w * 0.54), look.main, 0.64);
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.28, beam.w * 0.28), look.alt, 0.8);
    } else if (beam.skin === "sun") {
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 7; i++) {
        const along = (len * i) / 7;
        const off = Math.sin(time * 5 + i * 1.1) * beam.w * 0.3 * (i < 7 ? 1 : 0);
        const qx = beam.x + ca * along - sa * off;
        const qz = beam.y + sa * along + ca * off;
        b.colC(
          b.seg(px, pz, qx, qz, 1, beam.w * (1.14 + 0.12 * Math.sin(time * 8 - i)) * sheen, beam.w * 0.58),
          look.main,
          0.64,
        );
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.32, beam.w * 0.32), look.alt, 0.72);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.14, beam.w * 0.14), WHITE, 0.82);
    } else {
      // Warm golden-amber lighthouse lantern ribbon
      b.colC(b.seg(beam.x, beam.y, ex, ez, 0.85, beam.w * 0.96 * sheen, beam.w * 0.44), look.main, 0.58);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 0.88, beam.w * 0.4, beam.w * 0.26), look.alt, 0.72);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 0.9, beam.w * 0.15, beam.w * 0.15), WHITE, 0.82);
      if (Math.random() < dt * 16) {
        const d = Math.random() * len;
        r.emit(beam.x + ca * d, 0.75, beam.y + sa * d, 0, 1.3, 0, 0.45, 0.15, look.alt, { spark: true, drag: 1.5 });
      }
    }
    r.sprites.colC(r.sprites.bb(ex, 1, ez, 1.05, r.B), look.main, 0.36);
    if (Math.random() < dt * 28) {
      r.emit(
        ex,
        0.8,
        ez,
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 3,
        (Math.random() - 0.5) * 6,
        0.35,
        0.2,
        look.alt,
        { spark: true, drag: 2, grav: 8 },
      );
    }
    return true;
  }
  mine(trap, s, look, dt, quality) {
    if (trap.st === "gone") return;
    const r = this.r;
    const time = r.time;
    const x = s.x,
      z = s.z;
    const P = this.get(trap.skin, MAX.mine);
    const fuse = trap.st === "fuse";
    const armed = trap.st === "armed";
    const rise = trap.st === "unarmed" ? easeOut(clamp(s.pop / 0.6, 0, 1)) : 1;
    const fuseDur = trap.skin === "riftmine" ? 0.56 : 0.45;
    const k = fuse ? clamp(trap.t / fuseDur, 0, 1) : 0;
    const y0 = -0.4 * (1 - rise);
    const sc = (0.7 + 0.3 * rise) * 1.28;
    const flicker = 0.88 + Math.sin(time * 13 + trap.id * 2.1) * 0.12;
    let col = ARMING,
      lum = 0.22 + clamp(trap.t / 1.5, 0, 1) * 0.35;
    if (armed) {
      col = look.wick || look.main;
      lum = 0.72 * flicker;
    } else if (fuse) {
      col = WARN;
      lum = 0.95 + k * 0.45;
    }
    let breathe = 1;
    if (trap.skin === "spore") breathe = (armed ? 1 + Math.sin(time * 5) * 0.06 : 1) * (fuse ? 1 + k * 0.55 : 1);
    else if (fuse) breathe = 1 + k * 0.18;
    P.body.y(x, y0, z, trap.id, sc * breathe, sc * breathe, sc * breathe);
    tint.copy(col).multiplyScalar(lum);
    const gy = trap.skin === "riftmine" ? y0 + Math.sin(time * 2.4 + trap.id) * 0.08 : y0;
    P.glow.colC(
      P.glow.y(
        x,
        gy,
        z,
        trap.skin === "riftmine" ? time * (fuse ? 6 : 1.4) : trap.id,
        sc * breathe,
        sc * breathe,
        sc * breathe,
      ),
      tint,
      1,
    );
    if (P.mover) P.mover.y(x, gy, z, time * (fuse ? 6 : 1.4), sc, sc, sc);
    if (armed || fuse) {
      r.sprites.colC(r.sprites.bb(x, 0.42, z, 1.15 + (fuse ? k * 0.65 : 0), r.B), col, fuse ? 0.25 + k * 0.2 : 0.14);
      if (armed) r.ringPool.colC(r.ringPool.y(x, 0.04, z, 0, 1.5), TRIGGER, 0.55);
    }
    if (fuse) {
      this.warnRing(x, z, trap.r, k);
      if (trap.skin === "riftmine" && Math.random() < dt * 28 * quality) {
        const a = Math.random() * TAU,
          d = trap.r * 1.15;
        r.emit(
          x + Math.cos(a) * d,
          0.35,
          z + Math.sin(a) * d,
          -Math.cos(a) * d * 2.6,
          0.2,
          -Math.sin(a) * d * 2.6,
          0.36,
          0.18,
          look.main,
          {
            spark: true,
            drag: 0,
          },
        );
      }
    }
    if (!fuse && !armed && Math.random() < dt * 2 * quality)
      r.emit(x, 0.3, z, 0, 0.6, 0, 0.5, 0.1, ARMING, { spark: true, drag: 1 });
  }
  event(ev, world, shakeK) {
    const r = this.r;
    const look = LOOK[ev.skin];
    if (!look) return;
    if (ev.k === "trapArm") {
      r.ring(ev.x, ev.y, 0.2, 1.1, look.wick || look.main, 0.3);
      r.burst(ev.x, ev.y, 0.3, 4, 3, look.wick || look.main, 0.3, 0.2, { spark: true });
      return;
    }
    const s = this.st.get(ev.id);
    const x = ev.x,
      z = ev.y,
      rad = ev.r;
    if (s) {
      s.fire = 0;
      s.shat = false;
    }
    if (ev.shot) {
      r.ring(x, z, 0.28, rad, WHITE, 0.33);
      r.burst(x, z, 0.38, 16, rad * 2, look.alt, 0.5, 0.2, { spark: true, drag: 3 });
      r.debrisBurst(x, z, 0.3, 6, look.dust, 0.11, 5);
      r.addShake(0.11 * shakeK);
      return;
    }
    switch (ev.skin) {
      case "plate":
        // Double-peal golden brass carillon resonance wave
        r.ring(x, z, rad * 0.18, rad * 1.2, look.main, 0.42);
        r.ring(x, z, rad * 0.08, rad * 0.85, look.alt, 0.28);
        r.burst(x, z, 0.28, 12, Math.min(6.5, rad * 2.2), look.alt, 0.52, 0.18, { spark: true, drag: 2.5, up: 2.2 });
        r.debrisBurst(x, z, 0.2, 5, look.dust, 0.1, 4);
        r.flash(x, z, rad * 1.5, 1.0, look.main, 5);
        r.addShake(0.14 * shakeK);
        break;
      case "icespike":
      case "sunspike":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.4);
        r.burst(x, z, 0.3, 14, rad * 3, WHITE, 0.5, 0.2, { spark: true, drag: 3 });
        r.burst(x, z, 0.3, 8, rad * 2, look.main, 0.6, 0.3, { drag: 3, up: 4 });
        r.debrisBurst(x, z, 0.4, 10, ev.skin === "sunspike" ? look.dust : hex(0xbfe6f7), 0.14, 7);
        r.flash(x, z, rad * 1.8, 1.1, look.main, 5);
        r.addShake(0.2 * shakeK);
        break;
      case "geyser":
      case "pyro":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.4);
        r.burst(x, z, 0.3, 24, 6, look.main, 0.8, 0.3, { drag: 1, up: 7, grav: 10 });
        r.burst(x, z, 0.3, 10, 4, look.alt, 0.9, 0.2, { drag: 1, up: 9, grav: 12, spark: true });
        r.debrisBurst(x, z, 0.3, 4, hex(ev.skin === "pyro" ? 0x3a2418 : 0x33401f), 0.14, 4);
        r.flash(x, z, rad * 1.6, 1, look.main, 5);
        r.addShake(0.2 * shakeK);
        break;
      case "riftburst":
        r.ring(x, z, rad * 1.3, rad * 0.1, look.alt, 0.25);
        r.ring(x, z, rad * 0.2, rad * 1.2, look.main, 0.45);
        r.burst(x, z, 0.4, 20, rad * 4, look.main, 0.6, 0.3, { drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 4, look.alt, 0.5, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 6, hex(0x1a1230), 0.14, 5);
        r.flash(x, z, rad * 2, 1.4, look.main, 4);
        r.addShake(0.28 * shakeK);
        break;
      case "embermine":
      case "glassmine":
      case "mine":
        r.ring(x, z, rad * 0.3, rad * 1.1, look.main, 0.4);
        r.ring(x, z, rad * 0.1, rad * 0.7, WHITE, 0.2);
        r.burst(x, z, 0.4, 24, rad * 3, look.main, 0.55, 0.45);
        r.burst(x, z, 0.4, 14, 10, look.alt, 0.4, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 8, ev.skin === "mine" ? hex(0x4a566e) : look.dust, 0.15, 7);
        r.flash(x, z, rad * 2.2, 1.6, look.main, 4);
        r.addScorch(x, z, rad * 0.55);
        r.addShake(0.32 * shakeK);
        break;
      case "frost":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.45);
        r.burst(x, z, 0.4, 16, rad * 3.5, WHITE, 0.6, 0.2, { spark: true, drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 3, look.main, 0.6, 0.35, { drag: 3 });
        r.debrisBurst(x, z, 0.4, 12, hex(0xbfe6f7), 0.14, 8);
        r.flash(x, z, rad * 2, 1.2, look.main, 4);
        r.addShake(0.25 * shakeK);
        break;
      case "spore":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.45);
        r.burst(x, z, 0.4, 22, rad * 2.2, look.main, 1.1, 0.5, { drag: 2, grow: 1.2 });
        r.burst(x, z, 0.4, 14, rad * 2.5, look.alt, 0.9, 0.18, { spark: true, drag: 1.5, up: 2 });
        r.debrisBurst(x, z, 0.3, 4, hex(0x245a44), 0.14, 5);
        r.flash(x, z, rad * 1.8, 1.1, look.main, 4);
        r.addShake(0.2 * shakeK);
        break;
      default:
        r.ring(x, z, rad * 1.3, rad * 0.1, look.alt, 0.25);
        r.ring(x, z, rad * 0.2, rad * 1.2, look.main, 0.45);
        r.burst(x, z, 0.4, 22, rad * 3.5, look.main, 0.6, 0.3, { drag: 3 });
        r.burst(x, z, 0.4, 10, rad * 3.5, look.alt, 0.5, 0.2, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.3, 6, hex(0x1a1230), 0.14, 6);
        r.flash(x, z, rad * 2.2, 1.5, look.main, 4);
        r.addShake(0.3 * shakeK);
    }
  }
}
