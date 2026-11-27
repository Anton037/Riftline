// Voice lookup tables, trap sound mappings, room/noise DSP generators and catalog builders for SoundEngine.

import { BOSS_EFFECTS, WEAPON_EFFECTS, BEAM_EFFECTS, attackSurface } from "../data/combat-effects.js";
import { PLACE_IDS } from "./place.js";
import { musicTrack, scoreBiomes } from "./score.js";

// Every supported weapon has an explicit sound identity.
export const RL_SFX_VOICES = Object.keys(WEAPON_EFFECTS);
export const rlShotSfx = (id) => WEAPON_EFFECTS[id]?.shot || "lanternGun";

export const RL_BIOME_SPARK = {
  lanternYard: "sparkCourtyard",
  snowRidge: "sparkShelf",
  mossBog: "sparkMarsh",
  starHall: "sparkCore",
  emberHill: "sparkCaldera",
  sunDunes: "sparkFlats",
};

/* 2.7.0: each of the 25 enemy types dies with a voice of its family. 5.0.0: eleven tactile families so
   clockwork kettle-kin (dClockwork) and arcane constructs (dConstruct) stand apart from armour, flesh,
   electric drones and ghosts. Bosses and champions keep "bigkill". */
export const RL_DEATH_FAMILY = {
  smallBug: "dPop",
  littlePod: "dPop",
  sporePod: "dSquelch",
  mushroomNest: "dSquelch",
  bogHopper: "dSquelch",
  mossHealer: "dSquelch",
  ironGolem: "dArmor",
  blinkBlade: "dArmor",
  shieldGuard: "dArmor",
  burrowMole: "dArmor",
  bellCannon: "dArmor",
  dartSprite: "dZap",
  crystalTower: "dConstruct",
  watchTower: "dZap",
  starGhost: "dGhost",
  starSpider: "dGhost",
  kettleGuard: "dClang",
  brassGuard: "dClang",
  bombMaker: "dRattle",
  firePot: "dClockwork",
  wildBoar: "dClockwork",
  supplyKite: "dSquelch",
  mineCart: "dClockwork",
  longshot: "dClang",
  healingStone: "dConstruct",
};

/* wind-up voices of the "charge" event (enemy types and the bosses that charge) */
export const RL_CHARGE_VOICE = {
  ironGolem: "windHeavy",
  wildBoar: "windWhine",
  blinkBlade: "windSlash",
  burrowMole: "windDrill",
  bogHopper: "windLeap",
  bellKeeper: "bWind",
  iceCrystal: "bWind",
  emberKing: "bWind",
};

/* the "edash" event: the lunge itself */
export const RL_DASH_VOICE = { wildBoar: "ram", blinkBlade: "ram", burrowMole: "ramDrill", starGhost: "blink" };

/* boss attack telegraphs (event "bossAtk"); null: another event of the same attack already sounds
   (charge, beamWarn, blinkWarn, lob, erupt, thud) */
export const RL_BOSS_ATK = {
  charge: null,
  ring: "bRing",
  carillon: "bRing",
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
  sandstorm: null,
  // 3.3.0: the Overdrive attacks (they also sound the Overdrive alarm, bOverdrive)
  bellCage: "bLance",
  whiteout: "bNova",
  plague: "bSummon",
  collapse: "bRain",
  noon: "bRain",
};

// 3.33.0: the warning voice of a beam by its skin (the rest keep "beam" / "beamSmall")
export const BEAM_VOICE = Object.fromEntries(Object.entries(BEAM_EFFECTS).map(([id, effect]) => [id, effect.warning]));
export const RL_OVERDRIVE = new Set(["bellCage", "whiteout", "plague", "collapse", "firestorm", "noon"]);
export const BOSS_WARNING_VOICES = new Set(Object.values(RL_BOSS_ATK).filter(Boolean));

/* 3.10.0: the voice of the blast of an attack zone, by its kind and, where the kind is shared, its maker (the same
   choice as the look in render/attacks-view.js); null: the generic explosion ("boom"). 3.32.0: a blast that chills (a
   Frost mortar's shell) cracks like ice whatever its kind */
