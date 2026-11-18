// Biome trap presentation. The simulation owns timing and collision; TrapView draws world.traps.
// Floor, beam and mine families each use biome-specific colours, shapes and materials. Per skin there are at most three instance pools
// (static body, glowing parts, moving part), created the first time the skin appears, so a wave with a dozen traps
// costs a handful of draw calls and no per-frame allocations. Telegraphs keep the language of the boss hazards: a red
// ring that fills up, never used for decoration. The look of the idle trap stays dark and quiet.

import { Color, CylinderGeometry, MeshBasicMaterial, OctahedronGeometry, TorusGeometry } from "three";
import { worldMaterial } from "./world-material.js";
import { FINISH } from "./palette.js";
import { meshPart, mergeParts } from "./models.js";
import { clamp, TAU, angleDiff } from "../core/util.js";

const WHITE = new Color(FINISH.ivory),
  WARN = new Color(FINISH.vermilion),
  tint = new Color(),
  hex = (value) => new Color(value);

// skin colours: main (glow, particles), second (accent), debris
const LOOK = {
  // 3.4.0: Blackout City: an electrified plate (cold blue-white, amber) and a red security laser
  plate: { main: hex(FINISH.brass), alt: hex(FINISH.ivory), dust: hex(0x9fb4c8) },
  icespike: { main: hex(FINISH.glacier), alt: hex(FINISH.ivory), dust: hex(0xdff6ff) },
  // 3.50.0: the Glowmarsh's bloom jet: mint over dark peat
  geyser: { main: hex(FINISH.jade), alt: hex(0xd6e9d0), dust: hex(0x1c4a3c) },
  riftburst: { main: hex(FINISH.lavender), alt: hex(0xe4b6bf), dust: hex(0x2a1650) },
  laser: { main: hex(FINISH.copper), alt: hex(0xffd0a0), dust: hex(0x9fb4c8) },
  magma: { main: hex(0xff7a1f), alt: hex(0xffd27a), dust: hex(0x746957) },
  rift: { main: hex(0x9a84bb), alt: hex(0xe4b6bf), dust: hex(0x2a1650) },
  // 3.33.0: the beams of the Aurora Shelf (the Frost Prism, the sentinel) and of the Glowmarsh (the sentinel)
  cryo: { main: hex(FINISH.glacier), alt: hex(0xe8fbff), dust: hex(0xdff6ff) },
  acid: { main: hex(FINISH.jade), alt: hex(0xd6e9d0), dust: hex(0x1c4a3c) },
  mine: { main: hex(0xff8a3a), alt: hex(0xffe0a0), dust: hex(0x6a6a72), led: hex(FINISH.vermilion) },
  frost: { main: hex(FINISH.glacier), alt: hex(FINISH.ivory), dust: hex(0xdff6ff), led: hex(0xc8f6ff) },
  spore: { main: hex(FINISH.jade), alt: hex(0xd6e9d0), dust: hex(0x1c4a3c), led: hex(0x8fffd9) },
  riftmine: { main: hex(FINISH.lavender), alt: hex(0xe4b6bf), dust: hex(0x2a1650), led: hex(0xe4b6bf) },
  embermine: { main: hex(0xde986e), alt: hex(0xffd27a), dust: hex(0x63584d), led: hex(0xff9e39) },
  glassmine: { main: hex(0xffd98a), alt: hex(0xfff0c4), dust: hex(0xc8b38b), led: hex(0xffd98a) },
  // 3.49.0: the Caldera's fumarole: molten
  pyro: { main: hex(0xffb45a), alt: hex(0xffe9b0), dust: hex(0x3a2418) },
  // 3.53.0: the Glass Flats' sunspike: fused glass erupts, hot white-gold, sand in the dust
  sunspike: { main: hex(0xffe9c4), alt: hex(0xfff3d6), dust: hex(0xd8c8a8) },
  // 3.56.0: the Glasswyrm's sun lance: the noon bent through glass - hot orange over white-hot (the
  // additive body washes out pale on the flats' near-white sheets; the hot orange reads, like the
  // sunspike's fused edge)
  sun: { main: hex(0xff9a2e), alt: hex(0xffd27a), dust: hex(0xffe0b0) },
};
const ARMING = hex(FINISH.copper),
  TRIGGER = hex(0xcfd8e6);

