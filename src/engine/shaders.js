// GLSL 300 es shader library for Riftline's custom WebGL2 stylized painterly / cel-shaded engine.
// Fixed vertex attribute locations across all programs:
//   0: aPos (vec3), 1: aNorm (vec3), 2: aUv (vec2), 3: aCol (vec3)
//   4..7: aInstMat (mat4), 8: aInstCol (vec3), 9: aInstFlash (float)

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

const COMMON_UNIFORMS = `
uniform mat4 uViewProj;
uniform mat4 uLightSpace;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform float uHemiIntensity;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform float uFillIntensity;
uniform vec3 uShadowTint;
uniform vec3 uRimColor;
uniform float uDarkness;
uniform int uBiomeIndex;
uniform vec4 uPointPos[8];
uniform vec4 uPointCol[8];
`;

const FOG_FN = `
vec3 applyFog(vec3 col, vec3 worldPos) {
  float d = length(worldPos - uCamPos);
  float f = clamp((d - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);
  // Smooth ease so arena stays crisp while exterior vistas blend into atmospheric haze
  f = f * f * (3.0 - 2.0 * f);
  return mix(col, uFogColor, f);
}
`;

const SHADOW_FN = `
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowsEnabled;
float sampleShadow(vec3 worldPos, vec3 worldNormal) {
  if (uShadowsEnabled < 0.5) return 1.0;
  vec3 biased = worldPos + worldNormal * 0.065 + uSunDir * 0.035;
  vec4 lp = uLightSpace * vec4(biased, 1.0);
  vec3 proj = lp.xyz / max(lp.w, 0.0001) * 0.5 + 0.5;
  if (proj.x < 0.01 || proj.x > 0.99 || proj.y < 0.01 || proj.y > 0.99 || proj.z > 0.995) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float bias = max(0.0012 * (1.0 - dot(worldNormal, uSunDir)), 0.00045);
  float zRef = proj.z - bias;
  // Rotated 9-tap hardware-PCF Poisson disk for velvety storybook diorama penumbras
  float ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float s = sin(ang);
  float c = cos(ang);
  mat2 rot = mat2(c, -s, s, c);
  vec2 spread = texel * 2.15;
  float sum = texture(uShadowMap, vec3(proj.xy, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2( 0.92,  0.18)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2(-0.88, -0.24)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2( 0.24, -0.90)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2(-0.22,  0.88)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2( 0.58,  0.56)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2(-0.56,  0.54)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2( 0.54, -0.58)) * spread, zRef));
  sum += texture(uShadowMap, vec3(proj.xy + (rot * vec2(-0.54, -0.54)) * spread, zRef));
  return sum * (1.0 / 9.0);
}
`;

const POINT_LIGHT_FN = `
vec3 evalPointLights(vec3 worldPos, vec3 N, vec3 albedo) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float intensity = uPointCol[i].w;
    if (intensity <= 0.001) continue;
    vec3 delta = uPointPos[i].xyz - worldPos;
    float dist = length(delta);
    float rad = max(uPointPos[i].w, 0.5);
    float att = clamp(1.0 - dist / rad, 0.0, 1.0);
    att = att * att;
    vec3 L = delta / max(dist, 0.001);
    float ndl = max(dot(N, L), 0.18);
    sum += albedo * uPointCol[i].rgb * intensity * att * ndl;
  }
  return sum;
}
`;

// 1. Directional Shadow Depth Shader
export function shadowProgram(instanced) {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
${instanced ? "layout(location=4) in mat4 aInstMat;" : ""}
uniform mat4 uLightSpace;
uniform mat4 uModel;
void main() {
  mat4 M = ${instanced ? "uModel * aInstMat" : "uModel"};
  gl_Position = uLightSpace * M * vec4(aPos, 1.0);
}`;
  const fs = `${HEADER}
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}`;
  return { vs, fs };
}

// 2. Stylized Painterly Cel Surface Shader (Actors, Bosses, Cover, Architecture, Props)
export function stylizedProgram(instanced) {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aCol;
${
  instanced
    ? `
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
layout(location=9) in float aInstFlash;`
    : ""
}
${COMMON_UNIFORMS}
uniform mat4 uModel;
uniform float uUseVertexColors;
uniform float uReedWind;
out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec3 vLocalPos;
out vec3 vLocalNorm;
out vec3 vColor;
out float vFlash;

void main() {
  vec3 pos = aPos;
  if (uReedWind > 0.5) {
    float bend = smoothstep(0.05, 1.4, pos.y);
    float ph = pos.x * 0.7 + pos.z * 0.5 + uTime * 2.1;
    pos.x += sin(ph) * 0.12 * bend;
    pos.z += cos(ph * 0.8) * 0.09 * bend;
  }
  mat4 M = ${instanced ? "uModel * aInstMat" : "uModel"};
  vec4 wp = M * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(M) * aNorm);
  vLocalPos = aPos;
  vLocalNorm = aNorm;
  vec3 vc = mix(vec3(1.0), aCol, uUseVertexColors);
  vec3 rawCol = ${instanced ? "vc * aInstCol" : "vc"};
  vColor = pow(max(rawCol, vec3(0.0)), vec3(2.2));
  vFlash = ${instanced ? "aInstFlash" : "0.0"};
  gl_Position = uViewProj * wp;
}`;

  const fs = `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
${SHADOW_FN}
${POINT_LIGHT_FN}
uniform sampler2D uSurfaceAtlas;
uniform float uSurfaceReady;
uniform vec2 uSurfaceTile;
uniform vec3 uBaseColor;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;
uniform float uOpacity;
uniform float uRimStrength;
uniform float uSpecPower;
uniform float uInkStrength;
uniform float uBiomeSkin;
uniform float uFogEnabled;
uniform float uDustFade;

in vec3 vWorldPos;
in vec3 vWorldNorm;
in vec3 vLocalPos;
in vec3 vLocalNorm;
in vec3 vColor;
in float vFlash;
out vec4 fragColor;

vec3 sampleSurface(vec2 uv) {
  vec2 scale = vec2(0.988) / vec2(3.0, 2.0);
  vec2 tileUv = (uSurfaceTile + mix(vec2(0.006), vec2(0.994), fract(uv))) / vec2(3.0, 2.0);
  return textureGrad(uSurfaceAtlas, tileUv, dFdx(uv) * scale, dFdy(uv) * scale).rgb;
}

void main() {
  vec3 N = normalize(vWorldNorm);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorldPos);

  // Triplanar painterly brushwork detail (surface atlas stores linear data: R=brush, G=roughness, B=glint)
  vec3 ln = normalize(vLocalNorm);
  vec3 w = pow(abs(ln), vec3(4.0));
  w /= max(w.x + w.y + w.z, 0.001);
  vec3 tp = vLocalPos * 0.55;
  vec3 surf = vec3(0.55, 0.5, 0.25);
  if (uSurfaceReady > 0.5) {
    surf = sampleSurface(tp.zy) * w.x + sampleSurface(tp.xz) * w.y + sampleSurface(tp.xy) * w.z;
  }
  float brush = surf.r;
  float rough = surf.g;
  float glint = surf.b;

  // Painterly pigment modulation in linear space (energy-neutral around 1.0)
  vec3 albedo = uBaseColor * vColor;
  albedo *= 0.85 + brush * 0.30;
  // Subtle painted highlight stroke lift on bevels & ridges
  albedo += albedo * smoothstep(0.68, 0.94, glint) * 0.11;

  // Gentle biome bounce harmony (~8-10% max) so actors stay vividly distinct from every floor
  if (uBiomeSkin > 0.5) {
    vec3 biomeTint = 0.90 + uHemiSky * 0.12 + uRimColor * 0.08;
    albedo = mix(albedo, albedo * biomeTint, 0.09);
    float footMask = smoothstep(0.40, 0.02, vLocalPos.y) * (0.65 + 0.35 * brush);
    vec3 weatherCol = mix(uHemiGround, uHemiSky, 0.45) * 0.80 + uRimColor * 0.06;
    albedo = mix(albedo, mix(albedo, weatherCol, 0.24), footMask * 0.16);
  }

  // Creamy 3-stop storybook gouache cel-gradient wrap (warm sunlit key, rich cool/plum shadow bounce)
  float shadow = sampleShadow(vWorldPos, N);
  float rawNdl = dot(N, uSunDir);
  float celWarm = smoothstep(-0.18, 0.20, rawNdl) * mix(0.28, 1.0, shadow);
  float celSun = smoothstep(0.38, 0.72, rawNdl) * shadow;
  float cel = celWarm * 0.62 + celSun * 0.38;

  // Rich hue-shifted cool/plum/indigo shadow bounce + grounded underside shading
  float groundShade = mix(0.84, 1.03, smoothstep(-0.35, 0.65, N.y));
  vec3 shadowCol = mix(uShadowTint, uHemiGround, 0.34) * 0.84;
  vec3 keyLight = mix(shadowCol, uSunColor * uSunIntensity * 0.88, cel);

  // Hemisphere sky/ground bounce + angled stylized fill light
  float hemiK = N.y * 0.5 + 0.5;
  vec3 hemi = mix(uHemiGround * 0.44, uHemiSky * 0.76, hemiK) * uHemiIntensity * 0.40;
  float fillNdl = smoothstep(-0.10, 0.58, dot(N, uFillDir));
  vec3 fill = uFillColor * uFillIntensity * fillNdl * 0.26;

  // Material-aware cel specular + subtle top-down porcelain/brass/crystal sky sheen
  vec3 H = normalize(uSunDir + V);
  float ndh = max(dot(N, H), 0.0);
  float gloss = clamp(1.0 - rough, 0.0, 1.0);
  float gloss2 = gloss * gloss;
  float specExp = max(uSpecPower * (0.65 + gloss * 0.95), 14.0);
  float specRaw = pow(ndh, specExp);
  float specStep = smoothstep(0.32, 0.58, specRaw) * gloss2 * 0.50 * shadow;
  float skySheen = pow(max(N.y, 0.0), 2.4) * gloss2 * 0.14;
  vec3 spec = uSunColor * specStep * (0.64 + glint * 0.36) + uHemiSky * skySheen;

  // Tight top-edge rim highlight + delicate dark-ink grazing contour for effortless miniature separation
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.7);
  float rimMask = smoothstep(0.34, 0.74, fresnel) * smoothstep(0.06, 0.68, N.y);
  vec3 rim = uRimColor * rimMask * uRimStrength * 0.54 * (0.64 + 0.36 * (1.0 - uDarkness * 0.5));

  vec3 lit = albedo * (keyLight + hemi + fill) * groundShade + spec + rim;
  lit += evalPointLights(vWorldPos, N, albedo);

  float inkMask = smoothstep(0.36, 0.07, ndv) * (1.0 - smoothstep(0.48, 0.85, max(N.y, 0.0)));
  float inkAmt = inkMask * uInkStrength * (1.0 - uDustFade) * 0.54;
  vec3 inkCol = mix(vec3(0.015, 0.011, 0.024), uShadowTint * 0.22, 0.44);
  lit = mix(lit, inkCol, clamp(inkAmt, 0.0, 0.62));

  lit += uEmissive * uEmissiveIntensity;

  // Punchy hit-flash (crisp warm-cream stylized pop preserving 3D form without blinding whiteout)
  if (vFlash > 0.001) {
    float fl = clamp(vFlash, 0.0, 1.0);
    float formShade = 0.68 + 0.32 * clamp(rawNdl * 0.5 + 0.5, 0.0, 1.0);
    lit = mix(lit, vec3(1.24, 1.06, 0.82) * formShade, fl * 0.64);
  }

  float alpha = uOpacity;
  if (uDustFade > 0.5) {
    alpha *= smoothstep(0.0, 0.35, vLocalPos.y) * (1.0 - smoothstep(2.05, 2.75, vLocalPos.y));
  }
  if (uFogEnabled > 0.5) lit = applyFog(lit, vWorldPos);
  fragColor = vec4(lit, alpha);
}`;
  return { vs, fs };
}

