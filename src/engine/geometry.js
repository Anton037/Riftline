// Procedural and sculpted mesh builder toolkit for Riftline's custom WebGL2 engine.
// All solid builders produce closed, outward-facing indexed triangle meshes with normals, UVs and optional vertex colors.

import { Box3, Color, Euler, Mat4, Quat, Vec3 } from "./math.js";

const TAU = Math.PI * 2;
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + (b - a) * next() };
}

const _col = new Color();
const _e = new Euler();
const _q = new Quat();
const _m = new Mat4();
const _p = new Vec3();
const _s = new Vec3();

export class Geometry {
  constructor(positions, normals, uvs, indices, colors = null, partMeta = null) {
    this.positions = positions instanceof Float32Array ? positions : new Float32Array(positions);
    this.normals = normals instanceof Float32Array ? normals : new Float32Array(normals);
    this.uvs = uvs instanceof Float32Array ? uvs : new Float32Array(uvs);
    const vCount = this.positions.length / 3;
    if (indices) {
      if (indices instanceof Uint16Array || indices instanceof Uint32Array) this.indices = indices;
      else this.indices = vCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    } else {
      this.indices = null;
    }
    this.colors = colors ? (colors instanceof Float32Array ? colors : new Float32Array(colors)) : null;
    this.partMeta = partMeta ? (partMeta instanceof Float32Array ? partMeta : new Float32Array(partMeta)) : null;
    this.bounds = null;
    this.boundingSphere = null;
    this.version = 1;
    this._gpu = null;
    this._disposed = false;
  }
  get vertexCount() {
    return this.positions.length / 3;
  }
  get triangleCount() {
    return this.indices ? this.indices.length / 3 : this.positions.length / 9;
  }
  computeBounds() {
    if (this.bounds && this._boundsVersion === this.version) return this.bounds;
    const b = (this.bounds ||= new Box3()).makeEmpty();
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) b.expandByXYZ(p[i], p[i + 1], p[i + 2]);
    this._boundsVersion = this.version;
    return b;
  }
  computeBoundingSphere() {
    if (this.boundingSphere && this._sphereVersion === this.version) return this.boundingSphere;
    const b = this.computeBounds();
    const s = (this.boundingSphere ||= { cx: 0, cy: 0, cz: 0, r: 0 });
    if (b.isEmpty()) {
      s.cx = 0;
      s.cy = 0;
      s.cz = 0;
      s.r = 0;
      this._sphereVersion = this.version;
      return s;
    }
    const cx = (b.min.x + b.max.x) * 0.5;
    const cy = (b.min.y + b.max.y) * 0.5;
    const cz = (b.min.z + b.max.z) * 0.5;
    let maxR2 = 0;
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - cx;
      const dy = p[i + 1] - cy;
      const dz = p[i + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxR2) maxR2 = d2;
    }
    s.cx = cx;
    s.cy = cy;
    s.cz = cz;
    s.r = Math.sqrt(maxR2);
    this._sphereVersion = this.version;
    return s;
  }
  setPartMeta(kind, pivotY = 0, pivotAux = 0, phaseOffset = 0) {
    const n = this.vertexCount;
    const m = (this.partMeta ||= new Float32Array(n * 4));
    for (let i = 0; i < n * 4; i += 4) {
      m[i] = kind;
      m[i + 1] = pivotY;
      m[i + 2] = pivotAux;
      m[i + 3] = phaseOffset;
    }
    this.version++;
    return this;
  }
  clone() {
    return new Geometry(
      new Float32Array(this.positions),
      new Float32Array(this.normals),
      new Float32Array(this.uvs),
      this.indices
        ? this.indices instanceof Uint32Array
          ? new Uint32Array(this.indices)
          : new Uint16Array(this.indices)
        : null,
      this.colors ? new Float32Array(this.colors) : null,
      this.partMeta ? new Float32Array(this.partMeta) : null,
    );
  }
  translate(dx, dy, dz) {
    if (this.shared) return this.clone().translate(dx, dy, dz);
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += dx;
      p[i + 1] += dy;
      p[i + 2] += dz;
    }
    if (this.partMeta) {
      const m = this.partMeta;
      for (let i = 0; i < m.length; i += 4) {
        const k = m[i];
        if (k > 0.5) {
          m[i + 1] += dy;
          m[i + 2] += k < 1.5 || (k > 4.5 && k < 5.5) ? dz : dx;
        }
      }
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  scale(sx, sy = sx, sz = sx) {
    if (this.shared) return this.clone().scale(sx, sy, sz);
    const p = this.positions,
      n = this.normals;
    const ix = sx ? 1 / sx : 0,
      iy = sy ? 1 / sy : 0,
      iz = sz ? 1 / sz : 0;
    for (let i = 0; i < p.length; i += 3) {
      p[i] *= sx;
      p[i + 1] *= sy;
      p[i + 2] *= sz;
      const nx = n[i] * ix,
        ny = n[i + 1] * iy,
        nz = n[i + 2] * iz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      n[i] = nx / l;
      n[i + 1] = ny / l;
      n[i + 2] = nz / l;
    }
    if (this.partMeta) {
      const m = this.partMeta;
      for (let i = 0; i < m.length; i += 4) {
        const k = m[i];
        if (k > 0.5) {
          m[i + 1] *= sy;
          m[i + 2] *= k < 1.5 || (k > 4.5 && k < 5.5) ? sz : sx;
        }
      }
    }
    if (sx * sy * sz < 0 && this.indices) {
      for (let i = 0; i < this.indices.length; i += 3) {
        const tmp = this.indices[i + 1];
        this.indices[i + 1] = this.indices[i + 2];
        this.indices[i + 2] = tmp;
      }
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  rotateX(a) {
    if (this.shared) return this.clone().rotateX(a);
    const c = Math.cos(a),
      s = Math.sin(a),
      p = this.positions,
      n = this.normals;
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1],
        z = p[i + 2];
      p[i + 1] = y * c - z * s;
      p[i + 2] = y * s + z * c;
      const ny = n[i + 1],
        nz = n[i + 2];
      n[i + 1] = ny * c - nz * s;
      n[i + 2] = ny * s + nz * c;
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  rotateY(a) {
    if (this.shared) return this.clone().rotateY(a);
    const c = Math.cos(a),
      s = Math.sin(a),
      p = this.positions,
      n = this.normals;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i],
        z = p[i + 2];
      p[i] = x * c + z * s;
      p[i + 2] = -x * s + z * c;
      const nx = n[i],
        nz = n[i + 2];
      n[i] = nx * c + nz * s;
      n[i + 2] = -nx * s + nz * c;
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  rotateZ(a) {
    if (this.shared) return this.clone().rotateZ(a);
    const c = Math.cos(a),
      s = Math.sin(a),
      p = this.positions,
      n = this.normals;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i],
        y = p[i + 1];
      p[i] = x * c - y * s;
      p[i + 1] = x * s + y * c;
      const nx = n[i],
        ny = n[i + 1];
      n[i] = nx * c - ny * s;
      n[i + 1] = nx * s + ny * c;
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  applyMatrix4(mat) {
    if (this.shared) return this.clone().applyMatrix4(mat);
    const e = mat.elements,
      p = this.positions,
      n = this.normals;
    // Compute inverse-transpose 3x3 for normals
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
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i],
        y = p[i + 1],
        z = p[i + 2];
      p[i] = a00 * x + a01 * y + a02 * z + e[12];
      p[i + 1] = a10 * x + a11 * y + a12 * z + e[13];
      p[i + 2] = a20 * x + a21 * y + a22 * z + e[14];
      const nx = n[i],
        ny = n[i + 1],
        nz = n[i + 2];
      const rx = n00 * nx + n01 * ny + n02 * nz;
      const ry = n10 * nx + n11 * ny + n12 * nz;
      const rz = n20 * nx + n21 * ny + n22 * nz;
      const l = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      n[i] = rx / l;
      n[i + 1] = ry / l;
      n[i + 2] = rz / l;
    }
    this.bounds = null;
    this.boundingSphere = null;
    this.version++;
    return this;
  }
  setColor(hex) {
    if (this.shared) return this.clone().setColor(hex);
    _col.setHex(hex);
    const n = this.vertexCount;
    const c = (this.colors ||= new Float32Array(n * 3));
    for (let i = 0; i < n * 3; i += 3) {
      c[i] = _col.r;
      c[i + 1] = _col.g;
      c[i + 2] = _col.b;
    }
    this.version++;
    return this;
  }
  tintGradientY(botHex, topHex) {
    if (this.shared) return this.clone().tintGradientY(botHex, topHex);
    const b = this.computeBounds();
    const minY = b.min.y,
      span = Math.max(1e-4, b.max.y - minY);
    const cBot = new Color(botHex),
      cTop = new Color(topHex);
    const p = this.positions,
      n = this.vertexCount;
    const c = (this.colors ||= new Float32Array(n * 3));
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, (p[i * 3 + 1] - minY) / span));
      c[i * 3] = cBot.r + (cTop.r - cBot.r) * t;
      c[i * 3 + 1] = cBot.g + (cTop.g - cBot.g) * t;
      c[i * 3 + 2] = cBot.b + (cTop.b - cBot.b) * t;
    }
    this.version++;
    return this;
  }
  computeNormals() {
    const p = this.positions,
      n = this.normals,
      idx = this.indices;
    n.fill(0);
    const count = idx ? idx.length : p.length / 3;
    for (let i = 0; i < count; i += 3) {
      const ia = (idx ? idx[i] : i) * 3;
      const ib = (idx ? idx[i + 1] : i + 1) * 3;
      const ic = (idx ? idx[i + 2] : i + 2) * 3;
      const ax = p[ib] - p[ia],
        ay = p[ib + 1] - p[ia + 1],
        az = p[ib + 2] - p[ia + 2];
      const bx = p[ic] - p[ia],
        by = p[ic + 1] - p[ia + 1],
        bz = p[ic + 2] - p[ia + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      n[ia] += nx;
      n[ia + 1] += ny;
      n[ia + 2] += nz;
      n[ib] += nx;
      n[ib + 1] += ny;
      n[ib + 2] += nz;
      n[ic] += nx;
      n[ic + 1] += ny;
      n[ic + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) {
      const nx = n[i],
        ny = n[i + 1],
        nz = n[i + 2];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      n[i] = nx / l;
      n[i + 1] = ny / l;
      n[i + 2] = nz / l;
    }
    this.version++;
    return this;
  }
  toFlatShaded() {
    if (this.shared && this._flatCache) return this._flatCache;
    const p = this.positions,
      uv = this.uvs,
      c = this.colors,
      pm = this.partMeta,
      idx = this.indices;
    const count = idx ? idx.length : p.length / 3;
    const outP = new Float32Array(count * 3);
    const outN = new Float32Array(count * 3);
    const outU = new Float32Array(count * 2);
    const outC = c ? new Float32Array(count * 3) : null;
    const outM = pm ? new Float32Array(count * 4) : null;
    const outI = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx[i] : i;
      const i1 = idx ? idx[i + 1] : i + 1;
      const i2 = idx ? idx[i + 2] : i + 2;
      const ax = p[i1 * 3] - p[i0 * 3],
        ay = p[i1 * 3 + 1] - p[i0 * 3 + 1],
        az = p[i1 * 3 + 2] - p[i0 * 3 + 2];
      const bx = p[i2 * 3] - p[i0 * 3],
        by = p[i2 * 3 + 1] - p[i0 * 3 + 1],
        bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
      let nx = ay * bz - az * by,
        ny = az * bx - ax * bz,
        nz = ax * by - ay * bx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const verts = [i0, i1, i2];
      for (let k = 0; k < 3; k++) {
        const src = verts[k],
          dst = i + k;
        outI[dst] = dst;
        outP[dst * 3] = p[src * 3];
        outP[dst * 3 + 1] = p[src * 3 + 1];
        outP[dst * 3 + 2] = p[src * 3 + 2];
        outN[dst * 3] = nx;
        outN[dst * 3 + 1] = ny;
        outN[dst * 3 + 2] = nz;
        outU[dst * 2] = uv[src * 2];
        outU[dst * 2 + 1] = uv[src * 2 + 1];
        if (outC) {
          outC[dst * 3] = c[src * 3];
          outC[dst * 3 + 1] = c[src * 3 + 1];
          outC[dst * 3 + 2] = c[src * 3 + 2];
        }
        if (outM) {
          outM[dst * 4] = pm[src * 4];
          outM[dst * 4 + 1] = pm[src * 4 + 1];
          outM[dst * 4 + 2] = pm[src * 4 + 2];
          outM[dst * 4 + 3] = pm[src * 4 + 3];
        }
      }
    }
    const flat = new Geometry(outP, outN, outU, outI, outC, outM);
    if (this.shared) {
      flat.shared = true;
      flat.computeBounds();
      this._flatCache = flat;
    }
    return flat;
  }
  dispose() {
    if (this.shared) return;
    if (this._gpu) {
      const { gl, vao, vboPos, vboNorm, vboUv, vboCol, vboPart, ibo } = this._gpu;
      if (gl && !gl.isContextLost()) {
        if (vao) gl.deleteVertexArray(vao);
        if (vboPos) gl.deleteBuffer(vboPos);
        if (vboNorm) gl.deleteBuffer(vboNorm);
        if (vboUv) gl.deleteBuffer(vboUv);
        if (vboCol) gl.deleteBuffer(vboCol);
        if (vboPart) gl.deleteBuffer(vboPart);
        if (ibo) gl.deleteBuffer(ibo);
      }
      this._gpu = null;
    }
    this._disposed = true;
  }
}

