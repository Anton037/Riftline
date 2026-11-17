// Centralized per-biome music parameters for the atmospheric electronic / chiptune / dark-synth overhaul.
// Phase 1 establishes the parameter registry and hooks it into SoundEngine without altering existing playback;
// Phase 2 (GLM-5.3-Flash) uses these scales, synth timbre profiles, and track specs for the full soundtrack rework.

export const MUSIC_BIOME_PARAMS = {
  city: {
    // Blackout City: rain-slick noir darkwave + subtle pulse-wave arps
    chords: [
      [57, "m"],
      [53, "M"],
      [50, "m"],
      [52, "M"],
    ],
    scale: [0, 2, 3, 5, 7, 8, 11], // A harmonic/natural minor noir tension
    voices: { arp: "square", bass: "sawtooth", lp: 2200, lead: "triangle" },
    voicePreset: "piano",
    synthStyle: {
      chipDuty: 0.25,
      subDetuneCents: 7,
      arpSubdiv: 2,
      padCutoff: 950,
    },
    tracks: {
      fight: { bpm: 78, bars: 16, swing: 0.26, gain: 1 },
      boss: { bpm: 128, bars: 22, swing: 0, gain: 1.1 },
    },
  },
  shelf: {
    // Aurora Shelf: glacial ambient synth + crystalline bell/chiptune shimmer
    chords: [
      [52, "m"],
      [48, "M"],
      [55, "M"],
      [50, "M"],
    ],
    scale: [0, 2, 3, 5, 7, 9, 10], // Dorian ice shimmer
    voices: { arp: "sine", bass: "triangle", lp: 4200, lead: "sine" },
    voicePreset: "ice",
    synthStyle: {
      chipDuty: 0.125,
      subDetuneCents: 10,
      arpSubdiv: 4,
      padCutoff: 1400,
    },
    tracks: {
      fight: { bpm: 72, bars: 16, swing: 0, chordBars: 2, gain: 1 },
      boss: { bpm: 138, bars: 22, swing: 0, gain: 1 },
    },
  },
  marsh: {
    // Glowmarsh: swampy dub-bass electronic + eerie plucked chiptune spores
    chords: [
      [53, "m"],
      [56, "M"],
      [51, "M"],
      [48, "m"],
    ],
    scale: [0, 1, 3, 5, 7, 8, 10], // Phrygian murky tension
    voices: { arp: "triangle", bass: "sawtooth", lp: 1200, lead: "triangle" },
    voicePreset: "kalimba",
    synthStyle: {
      chipDuty: 0.5,
      subDetuneCents: 12,
      arpSubdiv: 2,
      padCutoff: 680,
    },
    tracks: {
      fight: { bpm: 69, bars: 16, swing: 0.17, gain: 1 },
      boss: { bpm: 116, bars: 22, swing: 0, gain: 1 },
    },
  },
  core: {
    // Shattered Core: dark IDM / pulsing arpeggiated polyrhythms + sharp square leads
    chords: [
      [54, "m"],
      [50, "M"],
      [45, "M"],
      [52, "M"],
    ],
    scale: [0, 2, 3, 6, 7, 8, 11], // Hungarian/arcane minor
    voices: { arp: "square", bass: "sawtooth", lp: 3000, lead: "square" },
    voicePreset: "glass",
    synthStyle: {
      chipDuty: 0.25,
      subDetuneCents: 14,
      arpSubdiv: 4,
      padCutoff: 1250,
    },
    tracks: {
      fight: { bpm: 60, bars: 16, swing: 0, chordBars: 2, gain: 1 },
      boss: { bpm: 172, bars: 22, swing: 0, gain: 1.25 },
    },
  },
  caldera: {
    // Ashfall Caldera: industrial dark synthwave + heavy sub-bass & bit-grit hits
    chords: [
      [43, "m"],
      [39, "M"],
      [41, "M"],
      [38, "M"],
    ],
    scale: [0, 1, 4, 5, 7, 8, 10], // Phrygian dominant volcanic heat
    voices: { arp: "square", bass: "sawtooth", lp: 1500, lead: "sawtooth" },
    voicePreset: "cinder",
    synthStyle: {
      chipDuty: 0.5,
      subDetuneCents: 16,
      arpSubdiv: 2,
      padCutoff: 800,
    },
    tracks: {
      fight: { bpm: 84, bars: 16, swing: 0, gain: 1 },
      boss: { bpm: 132, bars: 22, swing: 0, gain: 1.2 },
    },
  },
  flats: {
    // Glass Flats: sun-bleached synth haze + shimmering square/sine harmonics
    chords: [
      [50, "M"],
      [45, "M"],
      [47, "m"],
      [43, "M"],
    ],
    scale: [0, 2, 4, 6, 7, 9, 11], // Lydian mirage brightness
    voices: { arp: "sine", bass: "triangle", lp: 3800, lead: "sine" },
    voicePreset: "glassine",
    synthStyle: {
      chipDuty: 0.125,
      subDetuneCents: 8,
      arpSubdiv: 3,
      padCutoff: 1550,
    },
    tracks: {
      fight: { bpm: 92, bars: 16, swing: 0, gain: 1 },
      boss: { bpm: 134, bars: 22, swing: 0, gain: 1.2 },
    },
  },
};

export function getBiomeMusicParams(biomeId) {
  return MUSIC_BIOME_PARAMS[biomeId] || MUSIC_BIOME_PARAMS.city;
}
