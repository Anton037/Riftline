// Original modal instruments and synthesized material transients for combat, interface and ambience.
import { SOURCE_CLIPS } from "./source-bank.js";
import { actorMaterial } from "../data/materials.js";
import { BOSS_EFFECTS } from "../data/combat-effects.js";

let bytesPromise, decodedPromise;
export function preloadPhysicalAudio() {
  if (!bytesPromise && typeof fetch === "function")
    bytesPromise = fetch("audio/physical-bank.wav")
      .then((r) => {
        if (!r.ok) throw new Error("Physical audio bank unavailable");
        return r.arrayBuffer();
      })
      .catch(() => null);
  return bytesPromise;
}
const hash = (value) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
};
const sample = {
  report: "reed_release",
  rifle: "compressed_coil",
  shotgun: "split_reed_release",
  metal: "stylus_tap_000",
  plate: "brass_plate",
  heavy: "ceramic_knock_000",
  glass: "porcelain_burst_000",
  flesh: "clay_thump",
  soft: "felt_tap",
  wood: "wooden_resonator",
  blade: "spindle_strike",
  stone: "stone_step_000",
  slate: "wet_slate_step",
  snow: "frost_step",
  ice: "ice_skate_step",
  bog: "bog_squelch_step",
  obsidian: "obsidian_chime_step",
  cinder: "cinder_crunch_step",
  sand: "sand_glass_step",
  grass: "reed_step",
  timber: "panel_step",
};
const P = {
  nova: {
    dur: 0.65,
    sample: "heavy",
    body: 56,
    air: 0.18,
    grain: 0.18,
    arc: 0.25,
    gain: 0.4,
    recordGain: 0.18,
    gate: 0.04,
    lowpass: 3600,
  },
  singThrow: {
    dur: 0.22,
    sample: "metal",
    body: 240,
    air: 0.16,
    grain: 0.1,
    arc: 0.3,
    gain: 0.26,
    recordGain: 0.08,
    gate: 0.06,
    lowpass: 3400,
  },
  singPull: {
    dur: 1.48,
    sample: "soft",
    body: 72,
    air: 0.26,
    grain: 0.02,
    arc: 0.06,
    gain: 0.21,
    recordGain: 0.03,
    gate: 0.22,
    lowpass: 900,
    hold: true,
  },
  singCollapse: {
    dur: 0.5,
    sample: "heavy",
    body: 42,
    air: 0.35,
    grain: 0.13,
    arc: 0.15,
    gain: 0.38,
    recordGain: 0.2,
    gate: 0.035,
    lowpass: 2200,
  },
  pulse: { dur: 0.19, sample: "report", body: 185, air: 0.055, grain: 0.05, gain: 0.29, gate: 0.045, lowpass: 3100 },
  scatter: { dur: 0.36, sample: "shotgun", body: 92, air: 0.18, grain: 0.11, gain: 0.43, gate: 0.08, lowpass: 2800 },
  tesla: {
    dur: 0.19,
    sample: "metal",
    recordGain: 0.08,
    body: 520,
    air: 0.22,
    grain: 0.1,
    arc: 0.38,
    lowpass: 2400,
    gain: 0.28,
    gate: 0.045,
  },
  chain: {
    dur: 0.14,
    sample: "soft",
    recordGain: 0,
    body: 620,
    air: 0.18,
    grain: 0.08,
    arc: 0.3,
    lowpass: 2800,
    gain: 0.17,
    gate: 0.05,
  },
  rail: { dur: 0.5, sample: "rifle", body: 74, air: 0.16, grain: 0.07, gain: 0.45, gate: 0.09, lowpass: 3200 },
  rocket: { dur: 0.44, sample: "heavy", body: 88, air: 0.24, grain: 0.06, gain: 0.36, gate: 0.08, lowpass: 2500 },
  disc: { dur: 0.27, sample: "blade", body: 420, air: 0.06, grain: 0.05, gain: 0.24, gate: 0.06, lowpass: 3600 },
  flame: {
    dur: 0.23,
    sample: "soft",
    body: 128,
    air: 0.44,
    grain: 0.08,
    gain: 0.26,
    gate: 0.07,
    lowpass: 1900,
    hold: true,
  },
  eshotGunner: { dur: 0.16, sample: "report", body: 180, air: 0.08, grain: 0.06, gain: 0.2, gate: 0.07, lowpass: 3200 },
  snipe: { dur: 0.29, sample: "rifle", body: 120, air: 0.18, grain: 0.04, gain: 0.27, gate: 0.12 },
  eshotTurret: { dur: 0.28, sample: "heavy", body: 96, air: 0.12, grain: 0.08, gain: 0.25, gate: 0.1, lowpass: 2400 },
  eshotDrone: { dur: 0.12, sample: "metal", body: 520, air: 0.12, grain: 0.04, gain: 0.18, gate: 0.07, lowpass: 3600 },
  eshotWeaver: { dur: 0.25, sample: "soft", body: 260, air: 0.22, grain: 0.09, arc: 0.2, gain: 0.2, gate: 0.1 },
  eshotCarrier: {
    dur: 0.24,
    sample: "flesh",
    body: 140,
    air: 0.26,
    grain: 0.04,
    gain: 0.23,
    gate: 0.11,
    lowpass: 1800,
  },
  eshotKeeper: { dur: 0.31, sample: "metal", body: 278, air: 0.06, grain: 0.025, gain: 0.24, gate: 0.1, lowpass: 2850 },
  eshotQueen: { dur: 0.26, sample: "flesh", body: 92, air: 0.28, grain: 0.025, gain: 0.24, gate: 0.1, lowpass: 1600 },
  eshotPrism: { dur: 0.25, sample: "glass", body: 620, air: 0.08, grain: 0.08, gain: 0.21, gate: 0.1, lowpass: 6500 },
  eshotCore: {
    dur: 0.28,
    sample: "soft",
    body: 175,
    air: 0.28,
    grain: 0.08,
    arc: 0.18,
    gain: 0.23,
    gate: 0.1,
    lowpass: 1600,
  },
  eshotTyrant: { dur: 0.3, sample: "wood", body: 85, air: 0.4, grain: 0.18, gain: 0.25, gate: 0.1, lowpass: 2000 },
  eshotWyrm: { dur: 0.22, sample: "glass", body: 880, air: 0.16, grain: 0.24, gain: 0.22, gate: 0.1, lowpass: 4800 },
  aGlass: { dur: 0.5, sample: "glass", body: 420, air: 0.26, grain: 0.22, gain: 0.31, gate: 0.12, lowpass: 5000 },
  phase: {
    dur: 0.6,
    sample: "soft",
    recordGain: 0.15,
    body: 88,
    air: 0.3,
    grain: 0.06,
    arc: 0.12,
    gain: 0.32,
    gate: 0.18,
    lowpass: 1600,
  },
  aQuake: { dur: 0.6, sample: "wood", body: 48, air: 0.4, grain: 0.14, gain: 0.38, gate: 0.1, lowpass: 1000 },
  aLava: { dur: 0.7, sample: "wood", body: 62, air: 0.45, grain: 0.17, gain: 0.4, gate: 0.1, lowpass: 1600 },
  aFire: { dur: 0.35, sample: "soft", body: 90, air: 0.45, grain: 0.14, gain: 0.27, gate: 0.08, lowpass: 2000 },
  aAcid: { dur: 0.4, sample: "flesh", body: 100, air: 0.33, grain: 0.05, gain: 0.28, gate: 0.08, lowpass: 1400 },
  aRift: { dur: 0.5, sample: "soft", recordGain: 0.2, body: 88, air: 0.3, grain: 0.07, arc: 0.1, gain: 0.3, gate: 0.1 },
  aIce: { dur: 0.45, sample: "glass", body: 550, air: 0.1, grain: 0.13, gain: 0.3, gate: 0.1, lowpass: 6000 },
  aShort: {
    dur: 0.23,
    sample: "metal",
    recordGain: 0.1,
    body: 550,
    air: 0.24,
    grain: 0.35,
    arc: 0.5,
    gain: 0.29,
    gate: 0.08,
  },
  bwLaser: {
    dur: 0.8,
    sample: "metal",
    body: 720,
    air: 0.08,
    grain: 0.03,
    gain: 0.25,
    gate: 0.14,
    warn: true,
    lowpass: 3800,
  },
  bwCryo: {
    dur: 0.8,
    sample: "glass",
    body: 960,
    air: 0.12,
    grain: 0.05,
    gain: 0.24,
    gate: 0.14,
    warn: true,
    lowpass: 6000,
  },
  bwAcid: {
    dur: 0.8,
    sample: "flesh",
    body: 260,
    air: 0.25,
    grain: 0.04,
    gain: 0.24,
    gate: 0.14,
    warn: true,
    lowpass: 1600,
  },
  bwFlame: {
    dur: 0.8,
    sample: "soft",
    body: 180,
    air: 0.42,
    grain: 0.12,
    gain: 0.25,
    gate: 0.14,
    warn: true,
    lowpass: 1800,
  },
  bwRift: {
    dur: 0.8,
    sample: "soft",
    body: 380,
    air: 0.18,
    grain: 0.08,
    arc: 0.12,
    gain: 0.25,
    gate: 0.14,
    warn: true,
  },
  bwFlare: {
    dur: 0.8,
    sample: "glass",
    body: 580,
    air: 0.2,
    grain: 0.09,
    gain: 0.25,
    gate: 0.14,
    warn: true,
    lowpass: 4200,
  },
  tmEmber: {
    dur: 0.65,
    sample: "wood",
    body: 140,
    air: 0.24,
    grain: 0.08,
    gain: 0.24,
    gate: 0.14,
    warn: true,
    lowpass: 1800,
  },
  tmGlass: {
    dur: 0.65,
    sample: "glass",
    body: 640,
    air: 0.1,
    grain: 0.08,
    gain: 0.24,
    gate: 0.14,
    warn: true,
    lowpass: 4500,
  },
  tsEmber: { dur: 0.65, sample: "wood", body: 70, air: 0.4, grain: 0.17, gain: 0.38, gate: 0.1, lowpass: 2000 },
  tsPyro: { dur: 0.62, sample: "wood", body: 78, air: 0.44, grain: 0.18, gain: 0.38, gate: 0.1, lowpass: 2100 },
  tsGlass: { dur: 0.5, sample: "glass", body: 490, air: 0.24, grain: 0.2, gain: 0.33, gate: 0.1, lowpass: 5000 },
  tsSun: { dur: 0.56, sample: "glass", body: 540, air: 0.26, grain: 0.22, gain: 0.34, gate: 0.1, lowpass: 5200 },
  bcLock: { dur: 0.26, sample: "plate", body: 320, air: 0.08, grain: 0.05, gain: 0.27, gate: 0.05, lowpass: 3400 },
  bcShatter: { dur: 0.38, sample: "glass", body: 760, air: 0.12, grain: 0.18, gain: 0.25, gate: 0.04, lowpass: 6200 },
  event: { dur: 1.25, sample: "heavy", body: 58, air: 0.32, grain: 0.1, gain: 0.33, gate: 0.4 },
  impact: { dur: 0.16, sample: "wood", body: 220, air: 0.06, grain: 0.03, gain: 0.19, gate: 0.025, lowpass: 2800 },
  hitArmor: { dur: 0.13, sample: "heavy", body: 148, air: 0.028, grain: 0.012, gain: 0.2, gate: 0.035, lowpass: 2200 },
  hitOrganic: {
    dur: 0.14,
    sample: "flesh",
    body: 108,
    air: 0.038,
    grain: 0.018,
    gain: 0.21,
    gate: 0.035,
    lowpass: 1800,
  },
  hitStone: { dur: 0.16, sample: "wood", body: 124, air: 0.05, grain: 0.04, gain: 0.2, gate: 0.035, lowpass: 2400 },
  hitCrystal: {
    dur: 0.17,
    sample: "glass",
    body: 523,
    air: 0.045,
    grain: 0.022,
    gain: 0.18,
    gate: 0.035,
    lowpass: 5200,
  },
  hitEnergy: { dur: 0.14, sample: "soft", body: 196, air: 0.11, grain: 0.02, gain: 0.2, gate: 0.035, lowpass: 1800 },
  organic: { dur: 0.29, sample: "flesh", body: 104, air: 0.09, grain: 0.06, gain: 0.24, gate: 0.035, lowpass: 2200 },
  armor: { dur: 0.38, sample: "plate", body: 146, air: 0.08, grain: 0.05, gain: 0.26, gate: 0.04, lowpass: 2600 },
  glass: { dur: 0.4, sample: "glass", body: 660, air: 0.09, grain: 0.1, gain: 0.23, gate: 0.045, lowpass: 5400 },
  debris: { dur: 0.42, sample: "wood", body: 128, air: 0.1, grain: 0.09, gain: 0.24, gate: 0.04, lowpass: 2400 },
  boom: { dur: 0.8, sample: "heavy", body: 55, air: 0.32, grain: 0.05, gain: 0.45, gate: 0.09, lowpass: 2100 },
  wind: { dur: 0.42, sample: "soft", body: 196, air: 0.24, grain: 0.04, gain: 0.2, gate: 0.09, lowpass: 2200 },
  warning: {
    dur: 0.65,
    sample: "plate",
    body: 494,
    air: 0.09,
    grain: 0.05,
    gain: 0.24,
    gate: 0.14,
    warn: true,
    lowpass: 3400,
  },
  ui: { dur: 0.11, sample: "wood", body: 330, air: 0.02, grain: 0.012, gain: 0.13, gate: 0.055, lowpass: 2500 },
  reward: { dur: 0.52, sample: "glass", body: 659, air: 0.025, grain: 0.012, gain: 0.2, gate: 0.08, lowpass: 4800 },
  step: { dur: 0.21, sample: "stone", body: 136, air: 0.045, grain: 0.022, gain: 0.21, gate: 0.045, lowpass: 2200 },
  sparkCourtyard: {
    dur: 0.13,
    sample: "heavy",
    body: 340,
    air: 0.03,
    grain: 0.02,
    gain: 0.14,
    gate: 0.055,
    lowpass: 3400,
  },
  sparkShelf: { dur: 0.15, sample: "glass", body: 680, air: 0.04, grain: 0.03, gain: 0.14, gate: 0.055, lowpass: 5400 },
  sparkMarsh: { dur: 0.14, sample: "flesh", body: 145, air: 0.04, grain: 0.02, gain: 0.15, gate: 0.055, lowpass: 1900 },
  sparkCore: {
    dur: 0.16,
    sample: "obsidian",
    body: 520,
    air: 0.04,
    grain: 0.02,
    gain: 0.14,
    gate: 0.055,
    lowpass: 4800,
  },
  sparkCaldera: {
    dur: 0.14,
    sample: "plate",
    body: 196,
    air: 0.05,
    grain: 0.03,
    gain: 0.15,
    gate: 0.055,
    lowpass: 2600,
  },
  sparkFlats: { dur: 0.15, sample: "sand", body: 440, air: 0.05, grain: 0.03, gain: 0.14, gate: 0.055, lowpass: 4400 },
  propArm: {
    dur: 0.48,
    sample: "plate",
    body: 260,
    air: 0.14,
    grain: 0.05,
    gain: 0.23,
    gate: 0.08,
    warn: true,
    lowpass: 2800,
  },
  propLantern: { dur: 0.42, sample: "heavy", body: 392, air: 0.06, grain: 0.03, gain: 0.24, gate: 0.08, lowpass: 3800 },
  propRime: { dur: 0.44, sample: "glass", body: 698, air: 0.09, grain: 0.08, gain: 0.23, gate: 0.08, lowpass: 5800 },
  propPuffball: { dur: 0.36, sample: "wood", body: 196, air: 0.14, grain: 0.04, gain: 0.25, gate: 0.08, lowpass: 2200 },
  propPrism: {
    dur: 0.46,
    sample: "obsidian",
    body: 587,
    air: 0.07,
    grain: 0.04,
    gain: 0.23,
    gate: 0.08,
    lowpass: 5200,
  },
  propCrucible: {
    dur: 0.54,
    sample: "plate",
    body: 147,
    air: 0.28,
    grain: 0.09,
    gain: 0.28,
    gate: 0.08,
    lowpass: 2400,
  },
  propSunglass: {
    dur: 0.44,
    sample: "glass",
    body: 659,
    air: 0.12,
    grain: 0.07,
    gain: 0.24,
    gate: 0.08,
    lowpass: 5600,
  },
  dClockwork: { dur: 0.28, sample: "plate", body: 294, air: 0.06, grain: 0.08, gain: 0.21, gate: 0.04, lowpass: 3200 },
  dConstruct: {
    dur: 0.34,
    sample: "obsidian",
    body: 440,
    air: 0.08,
    grain: 0.04,
    gain: 0.2,
    gate: 0.04,
    lowpass: 4400,
  },
  room: { dur: 0.8, sample: "soft", body: 76, air: 0.4, grain: 0.09, gain: 0.16, gate: 0.08 },
  rain: { dur: 0.24, model: "rain", body: 1200, gain: 0.16, gate: 0 },
  water: { dur: 0.42, model: "water", body: 260, gain: 0.18, gate: 0 },
  air: { dur: 0.95, model: "air", body: 45, gain: 0.24, gate: 0, hold: true },
  bird: { dur: 0.55, model: "bird", body: 2100, gain: 0.18, gate: 0 },
  insect: { dur: 0.36, model: "insect", body: 3800, gain: 0.14, gate: 0 },
  frog: { dur: 0.46, model: "frog", body: 330, gain: 0.17, gate: 0 },
  mammal: { dur: 0.65, model: "mammal", body: 210, gain: 0.19, gate: 0 },
  galleryChime: { dur: 0.88, model: "ceramic", body: 430, gain: 0.15, gate: 0 },
  kilnResonance: { dur: 1.19, model: "ceramic", body: 126, gain: 0.24, gate: 0 },
  stoneEcho: { dur: 0.67, model: "ceramic", body: 209, gain: 0.18, gate: 0 },
  inlayCharge: { dur: 0.72, model: "ceramic", body: 332, gain: 0.31, gate: 0 },
  inlayRelease: { dur: 0.48, sample: "plate", body: 248, air: 0.06, grain: 0.03, gain: 0.36, gate: 0.05 },
  buzz: { dur: 0.65, model: "buzz", body: 60, gain: 0.14, gate: 0 },
};
const BOSS_TIMBRE = {
  bellkeeper: ["plate", 245, 3000],
  queen: ["flesh", 105, 1800],
  prism: ["glass", 710, 6500],
  core: ["soft", 165, 1800],
  tyrant: ["wood", 88, 2000],
  wyrm: ["glass", 440, 4800],
};
const PLACE_FAMILIES = [
  [/lampBuzz|portalHum|gravityHum|^hum$/i, "buzz"],
  [/rainDrop/i, "rain"],
  [/gutter|drip|bubble|blub|mud|gurgle|splash/i, "water"],
  [/cricket|cicada|insect/i, "insect"],
  [/frog/i, "frog"],
  [/bird|owl|heron|chirp/i, "bird"],
  [/howl/i, "mammal"],
  [
    /wind|gust|breeze|hiss|sizzle|dustRush|steamBlast|fumarole|breath|devilMoan|portalWhisper|swell|groan|lavaWarn/i,
    "air",
  ],
  [/boom|avalanche|fall|quake|rubble|heartbeat/i, "boom"],
  [/ice|icicle|glass|crystal|crack|shimmer|creak|reversed/i, "glass"],
  [/spark|cl[au]nk|anvil|metal|vent|charge/i, "armor"],
];
export function physicalProfile(id, arg, place = false) {
  let family = P[id] ? id : "impact";
  if (!place && (id === "hit" || id === "crit")) {
    family = arg?.shield
      ? "hitEnergy"
      : {
          armor: "hitArmor",
          organic: "hitOrganic",
          stone: "hitStone",
          crystal: "hitCrystal",
          energy: "hitEnergy",
        }[actorMaterial(arg?.type)];
    return { ...P[family], family, gain: P[family].gain * (id === "crit" ? 1.25 : 1) };
  }
  if (place) {
    family = P[id]?.model === "ceramic" ? id : (PLACE_FAMILIES.find(([names]) => names.test(id))?.[1] ?? "room");
  } else if (!P[id]) {
    if (/^(tc|tm|tb|bw)|warn|wind|\block\b|servo|fuse|bWind|bOverdrive|tArm|^beam(?:Small)?$/i.test(id))
      family = "warning";
    else if (/boom|nova$|slam|thud|erupt|quake|collapse|bigkill|die|bRain/i.test(id)) family = "boom";
    else if (/^(?:dSquelch|dCrunch|dPop|hatch|brood|bSummon)/i.test(id)) family = "organic";
    else if (/^dArmor|dClang|block|guard|shield|plant|ram|resist|bRing/i.test(id)) family = "armor";
    else if (/dShatter|frost|freeze|cryo|^tsIce|^tsFrost|aIce|bLance|bounce/i.test(id)) family = "glass";
    else if (/^d(?=[A-Z])/.test(id) || /kill/i.test(id)) family = "debris";
    else if (/eshot|snipe|wing|lob|chain/i.test(id)) family = /Queen|Weaver|Frost|Prism/.test(id) ? "tesla" : "pulse";
    else if (/step|land/.test(id)) family = "step";
    else if (/dash|blink|warp|singPull|devil/i.test(id)) family = "wind";
    else if (/ready|buy|pick|clear|victory|heal|evolve|shard|tribute|bounty|reward|surge|champion|mutator/i.test(id))
      family = "reward";
    else if (/beam|rift|stun|chill|short|zap/i.test(id)) family = "tesla";
    else if (/^ts|^a[A-Z]|^bc|boss|phase|enrage|rumble/i.test(id)) family = "boom";
    else if (/click|hover|deny|offer|reroll|supply|combo|wave|spawn|mend|gadget/i.test(id)) family = "ui";
  }
  const p = { ...P[family], family };
  if (id === "heart")
    Object.assign(p, P.organic, { family: "organic", sample: "soft", body: 52, dur: 0.34, gain: 0.19 });
  if (id === "hurt") Object.assign(p, P.organic, { family: "organic", body: 78, gain: 0.38 });
  if (id === "dPop") Object.assign(p, { sample: "soft", body: 175, dur: 0.17, gain: 0.16 });
  if (id === "dGhost") Object.assign(p, P.wind, { family: "wind", body: 96, dur: 0.5, gain: 0.18 });
  if (id === "dZap") Object.assign(p, P.tesla, { family: "tesla", dur: 0.27, gain: 0.23 });
  if (id === "eshotFrost") Object.assign(p, P.glass, { family: "glass", dur: 0.23, gain: 0.22 });
  if (id === "bOverdrive")
    Object.assign(p, P.warning, {
      family: "warning",
      sample: "plate",
      body: 440,
      dur: 0.78,
      air: 0.14,
      grain: 0.06,
      gain: 0.28,
      warn: true,
    });
  if (id === "bRing")
    Object.assign(p, P.armor, { family: "armor", sample: "plate", body: 320, dur: 0.48, air: 0.1, gain: 0.27 });
  if (id === "bSummon")
    Object.assign(p, P.organic, { family: "organic", sample: "flesh", body: 135, dur: 0.52, air: 0.18, gain: 0.26 });
  if (id === "bLance")
    Object.assign(p, P.glass, { family: "glass", sample: "glass", body: 640, dur: 0.44, air: 0.14, gain: 0.26 });
  if (id === "bRain")
    Object.assign(p, P.boom, { family: "boom", sample: "heavy", body: 72, dur: 0.58, air: 0.28, gain: 0.32 });
  if (id === "champion")
    Object.assign(p, P.reward, { family: "reward", sample: "plate", body: 360, dur: 0.48, air: 0.07, gain: 0.25 });
  if (id === "mutator")
    Object.assign(p, P.reward, { family: "reward", sample: "obsidian", body: 420, dur: 0.56, air: 0.12, gain: 0.26 });
  const source = typeof arg === "string" ? arg : arg?.src,
    identity = BOSS_EFFECTS[source];
  if (!place && identity && /^(b[A-Z]|boss|enrage|bigkill|blink|thud|lob|hatch)/.test(id)) {
    const timbre = BOSS_TIMBRE[source];
    p.family += ":" + source;
    [p.sample, p.body, p.lowpass] = timbre;
    if (id === "hatch") {
      p.dur = 0.4;
      p.air = 0.24;
      p.grain = 0.08;
    }
    if (id.startsWith("blink") && source === "wyrm") {
      p.air = 0.32;
      p.grain = 0.2;
    }
  }
  if (!place && id === "leap")
    Object.assign(p, P.wind, { family: "leap", sample: "grass", body: 115, dur: 0.2, gain: 0.2 });
  if (!place && id === "hatch" && !identity) Object.assign(p, P.organic, { family: "organic", body: 110 });
  if (!place && id === "lob" && arg?.frost)
    Object.assign(p, P.glass, { family: "frostLob", dur: 0.23, body: 510, gain: 0.22 });
  if (!place && id === "tbFlame") Object.assign(p, P.bwFlame, { family: "magmaWarning" });
  if (!place && id === "tbCryo") Object.assign(p, P.bwCryo, { family: "cryoWarning" });
  if (!place && id === "tbAcid") Object.assign(p, P.bwAcid, { family: "acidWarning" });
  if (!place && id === "tbSun") Object.assign(p, P.bwFlare, { family: "sunWarning" });
  if (!place && id === "tsPlate")
    Object.assign(p, { ...P.reward, family: id, sample: "plate", body: 310, dur: 0.42, gain: 0.28 });
  if (!place && (id === "tsGeyser" || id === "tsSpore"))
    Object.assign(p, { ...P.organic, family: id, sample: "flesh", body: 125, dur: 0.36, gain: 0.28 });
  if (!place && (id === "tsPyro" || id === "tsEmber"))
    Object.assign(p, { ...P.boom, family: id, sample: "wood", body: 68, lowpass: 1200, dur: 0.44, gain: 0.32 });
  if (!place && (id === "tsSun" || id === "tsGlass"))
    Object.assign(p, { ...P.glass, family: id, sample: "glass", body: 540, dur: 0.32, gain: 0.26 });
  if (!place && (id === "tsRift" || id === "tsRiftMine" || id === "tsRiftmine"))
    Object.assign(p, { ...P.wind, family: id, sample: "soft", body: 195, dur: 0.44, gain: 0.28 });
  if (!place && id === "mend")
    Object.assign(
      p,
      source === "beacon"
        ? { ...P.chain, family: "repairField", body: 280, arc: 0.025, air: 0.08, grain: 0.01, dur: 0.3, gain: 0.18 }
        : {
            ...P.organic,
            family: "menderPulse",
            body: 185,
            recordGain: 0.1,
            air: 0.12,
            grain: 0.015,
            dur: 0.3,
            gain: 0.18,
          },
    );
  if (!place && id === "tArm") {
    const arm = {
      mine: ["plate", 240],
      frost: ["glass", 510],
      spore: ["flesh", 120],
      riftmine: ["soft", 210],
      embermine: ["wood", 110],
      glassmine: ["glass", 580],
    }[arg];
    if (arm)
      Object.assign(p, {
        family: "arm:" + arg,
        sample: arm[0],
        body: arm[1],
        warn: false,
        dur: 0.18,
        air: 0.08,
        grain: 0.03,
      });
  }
  if (place && /calderaRumble|ventPulse|fumarole|cinderGust/.test(id))
    Object.assign(p, P.air, {
      family: "volcanicAir",
      model: "air",
      dur: id === "calderaRumble" ? 1.2 : 0.95,
      gain: 0.25,
    });
  if (place && /rockFall|farBoom/.test(id))
    Object.assign(p, P.boom, {
      family: "rockFall",
      sample: "wood",
      lowpass: 1000,
      body: 55,
      recordGain: 0.18,
      gain: 0.22,
    });
  if (place && id === "heartbeat") p.gain = 0.24;
  if (place && id === "emberPop")
    Object.assign(p, P.impact, { family: "emberPop", sample: "wood", body: 170, lowpass: 1800, dur: 0.17, gain: 0.15 });
  if (place && /owl/i.test(id)) p.body = 470;
  if (place && /heron/i.test(id)) p.body = 780;

  // A few inharmonic material modes identify cues without melodic arcade pitch sweeps.
  p.body *= P[id] ? 1 : 0.84 + (hash(id) % 39) / 100;
  if (!place && id === "hover")
    Object.assign(p, P.ui, { family: "ui", dur: 0.035, gain: 0.06, sample: "wood", body: 420 });
  if (!place && id === "bounce") Object.assign(p, P.glass, { family: "glass", dur: 0.11, body: 620, gain: 0.16 });
  if (p.warn) {
    const delay = typeof arg === "number" ? arg : arg?.delay;
    if (Number.isFinite(delay)) p.dur = Math.max(0.12, Math.min(1.5, delay));
  }
  if (family === "step") {
    const ground = String(arg?.ground || "");
    if (/^ice$/.test(ground)) {
      p.sample = "ice";
      p.body = 310;
      p.lowpass = 4200;
    } else if (/snow|frost/.test(ground)) {
      p.sample = "snow";
      p.body = 196;
      p.lowpass = 3000;
    } else if (/acid|grass/.test(ground)) {
      p.sample = "grass";
      p.body = 148;
      p.lowpass = 2200;
    } else if (/peat|mud|water/.test(ground)) {
      p.sample = "bog";
      p.body = 122;
      p.lowpass = 1900;
    } else if (/sandglass|sand/.test(ground)) {
      p.sample = "sand";
      p.body = 248;
      p.lowpass = 3400;
    } else if (/glass|rift/.test(ground)) {
      p.sample = "obsidian";
      p.body = 320;
      p.lowpass = 4200;
    } else if (/crust|ash/.test(ground)) {
      p.sample = "cinder";
      p.body = 146;
      p.lowpass = 2400;
    } else if (/flagstone/.test(ground)) {
      p.sample = "slate";
      p.body = 168;
      p.lowpass = 2600;
    } else if (/wood/.test(ground)) {
      p.sample = "timber";
    } else {
      p.sample = "stone";
    }
    if (id === "land") {
      p.dur = 0.26;
      p.gain *= 1.18;
    }
    p.gain *= Math.max(0.5, Math.min(1.2, arg?.v || 1));
  }
  if (place) {
    p.gain *= family === "boom" ? 0.25 : 0.48;
    p.gate = 0;
    p.place = true;
  }
  return p;
}

