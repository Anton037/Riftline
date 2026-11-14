import { upgradeList } from "../data/upgrades.js";
import { makeRng, hashString, TAU } from "./util.js";

const BOSS_CARD = Object.fromEntries(upgradeList.filter((upgrade) => upgrade.boss).map((up) => [up.boss, up.id]));
const BOSS_CARD_CHANCE = 0.3,
  BOSS_CARD_STEP = 0.15;

const LOCK_EVERY = 8,
  LOCK_R = 3.2,
  LOCK_WARN = 0.45,
  LOCK_TIME = 3,
  LOCK_DPS = 26,
  LOCK_RANGE = 13,
  SPLINTERS = 5,
  SPLINTER_DMG = 16,
  SPLINTER_SPEED = 16,
  SPLINTER_LIFE = 0.42,
  SPLINTER_MAX = 60,
  BROOD_EVERY = 10,
  BROOD_MAX = 4,
  BROOD_LIFE = 14,
  BROOD_SPEED = 11,
  BROOD_R = 1.7,
  BROOD_DMG = 45,
  BROOD_POISON = 9,
  COLLAPSE_TIME = 0.35,
  COLLAPSE_PULL = 1.4,
  COLLAPSE_DMG = 1.4,
  // 3.49.0: the Tyrant's Tithe: kills count towards the caldera's payout
  TRIBUTE_EVERY = 20,
  // 3.56.0: the Glasswyrm Fang: kills count towards the wyrm's hunger - the last kill bursts into a
  // fan of hot glass lances that pierce through
  FANG_EVERY = 14,
  FANG_N = 6,
  FANG_DMG = 26,
  FANG_SPEED = 15,
  FANG_LIFE = 0.9,
  FANG_MAX = 42;

// the boss card of a boss choice (null: none this time). Its own random stream (seed, wave) keeps every other roll of
// the run where it was.
function bossCardOffer(world) {
  const boss = world.bossFor(world.wave),
    id = boss && BOSS_CARD[boss];
  if (!id || world.up[id]) return null;
  const roll = makeRng(hashString(world.seed + ":boss-card:" + world.wave)).next();
  if (roll < world.bossLuck) {
    world.bossLuck = BOSS_CARD_CHANCE;
    return id;
  }
  world.bossLuck = Math.min(1, world.bossLuck + BOSS_CARD_STEP);
  return null;
}

function resetBossCards(world) {
  world.cages = [];
  world.burnPools = [];
  world.splinters = [];
  world.implode = null;
  world.lances = [];
}

// the densest group of enemies near the drone (bosses count, ghosts and spawning enemies do not)
function lockTarget(world) {
  const player = world.player,
    list = world.enemies.filter(
      (enemy) =>
        !enemy.dead &&
        !enemy.ghost &&
        enemy.spawnT <= 0 &&
        Math.hypot(enemy.x - player.x, enemy.y - player.y) < LOCK_RANGE,
    );
  let best = null,
    bestN = 0;
  for (const enemy of list) {
    let n = 0;
    for (const other of list) if (Math.hypot(other.x - enemy.x, other.y - enemy.y) < LOCK_R) n += other.boss ? 3 : 1;
    if (n > bestN) {
      bestN = n;
      best = enemy;
    }
  }
  return best && bestN >= 2 ? { x: best.x, y: best.y } : null;
}

function updateLockdown(world, dt) {
  const player = world.player,
    dmg = LOCK_DPS * world.stats.dmgMul;
  player.lockT = (player.lockT ?? LOCK_EVERY * 0.5) - dt;
  if (player.lockT <= 0 && world.state === "fight" && player.alive) {
    const at = lockTarget(world);
    if (at) {
      player.lockT = LOCK_EVERY;
      const cage = { id: world.nextId++, x: at.x, y: at.y, r: LOCK_R, t: 0, held: [] };
      world.cages.push(cage);
      world.emit("lockdown", { x: at.x, y: at.y, r: LOCK_R });
    } else player.lockT = 0.5;
  }
  for (const cage of world.cages) {
    cage.t += dt;
    if (cage.t < LOCK_WARN) continue;
    if (!cage.live) {
      // the beams light: everything inside is caught (enemies that walk in later are not)
      cage.live = true;
      world.hash.query(cage.x, cage.y, cage.r, (enemy) => {
        if (!enemy.dead && !enemy.ghost && Math.hypot(enemy.x - cage.x, enemy.y - cage.y) < cage.r)
          cage.held.push(enemy);
      });
      world.emit("lockOn", { x: cage.x, y: cage.y, r: cage.r, n: cage.held.length });
    }
    for (const enemy of cage.held) {
      if (enemy.dead) continue;
      const dx = enemy.x - cage.x,
        dy = enemy.y - cage.y,
        dist = Math.hypot(dx, dy) || 0.001,
        edge = cage.r - enemy.r * 0.6;
      // a boss is burned but not held
      if (!enemy.boss && dist > edge) {
        enemy.x = cage.x + (dx / dist) * edge;
        enemy.y = cage.y + (dy / dist) * edge;
        enemy.vx = 0;
        enemy.vy = 0;
        world.arena.resolve(enemy, enemy.r);
      }
      // the damage comes in two hits a second (one number each, not a stream of small ones)
      enemy.lockAcc = (enemy.lockAcc || 0) + dmg * dt;
      if (enemy.lockAcc >= dmg * 0.5) {
        world.hurtEnemy(enemy, enemy.lockAcc, 0, 0, 0, false, "lockdown");
        enemy.lockAcc = 0;
      }
    }
  }
  if (world.cages.some((cage) => cage.t >= LOCK_WARN + LOCK_TIME))
    world.cages = world.cages.filter((cage) => cage.t < LOCK_WARN + LOCK_TIME);
}

