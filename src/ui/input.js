// Touch input on mobile and keyboard/mouse input on desktop.

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";
import { game } from "../main.js";
import { getById } from "./ui.js";

const touchInput = document.documentElement.classList.contains("device-touch");
const INPUT_BUFFER_MS = 120;
function acceptsPointer(ev) {
  return ev.pointerType === (touchInput ? "touch" : "mouse");
}

const Input = class {
  constructor(layer, renderer) {
    this.layer = layer;
    this.r = renderer;
    this.move = newStick();
    this.aim = newStick();
    this.keys = new Set();
    this.mouse = { x: NaN, y: NaN, down: false };
    this.pending = { dash: 0, fireBurst: 0, gravityBell: 0, fire: 0 };
    this.R = 56;
    // the stick size of the player (times the default radius) and, with a fixed move stick, where it sits
    // (a function that returns its centre in px, see ui/hud-layout.js; null: the stick starts where the thumb does)
    this.stickScale = 1;
    this.fixedMove = null;
    this.enabled = true;
    this.onPause = null;
    this.onBlur = null;
    this.onDeny = null;
    this.isPlaying = null;
    this.usedMove = false;
    this.usedAim = false;
    this.showReticle = false;
    this.manualAim = false;
    this._rawId = -1;
    this._rawX = NaN;
    this._rawY = NaN;
    this.bind();
  }
  bind() {
    let layer = this.layer;
    // Keep native click activation, including keyboard activation of desktop buttons.
    const app = getById("app");
    const ignoreOtherPointer = (ev) => {
      if (!ev.pointerType || acceptsPointer(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    app.addEventListener("pointerdown", ignoreOtherPointer, true);
    app.addEventListener("click", ignoreOtherPointer, true);
    layer.addEventListener("pointerdown", (ev) => this.down(ev));
    if ("onpointerrawupdate" in window) {
      layer.addEventListener("pointerrawupdate", (ev) => this.moveEv(ev));
    }
    layer.addEventListener("pointermove", (ev) => this.moveEv(ev));
    layer.addEventListener("pointerup", (ev) => this.up(ev));
    layer.addEventListener("pointercancel", (ev) => this.cancel(ev));
    layer.addEventListener("lostpointercapture", (ev) => this.cancel(ev));
    layer.addEventListener("contextmenu", (ev) => ev.preventDefault());
    window.addEventListener("blur", () => {
      this.reset(true);
      if (this.onBlur) {
        this.onBlur();
      }
    });
    if (!touchInput) {
      layer.addEventListener("mousedown", (ev) => {
        if (ev.button === 2 && ev.isTrusted) this.press("dash");
      });
      window.addEventListener("keydown", (ev) => this.key(ev, true));
      window.addEventListener("keyup", (ev) => this.key(ev, false));
      window.addEventListener("pointermove", (ev) => {
        if (ev.pointerType !== "mouse") return;
        if (Number.isFinite(ev.clientX)) this.mouse.x = ev.clientX;
        if (Number.isFinite(ev.clientY)) this.mouse.y = ev.clientY;
        if (ev.isTrusted) this.showReticle = true;
      });
      window.addEventListener("mouseup", (ev) => {
        if (ev.button === 0 || (ev.buttons & 1) === 0) {
          this.mouse.down = false;
          this.manualAim = false;
        }
      });
    }
  }
  zoneIsMove(x) {
    let rect = this.layer.getBoundingClientRect(),
      middle = rect.left + (rect.width || this.layer.clientWidth || window.innerWidth) * 0.5;
    return x < middle;
  }
  down(ev) {
    RL_RT.pointerdown++;
    if (!this.enabled || !acceptsPointer(ev)) return;
    if (ev.pointerType === "mouse") {
      if (ev.button === 0) {
        this.mouse.down = true;
        this.press("fire");
        this.manualAim = true;
        this.showReticle = true;
      }
      if (Number.isFinite(ev.clientX)) this.mouse.x = ev.clientX;
      if (Number.isFinite(ev.clientY)) this.mouse.y = ev.clientY;
      return;
    }
    ev.preventDefault();
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
    if (!isMove) this.press("fire");
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
    if (!acceptsPointer(ev)) return;
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
      if (ev.isTrusted) this.showReticle = true;
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
    if (!acceptsPointer(ev)) return;
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
    if (!acceptsPointer(ev)) return;
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
      if (down && (name === "escape" || name === "p")) {
        if (name === "p" && dialogOpen) return;
        if (!ev.repeat && this.onPause) {
          ev.preventDefault();
          this.onPause();
        }
        return;
      }
      if (down && !ev.repeat && name === "m" && !dialogOpen && this.onMute) {
        ev.preventDefault();
        this.onMute();
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
          this.press("dash");
        }
        if (name === "e" || name === "q" || name === "f") {
          this.press("fireBurst");
          ev.preventDefault();
        }
        if (name === "g") {
          this.press("gravityBell");
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
    if (this.enabled && (!this.isPlaying || this.isPlaying())) {
      this.pending[action] = performance.now() + INPUT_BUFFER_MS;
    }
  }
  consume(action, ready, now) {
    const until = this.pending[action];
    if (!until) return false;
    if (until >= now && !ready) return false;
    this.pending[action] = 0;
    if (until >= now) return true;
    if (action !== "fire") this.onDeny?.(action);
    return false;
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
    this.settle();
  }
  // Drop one-shot actions during a boss camera pan, but keep held sticks and keys.
  settle() {
    this.pending.dash = this.pending.fireBurst = this.pending.gravityBell = this.pending.fire = 0;
  }
  /* the radius of the sticks in px: a share of the screen, times the stick size of the player (scale: another size) */
  radius(scale = this.stickScale) {
    return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.14, 44, 72) * (scale || 1);
  }
  sample(world, settings, dt) {
    const now = performance.now(),
      player = world.player,
      fighting = world.state === "fight";
    const dash = this.consume("dash", player.dashT <= 0 && (player.dashN > 0 || player.dashCdT <= dt), now);
    const fireBurst = this.consume("fireBurst", fighting && player.fireBurst >= 100, now);
    const gravityBell = this.consume("gravityBell", fighting && (player.gadgetN > 0 || player.gadgetT <= dt), now);
    const bufferedFire = this.consume("fire", player.fireT <= dt, now);
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
      aimX,
      aimY,
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
    let lookX = 0,
      lookY = 0,
      hasLook = false;
    if (touchInput) {
      fire ||= bufferedFire;
    } else if (this.r && Number.isFinite(this.mouse.x) && Number.isFinite(this.mouse.y)) {
      fire = this.mouse.down || bufferedFire;
      let ground = this.r.groundAt(this.mouse.x, this.mouse.y);
      if (ground) {
        let dx = ground.x - world.player.x,
          dy = ground.y - world.player.y,
          dist = Math.hypot(dx, dy);
        if (dist > 0.3) {
          lookX = dx / dist;
          lookY = dy / dist;
          hasLook = true;
          if (!aim && (fire || settings.autoFire === false)) {
            ax = lookX;
            ay = lookY;
            aimX = ground.x;
            aimY = ground.y;
            aim = true;
            if (fire) this.usedAim = true;
          }
        }
      }
    }
    this.manualAim = !!(aim || this.mouse.down || this.aim.active);
    this.showReticle = !touchInput && (this.mouse.down || settings.autoFire === false || this.showReticle);
    return {
      mx,
      my,
      ax,
      ay,
      aim,
      aimX,
      aimY,
      fire,
      aimOnly: !touchInput && !fire,
      lookX,
      lookY,
      hasLook,
      auto: settings.autoFire !== false,
      assist: settings.assist !== false,
      dash,
      fireBurst,
      gravityBell,
    };
  }
};
function chooseKey(code, key) {
  if (!game.chooseShown || game.overShown || !getById("dialog").hidden || getById("choose").hidden) return false;
  const match = /^(?:Digit|Numpad)([1-5])$/.exec(code) || /^([1-5])$/.exec(key);
  if (match) {
    const card = getById("cards").querySelectorAll("[data-pick]")[+match[1] - 1];
    if (card && !getById("cards").classList.contains("locked")) {
      if (getById("cards").classList.contains("banishing")) game.seal(card.dataset.pick);
      else game.choose(card.dataset.pick);
    }
    return true;
  }
  if (key === "b") {
    const btn = getById("sealBtn");
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

export { Input, touchInput, acceptsPointer };
