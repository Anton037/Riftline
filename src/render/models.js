// Ground-up Tactile Cozy Diorama 3D models for Riftline v5:
// Cloaked Lantern-Artificer Hero + 7 handcrafted artificer arms, 25 enemies across 5 instant-read storybook
// role families (<= 810 tris each), 6 monumental biome bosses (<= 3500 tris each), and combat props.

import {
  box,
  beveledBox,
  cylinder,
  cone,
  sphere,
  octahedron,
  icosahedron,
  torus,
  closedLathe,
  sculptedCrystal,
  sculptedCap,
  meshPart,
  mergeGeometries,
  Geometry,
} from "../engine/geometry.js";
import { MeshNode, Node, mergeStaticNodes } from "../engine/scene.js";
import { worldMaterial, emissiveMaterial, aegisMaterial, enemySurface } from "./materials.js";
import { FINISH } from "./palette.js";
import { enemyDefs } from "../data/enemies.js";
import { TAU, angleDiff, dampFactor } from "../core/util.js";

export { meshPart };
export function mergeParts(list) {
  return mergeGeometries(list);
}

// Storybook material color families (porcelain, burnished metals, dyed cloth, chitin, wrought iron)
const IVORY = FINISH.ivory; // 0xeadcc2 warm glazed porcelain
const CREAM = 0xf4ead6; // bright ceramic highlight
const BRASS = FINISH.brass; // 0xe2ab56 burnished brass
const COPPER = FINISH.copper; // 0xd87848 warm hammered copper
const LEATHER = 0x6c422c; // oiled saddle leather
const CLOAK_TEAL = 0x265c64; // hero deep sea-teal travel cloak
const CLOAK_TRIM = 0xd88844; // warm amber hem trim
const IRON = 0x2c2936; // dark wrought iron (warm plum-charcoal)
const BRONZE = 0x4b746a; // patinated verdigris bronze
const VERMILION = 0xb83834; // volatile kettle lacquer red
const PLUM_ROBE = 0x3b2548; // hooded marksman burgundy-plum cloth
const NAVY_ROBE = 0x243854; // artillery twilight-indigo cloth
const CHITIN_DARK = 0x3a2a24; // warm umber critter carapace
const CHITIN_MOSS = 0x4c6e4e; // organic mossy shell
const PARCHMENT = 0xeee2c8; // paper-lantern ivory

// Cached primitive & sculpted storybook lathe geometries reused by kit builders
const G_BOX = box(1, 1, 1);
const G_BEV = beveledBox(1, 1, 1, 0.16);
const G_OCT = octahedron(0.5);
const G_CYL8 = cylinder(0.5, 0.5, 1, 8);
const G_CYL6 = cylinder(0.5, 0.5, 1, 6);
const G_CONE6 = cone(0.5, 1, 6);
const G_SPH = icosahedron(0.5, 1);
const G_TOR = torus(0.5, 0.095, 5, 12);
const G_TOR_SM = torus(0.5, 0.12, 4, 10);

// Curved storybook lathe silhouettes (all closed outward-wound solids)
const G_HOOD = closedLathe(
  [
    [0.48, 0.0],
    [0.46, 0.24],
    [0.36, 0.58],
    [0.2, 0.84],
    [0.02, 1.0],
  ],
  8,
);
const G_POT = closedLathe(
  [
    [0.3, 0.0],
    [0.49, 0.26],
    [0.52, 0.58],
    [0.38, 0.86],
    [0.26, 1.0],
  ],
  10,
);
const G_BELL = closedLathe(
  [
    [0.22, 0.0],
    [0.24, 0.52],
    [0.36, 0.82],
    [0.5, 1.0],
  ],
  8,
);
const G_ROBE = closedLathe(
  [
    [0.5, 0.0],
    [0.44, 0.34],
    [0.35, 0.72],
    [0.26, 1.0],
  ],
  8,
);
const G_BUG = closedLathe(
  [
    [0.14, 0.0],
    [0.44, 0.26],
    [0.5, 0.56],
    [0.36, 0.84],
    [0.1, 1.0],
  ],
  8,
);
const G_LANTERN = closedLathe(
  [
    [0.22, 0.0],
    [0.44, 0.28],
    [0.46, 0.72],
    [0.24, 1.0],
  ],
  6,
);
const G_DRILL = closedLathe(
  [
    [0.48, 0.0],
    [0.35, 0.28],
    [0.4, 0.34],
    [0.25, 0.64],
    [0.3, 0.68],
    [0.02, 1.0],
  ],
  8,
);
const G_DOME = closedLathe(
  [
    [0.5, 0.0],
    [0.48, 0.36],
    [0.36, 0.74],
    [0.16, 0.96],
    [0.02, 1.0],
  ],
  8,
);

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
// THE HERO — CLOAKED STORYBOOK RIFT-ARTIFICER + 7 HANDCRAFTED MAGITECH WEAPONS
// ============================================================================

