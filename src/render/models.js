// Mesh builders for the player drone, enemies, bosses and props.
import { worldMaterial } from "./world-material.js";
import { createAegisMaterial } from "./aegis-material.js";
import { BOSS_EFFECTS } from "../data/combat-effects.js";
import { armorBox } from "./armor-geometry.js";
import { mergeStaticMeshes } from "./static-meshes.js";

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";

// One lit and one emissive mesh per enemy type, budgeted at 810 triangles together.
// Local +x is forward and +y is up. Geometry does not affect contact or movement.
const limbUp = new Vector3(0, 1, 0),
  limbDir = new Vector3(),
  limbZ = new Vector3(),
  limbU = new Vector3(),
  limbC = new Vector3(),
  limbRoll = new Quaternion();
/* a part that runs from point a to point b; make(len) returns a geometry of that length along y.
   flat = true rolls it so that its local z (the thin side) points up, for blades and wings */
function limb(color, make, a, b, flat = false) {
  limbDir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = limbDir.length() || 1e-3;
  limbDir.divideScalar(len);
  const geo = make(len);
  geo.translate(0, len / 2, 0);
  const q = new Quaternion().setFromUnitVectors(limbUp, limbDir);
  if (flat) {
    limbZ.set(0, 0, 1).applyQuaternion(q);
    limbU.copy(limbUp).addScaledVector(limbDir, -limbUp.dot(limbDir));
    if (limbU.lengthSq() > 1e-6) {
      limbU.normalize();
      limbC.crossVectors(limbZ, limbU);
      q.premultiply(limbRoll.setFromAxisAngle(limbDir, Math.atan2(limbC.dot(limbDir), limbZ.dot(limbU))));
    }
  }
  return meshPart(geo, color, { x: a[0], y: a[1], z: a[2], q });
}
const spike = (color, r, seg, a, b) => limb(color, (len) => new ConeGeometry(r, len, seg), a, b),
  bar = (color, w, a, b, t = w) => limb(color, (len) => new BoxGeometry(w, len, t), a, b, t !== w),
  pipe = (color, r0, r1, seg, a, b) => limb(color, (len) => new CylinderGeometry(r1, r0, len, seg), a, b),
  box = (color, w, h, d, p = {}) =>
    meshPart(Math.min(w, h, d) >= 0.12 ? armorBox(w, h, d) : new BoxGeometry(w, h, d), color, p),
  both = (make) => [].concat(make(1), make(-1));
// Dimensions and head crests are authored per role. The plans are assembled once into the two instance layers.
const SENTRY_KITS = {
  swarmer: ["dart", 0.51, 0.33, 0.73, 2, 0xc26d73],
  mite: ["dart", 0.32, 0.28, 0.43, 3, 0x80a476],
  grunt: ["mask", 0.62, 0.53, 0.94, 2, 0xc56750],
  gunner: ["reeds", 0.64, 0.49, 1.1, 2, 0xc48556],
  bomber: ["urn", 0.56, 0.51, 0.82, 3, 0xd5a354],
  splitter: ["urn", 0.76, 0.69, 1.08, 3, 0x69946d],
  brute: ["mask", 1.02, 0.86, 1.5, 4, 0xb85b4b],
  sniper: ["reeds", 0.63, 0.43, 1.24, 1, 0xcc635a],
  hive: ["urn", 1.03, 0.96, 1.64, 5, 0x82a377],
  bulwark: ["shield", 0.76, 0.88, 1.22, 3, 0x8595b2],
  striker: ["dart", 0.59, 0.55, 1.01, 4, 0x9b82bc],
  mender: ["crown", 0.59, 0.49, 1.23, 3, 0x89bda4],
  mortar: ["urn", 0.68, 0.65, 1.26, 4, 0xaf8a62],
  leaper: ["dart", 0.67, 0.61, 0.85, 5, 0x9c9260],
  turret: ["reeds", 0.73, 0.63, 1.12, 4, 0xbca17d],
  charger: ["shield", 0.91, 0.67, 1.04, 1, 0xa57154],
  minebot: ["urn", 0.69, 0.56, 0.72, 2, 0xb89861],
  sapper: ["reeds", 0.66, 0.54, 0.88, 3, 0xc3a779],
  phantom: ["crown", 0.63, 0.58, 1.31, 2, 0xa389b1],
  sentinel: ["shield", 0.83, 0.71, 1.41, 4, 0x6f9ba4],
  carrier: ["crown", 0.89, 0.79, 1.22, 5, 0xab856e],
  drone: ["dart", 0.64, 0.67, 0.67, 1, 0x77a5ac],
  driller: ["shield", 0.99, 0.78, 0.88, 2, 0xc9774a],
  beacon: ["crown", 0.69, 0.69, 1.61, 4, 0xc1ae70],
  weaver: ["mask", 0.77, 0.6, 1.22, 5, 0x9b77aa],
};
export const RL_MESH_TYPES = Object.keys(SENTRY_KITS);
const brass = 0xc49261,
  cream = 0xe7d9bb,
  ink = 0x263032;