export function mergeGeometries(list) {
  const valid = list.filter((g) => g && g.positions.length > 0);
  if (!valid.length) return new Geometry([], [], [], []);
  let totalVerts = 0,
    totalIdx = 0;
  const anyColors = valid.some((g) => g.colors);
  const anyPartMeta = valid.some((g) => g.partMeta);
  for (const g of valid) {
    totalVerts += g.vertexCount;
    totalIdx += g.indices ? g.indices.length : g.vertexCount;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const col = anyColors ? new Float32Array(totalVerts * 3) : null;
  const meta = anyPartMeta ? new Float32Array(totalVerts * 4) : null;
  const idx = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  let vOff = 0,
    iOff = 0;
  for (const g of valid) {
    const vc = g.vertexCount;
    pos.set(g.positions, vOff * 3);
    norm.set(g.normals, vOff * 3);
    uv.set(g.uvs, vOff * 2);
    if (col) {
      if (g.colors) col.set(g.colors, vOff * 3);
      else col.fill(1, vOff * 3, (vOff + vc) * 3);
    }
    if (meta && g.partMeta) {
      meta.set(g.partMeta, vOff * 4);
    }
    if (g.indices) {
      const src = g.indices;
      for (let i = 0; i < src.length; i++) idx[iOff++] = src[i] + vOff;
    } else {
      for (let i = 0; i < vc; i++) idx[iOff++] = vOff + i;
    }
    vOff += vc;
  }
  return new Geometry(pos, norm, uv, idx, col, meta);
}

/** Build a colored transformed mesh part for merging into composite actor/prop kits. */
export function meshPart(geometry, color, p = {}) {
  const g = geometry.clone();
  _p.set(p.x || 0, p.y || 0, p.z || 0);
  _e.set(p.rx || 0, p.ry || 0, p.rz || 0, "XYZ");
  _q.setFromEuler(_e);
  _s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  if (color != null) g.setColor(color);
  if (p.anim) {
    const a = p.anim;
    g.setPartMeta(a[0], a[1] ?? (p.y || 0), a[2] ?? 0, a[3] ?? 0);
  }
  return g;
}

export function box(w = 1, h = 1, d = 1) {
  const hw = w * 0.5,
    hh = h * 0.5,
    hd = d * 0.5;
  const faces = [
    {
      n: [1, 0, 0],
      c: [
        [hw, -hh, hd],
        [hw, -hh, -hd],
        [hw, hh, -hd],
        [hw, hh, hd],
      ],
    },
    {
      n: [-1, 0, 0],
      c: [
        [-hw, -hh, -hd],
        [-hw, -hh, hd],
        [-hw, hh, hd],
        [-hw, hh, -hd],
      ],
    },
    {
      n: [0, 1, 0],
      c: [
        [-hw, hh, hd],
        [hw, hh, hd],
        [hw, hh, -hd],
        [-hw, hh, -hd],
      ],
    },
    {
      n: [0, -1, 0],
      c: [
        [-hw, -hh, -hd],
        [hw, -hh, -hd],
        [hw, -hh, hd],
        [-hw, -hh, hd],
      ],
    },
    {
      n: [0, 0, 1],
      c: [
        [-hw, -hh, hd],
        [hw, -hh, hd],
        [hw, hh, hd],
        [-hw, hh, hd],
      ],
    },
    {
      n: [0, 0, -1],
      c: [
        [hw, -hh, -hd],
        [-hw, -hh, -hd],
        [-hw, hh, -hd],
        [hw, hh, -hd],
      ],
    },
  ];
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  let v = 0;
  for (const f of faces) {
    for (let i = 0; i < 4; i++) {
      pos.push(...f.c[i]);
      norm.push(...f.n);
      uv.push(...uvs[i]);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  return new Geometry(pos, norm, uv, idx);
}

/** Closed outward-facing beveled solid staying strictly inside [-w/2, w/2] x [-h/2, h/2] x [-d/2, d/2]. */
export function beveledBox(w, h, d, bevel = Math.min(w, h, d) * 0.14) {
  const b = Math.min(bevel, w * 0.25, h * 0.25, d * 0.25);
  const hx = w * 0.5,
    hy = h * 0.5,
    hz = d * 0.5;
  const ix = hx - b,
    iy = hy - b,
    iz = hz - b;
  const rings = [
    [-hy, ix, iz],
    [-iy, hx, hz],
    [iy, hx, hz],
    [hy, ix, iz],
  ];
  const profile = (rx, rz) => [
    [rx, rz - b],
    [rx - b, rz],
    [-(rx - b), rz],
    [-rx, rz - b],
    [-rx, -(rz - b)],
    [-(rx - b), -rz],
    [rx - b, -rz],
    [rx, -(rz - b)],
  ];
  const verts = [];
  const uvs = [];
  const ringPts = rings.map(([y, rx, rz], ri) => {
    const p = profile(rx, rz);
    return p.map(([x, z], i) => {
      const id = verts.length / 3;
      verts.push(x, y, z);
      uvs.push(i / 8, ri / 3);
      return id;
    });
  });
  const botCenter = verts.length / 3;
  verts.push(0, -hy, 0);
  uvs.push(0.5, 0.5);
  const topCenter = verts.length / 3;
  verts.push(0, hy, 0);
  uvs.push(0.5, 0.5);
  const idx = [];
  const N = 8;
  for (let r = 0; r < 3; r++) {
    const a = ringPts[r],
      c = ringPts[r + 1];
    for (let i = 0; i < N; i++) {
      const ni = (i + 1) % N;
      idx.push(a[i], c[ni], a[ni], a[i], c[i], c[ni]);
    }
  }
  for (let i = 0; i < N; i++) {
    const ni = (i + 1) % N;
    idx.push(botCenter, ringPts[0][i], ringPts[0][ni]);
    idx.push(topCenter, ringPts[3][ni], ringPts[3][i]);
  }
  const g = new Geometry(verts, new Float32Array(verts.length), uvs, idx);
  g.computeNormals();
  return g;
}

export function cylinder(rTop = 0.5, rBot = 0.5, h = 1, segs = 12, openEnded = false) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  const hy = h * 0.5;
  const slope = (rBot - rTop) / (h || 1);
  // Side
  for (let y = 0; y <= 1; y++) {
    const r = y === 0 ? rBot : rTop;
    const py = y === 0 ? -hy : hy;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      const ca = Math.cos(a),
        sa = Math.sin(a);
      pos.push(ca * r, py, sa * r);
      const nl = Math.hypot(ca, slope, sa) || 1;
      norm.push(ca / nl, slope / nl, sa / nl);
      uv.push(u, y);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < segs; i++) {
    idx.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
  }
  if (!openEnded) {
    if (rTop > 1e-5) {
      const c = pos.length / 3;
      pos.push(0, hy, 0);
      norm.push(0, 1, 0);
      uv.push(0.5, 0.5);
      const start = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU;
        pos.push(Math.cos(a) * rTop, hy, Math.sin(a) * rTop);
        norm.push(0, 1, 0);
        uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (let i = 0; i < segs; i++) idx.push(c, start + i + 1, start + i);
    }
    if (rBot > 1e-5) {
      const c = pos.length / 3;
      pos.push(0, -hy, 0);
      norm.push(0, -1, 0);
      uv.push(0.5, 0.5);
      const start = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU;
        pos.push(Math.cos(a) * rBot, -hy, Math.sin(a) * rBot);
        norm.push(0, -1, 0);
        uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (let i = 0; i < segs; i++) idx.push(c, start + i, start + i + 1);
    }
  }
  return new Geometry(pos, norm, uv, idx);
}

export function cone(r = 0.5, h = 1, segs = 10) {
  return cylinder(0.001, r, h, segs, false);
}

export function sphere(r = 1, wSegs = 14, hSegs = 10) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let y = 0; y <= hSegs; y++) {
    const v = y / hSegs;
    const phi = v * Math.PI;
    const sp = Math.sin(phi),
      cp = Math.cos(phi);
    for (let x = 0; x <= wSegs; x++) {
      const u = x / wSegs;
      const th = u * TAU;
      const nx = Math.cos(th) * sp,
        ny = cp,
        nz = Math.sin(th) * sp;
      pos.push(nx * r, ny * r, nz * r);
      norm.push(nx, ny, nz);
      uv.push(u, 1 - v);
    }
  }
  const row = wSegs + 1;
  for (let y = 0; y < hSegs; y++) {
    for (let x = 0; x < wSegs; x++) {
      const a = y * row + x,
        b = a + 1,
        c = a + row,
        d = c + 1;
      if (y > 0) idx.push(a, b, c);
      if (y < hSegs - 1) idx.push(b, d, c);
    }
  }
  return new Geometry(pos, norm, uv, idx);
}

