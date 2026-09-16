import { z } from "zod";
import { hashDocument, parseDocument } from "./canonical.js";
import { idSchema, PROTOCOL } from "./schemas.js";
import { invariant } from "./validation.js";

// Additive rules-data extension; existing match/result wire revisions are unchanged.
export const DUEL_REVISION = "a3.duel.1" as const;
export const DUEL_RUNTIME_ID = "agentborn/duel/1" as const;
export const DUEL_RNG_ID = "agentborn/keccak256-counter/1" as const;
export const DUEL_LIMITS = Object.freeze({ rounds: 1024, work: 10000, outputBytes: 1048576,
  inputBytes: 16384, rulesBytes: 4096, health: 1000000, stamina: 1000 });
export const DUEL_RNG_SPEC = Object.freeze({ id: DUEL_RNG_ID, domain: "agentborn.duel.rng.1",
  block: "keccak256(canonicalJson({domain,seed,counter}))", counter: "decimal string starting at 0",
  words: "eight big-endian uint32 words per block, left to right", draws: "four per round; one extra for a final tie" });
export const DUEL_RNG_HASH = hashDocument(DUEL_RNG_SPEC);
const base = { protocol: z.literal(PROTOCOL), revision: z.literal(DUEL_REVISION) };
const integer = (max: number) => z.number().int().min(0).max(max);
const positive = (max: number) => integer(max).min(1);
export const duelRulesSchema = z.strictObject({ ...base, kind: z.literal("duel_rules"),
  runtimeId: z.literal(DUEL_RUNTIME_ID), rngId: z.literal(DUEL_RNG_ID),
  health: positive(DUEL_LIMITS.health), maxRounds: positive(DUEL_LIMITS.rounds), roundMs: positive(60000),
  recoveryThresholdMax: integer(DUEL_LIMITS.stamina),
  attack: z.strictObject({ baseBps: integer(10000), aggressionBps: integer(100) }),
  stamina: z.strictObject({ max: positive(DUEL_LIMITS.stamina), strikeCost: positive(DUEL_LIMITS.stamina),
    feintCost: positive(DUEL_LIMITS.stamina), guardGain: integer(DUEL_LIMITS.stamina), recoverGain: integer(DUEL_LIMITS.stamina) }),
  damage: z.strictObject({ strike: integer(DUEL_LIMITS.health), guardedStrike: integer(DUEL_LIMITS.health),
    feint: integer(DUEL_LIMITS.health), guardedFeint: integer(DUEL_LIMITS.health), counter: integer(DUEL_LIMITS.health) }),
  tieBreak: z.literal("remaining_health_then_damage_then_seeded_coin") });
export const duelStrategySchema = z.strictObject({ aggression: integer(100), feint_rate: integer(100),
  recover_below: integer(DUEL_LIMITS.stamina) });
export const duelEntrantSchema = z.strictObject({ championId: idSchema, strategy: duelStrategySchema });
export const duelInputSchema = z.strictObject({ ...base, kind: z.literal("duel_input"), rules: duelRulesSchema,
  seed: idSchema, entrants: z.tuple([duelEntrantSchema, duelEntrantSchema]) });
export const duelBudgetSchema = z.strictObject({ maxRounds: positive(DUEL_LIMITS.rounds),
  maxWork: positive(DUEL_LIMITS.work), maxOutputBytes: positive(DUEL_LIMITS.outputBytes) });
export const DEFAULT_DUEL_BUDGET = Object.freeze({ maxRounds: DUEL_LIMITS.rounds,
  maxWork: DUEL_LIMITS.work, maxOutputBytes: DUEL_LIMITS.outputBytes });
export const duelActionSchema = z.enum(["strike", "feint", "guard", "recover"]);
export const duelFighterSchema = z.strictObject({ health: integer(DUEL_LIMITS.health), stamina: integer(DUEL_LIMITS.stamina),
  damage: integer(DUEL_LIMITS.health) });
export const duelEventSchema = z.strictObject({ seq: integer(DUEL_LIMITS.rounds - 1), atMs: positive(DUEL_LIMITS.rounds * 60000),
  actions: z.tuple([duelActionSchema, duelActionSchema]), fighters: z.tuple([duelFighterSchema, duelFighterSchema]),
  damageReceived: z.tuple([integer(DUEL_LIMITS.health), integer(DUEL_LIMITS.health)]), forced: z.tuple([z.boolean(), z.boolean()]) });
export const duelOutputSchema = z.strictObject({ ...base, kind: z.literal("duel_simulation"),
  inputHash: idSchema, rulesHash: idSchema, winnerId: idSchema, placements: z.tuple([idSchema, idSchema]),
  reason: z.enum(["knockout", "remaining_health", "damage_dealt", "seeded_tie_break"]), rounds: positive(DUEL_LIMITS.rounds),
  events: z.array(duelEventSchema).min(1).max(DUEL_LIMITS.rounds), finalState: z.tuple([duelFighterSchema, duelFighterSchema]),
  usage: z.strictObject({ work: positive(DUEL_LIMITS.work), randomDraws: positive(DUEL_LIMITS.rounds * 4 + 1),
    hashBlocks: positive(Math.ceil((DUEL_LIMITS.rounds * 4 + 1) / 8)) }) });
export type DuelRules = z.infer<typeof duelRulesSchema>;
export type DuelStrategy = z.infer<typeof duelStrategySchema>;
export type DuelInput = z.infer<typeof duelInputSchema>;
export type DuelBudget = z.infer<typeof duelBudgetSchema>;
export type DuelAction = z.infer<typeof duelActionSchema>;
export type DuelFighter = z.infer<typeof duelFighterSchema>;
export type DuelEvent = z.infer<typeof duelEventSchema>;
export type DuelOutput = z.infer<typeof duelOutputSchema>;

export function validateDuelRules(raw: unknown): DuelRules {
  const rules = parseDocument(duelRulesSchema, raw, DUEL_LIMITS.rulesBytes), s = rules.stamina;
  invariant(rules.attack.baseBps + 100 * rules.attack.aggressionBps <= 10000, "duel attack probability");
  invariant(s.strikeCost <= s.feintCost && s.feintCost <= s.max && s.guardGain <= s.max && s.recoverGain <= s.max,
    "duel stamina parameters");
  invariant(rules.recoveryThresholdMax <= s.max, "duel recovery threshold");
  return rules;
}
export function validateDuelInput(raw: unknown): DuelInput {
  const input = parseDocument(duelInputSchema, raw, DUEL_LIMITS.inputBytes);
  validateDuelRules(input.rules);
  invariant(input.entrants[0].championId !== input.entrants[1].championId, "duplicate duel champion");
  invariant(input.entrants.every(e => e.strategy.recover_below <= input.rules.recoveryThresholdMax), "duel strategy recovery threshold");
  return input;
}
