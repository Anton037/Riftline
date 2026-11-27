// Unified, modular enemy behavior dispatch. Every enemy role has a self-contained state machine handler.

import { clamp, TAU, turnToward } from "./util.js";
import { enemyMuzzlePoint, SENTINEL_BEAMS as SENTINEL_SKIN } from "../data/combat-effects.js";

const RL_KITERS = new Set([
  "brassGuard",
  "longshot",
  "mushroomNest",
  "bellCannon",
  "mossHealer",
  "watchTower",
  "mineCart",
  "bombMaker",
  "crystalTower",
  "supplyKite",
  "dartSprite",
  "healingStone",
  "starSpider",
]);

function updateSwarmer(game, enemy, dt, ctx) {
  if (enemy.paperSkiff) {
    // Orbit around the player at mid-range, then periodically swoop inward along a curved dive
    const swoop = Math.sin(enemy.age * 2.4 + enemy.phase) > 0.45;
    const orbitDir = enemy.phase > Math.PI ? 1 : -1;
    const radial = swoop ? 1.15 : ctx.dist > 5.5 ? 0.65 : ctx.dist < 3.2 ? -0.35 : 0.15;
    const tangent = (swoop ? 0.45 : 0.92) * orbitDir;
    const tx = -ctx.cdy * tangent + ctx.cdx * radial;
    const ty = ctx.cdx * tangent + ctx.cdy * radial;
    const n = Math.hypot(tx, ty) || 1;
    const spd = ctx.speed * (swoop ? 1.28 : 1.05);
    enemy.vx = (tx / n) * spd;
    enemy.vy = (ty / n) * spd;
    return;
  }
  const wobble = Math.sin(enemy.age * 6 + enemy.phase) * 0.45;
  enemy.vx = (ctx.cdx - ctx.cdy * wobble) * ctx.speed;
  enemy.vy = (ctx.cdy + ctx.cdx * wobble) * ctx.speed;
}

function updateWalker(game, enemy, dt, ctx) {
  enemy.vx = ctx.cdx * ctx.speed;
  enemy.vy = ctx.cdy * ctx.speed;
}

function fireBarrels(game, enemy, angle, speed, damage, volley, radius) {
  const muzzles = [];
  for (const [side, spread] of volley) {
    const muzzle = enemyMuzzlePoint(enemy, angle, side);
    if (game.arena.outside(muzzle.x, muzzle.y, radius) || !game.arena.los(enemy.x, enemy.y, muzzle.x, muzzle.y, 0.08))
      continue;
    const shot = game.shoot(muzzle.x, muzzle.y, angle + spread, speed, damage, {
      r: radius,
      src: enemy.type,
      launchHeight: muzzle.height,
    });
    if (shot && !muzzles.some((origin) => origin.x === muzzle.x && origin.y === muzzle.y)) muzzles.push(muzzle);
  }
  if (!muzzles.length) return;
  enemy.recoilT = 0.25;
  game.emit("eshot", { ...muzzles[0], muzzles, type: enemy.type, frost: enemy.variant === "frost" });
}

function updateGunner(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    enemy.face = turnToward(enemy.face, ang, 8 * dt);
    if (dist > 11 || !enemy.los) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
    } else if (dist < 6.5) {
      enemy.vx = (-dx / dist) * speed * 0.8;
      enemy.vy = (-dy / dist) * speed * 0.8;
    } else {
      const side = Math.sin(enemy.phase) > 0 ? 1 : -1;
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
    enemy.vx = 0;
    enemy.vy = 0;
    if (enemy.t2 > 0.13) enemy.face = turnToward(enemy.face, ang, 10 * dt);
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      const side = enemy.barrel ?? -1;
      const volley = enemy.elite
        ? [
            [-1, -0.2],
            [side, 0],
            [1, 0.2],
          ]
        : [[side, 0]];
      fireBarrels(game, enemy, enemy.face, 8.2 + game.wave * 0.06, enemy.dmg, volley, 0.24);
      enemy.barrel = -side;
      enemy.st = 0;
      enemy.t = 2.2 + game.rng.next() * 0.9;
    }
  }
  return true;
}

function updateBomber(game, enemy, dt, ctx) {
  const { dist, cdx, cdy, speed, alive, player } = ctx;
  if (enemy.st === 0) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
    if (dist < 1.9 + player.r && alive) {
      enemy.st = 1;
      enemy.t2 = 0.55;
      game.emit("fuse", { x: enemy.x, y: enemy.y });
    }
  } else if (enemy.st === 1) {
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
        kind: "firePot",
      });
      game.killEnemy(enemy);
    }
  }
}

