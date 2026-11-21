// Riftline Renderer: orchestrates the custom WebGL2 engine, stylized painterly lighting,
// camera, GPU-instanced pools, particles, biomes, actors, bosses and combat effects.

import { Color, Euler, Mat4, Quat, Vec3, Camera } from "../engine/math.js";
import { box, cylinder, disc, discXY, octahedron, plane, ring, mergeGeometries } from "../engine/geometry.js";
import {
  CompactInstancePool,
  GpuDebrisRing,
  GpuParticleRing,
  InstancePool,
  MeshNode,
  Node,
  Scene,
  Texture2D,
} from "../engine/scene.js";
import { WebGL2Engine } from "../engine/webgl2.js";

import { SmokeView } from "./smoke-view.js";
import { AbilityEffectsView } from "./ability-effects-view.js";
import { WeaponEffectsView } from "./weapon-effects-view.js";
import { ActorEffectsView } from "./actor-effects-view.js";
import { TrapView } from "./traps-view.js";
import { BossCardView } from "./boss-cards-view.js";
import { HazardView } from "./hazards-view.js";
import { BiomePropsView } from "./biome-props-view.js";
import { AttackView, MARK_LOOK } from "./attacks-view.js";
import { ArenaView, RL_BIOME_LOOK, RL_BIOME_TINT, rlAmbient, rlSkinParticles } from "./arena-view.js";
import {
  buildPlayerModel,
  buildBossModel,
  enemyGeometry,
  variantAttachmentGeometry,
  affixAttachmentGeometry,
  wingDroneGeometry,
  orbitBladeGeometry,
  rocketProjectileGeometry,
  discGeometry,
  shardGeometry,
  healCrossGeometry,
  shieldArcGeometry,
  debrisGeometry,
} from "./models.js";
import {
  hexColor,
  worldMaterial,
  emissiveMaterial,
  additiveMaterial,
  enemySurface,
  setWorldShadows,
} from "./materials.js";
import { FINISH } from "./palette.js";

import { BOSS_EFFECTS, WEAPON_EFFECTS } from "../data/combat-effects.js";
import { actorMaterial } from "../data/materials.js";
import { AMBIENT_POOL_SHARE } from "../data/atmosphere.js";
import { enemyDefs, eliteAffixes, bossDefs, biomeVariants } from "../data/enemies.js";
import { biomeList } from "../data/biomes.js";
import { weaponDefs } from "../data/weapons.js";
import { STEP_LEN, DASH_TIME } from "../core/walk.js";
import { logError } from "../core/diagnostics.js";
import { smoothstep, clamp, TAU, easeOutBack, dampFactor, angleDiff } from "../core/util.js";
import { ui } from "../main.js";

const whiteColor = hexColor(FINISH.ivory);
const goldColor = hexColor(FINISH.brass);
const warnColor = hexColor(FINISH.vermilion);
const warningDark = hexColor(FINISH.ink);
const hurtColor = hexColor(0xff4258);
const healColor = hexColor(0x5effa8);
const beamColor = hexColor(0xff5268);
const resistColor = hexColor(0xc2d4e8);
const shardColors = { 1: hexColor(0x62f2d8), 5: hexColor(0xf6c25e), 25: hexColor(0xc884ff) };
const variantColors = Object.fromEntries(Object.values(biomeVariants).map((v) => [v.id, hexColor(v.color)]));

const BOSS_PORTAL = {
  bellkeeper: [hexColor(FINISH.brass), hexColor(FINISH.ivory)],
  prism: [hexColor(FINISH.glacier), hexColor(FINISH.ivory)],
  queen: [hexColor(FINISH.jade), hexColor(0xd6ffe8)],
  core: [hexColor(FINISH.lavender), hexColor(0xff84cc)],
  tyrant: [hexColor(0xff8c36), hexColor(0xffe094)],
  wyrm: [hexColor(0xffd27a), hexColor(0x76e8d4)],
};

const BIOME_ENEMY_DRESS = {
  courtyard: [0.99, 0.99, 1.02],
  shelf: [0.97, 1.0, 1.04],
  marsh: [0.97, 1.02, 0.99],
  core: [1.02, 0.98, 1.04],
  caldera: [1.04, 0.99, 0.96],
  flats: [1.03, 1.01, 0.97],
};
const BIOME_PORTAL_ACCENT = {
  courtyard: hexColor(0xf2be72),
  shelf: hexColor(0x9ceeff),
  marsh: hexColor(0x7cf8b2),
  core: hexColor(0xd29cff),
  caldera: hexColor(0xffa248),
  flats: hexColor(0x68f0de),
};

const STEP_LOOK = {
  flagstone: { color: hexColor(0x98b4c8), up: 1.2, life: 0.28, size: 0.14, grav: 4.5, ring: true },
  frost: { color: hexColor(0xe6f8ff), up: 1.4, life: 0.36, size: 0.18, grav: 3 },
  snow: { color: hexColor(0xe6f8ff), up: 1.4, life: 0.36, size: 0.18, grav: 3 },
  ice: { color: hexColor(0xb8f0ff), up: 1.35, life: 0.32, size: 0.15, grav: 3, spark: true },
  mud: { color: hexColor(0x6cf0ac), up: 1.3, life: 0.36, size: 0.17, grav: 5, ring: true },
  acid: { color: hexColor(0x7effb8), up: 1.5, life: 0.34, size: 0.16, grav: 4, ring: true },
  glass: { color: hexColor(0xd29aff), up: 1.5, life: 0.32, size: 0.15, grav: 2, spark: true, ring: true },
  rift: { color: hexColor(0xc288ff), up: 1.5, life: 0.3, size: 0.15, grav: 2, spark: true },
  crust: { color: hexColor(0xff9e48), up: 1.45, life: 0.34, size: 0.15, grav: 3.2, spark: true },
  ash: { color: hexColor(0xff9a44), up: 1.4, life: 0.34, size: 0.15, grav: 3, spark: true },
  sandglass: { color: hexColor(0xe8d09a), up: 1.25, life: 0.36, size: 0.18, grav: 3 },
  sand: { color: hexColor(0xe6cc96), up: 1.2, life: 0.36, size: 0.18, grav: 3 },
};

const RL_MOTION = {
  swarmer: { ref: 7, f: 2.2, roll: 0.18, lean: 0.14, bounce: 0.12, hover: 0.08, hf: 7, breath: 0.03, bf: 6 },
  mite: { ref: 7, f: 2.8, roll: 0.22, lean: 0.12, bounce: 0.14, hover: 0, hf: 0, breath: 0.04, bf: 8 },
  grunt: { ref: 5, f: 1.6, roll: 0.1, lean: 0.12, bounce: 0.1, hover: 0, hf: 0, breath: 0.025, bf: 3 },
  gunner: { ref: 4, f: 1.3, roll: 0.08, lean: 0.08, bounce: 0.07, hover: 0, hf: 0, breath: 0.02, bf: 2.6 },
  bomber: { ref: 5, f: 1.8, roll: 0.14, lean: 0.14, bounce: 0.12, hover: 0, hf: 0, breath: 0.05, bf: 6 },
  splitter: { ref: 4, f: 1.4, roll: 0.1, lean: 0.08, bounce: 0.08, hover: 0.05, hf: 4, breath: 0.04, bf: 4 },
  brute: { ref: 4, f: 1.1, roll: 0.09, lean: 0.14, bounce: 0.09, hover: 0, hf: 0, breath: 0.02, bf: 2 },
  sniper: { ref: 4, f: 1.2, roll: 0.06, lean: 0.06, bounce: 0.05, hover: 0, hf: 0, breath: 0.02, bf: 2.2 },
  hive: { ref: 3, f: 0.8, roll: 0.04, lean: 0.04, bounce: 0.02, hover: 0, hf: 0, breath: 0.05, bf: 2.4 },
  bulwark: { ref: 3, f: 1.0, roll: 0.07, lean: 0.06, bounce: 0.06, hover: 0, hf: 0, breath: 0.02, bf: 1.8 },
  striker: { ref: 7, f: 1.5, roll: 0.16, lean: 0.18, bounce: 0.04, hover: 0.12, hf: 5.5, breath: 0.03, bf: 4 },
  mortar: { ref: 3, f: 1.1, roll: 0.06, lean: 0.06, bounce: 0.05, hover: 0, hf: 0, breath: 0.025, bf: 2 },
  mender: { ref: 4, f: 1.0, roll: 0.08, lean: 0.08, bounce: 0, hover: 0.16, hf: 3.4, breath: 0.03, bf: 3.2 },
  leaper: { ref: 6, f: 2.0, roll: 0.12, lean: 0.16, bounce: 0.16, hover: 0, hf: 0, breath: 0.03, bf: 4 },
  turret: { ref: 4, f: 0, roll: 0, lean: 0, bounce: 0, hover: 0, hf: 0, breath: 0.015, bf: 2 },
  charger: { ref: 6, f: 1.4, roll: 0.08, lean: 0.18, bounce: 0.06, hover: 0, hf: 0, breath: 0.02, bf: 3 },
  minebot: { ref: 5, f: 1.6, roll: 0.1, lean: 0.08, bounce: 0.06, hover: 0, hf: 0, breath: 0.03, bf: 4 },
  sapper: { ref: 5, f: 1.7, roll: 0.12, lean: 0.12, bounce: 0.1, hover: 0, hf: 0, breath: 0.03, bf: 3.5 },
  phantom: { ref: 6, f: 1.2, roll: 0.1, lean: 0.12, bounce: 0, hover: 0.18, hf: 3.6, breath: 0.035, bf: 3 },
  sentinel: { ref: 4, f: 1.0, roll: 0.05, lean: 0.06, bounce: 0, hover: 0.16, hf: 2.8, breath: 0.025, bf: 2.6 },
  carrier: { ref: 3.5, f: 0.9, roll: 0.06, lean: 0.08, bounce: 0, hover: 0.14, hf: 2.2, breath: 0.025, bf: 2.2 },
  drone: { ref: 7, f: 1.6, roll: 0.16, lean: 0.14, bounce: 0, hover: 0.14, hf: 6.2, breath: 0.02, bf: 5 },
  driller: { ref: 5, f: 1.5, roll: 0.1, lean: 0.14, bounce: 0.08, hover: 0, hf: 0, breath: 0.02, bf: 3 },
  beacon: { ref: 3, f: 0.8, roll: 0.04, lean: 0.04, bounce: 0, hover: 0.12, hf: 2.6, breath: 0.03, bf: 2.8 },
  weaver: { ref: 4.5, f: 1.1, roll: 0.08, lean: 0.1, bounce: 0, hover: 0.16, hf: 3.8, breath: 0.03, bf: 3.4 },
};
const RL_MOTION_NONE = { ref: 5, f: 1, roll: 0.06, lean: 0.06, bounce: 0.06, hover: 0, hf: 0, breath: 0.02, bf: 2 };

const RL_AURORA_SPARK = new Color(0x88f8e4);
const RL_FESTIVAL_EMBER = new Color(0xffcf72);

function flashOrder(a, b) {
  return b.i - a.i;
}

