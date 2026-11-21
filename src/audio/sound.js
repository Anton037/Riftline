// Physical sound voices, shared spatial mix and biome music scheduling.

import { PhysicalVoices, preloadPhysicalAudio, setNaturalWave } from "./physical-voices.js";
import { hookLog as logError } from "../core/run-hooks.js";
import { BOSS_EFFECTS, WEAPON_EFFECTS, BEAM_EFFECTS, shotVoiceFor, attackSurface } from "../data/combat-effects.js";
import { upgradesById } from "../data/upgrades.js";
import { PLACE, PLACE_IDS, placeTick } from "./place.js";
import {
  musicImpact,
  musicResolve,
  musicTrack,
  playScore,
  scoreBed,
  scoreBiomes,
  scoreOrigin,
  scoreScaleMidi,
} from "./score.js";

// Every supported weapon has an explicit sound identity.
const RL_SFX_VOICES = Object.keys(WEAPON_EFFECTS);
const rlShotSfx = (id) => WEAPON_EFFECTS[id]?.shot || "pulse";
const RL_BIOME_SPARK = {
  courtyard: "sparkCourtyard",
  shelf: "sparkShelf",
  marsh: "sparkMarsh",
  core: "sparkCore",
  caldera: "sparkCaldera",
  flats: "sparkFlats",
};
const RL_PROP_VOICE = {
  lantern: "propLantern",
  rime: "propRime",
  puffball: "propPuffball",
  prism: "propPrism",
  crucible: "propCrucible",
  sunglass: "propSunglass",
};
/* 2.7.0: each of the 25 enemy types dies with a voice of its family. 5.0.0: eleven tactile families so
 clockwork kettle-kin (dClockwork) and arcane constructs (dConstruct) stand apart from armour, flesh,
 electric drones and ghosts. Bosses and champions keep "bigkill". */
const RL_DEATH_FAMILY = {
  swarmer: "dPop",
  mite: "dPop",
  splitter: "dSquelch",
  hive: "dSquelch",
  leaper: "dSquelch",
  mender: "dSquelch",
  brute: "dArmor",
  striker: "dArmor",
  bulwark: "dArmor",
  driller: "dArmor",
  mortar: "dArmor",
  drone: "dZap",
  sentinel: "dConstruct",
  turret: "dZap",
  phantom: "dGhost",
  weaver: "dGhost",
  grunt: "dClang",
  gunner: "dClang",
  sapper: "dRattle",
  bomber: "dClockwork",
  charger: "dClockwork",
  carrier: "dSquelch",
  minebot: "dClockwork",
  sniper: "dClang",
  beacon: "dConstruct",
};
/* wind-up voices of the "charge" event (enemy types and the bosses that charge) */
const RL_CHARGE_VOICE = {
  brute: "windHeavy",
  charger: "windWhine",
  striker: "windSlash",
  driller: "windDrill",
  leaper: "windLeap",
  bellkeeper: "bWind",
  prism: "bWind",
  tyrant: "bWind",
};
/* the "edash" event: the lunge itself */
const RL_DASH_VOICE = { charger: "ram", striker: "ram", driller: "ramDrill", phantom: "blink" };
/* boss attack telegraphs (event "bossAtk"); null: another event of the same attack already sounds
 (charge, beamWarn, blinkWarn, lob, erupt, thud) */
const RL_BOSS_ATK = {
  charge: null,
  ring: "bRing",
  stomp: "bSlam",
  summon: "bSummon",
  spiral: "bRing",
  burst: "bRing",
  eggs: "bSummon",
  frostbeam: null,
  teleport: null,
  frostnova: "bNova",
  icelances: "bLance",
  glacier: "bSlam",
  iceshards: "bLance",
  cross: "bRing",
  rain: "bRain",
  // 3.49.0: the Ash Tyrant's attacks (the cinder fan's eshots sound themselves; the charge and the
  // magma bombs are covered by their own events)
  barrage: null,
  firestorm: "bSummon",
  // 3.56.0: the Glasswyrm's attacks (the rise's and mirage's blinkWarn/blink and thud sound
  // themselves, the lance's beamWarn does; the shard fans get the lance voice)
  rise: null,
  shards: "bLance",
  sunlance: null,
  mirage: null,
  // 3.3.0: the Overdrive attacks (they also sound the Overdrive alarm, bOverdrive)
  sealgrid: "bLance",
  whiteout: "bNova",
  plague: "bSummon",
  collapse: "bRain",
  noon: "bRain",
};
// 3.33.0: the warning voice of a beam by its skin (the rest keep "beam" / "beamSmall")
const BEAM_VOICE = Object.fromEntries(Object.entries(BEAM_EFFECTS).map(([id, effect]) => [id, effect.warning]));
const RL_OVERDRIVE = new Set(["sealgrid", "whiteout", "plague", "collapse", "firestorm", "noon"]);
const BOSS_WARNING_VOICES = new Set(Object.values(RL_BOSS_ATK).filter(Boolean));
/* 3.10.0: the voice of the blast of an attack zone, by its kind and, where the kind is shared, its maker (the same
   choice as the look in render/attacks-view.js); null: the generic explosion ("boom"). 3.32.0: a blast that chills (a
   Frost mortar's shell) cracks like ice whatever its kind */
function attackVoice(kind, src, biome, chill) {
  if (kind === "shorted" && !chill) return "aShort";
  if (kind === "volatile" && !chill) return null;
  return (
    {
      crack: "aQuake",
      lavaCrack: "aLava",
      molten: "aLava",
      frost: "aIce",
      acid: "aAcid",
      rift: "aRift",
      burn: "aFire",
      glass: "aGlass",
    }[attackSurface(kind, src, biome, chill)] || null
  );
}
/* 2.9.0: how far the music dips for the big hits (gain factor 1 - x, about 100 ms; the music goes on) */
const MUSIC_DUCK = {
    nova: 0.15,
    die: 0.15,
    boom: 0.1,
    surge: 0.1,
    bigkill: 0.12,
    hurt: 0.1,
    bossDown: 0.15,
    enrage: 0.12,
    phase: 0.1,
    boss: 0.1,
    bossIntro: 0.12,
    mutator: 0.12,
    bOverdrive: 0.1,
    evolve: 0.1,
    aQuake: 0.1,
    aRift: 0.1,
    aLava: 0.08,
    aIce: 0.08,
    aGlass: 0.08,
    tsPyro: 0.08,
    tsSun: 0.08,
    tsGlass: 0.08,
    bcShatter: 0.06,
    guardBreak: 0.08,
    thud: 0.08,
    singCollapse: 0.1,
    bcImplode: 0.1,
    tsRift: 0.08,
    bSlam: 0.08,
    rail: 0.06,
    scatter: 0.05,
    rocket: 0.05,
    tribute: 0.08,
  },
  /* 3.2.0: the room of the big sounds (send level to the sound reverb); its size follows the biome (SFX_ROOM_BIOME).
     The trap strikes stay dry: they have to be told apart from the blasts at once. */
  SFX_ROOM = {
    boom: 0.3,
    surge: 0.3,
    singCollapse: 0.35,
    singPull: 0.25,
    bcImplode: 0.3,
    bcCage: 0.15,
    bcShatter: 0.15,
    nova: 0.3,
    bigkill: 0.35,
    die: 0.3,
    bossIntro: 0.35,
    bossDown: 0.4,
    bSlam: 0.3,
    enrage: 0.3,
    phase: 0.25,
    rocket: 0.15,
    rail: 0.15,
    thud: 0.25,
    evolve: 0.3,
    victory: 0.3,
    mutator: 0.35,
    bOverdrive: 0.3,
    aQuake: 0.3,
    aLava: 0.25,
    aIce: 0.35,
    aAcid: 0.15,
    aRift: 0.35,
    aGlass: 0.28,
    aFire: 0.15,
    aShort: 0.2,
    propLantern: 0.22,
    propRime: 0.3,
    propPuffball: 0.2,
    propPrism: 0.32,
    propCrucible: 0.28,
    propSunglass: 0.26,
  },
  /* how much room each biome gives the sounds: the Aurora Shelf and the Shattered Core are vast, the Glowmarsh damp;
     3.49.0: the Ashfall Caldera is a crater bowl (rock all around) */
  SFX_ROOM_BIOME = { courtyard: 0.28, shelf: 0.5, marsh: 0.2, core: 0.55, caldera: 0.32, flats: 0.3 },
  /* the open "ah" of the choir: band-passes on its formants (frequency, Q, level) and a little of the voice */
  CHOIR_VOWEL = [
    [760, 5, 1],
    [1180, 7, 0.6],
    [2700, 9, 0.18],
    [0, 0.7, 0.12],
  ],
  AMBIENCE_LEVEL = { duskfall: 0.032, whiteout: 0.048, bloom: 0.034, riftstorm: 0.032, ashfall: 0.04 },
  ROOM_TONE_LEVEL = { courtyard: 0.024, shelf: 0.032, marsh: 0.024, core: 0.024, caldera: 0.026, flats: 0.024 },
  /* 3.43.0: the event beds gather and pass instead of snapping on and off - a storm builds over about
     three seconds and dies away over about four, while the room tone stays underneath. */
  BED_ATTACK = { duskfall: 0.6, whiteout: 1.2, bloom: 0.8, riftstorm: 1.2, ashfall: 1.0 },
  BED_RELEASE = { duskfall: 0.5, whiteout: 1.4, bloom: 0.7, riftstorm: 1.1, ashfall: 0.9 },
  // 3.9.0: the default of the Ambience slider; at it the atmospheres of the music play at the level they had before
  AMB_REF = 0.8,
  MUSIC_SCALE = 0.3,
  MAX_VOICES = 24,
  // 2.8.2: the music has its own budget; shots and other sounds can no longer take notes away from it
  // 3.2.0: 36 (was 20): the boss tracks double-track their guitars (two amps) and play blast beats; 3.5.0: 44, they
  // also carry the motif and the pad of the calm theme
  MAX_MUSIC_VOICES = 44,
  MUSIC_RESERVE = 8,
  // 3.18.1: how long the notes of the old track take to fade out when the track changes (SoundEngine.quietOld)
  QUIET_FADE = 0.25,
  /* sounds that are never dropped in favour of others when the voice limit is reached */
  KEY_SOUNDS = new Set([
    "mutator",
    "surge",
    "bOverdrive",
    "hurt",
    "die",
    "victory",
    "boss",
    "bossIntro",
    "bossDown",
    "enrage",
    "phase",
    "nova",
    "guardBreak",
    "cleared",
    "bossCleared",
    "evolve",
    "bigkill",
    "heart",
    "pick",
  ]);
/* 3.0.0: the sound of each trap skin: charge (floor), hum (beam), fuse (mine) when it warns, and the strike */
const RL_TRAP_SOUND = {
  plate: { warn: "tcPlate", fire: "tsPlate" },
  icespike: { warn: "tcIce", fire: "tsIce" },
  geyser: { warn: "tcGeyser", fire: "tsGeyser" },
  riftburst: { warn: "tcRift", fire: "tsRift" },
  laser: { warn: "tbLaser" },
  rift: { warn: "tbRift" },
  mine: { warn: "tmMine", fire: "tsMine" },
  frost: { warn: "tmFrost", fire: "tsFrost" },
  spore: { warn: "tmSpore", fire: "tsSpore" },
  riftmine: { warn: "tmRift", fire: "tsRiftMine" },
  magma: { warn: "tbFlame" },
  embermine: { warn: "tmEmber", fire: "tsEmber" },
  glassmine: { warn: "tmGlass", fire: "tsGlass" },
  // 3.47.0: the fumarole: pressure hisses through basalt before molten rock erupts
  pyro: { warn: "tcPyro", fire: "tsPyro" },
  // 3.53.0: the Flats' sunspike: glass creaks as the pressure builds, then the sheet bursts
  sunspike: { warn: "tcSun", fire: "tsSun" },
};
// Threat cues keep their existing timbres and a voice when routine combat is busy.
const THREAT_WARNING_VOICES = new Set([
  "lock",
  "fuse",
  ...Object.values(RL_CHARGE_VOICE),
  "servo",
  "beam",
  "beamSmall",
  ...Object.values(BEAM_VOICE),
  ...Object.values(RL_TRAP_SOUND).map((voice) => voice.warn),
]);
/* a small seeded random generator (0..1) for the offline test renders */
function makeSeeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
/* 3.2.0: the impulse of the music reverb: stereo noise that decays exponentially and gets darker as it decays */
const impulseCache = Object.create(null);
function roomImpulse(ctx, seconds) {
  // the same impulse serves every context of a sample rate (the tests build hundreds of engines)
  let key = ctx.sampleRate + ":" + seconds;
  if (impulseCache[key]) return impulseCache[key];
  // 3.18.1: its own seeded noise (it was made from Math.random at the first use, so every run had another room and the
  // numbers of the deep test moved a little from run to run); the same kind of noise, the same for everyone
  let len = Math.round(ctx.sampleRate * seconds),
    random = makeSeeded(0x2b00 + Math.round(seconds * 100)),
    buf = (impulseCache[key] = ctx.createBuffer(2, len, ctx.sampleRate));
  for (let ch = 0; ch < 2; ch++) {
    let data = buf.getChannelData(ch),
      lp = 0;
    for (let i = 0; i < len; i++) {
      let t = i / len,
        a = 0.55 + 0.42 * t;
      lp = lp * a + (random() * 2 - 1) * (1 - a);
      data[i] = lp * Math.pow(1 - t, 2.4) * (i < 90 ? i / 90 : 1) * 2.2;
    }
  }
  return buf;
}
/* 3.7.0: six seconds of pink (-3 dB per octave, Paul Kellet's filter) or brown (-6 dB per octave) noise, made once
   per sample rate. The music and its atmospheres use them instead of the white noise of the sounds: they are soft
   rather than hissy, and six seconds never sound like a loop (the one second of white noise did, as a faint pulse).
   The end flows into the start (a crossfade over 50 ms); the level is that of the white noise (rms about 0.58), so a
   low filter lets far more of brown and pink noise through than of white (the levels below were measured for that). */
