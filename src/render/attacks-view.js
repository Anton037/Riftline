import { worldMaterial } from "./world-material.js";
import { attackSurface, BOSS_EFFECTS, ENEMY_EFFECTS } from "../data/combat-effects.js";
import {
  CircleGeometry,
  Color,
  LinearFilter,
  NoBlending,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  CylinderGeometry,
  MeshBasicMaterial,
  OctahedronGeometry,
  ShaderMaterial,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
} from "three";
import { meshPart, mergeParts } from "./models.js";
import { SURF_VERT, SURF_LIB } from "./hazards-view.js";
import { clamp, TAU } from "../core/util.js";

const WHITE = new Color(0xffffff),
  LAVA = new Color(0xff6a1f),
  LAVA_HOT = new Color(0xffd27a),
  ICE = new Color(0xbff0ff),
  // 3.50.0: the Glowmarsh's bloom
  ACID = new Color(0x3ee8ac),
  ACID_LITE = new Color(0xbaffdc),
  RIFT = new Color(0xb070ff),
  RIFT_PINK = new Color(0xff4dd8),
  FIRE = new Color(0xff8a2a),
  FIRE_HOT = new Color(0xffd27a),
  SMOKE = new Color(0x4a4440),
  SHOT = {
    orb: new Color(0xff3f7f),
    bolt: new Color(0xff8063),
    fast: new Color(0xff2e2a),
    turret: new Color(0xff3a5a),
    drone: new Color(0xff4f9a),
    weaver: new Color(0xd04dff),
    carrier: new Color(0xff5a6a),
    ...Object.fromEntries(Object.values(BOSS_EFFECTS).map((effect) => [effect.projectile, new Color(effect.color)])),
  },
  SIREN_BLUE = new Color(0x3d7bff),
  // 3.34.0: the current of a Shorted enemy (the cold blue-white of Blackout City's live manholes)
  ARC = new Color(0x8fd0ff),
  // 3.33.0: the shot of a Frost enemy (it slows the drone it hits) glows icy, not in its maker's colour
  FROST_SHOT = new Color(0x8fe8ff),
  RIFT_RIM_SHOT = new Color(0x7ae8ff);

// the dust of each biome (stomps and cracks throw it), the index of its marks in the shader
const DUST = {
    city: new Color(0x6a7280),
    shelf: new Color(0xdff6ff),
    marsh: new Color(0x2f3830),
    core: new Color(0x5a3a90),
    // 3.49.0: the Ashfall Caldera: warm ash dust
    caldera: new Color(0x7a6c5e),
    // 3.53.0: the Glass Flats: pale sand
    flats: new Color(0xd8c8a8),
  },
  BIOME_INDEX = { city: 0, shelf: 2, marsh: 3, core: 4, caldera: 5, flats: 6 };

/* the look of a zone (index into the zone shader) */
const Z = { crack: 0, lavaCrack: 1, molten: 2, frost: 3, acid: 4, rift: 5, target: 6, burn: 7, glass: 8 };
/* the marks on the floor (index into the mark shader) and how long each stays */
const M = { burn: 0, crack: 1, molten: 2, frost: 3, slime: 4, rift: 5 },
  MARK_LIFE = [7, 6, 8, 5, 6, 5];

/* which look a zone has: by its kind, and where the kind is shared (rain, mortar, stomp) by who made it, else by the
   biome; 3.32.0: a zone that chills (a Frost mortar's shell) is frost whatever its kind */
function lookOf(kind, src, biome, chill) {
  return Z[attackSurface(kind, src, biome, chill)];
}

/* ---------- shaders: a disc of radius 1; instance colour r the level (zone: how far the warning is, mark: how much
   is left), g a seed, b the look (index / 8) ---------- */
