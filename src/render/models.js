// Ground-up stylized painterly / cel-shaded 3D models for Riftline:
// articulated Player + 7 custom weapons, all 25 distinct enemy kits, all 6 monumental biome bosses, and combat props.

import {
  box,
  beveledBox,
  cylinder,
  cone,
  sphere,
  octahedron,
  icosahedron,
  torus,
  sculptedCrystal,
  sculptedCap,
  meshPart,
  mergeGeometries,
  Geometry,
} from "../engine/geometry.js";
import { MeshNode, Node } from "../engine/scene.js";
import { worldMaterial, emissiveMaterial, aegisMaterial, enemySurface } from "./materials.js";
import { FINISH } from "./palette.js";
import { enemyDefs } from "../data/enemies.js";
import { TAU, angleDiff, dampFactor } from "../core/util.js";

export { meshPart };
export function mergeParts(list) {
  return mergeGeometries(list);
}

const SLATE = 0x263848;
const IRON = 0x3b4e5e;
const IVORY = FINISH.ivory;
const BRASS = FINISH.brass;
const COPPER = FINISH.copper;

// Cached primitive geometries reused by kit builders
const G_BOX = box(1, 1, 1);
const G_BEV = beveledBox(1, 1, 1, 0.16);
const G_OCT = octahedron(0.5);
const G_CYL8 = cylinder(0.5, 0.5, 1, 8);
const G_CYL6 = cylinder(0.5, 0.5, 1, 6);
const G_CONE6 = cone(0.5, 1, 6);
const G_SPH = icosahedron(0.5, 1);
const G_TOR = torus(0.5, 0.11, 5, 14);

const part = (geo, color, p) => meshPart(geo, color, p);

function addMesh(parent, geo, mat, p = {}) {
  const m = new MeshNode(geo, mat);
  if (p.x || p.y || p.z) m.position.set(p.x || 0, p.y || 0, p.z || 0);
  if (p.rx || p.ry || p.rz) m.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
  if (p.sx != null || p.sy != null || p.sz != null) m.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
  parent.add(m);
  return m;
}

// ============================================================================
// PLAYER WALKER + ALL 7 CUSTOM WEAPONS
// ============================================================================

function buildWeaponRig(weapon, accentHex) {
  const gun = new Node();
  const bodyParts = [];
  const glowParts = [];
  let muzzleX = 0.85;
  let muzzleY = 0.04;

  switch (weapon) {
    case "scatter":
      // Wide heavy double-barrel trench scattergun with brass heat shield
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.16, y: 0.02, sx: 0.56, sy: 0.24, sz: 0.34 }),
        part(G_CYL8, IRON, { x: 0.54, y: 0.04, z: -0.09, rz: Math.PI / 2, sx: 0.15, sy: 0.52, sz: 0.15 }),
        part(G_CYL8, IRON, { x: 0.54, y: 0.04, z: 0.09, rz: Math.PI / 2, sx: 0.15, sy: 0.52, sz: 0.15 }),
        part(G_BEV, BRASS, { x: 0.36, y: 0.12, sx: 0.34, sy: 0.08, sz: 0.32 }),
      );
      glowParts.push(
        part(G_BOX, accentHex, { x: 0.78, y: 0.04, z: -0.09, sx: 0.06, sy: 0.09, sz: 0.09 }),
        part(G_BOX, accentHex, { x: 0.78, y: 0.04, z: 0.09, sx: 0.06, sy: 0.09, sz: 0.09 }),
      );
      muzzleX = 0.84;
      muzzleY = 0.04;
      break;
    case "tesla":
      // Forked copper Arc Caster emitter prongs with glowing plasma coil rings
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.14, y: 0.02, sx: 0.44, sy: 0.22, sz: 0.28 }),
        part(G_CYL6, COPPER, { x: 0.48, y: 0.04, z: -0.14, rz: Math.PI / 2, sx: 0.09, sy: 0.58, sz: 0.09 }),
        part(G_CYL6, COPPER, { x: 0.48, y: 0.04, z: 0.14, rz: Math.PI / 2, sx: 0.09, sy: 0.58, sz: 0.09 }),
        part(G_CYL6, BRASS, { x: 0.34, y: 0.04, rz: Math.PI / 2, sx: 0.22, sy: 0.14, sz: 0.22 }),
      );
      glowParts.push(
        part(G_TOR, accentHex, { x: 0.54, y: 0.04, ry: Math.PI / 2, sx: 0.32, sy: 0.32, sz: 0.32 }),
        part(G_OCT, IVORY, { x: 0.78, y: 0.04, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      muzzleX = 0.84;
      muzzleY = 0.04;
      break;
    case "rail":
      // Long cantilevered electromagnetic Railgun lance with glowing accelerator channel
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.16, y: 0.02, sx: 0.54, sy: 0.24, sz: 0.28 }),
        part(G_BEV, IVORY, { x: 0.66, y: 0.09, sx: 0.82, sy: 0.09, sz: 0.22 }),
        part(G_BEV, IVORY, { x: 0.66, y: -0.05, sx: 0.82, sy: 0.09, sz: 0.22 }),
        part(G_BEV, BRASS, { x: 0.36, y: 0.02, sx: 0.22, sy: 0.28, sz: 0.34 }),
      );
      glowParts.push(
        part(G_BOX, accentHex, { x: 0.68, y: 0.02, sx: 0.84, sy: 0.06, sz: 0.1 }),
        part(G_OCT, IVORY, { x: 1.08, y: 0.02, sx: 0.1, sy: 0.1, sz: 0.1 }),
      );
      muzzleX = 1.12;
      muzzleY = 0.02;
      break;
    case "rocket":
      // Heavy cylindrical salvo launcher pod with flared exhaust bell
      bodyParts.push(
        part(G_CYL8, SLATE, { x: 0.24, y: 0.06, rz: Math.PI / 2, sx: 0.34, sy: 0.86, sz: 0.34 }),
        part(G_CYL8, BRASS, { x: 0.62, y: 0.06, rz: Math.PI / 2, sx: 0.38, sy: 0.14, sz: 0.38 }),
        part(G_CONE6, IRON, { x: -0.22, y: 0.06, rz: -Math.PI / 2, sx: 0.34, sy: 0.24, sz: 0.34 }),
      );
      glowParts.push(
        part(G_CYL6, accentHex, { x: 0.69, y: 0.06, rz: Math.PI / 2, sx: 0.22, sy: 0.06, sz: 0.22 }),
        part(G_BOX, accentHex, { x: 0.22, y: 0.24, sx: 0.24, sy: 0.06, sz: 0.12 }),
      );
      muzzleX = 0.78;
      muzzleY = 0.06;
      break;
    case "disc":
      // Rotary magnetic crescent sling cradling a luminous saw-disc
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.14, y: 0.02, sx: 0.44, sy: 0.18, sz: 0.36 }),
        part(G_BEV, BRASS, { x: 0.44, y: 0.02, z: -0.18, ry: 0.26, sx: 0.42, sy: 0.12, sz: 0.1 }),
        part(G_BEV, BRASS, { x: 0.44, y: 0.02, z: 0.18, ry: -0.26, sx: 0.42, sy: 0.12, sz: 0.1 }),
      );
      glowParts.push(
        part(G_TOR, accentHex, { x: 0.5, y: 0.02, rx: Math.PI / 2, sx: 0.38, sy: 0.38, sz: 0.38 }),
        part(G_CYL8, IVORY, { x: 0.5, y: 0.02, sx: 0.16, sy: 0.05, sz: 0.16 }),
      );
      muzzleX = 0.78;
      muzzleY = 0.02;
      break;
    case "flame":
      // Dual-canister thermal projector with wide brass igniter shroud
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.16, y: 0.02, sx: 0.52, sy: 0.24, sz: 0.26 }),
        part(G_CYL8, COPPER, { x: 0.12, y: 0.08, z: -0.18, rz: Math.PI / 2, sx: 0.17, sy: 0.42, sz: 0.17 }),
        part(G_CYL8, COPPER, { x: 0.12, y: 0.08, z: 0.18, rz: Math.PI / 2, sx: 0.17, sy: 0.42, sz: 0.17 }),
        part(G_CONE6, BRASS, { x: 0.58, y: 0.02, rz: Math.PI / 2, sx: 0.3, sy: 0.36, sz: 0.3 }),
      );
      glowParts.push(part(G_OCT, accentHex, { x: 0.74, y: 0.02, sx: 0.16, sy: 0.14, sz: 0.14 }));
      muzzleX = 0.82;
      muzzleY = 0.02;
      break;
    default:
      // Pulse Carbine: crisp sculpted energy rifle with luminous core strip
      bodyParts.push(
        part(G_BEV, SLATE, { x: 0.18, y: 0.02, sx: 0.56, sy: 0.22, sz: 0.24 }),
        part(G_BEV, IVORY, { x: 0.56, y: 0.04, sx: 0.42, sy: 0.14, sz: 0.18 }),
        part(G_BEV, BRASS, { x: 0.34, y: 0.13, sx: 0.28, sy: 0.07, sz: 0.18 }),
      );
      glowParts.push(
        part(G_BOX, accentHex, { x: 0.56, y: 0.04, sx: 0.46, sy: 0.06, sz: 0.2 }),
        part(G_OCT, IVORY, { x: 0.8, y: 0.04, sx: 0.09, sy: 0.09, sz: 0.09 }),
      );
      muzzleX = 0.84;
      muzzleY = 0.04;
      break;
  }

  const bodyMat = worldMaterial({ surface: "armor", vertexColors: true });
  const glowMat = emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.18 });
  gun.add(new MeshNode(mergeGeometries(bodyParts), bodyMat));
  gun.add(new MeshNode(mergeGeometries(glowParts), glowMat));
  const muzzle = new Node();
  muzzle.position.set(muzzleX, muzzleY, 0);
  gun.add(muzzle);
  return { gun, muzzle, bodyMat, glowMat };
}

