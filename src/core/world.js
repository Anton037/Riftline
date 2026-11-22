// The simulation world (World): player, enemies, bullets, pickups, waves and states. Runs without
// rendering.

import { enemyDefs, bossOrder, biomeVariants, bossDefs, bossByBiome, BOSS_SLOT_HP } from "../data/enemies.js";
import { clamp, TAU, turnToward, hashString, angleDiff, makeRng, dampFactor, own } from "./util.js";
import { updateEnemy, updateBoss, initBoss } from "./ai.js";
import { RL_BIOME_INFO, biomesById, planBiomeRoute, biomeList } from "../data/biomes.js";
import { weaponDefs } from "../data/weapons.js";
import { projectileFor } from "../data/combat-effects.js";
import {
  waveEvents,
  EVENT_CHANCE,
  planWave,
  rollUpgradeOffer,
  set_RL_BIOME_MIX_CUR,
  RL_BIOME_EVENT,
  rlBiomeStart,
  rlEnemyFrom,
} from "./waves.js";
import { threatMods } from "../data/progression.js";
import { upgradesById, upgradeList } from "../data/upgrades.js";
import { Arena, buildLayout, SpatialHash, rlAddHazard250 } from "./arena.js";
import { computeStats } from "./stats.js";
import { BURST_WINDOW, burstFraction, endlessHpBoost } from "./difficulty.js";
import { rlPlanTraps, rlUpdateTraps, rlShootTrap, TRAP_FROM } from "./traps.js";
import { walkStep } from "./walk.js";
import {
  bossCardOffer,
  bossCardKill,
  bossCardBossHit,
  bossCardNova,
  novaBlast,
  resetBossCards,
  updateBossCards,
  BOSS_CARD_CHANCE,
} from "./boss-cards.js";
import { rlMutatorsFor } from "./mutators.js";
import { runHooks } from "./run-hooks.js";
import {
  triggerHeatSink,
  rlNearActiveHazard,
  checkDashHeatSink,
  starfallHarvest,
  updateCaravan,
  ringCourtyardBell,
  courtyardBellPulse,
  overpressureFumarole,
  updateFeatures,
  triggerBiomeProp,
  fireBiomeProp,
  updateBiomeProps,
  updateHazards,
  startBiomeEvent,
  tickBiomeEvent,
} from "./world-hazards.js";

function rlCacheShards(world, value) {
  return Math.round(value * Math.max(1, world.stats.cacheValue || 1));
}
const RL_HAZARD_SRC = new Set(["lava", "shock", "acid", "trap", "devil"]);
const SHORT_R = 1.6,
  SHORT_DELAY = 1.1;

const RL_SLIP_TIME = 1.0,
  RL_COAT_MAX = 6;

function rlStarterKit(world, count) {
  const rng = makeRng(hashString(world.seed + ":kit")),
    pool = upgradeList.filter(
      (upgrade) =>
        upgrade.rarity === 1 &&
        !upgrade.evo &&
        !upgrade.repeat &&
        upgrade.id !== "heal" &&
        (!upgrade.weapon || upgrade.weapon === world.weapon),
    ),
    out = [];
  for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0].id);
  return out;
}

function rlChipDamage(player, dmg) {
  const sum = (player.chipAcc || 0) + Math.max(0, dmg),
    whole = Math.floor(sum + 1e-9);
  player.chipAcc = Math.max(0, sum - whole);
  return whole;
}

let SEP_SELF = null;
function sepOther(other) {
  const enemy = SEP_SELF;
  if (other === enemy || other.dead || other.id < enemy.id) return;
  const dx = other.x - enemy.x,
    dy = other.y - enemy.y,
    minDist = enemy.r + other.r,
    distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return;
  const dist = Math.sqrt(distSq) || 0.001,
    push = (minDist - dist) * 0.5,
    massA = enemy.boss ? 20 : enemy.r * enemy.r,
    massB = other.boss ? 20 : other.r * other.r,
    massSum = massA + massB,
    nx = distSq > 1e-6 ? dx / dist : 1,
    ny = distSq > 1e-6 ? dy / dist : 0;
  enemy.x -= nx * push * 2 * (massB / massSum);
  enemy.y -= ny * push * 2 * (massB / massSum);
  other.x += nx * push * 2 * (massA / massSum);
  other.y += ny * push * 2 * (massA / massSum);
}

const RL_THAW_PERIOD = 20,
  RL_THAW_K = 0.4,
  RL_THAW_AURORA = 1.35;

