// Entry point: boot and wiring. Creates the save store, sound, renderer, input, overlay and UI,
// holds the game controller (game) and the main loop, and connects everything (page visibility,
// service worker, wake lock, save export/import). Every other module is reached from here through
// imports.

import { rumble } from "./ui/haptics.js";
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
import { Input } from "./ui/input.js";
import { HudEditor, applyHudLayout, fitHudLayout, fixedStickCenter } from "./ui/hud-layout.js";
import { SoundEngine } from "./audio/sound.js";
import {
  RL_RETIRE_NOTE,
  SaveStore,
  SAVE_KEY,
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
import "./render/biome-visuals.js";
import { Overlay } from "./render/overlay.js";

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
      (ev.k === "spawn" || ev.k === "champion") &&
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
    if (type === "mender") {
      seen.tip_mender = true;
    }
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
            if (!reloaded) {
              reloaded = true;
              location.reload();
            }
          },
          offer = (worker) => {
            if (!(!worker || !navigator.serviceWorker.controller)) {
              onUpdate(() => {
                navigator.serviceWorker.addEventListener("controllerchange", reload);
                worker.postMessage("skipWaiting");
                setTimeout(reload, 4e3);
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
  // 3.13.0: thunder and sirens of the place come with their light
  sound.onScape = (kind, pan) => renderer.scapeLight(kind, pan);
  let gl = renderer.renderer.getContext(),
    debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  setLogContext({ gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "n/a" });
} catch (err) {
  logError("webgl", err);
}
elementById("gl").addEventListener("webglcontextlost", () => logError("webgl", "context lost"));
elementById("gl").addEventListener("webglcontextrestored", () => {
  logError("webgl", "context restored");
  // 2.9.1: say so; the picture may flicker or look different for a moment (it used to be only logged)
  try {
    ui.toast("Graphics were reset by the browser and restored.", "warn");
  } catch {}
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
        if (renderer) {
          renderer.resize();
        }
        // a turn of the phone switches to the button layout of the other orientation
        if (hudEditor.isOpen) hudEditor.onResize();
        else placeHud();
      } catch (err) {
        logError(_resizeWhy, err);
      }
    });
  }
}
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
  input = new Input(elementById("touch")),
  game = {
    store: store,
    sound: sound,
    input: input,
    renderer: renderer,
    mode: "menu",
    world: null,
    paused: false,
    previewW: store.data.weapon,
    buildId: BUILD_ID,
    chooseShown: false,
    overShown: false,
    slowMo: 0,
    pendingUpdate: null,
    cloud: null,
    startRun(options) {
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
        this.mode = "game";
        this.paused = false;
        this.chooseShown = false;
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
        ui.hidePause();
        ui.hideCrash();
        ui.showHud(true);
        placeHud();
        input.reset();
        input.enabled = true;
        game.freeze = 0;
        game.tut =
          !store.data.seen.tutorial && !resume && this.world.wave === 1
            ? { step: 0, t: 0, moved: 0, kills: 0, dashed: false }
            : null;
        if (game.tut) {
          this.world.hold = true;
        }
        ui.coach(null);
        if (renderer) {
          renderer.resetCamera();
        }
        sound.setMusic("fight", this.world.biomeFor(this.world.wave).id);
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
        this.chooseShown = false;
        ui.hideChoose();
        input.reset();
      }
    },
    /* 3.25.0: Banish Protocol: the card is replaced and the upgrade never comes again in this run */
    banish(id) {
      const world = this.world;
      if (world && world.banish(id)) {
        ui.banishMode = false;
        ui.renderCards(world);
        ui.toast(`Banished: ${upgradesById[id] ? upgradesById[id].name : id}`, "", 2600);
        store.data.run = world.snapshot();
        store.save("banish");
      }
    },
    reroll() {
      let world = this.world;
      if (world && world.reroll()) {
        ui.renderCards(world);
        // the "reroll" event plays the shuffle sound
        store.data.run = world.snapshot();
        store.save("reroll");
      }
    },
    pause() {
      let world = this.world;
      if (!(
        this.mode !== "game" ||
        !world ||
        this.paused ||
        this.overShown ||
        (world.state !== "fight" && world.state !== "cleared")
      )) {
        this.paused = true;
        input.reset();
        ui.showPause(world);
        sound.setMusic("menu");
        store.save("pause");
        setWakeLock(false);
      }
    },
    resume() {
      // Do not resume behind the portrait rotation prompt.
      if (this.paused && !needsRotate()) {
        this.paused = false;
        ui.hidePause();
        input.reset();
        this.last = performance.now();
        setWakeLock(true);
        if (this.world) {
          sound.setMusic(this.world.boss ? "boss" : "fight", this.world.biomeFor(this.world.wave).id, true);
        }
      }
    },
    restart() {
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true, true);
      this.retry();
    },
    // a new run with the weapon and threat of the current (ended) run
    retry() {
      const world = this.world;
      this.startRun(world ? { weapon: world.weapon, threat: world.threat } : {});
    },
    abandon() {
      ui.hidePause();
      this.paused = false;
      this.endRun(false, true);
    },
    endless() {
      let world = this.world;
      if (!(!world || world.state !== "victory")) {
        ui.hideOver();
        this.overShown = false;
        // the counters and the clock of the Endless part start again (World.enterEndless, shared with the tests)
        world.enterEndless();
        ui.showHud(true);
        placeHud();
        this.chooseShown = false;
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
      ui.hideOver();
      ui.hideChoose();
      ui.hidePause();
      ui.showHud(false);
      ui.homeInit = false;
      ui.show("home");
      sound.setMusic("menu");
      setWakeLock(false);
      rlApplyUpdateWhenIdle("home");
    },
    // 2.8.1: a stored run that is replaced by a new one is settled like Abandon (its shards, kills and
    // play time are credited and it is written to the history) instead of being thrown away
    discardRun() {
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
      rlRunAudit(world, win, abandoned);
      let mods = threatMods(world.threat),
        salvage = 1 + 0.1 * (save.workshop.salvage || 0),
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
        rows.push([`Shard Refinery \xD7${salvage.toFixed(1)}`, "\xD7"]);
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
        ui.showOver({
          win: win,
          abandoned: abandoned,
          wave: wave,
          time: world.time,
          kills: world.kills,
          bosses: world.bossKills.length,
          weapon: world.weapon,
          threat: world.threat,
          rows: rows,
          total: total,
          best: best,
          milestones: newMilestones,
          unlocks: unlocks,
          // 3.39.0: the boss medals earned in this run (name, medal, time and the par they were measured against)
          medals: (this.runMedals || []).splice(0),
          canEndless: win && !world.endless,
          killer: win || abandoned ? null : world.lastHit,
          // 3.21.0: the recap of a lost run: the last hits (seconds before the end, the final one last) and the damage taken
          lastHits: win || abandoned ? [] : world.hitLog.map((h) => ({ ...h, ago: Math.max(0, world.time - h.t) })),
          taken: win || abandoned ? {} : world.takenBy,
          dmgSrc: world.dmgSrc,
          weaponName: weaponDefs[world.weapon].name,
          fastest: fastest,
        });
        sound.setMusic("menu");
        setWakeLock(false);
      }
      // 2.2.3: run audit and run history (a silent end is recorded too)
      if (pre)
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
    const medal = bossMedal(ev.id, ev.secs, ev.damage, world.stats.maxHp, threatMods(world.threat).boss),
      stats = store.data.stats;
    if (!medal) return;
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
const hudEditor = new HudEditor({ store, ui, input, onSave: () => game.settingsChanged() });
/* the button layout of the player on the HUD that is on screen; a layout that does not fit this screen gives way to the
   default layout (see fitHudLayout), and the player hears about it once */
let placeHudRetry = 0;
function placeHud(retry = 0) {
  applyHudLayout(store.data.settings);
  const fit = fitHudLayout(store.data.settings, input.radius());
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
input.onBlur = () => {
  if (game.mode === "game") {
    game.pause();
  }
};
/* 3.58.0: the motion preference of the device. index.html already stops the CSS animations; the camera shake
   and the weapon recoil are three.js, so they read the flag here. 3.57.0's note promised this and the code
   never asked, so a reduced-motion player still got a shaking camera. */
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
if (typeof matchMedia === "function") {
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  if (motionQuery.addEventListener) motionQuery.addEventListener("change", () => applySettings());
}
function applySettings() {
  let settings = store.data.settings;
  sound.setVolumes(settings.sfx, settings.music, settings.ambience);
  input.stickScale = settings.stickSize;
  input.fixedMove = settings.stickFixed ? (radius) => fixedStickCenter(store.data.settings, radius) : null;
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
  frameErrorCount = 0,
  dimFrameCounter = 0,
  menuFrame = 0;
/* 3.11.0: Riftline plays in landscape on phones and tablets. index.html sets needs-rotate on <body> while such a
   device is held upright (the rotate screen). Where the browser allows it (an installed app, Android in full screen)
   the screen is also locked to landscape when a run starts; elsewhere the lock is refused and nothing happens. */
function needsRotate() {
  return document.body.classList.contains("needs-rotate");
}
function lockLandscape() {
  if (document.body.dataset.device === "desktop") return;
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
function loopTick(now) {
  loopFrameId = requestAnimationFrame(loopTick);
  let dt = (now - (game.last || now)) / 1e3;
  if (!paceFrame(framePacer, now, store.data.settings.frameRate)) return;
  {
    game.last = now;
    dt = Math.min(0.1, Math.max(0, dt));
    // 3.11.0: a phone or tablet held upright shows the rotate screen; a run waits paused behind it (pause() does
    // nothing outside the fight or when already paused)
    if (needsRotate()) game.pause();
    try {
      const frameStart = performance.now();
      runFrame(dt);
      frameErrorCount = 0;
      if (RL_MON)
        try {
          rlMonFrame(performance.now() - frameStart);
        } catch {}
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
    if (!game.paused && document.visibilityState !== "hidden") {
      let slow = game.slowMo > 0 ? 0.35 : 1;
      game.slowMo = Math.max(0, game.slowMo - dt);
      if (game.intro) {
        updateBossIntro(dt, world);
      } else {
        if (game.freeze > 0) {
          game.freeze -= dt;
        } else {
          game.acc += dt * slow; // 3.37.0: the never-assigned fast-forward hook game.speed is gone
        }
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
      for (; game.acc >= rlStep && steps < maxSteps;) {
        // 3.31.0: where everything was before the step, so a frame can be drawn between two steps (render/interp.js)
        interpCapture(world);
        world.step(rlStep, input.sample(world, settings));
        game.acc -= rlStep;
        steps++;
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
    sound.consume(world.fx, world.player);
    world.fx.length = 0;
    // 3.31.0: the drawing sees the moving things between the last two steps; restore() puts the simulation's own
    // positions back before anything else runs (also when a draw throws)
    // (game.noInterp: the full-QA section smooth compares with and without)
    if (game.interpWorld === world && !game.noInterp) interpApply(game.acc / rlStep);
    try {
      if (renderer) {
        let dimmed = game.chooseShown || game.overShown;
        if (!dimmed || (dimFrameCounter = (dimFrameCounter + 1) % 3) === 0) {
          renderer.frame(dimmed ? dt * 3 : dt, world);
        }
      }
      if (renderer && !(game.chooseShown || game.overShown)) {
        // Touch hints are shown only during the opening tutorial.
        let hints = !!game.tut && game.tut.step <= 1;
        overlay.draw(renderer, world, input, { hints: hints, dt: dt, safe: safeAreaInsets() });
      } else overlay.clear();
    } finally {
      interpRestore();
    }
    ui.hud(world);
    if (world.state === "choose" && !game.chooseShown && !game.overShown) {
      game.chooseShown = true;
      input.reset();
      ui.showChoose(world);
      // 3.30.0: the next wave's layout is built while the player reads the cards (no hitch when one is picked)
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
    if (renderer && (menuFrame = (menuFrame + 1) & 1) === 0) {
      renderer.frame(dt, null, { menu: true, weapon: game.previewW, biome: biomeList[menuBiomeIndex()] });
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
  ui.banner(
    `MUTATOR · ${mutator.name.toUpperCase()}${ev.level > 1 ? " " + "I".repeat(ev.level) : ""}`,
    mutator.desc,
    "warn",
    2600,
  );
  sound.play("mutator", ev.id);
}
/* 2.7.0: what the sound engine needs every frame of a running world: the drone speed for the engine
 hum (null: no hum, e.g. between waves and while the boss card shows) and the biome event that is on
 for its ambience. The engine switches both off by itself when this stops (pause, menus). */
function rlAudioState(world) {
  const fight = world.state === "fight" && !game.intro,
    player = world.player;
  sound.setState(
    fight ? Math.min(1, Math.hypot(player.vx, player.vy) / Math.max(1, world.stats.speed)) : null,
    fight ? world.event : null,
  );
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
      ui.toast(`STARTER KIT · ${ev.ids.map((id) => upgradesById[id]?.name || id).join(", ")}`, "good hint", 3200);
    } else {
      if (ev.k === "barrier") {
        ui.banner("EMERGENCY SHIELD", "Hull critical — barrier up", "good", 1400);
      }
    }
  }
  for (let ev of world.fx)
    switch (ev.k) {
      case "wave": {
        // 3.28.1: never for a run that has ended (see runFrame)
        if (!game.overShown) {
          store.data.run = world.snapshot();
          store.save("wave");
        }
        let biome = world.biomeFor(ev.n);
        if (renderer) {
          renderer.resetCamera();
        }
        let newBiome = ev.n === 1 || world.biomeFor(ev.n - 1).id !== biome.id;
        if (ev.event) {
          let event = waveEvents[ev.event];
          ui.banner(event.name, `Wave ${ev.n} \xB7 ${event.desc}`, "good", 2600);
          // 2.7.0: on the first wave of a biome the banner (and its cue) comes after the title card, see below
          if (!newBiome) {
            sound.play("event", ev.event);
          }
        } else
          ui.banner(
            ev.boss ? "WARNING" : `WAVE ${ev.n}`,
            ev.boss ? "Boss signature detected" : newBiome ? rlBiomeTitle(biome) : world.endless ? "Endless" : "",
            ev.boss ? "boss" : "",
            ev.boss ? 3e3 : 2e3,
          );
        if (!ev.boss && world.arena.vents.length) {
          // 3.4.0: Blackout City's vents are live manholes
          if (world.arena.biome.id === "city")
            showTipOnce(
              "shock",
              "Live manholes crackle before they arc. Lure enemies onto them \u2014 the current stuns them.",
            );
          // 3.49.0: the Caldera's vents are the fumaroles
          else if (world.arena.biome.id === "caldera")
            showTipOnce(
              "pyro",
              "A fumarole glows before it jets. Lure enemies onto it \u2014 the rock burns them too.",
            );
          else showTipOnce("lava", "Lava vents glow before they erupt. Lure enemies onto them \u2014 they burn too.");
        }
        if (!ev.boss && world.arena.ice.length) {
          showTipOnce(
            "ice",
            "The Aurora Shelf: the whole floor is slick, the ice sheets even more \u2014 enemies slide on them too.",
          );
        }
        if (!ev.boss && world.arena.acid.length) {
          showTipOnce("acid", "Acid pools eat at your hull \u2014 but enemies standing in them take 25% more damage.");
        }
        if (!ev.boss && world.arena.portals.length) {
          showTipOnce("portal", "Portals move you across the arena. Shots fly through them too.");
        }
        // 3.53.0: the Flats' dust devils - the first hazard that moves
        if (!ev.boss && world.arena.devils && world.arena.devils.length) {
          showTipOnce(
            "devil",
            "Dust devils wander the glass \u2014 the wind shoves you and bites. Enemies walk through untouched.",
          );
        }
        // 3.1.0: the boss track starts when the boss appears (case "boss"), until then the calm theme plays
        sound.setMusic("fight", biome.id);
        if (ev.n === 2) {
          showTipOnce("dash", "Tip: DASH makes you untouchable for a moment.");
        }
        if (ev.n === 4) {
          showTipOnce(
            "singularity",
            "Tip: tap the gadget button to throw a Singularity at the thickest crowd. Hold the aim side to pick the spot.",
          );
        }
        if (ev.n === 3) {
          showTipOnce("aim", "Tip: drag the right side to aim yourself. Holding it fires at the nearest enemy.");
        }
        break;
      }
      case "trapWarn":
        // 3.0.0: the first trap warning explains the telegraphs once
        showTipOnce(
          "trap",
          "Traps flash before they strike: rings on the floor, beams, mines. They hurt enemies too \u2014 lure them in.",
        );
        break;
      case "gadgetReady":
        ui.gadgetFlash("pop");
        break;
      case "gadgetDeny":
        ui.gadgetFlash("deny");
        break;
      case "boss":
        // 3.1.0: the boss track starts on the spot, at the camera pan
        sound.setMusic("boss", world.biomeFor(world.wave).id);
        showTipOnce("boss", "Bosses telegraph every attack. Marked zones and lines hit hard \u2014 move out.");
        if (world.player.alive && world.boss && renderer) {
          // 3.43.1: not on a dead player - the 3 s camera pan used to freeze the death animation and
          // hold the game-over screen back
          // 3.45.0: the intro card carries name and title through the pan - no second banner on top
          game.intro = { t: 0 };
          renderer.focusOn(world.boss.x, world.boss.y);
          input.settle();
        } else {
          ui.banner(ev.name, ev.title, "boss", 2600);
        }
        break;
      case "novaReady":
        showTipOnce("nova", "NOVA is charged \u2014 tap it to blast everything around you.");
        break;
      case "cleared":
        ui.banner(ev.boss ? "BOSS DOWN" : "CLEARED", ev.flawless ? "Flawless" : `Wave ${ev.n}`, "good", 1500);
        if (!ev.boss) {
          game.slowMo = Math.max(game.slowMo, 0.45);
        }
        break;
      case "hurt":
        if (!ev.chip) {
          rumble("hurt", store.data.settings.vibration !== false);
          ui.hurtFlash();
          overlay.addHurt(world, ev.sx, ev.sy);
          hitStop(0.06);
        }
        break;
      case "champion":
        ui.banner(
          "CHAMPION",
          `A ${enemyDefs[ev.type].name} leads the pack \u2014 its allies move faster`,
          "warn",
          2200,
        );
        showTipOnce("champion", "Champions rally nearby enemies. Take one down and the pack is stunned.");
        break;
      case "championDown":
        ui.banner("CHAMPION DOWN", "The pack is stunned", "good", 1400);
        game.slowMo = Math.max(game.slowMo, 0.5);
        hitStop(0.08);
        break;
      case "mend":
        showTipOnce("mender", "Menders heal other enemies. Kill them first.");
        break;
      case "kill":
        // 3.43.1: the escorts a boss death sweeps away vanish, but they no longer punch the screen
        if ((ev.elite || ev.r >= 0.8) && !ev.cleanup) {
          hitStop(ev.elite ? 0.05 : 0.025);
        }
        break;
      case "nova":
        hitStop(0.08);
        break;
      case "guardBreak":
        hitStop(0.03);
        break;
      case "bossAtk":
        overlay.callout(ev.atk);
        break;
      case "offer":
        if (!game.overShown) {
          store.data.run = world.snapshot();
          store.save("offer");
        }
        break;
      case "maxed":
        // 2.9.1: nothing left to offer: no choice screen, the run goes on with a small reward
        ui.toast(`ALL UPGRADES MAXED · hull +${ev.heal}, +${ev.shards} shards`, "gold", 3500);
        break;
      case "combo":
        ui.comboPop(ev.n, ev.bonus);
        break;
      case "bountyPulse":
        ui.toast(`BOUNTY · +${ev.amount} shards`, "good hint", 1500);
        break;
      case "pick":
        if (ev.evo) {
          ui.banner("EVOLVED", upgradesById[ev.id].name, "good", 1800);
        }
        break;
      case "dash":
        rumble("dash", store.data.settings.vibration !== false);
        if (game.tut) {
          game.tut.dashed = true;
        }
        break;
      case "enrage":
        ui.banner("ENRAGED", "", "warn", 1400);
        break;
      case "mutator":
        // 3.3.0: an Endless mutator joins the run (or gets a level stronger): after the title card if one shows
        if (world.wave === 1 || world.biomeFor(world.wave - 1).id !== world.biomeFor(world.wave).id)
          cardMutator = { ...ev, wave: world.wave };
        else announceMutator(ev);
        break;
      case "phase":
        ui.banner(`PHASE ${ev.n}`, "The core adapts", "warn", 1600);
        break;
      case "bossDown":
        game.slowMo = 1.1;
        // 3.43.1: a boss killed by the last burn of a dead player pays no medal (the kill itself pays
        // nothing after death - the stats agreed, the medal did not)
        if (world.player.alive) awardBossMedal(ev, world);
        break;
      case "revive":
        ui.banner("SECOND LIFE", "Hull restored", "good", 1600);
        break;
      case "die":
        rumble("die", store.data.settings.vibration !== false);
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
function hitStop(duration) {
  let now = performance.now();
  if (!(now - (game.lastStop || 0) < 180)) {
    game.lastStop = now;
    game.freeze = Math.max(game.freeze || 0, duration);
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
  () => "Drag anywhere on the left side to move.",
  () => "Enemies! Your drone fires on its own \u2014 drag the right side to aim yourself.",
  () => "Tap DASH to dodge through danger.",
  () => "Grab the shards \u2014 they buy permanent upgrades in the Workshop.",
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
    ui.coach(tut.step, tutorialTexts.length, tutorialTexts[tut.step]());
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
  rlInsetsKey = "",
  rlInsetsAt = 0;
function safeAreaInsets() {
  const key = window.innerWidth + "x" + window.innerHeight,
    now = performance.now();
  if (rlInsets && key === rlInsetsKey && now - rlInsetsAt < 2000) return rlInsets;
  let style = getComputedStyle(document.documentElement),
    read = (name) => parseFloat(style.getPropertyValue(name)) || 0;
  rlInsets = { t: read("--st"), b: read("--sb"), l: read("--sl"), r: read("--sr") };
  rlInsetsKey = key;
  rlInsetsAt = now;
  return rlInsets;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    if (game.mode === "game") {
      game.pause();
    }
    // Backgrounding can lose pointer cancellation events on mobile browsers.
    input.reset();
    store.save("hidden");
    sound.suspend();
  } else {
    sound.resume();
    game.last = performance.now();
  }
});
window.addEventListener("pagehide", () => {
  input.reset();
  store.save("pagehide");
});
window.addEventListener("pageshow", () => {
  input.reset();
  _scheduleResize("pageshow");
});
const unlockAudio = () => {
  sound.unlock();
  if (sound.mode === "off" && game.mode === "menu") {
    sound.setMusic("menu");
  }
};
for (let type of ["pointerdown", "keydown", "click"])
  document.addEventListener(type, unlockAudio, { capture: true, passive: true });
document.addEventListener("gesturestart", (ev) => ev.preventDefault());
document.addEventListener("dblclick", (ev) => ev.preventDefault(), { passive: false });
document.addEventListener(
  "touchmove",
  (ev) => {
    let target = ev.target;
    if (!(target && target.closest && target.closest(".scroll, .cards, .center-col, textarea, input, .log"))) {
      ev.preventDefault();
    }
  },
  { passive: false },
);

/* v1.6.0 merged polish: save backup + tutorial replay (the run metrics are in GameUI.renderRunExtra) */
(function () {
  const makeBackup = function () {
    return store.text(2);
  };
  const exportSave = async function () {
    const value = makeBackup();
    const result = await ui.dialog({
      title: "Export save",
      body: '<p>Copy this text and keep it somewhere safe. It contains your Riftline progress and settings.</p><textarea id="saveExport" class="log" spellcheck="false" readonly></textarea>',
      buttons: [
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
  };
  const importSave = async function () {
    const result = await ui.dialog({
      title: "Import save",
      body: '<p>Paste a Riftline save export below. Importing replaces the current progress on this device.</p><textarea id="saveImport" class="log" spellcheck="false" placeholder="Paste save JSON here"></textarea>',
      buttons: [
        { label: "Cancel", value: null, cls: "ghost" },
        { label: "Restore", value: "restore", cls: "primary" },
      ],
      read: function () {
        return getById("saveImport").value;
      },
    });
    if (!result || result.value !== "restore") return;
    const parsed = store.parse(result.text);
    if (!parsed.ok) {
      ui.alert("Invalid save", "That text is not a valid Riftline save export.");
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
    game.world = null;
    game.mode = "menu";
    game.paused = false;
    ui.hideOver();
    ui.hideChoose();
    ui.hidePause();
    ui.showHud(false);
    ui.homeInit = false;
    ui.show("home");
    sound.setMusic("menu");
    setWakeLock(false);
    ui.toast("Save restored", "gold", 2400);
  };
  const backupBtn = getById("backupBtn");
  const shareBtn = getById("shareBtn");
  const restoreBtn = getById("restoreBtn");
  const replayTutBtn = getById("replayTutBtn");
  if (backupBtn) {
    backupBtn.addEventListener("click", exportSave);
  }
  if (shareBtn && !navigator.share) shareBtn.hidden = true;
  if (shareBtn) {
    shareBtn.addEventListener("click", async function () {
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
    restoreBtn.addEventListener("click", importSave);
  }
  if (replayTutBtn) {
    replayTutBtn.addEventListener("click", async function () {
      const ok = await ui.confirm(
        "Replay tutorial?",
        "The onboarding will show again on your next fresh run. Your current run and progress stay untouched.",
        "Enable",
      );
      if (!ok) return;
      store.data.seen.tutorial = false;
      store.save("tutorial-replay");
      ui.toast("Tutorial queued for your next fresh run", "good", 2800);
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
  // the next screen, a settings toggle or a workshop "buy". Drop that one click
  // in the capture phase, before any handler (guarded or plain) can see it.
  document.addEventListener(
    "click",
    (ev) => {
      const guard = RL_TOUCH_CLICK_GUARD;
      if (!guard.until) return;
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
 - the build in the pause menu explains each upgrade on tap or click
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

  ui.click(getById("banishBtn"), () => {
    ui.banishMode = !ui.banishMode;
    ui.renderCards(game.world);
  });

  // ---- the button layout editor
  ui.click(getById("hudEditBtn"), () => hudEditor.open());

  // ---- what each upgrade of the build does (pause menu)
  const info = getById("pauseUpInfo"),
    upInfo = (id, lv) => {
      const upgrade = upgradesById[id];
      if (!upgrade) return "";
      const tag = upgrade.evo ? "EVOLUTION" : upgrade.repeat ? `\xD7${lv}` : `LV ${lv}/${upgrade.max}`;
      return `<b>${escapeHtml(upgrade.name)}</b> <span class="lv">${tag}</span><p>${escapeHtml(upgrade.desc(Math.max(0, lv - 1)))}</p>`;
    };
  getById("pauseBuild").addEventListener("click", (ev) => {
    const button = ev.target.closest && ev.target.closest("[data-up]"),
      world = game.world;
    if (!button || !world) return;
    for (const el of getById("pauseBuild").querySelectorAll("[data-up]")) el.classList.toggle("sel", el === button);
    info.innerHTML = upInfo(button.dataset.up, world.up[button.dataset.up] || 0);
  });
})();
applySettings();
ui.show("home");
setTimeout(rlRetireToast, 700);
// 3.37.0: the startup health checks were meant for test sessions (a player offline got a WARN for a fetch that
// tells them nothing). 3.45.2, the honest note: window.__riftTest exists for everyone since the test-interface
// refactor, so these run for every boot. They are quiet when green and they catch real breakage (the missing
// log button of 3.45.0 showed up here), so they stay for all.
setTimeout(() => {
  if (window.__riftTest) rlRunHealth({ context: "startup" }).catch((err) => logError("health", err));
}, 900);
if (renderer) {
  startLoop();
} else {
  elementById("playBtn").disabled = true;
  elementById("continueBtn").disabled = true;
  elementById("playBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  elementById("continueBtn").title = "3D graphics unavailable — enable hardware acceleration and reload to play.";
  ui.toast(
    "3D graphics unavailable. The menu remains usable; enable hardware acceleration and reload to play.",
    "warn",
    9000,
  );
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
    if (ui.screen === "home") ui.show("home");
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
window.__riftTest = { game, ui, store, renderer, World, biomeList, health: rlRunHealth };

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