export class PhysicalVoices {
  constructor(ctx, { decode = true } = {}) {
    this.ctx = ctx;
    this.buffers = new Map();
    this.serial = 0;
    this.bank = null;
    this.ready = decode
      ? Promise.resolve(preloadPhysicalAudio()).then(async (bytes) => {
          if (!bytes) return false;
          if (!decodedPromise) decodedPromise = ctx.decodeAudioData(bytes.slice(0)).catch(() => null);
          this.bank = await decodedPromise;
          this.buffers.clear();
          return !!this.bank;
        })
      : Promise.resolve(false);
  }
  buffer(p, variant) {
    const key = [
      p.family,
      p.sample,
      p.body.toFixed(1),
      p.dur.toFixed(3),
      variant,
      p.model,
      p.air,
      p.grain,
      p.lowpass,
      p.recordGain,
      p.arc,
      p.warn,
      p.hold,
      p.model ? "procedural" : !!this.bank,
    ].join(":");
    if (this.buffers.has(key)) {
      const b = this.buffers.get(key);
      this.buffers.delete(key);
      this.buffers.set(key, b);
      return b;
    }
    const rate = this.ctx.sampleRate,
      n = Math.ceil(rate * p.dur),
      b = this.ctx.createBuffer(1, n, rate),
      data = b.getChannelData(0);
    const sourceName = sample[p.sample];
    const alternate = variant === 1 ? sourceName?.replace(/_000$/, "_001") : sourceName;
    const region = SOURCE_CLIPS[alternate] || SOURCE_CLIPS[sourceName],
      raw = this.bank?.getChannelData(0),
      sr = this.bank?.sampleRate || 1;
    let state = hash(key) || 1,
      low = 0,
      band = 0,
      phase = 0;
    let recordedLow = 0;
    const recordedAlpha = p.lowpass ? 1 - Math.exp((-Math.PI * 2 * p.lowpass) / rate) : 1;
    const center = p.model === "air" ? 0.055 : p.family === "tesla" ? 0.48 : p.family === "flame" ? 0.18 : 0.31;
    const mechanical = p.model === "buzz";
    const ceramic = p.model === "ceramic";
    const liquid = p.model === "rain" || p.model === "water";
    const airy = p.model === "air";
    for (let i = 0; i < n; i++) {
      const t = i / rate,
        x = t / p.dur;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = state / 2147483648 - 1;
      low += 0.035 * (noise - low);
      band += center * (noise - band);
      if (p.model) {
        // Warm, soothing procedural air, water droplet & glazed ceramic wind-chime resonators
        const bell = Math.sin(Math.PI * x) ** 2;
        const flit = 0.5 + 0.5 * Math.sin(t * (14 + p.body * 0.011));
        const drift = mechanical ? 0.055 * Math.cos(t * 5.5) : 0.048 * Math.sin(t * 9 + x * 3.2);
        phase += (Math.PI * 2 * p.body * (0.92 + drift + (liquid ? 0.18 * Math.exp(-t * 24) : 0))) / rate;
        const resonator =
          Math.sin(phase + 0.42 * Math.sin(phase * 1.498)) * 0.22 + Math.sin(phase * 1.998 + 0.15) * 0.045;
        const value = ceramic
          ? (Math.sin(phase) * 0.19 * Math.exp(-t * 3.4) +
              Math.sin(phase * 1.996 + 0.14) * 0.1 * Math.exp(-t * 6.8) +
              Math.sin(phase * 2.992) * 0.038 * Math.exp(-t * 12)) *
            (0.92 + 0.08 * flit)
          : airy
            ? (low * 0.56 + band * 0.38) * bell * (0.74 + 0.26 * flit)
            : liquid
              ? (resonator * 0.74 + band * 0.22) * Math.exp(-t * 17) * (0.7 + 0.3 * flit)
              : (resonator * (mechanical ? 0.72 : 1) + band * (mechanical ? 0.14 : 0.048)) * bell * (0.4 + 0.6 * flit);
        data[i] = value * Math.min(1, t / 0.009, (p.dur - t) / 0.024);
        continue;
      }
      const attack = Math.min(1, t / (p.warn ? 0.042 : p.hold ? 0.014 : 0.003));
      const tail = Math.min(1, (p.dur - t) / 0.025);
      const envelope = p.warn
        ? (0.24 + x * 0.76) * (0.66 + 0.34 * Math.sin(t * (8.5 + variant) * Math.PI * 2) ** 2)
        : p.hold
          ? Math.sin(Math.PI * x) ** 0.5
          : Math.exp(-t / (p.dur * 0.24));
      const sweep = p.warn ? 0.74 + 0.38 * x + Math.floor(x * 4) * 0.035 : 0.92 + 0.28 * Math.exp(-t * 28);
      phase += (Math.PI * 2 * p.body * sweep) / rate;
      const shimmer = Math.sin(phase * 1.498) * (0.72 + 0.28 * Math.cos(t * 16));
      const modes =
        Math.sin(phase + shimmer * 0.38) * 0.18 +
        Math.sin(phase * 1.998 + 0.16) * 0.064 +
        Math.sin(phase * 2.996) * 0.028 * Math.exp(-t * 8);
      const air = (band - low) * p.air * (p.warn ? envelope : Math.exp(-t / (p.dur * 0.38)));
      const grains = noise * (Math.sin(t * 611 + variant) > 0.7 ? 1 : 0.1) * p.grain * Math.exp(-t * 22);
      let recorded = 0;
      if (raw && region) {
        const position = (region.start + t * (1 + (variant - 1) * 0.035)) * sr;
        const at = Math.floor(position),
          f = position - at;
        if (t * (1 + (variant - 1) * 0.035) < region.duration && at + 1 < raw.length)
          recorded = (raw[at] * (1 - f) + raw[at + 1] * f) * (p.recordGain ?? (p.warn || p.hold ? 0.11 : 0.66));
      }
      recordedLow += recordedAlpha * (recorded - recordedLow);
      const arc = p.arc
        ? (noise - band) *
          p.arc *
          (0.2 + 0.8 * Math.max(0, Math.sin(t * 335 + 2 * Math.sin(t * 71))) ** 12) *
          Math.exp(-t / (p.dur * 0.32))
        : 0;
      data[i] = (recordedLow + modes * envelope + air + grains + arc) * attack * tail;
    }
    this.buffers.set(key, b);
    if (this.buffers.size > 48) this.buffers.delete(this.buffers.keys().next().value);
    return b;
  }
  source(engine, id, p, { at = 0, gain = 1, pan, ambience = false } = {}) {
    const start = engine.ctx.currentTime + at,
      end = start + p.dur + 0.025;
    const voice = engine.claim(ambience ? 0.5 : engine.curPri, start, end);
    if (!voice || engine.budgetOnly) return;
    const src = this.ctx.createBufferSource(),
      amp = this.ctx.createGain(),
      atten = ambience ? 1 : (engine.curAtten ?? 1),
      level = p.gain * gain * atten;
    src.buffer = this.buffer(p, this.serial++ % 3);
    voice.node = src;
    voice.amp = amp;
    amp.gain.setValueAtTime(level, start);
    amp.gain.setValueAtTime(level, start + Math.max(0.001, p.dur - 0.02));
    amp.gain.linearRampToValueAtTime(0, start + p.dur);
    src.connect(amp);
    engine.route(
      amp,
      {
        ...(ambience ? { dest: engine.ambBus } : {}),
        pan,
        rev: ambience ? 0.24 : p.warn ? 0.035 : 0.09,
      },
      voice,
    );
    src.start(start);
    src.stop(end);
    if (!engine.offline) src.onended = () => engine._cleanupVoice(voice);
  }
  play(engine, id, arg) {
    if (id === "place") {
      engine.placePlay(arg?.id || "sparks", { g: 1, pan: 0 });
      return;
    }
    const p = physicalProfile(id, arg);
    if (!engine.gate(id === "hit" || id === "crit" ? `${id}:${p.family}` : id, p.gate)) return;
    this.source(engine, id, p);
    if (["scatter", "rail"].includes(id))
      this.source(engine, "chamber", { ...P.ui, sample: "metal", gain: 0.11 }, { at: id === "scatter" ? 0.13 : 0.18 });
    if (/^tb/.test(id) && arg?.dur) {
      const base =
        id === "tbFlame"
          ? P.bwFlame
          : id === "tbCryo" || id === "tbSun"
            ? P.glass
            : id === "tbAcid"
              ? P.organic
              : id === "tbLaser"
                ? P.wind
                : P.tesla;
      this.source(engine, id + "-active", { ...base, dur: Math.min(1.2, arg.dur) }, { at: p.dur, gain: 0.7 });
    }
  }
  place(engine, id, a = {}) {
    this.source(engine, id, physicalProfile(id, null, true), { gain: a.g ?? 1, pan: a.pan || 0, ambience: true });
  }
}

