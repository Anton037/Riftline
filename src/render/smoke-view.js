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
    this.pool.mesh.renderOrder = 4;
    renderer.scene.add(this.pool.mesh);
    this.list = [];
    this.puffs = this.list;
  }
  clear() {
    this.list.length = 0;
  }
  emit(x, y, z, size = 0.4, hex = 0x8d9596, opacity = 0.55) {
    if (this.list.length >= MAX) this.list.shift();
    _col.setHex(hex);
    this.list.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 0.55 + Math.random() * 0.45,
      vz: (Math.random() - 0.5) * 0.6,
      s0: size,
      life: 0.65 + Math.random() * 0.4,
      max: 0.95,
      r: _col.r,
      g: _col.g,
      b: _col.b,
      a: opacity,
      rot: Math.random() * 6.283,
      spin: (Math.random() - 0.5) * 1.4,
    });
    const last = this.list[this.list.length - 1];
    last.max = last.life;
  }
  update(dt, basis) {
    const pool = this.pool;
    pool.begin();
    let keep = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
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
    pool.end();
  }
}
