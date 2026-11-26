// Biome-native realm mechanisms (from wave 2): floor strikes, sweeping beacons/bellows, and shootable vessels.
// Every biome has a full 3-family kit (floor, beam, mine) with distinct tactical behavior.

import { makeRng, hashString, TAU, clamp } from "./util.js";
import { BIOME_TRAP_EFFECTS as BIOME_TRAPS } from "../data/combat-effects.js";

// skins: family, base damage (times wave enemy damage multiplier), radius, warning, pause, biome-native twist
const TRAP_SKINS = {
  // Sweeping beacons, curtains, spouts & bellows (all 6 realms)
  laser: { fam: "beam", dmg: 20, w: 0.95, len: 26, warn: 1.05, dur: 2.2, rot: 0.62, cd: 2.7, special: "shock" },
  iceShot: {
    fam: "beam",
    dmg: 19,
    w: 1.15,
    len: 22,
    warn: 1.0,
    dur: 2.35,
    rot: 0.56,
    swing: 1.22,
    cd: 2.6,
    special: "chill",
  },
  acid: { fam: "beam", dmg: 19, w: 1.05, len: 21, warn: 0.95, dur: 2.2, rot: 0.78, cd: 2.5, special: "acid" },
  rift: { fam: "beam", dmg: 22, w: 1.0, len: 23, warn: 1.0, dur: 2.6, rot: -0.66, swing: 1.42, cd: 2.8 },
  magma: { fam: "beam", dmg: 22, w: 1.35, len: 19, warn: 0.95, dur: 1.95, rot: 0.86, cd: 2.35, special: "burn" },
  sun: {
    fam: "beam",
    dmg: 22,
    w: 0.9,
    len: 25,
    warn: 1.0,
    dur: 2.25,
    rot: 0.72,
    swing: 1.32,
    cd: 2.65,
    special: "glass",
  },

  // Floor hazards
  plate: { fam: "floor", dmg: 25, r: 2.35, warn: 0.98, cd: 3.1, special: "shock", knock: 4.8, frac: 0.12 },
  icespike: {
    fam: "floor",
    dmg: 27,
    r: 2.3,
    warn: 0.98,
    cd: 3.1,
    special: "chill",
    chillHalo: 1.35,
    frac: 0.11,
  },
  geyser: { fam: "floor", dmg: 24, r: 2.15, warn: 0.96, cd: 3.0, special: "acid", frac: 0.11 },
  riftburst: { fam: "floor", dmg: 28, r: 2.5, warn: 1.02, cd: 3.15, special: "shock", pull: 5.6, frac: 0.12 },
  pyro: { fam: "floor", dmg: 25, r: 2.2, warn: 0.96, cd: 2.95, special: "burn", frac: 0.13 },
  sunspike: { fam: "floor", dmg: 26, r: 2.35, warn: 0.98, cd: 3.05, special: "glass", knock: 6.5, frac: 0.13 },

  // Shootable proximity vessels
  mine: {
    fam: "mine",
    dmg: 30,
    r: 2.8,
    trig: 2.0,
    arm: 1.35,
    fuse: 0.45,
    special: "shock",
    knock: 5.4,
    daze: 2.2,
    frac: 0.18,
  },
  frost: {
    fam: "mine",
    dmg: 24,
    r: 3.25,
    trig: 2.0,
    arm: 1.35,
    fuse: 0.45,
    special: "chill",
    chillHalo: 1.45,
    icePatch: true,
    frac: 0.13,
  },
  spore: {
    fam: "mine",
    dmg: 20,
    r: 3.05,
    trig: 2.0,
    arm: 1.35,
    fuse: 0.45,
    special: "acid",
    poolScale: 1.05,
    frac: 0.11,
  },
  riftmine: { fam: "mine", dmg: 28, r: 2.95, trig: 2.0, arm: 1.35, fuse: 0.56, pull: 8.8, frac: 0.16 },
  embermine: {
    fam: "mine",
    dmg: 30,
    r: 2.8,
    trig: 2.0,
    arm: 1.35,
    fuse: 0.45,
    special: "burn",
    poolLife: 3.5,
    frac: 0.17,
  },
  glassmine: {
    fam: "mine",
    dmg: 28,
    r: 2.85,
    trig: 2.0,
    arm: 1.35,
    fuse: 0.45,
    special: "glass",
    knock: 7.5,
    splinters: 4,
    frac: 0.17,
  },
};

