// High-contrast enemy/boss danger telegraphs, persistent battle floor marks, spikes, pillars and enemy projectiles.

import { Color } from "../engine/math.js";
import { cylinder, disc, octahedron, torus, meshPart, mergeGeometries } from "../engine/geometry.js";
import { Material } from "../engine/scene.js";
import { worldMaterial, emissiveMaterial } from "./materials.js";
import { attackSurface, BOSS_EFFECTS, ENEMY_EFFECTS } from "../data/combat-effects.js";
import { clamp, TAU } from "../core/util.js";
import { FINISH } from "./palette.js";

const WHITE = new Color(0xffffff);
const LAVA = new Color(0xff6a1f);
const LAVA_HOT = new Color(0xffd67a);
const ICE = new Color(0xbff0ff);
const ACID = new Color(0x46f0ac);
const ACID_LITE = new Color(0xc4ffe0);
const RIFT = new Color(0xb672ff);
const RIFT_PINK = new Color(0xf092cc);
const FIRE = new Color(0xff8a2a);
const FIRE_HOT = new Color(0xffda7a);
const SMOKE = new Color(0x4a4440);
const ARC = new Color(FINISH.brass);
const FROST_SHOT = new Color(0x28a4f0);
const RIFT_RIM_SHOT = new Color(FINISH.lavender);

const SHOT = {
  orb: new Color(0xff4284),
  bolt: new Color(0xff845c),
  fast: new Color(0xff3030),
  turret: new Color(0xff3c5e),
  drone: new Color(0xff529c),
  weaver: new Color(0xd654ff),
  carrier: new Color(0xff5c6e),
  ...Object.fromEntries(Object.values(BOSS_EFFECTS).map((effect) => [effect.projectile, new Color(effect.color)])),
};

const DUST = {
  city: new Color(0x6a7686),
  shelf: new Color(0x9ec8e2),
  marsh: new Color(0x2f4238),
  core: new Color(0x64429e),
  caldera: new Color(0x7c6a5c),
  flats: new Color(0xb69464),
};

const Z = { crack: 0, lavaCrack: 1, molten: 2, frost: 3, acid: 4, rift: 5, target: 6, burn: 7, glass: 8 };
const M = { burn: 0, crack: 1, molten: 2, frost: 3, slime: 4, rift: 5 };
const MARK_LIFE = [7, 6, 8, 5, 6, 5];

function lookOf(kind, src, biome, chill) {
  return Z[attackSurface(kind, src, biome, chill)];
}

const fac = (c, r, p) => meshPart(octahedron(r), c, p);
const ringM = (c, r, w, p, n = 16) => meshPart(torus(r, w, 5, n), c, p);
const ringT = (r, y) => ringM(0xffffff, r, 0.022, { y, rx: Math.PI / 2 });
const BASALT = 0x3b2c32;
const PORCELAIN = 0xd6bfa0;
const COPPER = 0xc97652;

