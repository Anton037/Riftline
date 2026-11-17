// Phase 4A: generates the new pixel-art terrain atlas (public/textures/terrain-atlas.png).
// Six hand-authored dungeon-plate tiles in a 3x2 grid (256x256 each), laid out exactly like the
// old terrain-atlas.webp so `terrainPaint` in surface-shader.js keeps its tile mapping:
//   city (0,0) | shelf (1,0) | marsh (2,0) | core (0,1) | caldera (1,1) | flats (2,1)
// Art direction (Dead Cells x Inscryption, from the official key art):
//   - value structure ~70% dark / 20% mid / 10% bright: deep grout and shadowed plate faces,
//     one saturated hero accent per biome, emissive specks used sparingly
//   - Dead Cells slab construction: ashlar rows of chunky stone plates, top-lit bevels, cracks
//   - Inscryption palette discipline: desaturated mid-tones, carved/rough surfaces, warm accents
//     surrounded by encroaching dark
// Drawn on a 4px macro-pixel grid, fully tileable (every draw wraps modulo the tile size).
// No dependencies: minimal PNG encoder on top of node:zlib.
import fs from "node:fs";
import zlib from "node:zlib";

const TILE = 256; // px per tile (18 world units -> ~14 px per unit; slabs read 2-3 units wide)
const COLS = 3;
const ROWS = 2;

/* ---------------------------------------------------------------- tiny PNG encoder */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- helpers */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const shade = (c, f) =>
  (typeof c === "number" ? hex(c) : c.slice()).map((v) => Math.max(0, Math.min(255, Math.round(v * f))));

class Tile {
  constructor(palette, seed) {
    this.px = new Uint8Array(TILE * TILE * 4);
    this.rng = mulberry32(seed);
    this.p = palette;
    for (let i = 0; i < TILE * TILE; i++) this.setRaw(i, hex(palette.grout));
  }
  setRaw(i, [r, g, b], a = 255) {
    this.px[i * 4] = r;
    this.px[i * 4 + 1] = g;
    this.px[i * 4 + 2] = b;
    this.px[i * 4 + 3] = a;
  }
  // wrapped 4px macro-pixel setter — the whole tile stays seamless
  // accepts 0xRRGGBB numbers, [r,g,b] arrays and [0xRRGGBB] shorthand
  set(mx, my, color) {
    let [r, g, b] =
      typeof color === "number"
        ? hex(color)
        : color.length === 1 && typeof color[0] === "number" && color[0] > 255
          ? hex(color[0])
          : color;
    mx = ((mx % (TILE / 4)) + TILE / 4) % (TILE / 4);
    my = ((my % (TILE / 4)) + TILE / 4) % (TILE / 4);
    for (let dy = 0; dy < 4; dy++)
      for (let dx = 0; dx < 4; dx++) {
        const i = ((my * 4 + dy) * TILE + mx * 4 + dx) >>> 0;
        this.setRaw(i, [r, g, b]);
      }
  }
  jitter(c, amount) {
    return shade(c, 1 + (this.rng() * 2 - 1) * amount);
  }
  fillRect(mx0, my0, mw, mh, color) {
    for (let y = my0; y < my0 + mh; y++) for (let x = mx0; x < mx0 + mw; x++) this.set(x, y, color);
  }
}