export function octahedron(r = 1) {
  const V = [
    [0, r, 0],
    [r, 0, 0],
    [0, 0, r],
    [-r, 0, 0],
    [0, 0, -r],
    [0, -r, 0],
  ];
  const F = [
    [0, 2, 1],
    [0, 3, 2],
    [0, 4, 3],
    [0, 1, 4],
    [5, 1, 2],
    [5, 2, 3],
    [5, 3, 4],
    [5, 4, 1],
  ];
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let i = 0; i < F.length; i++) {
    const [a, b, c] = F[i];
    const pa = V[a],
      pb = V[b],
      pc = V[c];
    const ux = pb[0] - pa[0],
      uy = pb[1] - pa[1],
      uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0],
      vy = pc[1] - pa[1],
      vz = pc[2] - pa[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = pos.length / 3;
    pos.push(...pa, ...pb, ...pc);
    norm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uv.push(0.5, 1, 0, 0, 1, 0);
    idx.push(base, base + 1, base + 2);
  }
  return new Geometry(pos, norm, uv, idx);
}

export function icosahedron(r = 1, detail = 0) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [(x / l) * r, (y / l) * r, (z / l) * r];
  });
  let faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const midCache = new Map();
    const mid = (a, b) => {
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (midCache.has(k)) return midCache.get(k);
      const va = verts[a],
        vb = verts[b];
      const mx = (va[0] + vb[0]) * 0.5,
        my = (va[1] + vb[1]) * 0.5,
        mz = (va[2] + vb[2]) * 0.5;
      const l = Math.hypot(mx, my, mz) || 1;
      const id = verts.length;
      verts.push([(mx / l) * r, (my / l) * r, (mz / l) * r]);
      midCache.set(k, id);
      return id;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (const [x, y, z] of verts) {
    const l = Math.hypot(x, y, z) || 1;
    pos.push(x, y, z);
    norm.push(x / l, y / l, z / l);
    uv.push(Math.atan2(z, x) / TAU + 0.5, Math.acos(Math.max(-1, Math.min(1, y / l))) / Math.PI);
  }
  for (const [a, b, c] of faces) idx.push(a, b, c);
  return new Geometry(pos, norm, uv, idx);
}

