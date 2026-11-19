// Custom zero-dependency WebGL2 rendering engine for Riftline.
// Features: directional PCF shadow mapping, stylized cel/painterly forward rendering with 8 dynamic point lights,
// GPU instancing with partial bufferSubData uploads, HDR offscreen FBO, dual-Kawase selective bloom & ACES tone mapping.

import { Color, Mat4, Vec3 } from "./math.js";
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
  bloomPrefilterProgram,
  bloomKawaseProgram,
  postCompositeProgram,
} from "./shaders.js";

// Surface atlas tile (col, row), rim strength, specular exponent
const SURFACE_SPEC = {
  metal: [0, 0, 0.42, 48],
  armor: [1, 0, 0.46, 36],
  organic: [2, 0, 0.34, 20],
  rubber: [0, 1, 0.16, 12],
  basalt: [0, 1, 0.24, 18],
  wood: [1, 1, 0.22, 18],
  stone: [1, 1, 0.28, 22],
  sandstone: [1, 1, 0.26, 20],
  ice: [2, 1, 0.56, 68],
  crystal: [2, 1, 0.62, 76],
  dust: [0, 1, 0.08, 10],
};

function compileShader(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`WebGL2 shader compile failed (${label}): ${info}`);
  }
  return s;
}

function createProgram(gl, vsSrc, fsSrc, label) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, `${label}:vs`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}:fs`);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`WebGL2 program link failed (${label}): ${info}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, "");
    uniforms[name] = gl.getUniformLocation(prog, info.name);
  }
  return { program: prog, uniforms, label };
}

