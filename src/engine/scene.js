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
  } = {}) {
    this.width = width;
    this.height = height;
    this.data = data;
    this.image = image;
    this.format = format; // "rgba" | "r8"
    this.wrap = wrap; // "repeat" | "clamp"
    this.filter = filter; // "linear" | "nearest"
    this.flipY = flipY;
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
      const { gl, tex } = this._gpu;
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
  }
  dispose() {
    // Textures owned globally are disposed by their owners.
  }
}

export class Node {
  constructor() {
    this.position = new Vec3();
    this.rotation = new Euler();
    this.scale = new Vec3(1, 1, 1);
    this.visible = true;
    this.parent = null;
    this.children = [];
    this.localMatrix = new Mat4();
    this.worldMatrix = new Mat4();
    this.userData = {};
  }
  add(...nodes) {
    for (const n of nodes) {
      if (!n || n === this) continue;
      if (n.parent) n.parent.remove(n);
      n.parent = this;
      this.children.push(n);
    }
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
    return this;
  }
  traverse(fn) {
    fn(this);
    for (let i = 0; i < this.children.length; i++) this.children[i].traverse(fn);
  }
  updateLocalMatrix() {
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
  updateWorldMatrix(updateChildren = true) {
    this.updateLocalMatrix();
    if (this.parent) {
      if (this._isIdentity) this.worldMatrix.copy(this.parent.worldMatrix);
      else if (this.parent._worldIdentity) this.worldMatrix.copy(this.localMatrix);
      else this.worldMatrix.multiplyMatrices(this.parent.worldMatrix, this.localMatrix);
      this._worldIdentity = this._isIdentity && !!this.parent._worldIdentity;
    } else {
      this.worldMatrix.copy(this.localMatrix);
      this._worldIdentity = this._isIdentity;
    }
    if (updateChildren) {
      const ch = this.children;
      for (let i = 0; i < ch.length; i++) ch[i].updateWorldMatrix(true);
    }
  }
  getWorldPosition(out = new Vec3()) {
    // Walk up chain so calling getWorldPosition right after mutating local transform is exact.
    const chain = [];
    for (let cur = this; cur; cur = cur.parent) chain.push(cur);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].updateWorldMatrix(false);
    const e = this.worldMatrix.elements;
    return out.set(e[12], e[13], e[14]);
  }
}

export class MeshNode extends Node {
  constructor(geometry, material) {
    super();
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 0;
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
      const { gl, vao, matBuf, colBuf, flashBuf } = this._gpuInst;
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

/** Merge static opaque meshes inside `root` by shader/surface/material signature to slash draw calls. */
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
      (node.material.shader === "stylized" || node.material.shader === "emissive") &&
      !node.material.reedWind
    ) {
      const mat = node.material;
      const key = [
        mat.shader,
        mat.surface,
        mat.doubleSide ? 1 : 0,
        mat.biomeSkin ? 1 : 0,
        mat.emissiveIntensity.toFixed(2),
        mat.emissive.getHex(),
        node.castShadow ? 1 : 0,
        node.receiveShadow ? 1 : 0,
        node.renderOrder,
        mat.batchKey || "",
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
      const srcC = g.colors;
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
      if (idx) {
        if (det < 0) {
          for (let i = 0; i < idx.length; i += 3) {
            outI[iOff + i] = idx[i] + vOff;
            outI[iOff + i + 1] = idx[i + 2] + vOff;
            outI[iOff + i + 2] = idx[i + 1] + vOff;
          }
        } else {
          for (let i = 0; i < idx.length; i++) outI[iOff + i] = idx[i] + vOff;
        }
        iOff += idx.length;
      } else {
        for (let i = 0; i < vCount; i++) outI[iOff + i] = vOff + i;
        iOff += vCount;
      }
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
      vertexColors: true,
      rimStrength: bucket.sample.rimStrength,
      inkStrength: bucket.sample.inkStrength,
      fog: bucket.sample.fog,
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