const MODELS = {
  mine: () => ({
    body: [
      meshPart(cylinder(0.25, 0.36, 0.09, 6), BASALT, { y: 0.052 }),
      fac(COPPER, 0.29, { y: 0.125, sy: 0.53 }),
      ringM(PORCELAIN, 0.24, 0.026, { y: 0.147, rx: Math.PI / 2 }),
    ],
    glow: [fac(0xffffff, 0.09, { y: 0.28, sy: 0.65 }), ringT(0.224, 0.148)],
  }),
  charge: () => ({
    body: [
      fac(COPPER, 0.29, { y: 0.12, sx: 1.38, sy: 0.53, sz: 0.82 }),
      ringM(PORCELAIN, 0.17, 0.037, { y: 0.16, rx: Math.PI / 2 }),
      ...[-1, 1].map((z) => fac(BASALT, 0.14, { z: z * 0.17, y: 0.083, sx: 1.24, sy: 0.57 })),
    ],
    glow: [fac(0xffffff, 0.07, { y: 0.305, sy: 0.7 })],
  }),
  shell: () => ({
    body: [
      fac(PORCELAIN, 0.27, { x: 0.087, sx: 1.7, sy: 0.61, sz: 0.61 }),
      fac(COPPER, 0.22, { x: -0.16, sx: 0.93, sy: 0.39, sz: 0.96 }),
      ringM(BASALT, 0.12, 0.028, { x: -0.06, ry: Math.PI / 2 }),
    ],
    glow: [ringM(0xffffff, 0.135, 0.022, { x: 0.09, ry: Math.PI / 2 })],
  }),
  spike: () => ({
    body: [
      fac(0x4692c8, 0.7, { y: 0.51, sx: 0.8, sy: 0.74, sz: 0.66, rz: -0.3 }),
      fac(0x255a88, 0.6, { x: 0.22, y: 0.33, sy: 0.52, sx: 0.63, rz: 0.34 }),
    ],
  }),
  crystal: () => ({
    body: [
      fac(0x2268a4, 1, { sx: 1.65, sy: 0.6, sz: 0.73, rx: 0.36 }),
      fac(0x164470, 0.65, { x: -0.66, z: 0.14, sx: 1.07, sy: 0.56, sz: 0.73, ry: 0.26 }),
    ],
    glow: [fac(0xffffff, 0.63, { x: 0.61, y: 0.07, sx: 1.5, sy: 0.31, sz: 0.46 })],
  }),
  cinder: () => ({
    body: [
      fac(BASALT, 1, { sx: 1.42, sy: 0.76, sz: 0.86, rz: 0.27 }),
      fac(COPPER, 0.78, { x: 0.2, sx: 1.36, sy: 0.95, sz: 0.94 }),
    ],
    glow: [
      ringM(0xffffff, 0.56, 0.06, { x: 0.49, ry: Math.PI / 2 }, 12),
      fac(0xffffff, 0.56, { x: 0.93, sy: 0.42, sz: 0.58 }),
    ],
  }),
  glasshot: () => ({
    body: [
      fac(0x9a4c1c, 1, { sx: 2.1, sy: 0.39, sz: 0.54, rx: 0.42 }),
      fac(0x208e84, 0.54, { x: -0.64, z: 0.31, sx: 1.52, sy: 0.22, ry: -0.27 }),
    ],
    glow: [fac(0xffffff, 0.75, { x: 0.9, sx: 1.56, sy: 0.16, sz: 0.19 })],
  }),
  weavershot: () => ({
    glow: [
      ringM(0xffffff, 0.55, 0.06, { ry: Math.PI / 2, rx: 0.5 }, 10),
      fac(0xffffff, 0.4, { x: 0.33, sx: 1.2, sy: 0.55 }),
    ],
  }),
  pod: () => ({
    body: [
      fac(0x689e86, 1, { sx: 1.16, sy: 0.72, sz: 0.73 }),
      ...[-1, 1].map((s) =>
        fac(PORCELAIN, 0.62, { x: -0.49, z: s * 0.62, sx: 1.28, sy: 0.35, sz: 0.59, ry: s * 0.31 }),
      ),
    ],
    glow: [fac(0xffffff, 0.36, { x: 0.84, sx: 1.48, sy: 0.48 })],
  }),
  dart: () => ({
    glow: [
      fac(0xffffff, 0.86, { sx: 1.28, sy: 0.36, sz: 0.41 }),
      fac(0xffffff, 0.49, { x: -0.4, sx: 1.25, sy: 0.17, sz: 0.98 }),
    ],
  }),
  seal: () => ({
    body: [ringM(COPPER, 0.88, 0.14, { rx: Math.PI / 2 }, 12), fac(BASALT, 0.64, { sy: 0.38 })],
    glow: [ringM(0xffffff, 0.68, 0.08, { rx: Math.PI / 2 }, 12), fac(0xffffff, 0.35, { sy: 0.62 })],
  }),
  spore: () => ({
    body: [fac(0x4c8a66, 0.95, { sy: 0.76 }), fac(0x88c882, 0.62, { y: 0.25, sy: 0.55 })],
    glow: [fac(0xffffff, 0.46, { y: 0.18 })],
  }),
  ringshot: () => ({
    glow: [ringM(0xffffff, 0.82, 0.11, { rx: Math.PI / 2 }, 14), fac(0xffffff, 0.38, {})],
  }),
};

const MAX = { zone: 48, mark: 64, part: 140 };