const easeOut = (k) => 1 - (1 - k) * (1 - k);
const metal = 0xcc9564,
  plate = 0x293636;
const facets = (n, fn) => Array.from({ length: n }, (_, i) => fn((i * TAU) / n, i));
const disk = (r, h, color, y, n = 12) => meshPart(new CylinderGeometry(r * 0.93, r, h, n), color, { y });
const gem = (r, color, p) => meshPart(new OctahedronGeometry(r), color, p);
const bezel = (r, w, color, y, n = 24) => meshPart(new TorusGeometry(r, w, 5, n), color, { y, rx: Math.PI / 2 });

function tile(color, glowColor, slots, shape) {
  return {
    body: [disk(0.97, 0.1, plate, 0.05, 12), disk(0.84, 0.085, color, 0.103, slots), bezel(0.87, 0.033, metal, 0.138)],
    glow: facets(slots, (a) =>
      gem(0.13, glowColor, {
        x: Math.cos(a) * 0.68,
        z: Math.sin(a) * 0.68,
        y: 0.153,
        ry: -a,
        sx: 1.1,
        sy: 0.18,
        sz: 0.48,
      }),
    ),
    ...(shape ? { mover: shape } : {}),
  };
}

function obelisk(color, n) {
  return facets(n, (a, i) =>
    gem(i === 0 ? 0.53 : 0.25, color, {
      x: i === 0 ? 0 : Math.cos(a) * 0.36,
      z: i === 0 ? 0 : Math.sin(a) * 0.36,
      y: i === 0 ? 0.43 : 0.26,
      ry: a,
      rz: Math.cos(a) * 0.28,
      sy: i === 0 ? 1.04 : 0.92,
    }),
  );
}

function emitter(color, accent, h, profile) {
  return {
    body: [
      disk(0.66, 0.16, plate, 0.08, 8),
      disk(0.52, 0.15, color, 0.21, profile),
      disk(0.24, h, color, h * 0.5 + 0.27, profile),
      bezel(0.31, 0.05, metal, h * 0.4 + 0.26, 16),
    ],
    glow: facets(4, (a) => gem(0.092, accent, { x: Math.cos(a) * 0.52, z: Math.sin(a) * 0.52, y: 0.22, sy: 0.45 })),
    mover: [
      disk(0.36, 0.22, plate, 0, profile),
      gem(0.48, color, { x: 0.17, sy: 0.61, sz: 0.84, ry: TAU / profile }),
      meshPart(new TorusGeometry(0.22, 0.041, 5, profile * 3), metal, { x: 0.43, ry: Math.PI / 2 }),
    ],
    moverGlow: [gem(0.159, accent, { x: 0.46, sx: 0.37 }), gem(0.071, accent, { x: 0.08, y: 0.3, sy: 1.27 })],
  };
}

function mine(color, sides, profile) {
  return {
    body: [
      disk(0.34, 0.1, plate, 0.055, sides),
      disk(0.27, 0.15, color, 0.147, sides),
      bezel(0.235, 0.025, metal, 0.2, 18),
      ...facets(sides, (a) =>
        gem(0.084, color, { y: 0.12, x: Math.cos(a) * 0.3, z: Math.sin(a) * 0.3, sy: 0.7, ry: -a }),
      ),
    ],
    glow: [gem(0.1, 0xffffff, { y: 0.24, sy: 0.56 }), bezel(0.217, 0.012, 0xffffff, 0.21, 18)],
    ...(profile ? { mover: [gem(0.12, color, { y: 0.09, sy: 1.33 }), bezel(0.16, 0.022, metal, 0.07, 12)] } : {}),
  };
}