function updateBurnPools(world, dt) {
  if (!world.burnPools.length) return;
  for (const pool of world.burnPools) {
    pool.life -= dt;
    const dps = pool.dps;
    world.hash.query(pool.x, pool.y, pool.r, (enemy) => {
      if (
        enemy.dead ||
        enemy.ghost ||
        enemy.shielded ||
        Math.hypot(enemy.x - pool.x, enemy.y - pool.y) > pool.r + enemy.r * 0.5
      )
        return;
      const was = enemy.burnT > 0 ? enemy.burnDps : 0;
      enemy.burnT = Math.max(enemy.burnT, 1);
      enemy.burnDps = Math.max(was, dps);
      // Credit Searing Collapse to burning damage.
      enemy.burnSrc = "burn";
    });
  }
  // 3.46.0: compacted in place (a filter per step while the pools burn)
  let w = 0;
  for (let i = 0; i < world.burnPools.length; i++)
    if (world.burnPools[i].life > 0) world.burnPools[w++] = world.burnPools[i];
  world.burnPools.length = w;
}

function shatter(world, enemy) {
  // (Endless restarts the clock at 0: a last shatter that lies in the "future" must not block it for the whole run)
  const last = world.shatterAt;
  if (
    world.splinters.length > SPLINTER_MAX - SPLINTERS ||
    (last != null && world.time >= last && world.time - last < 0.08)
  )
    return;
  world.shatterAt = world.time;
  const turn = world.rng.next() * TAU,
    dmg = SPLINTER_DMG * world.stats.dmgMul;
  for (let i = 0; i < SPLINTERS; i++) {
    const a = turn + (i / SPLINTERS) * TAU;
    world.splinters.push({
      id: world.nextId++,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(a) * SPLINTER_SPEED,
      vy: Math.sin(a) * SPLINTER_SPEED,
      a,
      life: SPLINTER_LIFE,
      dmg,
      from: enemy.id,
    });
  }
  world.emit("shatter", { x: enemy.x, y: enemy.y, r: enemy.r });
}

function updateSplinters(world, dt) {
  if (!world.splinters.length) return;
  for (const s of world.splinters) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (world.arena.blocked && world.arena.blocked(s.x, s.y, 0.1)) {
      s.life = 0;
      continue;
    }
    world.hash.query(s.x, s.y, 1, (enemy) => {
      if (s.life <= 0 || enemy.dead || enemy.ghost || enemy.id === s.from) return;
      if (Math.hypot(enemy.x - s.x, enemy.y - s.y) > enemy.r + 0.15) return;
      world.hurtEnemy(enemy, s.dmg, s.vx, s.vy, 0.6, false, "fang");
      if (!enemy.dead && !enemy.shielded) enemy.slowT = Math.max(enemy.slowT, 1.5);
      world.emit("splinterHit", { x: s.x, y: s.y });
      s.life = 0;
    });
  }
  // 3.46.0: compacted in place (a filter per step while splinters fly)
  let w = 0;
  for (let i = 0; i < world.splinters.length; i++)
    if (world.splinters[i].life > 0) world.splinters[w++] = world.splinters[i];
  world.splinters.length = w;
}

// 3.56.0: the Glasswyrm Fang: the kill bursts into a fan of hot glass lances, aimed at the nearest
// enemy of the killed one (a ring when the field is empty) - each lance pierces through one body
function fangBurst(world, enemy) {
  if (world.lances.length > FANG_MAX - FANG_N) return;
  let aim = null,
    best = 1e9;
  world.hash.query(enemy.x, enemy.y, 9, (other) => {
    if (other.dead || other.ghost || other.id === enemy.id) return;
    const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    if (d < best) {
      best = d;
      aim = Math.atan2(other.y - enemy.y, other.x - enemy.x);
    }
  });
  const base = aim != null ? aim : world.rng.next() * TAU,
    dmg = FANG_DMG * world.stats.dmgMul;
  for (let i = 0; i < FANG_N; i++) {
    const a = base + (i - (FANG_N - 1) / 2) * 0.22;
    world.lances.push({
      id: world.nextId++,
      x: enemy.x,
      y: enemy.y,
      vx: Math.cos(a) * FANG_SPEED,
      vy: Math.sin(a) * FANG_SPEED,
      a,
      life: FANG_LIFE,
      dmg,
      from: enemy.id,
      hits: 0,
    });
  }
  world.emit("shatter", { x: enemy.x, y: enemy.y, r: enemy.r, glass: true });
}