/* ---------------------------------------------------------------- slab painter */
function paintTile(def, seed) {
  const t = new Tile(def, seed);
  const rng = t.rng;
  const M = TILE / 4; // macro pixels per side (64)

  // ashlar bond: rows of slabs with varied heights/widths, 1 macro-pixel (4px) grout between
  const rows = [];
  let y = -(1 + ((rng() * 3) | 0));
  while (y < M) {
    const h = [6, 7, 8, 9, 10][Math.min(4, (rng() * 5) | 0)];
    rows.push({ y, h });
    y += h + 1;
  }
  for (const row of rows) {
    let x = -((rng() * 6) | 0);
    while (x < M) {
      const w = [5, 6, 7, 8, 10, 12, 14][Math.min(6, (rng() * 7) | 0)];
      // plate face: pick a base variant, then per-cell value noise keeps it hand-painted
      const base = hex(def.plates[(rng() * def.plates.length) | 0]);
      for (let yy = row.y; yy < row.y + row.h; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const r = rng();
          let c = base;
          if (r < 0.07) c = shade(base, 0.9);
          else if (r < 0.16) c = shade(base, 1.08);
          else if (r > 0.97) c = shade(base, 1.14);
          t.set(xx, yy, c);
        }
      // Dead Cells bevel: bright top edge, dark bottom edge, faint side shading (light from top-left)
      for (let xx = x; xx < x + w; xx++) {
        t.set(xx, row.y, shade(base, 1.26));
        t.set(xx, row.y + 1, shade(base, 1.12));
        t.set(xx, row.y + row.h - 1, shade(base, 0.62));
        t.set(xx, row.y + row.h - 2, shade(base, 0.78));
      }
      for (let yy = row.y; yy < row.y + row.h; yy++) {
        t.set(x, yy, shade(base, 1.06));
        t.set(x + w - 1, yy, shade(base, 0.8));
      }
      // cracks: dark random walks from a random edge of some slabs
      if (rng() < 0.3) {
        let cx = x + 1 + ((rng() * (w - 2)) | 0);
        let cy = row.y;
        const steps = 3 + ((rng() * 6) | 0);
        for (let s = 0; s < steps; s++) {
          t.set(cx, cy, def.crack);
          if (rng() < 0.35) t.set(cx + 1, cy, def.crack);
          cy += 1;
          cx += rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0;
          if (cy >= row.y + row.h - 1) break;
        }
      }
      // biome surface details (moss, frost, ash, glaze, puddles) hug grout corners
      if (def.detail) def.detail(t, x, row.y, w, row.h, rng);
      x += w + 1;
    }
  }
  // rare emissive accents: the 10% that carries the scene (Dead Cells glow economy)
  if (def.accents)
    for (const acc of def.accents) {
      const n = Math.round(acc.density * M * M);
      for (let i = 0; i < n; i++) {
        const ax = (rng() * M) | 0;
        const ay = (rng() * M) | 0;
        t.set(ax, ay, acc.color);
        if (rng() < 0.5)
          t.set(
            ax + (rng() < 0.5 ? 1 : -1),
            ay,
            acc.color.map((c) => (c * 0.65) | 0),
          );
      }
    }
  // global speckle: roughen every macro pixel a touch (carved, not airbrushed)
  for (let my = 0; my < M; my++)
    for (let mx = 0; mx < M; mx++) {
      if (rng() < 0.08) {
        const i = ((my * 4 + 2) * TILE + mx * 4 + 2) * 4;
        const f = rng() < 0.5 ? 0.95 : 1.05;
        t.px[i] = Math.min(255, (t.px[i] * f) | 0);
        t.px[i + 1] = Math.min(255, (t.px[i + 1] * f) | 0);
        t.px[i + 2] = Math.min(255, (t.px[i + 2] * f) | 0);
      }
    }
  return t;
}

