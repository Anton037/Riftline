// Unified Enemy & Guardian Boss AI.
// Enemy role state machines live in ./enemy-ai.js; Guardian boss patterns and Crescendos live here.

import { clamp, TAU, angleDiff, turnToward } from "./util.js";
import { updateEnemy, ENEMY_HANDLERS } from "./enemy-ai.js";

const bossPatterns = {
  bellKeeper: ["charge", "ring", "carillon", "stomp", "charge", "ring"],
  mossQueen: ["summon", "spiral", "burst", "eggs", "spiral", "burst"],
  iceCrystal: ["frostbeam", "teleport", "frostnova", "icelances", "glacier", "teleport", "iceshards"],
  starHeart: ["spiral", "summon", "ring", "cross", "burst", "rain"],
  emberKing: ["barrage", "charge", "summon", "ring", "barrage", "rain"],
  sandDragon: ["rise", "shards", "sunlance", "sandstorm"],
};

const PRISM_ICE = 12578815;
const WYRM_SUN = 0xffd98a;

const CRESCENDO = {
    bellKeeper: "bellCage",
    iceCrystal: "whiteout",
    mossQueen: "plague",
    starHeart: "collapse",
    emberKing: "firestorm",
    sandDragon: "noon",
  },
  OVERDRIVE = CRESCENDO,
  REINFORCE = { bellKeeper: true, iceCrystal: true, emberKing: true };

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
  const attacks = bossPatterns[boss.type];
  if (boss.odDue && CRESCENDO[boss.type]) {
    boss.odDue = false;
    boss.st = CRESCENDO[boss.type];
  } else {
    boss.st = attacks[boss.pattern % attacks.length];
    boss.pattern++;
    if (boss.enraged && boss.pattern % attacks.length === 0) boss.odDue = true;
  }
  boss.t = 0;
  boss.t2 = 0;
  boss.n = 0;
  game.emit("bossAtk", { id: boss.type, atk: boss.st, src: boss.type });
}

function endBossAttack(boss, delay, opening = true) {
  boss.st = "walk";
  boss.t = delay * (boss.pace || 1);
  boss.openT = opening ? Math.min(0.85, boss.t) : 0;
  boss.n = 0;
  boss.t2 = 0;
  boss.charging = false;
}

function shiftBossArenaHazards(game, boss) {
  const arena = game.arena;
  if (!arena) return;
  if (boss.type === "bellKeeper" || boss.type === "emberKing") {
    for (const v of arena.vents || []) {
      v.phase = (v.phase + v.period * 0.5) % Math.max(1, v.period);
    }
  } else if (boss.type === "sandDragon") {
    for (const d of arena.devils || []) {
      d.a = (d.a || 0) + Math.PI * 0.5;
      d.calmT = 0;
    }
  } else if (boss.type === "mossQueen") {
    for (const p of arena.acid || []) {
      if (p.life == null) p.r = Math.min(2.8, p.r + 0.25);
    }
  } else if (boss.type === "iceCrystal") {
    for (const p of arena.ice || []) {
      p.r = Math.min(3.3, p.r + 0.25);
    }
  }
}

function triggerPhaseTransition(game, boss, nextPhase) {
  boss.phaseN = nextPhase;
  boss.enraged = true;
  boss.odDue = true;
  boss.shieldT = 1.0;
  boss.shielded = true;
  boss.diveT = 0;
  boss.ghost = false;
  boss.charging = false;
  for (const shot of game.eb) shot.life = 0;
  game.beams.length = 0;
  shiftBossArenaHazards(game, boss);
  if (typeof game.triggerHitstop === "function") game.triggerHitstop(0.032);
  else game.hitstopT = Math.max(game.hitstopT || 0, 0.032);
  game.emit("phase", { n: nextPhase, x: boss.x, y: boss.y, src: boss.type });
  if (boss.type !== "starHeart") {
    game.emit("enrage", { id: boss.type, x: boss.x, y: boss.y, src: boss.type });
    if (REINFORCE[boss.type]) bossReinforce(game, boss);
  }
  endBossAttack(boss, 1.0, false);
}