// First wave of each family, unlocked in World 1 so Lantern Yard mechanisms appear in standard waves
const TRAP_FROM = { floor: 2, mine: 4, beam: 7 };

function trapCount(fam, wave) {
  if (wave < TRAP_FROM[fam]) return 0;
  const late = wave - TRAP_FROM[fam];
  let count =
    fam === "floor" ? 2 + Math.floor(late / 5) : fam === "beam" ? 1 + Math.floor(late / 5) : 2 + Math.floor(late / 4);
  if (wave > 20) count = Math.ceil(count * 1.4) + Math.floor(Math.max(0, wave - 40) / 20);
  return Math.min(count, fam === "floor" ? 9 : fam === "beam" ? 4 : 12);
}

const pace = (wave, storm = 0) => (wave > 20 ? { cd: 0.8 * (1 - 0.12 * storm), warn: 0.86 } : { cd: 1, warn: 1 });

function trapRadius(skin) {
  if (skin.fam === "beam") return 1.25;
  // Mines have a wider blast when shot. Spore mines also leave a slightly wider pool.
  return skin.fam === "mine" ? skin.r * 1.15 * Math.max(1, skin.poolScale || 1) : skin.r;
}

function trapFootprints(traps, except) {
  return traps
    .filter((trap) => trap !== except && trap.st !== "gone")
    .map((trap) => ({ x: trap.x, y: trap.y, r: trapRadius(TRAP_SKINS[trap.skin]) + 0.25 }));
}

function findTrapSite(arena, skin, rng, reserved, keepSpawnClear = true) {
  const radius = trapRadius(skin) + 0.45;
  const inset = Math.max(2.8, radius);
  for (let attempt = 0; attempt < 96; attempt++) {
    const x = rng.range(-arena.W + inset, arena.W - inset),
      y = rng.range(-arena.H + inset, arena.H - inset);
    if (keepSpawnClear && Math.hypot(x, y - 2) < Math.max(6.5, 4.6 + radius)) continue;
    if (!arena.clearForPlacement(x, y, radius, reserved)) continue;
    if (skin.fam === "beam") {
      // Mount sweepers on the outside and point them across open floor toward the center.
      if (Math.min(arena.W - Math.abs(x), arena.H - Math.abs(y)) > Math.min(arena.W, arena.H) * 0.4) continue;
      const a = Math.atan2(2 - y, -x) + rng.range(-0.35, 0.35);
      if (arena.rayLen(x, y, a, skin.len) < 7) continue;
      return { x, y, a };
    }
    return { x, y, a: rng.next() * TAU };
  }
  return null;
}

function rlPlanTraps(world, wave, boss) {
  const traps = [];
  if ((boss && wave < 10) || wave < TRAP_FROM.floor) return traps;
  const biome = world.arena.biome.id,
    skins = BIOME_TRAPS[biome];
  if (!skins) return traps;
  const rng = makeRng(hashString(world.seed + ":traps:" + wave)),
    arena = world.arena,
    taken = [];
  const storm = (world.mods && world.mods.extraTraps) || 0;
  for (const fam of boss ? ["floor"] : ["floor", "beam", "mine"]) {
    const skinName = skins[fam];
    if (!skinName) continue;
    const skin = TRAP_SKINS[skinName],
      base = trapCount(fam, wave) + (base0(fam, wave) ? storm : 0),
      count = boss ? Math.max(1, Math.min(3, Math.ceil(base / 2))) : base;
    for (let i = 0; i < count; i++) {
      const spot = findTrapSite(arena, skin, rng, taken, true);
      if (!spot) break;
      taken.push({ x: spot.x, y: spot.y, r: trapRadius(skin) + 0.25 });
      const trap = {
        id: traps.length + 1,
        fam,
        skin: skinName,
        ...spot,
        r: skin.r || skin.w,
        st: fam === "mine" ? "unarmed" : "idle",
        t: 0,
        wait: 1.8 + rng.next() * 2.2 + i * 0.75,
        // Hunting floor traps activate from Wave 2+ (and on Wave 10+ bosses) so center-camping is never free.
        hunt: fam === "floor" && (boss || i === 0 || i % 2 === 1),
        dir: rng.chance(0.5) ? 1 : -1,
      };
      traps.push(trap);
    }
  }
  return traps;
}