const colorCache = Object.create(null);
function colorNoise(ctx, color) {
  const key = color + ":" + ctx.sampleRate;
  if (colorCache[key]) return colorCache[key];
  // 3.18.1: seeded for the same reason as the room (roomImpulse)
  const len = Math.round(ctx.sampleRate * 6),
    fadeN = Math.round(ctx.sampleRate * 0.05),
    raw = new Float32Array(len + fadeN),
    random = makeSeeded(color === "brown" ? 0xb2057 : 0x91c4);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0,
    sum = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = random() * 2 - 1;
    if (color === "brown") {
      // leaky integration: the leak keeps it free of drift (no DC)
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  }
  const buf = (colorCache[key] = ctx.createBuffer(1, len, ctx.sampleRate)),
    data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // an equal-power crossfade (two unrelated stretches of noise: a linear one would dip by 3 dB at every pass)
    const t = i < fadeN ? i / fadeN : 1;
    data[i] = raw[i] * Math.sqrt(t) + (i < fadeN ? raw[len + i] * Math.sqrt(1 - t) : 0);
    sum += data[i] * data[i];
  }
  const gain = 0.58 / Math.sqrt(sum / len || 1);
  for (let i = 0; i < len; i++) data[i] *= gain;
  return buf;
}
/* soft clipper curve: linear up to 0.7, then a smooth knee towards 0.98 (input is clamped to +-1, so
 the output never exceeds 0.93) */
function softClipCurve() {
  let n = 2049,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1,
      a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return curve;
}

