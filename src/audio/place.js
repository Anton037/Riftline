// Spatial soundscapes use their own timers and never consume simulation randomness.
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
    "calderaRumble",
    "ventPulse",
    "emberPop",
    "fumarole",
    "rockFall",
    "farBoom",
    "steamBlast",
    "cinderGust",
    "fumaroleRush",
    "galleryChime",
    "kilnResonance",
    "inlayCharge",
    "stoneEcho",
    "lampBuzz",
    "gravityHum",
    "rainDrop",
    "gutter",
    "wind",
    "cricket",
    "heartbeat",
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
      ["rainDrop", 4.5, 8.5, 0.32],
      ["galleryChime", 10, 19, 0.27, 0.34],
    ],
    far: [
      { id: "kilnResonance", every: [28, 56], big: true },
      { id: "stoneEcho", every: [22, 44] },
      { id: "gutter", every: [24, 48] },
    ],
  },
  shelf: {
    bed: [
      ["wind", 4.8, 9.2, 0.36],
      ["iceTink", 8, 15, 0.25],
    ],
    far: [
      { id: "icicles", every: [15, 32] },
      { id: "crystals", every: [24, 46] },
      { id: "groan", every: [34, 62], big: true },
      { id: "avalanche", every: [72, 130], big: true },
    ],
  },
  marsh: {
    bed: [
      ["drip", 4.2, 8.2, 0.34, 0],
      ["cricket", 7, 13, 0.24, 0.35],
    ],
    far: [
      { id: "frogs", every: [20, 42] },
      { id: "bird", every: [30, 58] },
      { id: "splash", every: [26, 56] },
      { id: "breath", every: [42, 66], big: true },
    ],
  },
  flats: {
    bed: [
      ["glassPing", 6.5, 12.5, 0.28, 0],
      ["gust", 8, 15, 0.28],
    ],
    far: [
      { id: "crystals", every: [18, 36] },
      { id: "chirp", every: [26, 52] },
      { id: "dustRush", every: [42, 66], big: true },
      { id: "shimmer", every: [28, 54] },
    ],
  },
  core: {
    bed: [
      ["gravityHum", 6.8, 12.0, 0.35, 0.5],
      ["shimmer", 8.5, 15.5, 0.28],
    ],
    far: [
      { id: "crystals", every: [18, 38] },
      { id: "stoneEcho", every: [24, 48] },
      { id: "reversed", every: [26, 52] },
      { id: "swell", every: [38, 62], big: true },
    ],
  },
  caldera: {
    bed: [
      ["emberPop", 4.2, 8.4, 0.34],
      ["calderaRumble", 6.5, 11.5, 0.36, 0],
    ],
    far: [
      { id: "fumarole", every: [18, 36] },
      { id: "cinderGust", every: [30, 58] },
      { id: "rockFall", every: [28, 52] },
      { id: "farBoom", every: [44, 78], big: true },
    ],
  },
};
const PLACE_IDS = Object.keys(PLACE);

const PROP_HEAR = 7;
const COVER_VOICE = {
  city: "hum",
  shelf: "iceTink",
  marsh: "drip",
  core: "gravityHum",
  caldera: "ventPulse",
  flats: "glassPing",
};
function nearestProp(arena, player) {
  let best = null;
  let bestD = PROP_HEAR;
  const take = (x, y, id, lo, hi) => {
    const d = Math.hypot(x - player.x, y - player.y);
    if (d < bestD) {
      bestD = d;
      best = { x, y, id, lo, hi };
    }
  };
  const biome = arena.biome.id;
  for (const ob of arena.obs) take(ob.x, ob.y, COVER_VOICE[biome], 5, 10);
  if (biome === "city") {
    // The tall lamps in biome-props occur on every third section of the exterior sill.
    for (const alongX of [true, false]) {
      const length = alongX ? arena.W : arena.H;
      const edge = alongX ? arena.H : arena.W;
      const along = Math.round((alongX ? player.x : player.y) / 8.4) * 8.4;
      if (Math.abs(along) > length - 0.9) continue;
      for (const side of [-1, 1]) {
        const across = side * (edge + 1.2);
        take(alongX ? along : across, alongX ? across : along, "lampBuzz", 6, 12);
      }
    }
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
  // vents announce their warning once when the charge or heat begins to build
  const city = arena.biome.id === "city";
  for (const vent of arena.vents) {
    const state = fight ? arena.ventState(vent, world.waveT) : "idle",
      last = st.vents.get(vent);
    st.vents.set(vent, state);
    const a = at(vent.x, vent.y);
    if (state === "warn" && last !== "warn") play(city ? "inlayCharge" : "lavaWarn", a);
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
    // Let nearby gameplay cues take the available slots before ambience plays.
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
    break;
  }
}

export { PLACE, PLACE_IDS, SCAPE, placeTick };
