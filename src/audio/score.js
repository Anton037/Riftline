// Cozy storybook & biome-adventure original score.
// Every biome has its own warm modal scale, acoustic instrument pairing, register, groove and ambient bed.

const MENU_THEME = {
  roots: [50, 54, 47, 52], // Warm D Lydian / Maj9 hearth progression
  mode: [0, 2, 4, 6, 7, 9],
  line: [0, 2, 4, 5, 4, 2, 3, 1],
  pulse: [0, 3, 6, 10, 13],
  bpm: [82, 128],
  instrument: "harp",
  companion: "celesta",
  octave: 12,
  bed: [220, 0.18, 0.055],
};

const THEMES = {
  // Blackout City: cozy rain-dappled twilight courtyard — D Dorian kalimba, warm ceramic Rhodes & cello
  city: {
    roots: [50, 53, 48, 45],
    mode: [0, 2, 3, 5, 7, 9],
    line: [2, 4, 0, 3, 5, 4, 2, 1],
    pulse: [0, 3, 6, 10, 13],
    bpm: [88, 132],
    instrument: "kalimba",
    companion: "ceramic",
    octave: 12,
    bed: [196, 0.18, 0.065],
  },
  // Aurora Shelf: sunlit alpine snow & northern lights — F Lydian sparkling celesta, harp & warm strings
  shelf: {
    roots: [53, 57, 50, 55],
    mode: [0, 2, 4, 6, 7, 9],
    line: [0, 2, 4, 5, 3, 4, 2, 1],
    pulse: [0, 4, 7, 11, 14],
    bpm: [78, 138],
    instrument: "celesta",
    companion: "harp",
    octave: 12,
    bed: [262, 0.24, 0.048],
  },
  // Glowmarsh: whimsical firefly bog & mushroom village — G Mixolydian wooden marimba & mellow ocarina reed
  marsh: {
    roots: [43, 48, 45, 50],
    mode: [0, 2, 4, 7, 9, 10],
    line: [0, 2, 3, 1, 4, 3, 2, 5],
    pulse: [0, 3, 6, 9, 12],
    bpm: [94, 126],
    instrument: "marimba",
    companion: "reed",
    octave: 12,
    bed: [196, 0.2, 0.075],
  },
  // Shattered Core: velvet starlight crystal observatory — E Aeolian add9 harp, celesta & deep cello fifths
  core: {
    roots: [52, 48, 55, 50],
    mode: [0, 2, 3, 7, 9, 10],
    line: [3, 1, 4, 0, 2, 5, 3, 1],
    pulse: [0, 3, 7, 10, 14],
    bpm: [84, 144],
    instrument: "harp",
    companion: "celesta",
    octave: 12,
    bed: [330, 0.26, 0.088],
  },
  // Ashfall Caldera: warm dwarven hearth & volcanic forge — A Dorian mellow French horn & glowing marimba
  caldera: {
    roots: [45, 48, 43, 50],
    mode: [0, 2, 3, 5, 7, 9],
    line: [0, 3, 4, 2, 5, 4, 3, 1],
    pulse: [0, 4, 7, 11, 14],
    bpm: [88, 130],
    instrument: "brass",
    companion: "marimba",
    octave: 12,
    bed: [147, 0.16, 0.058],
  },
  // Glass Flats: sunlit golden sandstone & turquoise oases — E Major Pentatonic/Add9 acoustic harp & breezy reed
  flats: {
    roots: [52, 56, 49, 54],
    mode: [0, 2, 4, 7, 9, 11],
    line: [0, 2, 3, 4, 2, 1, 3, 5],
    pulse: [0, 2, 6, 9, 13],
    bpm: [98, 140],
    instrument: "harp",
    companion: "reed",
    octave: 12,
    bed: [247, 0.22, 0.082],
  },
};

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const themeFor = (biome) => THEMES[biome] || THEMES.city;

export const scoreBiomes = Object.keys(THEMES);
export const scoreOrigin = (biome) => freq(themeFor(biome).roots[0]);

