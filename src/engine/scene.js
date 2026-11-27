// Lightweight scene graph, materials, GPU-instanced pools and static mesh batching for Riftline's WebGL2 engine.

import { Color, Euler, Mat4, Quat, Vec3 } from "./math.js";
import { Geometry } from "./geometry.js";

const _q = new Quat();
const _tmpCol = new Color();

export class Texture2D {
  constructor({
    width = 1,
    height = 1,
    data = null,
    image = null,
    format = "rgba",
    wrap = "repeat",
    filter = "linear",
    flipY = false,
    maxMipLevel,
  } = {}) {
    this.width = width;
    this.height = height;
    this.data = data;
    this.image = image;
    this.format = format; // "rgba" | "r8"
    this.wrap = wrap; // "repeat" | "clamp"
    this.filter = filter; // "linear" | "nearest"
    this.flipY = flipY;
    this.maxMipLevel = maxMipLevel;
    this.ready = !!(data || image);
    this.version = 1;
    this._gpu = null;
  }
  setImage(img) {
    this.image = img;
    this.width = img.width || 1;
    this.height = img.height || 1;
    this.ready = true;
    this.version++;
  }
  dispose() {
    if (this._gpu) {
      const { engine, gl, tex } = this._gpu;
      engine?._textureUploads.delete(this);
      if (gl && !gl.isContextLost() && tex) gl.deleteTexture(tex);
      this._gpu = null;
    }
  }
}

export class Material {
  constructor(opts = {}) {
    this.shader = opts.shader || "stylized";
    this.color = opts.color instanceof Color ? opts.color.clone() : new Color(opts.color ?? 0xffffff);
    this.emissive = opts.emissive instanceof Color ? opts.emissive.clone() : new Color(opts.emissive ?? 0x000000);
    this.emissiveIntensity = opts.emissiveIntensity ?? 1;
    this.opacity = opts.opacity ?? 1;
    this.transparent = !!opts.transparent;
    this.additive = !!opts.additive;
    this.depthWrite = opts.depthWrite ?? !this.transparent;
    this.depthTest = opts.depthTest ?? true;
    this.doubleSide = !!opts.doubleSide;
    this.vertexColors = !!opts.vertexColors;
    this.fog = opts.fog ?? true;
    this.surface = opts.surface || "stone";
    this.biomeSkin = !!opts.biomeSkin;
    this.reedWind = !!opts.reedWind;
    this.rimStrength = opts.rimStrength ?? null;
    this.inkStrength = opts.inkStrength ?? null;
    this.spriteTile = opts.spriteTile ?? -1; // -1 none, 0 glow, 1 spark, 2 smoke, 3 shadow
    this.map = opts.map || null;
    this.uniforms = opts.uniforms || {};
    this.userData = opts.userData || {};
    this.flatShading = !!opts.flatShading;
    this.batchKey = opts.batchKey || null;
    this.wakeReact = opts.wakeReact ?? (this.reedWind ? 1 : 0);
    this._blendRank = this.additive ? 1 : 0;
  }
  dispose() {
    // Textures owned globally are disposed by their owners.
  }
}

export class Node {
  static _matrixUpdates = 0;

