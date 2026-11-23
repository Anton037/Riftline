import { upgradeList } from "../data/upgrades.js";
import { TAU } from "./util.js";

const BOSS_CARD = Object.fromEntries(upgradeList.filter((upgrade) => upgrade.boss).map((up) => [up.boss, up.id]));
const BOSS_CARD_CHANCE = 1.0;

const LOCK_EVERY = 7,
  LOCK_R = 3.4,
  LOCK_WARN = 0.45,
  LOCK_TIME = 3,
  LOCK_DPS = 50,
  LOCK_RANGE = 13,
  SPLINTERS = 5,
  SPLINTER_DMG = 22,
  SPLINTER_SPEED = 16,
  SPLINTER_LIFE = 0.46,
  SPLINTER_MAX = 60,
  BROOD_EVERY = 6,
  BROOD_MAX = 5,
  BROOD_LIFE = 14,
  BROOD_SPEED = 11.5,
  BROOD_R = 2.2,
  BROOD_DMG = 75,
  BROOD_POISON = 12,
  COLLAPSE_TIME = 0.35,
  COLLAPSE_PULL = 2.6,
  COLLAPSE_DMG = 1.5,
  TRIBUTE_EVERY = 14,
  TRIBUTE_R = 2.8,
  TRIBUTE_DMG = 80,
  FANG_EVERY = 10,
  FANG_N = 6,
  FANG_DMG = 34,
  FANG_SPEED = 16,
  FANG_LIFE = 0.9,
  FANG_MAX = 42;

// Guaranteed Boss Relic offering on Boss Waves (W5, W10, W15, and Endless boss waves).
// On Wave 15, if the defeated Guardian's relic is already owned or Star Hall has been unlocked,
// Star Pull ('collapse') can be offered so it is not locked strictly behind Endless.
function bossCardOffer(world) {
  const boss = world.bossFor(world.wave);
  let id = boss && BOSS_CARD[boss];
  if (world.wave === 15 && !world.up.collapse && (!id || world.up[id] || world.starVaultUnlocked)) {
    id = "collapse";
  }
  if (!id || world.up[id]) return null;
  world.bossLuck = BOSS_CARD_CHANCE;
  return id;
}

function resetBossCards(world) {
  world.cages = [];
  world.burnPools = [];
  world.splinters = [];
  world.implode = null;
  world.lances = [];
}

// The densest group of enemies near the artificer (bosses count, ghosts and spawning enemies do not)
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
  return best && bestN >= 2
    ? { x: best.x, y: best.y }
    : list.length === 1 && list[0].boss
      ? { x: list[0].x, y: list[0].y }
      : null;
}

