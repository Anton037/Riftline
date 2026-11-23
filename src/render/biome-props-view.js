// Interactive Cozy Diorama Biome Relics & Props View (WebGL2 Engine v2):
// - courtyard: Capacitor Garden-Lanterns (amber paper-screen pagoda lantern + warm light aura)
// - shelf:   Resonance Rime Clusters (sapphire crystalline frost nodes + traction powder burst)
// - marsh:   Buoyant Puffball Cushions (plump bioluminescent bog-puffball + spore hop haze)
// - core:    Harmonic Tuning Prisms (brass & royal-amethyst astral tuning-fork + ripple aura)
// - caldera: Forge Crucible Vents (bronze slag pot with 0.6s telegraph + forge-ring scorch)
// - flats:   Sun-Glass Refractor Prisms (turquoise desert-glass sun prism + sunburst fan)

import { Color } from "../engine/math.js";
import {
  beveledBox,
  cylinder,
  cone,
  sphere,
  octahedron,
  icosahedron,
  torus,
  meshPart,
  mergeGeometries,
} from "../engine/geometry.js";
import { CompactInstancePool } from "../engine/scene.js";
import { worldMaterial, emissiveMaterial } from "./materials.js";
import { FINISH } from "./palette.js";
import { clamp, TAU } from "../core/util.js";

const WHITE = new Color(0xffffff);
const WARN_AMBER = new Color(0xff9636);
const PROP_COLORS = {
  lantern: { glow: new Color(0xffd27d), burst: new Color(0xffe4a0), spark: new Color(0x7af4e4) },
  rime: { glow: new Color(0x9eeaff), burst: new Color(0xdff8ff), spark: new Color(0x74d8ff) },
  puffball: { glow: new Color(0x88f4ba), burst: new Color(0xc8ffe0), spark: new Color(0xf8cf78) },
  iceCrystal: { glow: new Color(0xd6a6ff), burst: new Color(0xf2d8ff), spark: new Color(0xffe094) },
  crucible: { glow: new Color(0xff8e3c), burst: new Color(0xffc970), spark: new Color(0xff6428) },
  sunglass: { glow: new Color(0x64f2de), burst: new Color(0xffe89c), spark: new Color(0x52e8d4) },
};