function updateBoss(game, boss, dt) {
  game._src = boss.type;
  if (boss.spawnT > 0) {
    boss.vx = 0;
    boss.vy = 0;
    return;
  }
  if (boss.openT > 0) boss.openT = Math.max(0, boss.openT - dt);
  if (boss.stunT > 0) {
    boss.stunT = Math.max(0, boss.stunT - dt);
    boss.vx *= 0.7;
    boss.vy *= 0.7;
    if (boss.stunT > 0) return;
  }
  const player = game.player,
    dx = player.x - boss.x,
    dy = player.y - boss.y,
    dist = Math.hypot(dx, dy) || 0.001,
    aim = Math.atan2(dy, dx),
    hpFrac = boss.hp / boss.maxHp,
    shotDmg = boss.dmg * 0.7;

  // Unified HP-gated phase transitions across all 6 Guardians
  if (boss.type === "starHeart") {
    const phase = hpFrac > 0.66 ? 1 : hpFrac > 0.33 ? 2 : 3;
    boss.enraged = phase >= 2;
    if (phase !== boss.phaseN) {
      triggerPhaseTransition(game, boss, phase);
      return;
    }
  } else if (!boss.enraged && hpFrac <= 0.5) {
    triggerPhaseTransition(game, boss, 2);
    return;
  }

  if (boss.shieldT > 0) {
    boss.shieldT = Math.max(0, boss.shieldT - dt);
    boss.shielded = boss.shieldT > 0;
  }

  // Rotate Star Hall portal mouths slowly during Star Heart Phase 3
  if (boss.type === "starHeart" && boss.phaseN >= 3 && game.arena?.portals?.length) {
    const maxR = Math.min(game.arena.W, game.arena.H) - 3.8;
    for (const p of game.arena.portals) {
      const aA = Math.atan2(p.ay, p.ax) + dt * 0.28,
        rA = Math.min(maxR, Math.max(6.5, Math.hypot(p.ax, p.ay))),
        aB = Math.atan2(p.by, p.bx) + dt * 0.28,
        rB = Math.min(maxR, Math.max(6.5, Math.hypot(p.bx, p.by)));
      p.ax = Math.cos(aA) * rA;
      p.ay = Math.sin(aA) * rA;
      p.bx = Math.cos(aB) * rB;
      p.by = Math.sin(aB) * rB;
    }
  }

  const rage = boss.enraged ? 1 : 0;
  boss.spin += dt;

  if (boss.type === "sandDragon" && boss.st === "walk") {
    if (boss.diveT > 0) {
      boss.diveT = Math.max(0, boss.diveT - dt);
      boss.ghost = boss.diveT > 0;
    } else {
      boss.ghost = false;
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
  if (boss.st === CRESCENDO[boss.type]) {
    updateCrescendo(game, boss, dt, aim, dist, shotDmg);
    return;
  }

  switch (boss.type) {
    case "bellKeeper": {
      if (boss.st === "charge") {
        // Belfry Rush: telegraphed rush leaving 2 delayed brass chime-inlays in its wake
        const charges = 2 + rage;
        if (boss.t2 === 0) {
          boss.t2 = 1;
          boss.ta = aim;
          boss.sub = 0;
          boss.subT = 0;
          boss.wakeN = 0;
          game.emit("charge", { x: boss.x, y: boss.y, type: "bellKeeper", src: "bellKeeper" });
        }
        boss.subT += dt;
        if (boss.sub === 0) {
          boss.vx = 0;
          boss.vy = 0;
          if (boss.subT < 0.5) boss.ta = turnToward(boss.ta, aim, 3 * dt);
          boss.face = turnToward(boss.face, boss.ta, 8 * dt);
          if (boss.subT > (rage ? 0.65 : 0.85)) {
            boss.sub = 1;
            boss.subT = 0;
            boss.wakeN = 0;
          }
        } else if (boss.sub === 1) {
          const chargeSpeed = rage ? 17.5 : 15;
          boss.vx = Math.cos(boss.ta) * chargeSpeed;
          boss.vy = Math.sin(boss.ta) * chargeSpeed;
          boss.charging = true;
          if (boss.wakeN < 2 && boss.subT >= 0.22 + boss.wakeN * 0.28) {
            boss.wakeN++;
            game.hazard({
              x: clamp(boss.x, -game.arena.W + 1.5, game.arena.W - 1.5),
              y: clamp(boss.y, -game.arena.H + 1.5, game.arena.H - 1.5),
              r: 1.9,
              delay: 0.95,
              dmg: boss.dmg * 0.72,
              kind: "stomp",
              src: "bellKeeper",
            });
          }
          if ((boss.hitWall && boss.subT > 0.1) || boss.subT > 0.8) {
            boss.charging = false;
            if (boss.hitWall) {
              game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "bellKeeper" });
              game.explode(boss.x, boss.y, 2.4, 0, { kind: "stomp", src: "bellKeeper" });
              if (rage) shootRing(game, boss, 10, 7.5, shotDmg, boss.spin);
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
              game.emit("charge", { x: boss.x, y: boss.y, type: "bellKeeper", src: "bellKeeper" });
            }
          }
        }
        return;
      }
      if (boss.st === "ring") {
        // Brass Toll: rhythmic alternating fast outer bell-waves & slower counter-offset inner chimes
        boss.vx *= 0.85;
        boss.vy *= 0.85;
        const tolls = 3 + rage,
          gap = 0.54;
        if (boss.t >= 0.38 + boss.n * gap && boss.n < tolls) {
          const fast = boss.n % 2 === 0,
            count = fast ? 14 + rage * 4 : 12 + rage * 4,
            spd = fast ? 8.6 + rage * 0.8 : 5.8 + rage * 0.6;
          shootRing(game, boss, count, spd, shotDmg, boss.spin + (fast ? 0 : Math.PI / count));
          boss.n++;
        }
        if (boss.t > 0.38 + tolls * gap + 0.45) {
          endBossAttack(boss, 2.3 - rage * 0.65);
        }
        return;
      }
      if (boss.st === "carillon") {
        // Resonant Carillon: strikes the arena's Bell-Censers to send expanding chime rings;
        // if the player shoots/tolls a charging Bell-Censer first, it reflects a stun wave onto the Bellkeeper!
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          game.emit("charge", { x: boss.x, y: boss.y, type: "bellKeeper", src: "bellKeeper" });
          const vents = game.arena.vents || [];
          for (const v of vents) {
            v.bossTollT = 1.15;
          }
          // If no vents exist on custom test arenas, place 4 cardinal carillon chime zones
          if (!vents.length) {
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * TAU + Math.PI / 4;
              game.hazard({
                x: clamp(boss.x + Math.cos(a) * 6.5, -game.arena.W + 1.5, game.arena.W - 1.5),
                y: clamp(boss.y + Math.sin(a) * 6.5, -game.arena.H + 1.5, game.arena.H - 1.5),
                r: 2.3,
                delay: 1.0,
                dmg: boss.dmg * 0.8,
                kind: "stomp",
                src: "bellKeeper",
              });
            }
          }
        }
        if (boss.n === 1 && boss.t >= 0.95) {
          boss.n = 2;
          for (const v of game.arena.vents || []) {
            if (v.bossTollT > 0) {
              v.bossTollT = 0;
              game.hazard({
                x: v.x,
                y: v.y,
                r: v.r * 1.65,
                delay: 0.45,
                dmg: boss.dmg * 0.82,
                kind: "stomp",
                src: "bellKeeper",
              });
            }
          }
          shootRing(game, boss, 12 + rage * 4, 8.0, shotDmg, aim);
          game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "bellKeeper" });
        }
        if (boss.t > 1.7) {
          endBossAttack(boss, 1.9 - rage * 0.35);
        }
        return;
      }
      if (boss.st === "stomp") {
        // Carillon Slam: 3-beat concentric ripple — inner slam, 4 cardinal chime-pads, then outer brass seal ring
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({ x: boss.x, y: boss.y, r: 4.2, delay: 0.95, dmg: boss.dmg, kind: "stomp", src: "bellKeeper" });
          game.emit("charge", { x: boss.x, y: boss.y, type: "bellKeeper", src: "bellKeeper" });
        }
        if (boss.n === 1 && boss.t >= 0.42) {
          boss.n = 2;
          const base = aim + (rage ? Math.PI / 4 : 0),
            pads = rage ? 6 : 4;
          for (let k = 0; k < pads; k++) {
            const angle = base + (k / pads) * TAU,
              px = clamp(boss.x + Math.cos(angle) * 5.6, -game.arena.W + 1.4, game.arena.W - 1.4),
              py = clamp(boss.y + Math.sin(angle) * 5.6, -game.arena.H + 1.4, game.arena.H - 1.4);
            game.hazard({ x: px, y: py, r: 2.05, delay: 1.05, dmg: boss.dmg * 0.8, kind: "stomp", src: "bellKeeper" });
          }
        }
        if (boss.n === 2 && boss.t > 1.0) {
          boss.n = 3;
          shootRing(game, boss, 14 + rage * 4, 8.4, shotDmg, aim);
          game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "bellKeeper" });
        }
        if (boss.t > 1.75) {
          endBossAttack(boss, 1.95 - rage * 0.35);
        }
        return;
      }
      break;
    }
    case "mossQueen": {
      moveBoss(game, boss, dt, aim, dist, 0.4);
      if (boss.st === "summon") {
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({
            x: boss.x,
            y: boss.y,
            r: 3.4,
            delay: 0.85,
            dmg: boss.dmg * 0.72,
            kind: "rain",
            src: "mossQueen",
          });
          const count = game.enemies.length > 70 ? 0 : 4 + rage * 2;
          for (let k = 0; k < count; k++) {
            const angle = (k / count) * TAU + boss.spin,
              kid = game.spawnEnemy(
                k % 2 ? "littlePod" : "smallBug",
                boss.x + Math.cos(angle) * 2.4,
                boss.y + Math.sin(angle) * 2.4,
                { hpF: 1 },
              );
            kid.spawnT = 0.3;
            kid.noDrop = game.rng.chance(0.6);
            kid.kx = Math.cos(angle) * 5.5;
            kid.ky = Math.sin(angle) * 5.5;
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true, src: "mossQueen" });
        }
        if (boss.t > 1.1) endBossAttack(boss, 1.4);
        return;
      }
      if (boss.st === "spiral") {
        const arms = 3 + rage;
        for (boss.t2 += dt; boss.t2 > 0.12;) {
          boss.t2 -= 0.12;
          const sway = Math.sin(boss.t * 3.2) * 0.14;
          boss.ta = (boss.ta || 0) + 0.22 + sway;
          const fast = boss.n++ % 2 === 0,
            spd = fast ? 7.4 : 4.9;
          for (let k = 0; k < arms; k++) {
            game.shoot(boss.x, boss.y, boss.ta + (k / arms) * TAU, spd, shotDmg, { r: fast ? 0.25 : 0.29 });
          }
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 3.1) endBossAttack(boss, 1.4);
        return;
      }
      if (boss.st === "burst") {
        if (boss.n === 0) {
          for (const side of [-1, 1]) {
            const a = aim + side * 0.55,
              tx = clamp(player.x + Math.cos(a) * 3.0, -game.arena.W + 1.2, game.arena.W - 1.2),
              ty = clamp(player.y + Math.sin(a) * 3.0, -game.arena.H + 1.2, game.arena.H - 1.2);
            game.hazard({
              x: tx,
              y: ty,
              r: 1.75,
              delay: 1.15,
              dmg: boss.dmg * 0.7,
              kind: "bellCannon",
              src: "mossQueen",
              sx: boss.x,
              sy: boss.y,
            });
          }
        }
        if (boss.t >= 0.35 + boss.n * 0.44 && boss.n < 3 + rage) {
          for (let k = 0; k < 5; k++) game.shoot(boss.x, boss.y, aim + (k - 2) * 0.15, 9.2, shotDmg);
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type, src: "mossQueen" });
        }
        if (boss.t > 2.1) endBossAttack(boss, 1.3);
        return;
      }
      if (boss.st === "eggs") {
        if (boss.n === 0) {
          boss.n = 1;
          const room = Math.max(0, 70 - game.enemies.length),
            count = Math.min(room, 2 + rage);
          for (let k = 0; k < count; k++) {
            const angle = aim + (k - (count - 1) / 2) * 0.65,
              kind = k % 2 === 0 ? "sporePod" : "littlePod",
              egg = game.spawnEnemy(kind, boss.x + Math.cos(angle) * 2.1, boss.y + Math.sin(angle) * 2.1, {
                hpF: kind === "sporePod" ? 0.65 : 1,
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
          for (let k = 0; k < 2; k++) {
            const tx = clamp(player.x + player.vx * (0.6 + k * 0.45), -game.arena.W + 1.2, game.arena.W - 1.2),
              ty = clamp(player.y + player.vy * (0.6 + k * 0.45), -game.arena.H + 1.2, game.arena.H - 1.2);
            game.hazard({
              x: tx,
              y: ty,
              r: 1.75,
              delay: 1.05 + k * 0.25,
              dmg: boss.dmg * 0.72,
              kind: "bellCannon",
              src: "mossQueen",
              sx: boss.x,
              sy: boss.y,
            });
          }
          game.emit("hatch", { x: boss.x, y: boss.y, big: true, src: "mossQueen" });
        }
        if (boss.t > 1.35) endBossAttack(boss, 1.55);
        return;
      }
      break;
    }
    case "iceCrystal": {
      if (boss.st === "frostbeam") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        if (boss.n === 0) {
          boss.n = 1;
          const dir = game.rng.chance(0.5) ? 1 : -1,
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
              skin: "iceShot",
            };
          game.beam({ ...beam, a: angle });
          if (rage) game.beam({ ...beam, a: angle + Math.PI });
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "iceShot", src: "iceCrystal" });
        }
        if (boss.t > 3.4) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "teleport") {
        boss.vx = 0;
        boss.vy = 0;
        if (boss.n === 0) {
          boss.n = 1;
          boss.ghost = true;
          shootRing(game, boss, 8, 5.2, shotDmg * 0.85, boss.spin, "shard");
          game.emit("blink", { x: boss.x, y: boss.y, src: "iceCrystal" });
        }
        if (boss.n === 1 && boss.t > 0.45) {
          boss.n = 2;
          const spot = findOpenSpot(game, player.x, player.y, 8, 10.5);
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
          game.emit("blink", { x: boss.x, y: boss.y, in: true, src: "iceCrystal" });
        }
        if (boss.t > 1.6) endBossAttack(boss, 0.9);
        return;
      }
      if (boss.st === "iceshards") {
        moveBoss(game, boss, dt, aim, dist, 0.3);
        if (boss.t >= 0.3 + boss.n * 0.12 && boss.n < 8 + rage * 4) {
          const angle = aim + Math.PI + (boss.n - 4) * 0.4;
          game.shoot(boss.x, boss.y, angle, 5.5, shotDmg, { kind: "shard", homing: 1.3, life: 5, r: 0.24 });
          bossVolley(game, boss, 0.25);
          boss.n++;
        }
        if (boss.t > 2.4) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "icelances") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        const count = 3 + rage * 2;
        if (boss.t >= 0.2 + boss.n * 0.45 && boss.n < count) {
          const tx = player.x + player.vx * 0.5,
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
            skin: "iceShot",
          });
          boss.n++;
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, small: true, skin: "iceShot", src: "iceCrystal" });
        }
        if (boss.t > 0.2 + count * 0.45 + 0.8) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "frostnova") {
        boss.vx *= 0.8;
        boss.vy *= 0.8;
        const rings = 2 + rage;
        if (boss.n === 0) {
          boss.n = 1;
          game.hazard({
            x: boss.x,
            y: boss.y,
            r: 3.6,
            delay: 0.9,
            dmg: boss.dmg * 0.8,
            kind: "frost",
            chill: true,
            src: "iceCrystal",
          });
          game.emit("charge", { x: boss.x, y: boss.y, type: "iceCrystal", src: "iceCrystal" });
        }
        if (boss.n >= 1 && boss.n <= rings && boss.t >= 0.9 + (boss.n - 1) * 0.45) {
          const shots = 14 + rage * 2;
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
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type, src: "iceCrystal" });
        }
        if (boss.t > 0.9 + rings * 0.45 + 0.5) endBossAttack(boss, 1.3);
        return;
      }
      if (boss.st === "glacier") {
        moveBoss(game, boss, dt, aim, dist, 0.5);
        if (boss.n === 0) {
          boss.n = 1;
          game.emit("charge", { x: boss.x, y: boss.y, type: "iceCrystal", src: "iceCrystal" });
          const steps = 4 + rage,
            dir = aim;
          for (let k = 0; k < steps; k++) {
            const reach = 3.2 + k * 2.55,
              px = clamp(boss.x + Math.cos(dir) * reach, -game.arena.W + 1.4, game.arena.W - 1.4),
              py = clamp(boss.y + Math.sin(dir) * reach, -game.arena.H + 1.4, game.arena.H - 1.4);
            game.hazard({
              x: px,
              y: py,
              r: 2.15,
              delay: 0.95 + k * 0.16,
              dmg: boss.dmg * 0.58,
              kind: "glacier",
              src: "iceCrystal",
            });
          }
          if (rage) {
            const spot = findOpenSpot(game, player.x, player.y, 2.0, 4.5);
            if (spot) {
              game.hazard({
                x: spot.x,
                y: spot.y,
                r: 2.3,
                delay: 1.35,
                dmg: boss.dmg * 0.55,
                kind: "glacier",
                src: "iceCrystal",
              });
            }
          }
        }
        if (boss.t > 2.5) endBossAttack(boss, 1.3);
        return;
      }
      break;
    }
    case "starHeart": {
      const phase = boss.phaseN;
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.st === "spiral") {
        // Portal-Refracted Orrery: dual counter-rotating armillary star-spirals + orbs refracted out of the arena portals!
        const arms = 3 + phase,
          portals = game.arena.portals || [];
        boss.t2 += dt;
        const interval = phase === 3 ? 0.1 : 0.12;
        for (; boss.t2 > interval;) {
          boss.t2 -= interval;
          boss.ta = (boss.ta || 0) + 0.21;
          const step = boss.n++,
            counter = phase >= 2 && step % 2 === 1,
            base = counter ? -boss.ta : boss.ta,
            spd = counter ? 7.6 + phase * 0.4 : 5.4 + phase * 0.35;
          for (let k = 0; k < arms; k++) {
            game.shoot(boss.x, boss.y, base + (k / arms) * TAU, spd, shotDmg, { r: counter ? 0.23 : 0.27 });
          }
          // Refract orbs through the arena's portal mouths every 4th pulse
          if (portals.length && step % 4 === 0) {
            const p = portals[step % portals.length],
              mx = step % 8 === 0 ? p.ax : p.bx,
              my = step % 8 === 0 ? p.ay : p.by,
              pAim = Math.atan2(player.y - my, player.x - mx);
            game.shoot(mx, my, pAim, 8.2, shotDmg * 0.9, { r: 0.26 });
          }
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 3) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "summon") {
        if (boss.n === 0) {
          boss.n = 1;
          let types =
            phase === 1
              ? ["blinkBlade", "dartSprite", "blinkBlade", "dartSprite"]
              : phase === 2
                ? ["starGhost", "blinkBlade", "dartSprite", "starGhost"]
                : ["starSpider", "starGhost", "blinkBlade", "starSpider"];
          const room = Math.max(0, 74 - game.enemies.length - game.markers.length);
          types = types.slice(0, room);
          const placed = types.filter((type) => game.queueEnemySpawn(type, { dur: 1, boss: boss.type })).length;
          if (placed) game.emit("portal", { x: boss.x, y: boss.y, n: placed, src: "starHeart" });
        }
        if (boss.t > 1) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "ring") {
        if (boss.t >= 0.32 + boss.n * 0.56 && boss.n < 2 + phase) {
          const count = 20 + phase * 5,
            points = phase >= 3 ? 6 : 5,
            start = boss.spin + boss.n * 0.32;
          for (let k = 0; k < count; k++) {
            const a = start + (k / count) * TAU,
              starWave = Math.abs(Math.cos((k * points * Math.PI) / count));
            game.shoot(boss.x, boss.y, a, 5.2 + 2.8 * starWave, shotDmg, { r: 0.26 });
          }
          bossVolley(game, boss);
          boss.n++;
        }
        if (boss.t > 0.32 + (2 + phase) * 0.56 + 0.35) endBossAttack(boss, 1.3);
        return;
      }
      if (boss.st === "cross") {
        if (phase === 1) {
          nextBossAttack(game, boss);
          return;
        }
        if (boss.n === 0) {
          boss.n = 1;
          const count = phase === 3 ? 4 : 3,
            rot = (game.rng.chance(0.5) ? 1 : -1) * (phase === 3 ? 0.52 : 0.4);
          for (let k = 0; k < count; k++) {
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
          }
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "rift", src: "starHeart" });
        }
        if (phase === 3) boss.t2 += dt;
        if (phase === 3 && boss.t2 > 0.72) {
          boss.t2 = 0;
          for (let k = -1; k <= 1; k++) game.shoot(boss.x, boss.y, aim + k * 0.22, 8.5, shotDmg);
          bossVolley(game, boss, 0.3);
        }
        if (boss.t > 4.5) endBossAttack(boss, 1.4);
        return;
      }
      if (boss.st === "burst") {
        // Portal-Refracted Beams & Orbs: fires beams into the arena's portals that refract out of the exit mouths!
        const portals = game.arena.portals || [];
        if (boss.n === 0 && portals.length) {
          for (const p of portals) {
            const pAimA = Math.atan2(player.y - p.by, player.x - p.bx),
              pAimB = Math.atan2(player.y - p.ay, player.x - p.ax);
            game.beam({
              x: p.bx,
              y: p.by,
              a: pAimA,
              warn: 0.85,
              dur: 0.55,
              w: 0.75,
              dmg: boss.dmg * 0.85,
              len: 28,
              skin: "rift",
            });
            if (phase >= 2) {
              game.beam({
                x: p.ax,
                y: p.ay,
                a: pAimB,
                warn: 0.85,
                dur: 0.55,
                w: 0.75,
                dmg: boss.dmg * 0.85,
                len: 28,
                skin: "rift",
              });
            }
          }
          game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, small: true, skin: "rift", src: "starHeart" });
        }
        if (boss.t >= 0.3 + boss.n * 0.42 && boss.n < 3 + phase) {
          const swing = (boss.n % 2 ? 1 : -1) * 0.08;
          for (let k = 0; k < 7; k++) {
            const off = k - 3,
              spd = 10.6 - Math.abs(off) * 0.9 + phase * 0.4;
            game.shoot(boss.x, boss.y, aim + swing + off * 0.14, spd, shotDmg, { r: 0.26 });
          }
          if (portals.length) {
            const p = portals[boss.n % portals.length],
              pAim = Math.atan2(player.y - p.by, player.x - p.bx);
            for (const off of [-0.18, 0, 0.18]) {
              game.shoot(p.bx, p.by, pAim + off, 9.2, shotDmg * 0.9, { r: 0.25 });
            }
          }
          boss.n++;
          game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type, src: "starHeart" });
        }
        if (boss.t > 0.3 + (3 + phase) * 0.42 + 0.4) endBossAttack(boss, 1.2);
        return;
      }
      if (boss.st === "rain") {
        if (boss.n === 0) {
          boss.n = 1;
          const pts = 4 + phase,
            rot0 = boss.spin;
          game.hazard({
            x: clamp(player.x, -game.arena.W + 1.5, game.arena.W - 1.5),
            y: clamp(player.y, -game.arena.H + 1.5, game.arena.H - 1.5),
            r: 2.1,
            delay: 1.05,
            dmg: boss.dmg * 0.8,
            kind: "rain",
            src: "starHeart",
          });
          for (let k = 0; k < pts; k++) {
            const a = rot0 + (k / pts) * TAU,
              px = clamp(player.x + Math.cos(a) * 4.6, -game.arena.W + 1.5, game.arena.W - 1.5),
              py = clamp(player.y + Math.sin(a) * 4.6, -game.arena.H + 1.5, game.arena.H - 1.5);
            game.hazard({
              x: px,
              y: py,
              r: 2.1,
              delay: 1.15 + k * 0.11,
              dmg: boss.dmg * 0.8,
              kind: "rain",
              src: "starHeart",
            });
          }
        }
        if (boss.t > 2.4) endBossAttack(boss, 1.2);
        return;
      }
      break;
    }
    case "sandDragon":
      if (updateGlasswyrm(game, boss, dt, aim, dist, shotDmg, rage)) return;
      break;
    case "emberKing": {
      if (boss.st === "barrage") {
        // Bellows Draught & Anvil Trench: draws air inward for 0.8s, then slams a glowing 3-way molten slag trench
        // that burns for 3.5s alongside cinder-slug fans.
        boss.vx = 0;
        boss.vy = 0;
        if (boss.t < 0.8) {
          if (boss.n === 0) {
            boss.n = 1;
            boss.ta = aim;
            game.emit("charge", { x: boss.x, y: boss.y, type: "emberKing", src: "emberKing" });
          }
          boss.ta = turnToward(boss.ta, aim, 2.2 * dt);
          boss.face = boss.ta;
          if (dist > 2.8 && dist < 13 && player.dashT <= 0) {
            const pull = 3.0 * dt;
            player.x -= ((player.x - boss.x) / dist) * pull;
            player.y -= ((player.y - boss.y) / dist) * pull;
            game.arena.resolve(player, player.r);
          }
          return;
        }
        if (boss.n === 1) {
          boss.n = 2;
          // Slam 3-way molten slag trench that burns for 3.5s
          for (const fork of [-0.42, 0, 0.42]) {
            const a = boss.ta + fork;
            for (let step = 0; step < 3 + rage; step++) {
              const reach = 2.6 + step * 2.5,
                tx = clamp(boss.x + Math.cos(a) * reach, -game.arena.W + 1.3, game.arena.W - 1.3),
                ty = clamp(boss.y + Math.sin(a) * reach, -game.arena.H + 1.3, game.arena.H - 1.3);
              game.hazard({
                x: tx,
                y: ty,
                r: 1.75,
                delay: 0.35 + step * 0.12,
                dmg: boss.dmg * 0.78,
                kind: "stomp",
                src: "emberKing",
              });
              if (game.burnPools && game.burnPools.length < 14) {
                game.burnPools.push({
                  x: tx,
                  y: ty,
                  r: 1.5,
                  life: 3.5,
                  dps: 14,
                  hostile: true,
                  playerDps: 14,
                  src: "emberKing",
                });
              }
            }
          }
          for (let k = 0; k < 5 + rage * 2; k++) {
            game.shoot(boss.x, boss.y, boss.ta + (k - (4 + rage * 2) / 2) * 0.16, 10.2, shotDmg);
          }
          bossVolley(game, boss, 0.25);
          game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "emberKing" });
        }
        if (boss.t > 1.75) endBossAttack(boss, 1.7 - rage * 0.35);
        return;
      }
      if (boss.st === "charge") {
        const cleaves = 1 + rage;
        if (boss.t2 === 0) {
          boss.t2 = 1;
          boss.ta = aim;
          boss.sub = 0;
          boss.subT = 0;
          game.emit("charge", { x: boss.x, y: boss.y, type: "emberKing", src: "emberKing" });
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
          const chargeSpeed = rage ? 15.5 : 13.5;
          boss.vx = Math.cos(boss.ta) * chargeSpeed;
          boss.vy = Math.sin(boss.ta) * chargeSpeed;
          boss.charging = true;
          if ((boss.hitWall && boss.subT > 0.1) || boss.subT > 0.42) {
            boss.charging = false;
            game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "emberKing" });
            for (let k = 0; k < 3 + rage; k++) {
              const reach = 2.6 + k * 2.5,
                fx = clamp(boss.x + Math.cos(boss.ta) * reach, -game.arena.W + 1.2, game.arena.W - 1.2),
                fy = clamp(boss.y + Math.sin(boss.ta) * reach, -game.arena.H + 1.2, game.arena.H - 1.2);
              game.hazard({
                x: fx,
                y: fy,
                r: 1.85,
                delay: 0.62 + k * 0.14,
                dmg: boss.dmg * 0.82,
                kind: "stomp",
                src: "emberKing",
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
              game.emit("charge", { x: boss.x, y: boss.y, type: "emberKing", src: "emberKing" });
            }
          }
        }
        return;
      }
      if (boss.st === "summon") {
        // Crucible Bomb Toss: hurls 2 glowing slag-pots onto the arena that the player can shoot before their 1.4s fuse
        // to blast the Tyrant!
        moveBoss(game, boss, dt, aim, dist, 0.35);
        if (boss.n === 0) {
          boss.n = 1;
          for (const side of [-0.45, 0.45]) {
            const a = aim + side,
              reach = clamp(dist * 0.65, 3.2, 6.8),
              tx = clamp(boss.x + Math.cos(a) * reach, -game.arena.W + 1.6, game.arena.W - 1.6),
              ty = clamp(boss.y + Math.sin(a) * reach, -game.arena.H + 1.6, game.arena.H - 1.6);
            game.hazard({
              x: tx,
              y: ty,
              r: 2.25,
              delay: 1.4,
              dmg: boss.dmg * 0.85,
              kind: "rain",
              src: "emberKing",
              sx: boss.x,
              sy: boss.y,
              shootable: true,
              hitR: 0.85,
              crucibleBomb: true,
            });
          }
          for (let k = -1; k <= 1; k++) {
            game.shoot(boss.x, boss.y, aim + k * 0.22, 9.2, shotDmg);
          }
          bossVolley(game, boss, 0.25);
          game.emit("lob", { x: boss.x, y: boss.y, src: "emberKing" });
        }
        if (boss.t > 1.25) endBossAttack(boss, 1.5);
        return;
      }
      if (boss.st === "ring") {
        boss.vx *= 0.85;
        boss.vy *= 0.85;
        if (boss.n === 0) {
          boss.n = 1;
          const base = aim + Math.PI / 4;
          for (let spoke = 0; spoke < 4; spoke++) {
            const a = base + (spoke / 4) * TAU;
            for (let step = 0; step < 2 + rage; step++) {
              const reach = 3.0 + step * 2.7,
                fx = boss.x + Math.cos(a) * reach,
                fy = boss.y + Math.sin(a) * reach;
              if (game.arena.outside(fx, fy, 1.0)) continue;
              game.hazard({
                x: fx,
                y: fy,
                r: 1.75,
                delay: 0.85 + step * 0.22,
                dmg: boss.dmg * 0.8,
                kind: "stomp",
                src: "emberKing",
              });
            }
          }
          game.emit("charge", { x: boss.x, y: boss.y, type: "emberKing", src: "emberKing" });
        }
        if (boss.n === 1 && boss.t >= 0.95) {
          boss.n = 2;
          shootRing(game, boss, 14 + rage * 6, 8.2 + rage * 0.6, shotDmg, aim);
          game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "emberKing" });
        }
        if (boss.t > 1.9) endBossAttack(boss, 2.0 - rage * 0.5);
        return;
      }
      if (boss.st === "rain") {
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
            src: "emberKing",
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
  let placed = 0;
  for (let k = 0; k < count; k++) {
    const type = game.championType(biome, game.wave, game.rng);
    if (game.queueEnemySpawn(type, { dur: 1.3, boss: boss.type })) placed++;
  }
  if (placed) game.emit("portal", { x: boss.x, y: boss.y, n: placed, src: boss.type });
}