const jewel = (color, r, p) => meshPart(new OctahedronGeometry(r), color, p);
const collar = (color, r, t, p) => meshPart(new TorusGeometry(r, t, 4, 12), color, p);
const shell = (color, r, h, p) =>
  meshPart(
    new LatheGeometry(
      [
        new Vector2(0, -h * 0.48),
        new Vector2(r * 0.68, -h * 0.47),
        new Vector2(r, -h * 0.19),
        new Vector2(r * 0.99, h * 0.14),
        new Vector2(r * 0.7, h * 0.41),
        new Vector2(0, h * 0.5),
      ],
      10,
    ),
    color,
    p,
  );
function enemyGeometry(type) {
  const [kind, x, z, h, details, glaze] = SENTRY_KITS[type] || SENTRY_KITS.grunt;
  const body = [],
    glow = [jewel(0xffffff, 0.125, { x: x * 0.82, y: h * 0.73, sx: 0.45, sy: 1.25 })];
  body.push(shell(glaze, 1, h * 0.68, { y: h * 0.58, sx: x * 0.73, sz: z * 0.73 }));
  body.push(jewel(cream, 0.44, { x: x * 0.54, y: h * 0.72, sx: x * 0.66, sy: h * 0.79, sz: z * 1.25 }));
  body.push(jewel(ink, 0.22, { x: x * 0.77, y: h * 0.74, sx: 0.36, sy: h * 0.81, sz: z * 1.12 }));
  if (kind === "mask" || kind === "reeds" || kind === "shield") {
    body.push(
      ...both((s) => [
        bar(ink, 0.11, [-x * 0.36, h * 0.51, s * z * 0.44], [x * 0.19, 0.08, s * z * 0.72], 0.14),
        jewel(glaze, 0.37, { x: -x * 0.08, y: h * 0.44, z: s * z * 0.61, sx: x * 1.1, sy: h * 0.77, sz: z * 0.74 }),
      ]),
    );
  }
  if (kind === "dart") {
    body.push(
      ...both((s) => [
        jewel(glaze, 0.66, { x: -x * 0.52, y: h * 0.73, z: s * z * 0.53, sx: x, sy: 0.24, sz: z * 1.42, ry: s * 0.42 }),
        jewel(brass, 0.37, { x: -x * 0.74, y: h * 0.64, z: s * z * 0.74, sx: x, sy: 0.19, sz: z, ry: s * 0.42 }),
      ]),
    );
    body.push(spike(cream, 0.11, 5, [x * 0.42, h * 0.58, 0], [x * 1.46, h * 0.48, 0]));
  }
  if (kind === "shield") {
    const plate = meshPart(new CylinderGeometry(0.71, 0.86, 0.16, 6), glaze, {
      x: x * 0.39,
      y: h * 0.54,
      rz: Math.PI / 2,
      sx: h * 0.81,
      sz: z * 1.14,
      rx: 0.48,
    });
    body.push(plate, collar(brass, 0.36, 0.033, { x: x * 0.53, y: h * 0.54, ry: Math.PI / 2, sy: h, sz: z }));
  }
  if (kind === "urn") {
    body.push(collar(brass, 0.6, 0.05, { y: h * 0.45, rx: Math.PI / 2, sx: x, sy: z }));
    body.push(shell(cream, 0.31, 0.31, { y: h * 0.98, sz: 1.12 }));
  }
  if (kind === "crown") {
    body.push(collar(brass, 0.6, 0.033, { y: h * 0.92, rx: Math.PI / 2, sx: x, sy: z }));
    body.push(jewel(glaze, 0.3, { x: -x * 0.47, y: h * 0.52, sy: 1.48 }));
  }
  for (let i = 0; i < details; i++) {
    const a = (i * Math.PI * 2) / details;
    const px = -x * 0.17 + x * 0.38 * Math.cos(a),
      pz = z * 0.46 * Math.sin(a);
    const y = h * (0.89 + (i % 2) * 0.075);
    if (kind === "reeds") body.push(pipe(ink, 0.07, 0.045, 6, [px, y, pz], [px + x * 0.65, y + h * 0.18, pz]));
    body.push(jewel(i % 2 ? cream : brass, 0.11, { x: px, y: y + h * 0.06, z: pz, sy: kind === "crown" ? 2.2 : 1.4 }));
    glow.push(jewel(0xffffff, 0.052, { x: px, y: y + h * 0.17, z: pz, sy: 1.25 }));
  }
  if (type === "mender") glow.push(jewel(0xffffff, 0.17, { x: -x * 0.45, y: h * 1.04, sy: 1.6 }));
  if (type === "sniper") body.push(pipe(brass, 0.09, 0.04, 6, [x * 0.15, h * 0.81, 0], [x * 1.73, h * 0.87, 0]));
  if (type === "driller" || type === "charger")
    body.push(spike(cream, 0.2, 6, [x * 0.64, h * 0.51, 0], [x * 1.45, h * 0.46, 0]));
  // Retain the enemy's gameplay color in the emissive instance tint, applied by Renderer.
  return { body: mergeParts(body), glow: mergeParts(glow) };
}

