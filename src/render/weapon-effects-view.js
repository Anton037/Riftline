// Stylized kinetic player weapon projectile trails, arcs and cel flame ribbons for custom WebGL2 engine.

import { box, plane } from "../engine/geometry.js";
import { Material } from "../engine/scene.js";
import { weaponDefs } from "../data/weapons.js";
import { WEAPON_EFFECTS } from "../data/combat-effects.js";
import { clamp } from "../core/util.js";
import { hexColor, additiveMaterial } from "./materials.js";
import { FINISH } from "./palette.js";

const WHITE = hexColor(FINISH.ivory);
const COPPER = hexColor(FINISH.copper);
const BRASS = hexColor(FINISH.brass);

export class WeaponEffectsView {
  constructor(renderer, Pool) {
    this.r = renderer;
    this.Pool = Pool;
    this.list = [];
  }
  add(geometry, material, max) {
    const pool = new this.Pool(geometry, material, max);
    pool.mesh.renderOrder = 4;
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
    return pool;
  }
  segments() {
    return (this.segmentsPool ||= this.add(box(1, 1, 1).translate(0.5, 0, 0), additiveMaterial(-1, 1, 1.45), 4096));
  }
  flames() {
    if (!this.flamePool) {
      this.flameMaterial = new Material({
        shader: "flame",
        transparent: true,
        additive: false,
        depthWrite: false,
        doubleSide: true,
        fog: false,
      });
      this.flamePool = this.add(plane(1, 1, 8, 1).translate(-0.5, 0, 0), this.flameMaterial, 900);
    }
    return this.flamePool;
  }
  segment(x0, z0, x1, z1, y, width, color, intensity = 1) {
    const pool = this.segments();
    pool.colC(pool.seg(x0, z0, x1, z1, y, width, width), color, intensity);
  }
  arc(x, z, angle, length, bend, seed, y, count) {
    const ca = Math.cos(angle),
      sa = Math.sin(angle);
    const phase = (seed || 0) * 0.83 + this.r.time * 9;
    const side = seed % 2 ? 1 : -1;
    let px = x - ca * length,
      pz = z - sa * length;
    for (let i = 1; i <= count; i++) {
      const f = i / count;
      const arc = Math.sin(f * Math.PI) * bend * side;
      const qx = x - ca * length * (1 - f) - sa * arc;
      const qz = z - sa * length * (1 - f) + ca * arc;
      const sheen = 0.72 + 0.26 * Math.sin(phase - f * 5.3);
      const width = 0.055 + f * 0.065;
      this.segment(px, pz, qx, qz, y, width, COPPER, 0.75);
      this.segment(px, pz, qx, qz, y + 0.02, width * 0.36, BRASS, sheen);
      if (i === Math.floor(count * 0.75) || (count > 4 && i === Math.floor(count * 0.43))) {
        const finger = bend * (i % 2 ? 0.84 : -0.84);
        this.segment(
          qx - sa * finger,
          qz + ca * finger,
          qx + sa * finger,
          qz - ca * finger,
          y + 0.027,
          0.038,
          WHITE,
          0.72,
        );
      }
      px = qx;
      pz = qz;
    }
  }
  tongue(shot, angle, age, scale = 1, offset = 0) {
    const pool = this.flames();
    const seed = ((shot.id || 0) * 0.6180339) % 1;
    const length = Math.min(0.68 + shot.r * 3.8, Math.max(0.1, shot.age * Math.hypot(shot.vx, shot.vy) + 0.1)) * scale;
    const width = (0.42 + shot.r * 1.75) * scale;
    const y = 1.35 + age * 0.28;
    const x = shot.x - Math.cos(angle) * offset;
    const z = shot.y - Math.sin(angle) * offset;
    for (const roll of [0, Math.PI / 2]) {
      pool.col(pool.yr(x, y, z, angle, length, width, width, 0, roll), age, seed, 0.9);
    }
  }
  flameBeam(beam, len) {
    const pool = this.flames();
    const height = beam.skin === "magma" ? 0.72 : 1;
    const x = beam.x + Math.cos(beam.a) * len;
    const z = beam.y + Math.sin(beam.a) * len;
    const seed = (((beam.x * 7.13 + beam.y * 2.17) % 1) + 1) % 1;
    for (const roll of [0, Math.PI / 2]) {
      pool.col(pool.yr(x, height, z, beam.a, len, beam.w * 1.75, beam.w * 1.75, 0, roll), -0.1, seed, 0.96);
    }
  }
  draw(dt, world) {
    const r = this.r;
    const arcDetail = world.pb.length > 180 ? 4 : 8;
    for (const shot of world.pb) {
      if (shot.life <= 0) continue;
      const def = weaponDefs[shot.w];
      const effect = WEAPON_EFFECTS[shot.w];
      const color = hexColor(def.color);
      const angle = Math.atan2(shot.vy, shot.vx);
      const ca = Math.cos(angle),
        sa = Math.sin(angle);
      const speed = Math.hypot(shot.vx, shot.vy);

      switch (effect.projectile) {
        case "flame-tongue":
          this.tongue(shot, angle, clamp(shot.age / 0.55, 0, 1));
          if (shot.age > 0.3 && Math.random() < dt * 2) r.smokeView.emit(shot.x, 0.9, shot.y, 0.28, 0x58534e, 0.4);
          break;
        case "arc-inlay":
          this.arc(
            shot.x,
            shot.y,
            angle,
            Math.min(2.4, Math.max(0.05, shot.age * speed)),
            Math.min(0.13 + shot.r * 0.5, 0.04 + shot.age * speed * 0.12),
            shot.id,
            1.35,
            arcDetail,
          );
          break;
        case "returning-blade": {
          const spin = r.time * 24 + (shot.id || 0);
          const idx = r.discPool.y(shot.x, 1.35, shot.y, spin, shot.r, 1, shot.r);
          r.discPool.col(idx, 1, 1, 1);
          for (let i = 0; i < 3; i++) {
            const a = spin - i * 0.4;
            const x = shot.x + Math.cos(a) * shot.r * 0.88;
            const z = shot.y + Math.sin(a) * shot.r * 0.88;
            this.segment(x, z, x - ca * 0.24, z - sa * 0.24, 1.36, 0.03, color, 0.8 - i * 0.16);
          }
          break;
        }
        case "exhaust-rocket": {
          const body = r.rocketBodies.y(shot.x, 1.35, shot.y, angle, shot.bomblet ? 0.72 : 1.05);
          r.rocketBodies.col(body, 1, 1, 1);
          this.tongue(shot, angle, 0.05, shot.bomblet ? 0.36 : 0.52, 0.36);
          if (Math.random() < dt * 18) {
            r.smokeView.emit(shot.x - ca * 0.5, 1.32, shot.y - sa * 0.5, shot.bomblet ? 0.16 : 0.25, 0x9a9389, 0.65);
          }
          break;
        }
        case "rail-lance": {
          const length = Math.min(1.85, Math.max(0.06, shot.age * speed));
          this.segment(
            shot.x - ca * length,
            shot.y - sa * length,
            shot.x + ca * 0.22,
            shot.y + sa * 0.22,
            1.35,
            0.052,
            WHITE,
            1.25,
          );
          this.segment(shot.x - ca * length, shot.y - sa * length, shot.x, shot.y, 1.35, 0.125, color, 0.45);
          break;
        }
        case "shot-tracer": {
          const len = Math.min(0.95, Math.max(0.25, shot.age * speed));
          this.segment(shot.x - ca * len, shot.y - sa * len, shot.x, shot.y, 1.35, shot.r * 0.36, COPPER, 0.88);
          this.segment(shot.x - ca * 0.22, shot.y - sa * 0.22, shot.x, shot.y, 1.35, shot.r * 0.48, WHITE, 1.0);
          break;
        }
        case "pulse-bolt": {
          const len = shot.wing ? 0.48 : 0.72;
          const width = shot.wing ? 0.038 : 0.06;
          this.segment(
            shot.x - ca * len,
            shot.y - sa * len,
            shot.x + ca * 0.14,
            shot.y + sa * 0.14,
            shot.wing ? 1.05 : 1.35,
            width * 2.6,
            color,
            0.65,
          );
          this.segment(
            shot.x - ca * len * 0.65,
            shot.y - sa * len * 0.65,
            shot.x,
            shot.y,
            shot.wing ? 1.05 : 1.35,
            width,
            WHITE,
            1.1,
          );
          break;
        }
      }
      if (shot.heavy) r.sprites.colC(r.sprites.bb(shot.x, 1.35, shot.y, shot.r * 2.2, r.B), color, 0.35);
    }
  }
}