const SoundEngine = class {
  constructor() {
    preloadPhysicalAudio();
    this.ctx = null;
    this.ok = typeof window < "u" && !!(window.AudioContext || window.webkitAudioContext);
    this.sfxVol = 0.8;
    this.musVol = 0.45;
    // 3.9.0: the sounds of the place have their own volume and bus (Settings > Ambience): the event beds, the hazards
    // and the far sounds of the biome (audio/place.js); the atmospheres of the music follow it too (atmos)
    this.ambVol = AMB_REF;
    this.ambBus = null;
    this.atmos = null;
    this.atmosPump = null;
    this.curBus = null;
    this.placeSt = null;
    this.last = Object.create(null);
    this.mode = "off";
    this.biome = "courtyard";
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.combo = 0;
    this.comboT = 0;
    this.intensity = 0;
    this.want = 0;
    this.cycle = 0;
    // 2.7.0: voice registry (limit), boss music mix, engine hum and event ambience
    this.voices = [];
    this.musicVoiceList = [];
    this.curPri = 1;
    this.simT = null;
    this.maxEnd = 0;
    this.dropped = 0;
    this.offline = false;
    this.bossMix = 0;
    this.bossOver = false;
    this.beds = Object.create(null);
    // 3.43.1: a bed whose build threw once is not rebuilt every tick (3.46.0: the value is the
    // audio time of the failure, so the bed gets one more try after 10 s)
    this.deadBeds = Object.create(null);
    // 3.46.0: same rule for the room tone (startTone)
    this.deadTone = Object.create(null);
    // 3.46.0: audio time of the last failed track start (syncTrack backs off 2 s before retrying)
    this.trackFailT = 0;
    this.schedFails = 0;
    this.liveT = -1e9;
    this.speed = null;
    this.amb = null;
    this.accentT = 0;
    // 2.9.0: music ducking and counters of the music notes (the tests check that none is dropped)
    this.duckGain = null;
    this.duckT = -1e9;
    this.duckDepth = 0;
    // 3.48.0: the last tick of every slider preview, per bus (see previewBus)
    this.previewT = {};
    this.musicScheduled = 0;
    this.musicSkipped = 0;
    // 3.1.0: the music tracks (see MUSIC_TRACKS): what plays now, the boss heat (0 calm, 1 after a phase change,
    // 2 enraged), the stage buses and the counters of the voice budget
    this.playKind = "off";
    this.playBiome = "courtyard";
    this.heat = 0;
    this.jump = false;
    this.fade = null;
    this.musicPeak = 0;
    this.musicShed = 0;
    this.musicLog = null;
    // 3.2.0: the music processing (see buildGraph) and the place of a track kept over a pause (held)
    this.glue = null;
    this.makeup = null;
    this.musLevel = null;
    this.pump = null;
    this.ping = null;
    this.choir = null;
    this.verbIn = null;
    this.mbed = null;
    this.held = null;
    this.resumeWanted = false;
    // 3.2.0: where the sounds are: the pan of the event being played (from its x relative to the listener) and
    // its room send (SFX_ROOM)
    this.curPan = 0;
    this.curRev = 0;
    this.sfxVerbIn = null;
    this.sfxVerbOut = null;
  }
  setIntensity(level) {
    this.want = Math.max(0, Math.min(1, level || 0));
  }
  unlock() {
    if (this.ok)
      try {
        if (!this.ctx) {
          this.init();
        }
        if (this.ctx.state !== "running") {
          this.ctx.resume().catch(() => {});
        }
      } catch (err) {
        this.fail(err);
      }
  }
  init() {
    try {
      if (navigator.audioSession) {
        navigator.audioSession.type = "ambient";
      }
    } catch {}
    let AudioCtx = window.AudioContext || window.webkitAudioContext,
      ctx = new AudioCtx({ latencyHint: "interactive" });
    try {
      this.buildGraph(ctx);
    } catch (err) {
      // 3.46.0: a half-built graph is worse than none (a missing bus would make every later
      // call throw): drop it so the next gesture retries init() from scratch, and close the
      // context. buildGraph sets this.ctx first, so it has to be cleared again here.
      this.ctx = null;
      try {
        ctx.close();
      } catch {}
      throw err;
    }
    let unlocker = ctx.createBufferSource();
    unlocker.buffer = ctx.createBuffer(1, 1, 22050);
    unlocker.connect(ctx.destination);
    unlocker.start(0);
    this.startScheduler();
  }
  /* The master chain: sfx and music -> compressor -> limiter -> soft clipper -> output. The soft
     clipper keeps the signal below 0.93 whatever the mix does. */
  /* opts.room: false leaves out the two reverbs (test engines that only count notes: every convolver holds the
       transform of its impulse, megabytes each) */
  buildGraph(ctx, opts = {}) {
    this.ctx = ctx;
    this.physical = new PhysicalVoices(ctx, { decode: !this.budgetOnly });
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClipCurve();
    this.comp.connect(this.limiter);
    this.master = ctx.createGain();
    this.master.gain.value = 0.82;
    this.limiter.connect(this.master);
    this.master.connect(this.clip);
    this.clip.connect(ctx.destination);
    // 3.42.0: the muffle: a lowpass between the buses and the limiter. A Whiteout closes it so the whole
    // world (shots, music, wind) sounds like behind a wall of snow; every other state keeps it open.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 18000;
    this.muffle.Q.value = 0.3;
    this.comp.disconnect();
    this.comp.connect(this.muffle);
    this.muffle.connect(this.limiter);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.comp);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.ambVol;
    // 3.43.0: the room gives way to the big hits a little deeper than the music does (duck)
    this.ambDuck = ctx.createGain();
    this.ambBus.connect(this.ambDuck);
    this.ambDuck.connect(this.comp);
    // 3.2.0: mus is the input of the music at unity; its volume is musLevel at the end of the music chain, so that
    // the glue compressor works the same at every volume setting
    this.mus = ctx.createGain();
    this.musLevel = ctx.createGain();
    this.musLevel.gain.value = this.musVol * MUSIC_SCALE;
    // 2.9.0: the music passes a gain stage of its own that dips briefly on big hits (duck)
    this.duckGain = ctx.createGain();
    // 3.1.0: a fade stage between the music and the duck (the calm theme fades back in after a boss)
    this.fade = ctx.createGain();
    this.mus.connect(this.fade);
    // 3.2.0: fade -> glue compressor -> make-up gain -> volume -> duck (mixFor sets the glue per track kind)
    this.glue = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.fade.connect(this.glue);
    this.glue.connect(this.makeup);
    this.makeup.connect(this.musLevel);
    this.musLevel.connect(this.duckGain);
    this.duckGain.connect(this.comp);
    this.mixFor("fight");
    // the pump: pads, bass, strings, brass and the choir pass it; accented kicks dip it (a sidechain feel)
    this.pump = ctx.createGain();
    this.pump.connect(this.mus);
    // 3.9.0: the atmospheres of the music pass these on their way into the music (calm) or the pump (boss)
    this.atmos = ctx.createGain();
    this.atmosPump = ctx.createGain();
    this.atmos.gain.value = this.atmosPump.gain.value = this.ambVol / AMB_REF;
    this.atmos.connect(this.mus);
    this.atmosPump.connect(this.pump);
    if (opts.room !== false) {
      // 3.2.0: the room of the music: a generated 2 s impulse; voices send to it with opts.rev
      this.verbIn = ctx.createGain();
      // 3.46.0: two rooms built once and swapped (quietOld used to build a fresh convolver —
      // megabytes of impulse transform — on every track change). Both share one impulse.
      let impulse = roomImpulse(ctx, 2);
      this.verbPool = [];
      for (let i = 0; i < 2; i++) {
        let v = ctx.createConvolver();
        v.buffer = impulse;
        let vo = ctx.createGain();
        vo.gain.value = i === 0 ? 0.5 : 0;
        this.verbIn.connect(v);
        v.connect(vo);
        vo.connect(this.mus);
        this.verbPool.push({ conv: v, out: vo });
      }
      // 3.18.1: kept so that a track change can swap the room for a fresh one (quietOld)
      this.verb = this.verbPool[0].conv;
      this.verbOut = this.verbPool[0].out;
      // 3.2.0: the room of the big sounds (a shorter impulse); its level follows the biome (setMusic)
      this.sfxVerbIn = ctx.createGain();
      let sfxVerb = ctx.createConvolver();
      sfxVerb.buffer = roomImpulse(ctx, 1.4);
      this.sfxVerbOut = ctx.createGain();
      this.sfxVerbOut.gain.value = SFX_ROOM_BIOME.courtyard;
      this.sfxVerbIn.connect(sfxVerb);
      sfxVerb.connect(this.sfxVerbOut);
      this.sfxVerbOut.connect(this.sfx);
    }
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.32;
    this.delay.connect(this.fb);
    this.fb.connect(this.delay);
    this.delay.connect(this.mus);
    // 3.19.0: the ping-pong echo of the ambient bloom (BLOOM): two delays that feed each other, one heard on the left
    // and one on the right, so that every note of the bloom wanders across the room; it ends in the music bus
    if (ctx.createStereoPanner) {
      this.ping = ctx.createGain();
      const dl = ctx.createDelay(1),
        dr = ctx.createDelay(1),
        fl = ctx.createGain(),
        fr = ctx.createGain(),
        pl = ctx.createStereoPanner(),
        pr = ctx.createStereoPanner();
      dl.delayTime.value = 0.43;
      dr.delayTime.value = 0.43;
      fl.gain.value = fr.gain.value = 0.42;
      pl.pan.value = -0.9;
      pr.pan.value = 0.9;
      this.ping.connect(this.mus);
      this.ping.connect(dl);
      dl.connect(pl);
      pl.connect(this.mus);
      dl.connect(fl);
      fl.connect(dr);
      dr.connect(pr);
      pr.connect(this.mus);
      dr.connect(fr);
      fr.connect(dl);
      // 3.28.1: the feedback of the echo, silenced for a moment when the music changes (quietOld)
      this.pingFb = [fl, fr];
    }
    let len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    let data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // the music and its atmospheres take pink or brown noise (opts.color, see colorNoise)
    this.pinkBuf = colorNoise(ctx, "pink");
    this.brownBuf = colorNoise(ctx, "brown");
    // the choir of the boss tracks: saw voices through the three formants of an open "ah" and a little of the
    // voice itself (CHOIR_VOWEL); it joins the pump like the pads
    this.choir = ctx.createGain();
    let choirOut = ctx.createGain();
    choirOut.gain.value = 1;
    for (let [f, q, g] of CHOIR_VOWEL) {
      let band = ctx.createBiquadFilter(),
        amp = ctx.createGain();
      band.type = f ? "bandpass" : "lowpass";
      band.frequency.value = f || 900;
      band.Q.value = q;
      amp.gain.value = g;
      this.choir.connect(band);
      band.connect(amp);
      amp.connect(choirOut);
    }
    choirOut.connect(this.pump);
    if (this.verbIn) {
      let send = ctx.createGain();
      send.gain.value = 0.6;
      choirOut.connect(send);
      send.connect(this.verbIn);
    }
  }
  /* the noise buffer of a colour ("pink", "brown"; anything else: the white noise of the sounds) */
  noiseOf(color) {
    return color === "pink" ? this.pinkBuf : color === "brown" ? this.brownBuf : this.noiseBuf;
  }
  /* a looping noise source of the beds, started somewhere in its buffer */
  noiseLoop(rate, color, now) {
    let node = this.ctx.createBufferSource();
    node.buffer = this.noiseOf(color);
    node.loop = true;
    node.playbackRate.value = rate;
    node.start(now, Math.random() * Math.max(0, node.buffer.duration - 0.5));
    return node;
  }
  /* Test hook: run the engine on an OfflineAudioContext (no scheduler, always "running"). */
  attach(ctx, opts) {
    this.offline = true;
    this.buildGraph(ctx, opts);
  }
  live() {
    return !!this.ctx && (this.offline || this.ctx.state === "running");
  }
  nowT() {
    return this.simT != null ? this.simT : this.ctx.currentTime;
  }
  fail(err) {
    if (!this.failed) {
      logError("audio", err);
    }
    this.failed = true;
  }
  setVolumes(sfx, music, ambience = this.ambVol) {
    this.sfxVol = sfx;
    this.musVol = music;
    this.ambVol = ambience;
    if (!this.ctx) return;
    let now = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(sfx, now, 0.05);
    this.musLevel.gain.setTargetAtTime(music * MUSIC_SCALE, now, 0.1);
    this.ambBus.gain.setTargetAtTime(ambience, now, 0.05);
    this.atmos.gain.setTargetAtTime(ambience / AMB_REF, now, 0.1);
    this.atmosPump.gain.setTargetAtTime(ambience / AMB_REF, now, 0.1);
  }
  /* 3.9.0: one sound of the place (audio/place.js) at level a.g and pan a.pan, on the ambience bus */
  placePlay(id, a) {
    if (!this.live() || this.ambVol <= 0 || !PLACE[id]) return;
    try {
      PLACE[id](this, a);
    } catch (err) {
      this.fail(err);
    }
  }
  /* 3.9.0: the sounds of the place of a running fight (main.js calls it every frame; see audio/place.js) */
  place(world, dt) {
    if (!this.live() || this.ambVol <= 0 || !world || !world.arena) return;
    try {
      placeTick(this, world, dt);
    } catch (err) {
      this.fail(err);
    }
  }
  suspend() {
    try {
      if (this.ctx && this.ctx.state === "running") {
        this.ctx.suspend();
      }
    } catch {}
  }
  resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") {
        this.ctx.resume().catch(() => {});
      }
    } catch {}
  }
  /* Voice limit: at most MAX_VOICES oscillators/sources are alive. A new voice that finds the list
     full takes the place of the oldest voice of lower (or, for sounds, equal) priority; music (0)
     never drops anything and is skipped instead, loops (beds) are never dropped. */
  claim(pri, start, end, opt) {
    let now = this.nowT();
    // 2.8.2: music (priority 0) is counted apart from the sounds. It used to share the list, and every
    // shot or hit that found it full took the oldest music note: the music stuttered and dropped out
    // in heavy fights. Music never takes a voice from anyone and is skipped when its own list is full.
    // 3.1.0: the budget counts the voices that are alive at the start of the new one; a voice marked
    // optional (texture sounds) leaves MUSIC_RESERVE places to the kick, the bass and the other essentials
    if (pri === 0) {
      let music = this.musicVoiceList;
      if (music.length >= 12) {
        for (let i = music.length - 1; i >= 0; i--)
          if (music[i].end < now) {
            // 3.46.0: detached now — these used to rely on GC and piled up on Safari.
            // Never in the offline renders: there the whole graph is rendered after the
            // scheduling pass, so a detached voice's window would never sound at all.
            try {
              if (!this.offline && music[i].node) music[i].node.disconnect();
            } catch {}
            music[i] = music[music.length - 1];
            music.pop();
          }
      }
      if (end > this.maxEnd && end < 1e8) this.maxEnd = end;
      let live = 0;
      for (let i = 0; i < music.length; i++) if (music[i].end > start) live++;
      if (live >= MAX_MUSIC_VOICES - (opt ? MUSIC_RESERVE : 0)) {
        if (opt) this.musicShed++;
        else this.musicSkipped++;
        return null;
      }
      if (live + 1 > this.musicPeak) this.musicPeak = live + 1;
      let voice = { node: null, amp: null, pri: 0, start: start, end: end, loop: false };
      music.push(voice);
      this.musicScheduled++;
      return voice;
    }
    let list = this.voices;
    if (list.length >= MAX_VOICES) {
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].end < now) {
          // 3.46.0: detached now — these used to rely on GC and piled up on Safari
          // (never offline: the render happens after the scheduling pass — see claim)
          try {
            if (!this.offline && list[i].node) list[i].node.disconnect();
          } catch {}
          list[i] = list[list.length - 1];
          list.pop();
        }
    }
    let voice = { node: null, amp: null, pri: pri, start: start, end: end, loop: false };
    if (end > this.maxEnd && end < 1e8) this.maxEnd = end;
    if (list.length < MAX_VOICES) {
      list.push(voice);
      return voice;
    }
    let victim = -1;
    for (let i = 0; i < list.length; i++) {
      let other = list[i];
      if (other.loop || other.pri > pri || (other.pri === pri && pri < 1)) continue;
      if (
        victim < 0 ||
        other.pri < list[victim].pri ||
        (other.pri === list[victim].pri && other.start < list[victim].start)
      )
        victim = i;
    }
    if (victim < 0) {
      this.dropped++;
      return null;
    }
    let old = list[victim];
    try {
      old.amp.gain.cancelScheduledValues(now);
      old.amp.gain.setTargetAtTime(0, now, 0.004);
      old.node.stop(now + 0.03);
      // 3.46.0: detached now — the stolen voice used to rely on GC (piled up on Safari)
      // (never offline: the render happens after the scheduling pass — see claim)
      if (!this.offline) {
        old.node.disconnect();
        old.amp.disconnect();
      }
    } catch {}
    list[victim] = voice;
    this.dropped++;
    return voice;
  }
  /* opts: to (end pitch), detune, attack, hold (flat level after the attack), lp/q (low-pass; lpTo ends the
     sweep), env (Float32Array, 0..1: the whole level curve replaces the exponential envelope: tremolo), dest/at/pri,
     opt (an optional music voice) */
  tone(freq, dur, wave, vol, opts = {}) {
    let ctx = this.ctx,
      start = ctx.currentTime + (opts.at || 0),
      voice = this.claim(
        opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
        start,
        start + dur + 0.02,
        opts.opt,
      );
    if (!voice) return;
    this.logMusic(voice, "t", freq, vol, opts);
    if (this.budgetOnly) return;
    let osc = ctx.createOscillator(),
      amp = ctx.createGain();
    voice.node = osc;
    voice.amp = amp;
    setNaturalWave(ctx, osc, wave);
    osc.frequency.setValueAtTime(freq, start);
    if (opts.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), start + dur);
    }
    if (opts.detune) {
      osc.detune.value = opts.detune;
    }
    this.envelope(amp, start, dur, vol, opts);
    let out = osc;
    if (opts.lp) {
      let filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = opts.lp;
      filter.Q.value = opts.q || 0.7;
      if (opts.lpTo) {
        filter.frequency.setValueAtTime(opts.lp, start);
        filter.frequency.exponentialRampToValueAtTime(opts.lpTo, start + dur);
      }
      out.connect(filter);
      out = filter;
    }
    out.connect(amp);
    this.route(amp, opts);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  envelope(amp, start, dur, vol, opts) {
    let attack = opts.attack || 0.004;
    if (opts.env) {
      let env = opts.env,
        curve = new Float32Array(env.length);
      for (let i = 0; i < env.length; i++) curve[i] = env[i] * vol;
      amp.gain.setValueCurveAtTime(curve, start, dur);
      return;
    }
    amp.gain.setValueAtTime(1e-4, start);
    amp.gain.exponentialRampToValueAtTime(vol, start + attack);
    // 2.9.2: opts.hold keeps the level flat for that long after the attack (sustained sounds such as the
    // flame roar; the plain exponential decay drops 50 dB in a third of a second and pumps when repeated)
    // (never past the end: a hold that reaches beyond the note would come after its fade)
    if (opts.hold) amp.gain.setValueAtTime(vol, start + attack + Math.min(opts.hold, Math.max(0, dur * 0.95 - attack)));
    amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
  }
  noise(dur, vol, opts = {}) {
    let ctx = this.ctx,
      start = ctx.currentTime + (opts.at || 0),
      voice = this.claim(
        opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
        start,
        start + dur + 0.02,
        opts.opt,
      );
    if (!voice) return;
    this.logMusic(voice, "n", opts.f || 2e3, vol, opts);
    if (this.budgetOnly) {
      Math.random(); // Keep the noise-source offset draw in the reference schedule.
      return;
    }
    let src = ctx.createBufferSource();
    src.buffer = this.noiseOf(opts.color);
    // 2.9.1: the 1 s buffer is looped: a burst longer than what is left of it (it starts up to 0.5 s in)
    // used to be cut off; white noise has no audible seam (3.7.0: nor have the six seconds of pink and brown)
    src.loop = true;
    src.playbackRate.value = opts.rate || 1;
    let filter = ctx.createBiquadFilter();
    filter.type = opts.type || "lowpass";
    filter.frequency.setValueAtTime(opts.f || 2e3, start);
    if (opts.to) {
      filter.frequency.exponentialRampToValueAtTime(opts.to, start + dur);
    }
    filter.Q.value = opts.q || 0.8;
    let amp = ctx.createGain();
    voice.node = src;
    voice.amp = amp;
    this.envelope(amp, start, dur, vol, { ...opts, attack: opts.attack || 0.003 });
    src.connect(filter);
    filter.connect(amp);
    this.route(amp, opts);
    src.start(start, Math.random() * Math.max(0, src.buffer.duration - 0.5));
    src.stop(start + dur + 0.02);
  }
  /* 3.2.0: where a voice goes: its bus (opts.dest, the sounds by default), panned with opts.pan (-1..1) and sent to
       the music reverb with opts.rev (send level) */
  route(amp, opts) {
    // a sound (no bus of its own) takes the pan and the room of the event that is being played
    // 3.9.0: the sounds of the place go to the ambience bus (opts.dest, or curBus while the accents of a biome event
    // play) and ring out in the room of the sounds, not in that of the music
    let dest = opts.dest || this.curBus || this.sfx,
      pan = opts.pan != null ? opts.pan : opts.dest ? 0 : this.curPan,
      rev = opts.rev != null ? opts.rev : opts.dest ? 0 : this.curRev,
      room = opts.dest && opts.dest !== this.ambBus ? this.verbIn : this.sfxVerbIn;
    if (pan && this.ctx.createStereoPanner) {
      let panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      amp.connect(panner);
      panner.connect(dest);
    } else amp.connect(dest);
    if (rev && room) {
      let send = this.ctx.createGain();
      send.gain.value = rev;
      amp.connect(send);
      send.connect(room);
    }
  }
  /* 3.2.0: the glue of the music: gentle on the calm themes, hard and loud on the boss tracks (a dense wall) */
  mixFor(kind) {
    if (!this.glue) return;
    let boss = kind === "boss",
      g = this.glue,
      now = this.ctx.currentTime;
    g.threshold.setValueAtTime(boss ? -20 : -16, now);
    g.ratio.setValueAtTime(boss ? 5 : 2, now);
    g.knee.setValueAtTime(boss ? 3 : 10, now);
    g.attack.setValueAtTime(boss ? 0.004 : 0.02, now);
    g.release.setValueAtTime(boss ? 0.12 : 0.3, now);
    this.makeup.gain.cancelScheduledValues(now);
    this.makeup.gain.setValueAtTime(boss ? 1.3 : 1.1, now);
  }
  /* test hook: with musicLog set (an array) every music voice is recorded: kind, start, pitch, level, length,
       bus (m music, d delay, p pump, c choir) */
  logMusic(voice, kind, pitch, vol, opts) {
    if (!this.musicLog || voice.pri !== 0) return;
    let dest = opts.dest;
    this.musicLog.push({
      kind,
      t: voice.start,
      pitch,
      vol,
      dur: voice.end - voice.start,
      bus:
        dest === this.delay
          ? "d"
          : dest === this.pump
            ? "p"
            : dest === this.choir
              ? "c"
              : dest === this.ping
                ? "b"
                : "m",
    });
  }
  gate(key, gap) {
    let now = this.ctx.currentTime;
    if (this.last[key] && now - this.last[key] < gap) return false;
    this.last[key] = now;
    return true;
  }
  play(id, arg, bossWarning = false) {
    if (!this.live() || this.sfxVol <= 0) return;
    const warning = bossWarning || BOSS_WARNING_VOICES.has(id) || THREAT_WARNING_VOICES.has(id);
    this.curPri = warning || KEY_SOUNDS.has(id) ? 2 : 1;
    this.curRev = SFX_ROOM[id] || 0;
    try {
      this._play(id, arg);
      const depth = warning ? 0.15 : MUSIC_DUCK[id];
      if (depth) this.duck(depth);
    } catch (err) {
      this.fail(err);
    } finally {
      this.curPri = 1;
      this.curRev = 0;
    }
  }
  /* 3.48.0: the volume sliders of the Settings let the ear check what they set: every bus answers with
       one real sound of the game on that bus, at the level the slider just put in. Effects fire the shot
       of the weapon in hand, music plays the arrival chord of the biome, the ambience sounds one far
       voice of the place. A short throttle per bus keeps a drag from machine-gunning the sample, and the
       usual gates apply (no live context or a muted bus: nothing sounds, nothing throws). */
  previewBus(bus, weapon) {
    if (!this.live()) return;
    // the gate comes first: a muted bus answers nothing and its throttle stays clean, so turning
    // the volume back up is heard at once
    if (bus === "sfx" && this.sfxVol <= 0) return;
    if (bus === "music" && this.musVol <= 0) return;
    if (bus === "ambience" && this.ambVol <= 0) return;
    let now = this.nowT(),
      gap = bus === "music" ? 0.5 : 0.22;
    if (now - (this.previewT[bus] ?? -1e9) < gap) return;
    this.previewT[bus] = now;
    try {
      if (bus === "sfx") this.play(weapon || "pulse");
      else if (bus === "music") musicImpact(this, this.wantBiome(), 0);
      else if (bus === "ambience") this.placePlay(AMB_PREVIEW[this.wantBiome()] || "sparks", { g: 1, pan: 0 });
    } catch (err) {
      this.fail(err);
    }
  }
  /* 2.9.0: a light sidechain: the music gain dips by `depth` (at most 15 %) for about 80 ms and comes back
     (time constant 70 ms), so that a big hit is heard over the music. Nothing is stopped or skipped. */
  duck(depth) {
    let gain = this.duckGain;
    if (!gain) return;
    let now = this.ctx.currentTime;
    // 3.43.1: inside the gate a deeper press still goes through (a nova right after a boom used
    // to be swallowed whole); an equal or lighter one changes nothing, like before
    if (now - this.duckT < 0.1 && depth <= this.duckDepth) return;
    this.duckT = now;
    this.duckDepth = depth;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(1 - Math.min(0.15, depth), now, 0.012);
      gain.gain.setTargetAtTime(1, now + 0.08, 0.07);
    } catch {}
    // 3.43.0: the room is pressed down a little deeper than the music, so a blast feels like it takes
    // the air of the place with it
    if (this.ambDuck) {
      let room = this.ambDuck.gain;
      room.cancelScheduledValues(now);
      room.setTargetAtTime(1 - Math.min(0.4, depth * 2.4), now, 0.014);
      room.setTargetAtTime(1, now + 0.1, 0.3);
    }
  }
  _play(id, arg) {
    this.physical.play(this, id, arg);
    this._cozyChime(id, arg);
  }
  /* Warm musical chimes layered gently onto UI, pickups, upgrade rarities, readiness, interactive biome
     relics & clear moments, quantized to the active biome's modal scale via scoreScaleMidi. */
  _cozyChime(id, arg) {
    const note = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const m = (deg, oct = 24) => scoreScaleMidi(this.biome, deg, oct);
    const bell = (midi, dur, wave, vol, delay = 0, pan = 0) =>
      this.tone(note(midi), dur, wave, vol, {
        at: delay,
        attack: 0.008,
        lp: 3800,
        pan,
        rev: 0.16,
      });
    switch (id) {
      case "click":
        if (this.gate("chime:click", 0.045)) bell(m(0, 24), 0.085, "kalimba", 0.036);
        break;
      case "deny":
      case "gadgetNo":
        if (this.gate("chime:deny", 0.08)) {
          bell(m(1, 12), 0.11, "marimba", 0.048, 0, -0.1);
          bell(m(0, 12), 0.14, "marimba", 0.045, 0.065, 0.1);
        }
        break;
      case "offer":
        if (this.gate("chime:offer", 0.12)) {
          bell(m(0, 12), 0.2, "harp", 0.048, 0, -0.18);
          bell(m(2, 24), 0.24, "harp", 0.052, 0.055, 0);
          bell(m(4, 24), 0.3, "celesta", 0.046, 0.11, 0.18);
        }
        break;
      case "reroll":
        if (this.gate("chime:reroll", 0.1)) {
          bell(m(0, 24), 0.14, "kalimba", 0.045, 0, -0.2);
          bell(m(2, 24), 0.15, "kalimba", 0.046, 0.045, 0);
          bell(m(4, 24), 0.2, "celesta", 0.048, 0.09, 0.2);
        }
        break;
      case "pick": {
        if (!this.gate("chime:pick", 0.08)) break;
        const r = Math.max(1, Math.min(6, Number(arg) || 1));
        const chord =
          r >= 5
            ? [m(0, 12), m(2, 12), m(0, 24), m(2, 24), m(4, 24)]
            : r === 4
              ? [m(0, 12), m(0, 24), m(2, 24), m(4, 24), m(6, 24)]
              : r === 3
                ? [m(0, 24), m(2, 24), m(4, 24), m(5, 24)]
                : r === 2
                  ? [m(0, 24), m(2, 24), m(4, 24)]
                  : [m(0, 24), m(4, 24)];
        const wave = r >= 4 ? "celesta" : r >= 2 ? "harp" : "kalimba";
        for (let i = 0; i < chord.length; i++) {
          bell(chord[i], 0.26 + i * 0.04, wave, 0.052, i * 0.048, (i - (chord.length - 1) / 2) * 0.16);
        }
        break;
      }
      case "shard":
        if (this.gate("chime:shard", 0.055)) {
          const deg = (this.shardStep = ((this.shardStep || 0) + 1) % 5);
          bell(m(deg, 24), 0.13, "celesta", 0.042);
        }
        break;
      case "heal":
      case "heart":
        if (this.gate("chime:heal", 0.1)) {
          bell(m(2, 12), 0.22, "harp", 0.05, 0, -0.15);
          bell(m(4, 24), 0.28, "celesta", 0.048, 0.065, 0.15);
        }
        break;
      case "buy":
      case "supply":
      case "bounty":
      case "tribute":
        if (this.gate("chime:buy", 0.1)) {
          bell(m(1, 24), 0.18, "kalimba", 0.05, 0, -0.15);
          bell(m(3, 24), 0.22, "harp", 0.052, 0.055, 0);
          bell(m(5, 24), 0.28, "celesta", 0.048, 0.11, 0.15);
        }
        break;
      case "ready":
      case "novaReady":
      case "gadgetReady":
        if (this.gate("chime:ready", 0.12)) {
          const deg = id === "novaReady" ? 2 : id === "gadgetReady" ? 1 : 0;
          bell(m(deg, 24), 0.16, "celesta", 0.044, 0, -0.12);
          bell(m(deg + 4, 24), 0.22, "celesta", 0.048, 0.05, 0.12);
        }
        break;
      case "combo":
        if (this.gate("chime:combo", 0.08)) {
          const lift = Math.max(0, Math.min(12, Number(arg) || 0));
          bell(m(lift % 7, 24), 0.18, "kalimba", 0.048);
        }
        break;
      case "propArm":
        if (this.gate("chime:propArm", 0.08)) {
          bell(m(2, 24), 0.14, "kalimba", 0.042, 0, -0.1);
          bell(m(4, 24), 0.18, "celesta", 0.045, 0.055, 0.1);
        }
        break;
      case "propLantern":
      case "propRime":
      case "propPuffball":
      case "propPrism":
      case "propCrucible":
      case "propSunglass":
        if (this.gate("chime:prop", 0.08)) {
          const inst =
            id === "propRime"
              ? "celesta"
              : id === "propPuffball"
                ? "marimba"
                : id === "propCrucible"
                  ? "brass"
                  : id === "propLantern"
                    ? "kalimba"
                    : "harp";
          bell(m(0, 24), 0.2, inst, 0.05, 0, -0.16);
          bell(m(2, 24), 0.24, inst, 0.052, 0.05, 0);
          bell(m(4, 24), 0.3, "celesta", 0.048, 0.1, 0.16);
        }
        break;
      case "wave":
        if (this.gate("chime:wave", 0.2)) {
          bell(m(0, 12), 0.34, "brass", 0.048, 0, -0.15);
          bell(m(4, 12), 0.38, "harp", 0.046, 0.06, 0.15);
        }
        break;
      case "cleared":
        if (this.gate("chime:cleared", 0.2)) {
          const notes = arg ? [m(0, 12), m(2, 24), m(4, 24), m(6, 24)] : [m(0, 12), m(2, 24), m(4, 24)];
          for (let i = 0; i < notes.length; i++) {
            bell(
              notes[i],
              0.3 + i * 0.04,
              i === notes.length - 1 ? "celesta" : "harp",
              0.054,
              i * 0.06,
              (i - 1) * 0.18,
            );
          }
        }
        break;
      case "bossCleared":
      case "evolve":
      case "victory":
        if (this.gate("chime:fanfare", 0.25)) {
          const notes = [m(0, 12), m(2, 12), m(4, 12), m(0, 24), m(4, 24)];
          for (let i = 0; i < notes.length; i++) {
            bell(
              notes[i],
              0.38 + i * 0.05,
              i === 0 ? "brass" : i < 3 ? "harp" : "celesta",
              0.058,
              i * 0.07,
              (i - 2) * 0.18,
            );
          }
        }
        break;
    }
  }
  consume(events, listener) {
    if (!this.live()) return;
    let kills = 0;
    for (let ev of events) {
      this.curPan = listener && ev.x != null ? Math.max(-0.8, Math.min(0.8, (ev.x - listener.x) / 20)) : 0;
      switch (ev.k) {
        case "shot":
          this.play(rlShotSfx(ev.w));
          break;
        case "dmg":
          if (!ev.burn) {
            this.play(ev.crit ? "crit" : "hit", { type: ev.type, shield: !!ev.shield });
          }
          break;
        case "kill":
          if (ev.boss) {
            this.play("bigkill", ev.type);
          } else {
            if (kills++ < 3) {
              this.play(RL_DEATH_FAMILY[ev.type] || "kill", ev.elite ? 1.8 : Math.max(1, ev.r * 1.6));
            }
          }
          break;
        case "boom":
          // 3.0.0: the traps have blasts of their own (trapFire), 3.12.0: so has the Singularity (singCollapse);
          // 3.6.0: so has the
          // Combo Surge ("surge")
          if (ev.kind === "trap" || ev.kind === "surge" || ev.kind === "nova") break;
          // 3.10.0: the attacks of enemies and bosses sound like what they are
          if (attackVoice(ev.kind, ev.src, this.biome, ev.chill)) {
            this.play(attackVoice(ev.kind, ev.src, this.biome, ev.chill), ev.r);
            break;
          }
          if (ev.kind === "brood") {
            this.play("bcBurst");
            break;
          }
          this.play(
            ev.kind === "singularity"
              ? "singCollapse"
              : ev.kind === "payload" || ev.kind === "pop"
                ? "smallboom"
                : "boom",
          );
          break;
        case "nova":
          this.play("nova");
          break;
        case "novaReady":
          this.play("novaReady");
          break;
        case "hurt":
          this.play("hurt");
          break;
        case "shieldBreak":
          this.play("shield");
          break;
        case "shieldUp":
        case "barrier":
          this.play("shieldUp");
          break;
        case "dash":
          this.play("dash");
          break;
        // 3.17.0: the walker: a foot comes down on the ground of the biome (or on ice or acid), the landing after a dash
        case "step":
          this.play("step", { ground: ev.ground, foot: ev.foot, v: ev.v });
          break;
        case "land":
          this.play("land", { ground: ev.ground });
          break;
        case "edash":
          this.play(RL_DASH_VOICE[ev.type] || "blink");
          break;
        case "mine":
          this.play("plant");
          break;
        case "shard":
          this.play("shard");
          break;
        case "heal":
          this.play("heal");
          break;
        case "eshot":
          this.play(shotVoiceFor(ev));
          // 3.33.0: a Frost enemy's shot rings with a glassy chime on top (its shot slows the drone it hits)
          if (ev.frost) this.play("eshotFrost");
          break;
        case "beamWarn":
          this.play(BEAM_VOICE[ev.skin] || (ev.small ? "beamSmall" : "beam"), ev.small ? 0.6 : 1, ev.boss === true);
          break;
        case "aim":
          this.play(ev.type === "turret" ? "servo" : "lock");
          break;
        case "charge":
          this.play(RL_CHARGE_VOICE[ev.type] || "windHeavy", ev.type);
          break;
        case "fuse":
          this.play("fuse");
          break;
        case "portal":
          this.play("spawn");
          break;
        case "wave":
          this.play(ev.boss ? "boss" : "wave");
          break;
        case "cleared":
          this.play(ev.boss ? "bossCleared" : "cleared", ev.flawless);
          break;
        case "die":
          this.play("die");
          break;
        case "victory":
          this.play("victory");
          break;
        case "thud":
          this.play("thud", ev.src);
          break;
        case "revive":
          this.play("nova");
          break;
        case "pick":
          this.play("pick", ev.evo ? 5 : (upgradesById[ev.id] && upgradesById[ev.id].rarity) || 1);
          break;
        // 3.15.0: the boss cards
        case "sealgrid":
          this.play("bcCage");
          break;
        case "lockOn":
          this.play("bcLock");
          break;
        case "shatter":
          this.play("bcShatter");
          break;
        case "broodHatch":
          this.play("bcHatch");
          break;
        case "implode":
          this.play("bcImplode");
          break;
        case "kit":
          this.play("pick", 2);
          break;
        case "reroll":
          this.play("reroll");
          break;
        case "offer":
          this.play("offer");
          break;
        case "maxed":
          this.play("heal");
          break;
        case "singularity":
          this.play("singThrow");
          break;
        case "singOpen":
          this.play("singPull");
          break;
        case "gadgetReady":
          this.play("gadgetReady");
          break;
        case "gadgetDeny":
          this.play("gadgetNo");
          break;
        case "ping":
          // the old ping (shield phase) stays silent; a hit the burst cap swallows tinks
          if (ev.resist) this.play("resist");
          break;
        case "trapWarn": {
          let voice = RL_TRAP_SOUND[ev.skin];
          if (voice) this.play(voice.warn, ev.fam === "beam" ? { delay: ev.delay, dur: ev.dur } : ev.delay);
          break;
        }
        case "trapFire": {
          let voice = RL_TRAP_SOUND[ev.skin];
          if (voice && voice.fire) this.play(voice.fire);
          break;
        }
        case "trapArm":
          this.play("tArm", ev.skin);
          break;
        case "block":
          this.play("block");
          break;
        case "guardBreak":
          this.play("guardBreak");
          break;
        case "guardUp":
          this.play("guardUp");
          break;
        case "shieldPop":
          this.play("shieldPop");
          break;
        case "lob":
          this.play("lob", { src: ev.src, frost: !!ev.frost });
          break;
        case "blinkWarn":
          this.play("blinkWarn", ev.src);
          break;
        case "blink":
          this.play(ev.leap ? "leap" : "blink", ev.src);
          break;
        case "erupt":
          this.play(this.biome === "courtyard" ? "inlayRelease" : "erupt");
          break;
        case "devilNear":
          // 3.53.0: a dust devil of the Flats bears down on the player (the consume pan carried its spot)
          this.play("devilNear");
          break;
        case "warp":
          this.play("warp");
          break;
        case "mend":
        case "chill":
        case "champion":
          this.play(ev.k, ev.src);
          break;
        case "tribute":
          this.play("tribute");
          break;
        case "stun":
          this.play("stun", ev.skin);
          break;
        case "shortArm":
          this.play("shortFizz");
          break;
        case "championDown":
          this.play("bigkill", ev.type);
          break;
        case "combo":
          this.play("combo", Math.round(Math.log2(ev.n / 10) * 3));
          break;
        case "surge":
          this.play("surge", ev.i);
          break;
        case "comboEnd":
          this.play("comboEnd");
          break;
        case "bounty":
        case "bountyPulse":
          this.play("bounty");
          break;
        case "supplyDrop":
          this.play("supply");
          break;
        case "hatch":
          this.play("hatch", { src: ev.src, big: !!ev.big });
          break;
        case "freeze":
          this.play("freeze");
          break;
        case "chain":
          this.play("chain");
          break;
        case "wingShot":
          this.play("wing");
          break;
        case "bounce":
          this.play("bounce");
          break;
        case "spark":
          if (!this.gate || this.gate("sfx:spark", 0.055)) {
            this.play(RL_BIOME_SPARK[this.biome] || "sparkCourtyard");
          }
          break;
        case "biomeProp":
          this.play(ev.state === "arm" ? "propArm" : RL_PROP_VOICE[ev.kind] || "propLantern", ev);
          break;
        // bosses
        case "boss":
          this.play("bossIntro", ev.id);
          break;
        case "bossAtk": {
          let voice = RL_BOSS_ATK[ev.atk];
          if (RL_OVERDRIVE.has(ev.atk)) this.play("bOverdrive", ev.id);
          if (voice) this.play(voice, ev.id);
          break;
        }
        case "enrage":
          this.play("enrage", ev.id);
          this.bossPush(2);
          break;
        case "phase":
          this.play("phase", ev.src);
          this.bossPush(1);
          break;
        case "bossDown":
          this.bossEnd();
          this.play("bossDown", ev.id);
          break;
      }
    }
    this.curPan = 0;
  }
  /* 3.1.0: mode "fight" is the calm theme of the biome, "boss" its boss track. The boss track starts on the
     spot (main.js calls this when the boss appears, at the camera pan), not with the wave. */
  /* resume: back from the pause menu (the track goes on where it was instead of starting again) */
  setMusic(mode, biome, resume) {
    if (mode === "boss" && !resume) this.bossOver = false;
    this.resumeWanted = !!resume;
    this.mode = mode;
    // 3.42.0: leaving the fight opens the Whiteout muffle (the storm belongs to the fight alone)
    if (this.ctx && this.muffle && mode !== "fight" && mode !== "boss")
      this.muffle.frequency.setTargetAtTime(18000, this.ctx.currentTime, 0.3);
    if (biome) {
      this.biome = biome;
      // 3.2.0: the room of the sounds is the room of the biome
      if (this.sfxVerbOut && SFX_ROOM_BIOME[biome])
        this.sfxVerbOut.gain.setTargetAtTime(SFX_ROOM_BIOME[biome], this.ctx.currentTime, 0.3);
    }
    this.syncTrack();
    this.resumeWanted = false;
  }
  /* The boss is dead: the boss track resolves (a last hit) and the calm theme fades back in. */
  bossEnd() {
    this.bossOver = true;
    this.syncTrack();
  }
  /* the boss changes its phase or enrages: the track jumps back to its drop with more layers */
  bossPush(level) {
    if (this.playKind !== "boss" || level <= this.heat) return;
    this.heat = level;
    this.jump = true;
  }
  /* what should play now: "off", "menu", "fight" (calm) or "boss" */
  wantKind() {
    if (this.mode === "boss") return this.bossOver ? "fight" : "boss";
    return this.mode;
  }
  wantBiome() {
    return scoreBiomes.includes(this.biome) ? this.biome : "courtyard";
  }
  /* Called when the wanted track changes: restarts the step counter on the spot, cuts the notes that were
     already scheduled for the old track and plays the transition: an impact when the boss track starts, a last
     hit when it resolves (the calm theme then fades back in over about 3 s). */
  syncTrack() {
    // 3.43.1: the guard comes first - a setMusic before init() used to commit the track state and
    // skip the audio half, and every later sync saw "no change" and never started the track
    let ctx = this.ctx;
    if (!ctx || !this.fade) return;
    let kind = this.wantKind(),
      biome = this.wantBiome();
    if (kind === this.playKind && biome === this.playBiome) return;
    // 3.46.0: after a failed track start, back off 2 s before retrying (the 30 ms tick would
    // otherwise rebuild the bed — and swap the room — over and over)
    if (this.trackFailT && ctx.currentTime - this.trackFailT < 2) return;
    let from = this.playKind,
      track = kind === "fight" || kind === "boss" ? musicTrack(kind, biome) : null;
    // 3.2.0: the pause menu keeps the place of a fight or boss track; resuming the run goes on from there
    if ((from === "fight" || from === "boss") && kind === "menu")
      this.held = { kind: from, biome: this.playBiome, step: this.step, cycle: this.cycle, heat: this.heat };
    let held = this.held,
      resumed = !!held && this.resumeWanted && held.kind === kind && held.biome === biome;
    // 3.46.0: the old state is kept — if the change fails midway, it is put back so the next
    // tick (after the backoff) retries the whole change instead of a committed-but-silent track
    let prev = {
      kind: this.playKind,
      biome: this.playBiome,
      step: this.step,
      cycle: this.cycle,
      heat: this.heat,
      jump: this.jump,
      held: this.held,
    };
    if (kind !== "menu") this.held = null;
    this.playKind = kind;
    this.playBiome = biome;
    this.step = resumed ? held.step : 0;
    this.cycle = resumed ? held.cycle : 0;
    this.heat = resumed ? held.heat : 0;
    this.jump = false;
    try {
      let now = ctx.currentTime,
        gain = track ? track.gain : 1;
      this.cutScheduled(now);
      this.quietOld(now);
      this.nextT = now + 0.03;
      this.fade.gain.cancelScheduledValues(now);
      this.mixFor(kind);
      this.stopMusicBed();
      if (track) this.startMusicBed(kind, biome);
      if (resumed) {
        this.fade.gain.setValueAtTime(0.0001, now);
        this.fade.gain.linearRampToValueAtTime(gain, now + 0.6);
      } else if (from === "boss" && kind === "fight") {
        // resolve: the boss track ends on a last hit, then silence, then the calm theme fades in
        this.fade.gain.setValueAtTime(1.1, now);
        this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.9);
        this.fade.gain.linearRampToValueAtTime(gain, now + 4.1);
        this.nextT = now + 0.9;
        if (this.live() && this.musVol > 0) musicResolve(this, biome, 0);
      } else {
        this.fade.gain.setValueAtTime(gain, now);
        if (kind === "boss" && from === "fight" && this.live() && this.musVol > 0) musicImpact(this, biome, 0);
      }
      this.trackFailT = 0;
    } catch (err) {
      // 3.46.0: roll the track state back and back off before retrying
      this.playKind = prev.kind;
      this.playBiome = prev.biome;
      this.step = prev.step;
      this.cycle = prev.cycle;
      this.heat = prev.heat;
      this.jump = prev.jump;
      this.held = prev.held;
      this.trackFailT = ctx.currentTime;
      this.fail(err);
    }
  }
  /* the notes that were scheduled ahead (the scheduler looks 0.14 s ahead) for a track that has just ended */
  cutScheduled(now) {
    if (this.pump) {
      this.pump.gain.cancelScheduledValues(now);
      this.pump.gain.setValueAtTime(1, now);
    }
    let list = this.musicVoiceList;
    for (let i = list.length - 1; i >= 0; i--) {
      let voice = list[i];
      if (voice.start > now + 0.005 && voice.node) {
        try {
          voice.amp.gain.cancelScheduledValues(now);
          voice.amp.gain.setValueAtTime(0, now);
          voice.node.stop(now);
          // 3.46.0: detached now instead of relying on GC
          // (never offline: the render happens after the scheduling pass — see claim)
          if (!this.offline) {
            voice.node.disconnect();
            voice.amp.disconnect();
          }
        } catch {}
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }
  /* 3.18.1: the old track does not ring on under the new one. A track change used to cut only the notes that were still
     to come: the pads and bells already sounding (some for several seconds), the echoes of the delay and the tail of the
     room played on, so the calm theme was heard under the first bars of a boss and the boss under the calm theme after it.
     Now the sounding notes fade out over QUIET_FADE, the echo line is emptied and the room is swapped for a fresh one
     (the old one fades out and goes). */
  quietOld(now) {
    let end = now + QUIET_FADE,
      list = this.musicVoiceList;
    for (let voice of list) {
      if (!voice.node || voice.start > now + 0.005 || voice.end <= now + 0.01) continue;
      try {
        let gain = voice.amp.gain;
        if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
        else {
          let at = gain.value;
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(at, now);
        }
        gain.linearRampToValueAtTime(0, end);
        voice.node.stop(end + 0.01);
        voice.end = end;
      } catch {}
    }
    try {
      // the echo line: nothing is fed back while it empties (0.28 s a round), then it works again
      this.fb.gain.cancelScheduledValues(now);
      this.fb.gain.setValueAtTime(0, now);
      this.fb.gain.setValueAtTime(0.32, now + 0.7);
      // 3.28.1: the ping-pong echo of the bloom empties too (it rang about two seconds into the next track)
      for (const g of this.pingFb || []) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(0, now);
        g.gain.setValueAtTime(0.42, now + 1);
      }
      if (this.verbIn && this.verbPool) {
        // 3.46.0: swap between the two pre-built rooms instead of building a fresh convolver
        // (megabytes of impulse transform) on every track change; the outgoing one fades as before
        let old = this.verb,
          oldOut = this.verbOut,
          next = this.verbPool.find((v) => v.out !== oldOut) || this.verbPool[0];
        next.out.gain.cancelScheduledValues(now);
        next.out.gain.setValueAtTime(oldOut.gain.value, now);
        this.verbIn.disconnect(old);
        this.verbIn.connect(next.conv);
        oldOut.gain.cancelScheduledValues(now);
        oldOut.gain.setValueAtTime(oldOut.gain.value, now);
        oldOut.gain.linearRampToValueAtTime(0, end);
        this.verb = next.conv;
        this.verbOut = next.out;
      }
    } catch (err) {
      this.fail(err);
    }
  }
  /* Called every frame of a running world: `speed` (0..1, null: no engine hum) drives the drone
     hum, `ambience` is the id of the biome event that is on (or null). Everything here stops by
     itself when this is not called for 0.8 s (pause, menus) or the music mode is not a fight. */
  setState(speed, ambience) {
    if (!this.ctx) return;
    this.liveT = this.ctx.currentTime;
    this.speed = speed;
    this.amb = AMBIENCE_LEVEL[ambience] ? ambience : null;
    // 3.42.0: a Whiteout muffles the world behind the storm; anything else (and every non-fight state)
    // opens the muffle again. setMusic lifts it too, so a pause or the Home never stays muffled.
    if (this.muffle) {
      const want = this.amb === "whiteout" && speed != null ? 850 : 18000;
      this.muffle.frequency.setTargetAtTime(want, this.ctx.currentTime, want < 2000 ? 0.5 : 0.35);
    }
    let hum = this.beds.hum;
    if (hum && speed != null) {
      let now = this.ctx.currentTime;
      hum.parts.a.frequency.setTargetAtTime(76 + 26 * speed, now, 0.08);
      hum.parts.b.frequency.setTargetAtTime(152 + 52 * speed, now, 0.08);
      hum.parts.lp.frequency.setTargetAtTime(270 + 190 * speed, now, 0.08);
    }
  }
  /* Beds are the quiet loops: the drone hum and the biome event ambience. */
  startBed(name) {
    // 3.43.1: idempotent - a bed that is already up never builds a second copy on top
    if (this.beds[name]) return;
    let ctx = this.ctx,
      now = ctx.currentTime,
      gain = ctx.createGain(),
      nodes = [],
      parts = {},
      level = name === "hum" ? 0.02 : AMBIENCE_LEVEL[name] || 0.03;
    gain.gain.setValueAtTime(1e-4, now);
    // 3.43.0: an event bed gathers (the whiteout storm builds over about three seconds), it does not snap on
    gain.gain.setTargetAtTime(level, now, BED_ATTACK[name] || 0.35);
    // the drone's hum is an effect; the beds of the biome events are the place (3.9.0: ambience bus)
    gain.connect(name === "hum" ? this.sfx : this.ambBus);
    let bed = { name, gain, nodes, parts };
    this.beds[name] = bed;
    let osc = (type, freq) => {
        let node = ctx.createOscillator();
        node.type = type;
        node.frequency.value = freq;
        node.start(now);
        nodes.push(node);
        return node;
      },
      loop = (rate, color) => {
        let node = this.noiseLoop(rate, color, now);
        nodes.push(node);
        return node;
      },
      filter = (type, freq, q, from) => {
        let node = ctx.createBiquadFilter();
        node.type = type;
        node.frequency.value = freq;
        node.Q.value = q;
        from.connect(node);
        return node;
      };
    // 3.43.1: registered before the build - if the build throws midway, the catch below stops the
    // loops that already started (they used to be orphaned forever, and the scheduler retried the
    // build every tick, stacking a new orphan set each time)
    try {
      if (name === "hum") {
        parts.a = osc("sine", 76);
        parts.b = osc("sine", 152);
        setNaturalWave(ctx, parts.b, "bow");
        parts.lp = filter("lowpass", 270, 0.9, parts.a);
        const trim = ctx.createGain();
        trim.gain.value = 0.22;
        parts.b.connect(trim);
        trim.connect(gain);
        parts.lp.connect(gain);
      } else {
        const beds = {
          whiteout: [1170, 2.6, 0.15, 329, 0.65],
          bloom: [450, 2.3, 0.32, 173, 0.59],
          duskfall: [310, 1.7, 0.11, 107, 0.73],
          ashfall: [690, 1.6, 0.18, 71, 0.56],
          riftstorm: [890, 3.9, 0.24, 137, 0.71],
        };
        const [center, q, pace, pitch, rate] = beds[name];
        const air = filter("bandpass", center, q, loop(rate, "pink"));
        const depth = ctx.createGain(),
          wet = ctx.createGain(),
          wire = ctx.createGain();
        depth.gain.value = center * 0.24;
        wet.gain.value = 0.72;
        wire.gain.value = 0.21;
        const sweep = osc("sine", pace);
        sweep.connect(depth);
        depth.connect(air.frequency);
        air.connect(wet);
        wet.connect(gain);
        osc("sine", pitch).connect(wire);
        osc("sine", pitch * 1.014).connect(wire);
        wire.connect(gain);
      }
    } catch (err) {
      // back out cleanly: stop what started, leave the registry (a dead bed, the
      // scheduler will not rebuild it every tick — 3.46.0: it gets one more try after
      // 10 s), and report like the rest of the engine
      this.stopBed(name, 0, 0.02);
      this.deadBeds[name] = now;
      this.fail(err);
      return;
    }
    for (let node of nodes) {
      this.voices.push({ node: node, amp: gain, pri: 3, start: now, end: 1e9, loop: true, bed: bed });
    }
  }
  stopBed(name, at = 0, rel) {
    let bed = this.beds[name];
    if (!bed) return;
    let ctx = this.ctx,
      now = ctx.currentTime + at,
      // 3.43.0: the bed passes instead of cutting (the storm dies away over about four seconds)
      fade = rel != null ? rel : BED_RELEASE[name] || 0.08,
      end = now + Math.max(0.4, fade * 3);
    try {
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setTargetAtTime(0, now, fade);
      for (let node of bed.nodes) node.stop(end);
    } catch {}
    for (let voice of this.voices)
      if (voice.bed === bed) {
        voice.loop = false;
        voice.end = end;
      }
    if (end > this.maxEnd) this.maxEnd = end;
    delete this.beds[name];
  }
  /* 3.2.0: the atmosphere of a music track: a loop that plays under the notes for as long as the track plays (a
       singing wind on the Aurora Shelf, murk in the Glowmarsh, soft rain and lantern hum
       in Lantern Courtyard, beating drones in the Shattered Core; see MUSIC_BEDS). It goes through the music chain (volume,
       fade, glue) and is not a voice of the budget. */
  startMusicBed(kind, biome, fadeIn = 1.5) {
    const ctx = this.ctx;
    if (!ctx || (kind !== "fight" && kind !== "boss")) return;
    // 3.43.1: same hardening as the beds - an atmosphere that is still up goes before a new one
    if (this.mbed) this.stopMusicBed();
    let now = ctx.currentTime,
      out = ctx.createGain(),
      nodes = [],
      osc = (type, freq) => {
        let node = ctx.createOscillator();
        node.type = type;
        node.frequency.value = freq;
        node.start(now);
        nodes.push(node);
        return node;
      },
      loop = (rate, color) => {
        let node = this.noiseLoop(rate, color, now);
        nodes.push(node);
        return node;
      },
      filt = (type, freq, q, from) => {
        let node = ctx.createBiquadFilter();
        node.type = type;
        node.frequency.value = freq;
        node.Q.value = q;
        from.connect(node);
        return node;
      },
      lfo = (freq, depth, param, type = "sine") => {
        let gain = ctx.createGain();
        gain.gain.value = depth;
        osc(type, freq).connect(gain);
        gain.connect(param);
      },
      level = (from, vol) => {
        let gain = ctx.createGain();
        gain.gain.value = vol;
        from.connect(gain);
        gain.connect(out);
        return gain;
      },
      root = scoreOrigin(biome),
      barRate = musicTrack(kind, biome).bpm / 240;
    out.gain.setValueAtTime(1e-4, now);
    out.gain.linearRampToValueAtTime(kind === "boss" ? 0.29 : 0.22, now + fadeIn);
    out.connect(kind === "boss" ? this.atmosPump : this.atmos);
    // 3.46.0: registered before the build — if the build throws midway, the catch below stops
    // the loops that already started through stopMusicBed (they used to be orphaned forever,
    // out of reach of stopMusicBed, with the track state already committed)
    this.mbed = { out, nodes };
    try {
      scoreBed({ osc, loop, filt, lfo, level, root, barRate, boss: kind === "boss" }, biome);
    } catch (err) {
      this.stopMusicBed(0.05);
      throw err;
    }
  }
  stopMusicBed(fade = 0.8) {
    let bed = this.mbed;
    if (!bed) return;
    this.mbed = null;
    try {
      let now = this.ctx.currentTime;
      bed.out.gain.cancelScheduledValues(now);
      bed.out.gain.setTargetAtTime(0, now, fade / 4);
      for (let node of bed.nodes) node.stop(now + fade + 0.1);
    } catch {}
  }
  /* 3.43.0: the room tone - the quiet, steady bed of a biome. It plays wherever the game is (home,
       upgrade, pause, fight): the world is never dead silence. It sits on the ambience bus under the
       place and the music and takes no voice of the budget (like the atmospheres of the music). */
  startTone(name) {
    let ctx = this.ctx;
    if (!ctx || this.toneBed) return;
    // 3.46.0: same hardening as the beds (3.43.1) — registered before the build: if the build
    // throws midway, the catch below stops the loops that already started (they used to be
    // orphaned forever while syncTone retried the build every 30 ms tick, stacking a new
    // orphan set each time). A tone that failed gets one more try after 10 s.
    let dead = this.deadTone[name];
    if (dead != null && ctx.currentTime - dead < 10) return;
    let now = ctx.currentTime,
      gain = ctx.createGain(),
      nodes = [],
      level = ROOM_TONE_LEVEL[name] || 0.028;
    this.toneBed = { name, gain, nodes, boss: false };
    try {
      // the room arrives slowly (a new biome breathes in, it does not switch on)
      gain.gain.setValueAtTime(1e-4, now);
      gain.gain.setTargetAtTime(level, now, 1.2);
      gain.connect(this.ambBus);
      let osc = (type, freq) => {
          let node = ctx.createOscillator();
          node.type = type;
          node.frequency.value = freq;
          node.start(now);
          nodes.push(node);
          return node;
        },
        loop = (rate, color) => {
          let node = this.noiseLoop(rate, color, now);
          nodes.push(node);
          return node;
        },
        filter = (type, freq, q, from) => {
          let node = ctx.createBiquadFilter();
          node.type = type;
          node.frequency.value = freq;
          node.Q.value = q;
          from.connect(node);
          return node;
        },
        amp = (from, vol) => {
          let node = ctx.createGain();
          node.gain.value = vol;
          from.connect(node);
          node.connect(gain);
          return node;
        },
        // a slow wander of a filter or a level: the room never stands still, but it never moves fast
        drift = (param, freq, depth) => {
          let lfo = osc("sine", freq),
            depthGain = ctx.createGain();
          depthGain.gain.value = depth;
          lfo.connect(depthGain);
          depthGain.connect(param);
        };
      const recipes = {
        courtyard: [238, 2.1, 0.08, 65, 1280],
        shelf: [940, 1.7, 0.053, 113, 2810],
        marsh: [387, 1.3, 0.119, 83, 1460],
        core: [510, 3.7, 0.072, 94, 1860],
        flats: [729, 1.5, 0.103, 109, 2390],
        caldera: [189, 1.2, 0.067, 71, 1110],
      };
      const [air, q, pace, low, high] = recipes[name] || recipes.courtyard;
      const wash = filter("bandpass", air, q, loop(0.68, "pink"));
      drift(wash.frequency, pace, air * 0.34);
      const washGain = amp(wash, 0.43);
      drift(washGain.gain, pace * 0.81, 0.15);
      const ring = amp(osc("sine", low), 0.17);
      drift(ring.gain, pace * 1.67, 0.069);
      amp(filter("bandpass", high, 5, loop(0.79, "brown")), 0.06);
    } catch (err) {
      // back out cleanly: stop what started (stopTone also detaches the nodes and the gain),
      // mark the tone dead for 10 s, and report like the rest of the engine
      this.stopTone(name, 0, 0.05);
      this.deadTone[name] = ctx.currentTime;
      this.fail(err);
      return;
    }
  }
  stopTone(name, at = 0, fade = 1.2) {
    let tone = this.toneBed;
    if (!tone || (name && tone.name !== name)) return;
    this.toneBed = null;
    let now = this.ctx.currentTime + at,
      end = now + Math.max(0.3, fade * 2.5);
    try {
      tone.gain.gain.cancelScheduledValues(now);
      tone.gain.gain.setTargetAtTime(0, now, fade * 0.5);
      for (let node of tone.nodes) node.stop(end);
      // 3.46.0: the nodes are detached instead of relying on GC — after the fade (an immediate
      // detach used to cut it), and never in the offline renders (the render happens after the
      // scheduling pass: a detached node's window would never sound)
      if (!this.offline)
        setTimeout(
          () => {
            try {
              for (let node of tone.nodes) node.disconnect();
              tone.gain.disconnect();
            } catch {}
          },
          Math.max(0, end - this.ctx.currentTime) * 1000 + 150,
        );
    } catch {}
  }
  /* Runs with the scheduler: keeps the room tone of the current biome alive (menu, upgrade, pause and
       fight alike), crossfades it on a biome change and dips it a little while a boss carries the track. */
  syncTone() {
    let ctx = this.ctx;
    if (!ctx) return;
    let want = this.mode !== "off" && this.ambVol > 0 ? this.wantBiome() : null;
    if (this.toneBed && (!want || this.toneBed.name !== want)) this.stopTone();
    // 3.46.0: a tone whose build threw gets one more try after 10 s (was: dead for the session)
    if (want && !this.toneBed) {
      let dead = this.deadTone[want];
      if (dead == null || ctx.currentTime - dead >= 10) this.startTone(want);
    }
    if (this.toneBed) {
      let boss = this.playKind === "boss";
      if (boss !== this.toneBed.boss) {
        this.toneBed.boss = boss;
        try {
          let now = ctx.currentTime,
            level = ROOM_TONE_LEVEL[this.toneBed.name] || 0.028;
          this.toneBed.gain.gain.setTargetAtTime(boss ? level * 0.55 : level, now, 0.9);
        } catch {}
      }
    }
  }
  /* Runs with the scheduler: starts and stops the beds by the state set with setState and plays the
     periodic accents of the biome events. */
  syncAudio() {
    let ctx = this.ctx,
      now = ctx.currentTime,
      live = now - this.liveT < 0.8 && (this.mode === "fight" || this.mode === "boss"),
      hum = live && this.sfxVol > 0 && this.speed != null,
      amb = live && this.ambVol > 0 ? this.amb : null;
    if (hum !== !!this.beds.hum) {
      if (hum) this.startBed("hum");
      else this.stopBed("hum");
    }
    for (let name of Object.keys(this.beds)) {
      if (name !== "hum" && name !== amb) this.stopBed(name);
    }
    // 3.46.0: a bed whose build threw gets one more try after 10 s (was: dead for the session)
    let dead = amb ? this.deadBeds[amb] : null;
    if (amb && !this.beds[amb] && (dead == null || now - dead >= 10)) this.startBed(amb);
    if (amb && now >= this.accentT) this.accent(amb, now);
    if (this.voices.length > 8) {
      for (let i = this.voices.length - 1; i >= 0; i--)
        if (this.voices[i].end < now) {
          this.voices[i] = this.voices[this.voices.length - 1];
          this.voices.pop();
        }
    }
  }
  accent(name, now) {
    // 3.31.1: the sounds of a biome event give way to the fight like the sounds of the place (they took voices from it)
    this.curPri = 0.5;
    this.curBus = this.ambBus;
    try {
      this.accentOf(name, now);
    } finally {
      this.curPri = 1;
      this.curBus = null;
    }
  }
  accentOf(name, now) {
    const accents = {
      whiteout: [874, 1417, 1.2, "bow", 0.024],
      bloom: [334, 472, 0.43, "reed", 0.02],
      duskfall: [193, 121, 0.84, "ceramic", 0.034],
      riftstorm: [277, 415, 0.98, "brass", 0.023],
      ashfall: [208, 128, 0.76, "reed", 0.031],
    };
    this.accentT = now + 4.3 + Math.random() * 5.1;
    const recipe = accents[name];
    if (!recipe) return;
    const [start, end, dur, wave, vol] = recipe;
    const drift = 0.91 + Math.random() * 0.18;
    const pan = (Math.random() - 0.5) * 1.05;
    this.tone(start * drift, dur, wave, vol, { to: end * drift, attack: dur * 0.19, pan, lp: 1900 });
    this.noise(dur * 1.2, vol * 0.7, {
      f: start * 2.4,
      to: end * 2.4,
      type: "bandpass",
      color: "pink",
      attack: dur * 0.41,
      pan: -pan,
    });
  }
  startScheduler() {
    if (!this.timer) {
      this.nextT = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => {
        try {
          this.schedule();
          this.schedFails = 0;
        } catch (err) {
          // 3.46.0: one throw used to clear the interval for the whole session — music, beds,
          // the hum, the room tone and the voice pruning all died silently. Report, release
          // the timer and re-arm with a growing backoff; the note loop is guarded per step.
          this.fail(err);
          clearInterval(this.timer);
          this.timer = null;
          if (this.ctx && !this.offline) {
            this.schedFails = (this.schedFails || 0) + 1;
            if (this.schedFails <= 5) {
              setTimeout(() => {
                if (this.ctx && !this.timer) this.startScheduler();
              }, 1000 * this.schedFails);
            }
          }
        }
      }, 30);
    }
  }
  schedule() {
    let ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    try {
      this.syncAudio();
      this.syncTone();
    } catch (err) {
      this.fail(err);
    }
    this.syncTrack();
    if (this.nextT < ctx.currentTime - 0.5) {
      this.nextT = ctx.currentTime + 0.05;
    }
    for (; this.nextT < ctx.currentTime + 0.14;) {
      let info = trackInfo(this.playKind, this.playBiome);
      try {
        if (this.playKind !== "off" && this.musVol > 0) {
          this.note(this.step, this.nextT);
        }
      } catch (err) {
        // 3.46.0: one bad note must not kill the whole tick — the step still advances
        this.fail(err);
      }
      this.nextT += 60 / info.bpm / 4;
      this.step = (this.step + 1) % info.steps;
      if (this.jump && this.step % 16 === 0) {
        // phase change or enrage: back to the drop (its head brings the hit, see sectionHit)
        this.jump = false;
        this.step = 0;
      }
      if (this.step === 0) {
        this.cycle++;
      }
      this.intensity += (this.want - this.intensity) * 0.02;
    }
  }
  note(step, time) {
    if (this.playKind !== "off") playScore(this, this.playKind, this.playBiome, step, time - this.ctx.currentTime);
  }
  static catalog() {
    return rlSoundCatalog();
  }
  static trackInfo(kind, biome) {
    return trackInfo(kind, biome);
  }
  /* Test hook: schedules `loops` loops of a track (nothing is rendered) and returns the counters of the voice
       budget (musicPeak: most voices alive at once; musicSkipped and musicShed: notes the budget refused) and the
       log of every voice, so that two runs (for example with a flood of sounds) can be compared note by note.
       spec: music (fight|boss), biome, loops, intensity, heat, flood (sounds per step) */
  static musicBudget(spec) {
    let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
      ctx = new Offline(1, 44100, 44100),
      engine = new SoundEngine(),
      info = trackInfo(spec.music, spec.biome),
      len = 60 / info.bpm / 4;
    engine.budgetOnly = spec.renderGraph !== true;
    engine.attach(ctx, { room: false });
    // This hook schedules counters and logs, never samples. Real native sources would stay
    // attached to unrendered OfflineAudioContexts and retain gigabytes across budget cases.
    // renderGraph is a bounded parity-test reference; actual offline renders always build nodes.
    engine.budgetOnly = spec.renderGraph !== true;
    engine.sfxVol = 1;
    engine.mode = spec.music;
    engine.biome = spec.biome;
    engine.playKind = spec.music;
    engine.playBiome = spec.biome;
    engine.intensity = spec.intensity != null ? spec.intensity : 1;
    engine.heat = spec.heat || 0;
    engine.mixFor(spec.music);
    engine.musicLog = [];
    for (let n = 0; n < info.steps * (spec.loops || 1); n++) {
      engine.simT = n * len;
      engine.cycle = Math.floor(n / info.steps);
      engine.note(n % info.steps, engine.simT);
      for (let k = 0; k < (spec.flood || 0); k++) {
        engine.last = Object.create(null);
        let flood = RL_FLOOD[(n * 7 + k) % RL_FLOOD.length];
        engine.play(flood[0], flood[1]);
      }
    }
    engine.simT = null;
    return {
      steps: info.steps * (spec.loops || 1),
      seconds: info.steps * (spec.loops || 1) * len,
      scheduled: engine.musicScheduled,
      skipped: engine.musicSkipped,
      shed: engine.musicShed,
      peak: engine.musicPeak,
      dropped: engine.dropped,
      failed: !!engine.failed,
      log: engine.musicLog,
    };
  }
  /* Test hook: render one sound (or a bed, or a stretch of music) offline: mono, 44.1 kHz. The sound
     starts 0.25 s into the render (like in the game, where the compressors are already running). */
  static async renderOffline(spec, seconds = 2) {
    let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
      // 3.19.0 (test): spec.stereo renders two channels (samples is the left one, samplesR the right one); spec.bloom
      // false leaves out the ambient bloom
      ctx = new Offline(spec.stereo ? 2 : 1, Math.ceil(44100 * (seconds + 0.35)), 44100),
      engine = new SoundEngine(),
      base = 0;
    if (spec.bloom === false) engine.bloom = false;
    // with spec.seed the noise of the engine and the sound's own random choices are seeded (see below); spec.room
    // false leaves out the reverbs (the convolver of Chrome renders its tail on another thread, not quite the same
    // every time)
    const seeded = (fn) => {
      if (spec.seed == null) return fn();
      const random = Math.random;
      Math.random = makeSeeded(spec.seed);
      try {
        return fn();
      } finally {
        Math.random = random;
      }
    };
    seeded(() => engine.attach(ctx, { room: spec.room !== false }));
    await engine.physical.ready;
    engine.sfxVol = 1;
    // balance probe (scripts/rl-mix-probe.mjs): spec.vol sets the three bus volumes the way the game
    // would have them (the forced sfxVol = 1 above stays for every other caller)
    if (spec.vol) engine.setVolumes(spec.vol.sfx ?? 1, spec.vol.mus ?? engine.musVol, spec.vol.amb ?? engine.ambVol);
    if (spec.burst)
      for (let i = 1; i < spec.burst.n; i++)
        ctx.suspend(0.25 + i * spec.burst.interval).then(() => {
          engine.play(spec.burst.id, spec.burst.arg);
          ctx.resume();
        });
    if (spec.quietAt != null)
      ctx.suspend(0.25 + spec.quietAt).then(() => {
        engine.quietOld(ctx.currentTime);
        ctx.resume();
      });
    ctx.suspend(0.25).then(() => {
      base = ctx.currentTime;
      if (spec.bed) {
        engine.startBed(spec.bed);
        engine.stopBed(spec.bed, spec.stopAt || 1.2, spec.stopRel);
      } else if (spec.tone) {
        // 3.43.0: a short take of a room tone, with a quick test fade (the real one breathes slower)
        engine.startTone(spec.tone);
        engine.stopTone(spec.tone, spec.stopAt || 1.0, spec.fade || 0.25);
      } else if (spec.music) {
        // 3.1.0: `seconds` of a calm theme or boss track from bar `fromBar`, at intensity `intensity` (calm) and
        // heat `heat` (boss); musicLog (spec.log) records every music voice, `impact` plays the start of a boss track
        engine.mode = spec.music;
        engine.biome = spec.biome;
        engine.playKind = spec.music;
        engine.playBiome = spec.biome;
        engine.intensity = spec.intensity != null ? spec.intensity : 0.9;
        engine.heat = spec.heat || 0;
        if (spec.log) engine.musicLog = [];
        let info = trackInfo(spec.music, spec.biome),
          len = 60 / info.bpm / 4,
          first = (spec.fromBar || 0) * 16;
        engine.fade.gain.value = musicTrack(spec.music, spec.biome).gain;
        engine.mixFor(spec.music);
        // 3.18.1: with spec.seed the random choices of the music (its notes, its atmosphere) are seeded as well, so that
        // the numbers of the deep test do not change from run to run
        seeded(() => {
          if (!spec.noBed) engine.startMusicBed(spec.music, spec.biome, 0.05);
          if (spec.impact) musicImpact(engine, spec.biome, 0);
          // 3.18.1 (test): the track ends at spec.musicEnd s and spec.quietAt s is the moment of a track change
          for (
            let n = 0, t = 0;
            t < Math.min(seconds - 0.25, spec.musicEnd != null ? spec.musicEnd : 1e9);
            n++, t += len
          ) {
            engine.simT = base + t;
            engine.cycle = Math.floor((first + n) / info.steps);
            engine.note((first + n) % info.steps, base + t);
            // 2.9.0: a flood of sounds in every step; the music notes must all be scheduled anyway
            if (spec.flood)
              for (let k = 0; k < 30; k++) {
                engine.last = Object.create(null);
                let flood = RL_FLOOD[(n * 7 + k) % RL_FLOOD.length];
                engine.play(flood[0], flood[1]);
              }
          }
        });
        engine.simT = null;
      } else if (spec.burst) {
        // 2.9.2: continuous fire of one sound: the first shot now, the others at times registered
        // before rendering starts (see below), so the rate gate and the voice limit behave as in the game
        engine.play(spec.burst.id, spec.burst.arg);
      } else if (spec.noise) {
        // 2.9.1: a raw noise burst (tests that long bursts are not cut off)
        engine.noise(spec.noise.dur, spec.noise.vol, spec.noise.opts || {});
      } else {
        // seeded: a comparison of sounds (tests/deep-test.mjs) gives the same result every time (the sounds vary
        // their pitch and noise at random); the whole sound is scheduled right here
        seeded(() => engine.play(spec.id, spec.arg));
      }
      ctx.resume();
    });
    let buffer = await ctx.startRendering(),
      data = buffer.getChannelData(0),
      peak = 0,
      sum = 0,
      finite = true;
    for (let i = 0; i < data.length; i++) {
      let v = data[i];
      if (!Number.isFinite(v)) {
        finite = false;
        break;
      }
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    let last = 0;
    for (let i = data.length - 1; i >= 0; i--)
      if (Math.abs(data[i]) > 1e-3) {
        last = i / 44100 - base;
        break;
      }
    return {
      finite,
      peak,
      rms: Math.sqrt(sum / data.length),
      length: data.length / 44100 - base,
      lastAudible: last,
      maxEnd: engine.maxEnd - base,
      dropped: engine.dropped,
      musicScheduled: engine.musicScheduled,
      musicSkipped: engine.musicSkipped,
      musicShed: engine.musicShed,
      musicPeak: engine.musicPeak,
      musicLog: engine.musicLog,
      bpm: spec.music ? trackInfo(spec.music, spec.biome).bpm : 0,
      failed: !!engine.failed,
      physicalReady: !!engine.physical.bank,
      samples: spec.wav ? Array.from(data.subarray(Math.round(base * 44100))) : null,
      samplesR:
        spec.wav && spec.stereo ? Array.from(buffer.getChannelData(1).subarray(Math.round(base * 44100))) : null,
    };
  }
};
const AMB_PREVIEW = {
  courtyard: "galleryChime",
  shelf: "icicles",
  marsh: "drip",
  core: "shimmer",
  caldera: "rockFall",
  flats: "glassPing",
};
function trackInfo(kind, biome) {
  if (kind === "fight" || kind === "boss") {
    const track = musicTrack(kind, biome);
    return { bpm: track.bpm, steps: track.bars * 16 };
  }
  return { bpm: 84, steps: 96 };
}

