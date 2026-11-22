// Enemy and boss behaviour (mu, vu) and enemy variants.

import { clamp, TAU, turnToward } from "./util.js";
import { SENTINEL_BEAMS as SENTINEL_SKIN } from "../data/combat-effects.js";

/* ---- stragglers: when only a few enemies are left for 9 s the game sets
 enemy.hunt so they come to the player. The 2.1/2.2 ranged enemies ignored
 it and could kite forever (the last Beacon fleeing into a corner). ---- */
const RL_KITERS = new Set(["turret", "minebot", "sapper", "sentinel", "carrier", "drone", "beacon", "weaver"]);
function updateEnemyCore(game, enemy, dt) {
  if (enemy.spawnT > 0) {
    enemy.vx = 0;
    enemy.vy = 0;
    return;
  }
  let player = game.player,
    dx = player.x - enemy.x,
    dy = player.y - enemy.y,
    dist = Math.hypot(dx, dy) || 0.001,
    ang = Math.atan2(dy, dx);
  game.chaseDir(enemy);
  let cdx = game.cdx,
    cdy = game.cdy,
    speed = enemy.speed,
    alive = player.alive;
  if (
    enemy.hunt &&
    (enemy.type === "gunner" ||
      enemy.type === "sniper" ||
      enemy.type === "hive" ||
      enemy.type === "mortar" ||
      enemy.type === "mender")
  ) {
    enemy.st = 0;
    enemy.vx = cdx * Math.max(speed, 2.6) * 1.3;
    enemy.vy = cdy * Math.max(speed, 2.6) * 1.3;
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
    return;
  }
  switch (enemy.type) {
    case "swarmer":
    case "mite": {
      let wobble = Math.sin(enemy.age * 6 + enemy.phase) * 0.45;
      enemy.vx = (cdx - cdy * wobble) * speed;
      enemy.vy = (cdy + cdx * wobble) * speed;
      break;
    }
    case "grunt":
    case "splitter":
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
      break;
    case "gunner": {
      if (enemy.st === 0) {
        if (dist > 11 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else if (dist < 6.5) {
          enemy.vx = (-dx / dist) * speed * 0.8;
          enemy.vy = (-dy / dist) * speed * 0.8;
        } else {
          let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.55;
          enemy.vy = (dx / dist) * side * speed * 0.55;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 15 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.45;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type });
        }
      } else {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          let shots = enemy.elite ? 3 : 1,
            shotSpeed = 8.2 + game.wave * 0.06;
          for (let k = 0; k < shots; k++)
            game.shoot(enemy.x, enemy.y, ang + (k - (shots - 1) / 2) * 0.2, shotSpeed, enemy.dmg);
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "gunner", frost: enemy.variant === "frost" });
          enemy.st = 0;
          enemy.t = 2.2 + game.rng.next() * 0.9;
        }
      }
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      return;
    }
    case "bomber": {
      if (enemy.st === 0) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
        if (dist < 1.9 + player.r && alive) {
          enemy.st = 1;
          enemy.t2 = 0.55;
          game.emit("fuse", { x: enemy.x, y: enemy.y });
        }
      } else {
        if (enemy.st === 1) {
          enemy.vx *= 0.85;
          enemy.vy *= 0.85;
          enemy.t2 -= dt;
          if (enemy.t2 <= 0) {
            enemy.st = 3;
            game.explode(enemy.x, enemy.y, 2.6, 30 * game.stats.dmgMul, {
              enemies: true,
              player: true,
              dmgPlayer: enemy.dmg,
              knock: 5,
              kind: "bomber",
            });
            game.killEnemy(enemy);
          }
        }
      }
      break;
    }
    case "brute": {
      if (enemy.st === 0) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 10 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.8;
          enemy.ta = ang;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: "brute" });
        }
      } else if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.t2 > 0.35) {
          enemy.ta = turnToward(enemy.ta, ang, 2.5 * dt);
        }
        enemy.face = turnToward(enemy.face, enemy.ta, 10 * dt);
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 2;
          enemy.t2 = 0.6;
        }
        return;
      } else if (enemy.st === 2) {
        enemy.vx = Math.cos(enemy.ta) * 15;
        enemy.vy = Math.sin(enemy.ta) * 15;
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.hitWall && enemy.t2 < 0.5) {
          enemy.st = 3;
          enemy.t2 = 0.8;
          game.emit("thud", { x: enemy.x, y: enemy.y });
        } else {
          if (enemy.t2 <= 0) {
            enemy.st = 0;
            enemy.t = 2.8 + game.rng.next() * 1.4;
          }
        }
        return;
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 0;
          enemy.t = 2.5 + game.rng.next();
        }
        return;
      }
      break;
    }
    case "sniper": {
      if (enemy.st === 0) {
        if (dist > 14.5 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else if (dist < 9.5) {
          enemy.vx = (-dx / dist) * speed;
          enemy.vy = (-dy / dist) * speed;
        } else {
          let side = Math.cos(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.4;
          enemy.vy = (dx / dist) * side * speed * 0.4;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 19 && alive) {
          enemy.st = 1;
          enemy.t2 = 1.25;
          enemy.ta = ang;
          game.emit("aim", { x: enemy.x, y: enemy.y });
        }
      } else {
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.t2 > 0.35) {
          enemy.ta = turnToward(enemy.ta, ang, 3 * dt);
        }
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.shoot(enemy.x + Math.cos(enemy.ta) * 0.7, enemy.y + Math.sin(enemy.ta) * 0.7, enemy.ta, 22, enemy.dmg, {
            kind: "fast",
            r: 0.2,
          });
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "sniper", frost: enemy.variant === "frost" });
          enemy.st = 0;
          enemy.t = 3 + game.rng.next() * 1.2;
        }
      }
      enemy.face = turnToward(enemy.face, enemy.st === 1 ? enemy.ta : ang, 8 * dt);
      return;
    }
    case "hive": {
      if (dist > 6 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
      }
      enemy.t -= dt;
      let maxKids = enemy.elite ? 7 : 5;
      const spawnNow = enemy.t <= 0;
      if (spawnNow) enemy.t = 3.2;
      if (spawnNow && enemy.kids < maxKids && game.enemies.length < 75) {
        let angle = game.rng.next() * TAU,
          kid = game.spawnEnemy(
            "swarmer",
            enemy.x + Math.cos(angle) * (enemy.r + 0.5),
            enemy.y + Math.sin(angle) * (enemy.r + 0.5),
            {
              parent: enemy.id,
              // 3.46.0: the parent by reference — killEnemy no longer scans every enemy per kid
              parentRef: enemy,
              hpF: 0.8,
            },
          );
        kid.spawnT = 0.15;
        kid.noDrop = game.rng.chance(0.5);
        enemy.kids++;
        game.emit("hatch", { x: enemy.x, y: enemy.y });
      }
      enemy.face += dt * 0.6;
      return;
    }
    case "bulwark": {
      if (enemy.guardFlash > 0) {
        enemy.guardFlash -= dt * 5;
      }
      if (enemy.guardDown > 0) {
        enemy.guardDown -= dt;
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        if (enemy.guardDown <= 0) {
          enemy.guard = enemy.guardMax;
          game.emit("guardUp", { x: enemy.x, y: enemy.y });
        }
        return;
      }
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
      enemy.face = turnToward(enemy.face, ang, 0.95 * dt);
      return;
    }
    case "striker": {
      if (enemy.st === 0) {
        if (dist > 7 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
          enemy.vx = (-dy / dist) * side * speed * 0.6;
          enemy.vy = (dx / dist) * side * speed * 0.6;
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 13 && alive) {
          let away = Math.atan2(enemy.y - player.y, enemy.x - player.x),
            first = game.rng.chance(0.5) ? 1 : -1,
            spot = null;
          for (let side of [first, -first]) {
            let angle = away + side * 1.35,
              sx = player.x + Math.cos(angle) * 3.3,
              sy = player.y + Math.sin(angle) * 3.3;
            if (!game.arena.outside(sx, sy, 1) && !game.arena.blocked(sx, sy, enemy.r + 0.3)) {
              spot = { x: sx, y: sy };
              break;
            }
          }
          if (spot) {
            enemy.st = 1;
            enemy.t2 = 0.7;
            enemy.tx = spot.x;
            enemy.ty = spot.y;
            game.emit("blinkWarn", { x: spot.x, y: spot.y });
          } else {
            enemy.t = 0.8;
          }
        }
        break;
      }
      if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.emit("blink", { x: enemy.x, y: enemy.y, small: true });
          enemy.x = enemy.tx;
          enemy.y = enemy.ty;
          game.arena.resolve(enemy, enemy.r);
          game.emit("blink", { x: enemy.x, y: enemy.y, small: true, in: true });
          enemy.st = 2;
          enemy.t2 = 0.32;
          enemy.ta = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        }
        return;
      }
      if (enemy.st === 2) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.face = turnToward(enemy.face, enemy.ta, 14 * dt);
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 3;
          enemy.t2 = 0.24;
          game.emit("charge", { x: enemy.x, y: enemy.y, type: "striker" });
        }
        return;
      }
      enemy.vx = Math.cos(enemy.ta) * 17;
      enemy.vy = Math.sin(enemy.ta) * 17;
      enemy.face = enemy.ta;
      enemy.t2 -= dt;
      if (enemy.t2 <= 0 || (enemy.hitWall && enemy.t2 < 0.2)) {
        enemy.st = 0;
        enemy.t = 3 + game.rng.next() * 1.5;
      }
      return;
    }
    case "leaper": {
      if (enemy.st === 0) {
        if (dist > 6.5 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          enemy.t -= dt;
          if (enemy.t <= 0 && alive) {
            enemy.st = 1;
            enemy.t2 = 0.55;
            enemy.ta = ang;
            game.emit("charge", { x: enemy.x, y: enemy.y, type: "leaper" });
          }
        }
      } else if (enemy.st === 1) {
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.ta = turnToward(enemy.ta, ang, 3.8 * dt);
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 2;
          enemy.t2 = 0.6;
          enemy.vx = Math.cos(enemy.ta) * 13;
          enemy.vy = Math.sin(enemy.ta) * 13;
          game.emit("blink", { x: enemy.x, y: enemy.y, leap: true });
        }
      } else {
        enemy.t2 -= dt;
        enemy.vx *= 0.975;
        enemy.vy *= 0.975;
        if (enemy.hitWall || enemy.t2 <= 0) {
          enemy.st = 0;
          enemy.t = 2.2 + game.rng.next() * 1.3;
          enemy.hitWall = false;
        }
      }
      enemy.face = turnToward(enemy.face, enemy.st === 1 ? enemy.ta : Math.atan2(enemy.vy, enemy.vx), 10 * dt);
      return;
    }
    case "turret": {
      if (enemy.st === 0) {
        if (dist > 16 || !enemy.los) {
          enemy.vx = cdx * speed;
          enemy.vy = cdy * speed;
        } else {
          if (dist < 8) {
            enemy.vx = (-dx / dist) * speed;
            enemy.vy = (-dy / dist) * speed;
          } else {
            enemy.vx *= 0.82;
            enemy.vy *= 0.82;
          }
        }
        enemy.t -= dt;
        if (enemy.t <= 0 && enemy.los && dist < 19 && alive) {
          enemy.st = 1;
          enemy.t2 = 0.62;
          enemy.ta = ang;
          game.emit("aim", { x: enemy.x, y: enemy.y, type: "turret" });
        }
      } else {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        enemy.ta = turnToward(enemy.ta, ang, 2.6 * dt);
        enemy.face = enemy.ta;
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          game.shoot(enemy.x + Math.cos(enemy.ta) * 0.7, enemy.y + Math.sin(enemy.ta) * 0.7, enemy.ta, 19, enemy.dmg, {
            kind: "turret",
            r: 0.21,
          });
          if (enemy.elite) {
            game.shoot(
              enemy.x + Math.cos(enemy.ta) * 0.7,
              enemy.y + Math.sin(enemy.ta) * 0.7,
              enemy.ta + (game.rng.chance(0.5) ? 0.12 : -0.12),
              19,
              enemy.dmg * 0.72,
              { kind: "turret", r: 0.18 },
            );
          }
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "turret" });
          enemy.st = 0;
          enemy.t = 2.4 + game.rng.next() * 1.1;
        }
      }
      return;
    }
    case "mender": {
      if (dist > 13 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else if (dist < 8) {
        enemy.vx = (-dx / dist) * speed;
        enemy.vy = (-dy / dist) * speed;
      } else {
        let side = Math.sin(enemy.phase) > 0 ? 1 : -1;
        enemy.vx = (-dy / dist) * side * speed * 0.5;
        enemy.vy = (dx / dist) * side * speed * 0.5;
      }
      enemy.t -= dt;
      if (enemy.t <= 0) {
        enemy.t = 2.8;
        let target = null,
          lowest = 0.92;
        game.hash.query(enemy.x, enemy.y, 9, (other) => {
          if (
            other.dead ||
            other === enemy ||
            other.boss ||
            other.type === "mender" ||
            Math.hypot(other.x - enemy.x, other.y - enemy.y) > 9
          )
            return;
          let frac = other.hp / other.maxHp;
          if (frac < lowest) {
            lowest = frac;
            target = other;
          }
        });
        if (target) {
          target.hp = Math.min(target.maxHp, target.hp + target.maxHp * (enemy.elite ? 0.22 : 0.15));
          game.emit("mend", { x: enemy.x, y: enemy.y, tx: target.x, ty: target.y });
        }
      }
      enemy.face = turnToward(enemy.face, ang, 5 * dt);
      return;
    }
    case "mortar": {
      if (dist > 16 || !enemy.los) {
        enemy.vx = cdx * speed;
        enemy.vy = cdy * speed;
      } else {
        if (dist < 9) {
          enemy.vx = (-dx / dist) * speed;
          enemy.vy = (-dy / dist) * speed;
        } else {
          enemy.vx *= 0.85;
          enemy.vy *= 0.85;
        }
      }
      enemy.t -= dt;
      if (enemy.st === 1) {
        enemy.t2 -= dt;
        if (enemy.t2 <= 0) {
          enemy.st = 0;
        }
      }
      if (enemy.t <= 0 && dist < 19 && alive) {
        let shots = enemy.elite ? 3 : 1;
        for (let k = 0; k < shots; k++) {
          let tx = player.x + player.vx * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0),
            ty = player.y + player.vy * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0);
          tx = Math.max(-game.arena.W + 1, Math.min(game.arena.W - 1, tx));
          ty = Math.max(-game.arena.H + 1, Math.min(game.arena.H - 1, ty));
          game.hazard({
            x: tx,
            y: ty,
            r: 2,
            delay: 1.5 + k * 0.15,
            dmg: enemy.dmg,
            kind: "mortar",
            sx: enemy.x,
            sy: enemy.y,
            // 3.32.0: the Frost variant's shells chill (the variant only touched bullets before, and a mortar fires none)
            chill: enemy.variant === "frost",
          });
        }
        game.emit("lob", { x: enemy.x, y: enemy.y, frost: enemy.variant === "frost" });
        enemy.st = 1;
        enemy.t2 = 0.35;
        enemy.t = (3.8 + game.rng.next() * 1.2) * (enemy.los ? 1 : 1.6);
      }
      enemy.face = turnToward(enemy.face, ang, 4 * dt);
      return;
    }
  }
  if (Math.hypot(enemy.vx, enemy.vy) > 0.2) {
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
  }
}
const bossPatterns = {
  bellkeeper: ["charge", "ring", "stomp", "charge", "ring", "stomp"],
  queen: ["summon", "spiral", "burst", "eggs", "spiral", "burst"],
  // 2.4.6: the Frost Prism (was: sweep, teleport, shards, lances, teleport, sweep)
  prism: ["frostbeam", "teleport", "frostnova", "icelances", "glacier", "teleport", "iceshards"],
  core: ["spiral", "summon", "ring", "cross", "burst", "rain"],
};
// 3.49.0: THE ASH TYRANT of the Ashfall Caldera: the cinder fan (a sweeping spray of molten
// slugs), the shoulder charge, the burning dead in the cracks, the quake slam, and the magma bombs (a lob where you are heading)
bossPatterns.tyrant = ["barrage", "charge", "summon", "ring", "barrage", "rain"];
// 3.56.0: THE GLASSWYRM of the Glass Flats: RISE (it swims under the glass and bursts up along a
// chain of bulges), SHARDS (fans of hot glass), SUNLANCE (the noon bent through its body into a
// sweeping beam) and MIRAGE (it dives and surfaces where you are not); its attacks are in
// updateGlasswyrm at the end of this file. It hunts alone - the desert is empty around it.
bossPatterns.wyrm = ["rise", "shards", "sunlance", "mirage"];
// 2.4.6: colour of the Frost Prism's live beams (the warning lines keep the warning colour)
const PRISM_ICE = 12578815;
// 3.56.0: the Glasswyrm's lance (the noon bent through glass) wears the sun skin
const WYRM_SUN = 0xffd98a;