function buildWeaponRig(weapon, accentHex) {
  const gun = new Node();
  const bodyParts = [];
  const glowParts = [];
  const moverBody = [];
  const moverGlow = [];
  let moverPivot = [0.5, 0.03, 0];
  let moverKind = "chamber";
  let muzzleX = 0.88;
  let muzzleY = 0.04;

  switch (weapon) {
    case "scatter":
      // Bell-Blunderbuss: wide flared brass bell muzzle, twin burnished copper side barrels, reciprocating breach & ejection port
      bodyParts.push(
        part(G_BEV, LEATHER, { x: 0.04, y: 0.0, sx: 0.44, sy: 0.21, sz: 0.24 }),
        part(G_BELL, BRASS, { x: 0.4, y: 0.04, rz: -Math.PI / 2, sx: 0.5, sy: 0.5, sz: 0.5 }),
        part(G_TOR_SM, IRON, { x: 0.48, y: 0.04, ry: Math.PI / 2, sx: 0.36, sy: 0.36, sz: 0.36 }),
        part(G_CYL6, BRASS, { x: 0.24, y: 0.19, sx: 0.12, sy: 0.12, sz: 0.12 }),
      );
      moverPivot = [0.36, 0.03, 0];
      moverKind = "breach";
      moverBody.push(
        part(G_CYL8, COPPER, { x: 0.06, y: 0.0, z: -0.11, rz: Math.PI / 2, sx: 0.14, sy: 0.5, sz: 0.14 }),
        part(G_CYL8, COPPER, { x: 0.06, y: 0.0, z: 0.11, rz: Math.PI / 2, sx: 0.14, sy: 0.5, sz: 0.14 }),
        part(G_BEV, BRASS, { x: -0.12, y: 0.06, sx: 0.18, sy: 0.1, sz: 0.28 }),
      );
      glowParts.push(
        part(G_CYL8, accentHex, { x: 0.86, y: 0.04, rz: Math.PI / 2, sx: 0.34, sy: 0.06, sz: 0.34 }),
        part(G_OCT, accentHex, { x: 0.24, y: 0.26, sx: 0.11, sy: 0.13, sz: 0.11 }),
      );
      muzzleX = 0.88;
      muzzleY = 0.04;
      break;
    case "tesla":
      // Tuning-Fork Storm Staff / Arc Caster: crackling curved copper prongs & actively spinning induction coil ring
      bodyParts.push(
        part(G_CYL6, LEATHER, { x: 0.1, y: 0.03, rz: Math.PI / 2, sx: 0.14, sy: 0.56, sz: 0.14 }),
        part(G_POT, BRASS, { x: 0.24, y: 0.03, rz: -Math.PI / 2, sx: 0.34, sy: 0.3, sz: 0.34 }),
        part(G_BEV, COPPER, { x: 0.56, y: 0.03, z: -0.17, ry: 0.22, sx: 0.46, sy: 0.09, sz: 0.09 }),
        part(G_BEV, COPPER, { x: 0.56, y: 0.03, z: 0.17, ry: -0.22, sx: 0.46, sy: 0.09, sz: 0.09 }),
        part(G_CYL6, COPPER, { x: 0.78, y: 0.03, z: -0.2, rz: Math.PI / 2, sx: 0.08, sy: 0.32, sz: 0.08 }),
        part(G_CYL6, COPPER, { x: 0.78, y: 0.03, z: 0.2, rz: Math.PI / 2, sx: 0.08, sy: 0.32, sz: 0.08 }),
        part(G_OCT, BRASS, { x: 0.94, y: 0.03, z: -0.2, sx: 0.12, sy: 0.12, sz: 0.12 }),
        part(G_OCT, BRASS, { x: 0.94, y: 0.03, z: 0.2, sx: 0.12, sy: 0.12, sz: 0.12 }),
      );
      moverPivot = [0.54, 0.03, 0];
      moverKind = "spinX";
      moverBody.push(
        part(G_TOR_SM, COPPER, { ry: Math.PI / 2, sx: 0.36, sy: 0.36, sz: 0.36 }),
        part(G_OCT, BRASS, { y: 0.19, sx: 0.08, sy: 0.08, sz: 0.08 }),
        part(G_OCT, BRASS, { y: -0.19, sx: 0.08, sy: 0.08, sz: 0.08 }),
      );
      moverGlow.push(part(G_TOR_SM, accentHex, { rx: 0.5, ry: Math.PI / 2, sx: 0.3, sy: 0.3, sz: 0.3 }));
      glowParts.push(part(G_OCT, CREAM, { x: 0.8, y: 0.03, sx: 0.18, sy: 0.18, sz: 0.18 }));
      muzzleX = 0.94;
      muzzleY = 0.03;
      break;
    case "rail":
      // Sun-Lance / Astral Railgun: split porcelain lance + expanding magnetic accelerator fins on charge/fire
      bodyParts.push(
        part(G_BEV, IRON, { x: 0.14, y: 0.02, sx: 0.48, sy: 0.22, sz: 0.24 }),
        part(G_TOR_SM, BRASS, { x: 0.38, y: 0.02, ry: Math.PI / 2, sx: 0.42, sy: 0.42, sz: 0.42 }),
        part(G_BEV, IVORY, { x: 0.74, y: 0.09, sx: 0.88, sy: 0.075, sz: 0.16 }),
        part(G_BEV, IVORY, { x: 0.74, y: -0.05, sx: 0.88, sy: 0.075, sz: 0.16 }),
        part(G_CONE6, BRASS, { x: 1.2, y: 0.09, rz: -Math.PI / 2, sx: 0.09, sy: 0.22, sz: 0.09 }),
        part(G_CONE6, BRASS, { x: 1.2, y: -0.05, rz: -Math.PI / 2, sx: 0.09, sy: 0.22, sz: 0.09 }),
      );
      moverPivot = [0.74, 0.02, 0];
      moverKind = "fins";
      moverBody.push(
        part(G_BEV, BRASS, { y: 0.15, sx: 0.56, sy: 0.045, sz: 0.22 }),
        part(G_BEV, BRASS, { y: -0.15, sx: 0.56, sy: 0.045, sz: 0.22 }),
      );
      moverGlow.push(
        part(G_BOX, accentHex, { y: 0.15, sx: 0.48, sy: 0.055, sz: 0.08 }),
        part(G_BOX, accentHex, { y: -0.15, sx: 0.48, sy: 0.055, sz: 0.08 }),
      );
      glowParts.push(
        part(G_BOX, accentHex, { x: 0.76, y: 0.02, sx: 0.94, sy: 0.065, sz: 0.09 }),
        part(G_OCT, CREAM, { x: 1.22, y: 0.02, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      muzzleX = 1.24;
      muzzleY = 0.02;
      break;
    case "rocket":
      // Salvo Rocket: multi-tube revolving brass drum + flared copper bell muzzle & iron backblast vent
      bodyParts.push(
        part(G_BEV, IRON, { x: -0.04, y: 0.04, sx: 0.36, sy: 0.22, sz: 0.26 }),
        part(G_BELL, COPPER, { x: 0.48, y: 0.06, rz: -Math.PI / 2, sx: 0.46, sy: 0.34, sz: 0.46 }),
        part(G_TOR_SM, IRON, { x: 0.48, y: 0.06, ry: Math.PI / 2, sx: 0.44, sy: 0.44, sz: 0.44 }),
        part(G_CONE6, IRON, { x: -0.24, y: 0.06, rz: Math.PI / 2, sx: 0.32, sy: 0.24, sz: 0.32 }),
      );
      moverPivot = [0.2, 0.06, 0];
      moverKind = "drum";
      moverBody.push(part(G_CYL8, BRASS, { rz: Math.PI / 2, sx: 0.4, sy: 0.34, sz: 0.4 }));
      for (let t = 0; t < 4; t++) {
        const a = (t / 4) * TAU + Math.PI * 0.25;
        moverBody.push(
          part(G_CYL6, IRON, {
            y: Math.cos(a) * 0.11,
            z: Math.sin(a) * 0.11,
            rz: Math.PI / 2,
            sx: 0.12,
            sy: 0.38,
            sz: 0.12,
          }),
        );
      }
      glowParts.push(
        part(G_CYL6, accentHex, { x: 0.8, y: 0.06, rz: Math.PI / 2, sx: 0.28, sy: 0.06, sz: 0.28 }),
        part(G_OCT, accentHex, { x: -0.28, y: 0.06, sx: 0.14, sy: 0.14, sz: 0.14 }),
      );
      muzzleX = 0.84;
      muzzleY = 0.06;
      break;
    case "disc":
      // Crescent Chakram Loom cradling an actively spinning luminous star-glaive saw-disc
      bodyParts.push(
        part(G_BEV, LEATHER, { x: 0.1, y: 0.02, sx: 0.38, sy: 0.18, sz: 0.28 }),
        part(G_BEV, IVORY, { x: 0.4, y: 0.02, z: -0.22, ry: 0.38, sx: 0.48, sy: 0.1, sz: 0.1 }),
        part(G_BEV, IVORY, { x: 0.4, y: 0.02, z: 0.22, ry: -0.38, sx: 0.48, sy: 0.1, sz: 0.1 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 0.02, z: -0.28, rz: -Math.PI / 2, sx: 0.1, sy: 0.2, sz: 0.1 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 0.02, z: 0.28, rz: -Math.PI / 2, sx: 0.1, sy: 0.2, sz: 0.1 }),
      );
      moverPivot = [0.54, 0.02, 0];
      moverKind = "saw";
      moverBody.push(part(G_CYL8, BRASS, { sx: 0.2, sy: 0.07, sz: 0.2 }));
      moverGlow.push(
        part(G_TOR_SM, accentHex, { rx: Math.PI / 2, sx: 0.48, sy: 0.48, sz: 0.48 }),
        part(G_OCT, CREAM, { sx: 0.38, sy: 0.05, sz: 0.12 }),
        part(G_OCT, CREAM, { sx: 0.12, sy: 0.05, sz: 0.38 }),
      );
      muzzleX = 0.82;
      muzzleY = 0.02;
      break;
    case "flame":
      // Thermal Projector: sloshing twin copper oil canisters & flickering pilot flame at the nozzle
      bodyParts.push(
        part(G_BEV, IRON, { x: 0.16, y: 0.02, sx: 0.48, sy: 0.2, sz: 0.22 }),
        part(G_POT, COPPER, { x: -0.04, y: 0.06, z: -0.2, rz: -Math.PI / 2, sx: 0.24, sy: 0.42, sz: 0.24 }),
        part(G_POT, COPPER, { x: -0.04, y: 0.06, z: 0.2, rz: -Math.PI / 2, sx: 0.24, sy: 0.42, sz: 0.24 }),
        part(G_LANTERN, BRASS, { x: 0.44, y: 0.02, rz: -Math.PI / 2, sx: 0.34, sy: 0.4, sz: 0.34 }),
        part(G_TOR_SM, IRON, { x: 0.8, y: 0.02, ry: Math.PI / 2, sx: 0.26, sy: 0.26, sz: 0.26 }),
      );
      moverPivot = [0.85, 0.03, 0];
      moverKind = "pilot";
      moverGlow.push(
        part(G_OCT, accentHex, { x: 0.02, sx: 0.16, sy: 0.14, sz: 0.14 }),
        part(G_OCT, CREAM, { x: 0.06, sx: 0.1, sy: 0.1, sz: 0.1 }),
      );
      glowParts.push(
        part(G_OCT, accentHex, { x: 0.56, y: 0.02, sx: 0.22, sy: 0.18, sz: 0.18 }),
        part(G_BOX, accentHex, { x: 0.06, y: 0.11, z: -0.2, sx: 0.22, sy: 0.05, sz: 0.06 }),
        part(G_BOX, accentHex, { x: 0.06, y: 0.11, z: 0.2, sx: 0.22, sy: 0.05, sz: 0.06 }),
      );
      muzzleX = 0.88;
      muzzleY = 0.02;
      break;
    default:
      // Pulse Carbine: ornate ivory-and-brass carbine with cycling crystal energy chamber & brass bolt
      bodyParts.push(
        part(G_BEV, LEATHER, { x: 0.06, y: 0.01, sx: 0.38, sy: 0.2, sz: 0.2 }),
        part(G_BEV, IVORY, { x: 0.38, y: 0.03, sx: 0.46, sy: 0.16, sz: 0.2 }),
        part(G_BEV, BRASS, { x: 0.68, y: 0.09, sx: 0.38, sy: 0.06, sz: 0.12 }),
        part(G_BEV, BRASS, { x: 0.68, y: -0.02, sx: 0.38, sy: 0.06, sz: 0.12 }),
        part(G_TOR_SM, BRASS, { x: 0.34, y: 0.04, ry: Math.PI / 2, sx: 0.24, sy: 0.24, sz: 0.24 }),
      );
      moverPivot = [0.64, 0.035, 0];
      moverKind = "chamber";
      moverBody.push(part(G_BEV, BRASS, { x: -0.18, y: 0.09, sx: 0.14, sy: 0.05, sz: 0.16 }));
      moverGlow.push(part(G_OCT, accentHex, { sx: 0.32, sy: 0.12, sz: 0.13 }));
      glowParts.push(part(G_OCT, CREAM, { x: 0.88, y: 0.035, sx: 0.1, sy: 0.1, sz: 0.1 }));
      muzzleX = 0.9;
      muzzleY = 0.035;
      break;
  }

  // Articulated right artificer sleeve, brass cuff & gloved hand gripping the weapon stock
  bodyParts.push(
    part(G_DOME, CLOAK_TEAL, { x: -0.18, y: 0.1, z: -0.04, rz: 0.45, sx: 0.24, sy: 0.2, sz: 0.22 }),
    part(G_CYL8, CLOAK_TEAL, { x: -0.1, y: -0.01, z: -0.02, rz: -0.58, sx: 0.15, sy: 0.26, sz: 0.15 }),
    part(G_TOR_SM, BRASS, { x: -0.02, y: -0.06, z: -0.01, ry: Math.PI / 2, sx: 0.16, sy: 0.16, sz: 0.16 }),
    part(G_SPH, LEATHER, { x: 0.06, y: -0.06, z: 0.0, sx: 0.16, sy: 0.14, sz: 0.15 }),
  );

  const bodyMat = worldMaterial({ surface: "armor", vertexColors: true });
  const glowMat = emissiveMaterial({ vertexColors: true, emissiveIntensity: 1.24 });
  if (bodyParts.length) gun.add(new MeshNode(mergeGeometries(bodyParts), bodyMat));
  if (glowParts.length) gun.add(new MeshNode(mergeGeometries(glowParts), glowMat));

  const mover = new Node();
  mover.position.set(moverPivot[0], moverPivot[1], moverPivot[2]);
  if (moverBody.length) mover.add(new MeshNode(mergeGeometries(moverBody), bodyMat));
  if (moverGlow.length) mover.add(new MeshNode(mergeGeometries(moverGlow), glowMat));
  gun.add(mover);

  const muzzle = new Node();
  muzzle.position.set(muzzleX, muzzleY, 0);
  gun.add(muzzle);

  return {
    gun,
    mover,
    moverPivot,
    moverKind,
    muzzle,
    bodyMat,
    glowMat,
    animate(time, recoil, firing, dt) {
      const kick = Math.min(1, recoil * 12);
      if (moverKind === "saw") {
        mover.rotation.y += dt * (firing ? 22 : 9.5);
      } else if (moverKind === "spinX") {
        mover.rotation.x += dt * (firing ? 16 : 4.8);
      } else if (moverKind === "drum") {
        mover.rotation.x += dt * (firing ? 11 : 1.6) + kick * dt * 18;
      } else if (moverKind === "fins") {
        const spread = 1 + (firing ? 0.24 : 0.04 * Math.sin(time * 3)) + kick * 0.36;
        mover.scale.set(1, spread, 1 + kick * 0.12);
      } else if (moverKind === "pilot") {
        const flk = 0.88 + 0.24 * Math.sin(time * 23) + (firing ? 0.55 : 0);
        mover.scale.set(flk * (firing ? 1.4 : 1), flk, flk);
        mover.rotation.x = time * 5;
      } else if (moverKind === "breach") {
        mover.position.x = moverPivot[0] - kick * 0.11;
      } else {
        mover.position.x = moverPivot[0] - kick * 0.08;
        mover.rotation.x = time * (firing ? 10 : 2.2);
      }
    },
  };
}

export function buildPlayerModel(weapon = "pulse", weaponColor = 0x5ce8ff) {
  const group = new Node();
  const base = new Node();
  base.rotation.order = "YZX";
  group.add(base);

  const armorMat = worldMaterial({ surface: "armor", vertexColors: true });
  const clothMat = worldMaterial({ surface: "organic", vertexColors: true });
  const visorMat = emissiveMaterial({ color: 0xffdf8c, emissiveIntensity: 1.42 });
  const lanternGlowMat = emissiveMaterial({ color: 0xffc662, emissiveIntensity: 1.52 });

  // Streamlined articulated legs (1 draw call per leg, swinging cleanly from hips)
  const makeLeg = (side) => {
    const hip = new Node();
    hip.position.set(0, 0.58, side * 0.19);
    const legGeo = mergeGeometries([
      part(G_SPH, IRON, { y: -0.02, sx: 0.17, sy: 0.17, sz: 0.17 }),
      part(G_CYL8, LEATHER, { y: -0.16, sx: 0.15, sy: 0.26, sz: 0.15 }),
      part(G_SPH, BRASS, { y: -0.28, sx: 0.16, sy: 0.13, sz: 0.16 }),
      part(G_CYL8, IRON, { y: -0.39, sx: 0.14, sy: 0.18, sz: 0.14 }),
      part(G_CYL8, BRASS, { x: 0.02, y: -0.45, sx: 0.18, sy: 0.06, sz: 0.18 }),
      part(G_DOME, LEATHER, { x: 0.06, y: -0.58, sx: 0.32, sy: 0.2, sz: 0.21 }),
    ]);
    hip.add(new MeshNode(legGeo, armorMat));
    base.add(hip);
    return { hip };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Static body sub-meshes on `base` (batched via mergeStaticNodes so lean/bank propagates naturally to torso & hat!)
  // 1. Tunic, ceramic cuirass, belt, satchel pack, shoulder mantle & scarf collar
  const torsoGeo = mergeGeometries([
    part(G_ROBE, CLOAK_TEAL, { y: 0.44, sx: 0.68, sy: 0.38, sz: 0.72 }),
    part(G_POT, IVORY, { x: 0.02, y: 0.68, sx: 0.64, sy: 0.52, sz: 0.68 }),
    part(G_TOR_SM, LEATHER, { y: 0.7, rx: Math.PI / 2, sx: 0.66, sy: 0.7, sz: 0.66 }),
    part(G_BEV, COPPER, { x: 0.14, y: 0.96, rx: 0.62, sx: 0.4, sy: 0.08, sz: 0.62 }),
    part(G_OCT, BRASS, { x: 0.31, y: 0.98, sx: 0.11, sy: 0.13, sz: 0.13 }),
    part(G_DOME, CLOAK_TEAL, { x: 0.0, y: 1.0, z: -0.32, rx: 0.28, sx: 0.42, sy: 0.24, sz: 0.34 }),
    part(G_DOME, CLOAK_TEAL, { x: 0.0, y: 1.0, z: 0.32, rx: -0.28, sx: 0.42, sy: 0.24, sz: 0.34 }),
    part(G_TOR_SM, CLOAK_TRIM, { x: 0.02, y: 1.19, rx: Math.PI / 2, sx: 0.56, sy: 0.56, sz: 0.54 }),
    part(G_BEV, LEATHER, { x: -0.3, y: 0.92, sx: 0.24, sy: 0.34, sz: 0.36 }),
    part(G_CYL6, BRASS, { x: -0.4, y: 0.96, rx: Math.PI / 2, sx: 0.16, sy: 0.34, sz: 0.16 }),
  ]);
  base.add(new MeshNode(torsoGeo, armorMat));

  // 2. Storybook pointed artificer hood & wide brimmed hat (on `base` so body lean/bank flows into hood/hat!)
  const hatGeo = mergeGeometries([
    // Shadowed cowl alcove under the brim
    part(G_SPH, 0x1c1724, { x: 0.08, y: 1.37, sx: 0.34, sy: 0.3, sz: 0.34 }),
    // Soft cloth hood drape around neck & back of head
    part(G_HOOD, CLOAK_TEAL, { x: -0.05, y: 1.24, rz: 0.44, sx: 0.58, sy: 0.54, sz: 0.54 }),
    // Wide upturned brimmed artificer hat + burnished brass hatband & buckle
    part(G_DOME, CLOAK_TEAL, { x: 0.03, y: 1.46, rz: 0.14, sx: 0.98, sy: 0.16, sz: 1.02 }),
    part(G_TOR_SM, CLOAK_TRIM, { x: 0.03, y: 1.5, rz: 0.14, rx: Math.PI / 2, sx: 0.92, sy: 0.96, sz: 0.72 }),
    part(G_TOR_SM, BRASS, { x: 0.02, y: 1.57, rz: 0.16, rx: Math.PI / 2, sx: 0.52, sy: 0.52, sz: 0.52 }),
    part(G_OCT, BRASS, { x: 0.26, y: 1.6, sx: 0.11, sy: 0.12, sz: 0.14 }),
    // Pointed crooked storybook hat crown curving gently back
    part(G_HOOD, CLOAK_TEAL, { x: -0.04, y: 1.56, rz: 0.36, sx: 0.52, sy: 0.62, sz: 0.5 }),
    part(G_CONE6, CLOAK_TEAL, { x: -0.26, y: 2.08, rz: 0.78, sx: 0.24, sy: 0.36, sz: 0.24 }),
    part(G_OCT, BRASS, { x: -0.39, y: 2.2, sx: 0.08, sy: 0.09, sz: 0.08 }),
  ]);
  base.add(new MeshNode(hatGeo, armorMat));

  // 3. Off-hand left arm extending forward-left to carry the swinging brass guiding-lantern
  const leftArmGeo = mergeGeometries([
    part(G_CYL8, CLOAK_TEAL, { x: 0.08, y: 0.99, z: -0.39, rx: 0.24, rz: 0.55, sx: 0.15, sy: 0.3, sz: 0.15 }),
    part(G_TOR_SM, BRASS, { x: 0.2, y: 0.93, z: -0.44, ry: Math.PI / 2, sx: 0.15, sy: 0.15, sz: 0.15 }),
    part(G_SPH, LEATHER, { x: 0.27, y: 0.91, z: -0.46, sx: 0.14, sy: 0.13, sz: 0.13 }),
    part(G_CYL6, BRASS, { x: 0.31, y: 0.9, z: -0.46, rz: Math.PI / 2, sx: 0.04, sy: 0.12, sz: 0.04 }),
  ]);
  base.add(new MeshNode(leftArmGeo, armorMat));

  // Warm glowing eyes tucked beneath the shadowed hat brim (single draw call!)
  const eyes = new MeshNode(
    mergeGeometries([
      part(G_OCT, 0xffffff, { x: 0.0, y: 0.0, z: -0.082, sx: 0.075, sy: 0.095, sz: 0.09 }),
      part(G_OCT, 0xffffff, { x: 0.0, y: 0.0, z: 0.082, sx: 0.075, sy: 0.095, sz: 0.09 }),
    ]),
    visorMat,
  );
  eyes.position.set(0.24, 1.38, 0);
  base.add(eyes);

  // Swinging brass guiding-lantern suspended from the off-hand left glove
  const lantern = new Node();
  lantern.position.set(0.35, 0.89, -0.46);
  const lanternCageGeo = mergeGeometries([
    part(G_TOR_SM, BRASS, { y: -0.03, sx: 0.1, sy: 0.1, sz: 0.1 }),
    part(G_CONE6, BRASS, { y: -0.1, sx: 0.24, sy: 0.11, sz: 0.24 }),
    part(G_CYL6, BRASS, { y: -0.35, sx: 0.22, sy: 0.06, sz: 0.22 }),
    part(G_CONE6, COPPER, { y: -0.4, rx: Math.PI, sx: 0.14, sy: 0.08, sz: 0.14 }),
  ]);
  lantern.add(new MeshNode(lanternCageGeo, armorMat));
  const lanternGlow = new MeshNode(
    part(G_LANTERN, 0xffffff, { y: -0.34, sx: 0.24, sy: 0.26, sz: 0.24 }),
    lanternGlowMat,
  );
  lantern.add(lanternGlow);
  base.add(lantern);

  // 2-Stage Articulated Travel Cloak (`cloak` -> `cloakHem`) & Woven Explorer Scarf (`scarf` -> `scarfTail`)
  const cloak = new Node();
  cloak.position.set(-0.2, 1.14, 0);
  cloak.add(
    new MeshNode(
      mergeGeometries([part(G_BEV, CLOAK_TEAL, { x: -0.11, y: -0.17, rz: -0.26, sx: 0.11, sy: 0.36, sz: 0.54 })]),
      clothMat,
    ),
  );
  const cloakHem = new Node();
  cloakHem.position.set(-0.17, -0.33, 0);
  cloakHem.add(
    new MeshNode(
      mergeGeometries([
        part(G_BEV, CLOAK_TEAL, { x: -0.11, y: -0.15, rz: -0.34, sx: 0.1, sy: 0.34, sz: 0.62 }),
        part(G_BEV, CLOAK_TRIM, { x: -0.18, y: -0.31, rz: -0.38, sx: 0.095, sy: 0.09, sz: 0.65 }),
      ]),
      clothMat,
    ),
  );
  cloak.add(cloakHem);
  base.add(cloak);

  const scarf = new Node();
  scarf.position.set(-0.15, 1.18, -0.14);
  const scarfTail = new Node();
  scarfTail.position.set(-0.14, -0.1, 0);
  scarfTail.add(
    new MeshNode(
      mergeGeometries([
        part(G_BEV, CLOAK_TRIM, { x: -0.02, y: -0.02, rz: -0.44, sx: 0.08, sy: 0.34, sz: 0.21 }),
        part(G_BEV, CLOAK_TRIM, { x: -0.18, y: -0.2, rz: -0.68, sx: 0.07, sy: 0.3, sz: 0.18 }),
        part(G_CONE6, BRASS, { x: -0.3, y: -0.32, rz: 1.12, sx: 0.1, sy: 0.15, sz: 0.13 }),
      ]),
      clothMat,
    ),
  );
  scarf.add(scarfTail);
  base.add(scarf);

  // Weapon bearing pivot on torso + independent horizontal turret mounted on group so aim never drifts with lean/bank
  const weaponMount = new Node();
  weaponMount.position.set(0.04, 1.32, 0);
  base.add(weaponMount);

  // Batch static sub-meshes on `base` (torso + hat/hood + left arm -> 1 draw call!) while preserving all moving nodes
  const keepStatic = new Set([legL.hip, legR.hip, weaponMount, cloak, cloakHem, scarf, scarfTail, lantern, eyes]);
  mergeStaticNodes(base, keepStatic);

  const turret = new Node();
  turret.position.set(0.04, 1.32, 0);
  group.add(turret);

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

  // Collect all stylized materials (including post-mergeStaticNodes merged material) for hurt/shield tinting
  const matSet = new Set([armorMat, clothMat, rig.bodyMat]);
  group.traverse((o) => {
    if (o.isMesh && o.material && o.material.shader === "stylized") matSet.add(o.material);
  });

  const model = {
    group,
    base,
    cloak,
    cloakHem,
    scarf,
    scarfTail,
    lantern,
    lanternGlow,
    lanternGlowMat,
    eyes,
    visorMat,
    weaponMount,
    turret,
    gun: rig.gun,
    rig,
    muzzle: rig.muzzle,
    shield,
    mats: [...matSet],
    noShadowNodes: [lantern, scarf, rig.mover],
    lean: 0,
    bank: 0,
    recoil: 0,
    aimYaw: 0,
    flareT: 0,
    inspectT: 0,
    faceLast: undefined,
    setWalk(phase, amount, jump, time) {
      const sL = Math.sin(phase);
      const sR = -sL;
      const hipSwing = 0.58 * amount;
      const tuck = jump * 0.56;

      legL.hip.rotation.z = sL * hipSwing + tuck * 0.48;
      legR.hip.rotation.z = sR * hipSwing + tuck * 0.48;

      const flare = Math.max(jump, Math.min(1, this.flareT || 0));
      const breeze = Math.sin(time * 2.9) * 0.06;
      const runRipple = Math.sin(phase * 2) * 0.09 * amount;

      // 2-stage billowing travel cloak + flaring hem during Dash & Hearthburst
      cloak.rotation.z = -0.1 - amount * 0.38 - flare * 0.52 + breeze + runRipple;
      cloak.rotation.y = Math.sin(time * 2.1 + phase * 0.5) * (0.06 + amount * 0.08);
      cloakHem.rotation.z =
        -0.08 - amount * 0.28 - flare * 0.44 + Math.sin(time * 4.2 - 0.85) * (0.07 + amount * 0.09 + flare * 0.14);
      cloakHem.scale.set(1 + flare * 0.28, 1, 1 + flare * 0.32);

      // 2-stage flowing scarf + phase-lagged tail whip
      scarf.rotation.z = -0.14 - amount * 0.46 - flare * 0.58 + Math.sin(time * 3.8 + 0.6) * (0.08 + amount * 0.07);
      scarf.rotation.y = Math.cos(time * 2.7) * (0.08 + amount * 0.12) - this.bank * 0.8;
      scarfTail.rotation.z =
        -0.1 - amount * 0.34 - flare * 0.48 + Math.sin(time * 5.6 - 0.7) * (0.09 + amount * 0.11 + flare * 0.15);
      scarfTail.scale.set(1 + flare * 0.22, 1, 1 + flare * 0.18);

      // Pendulum swing on off-hand brass guiding-lantern
      lantern.rotation.z =
        -0.06 - amount * 0.34 - flare * 0.48 + Math.sin(phase + 0.6) * 0.18 * amount + Math.sin(time * 2.4) * 0.05;
      lantern.rotation.x = -this.bank * 0.85 + Math.cos(time * 2.1) * 0.05;

      const bob = amount > 0.05 ? Math.abs(Math.cos(phase)) * 0.095 * amount : Math.sin(time * 2.6) * 0.026;
      return bob;
    },
    updateExpression(time, dt, firing = false, dashing = false, hurt = 0, novaReady = false) {
      if (this.flareT > 0) this.flareT = Math.max(0, this.flareT - dt * 1.8);
      // Idle blink every ~3.8s, focused glow when firing/dashing, wide flash when hurt
      const cyc = time % 3.8;
      const blink = !firing && !dashing && hurt <= 0.05 && cyc > 3.66 ? Math.sin(((cyc - 3.66) / 0.14) * Math.PI) : 0;
      const focus = firing || dashing ? 1 : 0;
      const sy = hurt > 0.1 ? 1.4 : (1 - blink * 0.88) * (focus ? 0.62 : 1.0);
      const sz = hurt > 0.1 ? 1.24 : focus ? 1.12 : 1.0;
      const gazeZ = Math.max(-0.022, Math.min(0.022, -this.bank * 0.06));
      eyes.scale.set(1, sy, sz);
      eyes.position.z = gazeZ;
      visorMat.emissiveIntensity = hurt > 0.1 ? 1.9 : firing ? 1.62 : 1.38;

      // Warm flickering guiding-lantern glow (brightens during dash & Hearthburst ready!)
      const flicker = 0.94 + 0.08 * Math.sin(time * 9.5) + 0.05 * Math.sin(time * 17.1);
      const boost = (dashing ? 0.55 : 0) + (novaReady ? 0.42 : 0) + (this.flareT > 0 ? this.flareT * 0.65 : 0);
      lanternGlowMat.emissiveIntensity = (1.42 + boost) * flicker;
      const ls = 1 + boost * 0.12;
      lanternGlow.scale.setScalar(ls);

      rig.animate(time, this.recoil, firing, dt);
      if (this.inspectT > 0) {
        this.inspectT = Math.max(0, this.inspectT - dt);
        const k = Math.sin((this.inspectT / 0.55) * Math.PI);
        rig.gun.rotation.z = k * 0.28;
        rig.gun.rotation.x = -k * 0.22;
      } else {
        // Subtle pitch-up muzzle recoil kick
        rig.gun.rotation.set(0, 0, this.recoil * 2.1);
      }
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
        rig.gun.rotation.z = this.recoil * 2.1;
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
// ALL 25 DISTINCT ENEMY KITS — 5 INSTANT-READ STORYBOOK ROLE FAMILIES (<= 810 tris)
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
  const body = [];
  const glow = [];

  switch (type) {
    // ------------------------------------------------------------------------
    // FAMILY A — WILD RIFT CRITTERS (Organic rounded shells, fluttering wings, antennae, skittering claws)
    // ------------------------------------------------------------------------
    case "swarmer":
      // Teardrop jewel-moth / scarab dart with GPU-buzzing gossamer wings, segmented thorax & curled antennae
      body.push(
        part(G_BUG, accent, {
          x: -0.06,
          y: 0.44,
          rz: -Math.PI / 2,
          sx: 0.56,
          sy: 1.08,
          sz: 0.62,
          anim: [4, 0.44, -0.06, -1.0],
        }),
        part(G_TOR_SM, BRASS, { x: 0.14, y: 0.45, ry: Math.PI / 2, sx: 0.46, sy: 0.46, sz: 0.46 }),
        part(G_DOME, CHITIN_DARK, { x: 0.36, y: 0.34, sx: 0.35, sy: 0.31, sz: 0.39 }),
        // Mode 1 GPU-buzzing moth-scarab forewings & hindwings
        part(G_OCT, PARCHMENT, {
          x: -0.04,
          y: 0.58,
          z: -0.46,
          ry: 0.52,
          rx: -0.16,
          sx: 0.72,
          sy: 0.075,
          sz: 0.46,
          anim: [1, 0.54, -0.16, 0.0],
        }),
        part(G_OCT, PARCHMENT, {
          x: -0.04,
          y: 0.58,
          z: 0.46,
          ry: -0.52,
          rx: 0.16,
          sx: 0.72,
          sy: 0.075,
          sz: 0.46,
          anim: [1, 0.54, 0.16, 0.0],
        }),
        part(G_OCT, CHITIN_DARK, {
          x: -0.24,
          y: 0.5,
          z: -0.34,
          ry: 0.72,
          sx: 0.46,
          sy: 0.06,
          sz: 0.3,
          anim: [1, 0.5, -0.14, 0.6],
        }),
        part(G_OCT, CHITIN_DARK, {
          x: -0.24,
          y: 0.5,
          z: 0.34,
          ry: -0.72,
          sx: 0.46,
          sy: 0.06,
          sz: 0.3,
          anim: [1, 0.5, 0.14, 0.6],
        }),
        part(G_CONE6, BRASS, { x: 0.52, y: 0.52, z: -0.14, rz: -0.9, sx: 0.08, sy: 0.28, sz: 0.08 }),
        part(G_CONE6, BRASS, { x: 0.52, y: 0.52, z: 0.14, rz: -0.9, sx: 0.08, sy: 0.28, sz: 0.08 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.46, y: 0.48, z: -0.12, sx: 0.14, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: 0.46, y: 0.48, z: 0.12, sx: 0.14, sy: 0.14, sz: 0.14 }),
        part(G_OCT, 0xffffff, { x: -0.56, y: 0.44, sx: 0.18, sy: 0.15, sz: 0.18, anim: [4, 0.44, -0.06, -1.0] }),
      );
      break;
    case "mite":
      // Plump spotted acorn-beetle with 6 GPU-skittering claws, mossy carapace cap & snapping mandibles
      body.push(
        part(G_DOME, accent, { y: 0.16, sx: 0.78, sy: 0.5, sz: 0.7 }),
        part(G_DOME, CHITIN_MOSS, { x: -0.06, y: 0.42, sx: 0.56, sy: 0.26, sz: 0.52 }),
        part(G_TOR_SM, BRASS, { x: -0.06, y: 0.42, rx: Math.PI / 2, sx: 0.56, sy: 0.56, sz: 0.56 }),
        part(G_CONE6, PARCHMENT, {
          x: 0.4,
          y: 0.28,
          z: -0.16,
          rz: -1.18,
          sx: 0.12,
          sy: 0.3,
          sz: 0.12,
          anim: [2, 0.28, 0.32, 0.0],
        }),
        part(G_CONE6, PARCHMENT, {
          x: 0.4,
          y: 0.28,
          z: 0.16,
          rz: -1.18,
          sx: 0.12,
          sy: 0.3,
          sz: 0.12,
          anim: [2, 0.28, 0.32, Math.PI],
        }),
        ...[-1, 1].flatMap((s) =>
          [-0.22, 0.0, 0.22].map((lx, idx) =>
            part(G_CONE6, CHITIN_DARK, {
              x: lx,
              y: 0.12,
              z: s * 0.38,
              rx: s * 0.65,
              sx: 0.095,
              sy: 0.26,
              sz: 0.095,
              anim: [2, 0.22, lx, ((idx + (s > 0 ? 1 : 0)) % 2) * Math.PI],
            }),
          ),
        ),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.33, y: 0.38, z: -0.12, sx: 0.14, sy: 0.13, sz: 0.13 }),
        part(G_OCT, 0xffffff, { x: 0.33, y: 0.38, z: 0.12, sx: 0.14, sy: 0.13, sz: 0.13 }),
        part(G_OCT, 0xffffff, { x: -0.08, y: 0.64, sx: 0.18, sy: 0.1, sz: 0.18 }),
      );
      break;
    case "splitter":
      // Organic twin-lobed mitosis toadstool-pod with GPU-throbbing brood sac, skittering rootlets & curled sprouts
      body.push(
        part(G_BUG, CHITIN_MOSS, { y: 0.12, z: -0.32, sx: 0.68, sy: 0.84, sz: 0.58, anim: [4, 0.5, 0, -0.8] }),
        part(G_BUG, CHITIN_MOSS, { y: 0.12, z: 0.32, sx: 0.68, sy: 0.84, sz: 0.58, anim: [4, 0.5, 0, -2.4] }),
        part(G_DOME, accent, { y: 0.72, sx: 0.64, sy: 0.38, sz: 0.96, anim: [4, 0.72, 0, -1.6] }),
        part(G_CONE6, PARCHMENT, {
          x: -0.08,
          y: 1.08,
          z: -0.26,
          rx: -0.24,
          sx: 0.14,
          sy: 0.34,
          sz: 0.14,
          anim: [1, 0.95, -0.22, 0.2],
        }),
        part(G_CONE6, PARCHMENT, {
          x: -0.08,
          y: 1.08,
          z: 0.26,
          rx: 0.24,
          sx: 0.14,
          sy: 0.34,
          sz: 0.14,
          anim: [1, 0.95, 0.22, 0.2],
        }),
        ...[-1, 1].map((s) =>
          part(G_DOME, CHITIN_DARK, {
            x: 0.06,
            y: 0.0,
            z: s * 0.34,
            sx: 0.28,
            sy: 0.18,
            sz: 0.24,
            anim: [2, 0.2, 0.06, s > 0 ? Math.PI : 0],
          }),
        ),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.33, y: 0.62, z: -0.3, sx: 0.22, sy: 0.24, sz: 0.22 }),
        part(G_OCT, 0xffffff, { x: 0.33, y: 0.62, z: 0.3, sx: 0.22, sy: 0.24, sz: 0.22 }),
        part(G_SPH, 0xffffff, { y: 0.54, sx: 0.38, sy: 0.34, sz: 0.44, anim: [4, 0.54, 0, -1.6] }),
      );
      break;
    case "leaper":
      // Coiled springy rift-lynx critter with GPU-striding haunches & forepaws, brass collar, tufted ears & sweeping tail
      body.push(
        part(G_BUG, CHITIN_DARK, { x: -0.08, y: 0.6, rz: -1.35, sx: 0.54, sy: 1.12, sz: 0.58 }),
        part(G_TOR_SM, BRASS, { x: 0.22, y: 0.68, rz: 0.3, ry: Math.PI / 2, sx: 0.48, sy: 0.48, sz: 0.48 }),
        part(G_DOME, accent, { x: 0.32, y: 0.72, sx: 0.45, sy: 0.37, sz: 0.45 }),
        part(G_BUG, LEATHER, {
          x: -0.34,
          y: 0.1,
          z: -0.32,
          rz: 0.38,
          sx: 0.28,
          sy: 0.66,
          sz: 0.24,
          anim: [2, 0.48, -0.34, 0.0],
        }),
        part(G_BUG, LEATHER, {
          x: -0.34,
          y: 0.1,
          z: 0.32,
          rz: 0.38,
          sx: 0.28,
          sy: 0.66,
          sz: 0.24,
          anim: [2, 0.48, -0.34, Math.PI],
        }),
        part(G_CYL6, CHITIN_DARK, {
          x: 0.34,
          y: 0.24,
          z: -0.24,
          rz: -0.26,
          sx: 0.16,
          sy: 0.46,
          sz: 0.16,
          anim: [2, 0.48, 0.34, Math.PI],
        }),
        part(G_CYL6, CHITIN_DARK, {
          x: 0.34,
          y: 0.24,
          z: 0.24,
          rz: -0.26,
          sx: 0.16,
          sy: 0.46,
          sz: 0.16,
          anim: [2, 0.48, 0.34, 0.0],
        }),
        part(G_CONE6, PARCHMENT, { x: 0.38, y: 1.08, z: -0.18, rx: -0.2, sx: 0.14, sy: 0.32, sz: 0.14 }),
        part(G_CONE6, PARCHMENT, { x: 0.38, y: 1.08, z: 0.18, rx: 0.2, sx: 0.14, sy: 0.32, sz: 0.14 }),
        part(G_CONE6, accent, {
          x: -0.62,
          y: 0.86,
          rz: 0.85,
          sx: 0.18,
          sy: 0.48,
          sz: 0.18,
          anim: [2, 0.72, -0.45, 1.5],
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.52, y: 0.86, z: -0.11, sx: 0.14, sy: 0.12, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: 0.52, y: 0.86, z: 0.11, sx: 0.14, sy: 0.12, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: -0.78, y: 1.02, sx: 0.12, sy: 0.12, sz: 0.12, anim: [2, 0.72, -0.45, 1.5] }),
      );
      break;
    case "hive":
      // Tiered mossy fairy-toadstool brood-nest with gnarled roots, throbbing spore-belly & orbiting spore-crown
      body.push(
        part(G_ROBE, CHITIN_DARK, { y: 0.0, sx: 1.24, sy: 0.66, sz: 1.24, anim: [4, 0.45, 0, -1.2] }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + 0.4;
          return part(G_CONE6, LEATHER, {
            x: Math.cos(a) * 0.64,
            y: 0.22,
            z: Math.sin(a) * 0.64,
            ry: -a,
            rz: -0.5,
            sx: 0.26,
            sy: 0.52,
            sz: 0.26,
          });
        }),
        part(sculptedCap(0.92, 0.72, 71), CHITIN_MOSS, { y: 0.54, anim: [4, 0.68, 0, -1.2] }),
        part(sculptedCap(0.56, 0.48, 79), accent, { y: 1.12, anim: [4, 1.18, 0, -2.2] }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { y: 0.88, sx: 0.54, sy: 0.36, sz: 0.54, anim: [4, 0.88, 0, -1.2] }),
        part(G_OCT, 0xffffff, { y: 1.64, sx: 0.32, sy: 0.42, sz: 0.32, anim: [3, 1.64, 0, 1.6] }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4;
          return part(G_OCT, 0xffffff, {
            x: Math.cos(a) * 0.62,
            y: 0.52,
            z: Math.sin(a) * 0.62,
            sx: 0.18,
            sy: 0.22,
            sz: 0.18,
            anim: [3, 0.52, 0, 0.9],
          });
        }),
      );
      break;

    // ------------------------------------------------------------------------
    // FAMILY B — PORCELAIN & FORGED VANGUARD (Warm porcelain, patinated bronze, wrought iron, marching sabatons)
    // ------------------------------------------------------------------------
    case "grunt":
      // Porcelain-and-bronze miniature knight-golem with marching sabatons, swinging mace-gauntlets & crested sallet helm
      body.push(
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: -0.22, sx: 0.34, sy: 0.28, sz: 0.26, anim: [2, 0.34, 0.04, 0.0] }),
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: 0.22, sx: 0.34, sy: 0.28, sz: 0.26, anim: [2, 0.34, 0.04, Math.PI] }),
        part(G_ROBE, BRONZE, { y: 0.26, sx: 0.76, sy: 0.72, sz: 0.84 }),
        part(G_DOME, IVORY, { x: 0.06, y: 0.62, sx: 0.68, sy: 0.44, sz: 0.78 }),
        part(G_TOR_SM, BRASS, { x: 0.04, y: 0.6, rx: Math.PI / 2, sx: 0.74, sy: 0.74, sz: 0.74 }),
        part(G_DOME, BRONZE, { x: 0.02, y: 0.78, z: -0.44, rx: 0.28, sx: 0.4, sy: 0.28, sz: 0.34 }),
        part(G_DOME, BRONZE, { x: 0.02, y: 0.78, z: 0.44, rx: -0.28, sx: 0.4, sy: 0.28, sz: 0.34 }),
        part(G_BEV, IRON, { x: 0.22, y: 0.56, z: -0.46, sx: 0.28, sy: 0.24, sz: 0.2, anim: [2, 0.78, 0.02, Math.PI] }),
        part(G_BEV, IRON, { x: 0.22, y: 0.56, z: 0.46, sx: 0.28, sy: 0.24, sz: 0.2, anim: [2, 0.78, 0.02, 0.0] }),
        part(G_DOME, IVORY, { x: 0.08, y: 1.0, sx: 0.48, sy: 0.34, sz: 0.46 }),
        part(G_BEV, accent, { x: 0.04, y: 1.32, sx: 0.4, sy: 0.15, sz: 0.1 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.32, y: 1.08, sx: 0.12, sy: 0.1, sz: 0.34 }),
        part(G_OCT, 0xffffff, { x: -0.34, y: 0.78, sx: 0.16, sy: 0.2, sz: 0.2 }),
      );
      break;
    case "brute":
      // Towering horned porcelain-and-iron juggernaut with stomping sabatons, swinging siege gauntlets & sweeping brass horns
      body.push(
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: -0.42, sx: 0.56, sy: 0.42, sz: 0.44, anim: [2, 0.48, 0.04, 0.0] }),
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: 0.42, sx: 0.56, sy: 0.42, sz: 0.44, anim: [2, 0.48, 0.04, Math.PI] }),
        part(G_POT, IVORY, { x: 0.04, y: 0.36, sx: 1.24, sy: 1.02, sz: 1.44 }),
        part(G_TOR_SM, BRASS, { x: 0.04, y: 0.78, rx: Math.PI / 2, sx: 1.28, sy: 1.38, sz: 1.28 }),
        part(G_DOME, BRONZE, { x: 0.12, y: 1.08, z: -0.76, rx: 0.32, sx: 0.82, sy: 0.5, sz: 0.56 }),
        part(G_DOME, BRONZE, { x: 0.12, y: 1.08, z: 0.76, rx: -0.32, sx: 0.82, sy: 0.5, sz: 0.56 }),
        part(G_BEV, IRON, { x: 0.48, y: 0.64, z: -0.78, sx: 0.54, sy: 0.5, sz: 0.4, anim: [2, 1.08, 0.12, Math.PI] }),
        part(G_BEV, IRON, { x: 0.48, y: 0.64, z: 0.78, sx: 0.54, sy: 0.5, sz: 0.4, anim: [2, 1.08, 0.12, 0.0] }),
        part(G_DOME, accent, { x: 0.34, y: 1.26, sx: 0.58, sy: 0.42, sz: 0.62 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 1.48, z: -0.48, rx: -0.4, rz: -0.88, sx: 0.22, sy: 0.68, sz: 0.22 }),
        part(G_CONE6, BRASS, { x: 0.64, y: 1.48, z: 0.48, rx: 0.4, rz: -0.88, sx: 0.22, sy: 0.68, sz: 0.22 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.64, y: 1.4, sx: 0.14, sy: 0.15, sz: 0.44 }),
        part(G_OCT, 0xffffff, { x: 0.68, y: 0.92, sx: 0.26, sy: 0.32, sz: 0.34 }),
      );
      break;
    case "bulwark":
      // Wide crescent-tower-shield paladin golem with marching greaves & riveted 3-panel porcelain-and-brass tower shield
      body.push(
        part(G_DOME, IRON, { x: -0.1, y: 0.0, z: -0.34, sx: 0.46, sy: 0.34, sz: 0.34, anim: [2, 0.38, -0.1, 0.0] }),
        part(G_DOME, IRON, { x: -0.1, y: 0.0, z: 0.34, sx: 0.46, sy: 0.34, sz: 0.34, anim: [2, 0.38, -0.1, Math.PI] }),
        part(G_ROBE, BRONZE, { x: -0.1, y: 0.3, sx: 0.92, sy: 1.04, sz: 1.04 }),
        part(G_DOME, IVORY, { x: -0.06, y: 1.32, sx: 0.56, sy: 0.34, sz: 0.58 }),
        part(G_BEV, BRASS, { x: -0.06, y: 1.64, sx: 0.38, sy: 0.16, sz: 0.12 }),
        part(G_BEV, IVORY, { x: 0.6, y: 0.78, sx: 0.22, sy: 1.34, sz: 0.88, anim: [4, 0.78, 0.6, 0.0] }),
        part(G_BEV, BRONZE, {
          x: 0.46,
          y: 0.78,
          z: -0.62,
          ry: 0.42,
          sx: 0.2,
          sy: 1.24,
          sz: 0.56,
          anim: [4, 0.78, 0.46, 0.0],
        }),
        part(G_BEV, BRONZE, {
          x: 0.46,
          y: 0.78,
          z: 0.62,
          ry: -0.42,
          sx: 0.2,
          sy: 1.24,
          sz: 0.56,
          anim: [4, 0.78, 0.46, 0.0],
        }),
        part(G_OCT, BRASS, { x: 0.74, y: 0.78, sx: 0.2, sy: 0.62, sz: 0.48, anim: [4, 0.78, 0.74, 0.0] }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.78, y: 0.78, sx: 0.08, sy: 1.04, sz: 0.14, anim: [4, 0.78, 0.78, 0.0] }),
        part(G_BOX, 0xffffff, { x: 0.22, y: 1.44, sx: 0.14, sy: 0.12, sz: 0.44 }),
      );
      break;
    case "charger":
      // Low-slung forged-iron & bronze boar-ram chariot with spinning brass drive-wheels, tusks & twin exhaust bells
      body.push(
        part(G_CONE6, IVORY, { x: 0.34, y: 0.52, rz: -Math.PI / 2, sx: 0.92, sy: 1.18, sz: 1.04 }),
        part(G_DOME, BRONZE, { x: -0.22, y: 0.32, sx: 0.96, sy: 0.64, sz: 1.02 }),
        part(G_CYL8, IRON, {
          x: 0.16,
          y: 0.26,
          z: -0.58,
          rx: Math.PI / 2,
          sx: 0.52,
          sy: 0.16,
          sz: 0.52,
          anim: [6, 0.26, 0.16, 9.5],
        }),
        part(G_BOX, BRASS, { x: 0.16, y: 0.26, z: -0.66, sx: 0.44, sy: 0.08, sz: 0.05, anim: [6, 0.26, 0.16, 9.5] }),
        part(G_CYL8, IRON, {
          x: 0.16,
          y: 0.26,
          z: 0.58,
          rx: Math.PI / 2,
          sx: 0.52,
          sy: 0.16,
          sz: 0.52,
          anim: [6, 0.26, 0.16, 9.5],
        }),
        part(G_BOX, BRASS, { x: 0.16, y: 0.26, z: 0.66, sx: 0.44, sy: 0.08, sz: 0.05, anim: [6, 0.26, 0.16, 9.5] }),
        part(G_CYL8, BRASS, {
          x: -0.38,
          y: 0.24,
          z: -0.58,
          rx: Math.PI / 2,
          sx: 0.48,
          sy: 0.16,
          sz: 0.48,
          anim: [6, 0.24, -0.38, 10.5],
        }),
        part(G_BOX, IRON, { x: -0.38, y: 0.24, z: -0.66, sx: 0.4, sy: 0.08, sz: 0.05, anim: [6, 0.24, -0.38, 10.5] }),
        part(G_CYL8, BRASS, {
          x: -0.38,
          y: 0.24,
          z: 0.58,
          rx: Math.PI / 2,
          sx: 0.48,
          sy: 0.16,
          sz: 0.48,
          anim: [6, 0.24, -0.38, 10.5],
        }),
        part(G_BOX, IRON, { x: -0.38, y: 0.24, z: 0.66, sx: 0.4, sy: 0.08, sz: 0.05, anim: [6, 0.24, -0.38, 10.5] }),
        part(G_CONE6, BRASS, { x: 0.76, y: 0.46, z: -0.4, ry: -0.22, rz: -1.42, sx: 0.18, sy: 0.58, sz: 0.18 }),
        part(G_CONE6, BRASS, { x: 0.76, y: 0.46, z: 0.4, ry: 0.22, rz: -1.42, sx: 0.18, sy: 0.58, sz: 0.18 }),
        part(G_BELL, COPPER, {
          x: -0.58,
          y: 0.52,
          z: -0.26,
          rz: Math.PI / 2,
          sx: 0.28,
          sy: 0.28,
          sz: 0.28,
          anim: [4, 0.52, -0.58, 0.0],
        }),
        part(G_BELL, COPPER, {
          x: -0.58,
          y: 0.52,
          z: 0.26,
          rz: Math.PI / 2,
          sx: 0.28,
          sy: 0.28,
          sz: 0.28,
          anim: [4, 0.52, -0.58, 0.0],
        }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: -0.78, y: 0.52, sx: 0.12, sy: 0.24, sz: 0.62, anim: [4, 0.52, -0.78, 0.0] }),
        part(G_OCT, 0xffffff, { x: 0.58, y: 0.72, sx: 0.24, sy: 0.22, sz: 0.28 }),
      );
      break;
    case "driller":
      // Stout bronze-and-iron mole-engine with GPU-spinning spiral brass auger cone & counter-rotating collar
      body.push(
        part(G_POT, BRONZE, { x: -0.56, y: 0.56, rz: -Math.PI / 2, sx: 0.92, sy: 0.86, sz: 0.92 }),
        part(G_BEV, IRON, { x: -0.18, y: 0.2, z: -0.5, sx: 0.88, sy: 0.28, sz: 0.22 }),
        part(G_BEV, IRON, { x: -0.18, y: 0.2, z: 0.5, sx: 0.88, sy: 0.28, sz: 0.22 }),
        part(G_DOME, IVORY, { x: -0.18, y: 0.88, sx: 0.58, sy: 0.28, sz: 0.62 }),
        part(G_DRILL, BRASS, {
          x: 0.18,
          y: 0.56,
          rz: -Math.PI / 2,
          sx: 0.9,
          sy: 1.08,
          sz: 0.9,
          anim: [5, 0.56, 0.0, 12.0],
        }),
        part(G_TOR_SM, COPPER, {
          x: 0.2,
          y: 0.56,
          ry: Math.PI / 2,
          sx: 0.94,
          sy: 0.94,
          sz: 0.94,
          anim: [5, 0.56, 0.0, -7.5],
        }),
        part(G_OCT, BRASS, { x: 0.34, y: 0.92, sx: 0.16, sy: 0.12, sz: 0.12, anim: [5, 0.56, 0.0, 12.0] }),
        part(G_OCT, BRASS, { x: 0.34, y: 0.2, sx: 0.16, sy: 0.12, sz: 0.12, anim: [5, 0.56, 0.0, 12.0] }),
      );
      glow.push(
        part(G_TOR_SM, 0xffffff, {
          x: 0.52,
          y: 0.56,
          ry: Math.PI / 2,
          sx: 0.62,
          sy: 0.62,
          sz: 0.62,
          anim: [5, 0.56, 0.0, 12.0],
        }),
        part(G_OCT, 0xffffff, { x: -0.18, y: 1.16, sx: 0.24, sy: 0.18, sz: 0.28 }),
      );
      break;
    case "striker":
      // Swept-wing porcelain-and-indigo crescent duelist with GPU-fluttering razor V-scythes
      body.push(
        part(G_BUG, IRON, { x: -0.06, y: 0.78, rz: -Math.PI / 2, sx: 0.48, sy: 1.14, sz: 0.52 }),
        part(G_HOOD, IVORY, { x: 0.04, y: 0.92, rz: 0.65, sx: 0.44, sy: 0.5, sz: 0.4 }),
        part(G_OCT, IVORY, {
          x: 0.14,
          y: 0.82,
          z: -0.62,
          ry: 0.58,
          sx: 1.18,
          sy: 0.09,
          sz: 0.34,
          anim: [1, 0.82, -0.22, 0.0],
        }),
        part(G_OCT, IVORY, {
          x: 0.14,
          y: 0.82,
          z: 0.62,
          ry: -0.58,
          sx: 1.18,
          sy: 0.09,
          sz: 0.34,
          anim: [1, 0.82, 0.22, 0.0],
        }),
        part(G_BOX, BRASS, {
          x: 0.24,
          y: 0.86,
          z: -0.54,
          ry: 0.58,
          sx: 0.76,
          sy: 0.05,
          sz: 0.08,
          anim: [1, 0.82, -0.22, 0.0],
        }),
        part(G_BOX, BRASS, {
          x: 0.24,
          y: 0.86,
          z: 0.54,
          ry: -0.58,
          sx: 0.76,
          sy: 0.05,
          sz: 0.08,
          anim: [1, 0.82, 0.22, 0.0],
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.54, y: 0.84, sx: 0.3, sy: 0.2, sz: 0.26 }),
        part(G_BOX, 0xffffff, { x: -0.5, y: 0.82, sx: 0.16, sy: 0.1, sz: 0.26 }),
      );
      break;

    // ------------------------------------------------------------------------
    // FAMILY C — HOODED MARKSMEN & ARTILLERY (Tall cowls, brass optics, recoiling barrels & spider tripods)
    // ------------------------------------------------------------------------
    case "gunner":
      // Hooded burgundy-plum artificer with marching boots, brass goggles, copper keg & GPU-recoiling twin blunderbusses
      body.push(
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: -0.2, sx: 0.28, sy: 0.22, sz: 0.22, anim: [2, 0.28, 0.04, 0.0] }),
        part(G_DOME, IRON, { x: 0.04, y: 0.0, z: 0.2, sx: 0.28, sy: 0.22, sz: 0.22, anim: [2, 0.28, 0.04, Math.PI] }),
        part(G_ROBE, PLUM_ROBE, { y: 0.06, sx: 0.78, sy: 0.94, sz: 0.84 }),
        part(G_HOOD, accent, { x: -0.06, y: 0.96, rz: 0.38, sx: 0.54, sy: 0.56, sz: 0.54 }),
        part(G_POT, COPPER, { x: -0.34, y: 0.68, sx: 0.34, sy: 0.44, sz: 0.44 }),
        part(G_BELL, BRASS, {
          x: 0.28,
          y: 0.76,
          z: -0.38,
          rz: -Math.PI / 2,
          sx: 0.34,
          sy: 0.68,
          sz: 0.34,
          anim: [4, 0.76, 0.28, 0.0],
        }),
        part(G_BELL, BRASS, {
          x: 0.28,
          y: 0.76,
          z: 0.38,
          rz: -Math.PI / 2,
          sx: 0.34,
          sy: 0.68,
          sz: 0.34,
          anim: [4, 0.76, 0.28, 0.0],
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.22, y: 1.14, z: -0.1, sx: 0.12, sy: 0.12, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: 0.22, y: 1.14, z: 0.1, sx: 0.12, sy: 0.12, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: 0.98, y: 0.76, z: -0.38, sx: 0.16, sy: 0.16, sz: 0.16, anim: [4, 0.76, 0.28, 0.0] }),
        part(G_OCT, 0xffffff, { x: 0.98, y: 0.76, z: 0.38, sx: 0.16, sy: 0.16, sz: 0.16, anim: [4, 0.76, 0.28, 0.0] }),
      );
      break;
    case "sniper":
      // Tall peaked-cowl mystic marksman on GPU-striding brass tripod stilts with recoiling telescope sun-lance
      body.push(
        ...[-1, 0, 1].map((i) => {
          const a = i * 2.1;
          return part(G_CYL6, BRASS, {
            x: Math.cos(a) * 0.3,
            y: 0.18,
            z: Math.sin(a) * 0.3,
            ry: -a,
            rz: -0.4,
            sx: 0.11,
            sy: 0.42,
            sz: 0.11,
            anim: [2, 0.36, Math.cos(a) * 0.18, (i + 1) * 2.09],
          });
        }),
        part(G_ROBE, NAVY_ROBE, { y: 0.3, sx: 0.56, sy: 1.06, sz: 0.56 }),
        part(G_HOOD, PLUM_ROBE, { x: -0.08, y: 1.28, rz: 0.44, sx: 0.48, sy: 0.62, sz: 0.46 }),
        part(G_CYL6, IVORY, {
          x: 0.86,
          y: 1.12,
          rz: Math.PI / 2,
          sx: 0.12,
          sy: 1.54,
          sz: 0.12,
          anim: [4, 1.12, 0.4, 0.0],
        }),
        part(G_BELL, BRASS, {
          x: 1.38,
          y: 1.12,
          rz: -Math.PI / 2,
          sx: 0.22,
          sy: 0.28,
          sz: 0.22,
          anim: [4, 1.12, 0.4, 0.0],
        }),
        part(G_CYL6, COPPER, {
          x: 0.52,
          y: 1.28,
          rz: Math.PI / 2,
          sx: 0.11,
          sy: 0.48,
          sz: 0.11,
          anim: [4, 1.28, 0.4, 0.0],
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.26, y: 1.46, sx: 0.2, sy: 0.18, sz: 0.22 }),
        part(G_BOX, 0xffffff, { x: 0.96, y: 1.18, sx: 0.9, sy: 0.05, sz: 0.05, anim: [4, 1.18, 0.4, 0.0] }),
        part(G_OCT, 0xffffff, { x: 0.78, y: 1.28, sx: 0.11, sy: 0.11, sz: 0.11, anim: [4, 1.28, 0.4, 0.0] }),
      );
      break;
    case "mortar":
      // Squat brass-and-oak spider-howitzer with 4 GPU-striding legs & recoiling flared bell-mortar
      body.push(
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + Math.PI / 4;
          return part(G_CONE6, IRON, {
            x: Math.cos(a) * 0.62,
            y: 0.22,
            z: Math.sin(a) * 0.62,
            ry: -a,
            rz: -0.48,
            sx: 0.22,
            sy: 0.5,
            sz: 0.22,
            anim: [2, 0.36, Math.cos(a) * 0.4, (i % 2) * Math.PI],
          });
        }),
        part(G_POT, NAVY_ROBE, { y: 0.24, sx: 1.08, sy: 0.58, sz: 1.08 }),
        part(G_BELL, BRASS, { x: 0.08, y: 0.72, rz: -0.44, sx: 0.74, sy: 0.98, sz: 0.74, anim: [4, 0.72, 0.08, 0.0] }),
        part(G_TOR_SM, COPPER, {
          x: 0.36,
          y: 1.48,
          rz: -0.44,
          rx: Math.PI / 2,
          sx: 0.64,
          sy: 0.64,
          sz: 0.64,
          anim: [4, 1.48, 0.36, 0.0],
        }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.42, y: 1.56, sx: 0.36, sy: 0.34, sz: 0.36, anim: [4, 1.56, 0.42, 0.0] }),
        part(G_BOX, 0xffffff, { x: 0.48, y: 0.64, sx: 0.1, sy: 0.14, sz: 0.38 }),
      );
      break;
    case "turret":
      // Carved stone-and-brass clockwork watchtower with spinning gear-ring & GPU-recoiling twin long cannons
      body.push(
        part(G_ROBE, NAVY_ROBE, { y: 0.0, sx: 1.26, sy: 0.64, sz: 1.26 }),
        part(G_TOR_SM, BRASS, { y: 0.64, rx: Math.PI / 2, sx: 1.06, sy: 1.06, sz: 1.06, anim: [3, 0.64, 0, 1.8] }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4;
          return part(G_OCT, COPPER, {
            x: Math.cos(a) * 0.56,
            y: 0.64,
            z: Math.sin(a) * 0.56,
            sx: 0.14,
            sy: 0.12,
            sz: 0.14,
            anim: [3, 0.64, 0, 1.8],
          });
        }),
        part(G_DOME, IVORY, { y: 0.64, sx: 0.88, sy: 0.62, sz: 0.88 }),
        part(G_CYL6, IRON, {
          x: 0.64,
          y: 0.88,
          z: -0.24,
          rz: Math.PI / 2,
          sx: 0.17,
          sy: 0.96,
          sz: 0.17,
          anim: [4, 0.88, 0.4, 0.0],
        }),
        part(G_CYL6, IRON, {
          x: 0.64,
          y: 0.88,
          z: 0.24,
          rz: Math.PI / 2,
          sx: 0.17,
          sy: 0.96,
          sz: 0.17,
          anim: [4, 0.88, 0.4, 0.0],
        }),
        part(G_BELL, BRASS, {
          x: 0.92,
          y: 0.88,
          z: -0.24,
          rz: -Math.PI / 2,
          sx: 0.28,
          sy: 0.24,
          sz: 0.28,
          anim: [4, 0.88, 0.4, 0.0],
        }),
        part(G_BELL, BRASS, {
          x: 0.92,
          y: 0.88,
          z: 0.24,
          rz: -Math.PI / 2,
          sx: 0.28,
          sy: 0.24,
          sz: 0.28,
          anim: [4, 0.88, 0.4, 0.0],
        }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.44, y: 0.98, sx: 0.12, sy: 0.14, sz: 0.52 }),
        part(G_OCT, 0xffffff, { y: 1.44, sx: 0.24, sy: 0.28, sz: 0.24, anim: [3, 1.44, 0, -2.0] }),
      );
      break;
    case "sentinel":
      // Tall tri-pillar floating obelisk: towering carved monolith flanked by 3 orbiting obelisk spires & Cyclops prism eye
      body.push(
        part(G_BEV, PLUM_ROBE, { y: 1.18, sx: 0.42, sy: 1.56, sz: 0.42 }),
        part(G_CONE6, BRASS, { y: 2.12, sx: 0.42, sy: 0.46, sz: 0.42 }),
        part(G_CONE6, BRASS, { y: 0.24, rx: Math.PI, sx: 0.36, sy: 0.38, sz: 0.36 }),
        // Three distinct floating vertical obelisk pillars arranged around the spire
        ...Array.from({ length: 3 }, (_, i) => {
          const a = (i * TAU) / 3 + Math.PI / 6;
          return part(G_BEV, IVORY, {
            x: Math.cos(a) * 0.54,
            y: 1.12,
            z: Math.sin(a) * 0.54,
            ry: -a,
            sx: 0.16,
            sy: 1.48,
            sz: 0.22,
            anim: [3, 1.12, 0, 1.1],
          });
        }),
        ...Array.from({ length: 3 }, (_, i) => {
          const a = (i * TAU) / 3 + Math.PI / 6;
          return part(G_CONE6, BRASS, {
            x: Math.cos(a) * 0.54,
            y: 1.98,
            z: Math.sin(a) * 0.54,
            sx: 0.18,
            sy: 0.26,
            sz: 0.18,
            anim: [3, 1.98, 0, 1.1],
          });
        }),
        part(G_TOR_SM, BRASS, { y: 0.68, rx: Math.PI / 2, sx: 1.04, sy: 1.04, sz: 1.04, anim: [3, 0.68, 0, -1.8] }),
        part(G_TOR_SM, BRASS, { y: 1.62, rx: Math.PI / 2, sx: 0.96, sy: 0.96, sz: 0.96, anim: [3, 1.62, 0, 2.2] }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.26, y: 1.24, sx: 0.42, sy: 0.42, sz: 0.42 }),
        part(G_OCT, 0xffffff, { y: 2.48, sx: 0.22, sy: 0.34, sz: 0.22, anim: [3, 2.48, 0, 2.4] }),
      );
      break;

    // ------------------------------------------------------------------------
    // FAMILY D — VOLATILE COPPER KETTLE-KIN (Pot-bellied vessels, spinning wind-up keys, scurrying feet)
    // ------------------------------------------------------------------------
    case "bomber":
      // Round pot-bellied copper kettle-bomb with throbbing furnace belly, GPU-spinning wind-up key & scurrying feet
      body.push(
        part(G_POT, COPPER, { y: 0.22, sx: 1.02, sy: 0.96, sz: 1.02, anim: [4, 0.68, 0, -1.4] }),
        part(G_TOR_SM, IRON, { y: 0.68, rx: Math.PI / 2, sx: 1.08, sy: 1.08, sz: 1.08 }),
        part(G_CYL6, VERMILION, { y: 1.16, sx: 0.46, sy: 0.14, sz: 0.46 }),
        part(G_DOME, IRON, { x: 0.08, y: 0.0, z: -0.36, sx: 0.32, sy: 0.24, sz: 0.26, anim: [2, 0.24, 0.08, 0.0] }),
        part(G_DOME, IRON, { x: 0.08, y: 0.0, z: 0.36, sx: 0.32, sy: 0.24, sz: 0.26, anim: [2, 0.24, 0.08, Math.PI] }),
        // Wind-up brass key on back spinning around X-axis
        part(G_CYL6, BRASS, {
          x: -0.52,
          y: 0.72,
          rz: Math.PI / 2,
          sx: 0.1,
          sy: 0.24,
          sz: 0.1,
          anim: [5, 0.72, 0.0, 9.5],
        }),
        part(G_TOR_SM, BRASS, { x: -0.66, y: 0.72, z: -0.14, sx: 0.26, sy: 0.26, sz: 0.26, anim: [5, 0.72, 0.0, 9.5] }),
        part(G_TOR_SM, BRASS, { x: -0.66, y: 0.72, z: 0.14, sx: 0.26, sy: 0.26, sz: 0.26, anim: [5, 0.72, 0.0, 9.5] }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { x: 0.18, y: 0.68, sx: 0.68, sy: 0.64, sz: 0.68, anim: [4, 0.68, 0.18, -1.4] }),
        part(G_OCT, 0xffffff, { y: 1.36, sx: 0.34, sy: 0.4, sz: 0.34 }),
      );
      break;
    case "minebot":
      // Round copper-and-vermilion clockwork turtle-kettle with pulsing ordnance dome & 4 GPU-scurrying crab legs
      body.push(
        part(G_DOME, VERMILION, { y: 0.18, sx: 1.06, sy: 0.56, sz: 1.06 }),
        part(G_TOR_SM, COPPER, { y: 0.48, rx: Math.PI / 2, sx: 1.0, sy: 1.0, sz: 1.0 }),
        ...Array.from({ length: 4 }, (_, i) => {
          const a = (i * TAU) / 4 + Math.PI / 4;
          return part(G_CONE6, IRON, {
            x: Math.cos(a) * 0.58,
            y: 0.16,
            z: Math.sin(a) * 0.58,
            ry: -a,
            rz: -0.55,
            sx: 0.16,
            sy: 0.36,
            sz: 0.16,
            anim: [2, 0.28, Math.cos(a) * 0.42, (i % 2) * Math.PI],
          });
        }),
        part(G_BEV, BRASS, { x: 0.46, y: 0.42, sx: 0.2, sy: 0.18, sz: 0.36 }),
      );
      glow.push(
        part(G_SPH, 0xffffff, { y: 0.78, sx: 0.48, sy: 0.36, sz: 0.48, anim: [4, 0.72, 0, -1.8] }),
        part(G_BOX, 0xffffff, { x: 0.56, y: 0.42, sx: 0.08, sy: 0.1, sz: 0.24 }),
      );
      break;
    case "sapper":
      // Nimble hooded vermilion-enamel tinker with scurrying boots & throbbing twin copper powder-kegs
      body.push(
        part(G_DOME, IRON, { y: 0.0, z: -0.2, sx: 0.3, sy: 0.22, sz: 0.22, anim: [2, 0.24, 0.0, 0.0] }),
        part(G_DOME, IRON, { y: 0.0, z: 0.2, sx: 0.3, sy: 0.22, sz: 0.22, anim: [2, 0.24, 0.0, Math.PI] }),
        part(G_ROBE, VERMILION, { y: 0.2, sx: 0.66, sy: 0.78, sz: 0.7 }),
        part(G_HOOD, COPPER, { x: 0.02, y: 0.94, rz: 0.34, sx: 0.48, sy: 0.46, sz: 0.48 }),
        part(G_POT, COPPER, { x: -0.34, y: 0.54, z: -0.22, sx: 0.32, sy: 0.54, sz: 0.32, anim: [4, 0.8, -0.34, -1.0] }),
        part(G_POT, COPPER, { x: -0.34, y: 0.54, z: 0.22, sx: 0.32, sy: 0.54, sz: 0.32, anim: [4, 0.8, -0.34, -2.5] }),
        part(G_BOX, BRASS, { x: -0.34, y: 1.1, sx: 0.22, sy: 0.08, sz: 0.56 }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.3, y: 1.12, sx: 0.14, sy: 0.12, sz: 0.28 }),
        part(G_OCT, 0xffffff, {
          x: -0.34,
          y: 1.26,
          z: -0.22,
          sx: 0.18,
          sy: 0.2,
          sz: 0.18,
          anim: [4, 1.2, -0.34, -1.0],
        }),
        part(G_OCT, 0xffffff, { x: -0.34, y: 1.26, z: 0.22, sx: 0.18, sy: 0.2, sz: 0.18, anim: [4, 1.2, -0.34, -2.5] }),
      );
      break;

    // ------------------------------------------------------------------------
    // FAMILY E — ARCANE LANTERN-SPIRITS & RELAYS (Floating shrines, spinning astrolabe rings & rotors)
    // ------------------------------------------------------------------------
    case "mender":
      // Wide botanical mushroom-parasol & herbal gourd apothecary spirit with spinning healing cross
      body.push(
        part(G_POT, PARCHMENT, { y: 0.34, sx: 0.72, sy: 0.72, sz: 0.72, anim: [4, 0.68, 0, -1.6] }),
        part(G_TOR_SM, LEATHER, { y: 0.68, rx: Math.PI / 2, sx: 0.74, sy: 0.74, sz: 0.74 }),
        part(G_CYL8, IVORY, { y: 1.04, sx: 0.28, sy: 0.44, sz: 0.28 }),
        part(sculptedCap(0.92, 0.44, 71), 0x32986e, { y: 1.18 }),
        part(G_TOR_SM, BRASS, { y: 1.2, rx: Math.PI / 2, sx: 1.66, sy: 1.66, sz: 1.0, anim: [3, 1.2, 0, 1.4] }),
        part(G_POT, COPPER, { x: -0.34, y: 0.56, z: -0.34, sx: 0.28, sy: 0.36, sz: 0.28 }),
        part(G_POT, COPPER, { x: -0.34, y: 0.56, z: 0.34, sx: 0.28, sy: 0.36, sz: 0.28 }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { y: 1.84, sx: 0.12, sy: 0.44, sz: 0.12, anim: [3, 1.84, 0, -1.9] }),
        part(G_BOX, 0xffffff, { y: 1.84, sx: 0.12, sy: 0.12, sz: 0.44, anim: [3, 1.84, 0, -1.9] }),
        part(G_OCT, 0xffffff, { x: 0.36, y: 0.68, sx: 0.22, sy: 0.24, sz: 0.22, anim: [4, 0.68, 0.36, -1.6] }),
        part(G_OCT, 0xffffff, { y: 1.14, z: -0.68, sx: 0.14, sy: 0.24, sz: 0.14, anim: [3, 1.14, 0, 1.4] }),
        part(G_OCT, 0xffffff, { y: 1.14, z: 0.68, sx: 0.14, sy: 0.24, sz: 0.14, anim: [3, 1.14, 0, 1.4] }),
      );
      break;
    case "phantom":
      // Crescent moon-sickle wings & multi-ribbon tattered veil wraith
      body.push(
        part(G_HOOD, NAVY_ROBE, { x: -0.06, y: 1.06, rz: 0.38, sx: 0.56, sy: 0.68, sz: 0.54 }),
        // Tattered hanging veil strips fluttering below cowl
        part(G_CONE6, PLUM_ROBE, { x: -0.02, y: 0.62, rx: Math.PI, sx: 0.54, sy: 0.82, sz: 0.54 }),
        part(G_CONE6, PLUM_ROBE, {
          x: -0.18,
          y: 0.54,
          z: -0.24,
          rx: Math.PI + 0.18,
          sx: 0.22,
          sy: 0.72,
          sz: 0.22,
          anim: [1, 1.0, -0.22, 0.4],
        }),
        part(G_CONE6, PLUM_ROBE, {
          x: -0.18,
          y: 0.54,
          z: 0.24,
          rx: Math.PI - 0.18,
          sx: 0.22,
          sy: 0.72,
          sz: 0.22,
          anim: [1, 1.0, 0.22, 0.4],
        }),
        // Sweeping twin crescent moon-sickle wings arching wide on both flanks
        part(G_OCT, IVORY, {
          x: -0.12,
          y: 1.16,
          z: -0.66,
          rx: 0.36,
          ry: 0.42,
          sx: 0.56,
          sy: 0.1,
          sz: 0.78,
          anim: [1, 1.14, -0.26, 0.0],
        }),
        part(G_CONE6, PARCHMENT, {
          x: 0.16,
          y: 1.24,
          z: -0.96,
          rx: -0.35,
          rz: -1.32,
          sx: 0.14,
          sy: 0.66,
          sz: 0.14,
          anim: [1, 1.14, -0.26, 0.0],
        }),
        part(G_OCT, IVORY, {
          x: -0.12,
          y: 1.16,
          z: 0.66,
          rx: -0.36,
          ry: -0.42,
          sx: 0.56,
          sy: 0.1,
          sz: 0.78,
          anim: [1, 1.14, 0.26, 0.0],
        }),
        part(G_CONE6, PARCHMENT, {
          x: 0.16,
          y: 1.24,
          z: 0.96,
          rx: 0.35,
          rz: -1.32,
          sx: 0.14,
          sy: 0.66,
          sz: 0.14,
          anim: [1, 1.14, 0.26, 0.0],
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.24, y: 1.26, z: -0.1, sx: 0.12, sy: 0.13, sz: 0.12 }),
        part(G_OCT, 0xffffff, { x: 0.24, y: 1.26, z: 0.1, sx: 0.12, sy: 0.13, sz: 0.12 }),
        part(G_OCT, 0xffffff, {
          x: 0.08,
          y: 1.22,
          z: -0.78,
          ry: 0.42,
          sx: 0.42,
          sy: 0.06,
          sz: 0.28,
          anim: [1, 1.14, -0.26, 0.0],
        }),
        part(G_OCT, 0xffffff, {
          x: 0.08,
          y: 1.22,
          z: 0.78,
          ry: -0.42,
          sx: 0.42,
          sy: 0.06,
          sz: 0.28,
          anim: [1, 1.14, 0.26, 0.0],
        }),
        part(G_TOR_SM, 0xffffff, { y: 0.48, rx: 0.32, sx: 0.9, sy: 0.9, sz: 0.9, anim: [3, 0.48, 0, 2.2] }),
      );
      break;
    case "carrier":
      // Ornate floating wooden-and-brass sky-galleon with spinning side airscrews & pulsing hangar bay
      body.push(
        part(G_DOME, LEATHER, { y: 0.76, rx: Math.PI, sx: 1.24, sy: 0.42, sz: 1.32 }),
        part(G_LANTERN, PARCHMENT, { x: 0.04, y: 0.84, sx: 0.78, sy: 0.52, sz: 0.78, anim: [4, 0.95, 0.04, -1.5] }),
        part(G_CONE6, BRASS, { x: -0.06, y: 1.5, sx: 0.72, sy: 0.32, sz: 0.72 }),
        part(G_BUG, NAVY_ROBE, { x: 0.12, y: 0.84, z: -0.82, rz: -Math.PI / 2, sx: 0.32, sy: 1.36, sz: 0.34 }),
        part(G_BUG, NAVY_ROBE, { x: 0.12, y: 0.84, z: 0.82, rz: -Math.PI / 2, sx: 0.32, sy: 1.36, sz: 0.34 }),
        // Spinning rear brass airscrew blades on both pontoons
        part(G_BOX, BRASS, { x: -0.58, y: 0.84, z: -0.82, sx: 0.06, sy: 0.46, sz: 0.1, anim: [5, 0.84, -0.82, 13.0] }),
        part(G_BOX, BRASS, { x: -0.58, y: 0.84, z: 0.82, sx: 0.06, sy: 0.46, sz: 0.1, anim: [5, 0.84, 0.82, -13.0] }),
      );
      glow.push(
        part(G_BOX, 0xffffff, { x: 0.62, y: 0.88, sx: 0.12, sy: 0.2, sz: 0.88, anim: [4, 0.88, 0.62, -1.5] }),
        part(G_OCT, 0xffffff, { x: -0.06, y: 1.76, sx: 0.3, sy: 0.28, sz: 0.3, anim: [3, 1.76, -0.06, 1.6] }),
      );
      break;
    case "drone":
      // Sleek brass-ringed clockwork dragonfly with GPU-buzzing filigree wings & spinning gyro ring
      body.push(
        part(G_LANTERN, PARCHMENT, { x: -0.04, y: 0.86, rz: -Math.PI / 2, sx: 0.48, sy: 0.64, sz: 0.48 }),
        part(G_OCT, BRASS, {
          x: 0.0,
          y: 0.9,
          z: -0.5,
          ry: 0.28,
          sx: 0.48,
          sy: 0.065,
          sz: 0.46,
          anim: [1, 0.88, -0.18, 0.0],
        }),
        part(G_OCT, BRASS, {
          x: 0.0,
          y: 0.9,
          z: 0.5,
          ry: -0.28,
          sx: 0.48,
          sy: 0.065,
          sz: 0.46,
          anim: [1, 0.88, 0.18, 0.0],
        }),
        part(G_TOR_SM, BRASS, { y: 0.88, rx: Math.PI / 2, sx: 0.72, sy: 0.72, sz: 0.72, anim: [3, 0.88, 0, 2.6] }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.34, y: 0.88, sx: 0.24, sy: 0.22, sz: 0.24 }),
        part(G_OCT, 0xffffff, { x: -0.44, y: 0.88, sx: 0.16, sy: 0.16, sz: 0.16 }),
      );
      break;
    case "beacon":
      // Stacked stone dolmen arch (twin standing rune-monoliths + wide stone lintel) with swinging hanging censer
      body.push(
        part(G_BEV, NAVY_ROBE, { y: 0.16, sx: 0.72, sy: 0.26, sz: 1.48 }),
        part(G_BEV, IVORY, { y: 0.84, z: -0.56, sx: 0.34, sy: 1.14, sz: 0.32 }),
        part(G_BEV, IVORY, { y: 0.84, z: 0.56, sx: 0.34, sy: 1.14, sz: 0.32 }),
        part(G_BEV, BRASS, { y: 0.84, z: -0.56, sx: 0.38, sy: 0.12, sz: 0.36 }),
        part(G_BEV, BRASS, { y: 0.84, z: 0.56, sx: 0.38, sy: 0.12, sz: 0.36 }),
        // Wide carved dolmen lintel slab spanning the arch
        part(G_BEV, NAVY_ROBE, { y: 1.5, sx: 0.56, sy: 0.3, sz: 1.68 }),
        part(G_BEV, BRASS, { y: 1.66, sx: 0.42, sy: 0.1, sz: 1.4 }),
        // Swinging hanging brass censer suspended beneath the center of the stone arch
        part(G_CYL6, BRASS, { y: 1.18, sx: 0.06, sy: 0.42, sz: 0.06, anim: [3, 1.36, 0, 1.8] }),
        part(G_POT, COPPER, { y: 0.68, sx: 0.36, sy: 0.34, sz: 0.36, anim: [3, 1.36, 0, 1.8] }),
      );
      glow.push(
        part(G_LANTERN, 0xffffff, { y: 0.78, sx: 0.32, sy: 0.4, sz: 0.32, anim: [3, 1.36, 0, 1.8] }),
        part(G_OCT, 0xffffff, { y: 1.96, sx: 0.32, sy: 0.44, sz: 0.32, anim: [3, 1.96, 0, -2.1] }),
      );
      break;
    case "weaver":
      // 6-armed spinning celestial loom wheel framing a slender indigo weaver core
      body.push(
        part(G_ROBE, PLUM_ROBE, { x: 0.12, y: 0.34, sx: 0.52, sy: 0.96, sz: 0.52 }),
        part(G_HOOD, NAVY_ROBE, { x: 0.1, y: 1.24, rz: 0.3, sx: 0.42, sy: 0.44, sz: 0.42 }),
        // Giant vertical 6-armed brass loom wheel behind the weaver spinning continuously around X-axis (Mode 5)
        part(G_TOR, BRASS, {
          x: -0.24,
          y: 1.04,
          ry: Math.PI / 2,
          sx: 1.56,
          sy: 1.56,
          sz: 1.56,
          anim: [5, 1.04, 0, 2.8],
        }),
        ...Array.from({ length: 6 }, (_, i) => {
          const a = (i * TAU) / 6;
          return part(G_CYL6, COPPER, {
            x: -0.24,
            y: 1.04 + Math.cos(a) * 0.46,
            z: Math.sin(a) * 0.46,
            rx: a,
            sx: 0.075,
            sy: 0.92,
            sz: 0.075,
            anim: [5, 1.04, 0, 2.8],
          });
        }),
        ...Array.from({ length: 6 }, (_, i) => {
          const a = (i * TAU) / 6;
          return part(G_OCT, IVORY, {
            x: -0.24,
            y: 1.04 + Math.cos(a) * 0.88,
            z: Math.sin(a) * 0.88,
            sx: 0.15,
            sy: 0.18,
            sz: 0.15,
            anim: [5, 1.04, 0, 2.8],
          });
        }),
      );
      glow.push(
        part(G_OCT, 0xffffff, { x: 0.34, y: 1.26, sx: 0.22, sy: 0.22, sz: 0.24 }),
        part(G_TOR_SM, 0xffffff, {
          x: -0.24,
          y: 1.04,
          ry: Math.PI / 2,
          sx: 0.92,
          sy: 0.92,
          sz: 0.92,
          anim: [5, 1.04, 0, -4.2],
        }),
        ...Array.from({ length: 3 }, (_, i) => {
          const a = (i * TAU) / 3;
          return part(G_OCT, 0xffffff, {
            x: -0.24,
            y: 1.04 + Math.cos(a) * 0.78,
            z: Math.sin(a) * 0.78,
            sx: 0.13,
            sy: 0.13,
            sz: 0.13,
            anim: [5, 1.04, 0, 2.8],
          });
        }),
      );
      break;
    default:
      body.push(part(G_DOME, IVORY, { y: 0.1, sx: 0.8, sy: 0.8, sz: 0.8, anim: [4, 0.4, 0, -1.0] }));
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
  built.gearY = built.body.computeBounds().max.y;
  enemyGeoCache.set(type, built);
  return built;
}

