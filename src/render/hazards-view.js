import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  AdditiveBlending,
  NormalBlending,
  MeshBasicMaterial,
  OctahedronGeometry,
  ShaderMaterial,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
} from "three";
import { dustRibbonGeometry } from "./strata-geometry.js";
import { worldMaterial } from "./world-material.js";
import { meshPart, mergeParts, box } from "./models.js";
import { clamp, TAU, makeRng } from "../core/util.js";

const WHITE = new Color(0xffffff),
  SAND = new Color(0xd8c8a8), // 3.53.0: the Flats' dust
  SAND_DEEP = new Color(0x9a8a5e),
  // 3.49.0: the Ashfall Caldera's fumaroles spray molten rock; their idle breath is ash smoke
  PYRO = new Color(0xffa843),
  PYRO_HOT = new Color(0xffe9b0),
  ASH_PUFF = new Color(0x4e463e),
  ASH_HOT = new Color(0x6a5c50),
  ARC = new Color(0x8fd0ff),
  ARC_WHITE = new Color(0xdff2ff),
  ICE_SHARD = new Color(0xffffff),
  ACID = new Color(0x8fd43a),
  ACID_LITE = new Color(0xc8f06a),
  COAT = new Color(0x4de8ff),
  PORTAL_A = new Color(0xff4dd8),
  PORTAL_B = new Color(0x7f7fff);

/* ---------- surfaces: one shader per kind on a flat disc (radius 1), the instance colour carries its state ----------
   instance colour: r the level (heat, brightness or fade), g a seed (0..1), b a switch (acid: 1 = Acid Coating, portal:
   1 = the blue end) */
const SURF_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vP;
varying vec3 vI;
void main() {
  #ifdef FIRE
  vP = vec2(atan(position.z, position.x) / 6.2831853 + 0.5, position.y);
  #else
  vP = position.xz;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vI = instanceColor;
  #else
  vI = vec3(1.0, 0.5, 0.0);
  #endif
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SURF_LIB = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vP;
varying vec3 vI;
float engrave(float d,float w) {
  float aa=max(fwidth(d),.002);
  return 1.0-smoothstep(w-aa*.5,w+aa*.5,abs(d));
}
`;
const polished = (fill) => `
void main() {
  float r=length(vP), a=atan(vP.y,vP.x+1e-5);
  if(r>1.0) discard;
  float time=uTime, seed=vI.g*6.283;
  float strength=vI.r;
  float rim=engrave(r-.91,.016);
  float ticks=engrave(r-.85,.041)*smoothstep(.75,.99,cos(a*16.0+seed));
  float inner=1.0-smoothstep(.93,1.0,r);
  vec3 col=vec3(0.0);
  float alpha=inner;
  ${fill}
  gl_FragColor=vec4(col,clamp(alpha,0.0,1.0));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const SURF_FRAG = {
  molten: polished(`
    float ribs=engrave(sin(a*9.0+2.8*r-time*.89+seed),.089)*(1.0-r);
    float channel=engrave(r-(.21+.06*sin(time*2.3)),.019);
    vec3 fire=vec3(.91,.29,.075);
    col=mix(vec3(.083,.028,.019),fire,clamp(ribs*strength+channel*.55+rim*.65+ticks*.35,0.,1.));
    col+=vec3(.9,.69,.35)*engrave(r,.13)*strength*.7;
  `),
  ice: polished(`
    vec2 grid=vec2(vP.x+vP.y,vP.y-vP.x);
    float lines=engrave(sin(grid.x*12.0+seed),.065)+engrave(sin(grid.y*12.0),.065);
    float facets=pow(abs(cos(a*3.0+seed)),12.0)*inner;
    col=mix(vec3(.09,.17,.22),vec3(.65,.86,.88),min(.77,lines*.32+facets*.18+rim*.56+ticks*.43));
    alpha*=.88;
  `),
  acid: polished(`
    float rot=a+.28*sin(r*9.0-time*.8+seed);
    float veins=engrave(sin(rot*6.0+2.8*r),.18)*smoothstep(.12,.61,r);
    vec3 pigment=mix(vec3(.35,.44,.08),vec3(.09,.57,.45),clamp(vI.b,0.,1.));
    col=mix(vec3(.051,.092,.048),pigment,.3+veins*.42+rim*.17+ticks*.12);
    col+=vec3(.44,.57,.26)*engrave(sin(r*32.0-time*3.2),.14)*.13;
    alpha*=.79;
  `),
  portal: polished(`
    vec3 ribbon=mix(vec3(.63,.29,.62),vec3(.29,.52,.72),vI.b);
    float revolutions=engrave(cos(a*3.0+log(r+.09)*5.1+time*1.8),.19);
    float notch=engrave(r-.66,.011)*smoothstep(-.28,.62,cos(a*4.0-time*1.35));
    col=vec3(.011,.013,.027)+ribbon*(rim*.96+ticks*.46+notch*.68+revolutions*r*.33)*strength;
  `),
  dust: polished(`
    float ribbons=pow(.5+.5*sin(a*5.0+log(r+.09)*6.5-time*2.5+seed),6.0);
    float edge=1.0-smoothstep(.51,.98,r);
    col=mix(vec3(.29,.18,.112),vec3(.75,.54,.31),ribbons);
    alpha=edge*(ribbons*.71+.12)*strength;
  `),
  pyro: `
void main() {
  float h=vP.y;
  float lattice=pow(.5+.5*cos(vP.x*56.549-h*14.0+uTime*10.0),3.0);
  float pulse=.6+.4*cos(h*17.0-uTime*5.1);
  float fall=(1.0-smoothstep(.2,.99,h))*smoothstep(0.,.06,h);
  vec3 c=mix(vec3(.77,.11,.044),vec3(.96,.76,.41),h*.43+lattice*.46);
  gl_FragColor=vec4(c*vI.r*(.26+lattice*.74)*fall*pulse,1.0);
}`,
};
function surfaceMaterial(kind) {
  const fire = kind === "pyro";
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: (fire ? "#define FIRE\n" : "") + SURF_VERT,
    fragmentShader: SURF_LIB + SURF_FRAG[kind],
    fog: !fire,
    transparent: true,
    depthWrite: false,
    side: fire ? DoubleSide : FrontSide,
    blending: fire ? AdditiveBlending : NormalBlending,
  });
}

