// Extracted hazard, biome-feature, interactive-prop, and wave-event simulation helpers for World.
// Deterministic: never calls Math.random() (uses world.rng or seeded makeRng).

import { clamp, hashString, makeRng, TAU } from "./util.js";
import { eventSeedId } from "../data/content-ids.js";
import { rlAddHazard250, rlPortalPair250, rlHazardRoom250 } from "./arena.js";

const RL_HEAT_TIME = 4.5,
  RL_HEAT_CD = 2.5,
  RL_ATTUNE_RANGE = 2.2,
  RL_FORGEWIND_PERIOD = 3.4,
  RL_NECTAR_GROW = 1.4,
  RL_NECTAR_GROW_T = 35,
  RL_NECTAR_EVERY = 7,
  RL_TIDE_PERIOD = 22,
  RL_HARMONIC_EVERY = 7.2,
  RL_HARMONIC_WARN = 1.6;

function rlTidePhase(x, y) {
  return (((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) + 1) % 1;
}

function partitionMineAcid(list) {
  let has = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].mine) {
      has = true;
      break;
    }
  }
  if (!has) return null;
  const own = [];
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const pool = list[i];
    if (pool.mine) own.push(pool);
    else list[w++] = pool;
  }
  list.length = w;
  return own;
}

function inOwnAcid(live, enemy) {
  for (let i = 0; i < live.length; i++) {
    const pool = live[i];
    if ((enemy.x - pool.x) ** 2 + (enemy.y - pool.y) ** 2 < pool.r * pool.r) return true;
  }
  return false;
}

function pointToSegDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    len2 = dx * dx + dy * dy;
  if (len2 <= 1e-8) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  const cx = ax + dx * t - px,
    cy = ay + dy * t - py;
  return cx * cx + cy * cy;
}

// Hot Bellows ('heatsink'): triggers only on active hazard/prop interaction (2.5s internal CD)
function triggerHeatSink(world) {
  const lv = world.stats.heatSink || 0,
    player = world.player;
  if (!lv || !player || !player.alive || world.state !== "fight") return false;
  if ((player.heatSinkCd || 0) > 0) return false;
  player.heatSinkCd = RL_HEAT_CD;
  player.heatT = RL_HEAT_TIME;
  world.addNova(lv > 1 ? 18 : 12, true);
  return true;
}

// Leyline Attunement ('hazardAttune'): only triggers near active/charging hazards or within 2.2m of live features during combat
function rlNearActiveHazard(world) {
  const arena = world.arena,
    player = world.player;
  if (!arena || !player.alive || world.state !== "fight" || world.enemies.length === 0) return false;
  for (const vent of arena.vents || []) {
    if (
      (vent.st === "warn" || vent.st === "erupt") &&
      Math.hypot(player.x - vent.x, player.y - vent.y) - (vent.r || 0) < RL_ATTUNE_RANGE
    )
      return true;
  }
  for (const devil of arena.devils || []) {
    if (!(devil.calmT > 0) && Math.hypot(player.x - devil.x, player.y - devil.y) - (devil.r || 0) < RL_ATTUNE_RANGE)
      return true;
  }
  for (const list of [arena.ice, arena.acid]) {
    for (const hz of list || []) {
      if (!hz.mine && Math.hypot(player.x - hz.x, player.y - hz.y) - (hz.r || 0) < RL_ATTUNE_RANGE) return true;
    }
  }
  for (const portal of arena.portals || []) {
    if (
      Math.hypot(player.x - portal.ax, player.y - portal.ay) < RL_ATTUNE_RANGE + 0.6 ||
      Math.hypot(player.x - portal.bx, player.y - portal.by) < RL_ATTUNE_RANGE + 0.6
    )
      return true;
  }
  for (const trap of world.traps || []) {
    if (
      (trap.st === "warn" || trap.st === "live" || trap.st === "fuse") &&
      Math.hypot(player.x - trap.x, player.y - trap.y) - (trap.r || 1.2) < RL_ATTUNE_RANGE
    )
      return true;
  }
  return false;
}

// Check if dashing near an erupting fumarole, active dust devil, or live trap triggers Hot Bellows
function checkDashHeatSink(world) {
  if (!world.stats.heatSink || world.player.dashT <= 0 || (world.player.heatSinkCd || 0) > 0) return;
  const arena = world.arena,
    player = world.player;
  for (const vent of arena.vents || []) {
    if (
      (vent.st === "warn" || vent.st === "erupt") &&
      Math.hypot(player.x - vent.x, player.y - vent.y) < (vent.r || 1.5) + 2.2
    ) {
      triggerHeatSink(world);
      return;
    }
  }
  for (const devil of arena.devils || []) {
    if (!(devil.calmT > 0) && Math.hypot(player.x - devil.x, player.y - devil.y) < (devil.r || 1.5) + 2.2) {
      triggerHeatSink(world);
      return;
    }
  }
  for (const trap of world.traps || []) {
    if (
      (trap.st === "warn" || trap.st === "live" || trap.st === "fuse") &&
      Math.hypot(player.x - trap.x, player.y - trap.y) < (trap.r || 1.5) + 2.2
    ) {
      triggerHeatSink(world);
      return;
    }
  }
}

