// Recorded material transients and damped physical bodies, shared by combat and place sounds.
import { SOURCE_CLIPS } from "./source-bank.js";
import { actorMaterial } from "../data/materials.js";

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
  report: "ppsh_P_22P",
  rifle: "rifle_fire",
  shotgun: "shotgun_fire",
  metal: "impactMetal_light_000",
  plate: "impactPlate_heavy_000",
  heavy: "impactMetal_heavy_000",
  glass: "impactGlass_heavy_000",
  flesh: "impactPunch_heavy_000",
  soft: "impactSoft_heavy_000",
  wood: "impactWood_medium_000",
  blade: "axe-norse-sword-blade-on-blade",
  concrete: "footstep_concrete_000",
  snow: "footstep_snow_000",
  grass: "footstep_grass_000",
  timber: "footstep_wood_000",
};
const P = {
  pulse: { dur: 0.19, sample: "report", body: 155, air: 0.09, grain: 0.12, gain: 0.3, gate: 0.045 },
  scatter: { dur: 0.38, sample: "shotgun", body: 78, air: 0.3, grain: 0.22, gain: 0.46, gate: 0.08 },
  tesla: { dur: 0.19, sample: "metal", body: 360, air: 0.18, grain: 0.35, gain: 0.3, gate: 0.045 },
  rail: { dur: 0.53, sample: "rifle", body: 63, air: 0.26, grain: 0.13, gain: 0.48, gate: 0.09 },
  rocket: { dur: 0.45, sample: "heavy", body: 84, air: 0.4, grain: 0.1, gain: 0.38, gate: 0.08 },
  disc: { dur: 0.27, sample: "blade", body: 470, air: 0.09, grain: 0.1, gain: 0.25, gate: 0.06 },
  flame: { dur: 0.23, sample: "soft", body: 125, air: 0.5, grain: 0.12, gain: 0.26, gate: 0.07, hold: true },
  event: { dur: 1.25, sample: "heavy", body: 58, air: 0.32, grain: 0.1, gain: 0.33, gate: 0.4 },
  impact: { dur: 0.16, sample: "metal", body: 230, air: 0.1, grain: 0.05, gain: 0.19, gate: 0.025 },
  hitArmor: { dur: 0.13, sample: "heavy", body: 135, air: 0.035, grain: 0.015, gain: 0.2, gate: 0.035, lowpass: 2200 },
  hitOrganic: { dur: 0.14, sample: "flesh", body: 95, air: 0.05, grain: 0.025, gain: 0.21, gate: 0.035, lowpass: 1800 },
  hitStone: { dur: 0.16, sample: "wood", body: 110, air: 0.07, grain: 0.065, gain: 0.2, gate: 0.035, lowpass: 2600 },
  hitCrystal: {
    dur: 0.17,
    sample: "glass",
    body: 480,
    air: 0.07,
    grain: 0.035,
    gain: 0.17,
    gate: 0.035,
    lowpass: 6000,
  },
  hitEnergy: { dur: 0.14, sample: "soft", body: 180, air: 0.16, grain: 0.03, gain: 0.2, gate: 0.035, lowpass: 1600 },
  organic: { dur: 0.29, sample: "flesh", body: 95, air: 0.13, grain: 0.1, gain: 0.25, gate: 0.035 },
  armor: { dur: 0.4, sample: "plate", body: 135, air: 0.12, grain: 0.08, gain: 0.28, gate: 0.04 },
  glass: { dur: 0.4, sample: "glass", body: 710, air: 0.15, grain: 0.2, gain: 0.24, gate: 0.045 },
  debris: { dur: 0.44, sample: "heavy", body: 115, air: 0.16, grain: 0.15, gain: 0.25, gate: 0.04 },
  boom: { dur: 0.82, sample: "heavy", body: 52, air: 0.46, grain: 0.07, gain: 0.47, gate: 0.09 },
  wind: { dur: 0.43, sample: "soft", body: 180, air: 0.32, grain: 0.08, gain: 0.21, gate: 0.09 },
  warning: { dur: 0.65, sample: "metal", body: 610, air: 0.17, grain: 0.12, gain: 0.25, gate: 0.14, warn: true },
  ui: { dur: 0.11, sample: "metal", body: 480, air: 0.04, grain: 0.03, gain: 0.14, gate: 0.06 },
  reward: { dur: 0.55, sample: "glass", body: 810, air: 0.04, grain: 0.02, gain: 0.22, gate: 0.09 },
  step: { dur: 0.22, sample: "concrete", body: 125, air: 0.06, grain: 0.03, gain: 0.23, gate: 0.045 },
  room: { dur: 0.8, sample: "soft", body: 76, air: 0.4, grain: 0.09, gain: 0.16, gate: 0.08 },
  rain: { dur: 0.3, model: "rain", body: 1600, gain: 0.24, gate: 0 },
  water: { dur: 0.42, model: "water", body: 260, gain: 0.24, gate: 0 },
  air: { dur: 0.95, model: "air", body: 45, gain: 0.3, gate: 0, hold: true },
  bird: { dur: 0.55, model: "bird", body: 2100, gain: 0.23, gate: 0 },
  insect: { dur: 0.36, model: "insect", body: 3800, gain: 0.2, gate: 0 },
  frog: { dur: 0.46, model: "frog", body: 330, gain: 0.25, gate: 0 },
  mammal: { dur: 0.65, model: "mammal", body: 210, gain: 0.24, gate: 0 },
  engine: { dur: 1.2, model: "engine", body: 65, gain: 0.24, gate: 0 },
  rotor: { dur: 1.2, model: "rotor", body: 26, gain: 0.25, gate: 0 },
  horn: { dur: 0.65, model: "horn", body: 390, gain: 0.22, gate: 0 },
  siren: { dur: 1.2, model: "siren", body: 640, gain: 0.2, gate: 0 },
  radio: { dur: 0.55, model: "radio", body: 560, gain: 0.24, gate: 0 },
  buzz: { dur: 0.7, model: "buzz", body: 60, gain: 0.22, gate: 0 },
};
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
    family = /helicopter/i.test(id)
      ? "rotor"
      : /carPass/i.test(id)
        ? "engine"
        : /siren|carAlarm/i.test(id)
          ? "siren"
          : /horn/i.test(id)
            ? "horn"
            : /radio/i.test(id)
              ? "radio"
              : /lampBuzz/i.test(id)
                ? "buzz"
                : /rainDrop/i.test(id)
                  ? "rain"
                  : /gutter|drip|bubble|blub|mud|gurgle|splash/i.test(id)
                    ? "water"
                    : /cricket|cicada|insect/i.test(id)
                      ? "insect"
                      : /frog/i.test(id)
                        ? "frog"
                        : /bird|owl|heron|chirp/i.test(id)
                          ? "bird"
                          : /dog|howl/i.test(id)
                            ? "mammal"
                            : /wind|gust|breeze|hiss|sizzle|dustRush|steamBlast|fumarole|breath/i.test(id)
                              ? "air"
                              : /thunder|boom|avalanche|fall|quake|rubble/i.test(id)
                                ? "boom"
                                : /ice|icicle|glass|crack|shimmer|creak/i.test(id)
                                  ? "glass"
                                  : /spark|cl[au]nk|anvil|metal|vent/i.test(id)
                                    ? "armor"
                                    : "room";
  } else if (!P[id]) {
    if (/^(tc|tm|tb|bw)|warn|wind|lock|servo|fuse|bWind|tArm|^beam(?:Small)?$/i.test(id)) family = "warning";
    else if (/boom|nova$|slam|thud|erupt|quake|collapse|bigkill|die|hammer/i.test(id)) family = "boom";
    else if (/^dSquelch|dCrunch|dPop|hatch|brood/i.test(id)) family = "organic";
    else if (/^dArmor|dClang|block|guard|shield|plant|ram|resist/i.test(id)) family = "armor";
    else if (/dShatter|frost|freeze|cryo|^tsIce|^tsFrost|aIce/i.test(id)) family = "glass";
    else if (/^d|kill/i.test(id)) family = "debris";
    else if (/eshot|snipe|wing|lob|chain/i.test(id)) family = /Queen|Weaver|Frost|Prism/.test(id) ? "tesla" : "pulse";
    else if (/step|land/.test(id)) family = "step";
    else if (/dash|blink|warp|singPull|hover|devil/i.test(id)) family = "wind";
    else if (/ready|buy|pick|clear|victory|heal|evolve|shard|tribute|bounty|reward|surge/i.test(id)) family = "reward";
    else if (/beam|rift|stun|chill|short|zap/i.test(id)) family = "tesla";
    else if (/^ts|^a[A-Z]|^bc|boss|phase|enrage|rumble/i.test(id)) family = "boom";
    else if (/click|deny|offer|reroll|supply|combo|wave|spawn|mend|gadget/i.test(id)) family = "ui";
  }
  const p = { ...P[family], family };
  if (id === "heart")
    Object.assign(p, P.organic, { family: "organic", sample: "soft", body: 52, dur: 0.34, gain: 0.19 });
  if (id === "hurt") Object.assign(p, P.organic, { family: "organic", body: 78, gain: 0.38 });
  if (id === "dPop") Object.assign(p, { sample: "soft", body: 175, dur: 0.17, gain: 0.16 });
  if (id === "dGhost") Object.assign(p, P.wind, { family: "wind", body: 96, dur: 0.5, gain: 0.18 });
  if (id === "dZap") Object.assign(p, P.tesla, { family: "tesla", dur: 0.27, gain: 0.23 });
  if (id === "eshotQueen") Object.assign(p, P.organic, { family: "organic", dur: 0.18, body: 190, gain: 0.23 });
  if (/eshotPrism|eshotFrost/.test(id)) Object.assign(p, P.glass, { family: "glass", dur: 0.23, gain: 0.22 });
  if (place && /owl/i.test(id)) p.body = 470;
  if (place && /heron/i.test(id)) p.body = 780;

  // A few inharmonic material modes identify cues without melodic arcade pitch sweeps.
  p.body *= P[id] ? 1 : 0.84 + (hash(id) % 39) / 100;
  if (p.warn) {
    const delay = typeof arg === "number" ? arg : arg?.delay;
    if (Number.isFinite(delay)) p.dur = Math.max(0.12, Math.min(1.5, delay));
  }
  if (family === "step") {
    const ground = arg?.ground;
    p.sample = /ice|snow/.test(ground)
      ? "snow"
      : /peat|mud|water|grass/.test(ground)
        ? "grass"
        : /wood/.test(ground)
          ? "timber"
          : "concrete";
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
      p.model ? "model" : !!this.bank,
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
    const center = p.model === "air" ? 0.08 : p.family === "tesla" ? 0.4 : p.family === "flame" ? 0.14 : 0.23;
    for (let i = 0; i < n; i++) {
      const t = i / rate,
        x = t / p.dur;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const noise = state / 2147483648 - 1;
      low += 0.035 * (noise - low);
      band += center * (noise - band);
      if (p.model) {
        // Air, water and calls have their own excitation; a metal/weapon recording cannot leak into them.
        const bell = Math.sin(Math.PI * x) ** 2;
        const pitch =
          p.model === "bird"
            ? 0.8 + 0.3 * Math.sin(Math.PI * x)
            : p.model === "siren"
              ? 1 + 0.22 * Math.sin(t * Math.PI * 2 * 1.3)
              : 1 + 0.5 * Math.exp(-t * 25);
        phase += (Math.PI * 2 * p.body * pitch) / rate;
        let value = 0;
        if (p.model === "air") value = (low * 0.6 + band * 0.4) * bell * 0.9;
        else if (p.model === "rain") value = (noise * 0.22 + Math.sin(phase) * 0.12) * Math.exp(-t * 23);
        else if (p.model === "water")
          value = (Math.sin(phase) * 0.23 + band * 0.08) * Math.exp(-t * 12) * (0.7 + 0.3 * Math.sin(t * 71) ** 2);
        else if (p.model === "insect")
          value = Math.sin(phase) * Math.max(0, Math.sin(t * 2 * Math.PI * 22)) ** 4 * bell * 0.22;
        else if (p.model === "frog")
          value = (Math.sin(phase) + 0.32 * Math.sin(phase * 2.03)) * (0.5 + 0.5 * Math.sin(t * 145)) * bell * 0.18;
        else if (p.model === "mammal")
          value = (Math.sin(phase) + 0.35 * Math.sin(phase * 2) + band * 0.3) * bell * 0.18;
        else if (p.model === "engine")
          value = (Math.sin(phase) * 0.15 + Math.sin(phase * 2.01) * 0.06 + band * 0.18) * bell;
        else if (p.model === "rotor")
          value = (band * (0.3 + 0.7 * Math.max(0, Math.sin(phase)) ** 4) + low * 0.3) * bell * 0.6;
        else if (p.model === "horn")
          value = (Math.sin(phase) + 0.5 * Math.sin(phase * 1.25) + 0.1 * Math.sin(phase * 2)) * bell * 0.17;
        else if (p.model === "siren") value = (Math.sin(phase) + 0.15 * Math.sin(phase * 3)) * bell * 0.22;
        else if (p.model === "radio")
          value = (band * Math.sin(phase) * 0.7 + (noise - band) * 0.06) * bell * (0.55 + 0.45 * Math.sin(t * 31));
        else if (p.model === "buzz") value = (Math.sin(phase) + 0.2 * Math.sin(phase * 3)) * bell * 0.13;
        else value = (Math.sin(phase) + 0.08 * Math.sin(phase * 2)) * bell * (0.6 + 0.4 * Math.cos(t * 22)) * 0.23;
        data[i] = value * Math.min(1, t / 0.008, (p.dur - t) / 0.018);
        continue;
      }
      const attack = Math.min(1, t / (p.warn ? 0.04 : p.hold ? 0.012 : 0.002));
      const tail = Math.min(1, (p.dur - t) / 0.025);
      const envelope = p.warn
        ? (0.2 + x * 0.8) * (0.6 + 0.4 * Math.sin(t * (10 + variant) * Math.PI * 2) ** 2)
        : p.hold
          ? Math.sin(Math.PI * x) ** 0.5
          : Math.exp(-t / (p.dur * 0.22));
      phase += (Math.PI * 2 * p.body * (p.warn ? 0.7 + x * 0.5 : 1 + 0.45 * Math.exp(-t * 40))) / rate;
      const modes = (Math.sin(phase) + 0.27 * Math.sin(phase * 1.593 + 0.3) + 0.13 * Math.sin(phase * 2.117)) * 0.15;
      const air = (band - low) * p.air * (p.warn ? envelope : Math.exp(-t / (p.dur * 0.38)));
      const grains = noise * (Math.sin(t * 611 + variant) > 0.7 ? 1 : 0.1) * p.grain * Math.exp(-t * 22);
      let recorded = 0;
      if (raw && region) {
        const position = (region.start + t * (1 + (variant - 1) * 0.035)) * sr;
        const at = Math.floor(position),
          f = position - at;
        if (t * (1 + (variant - 1) * 0.035) < region.duration && at + 1 < raw.length)
          recorded = (raw[at] * (1 - f) + raw[at + 1] * f) * (p.warn || p.hold ? 0.11 : 0.66);
      }
      recordedLow += recordedAlpha * (recorded - recordedLow);
      data[i] = (recordedLow + modes * envelope + air + grains) * attack * tail;
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
      amp = this.ctx.createGain();
    src.buffer = this.buffer(p, this.serial++ % 3);
    voice.node = src;
    voice.amp = amp;
    amp.gain.setValueAtTime(p.gain * gain, start);
    amp.gain.setValueAtTime(p.gain * gain, start + Math.max(0.001, p.dur - 0.02));
    amp.gain.linearRampToValueAtTime(0, start + p.dur);
    src.connect(amp);
    engine.route(amp, {
      ...(ambience ? { dest: engine.ambBus } : {}),
      pan,
      rev: ambience ? 0.24 : p.warn ? 0.035 : 0.09,
    });
    src.start(start);
    src.stop(end);
    if (!engine.offline)
      src.onended = () => {
        src.disconnect();
        amp.disconnect();
      };
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
    if (/^tb/.test(id) && arg?.dur)
      this.source(engine, id + "-active", { ...P.tesla, dur: Math.min(1.2, arg.dur) }, { at: p.dur, gain: 0.7 });
  }
  place(engine, id, a = {}) {
    this.source(engine, id, physicalProfile(id, null, true), { gain: a.g ?? 1, pan: a.pan || 0, ambience: true });
  }
}

// Softer acoustic partials revoice the existing score without changing note timing or its voice budget.
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
    for (let n = 1; n < imag.length; n++)
      imag[n] = (shape === "square" && n % 2 === 0 ? 0.08 : 1) / Math.pow(n, shape === "triangle" ? 2.6 : 1.8);
    cache.set(shape, ctx.createPeriodicWave(real, imag));
  }
  oscillator.setPeriodicWave(cache.get(shape));
}