/* ---------- models (crater, collar, cover and bank are built for radius 1 and scaled with the hazard; the shards
   of the ice, the bubbles and the rune stones are placed one by one) ---------- */
const disc = () => {
  const geo = new CircleGeometry(1, 48);
  geo.rotateX(-Math.PI / 2);
  return geo;
};
// an open tube from y 0 to 1 (the fire pillar)
const tube = () => {
  const geo = new CylinderGeometry(0.62, 1, 1, 20, 6, true);
  geo.translate(0, 0.5, 0);
  return geo;
};
const fac = (color, r, p) => meshPart(new OctahedronGeometry(r), color, p);
const inscribed = (color, r, w, y, segments = 30) =>
  meshPart(new TorusGeometry(r, w, 5, segments), color, { y, rx: Math.PI / 2 });
const base = (color, r, height, y, segments = 12) =>
  meshPart(new CylinderGeometry(r * 0.91, r, height, segments), color, { y });

const MODELS = {
  nozzle: () => ({
    body: [
      inscribed(0x59382e, 0.91, 0.09, 0.055, 18),
      ...Array.from({ length: 9 }, (_, i) => {
        const a = (i * TAU) / 9;
        return fac(0xb2734e, 0.15, {
          x: Math.cos(a) * 0.91,
          z: Math.sin(a) * 0.91,
          y: 0.073,
          ry: -a,
          sx: 0.8,
          sy: 0.45,
          sz: 1.62,
        });
      }),
    ],
    glow: [inscribed(0xe88447, 0.81, 0.018, 0.079, 18)],
  }),
  dome: () => ({
    glow: [
      meshPart(new IcosahedronGeometry(0.91, 1), 0xdf7049, { y: 0.26, sy: 0.36 }),
      meshPart(new IcosahedronGeometry(0.62, 1), 0xffbf83, { y: 0.44, sy: 0.58 }),
    ],
  }),
  collar: () => ({
    body: [
      base(0x3c5855, 1.05, 0.086, 0.043),
      base(0x243130, 0.87, 0.047, 0.09),
      inscribed(0xb68a60, 0.91, 0.023, 0.12, 18),
    ],
    glow: [inscribed(0x92d2bc, 0.79, 0.044, 0.084, 18)],
  }),
  cover: () => ({
    body: [
      base(0x536c66, 0.81, 0.071, 0.043, 8),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * TAU) / 8;
        return fac(0xb8946b, 0.21, {
          x: Math.cos(a) * 0.54,
          z: Math.sin(a) * 0.54,
          y: 0.093,
          ry: -a,
          sx: 1.2,
          sy: 0.13,
          sz: 0.45,
        });
      }),
    ],
    glow: [inscribed(0xa0dbcb, 0.44, 0.016, 0.105, 24), fac(0xe3ded2, 0.11, { y: 0.12, sy: 0.19 })],
  }),
  bolt: () => ({ glow: [box(0xffffff, 1, 0.84, 0.84)] }),
  shard: () => ({
    body: [
      fac(0xc9e0eb, 0.85, { y: 0.48, sy: 0.63, sz: 0.66, rz: -0.17 }),
      fac(0x8097b7, 0.72, { x: 0.22, y: 0.32, sy: 0.41, sx: 0.49, ry: 0.34 }),
    ],
  }),
  funnel: () => ({
    body: [meshPart(dustRibbonGeometry(0.16), 0x946e53), meshPart(dustRibbonGeometry(Math.PI * 0.85), 0xcdac7e)],
    glow: [meshPart(dustRibbonGeometry(Math.PI * 1.46), 0xe6c7a0)],
  }),
  bank: () => ({
    body: Array.from({ length: 10 }, (_, i) => {
      const a = (i * TAU) / 10;
      return fac(i % 3 ? 0x526745 : 0x7d9363, 0.19, {
        x: Math.cos(a) * 1.08,
        z: Math.sin(a) * 1.08,
        y: 0.034,
        ry: -a,
        sy: 0.26,
        sz: 1.45,
      });
    }),
  }),
  bubble: () => ({ glow: [fac(0xffffff, 1, { sy: 0.83 })] }),
  stone: () => ({
    body: [base(0x403857, 0.15, 0.24, -0.06, 5), fac(0x675582, 0.18, { y: 0.06, sy: 1.58 })],
    glow: [fac(0xffffff, 0.076, { y: 0.16, z: 0.11, sz: 0.29, sy: 1.43 })],
  }),
};
// the shards on the rim of an ice sheet of radius rr: where they stand, how big, how far they lean (from its seed)
function shardsOf(rr, seed) {
  const rng = makeRng(Math.floor(seed * 1e9)),
    count = Math.max(5, Math.round(rr * 1.8)),
    start = rng.range(0, TAU),
    out = [];
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * TAU + rng.range(-0.22, 0.22),
      d = rr * rng.range(0.86, 0.99),
      w = rng.range(0.12, 0.22);
    out.push({
      dx: Math.cos(a) * d,
      dz: Math.sin(a) * d,
      a,
      w,
      h: rng.range(0.15, 0.4) * (i % 4 === 0 ? 1.5 : 1),
      lean: rng.range(0.15, 0.5),
      tone: [1, 0.86, 0.74][i % 3],
    });
  }
  return out;
}

