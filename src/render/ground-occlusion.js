// Small baked contact/penumbra mask: one floor sample, regenerated only when the layout changes.
import { DataTexture, RedFormat, UnsignedByteType, LinearFilter } from "three";

export function createGroundOcclusion(W, H, obstacles, size = 256) {
  const data = new Uint8Array(size * size).fill(255);
  const stamp = (ob, ox, oz, softness, strength) => {
    const w = ob.t === "c" ? ob.r : ob.w,
      d = ob.t === "c" ? ob.r : ob.h;
    const x = ob.x + ox,
      z = ob.y + oz,
      pad = softness * 2;
    const x0 = Math.max(0, Math.floor(((x - w - pad + W) / (2 * W)) * size));
    const x1 = Math.min(size - 1, Math.ceil(((x + w + pad + W) / (2 * W)) * size));
    const z0 = Math.max(0, Math.floor(((z - d - pad + H) / (2 * H)) * size));
    const z1 = Math.min(size - 1, Math.ceil(((z + d + pad + H) / (2 * H)) * size));
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const dx = Math.abs(((i + 0.5) / size) * 2 * W - W - x);
        const dz = Math.abs(((j + 0.5) / size) * 2 * H - H - z);
        const distance =
          ob.t === "c"
            ? Math.hypot(dx, dz) - w
            : Math.hypot(Math.max(dx - w, 0), Math.max(dz - d, 0)) + Math.min(Math.max(dx - w, dz - d), 0);
        const fade = Math.exp(-Math.pow(Math.max(0, distance) / softness, 2));
        const index = j * size + i;
        data[index] = Math.round(data[index] * (1 - strength * fade));
      }
  };
  for (const ob of obstacles) {
    stamp(ob, -0.55, -0.8, 0.65, 0.22);
    stamp(ob, 0, 0, 0.28, 0.32);
  }
  const texture = new DataTexture(data, size, size, RedFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