function buildPropKit(kind) {
  const body = [];
  const glow = [];
  if (kind === "lantern") {
    // Capacitor Street-Lantern: slate plinth, wrought-brass post, ceramic pagoda eaves, warm amber lantern cage
    body.push(
      meshPart(cylinder(0.42, 0.48, 0.12, 8), 0x263242, { y: 0.06 }),
      meshPart(torus(0.38, 0.032, 5, 16), FINISH.brass, { y: 0.12, rx: Math.PI / 2 }),
      meshPart(cylinder(0.08, 0.11, 0.72, 8), 0x38485c, { y: 0.46 }),
      meshPart(torus(0.13, 0.026, 5, 12), FINISH.brass, { y: 0.76, rx: Math.PI / 2 }),
      meshPart(beveledBox(0.36, 0.06, 0.36, 0.015), FINISH.brass, { y: 0.82 }),
      meshPart(cone(0.44, 0.22, 4), 0x2b3c50, { y: 1.34, ry: Math.PI * 0.25 }),
      meshPart(octahedron(0.09), FINISH.brass, { y: 1.5, sy: 1.3 }),
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI * 0.25;
      body.push(
        meshPart(cylinder(0.022, 0.022, 0.38, 6), 0x243040, {
          x: Math.cos(a) * 0.19,
          z: Math.sin(a) * 0.19,
          y: 1.04,
        }),
      );
    }
    glow.push(
      meshPart(beveledBox(0.26, 0.34, 0.26, 0.03), 0xffcf78, { y: 1.04 }),
      meshPart(torus(0.24, 0.02, 5, 16), 0x7ef2e2, { y: 0.84, rx: Math.PI / 2, anim: [3, 0.84, 0, 1.4] }),
    );
  } else if (kind === "rime") {
    // Resonance Rime Cluster: carved Nordic stone ring + faceted sapphire & ice-crystal cluster
    body.push(meshPart(cylinder(0.48, 0.54, 0.1, 8), 0x3b5068, { y: 0.05 }));
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      body.push(
        meshPart(icosahedron(0.11, 0), i % 2 ? 0xdff2ff : 0x5c8ab4, {
          x: Math.cos(a) * 0.44,
          z: Math.sin(a) * 0.44,
          y: 0.09,
          sy: 0.65,
        }),
      );
    }
    const shards = [
      [0, 0, 0.56, 0.2, 1.45, 0, 0, 0x62b8ec],
      [0.18, 0.08, 0.38, 0.14, 1.15, 0.18, -0.22, 0x8ad8ff],
      [-0.17, 0.1, 0.36, 0.13, 1.1, -0.2, 0.2, 0x4b9ad4],
      [0.04, -0.19, 0.34, 0.13, 1.0, -0.24, -0.06, 0xa8ecff],
    ];
    for (const [x, z, y, r, sy, rx, rz, col] of shards) {
      body.push(meshPart(octahedron(r), col, { x, y, z, sy, sx: 0.72, sz: 0.72, rx, rz }));
    }
    glow.push(
      meshPart(octahedron(0.14), 0xc8f8ff, { y: 0.62, sy: 1.5, sx: 0.55, sz: 0.55 }),
      meshPart(torus(0.32, 0.02, 5, 16), 0x8ee8ff, { y: 0.22, rx: Math.PI / 2, anim: [3, 0.22, 0, 1.1] }),
    );
  } else if (kind === "puffball") {
    // Buoyant Puffball Cushion: mossy bog root collar + plump velvet-spotted glowing puffball + twin baby buds
    body.push(
      meshPart(cylinder(0.46, 0.52, 0.1, 9), 0x264232, { y: 0.05 }),
      meshPart(sphere(0.42, 12, 9), 0x3b7a5e, { y: 0.34, sy: 0.78, anim: [4, 0.34, 0, -1.0] }),
      meshPart(sphere(0.18, 8, 6), 0x488e6c, { x: 0.32, z: 0.16, y: 0.2, sy: 0.76 }),
      meshPart(sphere(0.15, 8, 6), 0x326a50, { x: -0.28, z: -0.18, y: 0.18, sy: 0.75 }),
    );
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3;
      glow.push(
        meshPart(sphere(0.065, 6, 5), i % 2 ? 0xa6ffd2 : 0xfce08b, {
          x: Math.cos(a) * 0.27,
          z: Math.sin(a) * 0.27,
          y: 0.48,
          sy: 0.55,
          anim: [4, 0.34, 0, -1.0],
        }),
      );
    }
    glow.push(meshPart(torus(0.14, 0.026, 5, 12), 0xb8ffe0, { y: 0.62, rx: Math.PI / 2, anim: [4, 0.34, 0, -1.0] }));
  } else if (kind === "iceCrystal") {
    // Harmonic Tuning Prism: burnished brass astrolabe base + twin amethyst tuning prongs + levitating core crystal
    body.push(
      meshPart(cylinder(0.44, 0.5, 0.11, 8), 0x221a38, { y: 0.055 }),
      meshPart(torus(0.4, 0.032, 5, 18), FINISH.brass, { y: 0.12, rx: Math.PI / 2 }),
      meshPart(cylinder(0.14, 0.2, 0.22, 8), FINISH.brass, { y: 0.22 }),
      meshPart(beveledBox(0.42, 0.07, 0.14, 0.02), FINISH.brass, { y: 0.36 }),
      meshPart(beveledBox(0.09, 0.68, 0.11, 0.02), 0x7c4cd6, { x: -0.16, y: 0.72, rz: -0.05 }),
      meshPart(beveledBox(0.09, 0.68, 0.11, 0.02), 0x7c4cd6, { x: 0.16, y: 0.72, rz: 0.05 }),
    );
    glow.push(
      meshPart(octahedron(0.13), 0xf0c8ff, { y: 0.78, sy: 1.45, anim: [3, 0.78, 0, 1.8] }),
      meshPart(torus(0.28, 0.02, 5, 16), 0xe8b8ff, { y: 0.78, rx: 0.55, anim: [3, 0.78, 0, -1.35] }),
    );
  } else if (kind === "crucible") {
    // Forge Crucible Vent: dwarven basalt oct-plinth + bronze-banded slag pot + glowing molten magma core
    body.push(
      meshPart(cylinder(0.48, 0.54, 0.12, 8), 0x2c2224, { y: 0.06 }),
      meshPart(cylinder(0.38, 0.3, 0.48, 10), 0x3b2a28, { y: 0.34 }),
      meshPart(torus(0.36, 0.04, 6, 16), FINISH.copper, { y: 0.28, rx: Math.PI / 2 }),
      meshPart(torus(0.39, 0.042, 6, 16), FINISH.brass, { y: 0.54, rx: Math.PI / 2 }),
      meshPart(torus(0.1, 0.026, 5, 10), FINISH.brass, { x: 0.4, y: 0.4, ry: Math.PI / 2 }),
      meshPart(torus(0.1, 0.026, 5, 10), FINISH.brass, { x: -0.4, y: 0.4, ry: Math.PI / 2 }),
    );
    glow.push(
      meshPart(cylinder(0.3, 0.3, 0.06, 10), 0xff8a34, { y: 0.57 }),
      meshPart(sphere(0.18, 8, 6), 0xffd278, { y: 0.58, sy: 0.45, anim: [4, 0.56, 0, -1.2] }),
    );
  } else {
    // Sun-Glass Refractor Prism (flats): terracotta & brass sundial base + faceted turquoise desert-glass spire
    body.push(
      meshPart(cylinder(0.46, 0.52, 0.11, 8), 0xb8764a, { y: 0.055 }),
      meshPart(cylinder(0.34, 0.38, 0.1, 8), FINISH.brass, { y: 0.15 }),
      meshPart(torus(0.38, 0.028, 5, 16), FINISH.brass, { y: 0.16, rx: Math.PI / 2 }),
      meshPart(octahedron(0.3), 0x2ec8be, { y: 0.62, sy: 1.65, sx: 0.78, sz: 0.78, anim: [3, 0.62, 0, 1.0] }),
      meshPart(torus(0.3, 0.024, 5, 16), FINISH.brass, { y: 0.62, ry: 0.4, anim: [3, 0.62, 0, -1.3] }),
    );
    glow.push(
      meshPart(octahedron(0.16), 0xb8fff4, { y: 0.62, sy: 1.7, sx: 0.52, sz: 0.52, anim: [3, 0.62, 0, 1.0] }),
      meshPart(torus(0.24, 0.018, 5, 16), 0xffe494, { y: 0.22, rx: Math.PI / 2 }),
    );
  }
  return {
    body: mergeGeometries(body).toFlatShaded(),
    glow: mergeGeometries(glow),
  };
}