export function torus(R = 1, r = 0.2, tubeSegs = 6, radSegs = 20) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let j = 0; j <= radSegs; j++) {
    const u = j / radSegs;
    const phi = u * TAU;
    const cp = Math.cos(phi),
      sp = Math.sin(phi);
    for (let i = 0; i <= tubeSegs; i++) {
      const v = i / tubeSegs;
      const th = v * TAU;
      const ct = Math.cos(th),
        st = Math.sin(th);
      const x = (R + r * ct) * cp;
      const y = (R + r * ct) * sp;
      const z = r * st;
      pos.push(x, y, z);
      norm.push(ct * cp, ct * sp, st);
      uv.push(u, v);
    }
  }
  const row = tubeSegs + 1;
  for (let j = 0; j < radSegs; j++) {
    for (let i = 0; i < tubeSegs; i++) {
      const a = j * row + i,
        b = (j + 1) * row + i,
        c = b + 1,
        d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  return new Geometry(pos, norm, uv, idx);
}

export function plane(w = 1, h = 1, sx = 1, sy = 1) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let iy = 0; iy <= sy; iy++) {
    const v = iy / sy;
    const py = (0.5 - v) * h;
    for (let ix = 0; ix <= sx; ix++) {
      const u = ix / sx;
      pos.push((u - 0.5) * w, py, 0);
      norm.push(0, 0, 1);
      uv.push(u, 1 - v);
    }
  }
  const row = sx + 1;
  for (let iy = 0; iy < sy; iy++) {
    for (let ix = 0; ix < sx; ix++) {
      const a = iy * row + ix,
        b = a + 1,
        c = a + row,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return new Geometry(pos, norm, uv, idx);
}

/** Horizontal disc in XZ plane facing +Y. */
export function ringBlade(r = 1, segs = 32) {
  const pos = [0, 0, 0],
    norm = [0, 1, 0],
    uv = [0.5, 0.5],
    idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    pos.push(ca * r, 0, sa * r);
    norm.push(0, 1, 0);
    uv.push(0.5 + ca * 0.5, 0.5 + sa * 0.5);
  }
  for (let i = 0; i < segs; i++) idx.push(0, i + 2, i + 1);
  return new Geometry(pos, norm, uv, idx);
}

