import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  simulate,
  step,
  validateStrategy,
  turningPoint,
} from "./engine.ts";
import { HOUSE } from "./fixtures.ts";
test("seed and frozen strategy exactly reproduce all exchanges", () => {
  const a = simulate(192837, HOUSE.slice(0, 2));
  assert.deepEqual(a, simulate(192837, HOUSE.slice(0, 2)));
  const state = initialState(9);
  step(state, HOUSE.slice(0, 2), 0);
  assert.equal(state.round, 0);
});
test("resuming a persisted engine never rerolls", () => {
  const entrants = HOUSE.slice(0, 2);
  let state = initialState(987);
  const events = [];
  while (state.winner === null) {
    const n = step(
      JSON.parse(JSON.stringify(state)),
      entrants,
      events.length * 1000,
    );
    state = n.state;
    events.push(n.event);
  }
  assert.deepEqual({ state, events }, simulate(987, entrants));
});
test("1000 seeds terminate with one winner, legal resources, and compact events", () => {
  for (let i = 0; i < 1000; i++) {
    const r = simulate(i, HOUSE.slice(0, 2));
    assert.ok(r.events.length <= 24);
    assert.ok([0, 1].includes(r.state.winner!));
    for (const e of r.events)
      for (const s of e.states) {
        assert.ok(s.health >= 0 && s.health <= 100);
        assert.ok(s.stamina >= 0 && s.stamina <= 6);
      }
    assert.ok(Buffer.byteLength(JSON.stringify(r.events)) <= 65536);
  }
});
test("simultaneous strikes can knock out both and still resolve deterministically", () => {
  const entrants = HOUSE.slice(0, 2).map((e) => ({
    ...e,
    strategy: { aggression: 100, feint_rate: 0, recover_below: 0 },
  }));
  let found = false;
  for (let seed = 0; seed < 30; seed++) {
    const s = initialState(seed);
    s.fighters.forEach((f) => (f.health = 3));
    const r = step(s, entrants, 0);
    if (r.event.actions.every((a) => a === "strike")) {
      assert.equal(r.state.fighters[0].health, 0);
      assert.equal(r.state.fighters[1].health, 0);
      assert.equal(r.state.reason, "Decision · seeded tie-break");
      found = true;
      break;
    }
  }
  assert.ok(found);
});
test("strategy bounds fail closed; different tactics change actual actions", () => {
  assert.throws(() => validateStrategy({ aggression: 101 }));
  assert.throws(() => validateStrategy({ recover_below: 2.1 }));
  assert.throws(() => validateStrategy({ feint_rate: NaN }));
  const a = simulate(6, HOUSE.slice(0, 2));
  const entrants = structuredClone(HOUSE.slice(0, 2));
  entrants[0].strategy = { aggression: 0, feint_rate: 100, recover_below: 4 };
  assert.notDeepEqual(a.events, simulate(6, entrants).events);
  assert.ok(turningPoint(a.events)?.text);
});