const OVERDRIVE = {
    bellkeeper: "sealgrid",
    prism: "whiteout",
    queen: "plague",
    core: "collapse",
    tyrant: "firestorm",
    // the Glasswyrm's NOON: the sun stands still - a dial of lances turns around it while the glass bursts in rings
    wyrm: "noon",
  },
  /* the bosses that call reinforcements of their biome when enraged (the Queen and the Core summon anyway) */
  REINFORCE = { bellkeeper: true, prism: true, tyrant: true };
function initBoss(game, boss) {
  boss.st = "walk";
  boss.t = 2.2;
  boss.t2 = 0;
  boss.n = 0;
  boss.pattern = 0;
  boss.spin = 0;
  boss.phaseN = 1;
}
function nextBossAttack(game, boss) {
  let attacks = bossPatterns[boss.type];
  if (boss.odDue && OVERDRIVE[boss.type]) {
    boss.odDue = false;
    boss.st = OVERDRIVE[boss.type];
  } else {
    boss.st = attacks[boss.pattern % attacks.length];
    boss.pattern++;
    // a new cycle of the pattern: the enraged boss uses its Overdrive again
    if (boss.enraged && boss.pattern % attacks.length === 0) boss.odDue = true;
  }
  boss.t = 0;
  boss.t2 = 0;
  boss.n = 0;
  game.emit("bossAtk", { id: boss.type, atk: boss.st });
}
function endBossAttack(boss, delay) {
  boss.st = "walk";
  // 3.3.0: later bosses (a higher tier, see World.spawnBoss) rest less between attacks
  boss.t = delay * (boss.pace || 1);
  boss.n = 0;
  boss.t2 = 0;
}
function updateBoss(game, boss, dt) {
  if (boss.spawnT > 0) {
    boss.vx = 0;
    boss.vy = 0;
    return;
  }
  let player = game.player,
    dx = player.x - boss.x,
    dy = player.y - boss.y,
    dist = Math.hypot(dx, dy) || 0.001,
    aim = Math.atan2(dy, dx),
    hpFrac = boss.hp / boss.maxHp,
    shotDmg = boss.dmg * 0.7;
  if (!boss.enraged && hpFrac < (boss.type === "queen" ? 0.4 : 0.5)) {
    boss.enraged = true;
    boss.odDue = true;
    game.emit("enrage", { id: boss.type, x: boss.x, y: boss.y });
    if (REINFORCE[boss.type]) bossReinforce(game, boss);
  }
  let rage = boss.enraged ? 1 : 0;
  boss.spin += dt;
  if (boss.type === "core") {
    let phase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    if (phase !== boss.phaseN) {
      boss.phaseN = phase;
      boss.shieldT = 1.4;
      for (let shot of game.eb) shot.life = 0;
      game.beams.length = 0;
      game.emit("phase", { n: phase, x: boss.x, y: boss.y });
      endBossAttack(boss, 1.6);
    }
    if (boss.shieldT > 0) {
      boss.shieldT -= dt;
      boss.shielded = boss.shieldT > 0;
    }
  }
  if (boss.st === "walk") {
    boss.t -= dt;
    moveBoss(game, boss, dt, aim, dist);
    if (boss.t <= 0) {
      nextBossAttack(game, boss);
    }
    boss.face = turnToward(boss.face, aim, 3 * dt);
    return;
  }
  boss.t += dt;
  if (boss.st === OVERDRIVE[boss.type]) {
    updateOverdrive(game, boss, dt, aim, dist, shotDmg);
    return;
  }
  switch (boss.type) {
    case "bellkeeper": {
      if (boss.st === "charge") {
        // Belfry Rush: telegraphed rush leaving 2 delayed brass chime-inlays in its wake
        let charges = 2 + rage;
        if (boss.t2 === 0) {
          boss.t2 = 1;
          boss.ta = aim;
          boss.sub = 0;
          boss.subT = 0;
          boss.wakeN = 0;
          game.emit("charge", { x: boss.x, y: boss.y, type: "bellkeeper" });
        }
        boss.subT += dt;
        if (boss.sub === 0) {
          boss.vx = 0;
          boss.vy = 0;
          if (boss.subT < 0.5) {
            boss.ta = turnToward(boss.ta, aim, 3 * dt);
          }
          boss.face = turnToward(boss.face, boss.ta, 8 * dt);
          if (boss.subT > (rage ? 0.65 : 0.85)) {
            boss.sub = 1;
            boss.subT = 0;
            boss.wakeN = 0;
          }
        } else if (boss.sub === 1) {
          let chargeSpeed = rage ? 17.5 : 15;
          boss.vx = Math.cos(boss.ta) * chargeSpeed;
          boss.vy = Math.sin(boss.ta) * chargeSpeed;
          boss.charging = true;
          // Drop brass chime-inlays along the rush wake
          if (boss.wakeN < 2 && boss.subT >= 0.22 + boss.wakeN * 0.28) {
            boss.wakeN++;
            game.hazard({
              x: clamp(boss.x, -game.arena.W + 1.5, game.arena.W - 1.5),
              y: clamp(boss.y, -game.arena.H + 1.5, game.arena.H - 1.5),
              r: 1.9,
              delay: 0.95,
              dmg: boss.dmg * 0.72,
              kind: "stomp",
              src: "bellkeeper",
            });
          }
          if ((boss.hitWall && boss.subT > 0.1) || boss.subT > 0.8) {
            boss.charging = false;
            if (boss.hitWall) {
              game.emit("thud", { x: boss.x, y: boss.y, big: true });
              game.explode(boss.x, boss.y, 2.4, 0, { kind: "stomp", src: "bellkeeper" });
              if (rage) {
                shootRing(game, boss, 10, 7.5, shotDmg, boss.spin);
              }
            }
            boss.sub = 2;
            boss.subT = 0;
          }
        } else {
          boss.vx *= 0.8;
          boss.vy *= 0.8;
          if (boss.subT > 0.45) {
            boss.n++;
            if (boss.n >= charges) {
              endBossAttack(boss, 2.1 - rage * 0.55);
            } else {
              boss.sub = 0;
              boss.subT = 0;
              boss.ta = aim;
              game.emit("charge", { x: boss.x, y: boss.y, type: "bellkeeper" });
            }
          }
        }
        return;
      }
      if (boss.st === "ring") {
        // Brass Toll: rhythmic alternating fast outer bell-waves & slower counter-offset inner chimes
        boss.vx *= 0.85;
        boss.vy *= 0.85;
        let tolls = 3 + rage,
          gap = 0.54;
        if (boss.t >= 0.38 + boss.n * gap && boss.n < tolls) {
          const fast = boss.n % 2 === 0;
          const count = fast ? 14 + rage * 4 : 12 + rage * 4;
          const spd = fast ? 8.6 + rage * 0.8 : 5.8 + rage * 0.6;
          shootRing(game, boss, count, spd, shotDmg, boss.spin + (fast ? 0 : Math.PI / count));
          boss.n++;
        }
        if (boss.t > 0.38 + tolls * gap + 0.45) {
          endBossAttack(boss, 2.3 - rage * 0.65);
        }
        return;
      }
      if (boss.st === "stomp") {
        // Carillon Slam: 3-beat concentric ripple — inner slam, 4 cardinal chime-pads, then outer brass seal ring
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 4.2, delay: 0.95, dmg: boss.dmg, kind: "stomp", src: "bellkeeper" });
          game.emit("charge", { x: boss.x, y: boss.y, type: "bellkeeper" });
        }
        if (boss.n === 1 && boss.t >= 0.42) {
          boss.n = 2;
          const base = aim + (rage ? Math.PI / 4 : 0);
          const pads = rage ? 6 : 4;
          for (let k = 0; k < pads; k++) {
            const angle = base + (k / pads) * TAU;
            const px = clamp(boss.x + Math.cos(angle) * 5.6, -game.arena.W + 1.4, game.arena.W - 1.4);
            const py = clamp(boss.y + Math.sin(angle) * 5.6, -game.arena.H + 1.4, game.arena.H - 1.4);
            game.hazard({ x: px, y: py, r: 2.05, delay: 1.05, dmg: boss.dmg * 0.8, kind: "stomp", src: "bellkeeper" });
          }
        }
        if (boss.n === 2 && boss.t > 1.0) {
          boss.n = 3;
          shootRing(game, boss, 14 + rage * 4, 8.4, shotDmg, aim);
          game.emit("thud", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.75) {
          endBossAttack(boss, 1.95 - rage * 0.35);
        }
        return;
      }
      break;
    }
    case "queen": {
      moveBoss(game, boss, dt, aim, dist, 0.4);
      if (boss.st === "summon") {
        // Mushroom Ring: protective spore-puff around herself while hatching a fairy-ring of marsh brood
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 3.4, delay: 0.85, dmg: boss.dmg * 0.72, kind: "rain", src: "queen" });
          let count = game.enemies.length > 70 ? 0 : 4 + rage * 2;
          for (let k = 0; k < count; k++) {
            let angle = (k / count) * TAU + boss.spin,
              kid = game.spawnEnemy(
                k % 2 ? "mite" : "swarmer",
                boss.x + Math.cos(angle) * 2.4,
                boss.y + Math.sin(angle) * 2.4,
                {
                  hpF: 1,
                },
              );
            kid.spawnT = 0.3;
            kid.noDrop = game.rng.chance(0.6);
            kid.kx = Math.cos(angle) * 5.5;
            kid.ky = Math.sin(angle) * 5.5;
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.1) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "spiral") {
        // Firefly Whirl: breathing dual-speed twin-helix spore waltz
        let arms = 3 + rage;
        for (boss.t2 += dt; boss.t2 > 0.12;) {
          boss.t2 -= 0.12;
          const sway = Math.sin(boss.t * 3.2) * 0.14;
          boss.ta = (boss.ta || 0) + 0.22 + sway;
          const fast = boss.n++ % 2 === 0;
          const spd = fast ? 7.4 : 4.9;
          for (let k = 0; k < arms; k++)
            game.shoot(boss.x, boss.y, boss.ta + (k / arms) * TAU, spd, shotDmg, { r: fast ? 0.25 : 0.29 });
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 3.1) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "burst") {
        // Nectar Salvo: flanking arcing marsh globules paired with tight aimed spore fans
        if (boss.n === 0) {
          for (const side of [-1, 1]) {
            const a = aim + side * 0.55;
            const tx = clamp(player.x + Math.cos(a) * 3.0, -game.arena.W + 1.2, game.arena.W - 1.2);
            const ty = clamp(player.y + Math.sin(a) * 3.0, -game.arena.H + 1.2, game.arena.H - 1.2);
            game.hazard({
              x: tx,
              y: ty,
              r: 1.75,
              delay: 1.15,
              dmg: boss.dmg * 0.7,
              kind: "mortar",
              src: "queen",
              sx: boss.x,
              sy: boss.y,
            });
          }
        }
        if (boss.t >= 0.35 + boss.n * 0.44 && boss.n < 3 + rage) {
          for (let k = 0; k < 5; k++) game.shoot(boss.x, boss.y, aim + (k - 2) * 0.15, 9.2, shotDmg);
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type });
        }
        if (boss.t > 2.1) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "eggs") {
        // Spore Clutch: hatches marsh Spore-Pods (splitters) & Podlings in glowing pools (zero clockwork bombers!)
        if (boss.n === 0) {
          boss.n = 1;
          const room = Math.max(0, 70 - game.enemies.length);
          const count = Math.min(room, 2 + rage);
          for (let k = 0; k < count; k++) {
            let angle = aim + (k - (count - 1) / 2) * 0.65,
              kind = k % 2 === 0 ? "splitter" : "mite",
              egg = game.spawnEnemy(kind, boss.x + Math.cos(angle) * 2.1, boss.y + Math.sin(angle) * 2.1, {
                hpF: kind === "splitter" ? 0.65 : 1,
              });
            egg.spawnT = 0.3;
            egg.kx = Math.cos(angle) * 8.5;
            egg.ky = Math.sin(angle) * 8.5;
            egg.noDrop = true;
            if (game.arena.acid.filter((puddle) => puddle.life != null).length < 12) {
              game.arena.acid.push({
                x: clamp(boss.x + Math.cos(angle) * 2.2, -game.arena.W + 1, game.arena.W - 1),
                y: clamp(boss.y + Math.sin(angle) * 2.2, -game.arena.H + 1, game.arena.H - 1),
                r: 1.45,
                life: 5.0,
              });
            }
          }
          // Lob 2 glowing spore globules ahead of the player
          for (let k = 0; k < 2; k++) {
            const tx = clamp(player.x + player.vx * (0.6 + k * 0.45), -game.arena.W + 1.2, game.arena.W - 1.2);
            const ty = clamp(player.y + player.vy * (0.6 + k * 0.45), -game.arena.H + 1.2, game.arena.H - 1.2);
            game.hazard({
              x: tx,
              y: ty,
              r: 1.75,
              delay: 1.05 + k * 0.25,
              dmg: boss.dmg * 0.72,
              kind: "mortar",
              src: "queen",
              sx: boss.x,
              sy: boss.y,
            });
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.35) {
          endBossAttack(boss, 1.55);
        }
        return;
      }
      break;
    }
    case "prism": {
      if (boss.st === "frostbeam") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        if (boss.n === 0) {
          boss.n = 1;
          let dir = game.rng.chance(0.5) ? 1 : -1,
            angle = aim - dir * 1.15,
            rot = dir * (rage ? 1.25 : 1),
            beam = {
              x: boss.x,
              y: boss.y,
              rot,
              warn: 0.95,
              dur: 2.2,
              w: 0.85,
              dmg: boss.dmg,
              follow: boss,
              len: 34,
              color: PRISM_ICE,
              skin: "cryo",
            };
          game.beam({ ...beam, a: angle });
          if (rage) {
            game.beam({ ...beam, a: angle + Math.PI });
          }
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "cryo" });
        }
        if (boss.t > 3.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "teleport") {
        // Prism Blink: leaves a crystalline departure burst before reappearing with a rime ring
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          boss.ghost = true;
          shootRing(game, boss, 8, 5.2, shotDmg * 0.85, boss.spin, "shard");
          game.emit("blink", { x: boss.x, y: boss.y });
        }
        if (boss.n === 1 && boss.t > 0.45) {
          boss.n = 2;
          let spot = findOpenSpot(game, player.x, player.y, 8, 10.5);
          if (spot) {
            boss.tx = spot.x;
            boss.ty = spot.y;
            game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 99, type: "_prism", done: false, fake: true });
          } else {
            boss.tx = boss.x;
            boss.ty = boss.y;
          }
        }
        if (boss.n === 2 && boss.t > 1.15) {
          boss.n = 3;
          game.markers = game.markers.filter((marker) => !marker.fake);
          boss.x = boss.tx;
          boss.y = boss.ty;
          boss.ghost = false;
          shootRing(game, boss, 12 + rage * 4, 6.5, shotDmg, boss.spin, "shard");
          game.emit("blink", { x: boss.x, y: boss.y, in: true });
        }
        if (boss.t > 1.6) {
          endBossAttack(boss, 0.9);
        }
        return;
      }
      if (boss.st === "iceshards") {
        moveBoss(game, boss, dt, aim, dist, 0.3);
        if (boss.t >= 0.3 + boss.n * 0.12 && boss.n < 8 + rage * 4) {
          let angle = aim + Math.PI + (boss.n - 4) * 0.4;
          game.shoot(boss.x, boss.y, angle, 5.5, shotDmg, { kind: "shard", homing: 1.3, life: 5, r: 0.24 });
          bossVolley(game, boss, 0.25);
          boss.n++;
        }
        if (boss.t > 2.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "icelances") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        let count = 3 + rage * 2;
        if (boss.t >= 0.2 + boss.n * 0.45 && boss.n < count) {
          let tx = player.x + player.vx * 0.5,
            ty = player.y + player.vy * 0.5;
          game.beam({
            x: boss.x,
            y: boss.y,
            a: Math.atan2(ty - boss.y, tx - boss.x),
            warn: 0.6,
            dur: 0.22,
            w: 1,
            dmg: boss.dmg,
            len: 34,
            color: PRISM_ICE,
            skin: "cryo",
          });
          boss.n++;
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, small: true, skin: "cryo" });
        }
        if (boss.t > 0.2 + count * 0.45 + 0.8) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "frostnova") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        let rings = 2 + rage;
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 3.6, delay: 0.9, dmg: boss.dmg * 0.8, kind: "frost" });
          game.emit("charge", { x: boss.x, y: boss.y, type: "prism" });
        }
        if (boss.n >= 1 && boss.n <= rings && boss.t >= 0.9 + (boss.n - 1) * 0.45) {
          let shots = 14 + rage * 2;
          shootRing(
            game,
            boss,
            shots,
            5.2 + boss.n * 0.9,
            shotDmg,
            boss.spin + ((boss.n % 2) * Math.PI) / shots,
            "shard",
          );
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type });
        }
        if (boss.t > 0.9 + rings * 0.45 + 0.5) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "glacier") {
        // Permafrost: advancing glacial fracture line chasing across the ice toward the player
        moveBoss(game, boss, dt, aim, dist, 0.5);
        if (boss.n === 0) {
          boss.n = 1;
          game.emit("charge", { x: boss.x, y: boss.y, type: "prism" });
          const steps = 4 + rage;
          const dir = aim;
          for (let k = 0; k < steps; k++) {
            const reach = 3.2 + k * 2.55;
            const px = clamp(boss.x + Math.cos(dir) * reach, -game.arena.W + 1.4, game.arena.W - 1.4);
            const py = clamp(boss.y + Math.sin(dir) * reach, -game.arena.H + 1.4, game.arena.H - 1.4);
            game.hazard({
              x: px,
              y: py,
              r: 2.15,
              delay: 0.95 + k * 0.16,
              dmg: boss.dmg * 0.58,
              kind: "glacier",
            });
          }
          if (rage) {
            const spot = findOpenSpot(game, player.x, player.y, 2.0, 4.5);
            if (spot) game.hazard({ x: spot.x, y: spot.y, r: 2.3, delay: 1.35, dmg: boss.dmg * 0.55, kind: "glacier" });
          }
        }
        if (boss.t > 2.5) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      break;
    }
    case "core": {
      let phase = boss.phaseN;
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.st === "spiral") {
        // Orrery Waltz: dual counter-rotating armillary star-spirals
        let arms = 3 + phase;
        boss.t2 += dt;
        let interval = phase === 3 ? 0.1 : 0.12;
        for (; boss.t2 > interval;) {
          boss.t2 -= interval;
          boss.ta = (boss.ta || 0) + 0.21;
          const step = boss.n++;
          const counter = phase >= 2 && step % 2 === 1;
          const base = counter ? -boss.ta : boss.ta;
          const spd = counter ? 7.6 + phase * 0.4 : 5.4 + phase * 0.35;
          for (let k = 0; k < arms; k++)
            game.shoot(boss.x, boss.y, base + (k / arms) * TAU, spd, shotDmg, { r: counter ? 0.23 : 0.27 });
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 3) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "summon") {
        // Astral Choir: summons authentic Star-Vault spirits & sprites
        if (boss.n === 0) {
          boss.n = 1;
          let types =
            phase === 1
              ? ["striker", "drone", "striker", "drone"]
              : phase === 2
                ? ["phantom", "striker", "drone", "phantom"]
                : ["weaver", "phantom", "striker", "weaver"];
          const room = Math.max(0, 74 - game.enemies.length - game.markers.length);
          types = types.slice(0, room);
          for (let type of types) {
            let spot = game.arena.freePoint(game.rng, player.x, player.y, 7, 1);
            game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 1, type, elite: false, done: false, boss: boss.type });
          }
          game.emit("portal", { x: boss.x, y: boss.y, n: types.length });
        }
        if (boss.t > 1) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "ring") {
        // Constellation: geometric 5-point (or 6-point) star-shaped expanding rings
        if (boss.t >= 0.32 + boss.n * 0.56 && boss.n < 2 + phase) {
          const count = 20 + phase * 5;
          const points = phase >= 3 ? 6 : 5;
          const start = boss.spin + boss.n * 0.32;
          for (let k = 0; k < count; k++) {
            const a = start + (k / count) * TAU;
            const starWave = Math.abs(Math.cos((k * points * Math.PI) / count));
            game.shoot(boss.x, boss.y, a, 5.2 + 2.8 * starWave, shotDmg, { r: 0.26 });
          }
          bossVolley(game, boss);
          boss.n++;
        }
        if (boss.t > 0.32 + (2 + phase) * 0.56 + 0.35) {
          endBossAttack(boss, 1.3);
        }
        return;
      }
      if (boss.st === "cross") {
        // Astral Loom: rotating celestial ribbons + aimed starlight chimes
        if (phase === 1) {
          nextBossAttack(game, boss);
          return;
        }
        if (boss.n === 0) {
          boss.n = 1;
          let count = phase === 3 ? 4 : 3,
            rot = (game.rng.chance(0.5) ? 1 : -1) * (phase === 3 ? 0.52 : 0.4);
          for (let k = 0; k < count; k++)
            game.beam({
              x: boss.x,
              y: boss.y,
              a: aim + 0.6 + (k / count) * TAU,
              rot,
              warn: 1.2,
              dur: 3.1,
              w: 0.9,
              dmg: boss.dmg,
              follow: boss,
              len: 34,
              skin: "rift",
            });
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "rift" });
        }
        if (phase === 3) boss.t2 += dt;
        if (phase === 3 && boss.t2 > 0.72) {
          boss.t2 = 0;
          for (let k = -1; k <= 1; k++) game.shoot(boss.x, boss.y, aim + k * 0.22, 8.5, shotDmg);
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 4.5) {
          endBossAttack(boss, 1.4);
        }
        return;
      }
      if (boss.st === "burst") {
        // Comet Fan: curved crescent comet arcs (center faster, wings trailing)
        if (boss.t >= 0.3 + boss.n * 0.42 && boss.n < 3 + phase) {
          const swing = (boss.n % 2 ? 1 : -1) * 0.08;
          for (let k = 0; k < 7; k++) {
            const off = k - 3;
            const spd = 10.6 - Math.abs(off) * 0.9 + phase * 0.4;
            game.shoot(boss.x, boss.y, aim + swing + off * 0.14, spd, shotDmg, { r: 0.26 });
          }
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type });
        }
        if (boss.t > 0.3 + (3 + phase) * 0.42 + 0.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      if (boss.st === "rain") {
        // Meteor Chime: geometric constellation star-ring of starfall strikes around the player
        if (boss.n === 0) {
          boss.n = 1;
          const pts = 4 + phase;
          const rot0 = boss.spin;
          game.hazard({
            x: clamp(player.x, -game.arena.W + 1.5, game.arena.W - 1.5),
            y: clamp(player.y, -game.arena.H + 1.5, game.arena.H - 1.5),
            r: 2.1,
            delay: 1.05,
            dmg: boss.dmg * 0.8,
            kind: "rain",
          });
          for (let k = 0; k < pts; k++) {
            const a = rot0 + (k / pts) * TAU;
            const px = clamp(player.x + Math.cos(a) * 4.6, -game.arena.W + 1.5, game.arena.W - 1.5);
            const py = clamp(player.y + Math.sin(a) * 4.6, -game.arena.H + 1.5, game.arena.H - 1.5);
            game.hazard({ x: px, y: py, r: 2.1, delay: 1.15 + k * 0.11, dmg: boss.dmg * 0.8, kind: "rain" });
          }
        }
        if (boss.t > 2.4) {
          endBossAttack(boss, 1.2);
        }
        return;
      }
      break;
    }
    // 3.56.0: THE GLASSWYRM of the Glass Flats
    case "wyrm":
      if (updateGlasswyrm(game, boss, dt, aim, dist, shotDmg, rage)) return;
      break;
    // THE ASH TYRANT of Ashfall Caldera — Forge-Lord of Anvil Cleaves, Radial Magma Fissures & Hearth-Storms
    case "tyrant": {
      if (boss.st === "barrage") {
        // Slag Foundry: sweeping molten hammer-fans + 2 arcing slag boulders
        boss.vx *= 0.82;
        boss.vy *= 0.82;
        if (boss.n === 0 && boss.t >= 0.25) {
          for (const side of [-0.55, 0.55]) {
            const tx = clamp(player.x + Math.cos(aim + side) * 2.8, -game.arena.W + 1.3, game.arena.W - 1.3);
            const ty = clamp(player.y + Math.sin(aim + side) * 2.8, -game.arena.H + 1.3, game.arena.H - 1.3);
            game.hazard({
              x: tx,
              y: ty,
              r: 1.8,
              delay: 1.1,
              dmg: boss.dmg * 0.72,
              kind: "rain",
              src: "tyrant",
              sx: boss.x,
              sy: boss.y,
            });
          }
        }
        if (boss.t >= 0.45 + boss.n * 0.5 && boss.n < 3 + rage) {
          const swing = (boss.n % 2 ? 1 : -1) * (0.14 + 0.05 * boss.n);
          for (let k = 0; k < 5; k++) game.shoot(boss.x, boss.y, aim + swing + (k - 2) * 0.13, 10.2, shotDmg);
          boss.n++;
          bossVolley(game, boss, 0.25);
        }
        if (boss.t > 2.3) endBossAttack(boss, 1.7 - rage * 0.35);
        return;
      }
      if (boss.st === "charge") {
        // Anvil Cleave: short heavy forge-surge followed by a 3-step directional molten fissure-cleave
        let cleaves = 1 + rage;
        if (boss.t2 === 0) {
          boss.t2 = 1;
          boss.ta = aim;
          boss.sub = 0;
          boss.subT = 0;
          game.emit("charge", { x: boss.x, y: boss.y, type: "tyrant" });
        }
        boss.subT += dt;
        if (boss.sub === 0) {
          boss.vx = 0;
          boss.vy = 0;
          if (boss.subT < 0.45) boss.ta = turnToward(boss.ta, aim, 3.2 * dt);
          boss.face = turnToward(boss.face, boss.ta, 8 * dt);
          if (boss.subT > (rage ? 0.58 : 0.72)) {
            boss.sub = 1;
            boss.subT = 0;
          }
        } else if (boss.sub === 1) {
          let chargeSpeed = rage ? 15.5 : 13.5;
          boss.vx = Math.cos(boss.ta) * chargeSpeed;
          boss.vy = Math.sin(boss.ta) * chargeSpeed;
          boss.charging = true;
          if ((boss.hitWall && boss.subT > 0.1) || boss.subT > 0.42) {
            boss.charging = false;
            game.emit("thud", { x: boss.x, y: boss.y, big: true });
            // Unleash 3 sequential molten fissure-cracks forward along boss.ta
            for (let k = 0; k < 3 + rage; k++) {
              const reach = 2.6 + k * 2.5;
              const fx = clamp(boss.x + Math.cos(boss.ta) * reach, -game.arena.W + 1.2, game.arena.W - 1.2);
              const fy = clamp(boss.y + Math.sin(boss.ta) * reach, -game.arena.H + 1.2, game.arena.H - 1.2);
              game.hazard({
                x: fx,
                y: fy,
                r: 1.85,
                delay: 0.62 + k * 0.14,
                dmg: boss.dmg * 0.82,
                kind: "stomp",
                src: "tyrant",
              });
            }
            if (rage) shootRing(game, boss, 10, 7.8, shotDmg, boss.ta);
            boss.sub = 2;
            boss.subT = 0;
          }
        } else {
          boss.vx *= 0.8;
          boss.vy *= 0.8;
          if (boss.subT > 0.5) {
            boss.n++;
            if (boss.n >= cleaves) endBossAttack(boss, 1.9 - rage * 0.45);
            else {
              boss.sub = 0;
              boss.subT = 0;
              boss.ta = aim;
              game.emit("charge", { x: boss.x, y: boss.y, type: "tyrant" });
            }
          }
        }
        return;
      }
      if (boss.st === "summon") {
        // Forge-Kin: calls Caldera smith-kin alongside a protective bellows ember-quake
        moveBoss(game, boss, dt, aim, dist, 0.35);
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 3.6, delay: 0.9, dmg: boss.dmg * 0.78, kind: "stomp", src: "tyrant" });
          let count = game.enemies.length > 70 ? 0 : 4 + rage * 2,
            crew = ["bomber", "grunt", "gunner"];
          for (let k = 0; k < count; k++) {
            let angle = (k / count) * TAU + boss.spin,
              kid = game.spawnEnemy(crew[k % 3], boss.x + Math.cos(angle) * 2.5, boss.y + Math.sin(angle) * 2.5, {
                hpF: 1,
              });
            kid.spawnT = 0.3;
            kid.noDrop = game.rng.chance(0.6);
            kid.kx = Math.cos(angle) * 5;
            kid.ky = Math.sin(angle) * 5;
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.15) endBossAttack(boss, 1.5);
        return;
      }
      if (boss.st === "ring") {
        // Caldera Quake: 4-spoke radial magma fissure cross erupting outward + cinder-slug ring
        boss.vx *= 0.85;
        boss.vy *= 0.85;
        if (boss.n === 0) {
          boss.n = 1;
          const base = aim + Math.PI / 4;
          for (let spoke = 0; spoke < 4; spoke++) {
            const a = base + (spoke / 4) * TAU;
            for (let step = 0; step < 2 + rage; step++) {
              const reach = 3.0 + step * 2.7;
              const fx = boss.x + Math.cos(a) * reach;
              const fy = boss.y + Math.sin(a) * reach;
              if (game.arena.outside(fx, fy, 1.0)) continue;
              game.hazard({
                x: fx,
                y: fy,
                r: 1.75,
                delay: 0.85 + step * 0.22,
                dmg: boss.dmg * 0.8,
                kind: "stomp",
                src: "tyrant",
              });
            }
          }
          game.emit("charge", { x: boss.x, y: boss.y, type: "tyrant" });
        }
        if (boss.n === 1 && boss.t >= 0.95) {
          boss.n = 2;
          shootRing(game, boss, 14 + rage * 6, 8.2 + rage * 0.6, shotDmg, aim);
          game.emit("thud", { x: boss.x, y: boss.y, big: true });
        }
        if (boss.t > 1.9) endBossAttack(boss, 2.0 - rage * 0.5);
        return;
      }
      if (boss.st === "rain") {
        // Crucible Rain: dramatic arcing barrage of glowing forge-boulders leading the player
        moveBoss(game, boss, dt, aim, dist, 0.4);
        if (boss.t >= 0.42 + boss.n * 0.48 && boss.n < 5 + rage) {
          const lead = 1.25,
            tx = clamp(player.x + player.vx * lead, -game.arena.W + 1.2, game.arena.W - 1.2),
            ty = clamp(player.y + player.vy * lead, -game.arena.H + 1.2, game.arena.H - 1.2);
          game.hazard({
            x: tx,
            y: ty,
            r: 1.95,
            delay: 1.1,
            dmg: boss.dmg * 0.75,
            kind: "rain",
            src: "tyrant",
            sx: boss.x,
            sy: boss.y,
          });
          boss.n++;
        }
        if (boss.t > 3.1) endBossAttack(boss, 1.45);
        return;
      }
      break;
    }
  }
  endBossAttack(boss, 1);
}