function loadImageTexture(url, onReady) {
  const tex = new Texture2D({ wrap: "repeat", filter: "linear", flipY: false });
  if (typeof Image === "undefined") return tex;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    tex.setImage(img);
    if (onReady) onReady(tex);
  };
  img.onerror = () => {
    // Still unblock readiness gates cleanly if an image fails to load in an offline stub
    tex.ready = true;
    if (onReady) onReady(tex);
  };
  img.src = url;
  return tex;
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.dprCap = opts.dpr || 2;
    this.maxParticles = 1400;
    this.numbers = true;
    this.motion = 1;
    this.time = 0;
    this.worldT = 0;
    this.zoom = 1;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.camX = 0;
    this.camZ = 0;
    this.camInit = false;
    this.menuA = 0.45;
    this.shake = 0;
    this.kick = 0;
    this.kickA = 0;
    this.pulse = 0;
    this.flashT = 0;
    this.focus = null;
    this.focusK = 0;
    this.mapChanged = false;
    this.warnColor = warnColor;
    this.finishAtlasReady = false;
    this.B = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };

    this.engine = new WebGL2Engine(canvas, { shadowSize: 2048, post: true });
    // Alias for diagnostics, browser tests and verification tools
    this.renderer = this.engine;
    this.scene = new Scene();
    this.camera = new Camera(44, 1, 0.5, 190);
    this.arena = new ArenaView(this.scene, this.engine);

    // Load stylized painterly atlases asynchronously
    this.engine.textures.terrain = loadImageTexture("textures/terrain-atlas.webp", () => {
      this.arena.uniforms.uTerrainReady.value = 1;
    });
    this.engine.textures.surface = loadImageTexture("textures/surface-atlas.webp", () => {
      this.finishAtlasReady = true;
    });
    this.engine.textures.vfx = loadImageTexture("textures/vfx-atlas.webp");

    this.nums = [];
    this.flashes = [];
    this.lines = [];
    this.rings = [];
    this.corpses = [];
    this.biome = null;
    this.player = null;
    this.playerWeapon = null;
    this.bossView = null;

    // Stateless GPU Ring-Buffer Particle & Ballistic Debris Systems (0.0 ms CPU per-frame stepping)
    this.P = new GpuParticleRing(
      plane(1, 1, 1, 1),
      2048,
      () => this.time,
      (clearT) => {
        this.scene.particleClearTime = clearT;
      },
    );
    this.scene.add(this.P.mesh);

    this.D = new GpuDebrisRing(debrisGeometry(), worldMaterial({ surface: "stone", color: 0xffffff }), 320);
    this.scene.add(this.D.mesh);

    // Scratch math objects
    this._v = new Vec3();
    this._rayO = new Vec3();
    this._rayD = new Vec3();
    this._ground = { x: 0, y: 0 };
    this._e = new Euler();
    this._q = new Quat();
    this._m = new Mat4();
    this._p = new Vec3();
    this._s = new Vec3();
    this._dk = new Color();
    this._debrisTint = new Color();
    this._flashSort = [];
    this._muzzleCol = new Color(0x62f2e8);

    // Core shared instanced pools
    this._initPools();

    // Specialized view subsystems
    this.smokeView = new SmokeView(this, InstancePool);
    this.abilityView = new AbilityEffectsView(this, InstancePool);
    this.weaponView = new WeaponEffectsView(this, InstancePool);
    this.actorView = new ActorEffectsView(this);
    this.trapView = new TrapView(this, InstancePool);
    this.bossCardView = new BossCardView(this, InstancePool);
    this.hazardView = new HazardView(this, InstancePool);
    this.biomePropsView = new BiomePropsView(this);
    this.attackView = new AttackView(this, InstancePool);

    this._needsResize = true;
    this.resize();
  }

  _addPool(geo, mat, max, order = 1, opts = {}) {
    const p = new InstancePool(geo, mat, max, opts);
    p.mesh.renderOrder = order;
    this.scene.add(p.mesh);
    return p;
  }

  _addCompactPool(geo, mat, max, order = 1) {
    const p = new CompactInstancePool(geo, mat, max);
    p.mesh.renderOrder = order;
    this.scene.add(p.mesh);
    return p;
  }

  _initPools() {
    const quad = plane(1, 1, 1, 1);
    const flatQuad = plane(1, 1, 1, 1).rotateX(-Math.PI / 2);

    this.shadows = this._addPool(
      flatQuad,
      emissiveMaterial({
        color: 0xffffff,
        emissiveIntensity: 1,
        opacity: 0.72,
        transparent: true,
        depthWrite: false,
        spriteTile: 3,
        fog: false,
      }),
      700,
      0,
      { color: false },
    );
    this.sprites = this._addPool(quad, additiveMaterial(0, 0.85, 1.08), 2200, 5);
    this.sparks = this._addPool(quad, additiveMaterial(1, 0.92, 1.24), 1400, 5);
    this.beams = this._addPool(box(1, 1, 1).translate(0.5, 0, 0), additiveMaterial(-1, 0.88, 1.12), 900, 4);
    this.warningEdges = this._addPool(
      box(1, 1, 1).translate(0.5, 0, 0),
      emissiveMaterial({
        color: 0xffffff,
        emissiveIntensity: 1,
        opacity: 0.9,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
      240,
      3,
    );
    this.ringPool = this._addPool(ring(0.87, 1, 36), additiveMaterial(-1, 0.86, 1.1), 260, 3);
    this.discs = this._addPool(disc(1, 32), additiveMaterial(-1, 0.8, 0.92), 160, 2);
    this.columns = this._addPool(
      cylinder(0.65, 1, 1, 14, true).translate(0, 0.5, 0),
      additiveMaterial(-1, 0.76, 1.05),
      96,
      4,
    );
    this.ebInk = this._addPool(
      discXY(0.5, 16),
      emissiveMaterial({
        color: FINISH.ink,
        emissiveIntensity: 1,
        opacity: 0.92,
        transparent: true,
        depthWrite: false,
        doubleSide: true,
        fog: false,
      }),
      640,
      6,
      { color: false },
    );
    this.ebBoltInk = this._addPool(
      box(1, 1, 1).translate(0.5, 0, 0),
      emissiveMaterial({
        color: FINISH.ink,
        emissiveIntensity: 1,
        opacity: 0.9,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
      360,
      6,
      { color: false },
    );
    this.ebCore = this._addPool(
      octahedron(0.6),
      emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.28, fog: false }),
      960,
      7,
    );
    this._initHeroLocator();

    this.rocketBodies = this._addPool(
      rocketProjectileGeometry(),
      worldMaterial({ surface: "metal", vertexColors: true }),
      140,
      2,
    );
    this.discPool = this._addPool(
      discGeometry(),
      worldMaterial({ surface: "metal", vertexColors: true, emissive: 0x305860 }),
      96,
      2,
    );
    this.shardPool = this._addPool(
      shardGeometry(),
      worldMaterial({ surface: "crystal", color: 0xffffff, emissive: 0x14181e, emissiveIntensity: 0.45 }),
      260,
      2,
    );
    this.healPool = this._addPool(
      healCrossGeometry(),
      emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.22 }),
      48,
      2,
    );
    this.blades = this._addPool(
      orbitBladeGeometry(),
      emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.18, vertexColors: true }),
      48,
      2,
    );
    this.wing = this._addPool(wingDroneGeometry(), worldMaterial({ surface: "armor", vertexColors: true }), 16, 2);
    this.wing.mesh.castShadow = true;
    this.shieldPool = this._addPool(
      shieldArcGeometry(),
      emissiveMaterial({
        color: 0xffffff,
        emissiveIntensity: 1.12,
        opacity: 0.74,
        transparent: true,
        additive: false,
        vertexColors: true,
        depthWrite: false,
        doubleSide: true,
      }),
      96,
      4,
    );

    // Prebuild compact GPU-animated instanced body+glow pools for all 25 enemy types
    this.enemyPools = {};
    for (const [type, def] of Object.entries(enemyDefs)) {
      const kit = enemyGeometry(type);
      const bodyMat = worldMaterial({
        surface: enemySurface(type),
        vertexColors: true,
        biomeSkin: true,
      });
      const glowMat = emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.18, vertexColors: true });
      const cap = type === "swarmer" || type === "mite" ? 180 : 96;
      const body = this._addCompactPool(kit.body, bodyMat, cap, 1);
      body.mesh.castShadow = true;
      body.mesh.receiveShadow = true;
      const glow = this._addCompactPool(kit.glow, glowMat, cap, 2);
      this.enemyPools[type] = { body, glow, color: hexColor(def.color) };
    }

    // Prebuild compact GPU-animated 3D attachment pools for all 6 Biome Variants & 3 Elite Affixes
    const attachBodyMat = worldMaterial({ surface: "metal", vertexColors: true, biomeSkin: true });
    const attachGlowMat = emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.28, vertexColors: true });
    this.variantPools = {};
    this._attachPools = [];
    for (const v of Object.values(biomeVariants)) {
      const kit = variantAttachmentGeometry(v.id);
      const body = this._addCompactPool(kit.body, attachBodyMat, 56, 1);
      body.mesh.castShadow = true;
      const glow = this._addCompactPool(kit.glow, attachGlowMat, 56, 2);
      this.variantPools[v.id] = { body, glow };
      this._attachPools.push(body, glow);
    }
    this.affixPools = {};
    for (const af of Object.keys(eliteAffixes)) {
      const kit = affixAttachmentGeometry(af);
      const body = this._addCompactPool(kit.body, attachBodyMat, 36, 1);
      body.mesh.castShadow = true;
      const glow = this._addCompactPool(kit.glow, attachGlowMat, 36, 2);
      this.affixPools[af] = { body, glow };
      this._attachPools.push(body, glow);
    }

    this._stablePools = [
      this.shadows,
      this.sprites,
      this.sparks,
      this.beams,
      this.warningEdges,
      this.ringPool,
      this.discs,
      this.columns,
      this.ebInk,
      this.ebBoltInk,
      this.ebCore,
      this.rocketBodies,
      this.discPool,
      this.shardPool,
      this.healPool,
      this.blades,
      this.wing,
      this.shieldPool,
    ];
  }

  _initHeroLocator() {
    // Subtle, always-readable double-hairline warm-ivory & weapon-accent compass ring beneath the Hero's feet
    const root = new Node();
    root.visible = false;
    const inkMat = emissiveMaterial({
      color: FINISH.ink,
      emissiveIntensity: 1,
      opacity: 0.58,
      transparent: true,
      depthWrite: false,
      doubleSide: true,
      fog: false,
    });
    const ivoryMat = emissiveMaterial({
      color: FINISH.ivory,
      emissiveIntensity: 1.06,
      opacity: 0.82,
      transparent: true,
      depthWrite: false,
      doubleSide: true,
      fog: false,
    });
    const accentMat = emissiveMaterial({
      color: 0x91c9b4,
      emissiveIntensity: 1.15,
      opacity: 0.84,
      transparent: true,
      depthWrite: false,
      doubleSide: true,
      fog: false,
    });
    const inkRing = new MeshNode(ring(0.57, 0.72, 36), inkMat);
    inkRing.renderOrder = 2;
    const outerRing = new MeshNode(ring(0.62, 0.67, 36), ivoryMat);
    outerRing.position.y = 0.004;
    outerRing.renderOrder = 2;
    const innerCompass = new Node();
    innerCompass.position.y = 0.008;
    const pointerGeo = mergeGeometries([
      ring(0.49, 0.535, 36),
      octahedron(0.11).scale(1.4, 0.14, 0.72).translate(0.75, 0, 0),
    ]);
    const innerMesh = new MeshNode(pointerGeo, accentMat);
    innerMesh.renderOrder = 2;
    innerCompass.add(innerMesh);
    root.add(inkRing, outerRing, innerCompass);
    this.scene.add(root);
    this.heroLocator = { root, compass: innerCompass, accentMat };
  }

  allPools() {
    return this._stablePools;
  }

  markResize() {
    this._needsResize = true;
  }

  resize() {
    this._needsResize = false;
    const w = this.canvas.clientWidth || window.innerWidth || 800;
    const h = this.canvas.clientHeight || window.innerHeight || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.engine.setPixelRatio(dpr);
    this.engine.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._rlViewKey = "";
  }

  camDistance() {
    const aspect = this.w / Math.max(1, this.h);
    const portraitBoost = aspect < 1 ? 1.18 : aspect < 1.45 ? 1.06 : 1;
    return 24.5 * this.zoom * portraitBoost;
  }

  setBiome(biome, layout) {
    const targetKey = layout ? layout.key : `${biome.id}:menu`;
    const changed = !this.biome || this.biome.id !== biome.id || this.arena.layKey !== targetKey;
    this.biome = biome;
    if (changed) {
      this.arena.build(biome, layout, !!layout, !layout);
      this.engine.clearWake();
      if (layout) this.mapChanged = true;
    }
    const look = RL_BIOME_LOOK[biome.id] || RL_BIOME_LOOK.courtyard;
    const s = this.scene;
    s.wakeHalf.x = (layout ? layout.W : 20) + 2;
    s.wakeHalf.y = (layout ? layout.H : 15) + 2;
    s.biomeIndex = look.style;
    s.clearColor.setHex(look.fogColor);
    s.fogColor.setHex(look.fogColor);
    s.sunColor.setHex(look.sun);
    s.sunIntensity = look.sunI;
    s.hemiSky.setHex(look.skyFill);
    s.hemiGround.setHex(look.groundFill);
    s.hemiIntensity = look.hemi;
    s.fillColor.setHex(look.fill[0]);
    s.fillIntensity = look.fill[1];
    s.shadowTint.setHex(look.shadowTint);
    s.rimColor.setHex(look.rimColor);
    s.bloomStrength = look.bloom;
    this.engine.setClearColor(s.clearColor, 1);

    const dist = this.camDistance();
    s.fogNear = dist * look.fog[0];
    s.fogFar = dist * look.fog[1];

    const auroraK = this.rlAuroraK || 0;
    if (biome.id === "shelf") {
      const breath = 0.5 - 0.5 * Math.cos(((this.worldT || 0) / 20) * TAU);
      s.fogNear *= 1 - 0.1 * breath;
      s.fogFar *= 1 - 0.1 * breath;
      if (auroraK > 0) {
        s.bloomStrength = look.bloom + 0.08 * auroraK;
      }
    }
  }

  ensurePlayer(weapon, menu = false) {
    if (this.playerWeapon === weapon && this.player) return;
    const swapped = !!this.player && menu;
    if (this.player) {
      this.scene.remove(this.player.group);
      this.player.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
    }
    this.player = buildPlayerModel(weapon, weaponDefs[weapon].color);
    if (swapped) this.player.inspectT = 0.55;
    this.playerWeapon = weapon;
    setWorldShadows(this.player.group);
    this.scene.add(this.player.group);
  }

  emit(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    const parts = this.P;
    if (opts.ambient && parts.n >= this.maxParticles * AMBIENT_POOL_SHARE) return;
    if (
      parts.n >= this.maxParticles ||
      (parts.n > this.maxParticles * 0.6 && Math.random() < (parts.n / this.maxParticles - 0.6) * 2)
    ) {
      return;
    }
    parts.spawn(
      x,
      y,
      z,
      vx,
      vy,
      vz,
      this.time,
      life,
      size,
      color.r,
      color.g,
      color.b,
      opts.drag ?? 2.5,
      opts.grav ?? 0,
      opts.grow || 0,
      opts.spark ? 1 : 0,
      Math.random(),
    );
  }

  burst(x, z, y, count, speed, color, life = 0.5, size = 0.35, opts = {}) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const spd = speed * (0.35 + Math.random() * 0.65);
      const vy = opts.up != null ? opts.up : (Math.random() - 0.3) * speed * 0.5;
      this.emit(
        x,
        y,
        z,
        Math.cos(angle) * spd,
        vy,
        Math.sin(angle) * spd,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.7),
        color,
        opts,
      );
    }
  }

  line(x1, z1, x2, z2, color, life, width = 0.12, y = 0.7, bend = 0) {
    if (this.lines.length <= 120) this.lines.push({ x1, z1, x2, z2, col: color, life, max: life, w: width, y, bend });
  }

  ring(x, z, r0, r1, color, life, y = 0.06) {
    if (this.rings.length <= 100) this.rings.push({ x, z, r0, r1, col: color, life, max: life, y });
  }

  addShake(amount) {
    this.shake = Math.min(0.75, this.shake + amount * this.motion);
  }

  flash(x, z, radius, intensity, color, decay = 6) {
    if (this.flashes.length > 24) this.flashes.shift();
    this.flashes.push({ x, z, r: radius, i: intensity, col: color, decay });
  }

  addScorch(x, z, radius) {
    this.attackView.mark(x, z, radius * 1.15, MARK_LOOK.burn);
  }

  debrisBurst(x, z, y, count, color, size, speed) {
    const tint = this.biome && RL_BIOME_TINT[this.biome.id];
    const c = this._debrisTint.copy(color);
    if (tint) c.lerp(tint, 0.5);
    const ring = this.D;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const spd = speed * (0.4 + Math.random() * 0.8);
      ring.spawn(
        x + Math.cos(angle) * 0.2,
        y,
        z + Math.sin(angle) * 0.2,
        Math.cos(angle) * spd,
        2.2 + Math.random() * speed * 0.8,
        Math.sin(angle) * spd,
        this.time,
        1.1 + Math.random() * 0.6,
        size * (0.5 + Math.random() * 0.7),
        c.r,
        c.g,
        c.b,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
        Math.random() * TAU,
      );
    }
  }

  updateLights(dt, world) {
    const flashes = this.flashes;
    let w = 0;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i];
      f.i -= f.i * Math.min(1, f.decay * dt) + dt * 0.05;
      if (f.i > 0.02) flashes[w++] = f;
    }
    flashes.length = w;

    const sorted = this._flashSort;
    sorted.length = 0;
    for (let i = 0; i < flashes.length; i++) sorted.push(flashes[i]);
    let lanternRelief = 0;
    const props = world?.arena?.props;
    if (props && props.length) {
      this._lanternLights ||= [
        { x: 0, z: 0, r: 4.8, i: 0, col: hexColor(0xffcf78) },
        { x: 0, z: 0, r: 4.8, i: 0, col: hexColor(0xffcf78) },
        { x: 0, z: 0, r: 4.8, i: 0, col: hexColor(0xffcf78) },
      ];
      let li = 0;
      for (const prop of props) {
        if (prop.kind === "lantern" && prop.auraT > 0 && li < 3) {
          const fade = Math.min(1, prop.auraT / 1.0);
          const ll = this._lanternLights[li++];
          ll.x = prop.x;
          ll.z = prop.y;
          ll.r = 4.6;
          ll.i = 1.15 * fade;
          sorted.push(ll);
          if (world?.player) {
            const d = Math.hypot(world.player.x - prop.x, world.player.y - prop.y);
            if (d < 6.5) lanternRelief = Math.max(lanternRelief, (1 - d / 6.5) * 0.68 * fade);
          }
        }
      }
    }
    sorted.sort(flashOrder);

    const lights = this.scene.pointLights;
    this.muzzle = Math.max(0, (this.muzzle || 0) - dt * 14);
    const player = world?.player;

    // Slot 0: dynamic player muzzle / weapon glow light
    if (player && this.muzzle > 0.01) {
      lights[0].x = player.x + Math.cos(player.aim) * 0.85;
      lights[0].y = 1.4;
      lights[0].z = player.y + Math.sin(player.aim) * 0.85;
      lights[0].r = this._muzzleCol.r;
      lights[0].g = this._muzzleCol.g;
      lights[0].b = this._muzzleCol.b;
      lights[0].radius = 5.5;
      lights[0].intensity = this.muzzle * 0.85;
    } else {
      lights[0].intensity = 0;
    }

    // Slots 1..7: strongest 7 active combat flashes (blasts, arcs, traps, boss attacks)
    for (let i = 0; i < 7; i++) {
      const f = sorted[i];
      const slot = lights[i + 1];
      if (f) {
        slot.x = f.x;
        slot.y = 1.65;
        slot.z = f.z;
        slot.r = f.col.r;
        slot.g = f.col.g;
        slot.b = f.col.b;
        slot.radius = Math.max(2.5, f.r * 2.0);
        slot.intensity = Math.min(1.5, f.i * 1.05);
      } else {
        slot.intensity = 0;
      }
    }

    const warm = this.rlWarmK || 0;
    this.scene.darkness = 0;
    if (warm > 0) {
      this.scene.hemiIntensity *= 1 + 0.14 * warm + 0.12 * lanternRelief;
      this.scene.fillIntensity *= 1 + 0.22 * warm;
    }
  }

  consume(events, world, opts) {
    const showNumbers = opts.numbers !== false && this.numbers !== false;
    const shakeK = (opts.shake === false ? 0 : 1) * this.motion;
    for (const ev of events) {
      if (this.abilityView.event(ev, world, shakeK)) continue;
      if (this.bossCardView.event(ev, world, shakeK)) continue;
      if (this.actorView.consume(ev, shakeK, world)) continue;
      switch (ev.k) {
        case "shot": {
          const def = weaponDefs[ev.w];
          const color = hexColor(def.color);
          const dirX = Math.cos(ev.a),
            dirZ = Math.sin(ev.a);
          const muzzle = this._shotMuzzle || (this._shotMuzzle = new Vec3());
          this.player.aimAt(ev.a);
          this.player.muzzle.getWorldPosition(muzzle);
          muzzle.x += ev.x - this.player.group.position.x;
          muzzle.z += ev.y - this.player.group.position.z;
          this.player.recoil = Math.min(
            0.08,
            this.player.recoil + (def.id === "rail" || def.id === "scatter" ? 0.065 : 0.038) * this.motion,
          );
          const muzzleKind = WEAPON_EFFECTS[ev.w].muzzle;
          if (muzzleKind === "arc") {
            const tx = muzzle.x + dirX * 0.58,
              tz = muzzle.z + dirZ * 0.58;
            this.line(muzzle.x, muzzle.z, tx, tz, hexColor(FINISH.copper), 0.13, 0.09, muzzle.y, 0.09);
            this.ring(tx, tz, 0.13, 0.36, hexColor(FINISH.brass), 0.17, muzzle.y);
          } else if (muzzleKind === "mechanical") {
            const perpX = -dirZ,
              perpZ = dirX;
            for (const side of [-1, 1]) {
              this.line(
                muzzle.x,
                muzzle.z,
                muzzle.x + (dirX * 0.22 + perpX * side * 0.16),
                muzzle.z + (dirZ * 0.22 + perpZ * side * 0.16),
                color,
                0.07,
                0.025,
                muzzle.y,
              );
            }
            this.burst(muzzle.x, muzzle.z, muzzle.y, 4, 1.8, color, 0.13, 0.08, { spark: true, drag: 6 });
          } else if (muzzleKind === "combustion") {
            for (let j = -2; j <= 2; j++) {
              const coneA = ev.a + j * 0.14;
              const len = j === 0 ? 0.44 : 0.32;
              this.line(
                muzzle.x,
                muzzle.z,
                muzzle.x + Math.cos(coneA) * len,
                muzzle.z + Math.sin(coneA) * len,
                j === 0 ? whiteColor : color,
                0.065,
                0.042,
                muzzle.y,
              );
            }
            this.emit(muzzle.x, muzzle.y, muzzle.z, dirX * 4.5, 0, dirZ * 4.5, 0.085, 0.52, color, { drag: 0 });
            // Eject a spinning burnished-brass shotgun shell casing onto the diorama floor
            const perpX = -dirZ,
              perpZ = dirX;
            this.D.spawn(
              muzzle.x - dirX * 0.35 + perpX * 0.14,
              muzzle.y + 0.05,
              muzzle.z - dirZ * 0.35 + perpZ * 0.14,
              perpX * (2.2 + Math.random() * 1.2) - dirX * 0.8,
              2.6 + Math.random() * 0.9,
              perpZ * (2.2 + Math.random() * 1.2) - dirZ * 0.8,
              this.time,
              0.95,
              0.085,
              0.92,
              0.72,
              0.36,
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
              Math.random() * TAU,
            );
          } else if (muzzleKind === "rail") {
            const perpX = -dirZ,
              perpZ = dirX;
            for (const side of [-1, 1]) {
              this.line(
                muzzle.x,
                muzzle.z,
                muzzle.x - dirX * 0.18 + perpX * side * 0.36,
                muzzle.z - dirZ * 0.18 + perpZ * side * 0.36,
                color,
                0.11,
                0.032,
                muzzle.y,
              );
            }
            this.ring(muzzle.x + dirX * 0.15, muzzle.z + dirZ * 0.15, 0.12, 0.85, color, 0.14);
            this.emit(muzzle.x, muzzle.y, muzzle.z, dirX * 5, 0, dirZ * 5, 0.08, 0.42, whiteColor, { drag: 0 });
          } else if (muzzleKind === "backblast") {
            this.line(
              muzzle.x,
              muzzle.z,
              muzzle.x + dirX * 0.32,
              muzzle.z + dirZ * 0.32,
              whiteColor,
              0.065,
              0.08,
              muzzle.y,
            );
            const backX = muzzle.x - dirX * 0.62,
              backZ = muzzle.z - dirZ * 0.62;
            this.emit(backX, muzzle.y, backZ, -dirX * 3.2, 0.35, -dirZ * 3.2, 0.18, 0.45, color, { drag: 3 });
            this.smokeView.emit(backX, muzzle.y, backZ, 0.44, 0x9da7a8, 0.4);
          } else if (muzzleKind === "fire") {
            this.emit(
              muzzle.x + dirX * 0.12,
              muzzle.y,
              muzzle.z + dirZ * 0.12,
              dirX * 3.5,
              0.3,
              dirZ * 3.5,
              0.08,
              0.28,
              whiteColor,
              { drag: 2 },
            );
          } else {
            this.line(
              muzzle.x,
              muzzle.z,
              muzzle.x + dirX * 0.34,
              muzzle.z + dirZ * 0.34,
              whiteColor,
              0.055,
              0.06,
              muzzle.y,
            );
            this.emit(muzzle.x, muzzle.y, muzzle.z, dirX * 4.5, 0, dirZ * 4.5, 0.08, 0.42, color, { drag: 0 });
            this.emit(muzzle.x, muzzle.y, muzzle.z, dirX * 2.2, 0, dirZ * 2.2, 0.045, 0.24, whiteColor, { drag: 0 });
          }
          if (["pulse", "scatter", "rocket", "flame"].includes(def.id)) {
            this.smokeView.emit(muzzle.x, muzzle.y, muzzle.z, def.id === "scatter" ? 0.5 : 0.3, 0x9da7a8, 0.35);
          }
          this.muzzle = Math.min(1, (this.muzzle || 0) + (def.id === "flame" ? 0.14 : 0.65));
          this._muzzleCol.copy(color);
          if (!this.lastMuzzleT || this.time - this.lastMuzzleT > 0.05) {
            this.lastMuzzleT = this.time;
            this.flashes.push({
              x: muzzle.x,
              z: muzzle.z,
              r: def.id === "rail" ? 3.4 : 2.3,
              i: def.id === "flame" ? 0.4 : 0.6,
              col: color,
              decay: 16,
              muzzle: true,
            });
          }
          if (def.shake > 0.04 && shakeK) {
            this.kick = Math.min(0.6, this.kick + def.shake * 2.2 * this.motion);
            this.kickA = ev.a;
          }
          if (def.rail) {
            const len = world.stats.lance ? world.stats.range : world.arena.rayLen(ev.x, ev.y, ev.a, world.stats.range);
            const offset = (muzzle.x - ev.x) * dirX + (muzzle.z - ev.y) * dirZ;
            if (len > offset) {
              this.line(muzzle.x, muzzle.z, ev.x + dirX * len, ev.y + dirZ * len, color, 0.22, 0.11, muzzle.y);
              this.line(muzzle.x, muzzle.z, ev.x + dirX * len, ev.y + dirZ * len, whiteColor, 0.09, 0.03, muzzle.y);
            }
          }
          this.addShake(def.shake * 0.3 * shakeK);
          break;
        }
        case "wingShot":
          this.emit(ev.x, 0.9, ev.y, 0, 0, 0, 0.06, 0.6, hexColor(weaponDefs[world.weapon].color), { drag: 0 });
          break;
        case "dmg": {
          if (showNumbers) {
            let existing = null;
            if (ev.id) {
              for (const num of this.nums) {
                if (
                  num.id === ev.id &&
                  this.time - num.t0 <= (num.burn ? 0.6 : 0.15) &&
                  !num.burn == !ev.burn &&
                  !num.shield == !ev.shield
                ) {
                  existing = num;
                  break;
                }
              }
            }
            if (existing) {
              existing.v += ev.v;
              existing.crit = existing.crit || ev.crit;
              if (ev.burn) existing.life = 0.6;
            } else {
              const num = {
                id: ev.id,
                x: ev.x + (Math.random() - 0.5) * 0.4,
                z: ev.y,
                y: 1.4,
                v: ev.v,
                crit: ev.crit,
                burn: ev.burn,
                shield: ev.shield,
                life: ev.crit ? 0.8 : 0.6,
                t0: this.time,
              };
              if (this.nums.length < 24) this.nums.push(num);
              else {
                let low = 0;
                for (let i = 1; i < this.nums.length; i++) if (this.nums[i].v < this.nums[low].v) low = i;
                if (this.nums[low].v < ev.v) this.nums[low] = num;
              }
            }
          }
          if (!ev.burn) {
            const a = Math.atan2(ev.y - world.player.y, ev.x - world.player.x);
            const material = ev.shield ? "energy" : actorMaterial(ev.type);
            const hard = material === "armor" || material === "crystal";
            const impactColor = hexColor(
              { armor: 0xdec48f, organic: 0x62c478, stone: 0x9c8c78, energy: 0xbe8cff, crystal: 0xb6f2ff }[material] ||
                0xffffff,
            );
            const n = ev.crit ? 6 : hard ? 3 : 2;
            for (let j = 0; j < n; j++) {
              const angle = ev.crit ? a + (j / n) * TAU : a + (j / Math.max(1, n - 1) - 0.5) * 1.75;
              const length = ev.crit ? 0.78 : hard ? 0.42 : 0.28;
              this.line(
                ev.x,
                ev.y,
                ev.x + Math.cos(angle) * length,
                ev.y + Math.sin(angle) * length,
                ev.crit ? goldColor : impactColor,
                ev.crit ? 0.14 : 0.085,
                ev.crit ? 0.036 : 0.026,
                0.68,
              );
            }
            this.emit(
              ev.x,
              0.72,
              ev.y,
              0,
              0,
              0,
              ev.crit ? 0.11 : 0.075,
              ev.crit ? 0.68 : 0.4,
              ev.crit ? goldColor : impactColor,
              {
                drag: 0,
              },
            );
            if (ev.crit) {
              this.ring(ev.x, ev.y, 0.14, 0.84, goldColor, 0.16, 0.08);
              this.addShake(0.022 * shakeK);
            }
            this.burst(
              ev.x,
              ev.y,
              0.65,
              ev.crit ? 6 : 3,
              hard ? 5.6 : 3.2,
              ev.crit ? goldColor : impactColor,
              0.2,
              0.22,
              {
                spark: hard || ev.crit,
                up: ev.crit ? 2.4 : 1.2,
                drag: 5.5,
              },
            );
          }
          break;
        }
        case "kill": {
          const color = ev.boss
            ? hexColor(bossDefs[ev.type].color)
            : ev.elite
              ? goldColor
              : hexColor(enemyDefs[ev.type].color);
          const scale = ev.boss ? 4 : ev.elite ? 1.8 : Math.max(0.8, ev.r * 1.4);
          const material = actorMaterial(ev.type);
          const hard = material === "armor" || material === "crystal";
          this.burst(
            ev.x,
            ev.y,
            0.6,
            Math.round((ev.boss ? 12 : 4) * scale),
            5 * Math.sqrt(scale),
            ev.boss ? color : hexColor(enemySurface(ev.type) === "organic" ? 0x6cd48c : 0xdcc49c),
            ev.boss ? 0.55 : 0.28,
            (ev.boss ? 0.45 : 0.17) * Math.sqrt(scale),
          );
          this.burst(
            ev.x,
            ev.y,
            0.6,
            Math.round((hard ? 6 : 3) * scale),
            (hard ? 10 : 4.2) * Math.sqrt(scale),
            hard ? whiteColor : color,
            0.3,
            hard ? 0.18 : 0.13,
            { spark: hard, drag: 5 },
          );
          if (ev.boss) {
            this.ring(ev.x, ev.y, 0.2, 1.6 * scale, color, 0.38);
            this.emit(ev.x, 0.8, ev.y, 0, 0, 0, 0.14, 2.3 * scale, color, { drag: 0 });
          } else {
            this.ring(ev.x, ev.y, 0.15, 0.95 + ev.r * 1.2, color, 0.22, 0.08);
            this.emit(ev.x, 0.65, ev.y, 0, 0, 0, 0.1, 0.8 + scale * 0.52, whiteColor, { drag: 0 });
            if (ev.elite) {
              this.ring(ev.x, ev.y, 0.25, 2.35, goldColor, 0.32, 0.12);
              this.burst(ev.x, ev.y, 0.8, 10, 6.5, goldColor, 0.38, 0.22, { spark: true, up: 3.2, drag: 3.5 });
            }
            if (material !== "energy") {
              this.smokeView.emit(
                ev.x,
                0.6,
                ev.y,
                0.62 * scale,
                enemySurface(ev.type) === "organic" ? 0x527a60 : 0x8a9296,
                0.52,
              );
            }
          }
          if (ev.type === "queen") {
            for (let j = 0; j < 14; j++)
              this.emit(
                ev.x + (Math.random() - 0.5) * 3,
                0.6 + Math.random() * 1.6,
                ev.y + (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 0.8,
                0.5 + Math.random() * 0.5,
                (Math.random() - 0.5) * 0.8,
                2.5 + Math.random() * 1.5,
                0.22,
                hexColor(0x46ffc0),
                { drag: 1.2 },
              );
            this.ring(ev.x, ev.y, 0.4, 4.5, hexColor(0xd9fff0), 0.5);
          } else if (ev.type === "bellkeeper") {
            this.burst(ev.x, ev.y, 1.2, 16, 8, hexColor(0x3a8bff), 0.55, 0.24, { spark: true, drag: 3 });
            this.burst(ev.x, ev.y, 1.2, 16, 8, hexColor(0xff4258), 0.55, 0.24, { spark: true, drag: 3 });
            this.ring(ev.x, ev.y, 0.5, 5.2, hexColor(0x3a8bff), 0.42);
          } else if (ev.type === "prism") {
            this.burst(ev.x, ev.y, 1.5, 22, 9, hexColor(0xcff6ff), 0.75, 0.28, { spark: true, up: 4, drag: 2 });
            this.ring(ev.x, ev.y, 0.4, 5.4, hexColor(0x7be8ff), 0.48);
          } else if (ev.type === "core") {
            this.burst(ev.x, ev.y, 1.8, 20, 8.5, hexColor(0xc27bff), 0.7, 0.3, { spark: true, up: 5, drag: 2 });
            this.burst(ev.x, ev.y, 1.8, 12, 6, hexColor(0xff5cab), 0.65, 0.26, { up: 4, drag: 2 });
            this.ring(ev.x, ev.y, 0.5, 5.8, hexColor(0xdcb3ff), 0.5);
          } else if (ev.type === "tyrant") {
            this.burst(ev.x, ev.y, 1.1, 22, 9, hexColor(0xffa14a), 0.8, 0.34, {
              spark: true,
              up: 7,
              grav: 9,
              drag: 1.5,
            });
            this.smokeView.emit(ev.x, 1.1, ev.y, 2.2, 0x3a322d, 0.7);
            this.ring(ev.x, ev.y, 0.5, 5.4, hexColor(0xff6b2b), 0.48);
          } else if (ev.type === "wyrm") {
            this.burst(ev.x, ev.y, 1.2, 22, 9.5, hexColor(0xffe08a), 0.7, 0.26, {
              spark: true,
              up: 5,
              grav: 7,
              drag: 2,
            });
            this.burst(ev.x, ev.y, 0.5, 14, 6, hexColor(0xd8c8a8), 0.7, 0.32, { up: 3, drag: 3 });
            this.ring(ev.x, ev.y, 0.5, 5.4, hexColor(0xffdf88), 0.46);
          }
          const base = hexColor(ev.boss ? bossDefs[ev.type].color : enemyDefs[ev.type].color);
          this._dk.copy(base).multiplyScalar(0.55);
          this.debrisBurst(
            ev.x,
            ev.y,
            0.6,
            Math.round(Math.min(11, 3 + scale * 3)),
            this._dk.clone(),
            0.12 + 0.1 * Math.sqrt(scale),
            2.6 + scale * 1.7,
          );
          if (!ev.boss && this.corpses.length < 40 && enemyDefs[ev.type]) {
            this.corpses.push({
              type: ev.type,
              x: ev.x,
              z: ev.y,
              r: ev.r / enemyDefs[ev.type].r,
              a: Math.random() * TAU,
              spin: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5),
              t: 0,
              elite: !!ev.elite,
            });
          }
          if (!ev.boss && this.maxParticles >= 800) {
            this.debrisBurst(ev.x, ev.y, 0.7, ev.elite ? 4 : 2, base, 0.1 + 0.08 * Math.sqrt(scale), 4 + scale * 2);
          }
          if (ev.r >= 0.5 || ev.elite || ev.boss) {
            this.attackView.mark(
              ev.x,
              ev.y,
              ev.r * 1.3 + 0.3,
              material === "organic"
                ? MARK_LOOK.slime
                : material === "energy"
                  ? MARK_LOOK.rift
                  : material === "crystal"
                    ? MARK_LOOK.crack
                    : MARK_LOOK.burn,
            );
          }
          if (ev.boss) this.flash(ev.x, ev.y, 2 + scale * 1.6, 0.8 + scale * 0.22, color, 5);
          else this.flash(ev.x, ev.y, 0.9 + scale * 0.6, 0.25, hexColor(0xffd4a0), 12);
          this.addShake((ev.boss ? 0.9 : ev.elite ? 0.18 : 0.04) * shakeK);
          break;
        }
        case "boom": {
          if (ev.kind === "trap" || ev.kind === "surge") break;
          this.engine.stampWake(ev.x, ev.y, Math.min(4.2, ev.r * 1.15), 0.95, 0.45, 0.95, 1.0, 0.72);
          if (this.attackView.impact(ev, world, shakeK)) break;
          const color =
            ev.kind === "pop"
              ? hexColor(0xffe066)
              : ev.kind === "payload"
                ? hexColor(0xffa458)
                : ev.kind === "rocket"
                  ? hexColor(0xff6b3a)
                  : ev.kind === "frost" || ev.kind === "glacier"
                    ? hexColor(0x9eeeff)
                    : hexColor(0xff5a5a);
          const radius = ev.r;
          this.burst(ev.x, ev.y, 0.5, Math.round(8 + radius * 6), radius * 5.4, color, 0.48, 0.54 + radius * 0.12, {
            spark: true,
            up: 2.2,
          });
          this.emit(ev.x, 0.6, ev.y, 0, 0, 0, 0.16, radius * 2.5, color, { drag: 0 });
          this.emit(ev.x, 0.68, ev.y, 0, 0, 0, 0.09, radius * 1.45, whiteColor, { drag: 0 });
          this.ring(ev.x, ev.y, radius * 0.25, radius * 1.08, color, 0.32, 0.12);
          this.addShake(
            (ev.kind === "payload"
              ? 0.02
              : ev.kind === "rain" || ev.kind === "stomp" || ev.kind === "mortar"
                ? 0.25
                : 0.1) * shakeK,
          );
          if (ev.kind !== "payload" || Math.random() < 0.3)
            this.flash(ev.x, ev.y, radius * 1.6, ev.kind === "payload" ? 0.5 : 1.15, color, 4.5);
          if (ev.kind !== "payload" && ev.kind !== "pop" && ev.kind !== "frost" && ev.kind !== "glacier")
            this.addScorch(ev.x, ev.y, radius * 0.7);
          if (ev.kind === "frost" || ev.kind === "glacier")
            this.burst(ev.x, ev.y, 0.2, Math.round(8 + radius * 4), radius * 1.6, whiteColor, 0.6, 0.22, {
              spark: true,
            });
          if (["rocket", "bomber", "mortar", "volatile"].includes(ev.kind))
            this.debrisBurst(ev.x, ev.y, 0.3, 4, hexColor(0x3a2e28), 0.12, 5);
          break;
        }
        case "chain":
          for (let i = 0; i + 3 < ev.pts.length; i += 2) {
            this.line(
              ev.pts[i],
              ev.pts[i + 1],
              ev.pts[i + 2],
              ev.pts[i + 3],
              hexColor(FINISH.copper),
              0.24,
              0.1,
              0.64,
              0.24,
            );
          }
          break;
        case "zap":
          this.burst(ev.x, ev.y, 0.6, 6, 6, hexColor(0x7ef2ff), 0.25, 0.3, { spark: true });
          break;
        case "freeze":
          this.burst(ev.x, ev.y, 0.8, 4, 3, hexColor(0xbef2ff), 0.4, 0.3);
          break;
        case "spark":
          this.burst(ev.x, ev.y, 0.7, 3, 4, hexColor(weaponDefs[ev.w] ? weaponDefs[ev.w].color : 0xffffff), 0.2, 0.2, {
            spark: true,
          });
          break;
        case "bounce":
          this.burst(ev.x, ev.y, 0.7, 3, 5, whiteColor, 0.2, 0.2, { spark: true });
          break;
        case "ping":
          if (ev.resist) {
            if (this.time - (this.lastResist || 0) > 0.04) {
              this.lastResist = this.time;
              this.burst(ev.x, ev.y, 1, 3, 4, resistColor, 0.16, 0.16, { spark: true, drag: 5 });
              this.emit(ev.x, 1, ev.y, 0, 0, 0, 0.12, 0.8, resistColor, { drag: 0 });
              for (let i = 0; i < 6; i++) {
                this.line(
                  ev.x + Math.cos((i / 6) * TAU) * 0.38,
                  ev.y + Math.sin((i / 6) * TAU) * 0.38,
                  ev.x + Math.cos(((i + 1) / 6) * TAU) * 0.38,
                  ev.y + Math.sin(((i + 1) / 6) * TAU) * 0.38,
                  resistColor,
                  0.16,
                  0.05,
                  1,
                );
              }
            }
          } else {
            this.burst(ev.x, ev.y, 1.2, 2, 4, hexColor(0x9fb8d8), 0.2, 0.25, { spark: true });
          }
          break;
        case "trapFire":
        case "trapArm":
          this.trapView.event(ev, world, shakeK);
          break;
        case "gadgetReady":
          this.ring(world.player.x, world.player.y, 0.3, 1.2, hexColor(0xffba66), 0.3, 0.1);
          this.burst(world.player.x, world.player.y, 0.9, 5, 3, hexColor(0xffeec0), 0.35, 0.16, { spark: true });
          break;
        case "gadgetDeny":
          this.burst(world.player.x, world.player.y, 0.9, 4, 2.5, resistColor, 0.25, 0.14, { spark: true, drag: 4 });
          break;
        case "novaReady":
          this.ring(world.player.x, world.player.y, 0.35, 1.45, hexColor(0x6ee7ff), 0.32, 0.14);
          this.burst(world.player.x, world.player.y, 0.9, 6, 3.2, whiteColor, 0.3, 0.15, { up: 3, spark: true });
          break;
        case "shieldUp":
          this.ring(world.player.x, world.player.y, 1.1, 0.55, hexColor(0x74f7ff), 0.28, 0.12);
          this.burst(world.player.x, world.player.y, 0.9, 6, 2.8, hexColor(0x74f7ff), 0.28, 0.14, {
            spark: true,
            drag: 3,
          });
          break;
        case "barrier":
          this.ring(ev.x, ev.y, 0.4, 2.4, goldColor, 0.42, 0.16);
          this.burst(ev.x, ev.y, 0.9, 10, 4.5, goldColor, 0.4, 0.2, { up: 3, spark: true, drag: 2 });
          this.flash(ev.x, ev.y, 3.5, 1.2, goldColor, 4);
          break;
        case "bountyPulse":
          this.ring(ev.x, ev.y, 0.3, 1.4, goldColor, 0.28, 0.12);
          this.burst(ev.x, ev.y, 1, 5, 2.5, goldColor, 0.32, 0.14, { up: 3.5, spark: true });
          break;
        case "shortArm":
          this.ring(ev.x, ev.y, 0.25, ev.r || 1.4, hexColor(FINISH.brass), 0.32);
          this.burst(ev.x, ev.y, 0.6, 7, 4, goldColor, 0.28, 0.12, { spark: true, drag: 4 });
          break;
        case "dash": {
          const p = world.player;
          const a = Math.atan2(p.vy, p.vx);
          const copper = hexColor(FINISH.copper);
          this.engine.stampWake(p.x, p.y, 1.38, 0.95, 0.78, 0.85, 1.0, 0.55);
          this.line(p.x, p.y, p.x - Math.cos(a) * 1.45, p.y - Math.sin(a) * 1.45, whiteColor, 0.2, 0.085, 0.55, 0);
          for (const side of [-1, 1]) {
            const x = p.x - Math.sin(a) * side * 0.32;
            const z = p.y + Math.cos(a) * side * 0.32;
            this.line(x, z, x - Math.cos(a) * 1.25, z - Math.sin(a) * 1.25, copper, 0.26, 0.072, 0.28, side * 0.18);
          }
          this.ring(p.x, p.y, 0.22, 0.96, hexColor(FINISH.brass), 0.28, 0.08);
          this.burst(p.x, p.y, 0.35, 6, 3.8, hexColor(FINISH.brass), 0.24, 0.16, { spark: true, up: 1.5, drag: 4 });
          break;
        }
        case "step":
        case "land": {
          const look = STEP_LOOK[ev.ground] || STEP_LOOK.flagstone;
          const face = world.player.face;
          const land = ev.k === "land";
          const side = land ? 0 : ev.foot ? 0.2 : -0.2;
          const fx = ev.x - Math.sin(face) * side;
          const fz = ev.y + Math.cos(face) * side;
          const n = land ? 10 : this.maxParticles >= 600 ? 2 : 1;
          if (!land && Math.hypot(world.player.vx, world.player.vy) < 1) break;
          this.engine.stampWake(
            fx,
            fz,
            land ? 1.28 : 0.56,
            land ? 0.92 : 0.64,
            land ? 0.85 : 0.68,
            land ? 0.9 : 0.55,
            land ? 0.8 : 0.32,
            land ? 0.52 : 0.26,
          );
          for (let i = 0; i < n; i++) {
            this.emit(
              fx + (Math.random() - 0.5) * 0.2,
              0.05,
              fz + (Math.random() - 0.5) * 0.2,
              (Math.random() - 0.5) * (land ? 3.2 : 1.2),
              look.up * (0.6 + Math.random() * 0.8) * (land ? 1.6 : 1),
              (Math.random() - 0.5) * (land ? 3.2 : 1.2),
              look.life * (0.7 + Math.random() * 0.6),
              look.size * (land ? 1.6 : 1),
              look.color,
              { drag: 2.5, grav: look.grav, spark: look.spark },
            );
          }
          if (look.ring) this.ring(fx, fz, 0.1, land ? 1.4 : 0.55, look.color, land ? 0.3 : 0.2);
          if (land) this.addShake(0.05 * shakeK);
          break;
        }
        case "edash": {
          const color = hexColor(enemyDefs[ev.type] ? enemyDefs[ev.type].color : 0xffffff);
          this.engine.stampWake(ev.x, ev.y, 1.15, 0.8, 0.65, 0.72, 0.82, 0.4);
          this.ring(ev.x, ev.y, 0.2, 1.3, color, 0.25);
          this.burst(ev.x, ev.y, 0.5, 8, 6, color, 0.3, 0.25, { spark: true });
          break;
        }
        case "supplyDrop":
          this.ring(ev.x, ev.y, 0.3, 1.8, goldColor, 0.35);
          break;
        case "hurt":
          this.addShake(0.35 * shakeK);
          this.burst(ev.x, ev.y, 0.7, 10, 6, hurtColor, 0.35, 0.3);
          break;
        case "heal":
          this.burst(ev.x, ev.y, 0.5, 8, 2.5, healColor, 0.6, 0.3, { up: 3 });
          break;
        case "revive":
          this.ring(ev.x, ev.y, 0.5, 6, healColor, 0.6);
          this.burst(ev.x, ev.y, 0.7, 40, 9, healColor, 0.7, 0.45);
          break;
        case "die":
          this.burst(ev.x, ev.y, 0.7, 60, 12, hexColor(0x7ef2ff), 0.9, 0.5);
          this.ring(ev.x, ev.y, 0.5, 5, hurtColor, 0.5);
          this.addShake(0.8 * shakeK);
          break;
        case "spawn": {
          const def = enemyDefs[ev.type];
          const color = ev.elite ? goldColor : hexColor(def ? def.color : 0xffffff);
          const biomePortal = BIOME_PORTAL_ACCENT[world.arena?.biome?.id] || color;
          const size = def ? def.r : 0.6;
          if (size < 0.6) {
            this.ring(ev.x, ev.y, 0.14, 1.05, color, 0.22);
            this.burst(ev.x, ev.y, 0.25, 6, 9, color, 0.45, 0.22, { up: 1 });
          } else if (size >= 0.85) {
            this.ring(ev.x, ev.y, 0.3, 2.4, color, 0.55);
            this.ring(ev.x, ev.y, 0.2, 1.65, biomePortal, 0.34, 0.08);
            this.burst(ev.x, ev.y, 0.5, 10, 3, color, 0.35, 0.45, { up: 2.5 });
            this.burst(ev.x, ev.y, 0.4, 5, 3.6, biomePortal, 0.32, 0.22, { spark: true, up: 3.2 });
          } else {
            this.ring(ev.x, ev.y, 0.2, 1.4, color, 0.3);
            this.burst(ev.x, ev.y, 0.3, 8, 4, color, 0.4, 0.3, { up: 5 });
            this.burst(ev.x, ev.y, 0.3, 3, 3.2, biomePortal, 0.28, 0.18, { spark: true, up: 2.8 });
          }
          break;
        }
        case "block":
          this.burst(ev.x, ev.y, 0.9, 3, 5, hexColor(0x9fd8ff), 0.2, 0.25, { spark: true, drag: 6 });
          break;
        case "guardBreak":
          this.burst(ev.x, ev.y, 0.9, 22, 8, hexColor(0x5aaaff), 0.45, 0.35, { spark: true });
          this.ring(ev.x, ev.y, 0.3, 2.4, hexColor(0x9fd8ff), 0.35);
          this.addShake(0.08 * shakeK);
          break;
        case "guardUp":
          this.ring(ev.x, ev.y, 2, 0.6, hexColor(0x5aaaff), 0.35);
          break;
        case "shieldPop":
          this.burst(ev.x, ev.y, 0.8, 16, 6, hexColor(eliteAffixes.shielded.color), 0.4, 0.3, { spark: true });
          this.ring(ev.x, ev.y, 0.3, ev.r * 2.6, hexColor(eliteAffixes.shielded.color), 0.3);
          break;
        case "mutator":
          this.ring(ev.x, ev.y, 1, 14, hexColor(0xff5a5a), 0.9);
          this.addShake(0.5 * shakeK);
          break;
        case "bossDown":
          this.flashT = 0.35;
          this.addShake(1 * shakeK);
          this.ring(ev.x, ev.y, 1, 16, whiteColor, 0.8);
          break;
        case "wave":
          this.pulse = 1;
          break;
        case "mend": {
          const mend = hexColor(enemyDefs[ev.src || ev.type]?.color || enemyDefs.mender.color);
          if (ev.tx == null) {
            this.ring(ev.x, ev.y, 0.5, ev.r || 6, mend, 0.5);
            this.burst(ev.x, ev.y, 1, 10, 2, mend, 0.5, 0.15, { up: 2 });
          } else {
            this.line(ev.x, ev.y, ev.tx, ev.ty, mend, 0.35, 0.07, 0.9, 0.14);
            this.burst(ev.tx, ev.ty, 0.8, 6, 2, mend, 0.4, 0.14, { up: 2 });
          }
          break;
        }
        case "chill":
          this.burst(ev.x, ev.y, 0.6, 12, 3, hexColor(0x9eeeff), 0.5, 0.3, { spark: true });
          break;
        case "stun": {
          const arc = hexColor(ev.skin === "riftburst" ? 0xc49bff : 0x8fd0ff);
          this.burst(ev.x, ev.y, 0.6, 14, 6, whiteColor, 0.25, 0.22, { spark: true, drag: 2 });
          this.burst(ev.x, ev.y, 0.6, 8, 3, arc, 0.4, 0.3, { spark: true, up: 2 });
          this.flash(ev.x, ev.y, 2.4, 0.9, arc, 6);
          break;
        }
        case "champion":
          this.ring(ev.x, ev.y, 0.5, 5, goldColor, 0.6);
          this.burst(ev.x, ev.y, 0.5, 30, 7, goldColor, 0.6, 0.45, { up: 4 });
          this.addShake(0.25 * shakeK);
          break;
        case "championDown":
          this.ring(ev.x, ev.y, 1, 9, goldColor, 0.6);
          this.flash(ev.x, ev.y, 6, 1.4, goldColor, 3);
          break;
        case "tribute": {
          const ember = hexColor(0xffb45a);
          this.burst(ev.x, ev.y, 0.3, 20, 5, ember, 0.6, 0.4, { up: 5, spark: true, drag: 1 });
          this.ring(ev.x, ev.y, 0.3, 1.7, ember, 0.4);
          this.flash(ev.x, ev.y, 2.6, 1, ember, 2);
          break;
        }
        case "biomeProp":
          this.biomePropsView.consume(ev);
          break;
        case "erupt":
          if (world?.arena?.biome?.id === "courtyard") {
            const brass = hexColor(FINISH.brass);
            this.ring(ev.x, ev.y, ev.r * 0.52, ev.r, brass, 0.46);
            this.burst(ev.x, ev.y, 0.26, 9, 3.3, brass, 0.42, 0.16, { spark: true, grav: 4, drag: 2 });
            this.addShake(0.035 * shakeK);
          } else if (world?.arena?.biome?.id === "caldera") {
            const magma = hexColor(0xffb45a);
            this.burst(ev.x, ev.y, 0.3, 24, 6, magma, 0.8, 0.55, { up: 8, grav: 9, drag: 1.4 });
            this.burst(ev.x, ev.y, 0.3, 12, 4, hexColor(0xfff0b8), 0.5, 0.35, { up: 10, spark: true });
            this.ring(ev.x, ev.y, ev.r * 0.4, ev.r * 1.4, magma, 0.4);
            this.flash(ev.x, ev.y, ev.r * 2.2, 0.9, magma, 4.5);
            this.addShake(0.12 * shakeK);
          }
          break;
        case "warp": {
          const color = hexColor(FINISH.lavender);
          const count = ev.who === "player" ? 12 : 5;
          this.burst(ev.x, ev.y, 0.6, count, 4, color, 0.4, 0.35, { spark: true });
          this.burst(ev.tx, ev.ty, 0.6, count, 4, hexColor(FINISH.jade), 0.4, 0.21, { spark: true });
          if (ev.who === "player") {
            this.ring(ev.tx, ev.ty, 0.3, 1.6, hexColor(FINISH.jade), 0.35);
            this.camInit = false;
          }
          break;
        }
      }
    }
  }

  updateCamera(dt, world, menu) {
    const cam = this.camera;
    const tilt = this.w < this.h ? 1.08 : 0.98;
    const dist = this.camDistance();
    if (menu) {
      this.menuA += dt * 0.14;
      const radius = 19.5 * this.zoom;
      const height = 13.5 * this.zoom;
      cam.position.set(Math.sin(this.menuA) * radius, height, Math.cos(this.menuA) * radius);
      cam.lookAt(0, 0.7, 0);
    } else {
      const player = world.player;
      const arena = world.arena;
      let tx = player.x,
        tz = player.y;
      if (player.firing) {
        tx += Math.cos(player.aim) * 1.2;
        tz += Math.sin(player.aim) * 1.2;
      }
      tx += player.vx * 0.12;
      tz += player.vy * 0.12;
      tx = clamp(tx, -arena.W + 3, arena.W - 3);
      tz = clamp(tz, -arena.H + 3, arena.H - 3);
      if (!this.camInit) {
        this.camX = tx;
        this.camZ = tz;
        this.camInit = true;
      }
      let damp = dampFactor(5, dt);
      if (this.focus) {
        const k = clamp(this.focusK || 0, 0, 1);
        const blend = k < 0.3 ? smoothstep(k / 0.3) : k > 0.75 ? smoothstep((1 - k) / 0.25) : 1;
        tx += (clamp(this.focus.x, -arena.W + 3, arena.W - 3) - tx) * blend;
        tz += (clamp(this.focus.z, -arena.H + 3, arena.H - 3) - tz) * blend;
        damp = dampFactor(12, dt);
      }
      this.camX += (tx - this.camX) * damp;
      this.camZ += (tz - this.camZ) * damp;
      const amp = this.shake * this.shake * 0.3;
      const shakeX = (Math.random() - 0.5) * amp - Math.cos(this.kickA) * this.kick * 0.35;
      const shakeZ = (Math.random() - 0.5) * amp - Math.sin(this.kickA) * this.kick * 0.35;
      cam.position.set(this.camX + shakeX, Math.sin(tilt) * dist, this.camZ + Math.cos(tilt) * dist + shakeZ);
      cam.lookAt(this.camX + shakeX, 0, this.camZ + shakeZ - 1);
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.kick = Math.max(0, this.kick - dt * (4 + this.kick * 10));
    cam.updateMatrixWorld();
    const el = cam.matrixWorld.elements;
    const basis = this.B;
    basis.rx = el[0];
    basis.ry = el[1];
    basis.rz = el[2];
    basis.ux = el[4];
    basis.uy = el[5];
    basis.uz = el[6];
    basis.fx = el[8];
    basis.fy = el[9];
    basis.fz = el[10];

    let want = null;
    if (menu && ui.screen === "home") {
      if (dirty) {
        homeViewSpot = measureHomeViewSpot();
        dirty = false;
      }
      want = homeViewSpot;
    }
    const key = want ? `${Math.round(want.x)},${Math.round(want.y)},${this.w},${this.h}` : "";
    if (key === (this._rlViewKey || "")) return;
    this._rlViewKey = key;
    if (want) cam.setViewOffset(this.w, this.h, this.w / 2 - want.x, this.h / 2 - want.y, this.w, this.h);
    else cam.clearViewOffset();
  }

  frame(dt, world, opts = {}) {
    this.abilityView.useWorld(opts.menu ? null : world);
    const wantAurora =
      !opts.menu && world && world.event === "aurora" && world.state === "fight" && world.arena?.biome?.id === "shelf"
        ? 1
        : 0;
    this.rlAuroraK = clamp((this.rlAuroraK || 0) + (wantAurora ? 0.8 : -0.6) * (dt || 0), 0, 1);

    const warm =
      !opts.menu &&
      world &&
      world.state === "fight" &&
      ((world.event === "festival" && world.arena?.biome?.id === "courtyard") ||
        (world.event === "forgewind" && world.arena?.biome?.id === "caldera"));
    this.rlWarmK = clamp((this.rlWarmK || 0) + (warm ? 0.65 : -0.8) * (dt || 0), 0, 1);
    this.arena.uniforms.uDark.value = 0;

    if ((this.rlAuroraK > 0.02 || this.rlWarmK > 0.02) && world?.arena && dt > 0 && dt < 0.25) {
      const isAurora = this.rlAuroraK >= this.rlWarmK;
      const density = Math.min(1, this.maxParticles / 1400) * (isAurora ? this.rlAuroraK : this.rlWarmK);
      const amount = (isAurora ? 38 : 28) * dt * density;
      const count = Math.floor(amount) + (Math.random() < amount - Math.floor(amount) ? 1 : 0);
      const W = world.arena.W,
        H = world.arena.H;
      for (let j = 0; j < count; j++) {
        this.emit(
          clamp(this.camX + (Math.random() * 2 - 1) * 18, -W - 2, W + 2),
          isAurora ? 0.8 + Math.random() * 4.5 : 0.4 + Math.random() * 2.5,
          clamp(this.camZ + (Math.random() * 2 - 1) * 14 - 2, -H - 2, H + 2),
          isAurora ? 3.8 + Math.random() * 2.4 : (Math.random() - 0.5) * 1.1,
          isAurora ? -0.6 - Math.random() * 0.5 : 1.1 + Math.random() * 0.9,
          isAurora ? 0.6 + Math.random() * 0.8 : (Math.random() - 0.5) * 1.1,
          2.0,
          0.24 + Math.random() * 0.12,
          isAurora ? RL_AURORA_SPARK : RL_FESTIVAL_EMBER,
          { drag: 0.4, spark: true },
        );
      }
    }

    try {
      if (!opts.menu) rlSkinParticles(this, dt, world);
    } catch (err) {
      if (!this.rlSkinErr) {
        logError("skin", err);
        this.rlSkinErr = true;
      }
    }
    try {
      rlAmbient(this, dt, world, opts);
    } catch (err) {
      if (!this.rlAmbErr) {
        logError("ambient", err);
        this.rlAmbErr = true;
      }
    }

    this.time += dt;
    this.scene.time = this.time;
    if (this.w <= 1 || this._needsResize) this.resize();
    const menu = !world || opts.menu;
    this.worldT = menu ? this.time : world.time;

    if (menu) {
      this.setBiome(opts.biome || biomeList[0]);
      this.ensurePlayer(opts.weapon || "pulse", true);
    } else {
      this.setBiome(world.arena.biome, world.arena);
      this.ensurePlayer(world.weapon, false);
    }
    this.updateCamera(dt, world, menu);
    this.pulse = Math.max(0, (this.pulse || 0) - dt * 1.5);
    const px = menu ? 0 : world.player.x,
      pz = menu ? 0 : world.player.y;
    this.arena.update(dt, px, pz, this.pulse);

    const pools = this.allPools();
    for (const pool of pools) pool.begin();
    for (const pool of this.trapView.list) pool.begin();
    for (const pool of this.hazardView.list) pool.begin();
    for (const pool of this.biomePropsView.list) pool.begin();
    for (const pool of this.attackView.list) pool.begin();
    for (const pool of this.weaponView.list) pool.begin();
    for (const pool of this.abilityView.list) pool.begin();
    for (const pool of this.bossCardView.list) pool.begin();
    for (const type in this.enemyPools) {
      this.enemyPools[type].body.begin();
      this.enemyPools[type].glow.begin();
    }
    for (const pool of this._attachPools) pool.begin();

    if (menu) {
      this.drawMenuPlayer(dt);
    } else {
      this.drawWorld(dt, world);
      this.abilityView.draw(dt, world);
    }
    this.updateLights(dt, menu ? null : world);
    this.drawDebris(dt);
    this.drawParticles(dt);
    this.drawTransient(dt);

    for (const pool of this.bossCardView.list) pool.end();
    for (const pool of this.attackView.list) pool.end();
    for (const pool of this.weaponView.list) pool.end();
    for (const pool of this.abilityView.list) pool.end();
    for (const pool of this.hazardView.list) pool.end();
    for (const pool of this.biomePropsView.list) pool.end();
    for (const pool of this.trapView.list) pool.end();
    for (const pool of pools) pool.end();
    for (const type in this.enemyPools) {
      this.enemyPools[type].body.end();
      this.enemyPools[type].glow.end();
    }
    for (const pool of this._attachPools) pool.end();

    for (const num of this.nums) {
      num.life -= dt;
      num.y += dt * 1.6;
    }
    if (this.nums.length && this.nums[0].life <= 0) {
      let w = 0;
      for (let i = 0; i < this.nums.length; i++) if (this.nums[i].life > 0) this.nums[w++] = this.nums[i];
      this.nums.length = w;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.engine.flash = this.flashT;
    this.renderer.render(this.scene, this.camera);
  }

  drawMenuPlayer(dt) {
    const drone = this.player;
    drone.group.visible = true;
    drone.group.position.set(0, 0.085 + drone.setWalk(0, 0, 0, this.time), 0);
    drone.shield.visible = false;
    drone.base.rotation.set(0, this.time * 0.32, 0);
    drone.aimAt(-Math.sin(this.time * 0.7) * 1.2, dt);
    drone.updateExpression?.(this.time, dt, false, false, 0);
    this.corpses.length = 0;
    for (const mat of drone.mats) mat.emissive.setScalar(0);
    this.shadows.y(0, 0.025, 0, 0, 2.2);
    this.ringPool.colC(
      this.ringPool.y(0, 0.04, 0, this.time * 0.5, 1.45),
      hexColor(weaponDefs[this.playerWeapon].color),
      0.55,
    );
    this.sprites.colC(this.sprites.bb(0, 0.25, 0, 2.4, this.B), hexColor(weaponDefs[this.playerWeapon].color), 0.42);
    if (Math.random() < dt * 26) {
      const angle = Math.random() * TAU,
        dist = 3 + Math.random() * 14;
      this.emit(
        Math.cos(angle) * dist,
        0.1,
        Math.sin(angle) * dist,
        0,
        0.6 + Math.random(),
        0,
        2.5,
        0.25,
        hexColor(this.biome.grid),
        { drag: 0 },
      );
    }
    if (this.heroLocator) this.heroLocator.root.visible = false;
    if (this.bossView) this.bossView.group.visible = false;
  }

  drawWorld(dt, world) {
    const basis = this.B;
    const time = this.time;
    const player = world.player;
    const drone = this.player;
    drone.group.visible = player.alive;
    if (this.heroLocator) {
      this.heroLocator.root.visible = player.alive;
      if (player.alive) {
        this.heroLocator.root.position.set(player.x, 0.044, player.y);
        this.heroLocator.compass.rotation.y = -player.aim;
        this.heroLocator.accentMat.color.setHex(weaponDefs[world.weapon].color);
      }
    }
    if (player.alive) {
      drone.base.rotation.y = -player.face;
      const speed = Math.hypot(player.vx, player.vy);
      const moving = world.state === "fight" || world.state === "cleared";
      const amount = moving ? clamp(speed / Math.max(2, world.stats.speed * 0.55), 0, 1) : 0;
      const jump = player.dashT > 0 ? Math.sin(Math.PI * clamp(1 - player.dashT / DASH_TIME, 0, 1)) : 0;
      const turn = angleDiff(drone.faceLast === undefined ? player.face : drone.faceLast, player.face);
      const k = dampFactor(10, dt);
      drone.faceLast = player.face;
      drone.lean += ((player.dashT > 0 ? 0.22 : amount * 0.1) - drone.lean) * k;
      drone.bank += (clamp((turn * 0.08) / Math.max(dt, 0.008), -0.4, 0.4) - drone.bank) * k;
      drone.base.rotation.z = -drone.lean;
      drone.base.rotation.x = drone.bank;
      const body = drone.setWalk((player.stride / STEP_LEN) * Math.PI, amount, jump, time);
      drone.group.position.set(player.x, body + jump * 0.6, player.y);
      drone.aimAt(player.aim, dt);
      drone.updateExpression?.(time, dt, !!player.firing, player.dashT > 0, clamp(player.hurtT / 0.3, 0, 1));

      const shieldHit = Math.max(0, 1 - (time - this.abilityView.shieldHitAt) / 0.28);
      const barrierUp = world.barrierT > 0;
      drone.shield.visible = player.shield || barrierUp || shieldHit > 0;
      const su = drone.shield.material.uniforms;
      su.uTime.value = time;
      su.uHit.value = shieldHit;
      su.uFade.value = player.shield || barrierUp ? 1 : shieldHit;
      su.uColor.value.setHex(barrierUp ? 0xffc84a : weaponDefs[world.weapon].color);

      const protectedHull =
        player.iT > 0 && player.hurtT <= 0 && player.dashT <= 0 && world.waveT > 1.05 && world.state === "fight";
      const hurt = clamp(player.hurtT / 0.3, 0, 1);
      for (const mat of drone.mats) {
        mat.emissive.setRGB(
          hurt * 0.55 + (protectedHull ? 0.1 : 0),
          hurt * 0.12 + (protectedHull ? 0.08 : 0),
          hurt * 0.05,
        );
      }
      if (protectedHull) {
        this.ringPool.colC(this.ringPool.y(player.x, 0.052, player.y, player.face, 1.04), hexColor(FINISH.brass), 0.55);
      }
      this.shadows.y(player.x, 0.025, player.y, 0, 1.9);
      if (player.manual) {
        const reach = world.arena.rayLen(player.x, player.y, player.aim, Math.min(world.stats.range, 16));
        const dx = Math.cos(player.aim),
          dz = Math.sin(player.aim);
        for (let along = 1.0; along < reach; along += 1.2) {
          const end = Math.min(reach, along + 0.48);
          this.beams.colC(
            this.beams.seg(
              player.x + dx * along,
              player.y + dz * along,
              player.x + dx * end,
              player.y + dz * end,
              0.083,
              0.055,
              0.022,
            ),
            hexColor(FINISH.ivory),
            0.4,
          );
        }
      }
      this.sprites.colC(
        this.sprites.bb(player.x, 0.22, player.y, 1.9, basis),
        hexColor(weaponDefs[world.weapon].color),
        0.2,
      );
      if (player.dashT > 0 && dt > 0) {
        this.engine.stampWake(player.x, player.y, 1.05, Math.min(1, dt * 18), 0.72, 0.65, 0.95, 0.42);
        if (Math.random() < dt * 65) {
          this.emit(
            player.x,
            0.29,
            player.y,
            -player.vx * 0.18,
            0.23,
            -player.vy * 0.18,
            0.32,
            0.15,
            hexColor(FINISH.brass),
            { spark: true, drag: 3, grav: 1.7 },
          );
        }
      }
      const count = world.stats.orbit;
      for (let i = 0; i < count; i++) {
        const angle = world.time * 3.3 + (i * TAU) / count;
        const bx = player.x + Math.cos(angle) * world.stats.orbitR;
        const bz = player.y + Math.sin(angle) * world.stats.orbitR;
        this.blades.colHex(this.blades.y(bx, 0, bz, angle + Math.PI / 2, 1.2 * world.stats.bladeScale), FINISH.brass);
        this.sprites.colHex(this.sprites.bb(bx, 0.62, bz, 0.78, basis), FINISH.copper, 0.28);
      }
      for (const wing of player.wings) {
        this.wing.y(wing.x, Math.sin(time * 4 + wing.x) * 0.1, wing.y, player.aim, 1.3);
        this.sprites.colHex(this.sprites.bb(wing.x, 0.9, wing.y, 1.05, basis), weaponDefs[world.weapon].color, 0.55);
        this.shadows.y(wing.x, 0.025, wing.y, 0, 0.9);
      }
    }

    if (world.arena?.devils && dt > 0) {
      for (const dv of world.arena.devils) {
        if (dv.calmT > 0) continue;
        this.engine.stampWake(dv.x, dv.y, (dv.r || 1.8) * 0.85, Math.min(1, dt * 10), 0.55, 0.45, 0.85, 0.18);
      }
    }

    let boss = null;
    for (const enemy of world.enemies) {
      if (enemy.boss) {
        boss = enemy;
        continue;
      }
      const pools = this.enemyPools[enemy.type];
      if (!pools) continue;
      const grow = enemy.spawnT > 0 ? 1 - enemy.spawnT / 0.35 : 1;
      let scale = (enemy.r / enemyDefs[enemy.type].r) * easeOutBack(clamp(grow, 0, 1));
      let scaleY = scale;
      let lift = 0;
      let angle = enemy.face;
      let pitch = 0;
      let roll = 0;
      if (enemy.type === "bomber" && enemy.st === 1) {
        const pulse = 1.05 + Math.sin(time * 7) * 0.04;
        scale *= pulse;
        scaleY *= pulse;
      }
      if (enemy.type === "brute" && enemy.st === 1) scaleY *= 0.9;
      if (enemy.type === "mortar" && enemy.st === 1) scaleY *= 0.88;
      if (enemy.type === "striker" && enemy.st === 1) {
        scale *= 0.96;
        scaleY *= 0.89;
      }
      const motion = RL_MOTION[enemy.type] || RL_MOTION_NONE;
      const speed = Math.hypot(enemy.vx || 0, enemy.vy || 0);
      const move = speed > 0.4 ? Math.min(1, speed / motion.ref) : 0;
      const gait = time * (4 + speed * motion.f) + enemy.phase;
      const breath = Math.sin(time * motion.bf + enemy.phase) * motion.breath;
      roll = Math.sin(gait) * motion.roll * move;
      pitch = -motion.lean * move;
      lift = Math.abs(Math.sin(gait)) * motion.bounce * move + Math.sin(time * motion.hf + enemy.phase) * motion.hover;
      scaleY *= 1 + breath;
      scale *= 1 - breath * 0.5;
      if (grow < 1) {
        lift += Math.sin(clamp(grow, 0, 1) * Math.PI) * 0.35 * scale;
        angle += (1 - clamp(grow, 0, 1)) * 2.4;
      }
      if (enemy.flash > 0) {
        scale *= 1 + enemy.flash * 0.16;
        scaleY *= 1 - enemy.flash * 0.2;
      }
      if (enemy.type === "phantom" && enemy.ghost) {
        scale *= 0.86;
        scaleY *= 1.12;
      }

      if (
        dt > 0 &&
        motion.hover === 0 &&
        (speed > 3.2 || ((enemy.type === "charger" || enemy.type === "driller") && enemy.st >= 1))
      ) {
        const heavy = enemy.type === "charger" || enemy.type === "driller" || enemy.type === "brute";
        if (heavy || Math.random() < dt * 7) {
          this.engine.stampWake(
            enemy.x,
            enemy.y,
            enemy.r * (heavy ? 1.15 : 0.78),
            heavy ? Math.min(0.85, dt * 14) : 0.42,
            heavy ? 0.72 : 0.45,
            0.4,
            heavy ? 0.75 : 0.35,
            0.2,
          );
        }
      }

      const gaitWrap = ((gait % TAU) + TAU) % TAU;
      const packedAnim = Math.round(gaitWrap * 1000) + Math.min(0.99, move * 0.99);
      const actionK = enemy.st >= 1 ? 1 : enemy.flash > 0 ? enemy.flash * 0.6 : 0;
      const flashK = enemy.flash > 0 ? enemy.flash : enemy.slowT > 0 ? 0.25 : 0;

      const tint = enemy.variant ? variantColors[enemy.variant] : null;
      if (enemy.variant === "shorted" && Math.random() < dt * 5) {
        this.emit(
          enemy.x + (Math.random() - 0.5) * enemy.r * 1.6,
          0.4 + Math.random() * 0.8,
          enemy.y + (Math.random() - 0.5) * enemy.r * 1.6,
          (Math.random() - 0.5) * 3,
          2,
          (Math.random() - 0.5) * 3,
          0.18,
          0.13,
          Math.random() < 0.5 ? whiteColor : tint,
          { spark: true, drag: 2 },
        );
      }

      let br = 1,
        bg = 1,
        bb = 1;
      if (enemy.type === "phantom" && enemy.ghost) {
        br = 0.48;
        bg = 0.38;
        bb = 0.95;
      } else if (enemy.healFlash > 0) {
        br = 0.75;
        bg = 1.35;
        bb = 0.95;
      } else if (enemy.slowT > 0) {
        br = 0.7;
        bg = 0.92;
        bb = 1.32;
      } else if (enemy.corrode) {
        br = 0.85;
        bg = 1.3;
        bb = 0.62;
      } else if (tint) {
        br = 0.55 + tint.r * 0.7;
        bg = 0.55 + tint.g * 0.7;
        bb = 0.55 + tint.b * 0.7;
      } else if (enemy.elite) {
        br = 1.25;
        bg = 1.06;
        bb = 0.72;
      } else {
        const dress = BIOME_ENEMY_DRESS[world.arena?.biome?.id];
        if (dress) {
          br = dress[0];
          bg = dress[1];
          bb = dress[2];
        }
      }
      pools.body.push(
        enemy.x,
        lift,
        enemy.y,
        scale,
        scaleY,
        angle,
        pitch,
        roll,
        packedAnim,
        br,
        bg,
        bb,
        flashK,
        actionK,
      );

      let glowK = 1.05;
      if (
        (["gunner", "sniper", "charger", "driller", "weaver", "sentinel"].includes(enemy.type) && enemy.st === 1) ||
        enemy.sunT > 0
      ) {
        glowK = 1.4 + Math.sin(time * 6) * 0.2;
      }
      if (enemy.type === "bomber" && enemy.st === 1) glowK = 2.1;
      if (enemy.type === "phantom" && enemy.ghost) {
        glowK = 0.3 + Math.sin(time * 3) * 0.08;
        if (Math.random() < dt * 18) this.emit(enemy.x, 0.65, enemy.y, 0, 0.6, 0, 0.28, 0.24, pools.color, { drag: 2 });
      }
      if (enemy.sunT > 0 && Math.random() < dt * 24) {
        this.emit(
          enemy.x,
          0.55,
          enemy.y,
          -enemy.vx * 0.15,
          0.5,
          -enemy.vy * 0.15,
          0.25,
          0.26,
          variantColors.sunstruck,
          { spark: true, drag: 2 },
        );
      }
      const gCol = enemy.sunT > 0 ? variantColors.sunstruck : tint || (enemy.elite ? goldColor : pools.color);
      pools.glow.push(
        enemy.x,
        lift,
        enemy.y,
        scale,
        scaleY,
        angle,
        pitch,
        roll,
        packedAnim,
        gCol.r * glowK,
        gCol.g * glowK,
        gCol.b * glowK,
        0,
        actionK,
      );

      // Visible 3D Biome-Variant & Elite Affix sculpted gear (zero CPU bone matrices!)
      const gearScale = Math.max(0.55, enemy.r * 1.15) * scale;
      const gearScaleY = gearScale * (scaleY / Math.max(1e-4, scale));
      if (enemy.variant && this.variantPools[enemy.variant]) {
        const vp = this.variantPools[enemy.variant];
        vp.body.push(
          enemy.x,
          lift,
          enemy.y,
          gearScale,
          gearScaleY,
          angle,
          pitch,
          roll,
          packedAnim,
          1,
          1,
          1,
          flashK,
          actionK,
        );
        vp.glow.push(
          enemy.x,
          lift,
          enemy.y,
          gearScale,
          gearScaleY,
          angle,
          pitch,
          roll,
          packedAnim,
          glowK,
          glowK,
          glowK,
          0,
          actionK,
        );
      }
      if (enemy.affix && this.affixPools[enemy.affix] && (enemy.affix !== "shielded" || enemy.shield > 0)) {
        const ap = this.affixPools[enemy.affix];
        ap.body.push(
          enemy.x,
          lift,
          enemy.y,
          gearScale,
          gearScaleY,
          angle,
          pitch,
          roll,
          packedAnim,
          1,
          1,
          1,
          flashK,
          actionK,
        );
        ap.glow.push(
          enemy.x,
          lift,
          enemy.y,
          gearScale,
          gearScaleY,
          angle,
          pitch,
          roll,
          packedAnim,
          glowK,
          glowK,
          glowK,
          0,
          actionK,
        );
      }

      if (enemy.champion) {
        this.ringPool.colC(
          this.ringPool.y(enemy.x, 0.06, enemy.y, time * 1.5, 7),
          goldColor,
          0.2 + Math.sin(time * 4) * 0.06,
        );
        this.ringPool.colC(this.ringPool.y(enemy.x, 1.6 + enemy.r, enemy.y, -time * 3, enemy.r * 0.8), goldColor, 1);
      }
      if (enemy.rallyT > 0 && !enemy.champion && Math.random() < dt * 6)
        this.emit(enemy.x, 0.3, enemy.y, 0, 1.5, 0, 0.35, 0.3, goldColor, { drag: 1 });
      if (tint && Math.random() < dt * 8)
        this.emit(
          enemy.x + (Math.random() - 0.5) * enemy.r * 1.15,
          0.42 + Math.random() * 0.4,
          enemy.y + (Math.random() - 0.5) * enemy.r * 1.15,
          (Math.random() - 0.5) * 0.6,
          1.15,
          (Math.random() - 0.5) * 0.6,
          0.42,
          0.22,
          tint,
          { spark: enemy.variant !== "bloomed", drag: 1.4 },
        );

      this.shadows.y(enemy.x, 0.022, enemy.y, 0, enemy.r * 2.8 * scale);
      this.sprites.colC(
        this.sprites.bb(enemy.x, 0.35, enemy.y, enemy.r * (enemy.elite ? 3.8 : 2.8) * scale, basis),
        enemy.elite ? goldColor : pools.color,
        enemy.elite ? 0.15 : 0.055,
      );
      if (enemy.burnT > 0 && Math.random() < dt * 14)
        this.emit(
          enemy.x + (Math.random() - 0.5) * enemy.r,
          0.6,
          enemy.y + (Math.random() - 0.5) * enemy.r,
          0,
          1.8,
          0,
          0.35,
          0.35,
          hexColor(0xff7232),
          { drag: 1 },
        );

      if (enemy.type === "sniper" && enemy.st === 1)
        this.aimLine(world, enemy.x, enemy.y, enemy.ta, enemy.t2 < 0.35, 1 - enemy.t2 / 1.25);
      if (enemy.type === "brute" && enemy.st === 1)
        this.chargeLine(enemy.x, enemy.y, enemy.ta, 9.5, 1.7, 1 - enemy.t2 / 0.8);
      if (enemy.type === "leaper" && enemy.st === 1)
        this.chargeLine(enemy.x, enemy.y, enemy.ta, 7.5, 1.35, 1 - enemy.t2 / 0.55);
      if (enemy.type === "bomber" && enemy.st === 1) {
        const k = 1 - enemy.t2 / 0.55;
        this.ringPool.colC(this.ringPool.y(enemy.x, 0.05, enemy.y, 0, 2.6), warnColor, 0.9);
        this.discs.colC(this.discs.y(enemy.x, 0.04, enemy.y, 0, 2.6 * k), warnColor, 0.28);
      }
      if (enemy.type === "gunner" && enemy.st === 1) {
        this.sprites.colC(
          this.sprites.bb(
            enemy.x + Math.cos(enemy.face) * 0.95,
            0.62,
            enemy.y + Math.sin(enemy.face) * 0.95,
            0.5 + (1 - enemy.t2 / 0.45) * 0.9,
            basis,
          ),
          pools.color,
          1,
        );
      }
      if (enemy.type === "turret" && enemy.st === 1)
        this.aimLine(world, enemy.x, enemy.y, enemy.ta, enemy.t2 < 0.22, 1 - enemy.t2 / 0.62);
      if (enemy.type === "charger" && enemy.st === 1)
        this.chargeLine(enemy.x, enemy.y, enemy.ta, 9.5, 1.35, 1 - enemy.t2 / 0.48);
      if (enemy.type === "driller" && enemy.st === 1)
        this.chargeLine(enemy.x, enemy.y, enemy.ta, 9.5, 1.6, 1 - enemy.t2 / 0.58);
      if (enemy.type === "weaver" && enemy.st === 1) {
        this.aimLine(
          world,
          enemy.x,
          enemy.y,
          Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x),
          enemy.t2 < 0.16,
          1 - enemy.t2 / 0.45,
        );
      }
      if (enemy.type === "bulwark") {
        if (enemy.guardDown <= 0) {
          const alpha =
            0.4 +
            0.35 * clamp(enemy.guard / enemy.guardMax, 0, 1) +
            (enemy.guardFlash > 0 ? enemy.guardFlash * 0.6 : 0);
          const sc = ((enemy.r + 0.5) / 1.35) * scale;
          this.shieldPool.colC(this.shieldPool.y(enemy.x, 0, enemy.y, enemy.face, sc, scale, sc), pools.color, alpha);
        } else if (Math.random() < dt * 20) {
          this.emit(
            enemy.x,
            1.2,
            enemy.y,
            (Math.random() - 0.5) * 3,
            1,
            (Math.random() - 0.5) * 3,
            0.3,
            0.25,
            pools.color,
            { spark: true },
          );
        }
      }
      if (enemy.type === "striker" && enemy.st === 1) {
        const k = 1 - enemy.t2 / 0.7;
        this.ringPool.colC(
          this.ringPool.y(enemy.tx, 0.05, enemy.ty, time * 4, 1.4 - k * 0.6),
          pools.color,
          0.65 + k * 0.6,
        );
        this.discs.colC(this.discs.y(enemy.tx, 0.04, enemy.ty, 0, 0.9 * k), pools.color, 0.28);
      }
      if (enemy.type === "striker" && enemy.st === 2)
        this.chargeLine(enemy.x, enemy.y, enemy.ta, 4.2, 1, 1 - enemy.t2 / 0.32);
      if (enemy.affix) {
        const color = hexColor(eliteAffixes[enemy.affix].color);
        if (enemy.affix === "shielded" && enemy.shield > 0) {
          this.ringPool.colC(
            this.ringPool.y(enemy.x, 0.9, enemy.y, time, enemy.r * 1.7 * scale),
            color,
            0.4 + 0.4 * (enemy.shield / enemy.shieldMax),
          );
          this.sprites.colC(this.sprites.bb(enemy.x, 0.8, enemy.y, enemy.r * 4.2 * scale, basis), color, 0.22);
        } else if (enemy.affix === "hasted" && Math.random() < dt * 25) {
          this.emit(enemy.x, 0.5, enemy.y, -enemy.vx * 0.2, 0.2, -enemy.vy * 0.2, 0.3, enemy.r * 1.4, color, {
            drag: 2,
          });
        } else if (enemy.affix === "volatile") {
          this.ringPool.colC(
            this.ringPool.y(enemy.x, 0.06, enemy.y, 0, enemy.r * 1.9),
            color,
            0.38 + Math.sin(time * 9 + enemy.phase) * 0.25,
          );
        }
      }
    }

    // Dying corpses pop/spin/dissolve cleanly
    if (this.corpses.length) {
      const list = this.corpses;
      let keep = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        c.t += dt;
        const k = c.t / 0.3;
        if (k >= 1) continue;
        list[keep++] = c;
        const pools = this.enemyPools[c.type];
        const shrink = (1 - k) * (1 - k);
        const size = c.r * (1 + k * 0.25) * shrink + 0.001;
        const hop = Math.sin(k * Math.PI) * 0.5;
        const yaw = c.a + c.spin * c.t;
        pools.body.push(
          c.x,
          hop,
          c.z,
          size,
          size * (1 - k * 0.3),
          yaw,
          k * 0.9,
          0,
          0,
          c.elite ? 1.25 : 1,
          c.elite ? 1.05 : 1,
          c.elite ? 0.7 : 1,
          1 - k * 0.6,
          0,
        );
        const gCol = c.elite ? goldColor : pools.color;
        const gm = 1 + (1 - k) * 1.5;
        pools.glow.push(c.x, hop, c.z, size, size, yaw, k * 0.9, 0, 0, gCol.r * gm, gCol.g * gm, gCol.b * gm, 0, 0);
      }
      list.length = keep;
    }

    this.drawBoss(dt, world, boss);
    this.weaponView.draw(dt, world);
    for (const trail of world.trails) {
      this.sprites.colHex(
        this.sprites.bb(trail.x, 0.3, trail.y, 1.3 * Math.min(1, trail.life), basis),
        0x7ef2ff,
        0.38 * Math.min(1, trail.life),
      );
    }
    this.attackView.shots(world, dt);

    for (const pickup of world.pickups) {
      let lift = 0.45 + Math.sin(time * 4 + pickup.id) * 0.12;
      if (pickup.rain && pickup.t < 0.6) {
        lift += (0.6 - pickup.t) * 16;
        if (Math.random() < 0.5)
          this.emit(pickup.x, lift + 0.4, pickup.y, 0, 2, 0, 0.25, 0.3, shardColors[1], { drag: 1 });
      }
      if (pickup.rain && pickup.t >= 0.6 && !pickup.landed) {
        pickup.landed = true;
        this.ring(pickup.x, pickup.y, 0.2, 1.1, shardColors[1], 0.3);
      }
      if (pickup.kind === "shard") {
        const color = shardColors[pickup.v] || shardColors[1];
        const scale = pickup.v >= 25 ? 1.8 : pickup.v >= 5 ? 1.35 : 1;
        this.shardPool.colC(this.shardPool.y(pickup.x, lift, pickup.y, time * 3 + pickup.id, scale), color, 1);
        this.sprites.colC(this.sprites.bb(pickup.x, lift, pickup.y, 1.05 * scale, basis), color, 0.58);
        if (pickup.v >= 5) {
          this.ringPool.colC(
            this.ringPool.y(pickup.x, 0.045, pickup.y, -time * 1.6 + pickup.id, 0.42 * scale),
            color,
            0.34,
          );
          if (Math.random() < dt * 5)
            this.emit(pickup.x, lift + 0.15, pickup.y, 0, 0.9, 0, 0.34, 0.14 * scale, color, { spark: true, drag: 2 });
        }
      } else {
        if (pickup.t > 11 && !pickup.pull && Math.floor(time * (pickup.t > 13 ? 12 : 6)) % 2) continue;
        this.healPool.colC(this.healPool.y(pickup.x, lift + 0.2, pickup.y, time * 2, 1), healColor, 1);
        this.ringPool.colC(
          this.ringPool.y(pickup.x, 0.045, pickup.y, time * 1.5, 0.62 + Math.sin(time * 4) * 0.06),
          healColor,
          0.38,
        );
        this.sprites.colC(
          this.sprites.bb(pickup.x, lift + 0.2, pickup.y, 1.75, basis),
          healColor,
          0.6 + Math.sin(time * 6) * 0.15,
        );
        if (Math.random() < dt * 6)
          this.emit(
            pickup.x + (Math.random() - 0.5) * 0.35,
            lift + 0.25,
            pickup.y + (Math.random() - 0.5) * 0.35,
            0,
            1.1,
            0,
            0.38,
            0.16,
            healColor,
            { spark: true, drag: 2 },
          );
      }
    }

    try {
      this.bossCardView.update(dt, world);
    } catch (err) {
      if (!this.rlBossCardErr) {
        logError("boss cards", err);
        this.rlBossCardErr = true;
      }
    }
    try {
      this.trapView.update(dt, world);
    } catch (err) {
      if (!this.rlTrapErr) {
        logError("traps", err);
        this.rlTrapErr = true;
      }
    }
    try {
      this.hazardView.update(dt, world);
    } catch (err) {
      if (!this.rlHazardErr) {
        logError("hazards", err);
        this.rlHazardErr = true;
      }
    }
    try {
      this.biomePropsView.draw(dt, world);
    } catch (err) {
      if (!this.rlBiomePropErr) {
        logError("biomeProps", err);
        this.rlBiomePropErr = true;
      }
    }

    for (const marker of world.markers) {
      const k = clamp(marker.t / marker.dur, 0, 1);
      const color = marker.fake
        ? hexColor(0x8fe8ff)
        : marker.elite
          ? goldColor
          : hexColor(enemyDefs[marker.type] ? enemyDefs[marker.type].color : 0xffffff);
      const size = marker.fake ? 2.2 : 1.2 - k * 0.5;
      const biomePortal = BIOME_PORTAL_ACCENT[world.arena?.biome?.id] || color;
      this.ringPool.colC(this.ringPool.y(marker.x, 0.05, marker.y, time * 2, size), color, 0.55 + k * 0.6);
      if (!marker.fake && !marker.boss) {
        this.ringPool.colC(
          this.ringPool.y(marker.x, 0.046, marker.y, -time * 1.5, size * 1.18),
          biomePortal,
          0.26 + k * 0.28,
        );
      }
      const call = marker.boss && BOSS_PORTAL[marker.boss];
      const rim = call?.[0] ?? color;
      const inlay = call?.[1] ?? whiteColor;
      if (call) {
        this.ringPool.colC(this.ringPool.y(marker.x, 0.058, marker.y, -time * 1.4, size * 1.37), rim, 0.6 + k * 0.25);
        for (let j = 0; j < 4; j++) {
          const a = (j * TAU) / 4 + time * 1.2;
          const span = size * (0.95 + k * 0.25);
          this.shardPool.colC(
            this.shardPool.yr(
              marker.x + Math.cos(a) * span,
              0.14 + k * 0.7,
              marker.y + Math.sin(a) * span,
              a,
              0.54,
              0.69,
              0.54,
              0,
              0.24,
            ),
            inlay,
            0.68 + k * 0.35,
          );
        }
      }
      this.discs.colC(this.discs.y(marker.x, 0.041, marker.y, 0, size * 0.92), rim, 0.14 + k * 0.24);
      if (!marker.fake) {
        this.shardPool.colC(
          this.shardPool.yr(marker.x, 0.27 + k * 0.64, marker.y, time * 0.9, 0.86, 0.55 + k * 0.75, 0.86, 0, 0.26),
          inlay,
          0.68 + k * 0.35,
        );
      }
    }

    try {
      this.attackView.update(dt, world);
    } catch (err) {
      if (!this.rlAttackErr) {
        logError("attacks", err);
        this.rlAttackErr = true;
      }
    }

    for (const beam of world.beams) {
      const len = beam.cur;
      if (len <= 0) continue;
      const ex = beam.x + Math.cos(beam.a) * len;
      const ez = beam.y + Math.sin(beam.a) * len;
      if (beam.live && beam.skin && this.trapView.drawBeam(beam, ex, ez, len, time, dt)) continue;
      if (beam.live) {
        const beamCol = beam.color ? hexColor(beam.color) : beamColor;
        this.warningEdges.colC(
          this.warningEdges.seg(beam.x, beam.y, ex, ez, 0.7, beam.w * 1.06, beam.w * 0.16),
          warningDark,
          0.62,
        );
        this.beams.colC(this.beams.seg(beam.x, beam.y, ex, ez, 0.72, beam.w * 0.88, beam.w * 0.18), beamCol, 0.58);
        this.beams.colC(this.beams.seg(beam.x, beam.y, ex, ez, 0.75, beam.w * 0.18, beam.w * 0.11), whiteColor, 0.68);
        if (Math.random() < dt * 14) {
          const along = Math.random() * len;
          this.emit(
            beam.x + Math.cos(beam.a) * along,
            1,
            beam.y + Math.sin(beam.a) * along,
            (Math.random() - 0.5) * 4,
            2,
            (Math.random() - 0.5) * 4,
            0.3,
            0.32,
            beam.color ? beamCol : hexColor(0xff5268),
          );
        }
      } else {
        const progress = clamp(beam.t / beam.warn, 0, 1);
        const halfWidth = beam.w * 0.5;
        const dx = -Math.sin(beam.a) * halfWidth;
        const dz = Math.cos(beam.a) * halfWidth;
        for (let side = -1; side <= 1; side += 2) {
          const x = side * dx,
            z = side * dz;
          this.warningEdges.colC(
            this.warningEdges.seg(beam.x + x, beam.y + z, ex + x, ez + z, 0.1, 0.2, 0.04),
            warningDark,
            0.92,
          );
          this.beams.colC(
            this.beams.seg(beam.x + x, beam.y + z, ex + x, ez + z, 0.125, 0.095, 0.04),
            warnColor,
            0.78 + progress * 0.22,
          );
        }
        this.beams.colC(this.beams.seg(beam.x, beam.y, ex, ez, 0.08, beam.w, 0.02), warnColor, 0.14 + progress * 0.2);
      }
    }
  }

  aimLine(world, x, z, angle, locked, k) {
    const dist = world.arena.rayLen(x, z, angle, 32);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const from = Math.min(0.6, dist);
    const ex = x + cos * dist,
      ez = z + sin * dist;
    if (dist <= from) return;
    this.warningEdges.colC(
      this.warningEdges.seg(x + cos * from, z + sin * from, ex, ez, 0.95, locked ? 0.22 : 0.15, 0.04),
      warningDark,
      0.94,
    );
    this.beams.colC(
      this.beams.seg(x + cos * from, z + sin * from, ex, ez, 0.98, locked ? 0.095 : 0.055, 0.04),
      warnColor,
      locked ? 1.1 : 0.5 + clamp(k, 0, 1) * 0.4,
    );
    this.beams.colC(
      this.beams.seg(x + cos * from, z + sin * from, ex, ez, 0.07, locked ? 0.16 : 0.085, 0.02),
      warnColor,
      locked ? 0.65 : 0.28,
    );
  }

  chargeLine(x, z, angle, len, width, k) {
    k = clamp(k, 0, 1);
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const ex = x + cos * len,
      ez = z + sin * len;
    const dx = -sin * width * 0.5,
      dz = cos * width * 0.5;
    this.beams.colC(this.beams.seg(x, z, ex, ez, 0.06, width, 0.02), warnColor, 0.12 + k * 0.14);
    for (let side = -1; side <= 1; side += 2) {
      this.warningEdges.colC(
        this.warningEdges.seg(x + side * dx, z + side * dz, ex + side * dx, ez + side * dz, 0.08, 0.22, 0.025),
        warningDark,
        0.92,
      );
      this.beams.colC(
        this.beams.seg(x + side * dx, z + side * dz, ex + side * dx, ez + side * dz, 0.11, 0.08, 0.025),
        warnColor,
        0.78 + k * 0.25,
      );
      this.beams.colC(
        this.beams.seg(ex + side * dx - cos * 0.55, ez + side * dz - sin * 0.55, ex, ez, 0.12, 0.095, 0.025),
        warnColor,
        0.9,
      );
    }
    if (k > 0)
      this.beams.colC(this.beams.seg(x, z, x + cos * len * k, z + sin * len * k, 0.07, width, 0.02), warnColor, 0.22);
  }

  drawBoss(dt, world, boss) {
    if (!boss) {
      if (this.bossView) this.bossView.group.visible = false;
      return;
    }
    if (!this.bossView || this.bossView.id !== boss.type) {
      if (this.bossView) {
        this.scene.remove(this.bossView.group);
        this.bossView.group.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
      const model = buildBossModel(boss.type, bossDefs[boss.type].color);
      model.id = boss.type;
      setWorldShadows(model.group);
      this.bossView = model;
      this.scene.add(model.group);
    }
    const view = this.bossView;
    const group = view.group;
    const time = this.time;
    group.visible = true;
    let grow = boss.spawnT > 0 ? clamp(1 - boss.spawnT / 1.2, 0, 1) : 1;
    if (this.focus) grow = Math.max(grow, clamp((this.focusK - 0.15) / 0.45, 0, 1));
    const scale = easeOutBack(grow);
    const walking = boss.st === "walk";
    const rushing = boss.st === "charge" && boss.sub === 1;
    const lift =
      boss.type === "prism" || boss.type === "wyrm"
        ? (1 + Math.sin(time * 1.6)) * 0.09
        : boss.type === "queen"
          ? Math.abs(Math.sin(time * 2.2)) * 0.08
          : walking
            ? Math.abs(Math.sin(time * 6.5)) * 0.09
            : 0;
    const pitch = rushing ? -0.14 : walking ? -0.04 : 0;
    const roll =
      boss.type === "bellkeeper" || boss.type === "tyrant"
        ? Math.sin(time * (rushing ? 14 : 6.5)) * (rushing ? 0.06 : walking ? 0.035 : 0)
        : 0;
    group.position.set(boss.x, lift, boss.y);
    group.scale.setScalar(Math.max(0.01, scale));
    if (group.userData.tail) {
      for (const seg of group.userData.tail)
        seg.m.position.z = seg.z + Math.sin(time * 5.5 + seg.i * 1.15) * (0.08 + seg.i * 0.05);
    }
    group.rotation.order = "YZX";
    group.rotation.set(roll, -boss.face, pitch);
    for (const part of view.spin) {
      part.m.rotation[part.ax] += part.v * dt * (boss.enraged ? 1.8 : 1);
      if (boss.type === "core") part.m.position.y = 2.4 + Math.sin(time * 1.5) * 0.15;
    }
    view.updatePose?.(boss, time, dt);
    const flash = boss.flash;
    const identity = BOSS_EFFECTS[boss.type];
    for (const mat of view.mats) {
      mat.emissive.copy(hexColor(identity.accent)).multiplyScalar(flash * 0.25 + (boss.charging ? 0.06 : 0));
    }
    view.glowMat.color.setHex(boss.shielded ? 0xffffff : boss.enraged ? identity.accent : identity.color);
    view.glowMat.emissiveIntensity = boss.enraged ? 1.48 + Math.sin(time * 8) * 0.16 : 1.22;
    if (view.overdriveMat) {
      view.overdriveMat.color.setHex(identity.accent);
      view.overdriveMat.emissiveIntensity = 1.52 + Math.sin(time * 9) * 0.22;
    }
    const alpha = boss.ghost ? 0.14 : 1;
    const dive = boss.type === "wyrm" && boss.diveT > 0 ? 1 : 0;
    if (dive) group.scale.y *= 0.55;
    if (group.userData.fadeMats) {
      for (const mat of group.userData.fadeMats) mat.opacity = alpha * (1 - dive * 0.74) * (mat.userData.opacity ?? 1);
    }
    view.glowMat.opacity = boss.ghost ? 0.18 : 1 - dive * 0.74;
    this.shadows.y(boss.x, 0.025, boss.y, 0, boss.r * 3.4 * scale);
    this.sprites.colHex(
      this.sprites.bb(boss.x, 1.2, boss.y, boss.r * 5, this.B),
      boss.enraged ? identity.accent : identity.color,
      0.12,
    );
    if (boss.shielded) this.ringPool.colC(this.ringPool.y(boss.x, 0.1, boss.y, time, boss.r * 1.6), whiteColor, 0.85);

    if (boss.type === "prism" && !boss.ghost && Math.random() < dt * 18)
      this.emit(
        boss.x + (Math.random() - 0.5) * 2.6,
        1 + Math.random() * 2.4,
        boss.y + (Math.random() - 0.5) * 2.6,
        (Math.random() - 0.5) * 0.6,
        -0.5 - Math.random() * 0.6,
        (Math.random() - 0.5) * 0.6,
        1.1,
        0.3,
        hexColor(0xbef2ff),
        { drag: 0.5 },
      );
    if (boss.type === "wyrm" && dive && Math.random() < dt * 34)
      this.emit(
        boss.x + (Math.random() - 0.5) * 3.2,
        0.3 + Math.random() * 0.7,
        boss.y + (Math.random() - 0.5) * 3.2,
        (Math.random() - 0.5) * 2.4,
        1.2 + Math.random() * 1.8,
        (Math.random() - 0.5) * 2.4,
        0.7,
        0.3,
        hexColor(0xe0cc9e),
        { drag: 1.2, grav: -3 },
      );
    if (boss.type === "bellkeeper" && rushing && Math.random() < dt * 22) {
      const backward = boss.face + Math.PI;
      this.emit(
        boss.x + Math.cos(backward) * 1.16,
        0.21,
        boss.y + Math.sin(backward) * 1.16,
        Math.cos(backward) * 2.1,
        0.8 + Math.random(),
        Math.sin(backward) * 2.1,
        0.43,
        0.14,
        hexColor(identity.accent),
        { spark: true, drag: 2, grav: 3 },
      );
    }
    if (boss.type === "queen" && Math.random() < dt * 10)
      this.emit(
        boss.x + (Math.random() - 0.5) * 2.4,
        1.2 + Math.random() * 1.6,
        boss.y + (Math.random() - 0.5) * 2.4,
        (Math.random() - 0.5) * 0.5,
        0.4 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5,
        1.2,
        0.16,
        hexColor(0x52ff9b),
        { drag: 1.2 },
      );
    if (boss.type === "core" && Math.random() < dt * 14)
      this.emit(
        boss.x + (Math.random() - 0.5) * 2.6,
        1.2 + Math.random() * 2.2,
        boss.y + (Math.random() - 0.5) * 2.6,
        (Math.random() - 0.5) * 0.8,
        0.6 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.8,
        0.85,
        0.18,
        hexColor(Math.random() < 0.5 ? 0xb56cff : 0xff5cab),
        { spark: true, drag: 1.2 },
      );
    if (boss.type === "tyrant" && Math.random() < dt * (rushing ? 32 : 14))
      this.emit(
        boss.x + (Math.random() - 0.5) * 2.2,
        1.1 + Math.random() * 1.8,
        boss.y + (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 1.4,
        1.2 + Math.random() * 1.6,
        (Math.random() - 0.5) * 1.4,
        0.55,
        0.16,
        hexColor(0xff9a42),
        { spark: true, drag: 1.5 },
      );
    if (boss.type === "bellkeeper" && boss.st === "charge" && boss.sub === 0)
      this.chargeLine(boss.x, boss.y, boss.ta, 12, 3.4, clamp(boss.subT / 0.85, 0, 1));
    if (boss.type === "tyrant" && boss.st === "charge" && boss.sub === 0)
      this.chargeLine(boss.x, boss.y, boss.ta, 11, 3.2, clamp(boss.subT / 0.7, 0, 1));
  }

  drawDebris() {
    this.D.sync();
  }

  drawParticles() {
    this.P.advanceTime(this.time);
  }

  drawTransient(dt) {
    this.smokeView.update(dt, this.B);
    let keepL = 0;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      line.life -= dt;
      if (line.life <= 0) continue;
      this.lines[keepL++] = line;
      const k = Math.max(0, line.life / line.max);
      if (line.bend) {
        let px = line.x1,
          pz = line.z1;
        const dx = line.x2 - line.x1,
          dz = line.z2 - line.z1;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len,
          nz = dx / len;
        for (let s = 1; s <= 4; s++) {
          const frac = s / 4;
          const sweep = Math.sin(frac * Math.PI) * line.bend;
          const qx = line.x1 + dx * frac + nx * sweep;
          const qz = line.z1 + dz * frac + nz * sweep;
          this.beams.colC(
            this.beams.seg(px, pz, qx, qz, line.y, line.w, line.w * 0.4),
            s % 2 ? line.col : whiteColor,
            k * (s % 2 ? 1.0 : 0.62),
          );
          px = qx;
          pz = qz;
        }
      } else {
        this.beams.colC(
          this.beams.seg(line.x1, line.z1, line.x2, line.z2, line.y, line.w * k, line.w * k),
          line.col,
          k,
        );
      }
    }
    this.lines.length = keepL;

    let keepR = 0;
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) continue;
      this.rings[keepR++] = r;
      const k = Math.max(0, r.life / r.max);
      const radius = r.r1 + (r.r0 - r.r1) * k;
      this.ringPool.colC(this.ringPool.y(r.x, r.y, r.z, 0, radius), r.col, k);
    }
    this.rings.length = keepR;
  }

  project(x, y, z, out) {
    const ndc = this.camera.projectNDC(x, y, z, this._v);
    out.x = (ndc.x * 0.5 + 0.5) * this.w;
    out.y = (-ndc.y * 0.5 + 0.5) * this.h;
    out.vis = ndc.z < 1 && ndc.x > -1.05 && ndc.x < 1.05 && ndc.y > -1.05 && ndc.y < 1.05;
    out.nx = ndc.x;
    out.ny = ndc.y;
    return out;
  }

  groundAt(sx, sy) {
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
    const rect = this.canvas?.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
    const w = rect && rect.width > 0 ? rect.width : this.w;
    const h = rect && rect.height > 0 ? rect.height : this.h;
    const left = rect ? rect.left : 0;
    const top = rect ? rect.top : 0;
    if (!(w > 0 && h > 0)) return null;
    const ndcX = ((sx - left) / w) * 2 - 1;
    const ndcY = -(((sy - top) / h) * 2 - 1);
    this.camera.unprojectRay(ndcX, ndcY, this._rayO, this._rayD);
    if (Math.abs(this._rayD.y) < 1e-4) return null;
    const t = (0.75 - this._rayO.y) / this._rayD.y;
    if (!(t > 0)) return null;
    this._ground.x = this._rayO.x + this._rayD.x * t;
    this._ground.y = this._rayO.z + this._rayD.z * t;
    return this._ground;
  }

  clearTransient() {
    this.P.n = 0;
    this.D.clear();
    this.nums.length = 0;
    this.flashes.length = 0;
    this.lines.length = 0;
    this.rings.length = 0;
    this.corpses.length = 0;
    this.rlAuroraK = 0;
    this.rlWarmK = 0;
  }

  resetCamera() {
    this.smokeView.clear();
    this.camInit = false;
    this.shake = 0;
    this._rlViewKey = "";
    this.camera.clearViewOffset();
  }

  focusOn(x, z) {
    this.focus = x == null ? null : { x, z };
    this.focusK = 0;
  }
}

