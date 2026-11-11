// Biome looks: floors, props, borders, ambient particles and the enemy skins (shaders).

import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector4,
} from "three";
import { REED_WIND } from "./map-geometry.js";
import { addMapArchitecture } from "./map-architecture.js";
import { calderaRidgeParts } from "./caldera-ridge.js";
import { armorBox } from "./armor-geometry.js";
import { FLOOR_FRAGMENT as RL_FLOOR_FRAG } from "./surface-shader.js";
import { clamp, TAU, hashString, makeRng } from "../core/util.js";
import { hexColor, additiveMaterial } from "./materials.js";
import { addBiomeDetail } from "./biome-props.js";
import { mergeGeometries } from "./models.js";
import { mergeStaticMeshes } from "./static-meshes.js";
import { biomeAtmosphere, propAtmosphereRates, atmosphereDensity } from "../data/atmosphere.js";

const propBox = (w, h, d) => (Math.min(w, h, d) >= 0.16 ? armorBox(w, h, d) : new BoxGeometry(w, h, d));

const floorVertexShader = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
  ArenaView = class {
    constructor(scene) {
      this.scene = scene;
      this.group = new Group();
      scene.add(this.group);
      this.uniforms = UniformsUtils.merge([
        UniformsLib.fog,
        {
          uBase: { value: new Color() },
          uGrid: { value: new Color() },
          uAccent: { value: new Color() },
          uHalf: { value: new Vector2(18, 18) },
          uPlayer: { value: new Vector2() },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          // 2.4.0: the floor of each biome is a style of one shader (RL_FLOOR_FRAG)
          uStyle: { value: 0 },
          // 3.4.0: how dark the Blackout makes the floor (0..1); the lights of blasts and arcs still light it
          uDark: { value: 0 },
          // 3.29.0: the colour of the floor: how saturated (1 = as the palette says) and how bright it is, per biome
          uVivid: { value: 1 },
          uGain: { value: 1 },
          // 3.46.0: the procedural detail tier (0 full — 1 fewer octaves — 1 cell voronoi, no starfield)
          uLod: { value: 0 },
          uL: { value: Array.from({ length: 6 }, () => new Vector4()) },
          uLC: { value: Array.from({ length: 6 }, () => new Color()) },
        },
      ]);
      this.floorMat = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: floorVertexShader,
        fragmentShader: RL_FLOOR_FRAG,
        fog: true,
      });
      this.biomeId = null;
    }
    // 2.4.0: the arena is rebuilt from scratch for every layout (as before); build() asks the biome
    // for its border and props and switches the floor shader's style
    build(biome, layout, animate = false) {
      layout = layout || { key: biome.id + ":classic", W: biome.W, H: biome.H, obs: biome.obstacles, deco: 0 };
      if (this.layKey === layout.key) return;
      const first = this.layKey == null;
      this.layKey = layout.key;
      this.biomeId = biome.id;
      this.group.traverse((obj) => {
        // 2.9.1: instanced props also own GPU buffers (matrices, colours) that the geometry does not free
        if (obj.isInstancedMesh) {
          obj.dispose();
        }
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material && obj.material !== this.floorMat) {
          [].concat(obj.material).forEach((mat) => mat.dispose());
        }
      });
      this.group.clear();
      const look = RL_BIOME_LOOK[biome.id] || RL_BIOME_LOOK.yard,
        uniforms = this.uniforms;
      uniforms.uBase.value.setHex(biome.floor);
      uniforms.uGrid.value.setHex(biome.grid);
      uniforms.uAccent.value.setHex(biome.accent);
      uniforms.uHalf.value.set(layout.W, layout.H);
      uniforms.uStyle.value = look.style;
      uniforms.uVivid.value = look.vivid || 1;
      uniforms.uGain.value = look.gain || 1;
      const floor = new Mesh(new PlaneGeometry(100, 100), this.floorMat);
      floor.rotation.x = -Math.PI / 2;
      this.group.add(floor);
      const props = new Group();
      this.group.add(props);
      this.obsGroup = props;
      this.rlAnim = [];
      this.rlEmit = [];
      this.rlSway = null;
      (RL_BIOME_BUILD[biome.id] || RL_BIOME_BUILD.yard)(
        this,
        biome,
        layout.W,
        layout.H,
        layout.obs,
        makeRng(hashString(layout.key + ":look")),
      );
      // 2.9.0: clutter, backdrop and ground decals (its own rng, so the props above keep their layout)
      addBiomeDetail(this, biome, layout.W, layout.H, layout.obs, makeRng(hashString(layout.key + ":detail")));
      addMapArchitecture(this, biome, layout.W, layout.H, layout.obs);
      mergeStaticMeshes(this.group, new Set(this.rlAnim.map((a) => a.o)));
      this.rise = animate && !first ? 0 : 1;
      props.position.y = this.rise < 1 ? -2.6 : 0;
    }
    update(dt, px, pz, pulse) {
      if (this.obsGroup && this.rise < 1) {
        this.rise = Math.min(1, this.rise + dt / 0.7);
        let ease = 1 - Math.pow(1 - this.rise, 3);
        this.obsGroup.position.y = -2.6 * (1 - ease);
      }
      this.uniforms.uTime.value += dt;
      this.uniforms.uPlayer.value.set(px, pz);
      this.uniforms.uPulse.value = pulse;
      // 2.4.0: animated props (spinning and bobbing); 3.51.0: "u" - a material whose uniforms ride
      // the view's clock (the aurora curtains)
      const time = this.uniforms.uTime.value;
      for (const anim of this.rlAnim || []) {
        const obj = anim.o;
        if (anim.k === "spin" || anim.k === "spinbob") obj.rotation.y += dt * anim.s;
        if (anim.k === "bob" || anim.k === "spinbob")
          obj.position.y = anim.b + Math.sin(time * (anim.s || 1) + anim.ph) * (anim.a || 0.1);
        if (anim.k === "u") obj.uniforms.uTime.value = time;
      }
    }
  };

/* ---- 2.4.0: every biome gets its own look, not just its own colours. Before, all 19 biomes
 shared one neon grid floor, the same boxes and pillars and the same wall; only the palette
 changed. Now each of the five has its own
   floor    Blackout City (3.4.0): wet asphalt and road markings · Ashfall Caldera (3.49.0): a charcoal
            crust with dark grooves, ash and two molten fissures · The Aurora Shelf (3.51.0): indigo ice
            under snow drifts, wind scours, cracks and the aurora's sheen · The Glowmarsh (3.50.0): black
            water over dark peat, glowing algae veins and reed tufts · The Shattered Core: hex tiles floating over
            a starfield
   props    (same collision shapes) pylons and crates · obsidian spires and lava dykes · crystal clusters,
            blue ice ridges and half-buried arks · glowcap mushrooms, dead trees and logs · floating
            obelisks and hovering monoliths
   border   jersey barriers (3.4.0, was a fence) · a basalt rampart with ember pockets · ice wall with crystals · reeds and rocks
            on a peat bank · energy barrier over the abyss
   air      rain and splashes (3.4.0, was neon dust) · falling ash and climbing embers · snowfall · glowing spores and marsh haze ·
            rising void motes
   light    sun colour, sky and fog density (the marsh is foggy, the void dark)
 ---- */
const RL_BIOME_LOOK = {
  // 3.4.0: Blackout City: a cold moon, little ambient light, some fog over the street
  // 3.29.0: key light and fill light from opposite sides in complementary colours (a strong sun and a weaker, flat sky light give
  // the faceted models their form), a richer floor (vivid: saturation, gain: brightness)
  yard: {
    style: 5,
    hemi: 0.95,
    sun: 0xb4c4ff,
    sunI: 2.0,
    fill: [0xff7a3a, 0.95],
    vivid: 1.45,
    gain: 1.12,
    // 3.44.0: the fog bites - the far edge of every place dissolves softly instead of running
    // to a hard horizon (the old windows sat far outside the arena, so the fog never showed)
    fog: [1.15, 2.7],
  },
  vault: {
    style: 2,
    // 3.54.0: the Shelf at night: a cold moon key, an aurora-lit fill (the curtains' green bounces
    // off the snow), and the aurora's own light lives in the curtains and the sheen on the ice
    hemi: 0.85,
    sun: 0xcfe2ff,
    sunI: 1.55,
    fill: [0x7ad8a8, 0.5],
    vivid: 1.15,
    gain: 0.8,
    fog: [0.98, 2.3],
  },
  // 3.53.0: the Glass Flats: the one daylight place - a hard white sun over pale glass, a
  // sand-bounce fill, pale hot haze at the horizon (the fog hex stays dark for the luma rule;
  // the light comes from the sun and the rendering); 3.55.0: the fog gives the field a step
  // more air so the noon backdrop reads instead of sinking into the dark clear colour
  flats: {
    style: 7,
    hemi: 1.15,
    sun: 0xfff2d8,
    sunI: 2.2,
    fill: [0xffd8a0, 0.65],
    vivid: 1.3,
    gain: 1.05,
    fog: [1.2, 3.05],
  },
  // 3.50.0: the Glowmarsh: a pale teal moon low over the water, the bioluminescence bounces
  // from below (the fill), everything else stays dark so the glow carries the scene
  marsh: {
    style: 3,
    hemi: 0.7,
    sun: 0xb8e6e0,
    sunI: 1.15,
    fill: [0x2ef0b0, 0.5],
    vivid: 1.0,
    gain: 0.85,
    fog: [0.95, 2.25],
  },
  void: {
    style: 4,
    hemi: 0.9,
    sun: 0xd8c4ff,
    sunI: 1.6,
    fill: [0x20e0ff, 1.0],
    vivid: 1.1,
    gain: 1.0,
    fog: [1.25, 3.0],
  },
  // 3.54.0: the Ashfall Caldera: a low ember key, a molten bounce from below, ash in the air -
  // the fog sits a shade clearer so the volcano reads past the wall
  club: {
    style: 6,
    hemi: 0.85,
    sun: 0xc48a60,
    sunI: 1.5,
    fill: [0xff6420, 0.6],
    vivid: 1.12,
    gain: 0.98,
    fog: [1.18, 2.65],
  },
};
// 3.41.0: the tone the flying debris of a kill calms into. The style guide of the owner (Viridi, Penguin's
// Isle, Creaks: quiet, drawn colours) - a kill used to spray the enemy's pure card colour, which read as
// confetti against the muted floors. The pieces keep a hint of their own colour for telling things apart.
const RL_BIOME_TINT = {
  yard: new Color(0x8a93a6),
  vault: new Color(0xcfdde8),
  marsh: new Color(0x7ea89a),
  void: new Color(0x9a92b8),
  // 3.49.0: the Caldera calms its debris into settled ash
  club: new Color(0x98897e),
  // 3.53.0: the Flats calms its debris into sand
  flats: new Color(0xd8c8a8),
};
// 3.44.0: the fireflies of the Glowmarsh are the one warm light in the cold night