/** Vertical disc in XY plane facing +Z (ideal for crisp camera-facing billboard halos). */
export function discXY(r = 0.5, segs = 16) {
  const pos = [0, 0, 0],
    norm = [0, 0, 1],
    uv = [0.5, 0.5],
    idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    pos.push(ca * r, sa * r, 0);
    norm.push(0, 0, 1);
    uv.push(0.5 + ca * 0.5, 0.5 + sa * 0.5);
  }
  for (let i = 0; i < segs; i++) idx.push(0, i + 1, i + 2);
  return new Geometry(pos, norm, uv, idx);
}

/** Horizontal flat ring in XZ plane facing +Y. */
export function ring(innerR = 0.85, outerR = 1, segs = 36) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * TAU;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    pos.push(ca * innerR, 0, sa * innerR);
    norm.push(0, 1, 0);
    uv.push(u, 0);
    pos.push(ca * outerR, 0, sa * outerR);
    norm.push(0, 1, 0);
    uv.push(u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2,
      b = a + 1,
      c = a + 2,
      d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  return new Geometry(pos, norm, uv, idx);
}

/** Surface of revolution around Y axis from [[radius, y], ...] profile points. */
export function lathe(points, segs = 12) {
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  const m = points.length;
  for (let j = 0; j < m; j++) {
    const [r, y] = points[j];
    const v = j / Math.max(1, m - 1);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      norm.push(Math.cos(a), 0, Math.sin(a));
      uv.push(u, v);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i,
        b = a + 1,
        c = a + row,
        d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new Geometry(pos, norm, uv, idx);
  g.computeNormals();
  return g;
}

/** Closed outward-facing solid of revolution around Y from ascending [[radius, y], ...] profile points. */
export function closedLathe(points, segs = 10) {
  const pos = [],
    uv = [],
    idx = [];
  const m = points.length;
  const ringStarts = [];
  for (let j = 0; j < m; j++) {
    const [r, y] = points[j];
    const v = j / Math.max(1, m - 1);
    ringStarts.push(pos.length / 3);
    for (let i = 0; i < segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < m - 1; j++) {
    const a0 = ringStarts[j],
      b0 = ringStarts[j + 1];
    for (let i = 0; i < segs; i++) {
      const ni = (i + 1) % segs;
      idx.push(a0 + i, b0 + i, a0 + ni, a0 + ni, b0 + i, b0 + ni);
    }
  }
  if (points[0][0] > 1e-4) {
    const botC = pos.length / 3;
    pos.push(0, points[0][1], 0);
    uv.push(0.5, 0);
    const r0 = ringStarts[0];
    for (let i = 0; i < segs; i++) idx.push(botC, r0 + i, r0 + ((i + 1) % segs));
  }
  if (points[m - 1][0] > 1e-4) {
    const topC = pos.length / 3;
    pos.push(0, points[m - 1][1], 0);
    uv.push(0.5, 1);
    const rt = ringStarts[m - 1];
    for (let i = 0; i < segs; i++) idx.push(topC, rt + ((i + 1) % segs), rt + i);
  }
  const g = new Geometry(pos, new Float32Array(pos.length), uv, idx);
  g.computeNormals();
  return g;
}

/** Closed sculpted faceted rock/monolith guaranteed strictly inside [-w/2, w/2] x [0, h] x [-d/2, d/2]. */
export function sculptedRock(w, h, d, seed = 1, round = false) {
  const rng = makeRng(seed);
  const segs = round ? 10 : 8;
  const rows = 4;
  const hw = w * 0.5,
    hd = d * 0.5;
  const pos = [],
    uv = [],
    idx = [];
  const phase = rng.range(0, TAU);
  const phase2 = rng.range(0, TAU);
  const ringStarts = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y = t * h;
    const taper = r === 0 ? 0.96 : r === rows ? 0.58 : 0.98 - t * 0.16;
    ringStarts.push(pos.length / 3);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const wave = 0.86 + 0.12 * Math.cos(a * 3 + phase + t * 2.1) + 0.06 * Math.sin(a * 5 + phase2);
      let x, z;
      if (round) {
        x = Math.cos(a) * hw * taper * wave;
        z = Math.sin(a) * hd * taper * wave;
      } else {
        const ca = Math.cos(a),
          sa = Math.sin(a);
        const sq = 1 / Math.max(Math.abs(ca), Math.abs(sa), 0.7071);
        const blend = 0.68 * sq + 0.32;
        x = Math.max(-hw, Math.min(hw, ca * blend * hw * taper * wave));
        z = Math.max(-hd, Math.min(hd, sa * blend * hd * taper * wave));
      }
      const py = r === 0 ? 0 : r === rows ? Math.min(h, h * (0.9 + 0.09 * Math.cos(a * 2 + phase))) : y;
      pos.push(x, py, z);
      uv.push(i / segs, t);
    }
  }
  const botC = pos.length / 3;
  pos.push(0, 0, 0);
  uv.push(0.5, 0);
  const topC = pos.length / 3;
  pos.push(0, h, 0);
  uv.push(0.5, 1);
  for (let r = 0; r < rows; r++) {
    const a0 = ringStarts[r],
      b0 = ringStarts[r + 1];
    for (let i = 0; i < segs; i++) {
      const ni = (i + 1) % segs;
      idx.push(a0 + i, b0 + i, a0 + ni, a0 + ni, b0 + i, b0 + ni);
    }
  }
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    idx.push(botC, ringStarts[0] + i, ringStarts[0] + ni);
    idx.push(topC, ringStarts[rows] + ni, ringStarts[rows] + i);
  }
  const g = new Geometry(pos, new Float32Array(pos.length), uv, idx);
  g.computeNormals();
  return g;
}