function layTrapResidue(patches, trap, residue) {
  const ownPatch = patches.find((patch) => patch.trapId === trap.id && patch.x === trap.x && patch.y === trap.y);
  if (ownPatch) {
    ownPatch.life = Math.max(ownPatch.life, residue.life);
    ownPatch.r = Math.max(ownPatch.r, residue.r);
  } else if (patches.every((patch) => Math.hypot(patch.x - trap.x, patch.y - trap.y) >= patch.r + residue.r)) {
    patches.push({ x: trap.x, y: trap.y, trapId: trap.id, ...residue });
  }
}

const base0 = (fam, wave) => wave >= TRAP_FROM[fam];

const trapDamage = (world, skin) =>
  skin.dmg *
  world.dmgMul *
  (1 + 0.01 * Math.max(0, (world.wave || 1) - 20)) *
  Math.max(0, 1 - (world.stats.hazardResist || 0));

function trapEffectsOnPlayer(world, skin, trap) {
  const player = world.player;
  if (skin.special === "chill" || skin.special === "shock") {
    const time = skin.special === "chill" ? 1.6 : 0.8;
    if (time >= player.slowT) player.slowKind = skin.special;
    player.slowT = Math.max(player.slowT, time);
    world.emit(skin.special === "chill" ? "chill" : "stun", { x: player.x, y: player.y, skin: trap.skin });
  } else if (skin.special === "acid") {
    if (0.9 >= player.slowT) player.slowKind = "acid";
    player.slowT = Math.max(player.slowT, 0.9);
    player.corrodeT = Math.max(player.corrodeT || 0, 2.0);
    world.emit("corrode", { x: player.x, y: player.y, skin: trap.skin });
  } else if (skin.special === "burn") {
    player.singeT = Math.max(player.singeT || 0, 1.5);
    world.emit("singe", { x: player.x, y: player.y, skin: trap.skin });
  } else if (skin.special === "glass") {
    if (0.65 >= player.slowT) player.slowKind = "daze";
    player.slowT = Math.max(player.slowT, 0.65);
    player.dazeT = Math.max(player.dazeT || 0, 1.0);
    world.emit("glare", { x: player.x, y: player.y, skin: trap.skin });
  }
}

function trapPull(world, trap, strength, pullR, tugPlayer, dt) {
  const player = world.player;
  world.hash.query(trap.x, trap.y, pullR, (enemy) => {
    if (enemy.dead || enemy.ghost || enemy.boss) return;
    const dx = trap.x - enemy.x,
      dy = trap.y - enemy.y,
      dist = Math.hypot(dx, dy);
    if (dist <= 0.45 || dist > pullR) return;
    const step = Math.min(dist - 0.4, strength * (1 - (dist / pullR) * 0.45) * dt);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
    world.arena.resolve(enemy, enemy.r);
  });
  if (tugPlayer && player.alive && player.dashT <= 0) {
    const dx = trap.x - player.x,
      dy = trap.y - player.y,
      dist = Math.hypot(dx, dy);
    if (dist > 0.6 && dist < pullR) {
      const step = Math.min(dist - 0.5, strength * 0.28 * dt);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
      world.arena.resolve(player, player.r);
    }
  }
}

