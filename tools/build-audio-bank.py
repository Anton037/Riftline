"""Synthesize Riftline's original short excitation bank at 22,050 Hz."""
from pathlib import Path
import json
import math
import random
import struct
import wave

ROOT = Path(__file__).resolve().parent.parent
RATE = 22050
TAU = math.tau
# Clip, length, fundamental, detuned upper modes, brightness, dispersion.
CLIPS = [
    ("stylus_tap_000", .19, 482, (1, 2.53, 4.21), .22, .003),
    ("stylus_tap_001", .21, 531, (1, 2.37, 4.19), .23, .007),
    ("ceramic_knock_000", .34, 233, (1, 2.19, 3.72), .29, .014),
    ("ceramic_knock_001", .39, 207, (1, 2.36, 4.15), .32, .012),
    ("brass_plate", .45, 188, (1, 2.85, 4.09), .11, .007),
    ("porcelain_burst_000", .37, 617, (1, 1.55, 2.39, 4.24), .29, .016),
    ("porcelain_burst_001", .42, 587, (1, 1.91, 2.49, 4.53), .35, .023),
    ("clay_thump", .24, 122, (1, 1.91, 2.57), .36, .016),
    ("felt_tap", .20, 171, (1, 1.39, 2.18), .26, .008),
    ("wooden_resonator", .29, 311, (1, 1.57, 3.22), .16, .012),
    ("stone_step_000", .17, 163, (1, 2.1, 4.7), .43, .011),
    ("stone_step_001", .18, 177, (1, 2.28, 4.85), .39, .008),
    ("frost_step", .26, 292, (1, 2.14, 3.37), .68, .027),
    ("reed_step", .24, 147, (1, 1.91, 3.77), .57, .019),
    ("panel_step", .21, 196, (1, 2.75, 4.12), .28, .009),
    ("reed_release", .18, 321, (1, 1.53, 2.74), .35, .009),
    ("spindle_strike", .36, 361, (1, 2.94, 4.67), .15, .008),
    ("compressed_coil", .21, 139, (1, 2.37, 4.2), .56, .005),
    ("split_reed_release", .26, 104, (1, 2.31, 3.64), .53, .017),
]


def render(index, length, f, partials, hiss, scatter):
    rnd = random.Random(2871 + index)
    pcm = []
    lp = 0
    for i in range(round(RATE * length)):
        t = i / RATE
        lp += .17 * (rnd.uniform(-1, 1) - lp)
        y = hiss * lp * math.exp(-t / .033)
        for k, m in enumerate(partials):
            d = max(0, t - scatter * k)
            onset = min(1, d / .003)
            swing = .016 * (1 - math.exp(-d * 66))
            y += (math.sin(TAU * f * m * (d + swing)) * onset *
                  math.exp(-d / (length * (.26 - k*.036))) / (1 + k * 1.1))
        y *= min(1, t/.003, (length-t)/.021)
        pcm.append(y)
    peak = max(map(abs, pcm))
    return [round(y / peak * .74 * 32767) for y in pcm]


clips = {}
bank = []
for i, (name, *args) in enumerate(CLIPS):
    clip = render(i, *args)
    clips[name] = {"start": round(len(bank) / RATE, 7), "duration": round(len(clip) / RATE, 7)}
    bank.extend(clip)
    bank.extend([0] * round(RATE * .025))

with wave.open(str(ROOT / "public/audio/physical-bank.wav"), "wb") as wav:
    wav.setparams((1, 2, RATE, len(bank), "NONE", "not compressed"))
    wav.writeframes(struct.pack(f"<{len(bank)}h", *bank))
(ROOT / "src/audio/source-bank.js").write_text(
    "// Original synthesized excitation regions in seconds. Rebuild with tools/build-audio-bank.py.\n"
    + "export const SOURCE_CLIPS = " + json.dumps(clips, indent=2) + ";\n",
)
