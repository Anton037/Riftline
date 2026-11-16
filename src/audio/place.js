// Physical material and air accents, distance/pan-aware hazard sounds and six biome soundscapes.
// Timers and light synchronization remain independent of simulation randomness.
const HEAR = 16; // metres: how far a hazard is heard
// the level of a hazard at distance d (1 on top of it, 0 at HEAR)
const near = (d) => Math.pow(Math.max(0, 1 - d / HEAR), 1.6);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

const PLACE = Object.fromEntries(
  [
    "lavaBlub",
    "lavaWarn",
    "hum",
    "charge",
    "iceCrack",
    "iceCreak",
    "iceTink",
    "acidBubble",
    "acidSizzle",
    "portalHum",
    "portalWhisper",
    "thunder",
    "carAlarm",
    "carPass",
    "radio",
    "sparks",
    "clunk",
    "bigCrack",
    "icicles",
    "gust",
    "groan",
    "frogs",
    "bird",
    "owl",
    "mud",
    "drip",
    "glassPing",
    "heatHiss",
    "devilMoan",
    "dustRush",
    "devilHiss",
    "swell",
    "shimmer",
    "breath",
    "glitch",
    "calderaRumble",
    "ventPulse",
    "emberPop",
    "fumarole",
    "rockFall",
    "farBoom",
    "steamBlast",
    "cinderGust",
    "fumaroleRush",
    "lampBuzz",
    "gravityHum",
    "rainDrop",
    "gutter",
    "rainMetal",
    "wind",
    "cricket",
    "heartbeat",
    "siren",
    "helicopter",
    "horn",
    "dog",
    "howl",
    "avalanche",
    "crystals",
    "frogChorus",
    "cicada",
    "insect",
    "splash",
    "heron",
    "reversed",
    "metal",
    "chirp",
  ].map((id) => [id, (engine, a) => engine.physical.place(engine, id, a)]),
);

const SCAPE = {
  city: {
    bed: [
      ["rainDrop", 2.0, 4.8, 0.35, 0],
      ["gutter", 5.5, 11, 0.32],
      ["rainMetal", 9, 18, 0.28],
    ],
    far: [
      { id: "thunder", every: [28, 56], big: true, light: "lightning" },
      { id: "siren", every: [65, 130], big: true, light: "siren" },
      { id: "helicopter", every: [75, 150], big: true },
      { id: "horn", every: [35, 75] },
      { id: "dog", every: [35, 70] },
      { id: "carAlarm", every: [55, 110] },
      { id: "carPass", every: [24, 50] },
      { id: "radio", every: [40, 85] },
      { id: "sparks", every: [30, 65] },
    ],
  },
  shelf: {
    bed: [["wind", 4.5, 9.0, 0.45]],
    far: [
      { id: "howl", every: [28, 56] },
      { id: "groan", every: [32, 64] },
      { id: "icicles", every: [24, 50] },
      { id: "avalanche", every: [85, 165], big: true },
      { id: "crystals", every: [28, 56] },
      { id: "bigCrack", every: [38, 76], big: true },
      { id: "gust", every: [24, 48] },
    ],
  },
  marsh: {
    bed: [["cricket", 3.5, 7.5, 0.36, 0]],
    far: [
      { id: "drip", every: [20, 40] },
      { id: "frogChorus", every: [26, 52] },
      { id: "cicada", every: [28, 56] },
      { id: "insect", every: [24, 50] },
      { id: "splash", every: [28, 56] },
      { id: "owl", every: [45, 90] },
      { id: "heron", every: [50, 95], big: true },
      { id: "frogs", every: [22, 46] },
      { id: "bird", every: [28, 56] },
      { id: "mud", every: [24, 48] },
    ],
  },
  flats: {
    bed: [["heatHiss", 5.0, 10.0, 0.38, 0]],
    far: [
      { id: "glassPing", every: [22, 44] },
      { id: "devilMoan", every: [26, 54] },
      { id: "dustRush", every: [22, 46] },
      { id: "cicada", every: [26, 54] },
      { id: "crystals", every: [28, 58] },
      { id: "gust", every: [32, 64] },
      { id: "howl", every: [48, 96], big: true },
    ],
  },
  core: {
    bed: [["heartbeat", 5.0, 9.5, 0.38, 0.5]],
    far: [
      { id: "reversed", every: [28, 56] },
      { id: "metal", every: [32, 64] },
      { id: "chirp", every: [24, 48] },
      { id: "swell", every: [34, 68], big: true },
      { id: "shimmer", every: [28, 56] },
      { id: "breath", every: [32, 60] },
      { id: "glitch", every: [26, 52] },
    ],
  },
  caldera: {
    bed: [
      ["calderaRumble", 4.5, 9.0, 0.42],
      ["ventPulse", 4.0, 8.5, 0.34, 0],
    ],
    far: [
      { id: "emberPop", every: [20, 40] },
      { id: "fumarole", every: [24, 48] },
      { id: "rockFall", every: [24, 48] },
      { id: "farBoom", every: [28, 56] },
      { id: "steamBlast", every: [28, 56] },
      { id: "cinderGust", every: [34, 68] },
      { id: "fumaroleRush", every: [48, 96], big: true },
    ],
  },
};
const PLACE_IDS = Object.keys(PLACE);

