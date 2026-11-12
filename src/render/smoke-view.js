// Bounded soft material smoke: one instanced alpha pass, independent of bright combat particles.
import {
  CanvasTexture,
  PlaneGeometry,
  InstancedMesh,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  ShaderMaterial,
  UniformsUtils,
  UniformsLib,
  Color,
} from "three";
const CAPACITY = 48;
function smokeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d"),
    image = ctx.createImageData(128, 128);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x, y) => {
    const a = Math.floor(x),
      b = Math.floor(y),
      fx = x - a,
      fy = y - b,
      u = fx * fx * (3 - 2 * fx),
      v = fy * fy * (3 - 2 * fy);
    return (
      (hash(a, b) * (1 - u) + hash(a + 1, b) * u) * (1 - v) + (hash(a, b + 1) * (1 - u) + hash(a + 1, b + 1) * u) * v
    );
  };
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const u = (x - 64) / 58,
        v = (y - 64) / 58,
        r = u * u + v * v;
      const grain = noise(x / 19, y / 19) * 0.65 + noise(x / 7 + 9, y / 7) * 0.35;
      const alpha = Math.max(0, 1 - r) ** 1.7 * Math.max(0, grain - 0.18) * 1.8;
      const i = (y * 128 + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  ctx.putImageData(image, 0, 0);
  return new CanvasTexture(canvas);
}
export class SmokeView {
  constructor(scene) {
    const geometry = new PlaneGeometry(1, 1);
    this.tint = new InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
    this.tint.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aTint", this.tint);
    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uSmoke: { value: smokeTexture() } }]),
      vertexShader: `#include <common>
#include <fog_pars_vertex>
attribute vec4 aTint;varying vec2 vUv;varying vec4 vTint;
void main(){vUv=uv;vTint=aTint;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform sampler2D uSmoke;varying vec2 vUv;varying vec4 vTint;
void main(){gl_FragColor=vec4(vTint.rgb,texture2D(uSmoke,vUv).a*vTint.a);
#include <fog_fragment>
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
    });
    this.mesh = new InstancedMesh(geometry, material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.puffs = [];
  }
  emit(x, y, z, size = 0.4, color = 0x9da8a8, life = 0.45) {
    if (this.puffs.length >= CAPACITY) return;
    this.puffs.push({ x, y, z, size, color: new Color(color), life, max: life, angle: this.puffs.length * 2.4 });
  }
  clear() {
    this.puffs.length = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  update(dt, b) {
    const m = this.mesh.instanceMatrix.array,
      t = this.tint.array;
    let count = 0;
    for (const p of this.puffs) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const age = 1 - p.life / p.max,
        size = p.size * (0.65 + age * 1.4),
        c = Math.cos(p.angle),
        s = Math.sin(p.angle),
        off = count * 16;
      p.y += dt * 0.5;
      m[off] = (b.rx * c + b.ux * s) * size;
      m[off + 1] = (b.ry * c + b.uy * s) * size;
      m[off + 2] = (b.rz * c + b.uz * s) * size;
      m[off + 3] = 0;
      m[off + 4] = (b.ux * c - b.rx * s) * size;
      m[off + 5] = (b.uy * c - b.ry * s) * size;
      m[off + 6] = (b.uz * c - b.rz * s) * size;
      m[off + 7] = 0;
      m[off + 8] = b.fx * size;
      m[off + 9] = b.fy * size;
      m[off + 10] = b.fz * size;
      m[off + 11] = 0;
      m[off + 12] = p.x;
      m[off + 13] = p.y;
      m[off + 14] = p.z;
      m[off + 15] = 1;
      t[count * 4] = p.color.r;
      t[count * 4 + 1] = p.color.g;
      t[count * 4 + 2] = p.color.b;
      t[count * 4 + 3] = Math.sin(age * Math.PI) * 0.32;
      this.puffs[count++] = p;
    }
    this.puffs.length = count;
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, count * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.tint.clearUpdateRanges();
      this.tint.addUpdateRange(0, count * 4);
      this.tint.needsUpdate = true;
    }
  }
}