  constructor() {
    this.position = new Vec3();
    this.rotation = new Euler();
    this.scale = new Vec3(1, 1, 1);
    this.visible = true;
    this.parent = null;
    this.children = [];
    this.localMatrix = new Mat4();
    this.worldMatrix = new Mat4();
    this.matrixAutoUpdate = true;
    this._matrixDirty = true;
    this._subtreeStatic = false;
    this._worldVersion = 0;
    this.userData = {};
  }
  _unfreezeAncestors() {
    for (let cur = this; cur; cur = cur.parent) {
      if (!cur._subtreeStatic) break;
      cur._subtreeStatic = false;
    }
  }
  add(...nodes) {
    for (const n of nodes) {
      if (!n || n === this) continue;
      if (n.parent) n.parent.remove(n);
      n.parent = this;
      n._matrixDirty = true;
      this.children.push(n);
    }
    this._unfreezeAncestors();
    return this;
  }
  remove(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) {
      this.children.splice(i, 1);
      node.parent = null;
    }
    return this;
  }
  clear() {
    for (const c of this.children) c.parent = null;
    this.children.length = 0;
    this._subtreeStatic = false;
    return this;
  }
  traverse(fn) {
    fn(this);
    for (let i = 0; i < this.children.length; i++) this.children[i].traverse(fn);
  }
  markMatrixDirty() {
    this._matrixDirty = true;
    this._unfreezeAncestors();
  }
  freezeStatic() {
    this.updateWorldMatrix(true);
    this.traverse((n) => {
      n.matrixAutoUpdate = false;
      n._matrixDirty = false;
      n._subtreeStatic = true;
      if (n.isMesh && !n.isInstancedMesh && n.geometry) {
        n.getWorldSphere(true);
      }
    });
    this._unfreezeAncestors();
    this._subtreeStatic = true;
    return this;
  }
  updateLocalMatrix() {
    Node._matrixUpdates++;
    const r = this.rotation;
    const p = this.position;
    const s = this.scale;
    if (r.x === 0 && r.y === 0 && r.z === 0) {
      const e = this.localMatrix.elements;
      e[0] = s.x;
      e[1] = 0;
      e[2] = 0;
      e[3] = 0;
      e[4] = 0;
      e[5] = s.y;
      e[6] = 0;
      e[7] = 0;
      e[8] = 0;
      e[9] = 0;
      e[10] = s.z;
      e[11] = 0;
      e[12] = p.x;
      e[13] = p.y;
      e[14] = p.z;
      e[15] = 1;
      this._isIdentity = p.x === 0 && p.y === 0 && p.z === 0 && s.x === 1 && s.y === 1 && s.z === 1;
      return;
    }
    this._isIdentity = false;
    _q.setFromEuler(r);
    this.localMatrix.compose(p, _q, s);
  }
  updateWorldMatrix(updateChildren = true, parentUpdated = false) {
    const needSelf = this.matrixAutoUpdate || this._matrixDirty || parentUpdated;
    if (needSelf) {
      if (this.matrixAutoUpdate || this._matrixDirty) {
        this.updateLocalMatrix();
        this._matrixDirty = false;
      }
      if (this.parent) {
        if (this._isIdentity) this.worldMatrix.copy(this.parent.worldMatrix);
        else if (this.parent._worldIdentity) this.worldMatrix.copy(this.localMatrix);
        else this.worldMatrix.multiplyMatrices(this.parent.worldMatrix, this.localMatrix);
        this._worldIdentity = this._isIdentity && !!this.parent._worldIdentity;
      } else {
        this.worldMatrix.copy(this.localMatrix);
        this._worldIdentity = this._isIdentity;
      }
      this._worldVersion++;
    }
    if (updateChildren && (!this._subtreeStatic || needSelf)) {
      const ch = this.children;
      for (let i = 0; i < ch.length; i++) ch[i].updateWorldMatrix(true, needSelf);
    }
  }
  getWorldPosition(out = new Vec3()) {
    // Walk up chain so calling getWorldPosition right after mutating local transform is exact.
    const chain = _worldPosChain;
    chain.length = 0;
    for (let cur = this; cur; cur = cur.parent) chain.push(cur);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].updateWorldMatrix(false, i < chain.length - 1);
    chain.length = 0;
    const e = this.worldMatrix.elements;
    return out.set(e[12], e[13], e[14]);
  }
}

const _worldPosChain = [];

export class MeshNode extends Node {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this._worldSphere = null;
  }
  getWorldSphere(force = false) {
    const geo = this.geometry;
    if (!geo) return null;
    const s = (this._worldSphere ||= { x: 0, y: 0, z: 0, r: 0, wv: -1, gv: -1 });
    if (!force && s.wv === this._worldVersion && s.gv === geo.version) return s;
    const ls = geo.computeBoundingSphere();
    if (this._worldIdentity) {
      s.x = ls.cx;
      s.y = ls.cy;
      s.z = ls.cz;
      s.r = ls.r;
    } else {
      const e = this.worldMatrix.elements;
      s.x = e[0] * ls.cx + e[4] * ls.cy + e[8] * ls.cz + e[12];
      s.y = e[1] * ls.cx + e[5] * ls.cy + e[9] * ls.cz + e[13];
      s.z = e[2] * ls.cx + e[6] * ls.cy + e[10] * ls.cz + e[14];
      const sx2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
      const sy2 = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
      const sz2 = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
      s.r = ls.r * Math.sqrt(Math.max(sx2, sy2, sz2));
    }
    if (this.material && (this.material.reedWind || this.material.wakeReact > 0)) {
      s.r += 0.45;
    }
    s.wv = this._worldVersion;
    s.gv = geo.version;
    return s;
  }
}

