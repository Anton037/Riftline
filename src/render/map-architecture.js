import { BoxGeometry, CylinderGeometry, LatheGeometry, Mesh, TorusGeometry, Vector2 } from "three";
import { GLAZES } from "./palette.js";
import { worldMaterial } from "./world-material.js";
import { armorBox } from "./armor-geometry.js";

// Profiles are [radius, height] in local units, with the wheel mark hidden under the base.
const PROFILES = {
  city: [
    [0, 0],
    [0.79, 0],
    [1, 0.12],
    [0.84, 0.22],
    [0.7, 0.35],
    [0.73, 0.75],
    [0.54, 1],
    [0.28, 1.03],
    [0, 1.03],
  ],
  shelf: [
    [0, 0],
    [0.88, 0],
    [0.97, 0.13],
    [0.63, 0.27],
    [0.7, 0.38],
    [0.98, 0.63],
    [0.69, 0.8],
    [0.4, 1],
    [0, 1],
  ],
  marsh: [
    [0, 0],
    [0.64, 0],
    [0.72, 0.12],
    [0.43, 0.36],
    [0.5, 0.48],
    [0.97, 0.62],
    [1, 0.75],
    [0.54, 0.87],
    [0.18, 0.96],
    [0, 0.96],
  ],
  core: [
    [0, 0],
    [0.81, 0],
    [0.93, 0.11],
    [0.52, 0.21],
    [0.3, 0.35],
    [0.86, 0.57],
    [0.97, 0.68],
    [0.55, 0.83],
    [0.26, 1],
    [0, 1],
  ],
  caldera: [
    [0, 0],
    [0.95, 0],
    [1, 0.2],
    [0.89, 0.26],
    [0.91, 0.55],
    [0.64, 0.62],
    [0.7, 0.85],
    [0.5, 1],
    [0, 1],
  ],
  flats: [
    [0, 0],
    [0.88, 0],
    [0.96, 0.19],
    [0.64, 0.36],
    [0.56, 0.55],
    [0.82, 0.73],
    [0.94, 0.86],
    [0.63, 0.96],
    [0, 0.96],
  ],
};

export function vesselGeometry(id, radius, height) {
  return new LatheGeometry(
    PROFILES[id].map(([r, y]) => new Vector2(r * radius, y * height)),
    16,
  );
}

export function placeMesh(parent, geometry, material, x, y, z) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function addMapArchitecture(view, biome, W, H, obstacles) {
  const look = GLAZES[biome.id];
  const footing = worldMaterial({ color: look.base, surface: "stone" });
  const band = worldMaterial({ color: look.trim, surface: "metal" });
  const body = worldMaterial({ color: look.body, surface: "armor" });
  for (const ob of obstacles) {
    const base =
      ob.t === "c" ? new CylinderGeometry(ob.r * 0.99, ob.r, 0.26, 16) : armorBox(ob.w * 2, 0.26, ob.h * 2, 0.06);
    placeMesh(view.obsGroup, base, footing, ob.x, 0.13, ob.y);
  }
  if (!obstacles.length) footing.dispose();

  // Keep the whole northern gallery outside the collision plane.
  for (const side of [-1, 1]) {
    const x = side * W * 0.58;
    const z = -H - 8.6;
    placeMesh(view.group, new BoxGeometry(7.8, 0.64, 5), body, x, 0.18, z);
    const pedestal = placeMesh(view.group, vesselGeometry(biome.id, 2.25, 6.6), body, x, 0.47, z);
    pedestal.scale.z = 0.82;
    placeMesh(view.group, new TorusGeometry(2.2, 0.13, 6, 44), band, x, 6.85, z);
    const bezel = placeMesh(view.group, new TorusGeometry(1.53, 0.045, 5, 40), band, x, 6.85, z + 0.09);
    bezel.rotation.z = side * 0.4;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const tick = placeMesh(
        view.group,
        new BoxGeometry(0.08, 0.31, 0.1),
        band,
        x + Math.sin(angle) * 1.86,
        6.85 + Math.cos(angle) * 1.86,
        z + 0.05,
      );
      tick.rotation.z = -angle;
    }
  }
}
