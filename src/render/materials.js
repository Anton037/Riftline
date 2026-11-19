// Material helpers and shared surface definitions for Riftline's custom WebGL2 engine.

import { Color } from "../engine/math.js";
import { Material } from "../engine/scene.js";
import { actorMaterial } from "../data/materials.js";

const cache = new Map();

export function hexColor(hex) {
  let c = cache.get(hex);
  if (!c) {
    c = new Color(hex);
    cache.set(hex, c);
  }
  return c;
}

export function worldMaterial({
  color = 0xffffff,
  surface = "stone",
  emissive = 0x000000,
  emissiveIntensity = 1,
  opacity = 1,
  transparent = false,
  depthWrite,
  doubleSide = false,
  vertexColors = false,
  biomeSkin = false,
  reedWind = false,
  rimStrength = null,
  fog = true,
  batchKey = null,
} = {}) {
  return new Material({
    shader: "stylized",
    color,
    surface,
    emissive,
    emissiveIntensity,
    opacity,
    transparent,
    depthWrite: depthWrite ?? !transparent,
    doubleSide,
    vertexColors,
    biomeSkin,
    reedWind,
    rimStrength,
    fog,
    batchKey,
    userData: { paintedSurface: surface },
  });
}

export function emissiveMaterial({
  color = 0xffffff,
  emissiveIntensity = 1.25,
  opacity = 1,
  transparent = false,
  additive = false,
  depthWrite,
  doubleSide = false,
  vertexColors = false,
  spriteTile = -1,
  fog = true,
} = {}) {
  return new Material({
    shader: "emissive",
    color,
    emissiveIntensity,
    opacity,
    transparent: transparent || additive,
    additive,
    depthWrite: depthWrite ?? !(transparent || additive),
    doubleSide,
    vertexColors,
    spriteTile,
    fog,
  });
}

export function additiveMaterial(spriteTile = -1, opacity = 1, intensity = 1.35) {
  return emissiveMaterial({
    color: 0xffffff,
    emissiveIntensity: intensity,
    opacity,
    transparent: true,
    additive: true,
    depthWrite: false,
    doubleSide: true,
    spriteTile: typeof spriteTile === "number" ? spriteTile : -1,
    fog: false,
  });
}

export function aegisMaterial() {
  return new Material({
    shader: "aegis",
    transparent: true,
    additive: false,
    depthWrite: false,
    doubleSide: true,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uHit: { value: 0 },
      uFade: { value: 0 },
      uColor: { value: new Color(0x62f2e8) },
    },
  });
}

export function enemySurface(type) {
  const surface = actorMaterial(type);
  return surface === "energy" ? "crystal" : surface;
}

export function setWorldShadows(root) {
  root.traverse((obj) => {
    const mat = obj.material;
    if (obj.isMesh && mat && mat.shader === "stylized" && (!mat.transparent || mat.opacity >= 0.5)) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}
