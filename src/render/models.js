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
  const glowMat = emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.55 });
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
  const visorMat = emissiveMaterial({ color: weaponColor, emissiveIntensity: 1.65 });

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

  // Pelvis & stylized heroic torso chassis (clean ivory + teal-slate + brass trim)
  const torsoGeo = mergeGeometries([
    part(G_BEV, SLATE, { y: 0.66, sx: 0.44, sy: 0.22, sz: 0.52 }),
    part(G_BEV, IVORY, { x: 0.03, y: 0.96, sx: 0.54, sy: 0.46, sz: 0.64 }),
    // Sculpted shoulder pauldrons
    part(G_BEV, SLATE, { x: 0.0, y: 1.08, z: -0.42, rx: 0.22, sx: 0.42, sy: 0.24, sz: 0.28 }),
    part(G_BEV, SLATE, { x: 0.0, y: 1.08, z: 0.42, rx: -0.22, sx: 0.42, sy: 0.24, sz: 0.28 }),
    // Backpack thruster cowl & brass trim collar
    part(G_BEV, IRON, { x: -0.32, y: 0.96, sx: 0.26, sy: 0.42, sz: 0.42 }),
    part(G_BEV, BRASS, { x: 0.08, y: 1.2, sx: 0.38, sy: 0.09, sz: 0.46 }),
  ]);
  base.add(new MeshNode(torsoGeo, armorMat));

  // Back thruster vents glow
  const thrusterGeo = mergeGeometries([
    part(G_OCT, weaponColor, { x: -0.46, y: 0.88, z: -0.12, sx: 0.12, sy: 0.16, sz: 0.12 }),
    part(G_OCT, weaponColor, { x: -0.46, y: 0.88, z: 0.12, sx: 0.12, sy: 0.16, sz: 0.12 }),
  ]);
  base.add(new MeshNode(thrusterGeo, emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.45 })));

  // Weapon bearing pivot on torso + independent horizontal turret mounted on group so aim never drifts with lean/bank
  const weaponMount = new Node();
  weaponMount.position.set(0.04, 1.32, 0);
  base.add(weaponMount);

  const turret = new Node();
  turret.position.set(0.04, 1.32, 0);
  group.add(turret);

  const headGeo = mergeGeometries([
    part(G_BEV, IVORY, { x: 0.04, y: 0.06, sx: 0.42, sy: 0.3, sz: 0.38 }),
    part(G_BEV, SLATE, { x: -0.06, y: 0.18, sx: 0.34, sy: 0.12, sz: 0.32 }),
    // Side weapon mount arm connecting bearing to gun
    part(G_BEV, BRASS, { x: 0.12, y: -0.14, z: 0.28, sx: 0.24, sy: 0.16, sz: 0.24 }),
  ]);
  turret.add(new MeshNode(headGeo, armorMat));
  // Expressive glowing panoramic visor
  addMesh(turret, box(0.12, 0.11, 0.34), visorMat, { x: 0.22, y: 0.07 });

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
  const dark = 0x222a38;
  const hull = 0x455568;
  const plate = 0xd8cdb8;
  const body = [];
  const glow = [];

  switch (type) {
    case "swarmer":
      // Sleek razor-winged darting insectoid
      body.push(
        part(G_OCT, accent, { y: 0.42, sx: 0.95, sy: 0.45, sz: 0.58 }),
        part(G_BEV, dark, { x: -0.1, y: 0.46, z: -0.34, ry: 0.45, sx: 0.5, sy: 0.08, sz: 0.34 }),
        part(G_BEV, dark, { x: -0.1, y: 0.46, z: 0.34, ry: -0.45, sx: 0.5, sy: 0.08, sz: 0.34 }),
      );
      glow.push(part(G_OCT, 0xffffff, { x: 0.38, y: 0.44, sx: 0.24, sy: 0.18, sz: 0.24 }));
      break;
    case "mite":
      // Tiny spiked skittering broodling
      body.push(
        part(G_SPH, accent, { y: 0.26, sx: 0.68, sy: 0.42, sz: 0.56 }),
        part(G_CONE6, plate, { x: 0.28, y: 0.24, z: -0.14, rz: -1.1, sx: 0.14, sy: 0.26, sz: 0.14 }),
        part(G_CONE6, plate, { x: 0.28, y: 0.24, z: 0.14, rz: -1.1, sx: 0.14, sy: 0.26, sz: 0.14 }),
      );
      glow.push(part(G_OCT, 0xffffff, { x: 0.24, y: 0.32, sx: 0.2, sy: 0.16, sz: 0.22 }));
      break;
    case "grunt":
      // Hunched armored vanguard trooper with crested helm
      body.push(
        part(G_BEV, dark, { y: 0.34, sx: 0.62, sy: 0.46, sz: 0.66 }),
        part(G_BEV, hull, { x: 0.04, y: 0.72, sx: 0.68, sy: 0.48, sz: 0.74 }),
        part(G_BEV, accent, { x: 0.08, y: 1.04, sx: 0.42, sy: 0.26, sz: 0.4 }),
      );
      glow.push(part(G_BOX, 0xffffff, { x: 0.34, y: 0.96, sx: 0.12, sy: 0.12, sz: 0.34 }));
      break;
    case "gunner":
      // Boxy tripod-shouldered plasma trooper with twin arm barrels
      body.push(
        part(G_CYL8, dark, { y: 0.34, sx: 0.62, sy: 0.52, sz: 0.62 }),
        part(G_BEV, hull, { y: 0.78, sx: 0.72, sy: 0.5, sz: 0.86 }),
        part(G_CYL6, IRON, { x: 0.48, y: 0.76, z: -0.34, rz: Math.PI / 2, sx: 0.16, sy: 0.66, sz: 0.16 }),
        part(G_CYL6, IRON, { x: 0.48, y: 0.76, z: 0.34, rz: Math.PI / 2, sx: 0.16, sy: 0.66, sz: 0.16 }),
        part(G_BEV, accent, { x: -0.06, y: 1.12, sx: 0.44, sy: 0.24, sz: 0.5 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.38, y: 0.98, sx: 0.1, sy: 0.12, sz: 0.42 }),
        part(G_OCT, 0xffffff, { x: 0.82, y: 0.76, z: -0.34, sx: 0.14, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: 0.82, y: 0.76, z: 0.34, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      break;
    case "bomber":
      // Bulbous volatile-core walking mine with exposed glowing reactor belly
      body.push(
        part(G_SPH, dark, { y: 0.64, sx: 0.96, sy: 0.86, sz: 0.96 }),
        part(G_TOR, plate, { y: 0.66, rx: Math.PI / 2, sx: 1.02, sy: 1.02, sz: 1.02 }),
        part(G_BEV, IRON, { y: 0.18, z: -0.36, sx: 0.24, sy: 0.34, sz: 0.2 }),
        part(G_BEV, IRON, { y: 0.18, z: 0.36, sx: 0.24, sy: 0.34, sz: 0.2 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.12, y: 0.68, sx: 0.66, sy: 0.66, sz: 0.66 }),
        part(G_OCT, 0xffffff, { y: 1.18, sx: 0.28, sy: 0.34, sz: 0.28 }),
      );
      break;
    case "splitter":
      // Twin-lobed crystalline/organic mitosis pod
      body.push(
        part(G_SPH, hull, { y: 0.56, z: -0.26, sx: 0.74, sy: 0.78, sz: 0.64 }),
        part(G_SPH, hull, { y: 0.56, z: 0.26, sx: 0.74, sy: 0.78, sz: 0.64 }),
        part(G_BEV, accent, { y: 0.86, sx: 0.54, sy: 0.34, sz: 0.78 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.28, y: 0.6, z: -0.26, sx: 0.24, sy: 0.28, sz: 0.24 }),
        part(G_OCT, 0xffffff, { x: 0.28, y: 0.6, z: 0.26, sx: 0.24, sy: 0.28, sz: 0.24 }),
      );
      break;
    case "brute":
      // Huge broad-shouldered horned juggernaut ram
      body.push(
        part(G_BEV, dark, { y: 0.45, sx: 0.95, sy: 0.65, sz: 1.15 }),
        part(G_BEV, hull, { x: 0.08, y: 1.05, sx: 1.12, sy: 0.76, sz: 1.38 }),
        part(G_BEV, plate, { x: 0.12, y: 1.24, z: -0.68, rx: 0.25, sx: 0.78, sy: 0.46, sz: 0.42 }),
        part(G_BEV, plate, { x: 0.12, y: 1.24, z: 0.68, rx: -0.25, sx: 0.78, sy: 0.46, sz: 0.42 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 1.36, z: -0.42, rz: -1.0, sx: 0.24, sy: 0.56, sz: 0.24 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 1.36, z: 0.42, rz: -1.0, sx: 0.24, sy: 0.56, sz: 0.24 }),
      );
      glow.push(part(G_BOX, 0xffffff, { x: 0.66, y: 1.12, sx: 0.14, sy: 0.2, sz: 0.62 }));
      break;
    case "sniper":
      // Tall slender long-barrel marksman spire
      body.push(
        part(G_CYL6, dark, { y: 0.52, sx: 0.5, sy: 0.96, sz: 0.5 }),
        part(G_BEV, hull, { y: 1.12, sx: 0.58, sy: 0.46, sz: 0.52 }),
        part(G_CYL6, plate, { x: 0.76, y: 1.12, rz: Math.PI / 2, sx: 0.12, sy: 1.28, sz: 0.12 }),
        part(G_BEV, accent, { x: -0.16, y: 1.44, sx: 0.34, sy: 0.32, sz: 0.26 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.36, y: 1.22, sx: 0.22, sy: 0.22, sz: 0.22 }),
        part(G_BOX, 0xffffff, { x: 0.85, y: 1.18, sx: 0.75, sy: 0.05, sz: 0.05 }),
      );
      break;
    case "hive":
      // Towering organic/mechanical brood nest spire
      body.push(
        part(G_CYL8, dark, { y: 0.35, sx: 1.25, sy: 0.62, sz: 1.25 }),
        part(sculptedCap(0.86, 0.78, 71), hull, { y: 0.58 }),
        part(sculptedCap(0.56, 0.55, 79), accent, { y: 1.18 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { y: 0.92, sx: 0.52, sy: 0.36, sz: 0.52 }),
        part(G_OCT, 0xffffff, { y: 1.66, sx: 0.3, sy: 0.42, sz: 0.3 }),
      );
      break;
    case "bulwark":
      // Heavy fortress walker bearing a broad curved riot-aegis front plate
      body.push(
        part(G_BEV, dark, { x: -0.1, y: 0.5, sx: 0.86, sy: 0.72, sz: 0.96 }),
        part(G_BEV, hull, { x: -0.05, y: 1.05, sx: 0.88, sy: 0.56, sz: 1.02 }),
        part(G_BEV, plate, { x: 0.58, y: 0.78, sx: 0.22, sy: 1.24, sz: 1.28 }),
        part(G_BEV, BRASS, { x: 0.66, y: 0.78, sx: 0.12, sy: 0.82, sz: 0.34 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.72, y: 0.78, sx: 0.08, sy: 0.96, sz: 0.14 }),
        part(G_BOX, 0xffffff, { x: 0.36, y: 1.28, sx: 0.14, sy: 0.12, sz: 0.46 }),
      );
      break;
    case "striker":
      // Razor-sharp swept-wing assassin blade silhouette
      body.push(
        part(G_OCT, dark, { y: 0.78, sx: 1.1, sy: 0.52, sz: 0.6 }),
        part(G_BEV, plate, { x: 0.1, y: 0.8, z: -0.52, ry: 0.55, sx: 0.92, sy: 0.1, sz: 0.28 }),
        part(G_BEV, plate, { x: 0.1, y: 0.8, z: 0.52, ry: -0.55, sx: 0.92, sy: 0.1, sz: 0.28 }),
      );
      glow.push(part(G_OCT, 0xffffff, { x: 0.48, y: 0.82, sx: 0.32, sy: 0.2, sz: 0.26 }));
      break;
    case "mortar":
      // Squat armored artillery spider with elevated angled howitzer tube
      body.push(
        part(G_CYL8, dark, { y: 0.32, sx: 1.12, sy: 0.48, sz: 1.12 }),
        part(G_BEV, hull, { y: 0.7, sx: 0.86, sy: 0.42, sz: 0.86 }),
        part(G_CYL8, plate, { x: 0.18, y: 1.12, rz: -0.42, sx: 0.48, sy: 0.88, sz: 0.48 }),
        part(G_TOR, BRASS, { x: 0.36, y: 1.48, rz: -0.42, rx: Math.PI / 2, sx: 0.58, sy: 0.58, sz: 0.58 }),
      );
      glow.push(part(G_SPH, 0xffffff, { x: 0.34, y: 1.48, sx: 0.32, sy: 0.32, sz: 0.32 }));
      break;
    case "mender":
      // Floating clerical/medic obelisk with glowing orbital halo & cross crest
      body.push(
        part(G_OCT, plate, { y: 0.88, sx: 0.64, sy: 1.1, sz: 0.64 }),
        part(G_TOR, hull, { y: 0.92, rx: Math.PI / 2, sx: 1.05, sy: 1.05, sz: 1.05 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { y: 1.56, sx: 0.12, sy: 0.42, sz: 0.12 }),
        part(G_BOX, 0xffffff, { y: 1.56, sx: 0.12, sy: 0.12, sz: 0.42 }),
        part(G_TOR, 0xffffff, { y: 0.92, rx: Math.PI / 2, sx: 1.12, sy: 1.12, sz: 1.12 }),
      );
      break;
    case "leaper":
      // Coiled spring-legged predator hound crouched to pounce
      body.push(
        part(G_BEV, hull, { x: 0.08, y: 0.62, rz: -0.22, sx: 0.92, sy: 0.42, sz: 0.56 }),
        part(G_BEV, dark, { x: -0.32, y: 0.34, z: -0.32, rz: 0.4, sx: 0.24, sy: 0.62, sz: 0.2 }),
        part(G_BEV, dark, { x: -0.32, y: 0.34, z: 0.32, rz: 0.4, sx: 0.24, sy: 0.62, sz: 0.2 }),
        part(G_CONE6, plate, { x: 0.56, y: 0.68, rz: -Math.PI / 2, sx: 0.36, sy: 0.44, sz: 0.36 }),
      );
      glow.push(part(G_BOX, 0xffffff, { x: 0.52, y: 0.78, sx: 0.14, sy: 0.12, sz: 0.34 }));
      break;
    case "turret":
      // Fortified armored bunker pedestal with twin heavy rotary cannons
      body.push(
        part(G_CYL8, dark, { y: 0.28, sx: 1.18, sy: 0.46, sz: 1.18 }),
        part(G_BEV, hull, { y: 0.84, sx: 0.84, sy: 0.56, sz: 0.84 }),
        part(G_CYL6, plate, { x: 0.62, y: 0.88, z: -0.22, rz: Math.PI / 2, sx: 0.18, sy: 0.84, sz: 0.18 }),
        part(G_CYL6, plate, { x: 0.62, y: 0.88, z: 0.22, rz: Math.PI / 2, sx: 0.18, sy: 0.84, sz: 0.18 }),
      );
      glow.push(part(G_BOX, 0xffffff, { x: 0.44, y: 1.02, sx: 0.12, sy: 0.18, sz: 0.54 }));
      break;
    case "charger":
      // Low-slung wedge battering-ram chariot with jet thrusters
      body.push(
        part(G_CONE6, plate, { x: 0.26, y: 0.52, rz: -Math.PI / 2, sx: 0.86, sy: 1.12, sz: 0.96 }),
        part(G_BEV, dark, { x: -0.34, y: 0.46, sx: 0.56, sy: 0.56, sz: 0.92 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: -0.62, y: 0.48, sx: 0.14, sy: 0.32, sz: 0.62 }),
        part(G_OCT, 0xffffff, { x: 0.62, y: 0.58, sx: 0.22, sy: 0.22, sz: 0.22 }),
      );
      break;
    case "minebot":
      // Flat octagonal spider-layer carrying glowing ordinance dome
      body.push(
        part(G_CYL8, dark, { y: 0.26, sx: 0.98, sy: 0.32, sz: 0.98 }),
        part(G_BEV, hull, { y: 0.54, sx: 0.72, sy: 0.3, sz: 0.72 }),
        part(G_TOR, BRASS, { y: 0.54, rx: Math.PI / 2, sx: 0.86, sy: 0.86, sz: 0.86 }),
      );
      glow.push(part(G_SPH, 0xffffff, { y: 0.78, sx: 0.4, sy: 0.28, sz: 0.4 }));
      break;
    case "sapper":
      // Agile demolition grenadier with glowing charge pack
      body.push(
        part(G_BEV, dark, { y: 0.44, sx: 0.58, sy: 0.56, sz: 0.62 }),
        part(G_BEV, hull, { x: 0.08, y: 0.88, sx: 0.54, sy: 0.42, sz: 0.66 }),
        part(G_CYL6, COPPER, { x: -0.28, y: 0.84, sx: 0.34, sy: 0.52, sz: 0.46 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.36, y: 0.94, sx: 0.1, sy: 0.12, sz: 0.36 }),
        part(G_OCT, 0xffffff, { x: -0.32, y: 1.18, sx: 0.24, sy: 0.24, sz: 0.24 }),
      );
      break;
    case "phantom":
      // Tall hooded spectral wraith with floating cowl and trailing mantle
      body.push(
        part(G_CONE6, dark, { y: 0.72, sx: 0.78, sy: 1.24, sz: 0.78 }),
        part(G_OCT, hull, { y: 1.38, sx: 0.56, sy: 0.62, sz: 0.56 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.24, y: 1.36, sx: 0.24, sy: 0.26, sz: 0.32 }),
        part(G_TOR, 0xffffff, { y: 0.5, rx: Math.PI / 2, sx: 0.92, sy: 0.92, sz: 0.92 }),
      );
      break;
    case "sentinel":
      // Floating monolithic beam-eye obelisk flanked by twin focusing fins
      body.push(
        part(G_BEV, dark, { y: 0.96, sx: 0.64, sy: 1.18, sz: 0.64 }),
        part(G_BEV, plate, { y: 1.0, z: -0.52, sx: 0.46, sy: 0.96, sz: 0.16 }),
        part(G_BEV, plate, { y: 1.0, z: 0.52, sx: 0.46, sy: 0.96, sz: 0.16 }),
      );
      glow.push(part(G_SPH, 0xffffff, { x: 0.3, y: 1.04, sx: 0.42, sy: 0.42, sz: 0.42 }));
      break;
    case "carrier":
      // Broad hovering drone-mothership catamaran hull
      body.push(
        part(G_BEV, dark, { y: 0.88, sx: 1.24, sy: 0.44, sz: 1.46 }),
        part(G_BEV, hull, { x: 0.1, y: 1.18, sx: 0.88, sy: 0.34, sz: 0.82 }),
        part(G_BEV, plate, { x: 0.15, y: 0.88, z: -0.78, sx: 1.1, sy: 0.32, sz: 0.26 }),
        part(G_BEV, plate, { x: 0.15, y: 0.88, z: 0.78, sx: 1.1, sy: 0.32, sz: 0.26 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.64, y: 0.88, sx: 0.12, sy: 0.2, sz: 0.92 }),
        part(G_OCT, 0xffffff, { y: 1.45, sx: 0.36, sy: 0.28, sz: 0.36 }),
      );
      break;
    case "drone":
      // Compact sleek hovering striker-orb with delta wingtips
      body.push(
        part(G_SPH, hull, { y: 0.88, sx: 0.56, sy: 0.48, sz: 0.56 }),
        part(G_BEV, plate, { y: 0.88, z: -0.38, sx: 0.38, sy: 0.1, sz: 0.36 }),
        part(G_BEV, plate, { y: 0.88, z: 0.38, sx: 0.38, sy: 0.1, sz: 0.36 }),
      );
      glow.push(part(G_OCT, 0xffffff, { x: 0.28, y: 0.88, sx: 0.22, sy: 0.22, sz: 0.22 }));
      break;
    case "driller":
      // Armored subterranean burrower with massive conical spiral drill nose
      body.push(
        part(G_CYL8, dark, { x: -0.18, y: 0.56, rz: Math.PI / 2, sx: 0.88, sy: 0.82, sz: 0.88 }),
        part(G_CONE6, BRASS, { x: 0.58, y: 0.56, rz: -Math.PI / 2, sx: 0.78, sy: 0.92, sz: 0.78 }),
        part(G_TOR, plate, { x: 0.18, y: 0.56, ry: Math.PI / 2, sx: 0.92, sy: 0.92, sz: 0.92 }),
      );
      glow.push(part(G_TOR, 0xffffff, { x: 0.46, y: 0.56, ry: Math.PI / 2, sx: 0.56, sy: 0.56, sz: 0.56 }));
      break;
    case "beacon":
      // Tall crystalline relay pylon pulsing with rally aura rings
      body.push(
        part(G_CYL6, dark, { y: 0.34, sx: 0.94, sy: 0.54, sz: 0.94 }),
        part(G_CYL6, plate, { y: 1.05, sx: 0.44, sy: 1.1, sz: 0.44 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { y: 1.82, sx: 0.44, sy: 0.64, sz: 0.44 }),
        part(G_TOR, 0xffffff, { y: 1.24, rx: Math.PI / 2, sx: 0.86, sy: 0.86, sz: 0.86 }),
      );
      break;
    case "weaver":
      // Ornate geometric astral caster with orbiting arcane ring
      body.push(
        part(G_OCT, dark, { y: 0.96, sx: 0.64, sy: 1.06, sz: 0.64 }),
        part(G_TOR, plate, { y: 0.96, rx: 0.45, rz: 0.35, sx: 1.08, sy: 1.08, sz: 1.08 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.24, y: 1.02, sx: 0.3, sy: 0.3, sz: 0.3 }),
        part(G_TOR, 0xffffff, { y: 0.96, rx: -0.45, rz: -0.35, sx: 1.15, sy: 1.15, sz: 1.15 }),
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
    emissiveIntensity: 1.75,
    transparent: true,
    opacity: 1,
  });
  const mats = [bodyMat];
  const fadeMats = [bodyMat];
  const spin = [];

  if (type === "warden") {
    // BLACKOUT CITY — Ironclad Siege Warden Juggernaut
    const hull = mergeGeometries([
      part(G_BEV, 0x1d2b38, { y: 0.72, sx: 1.9, sy: 1.25, sz: 2.2 }),
      part(G_BEV, 0x334d5c, { x: 0.1, y: 1.88, sx: 2.1, sy: 1.35, sz: 2.65 }),
      // Towering armored pauldrons with brass chevron trim
      part(G_BEV, 0x263d4a, { y: 2.38, z: -1.55, rx: 0.24, sx: 1.55, sy: 1.05, sz: 0.92 }),
      part(G_BEV, 0x263d4a, { y: 2.38, z: 1.55, rx: -0.24, sx: 1.55, sy: 1.05, sz: 0.92 }),
      part(G_BEV, BRASS, { x: 0.2, y: 2.86, z: -1.55, sx: 1.15, sy: 0.22, sz: 0.7 }),
      part(G_BEV, BRASS, { x: 0.2, y: 2.86, z: 1.55, sx: 1.15, sy: 0.22, sz: 0.7 }),
      // Twin heavy arm siege cannons
      part(G_CYL8, IRON, { x: 1.35, y: 1.65, z: -1.48, rz: Math.PI / 2, sx: 0.48, sy: 1.95, sz: 0.48 }),
      part(G_CYL8, IRON, { x: 1.35, y: 1.65, z: 1.48, rz: Math.PI / 2, sx: 0.48, sy: 1.95, sz: 0.48 }),
      // Crested sentinel head
      part(G_BEV, IVORY, { x: 0.24, y: 2.82, sx: 1.0, sy: 0.72, sz: 1.08 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const glowGeo = mergeGeometries([
      part(G_BOX, 0xffffff, { x: 0.78, y: 2.84, sx: 0.18, sy: 0.22, sz: 0.92 }),
      part(G_OCT, 0xffffff, { x: 1.16, y: 1.85, sx: 0.44, sy: 0.62, sz: 0.68 }),
      part(G_CYL6, 0xffffff, { x: 2.34, y: 1.65, z: -1.48, rz: Math.PI / 2, sx: 0.34, sy: 0.12, sz: 0.34 }),
      part(G_CYL6, 0xffffff, { x: 2.34, y: 1.65, z: 1.48, rz: Math.PI / 2, sx: 0.34, sy: 0.12, sz: 0.34 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));
    // Spinning Warden radar halo behind shoulders
    const halo = addMesh(group, torus(1.42, 0.08, 6, 20), glowMat, { x: -0.65, y: 2.95, ry: Math.PI / 2 });
    spin.push({ m: halo, ax: "x", v: 1.4 });
  } else if (type === "queen") {
    // THE GLOWMARSH — Bioluminescent Brood Matriarch
    const hull = mergeGeometries([
      part(G_SPH, 0x264438, { x: -0.45, y: 1.18, sx: 2.6, sy: 1.55, sz: 2.25 }),
      part(G_BEV, 0x3b6c58, { x: 0.92, y: 1.42, sx: 1.48, sy: 1.12, sz: 1.65 }),
      // Broad sculpted fungal crown carapace
      part(sculptedCap(1.85, 1.05, 313), 0x4db88d, { x: -0.25, y: 1.78 }),
      // Six splayed chitinous limbs
      ...[-1, 1].flatMap((s) =>
        [-0.75, 0.05, 0.78].map((lx) =>
          part(G_BEV, 0x1c3128, { x: lx, y: 0.56, z: s * 1.42, rx: s * 0.55, sx: 0.34, sy: 1.24, sz: 0.34 }),
        ),
      ),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const glowGeo = mergeGeometries([
      part(G_SPH, 0xffffff, { x: -0.95, y: 1.35, z: -0.78, sx: 0.65, sy: 0.55, sz: 0.65 }),
      part(G_SPH, 0xffffff, { x: -0.95, y: 1.35, z: 0.78, sx: 0.65, sy: 0.55, sz: 0.65 }),
      part(G_SPH, 0xffffff, { x: 1.68, y: 1.56, z: -0.42, sx: 0.34, sy: 0.28, sz: 0.34 }),
      part(G_SPH, 0xffffff, { x: 1.68, y: 1.56, z: 0.42, sx: 0.34, sy: 0.28, sz: 0.34 }),
      part(G_TOR, 0xffffff, { x: -0.25, y: 1.84, rx: Math.PI / 2, sx: 2.65, sy: 2.65, sz: 2.65 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));
    const crown = addMesh(group, octahedron(0.62), glowMat, { x: -0.25, y: 3.15, sx: 0.9, sy: 1.4, sz: 0.9 });
    spin.push({ m: crown, ax: "y", v: 1.6 });
  } else if (type === "prism") {
    // THE AURORA SHELF — Crystalline Frost Prism Cathedral
    const iceMat = worldMaterial({
      surface: "ice",
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      biomeSkin: true,
      userData: { opacity: 0.84 },
    });
    mats.push(iceMat);
    fadeMats.push(iceMat);
    const coreCrystal = mergeGeometries([
      part(sculptedCrystal(1.9, 3.6, 1.9, 411), 0x1d4e78, { y: 0.35 }),
      part(G_OCT, 0x3b86b8, { y: 2.15, sx: 1.85, sy: 2.45, sz: 1.85 }),
    ]);
    group.add(new MeshNode(coreCrystal, iceMat));
    const ringA = new Node();
    ringA.position.set(0, 2.0, 0);
    const ringAGeo = mergeGeometries(
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU;
        return part(sculptedCrystal(0.55, 1.45, 0.55, 420 + i), 0x266494, {
          x: Math.cos(a) * 1.9,
          y: -0.5,
          z: Math.sin(a) * 1.9,
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
      part(G_OCT, 0x261e48, { y: 2.4, sx: 1.95, sy: 2.35, sz: 1.95 }),
      ...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * TAU;
        return part(sculptedCrystal(0.75, 2.2, 0.75, 510 + i), 0x3f3670, {
          x: Math.cos(a) * 1.65,
          y: 0.95,
          z: Math.sin(a) * 1.65,
          ry: a,
        });
      }),
    ]);
    group.add(new MeshNode(plinth, bodyMat));
    const heart = addMesh(group, icosahedron(0.95, 1), glowMat, { y: 2.4 });
    spin.push({ m: heart, ax: "y", v: 1.2 });

    const r1 = addMesh(group, torus(1.85, 0.11, 6, 28), glowMat, { y: 2.4, rx: 0.55 });
    const r2 = addMesh(group, torus(2.38, 0.09, 6, 28), worldMaterial({ color: BRASS, surface: "metal" }), {
      y: 2.4,
      rz: 0.85,
    });
    const r3 = addMesh(group, torus(2.82, 0.07, 6, 30), glowMat, { y: 2.4, rx: -0.68 });
    spin.push({ m: r1, ax: "y", v: 1.5 }, { m: r2, ax: "x", v: -1.1 }, { m: r3, ax: "z", v: 0.9 });
  } else if (type === "tyrant") {
    // ASHFALL CALDERA — Volcanic Basalt Furnace Titan
    const hull = mergeGeometries([
      part(G_BEV, 0x2a1c1e, { y: 0.78, sx: 2.05, sy: 1.35, sz: 2.35 }),
      part(G_BEV, 0x472928, { x: 0.12, y: 1.98, sx: 2.25, sy: 1.48, sz: 2.75 }),
      // Towering obsidian-horn shoulders
      part(sculptedCrystal(1.15, 2.1, 1.15, 601), 0x3b2324, { x: -0.1, y: 2.1, z: -1.55, rx: -0.4 }),
      part(sculptedCrystal(1.15, 2.1, 1.15, 602), 0x3b2324, { x: -0.1, y: 2.1, z: 1.55, rx: 0.4 }),
      // Heavy siege gauntlets
      part(G_BEV, 0x5c342e, { x: 1.15, y: 1.38, z: -1.48, sx: 1.28, sy: 0.92, sz: 0.92 }),
      part(G_BEV, 0x5c342e, { x: 1.15, y: 1.38, z: 1.48, sx: 1.28, sy: 0.92, sz: 0.92 }),
      // Horned forge helm
      part(G_BEV, 0x321e20, { x: 0.35, y: 2.95, sx: 1.12, sy: 0.82, sz: 1.12 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));
    const forgeGlow = mergeGeometries([
      part(G_SPH, 0xffffff, { x: 1.15, y: 1.98, sx: 0.95, sy: 0.95, sz: 1.12 }),
      part(G_BOX, 0xffffff, { x: 0.94, y: 2.98, sx: 0.16, sy: 0.24, sz: 0.84 }),
      part(G_OCT, 0xffffff, { x: 1.72, y: 1.38, z: -1.48, sx: 0.45, sy: 0.45, sz: 0.45 }),
      part(G_OCT, 0xffffff, { x: 1.72, y: 1.38, z: 1.48, sx: 0.45, sy: 0.45, sz: 0.45 }),
    ]);
    group.add(new MeshNode(forgeGlow, glowMat));
    const crown = addMesh(group, torus(1.22, 0.09, 6, 20), glowMat, { y: 3.55, rx: Math.PI / 2 });
    spin.push({ m: crown, ax: "z", v: 1.3 });
  } else {
    // THE GLASS FLATS — Articulated Vitrified Glasswyrm Leviathan (burnished obsidian-bronze armor + vivid turquoise glass crests)
    const head = mergeGeometries([
      part(G_BEV, 0x5e3824, { x: 0.55, y: 1.15, sx: 1.85, sy: 1.1, sz: 1.48 }),
      part(sculptedCrystal(0.95, 1.85, 0.72, 701), 0x30c8b8, { x: -0.1, y: 1.35, z: -0.78, rx: -0.45, rz: 0.32 }),
      part(sculptedCrystal(0.95, 1.85, 0.72, 702), 0x30c8b8, { x: -0.1, y: 1.35, z: 0.78, rx: 0.45, rz: 0.32 }),
      part(G_CONE6, 0x8a5832, { x: 1.65, y: 1.05, rz: -Math.PI / 2, sx: 0.85, sy: 1.1, sz: 0.95 }),
    ]);
    group.add(new MeshNode(head, bodyMat));
    const eyes = mergeGeometries([
      part(G_OCT, 0xffffff, { x: 1.25, y: 1.35, z: -0.58, sx: 0.38, sy: 0.24, sz: 0.26 }),
      part(G_OCT, 0xffffff, { x: 1.25, y: 1.35, z: 0.58, sx: 0.38, sy: 0.24, sz: 0.26 }),
      part(G_OCT, 0xffffff, { x: 0.35, y: 2.02, sx: 0.48, sy: 0.65, sz: 0.48 }),
    ]);
    group.add(new MeshNode(eyes, glowMat));

    // Articulated undulating armored tail segments
    const tail = [];
    for (let i = 1; i <= 5; i++) {
      const sc = 1 - i * 0.13;
      const seg = new Node();
      seg.position.set(-i * 0.95, 0.95 - i * 0.06, 0);
      const segGeo = mergeGeometries([
        part(G_BEV, i % 2 ? 0x70452b : 0x452b1e, { sx: 0.96 * sc, sy: 0.92 * sc, sz: 1.28 * sc }),
        part(sculptedCrystal(0.45 * sc, 1.1 * sc, 0.45 * sc, 710 + i), 0x34ccba, { y: 0.38 * sc }),
      ]);
      seg.add(new MeshNode(segGeo, bodyMat));
      seg.add(
        new MeshNode(part(G_OCT, 0xffffff, { y: 0.72 * sc, sx: 0.26 * sc, sy: 0.34 * sc, sz: 0.26 * sc }), glowMat),
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
  const segs = 12;
  const parts = [];
  for (let i = 0; i < segs; i++) {
    const a = -0.82 + (i / (segs - 1)) * 1.64;
    parts.push(
      part(G_BOX, 0xffffff, {
        x: Math.cos(a) * 1.25,
        y: 0.86,
        z: Math.sin(a) * 1.25,
        ry: -a,
        sx: 0.1,
        sy: 1.25,
        sz: 0.24,
      }),
    );
  }
  return mergeGeometries(parts);
}

export function debrisGeometry() {
  return octahedron(0.5);
}
