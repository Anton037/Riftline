// Built architecture belongs to the City, Core ruins and the Flats; natural biomes own their rock/root bases.
// Static pieces remain within collision footprints or beyond the arena wall and batch by material.
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { worldMaterial } from "./world-material.js";
import { armorBox } from "./armor-geometry.js";
import { strataGeometry } from "./strata-geometry.js";
const PALETTES = {
  yard: [0x65717b, 0x35434e, 0xb7a883, 0xe6bb70],
  void: [0x766582, 0x3b354f, 0xa6a2b8, 0xa48ed8],
  flats: [0xb29b70, 0x716448, 0xdbd3ad, 0x9ac9c8],
};
export function addMapArchitecture(view, biome, W, H, obstacles) {
  const colors = PALETTES[biome.id];
  if (!colors) return;
  const mats = colors
    .slice(0, 3)
    .map((color) =>
      worldMaterial({ color, surface: biome.id === "flats" ? "sandstone" : biome.id === "yard" ? "metal" : "stone" }),
    );
  mats.push(new MeshBasicMaterial({ color: colors[3], toneMapped: false }));
  const part = (parent, geometry, m, x, y, z, rotation = 0) => {
    const mesh = new Mesh(geometry, mats[m]);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    parent.add(mesh);
    return mesh;
  };
  const block = (parent, m, x, y, z, w, h, d, a = 0) =>
    part(parent, Math.min(w, h, d) > 0.12 ? armorBox(w, h, d) : new BoxGeometry(w, h, d), m, x, y, z, a);
  for (const ob of obstacles) {
    const x = ob.x,
      z = ob.y,
      w = ob.t === "c" ? ob.r * 0.78 : ob.w,
      d = ob.t === "c" ? ob.r * 0.78 : ob.h,
      parent = view.obsGroup;
    if (biome.id === "yard") {
      for (const side of [-1, 1]) {
        block(parent, 0, x + side * w * 0.8, 0.09, z, w * 0.16, 0.16, d * 1.6);
        for (const end of [-1, 1])
          block(parent, 2, x + side * w * 0.8, 0.18, z + end * d * 0.65, w * 0.16, 0.025, d * 0.18);
      }
    } else if (biome.id === "void") {
      for (let j = 0; j < 3; j++)
        block(parent, j === 1 ? 2 : 1, x, 0.08 + j * 0.12, z, w * (1.65 - j * 0.2), 0.08, d * (1.65 - j * 0.2));
    }
  }
  for (const side of [-1, 1]) {
    const x = side * W * 0.68,
      z = -H - 2.4,
      parent = view.group;
    if (biome.id === "yard") {
      block(parent, 1, x, 1.7, z, 0.24, 3.4, 0.24);
      block(parent, 0, x - side * 0.6, 3.35, z, 1.4, 0.18, 0.4);
      block(parent, 3, x - side * 0.6, 3.24, z, 1, 0.04, 0.32);
      block(parent, 2, x, 1.85, z - 0.13, 0.8, 0.7, 0.05);
    } else if (biome.id === "void") {
      for (let j = 0; j < 3; j++) {
        block(parent, j === 1 ? 2 : 0, x + side * j * 0.65, 0.9 + j * 0.5, z, 0.7, 0.22, 1.7, side * j * 0.17);
        block(parent, 3, x + side * j * 0.65, 1.025 + j * 0.5, z, 0.4, 0.02, 0.06);
      }
    } else {
      // Wind-eroded sandstone arches, without the old luminous lintel strips and perfect block pedestals.
      for (const leg of [-1, 1]) part(parent, strataGeometry(0.8, 2.5, 0.9, x + leg, true), 0, x + leg * 0.95, 0.01, z);
      const lintel = part(parent, strataGeometry(2.7, 0.42, 1, x * 3), 2, x, 2.37, z);
      lintel.rotation.z = side * 0.07;
    }
  }
}
