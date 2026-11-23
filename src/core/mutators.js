// Storybook Endless Omens (Mutators). From wave 21 on, every tenth wave (21, 31, 41 …) awakens an omen for the rest of
// the run; the order is shuffled deterministically per seed.

import { makeRng, hashString } from "./util.js";

const MUTATORS = {
    fireBurstFoes: {
      name: "Bursting Enemies",
      desc: "Enemies may burst in a glowing ember ring when felled",
      color: "#e88a4a",
    },
    shielded: {
      name: "Shielded Enemies",
      desc: "Enemies may arrive wrapped in a shimmering ward",
      color: "#8cd4e8",
    },
    hasted: {
      name: "Faster Enemies",
      desc: "Enemies move briskly across the arena",
      color: "#e6c46a",
    },
    armored: {
      name: "Ringing Enemies",
      desc: "Elites and heavy enemies unleash a ringing shockwave at 50% HP",
      color: "#d9a75a",
    },
    barrage: {
      name: "Sand Winds",
      desc: "Wandering sunglass whirlwinds roam the arena and bend nearby shots",
      color: "#e5b878",
    },
    extraTraps: {
      name: "Extra Traps",
      desc: "More realm traps awaken and trigger faster",
      color: "#98c9a3",
    },
  },
  MUTATOR_IDS = Object.keys(MUTATORS),
  MUTATOR_FROM = 21,
  MUTATOR_EVERY = 10,
  MUTATOR_MAX_LEVEL = 3;

/* The omens in play at `wave` ({ id: level }) and the one gained or raised at this wave (or null) */
function rlMutatorsFor(seed, wave) {
  const mods = {};
  if (wave < MUTATOR_FROM) return { mods, gained: null };
  const order = MUTATOR_IDS.slice(),
    rng = makeRng(hashString(seed + ":mutators"));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const steps = Math.floor((wave - MUTATOR_FROM) / MUTATOR_EVERY) + 1;
  let gained = null;
  for (let n = 0; n < steps; n++) {
    let id;
    if (n < order.length) id = order[n];
    else {
      const open = order.filter((m) => mods[m] < MUTATOR_MAX_LEVEL);
      if (!open.length) break;
      id = open[Math.floor(makeRng(hashString(seed + ":mutator-level:" + n)).next() * open.length)];
    }
    mods[id] = (mods[id] || 0) + 1;
    if (n === steps - 1 && (wave - MUTATOR_FROM) % MUTATOR_EVERY === 0) gained = id;
  }
  return { mods, gained };
}

export { MUTATORS, rlMutatorsFor };
