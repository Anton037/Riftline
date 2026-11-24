// Allocation-free 3D math, color, bounding box and camera primitives for Riftline's WebGL2 engine.

export class Color {
  constructor(r = 1, g, b) {
    if (g === undefined) {
      this.r = 1;
      this.g = 1;
      this.b = 1;
      if (typeof r === "number") this.setHex(r);
      else if (r && typeof r === "object") this.copy(r);
    } else {
      this.r = r;
      this.g = g;
      this.b = b;
    }
  }
  get isColor() {
    return true;
  }
  setHex(hex) {
    hex = Math.floor(hex) & 0xffffff;
    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;
    return this;
  }
  getHex() {
    const r = Math.max(0, Math.min(255, Math.round(this.r * 255)));
    const g = Math.max(0, Math.min(255, Math.round(this.g * 255)));
    const b = Math.max(0, Math.min(255, Math.round(this.b * 255)));
    return (r << 16) | (g << 8) | b;
  }
  setRGB(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }
  setScalar(s) {
    this.r = s;
    this.g = s;
    this.b = s;
    return this;
  }
  copy(c) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }
  clone() {
    return new Color(this.r, this.g, this.b);
  }
  multiplyScalar(s) {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }
  lerp(c, t) {
    this.r += (c.r - this.r) * t;
    this.g += (c.g - this.g) * t;
    this.b += (c.b - this.b) * t;
    return this;
  }
}

export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }
  clone() {
    return new Vec2(this.x, this.y);
  }
}

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  setScalar(s) {
    this.x = s;
    this.y = s;
    this.z = s;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
  toArray(out = [0, 0, 0]) {
    out[0] = this.x;
    out[1] = this.y;
    out[2] = this.z;
    return out;
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l;
    this.y /= l;
    this.z /= l;
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  crossVectors(a, b) {
    const ax = a.x,
      ay = a.y,
      az = a.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  applyMatrix4(m) {
    const e = m.elements;
    const x = this.x,
      y = this.y,
      z = this.z;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }
}

export class Vec4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
}

export class Euler {
  constructor(x = 0, y = 0, z = 0, order = "XYZ") {
    this.x = x;
    this.y = y;
    this.z = z;
    this.order = order;
  }
  set(x, y, z, order = this.order) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.order = order;
    return this;
  }
  copy(e) {
    this.x = e.x;
    this.y = e.y;
    this.z = e.z;
    this.order = e.order;
    return this;
  }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  setFromEuler(e) {
    const c1 = Math.cos(e.x * 0.5),
      c2 = Math.cos(e.y * 0.5),
      c3 = Math.cos(e.z * 0.5);
    const s1 = Math.sin(e.x * 0.5),
      s2 = Math.sin(e.y * 0.5),
      s3 = Math.sin(e.z * 0.5);
    switch (e.order) {
      case "YZX":
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 + s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
      case "YXZ":
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 - s1 * s2 * c3;
        this.w = c1 * c2 * c3 + s1 * s2 * s3;
        break;
      default: // XYZ
        this.x = s1 * c2 * c3 + c1 * s2 * s3;
        this.y = c1 * s2 * c3 - s1 * c2 * s3;
        this.z = c1 * c2 * s3 + s1 * s2 * c3;
        this.w = c1 * c2 * c3 - s1 * s2 * s3;
        break;
    }
    return this;
  }
}

