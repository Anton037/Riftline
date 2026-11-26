// Boss-card active power views (Lantern Cage Pylons, Searing Collapse pools, Frost Splinters, Glass Lances, Brood Larvae).

import { cylinder, octahedron, sculptedCrystal, meshPart, mergeGeometries } from "../engine/geometry.js";
import { hexColor, worldMaterial, emissiveMaterial } from "./materials.js";
import { clamp, TAU } from "../core/util.js";
import { FINISH } from "./palette.js";
import { MARK_LOOK } from "./attacks-view.js";
import { LOCK_WARN, LOCK_TIME } from "../core/boss-cards.js";

const GOLD = hexColor(FINISH.brass);
const GOLD_WHITE = hexColor(FINISH.ivory);
const EMBER = hexColor(0xff8a2a);
const HOT = hexColor(0xffd27a);
const ICE = hexColor(0x9ae6ff);
const ICE_WHITE = hexColor(0xe8fbff);
const ACID = hexColor(FINISH.jade);
const ACID_PALE = hexColor(0xd9fff0);
const PYLONS = 6;

const fac = (color, r, p) => meshPart(octahedron(r), color, p);
const MODELS = {
  pylon: () => ({
    body: [
      meshPart(cylinder(0.18, 0.25, 0.12, 6), 0x26323c, { y: 0.06 }),
      fac(0xb08262, 0.5, { y: 0.54, sy: 1.02, sx: 0.36, sz: 0.36 }),
      fac(0xe2c798, 0.24, { y: 1.05, sy: 1.28, sx: 0.72, sz: 0.72 }),
    ],
    glow: [fac(0xffffff, 0.1, { y: 1.32, sy: 1.25 }), fac(0xffffff, 0.08, { y: 0.52, z: 0.14, sz: 0.5 })],
  }),
  larva: () => ({
    body: [fac(0x5da87a, 0.22, { x: 0.04, sx: 1.35, sy: 0.52 }), fac(0x98cc8e, 0.17, { x: -0.19, sy: 0.5 })],
    glow: [fac(0xffffff, 0.075, { x: 0.22, y: 0.06, sy: 0.72 }), fac(0xffffff, 0.06, { x: -0.23, y: 0.07 })],
    mover: [-1, 1].map((s) =>
      fac(0x98e0bc, 0.24, { x: -0.07, z: s * 0.22, y: 0.06, sx: 0.56, sy: 0.11, sz: 1.32, ry: s * 0.52 }),
    ),
  }),
  splinter: () => ({
    body: [
      fac(0x9ce2ff, 0.14, { sx: 2.8, sy: 0.4, sz: 0.58, rx: 0.22 }),
      fac(0xf2fbff, 0.11, { x: 0.08, sx: 2.15, sy: 0.32, sz: 0.28 }),
    ],
  }),
  starLance: () => ({
    body: [
      meshPart(sculptedCrystal(0.18, 0.76, 0.16, 17), 0xf2b966, { x: -0.35, rz: -Math.PI / 2 }),
      fac(0xffe6aa, 0.12, { x: 0.1, sx: 2.5, sy: 0.3, sz: 0.54 }),
    ],
  }),
};

