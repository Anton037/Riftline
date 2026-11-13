// Distinct weapon silhouettes, with pooled lightning and animated flame ribbons rather than ball substitutes.
import { BoxGeometry, PlaneGeometry, ShaderMaterial, DoubleSide, UniformsLib, UniformsUtils } from "three";
import { weaponDefs } from "../data/weapons.js";
import { WEAPON_EFFECTS } from "../data/combat-effects.js";
import { clamp } from "../core/util.js";
import { hexColor, additiveMaterial } from "./materials.js";

const WHITE = hexColor(0xe8f7ff),
  ARC = hexColor(0x9d86ff),
  ARC_CORE = hexColor(0xe0edff),
  COPPER = hexColor(0xffd6a0);
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
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
}
void main() {
  float u=vUv.x, v=abs(vUv.y-.5);
  vec2 q=vec2(u*6.0-uTime*7.0+vState.g*31.0,vUv.y*5.0);
  float n=noise(q)*.65+noise(q*2.1)*.35;
  float width=(.05+.31*pow(max(0.0,sin(u*3.14159)),.65))*(.72+n*.45);
  float alpha=(1.0-smoothstep(width-.10,width+.03,v))*smoothstep(0.0,.14,u)*(1.0-smoothstep(.90,1.0,u));
  alpha *= (.5+n*.5)*(1.0-vState.r*.6)*vState.b;
  if(alpha<.015) discard;
  float heatU=vState.r<0.0?1.0-u:u;
  float heat=clamp(heatU*.8+(1.0-v/width)*.4-max(0.0,vState.r)*.5+n*.15,0.0,1.0);
  vec3 col=mix(vec3(.64,.055,.006),vec3(1.0,.32,.025),smoothstep(0.0,.65,heat));
  col=mix(col,vec3(1.0,.88,.45),smoothstep(.65,1.0,heat));
  gl_FragColor=vec4(col,alpha*.8);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

export class WeaponEffectsView {
  constructor(renderer, Pool) {
    this.r = renderer;
    this.Pool = Pool;
    this.list = [];
    this.arcCache = new WeakMap();
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
  arc(x, z, angle, length, width, seed, y = 1.4, count = 8, shot = null) {
    const ca = Math.cos(angle),
      sa = Math.sin(angle),
      beat = Math.floor(this.r.time * 24);
    let offsets;
    if (shot) {
      let cached = this.arcCache.get(shot);
      if (!cached) {
        cached = { beat: -Infinity, seed: null, count: 0, offsets: new Float64Array(8) };
        this.arcCache.set(shot, cached);
      }
      if (cached.beat !== beat || cached.seed !== seed) {
        cached.beat = beat;
        cached.seed = seed;
        cached.count = 0;
      }
      for (let i = cached.count + 1; i < count; i++)
        cached.offsets[i - 1] = Math.sin(seed * 13.7 + i * 11.9 + beat * 2.1);
      cached.count = Math.max(cached.count, count - 1);
      offsets = cached.offsets;
    }
    let px = x - ca * length,
      pz = z - sa * length;
    for (let i = 1; i <= count; i++) {
      const f = i / count,
        off = i === count ? 0 : (offsets ? offsets[i - 1] : Math.sin(seed * 13.7 + i * 11.9 + beat * 2.1)) * width,
        qx = x - ca * length * (1 - f) - sa * off,
        qz = z - sa * length * (1 - f) + ca * off;
      this.segment(px, pz, qx, qz, y, 0.065, ARC, 0.75);
      this.segment(px, pz, qx, qz, y, 0.022, ARC_CORE, 1.05);
      if (i === 3 || i === 6) {
        const side = i === 3 ? 1 : -1,
          bx = qx - ca * 0.22 - sa * width * side * 1.7,
          bz = qz - sa * 0.22 + ca * width * side * 1.7;
        this.segment(qx, qz, bx, bz, y + 0.025, 0.024, ARC, 0.8);
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
        case "branching-arc":
          this.arc(
            shot.x,
            shot.y,
            angle,
            Math.min(2.4, Math.max(0.05, shot.age * speed)),
            Math.min(0.13 + shot.r * 0.5, 0.04 + shot.age * speed * 0.12),
            shot.id,
            1.4,
            arcDetail,
            shot,
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