/* ---------------------------------------------------------------- biome plates */
// Palettes: grout = near-black ink (Inscryption), plates = desaturated mids, accents = the hero color.
export const TILE_DEFS = {
  // Blackout District: wet asphalt slabs under a cold moon; pale worn curb paint is the only light note
  city: {
    grout: 0x060709,
    plates: [0x2c3342, 0x242a37, 0x343b4d, 0x1e2430],
    crack: hex(0x0a0c12),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.22) {
        // sheen of a drying puddle: two rows of cold moonlight reflection
        const c = [0x5f7f9e, 0x46688a];
        t.set(x + 1 + ((rng() * (w - 2)) | 0), y + ((rng() * h) | 0), c[rng() < 0.5 ? 0 : 1]);
      }
      if (rng() < 0.1) t.set(x + ((rng() * w) | 0), y + ((rng() * h) | 0), [0x8a93a6]); // worn lane paint
    },
    accents: [{ color: [0x9fc4e8, 0, 0], density: 0.0008 }],
    // (accents handled specially below; keep the array shape)
  },
  // Frozen Shelf: blue-gray ice plates, frost bloom, dark teal grout
  shelf: {
    grout: 0x081018,
    plates: [0x3a5878, 0x2c4560, 0x46688c, 0x24384e],
    crack: hex(0x0c1826),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.3) {
        const fx = x + ((rng() * w) | 0);
        const fy = y + ((rng() * h) | 0);
        t.set(fx, fy, [0x9ec6dc]);
        if (rng() < 0.5) t.set(fx + 1, fy, [0x7aa8c4]);
      }
      if (rng() < 0.12) t.set(x + ((rng() * w) | 0), y + ((rng() * h) | 0), [0xdceef8]); // ice glint
    },
    accents: [{ color: [0, 0xe8f4ff, 0], density: 0.00022 }],
  },
  // Glowmarsh: sunk black peat plates, bioluminescent moss fringes, ink-black water in the joints
  marsh: {
    grout: 0x040907,
    plates: [0x244034, 0x1c332a, 0x2d5040, 0x16281f],
    crack: hex(0x08120e),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.34) {
        // moss creeps from the slab corner toward the grout
        const mx = x + (rng() < 0.5 ? 0 : w - 1);
        const my = y + (rng() < 0.5 ? 0 : h - 1);
        t.set(mx, my, [0x2e5c46]);
        if (rng() < 0.6) t.set(mx + (rng() < 0.5 ? 1 : -1), my, [0x24493a]);
        if (rng() < 0.3) t.set(mx, my + (rng() < 0.5 ? 1 : -1), [0x3a7a5c]);
      }
    },
    accents: [{ color: [0, 0xe8a8ff, 0], density: 0.0012 }], // spore glow (teal-green handled in detail)
  },
  // Violet Core: dark cathedral stone with pale veins and rare glowing runes
  core: {
    grout: 0x0a0611,
    plates: [0x32264a, 0x3f3058, 0x28203c, 0x4a3a68],
    crack: hex(0x0d0916),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.2) {
        const vx = x + 1 + ((rng() * (w - 2)) | 0);
        const vy = y + ((rng() * h) | 0);
        t.set(vx, vy, [0x8f7bb8]); // pale mineral vein
      }
      if (rng() < 0.06) {
        // a rune: tiny 3-macro diamond of violet light
        const rx = x + 1 + ((rng() * (w - 3)) | 0);
        const ry = y + 1 + ((rng() * (h - 3)) | 0);
        const g = [0xc58bff];
        t.set(rx, ry, g);
        t.set(rx - 1, ry, shade(0xc58bff, 0.6));
        t.set(rx + 1, ry, shade(0xc58bff, 0.6));
        t.set(rx, ry - 1, shade(0xc58bff, 0.6));
        t.set(rx, ry + 1, shade(0xc58bff, 0.6));
      }
    },
    accents: [],
  },
  // Ember Forge: basalt plates over ember fissures; ash drifts cool the surface
  caldera: {
    grout: 0x0e0806,
    plates: [0x3c2c20, 0x2e221a, 0x4a3626, 0x241a18],
    crack: hex(0x120b08),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.3) t.set(x + ((rng() * w) | 0), y + ((rng() * h) | 0), [0x98897e]); // ash drift
      if (rng() < 0.14) {
        // ember fissure: a short crack that glows
        const ex = x + 1 + ((rng() * (w - 2)) | 0);
        const ey = y + ((rng() * (h - 1)) | 0);
        t.set(ex, ey, [0xff7a3c]);
        t.set(ex, ey + 1, shade(0xff7a3c, 0.55));
        if (rng() < 0.5) t.set(ex + 1, ey, [0xffb066]);
      }
    },
    accents: [{ color: [0, 0, 0], density: 0 }],
  },
  // Glass Flats: pale baked slabs with glaze crackle and embedded glass shards
  flats: {
    grout: 0x2c2318,
    plates: [0x8a7a5f, 0x7c6c52, 0x98866a, 0x6e6048],
    crack: hex(0x4a3c2c),
    detail: (t, x, y, w, h, rng) => {
      if (rng() < 0.25) t.set(x + ((rng() * w) | 0), y + ((rng() * h) | 0), [0xc8b890]); // sun-bleach
      if (rng() < 0.1) {
        const sx = x + ((rng() * w) | 0);
        const sy = y + ((rng() * h) | 0);
        t.set(sx, sy, [0xd8ecf4]); // glass shard flash
        t.set(sx + 1, sy, [0xa8c8d4]);
      }
    },
    accents: [{ color: [0, 0, 0], density: 0 }],
  },
};

