// Custom zero-dependency GPU-First WebGL2 Engine v2 for Riftline.
// Features:
// - Shared std140 FrameUniforms UBO (1 upload/frame across all scene & shadow shaders)
// - Stateless GPU Ring-Buffer Particle & Ballistic Debris rendering (0.0 ms CPU stepping)
// - Compact 48-byte Actor Instancing + Zero-Draw-Call GPU Sub-Part Vertex Animation
// - 256x256 GPU Arena Wake Field FBO (footprints, snow-plows, puddle/bog/astral ripples, parting flora)
// - Texel-snapped camera shadow cascade + 4-tap rotated Poisson sampler2DShadow PCF
// - Frozen static scene subtrees + world bounding-sphere frustum culling + smooth adaptive offscreen scaling

import { Color, Mat4, Vec3 } from "./math.js";
import { plane } from "./geometry.js";
import { Node } from "./scene.js";
import {
  shadowProgram,
  stylizedProgram,
  floorProgram,
  emissiveProgram,
  auroraProgram,
  aegisProgram,
  flameProgram,
  abilityWaveProgram,
  abilityFieldProgram,
  abilityCoreProgram,
  hazardSurfaceProgram,
  zoneTelegraphProgram,
  floorMarkProgram,
  smokeProgram,
  gpuParticleProgram,
  gpuDebrisProgram,
  wakeDecayProgram,
  wakeStampProgram,
  bloomPrefilterProgram,
  bloomKawaseProgram,
  postCompositeProgram,
} from "./shaders.js";

// Surface atlas tile (col, row), rim strength, specular exponent, delicate dark-ink contour strength
const SURFACE_SPEC = {
  metal: [0, 0, 0.36, 56, 0.56],
  armor: [1, 0, 0.38, 44, 0.62],
  organic: [2, 0, 0.24, 24, 0.58],
  rubber: [0, 1, 0.14, 14, 0.48],
  basalt: [0, 1, 0.18, 22, 0.44],
  wood: [1, 1, 0.18, 20, 0.5],
  stone: [1, 1, 0.2, 26, 0.46],
  sandstone: [1, 1, 0.18, 24, 0.46],
  ice: [2, 1, 0.44, 72, 0.32],
  crystal: [2, 1, 0.48, 84, 0.34],
  dust: [0, 1, 0.08, 12, 0.0],
};

function _sortOpaque(a, b) {
  return a.renderOrder - b.renderOrder || a._cachedProg.id - b._cachedProg.id;
}

function _sortTrans(a, b) {
  return (
    a.renderOrder - b.renderOrder ||
    a.material._blendRank - b.material._blendRank ||
    a._cachedProg.id - b._cachedProg.id
  );
}

function _extractFrustumPlanes(mat, out) {
  const m = mat.elements;
  // Left, Right, Bottom, Top, Near, Far (Gribb-Hartmann column-major, zero array allocations)
  out[0] = m[3] + m[0];
  out[1] = m[7] + m[4];
  out[2] = m[11] + m[8];
  out[3] = m[15] + m[12];
  out[4] = m[3] - m[0];
  out[5] = m[7] - m[4];
  out[6] = m[11] - m[8];
  out[7] = m[15] - m[12];
  out[8] = m[3] + m[1];
  out[9] = m[7] + m[5];
  out[10] = m[11] + m[9];
  out[11] = m[15] + m[13];
  out[12] = m[3] - m[1];
  out[13] = m[7] - m[5];
  out[14] = m[11] - m[9];
  out[15] = m[15] - m[13];
  out[16] = m[3] + m[2];
  out[17] = m[7] + m[6];
  out[18] = m[11] + m[10];
  out[19] = m[15] + m[14];
  out[20] = m[3] - m[2];
  out[21] = m[7] - m[6];
  out[22] = m[11] - m[10];
  out[23] = m[15] - m[14];
  for (let i = 0; i < 24; i += 4) {
    const nx = out[i];
    const ny = out[i + 1];
    const nz = out[i + 2];
    const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    out[i] = nx * inv;
    out[i + 1] = ny * inv;
    out[i + 2] = nz * inv;
    out[i + 3] *= inv;
  }
}

function _sphereInFrustum(planes, s) {
  const x = s.x;
  const y = s.y;
  const z = s.z;
  const negR = -s.r;
  for (let i = 0; i < 24; i += 4) {
    if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < negR) return false;
  }
  return true;
}

function _cacheLinearColor(col) {
  if (col._cr !== col.r || col._cg !== col.g || col._cb !== col.b) {
    col._cr = col.r;
    col._cg = col.g;
    col._cb = col.b;
    col._lr = col.r > 0 ? Math.pow(col.r, 2.2) : 0;
    col._lg = col.g > 0 ? Math.pow(col.g, 2.2) : 0;
    col._lb = col.b > 0 ? Math.pow(col.b, 2.2) : 0;
  }
}

function compileShader(gl, type, src, label, cache = null) {
  const key = cache ? `${type}:${src}` : "";
  if (cache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`WebGL2 shader compile failed (${label}): ${info}`);
  }
  if (cache) cache.set(key, s);
  return s;
}

