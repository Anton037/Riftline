// Physical sound voices, shared spatial mix and biome music scheduling.

import { PhysicalVoices, preloadPhysicalAudio, setNaturalWave } from "./physical-voices.js";
import { hookLog as logError } from "../core/run-hooks.js";
import { shotVoiceFor } from "../data/combat-effects.js";
import { upgradesById } from "../data/upgrades.js";
import { PLACE, placeTick } from "./place.js";
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
import {
  AMBIENCE_LEVEL,
  AMB_PREVIEW,
  AMB_REF,
  BEAM_VOICE,
  BED_ATTACK,
  BED_RELEASE,
  BOSS_WARNING_VOICES,
  EVENT_ACCENTS,
  EVENT_BEDS,
  KEY_SOUNDS,
  MAX_MUSIC_VOICES,
  MAX_VOICES,
  MUSIC_DUCK,
  MUSIC_RESERVE,
  MUSIC_SCALE,
  QUIET_FADE,
  RL_BIOME_SPARK,
  RL_BOSS_ATK,
  RL_CHARGE_VOICE,
  RL_DASH_VOICE,
  RL_DEATH_FAMILY,
  RL_FLOOD,
  RL_OVERDRIVE,
  RL_SFX_VOICES,
  RL_TRAP_SOUND,
  ROOM_TONE_LEVEL,
  ROOM_TONE_RECIPES,
  SFX_ROOM,
  SFX_ROOM_BIOME,
  THREAT_WARNING_VOICES,
  attackVoice,
  colorNoise,
  makeSeeded,
  rlShotSfx,
  rlSoundCatalog,
  roomImpulse,
  softClipCurve,
  trackInfo,
} from "./sound-data.js";

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
    this.biome = "lanternYard";
    this.step = 0;
    this.nextT = 0;
    this.timer = null;
    this.combo = 0;
    this.comboT = 0;
    this.intensity = 0;
    this.want = 0;
    this.cycle = 0;
    // 2.7.0: voice registry (limit), boss music mix, lantern-craft hum and event ambience
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
    // 3.1.0: the music tracks: what plays now, the boss heat (0 calm, 1 after a phase change,
    // 2 enraged), the stage buses and the counters of the voice budget
    this.playKind = "off";
    this.playBiome = "lanternYard";
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
    this.verbIn = null;
    this.mbed = null;
    this.held = null;
    this.resumeWanted = false;
    this.lowWard = false;
    this.muffleState = { paused: false, choosing: false, lowWard: false };
    this._muffleWant = 18000;
    // 3.2.0: where the sounds are: the pan and distance attenuation of the event being played (from its x/y relative
    // to the listener) and its room send (SFX_ROOM)
    this.curPan = 0;
    this.curAtten = 1;
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
  /* The master chain: sfx and music -> compressor -> muffle -> limiter -> soft clipper -> output.
     The soft clipper keeps the signal below 0.93 whatever the mix does. */
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
    this.master = ctx.createGain();
    this.master.gain.value = 0.82;
    this.limiter.connect(this.master);
    this.master.connect(this.clip);
    this.clip.connect(ctx.destination);
    // Warm master lowpass between the buses and the limiter: gently warms the mix when paused (~1600 Hz),
    // on the upgrade screen (~2400 Hz), or at critical low Ward (<25% HP, ~2800 Hz), and opens to 18000 Hz otherwise.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = this._wantMuffle();
    this.muffle.Q.value = 0.3;
    this.comp.connect(this.muffle);
    this.muffle.connect(this.limiter);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.comp);
    // Clean UI / chime / preview bus bypassing the world/music lowpass muffle
    this.uiBus = ctx.createGain();
    this.uiBus.gain.value = this.sfxVol;
    this.uiBus.connect(this.limiter);
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
    // the pump: pads, bass, strings, brass and swell voices pass it; accented kicks dip it (a sidechain feel)
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
      this.sfxVerbOut.gain.value = SFX_ROOM_BIOME.lanternYard;
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
    let len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    let data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // the music and its atmospheres take pink or brown noise (opts.color, see colorNoise)
    this.pinkBuf = colorNoise(ctx, "pink");
    this.brownBuf = colorNoise(ctx, "brown");
  }
  _wantMuffle() {
    if (this.muffleState?.paused) return 1600;
    if (this.muffleState?.choosing) return 2400;
    if (this.lowWard || this.muffleState?.lowWard) return 2800;
    return 18000;
  }
  _syncMuffle() {
    const want = this._wantMuffle();
    if (this._muffleWant === want && (!this.muffle || this.muffle.frequency.value === want)) return;
    this._muffleWant = want;
    if (this.ctx && this.muffle) {
      const freq = this.muffle.frequency;
      if (!(typeof AudioParam < "u" && freq instanceof AudioParam)) {
        freq.value = want;
      }
      if (freq.setTargetAtTime && this.ctx.currentTime != null) {
        freq.setTargetAtTime(want, this.ctx.currentTime, 0.25);
      } else {
        freq.value = want;
      }
    }
  }
  setMuffleState(opts = {}) {
    if (!this.muffleState) this.muffleState = { paused: false, choosing: false, lowWard: false };
    if (typeof opts === "string") {
      this.muffleState.paused = opts === "paused" || opts === "pause";
      this.muffleState.choosing = opts === "choosing" || opts === "choose" || opts === "upgrade";
      this.lowWard = this.muffleState.lowWard = opts === "lowWard" || opts === "low";
    } else if (opts && typeof opts === "object") {
      if ("paused" in opts || "pause" in opts) this.muffleState.paused = !!(opts.paused ?? opts.pause);
      if ("choosing" in opts || "choose" in opts) this.muffleState.choosing = !!(opts.choosing ?? opts.choose);
      if ("state" in opts) {
        this.muffleState.choosing = opts.state === "choose" || opts.state === "choosing";
        if (opts.state === "paused" || opts.state === "pause") this.muffleState.paused = true;
        else if (opts.state === "fight" || opts.state === "cleared") this.muffleState.paused = false;
      }
      if ("lowWard" in opts || "lowHp" in opts) {
        this.lowWard = this.muffleState.lowWard = !!(opts.lowWard ?? opts.lowHp);
      } else if (opts.hp != null && opts.maxHp > 0) {
        this.lowWard = this.muffleState.lowWard = opts.hp > 0 && opts.hp / opts.maxHp < 0.25;
      }
    } else if (!opts) {
      this.muffleState.paused = false;
      this.muffleState.choosing = false;
      this.lowWard = this.muffleState.lowWard = false;
    }
    if (!this.muffleState.paused && this.mode === "menu") this.held = null;
    this._syncMuffle();
    return this._muffleWant;
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
    if (this.uiBus) this.uiBus.gain.setTargetAtTime(sfx, now, 0.05);
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
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
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
      if (this.ctx && !this.offline && !this.timer) {
        this.startScheduler();
      }
    } catch {}
  }
  /* Voice limit: at most MAX_VOICES oscillators/sources are alive. A new voice that finds the list
     full takes the place of the oldest voice of lower (or, for sounds, equal) priority; music (0)
     never drops anything and is skipped instead, loops (beds) are never dropped. */
  claim(pri, start, end, opt) {
    let now = this.nowT();
    // 2.8.2: music (priority 0) is counted apart from the sounds.
    if (pri === 0) {
      let music = this.musicVoiceList;
      if (music.length >= 12) {
        for (let i = music.length - 1; i >= 0; i--)
          if (music[i].end < now) {
            this._cleanupVoice(music[i]);
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
      let voice = {
        node: null,
        filter: null,
        amp: null,
        panner: null,
        send: null,
        pri: 0,
        start: start,
        end: end,
        loop: false,
      };
      music.push(voice);
      this.musicScheduled++;
      return voice;
    }
    let list = this.voices;
    if (list.length >= MAX_VOICES) {
      for (let i = list.length - 1; i >= 0; i--)
        if (list[i].end < now) {
          if (!list[i].bed) this._cleanupVoice(list[i]);
          list[i] = list[list.length - 1];
          list.pop();
        }
    }
    let voice = {
      node: null,
      filter: null,
      amp: null,
      panner: null,
      send: null,
      pri: pri,
      start: start,
      end: end,
      loop: false,
    };
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
      if (!this.offline) setTimeout(() => this._cleanupVoice(old), 60);
    } catch {}
    list[victim] = voice;
    this.dropped++;
    return voice;
  }
  /* Disconnect every node of a finished one-shot voice so Firefox's MediaTrackGraph never retains zombie
     filter / panner / reverb-send chains across long runs. */
  _cleanupVoice(voice) {
    if (!voice || this.offline) return;
    const { node, filter, amp, panner, send, extras } = voice;
    voice.node = voice.filter = voice.amp = voice.panner = voice.send = voice.extras = null;
    if (extras) {
      for (let i = 0; i < extras.length; i++) {
        try {
          extras[i].disconnect();
        } catch {}
      }
    }
    try {
      if (node) node.disconnect();
    } catch {}
    try {
      if (filter) filter.disconnect();
    } catch {}
    try {
      if (amp) amp.disconnect();
    } catch {}
    try {
      if (panner) panner.disconnect();
    } catch {}
    try {
      if (send) send.disconnect();
    } catch {}
  }
  /* opts: to (end pitch), detune, attack, hold (flat level after the attack), lp/bp/q (low-pass or band-pass; lpTo ends the
     sweep), env (Float32Array, 0..1: the whole level curve replaces the exponential envelope: tremolo), dest/at/pri,
     opt (an optional music voice) */
  tone(freq, dur, wave, vol, opts = {}) {
    let ctx = this.ctx,
      start = ctx.currentTime + (opts.at || 0),
      atten = opts.dest || this.curBus ? 1 : (this.curAtten ?? 1),
      level = vol * atten,
      voice = this.claim(
        opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
        start,
        start + dur + 0.02,
        opts.opt,
      );
    if (!voice) return;
    this.logMusic(voice, "t", freq, level, opts);
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
    const isMusicDest = opts.dest === this.mus || opts.dest === this.pump || opts.dest === this.delay;
    const isSustained = wave === "bow" || wave === "reed" || wave === "brass" || wave === "ceramic";
    const isPluck = wave === "harp" || wave === "kalimba" || wave === "marimba" || wave === "celesta";
    const extras = [];

    this.envelope(amp, start, dur, level, opts);
    let target = amp;
    if (opts.lp || opts.bp || (isPluck && isMusicDest)) {
      let filter = ctx.createBiquadFilter();
      filter.type = opts.bp ? "bandpass" : "lowpass";
      const baseCut = opts.bp || opts.lp || 2600;
      filter.Q.value = opts.q || (opts.bp ? 2.2 : 0.7);
      if (opts.lpTo) {
        filter.frequency.setValueAtTime(baseCut, start);
        filter.frequency.exponentialRampToValueAtTime(opts.lpTo, start + dur);
      } else if (isPluck && !opts.bp && isMusicDest) {
        // Dynamic lowpass decay envelope (2.4x -> 1.0x cutoff) for organic plucked warmth
        const nyq = (ctx.sampleRate || 44100) * 0.44;
        const startCut = Math.min(nyq, Math.max(120, baseCut * 2.4));
        const endCut = Math.min(nyq, Math.max(120, baseCut));
        filter.frequency.setValueAtTime(startCut, start);
        filter.frequency.exponentialRampToValueAtTime(endCut, start + Math.max(0.04, dur * 0.72));
      } else {
        filter.frequency.value = baseCut;
      }
      filter.connect(amp);
      voice.filter = filter;
      target = filter;
    }
    osc.connect(target);

    // Subtle 2-voice detune (±6 cents) & delayed vibrato on sustained musical instruments
    if (isMusicDest && isSustained && dur >= 0.24 && !opts.to) {
      const osc2 = ctx.createOscillator(),
        mix2 = ctx.createGain();
      setNaturalWave(ctx, osc2, wave);
      osc2.frequency.setValueAtTime(freq, start);
      const baseDet = opts.detune || 0;
      osc.detune.setValueAtTime(baseDet - 6, start);
      osc2.detune.setValueAtTime(baseDet + 6, start);
      mix2.gain.value = 0.44;
      osc2.connect(mix2);
      mix2.connect(target);
      osc2.start(start);
      osc2.stop(start + dur + 0.02);
      extras.push(osc2, mix2);
      if (dur >= 0.42 && (wave === "bow" || wave === "reed" || wave === "brass")) {
        const lfo = ctx.createOscillator(),
          lfoGain = ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(4.8, start);
        lfoGain.gain.setValueAtTime(0, start);
        lfoGain.gain.setValueAtTime(0, start + 0.14);
        lfoGain.gain.linearRampToValueAtTime(5.5, start + Math.min(dur * 0.65, 0.34));
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);
        lfoGain.connect(osc2.detune);
        lfo.start(start);
        lfo.stop(start + dur + 0.02);
        extras.push(lfo, lfoGain);
      }
    }
    if (extras.length) voice.extras = extras;

    this.route(amp, opts, voice);
    if (!this.offline) osc.onended = () => this._cleanupVoice(voice);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
  envelope(amp, start, dur, vol, opts) {
    let attack = opts.attack || 0.004;
    let safeVol = Math.max(1e-4, vol);
    if (opts.env) {
      let env = opts.env,
        curve = new Float32Array(env.length);
      for (let i = 0; i < env.length; i++) curve[i] = env[i] * safeVol;
      amp.gain.setValueCurveAtTime(curve, start, dur);
      return;
    }
    amp.gain.setValueAtTime(1e-4, start);
    amp.gain.exponentialRampToValueAtTime(safeVol, start + attack);
    if (opts.hold)
      amp.gain.setValueAtTime(safeVol, start + attack + Math.min(opts.hold, Math.max(0, dur * 0.95 - attack)));
    amp.gain.exponentialRampToValueAtTime(1e-4, start + dur);
  }
  noise(dur, vol, opts = {}) {
    let ctx = this.ctx,
      start = ctx.currentTime + (opts.at || 0),
      atten = opts.dest || this.curBus ? 1 : (this.curAtten ?? 1),
      level = vol * atten,
      voice = this.claim(
        opts.pri != null ? opts.pri : opts.dest ? 0 : this.curPri,
        start,
        start + dur + 0.02,
        opts.opt,
      );
    if (!voice) return;
    this.logMusic(voice, "n", opts.f || 2e3, level, opts);
    if (this.budgetOnly) {
      Math.random(); // Keep the noise-source offset draw in the reference schedule.
      return;
    }
    let src = ctx.createBufferSource();
    src.buffer = this.noiseOf(opts.color);
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
    voice.filter = filter;
    voice.amp = amp;
    this.envelope(amp, start, dur, level, { ...opts, attack: opts.attack || 0.003 });
    src.connect(filter);
    filter.connect(amp);
    this.route(amp, opts, voice);
    if (!this.offline) src.onended = () => this._cleanupVoice(voice);
    src.start(start, Math.random() * Math.max(0, src.buffer.duration - 0.5));
    src.stop(start + dur + 0.02);
  }
  /* 3.2.0: where a voice goes: its bus (opts.dest, the sounds by default), panned with opts.pan (-1..1) and sent to
     the music reverb with opts.rev (send level) */
  route(amp, opts, voice = null) {
    let dest = opts.dest || this.curBus || this.sfx,
      pan = opts.pan != null ? opts.pan : opts.dest ? 0 : this.curPan,
      rev = opts.rev != null ? opts.rev : opts.dest ? 0 : this.curRev,
      room = opts.dest && opts.dest !== this.ambBus ? this.verbIn : this.sfxVerbIn;
    if (pan && this.ctx.createStereoPanner) {
      let panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      amp.connect(panner);
      panner.connect(dest);
      if (voice) voice.panner = panner;
    } else amp.connect(dest);
    if (rev && room) {
      let send = this.ctx.createGain();
      send.gain.value = rev;
      amp.connect(send);
      send.connect(room);
      if (voice) voice.send = send;
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
     bus (m music, d delay, p pump, b bloom) */
  logMusic(voice, kind, pitch, vol, opts) {
    if (!this.musicLog || voice.pri !== 0) return;
    let dest = opts.dest;
    this.musicLog.push({
      kind,
      t: voice.start,
      pitch,
      vol,
      dur: voice.end - voice.start,
      bus: opts.bloom ? "b" : dest === this.delay ? "d" : dest === this.pump ? "p" : "m",
    });
  }
  /* Subtle rhythmic sidechain compression dip on the pump bus when boss kicks strike */
  pumpDip(at = 0, depth = 0.25) {
    if (this.budgetOnly || !this.pump || !this.ctx) return;
    const t = Math.max(this.ctx.currentTime, this.ctx.currentTime + at);
    const g = this.pump.gain;
    try {
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(Math.max(0.55, 1 - depth), t + 0.012);
      g.exponentialRampToValueAtTime(1, t + 0.14);
    } catch {}
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
    const atten = this.curAtten ?? 1;
    const uiClean =
      id === "click" ||
      id === "hover" ||
      id === "deny" ||
      id === "offer" ||
      id === "pick" ||
      id === "evolve" ||
      id === "reroll" ||
      id === "seal" ||
      id === "buy" ||
      id === "milestone" ||
      id === "equip" ||
      id === "victory" ||
      id === "bossCleared" ||
      id === "cleared";
    const prevBus = this.curBus;
    if (uiClean && this.uiBus && !prevBus) this.curBus = this.uiBus;
    this.curPri = warning || KEY_SOUNDS.has(id) ? 2 : 1;
    this.curRev = SFX_ROOM[id] || 0;
    try {
      this._play(id, arg);
      const dramatic =
        id === "fireBurst" ||
        id === "inlayRelease" ||
        id === "bOverdrive" ||
        id === "bossIntro" ||
        id === "enrage" ||
        bossWarning;
      const baseDepth = dramatic ? 0.29 : warning ? 0.15 : MUSIC_DUCK[id] || 0;
      const depth = baseDepth * (dramatic ? 1 : atten);
      if (depth) this.duck(depth, dramatic ? 0.35 : 0.08);
    } catch (err) {
      this.fail(err);
    } finally {
      this.curBus = prevBus;
      this.curPri = 1;
      this.curRev = 0;
    }
  }
  /* 3.48.0: the volume sliders of the Settings let the ear check what they set: every bus answers with
     one real sound of the game on that bus, at the level the slider just put in. */
  previewBus(bus, weapon) {
    if (!this.live()) return;
    if (bus === "sfx" && this.sfxVol <= 0) return;
    if (bus === "music" && this.musVol <= 0) return;
    if (bus === "ambience" && this.ambVol <= 0) return;
    let now = this.nowT(),
      gap = bus === "music" ? 0.5 : 0.22;
    if (now - (this.previewT[bus] ?? -1e9) < gap) return;
    this.previewT[bus] = now;
    const prevBus = this.curBus;
    try {
      if (bus === "sfx") {
        if (this.uiBus) this.curBus = this.uiBus;
        this.play(weapon || "lanternGun");
      } else if (bus === "music") musicImpact(this, this.wantBiome(), 0);
      else if (bus === "ambience") this.placePlay(AMB_PREVIEW[this.wantBiome()] || "sparks", { g: 1, pan: 0 });
    } catch (err) {
      this.fail(err);
    } finally {
      this.curBus = prevBus;
    }
  }
  /* Sidechain ducking: light 80ms dip on routine hits, and -3 dB (~0.29 depth) for 0.35s on
     boss callouts, Bell-Censer tolls, and Fire Burst so major cues command the mix cleanly. */
  duck(depth, holdSec = 0.08) {
    let gain = this.duckGain;
    if (!gain) return;
    let now = this.ctx.currentTime;
    if (now - this.duckT < 0.1 && depth <= this.duckDepth) return;
    this.duckT = now;
    this.duckDepth = depth;
    const clamped = Math.min(0.29, depth);
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(1 - clamped, now, 0.014);
      gain.gain.setTargetAtTime(1, now + holdSec, holdSec > 0.2 ? 0.14 : 0.07);
    } catch {}
    if (this.ambDuck) {
      let room = this.ambDuck.gain;
      room.cancelScheduledValues(now);
      room.setTargetAtTime(1 - Math.min(0.42, clamped * 1.5), now, 0.016);
      room.setTargetAtTime(1, now + holdSec, 0.3);
    }
  }
  _play(id, arg) {
    this.physical.play(this, id, arg);
    this._cozyChime(id, arg);
  }
  /* Restrained, differentiated musical chimes quantized to the active biome's modal scale via scoreScaleMidi.
     Ordinary UI clicks and rerolls stay clean physical foley with no redundant chime overlay. */
  _cozyChime(id, arg) {
    const note = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const m = (deg, oct = 24) => scoreScaleMidi(this.biome, deg, oct);
    const bell = (midi, dur, wave, vol, delay = 0, pan = null, lp = 3800) =>
      this.tone(note(midi), dur, wave, vol, {
        at: delay,
        attack: 0.008,
        lp,
        pan: pan != null ? pan : this.curPan || 0,
        rev: 0.16,
      });
    switch (id) {
      case "superCrit":
        if (this.gate("chime:superCrit", 0.06)) {
          bell(m(4, 24), 0.16, "celesta", 0.036, 0, null, 5200);
          bell(m(6, 24), 0.22, "celesta", 0.032, 0.038, null, 5600);
        }
        break;
      case "deny":
      case "gadgetNo":
        if (this.gate("chime:deny", 0.08)) {
          bell(m(1, 12), 0.1, "marimba", 0.042, 0, -0.1, 2200);
          bell(m(0, 12), 0.13, "marimba", 0.038, 0.06, 0.1, 1900);
        }
        break;
      case "offer":
        if (this.gate("chime:offer", 0.12)) {
          bell(m(0, 12), 0.22, "harp", 0.044, 0, -0.18);
          bell(m(4, 24), 0.28, "celesta", 0.04, 0.075, 0.18);
        }
        break;
      case "pick": {
        if (!this.gate("chime:pick", 0.08)) break;
        const r = Math.max(1, Math.min(6, Number(arg) || 1));
        const chord =
          r >= 6
            ? [m(0, 12), m(4, 12), m(0, 24), m(2, 24), m(4, 24), m(6, 24)]
            : r === 5
              ? [m(0, 12), m(2, 12), m(4, 24), m(6, 24)]
              : r === 4
                ? [m(0, 12), m(2, 24), m(4, 24)]
                : r === 3
                  ? [m(0, 24), m(3, 24), m(5, 24)]
                  : r === 2
                    ? [m(0, 24), m(4, 24)]
                    : [m(2, 24), m(4, 24)];
        const wave = r >= 4 ? "celesta" : r >= 2 ? "harp" : "kalimba";
        for (let i = 0; i < chord.length; i++) {
          bell(chord[i], 0.24 + i * 0.04, wave, 0.044, i * 0.05, (i - (chord.length - 1) / 2) * 0.18);
        }
        break;
      }
      case "shard":
        // Soft pentatonic grace-note tracking the score's active chord root and inheriting world pan
        if (this.gate("chime:shard", 0.055)) {
          const pent = [0, 2, 4, 7, 9];
          const step = (this.shardStep = ((this.shardStep || 0) + 1) % pent.length);
          const rootBase = Number.isFinite(this.activeRoot) ? this.activeRoot + 24 : m(0, 24);
          const worldPan = this.curPan || (step - 2) * 0.08;
          bell(rootBase + pent[step], 0.12, "celesta", 0.024, 0, worldPan, 4200);
        }
        break;
      case "heal":
      case "heart":
        if (this.gate("chime:heal", 0.1)) {
          const basePan = this.curPan || 0;
          bell(m(2, 12), 0.22, "harp", 0.046, 0, Math.max(-0.8, basePan - 0.12));
          bell(m(4, 24), 0.28, "celesta", 0.042, 0.065, Math.min(0.8, basePan + 0.12));
        }
        break;
      case "buy":
      case "supply":
        // Tactile 4 -> 0 marimba fourth + bright brass anvil clink
        if (this.gate("chime:buy", 0.1)) {
          bell(m(4, 24), 0.15, "marimba", 0.048, 0, -0.14, 2400);
          bell(m(0, 24), 0.22, "marimba", 0.05, 0.068, 0.06, 2200);
          bell(m(4, 36), 0.14, "celesta", 0.032, 0.105, 0.22, 5200);
        }
        break;
      case "bounty":
      case "forgeGift":
        // Descending gilded coin cascade panning across the stereo field
        if (this.gate("chime:bounty", 0.12)) {
          const coins = [m(6, 24), m(4, 24), m(2, 24), m(0, 24)];
          for (let i = 0; i < coins.length; i++) {
            bell(coins[i], 0.16 + i * 0.03, i % 2 === 0 ? "celesta" : "kalimba", 0.038, i * 0.042, -0.24 + i * 0.16);
          }
        }
        break;
      case "ready":
      case "novaReady":
      case "gadgetReady":
        if (this.gate("chime:ready", 0.12)) {
          const deg = id === "novaReady" ? 2 : id === "gadgetReady" ? 1 : 0;
          bell(m(deg, 24), 0.15, "celesta", 0.038, 0, -0.12);
          bell(m(deg + 4, 24), 0.2, "celesta", 0.042, 0.05, 0.12);
        }
        break;
      case "combo":
        if (this.gate("chime:combo", 0.08)) {
          const lift = Math.max(0, Math.min(12, Number(arg) || 0));
          bell(m(lift % 7, 24), 0.16, "kalimba", 0.04, 0, null);
        }
        break;
      case "wave":
        if (this.gate("chime:wave", 0.2)) {
          bell(m(0, 12), 0.34, "brass", 0.044, 0, -0.15, 2400);
          bell(m(4, 12), 0.38, "harp", 0.042, 0.065, 0.15);
        }
        break;
      case "cleared":
        // Warm resolving cadence (5 -> 3 -> 1, or extended flawless cadence)
        if (this.gate("chime:cleared", 0.2)) {
          const notes = arg ? [m(4, 12), m(2, 24), m(0, 24), m(4, 24)] : [m(4, 12), m(2, 24), m(0, 24)];
          for (let i = 0; i < notes.length; i++) {
            bell(
              notes[i],
              0.32 + i * 0.05,
              i === notes.length - 1 ? "celesta" : "harp",
              0.048,
              i * 0.075,
              (i - (notes.length - 1) / 2) * 0.18,
            );
          }
        }
        break;
      case "evolve":
        // Radiant Lydian #4 shimmer (Masterwork ascension)
        if (this.gate("chime:evolve", 0.25)) {
          const rootBase = scoreScaleMidi(this.biome, 0, 12);
          const lydian = [0, 4, 6, 7, 11, 14];
          for (let i = 0; i < lydian.length; i++) {
            bell(
              rootBase + lydian[i],
              0.32 + i * 0.05,
              i < 2 ? "harp" : "celesta",
              0.046,
              i * 0.055,
              (i - 2.5) * 0.16,
              4600,
            );
          }
        }
        break;
      case "die":
        // Melancholic descending lantern-extinguish cadence (minor/Dorian sigh)
        if (this.gate("chime:die", 0.35)) {
          const rootBase = scoreScaleMidi(this.biome, 0, 12);
          bell(rootBase + 7, 0.42, "harp", 0.044, 0.06, -0.18, 2200);
          bell(rootBase + 3, 0.48, "harp", 0.042, 0.26, 0.14, 1900);
          bell(rootBase, 0.78, "bow", 0.048, 0.48, 0, 1500);
        }
        break;
      case "bossCleared":
      case "victory":
        // Consonant major-triad stereo call-and-response carillon (harmonizes cleanly with musicResolve's major 3rd)
        if (this.gate("chime:fanfare", 0.25)) {
          const rootBase = scoreScaleMidi(this.biome, 0, 12);
          bell(rootBase, 0.42, "brass", 0.054, 0, -0.34, 2600);
          bell(rootBase + 7, 0.38, "harp", 0.048, 0.08, -0.24);
          bell(rootBase + 12, 0.36, "celesta", 0.048, 0.2, 0.28);
          bell(rootBase + 16, 0.44, "celesta", 0.052, 0.29, 0.34);
          bell(rootBase + 19, 0.56, "harp", 0.052, 0.38, -0.14);
          bell(rootBase + 24, 0.68, "celesta", 0.044, 0.44, 0.14);
        }
        break;
    }
  }
  consume(events, listener) {
    if (!this.live()) return;
    const lx = listener?.x ?? listener?.player?.x;
    const ly = listener?.y ?? listener?.player?.y;
    const hp = listener?.hp ?? listener?.player?.hp;
    const maxHp = listener?.maxHp ?? listener?.stats?.maxHp;
    if (hp > 0 && maxHp > 0) {
      this.lowWard = hp / maxHp < 0.25;
      if (this.muffleState) this.muffleState.lowWard = this.lowWard;
      this._syncMuffle?.();
    }
    const hasBossDown = events.some((e) => e.k === "bossDown");
    let kills = 0;
    for (let ev of events) {
      const hasPos = listener && ev.x != null && ev.y != null && lx != null && ly != null;
      const dist = hasPos ? Math.hypot(ev.x - lx, ev.y - ly) : 0;
      this.curPan = listener && ev.x != null && lx != null ? Math.max(-0.82, Math.min(0.82, (ev.x - lx) / 16)) : 0;
      this.curAtten = hasPos ? Math.max(0.28, Math.min(1, 1.15 - dist / 28)) : 1;
      this.curDistFrac = hasPos ? Math.max(0, Math.min(1, dist / 28)) : 0;
      switch (ev.k) {
        case "shot":
          this.play(rlShotSfx(ev.w), ev.heavy ? { heavy: true } : undefined);
          break;
        case "dmg":
          if (!ev.burn) {
            this.play(ev.superCrit ? "superCrit" : ev.crit ? "crit" : "hit", {
              type: ev.type,
              shield: !!ev.shield,
              w: ev.w,
            });
          }
          break;
        case "kill":
          if (ev.boss) {
            if (!hasBossDown) this.play("bigkill", ev.type);
          } else {
            if (kills++ < 3) {
              this.play(RL_DEATH_FAMILY[ev.type] || "kill", ev.elite ? 1.8 : Math.max(1, ev.r * 1.6));
            }
          }
          break;
        case "boom":
          if (ev.kind === "trap" || ev.kind === "surge" || ev.kind === "fireBurst") break;
          if (attackVoice(ev.kind, ev.src, this.biome, ev.chill)) {
            this.play(attackVoice(ev.kind, ev.src, this.biome, ev.chill), ev.r);
            break;
          }
          if (ev.kind === "mossHelpers") {
            this.play("bcBurst");
            break;
          }
          this.play(
            ev.kind === "gravityBell"
              ? "singCollapse"
              : ev.kind === "blastShot" || ev.kind === "pop"
                ? "smallboom"
                : "boom",
          );
          break;
        case "fireBurst":
          this.play("fireBurst");
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
          // 3.33.0: a Frost enemy's shot rings with a glassy chime on top (its shot slows the artificer it hits)
          if (ev.frost) this.play("eshotFrost");
          break;
        case "beamWarn":
          this.play(BEAM_VOICE[ev.skin] || (ev.small ? "beamSmall" : "beam"), ev.small ? 0.6 : 1, ev.boss === true);
          break;
        case "aim":
          this.play(ev.type === "watchTower" ? "servo" : "lock");
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
          if (this.muffleState) {
            this.muffleState.choosing = false;
            this._syncMuffle?.();
          }
          this.play(ev.boss ? "boss" : "wave");
          break;
        case "cleared":
          this.play(ev.boss ? "bossCleared" : "cleared", ev.flawless);
          break;
        case "die":
          this.lowWard = false;
          if (this.muffleState) {
            this.muffleState.lowWard = false;
            this.muffleState.choosing = false;
            this._syncMuffle?.();
          }
          this.play("die");
          break;
        case "victory":
          this.lowWard = false;
          if (this.muffleState) {
            this.muffleState.lowWard = false;
            this.muffleState.choosing = false;
            this._syncMuffle?.();
          }
          this.play("victory");
          break;
        case "thud":
          this.play("thud", ev.src);
          break;
        case "revive":
          this.play("fireBurst");
          break;
        case "pick":
          if (this.muffleState) {
            this.muffleState.choosing = false;
            this._syncMuffle?.();
          }
          if (ev.evo) this.play("evolve");
          else this.play("pick", (upgradesById[ev.id] && upgradesById[ev.id].rarity) || 1);
          break;
        case "seal":
          this.play("seal");
          break;
        case "bellCage":
          this.play("bcCage");
          break;
        case "lockOn":
          this.play("bcLock");
          break;
        case "shatter":
          this.play("bcShatter");
          break;
        case "graze":
          this.play("gadgetReady");
          break;
        case "splinterHit":
          if (!this.gate || this.gate("sfx:splinter", 0.04)) this.play("hit", { type: "iceCrystal" });
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
          if (this.muffleState) {
            this.muffleState.choosing = true;
            this._syncMuffle?.();
          }
          this.play("offer");
          break;
        case "maxed":
          this.play("heal");
          break;
        case "gravityBell":
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
          this.play(this.biome === "lanternYard" ? "inlayRelease" : "erupt");
          break;
        case "devilNear":
          this.play("devilNear");
          break;
        case "warp":
          this.play("warp");
          break;
        case "mend":
          this.play("mend", ev.type || ev.src);
          break;
        case "chill":
        case "champion":
          this.play(ev.k, ev.src);
          break;
        case "corrode":
          this.play("shortFizz");
          break;
        case "singe":
          this.play("fireBellows");
          break;
        case "glare":
          this.play("bcShatter");
          break;
        case "zap":
          if (!this.gate || this.gate("sfx:zap", 0.05)) this.play("chain");
          break;
        case "pop":
          if (!this.gate || this.gate("sfx:pop", 0.04)) this.play("shieldPop");
          break;
        case "plant":
          this.play("plant");
          break;
        case "spawn":
          if (!this.gate || this.gate("sfx:spawn", 0.07)) this.play("spawn");
          break;
        case "forgeGift":
          this.play("forgeGift");
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
        case "boss":
          this.play("bossIntro", ev.id);
          break;
        case "bossAtk": {
          let voice = RL_BOSS_ATK[ev.atk];
          if (RL_OVERDRIVE.has(ev.atk)) this.play("bOverdrive", ev.id, true);
          if (voice) this.play(voice, ev.id, true);
          break;
        }
        case "enrage":
          this.play("enrage", ev.id, true);
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
    this.curAtten = 1;
    this.curDistFrac = 0;
  }
  /* 3.1.0: mode "fight" is the calm theme of the biome, "boss" its boss track. The boss track starts on the
     spot (main.js calls this when the boss appears, at the camera pan), not with the wave. */
  /* resume: back from the pause menu (the track goes on where it was instead of starting again) */
  setMusic(mode, biome, resume) {
    if (mode === "boss" && !resume) this.bossOver = false;
    this.resumeWanted = !!resume;
    this.mode = mode;
    if (mode === "fight" || mode === "boss") {
      if (this.muffleState) {
        this.muffleState.paused = false;
        if (!resume) {
          this.muffleState.choosing = false;
          this.lowWard = this.muffleState.lowWard = false;
        }
      }
    } else if (mode === "off") {
      this.lowWard = false;
      if (this.muffleState) this.muffleState = { paused: false, choosing: false, lowWard: false };
    }
    if (biome) {
      this.biome = biome;
      if (this.sfxVerbOut && SFX_ROOM_BIOME[biome])
        this.sfxVerbOut.gain.setTargetAtTime(SFX_ROOM_BIOME[biome], this.ctx.currentTime, 0.3);
    }
    this.syncTrack();
    this._syncMuffle();
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
    return scoreBiomes.includes(this.biome) ? this.biome : "lanternYard";
  }
  /* Called when the wanted track changes: restarts the step counter on the spot, cuts the notes that were
     already scheduled for the old track and plays the transition. */
  syncTrack() {
    let ctx = this.ctx;
    if (!ctx || !this.fade) return;
    let kind = this.wantKind(),
      biome = this.wantBiome();
    if (kind === this.playKind && biome === this.playBiome) return;
    if (this.trackFailT && ctx.currentTime - this.trackFailT < 2) return;
    let from = this.playKind,
      track = kind === "fight" || kind === "boss" || kind === "menu" ? musicTrack(kind, biome) : null;
    if ((from === "fight" || from === "boss") && kind === "menu")
      this.held = { kind: from, biome: this.playBiome, step: this.step, cycle: this.cycle, heat: this.heat };
    let held = this.held,
      resumed = !!held && this.resumeWanted && held.kind === kind && held.biome === biome;
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
      if (track && this.delay) {
        // Tempo-sync dotted-eighth stereo echo to the active track's BPM
        const syncedDelay = Math.max(0.16, Math.min(0.92, (60 / track.bpm) * 0.75));
        this.delay.delayTime.setTargetAtTime(syncedDelay, now, 0.08);
      }
      this.stopMusicBed();
      if (track) this.startMusicBed(kind, biome);
      if (resumed) {
        this.fade.gain.setValueAtTime(0.0001, now);
        this.fade.gain.linearRampToValueAtTime(gain, now + 0.6);
      } else if (from === "boss" && kind === "fight") {
        this.fade.gain.setValueAtTime(1.1, now);
        this.fade.gain.linearRampToValueAtTime(0.0001, now + 0.9);
        this.fade.gain.linearRampToValueAtTime(gain, now + 4.1);
        this.nextT = now + 0.9;
        if (this.live() && this.musVol > 0) musicResolve(this, biome, 0);
      } else if (from !== "off" && kind !== "off") {
        this.fade.gain.setValueAtTime(0.0001, now);
        this.fade.gain.linearRampToValueAtTime(gain, now + 0.35);
        if (kind === "boss" && from === "fight" && this.live() && this.musVol > 0) musicImpact(this, biome, 0);
      } else {
        this.fade.gain.setValueAtTime(gain, now);
      }
      this.trackFailT = 0;
    } catch (err) {
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
          if (voice.extras) for (const ex of voice.extras) ex.stop?.(now);
          this._cleanupVoice(voice);
        } catch {}
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }
  /* 3.18.1: the old track does not ring on under the new one. The sounding notes fade out over QUIET_FADE,
     the echo line is emptied and the room is swapped for a fresh one. */
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
        if (voice.extras) for (const ex of voice.extras) ex.stop?.(end + 0.01);
        voice.end = end;
      } catch {}
    }
    try {
      this.fb.gain.cancelScheduledValues(now);
      this.fb.gain.setValueAtTime(0, now);
      this.fb.gain.setValueAtTime(0.32, now + 0.7);
      if (this.verbIn && this.verbPool) {
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
  /* Called every frame of a running world: `speed` (0..1, null: no lantern-craft hum) drives the lantern-craft
     hum, `ambience` is the id of the biome event that is on (or null), and optional `state` drives muffle warmth.
     Everything here stops by itself when this is not called for 0.8 s (pause, menus) or the music mode is not a fight. */
  setState(speed, ambience, state) {
    if (state !== undefined) this.setMuffleState(state);
    if (!this.ctx) return;
    this.liveT = this.ctx.currentTime;
    this.speed = speed;
    this.amb = AMBIENCE_LEVEL[ambience] ? ambience : null;
    this._syncMuffle();
    let hum = this.beds.hum;
    if (hum && speed != null && Math.abs(speed - (this._humSpeed ?? -1)) > 0.018) {
      this._humSpeed = speed;
      let now = this.ctx.currentTime;
      hum.parts.a.frequency.setTargetAtTime(76 + 26 * speed, now, 0.08);
      hum.parts.b.frequency.setTargetAtTime(152 + 52 * speed, now, 0.08);
      hum.parts.lp.frequency.setTargetAtTime(270 + 190 * speed, now, 0.08);
    }
  }
  /* Beds are the quiet loops: the lantern-craft hum and the biome event ambience. */
  startBed(name) {
    if (this.beds[name]) return;
    let ctx = this.ctx,
      now = ctx.currentTime,
      gain = ctx.createGain(),
      nodes = [],
      parts = {},
      level = name === "hum" ? 0.02 : AMBIENCE_LEVEL[name] || 0.03;
    gain.gain.setValueAtTime(1e-4, now);
    gain.gain.setTargetAtTime(level, now, BED_ATTACK[name] || 0.35);
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
    try {
      if (name === "hum") {
        this._humSpeed = -1;
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
        const [center, q, pace, pitch, rate] = EVENT_BEDS[name];
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
      this.stopBed(name, 0, 0.02);
      this.deadBeds[name] = now;
      this.fail(err);
      return;
    }
    // Continuous ambient beds are tracked in this.beds (and cleaned up by stopBed) rather than
    // consuming the 24-slot transient combat SFX voice pool.
  }
  stopBed(name, at = 0, rel) {
    let bed = this.beds[name];
    if (!bed) return;
    let ctx = this.ctx,
      now = ctx.currentTime + at,
      fade = rel != null ? rel : BED_RELEASE[name] || 0.08,
      end = now + Math.max(0.4, fade * 3);
    try {
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setTargetAtTime(0, now, fade);
      for (let node of bed.nodes) node.stop(end);
      if (!this.offline)
        setTimeout(
          () => {
            try {
              for (let node of bed.nodes) node.disconnect();
              bed.gain.disconnect();
            } catch {}
          },
          Math.max(0, end - this.ctx.currentTime) * 1000 + 150,
        );
    } catch {}
    for (let voice of this.voices)
      if (voice.bed === bed) {
        voice.loop = false;
        voice.end = end;
      }
    if (end > this.maxEnd) this.maxEnd = end;
    delete this.beds[name];
  }
  /* 3.2.0: the atmosphere of a music track: a loop that plays under the notes for as long as the track plays.
     It goes through the music chain (volume, fade, glue) and is not a voice of the budget. */
  startMusicBed(kind, biome, fadeIn = 1.5) {
    const ctx = this.ctx;
    if (!ctx || (kind !== "fight" && kind !== "boss" && kind !== "menu")) return;
    if (this.mbed) this.stopMusicBed();
    const bedBiome = kind === "menu" ? "menu" : biome;
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
      root = scoreOrigin(bedBiome),
      barRate = musicTrack(kind, biome).bpm / 240;
    out.gain.setValueAtTime(1e-4, now);
    out.gain.linearRampToValueAtTime(kind === "boss" ? 0.29 : kind === "menu" ? 0.18 : 0.22, now + fadeIn);
    out.connect(kind === "boss" ? this.atmosPump : this.atmos);
    this.mbed = { out, nodes };
    try {
      scoreBed({ osc, loop, filt, lfo, level, root, barRate, boss: kind === "boss" }, bedBiome);
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
      if (!this.offline)
        setTimeout(
          () => {
            try {
              for (let node of bed.nodes) node.disconnect();
              bed.out.disconnect();
            } catch {}
          },
          (fade + 0.25) * 1000,
        );
    } catch {}
  }
  /* 3.43.0: the room tone - the quiet, steady bed of a biome. It sits on the ambience bus under the
     place and the music and takes no voice of the budget. */
  startTone(name) {
    let ctx = this.ctx;
    if (!ctx || this.toneBed) return;
    let dead = this.deadTone[name];
    if (dead != null && ctx.currentTime - dead < 10) return;
    let now = ctx.currentTime,
      gain = ctx.createGain(),
      nodes = [],
      level = ROOM_TONE_LEVEL[name] || 0.028;
    this.toneBed = { name, gain, nodes, boss: false };
    try {
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
        drift = (param, freq, depth) => {
          let lfo = osc("sine", freq),
            depthGain = ctx.createGain();
          depthGain.gain.value = depth;
          lfo.connect(depthGain);
          depthGain.connect(param);
        };
      const [air, q, pace, low, high] = ROOM_TONE_RECIPES[name] || ROOM_TONE_RECIPES.lanternYard;
      const wash = filter("bandpass", air, q, loop(0.68, "pink"));
      drift(wash.frequency, pace, air * 0.34);
      const washGain = amp(wash, 0.43);
      drift(washGain.gain, pace * 0.81, 0.15);
      const ring = amp(osc("sine", low), 0.17);
      drift(ring.gain, pace * 1.67, 0.069);
      amp(filter("bandpass", high, 5, loop(0.79, "brown")), 0.06);
    } catch (err) {
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
  /* Runs with the scheduler: keeps the room tone of the current biome alive, crossfades it on a biome change
     and dips it a little while a boss carries the track. */
  syncTone() {
    let ctx = this.ctx;
    if (!ctx) return;
    let want = this.mode !== "off" && this.ambVol > 0 ? this.wantBiome() : null;
    if (this.toneBed && (!want || this.toneBed.name !== want)) this.stopTone();
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
    let dead = amb ? this.deadBeds[amb] : null;
    if (amb && !this.beds[amb] && (dead == null || now - dead >= 10)) this.startBed(amb);
    if (amb && now >= this.accentT) this.accent(amb, now);
    if (this.voices.length > 8) {
      for (let i = this.voices.length - 1; i >= 0; i--)
        if (this.voices[i].end < now) {
          if (!this.voices[i].bed) this._cleanupVoice(this.voices[i]);
          this.voices[i] = this.voices[this.voices.length - 1];
          this.voices.pop();
        }
    }
  }
  accent(name, now) {
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
    this.accentT = now + 4.3 + Math.random() * 5.1;
    const recipe = EVENT_ACCENTS[name];
    if (!recipe) return;
    const [start, end, dur, wave, vol] = recipe;
    const drift = 0.91 + Math.random() * 0.18;
    const pan = (Math.random() - 0.5) * 1.05;
    this.tone(start * drift, dur, wave, vol, { to: end * drift, attack: dur * 0.19, pan, lp: 2200 });
    this.noise(dur * 1.2, vol * 0.6, {
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
      }, 75);
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
    for (; this.nextT < ctx.currentTime + 0.22;) {
      let info = trackInfo(this.playKind, this.playBiome);
      try {
        if (this.playKind !== "off" && this.musVol > 0) {
          this.note(this.step, this.nextT);
        }
      } catch (err) {
        this.fail(err);
      }
      this.nextT += 60 / info.bpm / 4;
      this.step = (this.step + 1) % info.steps;
      if (this.jump && this.step % 16 === 0) {
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
     budget and the log of every voice. */
  static musicBudget(spec) {
    let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
      ctx = new Offline(1, 44100, 44100),
      engine = new SoundEngine(),
      info = trackInfo(spec.music, spec.biome),
      len = 60 / info.bpm / 4;
    engine.budgetOnly = spec.renderGraph !== true;
    engine.attach(ctx, { room: false });
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
  /* Test hook: render one sound (or a bed, or a stretch of music) offline: mono, 44.1 kHz. */
  static async renderOffline(spec, seconds = 2) {
    let Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext,
      ctx = new Offline(spec.stereo ? 2 : 1, Math.ceil(44100 * (seconds + 0.35)), 44100),
      engine = new SoundEngine(),
      base = 0;
    if (spec.bloom === false) engine.bloom = false;
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
        engine.startTone(spec.tone);
        engine.stopTone(spec.tone, spec.stopAt || 1.0, spec.fade || 0.25);
      } else if (spec.music) {
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
        seeded(() => {
          if (!spec.noBed) engine.startMusicBed(spec.music, spec.biome, 0.05);
          if (spec.impact) musicImpact(engine, spec.biome, 0);
          for (
            let n = 0, t = 0;
            t < Math.min(seconds - 0.25, spec.musicEnd != null ? spec.musicEnd : 1e9);
            n++, t += len
          ) {
            engine.simT = base + t;
            engine.cycle = Math.floor((first + n) / info.steps);
            engine.note((first + n) % info.steps, base + t);
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
        engine.play(spec.burst.id, spec.burst.arg);
      } else if (spec.noise) {
        engine.noise(spec.noise.dur, spec.noise.vol, spec.noise.opts || {});
      } else {
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

export { RL_SFX_VOICES, rlShotSfx, RL_TRAP_SOUND, attackVoice, SoundEngine };
