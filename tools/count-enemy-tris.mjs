// Dev tool: report triangle counts per enemy kit (body + glow) against the mobile budget.
import { enemyGeometry } from "../src/render/models.js";
import { enemyDefs } from "../src/data/enemies.js";

const BUDGET = 810;
let over = 0;
for (const [type, def] of Object.entries(enemyDefs)) {
  const model = enemyGeometry(type, def.color);
  const tris = Object.values(model).reduce((sum, g) => sum + (g.index?.count ?? g.attributes.position.count) / 3, 0);
  const flag = tris > BUDGET ? " !! OVER" : "";
  if (tris > BUDGET) over++;
  console.log(`${type.padEnd(10)} ${String(Math.round(tris)).padStart(4)} tris${flag}`);
  model.body.dispose?.();
  model.glow.dispose?.();
}
console.log(over ? `${over} types over budget` : "all within budget");
