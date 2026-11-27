// Entry point: boot and wiring. Creates the save store, sound, renderer, input, overlay and UI,
// holds the game controller (game) and the main loop, and connects everything (page visibility,
// service worker, wake lock, save export/import). Every other module is reached from here through
// imports.

import { bossMedal, bossPar, MEDAL_NAMES } from "./core/medals.js";
import {
  RL_MON,
  RL_RT,
  errorLog,
  setLogContext,
  rlMonCrashed,
  rlMonFinish,
  rlMonFrame,
  rlMonPreEnd,
  rlMonStart,
  rlMonEnable,
  rlRunAudit,
  rlRunHealth,
  buildReport,
  logError,
} from "./core/diagnostics.js";
import { GameUI, RL_TOUCH_CLICK_GUARD, getById, rlBiomeTitle, escapeHtml } from "./ui/ui.js";
import { Input, touchInput } from "./ui/input.js";
import { HudEditor, applyHudLayout, fitHudLayout, fixedStickCenter } from "./ui/hud-layout.js";
import { SoundEngine } from "./audio/sound.js";
import {
  RL_RETIRE_NOTE,
  SaveStore,
  SAVE_KEY,
  SAVE_TEXT_LIMIT,
  rlRecordRun,
  set_RL_RETIRE_NOTE,
  RL_MODULE_NOTE,
  set_RL_MODULE_NOTE,
} from "./core/save.js";
import { enemyDefs, RL_ENEMY_TIPS, biomeVariants, eliteAffixes, bossDefs } from "./data/enemies.js";
import { BUILD_ID, GAME_VERSION, formatCount } from "./core/util.js";
import { biomeList } from "./data/biomes.js";
import { weaponDefs } from "./data/weapons.js";
import { MUTATORS } from "./core/mutators.js";
import { waveEvents } from "./core/waves.js";
import { World, rlStep } from "./core/world.js";
import { interpCapture, interpApply, interpRestore, interpReset } from "./render/interp.js";
import { makePacer, paceFrame } from "./render/pacing.js";
import { threatMods, milestones, threatLevels } from "./data/progression.js";
import { upgradesById } from "./data/upgrades.js";
import { Renderer } from "./render/renderer.js";
import { Overlay } from "./render/overlay.js";

const RESUME_MS = 800;
const RL_INTRO = { queue: [], last: 0 };
function rlIntroEvents(world) {
  if (game.tut) return; // the tutorial coach owns the screen on the first run
  // ... and the first one of each says what it does, once
  for (const ev of world.fx)
    if (ev.k === "spawn") {
      const variant = ev.variant && Object.values(biomeVariants).find((v) => v.id === ev.variant);
      if (variant) showTipOnce("var_" + variant.id, `${variant.name.toUpperCase()} enemies: ${variant.desc}`);
      const affix = ev.affix && eliteAffixes[ev.affix];
      if (affix) showTipOnce("aff_" + ev.affix, `${affix.name.toUpperCase()} elites: ${affix.desc}`);
    }
  for (const ev of world.fx) {
    if (
      (ev.k === "spawn" || ev.k === "champion" || (ev.k === "mend" && ev.type === "mossHealer")) &&
      RL_ENEMY_TIPS[ev.type] &&
      !store.data.seen["tip_enemy_" + ev.type] &&
      !RL_INTRO.queue.includes(ev.type)
    )
      RL_INTRO.queue.push(ev.type);
  }
  const now = performance.now();
  if (RL_INTRO.queue.length && now - RL_INTRO.last > 6500 && world.state === "fight") {
    const type = RL_INTRO.queue.shift(),
      seen = store.data.seen;
    seen["tip_enemy_" + type] = true;
    store.save("intro");
    RL_INTRO.last = now;
    ui.toast(`NEW · ${enemyDefs[type].name.toUpperCase()} — ${RL_ENEMY_TIPS[type]}`, "intro", 6200);
  }
}

const isStandaloneBuild = true;
function registerServiceWorker(onUpdate) {
  if (!(
    !isStandaloneBuild ||
    !("serviceWorker" in navigator) ||
    (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1")
  )) {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./", updateViaCache: "none" })
      .then((registration) => {
        let hadController = !!navigator.serviceWorker.controller,
          // 3.46.0: the reload listener is registered once for the session — offer() used to add
          // a fresh one every time an update was offered (each guarded, so it was noise, but the
          // closures stacked across a long session with several queued updates)
          reloaded = false,
          reload = () => {
            if (reloaded) return;
            if (game.mode !== "menu" || ui.screen !== "home" || !getById("dialog").hidden) {
              onUpdate(reload);
              return;
            }
            reloaded = true;
            location.reload();
          },
          offer = (worker) => {
            if (!(!worker || !navigator.serviceWorker.controller)) {
              onUpdate(() => {
                const sw = navigator.serviceWorker;
                const active = () => worker.state === "activated" || sw.controller === worker;
                if (active()) {
                  reload();
                  return;
                }
                const finish = () => {
                  if (!active()) return;
                  clearTimeout(timeout);
                  sw.removeEventListener("controllerchange", finish);
                  reload();
                };
                const timeout = setTimeout(() => {
                  sw.removeEventListener("controllerchange", finish);
                  if (active()) reload();
                  else if (worker.state === "installed" || worker.state === "activating") offer(worker);
                }, 4e3);
                sw.addEventListener("controllerchange", finish);
                worker.postMessage("skipWaiting");
              });
            }
          };
        if (registration.waiting && hadController) {
          offer(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          let worker = registration.installing;
          if (worker) {
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed") {
                offer(worker);
              }
            });
          }
        });
        let checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            checkForUpdate();
          }
        });
        window.addEventListener("online", checkForUpdate);
        setInterval(checkForUpdate, 900 * 1e3);
      })
      .catch((err) => logError("sw", err));
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }
}
let wakeLockSentinel = null,
  wakeLockWanted = false,
  wakeLockPending = false;
async function setWakeLock(on) {
  wakeLockWanted = on;
  try {
    if (on && !wakeLockSentinel && !wakeLockPending && navigator.wakeLock && document.visibilityState === "visible") {
      // 3.31.0: one request at a time, and a lock that arrives after the run was paused or left is given back at once
      // (it kept the screen awake behind the pause menu)
      wakeLockPending = true;
      let lock;
      try {
        lock = await navigator.wakeLock.request("screen");
      } finally {
        wakeLockPending = false;
      }
      if (!wakeLockWanted) {
        await lock.release();
        return;
      }
      wakeLockSentinel = lock;
      lock.addEventListener("release", () => {
        if (wakeLockSentinel === lock) wakeLockSentinel = null;
      });
    } else {
      if (!on && wakeLockSentinel) {
        const lock = wakeLockSentinel;
        wakeLockSentinel = null;
        await lock.release();
      }
    }
  } catch {
    wakeLockSentinel = null;
  }
}
if (typeof document < "u") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wakeLockWanted) {
      setWakeLock(true);
    }
  });
}
const noJsNotice = document.getElementById("nojs");
if (noJsNotice) {
  noJsNotice.remove();
}
setLogContext({ version: GAME_VERSION, build: BUILD_ID, mode: isStandaloneBuild ? "standalone" : "artifact" });
let store = new SaveStore(),
  sound = new SoundEngine(),
  elementById = (id) => document.getElementById(id),
  renderer = null;
try {
  renderer = new Renderer(elementById("gl"), { dpr: 2, antialias: true });
  let gl = renderer.renderer.getContext(),
    debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  setLogContext({ gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "n/a" });
} catch (err) {
  logError("webgl", err);
}
elementById("gl").addEventListener("webglcontextlost", () => {
  logError("webgl", "context lost");
  game.pause();
  input.reset(true);
  performanceOverlay.hidden = true;
  ui.syncGraphicsControls();
});
elementById("gl").addEventListener("webglcontextrestored", () => {
  logError("webgl", "context restored");
  ui.syncGraphicsControls();
  ui.toast(game.paused ? "Graphics restored. Resume when ready." : "Graphics restored.", "good");
});
let _resizeRaf = 0,
  _resizeWhy = "resize",
  _resizeFollowTimer = 0;
// 2.8.1: small viewport changes (browser bars sliding in and out, the soft keyboard) keep a held stick;
// only a real layout change (orientation flip or more than 20% width/height) releases it
let _inputViewW = window.innerWidth,
  _inputViewH = window.innerHeight;