function bossReinforce(game, boss) {
  if (game.enemies.length > 60) return;
  const count = 2 + Math.min(3, Math.floor((boss.tier || 0) / 2)),
    biome = game.arena.biome.id;
  for (let k = 0; k < count; k++) {
    const spot = game.arena.freePoint(game.rng, game.player.x, game.player.y, 7, 1.2);
    if (!spot) continue;
    const type = game.championType(biome, game.wave, game.rng);
    game.markers.push({ x: spot.x, y: spot.y, t: 0, dur: 1.3, type, elite: false, done: false, boss: boss.type });
  }
  game.emit("portal", { x: boss.x, y: boss.y, n: count });
}
/* the five Overdrive attacks (see OVERDRIVE) */
function updateOverdrive(game, boss, dt, aim, dist, shotDmg) {
  const player = game.player,
    arena = game.arena,
    W = arena.W,
    H = arena.H;
  switch (boss.st) {
    case "sealgrid": {
      // Carillon Chime: paired golden lantern corridors frame a generous courtyard center, then pivot 45 deg
      // while four corner bell-slams ring out and a grand brass toll closes the cadence
      boss.vx = 0;
      boss.vy = 0;
      const corridorPair = (angle, warn) => {
        const span = Math.hypot(W, H) * 2 + 2,
          nx = -Math.sin(angle),
          ny = Math.cos(angle);
        for (const offset of [-5.2, 5.2]) {
          const cx = nx * offset,
            cy = ny * offset;
          game.beam({
            x: cx - Math.cos(angle) * (span * 0.5),
            y: cy - Math.sin(angle) * (span * 0.5),
            a: angle,
            len: span,
            warn,
            dur: 1.15,
            w: 0.78,
            dmg: boss.dmg,
            skin: "laser",
          });
        }
      };
      if (boss.n === 0) {
        boss.n = 1;
        corridorPair(0, 1.25);
        corridorPair(Math.PI / 2, 1.25);
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "laser" });
        game.emit("charge", { x: boss.x, y: boss.y, type: "bellkeeper" });
      }
      if (boss.n === 1 && boss.t > 2.35) {
        boss.n = 2;
        corridorPair(Math.PI / 4, 1.1);
        corridorPair((3 * Math.PI) / 4, 1.1);
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "laser" });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4,
            cx = clamp(boss.x + Math.cos(a) * 6.8, -W + 1.8, W - 1.8),
            cy = clamp(boss.y + Math.sin(a) * 6.8, -H + 1.8, H - 1.8);
          game.hazard({ x: cx, y: cy, r: 2.0, delay: 1.05, dmg: boss.dmg * 0.78, kind: "stomp", src: "bellkeeper" });
        }
      }
      if (boss.n === 2 && boss.t > 4.0) {
        boss.n = 3;
        shootRing(game, boss, 20, 7.6, shotDmg, boss.spin);
        game.emit("thud", { x: boss.x, y: boss.y, big: true });
      }
      if (boss.t > 4.65) endBossAttack(boss, 1.8);
      return;
    }
    case "whiteout": {
      // three frost beams turn around the Prism, ice shards hunt the player in between
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        const dir = game.rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 3; k++)
          game.beam({
            x: boss.x,
            y: boss.y,
            a: aim + 0.9 + (k / 3) * TAU,
            rot: dir * 0.9,
            warn: 1.1,
            dur: 3.2,
            w: 0.85,
            dmg: boss.dmg,
            follow: boss,
            len: 34,
            color: PRISM_ICE,
            // 3.33.0: a lance of ice (it was the plain beam of 2.4.6 in the Prism's colour)
            skin: "cryo",
          });
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "cryo" });
      }
      if (boss.t >= 1.4 + (boss.n - 1) * 0.5 && boss.n <= 6) {
        game.shoot(boss.x, boss.y, aim + (boss.n - 3.5) * 0.5, 5.5, shotDmg, {
          kind: "shard",
          homing: 1.2,
          life: 4,
          r: 0.24,
        });
        bossVolley(game, boss, 0.25);
        boss.n++;
      }
      if (boss.t > 4.6) endBossAttack(boss, 1.4);
      return;
    }
    case "plague": {
      // Tidal Bloom: a staggered fairy-ring of bog blooms swells around the player, two marsh Spore-Pods hatch,
      // and a counter-twirling firefly helix drifts outward
      moveBoss(game, boss, dt, aim, dist, 0.3);
      if (boss.n === 0) {
        boss.n = 1;
        const start = game.rng.next() * TAU;
        for (let k = 0; k < 6; k++) {
          const angle = start + (k / 6) * TAU,
            x = clamp(player.x + Math.cos(angle) * 4.7, -W + 1, W - 1),
            y = clamp(player.y + Math.sin(angle) * 4.7, -H + 1, H - 1);
          game.hazard({
            x,
            y,
            r: 1.55,
            delay: 0.85 + k * 0.14,
            dmg: boss.dmg * 0.62,
            kind: "rain",
            sx: boss.x,
            sy: boss.y,
          });
          if (arena.acid.filter((puddle) => puddle.life != null).length < 16)
            arena.acid.push({ x, y, r: 1.4, life: 6 });
        }
        for (let k = 0; k < 2; k++) {
          const angle = aim + (k ? 0.75 : -0.75),
            egg = game.spawnEnemy("splitter", boss.x + Math.cos(angle) * 2.1, boss.y + Math.sin(angle) * 2.1, {});
          egg.spawnT = 0.3;
          egg.noDrop = true;
          egg.kx = Math.cos(angle) * 8.5;
          egg.ky = Math.sin(angle) * 8.5;
        }
        game.emit("hatch", { x: boss.x, y: boss.y, big: true });
      }
      if (boss.t > 1.15)
        for (boss.t2 += dt; boss.t2 > 0.13;) {
          boss.t2 -= 0.13;
          boss.ta = (boss.ta || 0) + 0.3;
          for (let k = 0; k < 3; k++) {
            const base = (k / 3) * TAU;
            game.shoot(boss.x, boss.y, boss.ta + base, 6.9, shotDmg, { r: 0.25 });
            game.shoot(boss.x, boss.y, -boss.ta * 0.85 + base + 0.45, 5.2, shotDmg, { r: 0.23 });
          }
          bossVolley(game, boss, 0.3);
        }
      if (boss.t > 3.6) endBossAttack(boss, 1.4);
      return;
    }
    case "collapse": {
      // Celestial Convergence: a gentle astral tide draws inward as a 4-arm Astral Orrery revolves,
      // a spiraling constellation of 7 starfall meteors descends, and a closing star-ring pulses
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.t < 1.15 && dist > 3.0) {
        const pull = 3.2 * dt;
        player.x -= ((player.x - boss.x) / dist) * pull;
        player.y -= ((player.y - boss.y) / dist) * pull;
      }
      if (boss.n === 0) {
        boss.n = 1;
        const rot = game.rng.chance(0.5) ? 0.55 : -0.55;
        for (let k = 0; k < 4; k++)
          game.beam({
            x: boss.x,
            y: boss.y,
            a: aim + 0.65 + (k / 4) * TAU,
            rot,
            warn: 1.25,
            dur: 2.8,
            w: 0.82,
            dmg: boss.dmg,
            follow: boss,
            len: 32,
            skin: "rift",
          });
        const start = aim + 0.4;
        for (let k = 0; k < 7; k++) {
          const a = start + k * 1.12,
            rad = 2.0 + k * 0.72,
            x = clamp(player.x + Math.cos(a) * rad, -W + 1.5, W - 1.5),
            y = clamp(player.y + Math.sin(a) * rad, -H + 1.5, H - 1.5);
          game.hazard({
            x,
            y,
            r: 1.8,
            delay: 1.05 + k * 0.24,
            dmg: boss.dmg * 0.78,
            kind: "rain",
          });
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "rift" });
      }
      if (boss.n === 1 && boss.t >= 3.2) {
        boss.n = 2;
        shootRing(game, boss, 12, 7.2, shotDmg, boss.spin);
        bossVolley(game, boss, 0.35);
      }
      if (boss.t > 4.35) endBossAttack(boss, 1.4);
      return;
    }
    case "noon": {
      // 3.56.0: the Glasswyrm's NOON: the sun stands still - a dial of five lances turns around it,
      // the glass bursts in two gapped rings, and hot shards sprinkle where the drone stands
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        const dir = game.rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 5; k++)
          game.beam({
            x: boss.x,
            y: boss.y,
            a: aim + 0.7 + (k / 5) * TAU,
            rot: dir * 0.42,
            warn: 1.3,
            dur: 3.0,
            w: 0.8,
            dmg: boss.dmg,
            follow: boss,
            len: 30,
            color: WYRM_SUN,
            skin: "sun",
          });
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "sun" });
        for (let ring = 0; ring < 2; ring++) {
          const radius = 4 + ring * 4.4,
            count = Math.ceil((TAU * radius) / 2.6),
            gap = game.rng.next() * TAU;
          for (let k = 0; k < count; k++) {
            const angle = (k / count) * TAU,
              off = Math.abs(((angle - gap + Math.PI * 3) % TAU) - Math.PI);
            if (off < 0.6) continue;
            const x = boss.x + Math.cos(angle) * radius,
              y = boss.y + Math.sin(angle) * radius;
            if (arena.outside(x, y, 0.5)) continue;
            game.hazard({ x, y, r: 1.4, delay: 1 + ring * 0.5, dmg: boss.dmg * 0.75, kind: "stomp", src: "wyrm" });
          }
        }
      }
      if (boss.t >= 1.5 + (boss.n - 1) * 0.4 && boss.n <= 5) {
        game.shoot(boss.x, boss.y, aim + (boss.n - 3) * 0.4, 8, shotDmg);
        bossVolley(game, boss, 0.25);
        boss.n++;
      }
      if (boss.t > 4.6) endBossAttack(boss, 1.5);
      return;
    }
    case "firestorm": {
      // Hearth-Storm: the Ash Tyrant summons Caldera forge-kin, rings the player with gapped caldera bombs,
      // and sweeps twin counter-turning Dragon-Kiln flame streams alongside aimed cinder volleys
      moveBoss(game, boss, dt, aim, dist, 0.28);
      if (boss.n === 0) {
        boss.n = 1;
        bossReinforce(game, boss);
        let count = game.enemies.length > 70 ? 0 : 3 + Math.min(3, boss.tier || 0),
          crew = ["gunner", "bomber", "brute"];
        for (let k = 0; k < count; k++) {
          const angle = (k / count) * TAU + boss.spin,
            kid = game.spawnEnemy(crew[k % 3], boss.x + Math.cos(angle) * 2.6, boss.y + Math.sin(angle) * 2.6, {});
          kid.spawnT = 0.35;
          kid.noDrop = true;
          kid.kx = Math.cos(angle) * 6;
          kid.ky = Math.sin(angle) * 6;
        }
        // Gapped caldera ring: six forge boulders around the player with one clear escape lane
        const start = game.rng.next() * TAU,
          gap = game.rng.int(0, 6);
        for (let k = 0; k < 7; k++) {
          const angle = start + (k / 7) * TAU;
          if (k === gap) continue;
          game.hazard({
            x: clamp(player.x + Math.cos(angle) * 4.8, -arena.W + 1, arena.W - 1),
            y: clamp(player.y + Math.sin(angle) * 4.8, -arena.H + 1, arena.H - 1),
            r: 1.9,
            delay: 1.25,
            dmg: boss.dmg * 0.72,
            kind: "rain",
            src: "tyrant",
            sx: boss.x,
            sy: boss.y,
          });
        }
        // Twin counter-sweeping forge flame streams
        const dir = game.rng.chance(0.5) ? 1 : -1;
        for (const side of [-1, 1]) {
          game.beam({
            x: boss.x,
            y: boss.y,
            a: aim + side * 0.95,
            rot: side * dir * 0.52,
            warn: 1.15,
            dur: 2.3,
            w: 1.2,
            dmg: boss.dmg * 0.95,
            follow: boss,
            len: 16.5,
            skin: "magma",
          });
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "magma" });
        game.emit("hatch", { x: boss.x, y: boss.y, big: true });
      }
      if (boss.t >= 1.3 + (boss.n - 1) * 0.65 && boss.n <= 4) {
        boss.n++;
        for (const off of [-0.26, 0, 0.26])
          game.shoot(boss.x, boss.y, aim + off, 7.6 + (off === 0 ? 1.0 : 0), shotDmg, { r: 0.27 });
        bossVolley(game, boss, 0.3);
      }
      if (boss.t > 3.7) endBossAttack(boss, 1.6);
      return;
    }
  }
  endBossAttack(boss, 1);
}
function moveBoss(game, boss, dt, aim, dist, speedMul = 1) {
  let speed = boss.speed * (boss.enraged ? 1.3 : 1) * speedMul;
  if (boss.type === "queen" || boss.type === "prism") {
    let orbit = boss.type === "queen" ? 8 : 9,
      approach = dist > orbit + 1 ? 1 : dist < orbit - 1 ? -1 : 0,
      player = game.player,
      nx = (player.x - boss.x) / dist,
      ny = (player.y - boss.y) / dist;
    boss.vx = (nx * approach - ny * 0.7) * speed * 1.4;
    boss.vy = (ny * approach + nx * 0.7) * speed * 1.4;
    return;
  }
  if (boss.type === "core") {
    let player = game.player,
      dx = player.x * 0.25 - boss.x,
      dy = player.y * 0.25 - boss.y,
      len = Math.hypot(dx, dy);
    if (len > 0.5) {
      boss.vx = (dx / len) * speed;
      boss.vy = (dy / len) * speed;
    } else {
      boss.vx *= 0.9;
      boss.vy *= 0.9;
    }
    return;
  }
  game.chaseDir(boss);
  boss.vx = game.cdx * speed;
  boss.vy = game.cdy * speed;
}
function shootRing(game, boss, count, speed, dmg, start, kind) {
  for (let k = 0; k < count; k++)
    // 3.16.0: without a kind the boss's own shot (World.shoot, BOSS_SHOT)
    game.shoot(boss.x, boss.y, start + (k / count) * TAU, speed, dmg, { kind, r: 0.27 });
  // 3.16.0: every ring sounds (several rings used to fly silently)
  bossVolley(game, boss);
}
/* 3.16.0: the sound of a boss volley (its voice comes from the boss, audio/sound.js BOSS_ESHOT); `gap` keeps a stream
   of shots (a spiral) to one sound every so often */