export function attackVoice(kind, src, biome, chill) {
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
export const MUSIC_DUCK = {
  fireBurst: 0.29,
  inlayRelease: 0.29,
  bossIntro: 0.29,
  bOverdrive: 0.29,
  enrage: 0.29,
  die: 0.22,
  boom: 0.11,
  surge: 0.1,
  bigkill: 0.15,
  hurt: 0.12,
  bossDown: 0.2,
  phase: 0.16,
  boss: 0.14,
  mutator: 0.14,
  evolve: 0.14,
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
  singCollapse: 0.11,
  bcImplode: 0.11,
  tsRift: 0.08,
  bSlam: 0.12,
  starSpear: 0.06,
  brassShotgun: 0.05,
  emberLauncher: 0.05,
  forgeGift: 0.08,
};

/* 3.2.0: the room of the big sounds (send level to the sound reverb); its size follows the biome (SFX_ROOM_BIOME).
   The trap strikes stay dry: they have to be told apart from the blasts at once. */
export const SFX_ROOM = {
  boom: 0.3,
  surge: 0.3,
  singCollapse: 0.35,
  singPull: 0.25,
  bcImplode: 0.3,
  bcCage: 0.15,
  bcShatter: 0.15,
  fireBurst: 0.3,
  bigkill: 0.35,
  die: 0.3,
  bossIntro: 0.35,
  bossDown: 0.4,
  bSlam: 0.3,
  enrage: 0.3,
  phase: 0.25,
  emberLauncher: 0.15,
  starSpear: 0.15,
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
};

/* how much room each biome gives the sounds: the Snow Ridge and the Shattered Core are vast, the Moss Bog damp;
   3.49.0: the Ember Hill is a crater bowl (rock all around) */
export const SFX_ROOM_BIOME = {
  lanternYard: 0.28,
  snowRidge: 0.5,
  mossBog: 0.2,
  starHall: 0.55,
  emberHill: 0.32,
  sunDunes: 0.3,
};

export const AMBIENCE_LEVEL = { festival: 0.032, aurora: 0.036, nectar: 0.034, starPaths: 0.032, hotWind: 0.038 };
export const ROOM_TONE_LEVEL = {
  lanternYard: 0.024,
  snowRidge: 0.032,
  mossBog: 0.024,
  starHall: 0.024,
  emberHill: 0.026,
  sunDunes: 0.024,
};

/* 3.43.0: the event beds gather and pass instead of snapping on and off - a soundscape builds over about
   three seconds and dies away over about four, while the room tone stays underneath. */
export const BED_ATTACK = { festival: 0.6, aurora: 1.1, nectar: 0.8, starPaths: 1.1, hotWind: 0.9 };
export const BED_RELEASE = { festival: 0.6, aurora: 1.2, nectar: 0.7, starPaths: 1.0, hotWind: 0.9 };

export const EVENT_BEDS = {
  aurora: [1120, 2.8, 0.14, 330, 0.62],
  nectar: [460, 2.4, 0.28, 174, 0.58],
  festival: [360, 2.0, 0.12, 196, 0.68],
  hotWind: [640, 1.7, 0.18, 98, 0.56],
  starPaths: [880, 3.8, 0.22, 220, 0.69],
};

export const ROOM_TONE_RECIPES = {
  lanternYard: [238, 2.1, 0.08, 65, 1280],
  snowRidge: [940, 1.7, 0.053, 113, 2810],
  mossBog: [387, 1.3, 0.119, 83, 1460],
  starHall: [510, 3.7, 0.072, 94, 1860],
  sunDunes: [729, 1.5, 0.103, 109, 2390],
  emberHill: [189, 1.2, 0.067, 71, 1110],
};

export const EVENT_ACCENTS = {
  aurora: [880, 1320, 1.15, "celesta", 0.024],
  nectar: [349, 523, 0.48, "kalimba", 0.022],
  festival: [294, 440, 0.78, "harp", 0.03],
  starPaths: [330, 494, 0.92, "celesta", 0.024],
  hotWind: [196, 294, 0.72, "brass", 0.028],
};

// 3.9.0: the default of the Ambience slider; at it the atmospheres of the music play at the level they had before
export const AMB_REF = 0.8;
export const MUSIC_SCALE = 0.3;
export const MAX_VOICES = 24;
export const MAX_MUSIC_VOICES = 44;
export const MUSIC_RESERVE = 8;
// 3.18.1: how long the notes of the old track take to fade out when the track changes (SoundEngine.quietOld)
export const QUIET_FADE = 0.25;

/* sounds that are never dropped in favour of others when the voice limit is reached */
export const KEY_SOUNDS = new Set([
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
  "fireBurst",
  "guardBreak",
  "cleared",
  "bossCleared",
  "evolve",
  "bigkill",
  "heart",
  "pick",
]);

/* 3.0.0: the sound of each trap skin: charge (floor), hum (beam), fuse (mine) when it warns, and the strike */
export const RL_TRAP_SOUND = {
  plate: { warn: "tcPlate", fire: "tsPlate" },
  icespike: { warn: "tcIce", fire: "tsIce" },
  geyser: { warn: "tcGeyser", fire: "tsGeyser" },
  riftburst: { warn: "tcRift", fire: "tsRift" },
  laser: { warn: "tbLaser" },
  iceShot: { warn: "tbCryo" },
  acid: { warn: "tbAcid" },
  rift: { warn: "tbRift" },
  magma: { warn: "tbFlame" },
  sun: { warn: "tbSun" },
  mine: { warn: "tmMine", fire: "tsMine" },
  frost: { warn: "tmFrost", fire: "tsFrost" },
  spore: { warn: "tmSpore", fire: "tsSpore" },
  riftmine: { warn: "tmRift", fire: "tsRiftMine" },
  embermine: { warn: "tmEmber", fire: "tsEmber" },
  glassmine: { warn: "tmGlass", fire: "tsGlass" },
  // 3.47.0: the fumarole: pressure hisses through basalt before molten rock erupts
  pyro: { warn: "tcPyro", fire: "tsPyro" },
  // 3.53.0: the Flats' sunspike: glass creaks as the pressure builds, then the sheet bursts
  sunspike: { warn: "tcSun", fire: "tsSun" },
};

// Threat cues keep their existing timbres and a voice when routine combat is busy.
export const THREAT_WARNING_VOICES = new Set([
  "lock",
  "fuse",
  ...Object.values(RL_CHARGE_VOICE),
  "servo",
  "beam",
  "beamSmall",
  ...Object.values(BEAM_VOICE),
  ...Object.values(RL_TRAP_SOUND).map((voice) => voice.warn),
]);

export const AMB_PREVIEW = {
  lanternYard: "galleryChime",
  snowRidge: "icicles",
  mossBog: "drip",
  starHall: "shimmer",
  emberHill: "rockFall",
  sunDunes: "glassPing",
};

/* 2.9.0: what the music flood test throws at the engine (sound id, argument): every weapon, deaths, blasts */
export const RL_FLOOD = [
  ...RL_SFX_VOICES.map((id) => [id]),
  ["boom"],
  ["hurt"],
  ["fireBurst"],
  ["hit"],
  ["crit"],
  ["kill", 1.8],
  ["dSquelch", 1.6],
  ["dClang", 1.6],
  ["dConstruct", 1.6],
  ["bigkill"],
  ["bSlam", "bellKeeper"],
  ["eshotBoss"],
];

/* a small seeded random generator (0..1) for the offline test renders */
export function makeSeeded(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/* 3.2.0: the impulse of the music reverb: stereo noise that decays exponentially and gets darker as it decays */
const impulseCache = Object.create(null);
export function roomImpulse(ctx, seconds) {
  let key = ctx.sampleRate + ":" + seconds;
  if (impulseCache[key]) return impulseCache[key];
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
   per sample rate. */
const colorCache = Object.create(null);
export function colorNoise(ctx, color) {
  const key = color + ":" + ctx.sampleRate;
  if (colorCache[key]) return colorCache[key];
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
export function softClipCurve() {
  let n = 2049,
    curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = (i / (n - 1)) * 2 - 1,
      a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return curve;
}

export function trackInfo(kind, biome) {
  if (kind === "fight" || kind === "boss" || kind === "menu") {
    const track = musicTrack(kind, biome);
    return { bpm: track.bpm, steps: track.bars * 16, gain: track.gain, jumpStep: track.jumpStep ?? 16 };
  }
  return { bpm: 84, steps: 256 };
}

export function rlSoundCatalog() {
  const list = [],
    add = (name, spec) => list.push({ name, spec }),
    ids = (names, arg) => names.forEach((id) => add(id + (arg !== undefined ? ":" + arg : ""), { id, arg }));
  ids(RL_SFX_VOICES);
  for (const type of ["kettleGuard", "smallBug", "starHeart", "iceCrystal", "starGhost"])
    for (const id of ["hit", "crit"]) add(`${id}:${type}`, { id, arg: { type } });
  add("hit:shield", { id: "hit", arg: { type: "kettleGuard", shield: true } });
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
    "fireBurst",
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
    "forgeGift",
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
    "anvil",
    "seal",
    "equip",
    "milestone",
    "superCrit",
  ]);
  ids(["hatch"], 0);
  ids(["hatch"], 1);
  ids(["singThrow", "singPull", "singCollapse", "gadgetReady", "gadgetNo", "resist"]);
  ids(["mutator"], "volatile");
  ids(["tcPlate", "tcIce", "tcGeyser", "tcRift", "tcSun"], 1);
  for (const id of ["tbLaser", "tbFlame", "tbRift", "tbCryo", "tbAcid", "tbSun"])
    add(id, { id, arg: { delay: 0.7, dur: 1.2 } });
  ids(["tmMine", "tmFrost", "tmSpore", "tmRift"], 0.45);
  for (const skin of ["mine", "frost", "spore", "riftmine"]) ids(["tArm"], skin);
  ids(["tsPlate", "tsIce", "tsGeyser", "tsRift", "tsMine", "tsFrost", "tsSpore", "tsRiftMine", "tsSun"]);
  ids(["aQuake", "aLava", "aIce", "aAcid", "aRift"], 2);
  ids(["aFire"], 1);
  ids(["aShort"], 1.6);
  ids(["shortFizz", "graze", "heatShatter", "corrode", "singe", "glare", "forgeGift"]);
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
  for (const source of [
    ...Object.keys(BOSS_EFFECTS),
    "blinkBlade",
    "starGhost",
    "bogHopper",
    "starSpider",
    "mushroomNest",
  ])
    for (const id of ["blink", "blinkWarn", "thud", "lob", "hatch"])
      add(`${id}:${source}`, { id, arg: { src: source } });
  for (const [skin, voices] of Object.entries(RL_TRAP_SOUND))
    for (const [phase, id] of Object.entries(voices))
      add(`${id}:${skin}`, { id, arg: phase === "warn" ? { delay: 0.8 } : 1 });
  for (const skin of ["embermine", "glassmine"]) add(`tArm:${skin}`, { id: "tArm", arg: skin });
  for (const source of ["healingStone", "mossHealer"]) add(`mend:${source}`, { id: "mend", arg: source });
  for (const rarity of [1, 2, 3, 4, 5, 6]) ids(["pick"], rarity);
  for (const ground of ["flagstone", "frost", "ice", "mud", "glass", "acid", "crust", "sandglass"])
    add("step:" + ground, { id: "step", arg: { ground } });
  add("land:crust", { id: "land", arg: { ground: "crust" } });
  ids(["sparkCourtyard", "sparkShelf", "sparkMarsh", "sparkCore", "sparkCaldera", "sparkFlats"]);
  ids(["bcCage", "bcLock", "bcShatter", "bcHatch", "bcBurst", "bcImplode"]);
  for (const id of ["goldCart", "starfall", "festival", "aurora", "nectar", "starPaths", "hotWind", "sandstorm"])
    ids(["event"], id);
  for (const bed of ["hum", ...Object.keys(AMBIENCE_LEVEL)]) add("bed:" + bed, { bed, stopAt: 1.1, stopRel: 0.1 });
  for (const biome of Object.keys(ROOM_TONE_LEVEL)) add("tone:" + biome, { tone: biome, stopAt: 1.0, fade: 0.25 });
  for (const biome of scoreBiomes)
    for (const music of ["fight", "boss"]) add(`music:${biome}:${music}`, { music, biome });
  return list;
}
