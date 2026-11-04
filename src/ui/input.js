// Touch sticks and action buttons. Keyboard, mouse and gamepads do not control a run.

import { RL_RT } from "../core/diagnostics.js";
import { clamp } from "../core/util.js";
const Input = class {
  constructor(layer) {
    this.layer = layer;
    this.move = newStick();
    this.aim = newStick();
    this.pending = { dash: false, nova: false, gadget: false };
    this.R = 56;
    // the stick size of the player (times the default radius) and, with a fixed move stick, where it sits
    // (a function that returns its centre in px, see ui/hud-layout.js; null: the stick starts where the thumb does)
    this.stickScale = 1;
    this.fixedMove = null;
    this.enabled = true;
    this.usedMove = false;
    this.usedAim = false;
    this.bind();
  }
  bind() {
    let layer = this.layer;
    layer.addEventListener("pointerdown", (ev) => this.down(ev));
    layer.addEventListener("onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove", (ev) =>
      this.moveEv(ev),
    );
    layer.addEventListener("pointerup", (ev) => this.up(ev));
    layer.addEventListener("pointercancel", (ev) => this.cancel(ev));
    layer.addEventListener("lostpointercapture", (ev) => this.cancel(ev));
    layer.addEventListener("contextmenu", (ev) => ev.preventDefault());
    window.addEventListener("blur", () => {
      this.reset();
      if (this.onBlur) {
        this.onBlur();
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
    if (!this.enabled || ev.pointerType !== "touch") return;
    ev.preventDefault();
    let isMove = this.zoneIsMove(ev.clientX),
      stick = isMove ? this.move : this.aim;
    if (stick.active && stick.id !== ev.pointerId) {
      // A stationary thumb still owns its stick while the browser holds pointer capture.
      if (this.layer.hasPointerCapture(stick.id) || performance.now() - (stick.lastEv || 0) < 2500) return;
      try {
        this.layer.releasePointerCapture(stick.id);
      } catch {}
    }
    // Dash belongs to its button, not a second tap on the movement stick.
    let now = performance.now();
    stick.active = true;
    stick.id = ev.pointerId;
    stick.moved = 0;
    stick.lastEv = now;
    stick.ox = stick.x = ev.clientX;
    stick.oy = stick.y = ev.clientY;
    // a fixed move stick keeps its place; a touch anywhere on the move side steers from its centre
    if (isMove && this.fixedMove) {
      const center = this.fixedMove(this.radius());
      stick.ox = center.x;
      stick.oy = center.y;
    }
    stick.t = performance.now();
    try {
      this.layer.setPointerCapture(ev.pointerId);
    } catch {}
  }
  moveEv(ev) {
    RL_RT.pointermove++;
    if (ev.pointerType !== "touch") return;
    let coalesced = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null,
      last = coalesced && coalesced.length ? coalesced[coalesced.length - 1] : ev,
      x = Number.isFinite(last.clientX) ? last.clientX : ev.clientX,
      y = Number.isFinite(last.clientY) ? last.clientY : ev.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    for (let stick of [this.move, this.aim]) {
      if (!stick.active || stick.id !== last.pointerId) continue;
      stick.lastEv = performance.now();
      stick.x = x;
      stick.y = y;
      stick.moved = Math.max(stick.moved || 0, Math.hypot(stick.x - stick.ox, stick.y - stick.oy));
      // 2.6.0: the stick stays where the finger touched down. Before, its centre followed the
      // finger once it was dragged further than 1.25 radii; the knob is clamped when drawn and
      // sample() caps the strength at 1.
    }
  }
  up(ev) {
    RL_RT.pointerup++;
    if (ev.pointerType !== "touch") return;
    for (let stick of [this.move, this.aim]) {
      if (!(!stick.active || stick.id !== ev.pointerId)) {
        stick.active = false;
      }
    }
  }
  cancel(ev) {
    RL_RT.pointercancel++;
    if (ev.pointerType !== "touch") return;
    for (let stick of [this.move, this.aim]) {
      if (!(!stick.active || stick.id !== ev.pointerId)) {
        stick.active = false;
      }
    }
  }
  press(action) {
    if (this.enabled) {
      this.pending[action] = true;
    }
  }
  // Release each touch owner on pause, orientation changes and backgrounding.
  reset() {
    RL_RT.reset++;
    for (let stick of [this.move, this.aim])
      if (stick.active && stick.id >= 0)
        try {
          this.layer.releasePointerCapture(stick.id);
        } catch {}
    this.move.active = false;
    this.aim.active = false;
    this.pending.dash = false;
    this.pending.nova = false;
    this.pending.gadget = false;
  }
  // Drop one-shot actions during a boss camera pan, but keep held sticks.
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
function newStick() {
  return { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
}

export { Input };