// Starfall Harvest: visible 1.1s falling-star ring telegraphs (r = 2.4m) crushing foes for 65 * dmgMul + 3–5 shards
function starfallHarvest(world, dt) {
  if (world.planIdx >= world.plan.length && world.enemies.length === 0) return;
  world.rainT -= dt;
  if (world.rainT > 0 || world.pickups.length > 200) return;
  world.rainT = 1.65 + world.rng.next() * 0.75;
  // Aim near an active enemy pack when available so meteors feel tactical and rewarding
  let spot = null;
  const liveFoes = world.enemies.filter((e) => !e.dead && !e.ghost && e.spawnT <= 0);
  if (liveFoes.length && world.rng.chance(0.65)) {
    const pick = liveFoes[Math.floor(world.rng.next() * liveFoes.length)];
    spot = {
      x: clamp(pick.x + world.rng.range(-1.4, 1.4), -world.arena.W + 2, world.arena.W - 2),
      y: clamp(pick.y + world.rng.range(-1.4, 1.4), -world.arena.H + 2, world.arena.H - 2),
    };
  } else {
    spot = world.arena.freePoint(world.rng, world.player.x, world.player.y, 3.5, 0.5);
  }
  if (!spot) return;
  world.hazard({
    x: spot.x,
    y: spot.y,
    r: 2.4,
    delay: 1.1,
    dmg: 65 * (world.stats.dmgMul || 1),
    kind: "starfall",
    friendly: true,
    src: "starfall",
  });
}

// Gold Cart: golden Treasure Automaton marches across the arena dropping shards;
// defeating it before exit bursts a 15-shard jackpot + healing globe.
function updateCaravan(world, dt) {
  const c = world.caravan;
  if (!c || c.done) return;
  if (c.enemy && c.enemy.dead) {
    c.done = true;
    return;
  }
  const e = c.enemy;
  if (!e) {
    c.done = true;
    return;
  }
  e.vx = c.dir * 2.55;
  e.vy = Math.sin(world.time * 1.4) * 0.65;
  e.face = c.dir > 0 ? 0 : Math.PI;
  c.dropT -= dt;
  if (c.dropT <= 0) {
    c.dropT = 1.15;
    world.dropShards(e.x, e.y, 2);
  }
  if ((c.dir > 0 && e.x >= world.arena.W - 1.5) || (c.dir < 0 && e.x <= -world.arena.W + 1.5)) {
    // Reached the opposite gate — exits cleanly without stalling wave clear
    e.dead = true;
    e.cleanup = true;
    c.done = true;
    world.emit("blink", { x: e.x, y: e.y, small: true });
  }
}

function ringCourtyardBell(world, vent, cycleId, friendly) {
  vent.rungCycle = cycleId;
  vent.rungT = 1.4;
  vent.st = "idle";
  // Resonant Carillon counterplay: ringing a Bellkeeper-charged censer reflects a stun wave onto Bell Keeper!
  if (friendly && vent.bossTollT > 0) {
    vent.bossTollT = 0;
    const boss = world.boss;
    if (boss && !boss.dead && boss.type === "bellKeeper") {
      boss.stunT = Math.max(boss.stunT || 0, 1.6);
      world.hurtEnemy(boss, 65 * (world.stats.dmgMul || 1), boss.x - vent.x, boss.y - vent.y, 0, false, "shock");
      world.emit("chain", { pts: [vent.x, vent.y, boss.x, boss.y], arc: true });
      world.emit("stun", { x: boss.x, y: boss.y, skin: "plate" });
    }
  }
  if (friendly) {
    triggerHeatSink(world);
    world.triggerHitstop?.(0.025);
  }
  world.emit("erupt", { x: vent.x, y: vent.y, r: vent.r * (friendly ? 1.25 : 1) });
  courtyardBellPulse(world, vent, friendly);
}

