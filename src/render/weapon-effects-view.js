// Stylized kinetic player weapon projectile trails, arcs and cel flame ribbons for custom WebGL2 engine.

import { box, plane, octahedron, icosahedron, torus, meshPart, mergeGeometries } from "../engine/geometry.js";
import { Material } from "../engine/scene.js";
import { Vec3 } from "../engine/math.js";
import { muzzlePoint, weaponDefs } from "../data/weapons.js";
import { WEAPON_EFFECTS } from "../data/combat-effects.js";
import { clamp } from "../core/util.js";
import { hexColor, additiveMaterial, emissiveMaterial } from "./materials.js";
import { FINISH } from "./palette.js";

const WHITE = hexColor(FINISH.ivory);
const COPPER = hexColor(FINISH.copper);
const BRASS = hexColor(FINISH.brass);
const GOLD = hexColor(0xffdf78);
const PRISM = hexColor(0xc4f6ff);
const FLAME_ROLLS = [0, Math.PI / 2];
const LAUNCH_BLEND = 0.07;

export class WeaponEffectsView {
  constructor(renderer, Pool) {
    this.r = renderer;
    this.Pool = Pool;
    this.list = [];
    this.muzzle = new Vec3();
    this.launchOffsets = new WeakMap();
  }
  captureLaunch(launch, hero) {
    const muzzle = this.muzzle.set(launch.x, launch.height, launch.y);
    let offset;
    if (launch.echoOf) {
      offset = this.launchOffsets.get(launch.echoOf);
    } else if (hero) {
      hero.muzzle.getWorldPosition(muzzle);
      const pose = hero.group.position;
      const rest = muzzlePoint(weaponDefs[launch.w], pose.x, pose.z, -hero.aimYaw);
      const x = muzzle.x - rest.x;
      const z = muzzle.z - rest.y;
      const turn = launch.a + hero.aimYaw;
      offset = {
        x: x * Math.cos(turn) - z * Math.sin(turn),
        y: muzzle.y - rest.height,
        z: x * Math.sin(turn) + z * Math.cos(turn),
      };
    }
    if (offset) {
      this.launchOffsets.set(launch, offset);
      muzzle.set(launch.x + offset.x, launch.height + offset.y, launch.y + offset.z);
    }
    return muzzle;
  }
  add(geometry, material, max) {
    const pool = new this.Pool(geometry, material, max);
    pool.mesh.renderOrder = 4;
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
    return pool;
  }
  segments() {
    return (this.segmentsPool ||= this.add(box(1, 1, 1).translate(0.5, 0, 0), additiveMaterial(-1, 0.84, 1.1), 4096));
  }
  pulseBolts() {
    if (!this.pulseBoltPool) {
      const geom = mergeGeometries([
        meshPart(octahedron(0.18), 0xfff3d4, { sx: 1.75, sy: 0.62, sz: 0.62 }),
        meshPart(torus(0.11, 0.026, 5, 10), FINISH.brass, { x: -0.08, ry: Math.PI / 2 }),
      ]);
      this.pulseBoltPool = this.add(
        geom,
        emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.32, fog: false }),
        320,
      );
    }
    return this.pulseBoltPool;
  }
  scatterPellets() {
    if (!this.scatterPelletPool) {
      const geom = mergeGeometries([
        meshPart(icosahedron(0.14, 0), FINISH.brass, { sx: 1.25, sy: 0.9, sz: 0.9 }),
        meshPart(octahedron(0.09), 0xfff2cc, { x: 0.05, sx: 1.35, sy: 0.72, sz: 0.72 }),
      ]);
      this.scatterPelletPool = this.add(
        geom,
        emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.28, fog: false }),
        480,
      );
    }
    return this.scatterPelletPool;
  }
  railNeedles() {
    if (!this.railNeedlePool) {
      const geom = mergeGeometries([
        meshPart(octahedron(0.24), 0xf6fbff, { sx: 3.1, sy: 0.42, sz: 0.42 }),
        meshPart(octahedron(0.16), 0x74e8ff, { x: -0.22, sx: 1.8, sy: 0.22, sz: 0.88 }),
        meshPart(torus(0.13, 0.022, 5, 12), FINISH.brass, { x: -0.14, ry: Math.PI / 2 }),
      ]);
      this.railNeedlePool = this.add(
        geom,
        emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.38, fog: false }),
        160,
      );
    }
    return this.railNeedlePool;
  }
  arcOrbs() {
    if (!this.arcOrbPool) {
      const geom = mergeGeometries([
        meshPart(octahedron(0.15), 0xfff4d6, {}),
        meshPart(torus(0.18, 0.024, 5, 12), FINISH.copper, { rx: 0.7, ry: 0.4 }),
        meshPart(torus(0.16, 0.02, 5, 12), FINISH.brass, { rx: -0.7, rz: 0.5 }),
      ]);
      this.arcOrbPool = this.add(
        geom,
        emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.35, fog: false }),
        450,
      );
    }
    return this.arcOrbPool;
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
      const sheen = 0.82 + 0.28 * Math.sin(phase - f * 5.3);
      const width = 0.062 + f * 0.072;
      this.segment(px, pz, qx, qz, y, width, COPPER, 0.92);
      this.segment(px, pz, qx, qz, y + 0.02, width * 0.42, BRASS, sheen * 1.15);
      if (i === Math.floor(count * 0.75) || (count > 4 && i === Math.floor(count * 0.43))) {
        const finger = bend * (i % 2 ? 0.88 : -0.88);
        this.segment(
          qx - sa * finger,
          qz + ca * finger,
          qx + sa * finger,
          qz - ca * finger,
          y + 0.027,
          0.044,
          WHITE,
          0.92,
        );
      }
      px = qx;
      pz = qz;
    }
  }
  tongue(shot, x, y, z, angle, age, scale = 1, offset = 0) {
    const pool = this.flames();
    const seed = ((shot.id || 0) * 0.6180339) % 1;
    const length = Math.min(0.68 + shot.r * 3.8, Math.max(0.1, shot.age * Math.hypot(shot.vx, shot.vy) + 0.1)) * scale;
    const width = (0.42 + shot.r * 1.75) * scale;
    y += age * 0.24;
    x -= Math.cos(angle) * offset;
    z -= Math.sin(angle) * offset;
    for (const roll of FLAME_ROLLS) {
      pool.col(pool.yr(x, y, z, angle, length, width, width, 0, roll), age, seed, 0.78);
    }
  }
  flameBeam(beam, len) {
    const pool = this.flames();
    const height = beam.skin === "magma" ? 0.72 : 1;
    const x = beam.x + Math.cos(beam.a) * len;
    const z = beam.y + Math.sin(beam.a) * len;
    const seed = (((beam.x * 7.13 + beam.y * 2.17) % 1) + 1) % 1;
    for (const roll of FLAME_ROLLS) {
      pool.col(pool.yr(x, height, z, beam.a, len, beam.w * 1.75, beam.w * 1.75, 0, roll), -0.1, seed, 0.96);
    }
  }
  draw(dt, world) {
    const r = this.r;
    const time = r.time;
    const crowded = world.pb.length > 180;
    const arcDetail = crowded ? 4 : 8;
    for (const shot of world.pb) {
      if (shot.life <= 0) continue;
      let shotX = shot.x;
      let shotZ = shot.y;
      let height = shot.launch?.height ?? 1.06;
      const offset = shot.launch && shot.age < LAUNCH_BLEND ? this.launchOffsets.get(shot.launch) : null;
      if (offset) {
        // Follow the launch pose into the projectile's flight path once per volley.
        const fade = 1 - shot.age / LAUNCH_BLEND;
        shotX += offset.x * fade;
        shotZ += offset.z * fade;
        height += offset.y * fade;
      }
      const def = weaponDefs[shot.w];
      const effect = WEAPON_EFFECTS[shot.w];
      const color = hexColor(def.color);
      const angle = Math.atan2(shot.vy, shot.vx);
      const ca = Math.cos(angle),
        sa = Math.sin(angle);
      const speed = Math.hypot(shot.vx, shot.vy);

      switch (effect.projectile) {
        case "flame-tongue":
          this.tongue(shot, shotX, height, shotZ, angle, clamp(shot.age / 0.55, 0, 1));
          if (shot.age > 0.3 && Math.random() < dt * 2) r.smokeView.emit(shotX, 0.9, shotZ, 0.28, 0x58534e, 0.4);
          break;
        case "arc-inlay": {
          this.arc(
            shotX,
            shotZ,
            angle,
            Math.min(2.4, Math.max(0.05, shot.age * speed)),
            Math.min(0.13 + shot.r * 0.5, 0.04 + shot.age * speed * 0.12),
            shot.id,
            height,
            arcDetail,
          );
          const orbs = this.arcOrbs();
          const sc = Math.max(0.75, (shot.r || 0.18) * 4.8);
          orbs.colC(
            orbs.yr(shotX, height, shotZ, angle, sc, sc, sc, 0, time * 14 + (shot.id || 0)),
            shot.superCrit ? GOLD : color,
            1.2,
          );
          break;
        }
        case "returning-blade": {
          const spin = time * 26 + (shot.id || 0);
          const idx = r.discPool.y(shotX, height, shotZ, spin, shot.r, 1, shot.r);
          r.discPool.col(idx, 1, 1, 1);
          for (let i = 0; i < 4; i++) {
            const a = spin - i * 0.38;
            const x = shotX + Math.cos(a) * shot.r * 0.9;
            const z = shotZ + Math.sin(a) * shot.r * 0.9;
            this.segment(x, z, x - ca * 0.32, z - sa * 0.32, height + 0.01, 0.045, color, 1.05 - i * 0.18);
          }
          break;
        }
        case "exhaust-rocket": {
          const body = r.rocketBodies.y(shotX, height, shotZ, angle, shot.bomblet ? 0.74 : 1.08);
          r.rocketBodies.col(body, 1, 1, 1);
          this.tongue(shot, shotX, height, shotZ, angle, 0.05, shot.bomblet ? 0.42 : 0.62, 0.36);
          if (Math.random() < dt * 20) {
            r.smokeView.emit(shotX - ca * 0.5, height, shotZ - sa * 0.5, shot.bomblet ? 0.18 : 0.28, 0x9a9389, 0.68);
          }
          break;
        }
        case "rail-lance": {
          const length = Math.min(2.05, Math.max(0.08, shot.age * speed));
          const needles = this.railNeedles();
          const sc = Math.max(0.85, (shot.r || 0.16) * 5.2);
          needles.colC(
            needles.yr(shotX + ca * 0.08, height, shotZ + sa * 0.08, angle, sc, sc, sc, 0, time * 18 + (shot.id || 0)),
            shot.superCrit ? GOLD : color,
            1.35,
          );
          this.segment(
            shotX - ca * length,
            shotZ - sa * length,
            shotX + ca * 0.28,
            shotZ + sa * 0.28,
            height,
            0.068,
            WHITE,
            1.45,
          );
          this.segment(shotX - ca * length, shotZ - sa * length, shotX, shotZ, height, 0.175, color, 0.62);
          if (!crowded) {
            const twist = time * 16 + (shot.id || 0);
            const off = Math.sin(twist) * 0.11;
            this.segment(
              shotX - ca * (length * 0.82) + sa * off,
              shotZ - sa * (length * 0.82) - ca * off,
              shotX - ca * 0.12 - sa * off,
              shotZ - sa * 0.12 + ca * off,
              height + 0.02,
              0.042,
              PRISM,
              1.1,
            );
          }
          break;
        }
        case "shot-tracer": {
          const len = Math.min(1.08, Math.max(0.01, shot.age * speed));
          const pellets = this.scatterPellets();
          const sc = Math.max(0.75, (shot.r || 0.13) * 6.2);
          pellets.colC(
            pellets.yr(shotX, height, shotZ, angle, sc, sc, sc, 0, time * 22 + (shot.id || 0) * 1.7),
            shot.superCrit ? GOLD : color,
            1.22,
          );
          this.segment(shotX - ca * len, shotZ - sa * len, shotX, shotZ, height, shot.r * 0.44, COPPER, 1.05);
          const bright = Math.min(0.28, len);
          this.segment(shotX - ca * bright, shotZ - sa * bright, shotX, shotZ, height, shot.r * 0.58, WHITE, 1.25);
          break;
        }
        case "pulse-bolt": {
          const len = Math.min(shot.wing ? 0.54 : 0.84, Math.max(0.01, shot.age * speed));
          const width = shot.wing ? 0.044 : 0.068;
          const y = shot.wing ? 1.02 : height;
          const bolts = this.pulseBolts();
          const sc = shot.wing ? 0.72 : 1.05;
          bolts.colC(
            bolts.yr(shotX + ca * 0.06, y, shotZ + sa * 0.06, angle, sc, sc, sc, 0, time * 12 + (shot.id || 0)),
            shot.superCrit ? GOLD : color,
            1.28,
          );
          this.segment(
            shotX - ca * len,
            shotZ - sa * len,
            shotX + ca * 0.18,
            shotZ + sa * 0.18,
            y,
            width * 3.0,
            color,
            0.84,
          );
          this.segment(
            shotX - ca * len * 0.7,
            shotZ - sa * len * 0.7,
            shotX + ca * 0.08,
            shotZ + sa * 0.08,
            y,
            width * 1.12,
            WHITE,
            1.35,
          );
          break;
        }
      }
      if ((shot.dashBoost || shot.superCrit) && !crowded && effect.projectile !== "arc-inlay") {
        const wLen = Math.min(1.15, Math.max(0.32, shot.age * speed * 0.75));
        const sway = Math.sin(time * 18 + (shot.id || 0)) * 0.09;
        this.segment(
          shotX - ca * wLen - sa * sway,
          shotZ - sa * wLen + ca * sway,
          shotX - ca * 0.06 + sa * sway * 0.5,
          shotZ - sa * 0.06 - ca * sway * 0.5,
          height,
          0.048,
          GOLD,
          1.25,
        );
      }
      if (shot.heavy || shot.superCrit) {
        r.sprites.colC(
          r.sprites.bb(shotX, height, shotZ, shot.r * (shot.superCrit ? 2.6 : 2.2), r.B),
          shot.superCrit ? GOLD : color,
          shot.superCrit ? 0.45 : 0.35,
        );
      }
    }
  }
}
