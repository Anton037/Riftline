// Lightweight horizon & sky gradient backdrop ring strictly outside the playable arena.
// Ensures the Home menu and tilted diorama camera never reveal flat empty void behind the floor plane.

import { Color } from "../engine/math.js";
import { Geometry, cylinder, octahedron, mergeGeometries } from "../engine/geometry.js";
import { Material, MeshNode, Node } from "../engine/scene.js";
import { GLAZES } from "./palette.js";
import { TAU } from "../core/util.js";

const SKY_GRADIENTS = {
  courtyard: {
    horizon: 0x3f4e5e,
    mid: 0x1e2c3e,
    zenith: 0x0b1322,
    cloud: 0x5c6878,
    disc: 0xfbe0a8,
    discAz: -2.18,
    discEl: 19.5,
    discR: 3.1,
  },
  shelf: {
    horizon: 0x507a98,
    mid: 0x224162,
    zenith: 0x0d1b30,
    cloud: 0x7aa4c4,
    disc: 0xdff4ff,
    discAz: -1.18,
    discEl: 23.0,
    discR: 2.7,
  },
  marsh: {
    horizon: 0x386155,
    mid: 0x18342e,
    zenith: 0x0a1816,
    cloud: 0x568272,
    disc: 0xdcf4b4,
    discAz: -0.92,
    discEl: 18.5,
    discR: 2.9,
  },
  core: {
    horizon: 0x5e3874,
    mid: 0x2a1844,
    zenith: 0x0c071a,
    cloud: 0x8254a4,
    disc: 0xf4c8ff,
    discAz: -1.95,
    discEl: 22.0,
    discR: 2.4,
  },
  caldera: {
    horizon: 0x7c3a24,
    mid: 0x3b1a19,
    zenith: 0x140a0c,
    cloud: 0x9e5234,
    disc: 0xffa85c,
    discAz: -1.35,
    discEl: 17.0,
    discR: 3.3,
  },
  flats: {
    horizon: 0xca9056,
    mid: 0x5b6a82,
    zenith: 0x1c2f4d,
    cloud: 0xe6b478,
    disc: 0xfff0be,
    discAz: -0.68,
    discEl: 16.5,
    discR: 3.8,
  },
};

/**
 * Open-ended distant horizon cylinder + painted celestial disc & starfield strictly beyond `hypot(W, H) + 34`
 * so no triangle chord ever crosses `[-W, W] x [-H, H]`.
 */