export class Mat4 {
  constructor() {
    this.elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  identity() {
    const e = this.elements;
    e[0] = 1;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;
    e[4] = 0;
    e[5] = 1;
    e[6] = 0;
    e[7] = 0;
    e[8] = 0;
    e[9] = 0;
    e[10] = 1;
    e[11] = 0;
    e[12] = 0;
    e[13] = 0;
    e[14] = 0;
    e[15] = 1;
    return this;
  }
  copy(m) {
    this.elements.set(m.elements);
    return this;
  }
  clone() {
    return new Mat4().copy(this);
  }
  fromArray(arr, offset = 0) {
    const e = this.elements;
    for (let i = 0; i < 16; i++) e[i] = arr[offset + i];
    return this;
  }
  toArray(arr, offset = 0) {
    const e = this.elements;
    for (let i = 0; i < 16; i++) arr[offset + i] = e[i];
    return arr;
  }
  compose(pos, quat, scale) {
    const e = this.elements;
    const x = quat.x,
      y = quat.y,
      z = quat.z,
      w = quat.w;
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    const sx = scale.x,
      sy = scale.y,
      sz = scale.z;
    e[0] = (1 - (yy + zz)) * sx;
    e[1] = (xy + wz) * sx;
    e[2] = (xz - wy) * sx;
    e[3] = 0;
    e[4] = (xy - wz) * sy;
    e[5] = (1 - (xx + zz)) * sy;
    e[6] = (yz + wx) * sy;
    e[7] = 0;
    e[8] = (xz + wy) * sz;
    e[9] = (yz - wx) * sz;
    e[10] = (1 - (xx + yy)) * sz;
    e[11] = 0;
    e[12] = pos.x;
    e[13] = pos.y;
    e[14] = pos.z;
    e[15] = 1;
    return this;
  }
  multiplyMatrices(a, b) {
    const ae = a.elements,
      be = b.elements,
      te = this.elements;
    const a11 = ae[0],
      a12 = ae[4],
      a13 = ae[8],
      a14 = ae[12];
    const a21 = ae[1],
      a22 = ae[5],
      a23 = ae[9],
      a24 = ae[13];
    const a31 = ae[2],
      a32 = ae[6],
      a33 = ae[10],
      a34 = ae[14];
    const a41 = ae[3],
      a42 = ae[7],
      a43 = ae[11],
      a44 = ae[15];
    const b11 = be[0],
      b12 = be[4],
      b13 = be[8],
      b14 = be[12];
    const b21 = be[1],
      b22 = be[5],
      b23 = be[9],
      b24 = be[13];
    const b31 = be[2],
      b32 = be[6],
      b33 = be[10],
      b34 = be[14];
    const b41 = be[3],
      b42 = be[7],
      b43 = be[11],
      b44 = be[15];
    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
    return this;
  }
  makePerspective(left, right, top, bottom, near, far) {
    const e = this.elements;
    const x = (2 * near) / (right - left);
    const y = (2 * near) / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -(far + near) / (far - near);
    const d = (-2 * far * near) / (far - near);
    e[0] = x;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;
    e[4] = 0;
    e[5] = y;
    e[6] = 0;
    e[7] = 0;
    e[8] = a;
    e[9] = b;
    e[10] = c;
    e[11] = -1;
    e[12] = 0;
    e[13] = 0;
    e[14] = d;
    e[15] = 0;
    return this;
  }
  makeOrthographic(left, right, top, bottom, near, far) {
    const e = this.elements;
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    e[0] = 2 * w;
    e[1] = 0;
    e[2] = 0;
    e[3] = 0;
    e[4] = 0;
    e[5] = 2 * h;
    e[6] = 0;
    e[7] = 0;
    e[8] = 0;
    e[9] = 0;
    e[10] = -2 * p;
    e[11] = 0;
    e[12] = -(right + left) * w;
    e[13] = -(top + bottom) * h;
    e[14] = -(far + near) * p;
    e[15] = 1;
    return this;
  }
  lookAtCamera(eye, target, up) {
    let zx = eye.x - target.x,
      zy = eye.y - target.y,
      zz = eye.z - target.z;
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-6) {
      zz = 1;
      len = 1;
    }
    zx /= len;
    zy /= len;
    zz /= len;
    let xx = up.y * zz - up.z * zy;
    let xy = up.z * zx - up.x * zz;
    let xz = up.x * zy - up.y * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-6) {
      xx = 1;
      xy = 0;
      xz = 0;
    } else {
      xx /= len;
      xy /= len;
      xz /= len;
    }
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const e = this.elements;
    e[0] = xx;
    e[1] = xy;
    e[2] = xz;
    e[3] = 0;
    e[4] = yx;
    e[5] = yy;
    e[6] = yz;
    e[7] = 0;
    e[8] = zx;
    e[9] = zy;
    e[10] = zz;
    e[11] = 0;
    e[12] = eye.x;
    e[13] = eye.y;
    e[14] = eye.z;
    e[15] = 1;
    return this;
  }
  invert() {
    const te = this.elements;
    const n11 = te[0],
      n21 = te[1],
      n31 = te[2],
      n41 = te[3];
    const n12 = te[4],
      n22 = te[5],
      n32 = te[6],
      n42 = te[7];
    const n13 = te[8],
      n23 = te[9],
      n33 = te[10],
      n43 = te[11];
    const n14 = te[12],
      n24 = te[13],
      n34 = te[14],
      n44 = te[15];
    const t11 =
      n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 =
      n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 =
      n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 =
      n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
    if (Math.abs(det) < 1e-12) return this.identity();
    const inv = 1 / det;
    te[0] = t11 * inv;
    te[1] =
      (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * inv;
    te[2] =
      (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * inv;
    te[3] =
      (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * inv;
    te[4] = t12 * inv;
    te[5] =
      (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * inv;
    te[6] =
      (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * inv;
    te[7] =
      (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * inv;
    te[8] = t13 * inv;
    te[9] =
      (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * inv;
    te[10] =
      (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * inv;
    te[11] =
      (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * inv;
    te[12] = t14 * inv;
    te[13] =
      (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * inv;
    te[14] =
      (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * inv;
    te[15] =
      (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * inv;
    return this;
  }
}

export class Box3 {
  constructor(min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity)) {
    this.min = min;
    this.max = max;
  }
  makeEmpty() {
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    return this;
  }
  isEmpty() {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }
  expandByPoint(p) {
    if (p.x < this.min.x) this.min.x = p.x;
    if (p.y < this.min.y) this.min.y = p.y;
    if (p.z < this.min.z) this.min.z = p.z;
    if (p.x > this.max.x) this.max.x = p.x;
    if (p.y > this.max.y) this.max.y = p.y;
    if (p.z > this.max.z) this.max.z = p.z;
    return this;
  }
  expandByXYZ(x, y, z) {
    if (x < this.min.x) this.min.x = x;
    if (y < this.min.y) this.min.y = y;
    if (z < this.min.z) this.min.z = z;
    if (x > this.max.x) this.max.x = x;
    if (y > this.max.y) this.max.y = y;
    if (z > this.max.z) this.max.z = z;
    return this;
  }
  union(box) {
    if (box.min.x < this.min.x) this.min.x = box.min.x;
    if (box.min.y < this.min.y) this.min.y = box.min.y;
    if (box.min.z < this.min.z) this.min.z = box.min.z;
    if (box.max.x > this.max.x) this.max.x = box.max.x;
    if (box.max.y > this.max.y) this.max.y = box.max.y;
    if (box.max.z > this.max.z) this.max.z = box.max.z;
    return this;
  }
  getSize(out = new Vec3()) {
    return this.isEmpty()
      ? out.set(0, 0, 0)
      : out.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
  }
  getCenter(out = new Vec3()) {
    return this.isEmpty()
      ? out.set(0, 0, 0)
      : out.set((this.min.x + this.max.x) * 0.5, (this.min.y + this.max.y) * 0.5, (this.min.z + this.max.z) * 0.5);
  }
  setFromObject(root) {
    this.makeEmpty();
    root.updateWorldMatrix(true);
    const v = new Vec3();
    root.traverse((obj) => {
      if (!obj.geometry?.positions) return;
      const pos = obj.geometry.positions;
      const m = obj.worldMatrix;
      for (let i = 0; i < pos.length; i += 3) {
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
        this.expandByPoint(v);
      }
    });
    return this;
  }
}

const UP = new Vec3(0, 1, 0);
const _tmpNear = new Vec3();
const _tmpFar = new Vec3();

export class Camera {
  constructor(fov = 45, aspect = 1, near = 0.5, far = 200) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = new Vec3(0, 20, 20);
    this.target = new Vec3(0, 0, 0);
    this.viewOffset = null;
    this.matrixWorld = new Mat4();
    this.viewMatrix = new Mat4();
    this.projMatrix = new Mat4();
    this.viewProjMatrix = new Mat4();
    this.invViewProjMatrix = new Mat4();
    this.updateProjectionMatrix();
    this.updateMatrixWorld();
  }
  setViewOffset(fullWidth, fullHeight, x, y, width, height) {
    this.aspect = fullWidth / fullHeight;
    this.viewOffset = { fullWidth, fullHeight, x, y, width, height };
    this.updateProjectionMatrix();
  }
  clearViewOffset() {
    if (this.viewOffset) {
      this.viewOffset = null;
      this.updateProjectionMatrix();
    }
  }
  lookAt(x, y, z) {
    this.target.set(x, y, z);
  }
  updateProjectionMatrix() {
    const top = this.near * Math.tan((this.fov * Math.PI) / 360);
    let height = 2 * top;
    let width = this.aspect * height;
    let left = -0.5 * width;
    let topEdge = top;
    if (this.viewOffset) {
      const v = this.viewOffset;
      left += (v.x * width) / v.fullWidth;
      topEdge -= (v.y * height) / v.fullHeight;
      width *= v.width / v.fullWidth;
      height *= v.height / v.fullHeight;
    }
    this.projMatrix.makePerspective(left, left + width, topEdge, topEdge - height, this.near, this.far);
    this.viewProjMatrix.multiplyMatrices(this.projMatrix, this.viewMatrix);
    this.invViewProjMatrix.copy(this.viewProjMatrix).invert();
  }
  updateMatrixWorld() {
    this.matrixWorld.lookAtCamera(this.position, this.target, UP);
    this.viewMatrix.copy(this.matrixWorld).invert();
    this.viewProjMatrix.multiplyMatrices(this.projMatrix, this.viewMatrix);
    this.invViewProjMatrix.copy(this.viewProjMatrix).invert();
  }
  projectNDC(x, y, z, out) {
    const e = this.viewProjMatrix.elements;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const iw = Math.abs(w) > 1e-6 ? 1 / w : 1;
    out.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw;
    out.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw;
    out.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * iw;
    out.w = w;
    return out;
  }
  unprojectRay(ndcX, ndcY, originOut, dirOut) {
    _tmpNear.set(ndcX, ndcY, -1).applyMatrix4(this.invViewProjMatrix);
    _tmpFar.set(ndcX, ndcY, 1).applyMatrix4(this.invViewProjMatrix);
    originOut.copy(this.position);
    dirOut.copy(_tmpFar).sub(_tmpNear).normalize();
  }
}
