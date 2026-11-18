import { BoxGeometry, CylinderGeometry, MeshBasicMaterial, TorusGeometry } from "three";
import { worldMaterial } from "./world-material.js";
import { mergeStaticMeshes } from "./static-meshes.js";
import { GLAZES } from "./palette.js";
import { placeMesh, vesselGeometry } from "./map-architecture.js";

export function addBiomeDetail(view, biome, W, H, obstacles, rng) {
  const id = biome.id;
  const look = GLAZES[id];
  const brick = worldMaterial({ color: look.base, surface: "stone" });
  const porcelain = worldMaterial({ color: look.body, surface: id === "shelf" ? "ice" : "armor" });
  const inlay = worldMaterial({ color: look.trim, surface: "metal" });
  const lens = new MeshBasicMaterial({ color: look.light, toneMapped: false });

  for (const side of [-1, 1]) {
    for (const alongX of [true, false]) {
      const length = alongX ? W : H;
      const edge = alongX ? H : W;
      const count = Math.floor(length / 1.5);
      for (let i = -count; i <= count; i++) {
        const across = (edge + 1.2) * side;
        const along = i * 2.8;
        if (Math.abs(along) > length - 0.9) continue;
        const x = alongX ? along : across;
        const z = alongX ? across : along;
        const sill = placeMesh(view.group, new BoxGeometry(2.67, 0.45, 1.6), brick, x, 0.1, z);
        sill.rotation.y = alongX ? 0 : Math.PI / 2;
        if ((i + 30) % 3 === 0) {
          const h = 1.85 + rng.next() * 0.55;
          placeMesh(view.group, vesselGeometry(id, 0.66, h), porcelain, x, 0.33, z);
          placeMesh(view.group, new CylinderGeometry(0.22, 0.35, 0.24, 8), lens, x, h + 0.31, z);
          placeMesh(
            view.group,
            new TorusGeometry(0.46, 0.045, 5, 18).rotateX(Math.PI / 2),
            inlay,
            x,
            h * 0.72 + 0.33,
            z,
          );
        } else {
          const rail = placeMesh(view.group, new BoxGeometry(2.66, 0.075, 0.08), inlay, x, 0.43, z);
          rail.rotation.y = sill.rotation.y;
        }
      }
    }
  }

  // Silhouettes recede into the colored distance beyond the northern arcade.
  for (let i = -7; i <= 7; i++) {
    const r = 1.1 + rng.next() * 2.7;
    const x = i * 5.8 + (rng.next() - 0.5) * 3;
    const z = -H - 13 - r - rng.next() * 9;
    const h = 3.5 + rng.next() * 8.5;
    placeMesh(view.group, vesselGeometry(id, r, h), i % 3 ? brick : porcelain, x, -0.6, z);
    placeMesh(view.group, new CylinderGeometry(r * 0.19, r * 0.32, 0.42, 8), inlay, x, h * 0.97 - 0.48, z);
  }

  for (let i = 0; i < 35; i++) {
    const x = (rng.next() * 2 - 1) * (W - 1.5);
    const z = (rng.next() * 2 - 1) * (H - 1.5);
    if (
      Math.hypot(x, z - 2) < 3.75 ||
      obstacles.some((o) =>
        o.t === "c"
          ? Math.hypot(x - o.x, z - o.y) < o.r + 0.6
          : Math.abs(x - o.x) < o.w + 0.55 && Math.abs(z - o.y) < o.h + 0.55,
      )
    )
      continue;
    const s = 0.12 + rng.next() * 0.12;
    // A laid-in brass pin marks the floor without adding a collision object.
    placeMesh(view.group, new CylinderGeometry(s, s, 0.013, 4), inlay, x, 0.012, z).rotation.y = Math.PI / 4;
  }

  mergeStaticMeshes(view.group);
  return lens;
}