function trapStrike(world, trap, skin, radius, enemyMul = 1, shotDetonated = false) {
  const player = world.player;
  world._src = "trap";
  if (
    !shotDetonated &&
    player.alive &&
    Math.hypot(player.x - trap.x, player.y - trap.y) < radius + player.r &&
    world.hurtPlayer(trapDamage(world, skin), trap.x, trap.y, "trap")
  )
    trapEffectsOnPlayer(world, skin, trap);
  const queryR = skin.chillHalo ? radius * skin.chillHalo : radius;
  const knock = skin.knock || 3.5;
  world.hash.query(trap.x, trap.y, queryR, (enemy) => {
    if (enemy.dead || enemy.boss) return;
    const dist = Math.hypot(enemy.x - trap.x, enemy.y - trap.y);
    if (dist <= radius + enemy.r) {
      world.hurtEnemy(
        enemy,
        enemy.maxHp * skin.frac * enemyMul,
        enemy.x - trap.x,
        enemy.y - trap.y,
        knock,
        false,
        "trap",
      );
      if (skin.special === "chill") enemy.slowT = Math.max(enemy.slowT, trap.fam === "mine" ? 3.2 : 2.4);
      else if (skin.special === "shock") enemy.slowT = Math.max(enemy.slowT, skin.daze || 1.4);
      else if (skin.special === "acid") {
        enemy.corrodeT = Math.max(enemy.corrodeT || 0, trap.fam === "mine" ? 4.5 : 3.5);
        enemy.corrode = true;
      } else if (skin.special === "burn" && !enemy.dead && !enemy.shielded) {
        enemy.burnT = Math.max(enemy.burnT || 0, trap.fam === "mine" ? 3.5 : 2.8);
        enemy.burnDps = Math.max(enemy.burnDps || 0, enemy.maxHp * 0.06);
        enemy.burnSrc = "trap";
      }
    } else if (skin.chillHalo && dist <= queryR + enemy.r) {
      enemy.slowT = Math.max(enemy.slowT, 2.0);
    }
  });
  // Moss Bog bog spout / spore vessel leaves a corrosive bog pool
  if (
    !shotDetonated &&
    skin.special === "acid" &&
    !world.markers.some((marker) => Math.hypot(marker.x - trap.x, marker.y - trap.y) < radius * 0.85 + 0.8)
  ) {
    const scale = skin.poolScale || 0.85;
    layTrapResidue(world.arena.acid, trap, { r: radius * scale, life: trap.fam === "mine" ? 8.5 : 7 });
  }
  // Snow Ridge frost vessel leaves a temporary ice patch
  if (!shotDetonated && skin.icePatch && world.arena.ice && world.arena.ice.length < 8) {
    layTrapResidue(world.arena.ice, trap, { r: radius * 0.72, life: 5.5 });
  }
  // Caldera slag fissure / ember vessel leaves a hostile smoldering ember pool that singes both enemies and the player
  if (!shotDetonated && skin.special === "burn" && world.burnPools && world.burnPools.length < 10) {
    layTrapResidue(world.burnPools, trap, {
      r: radius * (trap.fam === "mine" ? 0.92 : 0.82),
      life: skin.poolLife || 2.5,
      dps: 16 * (world.stats.dmgMul || 1),
      hostile: true,
      playerDps: 14,
    });
  }
  // Sun Dunes sun-rose / glass amphora calms nearby dust devils on burst
  if (skin.special === "glass" && world.arena.devils && world.arena.devils.length) {
    for (const devil of world.arena.devils) {
      const d = Math.hypot(devil.x - trap.x, devil.y - trap.y);
      if (d <= radius + devil.r + 1.8) devil.calmT = Math.max(devil.calmT || 0, 4.0);
    }
  }
  // Shot-detonated Sun Dunes vessel launches 4 radial sunglass splinters
  if (shotDetonated && skin.splinters && world.lances) {
    const dmg = 28 * (world.stats.dmgMul || 1);
    for (let i = 0; i < skin.splinters; i++) {
      const a = (i / skin.splinters) * TAU + 0.4;
      world.lances.push({
        id: world.nextId++,
        x: trap.x,
        y: trap.y,
        vx: Math.cos(a) * 15,
        vy: Math.sin(a) * 15,
        a,
        life: 0.7,
        dmg,
        from: -1,
        hits: 0,
        struck: new Set(),
      });
    }
  }
  world.emit("boom", { x: trap.x, y: trap.y, r: radius, kind: "trap" });
  world.emit("trapFire", {
    id: trap.id,
    fam: trap.fam,
    skin: trap.skin,
    x: trap.x,
    y: trap.y,
    r: radius,
    shot: shotDetonated,
  });
  // Chain reaction: a detonating mine ignites nearby armed mines on a crisp short fuse.
  if (trap.fam === "mine" && world.traps) {
    const chainR = radius + 1.1;
    for (const other of world.traps) {
      if (other === trap || other.fam !== "mine" || other.st !== "armed") continue;
      if (Math.hypot(other.x - trap.x, other.y - trap.y) <= chainR) {
        const otherSkin = TRAP_SKINS[other.skin];
        other.st = "fuse";
        other.t = Math.max(0, (otherSkin?.fuse || 0.45) - 0.22);
        world.emit("trapWarn", {
          id: other.id,
          fam: "mine",
          skin: other.skin,
          x: other.x,
          y: other.y,
          r: otherSkin?.r || other.r,
          delay: 0.22,
        });
      }
    }
  }
}