export function musicTrack(kind, biome) {
  const boss = kind === "boss";
  return { bpm: themeFor(biome).bpm[boss ? 1 : 0], bars: boss ? 20 : 16, gain: boss ? 1.06 : 1 };
}

export function playScore(engine, kind, biome, step, at) {
  const menu = kind === "menu";
  const boss = kind === "boss";
  const theme = menu ? MENU_THEME : themeFor(biome);
  const bar = step >> 4;
  const beat = step % 16;
  const section = bar >> 2;
  const root = theme.roots[(boss ? bar + section : (bar >> 1) + (section & 1)) % 4];
  const note = (degree) => root + theme.mode[((degree % 6) + 6) % 6];
  const seconds = 240 / (menu ? 82 : musicTrack(kind, biome).bpm);
  const energy = boss ? 1 + engine.heat * 0.1 : engine.intensity;
  const phrase = theme.line;
  const tone = (midi, dur, wave, vol, opts = {}) =>
    engine.tone(freq(midi), dur, wave, vol, { at, dest: engine.mus, ...opts });

  // Warm bowed cello / string foundation on downbeats (evolves voicing per 4-bar section)
  if (beat === 0 || (boss && beat === 8)) {
    const long = Math.min(1.05, seconds * (boss ? 0.68 : 0.96));
    tone(root - 12, long, "bow", boss ? 0.1 : 0.062, {
      attack: 0.055,
      hold: long * 0.3,
      lp: 580,
      dest: engine.pump,
    });
    const colorDeg = (section + 2) % 5;
    tone(note(colorDeg) + 12, long, "bow", boss ? 0.03 : 0.024, {
      attack: long * 0.28,
      hold: long * 0.24,
      lp: 1450,
      pan: section % 2 ? 0.28 : -0.28,
      rev: 0.12,
      dest: engine.pump,
    });
    if (beat === 0) {
      tone(note(4), long * 0.92, "sine", 0.026, {
        attack: long * 0.26,
        hold: long * 0.3,
        pan: section % 2 ? -0.36 : 0.36,
        dest: engine.pump,
      });
    }
  }

  // Gentle mid-bar warm harmonicpluck so calm exploration feels rich & alive across sections
  if (!boss && beat === 8) {
    const midNote = note((section + bar) % 5) + (section >= 2 ? 12 : 0);
    tone(midNote, 0.36, "harp", menu ? 0.024 : 0.028, {
      attack: 0.012,
      lp: 2200,
      pan: bar % 2 ? -0.24 : 0.24,
      rev: 0.14,
      dest: engine.pump,
    });
  }

  // Main cozy melodic motif (evolves across 4-bar sections without harsh leaps)
  const strike = theme.pulse.indexOf(beat);
  if (strike >= 0 && (!menu || strike < 4)) {
    const index = (strike + bar * 2 + section) % phrase.length;
    const regLift = !menu && section === 2 && strike % 2 === 0 ? 12 : 0;
    const midi = note(phrase[index]) + theme.octave + regLift;
    const pan = strike % 2 ? 0.46 : -0.46;
    const softLead = theme.instrument === "brass" || theme.instrument === "reed";
    tone(midi, 0.42 + seconds * 0.08, theme.instrument, boss ? 0.078 : menu ? 0.042 : 0.048, {
      attack: softLead ? 0.028 : 0.008,
      pan,
      rev: 0.17,
      lp: softLead ? 2400 : 3800,
      dest: engine.delay,
    });
    // Companion counter-harmony blooms gently as combat warms up (or during boss fights)
    if (boss || (!menu && energy > 0.42 && engine.bloom !== false)) {
      const harmInterval = strike % 2 ? -5 : 7;
      tone(midi + harmInterval, 0.32, theme.companion, boss ? 0.035 : 0.02, {
        attack: 0.01,
        pan: -pan * 0.85,
        at: at + 0.055,
        lp: 3600,
        dest: engine.delay,
        rev: 0.14,
      });
    }
  }

  if (boss) {
    // Cozy-adventure boss groove: warm felted frame-drum heartbeat, brushed shaker & French-horn / marimba drive
    if (beat === 0 || beat === 6 || beat === 10 || (section !== 3 && beat === 13)) {
      const f = 92 + (theme.roots[0] % 5) * 4;
      engine.tone(f, 0.28, "sine", 0.28, { at, to: f * 0.54, dest: engine.mus });
      engine.noise(0.13, 0.095, { at, f: 420, to: 135, q: 1.0, color: "pink", dest: engine.mus });
    }
    if (beat === 4 || beat === 12 || (engine.heat >= 1 && beat === 15)) {
      tone(note((section + 4) % 6) + 12, 0.27, "brass", 0.11, {
        attack: 0.018,
        lp: 2400,
        pan: beat < 10 ? -0.25 : 0.25,
        rev: 0.12,
      });
      engine.noise(0.11, 0.075 * energy, { at, f: 2100, type: "bandpass", q: 1.1, color: "pink", dest: engine.mus });
    }
    if (beat % 2 === 1 && (section !== 3 || engine.heat >= 2)) {
      tone(note(phrase[(beat + section) % 8]), 0.16, "marimba", 0.062, {
        dest: engine.pump,
        lp: 1750,
        pan: beat % 4 === 1 ? -0.22 : 0.22,
      });
    }
    if (engine.heat >= 1 && beat === 7) {
      tone(note((bar + 3) % 6) + 12, 0.22, theme.companion, 0.036, {
        attack: 0.01,
        lp: 3200,
        pan: 0.3,
        dest: engine.delay,
        rev: 0.12,
      });
    }
    if (engine.heat >= 2 && beat % 4 === 2) {
      tone(note(phrase[beat >> 1]) + 24, 0.28, "celesta", 0.034, {
        attack: 0.008,
        lp: 4200,
        dest: engine.delay,
        rev: 0.16,
      });
    }
  } else if (!menu && energy > 0.24 && (beat === 4 || beat === 12)) {
    // Warm wooden marimba / felted pulse keeping gentle momentum during active waves
    tone(note((bar + (beat >> 2)) % 5), 0.22, "marimba", 0.025 * (1 + energy * 0.85), {
      attack: 0.008,
      lp: 1550,
      pan: beat === 4 ? -0.18 : 0.18,
    });
  }
}