const PROP_SURFACE = {
  lantern: "metal",
  rime: "crystal",
  puffball: "organic",
  iceCrystal: "crystal",
  crucible: "basalt",
  sunglass: "crystal",
};

export class BiomePropsView {
  constructor(renderer) {
    this.r = renderer;
    this.pools = {};
    this.list = [];
    const mats = new Map();
    const getBodyMat = (surface) => {
      let m = mats.get(surface);
      if (!m) {
        m = worldMaterial({ surface, vertexColors: true });
        mats.set(surface, m);
      }
      return m;
    };
    const glowMat = emissiveMaterial({ color: 0xffffff, emissiveIntensity: 1.32, vertexColors: true });
    for (const kind of Object.keys(PROP_COLORS)) {
      const kit = buildPropKit(kind);
      const body = new CompactInstancePool(kit.body, getBodyMat(PROP_SURFACE[kind] || "stone"), 6);
      body.mesh.castShadow = true;
      body.mesh.receiveShadow = true;
      body.mesh.renderOrder = 1;
      const glow = new CompactInstancePool(kit.glow, glowMat, 6);
      glow.mesh.renderOrder = 2;
      renderer.scene.add(body.mesh);
      renderer.scene.add(glow.mesh);
      this.pools[kind] = { body, glow };
      this.list.push(body, glow);
    }
  }