function updateBrute(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
    enemy.t -= dt;
    if (enemy.t <= 0 && enemy.los && dist < 10 && alive) {
      enemy.st = 1;
      enemy.t2 = 0.8;
      enemy.ta = ang;
      game.emit("charge", { x: enemy.x, y: enemy.y, type: "ironGolem" });
    }
    return false;
  }
  if (enemy.st === 1) {
    enemy.vx = 0;
    enemy.vy = 0;
    if (enemy.t2 > 0.35) enemy.ta = turnToward(enemy.ta, ang, 2.5 * dt);
    enemy.face = turnToward(enemy.face, enemy.ta, 10 * dt);
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.st = 2;
      enemy.t2 = 0.6;
    }
    return true;
  }
  if (enemy.st === 2) {
    enemy.vx = Math.cos(enemy.ta) * 15;
    enemy.vy = Math.sin(enemy.ta) * 15;
    enemy.face = enemy.ta;
    enemy.t2 -= dt;
    if (enemy.hitWall && enemy.t2 < 0.5) {
      enemy.st = 3;
      enemy.t2 = 0.8;
      game.emit("thud", { x: enemy.x, y: enemy.y });
    } else if (enemy.t2 <= 0) {
      enemy.st = 0;
      enemy.t = 2.8 + game.rng.next() * 1.4;
    }
    return true;
  }
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.t2 -= dt;
  if (enemy.t2 <= 0) {
    enemy.st = 0;
    enemy.t = 2.5 + game.rng.next();
  }
  return true;
}

function updateSniper(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    if (dist > 14.5 || !enemy.los) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
    } else if (dist < 9.5) {
      enemy.vx = (-dx / dist) * speed;
      enemy.vy = (-dy / dist) * speed;
    } else {
      const side = Math.cos(enemy.phase) > 0 ? 1 : -1;
      enemy.vx = (-dy / dist) * side * speed * 0.4;
      enemy.vy = (dx / dist) * side * speed * 0.4;
    }
    enemy.t -= dt;
    if (enemy.t <= 0 && enemy.los && dist < 19 && alive) {
      enemy.st = 1;
      enemy.t2 = 1.25;
      enemy.ta = enemy.face;
      game.emit("aim", { x: enemy.x, y: enemy.y });
    }
  } else {
    enemy.vx = 0;
    enemy.vy = 0;
    if (enemy.t2 > 0.35) enemy.ta = turnToward(enemy.ta, ang, 3 * dt);
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      fireBarrels(game, enemy, enemy.ta, 22, enemy.dmg, [[0, 0]], 0.2);
      enemy.face = enemy.ta;
      enemy.st = 0;
      enemy.t = 3 + game.rng.next() * 1.2;
      return true;
    }
  }
  enemy.face = enemy.st === 1 ? enemy.ta : turnToward(enemy.face, ang, 8 * dt);
  return true;
}

function updateHive(game, enemy, dt, ctx) {
  const { dist, cdx, cdy, speed } = ctx;
  if (dist > 6 || !enemy.los) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else {
    enemy.vx *= 0.9;
    enemy.vy *= 0.9;
  }
  enemy.t -= dt;
  const maxKids = enemy.elite ? 7 : 5,
    spawnNow = enemy.t <= 0;
  if (spawnNow) enemy.t = 3.2;
  if (spawnNow && enemy.kids < maxKids && game.enemies.length < 75) {
    const angle = game.rng.next() * TAU,
      kid = game.spawnEnemy(
        "smallBug",
        enemy.x + Math.cos(angle) * (enemy.r + 0.5),
        enemy.y + Math.sin(angle) * (enemy.r + 0.5),
        {
          parent: enemy.id,
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
  return true;
}

function updateBulwark(game, enemy, dt, ctx) {
  const { ang, cdx, cdy, speed } = ctx;
  if (enemy.guardFlash > 0) enemy.guardFlash -= dt * 5;
  if (enemy.guardDown > 0) {
    enemy.guardDown -= dt;
    enemy.vx *= 0.9;
    enemy.vy *= 0.9;
    if (enemy.guardDown <= 0) {
      enemy.guard = enemy.guardMax;
      game.emit("guardUp", { x: enemy.x, y: enemy.y });
    }
    return true;
  }
  enemy.vx = cdx * speed;
  enemy.vy = cdy * speed;
  enemy.face = turnToward(enemy.face, ang, 0.95 * dt);
  return true;
}

function updateStriker(game, enemy, dt, ctx) {
  const { dx, dy, dist, cdx, cdy, speed, alive, player } = ctx;
  if (enemy.st === 0) {
    if (dist > 7 || !enemy.los) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
    } else {
      const side = Math.sin(enemy.phase) > 0 ? 1 : -1;
      enemy.vx = (-dy / dist) * side * speed * 0.6;
      enemy.vy = (dx / dist) * side * speed * 0.6;
    }
    enemy.t -= dt;
    if (enemy.t <= 0 && enemy.los && dist < 13 && alive) {
      const away = Math.atan2(enemy.y - player.y, enemy.x - player.x),
        first = game.rng.chance(0.5) ? 1 : -1;
      let spot = null;
      for (const side of [first, -first]) {
        const angle = away + side * 1.35,
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
    return false;
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
    return true;
  }
  if (enemy.st === 2) {
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.face = turnToward(enemy.face, enemy.ta, 14 * dt);
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.st = 3;
      enemy.t2 = 0.24;
      game.emit("charge", { x: enemy.x, y: enemy.y, type: "blinkBlade" });
    }
    return true;
  }
  enemy.vx = Math.cos(enemy.ta) * 17;
  enemy.vy = Math.sin(enemy.ta) * 17;
  enemy.face = enemy.ta;
  enemy.t2 -= dt;
  if (enemy.t2 <= 0 || (enemy.hitWall && enemy.t2 < 0.2)) {
    enemy.st = 0;
    enemy.t = 3 + game.rng.next() * 1.5;
  }
  return true;
}

// Bog Hopper ('leaper'): jumps in a parabolic arc (enemy.jumpZ) over low obstacles and floor hazards,
// landing with a 1.6m bog-splash that leaves a 2.5s mud/acid puddle.
function updateLeaper(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive } = ctx;
  const HOP_DUR = 0.58;
  if (enemy.st === 0) {
    enemy.jumpZ = 0;
    enemy.leaping = false;
    if (dist > 7.5 || !enemy.los) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
    } else {
      enemy.vx *= 0.85;
      enemy.vy *= 0.85;
      enemy.t -= dt;
      if (enemy.t <= 0 && alive) {
        enemy.st = 1;
        enemy.t2 = 0.48;
        enemy.ta = ang;
        game.emit("charge", { x: enemy.x, y: enemy.y, type: "bogHopper" });
      }
    }
  } else if (enemy.st === 1) {
    enemy.jumpZ = 0;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.ta = turnToward(enemy.ta, ang, 3.8 * dt);
    enemy.face = enemy.ta;
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.st = 2;
      enemy.t2 = HOP_DUR;
      enemy.leaping = true;
      enemy.vx = Math.cos(enemy.ta) * 13.5;
      enemy.vy = Math.sin(enemy.ta) * 13.5;
      game.emit("blink", { x: enemy.x, y: enemy.y, leap: true, src: "bogHopper" });
    }
  } else {
    enemy.t2 -= dt;
    const prog = clamp(1 - enemy.t2 / HOP_DUR, 0, 1);
    enemy.jumpZ = Math.sin(prog * Math.PI) * 1.55;
    enemy.leaping = enemy.jumpZ > 0.25;
    enemy.vx *= 0.985;
    enemy.vy *= 0.985;
    if (enemy.t2 <= 0) {
      enemy.jumpZ = 0;
      enemy.leaping = false;
      enemy.st = 0;
      enemy.t = 2.2 + game.rng.next() * 1.2;
      enemy.hitWall = false;
      game.arena.resolve(enemy, enemy.r);
      // Land with a 1.6m bog-splash that leaves a 2.5s mud/acid puddle
      if (game.arena.acid && game.arena.acid.filter((p) => p.life != null).length < 14) {
        game.arena.acid.push({ x: enemy.x, y: enemy.y, r: 1.6, life: 2.5 });
      }
      game.emit("thud", { x: enemy.x, y: enemy.y, src: "bogHopper" });
    }
  }
  const facing = enemy.st === 1 ? enemy.ta : enemy.st === 2 ? Math.atan2(enemy.vy, enemy.vx) : ang;
  enemy.face = turnToward(enemy.face, facing, 10 * dt);
  return true;
}

