// 3.0.0: the difficulty curve beyond the first twenty waves. One place for the numbers that make a long run
// (Endless) keep getting harder, so that the rest of the code only asks "how much".

// Burst cap: an enemy can lose at most this fraction of its maximum hull within BURST_WINDOW seconds, no
// matter how many shots, pierces, explosions and chain jumps land (a maxed Railgun salve used to wipe whole
// lines at wave 150). Wave 40 caps a burst at 97% of hull. The cap tightens gradually to a 28% floor.
const BURST_WINDOW = 0.25,
  BURST_FROM = 40,
  BURST_FLOOR = 0.28;
function burstFraction(wave) {
  if (wave < BURST_FROM) return 1;
  return Math.max(BURST_FLOOR, 0.97 - 0.005 * (wave - BURST_FROM));
}

// Extra hull for the regular enemies on top of the quadratic curve in World.startWave: none up to wave 30,
// then +3 % of the base per wave (x4.6 at 150, x9 at 300). Only Endless gets there.
function endlessHpBoost(wave) {
  return wave <= 30 ? 1 : 1 + 0.03 * (wave - 30);
}

export { BURST_WINDOW, burstFraction, endlessHpBoost };