// 3. Dedicated Stylized Painterly Arena Floor Shader (all 6 biomes)
export function floorProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vWorldNorm;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(uModel) * aNorm);
  gl_Position = uViewProj * wp;
}`;

  const fs = `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
${SHADOW_FN}
${POINT_LIGHT_FN}
uniform sampler2D uTerrainAtlas;
uniform float uTerrainReady;
uniform sampler2D uOcclusion;
uniform vec2 uHalf;
uniform vec3 uFloorBase;
uniform vec3 uFloorTrim;
uniform vec3 uFloorAccent;
uniform float uPulse;
uniform float uStyle;

in vec3 vWorldPos;
in vec3 vWorldNorm;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float fbm(vec2 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.13 + 7.1) * 0.30 + vnoise(p * 4.41 - 3.7) * 0.15;
}
float crackNet(vec2 p, float warp) {
  vec2 q = p + vec2(fbm(p * 0.8 + vec2(1.3, -2.1)), fbm(p * 0.8 + vec2(-3.7, 2.9))) * warp;
  vec2 i = floor(q), f = fract(q);
  float d1 = 8.0, d2 = 8.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash21(i + g), hash21(i + g + vec2(17.3, 31.7)));
      vec2 r = g + (0.16 + 0.68 * o) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return sqrt(d2) - sqrt(d1);
}

vec3 sampleTerrainTile(vec2 uv, int tileIdx) {
  float col = float(tileIdx % 3);
  float row = float(tileIdx / 3);
  vec2 scale = vec2(0.990) / vec2(3.0, 2.0);
  vec2 cell = (vec2(col, row) + mix(vec2(0.005), vec2(0.995), fract(uv))) / vec2(3.0, 2.0);
  return pow(max(textureGrad(uTerrainAtlas, cell, dFdx(uv) * scale, dFdy(uv) * scale).rgb, vec3(0.0)), vec3(2.2));
}

