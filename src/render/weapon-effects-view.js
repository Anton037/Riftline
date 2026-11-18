// Inscribed projectile trails and animated flame ribbons.
import { BoxGeometry, PlaneGeometry, ShaderMaterial, DoubleSide, UniformsLib, UniformsUtils } from "three";
import { weaponDefs } from "../data/weapons.js";
import { WEAPON_EFFECTS } from "../data/combat-effects.js";
import { clamp } from "../core/util.js";
import { hexColor, additiveMaterial } from "./materials.js";
import { FINISH } from "./palette.js";

const WHITE = hexColor(FINISH.ivory),
  COPPER = hexColor(FINISH.copper),
  BRASS = hexColor(FINISH.brass);
const flameVertex = `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
varying vec2 vUv;
varying vec3 vState;
void main() {
  vUv = uv;
  vState = instanceColor;
  vec3 p = position;
  float t = uTime * 12.0 + vState.g * 70.0;
  p.y += sin(uv.x * 9.0 - t) * 0.09 * (1.0 - uv.x);
  p.z += sin(uv.x * 12.0 - t * 1.3) * 0.07;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const flameFragment = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vUv;
varying vec3 vState;
void main() {
  float u=vUv.x;
  float drift=sin(u*12.0-uTime*10.5+vState.g*12.0)*.12*(1.-u);
  float edge=abs(vUv.y-.5+drift);
  float w=.09+.29*sin(u*3.14159);
  float ribs=.58+.42*cos(u*34.0-uTime*15.0+vState.g*29.0);
  float alpha=(1.0-smoothstep(w-.05,w+.035,edge))*smoothstep(0.0,.13,u)*(1.0-smoothstep(.89,1.0,u));
  alpha*=ribs*(1.0-max(0.0,vState.r)*.68)*vState.b;
  if(alpha<.014)discard;
  float heat=(1.0-smoothstep(.01,w,edge))*ribs;
  vec3 col=mix(vec3(.59,.072,.05),vec3(.97,.45,.18),smoothstep(.0,.58,heat));
  col=mix(col,vec3(1.,.89,.64),smoothstep(.62,1.0,heat));
  gl_FragColor=vec4(col,alpha*.86);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

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
    return (this.segmentsPool ||= this.add(
      new BoxGeometry(1, 1, 1).translate(0.5, 0, 0),
      additiveMaterial(null),
      4096,
    ));
  }
  flames() {
    if (!this.flamePool) {
      this.flameMaterial = new ShaderMaterial({
        uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
        vertexShader: flameVertex,
        fragmentShader: flameFragment,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: true,
        toneMapped: false,
      });
      this.flamePool = this.add(new PlaneGeometry(1, 1, 8, 1).translate(-0.5, 0, 0), this.flameMaterial, 900);
    }
    this.flameMaterial.uniforms.uTime.value = this.r.time;
    return this.flamePool;
  }
  segment(x0, z0, x1, z1, y, width, color, intensity = 1) {
    const pool = this.segments();
    pool.colC(pool.seg(x0, z0, x1, z1, y, width, width), color, intensity);
  }
  arc(x, z, angle, length, bend, seed, y, count) {
    const ca = Math.cos(angle),
      sa = Math.sin(angle);
    // Stationary contours in the projectile’s frame let the material sheen travel along the inlay.
    const phase = (seed || 0) * 0.83 + this.r.time * 9;
    const side = seed % 2 ? 1 : -1;
    let px = x - ca * length,
      pz = z - sa * length;
    for (let i = 1; i <= count; i++) {
      const f = i / count;
      const arc = Math.sin(f * Math.PI) * bend * side;
      const qx = x - ca * length * (1 - f) - sa * arc;
      const qz = z - sa * length * (1 - f) + ca * arc;
      const sheen = 0.69 + 0.23 * Math.sin(phase - f * 5.3);
      const width = 0.05 + f * 0.065;
      this.segment(px, pz, qx, qz, y, width, COPPER, 0.69);
      this.segment(px, pz, qx, qz, y + 0.02, width * 0.34, BRASS, sheen);
      if (i === Math.floor(count * 0.75) || (count > 4 && i === Math.floor(count * 0.43))) {
        const finger = bend * (i % 2 ? 0.84 : -0.84);
        this.segment(
          qx - sa * finger,
          qz + ca * finger,
          qx + sa * finger,
          qz - ca * finger,
          y + 0.027,
          0.037,
          WHITE,
          0.66,
        );
      }
      px = qx;
      pz = qz;
    }
  }
  tongue(shot, angle, age, scale = 1, offset = 0) {
    const pool = this.flames(),
      seed = ((shot.id || 0) * 0.6180339) % 1,
      length = Math.min(0.65 + shot.r * 3.8, Math.max(0.1, shot.age * Math.hypot(shot.vx, shot.vy) + 0.1)) * scale,
      width = (0.4 + shot.r * 1.7) * scale,
      y = 1.38 + age * 0.28,
      x = shot.x - Math.cos(angle) * offset,
      z = shot.y - Math.sin(angle) * offset;
    for (const roll of [0, Math.PI / 2])
      pool.col(pool.yr(x, y, z, angle, length, width, width, 0, roll), age, seed, 0.85);
  }
  flameBeam(beam, len) {
    const pool = this.flames(),
      height = beam.skin === "magma" ? 0.72 : 1,
      x = beam.x + Math.cos(beam.a) * len,
      z = beam.y + Math.sin(beam.a) * len,
      seed = (((beam.x * 7.13 + beam.y * 2.17) % 1) + 1) % 1;
    for (const roll of [0, Math.PI / 2])
      pool.col(pool.yr(x, height, z, beam.a, len, beam.w * 1.7, beam.w * 1.7, 0, roll), -0.1, seed, 0.95);
  }
  draw(dt, world) {
    const r = this.r,
      arcDetail = world.pb.length > 180 ? 4 : 8;
    for (const shot of world.pb) {
      if (shot.life <= 0) continue;
      const def = weaponDefs[shot.w],
        effect = WEAPON_EFFECTS[shot.w],
        color = hexColor(def.color),
        angle = Math.atan2(shot.vy, shot.vx),
        ca = Math.cos(angle),
        sa = Math.sin(angle),
        speed = Math.hypot(shot.vx, shot.vy);
      switch (effect.projectile) {
        case "flame-tongue":
          this.tongue(shot, angle, clamp(shot.age / 0.55, 0, 1));
          if (shot.age > 0.3 && Math.random() < dt * 2) r.smokeView.emit(shot.x, 0.9, shot.y, 0.25, 0x58534e, 0.35);
          break;
        case "arc-inlay":
          this.arc(
            shot.x,
            shot.y,
            angle,
            Math.min(2.4, Math.max(0.05, shot.age * speed)),
            Math.min(0.13 + shot.r * 0.5, 0.04 + shot.age * speed * 0.12),
            shot.id,
            1.4,
            arcDetail,
          );
          break;
        case "returning-blade": {
          const spin = r.time * 24 + (shot.id || 0),
            idx = r.discPool.y(shot.x, 1.38, shot.y, spin, shot.r, 1, shot.r);
          r.discPool.col(idx, 1, 1, 1);
          for (let i = 0; i < 3; i++) {
            const a = spin - i * 0.4,
              x = shot.x + Math.cos(a) * shot.r * 0.88,
              z = shot.y + Math.sin(a) * shot.r * 0.88;
            this.segment(x, z, x - ca * 0.22, z - sa * 0.22, 1.39, 0.025, color, 0.7 - i * 0.16);
          }
          break;
        }
        case "exhaust-rocket": {
          const body = r.rocketBodies.y(shot.x, 1.4, shot.y, angle, shot.bomblet ? 0.7 : 1);
          r.rocketBodies.col(body, 1, 1, 1);
          this.tongue(shot, angle, 0.05, shot.bomblet ? 0.35 : 0.5, 0.35);
          if (Math.random() < dt * 18)
            r.smokeView.emit(shot.x - ca * 0.5, 1.37, shot.y - sa * 0.5, shot.bomblet ? 0.14 : 0.22, 0x9a9389, 0.65);
          break;
        }
        case "rail-lance": {
          const length = Math.min(1.7, Math.max(0.05, shot.age * speed));
          this.segment(
            shot.x - ca * length,
            shot.y - sa * length,
            shot.x + ca * 0.2,
            shot.y + sa * 0.2,
            1.4,
            0.045,
            WHITE,
            1.1,
          );
          this.segment(shot.x - ca * length, shot.y - sa * length, shot.x, shot.y, 1.4, 0.11, color, 0.35);
          break;
        }
        case "shot-tracer": {
          const len = Math.min(0.9, Math.max(0.25, shot.age * speed)),
            tail = 0.2;
          this.segment(shot.x - ca * len, shot.y - sa * len, shot.x, shot.y, 1.4, shot.r * 0.33, COPPER, 0.8);
          this.segment(shot.x - ca * tail, shot.y - sa * tail, shot.x, shot.y, 1.4, shot.r * 0.45, WHITE, 0.9);
          break;
        }
        case "pulse-bolt": {
          const len = shot.wing ? 0.45 : 0.65,
            width = shot.wing ? 0.035 : 0.055;
          this.segment(
            shot.x - ca * len,
            shot.y - sa * len,
            shot.x + ca * 0.12,
            shot.y + sa * 0.12,
            shot.wing ? 1.05 : 1.4,
            width * 2.6,
            color,
            0.55,
          );
          this.segment(
            shot.x - ca * len * 0.65,
            shot.y - sa * len * 0.65,
            shot.x,
            shot.y,
            shot.wing ? 1.05 : 1.4,
            width,
            WHITE,
            1,
          );
          break;
        }
      }
      if (shot.heavy) r.sprites.colC(r.sprites.bb(shot.x, 1.4, shot.y, shot.r * 2, r.B), color, 0.25);
    }
  }
}
