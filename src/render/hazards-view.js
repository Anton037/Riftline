import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  FrontSide,
  AdditiveBlending,
  NormalBlending,
  MeshBasicMaterial,
  OctahedronGeometry,
  ShaderMaterial,
  SphereGeometry,
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
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / 0.875;
}
// x: distance to the nearest cell centre, y: distance to the cell border, z: cell id
vec3 voro(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + h22(n + g) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = h21(n + g); } else if (d < d2) { d2 = d; }
    }
  d1 = sqrt(d1);
  return vec3(d1, sqrt(d2) - d1, id);
}
`;
const SURF_FRAG = {
  // 3.49.0: the fumarole's molten heart: the pool where the jet stands (the Caldera's nozzles)
  // 3.54.0: the melt burns orange under a darker crust - the pool read as a pale cookie before
  molten: `
void main() {
  float r=length(vP), a=atan(vP.y,vP.x), seed=vI.g*41.0, heat=vI.r;
  float edge=.9+.055*vnoise(vec2(a*2.2+seed,seed));
  if(r>edge) discard;
  vec2 q=vP*4.6+seed;
  vec3 cell=voro(q+vec2(fbm(q*.5+uTime*.025),fbm(q*.5+7.0))*.5);
  float activity=clamp((heat-.15)*.8,0.0,1.0);
  float fissure=1.0-smoothstep(.012,.045+activity*.028,cell.y);
  vec3 basalt=mix(vec3(.022,.027,.032),vec3(.055,.055,.052),fbm(q*1.7));
  vec3 magma=mix(vec3(.44,.065,.004),vec3(1.0,.32,.025),activity);
  float throat=(1.0-smoothstep(.055,.15,r))*(.3+activity*.7);
  vec3 col=basalt*(.85+.2*cell.z)+magma*(fissure*(.2+activity*.65)+throat);
  col*=mix(.6,1.0,smoothstep(edge,edge-.12,r));
  gl_FragColor=vec4(col,1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  // Ice blends frost, cracks and glints into the surrounding terrain without a decorative rim.
  ice: `
void main() {
  float r = length(vP), seed = vI.g * 37.0;
  float edge = 0.90 + 0.10 * vnoise(vP * 2.2 + seed);
  if (r > edge) discard;
  vec2 q = vP * 3.4 + seed;
  vec3 v = voro(q);
  // fine cracks that branch (two scales), frost in streaks along one direction, a deeper blue towards the middle
  float crack = smoothstep(0.03, 0.0, v.y) * (0.45 + 0.55 * vnoise(q * 2.0));
  crack = max(crack, smoothstep(0.02, 0.0, voro(q * 2.3 + 5.0).y) * 0.5 * vnoise(q + 9.0));
  float frost = smoothstep(0.45, 0.9, fbm(vec2(q.x * 1.6 + q.y * 0.4, q.y * 0.5)));
  // 3.55.0: the Shelf's rinks read as night ice, not white discs - the deep blue keeps more of
  // the sheet, the frost wash and the rim lose a step (the 3.44.0 rest stays: enemies read)
  vec3 deep = vec3(0.035, 0.12, 0.2), clear = vec3(0.12, 0.28, 0.38);
  vec3 col = mix(deep, clear, smoothstep(0.0, edge, r) * 0.7 + 0.25 * v.z);
  col = mix(col, vec3(0.39, 0.57, 0.65), frost * 0.35);
  col += vec3(0.7, 0.88, 1.0) * crack * 0.18;
  vec2 gc = floor(vP * 9.0 + seed), gf = fract(vP * 9.0 + seed) - 0.5;
  float glint = step(0.93, h21(gc)) * smoothstep(0.12, 0.0, length(gf)) * (0.5 + 0.5 * sin(uTime * 1.5 + h21(gc + 3.0) * 30.0));
  col += vec3(glint * 0.42);
  col *= 0.8 + 0.35 * vI.r;
  gl_FragColor = vec4(col, clamp(0.40 + 0.12 * frost + 0.12 * crack + glint, 0.0, 0.72) * smoothstep(edge, edge-.14, r));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  // acid (the Glowmarsh's bloom water, 3.50.0): near-black water lit from inside - a mint glow that drifts with the
  // current, bubbles that rise and pop, foam at the edge (cyan stays the player's own Acid Coating);
  // instance r fades a pool that is drying up
  acid: `
void main() {
  float r = length(vP), seed = vI.g * 29.0;
  float edge = 0.90 + 0.10 * vnoise(vP * 2.4 + seed);
  if (r > edge) discard;
  vec2 q = vP * 2.4 + seed;
  vec3 deep = mix(vec3(0.002, 0.038, 0.032), vec3(0.02, 0.14, 0.18), vI.b);
  vec3 lite = mix(vec3(0.16, 0.48, 0.26), vec3(0.3, 0.88, 1.0), vI.b);
  float murk = fbm(q * 1.2 + vec2(uTime * 0.06, 0.0));
  // the glow IS the warning: the bloom water carries a mint light from inside, drifting with the current
  vec3 col = mix(deep, lite * 0.55, murk * 0.32);
  float ripple = 0.5 + 0.5 * sin(r * 17.0 - uTime * 2.2 + fbm(q + uTime * 0.2) * 6.0);
  col += lite * ripple * 0.06;
  vec2 bc = floor(q * 1.7), bf = fract(q * 1.7) - 0.5 - (h22(bc) - 0.5) * 0.4;
  float bt = fract(uTime * 0.55 + h21(bc) * 5.0);
  float bub = step(0.55, h21(bc + 2.0)) * smoothstep(0.035, 0.0, abs(length(bf) - bt * 0.3)) * (1.0 - bt);
  col += lite * bub * 0.75;
  float foam = smoothstep(edge - 0.15, edge - 0.02, r) * (0.55 + 0.45 * fbm(q * 3.0 + uTime * 0.3));
  col = mix(col, lite * 0.5 + 0.025, foam * 0.16);
  gl_FragColor = vec4(col, (0.84 + 0.14 * foam) * vI.r * smoothstep(edge, edge-.07, r));
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  // portal: spiral arms that turn into a dark core, a bright rim, its colour from instance b (magenta or blue end)
  portal: `
void main() {
  float r = length(vP), a = atan(vP.y, vP.x);
  if (r > 1.0) discard;
  vec3 hue = mix(vec3(1.0, 0.3, 0.85), vec3(0.5, 0.5, 1.0), vI.b);
  float arms = 0.5 + 0.5 * sin(a * 3.0 + r * 10.0 - uTime * 3.4);
  arms = smoothstep(0.35, 1.0, arms) * smoothstep(1.0, 0.25, r);
  float rim = smoothstep(0.8, 0.95, r) * smoothstep(1.0, 0.95, r);
  float core = smoothstep(0.32, 0.0, r);
  vec3 col = vec3(0.015, 0.0, 0.04) + hue * arms * (0.6 + 0.5 * fbm(vP * 3.0 + uTime * 0.5)) + hue * rim * 1.3;
  col += vec3(0.9, 0.85, 1.0) * core * 0.18 * (0.6 + 0.4 * sin(uTime * 5.0));
  col *= vI.r;
  gl_FragColor = vec4(col, smoothstep(1.0, 0.9, r) * 0.95);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  // fire: a pillar of flame on an open tube (x around, y up 0..1) that licks upward; instance r is its strength
  dust: `
void main() {
  float r = length(vP), a = atan(vP.y, vP.x), seed = vI.g * 41.0, level = vI.r;
  float edge = 0.8 + 0.2 * vnoise(vec2(a * 3.0 + seed, seed));
  if (r > edge) discard;
  // the spiral: arms that wind tighter as they rise, turning with the devil's own spin
  float spin = uTime * 1.3 + seed;
  vec2 q = vec2(cos(a + spin * (0.4 + r)), sin(a + spin * (0.4 + r))) * (r * 3.4 + 0.4) + seed;
  float arms = smoothstep(0.25, 0.75, vnoise(q) * 0.7 + vnoise(q * 2.3 + 7.0) * 0.45);
  float skirt = smoothstep(edge, edge * 0.35, r) * (0.35 + 0.65 * arms) * level;
  // 3.55.0: the skirt lifts to sunlit dust (the old dark brown read as oil stains on the glass)
  vec3 col = mix(vec3(0.55, 0.45, 0.28), vec3(0.8, 0.7, 0.48), arms * smoothstep(0.7, 0.15, r));
  col *= 0.8 + 0.2 * sin(uTime * 2.1 + seed);
  gl_FragColor = vec4(col, skirt);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`,
  // 3.49.0: the fumarole: the same pillar, white-hot at the core (the Caldera's jets)
  pyro: `
void main() {
  float h = vP.y;
  vec2 q = vec2(vP.x * 7.0, h * 2.4 - uTime * 3.4);
  float n = fbm(q) * 0.75 + fbm(q * 2.1 + 5.0) * 0.45;
  float body = n - h * 0.95 + 0.25;
  float flame = smoothstep(0.0, 0.32, body) * smoothstep(0.0, 0.08, h);
  vec3 col = mix(vec3(1.0, 0.5, 0.05), vec3(1.0, 0.88, 0.42), smoothstep(0.3, 0.8, body));
  gl_FragColor = vec4(col * flame * vI.r, 1.0);
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
const MODELS = {
  nozzle: () => {
    const rng = makeRng(0x1a7b),
      body = [],
      glow = [];
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * TAU + rng.range(-0.12, 0.12),
        d = rng.range(0.92, 1.02),
        size = rng.range(0.1, 0.19);
      body.push(
        meshPart(new DodecahedronGeometry(size), [0x59636b, 0x444c55, 0x70716a][i % 3], {
          x: Math.cos(a) * d,
          z: Math.sin(a) * d,
          y: size * 0.25,
          sx: 2.0,
          sy: 0.5,
          sz: 0.9,
          ry: -a + Math.PI / 2 + rng.range(-0.2, 0.2),
        }),
      );
      if (i % 4 === 0)
        glow.push(box(0xa84c1e, 0.1, 0.018, 0.018, { x: Math.cos(a) * 0.87, z: Math.sin(a) * 0.87, y: 0.04, ry: -a }));
    }
    return { body, glow };
  },
  // the dome of lava that swells while a vent warns (a half sphere)
  dome: () => {
    // yellow at the top, orange at the foot
    const part = meshPart(new SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), 0xffffff),
      pos = part.attributes.position,
      col = part.attributes.color,
      foot = new Color(0xff5a10),
      top = new Color(0xffd27a),
      c = new Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(foot).lerp(top, clamp(pos.getY(i), 0, 1));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    return { glow: [part] };
  },
  // live manhole: the concrete collar (the cover is its own part, it moves)
  collar: () => ({
    body: [
      meshPart(new CylinderGeometry(1.0, 1.06, 0.06, 24), 0x77838d, { y: 0.03 }),
      meshPart(new CylinderGeometry(0.85, 0.85, 0.064, 24), 0x0c0d10, { y: 0.032 }),
    ],
    // the light that leaks from under the cover
    glow: [meshPart(new TorusGeometry(0.83, 0.025, 4, 28), 0x8fd0ff, { rx: Math.PI / 2, y: 0.07 })],
  }),
  cover: () => {
    const body = [meshPart(new CylinderGeometry(0.8, 0.8, 0.05, 24), 0x485562, { y: 0.025 })],
      glow = [];
    // a raised grid, a ring of bolts and two pick holes; the slots between the bars glow
    for (let i = -3; i <= 3; i++) {
      const u = i * 0.19,
        len = 2 * Math.sqrt(Math.max(0, 0.74 * 0.74 - u * u)) * 0.92;
      if (len < 0.1) continue;
      body.push(box(0x82919c, len, 0.022, 0.05, { z: u, y: 0.06 }), box(0x82919c, 0.05, 0.022, len, { x: u, y: 0.06 }));
      if (i < 3) {
        const v = u + 0.095,
          len2 = 2 * Math.sqrt(Math.max(0, 0.7 * 0.7 - v * v)) * 0.85;
        if (len2 > 0.1) glow.push(box(0x8fd0ff, len2, 0.006, 0.022, { z: v, y: 0.052 }));
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26;
      body.push(
        meshPart(new CylinderGeometry(0.035, 0.035, 0.03, 6), 0xa0abb2, {
          x: Math.cos(a) * 0.71,
          z: Math.sin(a) * 0.71,
          y: 0.06,
        }),
      );
    }
    body.push(
      box(0x101114, 0.1, 0.03, 0.04, { x: 0.5, y: 0.05 }),
      box(0x101114, 0.1, 0.03, 0.04, { x: -0.5, y: 0.05 }),
    );
    return { body, glow };
  },
  // a thin piece of an arc (along x, centred), drawn bright and additive
  bolt: () => ({ glow: [box(0xffffff, 1, 1, 1)] }),
  // ice sheet: one shard of ice (a five-sided cone standing on y 0); the sheets place several on their rim
  shard: () => {
    const geo = new ConeGeometry(1, 1, 5);
    geo.translate(0, 0.5, 0);
    return { body: [meshPart(geo, 0xcfeeff)] };
  },
  // dust devil (the Glass Flats): two open cones of dust - a wide skirt and the funnel above it -
  // both turning fast (the update spins them); built for radius 1 and scaled with the devil
  // built for radius 1: a helix of flat dust sheets winding up around a hot core, so the devil's
  // spin is real (a smooth cone reads as a dune - the look pass's lesson). The update spins the set.
  // 3.55.0: the sheets read as DUST - pale sand tones, thinner and deeper (the old dark-brown
  // boxes read as debris scattered over the field, not as a whirling column)
  funnel: () => ({
    body: [meshPart(dustRibbonGeometry(0), 0xcbbca0), meshPart(dustRibbonGeometry(Math.PI * 0.8), 0xe0d4b9)],
    glow: [meshPart(dustRibbonGeometry(Math.PI * 1.6), 0xe8dec8)],
  }),
  // bloom pool: a bank of peat lumps and a few dead reeds
  bank: () => {
    const rng = makeRng(0xac1d),
      body = [];
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, TAU),
        d = rng.range(1.05, 1.18),
        s = rng.range(0.08, 0.15);
      body.push(
        meshPart(new SphereGeometry(s, 6, 4), [0x1c221c, 0x18201a, 0x232a20][i % 3], {
          x: Math.cos(a) * d,
          z: Math.sin(a) * d,
          y: 0.01,
          sy: 0.42,
          sx: rng.range(1, 1.6),
          ry: -a,
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, TAU),
        d = rng.range(0.98, 1.08),
        h = rng.range(0.35, 0.6);
      body.push(
        meshPart(new ConeGeometry(0.022, h, 4), 0x182218, {
          x: Math.cos(a) * d,
          z: Math.sin(a) * d,
          y: h / 2,
          rz: rng.range(-0.3, 0.3),
          rx: rng.range(-0.3, 0.3),
        }),
      );
    }
    return { body };
  },
  bubble: () => ({ glow: [meshPart(new SphereGeometry(1, 8, 6), 0xffffff)] }),
  // portal: a rune stone (a long dark crystal) with a glowing rune on its face
  stone: () => ({
    body: [meshPart(new OctahedronGeometry(0.16), 0x2a1650, { sy: 2.3 })],
    glow: [box(0xffffff, 0.03, 0.16, 0.012, { z: 0.09 }), box(0xffffff, 0.09, 0.025, 0.012, { z: 0.09, y: 0.03 })],
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
    pool = this.pl["s:" + kind] = new this.Pool(kind === "fire" ? tube() : disc(), mat, max);
    pool.mesh.renderOrder = kind === "fire" ? 4 : 1;
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
          s = (0.05 + 0.1 * f) * fade;
        bubbles.colC(bubbles.y(x + Math.cos(a) * d, 0.04, z + Math.sin(a) * d, 0, s, s * 0.8, s), col, 0.35 + 0.3 * f);
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
        r.ringPool.colC(r.ringPool.y(px, 0.07, pz, time * 2.4, 1.08), color, 0.7);
        const column = r.columns.y(px, 0, pz, 0, 0.8, 1.4, 0.8);
        r.columns.colC(column, color, 0.22);
        r.sprites.colC(r.sprites.bb(px, 0.4, pz, 2.2, r.B), color, 0.28);
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
