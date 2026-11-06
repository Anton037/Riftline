import { CylinderGeometry } from "three";
import { armorBox } from "./armor-geometry.js";

// Author the whole ridge along local X, then rotate every detail with its collision footprint.
// World-space width/depth arithmetic used to shorten the spine and bunch vents on vertical ridges.
export function calderaRidgeParts(obstacle) {
  const horizontal = obstacle.w >= obstacle.h;
  const length = Math.max(obstacle.w, obstacle.h) * 2;
  const depth = Math.min(obstacle.w, obstacle.h) * 2;
  const parts = [];
  const add = (role, geometry, x, y, z) => {
    geometry.translate(x, y, z);
    if (!horizontal) geometry.rotateY(Math.PI / 2);
    geometry.translate(obstacle.x, 0, obstacle.y);
    parts.push({ role, geometry });
  };
  add("rock", armorBox(length, 0.95, depth), 0, 0.48, 0);
  add("darkRock", armorBox(length + 0.06, 0.1, depth + 0.06), 0, 1.0, 0);
  add("emberMat", armorBox(length * 0.88, 0.05, 0.07), 0, 1.055, 0);
  for (const f of [-0.24, 0.24]) add("emberMat", armorBox(0.06, 0.045, depth * 0.72), length * f, 1.055, 0);
  for (let k = 0; k < 3; k++) {
    add(k === 1 ? "hotMat" : "accentMat", new CylinderGeometry(0.09, 0.12, 0.18, 6), (k - 1) * length * 0.26, 1.14, 0);
  }
  return parts;
}