function updateSealgrid(world, dt) {
  const player = world.player,
    dmg = LOCK_DPS * world.stats.dmgMul;
  player.lockT = (player.lockT ?? LOCK_EVERY * 0.5) - dt;
  if (player.lockT <= 0 && world.state === "fight" && player.alive) {
    const at = lockTarget(world);
    if (at) {
      player.lockT = LOCK_EVERY;
      const cage = { id: world.nextId++, x: at.x, y: at.y, r: LOCK_R, t: 0, held: [] };
      world.cages.push(cage);
      world.emit("bellCage", { x: at.x, y: at.y, r: LOCK_R });
    } else player.lockT = 0.5;
  }
  for (const cage of world.cages) {
    cage.t += dt;
    if (cage.t < LOCK_WARN) continue;
    const firstFrame = !cage.live;
    cage.live = true;
    // Snare enemies on activation AND enemies walking into the cage mid-duration
    world.hash.query(cage.x, cage.y, cage.r, (enemy) => {
      if (
        !enemy.dead &&
        !enemy.ghost &&
        Math.hypot(enemy.x - cage.x, enemy.y - cage.y) < cage.r &&
        !cage.held.includes(enemy)
      ) {
        cage.held.push(enemy);
      }
    });
    if (firstFrame) {
      world.emit("lockOn", { x: cage.x, y: cage.y, r: cage.r, n: cage.held.length });
    }
    for (const enemy of cage.held) {
      if (enemy.dead) continue;
      const dx = enemy.x - cage.x,
        dy = enemy.y - cage.y,
        dist = Math.hypot(dx, dy) || 0.001,
        edge = cage.r - enemy.r * 0.6;
      if (enemy.boss) {
        // Guardians are slowed by 30% while inside the cage
        if (dist < cage.r + enemy.r) {
          enemy.cageSlowT = Math.max(enemy.cageSlowT || 0, 0.25);
          enemy.slowT = Math.max(enemy.slowT || 0, 0.25);
        }
      } else if (dist > edge) {
        enemy.x = cage.x + (dx / dist) * edge;
        enemy.y = cage.y + (dy / dist) * edge;
        enemy.vx = 0;
        enemy.vy = 0;
        world.arena.resolve(enemy, enemy.r);
      }
      enemy.lockAcc = (enemy.lockAcc || 0) + dmg * dt;
      if (enemy.lockAcc >= dmg * 0.5) {
        world.hurtEnemy(enemy, enemy.lockAcc, 0, 0, 0, false, "bellCage");
        enemy.lockAcc = 0;
      }
    }
  }
  if (world.cages.some((cage) => cage.t >= LOCK_WARN + LOCK_TIME))
    world.cages = world.cages.filter((cage) => cage.t < LOCK_WARN + LOCK_TIME);
}

function updateBurnPools(world, dt) {
  if (!world.burnPools.length) return;
  const player = world.player;
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
      enemy.burnT = Math.max(enemy.burnT, 1.2);
      enemy.burnDps = Math.max(was, dps);
      enemy.burnSrc = pool.src || "burn";
      if (pool.vuln) {
        enemy.chimeVulnT = Math.max(enemy.chimeVulnT || 0, 1.0);
      }
    });
    // Hostile trap burnPools also singe the player
    if (
      pool.hostile &&
      player &&
      player.alive &&
      player.dashT <= 0 &&
      Math.hypot(player.x - pool.x, player.y - pool.y) <= pool.r + player.r * 0.4
    ) {
      world.hurtPlayer((pool.playerDps || 14) * dt, null, null, "lava", true);
      player.singeT = Math.max(player.singeT || 0, 0.45);
    }
  }
  let w = 0;
  for (let i = 0; i < world.burnPools.length; i++)
    if (world.burnPools[i].life > 0) world.burnPools[w++] = world.burnPools[i];
  world.burnPools.length = w;
}

function shatter(world, enemy, allowHitTarget = false) {
  const last = world.shatterAt;
  if (
    world.splinters.length > SPLINTER_MAX - SPLINTERS ||
    (last != null && world.time >= last && world.time - last < 0.06)
  )
    return;
  world.shatterAt = world.time;
  const turn = world.rng.next() * TAU,
    dmg = SPLINTER_DMG * world.stats.dmgMul,
    fromId = allowHitTarget ? -1 : enemy.id;
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
      from: fromId,
      hits: 0,
      struck: new Set(fromId >= 0 ? [fromId] : []),
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
      if (s.struck && s.struck.has(enemy.id)) return;
      s.struck = s.struck || new Set(s.from != null && s.from >= 0 ? [s.from] : []);
      s.struck.add(enemy.id);
      s.hits = (s.hits || 0) + 1;
      world.hurtEnemy(enemy, s.dmg, s.vx, s.vy, 0.6, false, "shard");
      if (!enemy.dead && !enemy.shielded) enemy.slowT = Math.max(enemy.slowT || 0, 1.8);
      world.emit("splinterHit", { x: s.x, y: s.y });
      // Splinters pierce 2 foes before expiring
      if (s.hits >= 2) s.life = 0;
    });
  }
  let w = 0;
  for (let i = 0; i < world.splinters.length; i++)
    if (world.splinters[i].life > 0) world.splinters[w++] = world.splinters[i];
  world.splinters.length = w;
}