// ============================================================================
// VISIBLE 3D BIOME-VARIANT & ELITE AFFIX ATTACHMENT KITS
// ============================================================================

export function variantAttachmentGeometry(id) {
  const body = [];
  const glow = [];
  if (id === "shorted") {
    // Courtyard Brim-Lit: tilted antique-brass oil-lantern brazier brimming with warm amber flame
    body.push(
      part(G_CYL6, BRASS, { x: -0.14, y: 1.16, sx: 0.24, sy: 0.16, sz: 0.24 }),
      part(G_TOR_SM, COPPER, { x: -0.14, y: 1.24, rx: Math.PI / 2, sx: 0.42, sy: 0.42, sz: 0.42 }),
      part(G_CONE6, BRASS, { x: -0.14, y: 1.54, sx: 0.34, sy: 0.18, sz: 0.34 }),
    );
    glow.push(part(G_OCT, 0xffcc68, { x: -0.14, y: 1.38, sx: 0.24, sy: 0.32, sz: 0.24, anim: [3, 1.38, -0.14, 2.4] }));
  } else if (id === "frost") {
    // Shelf Frost: crystalline sapphire ice-horn crown & rime shoulder shards
    body.push(
      part(G_CONE6, 0x5cc4f2, { x: 0.04, y: 1.32, z: -0.28, rx: -0.35, sx: 0.2, sy: 0.52, sz: 0.2 }),
      part(G_CONE6, 0x5cc4f2, { x: 0.04, y: 1.32, z: 0.28, rx: 0.35, sx: 0.2, sy: 0.52, sz: 0.2 }),
    );
    glow.push(part(G_OCT, 0xd8f8ff, { x: 0.06, y: 1.48, sx: 0.2, sy: 0.38, sz: 0.2 }));
  } else if (id === "phase") {
    // Core Phase: orbiting violet rift-glyph astrolabe halo
    body.push(part(G_TOR_SM, BRASS, { y: 1.38, rx: 0.38, sx: 0.82, sy: 0.82, sz: 0.82, anim: [3, 1.38, 0, 2.8] }));
    glow.push(
      part(G_OCT, 0xdc9cff, { y: 1.38, z: -0.42, sx: 0.18, sy: 0.28, sz: 0.18, anim: [3, 1.38, 0, 2.8] }),
      part(G_OCT, 0xdc9cff, { y: 1.38, z: 0.42, sx: 0.18, sy: 0.28, sz: 0.18, anim: [3, 1.38, 0, 2.8] }),
    );
  } else if (id === "bloomed") {
    // Marsh Bloomed: miniature glowing marsh toadstools sprouting on shoulders/back!
    body.push(
      part(G_CYL6, PARCHMENT, { x: -0.12, y: 1.08, z: -0.26, rx: -0.22, sx: 0.09, sy: 0.28, sz: 0.09 }),
      part(sculptedCap(0.22, 0.16, 43), 0x2ea472, { x: -0.12, y: 1.2, z: -0.3 }),
      part(G_CYL6, PARCHMENT, { x: -0.16, y: 1.04, z: 0.24, rx: 0.2, sx: 0.08, sy: 0.24, sz: 0.08 }),
      part(sculptedCap(0.18, 0.13, 51), 0xd4964a, { x: -0.16, y: 1.14, z: 0.27 }),
    );
    glow.push(
      part(G_OCT, 0x98ffd0, { x: -0.12, y: 1.34, z: -0.3, sx: 0.14, sy: 0.08, sz: 0.14 }),
      part(G_OCT, 0xffe494, { x: -0.16, y: 1.25, z: 0.27, sx: 0.12, sy: 0.07, sz: 0.12 }),
    );
  } else if (id === "sunstruck") {
    // Flats Sunstruck: radiant burnished-brass sun-crest halo behind shoulders
    body.push(part(G_TOR_SM, BRASS, { x: -0.14, y: 1.36, ry: Math.PI / 2, sx: 0.76, sy: 0.76, sz: 0.76 }));
    for (let i = 0; i < 5; i++) {
      const a = -1.1 + (i / 4) * 2.2;
      glow.push(
        part(G_CONE6, 0xffe28a, {
          x: -0.14,
          y: 1.36 + Math.cos(a) * 0.44,
          z: Math.sin(a) * 0.44,
          rx: a,
          sx: 0.1,
          sy: 0.24,
          sz: 0.1,
        }),
      );
    }
  } else {
    // Caldera Flareheart: molten magma core vents & bronze furnace pipes on shoulders
    body.push(
      part(G_BELL, COPPER, { x: -0.16, y: 1.12, z: -0.28, rx: -0.28, sx: 0.22, sy: 0.34, sz: 0.22 }),
      part(G_BELL, COPPER, { x: -0.16, y: 1.12, z: 0.28, rx: 0.28, sx: 0.22, sy: 0.34, sz: 0.22 }),
    );
    glow.push(
      part(G_OCT, 0xff9438, { x: -0.16, y: 1.44, z: -0.34, sx: 0.18, sy: 0.24, sz: 0.18, anim: [4, 1.4, -0.16, -1.6] }),
      part(G_OCT, 0xff9438, { x: -0.16, y: 1.44, z: 0.34, sx: 0.18, sy: 0.24, sz: 0.18, anim: [4, 1.4, -0.16, -2.8] }),
    );
  }
  return { body: mergeGeometries(body), glow: mergeGeometries(glow) };
}

