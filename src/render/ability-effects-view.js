// Player powers own their pools: they never borrow hostile telegraph beams or fill the screen.
import {
  BufferGeometry,
  Float32BufferAttribute,
  CircleGeometry,
  SphereGeometry,
  ShaderMaterial,
  DoubleSide,
  UniformsLib,
  UniformsUtils,
} from "three";
import { clamp, TAU } from "../core/util.js";
import { COLLAPSE_TIME } from "../core/boss-cards.js";
import { hexColor } from "./materials.js";

const CYAN = hexColor(0x96dec1),
  VIOLET = hexColor(0xc3a2ec),
  GOLD = hexColor(0xefb374);
const vertex = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vState;
void main(){
 vUv=uv; vState=instanceColor;
 vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
function material(fragment) {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: vertex,
    fragmentShader: `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vUv;
varying vec3 vState;
${fragment}`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    toneMapped: false,
  });
}
const waveFragment = `void main(){
 float age=vState.r, h=vUv.y, orbit=vUv.x*6.2831853;
 float mainRing=exp(-pow((h-.16)*16.0,2.0));
 float echo=exp(-pow((h-.42)*23.0,2.0))*.47;
 float ticks=pow(max(0.,cos(orbit*24.0)),7.0)*exp(-pow((h-.28)*7.0,2.0));
 float arcs=smoothstep(-.2,.13,cos(orbit*8.0-uTime*3.3))*exp(-pow((h-.62)*11.0,2.0));
 float alpha=(mainRing+echo+ticks*.44+arcs*.31)*pow(1.-age,1.3);
 alpha*=smoothstep(0.,.06,age)*vState.b;
 vec3 hue=vState.g<.5?vec3(.32,.74,.62):vState.g<1.5?vec3(.61,.38,.78):vec3(.88,.42,.19);
 gl_FragColor=vec4(mix(hue,vec3(1.,.92,.74),mainRing*.65),alpha);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`;
const fieldFragment = `void main(){
 vec2 p=vUv*2.-1.; float r=length(p), a=atan(p.y,p.x+1e-5);
 if(r>1.0||r<.055)discard;
 float target=step(2.5,vState.g);
 float spiral=a+log(r+.09)*1.7+uTime*.74;
 float arcs=pow(abs(cos(spiral*3.)),15.0)*(1.-r);
 float slits=pow(.5+.5*cos(a*12.0-uTime*1.8),6.0);
 float frame=step(1.5,vState.g)*(1.-target);
 float rim=exp(-pow((r-mix(.21,.46,frame))*34.,2.0));
 float halo=exp(-pow((r-.67)*26.,2.0))*slits;
 float alpha=(arcs*.55+halo*.57+rim*.95)*(1.-vState.r*.45);
 vec3 col=mix(vec3(.27,.16,.44),vec3(1.,.69,.39),clamp(rim+halo+arcs*.5,0.,1.));
 if(target>.5){
   float border=exp(-pow((r-.94)*95.,2.0));
   alpha=border*(.12+slits*.33);
   col=vec3(.43,.81,.64);
 }
 gl_FragColor=vec4(col,alpha*vState.b);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`;
const coreVertex = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vNormalEye;
varying vec3 vViewEye;
void main(){
 vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);
 vNormalEye=normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*normal);
 vViewEye=-mvPosition.xyz;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const coreFragment = `
#include <common>
#include <fog_pars_fragment>
varying vec3 vNormalEye;
varying vec3 vViewEye;
void main(){
 float rim=pow(1.0-abs(dot(normalize(vNormalEye),normalize(vViewEye))),5.0);
 gl_FragColor=vec4(vec3(.002,.001,.007)+vec3(.52,.35,.2)*rim,.99);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`;
