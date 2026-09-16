# Bounded duel rules — a3.duel.1

Package release `2.0.0-alpha.3` adds a rules-data and simulation-output extension. Match/result wire revision `2.0.0-alpha.1` and training revision `a0.training.1` remain unchanged. This document specifies the first AgentBorn-owned engine family. It is not a deployed service, game admission, training attestation or authorization to spend funds.

The public directory contains schemas, sample rules, complete synthetic vectors and an independent Python verifier. The TypeScript execution engine belongs to the AgentBorn application. Game operators supply JSON rules; AgentBorn never imports or evaluates operator code. New mechanics outside this vocabulary require reviewed engine code and a new compatible version. No expression language, callback, module path or executable artifact is accepted.

## Rules and inputs

`duel_rules` selects `agentborn/duel/1` and `agentborn/keccak256-counter/1`. Its numeric settings are initial health, maximum rounds, milliseconds per round, maximum strategy recovery threshold, attack probability parameters, stamina costs/restoration and five damage values. All keys are mandatory and unknown keys fail. Numbers must be canonical safe integers; fractional values, negative zero, NaN and implicit coercion are rejected.

Rules can set health up to 1,000,000, stamina up to 1,000, 1–1,024 rounds and 1–60,000 milliseconds per round. Attack probability must stay within 0–10,000 basis points for aggression 0–100. Strike cost is positive and no greater than feint cost; feint cost and restoration amounts cannot exceed maximum stamina. Recovery thresholds cannot exceed maximum stamina. Zero damage is allowed: the round limit and seeded tie-break still terminate such a duel.

`duel_input` contains the complete rules, one nonzero lowercase bytes32 seed, and exactly two distinct nonzero champion IDs with complete frozen strategies. Entrant order fixes fighter indices and random-draw order. Each strategy has integer `aggression` and `feint_rate` in 0–100 and `recover_below` within the rules' recovery threshold. There are no engine defaults or caller-supplied initial/resume states. An onboarding UI may offer defaults, but it must freeze their full values before execution.

The public protocol still supports larger rosters. This engine interprets two-player combat only; it must not be used to manufacture a four-player result or sequentially run uncommitted submatches. A future bracket or other multi-entrant design needs its own published rules, reduced-roster treatment and fixtures. Zero or one qualified entrant is handled by qualification/cancellation/walkover orchestration without invoking this duel.

## Randomness and integer semantics

The random stream uses every byte of the seed. Block `n` is Keccak-256 of the canonical JSON object `{domain: "agentborn.duel.rng.1", seed, counter: String(n)}`, beginning at decimal counter `"0"`. Consume eight unsigned 32-bit words from each block, big-endian and left to right. Generate the next block only when the current block is exhausted. `DUEL_RNG_SPEC` and its canonical `DUEL_RNG_HASH` pin this convention.

Every round consumes four words in order: fighter 0 attack/feint, then fighter 1 attack/feint. Consume all four even when recovery or guarding makes a word irrelevant. Only a final unresolved tie consumes one extra word. Compare a word `u` against a basis-point threshold `b` using `u * 10000 < b * 4294967296`; equality does not succeed. These products remain exact JavaScript integers under the fixed bounds. A tie chooses fighter 0 when its extra word is below 2147483648 and fighter 1 otherwise.

There is no ambient randomness, wall clock or provider call in simulation. Seed creation, uniqueness, commitment, secrecy and durable persistence belong to the execution coordinator and remain required. A deterministic RNG identifier does not establish trustworthy seed selection.

## Combat semantics

Both fighters begin with the rules' full health and stamina and zero damage dealt. Each round uses the previous state to choose both actions:

1. If stamina is below `recover_below`, choose Recover without marking it forced.
2. Otherwise, attack when the first word succeeds against `baseBps + aggressionBps * aggression`; choose Guard when it does not.
3. When attacking, choose Feint only if stamina covers `feintCost` and the second word succeeds against `feint_rate * 100`; otherwise choose Strike.
4. If the resulting attack lacks `strikeCost`, choose forced Recover.

