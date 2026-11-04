// Compare the allocation-free scheduler with the former real-node reference, including flooded voices.
import assert from "node:assert/strict";
import { withAudioPage } from "./audio-page.mjs";
const url = process.argv[2] || "http://localhost:8124/index.html";
for (const biome of ["yard", "vault", "marsh", "void", "club", "flats"]) {
  const result = await withAudioPage(
    url,
    (biome) => {
      const E = window.__riftTest.game.sound.constructor;
      const random = Math.random;
      const rows = [];
      const run = (spec) => {
        let state = 731;
        Math.random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
        return E.musicBudget({ ...spec, biome, loops: 0.25 });
      };
      try {
        for (const spec of [
          { music: "fight", intensity: 0.5 },
          { music: "boss", heat: 2 },
          { music: "boss", heat: 0, flood: 24 },
        ]) {
          const fast = run(spec),
            reference = run({ ...spec, renderGraph: true });
          rows.push({
            kind: spec.music,
            flood: !!spec.flood,
            same: JSON.stringify(fast) === JSON.stringify(reference),
            failed: fast.failed || reference.failed,
            notes: fast.scheduled,
          });
        }
      } finally {
        Math.random = random;
      }
      return rows;
    },
    biome,
  );
  for (const row of result) assert.ok(row.same && !row.failed && row.notes > 0, `${biome}: ${JSON.stringify(row)}`);
  console.log(`${biome}: scheduling counts and every note match the real-node reference (calm, boss, flood).`);
}
