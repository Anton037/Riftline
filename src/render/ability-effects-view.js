// Player powers (Nova, Singularity, Aegis, Combo Surge) on custom WebGL2 instanced shaders.
// Private pools never borrow hostile warning telegraphs or wash out the screen.

import { Geometry, ringBlade, sphere } from "../engine/geometry.js";
import { Material } from "../engine/scene.js";
import { clamp, TAU } from "../core/util.js";
import { COLLAPSE_TIME } from "../core/boss-cards.js";
import { hexColor } from "./materials.js";

const CYAN = hexColor(0x62f2d8);
const VIOLET = hexColor(0xb87cff);
const GOLD = hexColor(0xffbe66);

function waveGeometry() {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  const sides = 48,
    rows = 4;
  for (let y = 0; y <= rows; y++) {
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TAU;
      const h = y / rows;
      const rad = 0.04 + 0.96 * Math.sqrt(1 - h * h);
      pos.push(Math.cos(a) * rad, h, Math.sin(a) * rad);
      norm.push(Math.cos(a), h, Math.sin(a));
      uv.push(i / sides, h);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let i = 0; i < sides; i++) {
      const k = y * (sides + 1) + i;
      idx.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
    }
  }
  return new Geometry(pos, norm, uv, idx);
}

export class AbilityEffectsView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.list = [];
    this.pulses = [];
    this.shieldHitAt = -Infinity;
    this.world = null;
  }
  clear() {
    this.pulses.length = 0;
    this.shieldHitAt = -Infinity;
  }
  useWorld(world) {
    if (this.world !== world) {
      this.clear();
      this.world = world;
    }
  }
  add(key, geometry, mat, max) {
    const p = new this.Pool(geometry, mat, max);
    p.mesh.renderOrder = 4;
    this.r.scene.add(p.mesh);
    this.list.push(p);
    this[key] = p;
    return p;
  }
  waves() {
    return (
      this.wavePool ||
      this.add(
        "wavePool",
        waveGeometry(),
        new Material({
          shader: "abilityWave",
          transparent: true,
          additive: true,
          depthWrite: false,
          doubleSide: true,
          fog: false,
        }),
        32,
      )
    );
  }
  fields() {
    return (
      this.fieldPool ||
      this.add(
        "fieldPool",
        ringBlade(1, 48),
        new Material({
          shader: "abilityField",
          transparent: true,
          additive: true,
          depthWrite: false,
          doubleSide: true,
          fog: false,
        }),
        32,
      )
    );
  }
  cores() {
    return (
      this.corePool ||
      this.add(
        "corePool",
        sphere(1, 20, 14),
        new Material({ shader: "abilityCore", transparent: true, depthWrite: true, fog: false }),
        16,
      )
    );
  }
  event(ev, world, shake) {
    this.useWorld(world);
    const r = this.r;
    if (ev.k === "boom" && ev.kind === "fireBurst") return true;
    if (ev.k === "fireBurst" || ev.k === "surge" || (ev.k === "boom" && ev.kind === "gravityBell")) {
      const kind = ev.k === "fireBurst" ? 0 : ev.k === "surge" ? 2 : 1;
      const life = kind === 1 ? 0.65 : 0.68;
      if (this.pulses.length === 32) this.pulses.shift();
      this.pulses.push({ x: ev.x, z: ev.y, r: ev.r, at: r.time, life, kind });
      r.burst(
        ev.x,
        ev.y,
        0.85,
        kind === 0 ? 24 : 16,
        kind === 1 ? 4.2 : 9.4,
        kind === 0 ? CYAN : kind === 1 ? VIOLET : GOLD,
        0.46,
        0.15,
        { spark: true, up: 3.4, drag: 3.6, grav: 2 },
      );
      if (kind === 0) {
        r.emit(ev.x, 0.9, ev.y, 0, 0, 0, 0.14, ev.r * 0.72, CYAN, { drag: 0 });
      } else if (kind === 1) {
        r.emit(ev.x, 1.1, ev.y, 0, 0, 0, 0.14, ev.r * 0.58, VIOLET, { drag: 0 });
      }
      r.flash(ev.x, ev.y, ev.r * 1.15, kind === 0 ? 1.0 : 0.7, kind === 0 ? CYAN : kind === 1 ? VIOLET : GOLD, 5.5);
      r.addShake((kind === 0 ? 0.38 : kind === 1 ? 0.24 : 0.12) * shake);
      return true;
    }
    if (ev.k === "gravityBell" || ev.k === "singOpen" || ev.k === "implode") {
      r.burst(ev.x, ev.y, 0.8, 8, 2.5, VIOLET, 0.26, 0.1, { spark: true, drag: 3 });
      return true;
    }
    if (ev.k === "shieldBreak") {
      this.shieldHitAt = r.time;
      r.burst(ev.x, ev.y, 1, 10, 4.5, CYAN, 0.28, 0.1, { spark: true, drag: 5 });
      return true;
    }
    return false;
  }
  field(x, z, radius, age = 0, kind = 0, strength = 1, height = 0.055) {
    const p = this.fields();
    p.col(p.y(x, height, z, 0, radius, 1, radius), age, kind, strength);
  }
  draw(dt, world) {
    this.useWorld(world);
    const r = this.r;
    let count = 0;
    for (const e of this.pulses) {
      const age = clamp((r.time - e.at) / e.life, 0, 1);
      if (age === 1) continue;
      this.pulses[count++] = e;
      const front = e.r * (0.04 + 0.96 * Math.pow(clamp(age / 0.55, 0, 1), 0.56));
      const p = this.waves();
      p.col(p.y(e.x, 0.06, e.z, 0, front, 0.26 + (1 - age) * e.r * 0.28, front), age, e.kind, e.kind === 2 ? 0.72 : 1);
      if (e.kind === 1) {
        const k = 1 - clamp(age * 3, 0, 1);
        if (k > 0) this.cores().y(e.x, 1.55, e.z, 0, 0.45 * k);
      }
    }
    this.pulses.length = count;
    for (const g of world.singularities || []) {
      if (g.done) continue;
      if (g.pullT < 0) {
        const k = clamp(g.t / g.dur, 0, 1);
        const d = Math.hypot(g.tx - g.fx, g.ty - g.fy);
        const x = g.fx + (g.tx - g.fx) * k;
        const z = g.fy + (g.ty - g.fy) * k;
        const h =
          0.9 + ((g.launchHeight ?? 0.9) - 0.9) * (1 - k) + Math.sin(Math.PI * k) * clamp(0.6 + d * 0.06, 0.8, 1.6);
        this.cores().y(x, h, z, 0, 0.19);
        this.field(g.tx, g.ty, world.stats.gadgetR * 1.7, 0, 3, 0.6);
        if (Math.random() < dt * 24) r.emit(x, h, z, 0, 0.15, 0, 0.22, 0.09, VIOLET, { spark: true, drag: 3 });
        continue;
      }
      const age = clamp(g.pullT / 1.5, 0, 1);
      const end = clamp((age - 0.8) / 0.2, 0, 1);
      const size = (0.36 + age * 0.14) * (1 - end * 0.6);
      const hover = 0.9 + 0.65 * clamp(g.pullT / 0.25, 0, 1);
      this.cores().y(g.tx, hover, g.ty, 0, size);
      this.field(g.tx, g.ty, g.r || world.stats.gadgetR * 1.7, age, 0, 1 - end * 0.7);
      const p = this.fields();
      p.col(
        p.yr(g.tx, hover, g.ty, r.time * 0.18, 1.75 * (1 - end * 0.6), 1, 1.75 * (1 - end * 0.6), 0.23, 0.14),
        age,
        2,
        1.15,
      );
      if (Math.random() < dt * 28 * (1 - end)) {
        const a = Math.random() * TAU;
        const d = (g.r || 5) * (0.5 + Math.random() * 0.4);
        const speed = d / 0.6;
        r.emit(
          g.tx + Math.cos(a) * d,
          0.2,
          g.ty + Math.sin(a) * d,
          -Math.cos(a) * speed,
          0.7,
          -Math.sin(a) * speed,
          0.6,
          0.08,
          GOLD,
          { spark: true, drag: 0 },
        );
      }
    }
    if (world.implode) {
      const g = world.implode;
      const k = clamp(g.t / COLLAPSE_TIME, 0, 1);
      this.field(g.x, g.y, g.r * 1.4, k, 1, 0.75);
      this.cores().y(g.x, 1.7, g.y, 0, 0.13 + k * 0.19);
    }
  }
}
