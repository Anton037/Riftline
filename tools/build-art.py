"""Generate Riftline's glaze atlases, title illustration and install icons."""
from pathlib import Path
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PUBLIC = Path(__file__).resolve().parents[1] / "public"
RNG = np.random.default_rng(6171)
TAU = math.tau


def tile_atlas(filename, palettes, terrain):
    size = 432
    atlas = Image.new("RGB", (size * 3, size * 2))
    y, x = np.mgrid[0:size, 0:size] / size
    for index, pigment in enumerate(palettes):
        a = TAU * x
        b = TAU * y
        waves = (np.cos(a + np.sin(b) * .9) + .58 * np.sin(b * 2 - a * 2) +
                 .25 * np.sin(7 * a + 3 * b)) * .43
        flecks = (RNG.random((size, size)) ** 16) * 5
        if terrain:
            highlight = np.maximum(0, np.cos(4 * a - 2 * b + waves * 1.5 + index)) ** 18
            motif = (np.cos(2 * a + index / 2) * np.cos(2 * b)) ** 7
            finish = waves * 11 + flecks + highlight * 4 + motif * 3
        else:
            stripe = np.cos(12 * b + waves * .5) if index == 0 else np.cos(5 * a - b + 2 * waves)
            bands = np.maximum(0, stripe) ** 14
            pooled = np.cos(3 * a + np.sin(2 * b) * 1.5) * np.cos(2 * b - a)
            finish = 12 * waves + 38 * bands + 17 * pooled + flecks
        pixels = np.array(pigment)[None, None, :] + finish[..., None]
        image = Image.fromarray(pixels.clip(0, 255).astype("uint8"))
        atlas.paste(image, (size * (index % 3), size * (index // 3)))
    atlas.save(PUBLIC / "textures" / filename, "WEBP", quality=86, method=6)


def orbital_chart(draw, cx, cy, unit, opacity=1.0):
    def color(red, green, blue, alpha):
        return red, green, blue, round(alpha * opacity)

    def ring(r, width, fill, start=0, end=360):
        r *= unit
        draw.arc((cx-r, cy-r, cx+r, cy+r), start, end, fill, max(1, round(width * unit)))

    for radius, width, shade in [
        (1.22, .002, color(215, 174, 117, 75)), (1.205, .002, color(215, 174, 117, 124)),
        (1.13, .003, color(220, 167, 108, 171)), (.99, .009, color(171, 126, 86, 168)),
        (.972, .002, color(245, 202, 134, 191)), (.745, .002, color(248, 184, 119, 143)),
        (.558, .005, color(216, 147, 92, 211)), (.543, .002, color(223, 185, 127, 194)),
        (.32, .002, color(225, 187, 139, 144)),
    ]:
        ring(radius, width, shade)
    ring(1.025, .014, color(197, 108, 74, 190), 198, 258)
    ring(1.025, .014, color(197, 108, 74, 190), 18, 78)
    ring(.874, .004, color(124, 186, 170, 162), 40, 151)
    ring(.874, .004, color(124, 186, 170, 162), 210, 327)
    for i in range(144):
        a = TAU * i / 144
        dx, dy = math.cos(a) * unit, math.sin(a) * unit
        mark = .067 if i % 12 == 0 else .035 if i % 3 == 0 else .015
        draw.line((cx+dx*1.13, cy+dy*1.13, cx+dx*(1.13+mark), cy+dy*(1.13+mark)),
                  color(228, 181, 121, 170 if i % 3 == 0 else 86), max(1, round(unit * .003)))
    for i in range(8):
        a = TAU * i / 8
        dx, dy = math.cos(a) * unit, math.sin(a) * unit
        draw.line((cx+dx*.34, cy+dy*.34, cx+dx*.95, cy+dy*.95), color(211, 181, 139, 91), 1)
        px, py = cx+dx*.747, cy+dy*.747
        d = unit * (.022 if i % 2 else .036)
        draw.polygon([(px,py-d), (px+d,py), (px,py+d), (px-d,py)], fill=color(226, 173, 119, 194))


def chart():
    w, h = 1728, 1080
    cx, cy, radius = 557, 521, 350
    y, x = np.mgrid[0:h, 0:w]
    distance = np.sqrt(((x-cx)/w)**2 + ((y-cy)/h)**2)
    hot = np.exp(-((x-cx)/460)**2 - ((y-cy-95)/520)**2)
    paper = RNG.normal(0, 1.28, (h, w))
    ink = np.dstack([10+hot*16, 20+hot*19, 25+hot*20]) - distance[..., None]*5 + paper[..., None]
    background = Image.fromarray(ink.clip(0, 255).astype("uint8")).convert("RGBA")
    trace = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(trace, "RGBA")
    orbital_chart(draw, cx, cy, radius, .82)
    for _ in range(550):
        px, py = RNG.integers([0, 0], [w, h])
        if (px-cx)**2 + (py-cy)**2 < radius**2 * .075:
            continue
        draw.point((int(px), int(py)), fill=(246, 211, 153, int(RNG.integers(14, 105))))
    for side in [-1, 1]:
        dx = side * radius * 1.23
        for offset in [-.29, .29]:
            py = cy + radius * offset
            draw.line((cx + dx, py, cx + dx*1.32, py), (210, 156, 101, 71), 1)
    background.alpha_composite(trace.filter(ImageFilter.GaussianBlur(7)))
    background.alpha_composite(trace)
    background.convert("RGB").save(PUBLIC / "textures" / "title-chart.webp", "WEBP", quality=91, method=6)


def app_icons():
    canvas = Image.new("RGB", (1536, 1536), "#122425")
    ink = ImageDraw.Draw(canvas, "RGBA")
    orbital_chart(ink, 768, 768, 461, .96)
    ink.ellipse((522, 522, 1014, 1014), fill="#1f3434", outline="#d7945d", width=9)
    ink.polygon([(770,545),(909,768),(770,991),(628,768)], fill="#da815a", outline="#f1c79d", width=6)
    ink.polygon([(770,620),(826,768),(770,916),(712,768)], fill="#162929")
    ink.ellipse((741,739,799,797),fill="#f3d29f")
    for name, side in [("icon-512",512), ("icon-maskable-512",512), ("icon-192",192),
                       ("apple-touch-icon",180), ("favicon-48",48)]:
        canvas.resize((side, side), Image.Resampling.LANCZOS).save(PUBLIC / f"{name}.png", optimize=True)


if __name__ == "__main__":
    tile_atlas("terrain-atlas.webp", [
        (44,66,72), (72,93,107), (38,66,57), (55,51,78), (71,48,48), (100,81,65),
    ], True)
    tile_atlas("surface-atlas.webp", [
        (182,158,127), (208,206,193), (147,165,148), (126,120,120), (174,145,119), (211,222,230),
    ], False)
    chart()
    app_icons()