export function affixAttachmentGeometry(id) {
  const body = [];
  const glow = [];
  if (id === "shielded") {
    // Shielded Elite: 3 orbiting porcelain-and-cyan hexagonal aegis-plates
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3;
      body.push(
        part(G_BEV, IVORY, {
          x: Math.cos(a) * 0.88,
          y: 0.78,
          z: Math.sin(a) * 0.88,
          ry: -a,
          sx: 0.1,
          sy: 0.44,
          sz: 0.34,
          anim: [3, 0.78, 0, 2.2],
        }),
      );
      glow.push(
        part(G_OCT, 0x8ef2ff, {
          x: Math.cos(a) * 0.92,
          y: 0.78,
          z: Math.sin(a) * 0.92,
          ry: -a,
          sx: 0.08,
          sy: 0.28,
          sz: 0.2,
          anim: [3, 0.78, 0, 2.2],
        }),
      );
    }
  } else if (id === "hasted") {
    // Hasted Elite: swept burnished-brass Hermes speed-chevrons / wing-fins
    body.push(
      part(G_OCT, BRASS, {
        x: -0.22,
        y: 0.92,
        z: -0.52,
        ry: 0.55,
        sx: 0.62,
        sy: 0.08,
        sz: 0.24,
        anim: [1, 0.9, -0.32, 0.0],
      }),
      part(G_OCT, BRASS, {
        x: -0.22,
        y: 0.92,
        z: 0.52,
        ry: -0.55,
        sx: 0.62,
        sy: 0.08,
        sz: 0.24,
        anim: [1, 0.9, 0.32, 0.0],
      }),
    );
    glow.push(
      part(G_BOX, 0xffe484, {
        x: -0.32,
        y: 0.94,
        z: -0.54,
        ry: 0.55,
        sx: 0.46,
        sy: 0.05,
        sz: 0.08,
        anim: [1, 0.9, -0.32, 0.0],
      }),
      part(G_BOX, 0xffe484, {
        x: -0.32,
        y: 0.94,
        z: 0.54,
        ry: -0.55,
        sx: 0.46,
        sy: 0.05,
        sz: 0.08,
        anim: [1, 0.9, 0.32, 0.0],
      }),
    );
  } else {
    // Volatile Elite: pulsing copper-and-vermilion hazard-kettle crown
    body.push(
      part(G_POT, VERMILION, { y: 1.42, sx: 0.38, sy: 0.36, sz: 0.38, anim: [4, 1.56, 0, -2.0] }),
      part(G_TOR_SM, COPPER, { y: 1.58, rx: Math.PI / 2, sx: 0.4, sy: 0.4, sz: 0.4, anim: [4, 1.56, 0, -2.0] }),
    );
    glow.push(part(G_OCT, 0xff9244, { y: 1.82, sx: 0.24, sy: 0.3, sz: 0.24, anim: [4, 1.56, 0, -2.0] }));
  }
  return { body: mergeGeometries(body), glow: mergeGeometries(glow) };
}