function mergeGeometries(geometries, useGroups = false) {
  let isIndexed = geometries[0].index !== null,
    attributesUsed = new Set(Object.keys(geometries[0].attributes)),
    morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes)),
    attributes = {},
    morphAttributes = {},
    morphTargetsRelative = geometries[0].morphTargetsRelative,
    merged = new BufferGeometry(),
    offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    let geometry = geometries[i],
      attributesCount = 0;
    if (isIndexed !== (geometry.index !== null)) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.",
      );
      return null;
    }
    for (let name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            '. All geometries must have compatible attributes; make sure "' +
            name +
            '" attribute exists among all geometries, or in none of them.',
        );
        return null;
      }
      if (attributes[name] === undefined) {
        attributes[name] = [];
      }
      attributes[name].push(geometry.attributes[name]);
      attributesCount++;
    }
    if (attributesCount !== attributesUsed.size) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". Make sure all geometries have the same number of attributes.",
      );
      return null;
    }
    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
          i +
          ". .morphTargetsRelative must be consistent throughout all geometries.",
      );
      return null;
    }
    for (let name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            ".  .morphAttributes must be consistent throughout all geometries.",
        );
        return null;
      }
      if (morphAttributes[name] === undefined) {
        morphAttributes[name] = [];
      }
      morphAttributes[name].push(geometry.morphAttributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) count = geometry.index.count;
      else if (geometry.attributes.position !== undefined) count = geometry.attributes.position.count;
      else {
        console.error(
          "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " +
            i +
            ". The geometry must have either an index or a position attribute",
        );
        return null;
      }
      merged.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0,
      mergedIndex = [];
    for (let i = 0; i < geometries.length; ++i) {
      let index = geometries[i].index;
      for (let j = 0; j < index.count; ++j) mergedIndex.push(index.getX(j) + indexOffset);
      indexOffset += geometries[i].attributes.position.count;
    }
    merged.setIndex(mergedIndex);
  }
  for (let name in attributes) {
    let mergedAttribute = mergeAttributes(attributes[name]);
    if (!mergedAttribute) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.",
      );
      return null;
    }
    merged.setAttribute(name, mergedAttribute);
  }
  for (let name in morphAttributes) {
    let numMorphTargets = morphAttributes[name][0].length;
    if (numMorphTargets !== 0) {
      merged.morphAttributes = merged.morphAttributes || {};
      merged.morphAttributes[name] = [];
      for (let i = 0; i < numMorphTargets; ++i) {
        let toMerge = [];
        for (let j = 0; j < morphAttributes[name].length; ++j) toMerge.push(morphAttributes[name][j][i]);
        let mergedMorph = mergeAttributes(toMerge);
        if (!mergedMorph) {
          console.error(
            "THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " +
              name +
              " morphAttribute.",
          );
          return null;
        }
        merged.morphAttributes[name].push(mergedMorph);
      }
    }
  }
  return merged;
}
function mergeAttributes(attributes) {
  let TypedArray,
    itemSize,
    normalized,
    gpuType = -1,
    arrayLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    let attribute = attributes[i];
    if (TypedArray === undefined) {
      TypedArray = attribute.array.constructor;
    }
    if (TypedArray !== attribute.array.constructor) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.",
      );
      return null;
    }
    if (itemSize === undefined) {
      itemSize = attribute.itemSize;
    }
    if (itemSize !== attribute.itemSize) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.",
      );
      return null;
    }
    if (normalized === undefined) {
      normalized = attribute.normalized;
    }
    if (normalized !== attribute.normalized) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.",
      );
      return null;
    }
    if (gpuType === -1) {
      gpuType = attribute.gpuType;
    }
    if (gpuType !== attribute.gpuType) {
      console.error(
        "THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.",
      );
      return null;
    }
    arrayLength += attribute.count * itemSize;
  }
  let array = new TypedArray(arrayLength),
    result = new BufferAttribute(array, itemSize, normalized),
    offset = 0;
  for (let i = 0; i < attributes.length; ++i) {
    let attribute = attributes[i];
    if (attribute.isInterleavedBufferAttribute) {
      let tupleOffset = offset / itemSize;
      for (let j = 0, count = attribute.count; j < count; j++)
        for (let k = 0; k < itemSize; k++) {
          let value = attribute.getComponent(j, k);
          result.setComponent(j + tupleOffset, k, value);
        }
    } else array.set(attribute.array, offset);
    offset += attribute.count * itemSize;
  }
  if (gpuType !== undefined) {
    result.gpuType = gpuType;
  }
  return result;
}
const partMatrix = new Matrix4(),
  partQuat = new Quaternion(),
  partEuler = new Euler(),
  partScale = new Vector3(),
  partPos = new Vector3();
