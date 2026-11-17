// Offscreen low-res HDR pixel-art render pipeline:
// 1) Renders the 3D scene at a controlled logical pixel resolution (HalfFloatType HDR target, NearestFilter)
// 2) Extracts & blurs HDR emissive highlights via dual-pass separable bloom
// 3) Composites low-res scene + bloom + Khronos Neutral tone mapping + Bayer 4x4 dithering + biome grading
//    onto the full-res screen with crisp nearest-neighbor pixel edges.
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from "three";
import { GLSL_BAYER4, GLSL_LINEAR_TO_SRGB, GLSL_NEUTRAL_TONEMAP } from "./pixel-art.js";
import { getBiomePalette } from "./biome-palettes.js";

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLOOM_PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  float peak = max(col.r, max(col.g, col.b));
  float soft = smoothstep(uThreshold * 0.72, uThreshold + 0.35, peak);
  vec3 bright = col * soft;
  gl_FragColor = vec4(bright, 1.0);
}
`;

const BLOOM_BLUR_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec2 off1 = uDir * uTexel * 1.3846153846;
  vec2 off2 = uDir * uTexel * 3.2307692308;
  vec3 acc = texture2D(tInput, vUv).rgb * 0.2270270270;
  acc += texture2D(tInput, vUv + off1).rgb * 0.3162162162;
  acc += texture2D(tInput, vUv - off1).rgb * 0.3162162162;
  acc += texture2D(tInput, vUv + off2).rgb * 0.0702702703;
  acc += texture2D(tInput, vUv - off2).rgb * 0.0702702703;
  gl_FragColor = vec4(acc, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uPixelRes;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uDither;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
varying vec2 vUv;
${GLSL_BAYER4}
${GLSL_NEUTRAL_TONEMAP}
${GLSL_LINEAR_TO_SRGB}
void main() {
  // Snap UV explicitly to logical pixel centers for crisp sub-native blocks even across odd DPRs.
  vec2 pxCoord = floor(vUv * uPixelRes);
  vec2 snappedUv = (pxCoord + 0.5) / uPixelRes;

  vec3 hdr = texture2D(tScene, snappedUv).rgb;
  vec3 bloom = texture2D(tBloom, snappedUv).rgb;
  vec3 col = hdr * uExposure + bloom * uBloomStrength;

  // Khronos Neutral tone curve + ordered pixel-grid dithering (Inscryption / Dead Cells shadow smoothness).
  col = pxNeutralToneMap(col);
  float bayer = pxBayer4(pxCoord);
  col += bayer * uDither * (1.0 - smoothstep(0.0, 0.55, dot(col, vec3(0.299, 0.587, 0.114))));
  col = clamp(col, 0.0, 1.0);

  // Convert linear working color to sRGB before stylized biome contrast & shadow-tint grade.
  col = pxLinearToSRGB(col);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uSaturation);
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  // Rich dark-tinted shadows + subtle highlight warmth
  col = mix(col, max(col, uShadowTint * 0.55), (1.0 - smoothstep(0.0, 0.28, lum)) * 0.45);
  col *= mix(vec3(1.0), uHighlightTint, smoothstep(0.65, 1.0, lum) * 0.08);

  // Subtle pixel-stepped atmospheric vignette around arena edges
  vec2 dv = vUv * 2.0 - 1.0;
  float vig = smoothstep(0.55, 1.5, dot(dv, dv));
  col = mix(col, uShadowTint * 0.35, vig * uVignette);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// Compute internal logical pixel dimensions from viewport CSS size.
// Keeps ~360-460 vertical rows on tablet/desktop and ~200+ on landscape phones with square pixels.
export function computePixelResolution(cssW, cssH) {
  const w = Math.max(1, Math.round(cssW));
  const h = Math.max(1, Math.round(cssH));
  const minDim = Math.min(w, h);
  const scale = minDim >= 900 ? 2.5 : minDim >= 650 ? 2.25 : minDim >= 420 ? 2.0 : 1.75;
  const pxH = Math.max(180, Math.round(h / scale));
  const pxW = Math.max(240, Math.round((pxH * w) / h));
  return { pxW, pxH, scale };
}

export class PixelPipeline {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = opts.enabled !== false;
    this.bloomEnabled = opts.bloom !== false;
    this.pxW = 0;
    this.pxH = 0;
    this.sceneTarget = null;
    this.bloomA = null;
    this.bloomB = null;

    this.orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new PlaneGeometry(2, 2);

    this.prefilterMat = new ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uThreshold: { value: 0.72 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_PREFILTER_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.blurMat = new ShaderMaterial({
      uniforms: {
        tInput: { value: null },
        uTexel: { value: new Vector2(1 / 256, 1 / 256) },
        uDir: { value: new Vector2(1, 0) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLOOM_BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const pal = getBiomePalette("city");
    this.compositeMat = new ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uPixelRes: { value: new Vector2(640, 360) },
        uShadowTint: { value: new Color(pal.shadowTint) },
        uHighlightTint: { value: new Color(pal.highlightTint) },
        uExposure: { value: 1.12 },
        uBloomStrength: { value: pal.bloomStrength },
        uDither: { value: pal.dither },
        uContrast: { value: pal.contrast },
        uSaturation: { value: pal.saturation },
        uVignette: { value: pal.vignette },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.passScene = new Scene();
    this.passMesh = new Mesh(this.quadGeo, this.compositeMat);
    this.passMesh.frustumCulled = false;
    this.passScene.add(this.passMesh);
  }

  setBiomeGrade(biomeId) {
    const pal = getBiomePalette(biomeId);
    const u = this.compositeMat.uniforms;
    u.uShadowTint.value.setHex(pal.shadowTint);
    u.uHighlightTint.value.setHex(pal.highlightTint);
    u.uBloomStrength.value = this.bloomEnabled ? pal.bloomStrength : 0;
    u.uDither.value = pal.dither;
    u.uContrast.value = pal.contrast;
    u.uSaturation.value = pal.saturation;
    u.uVignette.value = pal.vignette;
    this.prefilterMat.uniforms.uThreshold.value = pal.bloomThreshold;
  }

  resize(cssW, cssH) {
    const { pxW, pxH } = computePixelResolution(cssW, cssH);
    if (pxW === this.pxW && pxH === this.pxH && this.sceneTarget) return;
    this.pxW = pxW;
    this.pxH = pxH;
    this.disposeTargets();

    // Detect float/half-float support cleanly; fallback to UnsignedByteType if needed (e.g. headless mocks).
    const caps = this.renderer.capabilities;
    const useHalfFloat = Boolean(caps?.isWebGL2 || this.renderer.extensions?.has?.("EXT_color_buffer_half_float"));
    const texType = useHalfFloat ? HalfFloatType : UnsignedByteType;

    this.sceneTarget = new WebGLRenderTarget(pxW, pxH, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      type: texType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.sceneTarget.texture.generateMipmaps = false;

    const bw = Math.max(80, Math.floor(pxW / 2));
    const bh = Math.max(50, Math.floor(pxH / 2));
    const bloomOpts = {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      type: texType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.bloomA = new WebGLRenderTarget(bw, bh, bloomOpts);
    this.bloomB = new WebGLRenderTarget(bw, bh, bloomOpts);
    this.bloomA.texture.generateMipmaps = false;
    this.bloomB.texture.generateMipmaps = false;

    this.blurMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    this.compositeMat.uniforms.uPixelRes.value.set(pxW, pxH);
    this.compositeMat.uniforms.tScene.value = this.sceneTarget.texture;
    this.compositeMat.uniforms.tBloom.value = this.bloomA.texture;
    this.prefilterMat.uniforms.tScene.value = this.sceneTarget.texture;
  }

  render(scene, camera, exposure = 1.12) {
    if (!this.enabled || !this.sceneTarget) {
      this.renderer.render(scene, camera);
      return;
    }
    const gl = this.renderer;
    const prevTarget = gl.getRenderTarget();

    // 1. Render full 3D scene into low-res crisp HDR target
    gl.setRenderTarget(this.sceneTarget);
    gl.clear(true, true, false);
    gl.render(scene, camera);

    // 2. Dual-pass bloom over emissives & specular highlights
    if (this.bloomEnabled && this.bloomA && this.bloomB) {
      this.passMesh.material = this.prefilterMat;
      gl.setRenderTarget(this.bloomA);
      gl.render(this.passScene, this.orthoCam);

      this.passMesh.material = this.blurMat;
      this.blurMat.uniforms.uDir.value.set(1, 0);
      this.blurMat.uniforms.tInput.value = this.bloomA.texture;
      gl.setRenderTarget(this.bloomB);
      gl.render(this.passScene, this.orthoCam);

      this.blurMat.uniforms.uDir.value.set(0, 1);
      this.blurMat.uniforms.tInput.value = this.bloomB.texture;
      gl.setRenderTarget(this.bloomA);
      gl.render(this.passScene, this.orthoCam);
    }

    // 3. Nearest-neighbor upscale composite + neutral tone map + Bayer dithering to screen
    this.compositeMat.uniforms.uExposure.value = exposure;
    this.passMesh.material = this.compositeMat;
    gl.setRenderTarget(prevTarget);
    gl.render(this.passScene, this.orthoCam);
  }

  disposeTargets() {
    this.sceneTarget?.dispose();
    this.bloomA?.dispose();
    this.bloomB?.dispose();
    this.sceneTarget = null;
    this.bloomA = null;
    this.bloomB = null;
  }

  dispose() {
    this.disposeTargets();
    this.quadGeo.dispose();
    this.prefilterMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
  }
}
