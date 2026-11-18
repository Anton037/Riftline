// Original score. Each biome has a different mode, register, meter accents and instrument.
const THEMES = {
  city: {
    roots: [50, 53, 46, 48],
    mode: [0, 2, 3, 7, 9, 10],
    line: [3, 0, 4, 2, 5, 1, 3, 2],
    pulse: [0, 5, 9, 13],
    bpm: [88, 136],
    instrument: "ceramic",
    octave: 12,
    bed: [153, 0.18, 0.071],
  },
  shelf: {
    roots: [56, 54, 51, 59],
    mode: [0, 2, 4, 6, 7, 11],
    line: [1, 4, 5, 4, 2, 0, 3, 4],
    pulse: [0, 7, 11, 14],
    bpm: [76, 144],
    instrument: "bow",
    octave: 24,
    bed: [295, 0.28, 0.045],
  },
  marsh: {
    roots: [48, 43, 51, 46],
    mode: [0, 1, 5, 7, 8, 10],
    line: [2, 1, 0, 3, 1, 5, 2, 4],
    pulse: [0, 3, 6, 10, 12],
    bpm: [94, 124],
    instrument: "reed",
    octave: 12,
    bed: [194, 0.2, 0.082],
  },
  core: {
    roots: [49, 47, 54, 45],
    mode: [0, 1, 3, 6, 8, 11],
    line: [3, 1, 5, 0, 2, 3, 5, 1],
    pulse: [0, 3, 7, 10, 14],
    bpm: [82, 158],
    instrument: "ceramic",
    octave: 19,
    bed: [411, 0.32, 0.11],
  },
  caldera: {
    roots: [45, 40, 43, 46],
    mode: [0, 1, 4, 5, 7, 10],
    line: [4, 2, 3, 1, 0, 4, 2, 5],
    pulse: [0, 4, 7, 12, 15],
    bpm: [86, 128],
    instrument: "brass",
    octave: 12,
    bed: [110, 0.16, 0.061],
  },
  flats: {
    roots: [52, 54, 49, 47],
    mode: [0, 2, 4, 7, 9, 11],
    line: [1, 3, 5, 4, 0, 2, 1, 4],
    pulse: [0, 2, 6, 9, 14],
    bpm: [100, 146],
    instrument: "reed",
    octave: 19,
    bed: [258, 0.23, 0.092],
  },
};

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const themeFor = (biome) => THEMES[biome] || THEMES.city;

export const scoreBiomes = Object.keys(THEMES);
export const scoreOrigin = (biome) => freq(themeFor(biome).roots[0]);

export function musicTrack(kind, biome) {
  const boss = kind === "boss";
  return { bpm: themeFor(biome).bpm[boss ? 1 : 0], bars: boss ? 20 : 16, gain: boss ? 1.08 : 1 };
}