const MODELS = {
  plate: () => tile(0x446466, 0xafe3cf, 8),
  icespike: () => tile(0x72869e, 0xe0e9f5, 6, obelisk(0xbaceea, 5)),
  geyser: () => tile(0x496545, 0xbfe69b, 5, [gem(0.65, 0x8dba69, { y: 0.38, sy: 0.65 })]),
  riftburst: () => tile(0x5e487a, 0xd7b5ef, 6, obelisk(0xa583c5, 3)),
  pyro: () => tile(0x89472f, 0xffb575, 5, [gem(0.62, 0xdc8252, { y: 0.33, sy: 0.62 })]),
  sunspike: () => tile(0x8f7554, 0xffda9e, 8, obelisk(0xe1bd76, 6)),
  laser: () => emitter(0x657a72, 0xff9a74, 0.72, 6),
  magma: () => emitter(0x843e35, 0xffac78, 0.24, 5),
  rift: () => emitter(0x675487, 0xe7b6eb, 0.59, 4),
  mine: () => mine(0x8a7160, 6, false),
  frost: () => mine(0x93abbf, 8, true),
  spore: () => mine(0x62835f, 5, true),
  riftmine: () => mine(0x825c94, 4, true),
  embermine: () => mine(0xa35c4b, 5, false),
  glassmine: () => mine(0xb49868, 7, true),
};
const MAX = { floor: 12, beam: 8, mine: 16 };