export function buildPlayerModel(weapon = "pulse", weaponColor = 0x5ce8ff) {
  const group = new Node();
  const base = new Node();
  base.rotation.order = "YZX";
  group.add(base);

  const armorMat = worldMaterial({ surface: "armor", vertexColors: true });
  const metalMat = worldMaterial({ surface: "metal", vertexColors: true });
  const visorMat = emissiveMaterial({ color: weaponColor, emissiveIntensity: 1.22 });

  // Articulated legs (thigh + shin + armored boot)
  const makeLeg = (side) => {
    const hip = new Node();
    hip.position.set(0, 0.58, side * 0.22);
    const legGeo = mergeGeometries([
      part(G_BEV, IRON, { y: -0.14, sx: 0.18, sy: 0.3, sz: 0.16 }),
      part(G_BEV, SLATE, { x: 0.04, y: -0.4, sx: 0.2, sy: 0.28, sz: 0.18 }),
      part(G_BEV, BRASS, { x: 0.09, y: -0.53, sx: 0.28, sy: 0.12, sz: 0.2 }),
    ]);
    hip.add(new MeshNode(legGeo, metalMat));
    base.add(hip);
    return hip;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Pelvis & stylized heroic torso chassis (clean ivory + teal-slate + warm brass trim + twin pack vents)
  const torsoGeo = mergeGeometries([
    part(G_BEV, SLATE, { y: 0.65, sx: 0.46, sy: 0.22, sz: 0.54 }),
    part(G_BEV, IVORY, { x: 0.03, y: 0.96, sx: 0.56, sy: 0.46, sz: 0.66 }),
    part(G_BEV, COPPER, { x: 0.27, y: 0.96, sx: 0.1, sy: 0.22, sz: 0.34 }),
    // Sculpted shoulder pauldrons with warm brass rims
    part(G_BEV, SLATE, { x: 0.0, y: 1.08, z: -0.43, rx: 0.22, sx: 0.44, sy: 0.24, sz: 0.3 }),
    part(G_BEV, SLATE, { x: 0.0, y: 1.08, z: 0.43, rx: -0.22, sx: 0.44, sy: 0.24, sz: 0.3 }),
    part(G_BEV, BRASS, { x: 0.02, y: 1.18, z: -0.43, rx: 0.22, sx: 0.32, sy: 0.06, sz: 0.2 }),
    part(G_BEV, BRASS, { x: 0.02, y: 1.18, z: 0.43, rx: -0.22, sx: 0.32, sy: 0.06, sz: 0.2 }),
    // Twin-pod thruster backpack & brass collar
    part(G_BEV, IRON, { x: -0.32, y: 0.96, sx: 0.28, sy: 0.42, sz: 0.44 }),
    part(G_CYL6, SLATE, { x: -0.4, y: 0.98, z: -0.15, sx: 0.16, sy: 0.34, sz: 0.16 }),
    part(G_CYL6, SLATE, { x: -0.4, y: 0.98, z: 0.15, sx: 0.16, sy: 0.34, sz: 0.16 }),
    part(G_BEV, BRASS, { x: 0.08, y: 1.2, sx: 0.4, sy: 0.09, sz: 0.48 }),
  ]);
  base.add(new MeshNode(torsoGeo, armorMat));

  // Back thruster vents glow + chest core pip
  const thrusterGeo = mergeGeometries([
    part(G_OCT, weaponColor, { x: -0.46, y: 0.84, z: -0.15, sx: 0.13, sy: 0.16, sz: 0.13 }),
    part(G_OCT, weaponColor, { x: -0.46, y: 0.84, z: 0.15, sx: 0.13, sy: 0.16, sz: 0.13 }),
    part(G_OCT, weaponColor, { x: 0.33, y: 0.96, sx: 0.08, sy: 0.1, sz: 0.12 }),
  ]);
  base.add(new MeshNode(thrusterGeo, emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.15 })));

  // Weapon bearing pivot on torso + independent horizontal turret mounted on group so aim never drifts with lean/bank
  const weaponMount = new Node();
  weaponMount.position.set(0.04, 1.32, 0);
  base.add(weaponMount);

  const turret = new Node();
  turret.position.set(0.04, 1.32, 0);
  group.add(turret);

  const headGeo = mergeGeometries([
    part(G_BEV, IVORY, { x: 0.04, y: 0.06, sx: 0.44, sy: 0.32, sz: 0.4 }),
    part(G_BEV, SLATE, { x: -0.06, y: 0.19, sx: 0.36, sy: 0.12, sz: 0.34 }),
    // Cute cozy helmet ear-fins + crest antenna
    part(G_BEV, BRASS, { x: -0.02, y: 0.12, z: -0.23, rx: 0.25, sx: 0.16, sy: 0.14, sz: 0.08 }),
    part(G_BEV, BRASS, { x: -0.02, y: 0.12, z: 0.23, rx: -0.25, sx: 0.16, sy: 0.14, sz: 0.08 }),
    part(G_CONE6, BRASS, { x: -0.1, y: 0.3, sx: 0.07, sy: 0.18, sz: 0.07 }),
    // Side weapon mount arm connecting bearing to gun
    part(G_BEV, BRASS, { x: 0.12, y: -0.14, z: 0.28, sx: 0.24, sy: 0.16, sz: 0.24 }),
  ]);
  turret.add(new MeshNode(headGeo, armorMat));
  // Expressive glowing panoramic visor
  addMesh(turret, box(0.13, 0.12, 0.35), visorMat, { x: 0.23, y: 0.07 });

  const rig = buildWeaponRig(weapon, weaponColor);
  rig.gun.position.set(0.14, -0.12, 0.34);
  turret.add(rig.gun);

  // Protective Aegis energy sphere
  const shieldMat = aegisMaterial();
  const shield = new MeshNode(sphere(1.05, 18, 12), shieldMat);
  shield.position.set(0, 0.92, 0);
  shield.visible = false;
  shield.renderOrder = 5;
  group.add(shield);

  const model = {
    group,
    base,
    weaponMount,
    turret,
    gun: rig.gun,
    muzzle: rig.muzzle,
    shield,
    mats: [armorMat, metalMat, rig.bodyMat],
    lean: 0,
    bank: 0,
    recoil: 0,
    aimYaw: 0,
    faceLast: undefined,
    setWalk(phase, amount, jump, time) {
      const stride = Math.sin(phase) * 0.55 * amount;
      const tuck = jump * 0.48;
      legL.rotation.z = stride - tuck;
      legR.rotation.z = -stride - tuck;
      const bob = amount > 0.05 ? Math.abs(Math.cos(phase)) * 0.09 * amount : Math.sin(time * 2.6) * 0.025;
      return bob;
    },
    aimAt(worldAngle, dt = 0) {
      base.updateLocalMatrix();
      const e = base.localMatrix.elements;
      const mx = weaponMount.position.x,
        my = weaponMount.position.y,
        mz = weaponMount.position.z;
      turret.position.set(
        e[0] * mx + e[4] * my + e[8] * mz + e[12],
        e[1] * mx + e[5] * my + e[9] * mz + e[13],
        e[2] * mx + e[6] * my + e[10] * mz + e[14],
      );
      const targetYaw = -worldAngle;
      if (dt > 0) {
        const diff = angleDiff(this.aimYaw, targetYaw);
        this.aimYaw += diff * dampFactor(24, dt);
        this.recoil = Math.max(0, this.recoil - dt * 0.65);
      } else {
        this.aimYaw = targetYaw;
      }
      turret.rotation.set(0, this.aimYaw, 0);
      rig.gun.position.x = 0.14 - this.recoil;
    },
  };
  return model;
}

// ============================================================================
// ALL 25 DISTINCT ENEMY KITS (body + glow, < 810 tris each, strong silhouettes)
// ============================================================================

export const RL_MESH_TYPES = [
  "swarmer",
  "grunt",
  "gunner",
  "bomber",
  "splitter",
  "mite",
  "brute",
  "sniper",
  "hive",
  "bulwark",
  "striker",
  "mortar",
  "mender",
  "leaper",
  "turret",
  "charger",
  "minebot",
  "sapper",
  "phantom",
  "sentinel",
  "carrier",
  "drone",
  "driller",
  "beacon",
  "weaver",
];

const enemyGeoCache = new Map();