function fangBurst(world, enemy, allowHitTarget = false) {
  if (world.lances.length > FANG_MAX - FANG_N) return;
  let aim = null,
    best = 1e9;
  world.hash.query(enemy.x, enemy.y, 9, (other) => {
    if (other.dead || other.ghost || (!allowHitTarget && other.id === enemy.id)) return;
    const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    if (d < best && d > 0.01) {
      best = d;
      aim = Math.atan2(other.y - enemy.y, other.x - enemy.x);
    }
  });
  const base = aim != null ? aim : world.rng.next() * TAU,
    dmg = FANG_DMG * world.stats.dmgMul,
    fromId = allowHitTarget ? -1 : enemy.id;
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
      from: fromId,
      hits: 0,
      struck: new Set(fromId >= 0 ? [fromId] : []),
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
      s.struck = s.struck || new Set(s.from != null && s.from >= 0 ? [s.from] : []);
      s.struck.add(enemy.id);
      s.hits = (s.hits || 0) + 1;
      world.hurtEnemy(enemy, s.dmg, s.vx, s.vy, 0.6, false, "fang");
      world.emit("splinterHit", { x: s.x, y: s.y, glass: true });
      // Each lance pierces 2 foes whether or not a struck foe dies
      if (s.hits >= 2) s.life = 0;
    });
  }
  let w = 0;
  for (let i = 0; i < world.lances.length; i++) if (world.lances[i].life > 0) world.lances[w++] = world.lances[i];
  world.lances.length = w;
}

function hatch(world, enemy) {
  const mossHelpers = world.player.mossHelpers;
  if (mossHelpers.length >= BROOD_MAX) return;
  mossHelpers.push({ id: world.nextId++, x: enemy.x, y: enemy.y, vx: 0, vy: 0, t: 0, life: BROOD_LIFE, target: null });
  world.emit("broodHatch", { x: enemy.x, y: enemy.y });
}

function burstLarva(world, larva) {
  const stats = world.stats;
  larva.life = 0;
  world.explode(larva.x, larva.y, BROOD_R, BROOD_DMG * stats.dmgMul, { enemies: true, knock: 2, kind: "mossHelpers" });
  world.hash.query(larva.x, larva.y, BROOD_R, (enemy) => {
    if (
      enemy.dead ||
      enemy.ghost ||
      enemy.shielded ||
      Math.hypot(enemy.x - larva.x, enemy.y - larva.y) > BROOD_R + enemy.r
    )
      return;
    const was = enemy.burnT > 0 ? enemy.burnDps : 0;
    enemy.burnT = Math.max(enemy.burnT, 3.5);
    enemy.burnDps = Math.max(was, BROOD_POISON * stats.dmgMul);
    enemy.burnSrc = "mossHelpers";
    // Apply 3.5s Vitriol Glaze (+25% damage taken)
    enemy.glazeT = Math.max(enemy.glazeT || 0, 3.5);
    enemy.glazeMul = Math.max(enemy.glazeMul || 0, 0.25);
    enemy.corrodeT = Math.max(enemy.corrodeT || 0, 3.5);
    enemy.corrode = true;
  });
}

function updateBrood(world, dt) {
  const player = world.player,
    mossHelpers = player.mossHelpers;
  if (!mossHelpers.length) return;
  const fight = world.state === "fight";
  for (let i = 0; i < mossHelpers.length; i++) {
    const larva = mossHelpers[i];
    larva.t += dt;
    larva.life -= dt;
    if (larva.target && (larva.target.dead || larva.target.ghost)) larva.target = null;
    if (!larva.target && fight && larva.t > 0.45) {
      let best = 12;
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
      // Waiting: a slow orbit around the artificer
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
  let w = 0;
  for (let i = 0; i < mossHelpers.length; i++) if (mossHelpers[i].life > 0) mossHelpers[w++] = mossHelpers[i];
  mossHelpers.length = w;
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
    const mass = (1 / (0.6 + enemy.r * enemy.r * 1.6)) * (enemy.elite ? 0.6 : 1),
      pull = (enemy.boss ? 4.5 : 18 * Math.min(1.5, mass * 1.25)) * dt,
      step = Math.min(pull, dist - 1.2);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
    world.arena.resolve(enemy, enemy.r);
  });
  if (imp.t >= COLLAPSE_TIME || !player.alive || world.state !== "fight") {
    world.implode = null;
    if (player.alive && world.state === "fight") novaBlast(world, imp.r, COLLAPSE_DMG, true);
  }
}

