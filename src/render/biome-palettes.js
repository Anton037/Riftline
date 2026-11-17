// Per-biome pixel-art palette, rim lighting, and post-processing grade definitions.
// Keeps atmospheric darkness, shadow hue shifts, and HDR bloom character cohesive per biome.
import { Color } from "three";

export const BIOME_PALETTES = {
  city: {
    shadowTint: 0x090d18,
    midTint: 0x1e2b3e,
    highlightTint: 0xd6e6ff,
    rimColor: 0x6ea8d6,
    rimStrength: 0.28,
    dither: 0.045,
    bloomThreshold: 0.72,
    bloomStrength: 0.42,
    contrast: 1.09,
    saturation: 1.12,
    vignette: 0.34,
  },
  shelf: {
    shadowTint: 0x081326,
    midTint: 0x1d3556,
    highlightTint: 0xdff4ff,
    rimColor: 0x7ce8ff,
    rimStrength: 0.26,
    dither: 0.04,
    bloomThreshold: 0.78,
    bloomStrength: 0.34,
    contrast: 1.12,
    saturation: 1.06,
    vignette: 0.34,
  },
  marsh: {
    shadowTint: 0x061310,
    midTint: 0x16332a,
    highlightTint: 0xbef5d8,
    rimColor: 0x4be8a8,
    rimStrength: 0.3,
    dither: 0.045,
    bloomThreshold: 0.7,
    bloomStrength: 0.44,
    contrast: 1.1,
    saturation: 1.1,
    vignette: 0.36,
  },
  core: {
    shadowTint: 0x0d0919,
    midTint: 0x261d40,
    highlightTint: 0xe6d6ff,
    rimColor: 0xb884ff,
    rimStrength: 0.32,
    dither: 0.042,
    bloomThreshold: 0.7,
    bloomStrength: 0.46,
    contrast: 1.12,
    saturation: 1.14,
    vignette: 0.35,
  },
  caldera: {
    shadowTint: 0x160b0a,
    midTint: 0x381e18,
    highlightTint: 0xffd7b0,
    rimColor: 0xff7a3c,
    rimStrength: 0.3,
    dither: 0.045,
    bloomThreshold: 0.68,
    bloomStrength: 0.5,
    contrast: 1.16,
    saturation: 1.2,
    vignette: 0.38,
  },
  flats: {
    shadowTint: 0x1c140d,
    midTint: 0x473524,
    highlightTint: 0xfff0d0,
    rimColor: 0xffdca8,
    rimStrength: 0.22,
    dither: 0.036,
    bloomThreshold: 0.8,
    bloomStrength: 0.3,
    contrast: 1.06,
    saturation: 1.08,
    vignette: 0.24,
  },
};

export function getBiomePalette(biomeId) {
  return BIOME_PALETTES[biomeId] || BIOME_PALETTES.city;
}

// Shared reactive uniform bag bound into worldMaterial() and updated per biome in Renderer.setBiome().
export const PIXEL_MATERIAL_UNIFORMS = {
  uPxRimColor: { value: new Color(BIOME_PALETTES.city.rimColor) },
  uPxShadowTint: { value: new Color(BIOME_PALETTES.city.shadowTint) },
  uPxRimStrength: { value: BIOME_PALETTES.city.rimStrength },
};

export function applyBiomePaletteUniforms(biomeId) {
  const pal = getBiomePalette(biomeId);
  PIXEL_MATERIAL_UNIFORMS.uPxRimColor.value.setHex(pal.rimColor);
  PIXEL_MATERIAL_UNIFORMS.uPxShadowTint.value.setHex(pal.shadowTint);
  PIXEL_MATERIAL_UNIFORMS.uPxRimStrength.value = pal.rimStrength;
  return pal;
}
