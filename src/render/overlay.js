// 2D overlay canvas (Overlay): health bars, off-screen indicators, hints and callouts.

import { enemyDefs, bossDefs } from "../data/enemies.js";
import { clamp } from "../core/util.js";
import { touchInput } from "../ui/input.js";

const BIOME_RETICLE = {
  lanternYard: "rgba(130,244,218,0.92)",
  snowRidge: "rgba(38,142,216,0.92)",
  mossBog: "rgba(140,255,176,0.92)",
  starHall: "rgba(228,176,255,0.92)",
  emberHill: "rgba(255,196,104,0.94)",
  sunDunes: "rgba(36,158,154,0.92)",
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
    ironGolem: 1,
    firePot: 1,
    mushroomNest: 1,
    sporePod: 1,
    longshot: 1,
    brassGuard: 1,
    shieldGuard: 1,
    bellCannon: 1,
    blinkBlade: 1,
    mossHealer: 1,
    bogHopper: 1,
    watchTower: 1,
    wildBoar: 1,
    mineCart: 1,
    bombMaker: 1,
    starGhost: 1,
    crystalTower: 1,
    supplyKite: 1,
    dartSprite: 1,
    burrowMole: 1,
    healingStone: 1,
    starSpider: 1,
  },
  bossAttackNames = {
    charge: "BELL CHARGE",
    ring: "RING OF SHOTS",
    stomp: "BELL SLAM",
    carillon: "RINGING BELLS",
    summon: "MUSHROOM RING",
    spiral: "FIREFLY SWIRL",
    burst: "SPORE BURST",
    eggs: "SPORE EGGS",
    sweep: "ICE BEAM",
    teleport: "TELEPORT",
    shards: "GLASS SHARDS",
    lances: "ICE SPEARS",
    cross: "CROSS BEAMS",
    portalbeam: "PORTAL BEAMS",
    rain: "FALLING FIRE",
    trench: "FIRE LINE",
    crucible: "FORGE SLAM",
    // Enraged Crescendo signatures
    bellCage: "BELL CAGE",
    whiteout: "SNOWSTORM",
    plague: "SPORE WAVE",
    collapse: "STAR PULL",
    // Frost Prism
    frostbeam: "ICE BEAM",
    icelances: "ICE SPEARS",
    iceshards: "ICE SHARDS",
    frostnova: "ICE BURST",
    glacier: "FROZEN GROUND",
    // Ash Tyrant
    barrage: "FIRE SHOTS",
    firestorm: "FIRESTORM",
    // Glasswyrm
    rise: "SAND DIVE",
    sunlance: "SUN BEAM",
    sandstorm: "SANDSTORM",
    noon: "SUN CLOCK",
  },
  bossCalloutByBoss = {
    bellKeeper: {
      charge: "BELL CHARGE",
      ring: "RING OF SHOTS",
      stomp: "BELL SLAM",
      carillon: "RINGING BELLS",
      bellCage: "BELL CAGE",
    },
    emberKing: {
      charge: "FORGE CHARGE",
      ring: "LAVA QUAKE",
      summon: "FORGE HELPERS",
      rain: "FALLING FIRE",
      trench: "FIRE LINE",
      crucible: "FORGE SLAM",
    },
    starHeart: {
      spiral: "STAR SWIRL",
      summon: "STAR HELPERS",
      ring: "STAR RING",
      cross: "CROSS BEAMS",
      portalbeam: "PORTAL BEAMS",
      burst: "COMET SPREAD",
      rain: "FALLING STARS",
    },
  },
  Overlay = class {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext("2d");
      this.tmp = { x: 0, y: 0, vis: false, behind: false, angle: 0 };
      this.tmp2 = { x: 0, y: 0, vis: false, behind: false };
      this.w = 0;
      this.h = 0;
      // Crisp vector HUD overlay without burning 4x pixel fillrate on HiDPI screens in Firefox.
      this.dprCap = 1.5;
      this._isClean = false;
      this._lastFont = "";
      this.hurts = [];
      this.callouts = [];
      this.hpTrails = new WeakMap();
      this.time = 0;
    }
    setFont(fontStr) {
      if (this._lastFont !== fontStr) {
        this._lastFont = fontStr;
        this.g.font = fontStr;
      }
    }
    addHurt(world, x, y) {
      if (!world || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const dx = x - world.player.x;
      const dy = y - world.player.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) return;
      if (this.hurts.length < 6) {
        this.hurts.push({ dx: dx / length, dy: dy / length, life: 0.8 });
      } else {
        let oldest = 0;
        for (let i = 1; i < this.hurts.length; i++) {
          if (this.hurts[i].life < this.hurts[oldest].life) oldest = i;
        }
        this.hurts[oldest].dx = dx / length;
        this.hurts[oldest].dy = dy / length;
        this.hurts[oldest].life = 0.8;
      }
    }
    callout(attack, id) {
      let label =
        bossCalloutByBoss[id]?.[attack] ||
        bossAttackNames[attack] ||
        (attack ? String(attack).replace(/[_-]+/g, " ").toUpperCase() : "");
      if (label) {
        this.callouts = [{ t: label, id: id || "", life: 1.5 }];
      }
    }
    resize() {
      let w = this.c.clientWidth || window.innerWidth,
        h = this.c.clientHeight || window.innerHeight,
        dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 1.5);
      if (!(w === this.w && h === this.h && dpr === this.dpr)) {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.c.width = Math.round(w * dpr);
        this.c.height = Math.round(h * dpr);
        this._lastFont = "";
        this._isClean = true;
      }
    }
    clear() {
      if (this._isClean) {
        if (!this.c.hidden) this.c.hidden = true;
        return;
      }
      if (!this.w) this.resize();
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g.clearRect(0, 0, this.w, this.h);
      this._isClean = true;
      if (!this.c.hidden) this.c.hidden = true;
    }
    resetCombat() {
      this.hurts.length = 0;
      this.callouts.length = 0;
      this.clear();
    }
    _hasActiveContent(renderer, world, input, opts) {
      if (renderer.biomeFadeT > 0) return true;
      const player = world.player;
      const target = player?.target;
      if (target && !target.dead && player.firing && !player.manual && player.alive) return true;
      if (
        input &&
        !touchInput &&
        input.mouse &&
        Number.isFinite(input.mouse.x) &&
        Number.isFinite(input.mouse.y) &&
        (input.mouse.down || input.manualAim || input.showReticle || player?.manual)
      ) {
        return true;
      }
      if (this.hurts.length > 0) return true;
      if (this.callouts.length > 0 && world.boss) return true;
      if (opts.hints) return true;
      if (
        input &&
        ((input.fixedMove && !input.move?.active && touchInput) || input.move?.active || input.aim?.active)
      ) {
        return true;
      }
      if (renderer.nums) {
        for (let i = 0; i < renderer.nums.length; i++) {
          if (renderer.nums[i].life > 0) return true;
        }
      }
      if (world.enemies && world.enemies.length > 0) {
        if (world.enemies.length <= 6 || (world.state === "fight" && world.stragglerT > 3)) return true;
        for (let i = 0; i < world.enemies.length; i++) {
          const e = world.enemies[i];
          if (e.boss || e.caravan || e.st === 1) return true;
          if ((e.elite || healthBarTypes[e.type]) && (e.hp < e.maxHp || (e.shieldMax > 0 && e.shield < e.shieldMax))) {
            return true;
          }
        }
      }
      if (world.hazards?.length) {
        for (let i = 0; i < world.hazards.length; i++) {
          if (!world.hazards[i].done && world.hazards[i].shootable) return true;
        }
      }
      if (player?.alive && world.stats && player.hp / world.stats.maxHp < 0.6 && world.pickups?.length > 0) {
        for (let i = 0; i < world.pickups.length; i++) {
          if (world.pickups[i].kind === "heal") return true;
        }
      }
      return false;
    }
    draw(renderer, world, input, opts = {}) {
      if (!world) {
        this.clear();
        return;
      }
      if (!world.boss) this.callouts.length = 0;
      let dt = opts.dt || 0.016;
      this.time += dt;
      if (!this._hasActiveContent(renderer, world, input, opts)) {
        this.clear();
        return;
      }
      if (this.c.hidden) this.c.hidden = false;
      if (!this.w || renderer.w !== this.w || renderer.h !== this.h) this.resize();
      this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.g.clearRect(0, 0, this.w, this.h);
      this._isClean = false;
      let ctx = this.g,
        pos = this.tmp,
        safe = opts.safe || { t: 0, b: 0, l: 0, r: 0 };
      // Project a world point into pos; true when it is within the camera frustum with a small margin.
      const project = (x, y, z) => {
        renderer.project(x, y, z, pos);
        return pos.vis;
      };
      // …and inside the screen with an 8 px margin
      const inView = (x, y, z) =>
        project(x, y, z) && pos.x > 8 && pos.x < this.w - 8 && pos.y > 8 && pos.y < this.h - 8;
      let player = world.player,
        target = player.target,
        reticleCol = BIOME_RETICLE[world.arena?.biome?.id] || "rgba(130,244,218,0.92)";
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
          spin = this.time * 1.85;
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
      // Custom mouse reticle with crisp recoil-bloom feedback during manual/cursor aim
      if (
        input &&
        !touchInput &&
        input.mouse &&
        Number.isFinite(input.mouse.x) &&
        Number.isFinite(input.mouse.y) &&
        (input.mouse.down || input.manualAim || input.showReticle || player?.manual)
      ) {
        const mx = input.mouse.x;
        const my = input.mouse.y;
        const bloom = Math.min(6, (renderer.player?.recoil || 0) * 62);
        const rSize = (input.mouse.down ? 10 : 12) + bloom;
        ctx.save();
        ctx.translate(mx, my);
        ctx.lineCap = "round";
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass === 0 ? "rgba(12,14,24,0.68)" : reticleCol;
          ctx.lineWidth = pass === 0 ? 3.8 : 1.9;
          ctx.beginPath();
          ctx.arc(0, 0, rSize, 0, Math.PI * 2);
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            const c = Math.cos(a),
              s = Math.sin(a);
            ctx.moveTo(c * (rSize - 4), s * (rSize - 4));
            ctx.lineTo(c * (rSize + 4.5), s * (rSize + 4.5));
          }
          ctx.stroke();
        }
        ctx.fillStyle = reticleCol;
        ctx.beginPath();
        ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let enemy of world.enemies) {
        if (
          enemy.boss ||
          (!enemy.caravan && enemy.hp >= enemy.maxHp && !(enemy.shieldMax > 0 && enemy.shield < enemy.shieldMax)) ||
          !(enemy.elite || enemy.caravan || healthBarTypes[enemy.type]) ||
          !project(enemy.x, 1.2 + enemy.r * 1.4, enemy.y)
        )
          continue;
        let width = (enemy.caravan ? 32 : 24) + enemy.r * 16,
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
        ctx.fillStyle = enemy.caravan ? "#ffd85a" : enemy.elite ? "#ffd26e" : "#e86458";
        fillPill(ctx, x0, pos.y, Math.max(4, width * hpFrac), 4.5);
        if (enemy.shieldMax > 0 && enemy.shield > 0) {
          ctx.fillStyle = "rgba(14,10,22,0.84)";
          fillPill(ctx, x0 - 1.5, pos.y - 6.5, width + 3, 5);
          ctx.fillStyle = "#8cf4ff";
          fillPill(ctx, x0, pos.y - 5.5, Math.max(3, width * (enemy.shield / enemy.shieldMax)), 3);
        }
        // Compact status pips below HP bar (burn, chill, corrode/glaze, stun)
        const pips = [];
        if (enemy.burnT > 0) pips.push("#ff8a3d");
        if (enemy.slowT > 0) pips.push("#8ee8ff");
        if (enemy.inAcid || enemy.glazeT > 0 || enemy.chimeVulnT > 0) pips.push("#8ef2a8");
        if (enemy.stunT > 0) pips.push("#ffe470");
        if (pips.length) {
          const span = (pips.length - 1) * 7;
          for (let pi = 0; pi < pips.length; pi++) {
            const px = pos.x - span * 0.5 + pi * 7;
            const py = pos.y + 9.5;
            ctx.fillStyle = "rgba(14,10,22,0.88)";
            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = pips[pi];
            ctx.beginPath();
            ctx.arc(px, py, 2.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // Subtle crisp corner brackets around shootable hazards (Ember-Pots & Crucible Bombs) so players spot them instantly
      if (world.hazards?.length) {
        for (const h of world.hazards) {
          if (h.done || !h.shootable || !inView(h.x, 0.45, h.y)) continue;
          const bSize = h.crucibleBomb ? 17 : 13;
          const lanternGun = 0.72 + 0.28 * Math.sin(this.time * 10);
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.globalAlpha = 0.85 * lanternGun;
          ctx.strokeStyle = "#a8ffdf";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          for (let c = 0; c < 4; c++) {
            const sx = c === 0 || c === 3 ? -1 : 1;
            const sy = c < 2 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(sx * bSize, sy * (bSize - 5));
            ctx.lineTo(sx * bSize, sy * bSize);
            ctx.lineTo(sx * (bSize - 5), sy * bSize);
            ctx.stroke();
          }
          ctx.restore();
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
          pop = 1 + Math.max(0, 1 - (renderer.time - num.t0) / 0.16) * (num.superCrit ? 0.68 : num.crit ? 0.52 : 0.36),
          fontSize = Math.round(
            Math.min(
              num.superCrit ? 32 : 28,
              (num.superCrit ? 19 : num.crit ? 16.5 : num.burn ? 10 : 12) + 3.5 * Math.log10(1 + Math.max(0, num.v)),
            ) * pop,
          );
        this.setFont(`700 ${fontSize}px "Instrument Sans", system-ui, sans-serif`);
        let text = String(Math.max(1, Math.round(num.v))) + (num.superCrit ? "\u2605" : num.crit ? "!" : "");
        ctx.globalAlpha = alpha;
        ctx.lineJoin = "round";
        ctx.lineWidth = num.superCrit ? 5 : num.crit ? 4.4 : 3.8;
        ctx.strokeStyle = num.superCrit
          ? "rgba(120,44,6,0.95)"
          : num.crit
            ? "rgba(46,20,8,0.92)"
            : "rgba(14,12,24,0.92)";
        ctx.strokeText(text, nx, ny);
        ctx.fillStyle = num.superCrit
          ? "#fff4b8"
          : num.crit
            ? "#ffe074"
            : num.burn
              ? "#ff9244"
              : num.shield
                ? "#94f4ff"
                : "#fff7e4";
        ctx.fillText(text, nx, ny);
      }
      ctx.globalAlpha = 1;
      let fewEnemies = world.enemies.length <= 6,
        margin = 26,
        botHud = Math.min(110, this.h * 0.22),
        topHud = Math.min(60, this.h * 0.12);
      const cx = this.w / 2,
        cy = this.h / 2,
        left = margin + safe.l,
        right = this.w - margin - safe.r,
        top = margin + safe.t + topHud,
        bottom = this.h - margin - safe.b - botHud;
      const placeMarker = () => {
        // Perspective mirrors a point only when its depth is behind the camera.
        const sign = pos.behind ? -1 : 1;
        const dx = (pos.x - cx) * sign,
          dy = (pos.y - cy) * sign;
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return false;
        const tx = dx === 0 ? Infinity : ((dx > 0 ? right : left) - cx) / dx;
        const ty = dy === 0 ? Infinity : ((dy > 0 ? bottom : top) - cy) / dy;
        const edge = Math.min(tx, ty);
        pos.x = cx + dx * edge;
        pos.y = cy + dy * edge;
        pos.angle = Math.atan2(dy, dx);
        return true;
      };
      for (let enemy of world.enemies) {
        let windingUp =
          enemy.st === 1 &&
          (enemy.type === "longshot" ||
            enemy.type === "blinkBlade" ||
            enemy.type === "bellCannon" ||
            enemy.type === "ironGolem" ||
            enemy.type === "bogHopper" ||
            enemy.type === "watchTower" ||
            enemy.type === "wildBoar" ||
            enemy.type === "burrowMole" ||
            enemy.type === "crystalTower" ||
            enemy.type === "starSpider");
        if (
          (!enemy.boss &&
            !enemy.caravan &&
            !fewEnemies &&
            !windingUp &&
            !(world.state === "fight" && world.stragglerT > 3)) ||
          inView(enemy.x, 0.6, enemy.y) ||
          !placeMarker()
        )
          continue;
        const color = windingUp
          ? "#e85448"
          : enemy.caravan
            ? "#ffd85a"
            : enemy.boss
              ? cssColor(bossDefs[enemy.type].color)
              : enemy.elite
                ? "#ffc84a"
                : cssColor(enemyDefs[enemy.type].color);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(pos.angle);
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(18,12,10,0.92)";
        ctx.lineWidth = 2.6;
        ctx.lineJoin = "round";
        ctx.globalAlpha = windingUp ? (Math.floor(this.time * 10) % 2 ? 1 : 0.48) : 0.92;
        ctx.beginPath();
        let scale = enemy.boss ? 1.5 : enemy.caravan ? 1.25 : 1;
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
          if (pickup.kind !== "heal" || inView(pickup.x, 0.5, pickup.y) || !placeMarker()) continue;
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.globalAlpha = 0.68 + Math.sin(this.time * 6) * 0.26;
          ctx.fillStyle = "rgba(18,14,12,0.9)";
          ctx.fillRect(-8.5, -4, 17, 8);
          ctx.fillRect(-4, -8.5, 8, 17);
          ctx.fillStyle = "#7ce69e";
          ctx.fillRect(-7, -2.5, 14, 5);
          ctx.fillRect(-2.5, -7, 5, 14);
          ctx.rotate(pos.angle);
          ctx.strokeStyle = "rgba(18,14,12,0.9)";
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
        let keepHurts = 0;
        for (let i = 0; i < this.hurts.length; i++) {
          let hurt = this.hurts[i];
          hurt.life -= dt;
          if (hurt.life > 0) {
            this.hurts[keepHurts++] = hurt;
            const from = renderer.project(player.x + hurt.dx, 0.6, player.y + hurt.dy, this.tmp2);
            if (pos.behind || from.behind) continue;
            const angle = Math.atan2(from.y - pos.y, from.x - pos.x);
            ctx.globalAlpha = Math.min(1, hurt.life / 0.5) * 0.85;
            ctx.strokeStyle = "#e04a3e";
            ctx.lineWidth = 6.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, angle - 0.42, angle + 0.42);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffe0c8";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius - 6.5, angle - 0.25, angle + 0.25);
            ctx.stroke();
          }
        }
        this.hurts.length = keepHurts;
        ctx.globalAlpha = 1;
        ctx.lineCap = "butt";
      }
      if (this.callouts.length && world.boss) {
        let callout = this.callouts[0];
        callout.life -= dt;
        renderer.project(world.boss.x, 4.2 + world.boss.r, world.boss.y, pos);
        if (callout.life > 0) {
          const alpha = Math.min(1, callout.life / 0.3);
          const bossCol = bossDefs[world.boss.type]?.color ? cssColor(bossDefs[world.boss.type].color) : "#dfba6a";
          this.setFont('700 14px "Instrument Sans", system-ui, sans-serif');
          const tw = ctx.measureText(callout.t).width;
          const pw = tw + 24,
            ph = 28;
          // Clamp callout pill inside visible viewport even when boss is near/off edge
          const bx = pos.vis ? clamp(pos.x, safe.l + pw * 0.5 + 12, this.w - safe.r - pw * 0.5 - 12) : this.w * 0.5;
          const by = pos.vis ? clamp(pos.y, safe.t + topHud + 34, this.h - safe.b - botHud - 24) : safe.t + topHud + 54;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = "rgba(20, 14, 10, 0.88)";
          fillPill(ctx, bx - pw * 0.5, by - ph * 0.5, pw, ph);
          ctx.strokeStyle = bossCol;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#fff4df";
          ctx.fillText(callout.t, bx, by + 0.5);
          ctx.restore();
        }
        if (callout.life <= 0) {
          this.callouts.length = 0;
        }
      }
      if (input) {
        this.drawSticks(input, opts);
      }
      // Smooth 0.45 s warm storybook crossfade veil when entering a new realm
      if (renderer.biomeFadeT > 0) {
        const vk = clamp(renderer.biomeFadeT / 0.45, 0, 1);
        ctx.fillStyle = `rgba(18, 13, 10, ${(vk * vk * 0.65).toFixed(3)})`;
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }
    drawSticks(input, opts) {
      let ctx = this.g;
      // a fixed move stick shows where it waits while no thumb is on it (only for touch play)
      if (input.fixedMove && !input.move.active && touchInput) {
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
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        let stick = sIdx === 0 ? input.move : input.aim;
        if (!stick || !stick.active) continue;
        let radius = input.R,
          isAim = sIdx === 1;
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
        this.setFont('700 13.5px "Instrument Sans", system-ui, sans-serif');
        ctx.textAlign = "center";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(18, 12, 8, 0.88)";
        ctx.fillStyle = "rgba(255, 240, 214, 0.92)";
        let y = this.h - (opts.safe ? opts.safe.b : 0) - 58;
        ctx.strokeText("DRAG HERE TO MOVE", this.w * 0.25, y);
        ctx.fillText("DRAG HERE TO MOVE", this.w * 0.25, y);
        ctx.strokeText("DRAG HERE TO AIM + FIRE", this.w * 0.75, y);
        ctx.fillText("DRAG HERE TO AIM + FIRE", this.w * 0.75, y);
      }
    }
  },
  cssColorCache = {};
function cssColor(color) {
  return cssColorCache[color] || (cssColorCache[color] = "#" + color.toString(16).padStart(6, "0"));
}

export { Overlay };