const comboRewards = [
  [10, 5],
  [25, 12],
  [50, 26],
  [100, 55],
  [150, 95],
  [250, 175],
];
const RL_RUSHERS = new Set(["bomber", "charger", "striker", "leaper", "sapper"]);
const rlStep = 1 / 60,
  PLAYER_RADIUS = 0.55,
  MAX_PLAYER_BULLETS = 420,
  MAX_ENEMY_BULLETS = 360,
  blastSources = {
    nova: "nova",
    inferno: "inferno",
    pop: "pop",
    bomber: "pop",
    payload: "payload",
    rocket: "weapon",
    singularity: "grenade",
    brood: "brood",
    overload: "overload",
    reactive: "reactive",
    surge: "surge",
    tribute: "tribute",
  },
  SING_DAMAGE = 90,
  SING_PULL_TIME = 1.5,
  SING_PULL_RADIUS = 1.7,
  SING_PULL = 50,
  World = class {
    constructor(opts) {
      let snap = opts.snap || null;
      this.seed = (snap ? snap.seed : opts.seed) >>> 0;
      this.weapon = own(weaponDefs, snap ? snap.weapon : opts.weapon) ? (snap ? snap.weapon : opts.weapon) : "pulse";
      this.threat = clamp((snap ? snap.threat : opts.threat) | 0, 0, 5);
      this.tm = threatMods(this.threat);
      this.ws = { ...(opts.ws || {}) };
      this.up = snap ? { ...snap.up } : {};
      this.wave = snap ? snap.wave : 1;
      this.endless = snap ? !!snap.endless : false;
      this.time = (snap && snap.time) || 0;
      this.kills = (snap && snap.kills) || 0;
      this.shards = (snap && snap.shards) || 0;
      this.shardFrac = (snap && +snap.shardFrac) || 0;
      this.rerolls = snap && snap.rerolls != null ? snap.rerolls | 0 : 1 + (this.ws.reroll || 0);
      // 3.25.0: the upgrades banished in this run (never offered again) and the banishes that are left
      this.banished =
        snap && Array.isArray(snap.banished) ? snap.banished.filter((id) => typeof id === "string").slice(0, 6) : [];
      this.banishes = snap && snap.banishes != null ? snap.banishes | 0 : 2 * (this.ws.banish || 0);
      this.revived = snap ? !!snap.revived : false;
      this.bossKills = snap ? [...(snap.bossKills || [])] : [];
      this.flawless = (snap && snap.flawless) || 0;
      this.legendaries = (snap && snap.legendaries) || 0;
      this.dmgDealt = (snap && snap.dmgDealt) || 0;
      this.bestCombo = (snap && snap.bestCombo) || 0;
      this.evolved = (snap && snap.evolved) || 0;
      this.bossLuck = snap && Number.isFinite(snap.bossLuck) ? clamp(snap.bossLuck, 0, 1) : BOSS_CARD_CHANCE;
      this.offerExclusive = null;
      this.broodN = (snap && snap.broodN) | 0;
      this.tributeN = (snap && snap.tributeN) | 0;
      this.fangN = (snap && snap.fangN) | 0;
      this.hitstopT = 0;
      this.starVaultUnlocked = !!opts.starVaultUnlocked;
      this.runStats = {
        dmgTaken: (snap && snap.runStats && Number(snap.runStats.dmgTaken)) || 0,
        dashes: (snap && snap.runStats && Number(snap.runStats.dashes)) || 0,
        critHits: (snap && snap.runStats && Number(snap.runStats.critHits)) || 0,
      };
      // Death recap: last hits and totals by source over the run
      this.hitLog = [];
      this.takenBy = {};
      this.dmgSrc = {};
      if (snap && snap.dmgSrc && typeof snap.dmgSrc == "object")
        for (let src in snap.dmgSrc) {
          if (Number.isFinite(snap.dmgSrc[src])) {
            this.dmgSrc[src] = snap.dmgSrc[src];
          }
        }
      if (snap && Array.isArray(snap.hitLog))
        for (const h of snap.hitLog)
          if (h && typeof h.src === "string" && Number.isFinite(h.dmg))
            this.hitLog.push({
              t: +h.t || 0,
              wave: h.wave | 0,
              src: h.src,
              dmg: +h.dmg,
              chip: !!h.chip,
              n: Math.max(1, h.n | 0),
            });
      if (snap && snap.takenBy && typeof snap.takenBy == "object")
        for (let src in snap.takenBy) {
          if (Number.isFinite(snap.takenBy[src])) {
            this.takenBy[src] = snap.takenBy[src];
          }
        }
      this.route = planBiomeRoute(makeRng(hashString(this.seed + ":route")));
      this.combo = 0;
      this.comboT = 0;
      this.trails = [];
      this.hold = false;
      this.nextId = 1;
      this.fx = [];
      this.stats = computeStats(this.weapon, this.up, this.ws);
      this.player = {
        x: 0,
        y: 2,
        vx: 0,
        vy: 0,
        r: PLAYER_RADIUS,
        hp: this.stats.maxHp,
        face: -Math.PI / 2,
        aim: -Math.PI / 2,
        fireT: 0,
        dashT: 0,
        dashCdT: 0,
        dashN: this.stats.dashCharges || 1,
        dashX: 0,
        dashY: 0,
        dashId: 0,
        iT: 0,
        shieldT: 0,
        shield: false,
        nova: 0,
        alive: true,
        moving: false,
        firing: false,
        rushN: 0,
        rushT: 0,
        regenAcc: 0,
        wings: [],
        target: null,
        hurtT: 0,
        trailT: 0,
        portalT: 0,
        onIce: false,
        shotN: 0,
        gadgetN: this.stats.gadgetMax,
        gadgetT: 0,
        slowT: 0,
        slowKind: "chill",
        acidT: 0,
        inAcid: false,
        chipAcc: 0,
        brood: [],
        stride: 0,
        air: false,
        tractionT: 0,
        hopT: 0,
        gildT: 0,
        festT: 0,
        chronoCd: 0,
        heatSinkCd: 0,
        reactiveGrazeCd: 0,
        kilnAcc: 0,
        tributeT: 0,
        leylineT: 0,
        echoQueue: [],
        bossHits: 0,
      };
      if (snap) {
        this.player.hp = clamp(snap.hp, 1, this.stats.maxHp);
      }
      this.chronoT = 0;
      this.singularities = [];
      resetBossCards(this);
      this.traps = [];
      this.offer = null;
      this.offerBoss = false;
      this.state = "fight";
      this.stateT = 0;
      this.startWave(this.wave, snap ? snap.nova : null, !!snap && !Array.isArray(snap.offer));
      if (snap && Array.isArray(snap.offer)) {
        let offer = snap.offer.filter((id) => own(upgradesById, id));
        this.fx.length = 0;
        this.plan = [];
        this.planIdx = 0;
        this.bossPending = null;
        this.offerBoss = !!snap.offerBoss;
        this.state = "choose";
        if (Number.isInteger(snap.offerRng)) this.rng = makeRng(snap.offerRng);
        this.offer = offer.length ? offer : this.makeOffer();
        this.offerExclusive = this.offer.find((id) => upgradesById[id].boss) || null;
        if (!this.offer.length) this.skipEmptyChoice();
      }
    }
    triggerHitstop(secs = 0.025) {
      this.hitstopT = Math.max(this.hitstopT || 0, secs);
    }
    emit(kind, data) {
      data = data || {};
      data.k = kind;
      if (data.src == null && this._src) data.src = this._src;
      this.fx.push(data);
      return data;
    }
    // `nova`: the saved charge of a resumed run (null for a new wave); `resumed`: the wave is rebuilt
    // from a snapshot of its start, so it gets the same caches and bonus group as the first time
    startWave(wave, nova, resumed = false) {
      // 2.5.0 C: an arena changed by a biome event is never reused (startWave of the same wave again)
      if (this.arena && this.arena.rlEvent) {
        this.arena.key += ":used";
      }
      this.bioEv = null;
      // 2.5.0 B: a fresh run (not a resumed one: that passes its saved Nova charge) gets its Starter
      // Kit before the first wave is set up, so shield or HP upgrades from the kit count from the start
      const kit = (this.ws.starterKit || 0) | 0;
      let given = null;
      if (kit > 0 && wave === 1 && nova == null && !this.kitGiven && !Object.keys(this.up).length) {
        given = rlStarterKit(this, Math.min(3, kit));
        for (const id of given) this.up[id] = (this.up[id] || 0) + 1;
        this.stats = computeStats(this.weapon, this.up, this.ws);
        this.player.hp = this.stats.maxHp;
      }
      this.kitGiven = true;
      // 2.5.0 B: Emergency Shield is ready again in every wave
      this.barrierUsed = false;
      this.barrierT = 0;
      this.barrierOwnShield = false;
      this.barrierShieldT = 0;
      this.attuned = false;
      // 2.4.0: the biome's enemy mix weights the spawn plan (planWave reads it while the wave is set up)
      set_RL_BIOME_MIX_CUR(RL_BIOME_INFO[this.biomeFor(wave).id]?.mix || null);
      try {
        this.wave = wave;
        this.rng = makeRng(hashString(this.seed + ":" + wave));
        let biome = this.biomeFor(wave),
          // 3.30.0: built ahead while the upgrade choice was open (prefetchLayout), else now.
          // 5.1.1: the prefetch carries the Arena and SpatialHash built from this exact layout.
          ahead = this.nextLayout && this.nextLayout.wave === wave ? this.nextLayout : null,
          layout = ahead ? ahead.layout : buildLayout(biome, this.seed, wave, wave === 1 || !!this.bossFor(wave));
        this.nextLayout = null;
        if (!this.arena || this.arena.key !== layout.key) {
          this.arena = ahead ? ahead.arena : new Arena(biome, layout);
          this.hash = ahead ? ahead.hash : new SpatialHash(layout.W, layout.H, 2.5);
        } else {
          this.arena.resetProps?.();
        }
        this.enemies = [];
        this.pb = [];
        this.eb = [];
        this.pickups = [];
        this.beams = [];
        this.hazards = [];
        this.markers = [];
        this.trails = [];
        resetBossCards(this);
        this.boss = null;
        this.combo = 0;
        this.comboT = 0;
        let player = this.player;
        player.x = 0;
        player.y = 2;
        player.vx = player.vy = 0;
        player.dashT = 0;
        player.dashCdT = 0;
        player.dashN = this.stats.dashCharges || 1;
        player.iT = 1;
        player.target = null;
        player.alive = true;
        player.shield = this.stats.shieldCd > 0;
        // 3.0.0: every wave starts with all charges of the gadget
        player.gadgetN = this.stats.gadgetMax;
        player.gadgetT = 0;
        this.singularities = [];
        player.shieldT = 0;
        player.tractionT = 0;
        player.hopT = 0;
        player.gildT = 0;
        player.festT = 0;
        player.chronoCd = 0;
        player.heatSinkCd = 0;
        player.reactiveGrazeCd = 0;
        player.kilnAcc = 0;
        player.tributeT = 0;
        player.leylineT = 0;
        player.echoQueue = [];
        player.bossHits = 0;
        this.caravan = null;
        this.starfallN = 0;
        let novaFloor = 25 * (this.ws.nova || 0);
        player.nova = nova ?? Math.max(player.nova, novaFloor);
        this.waveT = 0;
        this.waveDmg = 0;
        // 3.3.0: the Endless mutators of this wave (see mutators.js)
        const mutators = rlMutatorsFor(this.seed, wave);
        this.mods = mutators.mods;
        this.hpMul =
          (1 + 0.085 * (wave - 1) + 0.0058 * (wave - 1) * (wave - 1)) *
          this.tm.hp *
          endlessHpBoost(wave) *
          (1 + 0.25 * (this.mods.armored || 0));
        this.dmgMul = (1 + 0.035 * (wave - 1)) * this.tm.dmg * (1 + 0.1 * (this.mods.barrage || 0));
        this.shotMul = 1 + 0.2 * (this.mods.barrage || 0);
        this.stragglerT = 0;
        let boss = this.bossFor(wave);
        // Mirage Winds Endless Omen: spawns a wandering sunlit dust devil on non-boss waves
        if (this.mods.barrage && !boss && this.arena) {
          if (!this.arena.devils) this.arena.devils = [];
          rlAddHazard250(
            this.arena,
            "devils",
            makeRng(hashString(this.seed + ":mirage-omen:" + wave)),
            this.arena.obs,
            this.arena.W,
            this.arena.H,
            { avoid: [{ x: player.x, y: player.y, r: 4 }], cap: 9, tries: 40 },
          );
        }
        this.event = this.eventFor(wave);
        this.rainT = 1.5;
        this.champion = null;
        let champRng = makeRng(hashString(this.seed + ":champ:" + wave));
        this.championPending =
          !boss && !this.event && wave >= 3 && (wave - 1) % 5 >= 2 && champRng.chance(0.4)
            ? this.championType(biome.id, wave, champRng)
            : null;
        this.plan =
          boss === "wyrm"
            ? []
            : planWave(this.rng, wave, this.tm, !!boss, this.event ? waveEvents[this.event].plan : {});
        this.planIdx = 0;
        this.planTotal = this.plan.reduce((sum, group) => sum + group.members.length, 0);
        // Biome traps unlock early (World 1: floor W2, mine W4, beam W7)
        this.traps = rlPlanTraps(this, wave, !!boss);
        this.groupT = 1.1;
        this.bossPending = boss;
        this.state = "fight";
        this.stateT = 0;
        this.emit("wave", { n: wave, boss: boss, biome: biome.id, event: this.event });
        if (mutators.gained && !resumed)
          this.emit("mutator", { id: mutators.gained, level: this.mods[mutators.gained], x: player.x, y: player.y });
        if (nova == null && this.stats.novaStart > 0) player.nova = Math.min(100, player.nova + this.stats.novaStart);
        const director = this.arena?.director,
          mode = director?.mode || "standard";
        this.waveMode = mode;
        this.waveIntensity = director?.intensity || 0;
        const fresh = nova == null || resumed;
        if (fresh && !this.bossPending && !this.boss && wave >= 2) {
          const count = wave % 6 === 0 ? 2 : 1;
          for (let i = 0; i < count; i++) {
            const spot = this.arena.freePoint(
              makeRng(hashString(this.seed + ":cache:" + wave + ":" + i)),
              player.x,
              player.y,
              6.2,
              0.35,
            );
            if (!spot) continue;
            const value = this.rng.chance(0.12) ? 25 : this.rng.chance(0.35) ? 10 : 5,
              kind = this.rng.chance(0.12) ? "heal" : "shard";
            const pickup = this.mkPickup(kind, spot.x, spot.y, kind === "heal" ? 20 : rlCacheShards(this, value));
            pickup.vx = 0;
            pickup.vy = 0;
            pickup.cache = true;
            this.pickups.push(pickup);
          }
        }
        if (fresh && !this.bossPending && !this.boss && wave >= 2) {
          const extra =
            Math.max(0, this.stats.cacheBonus || 0) +
            Math.max(0, this.stats.cacheCount || 0) +
            (mode === "cache-run" ? 2 : 0) +
            (mode === "salvage" ? 2 : 0) +
            (wave % 9 === 0 ? 1 : 0);
          const cacheRng = makeRng(hashString(this.seed + ":cache22:" + wave));
          for (let i = 0; i < extra; i++) {
            const spot = this.arena.freePoint(cacheRng, player.x, player.y, 6.2, 0.35);
            if (!spot) continue;
            const kind = cacheRng.chance(0.18) ? "heal" : "shard",
              value = kind === "heal" ? 20 : rlCacheShards(this, 5 + 3 * (this.stats.cacheBonus || 0));
            const pickup = this.mkPickup(kind, spot.x, spot.y, value);
            pickup.vx = 0;
            pickup.vy = 0;
            pickup.cache = true;
            this.pickups.push(pickup);
          }
          const bonusPool =
            {
              barricade: ["charger", "brute"],
              crossfire: ["sentinel", "turret", "drone"],
              "cache-run": ["carrier", "mender", "beacon"],
              riftwalk: ["phantom", "striker", "weaver"],
              gauntlet: ["carrier", "leaper", "driller"],
              shatter: ["phantom", "splitter", "driller"],
              deadzone: ["sapper", "brute", "beacon"],
              minefield: ["sapper", "drone"],
              zigzag: ["weaver", "striker"],
              salvage: ["carrier", "beacon"],
              turbulence: ["sentinel", "drone", "weaver"],
              fortress: ["driller", "bulwark", "beacon"],
            }[mode] || [];
          const avail = bonusPool.filter((id) => enemyDefs[id] && rlEnemyFrom(id, biome.id, wave) <= wave);
          if (wave >= 12 && avail.length) {
            const members = [{ type: cacheRng.pick(avail), elite: false }];
            if (wave >= 24 && cacheRng.chance(0.45)) members.push({ type: cacheRng.pick(avail), elite: false });
            this.plan.push({ gap: 2.35, members });
            this.planTotal += members.length;
          }
        }
      } finally {
        set_RL_BIOME_MIX_CUR(null);
      }
      if (given && given.length) {
        this.emit("kit", { ids: given });
      }
      // 2.5.0 C: the biome event of this wave
      const eventDef = this.event && waveEvents[this.event];
      if (eventDef && eventDef.biome && eventDef.biome === this.arena.biome.id && !this.bossPending) {
        this.startBiomeEvent(this.event, wave);
      }
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity)
      // 3.45.1: the hooks are null unless the test session enabled the monitor - a player's frame
      // must survive that even if a future change re-breaks the enable/start pairing
      if (runHooks.world === this && runHooks.beginWave)
        try {
          runHooks.beginWave(this);
        } catch (err) {
          if (runHooks.issue) runHooks.issue("WARN", "monitor", "monitor exception: " + err.message);
        }
    }
    championType(biome, wave, rng) {
      // 2.4.0: the pack biomes are gone; the five biomes also draw champions from the later enemies
      // Lantern Courtyard has its own clockwork garrison pool for Endless returns
      const special = {
        courtyard: ["gunner", "bomber", "brute", "sniper", "sentinel"],
        shelf: ["bulwark", "gunner", "sentinel", "turret"],
        core: ["striker", "brute", "phantom", "weaver"],
        marsh: ["splitter", "brute", "sapper", "carrier"],
        // 3.49.0: the Caldera's champions: the burning dead the Tyrant calls up
        caldera: ["gunner", "brute", "bomber", "sapper", "charger"],
        flats: ["gunner", "charger", "driller", "mortar", "sniper", "brute"],
      }[biome];
      if (special) {
        const valid = special.filter((id) => enemyDefs[id] && enemyDefs[id].from <= wave);
        if (valid.length) return rng.pick(valid);
      }
      let pool = (
        {
          courtyard: ["grunt", "gunner"],
          shelf: ["bulwark", "gunner"],
          core: ["striker", "brute"],
          marsh: ["splitter", "brute"],
          caldera: ["grunt", "gunner"],
          flats: ["gunner", "charger"],
        }[biome] || ["grunt"]
      ).filter((type) => enemyDefs[type].from <= wave);
      return pool.length ? rng.pick(pool) : "grunt";
    }
    eventFor(wave) {
      // 2.5.0 C: a hazard biome's visit gets its biome event, and no other event right next to it
      const eventWave = this.biomeEventWave(wave);
      if (eventWave && eventWave === wave) return RL_BIOME_EVENT[this.biomeFor(wave).id];
      if (eventWave && Math.abs(eventWave - wave) === 1) return null;
      let eligible = (waveNo) => waveNo >= 3 && !this.bossFor(waveNo) && (waveNo - 1) % 5 !== 0,
        eventRng = (waveNo) => makeRng(hashString(this.seed + ":event:" + waveNo));
      if (
        !eligible(wave) ||
        eventRng(wave).next() >= EVENT_CHANCE ||
        (eligible(wave - 1) && eventRng(wave - 1).next() < EVENT_CHANCE)
      )
        return null;
      let rng = eventRng(wave);
      rng.next();
      return ["gilded", "starfall"][Math.floor(rng.next() * 2)];
    }
    /* 3.22.0: what the next wave brings (a look ahead for the upgrade choice; it changes nothing): the biome and whether
       it is a new one, the boss, the wave event, the mutator that joins in Endless, and whether traps are on the floor */
    previewWave(n) {
      const biome = this.biomeFor(n),
        boss = this.bossFor(n),
        mutators = rlMutatorsFor(this.seed, n);
      return {
        wave: n,
        biome: biome.id,
        newBiome: n > 1 && this.biomeFor(n - 1).id !== biome.id,
        boss: boss || null,
        event: boss ? null : this.eventFor(n),
        mutator: mutators.gained || null,
        traps: n >= TRAP_FROM.floor && (!boss || n >= 15),
      };
    }
    biomeFor(wave) {
      const cycle = Math.floor((Math.max(1, wave) - 1) / 5);
      return biomesById[this.route[cycle % this.route.length]] || biomeList[0];
    }
    bossFor(wave) {
      if (wave % 5 !== 0) return null;
      const byBiome = bossByBiome[this.biomeFor(wave).id];
      if (byBiome) return byBiome;
      return bossOrder[(wave / 5 - 1) % bossOrder.length];
    }
    // 2.5.0 C: the wave of the current biome visit that gets its biome event (0: none)
    biomeEventWave(wave) {
      const id = RL_BIOME_EVENT[this.biomeFor(wave).id];
      if (!id) return 0;
      const start = rlBiomeStart(wave),
        eventWave = start + 1 + Math.floor(makeRng(hashString(this.seed + ":biome-event:" + start)).next() * 3);
      return this.bossFor(eventWave) ? 0 : eventWave;
    }
    // 2.5.0 C: the wave from which an enemy type can spawn in this run's biome at `wave`
    enemyFrom(type, wave) {
      return rlEnemyFrom(type, this.biomeFor(wave).id, wave);
    }
    isFinalWave() {
      return !this.endless && this.wave >= 20;
    }
    snapshot() {
      let snap = {
        v: 1,
        seed: this.seed,
        weapon: this.weapon,
        threat: this.threat,
        wave: this.wave,
        endless: this.endless,
        up: { ...this.up },
        hp: Math.max(1, Math.round(this.player.hp)),
        shards: this.shards,
        // 3.34.0: the part of a shard owed by the kills so far (a resumed run started it at 0 and dropped differently)
        shardFrac: this.shardFrac || 0,
        kills: this.kills,
        time: this.time,
        rerolls: this.rerolls,
        banished: [...this.banished],
        banishes: this.banishes,
        revived: this.revived,
        nova: Math.round(this.player.nova),
        bossKills: [...this.bossKills],
        flawless: this.flawless,
        legendaries: this.legendaries,
        dmgDealt: Math.round(this.dmgDealt),
        bestCombo: this.bestCombo,
        evolved: this.evolved,
        bossLuck: this.bossLuck,
        broodN: this.broodN | 0,
        tributeN: this.tributeN | 0,
        fangN: this.fangN | 0,
        runStats: {
          dmgTaken: Math.round(this.runStats.dmgTaken),
          dashes: this.runStats.dashes | 0,
          critHits: this.runStats.critHits | 0,
        },
        dmgSrc: Object.fromEntries(Object.entries(this.dmgSrc).map(([src, dmg]) => [src, Math.round(dmg)])),
        // 3.46.0: the recap survives a resume — the end screen used to show only the hits taken
        // after it (hitLog: at most twelve plain entries; takenBy: the totals by source)
        hitLog: this.hitLog.map((h) => ({ t: h.t, wave: h.wave, src: h.src, dmg: h.dmg, chip: h.chip, n: h.n })),
        takenBy: { ...this.takenBy },
      };
      if (this.state === "choose" && this.offer) {
        snap.offer = [...this.offer];
        snap.offerBoss = !!this.offerBoss;
        snap.offerRng = this.rng.state;
      }
      return snap;
    }
    choose(id) {
      if (this.state !== "choose" || !this.offer || !this.offer.includes(id)) return false;
      let upgrade = upgradesById[id],
        player = this.player,
        oldMaxHp = this.stats.maxHp;
      this.up[id] = (this.up[id] || 0) + 1;
      if (upgrade.rarity === 4) {
        this.legendaries++;
      }
      if (upgrade.rarity === 5) {
        this.evolved++;
      }
      const gadgetBefore = this.stats.gadgetMax,
        dashBefore = this.stats.dashCharges || 1;
      this.stats = computeStats(this.weapon, this.up, this.ws);
      // 3.0.0: a new gadget cell or dash charge comes charged
      player.gadgetN = Math.min(this.stats.gadgetMax, player.gadgetN + (this.stats.gadgetMax - gadgetBefore));
      player.dashN = Math.min(
        this.stats.dashCharges || 1,
        (player.dashN || 0) + Math.max(0, (this.stats.dashCharges || 1) - dashBefore),
      );
      if (id === "hp") {
        player.hp = Math.min(this.stats.maxHp, player.hp + 20 + (this.stats.maxHp - oldMaxHp - 20));
      }
      if (id === "heal") {
        player.hp = Math.min(this.stats.maxHp, player.hp + this.stats.maxHp * 0.45);
      }
      player.hp = Math.min(player.hp, this.stats.maxHp);
      this.offer = null;
      this.offerExclusive = null;
      this.emit("pick", { id: id, evo: upgrade.rarity === 5, boss: !!upgrade.boss });
      this.startWave(this.wave + 1);
      return true;
    }
    reroll() {
      if (this.state !== "choose" || this.rerolls <= 0) return false;
      this.rerolls--;
      this.offer = this.makeOffer(this.offer || []);
      this.emit("reroll");
      return true;
    }
    /* 3.25.0: banishes a card of the offer for the rest of the run (Banish Protocol): it is replaced by another card and the
       upgrade is never offered again. Not the boss card, not the last card of an offer. */
    banish(id) {
      const offer = this.offer;
      if (this.state !== "choose" || this.banishes <= 0 || !offer || !offer.includes(id)) return false;
      if (offer.length < 2 || (this.offerBoss && id === this.offerExclusive) || !upgradesById[id]) return false;
      this.banishes--;
      this.banished.push(id);
      const at = offer.indexOf(id),
        fresh = this.makeOffer([...offer]).find((card) => !offer.includes(card));
      if (fresh) offer[at] = fresh;
      else offer.splice(at, 1);
      this.emit("banish", { id });
      return true;
    }
    makeOffer(exclude = []) {
      let count = 3 + ((this.ws.insight || 0) > 0 ? 1 : 0);
      // Boss Waves grant a guaranteed Guardian Relic as a dedicated bonus slot (4th, or 5th with Insight)
      // so the Relic never crowds out normal upgrade progression!
      const exclusive = this.offerBoss ? this.offerExclusive : null;
      const picks = rollUpgradeOffer(
        this.rng,
        this.up,
        this.wave,
        this.player.hp / this.stats.maxHp,
        count,
        this.offerBoss,
        exclude,
        this.weapon,
        this.banished,
      );
      return exclusive ? [exclusive, ...picks] : picks;
    }
    // 2.9.1: opens the upgrade choice after a wave. When nothing is left to offer (every upgrade at its
    // maximum, hull healthy) there is nothing to choose: the empty screen used to hang the run for good.
    beginChoice() {
      this.offerExclusive = this.offerBoss ? bossCardOffer(this) : null;
      const offer = this.makeOffer();
      if (!offer.length) {
        this.skipEmptyChoice();
        return;
      }
      this.state = "choose";
      this.stateT = 0;
      this.offer = offer;
      this.emit("offer");
    }
    /* 3.30.0: builds the layout of the next wave ahead of time (main.js calls it while the upgrade choice is open). A layout
       only depends on the biome, the seed and the wave, so this changes nothing but when the work is done: building it took
       13 to 66 ms on a desktop CPU, a hitch at the moment a card was picked. 5.1.1: the layout key embeds the wave, so every
       wave also built a fresh Arena (flow field, biome props) and SpatialHash inside the transition frame - a visible freeze
       on phones. Both only read the layout (props are seeded from the arena key), so they are built here alongside it. */
    prefetchLayout() {
      const wave = this.wave + 1;
      if (this.state !== "choose" || (this.nextLayout && this.nextLayout.wave === wave)) return;
      const biome = this.biomeFor(wave),
        layout = buildLayout(biome, this.seed, wave, !!this.bossFor(wave));
      this.nextLayout = {
        wave,
        layout,
        arena: new Arena(biome, layout),
        hash: new SpatialHash(layout.W, layout.H, 2.5),
      };
    }
    // no cards: repair the hull a bit, pay a few shards and go on with the next wave
    skipEmptyChoice() {
      const player = this.player,
        heal = Math.round(this.stats.maxHp * 0.35),
        shards = 10 + Math.floor(this.wave / 2);
      player.hp = Math.min(this.stats.maxHp, player.hp + heal);
      this.shards += shards;
      this.offer = null;
      this.emit("maxed", { heal, shards });
      this.startWave(this.wave + 1);
    }
    continueEndless() {
      if (this.state === "victory") {
        this.endless = true;
        this.beginChoice();
      }
    }
    /* 3.32.0: the Endless button after the victory screen. The counters of the summary start again (shards, kills,
       bosses, damage, the death recap of the Endless part: 3.28.1), and so does the clock (restartClock). It lived in
       main.js until 3.32.0, and the tests called continueEndless() alone, so they played a different Endless than the
       players (the old clock and counters). Game and tests now use this. */
    enterEndless() {
      if (this.state !== "victory") return false;
      this.shards = 0;
      this.shardFrac = 0;
      this.kills = 0;
      this.bossKills = [];
      this.legendaries = 0;
      this.flawless = 0;
      this.restartClock();
      this.evolved = 0;
      this.dmgSrc = {};
      this.hitLog = [];
      this.takenBy = {};
      this.dmgDealt = 0;
      this.bestCombo = 0;
      this.runStats = { dmgTaken: 0, dashes: 0, critHits: 0 };
      this.continueEndless();
      return true;
    }
    // 3.7.1: the Endless part of a run starts its clock at 0 (game.endless: its summary counts only the Endless part).
    restartClock() {
      const shift = this.time;
      this.time = 0;
      if (this.player.dashAt != null) this.player.dashAt -= shift;
    }
    step(dt, input) {
      // 2.2.3: run monitor (only the live run's world is observed; self-test and snapshot-check
      // worlds are ignored by identity)
      const monitored = runHooks.world === this,
        fx0 = this.fx.length,
        dash0 = this.player.dashId,
        shards0 = this.shards,
        kills0 = this.kills;
      const stats = this.stats,
        player = this.player;
      // 2.5.0 B: the Emergency Shield barrier runs out
      if (this.barrierT > 0) {
        this.barrierT -= dt;
        if (this.barrierT <= 0) {
          this.barrierT = 0;
          if (this.barrierOwnShield) {
            const charged = (this.barrierShieldT || 0) + stats.barrierT;
            if (stats.shieldCd > 0 && charged >= stats.shieldCd) {
              player.shieldT = 0;
              this.emit("shieldUp");
            } else {
              player.shield = false;
              player.shieldT = stats.shieldCd > 0 ? charged : 0;
            }
          }
          this.barrierOwnShield = false;
        }
      }
      // Leyline Attunement: triggers only near active/charging hazards or within 2.2m of live features during combat
      this.attuned = stats.attuneDmg > 0 && this.state === "fight" && rlNearActiveHazard(this);
      const attuned = this.attuned,
        dmg = stats.dmgMul,
        regen = stats.regen,
        rate = stats.rateMul;
      if (attuned) {
        stats.dmgMul = dmg * (1 + stats.attuneDmg);
        stats.regen = (regen || 0) + stats.attuneRegen;
      }
      // Molten Anvil Ingot buff (tribute): +35% fire rate & weapon damage for 4s
      if (player.tributeT > 0 && this.state === "fight") {
        stats.dmgMul *= 1.35;
        stats.rateMul *= 1.35;
      }
      // Bellows Vent ('heatsink'): +25% / +45% fire rate while stoked
      if (player.heatT > 0 && this.state === "fight" && stats.heatSink) {
        stats.rateMul *= 1 + (stats.heatSink > 1 ? 0.45 : 0.25);
      }
      const wasDashing = player.dashT > 0;
      try {
        this.stateT += dt;
        if (this.state === "choose" || this.state === "victory") this.idle(dt);
        else {
          this.time += this.state === "dead" ? 0 : dt;
          this.waveT += dt;
          // Chrono Dash slows enemy world to 55% speed (balanced with 4.0s internal CD)
          let slow = this.chronoT > 0 ? 0.55 : 1;
          if (this.chronoT > 0) this.chronoT = Math.max(0, this.chronoT - dt);
          if (player.chronoCd > 0) player.chronoCd = Math.max(0, player.chronoCd - dt);
          if (player.heatSinkCd > 0) player.heatSinkCd = Math.max(0, player.heatSinkCd - dt);
          if (player.reactiveGrazeCd > 0) player.reactiveGrazeCd = Math.max(0, player.reactiveGrazeCd - dt);
          if (player.tributeT > 0) player.tributeT = Math.max(0, player.tributeT - dt);
          if (player.leylineT > 0) player.leylineT = Math.max(0, player.leylineT - dt);
          if (player.heatT > 0) player.heatT = Math.max(0, player.heatT - dt);
          if (player.slipT > 0) player.slipT = Math.max(0, player.slipT - dt);
          if (this.comboT > 0) {
            this.comboT -= dt;
            if (this.comboT <= 0) {
              if (this.combo >= 5) {
                this.emit("comboEnd", { n: this.combo });
              }
              this.combo = 0;
            }
          }
          if (this.player.alive) {
            this.updatePlayer(dt, input);
            // Delayed deterministic Echo-Bell volleys (0.10s after main shot)
            if (player.echoQueue && player.echoQueue.length && this.state === "fight") {
              let ew = 0;
              for (let i = 0; i < player.echoQueue.length; i++) {
                const eq = player.echoQueue[i];
                eq.t -= dt;
                if (eq.t <= 0) this.fire(eq.angle, eq.mul, true);
                else player.echoQueue[ew++] = eq;
              }
              player.echoQueue.length = ew;
            }
            if (player.dashT > 0) checkDashHeatSink(this);
            // Slipstream: trigger the full 1.0s post-dash window when the dash completes
            if (stats.slip && wasDashing && player.dashT <= 0) player.slipT = RL_SLIP_TIME;
          } else {
            this.player.vx *= 0.9;
            this.player.vy *= 0.9;
          }
          this.hash.build(this.enemies);
          if (this.state === "fight") {
            this.updateSpawns(dt);
            updateCaravan(this, dt);
          }
          this.arena.flow.update(this.player.x, this.player.y);
          let slowDt = dt * slow;
          for (let i = 0; i < this.enemies.length; i++) {
            let enemy = this.enemies[i];
            if (!enemy.dead) {
              this.statusTick(enemy, dt);
              if (!enemy.dead) {
                this._src = enemy.type;
                this._var = enemy.variant || null;
                if (enemy.boss) {
                  updateBoss(this, enemy, slowDt);
                } else {
                  updateEnemy(this, enemy, slowDt);
                }
                if (enemy.variant || enemy.champion) {
                  this.variantTick(enemy, slowDt);
                }
                this.moveEnemy(enemy, slowDt);
              }
            }
          }
          this._src = null;
          this._var = null;
          this.separate();
          this.hash.build(this.enemies);
          if (this.player.alive) {
            this.updateOrbitals(dt);
            this.updateWingman(dt);
            this.contactDamage();
          }
          this.updateTrails(dt);
          updateBossCards(this, dt);
          this.updatePBullets(dt);
          this.updateBiomeProps(dt);
          // 3.31.0: Chrono Dash slows the enemies' world, not the player's own Lodestone Chime
          this.updateSingularities(dt);
          this.updateEBullets(slowDt);
          this.updateBeams(slowDt);
          this.updateHazards(slowDt);
          rlUpdateTraps(this, slowDt);
          this.updatePickups(dt);
          this.updateMarkers(dt);
          this.updateFeatures(dt);
          if (this.event === "starfall" && this.state === "fight") {
            this.starfallHarvest(dt);
          }
          this.sweep();
          this.checkWaveEnd();
        }
      } finally {
        stats.dmgMul = dmg;
        stats.regen = regen;
        stats.rateMul = rate;
      }
      if (monitored && runHooks.step)
        try {
          runHooks.step(this, fx0, dash0, shards0, kills0, dt);
        } catch (err) {
          if (runHooks.issue) runHooks.issue("WARN", "monitor", "monitor exception: " + err.message);
        }
    }
    variantTick(enemy, dt) {
      if (enemy.spawnT > 0) return;
      let player = this.player;
      if (enemy.champion) {
        this.hash.query(enemy.x, enemy.y, 7, (ally) => {
          if (!ally.dead && ally !== enemy && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) < 7) {
            ally.rallyT = 0.3;
          }
        });
      }
      enemy.vt = (enemy.vt || 0) - dt;
      if (enemy.variant === "sunstruck" && enemy.vt <= 0) {
        // 3.53.0: the Glass Flats' variant: it gleams, then sprints - a short solar burst toward
        // its aim (the ai reads enemy.sunT for the speed)
        enemy.vt = 2.6 + this.rng.next();
        enemy.sunT = 0.6;
        this.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
      } else if (enemy.variant === "phase" && enemy.vt <= 0) {
        enemy.vt = 2.4 + this.rng.next();
        let dx = player.x - enemy.x,
          dy = player.y - enemy.y,
          dist = Math.hypot(dx, dy);
        if (dist > 4.5) {
          let x = enemy.x + (dx / dist) * 3,
            y = enemy.y + (dy / dist) * 3;
          if (!this.arena.blocked(x, y, enemy.r) && !this.arena.outside(x, y, enemy.r)) {
            this.emit("blink", { x: enemy.x, y: enemy.y, small: true, phase: true });
            enemy.x = x;
            enemy.y = y;
          }
        }
      }
    }
    starfallHarvest(dt) {
      starfallHarvest(this, dt);
    }
    updateFeatures(dt) {
      updateFeatures(this, dt);
    }
    idle(dt) {
      if (this.chronoT > 0) this.chronoT = Math.max(0, this.chronoT - dt);
      let player = this.player;
      if (player.slipT > 0) player.slipT = Math.max(0, player.slipT - dt);
      if (player.heatT > 0) player.heatT = Math.max(0, player.heatT - dt);
      if (player.gildT > 0) player.gildT = Math.max(0, player.gildT - dt);
      if (player.festT > 0) player.festT = Math.max(0, player.festT - dt);
      if (player.tributeT > 0) player.tributeT = Math.max(0, player.tributeT - dt);
      if (player.leylineT > 0) player.leylineT = Math.max(0, player.leylineT - dt);
      if (player.chronoCd > 0) player.chronoCd = Math.max(0, player.chronoCd - dt);
      if (player.heatSinkCd > 0) player.heatSinkCd = Math.max(0, player.heatSinkCd - dt);
      if (player.reactiveGrazeCd > 0) player.reactiveGrazeCd = Math.max(0, player.reactiveGrazeCd - dt);
      if (player.echoQueue) player.echoQueue.length = 0;
      this.updatePickups(dt);
      for (let bullet of this.eb) bullet.life = 0;
      this.sweep();
    }
    updatePlayer(dt, input) {
      let player = this.player,
        stats = this.stats;
      input = input || {};
      player.iT = Math.max(0, player.iT - dt);
      const maxDash = stats.dashCharges || 1;
      if (player.dashN == null) player.dashN = maxDash;
      if (player.dashN < maxDash) {
        player.dashCdT -= dt;
        if (player.dashCdT <= 0) {
          player.dashN++;
          player.dashCdT = player.dashN < maxDash ? stats.dashCd : 0;
        }
      } else if (player.dashCdT > 0) {
        player.dashCdT = Math.max(0, player.dashCdT - dt);
      }
      // 3.0.0: gadget recharge, one charge at a time
      if (player.gadgetN < stats.gadgetMax && this.state === "fight") {
        player.gadgetT -= dt;
        if (player.gadgetT <= 0) {
          player.gadgetN++;
          player.gadgetT = player.gadgetN < stats.gadgetMax ? stats.gadgetCd : 0;
          this.emit("gadgetReady", { n: player.gadgetN });
        }
      }
      player.hurtT = Math.max(0, player.hurtT - dt);
      if (player.tractionT > 0) player.tractionT = Math.max(0, player.tractionT - dt);
      if (player.hopT > 0) player.hopT = Math.max(0, player.hopT - dt);
      if (player.rushT > 0) {
        player.rushT -= dt;
        if (player.rushT <= 0) {
          player.rushN = 0;
        }
      }
      if (stats.shieldCd > 0 && !player.shield) {
        player.shieldT += dt;
        if (player.shieldT >= stats.shieldCd) {
          player.shield = true;
          player.shieldT = 0;
          this.emit("shieldUp");
        }
      }
      if (stats.regen > 0 && player.hp < stats.maxHp) {
        player.hp = Math.min(stats.maxHp, player.hp + stats.regen * dt);
      }
      let mx = +input.mx || 0,
        my = +input.my || 0,
        len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      player.moving = len > 0.08;
      if (input.dash && player.dashN > 0 && player.dashT <= 0) {
        let dx = mx,
          dy = my;
        if (Math.hypot(dx, dy) < 0.2) {
          dx = Math.cos(player.face);
          dy = Math.sin(player.face);
        }
        let norm = Math.hypot(dx, dy) || 1;
        player.dashX = dx / norm;
        player.dashY = dy / norm;
        player.dashT = 0.17;
        player.dashN--;
        if (player.dashCdT <= 0) player.dashCdT = stats.dashCd;
        player.dashAt = this.time;
        player.dashId++;
        this.runStats.dashes++;
        player.iT = Math.max(player.iT, 0.24);
        // Chrono Dash: 1.1s slow to 55% with 4.0s internal cooldown
        if (stats.chrono && (player.chronoCd || 0) <= 0) {
          this.chronoT = 1.1;
          player.chronoCd = 4.0;
        }
        this.emit("dash", { x: player.x, y: player.y, a: Math.atan2(player.dashY, player.dashX) });
      }
      if (player.dashT > 0) {
        player.dashT -= dt;
        player.vx = player.dashX * 28;
        player.vy = player.dashY * 28;
        if (stats.shockDash) {
          this.dashHits();
        }
        // Mirror Ward ('reactive') dash graze-parry: dashing within 1.4m of an enemy bullet emits a chime wave (2.5s CD)
        if (stats.reactive && (player.reactiveGrazeCd || 0) <= 0 && this.eb.length) {
          for (const b of this.eb) {
            if (b.life > 0 && (b.x - player.x) ** 2 + (b.y - player.y) ** 2 < 1.96) {
              player.reactiveGrazeCd = 2.5;
              this.triggerReactivePulse();
              break;
            }
          }
        }
        if (stats.trail) {
          player.trailT -= dt;
          if (player.trailT <= 0) {
            player.trailT = 0.025;
            if (this.trails.length < 80) {
              this.trails.push({ x: player.x, y: player.y, life: 1.8 });
            }
          }
        }
      } else {
        let onIce = this.arena.ice.length && this.arena.onIce(player.x, player.y);
        player.onIce = !!onIce;
        if (player.slowT > 0) {
          player.slowT -= dt;
        }
        let baseGrip = onIce ? 2.4 : this.arena.biome.grip || 16;
        if (onIce && this.event === "aurora") {
          player.tractionT = Math.max(player.tractionT || 0, 1.8);
          if (player.dashCdT > 0) player.dashCdT = Math.max(0, player.dashCdT - 0.45 * dt);
        }
        if (!onIce && this.arena.biome.id === "shelf") {
          const auroraBoost = this.bioEv && this.bioEv.id === "aurora" ? RL_THAW_AURORA : 1;
          baseGrip *= 1 + RL_THAW_K * auroraBoost * (0.5 - 0.5 * Math.cos((this.time / RL_THAW_PERIOD) * Math.PI * 2));
        }
        if (player.tractionT > 0) baseGrip = Math.max(baseGrip, 18);
        if (player.gildT > 0) player.gildT = Math.max(0, player.gildT - dt);
        if (player.festT > 0) player.festT = Math.max(0, player.festT - dt);
        const mudMul = player.hopT > 0 ? 1 : this.arena.biome.mud || 1;
        const hopMul = (player.hopT > 0 ? 1.15 : 1) * (player.gildT > 0 ? 1.14 : 1) * (player.leylineT > 0 ? 1.25 : 1);
        let grip = dampFactor(baseGrip, dt),
          speed = stats.speed * (onIce ? 1.14 : 1) * mudMul * hopMul * (player.slowT > 0 ? 0.65 : 1);
        player.vx += (mx * speed - player.vx) * grip;
        player.vy += (my * speed - player.vy) * grip;
      }
      const x0 = player.x,
        y0 = player.y;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      this.arena.resolve(player, player.r);
      // 3.17.0: the walker: footsteps and the landing after a dash
      walkStep(this, x0, y0, dt);
      if (player.moving && player.dashT <= 0) {
        player.face = turnToward(player.face, Math.atan2(my, mx), 14 * dt);
      }
      let manual = !!input.aim && Math.hypot(+input.ax || 0, +input.ay || 0) > 0.2,
        aim = null;
      if (manual) {
        aim = Math.atan2(input.ay, input.ax);
        if (input.assist !== false) {
          aim = this.assistAim(aim);
        }
        player.target = null;
      } else {
        let target = this.pickTarget();
        player.target = target;
        if (target) {
          aim = Math.atan2(target.y - player.y, target.x - player.x);
        }
      }
      let firing = manual || (!!input.fire && aim != null) || (!!input.auto && aim != null && player.target != null);
      if (aim != null) {
        player.aim = turnToward(player.aim, aim, 30 * dt);
      } else if (input.hasLook) {
        player.aim = turnToward(player.aim, Math.atan2(input.lookY, input.lookX), 22 * dt);
      } else if (player.moving) {
        player.aim = turnToward(player.aim, player.face, 10 * dt);
      }
      player.firing = firing;
      player.manual = manual;
      let lanternWarm = false;
      if (this.arena?.props?.length) {
        for (const prop of this.arena.props) {
          if (prop.kind === "lantern" && prop.auraT > 0 && Math.hypot(player.x - prop.x, player.y - prop.y) <= 4.4) {
            lanternWarm = true;
            break;
          }
        }
      }
      let rate =
        stats.weapon.rate *
        stats.rateMul *
        (1 + (stats.bloodrush ? 0.04 * player.rushN : 0)) *
        (player.gildT > 0 ? 1.2 : 1) *
        (player.festT > 0 ? 1.25 : lanternWarm ? 1.15 : 1);
      player.fireT -= dt;
      if (firing && aim != null) {
        let shots = 0;
        for (; player.fireT <= 0 && shots < 3;) {
          this.fire(aim);
          player.fireT += 1 / rate;
          shots++;
        }
        if (player.fireT < 0) {
          player.fireT = 0;
        }
      } else {
        if (player.fireT < 0) {
          player.fireT = 0;
        }
      }
      if (input.nova) {
        this.nova();
      }
      if (input.gadget) {
        this.useGadget(input);
      }
    }
    // 2.8.0: shots stop at walls (only the Lance slug flies through), so nothing behind a wall is a target
    shotsCrossWalls() {
      return !!(this.stats.lance && this.stats.weapon.rail);
    }
    canSee(enemy) {
      return this.shotsCrossWalls() || this.arena.los(this.player.x, this.player.y, enemy.x, enemy.y, 0.15);
    }
    assistAim(angle) {
      let player = this.player,
        best = null,
        bestErr = 0.22,
        range = this.stats.range + 2;
      for (let enemy of this.enemies) {
        if (enemy.dead || enemy.ghost) continue;
        let dx = enemy.x - player.x,
          dy = enemy.y - player.y,
          dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        let err = Math.abs(angleDiff(angle, Math.atan2(dy, dx))),
          cone = Math.min(0.35, 0.12 + Math.atan2(enemy.r, dist));
        if (err < cone && err < bestErr + (0.05 * dist) / range && this.canSee(enemy)) {
          best = enemy;
          bestErr = err;
        }
      }
      return best ? Math.atan2(best.y - player.y, best.x - player.x) : angle;
    }
    // 2.8.0: smarter auto-aim. Enemies behind a wall are skipped (the shots would only hit the
    // wall); close enemies come first, rushers that explode or ram you even more so; enemies that
    // are immune right now (shield phase) only when nothing else is in reach; the current target is
    // kept while it is still a good one, so the aim does not flicker between two similar enemies.
    pickTarget() {
      let player = this.player,
        range = this.stats.range + 2.5,
        cross = this.shotsCrossWalls(),
        best = null,
        bestScore = 1 / 0;
      for (let enemy of this.enemies) {
        if (enemy.dead || enemy.spawnT > 0.2 || enemy.ghost) continue;
        let dist = Math.hypot(enemy.x - player.x, enemy.y - player.y) - enemy.r;
        if (dist > range || (!cross && !enemy.los)) continue;
        let score = dist;
        if (dist < 4) score *= 0.6;
        else if (dist < 7 && RL_RUSHERS.has(enemy.type)) score *= 0.75;
        if (enemy.shielded) score += 12;
        if (enemy === player.target) score *= 0.8;
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      return best && (cross || this.canSee(best)) ? best : null;
    }
    fire(angle, echoMul = 1, isEcho = false) {
      const stats = this.stats,
        player = this.player,
        weapon = stats.weapon;
      const slipBoost = stats.slip > 0 && player.slipT > 0,
        slipMul = slipBoost ? 1 + (stats.slip > 1 ? 0.35 : 0.2) : 1,
        dmgBefore = stats.dmgMul;
      if (slipBoost) stats.dmgMul = dmgBefore * slipMul;
      try {
        const count = weapon.count + (weapon.cone ? stats.extra * 2 : stats.extra),
          muzzle = 0.75,
          originX = player.x + Math.cos(angle) * muzzle,
          originY = player.y + Math.sin(angle) * muzzle;
        // Echo shots count toward weapon cadences (Solar Repeater, Kiln Surge)
        player.shotN = (player.shotN || 0) + 1;
        const heavy = !!(stats.overdrive && player.shotN % 4 === 0),
          twinDisc = !!(stats.twinsaw && weapon.id === "disc"),
          shoot = (dir, mul) => {
            if (this.pb.length >= MAX_PLAYER_BULLETS) return;
            const spread = (this.rng.next() - 0.5) * 2 * weapon.spread,
              heading = dir + spread,
              speed = weapon.speed * stats.velMul * (weapon.cone ? 0.85 + this.rng.next() * 0.3 : 1),
              effMul = mul * echoMul,
              bullet = {
                id: this.nextId++,
                x: originX,
                y: originY,
                vx: Math.cos(heading) * speed,
                vy: Math.sin(heading) * speed,
                a: heading,
                r: weapon.r * stats.sizeMul * (twinDisc ? 1.4 : 1),
                dmg: weapon.dmg * stats.dmgMul * effMul * (twinDisc ? 1.35 : 1),
                baseDmg: weapon.dmg * effMul,
                life: weapon.life * (weapon.cone ? 0.85 + this.rng.next() * 0.3 : 1),
                pierce: stats.lance && weapon.rail ? 999 : stats.pierce,
                bounce: weapon.boomerang ? 0 : stats.bounce,
                hits: [],
                w: weapon.id,
                age: 0,
                homing: stats.homing,
                slipstream: slipBoost,
                pierceCount: 0,
              };
            if (effMul !== 1) bullet.mul = effMul;
            if (weapon.explode) bullet.dm = stats.dmgMul;
            if (heavy && mul >= 1) {
              bullet.dmg *= 2.4;
              bullet.r *= 1.65;
              bullet.pierce += 2;
              bullet.vx *= 1.2;
              bullet.vy *= 1.2;
              bullet.heavy = true;
              bullet.solarSplash = 1.8;
            }
            if (weapon.boomerang) {
              bullet.boom = true;
              bullet.turn = weapon.life * 0.5;
              bullet.life = 4;
              bullet.sp = speed;
              bullet.spin = 0;
            }
            if (weapon.drag) {
              bullet.drag = weapon.drag;
              bullet.grow = weapon.grow;
            }
            this.pb.push(bullet);
          };
        if (weapon.cone) {
          let arc = weapon.cone + stats.extra * 0.08;
          for (let i = 0; i < count; i++) shoot(angle - arc / 2 + (arc * (i + 0.5)) / count, 1);
        } else {
          for (let i = 0; i < count; i++) shoot(angle + (i - (count - 1) / 2) * weapon.fan, 1);
        }
        // Rear Guard: astern bolts equal to ceil(weapon.count * 0.5) at 0.75x damage; Lv 2 adds flank fan
        if (stats.rear >= 1) {
          const rearN = Math.max(1, Math.ceil(weapon.count * 0.5));
          for (let i = 0; i < rearN; i++) {
            const off = rearN > 1 ? (i - (rearN - 1) / 2) * Math.max(0.12, weapon.fan || 0.14) : 0;
            shoot(angle + Math.PI + off, 0.75);
          }
        }
        if (stats.rear >= 2) {
          shoot(angle + Math.PI / 2, 0.75);
          shoot(angle - Math.PI / 2, 0.75);
        }
        this.emit("shot", { w: weapon.id, x: originX, y: originY, a: angle, heavy });
        // Deterministic Echo-Bell ('echo'): Lv 1 every 4th shot (0.80x), Lv 2 every 3rd shot (0.95x) after 0.10s
        if (!isEcho && stats.echo > 0 && this.state === "fight" && player.alive) {
          const every = stats.echo > 1 ? 3 : 4;
          if (player.shotN % every === 0) {
            if (!player.echoQueue) player.echoQueue = [];
            player.echoQueue.push({
              t: 0.1,
              angle: angle + this.rng.range(-0.025, 0.025),
              mul: stats.echo > 1 ? 0.95 : 0.8,
            });
          }
        }
      } finally {
        if (slipBoost) stats.dmgMul = dmgBefore;
      }
    }
    dashHits() {
      let player = this.player;
      this.hash.query(player.x, player.y, 1.1, (enemy) => {
        if (!(
          enemy.dead ||
          enemy.dashHit === player.dashId ||
          Math.hypot(enemy.x - player.x, enemy.y - player.y) > enemy.r + 1.1
        )) {
          enemy.dashHit = player.dashId;
          this.hurtEnemy(enemy, this.stats.shockDash * this.stats.dmgMul, player.dashX, player.dashY, 6, false, "dash");
          this.emit("zap", { x: enemy.x, y: enemy.y });
        }
      });
    }
    singularityTarget(input) {
      const player = this.player;
      let angle = player.aim,
        dist = 9;
      if (input.aim && (input.ax || input.ay)) {
        angle = Math.atan2(input.ay, input.ax);
        dist = 11;
      } else {
        const near = [];
        for (const enemy of this.enemies) {
          if (enemy.dead || enemy.ghost || near.length >= 60) continue;
          if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 16 && this.canSee(enemy)) near.push(enemy);
        }
        let best = null,
          bestScore = -1e9;
        for (const enemy of near) {
          let crowd = 0;
          for (const other of near) if (Math.hypot(other.x - enemy.x, other.y - enemy.y) < 4.5) crowd++;
          const score = crowd * 10 - Math.hypot(enemy.x - player.x, enemy.y - player.y) * 0.2 + (enemy.elite ? 4 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = enemy;
          }
        }
        if (best) {
          angle = Math.atan2(best.y - player.y, best.x - player.x);
          dist = Math.hypot(best.x - player.x, best.y - player.y);
        }
      }
      const reach = this.arena.rayLen(player.x, player.y, angle, dist);
      dist = Math.max(0, Math.min(dist, reach - 0.4));
      return { x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist, dist };
    }
    useGadget(input) {
      const player = this.player,
        stats = this.stats;
      if (!player.alive || this.state !== "fight") return false;
      if (player.gadgetN <= 0) {
        this.emit("gadgetDeny");
        return false;
      }
      const target = this.singularityTarget(input),
        dur = 0.16 + target.dist * 0.022;
      player.gadgetN--;
      if (player.gadgetT <= 0) player.gadgetT = stats.gadgetCd;
      this.singularities.push({ fx: player.x, fy: player.y, tx: target.x, ty: target.y, t: 0, dur, pullT: -1 });
      this.emit("singularity", { x: player.x, y: player.y, tx: target.x, ty: target.y, dur });
      return true;
    }
    updateSingularities(dt) {
      if (!this.singularities.length) return;
      const stats = this.stats,
        radius = stats.gadgetR,
        pullR = radius * SING_PULL_RADIUS;
      for (const sing of this.singularities) {
        sing.t += dt;
        if (sing.t < sing.dur) continue;
        if (sing.pullT < 0) {
          sing.pullT = 0;
          sing.r = pullR;
          this.emit("singOpen", { x: sing.tx, y: sing.ty, r: pullR, dur: SING_PULL_TIME });
        }
        sing.pullT += dt;
        if (sing.pullT < SING_PULL_TIME) {
          const ramp = Math.min(1, sing.pullT / 0.5);
          this.hash.query(sing.tx, sing.ty, pullR, (enemy) => {
            if (enemy.dead || enemy.ghost) return;
            const dx = sing.tx - enemy.x,
              dy = sing.ty - enemy.y,
              d = Math.hypot(dx, dy);
            if (d > pullR + enemy.r) return;
            // Resonance Well ('gsyphon'): mark enemies inside the chime pull field
            if (stats.gsyphon) enemy.inChimeT = Math.max(enemy.inChimeT || 0, 0.25);
            // Hearthfire Chime ('gfire'): marks pulled enemies (+25% dmg taken for 3.5s) and tugs bosses at 35% strength
            if (stats.gadgetFire) enemy.chimeVulnT = Math.max(enemy.chimeVulnT || 0, 3.5);
            if (enemy.boss && !stats.gadgetFire) return;
            if (d < 0.35) return;
            const bossMul = enemy.boss ? 0.35 : 1,
              mass = (1 / (0.6 + enemy.r * enemy.r * 1.6)) * (enemy.elite ? 0.6 : 1) * bossMul,
              falloff = Math.min(1, d / 1.2) * (1 - 0.35 * Math.min(1, d / pullR)),
              push = SING_PULL * ramp * falloff * mass * dt;
            enemy.kx += (dx / d) * push;
            enemy.ky += (dy / d) * push;
            if (!enemy.boss) enemy.slowT = Math.max(enemy.slowT, 0.1);
          });
          continue;
        }
        sing.done = true;
        const dmg = SING_DAMAGE * stats.dmgMul * stats.gadgetDmg;
        this.explode(sing.tx, sing.ty, radius, dmg, {
          enemies: true,
          knock: 2.5,
          kind: "singularity",
          burn: stats.gadgetFire ? dmg * 0.25 : 0,
        });
        if (stats.gadgetFire)
          this.burnPools.push({
            id: this.nextId++,
            x: sing.tx,
            y: sing.ty,
            r: radius * 0.8,
            life: 4.0,
            dps: dmg * 0.35,
            hostile: false,
          });
        // Event Horizon ('blackstar'): collapsing Chimes fire 8 primary weapon bolts outward
        if (stats.blackstar && this.pb.length < MAX_PLAYER_BULLETS - 8) {
          const weapon = stats.weapon,
            speed = weapon.speed * stats.velMul;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            this.pb.push({
              id: this.nextId++,
              x: sing.tx,
              y: sing.ty,
              vx: Math.cos(a) * speed,
              vy: Math.sin(a) * speed,
              a,
              r: weapon.r * stats.sizeMul,
              dmg: weapon.dmg * stats.dmgMul,
              baseDmg: weapon.dmg,
              life: Math.min(1.1, weapon.life),
              pierce: stats.pierce,
              bounce: weapon.boomerang ? 0 : stats.bounce,
              hits: [],
              w: weapon.id,
              age: 0,
              homing: stats.homing,
              pierceCount: 0,
            });
          }
        }
        this.hash.query(sing.tx, sing.ty, radius, (enemy) => {
          if (!enemy.dead && !enemy.boss && Math.hypot(enemy.x - sing.tx, enemy.y - sing.ty) < radius + enemy.r)
            enemy.slowT = Math.max(enemy.slowT, 1.2);
        });
        for (const bullet of this.eb) {
          if (bullet.life > 0 && Math.hypot(bullet.x - sing.tx, bullet.y - sing.ty) < radius * 1.15) {
            bullet.life = 0;
            this.emit("pop", { x: bullet.x, y: bullet.y, src: bullet.src, kind: bullet.kind, frost: bullet.frost });
          }
        }
      }
      this.singularities = this.singularities.filter((sing) => !sing.done);
    }
    nova() {
      let player = this.player,
        stats = this.stats;
      if (player.nova < 100 || !player.alive || this.state !== "fight") return;
      player.nova = 0;
      player.iT = Math.max(player.iT, 0.5);
      this.triggerHitstop(0.028);
      // Event Horizon ('blackstar'): Hearthburst drops a free Lodestone Chime at target/cursor
      if (stats.blackstar) {
        const target = this.singularityTarget({});
        this.singularities.push({ fx: player.x, fy: player.y, tx: target.x, ty: target.y, t: 0, dur: 0.14, pullT: -1 });
        this.emit("singularity", { x: player.x, y: player.y, tx: target.x, ty: target.y, dur: 0.14 });
      }
      // 3.15.0: with Event Collapse the blast comes after the pull (boss-cards.js)
      if (bossCardNova(this, stats.novaR)) return;
      novaBlast(this, stats.novaR);
    }
    // 2.8.0: raw charge (Overcharge per-kill bonus) is not scaled by the charge rate, so the card text holds
    addNova(amount, raw = false) {
      let player = this.player,
        before = player.nova;
      player.nova = Math.min(100, player.nova + amount * (raw ? 1 : this.stats.novaMul));
      if (before < 100 && player.nova >= 100) {
        this.emit("novaReady");
      }
    }
    /* 3.21.0: the last twelve hits of the run for the recap on the end screen; the ticks of a hazard (acid, lava) that
       follow each other within 1.5 s are one entry */
    logHit(src, dmg, chip, lethal) {
      const key = src || "?",
        log = this.hitLog,
        last = log[log.length - 1];
      this.takenBy[key] = (this.takenBy[key] || 0) + dmg;
      if (!lethal && chip && last && last.chip && last.src === key && this.time - last.t < 1.5) {
        last.dmg += dmg;
        last.t = this.time;
        last.n++;
        return;
      }
      log.push({ t: this.time, wave: this.wave, src: key, dmg, chip: !!chip, n: 1 });
      if (log.length > 12) log.shift();
    }
    triggerReactivePulse() {
      const stats = this.stats,
        player = this.player;
      if (!stats.reactive || this._rlReacting) return;
      const radius = stats.reactive > 1 ? 4.2 : 3.5,
        dmg = (stats.reactive > 1 ? 85 : 55) * stats.dmgMul;
      this._rlReacting = true;
      try {
        this.explode(player.x, player.y, radius, dmg, {
          enemies: true,
          knock: 10,
          kind: "reactive",
        });
      } finally {
        this._rlReacting = false;
      }
      for (const bullet of this.eb) {
        if (bullet.life > 0 && Math.hypot(bullet.x - player.x, bullet.y - player.y) < radius * 1.2) {
          bullet.life = 0;
          this.emit("pop", { x: bullet.x, y: bullet.y, src: bullet.src, kind: bullet.kind, frost: bullet.frost });
        }
      }
    }
    hurtPlayer(dmg, srcX, srcY, src, chip = false, contact = false) {
      // 2.5.0 B: no damage while the Emergency Shield barrier is up
      if (this.barrierT > 0 && this.player.alive && this.state === "fight") return false;
      const stats = this.stats,
        player = this.player;
      // 2.3.5: Filigree Mail ('armorCore') absorbs enemy hits (hazardResist handles hazard ticks separately)
      const armor = Math.min(0.5, stats.armor || 0);
      if (armor > 0 && !RL_HAZARD_SRC.has(src)) dmg = dmg * (1 - armor);
      if (contact && stats.meleeResist > 0) dmg = dmg * (1 - stats.meleeResist);
      let hpBefore = player.hp,
        hit,
        shieldBlocked = false;
      if (!player.alive || (!chip && player.iT > 0) || player.dashT > 0 || this.state !== "fight" || this.god)
        hit = false;
      else if (player.shield && !chip) {
        player.shield = false;
        player.shieldT = 0;
        player.iT = 0.6;
        shieldBlocked = true;
        this.emit("shieldBreak", { x: player.x, y: player.y });
        hit = false;
      } else if (chip && !(dmg = rlChipDamage(player, dmg))) {
        hit = false;
      } else {
        dmg = Math.round(dmg);
        player.hp -= dmg;
        const hullLost = Math.min(dmg, hpBefore);
        this.runStats.dmgTaken += hullLost;
        this.lastHit = src || null;
        this.logHit(src, hullLost, chip, player.hp <= 0);
        if (!chip) {
          player.iT = 0.65;
          player.hurtT = 0.3;
        }
        this.waveDmg += dmg;
        if (srcX != null && !chip) {
          let dx = player.x - srcX,
            dy = player.y - srcY,
            dist = Math.hypot(dx, dy) || 1;
          player.vx += (dx / dist) * 7;
          player.vy += (dy / dist) * 7;
        }
        this.emit("hurt", { dmg: dmg, x: player.x, y: player.y, sx: srcX, sy: srcY, chip: chip });
        if (player.hp <= 0) {
          if ((this.ws.revive || 0) > 0 && !this.revived) {
            this.revived = true;
            player.hp = Math.round(this.stats.maxHp * 0.5);
            player.iT = 2.2;
            player.nova = 100;
            this.nova();
            this.emit("revive", { x: player.x, y: player.y });
          } else {
            player.hp = 0;
            player.alive = false;
            this.state = "dead";
            this.stateT = 0;
            this.emit("die", { x: player.x, y: player.y });
          }
        }
        hit = true;
      }
      if (shieldBlocked && player.alive && stats.reactive) {
        this.triggerReactivePulse();
      }
      if (hit && player.alive) {
        // Bellows Vent ('heatsink'): triggers on active hazard damage
        if (stats.heatSink && RL_HAZARD_SRC.has(src)) {
          triggerHeatSink(this);
        }
        // Mirror Ward ('reactive'): emits chime pulse on real hit
        if (stats.reactive && !chip) {
          this.triggerReactivePulse();
        }
      }
      // 2.5.0 B: Emergency Shield: once per wave below 30% hull, a short barrier and some repair
      if (
        hit &&
        stats.barrierT > 0 &&
        !this.barrierUsed &&
        player.alive &&
        this.state === "fight" &&
        player.hp > 0 &&
        player.hp < stats.maxHp * 0.3
      ) {
        this.barrierUsed = true;
        this.barrierT = stats.barrierT;
        player.hp = Math.min(stats.maxHp, player.hp + Math.round(stats.maxHp * stats.barrierHeal));
        this.barrierOwnShield = !player.shield;
        this.barrierShieldT = player.shieldT;
        player.shield = true;
        this.emit("barrier", { x: player.x, y: player.y, t: stats.barrierT });
        this.emit("heal", { x: player.x, y: player.y });
      }
      return hit;
    }
    spawnEnemy(type, x, y, opts = {}) {
      let def = enemyDefs[type],
        elite = !!opts.elite,
        hp = def.hp * this.hpMul * (elite ? 3.2 : 1) * (opts.hpF || 1),
        enemy = {
          id: this.nextId++,
          type: type,
          def: def,
          x: x,
          y: y,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: def.r * (elite ? 1.3 : 1),
          hp: hp,
          maxHp: hp,
          speed: def.speed * (elite ? 1.12 : 1) * (0.92 + this.rng.next() * 0.16),
          dmg: def.dmg * this.dmgMul * (elite ? 1.3 : 1),
          face: Math.atan2(this.player.y - y, this.player.x - x),
          elite: elite,
          boss: false,
          age: 0,
          st: 0,
          t: this.rng.range(0.5, 2),
          t2: 0,
          ta: 0,
          flash: 0,
          spawnT: 0.35,
          slowT: 0,
          burnT: 0,
          burnDps: 0,
          burnAcc: 0,
          burnShow: 0,
          orbAt: null,
          dashHit: 0,
          dead: false,
          // 3.46.0: the cached line of sight starts true to the truth (a real check at spawn —
          // it used to be a blind `true` for up to 0.25 s, enough for auto-aim to pick an enemy
          // behind a wall); statusTick keeps it fresh from here on
          los: this.shotsCrossWalls() || !this.arena || this.arena.los(x, y, this.player.x, this.player.y, 0.2),
          losT: this.rng.next() * 0.25,
          parent: opts.parent || 0,
          parentRef: opts.parentRef || null,
          kids: 0,
          phase: this.rng.next() * TAU,
          noDrop: !!opts.noDrop,
          affix: null,
          shield: 0,
          shieldMax: 0,
        };
      if (opts.champion) {
        enemy.champion = true;
        enemy.maxHp = enemy.hp = hp * 2.2;
        enemy.r *= 1.3;
        enemy.speed *= 0.9;
        enemy.dmg *= 1.2;
        enemy.spawnT = 0.8;
      }
      let variant = biomeVariants[this.arena.biome.id];
      if (
        variant &&
        variant.types.includes(type) &&
        !opts.champion &&
        !opts.noVariant &&
        this.wave >= 3 &&
        this.rng.chance(0.35)
      ) {
        enemy.variant = variant.id;
      }
      if (type === "bulwark") {
        enemy.guard = enemy.guardMax = enemy.hp * 0.9;
        enemy.guardDown = 0;
        enemy.guardFlash = 0;
      }
      if (elite && this.wave >= 10 && type !== "mite" && !opts.champion) {
        enemy.affix = this.rng.pick(["shielded", "hasted", "volatile"]);
        if (enemy.affix === "shielded") {
          enemy.shield = enemy.shieldMax = hp * 0.45;
        }
        if (enemy.affix === "hasted") {
          enemy.speed *= 1.35;
        }
      }
      // 3.3.0: the Endless mutators (a hash of the enemy decides, so the wave's random stream stays the same)
      const mods = this.mods;
      if (mods && type !== "mite" && !opts.champion) {
        const roll = (salt) => hashString(this.seed + ":" + salt + ":" + enemy.id) / 4294967296;
        if (!enemy.affix && mods.volatile && roll("vol") < 0.2 * mods.volatile) enemy.affix = "volatile";
        if (!enemy.affix && mods.shielded && roll("shd") < 0.15 * mods.shielded) {
          enemy.affix = "shielded";
          enemy.shield = enemy.shieldMax = hp * 0.45;
        }
        if (mods.hasted) enemy.speed *= 1 + 0.12 * mods.hasted;
      }
      this.enemies.push(enemy);
      return enemy;
    }
    spawnBoss(id) {
      // 2.8.1: an Endless boss starts from the wave-20 hull (it used to start from its own base hull, so the
      // Bellkeeper at wave 30 had less than the boss at wave 20) and grows like the regular enemies, plus 10%
      // for every Endless boss so far
      const hpCurve = (wave) => 1 + 0.085 * (wave - 1) + 0.0058 * (wave - 1) * (wave - 1);
      let def = bossDefs[id],
        hp = this.endless
          ? BOSS_SLOT_HP[3] *
            this.tm.boss *
            0.9 *
            (hpCurve(this.wave) / hpCurve(20)) *
            (1 + 0.1 * Math.max(0, Math.floor((this.wave - 20) / 5)))
          : def.hp * this.tm.boss * 0.9 * (1 + (this.wave > 20 ? (this.wave - 20) * 0.08 : 0)),
        arena = this.arena,
        boss = {
          id: this.nextId++,
          type: id,
          def: def,
          x: 0,
          y: -arena.H + 5,
          vx: 0,
          vy: 0,
          kx: 0,
          ky: 0,
          r: def.r,
          hp: hp,
          maxHp: hp,
          speed: def.speed,
          dmg: def.dmg * this.dmgMul,
          face: Math.PI / 2,
          elite: false,
          boss: true,
          age: 0,
          st: 0,
          t: 2.2,
          t2: 0,
          ta: 0,
          flash: 0,
          spawnT: 1.2,
          slowT: 0,
          burnT: 0,
          burnDps: 0,
          burnAcc: 0,
          burnShow: 0,
          orbAt: null,
          dashHit: 0,
          dead: false,
          los: true,
          losT: 0,
          parent: 0,
          kids: 0,
          phase: 0,
          enraged: false,
          noDrop: false,
          pattern: 0,
        };
      if (this.player.y < 0) {
        boss.y = arena.H - 5;
      }
      initBoss(this, boss);
      // 3.3.0: the tier of a boss is the number of bosses before it in this run (wave 5: 0, wave 10: 1 …); a higher
      // tier rests less between its attacks (down to 60 %)
      boss.tier = Math.max(0, Math.floor(this.wave / 5) - 1);
      boss.pace = Math.max(0.6, 1 - 0.08 * boss.tier);
      // and more hull: the bot of the balance bench killed the bosses of waves 5-15 in 16-38 s, before their enrage
      // mattered; +25% per tier, at most twice the hull (the first boss stays as it was)
      this.enemies.push(boss);
      this.boss = boss;
      // 3.24.0: the start of the fight and the damage taken so far (the medal of the kill, see core/medals.js)
      this.bossT0 = this.time;
      this.bossDmg0 = this.runStats.dmgTaken;
      this.emit("boss", { id: id, name: def.name, title: def.title });
      // 2.4.6: in waves 5–20 the hull follows the slot (see bossFor)
      const slot = this.wave / 5 - 1;
      if (boss && !this.endless && this.wave <= 20 && Number.isInteger(slot) && BOSS_SLOT_HP[slot]) {
        const hpScale = BOSS_SLOT_HP[slot] / boss.def.hp;
        boss.hp *= hpScale;
        boss.maxHp *= hpScale;
      }
      const tierHull = Math.min(2, 1 + 0.25 * boss.tier);
      boss.hp *= tierHull;
      boss.maxHp *= tierHull;
      return boss;
    }
    statusTick(enemy, dt) {
      if (enemy.rallyT > 0) enemy.rallyT = Math.max(0, enemy.rallyT - dt);
      enemy.age += dt;
      if (enemy.spawnT > 0) {
        enemy.spawnT -= dt;
      }
      if (enemy.flash > 0) {
        enemy.flash = Math.max(0, enemy.flash - dt * 7);
      }
      if (enemy.healFlash > 0) {
        enemy.healFlash = Math.max(0, enemy.healFlash - dt);
      }
      if (enemy.slowT > 0) {
        enemy.slowT -= dt;
      }
      if (enemy.weakenT > 0) {
        enemy.weakenT = Math.max(0, enemy.weakenT - dt);
      }
      if (enemy.corrodeT > 0) {
        enemy.corrodeT = Math.max(0, enemy.corrodeT - dt);
        enemy.corrode = enemy.corrodeT > 0;
      } else {
        enemy.corrode = false;
      }
      if (enemy.chimeVulnT > 0) enemy.chimeVulnT = Math.max(0, enemy.chimeVulnT - dt);
      if (enemy.inChimeT > 0) enemy.inChimeT = Math.max(0, enemy.inChimeT - dt);
      if (enemy.wardedT > 0) enemy.wardedT = Math.max(0, enemy.wardedT - dt);
      if (enemy.warpShimmerT > 0) enemy.warpShimmerT = Math.max(0, enemy.warpShimmerT - dt);
      if (enemy.glazeT > 0) {
        enemy.glazeT = Math.max(0, enemy.glazeT - dt);
        // Glazed enemies leave a 1.4m spore-dew trail behind them as they move
        if (!enemy.boss && this.state === "fight" && Math.hypot(enemy.vx || 0, enemy.vy || 0) > 0.5) {
          enemy.glazeDropT = (enemy.glazeDropT || 0) - dt;
          if (enemy.glazeDropT <= 0) {
            enemy.glazeDropT = 0.85;
            const acid = this.arena.acid,
              mine = acid.filter((p) => p.mine);
            if (mine.length >= RL_COAT_MAX) acid.splice(acid.indexOf(mine[0]), 1);
            acid.push({ x: enemy.x, y: enemy.y, r: 1.4, life: 3.0, mine: true });
          }
        }
      }
      const burning = enemy.burnT > 0;
      if (burning) {
        enemy.burnT = Math.max(0, enemy.burnT - dt);
        if (enemy.burnT <= 0) enemy.burnStacks = 0;
      }
      if (burning && !enemy.shielded && !enemy.ghost) {
        const stats = this.stats,
          hunterMatch = enemy.elite || enemy.boss || enemy.champion || enemy.hp < enemy.maxHp * 0.35,
          glazeMul = stats.glazeMul || 0.18;
        let dmg =
          enemy.burnDps *
          dt *
          (hunterMatch ? stats.eliteMul || 1 : 1) *
          (enemy.corrode && !enemy.boss ? 1.25 : 1) *
          (enemy.glazeT > 0 ? 1 + (enemy.boss ? (glazeMul >= 0.3 ? 0.2 : 0.12) : glazeMul) : 1) *
          (enemy.chimeVulnT > 0 ? 1.25 : 1) *
          (enemy.inChimeT > 0 && stats.gsyphon ? 1 + (stats.gsyphon > 1 ? 0.45 : 0.25) : 1) *
          (stats.inferno ? 1.2 : 1) *
          (enemy.wardedT > 0 ? 0.7 : 1);
        if (enemy.shield > 0) {
          const shieldScale = stats.hunter ? 2 : 1;
          let absorbed = Math.min(enemy.shield, dmg * shieldScale);
          enemy.shield -= absorbed;
          dmg -= absorbed / shieldScale;
          if (enemy.shield <= 0) {
            this.emit("shieldPop", { x: enemy.x, y: enemy.y, r: enemy.r });
          }
        }
        if (!enemy.boss) dmg = this.burstCap(enemy, dmg);
        dmg = this.capPhase(enemy, dmg);
        enemy.burnAcc += dmg;
        enemy.burnShow += dt;
        enemy.hp -= dmg;
        const dealt = Math.min(dmg, enemy.hp + dmg);
        this.dmgDealt += dealt;
        this.credit(enemy.burnSrc || "burn", dealt);
        if (enemy.burnShow > 0.5) {
          if (enemy.burnAcc > 0.5) {
            this.emit("dmg", { x: enemy.x, y: enemy.y, v: enemy.burnAcc, burn: true, id: enemy.id });
          }
          enemy.burnAcc = 0;
          enemy.burnShow = 0;
        }
        if (enemy.hp <= 0) {
          this.killEnemy(enemy);
        }
      }
      enemy.losT -= dt;
      if (enemy.losT <= 0) {
        enemy.losT = 0.2 + this.rng.next() * 0.1;
        enemy.los = this.arena.los(enemy.x, enemy.y, this.player.x, this.player.y, 0.2);
      }
    }
    chaseDir(enemy) {
      let player = this.player,
        dx = player.x - enemy.x,
        dy = player.y - enemy.y,
        dist = Math.hypot(dx, dy) || 1;
      this.cdx = dx / dist;
      this.cdy = dy / dist;
      if (enemy.los || dist < 2) return;
      let flow = this.arena.flow,
        cell = flow.idx(enemy.x, enemy.y),
        flowX = flow.dx[cell],
        flowY = flow.dy[cell];
      if (flowX !== 0 || flowY !== 0) {
        this.cdx = flowX;
        this.cdy = flowY;
      }
    }
    moveEnemy(enemy, dt) {
      let mul = (enemy.slowT > 0 ? 0.55 : 1) * (enemy.rallyT > 0 ? 1.2 : 1),
        vx = enemy.vx,
        vy = enemy.vy;
      if (!enemy.leaping && this.arena.ice.length && !enemy.boss && this.arena.onIce(enemy.x, enemy.y)) {
        let grip = dampFactor(2.2, dt);
        enemy.svx = (enemy.svx ?? vx) + (vx - (enemy.svx ?? vx)) * grip;
        enemy.svy = (enemy.svy ?? vy) + (vy - (enemy.svy ?? vy)) * grip;
        vx = enemy.svx;
        vy = enemy.svy;
      } else {
        enemy.svx = vx;
        enemy.svy = vy;
      }
      enemy.x += (vx * mul + enemy.kx) * dt;
      enemy.y += (vy * mul + enemy.ky) * dt;
      let damp = dampFactor(7, dt);
      enemy.kx -= enemy.kx * damp;
      enemy.ky -= enemy.ky * damp;
      // Airborne Bog-Hopper leaps over obstacles & floor hazards (only clamped to outer arena bounds)
      if (enemy.leaping) {
        const limX = this.arena.W - enemy.r - 0.15,
          limY = this.arena.H - enemy.r - 0.15;
        let hit = false;
        if (enemy.x < -limX) {
          enemy.x = -limX;
          hit = true;
        } else if (enemy.x > limX) {
          enemy.x = limX;
          hit = true;
        }
        if (enemy.y < -limY) {
          enemy.y = -limY;
          hit = true;
        } else if (enemy.y > limY) {
          enemy.y = limY;
          hit = true;
        }
        enemy.hitWall = hit;
      } else {
        enemy.hitWall = this.arena.resolve(enemy, enemy.r);
      }
    }
    separate() {
      let enemies = this.enemies;
      for (let i = 0; i < enemies.length; i++) {
        let enemy = enemies[i];
        if (!enemy.dead && !enemy.leaping) {
          SEP_SELF = enemy;
          this.hash.query(enemy.x, enemy.y, enemy.r, sepOther);
        }
      }
      SEP_SELF = null;
      for (let enemy of enemies) {
        if (!enemy.dead && !enemy.leaping) {
          this.arena.resolve(enemy, enemy.r);
        }
      }
    }
    contactDamage() {
      let player = this.player;
      this.hash.query(player.x, player.y, player.r, (enemy) => {
        if (enemy.dead || enemy.spawnT > 0 || enemy.ghost) return;
        let dx = enemy.x - player.x,
          dy = enemy.y - player.y,
          minDist = enemy.r + player.r,
          distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) return;
        let dist = Math.sqrt(distSq) || 0.001;
        if (enemy.boss) {
          player.x -= (dx / dist) * (minDist - dist);
          player.y -= (dy / dist) * (minDist - dist);
          this.arena.resolve(player, player.r);
        } else {
          enemy.x += (dx / dist) * (minDist - dist);
          enemy.y += (dy / dist) * (minDist - dist);
          this.arena.resolve(enemy, enemy.r);
        }
        if (enemy.type === "bomber") return;
        let dmg = enemy.boss
          ? enemy.dmg
          : (enemy.st === 2 && (enemy.type === "brute" || enemy.type === "charger")) ||
              (enemy.st === 3 && enemy.type === "striker")
            ? enemy.dmg * 1.4
            : enemy.dmg;
        this.hurtPlayer(dmg, enemy.x, enemy.y, enemy.type, false, true);
      });
    }
    hurtEnemy(enemy, dmg, dx, dy, knock, crit, src = "weapon", extra = null) {
      const stats = this.stats;
      // Hunter: bonus damage vs elites, champions, bosses, and foes below 35% Ward
      const hunterMatch = enemy && (enemy.elite || enemy.boss || enemy.champion || enemy.hp < enemy.maxHp * 0.35);
      dmg = dmg * (hunterMatch ? stats.eliteMul || 1 : 1);
      if (!(enemy.dead || dmg <= 0 || enemy.ghost)) {
        if (enemy.shielded) {
          this.emit("ping", { x: enemy.x, y: enemy.y });
          return;
        }
        if (enemy.shield > 0) {
          const shieldScale = stats.hunter ? 2 : 1;
          let absorbed = Math.min(enemy.shield, dmg * shieldScale);
          enemy.shield -= absorbed;
          dmg -= absorbed / shieldScale;
          enemy.flash = 0.6;
          if (enemy.shield <= 0) {
            this.emit("shieldPop", { x: enemy.x, y: enemy.y, r: enemy.r });
          }
          if (dmg <= 0) {
            this.emit("dmg", { x: enemy.x, y: enemy.y, v: absorbed, shield: true, id: enemy.id, type: enemy.type });
            return;
          }
        }
        if (crit) {
          this.runStats.critHits++;
        }
        if (enemy.corrode && !enemy.boss) {
          dmg *= 1.25;
        }
        if (enemy.glazeT > 0) {
          const g = stats.glazeMul || 0.18;
          dmg *= 1 + (enemy.boss ? (g >= 0.3 ? 0.2 : 0.12) : g);
        }
        if (enemy.weakenT > 0) {
          dmg *= enemy.boss ? 1.12 : 1.25;
        }
        if (enemy.chimeVulnT > 0) {
          dmg *= 1.25;
        }
        if (enemy.inChimeT > 0 && stats.gsyphon) {
          dmg *= 1 + (stats.gsyphon > 1 ? 0.45 : 0.25);
        }
        if (stats.inferno && enemy.burnT > 0) {
          dmg *= 1.2;
        }
        if (enemy.wardedT > 0) {
          dmg *= 0.7;
        }
        // 3.0.0: burst cap (see core/difficulty.js); the Nova and bosses are exempt
        if (!enemy.boss && src !== "nova") {
          const taken = this.burstCap(enemy, dmg);
          if (taken <= 0) {
            enemy.flash = Math.max(enemy.flash, 0.35);
            this.emit("ping", { x: enemy.x, y: enemy.y, resist: true });
            return;
          }
          dmg = taken;
        }
        dmg = this.capPhase(enemy, dmg);
        enemy.hp -= dmg;
        this.dmgDealt += Math.min(dmg, enemy.hp + dmg);
        this.credit(src, Math.min(dmg, enemy.hp + dmg));
        enemy.flash = 1;
        // Tolling Dusk Endless Omen: elites/heavies ring a telegraphed bronze shock-chime once at 50% HP
        if (
          this.mods?.armored &&
          !enemy.boss &&
          !enemy.duskRung &&
          enemy.hp > 0 &&
          enemy.hp <= enemy.maxHp * 0.5 &&
          (enemy.elite || (enemy.def?.cost || 0) >= 3)
        ) {
          enemy.duskRung = true;
          this.hazard({
            x: enemy.x,
            y: enemy.y,
            r: 2.2,
            delay: 0.9,
            dmg: enemy.dmg * 0.85,
            kind: "shorted",
            src: enemy.type,
          });
          this.emit("shortArm", { x: enemy.x, y: enemy.y, r: 2.2 });
        }
        if (knock) {
          let len = Math.hypot(dx, dy) || 1,
            anchorMul = enemy.anchored ? 0.65 : 1,
            knockMul = (enemy.boss ? 0.04 : 1 / (0.6 + enemy.r * enemy.r * 1.6)) * anchorMul;
          enemy.kx += (dx / len) * knock * knockMul * 2.2;
          enemy.ky += (dy / len) * knock * knockMul * 2.2;
        }
        if (enemy.boss) {
          this.addNova(dmg * 0.045);
          if (src === "weapon" || src === "wingman" || src === "payload" || src === "arc") {
            bossCardBossHit(this, enemy);
            this.player.bossHits = (this.player.bossHits || 0) + 1;
            if (stats.surge && this.player.bossHits % 18 === 0 && !this._rlSurging) {
              const r = stats.surge > 1 ? 4.2 : 3.6;
              this._rlSurging = true;
              try {
                this.explode(enemy.x, enemy.y, r, (stats.surge > 1 ? 95 : 65) * stats.dmgMul, {
                  enemies: true,
                  knock: 6,
                  kind: "surge",
                });
              } finally {
                this._rlSurging = false;
              }
              this.emit("surge", { x: enemy.x, y: enemy.y, r, n: this.combo, i: 1 });
            }
            if (stats.siphonCh && this.player.bossHits % 25 === 0) {
              this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, Math.max(8, (stats.siphonHp || 4) * 2)));
            }
          }
        }
        this.emit("dmg", {
          x: enemy.x,
          y: enemy.y,
          v: dmg,
          crit: crit,
          superCrit: !!(extra && extra.superCrit),
          id: enemy.id,
          type: enemy.type,
        });
        if (enemy.hp <= 0) {
          this.killEnemy(enemy);
        }
      }
    }
    // how much of a hit lands: at most burstFraction(wave) of the enemy's hull per BURST_WINDOW
    burstCap(enemy, dmg) {
      const fraction = burstFraction(this.wave);
      if (fraction >= 1) return dmg;
      if (this.time - (enemy.burstT ?? -9) > BURST_WINDOW) {
        enemy.burstT = this.time;
        enemy.burstD = 0;
      }
      const room = Math.max(0, enemy.maxHp * fraction - enemy.burstD),
        taken = Math.min(dmg, room);
      enemy.burstD += taken;
      return taken;
    }
    // Unified HP-gated phase cap across all 6 Guardians so burst DPS cannot skip Phase 2/3 transitions
    capPhase(enemy, dmg) {
      if (!enemy.boss) return dmg;
      const marks = enemy.type === "core" ? [0.66, 0.33] : [0.5];
      for (const frac of marks) {
        const mark = enemy.maxHp * frac;
        if (enemy.hp > mark && enemy.hp - dmg < mark) return Math.max(0, enemy.hp - (mark - 1));
      }
      return dmg;
    }
    credit(src, amount) {
      if (amount > 0) {
        this.dmgSrc[src] = (this.dmgSrc[src] || 0) + amount;
      }
    }
    killEnemy(enemy) {
      if (enemy.dead) return;
      const kills0 = this.kills;
      enemy.dead = true;
      enemy.hp = 0;
      let def = enemy.def;
      if (enemy.cleanup) {
        this.emit("kill", {
          type: enemy.type,
          x: enemy.x,
          y: enemy.y,
          elite: enemy.elite,
          boss: false,
          r: enemy.r,
          cleanup: true,
        });
        return;
      }
      const alive = this.player.alive;
      if (!enemy.boss && alive) {
        this.kills++;
        if (!enemy.noCombo) {
          this.addCombo(enemy.x, enemy.y);
        }
        this.addNova(2.5 * Math.max(1, def.cost) * (enemy.elite ? 3 : 1));
        if (!enemy.noDrop) bossCardKill(this, enemy);
        let stats = this.stats,
          player = this.player;
        // Resonance Well ('gsyphon'): kills inside a Lodestone Chime refund 15% of Chime cooldown
        if (stats.gsyphon && enemy.inChimeT > 0 && player.gadgetN < stats.gadgetMax) {
          player.gadgetT = Math.max(0, player.gadgetT - stats.gadgetCd * 0.15);
          if (player.gadgetT <= 0) {
            player.gadgetN++;
            player.gadgetT = player.gadgetN < stats.gadgetMax ? stats.gadgetCd : 0;
            this.emit("gadgetReady", { n: player.gadgetN });
          }
        }
        if (stats.siphonCh && this.rng.chance(stats.siphonCh)) {
          const heal = stats.siphonHp || 4;
          player.hp = Math.min(stats.maxHp, player.hp + heal);
          this.emit("heal", { x: player.x, y: player.y, v: heal });
        }
        if (stats.bloodrush) {
          player.rushN = Math.min(10, player.rushN + 1);
          player.rushT = 4;
        }
        if (!enemy.noDrop) {
          if (stats.bounty && enemy.elite) {
            this.dropShards(player.x, player.y, stats.bounty);
            this.emit("bountyPulse", { x: player.x, y: player.y, amount: stats.bounty });
          }
          if (stats.capacitor) {
            this.addNova(stats.capacitor, true);
          }
        }
      }
      // Gilded Caravan Treasure Automaton jackpot
      if (enemy.caravan && alive) {
        this.dropShards(enemy.x, enemy.y, 15);
        this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, 25));
        this.emit("bountyPulse", { x: enemy.x, y: enemy.y, amount: 15 });
      }
      if (!enemy.noDrop && alive) {
        let shards =
          (enemy.boss ? def.shards : def.shards * (enemy.elite ? 4 : 1) * 0.4) *
          (this.event ? waveEvents[this.event].shardMul : 1);
        this.dropShards(enemy.x, enemy.y, shards);
        let hpFrac = this.player.hp / this.stats.maxHp,
          healChance = enemy.boss ? 1 : enemy.elite ? 0.5 : hpFrac < 0.5 ? 0.045 : 0.02;
        if (this.rng.chance(healChance)) {
          this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, enemy.boss ? 40 : 15));
        }
      }
      this.emit("kill", {
        type: enemy.type,
        x: enemy.x,
        y: enemy.y,
        elite: enemy.elite,
        boss: enemy.boss,
        r: enemy.r,
      });
      if (enemy.type === "splitter")
        for (let i = 0; i < 3; i++) {
          let angle = (i / 3) * TAU + this.rng.next(),
            mite = this.spawnEnemy("mite", enemy.x + Math.cos(angle) * 0.6, enemy.y + Math.sin(angle) * 0.6, {
              elite: false,
              noDrop: false,
            });
          if (enemy.elite) mite.maxHp = mite.hp = mite.hp * 2;
          mite.spawnT = 0;
          mite.kx = Math.cos(angle) * 6;
          mite.ky = Math.sin(angle) * 6;
        }
      // Wildfire ('inferno'): 2.8m hearth-blast dealing min(140*dmgMul, 30*dmgMul + 25% maxHp) + spreads 100% burn
      if (this.stats.inferno && enemy.burnT > 0 && !enemy.boss) {
        let burnDps = Math.max(8 * this.stats.dmgMul, enemy.burnDps);
        this.hash.query(enemy.x, enemy.y, 2.8, (other) => {
          if (!(other.dead || other === enemy || Math.hypot(other.x - enemy.x, other.y - enemy.y) > 2.8 + other.r)) {
            other.burnT = Math.max(other.burnT, 3);
            other.burnDps = Math.max(other.burnDps, burnDps);
            other.burnStacks = Math.max(other.burnStacks || 0, enemy.burnStacks || 1);
            other.burnSrc = "burn";
          }
        });
        const blastDmg = Math.min(140 * this.stats.dmgMul, 30 * this.stats.dmgMul + 0.25 * enemy.maxHp);
        this.explode(enemy.x, enemy.y, 2.8, blastDmg, { enemies: true, knock: 2.5, kind: "inferno" });
      }
      if (enemy.variant === "bloomed") {
        this.arena.acid.push({ x: enemy.x, y: enemy.y, r: 1.4, life: 5 });
      }
      if (enemy.variant === "shorted") {
        const src = this._src;
        this._src = enemy.type;
        this.hazard({ x: enemy.x, y: enemy.y, r: SHORT_R, delay: SHORT_DELAY, dmg: enemy.dmg * 0.6, kind: "shorted" });
        this._src = src;
        this.emit("shortArm", { x: enemy.x, y: enemy.y, r: SHORT_R });
      }
      if (enemy.variant === "flareheart") {
        const src = this._src;
        this._src = enemy.type;
        this.hazard({ x: enemy.x, y: enemy.y, r: 1.7, delay: 0.5, dmg: enemy.dmg * 0.7, kind: "fire" });
        this._src = src;
      }
      if (enemy.champion) {
        this.champion = null;
        this.pickups.push(this.mkPickup("heal", enemy.x, enemy.y, 25));
        this.dropShards(enemy.x, enemy.y, 20);
        this.hash.query(enemy.x, enemy.y, 8, (other) => {
          if (!other.dead && other !== enemy && !other.boss) {
            other.slowT = Math.max(other.slowT, 2.5);
          }
        });
        this.emit("championDown", { x: enemy.x, y: enemy.y, type: enemy.type });
      }
      if (this.event === "gilded" && enemy.elite) {
        this.player.gildT = Math.max(this.player.gildT || 0, 3.2);
        this.dropShards(enemy.x, enemy.y, 2);
        this.emit("bountyPulse", { x: enemy.x, y: enemy.y, amount: 2 });
      }
      if (enemy.affix === "volatile") {
        let src = this._src;
        this._src = enemy.type;
        this.hazard({ x: enemy.x, y: enemy.y, r: 2.3, delay: 0.75, dmg: enemy.dmg * 1.1, kind: "volatile" });
        this._src = src;
      }
      if (enemy.type === "bomber" && enemy.st !== 3) {
        this.explode(enemy.x, enemy.y, 2.3, 30 * this.stats.dmgMul, { enemies: true, kind: "pop" });
      }
      if (enemy.parent) {
        let parent = enemy.parentRef && !enemy.parentRef.dead ? enemy.parentRef : null;
        if (!parent) parent = this.enemies.find((other) => other.id === enemy.parent) || null;
        if (parent) {
          parent.kids = Math.max(0, parent.kids - 1);
        }
      }
      if (enemy.boss) {
        this.triggerHitstop(0.035);
        if (alive) this.bossKills.push(enemy.type);
        this.boss = null;
        for (let other of this.enemies) {
          if (!other.dead) {
            other.noDrop = true;
            other.noCombo = true;
            other.affix = null;
            other.cleanup = true;
            this.killEnemy(other);
          }
        }
        for (let bullet of this.eb) bullet.life = 0;
        this.beams.length = 0;
        this.hazards.length = 0;
        this.markers = [];
        this.planIdx = this.plan.length;
        this.emit("bossDown", {
          id: enemy.type,
          x: enemy.x,
          y: enemy.y,
          secs: this.bossT0 == null ? null : this.time - this.bossT0,
          damage: this.runStats.dmgTaken - (this.bossDmg0 || 0),
        });
      }
      if (enemy.boss || this.kills <= kills0 || !this.player.alive) return;
      if (enemy.type === "carrier" && this.state === "fight" && this.rng.chance(0.55)) {
        const value = rlCacheShards(this, 5 + 3 * (this.stats.cacheBonus || 0)),
          pickup = this.mkPickup("shard", enemy.x, enemy.y, value);
        pickup.vx = 0;
        pickup.vy = 0;
        pickup.cache = true;
        this.pickups.push(pickup);
      }
    }
    addCombo(cx, cy) {
      this.combo++;
      this.comboT = 2.2;
      if (this.combo > this.bestCombo) {
        this.bestCombo = this.combo;
      }
      for (let [at, bonus] of comboRewards) {
        if (this.combo === at) {
          this.shards += bonus;
          this.emit("combo", { n: at, bonus: bonus });
        }
      }
      // Bell-Chime Cadence ('surge'): longer combos, and every 15th (12th) kill detonates a chime wave at the defeated enemy!
      const level = this.stats.surge || 0;
      if (!level) return;
      this.comboT += 0.5 * level;
      const every = level > 1 ? 12 : 15,
        player = this.player;
      if (this.combo % every === 0 && player.alive && this.state === "fight" && !this._rlSurging) {
        const radius = level > 1 ? 4.2 : 3.6,
          ox = cx ?? player.x,
          oy = cy ?? player.y;
        this._rlSurging = true;
        try {
          this.explode(ox, oy, radius, (level > 1 ? 95 : 65) * this.stats.dmgMul, {
            enemies: true,
            knock: 8,
            kind: "surge",
          });
        } finally {
          this._rlSurging = false;
        }
        this.emit("surge", { x: ox, y: oy, r: radius, n: this.combo, i: this.combo / every });
      }
    }
    dropShards(x, y, amount) {
      this.shardFrac = (this.shardFrac || 0) + amount - Math.floor(amount);
      amount = Math.floor(amount);
      if (this.shardFrac >= 1) {
        amount += 1;
        this.shardFrac -= 1;
      }
      amount = Math.max(0, Math.round(amount));
      while (amount > 0) {
        let chunk = amount >= 25 ? 25 : amount >= 5 ? 5 : 1;
        amount -= chunk;
        this.pickups.push(this.mkPickup("shard", x, y, chunk));
        if (this.pickups.length > 260) {
          this.pickups[this.pickups.length - 1].v += amount;
          amount = 0;
        }
      }
    }
    mkPickup(kind, x, y, value) {
      let angle = this.rng.next() * TAU,
        speed = 2 + this.rng.next() * 4;
      return {
        kind: kind,
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        v: value,
        t: 0,
        pull: false,
        dead: false,
        id: this.nextId++,
      };
    }
    explode(x, y, radius, dmg, opts = {}) {
      if (opts.enemies) {
        this.hash.query(x, y, radius, (enemy) => {
          if (enemy.dead || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.r) return;
          this.hurtEnemy(
            enemy,
            dmg,
            enemy.x - x,
            enemy.y - y,
            opts.knock || 3,
            !!opts.crit,
            blastSources[opts.kind] || "weapon",
          );
          if (opts.burn && !enemy.dead && !enemy.shielded && !enemy.ghost) {
            let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
            enemy.burnT = Math.max(enemy.burnT, 3);
            enemy.burnDps = Math.max(burn, opts.burn);
            enemy.burnSrc = "burn";
          }
          if (opts.glaze && !enemy.dead && !enemy.shielded && !enemy.ghost) {
            enemy.glazeT = Math.max(enemy.glazeT || 0, 3.5);
          }
        });
      }
      if (opts.player) {
        let player = this.player;
        if (Math.hypot(player.x - x, player.y - y) < radius + player.r) {
          this.hurtPlayer(opts.dmgPlayer || dmg, x, y, opts.src || this._src);
        }
      }
      this.emit("boom", {
        x: x,
        y: y,
        r: radius,
        kind: opts.kind || "boom",
        src: opts.src ?? this._src ?? null,
        chill: !!opts.chill,
      });
    }
    chainFrom(from, jumps, dmg, hits, src = "weapon") {
      let cur = from,
        pts = [cur.x, cur.y],
        seen = new Set(hits || []),
        chained = 0;
      seen.add(from.id);
      for (let i = 0; i < jumps; i++) {
        let next = null,
          best = 5.5;
        this.hash.query(cur.x, cur.y, 5.5, (enemy) => {
          if (enemy.dead || enemy.ghost || seen.has(enemy.id)) return;
          let dist = Math.hypot(enemy.x - cur.x, enemy.y - cur.y) - enemy.r;
          if (dist < best && this.arena.los(cur.x, cur.y, enemy.x, enemy.y)) {
            best = dist;
            next = enemy;
          }
        });
        if (!next) break;
        seen.add(next.id);
        pts.push(next.x, next.y);
        chained++;
        let target = next;
        this.hurtEnemy(target, dmg, target.x - cur.x, target.y - cur.y, 0.5, false, src);
        cur = target;
      }
      // Thunderhead ('tempest'): if fewer than 2 secondary targets are in range, remaining arcs strike back into primary target at 45% dmg
      if (this.stats.tempest && chained < 2 && !from.dead && !from.ghost) {
        const extraArcs = Math.max(0, jumps - chained);
        for (let i = 0; i < extraArcs && !from.dead; i++) {
          this.hurtEnemy(from, dmg * 0.45, 0, 0, 0.25, false, src);
          const a = (i * 2.1) % TAU;
          pts.push(from.x + Math.cos(a) * (from.r + 0.7), from.y + Math.sin(a) * (from.r + 0.7), from.x, from.y);
        }
      }
      if (pts.length > 2) {
        this.emit("chain", { pts: pts });
      }
    }
    updatePBullets(dt) {
      let stats = this.stats,
        arena = this.arena,
        player = this.player;
      for (let bullet of this.pb) {
        if (bullet.life <= 0) continue;
        bullet.life -= dt;
        bullet.age += dt;
        if (bullet.boom) {
          if (!bullet.back && bullet.age >= bullet.turn) {
            bullet.back = true;
            bullet.hits.length = 0;
          }
          if (bullet.back) {
            let dx = player.x - bullet.x,
              dy = player.y - bullet.y,
              dist = Math.hypot(dx, dy) || 0.001;
            if (dist < 0.9 || !player.alive || bullet.age > 4) {
              bullet.life = 0;
              continue;
            }
            let damp = dampFactor(9, dt),
              speed = bullet.sp * 1.15;
            bullet.vx += ((dx / dist) * speed - bullet.vx) * damp;
            bullet.vy += ((dy / dist) * speed - bullet.vy) * damp;
          } else {
            if (bullet.homing > 0 && bullet.age > 0.05) {
              this.home(bullet, dt);
            }
          }
        } else {
          if (bullet.homing > 0 && bullet.age > 0.05) {
            this.home(bullet, dt);
          }
        }
        if (bullet.drag) {
          let keep = 1 - bullet.drag * dt;
          bullet.vx *= keep;
          bullet.vy *= keep;
          bullet.r = Math.min(1.3, bullet.r + bullet.grow * dt);
        }
        let prevX = bullet.x,
          prevY = bullet.y;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        let hitWall = false,
          wallFrac = 1,
          travel = Math.hypot(bullet.vx, bullet.vy) * dt,
          steps = travel > 0.4 ? Math.ceil(travel / 0.4) : 1,
          pierceWalls = stats.lance && bullet.w === "rail";
        for (let i = 1; i <= steps; i++) {
          let frac = i / steps,
            sx = prevX + (bullet.x - prevX) * frac,
            sy = prevY + (bullet.y - prevY) * frac;
          if (arena.outside(sx, sy)) {
            bullet.x = sx;
            bullet.y = sy;
            hitWall = true;
            wallFrac = frac;
            break;
          }
          const inWall = arena.blocked(sx, sy, bullet.r * 0.5);
          if (inWall && !pierceWalls) {
            bullet.x = sx;
            bullet.y = sy;
            hitWall = true;
            wallFrac = frac;
            break;
          }
          // Astral Lance: track each pierced monolith/obstacle for +22% damage per pierce
          if (pierceWalls) {
            if (inWall && !bullet.inWall) {
              bullet.inWall = true;
              bullet.pierceCount = (bullet.pierceCount || 0) + 1;
            } else if (!inWall) {
              bullet.inWall = false;
            }
          }
        }
        let reach = Math.hypot(bullet.vx, bullet.vy) * dt * wallFrac,
          probes = Math.max(hitWall ? 2 : 1, reach > 0.5 ? Math.ceil(reach / 0.5) : 1),
          rail = !!weaponDefs[bullet.w].rail,
          bounces = bullet.bounce,
          back = bullet.back;
        if (
          this.state === "fight" &&
          bullet.life > 0 &&
          !bullet.trapHit &&
          (this.traps.length || this.hazards.length)
        ) {
          if (rlShootTrap(this, bullet, prevX, prevY)) {
            bullet.trapHit = true;
            this.emit("spark", { x: bullet.x, y: bullet.y, w: bullet.w });
            if (bullet.pierce-- <= 0 && !bullet.boom) bullet.life = 0;
          }
        }
        // Courtyard Bell-Censers & Caldera Fumaroles: shooting a charging vent triggers its friendly interaction!
        if (
          this.state === "fight" &&
          bullet.life > 0 &&
          !bullet.bellHit &&
          (arena.biome.id === "courtyard" || arena.biome.id === "caldera") &&
          arena.vents.length
        ) {
          const isCourtyard = arena.biome.id === "courtyard",
            segDx = bullet.x - prevX,
            segDy = bullet.y - prevY,
            segLen2 = segDx * segDx + segDy * segDy;
          for (const vent of arena.vents) {
            const cycleId = Math.floor((this.waveT + vent.phase) / vent.period);
            const warn = arena.ventState(vent, this.waveT) === "warn" || (isCourtyard && vent.bossTollT > 0);
            if (vent.rungCycle === cycleId || !warn) continue;
            const along =
              segLen2 > 1e-8 ? clamp(((vent.x - prevX) * segDx + (vent.y - prevY) * segDy) / segLen2, 0, 1) : 0;
            const cx = prevX + segDx * along - vent.x,
              cy = prevY + segDy * along - vent.y,
              hitR = Math.min(vent.r * 0.72, 1.35) + bullet.r;
            if (cx * cx + cy * cy <= hitR * hitR) {
              bullet.bellHit = true;
              if (isCourtyard) this.ringCourtyardBell(vent, cycleId, true);
              else overpressureFumarole(this, vent, cycleId);
              this.emit("spark", { x: vent.x, y: vent.y, w: bullet.w });
              break;
            }
          }
        }
        for (let i = 0; i < probes && bullet.life > 0; i++) {
          let frac = probes > 1 ? ((i + 1) / probes - 1) * wallFrac : 0,
            sx = bullet.x + bullet.vx * dt * frac,
            sy = bullet.y + bullet.vy * dt * frac;
          this.hash.query(sx, sy, bullet.r + 0.8, (enemy) => this.probeHit(bullet, enemy, sx, sy, rail));
        }
        if (this.state === "fight" && !bullet.prismBoost && arena.props && arena.props.length) {
          for (const prop of arena.props) {
            if (prop.kind === "prism" && prop.auraT > 0) {
              const dx = bullet.x - prop.x,
                dy = bullet.y - prop.y;
              if (dx * dx + dy * dy <= 20.25) {
                bullet.prismBoost = true;
                bullet.dmg *= 1.25;
                break;
              }
            }
          }
        }
        if (this.state === "fight" && !bullet.propHit && arena.props && arena.props.length) {
          const segDx = bullet.x - prevX,
            segDy = bullet.y - prevY,
            segLen2 = segDx * segDx + segDy * segDy;
          for (const prop of arena.props) {
            if (prop.cd > 0 || prop.fuse > 0) continue;
            const along =
              segLen2 > 1e-8 ? clamp(((prop.x - prevX) * segDx + (prop.y - prevY) * segDy) / segLen2, 0, 1) : 0;
            const cx = prevX + segDx * along - prop.x,
              cy = prevY + segDy * along - prop.y,
              hitR = prop.r + bullet.r + 0.1;
            if (cx * cx + cy * cy <= hitR * hitR) {
              bullet.propHit = true;
              this.triggerBiomeProp(prop);
              this.emit("spark", { x: prop.x, y: prop.y, w: bullet.w });
              break;
            }
          }
        }
        if (hitWall && bullet.life > 0 && bullet.bounce === bounces && bullet.back === back) {
          if (bullet.boom && !bullet.back) {
            bullet.back = true;
            bullet.hits.length = 0;
            bullet.x -= bullet.vx * dt;
            bullet.y -= bullet.vy * dt;
            this.emit("spark", { x: bullet.x, y: bullet.y, w: bullet.w });
            continue;
          }
          bullet.life = 0;
          if (
            bullet.bomblet ||
            bullet.w === "rocket" ||
            weaponDefs[bullet.w]?.explode ||
            (stats.payloadR && !bullet.drag)
          ) {
            this.bulletBurst(bullet, null);
          }
          if (!bullet.drag) {
            this.emit("spark", { x: bullet.x, y: bullet.y, w: bullet.w });
          }
          continue;
        }
      }
    }
    // one enemy near a sample point of a player shot: the bulwark's shield or a hit (returns true to stop the query)
    probeHit(bullet, enemy, sx, sy, rail) {
      const stats = this.stats;
      if (bullet.life <= 0) return true;
      if (enemy.dead || enemy.spawnT > 0.15 || enemy.ghost) return;
      let dx = enemy.x - sx,
        dy = enemy.y - sy;
      if (enemy.type === "bulwark" && !rail && enemy.guardDown <= 0 && !bullet.hits.includes(enemy.id)) {
        let dist = Math.hypot(dx, dy),
          guardR = enemy.r + 0.75 + bullet.r;
        if (dist < guardR && Math.abs(angleDiff(enemy.face, Math.atan2(-dy, -dx))) < 1.15) {
          let gx = enemy.x + Math.cos(enemy.face) * (enemy.r + 0.45),
            gy = enemy.y + Math.sin(enemy.face) * (enemy.r + 0.45);
          if (bullet.boom && !bullet.back) {
            bullet.back = true;
            bullet.hits.length = 0;
          } else {
            if (bullet.drag) {
              bullet.hits.push(enemy.id);
              if (bullet.pierce-- <= 0) {
                bullet.life = 0;
              }
            } else {
              bullet.life = 0;
              if (bullet.w === "rocket" || bullet.bomblet || weaponDefs[bullet.w]?.explode || stats.payloadR) {
                bullet.x = gx;
                bullet.y = gy;
                this.bulletBurst(bullet, null);
              }
            }
          }
          enemy.guard -= bullet.dmg * (stats.hunter ? 2 : 1);
          enemy.guardFlash = 1;
          if (enemy.guard <= 0) {
            enemy.guardDown = 4;
            this.emit("guardBreak", { x: gx, y: gy });
          } else {
            if (!bullet.drag || this.rng.chance(0.2)) {
              this.emit("block", { x: gx, y: gy });
            }
          }
          return true;
        }
      }
      let hitR = enemy.r + bullet.r;
      if (!(dx * dx + dy * dy > hitR * hitR || bullet.hits.includes(enemy.id))) {
        this.bulletHit(bullet, enemy);
      }
    }
    home(bullet, dt) {
      let heading = Math.atan2(bullet.vy, bullet.vx),
        target = bullet.tgt;
      if (!target || target.dead || target.ghost || bullet.hits.includes(target.id) || bullet.tgtT < this.time - 0.15) {
        target = null;
        let best = 8;
        this.hash.query(bullet.x, bullet.y, 8, (enemy) => {
          if (enemy.dead || enemy.ghost || bullet.hits.includes(enemy.id)) return;
          let dx = enemy.x - bullet.x,
            dy = enemy.y - bullet.y,
            dist = Math.hypot(dx, dy);
          if (!(dist > best || Math.abs(angleDiff(heading, Math.atan2(dy, dx))) > 1.3)) {
            best = dist;
            target = enemy;
          }
        });
        bullet.tgt = target;
        bullet.tgtT = this.time;
      }
      if (!target) return;
      let angle = turnToward(heading, Math.atan2(target.y - bullet.y, target.x - bullet.x), bullet.homing * dt),
        speed = Math.hypot(bullet.vx, bullet.vy);
      bullet.vx = Math.cos(angle) * speed;
      bullet.vy = Math.sin(angle) * speed;
      bullet.a = angle;
    }
    bulletHit(bullet, enemy) {
      let stats = this.stats,
        weapon = weaponDefs[bullet.w],
        procMul = bullet.procMul ?? 1;
      bullet.hits.push(enemy.id);
      // Firefly Volley sparks ('bomblet') detonate directly via AoE — no double-hit on impact!
      if (bullet.bomblet) {
        bullet.life = 0;
        this.bulletBurst(bullet, enemy);
        return;
      }
      let baseHit = bullet.dmg;
      // Point-Blank Barrel ('pointblank'): +16% * lv damage to foes within 5.5m
      if (stats.pointblank > 0 && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= 5.5) {
        baseHit *= 1 + 0.16 * stats.pointblank;
      }
      // Astral Lance ('lance'): +22% damage per pierced foe or monolith
      if (stats.lance && bullet.w === "rail" && (bullet.pierceCount || 0) > 0) {
        baseHit *= 1 + 0.22 * bullet.pierceCount;
      }
      // Cinder-Bellows ('stoke'): +18% / +32% damage to burning foes + instant 0.35s burn detonation
      let immune = enemy.shielded || enemy.ghost;
      if (stats.stoke > 0 && enemy.burnT > 0 && !immune) {
        baseHit *= 1 + (stats.stoke > 1 ? 0.32 : 0.18);
      }
      let crit = this.rng.chance(stats.crit),
        superCrit = false,
        effCritMul = stats.critMul + (stats.lance && bullet.w === "rail" && enemy.boss ? 0.3 : 0),
        dmg = baseHit * (crit ? effCritMul : 1);
      // Prismatic Refraction ('overcrit'): crits can Super-Crit (3.0x) and arc a prismatic ray
      if (crit && stats.overcrit > 0) {
        const superCh = Math.min(1, 0.3 * stats.overcrit + Math.max(0, stats.crit - 0.6));
        if (this.rng.chance(superCh)) {
          superCrit = true;
          dmg = baseHit * 3.0;
        }
      }
      bullet.crit = crit;
      this.hurtEnemy(
        enemy,
        dmg,
        bullet.vx,
        bullet.vy,
        weapon.knock,
        crit,
        bullet.wing ? "wingman" : "weapon",
        superCrit ? { superCrit: true } : null,
      );
      if (superCrit) {
        // Prismatic arc to nearest secondary target
        let near = null,
          best = 6.5;
        this.hash.query(enemy.x, enemy.y, 6.5, (other) => {
          if (other.dead || other.ghost || other === enemy) return;
          const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          if (d < best) {
            best = d;
            near = other;
          }
        });
        if (near) {
          this.hurtEnemy(near, dmg * 0.5, near.x - enemy.x, near.y - enemy.y, 1, true, "weapon", { superCrit: true });
          this.emit("chain", { pts: [enemy.x, enemy.y, near.x, near.y], prism: true });
        }
      }
      // Cinder-Bellows instant 0.35s burn burst
      if (stats.stoke > 0 && enemy.burnT > 0 && !enemy.dead && !immune && enemy.burnDps > 0) {
        this.hurtEnemy(enemy, enemy.burnDps * 0.35, bullet.vx, bullet.vy, 0, false, "burn");
      }
      // Solar Repeater ('overdrive') 1.8m radiant splash
      if (bullet.solarSplash) {
        this.explode(enemy.x, enemy.y, bullet.solarSplash, dmg * 0.65, {
          enemies: true,
          knock: 2.2,
          kind: "overload",
          crit,
        });
      }
      // Kiln Surge ('overload'): every 120 base weapon damage dealt fires a directional 5.5m kiln-flare cone
      if (stats.overload > 0 && !bullet.wing) {
        this.player.kilnAcc = (this.player.kilnAcc || 0) + (bullet.baseDmg || weapon.dmg);
        if (this.player.kilnAcc >= 120) {
          this.player.kilnAcc -= 120;
          const coneA = bullet.a,
            coneDmg = (55 + 25 * stats.overload) * stats.dmgMul;
          this.hash.query(this.player.x + Math.cos(coneA) * 2.8, this.player.y + Math.sin(coneA) * 2.8, 3.4, (foe) => {
            if (foe.dead || foe.ghost) return;
            const fx = foe.x - this.player.x,
              fy = foe.y - this.player.y,
              fd = Math.hypot(fx, fy);
            if (fd <= 5.5 + foe.r && Math.abs(angleDiff(coneA, Math.atan2(fy, fx))) <= 0.58) {
              this.hurtEnemy(foe, coneDmg, fx, fy, 4.5, false, "overload");
            }
          });
          this.emit("boom", {
            x: this.player.x + Math.cos(coneA) * 2.2,
            y: this.player.y + Math.sin(coneA) * 2.2,
            r: 2.6,
            kind: "overload",
          });
        }
      }
      let bounced = false;
      if (stats.cryo && !immune && this.rng.chance(stats.cryo * procMul)) {
        enemy.slowT = 2;
        this.emit("freeze", { x: enemy.x, y: enemy.y });
      }
      // Stackable Embers ('thermite'): up to 5 stacks capped at 2.2 * hitDmg * weapon.rate over 3s
      if (bullet.drag && stats.burn && !enemy.dead && !immune) {
        let burn = enemy.burnT > 0 ? enemy.burnDps : 0;
        enemy.burnT = Math.max(enemy.burnT, stats.thermite ? 3 : 2.5);
        enemy.burnDps = Math.max(burn, stats.burn * stats.burnMul * stats.dmgMul * (1 + (stats.thermite || 0)));
        enemy.burnSrc = "burn";
      } else if (stats.thermite && !enemy.dead && !immune) {
        const cap = 2.2 * dmg * Math.max(1, weapon.rate || 1);
        enemy.burnT = 3;
        if ((enemy.burnStacks || 0) < 5) {
          enemy.burnStacks = (enemy.burnStacks || 0) + 1;
          enemy.burnDps = Math.min(cap, (enemy.burnDps || 0) + dmg * stats.thermite);
        } else {
          enemy.burnDps = Math.min(cap, Math.max(enemy.burnDps || 0, dmg * stats.thermite));
        }
        enemy.burnSrc = "burn";
      }
      if (stats.chain) {
        this.chainFrom(enemy, stats.chain, dmg * stats.chainF, bullet.hits);
      }
      if (stats.arc && this.rng.chance(stats.arc * procMul * (bullet.drag ? 0.25 : 1))) {
        this.chainFrom(enemy, stats.arcJumps, dmg * 0.6, bullet.hits, "arc");
      }
      if (
        bullet.w === "rocket" ||
        weaponDefs[bullet.w]?.explode ||
        (stats.payloadR && (!bullet.drag || this.rng.chance(0.2 * procMul)))
      ) {
        this.bulletBurst(bullet, enemy);
      }
      if (bullet.bounce > 0) {
        let next = null,
          best = 8;
        this.hash.query(enemy.x, enemy.y, 8, (other) => {
          if (other.dead || other.ghost || bullet.hits.includes(other.id)) return;
          let dist = Math.hypot(other.x - enemy.x, other.y - enemy.y);
          if (dist < best && this.arena.los(enemy.x, enemy.y, other.x, other.y, 0.1)) {
            best = dist;
            next = other;
          }
        });
        if (next) {
          bullet.bounce--;
          bullet.pierceCount = (bullet.pierceCount || 0) + 1;
          if (stats.momentum > 0) {
            bullet.dmg *= 1 + (stats.momentum > 1 ? 0.38 : 0.22);
            bullet.r *= 1.15;
          }
          let speed = Math.hypot(bullet.vx, bullet.vy),
            angle = Math.atan2(next.y - enemy.y, next.x - enemy.x);
          bullet.x = enemy.x;
          bullet.y = enemy.y;
          bullet.vx = Math.cos(angle) * speed;
          bullet.vy = Math.sin(angle) * speed;
          bullet.a = angle;
          bullet.life = Math.max(bullet.life, 0.35);
          this.emit("bounce", { x: enemy.x, y: enemy.y });
          bounced = true;
        }
      }
      if (!bounced) {
        if (bullet.pierce > 0) {
          bullet.pierce--;
          bullet.pierceCount = (bullet.pierceCount || 0) + 1;
          if (stats.momentum > 0) {
            bullet.dmg *= 1 + (stats.momentum > 1 ? 0.38 : 0.22);
            bullet.r *= 1.15;
          }
        } else {
          bullet.life = 0;
        }
      }
      // Spore-Dew Glaze ('acidcoat'): applies 3.5s Vitriol Glaze (+18%/+30%, works on Guardians!) + trailing pools
      if (stats.acidCoat > 0 && this.state === "fight" && !enemy.dead && !immune) {
        const glazeCh = (stats.acidCoat > 1 ? 0.6 : 0.35) * procMul * (bullet.drag ? 0.45 : 1);
        if (this.rng.chance(glazeCh)) {
          enemy.glazeT = Math.max(enemy.glazeT || 0, 3.5);
        }
      }
    }
    bulletBurst(bullet, enemy) {
      let stats = this.stats,
        weapon = weaponDefs[bullet.w],
        x = enemy ? enemy.x : bullet.x,
        y = enemy ? enemy.y : bullet.y;
      const power = (bullet.dm ?? stats.dmgMul) * (bullet.mul || 1),
        glaze = stats.acidCoat > 0;
      let crit = false;
      if (weapon?.explode && !bullet.wing && !bullet.bomblet && Number.isFinite(weapon.explodeDmg))
        crit = enemy ? !!bullet.crit : this.rng.chance(stats.crit);
      const critMul = crit ? stats.critMul : 1;
      if (bullet.bomblet) {
        this.explode(x, y, 1.5, bullet.dmg, { enemies: true, knock: 1.5, kind: "payload", glaze });
        return;
      }
      if (weapon?.explode && bullet.w !== "rocket" && !bullet.wing) {
        let dmg = Number.isFinite(weapon.explodeDmg) ? weapon.explodeDmg * power * critMul : bullet.dmg,
          size = stats.sizeMul > 1 ? 1.15 : 1;
        this.explode(x, y, weapon.explode * size, dmg, { enemies: true, knock: 3, kind: bullet.w, crit, glaze });
      }
      if (bullet.w === "rocket" && !bullet.wing) {
        let hellfire = stats.hellfire,
          blast = weapon.explodeDmg * power;
        this.explode(x, y, weapon.explode * (stats.sizeMul > 1 ? 1.25 : 1) * (hellfire ? 1.35 : 1), blast * critMul, {
          enemies: true,
          knock: 4,
          kind: "rocket",
          burn: hellfire ? blast * 0.35 : 0,
          crit,
          glaze,
        });
      }
      if (stats.payloadR) {
        this.explode(x, y, stats.payloadR, bullet.dmg * stats.payloadF, {
          enemies: true,
          knock: 1.5,
          kind: "payload",
          glaze,
        });
        if (stats.cluster && !bullet.bomblet && !bullet.clustered) {
          bullet.clustered = true;
          this.bomblets(x, y, bullet.dmg * 0.38);
        }
      }
    }
    bomblets(x, y, dmg) {
      for (let i = 0; i < 2; i++) {
        if (this.pb.length >= MAX_PLAYER_BULLETS) return;
        let angle = this.rng.next() * TAU;
        this.pb.push({
          id: this.nextId++,
          x: x,
          y: y,
          vx: Math.cos(angle) * 11,
          vy: Math.sin(angle) * 11,
          a: angle,
          r: 0.16,
          dmg: dmg,
          life: 0.8,
          pierce: 0,
          bounce: 0,
          hits: [],
          w: "rocket",
          age: 0,
          homing: 6,
          bomblet: true,
          procMul: 0.35,
        });
      }
    }
    ringCourtyardBell(vent, cycleId, friendly) {
      ringCourtyardBell(this, vent, cycleId, friendly);
    }
    courtyardBellPulse(vent, friendly) {
      courtyardBellPulse(this, vent, friendly);
    }
    triggerBiomeProp(prop) {
      return triggerBiomeProp(this, prop);
    }
    fireBiomeProp(prop) {
      fireBiomeProp(this, prop);
    }
    updateBiomeProps(dt) {
      updateBiomeProps(this, dt);
    }
    updateEBullets(dt) {
      let player = this.player,
        arena = this.arena,
        props = arena.props;
      for (let bullet of this.eb)
        if (!(bullet.life <= 0)) {
          let bDt = dt;
          if (props && props.length) {
            for (const prop of props) {
              if (prop.kind === "prism" && prop.auraT > 0) {
                const dx = bullet.x - prop.x,
                  dy = bullet.y - prop.y;
                if (dx * dx + dy * dy <= 20.25) {
                  bDt = dt * 0.42;
                  break;
                }
              }
            }
          }
          bullet.life -= dt;
          bullet.age += dt;
          if (bullet.homing && bullet.age > 0.3 && bullet.age < 2.4 && player.alive) {
            let heading = Math.atan2(bullet.vy, bullet.vx),
              speed = Math.hypot(bullet.vx, bullet.vy),
              angle = turnToward(heading, Math.atan2(player.y - bullet.y, player.x - bullet.x), bullet.homing * bDt);
            bullet.vx = Math.cos(angle) * speed;
            bullet.vy = Math.sin(angle) * speed;
          }
          if (bullet.accel) {
            bullet.vx *= 1 + bullet.accel * bDt;
            bullet.vy *= 1 + bullet.accel * bDt;
          }
          // Sweep fast Endless shots through walls and the player, rather than testing only the endpoint.
          const steps = Math.max(1, Math.ceil((Math.hypot(bullet.vx, bullet.vy) * bDt) / 0.2));
          for (let step = 0; step < steps && bullet.life > 0; step++) {
            bullet.x += (bullet.vx * bDt) / steps;
            bullet.y += (bullet.vy * bDt) / steps;
            if (
              arena.outside(bullet.x, bullet.y, -0.5) ||
              (bullet.solid !== false && arena.blocked(bullet.x, bullet.y, bullet.r * 0.4))
            ) {
              bullet.life = 0;
              this.emit("pop", { x: bullet.x, y: bullet.y });
              break;
            }
            if (player.alive) {
              let dx = player.x - bullet.x,
                dy = player.y - bullet.y,
                hitR = player.r * 0.8 + bullet.r;
              if (dx * dx + dy * dy < hitR * hitR && player.iT <= 0 && player.dashT <= 0) {
                bullet.life = 0;
                if (
                  this.hurtPlayer(bullet.dmg, bullet.x - bullet.vx * 0.05, bullet.y - bullet.vy * 0.05, bullet.src) &&
                  bullet.frost
                ) {
                  player.slowT = 1.6;
                  player.slowKind = "chill";
                  this.emit("chill", { x: player.x, y: player.y });
                }
              }
            }
          }
        }
    }
    shoot(x, y, angle, speed, dmg, opts = {}) {
      if (this.eb.length >= MAX_ENEMY_BULLETS) return null;
      let bullet = {
        x: x,
        y: y,
        vx: Math.cos(angle) * speed * (this.shotMul || 1),
        vy: Math.sin(angle) * speed * (this.shotMul || 1),
        r: opts.r || 0.24,
        dmg: dmg,
        life: opts.life || 5,
        age: 0,
        kind: opts.kind || projectileFor(opts.src || this._src),
        homing: opts.homing || 0,
        accel: opts.accel || 0,
        solid: opts.solid,
        src: opts.src || this._src,
        frost: this._var === "frost",
      };
      this.eb.push(bullet);
      return bullet;
    }
    updateOrbitals(dt) {
      let count = this.stats.orbit;
      if (!count) return;
      let player = this.player,
        radius = this.stats.orbitR,
        dmg = this.stats.orbitDmg * this.stats.dmgMul,
        size = 0.6 * this.stats.bladeScale;
      for (let i = 0; i < count; i++) {
        let angle = this.time * 3.3 + (i * TAU) / count,
          bx = player.x + Math.cos(angle) * radius,
          by = player.y + Math.sin(angle) * radius;
        this.hash.query(bx, by, size, (enemy) => {
          if (!(
            enemy.dead ||
            (enemy.orbAt && enemy.orbAt[i] > this.time) ||
            enemy.spawnT > 0.1 ||
            Math.hypot(enemy.x - bx, enemy.y - by) > enemy.r + size
          )) {
            (enemy.orbAt || (enemy.orbAt = []))[i] = this.time + 0.38;
            this.hurtEnemy(enemy, dmg, enemy.x - player.x, enemy.y - player.y, 2.5, false, "orbit");
          }
        });
        if (this.eb.length)
          for (let bullet of this.eb) {
            if (bullet.life > 0 && Math.abs(bullet.x - bx) < 0.7 && Math.abs(bullet.y - by) < 0.7) {
              bullet.life = 0;
              this.emit("pop", { x: bullet.x, y: bullet.y });
            }
          }
      }
    }
    updateWingman(dt) {
      let count = this.stats.wingmen;
      if (!count) return;
      let player = this.player;
      for (; player.wings.length < count;)
        player.wings.push({ x: player.x, y: player.y, t: player.wings.length * 0.2 });
      let damp = dampFactor(6, dt);
      for (let i = 0; i < count; i++) {
        let wing = player.wings[i],
          offset = [2.3, -2.3, 1.3, -1.3][i] ?? 2.3,
          tx = player.x + Math.cos(player.aim + offset) * 1.5,
          ty = player.y + Math.sin(player.aim + offset) * 1.5;
        wing.x += (tx - wing.x) * damp;
        wing.y += (ty - wing.y) * damp;
        wing.t -= dt;
        if (wing.t > 0) continue;
        let target = null,
          best = 13;
        for (let enemy of this.enemies) {
          if (enemy.dead || enemy.spawnT > 0.2 || enemy.ghost) continue;
          let dist = Math.hypot(enemy.x - wing.x, enemy.y - wing.y) + (enemy.los ? 0 : 7);
          if (dist < best) {
            best = dist;
            target = enemy;
          }
        }
        if (!target) continue;
        wing.t = this.stats.wingCycle || (this.stats.wingman > 1 ? 0.3 : 0.5);
        let angle = Math.atan2(target.y - wing.y, target.x - wing.x),
          spread = this.stats.wingSpread;
        for (let j = 0; j < spread && !(this.pb.length >= MAX_PLAYER_BULLETS); j++) {
          let shotAngle = angle + (j - (spread - 1) / 2) * 0.16;
          this.pb.push({
            id: this.nextId++,
            x: wing.x,
            y: wing.y,
            vx: Math.cos(shotAngle) * 30,
            vy: Math.sin(shotAngle) * 30,
            a: shotAngle,
            r: 0.14,
            dmg: 11 * this.stats.dmgMul * (this.stats.wingDmgMul || 1),
            life: 0.5,
            pierce: 0,
            bounce: 0,
            hits: [],
            w: "pulse",
            age: 0,
            homing: 0,
            wing: true,
            procMul: this.stats.wingProcMul ?? 0.35,
          });
        }
        this.emit("wingShot", { x: wing.x, y: wing.y, a: angle });
      }
    }
    updateTrails(dt) {
      if (!this.trails.length) return;
      // Phantom Wake: 65 * dmgMul DPS (16.25 per 0.25s tick) and 35% slow on foes
      let dmg = 16.25 * this.stats.dmgMul;
      for (let trail of this.trails) {
        trail.life -= dt;
        this.hash.query(trail.x, trail.y, 0.9, (enemy) => {
          if (!(
            enemy.dead ||
            enemy.trailT > this.time ||
            Math.hypot(enemy.x - trail.x, enemy.y - trail.y) > enemy.r + 0.9
          )) {
            enemy.trailT = this.time + 0.25;
            if (!enemy.boss) enemy.slowT = Math.max(enemy.slowT || 0, 0.8);
            this.hurtEnemy(enemy, dmg, 0, 0, 0, false, "trail");
          }
        });
      }
      let w = 0;
      for (let i = 0; i < this.trails.length; i++) if (this.trails[i].life > 0) this.trails[w++] = this.trails[i];
      this.trails.length = w;
    }
    updateBeams(dt) {
      let player = this.player;
      for (let beam of this.beams) {
        beam.t += dt;
        if (beam.swing && beam.t >= beam.warn) {
          const liveT = beam.t - beam.warn;
          beam.a = beam.a0 + Math.sin(liveT * beam.swing) * (beam.rot >= 0 ? 1 : -1) * 0.92;
        } else if (beam.rot) {
          beam.a += beam.rot * dt;
        }
        if (beam.follow) {
          beam.x = beam.follow.x;
          beam.y = beam.follow.y;
          if (beam.follow.dead) {
            beam.t = 999;
          }
        }
        beam.live = beam.t >= beam.warn && beam.t < beam.warn + beam.dur;
        if (beam.rot || beam.swing || beam.follow) {
          beam.cur = this.arena.rayLen(beam.x, beam.y, beam.a, beam.len);
        } else if (!beam.curSet) {
          beam.cur = this.arena.rayLen(beam.x, beam.y, beam.a, beam.len);
          beam.curSet = true;
        }
        if (beam.live && beam.cur > 0) {
          let endX = beam.x + Math.cos(beam.a) * beam.cur,
            endY = beam.y + Math.sin(beam.a) * beam.cur,
            dx = endX - beam.x,
            dy = endY - beam.y,
            lenSq = dx * dx + dy * dy;
          if (player.alive) {
            let along = lenSq > 0 ? ((player.x - beam.x) * dx + (player.y - beam.y) * dy) / lenSq : 0;
            along = clamp(along, 0, 1);
            let cx = beam.x + dx * along,
              cy = beam.y + dy * along,
              hitR = beam.w * 0.5 + player.r * 0.7;
            if (
              (player.x - cx) ** 2 + (player.y - cy) ** 2 < hitR * hitR &&
              this.arena.los(beam.x, beam.y, player.x, player.y)
            ) {
              if (this.hurtPlayer(beam.dmg, cx, cy, beam.src)) {
                if (beam.special === "cryo") {
                  player.slowT = Math.max(player.slowT, 1.5);
                  player.slowKind = "chill";
                  this.emit("chill", { x: player.x, y: player.y });
                } else if (beam.special === "acid") {
                  player.slowT = Math.max(player.slowT, 1.0);
                  player.slowKind = "acid";
                }
              }
            }
          }
          // Glasswyrm Sunglass Spire shatter: sweeping a solar beam through a temporary spire bursts 6 radial splinters
          if (
            (beam.special === "sun" || beam.skin === "sun" || beam.src === "wyrm") &&
            lenSq > 0 &&
            this.arena.obs.length
          ) {
            let shattered = false;
            for (const ob of this.arena.obs) {
              if (!ob.glassSpire || ob.shattered) continue;
              const along = clamp(((ob.x - beam.x) * dx + (ob.y - beam.y) * dy) / lenSq, 0, 1);
              const cx = beam.x + dx * along,
                cy = beam.y + dy * along,
                hitR = beam.w * 0.5 + ob.w * 0.6;
              if ((ob.x - cx) ** 2 + (ob.y - cy) ** 2 <= hitR * hitR) {
                ob.shattered = true;
                ob.life = 0;
                shattered = true;
                for (let k = 0; k < 6; k++) {
                  const sa = (k / 6) * TAU + beam.a;
                  this.shoot(ob.x, ob.y, sa, 11.5, beam.dmg * 0.65, { r: 0.22, src: "wyrm", kind: "glass" });
                }
                this.emit("boom", { x: ob.x, y: ob.y, r: 2.0, kind: "pop", src: "wyrm" });
              }
            }
            if (shattered) {
              this.arena.obs = this.arena.obs.filter((ob) => !ob.shattered);
            }
          }
          // Trap beams affect non-boss enemies too so players can lure packs across them
          if (beam.fromTrap && lenSq > 0) {
            for (const enemy of this.enemies) {
              if (enemy.dead || enemy.boss || enemy.ghost) continue;
              let along = clamp(((enemy.x - beam.x) * dx + (enemy.y - beam.y) * dy) / lenSq, 0, 1);
              let cx = beam.x + dx * along,
                cy = beam.y + dy * along,
                hitR = beam.w * 0.5 + enemy.r * 0.85;
              if ((enemy.x - cx) ** 2 + (enemy.y - cy) ** 2 < hitR * hitR) {
                enemy.trapBeamAcc = (enemy.trapBeamAcc || 0) + enemy.maxHp * 0.14 * dt;
                if (enemy.trapBeamAcc >= Math.max(4, enemy.maxHp * 0.05)) {
                  this.hurtEnemy(enemy, enemy.trapBeamAcc, enemy.x - cx, enemy.y - cy, 0.8, false, "trap");
                  enemy.trapBeamAcc = 0;
                }
                if ((beam.special === "burn" || beam.special === "sun") && !enemy.dead && !enemy.shielded) {
                  enemy.burnT = Math.max(enemy.burnT || 0, 1.8);
                  enemy.burnDps = Math.max(enemy.burnDps || 0, enemy.maxHp * 0.06);
                  enemy.burnSrc = "trap";
                } else if ((beam.special === "shock" || beam.special === "cryo") && !enemy.dead && !enemy.shielded) {
                  enemy.slowT = Math.max(enemy.slowT || 0, beam.special === "cryo" ? 2.0 : 0.8);
                } else if (beam.special === "acid" && !enemy.dead && !enemy.shielded) {
                  enemy.corrodeT = Math.max(enemy.corrodeT || 0, 3.0);
                  enemy.corrode = true;
                }
              }
            }
          }
        }
      }
      let w = 0;
      for (let i = 0; i < this.beams.length; i++)
        if (this.beams[i].t < this.beams[i].warn + this.beams[i].dur) this.beams[w++] = this.beams[i];
      this.beams.length = w;
    }
    beam(opts) {
      let beam = {
        x: opts.x,
        y: opts.y,
        a: opts.a,
        a0: opts.a,
        len: opts.len || 30,
        cur: opts.len || 30,
        w: opts.w || 0.8,
        warn: opts.warn ?? 0.8,
        dur: opts.dur ?? 0.5,
        t: 0,
        rot: opts.rot || 0,
        swing: opts.swing || 0,
        dmg: opts.dmg || 20,
        follow: opts.follow || null,
        live: false,
        color: opts.color || 0,
        skin: opts.skin || null,
        fromTrap: !!opts.fromTrap,
        special: opts.special || null,
        src: opts.src ?? this._src,
      };
      this.beams.push(beam);
      return beam;
    }
    hazard(opts) {
      let hazard = {
        x: opts.x,
        y: opts.y,
        r: opts.r,
        delay: opts.delay ?? 1,
        t: 0,
        dmg: opts.dmg || 20,
        kind: opts.kind || "stomp",
        done: false,
        src: opts.src ?? this._src,
        sx: opts.sx,
        sy: opts.sy,
        chill: !!opts.chill,
        friendly: !!opts.friendly,
        shootable: !!opts.shootable,
        mine: !!opts.mine,
        crucibleBomb: !!opts.crucibleBomb,
        ax: opts.ax,
        ay: opts.ay,
        bx: opts.bx,
        by: opts.by,
      };
      this.hazards.push(hazard);
      return hazard;
    }
    updateHazards(dt) {
      updateHazards(this, dt);
    }
    shortArc(hazard) {
      this.hash.query(hazard.x, hazard.y, hazard.r, (enemy) => {
        if (enemy.dead || enemy.boss || Math.hypot(enemy.x - hazard.x, enemy.y - hazard.y) > hazard.r + enemy.r * 0.5)
          return;
        const burn = enemy.burnT > 0 ? enemy.burnDps : 0;
        enemy.burnT = Math.max(enemy.burnT, 1.5);
        enemy.burnDps = Math.max(burn, enemy.maxHp * 0.1);
        enemy.burnSrc = "shock";
        enemy.slowT = Math.max(enemy.slowT, 1.2);
      });
      const player = this.player;
      if (
        player.alive &&
        player.dashT <= 0 &&
        player.iT <= 0 &&
        this.state === "fight" &&
        Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.r + player.r
      ) {
        player.slowT = Math.max(player.slowT, 0.9);
        player.slowKind = "shock";
        this.emit("stun", { x: player.x, y: player.y, skin: "plate" });
      }
    }
    updatePickups(dt) {
      let player = this.player,
        stats = this.stats,
        vacuum =
          this.state !== "fight" ||
          (this.enemies.length === 0 && this.planIdx >= this.plan.length && !this.bossPending),
        magnet = stats.magnet;
      for (let pickup of this.pickups) {
        if (pickup.dead) continue;
        pickup.t += dt;
        let dx = player.x - pickup.x,
          dy = player.y - pickup.y,
          dist = Math.hypot(dx, dy) || 0.001,
          skip = pickup.kind === "heal" && !pickup.nectar && player.hp >= stats.maxHp - 0.5 && this.state === "fight";
        if (skip && pickup.pull && !vacuum) {
          pickup.pull = false;
        }
        if (!skip && !pickup.pull && pickup.t > 0.35 && (dist < magnet || vacuum)) {
          pickup.pull = true;
        }
        if (pickup.pull && (player.alive || this.state !== "dead")) {
          let speed = 9 + pickup.t * 10 + (vacuum ? 14 : 0);
          pickup.vx += ((dx / dist) * speed - pickup.vx) * dampFactor(9, dt);
          pickup.vy += ((dy / dist) * speed - pickup.vy) * dampFactor(9, dt);
        } else {
          pickup.vx *= 1 - dampFactor(4, dt);
          pickup.vy *= 1 - dampFactor(4, dt);
        }
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        if (!pickup.pull) {
          this.arena.resolve(pickup, 0.2);
        }
        if (dist < player.r + 0.35 && player.alive && !skip) {
          pickup.dead = true;
          if (pickup.kind === "shard") {
            this.shards += pickup.v;
            this.emit("shard", { v: pickup.v });
          } else if (pickup.kind === "heal") {
            let before = player.hp;
            player.hp = Math.min(stats.maxHp, player.hp + pickup.v);
            if (pickup.nectar || this.event === "nectar") player.hopT = Math.max(player.hopT || 0, 2.6);
            this.emit("heal", { x: player.x, y: player.y, v: Math.round(player.hp - before) });
          }
        }
        if (pickup.kind === "heal" && pickup.t > 14 && !pickup.pull) {
          pickup.dead = true;
        }
      }
    }
    updateMarkers(dt) {
      for (let marker of this.markers) {
        marker.t += dt;
        if (!marker.fake && marker.t >= marker.dur && !marker.done) {
          marker.done = true;
          let enemy = this.spawnEnemy(marker.type, marker.x, marker.y, {
            elite: marker.elite,
            champion: marker.champion,
          });
          if (marker.champion) {
            this.champion = enemy;
            this.emit("champion", { type: marker.type, x: marker.x, y: marker.y });
          }
          this.emit("spawn", {
            x: marker.x,
            y: marker.y,
            type: marker.type,
            elite: marker.elite,
            variant: enemy.variant || null,
            affix: enemy.affix || null,
          });
          enemy.face = Math.atan2(this.player.y - marker.y, this.player.x - marker.x);
        }
      }
      this.markers = this.markers.filter((marker) => !marker.done);
    }
    updateSpawns(dt) {
      if (this.planIdx >= this.plan.length && !this.bossPending && !this.boss && this.enemies.length <= 4) {
        this.stragglerT += dt;
        if (this.stragglerT > 9) for (let enemy of this.enemies) enemy.hunt = true;
      } else this.stragglerT = 0;
      if (this.bossPending && this.waveT > 1.6) {
        let id = this.bossPending;
        this.bossPending = null;
        this.spawnBoss(id);
      }
      // Gilded Caravan: spawns a marching Treasure Automaton once per gilded wave
      if (this.event === "gilded" && !this.caravan && !this.bossPending && !this.boss && this.waveT >= 2.0) {
        const dir = this.rng.chance(0.5) ? 1 : -1,
          cx = -dir * (this.arena.W - 2.2),
          cy = this.rng.range(-this.arena.H * 0.4, this.arena.H * 0.4),
          auto = this.spawnEnemy("carrier", cx, cy, { elite: true, hpF: 0.7, noVariant: true });
        auto.caravan = true;
        auto.spawnT = 0.4;
        this.caravan = { enemy: auto, dir, dropT: 0.9, done: false };
        this.emit("spawn", { x: cx, y: cy, type: "carrier", elite: true });
      }
      if (this.championPending && this.waveT > 5 && !this.hold) {
        let spot = this.arena.freePoint(this.rng, this.player.x, this.player.y, 9, 1.6);
        this.markers.push({
          x: spot.x,
          y: spot.y,
          t: 0,
          dur: 1.6,
          type: this.championPending,
          elite: true,
          champion: true,
          done: false,
        });
        this.championPending = null;
      }
      if (this.planIdx >= this.plan.length || this.hold) return;
      this.groupT -= dt;
      let crowd = this.enemies.length + this.markers.length,
        cap = Math.min(70, 26 + Math.round(this.wave * 2.5));
      if (this.groupT > 0 || crowd >= cap) return;
      let group = this.plan[this.planIdx++];
      this.groupT = group.gap;
      let player = this.player,
        portal = this.arena.freePoint(this.rng, player.x, player.y, 8.5, 1.2),
        placed = [];
      for (let i = 0; i < group.members.length; i++) {
        let spawnX = portal.x,
          spawnY = portal.y,
          angle = this.rng.next() * TAU + i * 2.399963;
        for (let j = 0; j < 12; j++) {
          let dist =
              0.55 +
              Math.min(1.7, 1 + group.members.length * 0.12) * Math.sqrt((i + 0.6) / Math.max(1, group.members.length)),
            dir = angle + this.rng.range(-0.35, 0.35),
            tryX = portal.x + Math.cos(dir) * dist,
            tryY = portal.y + Math.sin(dir) * dist;
          if (
            !this.arena.blocked(tryX, tryY, 0.8) &&
            !this.arena.outside(tryX, tryY, 1) &&
            !this.arena.featureBlocked(tryX, tryY, 0.25) &&
            Math.hypot(tryX - player.x, tryY - player.y) >= 6.5 &&
            placed.every((other) => Math.hypot(tryX - other.x, tryY - other.y) >= 0.9)
          ) {
            spawnX = tryX;
            spawnY = tryY;
            break;
          }
        }
        placed.push({ x: spawnX, y: spawnY });
        this.markers.push({
          x: spawnX,
          y: spawnY,
          t: 0,
          dur: 0.95,
          type: group.members[i].type,
          elite: group.members[i].elite,
          done: false,
        });
      }
      this.emit("portal", { x: portal.x, y: portal.y, n: group.members.length });
    }
    sweep() {
      if (this.enemies.some((enemy) => enemy.dead)) {
        this.enemies = this.enemies.filter((enemy) => !enemy.dead);
      }
      if (this.pb.some((bullet) => bullet.life <= 0)) {
        this.pb = this.pb.filter((bullet) => bullet.life > 0);
      }
      if (this.eb.some((bullet) => bullet.life <= 0)) {
        this.eb = this.eb.filter((bullet) => bullet.life > 0);
      }
      if (this.pickups.some((pickup) => pickup.dead)) {
        this.pickups = this.pickups.filter((pickup) => !pickup.dead);
      }
    }
    checkWaveEnd() {
      if (this.state === "fight") {
        if (
          this.planIdx >= this.plan.length &&
          !this.bossPending &&
          !this.championPending &&
          this.enemies.length === 0 &&
          this.markers.length === 0 &&
          this.waveT > 1.8
        ) {
          this.state = "cleared";
          this.stateT = 0;
          if (this.waveDmg === 0 && this.wave >= 8) {
            this.flawless++;
          }
          let boss = !!this.bossFor(this.wave);
          if (boss) {
            let player = this.player;
            player.hp = Math.min(this.stats.maxHp, player.hp + this.stats.maxHp * 0.3);
          }
          this.offerBoss = boss;
          this.emit("cleared", { n: this.wave, boss: boss, flawless: this.waveDmg === 0 });
        }
      } else if (this.state === "cleared" && ((this.stateT > 1.6 && this.pickups.length === 0) || this.stateT > 3.5)) {
        for (let pickup of this.pickups) {
          if (pickup.kind === "shard") {
            this.shards += pickup.v;
          }
        }
        this.pickups.length = 0;
        this.singularities = [];
        resetBossCards(this);
        if (this.isFinalWave()) {
          this.state = "victory";
          this.stateT = 0;
          this.emit("victory");
        } else {
          this.beginChoice();
        }
      }
    }
    startBiomeEvent(id, wave) {
      startBiomeEvent(this, id, wave);
    }
    tickBiomeEvent(event, dt) {
      tickBiomeEvent(this, event, dt);
    }
  };

export { World, rlStep };
