import { simulate } from "../src/game/engine.ts";
import { HOUSE } from "../src/game/fixtures.ts";
import type { Strategy } from "../src/game/types.ts";
const presets: Record<string, Strategy> = {
  Pressure: { aggression: 100, feint_rate: 0, recover_below: 1 },
  Feints: { aggression: 75, feint_rate: 100, recover_below: 2 },
  Patient: { aggression: 0, feint_rate: 25, recover_below: 2 },
  Balanced: { aggression: 50, feint_rate: 25, recover_below: 2 },
  Recovery: { aggression: 50, feint_rate: 50, recover_below: 4 },
};
const rows = [];
for (const [name, strategy] of Object.entries(presets)) {
  const row: Record<string, string | number> = { strategy: name };
  for (const [opponent, other] of Object.entries(presets)) {
    let wins = 0;
    for (let seed = 0; seed < 500; seed++)
      for (let side = 0; side < 2; side++) {
        const entrants = structuredClone(HOUSE.slice(0, 2));
        entrants[side].strategy = strategy;
        entrants[1 - side].strategy = other;
        if (simulate(seed, entrants).state.winner === side) wins++;
      }
    row[opponent] = (wins / 10).toFixed(1) + "%";
  }
  rows.push(row);
}
console.table(rows);
console.log(
  "1,000 duels per cell, both seats, seeds 0–499. This diagnoses these presets; it is not a balance guarantee.",
);