function createProgram(gl, vsSrc, fsSrc, label, cache = null) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, `${label}:vs`, cache);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}:fs`, cache);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!cache) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`WebGL2 program link failed (${label}): ${info}`);
  }
  const uboIdx = gl.getUniformBlockIndex(prog, "FrameUniforms");
  if (uboIdx !== gl.INVALID_INDEX) {
    gl.uniformBlockBinding(prog, uboIdx, 0);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const loc = gl.getUniformLocation(prog, info.name);
    if (!loc) continue;
    const name = info.name.replace(/\[0\]$/, "");
    uniforms[name] = loc;
  }
  // Bind static sampler texture units once at program link time
  gl.useProgram(prog);
  if (uniforms.uShadowMap) gl.uniform1i(uniforms.uShadowMap, 0);
  if (uniforms.uTerrainAtlas) gl.uniform1i(uniforms.uTerrainAtlas, 1);
  if (uniforms.uSurfaceAtlas) gl.uniform1i(uniforms.uSurfaceAtlas, 2);
  if (uniforms.uVfxAtlas) gl.uniform1i(uniforms.uVfxAtlas, 3);
  if (uniforms.uOcclusion) gl.uniform1i(uniforms.uOcclusion, 4);
  if (uniforms.uWakeMap) gl.uniform1i(uniforms.uWakeMap, 5);
  if (uniforms.uSrc) gl.uniform1i(uniforms.uSrc, 0);
  if (uniforms.uScene) gl.uniform1i(uniforms.uScene, 0);
  if (uniforms.uBloom) gl.uniform1i(uniforms.uBloom, 1);
  gl.useProgram(null);
  return { program: prog, uniforms, label, id: 0, cache: Object.create(null), modelIdent: false };
}

function _defaultShadowSize(requested) {
  if (requested) return requested;
  const isCoarse =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)")?.matches ||
      (window.matchMedia?.("(any-pointer: coarse)")?.matches && !window.matchMedia?.("(pointer: fine)")?.matches) ||
      window.innerWidth < 820);
  return isCoarse ? 1024 : 2048;
}

export class WebGL2Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.pixelWidth = 1;
    this.pixelHeight = 1;
    this.renderScale = 1;
    this.rtWidth = 1;
    this.rtHeight = 1;
    this.adaptiveScale = opts.adaptiveScale !== false;
    this.targetFrameMs = opts.targetFrameMs || 16.67;
    this._emaMs = 12;
    this._emaWorkMs = 2;
    this._lastFrameTs = 0;
    this._overBudgetStreak = 0;
    this._underBudgetStreak = 0;
    this._lastScaleChangeTs = 0;

    this.clearColor = new Color(0x0b111c);
    this.clearAlpha = 1;
    this.shadowMap = { enabled: true, size: _defaultShadowSize(opts.shadowSize) };
    this.info = {
      render: {
        frame: 0,
        calls: 0,
        triangles: 0,
        instances: 0,
        culled: 0,
        programSwitches: 0,
        uboUploads: 0,
        matrixUpdates: 0,
        renderScale: 1,
      },
    };
    this.flash = 0;
    this.postEnabled = opts.post !== false;
    this.textures = { terrain: null, surface: null, vfx: null, occlusion: null };

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 context unavailable");
    this.gl = gl;

    this.hdrExt = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
    this.linearExt = gl.getExtension("OES_texture_half_float_linear");

    this.programs = new Map();
    this._shaderCache = new Map();
    this._ctxGen = 1;
    this._wakeHoldT = 0;
    this.dummyVao = gl.createVertexArray();
    this.whiteTex = this._makeSolidTex(255, 255, 255, 255);
    this.zeroTex = this._makeSolidTex(0, 0, 0, 0);
    this.shadowFallbackTex = this._makeShadowFallbackTex();
    this.shadowTarget = null;
    this.msaaTarget = null;
    this.hdrTarget = null;
    this.bloomA = null;
    this.bloomB = null;

    // Shared std140 FrameUniforms UBO (148 floats = 592 bytes)
    this._uboData = new Float32Array(148);
    this.frameUbo = null;

    // 256x256 GPU Arena Wake Field ping-pong FBOs + instanced stamp buffer
    this.wakeA = null;
    this.wakeB = null;
    this.wakeFlip = 0;
    this.wakeReset = true;
    this._lastWakeTime = 0;
    this._wakeStamps = new Float32Array(128 * 8);
    this._wakeCount = 0;
    this._wakeVao = null;
    this._wakePosBuf = null;
    this._wakeIdxBuf = null;
    this._wakeStampBuf = null;

    // Preallocated scratch buffers (zero per-frame allocations)
    this._shadowsStatic = [];
    this._shadowsInst = [];
    this._shadowsCompact = [];
    this._shadowsDebris = [];
    this._opaque = [];
    this._trans = [];
    this._camPlanes = new Float32Array(24);
    this._shadowPlanes = new Float32Array(24);
    this._lightEye = new Vec3();
    this._lightOrigin = new Vec3(0, 0, 0);
    this._lightUp = new Vec3(0, 1, 0);
    this._lightCam = new Mat4();
    this._lightView = new Mat4();
    this._lightProj = new Mat4();
    this._lightSpace = new Mat4();
    this._identity = new Mat4();
    this._nextProgId = 1;

    // Cached GL state
    this._curProg = null;
    this._curVao = null;
    this._curBlend = "";
    this._curDepthWrite = null;
    this._curDepthTest = null;
    this._curCull = null;
    this._shadowDepthAttach = [gl.DEPTH_ATTACHMENT];
    this._msaaInvalidate = [gl.DEPTH_ATTACHMENT, gl.COLOR_ATTACHMENT0];

    this._initUbo();
    this._initWakeTargets();
    this._initShadowTarget();
    this._initContextHandlers();
  }

  _initUbo() {
    const gl = this.gl;
    if (this.frameUbo) gl.deleteBuffer(this.frameUbo);
    this.frameUbo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameUbo);
    gl.bufferData(gl.UNIFORM_BUFFER, this._uboData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.frameUbo);
  }

  _initWakeTargets() {
    const gl = this.gl;
    this._deleteTarget(this.wakeA);
    this._deleteTarget(this.wakeB);
    this.wakeA = this._createColorTarget(256, 256, false, false);
    this.wakeB = this._createColorTarget(256, 256, false, false);
    this.wakeFlip = 0;
    this.wakeReset = true;

    if (this._wakeVao) gl.deleteVertexArray(this._wakeVao);
    if (this._wakePosBuf) gl.deleteBuffer(this._wakePosBuf);
    if (this._wakeIdxBuf) gl.deleteBuffer(this._wakeIdxBuf);
    if (this._wakeStampBuf) gl.deleteBuffer(this._wakeStampBuf);

    const q = plane(1, 1, 1, 1);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, q.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, q.indices, gl.STATIC_DRAW);

    const stampBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, stampBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this._wakeStamps.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
    this._curVao = null;
    this._wakeVao = vao;
    this._wakePosBuf = posBuf;
    this._wakeIdxBuf = idxBuf;
    this._wakeStampBuf = stampBuf;
  }

  stampWake(x, z, radius = 0.8, strength = 1, track = 0.5, ripple = 0.6, impulse = 0.6, glow = 0.25) {
    if (this._wakeCount >= 128) return;
    const o = this._wakeCount++ * 8;
    const s = this._wakeStamps;
    s[o] = x;
    s[o + 1] = z;
    s[o + 2] = radius;
    s[o + 3] = strength;
    s[o + 4] = track;
    s[o + 5] = ripple;
    s[o + 6] = impulse;
    s[o + 7] = glow;
  }

  clearWake() {
    this.wakeReset = true;
    this._wakeCount = 0;
  }

  _initContextHandlers() {
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._ctxGen++;
      this._curVao = null;
      this.programs.clear();
      this.shadowTarget = null;
      this.msaaTarget = null;
      this.hdrTarget = null;
      this.bloomA = null;
      this.bloomB = null;
      this.wakeA = null;
      this.wakeB = null;
      this.frameUbo = null;
      this.whiteTex = null;
      this.zeroTex = null;
      this.shadowFallbackTex = null;
      this._shaderCache.clear();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this._ctxGen++;
      this._curVao = null;
      const gl = this.gl;
      this.hdrExt = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
      this.linearExt = gl.getExtension("OES_texture_half_float_linear");
      this.dummyVao = gl.createVertexArray();
      this.whiteTex = this._makeSolidTex(255, 255, 255, 255);
      this.zeroTex = this._makeSolidTex(0, 0, 0, 0);
      this.shadowFallbackTex = this._makeShadowFallbackTex();
      this._initUbo();
      this._initWakeTargets();
      this._initShadowTarget();
      this._initPostTargets();
    });
  }

  getContext() {
    return this.gl;
  }

  setPixelRatio(dpr) {
    this.dpr = Math.max(1, dpr || 1);
  }

  setClearColor(color, alpha = 1) {
    if (typeof color === "number") this.clearColor.setHex(color);
    else if (color) this.clearColor.copy(color);
    this.clearAlpha = alpha;
  }

  setSize(w, h, updateStyle = true) {
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    const pw = Math.max(1, Math.floor(this.width * this.dpr));
    const ph = Math.max(1, Math.floor(this.height * this.dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    if (updateStyle) {
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
    }
    if (this.pixelWidth !== pw || this.pixelHeight !== ph || !this.hdrTarget) {
      this.pixelWidth = pw;
      this.pixelHeight = ph;
      this._initPostTargets();
    }
  }

  _makeSolidTex(r, g, b, a) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _makeShadowFallbackTex() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 1, 1, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    return tex;
  }

  _initShadowTarget(requestedSize) {
    const gl = this.gl;
    if (this.shadowTarget) {
      gl.deleteFramebuffer(this.shadowTarget.fbo);
      gl.deleteTexture(this.shadowTarget.depthTex);
      this.shadowTarget = null;
    }
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    const size = Math.min(requestedSize || this.shadowMap.size || 2048, maxTex >= 2048 ? 2048 : 1024);
    const depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && size > 1024) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(depthTex);
      this.shadowMap.size = 1024;
      return this._initShadowTarget(1024);
    }
    this.shadowMap.size = size;
    this.shadowTarget = ok ? { fbo, depthTex, size } : null;
  }

  _createMsaaTarget(w, h, useHalf) {
    const gl = this.gl;
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
    const wantSamples = this.dpr >= 1.5 ? 2 : 4;
    const samples = Math.min(wantSamples, maxSamples);
    if (samples < 2) return null;
    const internalFmt = useHalf ? gl.RGBA16F : gl.RGBA8;
    const fbo = gl.createFramebuffer();
    const colorRb = gl.createRenderbuffer();
    const depthRb = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.bindRenderbuffer(gl.RENDERBUFFER, colorRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internalFmt, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRb);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fbo);
      gl.deleteRenderbuffer(colorRb);
      gl.deleteRenderbuffer(depthRb);
      return null;
    }
    return { fbo, colorRb, depthRb, width: w, height: h, samples, isHalf: useHalf };
  }

  _createColorTarget(w, h, withDepth, forceHalf = null) {
    const gl = this.gl;
    const useHalf = forceHalf !== null ? forceHalf : !!this.hdrExt;
    const internalFmt = useHalf ? gl.RGBA16F : gl.RGBA8;
    const type = useHalf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let depthRb = null;
    if (withDepth) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && useHalf) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      if (depthRb) gl.deleteRenderbuffer(depthRb);
      this.hdrExt = null;
      return this._createColorTarget(w, h, withDepth, false);
    }
    return { fbo, tex, depthRb, width: w, height: h, isHalf: useHalf };
  }

  _deleteTarget(t) {
    if (!t) return;
    const gl = this.gl;
    if (t.fbo) gl.deleteFramebuffer(t.fbo);
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.colorRb) gl.deleteRenderbuffer(t.colorRb);
    if (t.depthRb) gl.deleteRenderbuffer(t.depthRb);
  }

  _initPostTargets() {
    this._deleteTarget(this.msaaTarget);
    this._deleteTarget(this.hdrTarget);
    this._deleteTarget(this.bloomA);
    this._deleteTarget(this.bloomB);
    this.msaaTarget = null;
    const rw = Math.max(2, Math.round(this.pixelWidth * this.renderScale));
    const rh = Math.max(2, Math.round(this.pixelHeight * this.renderScale));
    this.rtWidth = rw;
    this.rtHeight = rh;
    let msaa = this.hdrExt ? this._createMsaaTarget(rw, rh, true) : null;
    if (!msaa) msaa = this._createMsaaTarget(rw, rh, false);
    let hdr = this._createColorTarget(rw, rh, !msaa, msaa ? msaa.isHalf : !!this.hdrExt);
    if (msaa && hdr.isHalf !== msaa.isHalf) {
      this._deleteTarget(msaa);
      msaa = this._createMsaaTarget(rw, rh, hdr.isHalf);
      if (!msaa) {
        this._deleteTarget(hdr);
        hdr = this._createColorTarget(rw, rh, true, hdr.isHalf);
      }
    }
    this.msaaTarget = msaa;
    this.hdrTarget = hdr;
    const bw = Math.max(2, rw >> 1);
    const bh = Math.max(2, rh >> 1);
    this.bloomA = this._createColorTarget(bw, bh, false);
    this.bloomB = this._createColorTarget(Math.max(2, bw >> 1), Math.max(2, bh >> 1), false);
  }

  setTargetFps(fps) {
    this.targetFrameMs = fps && fps > 0 ? 1000 / fps : 16.67;
    this._overBudgetStreak = 0;
  }

  _updateAdaptiveScale(lastWorkMs = 0) {
    if (!this.adaptiveScale) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (!now) return;
    if (lastWorkMs > 0 && lastWorkMs < 100) {
      this._emaWorkMs += (lastWorkMs - this._emaWorkMs) * 0.15;
    }
    if (this._lastFrameTs > 0) {
      const dtMs = now - this._lastFrameTs;
      if (dtMs > 2 && dtMs < 120) {
        this._emaMs += (dtMs - this._emaMs) * 0.12;
        const targetMs = this.targetFrameMs || 16.67;
        // Detect external 30 FPS cap (~33.3ms interval) when actual CPU/GPU submission work is well under budget
        const isCapped30 = dtMs >= 29 && dtMs <= 37.5 && this._emaWorkMs < 11.5;
        const effTargetMs = isCapped30 ? Math.max(targetMs, 33.34) : targetMs;
        const overThresh = effTargetMs * 1.28;
        const underThresh = effTargetMs * 0.68;
        if (this._emaMs > overThresh && dtMs > effTargetMs * 1.2 && !isCapped30) {
          this._overBudgetStreak++;
          this._underBudgetStreak = 0;
        } else if ((this._emaMs < underThresh && dtMs < effTargetMs * 0.75) || (isCapped30 && this._emaWorkMs < 7.5)) {
          this._underBudgetStreak++;
          this._overBudgetStreak = 0;
        } else {
          this._overBudgetStreak = 0;
          this._underBudgetStreak = 0;
        }
        if (now - this._lastScaleChangeTs > 1500) {
          if (this._overBudgetStreak > 28 && this.renderScale > 0.76) {
            this.renderScale = this.renderScale > 0.9 ? 0.875 : 0.75;
            this._lastScaleChangeTs = now;
            this._overBudgetStreak = 0;
            this._initPostTargets();
          } else if (this._underBudgetStreak > 75 && this.renderScale < 0.99) {
            this.renderScale = this.renderScale < 0.8 ? 0.875 : 1;
            this._lastScaleChangeTs = now;
            this._underBudgetStreak = 0;
            this._initPostTargets();
          }
        }
      }
    }
    this._lastFrameTs = now;
  }

  _getProgram(key) {
    let p = this.programs.get(key);
    if (p) return p;
    let src;
    switch (key) {
      case "shadow":
        src = shadowProgram(false);
        break;
      case "shadow_inst":
        src = shadowProgram("mat4");
        break;
      case "shadow_compact":
        src = shadowProgram("compact");
        break;
      case "shadow_debris":
        src = shadowProgram("debris");
        break;
      case "stylized":
        src = stylizedProgram(false);
        break;
      case "stylized_inst":
        src = stylizedProgram("mat4");
        break;
      case "stylized_compact":
        src = stylizedProgram("compact");
        break;
      case "floor":
        src = floorProgram();
        break;
      case "emissive":
        src = emissiveProgram(false);
        break;
      case "emissive_inst":
        src = emissiveProgram("mat4");
        break;
      case "emissive_compact":
        src = emissiveProgram("compact");
        break;
      case "aurora":
        src = auroraProgram();
        break;
      case "aegis":
        src = aegisProgram();
        break;
      case "flame_inst":
        src = flameProgram();
        break;
      case "abilityWave_inst":
        src = abilityWaveProgram();
        break;
      case "abilityField_inst":
        src = abilityFieldProgram();
        break;
      case "abilityCore_inst":
        src = abilityCoreProgram();
        break;
      case "zoneTelegraph_inst":
        src = zoneTelegraphProgram();
        break;
      case "floorMark_inst":
        src = floorMarkProgram();
        break;
      case "smoke_inst":
        src = smokeProgram();
        break;
      case "gpuParticle":
        src = gpuParticleProgram();
        break;
      case "gpuDebris":
        src = gpuDebrisProgram();
        break;
      case "wakeDecay":
        src = wakeDecayProgram();
        break;
      case "wakeStamp":
        src = wakeStampProgram();
        break;
      case "bloomPrefilter":
        src = bloomPrefilterProgram();
        break;
      case "bloomKawase":
        src = bloomKawaseProgram();
        break;
      case "postComposite":
        src = postCompositeProgram();
        break;
      default:
        if (key.startsWith("floor_")) {
          src = floorProgram(Number(key.slice(6)));
        } else if (key.startsWith("hazard_")) {
          src = hazardSurfaceProgram(key.slice(7).replace("_inst", ""));
        } else {
          src = stylizedProgram(key.endsWith("_compact") ? "compact" : key.endsWith("_inst") ? "mat4" : false);
        }
    }
    p = createProgram(this.gl, src.vs, src.fs, key, this._shaderCache);
    this._curProg = null;
    p.id = this._nextProgId++;
    this.programs.set(key, p);
    return p;
  }

  _useProgram(p) {
    if (this._curProg !== p) {
      this.gl.useProgram(p.program);
      this._curProg = p;
      this.info.render.programSwitches++;
    }
  }

  _bindVao(vao) {
    if (this._curVao !== vao) {
      this.gl.bindVertexArray(vao);
      this._curVao = vao;
    }
  }

  _syncTexture(texObj) {
    if (!texObj || !texObj.ready) return this.whiteTex;
    const gl = this.gl;
    const ctxGen = this._ctxGen;
    if (
      texObj._gpu &&
      texObj._gpu.gl === gl &&
      texObj._gpu.ctxGen === ctxGen &&
      texObj._gpu.version === texObj.version
    ) {
      return texObj._gpu.tex;
    }
    const tex =
      texObj._gpu && texObj._gpu.gl === gl && texObj._gpu.ctxGen === ctxGen ? texObj._gpu.tex : gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texObj.flipY ? 1 : 0);
    if (texObj.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texObj.image);
      gl.generateMipmap(gl.TEXTURE_2D);
    } else if (texObj.data) {
      if (texObj.format === "r8") {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, texObj.width, texObj.height, 0, gl.RED, gl.UNSIGNED_BYTE, texObj.data);
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          texObj.width,
          texObj.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          texObj.data,
        );
      }
    }
    const wrap = texObj.wrap === "clamp" ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    const minF = texObj.image ? gl.LINEAR_MIPMAP_LINEAR : texObj.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    const magF = texObj.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minF);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magF);
    texObj._gpu = { gl, ctxGen, tex, version: texObj.version };
    return tex;
  }

  _bindBaseAttribs(gl, base) {
    gl.bindBuffer(gl.ARRAY_BUFFER, base.vboPos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, base.vboNorm);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, base.vboUv);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    if (base.vboCol) {
      gl.bindBuffer(gl.ARRAY_BUFFER, base.vboCol);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib3f(3, 1, 1, 1);
    }

    if (base.vboPart) {
      gl.bindBuffer(gl.ARRAY_BUFFER, base.vboPart);
      gl.enableVertexAttribArray(10);
      gl.vertexAttribPointer(10, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(10);
      gl.vertexAttrib4f(10, 0, 0, 0, 0);
    }

    if (base.ibo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, base.ibo);
  }

  _ensureGeometry(geo) {
    const gl = this.gl;
    const ctxGen = this._ctxGen;
    if (geo._gpu && geo._gpu.gl === gl && geo._gpu.ctxGen === ctxGen && geo._gpu.version === geo.version)
      return geo._gpu;
    if (geo._gpu && geo._gpu.gl === gl && geo._gpu.ctxGen === ctxGen) geo.dispose();

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vboPos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const vboNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboNorm);
    gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const vboUv = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboUv);
    gl.bufferData(gl.ARRAY_BUFFER, geo.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    let vboCol = null;
    if (geo.colors) {
      vboCol = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vboCol);
      gl.bufferData(gl.ARRAY_BUFFER, geo.colors, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib3f(3, 1, 1, 1);
    }

    let vboPart = null;
    if (geo.partMeta) {
      vboPart = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vboPart);
      gl.bufferData(gl.ARRAY_BUFFER, geo.partMeta, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(10);
      gl.vertexAttribPointer(10, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(10);
      gl.vertexAttrib4f(10, 0, 0, 0, 0);
    }

    let ibo = null;
    let indexType = gl.UNSIGNED_SHORT;
    let count = geo.vertexCount;
    if (geo.indices) {
      ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
      indexType = geo.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      count = geo.indices.length;
    }

    gl.bindVertexArray(null);
    this._curVao = null;
    geo._gpu = {
      gl,
      ctxGen,
      vao,
      vboPos,
      vboNorm,
      vboUv,
      vboCol,
      vboPart,
      ibo,
      indexType,
      count,
      version: geo.version,
    };
    return geo._gpu;
  }

  _ensureInstanced(node) {
    if (node.isCompactInstanced) return this._ensureCompactInstanced(node);
    if (node.isGpuRingMesh) return this._ensureGpuRing(node);

    const gl = this.gl;
    const ctxGen = this._ctxGen;
    const base = this._ensureGeometry(node.geometry);
    if (
      !node._gpuInst ||
      node._gpuInst.gl !== gl ||
      node._gpuInst.ctxGen !== ctxGen ||
      node._gpuInst.geoVersion !== base.version
    ) {
      if (node._gpuInst && node._gpuInst.gl === gl && node._gpuInst.ctxGen === ctxGen) node.dispose();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this._bindBaseAttribs(gl, base);

      const matBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, matBuf);
      gl.bufferData(gl.ARRAY_BUFFER, node.instanceMatrix.byteLength, gl.DYNAMIC_DRAW);
      for (let c = 0; c < 4; c++) {
        gl.enableVertexAttribArray(4 + c);
        gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 64, c * 16);
        gl.vertexAttribDivisor(4 + c, 1);
      }

      let colBuf = null;
      if (node.hasColor !== false) {
        colBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, node.instanceColor, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(8);
        gl.vertexAttribPointer(8, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(8, 1);
      } else {
        gl.disableVertexAttribArray(8);
        gl.vertexAttrib3f(8, 1, 1, 1);
      }

      let flashBuf = null;
      if (node.hasFlash !== false) {
        flashBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, flashBuf);
        gl.bufferData(gl.ARRAY_BUFFER, node.instanceFlash, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(9);
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(9, 1);
      } else {
        gl.disableVertexAttribArray(9);
        gl.vertexAttrib1f(9, 0);
      }

      gl.bindVertexArray(null);
      this._curVao = null;
      node._gpuInst = { gl, ctxGen, vao, matBuf, colBuf, flashBuf, geoVersion: base.version };
      node.dirtyCount = Math.max(node.dirtyCount, node.count);
    }

    if (node.dirtyCount > 0) {
      const n = Math.min(node.dirtyCount, node.max);
      const gpu = node._gpuInst;
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.matBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceMatrix, 0, n * 16);
      if (node.hasColor && gpu.colBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.colBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceColor, 0, n * 3);
      }
      if (node.hasFlash && gpu.flashBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.flashBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceFlash, 0, n);
      }
      node.dirtyCount = 0;
    }
    return { base, inst: node._gpuInst };
  }

  _ensureCompactInstanced(node) {
    const gl = this.gl;
    const ctxGen = this._ctxGen;
    const base = this._ensureGeometry(node.geometry);
    if (
      !node._gpuInst ||
      node._gpuInst.gl !== gl ||
      node._gpuInst.ctxGen !== ctxGen ||
      node._gpuInst.geoVersion !== base.version
    ) {
      if (node._gpuInst && node._gpuInst.gl === gl && node._gpuInst.ctxGen === ctxGen) node.dispose();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this._bindBaseAttribs(gl, base);

      const dataBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dataBuf);
      gl.bufferData(gl.ARRAY_BUFFER, node.instanceData.byteLength, gl.DYNAMIC_DRAW);
      for (let c = 0; c < 3; c++) {
        gl.enableVertexAttribArray(4 + c);
        gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 48, c * 16);
        gl.vertexAttribDivisor(4 + c, 1);
      }

      gl.bindVertexArray(null);
      this._curVao = null;
      node._gpuInst = { gl, ctxGen, vao, dataBuf, geoVersion: base.version };
      node.dirtyCount = Math.max(node.dirtyCount, node.count);
    }

    if (node.dirtyCount > 0) {
      const n = Math.min(node.dirtyCount, node.max);
      gl.bindBuffer(gl.ARRAY_BUFFER, node._gpuInst.dataBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceData, 0, n * 12);
      node.dirtyCount = 0;
    }
    return { base, inst: node._gpuInst };
  }

  _ensureGpuRing(node) {
    const gl = this.gl;
    const ctxGen = this._ctxGen;
    const ring = node.ring;
    const base = this._ensureGeometry(node.geometry);
    if (
      !node._gpuInst ||
      node._gpuInst.gl !== gl ||
      node._gpuInst.ctxGen !== ctxGen ||
      node._gpuInst.geoVersion !== base.version
    ) {
      if (node._gpuInst && node._gpuInst.gl === gl && node._gpuInst.ctxGen === ctxGen) ring.dispose();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this._bindBaseAttribs(gl, base);

      const dataBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dataBuf);
      gl.bufferData(gl.ARRAY_BUFFER, ring.data, gl.DYNAMIC_DRAW);
      for (let c = 0; c < 4; c++) {
        gl.enableVertexAttribArray(4 + c);
        gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 64, c * 16);
        gl.vertexAttribDivisor(4 + c, 1);
      }

      gl.bindVertexArray(null);
      this._curVao = null;
      node._gpuInst = { gl, ctxGen, vao, dataBuf, geoVersion: base.version };
      ring.d0Start = -1;
      ring.d0End = -1;
      ring.d1Start = -1;
      ring.d1End = -1;
      return { base, inst: node._gpuInst };
    }

    if (ring.d0Start >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, node._gpuInst.dataBuf);
      const count0 = ring.d0End - ring.d0Start;
      if (count0 > 0) {
        gl.bufferSubData(gl.ARRAY_BUFFER, ring.d0Start * 64, ring.data, ring.d0Start * 16, count0 * 16);
      }
      if (ring.d1Start >= 0) {
        const count1 = ring.d1End - ring.d1Start;
        if (count1 > 0) {
          gl.bufferSubData(gl.ARRAY_BUFFER, ring.d1Start * 64, ring.data, ring.d1Start * 16, count1 * 16);
        }
      }
      ring.d0Start = -1;
      ring.d0End = -1;
      ring.d1Start = -1;
      ring.d1End = -1;
    }
    return { base, inst: node._gpuInst };
  }

  _setState(mat) {
    const gl = this.gl;
    const blendKey = mat.additive ? "add" : mat.transparent ? "alpha" : "none";
    if (this._curBlend !== blendKey) {
      if (blendKey === "none") {
        gl.disable(gl.BLEND);
      } else {
        gl.enable(gl.BLEND);
        if (blendKey === "add") gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      this._curBlend = blendKey;
    }
    if (this._curDepthWrite !== mat.depthWrite) {
      gl.depthMask(mat.depthWrite);
      this._curDepthWrite = mat.depthWrite;
    }
    if (this._curDepthTest !== mat.depthTest) {
      if (mat.depthTest) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      this._curDepthTest = mat.depthTest;
    }
    const cull = !mat.doubleSide;
    if (this._curCull !== cull) {
      if (cull) gl.enable(gl.CULL_FACE);
      else gl.disable(gl.CULL_FACE);
      this._curCull = cull;
    }
  }

  _uniformLinear3(loc, col, prog = this._curProg, key = "") {
    if (!loc || !col) return;
    _cacheLinearColor(col);
    if (prog && key) {
      const c = prog.cache;
      const kr = key + "_r",
        kg = key + "_g",
        kb = key + "_b";
      if (c[kr] === col._lr && c[kg] === col._lg && c[kb] === col._lb) return;
      c[kr] = col._lr;
      c[kg] = col._lg;
      c[kb] = col._lb;
    }
    this.gl.uniform3f(loc, col._lr, col._lg, col._lb);
  }

  _uploadFrameUbo(scene, camera) {
    const gl = this.gl;
    const u = this._uboData;
    u.set(camera.viewProjMatrix.elements, 0);
    u.set(this._lightSpace.elements, 16);

    u[32] = camera.position.x;
    u[33] = camera.position.y;
    u[34] = camera.position.z;
    u[35] = scene.time;

    const cw = camera.matrixWorld.elements;
    u[36] = cw[0];
    u[37] = cw[1];
    u[38] = cw[2];
    u[39] = scene.darkness;

    u[40] = cw[4];
    u[41] = cw[5];
    u[42] = cw[6];
    u[43] = scene.biomeIndex;

    u[44] = scene.sunDir.x;
    u[45] = scene.sunDir.y;
    u[46] = scene.sunDir.z;
    u[47] = scene.sunIntensity;

    _cacheLinearColor(scene.sunColor);
    u[48] = scene.sunColor._lr;
    u[49] = scene.sunColor._lg;
    u[50] = scene.sunColor._lb;
    u[51] = this.shadowMap.enabled && this.shadowTarget ? 1 : 0;

    _cacheLinearColor(scene.hemiSky);
    u[52] = scene.hemiSky._lr;
    u[53] = scene.hemiSky._lg;
    u[54] = scene.hemiSky._lb;
    u[55] = scene.hemiIntensity;

    _cacheLinearColor(scene.hemiGround);
    const texMask =
      (this.textures.terrain?.ready ? 1 : 0) |
      (this.textures.surface?.ready ? 2 : 0) |
      (this.textures.vfx?.ready ? 4 : 0);
    u[56] = scene.hemiGround._lr;
    u[57] = scene.hemiGround._lg;
    u[58] = scene.hemiGround._lb;
    u[59] = texMask;

    u[60] = scene.fillDir.x;
    u[61] = scene.fillDir.y;
    u[62] = scene.fillDir.z;
    u[63] = scene.fillIntensity;

    _cacheLinearColor(scene.fillColor);
    u[64] = scene.fillColor._lr;
    u[65] = scene.fillColor._lg;
    u[66] = scene.fillColor._lb;
    u[67] = scene.wakeStrength ?? 1;

    _cacheLinearColor(scene.shadowTint);
    u[68] = scene.shadowTint._lr;
    u[69] = scene.shadowTint._lg;
    u[70] = scene.shadowTint._lb;
    u[71] = scene.particleClearTime ?? -1;

    _cacheLinearColor(scene.rimColor);
    u[72] = scene.rimColor._lr;
    u[73] = scene.rimColor._lg;
    u[74] = scene.rimColor._lb;
    u[75] = 0;

    _cacheLinearColor(scene.fogColor);
    u[76] = scene.fogColor._lr;
    u[77] = scene.fogColor._lg;
    u[78] = scene.fogColor._lb;
    u[79] = scene.fogNear;

    u[80] = scene.wakeHalf?.x || 22;
    u[81] = scene.wakeHalf?.y || 18;
    u[82] = scene.fogFar;
    u[83] = this.wakeA && this.wakeB ? (scene.wakeEnabled ?? 1) : 0;

    let maxActive = 0;
    for (let i = 0; i < 8; i++) {
      const l = scene.pointLights[i];
      const po = 84 + i * 4;
      const co = 116 + i * 4;
      u[po] = l.x;
      u[po + 1] = l.y;
      u[po + 2] = l.z;
      u[po + 3] = l.radius;
      if (l.intensity > 0.001) {
        u[co] = l.r > 0 ? Math.pow(l.r, 2.2) : 0;
        u[co + 1] = l.g > 0 ? Math.pow(l.g, 2.2) : 0;
        u[co + 2] = l.b > 0 ? Math.pow(l.b, 2.2) : 0;
        u[co + 3] = l.intensity;
        maxActive = i + 1;
      } else {
        u[co] = 0;
        u[co + 1] = 0;
        u[co + 2] = 0;
        u[co + 3] = 0;
      }
    }
    u[75] = maxActive;

    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameUbo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, u);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.frameUbo);
    this.info.render.uboUploads = 1;
  }

  _updateWakeField(scene) {
    if (!this.wakeA || !this.wakeB) {
      this._wakeCount = 0;
      return this.zeroTex;
    }
    const gl = this.gl;
    if (this.wakeReset) {
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.wakeA.fbo);
      gl.viewport(0, 0, 256, 256);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.wakeB.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.wakeReset = false;
      this._wakeHoldT = 0;
      this._lastWakeTime = scene.time;
    }

    const rawDt = scene.time - this._lastWakeTime;
    const dt = rawDt > 0 && rawDt < 0.25 ? rawDt : 1 / 60;
    this._lastWakeTime = scene.time;

    if (this._wakeCount > 0) {
      this._wakeHoldT = 12;
    } else if (this._wakeHoldT <= 0) {
      return this.zeroTex;
    } else {
      this._wakeHoldT = Math.max(0, this._wakeHoldT - dt);
    }

    const src = this.wakeFlip === 0 ? this.wakeA : this.wakeB;
    const dst = this.wakeFlip === 0 ? this.wakeB : this.wakeA;
    this.wakeFlip ^= 1;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, 256, 256);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    const dec = this._getProgram("wakeDecay");
    this._useProgram(dec);
    this._bindVao(this.dummyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform4f(
      dec.uniforms.uDecay,
      Math.exp(-dt * 0.52),
      Math.exp(-dt * 2.15),
      Math.exp(-dt * 3.6),
      Math.exp(-dt * 1.35),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this._wakeCount > 0) {
      const st = this._getProgram("wakeStamp");
      this._useProgram(st);
      this._bindVao(this._wakeVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._wakeStampBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._wakeStamps, 0, this._wakeCount * 8);
      gl.uniform2f(st.uniforms.uWakeHalfSpan, scene.wakeHalf?.x || 22, scene.wakeHalf?.y || 18);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, this._wakeCount);
      gl.disable(gl.BLEND);
      this._wakeCount = 0;
    }

    this._curBlend = "none";
    this._curDepthTest = false;
    this._curDepthWrite = false;
    this._curCull = false;
    return dst.tex;
  }

  _u1f(prog, name, val) {
    const loc = prog.uniforms[name];
    if (loc && prog.cache[name] !== val) {
      prog.cache[name] = val;
      this.gl.uniform1f(loc, val);
    }
  }

  _u1i(prog, name, val) {
    const loc = prog.uniforms[name];
    if (loc && prog.cache[name] !== val) {
      prog.cache[name] = val;
      this.gl.uniform1i(loc, val);
    }
  }

  _uModel(prog, node) {
    const loc = prog.uniforms.uModel;
    if (!loc) return;
    if (node._worldIdentity) {
      if (!prog.modelIdent) {
        this.gl.uniformMatrix4fv(loc, false, this._identity.elements);
        prog.modelIdent = true;
      }
      return;
    }
    prog.modelIdent = false;
    this.gl.uniformMatrix4fv(loc, false, node.worldMatrix.elements);
  }

  _drawNode(node) {
    const gl = this.gl;
    const mat = node.material;
    const inst = !!node.isInstancedMesh;
    const prog = node._cachedProg;
    this._useProgram(prog);
    this._setState(mat);
    const u = prog.uniforms;
    this._uModel(prog, node);

    if (mat.shader === "stylized") {
      const spec = SURFACE_SPEC[mat.surface] || SURFACE_SPEC.stone;
      if (prog.cache.st0 !== spec[0] || prog.cache.st1 !== spec[1]) {
        prog.cache.st0 = spec[0];
        prog.cache.st1 = spec[1];
        gl.uniform2f(u.uSurfaceTile, spec[0], spec[1]);
      }
      this._uniformLinear3(u.uBaseColor, mat.color, prog, "uBaseColor");
      this._uniformLinear3(u.uEmissive, mat.emissive, prog, "uEmissive");
      this._u1f(prog, "uEmissiveIntensity", mat.emissiveIntensity);
      this._u1f(prog, "uOpacity", mat.opacity);
      this._u1f(prog, "uRimStrength", mat.rimStrength ?? spec[2]);
      this._u1f(prog, "uSpecPower", spec[3]);
      this._u1f(prog, "uInkStrength", mat.inkStrength ?? spec[4]);
      this._u1f(prog, "uBiomeSkin", mat.biomeSkin ? 1 : 0);
      this._u1f(prog, "uFogEnabled", mat.fog ? 1 : 0);
      this._u1f(prog, "uDustFade", mat.surface === "dust" ? 1 : 0);
      this._u1f(prog, "uUseVertexColors", mat.vertexColors ? 1 : 0);
      this._u1f(prog, "uReedWind", mat.reedWind ? 1 : 0);
      this._u1f(prog, "uWakeReact", mat.wakeReact || 0);
    } else if (mat.shader === "emissive") {
      this._uniformLinear3(u.uBaseColor, mat.color, prog, "uBaseColor");
      this._u1f(prog, "uEmissiveIntensity", mat.emissiveIntensity);
      this._u1f(prog, "uOpacity", mat.opacity);
      this._u1f(prog, "uFogEnabled", mat.fog ? 1 : 0);
      this._u1f(prog, "uAdditive", mat.additive ? 1 : 0);
      this._u1i(prog, "uSpriteTile", mat.spriteTile);
      this._u1f(prog, "uUseVertexColors", mat.vertexColors ? 1 : 0);
    } else if (mat.shader === "floor") {
      const mu = mat.uniforms;
      if (u.uHalf && mu.uHalf) {
        const hx = mu.uHalf.value.x,
          hy = mu.uHalf.value.y;
        if (prog.cache.hx !== hx || prog.cache.hy !== hy) {
          prog.cache.hx = hx;
          prog.cache.hy = hy;
          gl.uniform2f(u.uHalf, hx, hy);
        }
      }
      if (mu.uGlaze) this._uniformLinear3(u.uFloorBase, mu.uGlaze.value, prog, "uFloorBase");
      if (mu.uGrid) this._uniformLinear3(u.uFloorTrim, mu.uGrid.value, prog, "uFloorTrim");
      if (mu.uAccent) this._uniformLinear3(u.uFloorAccent, mu.uAccent.value, prog, "uFloorAccent");
      if (mu.uPulse) this._u1f(prog, "uPulse", mu.uPulse.value);
      if (mu.uStyle) this._u1f(prog, "uStyle", mu.uStyle.value);
      if (mu.uDark) this._u1f(prog, "uFloorDark", mu.uDark.value);
    } else if (mat.shader === "aegis") {
      const mu = mat.uniforms;
      if (mu.uColor) this._uniformLinear3(u.uColor, mu.uColor.value, prog, "uColor");
      if (mu.uHit) this._u1f(prog, "uHit", mu.uHit.value);
      if (mu.uFade) this._u1f(prog, "uFade", mu.uFade.value);
    } else if (mat.shader === "zoneTelegraph") {
      const mu = mat.uniforms;
      if (mu.uWarn) this._uniformLinear3(u.uWarn, mu.uWarn.value, prog, "uWarn");
    }

    if (inst) {
      const { base, inst: gpuInst } = this._ensureInstanced(node);
      this._bindVao(gpuInst.vao);
      if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
      else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
      this.info.render.calls++;
      this.info.render.triangles += (base.count / 3) * node.count;
      this.info.render.instances += node.count;
    } else {
      const base = this._ensureGeometry(node.geometry);
      this._bindVao(base.vao);
      if (base.ibo) gl.drawElements(gl.TRIANGLES, base.count, base.indexType, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, base.count);
      this.info.render.calls++;
      this.info.render.triangles += base.count / 3;
      this.info.render.instances++;
    }
  }

  _collect(node, checkShadow) {
    if (!node.visible) return;
    if (node.isMesh && node.geometry && node.material) {
      if (node.isInstancedMesh && node.count <= 0) return;
      const mat = node.material;
      const inst = !!node.isInstancedMesh;
      const casts = checkShadow && node.castShadow && !mat.transparent && !mat.additive;

      let camVis = true;
      let shadVis = casts;
      if (!inst && node.frustumCulled && mat.shader !== "floor") {
        const ws = node.getWorldSphere();
        if (ws && ws.r > 0) {
          camVis = _sphereInFrustum(this._camPlanes, ws);
          if (!camVis) this.info.render.culled++;
          if (casts) shadVis = _sphereInFrustum(this._shadowPlanes, ws);
        }
      }

      if (shadVis) {
        if (!inst) this._shadowsStatic.push(node);
        else if (node.isCompactInstanced) this._shadowsCompact.push(node);
        else if (node.isGpuDebrisMesh) this._shadowsDebris.push(node);
        else this._shadowsInst.push(node);
      }

      if (camVis) {
        let key;
        if (node.isGpuRingMesh) key = mat.shader;
        else if (node.isCompactInstanced) key = `${mat.shader}_compact`;
        else if (inst) key = `${mat.shader}_inst`;
        else key = mat.shader === "floor" ? `floor_${Math.round(mat.uniforms?.uStyle?.value ?? 5)}` : mat.shader;
        node._cachedProg = this._getProgram(key);
        if (mat.transparent || mat.additive) this._trans.push(node);
        else this._opaque.push(node);
      }
    }
    const ch = node.children;
    for (let i = 0; i < ch.length; i++) this._collect(ch[i], checkShadow);
  }

  _computeLightSpace(scene, camera) {
    const sz = this.shadowTarget ? this.shadowTarget.size : 2048;
    const extent = 23.5;
    this._lightEye.set(scene.sunDir.x * 44, scene.sunDir.y * 44, scene.sunDir.z * 44);
    this._lightCam.lookAtCamera(this._lightEye, this._lightOrigin, this._lightUp);
    this._lightView.copy(this._lightCam).invert();

    // Center ortho shadow cascade around camera target & snap to exact shadow-texel increments in light space
    const cx = Math.max(-13, Math.min(13, camera.target.x));
    const cz = Math.max(-11, Math.min(11, camera.target.z));
    const lv = this._lightView.elements;
    let lx = lv[0] * cx + lv[8] * cz + lv[12];
    let ly = lv[1] * cx + lv[9] * cz + lv[13];
    const texelWorld = (2 * extent) / sz;
    lx = Math.round(lx / texelWorld) * texelWorld;
    ly = Math.round(ly / texelWorld) * texelWorld;

    this._lightProj.makeOrthographic(lx - extent, lx + extent, ly + extent, ly - extent, 4, 96);
    this._lightSpace.multiplyMatrices(this._lightProj, this._lightView);
  }

  render(scene, camera) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const renderStart = typeof performance !== "undefined" ? performance.now() : 0;
    this._updateAdaptiveScale(this._lastWorkMs || 0);

    const stats = this.info.render;
    stats.frame++;
    stats.calls = 0;
    stats.triangles = 0;
    stats.instances = 0;
    stats.culled = 0;
    stats.programSwitches = 0;
    stats.uboUploads = 0;
    stats.renderScale = this.renderScale;

    Node._matrixUpdates = 0;
    scene.updateWorldMatrix(true);
    stats.matrixUpdates = Node._matrixUpdates;
    camera.updateMatrixWorld();

    const doShadows = !!(this.shadowMap.enabled && this.shadowTarget);
    if (doShadows) {
      this._computeLightSpace(scene, camera);
      _extractFrustumPlanes(this._lightSpace, this._shadowPlanes);
    }
    _extractFrustumPlanes(camera.viewProjMatrix, this._camPlanes);

    // Upload shared FrameUniforms UBO once per frame for all shadow & scene shaders
    this._uploadFrameUbo(scene, camera);

    this._shadowsStatic.length = 0;
    this._shadowsInst.length = 0;
    this._shadowsCompact.length = 0;
    this._shadowsDebris.length = 0;
    this._opaque.length = 0;
    this._trans.length = 0;
    this._collect(scene, doShadows);

    this._opaque.sort(_sortOpaque);
    this._trans.sort(_sortTrans);

    this._curProg = null;
    this._curVao = null;
    this._curBlend = "";
    this._curDepthWrite = null;
    this._curDepthTest = null;
    this._curCull = null;

    // 1. GPU Arena Wake Field Pass (256x256 ping-pong decay + instanced footprint/dash/blast stamps)
    const wakeTex = this._updateWakeField(scene);

    // 2. Directional Shadow Pass (texel-snapped ortho cascade, frustum-culled static + GPU-animated actors/debris)
    if (doShadows) {
      const sz = this.shadowTarget.size;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowTarget.fbo);
      gl.viewport(0, 0, sz, sz);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 1.9);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      if (this._shadowsStatic.length) {
        const spStatic = this._getProgram("shadow");
        this._useProgram(spStatic);
        for (let i = 0; i < this._shadowsStatic.length; i++) {
          const node = this._shadowsStatic[i];
          this._uModel(spStatic, node);
          const base = this._ensureGeometry(node.geometry);
          this._bindVao(base.vao);
          if (base.ibo) gl.drawElements(gl.TRIANGLES, base.count, base.indexType, 0);
          else gl.drawArrays(gl.TRIANGLES, 0, base.count);
          stats.calls++;
          stats.triangles += base.count / 3;
        }
      }
      if (this._shadowsCompact.length) {
        const spComp = this._getProgram("shadow_compact");
        this._useProgram(spComp);
        for (let i = 0; i < this._shadowsCompact.length; i++) {
          const node = this._shadowsCompact[i];
          const { base, inst } = this._ensureCompactInstanced(node);
          this._bindVao(inst.vao);
          if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
          else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
          stats.calls++;
          stats.triangles += (base.count / 3) * node.count;
        }
      }
      if (this._shadowsInst.length) {
        const spInst = this._getProgram("shadow_inst");
        this._useProgram(spInst);
        for (let i = 0; i < this._shadowsInst.length; i++) {
          const node = this._shadowsInst[i];
          this._uModel(spInst, node);
          const { base, inst } = this._ensureInstanced(node);
          this._bindVao(inst.vao);
          if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
          else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
          stats.calls++;
          stats.triangles += (base.count / 3) * node.count;
        }
      }
      if (this._shadowsDebris.length) {
        const spDeb = this._getProgram("shadow_debris");
        this._useProgram(spDeb);
        for (let i = 0; i < this._shadowsDebris.length; i++) {
          const node = this._shadowsDebris[i];
          const { base, inst } = this._ensureGpuRing(node);
          this._bindVao(inst.vao);
          if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
          else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
          stats.calls++;
          stats.triangles += (base.count / 3) * node.count;
        }
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // Bind global texture units: 0=shadow, 1=terrain, 2=surface, 3=vfx, 4=occlusion, 5=wakeMap
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, doShadows ? this.shadowTarget.depthTex : this.shadowFallbackTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.terrain));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.surface));
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.vfx));
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.occlusion));
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, wakeTex);

    // 3. Main Scene Pass (into 4x MSAA HDR renderbuffer when available, else single-sample HDR FBO)
    const usePost = this.postEnabled && this.hdrTarget && this.bloomA && this.bloomB;
    const mainFbo = usePost ? (this.msaaTarget ? this.msaaTarget.fbo : this.hdrTarget.fbo) : null;
    const mainW = usePost ? this.rtWidth : this.pixelWidth;
    const mainH = usePost ? this.rtHeight : this.pixelHeight;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mainFbo);
    gl.viewport(0, 0, mainW, mainH);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    _cacheLinearColor(this.clearColor);
    gl.clearColor(this.clearColor._lr, this.clearColor._lg, this.clearColor._lb, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._curBlend = "";
    this._curDepthWrite = true;
    this._curDepthTest = true;
    this._curCull = null;

    for (let i = 0; i < this._opaque.length; i++) this._drawNode(this._opaque[i]);
    for (let i = 0; i < this._trans.length; i++) this._drawNode(this._trans[i]);

    // 4. MSAA Resolve -> Selective Dual-Kawase Bloom -> Stylized ACES Tone-Map (+ Edge Smoothing Fallback)
    if (usePost) {
      if (this.msaaTarget) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaTarget.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hdrTarget.fbo);
        gl.blitFramebuffer(
          0,
          0,
          this.rtWidth,
          this.rtHeight,
          0,
          0,
          this.rtWidth,
          this.rtHeight,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        if (gl.invalidateFramebuffer) gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, this._msaaInvalidate);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      } else if (gl.invalidateFramebuffer) {
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, this._shadowDepthAttach);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      this._bindVao(this.dummyVao);

      // Prefilter bright emissives -> bloomA (half-res)
      const pre = this._getProgram("bloomPrefilter");
      this._useProgram(pre);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTarget.tex);
      gl.uniform1f(pre.uniforms.uThreshold, scene.bloomThreshold);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Kawase downsample -> bloomB (quarter-res)
      const kaw = this._getProgram("bloomKawase");
      this._useProgram(kaw);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fbo);
      gl.viewport(0, 0, this.bloomB.width, this.bloomB.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1f(kaw.uniforms.uOffset, 1.25);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Kawase upsample -> bloomA (half-res)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
      gl.uniform1f(kaw.uniforms.uOffset, 1.85);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Final ACES tone-mapped composite -> full-DPR canvas backbuffer
      const comp = this._getProgram("postComposite");
      this._useProgram(comp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTarget.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1f(comp.uniforms.uBloomStrength, scene.bloomStrength);
      gl.uniform1f(comp.uniforms.uFlash, this.flash);
      gl.uniform1f(comp.uniforms.uAaFallback, this.msaaTarget ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    this._bindVao(null);
    if (renderStart > 0) {
      this._lastWorkMs = performance.now() - renderStart;
    }
  }
}
