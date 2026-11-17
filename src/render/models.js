// Mesh builders for the player drone, enemies, bosses and props.
import { worldMaterial, enemySurface } from "./world-material.js";
import { createAegisMaterial } from "./aegis-material.js";
import { BOSS_EFFECTS } from "../data/combat-effects.js";
import { strataGeometry as basaltStrata, shardGeometry as basaltShard } from "./strata-geometry.js";
import { armorBox } from "./armor-geometry.js";
import { mergeStaticMeshes } from "./static-meshes.js";

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

/* ==========================================================================
 Enemy models (2.7.0 redesign). One merged BufferGeometry per type and layer: "body" takes the
 enemy colour (mid / dark / lite / pale shades, vertex colours, flat shading), "glow" is white and
 gets tinted per instance by the renderer. +x is the facing direction, y is up, the ground is y = 0.
 Every type has its own silhouette and one feature to remember it by. Biological types are round
 and asymmetric, machines keep hard forms with panels, vents and lights. Budget: at most 810
 triangles per type (body + glow, including planar armor chamfers), the footprint stays in the size class of enemyDefs[type].r.
 ========================================================================== */
const PI = Math.PI,
  TAU_M = Math.PI * 2,
  RL_PALE_WHITE = new Color(16777215),
  limbUp = new Vector3(0, 1, 0),
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
  ball = (color, r, w, h, p = {}) => meshPart(new SphereGeometry(r, w, h), color, p),
  box = (color, w, h, d, p = {}) =>
    meshPart(Math.min(w, h, d) >= 0.12 ? armorBox(w, h, d) : new BoxGeometry(w, h, d), color, p),
  both = (make) => [].concat(make(1), make(-1));
