"""Generate Riftline's stylized painterly atlases, VFX sheet, title artwork and install icons."""
from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PUBLIC = Path(__file__).resolve().parents[1] / "public"
TAU = math.tau


def periodic_fbm(size, octaves, seed, anisotropy=(1.0, 1.0)):
    """Seamless periodic multi-octave painterly value/brush noise."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size] / size
    acc = np.zeros((size, size), dtype=np.float32)
    amp = 0.55
    total = 0.0
    for oct_i in range(octaves):
        freq = 2 ** (oct_i + 1)
        fx = max(1, int(round(freq * anisotropy[0])))
        fy = max(1, int(round(freq * anisotropy[1])))
        # Sum several oriented harmonic waves + phase jitter for directional brushstroke feel
        layer = np.zeros((size, size), dtype=np.float32)
        for _ in range(3):
            kx = int(rng.integers(-fx, fx + 1)) or 1
            ky = int(rng.integers(-fy, fy + 1)) or 1
            phase = rng.uniform(0, TAU)
            layer += np.cos(TAU * (kx * x + ky * y) + phase)
        acc += (layer / 3.0) * amp
        total += amp
        amp *= 0.52
    return acc / max(total, 1e-6)


ATLAS_TILE = 512
ATLAS_GUTTER = 32


def add_gutter(pixels):
    pixels = np.clip(pixels, 0, 255).astype("uint8")
    return Image.fromarray(np.pad(pixels, ((ATLAS_GUTTER, ATLAS_GUTTER), (ATLAS_GUTTER, ATLAS_GUTTER), (0, 0)), mode="wrap"))


def brush_strokes(size, count, seed, angle_deg, spread_deg, length_range, width_range, strength):
    """Stamp seamless wrapped tapered painterly brushstroke dabs into a float32 canvas."""
    rng = np.random.default_rng(seed)
    canvas = Image.new("L", (size, size), 128)
    draw = ImageDraw.Draw(canvas)
    for _ in range(count):
        cx = rng.uniform(0, size)
        cy = rng.uniform(0, size)
        ang = math.radians(angle_deg + rng.uniform(-spread_deg, spread_deg))
        length = rng.uniform(*length_range) * size
        width = max(2, int(round(rng.uniform(*width_range) * size)))
        val = int(round(128 + rng.uniform(-1.0, 1.0) * 120 * strength))
        ca, sa = math.cos(ang), math.sin(ang)
        dx, dy = ca * length * 0.5, sa * length * 0.5
        px, py = -sa * width * 0.5, ca * width * 0.5
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                x0, y0 = cx - dx + ox, cy - dy + oy
                x1, y1 = cx + dx + ox, cy + dy + oy
                if (max(x0, x1) < -width or min(x0, x1) > size + width or
                        max(y0, y1) < -width or min(y0, y1) > size + width):
                    continue
                # Tapered diamond/elliptical gouache brushstroke dab instead of flat line cap
                mx, my = cx + ox, cy + oy
                pts = [
                    (x0, y0),
                    (mx - dx * 0.32 + px, my - dy * 0.32 + py),
                    (mx + dx * 0.32 + px * 0.92, my + dy * 0.32 + py * 0.92),
                    (x1, y1),
                    (mx + dx * 0.32 - px * 0.92, my + dy * 0.32 - py * 0.92),
                    (mx - dx * 0.32 - px, my - dy * 0.32 - py),
                ]
                draw.polygon(pts, fill=val)
    pad = 6
    wrapped = Image.fromarray(np.pad(np.asarray(canvas), pad, mode="wrap"))
    blurred = wrapped.filter(ImageFilter.GaussianBlur(1.5)).crop((pad, pad, size + pad, size + pad))
    arr = np.asarray(blurred, dtype=np.float32)
    return (arr - 128.0) / 120.0


def make_terrain_atlas():
    """3x2 seamless painterly storybook gouache terrain atlas (512x512 per biome tile).
    Order: 0=courtyard, 1=shelf, 2=marsh, 3=core, 4=caldera, 5=flats.
    Calm mid-frequency gouache brushwork so walkable combat floors stay readable while retaining tactile craft.
    """
    size = ATLAS_TILE - 2 * ATLAS_GUTTER
    atlas = Image.new("RGB", (ATLAS_TILE * 3, ATLAS_TILE * 2))
    specs = [
        # (base_rgb, warm_tint, cool_tint, angle, spread, seed)
        ((34, 50, 64), (52, 70, 84), (22, 32, 46), 18, 22, 101),          # courtyard: calm rain-washed courtyard flagstones
        ((96, 128, 154), (126, 156, 178), (66, 94, 124), -22, 16, 202),   # shelf: velvety blue-hour alpine snowfield
        ((30, 58, 48), (58, 92, 68), (18, 38, 36), 10, 42, 303),          # marsh: soft velvety moss turf & twilight bog
        ((30, 24, 56), (50, 40, 84), (18, 14, 36), 45, 28, 404),          # core: calm carved midnight-obsidian flagstones
        ((38, 27, 29), (58, 39, 36), (22, 15, 19), -12, 34, 505),         # caldera: warm-charred volcanic basalt plates
        ((134, 98, 66), (162, 124, 84), (98, 70, 50), 6, 14, 606),        # flats: calm golden-hour terracotta sandstone
    ]
    y, x = np.mgrid[0:size, 0:size] / size
    for idx, (base, warm, cool, angle, spread, seed) in enumerate(specs):
        fbm = periodic_fbm(size, 4, seed, anisotropy=(1.2, 0.9))
        fine = periodic_fbm(size, 3, seed + 17, anisotropy=(2.0, 2.0))
        strokes = brush_strokes(size, 420, seed + 33, angle, spread, (0.07, 0.24), (0.012, 0.032), 0.84)
        # Soft gouache watercolor paper tooth (low-noise so floors never sparkle/shimmer)
        tooth = np.random.default_rng(seed + 99).normal(0, 0.020, (size, size)).astype(np.float32)
        # Gentle biome-specific handcrafted motif baked cleanly into the brushwork (no ghost grid seams)
        motif = np.zeros((size, size), dtype=np.float32)
        if idx == 0:  # courtyard soft rain-glazed slate brush wash (flagstone mortar comes cleanly from floor shader)
            motif = 0.13 * np.cos(TAU * (x * 2.0 + y * 1.0 + fbm * 0.32))
        elif idx == 1:  # shelf gentle wind-carved snow drifts
            motif = 0.16 * np.sin(TAU * (x * 2.0 + y * 1.0 + fbm * 0.30))
        elif idx == 2:  # marsh soft mossy hummocks
            motif = 0.15 * np.sin(TAU * (x * 3.0 - y * 2.0 + fbm * 0.5))
        elif idx == 3:  # core subtle carved sanctuary flagstones
            motif = 0.11 * (np.abs(np.cos(TAU * (x * 3 + y * 2))) - 0.5)
        elif idx == 4:  # caldera cooled basalt crust ripples
            motif = 0.16 * np.cos(TAU * (x * 3 - y * 3 + fbm * 0.40))
        elif idx == 5:  # flats wind-brushed sandstone ripples
            motif = 0.15 * np.sin(TAU * (y * 6.0 + fbm * 0.25))

        t = np.clip(0.5 + fbm * 0.28 + strokes * 0.19 + fine * 0.08 + motif * 0.28 + tooth, 0.0, 1.0)
        base_v = np.array(base, dtype=np.float32)[None, None, :]
        warm_v = np.array(warm, dtype=np.float32)[None, None, :]
        cool_v = np.array(cool, dtype=np.float32)[None, None, :]
        # Smooth 3-stop painterly color ramp (cool shadow -> base -> warm lit stroke)
        lo = np.clip(t * 2.0, 0.0, 1.0)[..., None]
        hi = np.clip((t - 0.5) * 2.0, 0.0, 1.0)[..., None]
        rgb = np.where(t[..., None] < 0.5, cool_v * (1.0 - lo) + base_v * lo, base_v * (1.0 - hi) + warm_v * hi)
        atlas.paste(add_gutter(rgb), (ATLAS_TILE * (idx % 3), ATLAS_TILE * (idx // 3)))
    atlas.save(PUBLIC / "textures" / "terrain-atlas.webp", "WEBP", quality=90, method=6)


def make_surface_atlas():
    """3x2 seamless painterly material brushwork atlas (512x512 per material tile).
    Tile layout (col, row):
      (0,0) metal      (1,0) armor       (2,0) organic
      (0,1) basalt     (1,1) stone/wood  (2,1) ice/crystal
    R = painterly value/brush height, G = stylized micro-roughness, B = edge/ridge glint accent.
    Saved as lossless WebP so linear R/G/B data channels never suffer YUV chroma subsampling bleed.
    """
    size = ATLAS_TILE - 2 * ATLAS_GUTTER
    atlas = Image.new("RGB", (ATLAS_TILE * 3, ATLAS_TILE * 2))
    configs = [
        # (angle, spread, stroke_count, ridge_freq, roughness_base, seed)
        (0, 8, 520, 10, 0.24, 701),     # metal: crisp directional brushed brass/iron grain
        (32, 24, 360, 5, 0.32, 702),    # armor: smooth glazed porcelain-ceramic & enamel brushwork
        (74, 38, 440, 7, 0.66, 703),    # organic: velvety chitin / mushroom cap / moss bark
        (-18, 50, 480, 5, 0.82, 704),   # basalt/rubber: matte hand-carved volcanic stone
        (8, 18, 460, 7, 0.70, 705),     # stone/wood/sandstone: clean directional masonry & timber gouache
        (-45, 16, 360, 11, 0.14, 706),  # ice/crystal: gleaming faceted storybook crystal streaks
    ]
    y, x = np.mgrid[0:size, 0:size] / size
    for idx, (ang, spread, count, rfreq, rough_base, seed) in enumerate(configs):
        fbm = periodic_fbm(size, 4, seed)
        strokes = brush_strokes(size, count, seed + 11, ang, spread, (0.06, 0.24), (0.008, 0.024), 0.92)
        tooth = np.random.default_rng(seed + 29).normal(0, 0.022, (size, size)).astype(np.float32)
        val = np.clip(0.50 + fbm * 0.16 + strokes * 0.19 + tooth, 0.0, 1.0)
        rough = np.clip(rough_base + fbm * 0.11 - strokes * 0.09, 0.05, 0.98)
        bins_x = round(rfreq * math.cos(math.radians(ang)))
        bins_y = round(rfreq * math.sin(math.radians(ang)))
        band = np.abs(np.cos(TAU * (x * bins_x + y * bins_y + fbm * 0.35)))
        glint = np.clip((band ** 7) * 0.42 + np.maximum(0.0, strokes) * 0.28, 0.0, 1.0)
        rgb = np.dstack([val * 255.0, rough * 255.0, glint * 255.0])
        atlas.paste(add_gutter(rgb), (ATLAS_TILE * (idx % 3), ATLAS_TILE * (idx // 3)))
    atlas.save(PUBLIC / "textures" / "surface-atlas.webp", "WEBP", lossless=True, method=6)


def make_vfx_atlas():
    """2x2 RGBA stylized painterly VFX sprite atlas (256x256 per quadrant):
      (0,0) painterly glow orb       (1,0) sharp kinetic spark/slash
      (0,1) stylized billowing smoke (1,1) soft contact shadow disc
    """
    q = 256
    atlas = Image.new("RGBA", (q * 2, q * 2), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:q, 0:q]
    u = (xx + 0.5) / q * 2.0 - 1.0
    v = (yy + 0.5) / q * 2.0 - 1.0
    r = np.sqrt(u * u + v * v)
    ang = np.arctan2(v, u)

    # (0,0) Painterly glow orb: punchier crisp luminous heart + soft painterly halo
    wobble = 1.0 + 0.05 * np.cos(ang * 5.0) + 0.03 * np.sin(ang * 3.0 + 1.1)
    rr = r / wobble
    core = np.clip(1.0 - rr / 0.42, 0.0, 1.0) ** 1.35
    halo = np.clip(1.0 - rr, 0.0, 1.0) ** 2.2
    alpha0 = np.clip(core * 0.92 + halo * 0.72, 0.0, 1.0)
    lum0 = np.clip(0.78 + core * 0.22, 0.0, 1.0)
    q0 = np.dstack([lum0, lum0, lum0, alpha0]) * 255.0
    atlas.paste(Image.fromarray(q0.astype("uint8"), "RGBA"), (0, 0))

    # (1,0) Punchy kinetic star-spark / stylized 4-point impact flash
    rx = np.abs(u)
    ry = np.abs(v)
    diamond = np.clip(1.0 - (rx / 0.24 + ry / 0.94), 0.0, 1.0) ** 1.1
    flare = np.clip(1.0 - np.sqrt((rx / 0.18) ** 2 + (ry / 0.90) ** 2), 0.0, 1.0) ** 1.6
    cross = np.clip(1.0 - (rx / 0.62 + ry / 0.16), 0.0, 1.0) ** 1.35 * 0.72
    center = np.clip(1.0 - r / 0.30, 0.0, 1.0) ** 1.5 * 0.85
    alpha1 = np.clip(np.maximum(diamond, flare) + cross + center, 0.0, 1.0)
    q1 = np.dstack([np.ones_like(alpha1), np.ones_like(alpha1), np.ones_like(alpha1), alpha1]) * 255.0
    atlas.paste(Image.fromarray(q1.astype("uint8"), "RGBA"), (q, 0))

    # (0,1) Stylized storybook gouache smoke puff (crisp cel silhouette with soft internal shading)
    puff = np.zeros((q, q), dtype=np.float32)
    lobes = [(0.0, 0.0, 0.58), (-0.27, -0.14, 0.40), (0.27, -0.10, 0.42),
             (-0.18, 0.24, 0.38), (0.22, 0.22, 0.36), (0.0, -0.30, 0.34)]
    for lx, ly, lr in lobes:
        d = np.sqrt((u - lx) ** 2 + (v - ly) ** 2) / lr
        puff = np.maximum(puff, np.clip(1.0 - d, 0.0, 1.0))
    noise = periodic_fbm(q, 3, 912)
    edge = np.clip((puff + noise * 0.09) * 1.55, 0.0, 1.0)
    alpha2 = np.clip((edge - 0.24) / 0.28, 0.0, 1.0) * np.clip(1.0 - np.maximum(0.0, r - 0.84) / 0.14, 0.0, 1.0)
    # Soft cel-stepped top-left storybook highlight baked into RGB
    raw_shade = np.clip(0.66 - u * 0.15 - v * 0.25 + puff * 0.24, 0.34, 1.0)
    shade = np.clip(0.45 + 0.55 * (1.0 / (1.0 + np.exp(-9.0 * (raw_shade - 0.62)))), 0.38, 1.0)
    q2 = np.dstack([shade, shade, shade, alpha2]) * 255.0
    atlas.paste(Image.fromarray(q2.astype("uint8"), "RGBA"), (0, q))

    # (1,1) Soft ground contact shadow disc (warm indigo-ink shadow)
    alpha3 = np.clip(1.0 - r, 0.0, 1.0) ** 1.85 * 0.76
    q3 = np.dstack([np.full_like(alpha3, 0.06), np.full_like(alpha3, 0.05), np.full_like(alpha3, 0.11), alpha3]) * 255.0
    atlas.paste(Image.fromarray(q3.astype("uint8"), "RGBA"), (q, q))

    atlas.save(PUBLIC / "textures" / "vfx-atlas.webp", "WEBP", quality=92, method=6)


def orbital_emblem(draw, cx, cy, unit, opacity=1.0):
    def col(r, g, b, a):
        return r, g, b, round(a * opacity)

    def ring(rad, width, fill, start=0, end=360):
        rad *= unit
        draw.arc((cx - rad, cy - rad, cx + rad, cy + rad), start, end, fill, max(1, round(width * unit)))

    for rad, width, shade in [
        (1.24, 0.003, col(120, 214, 210, 68)),
        (1.15, 0.005, col(244, 186, 108, 178)),
        (0.98, 0.012, col(236, 134, 86, 185)),
        (0.955, 0.003, col(255, 224, 168, 210)),
        (0.74, 0.004, col(110, 220, 206, 168)),
        (0.54, 0.006, col(244, 178, 98, 215)),
        (0.32, 0.003, col(252, 226, 180, 160)),
    ]:
        ring(rad, width, shade)
    ring(1.04, 0.018, col(255, 118, 88, 215), 196, 260)
    ring(1.04, 0.018, col(255, 118, 88, 215), 16, 80)
    ring(0.86, 0.008, col(94, 232, 212, 192), 38, 152)
    ring(0.86, 0.008, col(94, 232, 212, 192), 212, 326)
    for i in range(96):
        a = TAU * i / 96
        dx, dy = math.cos(a) * unit, math.sin(a) * unit
        mark = 0.075 if i % 8 == 0 else 0.036 if i % 2 == 0 else 0.018
        draw.line(
            (cx + dx * 1.15, cy + dy * 1.15, cx + dx * (1.15 + mark), cy + dy * (1.15 + mark)),
            col(248, 198, 128, 188 if i % 2 == 0 else 94),
            max(1, round(unit * 0.004)),
        )
    for i in range(8):
        a = TAU * i / 8
        dx, dy = math.cos(a) * unit, math.sin(a) * unit
        draw.line((cx + dx * 0.34, cy + dy * 0.34, cx + dx * 0.94, cy + dy * 0.94), col(172, 216, 218, 95), 2)
        px, py = cx + dx * 0.74, cy + dy * 0.74
        d = unit * (0.025 if i % 2 else 0.042)
        draw.polygon([(px, py - d), (px + d, py), (px, py + d), (px - d, py)], fill=col(255, 206, 134, 218))


def make_app_icons():
    canvas = Image.new("RGB", (1536, 1536), "#0e1924")
    ink = ImageDraw.Draw(canvas, "RGBA")
    orbital_emblem(ink, 768, 768, 464, 0.96)
    ink.ellipse((514, 514, 1022, 1022), fill="#162836", outline="#f2b263", width=11)
    ink.polygon([(768, 535), (918, 768), (768, 1001), (618, 768)], fill="#f27d52", outline="#ffe0ae", width=8)
    ink.polygon([(768, 616), (832, 768), (768, 920), (704, 768)], fill="#11222e")
    ink.ellipse((736, 736, 800, 800), fill="#7df2dc")
    for name, side in [("icon-512", 512), ("icon-maskable-512", 512), ("icon-192", 192),
                       ("apple-touch-icon", 180), ("favicon-48", 48)]:
        image = canvas
        if name == "icon-maskable-512":
            image = Image.new("RGB", canvas.size, "#0e1924")
            inset = 96
            size = canvas.width - inset * 2
            image.paste(canvas.resize((size, size), Image.Resampling.LANCZOS), (inset, inset))
        image.resize((side, side), Image.Resampling.LANCZOS).save(PUBLIC / f"{name}.png", optimize=True)


if __name__ == "__main__":
    make_terrain_atlas()
    make_surface_atlas()
    make_vfx_atlas()
    make_app_icons()