function buildEnemyParts(type, accent) {
  const dark = 0x222c3c;
  const hull = 0x485b70;
  const plate = 0xd2c4aa;
  const body = [];
  const glow = [];

  switch (type) {
    case "swarmer":
      // Cute zippy beetle-wasp dart with twin swept wings, antennae & tail stinger
      body.push(
        part(G_OCT, accent, { x: 0.04, y: 0.44, sx: 0.94, sy: 0.46, sz: 0.56 }),
        part(G_BEV, dark, { x: -0.34, y: 0.42, sx: 0.44, sy: 0.3, sz: 0.36 }),
        part(G_CONE6, plate, { x: -0.62, y: 0.4, rz: Math.PI / 2, sx: 0.18, sy: 0.3, sz: 0.18 }),
        // Layered upper & lower swept wings
        part(G_BEV, dark, { x: -0.06, y: 0.5, z: -0.4, ry: 0.46, rx: -0.12, sx: 0.56, sy: 0.07, sz: 0.38 }),
        part(G_BEV, dark, { x: -0.06, y: 0.5, z: 0.4, ry: -0.46, rx: 0.12, sx: 0.56, sy: 0.07, sz: 0.38 }),
        part(G_BOX, plate, { x: -0.14, y: 0.54, z: -0.38, ry: 0.46, sx: 0.38, sy: 0.04, sz: 0.12 }),
        part(G_BOX, plate, { x: -0.14, y: 0.54, z: 0.38, ry: -0.46, sx: 0.38, sy: 0.04, sz: 0.12 }),
        // Cute mandibles
        part(G_CONE6, BRASS, { x: 0.48, y: 0.36, z: -0.14, rz: -1.3, sx: 0.1, sy: 0.22, sz: 0.1 }),
        part(G_CONE6, BRASS, { x: 0.48, y: 0.36, z: 0.14, rz: -1.3, sx: 0.1, sy: 0.22, sz: 0.1 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.38, y: 0.48, z: -0.12, sx: 0.15, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: 0.38, y: 0.48, z: 0.12, sx: 0.15, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: -0.42, y: 0.46, sx: 0.16, sy: 0.14, sz: 0.18 }),
      );
      break;
    case "mite":
      // Cute plump spiked broodling with 4 tiny skitter legs, pincers & dorsal ridge
      body.push(
        part(G_SPH, accent, { y: 0.3, sx: 0.72, sy: 0.44, sz: 0.6 }),
        part(G_BEV, dark, { x: -0.1, y: 0.44, sx: 0.42, sy: 0.16, sz: 0.4 }),
        part(G_CONE6, plate, { x: 0.32, y: 0.28, z: -0.15, rz: -1.15, sx: 0.14, sy: 0.26, sz: 0.14 }),
        part(G_CONE6, plate, { x: 0.32, y: 0.28, z: 0.15, rz: -1.15, sx: 0.14, sy: 0.26, sz: 0.14 }),
        // 4 tiny skitter feet
        ...[-1, 1].flatMap((s) =>
          [-0.18, 0.14].map((lx) =>
            part(G_BOX, dark, { x: lx, y: 0.12, z: s * 0.34, rx: s * 0.4, sx: 0.1, sy: 0.22, sz: 0.1 }),
          ),
        ),
        part(G_CONE6, plate, { x: -0.18, y: 0.56, rz: 0.35, sx: 0.14, sy: 0.22, sz: 0.14 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.28, y: 0.36, z: -0.12, sx: 0.14, sy: 0.13, sz: 0.13 }),
        part(G_OCT, 0xffffff, { x: 0.28, y: 0.36, z: 0.12, sx: 0.14, sy: 0.13, sz: 0.13 }),
      );
      break;
    case "grunt":
      // Cute chunky armored vanguard trooper with little boots, shoulder pads, crest & backpack
      body.push(
        // Chunky boots
        part(G_BEV, IRON, { x: 0.04, y: 0.14, z: -0.22, sx: 0.34, sy: 0.26, sz: 0.24 }),
        part(G_BEV, IRON, { x: 0.04, y: 0.14, z: 0.22, sx: 0.34, sy: 0.26, sz: 0.24 }),
        // Waist + armored chest
        part(G_BEV, dark, { y: 0.42, sx: 0.58, sy: 0.34, sz: 0.62 }),
        part(G_BEV, hull, { x: 0.04, y: 0.74, sx: 0.68, sy: 0.46, sz: 0.74 }),
        // Cozy rounded pauldrons & backpack
        part(G_BEV, plate, { x: 0.02, y: 0.84, z: -0.44, rx: 0.2, sx: 0.4, sy: 0.28, sz: 0.24 }),
        part(G_BEV, plate, { x: 0.02, y: 0.84, z: 0.44, rx: -0.2, sx: 0.4, sy: 0.28, sz: 0.24 }),
        part(G_BEV, dark, { x: -0.34, y: 0.74, sx: 0.24, sy: 0.38, sz: 0.46 }),
        // Crested helmet with fin
        part(G_BEV, accent, { x: 0.08, y: 1.08, sx: 0.46, sy: 0.28, sz: 0.44 }),
        part(G_BOX, BRASS, { x: 0.06, y: 1.26, sx: 0.32, sy: 0.1, sz: 0.1 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.34, y: 1.04, sx: 0.12, sy: 0.11, sz: 0.36 }),
        part(G_BOX, 0xffffff, { x: -0.46, y: 0.76, sx: 0.06, sy: 0.2, sz: 0.24 }),
      );
      break;
    case "gunner":
      // Chunky tripod-footed plasma trooper with twin collared barrels, ammo drum & rangefinder hood
      body.push(
        part(G_BEV, IRON, { x: 0.06, y: 0.14, z: -0.26, sx: 0.36, sy: 0.26, sz: 0.22 }),
        part(G_BEV, IRON, { x: 0.06, y: 0.14, z: 0.26, sx: 0.36, sy: 0.26, sz: 0.22 }),
        part(G_CYL8, dark, { y: 0.42, sx: 0.62, sy: 0.36, sz: 0.62 }),
        part(G_BEV, hull, { y: 0.78, sx: 0.74, sy: 0.5, sz: 0.88 }),
        part(G_CYL6, COPPER, { x: -0.36, y: 0.82, rz: Math.PI / 2, sx: 0.3, sy: 0.26, sz: 0.5 }),
        // Twin arm cannons with brass muzzle collars
        part(G_CYL6, IRON, { x: 0.48, y: 0.76, z: -0.38, rz: Math.PI / 2, sx: 0.17, sy: 0.72, sz: 0.17 }),
        part(G_CYL6, IRON, { x: 0.48, y: 0.76, z: 0.38, rz: Math.PI / 2, sx: 0.17, sy: 0.72, sz: 0.17 }),
        part(G_CYL6, BRASS, { x: 0.74, y: 0.76, z: -0.38, rz: Math.PI / 2, sx: 0.22, sy: 0.12, sz: 0.22 }),
        part(G_CYL6, BRASS, { x: 0.74, y: 0.76, z: 0.38, rz: Math.PI / 2, sx: 0.22, sy: 0.12, sz: 0.22 }),
        part(G_BEV, accent, { x: -0.04, y: 1.14, sx: 0.48, sy: 0.26, sz: 0.52 }),
        part(G_BOX, plate, { x: -0.06, y: 1.3, z: -0.18, sx: 0.14, sy: 0.14, sz: 0.1 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.22, y: 1.12, sx: 0.12, sy: 0.11, sz: 0.42 }),
        part(G_OCT, 0xffffff, { x: 0.85, y: 0.76, z: -0.38, sx: 0.14, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: 0.85, y: 0.76, z: 0.38, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      break;
    case "bomber":
      // Cute rotund brass-belted ticking kettle-mine walker with stubby legs & fuse beacon
      body.push(
        part(G_SPH, dark, { y: 0.66, sx: 0.96, sy: 0.86, sz: 0.96 }),
        part(G_TOR, BRASS, { y: 0.66, rx: Math.PI / 2, sx: 1.04, sy: 1.04, sz: 1.04 }),
        part(G_CYL6, plate, { y: 1.08, sx: 0.42, sy: 0.14, sz: 0.42 }),
        // Stubby cute articulated legs & feet
        part(G_BEV, IRON, { x: 0.04, y: 0.18, z: -0.38, sx: 0.28, sy: 0.34, sz: 0.22 }),
        part(G_BEV, IRON, { x: 0.04, y: 0.18, z: 0.38, sx: 0.28, sy: 0.34, sz: 0.22 }),
        part(G_BOX, plate, { x: 0.12, y: 0.06, z: -0.38, sx: 0.34, sy: 0.1, sz: 0.24 }),
        part(G_BOX, plate, { x: 0.12, y: 0.06, z: 0.38, sx: 0.34, sy: 0.1, sz: 0.24 }),
        // Side pressure bolts
        part(G_CYL6, COPPER, { y: 0.66, z: -0.52, rx: Math.PI / 2, sx: 0.18, sy: 0.14, sz: 0.18 }),
        part(G_CYL6, COPPER, { y: 0.66, z: 0.52, rx: Math.PI / 2, sx: 0.18, sy: 0.14, sz: 0.18 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.14, y: 0.68, sx: 0.64, sy: 0.64, sz: 0.64 }),
        part(G_OCT, 0xffffff, { y: 1.24, sx: 0.3, sy: 0.36, sz: 0.3 }),
      );
      break;
    case "splitter":
      // Cute twin-lobed glowing mitosis jelly-pod with bridged crest & tiny tendrils
      body.push(
        part(G_SPH, hull, { y: 0.56, z: -0.28, sx: 0.72, sy: 0.76, sz: 0.62 }),
        part(G_SPH, hull, { y: 0.56, z: 0.28, sx: 0.72, sy: 0.76, sz: 0.62 }),
        part(G_BEV, accent, { y: 0.88, sx: 0.56, sy: 0.32, sz: 0.82 }),
        part(G_BEV, dark, { y: 0.32, sx: 0.44, sy: 0.22, sz: 0.52 }),
        part(G_CONE6, plate, { x: -0.12, y: 1.08, z: -0.24, sx: 0.16, sy: 0.22, sz: 0.16 }),
        part(G_CONE6, plate, { x: -0.12, y: 1.08, z: 0.24, sx: 0.16, sy: 0.22, sz: 0.16 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.3, y: 0.62, z: -0.28, sx: 0.22, sy: 0.24, sz: 0.22 }),
        part(G_OCT, 0xffffff, { x: 0.3, y: 0.62, z: 0.28, sx: 0.22, sy: 0.24, sz: 0.22 }),
        part(G_BOX, 0xffffff, { y: 0.56, sx: 0.18, sy: 0.22, sz: 0.28 }),
      );
      break;
    case "brute":
      // Chunky broad-shouldered horned juggernaut with heavy boots, gauntlets, furnace pack & brass tusks
      body.push(
        part(G_BEV, IRON, { x: 0.04, y: 0.2, z: -0.42, sx: 0.52, sy: 0.38, sz: 0.38 }),
        part(G_BEV, IRON, { x: 0.04, y: 0.2, z: 0.42, sx: 0.52, sy: 0.38, sz: 0.38 }),
        part(G_BEV, dark, { y: 0.54, sx: 0.92, sy: 0.5, sz: 1.12 }),
        part(G_BEV, hull, { x: 0.08, y: 1.06, sx: 1.14, sy: 0.76, sz: 1.38 }),
        // Huge layered shoulder pauldrons & gauntlets
        part(G_BEV, plate, { x: 0.12, y: 1.28, z: -0.72, rx: 0.25, sx: 0.8, sy: 0.46, sz: 0.44 }),
        part(G_BEV, plate, { x: 0.12, y: 1.28, z: 0.72, rx: -0.25, sx: 0.8, sy: 0.46, sz: 0.44 }),
        part(G_BEV, dark, { x: 0.46, y: 0.68, z: -0.76, sx: 0.52, sy: 0.46, sz: 0.36 }),
        part(G_BEV, dark, { x: 0.46, y: 0.68, z: 0.76, sx: 0.52, sy: 0.46, sz: 0.36 }),
        // Back exhaust stacks & horned helm
        part(G_CYL6, COPPER, { x: -0.52, y: 1.26, z: -0.34, sx: 0.22, sy: 0.56, sz: 0.22 }),
        part(G_CYL6, COPPER, { x: -0.52, y: 1.26, z: 0.34, sx: 0.22, sy: 0.56, sz: 0.22 }),
        part(G_BEV, accent, { x: 0.36, y: 1.44, sx: 0.52, sy: 0.34, sz: 0.58 }),
        part(G_CONE6, BRASS, { x: 0.68, y: 1.42, z: -0.44, rz: -1.0, sx: 0.24, sy: 0.58, sz: 0.24 }),
        part(G_CONE6, BRASS, { x: 0.68, y: 1.42, z: 0.44, rz: -1.0, sx: 0.24, sy: 0.58, sz: 0.24 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.66, y: 1.38, sx: 0.14, sy: 0.16, sz: 0.46 }),
        part(G_OCT, 0xffffff, { x: 0.68, y: 0.96, sx: 0.22, sy: 0.28, sz: 0.32 }),
      );
      break;
    case "sniper":
      // Tall elegant hooded marksman spire with tripod legs, long scope rifle & cape cowl
      body.push(
        // Tripod stabilizer feet
        ...[-1, 0, 1].map((i) => {
          const a = i * 2.1;
          return part(G_BOX, IRON, {
            x: Math.cos(a) * 0.26,
            y: 0.14,
            z: Math.sin(a) * 0.26,
            ry: -a,
            rz: -0.35,
            sx: 0.14,
            sy: 0.34,
            sz: 0.14,
          });
        }),
        part(G_CYL6, dark, { y: 0.58, sx: 0.46, sy: 0.92, sz: 0.46 }),
        part(G_BEV, hull, { y: 1.12, sx: 0.58, sy: 0.46, sz: 0.54 }),
        // Hooded cowl & cheek plates
        part(G_BEV, accent, { x: -0.1, y: 1.48, sx: 0.42, sy: 0.32, sz: 0.38 }),
        part(G_CONE6, dark, { x: -0.26, y: 1.54, rz: 0.55, sx: 0.28, sy: 0.36, sz: 0.28 }),
        // Long rail barrel with brass stabilizer sleeve & top scope
        part(G_CYL6, plate, { x: 0.8, y: 1.12, rz: Math.PI / 2, sx: 0.12, sy: 1.38, sz: 0.12 }),
        part(G_CYL6, BRASS, { x: 0.52, y: 1.12, rz: Math.PI / 2, sx: 0.18, sy: 0.32, sz: 0.18 }),
        part(G_CYL6, dark, { x: 0.46, y: 1.28, rz: Math.PI / 2, sx: 0.1, sy: 0.44, sz: 0.1 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.32, y: 1.46, sx: 0.2, sy: 0.18, sz: 0.24 }),
        part(G_BOX, 0xffffff, { x: 0.92, y: 1.18, sx: 0.82, sy: 0.05, sz: 0.05 }),
        part(G_OCT, 0xffffff, { x: 0.68, y: 1.28, sx: 0.1, sy: 0.1, sz: 0.1 }),
      );
      break;
    case "hive":
      // Cozy layered storybook mushroom-brood nest with glowing brood pods & root buttresses
      body.push(
        part(G_CYL8, dark, { y: 0.34, sx: 1.24, sy: 0.6, sz: 1.24 }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + 0.4;
          return part(G_BOX, hull, {
            x: Math.cos(a) * 0.62,
            y: 0.24,
            z: Math.sin(a) * 0.62,
            ry: -a,
            rz: -0.35,
            sx: 0.24,
            sy: 0.46,
            sz: 0.26,
          });
        }),
        part(sculptedCap(0.88, 0.76, 71), hull, { y: 0.56 }),
        part(sculptedCap(0.58, 0.54, 79), accent, { y: 1.16 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { y: 0.9, sx: 0.54, sy: 0.36, sz: 0.54 }),
        part(G_OCT, 0xffffff, { y: 1.66, sx: 0.32, sy: 0.44, sz: 0.32 }),
        ...Array.from({ length: 3 }, (_, i) => {
          const a = (i * TAU) / 3;
          return part(G_OCT, 0xffffff, {
            x: Math.cos(a) * 0.54,
            y: 0.52,
            z: Math.sin(a) * 0.54,
            sx: 0.16,
            sy: 0.2,
            sz: 0.16,
          });
        }),
      );
      break;
    case "bulwark":
      // Chunky fortress knight-walker with heavy armored boots, tower shield with brass boss & crested helm
      body.push(
        part(G_BEV, IRON, { x: -0.06, y: 0.18, z: -0.34, sx: 0.44, sy: 0.34, sz: 0.32 }),
        part(G_BEV, IRON, { x: -0.06, y: 0.18, z: 0.34, sx: 0.44, sy: 0.34, sz: 0.32 }),
        part(G_BEV, dark, { x: -0.1, y: 0.58, sx: 0.86, sy: 0.58, sz: 0.96 }),
        part(G_BEV, hull, { x: -0.06, y: 1.08, sx: 0.88, sy: 0.54, sz: 1.02 }),
        part(G_BEV, accent, { x: -0.04, y: 1.46, sx: 0.5, sy: 0.26, sz: 0.54 }),
        // Broad faceted fortress shield with top & bottom brass trim bars
        part(G_BEV, plate, { x: 0.58, y: 0.78, sx: 0.22, sy: 1.26, sz: 1.32 }),
        part(G_BEV, BRASS, { x: 0.68, y: 0.78, sx: 0.12, sy: 0.86, sz: 0.36 }),
        part(G_BOX, BRASS, { x: 0.65, y: 1.36, sx: 0.16, sy: 0.1, sz: 1.2 }),
        part(G_BOX, BRASS, { x: 0.65, y: 0.2, sx: 0.16, sy: 0.1, sz: 1.2 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.75, y: 0.78, sx: 0.08, sy: 0.98, sz: 0.14 }),
        part(G_BOX, 0xffffff, { x: 0.24, y: 1.42, sx: 0.14, sy: 0.12, sz: 0.44 }),
      );
      break;
    case "striker":
      // Sleek twin-blade darting moth-assassin with brass wing trims, tail rudder & glowing crest
      body.push(
        part(G_OCT, dark, { y: 0.78, sx: 1.12, sy: 0.5, sz: 0.58 }),
        part(G_BEV, accent, { x: 0.06, y: 0.96, sx: 0.6, sy: 0.18, sz: 0.32 }),
        part(G_BEV, plate, { x: 0.1, y: 0.8, z: -0.54, ry: 0.55, sx: 0.96, sy: 0.09, sz: 0.3 }),
        part(G_BEV, plate, { x: 0.1, y: 0.8, z: 0.54, ry: -0.55, sx: 0.96, sy: 0.09, sz: 0.3 }),
        part(G_BOX, BRASS, { x: 0.22, y: 0.84, z: -0.5, ry: 0.55, sx: 0.65, sy: 0.05, sz: 0.08 }),
        part(G_BOX, BRASS, { x: 0.22, y: 0.84, z: 0.5, ry: -0.55, sx: 0.65, sy: 0.05, sz: 0.08 }),
        part(G_CONE6, dark, { x: -0.62, y: 0.78, rz: Math.PI / 2, sx: 0.26, sy: 0.44, sz: 0.26 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.5, y: 0.82, sx: 0.32, sy: 0.2, sz: 0.26 }),
        part(G_BOX, 0xffffff, { x: -0.44, y: 0.82, sx: 0.16, sy: 0.1, sz: 0.28 }),
      );
      break;
    case "mortar":
      // Cute squat brass-rimmed spider-cannon with 4 stubby legs & flared howitzer barrel
      body.push(
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + Math.PI / 4;
          return part(G_BEV, IRON, {
            x: Math.cos(a) * 0.58,
            y: 0.2,
            z: Math.sin(a) * 0.58,
            ry: -a,
            rz: -0.32,
            sx: 0.24,
            sy: 0.4,
            sz: 0.24,
          });
        }),
        part(G_CYL8, dark, { y: 0.4, sx: 1.06, sy: 0.44, sz: 1.06 }),
        part(G_BEV, hull, { y: 0.74, sx: 0.86, sy: 0.4, sz: 0.86 }),
        part(G_CYL8, plate, { x: 0.18, y: 1.14, rz: -0.42, sx: 0.48, sy: 0.88, sz: 0.48 }),
        part(G_TOR, BRASS, { x: 0.36, y: 1.5, rz: -0.42, rx: Math.PI / 2, sx: 0.58, sy: 0.58, sz: 0.58 }),
        part(G_CYL6, COPPER, { x: -0.34, y: 0.82, sx: 0.28, sy: 0.36, sz: 0.44 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.35, y: 1.5, sx: 0.32, sy: 0.32, sz: 0.32 }),
        part(G_BOX, 0xffffff, { x: 0.44, y: 0.74, sx: 0.1, sy: 0.14, sz: 0.38 }),
      );
      break;
    case "mender":
      // Charming floating lantern-medic shrine with brass halo, floating petals & healing cross
      body.push(
        part(G_OCT, plate, { y: 0.88, sx: 0.66, sy: 1.1, sz: 0.66 }),
        part(G_CYL6, BRASS, { y: 1.32, sx: 0.44, sy: 0.12, sz: 0.44 }),
        part(G_CYL6, BRASS, { y: 0.46, sx: 0.36, sy: 0.12, sz: 0.36 }),
        part(G_TOR, hull, { y: 0.92, rx: Math.PI / 2, sx: 1.06, sy: 1.06, sz: 1.06 }),
        ...[-1, 1].map((s) => part(G_BEV, accent, { y: 0.92, z: s * 0.56, sx: 0.18, sy: 0.42, sz: 0.12 })),
      );
      glow.push(
        part(G_BOX, 0xffffff, { y: 1.62, sx: 0.12, sy: 0.42, sz: 0.12 }),
        part(G_BOX, 0xffffff, { y: 1.62, sx: 0.12, sy: 0.12, sz: 0.42 }),
        part(G_TOR, 0xffffff, { y: 0.92, rx: Math.PI / 2, sx: 1.14, sy: 1.14, sz: 1.14 }),
      );
      break;
    case "leaper":
      // Cute coiled spring-legged mech-hound with pointy ears, tail & sturdy front paws
      body.push(
        part(G_BEV, hull, { x: 0.06, y: 0.64, rz: -0.2, sx: 0.92, sy: 0.42, sz: 0.56 }),
        part(G_BEV, accent, { x: 0.1, y: 0.88, sx: 0.54, sy: 0.16, sz: 0.42 }),
        // Coiled hind legs + front paws
        part(G_BEV, dark, { x: -0.34, y: 0.34, z: -0.34, rz: 0.42, sx: 0.24, sy: 0.62, sz: 0.2 }),
        part(G_BEV, dark, { x: -0.34, y: 0.34, z: 0.34, rz: 0.42, sx: 0.24, sy: 0.62, sz: 0.2 }),
        part(G_BOX, IRON, { x: 0.34, y: 0.24, z: -0.28, rz: -0.25, sx: 0.16, sy: 0.44, sz: 0.16 }),
        part(G_BOX, IRON, { x: 0.34, y: 0.24, z: 0.28, rz: -0.25, sx: 0.16, sy: 0.44, sz: 0.16 }),
        // Snout & cute pointed ears + stub tail
        part(G_CONE6, plate, { x: 0.58, y: 0.7, rz: -Math.PI / 2, sx: 0.36, sy: 0.44, sz: 0.36 }),
        part(G_CONE6, BRASS, { x: 0.38, y: 1.0, z: -0.18, rz: 0.2, sx: 0.12, sy: 0.26, sz: 0.12 }),
        part(G_CONE6, BRASS, { x: 0.38, y: 1.0, z: 0.18, rz: 0.2, sx: 0.12, sy: 0.26, sz: 0.12 }),
        part(G_CONE6, dark, { x: -0.52, y: 0.82, rz: 0.75, sx: 0.12, sy: 0.34, sz: 0.12 }),
      );
      glow.push(part(G_BOX, 0xffffff, { x: 0.54, y: 0.8, sx: 0.14, sy: 0.12, sz: 0.34 }));
      break;
    case "turret":
      // Fortified cozy pillbox bunker with armored collar, radar dish & collared twin cannons
      body.push(
        part(G_CYL8, dark, { y: 0.26, sx: 1.2, sy: 0.44, sz: 1.2 }),
        part(G_CYL8, BRASS, { y: 0.52, sx: 1.02, sy: 0.1, sz: 1.02 }),
        part(G_BEV, hull, { y: 0.84, sx: 0.86, sy: 0.56, sz: 0.88 }),
        part(G_BEV, accent, { x: -0.06, y: 1.18, sx: 0.56, sy: 0.18, sz: 0.58 }),
        part(G_CYL6, plate, { x: 0.62, y: 0.88, z: -0.24, rz: Math.PI / 2, sx: 0.18, sy: 0.86, sz: 0.18 }),
        part(G_CYL6, plate, { x: 0.62, y: 0.88, z: 0.24, rz: Math.PI / 2, sx: 0.18, sy: 0.86, sz: 0.18 }),
        part(G_CYL6, BRASS, { x: 0.96, y: 0.88, z: -0.24, rz: Math.PI / 2, sx: 0.22, sy: 0.12, sz: 0.22 }),
        part(G_CYL6, BRASS, { x: 0.96, y: 0.88, z: 0.24, rz: Math.PI / 2, sx: 0.22, sy: 0.12, sz: 0.22 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.44, y: 1.0, sx: 0.12, sy: 0.16, sz: 0.54 }),
        part(G_OCT, 0xffffff, { x: -0.08, y: 1.38, sx: 0.18, sy: 0.22, sz: 0.18 }),
      );
      break;
    case "charger":
      // Chunky armored battering-ram boar-chariot with brass side bumpers, tusks & twin jet exhausts
      body.push(
        part(G_CONE6, plate, { x: 0.28, y: 0.52, rz: -Math.PI / 2, sx: 0.86, sy: 1.12, sz: 0.98 }),
        part(G_BEV, dark, { x: -0.34, y: 0.48, sx: 0.6, sy: 0.56, sz: 0.94 }),
        part(G_BEV, hull, { x: -0.1, y: 0.8, sx: 0.54, sy: 0.24, sz: 0.66 }),
        // Side treads / skids + front tusks
        part(G_BEV, IRON, { x: -0.06, y: 0.22, z: -0.54, sx: 1.0, sy: 0.26, sz: 0.22 }),
        part(G_BEV, IRON, { x: -0.06, y: 0.22, z: 0.54, sx: 1.0, sy: 0.26, sz: 0.22 }),
        part(G_CONE6, BRASS, { x: 0.72, y: 0.46, z: -0.36, rz: -1.4, sx: 0.16, sy: 0.44, sz: 0.16 }),
        part(G_CONE6, BRASS, { x: 0.72, y: 0.46, z: 0.36, rz: -1.4, sx: 0.16, sy: 0.44, sz: 0.16 }),
        part(G_CYL6, COPPER, { x: -0.64, y: 0.5, z: -0.26, rz: Math.PI / 2, sx: 0.22, sy: 0.22, sz: 0.22 }),
        part(G_CYL6, COPPER, { x: -0.64, y: 0.5, z: 0.26, rz: Math.PI / 2, sx: 0.22, sy: 0.22, sz: 0.22 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: -0.74, y: 0.5, sx: 0.12, sy: 0.26, sz: 0.6 }),
        part(G_OCT, 0xffffff, { x: 0.56, y: 0.66, sx: 0.22, sy: 0.2, sz: 0.26 }),
      );
      break;
    case "minebot":
      // Cute little brass-rimmed mechanical crab-layer with 4 stubby legs & glowing ordnance dome
      body.push(
        part(G_CYL8, dark, { y: 0.28, sx: 0.98, sy: 0.3, sz: 0.98 }),
        part(G_BEV, hull, { y: 0.54, sx: 0.72, sy: 0.28, sz: 0.72 }),
        part(G_TOR, BRASS, { y: 0.54, rx: Math.PI / 2, sx: 0.88, sy: 0.88, sz: 0.88 }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + Math.PI / 4;
          return part(G_BOX, IRON, {
            x: Math.cos(a) * 0.56,
            y: 0.16,
            z: Math.sin(a) * 0.56,
            ry: -a,
            rz: -0.45,
            sx: 0.16,
            sy: 0.34,
            sz: 0.16,
          });
        }),
        part(G_BOX, plate, { x: 0.44, y: 0.46, sx: 0.18, sy: 0.16, sz: 0.36 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { y: 0.78, sx: 0.42, sy: 0.3, sz: 0.42 }),
        part(G_BOX, 0xffffff, { x: 0.54, y: 0.46, sx: 0.06, sy: 0.1, sz: 0.24 }),
      );
      break;
    case "sapper":
      // Agile demolition grenadier with boots, twin copper charge canisters, goggles & tossing arm
      body.push(
        part(G_BEV, IRON, { y: 0.14, z: -0.2, sx: 0.3, sy: 0.24, sz: 0.2 }),
        part(G_BEV, IRON, { y: 0.14, z: 0.2, sx: 0.3, sy: 0.24, sz: 0.2 }),
        part(G_BEV, dark, { y: 0.46, sx: 0.58, sy: 0.46, sz: 0.62 }),
        part(G_BEV, hull, { x: 0.08, y: 0.88, sx: 0.56, sy: 0.42, sz: 0.68 }),
        part(G_BEV, accent, { x: 0.1, y: 1.18, sx: 0.42, sy: 0.22, sz: 0.44 }),
        // Twin demolition canisters on backpack
        part(G_CYL6, COPPER, { x: -0.32, y: 0.86, z: -0.18, sx: 0.24, sy: 0.52, sz: 0.24 }),
        part(G_CYL6, COPPER, { x: -0.32, y: 0.86, z: 0.18, sx: 0.24, sy: 0.52, sz: 0.24 }),
        part(G_BOX, BRASS, { x: -0.32, y: 1.14, sx: 0.22, sy: 0.08, sz: 0.5 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.34, y: 1.16, sx: 0.1, sy: 0.12, sz: 0.34 }),
        part(G_OCT, 0xffffff, { x: -0.32, y: 1.28, sx: 0.24, sy: 0.22, sz: 0.28 }),
      );
      break;
    case "phantom":
      // Charming hooded storybook lantern-wraith with layered mantle, shoulder wisps & floating rune ring
      body.push(
        part(G_CONE6, dark, { y: 0.72, sx: 0.8, sy: 1.24, sz: 0.8 }),
        part(G_OCT, hull, { y: 1.4, sx: 0.58, sy: 0.64, sz: 0.58 }),
        part(G_BEV, accent, { x: -0.06, y: 1.16, z: -0.44, rz: 0.32, sx: 0.28, sy: 0.52, sz: 0.18 }),
        part(G_BEV, accent, { x: -0.06, y: 1.16, z: 0.44, rz: 0.32, sx: 0.28, sy: 0.52, sz: 0.18 }),
        part(G_CONE6, plate, { x: -0.14, y: 1.76, rz: 0.38, sx: 0.26, sy: 0.34, sz: 0.26 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.26, y: 1.4, z: -0.11, sx: 0.12, sy: 0.14, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: 0.26, y: 1.4, z: 0.11, sx: 0.12, sy: 0.14, sz: 0.12 }),
        part(G_TOR, 0xffffff, { y: 0.5, rx: Math.PI / 2, sx: 0.94, sy: 0.94, sz: 0.94 }),
      );
      break;
    case "sentinel":
      // Ornate floating beam-eye lantern obelisk flanked by brass-trimmed focusing wings & crown spire
      body.push(
        part(G_BEV, dark, { y: 0.96, sx: 0.64, sy: 1.16, sz: 0.64 }),
        part(G_BEV, BRASS, { y: 1.58, sx: 0.48, sy: 0.14, sz: 0.48 }),
        part(G_CONE6, hull, { y: 1.84, sx: 0.32, sy: 0.4, sz: 0.32 }),
        part(G_CONE6, hull, { y: 0.26, rx: Math.PI, sx: 0.34, sy: 0.34, sz: 0.34 }),
        part(G_BEV, plate, { y: 1.0, z: -0.54, rx: 0.14, sx: 0.48, sy: 0.98, sz: 0.16 }),
        part(G_BEV, plate, { y: 1.0, z: 0.54, rx: -0.14, sx: 0.48, sy: 0.98, sz: 0.16 }),
        part(G_BOX, BRASS, { x: 0.16, y: 1.0, z: -0.56, sx: 0.12, sy: 0.86, sz: 0.18 }),
        part(G_BOX, BRASS, { x: 0.16, y: 1.0, z: 0.56, sx: 0.12, sy: 0.86, sz: 0.18 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.3, y: 1.04, sx: 0.42, sy: 0.42, sz: 0.42 }),
        part(G_OCT, 0xffffff, { y: 2.08, sx: 0.18, sy: 0.26, sz: 0.18 }),
      );
      break;
    case "carrier":
      // Cozy hovering sky-skiff mothership with catamaran pontoons, bridge tower & launch bays
      body.push(
        part(G_BEV, dark, { y: 0.88, sx: 1.24, sy: 0.42, sz: 1.44 }),
        part(G_BEV, hull, { x: 0.08, y: 1.2, sx: 0.88, sy: 0.34, sz: 0.84 }),
        part(G_BEV, accent, { x: -0.1, y: 1.44, sx: 0.48, sy: 0.22, sz: 0.52 }),
        // Twin armored pontoons with brass nose caps
        part(G_BEV, plate, { x: 0.14, y: 0.86, z: -0.8, sx: 1.18, sy: 0.32, sz: 0.28 }),
        part(G_BEV, plate, { x: 0.14, y: 0.86, z: 0.8, sx: 1.18, sy: 0.32, sz: 0.28 }),
        part(G_CONE6, BRASS, { x: 0.8, y: 0.86, z: -0.8, rz: -Math.PI / 2, sx: 0.28, sy: 0.28, sz: 0.28 }),
        part(G_CONE6, BRASS, { x: 0.8, y: 0.86, z: 0.8, rz: -Math.PI / 2, sx: 0.28, sy: 0.28, sz: 0.28 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.64, y: 0.88, sx: 0.12, sy: 0.2, sz: 0.92 }),
        part(G_OCT, 0xffffff, { x: -0.1, y: 1.66, sx: 0.32, sy: 0.26, sz: 0.32 }),
        part(G_BOX, 0xffffff, { x: -0.62, y: 0.88, sx: 0.1, sy: 0.18, sz: 0.68 }),
      );
      break;
    case "drone":
      // Cute sleek hovering scout-orb with brass wingtips, top fin & rear thruster
      body.push(
        part(G_SPH, hull, { y: 0.88, sx: 0.58, sy: 0.48, sz: 0.58 }),
        part(G_BEV, plate, { x: -0.02, y: 0.88, z: -0.4, ry: 0.2, sx: 0.4, sy: 0.09, sz: 0.38 }),
        part(G_BEV, plate, { x: -0.02, y: 0.88, z: 0.4, ry: -0.2, sx: 0.4, sy: 0.09, sz: 0.38 }),
        part(G_BOX, BRASS, { x: -0.06, y: 0.92, z: -0.56, sx: 0.34, sy: 0.12, sz: 0.08 }),
        part(G_BOX, BRASS, { x: -0.06, y: 0.92, z: 0.56, sx: 0.34, sy: 0.12, sz: 0.08 }),
        part(G_BEV, dark, { x: -0.28, y: 0.88, sx: 0.22, sy: 0.24, sz: 0.26 }),
        part(G_CONE6, accent, { x: -0.06, y: 1.18, rz: 0.3, sx: 0.12, sy: 0.22, sz: 0.12 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.3, y: 0.88, sx: 0.22, sy: 0.2, sz: 0.24 }),
        part(G_OCT, 0xffffff, { x: -0.42, y: 0.88, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      break;
    case "driller":
      // Cute stout mole-burrower with armored treads, ribbed brass drill nose & glowing heat collar
      body.push(
        part(G_CYL8, dark, { x: -0.18, y: 0.56, rz: Math.PI / 2, sx: 0.88, sy: 0.82, sz: 0.88 }),
        part(G_BEV, IRON, { x: -0.2, y: 0.22, z: -0.48, sx: 0.84, sy: 0.28, sz: 0.22 }),
        part(G_BEV, IRON, { x: -0.2, y: 0.22, z: 0.48, sx: 0.84, sy: 0.28, sz: 0.22 }),
        part(G_BEV, hull, { x: -0.2, y: 0.96, sx: 0.58, sy: 0.24, sz: 0.62 }),
        part(G_CONE6, BRASS, { x: 0.6, y: 0.56, rz: -Math.PI / 2, sx: 0.8, sy: 0.96, sz: 0.8 }),
        part(G_TOR, plate, { x: 0.18, y: 0.56, ry: Math.PI / 2, sx: 0.94, sy: 0.94, sz: 0.94 }),
        part(G_CYL6, COPPER, { x: -0.62, y: 0.64, rz: Math.PI / 2, sx: 0.28, sy: 0.24, sz: 0.28 }),
      );
      glow.push(
        part(G_TOR, 0xffffff, { x: 0.46, y: 0.56, ry: Math.PI / 2, sx: 0.56, sy: 0.56, sz: 0.56 }),
        part(G_BOX, 0xffffff, { x: -0.2, y: 1.08, sx: 0.3, sy: 0.08, sz: 0.36 }),
      );
      break;
    case "beacon":
      // Ornate crystal relay shrine with stepped stone plinth, 4 corner buttresses & glowing halo
      body.push(
        part(G_CYL6, dark, { y: 0.28, sx: 0.98, sy: 0.48, sz: 0.98 }),
        part(G_CYL6, BRASS, { y: 0.58, sx: 0.78, sy: 0.12, sz: 0.78 }),
        part(G_CYL6, plate, { y: 1.08, sx: 0.44, sy: 1.02, sz: 0.44 }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4;
          return part(G_BOX, hull, {
            x: Math.cos(a) * 0.44,
            y: 0.68,
            z: Math.sin(a) * 0.44,
            ry: -a,
            rz: -0.2,
            sx: 0.14,
            sy: 0.62,
            sz: 0.14,
          });
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { y: 1.84, sx: 0.46, sy: 0.66, sz: 0.46 }),
        part(G_TOR, 0xffffff, { y: 1.24, rx: Math.PI / 2, sx: 0.88, sy: 0.88, sz: 0.88 }),
      );
      break;
    case "weaver":
      // Charming celestial astrolabe-caster with dual nested rings, floating shoulder runes & glowing core
      body.push(
        part(G_OCT, dark, { y: 0.96, sx: 0.66, sy: 1.08, sz: 0.66 }),
        part(G_CYL6, BRASS, { y: 1.48, sx: 0.38, sy: 0.12, sz: 0.38 }),
        part(G_TOR, plate, { y: 0.96, rx: 0.45, rz: 0.35, sx: 1.1, sy: 1.1, sz: 1.1 }),
        part(G_OCT, hull, { y: 0.96, z: -0.64, sx: 0.2, sy: 0.36, sz: 0.2 }),
        part(G_OCT, hull, { y: 0.96, z: 0.64, sx: 0.2, sy: 0.36, sz: 0.2 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.24, y: 1.04, sx: 0.3, sy: 0.3, sz: 0.3 }),
        part(G_TOR, 0xffffff, { y: 0.96, rx: -0.45, rz: -0.35, sx: 1.16, sy: 1.16, sz: 1.16 }),
        part(G_OCT, 0xffffff, { y: 1.66, sx: 0.2, sy: 0.28, sz: 0.2 }),
      );
      break;
    default:
      body.push(part(G_BEV, hull, { y: 0.5, sx: 0.8, sy: 0.8, sz: 0.8 }));
      glow.push(part(G_OCT, 0xffffff, { x: 0.42, y: 0.6, sx: 0.22, sy: 0.22, sz: 0.22 }));
  }
  return { body: mergeGeometries(body), glow: mergeGeometries(glow) };
}

export function enemyGeometry(type) {
  let cached = enemyGeoCache.get(type);
  if (cached) return cached;
  const def = enemyDefs[type] || { r: 0.6, color: 0xffffff };
  const built = buildEnemyParts(type, def.color);
  // Scale geometry proportionally to enemy's authored base radius so silhouette matches collision feel
  const s = Math.max(0.55, def.r * 1.18);
  built.body.scale(s, s, s);
  built.glow.scale(s, s, s);
  enemyGeoCache.set(type, built);
  return built;
}

// ============================================================================
// ALL 6 MONUMENTAL ARTICULATED BIOME BOSSES
// ============================================================================

export function buildBossModel(type, accentHex = 0xff6644) {
  const group = new Node();
  group.rotation.order = "YZX";
  const bodyMat = worldMaterial({
    surface: enemySurface(type),
    vertexColors: true,
    biomeSkin: true,
  });
  const glowMat = emissiveMaterial({
    color: accentHex,
    emissiveIntensity: 1.18,
    transparent: true,
    opacity: 1,
  });
  const mats = [bodyMat];
  const fadeMats = [bodyMat];
  const spin = [];

  if (type === "warden") {
    // BLACKOUT CITY — Ironclad Lantern-Crested Siege Warden Juggernaut
    const hull = mergeGeometries([
      // Heavy armored boots & pelvis
      part(G_BEV, 0x16222c, { x: 0.08, y: 0.34, z: -0.82, sx: 1.2, sy: 0.68, sz: 0.86 }),
      part(G_BEV, 0x16222c, { x: 0.08, y: 0.34, z: 0.82, sx: 1.2, sy: 0.68, sz: 0.86 }),
      part(G_BEV, 0x1d2b38, { y: 0.96, sx: 1.9, sy: 1.0, sz: 2.25 }),
      part(G_BEV, 0x334d5c, { x: 0.1, y: 1.92, sx: 2.1, sy: 1.32, sz: 2.68 }),
      part(G_BEV, BRASS, { x: 0.96, y: 1.92, sx: 0.4, sy: 0.92, sz: 1.4 }),
      // Towering armored pauldrons with burnished brass trim
      part(G_BEV, 0x263d4a, { y: 2.42, z: -1.58, rx: 0.24, sx: 1.58, sy: 1.06, sz: 0.94 }),
      part(G_BEV, 0x263d4a, { y: 2.42, z: 1.58, rx: -0.24, sx: 1.58, sy: 1.06, sz: 0.94 }),
      part(G_BEV, BRASS, { x: 0.2, y: 2.92, z: -1.58, sx: 1.18, sy: 0.22, sz: 0.72 }),
      part(G_BEV, BRASS, { x: 0.2, y: 2.92, z: 1.58, sx: 1.18, sy: 0.22, sz: 0.72 }),
      // Twin collared arm siege cannons
      part(G_CYL8, IRON, { x: 1.38, y: 1.65, z: -1.5, rz: Math.PI / 2, sx: 0.48, sy: 2.0, sz: 0.48 }),
      part(G_CYL8, IRON, { x: 1.38, y: 1.65, z: 1.5, rz: Math.PI / 2, sx: 0.48, sy: 2.0, sz: 0.48 }),
      part(G_CYL8, BRASS, { x: 2.08, y: 1.65, z: -1.5, rz: Math.PI / 2, sx: 0.56, sy: 0.26, sz: 0.56 }),
      part(G_CYL8, BRASS, { x: 2.08, y: 1.65, z: 1.5, rz: Math.PI / 2, sx: 0.56, sy: 0.26, sz: 0.56 }),
      // Crested sentinel head with brass brow
      part(G_BEV, IVORY, { x: 0.24, y: 2.86, sx: 1.04, sy: 0.74, sz: 1.1 }),
      part(G_BEV, 0x223644, { x: 0.16, y: 3.3, sx: 0.76, sy: 0.22, sz: 0.84 }),
      part(G_CONE6, BRASS, { x: 0.22, y: 3.55, sx: 0.24, sy: 0.42, sz: 0.24 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const glowGeo = mergeGeometries([
      part(G_BOX, 0xffffff, { x: 0.8, y: 2.86, sx: 0.18, sy: 0.22, sz: 0.92 }),
      part(G_OCT, 0xffffff, { x: 1.2, y: 1.9, sx: 0.44, sy: 0.62, sz: 0.68 }),
      part(G_CYL6, 0xffffff, { x: 2.38, y: 1.65, z: -1.5, rz: Math.PI / 2, sx: 0.34, sy: 0.12, sz: 0.34 }),
      part(G_CYL6, 0xffffff, { x: 2.38, y: 1.65, z: 1.5, rz: Math.PI / 2, sx: 0.34, sy: 0.12, sz: 0.34 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));
    // Spinning Warden brass-lantern radar halo behind shoulders
    const halo = addMesh(group, torus(1.42, 0.08, 6, 20), glowMat, { x: -0.65, y: 2.95, ry: Math.PI / 2 });
    spin.push({ m: halo, ax: "x", v: 1.4 });
  } else if (type === "queen") {
    // THE GLOWMARSH — Bioluminescent Mushroom Brood Matriarch
    const hull = mergeGeometries([
      part(G_SPH, 0x1e3c30, { x: -0.45, y: 1.18, sx: 2.6, sy: 1.55, sz: 2.25 }),
      part(G_BEV, 0x305e4a, { x: 0.96, y: 1.42, sx: 1.48, sy: 1.12, sz: 1.65 }),
      // Mandibles & antennae
      part(G_CONE6, 0x5ea27c, { x: 1.88, y: 1.2, z: -0.52, rz: -1.2, sx: 0.28, sy: 0.68, sz: 0.28 }),
      part(G_CONE6, 0x5ea27c, { x: 1.88, y: 1.2, z: 0.52, rz: -1.2, sx: 0.28, sy: 0.68, sz: 0.28 }),
      // Broad sculpted velvety fungal crown carapace + side companion caps
      part(sculptedCap(1.9, 1.08, 313), 0x32946c, { x: -0.25, y: 1.78 }),
      part(sculptedCap(0.68, 0.44, 325), 0x42a87c, { x: -1.05, y: 1.88, z: -0.92 }),
      part(sculptedCap(0.68, 0.44, 331), 0x42a87c, { x: -1.05, y: 1.88, z: 0.92 }),
      // Six splayed chitinous limbs
      ...[-1, 1].flatMap((s) =>
        [-0.75, 0.05, 0.78].map((lx) =>
          part(G_BEV, 0x182b23, { x: lx, y: 0.56, z: s * 1.44, rx: s * 0.55, sx: 0.34, sy: 1.26, sz: 0.34 }),
        ),
      ),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const glowGeo = mergeGeometries([
      part(G_SPH, 0xffffff, { x: -0.95, y: 1.35, z: -0.82, sx: 0.62, sy: 0.52, sz: 0.62 }),
      part(G_SPH, 0xffffff, { x: -0.95, y: 1.35, z: 0.82, sx: 0.62, sy: 0.52, sz: 0.62 }),
      part(G_SPH, 0xffffff, { x: 1.72, y: 1.58, z: -0.42, sx: 0.34, sy: 0.28, sz: 0.34 }),
      part(G_SPH, 0xffffff, { x: 1.72, y: 1.58, z: 0.42, sx: 0.34, sy: 0.28, sz: 0.34 }),
      // Glowing mushroom cap spots
      ...Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * TAU + 0.3;
        return part(G_OCT, 0xffffff, {
          x: -0.25 + Math.cos(a) * 0.96,
          y: 2.52,
          z: Math.sin(a) * 0.96,
          sx: 0.28,
          sy: 0.14,
          sz: 0.28,
        });
      }),
      part(G_TOR, 0xffffff, { x: -0.25, y: 1.84, rx: Math.PI / 2, sx: 2.65, sy: 2.65, sz: 2.65 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));
    const crownMat = worldMaterial({
      color: 0x62e8a8,
      surface: "crystal",
      emissive: 0x1e7850,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 1,
    });
    mats.push(crownMat);
    fadeMats.push(crownMat);
    const crown = addMesh(group, octahedron(0.62), crownMat, { x: -0.25, y: 3.18, sx: 0.9, sy: 1.4, sz: 0.9 });
    spin.push({ m: crown, ax: "y", v: 1.6 });
  } else if (type === "prism") {
    // THE AURORA SHELF — Crystalline Frost Prism Cathedral (rich sapphire facets contrasting crisply against snow)
    const iceMat = worldMaterial({
      surface: "ice",
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      biomeSkin: true,
      userData: { opacity: 0.9 },
    });
    mats.push(iceMat);
    fadeMats.push(iceMat);
    const coreCrystal = mergeGeometries([
      part(sculptedCrystal(1.9, 3.6, 1.9, 411), 0x184b7a, { y: 0.35 }),
      part(G_OCT, 0x307eb4, { y: 2.15, sx: 1.85, sy: 2.45, sz: 1.85 }),
      part(G_OCT, 0x86cceb, { y: 3.65, sx: 0.72, sy: 1.05, sz: 0.72 }),
    ]);
    group.add(new MeshNode(coreCrystal, iceMat));
    const ringA = new Node();
    ringA.position.set(0, 2.0, 0);
    const ringAGeo = mergeGeometries(
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU;
        return part(sculptedCrystal(0.56, 1.5, 0.56, 420 + i), i % 2 ? 0x226094 : 0x4298c8, {
          x: Math.cos(a) * 1.92,
          y: -0.5,
          z: Math.sin(a) * 1.92,
          ry: a,
          rz: 0.28,
        });
      }),
    );
    ringA.add(new MeshNode(ringAGeo, bodyMat));
    group.add(ringA);
    spin.push({ m: ringA, ax: "y", v: 1.1 });

    const ringB = addMesh(group, torus(1.95, 0.08, 6, 24), glowMat, { y: 2.0, rx: 0.52 });
    spin.push({ m: ringB, ax: "z", v: -1.45 });
    addMesh(group, octahedron(0.82), glowMat, { y: 2.05, sx: 1, sy: 1.5, sz: 1 });
  } else if (type === "core") {
    // THE SHATTERED CORE — Final Boss: Abyssal Rift Astrolabe Sovereign
    const plinth = mergeGeometries([
      part(G_OCT, 0x221942, { y: 2.4, sx: 1.95, sy: 2.35, sz: 1.95 }),
      ...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * TAU;
        return part(sculptedCrystal(0.75, 2.25, 0.75, 510 + i), 0x45397a, {
          x: Math.cos(a) * 1.65,
          y: 0.95,
          z: Math.sin(a) * 1.65,
          ry: a,
        });
      }),
    ]);
    group.add(new MeshNode(plinth, bodyMat));
    const heartMat = worldMaterial({
      color: 0xa664f0,
      surface: "crystal",
      emissive: 0x581e98,
      emissiveIntensity: 0.72,
      transparent: true,
      opacity: 1,
    });
    mats.push(heartMat);
    fadeMats.push(heartMat);
    const heart = addMesh(group, icosahedron(0.95, 1), heartMat, { y: 2.4 });
    spin.push({ m: heart, ax: "y", v: 1.2 });

    const r1 = addMesh(group, torus(1.85, 0.11, 6, 28), glowMat, { y: 2.4, rx: 0.55 });
    const r2 = addMesh(group, torus(2.38, 0.09, 6, 28), worldMaterial({ color: BRASS, surface: "metal" }), {
      y: 2.4,
      rz: 0.85,
    });
    const r3 = addMesh(group, torus(2.82, 0.07, 6, 30), glowMat, { y: 2.4, rx: -0.68 });
    spin.push({ m: r1, ax: "y", v: 1.5 }, { m: r2, ax: "x", v: -1.1 }, { m: r3, ax: "z", v: 0.9 });
  } else if (type === "tyrant") {
    // ASHFALL CALDERA — Volcanic Basalt Furnace Titan with grille ribs, anvil pauldrons & horned crown
    const hull = mergeGeometries([
      part(G_BEV, 0x221517, { x: 0.06, y: 0.34, z: -0.84, sx: 1.24, sy: 0.68, sz: 0.9 }),
      part(G_BEV, 0x221517, { x: 0.06, y: 0.34, z: 0.84, sx: 1.24, sy: 0.68, sz: 0.9 }),
      part(G_BEV, 0x2a1c1e, { y: 0.98, sx: 2.05, sy: 1.05, sz: 2.35 }),
      part(G_BEV, 0x452626, { x: 0.12, y: 2.0, sx: 2.25, sy: 1.48, sz: 2.75 }),
      // Dark furnace cage bars across the glowing chest hearth
      part(G_BOX, 0x221517, { x: 1.32, y: 2.0, z: -0.28, sx: 0.18, sy: 1.02, sz: 0.14 }),
      part(G_BOX, 0x221517, { x: 1.32, y: 2.0, z: 0.28, sx: 0.18, sy: 1.02, sz: 0.14 }),
      part(G_BOX, 0x221517, { x: 1.32, y: 2.0, sx: 0.18, sy: 0.16, sz: 1.22 }),
      // Towering obsidian-horn shoulders
      part(sculptedCrystal(1.18, 2.2, 1.18, 601), 0x351e20, { x: -0.1, y: 2.1, z: -1.58, rx: -0.4 }),
      part(sculptedCrystal(1.18, 2.2, 1.18, 602), 0x351e20, { x: -0.1, y: 2.1, z: 1.58, rx: 0.4 }),
      // Heavy forged siege gauntlets
      part(G_BEV, 0x5c322c, { x: 1.18, y: 1.38, z: -1.52, sx: 1.34, sy: 0.94, sz: 0.94 }),
      part(G_BEV, 0x5c322c, { x: 1.18, y: 1.38, z: 1.52, sx: 1.34, sy: 0.94, sz: 0.94 }),
      // Horned forge helm
      part(G_BEV, 0x2d1a1c, { x: 0.35, y: 2.98, sx: 1.14, sy: 0.84, sz: 1.14 }),
      part(G_CONE6, BRASS, { x: 0.56, y: 3.42, z: -0.56, rx: -0.42, rz: -0.35, sx: 0.28, sy: 0.68, sz: 0.28 }),
      part(G_CONE6, BRASS, { x: 0.56, y: 3.42, z: 0.56, rx: 0.42, rz: -0.35, sx: 0.28, sy: 0.68, sz: 0.28 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const forgeGlow = mergeGeometries([
      part(G_SPH, 0xffffff, { x: 1.1, y: 2.0, sx: 0.88, sy: 0.92, sz: 1.06 }),
      part(G_BOX, 0xffffff, { x: 0.95, y: 3.0, sx: 0.16, sy: 0.24, sz: 0.84 }),
      part(G_OCT, 0xffffff, { x: 1.78, y: 1.38, z: -1.52, sx: 0.46, sy: 0.46, sz: 0.46 }),
      part(G_OCT, 0xffffff, { x: 1.78, y: 1.38, z: 1.52, sx: 0.46, sy: 0.46, sz: 0.46 }),
    ]);
    group.add(new MeshNode(forgeGlow, glowMat));
    const crown = addMesh(group, torus(1.22, 0.09, 6, 20), glowMat, { y: 3.6, rx: Math.PI / 2 });
    spin.push({ m: crown, ax: "z", v: 1.3 });
  } else {
    // THE GLASS FLATS — Articulated Vitrified Glasswyrm Leviathan (burnished terracotta-bronze scales + jewel turquoise crests)
    const head = mergeGeometries([
      part(G_BEV, 0x623b24, { x: 0.55, y: 1.15, sx: 1.88, sy: 1.12, sz: 1.52 }),
      part(G_BEV, BRASS, { x: 0.72, y: 1.56, sx: 1.12, sy: 0.24, sz: 1.08 }),
      part(sculptedCrystal(0.95, 1.9, 0.72, 701), 0x20a094, { x: -0.1, y: 1.35, z: -0.82, rx: -0.45, rz: 0.32 }),
      part(sculptedCrystal(0.95, 1.9, 0.72, 702), 0x20a094, { x: -0.1, y: 1.35, z: 0.82, rx: 0.45, rz: 0.32 }),
      part(G_CONE6, 0x8a5b32, { x: 1.68, y: 1.06, rz: -Math.PI / 2, sx: 0.86, sy: 1.14, sz: 0.96 }),
      // Fierce bronze mandibles
      part(G_CONE6, BRASS, { x: 1.54, y: 0.88, z: -0.54, rz: -1.35, sx: 0.24, sy: 0.62, sz: 0.24 }),
      part(G_CONE6, BRASS, { x: 1.54, y: 0.88, z: 0.54, rz: -1.35, sx: 0.24, sy: 0.62, sz: 0.24 }),
    ]);
    group.add(new MeshNode(head, bodyMat));
    const eyes = mergeGeometries([
      part(G_OCT, 0xffffff, { x: 1.28, y: 1.36, z: -0.58, sx: 0.38, sy: 0.24, sz: 0.26 }),
      part(G_OCT, 0xffffff, { x: 1.28, y: 1.36, z: 0.58, sx: 0.38, sy: 0.24, sz: 0.26 }),
      part(G_OCT, 0xffffff, { x: 0.35, y: 2.04, sx: 0.48, sy: 0.66, sz: 0.48 }),
    ]);
    group.add(new MeshNode(eyes, glowMat));

    // Articulated undulating armored tail segments
    const tail = [];
    for (let i = 1; i <= 5; i++) {
      const sc = 1 - i * 0.13;
      const seg = new Node();
      seg.position.set(-i * 0.95, 0.95 - i * 0.06, 0);
      const segGeo = mergeGeometries([
        part(G_BEV, i % 2 ? 0x704328 : 0x482c1d, { sx: 0.98 * sc, sy: 0.94 * sc, sz: 1.32 * sc }),
        part(sculptedCrystal(0.46 * sc, 1.15 * sc, 0.46 * sc, 710 + i), 0x26aea2, { y: 0.38 * sc }),
      ]);
      seg.add(new MeshNode(segGeo, bodyMat));
      seg.add(
        new MeshNode(part(G_OCT, 0xffffff, { y: 0.74 * sc, sx: 0.26 * sc, sy: 0.34 * sc, sz: 0.26 * sc }), glowMat),
      );
      group.add(seg);
      tail.push({ m: seg, z: 0, i });
    }
    group.userData.tail = tail;
  }

  group.userData.fadeMats = fadeMats;
  return { group, mats, glowMat, spin };
}

// ============================================================================
// SHARED COMBAT KIT GEOMETRIES
// ============================================================================

export function wingDroneGeometry() {
  return mergeGeometries([
    part(G_OCT, IVORY, { y: 0.85, sx: 0.45, sy: 0.26, sz: 0.38 }),
    part(G_BEV, BRASS, { x: -0.08, y: 0.85, z: -0.26, ry: 0.35, sx: 0.38, sy: 0.08, sz: 0.24 }),
    part(G_BEV, BRASS, { x: -0.08, y: 0.85, z: 0.26, ry: -0.35, sx: 0.38, sy: 0.08, sz: 0.24 }),
  ]);
}

export function orbitBladeGeometry() {
  return mergeGeometries([
    part(G_OCT, IVORY, { y: 0.62, sx: 0.72, sy: 0.12, sz: 0.34 }),
    part(G_BEV, BRASS, { x: -0.18, y: 0.62, sx: 0.32, sy: 0.14, sz: 0.18 }),
  ]);
}

export function rocketProjectileGeometry() {
  return mergeGeometries([
    part(G_CYL8, IVORY, { rz: Math.PI / 2, sx: 0.22, sy: 0.68, sz: 0.22 }),
    part(G_CONE6, FINISH.vermilion, { x: 0.42, rz: -Math.PI / 2, sx: 0.22, sy: 0.26, sz: 0.22 }),
    part(G_BEV, SLATE, { x: -0.28, sx: 0.2, sy: 0.06, sz: 0.42 }),
    part(G_BEV, SLATE, { x: -0.28, sx: 0.2, sy: 0.42, sz: 0.06 }),
  ]);
}

export function discGeometry() {
  return mergeGeometries([
    part(torus(0.75, 0.14, 5, 16), IVORY, { rx: Math.PI / 2 }),
    part(cylinder(0.45, 0.45, 0.12, 8), BRASS, {}),
  ]);
}

export function shardGeometry() {
  return octahedron(0.32).scale(0.85, 1.45, 0.85);
}

export function healCrossGeometry() {
  return mergeGeometries([
    part(G_BEV, 0x72ffbe, { sx: 0.56, sy: 0.18, sz: 0.18 }),
    part(G_BEV, 0x72ffbe, { sx: 0.18, sy: 0.56, sz: 0.18 }),
    part(G_BEV, 0x72ffbe, { sx: 0.18, sy: 0.18, sz: 0.56 }),
  ]);
}

export function shieldArcGeometry() {
  // Seamless curved energy buckler with brighter top/bottom energy rims (zero overlapping seams)
  const segs = 16;
  const rows = 4;
  const r = 1.24;
  const y0 = 0.24;
  const h = 1.24;
  const pos = [];
  const norm = [];
  const uv = [];
  const col = [];
  const idx = [];
  for (let ry = 0; ry <= rows; ry++) {
    const v = ry / rows;
    const y = y0 + v * h;
    const bulge = 1 + Math.sin(v * Math.PI) * 0.06;
    const edgeGlow = ry === 0 || ry === rows ? 1.0 : 0.72;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = -0.84 + u * 1.68;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      pos.push(ca * r * bulge, y, sa * r * bulge);
      norm.push(ca, 0, sa);
      uv.push(u, v);
      const sideGlow = i === 0 || i === segs ? 1.0 : edgeGlow;
      col.push(sideGlow * 0.86, sideGlow * 0.96, sideGlow);
    }
  }
  const stride = segs + 1;
  for (let ry = 0; ry < rows; ry++) {
    for (let i = 0; i < segs; i++) {
      const a = ry * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return new Geometry(pos, norm, uv, idx, col);
}

export function debrisGeometry() {
  return octahedron(0.5);
}
