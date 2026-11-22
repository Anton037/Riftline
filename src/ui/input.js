// Keyboard, mouse, and touch input (Input).

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";
import { game } from "../main.js";
import { getById } from "./ui.js";

function initialTouchInput() {
  if (typeof matchMedia !== "function") return false;
  return (
    matchMedia("(pointer: coarse)").matches ||
    (matchMedia("(any-pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches)
  );
}

// The active input mode (touch vs keyboard/mouse), used for hints and PC badges.
const RL_INPUT = { touch: initialTouchInput() };

function setTouchInput(touch) {
  RL_INPUT.touch = !!touch;
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("input-touch", RL_INPUT.touch);
  }
}

setTouchInput(RL_INPUT.touch);

const Input = class {
  constructor(layer, renderer) {
    this.layer = layer;
    this.r = renderer;
    this.move = newStick();
    this.aim = newStick();
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.pending = { dash: false, nova: false, gadget: false };
    this.R = 56;
    // the stick size of the player (times the default radius) and, with a fixed move stick, where it sits
    // (a function that returns its centre in px, see ui/hud-layout.js; null: the stick starts where the thumb does)
    this.stickScale = 1;
    this.fixedMove = null;
    this.enabled = true;
    this.onPause = null;
    this.onBlur = null;
    this.isPlaying = null;
    this.usedMove = false;
    this.usedAim = false;
    this.showReticle = false;
    this.manualAim = false;
    this._rawId = -1;
    this._rawX = NaN;
    this._rawY = NaN;
    setTouchInput(RL_INPUT.touch);
    this.bind();
  }
  bind() {
    let layer = this.layer;
    layer.addEventListener("pointerdown", (ev) => this.down(ev));
    if ("onpointerrawupdate" in window) {
      layer.addEventListener("pointerrawupdate", (ev) => this.moveEv(ev));
    }
    layer.addEventListener("pointermove", (ev) => this.moveEv(ev));
    layer.addEventListener("pointerup", (ev) => this.up(ev));
    layer.addEventListener("pointercancel", (ev) => this.cancel(ev));
    layer.addEventListener("lostpointercapture", (ev) => this.cancel(ev));
    layer.addEventListener("contextmenu", (ev) => ev.preventDefault());
    window.addEventListener("keydown", (ev) => this.key(ev, true));
    window.addEventListener("keyup", (ev) => this.key(ev, false));
    window.addEventListener("blur", () => {
      this.reset(true);
      if (this.onBlur) {
        this.onBlur();
      }
    });
    window.addEventListener("mousemove", (ev) => {
      if (Number.isFinite(ev.clientX)) {
        this.mouse.x = ev.clientX;
      }
      if (Number.isFinite(ev.clientY)) {
        this.mouse.y = ev.clientY;
      }
      if (ev.isTrusted && !RL_INPUT.touch) {
        this.showReticle = true;
      }
    });
    window.addEventListener("mouseup", (ev) => {
      if (ev.button === 0 || (ev.buttons & 1) === 0) {
        this.mouse.down = false;
        this.manualAim = this.aim.active;
      }
    });
  }
  zoneIsMove(x) {
    let rect = this.layer.getBoundingClientRect(),
      middle = rect.left + (rect.width || this.layer.clientWidth || window.innerWidth) * 0.5;
    return x < middle;
  }
  down(ev) {
    RL_RT.pointerdown++;
    if (ev.isTrusted && (ev.pointerType !== "mouse" || ev.button === 0)) setTouchInput(ev.pointerType !== "mouse");
    if (!this.enabled) return;
    ev.preventDefault();
    if (ev.pointerType === "mouse") {
      if (ev.button === 0) {
        this.mouse.down = true;
        this.manualAim = true;
        this.showReticle = true;
      }
      if (Number.isFinite(ev.clientX)) this.mouse.x = ev.clientX;
      if (Number.isFinite(ev.clientY)) this.mouse.y = ev.clientY;
      return;
    }
    this.showReticle = false;
    let isMove = this.zoneIsMove(ev.clientX),
      stick = isMove ? this.move : this.aim;
    if (stick.active && stick.id !== ev.pointerId) {
      // A stationary thumb still owns its stick while the browser holds pointer capture.
      if (this.layer.hasPointerCapture(stick.id) || performance.now() - (stick.lastEv || 0) < 2500) return;
      try {
        this.layer.releasePointerCapture(stick.id);
      } catch {}
    }
    // Dash belongs to its button/keys, not a second tap on the movement stick.
    stick.active = true;
    stick.id = ev.pointerId;
    stick.lastEv = performance.now();
    stick.ox = stick.x = ev.clientX;
    stick.oy = stick.y = ev.clientY;
    // a fixed move stick keeps its place; a touch anywhere on the move side steers from its centre
    if (isMove && this.fixedMove) {
      const center = this.fixedMove(this.radius());
      stick.ox = center.x;
      stick.oy = center.y;
    }
    try {
      this.layer.setPointerCapture(ev.pointerId);
    } catch {}
  }
  moveEv(ev) {
    let coalesced = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null,
      last = coalesced && coalesced.length ? coalesced[coalesced.length - 1] : ev,
      x = Number.isFinite(last.clientX) ? last.clientX : ev.clientX,
      y = Number.isFinite(last.clientY) ? last.clientY : ev.clientY,
      pid = last.pointerId ?? ev.pointerId ?? -1;
    if (ev.type === "pointermove" && this._rawId === pid && this._rawX === x && this._rawY === y) {
      return;
    }
    if (ev.type === "pointerrawupdate") {
      this._rawId = pid;
      this._rawX = x;
      this._rawY = y;
    }
    RL_RT.pointermove++;
    if (ev.pointerType === "mouse") {
      if (Number.isFinite(x)) {
        this.mouse.x = x;
      }
      if (Number.isFinite(y)) {
        this.mouse.y = y;
      }
      if (ev.isTrusted) {
        setTouchInput(false);
        this.showReticle = true;
      }
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (let stick of [this.move, this.aim]) {
      if (!stick.active || stick.id !== pid) continue;
      stick.lastEv = performance.now();
      stick.x = x;
      stick.y = y;
      // 2.6.0: the stick stays where the finger touched down. Before, its centre followed the
      // finger once it was dragged further than 1.25 radii; the knob is clamped when drawn and
      // sample() caps the strength at 1.
    }
  }
  up(ev) {
    RL_RT.pointerup++;
    if (ev.pointerType === "mouse") {
      if (ev.button === 0 || (ev.buttons & 1) === 0) {
        this.mouse.down = false;
        this.manualAim = this.aim.active;
      }
      return;
    }
    for (let stick of [this.move, this.aim]) {
      if (stick.active && stick.id === ev.pointerId) {
        stick.active = false;
      }
    }
    this.manualAim = this.aim.active || this.mouse.down;
  }
  cancel(ev) {
    RL_RT.pointercancel++;
    if (ev.pointerType === "mouse") {
      this.mouse.down = false;
      this.manualAim = this.aim.active;
      return;
    }
    for (let stick of [this.move, this.aim]) {
      if (stick.active && stick.id === ev.pointerId) {
        stick.active = false;
      }
    }
    this.manualAim = this.aim.active || this.mouse.down;
  }
  key(ev, down) {
    if (down && (ev.ctrlKey || ev.metaKey || ev.altKey)) return;
    // Letters are read by their physical position (ev.code), so WASD, E, Q, F and G stay consistent across layouts.
    const code = String(ev.code || ""),
      key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : String(ev.key || ""),
      name = key.toLowerCase();
    this._rlKey = name;
    const tag = ev.target && ev.target.tagName;
    if (down && !ev.repeat && tag !== "INPUT" && tag !== "TEXTAREA" && (chooseKey(code, name) || overKey(code, name))) {
      ev.preventDefault();
      return;
    }
    const dialogOpen = typeof document !== "undefined" && document.getElementById("dialog")?.hidden === false;
    if (
      down &&
      !ev.repeat &&
      name === "escape" &&
      ((tag === "INPUT" && /^(checkbox|range|radio)$/.test(ev.target.type)) ||
        (dialogOpen && (tag === "INPUT" || tag === "TEXTAREA")))
    ) {
      ev.target.blur();
      if (this.onPause) {
        this.onPause();
      }
      return;
    }
    if (down) {
      RL_RT.keydown++;
    } else {
      RL_RT.keyup++;
    }
    if (!name) return;
    // Released keys always clear, even when a text field holds focus.
    if (!down) {
      this.keys.delete(name);
    }
    if (!(tag === "INPUT" || tag === "TEXTAREA")) {
      if (down && ev.isTrusted) {
        setTouchInput(false);
      }
      if (down && (name === "escape" || name === "p")) {
        if (!ev.repeat && this.onPause) {
          ev.preventDefault();
          this.onPause();
        }
        return;
      }
      const hudEditOpen = typeof document !== "undefined" && document.getElementById("hudEdit")?.hidden === false;
      if (hudEditOpen) return;
      if (down && !dialogOpen) {
        const homeEl = typeof document !== "undefined" && document.getElementById("home");
        if (homeEl && !homeEl.hidden && (name === "arrowleft" || name === "arrowright")) {
          const dir = name === "arrowleft" ? -1 : 1;
          if (ev.shiftKey) game.ui?.stepThreat(dir);
          else game.ui?.stepWeapon(dir);
          ev.preventDefault();
          return;
        }
        const pageScroll =
          typeof document !== "undefined" && document.querySelector(".screen.page:not([hidden]) > .scroll");
        if (pageScroll && (name === "arrowup" || name === "arrowdown")) {
          pageScroll.scrollBy({ top: name === "arrowdown" ? 72 : -72, behavior: "auto" });
          ev.preventDefault();
          return;
        }
      }
      const playing = this.enabled && (!this.isPlaying || this.isPlaying());
      if (name === " " && playing) {
        ev.preventDefault();
      }
      if (playing && down && !ev.repeat) {
        if (name === " " || name === "shift") {
          this.pending.dash = true;
        }
        if (name === "e" || name === "q" || name === "f") {
          this.pending.nova = true;
          ev.preventDefault();
        }
        if (name === "g") {
          this.pending.gadget = true;
          ev.preventDefault();
        }
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(name)) {
        if (down) {
          this.keys.add(name);
        } else {
          this.keys.delete(name);
        }
        if (down && !(ev.target && ev.target.closest && ev.target.closest(".scroll, .cards, .center-col"))) {
          ev.preventDefault();
        }
      }
    }
  }
  press(action) {
    if (this.enabled) {
      this.pending[action] = true;
    }
  }
  // Held keyboard movement survives soft resets (pause, upgrade choice, resize); pass `all` when focus/visibility drops.
  reset(all) {
    RL_RT.reset++;
    for (let stick of [this.move, this.aim])
      if (stick.active && stick.id >= 0)
        try {
          this.layer.releasePointerCapture(stick.id);
        } catch {}
    this.move.active = false;
    this.aim.active = false;
    if (all) {
      this.keys.clear();
    }
    this.mouse.down = false;
    this.manualAim = false;
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
  }
  // Drop one-shot actions during a boss camera pan, but keep held sticks and keys.
  settle() {
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
  }
  /* the radius of the sticks in px: a share of the screen, times the stick size of the player (scale: another size) */
  radius(scale = this.stickScale) {
    return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72) * (scale || 1);
  }
  sample(world, settings) {
    let radius = (this.R = this.radius()),
      mx = 0,
      my = 0;
    if (this.move.active) {
      let dx = this.move.x - this.move.ox,
        dy = this.move.y - this.move.oy,
        dist = Math.hypot(dx, dy),
        dead = radius * 0.12;
      if (dist > dead) {
        let k = clamp((dist - dead) / (radius - dead), 0, 1);
        mx = (dx / dist) * k;
        my = (dy / dist) * k;
        this.usedMove = true;
      }
    }
    let keys = this.keys;
    if (keys.has("a") || keys.has("arrowleft")) {
      mx -= 1;
      this.usedMove = true;
    }
    if (keys.has("d") || keys.has("arrowright")) {
      mx += 1;
      this.usedMove = true;
    }
    if (keys.has("w") || keys.has("arrowup")) {
      my -= 1;
      this.usedMove = true;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
      my += 1;
      this.usedMove = true;
    }
    let ax = 0,
      ay = 0,
      aim = false,
      fire = false;
    if (this.aim.active) {
      let dx = this.aim.x - this.aim.ox,
        dy = this.aim.y - this.aim.oy,
        dist = Math.hypot(dx, dy);
      fire = true;
      if (dist > radius * 0.22) {
        ax = dx / dist;
        ay = dy / dist;
        aim = true;
        this.usedAim = true;
      }
    }
    if (!aim && world && this.r && this.mouse.down) {
      let ground = this.r.groundAt(this.mouse.x, this.mouse.y);
      if (ground) {
        let dx = ground.x - world.player.x,
          dy = ground.y - world.player.y,
          dist = Math.hypot(dx, dy);
        if (dist > 0.3) {
          ax = dx / dist;
          ay = dy / dist;
          aim = true;
          this.usedAim = true;
        }
      }
      fire = true;
    }
    this.manualAim = !!(aim || this.mouse.down || this.aim.active);
    this.showReticle = !RL_INPUT.touch && (this.mouse.down || settings.autoFire === false || this.showReticle);
    let out = {
      mx,
      my,
      ax,
      ay,
      aim,
      fire,
      auto: settings.autoFire !== false,
      assist: settings.assist !== false,
      dash: this.pending.dash,
      nova: this.pending.nova,
      gadget: this.pending.gadget,
    };
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
    return out;
  }
};
function chooseKey(code, key) {
  if (!game.chooseShown || game.overShown || !getById("dialog").hidden || getById("choose").hidden) return false;
  const match = /^(?:Digit|Numpad)([1-5])$/.exec(code) || /^([1-5])$/.exec(key);
  if (match) {
    const card = getById("cards").querySelectorAll("[data-pick]")[+match[1] - 1];
    if (card && !getById("cards").classList.contains("locked")) {
      if (getById("cards").classList.contains("banishing")) game.banish(card.dataset.pick);
      else game.choose(card.dataset.pick);
    }
    return true;
  }
  if (key === "b") {
    const btn = getById("banishBtn");
    if (btn && !btn.hidden && !btn.disabled) btn.click();
    return true;
  }
  if (key === "r") {
    if (!getById("rerollBtn").disabled) {
      game.reroll();
    }
    return true;
  }
  return false;
}
function overKey(code, key) {
  if (key !== "r") return false;
  if (!game.overShown || getById("over").hidden || !getById("dialog").hidden) return false;
  const endless = getById("endlessBtn"),
    btn = !endless.hidden ? endless : getById("retryBtn");
  if (btn && !btn.hidden && !btn.disabled) btn.click();
  return true;
}
function newStick() {
  return { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, lastEv: 0 };
}

export { Input, RL_INPUT, setTouchInput };