function waveGeometry() {
  const pos = [],
    uv = [],
    idx = [],
    sides = 64,
    rows = 4;
  for (let y = 0; y <= rows; y++)
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * TAU;
      const h = y / rows,
        radius = 0.03 + 0.97 * Math.sqrt(1 - h * h);
      pos.push(Math.cos(a) * radius, h, Math.sin(a) * radius);
      uv.push(i / sides, y / rows);
    }
  for (let y = 0; y < rows; y++)
    for (let i = 0; i < sides; i++) {
      const k = y * (sides + 1) + i;
      idx.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class AbilityEffectsView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.list = [];
    this.pulses = [];
    this.shieldHitAt = -Infinity;
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
    p.mesh.renderOrder = 3;
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = this.r.time;
    this.r.scene.add(p.mesh);
    this.list.push(p);
    this[key] = p;
    return p;
  }
  waves() {
    return this.wavePool || this.add("wavePool", waveGeometry(), material(waveFragment), 32);
  }
  fields() {
    if (!this.fieldPool) {
      const g = new CircleGeometry(1, 64);
      g.rotateX(-Math.PI / 2);
      this.add("fieldPool", g, material(fieldFragment), 32);
    }
    return this.fieldPool;
  }
  cores() {
    return (
      this.corePool ||
      this.add(
        "corePool",
        new SphereGeometry(1, 24, 16),
        new ShaderMaterial({
          uniforms: UniformsUtils.merge([UniformsLib.fog]),
          vertexShader: coreVertex,
          fragmentShader: coreFragment,
          fog: true,
          toneMapped: false,
        }),
        16,
      )
    );
  }
  event(ev, world, shake) {
    this.useWorld(world);
    const r = this.r;
    if (ev.k === "boom" && ev.kind === "nova") return true;
    if (ev.k === "nova" || ev.k === "surge" || (ev.k === "boom" && ev.kind === "singularity")) {
      const kind = ev.k === "nova" ? 0 : ev.k === "surge" ? 2 : 1,
        life = kind === 1 ? 0.65 : 0.68;
      if (this.pulses.length === 32) this.pulses.shift();
      this.pulses.push({ x: ev.x, z: ev.y, r: ev.r, at: r.time, life, kind });
      r.burst(
        ev.x,
        ev.y,
        0.8,
        kind === 0 ? 16 : 10,
        kind === 1 ? 3 : 8,
        kind === 0 ? CYAN : kind === 1 ? VIOLET : GOLD,
        0.38,
        0.11,
        { spark: true, drag: 4, grav: 2 },
      );
      r.flash(ev.x, ev.y, ev.r * 0.95, kind === 0 ? 0.65 : 0.4, kind === 0 ? CYAN : kind === 1 ? VIOLET : GOLD, 7);
      r.addShake((kind === 0 ? 0.32 : kind === 1 ? 0.2 : 0.1) * shake);
      return true;
    }
    if (ev.k === "singularity" || ev.k === "singOpen" || ev.k === "implode") {
      r.burst(ev.x, ev.y, 0.8, 6, 2, VIOLET, 0.24, 0.08, { spark: true, drag: 3 });
      return true;
    }
    if (ev.k === "shieldBreak") {
      this.shieldHitAt = r.time;
      r.burst(ev.x, ev.y, 1, 8, 4, CYAN, 0.25, 0.08, { spark: true, drag: 5 });
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
    for (const p of this.list) if (p.mesh.material.uniforms?.uTime) p.mesh.material.uniforms.uTime.value = r.time;
    let count = 0;
    for (const e of this.pulses) {
      const age = clamp((r.time - e.at) / e.life, 0, 1);
      if (age === 1) continue;
      this.pulses[count++] = e;
      const front = e.r * (0.04 + 0.96 * Math.pow(clamp(age / 0.55, 0, 1), 0.56)),
        p = this.waves();
      p.col(p.y(e.x, 0.06, e.z, 0, front, 0.25 + (1 - age) * e.r * 0.27, front), age, e.kind, e.kind === 2 ? 0.7 : 1);
      if (e.kind === 1) {
        const k = 1 - clamp(age * 3, 0, 1);
        if (k > 0) this.cores().y(e.x, 1.55, e.z, 0, 0.45 * k);
      }
    }
    this.pulses.length = count;
    for (const g of world.singularities || []) {
      if (g.done) continue;
      if (g.pullT < 0) {
        const k = clamp(g.t / g.dur, 0, 1),
          d = Math.hypot(g.tx - g.fx, g.ty - g.fy),
          x = g.fx + (g.tx - g.fx) * k,
          z = g.fy + (g.ty - g.fy) * k,
          h = 0.9 + Math.sin(Math.PI * k) * clamp(0.6 + d * 0.06, 0.8, 1.6);
        this.cores().y(x, h, z, 0, 0.18);
        this.field(g.tx, g.ty, world.stats.gadgetR * 1.7, 0, 3, 0.55);
        if (Math.random() < dt * 24) r.emit(x, h, z, 0, 0.15, 0, 0.22, 0.075, VIOLET, { spark: true, drag: 3 });
        continue;
      }
      const age = clamp(g.pullT / 1.5, 0, 1),
        end = clamp((age - 0.8) / 0.2, 0, 1),
        size = (0.35 + age * 0.12) * (1 - end * 0.6),
        hover = 0.9 + 0.65 * clamp(g.pullT / 0.25, 0, 1);
      this.cores().y(g.tx, hover, g.ty, 0, size);
      this.field(g.tx, g.ty, g.r || world.stats.gadgetR * 1.7, age, 0, 1 - end * 0.7);
      // A raised accretion disk surrounds the suspended core, independent of the ground's pull footprint.
      const p = this.fields();
      p.col(
        p.yr(g.tx, hover, g.ty, r.time * 0.15, 1.7 * (1 - end * 0.6), 1, 1.7 * (1 - end * 0.6), 0.23, 0.14),
        age,
        2,
        1.1,
      );
      if (Math.random() < dt * 28 * (1 - end)) {
        const a = Math.random() * TAU,
          d = (g.r || 5) * (0.5 + Math.random() * 0.4),
          speed = d / 0.6;
        r.emit(
          g.tx + Math.cos(a) * d,
          0.2,
          g.ty + Math.sin(a) * d,
          -Math.cos(a) * speed,
          0.7,
          -Math.sin(a) * speed,
          0.6,
          0.065,
          GOLD,
          { spark: true, drag: 0 },
        );
      }
    }
    if (world.implode) {
      const g = world.implode,
        k = clamp(g.t / COLLAPSE_TIME, 0, 1);
      this.field(g.x, g.y, g.r * 1.4, k, 1, 0.7);
      this.cores().y(g.x, 1.7, g.y, 0, 0.12 + k * 0.18);
    }
  }
}