function rlInst(group, geo, mat, list) {
  if (!list.length) return null;
  const mesh = new InstancedMesh(geo, mat, list.length),
    dummy = new Object3D();
  list.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    dummy.scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (item.c != null) {
      mesh.setColorAt(i, hexColor(item.c));
    }
  });
  mesh.frustumCulled = false;
  group.add(mesh);
  return mesh;
}
// Points along the border, `off` outside it, every `step` metres: fn(x, z, nx, nz)
function rlAlongBorder(W, H, off, step, fn) {
  const outW = W + off,
    outH = H + off;
  for (const [x0, z0, x1, z1, nx, nz] of [
    [-outW, -outH, outW, -outH, 0, -1],
    [outW, -outH, outW, outH, 1, 0],
    [outW, outH, -outW, outH, 0, 1],
    [-outW, outH, -outW, -outH, -1, 0],
  ]) {
    const count = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let i = 0; i < count; i++) {
      const frac = (i + 0.5) / count;
      fn(x0 + (x1 - x0) * frac, z0 + (z1 - z0) * frac, nx, nz);
    }
  }
}
const rlMesh = (group, geo, mat, x, y, z, ry = 0) => {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  group.add(mesh);
  return mesh;
};
const rlGlow = (color, opacity = 1) =>
  new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity });
// A thin ring on the floor at the collision radius, so the footprint reads in every biome.
const rlFootRing = (group, x, z, radius, mat) => {
  const ring = rlMesh(group, new TorusGeometry(radius, 0.04, 4, 32), mat, x, 0.05, z);
  ring.rotation.x = Math.PI / 2;
  return ring;
};
// Outline slab under a box obstacle.
const rlFootSlab = (group, box, mat, pad = 0.3) =>
  rlMesh(group, propBox(box.w * 2 + pad, 0.05, box.h * 2 + pad), mat, box.x, 0.03, box.y);
/* 3.46.0: a static-prop merger. Geometries are collected per material and baked into one mesh
   each at the end — the barrier ring of Blackout City alone used to be ~200 individual meshes,
   each its own draw call, each recomputing its matrix every frame. Transform math goes through
   an Object3D so rotations compose exactly like the meshes it replaces. */