// ============================================================================
// ALL 6 MONUMENTAL HANDCRAFTED DIORAMA BIOME BOSSES (<= 6500 tris each)
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
    emissiveIntensity: 1.24,
    transparent: true,
    opacity: 1,
  });
  const overdriveMat = emissiveMaterial({
    color: accentHex,
    emissiveIntensity: 1.65,
    transparent: true,
    opacity: 0.95,
  });
  const mats = [bodyMat];
  const fadeMats = [bodyMat];
  const spin = [];
  const pose = {};
  const phase2 = new Node();
  phase2.scale.setScalar(0.001);
  phase2.visible = false;
  group.add(phase2);

  if (type === "bellkeeper") {
    // LANTERN COURTYARD — Lantern-Shrine Ironclad Bellkeeper (articulated walking legs + bell-mortar arms + overdrive lantern halo)
    const hull = mergeGeometries([
      part(G_ROBE, 0x223444, { y: 0.62, sx: 2.04, sy: 1.0, sz: 2.32 }),
      part(G_POT, 0x355064, { x: 0.08, y: 1.32, sx: 2.26, sy: 1.46, sz: 2.76 }),
      part(G_DOME, IVORY, { x: 0.94, y: 1.56, rz: -0.2, sx: 0.66, sy: 0.98, sz: 1.52 }),
      part(G_BEV, BRASS, { x: 1.2, y: 2.05, sx: 0.24, sy: 1.0, sz: 0.26 }),
      part(G_TOR_SM, BRASS, { x: 0.08, y: 1.32, rx: Math.PI / 2, sx: 2.28, sy: 2.68, sz: 2.28 }),
      // Pagoda-eaved shoulder lantern bastions
      part(G_DOME, 0x243b4c, { y: 2.28, z: -1.62, rx: 0.22, sx: 1.54, sy: 0.86, sz: 1.04 }),
      part(G_DOME, 0x243b4c, { y: 2.28, z: 1.62, rx: -0.22, sx: 1.54, sy: 0.86, sz: 1.04 }),
      part(G_CONE6, BRASS, { y: 3.14, z: -1.62, sx: 1.16, sy: 0.46, sz: 1.16 }),
      part(G_CONE6, BRASS, { y: 3.14, z: 1.62, sx: 1.16, sy: 0.46, sz: 1.16 }),
      // Crested sentinel porcelain helm + brass pagoda finial
      part(G_DOME, IVORY, { x: 0.24, y: 2.66, sx: 1.1, sy: 0.8, sz: 1.14 }),
      part(G_CONE6, 0x1e3242, { x: 0.22, y: 3.5, sx: 0.88, sy: 0.44, sz: 0.88 }),
      part(G_CONE6, BRASS, { x: 0.22, y: 3.88, sx: 0.24, sy: 0.48, sz: 0.24 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));

    const makeBellLeg = (side) => {
      const leg = new Node();
      leg.position.set(0.06, 0.78, side * 0.84);
      leg.add(
        new MeshNode(
          mergeGeometries([
            part(G_CYL8, 0x223444, { y: -0.26, sx: 0.68, sy: 0.56, sz: 0.66 }),
            part(G_TOR_SM, BRASS, { y: -0.44, rx: Math.PI / 2, sx: 0.74, sy: 0.74, sz: 0.74 }),
            part(G_DOME, 0x1a2632, { x: 0.1, y: -0.78, sx: 1.24, sy: 0.68, sz: 0.88 }),
          ]),
          bodyMat,
        ),
      );
      group.add(leg);
      return leg;
    };
    pose.legL = makeBellLeg(-1);
    pose.legR = makeBellLeg(1);

    const makeArm = (side) => {
      const arm = new Node();
      arm.position.set(0.24, 1.72, side * 1.58);
      arm.add(
        new MeshNode(
          mergeGeometries([
            part(G_SPH, BRASS, { sx: 0.56, sy: 0.56, sz: 0.56 }),
            part(G_BELL, IRON, { x: 0.58, y: -0.06, rz: -Math.PI / 2, sx: 0.68, sy: 1.66, sz: 0.68 }),
            part(G_TOR_SM, BRASS, { x: 1.74, y: -0.06, ry: Math.PI / 2, sx: 0.66, sy: 0.66, sz: 0.66 }),
          ]),
          bodyMat,
        ),
      );
      arm.add(
        new MeshNode(
          part(G_CYL6, 0xffffff, { x: 2.24, y: -0.06, rz: Math.PI / 2, sx: 0.36, sy: 0.12, sz: 0.36 }),
          glowMat,
        ),
      );
      group.add(arm);
      return arm;
    };
    pose.armL = makeArm(-1);
    pose.armR = makeArm(1);

    const glowGeo = mergeGeometries([
      part(G_BOX, 0xffffff, { x: 0.84, y: 2.94, sx: 0.18, sy: 0.22, sz: 0.92 }),
      part(G_OCT, 0xffffff, { x: 1.3, y: 1.96, sx: 0.52, sy: 0.74, sz: 0.78 }),
      part(G_LANTERN, 0xffffff, { y: 2.74, z: -1.62, sx: 0.56, sy: 0.38, sz: 0.56 }),
      part(G_LANTERN, 0xffffff, { y: 2.74, z: 1.62, sx: 0.56, sy: 0.38, sz: 0.56 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));

    const halo = addMesh(group, torus(1.52, 0.08, 6, 20), glowMat, { x: -0.72, y: 3.05, ry: Math.PI / 2 });
    const brassHalo = addMesh(
      group,
      torus(1.9, 0.07, 5, 20),
      worldMaterial({ color: BRASS, surface: "metal", transparent: false, opacity: 1 }),
      { x: -0.82, y: 3.05, ry: Math.PI / 2 },
    );
    mats.push(brassHalo.material);
    fadeMats.push(brassHalo.material);
    spin.push({ m: halo, ax: "x", v: 1.45 }, { m: brassHalo, ax: "x", v: -0.85 });

    // Phase 2 Overdrive: Unfurling sunburst lantern spires & outer storm ring
    const p2Parts = [part(torus(2.35, 0.065, 5, 22), 0xffffff, { x: -0.9, y: 3.05, ry: Math.PI / 2 })];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p2Parts.push(
        part(G_CONE6, 0xffffff, {
          x: -0.9,
          y: 3.05 + Math.cos(a) * 2.55,
          z: Math.sin(a) * 2.55,
          rx: a,
          sx: 0.2,
          sy: 0.54,
          sz: 0.2,
        }),
      );
    }
    phase2.add(new MeshNode(mergeGeometries(p2Parts), overdriveMat));
  } else if (type === "queen") {
    // THE GLOWMARSH — Velvet Toadstool Brood-Empress (articulated 6 skittering legs + mandibles + phase-2 bloom crown)
    const hull = mergeGeometries([
      part(G_BUG, 0x1d3b2e, { x: -1.25, y: 1.18, rz: -Math.PI / 2, sx: 1.72, sy: 2.62, sz: 2.26 }),
      part(G_DOME, 0x2d5e48, { x: 0.96, y: 0.94, sx: 1.56, sy: 1.08, sz: 1.66 }),
      part(G_CONE6, BRASS, { x: 1.56, y: 1.96, z: -0.44, rz: -0.62, sx: 0.14, sy: 0.72, sz: 0.14 }),
      part(G_CONE6, BRASS, { x: 1.56, y: 1.96, z: 0.44, rz: -0.62, sx: 0.14, sy: 0.72, sz: 0.14 }),
      part(sculptedCap(2.04, 1.16, 313), 0x2e8f66, { x: -0.22, y: 1.76 }),
      part(sculptedCap(0.78, 0.5, 325), 0x3ea67a, { x: -1.08, y: 1.88, z: -0.96 }),
      part(sculptedCap(0.78, 0.5, 331), 0x3ea67a, { x: -1.08, y: 1.88, z: 0.96 }),
      part(sculptedCap(0.64, 0.44, 337), 0x4eb88a, { x: 0.78, y: 1.84, z: 0 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));

    // Separate 6 articulated chitinous legs for tripod skitter gait in updatePose
    pose.legs = [];
    for (const s of [-1, 1]) {
      for (const [idx, lx] of [-0.78, 0.06, 0.82].entries()) {
        const leg = new Node();
        leg.position.set(lx, 0.96, s * 1.06);
        leg.add(
          new MeshNode(
            part(G_BUG, 0x182b23, { y: -0.96, z: s * 0.42, rx: s * 0.56, sx: 0.36, sy: 1.38, sz: 0.36 }),
            bodyMat,
          ),
        );
        group.add(leg);
        pose.legs.push({ node: leg, side: s, idx });
      }
    }

    const makeJaw = (side) => {
      const jaw = new Node();
      jaw.position.set(1.58, 1.16, side * 0.48);
      jaw.add(
        new MeshNode(
          mergeGeometries([
            part(G_CONE6, 0x6ab488, { x: 0.38, rz: -1.24, sx: 0.3, sy: 0.86, sz: 0.3 }),
            part(G_OCT, BRASS, { x: 0.1, sx: 0.24, sy: 0.24, sz: 0.24 }),
          ]),
          bodyMat,
        ),
      );
      group.add(jaw);
      return jaw;
    };
    pose.jawL = makeJaw(-1);
    pose.jawR = makeJaw(1);

    const glowGeo = mergeGeometries([
      part(G_SPH, 0xffffff, { x: -0.98, y: 1.36, z: -0.84, sx: 0.7, sy: 0.58, sz: 0.7 }),
      part(G_SPH, 0xffffff, { x: -0.98, y: 1.36, z: 0.84, sx: 0.7, sy: 0.58, sz: 0.7 }),
      part(G_SPH, 0xffffff, { x: 1.76, y: 1.54, z: -0.42, sx: 0.36, sy: 0.3, sz: 0.36 }),
      part(G_SPH, 0xffffff, { x: 1.76, y: 1.54, z: 0.42, sx: 0.36, sy: 0.3, sz: 0.36 }),
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU + 0.3;
        return part(G_OCT, 0xffffff, {
          x: -0.22 + Math.cos(a) * 1.06,
          y: 2.54,
          z: Math.sin(a) * 1.06,
          sx: 0.3,
          sy: 0.15,
          sz: 0.3,
        });
      }),
      part(G_TOR, 0xffffff, { x: -0.22, y: 1.82, rx: Math.PI / 2, sx: 2.75, sy: 2.75, sz: 2.75 }),
    ]);
    group.add(new MeshNode(glowGeo, glowMat));

    const crownMat = worldMaterial({
      color: 0x62e8a8,
      surface: "crystal",
      emissive: 0x1e7850,
      emissiveIntensity: 0.68,
      transparent: false,
      opacity: 1,
    });
    mats.push(crownMat);
    fadeMats.push(crownMat);
    const crown = new Node();
    crown.position.set(-0.22, 3.22, 0);
    crown.add(
      new MeshNode(
        mergeGeometries([
          part(G_OCT, 0xffffff, { sx: 1.04, sy: 1.54, sz: 1.04 }),
          ...Array.from({ length: 4 }, (_, i) => {
            const a = (i / 4) * TAU;
            return part(G_OCT, 0xffffff, {
              x: Math.cos(a) * 0.92,
              y: -0.1,
              z: Math.sin(a) * 0.92,
              sx: 0.28,
              sy: 0.42,
              sz: 0.28,
            });
          }),
        ]),
        crownMat,
      ),
    );
    group.add(crown);
    spin.push({ m: crown, ax: "y", v: 1.65 });

    // Phase 2 Overdrive: Luminous bioluminescent spore-halo & unfurled petal filaments
    const p2Queen = [part(torus(2.25, 0.06, 5, 22), 0xffffff, { x: -0.22, y: 2.95, rx: Math.PI / 2 })];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p2Queen.push(
        part(G_OCT, 0xffffff, {
          x: -0.22 + Math.cos(a) * 1.95,
          y: 2.95,
          z: Math.sin(a) * 1.95,
          ry: -a,
          sx: 0.36,
          sy: 0.16,
          sz: 0.24,
        }),
      );
    }
    phase2.add(new MeshNode(mergeGeometries(p2Queen), overdriveMat));
  } else if (type === "prism") {
    // THE AURORA SHELF — Cathedral Frost-Prism Seraph (articulated sapphire wing-spires + overdrive aurora corona)
    const iceMat = worldMaterial({
      surface: "ice",
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      biomeSkin: true,
    });
    iceMat.userData.opacity = 0.92;
    mats.push(iceMat);
    fadeMats.push(iceMat);
    const coreCrystal = mergeGeometries([
      part(sculptedCrystal(2.05, 3.75, 2.05, 411), 0x164674, { y: 0.35 }),
      part(G_OCT, 0x2c78ae, { y: 2.15, sx: 1.95, sy: 2.55, sz: 1.95 }),
      part(G_OCT, 0x8ad0f0, { y: 3.75, sx: 0.76, sy: 1.12, sz: 0.76 }),
      part(G_TOR, BRASS, { y: 1.25, rx: Math.PI / 2, sx: 1.56, sy: 1.56, sz: 1.56 }),
      part(G_TOR, BRASS, { y: 3.05, rx: Math.PI / 2, sx: 1.18, sy: 1.18, sz: 1.18 }),
    ]);
    group.add(new MeshNode(coreCrystal, iceMat));

    const makeWing = (side) => {
      const wNode = new Node();
      wNode.position.set(0, 2.25, side * 1.35);
      wNode.add(
        new MeshNode(
          mergeGeometries([
            part(sculptedCrystal(0.56, 1.95, 0.56, side > 0 ? 441 : 442), 0x48a8de, {
              y: -0.45,
              z: side * 0.45,
              rx: side * 0.42,
            }),
            part(G_OCT, BRASS, { z: side * 0.2, sx: 0.24, sy: 0.56, sz: 0.24 }),
          ]),
          iceMat,
        ),
      );
      group.add(wNode);
      return wNode;
    };
    pose.wingL = makeWing(-1);
    pose.wingR = makeWing(1);

    const ringA = new Node();
    ringA.position.set(0, 2.0, 0);
    const ringAGeo = mergeGeometries(
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU;
        return part(sculptedCrystal(0.58, 1.62, 0.58, 420 + i), i % 2 ? 0x205c90 : 0x4098cc, {
          x: Math.cos(a) * 1.98,
          y: -0.55,
          z: Math.sin(a) * 1.98,
          ry: a,
          rz: 0.28,
        });
      }),
    );
    ringA.add(new MeshNode(ringAGeo, bodyMat));
    group.add(ringA);
    spin.push({ m: ringA, ax: "y", v: 1.15 });

    const ringB = addMesh(group, torus(2.02, 0.08, 6, 22), glowMat, { y: 2.05, rx: 0.54 });
    const ringC = addMesh(group, torus(2.42, 0.065, 5, 22), glowMat, { y: 2.05, rz: -0.62 });
    spin.push({ m: ringB, ax: "z", v: -1.45 }, { m: ringC, ax: "x", v: 1.1 });
    addMesh(group, octahedron(0.86), glowMat, { y: 2.08, sx: 1.0, sy: 1.55, sz: 1.0 });

    // Phase 2 Overdrive: Crown of levitating frost-seraph lances
    const p2Prism = [part(torus(2.65, 0.06, 5, 24), 0xffffff, { y: 3.45, rx: Math.PI / 2 })];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p2Prism.push(
        part(G_OCT, 0xffffff, {
          x: Math.cos(a) * 2.65,
          y: 3.45,
          z: Math.sin(a) * 2.65,
          sx: 0.26,
          sy: 0.72,
          sz: 0.26,
        }),
      );
    }
    phase2.add(new MeshNode(mergeGeometries(p2Prism), overdriveMat));
  } else if (type === "core") {
    // THE SHATTERED CORE — Rift Astrolabe Sovereign (articulated sanctuary pylons + phase-progression astral rings)
    const plinth = mergeGeometries([
      part(G_OCT, 0x20163e, { y: 2.4, sx: 2.02, sy: 2.45, sz: 2.02 }),
      ...Array.from({ length: 4 }, (_, i) => {
        const a = (i / 4) * TAU + Math.PI / 4;
        return part(G_OCT, BRASS, {
          x: Math.cos(a) * 1.34,
          y: 2.4,
          z: Math.sin(a) * 1.34,
          sx: 0.36,
          sy: 0.88,
          sz: 0.36,
        });
      }),
    ]);
    group.add(new MeshNode(plinth, bodyMat));

    const pylonRing = new Node();
    pylonRing.position.set(0, 0, 0);
    pylonRing.add(
      new MeshNode(
        mergeGeometries(
          Array.from({ length: 4 }, (_, i) => {
            const a = (i / 4) * TAU;
            return part(sculptedCrystal(0.78, 2.35, 0.78, 510 + i), 0x423474, {
              x: Math.cos(a) * 1.72,
              y: 0.92,
              z: Math.sin(a) * 1.72,
              ry: a,
            });
          }),
        ),
        bodyMat,
      ),
    );
    group.add(pylonRing);
    pose.pylons = pylonRing;

    const heartMat = worldMaterial({
      color: 0xa664f0,
      surface: "crystal",
      emissive: 0x581e98,
      emissiveIntensity: 0.76,
      transparent: false,
      opacity: 1,
    });
    mats.push(heartMat);
    fadeMats.push(heartMat);
    const heart = addMesh(group, icosahedron(0.98, 1), heartMat, { y: 2.4 });
    spin.push({ m: heart, ax: "y", v: 1.25 });

    const r1 = addMesh(group, torus(1.88, 0.1, 6, 24), glowMat, { y: 2.4, rx: 0.55 });
    const r2Mat = worldMaterial({ color: BRASS, surface: "metal", transparent: false, opacity: 1 });
    mats.push(r2Mat);
    fadeMats.push(r2Mat);
    const r2 = new Node();
    r2.position.set(0, 2.4, 0);
    r2.rotation.z = 0.85;
    r2.add(
      new MeshNode(
        mergeGeometries([
          part(torus(2.4, 0.09, 5, 24), BRASS, {}),
          ...Array.from({ length: 4 }, (_, i) => {
            const a = (i / 4) * TAU;
            return part(G_OCT, IVORY, { x: Math.cos(a) * 2.4, y: Math.sin(a) * 2.4, sx: 0.36, sy: 0.36, sz: 0.36 });
          }),
        ]),
        r2Mat,
      ),
    );
    group.add(r2);
    const r3 = addMesh(group, torus(2.86, 0.075, 5, 24), glowMat, { y: 2.4, rx: -0.68 });
    spin.push({ m: r1, ax: "y", v: 1.55 }, { m: r2, ax: "x", v: -1.1 }, { m: r3, ax: "z", v: 0.92 });

    // Phase 2/3 Overdrive: Outer sovereign star-halo & zenith crystal spire
    phase2.add(
      new MeshNode(
        mergeGeometries([
          part(torus(3.32, 0.07, 5, 26), 0xffffff, { y: 2.4, rx: Math.PI / 2 }),
          part(G_OCT, 0xffffff, { y: 4.35, sx: 0.55, sy: 0.95, sz: 0.55 }),
        ]),
        overdriveMat,
      ),
    );
  } else if (type === "tyrant") {
    // ASHFALL CALDERA — Hunched Dwarven Furnace-Titan: wide boiler hunchback, twin tall smokestack pipes,
    // glowing iron rib-grate chest, articulated walking forge-legs & colossal two-handed anvil maul!
    const hull = mergeGeometries([
      // Broad hunched lower-slung furnace boiler torso (wider & forward-hunched vs upright bellkeeper)
      part(G_BEV, 0x261618, { x: -0.14, y: 1.18, sx: 2.32, sy: 1.12, sz: 2.94 }),
      part(G_DOME, 0x3a2020, { x: -0.46, y: 1.88, rz: -0.28, sx: 2.68, sy: 1.62, sz: 3.18 }),
      part(G_TOR_SM, COPPER, { x: -0.28, y: 1.72, rx: Math.PI / 2, sx: 2.52, sy: 2.94, sz: 2.52 }),
      // Curved dark-iron furnace rib-grate bars encasing the roaring chest core
      ...[-0.62, -0.22, 0.22, 0.62].map((rzOff) =>
        part(G_BEV, 0x1a1012, { x: 1.24, y: 1.78, z: rzOff, rz: -0.24, sx: 0.18, sy: 1.22, sz: 0.16 }),
      ),
      part(G_BEV, COPPER, { x: 1.16, y: 2.34, sx: 0.24, sy: 0.18, sz: 1.62 }),
      part(G_BEV, COPPER, { x: 1.28, y: 1.24, sx: 0.24, sy: 0.18, sz: 1.62 }),
      // Jagged basalt shoulder bastions
      part(sculptedCrystal(1.16, 1.92, 1.16, 601), 0x321b1d, { x: 0.04, y: 2.02, z: -1.86, rx: -0.46 }),
      part(sculptedCrystal(1.16, 1.92, 1.16, 602), 0x321b1d, { x: 0.04, y: 2.02, z: 1.86, rx: 0.46 }),
      // Twin tall crooked copper-and-iron furnace smokestack pipes rising from the hunched boiler back
      part(G_CYL8, 0x261517, { x: -0.96, y: 3.18, z: -0.96, rx: -0.14, rz: 0.24, sx: 0.54, sy: 1.92, sz: 0.54 }),
      part(G_BELL, COPPER, { x: -1.16, y: 3.96, z: -1.08, rx: -0.14, rz: 0.24, sx: 0.72, sy: 0.54, sz: 0.72 }),
      part(G_CYL8, 0x261517, { x: -0.96, y: 3.34, z: 0.96, rx: 0.14, rz: 0.2, sx: 0.58, sy: 2.18, sz: 0.58 }),
      part(G_BELL, COPPER, { x: -1.18, y: 4.24, z: 1.1, rx: 0.14, rz: 0.2, sx: 0.76, sy: 0.56, sz: 0.76 }),
      // Low-set horned iron forge-helm nestled forward beneath the hunched back
      part(G_BEV, 0x2d1a1c, { x: 0.88, y: 2.48, sx: 1.04, sy: 0.76, sz: 1.16 }),
      part(G_CONE6, BRASS, { x: 1.14, y: 2.84, z: -0.64, rx: -0.62, rz: -0.68, sx: 0.28, sy: 0.84, sz: 0.28 }),
      part(G_CONE6, BRASS, { x: 1.14, y: 2.84, z: 0.64, rx: 0.62, rz: -0.68, sx: 0.28, sy: 0.84, sz: 0.28 }),
    ]);
    group.add(new MeshNode(hull, bodyMat));

    // Articulated stomping basalt-iron forge legs
    const makeTyrantLeg = (side) => {
      const leg = new Node();
      leg.position.set(0.02, 0.82, side * 0.96);
      leg.add(
        new MeshNode(
          mergeGeometries([
            part(G_BEV, 0x2c1b1d, { y: -0.26, sx: 0.84, sy: 0.58, sz: 0.78 }),
            part(G_TOR_SM, COPPER, { y: -0.44, rx: Math.PI / 2, sx: 0.88, sy: 0.88, sz: 0.88 }),
            part(G_DOME, 0x201315, { x: 0.12, y: -0.82, sx: 1.38, sy: 0.68, sz: 0.98 }),
          ]),
          bodyMat,
        ),
      );
      group.add(leg);
      return leg;
    };
    pose.legL = makeTyrantLeg(-1);
    pose.legR = makeTyrantLeg(1);

    // Left forge-bellows gauntlet arm (braces/slams & draws bellows)
    const armL = new Node();
    armL.position.set(0.36, 1.62, -1.68);
    armL.add(
      new MeshNode(
        mergeGeometries([
          part(G_SPH, COPPER, { sx: 0.62, sy: 0.62, sz: 0.62 }),
          part(G_BEV, 0x562c26, { x: 0.84, y: -0.22, sx: 1.28, sy: 0.86, sz: 0.86 }),
          part(G_TOR_SM, BRASS, { x: 0.82, y: -0.22, ry: Math.PI / 2, sx: 0.96, sy: 0.96, sz: 0.96 }),
        ]),
        bodyMat,
      ),
    );
    armL.add(new MeshNode(part(G_OCT, 0xffffff, { x: 1.44, y: -0.22, sx: 0.42, sy: 0.42, sz: 0.42 }), glowMat));
    group.add(armL);

    // Right arm wielding the colossal two-handed dwarven Anvil Maul!
    const armR = new Node();
    armR.position.set(0.36, 1.66, 1.64);
    armR.add(
      new MeshNode(
        mergeGeometries([
          part(G_SPH, COPPER, { sx: 0.64, sy: 0.64, sz: 0.64 }),
          part(G_BEV, 0x562c26, { x: 0.72, y: -0.18, sx: 1.12, sy: 0.78, sz: 0.78 }),
          // Heavy iron-and-copper maul haft extending forward & across
          part(G_CYL8, IRON, { x: 1.32, y: 0.12, z: -0.32, rx: 0.48, rz: -0.32, sx: 0.24, sy: 2.55, sz: 0.24 }),
          part(G_TOR_SM, BRASS, { x: 1.62, y: 0.84, z: -0.82, rx: Math.PI / 2, sx: 0.46, sy: 0.46, sz: 0.46 }),
          // Massive forged anvil-head maul with glowing furnace faces
          part(G_BEV, 0x3b2222, { x: 1.72, y: 1.24, z: -1.04, ry: 0.18, sx: 1.68, sy: 1.02, sz: 1.18 }),
          part(G_BEV, COPPER, { x: 1.72, y: 1.24, z: -1.04, ry: 0.18, sx: 1.74, sy: 0.24, sz: 1.24 }),
          part(G_CONE6, BRASS, { x: 2.64, y: 1.24, z: -1.2, rz: -Math.PI / 2, sx: 0.72, sy: 0.48, sz: 0.72 }),
        ]),
        bodyMat,
      ),
    );
    armR.add(
      new MeshNode(
        mergeGeometries([
          part(G_BOX, 0xffffff, { x: 1.72, y: 0.78, z: -1.04, ry: 0.18, sx: 1.38, sy: 0.18, sz: 0.94 }),
          part(G_OCT, 0xffffff, { x: 1.72, y: 1.72, z: -1.04, sx: 0.44, sy: 0.34, sz: 0.44 }),
        ]),
        glowMat,
      ),
    );
    group.add(armR);
    pose.armL = armL;
    pose.armR = armR;

    const forgeGlow = mergeGeometries([
      part(G_SPH, 0xffffff, { x: 0.96, y: 1.78, sx: 0.98, sy: 1.06, sz: 1.38 }),
      part(G_BOX, 0xffffff, { x: 1.44, y: 2.54, sx: 0.16, sy: 0.22, sz: 0.84 }),
      part(G_OCT, 0xffffff, { x: -1.22, y: 4.38, z: -1.12, sx: 0.42, sy: 0.52, sz: 0.42 }),
      part(G_OCT, 0xffffff, { x: -1.24, y: 4.68, z: 1.14, sx: 0.46, sy: 0.58, sz: 0.46 }),
    ]);
    group.add(new MeshNode(forgeGlow, glowMat));
    const crown = addMesh(group, torus(1.26, 0.09, 6, 20), glowMat, { x: -0.45, y: 3.68, rx: Math.PI / 2 });
    spin.push({ m: crown, ax: "z", v: 1.35 });

    // Phase 2 Overdrive: Roaring forge-flame plumes & molten anvil halo
    phase2.add(
      new MeshNode(
        mergeGeometries([
          part(torus(2.15, 0.08, 5, 22), 0xffffff, { x: -0.45, y: 3.92, rx: Math.PI / 2 }),
          part(G_OCT, 0xffffff, { x: -1.22, y: 4.92, z: -1.12, sx: 0.52, sy: 0.88, sz: 0.52 }),
          part(G_OCT, 0xffffff, { x: -1.24, y: 5.26, z: 1.14, sx: 0.56, sy: 0.94, sz: 0.56 }),
        ]),
        overdriveMat,
      ),
    );
  } else {
    // THE GLASS FLATS — Vitrified Sun-Glass Leviathan (articulated mandibles + 7-segment dragon tail + sun-halo crest)
    const head = mergeGeometries([
      part(G_DOME, 0x623b24, { x: 0.54, y: 0.62, sx: 1.94, sy: 1.16, sz: 1.58 }),
      part(G_BEV, BRASS, { x: 0.72, y: 1.58, sx: 1.18, sy: 0.24, sz: 1.14 }),
      part(sculptedCrystal(0.96, 2.02, 0.74, 701), 0x20a498, { x: -0.1, y: 1.35, z: -0.86, rx: -0.48, rz: 0.34 }),
      part(sculptedCrystal(0.96, 2.02, 0.74, 702), 0x20a498, { x: -0.1, y: 1.35, z: 0.86, rx: 0.48, rz: 0.34 }),
      part(sculptedCrystal(0.68, 1.46, 0.56, 703), 0x36c0b2, { x: 0.32, y: 1.56, z: 0, rz: 0.42 }),
      part(G_CONE6, 0x8e5d32, { x: 1.72, y: 1.06, rz: -Math.PI / 2, sx: 0.88, sy: 1.2, sz: 0.98 }),
    ]);
    group.add(new MeshNode(head, bodyMat));

    const makeWyrmJaw = (side) => {
      const jaw = new Node();
      jaw.position.set(1.38, 0.86, side * 0.52);
      jaw.add(new MeshNode(part(G_CONE6, BRASS, { x: 0.28, rz: -1.35, sx: 0.28, sy: 0.74, sz: 0.28 }), bodyMat));
      group.add(jaw);
      return jaw;
    };
    pose.jawL = makeWyrmJaw(-1);
    pose.jawR = makeWyrmJaw(1);

    const eyes = mergeGeometries([
      part(G_OCT, 0xffffff, { x: 1.32, y: 1.38, z: -0.6, sx: 0.4, sy: 0.26, sz: 0.28 }),
      part(G_OCT, 0xffffff, { x: 1.32, y: 1.38, z: 0.6, sx: 0.4, sy: 0.26, sz: 0.28 }),
      part(G_OCT, 0xffffff, { x: 0.38, y: 2.16, sx: 0.48, sy: 0.68, sz: 0.48 }),
    ]);
    group.add(new MeshNode(eyes, glowMat));

    const tail = [];
    for (let i = 1; i <= 7; i++) {
      const sc = 1 - i * 0.105;
      const seg = new Node();
      seg.position.set(-i * 0.88, 0.92 - i * 0.05, 0);
      const segParts = [
        part(G_DOME, i % 2 ? 0x74462a : 0x4c2e1e, { y: -0.4 * sc, sx: 1.06 * sc, sy: 0.96 * sc, sz: 1.34 * sc }),
        part(sculptedCrystal(0.46 * sc, 1.18 * sc, 0.46 * sc, 710 + i), 0x26b2a6, { y: 0.38 * sc }),
      ];
      if (i === 7) {
        segParts.push(part(G_OCT, BRASS, { x: -0.55, y: 0.18, sx: 0.74, sy: 0.22, sz: 0.58 }));
      }
      seg.add(new MeshNode(mergeGeometries(segParts), bodyMat));
      seg.add(
        new MeshNode(part(G_OCT, 0xffffff, { y: 0.76 * sc, sx: 0.26 * sc, sy: 0.34 * sc, sz: 0.26 * sc }), glowMat),
      );
      group.add(seg);
      tail.push({ m: seg, z: 0, i });
    }
    group.userData.tail = tail;

    // Phase 2 Overdrive: Radiant sun-crest halo behind dragon brow
    const p2Wyrm = [part(torus(1.45, 0.07, 5, 20), 0xffffff, { x: 0.2, y: 2.15, ry: Math.PI / 2 })];
    for (let i = 0; i < 5; i++) {
      const a = -1.1 + (i / 4) * 2.2;
      p2Wyrm.push(
        part(G_CONE6, 0xffffff, {
          x: 0.2,
          y: 2.15 + Math.cos(a) * 1.65,
          z: Math.sin(a) * 1.65,
          rx: a,
          sx: 0.18,
          sy: 0.52,
          sz: 0.18,
        }),
      );
    }
    phase2.add(new MeshNode(mergeGeometries(p2Wyrm), overdriveMat));
  }

  fadeMats.push(overdriveMat);
  group.userData.fadeMats = fadeMats;

  return {
    group,
    mats,
    glowMat,
    overdriveMat,
    phase2,
    pose,
    spin,
    p2Scale: 0,
    updatePose(boss, time, dt) {
      const k = dampFactor(10, dt);
      const st = boss.st || "walk";
      const winding = st !== "walk" && (boss.sub === 0 || boss.charging);
      const active = st !== "walk" && !winding;
      const walking = st === "walk";
      const rushing = st === "charge" && boss.sub === 1;

      // Visible Phase 2 / Overdrive progression
      const inPhase2 = !!(boss.enraged || (boss.phaseN && boss.phaseN >= 2) || boss.hp < boss.maxHp * 0.52);
      const targetP2 = inPhase2 ? 1 : 0;
      this.p2Scale += (targetP2 - this.p2Scale) * dampFactor(6, dt);
      if (this.p2Scale > 0.02) {
        phase2.visible = true;
        phase2.scale.setScalar(this.p2Scale * (1 + Math.sin(time * 5.2) * 0.04));
      } else {
        phase2.visible = false;
      }

      // Articulated walking strides for bipedal bosses (bellkeeper & tyrant)
      if (pose.legL && pose.legR) {
        const strideFreq = rushing ? 13.5 : 6.2;
        const strideAmp = rushing ? 0.54 : walking ? 0.36 : 0;
        const targetLegL = strideAmp ? Math.sin(time * strideFreq) * strideAmp : winding ? -0.18 : 0.12;
        const targetLegR = strideAmp ? -targetLegL : winding ? 0.18 : -0.12;
        pose.legL.rotation.z += (targetLegL - pose.legL.rotation.z) * k;
        pose.legR.rotation.z += (targetLegR - pose.legR.rotation.z) * k;
      }

      // 6-legged tripod skitter gait for Brood-Empress Queen
      if (pose.legs) {
        const freq = walking ? 7.2 : 11.0;
        const amp = walking ? 0.32 : winding ? 0.12 : 0.24;
        for (const l of pose.legs) {
          const tripod = (l.idx + (l.side > 0 ? 1 : 0)) % 2 ? 1 : -1;
          const swing = Math.sin(time * freq + tripod * Math.PI * 0.5) * amp;
          const brace = st === "burst" || st === "plague" ? l.side * (winding ? -0.22 : 0.18) : 0;
          l.node.rotation.z += (swing - l.node.rotation.z) * k;
          l.node.rotation.x += (brace - l.node.rotation.x) * k;
        }
      }

      // Attack-specific arm & weapon choreography (stomp/ring/carillon, charge, barrage/firestorm/rain, sweep)
      if (pose.armL && pose.armR) {
        let pitchL = Math.sin(time * 5.5) * (walking ? 0.2 : 0.05);
        let pitchR = -pitchL;
        let splayL = 0;
        let splayR = 0;
        if (st === "stomp" || st === "ring" || st === "sealgrid") {
          // Overhead double-arm bell toll / seismic slam
          pitchL = pitchR = winding ? 1.08 : active ? -0.72 : 0;
          splayL = winding ? 0.24 : -0.08;
          splayR = -splayL;
        } else if (st === "carillon") {
          // Alternating rhythmic bell-tower tolls
          const toll = Math.sin(time * 11.5);
          pitchL = winding ? 0.92 : toll * 0.68;
          pitchR = winding ? -0.28 : -toll * 0.68;
          splayL = 0.22;
          splayR = -0.22;
        } else if (st === "charge") {
          // Braced shoulder-ram windup -> low forward thrust
          pitchL = winding ? -0.44 : -0.62;
          pitchR = winding ? 0.68 : -0.36;
          splayL = winding ? -0.26 : -0.18;
          splayR = winding ? -0.36 : 0.12;
        } else if (st === "barrage" || st === "firestorm" || st === "rain") {
          // Bellows draw wide during windup -> heavy rhythmic anvil maul slam!
          pitchL = winding ? 0.78 : -0.42 + Math.sin(time * 12) * 0.28;
          pitchR = winding ? 1.14 : -0.64 + Math.cos(time * 12) * 0.34;
          splayL = winding ? 0.44 : -0.14;
          splayR = winding ? -0.44 : 0.16;
        } else if (st !== "walk") {
          pitchL = pitchR = winding ? 0.76 : active ? -0.46 : 0;
          splayL = winding ? 0.28 : 0.12;
          splayR = -splayL;
        }
        pose.armL.rotation.z += (pitchL - pose.armL.rotation.z) * k;
        pose.armR.rotation.z += (pitchR - pose.armR.rotation.z) * k;
        pose.armL.rotation.y += (splayL - pose.armL.rotation.y) * k;
        pose.armR.rotation.y += (splayR - pose.armR.rotation.y) * k;
      }

      if (pose.jawL && pose.jawR) {
        const beamLike = st === "sunlance" || st === "noon" || st === "sweep";
        const gape = beamLike
          ? winding
            ? 0.58
            : 0.48 + Math.sin(time * 20) * 0.1
          : st !== "walk"
            ? winding
              ? 0.46
              : 0.24 + Math.sin(time * 16) * 0.16
            : 0.06 + Math.sin(time * 3.2) * 0.05;
        pose.jawL.rotation.y += (gape - pose.jawL.rotation.y) * k;
        pose.jawR.rotation.y += (-gape - pose.jawR.rotation.y) * k;
      }

      if (pose.wingL && pose.wingR) {
        const beamLike = st === "frostbeam" || st === "whiteout" || st === "sweep";
        const flare = beamLike
          ? winding
            ? 0.68
            : -0.38 + Math.sin(time * 10) * 0.08
          : st !== "walk"
            ? winding
              ? 0.44
              : -0.24
            : Math.sin(time * 2.4) * 0.12;
        const lean = beamLike ? (winding ? 0.24 : -0.22) : 0;
        pose.wingL.rotation.x += (-flare - pose.wingL.rotation.x) * k;
        pose.wingR.rotation.x += (flare - pose.wingR.rotation.x) * k;
        pose.wingL.rotation.z += (lean - pose.wingL.rotation.z) * k;
        pose.wingR.rotation.z += (lean - pose.wingR.rotation.z) * k;
      }

      if (pose.pylons) {
        const heavy = st === "cross" || st === "collapse" || st === "spiral";
        const expand = heavy
          ? winding
            ? 1.28
            : 1.16
          : st !== "walk"
            ? winding
              ? 1.18
              : 1.08
            : 1.0 + Math.sin(time * 2.0) * 0.04;
        const cur = pose.pylons.scale.x + (expand - pose.pylons.scale.x) * k;
        pose.pylons.scale.set(cur, 1, cur);
        pose.pylons.rotation.y += dt * (heavy ? 2.1 : st !== "walk" ? 1.4 : 0.45);
      }
    },
  };
}

