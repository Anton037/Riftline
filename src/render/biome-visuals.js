// Biome looks: floors, props, borders, ambient particles and the enemy skins (shaders).

import {
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
import { createAurora } from "./aurora.js";
import { mushroomCapGeometry, topCoatGeometry } from "./natural-geometry.js";
import { createGroundOcclusion } from "./ground-occlusion.js";
import { worldMaterial, setWorldShadows } from "./world-material.js";
import { strataGeometry, shardGeometry } from "./strata-geometry.js";
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
#include <shadowmap_pars_vertex>
varying vec2 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xz;
  vec4 worldPosition = wp;
  vec3 transformedNormal = normalMatrix * normal;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
  #include <shadowmap_vertex>
}`,
  ArenaView = class {
    constructor(scene) {
      this.scene = scene;
      this.group = new Group();
      scene.add(this.group);
      this.uniforms = UniformsUtils.merge([
        UniformsLib.fog,
        UniformsLib.lights,
        {
          uTerrainMap: { value: null },
          uTerrainReady: { value: 0 },
          uOcclusion: { value: null },
          uGrid: { value: new Color() },
          uHalf: { value: new Vector2(18, 18) },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          // 2.4.0: the floor of each biome is a style of one shader (RL_FLOOR_FRAG)
          uStyle: { value: 0 },
          // 3.4.0: how dark the Blackout makes the floor (0..1); the lights of blasts and arcs still light it
          uDark: { value: 0 },
          // 3.29.0: the colour of the floor: how saturated (1 = as the palette says) and how bright it is, per biome
          uVivid: { value: 1 },
          uGain: { value: 1 },
          uL: { value: Array.from({ length: 6 }, () => new Vector4()) },
          uLC: { value: Array.from({ length: 6 }, () => new Color()) },
        },
      ]);
      this.floorMat = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: floorVertexShader,
        fragmentShader: RL_FLOOR_FRAG,
        fog: true,
        lights: true,
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
      const look = RL_BIOME_LOOK[biome.id] || RL_BIOME_LOOK.city,
        uniforms = this.uniforms;
      uniforms.uGrid.value.setHex(biome.grid);
      uniforms.uHalf.value.set(layout.W, layout.H);
      this.groundOcclusion?.dispose();
      this.groundOcclusion = createGroundOcclusion(layout.W, layout.H, layout.obs);
      uniforms.uOcclusion.value = this.groundOcclusion;
      uniforms.uStyle.value = look.style;
      uniforms.uVivid.value = look.vivid || 1;
      uniforms.uGain.value = look.gain || 1;
      const floor = new Mesh(new PlaneGeometry(100, 100), this.floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.group.add(floor);
      const props = new Group();
      this.group.add(props);
      this.obsGroup = props;
      this.rlAnim = [];
      this.rlEmit = [];
      (RL_BIOME_BUILD[biome.id] || RL_BIOME_BUILD.city)(
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
      setWorldShadows(this.obsGroup);
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
            fractured blue ice ridges and calved shelves · glowcap mushrooms, dead trees and logs · floating
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
  city: {
    style: 5,
    skyFill: 0x7d8fa4,
    groundFill: 0x303744,
    hemi: 1.1,
    sun: 0xb4c4ff,
    sunI: 2.0,
    fill: [0xa1b8ca, 0.7],
    vivid: 1.45,
    gain: 1.12,
    // 3.44.0: the fog bites - the far edge of every place dissolves softly instead of running
    // to a hard horizon (the old windows sat far outside the arena, so the fog never showed)
    fog: [1.15, 2.7],
  },
  shelf: {
    style: 2,
    skyFill: 0x9ebcd5,
    groundFill: 0x34495d,
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
    skyFill: 0xbfc8cd,
    groundFill: 0x78634b,
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
    skyFill: 0x829fa0,
    groundFill: 0x263b36,
    hemi: 1.15,
    sun: 0xd5e6de,
    sunI: 1.9,
    fill: [0x698d8b, 0.65],
    vivid: 1.0,
    gain: 0.85,
    fog: [0.95, 2.25],
  },
  core: {
    style: 4,
    skyFill: 0x9d99b4,
    groundFill: 0x272237,
    hemi: 1.05,
    sun: 0xe7e1f5,
    sunI: 2.1,
    fill: [0x899dc5, 0.6],
    vivid: 1.1,
    gain: 1.0,
    fog: [1.25, 3.0],
  },
  // 3.54.0: the Ashfall Caldera: a low ember key, a molten bounce from below, ash in the air -
  // the fog sits a shade clearer so the volcano reads past the wall
  caldera: {
    style: 6,
    skyFill: 0x8a94a3,
    groundFill: 0x302725,
    hemi: 1.15,
    sun: 0xf3e6d4,
    sunI: 2.2,
    fill: [0xa5bccb, 0.7],
    vivid: 1.12,
    gain: 0.98,
    fog: [1.18, 2.65],
  },
};
// 3.41.0: the tone the flying debris of a kill calms into. The style guide of the owner (Viridi, Penguin's
// Isle, Creaks: quiet, drawn colours) - a kill used to spray the enemy's pure card colour, which read as
// confetti against the muted floors. The pieces keep a hint of their own colour for telling things apart.
const RL_BIOME_TINT = {
  city: new Color(0x8a93a6),
  shelf: new Color(0xcfdde8),
  marsh: new Color(0x7ea89a),
  core: new Color(0x9a92b8),
  // 3.49.0: the Caldera calms its debris into settled ash
  caldera: new Color(0x98897e),
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
  // Blackout City: jersey barriers with red and white reflectors around the street,
  // advertising columns (round obstacles) and wrecked cars or dumpsters (box obstacles), steam from some manholes
  city(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      concrete = worldMaterial({ color: 0x69727a, flatShading: true }),
      darkConcrete = worldMaterial({ color: 0x414b58, flatShading: true }),
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
        posterMats[color] || (posterMats[color] = worldMaterial({ color, surface: "metal", flatShading: true })),
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
  shelf(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      ice = worldMaterial({
        surface: "ice",
        color: 0x86b8e8,
        emissive: 0x0a1e38,
        transparent: true,
        opacity: 0.86,
        flatShading: true,
      }),
      snow = worldMaterial({
        surface: "ice",
        color: 0xe8f4ff,
        emissive: 0x16243c,
        specular: 0x4b5c6e,
        shininess: 18,
        flatShading: true,
      }),
      wallW = 0.6,
      wallH = 0.45;
    const aurora = createAurora(W, H);
    group.add(aurora);
    view.rlAnim.push({ k: "u", o: aurora.material });
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(group, strataGeometry(sx, wallH, sz, bx + bz), snow, bx, 0, bz);
    const spikes = [],
      tint = [0xbfe8ff, 0xa4d8f4, 0xdff4ff, 0x7ab0dc];
    for (const off of [0.75])
      rlAlongBorder(W, H, off, 2.4, (px, pz, nx, nz) => {
        const len = rng.range(0.35, 1.25),
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
      worldMaterial({ surface: "ice", emissive: 0x0a1e38, transparent: true, opacity: 0.88, flatShading: true }),
      spikes,
    );
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        // crystal cluster: a tall hexagonal prism and four smaller ones leaning outwards
        const main = rlMesh(
          props,
          shardGeometry(obstacle.r * 0.9, 2.1, obstacle.r * 0.8),
          ice,
          obstacle.x,
          0.01,
          obstacle.y,
          rng.range(0, 6),
        );
        main.rotation.z = rng.range(-0.08, 0.08);
        for (let j = 0; j < 4; j++) {
          const angle = (j / 4) * Math.PI * 2 + rng.range(-0.4, 0.4),
            len = Math.min(rng.range(0.8, 1.4), obstacle.r * 1.05),
            shard = rlMesh(
              props,
              shardGeometry(obstacle.r * 0.32, len, obstacle.r * 0.28),
              ice,
              obstacle.x + Math.cos(angle) * obstacle.r * 0.4,
              -0.015,
              obstacle.y + Math.sin(angle) * obstacle.r * 0.4,
            );
          shard.rotation.set(Math.sin(angle) * 0.22, 0, -Math.cos(angle) * 0.22);
        }
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 2.0, k: "glint" });
      } else {
        const seed = obstacle.x * 3 + obstacle.y,
          body = strataGeometry(obstacle.w * 1.95, 1.05, obstacle.h * 1.95, seed);
        rlMesh(props, body, ice, obstacle.x, 0.01, obstacle.y);
        rlMesh(props, topCoatGeometry(body), snow, obstacle.x, 0.01, obstacle.y);
      }
  },
  // The Glowmarsh: a peat bank with reeds and rocks, glowcap mushrooms, dead trees and mossy logs
  marsh(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      bark = worldMaterial({ surface: "wood", color: 0x544b38, flatShading: true }),
      moss = worldMaterial({ surface: "wood", color: 0x1e4a3a, emissive: 0x062a1e, flatShading: true }),
      stem = worldMaterial({ surface: "wood", color: 0xcfd8c4, flatShading: true }),
      cap = worldMaterial({ surface: "organic", color: 0x3d705b, emissive: 0x04170e, flatShading: false }),
      spot = rlGlow(0x315e4b),
      wood = worldMaterial({ surface: "wood", color: 0x5a5240, flatShading: true }),
      wallW = 1.2;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(
        group,
        strataGeometry(sx, 0.22, sz, bx + bz),
        worldMaterial({ surface: "wood", color: 0x344b42 }),
        bx,
        0,
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
      worldMaterial({ surface: "wood", flatShading: true, shininess: 4 }),
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
      const reedMat = reedMesh.material,
        paintedCompile = reedMat.onBeforeCompile,
        paintedKey = reedMat.customProgramCacheKey;
      reedMat.customProgramCacheKey = () => paintedKey.call(reedMat) + ":reed-wind";
      reedMat.onBeforeCompile = (shader, ...args) => {
        paintedCompile.call(reedMat, shader, ...args);
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
    rlInst(group, new DodecahedronGeometry(0.6), worldMaterial({ surface: "stone", flatShading: true }), rocks);
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        if (rng.chance(0.55)) {
          // Rolled asymmetric caps and subdued gills keep the fungus distinct from a warning disc.
          rlMesh(
            props,
            new CylinderGeometry(obstacle.r * 0.22, obstacle.r * 0.32, 1.25, 8),
            stem,
            obstacle.x,
            0.62,
            obstacle.y,
          );
          rlMesh(
            props,
            mushroomCapGeometry(obstacle.r * 0.98, obstacle.r * 0.6, obstacle.x + obstacle.y),
            cap,
            obstacle.x,
            1.12,
            obstacle.y,
          );
          for (let j = 0; j < 12; j++) {
            const angle = (j / 12) * TAU,
              r = obstacle.r;
            const g = rlMesh(
              props,
              new BoxGeometry(r * 0.52, 0.018, 0.025),
              spot,
              obstacle.x + Math.cos(angle) * r * 0.56,
              1.12 + r * 0.075,
              obstacle.y + Math.sin(angle) * r * 0.56,
              -angle,
            );
            g.rotation.y = -angle;
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
      } else {
        // Moss settles on the curved bark rather than forming a rectangular board above the log.
        const longX = obstacle.w >= obstacle.h,
          len = Math.max(obstacle.w, obstacle.h) * 2,
          rad = Math.max(0.3, Math.min(obstacle.w, obstacle.h) * 0.9),
          body = new CylinderGeometry(rad, rad * 1.05, len, 10);
        if (longX) body.rotateZ(Math.PI / 2);
        else body.rotateX(Math.PI / 2);
        rlMesh(props, body, bark, obstacle.x, rad, obstacle.y);
        rlMesh(props, topCoatGeometry(body, 0.018), moss, obstacle.x, rad, obstacle.y);
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
      }
  },
  // The Shattered Core: an energy barrier over the abyss, floating obelisks and hovering monoliths
  core(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      obsid = worldMaterial({ color: 0x52416c, emissive: 0x12072a, flatShading: true }),
      rim = rlGlow(biome.grid),
      carved = worldMaterial({ color: 0x8b8199 }),
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
      worldMaterial({ surface: "stone", emissive: 0x0a0418, flatShading: true }),
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
      worldMaterial({ surface: "stone", emissive: 0x0a0a18, flatShading: true }),
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
          worldMaterial({ color: 0x1a2030, flatShading: true }),
          px,
          rng.range(-1.5, 0.5),
          pz,
        ),
        panel = rlMesh(
          drift,
          propBox(1.1, 0.55, 0.07),
          worldMaterial({ color: 0x202838, flatShading: true }),
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
            rlMesh(mono, propBox(0.05, height + 0.02, 0.05), carved, sx * obstacle.w * 0.92, 0, sz * obstacle.h * 0.92);
        for (const side of [-1, 1]) {
          rlMesh(mono, propBox(obstacle.w * 2 * 0.92 + 0.04, 0.05, 0.05), hot, 0, height / 2, side * obstacle.h * 0.92);
          rlMesh(mono, propBox(0.05, 0.05, obstacle.h * 2 * 0.92 + 0.04), hot, side * obstacle.w * 0.92, height / 2, 0);
        }
        view.rlAnim.push({ o: mono, k: "bob", b: 0.3 + height / 2, ph: obstacle.x + obstacle.y * 0.7, a: 0.1, s: 1.1 });
      }
  },
  // Ashfall Caldera: fractured basalt around the crater, grounded obsidian spires and cooled rock shelves.
  caldera(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      rock = worldMaterial({ surface: "basalt", color: 0x6c7378, flatShading: true }),
      darkRock = worldMaterial({ surface: "basalt", color: 0x505960, flatShading: true }),
      obsidian = worldMaterial({ surface: "basalt", color: 0x414951, flatShading: true }),
      emberMat = rlGlow(0x9b4e26),
      bake = rlMerger();
    // Broken cooled basalt marks the crater edge; no manufactured lamps or light bars.
    rlAlongBorder(W, H, 0.55, 2.2, (x, z, nx) => {
      bake.add(
        strataGeometry(2.1, 0.9 + 0.12 * Math.sin(x + z), 0.65, x * 3 + z),
        rock,
        x,
        0.01,
        z,
        nx === 0 ? 0 : Math.PI / 2,
      );
    });
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
          strataGeometry(r * 1.4, 1.5 + 0.3 * r, r * 1.35, obstacle.x + obstacle.y, true),
          obsidian,
          obstacle.x,
          0.12,
          obstacle.y,
        );
        spire.rotation.z = tilt;
        const shard = rlMesh(
          props,
          strataGeometry(r * 0.65, 0.85, r * 0.65, obstacle.x - obstacle.y, true),
          obsidian,
          obstacle.x + r * 0.5,
          0.05,
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
      } else if (obstacle.w < 1.3 && obstacle.h < 1.3) {
        // a charred slab: a leaning monolith with an ember seam across its face
        const height = 1.15;
        const slab = rlMesh(
          props,
          strataGeometry(obstacle.w * 2, height, obstacle.h * 2, obstacle.x + obstacle.y),
          darkRock,
          obstacle.x,
          0.01,
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
      } else {
        // One local frame rotates the ridge, seams and vents together.
        const materials = { rock, darkRock, emberMat };
        for (const part of calderaRidgeParts(obstacle)) props.add(new Mesh(part.geometry, materials[part.role]));
      }
  },
  // The Glass Flats: wind-sculpted sandstone berms studded with vitrified glass fins, faceted
  // glass-crowned outcrops and striated sandstone ridges with fused glass crusts.
  flats(view, biome, W, H, obs, rng) {
    const group = view.group,
      props = view.obsGroup,
      sand = worldMaterial({ surface: "sandstone", color: 0x9c8256, flatShading: true }),
      sandstone = worldMaterial({ surface: "sandstone", color: 0x745c38, flatShading: true }),
      glass = worldMaterial({
        surface: "ice",
        color: 0xa4d4d8,
        emissive: 0x253d40,
        transparent: true,
        opacity: 0.84,
        flatShading: true,
      }),
      hotGlass = worldMaterial({ surface: "ice", color: 0xdbf0e9, emissive: 0x435c58, flatShading: true }),
      wallW = 0.72,
      wallH = 0.42;
    for (const [bx, bz, sx, sz] of [
      [0, -H - wallW / 2, W * 2 + wallW * 2, wallW],
      [0, H + wallW / 2, W * 2 + wallW * 2, wallW],
      [-W - wallW / 2, 0, wallW, H * 2],
      [W + wallW / 2, 0, wallW, H * 2],
    ])
      rlMesh(group, strataGeometry(sx, wallH, sz, bx + bz), sand, bx, 0, bz);
    const fins = [],
      tint = [0xbfe8e2, 0xa4d4d8, 0xe8dfc4, 0xd8ebe4];
    rlAlongBorder(W, H, 0.78, 2.1, (px, pz, nx, nz) => {
      const len = rng.range(0.45, 1.35),
        tilt = rng.range(0.12, 0.34);
      fins.push({
        x: px + rng.range(-0.18, 0.18) * (nz ? 1 : 0),
        y: wallH - 0.12,
        z: pz + rng.range(-0.18, 0.18) * (nx ? 1 : 0),
        rx: nz * tilt,
        rz: -nx * tilt,
        ry: rng.range(0, 6),
        sx: rng.range(0.75, 1.25),
        sy: len,
        sz: rng.range(0.75, 1.25),
        c: rng.pick(tint),
      });
    });
    rlInst(
      group,
      shardGeometry(0.42, 1, 0.16),
      worldMaterial({ surface: "ice", emissive: 0x1a3032, transparent: true, opacity: 0.86, flatShading: true }),
      fins,
    );
    for (const obstacle of obs)
      if (obstacle.t === "c") {
        const seed = obstacle.x * 3 + obstacle.y,
          base = strataGeometry(obstacle.r * 1.9, 0.74, obstacle.r * 1.9, seed, true);
        rlMesh(props, base, sandstone, obstacle.x, 0.01, obstacle.y);
        rlMesh(props, topCoatGeometry(base, 0.03), glass, obstacle.x, 0.01, obstacle.y);
        const main = rlMesh(
          props,
          shardGeometry(obstacle.r * 0.78, 1.55 + obstacle.r * 0.25, obstacle.r * 0.44),
          glass,
          obstacle.x,
          0.01,
          obstacle.y,
          rng.range(0, 6),
        );
        main.rotation.z = rng.range(-0.08, 0.08);
        for (let j = 0; j < 3; j++) {
          const angle = (j / 3) * Math.PI * 2 + rng.range(-0.4, 0.4),
            len = Math.min(rng.range(0.75, 1.25), obstacle.r * 0.95),
            shard = rlMesh(
              props,
              shardGeometry(obstacle.r * 0.34, len, obstacle.r * 0.2),
              j === 0 ? hotGlass : glass,
              obstacle.x + Math.cos(angle) * obstacle.r * 0.36,
              0.01,
              obstacle.y + Math.sin(angle) * obstacle.r * 0.36,
            );
          shard.rotation.set(Math.sin(angle) * 0.2, angle + 0.5, -Math.cos(angle) * 0.2);
        }
        view.rlEmit.push({ x: obstacle.x, z: obstacle.y, y: 1.6, k: "glint" });
      } else {
        const seed = obstacle.x * 7 + obstacle.y,
          body = strataGeometry(obstacle.w * 1.95, 0.9, obstacle.h * 1.95, seed);
        rlMesh(props, body, sandstone, obstacle.x, 0.01, obstacle.y);
        rlMesh(props, topCoatGeometry(body, 0.03), glass, obstacle.x, 0.01, obstacle.y);
        const longX = obstacle.w >= obstacle.h;
        for (const side of [-1, 1]) {
          const shard = rlMesh(
            props,
            shardGeometry(Math.min(0.45, obstacle.w * 0.42), rng.range(0.45, 0.72), Math.min(0.28, obstacle.h * 0.35)),
            side > 0 ? hotGlass : glass,
            obstacle.x + (longX ? side * obstacle.w * 0.35 : 0),
            0.55,
            obstacle.y + (longX ? 0 : side * obstacle.h * 0.35),
            side * 0.6,
          );
          shard.rotation.z = side * 0.12;
        }
      }
  },
};

// Ambient particles: the air of the biome, around the camera, plus steam/spores/glints/motes from props.
const RL_C = {
  white: new Color(0xffffff),
  steam: new Color(0x5a6270),
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
    if (src.k === "steam") {
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
const RL_SKIN = { uSkin: { value: 0 } };
const RL_SKIN_VERT_HEAD = `
varying vec3 vRlN;`;
const RL_SKIN_VERT_BODY = `
#ifdef USE_INSTANCING
vRlN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
vRlN = normalize(mat3(modelMatrix) * objectNormal);
#endif`;
const RL_SKIN_FRAG_HEAD = `
uniform float uSkin;
varying vec3 vRlN;`;
const RL_SKIN_FRAG_BODY = `
{
// Weather coats the painted physical material. Actor-specific cracks, lights and veins belong to its model.
int rlS = int(uSkin + 0.5);
float top = smoothstep(.15,.85,vRlN.y);
float rim = pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),2.4);
if(rlS == 2) {
  outgoingLight *= vec3(.97,1.0,1.035);
  outgoingLight += vec3(.012,.019,.025)*top;
} else if(rlS == 3) {
  outgoingLight *= vec3(.97,1.0,.99);
  outgoingLight += vec3(.008,.022,.016)*rim;
} else if(rlS == 4) {
  outgoingLight += vec3(.019,.009,.031)*rim;
} else if(rlS == 5) {
  outgoingLight *= vec3(.98,1.0,1.025);
  outgoingLight += vec3(.011,.014,.018)*top;
} else if(rlS == 6) {
  outgoingLight += vec3(.027,.024,.021)*top;
  outgoingLight += vec3(.014,.007,.002)*rim;
} else if(rlS == 7) {
  outgoingLight *= vec3(1.035,1.0,.97);
  outgoingLight += vec3(.025,.022,.017)*top;
}
}`;
// Layer biome weathering and enemy hit flashes over the painted physical material.
function rlSkinMaterial(mat, flash) {
  // Boss fade lists can reference the same physical material more than once.
  if (mat.rlSkin) return;
  const paintedCompile = mat.onBeforeCompile;
  const paintedKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, ...args) => {
    paintedCompile.call(mat, shader, ...args);
    shader.uniforms.uSkin = RL_SKIN.uSkin;
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
        `${RL_SKIN_FRAG_BODY}${flash ? "\noutgoingLight *= 1.0 + clamp(vFlash,0.0,1.0) * .9; outgoingLight += vec3(.025,.022,.018) * clamp(vFlash,0.0,1.0);" : ""}\n#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (flash ? "flashPaintedSkin:" : "paintedSkin:") + paintedKey;
  mat.needsUpdate = true;
  mat.rlSkin = true;
}
const RL_SKIN_FX = {
  2: { c: new Color(0xdcf0ff), vy: -0.35, grav: 0, life: 0.9, size: 0.18, spark: true },
  3: { c: new Color(0x54ffc8), vy: -0.2, grav: 7, life: 0.6, size: 0.13, spark: false },
  4: { c: new Color(0xc070ff), vy: 0.9, grav: 0, life: 0.9, size: 0.12, spark: false },
  // 3.4.0: Blackout City: water dripping off
  5: { c: new Color(0xa8c4e0), vy: -0.4, grav: 9, life: 0.5, size: 0.08, spark: true },
  // Ash settles on ordinary hulls; the Tyrant and Flareheart variants own their molten emissions.
  6: { c: new Color(0x8a8175), vy: -0.3, grav: 0.2, life: 0.8, size: 0.09, spark: false },
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
