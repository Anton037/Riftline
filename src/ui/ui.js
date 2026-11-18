// DOM UI (GameUI): screens, HUD, dialogs, workshop, records and settings, plus DOM helpers and icons.

import { RL_RT, logError } from "../core/diagnostics.js";
import { enemyDefs, bossDefs, bossByBiome } from "../data/enemies.js";
import { biomeList, biomesById } from "../data/biomes.js";
import { store } from "../main.js";
import { clamp, GAME_VERSION, formatCount, rlAgo, formatTime } from "../core/util.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { MEDAL_NAMES } from "../core/medals.js";
import { waveEvents } from "../core/waves.js";
import { milestones, workshopModules, threatLevels } from "../data/progression.js";
import { upgradeList, rarityNames, upgradesById } from "../data/upgrades.js";
import { computeStats, weaponRange, buildStatRows } from "../core/stats.js";
import { RL_INPUT, setTouchInput } from "./input.js";
import { hapticMode, rumble } from "./haptics.js";
import { WHATS_NEW } from "../data/whatsnew.js";
import { MUTATORS } from "../core/mutators.js";
import { markHomeViewDirty } from "../render/renderer.js";

const RL_TOUCH_CLICK_GUARD = { until: 0, x: 0, y: 0, key: "" };
function rlUiClickKey(el) {
  if (!el) return "";
  if (el.id) return "id:" + el.id;
  const data = el.dataset || {};
  return data.buy
    ? "buy:" + data.buy
    : data.claim
      ? "claim:" + data.claim
      : data.go
        ? "go:" + data.go
        : el.hasAttribute && el.hasAttribute("data-back")
          ? "back"
          : "";
}
function rlRenderHistory() {
  const el = document.getElementById("runHist");
  if (!el) return;
  const history = store.data.history || [];
  if (!history.length) {
    el.innerHTML = '<p class="note">No runs yet — your last 12 runs appear here.</p>';
    return;
  }
  const killerName = (id) =>
    id === "lava"
      ? "a lava vent"
      : id === "shock"
        ? "a charged inlay"
        : id === "acid"
          ? "acid"
          : id === "devil"
            ? "a dust devil"
            : id === "trap"
              ? "a trap"
              : enemyDefs[id]
                ? "a " + enemyDefs[id].name
                : bossDefs[id]
                  ? bossDefs[id].name
                  : "";
  el.innerHTML = history
    .map((run) => {
      const icon = run.outcome === "win" ? "trophy" : run.outcome === "quit" ? "close" : "skull",
        killer = run.outcome === "dead" ? killerName(run.killer) : "";
      const meta = [
        threatLevels[run.threat].name,
        formatTime(run.time),
        formatCount(run.kills) + " kills",
        "+" + formatCount(run.shards) + " shards",
        killer && "by " + killer,
        run.outcome === "quit" && "abandoned",
      ]
        .filter(Boolean)
        .join(" · ");
      const build = run.build.map((id) => upgradesById[id].name).join(" · ");
      return `<div class="row panel hist ${run.outcome}"><div class="rico">${iconSvg(icon)}</div><div><b>${run.outcome === "win" ? "Rift sealed" : "Wave " + run.wave}${run.endless ? " · Endless" : ""} · ${escapeHtml(weaponDefs[run.weapon].name)}</b><small>${escapeHtml(meta)}</small>${build ? `<small class="hist-build">${escapeHtml(build)}</small>` : ""}</div><span class="chip">${rlAgo(run.t)}</span></div>`;
    })
    .join("");
}
function rlBiomeTitle(biome) {
  return biome.tag ? `${biome.name} \xB7 ${biome.tag}` : biome.name;
}
const iconPaths = {
  gear: '<path d="m12 2 4 3 5 2v10l-5 2-4 3-4-3-5-2V7l5-2zM8 12l4-4 4 4-4 4z"/>',
  pause: '<path d="M6 5h3v14H6zM15 5h3v14h-3z"/>',
  play: '<path d="M7 5l13 7-13 7zM4 6v12"/>',
  back: '<path d="m14 5-7 7 7 7m-7-7h12"/>',
  close: '<path d="m12 2 10 10-10 10L2 12zm-4 6 8 8m0-8-8 8"/>',
  shard: '<path d="m12 2 6 9-6 11-6-11zm0 0v20m-6-11h12"/>',
  lock: '<path d="M5 11l7-2 7 2v8l-7 3-7-3zm3-1V7a4 4 0 018 0v3m-4 4v3"/>',
  dash: '<path d="m3 8 6 4-6 4m6-9 7 5-7 5m7-10 5 5-5 5"/>',
  star: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  burst: '<path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3m-7 0 4 4-4 4-4-4z"/>',
  rate: '<path d="M4 19V9h3v10zm6 0V6h3v13zm6 0V3h3v16z"/>',
  shield: '<path d="M4 5l8-3 8 3v7c0 5-4 8-8 10-4-2-8-5-8-10zm8 2 3 4-3 5-3-5z"/>',
  wing: '<path d="m2 14 9-9 11 4-6 2-2 6-5-3-4 5zm9-9-2 9"/>',
  arrow: '<path d="M2 12h17m-5-5 6 5-6 5m-9-5 3-3 3 3-3 3z"/>',
  magnet: '<path d="M4 4h5v8a3 3 0 006 0V4h5v8a8 8 0 01-16 0zm0 4h5m6 0h5"/>',
  crosshair: '<path d="M12 2v5m0 10v5M2 12h5m10 0h5m-10-7 7 7-7 7-7-7z"/><circle cx="12" cy="12" r="2"/>',
  heart: '<path d="M12 21 4 13a5 5 0 018-6 5 5 0 018 6zM6 12h4l2-3 2 5 2-2h2"/>',
  fan: '<path d="m12 21-9-12 2-4 4 2 3-4 3 4 4-2 2 4zm0 0L9 7m3 14 3-14"/>',
  pierce: '<path d="m3 12 4-5 4 5-4 5zm9 0h9m-4-4 4 4-4 4"/>',
  bounce: '<path d="m3 18 5-11 7 10 6-11m-6 1 6-1 1 6"/>',
  orbit:
    '<path d="m12 8 3 4-3 4-3-4z"/><ellipse cx="12" cy="12" rx="9.7" ry="5.2" transform="rotate(-32 12 12)"/><circle cx="20" cy="7" r="1.4" fill="currentColor"/>',
  snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7m-9 0 4 5-4 5-4-5z"/>',
  bolt: '<path d="M13 2 5 13h6l-1 9 9-12h-7z"/>',
  flame: '<path d="M12 22c-4 0-7-3-7-7 0-4 4-5 3-10l4 5 3-7c2 5 4 7 4 12 0 4-3 7-7 7zm0-2-3-4 3-4 3 4z"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zm6-2v15m6-12v15"/><circle cx="12" cy="12" r="1"/>',
  drone: '<path d="m12 6 5 6-5 6-5-6zm-9 3 4 3-4 3m18-6-4 3 4 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 5v7l4 2m-4 5v2m-9-9h2m14 0h2"/>',
  reroll: '<path d="M21 10a9 9 0 00-15-5m-1-3v4h5m-7 8a9 9 0 0015 5m1 3v-4h-5"/>',
  eye: '<path d="m2 12 5-5 5-2 5 2 5 5-5 5-5 2-5-2zm10-4 3 4-3 4-3-4z"/>',
  trophy: '<path d="m12 2 4 4-4 4-4-4zm-8 4c0 5 2 8 8 9 6-1 8-4 8-9m-8 9v4m-5 2h10m-8-2h6"/>',
  wrench: '<path d="m4 20-1-3 7-7 1-5 4-3 5 2-4 4 2 2 4-4-1 6-5 2-6-1-6 7z"/>',
  check: '<path d="m3 12 6 6L21 6m-7 7 5 5"/>',
  save: '<path d="M4 17v4h16v-4M12 3v12m-4-4 4 4 4-4M5 3h3m8 0h3"/>',
  load: '<path d="M4 17v4h16v-4M12 16V3m-4 4 4-4 4 4"/>',
  calendar: '<path d="M4 6h16v15H4zm0 4h16M8 3v5m8-5v5m-7 7h2m2 0h2m-6 3h2m2 0h2"/>',
  info: '<path d="m12 2 10 10-10 10L2 12zm0 10v5m0-10v1"/>',
  skull:
    '<path d="m12 3 7 4 2 6-5 4v4H8v-4l-5-4 2-6zm-2 14v4m4-4v4"/><circle cx="8.5" cy="11" r="1.2"/><circle cx="15.5" cy="11" r="1.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><path d="m12 6 6 6-6 6-6-6z"/><circle cx="12" cy="12" r="1.2"/>',
  lockdown: '<path d="M4 3v18M20 3v18M4 7h16m-16 10h16m-8-7 2 2-2 2-2-2z"/>',
  brood: '<path d="m12 4 5 6 1 6-6 5-6-5 1-6zm-5 6-4-3m14 3 4-3M7 16l-4 2m14-2 4 2"/>',
  collapse: '<path d="m12 2 10 10-10 10L2 12zm0 5 5 5-5 5-5-5z"/>',
  tribute: '<path d="m12 3 5 7-5 8-5-8zM4 15l3 5h10l3-5"/>',
};
function iconSvg(name, cls = "") {
  let paths = iconPaths[name] || iconPaths.info;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const getById = (id) => document.getElementById(id),
  menuScreens = ["home", "workshop", "records", "news", "settings"],
  formatTenths = (value) => (Math.round(value * 10 + 1e-6) / 10).toString(),
  formatPercent = (value) => Math.round(value * 100) + "%",
  formatCooldown = (value) => (value > 0 ? formatTenths(value) + " s" : "off"),
  statRows = [
    ["Damage", (stats) => (stats.weapon.dmg + (stats.weapon.explodeDmg || 0)) * stats.dmgMul, formatTenths],
    ["Fire rate", (stats) => stats.weapon.rate * stats.rateMul, (value) => formatTenths(value) + "/s"],
    ["Projectiles", (stats) => stats.weapon.count + (stats.weapon.cone ? stats.extra * 2 : stats.extra), String],
    ["Pierce", (stats) => (stats.pierce > 99 ? 0 : stats.pierce), String],
    ["Bounces", (stats) => stats.bounce, String],
    ["Crit", (stats) => stats.crit, formatPercent],
    ["Max HP", (stats) => stats.maxHp, String],
    ["Speed", (stats) => stats.speed, (value) => formatTenths(value) + " m/s"],
    ["Range", (stats) => stats.range, (value) => Math.round(value) + " m"],
    ["Pickup radius", (stats) => stats.magnet, (value) => formatTenths(value) + " m"],
    ["Dash cooldown", (stats) => stats.dashCd, formatCooldown],
    ["Aegis every", (stats) => stats.shieldCd, formatCooldown],
    ["Regen", (stats) => stats.regen, (value) => formatTenths(value) + " HP/s"],
    ["Blades", (stats) => stats.orbit, String],
    ["Blade damage", (stats) => (stats.orbit ? stats.orbitDmg * stats.dmgMul : 0), formatTenths],
    ["Slow chance", (stats) => stats.cryo, formatPercent],
    ["Chain chance", (stats) => stats.arc, formatPercent],
    ["Bolt jumps", (stats) => stats.chain, String],
    [
      "Flame burn",
      (stats) => (stats.burn ? stats.burn * stats.burnMul * stats.dmgMul : 0),
      (value) => formatTenths(value) + "/s",
    ],
    ["Chain jumps", (stats) => (stats.arc ? stats.arcJumps : 0), String],
    ["Blast", (stats) => stats.payloadF, formatPercent],
    ["Singularities", (stats) => stats.gadgetMax, String], // 3.0.0, 3.12.0: the Singularity
    ["Singularity recharge", (stats) => stats.gadgetCd, formatCooldown],
    ["Collapse damage", (stats) => stats.gadgetDmg, (value) => "\u00d7" + formatTenths(value)],
    ["Burn", (stats) => stats.thermite, formatPercent],
    ["Repair chance", (stats) => stats.siphonCh, formatPercent],
    ["Nova radius", (stats) => stats.novaR, (value) => formatTenths(value) + " m"],
    ["Nova charge", (stats) => stats.novaMul, (value) => "\u00d7" + formatTenths(value)],
    ["Drones", (stats) => stats.wingmen, String],
    ["Bloodrush cap", (stats) => (stats.bloodrush ? 0.4 : 0), formatPercent], // 2.6.0
  ],
  hitSourceName = (src) =>
    enemyDefs[src]?.name ||
    bossDefs[src]?.name ||
    { lava: "Lava vent", shock: "Charged inlay", acid: "Acid pool", trap: "Arena trap", devil: "Dust devil" }[src],
  damageSources = {
    arc: ["Arc Relay", "#c0a6db"],
    burn: ["Burning", "#ff8a2a"],
    payload: ["Payload", "#ffa13d"],
    orbit: ["Orbital Blades", "#b8dace"],
    wingman: ["Wingman", "#91c9b4"],
    dash: ["Shock Dash", "#a7d1bf"],
    trail: ["Phantom trail", "#a7d1bf"],
    nova: ["Nova", "#a7d1bf"],
    pop: ["Bomber blasts", "#e9bf89"],
    lava: ["Lava", "#ff6a2a"],
    shock: ["Charged inlays", "#e5b878"],
    inferno: ["Inferno", "#ff5a3a"],
    overload: ["Overload", "#ffd27a"],
    reactive: ["Reactive Plating", "#b8dace"],
    surge: ["Combo Surge", "#e9bf89"],
    grenade: ["Singularity", "#b57bff"], // 3.12.0: the old id of the gadget, kept for saved run records
    trap: ["Arena traps", "#aeb9cf"], // 3.0.0: enemies caught by a trap
    // 3.15.0: the boss cards
    lockdown: ["Lockdown Grid", "#f08e70"],
    shard: ["Shard Field", "#bacfd9"],
    fang: ["Glasswyrm Fang", "#ffd98a"],
    brood: ["Brood", "#c1d291"],
    other: ["Other", "#93a2bf"],
  },
  escapeHtml = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    ),
  GameUI = class {
    constructor(game) {
      this.g = game;
      this.screen = "home";
      this.stack = [];
      this.viewWeapon = 0;
      this.viewThreat = 0;
      this.hudCache = {};
      // 3.46.0: the buff row and its step bars are cached per frame (see buffs)
      this.buffRow = null;
      this.buffBars = new Map();
      this.buffTimed = new Map();
      this.dlgResolve = null;
      this.fillIcons(document);
      getById("pauseBtn").innerHTML = iconSvg("pause");
      this.bind();
    }
    fillIcons(root) {
      for (let el of root.querySelectorAll("[data-icon]")) {
        if (!el.dataset.filled) {
          el.dataset.filled = "1";
          el.insertAdjacentHTML("afterbegin", iconSvg(el.dataset.icon));
        }
      }
    }
    get save() {
      return this.g.store.data;
    }
    click(el, action) {
      if (!el) return;
      let touchDown = 0,
        startX = 0,
        startY = 0,
        pointerId = 0,
        activate = () => {
          if (el.disabled || el.hidden) return false;
          this.g.sound.play("click");
          action();
          return true;
        };
      el.addEventListener(
        "pointerdown",
        (ev) => {
          if (ev.pointerType === "mouse") {
            if (ev.button === 0 && ev.isTrusted) setTouchInput(false);
            return;
          }
          // 3.31.0: a second finger may tap a button when no other touch is on it (pause while a thumb holds a stick;
          // browsers send no click for such a tap). A second finger on a button already pressed does not take it over.
          if ((ev.pointerType === "touch" || ev.pointerType === "pen") && (ev.isPrimary !== false || !touchDown)) {
            startX = ev.clientX;
            startY = ev.clientY;
            pointerId = ev.pointerId;
            touchDown = 1;
          }
        },
        { passive: false },
      );
      el.addEventListener(
        "pointerup",
        (ev) => {
          if (!(ev.pointerType === "touch" || ev.pointerType === "pen") || !touchDown || ev.pointerId !== pointerId)
            return;
          let dx = ev.clientX - startX,
            dy = ev.clientY - startY;
          touchDown = 0;
          if (Math.hypot(dx, dy) > 14 || !activate()) return;
          if (ev.isTrusted) setTouchInput(true);
          ev.preventDefault();
          ev.stopPropagation();
          const now = performance.now();
          RL_TOUCH_CLICK_GUARD.until = now + 800;
          RL_TOUCH_CLICK_GUARD.x = ev.clientX;
          RL_TOUCH_CLICK_GUARD.y = ev.clientY;
          RL_TOUCH_CLICK_GUARD.key = rlUiClickKey(el);
        },
        { passive: false },
      );
      el.addEventListener(
        "pointercancel",
        (ev) => {
          if (ev.pointerId === pointerId) {
            touchDown = 0;
          }
        },
        { passive: true },
      );
      el.addEventListener("click", (ev) => {
        const now = performance.now(),
          guard = RL_TOUCH_CLICK_GUARD,
          dx = Number(ev.clientX) - guard.x,
          dy = Number(ev.clientY) - guard.y,
          near = Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) <= 36,
          key = rlUiClickKey(el),
          same = !!(guard.key && key && guard.key === key) || near;
        if (now < guard.until && same) {
          guard.until = 0;
          guard.key = "";
          RL_RT.uiGuardDrops++;
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        guard.until = 0;
        guard.key = "";
        activate();
      });
    }
    bind() {
      for (let el of document.querySelectorAll("[data-go]")) this.click(el, () => this.show(el.dataset.go));
      for (let el of document.querySelectorAll("[data-back]")) this.click(el, () => this.back());
      this.click(getById("wPrev"), () => this.stepWeapon(-1));
      this.click(getById("wNext"), () => this.stepWeapon(1));
      this.click(getById("tPrev"), () => this.stepThreat(-1));
      this.click(getById("tNext"), () => this.stepThreat(1));
      this.click(getById("wBuy"), () => this.buyWeapon());
      this.click(getById("playBtn"), () => this.play());
      this.click(getById("continueBtn"), () => this.g.startRun({ resume: true }));
      let onPress = (el, action) =>
        el.addEventListener("pointerdown", (ev) => {
          if (ev.pointerType === "mouse" && ev.button !== 0) return;
          if (ev.isTrusted) setTouchInput(ev.pointerType !== "mouse");
          ev.preventDefault();
          ev.stopPropagation();
          el.blur?.();
          action();
        });
      onPress(getById("dashBtn"), () => {
        this.g.input.press("dash");
        let world = this.g.world,
          btn = getById("dashBtn");
        if (world && world.player.dashCdT > 0.08) {
          btn.classList.remove("deny");
          btn.offsetWidth;
          btn.classList.add("deny");
          this.g.sound.play("deny");
        }
      });
      onPress(getById("novaBtn"), () => {
        this.g.input.press("nova");
        let world = this.g.world,
          btn = getById("novaBtn");
        if (world && world.player.nova < 100) {
          btn.classList.remove("deny");
          btn.offsetWidth;
          btn.classList.add("deny");
          this.g.sound.play("deny");
        }
      });
      onPress(getById("gadgetBtn"), () => {
        // the deny flash comes from the simulation's gadgetDeny event (no charge, or outside a fight)
        this.g.input.press("gadget");
      });
      this.click(getById("pauseBtn"), () => {
        getById("pauseBtn").blur?.();
        this.g.pause();
      });
      this.click(getById("resumeBtn"), () => this.g.resume());
      this.click(getById("abandonBtn"), async () => {
        if (
          await this.confirm("Abandon run?", "You keep the shards collected so far, but the run ends here.", "Abandon")
        ) {
          this.g.abandon();
        }
      });
      this.click(getById("rerollBtn"), () => this.g.reroll());
      this.click(getById("restartBtn"), async () => {
        if (
          await this.confirm(
            "Restart run?",
            "Shards collected so far are kept. A fresh run starts with the same weapon and threat.",
            "Restart",
          )
        ) {
          this.g.restart();
        }
      });
      this.click(getById("retryBtn"), () => this.g.retry());
      this.click(getById("homeBtn"), () => this.g.goHome());
      this.click(getById("endlessBtn"), () => this.g.endless());
      this.click(getById("crashHome"), () => this.g.recover());
      this.click(getById("crashCopy"), () => this.copy(getById("crashLog").value));
      let settings = () => this.save.settings,
        bindToggle = (id, key) => {
          let input = getById(id);
          input.addEventListener("change", () => {
            settings()[key] = input.checked;
            this.g.settingsChanged();
          });
        };
      bindToggle("setAuto", "autoFire");
      bindToggle("setAssist", "assist");
      bindToggle("setVibration", "vibration");
      // 3.45.4: feel what the setting does, wherever this device can buzz at all
      this.click(getById("setVibTest"), () => {
        this.toast(rumble("slam", true) ? "Buzz sent" : "Nothing here to buzz with");
      });
      bindToggle("setNumbers", "numbers");
      for (let [id, key] of [
        ["setSfx", "sfx"],
        ["setMusic", "music"],
        ["setAmb", "ambience"],
      ]) {
        let input = getById(id);
        input.addEventListener("input", () => {
          settings()[key] = +input.value;
          this.g.settingsChanged(true);
          // 3.48.0: hear the bus you are turning, at the level you just set (a shot of the weapon in
          // hand for effects, the arrival braam of the place for music, one far voice for the ambience)
          this.g.sound.previewBus(key, this.save.weapon);
        });
        input.addEventListener("change", () => {
          this.g.settingsChanged();
        });
      }
      for (let btn of getById("setFrameRate").querySelectorAll("button"))
        this.click(btn, () => {
          settings().frameRate = +btn.dataset.v;
          this.renderSettings();
          this.g.settingsChanged();
        });
      this.click(getById("resetBtn"), async () => {
        if (
          (await this.confirm(
            "Reset all progress?",
            "Shards, workshop, weapons, records and milestones are wiped. Settings stay.",
            "Continue",
          )) &&
          (await this.confirm("Really reset?", "This cannot be undone.", "Reset everything", true))
        ) {
          this.g.resetProgress();
        }
      });
      // 3.48.0: the stock settings come back in one tap (progress is not touched)
      this.click(getById("defaultsBtn"), async () => {
        if (
          await this.confirm(
            "Restore default settings?",
            "Audio, video, controls and the HUD layout go back to stock. Your progress stays as it is.",
            "Restore",
          )
        ) {
          this.g.resetSettings();
        }
      });
      getById("dialog").addEventListener("click", (ev) => {
        if (ev.target === getById("dialog")) {
          this.closeDialog(null);
        }
      });
    }
    show(screen) {
      if (menuScreens.includes(this.screen) && this.screen !== screen) {
        this.stack.push(this.screen);
      }
      this._show(screen);
    }
    _show(screen) {
      // 2.3.6: the renderer re-measures the free space of the home screen for the drone preview
      markHomeViewDirty();
      for (let id of menuScreens) getById(id).hidden = id !== screen;
      this.screen = screen;
      if (screen === "home") {
        this.stack = [];
        this.renderHome();
      }
      if (screen === "workshop") {
        this.renderWorkshop();
      }
      if (screen === "records") {
        this.renderRecords();
      }
      if (screen === "news") {
        this.renderNews();
      }
      if (screen === "settings") {
        this.renderSettings();
      }
    }
    back() {
      // 2.4.2: from settings opened in the pause menu back to the pause menu
      if (this.rlFromPause) {
        closePauseSettings(this);
        getById("pause").hidden = false;
        this.screen = "pause";
        return;
      }
      this._show(this.stack.pop() || "home");
    }
    hideMenus() {
      for (let id of menuScreens) getById(id).hidden = true;
      this.screen = "game";
    }
    renderHome() {
      let save = this.save;
      getById("bank").textContent = formatCount(save.shards);
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      if (this.viewWeapon == null || !weaponOrder[this.viewWeapon]) {
        this.viewWeapon = 0;
      }
      if (!this.homeInit) {
        this.viewWeapon = weaponOrder.indexOf(save.weapon);
        this.viewThreat = save.threat;
        this.homeInit = true;
      }
      this.renderWeapon();
      this.renderThreat();
      let run = save.run,
        btn = getById("continueBtn");
      if (run) {
        btn.hidden = false;
        btn.innerHTML = `${iconSvg("play")}CONTINUE \xB7 WAVE ${run.wave + (run.offer ? 1 : 0)} \xB7 ${escapeHtml(weaponDefs[run.weapon].name)}`;
        getById("playBtn").classList.remove("primary");
      } else {
        btn.hidden = true;
        getById("playBtn").classList.add("primary");
      }
      const checkpoint = getById("continueNote");
      checkpoint.hidden = !run;
      checkpoint.textContent = run?.offer
        ? "Continue at your saved card choice."
        : "Continue restarts the saved wave from its beginning.";
      this.updatePlayState();
      getById("recBadge").hidden = !this.g.claimable().length;
      getById("newsBadge").hidden = !!save.seen["news_" + GAME_VERSION];
      // 3.26.0: a dot on the Rifts page until today's Rift has been played (3.58.0: and this week's)
      let stats = save.stats;
      getById("bestLine").hidden = !stats.runs;
      if (stats.runs) {
        getById("bestLine").textContent =
          `Best wave ${stats.bestWave}` +
          (stats.clears ? ` \xB7 ${stats.clears} clear${stats.clears > 1 ? "s" : ""}` : "");
      }
      markHomeViewDirty();
    }
    renderWeapon() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        weapon = weaponDefs[id],
        owned = !!save.weapons[id],
        card = document.querySelector(".weapon-card");
      card.classList.toggle("locked", !owned);
      card.style.setProperty("--wc", "#" + weapon.color.toString(16).padStart(6, "0"));
      getById("wIndex").textContent = `${this.viewWeapon + 1}/${weaponOrder.length}`;
      getById("wName").innerHTML = (owned ? "" : iconSvg("lock", "inline")) + escapeHtml(weapon.name);
      if (getById("wName").querySelector(".ico")) {
        getById("wName").querySelector(".ico").style.cssText =
          "display:inline-block;vertical-align:-3px;margin-right:6px;width:18px;height:18px";
      }
      getById("wBlurb").textContent = weapon.blurb;
      let burst = weapon.dmg * weapon.count + (weapon.explodeDmg || 0),
        range = weaponRange(weapon),
        segs = (value) => {
          let lit = clamp(Math.round(value), 1, 8);
          return (
            '<div class="segs">' +
            Array.from({ length: 8 }, (_, i) => `<i class="${i < lit ? "on" : ""}"></i>`).join("") +
            "</div>"
          );
        },
        dmgText =
          weapon.count > 1
            ? `${weapon.dmg}\xD7${weapon.count}`
            : weapon.explodeDmg
              ? `${weapon.dmg}+${weapon.explodeDmg}`
              : String(weapon.dmg);
      getById("wStats").innerHTML = `
    <div class="stat"><span class="k">DAMAGE</span><span class="v">${dmgText}</span>${segs((burst / 55) * 8)}</div>
    <div class="stat"><span class="k">RATE</span><span class="v">${weapon.rate.toFixed(1)}/s</span>${segs((weapon.rate / 6.5) * 8)}</div>
    <div class="stat"><span class="k">RANGE</span><span class="v">${Math.round(range)} m</span>${segs((range / 28) * 8)}</div>`;
      let buyBtn = getById("wBuy");
      buyBtn.hidden = owned;
      if (!owned) {
        buyBtn.innerHTML = `UNLOCK \xB7 <span class="shard-ico"></span>${weapon.cost}`;
        buyBtn.disabled = save.shards < weapon.cost;
      }
      getById("wPrev").disabled = this.viewWeapon <= 0;
      getById("wNext").disabled = this.viewWeapon >= weaponOrder.length - 1;
      this.updatePlayState();
      this.g.previewWeapon(owned ? id : save.weapon);
      markHomeViewDirty();
    }
    renderThreat() {
      let save = this.save,
        threat = threatLevels[this.viewThreat],
        locked = this.viewThreat > save.threatMax;
      getById("tName").textContent = threat.name;
      getById("tName").classList.toggle("hot", this.viewThreat > 0);
      getById("tDesc").textContent = locked
        ? `Clear all ${20} waves on ${threatLevels[this.viewThreat - 1].name} to unlock`
        : this.viewThreat > 0
          ? `${threat.desc} Shards \xD7${(1 + 0.25 * this.viewThreat).toFixed(2)}`
          : threat.desc;
      getById("tPrev").disabled = this.viewThreat <= 0;
      getById("tNext").disabled = this.viewThreat >= Math.min(5, save.threatMax + 1);
      this.updatePlayState();
    }
    updatePlayState() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        playable = !!save.weapons[id] && this.viewThreat <= save.threatMax,
        btn = getById("playBtn");
      btn.disabled = !playable;
      btn.textContent = playable
        ? save.run
          ? "NEW RUN"
          : "START RUN"
        : save.weapons[id]
          ? "THREAT LOCKED"
          : "WEAPON LOCKED";
    }
    stepWeapon(dir) {
      this.viewWeapon = clamp(this.viewWeapon + dir, 0, weaponOrder.length - 1);
      let id = weaponOrder[this.viewWeapon];
      if (this.save.weapons[id]) {
        this.save.weapon = id;
        this.g.store.save("weapon");
      }
      this.renderWeapon();
    }
    stepThreat(dir) {
      this.viewThreat = clamp(this.viewThreat + dir, 0, Math.min(5, this.save.threatMax + 1));
      if (this.viewThreat <= this.save.threatMax) {
        this.save.threat = this.viewThreat;
        this.g.store.save("threat");
      }
      this.renderThreat();
    }
    buyWeapon() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        weapon = weaponDefs[id];
      if (save.weapons[id] || save.shards < weapon.cost) {
        this.g.sound.play("deny");
        return;
      }
      save.shards -= weapon.cost;
      save.weapons[id] = true;
      save.weapon = id;
      this.g.store.save("buy");
      this.g.sound.play("buy");
      this.toast(`${weapon.name} unlocked`, "gold");
      this.renderHome();
    }
    async play() {
      let save = this.save;
      if (!(
        save.run &&
        !(await this.confirm(
          "Start a new run?",
          `Your run at wave ${save.run.wave} ends here. You keep the shards collected in it.`,
          "New run",
        ))
      )) {
        if (save.run) {
          this.g.discardRun();
        }
        this.g.startRun({});
      }
    }
    renderWorkshop() {
      let save = this.save;
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      let list = getById("wsList");
      list.innerHTML = workshopModules
        .map((mod) => {
          let level = save.workshop[mod.id] || 0,
            maxLevel = mod.costs.length,
            cost = mod.costs[level],
            pips = Array.from({ length: maxLevel }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join(""),
            btn =
              level >= maxLevel
                ? '<button class="btn" disabled>MAX</button>'
                : `<button class="btn" data-buy="${mod.id}" ${save.shards < cost ? "disabled" : ""}><span class="shard-ico"></span>${cost}</button>`;
          return `<div class="row panel"><div class="rico">${iconSvg(mod.icon)}</div><div><b>${escapeHtml(mod.name)}</b><small>${escapeHtml(mod.desc)}</small><div class="pips">${pips}</div></div>${btn}</div>`;
        })
        .join("");
      for (let btn of list.querySelectorAll("[data-buy]")) this.click(btn, () => this.buyModule(btn.dataset.buy));
    }

    buyModule(id) {
      let save = this.save,
        mod = workshopModules.find((mod) => mod.id === id),
        level = save.workshop[id] || 0,
        cost = mod.costs[level];
      if (cost == null || save.shards < cost) {
        this.g.sound.play("deny");
        return;
      }
      save.shards -= cost;
      save.workshop[id] = level + 1;
      this.g.store.save("workshop");
      this.g.sound.play("buy");
      this.renderWorkshop();
    }
    renderRecords() {
      let save = this.save,
        stats = save.stats;
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      let bossKills = Object.values(stats.bosses).reduce((sum, count) => sum + count, 0),
        cells = [
          ["Runs", stats.runs],
          ["Best wave", stats.bestWave || "\u2014"],
          ["Full clears", stats.clears],
          ["Enemies destroyed", formatCount(stats.kills)],
          ["Bosses defeated", bossKills],
          ["Best threat cleared", stats.bestClearThreat >= 0 ? threatLevels[stats.bestClearThreat].name : "\u2014"],
          ["Time in the rift", formatTime(stats.playTime)],
          ["Fastest clear", stats.bestTime > 0 ? formatTime(stats.bestTime) : "—"],
          ["Shards earned", formatCount(stats.shardsEarned)],
        ];
      getById("statGrid").innerHTML = cells
        .map(
          ([label, value]) =>
            `<div class="cell"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`,
        )
        .join("");
      let list = getById("msList");
      list.innerHTML = milestones
        .map((ms) => {
          let done = !!save.milestones[ms.id],
            ready = !done && ms.test(save),
            action = done
              ? `<span class="chip">${iconSvg("check")}DONE</span>`
              : ready
                ? `<button class="btn" data-claim="${ms.id}"><span class="shard-ico"></span>${ms.reward}</button>`
                : `<span class="chip"><span class="shard-ico"></span>${ms.reward}</span>`;
          return `<div class="row panel ${done ? "done" : ready ? "claim" : ""}"><div class="rico">${iconSvg(done ? "check" : "trophy")}</div><div><b>${escapeHtml(ms.name)}</b><small>${escapeHtml(ms.desc)}</small></div>${action}</div>`;
        })
        .join("");
      for (let btn of list.querySelectorAll("[data-claim]")) this.click(btn, () => this.claim(btn.dataset.claim));
      // recent runs list under the lifetime stats
      try {
        rlRenderHistory();
      } catch (err) {
        logError("history", err);
      }
    }
    claim(id) {
      let save = this.save,
        ms = milestones.find((milestone) => milestone.id === id);
      if (!(!ms || save.milestones[id] || !ms.test(save))) {
        save.milestones[id] = true;
        save.shards += ms.reward;
        this.g.store.save("claim");
        this.g.sound.play("buy");
        this.toast(`${ms.name}: +${ms.reward} shards`, "gold");
        this.renderRecords();
      }
    }
    // the What's new tab: opening it marks this version's notes as read (the badge on the home screen goes away)

    renderNews() {
      getById("newsList").innerHTML = WHATS_NEW.map(
        (entry, i) =>
          `<h3 class="section-h">${escapeHtml(entry.version)} · ${escapeHtml(entry.title)}${i === 0 ? " · current" : ""}</h3>` +
          `<div class="set-group">${entry.items.map((t) => `<div class="set-row"><span>${escapeHtml(t)}</span></div>`).join("")}</div>`,
      ).join("");
      const key = "news_" + GAME_VERSION;
      if (!this.save.seen[key]) {
        this.save.seen[key] = true;
        this.g.store.save("news");
      }
    }
    renderSettings() {
      let settings = this.save.settings;
      getById("setAuto").checked = settings.autoFire;
      getById("setAssist").checked = settings.assist;
      getById("setVibration").checked = settings.vibration !== false;
      // 3.45.4: the note says what this device actually can do
      getById("vibNote").textContent =
        hapticMode() === "native"
          ? "Buzzes on this phone: hits, dashes, the end of a run."
          : hapticMode() === "tick"
            ? "iPhone: short ticks, on the iOS versions that still allow them."
            : "Vibration is unavailable on this device.";
      getById("setNumbers").checked = settings.numbers;
      getById("setSfx").value = settings.sfx;
      getById("setMusic").value = settings.music;
      getById("setAmb").value = settings.ambience;
      for (let btn of getById("setFrameRate").querySelectorAll("button"))
        btn.classList.toggle("on", +btn.dataset.v === settings.frameRate);
      getById("storageWarn").hidden = this.g.store.storageOk;
      getById("storageWarnText").textContent = this.g.store.held
        ? "the old save is kept unread (storage full): progress is not saved"
        : "storage is blocked in this browser";
      getById("verText").textContent = `v${GAME_VERSION}`;
      const ownLayout =
        !!settings.hudLayout || settings.stickFixed || settings.stickSize !== 1 || settings.hudAlpha !== 1;
      getById("hudLayoutNote").textContent = ownLayout
        ? "Your own layout is on."
        : "Move and resize the buttons and the sticks.";
    }
    async copy(text) {
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch {}
      if (!ok) {
        let area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, text.length);
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        area.remove();
      }
      this.toast(ok ? "Copied" : "Copy failed \u2014 select the text and copy it by hand");
      return ok;
    }
    dialog({ title, body, buttons, onOpen, read }) {
      if (this.dlgResolve) {
        this.closeDialog(null);
      }
      getById("dlgTitle").textContent = title;
      getById("dlgBody").innerHTML = body;
      let row = getById("dlgBtns");
      row.innerHTML = "";
      return new Promise((resolve) => {
        this.dlgResolve = resolve;
        this.dlgRead = read || null;
        for (let spec of buttons) {
          let btn = document.createElement("button");
          btn.className = "btn " + (spec.cls || "");
          btn.textContent = spec.label;
          this.click(btn, () => this.closeDialog(spec.value));
          row.appendChild(btn);
        }
        getById("dialog").hidden = false;
        // 2.8.1: focus moves into the dialog and back to where it was on close. It lands on the main
        // button, or on the first (Cancel) one when the main action is destructive, so Enter is safe
        this.dlgFocusBack = document.activeElement;
        const main = row.querySelector(".primary") || row.firstElementChild;
        if (main) main.focus({ preventScroll: true });
        if (onOpen) {
          onOpen();
        }
      });
    }
    closeDialog(value) {
      let resolve = this.dlgResolve,
        text = this.dlgRead ? this.dlgRead() : undefined;
      this.dlgResolve = null;
      getById("dialog").hidden = true;
      const back = this.dlgFocusBack;
      this.dlgFocusBack = null;
      if (back && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
      if (resolve) {
        resolve(this.dlgRead ? { value, text } : value);
      }
      this.dlgRead = null;
    }
    async confirm(title, text, okLabel, danger) {
      return (
        (await this.dialog({
          title,
          body: `<p>${escapeHtml(text)}</p>`,
          buttons: [
            { label: "Cancel", value: false, cls: "ghost" },
            { label: okLabel, value: true, cls: danger ? "danger" : "primary" },
          ],
        })) === true
      );
    }
    alert(title, text) {
      return this.dialog({
        title,
        body: `<p>${escapeHtml(text)}</p>`,
        buttons: [{ label: "OK", value: true, cls: "primary" }],
      });
    }
    toast(text, cls = "", ms = 2900) {
      let box = getById("toasts"),
        el = document.createElement("div");
      for (
        el.className = "toast " + cls,
          el.style.animationDuration = ms + "ms",
          el.textContent = text,
          box.appendChild(el);
        box.children.length > 3;
      )
        box.firstChild.remove();
      setTimeout(() => el.remove(), ms + 50);
    }
    banner(big, small, cls = "", ms = 2200) {
      let el = getById("banner");
      el.innerHTML = `<div class="bn ${cls}" style="animation-duration:${ms}ms"><div class="small">${escapeHtml(small || "")}</div><div class="big">${escapeHtml(big)}</div></div>`;
      clearTimeout(this.bannerT);
      this.bannerT = setTimeout(() => {
        el.innerHTML = "";
      }, ms + 50);
    }
    comboPop(combo, bonus) {
      // 3.45.0: one slot - a new milestone replaces the last pop instead of stacking
      if (this.comboPopEl) this.comboPopEl.remove();
      let el = document.createElement("div");
      el.className = "combo-pop";
      el.textContent = `\xD7${combo} COMBO  +${bonus}`;
      getById("hud").appendChild(el);
      this.comboPopEl = el;
      setTimeout(() => {
        if (this.comboPopEl === el) this.comboPopEl = null;
        el.remove();
      }, 1250);
    }
    coach(step, steps, text) {
      let box = getById("coach");
      if (step == null) {
        box.hidden = true;
        this.coachKey = null;
        return;
      }
      let key = step + text;
      if (this.coachKey !== key) {
        this.coachKey = key;
        getById("coachDots").innerHTML = Array.from(
          { length: steps },
          (_, i) => `<i class="${i <= step ? "on" : ""}"></i>`,
        ).join("");
        getById("coachText").textContent = text;
        box.hidden = false;
      }
    }
    showHud(on) {
      if (on) document.activeElement?.blur?.();
      getById("hud").hidden = !on;
      getById("hud").style.visibility = "";
      getById("vignette").classList.remove("low");
      getById("touch").hidden = !on;
      if (!on) {
        getById("bossBar").hidden = true;
      }
      this.hudCache = {};
      // 2.5.0 D: the end of a run hides the title cards like the banner
      this.clearTitleCard();
    }
    hud(world) {
      let cache = this.hudCache,
        player = world.player,
        stats = world.stats,
        update = (key, value, apply) => {
          if (cache[key] !== value) {
            cache[key] = value;
            apply(value);
          }
        },
        hp = Math.max(0, Math.ceil(player.hp));
      update("hp", hp + "/" + stats.maxHp, (text) => {
        getById("hpNum").textContent = text;
      });
      let hpFrac = clamp(player.hp / stats.maxHp, 0, 1);
      // 3.45.0: one lag ghost was enough (the boss keeps its) - the hull is bar + number now
      update("hpf", Math.round(hpFrac * 100), () => {
        getById("hpFill").style.transform = `scaleX(${hpFrac})`;
        getById("hpFill").parentElement.classList.toggle("low", hpFrac < 0.3);
      });
      update("shieldOn", stats.shieldCd > 0, (on) => {
        getById("shieldPip").hidden = !on;
      });
      if (stats.shieldCd > 0) {
        update("shield", player.shield ? 100 : Math.round((player.shieldT / stats.shieldCd) * 20) * 5, (pct) => {
          getById("shieldPip").style.setProperty("--p", pct + "%");
          getById("shieldPip").classList.toggle("ready", pct >= 100);
        });
      }
      if (cache.hpVal != null && player.hp > cache.hpVal + 0.5) {
        let bar = getById("hpFill").parentElement;
        bar.classList.remove("heal");
        bar.offsetWidth;
        bar.classList.add("heal");
      }
      cache.hpVal = player.hp;
      this.buffs(world);
      update("low", player.alive && hpFrac < 0.25, (low) => {
        getById("vignette").classList.toggle("low", low);
      });
      // 3.41.0: the Whiteout draws its white edge over the view (CSS fades it with the fog ramp)
      update(
        "whiteout",
        !!(world.arena && world.event === "whiteout" && world.state === "fight" && world.arena.biome?.id === "shelf"),
        (on) => {
          getById("vignette").classList.toggle("whiteout", on);
        },
      );
      update("shards", world.shards, (shards) => {
        getById("runShards").textContent = formatCount(shards);
        // 3.45.0: the bump re-reads the layout - at most twice a second; the number itself always moves
        let chip = getById("shardChip");
        if (cache.shardsSeen) {
          let now = performance.now();
          if (now - (cache.shardBump || 0) > 450) {
            cache.shardBump = now;
            chip.classList.remove("bump");
            chip.offsetWidth;
            chip.classList.add("bump");
          }
        }
        cache.shardsSeen = true;
      });
      let waveMax = world.endless ? "" : "/" + 20;
      update("wave", world.wave + waveMax, () => {
        getById("waveLabel").textContent = `WAVE ${world.wave}${waveMax}`;
      });
      // 3.45.0: the progress bar carries the wave's count ("N LEFT" churned text with every kill;
      // a boss fight is named by the boss bar, CLEARED stays for the moment between the waves)
      let sub = world.state === "cleared" ? "CLEARED" : "\xA0";
      update("sub", sub, (text) => {
        getById("waveSub").textContent = text;
      });
      let showProg = world.state === "fight" && !world.boss && !world.bossPending && world.planTotal > 0;
      update("progOn", showProg, (on) => {
        getById("waveProg").hidden = !on;
      });
      if (showProg) {
        let left = world.enemies.length + world.markers.length;
        for (let i = world.planIdx; i < world.plan.length; i++) left += world.plan[i].members.length;
        let progress = clamp(1 - left / Math.max(world.planTotal, left), 0, 1);
        update("prog", Math.round(progress * 50), () => {
          getById("waveProgFill").style.transform = `scaleX(${progress})`;
        });
      }
      let boss = world.boss || (world.champion && !world.champion.dead ? world.champion : null);
      update("bossOn", !!boss, (on) => {
        getById("bossBar").hidden = !on;
      });
      if (boss) {
        update("bossName", boss.type + (boss.enraged ? "!" : "") + (boss.champion ? "c" : ""), () => {
          getById("bossName").textContent = boss.champion
            ? `${enemyDefs[boss.type].name.toUpperCase()} CHAMPION`
            : bossDefs[boss.type].name;
          getById("bossPhase").textContent = boss.enraged ? "ENRAGED" : boss.champion ? "RALLYING" : "";
        });
        update("bossF", Math.round((boss.hp / boss.maxHp) * 100), (value) => {
          getById("bossFill").style.transform = `scaleX(${clamp(value / 100, 0, 1)})`;
          getById("bossLag").style.transform = `scaleX(${clamp(value / 100, 0, 1)})`;
        });
        update("bossTicks", boss.type, (type) => {
          getById("bossTicks").innerHTML = type === "core" ? '<s style="left:66%"></s><s style="left:33%"></s>' : "";
        });
      }
      let combo = world.combo >= 5 ? world.combo : 0;
      update("combo", combo, (combo) => {
        getById("combo").hidden = !combo;
        if (combo) {
          getById("comboN").textContent = "\xD7" + combo;
          getById("combo").classList.toggle("hot", combo >= 25);
        }
      });
      if (combo) {
        update("comboT", Math.round(world.comboT * 20), (value) => {
          getById("comboBar").style.transform = `scaleX(${clamp(value / 44, 0, 1)})`;
        });
      }
      let dashPct = stats.dashCd > 0 ? Math.round((player.dashCdT / stats.dashCd) * 20) * 5 : 0;
      // 3.45.0: the ring (and the dimmed tint) say the cooldown - the per-decisecond seconds text is gone
      update("dash", dashPct, (pct) => {
        let btn = getById("dashBtn");
        btn.style.setProperty("--q", 100 - pct + "%");
        let cooling = pct > 0;
        if (btn.classList.contains("cooling") && !cooling) {
          btn.classList.remove("pop");
          btn.offsetWidth;
          btn.classList.add("pop");
          if (world.state === "fight") {
            this.g.sound.play("ready");
          }
        }
        btn.classList.toggle("cooling", cooling);
      });
      let nova = Math.floor(player.nova / 5) * 5;
      update("nova", nova, (pct) => {
        getById("novaBtn").style.setProperty("--p", pct + "%");
        getById("novaBtn").classList.toggle("ready", pct >= 100);
      });
      // 3.0.0: gadget charges as pips, recharge ring from gadgetT/gadgetCd
      const gadgetN = player.gadgetN | 0,
        gadgetMax = stats.gadgetMax | 0;
      update("gadgetPips", gadgetN + "/" + gadgetMax, () => {
        const pips = getById("gadgetPips");
        while (pips.children.length < gadgetMax) {
          pips.appendChild(document.createElement("i"));
        }
        while (pips.children.length > gadgetMax) {
          pips.lastChild.remove();
        }
        for (let i = 0; i < pips.children.length; i++) {
          pips.children[i].classList.toggle("on", i < gadgetN);
        }
        const btn = getById("gadgetBtn");
        btn.classList.toggle("empty", gadgetN <= 0);
        btn.setAttribute("aria-label", `Throw Singularity, ${gadgetN} of ${gadgetMax} ready`);
      });
      const gadgetPct =
        gadgetN >= gadgetMax || !(stats.gadgetCd > 0)
          ? 100
          : Math.round(clamp(1 - player.gadgetT / stats.gadgetCd, 0, 1) * 20) * 5;
      update("gadgetRing", gadgetPct, (pct) => {
        let btn = getById("gadgetBtn");
        // 3.45.0: the pips say how many charges are ready - the ring only speaks while one recharges
        btn.querySelector(".ring").hidden = pct >= 100;
        btn.style.setProperty("--q", pct + "%");
      });
    }
    buffs(world) {
      let player = world.player,
        stats = world.stats,
        chips = [];
      if (stats.bloodrush && player.rushN > 0) {
        chips.push(["rush", `RUSH \xD7${player.rushN}`, "#f08e70", player.rushT / 4]);
      }
      if (world.chronoT > 0) {
        chips.push(["chrono", "SLOW-MO", "#bacfd9", world.chronoT / 1.5]);
      }
      if ((world.ws.revive || 0) > 0 && !world.revived) {
        chips.push(["life", "2ND LIFE", "#abd397", -1]);
      }
      if (world.barrierT > 0) {
        chips.push(["barrier", "BARRIER", "#b5dcdc", world.barrierT / Math.max(1, stats.barrierT || 1)]);
      }
      if (world.attuned && world.state === "fight") {
        chips.push(["attune", "ATTUNED", "#ffb86b", -1]);
      }
      if (world.event && world.state === "fight") {
        chips.unshift(["event", waveEvents[world.event].name, world.event === "elite" ? "#ffc84a" : "#a7d1bf", -1]);
      }
      // 3.3.0: the Endless mutators in play (with their level)
      for (const [id, level] of Object.entries(world.mods || {}))
        if (MUTATORS[id])
          chips.push([
            "mut-" + id,
            MUTATORS[id].name.toUpperCase() + (level > 1 ? " " + "I".repeat(level) : ""),
            MUTATORS[id].color,
            -1,
          ]);
      if (player.onIce && world.state === "fight") {
        chips.push(["ice", "ICE", "#bff4ff", -1]);
      }
      if (player.inAcid && world.state === "fight") {
        chips.push(["acid", "ACID", "#b4ff3d", -1]);
      }
      if (player.inDevil && world.state === "fight") {
        chips.push(["devil", "DUST DEVIL", "#ffe9c4", -1]);
      }
      if (player.slowT > 0) {
        // 3.7.1: an electric trap stuns (0.8 s), ice chills (1.6 s)
        if (player.slowKind === "shock") chips.push(["shock", "STUNNED", "#ffe98a", player.slowT / 0.8]);
        else chips.push(["chill", "CHILLED", "#aee8ff", player.slowT / 1.6]);
      }
      let key = chips.map((chip) => chip[0] + chip[1]).join("|"),
        // 3.46.0: the row element is cached (it is static in the page); the step bars are cached
        // with it and die with the row on a rebuild (the bars used to be re-queried every frame)
        buffRow = this.buffRow || (this.buffRow = getById("buffs")),
        rebuilt = this.hudCache.buffKey !== key;
      if (rebuilt) {
        this.hudCache.buffKey = key;
        this.buffBars = new Map();
        buffRow.innerHTML = chips
          .map(
            ([id, text, color, left]) =>
              `<span class="buff" data-b="${id}" style="--bc:${color}">${text}${left >= 0 ? "<i></i>" : ""}</span>`,
          )
          .join("");
      }
      // 3.45.0: the little timers tick in 5 % steps and only write the step when it changes
      for (let [id, , , left] of chips) {
        if (left < 0) continue;
        let step = Math.round(clamp(left, 0, 1) * 20);
        // 3.45.3: `cache` was hud()'s local alias - buffs() reached for a global that does not exist, and the
        // first timed chip (a dash with Slipstream, a stun, a barrier) threw "Can't find variable: cache"
        // for three consecutive frames and killed the loop. The store is this.hudCache, as buffKey above.
        if (!rebuilt && this.hudCache["buff" + id] === step) continue;
        this.hudCache["buff" + id] = step;
        let bar = this.buffBars.get(id);
        if (!bar) {
          bar = buffRow.querySelector(`[data-b="${id}"] i`);
          if (bar) this.buffBars.set(id, bar);
        }
        if (bar) {
          bar.style.transform = `scaleX(${step / 20})`;
        }
      }
      // 2.5.0 A: chips for the timed upgrades (Heat Sink, Slipstream) and active Cryo Skates.
      // They are added next to the chips above, which may rebuild the row at any frame.
      const on = world.state === "fight" && player.alive,
        want = [];
      if (on && stats.heatSink && player.heatT > 0) {
        want.push(["heat", "HEAT", "#ff8a3d", player.heatT / 3]);
      }
      if (on && stats.slip && player.slipT > 0) {
        want.push(["slip", "SLIPSTREAM", "#a7d1bf", player.slipT / 1.37]);
      }
      if (on && stats.skates && player.skating) {
        want.push(["skate", "SKATES", "#bff4ff", -1]);
      }
      const row = buffRow;
      if (!row) return;
      // 3.46.0: the timed chips are cached too; a cached element is only trusted while it is
      // still connected (a rebuild of the row above may have dropped it)
      const timed = this.buffTimed;
      const live = (id) => {
        let el = timed.get(id);
        if (el && !el.isConnected) {
          timed.delete(id);
          el = null;
        }
        return el || null;
      };
      for (const id of timedBuffChips) {
        if (!want.some((chip) => chip[0] === id)) {
          const el = live(id);
          if (el) el.remove();
          else row.querySelector(`[data-b="${id}"]`)?.remove();
        }
      }
      for (const [id, text, color, left] of want) {
        let el = live(id) || row.querySelector(`[data-b="${id}"]`),
          fresh = false;
        if (!el) {
          el = document.createElement("span");
          el.className = "buff";
          el.dataset.b = id;
          el.style.setProperty("--bc", color);
          el.innerHTML = escapeHtml(text) + (left >= 0 ? "<i></i>" : "");
          row.appendChild(el);
          fresh = true;
        }
        timed.set(id, el);
        const step = Math.round(clamp(left, 0, 1) * 20);
        if (fresh || this.hudCache["buff" + id] !== step) {
          this.hudCache["buff" + id] = step;
          const bar = el.querySelector("i");
          if (bar) {
            bar.style.transform = `scaleX(${step / 20})`;
          }
        }
      }
    }
    showChoose(world) {
      let bossReward = world.offerBoss;
      getById("chooseEyebrow").textContent = bossReward
        ? `${bossDefs[world.bossKills[world.bossKills.length - 1]] ? bossDefs[world.bossKills[world.bossKills.length - 1]].name : "BOSS"} DEFEATED`
        : `WAVE ${world.wave} CLEARED`;
      getById("chooseTitle").textContent = bossReward ? "Claim a rare reward" : "Choose an upgrade";
      getById("chooseFirstHint").hidden = bossReward || world.wave !== 1;
      let hpFrac = clamp(world.player.hp / world.stats.maxHp, 0, 1);
      getById("chooseHp").style.transform = `scaleX(${hpFrac})`;
      getById("chooseHpNum").textContent = `${Math.ceil(world.player.hp)}/${world.stats.maxHp}`;
      this.renderNextWave(world);
      this.renderCards(world);
      this.coverHud(true);
      getById("choose").hidden = false;
    }
    /* 3.22.0: what the next wave brings, as chips under the title: the biome (when it is a new one), the boss, the wave
       event, the mutator that joins in Endless, traps */
    renderNextWave(world) {
      const box = getById("nextWave");
      if (!box) return;
      const next = world.previewWave(world.wave + 1),
        chips = [[`Wave ${next.wave}`, ""]];
      if (next.newBiome) chips.push([`Entering ${biomesById[next.biome].name}`, "biome"]);
      if (next.boss) chips.push([`Boss \u00b7 ${bossDefs[next.boss] ? bossDefs[next.boss].name : next.boss}`, "boss"]);
      if (next.event && waveEvents[next.event]) chips.push([waveEvents[next.event].name, "event"]);
      if (next.mutator && MUTATORS[next.mutator])
        chips.push([`New mutator \u00b7 ${MUTATORS[next.mutator].name}`, "mut"]);
      if (next.traps) chips.push(["Traps on the floor", ""]);
      box.innerHTML = chips.map(([text, cls]) => `<span class="nw ${cls}">${escapeHtml(text)}</span>`).join("");
    }
    renderCards(world) {
      // 2.4.2: the reroll/banish labels survive a re-render, so drop their old key hints first
      for (const id of ["rerollBtn", "banishBtn"])
        getById(id)
          .querySelectorAll(".card-key")
          .forEach((el) => el.remove());
      let cards = getById("cards");
      cards.innerHTML = world.offer
        .map((id, i) => {
          let up = upgradesById[id],
            level = world.up[id] || 0,
            // 3.15.0: a boss card carries the seal of its boss
            tag = up.boss
              ? `${bossDefs[up.boss] ? bossDefs[up.boss].name.toUpperCase() : "BOSS"} \xB7 BOSS CARD`
              : up.evo
                ? "EVOLUTION"
                : up.repeat
                  ? rarityNames[up.rarity].toUpperCase()
                  : level
                    ? `LV ${level} \u2192 ${level + 1}`
                    : `NEW \xB7 ${rarityNames[up.rarity].toUpperCase()}`,
            evo = this.evoHint(up, world),
            delta = this.statDelta(id, world);
          const seal = up.boss ? `<span class="seal" aria-hidden="true">${iconSvg("skull")}</span>` : "";
          return `<button class="card r${up.rarity}" data-pick="${id}" style="animation-delay:${i * 70}ms">${seal}<span class="cico">${iconSvg(up.icon)}</span><span><span class="ctop"><b>${escapeHtml(up.name)}</b><span class="lv">${tag}</span></span><p>${escapeHtml(up.desc(level))}</p>${delta}${evo}</span></button>`;
        })
        .join("");
      cards.classList.add("locked");
      clearTimeout(this.armT);
      this.armT = setTimeout(() => cards.classList.remove("locked"), 650);
      for (let card of cards.querySelectorAll("[data-pick]")) {
        card.addEventListener("click", () => {
          if (!cards.classList.contains("locked")) {
            // 3.25.0: with Banish armed the card is banished instead of taken
            if (this.banishMode) this.g.banish(card.dataset.pick);
            else this.g.choose(card.dataset.pick);
          }
        });
        // 2.7.0: a soft tick when the mouse moves over a card (touch has no hover)
        card.addEventListener("pointerenter", (ev) => {
          if (ev.pointerType === "mouse" && !cards.classList.contains("locked")) this.g.sound.play("hover");
        });
      }
      // 3.25.0: Banish Protocol: shown when the module is owned (or a banish is left in a resumed run)
      {
        const btn = getById("banishBtn"),
          has = (world.ws.banish || 0) > 0 || world.banishes > 0;
        btn.hidden = !has;
        if (world.banishes <= 0 || world.offer.length < 2) this.banishMode = false;
        btn.disabled = world.banishes <= 0 || world.offer.length < 2;
        btn.classList.toggle("on", !!this.banishMode);
        getById("banishTxt").textContent = `Banish (${world.banishes})`;
        cards.classList.toggle("banishing", !!this.banishMode);
      }
      getById("rerollTxt").textContent = `Reroll (${world.rerolls})`;
      getById("rerollBtn").disabled = world.rerolls <= 0;
      getById("buildStrip").innerHTML = this.buildHtml(world);
      // 2.4.2: keys 1-4 pick/banish a card, B banishes, R rerolls (keyboard players only)
      if (!RL_INPUT.touch) {
        cards.querySelectorAll("[data-pick]").forEach((card, i) => {
          card.classList.add("has-key");
          card.insertAdjacentHTML("beforeend", `<kbd class="card-key" aria-hidden="true">${i + 1}</kbd>`);
        });
        if (!getById("banishBtn").hidden) {
          getById("banishTxt").insertAdjacentHTML(
            "afterend",
            '<kbd class="card-key inline" aria-hidden="true">B</kbd>',
          );
        }
        getById("rerollTxt").insertAdjacentHTML("afterend", '<kbd class="card-key inline" aria-hidden="true">R</kbd>');
      }
    }
    statDelta(id, world) {
      let player = world.player,
        stats = world.stats;
      if (id === "heal") {
        let healed = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.45);
        return `<small class="delta">Hull ${Math.ceil(player.hp)} \u2192 ${Math.ceil(healed)}</small>`;
      }
      let next = computeStats(world.weapon, { ...world.up, [id]: (world.up[id] || 0) + 1 }, world.ws),
        lines = [];
      for (let [label, get, format] of statRows) {
        let before = get(stats),
          after = get(next);
        if (Math.abs(before - after) < 1e-6) continue;
        // 3.6.0: a value, its unit and the arrow never break apart (a lone "s" or "0/1" on a line of its own)
        const keep = (value) => String(format(value)).replace(/ /g, "\u00a0");
        lines.push(`${label} ${keep(before)}\u00a0\u2192\u00a0${keep(after)}`);
        if (lines.length >= 2) break;
      }
      return lines.length ? `<small class="delta">${escapeHtml(lines.join(" \xB7 "))}</small>` : "";
    }
    evoHint(up, world) {
      if (up.evo)
        return `<small class="evo-hint">Merges ${Object.keys(up.evo)
          .map((id) => escapeHtml(upgradesById[id].name))
          .join(" + ")}</small>`;
      let evos = upgradeList.filter(
          (evo) => evo.evo && evo.evo[up.id] && !world.up[evo.id] && (!evo.weapon || evo.weapon === world.weapon),
        ),
        evo = evos.find((evo) => evo.weapon) || evos[0];
      if (!evo) return "";
      let others = Object.keys(evo.evo)
          .filter((id) => id !== up.id)
          .map((id) => `${upgradesById[id].name}\u00a0${Math.min(world.up[id] || 0, evo.evo[id])}/${evo.evo[id]}`),
        mine = `${Math.min((world.up[up.id] || 0) + 1, evo.evo[up.id])}/${evo.evo[up.id]}`;
      return `<small class="evo-hint">\u2192 ${escapeHtml(evo.name)}: this\u00a0${mine} \xB7 ${escapeHtml(others.join(", "))}</small>`;
    }
    hideChoose() {
      getById("choose").hidden = true;
      this.coverHud(false);
    }
    coverHud(on) {
      getById("hud").style.visibility = on ? "hidden" : "";
      if (on) {
        getById("banner").innerHTML = "";
        clearTimeout(this.bannerT);
      }
      // 2.5.0 D: the upgrade choice and the pause menu hide the title cards like the banner
      if (on) {
        this.clearTitleCard();
      }
    }
    buildHtml(world) {
      let own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat);
      return own.length
        ? own
            .map(
              (upgrade) =>
                `<span class="bi r${upgrade.rarity}" title="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${world.up[upgrade.id] > 1 ? " \xD7" + world.up[upgrade.id] : ""}</span>`,
            )
            .join("")
        : '<span class="note">No upgrades yet.</span>';
    }
    showPause(world) {
      getById("pauseTitle").textContent = `Wave ${world.wave}${world.endless ? " \xB7 Endless" : ""}`;
      getById("abandonBtn").textContent = "Abandon run";
      getById("pauseStats").innerHTML =
        `<span>${formatTime(world.time)}</span><span>${formatCount(world.kills)} KILLS</span><span>${formatCount(world.shards)} SHARDS</span>`;
      this.renderStatRows(world);
      this.coverHud(true);
      getById("pause").hidden = false;
      this.screen = "pause";
      // 2.4.2: the build in the pause menu explains each upgrade on tap or click
      const own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat),
        info = getById("pauseUpInfo");
      getById("pauseBuild").innerHTML = own.length
        ? own
            .map(
              (upgrade) =>
                `<button type="button" class="bi r${upgrade.rarity}" data-up="${upgrade.id}" aria-label="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${world.up[upgrade.id] > 1 ? " \xD7" + world.up[upgrade.id] : ""}</button>`,
            )
            .join("")
        : this.buildHtml(world);
      info.hidden = !own.length;
      info.innerHTML = '<p class="note">Select an upgrade to see what it does.</p>';
    }
    /* 3.22.0: the numbers behind the build: the value now and, next to it, how far it is from what the weapon has without the
       upgrades of the run (green: better, red: worse) */
    renderStatRows(world) {
      const box = getById("pauseStatRows");
      if (!box) return;
      const rows = buildStatRows(world.weapon, world.up || {}, world.ws || {}, world.player.hp),
        num = (v, digits) => (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, "");
      box.innerHTML = rows
        .map((r) => {
          const value = r.hp != null ? `${Math.ceil(r.hp)} / ${num(r.now, r.digits)}` : num(r.now, r.digits) + r.unit,
            change = r.base ? (r.now - r.base) / r.base : 0;
          let delta = "",
            cls = "";
          if (Math.abs(change) >= 0.005) {
            const better = r.better === "up" ? change > 0 : change < 0;
            delta = `${change > 0 ? "+" : "\u2212"}${Math.round(Math.abs(change) * 100)}%`;
            cls = better ? "up" : "worse";
          }
          return `<span class="sr-k">${escapeHtml(r.label)}</span><span class="sr-v num">${escapeHtml(value)}</span><span class="sr-d ${cls}">${delta}</span>`;
        })
        .join("");
    }
    hidePause() {
      // 2.4.2: also closes settings opened from the pause menu
      closePauseSettings(this);
      getById("pause").hidden = true;
      getById("settings").hidden = true;
      this.coverHud(false);
    }
    // 2.4.2: settings from the pause menu (without backup and reset)
    openPauseSettings() {
      if (!this.g.paused || getById("pause").hidden) return;
      this.rlFromPause = true;
      getById("pause").hidden = true;
      getById("settings").classList.add("in-run");
      this._show("settings");
    }
    showOver(result) {
      getById("overEyebrow").textContent = result.win
        ? `${threatLevels[result.threat].name.toUpperCase()} \xB7 ALL ${20} WAVES`
        : `${weaponDefs[result.weapon].name.toUpperCase()} \xB7 ${threatLevels[result.threat].name.toUpperCase()}`;
      let title = getById("overTitle");
      title.textContent = result.win ? "RIFT SEALED" : result.abandoned ? "RUN ENDED" : "SIGNAL LOST";
      title.className = "over-title " + (result.win ? "win" : "lose");
      getById("overBest").hidden = !(result.best || result.fastest);
      getById("overBest").textContent = result.fastest && !result.best ? "NEW FASTEST" : "NEW BEST";
      const cause = getById("overCause"),
        source = result.killer && hitSourceName(result.killer);
      cause.hidden = !source;
      cause.textContent = source ? `Final hit · ${source}` : "";
      this.renderRecap(result);
      getById("overStats").innerHTML = [
        ["Wave", result.wave],
        ["Time", formatTime(result.time)],
        ["Kills", result.kills],
        ["Bosses", result.bosses],
      ]
        .map(([label, value]) => `<div class="cell"><div class="k">${label}</div><div class="v">${value}</div></div>`)
        .join("");
      getById("payRows").innerHTML = result.rows
        .map(
          ([label, value]) =>
            `<div class="pay-row"><span>${escapeHtml(label)}</span><span class="num">${escapeHtml(value)}</span></div>`,
        )
        .join("");
      getById("overMs").innerHTML =
        (result.medals || [])
          .map(
            (m) =>
              `<span class="chip">${iconSvg("trophy")} ${escapeHtml(MEDAL_NAMES[m.medal] || "Medal")} medal \u00b7 ${escapeHtml(m.name)} \u00b7 ${m.secs} s (par ${m.par} s)</span>`,
          )
          .join("") +
        (result.unlocks || [])
          .map((text) => `<span class="chip">${iconSvg("star")} ${escapeHtml(text)}</span>`)
          .join("") +
        result.milestones
          .map((text) => `<span class="chip">${iconSvg("trophy")} Milestone ready: ${escapeHtml(text)}</span>`)
          .join("");
      this.renderDamage(result);
      for (const id of ["endlessBtn", "retryBtn"])
        getById(id)
          .querySelectorAll(".card-key")
          .forEach((el) => el.remove());
      getById("endlessBtn").hidden = !result.canEndless;
      getById("retryBtn").hidden = result.canEndless;
      // 3.45.4: R runs again from the end screen (keyboard players only)
      if (!RL_INPUT.touch) {
        const targetBtn = getById(result.canEndless ? "endlessBtn" : "retryBtn");
        targetBtn.insertAdjacentHTML("beforeend", '<kbd class="card-key inline" aria-hidden="true">R</kbd>');
      }
      getById("over").hidden = false;
      this.countUp(getById("payTotal"), result.total);
      this.renderRunExtra();
    }
    // 1.6.0: run metrics for the game-over screen (game._runExtra, set in game.endRun)
    renderRunExtra() {
      const box = getById("overExtra"),
        extra = this.g && this.g._runExtra;
      if (!box) return;
      if (!extra) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      // 3.39.0: the damage totals live in the panels above (Damage dealt as bars, damage taken in the recap
      // of a lost run), so the grid keeps only what nothing else says
      box.innerHTML =
        '<div class="dh">Run performance</div><div class="run-extra-grid">' +
        [
          ["Crits", formatCount(extra.critHits || 0)],
          ["Dashes", formatCount(extra.dashes || 0)],
          ["Best combo", "×" + formatCount(extra.bestCombo || 0)],
        ]
          .map(
            ([label, value]) =>
              `<div class="xcell"><div class="xk">${escapeHtml(label)}</div><div class="xv num">${escapeHtml(value)}</div></div>`,
          )
          .join("") +
        "</div>";
    }
    /* 3.21.0: the recap of a lost run: who hit the drone last, with what and how long before the end, and where most of the
       damage of the run came from */
    renderRecap(result) {
      const box = getById("overRecap"),
        hits = (result.lastHits || []).slice(-6);
      box.hidden = !hits.length;
      if (box.hidden) return;
      const name = (src) => hitSourceName(src) || "Unknown source",
        ago = (s) => (s < 0.15 ? "the end" : `${s.toFixed(1)} s before`);
      const taken = Object.entries(result.taken || {})
          .filter(([, dmg]) => dmg >= 1)
          .sort((a, b) => b[1] - a[1]),
        total = taken.reduce((sum, [, dmg]) => sum + dmg, 0);
      box.innerHTML =
        '<div class="dh">What hit you</div><div class="hits">' +
        hits
          .map((h, i) => {
            const final = i === hits.length - 1,
              ticks = h.n > 1 ? ` \xD7${h.n}` : "";
            return `<div class="hit${final ? " final" : ""}"><span class="hd">\u2212${formatCount(Math.round(h.dmg))}</span><span>${escapeHtml(name(h.src))}${ticks}${final ? " \u2014 final blow" : ""}</span><span class="hw">${ago(h.ago)}</span></div>`;
          })
          .join("") +
        "</div>" +
        (taken.length && total >= 20
          ? `<div class="rt">Most damage taken from: ${taken
              .slice(0, 3)
              .map(([src, dmg]) => `${escapeHtml(name(src))} (${Math.round((dmg / total) * 100)}%)`)
              .join(", ")}</div>`
          : "");
    }
    renderDamage(result) {
      let box = getById("overDmg"),
        bySource = result.dmgSrc || {},
        sources = Object.entries(bySource)
          .filter(([, dmg]) => dmg >= 1)
          .sort((a, b) => b[1] - a[1]),
        total = sources.reduce((sum, [, dmg]) => sum + dmg, 0);
      box.hidden = !sources.length || total < 50;
      if (box.hidden) return;
      let shown = sources.slice(0, 4),
        rest = sources.slice(4).reduce((sum, [, dmg]) => sum + dmg, 0);
      if (rest > 0) {
        shown.push(["other", rest]);
      }
      let top = shown[0][1];
      box.innerHTML =
        '<div class="dh">Damage dealt</div>' +
        shown
          .map(([src, dmg]) => {
            let label = src === "weapon" ? result.weaponName : damageSources[src] ? damageSources[src][0] : "Other",
              color =
                src === "weapon"
                  ? "#" + weaponDefs[result.weapon].color.toString(16).padStart(6, "0")
                  : damageSources[src]
                    ? damageSources[src][1]
                    : "#93a2bf",
              pct = Math.round((dmg / total) * 100);
            return `<div class="dmg-row" style="--dc:${color}"><span>${escapeHtml(label)}</span><span class="num">${formatCount(dmg)} \xB7 ${pct}%</span><span class="db"><i style="transform:scaleX(${(dmg / top).toFixed(3)})"></i></span></div>`;
          })
          .join("");
    }
    hideOver() {
      getById("over").hidden = true;
    }
    countUp(el, total) {
      let start = performance.now(),
        duration = 900,
        step = (now) => {
          let k = clamp((now - start) / duration, 0, 1);
          el.textContent = formatCount(Math.round(total * (1 - Math.pow(1 - k, 3))));
          if (k < 1) {
            requestAnimationFrame(step);
          }
        };
      requestAnimationFrame(step);
    }
    showCrash(log) {
      for (let id of ["choose", "pause", "over"]) getById(id).hidden = true;
      this.showHud(false);
      getById("crashLog").value = log;
      getById("crash").hidden = false;
    }
    hideCrash() {
      getById("crash").hidden = true;
    }
    // 3.0.0: the GADGET button reacts to the simulation: "ready" pops it, "deny" shakes it
    gadgetFlash(kind) {
      const btn = getById("gadgetBtn");
      btn.classList.remove(kind);
      btn.offsetWidth;
      btn.classList.add(kind);
    }
    hurtFlash() {
      let el = getById("flash");
      el.classList.add("on");
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("on")));
    }
    // ---- 2.5.0 D: title cards (see the note above RL_BIOME_CARD)
    clearTitleCard() {
      this.titleCardN = (this.titleCardN || 0) + 1;
      this.cardHold = null;
      clearTimeout(this.titleCardT);
      const el = getById("titleCard");
      if (el) {
        el.innerHTML = "";
      }
    }
    // biome title card; it replaces the wave banner of its wave
    biomeCard(biome, wave, ms = 9000) {
      const info = rlBiomeCardInfo(biome);
      holdTitleCard(
        this,
        "biome",
        `<div class="tcard biome hold" data-biome="${escapeHtml(info.id)}" style="--bc:${info.color}"><div class="tc-band"><div class="tc-eye">${wave ? `Wave ${escapeHtml(wave)} \xB7 ` : ""}Entering</div><div class="tc-name">${escapeHtml(info.name)}</div>${info.hazard ? `<div class="tc-haz">${escapeHtml(info.hazard)}</div>` : ""}${info.boss ? `<div class="tc-boss"><span>Boss</span>${escapeHtml(info.boss)}</div>` : ""}</div></div>`,
        2500,
        ms,
      );
      return info;
    }
    // boss intro card, shown during the camera pan to a new boss
    bossCard(id, biome, ms = 9000) {
      const boss = bossDefs[id];
      if (!boss) return null;
      holdTitleCard(
        this,
        "boss",
        `<div class="tcard boss hold" data-boss="${escapeHtml(id)}" style="--bc:${rlHex(boss.color)}"><div class="tc-panel"><i class="tc-accent"></i><div class="tc-eye">Boss${biome ? " \xB7 " + escapeHtml(biome.name) : ""}</div><div class="tc-name">${escapeHtml(boss.name)}</div><i class="tc-line"></i><div class="tc-title">${escapeHtml(boss.title)}</div></div></div>`,
        2800,
        ms,
      );
      return boss;
    }
    // fades the held card out in 0.5 s, after it has been on screen for its minimum time
    releaseTitleCard() {
      const hold = this.cardHold;
      if (!hold) return;
      this.cardHold = null;
      if (this.titleCardN !== hold.token) return; // another card replaced it
      clearTimeout(this.titleCardT);
      this.titleCardT = setTimeout(
        () => {
          if (this.titleCardN !== hold.token) return;
          const card = document.querySelector("#titleCard .tcard");
          if (card) {
            card.classList.add("out");
          }
          this.titleCardT = setTimeout(
            () => this.titleCardN === hold.token && (getById("titleCard").innerHTML = ""),
            520,
          );
        },
        Math.max(0, hold.min - (performance.now() - hold.at)),
      );
    }
  };