function courtyardBellPulse(world, vent, friendly) {
  const pulseR = vent.r * (friendly ? 1.28 : 0.92);
  // Only clear enemy bullets when player-rung (friendly = true); un-rung wild tolls push & daze without erasing shots
  if (friendly) {
    for (const eb of world.eb) {
      if (eb.life > 0 && Math.hypot(eb.x - vent.x, eb.y - vent.y) <= pulseR + (eb.r || 0.2)) {
        eb.life = 0;
        world.emit("pop", { x: eb.x, y: eb.y });
      }
    }
  }
  const knock = friendly ? 6.8 : 4.2;
  world.hash.query(vent.x, vent.y, pulseR, (enemy) => {
    if (enemy.dead || enemy.ghost) return;
    const dx = enemy.x - vent.x,
      dy = enemy.y - vent.y,
      dist = Math.hypot(dx, dy);
    if (dist > pulseR + enemy.r * 0.5) return;
    const nx = dist > 0.01 ? dx / dist : 1,
      ny = dist > 0.01 ? dy / dist : 0;
    if (!enemy.boss) {
      enemy.kx = (enemy.kx || 0) + nx * knock;
      enemy.ky = (enemy.ky || 0) + ny * knock;
      enemy.slowT = Math.max(enemy.slowT || 0, friendly ? 2.0 : 1.4);
    }
    if (friendly) {
      const dmg = enemy.boss ? 22 * (world.stats.dmgMul || 1) : Math.max(22, enemy.maxHp * 0.18);
      world.hurtEnemy(enemy, dmg, nx, ny, 0.8, false, "shock");
    }
  });
}

// Caldera Fumarole interactive overpressure: shooting or dashing across a warning fumarole triggers
// an immediate enemy-searing slag eruption (+25% wider, harmless to the player).
function overpressureFumarole(world, vent, cycleId) {
  vent.rungCycle = cycleId;
  vent.rungT = 1.4;
  vent.st = "idle";
  const r = vent.r * 1.25,
    dmgMul = world.stats.dmgMul || 1;
  triggerHeatSink(world);
  world.triggerHitstop?.(0.025);
  world.emit("erupt", { x: vent.x, y: vent.y, r });
  world.explode(vent.x, vent.y, r, 48 * dmgMul, {
    enemies: true,
    knock: 5.5,
    kind: "fire",
    burn: 18 * dmgMul,
    src: "lava",
  });
  if (world.burnPools && world.burnPools.length < 12) {
    world.burnPools.push({ x: vent.x, y: vent.y, r: r * 0.85, life: 2.5, dps: 16 * dmgMul, hostile: false });
  }
}