/** Closed faceted crystal/glass shard strictly inside [-w/2, w/2] x [0, h] x [-d/2, d/2]. */
export function sculptedCrystal(w, h, d, seed = 1) {
  const rng = makeRng(seed);
  const segs = 6;
  const hw = w * 0.5,
    hd = d * 0.5;
  const pos = [],
    uv = [],
    idx = [];
  const off = rng.range(0, TAU);
  const midY = h * rng.range(0.52, 0.72);
  const tipX = rng.range(-hw * 0.22, hw * 0.22);
  const tipZ = rng.range(-hd * 0.22, hd * 0.22);
  // Base ring (0..segs-1) and shoulder ring (segs..2*segs-1)
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU + off;
    const k = 0.72 + 0.24 * Math.abs(Math.cos(a * 2 + off));
    pos.push(Math.cos(a) * hw * k, 0, Math.sin(a) * hd * k);
    uv.push(i / segs, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU + off;
    const k = 0.8 + 0.18 * Math.abs(Math.sin(a * 3 + off));
    pos.push(Math.cos(a) * hw * k, midY * (0.92 + 0.08 * Math.sin(a * 2)), Math.sin(a) * hd * k);
    uv.push(i / segs, 0.65);
  }
  const botC = pos.length / 3;
  pos.push(0, 0, 0);
  uv.push(0.5, 0);
  const tip = pos.length / 3;
  pos.push(tipX, h, tipZ);
  uv.push(0.5, 1);
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    idx.push(i, segs + i, ni, ni, segs + i, segs + ni);
    idx.push(segs + i, tip, segs + ni);
    idx.push(botC, i, ni);
  }
  const g = new Geometry(pos, new Float32Array(pos.length), uv, idx);
  g.computeNormals();
  return g;
}