function bossVolley(game, boss, gap = 0) {
  if (gap && game.time - (boss.volleyAt ?? -9) < gap) return;
  boss.volleyAt = game.time;
  game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type });
}
function findOpenSpot(game, x, y, minR, maxR) {
  for (let k = 0; k < 20; k++) {
    let angle = game.rng.next() * TAU,
      dist = game.rng.range(minR, maxR),
      px = x + Math.cos(angle) * dist,
      py = y + Math.sin(angle) * dist;
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  for (let k = 0; k < 16; k++) {
    let angle = (k / 16) * TAU,
      px = clamp(x * 0.4 + Math.cos(angle) * Math.max(minR, 2.5), -game.arena.W + 3, game.arena.W - 3),
      py = clamp(y * 0.4 + Math.sin(angle) * Math.max(minR, 2.5), -game.arena.H + 3, game.arena.H - 3);
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  return null;
}
function updateEnemy(game, enemy, dt) {
  const speed = enemy.speed;
  if (enemy.sunT > 0) {
    enemy.sunT = Math.max(0, enemy.sunT - dt);
    enemy.speed *= 2.1;
  }
  try {
    updateEnemyRole(game, enemy, dt);
  } finally {
    enemy.speed = speed;
  }
}

function updateEnemyRole(game, enemy, dt) {
  // stragglers (see RL_KITERS): hunting ranged enemies (RL_KITERS) come straight at the player.
  if (enemy.hunt && RL_KITERS.has(enemy.type) && !(enemy.spawnT > 0)) {
    game.chaseDir(enemy);
    const speed = Math.max(enemy.speed, 2.6) * 1.3;
    enemy.vx = game.cdx * speed;
    enemy.vy = game.cdy * speed;
    enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
    enemy.st = 0;
    return;
  }
  // 2.2: new enemy roles use the same movement/shooting primitives as the core AI.
  if (enemy.type === "drone") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.1 + enemy.phase);
    if (dist < 7) {
      enemy.vx = (-dx / dist) * enemy.speed;
      enemy.vy = (-dy / dist) * enemy.speed;
    } else if (dist > 11 || !enemy.los) {
      // 2.9.1: path around obstacles (it flew straight at the player and got stuck on boxes); also when it
      // has no line of sight at medium range, so it works its way to a firing position
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
    } else {
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    }
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (player.alive && dist < 16 && dist > 5 && enemy.t <= 0 && enemy.los) {
      for (const off of [-0.18, 0.18])
        game.shoot(enemy.x, enemy.y, ang + off, 18, enemy.dmg * 0.72, { kind: "drone", life: 2.8, homing: 1.6 });
      enemy.t = 2.2 + game.rng.next() * 0.8;
      game.emit("eshot", { x: enemy.x, y: enemy.y, type: "drone" });
    }
    return;
  }
  if (enemy.type === "driller") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 7 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 8.7 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.58;
        enemy.ta = ang;
        enemy.vx *= 0.15;
        enemy.vy *= 0.15;
        game.emit("charge", { x: enemy.x, y: enemy.y, type: "driller" });
      }
    } else if (enemy.st === 1) {
      enemy.t2 -= dt;
      enemy.vx *= 0.7;
      enemy.vy *= 0.7;
      enemy.face = turnToward(enemy.face, enemy.ta, 14 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 2;
        enemy.t2 = 0.62;
        enemy.vx = Math.cos(enemy.ta) * 18;
        enemy.vy = Math.sin(enemy.ta) * 18;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type });
      }
    } else {
      enemy.t2 -= dt;
      enemy.vx *= 0.97;
      enemy.vy *= 0.97;
      if (enemy.hitWall || enemy.t2 <= 0) {
        game.hazard({ x: enemy.x, y: enemy.y, r: 1.6, delay: 0.18, dmg: enemy.dmg * 0.7, kind: "drill" });
        enemy.st = 0;
        enemy.t = 1.6 + game.rng.next() * 1.4;
      }
    }
    return;
  }
  if (enemy.type === "beacon") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (dist < 9.5) {
      enemy.vx = -game.cdx * enemy.speed * 0.85;
      enemy.vy = -game.cdy * enemy.speed * 0.85;
    } else if (dist > 13) {
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
    } else {
      const side = Math.sin(enemy.age * 1.5 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed * 0.7;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed * 0.7;
    }
    enemy.face = turnToward(enemy.face, ang, 5 * dt);
    enemy.t -= dt;
    if (enemy.t <= 0) {
      enemy.t = 3.0 + game.rng.next() * 0.8;
      game.hash.query(enemy.x, enemy.y, 6, (ally) => {
        if (ally === enemy || ally.dead || ally.boss || ally.type === "beacon" || (ally.beaconT || 0) > game.time)
          return;
        // 2.8.1: the hash query covers whole cells (up to ~10 m); heal only inside the 6 m ring that is shown
        if (Math.hypot(ally.x - enemy.x, ally.y - enemy.y) > 6 + ally.r) return;
        ally.beaconT = game.time + 3;
        ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.08);
        ally.healFlash = 0.3;
      });
      game.emit("mend", { x: enemy.x, y: enemy.y, r: 6, type: "beacon" });
    }
    return;
  }
  if (enemy.type === "weaver") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      ang = Math.atan2(dy, dx),
      side = Math.sin(enemy.age * 2.8 + enemy.phase);
    enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
    enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    enemy.face = turnToward(enemy.face, ang, 8 * dt);
    // 2.9.1: the shot is announced: after the warp the weaver aims for 0.45 s (the lock-on sound plays and it
    // holds still) and fires only then, at where the player is at that moment
    if (enemy.st === 1) {
      enemy.t2 -= dt;
      enemy.vx *= 0.3;
      enemy.vy *= 0.3;
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        if (player.alive) {
          const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
          for (const off of [-0.22, 0, 0.22])
            game.shoot(enemy.x, enemy.y, aim + off, 24, enemy.dmg * 0.72, { kind: "weaver", life: 2.6 });
          // 3.16.0: the volley sounds (it flew silently)
          game.emit("eshot", { x: enemy.x, y: enemy.y, type: "weaver" });
        }
        enemy.t = 3.4 + game.rng.next() * 1.2;
      }
      return;
    }
    enemy.t -= dt;
    // 2.8.1: a dead player is not shot at any more
    if (enemy.t <= 0 && !player.alive) enemy.t = 1;
    if (enemy.t <= 0) {
      const spot = game.arena.freePoint(game.rng, player.x, player.y, 7.4, 1.25);
      if (spot) {
        const ox = enemy.x,
          oy = enemy.y;
        enemy.x = spot.x;
        enemy.y = spot.y;
        game.arena.resolve(enemy, enemy.r);
        game.emit("warp", { x: ox, y: oy, tx: enemy.x, ty: enemy.y, who: "weaver" });
      }
      enemy.st = 1;
      enemy.t2 = 0.45;
      game.emit("aim", { x: enemy.x, y: enemy.y, type: "weaver" });
    }
    return;
  }
  // original roles
  if (enemy.type === "charger") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, ang, 9 * dt);
      if (player.alive && dist < 10.5 && dist > 4 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.48;
        enemy.ta = ang;
        enemy.vx *= 0.2;
        enemy.vy *= 0.2;
        game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type });
      }
    } else if (enemy.st === 1) {
      enemy.vx *= 0.65;
      enemy.vy *= 0.65;
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, enemy.ta, 16 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 2;
        enemy.t2 = 0.62;
        enemy.vx = Math.cos(enemy.ta) * 16.5;
        enemy.vy = Math.sin(enemy.ta) * 16.5;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type });
      }
    } else {
      enemy.t2 -= dt;
      enemy.vx *= 0.985;
      enemy.vy *= 0.985;
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 1.5 + game.rng.next() * 1.2;
      }
    }
    return;
  }
  if (enemy.type === "minebot") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001;
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.2;
      enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
      if (player.alive && dist < 10 && dist > 4.2 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.55;
        enemy.vx = 0;
        enemy.vy = 0;
        game.hazard({ x: enemy.x, y: enemy.y, r: 1.15, delay: 0.55, dmg: enemy.dmg * 1.25, kind: "mine" });
        game.emit("mine", { x: enemy.x, y: enemy.y });
      }
    } else {
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 2.4 + game.rng.next() * 1.2;
      }
    }
    return;
  }
  if (enemy.type === "sapper") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    game.chaseDir(enemy);
    if (enemy.st === 0) {
      const retreat = dist < 5.5;
      enemy.vx = (retreat ? -game.cdx : game.cdx) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.vy = (retreat ? -game.cdy : game.cdy) * enemy.speed * (retreat ? 1.35 : 1);
      enemy.t -= dt;
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      if (player.alive && dist < 10.5 && dist > 3.6 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.65;
        enemy.vx *= 0.15;
        enemy.vy *= 0.15;
        const flank = ang + (game.rng.chance(0.5) ? 0.42 : -0.42),
          tx = clamp(player.x + Math.cos(flank) * 2.8, -game.arena.W + 1.2, game.arena.W - 1.2),
          ty = clamp(player.y + Math.sin(flank) * 2.8, -game.arena.H + 1.2, game.arena.H - 1.2);
        game.hazard({
          x: tx,
          y: ty,
          r: 1.55,
          delay: 1.05,
          dmg: enemy.dmg * 1.25,
          kind: "sapper",
          sx: enemy.x,
          sy: enemy.y,
        });
        game.emit("mine", { x: enemy.x, y: enemy.y });
      }
    } else {
      enemy.t2 -= dt;
      enemy.face = turnToward(enemy.face, ang, 8 * dt);
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 2.4 + game.rng.next() * 1.3;
      }
    }
    return;
  }
  if (enemy.type === "phantom") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
      enemy.face = turnToward(enemy.face, ang, 10 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 8.5 && dist > 3.8 && enemy.t <= 0) {
        enemy.st = 1;
        enemy.t2 = 0.82;
        enemy.ghost = true;
        enemy.t = 2.7;
        game.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
      }
    } else if (enemy.st === 1) {
      enemy.ghost = true;
      enemy.vx *= 0.82;
      enemy.vy *= 0.82;
      enemy.t2 -= dt;
      if (enemy.t2 <= 0) {
        enemy.ghost = false;
        enemy.st = 2;
        enemy.t2 = 0.32;
        enemy.vx = Math.cos(ang) * 13;
        enemy.vy = Math.sin(ang) * 13;
        game.emit("edash", { x: enemy.x, y: enemy.y, a: ang, type: enemy.type });
      }
    } else {
      enemy.ghost = false;
      enemy.t2 -= dt;
      enemy.vx *= 0.985;
      enemy.vy *= 0.985;
      if (enemy.t2 <= 0) enemy.st = 0;
    }
    return;
  }
  if (enemy.type === "sentinel") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (enemy.st === 0) {
      if (dist > 12) {
        game.chaseDir(enemy);
        enemy.vx = game.cdx * enemy.speed;
        enemy.vy = game.cdy * enemy.speed;
      } else if (dist < 8.5) {
        enemy.vx = (-dx / dist) * enemy.speed * 0.7;
        enemy.vy = (-dy / dist) * enemy.speed * 0.7;
      } else if (!enemy.los) {
        // 2.8.1: without a line of sight at 8.5-12 m it used to stand still for good; walk up to get one
        game.chaseDir(enemy);
        enemy.vx = game.cdx * enemy.speed * 0.6;
        enemy.vy = game.cdy * enemy.speed * 0.6;
      } else {
        enemy.vx *= 0.65;
        enemy.vy *= 0.65;
      }
      enemy.face = turnToward(enemy.face, ang, 6 * dt);
      enemy.t -= dt;
      if (player.alive && dist < 15 && dist > 6 && enemy.t <= 0 && enemy.los) {
        enemy.st = 1;
        enemy.t2 = 0.65;
        enemy.ta = ang;
        enemy.vx *= 0.2;
        enemy.vy *= 0.2;
      }
    } else if (enemy.st === 1) {
      enemy.t2 -= dt;
      enemy.vx *= 0.72;
      enemy.vy *= 0.72;
      enemy.face = turnToward(enemy.face, enemy.ta, 8 * dt);
      if (enemy.t2 <= 0) {
        game.beam({
          x: enemy.x,
          y: enemy.y,
          a: enemy.ta,
          len: 18,
          w: 0.2,
          warn: 0.55,
          dur: 0.48,
          rot: 0.08,
          dmg: enemy.dmg * 1.2,
          color: enemy.def.color,
          // the beam of its biome where the biome has one (the brass lantern beam, the rift ribbon)
          skin: SENTINEL_SKIN[game.arena.biome.id] || null,
        });
        game.emit("beamWarn", {
          x: enemy.x,
          y: enemy.y,
          small: true,
          skin: SENTINEL_SKIN[game.arena.biome.id] || null,
        });
        enemy.st = 2;
        enemy.t2 = 2.5 + game.rng.next() * 1.2;
      }
    } else {
      enemy.t2 -= dt;
      if (enemy.t2 <= 0) {
        enemy.st = 0;
        enemy.t = 0.5 + game.rng.next() * 0.8;
      }
    }
    return;
  }
  if (enemy.type === "carrier") {
    if (enemy.spawnT > 0) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const player = game.player,
      dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001,
      ang = Math.atan2(dy, dx);
    if (dist < 8.5) {
      enemy.vx = (-dx / dist) * enemy.speed;
      enemy.vy = (-dy / dist) * enemy.speed;
    } else if (dist > 12) {
      game.chaseDir(enemy);
      enemy.vx = game.cdx * enemy.speed;
      enemy.vy = game.cdy * enemy.speed;
    } else {
      const side = Math.sin(enemy.age * 1.7 + enemy.phase);
      enemy.vx = Math.cos(ang + Math.PI / 2) * side * enemy.speed;
      enemy.vy = Math.sin(ang + Math.PI / 2) * side * enemy.speed;
    }
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (player.alive && dist < 14 && dist > 7 && enemy.t <= 0 && enemy.los) {
      for (const off of [-0.16, 0, 0.16])
        game.shoot(enemy.x, enemy.y, ang + off, 20, enemy.dmg * 0.72, { kind: "carrier", life: 3.8, homing: 1.2 });
      enemy.t = 2.4 + game.rng.next() * 1.2;
      // 3.16.0: the carrier's pods have a voice of their own (they played the gunner's pok)
      game.emit("eshot", { x: enemy.x, y: enemy.y, type: "carrier" });
    }
    return;
  }
  return updateEnemyCore(game, enemy, dt);
}