function updateFeatures(world, dt) {
  // Expire temporary Glasswyrm Glass Pillars cleanly
  if (world.arena?.obs?.length) {
    let spireExpired = false;
    for (const ob of world.arena.obs) {
      if (ob.glassSpire) {
        ob.life -= dt;
        if (ob.life <= 0) spireExpired = true;
      }
    }
    if (spireExpired) {
      world.arena.obs = world.arena.obs.filter((ob) => !ob.glassSpire || ob.life > 0);
      world.arena.flow.rebuildObstacles();
    }
  }

  if (world.bioEv && world.state === "fight") {
    const ownAcid = partitionMineAcid(world.arena.acid);
    try {
      tickBiomeEvent(world, world.bioEv, dt);
    } finally {
      if (ownAcid) world.arena.acid.push(...ownAcid);
    }
  }

  const coat = !!world.stats.acidCoat;
  let mine = null,
    live = null;
  if (coat || world.arena.acid.some((p) => p.mine)) {
    mine = partitionMineAcid(world.arena.acid) || [];
    live = mine;
  }

  try {
    const arena = world.arena,
      player = world.player;
    // Temporary ice patches (e.g. from frost proximity vessels) expire cleanly
    if (arena.ice.length) {
      let iceExp = false;
      for (const patch of arena.ice) {
        if (patch.life != null) {
          patch.life -= dt;
          if (patch.life <= 0) iceExp = true;
        }
      }
      if (iceExp) arena.ice = arena.ice.filter((p) => p.life == null || p.life > 0);
    }

    if (arena.acid.length) {
      for (const pool of arena.acid) {
        if (pool.life != null) pool.life -= dt;
      }
      let w = 0,
        expired = false;
      for (let i = 0; i < arena.acid.length; i++) {
        const pool = arena.acid[i];
        if (pool.life != null && pool.life <= 0) expired = true;
        else arena.acid[w++] = pool;
      }
      if (expired) arena.acid.length = w;
      player.inAcid = player.alive && arena.inAcid(player.x, player.y);
      if (player.inAcid && world.state === "fight") {
        player.acidT += dt;
        if (player.acidT >= 0.5) {
          player.acidT = 0;
          world.hurtPlayer(
            2 * world.dmgMul * Math.max(0, 1 - (world.stats.hazardResist || 0)),
            null,
            null,
            "acid",
            true,
          );
        }
      } else {
        player.acidT = 0.35;
      }
      // A pool refreshes corrosion without shortening ongoing corrosion from traps or crafts.
      for (const enemy of world.enemies) {
        if (!enemy.boss && arena.inAcid(enemy.x, enemy.y)) {
          enemy.corrodeT = Math.max(enemy.corrodeT || 0, 0.25);
          enemy.corrode = true;
        }
      }
    } else {
      player.inAcid = false;
    }

    // Sun Dunes Dust Devils (and Sand Winds Endless Omen)
    if (arena.devils && arena.devils.length && world.state === "fight") {
      for (const devil of arena.devils) {
        if (devil.calmT > 0) devil.calmT = Math.max(0, devil.calmT - dt);
        devil.a += Math.sin(world.time * 0.37 + devil.ph) * dt * 0.7;
        const calmMul = devil.calmT > 0 ? 0.35 : 1,
          nx = devil.x + Math.cos(devil.a) * devil.spd * calmMul * dt,
          ny = devil.y + Math.sin(devil.a) * devil.spd * calmMul * dt;
        if (
          Math.abs(nx) < arena.W - 1.2 - devil.r &&
          Math.abs(ny) < arena.H - 1.2 - devil.r &&
          !arena.blocked(nx, ny, devil.r * 0.7)
        ) {
          devil.x = nx;
          devil.y = ny;
        } else {
          devil.a += Math.PI * (0.5 + 0.4 * Math.sin(devil.ph * 3.1));
        }
        const dxp = player.x - devil.x,
          dyp = player.y - devil.y,
          d2 = dxp * dxp + dyp * dyp;
        if (player.alive && !(devil.calmT > 0) && d2 < devil.r * devil.r) {
          const away = Math.atan2(dyp, dxp);
          player.vx += Math.cos(away) * 5.5 * dt;
          player.vy += Math.sin(away) * 5.5 * dt;
          player.devilT = (player.devilT || 0) - dt;
          if (player.devilT <= 0) {
            player.devilT = 0.5;
            world.hurtPlayer(
              3 * world.dmgMul * Math.max(0, 1 - (world.stats.hazardResist || 0)),
              null,
              null,
              "devil",
              true,
            );
          }
        } else if (player.devilT > 0.3) player.devilT = 0.3;

        // Interactive Dust Devils: toss lightweight enemies (swarmer, mite) sideways and curve passing projectiles
        if (!(devil.calmT > 0)) {
          const rCurve = devil.r + 0.65;
          world.hash.query(devil.x, devil.y, devil.r + 0.5, (enemy) => {
            if (enemy.dead || (enemy.type !== "smallBug" && enemy.type !== "littlePod")) return;
            const ex = enemy.x - devil.x,
              ey = enemy.y - devil.y,
              ed = Math.hypot(ex, ey);
            if (ed < devil.r + enemy.r && ed > 0.05) {
              const tangX = -ey / ed,
                tangY = ex / ed;
              enemy.kx += (tangX * 9 + (ex / ed) * 4) * dt;
              enemy.ky += (tangY * 9 + (ey / ed) * 4) * dt;
            }
          });
          for (const list of [world.pb, world.eb]) {
            for (const b of list) {
              if (b.life <= 0) continue;
              const bx = b.x - devil.x,
                by = b.y - devil.y;
              if (bx * bx + by * by < rCurve * rCurve) {
                const spd = Math.hypot(b.vx, b.vy);
                if (spd > 0.1) {
                  const ang = Math.atan2(b.vy, b.vx) + 2.4 * dt;
                  b.vx = Math.cos(ang) * spd;
                  b.vy = Math.sin(ang) * spd;
                  if (b.a != null) b.a = ang;
                }
              }
            }
          }
        }

        devil.nearT = (devil.nearT || 0) - dt;
        if (d2 < 25 && devil.nearT <= 0) {
          devil.nearT = 2.2 + (devil.ph % 1);
          world.emit("devilNear", { x: devil.x, y: devil.y });
        }
      }
      player.inDevil =
        player.alive &&
        arena.devils.some((d) => {
          const dx = player.x - d.x,
            dy = player.y - d.y;
          return dx * dx + dy * dy < d.r * d.r;
        });
    } else player.inDevil = false;

    // Courtyard Bell-Censers & Caldera Interactive Fumaroles
    const courtyardBell = arena.biome.id === "lanternYard",
      calderaFumarole = arena.biome.id === "emberHill";
    if (arena.vents.length && world.state === "fight") {
      for (const vent of arena.vents) {
        if (vent.rungT > 0) vent.rungT = Math.max(0, vent.rungT - dt);
        if (vent.bossTollT > 0) vent.bossTollT = Math.max(0, vent.bossTollT - dt);
        const cycleId = Math.floor((world.waveT + vent.phase) / vent.period);
        const state = arena.ventState(vent, world.waveT);
        if ((courtyardBell || calderaFumarole) && vent.rungCycle === cycleId && !(vent.bossTollT > 0)) {
          vent.st = "idle";
          continue;
        }
        // Dashing across a charging Courtyard Bell-Censer or Caldera Fumarole triggers its friendly interaction!
        if (
          (courtyardBell || calderaFumarole) &&
          (state === "warn" || vent.bossTollT > 0) &&
          player.alive &&
          player.dashT > 0 &&
          Math.hypot(player.x - vent.x, player.y - vent.y) < vent.r * 0.9 + player.r
        ) {
          if (courtyardBell) ringCourtyardBell(world, vent, cycleId, true);
          else overpressureFumarole(world, vent, cycleId);
          continue;
        }
        if (state !== vent.st) {
          if (state === "erupt") {
            world.emit("erupt", { x: vent.x, y: vent.y, r: vent.r });
            if (courtyardBell) courtyardBellPulse(world, vent, false);
          }
          vent.st = state;
        }
        if (state === "erupt") {
          if (player.alive && Math.hypot(player.x - vent.x, player.y - vent.y) < vent.r + player.r * 0.4) {
            world.hurtPlayer(
              9 * world.dmgMul * Math.max(0, 1 - (world.stats.hazardResist || 0)),
              vent.x,
              vent.y,
              courtyardBell ? "shock" : "lava",
            );
          }
          world.hash.query(vent.x, vent.y, vent.r, (enemy) => {
            if (enemy.dead || enemy.boss || Math.hypot(enemy.x - vent.x, enemy.y - vent.y) > vent.r + enemy.r * 0.5)
              return;
            const burn = enemy.burnT > 0 ? enemy.burnDps : 0;
            enemy.burnT = Math.max(enemy.burnT, 2);
            enemy.burnDps = Math.max(burn, enemy.maxHp * 0.14);
            enemy.burnSrc = courtyardBell ? "shock" : "lava";
            if (courtyardBell) enemy.slowT = Math.max(enemy.slowT, 1.4);
          });
        }
      }
    }

    // Star Hall Portals (player, bullets, AND non-boss enemies warp; shots empowered +20% natively / +35% in harmonic)
    if (arena.portals.length) {
      if (player.portalT > 0) player.portalT -= dt;
      for (const portal of arena.portals) {
        // Astral Convergence Leyline Ribbon between portal mouths
        if (world.event === "starPaths" && world.state === "fight") {
          if (player.alive && pointToSegDistSq(player.x, player.y, portal.ax, portal.ay, portal.bx, portal.by) < 1.44) {
            player.leylineT = Math.max(player.leylineT || 0, 0.25);
          }
          for (const enemy of world.enemies) {
            if (enemy.dead || enemy.boss || enemy.ghost) continue;
            if (
              pointToSegDistSq(enemy.x, enemy.y, portal.ax, portal.ay, portal.bx, portal.by) <
              (0.85 + enemy.r) ** 2
            ) {
              enemy.slowT = Math.max(enemy.slowT || 0, 0.45);
            }
          }
        }
        for (const [fromX, fromY, toX, toY] of [
          [portal.ax, portal.ay, portal.bx, portal.by],
          [portal.bx, portal.by, portal.ax, portal.ay],
        ]) {
          if (player.alive && player.portalT <= 0 && Math.hypot(player.x - fromX, player.y - fromY) < 0.8) {
            const speed = Math.hypot(player.vx, player.vy),
              dirX = speed > 0.5 ? player.vx / speed : 0,
              dirY = speed > 0.5 ? player.vy / speed : 1;
            world.emit("warp", { x: player.x, y: player.y, tx: toX, ty: toY, who: "player" });
            player.x = toX + dirX * 1.2;
            player.y = toY + dirY * 1.2;
            world.arena.resolve(player, player.r);
            player.portalT = 0.9;
            if (world.event === "starPaths") player.festT = Math.max(player.festT || 0, 3.0);
          }
          // Non-boss enemies warp through portals (2.5s per-enemy CD with 0.4s arrival shimmer)
          if (world.state === "fight") {
            world.hash.query(fromX, fromY, 1.0, (enemy) => {
              if (
                enemy.dead ||
                enemy.boss ||
                enemy.ghost ||
                enemy.spawnT > 0 ||
                (enemy.portalCd || 0) > world.time ||
                Math.hypot(enemy.x - fromX, enemy.y - fromY) > 0.78 + enemy.r * 0.35
              )
                return;
              const spd = Math.hypot(enemy.vx, enemy.vy) || 1,
                dirX = enemy.vx / spd,
                dirY = enemy.vy / spd;
              enemy.x = toX + dirX * (enemy.r + 0.65);
              enemy.y = toY + dirY * (enemy.r + 0.65);
              world.arena.resolve(enemy, enemy.r);
              enemy.portalCd = world.time + 2.5;
              enemy.warpShimmerT = 0.4;
              world.emit("warp", { x: fromX, y: fromY, tx: enemy.x, ty: enemy.y, who: "enemy" });
            });
          }
          for (const list of [world.pb, world.eb]) {
            for (const bullet of list) {
              if (
                !(bullet.life <= 0 || (bullet.warpT || 0) > world.time) &&
                Math.abs(bullet.x - fromX) < 0.75 &&
                Math.abs(bullet.y - fromY) < 0.75
              ) {
                const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
                bullet.x = toX + (bullet.vx / speed) * 0.9;
                bullet.y = toY + (bullet.vy / speed) * 0.9;
                bullet.warpT = world.time + 0.35;
                if (list === world.pb && !bullet.portalBoost) {
                  const boostMul = world.event === "starPaths" ? 1.35 : 1.2;
                  bullet.dmg *= boostMul;
                  bullet.portalBoost = true;
                  if (world.event === "starPaths") bullet.harmonicBoost = true;
                }
                if (bullet.boom) bullet.back = true;
                world.warpFx = (world.warpFx || 0) + 1;
                if (world.warpFx % 2 === 1) {
                  world.emit("warp", { x: fromX, y: fromY, tx: toX, ty: toY, who: "shot" });
                }
              }
            }
          }
        }
      }
    }
  } finally {
    if (mine) {
      for (const pool of mine) pool.life -= dt;
      let w = 0;
      for (let i = 0; i < mine.length; i++) if (mine[i].life > 0) mine[w++] = mine[i];
      mine.length = w;
      live = mine;
      world.arena.acid.push(...live);
    }
  }
  if (live && live.length) {
    for (const enemy of world.enemies) {
      if (!enemy.boss && inOwnAcid(live, enemy)) {
        enemy.corrodeT = Math.max(enemy.corrodeT || 0, 0.25);
        enemy.corrode = true;
      }
    }
  }
}