function _resetInputForViewportChange(force = false) {
  const w = window.innerWidth,
    h = window.innerHeight,
    flipped = w > h !== _inputViewW > _inputViewH,
    big = Math.abs(w - _inputViewW) > 0.2 * _inputViewW || Math.abs(h - _inputViewH) > 0.2 * _inputViewH;
  if (!force && !flipped && !big) return;
  _inputViewW = w;
  _inputViewH = h;
  try {
    if (input && (input.move.active || input.aim.active)) {
      input.reset();
    }
  } catch (err) {
    logError("input-reset", err);
  }
}
function _scheduleResize(why) {
  _resizeWhy = why;
  if (!_resizeRaf) {
    _resizeRaf = requestAnimationFrame(() => {
      _resizeRaf = 0;
      try {
        invalidateSafeAreaInsets();
        game._settledOverlayFrames = 0;
        if (renderer) {
          renderer.markResize();
          renderer.resize();
        }
        overlay.resize();
        // a turn of the phone switches to the button layout of the other orientation
        if (hudEditor?.isOpen) hudEditor.onResize();
        else placeHud();
      } catch (err) {
        logError(_resizeWhy, err);
      }
    });
  }
}
window.__riftOnDeviceProfileSettled = () => _scheduleResize("viewport-settled");
window.addEventListener(
  "resize",
  () => {
    _resetInputForViewportChange();
    _scheduleResize("resize");
  },
  { passive: true },
);
window.addEventListener(
  "orientationchange",
  () => {
    _resetInputForViewportChange(true);
    _scheduleResize("orientation");
    clearTimeout(_resizeFollowTimer);
    _resizeFollowTimer = setTimeout(() => {
      _resizeFollowTimer = 0;
      _scheduleResize("orientation-follow");
    }, 120);
  },
  { passive: true },
);
if (window.visualViewport) {
  window.visualViewport.addEventListener(
    "resize",
    () => {
      _resetInputForViewportChange();
      _scheduleResize("viewport");
    },
    { passive: true },
  );
}
const overlay = new Overlay(elementById("ov")),
  input = new Input(elementById("touch"), renderer),
  game = {
    store: store,
    sound: sound,
    input: input,
    renderer: renderer,
    mode: "menu",
    world: null,
    paused: false,
    resumeAt: 0,
    previewW: store.data.weapon,
    buildId: BUILD_ID,
    chooseShown: false,
    overShown: false,
    slowMo: 0,
    get graphicsReady() {
      return !!renderer && !renderer.renderer.getContext().isContextLost();
    },
    _pendingUpdate: null,
    get pendingUpdate() {
      return this._pendingUpdate;
    },
    set pendingUpdate(fn) {
      this._pendingUpdate = fn || null;
      const btn = getById("updateReadyBtn");
      if (btn) btn.hidden = !this._pendingUpdate;
    },
    cloud: null,
    startRun(options) {
      if (!this.graphicsReady) return;
      store.syncForeign();
      const { resume } = options;
      lockLandscape();
      let save = store.data,
        snap = resume ? save.run : null;
      if (!resume) {
        save.stats.runs++;
      }
      let started = true;
      try {
        this.world = new World({
          seed: (Math.random() * 4294967296) >>> 0,
          weapon: options.weapon || save.weapon,
          threat: options.threat ?? save.threat,
          trapMode: options.trapMode ?? save.trapMode,
          ws: save.workshop,
          snap,
        });
      } catch (err) {
        logError("start", err);
        save.run = null;
        store.save("bad-run");
        ui.alert("Could not start", "The saved run could not be restored and was discarded.");
        started = false;
      }
      if (started) {
        document.activeElement?.blur?.();
        this.mode = "game";
        this.paused = false;
        this.clearResume();
        this.chooseShown = false;
        this.anvilShown = false;
        this._pausedFromChoose = this._pausedFromAnvil = false;
        this.overShown = false;
        this.acc = 0;
        this.slowMo = 0;
        this.intro = null;
        // 3.39.0: the boss medals earned in this run, shown on the end screen (awardBossMedal fills them)
        this.runMedals = [];
        // 2.8.1: enemies queued for an intro at the end of the last run are not announced in this one
        RL_INTRO.queue.length = 0;
        RL_INTRO.last = 0;
        RL_RT.runStartMs = Date.now();
        RL_RT.runErrorSnapshot = errorLog.map((entry) => `${entry.where}|${entry.msg}|${entry.n}`);
        if (renderer) {
          renderer.focusOn(null);
        }
        this.hintT = 0;
        ui.hideMenus();
        ui.hideOver();
        ui.hideChoose();
        ui.hideAnvil();
        ui.hidePause();
        ui.hideCrash();
        ui.showHud(true);
        window.__riftUpdateDeviceProfile?.();
        placeHud();
        input.reset(true);
        input.enabled = true;
        game.tut =
          !store.data.seen.tutorial && !resume && this.world.wave === 1
            ? { step: 0, t: 0, moved: 0, kills: 0, dashed: false }
            : null;
        if (game.tut) {
          this.world.hold = true;
        }
        ui.coach(null);
        overlay.resetCombat();
        if (renderer) {
          renderer.clearTransient();
          renderer.resetCamera();
        }
        sound.setMusic("fight", this.world.biomeFor(this.world.wave).id);
        syncSoundMuffle();
        setWakeLock(true);
      }
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity). Also runs when the world could not be built.
      try {
        if (this.world && this.mode === "game") {
          rlMonStart(this.world, !!(options && options.resume));
        }
      } catch (err) {
        logError("monitor", err);
      }
    },
    choose(index) {
      let world = this.world;
      if (!(!world || !world.choose(index))) {
        document.activeElement?.blur?.();
        this.chooseShown = false;
        ui.hideChoose();
        input.reset();
        if (world.state === "anvil") this.showAnvil();
        else this.saveCheckpoint("pick");
        syncSoundMuffle();
      }
    },
    showAnvil() {
      this.anvilShown = true;
      this._settledOverlayFrames = 0;
      input.reset();
      ui.showAnvil(this.world);
      this.saveCheckpoint("anvil");
      syncSoundMuffle();
    },
    buyAnvil(index) {
      if (this.paused || !this.world?.buyAnvil(index)) return;
      this.saveCheckpoint("anvil-buy");
      sound.play("buy");
      ui.showAnvil(this.world);
    },
    leaveAnvil() {
      if (this.paused || !this.world?.leaveAnvil()) return;
      this.anvilShown = false;
      ui.hideAnvil();
      input.reset();
      this.saveCheckpoint("anvil-leave");
      syncSoundMuffle();
    },
    saveCheckpoint(reason) {
      store.data.run = this.world.snapshot();
      store.save(reason);
    },
    /* 3.25.0: Seal Cards: the card is replaced and the craft never comes again in this run */
    seal(id) {
      const world = this.world;
      if (world && world.seal(id)) {
        ui.banishMode = false;
        ui.renderCards(world);
        ui.toast(`Sealed: ${upgradesById[id] ? upgradesById[id].name : id}`, "", 2600);
        store.data.run = world.snapshot();
        store.save("seal");
      }
    },
    reroll() {
      const world = this.world;
      if (world?.state !== "choose" || world.rerolls <= 0) return;
      if (world.reroll()) {
        ui.banishMode = false;
        ui.renderCards(world, { resetScroll: true });
      } else {
        sound.play("deny");
        ui.toast("No new crafts this time. Reroll kept.", "", 1800);
      }
      this.saveCheckpoint("reroll");
    },
    toggleMute() {
      const settings = store.data.settings;
      settings.muted = !settings.muted;
      if (!settings.muted && (settings.master ?? 1) <= 0) {
        settings.master = 1;
      }
      this.settingsChanged();
      ui.syncMuteButton();
      if (ui.screen === "settings") ui.renderSettings();
      ui.toast(settings.muted ? "Sound muted" : "Sound unmuted", "", 1600);
    },
    pause() {
      let world = this.world;
      if (this.resumeAt) {
        this.clearResume();
        input.reset();
        ui.showPause(world);
        return;
      }
      if (!(
        this.mode !== "game" ||
        !world ||
        this.paused ||
        this.overShown ||
        (world.state !== "fight" && world.state !== "cleared" && world.state !== "choose" && world.state !== "anvil")
      )) {
        this.paused = true;
        this._pausedFromChoose = this.chooseShown && !getById("choose").hidden;
        this._pausedFromAnvil = this.anvilShown && getById("anvil") && !getById("anvil").hidden;
        if (this._pausedFromChoose) getById("choose").hidden = true;
        if (this._pausedFromAnvil) getById("anvil").hidden = true;
        input.reset();
        ui.showPause(world);
        sound.setMusic("menu");
        syncSoundMuffle();
        store.save("pause");
        setWakeLock(false);
      }
    },
    resume() {
      if (!this.graphicsReady || !this.paused || this.resumeAt || needsRotate() || document.hidden) return;
      document.activeElement?.blur?.();
      ui.hidePause();
      if (this._pausedFromChoose || this._pausedFromAnvil) {
        this.finishResume();
      } else {
        this.resumeAt = performance.now() + RESUME_MS;
        getById("resumeCountNum").textContent = "3";
        getById("resumeCount").hidden = false;
      }
    },
    clearResume() {
      this.resumeAt = 0;
      getById("resumeCount").hidden = true;
    },
    finishResume() {
      this.clearResume();
      this.paused = false;
      if (this._pausedFromChoose) {
        this._pausedFromChoose = false;
        ui.resumeChoose();
      } else if (this._pausedFromAnvil) {
        this._pausedFromAnvil = false;
        getById("anvil").hidden = false;
        ui.coverHud(true);
      } else {
        ui.coverHud(false);
        placeHud();
      }
      input.reset();
      this.last = performance.now();
      renderer?.engine.resetAdaptivePacing();
      setWakeLock(true);
      if (this.world) {
        sound.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id, true);
      }
      syncSoundMuffle();
    },
    restart() {
      if (!this.graphicsReady) return;
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true, true);
      this.retry();
    },
    // Start a new run with the same expedition rules as the previous attempt.
    retry() {
      const world = this.world;
      this.startRun(world ? { weapon: world.weapon, threat: world.threat, trapMode: world.trapMode } : {});
    },
    abandon() {
      if (!this.world || this.mode !== "game" || this.overShown) return;
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true);
    },
    endless() {
      let world = this.world;
      if (this.graphicsReady && this.overShown && world?.state === "victory") {
        document.activeElement?.blur?.();
        ui.hideOver();
        this.overShown = false;
        input.reset(true);
        // the counters and the clock of the Endless part start again (World.enterEndless, shared with the tests)
        world.enterEndless();
        this.saveCheckpoint("endless");
        ui.showHud(true);
        placeHud();
        this.chooseShown = false;
        this.anvilShown = false;
        syncSoundMuffle();
        // 2.8.1: the victory screen released the wake lock; Endless needs it again
        setWakeLock(true);
        // 2.2.3: the endless part is monitored as a new run (3.43.1: inside the guard - a stray call
        // used to reset the monitor's baseline in the middle of a running endless run)
        try {
          if (this.world && this.world.endless) {
            rlMonStart(this.world, true);
          }
        } catch (err) {
          logError("monitor", err);
        }
      }
    },
    goHome() {
      this.mode = "menu";
      this.world = null;
      this.paused = false;
      this.clearResume();
      this.chooseShown = false;
      this.anvilShown = false;
      this.overShown = false;
      this.tut = this.intro = null;
      this.slowMo = 0;
      cardEvent = cardMutator = null;
      RL_INTRO.queue.length = 0;
      ui.coach(null);
      this._pausedFromChoose = false;
      this._pausedFromAnvil = false;
      this._settledOverlayFrames = 0;
      input.reset(true);
      overlay.resetCombat();
      if (renderer) renderer.clearTransient();
      ui.hideOver();
      ui.hideChoose();
      ui.hideAnvil();
      ui.hidePause();
      ui.showHud(false);
      window.__riftUpdateDeviceProfile?.();
      ui.homeInit = false;
      ui.show("home");
      sound.setMusic("menu");
      syncSoundMuffle();
      setWakeLock(false);
      rlApplyUpdateWhenIdle("home");
    },
    // 2.8.1: a stored run that is replaced by a new one is settled like Abandon (its shards, kills and
    // play time are credited and it is written to the history) instead of being thrown away
    discardRun() {
      store.syncForeign();
      const snap = store.data.run;
      if (snap && !this.world) {
        try {
          this.world = new World({
            seed: 1,
            weapon: snap.weapon,
            threat: snap.threat,
            ws: store.data.workshop,
            snap,
          });
          this.overShown = false;
          this.endRun(false, true, true);
        } catch (err) {
          logError("discard", err);
        }
        this.world = null;
        this.overShown = false;
      }
      store.data.run = null;
      store.save("discard");
    },
    recover() {
      ui.hideCrash();
      this.crashed = false;
      this.goHome();
      startLoop();
    },
    endRun(win, abandoned = false, silent = false) {
      // 2.8.1: take over what another tab saved before crediting this run
      store.syncForeign();
      // 2.2.3: run monitor, read before the run is settled
      const world = this.world,
        pre = world && !this.overShown ? rlMonPreEnd(world) : null;
      // 1.6.0: run metrics for the game-over screen (ui.showOver reads game._runExtra)
      this._runExtra = world
        ? {
            dmgDealt: world.dmgDealt,
            dmgTaken: world.runStats && world.runStats.dmgTaken,
            critHits: world.runStats && world.runStats.critHits,
            dashes: world.runStats && world.runStats.dashes,
            bestCombo: world.bestCombo,
          }
        : null;
      let save = store.data,
        stats = save.stats;
      if (!world || this.overShown) return;
      this.overShown = true;
      input.reset(true);
      rlRunAudit(world, win, abandoned);
      let mods = threatMods(world.threat),
        salvage = 1 + 0.1 * (save.workshop.extraShards || 0),
        collected = world.shards,
        bonus = win ? Math.round(collected * 0.25) : 0,
        total = Math.round((collected + bonus) * mods.shards * salvage),
        rows = [["Collected", collected]];
      if (bonus) {
        rows.push(["Clear bonus +25%", "+" + bonus]);
      }
      if (world.threat > 0) {
        rows.push([`${threatLevels[world.threat].name} \xD7${mods.shards.toFixed(2)}`, "\xD7"]);
      }
      if (salvage > 1) {
        rows.push([`Extra Shards \xD7${salvage.toFixed(1)}`, "\xD7"]);
      }
      let claimedBefore = new Set(this.claimable()),
        unlocks = [],
        wave = win ? 20 : world.wave,
        best = wave > stats.bestWave,
        fastest = win && !world.endless && world.time > 0 && (stats.bestTime <= 0 || world.time < stats.bestTime);
      stats.bestWave = Math.max(stats.bestWave, wave);
      if (fastest) {
        stats.bestTime = world.time;
      }
      stats.bestBy[world.weapon] = Math.max(stats.bestBy[world.weapon] || 0, wave);
      stats.kills += world.kills;
      stats.playTime += world.time;
      stats.shardsEarned += total;
      stats.legendaries += world.legendaries;
      stats.flawless += world.flawless;
      stats.evolved += world.evolved;
      stats.bestCombo = Math.max(stats.bestCombo, world.bestCombo);
      for (let bossId of world.bossKills) stats.bosses[bossId] = (stats.bosses[bossId] || 0) + 1;
      if (win && !world.endless) {
        stats.clears++;
        stats.clearsBy[world.weapon] = (stats.clearsBy[world.weapon] || 0) + 1;
        stats.bestClearThreat = Math.max(stats.bestClearThreat, world.threat);
        if (world.threat >= save.threatMax && save.threatMax < 5) {
          save.threatMax = world.threat + 1;
          unlocks.push(`${threatLevels[save.threatMax].name} unlocked`);
        }
      } else {
        stats.deaths += abandoned ? 0 : 1;
      }
      save.shards += total;
      save.run = null;
      store.save("run-end");
      let newMilestones = this.claimable()
        .filter((id) => !claimedBefore.has(id))
        .map((id) => milestones.find((milestone) => milestone.id === id).name);
      if (game.tut) {
        store.data.seen.tutorial = true;
        game.tut = null;
        ui.coach(null);
        store.save("tutorial");
      }
      if (silent) this.overShown = false;
      else {
        ui.showHud(false);
        ui.hideChoose();
        ui.hideAnvil();
        this.chooseShown = this.anvilShown = false;
        ui.showOver({
          win: win,
          abandoned: abandoned,
          wave: wave,
          time: world.time,
          kills: world.kills,
          bosses: world.bossKills.length,
          weapon: world.weapon,
          threat: world.threat,
          trapMode: world.trapMode,
          rows: rows,
          total: total,
          best: best,
          milestones: newMilestones,
          unlocks: unlocks,
          // 3.39.0: the boss medals earned in this run (name, medal, time and the par they were measured against)
          medals: (this.runMedals || []).splice(0),
          canEndless: win && !world.endless,
          endless: !!world.endless,
          killer: win || abandoned ? null : world.lastHit,
          // 3.21.0: the recap of a lost run: the last hits (seconds before the end, the final one last) and the damage taken
          lastHits: win || abandoned ? [] : world.hitLog.map((h) => ({ ...h, ago: Math.max(0, world.time - h.t) })),
          taken: win || abandoned ? {} : world.takenBy,
          dmgSrc: world.dmgSrc,
          weaponName: weaponDefs[world.weapon].name,
          fastest: fastest,
        });
        sound.setMusic("menu");
        syncSoundMuffle();
        setWakeLock(false);
      }
      // 2.2.3: run audit and run history (only run synthetic post-run monitor probes when diagnostics are enabled)
      if (pre && RL_MON?.enabled)
        try {
          rlMonFinish(world, pre, !!win, !!abandoned, !!silent, false);
        } catch (err) {
          logError("audit", err);
        }
      if (pre)
        try {
          rlRecordRun(store, world, pre, !!win, !!abandoned);
        } catch (err) {
          logError("history", err);
        }
    },
    settingsChanged(quiet) {
      applySettings();
      if (!quiet) {
        store.save("settings");
      }
    },
    resetProgress() {
      if (!store.reset()) {
        ui.alert(
          "Could not reset",
          "Storage is unavailable or full. Your previous progress is still kept. Free some space and try again.",
        );
        return;
      }
      afterProgressReset("Progress reset");
    },
    // 3.48.0: the stock settings come back; afterProgressReset re-applies them, re-renders the
    // settings screen if it is open and says so
    resetSettings() {
      store.resetSettings();
      afterProgressReset("Settings restored");
    },
    claimable() {
      let save = store.data;
      return milestones
        .filter((milestone) => !save.milestones[milestone.id] && milestone.test(save))
        .map((milestone) => milestone.id);
    },
    previewWeapon(weapon) {
      this.previewW = weapon;
    },
  };
