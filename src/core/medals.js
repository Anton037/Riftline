const MEDAL_NAMES = ["", "Bronze", "Silver", "Gold"],
  // 3.49.0: the Ash Tyrant runs a tighter crater than the factory (par 65 s)
  // 3.58.0: the Glasswyrm hunts alone (no escorts, so the fight is the wyrm and nothing else), which puts
  // it just under the Prism's 70 s. It had no entry and fell back to the 70 s default silently, so its
  // silver and gold thresholds were never actually chosen.
  PAR = { warden: 60, prism: 70, queen: 75, core: 85, tyrant: 65, wyrm: 68 };

/* 3.39.0: the par time of a boss at the current threat (the end screen shows it with the medal) */
function bossPar(id, hpMul = 1) {
  return (PAR[id] || 70) * Math.max(0.5, hpMul || 1);
}

/* 0 for no medal (an unknown time), else 1 to 3. `damage` is what the drone lost in the fight, `maxHp` its hull, `hpMul` the
   hull factor of the threat level (1 at Standard) */
function bossMedal(id, secs, damage, maxHp = 100, hpMul = 1) {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return 0;
  const par = bossPar(id, hpMul),
    hits = Math.max(0, damage || 0);
  if (hits <= 0 && secs <= par) return 3;
  if (hits <= 0 || (secs <= par * 1.5 && hits <= 0.25 * maxHp)) return 2;
  return 1;
}

export { bossMedal, bossPar, MEDAL_NAMES, PAR };