// Watch Tower ('turret'): walks into LOS, then anchors into a stationary belfry (speed = 0, -35% knockback taken)
// that fires a 2-bolt chime salvo + a 3.2m radial brass shock-ring, only uprooting if the player stays out of range for 3.5s.
function updateTurret(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive } = ctx;
  const inRange = enemy.los && dist < 17.5;
  if (!enemy.anchored) {
    if (!inRange) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
      enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 6 * dt);
      return true;
    }
    enemy.anchored = true;
    enemy.outT = 0;
    enemy.vx = 0;
    enemy.vy = 0;
    game.emit("plant", { x: enemy.x, y: enemy.y, type: "watchTower" });
  }
  // Stationary anchored belfry
  enemy.vx = 0;
  enemy.vy = 0;
  if (!inRange) {
    enemy.outT = (enemy.outT || 0) + dt;
    if (enemy.outT >= 3.5) {
      enemy.anchored = false;
      enemy.st = 0;
      return true;
    }
  } else {
    enemy.outT = 0;
  }
  if (enemy.st === 0) {
    enemy.face = turnToward(enemy.face, ang, 4 * dt);
    enemy.t -= dt;
    if (enemy.t <= 0 && inRange && alive) {
      enemy.st = 1;
      enemy.t2 = 0.58;
      enemy.ta = ang;
      game.emit("aim", { x: enemy.x, y: enemy.y, type: "watchTower" });
    }
  } else {
    enemy.ta = turnToward(enemy.ta, ang, 2.6 * dt);
    enemy.face = enemy.ta;
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      const volley = enemy.elite
        ? [
            [-1, -0.14],
            [-1, 0],
            [1, 0.14],
          ]
        : [
            [-1, -0.08],
            [1, 0.08],
          ];
      fireBarrels(game, enemy, enemy.ta, 19, enemy.dmg * 0.9, volley, 0.21);
      // 3.2m radial brass shock-ring around the anchored belfry
      game.hazard({
        x: enemy.x,
        y: enemy.y,
        r: 3.2,
        delay: 0.55,
        dmg: enemy.dmg * 0.65,
        kind: "stomp",
      });
      enemy.st = 0;
      enemy.t = 2.4 + game.rng.next() * 1.0;
    }
  }
  return true;
}

