// Lightweight horizon & sky gradient backdrop ring strictly outside the playable arena.
// Ensures the Home menu and tilted diorama camera never reveal flat empty void behind the floor plane.

import { Color } from "../engine/math.js";
import { Geometry } from "../engine/geometry.js";
import { Material, MeshNode } from "../engine/scene.js";
import { GLAZES } from "./palette.js";
import { TAU } from "../core/util.js";

const SKY_GRADIENTS = {
  courtyard: { horizon: 0x3b4958, mid: 0x1d2b3c, zenith: 0x0b1322 },
  shelf: { horizon: 0x4b7492, mid: 0x224162, zenith: 0x0d1b30 },
  marsh: { horizon: 0x355c50, mid: 0x18342e, zenith: 0x0a1816 },
  core: { horizon: 0x5c3670, mid: 0x2a1844, zenith: 0x0e081c },
  caldera: { horizon: 0x703422, mid: 0x381918, zenith: 0x140a0c },
  flats: { horizon: 0xc28a54, mid: 0x56647c, zenith: 0x1b2d4a },
};

/**
 * Open-ended distant horizon cylinder (32 segments, 4 vertical bands, 192 triangles)
 * placed strictly beyond `hypot(W, H) + 34` so no triangle chord ever crosses `[-W, W] x [-H, H]`.
 */
export function createSkyBackdrop(biomeId, W, H) {
  const look = GLAZES[biomeId] || GLAZES.courtyard;
  const grad = SKY_GRADIENTS[biomeId] || SKY_GRADIENTS.courtyard;
  const cBase = new Color(look.fogColor);
  const cHor = new Color(grad.horizon);
  const cMid = new Color(grad.mid);
  const cZen = new Color(grad.zenith);

  const radius = Math.hypot(W, H) + 34;
  const segs = 32;
  const bands = [
    { y: -8, col: cBase },
    { y: 2.5, col: cHor },
    { y: 16, col: cMid },
    { y: 42, col: cZen },
  ];

  const pos = [];
  const norm = [];
  const uv = [];
  const col = [];
  const idx = [];

  for (let b = 0; b < bands.length; b++) {
    const band = bands[b];
    const v = b / (bands.length - 1);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = u * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.push(ca * radius, band.y, sa * radius);
      norm.push(-ca, 0, -sa);
      uv.push(u, v);
      // Subtle azimuthal warmth variation along horizon band so sky feels hand-painted
      const shimmer = b === 1 ? 0.94 + 0.1 * Math.sin(a * 2 + 0.6) : 1;
      col.push(Math.min(1, band.col.r * shimmer), Math.min(1, band.col.g * shimmer), Math.min(1, band.col.b * shimmer));
    }
  }

  const stride = segs + 1;
  for (let b = 0; b < bands.length - 1; b++) {
    for (let i = 0; i < segs; i++) {
      const a = b * stride + i;
      const b0 = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Inward-facing winding (viewed from inside the arena)
      idx.push(a, c, b0, b0, c, d);
    }
  }

  const geo = new Geometry(pos, norm, uv, idx, col);
  geo.computeBounds();
  const mat = new Material({
    shader: "emissive",
    color: 0xffffff,
    emissiveIntensity: 1.0,
    vertexColors: true,
    transparent: false,
    depthWrite: false,
    doubleSide: true,
    fog: false,
  });
  const mesh = new MeshNode(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.freezeStatic();
  return mesh;
}