// Tactical vessel-sniping: player shots detonate armed proximity vessels (and enemy ember-pots / crucible bombs)
function rlShootTrap(world, bullet, prevX, prevY) {
  if (world.state !== "fight") return false;
  const segDx = bullet.x - prevX,
    segDy = bullet.y - prevY,
    segLen2 = segDx * segDx + segDy * segDy;
  for (const trap of world.traps) {
    if (trap.fam !== "mine" || (trap.st !== "armed" && trap.st !== "fuse")) continue;
    const along = segLen2 > 1e-8 ? clamp(((trap.x - prevX) * segDx + (trap.y - prevY) * segDy) / segLen2, 0, 1) : 0;
    const cx = prevX + segDx * along - trap.x,
      cy = prevY + segDy * along - trap.y,
      hitR = 0.62 + bullet.r;
    if (cx * cx + cy * cy <= hitR * hitR) {
      const skin = TRAP_SKINS[trap.skin];
      if (skin.pull) trapPull(world, trap, skin.pull * 1.6, skin.r * 1.4, false, 0.16);
      trapStrike(world, trap, skin, skin.r * 1.15, 1.5, true);
      trap.st = "gone";
      trap.t = 0;
      trap.respawn = (world.wave > 20 ? 7 : 10) + (trap.id % 4) * 0.6;
      return true;
    }
  }
  // Shootable enemy hazards: Mine Cart Ember-Pots & Ash Tyrant Crucible Bombs
  if (world.hazards && world.hazards.length) {
    for (const h of world.hazards) {
      if (!h.shootable || h.t >= h.delay) continue;
      const along = segLen2 > 1e-8 ? clamp(((h.x - prevX) * segDx + (h.y - prevY) * segDy) / segLen2, 0, 1) : 0;
      const cx = prevX + segDx * along - h.x,
        cy = prevY + segDy * along - h.y,
        hitR = (h.hitR || 0.7) + bullet.r;
      if (cx * cx + cy * cy <= hitR * hitR) {
        h.t = h.delay;
        h.shotByPlayer = true;
        return true;
      }
    }
  }
  return false;
}

function aimBeamAtPlayer(arena, trap, skin, player, warn) {
  if (!player || !player.alive) return trap.a;
  const dist = Math.hypot(player.x - trap.x, player.y - trap.y);
  // Keep explicit angle if a test or scripted setup places the emitter directly on the player.
  if (dist < 0.5) return trap.a;
  const toPlayer = Math.atan2(player.y - trap.y, player.x - trap.x);
  const sweepSign = (skin.rot || 1) * trap.dir >= 0 ? 1 : -1;
  // Lead slightly behind the player so the beam sweeps right across their position once live.
  const lead = skin.swing ? 0.34 : Math.min(1.15, Math.abs(skin.rot || 0.6) * (warn + skin.dur * 0.38));
  const candidates = [
    toPlayer - sweepSign * lead,
    toPlayer - sweepSign * (lead * 0.45),
    toPlayer,
    Math.atan2(2 - trap.y, -trap.x),
    trap.a,
  ];
  for (const ang of candidates) {
    if (arena.rayLen(trap.x, trap.y, ang, skin.len) >= 6) return ang;
  }
  return toPlayer;
}