/* 3.17.0: the sounding prop nearest to the drone (null: none within PROP_HEAR). The street lamps stand every ~7 m
   1.6 m outside the edges (render/biome-props.js rlStreet), the machine blocks are the box obstacles of the Ember
   Works, the obelisks the round obstacles of the Shattered Core (render/biome-visuals.js). */
const PROP_HEAR = 7;
function nearestProp(arena, player) {
  const biome = arena.biome.id;
  let best = null,
    bestD = PROP_HEAR;
  const take = (x, y, id, lo, hi) => {
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < bestD) {
      bestD = d;
      best = { x, y, id, lo, hi };
    }
  };
  if (biome === "city") {
    const W = arena.W,
      H = arena.H;
    for (const [len, along, fixed, alongX] of [
      [W, player.x, -H - 1.6, true],
      [W, player.x, H + 1.6, true],
      [H, player.y, -W - 1.6, false],
      [H, player.y, W + 1.6, false],
    ]) {
      const n = Math.round((len * 2) / 7),
        step = (len * 2) / n,
        i = Math.max(0, Math.min(n, Math.round((along + len) / step))),
        s = -len + i * step;
      if (alongX) take(s, fixed, "lampBuzz", 4.5, 8.5);
      else take(fixed, s, "lampBuzz", 4.5, 8.5);
    }
  } else if (biome === "core") {
    for (const ob of arena.obs) if (ob.t === "c") take(ob.x, ob.y, "gravityHum", 4.5, 8.5);
  }
  return best;
}

/* One step of the sounds of the place (main.js calls it every frame of a running fight). st keeps the timers of each
   hazard; they start anew in a new arena. At most three sounds start in one frame. */