function updateMender(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed } = ctx;
  enemy.mendT = Math.max(0, (enemy.mendT || 0) - dt);
  if (dist > 13 || !enemy.los) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else if (dist < 8) {
    enemy.vx = (-dx / dist) * speed;
    enemy.vy = (-dy / dist) * speed;
  } else {
    const side = Math.sin(enemy.phase) > 0 ? 1 : -1;
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
        other.type === "mossHealer" ||
        Math.hypot(other.x - enemy.x, other.y - enemy.y) > 9
      )
        return;
      const frac = other.hp / other.maxHp;
      if (frac < lowest) {
        lowest = frac;
        target = other;
      }
    });
    if (target) {
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * (enemy.elite ? 0.22 : 0.15));
      target.healFlash = 0.36;
      enemy.mendT = 0.4;
      game.emit("mend", { x: enemy.x, y: enemy.y, tx: target.x, ty: target.y, type: "mossHealer" });
    }
  }
  enemy.face = turnToward(enemy.face, ang, 5 * dt);
  return true;
}

function updateMortar(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive, player } = ctx;
  if (dist > 16 || !enemy.los) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else if (dist < 9) {
    enemy.vx = (-dx / dist) * speed;
    enemy.vy = (-dy / dist) * speed;
  } else {
    enemy.vx *= 0.85;
    enemy.vy *= 0.85;
  }
  enemy.t -= dt;
  if (enemy.st === 1) {
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) enemy.st = 0;
  }
  if (enemy.t <= 0 && dist < 19 && alive) {
    const shots = enemy.elite ? 3 : 1;
    for (let k = 0; k < shots; k++) {
      let tx = player.x + player.vx * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0),
        ty = player.y + player.vy * 0.9 + (shots > 1 ? game.rng.range(-2.2, 2.2) : 0);
      tx = clamp(tx, -game.arena.W + 1, game.arena.W - 1);
      ty = clamp(ty, -game.arena.H + 1, game.arena.H - 1);
      game.hazard({
        x: tx,
        y: ty,
        r: 2,
        delay: 1.5 + k * 0.15,
        dmg: enemy.dmg,
        kind: "bellCannon",
        sx: enemy.x,
        sy: enemy.y,
        chill: enemy.variant === "frost",
      });
    }
    enemy.recoilT = 0.25;
    game.emit("lob", { x: enemy.x, y: enemy.y, frost: enemy.variant === "frost" });
    enemy.st = 1;
    enemy.t2 = 0.35;
    enemy.t = (3.8 + game.rng.next() * 1.2) * (enemy.los ? 1 : 1.6);
  }
  enemy.face = turnToward(enemy.face, ang, 4 * dt);
  return true;
}

// Wild Boar ('charger'): 1.4x charge contact damage and ricochets once off the first wall it hits at 70% speed
// with a spark shower instead of stopping immediately.
function updateCharger(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    enemy.charging = false;
    enemy.bounced = false;
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
    enemy.t -= dt;
    enemy.face = turnToward(enemy.face, ang, 9 * dt);
    if (alive && dist < 11 && dist > 3.5 && enemy.t <= 0 && enemy.los) {
      enemy.st = 1;
      enemy.t2 = 0.46;
      enemy.ta = ang;
      enemy.vx *= 0.2;
      enemy.vy *= 0.2;
      game.emit("charge", { x: enemy.x, y: enemy.y, type: enemy.type });
    }
  } else if (enemy.st === 1) {
    enemy.charging = false;
    enemy.vx *= 0.65;
    enemy.vy *= 0.65;
    enemy.t2 -= dt;
    enemy.face = turnToward(enemy.face, enemy.ta, 16 * dt);
    if (enemy.t2 <= 0) {
      enemy.st = 2;
      enemy.t2 = 0.78;
      enemy.charging = true;
      enemy.bounced = false;
      enemy.hitWall = false;
      enemy.vx = Math.cos(enemy.ta) * 16.5;
      enemy.vy = Math.sin(enemy.ta) * 16.5;
      game.emit("edash", { x: enemy.x, y: enemy.y, a: enemy.ta, type: enemy.type });
    }
  } else {
    enemy.charging = true;
    enemy.t2 -= dt;
    if (enemy.hitWall && !enemy.bounced) {
      enemy.bounced = true;
      enemy.hitWall = false;
      // Ricochet off the wall/obstacle toward the player at 70% speed with a spark shower
      const curSpd = Math.max(10.5, Math.hypot(enemy.vx, enemy.vy) * 0.7);
      const bounceAng = turnToward(enemy.ta + Math.PI, ang, 1.1);
      enemy.ta = bounceAng;
      enemy.face = bounceAng;
      enemy.vx = Math.cos(bounceAng) * curSpd;
      enemy.vy = Math.sin(bounceAng) * curSpd;
      enemy.t2 = Math.max(enemy.t2, 0.36);
      game.emit("thud", { x: enemy.x, y: enemy.y, src: "wildBoar" });
    } else {
      enemy.vx *= 0.988;
      enemy.vy *= 0.988;
    }
    if (enemy.t2 <= 0 || (enemy.hitWall && enemy.bounced)) {
      enemy.charging = false;
      enemy.st = 0;
      enemy.t = 1.5 + game.rng.next() * 1.1;
    }
  }
  return true;
}