export class BossCardView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
  }
  get(name, max) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name]();
    const surface =
      name === "larva" ? "organic" : name === "pylon" ? "metal" : name === "starLance" ? "crystal" : "ice";
    const emissive = name === "splinter" ? 0x264860 : name === "starLance" ? 0x483214 : 0;
    const mk = (parts, glow, lit) => {
      const pool = new this.Pool(
        mergeGeometries(parts.flat()),
        glow
          ? emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.16 })
          : worldMaterial({ surface, vertexColors: true, ...(lit ? { emissive, emissiveIntensity: 0.85 } : {}) }),
        max,
      );
      this.r.scene.add(pool.mesh);
      this.list.push(pool);
      pool.mesh.renderOrder = glow ? 3 : 1;
      return pool;
    };
    set = this.pl[name] = {
      body: mk(m.body, false, name === "splinter" || name === "starLance"),
      glow: m.glow ? mk(m.glow, true) : null,
      mover: m.mover ? mk(m.mover, false) : null,
    };
    for (const pool of [set.body, set.glow, set.mover]) if (pool) pool.begin();
    return set;
  }
  update(dt, world) {
    const r = this.r;
    const quality = Math.min(1, r.maxParticles / 1400);
    if (world.cages?.length) this.cages(dt, world, quality);
    if (world.burnPools?.length) this.burnPools(dt, world, quality);
    if (world.splinters?.length) this.splinters(world);
    if (world.lances?.length) this.lances(world);
    if (world.player.mossHelpers?.length) this.mossHelpers(dt, world, quality);
  }
  cages(dt, world, quality) {
    const r = this.r;
    const P = this.get("pylon", 6 * PYLONS);
    const pts = this._cagePts || (this._cagePts = []);
    for (const cage of world.cages) {
      const drop = clamp(cage.t / LOCK_WARN, 0, 1);
      const fall = 1 - drop * drop;
      const live = cage.t >= LOCK_WARN;
      const end = clamp((cage.t - LOCK_WARN - LOCK_TIME + 0.3) / 0.3, 0, 1);
      const spin = cage.id * 0.7;
      pts.length = 0;
      for (let i = 0; i < PYLONS; i++) {
        const a = spin + (i / PYLONS) * TAU;
        const x = cage.x + Math.cos(a) * cage.r;
        const z = cage.y + Math.sin(a) * cage.r;
        const y = fall * 5 - end * 1.2;
        pts.push(x, z);
        P.body.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        const g = P.glow.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        P.glow.colC(g, GOLD, live ? (1 - end) * 1.2 : 0.65 + drop);
        r.shadows.y(x, 0.02, z, 0, 0.5 + drop * 0.3);
      }
      if (!live) {
        r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.3 + drop * 0.4);
        continue;
      }
      const k = 1 - end;
      for (let i = 0; i < PYLONS; i++) {
        const j = (i + 1) % PYLONS;
        r.beams.colC(
          r.beams.seg(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], 1.2, 0.075, 0.055),
          GOLD_WHITE,
          1.15 * k,
        );
        r.beams.colC(
          r.beams.seg(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], 0.46, 0.065, 0.045),
          GOLD,
          0.95 * k,
        );
      }
      r.discs.colC(r.discs.y(cage.x, 0.04, cage.y, 0, cage.r), GOLD, 0.1 * k);
      r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.6 * k);
      for (const enemy of cage.held) {
        if (!enemy.dead && Math.random() < dt * 8 * quality) {
          r.emit(enemy.x, 0.7, enemy.y, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.3, 0.13, GOLD, {
            spark: true,
            drag: 3,
          });
        }
      }
    }
  }
  burnPools(dt, world, quality) {
    const r = this.r;
    const time = r.time;
    for (const pool of world.burnPools) {
      const fade = clamp(pool.life / 0.6, 0, 1);
      const rise = clamp((3 - pool.life) / 0.25, 0, 1);
      const rad = pool.r * (0.6 + 0.4 * rise);
      r.shadows.y(pool.x, 0.02, pool.y, 0, rad * 2.2);
      r.discs.colC(r.discs.y(pool.x, 0.035, pool.y, 0, rad), EMBER, (0.2 + Math.sin(time * 7 + pool.id) * 0.05) * fade);
      r.ringPool.colC(r.ringPool.y(pool.x, 0.045, pool.y, 0, rad), HOT, 0.38 * fade);
      if (Math.random() < dt * 40 * quality * fade) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * rad * 0.9;
        r.emit(
          pool.x + Math.cos(a) * d,
          0.1,
          pool.y + Math.sin(a) * d,
          (Math.random() - 0.5) * 0.4,
          1.4 + Math.random() * 1.2,
          (Math.random() - 0.5) * 0.4,
          0.45,
          0.26,
          Math.random() < 0.6 ? EMBER : HOT,
          { drag: 1.5, grow: 1, grav: -1 },
        );
      }
    }
  }
  splinters(world) {
    const r = this.r;
    const P = this.get("splinter", 64);
    for (const s of world.splinters) {
      P.body.y(s.x, 0.7, s.y, s.a, 1);
      r.sprites.colC(r.sprites.bb(s.x, 0.7, s.y, 0.6, r.B), ICE, 0.6);
    }
  }
  lances(world) {
    const r = this.r;
    const P = this.get("starLance", 64);
    for (const s of world.lances) {
      P.body.y(s.x, 0.7, s.y, s.a, 1);
      r.sprites.colC(r.sprites.bb(s.x, 0.7, s.y, 0.65, r.B), GOLD, 0.75);
    }
  }
  mossHelpers(dt, world, quality) {
    const r = this.r;
    const P = this.get("larva", 8);
    const time = r.time;
    for (const larva of world.player.mossHelpers) {
      const a = Math.atan2(larva.vy, larva.vx);
      const bob = Math.sin(time * 9 + larva.id) * 0.08;
      const hunt = !!larva.target;
      const y = (hunt ? 0.55 : 0.95) + bob;
      const dive = hunt ? -0.35 : 0;
      P.body.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0);
      P.glow.colC(P.glow.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0), ACID, 1.3);
      const beat = Math.sin(time * 70 + larva.id) * 0.5;
      P.mover.yr(larva.x, y, larva.y, a, 1, 1 + beat * 0.6, 1, dive, 0);
      r.sprites.colC(r.sprites.bb(larva.x, y, larva.y, 0.75, r.B), ACID, 0.4);
      r.shadows.y(larva.x, 0.02, larva.y, 0, 0.45);
      if (Math.random() < dt * (hunt ? 14 : 4) * quality) {
        r.emit(larva.x, y, larva.y, -larva.vx * 0.1, 0.2, -larva.vy * 0.1, 0.4, 0.09, ACID_PALE, { drag: 2 });
      }
    }
  }
  event(ev, world, shakeK) {
    const r = this.r;
    switch (ev.k) {
      case "bellCage":
        r.ring(ev.x, ev.y, ev.r * 1.2, ev.r, GOLD, 0.3);
        return true;
      case "lockOn":
        r.ring(ev.x, ev.y, 0.3, ev.r, GOLD_WHITE, 0.25);
        r.flash(ev.x, ev.y, ev.r * 1.5, 1.15, GOLD, 5);
        r.addShake(0.08 * shakeK);
        return true;
      case "shatter": {
        const spark = ev.glass ? GOLD_WHITE : ICE_WHITE;
        const ring = ev.glass ? GOLD : ICE;
        r.burst(ev.x, ev.y, 0.7, 9, 5.2, spark, 0.35, 0.13, { spark: true, drag: 3, grav: 5 });
        r.ring(ev.x, ev.y, 0.2, 1.25, ring, 0.22);
        if (ev.thermal) r.ring(ev.x, ev.y, 0.45, 1.5, GOLD, 0.28);
        return true;
      }
      case "graze":
        r.ring(ev.x, ev.y, ev.r, ev.r + 0.85, GOLD_WHITE, 0.28);
        return true;
      case "splinterHit":
        r.burst(ev.x, ev.y, 0.7, 5, 4.2, ev.glass ? GOLD : ICE_WHITE, 0.22, 0.09, { spark: true, drag: 5 });
        return true;
      case "broodHatch":
        r.burst(ev.x, ev.y, 0.5, 8, 3, ACID, 0.4, 0.14, { drag: 3, grav: 4 });
        r.ring(ev.x, ev.y, 0.2, 0.9, ACID_PALE, 0.25);
        return true;
      case "boom":
        if (ev.kind === "mossHelpers") {
          r.ring(ev.x, ev.y, 0.2, ev.r, ACID, 0.25);
          r.burst(ev.x, ev.y, 0.5, 12, 4, ACID, 0.45, 0.16, { drag: 2, grav: 5 });
          r.emit(ev.x, 0.5, ev.y, 0, 0.3, 0, 0.5, ev.r * 1.2, ACID_PALE, { drag: 0, grow: 1 });
          r.flash(ev.x, ev.y, ev.r * 1.6, 0.9, ACID, 5);
          if (r.attackView) r.attackView.mark(ev.x, ev.y, ev.r * 0.5, MARK_LOOK.slime);
          return true;
        }
        return false;
    }
    return false;
  }
}