function placeTick(e, world, dt) {
  const arena = world.arena,
    player = world.player;
  let st = e.placeSt;
  if (!st || st.arena !== arena) st = e.placeSt = { arena, timers: new Map(), vents: new Map(), far: null };
  const fight = world.state === "fight",
    budget = { n: 3 },
    play = (id, a) => {
      if (budget.n <= 0 || a.g <= 0.02) return;
      budget.n--;
      e.placePlay(id, a);
    },
    at = (x, y, g = 1) => {
      const d = Math.hypot(x - player.x, y - player.y);
      return { g: near(d) * g, pan: Math.max(-0.85, Math.min(0.85, (x - player.x) / 14)), d };
    },
    // true when the timer `key` runs out (and it starts again with lo..hi seconds)
    due = (key, lo, hi) => {
      let t = st.timers.get(key);
      if (t == null) t = rand(0, hi);
      t -= dt;
      const out = t <= 0;
      st.timers.set(key, out ? rand(lo, hi) : t);
      return out;
    };
  // vents: lava bubbles or the hum of a live manhole; the warning of each vent once when it starts
  const city = arena.biome.id === "city";
  for (const vent of arena.vents) {
    const state = fight ? arena.ventState(vent, world.waveT) : "idle",
      last = st.vents.get(vent);
    st.vents.set(vent, state);
    const a = at(vent.x, vent.y);
    if (state === "warn" && last !== "warn") play(city ? "charge" : "lavaWarn", a);
    else if (state === "idle" && (city ? a.d < 6 : true) && due(vent, city ? 4.2 : 3.2, city ? 8.0 : 6.5))
      play(city ? "hum" : "lavaBlub", { ...a, g: a.g * (city ? 0.4 : 0.55) });
  }
  // ice: cracks and creaks under the moving drone, a sheet tinkles now and then
  if (arena.ice.length) {
    const speed = Math.hypot(player.vx, player.vy);
    if (player.onIce && player.alive && speed > 2.5 && due("skate", 0.5, 1.2))
      play(Math.random() < 0.55 ? "iceCrack" : "iceCreak", { g: 0.45, pan: 0 });
    for (const patch of arena.ice) if (due(patch, 5, 12)) play("iceTink", at(patch.x, patch.y, 0.5));
  }
  // acid: bubbles in the pools near the drone, a sizzle while it stands in one
  if (arena.acid.length) {
    for (const pool of arena.acid) if (!pool.mine && due(pool, 2.8, 6.0)) play("acidBubble", at(pool.x, pool.y, 0.45));
    if (player.inAcid && fight && due("sizzle", 0.55, 0.8)) play("acidSizzle", { g: 0.65, pan: 0 });
  }
  // 3.53.0: the dust devils of the Flats: each hisses where it wanders (they move, so their sound
  // follows them), and inside one the wind roars past the drone
  if (arena.devils && arena.devils.length) {
    for (const devil of arena.devils) if (due(devil, 2.6, 5.5)) play("devilHiss", at(devil.x, devil.y, 0.45));
    if (player.inDevil && fight && due("devilWind", 0.6, 0.9)) play("devilHiss", { g: 0.7, pan: 0 });
  }
  // portals: both ends hum, sometimes one whispers
  arena.portals.forEach((portal, i) => {
    if (due("pa" + i, 4.5, 8.5)) play("portalHum", at(portal.ax, portal.ay, 0.4));
    if (due("pb" + i, 4.5, 8.5)) play("portalHum", at(portal.bx, portal.by, 0.4));
  });
  if (arena.portals.length && due("whisper", 9, 18)) {
    const portal = arena.portals[Math.floor(Math.random() * arena.portals.length)];
    play("portalWhisper", at(portal.ax, portal.ay, 0.5));
  }
  // 3.17.0: the props near the drone: the street lamps along the edges of Blackout City, the machine blocks of the Ember
  // Works, the obelisks of the Shattered Core (all where the renderer draws them), the nearest one within PROP_HEAR
  const prop = nearestProp(arena, player);
  if (prop && due("prop:" + prop.id, prop.lo, prop.hi)) {
    const d = Math.hypot(prop.x - player.x, prop.y - player.y);
    play(prop.id, {
      g: Math.pow(Math.max(0, 1 - d / PROP_HEAR), 2) * (world.boss ? 0.3 : 0.45),
      pan: Math.max(-0.85, Math.min(0.85, (prop.x - player.x) / 10)),
    });
  }
  // 3.13.0: the soundscape of the biome; a boss fight thins it out (its timers run at half speed, the bed is softer)
  // 3.43.0: in Endless the place slowly wakes up - the grains and the far sounds of the biome come a little
  // more often (up to 45 % past wave 60); a boss keeps its thinning
  const scape = SCAPE[arena.biome.id];
  if (!scape) return;
  const creep = world.endless ? 1 + Math.min(0.45, Math.max(0, world.wave - 20) * 0.012) : 1,
    thin = world.boss ? 0.5 : 1 / creep,
    t = (st.t = (st.t || 0) + dt);
  const calm = e.musVol > 0 && e.playKind === "fight";
  for (const [id, lo, hi, g, inMusic] of scape.bed)
    if (due("bed:" + id, lo / thin, hi / thin)) {
      const carried = calm && inMusic != null && (inMusic === 0 || (e.intensity || 0) > inMusic);
      play(id, { g: g * (world.boss ? 0.5 : 1) * (carried ? 0.5 : 1), pan: rand(-0.5, 0.5) });
    }
  if (!st.far || st.far.biome !== arena.biome.id) {
    // the first far sounds come soon (2 s up to the shortest rate), then each keeps its own rate
    st.far = { biome: arena.biome.id, next: new Map(), last: null, lastAt: -99, bigUntil: -99 };
    for (const f of scape.far) st.far.next.set(f.id, t + rand(2, f.every[0]));
  }
  const far = st.far;
  for (const f of scape.far) {
    // no free voice slot in this frame (the hazards took them): the far sounds wait for the next frame, so a light
    // never comes without its sound and no sound loses its turn
    if (budget.n <= 0) break;
    const next = far.next.get(f.id);
    if (t < next) continue;
    // never two far sounds within 2.5 s, never the same twice in a row, never two big ones at once: try again soon
    if (t - far.lastAt < 2.5 || far.last === f.id || (f.big && t < far.bigUntil)) {
      far.next.set(f.id, t + rand(2, 6));
      continue;
    }
    far.next.set(f.id, t + rand(f.every[0], f.every[1]) / thin);
    far.last = f.id;
    far.lastAt = t;
    if (f.big) far.bigUntil = t + 4;
    const pan = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9);
    play(f.id, { g: rand(0.28, 0.55), pan });
    if (f.light && e.onScape) e.onScape(f.light, pan);
    break;
  }
}

export { PLACE, PLACE_IDS, SCAPE, placeTick };