// the two "accents" entries above used a buggy packing; do accents properly on [r,g,b] colors
const PROPER_ACCENTS = {
  city: [{ color: [159, 196, 232], density: 0.00022 }], // cold moon specks
  shelf: [{ color: [220, 238, 248], density: 0.0006 }], // ice glints
  marsh: [{ color: [75, 232, 168], density: 0.00018 }], // spores
  core: [{ color: [197, 139, 255], density: 0.00018 }], // rune dust
  caldera: [{ color: [255, 176, 102], density: 0.00035 }], // ember sparks
  flats: [{ color: [255, 240, 200], density: 0.0004 }], // heat shimmer
};

/* ---------------------------------------------------------------- surface atlas (4E)
   The finish atlas (surface-atlas.png, also the UI `--painted-panel`) is a 3x2 grid sampled per
   material surface: metal (0,0) | armor (1,0) | organic (2,0) | rubber (0,1) | wood/basalt (1,1) |
   ice/crystal/sandstone (2,1). It multiplies the surface color, so it is painted as high-contrast
   carved pattern (dark seams, bright rivets/facets) with near-neutral hue. */
const SURFACE_DEFS = {
  metal: (t, rng) => {
    // riveted steel plates: big rectangles, dark seams, bright rivet dots
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const x = gx * 16,
          y = gy * 16;
        const c = shade(0x8d949a, 0.8 + rng() * 0.35);
        t.fillRect(x + 1, y + 1, 15, 15, c);
        t.set(x, y, [52, 56, 60]);
        for (let i = 0; i < 16; i++) t.set(x + ((rng() * 16) | 0), y, [46, 50, 54]); // top seam stays dark
      }
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const cx = gx * 16 + 4 + ((rng() * 7) | 0),
          cy = gy * 16 + 4 + ((rng() * 7) | 0);
        t.set(cx, cy, [235, 240, 244]); // rivet glint
        t.set(cx + 1, cy, [180, 188, 194]);
      }
  },
  armor: (t, rng) => {
    // layered plate: broad bevelled slabs with rivet rows along every seam
    const rows = [];
    for (let y = 0; y < 64; ) {
      const h = 6 + ((rng() * 5) | 0);
      rows.push([y, h]);
      y += h + 1;
    }
    for (const [ry, rh] of rows) {
      for (let x = 0; x < 64; x++) {
        const c = shade(0x9aa2a6, 0.75 + rng() * 0.4);
        t.set(x, ry + 1, c);
        if (rng() < 0.08) t.set(x, ry + 1, [230, 236, 240]); // rivet row on the seam
        for (let yy = ry + 2; yy < ry + rh; yy++) t.set(x, yy, shade(0x9aa2a6, 0.6 + rng() * 0.45));
        t.set(x, ry + rh, [40, 44, 48]);
      }
    }
  },
  organic: (t, rng) => {
    // chitin weave: diagonal fibers with blotches and pale scar lines
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const f = 0.72 + 0.22 * Math.sin((x + y * 2) * 0.7 + Math.sin(y * 0.9) * 2.2) + rng() * 0.16;
        t.set(x, y, shade(0x8a9488, f));
      }
    for (let i = 0; i < 26; i++) {
      const x = (rng() * 64) | 0,
        y = (rng() * 64) | 0;
      t.set(x, y, [225, 232, 222]);
      if (rng() < 0.5) t.set(x + 1, y + 1, [200, 210, 200]);
    }
  },
  rubber: (t, rng) => {
    // matte dark with fine cast texture and faint scratches
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const f = 0.85 + rng() * 0.2 + (rng() < 0.04 ? 0.35 : 0);
        t.set(x, y, shade(0x4a5154, f));
      }
    for (let i = 0; i < 12; i++) {
      const x = (rng() * 60) | 0,
        y = (rng() * 64) | 0,
        len = 2 + ((rng() * 5) | 0);
      for (let k = 0; k < len; k++) t.set(x + k, y + ((rng() * 2) | 0), [130, 138, 142]);
    }
  },
  wood: (t, rng) => {
    // carved planks / basalt strata: long horizontal grain, knots, deep joints
    const rows = [];
    for (let y = 0; y < 64; ) {
      const h = 5 + ((rng() * 6) | 0);
      rows.push([y, h]);
      y += h + 1;
    }
    for (const [ry, rh] of rows) {
      for (let x = 0; x < 64; x++)
        for (let yy = ry; yy < ry + rh; yy++) {
          const g = 0.7 + 0.25 * Math.sin(x * 0.35 + Math.sin(ry * 2.1) * 1.8 + rng() * 0.3);
          t.set(x, yy, shade(0x8d8676, g));
        }
      for (let x = 0; x < 64; x++) t.set(x, ry + rh, [38, 34, 30]);
      if (rng() < 0.7) {
        // knot
        const kx = (rng() * 60) | 0,
          ky = ry + 1 + ((rng() * (rh - 1)) | 0);
        t.set(kx, ky, [40, 36, 32]);
        t.set(kx + 1, ky, [190, 182, 166]);
      }
    }
  },
  ice: (t, rng) => {
    // crystal facets: bright angular sheets with dark splits
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const d = Math.abs((x * 0.9 + y * 1.3) % 18 - 9);
        const f = 0.85 + (d < 3 ? -0.3 : 0.15) + rng() * 0.14;
        t.set(x, y, shade(0xb4c4cc, f));
      }
    for (let i = 0; i < 20; i++) {
      const x = (rng() * 64) | 0,
        y = (rng() * 64) | 0;
      t.set(x, y, [244, 252, 255]);
    }
  },
};