function meshPart(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, q = null } = {}) {
  let part = geo.index ? geo.toNonIndexed() : geo;
  if (q) partQuat.copy(q);
  else partQuat.setFromEuler(partEuler.set(rx, ry, rz));
  partMatrix.compose(partPos.set(x, y, z), partQuat, partScale.set(sx, sy, sz));
  part.applyMatrix4(partMatrix);
  part.deleteAttribute("uv");
  let col = new Color(color),
    count = part.attributes.position.count,
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  part.setAttribute("color", new BufferAttribute(colors, 3));
  return part;
}
function mergeParts(parts) {
  let merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}
function shieldArcGeometry() {
  const shield = new CylinderGeometry(1.37, 1.29, 1.39, 24, 2, true, -Math.PI / 2.9, (Math.PI * 2) / 2.9);
  shield.rotateY(Math.PI / 2);
  shield.translate(0, 0.8, 0);
  return shield;
}
function discGeometry() {
  const profile = new Shape();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const r = [1.03, 0.94, 0.76, 0.88][i % 4];
    if (i === 0) profile.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else profile.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  profile.closePath();
  const blade = new ExtrudeGeometry(profile, { depth: 0.066, bevelEnabled: false });
  return mergeParts([
    meshPart(blade, cream, { rx: -Math.PI / 2, y: -0.033 }),
    collar(brass, 0.44, 0.035, { y: 0.054, rx: Math.PI / 2 }),
    jewel(0x879c84, 0.31, { y: 0.07, sy: 0.48 }),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return jewel(0x92694c, 0.14, {
        x: Math.cos(a) * 0.61,
        z: Math.sin(a) * 0.61,
        y: 0.047,
        ry: -a,
        sx: 1.25,
        sy: 0.1,
        sz: 0.5,
      });
    }),
  ]);
}
function debrisGeometry() {
  return new OctahedronGeometry(0.57).scale(0.86, 0.39, 1.1).rotateZ(0.37);
}
function buildPlayerModel(weapon, color) {
  // Porcelain head, split mantle and brass-shod articulated legs.
  const hullMat = worldMaterial({ surface: "armor", color: 0xf0dcb2, shininess: 56 }),
    trimMat = worldMaterial({ surface: "armor", color: 0xb34e3c, shininess: 43 }),
    mechanismMat = worldMaterial({ surface: "rubber", color: 0x20333c, shininess: 8 }),
    steelMat = worldMaterial({ surface: "metal", color: 0xc99554, shininess: 64 }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false }),
    visorMat = worldMaterial({ surface: "crystal", color: 0x1c4148, shininess: 68 }),
    group = new Group(),
    base = new Group(),
    torso = new Group(),
    HIP = 0.68,
    THIGH = 0.3,
    SHIN = 0.3,
    addPart = (parts, material, parent) => {
      const mesh = new Mesh(mergeParts(parts), material);
      parent.add(mesh);
      return mesh;
    };
  addPart(
    [
      shell(0xffffff, 0.33, 0.43, { x: -0.04, y: 1.04, sx: 1.07, sz: 1.05, rz: -0.2 }),
      ...both((side) => [
        jewel(0xffffff, 0.37, { x: -0.16, y: 1.1, z: side * 0.32, sx: 0.89, sy: 0.5, sz: 0.79, ry: side * 0.43 }),
        jewel(0xffffff, 0.31, { x: 0.18, y: 0.97, z: side * 0.27, sx: 0.73, sy: 0.54, sz: 0.62 }),
      ]),
    ],
    hullMat,
    torso,
  );
  addPart(
    [
      ...both((side) => [
        jewel(0xffffff, 0.31, { x: -0.21, y: 0.94, z: side * 0.33, sx: 1.04, sy: 1.2, sz: 0.66, rz: -0.55 }),
        jewel(0xffffff, 0.19, { x: -0.34, y: 1.1, z: side * 0.28, sx: 1.15, sy: 0.8, sz: 0.78 }),
      ]),
      shell(0xffffff, 0.22, 0.31, { x: -0.35, y: 1.0, sz: 0.71, rz: 0.68 }),
    ],
    trimMat,
    torso,
  );
  addPart(
    [
      jewel(0xffffff, 0.26, { x: 0.25, y: 1.09, sx: 0.53, sy: 0.93, sz: 1.06 }),
      jewel(0xffffff, 0.13, { x: -0.4, y: 0.9, sx: 1.1, sy: 0.75, sz: 1.66 }),
    ],
    visorMat,
    torso,
  );
  addPart(
    [
      collar(0xffffff, 0.177, 0.027, { x: 0.343, y: 1.09, ry: Math.PI / 2, sx: 1.13 }),
      ...both((side) => [collar(0xffffff, 0.115, 0.021, { x: -0.15, y: 1.01, z: side * 0.452 })]),
    ],
    steelMat,
    torso,
  );
  addPart(
    [
      jewel(0xffffff, 0.085, { x: 0.409, y: 1.09, sx: 0.51, sy: 1.28, sz: 0.87 }),
      ...both((side) => [jewel(0xffffff, 0.052, { x: -0.21, y: 1.082, z: side * 0.453, sy: 1.7 })]),
    ],
    glowMat,
    torso,
  );
  addPart([shell(0xffffff, 0.23, 0.21, { y: HIP, sz: 1.1 })], mechanismMat, base);
  addPart(
    both((side) => [jewel(0xffffff, 0.11, { y: HIP, z: side * 0.27, sz: 0.7 })]),
    steelMat,
    base,
  );
  base.add(torso);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new Group(),
      knee = new Group(),
      ankle = new Group();
    hip.position.set(0, HIP, side * 0.235);
    addPart([jewel(0xffffff, 0.21, { x: 0.02, y: -0.145, sx: 0.65, sy: 1.05, sz: 0.68 })], trimMat, hip);
    addPart([pipe(0xffffff, 0.048, 0.057, 7, [-0.07, 0, 0], [-0.07, -THIGH, 0])], steelMat, hip);
    knee.position.set(0.02, -THIGH, 0);
    addPart(
      [
        collar(0xffffff, 0.079, 0.022, { z: side * 0.105, rx: side * 0.05 }),
        pipe(0xffffff, 0.065, 0.074, 6, [0.01, -0.01, 0], [-0.02, -SHIN, 0]),
      ],
      steelMat,
      knee,
    );
    addPart([shell(0xffffff, 0.092, 0.22, { x: 0.031, y: -0.153, rz: -0.17 })], hullMat, knee);
    ankle.position.set(-0.02, -SHIN, 0);
    addPart([jewel(0xffffff, 0.21, { x: 0.09, y: 0.015, sx: 1.07, sy: 0.38, sz: 0.65 })], mechanismMat, ankle);
    addPart([jewel(0xffffff, 0.19, { x: 0.13, y: 0.046, sx: 1.12, sy: 0.34, sz: 0.65 })], hullMat, ankle);
    knee.add(ankle);
    hip.add(knee);
    base.add(hip);
    legs.push({ hip, knee, ankle, side });
  }
  base.rotation.order = "YZX";
  group.add(base);
  const setWalk = (phase, amount, air, time) => {
    for (const leg of legs) {
      const p = phase + (leg.side > 0 ? 0 : Math.PI),
        swing = Math.sin(p) * 0.65 * amount,
        bend = Math.max(0, Math.cos(p)) * 0.8 * amount;
      leg.hip.rotation.z = swing * (1 - air) + 0.55 * air;
      leg.knee.rotation.z = -bend * (1 - air) - 1.1 * air;
      leg.ankle.rotation.z = (bend * 0.5 - swing * 0.3) * (1 - air) + 0.5 * air;
    }
    torso.rotation.y = Math.sin(phase) * 0.06 * amount;
    torso.rotation.z = Math.sin(phase * 2) * 0.018 * amount;
    return -Math.abs(Math.sin(phase)) * 0.045 * amount + Math.sin(time * 2.2) * 0.008 * (1 - amount);
  };
  const weaponMount = new Group(),
    turret = new Group(),
    gun = new Group();
  weaponMount.position.set(0, 1.23, 0);
  torso.add(weaponMount);
  weaponMount.add(turret);
  turret.add(gun);
  // The ball-and-ring bearing stays on the chest; only the stabilized yoke rotates and the gun recoils locally.
  addPart(
    [meshPart(new CylinderGeometry(0.22, 0.25, 0.12, 14), 0xffffff, { y: weaponMount.position.y - 0.06 })],
    mechanismMat,
    torso,
  );
  addPart(
    [meshPart(new TorusGeometry(0.19, 0.035, 5, 16), 0xffffff, { y: weaponMount.position.y - 0.025, rx: Math.PI / 2 })],
    steelMat,
    torso,
  );
  const gimbal = new Mesh(new SphereGeometry(0.16, 10, 6), steelMat);
  gimbal.position.y = 0.005;
  turret.add(gimbal);
  const cradle = new Mesh(armorBox(0.38, 0.16, 0.3, 0.035), trimMat);
  cradle.position.set(0, 0.105, 0);
  turret.add(cradle);
  gun.position.y = 0.16;
  const axis = new Vector3(0, 1, 0),
    worldAim = new Quaternion(),
    parentRotation = new Quaternion();
  const aimAt = (angle, dt = 0) => {
    weaponMount.getWorldQuaternion(parentRotation).invert();
    worldAim.setFromAxisAngle(axis, -angle);
    turret.quaternion.copy(parentRotation).multiply(worldAim);
    model.recoil = Math.max(0, model.recoil - dt * 0.65);
    gun.position.x = -model.recoil;
  };
  const barrels = {
    pulse: [0.77, 0.125, 1],
    scatter: [0.65, 0.106, 2],
    tesla: [0.7, 0.12, 1],
    rail: [1.1, 0.087, 1],
    rocket: [0.56, 0.093, 4],
    disc: [0.62, 0.15, 1],
    flame: [0.74, 0.133, 1],
  };
  const [reach, bore, count] = barrels[weapon] || barrels.pulse;
  addPart([jewel(0xffffff, 0.27, { x: 0.04, y: 0.045, sx: 1.3, sy: 0.62, sz: 0.91 })], trimMat, gun);
  for (let i = 0; i < count; i++) {
    const z = count === 1 ? 0 : i % 2 === 0 ? -0.104 : 0.104;
    const y = count < 4 ? 0.028 : i < 2 ? -0.058 : 0.114;
    const narrow = weapon === "rail" || weapon === "tesla";
    addPart(
      [
        pipe(0xffffff, bore * 0.58, bore * 0.78, 8, [0.16, y, z], [reach - 0.06, y, z]),
        collar(0xffffff, bore * 0.67, bore * 0.16, { x: reach - 0.055, y, z, ry: Math.PI / 2 }),
      ],
      steelMat,
      gun,
    );
    addPart(
      [
        jewel(0xffffff, 0.24, {
          x: reach * 0.48,
          y,
          z,
          sx: reach * (narrow ? 1.84 : 1.62),
          sy: bore * 2.7,
          sz: bore * (weapon === "disc" ? 4.8 : 3),
        }),
      ],
      hullMat,
      gun,
    );
    addPart([jewel(0xffffff, bore * 0.44, { x: reach - 0.035, y, z, sx: 0.39 })], mechanismMat, gun);
    addPart(
      [jewel(0xffffff, bore * 0.31, { x: reach * 0.52, y: y + bore * 0.47, z, sx: 1.64, sy: 0.6 })],
      glowMat,
      gun,
    );
  }
  if (weapon === "tesla" || weapon === "pulse")
    addPart(
      [0.28, 0.43, 0.58].map((x) => collar(0xffffff, bore * 0.94, 0.015, { x, y: 0.03, ry: Math.PI / 2 })),
      steelMat,
      gun,
    );
  if (weapon === "disc") addPart([collar(0xffffff, 0.17, 0.032, { x: 0.43, y: 0.11, rx: Math.PI / 2 })], steelMat, gun);
  if (weapon === "flame" || weapon === "rail")
    addPart(
      both((z) => [jewel(0xffffff, 0.14, { x: 0.21, y: 0.065, z: z * 0.17, sx: 1.25, sy: 0.71 })]),
      trimMat,
      gun,
    );
  const muzzle = new Group();
  muzzle.position.set(
    { pulse: 0.77, scatter: 0.65, tesla: 0.7, rail: 1.1, rocket: 0.56, disc: 0.62, flame: 0.74 }[weapon] || 0.77,
    0.02,
    0,
  );
  gun.add(muzzle);
  mergeStaticMeshes(torso);
  mergeStaticMeshes(gun);
  let shield = new Mesh(new SphereGeometry(1, 20, 12), createAegisMaterial(color));
  shield.position.y = 0.95;
  shield.scale.setScalar(1.1);
  group.add(shield);
  const model = {
    group,
    base,
    turret,
    weaponMount,
    gun,
    muzzle,
    aimAt,
    recoil: 0,
    shield,
    mats: [hullMat, trimMat, mechanismMat, steelMat],
    glowMat,
    setWalk,
    legs,
    lean: 0,
    bank: 0,
  };
  aimAt(0);
  return model;
}
// Independent silhouettes and mechanisms for each of the six encounters.
function buildBossModel(type, color) {
  const finish = BOSS_EFFECTS[type].surface;
  const group = new Group(),
    spin = [];
  const glaze = {
    warden: 0x8b775d,
    prism: 0x829fbc,
    queen: 0x6b956e,
    core: 0x6561a0,
    tyrant: 0xb66951,
    wyrm: 0xaaa074,
  }[type];
  const hull = worldMaterial({ surface: finish, color: glaze });
  const frame = worldMaterial({ surface: "rubber", color: ink });
  const trim = worldMaterial({ surface: "metal", color: brass });
  const enamel = worldMaterial({ surface: "armor", color: cream });
  const glowMat = new MeshBasicMaterial({ color, toneMapped: false });
  const add = (parent, mat, geo, x = 0, y = 0, z = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const ring = (p, mat, r, t, x, y, z, axis) => {
    const m = add(p, mat, new TorusGeometry(r, t, 6, 40), x, y, z);
    if (axis) m.rotation[axis] = Math.PI / 2;
    return m;
  };
  const facet = (p, mat, r, x, y, z, sx, sy, sz) => {
    const m = add(p, mat, new OctahedronGeometry(r), x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const vessel = (p, mat, r, h, x, y, z) =>
    add(
      p,
      mat,
      new LatheGeometry(
        [
          new Vector2(0, -h * 0.5),
          new Vector2(r * 0.68, -h * 0.49),
          new Vector2(r, -h * 0.23),
          new Vector2(r * 0.98, h * 0.11),
          new Vector2(r * 0.79, h * 0.35),
          new Vector2(r * 0.4, h * 0.5),
          new Vector2(0, h * 0.5),
        ],
        18,
      ),
      x,
      y,
      z,
    );
  const revolve = (y, v) => {
    const g = new Group();
    g.position.y = y;
    group.add(g);
    spin.push({ m: g, ax: "y", v });
    return g;
  };
  if (type === "warden") {
    vessel(group, hull, 1.38, 2.42, -0.32, 1.6, 0).rotation.z = -0.49;
    facet(group, enamel, 1.04, 0.72, 1.86, 0, 0.7, 1.13, 1.14);
    ring(group, trim, 0.58, 0.12, 1.1, 1.91, 0, "y");
    facet(group, glowMat, 0.38, 1.25, 1.91, 0, 0.66, 1, 1);
    for (const s of [-1, 1]) {
      vessel(group, frame, 0.47, 1.14, -0.35, 0.57, s * 0.84).rotation.z = s * 0.27;
      vessel(group, hull, 0.61, 1.35, 0.15, 1.26, s * 1.19).rotation.x = s * 0.54;
      facet(group, trim, 0.47, 1.0, 1.07, s * 1.48, 1.54, 0.47, 0.7);
    }
  } else if (type === "prism") {
    vessel(group, frame, 1.08, 0.64, 0, 0.6, 0);
    facet(group, hull, 1.13, 0, 1.95, 0, 0.84, 1.52, 0.84);
    facet(group, enamel, 0.89, 0.08, 2.6, 0, 0.78, 1.06, 0.78);
    facet(group, glowMat, 0.32, 0.55, 2.16, 0, 0.53, 1.43, 1);
    const halos = revolve(2.15, 0.58);
    ring(halos, trim, 1.33, 0.06, 0, 0, 0, "x").rotation.z = 0.34;
    ring(halos, trim, 1.56, 0.048, 0, 0.22, 0).rotation.y = 0.64;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      facet(halos, hull, 0.46, Math.cos(a) * 1.72, 0.13, Math.sin(a) * 1.72, 0.65, 1.53, 0.65);
    }
  } else if (type === "queen") {
    vessel(group, hull, 1.61, 2.31, -0.57, 1.25, 0).rotation.z = -0.21;
    vessel(group, enamel, 1.18, 0.61, -0.34, 2.3, 0);
    facet(group, glowMat, 0.49, 0.36, 2.36, 0, 0.67, 0.81, 1.27);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const arm = add(
          group,
          hull,
          new LatheGeometry(
            [
              new Vector2(0, 0),
              new Vector2(0.42, 0.08),
              new Vector2(0.37, 0.55),
              new Vector2(0.15, 1.1),
              new Vector2(0, 1.32),
            ],
            10,
          ),
          0.53 - i * 0.66,
          1.14,
          s * 0.95,
        );
        arm.rotation.x = s * 1.07;
        arm.rotation.z = (i - 1) * 0.36;
      }
      facet(group, trim, 0.68, 0.77, 1.24, s * 1.45, 1.1, 0.6, 0.71);
    }
    const stamens = revolve(2.44, 0.31);
    ring(stamens, trim, 0.8, 0.05, 0, 0, 0, "x");
    for (let i = 0; i < 6; i++)
      facet(
        stamens,
        glowMat,
        0.14,
        Math.cos((i * Math.PI) / 3) * 0.9,
        0.06,
        Math.sin((i * Math.PI) / 3) * 0.9,
        0.8,
        1.6,
        0.8,
      );
  } else if (type === "core") {
    vessel(group, frame, 1.51, 0.75, 0, 0.57, 0);
    ring(group, trim, 1.33, 0.077, 0, 0.89, 0, "x");
    const lock = revolve(2.4, 0.48);
    facet(lock, glowMat, 0.75, 0, 0, 0, 0.85, 1.28, 0.85);
    ring(lock, enamel, 1.15, 0.11, 0, 0, 0).rotation.y = 0.3;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      facet(lock, hull, 0.87, Math.cos(a) * 1.22, -0.12, Math.sin(a) * 1.22, 1.06, 0.52, 1.04);
    }
  } else if (type === "tyrant") {
    vessel(group, frame, 1.66, 1.44, -0.35, 0.86, 0);
    vessel(group, hull, 1.58, 1.91, -0.32, 1.75, 0).rotation.z = -0.29;
    ring(group, trim, 1.18, 0.1, -0.38, 2.22, 0, "x");
    vessel(group, enamel, 0.71, 0.7, 0.53, 2.19, 0).rotation.z = -0.78;
    facet(group, glowMat, 0.39, 1.14, 2.05, 0, 0.7, 0.83, 1.28);
    for (const s of [-1, 1]) {
      facet(group, hull, 0.94, 0.3, 1.08, s * 1.36, 0.78, 1.08, 0.66);
      facet(group, trim, 0.66, 0.9, 0.6, s * 1.47, 1.41, 0.6, 0.79);
      facet(group, enamel, 0.56, -0.8, 2.45, s * 0.68, 0.73, 1.75, 0.76);
    }
  } else {
    group.userData.tail = [];
    for (let i = 0; i < 6; i++) {
      const segment = new Group();
      const z = Math.sin(i * 1.25) * 0.48;
      const size = 1.22 - i * 0.13;
      segment.position.set(0.75 - i * 0.61, 0.8 + Math.sin(i * 0.76) * 0.38, z);
      group.add(segment);
      group.userData.tail.push({ m: segment, z, i });
      vessel(segment, i % 2 === 0 ? hull : enamel, size * 0.66, 0.81 + i * 0.015, 0, 0, 0).rotation.z = 0.9;
      ring(segment, trim, size * 0.55, 0.059, 0.14, 0.03, 0, "y");
      facet(segment, i % 2 === 0 ? glowMat : trim, 0.27, -0.05, size * 0.53, 0, 0.73, 1.57, 0.83);
    }
    facet(group, hull, 0.88, 1.35, 1.08, 0, 1.22, 0.79, 0.99);
    facet(group, glowMat, 0.33, 1.91, 1.25, 0, 0.47, 0.96, 1.15);
  }
  mergeStaticMeshes(group);
  const mats = [hull, frame, trim, enamel].filter((mat) => {
    let used = false;
    group.traverse((o) => {
      if (o.material === mat) used = true;
    });
    if (!used) mat.dispose();
    return used;
  });
  group.userData.fadeMats = mats;
  for (const m of [...mats, glowMat]) m.transparent = true;
  return { group, mats, glowMat, spin };
}

