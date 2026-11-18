import { Color, CylinderGeometry, MeshBasicMaterial, OctahedronGeometry } from "three";
import { worldMaterial } from "./world-material.js";
import { shardGeometry } from "./strata-geometry.js";
import { meshPart, mergeParts } from "./models.js";
import { clamp, TAU } from "../core/util.js";
import { MARK_LOOK } from "./attacks-view.js";
import { LOCK_WARN, LOCK_TIME } from "../core/boss-cards.js";

const hex = (value) => new Color(value),
  GOLD = hex(0xffc84a),
  GOLD_WHITE = hex(0xfff0c0),
  EMBER = hex(0xff8a2a),
  HOT = hex(0xffd27a),
  ICE = hex(0x9ae6ff),
  ICE_WHITE = hex(0xe8fbff),
  // 3.50.0: the Glowmarsh's bloom
  ACID = hex(0x46ffc0),
  ACID_PALE = hex(0xd9fff0),
  PYLONS = 6;

const fac = (color, r, p) => meshPart(new OctahedronGeometry(r), color, p);
const MODELS = {
  pylon: () => ({
    body: [
      meshPart(new CylinderGeometry(0.17, 0.24, 0.11, 6), 0x303438, { y: 0.057 }),
      fac(0xa37c65, 0.49, { y: 0.52, sy: 1.01, sx: 0.36, sz: 0.36 }),
      fac(0xd3bc93, 0.22, { y: 1.03, sy: 1.26, sx: 0.73, sz: 0.73 }),
    ],
    glow: [fac(0xffffff, 0.086, { y: 1.29, sy: 1.23 }), fac(0xffffff, 0.076, { y: 0.51, z: 0.135, sz: 0.49 })],
  }),
  larva: () => ({
    body: [fac(0x698c62, 0.216, { x: 0.04, sx: 1.33, sy: 0.51 }), fac(0xb4ba80, 0.17, { x: -0.19, sy: 0.49 })],
    glow: [fac(0xffffff, 0.068, { x: 0.21, y: 0.057, sy: 0.71 }), fac(0xffffff, 0.055, { x: -0.23, y: 0.071 })],
    mover: [-1, 1].map((s) =>
      fac(0xacc9ab, 0.235, { x: -0.07, z: s * 0.21, y: 0.06, sx: 0.56, sy: 0.11, sz: 1.3, ry: s * 0.52 }),
    ),
  }),
  splinter: () => ({
    body: [
      fac(0xb0d7e8, 0.132, { sx: 2.78, sy: 0.39, sz: 0.57, rx: 0.22 }),
      fac(0xe9e2da, 0.1, { x: 0.08, sx: 2.1, sy: 0.31, sz: 0.26 }),
    ],
  }),
  lance: () => ({
    body: [
      meshPart(shardGeometry(0.18, 0.75, 0.16), 0xe2ae69, { x: -0.35, rz: -Math.PI / 2 }),
      fac(0xffe0a9, 0.117, { x: 0.1, sx: 2.48, sy: 0.29, sz: 0.53 }),
    ],
  }),
};