let homeViewSpot = null;
let dirty = true;

const measureHomeViewSpot = () => {
  const query = (sel) => document.querySelector(sel);
  const brand = query("#home .brand");
  const panel = query("#home .home-panel");
  const top = query("#home .topbar");
  const nav = query("#home .bottom-nav");
  if (!brand || !panel || !top || !nav) return null;
  const brandBox = brand.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  if (brandBox.width < 1 || panelBox.width < 1) return null;
  if (brandBox.right > panelBox.left) {
    const gap = panelBox.top - brandBox.bottom;
    if (gap < 28) return null;
    return { x: (brandBox.left + brandBox.right) / 2, y: brandBox.bottom + gap * 0.5 };
  }
  const topEdge = top.getBoundingClientRect().bottom;
  const navEdge = nav.getBoundingClientRect().top;
  const above = brandBox.top - topEdge;
  const below = navEdge - brandBox.bottom;
  return {
    x: (brandBox.left + brandBox.right) / 2,
    y: above > below ? brandBox.top - Math.min(above * 0.48, 150) : brandBox.bottom + Math.min(below * 0.48, 165),
  };
};

export function markHomeViewDirty() {
  dirty = true;
}

if (typeof addEventListener === "function") {
  const remeasureHomeView = () => {
    dirty = true;
    setTimeout(() => (dirty = true), 450);
  };
  addEventListener("resize", remeasureHomeView, { passive: true });
  if (typeof window !== "undefined" && window.visualViewport) {
    window.visualViewport.addEventListener("resize", remeasureHomeView, { passive: true });
  }
  if (typeof document !== "undefined" && document.fonts) {
    document.fonts.ready.then(() => (dirty = true));
  }
}
