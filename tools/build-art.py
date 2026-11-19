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


def brush_strokes(size, count, seed, angle_deg, spread_deg, length_range, width_range, strength):
    """Stamp seamless wrapped painterly brushstroke streaks into a float32 canvas."""
    rng = np.random.default_rng(seed)
    canvas = Image.new("L", (size, size), 128)
    draw = ImageDraw.Draw(canvas)
    for _ in range(count):
        cx = rng.uniform(0, size)
        cy = rng.uniform(0, size)
        ang = math.radians(angle_deg + rng.uniform(-spread_deg, spread_deg))
        length = rng.uniform(*length_range) * size
        width = max(1, int(round(rng.uniform(*width_range) * size)))
        val = int(round(128 + rng.uniform(-1.0, 1.0) * 120 * strength))
        dx = math.cos(ang) * length * 0.5
        dy = math.sin(ang) * length * 0.5
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                x0, y0 = cx - dx + ox, cy - dy + oy
                x1, y1 = cx + dx + ox, cy + dy + oy
                if (max(x0, x1) < -width or min(x0, x1) > size + width or
                        max(y0, y1) < -width or min(y0, y1) > size + width):
                    continue
                draw.line((x0, y0, x1, y1), fill=val, width=width)
    arr = np.asarray(canvas.filter(ImageFilter.GaussianBlur(1.4)), dtype=np.float32)
    return (arr - 128.0) / 120.0