void main() {
  vec2 p = vWorldPos.xz;
  vec2 edgeDist = uHalf - abs(p);
  float edgeMin = min(edgeDist.x, edgeDist.y);
  float inside = smoothstep(-0.12, 0.14, edgeMin);
  float outMask = 1.0 - inside;
  float outDist = max(0.0, -edgeMin);
  vec2 rel = abs(p) / max(uHalf, vec2(1.0));
  float rNorm = max(rel.x, rel.y);
  // Calm walkable combat interior (r < 0.82) vs rich perimeter borders (edgeMin < 2.8)
  float centerCalm = (1.0 - smoothstep(0.58, 0.84, rNorm)) * inside;
  float borderRich = (1.0 - smoothstep(0.45, 2.8, edgeMin)) * inside;
  float detailAmt = mix(1.0, 0.54, centerCalm);
  float emissiveCalm = mix(1.0, 0.48, centerCalm);
  vec2 occUv = (p + uHalf) / max(uHalf * 2.0, vec2(1.0));
  float occ = (inside > 0.05) ? texture(uOcclusion, clamp(occUv, 0.0, 1.0)).r : 0.86;

  int style = int(uStyle + 0.5);
  // Map biome style to terrain atlas tile (0=city, 1=shelf, 2=marsh, 3=core, 4=caldera, 5=flats)
  int tile = (style == 5) ? 0 : (style == 2) ? 1 : (style == 3) ? 2 : (style == 4) ? 3 : (style == 6) ? 4 : 5;

  vec3 brush = uFloorBase;
  if (uTerrainReady > 0.5) {
    vec3 t1 = sampleTerrainTile(p * 0.095, tile);
    vec3 t2 = sampleTerrainTile(p * 0.038 + vec2(0.37, 0.61), tile);
    brush = mix(t1, t2, mix(0.42, 0.62, centerCalm));
  }
  vec3 albedo = mix(uFloorBase, brush, mix(0.76, 0.56, centerCalm));
  vec3 emissive = vec3(0.0);
  vec3 extEmissive = vec3(0.0);
  float specBoost = 0.05;
  float extScale = 0.82;

  // Subtle architectural tile seams so movement speed reads clearly without visual clutter
  vec2 cell = abs(fract(p * 0.25 + 0.5) - 0.5);
  float gridLine = 1.0 - smoothstep(0.009, 0.022, min(cell.x, cell.y));
  float n1 = fbm(p * 0.16);
  float n2 = fbm(p * 0.42 + vec2(3.2, -1.9));

  if (style == 5) {
    // BLACKOUT CITY: calm rain-dappled courtyard flagstones inside; canal moat & cobbled lantern quays outside
    float puddle = smoothstep(0.56, 0.70, n1 + (n2 - 0.5) * 0.20) * mix(1.0, 0.56, centerCalm);
    float stoneVar = hash21(floor(p * 0.25 + 0.5));
    albedo *= 0.92 + stoneVar * 0.13 * detailAmt;
    float mortar = gridLine * inside;
    albedo = mix(albedo, albedo * 0.64, mortar * 0.44);
    float brassDot = (1.0 - smoothstep(0.012, 0.034, max(cell.x, cell.y))) * inside;
    albedo = mix(albedo, uFloorTrim * 0.34, brassDot * 0.28);
    float sheen = 0.5 + 0.5 * sin(p.x * 0.9 - p.y * 0.7 + n2 * 4.5 + uTime * 1.4);
    vec3 reflectCol = albedo * 0.48 + vec3(0.012, 0.028, 0.048) + uHemiSky * (0.010 + sheen * 0.016);
    albedo = mix(albedo, reflectCol, puddle * 0.66 * inside);
    specBoost = mix(0.07, 0.48, puddle * inside);

    if (outMask > 0.001) {
      float canal = smoothstep(1.15, 1.65, outDist) * (1.0 - smoothstep(6.7, 7.25, outDist));
      float quayCurb = exp(-pow((outDist - 1.35) * 3.8, 2.0)) + exp(-pow((outDist - 7.05) * 3.8, 2.0));
      vec2 wc = floor(p * 1.65);
      float wSeed = hash21(wc);
      float dropR = length(fract(p * 1.65) - 0.5);
      float dropLife = fract(uTime * 0.55 + wSeed * 7.3);
      float rainRing = step(0.62, wSeed) * exp(-pow((dropR - dropLife * 0.44) * 28.0, 2.0)) * (1.0 - dropLife) * (1.0 - dropR * 2.0);
      float wave = sin(p.x * 1.6 + p.y * 1.1 - uTime * 1.6 + n2 * 3.2) * 0.5 + 0.5;
      vec3 waterCol = mix(vec3(0.012, 0.036, 0.060), vec3(0.024, 0.072, 0.105), wave * 0.55 + n1 * 0.45);
      vec2 cobbleCell = abs(fract(p * 0.55) - 0.5);
      float cobbleSeam = 1.0 - smoothstep(0.02, 0.06, min(cobbleCell.x, cobbleCell.y));
      vec3 quayCol = mix(vec3(0.042, 0.065, 0.092), vec3(0.072, 0.102, 0.136), hash21(floor(p * 0.55)));
      quayCol *= 1.0 - cobbleSeam * 0.32;
      vec3 extCol = mix(quayCol, waterCol, canal);
      extCol = mix(extCol, vec3(0.095, 0.128, 0.162), clamp(quayCurb, 0.0, 1.0) * 0.78);
      albedo = mix(albedo, extCol, outMask);
      float bankGlow = smoothstep(4.2, 6.8, outDist) * canal;
      float amberRefl = (0.35 + 0.65 * smoothstep(0.35, 0.85, sin(p.x * 1.45 + sin(p.y * 2.8 - uTime * 2.0) * 0.55) * 0.5 + 0.5)) * bankGlow;
      extEmissive += (uFloorTrim * 0.14 * amberRefl + uFloorAccent * 0.11 * max(rainRing, 0.0) * canal) * outMask;
      specBoost = mix(specBoost, mix(0.18, 0.62, canal), outMask);
      extScale = 0.92;
    }
  } else if (style == 2) {
    // AURORA SHELF: calm snowfield inside; glowing sapphire glacier fjord & powder-snow benchlands outside
    float icePatch = smoothstep(0.52, 0.68, n1) * mix(1.0, 0.54, centerCalm);
    float drift = smoothstep(0.34, 0.76, fbm(p * 0.19 + vec2(0.4, -0.2)));
    albedo = mix(albedo * 0.94, vec3(0.22, 0.34, 0.46), drift * 0.24 * detailAmt);
    albedo = mix(albedo, vec3(0.07, 0.20, 0.33), icePatch * 0.52 * inside);
    float iceEdge = crackNet(p * 0.34, 0.42);
    float crack = (1.0 - smoothstep(0.016, 0.056, iceEdge)) * icePatch;
    albedo += vec3(0.08, 0.18, 0.26) * crack * 0.42 * inside;
    albedo = mix(albedo, vec3(0.14, 0.25, 0.38), gridLine * 0.12 * inside);
    float shimmer = smoothstep(0.72, 0.96, sin(p.x * 0.55 - p.y * 0.42 + uTime * 1.2 + n2 * 4.5));
    emissive += uFloorAccent * shimmer * icePatch * 0.09 * inside;
    specBoost = mix(0.06, 0.38, icePatch * inside);

    if (outMask > 0.001) {
      float fjord = smoothstep(1.35, 2.1, outDist) * (1.0 - smoothstep(6.4, 7.6, outDist + (n1 - 0.5) * 1.8));
      float fjordCrack = 1.0 - smoothstep(0.014, 0.065, crackNet(p * 0.28, 0.48));
      vec3 fjordCol = mix(vec3(0.042, 0.155, 0.29), vec3(0.10, 0.30, 0.48), n2 * 0.65 + fjordCrack * 0.45);
      vec3 snowBench = mix(vec3(0.18, 0.30, 0.44), vec3(0.30, 0.45, 0.60), smoothstep(0.28, 0.76, drift));
      float snowBank = exp(-pow((outDist - 1.55) * 2.2, 2.0)) + exp(-pow((outDist - 7.3) * 1.8, 2.0));
      vec3 extCol = mix(snowBench, fjordCol, fjord);
      extCol = mix(extCol, vec3(0.34, 0.50, 0.64), clamp(snowBank, 0.0, 1.0) * 0.55);
      albedo = mix(albedo, extCol, outMask);
      extEmissive += mix(uFloorTrim, uFloorAccent, n1) * (fjordCrack * 0.26 + 0.06) * fjord * outMask;
      specBoost = mix(specBoost, mix(0.14, 0.58, fjord), outMask);
      extScale = 0.90;
    }
  } else if (style == 3) {
    // GLOWMARSH: calm moss turf inside; bioluminescent twilight bog lagoon & mossy islets outside
    float bogWater = smoothstep(0.56, 0.70, n1) * mix(1.0, 0.54, centerCalm);
    float mossTuft = smoothstep(0.38, 0.72, n2);
    float mycoEdge = crackNet(p * 0.30, 0.72);
    float vein = (1.0 - smoothstep(0.012, 0.052, mycoEdge)) * smoothstep(0.42, 0.70, n2);
    float tide = 0.70 + 0.30 * sin(uTime * 1.4 + n1 * 3.8);
    albedo = mix(albedo * 0.90, albedo * 1.10, mossTuft * detailAmt);
    albedo = mix(albedo, vec3(0.015, 0.046, 0.044), bogWater * 0.66 * inside);
    albedo = mix(albedo, albedo * 0.78, gridLine * 0.16 * inside);
    emissive += uFloorAccent * vein * tide * (1.0 - bogWater * 0.6) * 0.20 * inside;
    specBoost = mix(0.05, 0.36, bogWater * inside);

    if (outMask > 0.001) {
      float islet = smoothstep(0.58, 0.74, n1 + smoothstep(6.8, 11.5, outDist) * 0.26);
      float lagoon = smoothstep(1.05, 1.75, outDist) * (1.0 - islet);
      float ripple = 0.5 + 0.5 * sin(p.x * 1.15 - p.y * 1.2 + uTime * 1.2 + n2 * 4.2);
      vec3 water = mix(vec3(0.010, 0.044, 0.042), vec3(0.020, 0.085, 0.074), ripple * 0.5 + n2 * 0.5);
      vec3 mossBank = mix(vec3(0.030, 0.080, 0.052), vec3(0.062, 0.138, 0.084), mossTuft);
      albedo = mix(albedo, mix(mossBank, water, lagoon), outMask);
      float bioSwirl = smoothstep(0.74, 0.96, ripple) * lagoon * n2;
      extEmissive += (uFloorAccent * bioSwirl * 0.13 + uFloorTrim * vein * (1.0 - lagoon) * 0.20 * tide) * outMask;
      specBoost = mix(specBoost, mix(0.10, 0.52, lagoon), outMask);
      extScale = 0.90;
    }
  } else if (style == 4) {
    // SHATTERED CORE: midnight-obsidian sanctuary island suspended over a starry astral nebula abyss!
    float beat = 0.78 + 0.22 * pow(0.5 + 0.5 * sin(uTime * 2.2), 2.0);
    float slab = hash21(floor(p * 0.25 + 0.5));
    albedo *= 0.90 + slab * 0.14 * detailAmt;
    albedo = mix(albedo, albedo * 0.72, gridLine * 0.28 * inside);
    float riftMask = smoothstep(0.38, 0.72, n1);
    float riftEdge = crackNet(p * 0.25, 0.38);
    float rift = (1.0 - smoothstep(0.011, 0.052, riftEdge)) * (0.16 + 0.84 * riftMask);
    float starDust = smoothstep(0.93, 0.99, vnoise(p * 1.85 + vec2(1.7, -2.3))) * (0.5 + 0.5 * sin(uTime * 2.5 + n2 * 8.0));
    emissive += mix(uFloorTrim, uFloorAccent, n2) * rift * 0.38 * beat * inside;
    emissive += uFloorTrim * starDust * 0.15 * inside;
    specBoost = 0.18 * inside;

    if (outMask > 0.001) {
      float abyss = smoothstep(0.85, 1.95, outDist);
      float neb1 = fbm(p * 0.065 + vec2(uTime * 0.014, -uTime * 0.011));
      float neb2 = fbm(p * 0.13 - vec2(uTime * 0.018, 1.7));
      vec3 nebula = mix(vec3(0.018, 0.010, 0.052), vec3(0.11, 0.045, 0.22), smoothstep(0.32, 0.78, neb1));
      nebula += vec3(0.16, 0.042, 0.14) * smoothstep(0.52, 0.86, neb2) * 0.75;
      // Crisp multi-scale twinkling cosmic starfield + faint golden celestial orbit arcs
      vec2 sc1 = floor(p * 1.35);
      vec2 sf1 = fract(p * 1.35) - 0.5;
      float sh1 = hash21(sc1);
      float star1 = step(0.91, sh1) * exp(-dot(sf1, sf1) * 42.0) * (0.55 + 0.45 * sin(uTime * 2.4 + sh1 * 40.0));
      vec2 sc2 = floor(p * 0.62 + 11.3);
      vec2 sf2 = fract(p * 0.62 + 11.3) - 0.5;
      float sh2 = hash21(sc2);
      float star2 = step(0.94, sh2) * exp(-dot(sf2, sf2) * 32.0) * (0.65 + 0.35 * cos(uTime * 1.7 + sh2 * 30.0));
      float radP = length(p);
      float maxH = max(uHalf.x, uHalf.y);
      float orbitLine = exp(-pow((radP - (maxH + 6.4)) * 3.2, 2.0)) + exp(-pow((radP - (maxH + 12.2)) * 2.6, 2.0));
      vec3 cliffLip = vec3(0.05, 0.035, 0.11);
      albedo = mix(albedo, mix(cliffLip, vec3(0.008, 0.005, 0.022), abyss), outMask);
      vec3 starCol = mix(vec3(1.0, 0.88, 0.62), vec3(0.76, 0.88, 1.0), fract(sh1 * 13.7));
      extEmissive += (nebula + starCol * star1 * 0.95 + uFloorAccent * star2 * 0.85 + vec3(0.55, 0.38, 0.16) * orbitLine * 0.24) * abyss * outMask;
      extScale = mix(0.75, 0.08, abyss);
    }
  } else if (style == 6) {
    // ASHFALL CALDERA: charred basalt platform surrounded by molten magma rivers & volcanic terraces
    float slab = hash21(floor(p * 0.25 + 0.5));
    albedo *= 0.90 + slab * 0.14 * detailAmt;
    albedo = mix(albedo, albedo * 0.68, gridLine * 0.26 * inside);
    float pocket = smoothstep(0.34, 0.74, n1);
    float basaltEdge = crackNet(p * 0.26, 0.42);
    float crackLine = 1.0 - smoothstep(0.012, 0.062, basaltEdge);
    float magma = crackLine * (0.16 + 0.84 * pocket);
    float emberGlow = 0.78 + 0.22 * sin(uTime * 2.2 + p.x * 0.35 - p.y * 0.28);
    vec3 lavaCol = mix(vec3(0.80, 0.12, 0.015), vec3(1.32, 0.50, 0.065), smoothstep(0.24, 0.88, magma * emberGlow));
    emissive += lavaCol * magma * 0.68 * inside;
    specBoost = 0.11 * inside;

    if (outMask > 0.001) {
      float moat = smoothstep(1.25, 1.95, outDist) * (1.0 - smoothstep(5.8, 6.9, outDist + (n1 - 0.5) * 1.4));
      float trib = (1.0 - smoothstep(0.8, 2.2, abs(p.x + sin(p.y * 0.22) * 2.4))) + (1.0 - smoothstep(0.8, 2.2, abs(p.y + cos(p.x * 0.22) * 2.4)));
      float lavaRiver = clamp(moat + clamp(trib, 0.0, 1.0) * smoothstep(5.5, 8.0, outDist) * 0.72, 0.0, 1.0);
      float flow = 0.5 + 0.5 * sin(p.x * 0.6 + p.y * 0.5 - uTime * 1.3 + n2 * 4.2);
      float crust = smoothstep(0.56, 0.82, n2 + (1.0 - lavaRiver) * 0.35);
      vec3 basaltBank = mix(vec3(0.048, 0.032, 0.034), vec3(0.088, 0.056, 0.054), n1);
      albedo = mix(albedo, mix(basaltBank, vec3(0.04, 0.02, 0.018), lavaRiver), outMask);
      vec3 moltenStream = mix(vec3(0.76, 0.11, 0.015), vec3(1.24, 0.44, 0.055), flow);
      float lavaHeat = lavaRiver * (1.0 - crust * 0.68);
      extEmissive += (moltenStream * lavaHeat * 0.72 + lavaCol * crackLine * (1.0 - lavaRiver) * 0.36) * outMask;
      specBoost = mix(specBoost, 0.16, outMask);
      extScale = 0.86;
    }
  } else {
    // GLASS FLATS: sunlit oasis courtyard inside; sculpted golden sand dunes & turquoise glass lagoons outside
    float glass = smoothstep(0.52, 0.68, n1) * mix(1.0, 0.54, centerCalm);
    float ripple = sin(p.y * 1.4 + p.x * 0.35 + n2 * 3.5) * 0.5 + 0.5;
    albedo = mix(albedo * (0.92 + ripple * 0.10 * detailAmt), vec3(0.048, 0.20, 0.22), glass * 0.56 * inside);
    albedo = mix(albedo, albedo * 0.86, gridLine * 0.15 * inside);
    float glassCrack = (1.0 - smoothstep(0.015, 0.052, crackNet(p * 0.36, 0.35))) * glass;
    albedo += vec3(0.045, 0.14, 0.15) * glassCrack * 0.48 * inside;
    float glint = smoothstep(0.76, 0.96, sin(p.x * 0.65 + p.y * 0.48 - uTime * 1.3 + n2 * 4.2));
    emissive += uFloorAccent * glint * glass * 0.11 * inside;
    specBoost = mix(0.06, 0.40, glass * inside);

    if (outMask > 0.001) {
      float duneWave = sin(p.y * 0.52 + p.x * 0.22 + fbm(p * 0.11) * 3.4) * 0.5 + 0.5;
      float duneCrest = pow(duneWave, 1.8);
      float oasis = smoothstep(0.57, 0.69, fbm(p * 0.12 + vec2(-2.1, 1.4))) * smoothstep(2.0, 3.6, outDist);
      float shore = exp(-pow((fbm(p * 0.12 + vec2(-2.1, 1.4)) - 0.57) * 26.0, 2.0)) * smoothstep(2.0, 3.6, outDist);
      vec3 sandCol = mix(vec3(0.18, 0.11, 0.058), vec3(0.36, 0.24, 0.125), duneCrest);
      vec3 poolCol = mix(vec3(0.032, 0.20, 0.21), vec3(0.075, 0.34, 0.33), 0.5 + 0.5 * sin(p.x * 0.9 + uTime * 1.2 + n2 * 3.0));
      vec3 extCol = mix(sandCol, poolCol, oasis);
      extCol = mix(extCol, vec3(0.42, 0.36, 0.24), clamp(shore, 0.0, 1.0) * 0.58);
      albedo = mix(albedo, extCol, outMask);
      extEmissive += uFloorTrim * oasis * (0.10 + glint * 0.18) * outMask;
      specBoost = mix(specBoost, mix(0.08, 0.56, oasis), outMask);
      extScale = 0.92;
    }
  }

  // Calm interior emissives & specular glare (~50% softer in central combat space) while keeping perimeter & exterior rich
  emissive = emissive * emissiveCalm + extEmissive;
  specBoost *= mix(1.0, 0.52, centerCalm);

  // Handcrafted perimeter border framing & subtle wall-base contact shadow right outside the parapet
  albedo *= mix(1.0, 0.84, borderRich * 0.48);
  float wallApron = exp(-pow((outDist - 0.75) * 1.4, 2.0)) * outMask;
  albedo *= 1.0 - wallApron * 0.26;
  float border = (1.0 - smoothstep(0.0, 0.34, abs(edgeMin))) * step(-0.2, edgeMin);
  emissive += uFloorTrim * border * 0.34;
  // Wave pulse sweep ring
  if (uPulse > 0.005) {
    float waveR = (1.0 - uPulse) * max(uHalf.x, uHalf.y) * 1.35;
    float ring = exp(-pow((length(p) - waveR) * 0.85, 2.0)) * uPulse;
    emissive += uFloorAccent * ring * 0.82 * inside;
  }

  // Exterior ground maintains natural storybook brightness (except Core's cosmic void)
  albedo *= mix(extScale, 1.0, inside);
  // Apply baked ground-contact ambient occlusion
  albedo *= mix(0.32, 1.0, occ);

  // Lighting + velvety 2048 hardware-PCF diorama shadows
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(uCamPos - vWorldPos);
  float shadow = sampleShadow(vWorldPos, N);
  float darkScale = 1.0 - uDarkness * 0.40;
  vec3 key = mix(uShadowTint * 0.50, uSunColor * uSunIntensity * 0.62, mix(0.22, 1.0, shadow)) * darkScale;
  vec3 hemi = uHemiSky * uHemiIntensity * 0.32 * darkScale;
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 34.0) * specBoost * 0.46 * shadow * darkScale;

  vec3 lit = albedo * (key + hemi) + uSunColor * spec;
  lit += evalPointLights(vWorldPos, N, albedo * 1.15);
  lit += emissive * (0.55 + 0.45 * darkScale);
  lit = applyFog(lit, vWorldPos);
  fragColor = vec4(lit, 1.0);
}`;
  return { vs, fs };
}

// 4. Unlit / Emissive / Additive / VFX Sprite Shader (glow parts, beams, rings, sparks, particles, shadows)
export function emissiveProgram(instanced) {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aCol;
${
  instanced
    ? `
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;`
    : ""
}
${COMMON_UNIFORMS}
uniform mat4 uModel;
uniform float uUseVertexColors;
out vec3 vWorldPos;
out vec2 vUv;
out vec3 vColor;
void main() {
  mat4 M = ${instanced ? "uModel * aInstMat" : "uModel"};
  vec4 wp = M * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vUv = aUv;
  vec3 vc = mix(vec3(1.0), aCol, uUseVertexColors);
  vec3 rawCol = ${instanced ? "vc * aInstCol" : "vc"};
  vColor = pow(max(rawCol, vec3(0.0)), vec3(2.2));
  gl_Position = uViewProj * wp;
}`;

  const fs = `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
uniform sampler2D uVfxAtlas;
uniform float uVfxReady;
uniform int uSpriteTile;
uniform vec3 uBaseColor;
uniform float uEmissiveIntensity;
uniform float uOpacity;
uniform float uFogEnabled;
uniform float uAdditive;
in vec3 vWorldPos;
in vec2 vUv;
in vec3 vColor;
out vec4 fragColor;
void main() {
  vec3 col = uBaseColor * vColor * uEmissiveIntensity;
  float alpha = uOpacity;
  if (uSpriteTile >= 0) {
    if (uVfxReady > 0.5) {
      vec2 tile = vec2(float(uSpriteTile % 2), float(uSpriteTile / 2));
      vec2 uv = (tile + clamp(vUv, 0.01, 0.99)) * 0.5;
      vec4 tex = texture(uVfxAtlas, uv);
      col *= pow(max(tex.rgb, vec3(0.0)), vec3(2.2));
      alpha *= tex.a;
    } else {
      float d = length(vUv * 2.0 - 1.0);
      alpha *= pow(clamp(1.0 - d, 0.0, 1.0), 1.8);
    }
    if (alpha < 0.01) discard;
  }
  if (uFogEnabled > 0.5 && uAdditive < 0.5) col = applyFog(col, vWorldPos);
  fragColor = vec4(col, alpha);
}`;
  return { vs, fs };
}