  draw(dt, world) {
    const props = world.arena?.props;
    if (!props || !props.length) return;
    const r = this.r;
    const time = r.time;
    for (const prop of props) {
      const pool = this.pools[prop.kind];
      if (!pool) continue;
      const spec = PROP_COLORS[prop.kind] || PROP_COLORS.lantern;
      const ready = prop.cd <= 0 && prop.fuse <= 0;
      const recharge = prop.maxCd > 0 ? 1 - clamp(prop.cd / prop.maxCd, 0, 1) : 1;
      const arming = prop.fuse > 0;
      const armK = arming ? 1 - clamp(prop.fuse / 0.6, 0, 1) : 0;

      let scale = 1;
      let scaleY = 1;
      if (!ready && !arming) {
        if (prop.kind === "rime" || prop.kind === "puffball") {
          scale = 0.72 + 0.28 * recharge;
          scaleY = scale * (0.45 + 0.55 * recharge);
        } else {
          scaleY = 0.94 + 0.06 * recharge;
        }
      } else if (arming) {
        scale = 1 + 0.1 * Math.sin(armK * Math.PI * 3);
        scaleY = scale * (1 + 0.14 * armK);
      }

      const yaw = prop.id * 2.1;
      const jitterX = arming ? Math.sin(time * 48 + prop.id) * 0.035 * armK : 0;
      const jitterZ = arming ? Math.cos(time * 43 + prop.id) * 0.035 * armK : 0;
      const px = prop.x + jitterX;
      const pz = prop.y + jitterZ;
      const phase = time * (ready ? 2.4 : 0.8) + prop.id * 1.7;
      const packedPhase = Math.round((((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);

      const dimTone = ready || arming ? 1 : 0.68 + 0.32 * recharge;
      pool.body.push(
        px,
        0,
        pz,
        scale,
        scaleY,
        yaw,
        0,
        0,
        packedPhase,
        dimTone,
        dimTone,
        dimTone,
        arming ? 0.35 + 0.45 * armK : 0,
        arming ? 1 : ready ? 0.35 : 0,
      );

      const lanternGun = ready
        ? 0.85 + 0.22 * Math.sin(time * 3.4 + prop.id * 2)
        : arming
          ? 1.35 + 0.6 * armK
          : 0.14 + 0.24 * recharge;
      const gCol = arming ? WARN_AMBER : WHITE;
      pool.glow.push(
        px,
        0,
        pz,
        scale,
        scaleY,
        yaw,
        0,
        0,
        packedPhase,
        gCol.r * lanternGun,
        gCol.g * lanternGun,
        gCol.b * lanternGun,
        0,
        arming ? 1 : ready ? 0.35 : 0,
      );

      // Subtle cozy ground ring when charged so interactive relics read invitingly
      if (ready) {
        r.ringPool.colC(
          r.ringPool.y(px, 0.04, pz, time * 0.6 + prop.id, prop.r * 1.25),
          spec.glow,
          0.22 + 0.08 * Math.sin(time * 2.8 + prop.id),
        );
      }

      // Crucible 0.6s telegraph ring
      if (arming) {
        const rad = 4.2;
        r.ringPool.colC(r.ringPool.y(px, 0.06, pz, -time * 2.4, rad), WARN_AMBER, 0.42 + 0.5 * armK);
        r.discs.colC(r.discs.y(px, 0.035, pz, 0, rad * (0.25 + 0.75 * armK)), WARN_AMBER, 0.1 + 0.16 * armK);
      }

      // Active aura visuals (Courtyard Capacitor Garden-Lantern warmth & Core Harmonic Tuning Prism projectile-slow field)
      if (prop.auraT > 0) {
        const auraFade = Math.min(1, prop.auraT / 0.8);
        const auraR = prop.kind === "lantern" ? 4.4 : 4.5;
        r.ringPool.colC(r.ringPool.y(px, 0.045, pz, time * 0.9, auraR), spec.glow, 0.3 * auraFade);
        r.discs.colC(r.discs.y(px, 0.028, pz, 0, auraR), spec.glow, (prop.kind === "lantern" ? 0.09 : 0.07) * auraFade);
      }
    }
  }

  consume(event) {
    const r = this.r;
    const spec = PROP_COLORS[event.kind] || PROP_COLORS.lantern;
    const x = event.x;
    const z = event.y;
    const rad = event.r || 4.2;
    if (event.state === "arm") {
      r.ring(x, z, 0.5, rad * 0.65, WARN_AMBER, 0.28, 0.1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        r.emit(x, 0.62, z, Math.cos(a) * 2.4, 2.8, Math.sin(a) * 2.4, 0.38, 0.14, WARN_AMBER, {
          spark: true,
          drag: 2.2,
          grav: 5,
        });
      }
      return;
    }
    r.ring(x, z, 0.45, rad, spec.burst, 0.38, 0.1);
    r.flash(x, z, Math.max(3.5, rad * 1.15), 1.35, spec.glow, 4.5);
    r.engine.stampWake?.(x, z, Math.min(3.2, rad * 0.62), 0.75, 0, 0, 0.85, 0.65);
    const count = Math.round(16 * (r.fxMul || 1));
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * TAU + i * 0.31;
      const sp = (2.8 + (i % 4) * 1.4) * (event.kind === "sunglass" ? 1.35 : 1);
      r.emit(
        x + Math.cos(a) * 0.25,
        0.55,
        z + Math.sin(a) * 0.25,
        Math.cos(a) * sp,
        1.8 + (i % 3) * 0.9,
        Math.sin(a) * sp,
        0.48,
        event.kind === "puffball" ? 0.26 : 0.17,
        i % 2 ? spec.burst : spec.spark,
        {
          spark: event.kind !== "puffball",
          drag: event.kind === "puffball" ? 2.8 : 1.9,
          grav: event.kind === "puffball" ? 0.6 : 4.2,
          grow: event.kind === "puffball" ? 0.55 : 0,
        },
      );
    }
  }
}