Resolve the two actions simultaneously. A Strike uses `guardedStrike` damage against Guard and `strike` otherwise; a Feint uses `guardedFeint` against Guard and `feint` otherwise. Guard deals `counter` against a Strike and zero otherwise. Recover deals zero. Actual damage received is the smaller of the requested hit and the target's previous health. Subtract it from health and add it to the attacker's damage-dealt total. Stamina changes by the selected action's cost or restoration and is clamped to zero through its configured maximum.

The first knockout or maximum round ends play. Compare remaining health, then actual cumulative damage dealt, then use the extra seeded tie word. Exactly one champion wins. Return both placements in winner/loser order. `knockout` denotes a health-decided knockout; an equal-health finish can instead report `damage_dealt` or `seeded_tie_break`. A round-limit health decision reports `remaining_health`.

Each event contains both actions, actual damage received, resulting public fighter states and forced-recovery flags. Sequence starts at zero; event `i` occurs at `(i + 1) * roundMs`. Events use logical elapsed time, so worker speed and retries do not change replay timing. Names, portraits, captions and private strategies are absent. Presentation can add separately approved cosmetic data after this output is fixed.

## Output and execution limits

`duel_simulation` binds the complete input and rules hashes, winner, placements, reason, round count, complete event list, final public fighter states and work accounting. It contains neither the seed nor the strategy values. The fixture file includes private inputs only because every vector is synthetic. Structural output validation alone does not prove correct gameplay; trusted execution or independent recomputation is still necessary. This output is not yet an A0 match result or replay package.

The application interpreter accepts a budget that can tighten the fixed ceilings: 1,024 rounds, 10,000 work units and 1 MiB of canonical output. Rules are bounded to 4 KiB and complete inputs to 16 KiB. One round, one random word and one hash block each cost one work unit. If a required limit cannot be met, execution fails without returning a partial result or winner. Raising a caller budget above a platform ceiling is invalid.

Work units measure these declared engine operations, not CPU instructions, elapsed milliseconds or process heap usage. Fixed input shapes and finite loops bound the core's work and retained events. The future worker still needs bounded artifact acquisition, wall-time/process-memory isolation and durable recovery before production use. A restrictive output budget limits emitted canonical bytes; it is not a peak-memory guarantee.

`DUEL_RUNTIME_ID` names the implementation family. `DUEL_RNG_HASH` describes the random stream. Neither is proof of a particular deployed build or authority over an admitted game. A later execution wrapper must verify approved engine build hashes, exact registry/rules/schema bindings, committed strategies and seed, qualification and the free-training scope before producing A0 results or signing a training completion.

## Sample compatibility and verification

`fixtures/duel-rules.json` encodes the sample Arena revision-2 combat values: 100 health, 6 stamina, 24 rounds, 25% base attack plus 0.5% per aggression point, strike/feint costs 2/3, guard/recover restoration 1/3, strike damage 12/3 through guard, feint damage 6/10 through guard and guard counter 6. Strategy limits preserve the sample's 0–4 recovery threshold. The rules are an explicit new competitive version, not a reinterpretation of old sample records.

The new version replaces the sample's 32-bit Mulberry seed stream with the full-seed stream above. It also uses logical event timing, omits cosmetic captions and reports actual capped damage received instead of the old event's requested hit. Identical legacy seed numbers therefore do not promise identical outcomes. Old v1/v2 sample matches retain their old engine and replay conventions.

Run public structural/hash checks with `npm test` in this package and independent gameplay/RNG verification with `python test/duel-conformance.py` using the existing `test/requirements.txt`. The Python verifier implements the rules independently and does not import the TypeScript engine. Application tests regenerate every complete expected output and exercise invalid inputs and budgets. Root development script `scripts/generate-duel-fixtures.mts` writes the separate vectors/schema; generation must be reviewed and checked independently rather than used to overwrite a failure. This script is outside the public subset and is not needed to consume or verify it.