function updateHazards(world, dt) {
  const player = world.player;
  for (const hazard of world.hazards) {
    hazard.t += dt;
    // Star Spider's 3.0s Star-Silk Tether between (ax, ay) and (bx, by)
    if (hazard.kind === "tether" && !hazard.done) {
      if (
        player.alive &&
        world.state === "fight" &&
        pointToSegDistSq(player.x, player.y, hazard.ax, hazard.ay, hazard.bx, hazard.by) < (0.55 + player.r) ** 2
      ) {
        if (player.dashT > 0) {
          // Dashing through snaps the tether with a bonus spark and Fire Burst charge
          hazard.done = true;
          hazard.t = hazard.delay;
          world.addNova(8, true);
          world.emit("spark", { x: player.x, y: player.y, w: "sparkWand" });
          continue;
        } else {
          if (1.1 >= player.slowT) player.slowKind = "shock";
          player.slowT = Math.max(player.slowT, 1.1);
        }
      }
      if (hazard.t >= hazard.delay) {
        hazard.done = true;
      }
      continue;
    }

    if (!hazard.done && hazard.t >= hazard.delay) {
      hazard.done = true;
      if (hazard.kind === "starfall") {
        // Falling star impact: crush enemies for 65 * dmgMul and scatter 3–5 star-shards
        world.explode(hazard.x, hazard.y, hazard.r, hazard.dmg, {
          enemies: true,
          knock: 3.6,
          kind: "blastShot",
          src: "starfall",
        });
        const count = 3 + Math.floor(world.rng.next() * 3);
        world.dropShards(hazard.x, hazard.y, count);
        continue;
      }
      if (hazard.shotByPlayer) {
        // Player-detonated Mine Cart Ember-Pot or Ash Tyrant Crucible Bomb: blasts enemies (and Boss!) with 0 friendly fire
        const blastDmg = hazard.crucibleBomb ? 140 * (world.stats.dmgMul || 1) : 65 * (world.stats.dmgMul || 1);
        world.explode(hazard.x, hazard.y, hazard.r * 1.35, blastDmg, {
          enemies: true,
          knock: 5.5,
          kind: "fire",
          burn: 16 * (world.stats.dmgMul || 1),
          src: "weapon",
        });
        if (hazard.crucibleBomb && world.boss && !world.boss.dead) {
          const dBoss = Math.hypot(world.boss.x - hazard.x, world.boss.y - hazard.y);
          if (dBoss <= hazard.r * 1.5 + world.boss.r) {
            world.boss.stunT = Math.max(world.boss.stunT || 0, 0.85);
            world.triggerHitstop?.(0.025);
          }
        }
        continue;
      }
      if (hazard.kind === "shorted") world.shortArc(hazard);
      // Caldera Flareheart variant ('fire'): ignites nearby foes AND spawns a 2.5s molten pool
      if (hazard.kind === "fire") {
        world.hash.query(hazard.x, hazard.y, hazard.r, (enemy) => {
          if (enemy.dead || enemy.boss || Math.hypot(enemy.x - hazard.x, enemy.y - hazard.y) > hazard.r + enemy.r * 0.5)
            return;
          const prev = enemy.burnT > 0 ? enemy.burnDps : 0;
          enemy.burnT = Math.max(enemy.burnT, 2.8);
          enemy.burnDps = Math.max(prev, Math.max(12, enemy.maxHp * 0.1));
          enemy.burnSrc = "lava";
        });
        if (world.burnPools && world.burnPools.length < 12) {
          world.burnPools.push({
            x: hazard.x,
            y: hazard.y,
            r: hazard.r * 0.9,
            life: 2.5,
            dps: 16 * (world.stats.dmgMul || 1),
            hostile: true,
            playerDps: 12,
            src: hazard.src || "lava",
          });
        }
      }
      world.explode(hazard.x, hazard.y, hazard.r, 0, {
        player: hazard.dmg > 0,
        dmgPlayer: hazard.dmg,
        kind: hazard.kind,
        src: hazard.src,
        chill: hazard.chill || hazard.kind === "frost" || hazard.kind === "glacier",
      });
    }
  }
  let w = 0;
  for (let i = 0; i < world.hazards.length; i++) {
    if (world.hazards[i].t < world.hazards[i].delay + 0.4) world.hazards[w++] = world.hazards[i];
  }
  world.hazards.length = w;
}

