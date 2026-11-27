// Stylized biome environmental hazards (Courtyard charged inlays, Caldera magma fumaroles, Shelf ice sheets,
// Moss Bog bio-acid pools, Core portals, Sun Dunes swirling dust devils) on custom WebGL2 engine.

import { Color } from "../engine/math.js";
import {
  cylinder,
  ringBlade,
  icosahedron,
  octahedron,
  torus,
  dustRibbon,
  meshPart,
  mergeGeometries,
} from "../engine/geometry.js";
import { Material } from "../engine/scene.js";
import { worldMaterial, emissiveMaterial } from "./materials.js";
import { clamp, TAU, makeRng } from "../core/util.js";
import { FINISH } from "./palette.js";

const WHITE = new Color(0xffffff);
const SAND = new Color(0xbfa48b);
const SAND_DEEP = new Color(0x816a67);
const PYRO = new Color(0xff9a38);
const PYRO_HOT = new Color(0xffe9b0);
const ASH_PUFF = new Color(0x4e463e);
const ASH_HOT = new Color(0x746254);
const AMBER = new Color(FINISH.brass);
const HEAT = new Color(FINISH.vermilion);
const ICE_SHARD = new Color(0xe4f8ff);
const ACID = new Color(0x58f09c);
const ACID_LITE = new Color(0xc8ffe0);
const COAT = new Color(0x52ecff);
const PORTAL_A = new Color(FINISH.lavender);
const PORTAL_B = new Color(FINISH.jade);

const tube = () => cylinder(0.62, 1, 1, 20, true).translate(0, 0.5, 0);
const fac = (color, r, p) => meshPart(octahedron(r), color, p);
const inscribed = (color, r, w, y, segs = 24) => meshPart(torus(r, w, 5, segs), color, { y, rx: Math.PI / 2 });
const baseDisk = (color, r, h, y, segs = 12) => meshPart(cylinder(r * 0.91, r, h, segs), color, { y });