const ELEMENT = `
vec3 pigment(int i) {
  if(i==1 || i==2 || i==7) return vec3(.94,.25,.073);
  if(i==3) return vec3(.46,.81,.89);
  if(i==4) return vec3(.42,.71,.26);
  if(i==5) return vec3(.62,.33,.81);
  if(i==8) return vec3(.94,.66,.24);
  return vec3(.93,.43,.24);
}
`;
const ZONE_FRAG = `
uniform vec3 uWarn;
${ELEMENT}
void main() {
  float r=length(vP), a=atan(vP.y,vP.x+1e-5), k=vI.r;
  if(r>1.0) discard;
  int look=int(vI.b*8.0+.5);
  float progress=engrave(r-mix(.20,.87,k),.013);
  float divisions=engrave(r-.80,.041)*smoothstep(.88,.995,cos(a*(look==6 ? 8.0 : 16.0)));
  float edges=engrave(r-.928,.012);
  float ink=engrave(r-.933,.043);
  float rays=pow(abs(cos(a*float(4+look))),16.0);
  float inner=engrave(abs(vP.x)+abs(vP.y)-.32,.019);
  float circuits=engrave(sin(r*22.0-a*4.0+vI.g*6.28),.10)*rays*(1.0-r);
  vec3 color=mix(pigment(look),uWarn,.20);
  vec3 tone=mix(color, vec3(.042,.019,.024),ink*.91);
  tone=mix(tone,vec3(1.0,.86,.68),clamp(edges+divisions*.52+inner*.37,0.,1.));
  float alpha=max((.15+.23*k)*(1.-r*.32),max(ink*.94,progress*.71));
  alpha=max(alpha,divisions*.75+inner*.53+circuits*.63);
  gl_FragColor=vec4(tone,alpha*(1.0-smoothstep(.974,1.0,r)));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;
const MARK_FRAG = `
uniform float uBiome;
${ELEMENT}
void main() {
  float r=length(vP), a=atan(vP.y,vP.x+1e-5), seed=vI.g*6.28;
  int look=int(vI.b*8.0+.5);
  float edge=.78+cos(a*6.0+seed+sin(a*13.0)*.22)*.10;
  if(r>edge) discard;
  int element=look==0 ? int(uBiome+.5) : look==1 ? 0 : look+1;
  vec3 color=pigment(element);
  float wear=pow(.5+.5*sin(a*9.0+seed+sin(r*29.0)*.9),7.0)*(1.0-r);
  float echo=engrave(sin(r*26.0+a*4.0+seed),.09)*wear;
  float alpha=(.37+wear*.34)*(1.0-smoothstep(edge-.12,edge,r));
  vec3 tone=mix(color*.1,color*.78,clamp(echo*.68*vI.r+wear*.27,0.,1.));
  gl_FragColor=vec4(tone,alpha);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/* 3.10.0: the marks are many and stay for seconds, so they are not drawn with MARK_FRAG on every pixel: each look (and
   the burnt mark of the biome) is painted once into an atlas, fresh and cooled, in two variants (bakeMarks), and a mark
   is two lookups that blend from fresh to cooled as it ages. Cells: (look * 2 + variant) * 2 + cooled, 6 x 4 of them,
   each a disc of radius 0.98 around (col * 2 - 5, row * 2 - 3) in the bake scene. */
const ATLAS = { cols: 6, rows: 4, cell: 128 };
const MARK_DRAW_FRAG = `
uniform sampler2D uAtlas;
vec2 cellUV(float cell, vec2 p) {
  float col = mod(cell, 6.0), row = floor(cell / 6.0);
  vec2 w = vec2(col * 2.0 - 5.0, row * 2.0 - 3.0) + p * 0.98;
  return vec2((w.x + 6.0) / 12.0, (4.0 - w.y) / 8.0);
}
void main() {
  if (length(vP) > 1.0) discard;
  float f = vI.r, look = floor(vI.b * 8.0 + 0.5), base = (look * 2.0 + step(0.5, vI.g)) * 2.0;
  vec4 c = mix(texture2D(uAtlas, cellUV(base + 1.0, vP)), texture2D(uAtlas, cellUV(base, vP)), smoothstep(0.3, 1.0, f));
  if (c.a < 0.004) discard;
  gl_FragColor = vec4(c.rgb, c.a * smoothstep(0.0, 0.25, f));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;
function shaderMaterial(frag, uniforms) {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }, uniforms]),
    vertexShader: SURF_VERT,
    fragmentShader: SURF_LIB + frag,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}
const disc = () => {
  const geo = new CircleGeometry(1, 48);
  geo.rotateX(-Math.PI / 2);
  return geo;
};

/* ---------- models (world units) ---------- */
const fac = (c, r, p) => meshPart(new OctahedronGeometry(r), c, p);
const ring = (c, r, w, p, n = 16) => meshPart(new TorusGeometry(r, w, 5, n), c, p);
const ringT = (r, y) => ring(0xffffff, r, 0.021, { y, rx: Math.PI / 2 });
const BASALT = 0x423237,
  PORCELAIN = 0xd2b995,
  COPPER = 0xb96f50;
const MODELS = {
  mine: () => ({
    body: [
      meshPart(new CylinderGeometry(0.25, 0.36, 0.09, 6), BASALT, { y: 0.052 }),
      fac(COPPER, 0.29, { y: 0.125, sy: 0.53 }),
      ring(PORCELAIN, 0.24, 0.026, { y: 0.147, rx: Math.PI / 2 }),
    ],
    glow: [fac(0xffffff, 0.084, { y: 0.278, sy: 0.63 }), ringT(0.224, 0.148)],
  }),
  charge: () => ({
    body: [
      fac(COPPER, 0.29, { y: 0.12, sx: 1.38, sy: 0.53, sz: 0.82 }),
      ring(PORCELAIN, 0.17, 0.037, { y: 0.16, rx: Math.PI / 2 }),
      ...[-1, 1].map((z) => fac(BASALT, 0.14, { z: z * 0.17, y: 0.083, sx: 1.24, sy: 0.57 })),
    ],
    glow: [fac(0xffffff, 0.065, { y: 0.303, sy: 0.68 })],
  }),
  shell: () => ({
    body: [
      fac(PORCELAIN, 0.27, { x: 0.087, sx: 1.7, sy: 0.61, sz: 0.61 }),
      fac(COPPER, 0.22, { x: -0.16, sx: 0.93, sy: 0.39, sz: 0.96 }),
      ring(BASALT, 0.118, 0.027, { x: -0.06, ry: Math.PI / 2 }),
    ],
    glow: [ring(0xffffff, 0.13, 0.02, { x: 0.09, ry: Math.PI / 2 })],
  }),
  spike: () => ({
    body: [
      fac(0xbadee9, 0.7, { y: 0.51, sx: 0.8, sy: 0.72, sz: 0.66, rz: -0.3 }),
      fac(0x829db2, 0.6, { x: 0.22, y: 0.33, sy: 0.5, sx: 0.63, rz: 0.34 }),
    ],
  }),
  crystal: () => ({
    body: [
      fac(0xabc9df, 1, { sx: 1.65, sy: 0.6, sz: 0.73, rx: 0.36 }),
      fac(0x829fb7, 0.65, { x: -0.66, z: 0.14, sx: 1.07, sy: 0.56, sz: 0.73, ry: 0.26 }),
    ],
    glow: [fac(0xffffff, 0.63, { x: 0.61, y: 0.07, sx: 1.5, sy: 0.31, sz: 0.46 })],
  }),
  cinder: () => ({
    body: [
      fac(BASALT, 1, { sx: 1.42, sy: 0.76, sz: 0.86, rz: 0.27 }),
      fac(COPPER, 0.78, { x: 0.2, sx: 1.36, sy: 0.95, sz: 0.94 }),
    ],
    glow: [
      ring(0xffffff, 0.56, 0.06, { x: 0.49, ry: Math.PI / 2 }, 12),
      fac(0xffffff, 0.56, { x: 0.93, sy: 0.42, sz: 0.58 }),
    ],
  }),
  glasshot: () => ({
    body: [
      fac(0xd8b673, 1, { sx: 2.1, sy: 0.39, sz: 0.54, rx: 0.42 }),
      fac(PORCELAIN, 0.54, { x: -0.64, z: 0.31, sx: 1.52, sy: 0.22, ry: -0.27 }),
    ],
    glow: [fac(0xffffff, 0.75, { x: 0.9, sx: 1.56, sy: 0.16, sz: 0.19 })],
  }),
  weavershot: () => ({
    glow: [
      ring(0xffffff, 0.55, 0.057, { ry: Math.PI / 2, rx: 0.5 }, 10),
      fac(0xffffff, 0.39, { x: 0.33, sx: 1.19, sy: 0.54 }),
    ],
  }),
  pod: () => ({
    body: [
      fac(0x779585, 1, { sx: 1.16, sy: 0.72, sz: 0.73 }),
      ...[-1, 1].map((s) =>
        fac(PORCELAIN, 0.62, { x: -0.49, z: s * 0.62, sx: 1.28, sy: 0.35, sz: 0.59, ry: s * 0.31 }),
      ),
    ],
    glow: [fac(0xffffff, 0.35, { x: 0.84, sx: 1.47, sy: 0.48 })],
  }),
  dart: () => ({
    glow: [
      fac(0xffffff, 0.86, { sx: 1.28, sy: 0.36, sz: 0.41 }),
      fac(0xffffff, 0.49, { x: -0.4, sx: 1.25, sy: 0.17, sz: 0.98 }),
    ],
  }),
  slug: () => ({
    body: [fac(BASALT, 0.74, { sx: 1.36, sy: 0.68, sz: 0.72 })],
    glow: [
      ring(0xffffff, 0.43, 0.057, { ry: Math.PI / 2 }, 12),
      fac(0xffffff, 0.54, { x: 0.61, sx: 1.15, sy: 0.56, sz: 0.56 }),
    ],
  }),
  spore: () => ({
    body: [fac(0x5b7951, 0.88, { sx: 1.27, sy: 0.72, sz: 0.86 })],
    glow: Array.from({ length: 5 }, (_, i) => {
      const a = (i * TAU) / 5;
      return fac(0xffffff, 0.24, { x: Math.cos(a) * 0.55, z: Math.sin(a) * 0.55, y: 0.21, ry: a, sy: 1.44 });
    }),
  }),
  ringshot: () => ({
    glow: [
      ring(0xffffff, 0.75, 0.13, { rx: 0.34 }, 8),
      ring(0xffffff, 0.41, 0.039, { ry: 0.3 }, 12),
      fac(0xffffff, 0.19, {}),
    ],
  }),
};
const MAX = {
  zone: 64,
  mark: 90,
  mine: 24,
  charge: 16,
  shell: 24,
  spike: 160,
  crystal: 360,
  dart: 360,
  slug: 360,
  spore: 360,
  ringshot: 360,
  cinder: 360,
  glasshot: 900,
  weavershot: 360,
  pod: 360,
};

class AttackView {
  constructor(r, Pool) {
    this.r = r;
    this.Pool = Pool;
    this.pl = {};
    this.list = [];
    this.mats = [];
    this.marks = [];
    this.spikes = [];
    this.pillars = [];
    this.zoneMat = null;
    this.markMat = null;
    // a stable seed per zone, so its cracks and its frost keep their shape while it warns
    this.seeds = new WeakMap();
  }
  add(pool, order) {
    pool.mesh.renderOrder = order;
    this.r.scene.add(pool.mesh);
    this.list.push(pool);
    return pool;
  }
  // Model pools keep physical painted bodies separate from the unlit combat glow.
  get(name) {
    let set = this.pl[name];
    if (set) return set;
    const m = MODELS[name](),
      max = MAX[name],
      mk = (parts, glow) =>
        this.add(
          new this.Pool(
            mergeParts(parts.flat()),
            glow
              ? new MeshBasicMaterial({ toneMapped: false, vertexColors: true })
              : worldMaterial({
                  surface:
                    {
                      spore: "organic",
                      pod: "organic",
                      spike: "ice",
                      crystal: "ice",
                      cinder: "basalt",
                      glasshot: "crystal",
                    }[name] || "metal",
                  vertexColors: true,
                  flatShading: true,
                }),
            max,
          ),
          glow ? 5 : 3,
        );
    set = this.pl[name] = { body: m.body ? mk(m.body, false) : null, glow: m.glow ? mk(m.glow, true) : null };
    return set;
  }
  zones() {
    if (!this.pl.zone) {
      this.zoneMat = shaderMaterial(ZONE_FRAG, { uWarn: { value: new Color() } });
      this.mats.push(this.zoneMat);
      this.pl.zone = this.add(new this.Pool(disc(), this.zoneMat, MAX.zone), 2);
    }
    return this.pl.zone;
  }
  markPool() {
    if (!this.pl.mark) {
      this.atlas = new WebGLRenderTarget(ATLAS.cols * ATLAS.cell, ATLAS.rows * ATLAS.cell, { depthBuffer: false });
      this.atlas.texture.colorSpace = SRGBColorSpace;
      this.atlas.texture.generateMipmaps = false;
      this.atlas.texture.minFilter = LinearFilter;
      // (a render target's texture cannot go through the merge of the uniforms: it is set afterwards)
      this.markMat = shaderMaterial(MARK_DRAW_FRAG, { uAtlas: { value: null } });
      this.markMat.uniforms.uAtlas.value = this.atlas.texture;
      this.mats.push(this.markMat);
      this.pl.mark = this.add(new this.Pool(disc(), this.markMat, MAX.mark), 0);
    }
    return this.pl.mark;
  }
  /* paint every look of a mark into the atlas, with the burnt mark of the biome (index into BIOME_INDEX) */
  bakeMarks(biome) {
    const gl = this.r.renderer;
    if (!gl || !this.atlas) return;
    // 3.31.1: the painting scene is built once and kept: only the biome uniform changes, so a new biome compiles no
    // shader (the material was built and disposed for every bake, a compile at the first blast in a new biome)
    if (!this.bake) {
      const mat = shaderMaterial(MARK_FRAG, { uBiome: { value: 0 } }),
        pool = new this.Pool(disc(), mat, ATLAS.cols * ATLAS.rows),
        scene = new Scene(),
        cam = new OrthographicCamera(-6, 6, 4, -4, 0.1, 20);
      mat.blending = NoBlending;
      mat.transparent = false;
      mat.fog = false;
      scene.add(pool.mesh);
      pool.begin();
      for (let cell = 0; cell < ATLAS.cols * ATLAS.rows; cell++) {
        const look = cell >> 2,
          variant = (cell >> 1) & 1,
          cooled = cell & 1,
          col = cell % ATLAS.cols,
          row = Math.floor(cell / ATLAS.cols);
        if (look > M.rift) break;
        const idx = pool.y(col * 2 - 5, 0, row * 2 - 3, 0, 0.98);
        pool.col(idx, cooled ? 0.3 : 1, variant ? 0.75 : 0.25, look / 8);
      }
      pool.end();
      cam.position.set(0, 10, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      this.bake = { mat, scene, cam };
    }
    const { mat, scene, cam } = this.bake,
      clear = new Color(),
      alpha = gl.getClearAlpha(),
      target = gl.getRenderTarget();
    mat.uniforms.uBiome.value = biome;
    gl.getClearColor(clear);
    try {
      gl.setRenderTarget(this.atlas);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.render(scene, cam);
    } finally {
      gl.setRenderTarget(target);
      gl.setClearColor(clear, alpha);
    }
    this.baked = biome;
  }
  /* a mark on the floor (M.burn and so on); the oldest goes when there are too many */
  mark(x, z, radius, look = M.burn) {
    if (this.marks.length >= MAX.mark - 4) this.marks.shift();
    const life = MARK_LIFE[look] || 6;
    this.marks.push({ x, z, r: radius, look, life, max: life, a: Math.random() * TAU, seed: Math.random() });
  }
  biomeId() {
    return (this.r.biome && this.r.biome.id) || "city";
  }
  update(dt, world) {
    const r = this.r,
      time = r.time;
    // a new biome starts clean: the marks of the last one stay behind
    const biome = this.biomeId();
    if (biome !== this.lastBiome) {
      this.lastBiome = biome;
      this.marks.length = 0;
      this.spikes.length = 0;
      this.pillars.length = 0;
      // 3.31.1: the marks of the new biome are painted now (behind the biome card), not at its first blast
      if (world) {
        this.markPool();
        const index = BIOME_INDEX[biome] ?? 0;
        if (this.baked !== index) this.bakeMarks(index);
      }
    }
    for (const mat of this.mats) mat.uniforms.uTime.value = time;
    this.quality = Math.min(1, r.maxParticles / 1400);
    this.drawMarks(dt);
    this.drawZones(dt, world);
    this.drawSpikes(dt);
    this.drawPillars(dt);
  }
  drawMarks(dt) {
    if (!this.marks.length) return;
    const pool = this.markPool(),
      biome = BIOME_INDEX[this.biomeId()] ?? 0;
    if (this.baked !== biome) this.bakeMarks(biome);
    let keep = 0;
    for (const mk of this.marks) {
      mk.life -= dt;
      if (mk.life <= 0) continue;
      this.marks[keep++] = mk;
      const idx = pool.y(mk.x, 0.016 + (keep % 4) * 0.001, mk.z, mk.a, mk.r);
      if (idx >= 0) pool.col(idx, mk.life / mk.max, mk.seed, mk.look / 8);
    }
    this.marks.length = keep;
  }
  /* the zones of world.hazards while they warn: the ring at the edge, the ring that fills, the surface of the look,
     the models of mines and charges, the mortar shell or basalt cinder in flight */
  drawZones(dt, world) {
    const r = this.r,
      time = r.time,
      warn = r.warnColor,
      biome = world.arena ? world.arena.biome.id : this.biomeId();
    if (!world.hazards.length) return;
    const pool = this.zones();
    this.zoneMat.uniforms.uWarn.value.copy(warn);
    for (const hazard of world.hazards) {
      if (hazard.done) continue;
      const k = clamp(hazard.t / hazard.delay, 0, 1),
        x = hazard.x,
        z = hazard.y,
        rr = hazard.r,
        look = lookOf(hazard.kind, hazard.src, biome, hazard.chill);
      let seed = this.seeds.get(hazard);
      if (seed == null) this.seeds.set(hazard, (seed = Math.random()));
      // a soft dark pool under it keeps the warning readable on a pale floor (the Aurora Shelf)
      r.shadows.y(x, 0.03, z, 0, rr * 2.4);
      const idx = pool.y(x, 0.045, z, 0, rr);
      if (idx >= 0) pool.col(idx, k, seed, look / 8);
      const ring = r.ringPool.y(x, 0.05, z, 0, rr);
      r.ringPool.colC(ring, warn, 0.7 + 0.2 * k);
      const fill = r.ringPool.y(x, 0.048, z, 0, Math.max(0.05, rr * k));
      r.ringPool.colC(fill, warn, 0.3);
      this.zoneDetail(hazard, look, k, seed, dt, time, biome);
    }
  }
  zoneDetail(hazard, look, k, seed, dt, time, biome) {
    const r = this.r,
      x = hazard.x,
      z = hazard.y,
      rr = hazard.r,
      q = this.quality,
      chance = (rate) => Math.random() < dt * rate * q;
    // models: the mine and the charge pop out and blink faster and faster
    if (hazard.kind === "mine" || hazard.kind === "sapper") {
      const P = this.get(hazard.kind === "mine" ? "mine" : "charge"),
        pop = clamp(hazard.t / 0.12, 0, 1),
        s = 0.4 + 0.6 * pop + (k > 0.85 ? Math.sin(time * 60) * 0.04 : 0),
        yaw = seed * TAU;
      P.body.y(x, 0, z, yaw, s);
      const led = P.glow.y(x, 0, z, yaw, s),
        blink = Math.sin(time * (8 + 50 * k * k)) > 0 ? 1.4 : 0.25;
      P.glow.colC(led, r.warnColor, blink);
    }
    if (hazard.sx != null) {
      const hx = hazard.sx + (x - hazard.sx) * k,
        hz = hazard.sy + (z - hazard.sy) * k,
        hy = 0.8 + Math.sin(Math.PI * k) * 7,
        dist = Math.hypot(x - hazard.sx, z - hazard.sy) || 1,
        pitch = Math.atan2(7 * Math.PI * Math.cos(Math.PI * k), dist),
        yaw = Math.atan2(z - hazard.sy, x - hazard.sx);
      r.shadows.y(hx, 0.025, hz, 0, 0.9 * (0.4 + 0.6 * k));
      if (hazard.src === "tyrant") {
        const P = this.get("cinder"),
          size = 0.36;
        P.body.col(P.body.yr(hx, hy, hz, yaw, size, size, size, pitch, time * 4), 1, 1, 1);
        P.glow.colC(P.glow.yr(hx, hy, hz, yaw, size, size, size, pitch, time * 4), FIRE_HOT, 1.35);
        if (chance(10)) r.emit(hx, hy, hz, 0, 0.3, 0, 0.4, 0.1, FIRE_HOT, { grav: 3, spark: true });
      } else {
        // 3.32.0: a Frost mortar's shell glows icy and trails frost mist instead of smoke
        const P = this.get("shell"),
          cold = hazard.chill;
        P.body.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8);
        P.glow.colC(P.glow.yr(hx, hy, hz, yaw, 1.2, 1.2, 1.2, pitch, time * 8), cold ? ICE : FIRE, cold ? 1.4 : 1);
        if (Math.random() < 0.5)
          r.emit(hx, hy, hz, 0, cold ? -0.2 : 0.3, 0, 0.45, cold ? 0.3 : 0.4, cold ? ICE : SMOKE, {
            drag: 1,
            grow: 1.4,
          });
      }
    }
    // 3.34.0: a Shorted enemy's spot: jagged arcs flicker across it, more and brighter as it is about to strike
    if (hazard.kind === "shorted") {
      const b = r.beams;
      if (chance(10 + 40 * k))
        for (let j = 0; j < 1 + Math.round(2 * k); j++) {
          let a = Math.random() * TAU,
            d = rr * Math.random() * 0.3,
            px = x + Math.cos(a) * d,
            pz = z + Math.sin(a) * d;
          for (let i = 0; i < 4; i++) {
            a += (Math.random() - 0.5) * 1.6;
            const step = rr * (0.18 + Math.random() * 0.12),
              qx = px + Math.cos(a) * step,
              qz = pz + Math.sin(a) * step;
            b.colC(b.seg(px, pz, qx, qz, 0.12, 0.05, 0.05), Math.random() < 0.4 ? WHITE : ARC, 0.6 + 0.4 * k);
            px = qx;
            pz = qz;
          }
        }
      if (chance(6 + 20 * k))
        r.emit(x + (Math.random() - 0.5) * rr, 0.15, z + (Math.random() - 0.5) * rr, 0, 1.6, 0, 0.25, 0.1, ARC, {
          spark: true,
          drag: 2,
        });
    }
    switch (look) {
      case Z.glass: {
        const P = this.get("glasshot");
        for (let i = 0; i < 6; i++) {
          const a = seed * TAU + (i * TAU) / 6,
            d = rr * (0.28 + 0.07 * (i % 3)),
            s = (0.08 + k * 0.14) * rr;
          P.body.col(
            P.body.yr(x + Math.cos(a) * d, 0.03 + k * 0.12, z + Math.sin(a) * d, a, s, s, s, 0.55 + k * 0.45, 0),
            1,
            1,
            1,
          );
        }
        if (chance(10 * k)) r.emit(x, 0.12, z, 0, 0.5, 0, 0.35, 0.08, SHOT.glass, { spark: true, drag: 2 });
        break;
      }
      case Z.lavaCrack:
      case Z.molten:
        if (chance(6 + 30 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.1,
            z + (Math.random() - 0.5) * rr,
            0,
            1 + 2.5 * k,
            0,
            0.6,
            0.16,
            Math.random() < 0.5 ? LAVA : FIRE_HOT,
            { drag: 1, spark: true },
          );
        break;
      case Z.crack:
        // dust trembles out of the cracks near the end
        if (k > 0.5 && chance(20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * k;
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.8, 0, 0.5, 0.25, DUST[biome] || DUST.city, {
            drag: 2,
            grow: 1,
          });
        }
        break;
      case Z.frost:
        if (chance(12 + 20 * k)) {
          const a = Math.random() * TAU,
            d = rr * (1 - k * Math.random());
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 0.4, 0, 0.7, 0.14, WHITE, {
            spark: true,
            drag: 0,
          });
        }
        break;
      case Z.acid:
        if (chance(8 + 20 * k)) {
          const a = Math.random() * TAU,
            d = Math.random() * rr * (0.2 + 0.8 * k);
          r.emit(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, 1 + k, 0, 0.5, 0.16, ACID_LITE, { drag: 2 });
        }
        break;
      case Z.rift:
        // motes fall into the tear
        if (chance(18 * k + 4)) {
          const a = Math.random() * TAU,
            d = rr * (0.8 + Math.random() * 0.3),
            life = 0.5;
          r.emit(
            x + Math.cos(a) * d,
            0.2 + Math.random() * 0.6,
            z + Math.sin(a) * d,
            (-Math.cos(a) * d) / life,
            0,
            (-Math.sin(a) * d) / life,
            life,
            0.18,
            Math.random() < 0.3 ? RIFT_PINK : RIFT,
            { drag: 0 },
          );
        }
        break;
      case Z.burn:
        if (chance(8 + 14 * k))
          r.emit(
            x + (Math.random() - 0.5) * rr,
            0.15,
            z + (Math.random() - 0.5) * rr,
            0,
            1.4,
            0,
            0.45,
            0.25,
            Math.random() < 0.5 ? FIRE : FIRE_HOT,
            { drag: 1, grow: 0.6 },
          );
        break;
    }
  }
  /* ice spikes that burst out of the floor and shatter */
  spikeBurst(x, z, radius) {
    const n = Math.round(clamp(radius * 4, 6, 18)),
      list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.4,
        d = radius * (i % 3 === 0 ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35);
      list.push({
        dx: Math.cos(a) * d,
        dz: Math.sin(a) * d,
        a,
        h: (0.8 + Math.random() * 0.9) * Math.min(1.6, 0.55 + radius * 0.3),
        w: 0.12 + Math.random() * 0.1,
        lean: 0.15 + Math.random() * 0.35,
        delay: Math.random() * 0.06,
      });
    }
    if (this.spikes.length > 12) this.spikes.shift();
    this.spikes.push({ x, z, t: 0, list, shat: false });
  }
  drawSpikes(dt) {
    if (!this.spikes.length) return;
    const P = this.get("spike");
    let keep = 0;
    for (const burst of this.spikes) {
      burst.t += dt;
      if (burst.t > 1.1) continue;
      this.spikes[keep++] = burst;
      if (!burst.shat && burst.t > 0.5) {
        burst.shat = true;
        this.r.debrisBurst(burst.x, burst.z, 0.6, 10, ICE, 0.12, 5);
        this.r.burst(burst.x, burst.z, 0.6, 12, 5, WHITE, 0.45, 0.18, { spark: true, drag: 3 });
      }
      for (const s of burst.list) {
        const t = burst.t - s.delay;
        let h = 0;
        if (t < 0) continue;
        if (t < 0.08) h = t / 0.08;
        else if (t < 0.5) h = 1 - 0.1 * ((t - 0.08) / 0.42);
        else h = Math.max(0, 0.9 * (1 - (t - 0.5) / 0.4));
        if (h <= 0.01) continue;
        P.body.yr(burst.x + s.dx, 0, burst.z + s.dz, s.a, s.w, s.h * h, s.w, -s.lean, 0);
      }
    }
    this.spikes.length = keep;
  }
  /* a short pillar of fire or a bolt of light */
  pillar(x, z, w, h, color, life) {
    if (this.pillars.length > 40) this.pillars.shift();
    this.pillars.push({ x, z, w, h, col: color, t: 0, life });
  }
  drawPillars(dt) {
    let keep = 0;
    const r = this.r;
    for (const p of this.pillars) {
      p.t += dt;
      if (p.t >= p.life) continue;
      this.pillars[keep++] = p;
      const f = p.t / p.life,
        h = p.h * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.4 + 0.1)), 0.6);
      r.columns.colC(
        r.columns.y(p.x, 0, p.z, 0, p.w * (1 - f * 0.5), Math.max(0.05, h), p.w * (1 - f * 0.5)),
        p.col,
        1 - f,
      );
    }
    this.pillars.length = keep;
  }
  /* the blast of an attack zone (the "boom" event of its kind); false: not an attack of enemies or bosses */
  impact(ev, world, shakeK) {
    const r = this.r,
      x = ev.x,
      z = ev.y,
      rr = ev.r,
      biome = world && world.arena ? world.arena.biome.id : this.biomeId(),
      dust = DUST[biome] || DUST.city,
      kind = ev.kind,
      look = kind === "bomber" ? Z.target : lookOf(kind, ev.src, biome, ev.chill);
    if (
      ![
        "stomp",
        "drill",
        "rain",
        "mortar",
        "frost",
        "glacier",
        "mine",
        "sapper",
        "fire",
        "volatile",
        "bomber",
        "shorted",
      ].includes(kind)
    )
      return false;
    const shake = (amount) => r.addShake(amount * shakeK);
    if (kind === "shorted") {
      // 3.34.0: the arc of a Shorted enemy's spot: a burst of white and blue sparks, a cold flash, a scorched crack
      r.burst(x, z, 0.3, 22, 6, WHITE, 0.3, 0.26, { up: 6, spark: true, drag: 1 });
      r.burst(x, z, 0.3, 12, 3.5, ARC, 0.45, 0.3, { up: 3, spark: true });
      r.ring(x, z, rr * 0.3, rr * 1.3, ARC, 0.28);
      r.flash(x, z, rr * 2.6, 1.3, ARC, 4);
      this.mark(x, z, rr * 0.9, M.burn);
      shake(0.08);
      return true;
    }
    switch (look) {
      case Z.glass:
        r.burst(x, z, 0.2, Math.round(10 + rr * 4), 3 + rr, DUST.flats, 0.55, 0.2, { up: 2, drag: 3 });
        r.burst(x, z, 0.4, Math.round(9 + rr * 3), 4 + rr, SHOT.glass, 0.4, 0.11, { up: 4, grav: 8, spark: true });
        r.debrisBurst(x, z, 0.25, Math.round(5 + rr * 2), SHOT.glass, 0.1, 4 + rr);
        r.ring(x, z, 0.2, rr * 1.1, SHOT.glass, 0.3);
        r.flash(x, z, rr * 1.5, 0.7, SHOT.glass, 5);
        this.mark(x, z, rr * 0.9, M.crack);
        shake(0.18);
        break;
      case Z.crack:
      case Z.lavaCrack: {
        // the ground breaks: a white shockwave, dust thrown along the floor, lumps of it in the air
        r.ring(x, z, rr * 0.3, rr * 1.1, WHITE, 0.3);
        r.ring(x, z, rr * 0.2, rr * 1.4, dust, 0.5, 0.1);
        const n = Math.round(clamp(rr * 7, 8, 28));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.random() * 0.3,
            s = 3 + rr * 2.2;
          r.emit(
            x + Math.cos(a) * rr * 0.4,
            0.25,
            z + Math.sin(a) * rr * 0.4,
            Math.cos(a) * s,
            0.6,
            Math.sin(a) * s,
            0.6,
            0.45,
            dust,
            {
              drag: 3,
              grow: 1.6,
            },
          );
        }
        r.debrisBurst(x, z, 0.3, Math.round(clamp(rr * 3, 4, 14)), dust.clone().multiplyScalar(0.6), 0.16, 4 + rr);
        if (look === Z.lavaCrack) {
          r.burst(x, z, 0.3, Math.round(8 + rr * 4), 4 + rr, LAVA_HOT, 0.6, 0.2, {
            up: 6,
            grav: 9,
            spark: true,
            drag: 1,
          });
          r.flash(x, z, rr * 2, 1.1, LAVA, 4);
        } else r.flash(x, z, rr * 1.4, 0.6, r.warnColor, 6);
        this.mark(x, z, rr * 1.1, M.crack);
        shake(kind === "drill" ? 0.1 : 0.25);
        break;
      }
      case Z.molten: {
        // a pillar of fire, lava thrown up, and molten rock that cools
        this.pillar(x, z, rr * 0.45, 2.5 + rr * 1.6, LAVA, 0.5);
        r.burst(x, z, 0.3, Math.round(10 + rr * 6), 3 + rr * 1.5, LAVA, 0.8, 0.45, { up: 7, grav: 9, drag: 1.5 });
        r.burst(x, z, 0.3, 8, 3, LAVA_HOT, 0.5, 0.3, { up: 9, spark: true });
        r.ring(x, z, rr * 0.3, rr * 1.2, LAVA, 0.35);
        r.flash(x, z, rr * 2.6, 1.2, LAVA, 3.5);
        this.mark(x, z, rr * 0.95, M.molten);
        shake(kind === "mortar" ? 0.2 : 0.12);
        break;
      }
      case Z.frost: {
        // ice spikes burst up and shatter; frost stays for a moment
        this.spikeBurst(x, z, rr);
        r.ring(x, z, rr * 0.3, rr * 1.15, ICE, 0.4);
        r.burst(x, z, 0.3, Math.round(10 + rr * 4), rr * 2, WHITE, 0.6, 0.22, { spark: true, up: 3 });
        r.flash(x, z, rr * 1.8, 0.9, ICE, 4);
        this.mark(x, z, rr * 1.05, M.frost);
        shake(0.1);
        break;
      }
      case Z.acid: {
        // a splash of acid: drops thrown up that fall back, the pool of the plague stays (world.arena.acid)
        r.burst(x, z, 0.3, Math.round(14 + rr * 6), 2.5 + rr, ACID, 0.8, 0.35, { up: 6, grav: 12, drag: 1 });
        r.burst(x, z, 0.3, 8, 2, ACID_LITE, 0.5, 0.2, { up: 4, spark: true, grav: 8 });
        r.ring(x, z, rr * 0.3, rr * 1.15, ACID, 0.35);
        r.flash(x, z, rr * 1.8, 0.8, ACID, 4);
        this.mark(x, z, rr * 0.9, M.slime);
        shake(0.12);
        break;
      }
      case Z.rift: {
        // a bolt of light out of the sky into the tear
        this.pillar(x, z, rr * 0.22, 11, RIFT, 0.35);
        this.pillar(x, z, rr * 0.1, 12, WHITE, 0.2);
        r.burst(x, z, 0.4, Math.round(12 + rr * 5), 4 + rr * 2, RIFT, 0.5, 0.35, { spark: true });
        r.burst(x, z, 0.4, 6, 3, RIFT_PINK, 0.5, 0.3, { up: 5 });
        r.ring(x, z, rr * 0.2, rr * 1.2, RIFT, 0.35);
        r.flash(x, z, rr * 2.4, 1.3, RIFT, 3.5);
        this.mark(x, z, rr * 0.9, M.rift);
        shake(0.2);
        break;
      }
      case Z.burn: {
        const vol = kind === "volatile";
        r.burst(x, z, 0.3, vol ? 22 : 8, vol ? rr * 3 : 2.5, vol ? FIRE : FIRE_HOT, 0.5, vol ? 0.5 : 0.35, {
          up: 3,
          grow: 0.8,
        });
        if (vol) {
          r.ring(x, z, rr * 0.3, rr * 1.1, FIRE, 0.3);
          r.burst(x, z, 0.4, 10, 7, WHITE, 0.3, 0.2, { spark: true, drag: 4 });
        }
        r.flash(x, z, rr * 1.8, vol ? 1.1 : 0.6, FIRE, 5);
        this.mark(x, z, rr * (vol ? 0.8 : 0.6), M.burn);
        shake(vol ? 0.12 : 0.04);
        break;
      }
      default: {
        // an explosion: a fireball, sparks, smoke that rises, lumps, a burnt mark of the place
        r.burst(x, z, 0.5, Math.round(8 + rr * 5), rr * 4, FIRE, 0.45, 0.5 + rr * 0.12);
        r.burst(x, z, 0.5, 8, rr * 5, FIRE_HOT, 0.3, 0.2, { spark: true, drag: 4 });
        r.emit(x, 0.6, z, 0, 0, 0, 0.15, rr * 2.2, FIRE_HOT, { drag: 0 });
        for (let i = 0; i < 4; i++)
          r.emit(x + (Math.random() - 0.5) * rr, 0.6, z + (Math.random() - 0.5) * rr, 0, 1.2, 0, 1, rr * 0.6, SMOKE, {
            drag: 1,
            grow: 1.5,
          });
        r.debrisBurst(x, z, 0.3, 5, dust.clone().multiplyScalar(0.5), 0.12, 5);
        r.ring(x, z, rr * 0.3, rr, FIRE, 0.3);
        r.flash(x, z, rr * 1.6, 1.1, FIRE, 4.5);
        this.mark(x, z, rr * 0.75, M.burn);
        shake(kind === "mortar" ? 0.25 : 0.1);
      }
    }
    return true;
  }
  /* the shots of enemies and bosses, each kind with a shape of its own */
  shots(world, dt = 1 / 60) {
    const r = this.r,
      time = r.time,
      basis = r.B;
    for (const shot of world.eb) {
      if (shot.life <= 0) continue;
      const launch = BOSS_EFFECTS[shot.src]?.height || ENEMY_EFFECTS[shot.src]?.height || 0.85,
        h = 1.05 + (launch - 1.05) * Math.exp(-shot.age * 6);
      const kind = shot.kind,
        color = shot.frost ? FROST_SHOT : SHOT[kind] || SHOT.orb,
        angle = Math.atan2(shot.vy, shot.vx),
        ca = Math.cos(angle),
        sa = Math.sin(angle),
        chance = (rate) => Math.random() < dt * rate;
      r.shadows.y(shot.x, 0.035, shot.y, 0, Math.max(0.45, shot.r * 3.5));
      let halo = 3.8,
        light = 0.38;
      switch (kind) {
        case "bolt":
        case "fast":
        case "turret": {
          const heavy = kind === "turret",
            len = shot.r * (kind === "fast" ? 6 : heavy ? 3.8 : 3);
          r.ebCore.col(r.ebCore.y(shot.x, h, shot.y, angle, len, shot.r * 0.5, shot.r * 0.5), 1, 0.8, 0.72);
          r.beams.colC(
            r.beams.seg(shot.x - ca * len, shot.y - sa * len, shot.x, shot.y, h, heavy ? 0.08 : 0.035, 0.04),
            color,
            0.8,
          );
          if (heavy && chance(7)) r.emit(shot.x, h, shot.y, 0, 0.3, 0, 0.16, 0.09, color, { spark: true, drag: 5 });
          break;
        }
        case "shard": {
          const P = this.get("crystal"),
            s = shot.r * 1.4,
            roll = time * 5 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), ICE, 0.9);
          break;
        }
        case "weaver": {
          const P = this.get("weavershot"),
            s = shot.r * 1.3;
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, time * 8), color, 1.1);
          halo = 3;
          break;
        }
        case "drone": {
          const P = this.get("dart"),
            s = shot.r * 1.2;
          P.glow.colC(P.glow.y(shot.x, h, shot.y, angle, s, s, s), color, 0.85);
          break;
        }
        case "carrier": {
          const P = this.get("pod"),
            s = shot.r * 1.3;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, Math.sin(time * 5 + shot.x) * 0.2), 1, 1, 1);
          P.glow.colC(P.glow.y(shot.x, h, shot.y, angle, s), color, 1);
          if (chance(6))
            r.emit(shot.x - ca * 0.3, h - 0.08, shot.y - sa * 0.3, 0, -0.2, 0, 0.3, 0.12, color, { grav: 2 });
          break;
        }
        case "cinder": {
          const P = this.get("cinder"),
            s = shot.r * 1.4,
            roll = time * 3 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), FIRE_HOT, 1.35);
          if (chance(8))
            r.emit(shot.x - ca * 0.25, h - 0.04, shot.y - sa * 0.25, 0, 0.35, 0, 0.4, 0.08, FIRE_HOT, {
              grav: 3,
              spark: true,
            });
          halo = 3.8;
          light = 0.42;
          break;
        }
        case "siren": {
          const P = this.get("slug"),
            blue = Math.sin(time * 18 + (shot.x + shot.y) * 0.7) > 0,
            col = blue ? SIREN_BLUE : color,
            s = shot.r * 0.9;
          P.body.y(shot.x, h, shot.y, angle, s);
          P.glow.colC(P.glow.y(shot.x, h, shot.y, angle, s), col, 0.95);
          r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * 3.8, basis), col, 0.45);
          continue;
        }
        case "spore": {
          const P = this.get("spore"),
            s = shot.r * 1.2,
            roll = time * 2 + shot.x;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), color, 0.85);
          if (chance(5)) r.emit(shot.x, h - 0.08, shot.y, 0, -0.3, 0, 0.45, 0.1, ACID_LITE, { grav: 3, drag: 1 });
          break;
        }
        case "riftorb": {
          const P = this.get("ringshot"),
            s = shot.r * 0.95;
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle + Math.PI / 2, s, s, s, 0, time * 7 + shot.x), color, 0.9);
          r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * 2.5, basis), RIFT_RIM_SHOT, 0.3);
          break;
        }
        case "glass": {
          const P = this.get("glasshot"),
            s = shot.r * 1.2,
            roll = Math.sin(time * 4 + shot.x) * 0.15;
          P.body.col(P.body.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), 1, 1, 1);
          P.glow.colC(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, roll), color, 1.1);
          if (chance(6))
            r.emit(shot.x - ca * 0.3, h, shot.y - sa * 0.3, 0, 0, 0, 0.18, 0.07, color, { spark: true, drag: 0 });
          halo = 3;
          light = 0.3;
          break;
        }
        default:
          r.ebCore.colC(r.ebCore.y(shot.x, h, shot.y, 0, shot.r * 0.8), color, 1);
      }
      if (shot.frost && kind !== "shard") {
        const P = this.get("crystal"),
          s = shot.r * 1.05;
        P.glow.col(P.glow.yr(shot.x, h, shot.y, angle, s, s, s, 0, time * 9), 0.75, 0.95, 1.1);
        if (chance(7)) r.emit(shot.x, h, shot.y, 0, -0.2, 0, 0.3, 0.1, ICE, { drag: 2 });
      }
      r.sprites.colC(r.sprites.bb(shot.x, h, shot.y, shot.r * halo, basis), color, light);
    }
  }
}

export { AttackView, M as MARK_LOOK };