function startBiomeEvent(world, id, wave) {
  const arena = world.arena,
    player = world.player,
    rng = makeRng(hashString(world.seed + ":biome-event:" + eventSeedId(id) + ":" + wave)),
    avoid = [{ x: player.x, y: player.y, r: 3.5 }, ...world.placementReservations()],
    add = (kind, count, size) => {
      for (let k = 0; k < count * 3 && count > 0; k++) {
        if (rlAddHazard250(arena, kind, rng, arena.obs, arena.W, arena.H, { avoid, cap: 9, size, tries: 60 })) {
          count--;
        }
      }
    };
  if (id === "sandstorm") {
    add("devils", 3);
    world.bioEv = { id, t: 0 };
  } else if (id === "festival") {
    add("vents", 3);
    const vents = arena.vents.slice().sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)),
      period = 4.8;
    vents.forEach((vent, i) => {
      vent.period = period;
      vent.phase = ((vents.length - 1 - i) / vents.length) * 1.9;
      vent.st = "idle";
    });
    world.bioEv = { id, t: 0 };
  } else if (id === "hotWind") {
    add("vents", 3);
    const period = RL_FORGEWIND_PERIOD;
    for (const vent of arena.vents) {
      vent.period = period;
      vent.phase = 0;
      vent.st = "idle";
    }
    world.bioEv = { id, t: 0 };
  } else if (id === "snowWind") {
    add("ice", 3, [1.7, 2.5]);
    world.bioEv = { id, t: 0 };
  } else if (id === "fireflies") {
    for (const pool of arena.acid) {
      if (pool.life == null) {
        pool.grow = {
          r0: pool.r,
          to: rlHazardRoom250(arena, pool, pool.r * RL_NECTAR_GROW),
          t0: 0,
          dur: RL_NECTAR_GROW_T,
          ph: rlTidePhase(pool.x, pool.y),
        };
      }
    }
    world.bioEv = { id, t: 0, next: RL_NECTAR_EVERY, n: 0, rng };
  } else if (id === "starPaths") {
    world.bioEv = { id, t: 0, next: RL_HARMONIC_EVERY, rng };
  }
}