export class InstancedNode extends Node {
  constructor(geometry, material, max) {
    super();
    this.isMesh = true;
    this.isInstancedMesh = true;
    this.geometry = geometry;
    this.material = material;
    this.max = max;
    this.count = 0;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
    this.instanceMatrix = new Float32Array(max * 16);
    this.instanceColor = new Float32Array(max * 3).fill(1);
    this.instanceFlash = new Float32Array(max);
    this.dirtyCount = 0;
    this.hasColor = true;
    this.hasFlash = false;
    this._gpuInst = null;
  }
  dispose() {
    if (this._gpuInst) {
      const { engine, gl, vao, matBuf, colBuf, flashBuf } = this._gpuInst;
      engine?._instanceUploads.delete(this);
      if (gl && !gl.isContextLost()) {
        if (vao) gl.deleteVertexArray(vao);
        if (matBuf) gl.deleteBuffer(matBuf);
        if (colBuf) gl.deleteBuffer(colBuf);
        if (flashBuf) gl.deleteBuffer(flashBuf);
      }
      this._gpuInst = null;
    }
  }
}

export class InstancePool {
  constructor(geometry, material, max, opts = {}) {
    this.max = max;
    this.mesh = new InstancedNode(geometry, material, max);
    this.mesh.updateLocalMatrix();
    this.mesh._worldIdentity = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh._matrixDirty = false;
    this.mesh.hasColor = opts.color !== false;
    this.mesh.hasFlash = !!opts.flash;
    this.m = this.mesh.instanceMatrix;
    this.c = this.mesh.hasColor ? this.mesh.instanceColor : null;
    this.f = this.mesh.hasFlash ? this.mesh.instanceFlash : null;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.dirtyCount = this.n;
  }
  y(x, y, z, angle, sx, sy = sx, sz = sx) {
    if (this.n >= this.max) return -1;
    const idx = this.n++,
      arr = this.m,
      off = idx * 16,
      cos = Math.cos(-angle),
      sin = Math.sin(-angle);
    arr[off] = cos * sx;
    arr[off + 1] = 0;
    arr[off + 2] = -sin * sx;
    arr[off + 3] = 0;
    arr[off + 4] = 0;
    arr[off + 5] = sy;
    arr[off + 6] = 0;
    arr[off + 7] = 0;
    arr[off + 8] = sin * sz;
    arr[off + 9] = 0;
    arr[off + 10] = cos * sz;
    arr[off + 11] = 0;
    arr[off + 12] = x;
    arr[off + 13] = y;
    arr[off + 14] = z;
    arr[off + 15] = 1;
    return idx;
  }
  yr(x, y, z, angle, sx, sy, sz, pitch, roll) {
    if (this.n >= this.max) return -1;
    const idx = this.n++,
      arr = this.m,
      off = idx * 16,
      c = Math.cos(-angle),
      s = Math.sin(-angle),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch),
      cr = Math.cos(roll),
      sr = Math.sin(roll);
    arr[off] = c * cp * sx;
    arr[off + 1] = sp * sx;
    arr[off + 2] = -s * cp * sx;
    arr[off + 3] = 0;
    arr[off + 4] = (-c * sp * cr + s * sr) * sy;
    arr[off + 5] = cp * cr * sy;
    arr[off + 6] = (s * sp * cr + c * sr) * sy;
    arr[off + 7] = 0;
    arr[off + 8] = (c * sp * sr + s * cr) * sz;
    arr[off + 9] = -cp * sr * sz;
    arr[off + 10] = (-s * sp * sr + c * cr) * sz;
    arr[off + 11] = 0;
    arr[off + 12] = x;
    arr[off + 13] = y;
    arr[off + 14] = z;
    arr[off + 15] = 1;
    return idx;
  }
  bb(x, y, z, size, basis, rot = 0) {
    if (this.n >= this.max) return -1;
    const idx = this.n++,
      arr = this.m,
      off = idx * 16;
    let rx = basis.rx,
      ry = basis.ry,
      rz = basis.rz,
      ux = basis.ux,
      uy = basis.uy,
      uz = basis.uz;
    if (rot) {
      const cos = Math.cos(rot),
        sin = Math.sin(rot);
      const nrx = rx * cos + ux * sin,
        nry = ry * cos + uy * sin,
        nrz = rz * cos + uz * sin;
      ux = ux * cos - rx * sin;
      uy = uy * cos - ry * sin;
      uz = uz * cos - rz * sin;
      rx = nrx;
      ry = nry;
      rz = nrz;
    }
    arr[off] = rx * size;
    arr[off + 1] = ry * size;
    arr[off + 2] = rz * size;
    arr[off + 3] = 0;
    arr[off + 4] = ux * size;
    arr[off + 5] = uy * size;
    arr[off + 6] = uz * size;
    arr[off + 7] = 0;
    arr[off + 8] = basis.fx;
    arr[off + 9] = basis.fy;
    arr[off + 10] = basis.fz;
    arr[off + 11] = 0;
    arr[off + 12] = x;
    arr[off + 13] = y;
    arr[off + 14] = z;
    arr[off + 15] = 1;
    return idx;
  }
  seg(x0, z0, x1, z1, y, width, height) {
    const dx = x1 - x0,
      dz = z1 - z0,
      len = Math.hypot(dx, dz);
    return len < 1e-4 ? -1 : this.y(x0, y, z0, Math.atan2(dz, dx), len, height, width);
  }
  col(idx, r, g, b) {
    if (idx < 0 || !this.c) return;
    const off = idx * 3;
    this.c[off] = r;
    this.c[off + 1] = g;
    this.c[off + 2] = b;
  }
  colC(idx, color, mul = 1) {
    if (idx < 0 || !this.c) return;
    const off = idx * 3;
    this.c[off] = color.r * mul;
    this.c[off + 1] = color.g * mul;
    this.c[off + 2] = color.b * mul;
  }
  colHex(idx, hex, mul = 1) {
    _tmpCol.setHex(hex);
    this.colC(idx, _tmpCol, mul);
  }
  flash(idx, value) {
    if (idx >= 0 && this.f) this.f[idx] = value;
  }
}