/* 3.24.0: the medal of a boss kill (core/medals.js): the best one per boss is kept; a banner says what was earned */
function awardBossMedal(ev, world) {
  try {
    const def = bossDefs[ev.id];
    if (!def) return;
    const medal = bossMedal(ev.id, ev.secs, ev.damage, world.stats.maxHp, threatMods(world.threat).boss);
    if (!medal) return;
    store.syncForeign();
    const stats = store.data.stats;
    stats.medals = stats.medals || {};
    const old = stats.medals[ev.id],
      better = !old || medal > old.medal || (medal === old.medal && ev.secs < old.secs);
    if (better) {
      stats.medals[ev.id] = { medal, secs: Math.round(ev.secs * 10) / 10, damage: Math.round(ev.damage) };
      store.save("medal");
    }
    // 3.39.0: the end screen lists every medal of the run with its par time (the toast stays for the moment)
    game.runMedals = game.runMedals || [];
    game.runMedals.push({
      id: ev.id,
      name: def.name,
      medal,
      secs: Math.round(ev.secs),
      par: Math.round(bossPar(ev.id, threatMods(world.threat).boss)),
    });
    // a toast (another banner of the same moment would replace a banner at once)
    ui.toast(
      `${MEDAL_NAMES[medal]} medal \u00b7 ${def.name} down in ${Math.round(ev.secs)} s${ev.damage <= 0 ? ", no damage taken" : ""}${better && old ? " \u2014 a new best" : ""}`,
      medal === 3 ? "good" : "",
      4800,
    );
  } catch (err) {
    logError("medal", err);
  }
}
function afterProgressReset(message) {
  ui.homeInit = false;
  applySettings();
  if (ui.screen === "settings") {
    ui.renderSettings();
  }
  ui.toast(message);
}
const ui = new GameUI(game);
game.ui = ui;
ui.syncGraphicsControls();
const hudEditor = touchInput ? new HudEditor({ store, ui, input, onSave: () => game.settingsChanged() }) : null;
/* the button layout of the player on the HUD that is on screen; a layout that does not fit this screen gives way to the
   default layout (see fitHudLayout), and the player hears about it once */
