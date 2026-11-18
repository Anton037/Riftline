// Arena display, procedural scenery and actor finish under the local key light.
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector4,
} from "three";
import { createAurora } from "./aurora.js";
import { createGroundOcclusion } from "./ground-occlusion.js";
import { worldMaterial, setWorldShadows } from "./world-material.js";
import { addMapArchitecture, placeMesh, vesselGeometry } from "./map-architecture.js";
import { armorBox } from "./armor-geometry.js";
import { FLOOR_FRAGMENT } from "./surface-shader.js";
import { TAU, hashString, makeRng } from "../core/util.js";
import { hexColor } from "./materials.js";
import { addBiomeDetail } from "./biome-props.js";
import { mergeStaticMeshes } from "./static-meshes.js";
import { GLAZES } from "./palette.js";
import { atmosphereDensity, biomeAtmosphere } from "../data/atmosphere.js";

const RL_BIOME_LOOK = GLAZES;
const RL_BIOME_TINT = Object.fromEntries(Object.entries(GLAZES).map(([id, look]) => [id, hexColor(look.trim)]));

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
          uGlaze: { value: new Color() },
          uHalf: { value: new Vector2(18, 18) },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          // 2.4.0: the floor of each biome is a style of one shader (RL_FLOOR_FRAG)
          uStyle: { value: 0 },
          // 3.4.0: how dark the Blackout makes the floor (0..1); the lights of blasts and arcs still light it
          uDark: { value: 0 },
          uL: { value: Array.from({ length: 6 }, () => new Vector4()) },
          uLC: { value: Array.from({ length: 6 }, () => new Color()) },
        },
      ]);
      this.floorMat = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: floorVertexShader,
        fragmentShader: FLOOR_FRAGMENT,
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
      uniforms.uGrid.value.setHex(look.trim);
      uniforms.uGlaze.value.setHex(look.base);
      uniforms.uHalf.value.set(layout.W, layout.H);
      this.groundOcclusion?.dispose();
      this.groundOcclusion = createGroundOcclusion(layout.W, layout.H, layout.obs);
      uniforms.uOcclusion.value = this.groundOcclusion;
      uniforms.uStyle.value = look.style;
      const floor = new Mesh(new PlaneGeometry(100, 100), this.floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.group.add(floor);
      const props = new Group();
      this.group.add(props);
      this.obsGroup = props;
      this.rlAnim = [];
      buildCover(this, biome.id, layout.obs, makeRng(hashString(layout.key + ":cover")));
      this.lampLens = addBiomeDetail(
        this,
        biome,
        layout.W,
        layout.H,
        layout.obs,
        makeRng(hashString(layout.key + ":detail")),
      );
      addMapArchitecture(this, biome, layout.W, layout.H, layout.obs);
      if (biome.id === "shelf") {
        const aurora = createAurora(layout.W, layout.H);
        this.group.add(aurora);
        this.rlAnim.push({ o: aurora.material, k: "u" });
      }
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
      if (this.biomeId === "city" && this.lampLens) {
        const dark = this.uniforms.uDark.value;
        const ember = (0.74 + 0.16 * Math.cos(time * 0.87)) * (1 - dark * 0.64);
        this.lampLens.color.copy(hexColor(GLAZES.city.light)).multiplyScalar(ember);
      }
      for (const anim of this.rlAnim || []) {
        const obj = anim.o;
        if (anim.k === "spin" || anim.k === "spinbob") obj.rotation.y += dt * anim.s;
        if (anim.k === "bob" || anim.k === "spinbob")
          obj.position.y = anim.b + Math.sin(time * (anim.s || 1) + anim.ph) * (anim.a || 0.1);
        if (anim.k === "u") obj.uniforms.uTime.value = time;
      }
    }
  };