export class CompactInstancedNode extends Node {
  constructor(geometry, material, max) {
    super();
    this.isMesh = true;
    this.isInstancedMesh = true;
    this.isCompactInstanced = true;
    this.geometry = geometry;
    this.material = material;
    this.max = max;
    this.count = 0;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
    // 12 floats (48 bytes) per instance: aInstPosScale (4), aInstRotAnim (4), aInstTintFlash (4)
    this.instanceData = new Float32Array(max * 12);
    this.dirtyCount = 0;
    this._gpuInst = null;
  }
  dispose() {
    if (this._gpuInst) {
      const { engine, gl, vao, dataBuf } = this._gpuInst;
      engine?._instanceUploads.delete(this);
      if (gl && !gl.isContextLost()) {
        if (vao) gl.deleteVertexArray(vao);
        if (dataBuf) gl.deleteBuffer(dataBuf);
      }
      this._gpuInst = null;
    }
  }
}

export class CompactInstancePool {
  constructor(geometry, material, max) {
    this.max = max;
    this.mesh = new CompactInstancedNode(geometry, material, max);
    this.mesh.updateLocalMatrix();
    this.mesh._worldIdentity = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh._matrixDirty = false;
    this.d = this.mesh.instanceData;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.dirtyCount = this.n;
  }
  push(x, y, z, scale, scaleY, yaw, pitch, roll, animPhase, r, g, b, flash = 0, action = 0) {
    if (this.n >= this.max) return -1;
    const idx = this.n++;
    const d = this.d;
    const off = idx * 12;
    const sc = Math.max(1e-4, scale);
    const syRatio = scaleY / sc;
    const fl8 = flash <= 0 ? 0 : flash >= 1 ? 255 : (flash * 255 + 0.5) | 0;
    const ac7 = action <= 0 ? 0 : action >= 1 ? 127 : (action * 127 + 0.5) | 0;
    const sy8 = syRatio <= 0.375 ? 0 : syRatio >= 1.625 ? 250 : ((syRatio - 0.375) * 200 + 0.5) | 0;
    d[off] = x;
    d[off + 1] = y;
    d[off + 2] = z;
    d[off + 3] = sc;
    d[off + 4] = yaw;
    d[off + 5] = pitch;
    d[off + 6] = roll;
    d[off + 7] = animPhase;
    d[off + 8] = r;
    d[off + 9] = g;
    d[off + 10] = b;
    d[off + 11] = fl8 + (ac7 << 8) + (sy8 << 15);
    return idx;
  }
}