let placeHudRetry = 0;
function placeHud(retry = 0) {
  if (!touchInput) return;
  const settings = store.data.settings;
  applyHudLayout(settings);
  const radius = input.radius();
  const fit = fitHudLayout(settings, radius);
  const center = settings.stickFixed ? fixedStickCenter(settings, radius) : null;
  input.fixedMove = center ? () => center : null;
  if (fit === "later") {
    // the device classes of index.html follow the turn a frame later (at most ten frames are waited for)
    cancelAnimationFrame(placeHudRetry);
    if (retry < 10) placeHudRetry = requestAnimationFrame(() => placeHud(retry + 1));
    return;
  }
  if (fit)
    ui.toast(
      "Your button layout does not fit this screen: the default layout is used. Edit it in Settings.",
      "hint",
      5000,
    );
}
if (hudEditor && typeof ResizeObserver === "function") {
  const hud = getById("hud");
  let fitFrame = 0;
  const observer = new ResizeObserver(() => {
    if (fitFrame || !hud.classList.contains("custom")) return;
    // Applying a fallback resizes the readouts too. Let the observer finish its current delivery first.
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      if (hud.classList.contains("custom") && !hud.hidden && hud.style.visibility !== "hidden" && !hudEditor.isOpen) {
        placeHud();
      }
    });
  });
  for (const readout of hud.querySelectorAll(
    ".hp-block, .wave-block, #bossBar, #shardChip, #performanceOverlay, #hudFeedback",
  )) {
    observer.observe(readout);
  }
}
input.onBlur = () => {
  if (game.mode === "game") {
    game.pause();
  }
};
input.isPlaying = () =>
  game.mode === "game" &&
  !game.paused &&
  !game.overShown &&
  !needsRotate() &&
  (game.world?.state === "fight" || game.world?.state === "cleared");
input.onDeny = (action) => {
  ui.actionFlash(action, "deny");
  sound.play("deny");
};
input.onMute = () => game.toggleMute();
input.onPause = () => {
  if (!getById("dialog").hidden) {
    ui.closeDialog(null);
    return;
  }
  // 2.4.2 Esc: back in menu pages; from settings opened in the pause menu back to the pause menu
  if (ui.rlFromPause) return ui.back();
  if (game.mode === "menu") {
    if (input._rlKey === "escape" && ["workshop", "records", "news", "settings"].includes(ui.screen)) {
      ui.back();
    }
    return;
  }
  if (game.mode === "game") {
    if (game.paused && !game.resumeAt) {
      game.resume();
    } else {
      game.pause();
    }
  }
};
/* 3.58.0: the motion preference of the device. index.html already stops the CSS animations; the camera shake
   and the weapon recoil are three.js, so they read the flag here. 3.57.0's note promised this and the code
   never asked, so a reduced-motion player still got a shaking camera. */
const _motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let _reducedMotion = !!_motionQuery?.matches;
const reducedMotion = () => _reducedMotion;
if (_motionQuery?.addEventListener) {
  _motionQuery.addEventListener("change", (ev) => {
    _reducedMotion = !!ev.matches;
    applySettings();
  });
}
const performanceOverlay = getById("performanceOverlay");
let perfWindowAt = 0,
  perfFrameCount = 0,
  perfCpuMs = 0;

function updatePerformanceOverlay(now, workMs) {
  const state = game.world?.state;
  if (
    game.mode !== "game" ||
    game.paused ||
    game.overShown ||
    document.hidden ||
    (state !== "fight" && state !== "cleared")
  ) {
    performanceOverlay.hidden = true;
    return;
  }
  if (performanceOverlay.hidden) {
    perfWindowAt = now;
    perfFrameCount = perfCpuMs = 0;
    performanceOverlay.textContent = "Measuring…";
    performanceOverlay.hidden = false;
    return; // The starting frame sets the clock for the first measurement.
  }
  if (workMs != null) {
    perfFrameCount++;
    perfCpuMs += workMs;
  }
  const elapsed = now - perfWindowAt;
  if (elapsed < 500 || !perfFrameCount) return;
  const fps = Math.round((1000 * perfFrameCount) / elapsed);
  performanceOverlay.textContent = `${fps} FPS · ${(perfCpuMs / perfFrameCount).toFixed(1)} ms CPU`;
  perfWindowAt = now;
  perfFrameCount = perfCpuMs = 0;
}

function applySettings() {
  let settings = store.data.settings,
    master = settings.muted ? 0 : (settings.master ?? 1);
  sound.setVolumes(settings.sfx * master, settings.music * master, settings.ambience * master);
  ui.syncMuteButton();
  if (!settings.performanceOverlay) performanceOverlay.hidden = true;
  input.stickScale = settings.stickSize;
  placeHud();
  if (renderer) {
    // 3.57.0: the camera distance, the warning contrast and the screen-shake toggle were settings nobody
    // needed: the camera now sits at its tuned distance, warnings draw in their own colours, and the shake
    // is a fixed, gentler amount (endless mode used to stack it into something unpleasant).
    renderer.numbers = settings.numbers !== false;
    renderer.motion = reducedMotion() ? 0 : 1;
  }
}
let loopFrameId = 0,
  frameErrorCount = 0;