// 2.5.0 A: HUD chips of the timed upgrades, managed next to the chips of GameUI.buffs
const timedBuffChips = ["heat", "slip", "skate"];
// 2.4.2: closes settings that were opened from the pause menu
function closePauseSettings(ui) {
  ui.rlFromPause = false;
  getById("settings").hidden = true;
  getById("settings").classList.remove("in-run");
}

// the hazard of each biome in a few words (the RL_BIOME_INFO tag is the fallback for new biomes)
const RL_BIOME_CARD = {
  city: "Charged inlays discharge · lure enemies onto them",
  shelf: "Slick ice under the aurora — the blizzard breathes, so does your drift",
  marsh: "The mud clings, the glowing tide eats your hull — and marks enemies",
  core: "Portal pairs fold the arena — shots pass through",
  caldera: "Magma vents jet molten rock — the ground itself burns",
  flats: "Dust devils wander the glass — they shove, and the wind bites",
};
const rlHex = (color) => "#" + ((Number(color) >>> 0) & 0xffffff).toString(16).padStart(6, "0");
function rlBiomeCardInfo(biome) {
  biome = biome || biomeList[0];
  const bossId = bossByBiome[biome.id],
    boss = bossId && bossDefs[bossId];
  return {
    id: biome.id,
    name: biome.name,
    hazard: RL_BIOME_CARD[biome.id] || biome.tag || "",
    boss: boss ? boss.name : "",
    color: rlHex(biome.grid != null ? biome.grid : 0x49f2ff),
  };
}

