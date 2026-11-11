// V4 map architecture: collision-sized obstacle detailing and landmarks beyond the arena walls.
// Static opaque pieces are merged per material by ArenaView; no additional simulation obstacles.
import { BoxGeometry, CylinderGeometry, ConeGeometry, Mesh, MeshLambertMaterial, MeshBasicMaterial } from "three";
import { armorBox } from "./armor-geometry.js";

const PALETTES = {
  yard: [0x65717b, 0x35434e, 0xb7a883, 0xe6bb70],
  vault: [0x91b9ce, 0x385c80, 0xd5e5e4, 0x87cddd],
  marsh: [0x576951, 0x354539, 0x929878, 0x7fc6a2],
  void: [0x766582, 0x3b354f, 0xa6a2b8, 0xa48ed8],
  club: [0x78695b, 0x47433f, 0xa28b70, 0xd69956],
  flats: [0xb29b70, 0x716448, 0xdbd3ad, 0x9ac9c8],
};
export function addMapArchitecture(view, biome, W, H, obstacles) {
  const colors = PALETTES[biome.id];
  if (!colors) return;
  const mats = colors.slice(0, 3).map((color) => new MeshLambertMaterial({ color, flatShading: true }));
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
  // Foundations and local details stay inside the obstacle's existing solid footprint.
  for (const ob of obstacles) {
    const x = ob.x,
      z = ob.y,
      w = ob.t === "c" ? ob.r * 0.78 : ob.w,
      d = ob.t === "c" ? ob.r * 0.78 : ob.h;
    const parent = view.obsGroup;
    if (biome.id === "yard") {
      for (const side of [-1, 1]) {
        block(parent, 0, x + side * w * 0.8, 0.09, z, w * 0.16, 0.16, d * 1.6);
        for (const end of [-1, 1])
          block(parent, 2, x + side * w * 0.8, 0.18, z + end * d * 0.65, w * 0.16, 0.025, d * 0.18);
      }
    } else if (biome.id === "vault") {
      for (const side of [-1, 1]) {
        const shelf = block(parent, 2, x + side * w * 0.28, 0.16, z, w * 0.65, 0.3, d * 1.55, 0);
        shelf.rotation.z = side * 0.08;
      }
    } else if (biome.id === "marsh") {
      for (let j = 0; j < 5; j++) {
        const a = (j * Math.PI * 2) / 5;
        const root = block(
          parent,
          j % 2,
          x + Math.cos(a) * w * 0.5,
          0.13,
          z + Math.sin(a) * d * 0.5,
          Math.min(w, d) * 0.45,
          0.22,
          Math.min(w, d) * 0.16,
          -a,
        );
        root.rotation.z = 0.12;
      }
    } else if (biome.id === "void") {
      for (let j = 0; j < 3; j++)
        block(parent, j === 1 ? 2 : 1, x, 0.08 + j * 0.12, z, w * (1.65 - j * 0.2), 0.08, d * (1.65 - j * 0.2));
    } else if (biome.id === "club") {
      for (let j = 0; j < 3; j++) {
        const stone = part(
          parent,
          new CylinderGeometry(w * (0.8 - j * 0.12), w * (0.9 - j * 0.12), 0.13, 7),
          j % 2,
          x,
          0.07 + j * 0.12,
          z,
          0,
        );
        stone.scale.z = d / w;
      }
    } else {
      for (let j = 0; j < 3; j++)
        block(parent, j === 1 ? 2 : 0, x, 0.08 + j * 0.13, z, w * (1.8 - j * 0.18), 0.12, d * (1.8 - j * 0.18));
    }
  }
  // Paired north-side landmarks frame the map without concealing the playable centre.
  for (const side of [-1, 1]) {
    const x = side * W * 0.68,
      z = -H - 2.4,
      parent = view.group;
    if (biome.id === "yard") {
      block(parent, 1, x, 1.7, z, 0.24, 3.4, 0.24);
      block(parent, 0, x - side * 0.6, 3.35, z, 1.4, 0.18, 0.4);
      block(parent, 3, x - side * 0.6, 3.24, z, 1.0, 0.04, 0.32);
      block(parent, 2, x, 1.85, z - 0.13, 0.8, 0.7, 0.05);
    } else if (biome.id === "vault") {
      for (let j = 0; j < 3; j++) {
        const ice = part(
          parent,
          new ConeGeometry(0.65, 3.4 - j * 0.5, 5),
          j === 1 ? 2 : 0,
          x + side * j * 0.7,
          1.2,
          z + j * 0.4,
        );
        ice.rotation.z = side * (0.12 + j * 0.1);
      }
    } else if (biome.id === "marsh") {
      part(parent, new CylinderGeometry(0.16, 0.5, 2.7, 7), 1, x, 1.2, z);
      part(parent, new ConeGeometry(1.7, 0.7, 9), 0, x, 2.65, z);
      part(parent, new CylinderGeometry(1.5, 1.5, 0.06, 9), 3, x, 2.32, z);
      block(parent, 2, x + side * 0.55, 1.0, z, 0.15, 1.5, 0.15, 0.4);
    } else if (biome.id === "void") {
      for (let j = 0; j < 3; j++) {
        block(parent, j === 1 ? 2 : 0, x + side * j * 0.65, 0.9 + j * 0.5, z, 0.7, 0.22, 1.7, side * j * 0.17);
        block(parent, 3, x + side * j * 0.65, 1.025 + j * 0.5, z, 0.4, 0.02, 0.06);
      }
    } else if (biome.id === "club") {
      for (let j = 0; j < 3; j++) {
        part(
          parent,
          new CylinderGeometry(0.4, 0.7, 2.8 - j * 0.6, 6),
          j % 2,
          x + j * side * 0.65,
          1.1 - j * 0.2,
          z + j * 0.2,
        );
        part(parent, new CylinderGeometry(0.3, 0.3, 0.025, 6), 3, x + j * side * 0.65, 2.51 - j * 0.5, z + j * 0.2);
      }
    } else {
      for (const leg of [-1, 1]) block(parent, 0, x + leg * 0.95, 1.2, z, 0.65, 2.4, 0.9);
      block(parent, 2, x, 2.5, z, 2.7, 0.45, 1.0, side * 0.08);
      block(parent, 3, x, 2.74, z, 1.9, 0.035, 0.11, side * 0.08);
    }
  }
}
