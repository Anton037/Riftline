// Deterministic feathered R8 ground-contact ambient occlusion texture baked per arena layout.

import { Texture2D } from "../engine/scene.js";
import { clamp } from "../core/util.js";

let _occScratch = null;

function obstacleDistance(x, z, obs) {
  if (obs.t === "c") {
    const dx = x - obs.x,
      dz = z - obs.y;
    return Math.sqrt(dx * dx + dz * dz) - obs.r;
  }
  const dx = Math.abs(x - obs.x) - obs.w;
  const dz = Math.abs(z - obs.y) - obs.h;
  const ox = dx > 0 ? dx : 0;
  const oz = dz > 0 ? dz : 0;
  const inside = dx > dz ? dx : dz;
  return Math.sqrt(ox * ox + oz * oz) + (inside < 0 ? inside : 0);
}

export function createGroundOcclusion(halfW, halfH, obstacles = [], props = [], size = 128) {
  const len = size * size;
  if (!_occScratch || _occScratch.length !== len) _occScratch = new Float32Array(len);
  const occBuf = _occScratch;
  occBuf.fill(1);
  const feather = 1.65;
  const wallFeather = 1.4;
  const spanW = halfW * 2;
  const spanH = halfH * 2;

  for (let row = 0; row < size; row++) {
    const z = ((row + 0.5) / size) * spanH - halfH;
    const dzWall = halfH - Math.abs(z);
    for (let col = 0; col < size; col++) {
      const x = ((col + 0.5) / size) * spanW - halfW;
      const wallD = Math.min(halfW - Math.abs(x), dzWall);
      if (wallD < wallFeather) {
        const t = clamp(wallD / wallFeather, 0, 1);
        occBuf[row * size + col] = 0.58 + 0.42 * (t * t * (3 - 2 * t));
      }
    }
  }

  // Stamp feathered contact AO strictly within each obstacle's local pixel AABB
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const rx = (obs.t === "c" ? obs.r : obs.w) + feather;
    const rz = (obs.t === "c" ? obs.r : obs.h) + feather;
    const cMin = Math.max(0, Math.floor(((obs.x - rx + halfW) / spanW) * size));
    const cMax = Math.min(size - 1, Math.ceil(((obs.x + rx + halfW) / spanW) * size));
    const rMin = Math.max(0, Math.floor(((obs.y - rz + halfH) / spanH) * size));
    const rMax = Math.min(size - 1, Math.ceil(((obs.y + rz + halfH) / spanH) * size));
    for (let row = rMin; row <= rMax; row++) {
      const z = ((row + 0.5) / size) * spanH - halfH;
      const rowOff = row * size;
      for (let col = cMin; col <= cMax; col++) {
        const x = ((col + 0.5) / size) * spanW - halfW;
        const d = obstacleDistance(x, z, obs);
        if (d < feather) {
          const t = clamp((d + 0.35) / (feather + 0.35), 0, 1);
          const smooth = t * t * (3 - 2 * t);
          const v = 0.32 + 0.68 * smooth;
          if (v < occBuf[rowOff + col]) occBuf[rowOff + col] = v;
        }
      }
    }
  }

  // Stamp subtle feathered contact AO beneath interactive biome relics
  const propFeather = 1.05;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const pr = Math.max(0.42, (prop.r || 0.72) * 0.72);
    const spanR = pr + propFeather;
    const cMin = Math.max(0, Math.floor(((prop.x - spanR + halfW) / spanW) * size));
    const cMax = Math.min(size - 1, Math.ceil(((prop.x + spanR + halfW) / spanW) * size));
    const rMin = Math.max(0, Math.floor(((prop.y - spanR + halfH) / spanH) * size));
    const rMax = Math.min(size - 1, Math.ceil(((prop.y + spanR + halfH) / spanH) * size));
    for (let row = rMin; row <= rMax; row++) {
      const z = ((row + 0.5) / size) * spanH - halfH;
      const rowOff = row * size;
      for (let col = cMin; col <= cMax; col++) {
        const x = ((col + 0.5) / size) * spanW - halfW;
        const d = Math.hypot(x - prop.x, z - prop.y) - pr;
        if (d < propFeather) {
          const t = clamp((d + 0.28) / (propFeather + 0.28), 0, 1);
          const smooth = t * t * (3 - 2 * t);
          const v = 0.44 + 0.56 * smooth;
          if (v < occBuf[rowOff + col]) occBuf[rowOff + col] = v;
        }
      }
    }
  }

  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(clamp(occBuf[i], 0, 1) * 255);
  return new Texture2D({
    width: size,
    height: size,
    data,
    format: "r8",
    wrap: "clamp",
    filter: "linear",
  });
}