/** Stateless GPU Ring-Buffer Particle System with O(1) time-wheel active budget counter and zero CPU stepping. */
export class GpuParticleRing {
  constructor(quadGeo, capacity = 2048, getTime = () => 0, onClear = null) {
    this.capacity = capacity;
    this.getTime = getTime;
    this.onClear = onClear;
    this.cursor = 0;
    this.everUsed = 0;
    this._maxExpireAt = 0;
    // 16 floats (64 bytes) per slot: aSpawnPosTime(4), aVelLife(4), aColorSize(4), aPhysFlags(4)
    this.data = new Float32Array(capacity * 16);
    this.d0Start = -1;
    this.d0End = -1;
    this.d1Start = -1;
    this.d1End = -1;
    this._bins = new Int32Array(256);
    this._slotExpiry = new Int32Array(capacity).fill(-1);
    this._curTick = 0;
    this._active = 0;

    const mat = new Material({
      shader: "gpuParticle",
      transparent: true,
      additive: true,
      depthWrite: false,
      doubleSide: true,
      fog: false,
    });
    this.mesh = new MeshNode(quadGeo, mat);
    this.mesh.updateLocalMatrix();
    this.mesh._worldIdentity = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh._matrixDirty = false;
    this.mesh.isInstancedMesh = true;
    this.mesh.isGpuRingMesh = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.max = capacity;
    this.mesh.count = 0;
    this.mesh.ring = this;
  }
  get n() {
    return this._active;
  }
  set n(val) {
    const k = Math.max(0, val | 0);
    this._bins.fill(0);
    this._slotExpiry.fill(-1);
    this._active = k;
    const now = this.getTime();
    this._curTick = Math.max(0, Math.floor(now * 20));
    if (k === 0) {
      this.cursor = 0;
      this.everUsed = 0;
      this.d0Start = this.d0End = this.d1Start = this.d1End = -1;
      this._maxExpireAt = 0;
      this.mesh.count = 0;
      this.mesh.visible = false;
      if (this.onClear) this.onClear(now + 1e-4);
    } else {
      this._bins[(this._curTick + 60) & 255] = k;
      this._maxExpireAt = Math.max(this._maxExpireAt, now + 3.0);
    }
  }
  advanceTime(time) {
    const targetTick = Math.max(this._curTick, Math.floor(time * 20));
    const steps = targetTick - this._curTick;
    if (steps >= 256) {
      this._bins.fill(0);
      this._active = 0;
      this._curTick = targetTick;
    } else if (steps > 0) {
      for (let s = 1; s <= steps; s++) {
        const bi = (this._curTick + s) & 255;
        this._active -= this._bins[bi];
        this._bins[bi] = 0;
      }
      if (this._active < 0) this._active = 0;
      this._curTick = targetTick;
    }
    if (this._active <= 0 && time >= this._maxExpireAt) {
      this._active = 0;
      this.cursor = 0;
      this.everUsed = 0;
      this.mesh.count = 0;
      this.mesh.visible = false;
    } else {
      this.mesh.count = this.everUsed;
      this.mesh.visible = this.everUsed > 0;
    }
  }
  _markDirty(slot) {
    if (this.d0Start < 0) {
      this.d0Start = slot;
      this.d0End = slot + 1;
    } else if (slot === this.d0End && this.d1Start < 0) {
      this.d0End = slot + 1;
    } else if (this.d1Start < 0 && slot < this.d0Start) {
      this.d1Start = slot;
      this.d1End = slot + 1;
    } else if (this.d1Start >= 0 && slot === this.d1End) {
      this.d1End = slot + 1;
    } else {
      // Fallback union if non-sequential
      this.d0Start = 0;
      this.d0End = this.capacity;
      this.d1Start = -1;
      this.d1End = -1;
    }
  }
  spawn(x, y, z, vx, vy, vz, spawnTime, life, size, r, g, b, drag, grav, grow, isSpark, seed) {
    this.advanceTime(spawnTime);
    const dur = Math.max(0.02, life);
    const slot = this.cursor;
    this.cursor = (slot + 1) % this.capacity;
    if (this.everUsed < this.capacity) this.everUsed++;
    const expireAt = spawnTime + dur;
    if (expireAt > this._maxExpireAt) this._maxExpireAt = expireAt;
    const d = this.data;
    const o = slot * 16;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = spawnTime;
    d[o + 4] = vx;
    d[o + 5] = vy;
    d[o + 6] = vz;
    d[o + 7] = 1 / dur;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = size;
    d[o + 12] = drag;
    d[o + 13] = grav;
    d[o + 14] = grow;
    const rotFrac = Math.min(0.999, Math.max(0.001, seed));
    d[o + 15] = isSpark ? 1 + rotFrac : rotFrac * 0.49;
    this._markDirty(slot);

    const expTick = Math.min(this._curTick + 255, Math.max(this._curTick + 1, Math.ceil(expireAt * 20)));
    const previousExpiry = this._slotExpiry[slot];
    if (previousExpiry > this._curTick) {
      this._bins[previousExpiry & 255]--;
      this._active--;
    }
    this._slotExpiry[slot] = expTick;
    this._bins[expTick & 255]++;
    this._active++;
    this.mesh.count = this.everUsed;
    this.mesh.visible = true;
  }
  dispose() {
    if (this.mesh._gpuInst) {
      const { engine, gl, vao, dataBuf } = this.mesh._gpuInst;
      engine?._instanceUploads.delete(this.mesh);
      if (gl && !gl.isContextLost()) {
        if (vao) gl.deleteVertexArray(vao);
        if (dataBuf) gl.deleteBuffer(dataBuf);
      }
      this.mesh._gpuInst = null;
    }
  }
}