function rlUpdateTraps(world, dt) {
  if (!world.traps.length || world.state !== "fight") return;
  const p = pace(world.wave, (world.mods && world.mods.extraTraps) || 0),
    player = world.player;
  for (const trap of world.traps) {
    const skin = TRAP_SKINS[trap.skin];
    trap.t += dt;
    if (trap.fam === "floor") {
      // Non-hunting floor plates wake up quickly if the player steps across them while dormant.
      if (
        trap.st === "idle" &&
        !trap.hunt &&
        player.alive &&
        trap.wait - trap.t > 0.35 &&
        Math.hypot(player.x - trap.x, player.y - trap.y) < skin.r + 1.15
      ) {
        trap.wait = trap.t + 0.35;
      }
      if (trap.st === "idle" && trap.t >= trap.wait) {
        if (trap.hunt && player.alive) {
          const spot = findHuntingTrapSite(world, trap, skin);
          if (!spot) {
            trap.t = 0;
            trap.wait = 1;
            continue;
          }
          Object.assign(trap, spot);
        }
        trap.st = "warn";
        trap.t = 0;
        trap.delay = Math.max(0.7, skin.warn * p.warn);
        world.emit("trapWarn", {
          id: trap.id,
          fam: "floor",
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          r: skin.r,
          delay: trap.delay,
        });
      } else if (trap.st === "warn") {
        if (skin.pull) trapPull(world, trap, skin.pull, skin.r * 1.55, true, dt);
        if (trap.t >= trap.delay) {
          trapStrike(world, trap, skin, skin.r);
          trap.st = "idle";
          trap.t = 0;
          trap.wait = skin.cd * p.cd * (0.85 + 0.3 * ((trap.id * 0.618) % 1));
        }
      }
    } else if (trap.fam === "beam") {
      if (trap.st === "idle" && trap.t >= trap.wait) {
        trap.st = "live";
        trap.t = 0;
        const warn = Math.max(0.7, skin.warn * p.warn);
        trap.a = aimBeamAtPlayer(world.arena, trap, skin, player, warn);
        world._src = "trap";
        world.beam({
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          a: trap.a,
          len: skin.len,
          w: skin.w,
          warn,
          dur: skin.dur,
          rot: skin.rot * trap.dir,
          swing: skin.swing || 0,
          dmg: trapDamage(world, skin),
          fromTrap: true,
          special: skin.special || null,
        });
        if (world.wave > 20)
          world.beam({
            skin: trap.skin,
            x: trap.x,
            y: trap.y,
            a: trap.a + Math.PI / 2,
            len: skin.len,
            w: skin.w,
            warn,
            dur: skin.dur,
            rot: skin.rot * trap.dir,
            swing: skin.swing || 0,
            dmg: trapDamage(world, skin),
            fromTrap: true,
            special: skin.special || null,
          });
        trap.span = warn + skin.dur;
        world.emit("trapWarn", {
          id: trap.id,
          fam: "beam",
          skin: trap.skin,
          x: trap.x,
          y: trap.y,
          a: trap.a,
          len: skin.len,
          delay: warn,
          dur: skin.dur,
        });
      } else if (trap.st === "live" && trap.t >= trap.span) {
        trap.st = "idle";
        trap.t = 0;
        trap.dir = -trap.dir;
        trap.wait = skin.cd * p.cd;
      }
    } else if (trap.fam === "mine") {
      if (trap.st === "unarmed" && trap.t >= skin.arm) {
        trap.st = "armed";
        trap.t = 0;
        world.emit("trapArm", { id: trap.id, fam: "mine", skin: trap.skin, x: trap.x, y: trap.y, r: skin.r });
      } else if (trap.st === "armed") {
        let set = player.alive && Math.hypot(player.x - trap.x, player.y - trap.y) < skin.trig;
        if (!set)
          world.hash.query(trap.x, trap.y, skin.trig, (enemy) => {
            if (!set && !enemy.dead && !enemy.boss && Math.hypot(enemy.x - trap.x, enemy.y - trap.y) < skin.trig * 0.8)
              set = true;
          });
        if (set) {
          trap.st = "fuse";
          trap.t = 0;
          world.emit("trapWarn", {
            id: trap.id,
            fam: "mine",
            skin: trap.skin,
            x: trap.x,
            y: trap.y,
            r: skin.r,
            delay: skin.fuse,
          });
        }
      } else if (trap.st === "fuse") {
        if (skin.pull) trapPull(world, trap, skin.pull, skin.r * 1.45, false, dt);
        if (trap.t >= skin.fuse) {
          trapStrike(world, trap, skin, skin.r);
          trap.st = "gone";
          trap.t = 0;
          trap.respawn = (world.wave > 20 ? 7 : 10) + (trap.id % 4) * 0.6;
        }
      } else if (trap.st === "gone" && trap.t >= trap.respawn) {
        const rng = makeRng(
          hashString(world.seed + ":mine:" + world.wave + ":" + trap.id + ":" + Math.floor(world.time)),
        );
        const reserved = world.placementReservations(trap);
        reserved.push({ x: player.x, y: player.y, r: 3.2 }, ...world.enemies.filter((enemy) => !enemy.dead));
        // Mid-fight mine respawns can reclaim the center of the arena (keeping safe clearance from player's live spot).
        const spot = findTrapSite(world.arena, skin, rng, reserved, false);
        trap.t = 0;
        if (!spot) {
          trap.respawn = 1.5;
          continue;
        }
        Object.assign(trap, spot);
        trap.st = "unarmed";
      }
    }
  }
}

function findHuntingTrapSite(world, trap, skin) {
  const { arena, player } = world;
  const reserved = world.placementReservations(trap);
  const radius = trapRadius(skin) + 0.45;
  const tx = clamp(player.x + player.vx * 0.42, -arena.W + radius, arena.W - radius);
  const ty = clamp(player.y + player.vy * 0.42, -arena.H + radius, arena.H - radius);
  return arena.nearbyPoint(tx, ty, radius, 5.5, reserved, trap.id * 2.4);
}

export { TRAP_SKINS, TRAP_FROM, rlPlanTraps, rlUpdateTraps, rlShootTrap, trapFootprints };