/** Closed sculpted bioluminescent mushroom cap inside cylinder radius `radius` and height `[0, height]`. */
export function sculptedCap(radius, height, seed = 1) {
  const rng = makeRng(seed);
  const segs = 14,
    rings = 4;
  const phase = rng.range(0, TAU);
  const pos = [],
    uv = [],
    idx = [];
  const starts = [];
  // Underside rim -> outer bell -> crown
  const profile = [
    [0.42, 0.0],
    [0.98, 0.14],
    [0.92, 0.48],
    [0.62, 0.82],
    [0.24, 0.96],
  ];
  for (let r = 0; r <= rings; r++) {
    starts.push(pos.length / 3);
    const [pr, py] = profile[r];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU;
      const flute = r === 1 || r === 2 ? 0.93 + 0.07 * Math.cos(a * 5 + phase) : 1;
      const rad = Math.min(radius, radius * pr * flute);
      const y = Math.max(0, Math.min(height, height * py * (r === 1 ? 0.9 + 0.1 * Math.sin(a * 3 + phase) : 1)));
      pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
      uv.push(i / segs, r / rings);
    }
  }
  const botC = pos.length / 3;
  pos.push(0, 0, 0);
  uv.push(0.5, 0);
  const topC = pos.length / 3;
  pos.push(0, height, 0);
  uv.push(0.5, 1);
  for (let r = 0; r < rings; r++) {
    const a0 = starts[r],
      b0 = starts[r + 1];
    for (let i = 0; i < segs; i++) {
      const ni = (i + 1) % segs;
      idx.push(a0 + i, b0 + i, a0 + ni, a0 + ni, b0 + i, b0 + ni);
    }
  }
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    idx.push(botC, starts[0] + i, starts[0] + ni);
    idx.push(topC, starts[rings] + ni, starts[rings] + i);
  }
  const g = new Geometry(pos, new Float32Array(pos.length), uv, idx);
  g.computeNormals();
  return g;
}