// 5. Stylized Painterly Aurora Curtains (Aurora Shelf exterior sky)
export function auroraProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vUv;
out vec3 vWorldPos;
void main() {
  vec3 p = aPos;
  float sway = sin(aUv.x * 9.0 + uTime * 0.45) * 0.55 + cos(aUv.x * 15.0 - uTime * 0.32) * 0.3;
  p.y += sin(aUv.x * 6.0 + uTime * 0.35) * 0.45 * aUv.y;
  p.z += sway * aUv.y * 0.35;
  vec4 wp = uModel * vec4(p, 1.0);
  vUv = aUv;
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
in vec2 vUv;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float h = vUv.y;
  float wave = 0.5 + 0.5 * sin(vUv.x * 26.0 + uTime * 0.6 + sin(vUv.x * 8.0 - uTime * 0.4) * 2.2);
  float ribs = pow(wave, 2.2);
  float env = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.45, 1.0, h));
  float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
  vec3 emerald = vec3(0.24, 1.05, 0.82);
  vec3 cyan = vec3(0.32, 0.84, 1.25);
  vec3 violet = vec3(0.74, 0.44, 1.12);
  vec3 col = mix(emerald, cyan, smoothstep(0.15, 0.55, h));
  col = mix(col, violet, smoothstep(0.5, 0.92, h));
  float alpha = env * ends * (0.22 + ribs * 0.52);
  if (alpha < 0.01) discard;
  fragColor = vec4(col * 1.15, alpha);
}`;
  return { vs, fs };
}

// 6. Stylized Aegis Shield Bubble Shader
export function aegisProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec2 vUv;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(uModel) * aNorm);
  vUv = aUv;
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
uniform vec3 uColor;
uniform float uHit;
uniform float uFade;
in vec3 vWorldPos;
in vec3 vWorldNorm;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vWorldNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  float rim = pow(1.0 - abs(dot(N, V)), 2.2);
  float bands = 0.5 + 0.5 * sin(vWorldPos.y * 14.0 - uTime * 5.0);
  float hex = smoothstep(0.76, 0.95, abs(sin(vUv.x * 37.7 + uTime)) * abs(cos(vUv.y * 25.1)));
  vec3 col = mix(uColor, vec3(0.96, 1.04, 1.12), rim * 0.45 + uHit * 0.55);
  float alpha = (0.055 + rim * 0.48 + hex * 0.16 + bands * 0.045 + uHit * 0.42) * uFade;
  if (alpha < 0.01) discard;
  fragColor = vec4(col * 0.96, clamp(alpha, 0.0, 0.85));
}`;
  return { vs, fs };
}