export class WebGL2Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.pixelWidth = 1;
    this.pixelHeight = 1;
    this.clearColor = new Color(0x0b111c);
    this.clearAlpha = 1;
    this.shadowMap = { enabled: true, size: opts.shadowSize || 1024 };
    this.info = { render: { frame: 0, calls: 0, triangles: 0, instances: 0 } };
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

    // Detect HDR half-float FBO support (with graceful RGBA8 fallback for constrained GPUs)
    this.hdrExt = gl.getExtension("EXT_color_buffer_half_float") || gl.getExtension("EXT_color_buffer_float");
    this.linearExt = gl.getExtension("OES_texture_half_float_linear");

    this.programs = new Map();
    this.dummyVao = gl.createVertexArray();
    this.whiteTex = this._makeSolidTex(255, 255, 255, 255);
    this.shadowTarget = null;
    this.hdrTarget = null;
    this.bloomA = null;
    this.bloomB = null;

    // Preallocated scratch buffers (zero per-frame allocations)
    this._shadows = [];
    this._opaque = [];
    this._trans = [];
    this._pointPos = new Float32Array(32);
    this._pointCol = new Float32Array(32);
    this._lightEye = new Vec3();
    this._lightTarget = new Vec3();
    this._lightUp = new Vec3(0, 1, 0);
    this._lightCam = new Mat4();
    this._lightView = new Mat4();
    this._lightProj = new Mat4();
    this._lightSpace = new Mat4();
    this._identity = new Mat4();

    // Cached GL state
    this._curProg = null;
    this._curBlend = "";
    this._curDepthWrite = null;
    this._curDepthTest = null;
    this._curCull = null;

    this._initShadowTarget();
    this._initContextHandlers();
  }

  _initContextHandlers() {
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.programs.clear();
      this.shadowTarget = null;
      this.hdrTarget = null;
      this.bloomA = null;
      this.bloomB = null;
      this.whiteTex = null;
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      const gl = this.gl;
      this.dummyVao = gl.createVertexArray();
      this.whiteTex = this._makeSolidTex(255, 255, 255, 255);
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

  _initShadowTarget() {
    const gl = this.gl;
    if (this.shadowTarget) {
      gl.deleteFramebuffer(this.shadowTarget.fbo);
      gl.deleteTexture(this.shadowTarget.depthTex);
    }
    const size = this.shadowMap.size;
    const depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowTarget = { fbo, depthTex, size };
  }

  _createColorTarget(w, h, withDepth) {
    const gl = this.gl;
    const useHalf = !!this.hdrExt;
    const internalFmt = useHalf ? gl.RGBA16F : gl.RGBA8;
    const type = useHalf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const filter = !useHalf || this.linearExt ? gl.LINEAR : gl.LINEAR;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
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
      // Fallback cleanly to RGBA8 if half-float FBO failed completeness on this GPU
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      if (depthRb) gl.deleteRenderbuffer(depthRb);
      this.hdrExt = null;
      return this._createColorTarget(w, h, withDepth);
    }
    return { fbo, tex, depthRb, width: w, height: h };
  }

  _deleteTarget(t) {
    if (!t) return;
    const gl = this.gl;
    gl.deleteFramebuffer(t.fbo);
    gl.deleteTexture(t.tex);
    if (t.depthRb) gl.deleteRenderbuffer(t.depthRb);
  }

  _initPostTargets() {
    this._deleteTarget(this.hdrTarget);
    this._deleteTarget(this.bloomA);
    this._deleteTarget(this.bloomB);
    const pw = this.pixelWidth,
      ph = this.pixelHeight;
    this.hdrTarget = this._createColorTarget(pw, ph, true);
    const bw = Math.max(2, pw >> 1),
      bh = Math.max(2, ph >> 1);
    this.bloomA = this._createColorTarget(bw, bh, false);
    this.bloomB = this._createColorTarget(Math.max(2, bw >> 1), Math.max(2, bh >> 1), false);
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
        src = shadowProgram(true);
        break;
      case "stylized":
        src = stylizedProgram(false);
        break;
      case "stylized_inst":
        src = stylizedProgram(true);
        break;
      case "floor":
        src = floorProgram();
        break;
      case "emissive":
        src = emissiveProgram(false);
        break;
      case "emissive_inst":
        src = emissiveProgram(true);
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
        if (key.startsWith("hazard_")) {
          src = hazardSurfaceProgram(key.slice(7).replace("_inst", ""));
        } else {
          src = stylizedProgram(key.endsWith("_inst"));
        }
    }
    p = createProgram(this.gl, src.vs, src.fs, key);
    this.programs.set(key, p);
    return p;
  }

  _useProgram(p) {
    if (this._curProg !== p) {
      this.gl.useProgram(p.program);
      this._curProg = p;
    }
  }

  _syncTexture(texObj) {
    if (!texObj || !texObj.ready) return this.whiteTex;
    const gl = this.gl;
    if (texObj._gpu && texObj._gpu.gl === gl && texObj._gpu.version === texObj.version) {
      return texObj._gpu.tex;
    }
    const tex = texObj._gpu && texObj._gpu.gl === gl ? texObj._gpu.tex : gl.createTexture();
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
    texObj._gpu = { gl, tex, version: texObj.version };
    return tex;
  }

  _ensureGeometry(geo) {
    const gl = this.gl;
    if (geo._gpu && geo._gpu.gl === gl && geo._gpu.version === geo.version) return geo._gpu;
    if (geo._gpu && geo._gpu.gl === gl) geo.dispose();

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
    geo._gpu = { gl, vao, vboPos, vboNorm, vboUv, vboCol, ibo, indexType, count, version: geo.version };
    return geo._gpu;
  }

  _ensureInstanced(node) {
    const gl = this.gl;
    const base = this._ensureGeometry(node.geometry);
    if (!node._gpuInst || node._gpuInst.gl !== gl || node._gpuInst.geoVersion !== base.version) {
      if (node._gpuInst && node._gpuInst.gl === gl) node.dispose();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

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

      if (base.ibo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, base.ibo);

      const matBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, matBuf);
      gl.bufferData(gl.ARRAY_BUFFER, node.instanceMatrix.byteLength, gl.DYNAMIC_DRAW);
      for (let c = 0; c < 4; c++) {
        gl.enableVertexAttribArray(4 + c);
        gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 64, c * 16);
        gl.vertexAttribDivisor(4 + c, 1);
      }

      const colBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, node.instanceColor.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(8);
      gl.vertexAttribPointer(8, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(8, 1);

      const flashBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, flashBuf);
      gl.bufferData(gl.ARRAY_BUFFER, node.instanceFlash.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(9);
      gl.vertexAttribPointer(9, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(9, 1);

      gl.bindVertexArray(null);
      node._gpuInst = { gl, vao, matBuf, colBuf, flashBuf, geoVersion: base.version };
      node.dirtyCount = Math.max(node.dirtyCount, node.count);
    }

    if (node.dirtyCount > 0) {
      const n = Math.min(node.dirtyCount, node.max);
      const gpu = node._gpuInst;
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.matBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceMatrix.subarray(0, n * 16));
      gl.bindBuffer(gl.ARRAY_BUFFER, gpu.colBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceColor.subarray(0, n * 3));
      if (node.hasFlash) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.flashBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, node.instanceFlash.subarray(0, n));
      }
      node.dirtyCount = 0;
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

  _uniformLinear3(loc, col) {
    if (!loc || !col) return;
    this.gl.uniform3f(
      loc,
      Math.pow(Math.max(0, col.r), 2.2),
      Math.pow(Math.max(0, col.g), 2.2),
      Math.pow(Math.max(0, col.b), 2.2),
    );
  }

  _bindCommonUniforms(u, scene, camera) {
    const gl = this.gl;
    if (u.uViewProj) gl.uniformMatrix4fv(u.uViewProj, false, camera.viewProjMatrix.elements);
    if (u.uLightSpace) gl.uniformMatrix4fv(u.uLightSpace, false, this._lightSpace.elements);
    if (u.uCamPos) gl.uniform3f(u.uCamPos, camera.position.x, camera.position.y, camera.position.z);
    if (u.uTime) gl.uniform1f(u.uTime, scene.time);
    this._uniformLinear3(u.uFogColor, scene.fogColor);
    if (u.uFogRange) gl.uniform2f(u.uFogRange, scene.fogNear, scene.fogFar);
    if (u.uSunDir) gl.uniform3f(u.uSunDir, scene.sunDir.x, scene.sunDir.y, scene.sunDir.z);
    this._uniformLinear3(u.uSunColor, scene.sunColor);
    if (u.uSunIntensity) gl.uniform1f(u.uSunIntensity, scene.sunIntensity);
    this._uniformLinear3(u.uHemiSky, scene.hemiSky);
    this._uniformLinear3(u.uHemiGround, scene.hemiGround);
    if (u.uHemiIntensity) gl.uniform1f(u.uHemiIntensity, scene.hemiIntensity);
    if (u.uFillDir) gl.uniform3f(u.uFillDir, scene.fillDir.x, scene.fillDir.y, scene.fillDir.z);
    this._uniformLinear3(u.uFillColor, scene.fillColor);
    if (u.uFillIntensity) gl.uniform1f(u.uFillIntensity, scene.fillIntensity);
    this._uniformLinear3(u.uShadowTint, scene.shadowTint);
    this._uniformLinear3(u.uRimColor, scene.rimColor);
    if (u.uDarkness) gl.uniform1f(u.uDarkness, scene.darkness);
    if (u.uBiomeIndex) gl.uniform1i(u.uBiomeIndex, scene.biomeIndex);
    if (u.uPointPos) gl.uniform4fv(u.uPointPos, this._pointPos);
    if (u.uPointCol) gl.uniform4fv(u.uPointCol, this._pointCol);
    if (u.uShadowMap) gl.uniform1i(u.uShadowMap, 0);
    if (u.uShadowsEnabled) gl.uniform1f(u.uShadowsEnabled, this.shadowMap.enabled ? 1 : 0);
    if (u.uTerrainAtlas) gl.uniform1i(u.uTerrainAtlas, 1);
    if (u.uTerrainReady) gl.uniform1f(u.uTerrainReady, this.textures.terrain?.ready ? 1 : 0);
    if (u.uSurfaceAtlas) gl.uniform1i(u.uSurfaceAtlas, 2);
    if (u.uSurfaceReady) gl.uniform1f(u.uSurfaceReady, this.textures.surface?.ready ? 1 : 0);
    if (u.uVfxAtlas) gl.uniform1i(u.uVfxAtlas, 3);
    if (u.uVfxReady) gl.uniform1f(u.uVfxReady, this.textures.vfx?.ready ? 1 : 0);
    if (u.uOcclusion) gl.uniform1i(u.uOcclusion, 4);
  }

  _drawNode(node, scene, camera) {
    const gl = this.gl;
    const mat = node.material;
    const inst = !!node.isInstancedMesh;
    const key = inst ? `${mat.shader}_inst` : mat.shader;
    const prog = this._getProgram(key);
    this._useProgram(prog);
    this._setState(mat);
    const u = prog.uniforms;
    this._bindCommonUniforms(u, scene, camera);
    if (u.uModel) gl.uniformMatrix4fv(u.uModel, false, node.worldMatrix.elements);

    if (mat.shader === "stylized") {
      const spec = SURFACE_SPEC[mat.surface] || SURFACE_SPEC.stone;
      gl.uniform2f(u.uSurfaceTile, spec[0], spec[1]);
      this._uniformLinear3(u.uBaseColor, mat.color);
      this._uniformLinear3(u.uEmissive, mat.emissive);
      gl.uniform1f(u.uEmissiveIntensity, mat.emissiveIntensity);
      gl.uniform1f(u.uOpacity, mat.opacity);
      gl.uniform1f(u.uRimStrength, mat.rimStrength ?? spec[2]);
      gl.uniform1f(u.uSpecPower, spec[3]);
      gl.uniform1f(u.uBiomeSkin, mat.biomeSkin ? 1 : 0);
      gl.uniform1f(u.uFogEnabled, mat.fog ? 1 : 0);
      gl.uniform1f(u.uDustFade, mat.surface === "dust" ? 1 : 0);
      if (u.uUseVertexColors) gl.uniform1f(u.uUseVertexColors, mat.vertexColors ? 1 : 0);
      if (u.uReedWind) gl.uniform1f(u.uReedWind, mat.reedWind ? 1 : 0);
    } else if (mat.shader === "emissive") {
      this._uniformLinear3(u.uBaseColor, mat.color);
      gl.uniform1f(u.uEmissiveIntensity, mat.emissiveIntensity);
      gl.uniform1f(u.uOpacity, mat.opacity);
      gl.uniform1f(u.uFogEnabled, mat.fog ? 1 : 0);
      gl.uniform1f(u.uAdditive, mat.additive ? 1 : 0);
      if (u.uSpriteTile) gl.uniform1i(u.uSpriteTile, mat.spriteTile);
      if (u.uUseVertexColors) gl.uniform1f(u.uUseVertexColors, mat.vertexColors ? 1 : 0);
    } else if (mat.shader === "floor") {
      const mu = mat.uniforms;
      if (u.uHalf && mu.uHalf) gl.uniform2f(u.uHalf, mu.uHalf.value.x, mu.uHalf.value.y);
      if (mu.uGlaze) this._uniformLinear3(u.uFloorBase, mu.uGlaze.value);
      if (mu.uGrid) this._uniformLinear3(u.uFloorTrim, mu.uGrid.value);
      if (mu.uAccent) this._uniformLinear3(u.uFloorAccent, mu.uAccent.value);
      if (u.uPulse && mu.uPulse) gl.uniform1f(u.uPulse, mu.uPulse.value);
      if (u.uStyle && mu.uStyle) gl.uniform1f(u.uStyle, mu.uStyle.value);
      if (u.uDarkness && mu.uDark) gl.uniform1f(u.uDarkness, mu.uDark.value);
    } else if (mat.shader === "aegis") {
      const mu = mat.uniforms;
      if (mu.uColor) this._uniformLinear3(u.uColor, mu.uColor.value);
      if (u.uHit && mu.uHit) gl.uniform1f(u.uHit, mu.uHit.value);
      if (u.uFade && mu.uFade) gl.uniform1f(u.uFade, mu.uFade.value);
    } else if (mat.shader === "zoneTelegraph") {
      const mu = mat.uniforms;
      if (mu.uWarn) this._uniformLinear3(u.uWarn, mu.uWarn.value);
    }

    if (inst) {
      const { base, inst: gpuInst } = this._ensureInstanced(node);
      gl.bindVertexArray(gpuInst.vao);
      if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
      else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
      this.info.render.calls++;
      this.info.render.triangles += (base.count / 3) * node.count;
      this.info.render.instances += node.count;
    } else {
      const base = this._ensureGeometry(node.geometry);
      gl.bindVertexArray(base.vao);
      if (base.ibo) gl.drawElements(gl.TRIANGLES, base.count, base.indexType, 0);
      else gl.drawArrays(gl.TRIANGLES, 0, base.count);
      this.info.render.calls++;
      this.info.render.triangles += base.count / 3;
      this.info.render.instances++;
    }
  }

  _collect(node) {
    if (!node.visible) return;
    if (node.isMesh && node.geometry && node.material) {
      if (node.isInstancedMesh && node.count <= 0) return;
      if (node.castShadow && !node.material.transparent && !node.material.additive) {
        this._shadows.push(node);
      }
      if (node.material.transparent || node.material.additive) {
        this._trans.push(node);
      } else {
        this._opaque.push(node);
      }
    }
    const ch = node.children;
    for (let i = 0; i < ch.length; i++) this._collect(ch[i]);
  }

  render(scene, camera) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    this.info.render.frame++;
    this.info.render.calls = 0;
    this.info.render.triangles = 0;
    this.info.render.instances = 0;

    scene.updateWorldMatrix(true);
    camera.updateMatrixWorld();

    // Pack 8 dynamic combat point lights (linear RGB)
    for (let i = 0; i < 8; i++) {
      const l = scene.pointLights[i];
      const o = i * 4;
      this._pointPos[o] = l.x;
      this._pointPos[o + 1] = l.y;
      this._pointPos[o + 2] = l.z;
      this._pointPos[o + 3] = l.radius;
      this._pointCol[o] = Math.pow(Math.max(0, l.r), 2.2);
      this._pointCol[o + 1] = Math.pow(Math.max(0, l.g), 2.2);
      this._pointCol[o + 2] = Math.pow(Math.max(0, l.b), 2.2);
      this._pointCol[o + 3] = l.intensity;
    }

    this._shadows.length = 0;
    this._opaque.length = 0;
    this._trans.length = 0;
    this._collect(scene);

    // Sort draw lists by renderOrder (and keep opaque batched cleanly)
    this._opaque.sort((a, b) => a.renderOrder - b.renderOrder);
    this._trans.sort(
      (a, b) => a.renderOrder - b.renderOrder || (a.material.additive ? 1 : 0) - (b.material.additive ? 1 : 0),
    );

    // Reset cached state each frame
    this._curProg = null;
    this._curBlend = "";
    this._curDepthWrite = null;
    this._curDepthTest = null;
    this._curCull = null;

    // 1. Directional Shadow Pass
    if (this.shadowMap.enabled && this.shadowTarget) {
      const sz = this.shadowTarget.size;
      const extent = 26;
      // Texel-snapped directional light frustum around arena center prevents shadow shimmer
      this._lightTarget.set(0, 0, 0);
      this._lightEye.set(scene.sunDir.x * 40, scene.sunDir.y * 40, scene.sunDir.z * 40);
      this._lightCam.lookAtCamera(this._lightEye, this._lightTarget, this._lightUp);
      this._lightView.copy(this._lightCam).invert();
      this._lightProj.makeOrthographic(-extent, extent, extent, -extent, 4, 92);
      this._lightSpace.multiplyMatrices(this._lightProj, this._lightView);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowTarget.fbo);
      gl.viewport(0, 0, sz, sz);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2.0, 2.5);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      const spStatic = this._getProgram("shadow");
      const spInst = this._getProgram("shadow_inst");
      for (let i = 0; i < this._shadows.length; i++) {
        const node = this._shadows[i];
        if (node.isInstancedMesh) {
          this._useProgram(spInst);
          gl.uniformMatrix4fv(spInst.uniforms.uLightSpace, false, this._lightSpace.elements);
          gl.uniformMatrix4fv(spInst.uniforms.uModel, false, node.worldMatrix.elements);
          const { base, inst } = this._ensureInstanced(node);
          gl.bindVertexArray(inst.vao);
          if (base.ibo) gl.drawElementsInstanced(gl.TRIANGLES, base.count, base.indexType, 0, node.count);
          else gl.drawArraysInstanced(gl.TRIANGLES, 0, base.count, node.count);
        } else {
          this._useProgram(spStatic);
          gl.uniformMatrix4fv(spStatic.uniforms.uLightSpace, false, this._lightSpace.elements);
          gl.uniformMatrix4fv(spStatic.uniforms.uModel, false, node.worldMatrix.elements);
          const base = this._ensureGeometry(node.geometry);
          gl.bindVertexArray(base.vao);
          if (base.ibo) gl.drawElements(gl.TRIANGLES, base.count, base.indexType, 0);
          else gl.drawArrays(gl.TRIANGLES, 0, base.count);
        }
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // Bind global texture units: 0=shadow, 1=terrain, 2=surface, 3=vfx, 4=occlusion
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTarget ? this.shadowTarget.depthTex : this.whiteTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.terrain));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.surface));
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.vfx));
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(this.textures.occlusion));

    // 2. Main Scene Pass (into HDR offscreen FBO if post-processing enabled)
    const usePost = this.postEnabled && this.hdrTarget && this.bloomA && this.bloomB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? this.hdrTarget.fbo : null);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(
      Math.pow(Math.max(0, this.clearColor.r), 2.2),
      Math.pow(Math.max(0, this.clearColor.g), 2.2),
      Math.pow(Math.max(0, this.clearColor.b), 2.2),
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._curBlend = "";
    this._curDepthWrite = true;
    this._curDepthTest = true;
    this._curCull = null;

    for (let i = 0; i < this._opaque.length; i++) this._drawNode(this._opaque[i], scene, camera);
    for (let i = 0; i < this._trans.length; i++) this._drawNode(this._trans[i], scene, camera);

    // 3. Selective Dual-Kawase Bloom + Stylized ACES Tone-Map Composite Pass
    if (usePost) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.dummyVao);

      // Prefilter bright emissives -> bloomA (half-res)
      const pre = this._getProgram("bloomPrefilter");
      this._useProgram(pre);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTarget.tex);
      gl.uniform1i(pre.uniforms.uSrc, 0);
      gl.uniform1f(pre.uniforms.uThreshold, scene.bloomThreshold);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Kawase downsample -> bloomB (quarter-res)
      const kaw = this._getProgram("bloomKawase");
      this._useProgram(kaw);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fbo);
      gl.viewport(0, 0, this.bloomB.width, this.bloomB.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(kaw.uniforms.uSrc, 0);
      gl.uniform1f(kaw.uniforms.uOffset, 1.25);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Kawase upsample -> bloomA (half-res)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
      gl.uniform1f(kaw.uniforms.uOffset, 1.85);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Final ACES tone-mapped composite -> screen
      const comp = this._getProgram("postComposite");
      this._useProgram(comp);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.hdrTarget.tex);
      gl.uniform1i(comp.uniforms.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(comp.uniforms.uBloom, 1);
      gl.uniform1f(comp.uniforms.uBloomStrength, scene.bloomStrength);
      gl.uniform1f(comp.uniforms.uFlash, this.flash);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindVertexArray(null);
  }
}