const MODELS = {
  // Caldera: chunky dark volcanic basalt crater rim with organically varied boulders & ember crevices
  nozzle: () => ({
    body: [
      inscribed(0x28191a, 0.93, 0.12, 0.06, 16),
      ...Array.from({ length: 11 }, (_, i) => {
        const jitter = Math.sin(i * 2.39996);
        const a = (i * TAU) / 11 + jitter * 0.16;
        const rad = 0.91 + Math.cos(i * 3.1) * 0.07;
        const sz = 0.85 + Math.abs(jitter) * 0.55;
        return meshPart(icosahedron(0.18, 0), i % 3 === 0 ? 0x4b2a24 : i % 3 === 1 ? 0x321e1f : 0x261718, {
          x: Math.cos(a) * rad,
          z: Math.sin(a) * rad,
          y: 0.06 + (i % 3) * 0.025,
          ry: -a + jitter * 0.5,
          rx: jitter * 0.18,
          sx: 0.82 + (i % 2) * 0.28,
          sy: 0.48 + (i % 3) * 0.16,
          sz: 1.05 * sz,
        });
      }),
    ],
    glow: [inscribed(0xff7e30, 0.84, 0.028, 0.082, 18)],
  }),
  dome: () => ({
    glow: [
      meshPart(icosahedron(0.91, 1), 0xff6e3a, { y: 0.26, sy: 0.36 }),
      meshPart(icosahedron(0.62, 1), 0xffcf88, { y: 0.44, sy: 0.58 }),
    ],
  }),
  // Courtyard: octagonal stone bell-shrine basin with mossy corners & gilded rim
  collar: () => ({
    body: [
      baseDisk(0x28363e, 1.02, 0.11, 0.055, 8),
      baseDisk(0x18232b, 0.84, 0.06, 0.11, 8),
      inscribed(0xcfa056, 0.9, 0.036, 0.13, 16),
      ...Array.from({ length: 4 }, (_, i) => {
        const a = (i * TAU) / 4 + Math.PI / 4;
        return meshPart(icosahedron(0.16, 0), i % 2 ? 0x3b5848 : 0x344a56, {
          x: Math.cos(a) * 0.94,
          z: Math.sin(a) * 0.94,
          y: 0.11,
          ry: -a,
          sx: 1.1,
          sy: 0.56,
          sz: 1.1,
        });
      }),
    ],
    glow: [inscribed(0xe8b862, 0.76, 0.032, 0.115, 16)],
  }),
  // Courtyard: suspended bronze temple bell & pagoda crown that lifts and swings to toll
  cover: () => ({
    body: [
      meshPart(cylinder(0.18, 0.44, 0.48, 10), 0xcf9446, { y: 0.34 }),
      inscribed(0xe8be6e, 0.43, 0.036, 0.13, 14),
      inscribed(0x8e5c26, 0.28, 0.028, 0.42, 12),
      meshPart(cylinder(0.05, 0.24, 0.14, 8), 0x2c4652, { y: 0.64 }),
      meshPart(icosahedron(0.1, 0), 0xf0c874, { y: 0.74 }),
      meshPart(icosahedron(0.11, 0), 0x7c4c1c, { y: 0.12 }),
    ],
    glow: [inscribed(0xffd67c, 0.44, 0.022, 0.14, 16), fac(0xfff0c4, 0.1, { y: 0.78, sy: 1.15 })],
  }),
  // Courtyard: miniature arched brass lantern-pillars standing at the 4 corners of the shrine basin
  inlayProng: () => ({
    body: [
      meshPart(cylinder(0.06, 0.09, 0.52, 6), 0x344c58, { y: 0.26 }),
      meshPart(cylinder(0.03, 0.18, 0.12, 6), 0x263c48, { y: 0.68 }),
      inscribed(0xd49e52, 0.14, 0.02, 0.53, 10),
    ],
    glow: [meshPart(cylinder(0.09, 0.09, 0.16, 6), 0xffcf74, { y: 0.56 })],
  }),
  // Shelf: beveled glacier crystals & slate-ice rim stones
  shard: () => ({
    body: [
      meshPart(icosahedron(0.68, 0), 0x8cc8e8, { y: 0.4, sy: 0.62, sz: 0.68, rz: -0.14 }),
      fac(0x3a7cac, 0.62, { x: 0.2, y: 0.34, sy: 0.48, sx: 0.5, ry: 0.34 }),
    ],
  }),
  // Flats: warm terracotta-ochre swirling sand ribbons
  funnel: () => ({
    body: [meshPart(dustRibbon(0.16), 0x736560), meshPart(dustRibbon(Math.PI * 0.85), 0xa7998b)],
    glow: [meshPart(dustRibbon(Math.PI * 1.46), 0xc0b0a5)],
  }),
  // Marsh: organic clustered mossy bog-stones & floating lily-pad tufts with tiny lotus buds
  bank: () => ({
    body: [
      ...Array.from({ length: 11 }, (_, i) => {
        const jitter = Math.sin(i * 2.13);
        const a = (i * TAU) / 11 + jitter * 0.2;
        const r = 0.96 + Math.cos(i * 2.7) * 0.08;
        const size = 0.14 + (i % 3) * 0.04;
        return meshPart(icosahedron(size, 0), i % 3 === 0 ? 0x264c38 : i % 3 === 1 ? 0x326246 : 0x1e3c2e, {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: 0.045 + (i % 2) * 0.02,
          ry: -a + jitter * 0.6,
          sx: 0.9 + (i % 3) * 0.22,
          sy: 0.38 + (i % 2) * 0.14,
          sz: 1.05 + Math.abs(jitter) * 0.45,
        });
      }),
      ...Array.from({ length: 4 }, (_, i) => {
        const a = (i * TAU) / 4 + 0.42 + (i % 2) * 0.24;
        const px = Math.cos(a) * (0.82 + (i % 2) * 0.07);
        const pz = Math.sin(a) * (0.82 + (i % 2) * 0.07);
        const padR = 0.2 + (i % 2) * 0.05;
        return [
          baseDisk(i % 2 ? 0x3b8654 : 0x2f7448, padR, 0.032, 0.044, 7).translate(px, 0, pz),
          ...(i % 2 === 0
            ? [meshPart(octahedron(0.065), 0xf4a8bc, { x: px + 0.03, y: 0.085, z: pz - 0.02, sy: 0.85 })]
            : []),
        ];
      }).flat(),
    ],
  }),
  bubble: () => ({ glow: [meshPart(icosahedron(1, 0), 0xffffff, { sy: 0.84 })] }),
  // Core: carved midnight-obsidian floating rune stones
  stone: () => ({
    body: [baseDisk(0x281e4a, 0.16, 0.24, -0.06, 5), fac(0x5a428e, 0.19, { y: 0.06, sy: 1.6 })],
    glow: [fac(0xffffff, 0.08, { y: 0.16, z: 0.11, sz: 0.3, sy: 1.45 })],
  }),
};

