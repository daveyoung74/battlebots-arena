import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import * as P from "../src/index.js";

const fixture = JSON.parse(await readFile(new URL("../fixtures/duel.json", import.meta.url), "utf8"));
const input = () => structuredClone(fixture.cases[0].input) as P.DuelInput;

test("duel fixture and RNG identity are separate from historical wire and training revisions", () => {
  assert.equal(P.REVISION, "2.0.0-alpha.1"); assert.equal(P.TRAINING_REVISION, "a0.training.1");
  assert.equal(fixture.fixtureOnly, true); assert.equal(fixture.revision, P.DUEL_REVISION);
  assert.deepEqual(P.DUEL_RNG_SPEC, fixture.rngSpec); assert.equal(P.DUEL_RNG_HASH, fixture.rngHash);
  assert.equal(P.hashDocument(P.validateDuelRules(fixture.rules)), fixture.rulesHash);
});

test("published inputs and outputs are bounded and bind complete rule and input documents", () => {
  for (const row of fixture.cases) {
    const parsed = P.validateDuelInput(row.input), output = P.parseDocument(P.duelOutputSchema, row.output, P.DUEL_LIMITS.outputBytes);
    assert.equal(P.hashDocument(output), row.outputHash); assert.equal(output.inputHash, P.hashDocument(parsed));
    assert.equal(output.rulesHash, P.hashDocument(parsed.rules)); assert.equal(output.rounds, output.events.length);
    assert.equal(output.placements[0], output.winnerId);
    assert.deepEqual([...output.placements].sort(), parsed.entrants.map(e => e.championId).sort());
    assert.deepEqual(output.finalState, output.events.at(-1)!.fighters);
    output.events.forEach((event, i) => { assert.equal(event.seq, i); assert.equal(event.atMs, (i + 1) * parsed.rules.roundMs); });
  }
});

test("every seed byte and counter participate in the published RNG blocks", () => {
  for (const row of fixture.rngVectors) {
    const hash = P.hashDocument({ domain: P.DUEL_RNG_SPEC.domain, seed: row.seed, counter: row.counter });
    assert.equal(hash, row.hash);
    assert.deepEqual(row.words, Array.from({ length: 8 }, (_, i) => Number.parseInt(hash.slice(2 + 8 * i, 10 + 8 * i), 16)));
  }
  assert.equal(new Set(fixture.rngVectors.map((v: { hash: string }) => v.hash)).size, fixture.rngVectors.length);
});

test("rules reject code, unknown versions, unsafe numbers and inconsistent stamina/probability parameters", () => {
  for (const patch of [{ script: "return winner" }, { runtimeId: "operator/custom" }, { rngId: "mulberry32" },
    { maxRounds: 1025 }, { health: Number.NaN }, { roundMs: 0 }, { health: -0 },
    { attack: { baseBps: 5000, aggressionBps: 100 } },
    { stamina: { ...fixture.rules.stamina, strikeCost: 7 } }, { recoveryThresholdMax: 7 }])
    assert.throws(() => P.validateDuelRules({ ...fixture.rules, ...patch }));
});

test("strict strategies and two unique champion IDs are required without legacy coercion or defaults", () => {
  for (const mutate of [
    (v: P.DuelInput) => { v.seed = P.ZERO_HASH; },
    (v: P.DuelInput) => { v.seed = "1"; },
    (v: P.DuelInput) => { v.entrants[1].championId = v.entrants[0].championId; },
    (v: P.DuelInput) => { v.entrants[0].strategy.recover_below = 5; },
    (v: P.DuelInput) => { v.entrants[0].strategy.aggression = 0.5; },
  ]) { const changed = input(); mutate(changed); assert.throws(() => P.validateDuelInput(changed)); }
  const original = input();
  assert.throws(() => P.validateDuelInput({ ...original, entrants: original.entrants.slice(0, 1) }));
  assert.throws(() => P.validateDuelInput({ ...original, entrants: [...original.entrants, original.entrants[0]] }));
  assert.throws(() => P.validateDuelInput({ ...original, resumeState: {} }));
  assert.throws(() => P.validateDuelInput({ ...original, entrants: [{ ...original.entrants[0], strategy: {} }, original.entrants[1]] }));
});

test("public boundaries reject getters before execution and return independent validated values", () => {
  let reads = 0; const original = input();
  Object.defineProperty(original.rules, "health", { enumerable: true, get: () => { reads++; throw new Error("executed getter"); } });
  assert.throws(() => P.validateDuelInput(original), /object key\/property/); assert.equal(reads, 0);
  const clean = input(), parsed = P.validateDuelInput(clean); clean.entrants[0].strategy.aggression = 0;
  assert.notEqual(parsed.entrants[0].strategy.aggression, clean.entrants[0].strategy.aggression);
});

test("published JSON Schema matches the exact separately versioned structural types", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/duel.schema.json", import.meta.url), "utf8"));
  const definitions = { rules: P.duelRulesSchema, strategy: P.duelStrategySchema, input: P.duelInputSchema,
    budget: P.duelBudgetSchema, event: P.duelEventSchema, output: P.duelOutputSchema };
  for (const [name, value] of Object.entries(definitions)) assert.deepEqual(schema.$defs[name], z.toJSONSchema(value, { target: "draft-2020-12" }));
});
