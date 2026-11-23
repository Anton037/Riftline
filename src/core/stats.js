// Player stats from weapon, run upgrades and workshop modules (computeStats).

import { weaponDefs } from "../data/weapons.js";

/* Minimum cooldown floors to prevent infinite invulnerability loops */
const DASH_CD_MIN = 0.8;
const SHIELD_CD_MIN = 3.5;

function computeStats(weaponId, run, workshop) {
  const weapon = weaponDefs[weaponId] || weaponDefs.lanternGun,
    level = (id) => run[id] || 0,
    moduleLevel = (id) => workshop[id] || 0,
    largeShots = level("largeShots") > 0,
    scaled = (id, base, step) => (level(id) ? base + step * (level(id) - 1) : 0),
    has = (id) => level(id) > 0,
    rawShieldCd = level("shield")
      ? [12, 8, 5][Math.min(level("shield"), 3) - 1] *
        (has("halo") ? 0.7 : 1) *
        Math.max(0.45, 1 - 0.08 * level("speed"))
      : 0,
    shieldCd = rawShieldCd > 0 ? Math.max(SHIELD_CD_MIN, rawShieldCd) : 0,
    arc = scaled("sparkChain", 0.25, 0.1),
    wingLv = level("helperWisps"),
    droneBayLv = moduleLevel("sparkHelper"),
    wingmen =
      wingLv > 0
        ? 2 + (wingLv > 1 ? 1 : 0) + (has("wispSwarm") ? 1 : 0) + (droneBayLv >= 2 ? 1 : 0)
        : droneBayLv >= 1
          ? 1
          : 0,
    wingDmgMul = wingLv > 0 ? 1 : droneBayLv >= 1 ? 0.55 : 0,
    wingCycle = (wingLv > 1 ? 0.35 : 0.48) / (droneBayLv >= 2 ? 1.25 : 1);

  const stats = {
    weapon,
    maxHp: 100 + 10 * moduleLevel("healthCoat") + 25 * level("hp"),
    speed: 6.2 * (1 + 0.04 * moduleLevel("walkBoots")) * (1 + 0.1 * level("speed")),
    dmgMul: (1 + 0.05 * moduleLevel("shotPower")) * (1 + 0.18 * level("dmg")) * (largeShots ? 1.45 : 1),
    rateMul: (1 + 0.15 * level("rate")) * (largeShots ? 0.88 : 1),
    velMul: (1 + 0.06 * level("crit")) * (has("dragon") ? 1.3 : 1),
    sizeMul: largeShots ? 1.6 : 1,
    twinRings: has("twinRings"),
    extra: level("extraShots") + (has("stormShotgun") ? 1 : 0),
    pierce: (weapon.pierce || 0) + level("pierce"),
    bounce: level("bounceShot") + (has("stormShotgun") ? 1 : 0),
    crit: 0.05 + 0.1 * level("crit"),
    critMul: 2 + 0.06 * level("crit"),
    magnet: 2.4 * (1 + 0.2 * moduleLevel("shardPouch")),
    dashCd: Math.max(
      DASH_CD_MIN,
      1.9 * (1 - 0.08 * moduleLevel("dash")) * (1 - 0.08 * level("speed")) * (has("ghostDash") ? 0.65 : 1),
    ),
    dashCharges: has("ghostDash") ? 2 : 1,
    regen: 0.8 * level("regen"),
    shieldCd,
    orbit: level("orbit"),
    orbitDmg: 18 * (has("halo") ? 2 : 1),
    orbitR: has("halo") ? 2.7 : 2.1,
    bladeScale: has("halo") ? 1.5 : 1,
    iceShot: 0.25 * level("iceShot"),
    shockDash: level("shockDash") ? (level("shockDash") > 1 ? 90 : 60) : 0,
    payloadR: scaled("blastShot", 1.6, 0.35),
    payloadF: scaled("blastShot", 0.3, 0.1),
    arc: has("storm") ? Math.min(0.9, arc + 0.3) : arc,
    arcJumps: has("storm") ? 4 : level("sparkChain") ? 1 + level("sparkChain") : 2,
    chain: (weapon.chain || 0) + (weapon.chain ? level("sparkChain") : 0) + (has("stormWand") ? 2 : 0),
    chainF: has("stormWand") ? 0.82 : 0.7,
    stormWand: has("stormWand"),
    homing: (weapon.homing || 0) + 2.2 * level("seeker") + (has("twinRings") ? 2.5 : 0),
    burningShot: scaled("burningShot", 0.22, 0.11),
    siphonCh: scaled("healingDrops", 0.18, 0.06),
    siphonHp: scaled("healingDrops", 6, 1),
    rear: level("backShot"),
    novaMul: 1 + 0.3 * level("extraCharge"),
    novaR: 6.5 * (1 + 0.25 * level("extraCharge")),
    helperWisps: wingLv || (droneBayLv >= 1 ? 1 : 0),
    wingmen,
    wingDmgMul,
    wingCycle,
    wingProcMul: 0.35,
    wingSpread: has("wispSwarm") ? 3 : 1,
    killStreak: level("killStreak"),
    timeDash: level("timeDash"),
    fireflyShots: has("fireflyShots"),
    wildfire: has("wildfire"),
    trail: has("ghostDash"),
    boomerang: !!weapon.boomerang,
    capacitor: level("extraCharge"),
    burn: weapon.burn || 0,
    burnMul: has("dragon") ? 2 : 1,
    overdrive: has("sunGun"),
    starLance: has("starLance"),
    wideBlast: has("wideBlast"),
    range: weaponRange(weapon) * (has("dragon") ? 1.3 : 1),
  };
  stats.maxHp = Math.max(25, stats.maxHp);
  stats.hunter = level("hunter");
  stats.eliteMul = stats.hunter ? 1.05 + 0.15 * stats.hunter : 1;
  stats.armor = 0.04 * moduleLevel("armor");
  stats.rateMul *= 1 + 0.06 * moduleLevel("quickTrigger");
  stats.hazardResist = Math.min(0.88, 0.08 * moduleLevel("armor"));
  stats.cacheCount = moduleLevel("supplyChest");
  stats.fireWave = level("fireWave");
  stats.crit = Math.min(0.95, stats.crit);
  stats.echo = level("echo");
  const extraCharge = level("extraCharge");
  stats.range *= 1 + 0.06 * level("crit");
  stats.novaR *= (1 + 0.25 * Math.min(2, extraCharge) + 0.1 * Math.max(0, extraCharge - 2)) / (1 + 0.25 * extraCharge);
  // Boss Relics (core/boss-cards.js)
  stats.bellCage = has("bellCage");
  stats.shardField = has("iceShards");
  stats.mossHelpers = has("mossHelpers");
  stats.collapse = has("collapse");
  stats.forgeGift = has("forgeGift");
  stats.fang = has("dragonFang");
  // Combat buildcraft upgrades
  stats.acidCoat = level("acidCoat");
  stats.glazeMul = stats.acidCoat >= 2 ? 0.35 : stats.acidCoat ? 0.2 : 0;
  stats.glazeBossMul = stats.acidCoat >= 2 ? 0.2 : stats.acidCoat ? 0.12 : 0;
  stats.heatSink = level("hotBellows");
  stats.slip = level("dashBoost");
  stats.surge = level("bellWave");
  stats.shieldPulse = level("shieldPulse");
  // New archetype-defining upgrades & Masterwork
  stats.superCrit = level("superCrit");
  stats.momentum = level("momentum");
  stats.closeShot = level("closeShot");
  stats.pointblankDmg = 0.16 * stats.closeShot;
  stats.meleeResist = Math.min(0.6, 0.12 * stats.closeShot);
  stats.hotShot = level("hotShot");
  stats.bellBoost = level("bellBoost");
  stats.fireWell = has("fireWell");
  // Home Workshop modules
  stats.cacheValue = 1 + 0.5 * moduleLevel("supplyChest");
  stats.attuneDmg = 0.1 * moduleLevel("trapPower");
  stats.attuneRegen = 0.5 * moduleLevel("trapPower");
  stats.barrierT = 1 * moduleLevel("emergencyShield");
  stats.barrierHeal = 0.08 * moduleLevel("emergencyShield");
  // Gravity Bell gadget
  stats.gadgetMax = 2 + level("extraBells");
  stats.gadgetCd = 6 * Math.max(0.5, 1 - 0.12 * level("extraBells"));
  stats.gadgetDmg = 1 + 0.3 * level("wideBell");
  stats.gadgetR = 3.4 * (1 + 0.15 * level("wideBell")) * (stats.fireWell ? 1.4 : 1);
  stats.gadgetFire = level("fireBell");
  return stats;
}

