import { Color, MeshBasicMaterial, AdditiveBlending } from "three";

const colorCache = new Map();
export function hexColor(hex) {
  let color = colorCache.get(hex);
  if (!color) {
    color = new Color(hex);
    colorCache.set(hex, color);
  }
  return color;
}

export function additiveMaterial(map, opts = {}) {
  return new MeshBasicMaterial({
    map: map || null,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    ...opts,
  });
}