function updateLances(world, dt) {
  if (!world.lances || !world.lances.length) return;
  for (const s of world.lances) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (world.arena.blocked && world.arena.blocked(s.x, s.y, 0.1)) {
      s.life = 0;
      continue;
    }
    world.hash.query(s.x, s.y, 1, (enemy) => {
      if (s.life <= 0 || enemy.dead || enemy.ghost || enemy.id === s.from) return;
      if (Math.hypot(enemy.x - s.x, enemy.y - s.y) > enemy.r + 0.15) return;
      if (s.struck && s.struck.has(enemy.id)) return;
      world.hurtEnemy(enemy, s.dmg, s.vx, s.vy, 0.6, false, "fang");
      if (!enemy.dead) {
        s.struck = s.struck || new Set([s.from]);
        s.struck.add(enemy.id);
        s.hits++;
        // a lance pierces one body, then shatters
        if (s.hits > 1) s.life = 0;
      } else s.life = 0;
      world.emit("splinterHit", { x: s.x, y: s.y, glass: true });
    });
  }
  let w = 0;
  for (let i = 0; i < world.lances.length; i++) if (world.lances[i].life > 0) world.lances[w++] = world.lances[i];
  world.lances.length = w;
}

function hatch(world, enemy) {
  const brood = world.player.brood;
  if (brood.length >= BROOD_MAX) return;
  brood.push({ id: world.nextId++, x: enemy.x, y: enemy.y, vx: 0, vy: 0, t: 0, life: BROOD_LIFE, target: null });
  world.emit("broodHatch", { x: enemy.x, y: enemy.y });
}

function burstLarva(world, larva) {
  const stats = world.stats;
  larva.life = 0;
  world.explode(larva.x, larva.y, BROOD_R, BROOD_DMG * stats.dmgMul, { enemies: true, knock: 2, kind: "brood" });
  world.hash.query(larva.x, larva.y, BROOD_R, (enemy) => {
    if (
      enemy.dead ||
      enemy.ghost ||
      enemy.shielded ||
      Math.hypot(enemy.x - larva.x, enemy.y - larva.y) > BROOD_R + enemy.r
    )
      return;
    const was = enemy.burnT > 0 ? enemy.burnDps : 0;
    enemy.burnT = Math.max(enemy.burnT, 3);
    enemy.burnDps = Math.max(was, BROOD_POISON * stats.dmgMul);
    enemy.burnSrc = "brood";
  });
}

function updateBrood(world, dt) {
  const player = world.player,
    brood = player.brood;
  if (!brood.length) return;
  const fight = world.state === "fight";
  for (let i = 0; i < brood.length; i++) {
    const larva = brood[i];
    larva.t += dt;
    larva.life -= dt;
    if (larva.target && (larva.target.dead || larva.target.ghost)) larva.target = null;
    if (!larva.target && fight && larva.t > 0.6) {
      let best = 10;
      for (const enemy of world.enemies) {
        if (enemy.dead || enemy.ghost || enemy.spawnT > 0) continue;
        const dist = Math.hypot(enemy.x - larva.x, enemy.y - larva.y);
        if (dist < best) {
          best = dist;
          larva.target = enemy;
        }
      }
    }
    let tx, ty, speed;
    if (larva.target) {
      tx = larva.target.x;
      ty = larva.target.y;
      speed = BROOD_SPEED;
    } else {
      // waiting: a slow circle around the drone
      const a = world.time * 1.4 + (i / BROOD_MAX) * TAU;
      tx = player.x + Math.cos(a) * 1.8;
      ty = player.y + Math.sin(a) * 1.8;
      speed = 7;
    }
    const dx = tx - larva.x,
      dy = ty - larva.y,
      dist = Math.hypot(dx, dy) || 0.001,
      k = Math.min(1, dt * 8);
    larva.vx += ((dx / dist) * speed * Math.min(1, dist) - larva.vx) * k;
    larva.vy += ((dy / dist) * speed * Math.min(1, dist) - larva.vy) * k;
    larva.x += larva.vx * dt;
    larva.y += larva.vy * dt;
    if (larva.target && dist < larva.target.r + 0.3) burstLarva(world, larva);
    else if (larva.life <= 0 && fight) burstLarva(world, larva);
  }
  // a larva that runs out between waves fades without a blast
  // 3.46.0: compacted in place (a filter per step while larvae fly)
  let w = 0;
  for (let i = 0; i < brood.length; i++) if (brood[i].life > 0) brood[w++] = brood[i];
  brood.length = w;
}