export function buildSurfaceAtlas() {
  const order = ["metal", "armor", "organic", "rubber", "wood", "ice"];
  const atlas = new Uint8Array(COLS * TILE * ROWS * TILE * 4);
  order.forEach((id, i) => {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const rng = mulberry32(0xfeed + i * 104729);
    const t = new Tile({ grout: 0x303030 }, 0);
    SURFACE_DEFS[id](t, rng);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const si = (y * TILE + x) * 4;
        const di = ((row * TILE + y) * COLS * TILE + col * TILE + x) * 4;
        atlas[di] = t.px[si];
        atlas[di + 1] = t.px[si + 1];
        atlas[di + 2] = t.px[si + 2];
        atlas[di + 3] = 255;
      }
  });
  return { rgba: atlas, width: COLS * TILE, height: ROWS * TILE };
}

/* ---------------------------------------------------------------- assemble */
export function buildTerrainAtlas() {
  const order = ["city", "shelf", "marsh", "core", "caldera", "flats"];
  const atlas = new Uint8Array(COLS * TILE * ROWS * TILE * 4);
  order.forEach((id, i) => {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const def = { ...TILE_DEFS[id] };
    def.accents = PROPER_ACCENTS[id];
    const tile = paintTile(def, 0x5eed + i * 7919);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const si = (y * TILE + x) * 4;
        const di = ((row * TILE + y) * COLS * TILE + col * TILE + x) * 4;
        atlas[di] = tile.px[si];
        atlas[di + 1] = tile.px[si + 1];
        atlas[di + 2] = tile.px[si + 2];
        atlas[di + 3] = 255;
      }
  });
  return { rgba: atlas, width: COLS * TILE, height: ROWS * TILE };
}

// CLI entry (unconditional: the guard form of import.meta.url does not match Windows paths)
{
  const terrain = buildTerrainAtlas();
  fs.writeFileSync("public/textures/terrain-atlas.png", encodePng(terrain.width, terrain.height, terrain.rgba));
  console.log(`wrote public/textures/terrain-atlas.png (${terrain.width}x${terrain.height})`);
  const surface = buildSurfaceAtlas();
  fs.writeFileSync("public/textures/surface-atlas.png", encodePng(surface.width, surface.height, surface.rgba));
  console.log(`wrote public/textures/surface-atlas.png (${surface.width}x${surface.height})`);
}
