// Handcrafted Cozy Diorama & Biome-Adventure Original Score (v5.0):
// Six unmistakable per-biome musical arrangements, grooves, counter-melodies & modal scale helpers.

const MENU_THEME = {
  id: "menu",
  roots: [50, 54, 47, 52], // Warm D Lydian / Maj9 sanctuary hearth progression
  bridgeRoots: [55, 54, 52, 50],
  mode: [0, 2, 4, 6, 7, 9],
  line: [0, 2, 4, 5, 4, 2, 3, 1],
  counter: [4, 5, 2, 3, 1, 2, 4, 0],
  bridgeLine: [5, 4, 2, 3, 4, 2, 1, 0],
  pulse: [0, 3, 6, 10, 13],
  bpm: [84, 128],
  bars: 16,
  instrument: "harp",
  companion: "celesta",
  octave: 12,
  bed: [220, 0.18, 0.055],
};

const THEMES = {
  // 1. Lantern Yard: Rainy twilight courtyard groove — 88 BPM D Dorian kalimba, warm ceramic Rhodes, walking cello
  lanternYard: {
    id: "lanternYard",
    roots: [50, 53, 48, 45],
    bridgeRoots: [55, 53, 52, 45],
    mode: [0, 2, 3, 5, 7, 9],
    line: [2, 4, 0, 3, 5, 4, 2, 1],
    counter: [4, 2, 5, 3, 1, 0, 3, 4],
    bridgeLine: [5, 4, 3, 2, 4, 5, 3, 0],
    pulse: [0, 3, 6, 10, 13],
    counterPulse: [4, 12, 14],
    bpm: [88, 132],
    instrument: "kalimba",
    companion: "ceramic",
    octave: 12,
    bed: [196, 0.18, 0.065],
  },
  // 2. Snow Ridge: Sparkling alpine wonder — 78 BPM F Lydian celesta & harp arpeggios, shimmering glass harmonics
  snowRidge: {
    id: "snowRidge",
    roots: [53, 57, 50, 55],
    bridgeRoots: [58, 55, 57, 53],
    mode: [0, 2, 4, 6, 7, 9],
    line: [0, 2, 4, 5, 3, 4, 2, 1],
    counter: [4, 5, 2, 4, 1, 3, 5, 2],
    bridgeLine: [3, 5, 4, 2, 5, 3, 1, 0],
    pulse: [0, 2, 6, 8, 12, 14],
    counterPulse: [4, 10, 15],
    bpm: [78, 138],
    instrument: "celesta",
    companion: "harp",
    octave: 12,
    bed: [262, 0.24, 0.048],
  },
  // 3. Moss Bog: Whimsical bog village bounce — 93 BPM G Mixolydian wooden marimba, breathy ocarina reed & log-drum
  mossBog: {
    id: "mossBog",
    roots: [43, 48, 45, 50],
    bridgeRoots: [48, 50, 45, 43],
    mode: [0, 2, 4, 7, 9, 10],
    line: [0, 2, 3, 1, 4, 3, 2, 5],
    counter: [3, 4, 2, 0, 5, 4, 3, 1],
    bridgeLine: [4, 5, 3, 2, 4, 1, 3, 0],
    pulse: [0, 3, 6, 8, 11, 14],
    counterPulse: [5, 10, 15],
    bpm: [93, 126],
    instrument: "marimba",
    companion: "reed",
    octave: 12,
    bed: [196, 0.2, 0.075],
  },
  // 4. Star Hall (core): Velvet astral observatory — 83 BPM E Aeolian add9 harp & celesta ostinato, fifths & choir swells
  starHall: {
    id: "starHall",
    roots: [52, 48, 55, 50],
    bridgeRoots: [48, 50, 55, 54],
    mode: [0, 2, 3, 7, 9, 10],
    line: [3, 1, 4, 0, 2, 5, 3, 1],
    counter: [0, 4, 2, 5, 3, 1, 4, 2],
    bridgeLine: [5, 3, 4, 2, 1, 3, 4, 0],
    pulse: [0, 3, 6, 9, 12, 14],
    counterPulse: [2, 8, 15],
    bpm: [83, 144],
    instrument: "harp",
    companion: "celesta",
    octave: 12,
    bed: [330, 0.26, 0.088],
  },
  // 5. Ember Hill: Dwarven forge-hearth — 98 BPM A Phrygian Dominant (Hijaz) French horn, warm marimba & anvil chime
  emberHill: {
    id: "emberHill",
    roots: [45, 46, 43, 45],
    bridgeRoots: [50, 48, 46, 45],
    mode: [0, 1, 4, 5, 7, 8],
    line: [0, 2, 4, 3, 5, 4, 2, 1],
    counter: [4, 3, 1, 2, 4, 5, 2, 0],
    bridgeLine: [5, 4, 2, 3, 1, 2, 1, 0],
    pulse: [0, 4, 7, 10, 14],
    counterPulse: [2, 9, 12],
    bpm: [98, 130],
    instrument: "brass",
    companion: "marimba",
    octave: 12,
    bed: [147, 0.16, 0.058],
  },
  // 6. Sun Dunes: Sunlit desert oasis — 104 BPM E Major add9 plucked acoustic harp/lute, airy reed flute & sand-brush pulse
  sunDunes: {
    id: "sunDunes",
    roots: [52, 56, 49, 54],
    bridgeRoots: [57, 54, 56, 52],
    mode: [0, 2, 4, 7, 9, 11],
    line: [0, 2, 3, 4, 2, 1, 3, 5],
    counter: [4, 3, 5, 2, 4, 1, 2, 0],
    bridgeLine: [5, 4, 2, 3, 5, 3, 1, 0],
    pulse: [0, 3, 6, 9, 12, 14],
    counterPulse: [4, 11, 15],
    bpm: [104, 140],
    instrument: "harp",
    companion: "reed",
    octave: 12,
    bed: [247, 0.22, 0.082],
  },
};

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const themeFor = (biome) => (biome === "menu" ? MENU_THEME : THEMES[biome] || THEMES.lanternYard);