// 7. Stylized Cel Flame Ribbon Shader (instanced)
export function flameProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vUv;
out vec3 vState;
out vec3 vWorldPos;
void main() {
  vUv = aUv;
  vState = aInstCol;
  vec3 p = aPos;
  float t = uTime * 13.0 + vState.g * 70.0;
  p.y += sin(aUv.x * 10.0 - t) * 0.1 * (1.0 - aUv.x);
  p.z += cos(aUv.x * 12.0 - t * 1.2) * 0.08;
  vec4 wp = uModel * aInstMat * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
in vec2 vUv;
in vec3 vState;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float u = vUv.x;
  float sway = sin(u * 13.0 - uTime * 11.0 + vState.g * 14.0) * 0.11 * (1.0 - u);
  float edge = abs(vUv.y - 0.5 + sway);
  float w = 0.08 + 0.34 * sin(u * 3.14159);
  float tongues = 0.62 + 0.38 * cos(u * 30.0 - uTime * 16.0 + vState.g * 26.0);
  float body = (1.0 - smoothstep(w - 0.04, w + 0.03, edge)) * smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.86, 1.0, u));
  float alpha = body * tongues * (1.0 - max(0.0, vState.r) * 0.65) * vState.b;
  if (alpha < 0.02) discard;
  float core = (1.0 - smoothstep(0.01, w * 0.85, edge)) * tongues;
  // Crisp cel-stepped gouache flame palette: warm crimson edge -> vivid tangerine -> amber heart (never blinds bullets)
  vec3 col = mix(vec3(0.76, 0.11, 0.04), vec3(1.10, 0.44, 0.08), smoothstep(0.14, 0.42, core));
  col = mix(col, vec3(1.32, 1.02, 0.48), smoothstep(0.58, 0.80, core));
  fragColor = vec4(col, alpha * 0.72);
}`;
  return { vs, fs };
}

// 8. Ability Shaders: Nova Wave, Singularity Field, Singularity Event-Horizon Core
export function abilityWaveProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vUv;
out vec3 vState;
void main() {
  vUv = aUv;
  vState = aInstCol;
  gl_Position = uViewProj * uModel * aInstMat * vec4(aPos, 1.0);
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
in vec2 vUv;
in vec3 vState;
out vec4 fragColor;
void main() {
  float age = vState.r, h = vUv.y, orbit = vUv.x * 6.2831853;
  float lead = exp(-pow((h - 0.15) * 14.0, 2.0));
  float echo = exp(-pow((h - 0.42) * 20.0, 2.0)) * 0.52;
  float arcs = smoothstep(-0.15, 0.2, cos(orbit * 8.0 - uTime * 4.0)) * exp(-pow((h - 0.62) * 10.0, 2.0));
  float alpha = (lead + echo + arcs * 0.36) * pow(1.0 - age, 1.2) * smoothstep(0.0, 0.05, age) * vState.b;
  if (alpha < 0.01) discard;
  vec3 hue = vState.g < 0.5 ? vec3(0.16, 0.88, 0.82) : vState.g < 1.5 ? vec3(0.72, 0.32, 1.12) : vec3(1.12, 0.56, 0.16);
  vec3 col = mix(hue, vec3(1.18, 1.14, 0.96), lead * 0.45);
  fragColor = vec4(col, alpha);
}`;
  return { vs, fs };
}