function tickBiomeEvent(world, event, dt) {
  const arena = world.arena,
    player = world.player;
  event.t += dt;
  if (event.id === "hotWind") {
    world.addNova(2.0 * dt);
    for (const vent of arena.vents) {
      if (vent.st === "warn" || vent.st === "erupt") {
        world.hash.query(vent.x, vent.y, vent.r + 1.4, (enemy) => {
          if (!enemy.dead && !enemy.boss && Math.hypot(enemy.x - vent.x, enemy.y - vent.y) < vent.r + 1.4) {
            enemy.burnT = Math.max(enemy.burnT, 1.6);
            enemy.burnDps = Math.max(enemy.burnDps || 0, 10 * world.stats.dmgMul);
          }
        });
      }
    }
  } else if (event.id === "sandstorm" && player.dashT > 0 && arena.devils) {
    for (const devil of arena.devils) {
      if ((devil.calmT || 0) <= 0 && Math.hypot(player.x - devil.x, player.y - devil.y) < devil.r + 1.8) {
        devil.calmT = 5.0;
        world.dropShards(devil.x, devil.y, 3);
        world.emit("bountyPulse", { x: devil.x, y: devil.y, amount: 3 });
      }
    }
  } else if (event.id === "fireflies") {
    for (const pool of arena.acid) {
      if (pool.grow) {
        const g = pool.grow;
        const age = event.t - g.t0;
        if (age < g.dur) {
          pool.r = g.r0 + (g.to - g.r0) * clamp(age / g.dur, 0, 1);
        } else {
          const tideAge = age - g.dur;
          const k = 1 - (0.28 - 0.28 * Math.sin((tideAge / RL_TIDE_PERIOD + g.ph) * TAU)) * Math.min(1, tideAge);
          pool.r = g.r0 + (g.to - g.r0) * k;
        }
      }
    }
    if (event.t >= event.next && event.n < 4) {
      event.next += RL_NECTAR_EVERY;
      const avoid = [{ x: player.x, y: player.y, r: 4 }, ...world.placementReservations()],
        pool = rlAddHazard250(arena, "acid", event.rng, arena.obs, arena.W, arena.H, {
          avoid,
          cap: 10,
          size: [1.6, 2.3],
          tries: 90,
        });
      if (pool) {
        event.n++;
        pool.grow = { r0: 0.3, to: pool.r, t0: event.t, dur: 2.5, ph: rlTidePhase(pool.x, pool.y) };
        pool.r = 0.3;
        world.emit("hatch", { x: pool.x, y: pool.y, big: true });
        const nectarSpot = arena.freePoint(event.rng, pool.x, pool.y, 2.6, 0.45, avoid);
        if (nectarSpot) {
          const globe = world.mkPickup("heal", nectarSpot.x, nectarSpot.y, 8);
          globe.vx = 0;
          globe.vy = 0;
          globe.nectar = true;
          world.pickups.push(globe);
        }
      }
    }
  } else if (event.id === "starPaths" && arena.portals.length) {
    for (const portal of arena.portals) {
      for (const [mx, my] of [
        [portal.ax, portal.ay],
        [portal.bx, portal.by],
      ]) {
        world.hash.query(mx, my, 3.2, (enemy) => {
          if (enemy.dead || enemy.boss || enemy.ghost) return;
          const dx = mx - enemy.x,
            dy = my - enemy.y,
            d = Math.hypot(dx, dy);
          if (d > 0.6 && d < 3.2) {
            enemy.kx += (dx / d) * 3.6 * dt;
            enemy.ky += (dy / d) * 3.6 * dt;
          }
        });
      }
    }
    if (!event.planned && event.t >= event.next - RL_HARMONIC_WARN) {
      event.planned = true;
      const avoid = [{ x: player.x, y: player.y, r: 3.5 }, ...world.placementReservations()];
      for (const portal of arena.portals) {
        const pair = rlPortalPair250(event.rng, arena.obs, arena.W, arena.H, arena, { avoid });
        portal.next = pair;
        if (pair) {
          world.emit("blinkWarn", { x: pair.ax, y: pair.ay });
          world.emit("blinkWarn", { x: pair.bx, y: pair.by });
        }
      }
    }
    for (const portal of arena.portals) {
      if (portal.next) portal.moveIn = Math.max(0, event.next - event.t);
    }
    if (event.t >= event.next) {
      event.next += RL_HARMONIC_EVERY;
      event.planned = false;
      for (const portal of arena.portals) {
        const dest = portal.next;
        if (!dest) continue;
        if (
          Math.hypot(player.x - dest.ax, player.y - dest.ay) > 1.6 &&
          Math.hypot(player.x - dest.bx, player.y - dest.by) > 1.6
        ) {
          world.emit("blink", { x: portal.ax, y: portal.ay, small: true, phase: true });
          portal.ax = dest.ax;
          portal.ay = dest.ay;
          portal.bx = dest.bx;
          portal.by = dest.by;
          world.emit("blink", { x: portal.ax, y: portal.ay, small: true, phase: true });
          world.emit("blink", { x: portal.bx, y: portal.by, small: true, phase: true });
        }
        portal.next = null;
        portal.moveIn = 0;
      }
    }
  }
}

export {
  RL_HEAT_TIME,
  RL_HEAT_CD,
  triggerHeatSink,
  rlNearActiveHazard,
  checkDashHeatSink,
  starfallHarvest,
  updateCaravan,
  ringCourtyardBell,
  courtyardBellPulse,
  overpressureFumarole,
  updateFeatures,
  updateHazards,
  startBiomeEvent,
  tickBiomeEvent,
};