// Mine Cart ('minebot'): plants persistent 7s armed Ember-Pots on the arena floor (up to 3 active,
// shootable by the player to detonate onto enemies!).
function updateMinebot(game, enemy, dt, ctx) {
  const { dx, dy, dist, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    const retreat = dist < 5.2;
    enemy.vx = (retreat ? -cdx : cdx) * speed * (retreat ? 1.35 : 1);
    enemy.vy = (retreat ? -cdy : cdy) * speed * (retreat ? 1.35 : 1);
    enemy.t -= dt;
    enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
    if (alive && dist < 11.5 && dist > 3.2 && enemy.t <= 0 && enemy.los) {
      let activePots = 0;
      for (const h of game.hazards) {
        if (h.kind === "mine" && h.ownerId === enemy.id && h.t < h.delay) activePots++;
      }
      if (activePots < 3) {
        enemy.st = 1;
        enemy.t2 = 0.45;
        enemy.vx = 0;
        enemy.vy = 0;
        game.hazard({
          x: enemy.x,
          y: enemy.y,
          r: 1.45,
          delay: 7.0,
          dmg: enemy.dmg * 1.25,
          kind: "mine",
          shootable: true,
          hitR: 0.72,
          ownerId: enemy.id,
        });
        game.emit("mine", { x: enemy.x, y: enemy.y });
      } else {
        enemy.t = 1.0;
      }
    }
  } else {
    enemy.t2 -= dt;
    enemy.face = turnToward(enemy.face, Math.atan2(dy, dx), 8 * dt);
    if (enemy.t2 <= 0) {
      enemy.st = 0;
      enemy.t = 2.2 + game.rng.next() * 1.1;
    }
  }
  return true;
}

function updateSapper(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive, player } = ctx;
  if (enemy.st === 0) {
    const retreat = dist < 5.5;
    enemy.vx = (retreat ? -cdx : cdx) * speed * (retreat ? 1.35 : 1);
    enemy.vy = (retreat ? -cdy : cdy) * speed * (retreat ? 1.35 : 1);
    enemy.t -= dt;
    enemy.face = turnToward(enemy.face, ang, 8 * dt);
    if (alive && dist < 10.5 && dist > 3.6 && enemy.t <= 0 && enemy.los) {
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
        kind: "bombMaker",
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
  return true;
}

// Star Ghost ('starGhost'): while veiled (ghost = true), glides rapidly (8.5 m/s) toward the player's flank
// leaving faint starlight footprints before materializing into its slash.
function updatePhantom(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive, player } = ctx;
  if (enemy.st === 0) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
    enemy.face = turnToward(enemy.face, ang, 10 * dt);
    enemy.t -= dt;
    if (alive && dist < 9.5 && dist > 3.2 && enemy.t <= 0) {
      enemy.st = 1;
      enemy.t2 = 0.75;
      enemy.ghost = true;
      enemy.flankSide = game.rng.chance(0.5) ? 1 : -1;
      enemy.stepEmitT = 0;
      enemy.t = 2.7;
      game.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
    }
  } else if (enemy.st === 1) {
    enemy.ghost = true;
    const flankAng = ang + (enemy.flankSide || 1) * 1.1,
      tx = player.x - Math.cos(flankAng) * 2.2,
      ty = player.y - Math.sin(flankAng) * 2.2,
      fdx = tx - enemy.x,
      fdy = ty - enemy.y,
      fdist = Math.hypot(fdx, fdy) || 0.001,
      glideSpd = 8.5 * (speed / Math.max(0.1, enemy.def.speed));
    enemy.vx = (fdx / fdist) * glideSpd;
    enemy.vy = (fdy / fdist) * glideSpd;
    enemy.face = turnToward(enemy.face, ang, 12 * dt);
    enemy.stepEmitT = (enemy.stepEmitT || 0) - dt;
    if (enemy.stepEmitT <= 0) {
      enemy.stepEmitT = 0.18;
      game.emit("step", { x: enemy.x, y: enemy.y, ground: "starlight", ghost: true });
    }
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.ghost = false;
      enemy.st = 2;
      enemy.t2 = 0.32;
      enemy.vx = Math.cos(ang) * 13.5;
      enemy.vy = Math.sin(ang) * 13.5;
      game.emit("edash", { x: enemy.x, y: enemy.y, a: ang, type: enemy.type });
    }
  } else {
    enemy.ghost = false;
    enemy.t2 -= dt;
    enemy.vx *= 0.985;
    enemy.vy *= 0.985;
    if (enemy.t2 <= 0) enemy.st = 0;
  }
  return true;
}