function buildCover(view, id, obstacles, rng) {
  if (obstacles.length === 0) return;
  const look = GLAZES[id];
  const body = worldMaterial({ color: look.body, surface: id === "shelf" ? "ice" : "armor" });
  const trim = worldMaterial({ color: look.trim, surface: "metal" });
  const socket = worldMaterial({ color: look.base, surface: "rubber" });
  const light = new MeshBasicMaterial({ color: look.light, toneMapped: false });
  for (const ob of obstacles) {
    const tall = 0.86 + rng.next() * 0.6;
    if (ob.t === "c") {
      const { x, y: z, r } = ob;
      const height = tall + r * 0.46;
      placeMesh(view.obsGroup, vesselGeometry(id, r * 0.96, height), body, x, 0.21, z);
      placeMesh(
        view.obsGroup,
        new TorusGeometry(r * 0.79, r * 0.045, 5, 24).rotateX(Math.PI / 2),
        trim,
        x,
        height * 0.61 + 0.21,
        z,
      );
      placeMesh(view.obsGroup, new CylinderGeometry(r * 0.25, r * 0.31, 0.14, 8), socket, x, height + 0.18, z);
      placeMesh(view.obsGroup, new CylinderGeometry(r * 0.12, r * 0.25, 0.075, 6), light, x, height + 0.28, z);
    } else {
      const { x, y: z, w, h } = ob;
      placeMesh(view.obsGroup, armorBox(w * 1.94, tall, h * 1.94, 0.095), body, x, tall / 2 + 0.18, z);
      placeMesh(view.obsGroup, armorBox(w * 1.73, 0.14, h * 1.73, 0.045), trim, x, tall + 0.15, z);
      placeMesh(view.obsGroup, new BoxGeometry(w * 1.45, 0.08, h * 1.45), socket, x, tall + 0.24, z);
      const longX = w >= h,
        span = longX ? w : h,
        short = longX ? h : w;
      for (let i = -1; i <= 1; i++) {
        const u = i * span * 0.43;
        const lens = new CylinderGeometry(short * 0.29, short * 0.36, 0.075, 6);
        placeMesh(view.obsGroup, lens, light, x + (longX ? u : 0), tall + 0.295, z + (longX ? 0 : u));
      }
    }
  }
}

function rlAmbient(renderer, dt, world, { menu = false } = {}) {
  if (!renderer.biome || dt <= 0 || dt > 0.25) return;
  const layers = biomeAtmosphere[renderer.biome.id];
  const density = atmosphereDensity(renderer.maxParticles, renderer.P.n, menu);
  if (renderer.airLayers !== layers) {
    renderer.airLayers = layers;
    renderer.airCarry = layers.map(() => 0);
  }
  const x0 = world?.player.x ?? renderer.camX;
  const z0 = world?.player.y ?? renderer.camZ;
  const sample = ([lo, hi]) => lo + Math.random() * (hi - lo);
  for (let i = 0; i < layers.length; i++) {
    const {
      rate,
      height,
      life,
      size,
      velocity: [vx, vy, vz],
      color,
      spark,
    } = layers[i];
    renderer.airCarry[i] += dt * rate * density;
    while (renderer.airCarry[i] >= 1) {
      renderer.airCarry[i]--;
      renderer.emit(
        x0 + (Math.random() - 0.5) * 27,
        sample(height),
        z0 + (Math.random() - 0.5) * 22,
        vx,
        vy * (0.75 + Math.random() * 0.5),
        vz,
        sample(life),
        sample(size),
        hexColor(color),
        { ambient: true, spark, drag: 0.12, fade: "soft", grow: spark ? 0 : 0.44 },
      );
    }
  }
}

function rlSkinParticles(renderer, dt, world) {
  if (!renderer.biome || !world || dt <= 0 || dt > 0.25) return;
  const {
    color,
    velocity: [, lift],
  } = biomeAtmosphere[renderer.biome.id][0];
  const enemies = world.enemies;
  const rate = Math.min(1.8, 48 / Math.max(1, enemies.length));
  for (const enemy of enemies) {
    if (enemy.dead || enemy.ghost || enemy.spawnT > 0 || Math.random() > dt * rate * (enemy.boss ? 4 : 1)) continue;
    const a = Math.random() * TAU,
      r = enemy.r * 0.82;
    renderer.emit(
      enemy.x + Math.cos(a) * r,
      0.25 + r,
      enemy.y + Math.sin(a) * r,
      Math.cos(a) * 0.45,
      lift * 0.8 + 0.3,
      Math.sin(a) * 0.45,
      0.73,
      0.13,
      hexColor(color),
      { ambient: true, spark: true },
    );
  }
}

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
// A small reflected key along painted edges keeps the silhouette visible.
int rlS = int(uSkin + 0.5);
float top = smoothstep(.15,.85,vRlN.y);
float rim = pow(1.0-abs(dot(normalize(normal),normalize(vViewPosition))),2.4);
vec3 bounced = rlS==2 ? vec3(.024,.047,.07) : rlS==3 ? vec3(.026,.049,.029)
 : rlS==4 ? vec3(.054,.029,.076) : rlS==5 ? vec3(.049,.03,.014)
 : rlS==6 ? vec3(.072,.026,.014) : vec3(.064,.047,.026);
outgoingLight += bounced * (.3*top + rim);
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

export { RL_BIOME_LOOK, RL_BIOME_TINT, RL_SKIN, ArenaView, rlAmbient, rlSkinMaterial, rlSkinParticles };