// ============================================================================
// SHARED COMBAT KIT GEOMETRIES
// ============================================================================

export function wingDroneGeometry() {
  return mergeGeometries([
    part(G_LANTERN, IVORY, { y: 0.64, sx: 0.44, sy: 0.46, sz: 0.44 }),
    part(G_OCT, BRASS, { x: -0.06, y: 0.86, z: -0.3, ry: 0.35, sx: 0.42, sy: 0.08, sz: 0.26 }),
    part(G_OCT, BRASS, { x: -0.06, y: 0.86, z: 0.3, ry: -0.35, sx: 0.42, sy: 0.08, sz: 0.26 }),
  ]);
}

export function orbitBladeGeometry() {
  return mergeGeometries([
    part(G_OCT, IVORY, { y: 0.62, sx: 0.76, sy: 0.12, sz: 0.34 }),
    part(G_BEV, BRASS, { x: -0.18, y: 0.62, sx: 0.32, sy: 0.14, sz: 0.18 }),
  ]);
}

export function rocketProjectileGeometry() {
  return mergeGeometries([
    part(G_POT, BRASS, { x: -0.3, rz: -Math.PI / 2, sx: 0.26, sy: 0.66, sz: 0.26 }),
    part(G_CONE6, FINISH.vermilion, { x: 0.44, rz: -Math.PI / 2, sx: 0.24, sy: 0.26, sz: 0.24 }),
    part(G_BEV, IRON, { x: -0.26, sx: 0.2, sy: 0.06, sz: 0.44 }),
    part(G_BEV, IRON, { x: -0.26, sx: 0.2, sy: 0.44, sz: 0.06 }),
  ]);
}

export function discGeometry() {
  return mergeGeometries([
    part(torus(0.75, 0.13, 5, 16), IVORY, { rx: Math.PI / 2 }),
    part(cylinder(0.42, 0.42, 0.12, 8), BRASS, {}),
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