// Crystal Tower ('sentinel'): sweeps its beam across a wide arc (rot: 0.65 over 1.1s).
function updateSentinel(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    if (dist > 12) {
      enemy.vx = cdx * speed;
      enemy.vy = cdy * speed;
    } else if (dist < 8.5) {
      enemy.vx = (-dx / dist) * speed * 0.7;
      enemy.vy = (-dy / dist) * speed * 0.7;
    } else if (!enemy.los) {
      enemy.vx = cdx * speed * 0.6;
      enemy.vy = cdy * speed * 0.6;
    } else {
      enemy.vx *= 0.65;
      enemy.vy *= 0.65;
    }
    enemy.face = turnToward(enemy.face, ang, 6 * dt);
    enemy.t -= dt;
    if (alive && dist < 15 && dist > 5.5 && enemy.t <= 0 && enemy.los) {
      enemy.st = 1;
      enemy.t2 = 0.65;
      enemy.sweepDir = game.rng.chance(0.5) ? 1 : -1;
      enemy.ta = ang - enemy.sweepDir * 0.35;
      enemy.vx *= 0.2;
      enemy.vy *= 0.2;
    }
  } else if (enemy.st === 1) {
    enemy.t2 -= dt;
    enemy.vx *= 0.72;
    enemy.vy *= 0.72;
    enemy.face = turnToward(enemy.face, enemy.ta, 8 * dt);
    if (enemy.t2 <= 0) {
      const dir = enemy.sweepDir || 1;
      game.beam({
        x: enemy.x,
        y: enemy.y,
        a: enemy.ta,
        len: 18,
        w: 0.24,
        warn: 0.55,
        dur: 1.1,
        rot: 0.65 * dir,
        dmg: enemy.dmg * 1.2,
        color: enemy.def.color,
        follow: enemy,
        skin: SENTINEL_SKIN[game.arena.biome.id] || null,
      });
      game.emit("beamWarn", {
        x: enemy.x,
        y: enemy.y,
        small: true,
        skin: SENTINEL_SKIN[game.arena.biome.id] || null,
      });
      enemy.st = 2;
      enemy.t2 = 2.6 + game.rng.next() * 1.1;
    }
  } else {
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.st = 0;
      enemy.t = 0.6 + game.rng.next() * 0.8;
    }
  }
  return true;
}

// Supply Kite ('carrier'): launches up to 2 miniature Paper-Skiff Escorts (mite-sized flyers that orbit and swoop)
// while firing a heavy brass broadside cannonball.
function updateCarrier(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive } = ctx;
  if (dist < 8.5) {
    enemy.vx = (-dx / dist) * speed;
    enemy.vy = (-dy / dist) * speed;
  } else if (dist > 12) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else {
    const side = Math.sin(enemy.age * 1.7 + enemy.phase);
    enemy.vx = Math.cos(ang + Math.PI / 2) * side * speed;
    enemy.vy = Math.sin(ang + Math.PI / 2) * side * speed;
  }
  enemy.face = turnToward(enemy.face, ang, 7 * dt);
  enemy.t -= dt;
  if (alive && dist < 15 && dist > 5.5 && enemy.t <= 0 && enemy.los) {
    // Fire heavy brass broadside cannonball
    game.shoot(enemy.x, enemy.y, ang, 16, enemy.dmg * 1.05, {
      kind: "supplyKite",
      r: 0.28,
      life: 3.4,
      homing: 0.7,
    });
    // Launch up to 2 miniature Paper-Skiff Escorts
    enemy.escorts = (enemy.escorts || []).filter((e) => e && !e.dead);
    if (enemy.escorts.length < 2 && game.enemies.length < 75) {
      const launchAng = ang + (enemy.escorts.length === 0 ? -0.65 : 0.65);
      const skiff = game.spawnEnemy(
        "littlePod",
        enemy.x + Math.cos(launchAng) * (enemy.r + 0.45),
        enemy.y + Math.sin(launchAng) * (enemy.r + 0.45),
        {
          parent: enemy.id,
          parentRef: enemy,
          hpF: 1.15,
          noVariant: true,
        },
      );
      skiff.spawnT = 0.12;
      skiff.noDrop = true;
      skiff.paperSkiff = true;
      skiff.kx = Math.cos(launchAng) * 6;
      skiff.ky = Math.sin(launchAng) * 6;
      enemy.escorts.push(skiff);
      game.emit("hatch", { x: enemy.x, y: enemy.y, src: "supplyKite" });
    }
    enemy.recoilT = 0.25;
    enemy.t = 2.4 + game.rng.next() * 1.0;
    game.emit("eshot", { x: enemy.x, y: enemy.y, type: "supplyKite" });
  }
  return true;
}

function updateDrone(game, enemy, dt, ctx) {
  const { dx, dy, dist, ang, cdx, cdy, speed, alive } = ctx;
  const side = Math.sin(enemy.age * 2.1 + enemy.phase);
  if (dist < 7) {
    enemy.vx = (-dx / dist) * speed;
    enemy.vy = (-dy / dist) * speed;
  } else if (dist > 11 || !enemy.los) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else {
    enemy.vx = Math.cos(ang + Math.PI / 2) * side * speed;
    enemy.vy = Math.sin(ang + Math.PI / 2) * side * speed;
  }
  enemy.face = turnToward(enemy.face, ang, 7 * dt);
  enemy.t -= dt;
  if (alive && dist < 16 && dist > 4.5 && enemy.t <= 0 && enemy.los) {
    for (const off of [-0.18, 0.18]) {
      game.shoot(enemy.x, enemy.y, ang + off, 18, enemy.dmg * 0.72, { kind: "dartSprite", life: 2.8, homing: 1.6 });
    }
    enemy.recoilT = 0.25;
    enemy.t = 2.2 + game.rng.next() * 0.8;
    game.emit("eshot", { x: enemy.x, y: enemy.y, type: "dartSprite" });
  }
  return true;
}