def make_terrain_atlas():
    """3x2 seamless painterly terrain atlas (512x512 per biome tile).
    Order: 0=city, 1=shelf, 2=marsh, 3=core, 4=caldera, 5=flats.
    R/G/B store rich painterly albedo value+pigment modulation around each biome's signature palette.
    """
    size = 512
    atlas = Image.new("RGB", (size * 3, size * 2))
    specs = [
        # (base_rgb, warm_tint, cool_tint, angle, spread, seed)
        ((42, 62, 74), (72, 92, 98), (22, 34, 48), 18, 22, 101),    # city: rain-washed teal-slate flagstones
        ((96, 134, 158), (156, 198, 218), (54, 78, 114), -24, 16, 202),  # shelf: glacier snow & ice striations
        ((32, 64, 54), (78, 122, 92), (16, 36, 38), 10, 48, 303),   # marsh: mossy peat & damp bog
        ((52, 46, 84), (104, 82, 146), (26, 22, 52), 45, 32, 404),  # core: obsidian-amethyst fractured stone
        ((62, 44, 42), (118, 66, 48), (34, 24, 28), -12, 38, 505),  # caldera: volcanic basalt & ash
        ((146, 118, 86), (198, 166, 118), (98, 78, 62), 6, 14, 606),  # flats: wind-swept ochre sandstone & glass
    ]
    y, x = np.mgrid[0:size, 0:size] / size
    for idx, (base, warm, cool, angle, spread, seed) in enumerate(specs):
        fbm = periodic_fbm(size, 4, seed, anisotropy=(1.2, 0.9))
        fine = periodic_fbm(size, 3, seed + 17, anisotropy=(2.0, 2.0))
        strokes = brush_strokes(size, 420, seed + 33, angle, spread, (0.06, 0.22), (0.008, 0.026), 1.0)
        # Subtle gouache paper tooth
        tooth = np.random.default_rng(seed + 99).normal(0, 0.035, (size, size)).astype(np.float32)
        # Biome-specific subtle motif baked cleanly into the brushwork
        motif = np.zeros((size, size), dtype=np.float32)
        if idx == 0:  # city paving slabs
            gx = np.abs(np.sin(TAU * x * 4.0))
            gy = np.abs(np.sin(TAU * y * 4.0))
            seam = np.minimum(gx, gy)
            motif = np.where(seam < 0.045, -0.32, 0.06 * np.cos(TAU * (x * 2 + y)))
        elif idx == 1:  # shelf wind-carved sastrugi drifts
            motif = 0.28 * np.sin(TAU * (x * 2.0 + y * 1.0 + fbm * 0.35))
        elif idx == 2:  # marsh tangled bog ripples
            motif = 0.25 * np.sin(TAU * (x * 3.0 - y * 2.0 + fbm * 0.6))
        elif idx == 3:  # core crystalline facets
            motif = 0.28 * (np.abs(np.cos(TAU * (x * 3 + y * 2))) - 0.5)
        elif idx == 4:  # caldera cooled basalt crust ridges
            motif = 0.26 * np.cos(TAU * (x * 3 - y * 3 + fbm * 0.45))
        elif idx == 5:  # flats dune ripples
            motif = 0.24 * np.sin(TAU * (y * 6.0 + fbm * 0.3))

        t = np.clip(0.5 + fbm * 0.36 + strokes * 0.24 + fine * 0.12 + motif * 0.42 + tooth, 0.0, 1.0)
        base_v = np.array(base, dtype=np.float32)[None, None, :]
        warm_v = np.array(warm, dtype=np.float32)[None, None, :]
        cool_v = np.array(cool, dtype=np.float32)[None, None, :]
        # Smooth 3-stop painterly color ramp (cool shadow -> base -> warm lit stroke)
        lo = np.clip(t * 2.0, 0.0, 1.0)[..., None]
        hi = np.clip((t - 0.5) * 2.0, 0.0, 1.0)[..., None]
        rgb = np.where(t[..., None] < 0.5, cool_v * (1.0 - lo) + base_v * lo, base_v * (1.0 - hi) + warm_v * hi)
        tile = Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"))
        atlas.paste(tile, (size * (idx % 3), size * (idx // 3)))
    atlas.save(PUBLIC / "textures" / "terrain-atlas.webp", "WEBP", quality=88, method=6)


def make_surface_atlas():
    """3x2 seamless painterly material brushwork atlas (512x512 per material tile).
    Tile layout (col, row):
      (0,0) metal      (1,0) armor       (2,0) organic
      (0,1) basalt     (1,1) stone/wood  (2,1) ice/crystal
    R = painterly value/brush height, G = stylized micro-roughness, B = edge/ridge glint accent.
    """
    size = 512
    atlas = Image.new("RGB", (size * 3, size * 2))
    configs = [
        # (angle, spread, stroke_count, ridge_freq, roughness_base, seed)
        (0, 8, 520, 10, 0.28, 701),     # metal: crisp directional brushed grain
        (32, 26, 380, 6, 0.38, 702),    # armor: sculpted painted ceramic-enamel brushwork
        (74, 42, 460, 8, 0.56, 703),    # organic: living striated chitin / moss bark
        (-18, 55, 500, 5, 0.78, 704),   # basalt/rubber: matte volcanic stone grain
        (14, 30, 440, 7, 0.66, 705),    # stone/wood/sandstone: carved masonry brushwork
        (-45, 18, 360, 11, 0.18, 706),  # ice/crystal: sharp faceted crystalline streaks
    ]
    y, x = np.mgrid[0:size, 0:size] / size
    for idx, (ang, spread, count, rfreq, rough_base, seed) in enumerate(configs):
        fbm = periodic_fbm(size, 4, seed)
        strokes = brush_strokes(size, count, seed + 11, ang, spread, (0.05, 0.24), (0.006, 0.022), 1.0)
        tooth = np.random.default_rng(seed + 29).normal(0, 0.04, (size, size)).astype(np.float32)
        val = np.clip(0.54 + fbm * 0.22 + strokes * 0.26 + tooth, 0.0, 1.0)
        rough = np.clip(rough_base + fbm * 0.16 - strokes * 0.14, 0.05, 0.98)
        band = np.abs(np.cos(TAU * (x * rfreq * math.cos(math.radians(ang)) +
                                    y * rfreq * math.sin(math.radians(ang)) + fbm * 0.4)))
        glint = np.clip((band ** 6) * 0.65 + np.maximum(0.0, strokes) * 0.45, 0.0, 1.0)
        rgb = np.dstack([val * 255.0, rough * 255.0, glint * 255.0])
        tile = Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"))
        atlas.paste(tile, (size * (idx % 3), size * (idx // 3)))
    atlas.save(PUBLIC / "textures" / "surface-atlas.webp", "WEBP", quality=88, method=6)


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

    # (0,0) Painterly glow orb: crisp bright core + subtle star/brush aura
    wobble = 1.0 + 0.06 * np.cos(ang * 5.0) + 0.04 * np.sin(ang * 3.0 + 1.1)
    rr = r / wobble
    core = np.clip(1.0 - rr / 0.45, 0.0, 1.0) ** 1.6
    halo = np.clip(1.0 - rr, 0.0, 1.0) ** 2.4
    alpha0 = np.clip(core * 0.8 + halo * 0.72, 0.0, 1.0)
    lum0 = np.clip(0.75 + core * 0.25, 0.0, 1.0)
    q0 = np.dstack([lum0, lum0, lum0, alpha0]) * 255.0
    atlas.paste(Image.fromarray(q0.astype("uint8"), "RGBA"), (0, 0))

    # (1,0) Sharp kinetic spark / stylized diamond streak
    rx = np.abs(u)
    ry = np.abs(v)
    diamond = np.clip(1.0 - (rx / 0.22 + ry / 0.92), 0.0, 1.0) ** 1.2
    flare = np.clip(1.0 - np.sqrt((rx / 0.16) ** 2 + (ry / 0.88) ** 2), 0.0, 1.0) ** 1.8
    cross = np.clip(1.0 - (rx / 0.52 + ry / 0.14), 0.0, 1.0) ** 1.6 * 0.55
    alpha1 = np.clip(np.maximum(diamond, flare) + cross, 0.0, 1.0)
    q1 = np.dstack([np.ones_like(alpha1), np.ones_like(alpha1), np.ones_like(alpha1), alpha1]) * 255.0
    atlas.paste(Image.fromarray(q1.astype("uint8"), "RGBA"), (q, 0))

    # (0,1) Stylized billowing smoke cloud (clustered cel-painterly puffs)
    puff = np.zeros((q, q), dtype=np.float32)
    lobes = [(0.0, 0.0, 0.62), (-0.28, -0.14, 0.42), (0.28, -0.1, 0.44),
             (-0.18, 0.26, 0.4), (0.22, 0.24, 0.38), (0.0, -0.32, 0.36)]
    for lx, ly, lr in lobes:
        d = np.sqrt((u - lx) ** 2 + (v - ly) ** 2) / lr
        puff = np.maximum(puff, np.clip(1.0 - d, 0.0, 1.0))
    noise = periodic_fbm(q, 3, 912)
    edge = np.clip((puff + noise * 0.12) * 1.45, 0.0, 1.0)
    alpha2 = np.clip((edge - 0.18) / 0.42, 0.0, 1.0) * np.clip(1.0 - np.maximum(0.0, r - 0.85) / 0.15, 0.0, 1.0)
    # Internal painterly top-left lighting gradient baked into RGB
    shade = np.clip(0.68 - u * 0.14 - v * 0.24 + puff * 0.22, 0.35, 1.0)
    q2 = np.dstack([shade, shade, shade, alpha2]) * 255.0
    atlas.paste(Image.fromarray(q2.astype("uint8"), "RGBA"), (0, q))

    # (1,1) Soft ground contact shadow disc
    alpha3 = np.clip(1.0 - r, 0.0, 1.0) ** 1.9 * 0.72
    q3 = np.dstack([np.full_like(alpha3, 0.08), np.full_like(alpha3, 0.06), np.full_like(alpha3, 0.12), alpha3]) * 255.0
    atlas.paste(Image.fromarray(q3.astype("uint8"), "RGBA"), (q, q))

    atlas.save(PUBLIC / "textures" / "vfx-atlas.webp", "WEBP", quality=90, method=6)


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


def make_title_chart():
    rng = np.random.default_rng(6171)
    w, h = 1728, 1080
    cx, cy, radius = 557, 521, 355
    y, x = np.mgrid[0:h, 0:w]
    dist = np.sqrt(((x - cx) / w) ** 2 + ((y - cy) / h) ** 2)
    warm_glow = np.exp(-((x - cx) / 480) ** 2 - ((y - cy - 60) / 510) ** 2)
    cool_glow = np.exp(-((x - cx * 2.1) / 620) ** 2 - ((y - cy * 0.5) / 480) ** 2)
    grain = rng.normal(0, 1.4, (h, w))
    r_ch = 11 + warm_glow * 34 + cool_glow * 6 - dist * 7 + grain
    g_ch = 18 + warm_glow * 24 + cool_glow * 26 - dist * 6 + grain
    b_ch = 30 + warm_glow * 18 + cool_glow * 38 - dist * 8 + grain
    bg = Image.fromarray(np.dstack([r_ch, g_ch, b_ch]).clip(0, 255).astype("uint8")).convert("RGBA")
    trace = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(trace, "RGBA")
    orbital_emblem(draw, cx, cy, radius, 0.88)
    for _ in range(420):
        px, py = rng.integers([0, 0], [w, h])
        if (px - cx) ** 2 + (py - cy) ** 2 < radius ** 2 * 0.08:
            continue
        c = (255, 224, 168) if rng.random() < 0.6 else (120, 232, 220)
        draw.point((int(px), int(py)), fill=(*c, int(rng.integers(24, 135))))
    bg.alpha_composite(trace.filter(ImageFilter.GaussianBlur(8)))
    bg.alpha_composite(trace)
    bg.convert("RGB").save(PUBLIC / "textures" / "title-chart.webp", "WEBP", quality=90, method=6)


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
        canvas.resize((side, side), Image.Resampling.LANCZOS).save(PUBLIC / f"{name}.png", optimize=True)


if __name__ == "__main__":
    make_terrain_atlas()
    make_surface_atlas()
    make_vfx_atlas()
    make_title_chart()
    make_app_icons()