export function abilityFieldProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vUv;
out vec3 vState;
void main() {
  vUv = aUv;
  vState = aInstCol;
  gl_Position = uViewProj * uModel * aInstMat * vec4(aPos, 1.0);
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
in vec2 vUv;
in vec3 vState;
out vec4 fragColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p), a = atan(p.y, p.x + 1e-5);
  if (r > 1.0 || r < 0.05) discard;
  float target = step(2.5, vState.g);
  float spiral = a + log(r + 0.08) * 2.1 + uTime * 1.4;
  float arcs = pow(abs(cos(spiral * 3.0)), 10.0) * (1.0 - r);
  float slits = pow(0.5 + 0.5 * cos(a * 12.0 - uTime * 2.2), 5.0);
  float frame = step(1.5, vState.g) * (1.0 - target);
  float rim = exp(-pow((r - mix(0.22, 0.48, frame)) * 28.0, 2.0));
  float halo = exp(-pow((r - 0.72) * 22.0, 2.0)) * slits;
  float alpha = (arcs * 0.56 + halo * 0.56 + rim * 0.84) * (1.0 - vState.r * 0.42);
  vec3 col = mix(vec3(0.36, 0.16, 0.72), vec3(1.06, 0.64, 0.34), clamp(rim + halo + arcs * 0.5, 0.0, 1.0));
  if (target > 0.5) {
    float border = exp(-pow((r - 0.93) * 65.0, 2.0));
    alpha = border * (0.30 + slits * 0.42);
    col = vec3(0.32, 0.94, 0.78);
  }
  if (alpha * vState.b < 0.01) discard;
  fragColor = vec4(col, clamp(alpha * vState.b, 0.0, 1.0));
}`;
  return { vs, fs };
}

export function abilityCoreProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=4) in mat4 aInstMat;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vWorldNorm;
void main() {
  mat4 M = uModel * aInstMat;
  vec4 wp = M * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vWorldNorm = normalize(mat3(M) * aNorm);
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
in vec3 vWorldPos;
in vec3 vWorldNorm;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vWorldNorm);
  vec3 V = normalize(uCamPos - vWorldPos);
  float rim = pow(1.0 - abs(dot(N, V)), 3.2);
  vec3 col = vec3(0.02, 0.008, 0.05) + vec3(1.02, 0.54, 1.24) * rim;
  fragColor = vec4(col, 0.98);
}`;
  return { vs, fs };
}