export const scoreBiomes = Object.keys(THEMES);
export const scoreOrigin = (biome) => freq(themeFor(biome).roots[0]);

// Measured at the default music level with the complete score and atmospheres.
const fightGain = { lanternYard: 2.04, snowRidge: 1.7, mossBog: 2.55, starHall: 1.7, emberHill: 1.7, sunDunes: 2.55 };
const bossGain = { lanternYard: 0.5, snowRidge: 0.35, mossBog: 0.63, starHall: 0.33, emberHill: 0.37, sunDunes: 0.71 };

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
  if (kind === "menu") return { bpm: MENU_THEME.bpm[0], bars: MENU_THEME.bars, gain: 1 };
  const boss = kind === "boss";
  const theme = themeFor(biome);
  const jumpStep = boss && theme.id === "lanternYard" ? 6 : boss && theme.id === "starHall" ? 12 : 16;
  // The 384-step boss loop aligns with all three meters.
  return {
    bpm: theme.bpm[boss ? 1 : 0],
    bars: boss ? 24 : 16,
    gain: (boss ? bossGain : fightGain)[theme.id],
    jumpStep,
  };
}

export function playScore(engine, kind, biome, step, at) {
  const menu = kind === "menu";
  const boss = kind === "boss";
  const theme = menu ? MENU_THEME : themeFor(biome);
  const id = theme.id;
  const bar = step >> 4;
  const beat = step % 16;
  // Section structure: 4 equal sections (4 bars each in fight/menu, 6 bars each in 24-bar boss tracks)
  const section = boss ? Math.floor(bar / 6) % 4 : (bar >> 2) % 4;
  const barInSec = boss ? bar % 6 : bar % 4;
  const isSectionA = !boss && !menu && section === 0;
  const isSectionB = !boss && !menu && section === 2;
  const isSectionC = section === 3;
  const activeRoots = isSectionC && theme.bridgeRoots ? theme.bridgeRoots : theme.roots;
  const root = activeRoots[(boss ? bar : (bar >> 1) + (section & 1)) % activeRoots.length];
  engine.activeRoot = root;
  const note = (degree) => root + theme.mode[((degree % 6) + 6) % 6];
  const seconds = 240 / theme.bpm[boss ? 1 : 0];
  const rawEnergy = boss ? 1 + engine.heat * 0.1 : engine.intensity;
  const energy = !boss && !menu && bar === 0 ? rawEnergy * 0.72 : rawEnergy;
  const active = boss || (!menu && energy > 0.26);
  const hot = boss || (!menu && energy > 0.56);
  const phrase = isSectionC && theme.bridgeLine ? theme.bridgeLine : theme.line;
  const counter = theme.counter || phrase;
  const tone = (midi, dur, wave, vol, opts = {}) =>
    engine.tone(freq(midi), dur, wave, vol, { at, dest: engine.mus, ...opts });

  // 1. Harmonic Foundation & Bass Movement (distinct per biome!)
  if (id === "lanternYard" && !menu) {
    // Courtyard: Walking pizzicato/bowed cello bassline + warm ceramic Rhodes 9th chords
    if (beat === 0 || (active && beat === 8) || (hot && !isSectionA && (beat === 4 || beat === 12))) {
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
        pan: beat === 2 ? -0.18 : 0.18,
        rev: 0.16,
        dest: engine.pump,
      });
    }
  } else if (id === "snowRidge") {
    // Shelf: Warm swelling alpine strings + high shimmering glass harmonics
    if (beat === 0 || (boss && beat === 8)) {
      const long = Math.min(1.08, seconds * (boss ? 0.68 : 0.96));
      tone(root - 12, long, "bow", boss ? 0.092 : 0.058, {
        attack: 0.065,
        hold: long * 0.32,
        lp: 620,
        dest: engine.pump,
      });
      tone(note(isSectionC ? 3 : 4) + 12, long * 0.9, "bow", boss ? 0.03 : 0.024, {
        attack: long * 0.3,
        hold: long * 0.25,
        lp: 1650,
        pan: section % 2 ? 0.22 : -0.22,
        rev: 0.16,
        dest: engine.pump,
      });
    }
    if (beat === 6 && (section % 2 === 0 || active)) {
      tone(note(3) + 24, 0.52, "sine", 0.022, {
        attack: 0.08,
        hold: 0.14,
        pan: bar % 2 ? -0.26 : 0.26,
        rev: 0.22,
        dest: engine.delay,
      });
    }
  } else if (id === "mossBog") {
    // Marsh: Bouncy woody root-fifth bass & playful bog village rhythm
    if (beat === 0 || beat === 6 || (active && !isSectionA && beat === 12)) {
      const bassDeg = beat === 0 ? 0 : beat === 6 ? 3 : 4;
      tone(note(bassDeg) - 12, 0.34, "marimba", boss ? 0.086 : 0.058, {
        attack: 0.01,
        lp: 640,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 7 || (beat === 13 && !isSectionA))) {
      const reedNote = note(counter[(bar + beat) % counter.length]) + 12;
      tone(reedNote, 0.32, "reed", 0.03, {
        attack: 0.026,
        lp: 2200,
        pan: beat === 7 ? 0.22 : -0.22,
        rev: 0.15,
        dest: engine.delay,
      });
    }
  } else if (id === "starHall") {
    // Star Hall (core): Deep resonant astral fifths + ethereal choir/pad swell on beat 4
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
        pan: section % 2 ? -0.24 : 0.24,
        dest: engine.pump,
      });
    }
    if (beat === 4 && (bar % 2 === 0 || boss || isSectionC)) {
      tone(note((section + 2) % 6) + 12, Math.min(0.95, seconds * 0.62), "bow", boss ? 0.032 : 0.026, {
        attack: 0.14,
        hold: 0.2,
        lp: 1550,
        q: 1.4,
        pan: bar % 2 ? 0.22 : -0.22,
        rev: 0.28,
        dest: engine.pump,
      });
    }
  } else if (id === "emberHill") {
    // Caldera: Dwarven forge-hearth Phrygian drone + felted frame-drum + distant bronze anvil chime
    if (beat === 0 || (boss && beat === 8)) {
      const long = Math.min(1.02, seconds * (boss ? 0.66 : 0.92));
      tone(root - 12, long, "bow", boss ? 0.096 : 0.062, {
        attack: 0.048,
        hold: long * 0.28,
        lp: 560,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 0 || (!isSectionA && beat === 10))) {
      engine.tone(94, 0.22, "sine", 0.075 * (0.6 + energy * 0.4), { at, to: 52, dest: engine.mus });
    }
    if (beat === 12 && (bar % 2 === 1 || boss || isSectionC)) {
      tone(note(4) + 24, 0.28, "ceramic", boss ? 0.03 : 0.022, {
        attack: 0.005,
        lp: 3400,
        pan: 0.24,
        rev: 0.22,
        dest: engine.delay,
      });
    }
  } else if (id === "sunDunes") {
    // Flats: Sunlit oasis acoustic lute/harp bass + airy desert reed flute phrases
    if (beat === 0 || beat === 6 || (active && !isSectionA && beat === 10)) {
      const luteDeg = beat === 0 ? 0 : beat === 6 ? 3 : 4;
      tone(note(luteDeg) - 12, 0.36, "harp", boss ? 0.084 : 0.075, {
        attack: 0.01,
        lp: 920,
        dest: engine.pump,
      });
    }
    if (!boss && active && (beat === 5 || beat === 13) && (bar % 2 === 0 || isSectionB)) {
      tone(note(counter[(section + beat) % counter.length]) + 12, 0.36, "reed", 0.03, {
        attack: 0.028,
        lp: 2450,
        pan: beat === 5 ? -0.22 : 0.22,
        rev: 0.16,
        dest: engine.delay,
      });
    }
  } else {
    // Menu sanctuary 16-bar hearth foundation
    if (beat === 0) {
      const long = Math.min(1.05, seconds * 0.96);
      tone(root - 12, long, "bow", 0.058, { attack: 0.055, hold: long * 0.3, lp: 580, dest: engine.pump });
      tone(note(isSectionC ? 3 : 4), long * 0.92, "sine", 0.025, {
        attack: long * 0.26,
        hold: long * 0.3,
        pan: section % 2 ? -0.26 : 0.26,
        dest: engine.pump,
      });
    }
    if (beat === 8) {
      tone(note((section + bar) % 5) + (section >= 2 ? 12 : 0), 0.36, "harp", 0.025, {
        attack: 0.012,
        lp: 2200,
        pan: bar % 2 ? -0.22 : 0.22,
        rev: 0.14,
        dest: engine.pump,
      });
    }
  }

  // 2. Main Biome Melodic Motif with authored phrase-end breaths & true off-beat counter-melody
  const strike = theme.pulse.indexOf(beat);
  // Let phrase endings breathe on the final bar of Section A/B so melodies feel phrased rather than mechanical
  const phraseRest = !boss && barInSec === 3 && strike === theme.pulse.length - 1;
  const sparseA = isSectionA && strike === 2 && !active;
  if (strike >= 0 && (!menu || strike < 4) && !sparseA && !phraseRest) {
    const index = (strike + bar * 2 + section) % phrase.length;
    const regLift = !menu && (isSectionB || isSectionC) && strike % 2 === 0 ? 12 : 0;
    const midi = note(phrase[index]) + theme.octave + regLift;
    // Gentle phrase-centered stereo placement (no harsh L/R ping-pong)
    const leadPan = (section & 1 ? 1 : -1) * 0.14 + ((strike % 3) - 1) * 0.05;
    const softLead = theme.instrument === "brass" || theme.instrument === "reed";
    tone(midi, 0.38 + seconds * 0.08, theme.instrument, boss ? 0.074 : menu ? 0.042 : 0.048, {
      attack: softLead ? 0.026 : 0.008,
      pan: leadPan,
      rev: 0.17,
      lp: softLead ? 2400 : 3800,
      dest: engine.delay,
    });
  }

  // True complementary off-beat counter-melody & stereo bloom voice (no 52ms slapback)
  const cPulse = theme.counterPulse || [4, 11, 15];
  const cStrike = cPulse.indexOf(beat);
  const allowBloom = engine.bloom !== false;
  if (
    cStrike >= 0 &&
    allowBloom &&
    (boss
      ? cStrike < 2 || engine.heat >= 1
      : !menu
        ? !isSectionA || cStrike === 0 || barInSec >= 2
        : section >= 1 && cStrike === 0)
  ) {
    const cIdx = (cStrike + bar + section * 2) % counter.length;
    const cOct = isSectionB || isSectionC || (boss && cStrike === 1) ? 24 : 12;
    const cPan = (cStrike % 2 === 0 ? 1 : -1) * (bar % 2 === 0 ? 0.56 : -0.56);
    const cVol = boss ? 0.034 : isSectionB ? 0.032 : isSectionC ? 0.028 : 0.025;
    tone(note(counter[cIdx]) + cOct, 0.34, theme.companion, cVol, {
      attack: 0.012,
      pan: cPan,
      lp: 3500,
      rev: 0.18,
      dest: engine.delay,
      bloom: true,
    });
  }

  // Section C modal bridge turnaround flourish at end of 16-bar phrase
  if (!menu && !boss && isSectionC && barInSec === 3 && (beat === 10 || beat === 12 || beat === 14)) {
    const turnDeg = beat === 10 ? 4 : beat === 12 ? 2 : 1;
    tone(note(turnDeg) + 24, 0.28, theme.companion, 0.028, {
      attack: 0.01,
      pan: beat === 12 ? 0 : beat === 10 ? -0.26 : 0.26,
      lp: 3400,
      rev: 0.2,
      dest: engine.delay,
    });
  }

  // 3. Six Distinct Guardian Boss Grooves (24-bar seamless meters) & Per-Biome Combat Percussion
  if (boss) {
    const kick = (f, vol = 0.25, dur = 0.26) => {
      engine.tone(f, dur, "sine", vol, { at, to: f * 0.52, dest: engine.mus });
      engine.noise(0.1, vol * 0.34, { at, f: 420, to: 140, q: 1.0, color: "pink", dest: engine.mus });
      engine.pumpDip?.(at, 0.26);
    };
    if (id === "lanternYard") {
      // Bellkeeper: 6/8 carillon toll (tripled-feel bell swings & bronze fifths, seamless across 384 steps)
      const tollBeat = step % 6;
      if (tollBeat === 0) {
        kick(94, 0.25, 0.28);
        tone(note(0) + 12, 0.38, "brass", 0.078, { attack: 0.014, lp: 2400, pan: -0.22, rev: 0.18 });
      } else if (tollBeat === 3) {
        tone(note(4) + 24, 0.34, "ceramic", 0.062, {
          attack: 0.008,
          lp: 3600,
          pan: 0.24,
          rev: 0.22,
          dest: engine.delay,
        });
        engine.noise(0.08, 0.055 * energy, { at, f: 2400, type: "bandpass", q: 1.2, color: "pink", dest: engine.mus });
      } else if (engine.heat >= 1 && (tollBeat === 2 || tollBeat === 5)) {
        tone(note(phrase[step % phrase.length]) + 12, 0.18, "kalimba", 0.044, {
          lp: 2600,
          pan: tollBeat === 2 ? -0.28 : 0.28,
          dest: engine.pump,
        });
      }
    } else if (id === "snowRidge") {
      // Frost Prism: shimmering 16th glass arpeggios + crisp crystalline rim accents
      const arpNote = note(phrase[(step + section) % phrase.length]) + (beat % 4 === 0 ? 24 : 12);
      tone(arpNote, 0.16, "celesta", 0.048 + (beat % 4 === 0 ? 0.02 : 0), {
        attack: 0.005,
        lp: 4600,
        pan: ((beat % 8) - 3.5) * 0.1,
        rev: 0.16,
        dest: engine.delay,
      });
      if (beat === 0 || beat === 8 || (engine.heat >= 1 && beat === 12)) kick(102, 0.22, 0.22);
      if (beat === 4 || beat === 12) {
        engine.noise(0.09, 0.065 * energy, { at, f: 3800, type: "bandpass", q: 1.6, color: "pink", dest: engine.mus });
      }
    } else if (id === "mossBog") {
      // Brood-Empress: syncopated log-drum bog polyrhythm + breathy reed turns
      if (beat === 0 || beat === 5 || beat === 10) kick(86, 0.26, 0.25);
      if (beat === 3 || beat === 8 || beat === 14 || (engine.heat >= 1 && beat === 11)) {
        const logDeg = beat === 3 ? 2 : beat === 8 ? 4 : beat === 14 ? 1 : 3;
        tone(note(logDeg), 0.17, "marimba", 0.072, {
          attack: 0.006,
          lp: 1550,
          pan: beat % 2 ? -0.24 : 0.24,
          dest: engine.pump,
        });
      }
      if (beat === 6 || beat === 13) {
        tone(note((section + 4) % 6) + 12, 0.3, "reed", 0.068, {
          attack: 0.02,
          lp: 2300,
          pan: beat === 6 ? 0.26 : -0.26,
          rev: 0.16,
        });
      }
    } else if (id === "starHall") {
      // Star Heart: 3/4 astral waltz (12-step waltz cycle, seamless across 384 steps!)
      const waltz = step % 12;
      if (waltz === 0) {
        kick(88, 0.25, 0.3);
        tone(root, 0.42, "bow", 0.064, { attack: 0.03, lp: 1200, dest: engine.pump });
      } else if (waltz === 4 || waltz === 8) {
        tone(note(waltz === 4 ? 2 : 4) + 12, 0.3, "harp", 0.066, {
          attack: 0.008,
          lp: 3200,
          pan: waltz === 4 ? -0.28 : 0.28,
          rev: 0.22,
          dest: engine.delay,
        });
        if (engine.heat >= 1) {
          tone(note(waltz === 4 ? 4 : 5) + 24, 0.26, "celesta", 0.04, {
            attack: 0.008,
            lp: 4200,
            pan: waltz === 4 ? 0.24 : -0.24,
            rev: 0.2,
            dest: engine.delay,
          });
        }
      } else if (waltz % 2 === 0 && engine.heat >= 1) {
        tone(note(phrase[step % phrase.length]) + 12, 0.16, "harp", 0.042, { lp: 2400, dest: engine.pump });
      }
    } else if (id === "emberHill") {
      // Ash Tyrant: half-time forge-anvil stomp (crushing sub on 0, heavy bronze anvil smash on 8 & 14)
      if (beat === 0 || (engine.heat >= 1 && beat === 10)) kick(76, 0.3, 0.32);
      if (beat === 8 || beat === 14) {
        tone(note(0) + 12, 0.32, "brass", 0.095, {
          attack: 0.012,
          lp: 2200,
          pan: beat === 8 ? -0.18 : 0.18,
          rev: 0.16,
        });
        tone(note(4) + 24, 0.26, "ceramic", 0.056, {
          attack: 0.004,
          lp: 3800,
          pan: beat === 8 ? 0.22 : -0.22,
          rev: 0.2,
          dest: engine.delay,
        });
        engine.noise(0.12, 0.085 * energy, { at, f: 1900, type: "bandpass", q: 1.0, color: "pink", dest: engine.mus });
      }
      if (beat % 4 === 2 && (section !== 3 || engine.heat >= 1)) {
        tone(note(phrase[(beat >> 1) % phrase.length]), 0.18, "marimba", 0.06, { lp: 1650, dest: engine.pump });
      }
    } else {
      // Glasswyrm (flats): 3+3+2 desert darbuka pulse + sinuous reed turns + heat >= 1 desert harp escalation
      if (beat === 0 || beat === 6 || beat === 8) kick(96, 0.24, 0.22);
      if (beat === 3 || beat === 11 || beat === 14) {
        tone(note(beat === 3 ? 2 : 4), 0.14, "kalimba", 0.066, {
          attack: 0.005,
          lp: 2600,
          pan: beat === 3 ? -0.24 : 0.24,
          dest: engine.pump,
        });
        engine.noise(0.07, 0.06 * energy, { at, f: 3100, type: "bandpass", q: 1.5, color: "pink", dest: engine.mus });
      }
      if (beat === 4 || beat === 12) {
        tone(note((section + (beat === 4 ? 3 : 5)) % 6) + 12, 0.28, "reed", 0.072, {
          attack: 0.018,
          lp: 2600,
          pan: beat === 4 ? 0.24 : -0.24,
          rev: 0.16,
          dest: engine.delay,
        });
      }
      if (engine.heat >= 1 && (beat === 2 || beat === 10)) {
        tone(note(phrase[(bar + beat) % phrase.length]) + 12, 0.16, "harp", 0.048, {
          attack: 0.006,
          lp: 3400,
          pan: beat === 2 ? -0.3 : 0.3,
          dest: engine.pump,
        });
      }
    }
    // Phase 2 / Enraged Crescendo high crystalline tension layer
    if (engine.heat >= 2 && beat % 4 === 2) {
      tone(note(phrase[beat >> 1]) + 24, 0.26, "celesta", 0.036, {
        attack: 0.008,
        lp: 4200,
        dest: engine.delay,
        rev: 0.16,
      });
    }
  } else if (!menu && active) {
    if (id === "lanternYard" && (beat === 4 || beat === 12)) {
      engine.noise(0.09, 0.026 * (0.7 + energy * 0.6), {
        at,
        f: 2650,
        type: "bandpass",
        q: 1.3,
        color: "pink",
        dest: engine.mus,
      });
    } else if (id === "mossBog" && (beat === 4 || beat === 10 || (hot && beat === 14))) {
      tone(note((bar + beat) % 5), 0.16, "kalimba", 0.024 * (1 + energy * 0.7), {
        attack: 0.006,
        lp: 1450,
        pan: beat === 4 ? -0.18 : 0.18,
      });
    } else if (id === "sunDunes" && (beat === 2 || beat === 6 || beat === 10 || beat === 14)) {
      engine.noise(0.075, 0.011 * (0.6 + energy * 0.7), {
        at,
        f: 3300,
        type: "bandpass",
        q: 1.5,
        color: "pink",
        dest: engine.mus,
      });
    } else if ((id === "emberHill" || id === "snowRidge" || id === "starHall") && (beat === 4 || beat === 12)) {
      const pulseWave = id === "starHall" ? "harp" : "marimba";
      tone(note((bar + (beat >> 2)) % 5), 0.21, pulseWave, 0.024 * (1 + energy * 0.8), {
        attack: 0.008,
        lp: 1650,
        pan: beat === 4 ? -0.16 : 0.16,
      });
    }
  }
}

export function scoreBed({ osc, loop, filt, lfo, level, root, barRate, boss }, biome) {
  const [air, drift, motion] = themeFor(biome).bed;
  const breath = filt("bandpass", air, 2.1, loop(0.7, "pink"));
  lfo(motion, air * 0.22, breath.frequency);
  // Keep the Flats' sandy bed below the plucked lead and brush percussion.
  level(biome === "sunDunes" && !boss ? filt("lowpass", 440, 0.707, breath) : breath, 0.15);
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
      dest: e.stings,
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
