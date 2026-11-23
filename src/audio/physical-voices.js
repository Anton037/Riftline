// Original modal instruments and synthesized material transients for combat, interface and ambience.
import { SOURCE_CLIPS } from "./source-bank.js";
import { actorMaterial } from "../data/materials.js";
import { BOSS_EFFECTS } from "../data/combat-effects.js";

let bytesPromise;
const decodedByCtx = new WeakMap();
export function preloadPhysicalAudio() {
  if (!bytesPromise && typeof fetch === "function")
    bytesPromise = fetch("audio/physical-bank.wav")
      .then((r) => {
        if (!r.ok) throw new Error("Physical audio bank unavailable");
        return r.arrayBuffer();
      })
      .catch(() => {
        bytesPromise = null;
        return null;
      });
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
  pulse: {
    dur: 0.2,
    sample: "report",
    body: 192,
    air: 0.06,
    grain: 0.055,
    gain: 0.29,
    gate: 0.045,
    lowpass: 3300,
    modal: "brass",
    weaponStage: "pulse",
  },
  scatter: {
    dur: 0.38,
    sample: "shotgun",
    body: 90,
    air: 0.2,
    grain: 0.12,
    gain: 0.42,
    gate: 0.08,
    lowpass: 2900,
    modal: "wood",
    subDrop: 0.35,
    weaponStage: "scatter",
  },
  tesla: {
    dur: 0.21,
    sample: "metal",
    recordGain: 0.09,
    body: 540,
    air: 0.22,
    grain: 0.1,
    arc: 0.42,
    lowpass: 3100,
    gain: 0.28,
    gate: 0.045,
    modal: "crystal",
    weaponStage: "tesla",
  },
  chain: {
    dur: 0.15,
    sample: "soft",
    recordGain: 0,
    body: 640,
    air: 0.18,
    grain: 0.08,
    arc: 0.32,
    lowpass: 3200,
    gain: 0.17,
    gate: 0.05,
    modal: "crystal",
  },
  rail: {
    dur: 0.52,
    sample: "rifle",
    body: 78,
    air: 0.18,
    grain: 0.08,
    gain: 0.44,
    gate: 0.09,
    lowpass: 3500,
    modal: "brass",
    subDrop: 0.42,
    weaponStage: "rail",
  },
  rocket: {
    dur: 0.46,
    sample: "heavy",
    body: 86,
    air: 0.28,
    grain: 0.07,
    gain: 0.36,
    gate: 0.08,
    lowpass: 2600,
    modal: "wood",
    subDrop: 0.3,
    weaponStage: "rocket",
  },
  disc: {
    dur: 0.29,
    sample: "blade",
    body: 440,
    air: 0.08,
    grain: 0.05,
    gain: 0.24,
    gate: 0.06,
    lowpass: 4100,
    modal: "crystal",
    weaponStage: "disc",
  },
  flame: {
    dur: 0.36,
    sample: "soft",
    body: 118,
    air: 0.46,
    grain: 0.11,
    gain: 0.24,
    gate: 0.13,
    lowpass: 1850,
    hold: true,
    modal: "wood",
    weaponStage: "flame",
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
  boom: {
    dur: 0.55,
    sample: "heavy",
    body: 64,
    air: 0.3,
    grain: 0.1,
    gain: 0.42,
    gate: 0.08,
    lowpass: 2200,
    modal: "brass",
    subDrop: 0.45,
  },
  smallboom: {
    dur: 0.28,
    sample: "heavy",
    body: 168,
    air: 0.22,
    grain: 0.14,
    gain: 0.3,
    gate: 0.055,
    lowpass: 3100,
    modal: "brass",
    subDrop: 0.24,
  },
  bigkill: {
    dur: 0.65,
    sample: "plate",
    body: 112,
    air: 0.26,
    grain: 0.15,
    gain: 0.4,
    gate: 0.12,
    lowpass: 3000,
    modal: "brass",
    subDrop: 0.55,
  },
  erupt: {
    dur: 0.72,
    sample: "wood",
    body: 68,
    air: 0.48,
    grain: 0.18,
    gain: 0.38,
    gate: 0.12,
    lowpass: 1850,
    modal: "wood",
    hold: true,
    subDrop: 0.3,
  },
  bSlam: {
    dur: 0.56,
    sample: "plate",
    body: 78,
    air: 0.2,
    grain: 0.09,
    gain: 0.38,
    gate: 0.1,
    lowpass: 2400,
    modal: "brass",
    subDrop: 0.5,
  },
  thud: {
    dur: 0.42,
    sample: "wood",
    body: 72,
    air: 0.16,
    grain: 0.06,
    gain: 0.32,
    gate: 0.08,
    lowpass: 1700,
    modal: "wood",
    subDrop: 0.42,
  },
  bNova: {
    dur: 0.82,
    sample: "plate",
    body: 196,
    air: 0.24,
    grain: 0.08,
    gain: 0.36,
    gate: 0.14,
    lowpass: 3200,
    modal: "brass",
    bellToll: true,
  },
  enrage: {
    dur: 0.88,
    sample: "plate",
    body: 164,
    air: 0.24,
    grain: 0.09,
    gain: 0.36,
    gate: 0.16,
    lowpass: 2900,
    modal: "brass",
    bellToll: true,
  },
  die: {
    dur: 1.1,
    sample: "glass",
    body: 392,
    air: 0.28,
    grain: 0.18,
    gain: 0.36,
    gate: 0.3,
    lowpass: 3600,
    modal: "crystal",
    sigh: true,
  },
  windHeavy: {
    dur: 0.58,
    sample: "wood",
    body: 118,
    air: 0.32,
    grain: 0.12,
    gain: 0.25,
    gate: 0.12,
    lowpass: 1900,
    warn: true,
    modal: "wood",
    creak: true,
  },
  windSlash: {
    dur: 0.42,
    sample: "glass",
    body: 740,
    air: 0.14,
    grain: 0.06,
    gain: 0.24,
    gate: 0.1,
    lowpass: 5400,
    warn: true,
    modal: "crystal",
  },
  blinkWarn: {
    dur: 0.46,
    sample: "glass",
    body: 680,
    air: 0.18,
    grain: 0.05,
    gain: 0.23,
    gate: 0.1,
    lowpass: 5200,
    warn: true,
    modal: "crystal",
  },
  windLeap: {
    dur: 0.38,
    sample: "grass",
    body: 215,
    air: 0.22,
    grain: 0.04,
    gain: 0.22,
    gate: 0.1,
    lowpass: 2400,
    warn: true,
    modal: "wood",
  },
  lock: {
    dur: 0.34,
    sample: "metal",
    body: 540,
    air: 0.05,
    grain: 0.12,
    gain: 0.22,
    gate: 0.1,
    lowpass: 3800,
    warn: true,
    modal: "brass",
    ratchet: true,
  },
  servo: {
    dur: 0.38,
    sample: "metal",
    body: 460,
    air: 0.07,
    grain: 0.14,
    gain: 0.22,
    gate: 0.1,
    lowpass: 3500,
    warn: true,
    modal: "brass",
    ratchet: true,
  },
  fuse: {
    dur: 0.52,
    sample: "cinder",
    body: 320,
    air: 0.38,
    grain: 0.26,
    arc: 0.18,
    gain: 0.23,
    gate: 0.12,
    lowpass: 4200,
    warn: true,
  },
  beam: {
    dur: 0.72,
    sample: "glass",
    body: 580,
    air: 0.14,
    grain: 0.05,
    gain: 0.26,
    gate: 0.14,
    lowpass: 5200,
    warn: true,
    modal: "crystal",
  },
  beamSmall: {
    dur: 0.52,
    sample: "glass",
    body: 690,
    air: 0.12,
    grain: 0.04,
    gain: 0.22,
    gate: 0.12,
    lowpass: 5600,
    warn: true,
    modal: "crystal",
  },
  block: {
    dur: 0.22,
    sample: "heavy",
    body: 132,
    air: 0.05,
    grain: 0.04,
    gain: 0.24,
    gate: 0.045,
    lowpass: 1850,
    modal: "wood",
  },
  resist: {
    dur: 0.2,
    sample: "heavy",
    body: 148,
    air: 0.04,
    grain: 0.03,
    gain: 0.2,
    gate: 0.05,
    lowpass: 1700,
    modal: "wood",
  },
  guardUp: {
    dur: 0.34,
    sample: "stone",
    body: 168,
    air: 0.06,
    grain: 0.06,
    gain: 0.26,
    gate: 0.06,
    lowpass: 2200,
    modal: "wood",
  },
  plant: {
    dur: 0.28,
    sample: "stone",
    body: 142,
    air: 0.05,
    grain: 0.05,
    gain: 0.24,
    gate: 0.06,
    lowpass: 2000,
    modal: "wood",
  },
  guardBreak: {
    dur: 0.44,
    sample: "plate",
    body: 392,
    air: 0.12,
    grain: 0.18,
    gain: 0.3,
    gate: 0.08,
    lowpass: 4200,
    modal: "brass",
  },
  shield: {
    dur: 0.48,
    sample: "glass",
    body: 740,
    air: 0.12,
    grain: 0.16,
    gain: 0.28,
    gate: 0.08,
    lowpass: 5800,
    modal: "crystal",
  },
  shieldUp: {
    dur: 0.46,
    sample: "glass",
    body: 523,
    air: 0.09,
    grain: 0.02,
    gain: 0.22,
    gate: 0.1,
    lowpass: 4800,
    modal: "crystal",
    ascend: true,
  },
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
    modal: "brass",
  },
  ui: {
    dur: 0.11,
    sample: "wood",
    body: 330,
    air: 0.02,
    grain: 0.012,
    gain: 0.13,
    gate: 0.055,
    lowpass: 2500,
    modal: "wood",
  },
  reward: {
    dur: 0.52,
    sample: "glass",
    body: 659,
    air: 0.025,
    grain: 0.012,
    gain: 0.2,
    gate: 0.08,
    lowpass: 4800,
    modal: "crystal",
  },
  step: {
    dur: 0.21,
    sample: "stone",
    body: 136,
    air: 0.045,
    grain: 0.022,
    gain: 0.21,
    gate: 0.045,
    lowpass: 2200,
    modal: "wood",
  },
  sparkCourtyard: {
    dur: 0.13,
    sample: "heavy",
    body: 340,
    air: 0.03,
    grain: 0.02,
    gain: 0.14,
    gate: 0.055,
    lowpass: 3400,
    modal: "brass",
  },
  sparkShelf: {
    dur: 0.15,
    sample: "glass",
    body: 680,
    air: 0.04,
    grain: 0.03,
    gain: 0.14,
    gate: 0.055,
    lowpass: 5400,
    modal: "crystal",
  },
  sparkMarsh: {
    dur: 0.14,
    sample: "flesh",
    body: 145,
    air: 0.04,
    grain: 0.02,
    gain: 0.15,
    gate: 0.055,
    lowpass: 1900,
    modal: "wood",
  },
  sparkCore: {
    dur: 0.16,
    sample: "obsidian",
    body: 520,
    air: 0.04,
    grain: 0.02,
    gain: 0.14,
    gate: 0.055,
    lowpass: 4800,
    modal: "crystal",
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
    modal: "brass",
  },
  sparkFlats: {
    dur: 0.15,
    sample: "sand",
    body: 440,
    air: 0.05,
    grain: 0.03,
    gain: 0.14,
    gate: 0.055,
    lowpass: 4400,
    modal: "crystal",
  },
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
    modal: "brass",
  },
  propLantern: {
    dur: 0.42,
    sample: "heavy",
    body: 392,
    air: 0.06,
    grain: 0.03,
    gain: 0.24,
    gate: 0.08,
    lowpass: 3800,
    modal: "brass",
  },
  propRime: {
    dur: 0.44,
    sample: "glass",
    body: 698,
    air: 0.09,
    grain: 0.08,
    gain: 0.23,
    gate: 0.08,
    lowpass: 5800,
    modal: "crystal",
  },
  propPuffball: {
    dur: 0.36,
    sample: "wood",
    body: 196,
    air: 0.14,
    grain: 0.04,
    gain: 0.25,
    gate: 0.08,
    lowpass: 2200,
    modal: "wood",
  },
  propPrism: {
    dur: 0.46,
    sample: "obsidian",
    body: 587,
    air: 0.07,
    grain: 0.04,
    gain: 0.23,
    gate: 0.08,
    lowpass: 5200,
    modal: "crystal",
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
    modal: "brass",
    subDrop: 0.35,
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
    modal: "crystal",
  },
  dClockwork: {
    dur: 0.28,
    sample: "plate",
    body: 294,
    air: 0.06,
    grain: 0.08,
    gain: 0.21,
    gate: 0.04,
    lowpass: 3200,
    modal: "brass",
  },
  dConstruct: {
    dur: 0.34,
    sample: "obsidian",
    body: 440,
    air: 0.08,
    grain: 0.04,
    gain: 0.2,
    gate: 0.04,
    lowpass: 4400,
    modal: "crystal",
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
  inlayRelease: {
    dur: 0.62,
    sample: "plate",
    body: 248,
    air: 0.08,
    grain: 0.03,
    gain: 0.36,
    gate: 0.05,
    modal: "brass",
    bellToll: true,
  },
  buzz: { dur: 0.65, model: "buzz", body: 60, gain: 0.14, gate: 0 },
  superCrit: {
    dur: 0.28,
    sample: "plate",
    body: 587,
    air: 0.08,
    grain: 0.06,
    gain: 0.31,
    gate: 0.04,
    lowpass: 6200,
    modal: "crystal",
    critPing: true,
    bellToll: true,
  },
  wave: {
    dur: 0.34,
    sample: "plate",
    body: 210,
    air: 0.1,
    grain: 0.03,
    gain: 0.22,
    gate: 0.15,
    lowpass: 2800,
    modal: "brass",
  },
  spawn: {
    dur: 0.22,
    sample: "soft",
    body: 280,
    air: 0.24,
    grain: 0.03,
    gain: 0.15,
    gate: 0.06,
    lowpass: 3400,
    modal: "crystal",
  },
  reroll: {
    dur: 0.18,
    sample: "grass",
    body: 310,
    air: 0.18,
    grain: 0.08,
    gain: 0.18,
    gate: 0.06,
    lowpass: 3200,
    modal: "wood",
  },
  banish: {
    dur: 0.24,
    sample: "heavy",
    body: 164,
    air: 0.08,
    grain: 0.04,
    gain: 0.22,
    gate: 0.06,
    lowpass: 2200,
    modal: "wood",
    subDrop: 0.22,
  },
  comboEnd: {
    dur: 0.22,
    sample: "wood",
    body: 175,
    air: 0.06,
    grain: 0.02,
    gain: 0.15,
    gate: 0.12,
    lowpass: 1900,
    modal: "wood",
    sigh: true,
  },
  bossIntro: {
    dur: 0.88,
    sample: "plate",
    body: 132,
    air: 0.22,
    grain: 0.06,
    gain: 0.36,
    gate: 0.2,
    lowpass: 2800,
    modal: "brass",
    bellToll: true,
  },
  bossDown: {
    dur: 0.92,
    sample: "plate",
    body: 92,
    air: 0.28,
    grain: 0.14,
    gain: 0.38,
    gate: 0.2,
    lowpass: 2900,
    modal: "brass",
    subDrop: 0.55,
  },
  bcCage: {
    dur: 0.32,
    sample: "plate",
    body: 410,
    air: 0.08,
    grain: 0.05,
    gain: 0.24,
    gate: 0.06,
    lowpass: 4200,
    modal: "brass",
  },
  bcHatch: {
    dur: 0.28,
    sample: "flesh",
    body: 155,
    air: 0.16,
    grain: 0.06,
    gain: 0.22,
    gate: 0.06,
    lowpass: 2200,
    modal: "wood",
  },
  bcBurst: {
    dur: 0.32,
    sample: "flesh",
    body: 128,
    air: 0.22,
    grain: 0.1,
    gain: 0.26,
    gate: 0.06,
    lowpass: 2400,
    modal: "wood",
  },
  bcImplode: {
    dur: 0.44,
    sample: "heavy",
    body: 54,
    air: 0.32,
    grain: 0.1,
    arc: 0.12,
    gain: 0.32,
    gate: 0.08,
    lowpass: 2200,
    modal: "brass",
    subDrop: 0.42,
  },
  milestone: {
    dur: 0.48,
    sample: "glass",
    body: 587,
    air: 0.04,
    grain: 0.015,
    gain: 0.22,
    gate: 0.12,
    lowpass: 5200,
    modal: "crystal",
    ascend: true,
  },
  equip: {
    dur: 0.16,
    sample: "metal",
    body: 380,
    air: 0.04,
    grain: 0.03,
    gain: 0.19,
    gate: 0.06,
    lowpass: 3600,
    modal: "brass",
  },
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
    const base = P[family];
    const isCrit = id === "crit";
    const out = {
      ...base,
      family,
      gain: base.gain * (isCrit ? 1.32 : 1),
      body: base.body * (isCrit ? 1.24 : 1),
      lowpass: Math.min(7200, (base.lowpass || 2800) * (isCrit ? 1.38 : 1)),
      ...(isCrit ? { critPing: true } : {}),
    };
    const w = arg?.w;
    if (w === "tesla") out.arc = Math.max(out.arc || 0, 0.16);
    else if (w === "flame") out.lowpass = Math.max(1200, out.lowpass * 0.84);
    else if (w === "rail" || w === "disc") out.body *= 1.12;
    else if (w === "rocket" || w === "scatter") out.body *= 0.88;
    return out;
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
      family: "bOverdrive",
      sample: "plate",
      body: 220,
      dur: 0.84,
      air: 0.18,
      grain: 0.07,
      gain: 0.32,
      warn: true,
      modal: "brass",
      bellToll: true,
    });
  if (id === "bRing")
    Object.assign(p, P.armor, {
      family: "armor",
      sample: "plate",
      body: 320,
      dur: 0.48,
      air: 0.1,
      gain: 0.27,
      modal: "brass",
    });
  if (id === "bSummon")
    Object.assign(p, P.organic, { family: "organic", sample: "flesh", body: 135, dur: 0.52, air: 0.18, gain: 0.26 });
  if (id === "bLance")
    Object.assign(p, P.glass, {
      family: "glass",
      sample: "glass",
      body: 640,
      dur: 0.44,
      air: 0.14,
      gain: 0.26,
      modal: "crystal",
    });
  if (id === "bRain")
    Object.assign(p, P.boom, {
      family: "boom",
      sample: "heavy",
      body: 72,
      dur: 0.58,
      air: 0.28,
      gain: 0.32,
      subDrop: 0.4,
    });
  if (id === "champion")
    Object.assign(p, P.reward, {
      family: "reward",
      sample: "plate",
      body: 360,
      dur: 0.48,
      air: 0.07,
      gain: 0.25,
      modal: "brass",
    });
  if (id === "mutator")
    Object.assign(p, P.reward, {
      family: "reward",
      sample: "obsidian",
      body: 420,
      dur: 0.56,
      air: 0.12,
      gain: 0.26,
      modal: "crystal",
    });
  const source = typeof arg === "string" ? arg : arg?.src,
    identity = BOSS_EFFECTS[source];
  if (!place && identity && /^(b[A-Z]|boss|enrage|phase|bigkill|blink|thud|lob|hatch)/.test(id)) {
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

const MODAL_RATIOS = {
  brass: [
    [0.5, 0.14, 2.2],
    [1.0, 0.18, 3.6],
    [1.2, 0.095, 4.8],
    [1.5, 0.078, 6.2],
    [2.0, 0.056, 8.0],
    [2.66, 0.036, 11.2],
  ],
  crystal: [
    [1.0, 0.17, 3.2],
    [2.32, 0.095, 5.1],
    [3.86, 0.054, 7.6],
    [5.41, 0.028, 10.8],
  ],
  wood: [
    [1.0, 0.21, 7.5],
    [3.98, 0.068, 16.5],
  ],
};

function resolveModalKind(p) {
  if (p.modal && MODAL_RATIOS[p.modal]) return p.modal;
  if (p.sample === "glass" || p.sample === "ice" || p.sample === "obsidian") return "crystal";
  if (p.sample === "plate" || p.sample === "metal" || p.sample === "heavy") return "brass";
  return "wood";
}

const BELL_HUMANIZE_RE = /bell|chime|reward|prop|inlay|overdrive|nova|enrage|cleared|victory|evolve|shield|warn|beam/i;
const FAST_HUMANIZE_RE =
  /pulse|scatter|tesla|rail|rocket|disc|flame|hit|crit|step|land|eshot|snipe|wing|lob|chain|spark/i;

export class PhysicalVoices {
  constructor(ctx, { decode = true } = {}) {
    this.ctx = ctx;
    this.buffers = new Map();
    this.recentTriggers = new Map();
    this.flamePhase = 0;
    this.serial = 0;
    this.bank = null;
    this.ready = decode
      ? Promise.resolve(preloadPhysicalAudio()).then(async (bytes) => {
          if (!bytes) return false;
          let p = decodedByCtx.get(ctx);
          if (!p) {
            p = ctx.decodeAudioData(bytes.slice(0)).catch(() => {
              decodedByCtx.delete(ctx);
              return null;
            });
            decodedByCtx.set(ctx, p);
          }
          this.bank = await p;
          this.buffers.clear();
          return !!this.bank;
        })
      : Promise.resolve(false);
  }
  buffer(p, variant) {
    const modal = resolveModalKind(p);
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
      modal,
      p.weaponStage || "",
      p.bellToll ? 1 : 0,
      p.ratchet ? 1 : 0,
      p.sigh ? 1 : 0,
      p.ascend ? 1 : 0,
      p.creak ? 1 : 0,
      p.critPing ? 1 : 0,
      p.subDrop || 0,
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
      phase = 0,
      subPhase = 0;
    let recordedLow = 0;
    const recordedAlpha = p.lowpass ? 1 - Math.exp((-Math.PI * 2 * p.lowpass) / rate) : 1;
    const center = p.model === "air" ? 0.055 : p.family === "tesla" ? 0.48 : p.family === "flame" ? 0.16 : 0.31;
    const mechanical = p.model === "buzz";
    const ceramic = p.model === "ceramic";
    const liquid = p.model === "rain" || p.model === "water";
    const airy = p.model === "air";
    const partials = MODAL_RATIOS[modal] || MODAL_RATIOS.wood;
    const isFlame = p.weaponStage === "flame";
    const isWeapon = !!p.weaponStage && !isFlame;
    const isWood = modal === "wood";
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
      const attackDur = isFlame ? 0.058 : p.warn ? 0.04 : p.hold ? 0.024 : 0.003;
      const tailDur = isFlame ? 0.075 : 0.026;
      const attack = Math.min(1, t / attackDur);
      const tail = Math.min(1, (p.dur - t) / tailDur);

      let envelope;
      if (isFlame) {
        // Smooth Hann-shaped kiln-bellows breath so overlapping grains crossfade seamlessly
        envelope = Math.sin(Math.PI * x) ** 1.35 * (0.82 + 0.18 * Math.sin(t * 23 + variant * 1.9));
      } else if (p.ratchet) {
        // Clockwork escapement ratchet ticks: crisp accelerating pulses
        const tickRate = 10 + 18 * x;
        const tick = Math.max(0, Math.sin(t * tickRate * Math.PI * 2)) ** 6;
        envelope = (0.18 + 0.82 * tick) * (0.35 + 0.65 * x);
      } else if (p.creak) {
        // Creaking iron-bellows draw: rising tension with slow timber/iron stick-slip modulation
        const slip = 0.55 + 0.45 * Math.sin(t * (14 + 22 * x) + Math.sin(t * 9));
        envelope = (0.28 + 0.72 * x) * slip;
      } else if (p.warn) {
        envelope = (0.24 + x * 0.76) * (0.68 + 0.32 * Math.sin(t * (8.5 + variant) * Math.PI * 2) ** 2);
      } else if (p.bellToll) {
        envelope = Math.exp(-t / (p.dur * 0.46));
      } else if (p.sigh) {
        envelope = Math.exp(-t / (p.dur * 0.42)) * (0.84 + 0.16 * Math.cos(t * 7));
      } else if (p.ascend) {
        envelope = Math.sin(Math.PI * Math.min(1, x * 1.05)) ** 0.75 * (0.45 + 0.55 * x);
      } else if (p.hold) {
        envelope = Math.sin(Math.PI * x) ** 0.55;
      } else {
        envelope = Math.exp(-t / (p.dur * 0.25));
      }

      let sweep;
      if (p.sigh) {
        // Lantern-shatter + downward resonant sigh
        sweep = 1.18 * Math.exp(-x * 0.88) + 0.34;
      } else if (p.ascend) {
        // Ascending glass-bell hum
        sweep = 0.78 + 0.46 * x;
      } else if (p.creak) {
        sweep = 0.68 + 0.42 * x + 0.08 * Math.sin(t * 27);
      } else if (p.warn) {
        sweep = 0.76 + 0.4 * x + Math.floor(x * 4) * 0.03;
      } else if (isWood) {
        // Woody bar / marimba / bog fast pitch-drop impact envelope
        sweep = 0.94 + 0.38 * Math.exp(-t * 55);
      } else {
        sweep = 0.94 + 0.22 * Math.exp(-t * 32);
      }

      phase += (Math.PI * 2 * p.body * sweep) / rate;
      let modes = 0;
      for (let m = 0; m < partials.length; m++) {
        const [ratio, weight, decay] = partials[m];
        const modeDecay = p.warn || p.hold || p.ascend ? 1 : Math.exp(-t * decay * (p.bellToll ? 0.52 : 0.85));
        modes += Math.sin(phase * ratio + m * 0.41) * weight * modeDecay;
      }
      if (p.critPing) {
        // Bright harmonic crunch overtone (distinct critical bite without breaking target material identity)
        const pingF = Math.min(3400, Math.max(920, p.body * 3.0));
        modes +=
          (Math.sin(t * Math.PI * 2 * pingF) * 0.22 + Math.sin(t * Math.PI * 2 * pingF * 1.498) * 0.14) *
          Math.exp(-t * 26);
      }
      if (p.bellToll) {
        // Deep bronze sub-swell under the bell partials
        subPhase += (Math.PI * 2 * Math.max(46, p.body * 0.5) * (0.96 + 0.06 * Math.sin(t * 6))) / rate;
        modes += Math.sin(subPhase) * 0.2 * Math.sin(Math.PI * Math.min(1, x * 1.1));
      } else if (p.subDrop) {
        const subF = Math.max(38, p.body * (0.65 + 0.55 * Math.exp(-t * 24)));
        subPhase += (Math.PI * 2 * subF) / rate;
        modes += Math.sin(subPhase) * p.subDrop * 0.34 * Math.exp(-t / (p.dur * 0.32));
      }

      // 3-stage acoustic envelope for all 7 player weapons:
      // Stage 1 (0..10ms): crisp transient attack snap; Stage 2: resonant material body; Stage 3: mechanical tail
      let weaponLayer = 0;
      if (isWeapon) {
        const snapEnv = Math.exp(-t / 0.008);
        const snap = (noise - low) * 0.24 * snapEnv;
        const tailStart = p.dur * 0.42;
        const mechT = Math.max(0, t - tailStart);
        const mechEnv = t > tailStart ? Math.exp(-mechT / (p.dur * 0.14)) * Math.min(1, mechT / 0.006) : 0;
        const mechTone =
          p.weaponStage === "disc"
            ? Math.sin(phase * 2.32) * 0.11 * mechEnv
            : p.weaponStage === "rocket"
              ? (band - low) * 0.22 * mechEnv
              : Math.sin(t * Math.PI * 2 * (p.body * 2.1 + 140)) * 0.08 * mechEnv;
        weaponLayer = snap + mechTone;
      }

      const airEnv = isFlame ? envelope : p.warn ? envelope : Math.exp(-t / (p.dur * 0.38));
      const air = (band - low) * p.air * airEnv;
      const emberCrackle = isFlame
        ? noise * (Math.sin(t * 487 + variant * 2.7) > 0.86 ? 1 : 0.06) * p.grain * envelope
        : noise * (Math.sin(t * 611 + variant) > 0.7 ? 1 : 0.1) * p.grain * Math.exp(-t * (p.sigh ? 6 : 22));

      let recorded = 0;
      if (raw && region) {
        const position = (region.start + t * (1 + (variant - 1) * 0.035)) * sr;
        const at = Math.floor(position),
          f = position - at;
        if (t * (1 + (variant - 1) * 0.035) < region.duration && at + 1 < raw.length)
          recorded = (raw[at] * (1 - f) + raw[at + 1] * f) * (p.recordGain ?? (p.warn || p.hold ? 0.11 : 0.64));
      }
      recordedLow += recordedAlpha * (recorded - recordedLow);
      const arc = p.arc
        ? (noise - band) *
          p.arc *
          (0.2 + 0.8 * Math.max(0, Math.sin(t * 335 + 2 * Math.sin(t * 71))) ** 12) *
          Math.exp(-t / (p.dur * 0.32))
        : 0;
      data[i] = (recordedLow + modes * envelope + weaponLayer + air + emberCrackle + arc) * attack * tail;
    }
    this.buffers.set(key, b);
    if (this.buffers.size > 128) this.buffers.delete(this.buffers.keys().next().value);
    return b;
  }
  source(engine, id, p, { at = 0, gain = 1, pan, ambience = false } = {}) {
    const start = engine.ctx.currentTime + at,
      end = start + p.dur + 0.025;
    const voice = engine.claim(ambience ? 0.5 : engine.curPri, start, end);
    if (!voice || engine.budgetOnly) return;

    // Rapid-fire anti-fatigue ducking when the same cue repeats within 120ms
    let fatigueScale = 1;
    if (!ambience && id) {
      const prev = this.recentTriggers.get(id);
      if (prev && start - prev.t < 0.12) {
        prev.count = Math.min(6, prev.count + 1);
        prev.t = start;
        fatigueScale = Math.max(0.62, 1 - prev.count * 0.075);
      } else {
        this.recentTriggers.set(id, { t: start, count: 0 });
        if (this.recentTriggers.size > 64) {
          this.recentTriggers.delete(this.recentTriggers.keys().next().value);
        }
      }
    }

    // Per-trigger organic humanization: detune (±35..±65 cents for shots/hits/steps, ±18 cents for bells) & ±1.2 dB gain
    const gainJitter = ambience ? 1 : 10 ** (((Math.random() * 2 - 1) * 1.2) / 20);
    const detuneRange = ambience
      ? 10
      : BELL_HUMANIZE_RE.test(id || p.family)
        ? 18
        : FAST_HUMANIZE_RE.test(id || p.family)
          ? 52
          : 38;
    const detuneCents = (Math.random() * 2 - 1) * detuneRange;

    const src = this.ctx.createBufferSource(),
      amp = this.ctx.createGain(),
      atten = ambience ? 1 : (engine.curAtten ?? 1),
      distFrac = ambience || p.warn ? 0 : (engine.curDistFrac ?? 0),
      level = p.gain * gain * atten * fatigueScale * gainJitter;
    const variant = (this.serial++ + ((Math.random() * 3) | 0)) % 3;
    src.buffer = this.buffer(p, variant);
    if (src.detune) src.detune.value = detuneCents;
    voice.node = src;
    voice.amp = amp;
    amp.gain.setValueAtTime(level, start);
    amp.gain.setValueAtTime(level, start + Math.max(0.001, p.dur - 0.02));
    amp.gain.linearRampToValueAtTime(0, start + p.dur);

    // Spatial distance high-frequency attenuation: distant cues soften organically into the room
    let out = src;
    if (!ambience && distFrac > 0.15 && typeof this.ctx.createBiquadFilter === "function") {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      const cutoff = Math.max(1900, 14000 * Math.pow(0.14, distFrac));
      lp.frequency.setValueAtTime(cutoff, start);
      lp.Q.value = 0.65;
      out.connect(lp);
      voice.filter = lp;
      out = lp;
    }
    out.connect(amp);
    const baseRev = ambience ? 0.24 : p.warn ? 0.04 : 0.07 + distFrac * 0.17;
    engine.route(
      amp,
      {
        ...(ambience ? { dest: engine.ambBus } : {}),
        pan,
        rev: Math.max(engine.curRev || 0, baseRev),
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
    if (id === "flame") {
      // Smooth cross-faded kiln-bellows draft + soft organic ember pop (avoids 15/sec clip machine-gunning)
      this.source(engine, id, p, { gain: arg?.heavy ? 1.1 : 0.92 });
      if ((this.flamePhase++ & 1) === 0) {
        this.source(
          engine,
          "flameEmber",
          { dur: 0.14, sample: "cinder", body: 380, air: 0.12, grain: 0.22, gain: 0.1, lowpass: 3400, modal: "wood" },
          { at: 0.06, gain: 0.85 },
        );
      }
      return;
    }
    this.source(engine, id, p, arg?.heavy ? { gain: 1.18 } : undefined);
    // Overdrive 4th-shot heavy brass weight accent
    if (arg?.heavy) {
      this.source(
        engine,
        "heavyAccent",
        {
          dur: 0.16,
          sample: "plate",
          body: 112,
          air: 0.08,
          grain: 0.04,
          gain: 0.14,
          lowpass: 1900,
          modal: "brass",
          subDrop: 0.32,
        },
        { at: 0 },
      );
    }
    // Weapon mechanical tail layer for distinct tactile foley across the 7 weapons
    if (id === "scatter")
      this.source(engine, "chamber", { ...P.ui, sample: "metal", body: 280, gain: 0.11 }, { at: 0.13 });
    else if (id === "rail")
      this.source(engine, "chamber", { ...P.ui, sample: "plate", body: 360, gain: 0.12 }, { at: 0.18 });
    else if (id === "rocket")
      this.source(
        engine,
        "ventTail",
        { dur: 0.18, sample: "soft", body: 140, air: 0.26, grain: 0.05, gain: 0.1, lowpass: 1800, modal: "wood" },
        { at: 0.11 },
      );
    else if (id === "pulse")
      this.source(
        engine,
        "escapement",
        { dur: 0.065, sample: "metal", body: 610, air: 0.02, grain: 0.02, gain: 0.065, lowpass: 3600, modal: "brass" },
        { at: 0.055 },
      );
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
