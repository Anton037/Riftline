import { Box3 } from "three";

// Shared with the geometry audit so GPU reed bending is included in spatial checks.
export const REED_WIND = 0.06;

// Place a complete transformed prop beyond one arena edge. Checking its anchor alone misses
// wide bases, leaning pieces and branches; keep body and glow together when moving it.
export function keepExteriorPartsOutside(parts, W, H, x, z, clearance = 0.35) {
  const box = new Box3();
  for (const layer of [parts.body, parts.glow])
    for (const geometry of layer) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      box.union(geometry.boundingBox);
    }
  if (
    box.isEmpty() ||
    box.min.x >= W + clearance ||
    box.max.x <= -W - clearance ||
    box.min.z >= H + clearance ||
    box.max.z <= -H - clearance
  )
    return;
  const moves = [];
  if (x > W) moves.push([W + clearance - box.min.x, 0]);
  if (x < -W) moves.push([-W - clearance - box.max.x, 0]);
  if (z > H) moves.push([0, H + clearance - box.min.z]);
  if (z < -H) moves.push([0, -H - clearance - box.max.z]);
  if (!moves.length) throw new Error("Exterior prop must have an exterior anchor");
  moves.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const [dx, dz] = moves[0];
  for (const layer of [parts.body, parts.glow]) for (const geometry of layer) geometry.translate(dx, 0, dz);
}