/** Stateless GPU Ring-Buffer Ballistic Combat Debris System (zero JS objects or CPU stepping). */
export class GpuDebrisRing {
  constructor(debrisGeo, material, capacity = 320) {
    this.capacity = capacity;
    this.cursor = 0;
    this.everUsed = 0;
    this._maxExpireAt = 0;
    this.data = new Float32Array(capacity * 16);
    this.d0Start = -1;
    this.d0End = -1;
    this.d1Start = -1;
    this.d1End = -1;

    material.shader = "gpuDebris";
    this.mesh = new MeshNode(debrisGeo, material);
    this.mesh.updateLocalMatrix();
    this.mesh._worldIdentity = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh._matrixDirty = false;
    this.mesh.isInstancedMesh = true;
    this.mesh.isGpuRingMesh = true;
    this.mesh.isGpuDebrisMesh = true;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.max = capacity;
    this.mesh.count = 0;
    this.mesh.ring = this;
  }
  _markDirty(slot) {
    if (this.d0Start < 0) {
      this.d0Start = slot;
      this.d0End = slot + 1;
    } else if (slot === this.d0End && this.d1Start < 0) {
      this.d0End = slot + 1;
    } else if (this.d1Start < 0 && slot < this.d0Start) {
      this.d1Start = slot;
      this.d1End = slot + 1;
    } else if (this.d1Start >= 0 && slot === this.d1End) {
      this.d1End = slot + 1;
    } else {
      this.d0Start = 0;
      this.d0End = this.capacity;
      this.d1Start = -1;
      this.d1End = -1;
    }
  }
  spawn(x, y, z, vx, vy, vz, spawnTime, life, size, r, g, b, sx = 0, sy = 0, sz = 0, rotSeed = 0) {
    const dur = Math.max(0.05, life);
    const slot = this.cursor;
    this.cursor = (slot + 1) % this.capacity;
    if (this.everUsed < this.capacity) this.everUsed++;
    const expireAt = spawnTime + dur;
    if (expireAt > this._maxExpireAt) this._maxExpireAt = expireAt;
    const d = this.data;
    const o = slot * 16;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = spawnTime;
    d[o + 4] = vx;
    d[o + 5] = vy;
    d[o + 6] = vz;
    d[o + 7] = 1 / dur;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = size;
    d[o + 12] = sx;
    d[o + 13] = sy;
    d[o + 14] = sz;
    d[o + 15] = rotSeed;
    this._markDirty(slot);
    this.mesh.count = this.everUsed;
    this.mesh.visible = true;
  }
  clear() {
    this.cursor = 0;
    this.everUsed = 0;
    this._maxExpireAt = 0;
    this.d0Start = -1;
    this.d0End = -1;
    this.d1Start = -1;
    this.d1End = -1;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  sync(nowTime) {
    if (nowTime !== undefined && this.everUsed > 0 && nowTime >= this._maxExpireAt) {
      this.cursor = 0;
      this.everUsed = 0;
      this._maxExpireAt = 0;
      this.mesh.count = 0;
      this.mesh.visible = false;
      return;
    }
    this.mesh.count = this.everUsed;
    this.mesh.visible = this.everUsed > 0;
  }
  dispose() {
    if (this.mesh._gpuInst) {
      const { engine, gl, vao, dataBuf } = this.mesh._gpuInst;
      engine?._instanceUploads.delete(this.mesh);
      if (gl && !gl.isContextLost()) {
        if (vao) gl.deleteVertexArray(vao);
        if (dataBuf) gl.deleteBuffer(dataBuf);
      }
      this.mesh._gpuInst = null;
    }
  }
}

export class Scene extends Node {
  constructor() {
    super();
    this.clearColor = new Color(0x0b111c);
    this.fogColor = new Color(0x0b111c);
    this.fogNear = 28;
    this.fogFar = 72;
    this.sunDir = new Vec3(0.45, 0.82, 0.35).normalize();
    this.sunColor = new Color(0xffe6c4);
    this.sunIntensity = 1.42;
    this.hemiSky = new Color(0x88c4d8);
    this.hemiGround = new Color(0x3a2b36);
    this.hemiIntensity = 0.85;
    this.fillDir = new Vec3(-0.6, 0.45, -0.65).normalize();
    this.fillColor = new Color(0x6ec8d8);
    this.fillIntensity = 0.52;
    this.shadowTint = new Color(0x1f2342);
    this.rimColor = new Color(0x9be2e8);
    this.biomeIndex = 0;
    this.darkness = 0;
    this.time = 0;
    this.particleClearTime = -1;
    this.wakeHalf = { x: 22, y: 18 };
    this.wakeStrength = 1;
    this.wakeEnabled = 1;
    this.bloomStrength = 0.26;
    this.bloomThreshold = 1.28;
    this.pointLights = Array.from({ length: 8 }, () => ({
      x: 0,
      y: 1.5,
      z: 0,
      r: 1,
      g: 1,
      b: 1,
      radius: 4,
      intensity: 0,
    }));
  }
}

/** Merge static opaque meshes inside `root` by shader/surface/material signature (+ exterior quadrant for frustum culling). */
export function mergeStaticNodes(root, keep = new Set()) {
  root.updateWorldMatrix(true);
  const rootInv = root.worldMatrix.clone().invert();
  const buckets = new Map();
  const toRemove = [];
  const collect = (node) => {
    if (keep.has(node) || (node.material && keep.has(node.material))) return;
    if (
      node.isMesh &&
      !node.isInstancedMesh &&
      node.geometry &&
      node.material &&
      !node.material.transparent &&
      !node.material.additive &&
      !node.material.map &&
      !node.geometry.partMeta &&
      !Object.keys(node.material.uniforms).length &&
      (node.material.shader === "stylized" || node.material.shader === "emissive") &&
      !node.material.reedWind
    ) {
      const mat = node.material;
      const we = node.worldMatrix.elements;
      const wx = we[12];
      const wz = we[14];
      const sector = Math.max(Math.abs(wx), Math.abs(wz)) > 12 ? `${wx >= 0 ? 1 : 0}${wz >= 0 ? 1 : 0}` : "in";
      const key = [
        mat.shader,
        mat.surface,
        mat.doubleSide ? 1 : 0,
        mat.biomeSkin ? 1 : 0,
        mat.wakeReact || 0,
        mat.emissiveIntensity,
        mat.emissive.getHex(),
        mat.opacity,
        mat.fog,
        mat.rimStrength,
        mat.inkStrength,
        mat.flatShading,
        mat.depthWrite,
        mat.depthTest,
        node.castShadow ? 1 : 0,
        node.receiveShadow ? 1 : 0,
        node.renderOrder,
        mat.batchKey || "",
        sector,
      ].join("|");
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          sample: mat,
          castShadow: node.castShadow,
          receiveShadow: node.receiveShadow,
          renderOrder: node.renderOrder,
          geos: [],
          nodes: [],
        };
        buckets.set(key, bucket);
      }
      bucket.nodes.push(node);
      return;
    }
    for (const c of [...node.children]) collect(c);
  };
  collect(root);
  const rel = new Mat4();
  for (const bucket of buckets.values()) {
    if (bucket.nodes.length < 2) continue;
    let totalV = 0;
    let totalI = 0;
    for (const node of bucket.nodes) {
      const g = node.geometry;
      const v = g.vertexCount;
      totalV += v;
      totalI += g.indices ? g.indices.length : v;
    }
    const outP = new Float32Array(totalV * 3);
    const outN = new Float32Array(totalV * 3);
    const outU = new Float32Array(totalV * 2);
    const outC = new Float32Array(totalV * 3);
    const outI = totalV > 65535 ? new Uint32Array(totalI) : new Uint16Array(totalI);
    let vOff = 0;
    let iOff = 0;
    for (const node of bucket.nodes) {
      const g = node.geometry;
      const p = g.positions;
      const nrm = g.normals;
      const uv = g.uvs;
      const srcC = node.material.vertexColors ? g.colors : null;
      const idx = g.indices;
      const vCount = g.vertexCount;
      rel.multiplyMatrices(rootInv, node.worldMatrix);
      const e = rel.elements;
      const a00 = e[0],
        a01 = e[4],
        a02 = e[8];
      const a10 = e[1],
        a11 = e[5],
        a12 = e[9];
      const a20 = e[2],
        a21 = e[6],
        a22 = e[10];
      const b01 = a22 * a11 - a12 * a21;
      const b11 = -a22 * a10 + a12 * a20;
      const b21 = a21 * a10 - a11 * a20;
      const det = a00 * b01 + a01 * b11 + a02 * b21 || 1;
      const id = 1 / det;
      const n00 = b01 * id,
        n01 = b11 * id,
        n02 = b21 * id;
      const n10 = (-a22 * a01 + a02 * a21) * id,
        n11 = (a22 * a00 - a02 * a20) * id,
        n12 = (-a21 * a00 + a01 * a20) * id;
      const n20 = (a12 * a01 - a02 * a11) * id,
        n21 = (-a12 * a00 + a02 * a10) * id,
        n22 = (a11 * a00 - a01 * a10) * id;
      const col = node.material.color;
      const cr = col.r,
        cg = col.g,
        cb = col.b;
      for (let i = 0; i < vCount; i++) {
        const s3 = i * 3;
        const d3 = (vOff + i) * 3;
        const x = p[s3],
          y = p[s3 + 1],
          z = p[s3 + 2];
        outP[d3] = a00 * x + a01 * y + a02 * z + e[12];
        outP[d3 + 1] = a10 * x + a11 * y + a12 * z + e[13];
        outP[d3 + 2] = a20 * x + a21 * y + a22 * z + e[14];
        const nx = nrm[s3],
          ny = nrm[s3 + 1],
          nz = nrm[s3 + 2];
        const rx = n00 * nx + n01 * ny + n02 * nz;
        const ry = n10 * nx + n11 * ny + n12 * nz;
        const rz = n20 * nx + n21 * ny + n22 * nz;
        const l = Math.hypot(rx, ry, rz) || 1;
        outN[d3] = rx / l;
        outN[d3 + 1] = ry / l;
        outN[d3 + 2] = rz / l;
        const s2 = i * 2;
        const d2 = (vOff + i) * 2;
        outU[d2] = uv[s2];
        outU[d2 + 1] = uv[s2 + 1];
        if (srcC) {
          outC[d3] = srcC[s3] * cr;
          outC[d3 + 1] = srcC[s3 + 1] * cg;
          outC[d3 + 2] = srcC[s3 + 2] * cb;
        } else {
          outC[d3] = cr;
          outC[d3 + 1] = cg;
          outC[d3 + 2] = cb;
        }
      }
      const count = idx ? idx.length : vCount;
      if (det < 0) {
        for (let i = 0; i < count; i += 3) {
          outI[iOff + i] = vOff + (idx ? idx[i] : i);
          outI[iOff + i + 1] = vOff + (idx ? idx[i + 2] : i + 2);
          outI[iOff + i + 2] = vOff + (idx ? idx[i + 1] : i + 1);
        }
      } else {
        for (let i = 0; i < count; i++) outI[iOff + i] = vOff + (idx ? idx[i] : i);
      }
      iOff += count;
      vOff += vCount;
      toRemove.push(node);
    }
    const mergedGeo = new Geometry(outP, outN, outU, outI, outC);
    const mergedMat = new Material({
      shader: bucket.sample.shader,
      color: 0xffffff,
      emissive: bucket.sample.emissive,
      emissiveIntensity: bucket.sample.emissiveIntensity,
      doubleSide: bucket.sample.doubleSide,
      surface: bucket.sample.surface,
      biomeSkin: bucket.sample.biomeSkin,
      wakeReact: bucket.sample.wakeReact,
      vertexColors: true,
      rimStrength: bucket.sample.rimStrength,
      inkStrength: bucket.sample.inkStrength,
      fog: bucket.sample.fog,
      opacity: bucket.sample.opacity,
      flatShading: bucket.sample.flatShading,
      depthWrite: bucket.sample.depthWrite,
      depthTest: bucket.sample.depthTest,
    });
    const mesh = new MeshNode(mergedGeo, mergedMat);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    mesh.renderOrder = bucket.renderOrder;
    root.add(mesh);
  }
  for (const node of toRemove) {
    if (node.parent) node.parent.remove(node);
    node.geometry.dispose();
  }
}