/* Mobile runs pause in portrait and request landscape where the browser supports orientation lock. */
function needsRotate() {
  return document.body.classList.contains("needs-rotate");
}
function lockLandscape() {
  if (!touchInput) return;
  try {
    const lock = screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape");
    if (lock && lock.catch) lock.catch(() => {});
  } catch {}
}
function startLoop() {
  if (!loopFrameId) {
    game.last = performance.now();
    loopFrameId = requestAnimationFrame(loopTick);
  }
}
const framePacer = makePacer();
const playFrameOptions = { pacer: framePacer };
function loopTick(now) {
  loopFrameId = requestAnimationFrame(loopTick);
  if (document.visibilityState === "hidden") return;
  let dt = (now - (game.last || now)) / 1e3;
  if (!paceFrame(framePacer, now, store.data.settings.frameRate)) return;
  {
    game.last = now;
    if (!game.graphicsReady) return;
    dt = Math.min(0.1, Math.max(0, dt));
    // A mobile run waits paused behind the rotate screen.
    if (needsRotate()) game.pause();
    try {
      if (game.resumeAt && !document.hidden) {
        const remaining = game.resumeAt - now;
        if (remaining <= 0) {
          game.finishResume();
          dt = 0;
        } else {
          getById("resumeCountNum").textContent = String(Math.min(3, Math.ceil((remaining * 3) / RESUME_MS)));
        }
      }
      const frameStart = performance.now();
      const renderStats = store.data.settings.performanceOverlay && renderer?.renderer.info.render;
      const frameBefore = renderStats?.frame;
      runFrame(dt);
      frameErrorCount = 0;
      if (renderStats || RL_MON) {
        const workMs = performance.now() - frameStart;
        if (renderStats) updatePerformanceOverlay(now, renderStats.frame > frameBefore ? workMs : null);
        if (RL_MON)
          try {
            rlMonFrame(workMs);
          } catch {}
      }
    } catch (err) {
      frameErrorCount++;
      logError("frame", err);
      if (frameErrorCount >= 3) {
        cancelAnimationFrame(loopFrameId);
        loopFrameId = 0;
        game.crashed = true;
        setWakeLock(false);
        rlMonCrashed();
        ui.showCrash(buildReport());
      }
    }
  }
}
function runFrame(dt) {
  let settings = store.data.settings,
    world = game.world;
  if (game.mode === "game" && world) {
    if (!game.paused) {
      let slow = game.slowMo > 0 ? 0.35 : 1;
      game.slowMo = Math.max(0, game.slowMo - dt);
      const noMotion = reducedMotion();
      const stopped = noMotion ? 0 : Math.min(world.hitstopT, dt);
      world.hitstopT = noMotion ? 0 : world.hitstopT - stopped;
      if (game.intro) {
        updateBossIntro(dt, world);
      } else if (!(world.hitstopT > 0)) {
        game.acc += (dt - stopped) * slow;
      }
      let steps = 0,
        maxSteps = 5;
      // 3.28.1: an ended run stands still behind the end screen. An abandoned run went on in the background (it is still in
      // its fight) and the start of its next wave wrote it back into the save, so Continue brought the abandoned run back.
      if (game.overShown) game.acc = 0;
      if (game.interpWorld !== world) {
        interpReset();
        game.interpWorld = world;
      }
      for (; !(world.hitstopT > 0) && game.acc >= rlStep && steps < maxSteps;) {
        // 3.31.0: where everything was before the step, so a frame can be drawn between two steps (render/interp.js)
        interpCapture(world);
        world.step(rlStep, input.sample(world, settings, rlStep));
        game.acc -= rlStep;
        steps++;
        if (world.hitstopT > 0 && noMotion) world.hitstopT = 0;
      }
      if (steps >= maxSteps) {
        game.acc = 0;
      }
      handleWorldEvents(world);
      // 3.9.0: the sounds of the place (hazards and the far sounds of the biome), not while the boss card shows
      // 3.43.1: and not behind the end screen - an abandoned run stayed in its fight, so its soundscape, the
      // heartbeat and the fight intensity played on under the menu music of the "RUN ENDED" screen
      if (!game.overShown) {
        if (!game.intro && (world.state === "fight" || world.state === "cleared")) sound.place(world, dt);
        rlIntroEvents(world);
        updateTutorial(dt, world);
        updateHeartbeat(dt, world);
        sound.setIntensity(
          world.state === "fight"
            ? world.enemies.length / 34 +
                world.eb.length / 90 +
                (world.boss ? 0.4 : 0) +
                (world.player.hp / world.stats.maxHp < 0.3 ? 0.2 : 0)
            : 0,
        );
      }
    }
    if (game.paused) return;
    if (renderer) {
      renderer.consume(world.fx, world, settings);
      if (renderer.mapChanged) {
        renderer.mapChanged = false;
        sound.play("rumble");
      }
    }
    sound.consume(world.fx, world);
    world.fx.length = 0;
    // 3.31.0: the drawing sees the moving things between the last two steps; restore() puts the simulation's own
    // positions back before anything else runs (also when a draw throws)
    // (game.noInterp: the full-QA section smooth compares with and without)
    if (game.interpWorld === world && !game.noInterp) interpApply(game.acc / rlStep);
    try {
      const staticOverlay = game.chooseShown || game.anvilShown || game.overShown;
      if (!staticOverlay) game._settledOverlayFrames = 0;
      if (renderer && (!staticOverlay || (game._settledOverlayFrames = (game._settledOverlayFrames || 0) + 1) <= 2)) {
        renderer.frame(dt, world, playFrameOptions);
      }
      if (renderer && !staticOverlay) {
        // Touch hints are shown only during the opening tutorial for touch input.
        let hints = !!game.tut && game.tut.step <= 1 && touchInput;
        overlay.draw(renderer, world, input, { hints: hints, dt: dt, safe: safeAreaInsets() });
      } else overlay.clear();
    } finally {
      interpRestore();
    }
    if (!game.chooseShown && !game.anvilShown && !game.overShown) ui.hud(world);
    if (world.state === "choose" && !game.chooseShown && !game.overShown) {
      game.chooseShown = true;
      game._settledOverlayFrames = 0;
      input.reset();
      ui.showChoose(world);
      syncSoundMuffle();
      // 3.30.0: the next wave's layout is built while the player reads the cards (no hitch when one is picked)
      const prefetch = () => game.world === world && world.prefetchLayout();
      if (window.requestIdleCallback) requestIdleCallback(prefetch, { timeout: 1500 });
      else setTimeout(prefetch, 300);
    }
    if (world.state === "anvil" && !game.anvilShown && !game.overShown) {
      game.showAnvil();
      const prefetch = () => game.world === world && world.prefetchLayout();
      if (window.requestIdleCallback) requestIdleCallback(prefetch, { timeout: 1500 });
      else setTimeout(prefetch, 300);
    }
    if (world.state === "dead" && world.stateT > 1.5 && !game.overShown) {
      game.endRun(false);
    }
    if (world.state === "victory" && world.stateT > 0.8 && !game.overShown) {
      game.endRun(true);
    }
  } else {
    if (renderer && ui.screen === "home") {
      renderer.frame(dt, null, {
        menu: true,
        weapon: game.previewW,
        biome: biomeList[menuBiomeIndex()],
      });
    }
    overlay.clear();
  }
}
function menuBiomeIndex() {
  let bestWave = store.data.stats.bestWave;
  return Math.min(biomeList.length - 1, Math.floor(Math.max(0, bestWave - 1) / 5));
}

let cardWave = 0,
  cardEvent = null,
  // 3.3.0: an Endless mutator gained on a biome's first wave is announced after the card (and after its event)
  cardMutator = null;
/* the banner and the cue of an Endless mutator */
function announceMutator(ev) {
  const mutator = MUTATORS[ev.id];
  if (!mutator) return;
  ui.banner(`Modifier · ${mutator.name}${ev.level > 1 ? " " + "I".repeat(ev.level) : ""}`, mutator.desc, "warn", 2600);
  sound.play("mutator", ev.id);
}
function syncSoundMuffle() {
  const world = game.world,
    inGame = game.mode === "game" && !!world && !game.overShown,
    choosing = inGame && (game.chooseShown || game.anvilShown || world.state === "choose" || world.state === "anvil"),
    lowWard = inGame && world.player.alive && world.player.hp / Math.max(1, world.stats.maxHp) < 0.25;
  sound.setMuffleState?.({
    paused: !!(inGame && game.paused),
    choosing: !!choosing,
    lowWard: !!lowWard,
  });
}
/* 2.7.0: what the sound engine needs every frame of a running world: the artificer speed for movement
 foley (null: idle, e.g. between waves and while the boss card shows) and the biome event that is on
 for its ambience. The engine switches both off by itself when this stops (pause, menus). */