export function playScore(engine, kind, biome, step, at) {
  const menu = kind === "menu";
  const boss = kind === "boss";
  const theme = themeFor(menu ? "city" : biome);
  const bar = step >> 4;
  const beat = step % 16;
  const root = theme.roots[(boss ? bar : bar >> 1) % 4];
  const note = (degree) => root + theme.mode[degree];
  const seconds = 240 / (menu ? 84 : musicTrack(kind, biome).bpm);
  const section = bar >> 2;
  const energy = boss ? 1 + engine.heat * 0.1 : engine.intensity;
  const phrase = theme.line;
  const tone = (midi, dur, wave, vol, opts = {}) =>
    engine.tone(freq(midi), dur, wave, vol, { at, dest: engine.mus, ...opts });

  if (beat === 0 || (boss && beat === 9)) {
    const long = seconds * (boss ? 0.72 : 1.16);
    tone(root - 12, long, "bow", boss ? 0.115 : 0.065, { attack: 0.05, hold: long * 0.32, lp: 550, dest: engine.pump });
    tone(note((bar + 2) % 5) + 12, long, "bow", boss ? 0.031 : 0.025, {
      attack: long * 0.31,
      hold: long * 0.24,
      lp: 1360,
      pan: -0.31,
      rev: 0.1,
      dest: engine.pump,
    });
    if (beat === 0)
      tone(note(3) + 7, long, "sine", 0.028, { attack: long * 0.29, hold: long * 0.32, pan: 0.42, dest: engine.pump });
  }

  const strike = theme.pulse.indexOf(beat);
  if (strike >= 0 && (!menu || strike < 3)) {
    const index = (strike + bar * 3 + (boss ? section : 0)) % phrase.length;
    const midi = note(phrase[index]) + theme.octave - (menu ? 2 : 0);
    const pan = strike % 2 ? 0.53 : -0.53;
    const airy = theme.instrument === "bow";
    tone(midi, (airy ? 0.62 : 0.46) + seconds * 0.1, theme.instrument, boss ? 0.087 : 0.049, {
      attack: airy ? 0.072 : 0.008,
      pan,
      rev: 0.16,
      lp: airy ? 2350 : 4200,
      dest: engine.delay,
    });
    if (boss || (energy > 0.45 && engine.bloom !== false)) {
      tone(midi + (strike % 2 ? -12 : 7), 0.33, "ceramic", boss ? 0.037 : 0.018, {
        pan: -pan,
        at: at + 0.06,
        dest: engine.delay,
        rev: 0.11,
      });
    }
  }

  if (boss) {
    if (beat === 0 || beat === 6 || beat === 10 || (section !== 3 && beat === 13)) {
      const f = 86 + (theme.roots[0] % 5) * 5;
      engine.tone(f, 0.32, "sine", 0.32, { at, to: f * 0.57, dest: engine.mus });
      engine.noise(0.16, 0.14, { at, f: 510, to: 140, q: 1.1, color: "pink", dest: engine.mus });
    }
    if (beat === 4 || beat === 12 || (engine.heat >= 1 && beat === 15)) {
      tone(root + 11, 0.29, "brass", 0.135, { lp: 2900, pan: beat < 10 ? -0.27 : 0.27, rev: 0.1 });
      engine.noise(0.13, 0.1 * energy, { at, f: 2800, type: "bandpass", q: 0.85, color: "pink", dest: engine.mus });
    }
    if (beat % 2 === 1 && (section !== 3 || engine.heat >= 2))
      tone(note(phrase[(beat + section) % 8]) - 6, 0.16, "reed", 0.068, {
        dest: engine.pump,
        lp: 1550,
        pan: beat % 4 === 1 ? -0.22 : 0.22,
      });
    if (engine.heat >= 2 && beat % 4 === 2)
      tone(note(phrase[beat >> 1]) + 25, 0.3, "ceramic", 0.035, { dest: engine.delay, rev: 0.15 });
  } else if (!menu && energy > 0.25 && (beat === 4 || beat === 12)) {
    engine.tone(freq(root - 8) * 1.5, 0.24, "ceramic", 0.026 * (1 + energy), {
      dest: engine.mus,
      at,
      to: freq(root - 8),
      lp: 1400,
    });
  }
}

export function scoreBed({ osc, loop, filt, lfo, level, root, barRate, boss }, biome) {
  const [air, drift, motion] = themeFor(biome).bed;
  const breath = filt("bandpass", air, 1.8, loop(0.74, "pink"));
  lfo(motion, air * 0.25, breath.frequency);
  level(breath, 0.17);
  const floor = level(osc("sine", root * 0.5), boss ? 0.044 : 0.029);
  lfo(boss ? barRate * 2 : drift, 0.014, floor.gain);
  const wire = level(osc("sine", root * 1.498), 0.019);
  lfo(motion * 0.71, 0.008, wire.gain);
}

function change(e, biome, at, resolve) {
  const origin = scoreOrigin(biome);
  const intervals = resolve ? [1, 1.498, 2] : [0.5, 0.749, 1.414, 2.121];
  for (const [index, ratio] of intervals.entries()) {
    e.tone(origin * ratio, 1.22 + index * 0.17, index === 0 ? "bow" : "ceramic", 0.13 / (1 + index * 0.31), {
      at: at + index * 0.067,
      dest: e.mus,
      attack: 0.025,
      hold: 0.17,
      rev: 0.28,
      pan: (index - 1) * 0.29,
    });
  }
}
export const musicImpact = (e, biome, at) => change(e, biome, at, false);
export const musicResolve = (e, biome, at) => change(e, biome, at, true);