export { updateEnemy, updateBoss, initBoss, OVERDRIVE, bossPatterns };

/* ---- 3.56.0: THE GLASSWYRM, the boss of the Glass Flats ----
 A wyrm of living fused glass that swims the sand beneath the sheets. Everything it does is
 telegraphed on the ground first (the game's language): the glass swells where it will burst. It
 hunts alone - no crew, no summons; the desert around it stays empty.
   rise      RISE      it dives (diveT sinks and fades it in the renderer), a chain of bulges races
                       towards you, and it bursts up where the chain ends: a stomp, a shard ring
   shards    SHARDS    it swims and throws fans of hot glass slivers, a full ring between the fans
   sunlance  SUNLANCE  it stands and bends the noon through its body: a broad hot lance that sweeps
                       with the drone (it turns slowly, so running around it works, like the mouth)
   mirage    MIRAGE    it dives, bulges chase your flank, and it surfaces BEHIND you - the bulges
                       lie; enraged it does it twice
   noon      NOON      the Overdrive: the sun stands still - a dial of five lances turns around it
                       while the glass bursts in two gapped rings and hot shards sprinkle
 Enraged (below half hull): the rise forks into three chains, the fans widen, the lance sweeps from
 both sides, the mirage surfaces twice. */
function updateGlasswyrm(game, boss, dt, aim, dist, shotDmg, rage) {
  const player = game.player,
    arena = game.arena,
    inside = (x, y) => !arena.outside(x, y, 0.8);
  if (boss.diveT > 0) boss.diveT = Math.max(0, boss.diveT - dt);
  const end = (walk) => {
    boss.fx = null;
    boss.diveT = 0;
    boss.charging = false;
    endBossAttack(boss, walk);
  };
  // a bulge chain: the glass swells and bursts along a line - the wyrm swims beneath it
  const chain = (angle, wind) => {
    const spots = [];
    for (let k = 0; k < 6; k++) {
      const reach = 2.6 + k * 2.3,
        x = boss.x + Math.cos(angle) * reach,
        y = boss.y + Math.sin(angle) * reach;
      if (!inside(x, y)) break;
      spots.push([x, y]);
      game.hazard({ x, y, r: 1.5, delay: wind + 0.1 + k * 0.13, dmg: boss.dmg * 0.75, kind: "stomp", src: "wyrm" });
    }
    return spots;
  };
  const surface = (ringSpin) => {
    game.explode(boss.x, boss.y, 2.4, 0, { kind: "stomp", src: "wyrm" });
    shootRing(game, boss, 13 + rage * 3, 6.8, shotDmg, ringSpin);
    game.emit("blink", { x: boss.x, y: boss.y });
    game.emit("thud", { x: boss.x, y: boss.y, big: true });
  };
  switch (boss.st) {
    case "rise": {
      const wind = rage ? 0.75 : 0.95;
      boss.vx *= 0.75;
      boss.vy *= 0.75;
      if (boss.n === 0) {
        boss.n = 1;
        boss.diveT = wind + 0.4;
        boss.charging = true;
        boss.ta = aim;
        boss.fx = [];
        for (const off of rage ? [-0.5, 0, 0.5] : [0]) {
          const spots = chain(aim + off, wind);
          if (spots.length) boss.fx.push(spots[spots.length - 1]);
        }
        game.emit("blinkWarn", { x: boss.x, y: boss.y });
      }
      boss.face = turnToward(boss.face, boss.ta, 4 * dt);
      if (boss.n === 1 && boss.t >= wind) {
        boss.n = 2;
        boss.charging = false;
        const [sx, sy] = boss.fx[0] || [boss.x, boss.y];
        boss.x = sx;
        boss.y = sy;
        boss.diveT = 0;
        surface(boss.spin);
      }
      if (boss.t > wind + 1.0) end(2 - rage * 0.5);
      return true;
    }
    case "shards": {
      moveBoss(game, boss, dt, aim, dist, 0.35);
      const salvos = 3 + rage;
      if (boss.t >= 0.4 + boss.n * 0.62 && boss.n < salvos) {
        boss.n++;
        if (boss.n % 2) {
          // Prism-split crescent fan: center glass splinters surge ahead, edges sweep wide
          const wide = 5 + rage * 2,
            mid = (wide - 1) / 2;
          for (let k = 0; k < wide; k++) {
            const off = k - mid,
              speed = 10.2 - Math.abs(off) * 0.72;
            game.shoot(boss.x, boss.y, aim + off * 0.16, speed, shotDmg);
          }
        } else {
          // Shimmering desert glass ring offset from the previous fan
          const count = 10 + rage * 4;
          for (let k = 0; k < count; k++) {
            const a = boss.spin + (k / count) * TAU;
            game.shoot(boss.x, boss.y, a, k % 2 ? 7.2 : 5.6, shotDmg);
          }
        }
        bossVolley(game, boss, 0.28);
      }
      if (boss.t > 0.4 + salvos * 0.62 + 0.9) end(1.7 - rage * 0.3);
      return true;
    }
    case "sunlance": {
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        boss.charging = true;
        const dir = game.rng.chance(0.5) ? 1 : -1;
        game.beam({
          x: boss.x,
          y: boss.y,
          a: aim,
          rot: dir * 0.5,
          warn: 1.1,
          dur: 2.6,
          w: 0.8,
          dmg: boss.dmg,
          follow: boss,
          len: 30,
          color: WYRM_SUN,
          skin: "sun",
        });
        if (rage)
          game.beam({
            x: boss.x,
            y: boss.y,
            a: aim + Math.PI,
            rot: -dir * 0.5,
            warn: 1.1,
            dur: 2.6,
            w: 0.8,
            dmg: boss.dmg,
            follow: boss,
            len: 30,
            color: WYRM_SUN,
            skin: "sun",
          });
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "sun" });
      }
      // it stands and lets the noon burn (the lance turns slowly, so running around it works)
      if (boss.t > 3.9) end(1.8 - rage * 0.4);
      return true;
    }
    case "mirage": {
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.n === 0) {
        boss.n = 1;
        boss.diveT = 1.6;
        boss.charging = true;
        // the bulges chase one flank; the wyrm surfaces from the other side (the bulges lie)
        boss.ta = aim + Math.PI + (game.rng.chance(0.5) ? 0.8 : -0.8);
        chain(boss.ta, 0.5);
        game.emit("blinkWarn", { x: boss.x, y: boss.y });
      }
      if (boss.n === 1 && boss.t >= 1.5) {
        boss.n = 2;
        boss.x = clamp(player.x + Math.cos(boss.ta) * 6.5, -arena.W + 1.5, arena.W - 1.5);
        boss.y = clamp(player.y + Math.sin(boss.ta) * 6.5, -arena.H + 1.5, arena.H - 1.5);
        boss.diveT = rage ? 0.9 : 0;
        surface(boss.spin);
        if (rage) {
          boss.ta = boss.ta > aim + Math.PI ? aim + Math.PI - 0.8 : aim + Math.PI + 0.8;
          chain(boss.ta, 0.9);
        }
      }
      if (boss.n === 2 && rage && boss.t >= 2.9) {
        boss.n = 3;
        boss.diveT = 0;
        boss.x = clamp(player.x + Math.cos(boss.ta) * 6, -arena.W + 1.5, arena.W - 1.5);
        boss.y = clamp(player.y + Math.sin(boss.ta) * 6, -arena.H + 1.5, arena.H - 1.5);
        surface(boss.spin + 0.3);
      }
      if (boss.t > (rage ? 4.2 : 2.6)) end(1.6 - rage * 0.3);
      return true;
    }
  }
  return false;
}
