// Legacy spellings live only at compatibility boundaries. Active content uses its current theme.
// Existing saves convert once; new saves persist only current IDs.
const BIOMES = { yard: "city", vault: "shelf", void: "core", club: "caldera" },
  ACTORS = { kingpin: "tyrant", forge: "wyrm", crucible: "wyrm", hammer: "shockdash" };
const reverse = (map) => Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a])),
  OLD_BIOMES = reverse(BIOMES),
  rename = (id, map) => (Object.hasOwn(map, id) ? map[id] : id),
  object = (value) => value && typeof value === "object" && !Array.isArray(value);

// Display names must not change an existing run's map-director random stream.
export const biomeSeedId = (id) => rename(id, OLD_BIOMES);
export const eventSeedId = (id) => (id === "ashfall" ? "raid" : id);

function record(input, keyOf, combine) {
  if (!object(input)) return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const next = keyOf(key);
    Object.defineProperty(out, next, {
      value: Object.hasOwn(out, next) ? combine(out[next], value) : value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}
const sum = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a + b : b),
  bestMedal = (a, b) => {
    if (!object(a)) return b;
    if (!object(b)) return a;
    if (a.medal !== b.medal) return a.medal > b.medal ? a : b;
    return (a.secs || Infinity) < (b.secs || Infinity) ? a : b;
  };

export function runContentIds(run) {
  if (!object(run)) return run;
  const actors = ACTORS,
    actor = (id) => rename(id, actors),
    out = { ...run };
  if (Array.isArray(run.bossKills)) out.bossKills = run.bossKills.map(actor);
  if (object(run.dmgSrc)) out.dmgSrc = record(run.dmgSrc, actor, sum);
  if (object(run.takenBy)) out.takenBy = record(run.takenBy, actor, sum);
  if (Array.isArray(run.hitLog)) out.hitLog = run.hitLog.map((h) => (object(h) ? { ...h, src: actor(h.src) } : h));
  return out;
}

export function saveContentIds(save) {
  if (!object(save)) return save;
  const actors = ACTORS,
    actor = (id) => rename(id, actors),
    out = { ...save };
  if (object(save.stats)) {
    out.stats = { ...save.stats };
    if (object(save.stats.bosses)) out.stats.bosses = record(save.stats.bosses, actor, sum);
    if (object(save.stats.medals)) out.stats.medals = record(save.stats.medals, actor, bestMedal);
  }
  if (object(save.milestones)) out.milestones = record(save.milestones, actor, (a, b) => a || b);
  if (save.run) out.run = runContentIds(save.run);
  if (Array.isArray(save.history))
    out.history = save.history.map((h) => (object(h) ? { ...h, killer: actor(h.killer) } : h));
  return out;
}