/** Snow blanket resting on upward-facing triangles of a sculpted rock. */
export function snowCoat(sourceGeo, lift = 0.025, minNy = 0.45) {
  const p = sourceGeo.positions,
    n = sourceGeo.normals,
    srcIdx = sourceGeo.indices;
  const b = sourceGeo.computeBounds();
  const minH = b.min.y + (b.max.y - b.min.y) * 0.52;
  const outP = [],
    outN = [],
    outU = [],
    outI = [];
  const map = new Map();
  const addVert = (vi) => {
    if (map.has(vi)) return map.get(vi);
    const id = outP.length / 3;
    outP.push(p[vi * 3], p[vi * 3 + 1] + lift, p[vi * 3 + 2]);
    outN.push(n[vi * 3], n[vi * 3 + 1], n[vi * 3 + 2]);
    outU.push(sourceGeo.uvs[vi * 2], sourceGeo.uvs[vi * 2 + 1]);
    map.set(vi, id);
    return id;
  };
  const count = srcIdx ? srcIdx.length : p.length / 3;
  for (let i = 0; i < count; i += 3) {
    const a = srcIdx ? srcIdx[i] : i;
    const b1 = srcIdx ? srcIdx[i + 1] : i + 1;
    const c = srcIdx ? srcIdx[i + 2] : i + 2;
    const ay = p[a * 3 + 1],
      by = p[b1 * 3 + 1],
      cy = p[c * 3 + 1];
    if (Math.min(ay, by, cy) < minH) continue;
    const ux = p[b1 * 3] - p[a * 3],
      uy = by - ay,
      uz = p[b1 * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3],
      vy = cy - ay,
      vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    if (ny / l >= minNy) {
      outI.push(addVert(a), addVert(b1), addVert(c));
    }
  }
  return new Geometry(outP, outN, outU, outI);
}

/** Helical swirling funnel ribbon for Sun Dunes dust devils. */
export function dustRibbon(phase = 0) {
  const steps = 22;
  const pos = [],
    norm = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * 2.75;
    const rad = 0.24 + Math.pow(t, 1.3) * 0.92;
    const a = phase + t * TAU * 1.65;
    const w = 0.26 * Math.sin(t * Math.PI) + 0.06;
    const ca = Math.cos(a),
      sa = Math.sin(a);
    pos.push(ca * rad, y - w * 0.5, sa * rad);
    norm.push(ca, 0.2, sa);
    uv.push(t, 0);
    pos.push(ca * (rad + 0.06), y + w * 0.5, sa * (rad + 0.06));
    norm.push(ca, 0.2, sa);
    uv.push(t, 1);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2,
      b = a + 1,
      c = a + 2,
      d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  return new Geometry(pos, norm, uv, idx);
}