function rlAudioState(world) {
  const fight = world.state === "fight" && !game.intro,
    player = world.player;
  sound.setState(
    fight ? Math.min(1, Math.hypot(player.vx, player.vy) / Math.max(1, world.stats.speed)) : null,
    fight ? world.event : null,
  );
  syncSoundMuffle();
}
function handleWorldEvents(world) {
  rlAudioState(world);
  // 2.5.0 D: find the title cards of this frame before the banners are shown
  let card = null,
    boss = null;
  for (const ev of world.fx) {
    if (ev.k === "wave" && !ev.boss && (ev.n === 1 || world.biomeFor(ev.n - 1).id !== world.biomeFor(ev.n).id)) {
      card = ev;
    } else {
      if (ev.k === "boss" && bossDefs[ev.id]) {
        boss = ev;
      }
    }
  }
  // 2.5.0 B: the events of the new modules
  for (const ev of world.fx) {
    if (ev.k === "kit") {
      ui.toast(`Starter Pack · ${ev.ids.map((id) => upgradesById[id]?.name || id).join(", ")}`, "good hint", 3200);
    } else {
      if (ev.k === "barrier") {
        ui.banner("Emergency Shield", "Low HP — shield activated", "good", 1400);
      }
    }
  }
  for (let ev of world.fx)
    switch (ev.k) {
      case "wave": {
        // 3.28.1: never for a run that has ended (see runFrame)
        if (!game.overShown) game.saveCheckpoint("wave");
        let biome = world.biomeFor(ev.n);
        let newBiome = ev.n === 1 || world.biomeFor(ev.n - 1).id !== biome.id;
        if (renderer) {
          if (newBiome) renderer.clearTransient();
          renderer.resetCamera();
        }
        if (ev.event) {
          let event = waveEvents[ev.event];
          ui.banner(event.name, `Wave ${ev.n} \xB7 ${event.desc}`, "good", 2600);
          // 2.7.0: on the first wave of a biome the banner (and its cue) comes after the title card, see below
          if (!newBiome) {
            sound.play("event", ev.event);
          }
        } else
          ui.banner(
            ev.boss ? "Boss" : `Wave ${ev.n}`,
            ev.boss ? "Boss incoming" : newBiome ? rlBiomeTitle(biome) : world.endless ? "Endless" : "",
            ev.boss ? "boss" : "",
            ev.boss ? 3e3 : 2e3,
          );
        if (!ev.boss && world.arena.vents.length) {
          if (world.arena.biome.id === "lanternYard")
            showTipOnce("shock", "Shoot or dash through a glowing Bell-Censer to stun enemies and clear nearby shots.");
          else if (world.arena.biome.id === "emberHill")
            showTipOnce(
              "pyro",
              "Lava vents glow before they erupt. Lure enemies onto them \u2014 the lava burns them too.",
            );
          else showTipOnce("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too.");
        }
        if (!ev.boss && world.arena.ice.length) {
          showTipOnce("ice", "Snow Ridge: the floor is icy and slippery \u2014 enemies slide on it too.");
        }
        if (!ev.boss && world.arena.acid.length) {
          showTipOnce("acid", "Acid pools drain your HP \u2014 but enemies standing in them take 25% more damage.");
        }
        if (!ev.boss && world.arena.portals.length) {
          showTipOnce("portal", "Portals warp you across the arena. Shots fly through them too.");
        }
        if (!ev.boss && world.arena.devils && world.arena.devils.length) {
          showTipOnce("devil", "Whirlwinds pull you off course. Dash clear when they drift close.");
        }
        sound.setMusic("fight", biome.id);
        if (ev.n === 2) {
          showTipOnce(
            "dash",
            touchInput
              ? "Tip: DASH dodges through attacks \u2014 you cannot be hit during it."
              : "Tip: SPACE or right-click dashes \u2014 you cannot be hit during a dash.",
          );
        }
        if (ev.n === 4) {
          showTipOnce(
            "gravityBell",
            touchInput
              ? "Tip: tap BELL to toss a Gravity Bell at enemies. Hold the right side to aim where it lands."
              : "Tip: press G to toss a Gravity Bell. It pulls enemies together and bursts. Charges refill.",
          );
        }
        if (ev.n === 3) {
          showTipOnce(
            "aim",
            touchInput
              ? "Tip: drag the right side to aim yourself. Holding it fires at the nearest enemy."
              : "Tip: hold the left mouse button to aim and fire at the cursor.",
          );
        }
        break;
      }
      case "trapWarn":
        showTipOnce(
          "trap",
          "Arena traps warn before they trigger \u2014 lure enemies in, or shoot mines to clear them safely.",
        );
        break;
      case "gadgetReady":
        ui.actionFlash("gravityBell", "pop");
        break;
      case "gadgetDeny":
        ui.actionFlash("gravityBell", "deny");
        break;
      case "boss":
        // 3.1.0: the boss track starts on the spot, at the camera pan
        sound.setMusic("boss", world.biomeFor(world.wave).id);
        showTipOnce("boss", "Bosses telegraph every attack. Move away from marked zones and beams.");
        if (world.player.alive && world.boss && renderer) {
          game.intro = { t: 0 };
          renderer.focusOn(world.boss.x, world.boss.y);
          input.settle();
        } else {
          ui.banner(ev.name, ev.title, "boss", 2600);
        }
        break;
      case "novaReady":
        showTipOnce(
          "fireBurst",
          touchInput
            ? "Fire Burst is charged \u2014 tap BURST to unleash a wide shockwave."
            : "Fire Burst is charged \u2014 press E to unleash a wide shockwave.",
        );
        break;
      case "cleared":
        ui.banner(ev.boss ? "Boss Defeated" : "Cleared", ev.flawless ? "Flawless" : `Wave ${ev.n}`, "good", 1500);
        if (!ev.boss) {
          game.slowMo = Math.max(game.slowMo, 0.45);
        }
        break;
      case "hurt":
        if (!ev.chip) {
          ui.hurtFlash();
          overlay.addHurt(world, ev.sx, ev.sy);
        }
        break;
      case "champion":
        ui.banner(
          "Champion",
          `A ${enemyDefs[ev.type].name} rallies the pack \u2014 nearby enemies move faster`,
          "warn",
          2200,
        );
        showTipOnce("champion", "Champions bolster nearby enemies. Defeat the champion to break the aura.");
        break;
      case "championDown":
        ui.banner("Champion Defeated", "Pack aura broken", "good", 1400);
        game.slowMo = Math.max(game.slowMo, 0.5);
        break;
      case "bossAtk":
        overlay.callout(ev.atk, ev.id);
        break;
      case "offer":
        if (!game.overShown) {
          store.data.run = world.snapshot();
          store.save("offer");
        }
        break;
      case "maxed":
        ui.toast(`No crafts available · ${ev.heal > 0 ? `+${ev.heal} HP · ` : ""}+${ev.shards} shards`, "gold", 3500);
        break;
      case "combo":
        ui.comboPop(ev.n, ev.bonus);
        break;
      case "bountyPulse":
        if (ev.amount > 0) ui.toast(`Bonus · +${ev.amount} shards`, "good hint", 1500);
        break;
      case "pick":
        if (ev.evo) {
          ui.banner("Master Craft", upgradesById[ev.id].name, "good", 1800);
        }
        break;
      case "dash":
        if (game.tut) {
          game.tut.dashed = true;
        }
        break;
      case "enrage":
        ui.banner("Phase 2", "The Boss speeds up", "warn", 1400);
        break;
      case "mutator":
        if (world.wave === 1 || world.biomeFor(world.wave - 1).id !== world.biomeFor(world.wave).id)
          cardMutator = { ...ev, wave: world.wave };
        else announceMutator(ev);
        break;
      case "phase":
        ui.banner(`Phase ${ev.n}`, ev.n === 2 ? "The arena shifts" : "Final phase!", "warn", 1600);
        break;
      case "bossDown":
        game.slowMo = 1.1;
        if (world.player.alive) awardBossMedal(ev, world);
        break;
      case "revive":
        ui.banner("Second Chance", "Back in the fight!", "good", 1600);
        break;
      case "die":
        game.slowMo = 0.55;
        sound.setMusic("off");
        break;
      case "victory":
        sound.setMusic("menu");
        break;
    }
  // 2.5.0 D: show the title cards
  try {
    if (card) {
      ui.biomeCard(world.biomeFor(card.n), card.n);
      cardWave = card.n;
      cardEvent = (card.event && waveEvents[card.event]) || null;
    }
    if (boss) {
      ui.bossCard(boss.id, world.biomeFor(world.wave));
    }
    // the biome card stays for the first BIOME_CARD_TIME s of its wave (game time), the boss card for the
    // camera pan; then they fade. An event of the biome's first wave is announced after the card.
    const hold = ui.cardHold;
    if (
      hold &&
      (hold.kind === "boss"
        ? !game.intro
        : world.wave !== cardWave || world.state !== "fight" || world.waveT >= BIOME_CARD_TIME)
    ) {
      ui.releaseTitleCard();
      const ev = hold.kind === "biome" && world.wave === cardWave && world.state === "fight" && cardEvent;
      const wave = cardWave;
      if (ev) {
        setTimeout(() => {
          if (game.world === world && !game.paused && world.state === "fight" && world.wave === wave) {
            ui.banner(ev.name, `Wave ${wave} \xB7 ${ev.desc}`, "good", 2600);
            sound.play("event", ev.id);
          }
        }, 450);
      }
      const mut = hold.kind === "biome" && cardMutator && cardMutator.wave === world.wave ? cardMutator : null;
      if (hold.kind === "biome") cardMutator = null;
      if (mut)
        setTimeout(
          () => {
            if (game.world === world && !game.paused && world.state === "fight" && world.wave === mut.wave)
              announceMutator(mut);
          },
          ev ? 3100 : 450,
        );
      if (hold.kind === "biome") {
        cardEvent = null;
      }
    }
  } catch (err) {
    logError("titlecard", err);
  }
}
// 2.6.0: 1.5 s -> 3 s, so the camera pan and the boss card can be read (the world stands still meanwhile)
const BOSS_INTRO_TIME = 3;
// 2.6.0: how long the biome card stays, in game seconds of its wave (was 1.6)
const BIOME_CARD_TIME = 3.5;
function updateBossIntro(dt, world) {
  let intro = game.intro;
  intro.t += dt;
  if (renderer) {
    renderer.focusK = intro.t / BOSS_INTRO_TIME;
  }
  if (intro.t >= BOSS_INTRO_TIME || !world.boss) {
    game.intro = null;
    if (renderer) {
      renderer.focusOn(null);
    }
    if (world.boss) {
      world.boss.spawnT = Math.min(world.boss.spawnT, 0.1);
    }
    input.settle();
    game.acc = 0;
  }
}
let heartbeatTimer = 0;
function updateHeartbeat(dt, world) {
  let player = world.player;
  if (world.state !== "fight" || !player.alive || player.hp / world.stats.maxHp >= 0.25) {
    heartbeatTimer = 0;
    return;
  }
  heartbeatTimer -= dt;
  if (heartbeatTimer <= 0) {
    heartbeatTimer = 0.95;
    sound.play("heart");
  }
}
const tutorialTexts = [
  touchInput ? "Drag anywhere on the left side to move." : "Move with W A S D or the arrow keys.",
  touchInput
    ? "Enemies ahead! Your weapon shoots automatically \u2014 drag the right side to aim yourself."
    : "Enemies ahead! Your weapon shoots automatically \u2014 hold the left mouse button to aim yourself.",
  touchInput ? "Tap DASH to dodge through danger." : "Press SPACE or right-click to dash through danger.",
  "Collect shards \u2014 spend them on permanent upgrades in the Workshop.",
];
function updateTutorial(dt, world) {
  let tut = game.tut;
  if (tut) {
    tut.t += dt;
    if (tut.step === 0) {
      if (Math.hypot(world.player.vx, world.player.vy) > 2) {
        tut.moved += dt;
      }
      if (tut.moved > 1.1 || tut.t > 12) {
        tut.step = 1;
        tut.t = 0;
        world.hold = false;
        tut.k0 = world.kills;
      }
    } else {
      if (tut.step === 1) {
        if (world.kills - tut.k0 >= 4 || tut.t > 20) {
          tut.step = 2;
          tut.t = 0;
          tut.dashed = false;
        }
      } else {
        if (tut.step === 2) {
          if (tut.dashed || tut.t > 14) {
            tut.step = 3;
            tut.t = 0;
          }
        } else {
          if (tut.step === 3 && tut.t > 5) {
            tut.step = 4;
          }
        }
      }
    }
    if (tut.step >= 4 || world.state !== "fight") {
      game.tut = null;
      world.hold = false;
      ui.coach(null);
      let seen = store.data.seen;
      seen.tutorial = true;
      seen.tip_dash = true;
      seen.tip_aim = true;
      store.save("tutorial");
      return;
    }
    ui.coach(tut.step, tutorialTexts.length, tutorialTexts[tut.step]);
  }
}
function showTipOnce(key, text) {
  let seen = store.data.seen;
  if (!seen["tip_" + key]) {
    seen["tip_" + key] = true;
    store.save("tip");
    ui.toast(text, "hint", 5200);
  }
}
// 2.8.1: cached; it is read every frame and getComputedStyle forces a style recalculation on phones.
// The insets only change with the window size, so the cache is keyed on it (and refreshed every 2 s).
let rlInsets = null,
  rlInsetsKey = "";