function novaBlast(world, radius, mul = 1, collapse = false) {
  const player = world.player;
  world.explode(player.x, player.y, radius, 70 * mul * world.stats.dmgMul, {
    enemies: true,
    knock: 12,
    kind: "fireBurst",
  });
  for (const bullet of world.eb) {
    if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius * 1.7) {
      bullet.life = 0;
      world.emit("pop", { x: bullet.x, y: bullet.y });
    }
  }
  world.emit("fireBurst", { x: player.x, y: player.y, r: radius, collapse });
}

function bossCardNova(world, radius) {
  if (!world.stats.collapse) return false;
  const player = world.player;
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

function dropMoltenIngot(world, at) {
  const stats = world.stats;
  world.explode(at.x, at.y, TRIBUTE_R, TRIBUTE_DMG * stats.dmgMul, {
    enemies: true,
    knock: 3.5,
    kind: "forgeGift",
    src: "forgeGift",
  });
  world.player.tributeT = Math.max(world.player.tributeT || 0, 4.0);
  world.dropShards(at.x, at.y, 18);
  world.pickups.push(world.mkPickup("heal", at.x, at.y, 12));
  world.emit("forgeGift", { x: at.x, y: at.y, r: TRIBUTE_R });
}

function bossCardKill(world, enemy) {
  const stats = world.stats;
  if (stats.shardField) shatter(world, enemy);
  if (stats.mossHelpers) {
    world.broodN = (world.broodN || 0) + 1;
    if (world.broodN >= BROOD_EVERY) {
      world.broodN = 0;
      hatch(world, enemy);
    }
  }
  if (stats.forgeGift) {
    world.tributeN = (world.tributeN || 0) + 1;
    if (world.tributeN >= TRIBUTE_EVERY) {
      world.tributeN = 0;
      dropMoltenIngot(world, enemy);
    }
  }
  if (stats.fang) {
    world.fangN = (world.fangN || 0) + 1;
    if (world.fangN >= FANG_EVERY) {
      world.fangN = 0;
      fangBurst(world, enemy);
    }
  }
}

// Guardian hit cadence triggers so kill-counter relics are impactful in 1v1 Guardian boss fights
function bossCardBossHit(world, boss) {
  const stats = world.stats;
  if (!boss || !boss.boss || boss.dead) return;
  boss._relicHits = (boss._relicHits || 0) + 1;
  const h = boss._relicHits;
  if (stats.shardField && h % 15 === 0) {
    shatter(world, boss, true);
  }
  if (stats.mossHelpers && h % 18 === 0) {
    hatch(world, boss);
  }
  if (stats.forgeGift && h % 20 === 0) {
    dropMoltenIngot(world, boss);
  }
  if (stats.fang && h % 16 === 0) {
    fangBurst(world, boss, true);
  }
}

function updateBossCards(world, dt) {
  const stats = world.stats;
  if (!world.player.mossHelpers) world.player.mossHelpers = [];
  if (stats.bellCage) updateSealgrid(world, dt);
  else if (world.cages.length) world.cages = [];
  updateBurnPools(world, dt);
  updateSplinters(world, dt);
  updateLances(world, dt);
  updateBrood(world, dt);
  updateImplode(world, dt);
}

export {
  BOSS_CARD,
  BOSS_CARD_CHANCE,
  LOCK_WARN,
  LOCK_TIME,
  COLLAPSE_TIME,
  bossCardOffer,
  resetBossCards,
  novaBlast,
  bossCardNova,
  bossCardKill,
  bossCardBossHit,
  updateBossCards,
};