// 9. Hazard Surface Shader (molten, ice, acid, portal, dust, pyro)
export function hazardSurfaceProgram(kind) {
  const fire = kind === "pyro";
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vP;
out vec3 vI;
out vec3 vWorldPos;
void main() {
  vP = ${fire ? "vec2(atan(aPos.z, aPos.x) / 6.2831853 + 0.5, aPos.y)" : "aPos.xz"};
  vI = aInstCol;
  vec4 wp = uModel * aInstMat * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;

  const bodies = {
    molten: `
      // Organic bubbling volcanic magma caldera pool with dark cooled crust islands & smooth molten convection core
      vec2 mp = vP * 2.6;
      float w1 = sin(mp.x * 1.9 + mp.y * 1.4 + seed - uTime * 0.85);
      float w2 = cos(mp.x * 1.6 - mp.y * 2.2 - seed * 0.7 + uTime * 0.65);
      float w3 = sin((mp.x - mp.y) * 2.4 + w1 * 1.2 + uTime * 0.55);
      float conv = clamp(0.5 + 0.34 * w1 + 0.28 * w2 + 0.20 * w3, 0.0, 1.0);
      float crust = smoothstep(0.36, 0.78, conv) * smoothstep(0.18, 0.82, r);
      float heart = exp(-r * r * 3.8) * (0.86 + 0.14 * sin(uTime * 3.0 + seed));
      float cracks = (1.0 - crust) * (1.0 - r * 0.45);
      vec3 dark = vec3(0.065, 0.028, 0.022);
      vec3 lavaRed = vec3(0.82, 0.12, 0.015);
      vec3 lavaGold = vec3(1.22, 0.46, 0.045);
      vec3 hotCore = vec3(1.38, 0.74, 0.14);
      float heat = clamp(heart * 0.78 + cracks * 0.58, 0.0, 1.0);
      vec3 magma = mix(lavaRed, lavaGold, smoothstep(0.12, 0.74, heat));
      magma = mix(magma, hotCore, smoothstep(0.82, 1.0, heat));
      col = mix(dark, magma, clamp((cracks * 0.74 + heart * 0.84 + rim * 0.36) * strength, 0.0, 1.0));
    `,
    ice: `
      // Deep translucent glacier pond with crisp crystalline fracture veins & sculpted cool sapphire-frost rim
      float w1 = sin(vP.x * 4.5 + vP.y * 3.2 + seed);
      float w2 = cos(vP.x * 3.6 - vP.y * 5.1 + seed * 1.7);
      float crackA = 1.0 - smoothstep(0.015, 0.056, abs(sin(a * 3.0 + w1 * 1.4 + seed) * r));
      float crackB = 1.0 - smoothstep(0.02, 0.064, abs(r - 0.52 + w2 * 0.12));
      float gloss = smoothstep(0.35, 0.85, 0.5 + 0.5 * (w1 * 0.6 + w2 * 0.4));
      float frostRim = smoothstep(0.83, 0.97, r);
      vec3 deepIce = vec3(0.055, 0.21, 0.38);
      vec3 paleIce = vec3(0.20, 0.45, 0.64);
      vec3 snowEdge = vec3(0.32, 0.58, 0.76);
      col = mix(deepIce, paleIce, clamp(gloss * 0.50 + crackA * 0.36 + crackB * 0.24, 0.0, 1.0));
      col = mix(col, snowEdge, clamp(frostRim * 0.58 + rim * 0.32, 0.0, 1.0));
      alpha *= 0.86;
    `,
    acid: `
      // Moody translucent bioluminescent emerald bog pool with gentle swirling jade ripples
      float rot = a + 0.45 * sin(r * 6.5 - uTime * 1.0 + seed);
      float swirl = 0.5 + 0.5 * sin(rot * 4.0 + r * 4.2);
      float ringGlow = smoothstep(0.62, 0.92, swirl) * (1.0 - r * 0.38);
      vec3 pig = mix(vec3(0.10, 0.46, 0.28), vec3(0.08, 0.52, 0.56), clamp(vI.b, 0.0, 1.0));
      col = mix(vec3(0.018, 0.085, 0.070), pig, 0.26 + ringGlow * 0.52 + rim * 0.30);
      alpha *= 0.88;
    `,
    portal: `
      vec3 ribbon = mix(vec3(0.64, 0.30, 1.05), vec3(0.20, 0.82, 0.68), vI.b);
      float swirl = 1.0 - smoothstep(0.1, 0.25, abs(cos(a * 3.0 + log(r + 0.08) * 5.2 + uTime * 2.2)));
      float ring2 = exp(-pow((r - 0.65) * 24.0, 2.0));
      col = vec3(0.018, 0.012, 0.045) + ribbon * (rim * 0.92 + ring2 * 0.64 + swirl * r * 0.48) * strength;
    `,
    dust: `
      float ribbons = pow(0.5 + 0.5 * sin(a * 5.0 + log(r + 0.09) * 6.0 - uTime * 3.0 + seed), 4.0);
      float edge = 1.0 - smoothstep(0.45, 0.98, r);
      col = mix(vec3(0.36, 0.22, 0.12), vec3(0.74, 0.54, 0.30), ribbons);
      alpha = edge * (ribbons * 0.72 + 0.18) * strength;
    `,
  };

  const fs = fire
    ? `${HEADER}
${COMMON_UNIFORMS}
in vec2 vP;
in vec3 vI;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float h = vP.y;
  float lat = pow(0.5 + 0.5 * cos(vP.x * 44.0 - h * 13.0 + uTime * 11.0), 2.4);
  float pulse = 0.65 + 0.35 * cos(h * 16.0 - uTime * 6.0);
  float fall = (1.0 - smoothstep(0.22, 0.99, h)) * smoothstep(0.0, 0.06, h);
  vec3 c = mix(vec3(0.92, 0.18, 0.04), vec3(1.28, 0.82, 0.30), h * 0.45 + lat * 0.55);
  fragColor = vec4(c * vI.r * (0.28 + lat * 0.68) * fall * pulse, 1.0);
}`
    : `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
in vec2 vP;
in vec3 vI;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float r = length(vP), a = atan(vP.y, vP.x + 1e-5);
  if (r > 1.0) discard;
  float seed = vI.g * 6.283;
  float strength = vI.r;
  float rim = exp(-pow((r - 0.9) * 26.0, 2.0));
  float alpha = 1.0 - smoothstep(0.92, 1.0, r);
  vec3 col = vec3(0.0);
  ${bodies[kind] || bodies.molten}
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`;
  return { vs, fs };
}

// 10. High-Contrast Stylized Danger Zone Telegraph & Persistent Floor Mark Shaders
export function zoneTelegraphProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vP;
out vec3 vI;
void main() {
  vP = aPos.xz;
  vI = aInstCol;
  gl_Position = uViewProj * uModel * aInstMat * vec4(aPos, 1.0);
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
uniform vec3 uWarn;
in vec2 vP;
in vec3 vI;
out vec4 fragColor;

vec3 elementColor(int i) {
  if (i == 1 || i == 2 || i == 7) return vec3(1.16, 0.18, 0.02);
  if (i == 3) return vec3(0.04, 0.54, 1.12);
  if (i == 4) return vec3(0.05, 0.84, 0.22);
  if (i == 5) return vec3(0.56, 0.09, 1.14);
  if (i == 8) return vec3(1.12, 0.42, 0.03);
  return vec3(1.18, 0.09, 0.08);
}
void main() {
  float r = length(vP), a = atan(vP.y, vP.x + 1e-5), k = clamp(vI.r, 0.0, 1.0);
  if (r > 1.0) discard;
  int look = int(vI.b * 8.0 + 0.5);
  // Outer dark-ink outline sits strictly outside the vivid danger rim so it stays razor-sharp on snow & sand
  float inkOuter = exp(-pow((r - 0.962) * 38.0, 2.0));
  float inkInner = exp(-pow((r - 0.855) * 44.0, 2.0)) * 0.65;
  float brightRim = exp(-pow((r - 0.908) * 54.0, 2.0));
  float fillWave = smoothstep(k + 0.03, k - 0.02, r);
  float fillEdge = exp(-pow((r - mix(0.14, 0.86, k)) * 34.0, 2.0));
  float ticks = exp(-pow((r - 0.78) * 32.0, 2.0)) * smoothstep(0.74, 0.94, cos(a * 16.0));
  vec3 el = mix(elementColor(look), uWarn * 1.05, 0.30);
  vec3 ink = vec3(0.014, 0.008, 0.018);
  vec3 col = mix(el * 0.68, el * 1.15, clamp(brightRim + fillEdge * 0.85 + ticks * 0.55, 0.0, 1.0));
  col = mix(col, ink, clamp(inkOuter * 0.96 + inkInner * (1.0 - brightRim), 0.0, 0.96));
  float baseAlpha = (0.20 + 0.30 * fillWave) * (1.0 - r * 0.16);
  float lineAlpha = max(inkOuter * 0.96, max(brightRim * 0.95, max(fillEdge * 0.88, inkInner * 0.72)));
  float alpha = max(baseAlpha, lineAlpha);
  fragColor = vec4(col, clamp(alpha * (1.0 - smoothstep(0.985, 1.0, r)), 0.0, 0.96));
}`;
  return { vs, fs };
}

export function floorMarkProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vP;
out vec3 vI;
out vec3 vWorldPos;
void main() {
  vP = aPos.xz;
  vI = aInstCol;
  vec4 wp = uModel * aInstMat * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
in vec2 vP;
in vec3 vI;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float r = length(vP), a = atan(vP.y, vP.x + 1e-5), seed = vI.g * 6.283;
  float edge = 0.76 + 0.14 * cos(a * 5.0 + seed) + 0.06 * sin(a * 11.0 - seed);
  if (r > edge) discard;
  int look = int(vI.b * 8.0 + 0.5);
  float life = vI.r;
  float cracks = pow(0.5 + 0.5 * sin(a * 7.0 + seed + r * 6.0), 4.0) * (1.0 - r);
  vec3 base = vec3(0.03, 0.02, 0.02);
  vec3 glow = vec3(1.05, 0.24, 0.04);
  if (look == 3) { base = vec3(0.06, 0.18, 0.30); glow = vec3(0.32, 0.76, 1.02); }
  else if (look == 4) { base = vec3(0.02, 0.09, 0.05); glow = vec3(0.10, 0.82, 0.32); }
  else if (look == 5) { base = vec3(0.04, 0.015, 0.10); glow = vec3(0.52, 0.14, 1.04); }
  else if (look == 1) { base = vec3(0.04, 0.035, 0.04); glow = vec3(0.20, 0.17, 0.14); }
  vec3 col = mix(base, glow, cracks * smoothstep(0.25, 1.0, life) * 0.76);
  float alpha = (0.55 + cracks * 0.35) * (1.0 - smoothstep(edge - 0.16, edge, r)) * smoothstep(0.0, 0.25, life);
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, alpha);
}`;
  return { vs, fs };
}

// 11. Stylized Billowing Smoke Shader (instanced quads using VFX atlas smoke quadrant)
export function smokeProgram() {
  const vs = `${HEADER}
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=4) in mat4 aInstMat;
layout(location=8) in vec3 aInstCol;
layout(location=9) in float aInstFlash;
${COMMON_UNIFORMS}
uniform mat4 uModel;
out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out vec3 vWorldPos;
void main() {
  vUv = aUv;
  vColor = pow(max(aInstCol, vec3(0.0)), vec3(2.2));
  vAlpha = aInstFlash;
  vec4 wp = uModel * aInstMat * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;
  const fs = `${HEADER}
${COMMON_UNIFORMS}
${FOG_FN}
uniform sampler2D uVfxAtlas;
uniform float uVfxReady;
in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in vec3 vWorldPos;
out vec4 fragColor;
void main() {
  float a = 0.0;
  float shade = 0.85;
  if (uVfxReady > 0.5) {
    vec2 uv = vec2(0.0, 0.5) + clamp(vUv, 0.01, 0.99) * 0.5;
    vec4 tex = texture(uVfxAtlas, uv);
    shade = tex.r;
    a = tex.a * vAlpha;
  } else {
    float d = length(vUv * 2.0 - 1.0);
    a = smoothstep(1.0, 0.25, d) * vAlpha;
  }
  if (a < 0.015) discard;
  vec3 col = mix(uShadowTint * 0.55, vColor * (0.64 + uSunColor * 0.32), smoothstep(0.38, 0.84, shade));
  col = applyFog(col, vWorldPos);
  fragColor = vec4(col, a);
}`;
  return { vs, fs };
}

// 12. Post-Processing Shaders: Fullscreen Triangle + Selective Bloom + Stylized ACES Tone Mapping
const FULLSCREEN_VS = `${HEADER}
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export function bloomPrefilterProgram() {
  const fs = `${HEADER}
uniform sampler2D uSrc;
uniform float uThreshold;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 tx = 1.0 / vec2(textureSize(uSrc, 0));
  vec3 c = texture(uSrc, vUv).rgb * 0.4
         + (texture(uSrc, vUv + vec2(tx.x, tx.y)).rgb
         + texture(uSrc, vUv + vec2(-tx.x, tx.y)).rgb
         + texture(uSrc, vUv + vec2(tx.x, -tx.y)).rgb
         + texture(uSrc, vUv + vec2(-tx.x, -tx.y)).rgb) * 0.15;
  float br = max(c.r, max(c.g, c.b));
  float knee = 0.18;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  fragColor = vec4(min(c * contrib, vec3(1.85)), 1.0);
}`;
  return { vs: FULLSCREEN_VS, fs };
}

export function bloomKawaseProgram() {
  const fs = `${HEADER}
uniform sampler2D uSrc;
uniform float uOffset;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 tx = (1.0 / vec2(textureSize(uSrc, 0))) * uOffset;
  vec3 sum = texture(uSrc, vUv).rgb * 0.25;
  sum += texture(uSrc, vUv + vec2(tx.x, tx.y)).rgb * 0.1875;
  sum += texture(uSrc, vUv + vec2(-tx.x, tx.y)).rgb * 0.1875;
  sum += texture(uSrc, vUv + vec2(tx.x, -tx.y)).rgb * 0.1875;
  sum += texture(uSrc, vUv + vec2(-tx.x, -tx.y)).rgb * 0.1875;
  fragColor = vec4(sum, 1.0);
}`;
  return { vs: FULLSCREEN_VS, fs };
}

export function postCompositeProgram() {
  const fs = `${HEADER}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uFlash;
in vec2 vUv;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 hdr = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 col = hdr + bloom * uBloomStrength;
  // Boss-down celebratory pulse (restrained to avoid screen whiteout)
  col += vec3(uFlash * 0.26);
  // Calibrated ACES filmic tone map + subtle painterly storybook vibrance
  col = acesFilm(col * 0.96);
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.08);
  // Subtle miniature diorama peripheral depth framing (keeps central combat crisp)
  vec2 q = vUv * 2.0 - 1.0;
  float rad2 = dot(q, q);
  float edgeBand = smoothstep(0.45, 1.65, rad2);
  float tiltFrame = smoothstep(0.62, 1.0, abs(q.y));
  float vig = 1.0 - rad2 * 0.085 - tiltFrame * 0.045;
  col *= clamp(vig, 0.78, 1.0);
  col = mix(col, col * vec3(0.95, 0.96, 1.03), edgeBand * 0.18);
  // Single clean sRGB gamma encode from linear HDR
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}`;
  return { vs: FULLSCREEN_VS, fs };
}