// a stable number 0..1 for a hazard at (x, y): the same sheet keeps its look while it exists
const seedOf = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const MAX = { surf: 24, part: 24, bolt: 120, bubble: 64, stone: 64 };

class HazardView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.mats = [];
    this.list = [];
  }
  // the pools of a model (body: Lambert with vertex colours, glow: unlit, its brightness from the instance colour)
  get(name, max = MAX.part) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      mk = (parts, glow) => {
        const pool = new this.Pool(
          mergeParts(parts.flat()),
          glow
            ? new MeshBasicMaterial({
                toneMapped: false,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                opacity: name === "funnel" ? 0.16 : 1,
                side: name === "funnel" ? DoubleSide : FrontSide,
              })
            : worldMaterial({
                color: 0xffffff,
                vertexColors: true,
                surface: name === "funnel" ? "dust" : "stone",
                transparent: name === "funnel",
                opacity: name === "funnel" ? 0.42 : 1,
                depthWrite: name !== "funnel",
                side: name === "funnel" ? DoubleSide : FrontSide,
              }),
          max,
        );
        pool.mesh.renderOrder = glow ? 2 : 1;
        this.add(pool);
        return pool;
      };
    set = this.pl[name] = { body: m.body ? mk(m.body, false) : null, glow: m.glow ? mk(m.glow, true) : null };
    return set;
  }
  // the pool of a surface shader
  surf(kind, max = MAX.surf) {
    let pool = this.pl["s:" + kind];
    if (pool) return pool;
    const mat = surfaceMaterial(kind);
    pool = this.pl["s:" + kind] = new this.Pool(kind === "pyro" ? tube() : disc(), mat, max);
    pool.mesh.renderOrder = kind === "pyro" ? 4 : 1;
    this.mats.push(mat);
    this.add(pool);
    return pool;
  }
  add(pool) {
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
  }
  // a surface instance: level, seed, switch
  put(pool, x, y, z, rot, radius, level, seed, flag = 0, height = 1) {
    const idx = pool.y(x, y, z, rot, radius, height, radius);
    if (idx >= 0) pool.col(idx, level, seed, flag);
    return idx;
  }
  update(dt, world) {
    const r = this.r,
      arena = world.arena;
    for (const mat of this.mats) mat.uniforms.uTime.value = r.time;
    const quality = Math.min(1, r.maxParticles / 1400);
    if (arena.vents.length) {
      if (arena.biome.id === "city") this.manholes(dt, world, quality);
      else this.vents(dt, world, quality);
    }
    if (arena.ice.length) this.ice(dt, world, quality);
    if (arena.acid.length) this.acid(dt, world, quality);
    if (arena.portals.length) this.portals(dt, world, quality);
    if (arena.devils && arena.devils.length) this.devils(dt, world, quality);
  }
  // The Glass Flats: dust devils - the disc swirls, the funnel turns, dust kicks off it as it wanders
  devils(dt, world, quality) {
    const r = this.r,
      time = r.time,
      funnel = this.get("funnel"),
      dust = this.surf("dust", 24);
    for (const devil of world.arena.devils) {
      const x = devil.x,
        z = devil.y,
        rr = devil.r,
        seed = devil.ph;
      funnel.body.y(x, 0, z, time * (3.4 + devil.spd), rr, 1, rr);
      funnel.glow.colC(funnel.glow.y(x, 0.4, z, -time * 2.2, rr * 0.62, 1, rr * 0.62), WHITE, 0.45);
      this.put(dust, x, 0.045, z, time * 1.3 + seed, rr, 0.9, seed);
      if (Math.random() < dt * 24 * quality)
        r.emit(
          x + (Math.random() - 0.5) * rr * 1.7,
          0.1 + Math.random() * 1.5,
          z + (Math.random() - 0.5) * rr * 1.7,
          (Math.random() - 0.5) * 2.4,
          1.6 + Math.random() * 2.6,
          (Math.random() - 0.5) * 2.4,
          0.8,
          0.24,
          Math.random() < 0.5 ? SAND : SAND_DEEP,
          { drag: 1.4, grow: 0.8 },
        );
    }
  }
  // the state of a vent: idle, warn (k 0..1 how far) or erupt
  ventState(world, vent) {
    const state = world.state === "fight" ? world.arena.ventState(vent, world.waveT) : "idle",
      cycle = (world.waveT + vent.phase) % vent.period;
    return { state, k: state === "warn" ? clamp((cycle - (vent.period - 2.7)) / 1.2, 0, 1) : 0 };
  }
  // the warning ring at the edge of a vent: it lights up while the vent warns and stays bright while it erupts;
  // an idle vent shows its edge with its model
  ring(x, z, radius, col, alpha) {
    const r = this.r,
      idx = r.ringPool.y(x, 0.08, z, 0, radius);
    r.ringPool.colC(idx, col, alpha);
  }
  vents(dt, world, quality) {
    const r = this.r,
      time = r.time,
      // 3.49.0: the Caldera's nozzles sit on basalt, their molten heart burns white, the jet is magma
      spray = PYRO,
      sprayHot = PYRO_HOT,
      crater = this.get("nozzle"),
      lava = this.surf("molten"),
      fire = this.surf("pyro", 32);
    for (const vent of world.arena.vents) {
      const { state, k } = this.ventState(world, vent),
        x = vent.x,
        z = vent.y,
        rr = vent.r,
        seed = seedOf(x, z),
        rot = seed * TAU,
        erupt = state === "erupt",
        heat = erupt ? 1.6 : 0.25 + 0.08 * Math.sin(time * 1.3 + seed * 9) + k * (0.9 + 0.15 * Math.sin(time * 30));
      crater.body.y(x, 0, z, rot, rr, 1, rr);
      crater.glow.colC(crater.glow.y(x, 0, z, rot, rr, 1, rr), WHITE, 0.14 + heat * 0.42);
      this.put(lava, x, 0.045, z, rot, rr, heat, seed);
      if (state === "warn") {
        // the lava swells into a dome that trembles before it bursts
        const dome = this.get("dome");
        const s = rr * (0.08 + 0.12 * k) * (1 + Math.sin(time * 24) * 0.05 * k);
        dome.glow.colC(dome.glow.y(x, 0.03, z, 0, s, 0.08 + 0.14 * k, s), WHITE, 0.55 + 0.45 * k);
        this.ring(x, z, rr, spray, 0.35 + k * 0.6);
        if (Math.random() < dt * (4 + 18 * k) * quality)
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.15,
            z + (Math.random() - 0.5) * rr,
            0,
            1.5 + k * 2.5,
            0,
            0.45,
            0.22,
            Math.random() < 0.5 ? ASH_PUFF : ASH_HOT,
            { drag: 1, grav: 3 },
          );
      } else if (erupt) {
        // a pillar of fire, a hotter core inside it, and lava thrown up around it
        const lick = 1 + Math.sin(time * 17 + seed * 7) * 0.06;
        this.put(fire, x, 0.02, z, time * 0.8, rr * 0.82, 0.55, seed, 0, 3.4 * lick);
        this.put(fire, x, 0.02, z, -time * 1.1, rr * 0.45, 0.6, seed, 0, 4.3 / lick);
        const glow = r.sprites.bb(x, 0.6, z, rr * 2.6, r.B);
        r.sprites.colC(glow, spray, 0.3);
        this.ring(x, z, rr, sprayHot, 0.6);
        if (Math.random() < dt * 40 * quality)
          r.emit(
            x + (Math.random() - 0.5) * rr * 1.2,
            0.4,
            z + (Math.random() - 0.5) * rr * 1.2,
            (Math.random() - 0.5) * 3,
            5 + Math.random() * 5,
            (Math.random() - 0.5) * 3,
            0.7,
            0.35,
            Math.random() < 0.4 ? sprayHot : spray,
            { drag: 1.2, grav: 7, grow: 0.5 },
          );
      } else {
        if (Math.random() < dt * 1.2 * rr * quality)
          r.emit(x + (Math.random() - 0.5) * rr, 0.1, z + (Math.random() - 0.5) * rr, 0, 0.8, 0, 0.6, 0.16, ASH_PUFF, {
            drag: 1,
          });
      }
    }
  }
  // Blackout City: live manholes
  manholes(dt, world, quality) {
    const r = this.r,
      time = r.time,
      collar = this.get("collar"),
      cover = this.get("cover"),
      bolt = this.get("bolt", MAX.bolt).glow;
    for (const vent of world.arena.vents) {
      const { state, k } = this.ventState(world, vent),
        x = vent.x,
        z = vent.y,
        rr = vent.r,
        seed = seedOf(x, z),
        rot = seed * TAU,
        sc = Math.min(rr * 0.95, 0.92);
      // the cover rattles while the current builds and jumps when it arcs
      let lift = 0,
        tilt = 0,
        roll = 0,
        light = 0.12 + 0.05 * Math.sin(time * 2 + seed * 9);
      if (state === "warn") {
        const shake = k > 0.3 ? (Math.random() - 0.5) * 0.05 * k : 0;
        lift = Math.max(0, shake);
        tilt = shake * 0.5;
        light = 0.2 + k * 0.8 * (0.4 + 0.6 * Math.random());
      } else if (state === "erupt") {
        lift = 0.1 + Math.random() * 0.12;
        tilt = (Math.random() - 0.5) * 0.16;
        roll = (Math.random() - 0.5) * 0.16;
        light = 1.1 + 0.5 * Math.random();
      }
      collar.body.y(x, 0, z, rot, sc, 1, sc);
      collar.glow.colC(collar.glow.y(x, 0, z, rot, sc, 1, sc), WHITE, light * (state === "idle" ? 0.4 : 1));
      cover.body.yr(x, lift, z, rot, sc, 1, sc, tilt, roll);
      cover.glow.colC(cover.glow.yr(x, lift, z, rot, sc, 1, sc, tilt, roll), WHITE, light);
      if (state === "erupt") {
        // three jagged bolts out of the hole, each a chain of short segments that jumps every few frames
        const step = Math.floor(time * 30);
        for (let b = 0; b < 3; b++) {
          let px = x + Math.cos(b * 2.1 + seed * 6) * rr * 0.3,
            pz = z + Math.sin(b * 2.1 + seed * 6) * rr * 0.3,
            py = 0.08;
          const h = 1.6 + 1.6 * jitter(step, b, 0, seed),
            n = 5;
          for (let i = 0; i < n; i++) {
            const nx = px + (jitter(step, b, i + 1, seed) - 0.5) * 0.7,
              nz = pz + (jitter(step, b, i + 11, seed) - 0.5) * 0.7,
              ny = py + h / n;
            seg(bolt, px, py, pz, nx, ny, nz, 0.05, i === 0 && b === 0 ? WHITE : ARC_WHITE, 0.8 + 0.4 * Math.random());
            px = nx;
            py = ny;
            pz = nz;
          }
        }
        this.ring(x, z, rr, ARC, 0.6);
        if (Math.random() < dt * 30 * quality)
          r.emit(
            x + (Math.random() - 0.5) * rr * 1.4,
            0.3,
            z + (Math.random() - 0.5) * rr * 1.4,
            (Math.random() - 0.5) * 2,
            4 + Math.random() * 4,
            (Math.random() - 0.5) * 2,
            0.25,
            0.16,
            ARC,
            { drag: 1, spark: true },
          );
      } else if (state === "warn") {
        this.ring(x, z, rr, ARC, 0.3 + 0.45 * k);
        if (Math.random() < dt * 18 * quality)
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.1,
            z + (Math.random() - 0.5) * rr,
            0,
            2.5 + k * 3,
            0,
            0.2,
            0.14,
            ARC_WHITE,
            {
              drag: 1,
              spark: true,
            },
          );
      }
    }
  }
  ice(dt, world, quality) {
    const r = this.r,
      sheet = this.surf("ice"),
      shard = this.get("shard", 160).body;
    if (this.iceOf !== world.arena) {
      this.iceOf = world.arena;
      this.shards = new Map();
    }
    for (const patch of world.arena.ice) {
      const x = patch.x,
        z = patch.y,
        rr = patch.r,
        seed = seedOf(x, z),
        key = x + ":" + z + ":" + rr;
      this.put(sheet, x, 0.03, z, seed * TAU, rr * 1.1, 1, seed);
      let list = this.shards.get(key);
      if (!list) this.shards.set(key, (list = shardsOf(rr, seed)));
      for (const s of list)
        shard.colC(shard.yr(x + s.dx, -0.02, z + s.dz, s.a, s.w, s.h, s.w, -s.lean, 0), ICE_SHARD, s.tone * 0.7);
      if (Math.random() < dt * 2 * rr * quality) {
        const a = Math.random() * TAU,
          d = Math.random() * rr;
        r.emit(x + Math.cos(a) * d, 0.08, z + Math.sin(a) * d, 0, 0.3, 0, 0.5, 0.16, WHITE, { spark: true, drag: 0 });
      }
    }
  }
  acid(dt, world, quality) {
    const r = this.r,
      time = r.time,
      pool = this.surf("acid"),
      bubbles = this.get("bubble", MAX.bubble).glow;
    let bank = null;
    for (const puddle of world.arena.acid) {
      const x = puddle.x,
        z = puddle.y,
        fade = puddle.life != null ? Math.min(1, puddle.life / 1.2) : 1,
        rr = puddle.r * (0.75 + 0.25 * fade),
        seed = seedOf(x, z),
        rot = seed * TAU,
        coat = !!puddle.mine;
      const permanent = puddle.life == null && !coat;
      this.put(pool, x, 0.035, z, rot, rr * (permanent ? 1.18 : 1), fade, seed, coat ? 1 : 0);
      // only the pools of the map have a bank; the splashes of traps, bosses and the Acid Coating come and go
      if (permanent) {
        bank = bank || this.get("bank");
        bank.body.y(x, 0, z, rot, rr, 1, rr);
      }
      const col = coat ? COAT : ACID_LITE;
      if (!permanent) r.ringPool.colC(r.ringPool.y(x, 0.045, z, 0, rr), coat ? COAT : ACID, (coat ? 0.3 : 0.12) * fade);
      // three bubbles rise and pop at their own pace
      for (let i = 0; i < 3; i++) {
        const f = (time * (0.45 + 0.1 * i) + seed * 5 + i / 3) % 1,
          a = seed * 40 + i * 2.4 + Math.floor(time * (0.45 + 0.1 * i) + seed * 5 + i / 3) * 1.7,
          d = rr * (0.2 + 0.5 * ((i * 0.37 + seed) % 1)),
          s = (0.04 + 0.07 * f) * fade;
        bubbles.colC(
          bubbles.y(x + Math.cos(a) * d, 0.04 + f * 0.12, z + Math.sin(a) * d, 0, s, s * 0.8, s),
          col,
          0.18 + 0.22 * f,
        );
        if (f > 0.97 && Math.random() < 0.5 * quality)
          r.emit(x + Math.cos(a) * d, 0.12, z + Math.sin(a) * d, 0, 0.9, 0, 0.35, 0.12, col, { drag: 1 });
      }
    }
  }
  portals(dt, world, quality) {
    const r = this.r,
      time = r.time,
      swirl = this.surf("portal"),
      stone = this.get("stone", MAX.stone);
    for (const portal of world.arena.portals)
      for (const [px, pz, color, blue] of [
        [portal.ax, portal.ay, PORTAL_A, 0],
        [portal.bx, portal.by, PORTAL_B, 1],
      ]) {
        const seed = seedOf(px, pz);
        this.put(swirl, px, 0.05, pz, 0, 1.05, 1, seed, blue);
        // five rune stones float around the mouth, each bobbing at its own pace and turning its rune outward
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU + time * (blue ? -0.35 : 0.35) + seed * TAU,
            sx = px + Math.cos(a) * 1.45,
            sz = pz + Math.sin(a) * 1.45,
            sy = 0.55 + Math.sin(time * 1.6 + i * 1.9 + seed * 9) * 0.12;
          stone.body.y(sx, sy, sz, a + Math.PI / 2, 1);
          stone.glow.colC(stone.glow.y(sx, sy, sz, a + Math.PI / 2, 1), color, 0.7 + 0.3 * Math.sin(time * 3 + i));
        }
        if (Math.random() < dt * 14 * quality) {
          const angle = Math.random() * TAU;
          r.emit(
            px + Math.cos(angle),
            0.2,
            pz + Math.sin(angle),
            -Math.cos(angle) * 1.6,
            0.8,
            -Math.sin(angle) * 1.6,
            0.5,
            0.22,
            color,
            { drag: 0 },
          );
        }
      }
    // 2.5.0 C: Rift Storm (Shattered Core): the spots the portals jump to glow ahead of the jump (a shrinking ring in the
    // portal colour and a faint line from the old spot)
    for (const portal of world.arena.portals) {
      const next = portal.next;
      if (!next) continue;
      const k = clamp((portal.moveIn || 0) / 1.6, 0, 1),
        blink = 0.45 + (Math.floor(time * 10) % 2) * 0.35;
      for (const [x, y, ox, oy, col] of [
        [next.ax, next.ay, portal.ax, portal.ay, PORTAL_A],
        [next.bx, next.by, portal.bx, portal.by, PORTAL_B],
      ]) {
        r.ringPool.colC(r.ringPool.y(x, 0.06, y, time * 3, 1.05 + k * 1.3), col, blink);
        r.ringPool.colC(r.ringPool.y(x, 0.05, y, -time * 2, 0.6), col, 0.5);
        r.discs.colC(r.discs.y(x, 0.03, y, 0, 1.05), col, 0.12 + (1 - k) * 0.2);
        r.beams.colC(r.beams.seg(ox, oy, x, y, 0.08, 0.05, 0.05), col, 0.18 + (1 - k) * 0.2);
      }
    }
  }
}
// a repeatable random number for the arcs: the same frame step, bolt and joint give the same kink
function jitter(step, bolt, joint, seed) {
  const s = Math.sin(step * 91.7 + bolt * 47.3 + joint * 13.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
// one straight piece of an arc from (x0, y0, z0) to (x1, y1, z1)
function seg(pool, x0, y0, z0, x1, y1, z1, width, color, alpha) {
  const dx = x1 - x0,
    dy = y1 - y0,
    dz = z1 - z0,
    flat = Math.hypot(dx, dz),
    len = Math.hypot(flat, dy);
  if (len < 1e-4) return;
  const idx = pool.yr(
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
    Math.atan2(dz, dx),
    len + width * 0.5,
    width,
    width,
    Math.atan2(dy, flat),
    0,
  );
  pool.colC(idx, color, alpha);
}
export { HazardView, SURF_VERT, SURF_LIB };