function shardsOf(rr, seed) {
  const rng = makeRng(Math.floor(seed * 1e9));
  const count = Math.max(5, Math.round(rr * 1.8));
  const start = rng.range(0, TAU);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * TAU + rng.range(-0.22, 0.22);
    const d = rr * rng.range(0.86, 0.99);
    const w = rng.range(0.12, 0.22);
    out.push({
      dx: Math.cos(a) * d,
      dz: Math.sin(a) * d,
      a,
      w,
      h: rng.range(0.15, 0.4) * (i % 4 === 0 ? 1.5 : 1),
      lean: rng.range(0.15, 0.5),
      tone: [1, 0.88, 0.78][i % 3],
    });
  }
  return out;
}

const seedOf = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const MAX = { surf: 24, part: 24, prong: 120, bubble: 64, stone: 64 };

export class HazardView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
  }
  get(name, max = MAX.part) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name]();
    const mk = (parts, glow) => {
      const translucent = name === "funnel" || name === "bubble";
      const mat = glow
        ? emissiveMaterial({
            vertexColors: true,
            emissiveIntensity: name === "funnel" ? 0.72 : 1.16,
            transparent: translucent,
            depthWrite: !translucent,
            opacity: name === "funnel" ? 0.22 : 1,
            doubleSide: name === "funnel",
          })
        : worldMaterial({
            color: 0xffffff,
            vertexColors: true,
            surface: name === "funnel" ? "dust" : name === "shard" ? "ice" : "stone",
            transparent: name === "funnel",
            opacity: name === "funnel" ? 0.52 : 1,
            depthWrite: name !== "funnel",
            doubleSide: name === "funnel",
          });
      const pool = new this.Pool(mergeGeometries(parts.flat()), mat, max);
      pool.mesh.renderOrder = glow ? 3 : 1;
      this.add(pool);
      return pool;
    };
    set = this.pl[name] = { body: m.body ? mk(m.body, false) : null, glow: m.glow ? mk(m.glow, true) : null };
    return set;
  }
  surf(kind, max = MAX.surf) {
    let pool = this.pl["s:" + kind];
    if (pool) return pool;
    const fire = kind === "pyro";
    const mat = new Material({
      shader: `hazard_${kind}`,
      transparent: true,
      additive: fire,
      depthWrite: false,
      doubleSide: fire,
      fog: !fire,
    });
    pool = this.pl["s:" + kind] = new this.Pool(fire ? tube() : ringBlade(1, 36), mat, max);
    pool.mesh.renderOrder = fire ? 4 : 1;
    this.add(pool);
    return pool;
  }
  add(pool) {
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
  }
  put(pool, x, y, z, rot, radius, level, seed, flag = 0, height = 1) {
    const idx = pool.y(x, y, z, rot, radius, height, radius);
    if (idx >= 0) pool.col(idx, level, seed, flag);
    return idx;
  }
  update(dt, world) {
    const r = this.r;
    const arena = world.arena;
    const quality = Math.min(1, r.maxParticles / 1400);
    if (arena.vents.length) {
      if (arena.biome.id === "lanternYard") this.chargedInlays(dt, world, quality);
      else this.vents(dt, world, quality);
    }
    if (arena.ice.length) this.ice(dt, world, quality);
    if (arena.acid.length) this.acid(dt, world, quality);
    if (arena.portals.length) this.portals(dt, world, quality);
    if (arena.devils?.length) this.devils(dt, world, quality);
  }
  devils(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    const funnel = this.get("funnel");
    const dust = this.surf("dust", 24);
    for (const devil of world.arena.devils) {
      const calm = devil.calmT > 0 ? Math.max(0.2, 1 - Math.min(1, devil.calmT * 0.5) * 0.8) : 1;
      const x = devil.x,
        z = devil.y,
        rr = devil.r * calm,
        seed = devil.ph;
      funnel.body.y(x, 0, z, time * (3.4 + devil.spd), rr, calm, rr);
      funnel.glow.colC(funnel.glow.y(x, 0.4 * calm, z, -time * 2.2, rr * 0.62, calm, rr * 0.62), WHITE, 0.5 * calm);
      this.put(dust, x, 0.045, z, time * 1.3 + seed, rr, 0.9 * calm, seed);
      if (Math.random() < dt * 24 * quality * calm) {
        r.emit(
          x + (Math.random() - 0.5) * rr * 1.7,
          0.1 + Math.random() * 1.5,
          z + (Math.random() - 0.5) * rr * 1.7,
          (Math.random() - 0.5) * 2.4,
          1.6 + Math.random() * 2.6,
          (Math.random() - 0.5) * 2.4,
          0.8,
          0.25,
          Math.random() < 0.5 ? SAND : SAND_DEEP,
          { drag: 1.4, grow: 0.8 },
        );
      }
    }
  }
  ventState(world, vent) {
    const state = world.state === "fight" ? world.arena.ventState(vent, world.waveT) : "idle";
    const cycle = (world.waveT + vent.phase) % vent.period;
    const out = this._ventState || (this._ventState = { state: "idle", k: 0 });
    out.state = state;
    out.k = state === "warn" ? clamp((cycle - (vent.period - 2.7)) / 1.2, 0, 1) : 0;
    return out;
  }
  ring(x, z, radius, col, alpha) {
    const idx = this.r.ringPool.y(x, 0.08, z, 0, radius);
    this.r.ringPool.colC(idx, col, alpha);
  }
  vents(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    const crater = this.get("nozzle");
    const lava = this.surf("molten");
    const fire = this.surf("pyro", 32);
    for (const vent of world.arena.vents) {
      const vs = this.ventState(world, vent);
      const state = vs.state,
        k = vs.k;
      const x = vent.x,
        z = vent.y,
        rr = vent.r;
      const seed = seedOf(x, z);
      const rot = seed * TAU;
      const erupt = state === "erupt";
      const heat = erupt ? 1.45 : 0.3 + 0.08 * Math.sin(time * 1.3 + seed * 9) + k * 0.95;
      crater.body.y(x, 0, z, rot, rr, 1, rr);
      crater.glow.colC(crater.glow.y(x, 0, z, rot, rr, 1, rr), WHITE, 0.22 + heat * 0.48);
      this.put(lava, x, 0.045, z, rot, rr, heat, seed);
      if (state === "warn") {
        const dome = this.get("dome");
        const s = rr * (0.08 + 0.12 * k);
        dome.glow.colC(dome.glow.y(x, 0.03, z, 0, s, 0.08 + 0.14 * k, s), WHITE, 0.65 + 0.45 * k);
        this.ring(x, z, rr, PYRO, 0.4 + k * 0.6);
        if (Math.random() < dt * (4 + 18 * k) * quality) {
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.15,
            z + (Math.random() - 0.5) * rr,
            0,
            1.5 + k * 2.5,
            0,
            0.45,
            0.22,
            Math.random() < 0.5 ? ASH_PUFF : ASH_HOT,
            {
              drag: 1,
              grav: 3,
            },
          );
        }
      } else if (erupt) {
        const lick = 1 + Math.sin(time * 17 + seed * 7) * 0.06;
        this.put(fire, x, 0.02, z, time * 0.8, rr * 0.82, 0.6, seed, 0, 3.5 * lick);
        this.put(fire, x, 0.02, z, -time * 1.1, rr * 0.45, 0.68, seed, 0, 4.4 / lick);
        r.sprites.colC(r.sprites.bb(x, 0.6, z, rr * 2.6, r.B), PYRO, 0.35);
        this.ring(x, z, rr, PYRO_HOT, 0.65);
        if (Math.random() < dt * 40 * quality) {
          r.emit(
            x + (Math.random() - 0.5) * rr * 1.2,
            0.4,
            z + (Math.random() - 0.5) * rr * 1.2,
            (Math.random() - 0.5) * 3,
            5 + Math.random() * 5,
            (Math.random() - 0.5) * 3,
            0.7,
            0.35,
            Math.random() < 0.4 ? PYRO_HOT : PYRO,
            { drag: 1.2, grav: 7, grow: 0.5 },
          );
        }
      } else if (Math.random() < dt * 1.2 * rr * quality) {
        r.emit(x + (Math.random() - 0.5) * rr, 0.1, z + (Math.random() - 0.5) * rr, 0, 0.8, 0, 0.6, 0.16, ASH_PUFF, {
          drag: 1,
        });
      }
    }
  }
  chargedInlays(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    const collar = this.get("collar");
    const cover = this.get("cover");
    const pillar = this.get("inlayProng", MAX.prong);
    for (const vent of world.arena.vents) {
      const vs = this.ventState(world, vent);
      const bossCharge = world.state === "fight" && vent.bossTollT > 0;
      const state = bossCharge ? "warn" : vs.state,
        k = bossCharge ? clamp((1.15 - vent.bossTollT) / 0.95, 0, 1) : vs.k;
      const { x, y: z, r: radius } = vent;
      const rot = seedOf(x, z) * TAU;
      const sc = Math.min(radius * 0.96, 1.05);
      const friendly = !bossCharge && (vent.rungT || 0) > 0;
      const live = state === "erupt" && !friendly;
      const warn = state === "warn" && !friendly;
      const charge = live ? 1 : warn ? k : friendly ? Math.min(1, vent.rungT / 0.7) : 0;
      const lift = 0.08 + charge * 0.34;
      const sway = friendly
        ? Math.sin(time * 22 + rot) * 0.44 * Math.min(1, vent.rungT)
        : live
          ? Math.sin(time * 18 + rot) * 0.38
          : warn
            ? Math.sin(time * (8 + k * 10) + rot) * (0.1 + 0.24 * k)
            : Math.sin(time * 1.6 + rot) * 0.04;
      const glowCol = friendly ? PORTAL_B : live ? HEAT : AMBER;

      // Octagonal shrine basin
      collar.body.y(x, 0, z, rot, sc, 1, sc);
      collar.glow.colC(collar.glow.y(x, 0, z, rot, sc, 1, sc), glowCol, 0.12 + charge * 0.78);
      // Swinging suspended bronze temple bell
      cover.body.yr(x, lift, z, rot, sc, sc, sc, sway, 0);
      cover.glow.colC(cover.glow.yr(x, lift, z, rot, sc, sc, sc, sway, 0), glowCol, 0.19 + charge * 0.81);
      // 4 permanent corner brass lantern-pillars around the shrine rim
      const postDist = sc * 0.88;
      for (let i = 0; i < 4; i++) {
        const angle = rot + (TAU * i) / 4;
        const px = x + Math.cos(angle) * postDist;
        const pz = z + Math.sin(angle) * postDist;
        const pScale = 0.85 + charge * 0.16;
        const idx = pillar.body.yr(px, 0.02, pz, angle, pScale, pScale, pScale, 0, 0);
        pillar.body.col(idx, 1, 1, 1);
        pillar.glow.colC(
          pillar.glow.yr(px, 0.02, pz, angle, pScale, pScale, pScale, 0, 0),
          glowCol,
          0.18 + charge * 0.82,
        );
      }

      if (friendly) {
        const ripple = 1 - clamp(vent.rungT / 1.4, 0, 1);
        this.ring(x, z, radius * (0.45 + ripple * 0.85), PORTAL_B, (1 - ripple * 0.75) * 0.9);
        this.ring(x, z, radius * 1.18, AMBER, (1 - ripple) * 0.55);
        r.discs.colC(r.discs.y(x, 0.055, z, rot, radius * 1.05), PORTAL_B, (1 - ripple) * 0.24);
      } else if (warn) {
        this.ring(x, z, radius, AMBER, 0.52 + k * 0.44);
        // Inward-contracting brass chime ring showing exact toll timing (shoot to ring early!)
        this.ring(x, z, radius * Math.max(0.24, 1 - k * 0.74), PYRO_HOT, 0.4 + k * 0.45);
        r.discs.colC(r.discs.y(x, 0.055, z, rot, radius * 0.95), AMBER, 0.09 + k * 0.14);
      } else if (live) {
        const lanternGun = (time * 2.2 + seedOf(x, z)) % 1;
        this.ring(x, z, radius, HEAT, 0.92);
        this.ring(x, z, radius * (0.28 + lanternGun * 0.74), AMBER, (1 - lanternGun) * 0.85);
        r.discs.colC(r.discs.y(x, 0.055, z, rot, radius * 0.96), HEAT, 0.28);
      }

      if ((live || friendly) && Math.random() < dt * 14 * quality) {
        const a = TAU * Math.random();
        const spd = 1.6 + Math.random() * 1.2;
        r.emit(
          x + Math.cos(a) * radius * 0.52,
          0.45,
          z + Math.sin(a) * radius * 0.52,
          Math.cos(a) * spd,
          2.0,
          Math.sin(a) * spd,
          0.52,
          0.14,
          friendly ? PORTAL_B : AMBER,
          {
            spark: true,
            drag: 2.1,
            grav: 2.6,
          },
        );
      }
    }
  }
  ice(dt, world, quality) {
    const r = this.r;
    const sheet = this.surf("ice");
    const shard = this.get("shard", 160).body;
    if (this.iceOf !== world.arena) {
      this.iceOf = world.arena;
      this.shards = new WeakMap();
    }
    for (const patch of world.arena.ice) {
      const x = patch.x,
        z = patch.y,
        rr = patch.r;
      const seed = seedOf(x, z);
      this.put(sheet, x, 0.03, z, seed * TAU, rr * 1.1, 1, seed);
      let list = this.shards.get(patch);
      if (!list) this.shards.set(patch, (list = shardsOf(rr, seed)));
      for (const s of list) {
        shard.colC(shard.yr(x + s.dx, -0.02, z + s.dz, s.a, s.w, s.h, s.w, -s.lean, 0), ICE_SHARD, s.tone * 0.8);
      }
      if (Math.random() < dt * 2 * rr * quality) {
        const a = Math.random() * TAU;
        const d = Math.random() * rr;
        r.emit(x + Math.cos(a) * d, 0.08, z + Math.sin(a) * d, 0, 0.3, 0, 0.5, 0.16, WHITE, { spark: true, drag: 0 });
      }
    }
  }
  acid(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    const pool = this.surf("acid");
    const bubbles = this.get("bubble", MAX.bubble).glow;
    let bank = null;
    for (const puddle of world.arena.acid) {
      const x = puddle.x,
        z = puddle.y;
      const fade = puddle.life != null ? Math.min(1, puddle.life / 1.2) : 1;
      const rr = puddle.r * (0.75 + 0.25 * fade);
      const seed = seedOf(x, z);
      const rot = seed * TAU;
      const coat = !!puddle.mine;
      const permanent = puddle.life == null && !coat;
      this.put(pool, x, 0.035, z, rot, rr * (permanent ? 1.18 : 1), fade, seed, coat ? 1 : 0);
      if (permanent) {
        bank = bank || this.get("bank");
        bank.body.y(x, 0, z, rot, rr, 1, rr);
      }
      const col = coat ? COAT : ACID_LITE;
      if (!permanent)
        r.ringPool.colC(r.ringPool.y(x, 0.045, z, 0, rr), coat ? COAT : ACID, (coat ? 0.35 : 0.16) * fade);
      for (let i = 0; i < 3; i++) {
        const f = (time * (0.45 + 0.1 * i) + seed * 5 + i / 3) % 1;
        const a = seed * 40 + i * 2.4 + Math.floor(time * (0.45 + 0.1 * i) + seed * 5 + i / 3) * 1.7;
        const d = rr * (0.2 + 0.5 * ((i * 0.37 + seed) % 1));
        const s = (0.04 + 0.07 * f) * fade;
        bubbles.colC(
          bubbles.y(x + Math.cos(a) * d, 0.04 + f * 0.12, z + Math.sin(a) * d, 0, s, s * 0.8, s),
          col,
          0.25 + 0.28 * f,
        );
        if (f > 0.97 && Math.random() < dt * 30 * quality) {
          r.emit(x + Math.cos(a) * d, 0.12, z + Math.sin(a) * d, 0, 0.9, 0, 0.35, 0.12, col, { drag: 1 });
        }
      }
    }
  }
  portals(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    const swirl = this.surf("portal");
    const stone = this.get("stone", MAX.stone);
    for (const portal of world.arena.portals) {
      for (let blue = 0; blue < 2; blue++) {
        const px = blue ? portal.bx : portal.ax;
        const pz = blue ? portal.by : portal.ay;
        const color = blue ? PORTAL_B : PORTAL_A;
        const seed = seedOf(px, pz);
        this.put(swirl, px, 0.05, pz, 0, 1.08, 1, seed, blue);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + time * (blue ? -0.35 : 0.35) + seed * TAU;
          const sx = px + Math.cos(a) * 1.45;
          const sz = pz + Math.sin(a) * 1.45;
          const sy = 0.55 + Math.sin(time * 1.6 + i * 1.9 + seed * 9) * 0.12;
          stone.body.y(sx, sy, sz, a + Math.PI / 2, 1);
          stone.glow.colC(stone.glow.y(sx, sy, sz, a + Math.PI / 2, 1), color, 0.78 + 0.3 * Math.sin(time * 3 + i));
        }
        if (Math.random() < dt * 14 * quality) {
          const angle = Math.random() * TAU;
          r.emit(
            px + Math.cos(angle),
            0.2,
            pz + Math.sin(angle),
            -Math.cos(angle) * 1.6,
            0.8,
            -Math.sin(angle) * 1.6,
            0.5,
            0.22,
            color,
            {
              drag: 0,
            },
          );
        }
      }
      if (world.event === "starPaths" && world.state === "fight") {
        // Empowering harmonic leyline connecting the portal pair
        const lanternGun = 0.75 + 0.25 * Math.sin(time * 5.2);
        r.beams.colC(
          r.beams.seg(portal.ax, portal.ay, portal.bx, portal.by, 0.14, 0.42, 0.04),
          PORTAL_A,
          0.26 * lanternGun,
        );
        r.beams.colC(
          r.beams.seg(portal.ax, portal.ay, portal.bx, portal.by, 0.18, 0.14, 0.04),
          PORTAL_B,
          0.56 * lanternGun,
        );
        r.beams.colC(
          r.beams.seg(portal.ax, portal.ay, portal.bx, portal.by, 0.22, 0.045, 0.03),
          WHITE,
          0.7 * lanternGun,
        );
        if (Math.random() < dt * 12 * quality) {
          const f = Math.random();
          r.emit(
            portal.ax + (portal.bx - portal.ax) * f,
            0.22,
            portal.ay + (portal.by - portal.ay) * f,
            0,
            1.1,
            0,
            0.48,
            0.16,
            f < 0.5 ? PORTAL_A : PORTAL_B,
            { spark: true, drag: 1.5 },
          );
        }
      }
    }
    for (const portal of world.arena.portals) {
      const next = portal.next;
      if (!next) continue;
      const k = clamp((portal.moveIn || 0) / 1.6, 0, 1);
      const blink = 0.5 + (Math.floor(time * 10) % 2) * 0.35;
      for (let blue = 0; blue < 2; blue++) {
        const x = blue ? next.bx : next.ax;
        const y = blue ? next.by : next.ay;
        const ox = blue ? portal.bx : portal.ax;
        const oy = blue ? portal.by : portal.ay;
        const col = blue ? PORTAL_B : PORTAL_A;
        r.ringPool.colC(r.ringPool.y(x, 0.06, y, time * 3, 1.05 + k * 1.3), col, blink);
        r.ringPool.colC(r.ringPool.y(x, 0.05, y, -time * 2, 0.6), col, 0.55);
        r.discs.colC(r.discs.y(x, 0.03, y, 0, 1.05), col, 0.14 + (1 - k) * 0.22);
        r.beams.colC(r.beams.seg(ox, oy, x, y, 0.08, 0.05, 0.05), col, 0.22 + (1 - k) * 0.22);
      }
    }
  }
}
