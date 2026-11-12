// Source-aware arrivals, motion and attack release. Shared mechanics never imply another actor's theme.
import { BOSS_EFFECTS, ENEMY_EFFECTS } from "../data/combat-effects.js";
import { enemyDefs } from "../data/enemies.js";
import { hexColor } from "./materials.js";

const SAND = hexColor(0xc8b38b),
  ASH = hexColor(0x746c60),
  ICE = hexColor(0xc7f5ff),
  SHELL = hexColor(0xd8dbc8);
const EVENTS = new Set(["pop", "blink", "hatch", "lob", "thud", "phase", "enrage", "eshot"]);
export class ActorEffectsView {
  constructor(renderer) {
    this.r = renderer;
  }
  consume(ev, shake, world) {
    if (!EVENTS.has(ev.k)) return false;
    const r = this.r,
      source = ev.src || ev.boss || ev.id || ev.type,
      boss = BOSS_EFFECTS[source],
      color = hexColor(ev.phase ? 0xc581ff : boss?.color || enemyDefs[source]?.color || 0xb6bfc0),
      accent = hexColor(boss?.accent || 0xd3dedd),
      motion = ENEMY_EFFECTS[source]?.motion;
    switch (ev.k) {
      case "eshot": {
        const identity = boss || ENEMY_EFFECTS[source],
          angle =
            world?.boss?.type === source
              ? world.boss.face
              : Math.atan2((world?.player.y || 0) - ev.y, (world?.player.x || 0) - ev.x),
          reach = identity?.reach ?? 0.45,
          height = identity?.height || 1,
          x = ev.x + Math.cos(angle) * reach,
          z = ev.y + Math.sin(angle) * reach;
        r.burst(x, z, height, boss ? 4 : 2, 2, color, 0.14, 0.08, {
          spark: source !== "queen" && source !== "carrier",
          drag: 5,
        });
        if (boss) r.flash(x, z, 1.4, 0.2, color, 12);
        return true;
      }
      case "pop":
        r.burst(ev.x, ev.y, 0.75, 3, 2, ev.frost ? ICE : color, 0.15, 0.1, {
          spark: source === "prism" || source === "wyrm",
          drag: 5,
        });
        return true;
      case "blink": {
        if (ev.leap || motion === "leap") {
          r.burst(ev.x, ev.y, 0.15, 9, 3.5, hexColor(0x657660), 0.3, 0.18, { up: 1, drag: 3 });
          r.debrisBurst(ev.x, ev.y, 0.12, 3, hexColor(0x60584b), 0.065, 2);
        } else if (source === "wyrm") {
          r.smokeView.emit(ev.x, 0.25, ev.y, 1.3, 0xb6a381, 0.65);
          r.burst(ev.x, ev.y, 0.3, 16, 5, SAND, 0.55, 0.22, { up: 2, drag: 2 });
          r.burst(ev.x, ev.y, 0.6, 10, 5, accent, 0.35, 0.1, { spark: true, grav: 7 });
          r.ring(ev.x, ev.y, 0.3, 2.6, color, 0.28);
        } else {
          const height = ev.small ? 0.9 : 1.8,
            count = ev.small ? 10 : 20;
          r.burst(ev.x, ev.y, height, count, 5, color, 0.3, 0.15, { up: 1, drag: 4 });
          for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI * 2) / 3;
            r.line(
              ev.x - Math.cos(a),
              ev.y - Math.sin(a),
              ev.x + Math.cos(a),
              ev.y + Math.sin(a),
              accent,
              0.2,
              0.04,
              height,
              0.12,
            );
          }
          r.ring(ev.x, ev.y, 0.3, ev.small ? 1.4 : 2.5, color, 0.25);
        }
        return true;
      }
      case "hatch": {
        const summon = boss?.summon || "brood",
          big = ev.big ? 1.7 : 1;
        if (summon === "ember") {
          r.smokeView.emit(ev.x, 0.3, ev.y, 0.9 * big, 0x625f58, 0.65);
          r.burst(ev.x, ev.y, 0.35, Math.round(9 * big), 3, color, 0.6, 0.12, { up: 5, grav: 3, spark: true });
          r.debrisBurst(ev.x, ev.y, 0.25, 4, ASH, 0.1, 3);
          for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI * 2) / 3;
            r.line(ev.x, ev.y, ev.x + Math.cos(a) * big, ev.y + Math.sin(a) * big, color, 0.3, 0.055, 0.045, 0.14);
          }
        } else if (summon === "rift" || summon === "security" || summon === "frost") {
          r.burst(ev.x, ev.y, 0.8, Math.round(10 * big), 4, color, 0.5, 0.15, { up: 3, drag: 2, spark: true });
          r.ring(ev.x, ev.y, 0.2, 1.8 * big, color, 0.35);
          r.ring(ev.x, ev.y, 0.4, 1.2 * big, accent, 0.24, 0.25);
        } else {
          const bloom = hexColor(0x54ffc8);
          r.burst(ev.x, ev.y, 1, Math.round(7 * big), 3, bloom, 0.6, 0.16, { up: 1.5, grav: 4, drag: 2 });
          r.ring(ev.x, ev.y, 0.2, 1.3 * big, bloom, 0.3);
          r.debrisBurst(ev.x, ev.y, 0.5, ev.big ? 5 : 2, SHELL, 0.09, 3);
        }
        return true;
      }
      case "lob": {
        const cold = ev.frost;
        r.burst(ev.x, ev.y, 1.35, 6, 2.5, cold ? ICE : color, 0.3, 0.12, { up: 3, drag: 4, spark: !!cold });
        r.flash(ev.x, ev.y, 1.6, 0.35, cold ? ICE : color, 9);
        return true;
      }
      case "thud":
        r.addShake((ev.big ? 0.35 : 0.12) * shake);
        r.ring(ev.x, ev.y, 0.4, ev.big ? 3.1 : 1.5, color, 0.24);
        r.burst(ev.x, ev.y, 0.15, ev.big ? 12 : 5, 3, source === "wyrm" ? SAND : ASH, 0.35, 0.18, { up: 1, drag: 3 });
        return true;
      case "phase":
      case "enrage":
        r.ring(ev.x, ev.y, 1, 7, color, 0.5);
        r.burst(ev.x, ev.y, 1.2, 14, 4, accent, 0.55, 0.13, { up: 3, drag: 2, spark: true });
        r.addShake(0.4 * shake);
        return true;
      default:
        return false;
    }
  }
}
