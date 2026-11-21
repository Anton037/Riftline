// Dev tool: report triangle counts per enemy kit, player weapon rig, and boss against GPU-First v2 budgets.
globalThis.__RL_VERSION__ ??= "dev";
globalThis.__RL_BUILD__ ??= "dev";
const { enemyGeometry, buildPlayerModel, buildBossModel } = await import("../src/render/models.js");
const { enemyDefs, bossDefs } = await import("../src/data/enemies.js");
const { weaponDefs } = await import("../src/data/weapons.js");

const ENEMY_BUDGET = 1800;
const HERO_BOSS_BUDGET = 6500;
let over = 0;

for (const [type, def] of Object.entries(enemyDefs)) {
  const model = enemyGeometry(type, def.color);
  const tris = model.body.triangleCount + model.glow.triangleCount;
  const flag = tris > ENEMY_BUDGET ? " !! OVER" : "";
  if (tris > ENEMY_BUDGET) over++;
  console.log(`enemy:${type.padEnd(10)} ${String(Math.round(tris)).padStart(5)} tris${flag}`);
}

for (const [id, def] of Object.entries(weaponDefs)) {
  const model = buildPlayerModel(id, def.color);
  let tris = 0;
  model.group.traverse((o) => {
    if (o.geometry) tris += o.geometry.triangleCount;
  });
  const flag = tris > HERO_BOSS_BUDGET ? " !! OVER" : "";
  if (tris > HERO_BOSS_BUDGET) over++;
  console.log(`hero:${id.padEnd(11)} ${String(Math.round(tris)).padStart(5)} tris${flag}`);
}

for (const [id, def] of Object.entries(bossDefs)) {
  const model = buildBossModel(id, def.color);
  let tris = 0;
  model.group.traverse((o) => {
    if (o.geometry) tris += o.geometry.triangleCount;
  });
  const flag = tris > HERO_BOSS_BUDGET ? " !! OVER" : "";
  if (tris > HERO_BOSS_BUDGET) over++;
  console.log(`boss:${id.padEnd(11)} ${String(Math.round(tris)).padStart(5)} tris${flag}`);
}

console.log(over ? `${over} kits over budget` : "all within budget");
if (over) process.exitCode = 1;