function titleCardLayer() {
  let el = getById("titleCard");
  if (!el) {
    el = document.createElement("div");
    el.id = "titleCard";
    el.setAttribute("aria-live", "polite");
    const banner = getById("banner");
    if (banner) {
      banner.after(el);
    } else {
      getById("app").appendChild(el);
    }
  }
  return el;
}
// The card starts after the next frame is on screen: the first frame of a new arena or boss can
// take long on slow devices (shader compiles), and the card must not run out during that stall.
function showTitleCard(ui, html, ms) {
  const el = titleCardLayer(),
    token = (ui.titleCardN = (ui.titleCardN || 0) + 1);
  clearTimeout(ui.titleCardT);
  el.innerHTML = "";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (ui.titleCardN !== token) return;
      el.innerHTML = html;
      ui.titleCardT = setTimeout(() => ui.titleCardN === token && (el.innerHTML = ""), ms + 60);
    }),
  );
  return token;
}
// Both cards hold until the game releases them (releaseTitleCard), because they follow game time:
// the biome card the first 1.6 s of its wave, the boss card the camera pan. Game time runs slower
// than the clock on a slow device and stalls while a new arena or boss is first drawn, so a card
// on a clock timer could be gone before the player saw it. `ms` is only a safety limit.
function holdTitleCard(ui, kind, html, min, ms) {
  getById("banner").innerHTML = "";
  clearTimeout(ui.bannerT);
  ui.cardHold = { token: showTitleCard(ui, html, ms), kind, at: performance.now(), min };
}

export { GameUI, RL_TOUCH_CLICK_GUARD, getById, rlBiomeTitle, escapeHtml };