/* The six Guardian Crescendo attacks (CRESCENDO / OVERDRIVE) */
function updateCrescendo(game, boss, dt, aim, dist, shotDmg) {
  const player = game.player,
    arena = game.arena,
    W = arena.W,
    H = arena.H;
  switch (boss.st) {
    case "bellCage": {
      // Carillon Chime: paired golden lantern corridors clamped to the arena boundary intersection
      // so every corridor beam spans the arena with cur > 0 and deals real damage!
      boss.vx = 0;
      boss.vy = 0;
      const corridorPair = (angle, warn) => {
        const dx = Math.cos(angle),
          dy = Math.sin(angle),
          nx = -dy,
          ny = dx,
          boundX = W - 0.05,
          boundY = H - 0.05;
        for (const offset of [-5.2, 5.2]) {
          const cx = nx * offset,
            cy = ny * offset;
          let tMin = -Infinity,
            tMax = Infinity;
          if (Math.abs(dx) > 1e-8) {
            const t1 = (-boundX - cx) / dx,
              t2 = (boundX - cx) / dx;
            tMin = Math.max(tMin, Math.min(t1, t2));
            tMax = Math.min(tMax, Math.max(t1, t2));
          } else if (Math.abs(cx) > boundX) {
            continue;
          }
          if (Math.abs(dy) > 1e-8) {
            const t1 = (-boundY - cy) / dy,
              t2 = (boundY - cy) / dy;
            tMin = Math.max(tMin, Math.min(t1, t2));
            tMax = Math.min(tMax, Math.max(t1, t2));
          } else if (Math.abs(cy) > boundY) {
            continue;
          }
          if (tMin >= tMax) continue;
          const sx = clamp(cx + dx * tMin, -boundX, boundX),
            sy = clamp(cy + dy * tMin, -boundY, boundY),
            span = Math.max(1, tMax - tMin + 1);
          game.beam({
            x: sx,
            y: sy,
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
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "laser", src: "bellKeeper" });
        game.emit("charge", { x: boss.x, y: boss.y, type: "bellKeeper", src: "bellKeeper" });
      }
      if (boss.n === 1 && boss.t > 2.35) {
        boss.n = 2;
        corridorPair(Math.PI / 4, 1.1);
        corridorPair((3 * Math.PI) / 4, 1.1);
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "laser", src: "bellKeeper" });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * TAU + Math.PI / 4,
            cx = clamp(boss.x + Math.cos(a) * 6.8, -W + 1.8, W - 1.8),
            cy = clamp(boss.y + Math.sin(a) * 6.8, -H + 1.8, H - 1.8);
          game.hazard({ x: cx, y: cy, r: 2.0, delay: 1.05, dmg: boss.dmg * 0.78, kind: "stomp", src: "bellKeeper" });
        }
      }
      if (boss.n === 2 && boss.t > 4.0) {
        boss.n = 3;
        shootRing(game, boss, 20, 7.6, shotDmg, boss.spin);
        game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "bellKeeper" });
      }
      if (boss.t > 4.65) endBossAttack(boss, 1.8);
      return;
    }
    case "whiteout": {
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        const dir = game.rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 3; k++) {
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
            skin: "iceShot",
          });
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "iceShot", src: "iceCrystal" });
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
            src: "mossQueen",
            sx: boss.x,
            sy: boss.y,
          });
          if (arena.acid.filter((puddle) => puddle.life != null).length < 16)
            arena.acid.push({ x, y, r: 1.4, life: 6 });
        }
        for (let k = 0; k < 2; k++) {
          const angle = aim + (k ? 0.75 : -0.75),
            egg = game.spawnEnemy("sporePod", boss.x + Math.cos(angle) * 2.1, boss.y + Math.sin(angle) * 2.1, {});
          egg.spawnT = 0.3;
          egg.noDrop = true;
          egg.kx = Math.cos(angle) * 8.5;
          egg.ky = Math.sin(angle) * 8.5;
        }
        game.emit("hatch", { x: boss.x, y: boss.y, big: true, src: "mossQueen" });
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
      // Celestial Convergence: do not pull the player while dashing, and resolve collision after pull!
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.t < 1.15 && dist > 3.0 && player.dashT <= 0) {
        const pull = 3.2 * dt;
        player.x -= ((player.x - boss.x) / dist) * pull;
        player.y -= ((player.y - boss.y) / dist) * pull;
        arena.resolve(player, player.r);
      }
      if (boss.n === 0) {
        boss.n = 1;
        const rot = game.rng.chance(0.5) ? 0.55 : -0.55;
        for (let k = 0; k < 4; k++) {
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
        }
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
            src: "starHeart",
          });
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "rift", src: "starHeart" });
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
      boss.vx *= 0.8;
      boss.vy *= 0.8;
      if (boss.n === 0) {
        boss.n = 1;
        const dir = game.rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 5; k++) {
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
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "sun", src: "sandDragon" });
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
            game.hazard({
              x,
              y,
              r: 1.4,
              delay: 1 + ring * 0.5,
              dmg: boss.dmg * 0.75,
              kind: "stomp",
              src: "sandDragon",
            });
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
      // Hearth-Storm: capped add spawns so it never double-calls bossReinforce + 6 extra units at once!
      moveBoss(game, boss, dt, aim, dist, 0.28);
      if (boss.n === 0) {
        boss.n = 1;
        const activeAdds = game.enemies.filter((e) => !e.dead && !e.boss).length + game.markers.length;
        const count = activeAdds >= 4 ? 0 : Math.min(2, 4 - activeAdds),
          crew = ["brassGuard", "firePot"];
        for (let k = 0; k < count; k++) {
          const angle = (k / Math.max(1, count)) * TAU + boss.spin,
            kid = game.spawnEnemy(crew[k % 2], boss.x + Math.cos(angle) * 2.6, boss.y + Math.sin(angle) * 2.6, {});
          kid.spawnT = 0.35;
          kid.noDrop = true;
          kid.kx = Math.cos(angle) * 6;
          kid.ky = Math.sin(angle) * 6;
        }
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
            src: "emberKing",
            sx: boss.x,
            sy: boss.y,
          });
        }
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
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "magma", src: "emberKing" });
        game.emit("hatch", { x: boss.x, y: boss.y, big: true, src: "emberKing" });
      }
      if (boss.t >= 1.3 + (boss.n - 1) * 0.65 && boss.n <= 4) {
        boss.n++;
        for (const off of [-0.26, 0, 0.26]) {
          game.shoot(boss.x, boss.y, aim + off, 7.6 + (off === 0 ? 1.0 : 0), shotDmg, { r: 0.27 });
        }
        bossVolley(game, boss, 0.3);
      }
      if (boss.t > 3.7) endBossAttack(boss, 1.6);
      return;
    }
  }
  endBossAttack(boss, 1);
}

