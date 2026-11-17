// Per-biome pixel-art palette, rim lighting, and post-processing grade definitions.
// Keeps atmospheric darkness, shadow hue shifts, and HDR bloom character cohesive per biome.
import { Color } from "three";

export const BIOME_PALETTES = {
  // Phase 4D: Dead Cells grade - every biome gets a stronger, more saturated rim (the backlit
  // silhouette read), deeper shadow tints, and a slightly hotter bloom threshold so emissive
  // accents stay the brightest thing in frame.
  city: {
    shadowTint: 0x080b16,
    midTint: 0x1a2638,
    highlightTint: 0xd6e6ff,
    rimColor: 0x7fc4ff,
    rimStrength: 0.34,
    dither: 0.045,
    bloomThreshold: 0.7,
    bloomStrength: 0.46,
    contrast: 1.12,
    saturation: 1.16,
    vignette: 0.36,
  },
  shelf: {
    shadowTint: 0x071024,
    midTint: 0x1a304e,
    highlightTint: 0xdff4ff,
    rimColor: 0x8ceeff,
    rimStrength: 0.32,
    dither: 0.04,
    bloomThreshold: 0.76,
    bloomStrength: 0.38,
    contrast: 1.14,
    saturation: 1.1,
    vignette: 0.36,
  },
  marsh: {
    shadowTint: 0x050f0d,
    midTint: 0x132c24,
    highlightTint: 0xbef5d8,
    rimColor: 0x5cffb4,
    rimStrength: 0.36,
    dither: 0.045,
    bloomThreshold: 0.68,
    bloomStrength: 0.48,
    contrast: 1.12,
    saturation: 1.14,
    vignette: 0.38,
  },
  core: {
    shadowTint: 0x0c0817,
    midTint: 0x221a3a,
    highlightTint: 0xe6d6ff,
    rimColor: 0xc98bff,
    rimStrength: 0.38,
    dither: 0.042,
    bloomThreshold: 0.68,
    bloomStrength: 0.5,
    contrast: 1.14,
    saturation: 1.18,
    vignette: 0.37,
  },
  caldera: {
    shadowTint: 0x140a09,
    midTint: 0x331b15,
    highlightTint: 0xffd7b0,
    rimColor: 0xff8a48,
    rimStrength: 0.36,
    dither: 0.045,
    bloomThreshold: 0.66,
    bloomStrength: 0.54,
    contrast: 1.18,
    saturation: 1.24,
    vignette: 0.4,
  },
  flats: {
    shadowTint: 0x1a120b,
    midTint: 0x42301f,
    highlightTint: 0xfff0d0,
    rimColor: 0xffdca8,
    rimStrength: 0.28,
    dither: 0.036,
    bloomThreshold: 0.78,
    bloomStrength: 0.32,
    contrast: 1.08,
    saturation: 1.12,
    vignette: 0.26,
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