function rocketProjectileGeometry() {
  return mergeParts([
    shell(cream, 0.089, 0.49, { x: 0.043, rz: -Math.PI / 2 }),
    jewel(brass, 0.16, { x: 0.18, sx: 1.03, sy: 0.55, sz: 0.55 }),
    collar(0x8c4932, 0.072, 0.014, { x: -0.11, ry: Math.PI / 2 }),
    ...both((side) => [jewel(0x456660, 0.14, { x: -0.167, z: side * 0.085, sy: 0.23, sx: 0.9 })]),
  ]);
}
function wingDroneGeometry() {
  return mergeParts([
    shell(0x9ab8a5, 0.24, 0.24, { y: 0.9, sz: 0.74 }),
    jewel(cream, 0.22, { x: 0.15, y: 0.94, sx: 1.27, sy: 0.42, sz: 0.52 }),
    ...both((side) => [jewel(brass, 0.21, { x: -0.15, y: 0.89, z: side * 0.18, ry: side * 0.48, sy: 0.18, sz: 1.18 })]),
  ]);
}
function orbitBladeGeometry() {
  const shape = new Shape();
  shape.moveTo(0.58, 0);
  shape.quadraticCurveTo(0.1, 0.27, -0.19, 0.13);
  shape.quadraticCurveTo(-0.065, 0, -0.19, -0.13);
  shape.quadraticCurveTo(0.18, -0.21, 0.58, 0);
  const geom = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 5 });
  return geom.rotateX(Math.PI / 2).translate(0, 0.62, 0);
}
function shardGeometry() {
  return new OctahedronGeometry(0.23).scale(0.62, 1.49, 0.9).rotateY(0.36);
}
function healCrossGeometry() {
  return mergeParts([
    collar(0xbbeece, 0.273, 0.024, {}),
    ...Array.from({ length: 4 }, (_, i) => {
      const a = (i * Math.PI) / 2;
      return jewel(0xffffff, 0.15, { x: Math.cos(a) * 0.129, y: Math.sin(a) * 0.129, rz: a, sz: 0.38 });
    }),
  ]);
}

export {
  rocketProjectileGeometry,
  meshPart,
  mergeParts,
  box,
  debrisGeometry,
  discGeometry,
  enemyGeometry,
  shardGeometry,
  orbitBladeGeometry,
  buildBossModel,
  shieldArcGeometry,
  healCrossGeometry,
  buildPlayerModel,
  wingDroneGeometry,
};