function weaponRange(weapon) {
  return weapon.boomerang
    ? weapon.speed * weapon.life * 0.5
    : weapon.drag
      ? (weapon.speed * (1 - Math.exp(-weapon.drag * weapon.life))) / weapon.drag
      : weapon.speed * weapon.life;
}

/* Numbers behind the build, shown on the pause screen. */
function buildStatRows(weaponId, run, workshop, hp) {
  const weapon = weaponDefs[weaponId] || weaponDefs.lanternGun,
    now = computeStats(weaponId, run, workshop),
    base = computeStats(weaponId, {}, workshop),
    shots = (s) => (weapon.count || 1) + (s.extra || 0) * (weapon.cone ? 2 : 1),
    perHit = (s) =>
      (weapon.dmg + (weapon.explodeDmg || 0)) * s.dmgMul * (weaponId === "ringBlade" && s.twinRings ? 1.35 : 1),
    perSecond = (s) =>
      perHit(s) * s.rateMul * weapon.rate * shots(s) * (1 + s.crit * (s.critMul - 1)) * (s.overdrive ? 1.35 : 1),
    row = (label, f, unit, better = "up", digits = 1) => ({
      label,
      now: f(now),
      base: f(base),
      unit,
      better,
      digits,
    });
  const rows = [
    row("HP", (s) => s.maxHp, "", "up", 0),
    row("Damage per hit", perHit, "", "up", 1),
    row("Shots per second", (s) => weapon.rate * s.rateMul, "/s", "up", 1),
    row("Damage per second", perSecond, "", "up", 0),
    row("Crit chance", (s) => s.crit * 100, "%", "up", 0),
    row("Crit damage", (s) => s.critMul, "\u00d7", "up", 2),
    row("Range", (s) => s.range, " m", "up", 1),
    row("Move speed", (s) => s.speed, " m/s", "up", 1),
    row("Dash cooldown", (s) => s.dashCd, " s", "down", 2),
    row("Armor", (s) => s.armor * 100, "%", "up", 0),
    row("HP regen", (s) => s.regen, "/s", "up", 1),
    row("Pickup radius", (s) => s.magnet, " m", "up", 1),
    row("Fire Burst charge", (s) => s.novaMul, "\u00d7", "up", 2),
  ];
  rows[0].hp = hp;
  return rows;
}

export { computeStats, weaponRange, buildStatRows, DASH_CD_MIN, SHIELD_CD_MIN };
