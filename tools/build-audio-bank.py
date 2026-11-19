"""Synthesize Riftline's cozy handcrafted acoustic excitation bank at 22,050 Hz."""
from pathlib import Path
import json
import math
import random
import struct
import wave

ROOT = Path(__file__).resolve().parent.parent
RATE = 22050
TAU = math.tau

# Clip, length, fundamental (Hz), warm modal overtones, soft velvet breath, modal dispersion.
# Tuned for tactile, non-fatiguing miniature-world materials: felted kalimba, rosewood marimba,
# glazed celesta bells, mellow antique brass, clay hand-drums, powdery snow & mossy reeds.
CLIPS = [
    ("stylus_tap_000", .19, 392, (1, 2.0, 3.01, 4.02), .09, .003),
    ("stylus_tap_001", .21, 440, (1, 1.99, 2.99, 4.01), .10, .005),
    ("ceramic_knock_000", .34, 220, (1, 1.98, 2.97, 3.96), .13, .010),
    ("ceramic_knock_001", .39, 196, (1, 2.01, 3.02, 3.98), .14, .009),
    ("brass_plate", .45, 175, (1, 1.50, 2.01, 3.01), .07, .006),
    ("porcelain_burst_000", .37, 523, (1, 1.50, 2.00, 3.01), .12, .012),
    ("porcelain_burst_001", .42, 587, (1, 1.50, 2.01, 2.99), .14, .015),
    ("clay_thump", .24, 116, (1, 1.51, 2.03), .16, .011),
    ("felt_tap", .20, 165, (1, 1.498, 2.00), .10, .006),
    ("wooden_resonator", .29, 277, (1, 1.50, 2.02, 3.00), .10, .008),
    ("stone_step_000", .17, 155, (1, 1.62, 2.48), .22, .008),
    ("stone_step_001", .18, 168, (1, 1.66, 2.54), .20, .007),
    ("frost_step", .26, 262, (1, 1.75, 2.65), .34, .018),
    ("reed_step", .24, 142, (1, 1.58, 2.42), .28, .014),
    ("panel_step", .21, 185, (1, 2.00, 2.98), .15, .007),
    ("reed_release", .18, 294, (1, 1.50, 2.02), .18, .006),
    ("spindle_strike", .36, 330, (1, 1.99, 2.98, 4.00), .10, .006),
    ("compressed_coil", .21, 131, (1, 1.50, 2.01, 3.02), .24, .005),
    ("split_reed_release", .26, 98, (1, 1.51, 2.02, 2.98), .26, .012),
]


def render(index, length, f, partials, hiss, scatter):
    rnd = random.Random(2871 + index)
    pcm = []
    lp1 = 0.0
    lp2 = 0.0
    for i in range(round(RATE * length)):
        t = i / RATE
        # Two-pole velvet-filtered onset breath (warm tactile transient, zero harsh sizzle)
        lp1 += .14 * (rnd.uniform(-1, 1) - lp1)
        lp2 += .22 * (lp1 - lp2)
        y = hiss * lp2 * math.exp(-t / .028)
        for k, m in enumerate(partials):
            d = max(0.0, t - scatter * k)
            onset = min(1.0, d / .0035)
            # Gentle acoustic pitch settle on strike
            swing = .011 * (1.0 - math.exp(-d * 54.0))
            decay = length * max(.08, .30 - k * .045)
            y += (math.sin(TAU * f * m * (d + swing)) * onset *
                  math.exp(-d / decay) / (1.0 + k * 1.25))
        # Smooth zero-crossing start and clean fade-out tail
        env = min(1.0, t / .0035, (length - t) / .024)
        pcm.append(y * max(0.0, env))
    peak = max(map(abs, pcm)) or 1.0
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