function updateImplode(world, dt) {
  const imp = world.implode;
  if (!imp) return;
  const player = world.player;
  imp.t += dt;
  imp.x = player.x;
  imp.y = player.y;
  const pullR = imp.r * COLLAPSE_PULL;
  world.hash.query(player.x, player.y, pullR, (enemy) => {
    if (enemy.dead || enemy.ghost) return;
    const dx = player.x - enemy.x,
      dy = player.y - enemy.y,
      dist = Math.hypot(dx, dy) || 0.001;
    if (dist > pullR || dist < 1.2) return;
    // heavier enemies come slower (the same mass as the Singularity's pull)
    const mass = (1 / (0.6 + enemy.r * enemy.r * 1.6)) * (enemy.elite ? 0.6 : 1),
      pull = (enemy.boss ? 3 : 16 * Math.min(1.4, mass * 1.2)) * dt,
      step = Math.min(pull, dist - 1.2);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
    // a wall between the enemy and the drone keeps it out (it is pulled in a straight line)
    world.arena.resolve(enemy, enemy.r);
  });
  if (imp.t >= COLLAPSE_TIME || !player.alive || world.state !== "fight") {
    world.implode = null;
    if (player.alive && world.state === "fight") novaBlast(world, imp.r, COLLAPSE_DMG, true);
  }
}

// the blast of the Nova (World.nova calls it directly without Event Collapse)
function novaBlast(world, radius, mul = 1, collapse = false) {
  const player = world.player;
  world.explode(player.x, player.y, radius, 70 * mul * world.stats.dmgMul, { enemies: true, knock: 12, kind: "nova" });
  for (const bullet of world.eb) {
    if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius * 1.7) {
      bullet.life = 0;
      world.emit("pop", { x: bullet.x, y: bullet.y });
    }
  }
  world.emit("nova", { x: player.x, y: player.y, r: radius, collapse });
}

// Event Collapse: the Nova starts with the pull (true: World.nova must not blast now)
function bossCardNova(world, radius) {
  if (!world.stats.collapse) return false;
  const player = world.player;
  // the shots around are gone at once, as with every Nova; the drone is safe through the pull
  for (const bullet of world.eb)
    if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius * 1.7) {
      bullet.life = 0;
      world.emit("pop", { x: bullet.x, y: bullet.y });
    }
  player.iT = Math.max(player.iT, 0.5 + COLLAPSE_TIME);
  world.implode = { t: 0, r: radius, x: player.x, y: player.y };
  world.emit("implode", { x: player.x, y: player.y, r: radius * COLLAPSE_PULL, t: COLLAPSE_TIME });
  return true;
}

function bossCardKill(world, enemy) {
  const stats = world.stats;
  if (stats.shardField) shatter(world, enemy);
  if (stats.brood) {
    world.broodN = (world.broodN || 0) + 1;
    if (world.broodN >= BROOD_EVERY) {
      world.broodN = 0;
      hatch(world, enemy);
    }
  }
  // 3.49.0: the tithe pays out on the spot: a burst of shards and a bandage
  if (stats.tribute) {
    world.tributeN = (world.tributeN || 0) + 1;
    if (world.tributeN >= TRIBUTE_EVERY) {
      world.tributeN = 0;
      world.dropShards(enemy.x, enemy.y, 40);
      world.pickups.push(world.mkPickup("heal", enemy.x, enemy.y, 15));
      world.emit("tribute", { x: enemy.x, y: enemy.y });
    }
  }
  // 3.56.0: the wyrm's hunger: the kill bursts into a fan of hot glass lances
  if (stats.fang) {
    world.fangN = (world.fangN || 0) + 1;
    if (world.fangN >= FANG_EVERY) {
      world.fangN = 0;
      fangBurst(world, enemy);
    }
  }
}

function updateBossCards(world, dt) {
  const stats = world.stats;
  if (!world.player.brood) world.player.brood = [];
  if (stats.lockdown) updateLockdown(world, dt);
  else if (world.cages.length) world.cages = [];
  updateBurnPools(world, dt);
  updateSplinters(world, dt);
  updateBrood(world, dt);
  updateImplode(world, dt);
  updateLances(world, dt);
}

export {
  BOSS_CARD,
  BOSS_CARD_CHANCE,
  LOCK_WARN,
  LOCK_TIME,
  COLLAPSE_TIME,
  bossCardOffer,
  bossCardKill,
  bossCardNova,
  novaBlast,
  resetBossCards,
  updateBossCards,
};