export function scoreBed({ osc, loop, filt, lfo, level, root, barRate, boss }, biome) {
  const [air, drift, motion] = themeFor(biome).bed;
  const breath = filt("bandpass", air, 2.1, loop(0.7, "pink"));
  lfo(motion, air * 0.22, breath.frequency);
  level(breath, 0.15);
  const floor = level(osc("sine", root * 0.5), boss ? 0.04 : 0.028);
  lfo(boss ? barRate * 2 : drift, 0.012, floor.gain);
  const fifth = level(osc("sine", root * 1.498), 0.018);
  lfo(motion * 0.71, 0.007, fifth.gain);
}

// Warm, consonant adventure chords on boss arrival (open 5th + major 9th) and victory resolve (warm major triad)
function change(e, biome, at, resolve) {
  const origin = scoreOrigin(biome);
  const intervals = resolve ? [1, 1.25, 1.498, 2] : [0.5, 0.749, 1, 1.498, 2.245];
  for (const [index, ratio] of intervals.entries()) {
    const wave = index === 0 ? "bow" : resolve ? "harp" : index < 3 ? "brass" : "celesta";
    e.tone(origin * ratio, 1.15 + index * 0.14, wave, 0.115 / (1 + index * 0.28), {
      at: at + index * 0.062,
      dest: e.mus,
      attack: 0.028,
      hold: 0.16,
      lp: 3200,
      rev: 0.28,
      pan: (index - 1.5) * 0.24,
    });
  }
}
export const musicImpact = (e, biome, at) => change(e, biome, at, false);
export const musicResolve = (e, biome, at) => change(e, biome, at, true);
