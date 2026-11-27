// Physical actor surfaces shared by rendering and impacts; color does not determine the material.
const ORGANIC = new Set(["smallBug", "littlePod", "sporePod", "mushroomNest", "bogHopper", "mossHealer", "mossQueen"]);
export function actorMaterial(type) {
  if (ORGANIC.has(type)) return "organic";
  if (type === "iceCrystal" || type === "sandDragon" || type === "crystalTower") return "crystal";
  if (type === "starGhost" || type === "starSpider") return "energy";
  if (type === "starHeart" || type === "emberKing" || type === "healingStone") return "stone";
  return "armor";
}