class TrapView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.st = new Map();
    this.arr = null;
  }
  // the pools of a skin, built when first needed
  get(name, max = 16) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      mk = (parts, glow) => {
        const pool = new this.Pool(
          mergeParts(parts.flat()),
          glow
            ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
            : worldMaterial({
                color: 0xffffff,
                vertexColors: true,
                surface: ["sunspike", "glassmine"].includes(name)
                  ? "sandstone"
                  : name === "geyser" || name === "spore"
                    ? "wood"
                    : ["pyro", "magma", "embermine"].includes(name)
                      ? "basalt"
                      : name === "icespike" || name === "frost" || name === "cryo"
                        ? "ice"
                        : "stone",
              }),
          max,
        );
        if (!glow) pool.mesh.castShadow = pool.mesh.receiveShadow = true;
        this.r.scene.add(pool.mesh);
        this.list.push(pool);
        pool.mesh.renderOrder = glow ? 2 : 1;
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
    const traps = world.traps,
      r = this.r;
    if (this.arr !== traps) {
      this.arr = traps;
      this.st.clear();
    }
    const quality = Math.min(1, r.maxParticles / 1400);
    for (const trap of traps) {
      const s = this.state(trap),
        look = LOOK[trap.skin];
      if (!look) continue;
      s.fire += dt;
      s.pop += dt;
      if (trap.st !== s.last) {
        // a mine that comes back somewhere else pops out of the floor
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
  // the red ring that fills up: the same language as every other warning of the game
  warnRing(x, z, radius, k) {
    // above the trap's own plate (y 0.2), or its body would hide the ring
    const r = this.r,
      ring = r.ringPool.y(x, 0.2, z, 0, radius);
    // a soft dark pool under the ring: red light on a pale floor (the Aurora Shelf) would wash out to pink-white
    r.shadows.y(x, 0.03, z, 0, radius * 2.6);
    r.ringPool.colC(ring, WARN, 0.67 + k * 0.27);
    const disc = r.discs.y(x, 0.19, z, 0, radius * k);
    r.discs.colC(disc, WARN, 0.18 + k * 0.14);
    const edge = r.ringPool.y(x, 0.195, z, 0, radius * k);
    r.ringPool.colC(edge, WARN, 0.35);
  }
  floor(trap, s, look, dt, quality) {
    const r = this.r,
      time = r.time,
      x = s.x,
      z = s.z,
      rr = trap.r,
      P = this.get(trap.skin, MAX.floor),
      warn = trap.st === "warn",
      k = warn ? clamp(trap.t / trap.delay, 0, 1) : 0,
      hit = s.fire < 0.3 ? 1 - s.fire / 0.3 : 0;
    P.body.y(x, 0, z, 0, rr, 1, rr);
    const glow = 0.4 + Math.sin(time * 2 + trap.id) * 0.1 + k * 0.7 + hit * 0.7;
    const emit = Math.random() < dt * (3 + k * 22) * quality;
    switch (trap.skin) {
      case "plate": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, glow);
        if (emit) {
          const a = Math.floor(Math.random() * 4) * 1.5708,
            d = (0.2 + Math.random() * 0.6) * rr;
          r.emit(x + Math.cos(a) * d, 0.15, z + Math.sin(a) * d, 0, 1 + k * 2, 0, 0.35, 0.16, look.main, {
            spark: true,
            drag: 1,
          });
        }
        break;
      }
      case "icespike":
      case "sunspike": {
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.35 + k * 0.9 + hit);
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
        P.glow.colC(P.glow.y(x, 0, z, 0, rr, 1, rr), WHITE, 0.55 + Math.sin(time * 4 + trap.id) * 0.15 + k * 0.6 + hit);
        const dome = warn
          ? (0.15 + 0.85 * k) * (1 + Math.sin(time * 20) * 0.08 * k)
          : s.fire > 0.5
            ? easeOut(clamp((s.fire - 0.5) / 0.8, 0, 1)) * 0.15
            : 0;
        if (dome > 0.01) P.mover.y(x, 0, z, 0, rr * 0.55 * dome + rr * 0.1, dome * 1.1, rr * 0.55 * dome + rr * 0.1);
        if (s.fire < 0.55) {
          const f = s.fire / 0.55,
            h = 6 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1)), 0.7);
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
            { drag: 1, grow: 0.6 },
          );
        }
        break;
      }
      default: {
        // riftburst: the sigil turns faster as it charges, the shard rises and pulls things in
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
          // dark motes fall into the sigil
          const a = Math.random() * TAU,
            d = rr * (0.8 + Math.random() * 0.25),
            life = 0.45;
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
    const r = this.r,
      time = r.time,
      x = trap.x,
      z = trap.y,
      P = this.get(trap.skin, MAX.beam);
    // the head follows the beam it fires (a second one crosses the first in Endless)
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
    const charge = a1 !== null && bt < 1 ? bt : 0,
      live = bt >= 1 ? 1 : 0,
      hover = trap.skin === "magma" ? 0.55 : trap.skin === "rift" ? 1.3 + Math.sin(time * 2.4 + trap.id) * 0.1 : 1.3;
    P.body.y(x, 0, z, 0, 1.35, 1.35, 1.35);
    P.glow.colC(
      P.glow.y(x, 0, z, 0, 1.35, 1.35, 1.35),
      WHITE,
      0.4 + charge * 0.8 + live * 1.1 + Math.sin(time * 4 + trap.id) * 0.1,
    );
    const heads = a2 === null ? 1 : 2;
    for (let i = 0; i < heads; i++) {
      const yaw = i ? a2 : s.yaw,
        recoil = live ? 0.025 : 0;
      P.mover.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35);
      P.moverGlow.colC(
        P.moverGlow.y(x, hover, z, yaw, 1.35 + recoil, 1.35, 1.35),
        WHITE,
        0.55 + charge * 0.9 + live * 1.2 + Math.sin(time * 9) * 0.08,
      );
    }
    const cy = Math.cos(s.yaw),
      sy = Math.sin(s.yaw);
    if (charge > 0) {
      // the head gathers its light: motes fly into the muzzle, and a glow swells (never yellow or red)
      const tx = x + cy * 1.25,
        tz = z + sy * 1.25;
      if (Math.random() < dt * (14 + charge * 40) * quality) {
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
      r.sprites.colC(r.sprites.bb(tx, hover, tz, 0.5 + charge * 1.3, r.B), look.main, 0.35 + charge * 0.5);
    }
    if (live) {
      const tx = x + cy * 1.3,
        tz = z + sy * 1.3;
      r.sprites.colC(r.sprites.bb(tx, hover, tz, 1.6, r.B), look.main, 0.35);
    }
    // a faint line shows where the head points between bursts, so the next beam is not a surprise
    if (!charge && !live) {
      const dl = r.beams.seg(x + cy * 1.1, z + sy * 1.1, x + cy * 4, z + sy * 4, 0.05, 0.03, 0.02);
      r.beams.colC(dl, look.main, 0.1);
    }
  }
  // the beam of a trap, in the colours of its skin (the warning phase stays the red line of every beam)
  drawBeam(beam, ex, ez, len, time, dt) {
    const r = this.r,
      look = LOOK[beam.skin === "flame" ? "magma" : beam.skin],
      ca = Math.cos(beam.a),
      sa = Math.sin(beam.a),
      b = r.beams;
    if (!beam.live) return false;
    const sheen = 0.95 + Math.sin(time * 5) * 0.035;
    if (beam.skin === "flame" || beam.skin === "magma") {
      // Continuous turbulent ribbons keep the jet fluid, rather than drawing five rectangular blocks.
      r.weaponView.flameBeam(beam, len);
      r.warningEdges.colC(r.warningEdges.seg(beam.x, beam.y, ex, ez, 0.04, beam.w, 0.025), hex(0x160e09), 0.6);
      if (Math.random() < dt * 14) {
        const d = Math.random() * len;
        r.emit(beam.x + ca * d, 0.8, beam.y + sa * d, ca, 1.5, sa, 0.4, 0.13, look.main, { drag: 2, grav: -1 });
      }
    } else if (beam.skin === "rift") {
      // a writhing ribbon of violet with a thin bright core
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 8; i++) {
        const along = (len * i) / 8,
          off = Math.sin(time * 9 + i * 1.3) * beam.w * 0.45 * (i < 8 ? 1 : 0),
          qx = beam.x + ca * along - sa * off,
          qz = beam.y + sa * along + ca * off;
        b.colC(b.seg(px, pz, qx, qz, 1, beam.w * sheen, beam.w * 0.6), look.main, 0.75);
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.3, beam.w * 0.3), WHITE, 1);
      if (Math.random() < dt * 14) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d - sa * beam.w,
          1,
          beam.y + sa * d + ca * beam.w,
          sa * 2.5,
          0,
          -ca * 2.5,
          0.35,
          0.22,
          Math.random() < 0.3 ? look.alt : look.main,
          { drag: 1 },
        );
      }
    } else if (beam.skin === "cryo") {
      // 3.33.0: a lance of ice: a pale glassy body with a white core, frost needles growing out of both edges along
      // the shaft (their places drift slowly, so the lance looks grown, not drawn), flakes that sink off it
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * (0.92 + sheen * 0.08), beam.w * 0.7), look.main, 0.55);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.42, beam.w * 0.36), look.alt, 0.85);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.16, beam.w * 0.16), WHITE, 1);
      const n = Math.max(4, Math.round(len / 1.4)),
        reach = Math.max(0.22, beam.w * 0.75),
        thin = Math.max(0.05, beam.w * 0.09);
      for (let i = 1; i < n; i++) {
        const along = (len * (i + 0.3 * Math.sin(i * 2.7 + time * 0.6))) / n;
        for (const side of [-1, 1]) {
          const out = side * (beam.w * 0.45),
            tip = side * (beam.w * 0.45 + reach * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.9 + side)))),
            back = -reach * 0.55,
            x0 = beam.x + ca * along - sa * out,
            z0 = beam.y + sa * along + ca * out,
            x1 = beam.x + ca * (along + back) - sa * tip,
            z1 = beam.y + sa * (along + back) + ca * tip;
          b.colC(b.seg(x0, z0, x1, z1, 1, thin, thin * 0.5), look.alt, 0.8);
        }
      }
      if (Math.random() < dt * 16) {
        const d = Math.random() * len,
          o = (Math.random() - 0.5) * beam.w * 2;
        r.emit(
          beam.x + ca * d - sa * o,
          1 + Math.random() * 0.3,
          beam.y + sa * d + ca * o,
          (Math.random() - 0.5) * 0.6,
          -0.4 - Math.random() * 0.6,
          (Math.random() - 0.5) * 0.6,
          0.9,
          0.12,
          Math.random() < 0.5 ? look.alt : WHITE,
          { drag: 2 },
        );
      }
    } else if (beam.skin === "acid") {
      // 3.33.0 (re-voiced 3.50.0): a jet of glow: a body that swells and narrows in slow pulses down its length, a
      // pale mint core, drops that fall off it and shine where they splash
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 6; i++) {
        const along = (len * i) / 6,
          qx = beam.x + ca * along,
          qz = beam.y + sa * along,
          swell = 0.8 + 0.3 * Math.sin(time * 14 - i * 1.6);
        b.colC(b.seg(px, pz, qx, qz, 1, beam.w * swell * sheen, beam.w * 0.6), look.main, 0.7);
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.3, beam.w * 0.3), look.alt, 1);
      if (Math.random() < dt * 16) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d,
          1,
          beam.y + sa * d,
          (Math.random() - 0.5) * 1.2,
          0.5,
          (Math.random() - 0.5) * 1.2,
          0.6,
          0.16,
          Math.random() < 0.3 ? look.alt : look.main,
          { grav: 9, drag: 0.5 },
        );
      }
    } else if (beam.skin === "sun") {
      // 3.56.0: the Glasswyrm's sun lance: the noon bent through glass - a broad hot body that bends
      // in slow refraction waves along its length, a white-hot core, heat shimmer that rises (the
      // body runs hot and wide: the additive washes out on the noon's near-white sheets)
      let px = beam.x,
        pz = beam.y;
      for (let i = 1; i <= 7; i++) {
        const along = (len * i) / 7,
          off = Math.sin(time * 5 + i * 1.1) * beam.w * 0.3 * (i < 7 ? 1 : 0),
          qx = beam.x + ca * along - sa * off,
          qz = beam.y + sa * along + ca * off;
        b.colC(
          b.seg(px, pz, qx, qz, 1, beam.w * (1.3 + 0.14 * Math.sin(time * 8 - i)) * sheen, beam.w * 0.7),
          look.main,
          0.85,
        );
        px = qx;
        pz = qz;
      }
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.34, beam.w * 0.34), look.alt, 0.95);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 1, beam.w * 0.14, beam.w * 0.14), WHITE, 1);
      if (Math.random() < dt * 18) {
        const d = Math.random() * len,
          o = (Math.random() - 0.5) * beam.w * 2.2;
        r.emit(
          beam.x + ca * d - sa * o,
          1 + Math.random() * 0.3,
          beam.y + sa * d + ca * o,
          (Math.random() - 0.5) * 0.8,
          1.6 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.8,
          0.8,
          0.2,
          Math.random() < 0.5 ? look.alt : look.main,
          { drag: 1.5 },
        );
      }
    } else {
      // The City beam reads as two copper rails with an ivory filament between them.
      r.warningEdges.colC(r.warningEdges.seg(beam.x, beam.y, ex, ez, 0.055, beam.w, 0.04), hex(FINISH.ink), 0.75);
      b.colC(b.seg(beam.x, beam.y, ex, ez, 0.75, beam.w * 0.23, beam.w * 0.13), WHITE, 0.82);
      for (const side of [-1, 1]) {
        const o = side * beam.w * 0.42;
        b.colC(b.seg(beam.x - sa * o, beam.y + ca * o, ex - sa * o, ez + ca * o, 0.74, 0.085, 0.065), look.main, 0.88);
      }
      if (Math.random() < dt * 12) {
        const d = Math.random() * len;
        r.emit(
          beam.x + ca * d,
          1,
          beam.y + sa * d,
          (Math.random() - 0.5) * 3,
          1.5,
          (Math.random() - 0.5) * 3,
          0.3,
          0.3,
          look.main,
          { spark: true },
        );
      }
    }
    // where it ends: a bright point and sparks
    r.sprites.colC(r.sprites.bb(ex, 1, ez, 1.15, r.B), look.main, 0.39);
    if (Math.random() < dt * 30)
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
    return true;
  }
  mine(trap, s, look, dt, quality) {
    if (trap.st === "gone") return;
    const r = this.r,
      time = r.time,
      x = s.x,
      z = s.z,
      P = this.get(trap.skin, MAX.mine),
      fuse = trap.st === "fuse",
      armed = trap.st === "armed",
      rise = trap.st === "unarmed" ? easeOut(clamp(s.pop / 0.6, 0, 1)) : 1,
      k = fuse ? clamp(trap.t / 0.45, 0, 1) : 0,
      y0 = -0.4 * (1 - rise),
      sc = (0.7 + 0.3 * rise) * 1.3;
    // A steady lamp marks armed mines. A growing vermilion fill tracks the fuse.
    let col = ARMING,
      lum = 0.15 + clamp(trap.t / 1.5, 0, 1) * 0.35;
    if (armed) {
      col = look.led;
      lum = 0.64;
    } else if (fuse) {
      col = WARN;
      lum = 0.83 + k * 0.34;
    }
    let breathe = 1;
    if (trap.skin === "spore") breathe = (armed ? 1 + Math.sin(time * 5) * 0.05 : 1) * (fuse ? 1 + k * 0.55 : 1);
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
      const glowSprite = r.sprites.bb(x, 0.3, z, 1.2 + (fuse ? k * 0.6 : 0), r.B);
      r.sprites.colC(glowSprite, col, fuse ? 0.18 + k * 0.15 : 0.12);
      // the area it will cover is only drawn faintly until something steps close
      if (armed) {
        const ringIdx = r.ringPool.y(x, 0.04, z, 0, 1.5);
        r.ringPool.colC(ringIdx, TRIGGER, 0.1 + Math.sin(time * 3 + trap.id) * 0.03);
      }
    }
    if (fuse) this.warnRing(x, z, trap.r, k);
    if (!fuse && !armed && Math.random() < dt * 2 * quality)
      r.emit(x, 0.3, z, 0, 0.6, 0, 0.5, 0.1, ARMING, { spark: true, drag: 1 });
  }
  /* trap events: strike effects per skin (the simulation already hurt whoever stood there) */
  event(ev, world, shakeK) {
    const r = this.r,
      look = LOOK[ev.skin];
    if (!look) return;
    if (ev.k === "trapArm") {
      r.ring(ev.x, ev.y, 0.2, 1.1, look.led || look.main, 0.3);
      r.burst(ev.x, ev.y, 0.3, 4, 3, look.led || look.main, 0.3, 0.2, { spark: true });
      return;
    }
    // trapFire
    const s = this.st.get(ev.id),
      x = ev.x,
      z = ev.y,
      rad = ev.r;
    if (s) {
      s.fire = 0;
      s.shat = false;
    }
    switch (ev.skin) {
      case "plate":
        r.ring(x, z, rad * 0.2, rad * 1.1, look.main, 0.35);
        r.ring(x, z, rad * 0.1, rad * 0.7, WHITE, 0.2);
        for (let i = 0; i < 6; i++) {
          const angle = (i * TAU) / 6;
          const dx = Math.cos(angle) * rad,
            dz = Math.sin(angle) * rad;
          r.line(x + dx * 0.28, z + dz * 0.28, x + dx * 0.92, z + dz * 0.92, look.main, 0.34, 0.07, 0.18, 0.1);
        }
        r.burst(x, z, 0.25, 9, Math.min(6, rad * 2), look.alt, 0.46, 0.16, { spark: true, drag: 3 });
        r.debrisBurst(x, z, 0.2, 5, look.dust, 0.1, 4);
        r.addScorch(x, z, rad * 0.45);
        r.addShake(0.12 * shakeK);
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
        // riftmine
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

export { TrapView };
