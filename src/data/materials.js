// Physical actor surfaces shared by rendering and impacts; color does not determine the material.
const ORGANIC = new Set(["swarmer", "mite", "splitter", "hive", "leaper", "carrier", "mender", "queen"]);
export function actorMaterial(type) {
  if (ORGANIC.has(type)) return "organic";
  if (type === "prism" || type === "wyrm") return "crystal";
  if (type === "phantom" || type === "weaver") return "energy";
  if (type === "core" || type === "tyrant") return "stone";
  return "armor";
}
