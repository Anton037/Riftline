// Keyboard, mouse, touch, and gamepad input.

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
const INPUT_BUFFER_MS = 120;
const RL_INPUT = { touch: initialTouchInput(), gamepad: false };

function setTouchInput(touch) {
  RL_INPUT.touch = !!touch;
  RL_INPUT.gamepad = false;
  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("input-touch", RL_INPUT.touch);
    document.body.classList.remove("input-gamepad");
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
    this.mouse = { x: NaN, y: NaN, down: false };
    this.pending = { dash: 0, fireBurst: 0, gravityBell: 0, fire: 0 };
    this.pads = new Set();
    this.padButtons = [];
    this.padMove = [0, 0];
    this.padAim = [0, 0];
    this.padFire = false;
    this.padBlocked = false;
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
    layer.addEventListener("mousedown", (ev) => {
      if (ev.button !== 2 || !ev.isTrusted || !this.isPlaying?.()) return;
      setTouchInput(false);
      this.press("dash");
    });
    layer.addEventListener("contextmenu", (ev) => ev.preventDefault());
    window.addEventListener("gamepadconnected", ({ gamepad }) => {
      if (gamepad.mapping === "standard") this.pads.add(gamepad.index);
    });
    window.addEventListener("gamepaddisconnected", ({ gamepad }) => this.disconnectPad(gamepad.index));
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
  disconnectPad(index) {
    this.pads.delete(index);
    if (this.padIndex !== index) return;
    this.padIndex = null;
    this.padButtons = [];
    this.padMove = this.padAim = [0, 0];
    this.padFire = false;
    if (RL_INPUT.gamepad) setTouchInput(initialTouchInput());
    this.settle();
  }
  pollGamepad() {
    if (!this.pads.size || document.hidden || !document.hasFocus()) return;
    const pads = navigator.getGamepads();
    const currentPad = pads[this.padIndex];
    const pad = currentPad?.connected
      ? currentPad
      : [...this.pads].map((index) => pads[index]).find((item) => item?.connected);
    if (!pad) return;
    const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.5);
    const move = padStick(pad.axes, 0),
      aim = padStick(pad.axes, 2);
    if (this.padIndex !== pad.index) {
      this.padIndex = pad.index;
      this.padButtons = [];
    }
    const pressed = (button) => buttons[button] && !this.padButtons[button];
    const playing = this.isPlaying?.();
    if (buttons.some(Boolean) || move[0] || move[1] || aim[0] || aim[1]) {
      RL_INPUT.gamepad = true;
      RL_INPUT.touch = false;
      document.body.classList.remove("input-touch");
      document.body.classList.add("input-gamepad");
      this.showReticle = false;
    }
    if (this.padBlocked && !buttons.some(Boolean) && !move.some(Boolean) && !aim.some(Boolean)) this.padBlocked = false;
    if (!this.padBlocked) {
      if (pressed(9)) {
        this._rlKey = "escape";
        this.onPause?.();
      } else if (playing) {
        if (pressed(0) || pressed(4)) this.press("dash");
        if (pressed(1) || pressed(5)) this.press("fireBurst");
        if (pressed(3) || pressed(6)) this.press("gravityBell");
        if (pressed(7)) this.press("fire");
      } else if (RL_INPUT.gamepad) {
        if (pressed(1)) {
          this._rlKey = "escape";
          this.onPause?.();
        } else if (pressed(0) || [12, 13, 14, 15].some(pressed)) {
          const screen =
            document.querySelector("#dialog:not([hidden])") || document.querySelector(".screen:not([hidden])");
          const targets = [
            ...(screen?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)") || []),
          ].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
          const current = targets.indexOf(document.activeElement);
          if (pressed(0)) {
            if (current >= 0) targets[current].click();
            else targets[0]?.focus();
          } else {
            const direction = pressed(12) || pressed(14) ? -1 : 1;
            const next =
              current < 0
                ? direction > 0
                  ? 0
                  : targets.length - 1
                : (current + direction + targets.length) % targets.length;
            targets[next]?.focus();
          }
        }
      }
    }
    this.padButtons = buttons;
    this.padMove = this.padBlocked ? [0, 0] : move;
    this.padAim = this.padBlocked ? [0, 0] : aim;
    this.padFire = !this.padBlocked && !!buttons[7];
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
    if (all && this.pads.size) {
      this.padBlocked = true;
      this.padMove = this.padAim = [0, 0];
      this.padFire = false;
    }
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
    if (RL_INPUT.gamepad) {
      mx += this.padMove[0];
      my += this.padMove[1];
      if (Math.hypot(mx, my) > 0.08) this.usedMove = true;
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
    if (RL_INPUT.gamepad) {
      [ax, ay] = this.padAim;
      aim = Math.hypot(ax, ay) > 0.2;
      fire = this.padFire || bufferedFire;
      if (aim) this.usedAim = true;
      else if (fire) {
        ax = Math.cos(player.aim);
        ay = Math.sin(player.aim);
        aim = true;
      }
    } else if (RL_INPUT.touch) {
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
    this.showReticle =
      !RL_INPUT.touch && !RL_INPUT.gamepad && (this.mouse.down || settings.autoFire === false || this.showReticle);
    return {
      mx,
      my,
      ax,
      ay,
      aim,
      aimX,
      aimY,
      fire,
      aimOnly: (!RL_INPUT.touch || RL_INPUT.gamepad) && !fire,
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
function padStick(axes, offset) {
  const x = axes[offset] || 0,
    y = axes[offset + 1] || 0,
    magnitude = Math.hypot(x, y);
  if (magnitude <= 0.18) return [0, 0];
  const scale = clamp((magnitude - 0.18) / 0.82, 0, 1) / magnitude;
  return [x * scale, y * scale];
}
function newStick() {
  return { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, lastEv: 0 };
}

export { Input, RL_INPUT, setTouchInput };