function invalidateSafeAreaInsets() {
  rlInsets = null;
}
function safeAreaInsets() {
  const angle = typeof screen < "u" && screen.orientation ? screen.orientation.angle : 0;
  const key = window.innerWidth + "x" + window.innerHeight + ":" + angle;
  if (rlInsets && key === rlInsetsKey) return rlInsets;
  let style = getComputedStyle(document.documentElement),
    read = (name) => parseFloat(style.getPropertyValue(name)) || 0;
  rlInsets = { t: read("--st"), b: read("--sb"), l: read("--sl"), r: read("--sr") };
  rlInsetsKey = key;
  return rlInsets;
}
document.addEventListener("visibilitychange", () => {
  renderer?.engine.resetAdaptivePacing();
  if (document.visibilityState === "hidden") {
    performanceOverlay.hidden = true;
    if (game.mode === "game") {
      game.pause();
    }
    // 3.46.0: keyups can be lost on backgrounding, so reset(true) forgets held keys.
    input.reset(true);
    store.save("hidden");
    sound.suspend();
  } else {
    sound.resume();
    game.last = performance.now();
  }
});
window.addEventListener("pagehide", () => {
  game.pause();
  setWakeLock(false);
  input.reset(true);
  store.save("pagehide");
  sound.suspend();
});
window.addEventListener("pageshow", (ev) => {
  input.reset(true);
  game.last = performance.now();
  renderer?.engine.resetAdaptivePacing();
  _scheduleResize("pageshow");
  if (ev.persisted && !document.hidden) {
    sound.resume();
    setWakeLock(game.mode === "game" && !game.paused && !game.overShown);
  }
});
const unlockAudio = () => {
  sound.unlock();
  if (sound.mode === "off" && game.mode === "menu") {
    sound.setMusic("menu");
  }
};
for (let type of ["pointerdown", "touchend", "keydown", "click"])
  document.addEventListener(type, unlockAudio, { capture: true, passive: true });
document.addEventListener("gesturestart", (ev) => ev.preventDefault());
document.addEventListener(
  "dblclick",
  (ev) => {
    const tag = ev.target?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    ev.preventDefault();
  },
  { passive: false },
);
document.addEventListener(
  "touchmove",
  (ev) => {
    let target = ev.target;
    if (!(
      target &&
      target.closest &&
      target.closest(
        ".scroll, .cards, .center-col, .dialog, #dlgBody, #buildStrip, #chooseUpInfo, textarea, input, .log",
      )
    )) {
      ev.preventDefault();
    }
  },
  { passive: false },
);

/* v1.6.0 merged polish: save backup (.json + text), corrupt-save recovery, diagnostic log + tutorial replay */
(function () {
  const makeBackup = function () {
    return store.text(2);
  };
  const downloadJson = function (filename, text) {
    try {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ui.toast(`Downloaded ${filename}`, "good", 2400);
    } catch {
      ui.copy(text);
    }
  };
  const latestCorruptRaw = function () {
    if (store.corruptBackupRaw) return { key: store.corruptBackupKey, raw: store.corruptBackupRaw };
    const entries = store.listBackups();
    if (!entries.length) return null;
    const latestKey = entries[0].key;
    return { key: latestKey, raw: store.getBackup(latestKey) || "" };
  };
  const inspectCorruptBackup = async function () {
    const entry = latestCorruptRaw();
    if (!entry) {
      ui.toast("No raw save backup found.");
      return;
    }
    const res = await ui.dialog({
      title: "Raw save backup",
      body: `<p>This is the raw data stored under <code>${escapeHtml(entry.key)}</code> before Riftline started fresh. You can copy or download it for manual recovery.</p><textarea id="corruptRawText" class="log" spellcheck="false" readonly></textarea>`,
      buttons: [
        { label: "Download .json", value: "download", cls: "ghost" },
        { label: "Copy", value: "copy", cls: "ghost" },
        { label: "Close", value: null, cls: "primary" },
      ],
      onOpen: function () {
        getById("corruptRawText").value = entry.raw;
      },
      read: function () {
        return getById("corruptRawText").value;
      },
    });
    if (res && res.value === "copy") ui.copy(res.text || entry.raw);
    if (res && res.value === "download") downloadJson("riftline-corrupt-backup.json", res.text || entry.raw);
  };
  const exportSave = async function () {
    const value = makeBackup();
    const result = await ui.dialog({
      title: "Export save",
      body: '<p>Download a <code>.json</code> backup file or copy the text below. It contains your Riftline progress and settings.</p><textarea id="saveExport" class="log" spellcheck="false" readonly></textarea>',
      buttons: [
        { label: "Download .json", value: "download", cls: "ghost" },
        { label: "Copy", value: "copy", cls: "ghost" },
        { label: "Close", value: null, cls: "primary" },
      ],
      onOpen: function () {
        getById("saveExport").value = value;
      },
      read: function () {
        return getById("saveExport").value;
      },
    });
    if (result && result.value === "copy") ui.copy(result.text || value);
    if (result && result.value === "download") {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`riftline-save-${stamp}.json`, result.text || value);
    }
  };
  const importSave = async function () {
    const result = await ui.dialog({
      title: "Import save",
      body: `<p>Choose a Riftline <code>.json</code> save file or paste your save export below. Importing replaces local progress on this device.</p><p><label class="btn small" style="display:inline-flex;cursor:pointer">Choose .json file<input id="saveFile" type="file" accept=".json,application/json,text/plain" hidden></label></p><textarea id="saveImport" class="log" spellcheck="false" maxlength="${SAVE_TEXT_LIMIT}" placeholder="Paste save JSON here"></textarea>`,
      buttons: [
        { label: "Cancel", value: null, cls: "ghost" },
        { label: "Restore", value: "restore", cls: "primary" },
      ],
      onOpen: function () {
        const fileEl = getById("saveFile"),
          area = getById("saveImport");
        if (fileEl && area) {
          let selection = 0;
          fileEl.addEventListener("change", () => {
            const request = ++selection;
            const file = fileEl.files?.[0];
            if (!file) return;
            const stillOpen = () => request === selection && area.isConnected && !getById("dialog").hidden;
            // A UTF-8 save can use up to three bytes per UTF-16 code unit, plus its optional BOM.
            if (file.size > SAVE_TEXT_LIMIT * 3 + 3) {
              ui.toast("This save file is too large.", "warn");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              if (!stillOpen()) return;
              const text = String(reader.result ?? "");
              if (text.length > SAVE_TEXT_LIMIT) {
                ui.toast("This save file is too large.", "warn");
                return;
              }
              area.value = text;
              ui.toast(`Loaded ${file.name}`, "good", 2000);
            };
            reader.onerror = () => {
              if (stillOpen()) ui.toast("Could not read the save file.", "warn");
            };
            reader.readAsText(file);
          });
        }
      },
      read: function () {
        return getById("saveImport").value;
      },
    });
    if (!result || result.value !== "restore") return;
    const parsed = store.parse(result.text);
    if (!parsed.ok) {
      ui.alert("Invalid save", "That text or file is not a valid Riftline save export.");
      return;
    }
    if (
      !(await ui.confirm(
        "Restore save?",
        "Your current local progress will be replaced by the imported save.",
        "Restore",
        true,
      ))
    )
      return;
    if (!store.restore(parsed)) {
      ui.alert(
        "Save not restored",
        "Storage is unavailable or full. Your previous progress is still kept. Free some space and import again.",
      );
      return;
    }
    // 2.4.2: apply the imported settings (volume, controls, graphics, camera) right away;
    // they used to wait for the next reload or settings change.
    applySettings();
    game.previewW = store.data.weapon;
    game._runExtra = null;
    game.goHome();
    ui.toast("Save restored", "gold", 2400);
  };
  const backupBtn = getById("backupBtn");
  const shareBtn = getById("shareBtn");
  const restoreBtn = getById("restoreBtn");
  const replayTutBtn = getById("replayTutBtn");
  const diagLogBtn = getById("diagLogBtn");
  if (backupBtn) {
    ui.click(backupBtn, exportSave);
  }
  if (shareBtn && !navigator.share) shareBtn.hidden = true;
  if (shareBtn) {
    ui.click(shareBtn, async function () {
      const value = makeBackup();
      try {
        await navigator.share({ title: "Riftline save", text: value });
        ui.toast("Save shared", "good", 2200);
      } catch (err) {
        if (err && err.name !== "AbortError") ui.toast("Share failed — use Export instead");
      }
    });
  }
  if (restoreBtn) {
    ui.click(restoreBtn, importSave);
  }
  if (diagLogBtn) {
    ui.click(diagLogBtn, () => ui.copy(buildReport("diagnostics")));
  }
  ui.click(getById("corruptDownloadBtn"), () => {
    const entry = latestCorruptRaw();
    if (entry) downloadJson("riftline-corrupt-backup.json", entry.raw);
  });
  ui.click(getById("corruptInspectBtn"), inspectCorruptBackup);
  ui.click(getById("corruptDismissBtn"), () => {
    ui.corruptDismissed = true;
    const banner = getById("corruptBanner");
    if (banner) banner.hidden = true;
  });
  ui.click(getById("corruptSetInspectBtn"), inspectCorruptBackup);
  ui.click(getById("corruptSetDownloadBtn"), () => {
    const entry = latestCorruptRaw();
    if (entry) downloadJson("riftline-corrupt-backup.json", entry.raw);
  });
  if (replayTutBtn) {
    ui.click(replayTutBtn, async function () {
      const ok = await ui.confirm(
        "Replay tutorial?",
        "The four-step introduction will play on your next new run. Your progress stays untouched.",
        "Enable",
      );
      if (!ok) return;
      store.data.seen.tutorial = false;
      store.save("tutorial-replay");
      ui.toast("The four-step introduction will play on your next new run.", "good", 2800);
    });
  }
})();
// 2.4.0: say once that the retired weapons of an old save were converted.
function rlRetireToast() {
  const note = RL_RETIRE_NOTE;
  if (!note || !note.count) return;
  set_RL_RETIRE_NOTE(null);
  ui.toast(
    `Older weapon unlocks converted to the current arsenal${note.refund ? `, +${formatCount(note.refund)} shards refunded` : ""}.`,
    "good",
    9000,
  );
  store.save("retire");
}