const RL_ENEMY_BUILDERS = {
  swarmer: (P) => ({
    // Phase 4F husk: a small chitin dart, wing blades folded flat over a dark shell, one ember eye
    body: [
      ball(P.mid, 0.22, 7, 5, { x: 0.02, y: 0.42, sx: 1.5, sy: 0.85 }),
      ball(P.dark, 0.14, 6, 4, { x: 0.24, y: 0.46 }),
      box(P.lite, 0.3, 0.08, 0.34, { x: 0.02, y: 0.58, rz: -0.06 }),
      ...both((s) => [
        bar(P.dark, 0.26, [0.04, 0.52, s * 0.1], [-0.26, 0.58, s * 0.5], 0.03),
        bar(P.dark, 0.05, [0.06, 0.3, s * 0.08], [0.14, 0.02, s * 0.16]),
        bar(P.dark, 0.05, [-0.14, 0.32, s * 0.08], [-0.22, 0.02, s * 0.14]),
        spike(P.pale, 0.03, 3, [0.36, 0.4, s * 0.06], [0.56, 0.32, s * 0.16]),
      ]),
      spike(P.dark, 0.06, 4, [-0.26, 0.42, 0], [-0.52, 0.36, 0]),
    ],
    glow: [ball(P.white, 0.06, 5, 3, { x: 0.3, y: 0.54 }), box(P.white, 0.03, 0.03, 0.18, { x: -0.04, y: 0.5 })],
  }),
  mite: (P) => ({
    // Phase 4F husk: a shard-backed tick, dark shell over a pale core, six needle legs, one ember eye
    body: [
      meshPart(new OctahedronGeometry(0.22), P.mid, { y: 0.3, sx: 1.3, sy: 0.7 }),
      ball(P.dark, 0.17, 6, 4, { x: 0.2, y: 0.3 }),
      box(P.lite, 0.28, 0.05, 0.08, { x: -0.02, y: 0.42 }),
      spike(P.pale, 0.05, 4, [-0.06, 0.44, 0.06], [-0.2, 0.6, 0.1]),
      spike(P.pale, 0.04, 4, [-0.1, 0.4, -0.07], [-0.24, 0.54, -0.1]),
      ...both((s) => [
        bar(P.metal, 0.03, [0.12, 0.26, s * 0.12], [0.2, 0.02, s * 0.3]),
        bar(P.metal, 0.03, [0, 0.26, s * 0.14], [0.02, 0.02, s * 0.34]),
        bar(P.metal, 0.03, [-0.12, 0.26, s * 0.12], [-0.2, 0.02, s * 0.3]),
        spike(P.pale, 0.03, 3, [0.28, 0.3, s * 0.06], [0.44, 0.22, s * 0.1]),
      ]),
    ],
    glow: [ball(P.white, 0.06, 5, 3, { x: 0.28, y: 0.32 }), box(P.white, 0.16, 0.03, 0.04, { x: -0.04, y: 0.44 })],
  }),
  splitter: (P) => ({
    // trefoil cell: three fused lobes of different size, each with a nucleus
    body: [
      ball(P.mid, 0.34, 7, 5, { x: 0.02, y: 0.62 }),
      ball(P.mid, 0.46, 7, 5, { x: 0.3, y: 0.7, z: 0.08, sy: 0.92 }),
      ball(P.lite, 0.4, 7, 5, { x: -0.27, y: 0.66, z: 0.38 }),
      ball(P.dark, 0.42, 7, 5, { x: -0.22, y: 0.64, z: -0.4, sy: 1.05 }),
      spike(P.pale, 0.05, 4, [0.1, 1.0, -0.05], [0.06, 1.28, -0.02]),
    ],
    glow: [
      meshPart(new IcosahedronGeometry(0.17, 0), P.white, { x: 0.42, y: 1.02, z: 0.08 }),
      meshPart(new IcosahedronGeometry(0.14, 0), P.white, { x: -0.3, y: 0.94, z: 0.4 }),
      meshPart(new IcosahedronGeometry(0.15, 0), P.white, { x: -0.24, y: 0.98, z: -0.42 }),
      meshPart(new OctahedronGeometry(0.1), P.white, { x: 0.04, y: 1.34, z: -0.02 }),
    ],
  }),
  leaper: (P) => ({
    // Phase 4F husk: a crouched grave-frog, hooded eyes of different size, folded legs and bone feet
    body: [
      ball(P.mid, 0.36, 8, 5, { x: -0.04, y: 0.46, sx: 1.2, sy: 0.75 }),
      ball(P.dark, 0.28, 7, 5, { x: 0.3, y: 0.56, sx: 1.1, sy: 0.8 }),
      box(P.lite, 0.32, 0.06, 0.36, { x: 0.26, y: 0.78, rz: -0.1 }),
      ...both((s) => [
        bar(P.dark, 0.14, [-0.26, 0.5, s * 0.34], [-0.48, 0.42, s * 0.58], 0.13),
        bar(P.mid, 0.11, [-0.48, 0.42, s * 0.58], [-0.06, 0.06, s * 0.58], 0.1),
        box(P.pale, 0.26, 0.05, 0.12, { x: 0.04, y: 0.04, z: s * 0.58 }),
        bar(P.dark, 0.09, [0.3, 0.44, s * 0.26], [0.5, 0.06, s * 0.34], 0.09),
        spike(P.dark, 0.04, 3, [0.5, 0.08, s * 0.34], [0.64, 0.04, s * 0.4]),
      ]),
      box(P.dark, 0.28, 0.34, 0.06, { x: -0.34, y: 0.7, rz: 0.14 }),
      box(P.dark, 0.2, 0.26, 0.05, { x: -0.4, y: 0.44, rz: 0.2 }),
    ],
    glow: [
      ball(P.white, 0.09, 6, 4, { x: 0.42, y: 0.66, z: 0.16 }),
      ball(P.white, 0.06, 5, 3, { x: 0.44, y: 0.62, z: -0.16 }),
      box(P.white, 0.05, 0.03, 0.28, { x: 0.52, y: 0.36 }),
    ],
  }),
  hive: (P) => ({
    // Phase 4F husk: a bloated brood mound under stacked mantles, hatch pods lit from within
    body: [
      ball(P.mid, 0.9, 8, 6, { y: 0.8, sy: 0.85 }),
      box(P.lite, 1.0, 0.3, 1.05, { y: 0.62 }),
      box(P.dark, 0.8, 0.22, 0.85, { y: 1.18, rz: 0.04 }),
      ball(P.dark, 0.55, 7, 5, { x: -0.08, y: 1.55, z: 0.06 }),
      box(P.lite, 0.5, 0.14, 0.55, { x: 0.04, y: 1.32 }),
      spike(P.pale, 0.07, 4, [-0.1, 2.2, 0.08], [0.02, 2.6, 0.22]),
      spike(P.pale, 0.05, 4, [-0.24, 2.1, 0.16], [-0.48, 2.4, 0.34]),
      ...[0.2, 2.3, 4.3].map((a, i) =>
        ball(i === 1 ? P.lite : P.dark, 0.28 + i * 0.03, 6, 4, {
          x: Math.cos(a) * 0.92,
          y: 0.5 + i * 0.12,
          z: Math.sin(a) * 0.92,
        }),
      ),
      box(P.dark, 0.3, 0.5, 0.07, { x: -0.62, y: 1.0, rz: 0.12 }),
      box(P.dark, 0.22, 0.4, 0.06, { x: -0.7, y: 0.68, rz: 0.2 }),
    ],
    glow: [
      ...[0.2, 2.3, 4.3].map((a, i) =>
        meshPart(new OctahedronGeometry(0.13), P.white, {
          x: Math.cos(a) * 1.12,
          y: 0.52 + i * 0.12,
          z: Math.sin(a) * 1.12,
        }),
      ),
      meshPart(new OctahedronGeometry(0.15), P.white, { x: 0.04, y: 2.66, z: 0.26 }),
      ball(P.white, 0.09, 5, 3, { x: 0.56, y: 1.0, z: -0.36 }),
    ],
  }),
  carrier: (P) => ({
    // Phase 4F husk: a shadow manta with bone-swept wing tips and lit launch bays under the hull
    body: [
      ball(P.mid, 0.55, 8, 5, { y: 0.6, sx: 1.1, sy: 0.32, sz: 1.0 }),
      ball(P.dark, 0.26, 6, 4, { x: 0.3, y: 0.7, sy: 0.8 }),
      box(P.lite, 0.44, 0.1, 0.5, { x: 0.14, y: 0.78 }),
      ...both((s) => [
        bar(P.dark, 0.5, [0.04, 0.6, s * 0.42], [-0.42, 0.56, s * 1.05], 0.06),
        spike(P.pale, 0.07, 4, [-0.4, 0.56, s * 1.0], [-0.66, 0.52, s * 1.24]),
        box(P.metal, 0.28, 0.16, 0.24, { x: -0.04, y: 0.44, z: s * 0.62 }),
      ]),
      spike(P.dark, 0.1, 4, [-0.52, 0.58, 0], [-1.1, 0.48, 0]),
      box(P.dark, 0.24, 0.4, 0.08, { x: -0.2, y: 0.84 }),
      box(P.metal, 0.26, 0.16, 0.28, { x: 0.4, y: 0.44 }),
    ],
    glow: [
      ball(P.white, 0.06, 5, 3, { x: 0.46, y: 0.76, z: 0.12 }),
      ball(P.white, 0.06, 5, 3, { x: 0.46, y: 0.76, z: -0.12 }),
      box(P.white, 0.12, 0.04, 0.05, { x: -0.04, y: 0.4, z: 0.62 }),
      box(P.white, 0.12, 0.04, 0.05, { x: -0.04, y: 0.4, z: -0.62 }),
      box(P.white, 0.12, 0.04, 0.05, { x: 0.4, y: 0.4 }),
      meshPart(new OctahedronGeometry(0.1), P.white, { x: -0.1, y: 0.94 }),
    ],
  }),
  mender: (P) => ({
    // Phase 4F husk: a hooded gravekeeper acolyte, layered robes, swinging a censer under an ember cross
    body: [
      ...both((s) => [
        box(P.dark, 0.26, 0.3, 0.28, { x: 0.02, y: 0.15, z: s * 0.2 }),
        bar(P.dark, 0.09, [0.02, 0.62, s * 0.24], [0.16, 0.5, s * 0.42]),
      ]),
      pipe(P.mid, 0.36, 0.3, 8, [0, 0.02, 0], [0, 0.72, 0]),
      ball(P.mid, 0.3, 7, 5, { y: 0.84, sy: 1.05 }),
      box(P.lite, 0.4, 0.1, 0.44, { y: 0.98 }),
      box(P.dark, 0.32, 0.26, 0.34, { x: 0.04, y: 1.14 }),
      spike(P.dark, 0.22, 5, [0.02, 1.2, 0], [-0.14, 1.44, 0.04]),
      box(P.dark, 0.3, 0.44, 0.07, { x: -0.34, y: 0.9, rz: 0.1 }),
      box(P.dark, 0.22, 0.34, 0.06, { x: -0.42, y: 0.6, rz: 0.18 }),
      bar(P.metal, 0.03, [0.26, 0.5, 0.36], [0.28, 0.3, 0.36]),
      pipe(P.metal, 0.12, 0.15, 6, [0.28, 0.3, 0.36], [0.28, 0.44, 0.36]),
    ],
    glow: [
      box(P.white, 0.4, 0.09, 0.09, { y: 1.52 }),
      box(P.white, 0.09, 0.09, 0.4, { y: 1.52 }),
      ball(P.white, 0.07, 5, 3, { x: 0.28, y: 0.38, z: 0.36 }),
      box(P.white, 0.05, 0.07, 0.1, { x: 0.2, y: 1.1 }),
    ],
  }),
  grunt: (P) => ({
    // Phase 4C husk: a hunched scavenger brute sunk into layered shoulder mantles, one ember eye,
    // a ragged banner dragging off its back. Hooded-cultist read at arena scale.
    body: [
      ...both((s) => [
        box(P.dark, 0.3, 0.34, 0.32, { x: 0.05, y: 0.17, z: s * 0.26 }),
        box(P.dark, 0.34, 0.14, 0.36, { x: 0.08, y: 0.06, z: s * 0.26 }),
      ]),
      ball(P.mid, 0.44, 8, 6, { x: 0.06, y: 0.66, sx: 1.15, sy: 0.9 }),
      box(P.lite, 0.58, 0.4, 0.62, { x: 0.18, y: 0.9, rz: -0.08 }),
      ...both((s) => [
        box(P.lite, 0.34, 0.2, 0.42, { x: -0.12, y: 1.16, z: s * 0.52, rz: s * -0.14 }),
        box(P.dark, 0.26, 0.16, 0.34, { x: -0.3, y: 1.06, z: s * 0.56, rz: s * -0.2 }),
        spike(P.pale, 0.07, 4, [-0.34, 1.2, s * 0.5], [-0.52, 1.52, s * 0.56]),
        bar(P.dark, 0.3, [0.16, 0.9, s * 0.44], [0.52, 0.42, s * 0.6], 0.11),
        ball(P.dark, 0.21, 7, 5, { x: 0.52, y: 0.28, z: s * 0.6 }),
      ]),
      box(P.dark, 0.4, 0.26, 0.44, { x: 0.02, y: 1.18 }),
      box(P.lite, 0.3, 0.1, 0.36, { x: 0.16, y: 1.28 }),
      box(P.dark, 0.3, 0.36, 0.08, { x: -0.4, y: 0.92, rz: 0.12 }),
      box(P.dark, 0.24, 0.3, 0.07, { x: -0.46, y: 0.62, rz: 0.2 }),
    ],
    glow: [
      box(P.white, 0.05, 0.09, 0.2, { x: 0.24, y: 1.2 }),
      box(P.white, 0.04, 0.16, 0.06, { x: 0.42, y: 0.84 }),
      box(P.white, 0.03, 0.24, 0.03, { x: -0.56, y: 0.98, z: 0.04 }),
    ],
  }),
  gunner: (P) => ({
    // Phase 4C arquebusier: a hooded marksman leaning over its long piece, eye lit under the brim.
    body: [
      pipe(P.dark, 0.4, 0.3, 8, [0, 0.02, 0], [0, 0.36, 0]),
      ball(P.mid, 0.36, 8, 5, { x: 0.02, y: 0.66, sy: 0.9 }),
      box(P.lite, 0.4, 0.3, 0.5, { x: 0.14, y: 0.78, rz: -0.1 }),
      box(P.dark, 0.34, 0.24, 0.4, { x: -0.06, y: 1.0 }),
      box(P.lite, 0.3, 0.05, 0.42, { x: 0.1, y: 1.08, rz: -0.12 }),
      bar(P.metal, 0.9, [0.18, 0.7, 0.26], [1.02, 0.78, 0.26], 0.055),
      box(P.dark, 0.3, 0.16, 0.16, { x: 0.12, y: 0.64, z: 0.26 }),
      box(P.metal, 0.1, 0.22, 0.18, { x: 1.06, y: 0.82, z: 0.26 }),
      box(P.dark, 0.26, 0.34, 0.24, { x: -0.34, y: 0.78 }),
      spike(P.dark, 0.035, 3, [-0.34, 0.98, 0], [-0.42, 1.2, 0.04]),
    ],
    glow: [
      box(P.white, 0.05, 0.07, 0.12, { x: 0.2, y: 1.0 }),
      ball(P.white, 0.05, 5, 3, { x: 1.12, y: 0.8, z: 0.26 }),
      box(P.white, 0.03, 0.12, 0.03, { x: -0.44, y: 1.06, z: 0.05 }),
    ],
  }),
  bomber: (P) => ({
    // Phase 4C satchel wretch: a small hunched carrier bent under a glowing ember satchel.
    body: [
      ...both((s) => [
        bar(P.dark, 0.06, [0.04, 0.34, s * 0.14], [0.1, 0.02, s * 0.2]),
        bar(P.dark, 0.06, [-0.12, 0.34, s * 0.14], [-0.2, 0.02, s * 0.18]),
      ]),
      ball(P.mid, 0.3, 8, 6, { y: 0.52, sx: 0.95, sy: 0.95 }),
      ball(P.dark, 0.28, 7, 5, { x: -0.2, y: 0.72, sy: 0.85 }),
      bar(P.dark, 0.5, [0.12, 0.72, 0], [-0.34, 0.86, 0], 0.04),
      box(P.lite, 0.26, 0.2, 0.3, { x: 0.16, y: 0.8 }),
      spike(P.metal, 0.04, 4, [0.2, 0.92, 0], [0.3, 1.14, 0]),
      ...both((s) => [box(P.metal, 0.05, 0.2, 0.06, { x: -0.2, y: 0.72, z: s * 0.2 })]),
    ],
    glow: [
      box(P.white, 0.05, 0.06, 0.14, { x: 0.26, y: 0.84 }),
      box(P.white, 0.04, 0.05, 0.3, { x: -0.2, y: 0.62 }),
      box(P.white, 0.05, 0.05, 0.05, { x: -0.34, y: 0.84 }),
    ],
  }),
  brute: (P) => ({
    // Phase 4C colossus: a hunched stone-bulk hauler, mantel plates stacked, fists like anvils.
    body: [
      ...both((s) => [
        box(P.dark, 0.42, 0.5, 0.44, { x: 0.0, y: 0.26, z: s * 0.42 }),
        box(P.dark, 0.5, 0.18, 0.52, { x: 0.06, y: 0.08, z: s * 0.42 }),
        box(P.lite, 0.56, 0.26, 0.5, { x: -0.12, y: 1.34, z: s * 0.72, rz: s * -0.1 }),
        box(P.dark, 0.42, 0.22, 0.4, { x: -0.3, y: 1.18, z: s * 0.74, rz: s * -0.16 }),
        spike(P.pale, 0.09, 4, [-0.36, 1.42, s * 0.6], [-0.56, 1.86, s * 0.66]),
        bar(P.dark, 0.42, [0.14, 1.04, s * 0.7], [0.7, 0.6, s * 0.78], 0.16),
        ball(P.dark, 0.3, 7, 5, { x: 0.86, y: 0.44, z: s * 0.8 }),
        pipe(P.metal, 0.1, 0.08, 6, [-0.52, 1.5, s * 0.3], [-0.58, 1.98, s * 0.3]),
      ]),
      ball(P.mid, 0.6, 8, 6, { x: 0.08, y: 0.94, sx: 1.2, sy: 0.85 }),
      box(P.lite, 0.6, 0.44, 0.66, { x: 0.3, y: 1.06, rz: -0.06 }),
      box(P.dark, 0.44, 0.3, 0.5, { x: 0.18, y: 1.42 }),
      box(P.lite, 0.32, 0.1, 0.4, { x: 0.34, y: 1.52 }),
      box(P.dark, 0.4, 0.5, 0.1, { x: -0.56, y: 1.0, rz: 0.1 }),
      box(P.dark, 0.3, 0.4, 0.09, { x: -0.64, y: 0.64, rz: 0.18 }),
    ],
    glow: [
      box(P.white, 0.06, 0.1, 0.2, { x: 0.42, y: 1.44 }),
      box(P.white, 0.05, 0.2, 0.06, { x: 0.52, y: 0.98 }),
      ...both((s) => [box(P.white, 0.04, 0.1, 0.04, { x: -0.6, y: 1.84, z: s * 0.3 })]),
    ],
  }),
  sniper: (P) => ({
    // Phase 4C watcher: a hooded lens on a tripod of blades, the long piece slung low.
    body: [
      ...[
        [0.32, 0.4],
        [-0.34, 0.3],
        [-0.26, -0.44],
      ].map(([x, z]) => bar(P.dark, 0.05, [0, 0.84, 0], [x, 0.02, z])),
      meshPart(new OctahedronGeometry(0.3), P.mid, { y: 0.96, sy: 1.5 }),
      spike(P.dark, 0.3, 5, [-0.06, 1.3, 0], [-0.24, 1.04, 0]),
      box(P.lite, 0.26, 0.05, 0.3, { x: 0.12, y: 1.22 }),
      bar(P.metal, 1.3, [-0.05, 1.0, 0.18], [1.3, 1.06, 0.18], 0.05),
      box(P.dark, 0.3, 0.12, 0.12, { x: 0.5, y: 1.08, z: 0.18 }),
    ],
    glow: [
      ball(P.white, 0.12, 6, 4, { x: 0.26, y: 1.16 }),
      ball(P.white, 0.045, 5, 3, { x: 1.34, y: 1.06, z: 0.18 }),
      box(P.white, 0.03, 0.03, 0.2, { x: -0.02, y: 1.24 }),
    ],
  }),
  bulwark: (P) => ({
    // Phase 4C shieldbearer: a tower shield planted forward, the husk crouched behind it.
    body: [
      box(P.lite, 0.14, 1.3, 0.94, { x: 0.6, y: 0.78 }),
      ...both((s) => [box(P.dark, 0.12, 1.34, 0.12, { x: 0.58, y: 0.78, z: s * 0.5 })]),
      box(P.dark, 0.16, 0.14, 1.0, { x: 0.6, y: 1.46 }),
      box(P.dark, 0.16, 0.14, 1.0, { x: 0.6, y: 0.1 }),
      box(P.metal, 0.1, 0.5, 0.1, { x: 0.42, y: 0.78, z: 0.24 }),
      box(P.metal, 0.1, 0.5, 0.1, { x: 0.42, y: 0.78, z: -0.24 }),
      ball(P.mid, 0.4, 8, 6, { x: -0.16, y: 0.6, sy: 0.9 }),
      ...both((s) => [
        box(P.dark, 0.28, 0.32, 0.3, { x: -0.14, y: 0.17, z: s * 0.28 }),
        box(P.dark, 0.12, 0.6, 0.12, { x: -0.3, y: 0.9, z: s * 0.3 }),
      ]),
      box(P.dark, 0.34, 0.26, 0.4, { x: -0.3, y: 1.06 }),
    ],
    glow: [box(P.white, 0.04, 0.07, 0.16, { x: 0.66, y: 1.28 }), box(P.white, 0.05, 0.6, 0.05, { x: 0.68, y: 0.78 })],
  }),
  striker: (P) => ({
    // Phase 4C dart: a hooded spur with one long blade and a hard trail fin.
    body: [
      meshPart(new OctahedronGeometry(0.34), P.mid, { y: 0.62, sx: 1.4, sy: 0.75, sz: 0.7 }),
      box(P.lite, 0.3, 0.16, 0.3, { x: 0.24, y: 0.78 }),
      bar(P.metal, 0.8, [0.3, 0.66, 0.2], [1.0, 0.6, 0.34], 0.03),
      spike(P.pale, 0.05, 3, [1.0, 0.6, 0.34], [1.2, 0.58, 0.38]),
      ...both((s) => [
        bar(P.dark, 0.4, [-0.14, 0.68, s * 0.08], [-0.6, 0.9, s * 0.34], 0.025),
        bar(P.dark, 0.05, [0.08, 0.5, s * 0.12], [0.14, 0.04, s * 0.2]),
      ]),
    ],
    glow: [
      box(P.white, 0.06, 0.04, 0.12, { x: 0.34, y: 0.8 }),
      ...both((s) => [bar(P.white, 0.025, [0.34, 0.65, s * 0.24], [1.0, 0.6, s * 0.34], 0.02)]),
    ],
  }),
  mortar: (P) => ({
    // Phase 4F husk: a low rift-artillery crawler, riveted base plate, steep dark tube, racked shells
    body: [
      pipe(P.dark, 0.68, 0.6, 8, [0, 0.08, 0], [0, 0.4, 0]),
      ...[0.8, 2.35, 3.95, 5.5].map((a) =>
        box(P.metal, 0.34, 0.18, 0.26, { x: Math.cos(a) * 0.64, y: 0.1, z: Math.sin(a) * 0.64, ry: -a }),
      ),
      meshPart(new SphereGeometry(0.44, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), P.mid, { y: 0.4, sy: 0.9 }),
      box(P.lite, 0.5, 0.14, 0.56, { y: 0.62 }),
      pipe(P.metal, 0.18, 0.14, 8, [-0.04, 0.58, 0], [0.46, 1.36, 0]),
      pipe(P.lite, 0.22, 0.22, 8, [0.4, 1.26, 0], [0.5, 1.4, 0]),
      box(P.dark, 0.3, 0.3, 0.48, { x: -0.34, y: 0.78, rz: 0.2 }),
      box(P.dark, 0.24, 0.4, 0.07, { x: -0.5, y: 0.98, rz: 0.26 }),
      ...[-0.16, 0, 0.16].map((z) => pipe(P.pale, 0.055, 0.055, 5, [-0.48, 0.34, z * 2.2], [-0.04, 0.34, z * 2.2])),
    ],
    glow: [
      pipe(P.white, 0.24, 0.24, 8, [0.47, 1.35, 0], [0.51, 1.41, 0]),
      ...[-0.16, 0, 0.16].map((z) => ball(P.white, 0.05, 4, 3, { x: -0.04, y: 0.34, z: z * 2.2 })),
      ...both((s) => [box(P.white, 0.06, 0.03, 0.16, { x: 0.28, y: 0.5, z: s * 0.48 })]),
    ],
  }),
  turret: (P) => ({
    // Phase 4F husk: a hex plinth turret, hooded barrel mantles and one roving ember lens
    body: [
      pipe(P.dark, 0.68, 0.52, 6, [0, 0.02, 0], [0, 0.3, 0]),
      pipe(P.metal, 0.22, 0.16, 8, [0, 0.3, 0], [0, 0.62, 0]),
      box(P.mid, 0.56, 0.32, 0.5, { y: 0.86 }),
      box(P.lite, 0.38, 0.14, 0.44, { y: 1.06 }),
      ...both((s) => [
        pipe(P.metal, 0.055, 0.055, 6, [0.24, 0.88, s * 0.14], [1.04, 0.88, s * 0.14]),
        box(P.dark, 0.3, 0.14, 0.12, { x: 0.34, y: 0.88, z: s * 0.14 }),
        box(P.dark, 0.2, 0.38, 0.14, { x: -0.1, y: 0.86, z: s * 0.34 }),
      ]),
      box(P.dark, 0.34, 0.3, 0.44, { x: -0.24, y: 0.86 }),
      spike(P.pale, 0.035, 3, [-0.3, 1.04, 0.1], [-0.4, 1.42, 0.1]),
      spike(P.pale, 0.03, 3, [-0.26, 1.02, -0.12], [-0.34, 1.32, -0.14]),
    ],
    glow: [
      ball(P.white, 0.1, 6, 4, { x: 0.14, y: 1.14 }),
      ball(P.white, 0.045, 5, 3, { x: 1.08, y: 0.88, z: 0.14 }),
      ball(P.white, 0.045, 5, 3, { x: 1.08, y: 0.88, z: -0.14 }),
      pipe(P.white, 0.6, 0.6, 12, [0, 0.03, 0], [0, 0.06, 0]),
    ],
  }),
  charger: (P) => ({
    // Phase 4F husk: a plated rift rhino sunk low, one bone ram horn, ember brow
    body: [
      box(P.mid, 0.9, 0.48, 0.7, { x: -0.05, y: 0.5 }),
      box(P.dark, 0.46, 0.3, 0.55, { x: 0.4, y: 0.42, rz: -0.18 }),
      ...[0, 1, 2].map((i) => box(P.lite, 0.24, 0.13, 0.66 - i * 0.07, { x: -0.36 + i * 0.26, y: 0.82 + i * 0.03 })),
      ...both((s) => [
        box(P.dark, 0.28, 0.3, 0.2, { x: 0.26, y: 0.15, z: s * 0.28 }),
        box(P.dark, 0.28, 0.3, 0.2, { x: -0.38, y: 0.15, z: s * 0.28 }),
        spike(P.pale, 0.07, 4, [0.3, 0.78, s * 0.28], [0.56, 1.02, s * 0.4]),
        box(P.dark, 0.26, 0.4, 0.06, { x: -0.44, y: 0.66, z: s * 0.36, rz: s * 0.1 }),
      ]),
      spike(P.pale, 0.17, 6, [0.44, 0.52, 0], [1.16, 0.46, 0]),
      spike(P.pale, 0.06, 4, [0.56, 0.66, 0.1], [0.78, 0.8, 0.14]),
      spike(P.pale, 0.06, 4, [0.56, 0.66, -0.1], [0.78, 0.8, -0.14]),
    ],
    glow: [
      ...both((s) => [box(P.white, 0.06, 0.05, 0.14, { x: 0.5, y: 0.68, z: s * 0.22 })]),
      box(P.white, 0.34, 0.04, 0.04, { x: -0.3, y: 0.9 }),
      spike(P.white, 0.04, 4, [1.06, 0.47, 0], [1.22, 0.46, 0]),
    ],
  }),
  minebot: (P) => ({
    // Phase 4F husk: a shadow crab with needle legs, bone pincers and ember mines bedded in its shell
    body: [
      pipe(P.dark, 0.58, 0.52, 8, [0, 0.14, 0], [0, 0.32, 0]),
      meshPart(new SphereGeometry(0.48, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), P.mid, { y: 0.32, sy: 0.9 }),
      box(P.lite, 0.5, 0.12, 0.54, { y: 0.5 }),
      ...both((s) => [
        bar(P.metal, 0.05, [0.2, 0.32, s * 0.4], [0.5, 0.05, s * 0.6]),
        bar(P.metal, 0.05, [-0.2, 0.32, s * 0.4], [-0.48, 0.05, s * 0.58]),
        bar(P.metal, 0.05, [0, 0.32, s * 0.5], [0.02, 0.05, s * 0.74]),
        bar(P.dark, 0.12, [0.28, 0.36, s * 0.36], [0.7, 0.3, s * 0.5]),
        spike(P.pale, 0.08, 4, [0.68, 0.3, s * 0.4], [0.96, 0.28, s * 0.32]),
        bar(P.metal, 0.03, [0.38, 0.6, s * 0.13], [0.46, 0.82, s * 0.15]),
      ]),
      ...[0, 1, 2].map((k) => {
        const a = Math.PI * 0.6 + k * 0.5;
        return ball(P.dark, 0.09, 5, 3, { x: Math.cos(a) * 0.28 - 0.04, y: 0.72, z: Math.sin(a) * 0.28 - 0.06 });
      }),
    ],
    glow: [
      ...[0, 1, 2].map((k) => {
        const a = Math.PI * 0.6 + k * 0.5;
        return meshPart(new OctahedronGeometry(0.11), P.white, {
          x: Math.cos(a) * 0.28 - 0.04,
          y: 0.76,
          z: Math.sin(a) * 0.28 - 0.06,
        });
      }),
      ...both((s) => [ball(P.white, 0.05, 5, 3, { x: 0.46, y: 0.84, z: s * 0.15 })]),
    ],
  }),
  sapper: (P) => ({
    // Phase 4F husk: a masked powder-lurker, dark robe, dynamite rack on the back, a heavy wrench
    body: [
      ...both((s) => [
        bar(P.dark, 0.12, [0, 0.4, s * 0.15], [0.02, 0.02, s * 0.18]),
        bar(P.dark, 0.1, [0.05, 0.72, s * 0.26], [0.34, 0.56, s * 0.34]),
      ]),
      pipe(P.mid, 0.32, 0.24, 8, [0, 0.34, 0], [0, 0.76, 0]),
      ball(P.dark, 0.24, 7, 5, { y: 0.96 }),
      spike(P.dark, 0.18, 5, [-0.04, 1.06, 0], [-0.22, 1.3, 0.02]),
      box(P.lite, 0.3, 0.44, 0.42, { x: -0.32, y: 0.54 }),
      ...[-0.13, 0, 0.13].map((z) => pipe(P.pale, 0.045, 0.045, 5, [-0.38, 0.76, z], [-0.38, 1.0, z])),
      box(P.metal, 0.16, 0.12, 0.3, { x: 0.14, y: 0.94 }),
      bar(P.metal, 0.05, [0.32, 0.58, 0.32], [0.6, 0.64, 0.46]),
      box(P.metal, 0.12, 0.05, 0.2, { x: 0.64, y: 0.64, z: 0.48 }),
      box(P.dark, 0.26, 0.4, 0.06, { x: -0.36, y: 0.2, rz: 0.1 }),
    ],
    glow: [
      box(P.white, 0.05, 0.04, 0.1, { x: 0.2, y: 0.96 }),
      ...[-0.13, 0, 0.13].map((z) => ball(P.white, 0.04, 4, 3, { x: -0.38, y: 1.04, z })),
      box(P.white, 0.04, 0.3, 0.04, { x: -0.5, y: 0.6 }),
    ],
  }),
  phantom: (P) => ({
    // Phase 4F husk: a torn hood wraith, flare cloak ragged to the floor, claw arms and drifting wisps
    body: [
      spike(P.mid, 0.46, 7, [0, 0.14, 0], [0, 1.08, 0]),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const a = (i / 7) * TAU_M;
        return spike(
          i % 2 ? P.dark : P.mid,
          0.09,
          4,
          [Math.cos(a) * 0.38, 0.3, Math.sin(a) * 0.38],
          [Math.cos(a) * 0.44, 0.02 + (i % 3) * 0.06, Math.sin(a) * 0.44],
        );
      }),
      ball(P.dark, 0.24, 7, 5, { x: 0.02, y: 1.16 }),
      spike(P.dark, 0.18, 6, [-0.04, 1.3, 0], [-0.36, 1.54, 0.02]),
      box(P.lite, 0.36, 0.08, 0.4, { y: 1.02 }),
      ...both((s) => [
        spike(P.dark, 0.08, 5, [0.14, 0.9, s * 0.28], [0.74, 0.76, s * 0.48]),
        spike(P.pale, 0.03, 3, [0.7, 0.78, s * 0.47], [0.94, 0.68, s * 0.56]),
      ]),
    ],
    glow: [
      ...both((s) => [meshPart(new OctahedronGeometry(0.07), P.white, { x: 0.2, y: 1.2, z: s * 0.09, sx: 1.6 })]),
      meshPart(new OctahedronGeometry(0.08), P.white, { x: -0.46, y: 0.68, z: 0.32 }),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: -0.28, y: 1.0, z: -0.46 }),
    ],
  }),
  sentinel: (P) => ({
    // Phase 4F husk: a hooded watch-pylon, ember eye sunk in a tilted bone-spiked ring
    body: [
      pipe(P.dark, 0.42, 0.15, 6, [0, 0.02, 0], [0, 0.56, 0]),
      pipe(P.mid, 0.2, 0.1, 6, [0, 0.56, 0], [0, 0.86, 0]),
      ball(P.mid, 0.42, 8, 5, { y: 1.02 }),
      meshPart(new TorusGeometry(0.6, 0.06, 4, 14), P.metal, { y: 1.02, rx: 0.35 }),
      box(P.lite, 0.4, 0.1, 0.44, { y: 0.78 }),
      box(P.dark, 0.3, 0.26, 0.34, { x: -0.04, y: 1.2, rz: 0.06 }),
      ...[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * TAU_M;
        return spike(
          P.pale,
          0.06,
          4,
          [Math.cos(a) * 0.62, 1.02 + Math.sin(a) * 0.2, Math.sin(a) * 0.62],
          [Math.cos(a) * 0.86, 1.02 + Math.sin(a) * 0.3, Math.sin(a) * 0.86],
        );
      }),
    ],
    glow: [
      ball(P.white, 0.17, 7, 5, { x: 0.32, y: 1.04 }),
      ball(P.dark, 0.075, 5, 3, { x: 0.48, y: 1.04 }),
      pipe(P.white, 0.44, 0.44, 12, [0, 0.03, 0], [0, 0.06, 0]),
    ],
  }),
  drone: (P) => ({
    // Phase 4F husk: a bone-arm husk needler, thin rotor blades, belly pods, one ember nose light
    body: [
      box(P.mid, 0.38, 0.13, 0.28, { y: 0.82 }),
      ball(P.dark, 0.12, 6, 4, { x: 0.1, y: 0.9 }),
      spike(P.metal, 0.04, 4, [0.16, 0.8, 0], [0.72, 0.78, 0]),
      box(P.dark, 0.07, 0.16, 0.04, { x: -0.2, y: 0.92 }),
      box(P.lite, 0.3, 0.05, 0.32, { y: 0.9 }),
      ...both((s) => [
        bar(P.metal, 0.04, [0.08, 0.82, s * 0.13], [0.34, 0.85, s * 0.34], 0.04),
        bar(P.metal, 0.04, [-0.08, 0.82, s * 0.13], [-0.32, 0.85, s * 0.32], 0.04),
        box(P.dark, 0.18, 0.08, 0.08, { x: 0.12, y: 0.7, z: s * 0.11 }),
      ]),
    ],
    glow: [
      ...[
        [0.36, 0.36],
        [0.36, -0.36],
        [-0.34, 0.34],
        [-0.34, -0.34],
      ].map(([x, z]) => box(P.white, 0.26, 0.02, 0.04, { x, y: 0.86, z, rz: z * x > 0 ? 0.7 : -0.7 })),
      ball(P.white, 0.045, 5, 3, { x: 0.26, y: 0.92 }),
      box(P.white, 0.12, 0.03, 0.04, { x: -0.06, y: 0.88 }),
    ],
  }),
  driller: (P) => ({
    // Phase 4F husk: a dark crawler digger, riveted tracks, a lit cab slit and a stepped bone drill
    body: [
      ...both((s) => [
        box(P.dark, 0.94, 0.24, 0.22, { y: 0.13, z: s * 0.42 }),
        box(P.metal, 0.28, 0.16, 0.05, { x: 0.32, y: 0.13, z: s * 0.56 }),
        pipe(P.metal, 0.08, 0.07, 6, [-0.36, 0.72, s * 0.2], [-0.36, 1.14, s * 0.2]),
      ]),
      box(P.mid, 0.8, 0.44, 0.6, { y: 0.46 }),
      box(P.metal, 0.4, 0.32, 0.44, { x: -0.14, y: 0.86 }),
      box(P.lite, 0.34, 0.1, 0.4, { x: -0.12, y: 1.06 }),
      pipe(P.dark, 0.28, 0.28, 8, [0.4, 0.46, 0], [0.6, 0.46, 0]),
      spike(P.pale, 0.3, 6, [0.56, 0.46, 0], [0.94, 0.46, 0]),
      spike(P.metal, 0.2, 6, [0.9, 0.46, 0], [1.2, 0.46, 0]),
      spike(P.pale, 0.1, 6, [1.16, 0.46, 0], [1.44, 0.46, 0]),
    ],
    glow: [
      box(P.white, 0.06, 0.12, 0.32, { x: 0.08, y: 0.9 }),
      ...both((s) => [ball(P.white, 0.05, 5, 3, { x: -0.36, y: 1.18, z: s * 0.2 })]),
      ...[0.62, 0.94].map((x) =>
        pipe(P.white, 0.3 - (x - 0.62) * 0.625, 0.3 - (x - 0.62) * 0.625, 8, [x, 0.46, 0], [x + 0.03, 0.46, 0]),
      ),
    ],
  }),
  beacon: (P) => ({
    // Phase 4F husk: a bone-masted repair spire, dark plinth, orbiting ember gems round a rift crystal
    body: [
      pipe(P.dark, 0.54, 0.42, 6, [0, 0.02, 0], [0, 0.24, 0]),
      pipe(P.mid, 0.24, 0.12, 6, [0, 0.24, 0], [0, 1.18, 0]),
      box(P.lite, 0.4, 0.12, 0.44, { y: 0.42 }),
      box(P.dark, 0.28, 0.2, 0.32, { y: 0.94 }),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M;
        return bar(P.metal, 0.05, [0, 0.92, 0], [Math.cos(a) * 0.52, 1.12 + (i % 2) * 0.18, Math.sin(a) * 0.52]);
      }),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M + 0.6;
        return spike(
          P.pale,
          0.09,
          4,
          [Math.cos(a) * 0.38, 0.24, Math.sin(a) * 0.38],
          [Math.cos(a) * 0.6, 0.68, Math.sin(a) * 0.6],
        );
      }),
    ],
    glow: [
      meshPart(new OctahedronGeometry(0.2), P.white, { y: 1.5, sy: 1.6 }),
      ...[0, 1, 2].map((i) => {
        const a = 0.5 + (i / 3) * TAU_M;
        return meshPart(new OctahedronGeometry(0.1), P.white, {
          x: Math.cos(a) * 0.52,
          y: 1.12 + (i % 2) * 0.18,
          z: Math.sin(a) * 0.52,
          sy: 1.5,
        });
      }),
      meshPart(new TorusGeometry(0.3, 0.025, 3, 12), P.white, { y: 0.52, rx: PI / 2 }),
    ],
  }),
  weaver: (P) => ({
    // Phase 4F husk: a ragged rift spider, dark abdomen with an ember seam, six needle legs
    body: [
      meshPart(new OctahedronGeometry(0.26), P.mid, { x: 0.12, y: 0.6, sx: 1.2, sy: 0.85 }),
      ball(P.dark, 0.28, 7, 5, { x: -0.28, y: 0.64, sx: 1.2, sy: 0.9 }),
      meshPart(new OctahedronGeometry(0.15), P.lite, { x: 0.4, y: 0.62 }),
      box(P.lite, 0.26, 0.05, 0.3, { x: 0.1, y: 0.78 }),
      ...[0, 1, 2]
        .map((k) =>
          both((s) => {
            const x = 0.2 - k * 0.2,
              out = 0.48 + (k === 1 ? 0.12 : 0);
            return [
              bar(P.metal, 0.05, [x, 0.58, s * 0.15], [x + 0.14 - k * 0.1, 0.78, s * out]),
              bar(P.metal, 0.04, [x + 0.14 - k * 0.1, 0.78, s * out], [x + 0.28 - k * 0.24, 0.02, s * (out + 0.4)]),
            ];
          }),
        )
        .flat(),
      ...both((s) => [spike(P.pale, 0.04, 3, [0.52, 0.58, s * 0.07], [0.68, 0.36, s * 0.06])]),
      box(P.dark, 0.24, 0.36, 0.06, { x: -0.4, y: 0.86, rz: 0.12 }),
    ],
    glow: [
      meshPart(new OctahedronGeometry(0.06), P.white, { x: 0.46, y: 0.68, z: 0.06 }),
      meshPart(new OctahedronGeometry(0.06), P.white, { x: 0.46, y: 0.68, z: -0.06 }),
      box(P.white, 0.3, 0.04, 0.05, { x: -0.26, y: 0.9 }),
      ball(P.white, 0.06, 5, 3, { x: -0.58, y: 0.58 }),
    ],
  }),
};

