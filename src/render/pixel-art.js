// Shared pixel-art shader snippets and crisp nearest-neighbor sprite textures.
import { CanvasTexture, NearestFilter, SRGBColorSpace } from "three";

// 4x4 ordered Bayer dithering matrix normalized to [-0.5, +0.5] in screen pixel space.
export const GLSL_BAYER4 = /* glsl */ `
float pxBayer4(vec2 fragCoord) {
  int x = int(mod(floor(fragCoord.x), 4.0));
  int y = int(mod(floor(fragCoord.y), 4.0));
  int idx = x + y * 4;
  float v = 0.0;
  if (idx == 0) v = 0.0;
  else if (idx == 1) v = 8.0;
  else if (idx == 2) v = 2.0;
  else if (idx == 3) v = 10.0;
  else if (idx == 4) v = 12.0;
  else if (idx == 5) v = 4.0;
  else if (idx == 6) v = 14.0;
  else if (idx == 7) v = 6.0;
  else if (idx == 8) v = 3.0;
  else if (idx == 9) v = 11.0;
  else if (idx == 10) v = 1.0;
  else if (idx == 11) v = 9.0;
  else if (idx == 12) v = 15.0;
  else if (idx == 13) v = 7.0;
  else if (idx == 14) v = 13.0;
  else v = 5.0;
  return (v + 0.5) / 16.0 - 0.5;
}
`;

// Smooth-stepped luminance banding with Bayer dither to create painterly Dead Cells-style shading
// without harsh 8-bit contour aliasing.
export const GLSL_STEPPED_GRADE = /* glsl */ `
vec3 pxStepLight(vec3 light, vec3 shadowTint, float steps, float ditherAmp, vec2 coord) {
  float lum = dot(light, vec3(0.2126, 0.7152, 0.0722));
  if (lum <= 0.0001) return light;
  float dither = pxBayer4(coord) * ditherAmp;
  float scaled = clamp(lum, 0.0, 1.35) * steps + dither;
  float band = floor(scaled);
  float frac = smoothstep(0.36, 0.64, scaled - band);
  float steppedLum = (band + frac) / steps;
  // Blend gently so subtle normal facets & dynamic flashes keep readability while bands clearly form.
  float targetLum = mix(lum, steppedLum, 0.62);
  vec3 graded = light * (targetLum / max(lum, 0.0005));
  float shadowMask = 1.0 - smoothstep(0.02, 0.24, lum);
  return mix(graded, max(graded, shadowTint * 0.42), shadowMask * 0.55);
}
`;

// Khronos Neutral tone mapping (matches Three.js NeutralToneMapping for offscreen HDR composites).
export const GLSL_NEUTRAL_TONEMAP = /* glsl */ `
vec3 pxNeutralToneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return max(color, 0.0);
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return max(mix(color, vec3(newPeak), g), 0.0);
}
`;

export const GLSL_LINEAR_TO_SRGB = /* glsl */ `
vec3 pxLinearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
`;

export function makePixelCanvasTexture(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Stepped radial pixel glow (crisp concentric light halos rather than soft airbrush blur).
export function makePixelGlowTexture(size = 32) {
  return makePixelCanvasTexture(size, (ctx, s) => {
    const half = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 1) continue;
        // 5 discrete radial steps with light dither checkerboard on outer halo
        const raw = 1 - dist;
        const step = Math.floor(raw * 5) / 5;
        const edge = raw < 0.35 && ((x + y) & 1) === 1 ? step * 0.6 : step;
        const alpha = Math.min(1, Math.pow(edge, 1.35) * 1.15);
        if (alpha <= 0.02) continue;
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

// Crisp dithered contact shadow disc so grounded actors sit solidly on pixel-art floors.
export function makePixelShadowTexture(size = 32) {
  return makePixelCanvasTexture(size, (ctx, s) => {
    const half = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 1) continue;
        let alpha = 0;
        if (dist < 0.44) alpha = 0.54;
        else if (dist < 0.72) alpha = 0.28;
        else if (dist < 0.92 && ((x + y) & 1) === 0) alpha = 0.14;
        if (alpha <= 0) continue;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

// Sharp pixel-art 4-point diamond star spark for hits, muzzle flashes, and rain glints.
export function makePixelSparkTexture(size = 24) {
  return makePixelCanvasTexture(size, (ctx, s) => {
    const half = s / 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const ax = Math.abs(x + 0.5 - half) / half;
        const ay = Math.abs(y + 0.5 - half) / half;
        // Hyperbolic star diamond profile snapped cleanly per pixel
        const star = Math.min(ax, ay) * 2.3 + (ax + ay) * 0.55;
        if (star >= 0.95) continue;
        const alpha = star < 0.28 ? 1 : star < 0.55 ? 0.72 : 0.35;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}
