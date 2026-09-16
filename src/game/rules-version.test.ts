import test from "node:test";
import assert from "node:assert/strict";
import { initialState, step } from "./engine.ts";
import { HOUSE } from "./fixtures.ts";
test("old rules resume unchanged; new guards counter strikes", () => {
  const entrants = structuredClone(HOUSE.slice(0, 2));
  entrants[0].strategy = { aggression: 0, feint_rate: 0, recover_below: 0 };
  entrants[1].strategy = { aggression: 100, feint_rate: 0, recover_below: 0 };
  let checked = false;
  for (let seed = 0; seed < 100; seed++) {
    const old = step(initialState(seed, 1), entrants, 0),
      current = step(initialState(seed, 2), entrants, 0);
    if (
      current.event.actions[0] === "guard" &&
      current.event.actions[1] === "strike"
    ) {
      assert.deepEqual(current.event.actions, old.event.actions);
      assert.equal(old.event.damage[1], 0);
      assert.equal(current.event.damage[1], 6);
      assert.equal(current.event.damage[0], 3);
      assert.match(current.event.caption, /counters/);
      checked = true;
      break;
    }
  }
  assert.ok(checked);
});