// Burrow Mole ('driller'): burrows underground (enemy.ghost = true, lowered Y offset, dirt-wake particles)
// while tracking toward the player, then pauses with a 0.55s rumbling ring telegraph before erupting upward.
function updateDriller(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed, alive } = ctx;
  if (enemy.st === 0) {
    enemy.ghost = false;
    enemy.burrowY = 0;
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
    enemy.face = turnToward(enemy.face, ang, 7 * dt);
    enemy.t -= dt;
    if (alive && dist < 9.5 && dist > 3.2 && enemy.t <= 0 && enemy.los) {
      enemy.st = 1;
      enemy.t2 = 0.75;
      enemy.ta = ang;
      enemy.ghost = true;
      enemy.burrowY = -0.58;
      game.emit("charge", { x: enemy.x, y: enemy.y, type: "burrowMole" });
    }
  } else if (enemy.st === 1) {
    // Burrowing underground toward the player
    enemy.ghost = true;
    enemy.burrowY = -0.62;
    enemy.t2 -= dt;
    enemy.ta = turnToward(enemy.ta, ang, 3.2 * dt);
    enemy.face = enemy.ta;
    const burrowSpd = 10.5 * (speed / Math.max(0.1, enemy.def.speed));
    enemy.vx = Math.cos(enemy.ta) * burrowSpd;
    enemy.vy = Math.sin(enemy.ta) * burrowSpd;
    if (enemy.t2 <= 0 || dist < 1.6 || enemy.hitWall) {
      enemy.st = 2;
      enemy.t2 = 0.55;
      enemy.vx = 0;
      enemy.vy = 0;
      // 0.55s rumbling ring telegraph before eruption
      game.hazard({ x: enemy.x, y: enemy.y, r: 1.75, delay: 0.55, dmg: enemy.dmg * 0.85, kind: "drill" });
      game.emit("blinkWarn", { x: enemy.x, y: enemy.y });
    }
  } else {
    // Paused beneath the rumbling ring before erupting
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.t2 -= dt;
    if (enemy.t2 <= 0) {
      enemy.ghost = false;
      enemy.burrowY = 0;
      enemy.st = 0;
      enemy.t = 1.8 + game.rng.next() * 1.2;
      game.arena.resolve(enemy, enemy.r);
      game.emit("thud", { x: enemy.x, y: enemy.y, src: "burrowMole" });
    }
  }
  return true;
}

// Healing Stone ('beacon'): anchors in place during its 1.2s chant and projects a visible golden warding tether
// to the 2 nearest allies (granting -30% damage taken + 8% mend on completion).
function updateBeacon(game, enemy, dt, ctx) {
  const { dist, ang, cdx, cdy, speed } = ctx;
  if (enemy.st === 1) {
    // Anchored 1.2s warding chant
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.t2 -= dt;
    const targets = [];
    for (const id of enemy.tetherIds || []) {
      const ally = game.enemies.find((e) => e.id === id && !e.dead && !e.boss);
      if (ally) {
        ally.wardedT = Math.max(ally.wardedT || 0, 0.35);
        targets.push({ id: ally.id, x: ally.x, y: ally.y });
      }
    }
    enemy.tethers = targets;
    if (enemy.t2 <= 0) {
      for (const id of enemy.tetherIds || []) {
        const ally = game.enemies.find((e) => e.id === id && !e.dead && !e.boss);
        if (ally) {
          ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.08);
          ally.wardedT = Math.max(ally.wardedT || 0, 1.5);
          ally.healFlash = 0.3;
        }
      }
      enemy.tethers = null;
      enemy.tetherIds = null;
      enemy.st = 0;
      enemy.t = 2.8 + game.rng.next() * 0.8;
      game.emit("mend", { x: enemy.x, y: enemy.y, r: 6.5, type: "healingStone" });
    }
    return true;
  }
  enemy.tethers = null;
  if (dist < 9.5) {
    enemy.vx = -cdx * speed * 0.85;
    enemy.vy = -cdy * speed * 0.85;
  } else if (dist > 13) {
    enemy.vx = cdx * speed;
    enemy.vy = cdy * speed;
  } else {
    const side = Math.sin(enemy.age * 1.5 + enemy.phase);
    enemy.vx = Math.cos(ang + Math.PI / 2) * side * speed * 0.7;
    enemy.vy = Math.sin(ang + Math.PI / 2) * side * speed * 0.7;
  }
  enemy.face = turnToward(enemy.face, ang, 5 * dt);
  enemy.t -= dt;
  if (enemy.t <= 0) {
    const candidates = [];
    game.hash.query(enemy.x, enemy.y, 7.5, (ally) => {
      if (ally === enemy || ally.dead || ally.boss || ally.type === "healingStone") return;
      const d = Math.hypot(ally.x - enemy.x, ally.y - enemy.y);
      if (d <= 7.5 + ally.r) candidates.push({ ally, d });
    });
    candidates.sort((a, b) => a.d - b.d);
    const chosen = candidates.slice(0, 2).map((c) => c.ally);
    if (chosen.length) {
      enemy.st = 1;
      enemy.t2 = 1.2;
      enemy.tetherIds = chosen.map((a) => a.id);
      enemy.tethers = chosen.map((a) => ({ id: a.id, x: a.x, y: a.y }));
      for (const ally of chosen) ally.wardedT = Math.max(ally.wardedT || 0, 1.25);
    } else {
      enemy.t = 1.2;
    }
  }
  return true;
}