function moveBoss(game, boss, dt, aim, dist, speedMul = 1) {
  const slowMul = boss.cageSlowT > 0 ? 0.7 : 1,
    speed = boss.speed * (boss.enraged ? 1.3 : 1) * speedMul * slowMul;
  if (boss.cageSlowT > 0) boss.cageSlowT = Math.max(0, boss.cageSlowT - dt);
  if (boss.type === "mossQueen" || boss.type === "iceCrystal") {
    const orbit = boss.type === "mossQueen" ? 8 : 9,
      approach = dist > orbit + 1 ? 1 : dist < orbit - 1 ? -1 : 0,
      player = game.player,
      nx = (player.x - boss.x) / dist,
      ny = (player.y - boss.y) / dist;
    boss.vx = (nx * approach - ny * 0.7) * speed * 1.4;
    boss.vy = (ny * approach + nx * 0.7) * speed * 1.4;
    return;
  }
  if (boss.type === "starHeart") {
    const player = game.player,
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
  for (let k = 0; k < count; k++) {
    game.shoot(boss.x, boss.y, start + (k / count) * TAU, speed, dmg, { kind, r: 0.27 });
  }
  bossVolley(game, boss);
}

function bossVolley(game, boss, gap = 0) {
  if (gap && game.time - (boss.volleyAt ?? -9) < gap) return;
  boss.volleyAt = game.time;
  game.emit("eshot", { x: boss.x, y: boss.y, type: "boss", boss: boss.type, src: boss.type });
}

function findOpenSpot(game, x, y, minR, maxR) {
  for (let k = 0; k < 20; k++) {
    const angle = game.rng.next() * TAU,
      dist = game.rng.range(minR, maxR),
      px = x + Math.cos(angle) * dist,
      py = y + Math.sin(angle) * dist;
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  for (let k = 0; k < 16; k++) {
    const angle = (k / 16) * TAU,
      px = clamp(x * 0.4 + Math.cos(angle) * Math.max(minR, 2.5), -game.arena.W + 3, game.arena.W - 3),
      py = clamp(y * 0.4 + Math.sin(angle) * Math.max(minR, 2.5), -game.arena.H + 3, game.arena.H - 3);
    if (!game.arena.outside(px, py, 2) && !game.arena.blocked(px, py, 2) && !game.arena.featureBlocked(px, py, 0.6))
      return { x: px, y: py };
  }
  return null;
}

function spawnSunglassSpires(game, boss) {
  const arena = game.arena;
  if (!arena || !arena.obs) return;
  // Remove excess expired or old spires so at most 4 exist
  arena.obs = arena.obs.filter((ob) => !ob.glassSpire);
  const reserved = [...game.placementReservations(), ...game.enemies.filter((enemy) => !enemy.dead), game.player];
  for (const side of [-1, 1]) {
    const a = (boss.ta || 0) + side * (Math.PI * 0.55),
      sx = clamp(boss.x + Math.cos(a) * 3.4, -arena.W + 2.2, arena.W - 2.2),
      sy = clamp(boss.y + Math.sin(a) * 3.4, -arena.H + 2.2, arena.H - 2.2);
    if (arena.clearForPlacement(sx, sy, 1.1, reserved)) {
      arena.obs.push({ t: "c", x: sx, y: sy, r: 0.72, glassSpire: true, life: 6.0 });
    }
  }
}

/* Sand Dragon, Guardian of the Sun Dunes */
function updateGlasswyrm(game, boss, dt, aim, dist, shotDmg, rage) {
  const player = game.player,
    arena = game.arena,
    inside = (x, y) => !arena.outside(x, y, 0.8);
  if (boss.diveT > 0) {
    boss.diveT = Math.max(0, boss.diveT - dt);
    boss.ghost = boss.diveT > 0;
  } else {
    boss.ghost = false;
  }
  const end = (walk) => {
    boss.fx = null;
    boss.diveT = 0;
    boss.ghost = false;
    boss.charging = false;
    endBossAttack(boss, walk);
  };
  const chain = (angle, wind) => {
    const spots = [];
    for (let k = 0; k < 6; k++) {
      const reach = 2.6 + k * 2.3,
        x = boss.x + Math.cos(angle) * reach,
        y = boss.y + Math.sin(angle) * reach;
      if (!inside(x, y)) break;
      spots.push([x, y]);
      game.hazard({
        x,
        y,
        r: 1.5,
        delay: wind * (0.25 + (0.75 * k) / 5),
        dmg: boss.dmg * 0.75,
        kind: "stomp",
        src: "sandDragon",
      });
    }
    return spots;
  };
  const surface = (ringSpin) => {
    boss.diveT = 0;
    boss.ghost = false;
    arena.resolve(boss, boss.r);
    game.explode(boss.x, boss.y, 2.4, 0, { kind: "stomp", src: "sandDragon" });
    shootRing(game, boss, 13 + rage * 3, 6.8, shotDmg, ringSpin);
    game.emit("blink", { x: boss.x, y: boss.y, src: "sandDragon" });
    game.emit("thud", { x: boss.x, y: boss.y, big: true, src: "sandDragon" });
  };
  switch (boss.st) {
    case "rise": {
      const wind = rage ? 0.85 : 1.0;
      boss.vx *= 0.75;
      boss.vy *= 0.75;
      if (boss.n === 0) {
        boss.n = 1;
        boss.diveT = wind;
        boss.ghost = true;
        boss.charging = true;
        boss.ta = aim;
        boss.fx = [];
        const offsets = rage ? [-0.5, 0, 0.5] : [0];
        for (const off of offsets) {
          const spots = chain(aim + off, wind);
          boss.fx.push(spots.length ? spots[spots.length - 1] : [boss.x, boss.y]);
        }
        game.emit("blinkWarn", { x: boss.x, y: boss.y, src: "sandDragon" });
      }
      boss.face = turnToward(boss.face, boss.ta, 4 * dt);
      if (boss.n === 1 && boss.t >= wind) {
        boss.n = 2;
        boss.charging = false;
        // Surface on the center chain (boss.fx[rage ? 1 : 0]) after the 6th bulge reaches its destination
        const centerIdx = rage && boss.fx.length > 1 ? 1 : 0,
          [sx, sy] = boss.fx[centerIdx] || [boss.x, boss.y];
        boss.x = sx;
        boss.y = sy;
        surface(boss.spin);
        // Leave behind 2 brittle Glass Pillars (temporary cover for 6s) that shatter when swept by sunlance
        spawnSunglassSpires(game, boss);
      }
      if (boss.t > wind + 0.9) end(2 - rage * 0.5);
      return true;
    }
    case "shards": {
      moveBoss(game, boss, dt, aim, dist, 0.35);
      const salvos = 3 + rage;
      if (boss.t >= 0.4 + boss.n * 0.62 && boss.n < salvos) {
        boss.n++;
        if (boss.n % 2) {
          const wide = 5 + rage * 2,
            mid = (wide - 1) / 2;
          for (let k = 0; k < wide; k++) {
            const off = k - mid,
              speed = 10.2 - Math.abs(off) * 0.72;
            game.shoot(boss.x, boss.y, aim + off * 0.16, speed, shotDmg);
          }
        } else {
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
        if (rage) {
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
        }
        game.emit("beamWarn", { boss: true, x: boss.x, y: boss.y, skin: "sun", src: "sandDragon" });
      }
      if (boss.t > 3.9) end(1.8 - rage * 0.4);
      return true;
    }
    case "sandstorm": {
      moveBoss(game, boss, dt, aim, dist, 0.2);
      if (boss.n === 0) {
        boss.n = 1;
        boss.diveT = 1.5;
        boss.ghost = true;
        boss.charging = true;
        boss.ta = aim + Math.PI + (game.rng.chance(0.5) ? 0.8 : -0.8);
        chain(boss.ta, 0.5);
        game.emit("blinkWarn", { x: boss.x, y: boss.y, src: "sandDragon" });
      }
      // Emit a 0.55s warning ring at the emergence spot before surfacing
      if (boss.n === 1 && boss.t >= 0.95) {
        boss.n = 2;
        boss.tx = clamp(player.x + Math.cos(boss.ta) * 6.5, -arena.W + boss.r + 0.5, arena.W - boss.r - 0.5);
        boss.ty = clamp(player.y + Math.sin(boss.ta) * 6.5, -arena.H + boss.r + 0.5, arena.H - boss.r - 0.5);
        game.hazard({ x: boss.tx, y: boss.ty, r: 2.2, delay: 0.55, dmg: 0, kind: "stomp", src: "sandDragon" });
        game.emit("blinkWarn", { x: boss.tx, y: boss.ty, src: "sandDragon" });
      }
      if (boss.n === 2 && boss.t >= 1.5) {
        boss.n = 3;
        boss.x = boss.tx;
        boss.y = boss.ty;
        surface(boss.spin);
        if (rage) {
          boss.diveT = 1.4;
          boss.ghost = true;
          boss.ta = angleDiff(aim + Math.PI, boss.ta) > 0 ? aim + Math.PI - 0.8 : aim + Math.PI + 0.8;
          chain(boss.ta, 0.85);
        }
      }
      if (boss.n === 3 && rage && boss.t >= 2.35) {
        boss.n = 4;
        boss.tx = clamp(player.x + Math.cos(boss.ta) * 6, -arena.W + boss.r + 0.5, arena.W - boss.r - 0.5);
        boss.ty = clamp(player.y + Math.sin(boss.ta) * 6, -arena.H + boss.r + 0.5, arena.H - boss.r - 0.5);
        game.hazard({ x: boss.tx, y: boss.ty, r: 2.2, delay: 0.55, dmg: 0, kind: "stomp", src: "sandDragon" });
        game.emit("blinkWarn", { x: boss.tx, y: boss.ty, src: "sandDragon" });
      }
      if (boss.n === 4 && rage && boss.t >= 2.9) {
        boss.n = 5;
        boss.x = boss.tx;
        boss.y = boss.ty;
        surface(boss.spin + 0.3);
      }
      if (boss.t > (rage ? 4.2 : 2.6)) end(1.6 - rage * 0.3);
      return true;
    }
  }
  return false;
}

export { updateEnemy, ENEMY_HANDLERS, updateBoss, initBoss, CRESCENDO, OVERDRIVE, bossPatterns };