/* ---- 2.2.3 (the run monitor hooks are in game.startRun, game.endRun and game.endless) ---- */
(() => {
  // Touch ghost-click shield: after a touch activation the browser still sends a
  // compatibility click to whatever is under the finger NOW — often a button on
  // the next screen, a settings toggle or a Home "buy". Drop that one click
  // in the capture phase, before any handler (guarded or plain) can see it.
  document.addEventListener(
    "pointerdown",
    () => {
      RL_TOUCH_CLICK_GUARD.until = 0;
      RL_TOUCH_CLICK_GUARD.key = "";
    },
    true,
  );
  document.addEventListener(
    "click",
    (ev) => {
      const guard = RL_TOUCH_CLICK_GUARD;
      if (!guard.until || ev.detail === 0) return;
      if (performance.now() > guard.until) {
        guard.until = 0;
        guard.key = "";
        return;
      }
      const dx = ev.clientX - guard.x,
        dy = ev.clientY - guard.y;
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36) {
        guard.until = 0;
        guard.key = "";
        RL_RT.uiGuardDrops++;
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true,
  );
})();
/* ==========================================================================
 Riftline 2.4.2: bug fixes and quality of life
 - a run that is already lost (or won) is settled when the page is hidden, so a reload in
   the 1.5 s before the game-over screen no longer brings the run back
 - Settings can be opened from the pause menu (without backup and reset)
 - the build in the pause menu explains each craft on tap or click
 ========================================================================== */
(() => {
  // ---- settle a lost or won run before the page goes away
  const settle = () => {
    const world = game.world;
    if (!(game.mode !== "game" || !world || game.overShown || (world.state !== "dead" && world.state !== "victory"))) {
      game.endRun(world.state === "victory");
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      settle();
    }
  });
  window.addEventListener("pagehide", settle);

  // ---- settings from the pause menu
  ui.click(getById("pauseSetBtn"), () => ui.openPauseSettings());

  ui.click(getById("sealBtn"), () => {
    ui.banishMode = !ui.banishMode;
    ui.renderCards(game.world);
  });

  // ---- the button layout editor
  if (hudEditor) ui.click(getById("hudEditBtn"), () => hudEditor.open());

  // ---- what each craft of the build does (pause menu)
  const info = getById("pauseUpInfo"),
    upInfo = (id, lv) => {
      const upgrade = upgradesById[id];
      if (!upgrade) return "";
      const tag = upgrade.boss
        ? "BOSS REWARD"
        : upgrade.evo
          ? "MASTER CRAFT"
          : upgrade.repeat
            ? `\xD7${lv}`
            : `LV ${lv}/${upgrade.max}`;
      return `<b>${escapeHtml(upgrade.name)}</b> <span class="lv">${tag}</span><p>${escapeHtml(upgrade.desc(Math.max(0, lv - 1)))}</p>`;
    };
  getById("pauseBuild").addEventListener("click", (ev) => {
    const button = ev.target.closest && ev.target.closest("[data-up]"),
      world = game.world;
    if (!button || !world) return;
    for (const el of getById("pauseBuild").querySelectorAll("[data-up]")) {
      const sel = el === button;
      el.classList.toggle("sel", sel);
      el.setAttribute("aria-pressed", String(sel));
    }
    info.innerHTML = upInfo(button.dataset.up, world.up[button.dataset.up] || 0);
  });
})();
applySettings();
ui.show("home");
setTimeout(rlRetireToast, 700);
const diagOptIn =
  (typeof location !== "undefined" && /[?&]diag=1\b/.test(location.search)) ||
  (typeof navigator !== "undefined" && !!navigator.webdriver);
if (diagOptIn) {
  setTimeout(() => {
    rlRunHealth({ context: "startup" }).catch((err) => logError("health", err));
  }, 900);
}
if (renderer) {
  startLoop();
} else {
  elementById("playBtn").disabled = true;
  elementById("continueBtn").disabled = true;
  elementById("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  elementById("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  const webglBanner = elementById("webglBanner");
  if (webglBanner) webglBanner.hidden = false;
  ui.toast(
    "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
    "warn",
    9000,
  );
}
// Fade out the warm boot veil once the first menu frame is painted.
{
  const veil = elementById("bootVeil");
  if (veil) {
    veil.style.pointerEvents = "none";
    requestAnimationFrame(() => {
      veil.classList.add("done");
      setTimeout(() => veil.remove(), 340);
    });
  }
}
// 2.4.6: no "New version ready" bar any more. A downloaded update is applied on its own when no run
// is going on: right away while the game is still starting (that is the next opening), otherwise
// as soon as the player is back in the menu after a run or hides the page while in the menu. A
// run is never interrupted; the page only reloads when the player is not playing.
const rlBootAt = performance.now();
function rlApplyUpdateWhenIdle(why) {
  if (!game.pendingUpdate || game.mode !== "menu" || game.world) return;
  if (why === "found" && performance.now() - rlBootAt > 10e3) return; // not while someone is looking
  // 2.8.1: never reload under an open dialog (an import with pasted text) or another menu screen
  if (!getById("dialog").hidden || ui.screen !== "home") return;
  const apply = game.pendingUpdate;
  game.pendingUpdate = null;
  store.save("update");
  apply();
}
registerServiceWorker((apply) => {
  game.pendingUpdate = apply;
  const upBtn = getById("updateReadyBtn");
  if (upBtn) upBtn.hidden = false;
  rlApplyUpdateWhenIdle("found");
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    rlApplyUpdateWhenIdle("hidden");
  }
});
// 2.8.1: two tabs (or the browser and the installed app) used to overwrite each other's save. In the menu
// this tab reloads what the other one wrote; during a run it takes it over at its next save.
let rlForeignWarned = false;
window.addEventListener("storage", (ev) => {
  if (ev.key !== SAVE_KEY || !ev.newValue) return;
  store.foreign = true;
  if (game.mode === "menu" && !game.world && getById("dialog").hidden) {
    store.syncForeign(false);
    applySettings();
    ui.homeInit = false;
    if (ui.screen === "home") ui.renderHome();
    else if (ui.screen === "workshop") ui.renderWorkshop();
    else if (ui.screen === "records") ui.renderRecords();
    else if (ui.screen === "settings") ui.renderSettings();
    return;
  }
  if (!rlForeignWarned) {
    rlForeignWarned = true;
    ui.toast(
      "Riftline is open in another tab. Progress from both is kept, but play in one tab at a time.",
      "warn",
      7000,
    );
  }
});
// Shared browser interface for the functional flows and visual/audio probes.
window.__riftTest = { game, ui, store, renderer, overlay, World, biomeList, health: rlRunHealth };

/* ==========================================================================
   2.5.0 B: workshop merge notice and the events of the new modules
   ========================================================================== */
// Say once that merged workshop modules were refunded (after start-up, or after importing an old
// save). Saving right away stores the converted save, so the notice does not come back.
function rlModuleToast() {
  const note = RL_MODULE_NOTE;
  if (!note || !note.count) return;
  set_RL_MODULE_NOTE(null);
  ui.toast(
    `Older workshop purchases converted to ${note.into.join(" and ")}. Levels refunded: +${formatCount(note.refund)} shards.`,
    "good",
    9000,
  );
  store.save("modules");
}
setTimeout(rlModuleToast, 1100);
// 3.32.0: the save could not be read and not be backed up either (full storage): this tab keeps it and saves nothing
setTimeout(() => {
  if (store.held)
    ui.toast(
      "Your save could not be read or backed up because the storage is full. Free some space and reload; until then, progress is not saved.",
      "warn",
      12000,
    );
}, 1300);
store.onChange((json, why) => {
  if (why === "import" && RL_MODULE_NOTE) {
    setTimeout(rlModuleToast, 300);
  }
  // 2.8.1: an imported old save may also contain retired weapons
  if (why === "import" && RL_RETIRE_NOTE) {
    setTimeout(rlRetireToast, 400);
  }
});
// 3.37.0: the run monitor (per-step sampling, spawn-plan and event checks, the post-run audit) is test-only:
// it turns on here, so every script in tests/ still gets it, while a player's run carries none of the work.
// 3.43.1: the gate is real now (it never was: the comment promised a test session, the call ran for everyone).
// Every in-repo harness drives the game through puppeteer/playwright, which set navigator.webdriver;
// a player's browser does not. A player's run carries none of the per-step sampling again.
if (navigator.webdriver) rlMonEnable();

export { ui, store, game, safeAreaInsets, input, renderer };
