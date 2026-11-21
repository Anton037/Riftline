// Handcrafted Cozy Diorama & Biome-Adventure Original Score (v5.0):
// Six unmistakable per-biome musical arrangements, grooves, counter-melodies & modal scale helpers.

const MENU_THEME = {
  id: "menu",
  roots: [50, 54, 47, 52], // Warm D Lydian / Maj9 sanctuary hearth progression
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
  // 1. Lantern Courtyard: Rainy twilight courtyard groove — D Dorian kalimba, warm ceramic Rhodes, walking cello & soft brush
  courtyard: {
    id: "courtyard",
    roots: [50, 53, 48, 45],
    mode: [0, 2, 3, 5, 7, 9],
    line: [2, 4, 0, 3, 5, 4, 2, 1],
    counter: [4, 2, 5, 3, 1, 0, 3, 4],
    pulse: [0, 3, 6, 10, 13],
    bpm: [88, 132],
    instrument: "kalimba",
    companion: "ceramic",
    octave: 12,
    bed: [196, 0.18, 0.065],
  },
  // 2. Aurora Shelf: Sparkling alpine wonder — F Lydian celesta & harp arpeggios, shimmering glass harmonics & warm strings
  shelf: {
    id: "shelf",
    roots: [53, 57, 50, 55],
    mode: [0, 2, 4, 6, 7, 9],
    line: [0, 2, 4, 5, 3, 4, 2, 1],
    counter: [4, 5, 2, 4, 1, 3, 5, 2],
    pulse: [0, 2, 6, 8, 12, 14],
    bpm: [80, 138],
    instrument: "celesta",
    companion: "harp",
    octave: 12,
    bed: [262, 0.24, 0.048],
  },
  // 3. Glowmarsh: Whimsical bog village bounce — G Mixolydian wooden marimba, breathy ocarina reed & log-drum
  marsh: {
    id: "marsh",
    roots: [43, 48, 45, 50],
    mode: [0, 2, 4, 7, 9, 10],
    line: [0, 2, 3, 1, 4, 3, 2, 5],
    counter: [3, 4, 2, 0, 5, 4, 3, 1],
    pulse: [0, 3, 6, 8, 11, 14],
    bpm: [94, 126],
    instrument: "marimba",
    companion: "reed",
    octave: 12,
    bed: [196, 0.2, 0.075],
  },
  // 4. Shattered Core: Velvet astral observatory — compound/waltz E Aeolian add9 harp & celesta ostinato, fifths & choir swells
  core: {
    id: "core",
    roots: [52, 48, 55, 50],
    mode: [0, 2, 3, 7, 9, 10],
    line: [3, 1, 4, 0, 2, 5, 3, 1],
    counter: [0, 4, 2, 5, 3, 1, 4, 2],
    pulse: [0, 3, 6, 9, 12, 14],
    bpm: [84, 144],
    instrument: "harp",
    companion: "celesta",
    octave: 12,
    bed: [330, 0.26, 0.088],
  },
  // 5. Ashfall Caldera: Cozy dwarven forge-hearth — noble A Dorian French horn, warm marimba drive, frame-drum & bronze anvil chime
  caldera: {
    id: "caldera",
    roots: [45, 48, 43, 50],
    mode: [0, 2, 3, 5, 7, 9],
    line: [0, 3, 4, 2, 5, 4, 3, 1],
    counter: [4, 2, 0, 3, 4, 5, 2, 0],
    pulse: [0, 4, 7, 10, 14],
    bpm: [88, 130],
    instrument: "brass",
    companion: "marimba",
    octave: 12,
    bed: [147, 0.16, 0.058],
  },
  // 6. Glass Flats: Sunlit desert oasis — breezy E Major add9 plucked acoustic harp/lute, airy reed flute & sand-brush pulse
  flats: {
    id: "flats",
    roots: [52, 56, 49, 54],
    mode: [0, 2, 4, 7, 9, 11],
    line: [0, 2, 3, 4, 2, 1, 3, 5],
    counter: [4, 3, 5, 2, 4, 1, 2, 0],
    pulse: [0, 3, 6, 9, 12, 14],
    bpm: [98, 140],
    instrument: "harp",
    companion: "reed",
    octave: 12,
    bed: [247, 0.22, 0.082],
  },
};

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const themeFor = (biome) => THEMES[biome] || THEMES.courtyard;

export const scoreBiomes = Object.keys(THEMES);
export const scoreOrigin = (biome) => freq(themeFor(biome).roots[0]);