// The score uses original harmonic spectra for ceramic keys, bowed reeds and brass resonators.
const waves = new WeakMap();
export function setNaturalWave(ctx, oscillator, shape) {
  if (shape === "sine") {
    oscillator.type = "sine";
    return;
  }
  let cache = waves.get(ctx);
  if (!cache) waves.set(ctx, (cache = new Map()));
  if (!cache.has(shape)) {
    const real = new Float32Array(24),
      imag = new Float32Array(24);
    const partials = {
      ceramic: [1, 0.08, 0.29, 0.12, 0.05, 0.025],
      kalimba: [1, 0.14, 0.26, 0.05, 0.08, 0.02],
      celesta: [1, 0.07, 0.21, 0.13, 0.05, 0.024],
      harp: [1, 0.42, 0.23, 0.11, 0.055, 0.026, 0.012],
      marimba: [1, 0.04, 0.02, 0.25, 0.02, 0.01, 0.035],
      reed: [1, 0.12, 0.22, 0.04, 0.09, 0.03],
      brass: [1, 0.45, 0.25, 0.12, 0.05, 0.024],
      bow: [1, 0.32, 0.15, 0.075, 0.035, 0.018],
      triangle: [1, 0, 0.111, 0, 0.04],
      square: [1, 0, 0.24, 0, 0.11, 0, 0.05],
      sawtooth: [1, 0.32, 0.18, 0.09, 0.05, 0.03],
    }[shape];
    if (partials) imag.set(partials, 1);
    else imag[1] = 1;
    cache.set(shape, ctx.createPeriodicWave(real, imag));
  }
  oscillator.setPeriodicWave(cache.get(shape));
}