class BossCardView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
  }
  get(name, max) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      surface = name === "larva" ? "organic" : name === "pylon" ? "metal" : name === "lance" ? "crystal" : "ice",
      emissive = name === "splinter" ? 0x223344 : name === "lance" ? 0x3a2a14 : 0,
      mk = (parts, glow, lit) => {
        const pool = new this.Pool(
          mergeParts(parts.flat()),
          glow
            ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
            : worldMaterial({
                surface,
                vertexColors: true,
                flatShading: true,
                ...(lit ? { emissive } : {}),
              }),
          max,
        );
        this.r.scene.add(pool.mesh);
        this.list.push(pool);
        pool.mesh.renderOrder = glow ? 2 : 1;
        return pool;
      };
    set = this.pl[name] = {
      body: mk(m.body, false, name === "splinter" || name === "lance"),
      glow: m.glow ? mk(m.glow, true) : null,
      mover: m.mover ? mk(m.mover, false) : null,
    };
    // pools made in the middle of a frame start empty, like the others did at its begin
    for (const pool of [set.body, set.glow, set.mover]) if (pool) pool.begin();
    return set;
  }
  update(dt, world) {
    const r = this.r,
      quality = Math.min(1, r.maxParticles / 1400);
    if (world.cages && world.cages.length) this.cages(dt, world, quality);
    if (world.burnPools && world.burnPools.length) this.burnPools(dt, world, quality);
    if (world.splinters && world.splinters.length) this.splinters(world);
    if (world.lances && world.lances.length) this.lances(world);
    if (world.player.brood && world.player.brood.length) this.brood(dt, world, quality);
  }
  cages(dt, world, quality) {
    const r = this.r,
      P = this.get("pylon", 6 * PYLONS),
      time = r.time;
    for (const cage of world.cages) {
      const drop = clamp(cage.t / LOCK_WARN, 0, 1),
        fall = 1 - drop * drop,
        live = cage.t >= LOCK_WARN,
        end = clamp((cage.t - LOCK_WARN - LOCK_TIME + 0.3) / 0.3, 0, 1),
        spin = cage.id * 0.7,
        pts = [];
      for (let i = 0; i < PYLONS; i++) {
        const a = spin + (i / PYLONS) * TAU,
          x = cage.x + Math.cos(a) * cage.r,
          z = cage.y + Math.sin(a) * cage.r,
          y = fall * 5 - end * 1.2;
        pts.push(x, z);
        P.body.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        const g = P.glow.y(x, y, z, -a, 1, 1 - end * 0.5, 1);
        P.glow.colC(g, GOLD, live ? 1.4 + Math.sin(time * 30 + i) * 0.3 : 0.6 + drop);
        r.shadows.y(x, 0.02, z, 0, 0.5 + drop * 0.3);
      }
      if (!live) {
        // where it will close: a thin gold circle that fills in (the player's own colour, not a warning)
        r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.25 + drop * 0.35);
        continue;
      }
      // the beams between the pylons, at two heights, flickering; a faint gold floor inside
      const k = (1 - end) * (0.9 + Math.sin(time * 40 + cage.id) * 0.1);
      for (let i = 0; i < PYLONS; i++) {
        const j = (i + 1) % PYLONS,
          x0 = pts[i * 2],
          z0 = pts[i * 2 + 1],
          x1 = pts[j * 2],
          z1 = pts[j * 2 + 1];
        r.beams.colC(r.beams.seg(x0, z0, x1, z1, 1.2, 0.07, 0.05), GOLD_WHITE, 1.1 * k);
        r.beams.colC(r.beams.seg(x0, z0, x1, z1, 0.46, 0.06, 0.04), GOLD, 0.9 * k);
      }
      r.discs.colC(r.discs.y(cage.x, 0.04, cage.y, 0, cage.r), GOLD, 0.08 * k);
      r.ringPool.colC(r.ringPool.y(cage.x, 0.05, cage.y, 0, cage.r), GOLD, 0.55 * k);
      // sparks off the held enemies
      for (const enemy of cage.held)
        if (!enemy.dead && Math.random() < dt * 8 * quality)
          r.emit(enemy.x, 0.7, enemy.y, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, 0.3, 0.12, GOLD, {
            spark: true,
            drag: 3,
          });
    }
  }
  burnPools(dt, world, quality) {
    const r = this.r,
      time = r.time;
    for (const pool of world.burnPools) {
      const fade = clamp(pool.life / 0.6, 0, 1),
        rise = clamp((3 - pool.life) / 0.25, 0, 1),
        rad = pool.r * (0.6 + 0.4 * rise);
      r.shadows.y(pool.x, 0.02, pool.y, 0, rad * 2.2);
      // Searing Collapse leaves scorched ground and rising flame.
      r.discs.colC(
        r.discs.y(pool.x, 0.035, pool.y, 0, rad),
        EMBER,
        (0.16 + Math.sin(time * 7 + pool.id) * 0.04) * fade,
      );
      r.ringPool.colC(r.ringPool.y(pool.x, 0.045, pool.y, 0, rad), HOT, 0.3 * fade);
      if (Math.random() < dt * 40 * quality * fade) {
        const a = Math.random() * TAU,
          d = Math.sqrt(Math.random()) * rad * 0.9;
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
    const r = this.r,
      P = this.get("splinter", 64);
    for (const s of world.splinters) {
      P.body.y(s.x, 0.7, s.y, s.a, 1);
      r.sprites.colC(r.sprites.bb(s.x, 0.7, s.y, 0.55, r.B), ICE, 0.55);
    }
  }
  // 3.56.0: the hot glass lances of the Glasswyrm Fang
  lances(world) {
    const r = this.r,
      P = this.get("lance", 64);
    for (const s of world.lances) {
      P.body.y(s.x, 0.7, s.y, s.a, 1);
      r.sprites.colC(r.sprites.bb(s.x, 0.7, s.y, 0.6, r.B), GOLD, 0.7);
    }
  }
  brood(dt, world, quality) {
    const r = this.r,
      P = this.get("larva", 8),
      time = r.time;
    for (const larva of world.player.brood) {
      const a = Math.atan2(larva.vy, larva.vx),
        bob = Math.sin(time * 9 + larva.id) * 0.08,
        hunt = !!larva.target,
        y = (hunt ? 0.55 : 0.95) + bob,
        dive = hunt ? -0.35 : 0;
      P.body.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0);
      P.glow.colC(P.glow.yr(larva.x, y, larva.y, a, 1, 1, 1, dive, 0), ACID, 1.2);
      // the wings beat: a fast roll of the wing pair
      const beat = Math.sin(time * 70 + larva.id) * 0.5;
      P.mover.yr(larva.x, y, larva.y, a, 1, 1 + beat * 0.6, 1, dive, 0);
      r.sprites.colC(r.sprites.bb(larva.x, y, larva.y, 0.7, r.B), ACID, 0.35);
      r.shadows.y(larva.x, 0.02, larva.y, 0, 0.45);
      if (Math.random() < dt * (hunt ? 14 : 4) * quality)
        r.emit(larva.x, y, larva.y, -larva.vx * 0.1, 0.2, -larva.vy * 0.1, 0.4, 0.08, ACID_PALE, { drag: 2 });
    }
  }
  event(ev, world, shakeK) {
    const r = this.r;
    switch (ev.k) {
      case "lockdown":
        r.ring(ev.x, ev.y, ev.r * 1.2, ev.r, GOLD, 0.3);
        return true;
      case "lockOn":
        r.ring(ev.x, ev.y, 0.3, ev.r, GOLD_WHITE, 0.25);
        r.flash(ev.x, ev.y, ev.r * 1.4, 1.1, GOLD, 5);
        r.addShake(0.08 * shakeK);
        return true;
      case "shatter": {
        const spark = ev.glass ? GOLD_WHITE : ICE_WHITE;
        const ring = ev.glass ? GOLD : ICE;
        r.burst(ev.x, ev.y, 0.7, 8, 5, spark, 0.35, 0.12, { spark: true, drag: 3, grav: 5 });
        r.ring(ev.x, ev.y, 0.2, 1.2, ring, 0.2);
        return true;
      }
      case "splinterHit":
        r.burst(ev.x, ev.y, 0.7, 5, 4, ev.glass ? GOLD : ICE_WHITE, 0.2, 0.08, {
          spark: true,
          drag: 5,
        });
        return true;
      case "broodHatch":
        r.burst(ev.x, ev.y, 0.5, 8, 3, ACID, 0.4, 0.14, { drag: 3, grav: 4 });
        r.ring(ev.x, ev.y, 0.2, 0.9, ACID_PALE, 0.25);
        return true;
      case "boom":
        if (ev.kind === "brood") {
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

export { BossCardView };