/** Returns a MIDI note quantized to the active biome's root and modal scale for musical reward & prop chimes. */
export function scoreScaleMidi(biome, degree = 0, octaveLift = 24) {
  const theme = themeFor(biome);
  const mode = theme.mode;
  const len = mode.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return theme.roots[0] + octaveLift + oct * 12 + mode[idx];
}

export function musicTrack(kind, biome) {
  const boss = kind === "boss";
  return { bpm: themeFor(biome).bpm[boss ? 1 : 0], bars: boss ? 20 : 16, gain: boss ? 1.06 : 1 };
}

export function playScore(engine, kind, biome, step, at) {
  const menu = kind === "menu";
  const boss = kind === "boss";
  const theme = menu ? MENU_THEME : themeFor(biome);
  const id = theme.id;
  const bar = step >> 4;
  const beat = step % 16;
  const section = bar >> 2;
  const root = theme.roots[(boss ? bar + section : (bar >> 1) + (section & 1)) % 4];
  const note = (degree) => root + theme.mode[((degree % 6) + 6) % 6];
  const seconds = 240 / (menu ? 82 : musicTrack(kind, biome).bpm);
  const rawEnergy = boss ? 1 + engine.heat * 0.1 : engine.intensity;
  // Smooth arrangement evolution: gentler opening on bar 0 when calm, blooming as combat heats up
  const energy = !boss && !menu && bar === 0 ? rawEnergy * 0.72 : rawEnergy;
  const active = boss || (!menu && energy > 0.26);
  const hot = boss || (!menu && energy > 0.56);
  const phrase = theme.line;
  const counter = theme.counter || phrase;
  const tone = (midi, dur, wave, vol, opts = {}) =>
    engine.tone(freq(midi), dur, wave, vol, { at, dest: engine.mus, ...opts });

  // 1. Harmonic Foundation & Bass Movement (distinct per biome!)
  if (id === "courtyard" && !menu) {
    // Courtyard: Walking pizzicato/bowed cello bassline + warm ceramic Rhodes 9th chords
    if (beat === 0 || (active && beat === 8) || (hot && (beat === 4 || beat === 12))) {
      const walkDeg = beat === 0 ? 0 : beat === 8 ? 4 : beat === 4 ? 2 : 5;
      const dur = beat === 0 || beat === 8 ? Math.min(0.85, seconds * 0.46) : 0.26;
      tone(note(walkDeg) - 12, dur, beat % 8 === 0 ? "bow" : "harp", boss ? 0.082 : 0.054, {
        attack: beat % 8 === 0 ? 0.035 : 0.01,
        lp: 680,
        dest: engine.pump,
      });
    }
    if (beat === 2 || beat === 10) {
      const rhodesDeg = beat === 2 ? (section + 2) % 6 : (section + 4) % 6;
      tone(note(rhodesDeg) + 12, 0.42, "ceramic", boss ? 0.034 : 0.028, {
        attack: 0.014,
        lp: 1850,
        pan: beat === 2 ? -0.26 : 0.26,
        rev: 0.16,
        dest: engine.pump,
      });
    }
  } else if (id === "shelf") {
    // Shelf: Warm swelling alpine strings + high shimmering glass harmonics
    if (beat === 0 || (boss && beat === 8)) {
      const long = Math.min(1.08, seconds * (boss ? 0.68 : 0.96));
      tone(root - 12, long, "bow", boss ? 0.092 : 0.058, {
        attack: 0.065,
        hold: long * 0.32,
        lp: 620,
        dest: engine.pump,
      });
      tone(note(4) + 12, long * 0.9, "bow", boss ? 0.03 : 0.024, {
        attack: long * 0.3,
        hold: long * 0.25,
        lp: 1650,
        pan: section % 2 ? 0.3 : -0.3,
        rev: 0.16,
        dest: engine.pump,
      });
    }
    if (beat === 6 && (section % 2 === 0 || active)) {
      tone(note(3) + 24, 0.52, "sine", 0.022, {
        attack: 0.08,
        hold: 0.14,
        pan: bar % 2 ? -0.34 : 0.34,
        rev: 0.22,
        dest: engine.delay,
      });
    }
  } else if (id === "marsh") {
    // Marsh: Bouncy woody root-fifth bass & playful bog village rhythm
    if (beat === 0 || beat === 6 || (active && beat === 12)) {
      const bassDeg = beat === 0 ? 0 : beat === 6 ? 3 : 4;
      tone(note(bassDeg) - 12, 0.34, "marimba", boss ? 0.086 : 0.058, {
        attack: 0.01,
        lp: 640,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 7 || beat === 13)) {
      const reedNote = note(counter[(bar + beat) % counter.length]) + 12;
      tone(reedNote, 0.32, "reed", 0.03, {
        attack: 0.026,
        lp: 2200,
        pan: beat === 7 ? 0.3 : -0.3,
        rev: 0.15,
        dest: engine.delay,
      });
    }
  } else if (id === "core") {
    // Core: Deep resonant astral fifths + ethereal choir/pad swell on beat 4
    if (beat === 0 || (boss && beat === 8)) {
      const long = Math.min(1.08, seconds * (boss ? 0.68 : 0.96));
      tone(root - 12, long, "bow", boss ? 0.095 : 0.06, {
        attack: 0.055,
        hold: long * 0.32,
        lp: 580,
        dest: engine.pump,
      });
      tone(note(3), long * 0.92, "sine", 0.028, {
        attack: long * 0.26,
        hold: long * 0.3,
        pan: section % 2 ? -0.34 : 0.34,
        dest: engine.pump,
      });
    }
    if (beat === 4 && (bar % 2 === 0 || boss)) {
      tone(note((section + 2) % 6) + 12, Math.min(0.95, seconds * 0.62), "bow", boss ? 0.032 : 0.026, {
        attack: 0.14,
        hold: 0.2,
        lp: 1550,
        pan: bar % 2 ? 0.28 : -0.28,
        rev: 0.2,
        dest: engine.choir || engine.pump,
      });
    }
  } else if (id === "caldera") {
    // Caldera: Warm dwarven hearth drone + felted frame-drum + distant bronze anvil chime
    if (beat === 0 || (boss && beat === 8)) {
      const long = Math.min(1.02, seconds * (boss ? 0.66 : 0.92));
      tone(root - 12, long, "bow", boss ? 0.096 : 0.062, {
        attack: 0.048,
        hold: long * 0.28,
        lp: 560,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 0 || beat === 10)) {
      engine.tone(94, 0.22, "sine", 0.075 * (0.6 + energy * 0.4), { at, to: 52, dest: engine.mus });
    }
    if (beat === 12 && (bar % 2 === 1 || boss)) {
      // Soft distant bronze anvil-chime fifth
      tone(note(4) + 24, 0.28, "ceramic", boss ? 0.03 : 0.022, {
        attack: 0.005,
        lp: 3400,
        pan: 0.34,
        rev: 0.22,
        dest: engine.delay,
      });
    }
  } else if (id === "flats") {
    // Flats: Sunlit oasis acoustic lute/harp bass + airy desert reed flute phrases
    if (beat === 0 || beat === 6 || (active && beat === 10)) {
      const luteDeg = beat === 0 ? 0 : beat === 6 ? 3 : 4;
      tone(note(luteDeg) - 12, 0.36, "harp", boss ? 0.084 : 0.056, {
        attack: 0.01,
        lp: 920,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 5 || beat === 13) && bar % 2 === 0) {
      tone(note(counter[(section + beat) % counter.length]) + 12, 0.36, "reed", 0.03, {
        attack: 0.028,
        lp: 2450,
        pan: beat === 5 ? -0.28 : 0.28,
        rev: 0.16,
        dest: engine.delay,
      });
    }
  } else {
    // Menu sanctuary hearth foundation
    if (beat === 0) {
      const long = Math.min(1.05, seconds * 0.96);
      tone(root - 12, long, "bow", 0.058, { attack: 0.055, hold: long * 0.3, lp: 580, dest: engine.pump });
      tone(note(4), long * 0.92, "sine", 0.025, {
        attack: long * 0.26,
        hold: long * 0.3,
        pan: 0.32,
        dest: engine.pump,
      });
    }
    if (beat === 8) {
      tone(note((section + bar) % 5) + (section >= 2 ? 12 : 0), 0.36, "harp", 0.025, {
        attack: 0.012,
        lp: 2200,
        pan: bar % 2 ? -0.24 : 0.24,
        rev: 0.14,
        dest: engine.pump,
      });
    }
  }

  // 2. Main Biome Melodic Motif & Arpeggio / Counter-Harmony
  const strike = theme.pulse.indexOf(beat);
  const calmGate = !menu && !boss && !active && strike % 2 === 1 && id === "shelf";
  if (strike >= 0 && (!menu || strike < 4) && !calmGate) {
    const index = (strike + bar * 2 + section) % phrase.length;
    const regLift = !menu && section === 2 && strike % 2 === 0 ? 12 : 0;
    const midi = note(phrase[index]) + theme.octave + regLift;
    const pan = strike % 2 ? 0.44 : -0.44;
    const softLead = theme.instrument === "brass" || theme.instrument === "reed";
    tone(midi, 0.4 + seconds * 0.08, theme.instrument, boss ? 0.076 : menu ? 0.042 : 0.048, {
      attack: softLead ? 0.026 : 0.008,
      pan,
      rev: 0.17,
      lp: softLead ? 2400 : 3800,
      dest: engine.delay,
    });
    if (boss || (!menu && energy > 0.4 && engine.bloom !== false)) {
      const cNote = note(counter[(index + 2) % counter.length]) + theme.octave + (strike % 2 ? 0 : 12);
      tone(cNote, 0.3, theme.companion, boss ? 0.034 : 0.021, {
        attack: 0.01,
        pan: -pan * 0.82,
        at: at + 0.052,
        lp: 3600,
        dest: engine.delay,
        rev: 0.14,
      });
    }
  }

  // 3. Per-Biome Tactile Groove Percussion & Multi-Phase Boss Escalation
  if (boss) {
    if (beat === 0 || beat === 6 || beat === 10 || (section !== 3 && beat === 13)) {
      const f = 92 + (theme.roots[0] % 5) * 4;
      engine.tone(f, 0.28, "sine", 0.26, { at, to: f * 0.54, dest: engine.mus });
      engine.noise(0.12, 0.09, { at, f: 420, to: 135, q: 1.0, color: "pink", dest: engine.mus });
    }
    if (beat === 4 || beat === 12 || (engine.heat >= 1 && beat === 15)) {
      const accentWave =
        id === "marsh" || id === "flats" ? "reed" : id === "shelf" || id === "core" ? "celesta" : "brass";
      tone(note((section + 4) % 6) + 12, 0.27, accentWave, 0.095, {
        attack: accentWave === "celesta" ? 0.008 : 0.018,
        lp: accentWave === "celesta" ? 3600 : 2400,
        pan: beat < 10 ? -0.25 : 0.25,
        rev: 0.13,
        dest: id === "shelf" ? engine.delay : engine.mus,
      });
      engine.noise(0.1, 0.07 * energy, { at, f: 2200, type: "bandpass", q: 1.1, color: "pink", dest: engine.mus });
    }
    if (beat % 2 === 1 && (section !== 3 || engine.heat >= 2)) {
      const ostWave = id === "core" || id === "flats" ? "harp" : "marimba";
      tone(note(phrase[(beat + section) % phrase.length]), 0.16, ostWave, 0.058, {
        dest: engine.pump,
        lp: 1850,
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
      tone(note(phrase[beat >> 1]) + 24, 0.26, "celesta", 0.034, {
        attack: 0.008,
        lp: 4200,
        dest: engine.delay,
        rev: 0.16,
      });
    }
  } else if (!menu && active) {
    if (id === "courtyard" && (beat === 4 || beat === 12)) {
      // Soft brushed snare / rain-courtyard brush
      engine.noise(0.09, 0.026 * (0.7 + energy * 0.6), {
        at,
        f: 2650,
        type: "bandpass",
        q: 1.3,
        color: "pink",
        dest: engine.mus,
      });
    } else if (id === "marsh" && (beat === 4 || beat === 10 || (hot && beat === 14))) {
      // Wooden log-drum / shaker tap
      tone(note((bar + beat) % 5), 0.16, "kalimba", 0.024 * (1 + energy * 0.7), {
        attack: 0.006,
        lp: 1450,
        pan: beat === 4 ? -0.2 : 0.2,
      });
    } else if (id === "flats" && (beat === 2 || beat === 6 || beat === 10 || beat === 14)) {
      // Breezy sand-brush pulse
      engine.noise(0.075, 0.02 * (0.6 + energy * 0.7), {
        at,
        f: 3300,
        type: "bandpass",
        q: 1.5,
        color: "pink",
        dest: engine.mus,
      });
    } else if ((id === "caldera" || id === "shelf" || id === "core") && (beat === 4 || beat === 12)) {
      const pulseWave = id === "core" ? "harp" : "marimba";
      tone(note((bar + (beat >> 2)) % 5), 0.21, pulseWave, 0.024 * (1 + energy * 0.8), {
        attack: 0.008,
        lp: 1650,
        pan: beat === 4 ? -0.18 : 0.18,
      });
    }
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
