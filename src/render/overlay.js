// 2D overlay canvas (Overlay): health bars, off-screen indicators, hints and callouts.

import { enemyDefs, bossDefs } from "../data/enemies.js";
import { clamp } from "../core/util.js";
import { RL_INPUT } from "../ui/input.js";

const BIOME_RETICLE = {
  courtyard: "rgba(130,244,218,0.92)",
  shelf: "rgba(38,142,216,0.92)",
  marsh: "rgba(140,255,176,0.92)",
  core: "rgba(228,176,255,0.92)",
  caldera: "rgba(255,196,104,0.94)",
  flats: "rgba(36,158,154,0.92)",
};

function fillPill(ctx, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  const r = Math.min(h * 0.5, w * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

const healthBarTypes = {
    brute: 1,
    hive: 1,
    splitter: 1,
    sniper: 1,
    gunner: 1,
    bulwark: 1,
    mortar: 1,
    striker: 1,
    mender: 1,
    leaper: 1,
    turret: 1,
    charger: 1,
    minebot: 1,
    sapper: 1,
    phantom: 1,
    sentinel: 1,
    carrier: 1,
    drone: 1,
    driller: 1,
    beacon: 1,
    weaver: 1,
  },
  bossAttackNames = {
    charge: "CHARGE",
    ring: "BULLET RING",
    stomp: "STOMP",
    summon: "SUMMON",
    spiral: "SPIRAL",
    burst: "VOLLEY",
    eggs: "BROOD",
    sweep: "LASER SWEEP",
    teleport: "BLINK",
    shards: "HOMING SHARDS",
    lances: "LANCES",
    cross: "LASER CROSS",
    rain: "BOMBARDMENT",
    // 3.3.0: the Overdrive attacks of the enraged bosses
    sealgrid: "OVERDRIVE · LANTERN CAGE",
    whiteout: "OVERDRIVE · WHITEOUT",
    plague: "OVERDRIVE · PLAGUE",
    collapse: "OVERDRIVE · COLLAPSE",
    // 2.4.6: Frost Prism
    frostbeam: "FROST BEAM",
    icelances: "ICE LANCES",
    iceshards: "ICE SHARDS",
    frostnova: "FROST NOVA",
    glacier: "GLACIER",
    barrage: "MOLTEN FAN",
    firestorm: "OVERDRIVE · FIRESTORM",
    // 3.56.0: Glasswyrm
    rise: "SAND BURST",
    sunlance: "SUN LANCE",
    mirage: "MIRAGE",
    noon: "OVERDRIVE · NOON",
  },
  Overlay = class {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext("2d");
      this.tmp = { x: 0, y: 0, vis: false, nx: 0, ny: 0 };
      this.tmp2 = { x: 0, y: 0, vis: false, nx: 0, ny: 0 };
      this.w = 0;
      this.h = 0;
      // Match the game canvas's pixel-ratio ceiling.
      this.dprCap = 2;
      this.hurts = [];
      this.callouts = [];
      this.hpTrails = new WeakMap();
      this.time = 0;
    }
    addHurt(world, x, y) {
      if (x == null || !world) return;
      let angle = Math.atan2(y - world.player.y, x - world.player.x);
      if (this.hurts.length > 5) {
        this.hurts.shift();
      }
      this.hurts.push({ a: angle, life: 0.8 });
    }
    callout(attack, id) {
      let label = attack === "shards" && id === "wyrm" ? "GLASS FAN" : bossAttackNames[attack];
      if (label) {
        this.callouts = [{ t: label, life: 1.4 }];
      }
    }
    resize() {
      let w = this.c.clientWidth || window.innerWidth,
        h = this.c.clientHeight || window.innerHeight,
        dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 2);
      if (!(w === this.w && h === this.h && dpr === this.dpr)) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.c.width = Math.round(w * dpr);
        this.c.height = Math.round(h * dpr);
      }
    }
    clear() {
      this.resize();
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g.clearRect(0, 0, this.w, this.h);
    }
    draw(renderer, world, input, opts = {}) {
      this.clear();
      if (!world) return;
      let ctx = this.g,
        pos = this.tmp,
        safe = opts.safe || { t: 0, b: 0, l: 0, r: 0 },
        dt = opts.dt || 0.016;
      // project a world point into pos; true when it is in front of the camera
      const project = (x, y, z) => {
        renderer.project(x, y, z, pos);
        return pos.vis;
      };
      // …and inside the screen with an 8 px margin
      const inView = (x, y, z) =>
        project(x, y, z) && pos.x > 8 && pos.x < this.w - 8 && pos.y > 8 && pos.y < this.h - 8;
      this.time += dt;
      let player = world.player,
        target = player.target;
      if (
        target &&
        !target.dead &&
        player.firing &&
        !player.manual &&
        player.alive &&
        project(target.x, 0.6, target.y)
      ) {
        renderer.project(target.x + target.r, 0.6, target.y, this.tmp2);
        let size = Math.max(13, Math.abs(this.tmp2.x - pos.x) * 1.48 + 6),
          spin = this.time * 1.85,
          reticleCol = BIOME_RETICLE[world.arena?.biome?.id] || "rgba(130,244,218,0.92)";
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(spin);
        ctx.lineCap = "round";
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass === 0 ? "rgba(12,14,24,0.58)" : reticleCol;
          ctx.lineWidth = pass === 0 ? 4.6 : 2.5;
          for (let i = 0; i < 4; i++) {
            const a0 = i * (Math.PI / 2) - 0.34;
            const a1 = a0 + 0.68;
            ctx.beginPath();
            ctx.arc(0, 0, size, a0, a1);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      for (let enemy of world.enemies) {
        if (
          enemy.boss ||
          (enemy.hp >= enemy.maxHp && !(enemy.shieldMax > 0 && enemy.shield < enemy.shieldMax)) ||
          !(enemy.elite || healthBarTypes[enemy.type]) ||
          !project(enemy.x, 1.2 + enemy.r * 1.4, enemy.y)
        )
          continue;
        let width = 24 + enemy.r * 16,
          hpFrac = clamp(enemy.hp / enemy.maxHp, 0, 1),
          x0 = pos.x - width / 2;
        // Smooth hit-drain catchup bar (kept in WeakMap so simulation entities remain pure)
        let prev = this.hpTrails.get(enemy);
        if (prev == null || prev < hpFrac) prev = hpFrac;
        else prev = Math.max(hpFrac, prev - dt * 1.45);
        this.hpTrails.set(enemy, prev);
        ctx.fillStyle = "rgba(14,10,22,0.9)";
        fillPill(ctx, x0 - 2, pos.y - 2, width + 4, 8.5);
        if (prev > hpFrac + 0.015) {
          ctx.fillStyle = "rgba(255,236,192,0.88)";
          fillPill(ctx, x0, pos.y, Math.max(4, width * prev), 4.5);
        }
        ctx.fillStyle = enemy.elite ? "#ffd26e" : "#ff6b5e";
        fillPill(ctx, x0, pos.y, Math.max(4, width * hpFrac), 4.5);
        if (enemy.shieldMax > 0 && enemy.shield > 0) {
          ctx.fillStyle = "rgba(14,10,22,0.84)";
          fillPill(ctx, x0 - 1.5, pos.y - 6.5, width + 3, 5);
          ctx.fillStyle = "#8cf4ff";
          fillPill(ctx, x0, pos.y - 5.5, Math.max(3, width * (enemy.shield / enemy.shieldMax)), 3);
        }
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let heroScreen = null;
      if (player.alive && renderer.project(player.x, 0.9, player.y, this.tmp2).vis) {
        heroScreen = { x: this.tmp2.x, y: this.tmp2.y };
      }
      for (let num of renderer.nums) {
        if (num.life <= 0 || !project(num.x, num.y, num.z)) continue;
        let nx = pos.x,
          ny = pos.y;
        // Keep damage numbers clear of the Hero's body so hitbox readability stays unobstructed
        if (heroScreen) {
          let hx = nx - heroScreen.x,
            hy = ny - heroScreen.y,
            hd = Math.hypot(hx, hy);
          if (hd < 28) {
            let push = 28 - hd;
            if (hd > 0.5) {
              nx += (hx / hd) * push;
              ny += (hy / hd) * push;
            } else {
              ny -= push;
            }
          }
        }
        let alpha = clamp(num.life / 0.35, 0, 1),
          pop = 1 + Math.max(0, 1 - (renderer.time - num.t0) / 0.14) * (num.crit ? 0.52 : 0.36),
          fontSize =
            Math.min(28, (num.crit ? 16.5 : num.burn ? 10 : 12) + 3.5 * Math.log10(1 + Math.max(0, num.v))) * pop;
        ctx.font = `700 ${fontSize}px "Instrument Sans", system-ui, sans-serif`;
        let text = String(Math.max(1, Math.round(num.v))) + (num.crit ? "!" : "");
        ctx.globalAlpha = alpha;
        ctx.lineJoin = "round";
        ctx.lineWidth = num.crit ? 4.4 : 3.8;
        ctx.strokeStyle = num.crit ? "rgba(46,20,8,0.92)" : "rgba(14,12,24,0.92)";
        ctx.strokeText(text, nx, ny);
        ctx.fillStyle = num.crit ? "#ffe074" : num.burn ? "#ff9244" : num.shield ? "#94f4ff" : "#fff7e4";
        ctx.fillText(text, nx, ny);
      }
      ctx.globalAlpha = 1;
      let fewEnemies = world.enemies.length <= 6,
        margin = 26;
      for (let enemy of world.enemies) {
        let windingUp =
          enemy.st === 1 &&
          (enemy.type === "sniper" ||
            enemy.type === "striker" ||
            enemy.type === "mortar" ||
            enemy.type === "brute" ||
            enemy.type === "leaper" ||
            enemy.type === "turret" ||
            enemy.type === "charger" ||
            enemy.type === "driller" ||
            enemy.type === "sentinel" ||
            enemy.type === "weaver");
        if (
          (!enemy.boss && !fewEnemies && !windingUp && !(world.state === "fight" && world.stragglerT > 3)) ||
          inView(enemy.x, 0.6, enemy.y)
        )
          continue;
        let cx = this.w / 2,
          cy = this.h / 2,
          dx = pos.x - cx,
          dy = pos.y - cy;
        if ((pos.nx === 0 && pos.ny === 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) continue;
        let len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        let tx = Math.abs(dx) > 0.001 ? ((dx > 0 ? this.w - margin - safe.r : margin + safe.l) - cx) / dx : 1 / 0,
          ty =
            Math.abs(dy) > 0.001 ? ((dy > 0 ? this.h - margin - safe.b - 120 : margin + safe.t + 60) - cy) / dy : 1 / 0,
          edge = Math.min(tx, ty),
          ax = cx + dx * edge,
          ay = cy + dy * edge,
          color = windingUp
            ? "#ff3a4e"
            : enemy.boss
              ? cssColor(bossDefs[enemy.type].color)
              : enemy.elite
                ? "#ffc84a"
                : cssColor(enemyDefs[enemy.type].color);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(14,10,22,0.92)";
        ctx.lineWidth = 2.6;
        ctx.lineJoin = "round";
        ctx.globalAlpha = windingUp ? (Math.floor(this.time * 10) % 2 ? 1 : 0.48) : 0.9;
        ctx.beginPath();
        let scale = enemy.boss ? 1.5 : 1;
        ctx.moveTo(10 * scale, 0);
        ctx.lineTo(-6 * scale, -7 * scale);
        ctx.lineTo(-3 * scale, 0);
        ctx.lineTo(-6 * scale, 7 * scale);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (player.alive && player.hp / world.stats.maxHp < 0.6) {
        for (let pickup of world.pickups) {
          if (pickup.kind !== "heal" || inView(pickup.x, 0.5, pickup.y)) continue;
          let cx = this.w / 2,
            cy = this.h / 2,
            dx = pos.x - cx,
            dy = pos.y - cy;
          if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
          let len = Math.hypot(dx, dy) || 1;
          dx /= len;
          dy /= len;
          let tx = Math.abs(dx) > 0.001 ? ((dx > 0 ? this.w - margin - safe.r : margin + safe.l) - cx) / dx : 1 / 0,
            ty =
              Math.abs(dy) > 0.001
                ? ((dy > 0 ? this.h - margin - safe.b - 120 : margin + safe.t + 60) - cy) / dy
                : 1 / 0,
            edge = Math.min(tx, ty);
          ctx.save();
          ctx.translate(cx + dx * edge, cy + dy * edge);
          ctx.globalAlpha = 0.65 + Math.sin(this.time * 6) * 0.28;
          ctx.fillStyle = "rgba(14,10,22,0.88)";
          ctx.fillRect(-8.5, -4, 17, 8);
          ctx.fillRect(-4, -8.5, 8, 17);
          ctx.fillStyle = "#6dff8a";
          ctx.fillRect(-7, -2.5, 14, 5);
          ctx.fillRect(-2.5, -7, 5, 14);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.strokeStyle = "rgba(14,10,22,0.9)";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(16, 0);
          ctx.lineTo(10, -5);
          ctx.lineTo(10, 5);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
      if (this.hurts.length) {
        renderer.project(player.x, 0.6, player.y, pos);
        let radius = Math.min(this.w, this.h) * 0.16 + 30;
        for (let hurt of this.hurts) {
          hurt.life -= dt;
          if (!(hurt.life <= 0)) {
            ctx.globalAlpha = Math.min(1, hurt.life / 0.5) * 0.85;
            ctx.strokeStyle = "#ff3050";
            ctx.lineWidth = 7;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, hurt.a - 0.42, hurt.a + 0.42);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffd0d8";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius - 7, hurt.a - 0.25, hurt.a + 0.25);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
        this.hurts = this.hurts.filter((hurt) => hurt.life > 0);
      }
      if (this.callouts.length && world.boss) {
        let callout = this.callouts[0];
        callout.life -= dt;
        renderer.project(world.boss.x, 4.2 + world.boss.r, world.boss.y, pos);
        if (callout.life > 0 && pos.vis) {
          let alpha = Math.min(1, callout.life / 0.3);
          ctx.globalAlpha = alpha;
          ctx.font = '700 16px "Instrument Sans", system-ui, sans-serif';
          ctx.textAlign = "center";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(6,8,16,0.9)";
          ctx.strokeText(callout.t, pos.x, pos.y);
          ctx.fillStyle = "#ff9ab8";
          ctx.fillText(callout.t, pos.x, pos.y);
          ctx.globalAlpha = 1;
        }
        if (callout.life <= 0) {
          this.callouts.length = 0;
        }
      }
      if (input) {
        this.drawSticks(input, opts);
      }
    }
    drawSticks(input, opts) {
      let ctx = this.g;
      // a fixed move stick shows where it waits while no thumb is on it (only for touch play)
      if (input.fixedMove && !input.move.active && RL_INPUT.touch) {
        let radius = input.radius(),
          center = input.fixedMove(radius);
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(176,218,193,0.45)";
        ctx.fillStyle = "rgba(132,186,160,0.05)";
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(176,218,193,0.4)";
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let stick of [input.move, input.aim]) {
        if (!stick.active) continue;
        let radius = input.R,
          isAim = stick === input.aim;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.strokeStyle = isAim ? "rgba(248,168,127,0.55)" : "rgba(176,218,193,0.5)";
        ctx.fillStyle = isAim ? "rgba(242,141,100,0.08)" : "rgba(132,186,160,0.08)";
        ctx.beginPath();
        ctx.arc(stick.ox, stick.oy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * i) / 4,
            x = Math.cos(angle) * radius,
            y = Math.sin(angle) * radius;
          ctx.moveTo(stick.ox + x * 0.87, stick.oy + y * 0.87);
          ctx.lineTo(stick.ox + x, stick.oy + y);
        }
        ctx.stroke();
        let dx = stick.x - stick.ox,
          dy = stick.y - stick.oy,
          dist = Math.hypot(dx, dy),
          scale = dist > radius ? radius / dist : 1;
        ctx.fillStyle = isAim ? "rgba(248,168,127,0.7)" : "rgba(176,218,193,0.65)";
        ctx.beginPath();
        ctx.arc(stick.ox + dx * scale, stick.oy + dy * scale, radius * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (opts.hints) {
        ctx.font = '600 14px "Instrument Sans", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(200,230,255,0.75)";
        let y = this.h - (opts.safe ? opts.safe.b : 0) - 58;
        ctx.fillText("DRAG HERE TO MOVE", this.w * 0.25, y);
        ctx.fillText("DRAG HERE TO AIM + FIRE", this.w * 0.75, y);
      }
    }
  },
  cssColorCache = {};
function cssColor(color) {
  return cssColorCache[color] || (cssColorCache[color] = "#" + color.toString(16).padStart(6, "0"));
}

export { Overlay };
