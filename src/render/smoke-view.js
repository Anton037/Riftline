// Stylized painterly billowing smoke puffs rendered as a single GPU-instanced quad pool.

import { Color } from "../engine/math.js";
import { plane } from "../engine/geometry.js";
import { Material } from "../engine/scene.js";

const MAX = 180;
const _col = new Color();

export class SmokeView {
  constructor(renderer, Pool) {
    this.r = renderer;
    const mat = new Material({
      shader: "smoke",
      transparent: true,
      depthWrite: false,
      doubleSide: true,
      fog: true,
    });
    this.pool = new Pool(plane(1, 1, 1, 1), mat, MAX, { flash: true });
    this.pool.mesh.renderOrder = 3;
    renderer.scene.add(this.pool.mesh);
    this.list = [];
    this.puffs = this.list;
    this._free = [];
    this._overwriteCursor = 0;
  }
  clear() {
    for (let i = 0; i < this.list.length; i++) this._free.push(this.list[i]);
    this.list.length = 0;
    this._overwriteCursor = 0;
  }
  emit(x, y, z, size = 0.4, hex = 0x8d9596, opacity = 0.4) {
    _col.setHex(hex);
    const life = 0.5 + Math.random() * 0.3;
    let p;
    if (this.list.length >= MAX) {
      p = this.list[this._overwriteCursor];
      this._overwriteCursor = (this._overwriteCursor + 1) % MAX;
    } else {
      p = this._free.length ? this._free.pop() : {};
      this.list.push(p);
    }
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (Math.random() - 0.5) * 0.55;
    p.vy = 0.55 + Math.random() * 0.45;
    p.vz = (Math.random() - 0.5) * 0.55;
    p.s0 = size;
    p.life = life;
    p.max = life;
    p.r = _col.r;
    p.g = _col.g;
    p.b = _col.b;
    p.a = Math.min(opacity, 0.42);
    p.rot = Math.random() * 6.283;
    p.spin = (Math.random() - 0.5) * 1.4;
  }
  update(dt, basis) {
    const pool = this.pool;
    pool.begin();
    let keep = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this._free.push(p);
        continue;
      }
      this.list[keep++] = p;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const t = 1 - p.life / p.max;
      const size = p.s0 * (0.75 + t * 1.45);
      const alpha = p.a * Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * (1 - t);
      const idx = pool.bb(p.x, p.y, p.z, size, basis, p.rot);
      if (idx >= 0) {
        pool.col(idx, p.r, p.g, p.b);
        pool.flash(idx, alpha);
      }
    }
    this.list.length = keep;
    if (this._overwriteCursor >= keep) this._overwriteCursor = 0;
    pool.end();
  }
}