/* 2.9.0: what the music flood test throws at the engine (sound id, argument): every weapon, deaths, blasts */
const RL_FLOOD = [
  ...RL_SFX_VOICES.map((id) => [id]),
  ["boom"],
  ["hurt"],
  ["nova"],
  ["hit"],
  ["crit"],
  ["kill", 1.8],
  ["dCrunch", 1.6],
  ["dClang", 1.6],
  ["dShatter", 1.6],
  ["bigkill"],
  ["bSlam", "bellkeeper"],
  ["eshotBoss"],
];
function rlSoundCatalog() {
  const list = [],
    add = (name, spec) => list.push({ name, spec }),
    ids = (names, arg) => names.forEach((id) => add(id + (arg !== undefined ? ":" + arg : ""), { id, arg }));
  ids(RL_SFX_VOICES);
  for (const type of ["grunt", "swarmer", "core", "prism", "phantom"])
    for (const id of ["hit", "crit"]) add(`${id}:${type}`, { id, arg: { type } });
  add("hit:shield", { id: "hit", arg: { type: "grunt", shield: true } });
  ids([
    "block",
    "guardBreak",
    "shieldPop",
    "lob",
    "blinkWarn",
    "blink",
    "heart",
    "evolve",
    "hit",
    "crit",
    "bigkill",
    "boom",
    "smallboom",
    "hurt",
    "shield",
    "shieldUp",
    "dash",
    "nova",
    "novaReady",
    "shard",
    "heal",
    "eshot",
    "snipe",
    "eshotDrone",
    "eshotTurret",
    "eshotBoss",
    "eshotKeeper",
    "eshotQueen",
    "eshotCore",
    "eshotPrism",
    "eshotTyrant",
    "eshotWyrm",
    "eshotGunner",
    "bwLaser",
    "bwRift",
    "aGlass",
    "leap",
    "eshotWeaver",
    "eshotCarrier",
    "eshotFrost",
    "tcPyro",
    "tsPyro",
    "tribute",
    "bwCryo",
    "bwAcid",
    "bwFlame",
    "bwFlare",
    "warn",
    "fuse",
    "spawn",
    "wave",
    "boss",
    "click",
    "erupt",
    "devilNear",
    "warp",
    "mend",
    "chill",
    "stun",
    "champion",
    "rumble",
    "ready",
    "buy",
    "deny",
    "die",
    "victory",
    "thud",
    "beam",
    "hover",
    "reroll",
    "offer",
    "pick",
    "cleared",
    "bossCleared",
  ]);
  ids(["kill"], 1.8);
  // 3.9.0: the sounds of the place
  ids(["inlayRelease"]);
  for (const placeId of PLACE_IDS) add("place:" + placeId, { id: "place", arg: { id: placeId } });
  ids(["stun"], "riftburst");
  ids(["combo"], 6);
  ids(["surge"], 1);
  ids(["cleared"], true);
  for (const id of new Set(Object.values(RL_DEATH_FAMILY))) ids([id], 1.6);
  ids([
    "windHeavy",
    "windWhine",
    "windSlash",
    "windDrill",
    "windLeap",
    "lock",
    "servo",
    "plant",
    "guardUp",
    "ram",
    "ramDrill",
    "beamSmall",
    "freeze",
    "chain",
    "wing",
    "bounce",
    "supply",
    "bounty",
    "comboEnd",
    "enrage",
    "phase",
    "bossDown",
  ]);
  ids(["hatch"], 0);
  ids(["hatch"], 1);
  // 3.0.0: the gadget (3.12.0: the Singularity), resisted hits and traps
  ids(["singThrow", "singPull", "singCollapse", "gadgetReady", "gadgetNo", "resist"]);
  // 3.3.0: the Endless mutator
  ids(["mutator"], "volatile");
  // 3.53.0: the sunspike joins the trap families (warn and fire of its own)
  ids(["tcPlate", "tcIce", "tcGeyser", "tcRift", "tcSun"], 1);
  for (const id of ["tbLaser", "tbFlame", "tbRift"]) add(id, { id, arg: { delay: 0.7, dur: 1.2 } });
  ids(["tmMine", "tmFrost", "tmSpore", "tmRift"], 0.45);
  for (const skin of ["mine", "frost", "spore", "riftmine"]) ids(["tArm"], skin);
  ids(["tsPlate", "tsIce", "tsGeyser", "tsRift", "tsMine", "tsFrost", "tsSpore", "tsRiftMine", "tsSun"]);
  // 3.10.0: the blasts of the attacks of enemies and bosses
  ids(["aQuake", "aLava", "aIce", "aAcid", "aRift"], 2);
  ids(["aFire"], 1);
  // 3.34.0: a Shorted enemy's spot arcs, and its warning
  ids(["aShort"], 1.6);
  ids(["shortFizz"]);
  for (const boss of Object.keys(BOSS_EFFECTS)) {
    ids(["bossIntro"], boss);
    for (const id of [
      "bWind",
      "bRing",
      "bSlam",
      "bSummon",
      "bNova",
      "bLance",
      "bRain",
      "bOverdrive",
      "enrage",
      "bossDown",
    ])
      ids([id], boss);
  }
  for (const source of [...Object.keys(BOSS_EFFECTS), "striker", "phantom", "leaper", "weaver", "hive"])
    for (const id of ["blink", "blinkWarn", "thud", "lob", "hatch"])
      add(`${id}:${source}`, { id, arg: { src: source } });
  for (const [skin, voices] of Object.entries(RL_TRAP_SOUND))
    for (const [phase, id] of Object.entries(voices))
      add(`${id}:${skin}`, { id, arg: phase === "warn" ? { delay: 0.8 } : 1 });
  for (const skin of ["embermine", "glassmine"]) add(`tArm:${skin}`, { id: "tArm", arg: skin });
  for (const source of ["beacon", "mender"]) add(`mend:${source}`, { id: "mend", arg: source });
  for (const rarity of [1, 2, 3, 4, 5, 6]) ids(["pick"], rarity);
  // 3.17.0: the walker: a footstep on every ground, the landing after a dash
  for (const ground of ["flagstone", "frost", "ice", "mud", "glass", "acid", "crust", "sandglass"])
    add("step:" + ground, { id: "step", arg: { ground } });
  add("land:crust", { id: "land", arg: { ground: "crust" } });
  ids([
    "sparkCourtyard",
    "sparkShelf",
    "sparkMarsh",
    "sparkCore",
    "sparkCaldera",
    "sparkFlats",
    "propArm",
    "propLantern",
    "propRime",
    "propPuffball",
    "propPrism",
    "propCrucible",
    "propSunglass",
  ]);
  // 3.15.0: the boss cards
  ids(["bcCage", "bcLock", "bcShatter", "bcHatch", "bcBurst", "bcImplode"]);
  for (const id of ["elite", "rain", "duskfall", "whiteout", "bloom", "riftstorm", "ashfall", "devils"])
    ids(["event"], id);
  for (const bed of ["hum", ...Object.keys(AMBIENCE_LEVEL)]) add("bed:" + bed, { bed, stopAt: 1.1, stopRel: 0.1 });
  // 3.43.0: the room tones render too (a short take of each, the real attack is slower than the test fade)
  for (const biome of Object.keys(ROOM_TONE_LEVEL)) add("tone:" + biome, { tone: biome, stopAt: 1.0, fade: 0.25 });
  for (const biome of scoreBiomes)
    for (const music of ["fight", "boss"]) add(`music:${biome}:${music}`, { music, biome });
  return list;
}

export { RL_SFX_VOICES, rlShotSfx, RL_TRAP_SOUND, attackVoice, SoundEngine };
