import { strataGeometry } from "./strata-geometry.js";
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
  add("rock", strataGeometry(length, 0.95, depth, length * 11 + depth * 7), 0, 0.01, 0);
  add("darkRock", strataGeometry(length * 0.88, 0.1, depth * 0.85, length + depth), 0, 0.88, 0);
  add("emberMat", armorBox(length * 0.54, 0.018, 0.03), 0, 0.78, depth * 0.35);
  for (const f of [-0.24, 0.24]) add("emberMat", armorBox(0.025, 0.018, depth * 0.35), length * f, 0.985, 0);
  return parts;
}
