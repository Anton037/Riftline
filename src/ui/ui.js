// DOM UI (GameUI): screens, HUD, dialogs, workshop, records and settings, plus DOM helpers and icons.

import { RL_RT, logError } from "../core/diagnostics.js";
import { enemyDefs, bossDefs, bossByBiome, RL_ENEMY_TIPS } from "../data/enemies.js";
import { biomeList, biomesById } from "../data/biomes.js";
import { store } from "../main.js";
import { clamp, GAME_VERSION, formatCount, rlAgo, formatTime } from "../core/util.js";
import { weaponOrder, weaponDefs } from "../data/weapons.js";
import { MEDAL_NAMES } from "../core/medals.js";
import { waveEvents } from "../core/waves.js";
import { milestones, workshopModules, threatLevels } from "../data/progression.js";
import { upgradeList, rarityNames, upgradesById } from "../data/upgrades.js";
import { computeStats, weaponRange, buildStatRows } from "../core/stats.js";
import { acceptsPointer, touchInput } from "./input.js";
import { WHATS_NEW } from "../data/whatsnew.js";
import { MUTATORS } from "../core/mutators.js";
import { TRAP_MODE_NAMES } from "../core/traps.js";
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
        ? "a shock pad"
        : id === "acid"
          ? "an acid pool"
          : id === "devil"
            ? "a dust devil"
            : id === "trap"
              ? "an arena trap"
              : id === "starfall"
                ? "a meteor"
                : id === "crucible"
                  ? "a crucible bomb"
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
        threatLevels[run.threat]?.name || "Normal",
        TRAP_MODE_NAMES[run.trapMode],
        formatTime(run.time),
        formatCount(run.kills) + " kills",
        "+" + formatCount(run.shards) + " shards",
        killer && "by " + killer,
        run.outcome === "quit" && "abandoned",
      ]
        .filter(Boolean)
        .join(" · ");
      const build = (run.build || [])
        .map((id) => upgradesById[id]?.name)
        .filter(Boolean)
        .join(" · ");
      const weaponName = weaponDefs[run.weapon]?.name || String(run.weapon || "Lantern Gun");
      return `<div class="row panel hist ${run.outcome}"><div class="rico">${iconSvg(icon)}</div><div><b>${run.outcome === "win" ? "Victory" : "Wave " + run.wave}${run.endless ? " · Endless" : ""} · ${escapeHtml(weaponName)}</b><small>${escapeHtml(meta)}</small>${build ? `<small class="hist-build">${escapeHtml(build)}</small>` : ""}</div><span class="chip">${rlAgo(run.t)}</span></div>`;
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
  fireBellows: '<path d="M12 22c-4 0-7-3-7-7 0-4 4-5 3-10l4 5 3-7c2 5 4 7 4 12 0 4-3 7-7 7zm0-2-3-4 3-4 3 4z"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zm6-2v15m6-12v15"/><circle cx="12" cy="12" r="1"/>',
  dartSprite: '<path d="M12 5l3 5-3 7-3-7zm-3 5C5 7 3 8 4 12c1 2 3 2 5 0m6 0c4-3 6-2 5 2-1 2-3 2-5 0M12 2v3"/>',
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
  bellCage: '<path d="M8 4h8l2 5v8l-6 4-6-4V9zm4-2v2m-4 5h8m-4 0v9m-3-4h6"/>',
  mossHelpers: '<path d="m12 4 5 6 1 6-6 5-6-5 1-6zm-5 6-4-3m14 3 4-3M7 16l-4 2m14-2 4 2"/>',
  collapse: '<path d="m12 2 10 10-10 10L2 12zm0 5 5 5-5 5-5-5z"/>',
  forgeGift: '<path d="m12 3 5 7-5 8-5-8zM4 15l3 5h10l3-5"/>',
  volOn: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  volOff: '<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
};
function iconSvg(name, cls = "") {
  let paths = iconPaths[name] || iconPaths.info;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const getById = (id) => document.getElementById(id),
  BIOME_THEME_COLOR = {
    lanternYard: "#14100d",
    snowRidge: "#0e1a28",
    mossBog: "#0e1a14",
    starHall: "#150e24",
    emberHill: "#1c100d",
    sunDunes: "#1b140d",
  },
  setBiomeTheme = (id) => {
    const app = getById("app");
    if (app) {
      if (id) app.dataset.biome = id;
      else delete app.dataset.biome;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", BIOME_THEME_COLOR[id] || "#130f0c");
  },
  menuScreens = ["home", "workshop", "records", "news", "settings"],
  formatTenths = (value) => (Math.round(value * 10 + 1e-6) / 10).toString(),
  formatPercent = (value) => Math.round(value * 100) + "%",
  formatCooldown = (value) => (value > 0 ? formatTenths(value) + " s" : "off"),
  statRows = [
    [
      "Damage",
      (stats) =>
        (stats.weapon.dmg + (stats.weapon.explodeDmg || 0)) *
        stats.dmgMul *
        (stats.weapon.id === "ringBlade" && stats.twinRings ? 1.35 : 1),
      formatTenths,
    ],
    ["Fire rate", (stats) => stats.weapon.rate * stats.rateMul, (value) => formatTenths(value) + "/s"],
    ["Shots", (stats) => stats.weapon.count + (stats.weapon.cone ? stats.extra * 2 : stats.extra), String],
    ["Pierce", (stats) => (stats.pierce > 99 ? 0 : stats.pierce), String],
    ["Ricochets", (stats) => stats.bounce, String],
    ["Crit chance", (stats) => stats.crit, formatPercent],
    ["Max HP", (stats) => stats.maxHp, String],
    ["Move speed", (stats) => stats.speed, (value) => formatTenths(value) + " m/s"],
    ["Range", (stats) => stats.range, (value) => Math.round(value) + " m"],
    ["Pickup reach", (stats) => stats.magnet, (value) => formatTenths(value) + " m"],
    ["Dash charges", (stats) => stats.dashCharges, String],
    ["Dash cooldown", (stats) => stats.dashCd, formatCooldown],
    ["Mirror Shield", (stats) => stats.shieldCd, formatCooldown],
    ["HP regen", (stats) => stats.regen, (value) => formatTenths(value) + " HP/s"],
    ["Spinning Blades", (stats) => stats.orbit, String],
    ["Blade damage", (stats) => (stats.orbit ? stats.orbitDmg * stats.dmgMul : 0), formatTenths],
    ["Frost chance", (stats) => stats.iceShot, formatPercent],
    ["Spark Chain", (stats) => stats.arc, formatPercent],
    ["Chain jumps", (stats) => (stats.arc ? stats.arcJumps : stats.chain), String],
    [
      "Burn damage",
      (stats) => (stats.burn ? stats.burn * stats.burnMul * stats.dmgMul : 0),
      (value) => formatTenths(value) + "/s",
    ],
    ["Burn bonus", (stats) => stats.burningShot, formatPercent],
    ["Blast Shot", (stats) => stats.payloadF, formatPercent],
    ["Gravity Bells", (stats) => stats.gadgetMax, String],
    ["Bell cooldown", (stats) => stats.gadgetCd, formatCooldown],
    ["Bell power", (stats) => stats.gadgetDmg, (value) => "\u00d7" + formatTenths(value)],
    ["Healing Drops", (stats) => stats.siphonCh, formatPercent],
    ["Fire Burst reach", (stats) => stats.novaR, (value) => formatTenths(value) + " m"],
    ["Fire Burst charge", (stats) => stats.novaMul, (value) => "\u00d7" + formatTenths(value)],
    ["Helper Wisps", (stats) => stats.wingmen, String],
    ["Streak speed cap", (stats) => (stats.killStreak ? 0.4 : 0), formatPercent],
  ],
  hitSourceName = (src) =>
    enemyDefs[src]?.name ||
    bossDefs[src]?.name ||
    {
      lava: "Lava vent",
      shock: "Shock pad",
      acid: "Acid pool",
      trap: "Arena trap",
      devil: "Dust devil",
      prop: "Interactive object",
      starfall: "Starfall",
      crucible: "Forge blast",
    }[src],
  damageSources = {
    arc: ["Spark Chain", "#c0a6db"],
    burn: ["Burn", "#ff8a2a"],
    blastShot: ["Blast Shot", "#ffa13d"],
    orbit: ["Spinning Blades", "#b8dace"],
    helperWisps: ["Helper Wisps", "#91c9b4"],
    dash: ["Shock Dash", "#a7d1bf"],
    trail: ["Dash Trail", "#a7d1bf"],
    fireBurst: ["Fire Burst", "#ffd47e"],
    pop: ["Fire Pop", "#e9bf89"],
    shatter: ["Heat Shatter", "#bfe9ff"],
    lava: ["Lava vents", "#ff6a2a"],
    shock: ["Shock pads", "#e5b878"],
    wildfire: ["Wildfire", "#ff5a3a"],
    fireWave: ["Fire Wave", "#ffd27a"],
    shieldPulse: ["Shield Pulse", "#b8dace"],
    surge: ["Bell Wave", "#e9bf89"],
    grenade: ["Gravity Bell", "#c89eff"],
    trap: ["Arena traps", "#c9bfa8"],
    prop: ["Interactive objects", "#f2c879"],
    starfall: ["Starfall", "#ffd872"],
    crucible: ["Forge blast", "#ff8438"],
    bellCage: ["Bell Cage", "#f08e70"],
    shard: ["Ice Shards", "#bacfd9"],
    fang: ["Dragon Fang", "#ffd98a"],
    mossHelpers: ["Moss Helpers", "#c1d291"],
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
      this.recTab = "milestones";
      this.codexTab = "areas";
      this.banishMode = false;
      this.chooseScroll = { left: 0, top: 0 };
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
    click(el, action, { sound = true, touchOnly = false } = {}) {
      if (!el) return;
      let touchDown = false,
        dragged = false,
        startX = 0,
        startY = 0,
        pointerId = 0;
      const withinTapSlop = (ev) => Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 14;
      const activate = () => {
        if (el.disabled || !el.isConnected || el.closest("[hidden]")) return false;
        if (sound) this.g.sound.play("click");
        action();
        return true;
      };
      el.addEventListener(
        "pointerdown",
        (ev) => {
          if (!touchInput || ev.pointerType !== "touch") return;
          // 3.31.0: a second finger may tap a button when no other touch is on it (pause while a thumb holds a stick;
          // browsers send no click for such a tap). A second finger on a button already pressed does not take it over.
          if (ev.isPrimary !== false || !touchDown) {
            startX = ev.clientX;
            startY = ev.clientY;
            pointerId = ev.pointerId;
            touchDown = true;
            dragged = false;
          }
        },
        { passive: false },
      );
      el.addEventListener(
        "pointermove",
        (ev) => {
          if (touchDown && ev.pointerId === pointerId && !withinTapSlop(ev)) dragged = true;
        },
        { passive: true },
      );
      el.addEventListener(
        "pointerup",
        (ev) => {
          if (ev.pointerType !== "touch" || !touchDown || ev.pointerId !== pointerId) return;
          touchDown = false;
          if (!dragged && withinTapSlop(ev) && !activate()) return;
          // Suppress the compatibility click even if the finger dragged and then returned.
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
      const cancelTouch = (ev) => {
        if (ev.pointerId === pointerId) touchDown = false;
      };
      el.addEventListener("pointercancel", cancelTouch, { passive: true });
      el.addEventListener("lostpointercapture", cancelTouch, { passive: true });
      el.addEventListener("click", (ev) => {
        // Touch actions are handled on pointerup. A browser's compatibility click can
        // arrive much later, when the same coordinates are over a different screen.
        if (
          touchInput &&
          (ev.pointerType === "touch" ||
            ev.sourceCapabilities?.firesTouchEvents ||
            (!ev.pointerType && ev.isTrusted && ev.detail > 0))
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (touchOnly) return;
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
    bindCheckbox(input, change) {
      input.addEventListener("change", change);
      if (!touchInput) return;
      // WebKit can report a tap's click as a mouse click. Use the same tap handling
      // as buttons and keep native change events for keyboard activation.
      this.click(
        input.closest("label") || input,
        () => {
          if (input.disabled) return;
          input.checked = !input.checked;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { sound: false, touchOnly: true },
      );
    }
    bind() {
      for (let el of document.querySelectorAll("[data-go]")) this.click(el, () => this.show(el.dataset.go));
      for (let el of document.querySelectorAll("[data-back]")) this.click(el, () => this.back());
      this.click(getById("wPrev"), () => this.stepWeapon(-1));
      this.click(getById("wNext"), () => this.stepWeapon(1));
      this.click(getById("tPrev"), () => this.stepThreat(-1));
      this.click(getById("tNext"), () => this.stepThreat(1));
      for (const button of getById("trapMode").querySelectorAll("button")) {
        this.click(button, () => {
          if (this.save.trapMode === button.value) return;
          this.save.trapMode = button.value;
          this.g.store.save("trap-mode");
          this.renderTrapMode();
        });
      }
      this.click(getById("wBuy"), () => this.buyWeapon());
      this.click(getById("playBtn"), () => this.play());
      this.click(getById("continueBtn"), () => this.g.startRun({ resume: true }));
      let onPress = (el, action) =>
        el.addEventListener("pointerdown", (ev) => {
          if (!acceptsPointer(ev) || (ev.pointerType === "mouse" && ev.button !== 0)) return;
          ev.preventDefault();
          ev.stopPropagation();
          el.blur?.();
          action();
        });
      for (const action of ["dash", "fireBurst", "gravityBell"]) {
        onPress(getById(action + "Btn"), () => this.g.input.press(action));
      }
      this.click(getById("pauseBtn"), () => {
        getById("pauseBtn").blur?.();
        this.g.pause();
      });
      this.click(getById("choosePauseBtn"), () => {
        getById("choosePauseBtn").blur?.();
        this.g.pause();
      });
      this.click(getById("muteBtn"), () => this.g.toggleMute?.());
      this.click(getById("resumeBtn"), () => this.g.resume());
      this.click(getById("abandonBtn"), async () => {
        if (
          await this.confirm("Abandon run?", "You keep the shards collected so far, but the run ends here.", "Abandon")
        ) {
          this.g.abandon();
        }
      });
      this.click(getById("rerollBtn"), () => this.g.reroll());
      {
        const cards = getById("cards");
        cards.addEventListener(
          "scroll",
          () => {
            // A portrait resize can reset the scroller before the pause screen opens.
            if (!cards.clientWidth || (touchInput && innerHeight > innerWidth)) return;
            this.chooseScroll = { left: cards.scrollLeft, top: cards.scrollTop };
            this.updateChooseScrollHint();
          },
          { passive: true },
        );
        if (touchInput) {
          const updateScrollHint = () => this.updateChooseScrollHint();
          new ResizeObserver(() => requestAnimationFrame(updateScrollHint)).observe(cards);
        }
      }
      this.click(getById("anvilContinueBtn"), () => this.g.leaveAnvil());
      this.click(getById("anvilPauseBtn"), () => this.g.pause());
      this.click(getById("claimAllBtn"), () => this.claimAll());
      for (const tabBtn of document.querySelectorAll("#recTabs [data-rec-tab]")) {
        this.click(tabBtn, () => {
          this.recTab = tabBtn.dataset.recTab;
          this.renderRecords();
        });
      }
      for (const tabBtn of document.querySelectorAll("#codexSubtabs [data-codex-tab]")) {
        this.click(tabBtn, () => {
          this.codexTab = tabBtn.dataset.codexTab;
          this.renderCodex();
        });
      }
      getById("buildStrip")?.addEventListener("click", (ev) => {
        const btn = ev.target.closest?.("[data-up]"),
          world = this.g.world,
          info = getById("chooseUpInfo");
        if (!btn || !world || !info) return;
        const wasSel = btn.getAttribute("aria-pressed") === "true";
        for (const el of getById("buildStrip").querySelectorAll("[data-up]")) {
          el.setAttribute("aria-pressed", "false");
        }
        if (wasSel) {
          info.hidden = true;
          return;
        }
        btn.setAttribute("aria-pressed", "true");
        const up = upgradesById[btn.dataset.up],
          lv = world.up[btn.dataset.up] || 0;
        if (up) {
          const tag = up.boss
            ? "Boss Reward"
            : up.evo
              ? "Master Craft"
              : up.repeat
                ? `\xD7${lv}`
                : `Lv ${lv}/${up.max}`;
          info.innerHTML = `<b>${escapeHtml(up.name)}</b> <span class="lv">${escapeHtml(tag)}</span> — ${escapeHtml(up.desc(Math.max(0, lv - 1)))}`;
          info.hidden = false;
        }
      });
      this.click(getById("restartBtn"), async () => {
        if (
          await this.confirm(
            "Restart run?",
            "Shards collected so far are kept. A fresh run starts with the same weapon and trial.",
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
        bindToggle = (id, key, afterChange) => {
          let input = getById(id);
          if (!input) return;
          this.bindCheckbox(input, () => {
            settings()[key] = input.checked;
            this.g.settingsChanged();
            afterChange?.();
          });
        };
      bindToggle("setAuto", "autoFire");
      bindToggle("setAssist", "assist");
      bindToggle("setNumbers", "numbers");
      bindToggle("setPerformance", "performanceOverlay", () => this.renderPerformanceSetting());
      bindToggle("setMuted", "muted");
      const setRangeFill = (input) => {
        if (!input) return;
        const min = +input.min || 0,
          max = +input.max || 1,
          pct = clamp(((+input.value - min) / Math.max(1e-6, max - min)) * 100, 0, 100);
        input.style.setProperty("--p", pct.toFixed(1) + "%");
      };
      this._setRangeFill = setRangeFill;
      for (let [id, key, previewKey] of [
        ["setMaster", "master", "sfx"],
        ["setSfx", "sfx", "sfx"],
        ["setMusic", "music", "music"],
        ["setAmb", "ambience", "ambience"],
      ]) {
        let input = getById(id),
          out = getById(id + "V");
        if (!input) continue;
        input.addEventListener("input", () => {
          settings()[key] = +input.value;
          if (key === "master" && +input.value > 0 && settings().muted) {
            settings().muted = false;
            if (getById("setMuted")) getById("setMuted").checked = false;
          }
          if (out) out.textContent = Math.round(+input.value * 100) + "%";
          setRangeFill(input);
          this.g.settingsChanged(true);
          this.syncMuteButton();
          // 3.48.0: hear the bus you are turning, at the level you just set (a shot of the weapon in
          // hand for effects, the arrival braam of the place for music, one far voice for the ambience)
          this.g.sound.previewBus(previewKey, this.save.weapon);
        });
        input.addEventListener("change", () => {
          this.g.settingsChanged();
        });
      }
      this.click(getById("updateReadyBtn"), () => {
        const apply = this.g.pendingUpdate;
        if (apply) {
          this.g.pendingUpdate = null;
          this.g.store.save("update");
          apply();
        }
      });
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
            "Shards, workshop upgrades, weapons, Journal records, and milestones are wiped. Settings stay.",
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
            "Sound, display, controls, and touch layout return to defaults. Your progress stays untouched.",
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
    syncMuteButton() {
      const btn = getById("muteBtn");
      if (!btn) return;
      const muted = !!this.save.settings.muted || (this.save.settings.master ?? 1) <= 0;
      btn.innerHTML = iconSvg(muted ? "volOff" : "volOn");
      btn.classList.toggle("muted", muted);
      btn.setAttribute("aria-pressed", String(muted));
      btn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    }
    show(screen) {
      if (menuScreens.includes(this.screen) && this.screen !== screen) {
        this.stack.push(this.screen);
      }
      this._show(screen);
    }
    _show(screen) {
      // 2.3.6: the renderer re-measures the free space of the home screen for the artificer preview
      markHomeViewDirty();
      for (let id of menuScreens) getById(id).hidden = id !== screen;
      this.screen = screen;
      window.__riftUpdateDeviceProfile?.();
      if (menuScreens.includes(screen) && !this.rlFromPause) {
        setBiomeTheme("");
      }
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
      const upBtn = getById("updateReadyBtn");
      if (upBtn) upBtn.hidden = !this.g.pendingUpdate;
      this.syncMuteButton();
      const corruptBanner = getById("corruptBanner");
      if (corruptBanner) corruptBanner.hidden = !this.g.store.corruptBackupKey || !!this.corruptDismissed;
      const webglBanner = getById("webglBanner");
      if (webglBanner) webglBanner.hidden = !!this.g.renderer;
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
      this.renderTrapMode();
      let run = save.run,
        btn = getById("continueBtn");
      if (run) {
        btn.hidden = false;
        const stage = run.anvil
          ? "ROADSIDE FORGE"
          : run.offer
            ? run.offerBoss
              ? "BOSS REWARD"
              : "CRAFT CHOICE"
            : `WAVE ${run.wave}`;
        btn.innerHTML = `${iconSvg("play")}CONTINUE \xB7 ${stage} \xB7 ${escapeHtml(weaponDefs[run.weapon].name)}`;
        getById("playBtn").classList.remove("primary");
      } else {
        btn.hidden = true;
        getById("playBtn").classList.add("primary");
      }
      const checkpoint = getById("continueNote");
      checkpoint.hidden = !run || !!(run.offer || run.anvil);
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
    renderTrapMode() {
      for (const button of getById("trapMode").querySelectorAll("button")) {
        const active = button.value === this.save.trapMode;
        button.classList.toggle("on", active);
        button.setAttribute("aria-pressed", String(active));
      }
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
      getById("wBlurb").textContent = weapon.blurb;
      let burst = weapon.dmg * weapon.count + (weapon.explodeDmg || 0),
        dps = Math.round(burst * weapon.rate),
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
      const traits = [`${dps} DPS`];
      if (weapon.homing) traits.push("Homing");
      if (weapon.chain) traits.push(`Chains \xD7${weapon.chain}`);
      if (weapon.pierce >= 99) traits.push("Full Pierce");
      else if (weapon.pierce > 0) traits.push(`Pierce ${weapon.pierce}`);
      if (weapon.boomerang) traits.push("Boomerang");
      if (weapon.explode) traits.push("Splash Blast");
      if (weapon.burn) traits.push("Ignites");
      if (weapon.count > 1 && !weapon.burn) traits.push(`${weapon.count}-Pellet Fan`);
      const traitsEl = getById("wTraits");
      if (traitsEl) {
        traitsEl.innerHTML = traits.map((t) => `<span class="wc-trait">${escapeHtml(t)}</span>`).join("");
      }
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
      // Preview locked weapons in 3D too so players can inspect what they are saving up for.
      this.g.previewWeapon(id);
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
        : threat.desc;
      getById("tPrev").disabled = this.viewThreat <= 0;
      getById("tNext").disabled = this.viewThreat >= Math.min(5, save.threatMax + 1);
      this.updatePlayState();
    }
    syncGraphicsControls() {
      const ready = this.g.graphicsReady;
      for (const id of ["resumeBtn", "restartBtn", "retryBtn", "endlessBtn"]) {
        getById(id).disabled = !ready;
      }
      getById("resumeBtn").textContent = ready ? "Resume" : "Waiting for graphics…";
      this.updatePlayState();
    }
    updatePlayState() {
      let save = this.save,
        id = weaponOrder[this.viewWeapon],
        graphicsReady = this.g.graphicsReady,
        playable = graphicsReady && !!save.weapons[id] && this.viewThreat <= save.threatMax,
        btn = getById("playBtn");
      getById("continueBtn").disabled = !graphicsReady;
      btn.disabled = !playable;
      btn.textContent = !this.g.renderer
        ? "3D UNAVAILABLE"
        : !graphicsReady
          ? "WAITING FOR GRAPHICS…"
          : playable
            ? save.run
              ? "NEW RUN"
              : "PLAY"
            : save.weapons[id]
              ? "TRIAL LOCKED"
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
      const save = this.save;
      if (
        save.run &&
        !(await this.confirm(
          "Start a new run?",
          `Your run at wave ${save.run.wave} ends here. You keep the shards collected in it.`,
          "New run",
        ))
      )
        return;
      if (!this.g.graphicsReady) return;
      if (save.run) {
        this.g.discardRun();
      }
      this.g.startRun({});
    }
    renderWorkshop() {
      let save = this.save;
      for (let el of document.querySelectorAll(".bankMirror")) el.textContent = formatCount(save.shards);
      let list = getById("wsList");
      const groups = [
        ["ward", "Health & Shield", "cat-ward"],
        ["arms", "Weapons", "cat-fire"],
        ["stride", "Movement", "cat-stride"],
        ["craft", "Run Help", "cat-fate"],
      ];
      list.innerHTML = groups
        .map(([gKey, gTitle, catCls]) => {
          const mods = workshopModules.filter((m) => (m.group || "craft") === gKey);
          if (!mods.length) return "";
          const rows = mods
            .map((mod) => {
              let level = save.workshop[mod.id] || 0,
                maxLevel = mod.costs.length,
                cost = mod.costs[level],
                pips = Array.from({ length: maxLevel }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join(""),
                btn =
                  level >= maxLevel
                    ? '<button class="btn max-btn" disabled>MAX</button>'
                    : `<button class="btn buy" data-buy="${mod.id}" ${save.shards < cost ? "disabled" : ""}><span class="shard-ico"></span>${cost}</button>`;
              return `<div class="row panel ${catCls}"><div class="rico">${iconSvg(mod.icon)}</div><div><b>${escapeHtml(mod.name)}</b><small>${escapeHtml(mod.desc)}</small><div class="pips">${pips}</div></div>${btn}</div>`;
            })
            .join("");
          return `<h3 class="ws-group-h">${escapeHtml(gTitle)}</h3>${rows}`;
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
      const tab = this.recTab || "milestones";
      for (const btn of document.querySelectorAll("#recTabs [data-rec-tab]")) {
        const active = btn.dataset.recTab === tab;
        btn.classList.toggle("on", active);
        btn.setAttribute("aria-selected", String(active));
      }
      getById("recMilestonesPane").hidden = tab !== "milestones";
      getById("recChroniclePane").hidden = tab !== "chronicle";
      getById("recCodexPane").hidden = tab !== "codex";

      let bossKills = Object.values(stats.bosses).reduce((sum, count) => sum + count, 0),
        cells = [
          ["Runs", stats.runs],
          ["Best wave", stats.bestWave || "\u2014"],
          ["Clears", stats.clears],
          ["Kills", formatCount(stats.kills)],
          ["Bosses felled", bossKills],
          ["Highest trial", stats.bestClearThreat >= 0 ? threatLevels[stats.bestClearThreat].name : "\u2014"],
          ["Time played", formatTime(stats.playTime)],
          ["Fastest clear", stats.bestTime > 0 ? formatTime(stats.bestTime) : "\u2014"],
          ["Shards earned", formatCount(stats.shardsEarned)],
        ];
      getById("statGrid").innerHTML = cells
        .map(
          ([label, value]) =>
            `<div class="cell"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`,
        )
        .join("");

      const readyIds = this.g.claimable(),
        readySet = new Set(readyIds),
        totalReadyReward = readyIds.reduce((sum, id) => sum + (milestones.find((m) => m.id === id)?.reward || 0), 0),
        claimAllBtn = getById("claimAllBtn");
      if (claimAllBtn) {
        claimAllBtn.hidden = readyIds.length < 1;
        claimAllBtn.innerHTML = `Claim All (${readyIds.length}) \xB7 <span class="shard-ico"></span>${formatCount(totalReadyReward)}`;
      }
      const ordered = [...milestones].sort((a, b) => {
        const rank = (m) => (readySet.has(m.id) ? 0 : save.milestones[m.id] ? 2 : 1);
        return rank(a) - rank(b);
      });
      let list = getById("msList");
      list.innerHTML = ordered
        .map((ms) => {
          let done = !!save.milestones[ms.id],
            ready = readySet.has(ms.id),
            action = done
              ? `<span class="chip">${iconSvg("check")}DONE</span>`
              : ready
                ? `<button class="btn buy" data-claim="${ms.id}"><span class="shard-ico"></span>${ms.reward}</button>`
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
      if (tab === "codex") {
        this.renderCodex();
      }
    }
    renderCodex() {
      const box = getById("codexList");
      if (!box) return;
      const save = this.save,
        sub = this.codexTab || "areas";
      for (const btn of document.querySelectorAll("#codexSubtabs [data-codex-tab]")) {
        btn.classList.toggle("on", btn.dataset.codexTab === sub);
      }
      if (sub === "areas") {
        box.innerHTML = biomeList
          .map((biome) => {
            const bossId = bossByBiome[biome.id],
              boss = bossDefs[bossId],
              kills = save.stats.bosses?.[bossId] || 0,
              medal = save.stats.medals?.[bossId],
              medalText = medal
                ? `${MEDAL_NAMES[medal.medal] || "Medal"} (${medal.secs}s)`
                : kills
                  ? `${kills} felled`
                  : "Unbeaten";
            return `<div class="codex-card"><div class="codex-head"><b>${escapeHtml(biome.name)}</b><span class="codex-tag">${escapeHtml(biome.tag || "Area")}</span></div><p>${escapeHtml(RL_BIOME_CARD[biome.id] || "")}</p><div class="codex-meta">Boss: ${escapeHtml(boss ? boss.name : "\u2014")} \xB7 ${escapeHtml(medalText)}</div></div>`;
          })
          .join("");
      } else if (sub === "enemies") {
        const bossCards = Object.entries(bossDefs)
          .map(([id, b]) => {
            const kills = save.stats.bosses?.[id] || 0,
              medal = save.stats.medals?.[id],
              meta = medal
                ? `${kills} felled \xB7 Best ${MEDAL_NAMES[medal.medal]} (${medal.secs}s)`
                : kills
                  ? `${kills} felled`
                  : "Awaiting challenge";
            return `<div class="codex-card"><div class="codex-head"><b>${escapeHtml(b.name)}</b><span class="codex-tag">Boss</span></div><p>${escapeHtml(b.title)}</p><div class="codex-meta">${escapeHtml(meta)}</div></div>`;
          })
          .join("");
        const foeCards = Object.entries(enemyDefs)
          .map(([id, e]) => {
            const seen = !!save.seen["tip_enemy_" + id] || save.stats.kills > 0;
            const tip = RL_ENEMY_TIPS[id] || "Hostile construct roaming the areas.";
            return `<div class="codex-card${seen ? "" : " undiscovered"}"><div class="codex-head"><b>${escapeHtml(e.name)}</b><span class="codex-tag">Enemy</span></div><p>${escapeHtml(tip)}</p></div>`;
          })
          .join("");
        box.innerHTML = bossCards + foeCards;
      } else {
        const evos = upgradeList.filter((u) => u.evo);
        box.innerHTML = evos
          .map((u) => {
            const recipe = Object.entries(u.evo)
              .map(([reqId, lv]) => `${upgradesById[reqId]?.name || reqId} Lv ${lv}`)
              .join(" + ");
            const wTag = u.weapon && weaponDefs[u.weapon] ? weaponDefs[u.weapon].name : "Any Weapon";
            return `<div class="codex-card"><div class="codex-head"><b>${escapeHtml(u.name)}</b><span class="codex-tag">${escapeHtml(wTag)}</span></div><p>${escapeHtml(u.desc(0))}</p><div class="codex-meta">Requires: ${escapeHtml(recipe)}</div></div>`;
          })
          .join("");
      }
    }
    claim(id) {
      let save = this.save,
        ms = milestones.find((milestone) => milestone.id === id);
      if (!(!ms || save.milestones[id] || !ms.test(save))) {
        save.milestones[id] = true;
        save.shards += ms.reward;
        this.g.store.save("claim");
        this.g.sound.play("milestone");
        this.toast(`${ms.name}: +${ms.reward} shards`, "gold");
        this.renderRecords();
      }
    }
    claimAll() {
      const save = this.save,
        ready = this.g.claimable();
      if (!ready.length) return;
      let total = 0;
      for (const id of ready) {
        const ms = milestones.find((m) => m.id === id);
        if (ms && !save.milestones[id]) {
          save.milestones[id] = true;
          save.shards += ms.reward;
          total += ms.reward;
        }
      }
      this.g.store.save("claim-all");
      this.g.sound.play("milestone");
      this.toast(`Claimed ${ready.length} milestones: +${formatCount(total)} shards`, "gold");
      this.renderRecords();
    }
    // the What's new tab: opening it marks this version's notes as read (the badge on the home screen goes away)

    renderNews() {
      getById("newsList").innerHTML = WHATS_NEW.map(
        (entry, i) =>
          `<article class="news-card"><div class="news-card-head"><span class="news-ver">v${escapeHtml(entry.version)}${i === 0 ? " · Latest" : ""}</span><h3>${escapeHtml(entry.title)}</h3></div><ul class="news-list">${entry.items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></article>`,
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
      getById("setNumbers").checked = settings.numbers;
      this.renderPerformanceSetting();
      if (getById("setMuted")) getById("setMuted").checked = !!settings.muted;
      const masterVal = settings.master ?? 1;
      if (getById("setMaster")) {
        getById("setMaster").value = masterVal;
        this._setRangeFill?.(getById("setMaster"));
      }
      if (getById("setMasterV")) getById("setMasterV").textContent = Math.round(masterVal * 100) + "%";
      getById("setSfx").value = settings.sfx;
      getById("setMusic").value = settings.music;
      getById("setAmb").value = settings.ambience;
      this._setRangeFill?.(getById("setSfx"));
      this._setRangeFill?.(getById("setMusic"));
      this._setRangeFill?.(getById("setAmb"));
      if (getById("setSfxV")) getById("setSfxV").textContent = Math.round(settings.sfx * 100) + "%";
      if (getById("setMusicV")) getById("setMusicV").textContent = Math.round(settings.music * 100) + "%";
      if (getById("setAmbV")) getById("setAmbV").textContent = Math.round(settings.ambience * 100) + "%";
      const upBtn = getById("updateReadyBtn");
      if (upBtn) upBtn.hidden = !this.g.pendingUpdate;
      for (let btn of getById("setFrameRate").querySelectorAll("button")) {
        const active = +btn.dataset.v === settings.frameRate;
        btn.classList.toggle("on", active);
        btn.setAttribute("aria-pressed", String(active));
      }
      getById("storageWarn").hidden = this.g.store.storageOk;
      getById("storageWarnText").textContent = this.g.store.held
        ? "Previous save kept unread because storage is full; progress is not saved."
        : "Storage is blocked in this browser.";
      const corruptRow = getById("corruptSettingsRow");
      if (corruptRow) corruptRow.hidden = this.g.store.listBackups().length === 0;
      getById("verText").textContent = `v${GAME_VERSION}`;
      const ownLayout =
        !!settings.hudLayout || settings.stickFixed || settings.stickSize !== 1 || settings.hudAlpha !== 1;
      getById("hudLayoutNote").textContent = ownLayout
        ? "Your own layout is active."
        : "Move and resize the touch buttons and sticks.";
    }
    renderPerformanceSetting() {
      const on = this.save.settings.performanceOverlay;
      getById("setPerformance").checked = on;
      getById("performanceSettingStatus").textContent = on
        ? this.rlFromPause
          ? "On. FPS and CPU time appear when you resume."
          : "On. FPS and CPU time appear during play."
        : "Off. Show FPS and CPU time during play.";
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
        for (const sib of document.querySelectorAll("#app > .screen, #hud, #hudEdit")) sib.inert = true;
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
      for (const sib of document.querySelectorAll("#app > .screen, #hud, #hudEdit")) sib.inert = false;
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
      const hud = getById("hud");
      let box = getById("toasts");
      if (!getById("settings").hidden) box = getById("settingsNotices");
      else if (!getById("choose").hidden) box = getById("chooseNotices");
      else if (!hud.hidden && hud.style.visibility !== "hidden" && !this.g.paused && !hud.classList.contains("editing"))
        box = getById("hudNotices");
      const el = document.createElement("div");
      el.className = "toast " + cls;
      el.style.animationDuration = ms + "ms";
      el.textContent = text;
      if (box.id === "toasts") {
        box.appendChild(el);
        if (box.children.length > 3) box.firstChild.remove();
      } else {
        box.replaceChildren(el);
      }
      setTimeout(() => el.remove(), ms + 50);
    }
    banner(big, small, cls = "", ms = 2200) {
      let el = getById("banner");
      el.innerHTML = `<div class="bn ${cls}" style="animation-duration:${ms}ms"><div class="big">${escapeHtml(big)}</div><div class="small">${escapeHtml(small || "")}</div></div>`;
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
      getById("hudFeedback").appendChild(el);
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
      getById("hudNotices").replaceChildren();
      this.comboPopEl?.remove();
      window.__riftUpdateDeviceProfile?.();
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
        biomeId = world.arena?.biome?.id || "",
        hp = Math.max(0, Math.ceil(player.hp));
      update("biome", biomeId, (id) => {
        setBiomeTheme(id);
      });
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
        requestAnimationFrame(() => bar.classList.add("heal"));
      }
      cache.hpVal = player.hp;
      this.buffs(world);
      update("low", player.alive && hpFrac < 0.25, (low) => {
        getById("vignette").classList.toggle("low", low);
      });
      update("shards", world.shards, (shards) => {
        getById("runShards").textContent = formatCount(shards);
        let chip = getById("shardChip");
        if (cache.shardsSeen) {
          let now = performance.now();
          if (now - (cache.shardBump || 0) > 450) {
            cache.shardBump = now;
            chip.classList.remove("bump");
            requestAnimationFrame(() => chip.classList.add("bump"));
          }
        }
        cache.shardsSeen = true;
      });
      let waveMax = world.endless ? "" : "/" + 20;
      update("wave", world.wave + waveMax, () => {
        getById("waveLabel").textContent = `Wave ${world.wave}${waveMax}`;
      });
      let sub = world.state === "cleared" ? "Cleared" : "";
      update("sub", sub, (text) => {
        getById("waveSub").textContent = text;
      });
      let showProg = world.state === "fight" && !world.boss && !world.bossPending && world.planTotal > 0;
      update("progOn", showProg, (on) => {
        getById("waveProg").hidden = !on;
      });
      let foesLeft = 0;
      if (showProg) {
        foesLeft = world.enemies.length + world.markers.length;
        for (let i = world.planIdx; i < world.plan.length; i++) {
          const group = world.plan[i];
          foesLeft += group.members.length - (group.placed || 0);
        }
        let progress = clamp(1 - foesLeft / Math.max(world.planTotal, foesLeft), 0, 1);
        update("prog", Math.round(progress * 50), () => {
          getById("waveProgFill").style.transform = `scaleX(${progress})`;
        });
      }
      update("timer", Math.floor(world.time), (secs) => {
        const el = getById("hudTimer");
        if (el) el.textContent = formatTime(secs);
      });
      update("enemies", showProg ? foesLeft : -1, (n) => {
        const el = getById("hudFoes");
        if (!el) return;
        el.hidden = n <= 0;
        if (n > 0) el.textContent = `${n} left`;
      });
      update("autoPill", !!this.save.settings.autoFire, (on) => {
        const el = getById("hudAutoPill");
        if (el) el.hidden = !on;
      });
      let boss = world.boss || (world.champion && !world.champion.dead ? world.champion : null);
      update("bossOn", !!boss, (on) => {
        getById("bossBar").hidden = !on;
      });
      if (boss) {
        update("bossName", boss.type + (boss.enraged ? "!" : "") + (boss.champion ? "c" : ""), () => {
          getById("bossName").textContent = boss.champion
            ? `${enemyDefs[boss.type].name} Champion`
            : bossDefs[boss.type].name;
        });
        const phase = boss.openT > 0 ? "Open" : boss.enraged ? `Phase ${boss.phaseN}` : boss.champion ? "Rallying" : "";
        update("bossPhase", phase, (text) => {
          getById("bossPhase").textContent = text;
        });
        update("bossF", Math.round((boss.hp / boss.maxHp) * 100), (value) => {
          getById("bossFill").style.transform = `scaleX(${clamp(value / 100, 0, 1)})`;
          getById("bossLag").style.transform = `scaleX(${clamp(value / 100, 0, 1)})`;
        });
        update("bossTicks", boss.champion ? "champ" : boss.type, (type) => {
          getById("bossTicks").innerHTML =
            type === "champ"
              ? ""
              : type === "starHeart"
                ? '<s style="left:66%"></s><s style="left:33%"></s>'
                : '<s style="left:50%"></s>';
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
        const comboMax = 2.2 + 0.5 * (stats.surge || 0);
        update("comboT", Math.round((world.comboT / comboMax) * 44), (value) => {
          getById("comboBar").style.transform = `scaleX(${clamp(value / 44, 0, 1)})`;
        });
      }
      const dashN = player.dashN | 0,
        dashMax = Math.max(1, stats.dashCharges | 0);
      update("dashPips", dashN + "/" + dashMax, () => {
        const pips = getById("dashPips"),
          btn = getById("dashBtn");
        if (pips) {
          pips.hidden = dashMax <= 1;
          while (pips.children.length < dashMax) {
            pips.appendChild(document.createElement("i"));
          }
          while (pips.children.length > dashMax) {
            pips.lastChild.remove();
          }
          for (let i = 0; i < pips.children.length; i++) {
            pips.children[i].classList.toggle("on", i < dashN);
          }
        }
        btn.classList.toggle("multi", dashMax > 1);
        btn.setAttribute("aria-label", dashMax > 1 ? `Dash, ${dashN} of ${dashMax} ready` : "Dash");
      });
      let dashPct = dashN >= dashMax || !(stats.dashCd > 0) ? 0 : Math.round((player.dashCdT / stats.dashCd) * 20) * 5;
      // 3.45.0: the ring (and the dimmed tint) say the cooldown - the per-decisecond seconds text is gone
      update("dash", dashPct + ":" + (dashN <= 0 ? 1 : 0), () => {
        let btn = getById("dashBtn");
        btn.style.setProperty("--q", 100 - dashPct + "%");
        let cooling = dashN <= 0 && dashPct > 0;
        if (btn.classList.contains("cooling") && !cooling) {
          btn.classList.remove("pop");
          requestAnimationFrame(() => btn.classList.add("pop"));
          if (world.state === "fight") {
            this.g.sound.play("ready");
          }
        }
        btn.classList.toggle("cooling", cooling);
      });
      let fireBurst = Math.floor(player.fireBurst / 5) * 5;
      update("fireBurst", fireBurst, (pct) => {
        getById("fireBurstBtn").style.setProperty("--p", pct + "%");
        getById("fireBurstBtn").classList.toggle("ready", pct >= 100);
      });
      // 3.0.0: gadget charges as pips, recharge ring from gadgetT/gadgetCd
      const gadgetN = player.gadgetN | 0,
        gadgetMax = stats.gadgetMax | 0;
      update("gravityBellPips", gadgetN + "/" + gadgetMax, () => {
        const pips = getById("gravityBellPips");
        while (pips.children.length < gadgetMax) {
          pips.appendChild(document.createElement("i"));
        }
        while (pips.children.length > gadgetMax) {
          pips.lastChild.remove();
        }
        for (let i = 0; i < pips.children.length; i++) {
          pips.children[i].classList.toggle("on", i < gadgetN);
        }
        const btn = getById("gravityBellBtn");
        btn.classList.toggle("empty", gadgetN <= 0);
        btn.setAttribute("aria-label", `Throw Gravity Bell, ${gadgetN} of ${gadgetMax} ready`);
      });
      const gadgetPct =
        gadgetN >= gadgetMax || !(stats.gadgetCd > 0)
          ? 100
          : Math.round(clamp(1 - player.gadgetT / stats.gadgetCd, 0, 1) * 20) * 5;
      update("gadgetRing", gadgetPct, (pct) => {
        let btn = getById("gravityBellBtn");
        // 3.45.0: the pips say how many charges are ready - the ring only speaks while one recharges
        btn.querySelector(".ring").hidden = pct >= 100;
        btn.style.setProperty("--q", pct + "%");
      });
    }
    buffs(world) {
      let player = world.player,
        stats = world.stats,
        chips = [];
      if (player.onIce && world.state === "fight") {
        chips.push(["ice", "ICE", "#bff4ff", -1]);
      }
      if (player.inAcid && world.state === "fight") {
        chips.push(["acid", "ACID", "#86f8ba", -1]);
      }
      if (player.inDevil && world.state === "fight") {
        chips.push(["devil", "WHIRLWIND", "#ffe9c4", -1]);
      }
      if (player.corrodeT > 0) {
        chips.push(["corrode", "CORRODED", "#86f8ba", player.corrodeT / 2.2]);
      }
      if (player.singeT > 0) {
        chips.push(["singe", "SINGED", "#ff9d5c", player.singeT / 2.0]);
      }
      if (player.dazeT > 0) {
        chips.push(["daze", "DAZED", "#ffe59e", player.dazeT / 1.5]);
      }
      if (player.slowT > 0) {
        if (player.slowKind === "shock") chips.push(["shock", "SHOCKED", "#ffe98a", player.slowT / 0.9]);
        else if (player.slowKind === "acid") chips.push(["acidSlow", "SLOWED", "#86f8ba", player.slowT / 1.4]);
        else if (player.slowKind === "burn") chips.push(["burnSlow", "BURNED", "#ff9d5c", player.slowT / 1.2]);
        else if (player.slowKind === "glass") chips.push(["glassSlow", "GLARED", "#ffe59e", player.slowT / 1.3]);
        else chips.push(["chill", "CHILLED", "#aee8ff", player.slowT / 1.6]);
      }
      if (stats.killStreak && player.rushN > 0) {
        chips.push(["rush", `HASTE \xD7${player.rushN}`, "#f08e70", player.rushT / 4]);
      }
      if (player.grazeT > 0) {
        chips.push(["graze", "PERFECT GRAZE", "#ffd872", player.grazeT / 1.5]);
      }
      if (world.chronoT > 0) {
        chips.push(["timeDash", "SLOW TIME", "#bacfd9", world.chronoT / 1.1]);
      }
      if ((world.ws.revive || 0) > 0 && !world.revived) {
        chips.push(["life", "SECOND CHANCE", "#abd397", -1]);
      }
      if (world.barrierT > 0) {
        chips.push(["barrier", "SHIELD", "#b5dcdc", world.barrierT / Math.max(1, stats.barrierT || 1)]);
      }
      if (world.attuned && world.state === "fight") {
        chips.push(["attune", "TRAP BOOST", "#ffb86b", -1]);
      }
      if (world.event && world.state === "fight") {
        chips.push(["event", waveEvents[world.event].name, world.event === "goldCart" ? "#ffc84a" : "#a7d1bf", -1]);
      }
      for (const [id, level] of Object.entries(world.mods || {}))
        if (MUTATORS[id])
          chips.push([
            "mut-" + id,
            MUTATORS[id].name.toUpperCase() + (level > 1 ? " " + "I".repeat(level) : ""),
            MUTATORS[id].color,
            -1,
          ]);
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
      const on = world.state === "fight" && player.alive,
        want = [];
      if (on && stats.heatSink && player.heatT > 0) {
        want.push(["heat", "FIRE RATE+", "#ff8a3d", player.heatT / 4.5]);
      }
      if (on && stats.slip && player.slipT > 0) {
        want.push(["slip", "DASH BOOST", "#a7d1bf", player.slipT / 1.0]);
      }
      if (on && player.tributeT > 0) {
        want.push(["ingot", "POWER+", "#ffb86c", player.tributeT / 4.0]);
      }
      if (on && player.leylineT > 0) {
        want.push(["leyline", "STAR PATH", "#d6b8ff", -1]);
      }
      if (on && player.tractionT > 0) {
        want.push(["rime", "ICE GRIP", "#9cf4ff", player.tractionT / 3.8]);
      }
      if (on && player.hopT > 0) {
        want.push(["spore", "SPEED HOP", "#9cf8ae", player.hopT / 2.8]);
      }
      if (on && player.gildT > 0) {
        want.push(["gild", "SHARD BOOST", "#ffd872", player.gildT / 3.2]);
      }
      if (on && player.festT > 0) {
        want.push(["fest", "STAR BOOST", "#e0b4ff", player.festT / 3.0]);
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
          if (el) {
            el.remove();
            timed.delete(id);
          }
        }
      }
      for (const [id, text, color, left] of want) {
        let el = live(id),
          fresh = false;
        if (!el) {
          el = document.createElement("span");
          el.className = "buff";
          el.dataset.b = id;
          el.style.setProperty("--bc", color);
          el.textContent = text;
          if (left >= 0) {
            const bar = document.createElement("i");
            el.appendChild(bar);
            el._bar = bar;
          }
          row.appendChild(el);
          fresh = true;
        }
        timed.set(id, el);
        const step = Math.round(clamp(left, 0, 1) * 20);
        if (fresh || this.hudCache["buff" + id] !== step) {
          this.hudCache["buff" + id] = step;
          if (el._bar) {
            el._bar.style.transform = `scaleX(${step / 20})`;
          }
        }
      }
    }
    showChoose(world) {
      this.banishMode = false;
      getById("chooseNotices").replaceChildren();
      let bossReward = world.offerBoss;
      getById("chooseEyebrow").textContent = bossReward
        ? `${bossDefs[world.bossKills[world.bossKills.length - 1]] ? bossDefs[world.bossKills[world.bossKills.length - 1]].name : "Boss"} Defeated`
        : `Wave ${world.wave} Cleared`;
      getById("chooseTitle").textContent = bossReward ? "Choose a Boss Reward" : "Choose a Craft";
      getById("chooseFirstHint").hidden = bossReward || world.wave !== 1;
      let hpFrac = clamp(world.player.hp / world.stats.maxHp, 0, 1);
      getById("chooseHp").style.transform = `scaleX(${hpFrac})`;
      getById("chooseHpNum").textContent = `${Math.ceil(world.player.hp)}/${world.stats.maxHp}`;
      this.renderNextWave(world);
      this.coverHud(true);
      getById("choose").hidden = false;
      this.renderCards(world, { resetScroll: true });
    }
    renderNextWave(world) {
      const box = getById("nextWave");
      if (!box) return;
      const next = world.previewWave(world.wave + 1),
        chips = [[`Wave ${next.wave}`, ""]];
      if (next.newBiome) chips.push([`Entering ${biomesById[next.biome].name}`, "biome"]);
      if (next.boss) chips.push([`Boss \u00b7 ${bossDefs[next.boss] ? bossDefs[next.boss].name : next.boss}`, "boss"]);
      if (next.event && waveEvents[next.event]) chips.push([waveEvents[next.event].name, "event"]);
      if (next.mutator && MUTATORS[next.mutator]) chips.push([`Modifier \u00b7 ${MUTATORS[next.mutator].name}`, "mut"]);
      if (next.traps) chips.push(["Arena traps active", ""]);
      box.innerHTML = chips.map(([text, cls]) => `<span class="nw ${cls}">${escapeHtml(text)}</span>`).join("");
    }
    updateChooseScrollHint() {
      if (!touchInput) return;
      const cards = getById("cards");
      const hint = getById("chooseScrollHint");
      const width = cards.clientWidth;
      const max = cards.scrollWidth - width;
      const hidden = width === 0 || max <= 1;
      if (hint.hidden !== hidden) hint.hidden = hidden;
      if (hidden) return;
      const left = cards.scrollLeft > 1;
      const right = cards.scrollLeft < max - 1;
      const text = `${left ? "← " : ""}Swipe for more${right ? " →" : ""}`;
      if (hint.textContent !== text) hint.textContent = text;
    }
    restoreChooseScroll() {
      getById("cards").scrollTo(this.chooseScroll);
      this.updateChooseScrollHint();
    }
    resumeChoose() {
      getById("choose").hidden = false;
      this.restoreChooseScroll();
      this.coverHud(true);
    }
    renderCards(world, { resetScroll = false } = {}) {
      const tierCrests = ["", "\u25c7", "\u25c6", "\u25c8", "\u2605", "\u2726", "\u265b"];
      const cards = getById("cards");
      this.chooseScroll = resetScroll ? { left: 0, top: 0 } : { left: cards.scrollLeft, top: cards.scrollTop };
      const sealButton = getById("sealBtn");
      sealButton.hidden = !(world.ws.seal > 0 || world.banishes > 0);
      sealButton.disabled = world.banishes <= 0 || world.offer.length < 2;
      if (sealButton.disabled) this.banishMode = false;
      sealButton.classList.toggle("on", this.banishMode);
      sealButton.setAttribute("aria-pressed", String(this.banishMode));
      getById("sealTxt").textContent = `Seal (${world.banishes})`;
      cards.classList.toggle("banishing", this.banishMode);
      cards.innerHTML = world.offer
        .map((id) => {
          let up = upgradesById[id],
            level = world.up[id] || 0,
            crest = tierCrests[up.rarity] || "",
            tierName = (rarityNames[up.rarity] || "").toUpperCase(),
            tag = up.boss
              ? `${crest} ${bossDefs[up.boss] ? bossDefs[up.boss].name.toUpperCase() : "BOSS"} \xB7 BOSS REWARD`
              : up.evo
                ? `${crest} MASTER CRAFT`
                : up.repeat
                  ? `${crest} ${tierName}`
                  : level
                    ? `${crest} ${tierName} \xB7 LV ${level}\u2192${level + 1}`
                    : `${crest} NEW \xB7 ${tierName}`,
            evo = this.evoHint(up, world),
            delta = this.statDelta(id, world);
          const seal = up.boss ? `<span class="seal" aria-hidden="true">${iconSvg("star")}</span>` : "";
          const protectedReward = this.banishMode && world.offerBoss && id === world.offerExclusive;
          return `<button class="card r${up.rarity}" data-pick="${id}"${protectedReward ? " disabled" : ""}>${seal}<span class="cico">${iconSvg(up.icon)}</span><span><span class="ctop"><b>${escapeHtml(up.name)}</b><span class="lv">${escapeHtml(tag)}</span></span><p>${escapeHtml(up.desc(level))}</p>${delta}${evo}</span></button>`;
        })
        .join("");
      for (let card of cards.querySelectorAll("[data-pick]")) {
        this.click(
          card,
          () => {
            if (this.banishMode) this.g.seal(card.dataset.pick);
            else this.g.choose(card.dataset.pick);
          },
          { sound: false },
        );
        // 2.7.0: a soft tick when the mouse moves over a card (touch has no hover)
        card.addEventListener("pointerenter", (ev) => {
          if (!touchInput && ev.pointerType === "mouse" && !card.disabled) this.g.sound.play("hover");
        });
      }
      getById("rerollTxt").textContent = `Reroll (${world.rerolls})`;
      getById("rerollBtn").disabled = world.rerolls <= 0;
      getById("buildStrip").innerHTML = this.buildHtml(world, true);
      if (getById("chooseUpInfo")) getById("chooseUpInfo").hidden = true;
      this.restoreChooseScroll();
    }
    statDelta(id, world) {
      let player = world.player,
        stats = world.stats;
      if (id === "heal") {
        let healed = Math.min(stats.maxHp, player.hp + stats.maxHp * 0.45);
        return `<small class="delta">HP ${Math.ceil(player.hp)} \u2192 ${Math.ceil(healed)}</small>`;
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
        if (lines.length >= 4) break;
      }
      return lines.length ? `<small class="delta">${escapeHtml(lines.join(" \xB7 "))}</small>` : "";
    }
    evoHint(up, world) {
      if (up.evo)
        return `<small class="evo-hint">Forges ${Object.keys(up.evo)
          .map((id) => escapeHtml(upgradesById[id].name))
          .join(" + ")}</small>`;
      let evos = upgradeList.filter(
        (evo) => evo.evo && evo.evo[up.id] && !world.up[evo.id] && (!evo.weapon || evo.weapon === world.weapon),
      );
      if (!evos.length) return "";
      evos.sort((a, b) => (b.weapon ? 1 : 0) - (a.weapon ? 1 : 0));
      return evos
        .slice(0, 2)
        .map((evo) => {
          let others = Object.keys(evo.evo)
              .filter((id) => id !== up.id)
              .map((id) => `${upgradesById[id].name}\u00a0${Math.min(world.up[id] || 0, evo.evo[id])}/${evo.evo[id]}`),
            mine = `${Math.min((world.up[up.id] || 0) + 1, evo.evo[up.id])}/${evo.evo[up.id]}`;
          return `<small class="evo-hint">\u2192 ${escapeHtml(evo.name)}: ${escapeHtml(up.name)}\u00a0${mine} \xB7 ${escapeHtml(others.join(", "))}</small>`;
        })
        .join("");
    }
    hideChoose() {
      getById("choose").hidden = true;
      if (getById("chooseUpInfo")) getById("chooseUpInfo").hidden = true;
      this.coverHud(false);
    }
    showAnvil(world) {
      const box = getById("anvil");
      if (world.state !== "anvil") return;
      const next = world.previewWave(world.wave + 1),
        nextBiome = biomesById[next.biome];
      getById("anvilEyebrow").textContent = nextBiome ? `Ahead · ${nextBiome.name}` : "Between Areas";
      getById("anvilShards").textContent = formatCount(world.shards);
      const hpFrac = clamp(world.player.hp / world.stats.maxHp, 0, 1);
      getById("anvilHp").style.transform = `scaleX(${hpFrac})`;
      getById("anvilHpNum").textContent = `${Math.ceil(world.player.hp)}/${world.stats.maxHp}`;
      const grid = getById("anvilOffers");
      grid.innerHTML = world.anvilOffers
        .map((offer, i) => {
          const disabled = offer.bought || !offer.available || world.shards < offer.cost;
          return `<div class="anvil-card${offer.bought ? " bought" : ""}"><b>${escapeHtml(offer.name)}<span class="kbd-hint" aria-hidden="true">${i + 1}</span></b><p>${escapeHtml(offer.desc)}</p><button class="btn buy small" data-anvil="${i}" ${disabled ? "disabled" : ""}>${offer.bought ? "FORGED" : `<span class="shard-ico"></span>${offer.cost}`}</button></div>`;
        })
        .join("");
      for (const btn of grid.querySelectorAll("[data-anvil]")) {
        this.click(btn, () => this.g.buyAnvil(+btn.dataset.anvil));
      }
      this.coverHud(true);
      box.hidden = false;
    }
    hideAnvil() {
      const box = getById("anvil");
      if (box) box.hidden = true;
      this.coverHud(false);
    }
    coverHud(on) {
      getById("hud").style.visibility = on ? "hidden" : "";
      if (on) {
        getById("hudNotices").replaceChildren();
        this.comboPopEl?.remove();
        getById("performanceOverlay").hidden = true;
        getById("banner").innerHTML = "";
        clearTimeout(this.bannerT);
        this.clearTitleCard();
      }
    }
    buildHtml(world, interactive = false) {
      let own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat);
      if (!own.length) return '<span class="note">No crafts yet.</span>';
      return own
        .map((upgrade) => {
          const cnt = world.up[upgrade.id] > 1 ? " \xD7" + world.up[upgrade.id] : "";
          if (interactive) {
            return `<button type="button" class="bi r${upgrade.rarity}" data-up="${upgrade.id}" aria-pressed="false" title="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${cnt}</button>`;
          }
          return `<span class="bi r${upgrade.rarity}" title="${escapeHtml(upgrade.name)}">${iconSvg(upgrade.icon)}${escapeHtml(upgrade.name)}${cnt}</span>`;
        })
        .join("");
    }
    showPause(world) {
      getById("pauseTitle").textContent = `Wave ${world.wave}${world.endless ? " \xB7 Endless" : ""}`;
      getById("abandonBtn").textContent = "Abandon run";
      getById("pauseStats").innerHTML =
        `<span>${formatTime(world.time)}</span><span>${formatCount(world.kills)} KILLS</span><span>${formatCount(world.shards)} SHARDS</span><span>${TRAP_MODE_NAMES[world.trapMode]}</span>`;
      this.renderStatRows(world);
      this.coverHud(true);
      getById("pause").hidden = false;
      this.screen = "pause";
      // 2.4.2: the build in the pause menu explains each craft on tap or click
      const own = upgradeList.filter((upgrade) => world.up[upgrade.id] && !upgrade.repeat),
        info = getById("pauseUpInfo");
      getById("pauseCrafts").hidden = !own.length;
      getById("pauseBuild").innerHTML = own.length ? this.buildHtml(world, true) : "";
      info.innerHTML = '<p class="note">Select a craft to see what it does.</p>';
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
      const overEl = getById("over");
      overEl.classList.toggle("is-win", !!result.win);
      overEl.classList.toggle("is-lose", !result.win);
      const rules = `${threatLevels[result.threat].name} · ${TRAP_MODE_NAMES[result.trapMode]}`;
      getById("overEyebrow").textContent = result.win
        ? `${rules} · All ${20} Waves`
        : `${result.endless ? "Endless · " : ""}${weaponDefs[result.weapon].name} · ${rules}`;
      let title = getById("overTitle");
      title.textContent = result.win ? "Victory" : result.abandoned ? "Expedition Ended" : "Fallen";
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
      getById("endlessBtn").hidden = !result.canEndless;
      getById("retryBtn").hidden = false;
      getById("retryBtn").classList.toggle("primary", !result.canEndless);
      overEl.hidden = false;
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
    /* 3.21.0: the recap of a lost run: who hit the artificer last, with what and how long before the end, and where most of the
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
      if (el._countRaf) cancelAnimationFrame(el._countRaf);
      let start = performance.now(),
        duration = 900,
        step = (now) => {
          let k = clamp((now - start) / duration, 0, 1);
          el.textContent = formatCount(Math.round(total * (1 - Math.pow(1 - k, 3))));
          if (k < 1) {
            el._countRaf = requestAnimationFrame(step);
          } else {
            el._countRaf = 0;
          }
        };
      el._countRaf = requestAnimationFrame(step);
    }
    showCrash(log) {
      for (let id of ["choose", "anvil", "pause", "over"]) {
        const el = getById(id);
        if (el) el.hidden = true;
      }
      this.showHud(false);
      getById("crashLog").value = log;
      getById("crash").hidden = false;
    }
    hideCrash() {
      getById("crash").hidden = true;
    }
    actionFlash(action, kind) {
      const btn = getById(action + "Btn");
      btn.classList.remove(kind);
      requestAnimationFrame(() => btn.classList.add(kind));
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
// HUD chips for timed upgrades and biome effects, managed next to the chips of GameUI.buffs.
const timedBuffChips = ["heat", "slip", "ingot", "leyline", "rime", "spore", "gild", "fest"];
function closePauseSettings(ui) {
  ui.rlFromPause = false;
  getById("settings").hidden = true;
  getById("settings").classList.remove("in-run");
}

const RL_BIOME_CARD = {
  lanternYard: "Shoot a charging bell to stun enemies. Shooting a mine clears it safely.",
  snowRidge: "Ice patches make you slide.",
  mossBog: "Acid pools weaken enemies and hurt you.",
  starHall: "Portals carry you and your shots across the hall.",
  emberHill: "Glowing vents warn before they erupt.",
  sunDunes: "Whirlwinds pull you off course.",
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

// The card starts after the next frame is on screen: the first frame of a new arena or boss can
// take long on slow devices (shader compiles), and the card must not run out during that stall.
function showTitleCard(ui, html, ms) {
  const el = getById("titleCard"),
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