function enemyGeometry(type, color) {
  // Phase 4C: enemies read as dark carved carapaces with one glowing accent (Dead Cells hero-vs-horde
  // read, Inscryption palette discipline). Hue identity is preserved for gameplay readability;
  // value and saturation are deepened so the per-instance glow layer does the bright work.
  const base = new Color(color),
    hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const deep = new Color().setHSL(hsl.h, hsl.s * 0.7, Math.min(0.42, hsl.l * 0.42 + 0.09)),
    painted = deep.clone().lerp(new Color(0x3d4a4c), enemySurface(type) === "armor" ? 0.22 : 0.08),
    palette = {
      mid: painted.clone().multiplyScalar(0.95).getHex(),
      dark: painted.clone().multiplyScalar(0.45).getHex(),
      lite: painted.clone().multiplyScalar(1.45).getHex(),
      pale: deep.clone().lerp(RL_PALE_WHITE, 0.45).multiplyScalar(0.85).getHex(),
      metal: 0x2c3a40,
      white: 16777215,
    },
    parts = (RL_ENEMY_BUILDERS[type] || RL_ENEMY_BUILDERS.grunt)(palette);
  return { body: mergeParts(parts.body), glow: mergeParts(parts.glow) };
}

/* every enemy type owns a full husk kit; no detail passes remain (Phase 4F) */
const RL_MESH_TYPES = [
  "swarmer",
  "mite",
  "grunt",
  "gunner",
  "bomber",
  "splitter",
  "brute",
  "sniper",
  "hive",
  "bulwark",
  "striker",
  "mender",
  "mortar",
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
const darken = (color, factor = 0.5) => new Color(color).multiplyScalar(factor).getHex();
function shieldArcGeometry() {
  let geo = new CylinderGeometry(1.35, 1.35, 1.5, 20, 1, true, -Math.PI / 2.9, (Math.PI * 2) / 2.9);
  geo.rotateY(Math.PI / 2);
  geo.translate(0, 0.8, 0);
  return geo;
}
function discGeometry() {
  const edge = new Shape();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12,
      radius = i % 2 ? 0.81 : 1.07;
    if (i === 0) edge.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else edge.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  edge.closePath();
  const blade = new ExtrudeGeometry(edge, { depth: 0.07, bevelEnabled: false, steps: 1 });
  return mergeParts([
    meshPart(blade, 0xc9d4d0, { rx: -Math.PI / 2, y: -0.035 }),
    meshPart(new CylinderGeometry(0.34, 0.34, 0.13, 20), 0x293d43),
    meshPart(new CylinderGeometry(0.17, 0.17, 0.15, 16), 0xe3e8de),
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i * Math.PI) / 3;
      return box(0x61d5df, 0.22, 0.014, 0.035, { x: Math.cos(a) * 0.57, z: Math.sin(a) * 0.57, y: 0.042, ry: -a });
    }),
  ]);
}
function debrisGeometry() {
  // 3.44.0: a low-poly shard instead of a cube - kill debris reads as rubble now, not party confetti
  return new IcosahedronGeometry(0.58, 0);
}
function buildPlayerModel(weapon, color) {
  // Phase 4B: a dark slate-indigo walker with teal trim and an ember plume (Dead Cells hero read):
  // the shell is dark so the weapon glow, the visor light and the rim light carry the silhouette.
  const hullMat = worldMaterial({ surface: "armor", color: 0x2e3745, shininess: 30 }),
    trimMat = worldMaterial({ surface: "armor", color: 0x47a6a2, shininess: 24 }),
    mechanismMat = worldMaterial({ surface: "rubber", color: 0x141b22, shininess: 8 }),
    steelMat = worldMaterial({ surface: "metal", color: 0x5f6e73, shininess: 42 }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false }),
    visorMat = worldMaterial({ surface: "crystal", color: 0x142a30, shininess: 68 }),
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
  // Broad beveled shoulders and a sloped chest surround an inset sensor; the dark gaps expose the frame.
  addPart(
    [
      meshPart(armorBox(0.62, 0.42, 0.58, 0.075), 0xffffff, { x: -0.025, y: 0.99 }),
      meshPart(armorBox(0.22, 0.23, 0.43, 0.045), 0xffffff, { x: 0.27, y: 1.1, rz: -0.1 }),
      ...both((s) => [
        meshPart(armorBox(0.39, 0.2, 0.25, 0.045), 0xffffff, { x: -0.04, y: 1.12, z: s * 0.38, rx: s * 0.14 }),
      ]),
      box(0xffffff, 0.055, 0.2, 0.39, { x: 0.305, y: 0.93, rz: -0.12 }),
    ],
    hullMat,
    torso,
  );
  addPart(
    [
      ...both((s) => [
        box(0xffffff, 0.27, 0.25, 0.19, { x: -0.27, y: 0.99, z: s * 0.25 }),
        box(0xffffff, 0.13, 0.19, 0.17, { x: 0.09, y: 0.87, z: s * 0.41, rz: -0.15 }),
      ]),
      box(0xffffff, 0.21, 0.07, 0.4, { x: 0.06, y: 0.78 }),
    ],
    trimMat,
    torso,
  );
  addPart(
    [
      box(0xffffff, 0.43, 0.3, 0.5, { x: -0.06, y: 0.91 }),
      ...both((s) => [
        pipe(0xffffff, 0.06, 0.06, 8, [-0.11, 1.05, s * 0.43], [0.13, 0.78, s * 0.43]),
        ...[-0.08, 0, 0.08].map((z) => box(0xffffff, 0.025, 0.15, 0.04, { x: -0.414, y: 1.01, z: s * 0.25 + z })),
      ]),
    ],
    mechanismMat,
    torso,
  );
  addPart(
    [
      ...both((s) => [
        pipe(0xffffff, 0.035, 0.035, 8, [-0.08, 1.0, s * 0.43], [0.13, 0.8, s * 0.43]),
        box(0xffffff, 0.13, 0.04, 0.16, { x: 0.1, y: 0.77, z: s * 0.2 }),
      ]),
    ],
    steelMat,
    torso,
  );
  const visor = new Mesh(armorBox(0.025, 0.1, 0.31, 0.01), visorMat);
  visor.position.set(0.386, 1.1, 0);
  torso.add(visor);
  addPart(
    [
      box(color, 0.027, 0.026, 0.22, { x: 0.402, y: 1.115 }),
      ...both((s) => [box(color, 0.04, 0.025, 0.09, { x: -0.41, y: 1.1, z: s * 0.25 })]),
    ],
    glowMat,
    torso,
  );
  // Phase 4B: the plume - a stepped antenna trail off the back of the head, the walker's one
  // organic note (the Dead Cells scarf), tipped with the weapon's glow color.
  addPart([box(0xffffff, 0.11, 0.06, 0.16, { x: -0.33, y: 1.25, rz: 0.16 })], trimMat, torso);
  addPart([box(color, 0.05, 0.04, 0.07, { x: -0.4, y: 1.31, rz: 0.24 })], glowMat, torso);
  addPart([box(0xffffff, 0.31, 0.18, 0.46, { y: HIP + 0.025 })], mechanismMat, base);
  addPart([...both((s) => [pipe(0xffffff, 0.105, 0.105, 10, [0, HIP, s * 0.19], [0, HIP, s * 0.29])])], steelMat, base);
  base.add(torso);
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new Group(),
      knee = new Group(),
      ankle = new Group();
    hip.position.set(0, HIP, side * 0.235);
    addPart([box(0xffffff, 0.22, 0.26, 0.21, { x: 0.025, y: -0.14, rz: 0.08 })], trimMat, hip);
    addPart(
      [
        pipe(0xffffff, 0.055, 0.065, 8, [-0.1, 0, 0], [-0.08, -THIGH, 0]),
        pipe(0xffffff, 0.038, 0.038, 8, [0.09, -0.03, side * 0.08], [0.11, -0.26, side * 0.08]),
      ],
      steelMat,
      hip,
    );
    knee.position.set(0.02, -THIGH, 0);
    addPart(
      [
        pipe(0xffffff, 0.1, 0.1, 10, [0, 0, -0.12], [0, 0, 0.12]),
        bar(0xffffff, 0.1, [-0.015, -0.04, 0], [-0.04, -SHIN, 0], 0.12),
      ],
      mechanismMat,
      knee,
    );
    addPart(
      [
        box(0xffffff, 0.16, 0.13, 0.23, { x: 0.09, y: -0.015 }),
        box(0xffffff, 0.19, 0.23, 0.19, { x: 0.025, y: -0.19, rz: -0.08 }),
      ],
      hullMat,
      knee,
    );
    ankle.position.set(-0.02, -SHIN, 0);
    addPart(
      [
        box(0xffffff, 0.38, 0.075, 0.25, { x: 0.075, y: -0.025 }),
        box(0xffffff, 0.035, 0.11, 0.23, { x: -0.1, y: 0.005 }),
      ],
      mechanismMat,
      ankle,
    );
    addPart(
      [box(0xffffff, 0.29, 0.075, 0.24, { x: 0.1, y: 0.035 }), box(0xffffff, 0.07, 0.05, 0.25, { x: 0.245, y: 0.01 })],
      hullMat,
      ankle,
    );
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
  let addBarrel = (len, thick, z = 0, y = 0.02) => {
    const housing = new Mesh(armorBox(len * 0.65, thick * 1.5, thick * 1.45), hullMat);
    housing.position.set(len * 0.32 + 0.1, y, z);
    const tube = new Mesh(new CylinderGeometry(thick * 0.48, thick * 0.56, len * 0.46, 10), steelMat);
    tube.rotation.z = -Math.PI / 2;
    tube.position.set(len * 0.77 + 0.12, y, z);
    const collar = new Mesh(new TorusGeometry(thick * 0.5, thick * 0.15, 4, 10), steelMat);
    collar.rotation.y = Math.PI / 2;
    collar.position.set(len + 0.14, y, z);
    const bore = new Mesh(new CylinderGeometry(thick * 0.36, thick * 0.36, 0.012, 10), mechanismMat);
    bore.rotation.z = -Math.PI / 2;
    bore.position.set(len + 0.145, y, z);
    gun.add(housing, tube, collar, bore);
    for (const f of [0.25, 0.45, 0.65]) {
      const vent = new Mesh(armorBox(0.025, 0.012, thick * 0.85), mechanismMat);
      vent.position.set(len * f + 0.1, y + thick * 0.76, z);
      gun.add(vent);
    }
  };
  if (weapon === "scatter") {
    addBarrel(0.5, 0.13, 0.1);
    addBarrel(0.5, 0.13, -0.1);
  } else if (weapon === "rail") {
    addBarrel(0.95, 0.1);
    let rail = new Mesh(armorBox(0.8, 0.04, 0.26), trimMat);
    rail.position.set(0.55, 0.02, 0);
    gun.add(rail);
  } else if (weapon === "rocket") {
    let pod = new Mesh(armorBox(0.46, 0.26, 0.36), hullMat);
    pod.position.set(0.3, 0.05, 0);
    gun.add(pod);
    for (let z of [-0.09, 0.09])
      for (let y of [-0.03, 0.12]) {
        const rim = new Mesh(new TorusGeometry(0.042, 0.01, 4, 10), steelMat);
        rim.rotation.y = Math.PI / 2;
        rim.position.set(0.55, y, z);
        const bore = new Mesh(new CylinderGeometry(0.033, 0.033, 0.01, 10), mechanismMat);
        bore.rotation.z = -Math.PI / 2;
        bore.position.set(0.557, y, z);
        gun.add(rim, bore);
      }
  } else if (weapon === "tesla") {
    addBarrel(0.55, 0.12);
    let coil = new Mesh(new TorusGeometry(0.12, 0.03, 5, 14), steelMat);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(0.45, 0.02, 0);
    let coil2 = coil.clone();
    coil2.position.x = 0.3;
    const winding = new Mesh(new TorusGeometry(0.085, 0.012, 4, 14), glowMat);
    winding.rotation.y = Math.PI / 2;
    winding.position.set(0.46, 0.02, 0);
    gun.add(coil, coil2, winding);
  } else if (weapon === "disc") {
    let mount = new Mesh(armorBox(0.62, 0.08, 0.34), hullMat);
    mount.position.set(0.35, 0, 0);
    let disc = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 16), steelMat);
    disc.position.set(0.42, 0.08, 0);
    const rim = new Mesh(new TorusGeometry(0.18, 0.014, 4, 16), glowMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0.42, 0.11, 0);
    gun.add(mount, disc, rim);
  } else if (weapon === "flame") {
    let tank = new Mesh(new CylinderGeometry(0.12, 0.12, 0.5, 10), steelMat);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(-0.05, 0.1, 0);
    let nozzle = new Mesh(new CylinderGeometry(0.07, 0.12, 0.55, 10), hullMat);
    nozzle.rotation.z = -Math.PI / 2;
    nozzle.position.set(0.42, 0.02, 0);
    let pilot = new Mesh(new SphereGeometry(0.06, 8, 6), glowMat);
    pilot.position.set(0.72, 0.02, 0);
    gun.add(tank, nozzle, pilot);
  } else addBarrel(0.62, 0.13);
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
function volcanicBoulder(width, height, depth, seed) {
  // The same chipped strata as the terrain, centered for articulated stone limbs.
  return basaltStrata(width, height, depth, seed).translate(0, -height * 0.5, 0);
}
function buildBossModel(type, color) {
  const finish = BOSS_EFFECTS[type]?.surface || "armor";
  let group = new Group(),
    hullMat = worldMaterial({
      // Phase 4C: bosses sink into the dark like the husks; their glow lenses carry the color.
      surface: finish,
      color: darken(color, 0.26),
      emissive: 0,
      specular: 0x39444c,
      shininess: 28,
      flatShading: true,
    }),
    darkMat = worldMaterial({
      surface: "rubber",
      color: 2435898,
      emissive: 0,
      specular: 0x53616b,
      shininess: 28,
      flatShading: true,
    }),
    glowMat = new MeshBasicMaterial({ color, toneMapped: false }),
    makeTranslucent = [],
    spin = [],
    addMesh = (geo, mat, x, y, z, parent = group) => {
      let mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
  if (type === "warden") {
    // Layered security armor, exposed running gear and actual cannon bores. Light stays in lenses.
    hullMat.color.setHex(0x31404c);
    darkMat.color.setHex(0x0d161d);
    const plate = worldMaterial({ surface: "armor", color: 0x59625f, shininess: 25 }),
      steel = worldMaterial({ surface: "steel", color: 0x415158, shininess: 44 });
    addMesh(armorBox(2.55, 1.15, 2.8, 0.24), hullMat, -0.1, 1.05, 0);
    addMesh(armorBox(2.2, 0.3, 2.55, 0.12), darkMat, -0.05, 0.42, 0);
    addMesh(armorBox(1.8, 0.95, 1.8, 0.18), darkMat, -0.25, 1.95, 0);
    addMesh(armorBox(0.22, 0.7, 1.25, 0.08), plate, 1.17, 1.25, 0);
    for (const side of [-1, 1]) {
      addMesh(armorBox(1.2, 0.38, 1.0, 0.13), plate, -0.1, 2.7, side * 1.08);
      addMesh(armorBox(1.5, 0.16, 0.88, 0.06), hullMat, -0.05, 2.96, side * 1.08);
      addMesh(armorBox(2.15, 0.65, 0.56, 0.16), darkMat, -0.15, 0.6, side * 1.58);
      for (let i = 0; i < 6; i++) {
        addMesh(armorBox(0.18, 0.53, 0.59, 0.045), steel, -1.0 + i * 0.35, 0.58, side * 1.58);
        addMesh(armorBox(0.055, 0.28, 0.38, 0.015), darkMat, -1.14, 1.64 + i * 0.12, side * 0.62);
      }
      addMesh(armorBox(1.05, 0.45, 0.67, 0.12), hullMat, 0.55, 2.1, side * 1.04);
      addMesh(new CylinderGeometry(0.15, 0.2, 1.15, 12), steel, 1.31, 2.15, side * 1.04).rotation.z = Math.PI / 2;
      addMesh(new CylinderGeometry(0.23, 0.23, 0.15, 12), darkMat, 1.91, 2.15, side * 1.04).rotation.z = Math.PI / 2;
      addMesh(new CylinderGeometry(0.12, 0.12, 0.015, 12), glowMat, 1.994, 2.15, side * 1.04).rotation.z = Math.PI / 2;
      const brace = mergeParts([
        pipe(0xffffff, 0.07, 0.07, 8, [-0.8, 1.45, side * 1.3], [-0.75, 2.55, side * 1.1]),
        pipe(0xffffff, 0.06, 0.06, 8, [-0.45, 2.85, side * 0.72], [-0.45, 3.32, side * 0.72]),
        ...[-1, 1].map((i) => ball(0xffffff, 0.055, 6, 4, { x: 0.25 + i * 0.45, y: 3.05, z: side * 1.08 })),
      ]);
      addMesh(brace, steel, 0, 0, 0);
    }
    addMesh(armorBox(1.0, 0.65, 1.12, 0.14), hullMat, 0.35, 2.75, 0);
    addMesh(armorBox(0.1, 0.2, 0.8, 0.025), darkMat, 0.89, 2.82, 0);
    addMesh(armorBox(0.025, 0.055, 0.63, 0.012), glowMat, 0.951, 2.84, 0);
    const lightbar = new Group();
    lightbar.position.set(0.05, 3.24, 0);
    group.add(lightbar);
    addMesh(armorBox(0.42, 0.1, 1.25, 0.025), darkMat, 0, 0, 0, lightbar);
    for (const side of [-1, 1])
      addMesh(
        armorBox(0.28, 0.09, 0.4, 0.025),
        new MeshBasicMaterial({ color: side < 0 ? 0x2766ff : 0xff3045, toneMapped: false }),
        0,
        0.085,
        side * 0.32,
        lightbar,
      );
    spin.push({ m: lightbar, ax: "y", v: 7 });
    group.userData.mats = [plate, steel];
  } else if (type === "queen") {
    // A heavy plated insect with an abdomen, articulated legs and a crown of living glowcaps.
    hullMat.color.setHex(0x2c4738);
    darkMat.color.setHex(0x0b1a14);
    const chitin = worldMaterial({ surface: "organic", color: 0x3a4c31, shininess: 18, flatShading: false }),
      membrane = worldMaterial({ surface: "organic", color: 0x1c2e29, shininess: 24, flatShading: false });
    addMesh(new SphereGeometry(1.25, 24, 16), membrane, -0.95, 1.65, 0).scale.set(1.55, 0.86, 0.92);
    addMesh(new SphereGeometry(0.92, 20, 14), hullMat, 0.78, 1.65, 0).scale.set(1.2, 0.9, 0.9);
    for (let i = 0; i < 5; i++) {
      const x = -2.15 + i * 0.63,
        radius = 0.65 + Math.sin(((i + 1) / 6) * Math.PI) * 0.45;
      const shell = addMesh(new SphereGeometry(radius, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), chitin, x, 1.65, 0);
      shell.scale.set(0.56, 0.95, 0.96);
      const spine = addMesh(basaltShard(0.19, 0.65, 0.18), hullMat, x, 2.2 + radius * 0.18, 0);
      spine.rotation.z = 0.3;
    }
    const legs = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = 0.9 - i * 0.95,
          knee = [x - 0.38, 1.32, side * (1.65 + (i === 1 ? 0.14 : 0))],
          foot = [x + 0.2, 0.13, side * 2.12];
        legs.push(
          pipe(0xffffff, 0.12, 0.18, 9, [x, 1.76, side * 0.62], knee),
          pipe(0xffffff, 0.045, 0.11, 9, knee, foot),
          ball(0xffffff, 0.19, 10, 7, { x: knee[0], y: knee[1], z: knee[2] }),
        );
      }
      const jaw = mergeParts([
        pipe(0xffffff, 0.13, 0.2, 10, [1.5, 1.35, side * 0.4], [2.0, 1.05, side * 0.6]),
        spike(0xffffff, 0.12, 8, [2.0, 1.05, side * 0.6], [2.38, 1.2, side * 0.25]),
        pipe(0xffffff, 0.035, 0.07, 8, [1.3, 2.0, side * 0.35], [1.7, 2.8, side * 0.65]),
      ]);
      addMesh(jaw, darkMat, 0, 0, 0);
      for (let i = 0; i < 3; i++)
        addMesh(
          new SphereGeometry(0.065 + (i === 0 ? 0.02 : 0), 10, 7),
          glowMat,
          1.6 - i * 0.14,
          1.95 + i * 0.11,
          side * (0.38 + i * 0.12),
        );
      for (let i = 0; i < 4; i++) {
        const x = -1.95 + i * 0.52,
          z = side * (0.48 + Math.sin(i) * 0.15),
          y = 2.25 + Math.sin(i * 0.8) * 0.22;
        addMesh(new SphereGeometry(0.18, 12, 8), membrane, x, y, z).scale.set(0.8, 1.3, 1);
        addMesh(new SphereGeometry(0.075, 8, 6), glowMat, x + 0.04, y + 0.12, z);
      }
    }
    addMesh(mergeParts(legs), chitin, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const x = -1.8 + i * 0.43,
        y = 2.56 + Math.sin(i * 0.6) * 0.22,
        z = Math.sin(i * 2.3) * 0.4;
      addMesh(new CylinderGeometry(0.035, 0.06, 0.32, 8), darkMat, x, y, z);
      addMesh(new SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), chitin, x, y + 0.15, z).scale.y = 0.6;
      addMesh(new SphereGeometry(0.055, 8, 6), glowMat, x + 0.04, y + 0.26, z);
    }
    group.userData.mats = [chitin, membrane];
  } else if (type === "prism") {
    // 2.4.6: Frost Prism, a floating ice golem: a tall translucent crystal body with a cold glow
    // core and visor, crystal shoulders and crown (hullMat: frosted ice, flashes on hits), dark-blue
    // rock chunks (darkMat), orbiting frost shards and a frozen ring below. Everything fades out while
    // it blinks (fadeMats); the ice keeps its own translucency (userData.opacity).
    const ice = (color, emissive, opacity, deferTransparent = false) => {
      const mat = worldMaterial({
        surface: finish,
        color,
        emissive,
        flatShading: true,
        transparent: !deferTransparent,
        opacity,
        depthWrite: false,
      });
      if (deferTransparent) makeTranslucent.push(mat);
      mat.userData.opacity = opacity;
      return mat;
    };
    let iceMat = ice(13431295, 1716822, 0.8),
      paleIceMat = ice(14745599, 2771583, 0.5, true);
    hullMat.color.setHex(10934000);
    darkMat.color.setHex(2837350);
    makeTranslucent.push(hullMat, darkMat, glowMat);
    let body = addMesh(new OctahedronGeometry(1.35, 0), iceMat, 0, 2.3, 0);
    body.scale.set(1, 1.5, 1);
    spin.push({ m: body, ax: "y", v: 0.35 });
    // glow core seen through the ice, and a visor slit on the facing side (+x)
    addMesh(new OctahedronGeometry(0.55, 0), glowMat, 0, 2.3, 0).scale.set(1, 1.35, 1);
    addMesh(armorBox(0.1, 0.12, 0.72), glowMat, 0.98, 2.62, 0);
    // shoulders: crystal clusters leaning outwards on dark rock
    for (const z of [-1, 1]) {
      addMesh(new DodecahedronGeometry(0.42, 0), darkMat, -0.05, 2.35, z * 1.2);
      addMesh(new OctahedronGeometry(0.34, 0), hullMat, 0.05, 2.95, z * 1.35).rotation.set(z * 0.5, 0, 0.1);
      const big = addMesh(new ConeGeometry(0.3, 1.5, 5), hullMat, -0.1, 3.0, z * 1.25);
      big.rotation.set(z * 0.55, 0, -0.12);
      addMesh(new ConeGeometry(0.2, 0.95, 5), hullMat, 0.25, 2.6, z * 1.55).rotation.set(z * 1.0, 0, 0.3);
    }
    // crown of small spikes above the head
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3,
        spike = addMesh(new ConeGeometry(0.13, 0.75, 4), hullMat, Math.cos(angle) * 0.34, 4.35, Math.sin(angle) * 0.34);
      spike.rotation.set(Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45);
    }
    // icicles hanging below the body
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.8;
      addMesh(
        new ConeGeometry(0.14, 0.8, 4),
        paleIceMat,
        Math.cos(angle) * 0.45,
        0.62,
        Math.sin(angle) * 0.45,
      ).rotation.x = Math.PI;
    }
    // orbiting frost shards: three glowing, three of plain ice, at two heights
    let orbit = new Group();
    orbit.position.y = 2.3;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2,
        shard = addMesh(
          new OctahedronGeometry(i % 2 ? 0.26 : 0.32, 0),
          i % 2 ? paleIceMat : glowMat,
          Math.cos(angle) * 2.15,
          i % 2 ? 0.55 : -0.2,
          Math.sin(angle) * 2.15,
          orbit,
        );
      shard.scale.y = 1.7;
      shard.rotation.z = i % 2 ? 0.35 : -0.2;
    }
    // 3.51.0: two aurora gems ride the orbit - the shelf's light refracting in the Prism's ice
    const auroraA = ice(0x46e890, 0x186b42, 0.84),
      auroraB = ice(0xc86ee0, 0x562066, 0.84);
    addMesh(
      new OctahedronGeometry(0.16, 0),
      auroraA,
      Math.cos(1.05) * 2.15,
      0.95,
      Math.sin(1.05) * 2.15,
      orbit,
    ).scale.y = 1.4;
    addMesh(
      new OctahedronGeometry(0.16, 0),
      auroraB,
      Math.cos(4.2) * 2.15,
      -0.55,
      Math.sin(4.2) * 2.15,
      orbit,
    ).scale.y = 1.4;
    group.add(orbit);
    spin.push({ m: orbit, ax: "y", v: -1.4 });
    // frozen ring on the ground
    const ring = addMesh(new TorusGeometry(1.9, 0.07, 4, 40), glowMat, 0, 0.12, 0);
    ring.rotation.x = Math.PI / 2;
    {
      const WH = 0xffffff,
        hull = [],
        dark = [],
        pale = [],
        glow = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.2,
          r = 2.55 + Math.sin(i * 3) * 0.15,
          h = 0.6 + (i % 3) * 0.25;
        hull.push(
          spike(
            WH,
            0.12 + (i % 2) * 0.04,
            5,
            [Math.cos(a) * r, 0, Math.sin(a) * r],
            [Math.cos(a) * (r + 0.2), h, Math.sin(a) * (r + 0.2)],
          ),
        );
        glow.push(
          spike(
            WH,
            0.06,
            4,
            [Math.cos(a + 0.3) * 2.1, 0, Math.sin(a + 0.3) * 2.1],
            [Math.cos(a + 0.3) * 2.15, 0.3 + (i % 2) * 0.15, Math.sin(a + 0.3) * 2.15],
          ),
        );
      }
      dark.push(box(WH, 0.14, 0.12, 0.95, { x: 0.96, y: 2.9 }));
      glow.push(
        box(WH, 0.05, 0.6, 0.05, { x: 1.0, y: 1.9 }),
        bar(WH, 0.05, [1.0, 2.05, -0.3], [1.0, 1.75, 0], 0.03),
        bar(WH, 0.05, [1.0, 2.05, 0.3], [1.0, 1.75, 0], 0.03),
        bar(WH, 0.05, [1.0, 1.55, -0.2], [1.0, 1.55, 0.2], 0.03),
      );
      glow.push(
        meshPart(new TorusGeometry(1.75, 0.03, 3, 36), WH, { y: 2.3, rx: Math.PI / 2 + 0.12 }),
        meshPart(new TorusGeometry(0.85, 0.03, 3, 24), WH, { y: 2.3, rx: 1.2, ry: 0.5 }),
      );
      for (const z of [-1, 1]) {
        hull.push(
          spike(WH, 0.1, 5, [0.85, 2.4, z * 0.5], [1.3, 2.3, z * 0.75]),
          spike(WH, 0.08, 5, [0.8, 2.15, z * 0.4], [1.2, 1.95, z * 0.6]),
        );
        hull.push(meshPart(new DodecahedronGeometry(0.3, 0), WH, { x: -0.05, y: 2.68, z: z * 1.2, sy: 0.45 }));
        hull.push(spike(WH, 0.11, 5, [-0.9, 2.1, z * 0.3], [-1.45, 2.6, z * 0.45]));
        dark.push(meshPart(new DodecahedronGeometry(0.22, 0), WH, { x: 1.5 * z, y: 1.1 + z * 0.3, z: 1.2 }));
      }
      hull.push(
        spike(WH, 0.16, 5, [-0.95, 2.6, 0], [-1.6, 3.4, 0]),
        spike(WH, 0.13, 5, [-0.9, 2.9, 0], [-1.3, 3.9, 0]),
      );
      dark.push(
        meshPart(new DodecahedronGeometry(0.26, 0), WH, { x: -1.6, y: 1.5, z: 0.4 }),
        meshPart(new DodecahedronGeometry(0.2, 0), WH, { x: 0.3, y: 1.0, z: -1.7 }),
      );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3,
          x = Math.cos(a) * 0.75,
          z = Math.sin(a) * 0.75;
        pale.push(spike(WH, 0.07, 4, [x, 0.95, z], [x, 0.4 + (i % 3) * 0.12, z]));
      }
      const addMerged = (parts, mat) => parts.length && addMesh(mergeParts(parts), mat, 0, 0, 0);
      addMerged(hull, hullMat);
      addMerged(dark, darkMat);
      addMerged(pale, paleIceMat);
      addMerged(glow, glowMat);
    }
    group.userData.fadeMats = [iceMat, paleIceMat, hullMat, darkMat, glowMat, auroraA, auroraB];
  } else if (type === "tyrant") {
    // A living basalt colossus, facing +x: broken volcanic armor, a molten chest and a crown of rock.
    // No inherited gun, jewelry, coin ring or manufactured chimney remains from its predecessor.
    const basalt = worldMaterial({ surface: "basalt", color: 0x2e2b26, shininess: 7, flatShading: false }),
      crust = worldMaterial({ surface: "basalt", color: 0x181c1f, shininess: 11, flatShading: false }),
      cooled = worldMaterial({ surface: "basalt", color: 0x3f3b32, shininess: 5 });
    addMesh(volcanicBoulder(2.2, 2.05, 1.85, 71), basalt, -0.05, 2.0, 0);
    addMesh(basaltStrata(1.3, 0.65, 1.3, 73, true), crust, -0.2, 0.72, 0);
    for (const side of [-1, 1]) {
      addMesh(volcanicBoulder(0.78, 1.5, 0.85, 81 + side), crust, -0.2, 0.83, side * 0.62);
      addMesh(basaltStrata(1.15, 0.28, 0.9, 89 + side), cooled, 0.14, 0.02, side * 0.66);
      addMesh(volcanicBoulder(1.1, 1.35, 1.12, 93 + side), basalt, -0.17, 2.66, side * 1.04);
      const arm = addMesh(volcanicBoulder(0.8, 1.35, 0.9, 101 + side), crust, 0.3, 1.98, side * 1.17);
      arm.rotation.z = -0.28;
      addMesh(new IcosahedronGeometry(0.45, 1), basalt, 0.83, 1.48, side * 1.12).scale.set(1.15, 0.9, 0.9);
      addMesh(basaltShard(0.43, 1.05, 0.38), crust, -0.55, 2.78, side * 0.97).rotation.z = 0.23;
      addMesh(basaltStrata(0.4, 0.65, 0.48, 109 + side), cooled, -0.68, 2.52, side * 0.78);
      addMesh(
        mergeParts([
          bar(0xffffff, 0.035, [0.64, 1.48, side * 1.42], [1.08, 1.58, side * 1.2], 0.025),
          bar(0xffffff, 0.04, [-0.64, 2.66, side * 1.46], [0.12, 2.91, side * 1.43], 0.025),
        ]),
        glowMat,
        0,
        0,
        0,
      );
    }
    addMesh(volcanicBoulder(1.1, 0.95, 1.02, 117), crust, 0.48, 2.99, 0);
    addMesh(basaltStrata(0.65, 0.2, 0.75, 121), cooled, 0.77, 3.16, 0);
    for (const side of [-1, 1]) {
      addMesh(armorBox(0.04, 0.14, 0.23, 0.015), darkMat, 0.958, 3.03, side * 0.23);
      addMesh(armorBox(0.05, 0.055, 0.15, 0.01), glowMat, 0.986, 3.035, side * 0.23);
    }
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 0.27,
        height = 0.75 + (0.3 - Math.abs(i - 2) * 0.12),
        horn = addMesh(basaltShard(0.3, height, 0.27), i % 2 ? cooled : crust, -0.05 + Math.abs(i - 2) * 0.09, 3.15, z);
      horn.rotation.set((i - 2) * 0.12, 0, 0.2);
    }
    for (const side of [-1, 1]) {
      const chest = addMesh(basaltStrata(0.48, 1.35, 0.86, 137 + side), cooled, 0.77, 1.48, side * 0.43);
      chest.rotation.set(side * 0.12, side * 0.15, -0.12);
      addMesh(
        mergeParts([
          bar(0xffffff, 0.035, [0.83, 1.62, side * 0.1], [0.84, 2.34, side * 0.12], 0.025),
          bar(0xffffff, 0.025, [0.84, 2.34, side * 0.12], [0.69, 2.59, side * 0.32], 0.025),
        ]),
        glowMat,
        0,
        0,
        0,
      );
    }
    group.userData.mats = [basalt, crust, cooled];
  } else if (type === "wyrm") {
    // 3.56.0: THE GLASSWYRM: a serpent of living fused glass. A diamond head with a hot core, a
    // glowing visor and an open maw, an S-curved body of glass segments that undulates as it swims
    // (userData.tail - the renderer wiggles it), shards orbiting the head, a hot ring and a sand
    // skirt under it. Everything fades while it dives (userData.fadeMats; boss.diveT drives it).
    // the glass carries its own light (emissive): the Flats' noon blows any diffuse base out to cream
    // (hemi 1.15 + sun 2.2 + fill 0.65 over a pale floor), so the amber self-lights - and stays out of
    // the renderer's flash loop (the underside flashes on hits instead)
    const glass = (color, emissive, opacity) => {
      const mat = worldMaterial({
        surface: finish,
        color,
        emissive,
        flatShading: true,
        transparent: false,
        opacity,
        depthWrite: false,
      });
      makeTranslucent.push(mat);
      mat.userData.opacity = opacity;
      return mat;
    };
    const vitre = glass(0x5c736d, 0x302914, 0.94), // the hot amber glass of the body (self-lit)
      vitreDark = glass(0x273a38, 0x000000, 0.96); // the sand-flecked glass of the underside (diffuse dark)
    // the head: a tall diamond with a hot core seen through the glass, a visor slit and an open maw (+x)
    const head = addMesh(new OctahedronGeometry(1.1, 0), vitre, 1.9, 2.0, 0);
    head.scale.set(1.2, 1.55, 1.05);
    head.rotation.z = -0.12;
    addMesh(new OctahedronGeometry(0.52, 0), glowMat, 1.75, 2.0, 0).scale.set(1.0, 1.35, 0.95);
    addMesh(armorBox(0.1, 0.14, 0.6), glowMat, 2.9, 2.3, 0);
    for (const side of [1, -1]) {
      const jaw = addMesh(new ConeGeometry(0.26, 1.15, 5), vitreDark, 2.45, 1.4, side * 0.42);
      jaw.rotation.set(side * -0.35, 0, -Math.PI / 2 + 0.25);
      const horn = addMesh(new ConeGeometry(0.15, 0.95, 5), vitreDark, 1.25, 3.05, side * 0.5);
      horn.rotation.set(side * 0.45, 0, 0.95);
      addMesh(new SphereGeometry(0.09, 6, 4), glowMat, 2.55, 2.55, side * 0.55);
    }
    // the body: six tall glass shards in an S-curve behind the head, each with a hot bead inside
    // (tall, so the top-down camera reads their shaded sides, not flat diamonds)
    const tail = [];
    for (let i = 0; i < 6; i++) {
      const x = 0.55 - i * 0.98,
        y = 2.0 + Math.sin(i * 1.05) * 0.4,
        z = Math.sin(i * 0.85) * 0.6,
        r = 0.84 - i * 0.1,
        seg = addMesh(new OctahedronGeometry(r, 0), i % 2 ? vitre : vitreDark, x, y, z);
      seg.scale.set(1.1, 1.5, 0.85);
      seg.rotation.y = Math.sin(i * 0.85) * 0.4;
      addMesh(new SphereGeometry(0.15 + (i < 3 ? 0.05 : 0), 6, 4), glowMat, x + r * 0.2, y, z);
      tail.push({ m: seg, z, i });
    }
    const tailSpike = addMesh(
      new ConeGeometry(0.2, 1.35, 5),
      vitreDark,
      0.55 - 6 * 0.98,
      2.0 + Math.sin(6 * 1.05) * 0.4,
      Math.sin(6 * 0.85) * 0.6,
    );
    tailSpike.rotation.z = Math.PI / 2;
    group.userData.tail = tail;
    group.userData.moving = tail.map((seg) => seg.m);
    // shards of the sheets it broke orbit the head
    const orbit = new Group();
    orbit.position.set(1.9, 2.0, 0);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2,
        shard = addMesh(
          new OctahedronGeometry(i % 2 ? 0.2 : 0.26, 0),
          i % 2 ? vitre : glowMat,
          Math.cos(angle) * 2.2,
          i % 2 ? 0.5 : -0.25,
          Math.sin(angle) * 2.2,
          orbit,
        );
      shard.scale.y = 1.6;
      shard.rotation.z = i % 2 ? 0.3 : -0.25;
    }
    group.add(orbit);
    spin.push({ m: orbit, ax: "y", v: -1.2 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2,
        shard = addMesh(
          basaltShard(0.45, 0.28 + (i % 3) * 0.1, 0.42),
          vitreDark,
          1.4 + Math.cos(a) * 1.25,
          0.04,
          Math.sin(a) * 1.12,
        );
      shard.rotation.y = -a;
    }
    group.userData.fadeMats = [vitre, vitreDark, glowMat];
    makeTranslucent.push(glowMat);
    // (vitre stays out of mats: the flash loop would zero its emissive - the dark underside flashes)
    group.userData.mats = [vitreDark];
  } else {
    // Depth and slow folded currents inside the Core, instead of a flat solid-color ball.
    const energy = glowMat.clone(),
      clock = { value: 0 };
    energy.color = glowMat.color;
    energy.transparent = true;
    energy.depthWrite = false;
    makeTranslucent.push(glowMat);
    energy.onBeforeCompile = (shader) => {
      shader.uniforms.uCoreTime = clock;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vCoreP;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoreP=position;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uCoreTime; varying vec3 vCoreP;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec3 coreN=normalize(vCoreP);
          float coreLight=.18+.82*max(0.0,dot(coreN,normalize(vec3(.6,.8,.4))));
          float fold=sin(coreN.y*9.0+sin(coreN.x*7.0+uCoreTime*.4)*1.5+coreN.z*8.0-uCoreTime*.8);
          float filament=.045/(.045+abs(fold));
          float cloud=.5+.5*sin(coreN.x*11.0+coreN.z*6.0+sin(coreN.y*8.0-uCoreTime*.2));
          diffuseColor.rgb*=.12+coreLight*(.18+cloud*.32)+filament*.55;
          diffuseColor.rgb+=vec3(.08,.035,.12)*filament*coreLight;
        `,
        );
    };
    energy.customProgramCacheKey = () => "rift-core-volume-v1";
    const orb = addMesh(new SphereGeometry(1.15, 28, 20), energy, 0, 2.4, 0);
    spin.push({ m: orb, ax: "y", v: 0.18 });
    group.userData.energyTime = clock;
    group.userData.fadeMats = [energy];
    for (let i = 0; i < 3; i++) {
      let band = addMesh(new TorusGeometry(1.75 + i * 0.35, 0.16, 6, 36), i === 1 ? darkMat : hullMat, 0, 2.4, 0);
      band.rotation.set(i * 1.1, i * 0.6, 0);
      spin.push({ m: band, ax: i === 0 ? "x" : i === 1 ? "y" : "z", v: 0.6 + i * 0.35 });
    }
    // 2.7.0: a crown of crystal spikes that turns around the core, four shards orbiting the other way
    const crown = new Group();
    crown.position.y = 2.4;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2,
        tilt = i % 2 ? 0.5 : 0.15,
        spike = addMesh(new ConeGeometry(0.2, 1.3 + (i % 2) * 0.5, 5), i % 2 ? hullMat : darkMat, 0, 0, 0, crown);
      spike.position.set(
        Math.cos(angle) * 1.05,
        (i % 2 ? 0.35 : -0.1) + Math.sin(angle * 2) * 0.1,
        Math.sin(angle) * 1.05,
      );
      spike.rotation.set(Math.sin(angle) * (Math.PI / 2 - tilt), 0, -Math.cos(angle) * (Math.PI / 2 - tilt));
    }
    group.add(crown);
    spin.push({ m: crown, ax: "y", v: 0.5 });
    const shards = new Group();
    shards.position.y = 2.4;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2,
        shard = addMesh(
          new OctahedronGeometry(0.3, 0),
          glowMat,
          Math.cos(angle) * 2.9,
          Math.sin(i * 2) * 0.5,
          Math.sin(angle) * 2.9,
          shards,
        );
      shard.scale.y = 1.6;
    }
    group.add(shards);
    spin.push({ m: shards, ax: "y", v: -0.9 });
    let base = addMesh(new CylinderGeometry(1.2, 1.8, 0.5, 8), darkMat, 0, 0.25, 0);
    base.rotation.y = 0.3;
    let groundRing = addMesh(new TorusGeometry(2.4, 0.08, 5, 44), glowMat, 0, 0.1, 0);
    groundRing.rotation.x = Math.PI / 2;
  }
  const moving = new Set([...spin.map((part) => part.m), ...(group.userData.moving || [])]);
  mergeStaticMeshes(group, moving);
  for (const mat of makeTranslucent) mat.transparent = true;
  const mats = [...(group.userData.mats || [])];
  if (type !== "tyrant" && type !== "wyrm") mats.unshift(hullMat);
  if (type !== "wyrm") mats.unshift(darkMat);
  return { group, mats, glowMat, spin };
}
// Compact missile casing with a pointed nose and four stabilizer fins; +X is forward.
function rocketProjectileGeometry() {
  return mergeParts([
    pipe(0xc5cec8, 0.075, 0.075, 8, [-0.24, 0, 0], [0.16, 0, 0]),
    spike(0x3a4548, 0.075, 8, [0.16, 0, 0], [0.32, 0, 0]),
    ...both((side) => [
      box(0x586b70, 0.16, 0.025, 0.14, { x: -0.17, z: side * 0.09 }),
      box(0x586b70, 0.16, 0.14, 0.025, { x: -0.17, y: side * 0.09 }),
    ]),
  ]);
}
function wingDroneGeometry() {
  return mergeParts([
    meshPart(new OctahedronGeometry(0.28), 9348036, { y: 0.9, sy: 0.6 }),
    meshPart(armorBox(0.5, 0.06, 0.12), 2898514, { x: 0.2, y: 0.9 }),
  ]);
}
function orbitBladeGeometry() {
  let shape = new Shape();
  shape.moveTo(0.42, 0);
  shape.lineTo(-0.1, 0.16);
  shape.lineTo(-0.22, 0);
  shape.lineTo(-0.1, -0.16);
  shape.closePath();
  let geo = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.62, 0);
  return geo;
}
function shardGeometry() {
  let geo = new OctahedronGeometry(0.2, 0);
  geo.scale(1, 1.5, 1);
  return geo;
}
function healCrossGeometry() {
  return mergeParts([meshPart(armorBox(0.5, 0.16, 0.16), 16777215), meshPart(armorBox(0.16, 0.5, 0.16), 16777215)]);
}

export {
  rocketProjectileGeometry,
  meshPart,
  mergeParts,
  mergeGeometries,
  box,
  ball,
  bar,
  pipe,
  spike,
  debrisGeometry,
  discGeometry,
  enemyGeometry,
  shardGeometry,
  orbitBladeGeometry,
  buildBossModel,
  RL_MESH_TYPES,
  shieldArcGeometry,
  healCrossGeometry,
  buildPlayerModel,
  wingDroneGeometry,
};