export function createSkyBackdrop(biomeId, W, H) {
  const look = GLAZES[biomeId] || GLAZES.courtyard;
  const grad = SKY_GRADIENTS[biomeId] || SKY_GRADIENTS.courtyard;
  const cBase = new Color(look.fogColor);
  const cHor = new Color(grad.horizon);
  const cMid = new Color(grad.mid);
  const cZen = new Color(grad.zenith);
  const cCloud = new Color(grad.cloud);

  const radius = Math.hypot(W, H) + 34;
  const segs = 36;
  const bands = [
    { y: -8, col: cBase },
    { y: 2.5, col: cHor },
    { y: 11.5, col: cMid },
    { y: 22, col: cMid },
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
      let r = band.col.r;
      let g = band.col.g;
      let bl = band.col.b;
      if (b === 1) {
        // Subtle azimuthal sun/moon warmth glow along horizon band
        const dAz = Math.cos(a - grad.discAz);
        const shimmer = 0.93 + 0.08 * Math.sin(a * 2 + 0.6) + Math.max(0, dAz) * 0.14;
        r *= shimmer;
        g *= shimmer;
        bl *= shimmer;
      } else if (b === 2) {
        // Soft painted gouache cloud-band puffs drifting along the mid-sky
        const cloudK = Math.max(0, 0.5 + 0.35 * Math.sin(a * 3 + 0.8) + 0.25 * Math.cos(a * 5 - 0.5)) * 0.34;
        r = r * (1 - cloudK) + cCloud.r * cloudK;
        g = g * (1 - cloudK) + cCloud.g * cloudK;
        bl = bl * (1 - cloudK) + cCloud.b * cloudK;
      } else if (b === 3) {
        // Blend smoothly toward zenith
        r = r * 0.55 + cZen.r * 0.45;
        g = g * 0.55 + cZen.g * 0.45;
        bl = bl * 0.55 + cZen.b * 0.45;
      }
      col.push(Math.min(1, r), Math.min(1, g), Math.min(1, bl));
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

  const root = new Node();
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
  root.add(mesh);

  // Painted moon / desert sun disc + soft halo perched along the northern horizon arc
  const discDist = radius - 1.5;
  const dx = Math.cos(grad.discAz) * discDist;
  const dz = Math.sin(grad.discAz) * discDist;
  const discGeo = cylinder(grad.discR, grad.discR, 0.25, 16)
    .rotateX(Math.PI / 2)
    .rotateY(-grad.discAz + Math.PI / 2)
    .translate(dx, grad.discEl, dz);
  const discMat = new Material({
    shader: "emissive",
    color: grad.disc,
    emissiveIntensity: biomeId === "flats" ? 1.38 : 1.18,
    transparent: true,
    opacity: biomeId === "caldera" ? 0.62 : 0.88,
    depthWrite: false,
    doubleSide: true,
    fog: false,
  });
  const discMesh = new MeshNode(discGeo, discMat);
  discMesh.castShadow = false;
  discMesh.receiveShadow = false;
  discMesh.renderOrder = 3;
  discMesh.frustumCulled = false;
  discMesh.freezeStatic();
  root.add(discMesh);

  // Outer celestial halo ring behind the moon/sun
  const haloGeo = cylinder(grad.discR * 1.9, grad.discR * 1.9, 0.2, 16)
    .rotateX(Math.PI / 2)
    .rotateY(-grad.discAz + Math.PI / 2)
    .translate(Math.cos(grad.discAz) * (discDist + 0.5), grad.discEl, Math.sin(grad.discAz) * (discDist + 0.5));
  const haloMat = new Material({
    shader: "emissive",
    color: grad.disc,
    emissiveIntensity: 1.0,
    transparent: true,
    additive: true,
    opacity: 0.22,
    depthWrite: false,
    doubleSide: true,
    fog: false,
  });
  const haloMesh = new MeshNode(haloGeo, haloMat);
  haloMesh.castShadow = false;
  haloMesh.receiveShadow = false;
  haloMesh.renderOrder = 3;
  haloMesh.frustumCulled = false;
  haloMesh.freezeStatic();
  root.add(haloMesh);

  // Starfield dome for Star-Vault (core) and twilight sparkle for courtyard & marsh
  const starCount = biomeId === "core" ? 84 : biomeId === "courtyard" || biomeId === "marsh" ? 32 : 0;
  if (starCount > 0) {
    const starParts = [];
    const starR = radius - 1.2;
    for (let i = 0; i < starCount; i++) {
      const sa = ((i * 2.39996) % TAU) - Math.PI;
      const sy = 9.5 + ((i * 19) % 27) + Math.sin(i * 1.7) * 1.2;
      const sr = (biomeId === "core" ? 0.16 : 0.11) + (i % 3) * 0.055;
      starParts.push(octahedron(sr).translate(Math.cos(sa) * starR, sy, Math.sin(sa) * starR));
    }
    const starMat = new Material({
      shader: "emissive",
      color: biomeId === "core" ? 0xf6dcff : 0xfff0c8,
      emissiveIntensity: biomeId === "core" ? 1.45 : 1.15,
      transparent: true,
      opacity: biomeId === "core" ? 0.88 : 0.58,
      depthWrite: false,
      fog: false,
    });
    const starMesh = new MeshNode(mergeGeometries(starParts), starMat);
    starMesh.castShadow = false;
    starMesh.receiveShadow = false;
    starMesh.renderOrder = 3;
    starMesh.frustumCulled = false;
    starMesh.freezeStatic();
    root.add(starMesh);
  }

  root.freezeStatic();
  return root;
}