const rlBakeDummy = new Object3D();
function rlMerger() {
  const buckets = new Map();
  const bake = (geo, mat, world) => {
    geo.applyMatrix4(world);
    let list = buckets.get(mat);
    if (!list) buckets.set(mat, (list = []));
    list.push(geo);
  };
  const localMatrix = (x, y, z, ry, rx, rz) => {
    rlBakeDummy.position.set(x, y, z);
    rlBakeDummy.rotation.set(rx, ry, rz);
    rlBakeDummy.scale.set(1, 1, 1);
    rlBakeDummy.updateMatrix();
    return rlBakeDummy.matrix.clone();
  };
  return {
    add(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) {
      bake(geo, mat, localMatrix(x, y, z, ry, rx, rz));
    },
    // a part inside a rotated parent (a wrecked car): world = parent · local
    addIn(geo, mat, parent, x, y, z, ry = 0, rx = 0, rz = 0) {
      bake(geo, mat, parent.clone().multiply(localMatrix(x, y, z, ry, rx, rz)));
    },
    parentMatrix(x, z, ry = 0) {
      rlBakeDummy.position.set(x, 0, z);
      rlBakeDummy.rotation.set(0, ry, 0);
      rlBakeDummy.scale.set(1, 1, 1);
      rlBakeDummy.updateMatrix();
      return rlBakeDummy.matrix.clone();
    },
    flush(group) {
      for (const [mat, list] of buckets) {
        const merged = mergeGeometries(list, false);
        if (merged) {
          const mesh = new Mesh(merged, mat);
          mesh.updateMatrix();
          mesh.matrixAutoUpdate = false;
          group.add(mesh);
        } else {
          // a refused merge (mismatched attributes) falls back to the meshes it would have made
          for (const geo of list) group.add(new Mesh(geo, mat));
        }
      }
      buckets.clear();
    },
  };
}
const RL_BIOME_BUILD = {
  // Blackout City (3.4.0, was the Neon Yard): jersey barriers with red and white reflectors around the street,
  // advertising columns (round obstacles) and wrecked cars or dumpsters (box obstacles), steam from some manholes
  yard(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      concrete = new MeshLambertMaterial({ color: 0x69727a, flatShading: true }),
      darkConcrete = new MeshLambertMaterial({ color: 0x414b58, flatShading: true }),
      red = rlGlow(biome.accent),
      white = rlGlow(0xd8d4c8),
      amber = rlGlow(0xffb347),
      accentMat = new MeshBasicMaterial({ color: biome.accent, toneMapped: false }),
      // 3.46.0: the static props are baked into one mesh per material (the barrier ring alone
      // used to be 192 draw calls); materials that repeat per obstacle are shared so their
      // parts merge together. Two mergers: the border ring sits in the static group, the
      // obstacles in obsGroup (which rises out of the floor on a layout change).
      posterMats = {},
      paintedMat = (color) =>
        posterMats[color] || (posterMats[color] = new MeshLambertMaterial({ color, flatShading: true })),
      bakeBorder = rlMerger(),
      bakeObs = rlMerger();
    // jersey barriers: a wide foot and a narrower top, a reflector on the inner face of every second one
    rlAlongBorder(W, H, 0.45, 2.3, (x, z, nx, nz) => {
      const along = nx === 0,
        ry = along ? 0 : Math.PI / 2;
      bakeBorder.add(propBox(2.15, 0.35, 0.7), concrete, x, 0.175, z, ry);
      bakeBorder.add(propBox(2.15, 0.45, 0.32), concrete, x, 0.57, z, ry);
      const k = Math.round((along ? x : z) / 2.3);
      bakeBorder.add(propBox(0.5, 0.12, 0.02), k % 2 ? red : white, x - nx * 0.17, 0.6, z - nz * 0.17, ry);
    });
    // corner posts with a blinking-amber lamp (static glow) and a red reflector
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        bakeBorder.add(propBox(0.8, 1.1, 0.8), darkConcrete, sx * (W + 0.45), 0.55, sz * (H + 0.45));
        bakeBorder.add(propBox(0.3, 0.18, 0.3), amber, sx * (W + 0.45), 1.2, sz * (H + 0.45));
      }
    const paint = [0x536e82, 0x855950, 0x526c5d, 0x747584, 0x85744f];
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // an advertising column: concrete drum, a band of torn posters, a cap
        const r = obstacle.r,
          height = 2.2;
        bakeObs.add(new CylinderGeometry(r * 0.92, r, height, 18), darkConcrete, obstacle.x, height / 2, obstacle.y);
        bakeObs.add(
          new CylinderGeometry(r * 0.97, r * 0.99, 1.2, 18),
          paintedMat(rng.pick(paint)),
          obstacle.x,
          1.15,
          obstacle.y,
        );
        // Torn paper panels and a metal collar make the column legible at game scale.
        for (let panel = 0; panel < 3; panel++) {
          const a = (panel * Math.PI * 2) / 3 + 0.4;
          bakeObs.add(
            propBox(r * 0.65, 0.65, 0.025),
            paintedMat(0xaaa494),
            obstacle.x + Math.sin(a) * r,
            1.2,
            obstacle.y + Math.cos(a) * r,
            a,
          );
          bakeObs.add(
            propBox(r * 0.42, 0.08, 0.03),
            paintedMat(0x526b79),
            obstacle.x + Math.sin(a) * (r + 0.02),
            1.32,
            obstacle.y + Math.cos(a) * (r + 0.02),
            a,
          );
        }
        bakeObs.add(new CylinderGeometry(r, r, 0.14, 18), concrete, obstacle.x, height + 0.07, obstacle.y);
        bakeObs.add(new CylinderGeometry(r * 0.5, r * 0.7, 0.3, 12), concrete, obstacle.x, height + 0.29, obstacle.y);
        bakeObs.add(new CylinderGeometry(r * 1.0, r * 1.0, 0.05, 18, 1, true), white, obstacle.x, 1.8, obstacle.y);
        bakeObs.add(new TorusGeometry(r * 1.06, 0.045, 4, 32), concrete, obstacle.x, 0.05, obstacle.y, 0, Math.PI / 2);
      } else if (obstacle.w < 1.3 && obstacle.h < 1.3) {
        // a dumpster with its lid half open
        const height = 1.1;
        bakeObs.add(
          propBox(obstacle.w * 2, height, obstacle.h * 2),
          paintedMat(rng.pick([0x2f4a3a, 0x3a3f4a, 0x4a3a2a])),
          obstacle.x,
          height / 2,
          obstacle.y,
        );
        bakeObs.add(
          propBox(obstacle.w * 2 + 0.06, 0.06, obstacle.h * 2 + 0.06),
          darkConcrete,
          obstacle.x,
          height + 0.12,
          obstacle.y,
          0,
          0,
          0.18,
        );
        for (const side of [-1, 1]) {
          bakeObs.add(
            propBox(obstacle.w * 1.7, 0.07, 0.06),
            concrete,
            obstacle.x,
            0.35,
            obstacle.y + side * obstacle.h,
          );
          bakeObs.add(propBox(0.35, 0.06, 0.08), concrete, obstacle.x, 0.85, obstacle.y + side * obstacle.h);
        }
        bakeObs.add(
          propBox(obstacle.w * 2 + 0.12, 0.04, obstacle.h * 2 + 0.12),
          concrete,
          obstacle.x,
          0.03,
          obstacle.y,
        );
      } else {
        // a wrecked car: body, cabin, wheels, dead headlights and one red tail light still on
        const long = obstacle.w >= obstacle.h,
          L = (long ? obstacle.w : obstacle.h) * 2,
          D = (long ? obstacle.h : obstacle.w) * 2,
          ry = long ? 0 : Math.PI / 2,
          body = paintedMat(rng.pick(paint)),
          car = bakeObs.parentMatrix(obstacle.x, obstacle.y, ry);
        bakeObs.addIn(propBox(L, 0.55, D), body, car, 0, 0.5, 0);
        bakeObs.addIn(propBox(L * 0.5, 0.45, D * 0.86), body, car, -L * 0.06, 0.99, 0);
        bakeObs.addIn(propBox(L * 0.48, 0.3, D * 0.88), darkConcrete, car, -L * 0.06, 1.0, 0);
        for (const wx of [-1, 1])
          for (const wz of [-1, 1])
            bakeObs.addIn(
              new CylinderGeometry(0.3, 0.3, 0.22, 10),
              darkConcrete,
              car,
              wx * L * 0.33,
              0.3,
              wz * D * 0.48,
              0,
              Math.PI / 2,
            );
        bakeObs.addIn(propBox(0.04, 0.12, 0.3), red, car, -L / 2 - 0.01, 0.62, D * 0.32);
        // the roll stays unconditional (the run's rng must see the same draws as before)
        if (rng.chance(0.3)) bakeObs.addIn(propBox(0.04, 0.1, 0.28), white, car, L / 2 + 0.01, 0.6, -D * 0.3);
        bakeObs.add(
          propBox(obstacle.w * 2 + 0.12, 0.05, obstacle.h * 2 + 0.12),
          accentMat,
          obstacle.x,
          0.03,
          obstacle.y,
        );
      }
    // steam out of a few manholes (decor; the live ones are the vents)
    if (!view.rlEmit) view.rlEmit = [];
    for (let k = 0; k < 4; k++) {
      const x = rng.range(-W + 2, W - 2),
        z = rng.range(-H + 2, H - 2);
      if (Math.hypot(x, z - 2) < 6 || obs.some((o) => Math.hypot(o.x - x, o.y - z) < 2.5)) continue;
      bakeBorder.add(new CylinderGeometry(0.42, 0.42, 0.03, 16), darkConcrete, x, 0.015, z);
      view.rlEmit.push({ k: "steam", x, y: 0.1, z });
    }
    bakeObs.flush(props);
    bakeBorder.flush(group);
  },
  // The Aurora Shelf (3.51.0): an indigo ice field under the aurora - the border is a low snow
  // wall with blue ice ridges, crystal clusters and ice blocks stand on it, and the aurora's
  // curtains hang past the border, folding slowly (additive, no light of their own on the floor -
  // the sheen on the ice is the floor shader's)
  vault(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      ice = new MeshLambertMaterial({
        color: 0x86b8e8,
        emissive: 0x0a1e38,
        transparent: true,
        opacity: 0.86,
        flatShading: true,
      }),
      core = new MeshLambertMaterial({ color: 0x22345c, emissive: 0x081226, flatShading: true }),
      snow = new MeshLambertMaterial({ color: 0xe8f4ff, emissive: 0x16243c, flatShading: true }),
      glow = rlGlow(biome.grid, 0.8),
      wallW = 0.6,
      wallH = 0.45;
    // the aurora: tall curtains standing past the far wall, a defined bright green foot that waves
    // (the classic aurora's lower border), vertical rays that drift and breathe, the colour rising
    // green -> violet -> pink (each curtain on its own seed and height)
    const auroraVert = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      auroraFrag = `
uniform float uTime;
uniform float uSeed;
uniform float uAlpha;
uniform float uFoot;
varying vec2 vUv;
void main() {
  float x = vUv.x * (2.2 + uSeed * 0.7) + uSeed * 13.7;
  float w = sin(x * 1.9 + uTime * 0.1 + uSeed * 3.1) * 0.45 +
    sin(x * 3.3 - uTime * 0.061 + uSeed) * 0.25 +
    sin(x * 0.8 + uTime * 0.043) * 0.5;
  // the foot: a bright, fairly sharp lower border that waves - the aurora reads by its edge
  float foot = uFoot + w * 0.05;
  float fringe = smoothstep(foot + 0.07, foot, vUv.y) * smoothstep(foot - 0.05, foot - 0.005, vUv.y);
  fringe *= smoothstep(0.0, 0.04, vUv.y);
  // two scales of vertical rays with deep dark gaps between them
  float rayN = 0.5 + 0.5 * sin(x * 13.0 + w * 4.0 + uTime * 0.33 + sin(x * 5.1 + uTime * 0.12) * 2.2);
  rayN *= 0.72 + 0.28 * sin(x * 29.0 - uTime * 0.21 + uSeed * 9.0);
  float rays = pow(rayN, 1.6);
  // the body: bright just above the foot, fading up, gone before the crest
  float body = (1.0 - smoothstep(foot, 0.9, vUv.y)) * rays;
  float pulse = 0.72 + 0.28 * sin(uTime * 0.16 + uSeed * 2.0);
  vec3 green = vec3(0.12, 1.0, 0.52), violet = vec3(0.45, 0.24, 0.8), pink = vec3(0.9, 0.35, 0.68);
  float up = smoothstep(0.3, 0.95, vUv.y + w * 0.08);
  vec3 col = mix(green, violet, up);
  col = mix(col, pink, smoothstep(0.75, 1.0, vUv.y) * 0.4);
  col += green * fringe * 0.5;
  // AdditiveBlending adds rgb * alpha: hand the full colour and put the intensity in the alpha
  float a = (fringe * (0.6 + 0.4 * rayN) + body * 0.32) * pulse * uAlpha;
  gl_FragColor = vec4(col * 1.2, a);
}`;
    const curtains = [
      // the shelf's camera never sees the sky (the frame's top edge hits the ground inside the
      // arena), so the aurora lives in three layers: the horizon curtains fill the backdrop band
      // when the fight travels to the far wall, one narrow curtain hangs INSIDE the frustum at the
      // frame's top edge from anywhere (3.55.0 - a thin sheet, its bright foot the only dense part,
      // so it reads as the aurora's edge overhead without the additive wash that killed the first
      // take's high near sheets), and the sheen on the ice carries the rest of the run
      { x: 0, z: -H - 6, y: 5.2, w: 54, h: 12, seed: 0.55, al: 0.9, foot: 0.44 },
      { x: -13.5, z: -H - 3.5, y: 4.2, w: 26, h: 9, seed: 0.73, al: 0.62, foot: 0.42 },
      { x: 13.5, z: -H - 4.5, y: 4.4, w: 24, h: 9, seed: 0.11, al: 0.56, foot: 0.42 },
      { x: -4, z: -H - 12, y: 6.2, w: 72, h: 15, seed: 0.91, al: 0.5, foot: 0.36 },
      { x: -3.5, z: -10.5, y: 4.6, w: 17, h: 7.5, seed: 0.21, al: 0.3, foot: 0.16 },
      { x: 7, z: -H - 1.2, y: 3.4, w: 20, h: 7, seed: 0.37, al: 0.38, foot: 0.46 },
    ];
    for (const c of curtains) {
      const mat = new ShaderMaterial({
        uniforms: UniformsUtils.merge([
          UniformsLib.fog,
          { uTime: { value: 0 }, uSeed: { value: c.seed }, uFoot: { value: c.foot } },
        ]),
        vertexShader: auroraVert,
        fragmentShader: auroraFrag,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      mat.uniforms.uAlpha = { value: c.al };
      const curtain = new Mesh(new PlaneGeometry(c.w, c.h), mat);
      curtain.position.set(c.x, c.y, c.z);
      curtain.onBeforeRender = (r, s, cam) => curtain.quaternion.copy(cam.quaternion);
      group.add(curtain);
      view.rlAnim.push({ k: "u", o: mat });
    }
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(group, propBox(sx, wallH, sz), core, bx, wallH / 2, bz);
    const spikes = [],
      tint = [0xbfe8ff, 0xa4d8f4, 0xdff4ff, 0x7ab0dc];
    for (const off of [0.6, 1.05])
      rlAlongBorder(W, H, off, 0.75, (px, pz, nx, nz) => {
        const len = rng.range(0.7, off < 0.5 ? 1.5 : 2.4),
          tilt = rng.range(0.1, 0.35);
        spikes.push({
          x: px + rng.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: wallH + len / 2 - 0.1,
          z: pz + rng.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: nz * tilt,
          rz: -nx * tilt,
          ry: rng.range(0, 6),
          sx: rng.range(0.7, 1.2),
          sy: len,
          sz: rng.range(0.7, 1.2),
          c: rng.pick(tint),
        });
      });
    rlInst(
      group,
      new ConeGeometry(0.28, 1, 6),
      new MeshLambertMaterial({ emissive: 0x0a1e38, transparent: true, opacity: 0.88, flatShading: true }),
      spikes,
    );
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // crystal cluster: a tall hexagonal prism and four smaller ones leaning outwards
        const main = rlMesh(
          props,
          new CylinderGeometry(obstacle.r * 0.3, obstacle.r * 0.5, 2.1, 6),
          ice,
          obstacle.x,
          1.05,
          obstacle.y,
          rng.range(0, 6),
        );
        main.rotation.z = rng.range(-0.08, 0.08);
        for (let j = 0; j < 4; j++) {
          const angle = (j / 4) * Math.PI * 2 + rng.range(-0.4, 0.4),
            len = Math.min(rng.range(0.8, 1.4), obstacle.r * 1.4),
            shard = rlMesh(
              props,
              new CylinderGeometry(obstacle.r * 0.14, obstacle.r * 0.24, len, 6),
              ice,
              obstacle.x + Math.cos(angle) * obstacle.r * 0.55,
              len / 2 - 0.05,
              obstacle.y + Math.sin(angle) * obstacle.r * 0.55,
            );
          shard.rotation.set(Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35);
        }
        const frost = rlMesh(props, new CircleGeometry(obstacle.r, 20), snow, obstacle.x, 0.02, obstacle.y);
        frost.rotation.x = -Math.PI / 2;
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, glow);
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 2.0, k: "glint" });
      } else {
        // ice block: clear shell, dark core, snow cap
        const height = 1.05;
        rlMesh(
          props,
          propBox(obstacle.w * 2 * 0.72, height * 0.8, obstacle.h * 2 * 0.72),
          core,
          obstacle.x,
          height * 0.42,
          obstacle.y,
        );
        rlMesh(props, propBox(obstacle.w * 2, height, obstacle.h * 2), ice, obstacle.x, height / 2, obstacle.y);
        rlMesh(
          props,
          propBox(obstacle.w * 2 + 0.1, 0.14, obstacle.h * 2 + 0.1),
          snow,
          obstacle.x,
          height + 0.05,
          obstacle.y,
        );
        rlFootSlab(props, obstacle, glow, 0.25);
      }
  },
  // The Glowmarsh: a peat bank with reeds and rocks, glowcap mushrooms, dead trees and mossy logs
  marsh(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      bark = new MeshLambertMaterial({ color: 0x544b38, flatShading: true }),
      moss = new MeshLambertMaterial({ color: 0x1e4a3a, emissive: 0x062a1e, flatShading: true }),
      stem = new MeshLambertMaterial({ color: 0xcfd8c4, flatShading: true }),
      cap = new MeshLambertMaterial({ color: 0x2a8a68, emissive: 0x0c3a2a, flatShading: true }),
      gill = new MeshLambertMaterial({ color: 0x0e2420 }),
      spot = rlGlow(biome.accent),
      ring = rlGlow(biome.grid, 0.55),
      wood = new MeshLambertMaterial({ color: 0x5a5240, flatShading: true }),
      wallW = 1.2;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(
        group,
        propBox(sx, 0.22, sz),
        new MeshLambertMaterial({ color: 0x344b42, flatShading: true }),
        bx,
        0.11,
        bz,
      );
    const reeds = [],
      rocks = [],
      green = [0x3e6a4a, 0x335a3e, 0x4a7a52, 0x2a4a34];
    rlAlongBorder(W, H, 0.95, 0.4, (px, pz, nx, nz) => {
      for (let j = 0; j < 2; j++) {
        const len = rng.range(0.9, 2.3),
          off = rng.range(-0.45, 0.6);
        reeds.push({
          x: px + nx * off + rng.range(-0.2, 0.2) * (nz ? 1 : 0),
          y: len / 2,
          z: pz + nz * off + rng.range(-0.2, 0.2) * (nx ? 1 : 0),
          rx: rng.range(-0.15, 0.15),
          rz: rng.range(-0.15, 0.15),
          sy: len,
          c: rng.pick(green),
        });
      }
    });
    rlAlongBorder(W, H, 1.3, 2.6, (px, pz) => {
      const size = rng.range(0.5, 1.2);
      rocks.push({
        x: px + rng.range(-0.4, 0.4),
        y: size * 0.25,
        z: pz + rng.range(-0.4, 0.4),
        ry: rng.range(0, 6),
        rx: rng.range(0, 1),
        sx: size,
        sy: size * 0.6,
        sz: size * rng.range(0.8, 1.2),
        c: rng.pick([0x232c28, 0x2a332c, 0x1e2622]),
      });
    });
    // 3.44.0: the reeds lean with a slow wind - the InstancedMesh goes dynamic and every blade
    // gets its own phase and tempo; ArenaView.update recomposes the matrices each frame
    const reedMesh = rlInst(
      group,
      new CylinderGeometry(0.03, 0.05, 1, 4),
      new MeshLambertMaterial({ flatShading: true }),
      reeds,
    );
    if (reedMesh) {
      // 3.46.0: the wind lives in the vertex shader now — the whole instance matrix buffer
      // (about 46 KB for ~720 blades) used to be recomposed on the CPU and re-uploaded every
      // frame. The rng draws stay exactly where they were (the run's roll sequence is untouched).
      for (let i = 0; i < reeds.length; i++) {
        reeds[i].wp = rng.range(0, TAU);
        reeds[i].ws = rng.range(0.6, 1.1);
      }
      const phases = new Float32Array(reeds.length),
        speeds = new Float32Array(reeds.length);
      for (let i = 0; i < reeds.length; i++) {
        phases[i] = reeds[i].wp;
        speeds[i] = reeds[i].ws;
      }
      reedMesh.geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
      reedMesh.geometry.setAttribute("aSpeed", new InstancedBufferAttribute(speeds, 1));
      const reedMat = reedMesh.material;
      reedMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = view.uniforms.uTime;
        shader.vertexShader =
          "attribute float aPhase;\nattribute float aSpeed;\nuniform float uTime;\n" +
          shader.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
        // 3.46.0: the slow wind — a small-angle lean of every blade on its own phase, pivoting
        // around the blade's middle (the matrices stay static on the GPU)
        transformed.x -= sin(uTime * aSpeed + aPhase) * ${REED_WIND} * transformed.y;
        transformed.z += cos(uTime * aSpeed * 0.83 + aPhase) * ${REED_WIND} * transformed.y;
`,
          );
      };
    }
    rlInst(group, new DodecahedronGeometry(0.6), new MeshLambertMaterial({ flatShading: true }), rocks);
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        if (rng.chance(0.55)) {
          // glowcap mushroom: pale stem, a teal cap with glowing spots, spores drifting up
          rlMesh(
            props,
            new CylinderGeometry(obstacle.r * 0.22, obstacle.r * 0.32, 1.25, 8),
            stem,
            obstacle.x,
            0.62,
            obstacle.y,
          );
          const capMesh = rlMesh(
            props,
            new SphereGeometry(obstacle.r * 1.02, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            cap,
            obstacle.x,
            1.18,
            obstacle.y,
          );
          capMesh.scale.y = 0.6;
          const under = rlMesh(props, new CircleGeometry(obstacle.r * 1.0, 18), gill, obstacle.x, 1.18, obstacle.y);
          under.rotation.x = Math.PI / 2;
          for (let j = 0; j < 6; j++) {
            const angle = rng.range(0, Math.PI * 2),
              el = rng.range(0.25, 1.2);
            rlMesh(
              props,
              new SphereGeometry(rng.range(0.06, 0.12), 6, 4),
              spot,
              obstacle.x + Math.cos(angle) * Math.sin(el) * obstacle.r,
              1.18 + Math.cos(el) * obstacle.r * 0.6,
              obstacle.y + Math.sin(angle) * Math.sin(el) * obstacle.r,
            );
          }
          view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 1.2 + obstacle.r * 0.6, k: "spore" });
        } else {
          // dead tree: bare trunk, crooked branches, roots and a collar of moss
          rlMesh(
            props,
            new CylinderGeometry(obstacle.r * 0.26, obstacle.r * 0.55, 2.2, 7),
            bark,
            obstacle.x,
            1.1,
            obstacle.y,
            rng.range(0, 6),
          );
          for (let j = 0; j < 3; j++) {
            const angle = rng.range(0, Math.PI * 2),
              branch = rlMesh(
                props,
                new CylinderGeometry(
                  Math.min(0.04, obstacle.r * 0.08),
                  Math.min(0.1, obstacle.r * 0.18),
                  Math.min(1.0, obstacle.r * 0.9),
                  5,
                ),
                bark,
                obstacle.x + Math.cos(angle) * obstacle.r * 0.3,
                rng.range(1.5, 2.1),
                obstacle.y + Math.sin(angle) * obstacle.r * 0.3,
              );
            branch.rotation.set(Math.sin(angle) * 0.9, 0, -Math.cos(angle) * 0.9);
          }
          for (let j = 0; j < 4; j++) {
            const angle = (j / 4) * Math.PI * 2 + rng.range(-0.3, 0.3),
              root = rlMesh(
                props,
                new CylinderGeometry(0.05, obstacle.r * 0.18, obstacle.r * 0.9, 5),
                bark,
                obstacle.x + Math.cos(angle) * obstacle.r * 0.55,
                0.16,
                obstacle.y + Math.sin(angle) * obstacle.r * 0.55,
              );
            root.rotation.set(Math.sin(angle) * 1.2, 0, -Math.cos(angle) * 1.2);
          }
          const col = rlMesh(
            props,
            new TorusGeometry(obstacle.r * 0.5, 0.14, 5, 14),
            moss,
            obstacle.x,
            0.14,
            obstacle.y,
          );
          col.rotation.x = Math.PI / 2;
        }
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, ring);
      } else {
        // fallen log along the long side, glow-moss on top, two small glowcaps
        const longX = obstacle.w >= obstacle.h,
          len = Math.max(obstacle.w, obstacle.h) * 2,
          rad = Math.max(0.3, Math.min(obstacle.w, obstacle.h) * 0.9),
          log = rlMesh(props, new CylinderGeometry(rad, rad * 1.05, len, 10), bark, obstacle.x, rad, obstacle.y);
        if (longX) {
          log.rotation.z = Math.PI / 2;
        } else {
          log.rotation.x = Math.PI / 2;
        }
        rlMesh(
          props,
          propBox(longX ? len * 0.8 : rad * 1.1, 0.1, longX ? rad * 1.1 : len * 0.8),
          moss,
          obstacle.x,
          rad * 1.95,
          obstacle.y,
        );
        for (const side of [-1, 1]) {
          const endCap = rlMesh(
            props,
            new CircleGeometry(rad * 0.92, 12),
            wood,
            obstacle.x + (longX ? (side * len) / 2 + side * 0.02 : 0),
            rad,
            obstacle.y + (longX ? 0 : (side * len) / 2 + side * 0.02),
          );
          if (longX) {
            endCap.rotation.y = (side * Math.PI) / 2;
          } else {
            endCap.rotation.y = side > 0 ? 0 : Math.PI;
          }
        }
        for (let j = 0; j < 2; j++) {
          const pos = rng.range(-0.3, 0.3) * len,
            mx = obstacle.x + (longX ? pos : 0),
            mz = obstacle.y + (longX ? 0 : pos);
          rlMesh(props, new CylinderGeometry(0.04, 0.05, 0.25, 5), stem, mx, rad * 2 + 0.12, mz);
          rlMesh(props, new SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), spot, mx, rad * 2 + 0.24, mz);
        }
        rlFootSlab(props, obstacle, ring, 0.2);
      }
  },
  // The Shattered Core: an energy barrier over the abyss, floating obelisks and hovering monoliths
  void(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      obsid = new MeshLambertMaterial({ color: 0x52416c, emissive: 0x12072a, flatShading: true }),
      rim = rlGlow(biome.grid),
      hot = rlGlow(biome.accent),
      wall = additiveMaterial(null, { color: biome.grid, opacity: 0.13, side: DoubleSide }),
      wallH = 1.8;
    for (const [bx, bz, len, rot] of [
      [0, -H, W * 2, 0],
      [0, H, W * 2, 0],
      [-W, 0, H * 2, Math.PI / 2],
      [W, 0, H * 2, Math.PI / 2],
    ]) {
      rlMesh(group, new PlaneGeometry(len, wallH), wall, bx, wallH / 2, bz, rot);
      rlMesh(group, propBox(rot ? 0.06 : len, 0.05, rot ? len : 0.06), rim, bx, 0.03, bz);
      rlMesh(
        group,
        propBox(rot ? 0.04 : len, 0.03, rot ? len : 0.04),
        rim,
        bx + Math.sign(bx) * 0.025,
        wallH,
        bz + Math.sign(bz) * 0.025,
      );
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const crystal = rlMesh(group, new OctahedronGeometry(0.45), hot, sx * (W + 0.55), 1.3, sz * (H + 0.55));
        crystal.scale.y = 1.8;
        view.rlAnim.push({ o: crystal, k: "spin", s: 1.2, b: 1.3, ph: sx + sz * 2 });
      }
    // A fractured crown hangs beyond the north barrier. It gives the Core a stable silhouette
    // without taking space from combat or adding collision geometry inside the arena.
    const crownZ = -H - 1.7,
      crown = new Group();
    // Lower the whole structure into the abyss so its suspended core stays inside the camera's
    // upper edge on both the desktop and the shallower landscape-touch framing.
    crown.position.set(0, -1.35, crownZ);
    group.add(crown);
    for (const side of [-1, 1]) {
      const pylon = rlMesh(crown, new ConeGeometry(0.7, 4.2, 4), obsid, side * 1.95, 1.45, 0);
      pylon.rotation.z = side * -0.3;
      rlMesh(crown, propBox(0.09, 3.15, 0.22), rim, side * 1.7, 1.55, -0.2).rotation.z = side * -0.3;
      const shard = rlMesh(crown, new OctahedronGeometry(0.56), obsid, side * 3.1, 3.25, 0.15);
      shard.scale.set(0.75, 1.75, 0.75);
      shard.rotation.z = side * 0.48;
    }
    const core = rlMesh(crown, new OctahedronGeometry(0.82), hot, 0, 2.45, 0),
      halo = rlMesh(crown, new TorusGeometry(1.4, 0.07, 6, 36), rim, 0, 2.45, 0);
    core.scale.y = 1.35;
    halo.rotation.x = Math.PI / 2;
    halo.rotation.z = 0.35;
    view.rlAnim.push({ o: core, k: "spinbob", s: 0.48, b: 2.45, ph: 0.7, a: 0.12 });
    view.rlAnim.push({ o: halo, k: "spin", s: -0.32, b: 2.45, ph: 1.4 });
    // rocks drifting in the abyss around the arena
    const rocks = [];
    for (let j = 0; j < 46; j++) {
      const side = rng.int(0, 3),
        along = rng.range(-1, 1),
        out = rng.range(1.6, 9),
        px = side < 2 ? along * (W + 6) : (side === 2 ? -1 : 1) * (W + out),
        pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 6),
        size = rng.range(0.3, 1.3);
      rocks.push({
        x: px,
        y: rng.range(-3, 0.4),
        z: pz,
        rx: rng.range(0, 6),
        ry: rng.range(0, 6),
        sx: size,
        sy: size * rng.range(0.6, 1.2),
        sz: size,
        c: rng.pick([0x2a1c44, 0x1e1434, 0x352654]),
      });
    }
    const drift = new Group();
    group.add(drift);
    rlInst(
      drift,
      new DodecahedronGeometry(0.8),
      new MeshLambertMaterial({ emissive: 0x0a0418, flatShading: true }),
      rocks,
    );
    view.rlAnim.push({ o: drift, k: "bob", b: 0, ph: 0, a: 0.25, s: 0.35 });
    // 3.52.0: the Shattered Core: the rift's shattering throws the other places' debris past the
    // tiles - obsidian from the caldera, ice from the Shelf, glowcap wood from the marsh, a lit
    // splinter of the City's neon - drifting on the same slow bob
    const debris = [];
    for (let j = 0; j < 26; j++) {
      const side = rng.int(0, 3),
        along = rng.range(-1, 1),
        out = rng.range(1.8, 8),
        px = side < 2 ? along * (W + 5) : (side === 2 ? -1 : 1) * (W + out),
        pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 5),
        size = rng.range(0.2, 0.7);
      debris.push({
        x: px,
        y: rng.range(-2, 2.2),
        z: pz,
        rx: rng.range(0, 6),
        ry: rng.range(0, 6),
        sx: size,
        sy: size * rng.range(1.3, 2.4),
        sz: size,
        c: rng.pick([0x241a30, 0x241a30, 0x9fd8f0, 0x2a4a3c, 0x46e8ff, 0x52416c]),
      });
    }
    rlInst(
      drift,
      new OctahedronGeometry(0.6),
      new MeshLambertMaterial({ emissive: 0x0a0a18, flatShading: true }),
      debris,
    );
    // a few of the City's broken signposts hang in the abyss, their neon still buzzing
    for (let j = 0; j < 4; j++) {
      const side = rng.int(0, 3),
        along = rng.range(-0.7, 0.7),
        out = rng.range(3, 7),
        px = side < 2 ? along * (W + 4) : (side === 2 ? -1 : 1) * (W + out),
        pz = side < 2 ? (side === 0 ? -1 : 1) * (H + out) : along * (H + 4),
        post = rlMesh(
          drift,
          propBox(0.09, 2.6, 0.09),
          new MeshLambertMaterial({ color: 0x1a2030, flatShading: true }),
          px,
          rng.range(-1.5, 0.5),
          pz,
        ),
        panel = rlMesh(
          drift,
          propBox(1.1, 0.55, 0.07),
          new MeshLambertMaterial({ color: 0x202838, flatShading: true }),
          px + 0.4,
          post.position.y + 0.9,
          pz,
        );
      panel.rotation.y = rng.range(0, 3);
      post.rotation.z = rng.range(-0.35, 0.35);
      rlMesh(drift, propBox(1.14, 0.08, 0.03), hot, px + 0.4, panel.position.y + 0.24, pz);
      view.rlAnim.push({ o: panel, k: "spin", s: 0.22, b: panel.position.y, ph: j * 1.7 });
    }
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // floating obelisk with an orbiting ring over a rune circle
        const obelisk = rlMesh(props, new OctahedronGeometry(obstacle.r * 0.72), obsid, obstacle.x, 1.6, obstacle.y);
        obelisk.scale.y = 2.3;
        view.rlAnim.push({ o: obelisk, k: "spinbob", s: 0.6, b: 1.6, ph: obstacle.x * 1.7 + obstacle.y, a: 0.12 });
        const orb = rlMesh(props, new TorusGeometry(obstacle.r * 0.95, 0.04, 4, 32), hot, obstacle.x, 1.6, obstacle.y);
        orb.rotation.x = 1.2;
        view.rlAnim.push({ o: orb, k: "spin", s: 1.4, b: 1.6, ph: obstacle.y });
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, rim);
        const pad = rlMesh(
          props,
          new CircleGeometry(obstacle.r * 0.95, 24),
          additiveMaterial(null, { color: biome.accent, opacity: 0.16 }),
          obstacle.x,
          0.04,
          obstacle.y,
        );
        pad.rotation.x = -Math.PI / 2;
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 0.6, k: "mote" });
      } else {
        // monolith hovering above its outline, glowing seams on the edges
        const height = 2.0,
          mono = new Group();
        mono.position.set(obstacle.x, 0.3 + height / 2, obstacle.y);
        props.add(mono);
        rlMesh(mono, propBox(obstacle.w * 2 * 0.92, height, obstacle.h * 2 * 0.92), obsid, 0, 0, 0);
        // Recessed crown plates break up the broad flat top without adding floor clutter.
        for (const side of [-1, 1]) {
          rlMesh(
            mono,
            propBox(obstacle.w * 0.62, 0.09, obstacle.h * 1.35),
            obsid,
            side * obstacle.w * 0.43,
            height / 2 + 0.045,
            0,
          );
          rlMesh(mono, propBox(0.035, 0.012, obstacle.h * 0.6), rim, side * obstacle.w * 0.43, height / 2 + 0.096, 0);
        }
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            rlMesh(mono, propBox(0.05, height + 0.02, 0.05), rim, sx * obstacle.w * 0.92, 0, sz * obstacle.h * 0.92);
        for (const side of [-1, 1]) {
          rlMesh(mono, propBox(obstacle.w * 2 * 0.92 + 0.04, 0.05, 0.05), hot, 0, height / 2, side * obstacle.h * 0.92);
          rlMesh(mono, propBox(0.05, 0.05, obstacle.h * 2 * 0.92 + 0.04), hot, side * obstacle.w * 0.92, height / 2, 0);
        }
        view.rlAnim.push({ o: mono, k: "bob", b: 0.3 + height / 2, ph: obstacle.x + obstacle.y * 0.7, a: 0.1, s: 1.1 });
        rlFootSlab(props, obstacle, rim, 0.2);
      }
  },
  // Ashfall Caldera (3.49.0): a basalt rampart around the crater with ember pockets in it, three fire
  // beacons over the floor, obsidian spires where the tables stood, charred slabs and the long lava dyke
  club(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      rock = new MeshLambertMaterial({ color: 0x66584f, flatShading: true }),
      darkRock = new MeshLambertMaterial({ color: 0x51483f, flatShading: true }),
      obsidian = new MeshLambertMaterial({ color: 0x44424e, flatShading: true }),
      emberMat = rlGlow(0xff9c3a),
      hotMat = rlGlow(0xffe19a),
      accentMat = new MeshBasicMaterial({ color: biome.accent, toneMapped: false }),
      bake = rlMerger();
    // the rampart: rough basalt blocks with a dark cap, a molten seam behind every second block and
    // an ember pocket breathing in the others
    rlAlongBorder(W, H, 0.5, 2.2, (x, z, nx, nz) => {
      const along = nx === 0,
        ry = along ? 0 : Math.PI / 2,
        ix = x - nx * 0.2,
        iz = z - nz * 0.2;
      bake.add(propBox(2.1, 1.5, 0.36), rock, x, 0.75, z, ry);
      bake.add(propBox(2.16, 0.3, 0.44), darkRock, x, 1.6, z, ry);
      const k = Math.round((along ? x : z) / 2.2);
      if (k % 2 === 0) {
        bake.add(propBox(0.16, 0.5, 0.14), darkRock, ix, 1.0, iz, ry);
        bake.add(propBox(0.3, 0.22, 0.08), emberMat, ix, 1.42, iz, ry);
      } else {
        bake.add(propBox(1.9, 0.05, 0.06), emberMat, ix, 1.47, iz, ry);
      }
    });
    // Fire beacons sit beyond the rampart: tall non-colliding decoration must not hide the fight.
    const heatMat = additiveMaterial(null, { color: 0xffb45a, opacity: 0.035, side: DoubleSide });
    for (const [sx, sz] of [
      [-W - 2.2, -H * 0.45],
      [W + 2.2, -H * 0.45],
      [0, -H - 2.2],
    ]) {
      bake.add(new CylinderGeometry(0.24, 0.4, 2.6, 7), rock, sx, 1.3, sz);
      bake.add(new CylinderGeometry(0.36, 0.2, 0.34, 8), emberMat, sx, 2.72, sz);
      bake.add(new ConeGeometry(0.24, 0.6, 7), hotMat, sx, 3.1, sz);
      bake.add(new CylinderGeometry(0.5, 1.5, 5.4, 10, 1, true), heatMat, sx, 5.6, sz);
    }
    // the fissure line: a low rock ridge just inside the wall, cracked with a molten seam
    for (const [bx, bz, len, rot] of [
      [0, -H + 0.7, W * 2 - 2.4, 0],
      [0, H - 0.7, W * 2 - 2.4, 0],
      [-W + 0.7, 0, H * 2 - 2.4, Math.PI / 2],
      [W - 0.7, 0, H * 2 - 2.4, Math.PI / 2],
    ]) {
      bake.add(new CylinderGeometry(0.1, 0.15, len, 6), darkRock, bx, 0.12, bz, rot, 0, Math.PI / 2);
      bake.add(new CylinderGeometry(0.045, 0.045, len * 0.94, 6), emberMat, bx, 0.21, bz, rot, 0, Math.PI / 2);
    }
    bake.flush(group);
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // an obsidian spire: a shard stack over a skirt, a molten seam up its flank and a crack
        // ring at its foot
        const r = obstacle.r,
          tilt = rng.range(-0.07, 0.07);
        rlMesh(props, new ConeGeometry(r * 0.95, 0.5, 6), darkRock, obstacle.x, 0.25, obstacle.y);
        const spire = rlMesh(
          props,
          new ConeGeometry(r * 0.6, 1.5 + 0.3 * r, 5),
          obsidian,
          obstacle.x,
          0.95 + 0.2 * r,
          obstacle.y,
        );
        spire.rotation.z = tilt;
        const shard = rlMesh(
          props,
          new ConeGeometry(r * 0.34, 0.8, 5),
          obsidian,
          obstacle.x + r * 0.5,
          0.6,
          obstacle.y - r * 0.35,
        );
        shard.rotation.z = -tilt * 1.6;
        // the seam: a molten vein up the spire's face, fed by the ground crack
        rlMesh(
          props,
          propBox(0.05, 1.2 + 0.2 * r, 0.05),
          emberMat,
          obstacle.x + r * 0.22,
          0.9 + 0.2 * r,
          obstacle.y + r * 0.1,
          0,
          0,
          tilt,
        );
        rlFootRing(props, obstacle.x, obstacle.y, r * 0.88, emberMat);
        rlMesh(props, new SphereGeometry(0.07, 6, 5), hotMat, obstacle.x + r * 0.28, 0.34, obstacle.y);
      } else if (obstacle.w < 1.3 && obstacle.h < 1.3) {
        // a charred slab: a leaning monolith with an ember seam across its face
        const height = 1.15;
        const slab = rlMesh(
          props,
          propBox(obstacle.w * 2, height, obstacle.h * 2),
          darkRock,
          obstacle.x,
          height / 2,
          obstacle.y,
        );
        slab.rotation.z = 0.045;
        rlMesh(
          props,
          propBox(obstacle.w * 2 + 0.05, 0.05, 0.05),
          emberMat,
          obstacle.x,
          height * 0.62,
          obstacle.y + obstacle.h - 0.03,
        );
        rlFootSlab(props, obstacle, emberMat, 0.24);
      } else {
        // One local frame rotates the ridge, seams and vents together.
        const materials = { rock, darkRock, emberMat, hotMat, accentMat };
        for (const part of calderaRidgeParts(obstacle)) props.add(new Mesh(part.geometry, materials[part.role]));
        rlFootSlab(props, obstacle, emberMat, 0.24);
      }
  },
  // The Glass Flats (3.53.0): a low sand berm with glass shards along the border, glass ridges and
  // half-melted sandstone slabs on the field - the noon light does the rest
  flats(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      // 3.55.0: the berm and the sandstone read as pale sunlit sand (the dark browns turned the
      // border into a caterpillar of boxes against the near-white floor), the glass runs brighter
      sand = new MeshLambertMaterial({ color: 0x8a7048, flatShading: true }),
      sandstone = new MeshLambertMaterial({ color: 0x745c38, flatShading: true }),
      glass = new MeshLambertMaterial({
        color: 0xa4d4d8,
        emissive: 0x253d40,
        transparent: true,
        opacity: 0.84,
        flatShading: true,
      }),
      hotGlass = new MeshLambertMaterial({ color: 0xdbf0e9, emissive: 0x435c58, flatShading: true }),
      glow = rlGlow(biome.grid, 0.7),
      hot = rlGlow(biome.accent, 0.8),
      bake = rlMerger();
    // the berm: pale drifts piled along the border, glass shards standing in them
    rlAlongBorder(W, H, 0.5, 1.9, (x, z, nx, nz) => {
      const along = nx === 0;
      bake.add(propBox(along ? 2.4 : 0.9, 0.5, along ? 0.9 : 2.4), sand, x, 0.22, z, 0);
      bake.add(new SphereGeometry(0.55, 7, 5), sand, x + nx * 0.2, 0.3, z + nz * 0.2);
      if (Math.round((along ? x : z) * 7) % 2 === 0)
        bake.add(new ConeGeometry(0.14, rng.range(0.7, 1.5), 4), glass, x, 0.75, z, 0, 0, rng.range(-0.3, 0.3));
    });
    bake.flush(group);
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // a glass ridge: two low sheets fused at the middle and leaning a little, a hot core of
        // sand under a glare ring (tall sheets read as dark scribbles from the steep camera - the
        // first take's lesson)
        const a = rng.range(0, Math.PI);
        for (const [dx, dz, lean] of [
          [0, 0, 0.14],
          [Math.cos(a + 1.2) * obstacle.r * 0.32, Math.sin(a + 1.2) * obstacle.r * 0.32, -0.12],
        ]) {
          const sheet = rlMesh(
            props,
            propBox(obstacle.r * 1.3, obstacle.r * 1.1, 0.14),
            glass,
            obstacle.x + dx,
            obstacle.r * 0.4,
            obstacle.y + dz,
          );
          sheet.rotation.set(lean * Math.sin(a), a, lean * Math.cos(a));
          // 3.55.0: both sheets carry the hot fused edge (one read as a bare sheet from above)
          const edge = rlMesh(
            props,
            propBox(obstacle.r * 1.3, 0.05, 0.05),
            hotGlass,
            obstacle.x + dx,
            obstacle.r * 0.96,
            obstacle.y + dz,
          );
          edge.rotation.set(lean * Math.sin(a), a, lean * Math.cos(a));
        }
        rlMesh(
          props,
          new CylinderGeometry(obstacle.r * 0.5, obstacle.r * 0.7, 0.24, 7),
          hotGlass,
          obstacle.x,
          0.12,
          obstacle.y,
        );
        rlFootRing(props, obstacle.x, obstacle.y, obstacle.r * 1.08, glow);
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 1.2, k: "glint" });
      } else {
        // a sandstone slab half-melted: the top ran to glass, the sand piled against the wind side
        const hgt = 1.0;
        rlMesh(
          props,
          propBox(obstacle.w * 2 * 0.8, hgt * 0.75, obstacle.h * 2 * 0.8),
          sandstone,
          obstacle.x,
          hgt * 0.36,
          obstacle.y,
        );
        rlMesh(
          props,
          propBox(obstacle.w * 2 * 0.86, 0.14, obstacle.h * 2 * 0.86),
          hotGlass,
          obstacle.x,
          hgt * 0.78,
          obstacle.y,
        );
        rlMesh(
          props,
          propBox(obstacle.w * 2 * 0.92, 0.14, obstacle.h * 2 * 0.92),
          glass,
          obstacle.x,
          hgt * 0.78 + 0.13,
          obstacle.y,
        );
        rlFootSlab(props, obstacle, hot, 0.22);
      }
  },
};

// Ambient particles: the air of the biome, around the camera, plus sparks/spores/glints from props.
const RL_C = {
  ember: new Color(0xffa040),
  ember2: new Color(0xffd070),
  snow: new Color(0xdceeff),
  white: new Color(0xffffff),
  rain: new Color(0x9fb4cc),
  steam: new Color(0x5a6270),
  fly: new Color(0xffd98a), // 3.44.0: the Glowmarsh's fireflies, the one warm light in the night
  ash: new Color(0x8a7f74), // 3.49.0: the caldera's falling ash
};
function rlAmbient(renderer, dt, world, opt) {
  const biome = renderer.biome,
    arena = renderer.arena;
  if (!biome || !(dt > 0) || dt > 0.25) return;
  const density = atmosphereDensity(renderer.maxParticles, renderer.P.n, opt.menu || !world),
    W = arena.uniforms.uHalf.value.x,
    H = arena.uniforms.uHalf.value.y,
    cx = opt.menu || !world ? 0 : renderer.camX,
    cz = opt.menu || !world ? 0 : renderer.camZ,
    count = (rate) => {
      const want = rate * dt * density,
        whole = Math.floor(want);
      return whole + (Math.random() < want - whole ? 1 : 0);
    },
    rx = (spread = 15) => clamp(cx + (Math.random() * 2 - 1) * spread, -W, W),
    rz = (spread = 12) => clamp(cz + (Math.random() * 2 - 1) * spread - 2, -H, H),
    grid = hexColor(biome.grid),
    acc = hexColor(biome.accent);
  const range = (v) => v[0] + Math.random() * (v[1] - v[0]);
  for (const layer of biomeAtmosphere[biome.id] || []) {
    for (let j = count(layer.rate); j--;) {
      const tint = layer.colors[Math.floor(Math.random() * layer.colors.length)];
      renderer.emit(
        rx(layer.spread[0]),
        range(layer.height),
        rz(layer.spread[1]),
        range(layer.velocity[0]),
        range(layer.velocity[1]),
        range(layer.velocity[2]),
        range(layer.life),
        range(layer.size),
        tint === "accent" ? acc : tint === "grid" ? grid : hexColor(tint),
        { drag: layer.drag, grow: layer.grow, spark: layer.spark, ambient: true },
      );
    }
  }
  if (!(arena.rise >= 1) || !arena.rlEmit) return;
  for (const src of arena.rlEmit) {
    if (Math.abs(src.x - cx) > 22 || Math.abs(src.z - cz) > 18) continue;
    if (src.k === "spark") {
      if (count(propAtmosphereRates.spark)) {
        renderer.emit(
          src.x + (Math.random() - 0.5) * 0.4,
          src.y,
          src.z + (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.6,
          1.6 + Math.random() * 1.4,
          (Math.random() - 0.5) * 0.6,
          1.3,
          0.22,
          RL_C.ember,
          { ambient: true, drag: 0.6, grow: 1.2 },
        );
      }
    } else if (src.k === "steam") {
      // 3.4.0: steam rising from the manholes of Blackout City
      if (count(propAtmosphereRates.steam)) {
        renderer.emit(
          src.x + (Math.random() - 0.5) * 0.5,
          src.y,
          src.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.3,
          0.7 + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.3,
          2.2,
          0.35,
          RL_C.steam,
          { ambient: true, drag: 0.3, grow: 2.2 },
        );
      }
    } else if (src.k === "glint") {
      if (count(propAtmosphereRates.glint)) {
        renderer.emit(
          src.x + (Math.random() - 0.5),
          src.y * Math.random(),
          src.z + (Math.random() - 0.5),
          0,
          0.2,
          0,
          0.6,
          0.2,
          RL_C.white,
          { ambient: true, spark: true, drag: 0 },
        );
      }
    } else if (src.k === "spore") {
      if (count(propAtmosphereRates.spore)) {
        renderer.emit(
          src.x + (Math.random() - 0.5),
          src.y,
          src.z + (Math.random() - 0.5),
          (Math.random() - 0.5) * 0.3,
          0.4 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.3,
          3,
          0.14,
          acc,
          { ambient: true, drag: 0.1 },
        );
      }
    } else if (src.k === "mote") {
      if (count(propAtmosphereRates.mote)) {
        const angle = Math.random() * TAU;
        renderer.emit(
          src.x + Math.cos(angle) * 1.1,
          src.y,
          src.z + Math.sin(angle) * 1.1,
          -Math.cos(angle) * 0.5,
          0.9,
          -Math.sin(angle) * 0.5,
          1.4,
          0.12,
          grid,
          { ambient: true, drag: 0 },
        );
      }
    }
  }
}

/* ---- 2.4.1: enemies and bosses wear the biome. A skin is laid over every enemy model by the
 shader (same shapes, same type colours and glow, so types stay recognisable):
   Blackout City rain-wet with a cold sheen, drops running down, red and blue emergency light on the rims (3.4.0)
   The Aurora Shelf frost on the upper surfaces with glints, a cold tint, a rim that drifts aurora green to pink (3.51.0)
   The Glowmarsh a wet dark hide, veins of cold light that breathe, a shine of drips (3.50.0)
   The Shattered Core
                 violet rim glow and star specks, motes rising
  Ashfall Caldera a charred cinder shell, white-hot fissures that breathe, an ember rim (3.49.0)
 The skin is only visual; how an enemy fights does not change. ---- */
const RL_SKIN = { uSkin: { value: 0 }, uSkinT: { value: 0 } };
const RL_SKIN_VERT_HEAD = `
varying vec3 vRlP;
varying vec3 vRlN;`;
const RL_SKIN_VERT_BODY = `
vRlP = position;
#ifdef USE_INSTANCING
vRlN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
vRlN = normalize(mat3(modelMatrix) * objectNormal);
#endif`;
const RL_SKIN_FRAG_HEAD = `
uniform float uSkin;
uniform float uSkinT;
varying vec3 vRlP;
varying vec3 vRlN;
float rlH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rlN3(vec3 x) {
vec3 i = floor(x), f = fract(x);
f = f * f * (3.0 - 2.0 * f);
return mix(mix(mix(rlH3(i), rlH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 0.0)), rlH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
  mix(mix(rlH3(i + vec3(0.0, 0.0, 1.0)), rlH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rlH3(i + vec3(0.0, 1.0, 1.0)), rlH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;
const RL_SKIN_FRAG_BODY = `
{
// All six skins share one coverage limit: type colours remain the primary combat signal.
vec3 rlOriginalLight = outgoingLight;
int rlS = int(uSkin + 0.5);
if (rlS == 2) {
  // frost on everything facing up, glints, a cold tint, and a rim that drifts aurora green to pink (3.51.0)
  float fr = smoothstep(-0.05, 0.6, vRlN.y + (rlN3(vRlP * 6.0) - 0.5) * 0.9);
  outgoingLight = outgoingLight * vec3(0.72, 0.9, 1.15);
  outgoingLight = mix(outgoingLight, vec3(0.72, 0.9, 1.0) * (0.6 + 0.35 * max(vRlN.y, 0.0)), fr * 0.35);
  float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
  outgoingLight +=
    mix(vec3(0.55, 0.85, 1.0), vec3(0.75, 0.5, 0.95), 0.5 + 0.5 * sin(uSkinT * 0.6 + vRlP.x * 1.7)) * rim * 0.32;
  float gl = step(0.86, rlN3(vRlP * 16.0)) * (0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 30.0));
  outgoingLight += vec3(0.9, 0.97, 1.0) * gl * (0.25 + fr) * 0.7;
} else if (rlS == 3) {
  // the Glowmarsh (3.50.0): a wet dark hide, veins of cold light that breathe, a shine of drips
  float vein = smoothstep(0.1, 0.0, abs(rlN3(vec3(vRlP.x * 4.0, vRlP.y * 1.6 + uSkinT * 0.22, vRlP.z * 4.0)) - 0.5));
  outgoingLight = outgoingLight * vec3(0.62, 0.8, 0.74);
  outgoingLight += vec3(0.2, 0.95, 0.66) * vein * (0.4 + 0.3 * sin(uSkinT * 1.8 + vRlP.y * 6.0));
  float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
  outgoingLight += vec3(0.32, 0.9, 0.7) * rim * 0.3;
  float drip = smoothstep(0.8, 0.95, rlN3(vec3(vRlP.x * 9.0, vRlP.y * 2.2 + uSkinT * 1.2, vRlP.z * 9.0)));
  outgoingLight += vec3(0.75, 1.0, 0.9) * drip * 0.28;
} else if (rlS == 5) {
  // 3.4.0: Blackout City: rain-wet, a cold sheen on the upper faces, drops running down, and the red and blue of
  // emergency lights sweeping over the rims
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
  float wet = smoothstep(0.1, 0.9, vRlN.y);
  outgoingLight = outgoingLight * vec3(0.72, 0.75, 0.85) + vec3(0.55, 0.62, 0.75) * wet * 0.18;
  float drop = smoothstep(0.8, 0.95, rlN3(vec3(vRlP.x * 9.0, vRlP.y * 2.5 + uSkinT * 1.6, vRlP.z * 9.0)));
  outgoingLight += vec3(0.7, 0.8, 0.95) * drop * 0.35;
  float sweep = 0.5 + 0.5 * sin(uSkinT * 5.0 + vRlP.x * 1.5);
  outgoingLight += mix(vec3(1.0, 0.12, 0.18), vec3(0.15, 0.35, 1.0), step(0.5, sweep)) * fres * 0.55;
} else if (rlS == 4) {
  // void: violet rim and drifting star specks
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  float crack = smoothstep(0.07, 0.0, abs(rlN3(vRlP * 3.5 + vec3(0.0, uSkinT * 0.25, 0.0)) - 0.5));
  outgoingLight = outgoingLight * vec3(0.62, 0.5, 0.85) + vec3(0.72, 0.28, 1.0) * (fres * 1.5 + crack * (0.6 + 0.4 * sin(uSkinT * 3.0 + vRlP.y * 5.0)));
  vec3 sc = vRlP * 10.0 + vec3(0.0, uSkinT * 0.6, 0.0);
  float st = step(0.94, rlH3(floor(sc))) * smoothstep(0.32, 0.12, length(fract(sc) - 0.5));
  outgoingLight += vec3(0.9, 0.8, 1.0) * st * 0.6;
} else if (rlS == 6) {
  // 3.49.0: the Ashfall Caldera: ash settles on the upper faces while the shell beneath smoulders -
  // thin white-hot fissures that breathe and an ember rim (the Works' skin burns orange, this one whitens)
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  float ashTop = smoothstep(0.15, 0.75, vRlN.y);
  outgoingLight = mix(outgoingLight * vec3(0.45, 0.42, 0.4), vec3(0.5, 0.47, 0.44), ashTop * 0.55);
  float n = rlN3(vRlP * 5.5);
  float crack = smoothstep(0.1, 0.0, abs(n - 0.5)) * smoothstep(0.3, 0.75, 0.5 + 0.5 * sin(uSkinT * 2.2 + vRlP.y * 3.0));
  outgoingLight += vec3(1.0, 0.78, 0.42) * crack * (1.0 - ashTop * 0.6);
  outgoingLight += vec3(1.0, 0.55, 0.18) * fres * 0.45;
  float glint = step(0.93, rlN3(vRlP * 12.0 + vec3(0.0, uSkinT * 0.4, 0.0)));
  outgoingLight += vec3(1.0, 0.88, 0.6) * glint * 0.22;
} else if (rlS == 7) {
  // 3.53.0: the Glass Flats: sun-bleached shells - pale hot tops, a glare that slides over them,
  // sand in the seams, and the Sunstruck's gleam rides the rim
  float top = smoothstep(0.1, 0.7, vRlN.y);
  outgoingLight = mix(outgoingLight * vec3(0.9, 0.82, 0.7), vec3(1.0, 0.94, 0.82) * (0.55 + 0.3 * top), top * 0.5);
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
  float slide = 0.5 + 0.5 * sin(uSkinT * 1.1 + vRlP.x * 4.0 + vRlP.z * 3.0);
  outgoingLight += vec3(1.0, 0.92, 0.7) * fres * (0.2 + 0.25 * slide);
  float sand = step(0.88, rlN3(vRlP * 9.0)) * smoothstep(0.2, 0.0, vRlN.y);
  outgoingLight += vec3(0.55, 0.45, 0.3) * sand * 0.3;
  float gl = step(0.94, rlN3(vRlP * 14.0 + vec3(uSkinT * 0.3, 0.0, 0.0)));
  outgoingLight += vec3(1.0, 0.97, 0.88) * gl * 0.3;
}
outgoingLight = mix(rlOriginalLight, outgoingLight, 0.42);
}`;
// Adds the skin (and, for enemy bodies, the hit flash they already had) to a Lambert material.
function rlSkinMaterial(mat, flash) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkin = RL_SKIN.uSkin;
    shader.uniforms.uSkinT = RL_SKIN.uSkinT;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>${RL_SKIN_VERT_HEAD}${flash ? "\nattribute float aFlash;\nvarying float vFlash;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>${RL_SKIN_VERT_BODY}${flash ? "\nvFlash = aFlash;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>${RL_SKIN_FRAG_HEAD}${flash ? "\nvarying float vFlash;" : ""}`)
      .replace(
        "#include <opaque_fragment>",
        `${RL_SKIN_FRAG_BODY}${flash ? "\noutgoingLight = mix(outgoingLight, vec3(1.0), vFlash);" : ""}\n#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (flash ? "flashLambertSkin" : "lambertSkin");
  mat.needsUpdate = true;
  mat.rlSkin = true;
}
const RL_SKIN_FX = {
  2: { c: new Color(0xdcf0ff), vy: -0.35, grav: 0, life: 0.9, size: 0.18, spark: true },
  3: { c: new Color(0x8cff3a), vy: -0.2, grav: 7, life: 0.6, size: 0.13, spark: false },
  4: { c: new Color(0xc070ff), vy: 0.9, grav: 0, life: 0.9, size: 0.12, spark: false },
  // 3.4.0: Blackout City: water dripping off
  5: { c: new Color(0xa8c4e0), vy: -0.4, grav: 9, life: 0.5, size: 0.08, spark: true },
  // 3.49.0: the Ashfall Caldera: embers lift off the cinder shell
  6: { c: new Color(0xffc87a), vy: 1.1, grav: 2.5, life: 0.55, size: 0.08, spark: true },
  // 3.53.0: the Glass Flats: the heat lifts pale motes off the shells
  7: { c: new Color(0xffe9c4), vy: 1.4, grav: 0.6, life: 0.7, size: 0.07, spark: false },
};
function rlSkinParticles(renderer, dt, world) {
  const fx = RL_SKIN_FX[RL_SKIN.uSkin.value];
  if (!fx || !world || !(dt > 0) || dt > 0.25) return;
  const count = world.enemies.length,
    density = Math.min(1, renderer.maxParticles / 1400),
    rate = Math.min(3.2, 100 / Math.max(1, count)) * density;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.ghost || enemy.spawnT > 0) continue;
    const big = enemy.boss ? 6 : 1;
    if (Math.random() >= rate * big * dt) continue;
    const angle = Math.random() * TAU,
      dist = Math.random() * enemy.r * 0.8;
    renderer.emit(
      enemy.x + Math.cos(angle) * dist,
      0.3 + enemy.r * (enemy.boss ? 1.4 : 0.9),
      enemy.y + Math.sin(angle) * dist,
      (Math.random() - 0.5) * 0.4,
      fx.vy * (0.7 + Math.random() * 0.6),
      (Math.random() - 0.5) * 0.4,
      fx.life,
      fx.size * (enemy.boss ? 1.6 : 1),
      fx.c,
      { ambient: true, drag: 0.4, grav: fx.grav, spark: fx.spark },
    );
  }
}

export { RL_BIOME_LOOK, RL_BIOME_TINT, RL_SKIN, ArenaView, rlAmbient, rlSkinMaterial, rlSkinParticles };