export class AttackView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.marks = [];
    this.spikes = [];
    this.pillars = [];
    this.seeds = new WeakMap();
    this.lastBiome = null;
  }
  get(name, max = MAX.part) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name]();
    const mk = (parts, glow) => {
      const mat = glow
        ? emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.18 })
        : worldMaterial({
            color: 0xffffff,
            vertexColors: true,
            surface: name === "crystal" || name === "spike" ? "ice" : name === "glasshot" ? "crystal" : "armor",
          });
      const pool = new this.Pool(mergeGeometries(parts.flat()), mat, max);
      pool.mesh.renderOrder = glow ? 3 : 2;
      this.r.scene.add(pool.mesh);
      this.list.push(pool);
      return pool;
    };
    set = this.pl[name] = {
      body: m.body ? mk(m.body, false) : null,
      glow: m.glow ? mk(m.glow, true) : null,
    };
    return set;
  }
  zones() {
    if (!this.zonePool) {
      this.zoneMat = new Material({
        shader: "zoneTelegraph",
        transparent: true,
        depthWrite: false,
        doubleSide: true,
        fog: false,
        uniforms: { uWarn: { value: new Color(FINISH.vermilion) } },
      });
      this.zonePool = new this.Pool(disc(1, 36), this.zoneMat, MAX.zone);
      this.zonePool.mesh.renderOrder = 2;
      this.r.scene.add(this.zonePool.mesh);
      this.list.push(this.zonePool);
    }
    return this.zonePool;
  }
  markPool() {
    if (!this._markPool) {
      this.markMat = new Material({
        shader: "floorMark",
        transparent: true,
        depthWrite: false,
        doubleSide: false,
        fog: true,
      });
      this._markPool = new this.Pool(disc(1, 24), this.markMat, MAX.mark);
      this._markPool.mesh.renderOrder = 0;
      this.r.scene.add(this._markPool.mesh);
      this.list.push(this._markPool);
    }
    return this._markPool;
  }
  mark(x, z, radius, look = M.burn) {
    if (this.marks.length >= MAX.mark - 4) this.marks.shift();
    const life = MARK_LIFE[look] || 6;
    this.marks.push({ x, z, r: radius, look, life, max: life, a: Math.random() * TAU, seed: Math.random() });
  }
  biomeId() {
    return (this.r.biome && this.r.biome.id) || "city";
  }
  update(dt, world) {
    const r = this.r;
    const biome = this.biomeId();
    if (biome !== this.lastBiome) {
      this.lastBiome = biome;
      this.marks.length = 0;
      this.spikes.length = 0;
      this.pillars.length = 0;
    }
    this.quality = Math.min(1, r.maxParticles / 1400);
    this.drawMarks(dt);
    this.drawZones(dt, world);
    this.drawSpikes(dt);
    this.drawPillars(dt);
  }
  drawMarks(dt) {
    if (!this.marks.length) return;
    const pool = this.markPool();
    let keep = 0;
    for (const mk of this.marks) {
      mk.life -= dt;
      if (mk.life <= 0) continue;
      this.marks[keep++] = mk;
      const idx = pool.y(mk.x, 0.018 + (keep % 4) * 0.001, mk.z, mk.a, mk.r);
      if (idx >= 0) pool.col(idx, mk.life / mk.max, mk.seed, mk.look / 8);
    }
    this.marks.length = keep;
  }
  drawZones(dt, world) {
    const r = this.r;
    const time = r.time;
    const warn = r.warnColor;
    const biome = world.arena ? world.arena.biome.id : this.biomeId();
    if (!world.hazards.length) return;
    const pool = this.zones();
    this.zoneMat.uniforms.uWarn.value.copy(warn);
    for (const hazard of world.hazards) {
      if (hazard.done) continue;
      const k = clamp(hazard.t / hazard.delay, 0, 1);
      const x = hazard.x,
        z = hazard.y,
        rr = hazard.r;
      const look = lookOf(hazard.kind, hazard.src, biome, hazard.chill);
      let seed = this.seeds.get(hazard);
      if (seed == null) this.seeds.set(hazard, (seed = Math.random()));
      r.shadows.y(x, 0.03, z, 0, rr * 2.4);
      const idx = pool.y(x, 0.045, z, 0, rr);
      if (idx >= 0) pool.col(idx, k, seed, look / 8);
      this.zoneDetail(hazard, look, k, seed, dt, time, biome);
    }
  }
  zoneDetail(hazard, look, k, seed, dt, time, biome) {
    const r = this.r;
    const x = hazard.x,
      z = hazard.y,
      rr = hazard.r;
    const q = this.quality;
    const chance = (rate) => Math.random() < dt * rate * q;

    if (hazard.kind === "mine" || hazard.kind === "sapper") {
      const P = this.get(hazard.kind === "mine" ? "mine" : "charge");
      const pop = clamp(hazard.t / 0.12, 0, 1);
      const s = 0.4 + 0.6 * pop + (k > 0.85 ? Math.sin(time * 60) * 0.04 : 0);
      const yaw = seed * TAU;
      P.body.y(x, 0, z, yaw, s);
      const led = P.glow.y(x, 0, z, yaw, s);
      P.glow.colC(led, r.warnColor, Math.sin(time * (8 + 50 * k * k)) > 0 ? 1.5 : 0.3);
    }
    if (hazard.sx != null) {
      const hx = hazard.sx + (x - hazard.sx) * k;
      const hz = hazard.sy + (z - hazard.sy) * k;
      const hy = 0.8 + Math.sin(Math.PI * k) * 7;
      const dist = Math.hypot(x - hazard.sx, z - hazard.sy) || 1;
      const pitch = Math.atan2(7 * Math.PI * Math.cos(Math.PI * k), dist);
      const yaw = Math.atan2(z - hazard.sy, x - hazard.sx);
      r.shadows.y(hx, 0.025, hz, 0, 0.9 * (0.4 + 0.6 * k));
      if (hazard.src === "tyrant") {
        const P = this.get("cinder");
        const size = 0.36;
        P.body.col(P.body.yr(hx, hy, hz, yaw, size, size, size, pitch, time * 4), 1, 1, 1);
        P.glow.colC(P.glow.yr(hx, hy, hz, yaw, size, size, size, pitch, time * 4), FIRE_HOT, 1.35);
        if (chance(10)) r.emit(hx, hy, hz, 0, 0.3, 0, 0.4, 0.11, FIRE_HOT, { grav: 3, spark: true });
      } else {
        const P = this.get("shell");
        const cold = hazard.chill;
        P.body.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8);
        P.glow.colC(P.glow.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8), cold ? ICE : FIRE, cold ? 1.45 : 1.1);
        if (Math.random() < 0.5)
          r.emit(hx, hy, hz, 0, cold ? -0.2 : 0.3, 0, 0.45, cold ? 0.3 : 0.4, cold ? ICE : SMOKE, {
            drag: 1,
            grow: 1.4,
          });
      }
    }
    if (hazard.kind === "shorted") {
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + seed * TAU;
        const dx = Math.cos(a) * rr,
          dz = Math.sin(a) * rr;
        r.beams.colC(
          r.beams.seg(
            x + dx * 0.18,
            z + dz * 0.18,
            x + dx * (0.42 + k * 0.36),
            z + dz * (0.42 + k * 0.36),
            0.09,
            0.055,
            0.028,
          ),
          ARC,
          0.5 + k * 0.5,
        );
      }
    }
    switch (look) {
      case Z.glass: {
        const P = this.get("glasshot");
        for (let i = 0; i < 6; i++) {
          const a = seed * TAU + (i * TAU) / 6;
          const d = rr * (0.28 + 0.07 * (i % 3));
          const s = (0.08 + k * 0.14) * rr;
          P.body.col(
            P.body.yr(x + Math.cos(a) * d, 0.03 + k * 0.12, z + Math.sin(a) * d, a, s, s, s, 0.55 + k * 0.45, 0),
            1,
            1,
            1,
          );
        }
        if (chance(10 * k)) r.emit(x, 0.12, z, 0, 0.5, 0, 0.35, 0.09, SHOT.glass, { spark: true, drag: 2 });
        break;
      }
      case Z.lavaCrack:
      case Z.molten:
        if (chance(6 + 30 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.1,
            z + (Math.random() - 0.5) * rr,
            0,
            1 + 2.5 * k,
            0,
            0.6,
            0.16,
            Math.random() < 0.5 ? LAVA : FIRE_HOT,
            { drag: 1, spark: true },
          );
        break;
      case Z.crack:
        if (k > 0.5 && chance(20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * k;
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.8, 0, 0.5, 0.25, DUST[biome] || DUST.city, {
            drag: 2,
            grow: 1,
          });
        }
        break;
      case Z.frost:
        if (chance(12 + 20 * k)) {
          const a = Math.random() * TAU,
            d = rr * (1 - k * Math.random());
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.4, 0, 0.7, 0.14, WHITE, { spark: true, drag: 0 });
        }
        break;
      case Z.acid:
        if (chance(8 + 20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * (0.2 + 0.8 * k);
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 1 + k, 0, 0.5, 0.16, ACID_LITE, { drag: 2 });
        }
        break;
      case Z.rift:
        if (chance(18 * k + 4)) {
          const a = Math.random() * TAU,
            d = rr * (0.8 + Math.random() * 0.3),
            life = 0.5;
          r.emit(
            x + Math.cos(a) * d,
            0.2 + Math.random() * 0.6,
            z + Math.sin(a) * d,
            (-Math.cos(a) * d) / life,
            0,
            (-Math.sin(a) * d) / life,
            life,
            0.18,
            Math.random() < 0.3 ? RIFT_PINK : RIFT,
            { drag: 0 },
          );
        }
        break;
      case Z.burn:
        if (chance(8 + 14 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.15,
            z + (Math.random() - 0.5) * rr,
            0,
            1.4,
            0,
            0.45,
            0.25,
            Math.random() < 0.5 ? FIRE : FIRE_HOT,
            { drag: 1, grow: 0.6 },
          );
        break;
    }
  }
  spikeBurst(x, z, radius) {
    const n = Math.round(clamp(radius * 4, 6, 18));
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4;
      const d = radius * (i % 3 === 0 ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35);
      list.push({
        dx: Math.cos(a) * d,
        dz: Math.sin(a) * d,
        a,
        h: (0.8 + Math.random() * 0.9) * Math.min(1.6, 0.55 + radius * 0.3),
        w: 0.12 + Math.random() * 0.1,
        lean: 0.15 + Math.random() * 0.35,
        delay: Math.random() * 0.06,
      });
    }
    if (this.spikes.length > 12) this.spikes.shift();
    this.spikes.push({ x, z, t: 0, list, shat: false });
  }
  drawSpikes(dt) {
    if (!this.spikes.length) return;
    const P = this.get("spike");
    let keep = 0;
    for (const burst of this.spikes) {
      burst.t += dt;
      if (burst.t > 1.1) continue;
      this.spikes[keep++] = burst;
      if (!burst.shat && burst.t > 0.5) {
        burst.shat = true;
        this.r.debrisBurst(burst.x, burst.z, 0.6, 10, ICE, 0.12, 5);
        this.r.burst(burst.x, burst.z, 0.6, 12, 5, WHITE, 0.45, 0.18, { spark: true, drag: 3 });
      }
      for (const s of burst.list) {
        const t = burst.t - s.delay;
        if (t < 0) continue;
        let h = 0;
        if (t < 0.08) h = t / 0.08;
        else if (t < 0.5) h = 1 - 0.1 * ((t - 0.08) / 0.42);
        else h = Math.max(0, 0.9 * (1 - (t - 0.5) / 0.4));
        if (h <= 0.01) continue;
        P.body.yr(burst.x + s.dx, 0, burst.z + s.dz, s.a, s.w, s.h * h, s.w, -s.lean, 0);
      }
    }
    this.spikes.length = keep;
  }
  pillar(x, z, w, h, color, life) {
    if (this.pillars.length > 40) this.pillars.shift();
    this.pillars.push({ x, z, w, h, col: color, t: 0, life });
  }
  drawPillars(dt) {
    let keep = 0;
    const r = this.r;
    for (const p of this.pillars) {
      p.t += dt;
      if (p.t >= p.life) continue;
      this.pillars[keep++] = p;
      const f = p.t / p.life;
      const h = p.h * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.4 + 0.1)), 0.6);
      r.columns.colC(
        r.columns.y(p.x, 0, p.z, 0, p.w * (1 - f * 0.5), Math.max(0.05, h), p.w * (1 - f * 0.5)),
        p.col,
        1 - f,
      );
    }
    this.pillars.length = keep;
  }
  impact(ev, world, shakeK) {
    const r = this.r;
    const x = ev.x,
      z = ev.y,
      rr = ev.r;
    const biome = world?.arena ? world.arena.biome.id : this.biomeId();
    const dust = DUST[biome] || DUST.city;
    const kind = ev.kind;
    const look = kind === "bomber" ? Z.target : lookOf(kind, ev.src, biome, ev.chill);
    if (
      ![
        "stomp",
        "drill",
        "rain",
        "mortar",
        "frost",
        "glacier",
        "mine",
        "sapper",
        "fire",
        "volatile",
        "bomber",
        "shorted",
      ].includes(kind)
    ) {
      return false;
    }
    const shake = (amount) => r.addShake(amount * shakeK);
    if (kind === "shorted") {
      r.burst(x, z, 0.3, 22, 6, WHITE, 0.3, 0.26, { up: 6, spark: true, drag: 1 });
      r.burst(x, z, 0.3, 12, 3.5, ARC, 0.45, 0.3, { up: 3, spark: true });
      r.ring(x, z, rr * 0.3, rr * 1.3, ARC, 0.28);
      r.flash(x, z, rr * 1.15, 0.42, ARC, 7);
      this.mark(x, z, rr * 0.9, M.burn);
      shake(0.08);
      return true;
    }
    switch (look) {
      case Z.glass:
        r.burst(x, z, 0.2, Math.round(10 + rr * 4), 3 + rr, DUST.flats, 0.55, 0.2, { up: 2, drag: 3 });
        r.burst(x, z, 0.4, Math.round(9 + rr * 3), 4 + rr, SHOT.glass, 0.4, 0.12, { up: 4, grav: 8, spark: true });
        r.debrisBurst(x, z, 0.25, Math.round(5 + rr * 2), SHOT.glass, 0.1, 4 + rr);
        r.ring(x, z, 0.2, rr * 1.1, SHOT.glass, 0.3);
        r.flash(x, z, rr * 1.5, 0.75, SHOT.glass, 5);
        this.mark(x, z, rr * 0.9, M.crack);
        shake(0.18);
        break;
      case Z.crack:
      case Z.lavaCrack: {
        r.ring(x, z, rr * 0.3, rr * 1.1, WHITE, 0.3);
        r.ring(x, z, rr * 0.2, rr * 1.4, dust, 0.5, 0.1);
        const n = Math.round(clamp(rr * 7, 8, 28));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.random() * 0.3;
          const s = 3 + rr * 2.2;
          r.emit(
            x + Math.cos(a) * rr * 0.4,
            0.25,
            z + Math.sin(a) * rr * 0.4,
            Math.cos(a) * s,
            0.6,
            Math.sin(a) * s,
            0.6,
            0.45,
            dust,
            { drag: 3, grow: 1.6 },
          );
        }
        r.debrisBurst(x, z, 0.3, Math.round(clamp(rr * 3, 4, 14)), dust.clone().multiplyScalar(0.6), 0.16, 4 + rr);
        if (look === Z.lavaCrack) {
          r.burst(x, z, 0.3, Math.round(8 + rr * 4), 4 + rr, LAVA_HOT, 0.6, 0.2, {
            up: 6,
            grav: 9,
            spark: true,
            drag: 1,
          });
          r.flash(x, z, rr * 2, 1.15, LAVA, 4);
        } else r.flash(x, z, rr * 1.4, 0.65, r.warnColor, 6);
        this.mark(x, z, rr * 1.1, M.crack);
        shake(kind === "drill" ? 0.1 : 0.25);
        break;
      }
      case Z.molten:
        this.pillar(x, z, rr * 0.45, 2.5 + rr * 1.6, LAVA, 0.5);
        r.burst(x, z, 0.3, Math.round(10 + rr * 6), 3 + rr * 1.5, LAVA, 0.8, 0.45, { up: 7, grav: 9, drag: 1.5 });
        r.burst(x, z, 0.3, 8, 3, LAVA_HOT, 0.5, 0.3, { up: 9, spark: true });
        r.ring(x, z, rr * 0.3, rr * 1.2, LAVA, 0.35);
        r.flash(x, z, rr * 2.6, 1.25, LAVA, 3.5);
        this.mark(x, z, rr * 0.95, M.molten);
        shake(kind === "mortar" ? 0.2 : 0.12);
        break;
      case Z.frost:
        this.spikeBurst(x, z, rr);
        r.ring(x, z, rr * 0.3, rr * 1.15, ICE, 0.4);
        r.burst(x, z, 0.3, Math.round(10 + rr * 4), rr * 2, WHITE, 0.6, 0.22, { spark: true, up: 3 });
        r.flash(x, z, rr * 1.8, 0.9, ICE, 4);
        this.mark(x, z, rr * 1.05, M.frost);
        shake(0.1);
        break;
      case Z.acid:
        r.burst(x, z, 0.3, Math.round(14 + rr * 6), 2.5 + rr, ACID, 0.8, 0.35, { up: 6, grav: 12, drag: 1 });
        r.burst(x, z, 0.3, 8, 2, ACID_LITE, 0.5, 0.2, { up: 4, spark: true, grav: 8 });
        r.ring(x, z, rr * 0.3, rr * 1.15, ACID, 0.35);
        r.flash(x, z, rr * 1.8, 0.85, ACID, 4);
        this.mark(x, z, rr * 0.9, M.slime);
        shake(0.12);
        break;
      case Z.rift:
        this.pillar(x, z, rr * 0.22, 11, RIFT, 0.35);
        this.pillar(x, z, rr * 0.1, 12, WHITE, 0.2);
        r.burst(x, z, 0.4, Math.round(12 + rr * 5), 4 + rr * 2, RIFT, 0.5, 0.35, { spark: true });
        r.burst(x, z, 0.4, 6, 3, RIFT_PINK, 0.5, 0.3, { up: 5 });
        r.ring(x, z, rr * 0.2, rr * 1.2, RIFT, 0.35);
        r.flash(x, z, rr * 2.4, 1.35, RIFT, 3.5);
        this.mark(x, z, rr * 0.9, M.rift);
        shake(0.2);
        break;
      case Z.burn: {
        const vol = kind === "volatile";
        r.burst(x, z, 0.3, vol ? 22 : 8, vol ? rr * 3 : 2.5, vol ? FIRE : FIRE_HOT, 0.5, vol ? 0.5 : 0.35, {
          up: 3,
          grow: 0.8,
        });
        if (vol) {
          r.ring(x, z, rr * 0.3, rr * 1.1, FIRE, 0.3);
          r.burst(x, z, 0.4, 10, 7, WHITE, 0.3, 0.2, { spark: true, drag: 4 });
        }
        r.flash(x, z, rr * 1.8, vol ? 1.15 : 0.65, FIRE, 5);
        this.mark(x, z, rr * (vol ? 0.8 : 0.6), M.burn);
        shake(vol ? 0.12 : 0.04);
        break;
      }
      default:
        r.burst(x, z, 0.5, Math.round(8 + rr * 5), rr * 4, FIRE, 0.45, 0.5 + rr * 0.12);
        r.burst(x, z, 0.5, 8, rr * 5, FIRE_HOT, 0.3, 0.2, { spark: true, drag: 4 });
        r.emit(x, 0.6, z, 0, 0, 0, 0.15, rr * 2.2, FIRE_HOT, { drag: 0 });
        for (let i = 0; i < 4; i++) {
          r.smokeView.emit(
            x + (Math.random() - 0.5) * rr,
            0.6,
            z + (Math.random() - 0.5) * rr,
            rr * 0.6,
            0x4a4440,
            0.55,
          );
        }
        r.debrisBurst(x, z, 0.3, 5, dust.clone().multiplyScalar(0.5), 0.12, 5);
        r.ring(x, z, rr * 0.3, rr, FIRE, 0.3);
        r.flash(x, z, rr * 1.6, 1.15, FIRE, 4.5);
        this.mark(x, z, rr * 0.75, M.burn);
        shake(kind === "mortar" ? 0.25 : 0.1);
    }
    return true;
  }
  shots(world, dt = 1 / 60) {
    const r = this.r;
    const time = r.time;
    const basis = r.B;
    for (const shot of world.eb) {
      if (shot.life <= 0) continue;
      const launch = BOSS_EFFECTS[shot.src]?.height || ENEMY_EFFECTS[shot.src]?.height || 0.85;
      const h = 1.05 + (launch - 1.05) * Math.exp(-shot.age * 6);
      const kind = shot.kind;
      const color = shot.frost ? FROST_SHOT : SHOT[kind] || SHOT.orb;
      const angle = Math.atan2(shot.vy, shot.vx);
      const ca = Math.cos(angle),
        sa = Math.sin(angle);
      const chance = (rate) => Math.random() < dt * rate;
      r.shadows.y(shot.x, 0.035, shot.y, 0, Math.max(0.45, shot.r * 3.5));
      let halo = 2.8,
        light = 0.28;
      switch (kind) {
        case "bolt":
        case "fast":
        case "turret": {
          const heavy = kind === "turret";
          const len = shot.r * (kind === "fast" ? 6 : heavy ? 3.8 : 3);
          r.ebCore.col(r.ebCore.y(shot.x, h, shot.y, angle, len, shot.r * 0.52, shot.r * 0.52), 1, 0.86, 0.78);
          r.beams.colC(
            r.beams.seg(shot.x - ca * len, shot.y - sa * len, shot.x, shot.y, h, heavy ? 0.085 : 0.04, 0.045),
            color,
            0.78,
          );
          if (heavy && chance(7)) r.emit(shot.x, h, shot.y, 0, 0.3, 0, 0.16, 0.1, color, { spark: true, drag: 5 });
          break;
        }
        case "shard": {
          const P = this.get("crystal"),
            s = shot.r * 1.4,
            roll = time * 5 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), FROST_SHOT, 0.9);
          break;
        }
        case "weaver": {
          const P = this.get("weavershot"),
            s = shot.r * 1.3;
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, time * 8), color, 1.15);
          halo = 3;
          break;
        }
        case "drone": {
          const P = this.get("dart"),
            s = shot.r * 1.2;
          P.glow.colC(P.glow.y(shot.x, h, shot.y, angle, s, s, s), color, 0.9);
          break;
        }
        case "carrier": {
          const P = this.get("pod"),
            s = shot.r * 1.3;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, Math.sin(time * 5 + shot.x) * 0.2), 1, 1, 1);
          P.glow.colC(P.glow.y(shot.x, h, shot.y, angle, s), color, 1.05);
          if (chance(6))
            r.emit(shot.x - ca * 0.3, h - 0.08, shot.y - sa * 0.3, 0, -0.2, 0, 0.3, 0.12, color, { grav: 2 });
          break;
        }
        case "cinder": {
          const P = this.get("cinder"),
            s = shot.r * 1.4,
            roll = time * 3 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), FIRE_HOT, 1.35);
          if (chance(8))
            r.emit(shot.x - ca * 0.25, h - 0.04, shot.y - sa * 0.25, 0, 0.35, 0, 0.4, 0.09, FIRE_HOT, {
              grav: 3,
              spark: true,
            });
          break;
        }
        case "warden-seal": {
          const P = this.get("seal"),
            size = shot.r * 1.05,
            roll = time * 2.2;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, size, size, size, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, size, size, size, 0, roll), color, 0.95);
          r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * 2.2, basis), color, 0.28);
          continue;
        }
        case "spore": {
          const P = this.get("spore"),
            s = shot.r * 1.2,
            roll = time * 2 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), color, 0.9);
          if (chance(5)) r.emit(shot.x, h - 0.08, shot.y, 0, -0.3, 0, 0.45, 0.1, ACID_LITE, { grav: 3, drag: 1 });
          break;
        }
        case "riftorb": {
          const P = this.get("ringshot"),
            s = shot.r * 0.95;
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle + Math.PI / 2, s, s, s, 0, time * 7 + shot.x), color, 0.95);
          r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * 2.5, basis), RIFT_RIM_SHOT, 0.34);
          break;
        }
        case "glass": {
          const P = this.get("glasshot"),
            s = shot.r * 1.2,
            roll = Math.sin(time * 4 + shot.x) * 0.15;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), color, 1.15);
          if (chance(6))
            r.emit(shot.x - ca * 0.3, h, shot.y - sa * 0.3, 0, 0, 0, 0.18, 0.08, color, { spark: true, drag: 0 });
          halo = 3;
          light = 0.34;
          break;
        }
        default:
          r.ebCore.colC(r.ebCore.y(shot.x, h, shot.y, 0, shot.r * 0.82), color, 1.05);
      }
      if (shot.frost && kind !== "shard") {
        const P = this.get("crystal"),
          s = shot.r * 1.05;
        P.glow.col(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, time * 9), 0.78, 0.98, 1.15);
        if (chance(7)) r.emit(shot.x, h, shot.y, 0, -0.2, 0, 0.3, 0.1, ICE, { drag: 2 });
      }
      r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * halo, basis), color, light);
    }
  }
}

export { M as MARK_LOOK };
