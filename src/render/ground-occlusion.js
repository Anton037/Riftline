// Deterministic feathered R8 ground-contact ambient occlusion texture baked per arena layout.

import { Texture2D } from "../engine/scene.js";
import { clamp } from "../core/util.js";

function obstacleDistance(x, z, obs) {
  if (obs.t === "c") {
    return Math.hypot(x - obs.x, z - obs.y) - obs.r;
  }
  const dx = Math.abs(x - obs.x) - obs.w;
  const dz = Math.abs(z - obs.y) - obs.h;
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

export function createGroundOcclusion(halfW, halfH, obstacles = [], size = 128) {
  const data = new Uint8Array(size * size);
  const feather = 1.65;
  const wallFeather = 1.4;
  for (let row = 0; row < size; row++) {
    const z = ((row + 0.5) / size) * (halfH * 2) - halfH;
    for (let col = 0; col < size; col++) {
      const x = ((col + 0.5) / size) * (halfW * 2) - halfW;
      let occ = 1;
      // Subtle contact darkening along perimeter walls
      const wallD = Math.min(halfW - Math.abs(x), halfH - Math.abs(z));
      if (wallD < wallFeather) {
        const t = clamp(wallD / wallFeather, 0, 1);
        occ = Math.min(occ, 0.58 + 0.42 * (t * t * (3 - 2 * t)));
      }
      // Feathered ambient occlusion around every cover obstacle
      for (let i = 0; i < obstacles.length; i++) {
        const d = obstacleDistance(x, z, obstacles[i]);
        if (d < feather) {
          const t = clamp((d + 0.35) / (feather + 0.35), 0, 1);
          const smooth = t * t * (3 - 2 * t);
          occ = Math.min(occ, 0.32 + 0.68 * smooth);
        }
      }
      data[row * size + col] = Math.round(clamp(occ, 0, 1) * 255);
    }
  }
  return new Texture2D({
    width: size,
    height: size,
    data,
    format: "r8",
    wrap: "clamp",
    filter: "linear",
  });
}