// Star Spider ('weaver'): when warping from point A to point B, strings a 3.0s glowing Star-Silk Tether
// between A and B that slows the player if crossed (and snaps with a bonus spark if dashed through).
function updateWeaver(game, enemy, dt, ctx) {
  const { ang, speed, alive, player } = ctx;
  const side = Math.sin(enemy.age * 2.8 + enemy.phase);
  enemy.vx = Math.cos(ang + Math.PI / 2) * side * speed;
  enemy.vy = Math.sin(ang + Math.PI / 2) * side * speed;
  enemy.face = turnToward(enemy.face, ang, 8 * dt);
  if (enemy.st === 1) {
    enemy.t2 -= dt;
    enemy.vx *= 0.3;
    enemy.vy *= 0.3;
    if (enemy.t2 <= 0) {
      enemy.st = 0;
      if (alive) {
        const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        for (const off of [-0.22, 0, 0.22]) {
          game.shoot(enemy.x, enemy.y, aim + off, 24, enemy.dmg * 0.72, { kind: "starSpider", life: 2.6 });
        }
        enemy.recoilT = 0.25;
        game.emit("eshot", { x: enemy.x, y: enemy.y, type: "starSpider" });
      }
      enemy.t = 3.4 + game.rng.next() * 1.2;
    }
    return true;
  }
  enemy.t -= dt;
  if (enemy.t <= 0 && !alive) enemy.t = 1;
  if (enemy.t <= 0) {
    const spot = game.arena.freePoint(game.rng, player.x, player.y, 7.4, 1.25);
    if (spot) {
      const ox = enemy.x,
        oy = enemy.y;
      enemy.x = spot.x;
      enemy.y = spot.y;
      game.arena.resolve(enemy, enemy.r);
      // String a 3.0s glowing Star-Silk Tether between (ox, oy) and (enemy.x, enemy.y)
      game.hazard({
        x: (ox + enemy.x) * 0.5,
        y: (oy + enemy.y) * 0.5,
        ax: ox,
        ay: oy,
        bx: enemy.x,
        by: enemy.y,
        r: 0.45,
        delay: 3.0,
        dmg: enemy.dmg * 0.55,
        kind: "tether",
        src: "starSpider",
      });
      game.emit("warp", { x: ox, y: oy, tx: enemy.x, ty: enemy.y, who: "starSpider" });
    }
    enemy.st = 1;
    enemy.t2 = 0.45;
    game.emit("aim", { x: enemy.x, y: enemy.y, type: "starSpider" });
  }
  return true;
}

const ENEMY_HANDLERS = {
  smallBug: updateSwarmer,
  littlePod: updateSwarmer,
  kettleGuard: updateWalker,
  sporePod: updateWalker,
  brassGuard: updateGunner,
  firePot: updateBomber,
  ironGolem: updateBrute,
  longshot: updateSniper,
  mushroomNest: updateHive,
  shieldGuard: updateBulwark,
  blinkBlade: updateStriker,
  bogHopper: updateLeaper,
  watchTower: updateTurret,
  mossHealer: updateMender,
  bellCannon: updateMortar,
  wildBoar: updateCharger,
  mineCart: updateMinebot,
  bombMaker: updateSapper,
  starGhost: updatePhantom,
  crystalTower: updateSentinel,
  supplyKite: updateCarrier,
  dartSprite: updateDrone,
  burrowMole: updateDriller,
  healingStone: updateBeacon,
  starSpider: updateWeaver,
};

function updateEnemy(game, enemy, dt) {
  if (enemy.caravan) return;
  const baseSpeed = enemy.speed;
  if (enemy.sunT > 0) {
    enemy.sunT = Math.max(0, enemy.sunT - dt);
    enemy.speed *= 2.1;
  }
  if (enemy.recoilT > 0) {
    enemy.recoilT = Math.max(0, enemy.recoilT - dt);
  }
  try {
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
    const cdx = game.cdx,
      cdy = game.cdy,
      speed = enemy.speed,
      alive = player.alive;
    if (enemy.hunt && RL_KITERS.has(enemy.type)) {
      enemy.st = 0;
      enemy.tethers = enemy.tetherIds = null;
      enemy.anchored = false;
      const huntSpd = Math.max(speed, 2.6) * 1.3;
      enemy.vx = cdx * huntSpd;
      enemy.vy = cdy * huntSpd;
      enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
      return;
    }
    const handler = ENEMY_HANDLERS[enemy.type] || updateWalker;
    _aiCtx.player = player;
    _aiCtx.dx = dx;
    _aiCtx.dy = dy;
    _aiCtx.dist = dist;
    _aiCtx.ang = ang;
    _aiCtx.cdx = cdx;
    _aiCtx.cdy = cdy;
    _aiCtx.speed = speed;
    _aiCtx.alive = alive;
    const handledFace = handler(game, enemy, dt, _aiCtx);
    if (!handledFace && Math.hypot(enemy.vx, enemy.vy) > 0.2) {
      enemy.face = turnToward(enemy.face, Math.atan2(enemy.vy, enemy.vx), 8 * dt);
    }
  } finally {
    enemy.speed = baseSpeed;
  }
}

const _aiCtx = { player: null, dx: 0, dy: 0, dist: 0, ang: 0, cdx: 0, cdy: 0, speed: 0, alive: false };

export { updateEnemy, ENEMY_HANDLERS };
