import { z } from "zod";
import { canonicalJson, hashDocument, parseDocument } from "./canonical.js";
import { hashResult } from "./commitments.js";
import { checkpointSchema, idSchema, matchManifestSchema, timeSchema, uintSchema,
  LIMITS, PROTOCOL, ZERO_HASH, type MatchManifest } from "./schemas.js";
import { invariant, registrySchema, validateManifest, validateQualification, validateResult } from "./validation.js";

// Separately versioned evidence extension. Existing match/result wire bytes stay unchanged.
export const TRAINING_REVISION = "a0.training.1" as const;
export const TRAINING_SECONDS = "604800" as const;
const base = { protocol: z.literal(PROTOCOL), revision: z.literal(TRAINING_REVISION) };
export const trainingPolicySchema = z.strictObject({ ...base, kind: z.literal("training_policy"),
  scope: z.literal("champion_game"), startsAt: z.literal("first_validated_played_free_completion"),
  durationSeconds: z.literal(TRAINING_SECONDS), matchCountAlternative: z.literal(null), paidEarlyAccess: z.literal(false) });
export const INITIAL_TRAINING_POLICY = Object.freeze(trainingPolicySchema.parse({ protocol: PROTOCOL,
  revision: TRAINING_REVISION, kind: "training_policy", scope: "champion_game",
  startsAt: "first_validated_played_free_completion", durationSeconds: TRAINING_SECONDS,
  matchCountAlternative: null, paidEarlyAccess: false }));

// This record refers to an independently authenticated completion; a hash is not authentication.
export const trainingCompletionSchema = z.strictObject({ ...base, kind: z.literal("training_completion"),
  championId: idSchema, gameId: idSchema, gameVersionHash: idSchema, matchId: idSchema,
  manifestHash: idSchema, qualificationHash: idSchema, resultHash: idSchema,
  completedAt: timeSchema, verificationEvidenceHash: idSchema });
export const trainingProgressSchema = z.strictObject({ ...base, kind: z.literal("training_progress"),
  championId: idSchema, gameId: idSchema, checkpoint: checkpointSchema,
  validatedMatchCount: uintSchema, firstCompletion: trainingCompletionSchema.nullable(), historyEvidenceHash: idSchema });
export const trainingEligibilitySchema = z.strictObject({ ...base, kind: z.literal("training_eligibility"),
  championId: idSchema, gameId: idSchema, policyHash: idSchema, progressHash: idSchema.nullable(), evaluatedAt: timeSchema,
  status: z.enum(["unavailable", "not_started", "training", "eligible"]),
  trainingStartedAt: timeSchema.nullable(), purseEligibleAt: timeSchema.nullable(), remainingSeconds: uintSchema.nullable() });
export const trainingAdmissionSchema = z.strictObject({ ...base, kind: z.literal("training_admission"),
  championId: idSchema, gameId: idSchema, manifestContextHash: idSchema, policyHash: idSchema,
  checkpoint: checkpointSchema, ordinaryAdmissionEvidenceHash: idSchema, revalidationEvidenceHash: idSchema, progressHash: idSchema });
export const trainingAdmissionBundleSchema = z.strictObject({ ...base, kind: z.literal("training_admission_bundle"),
  manifestHash: idSchema, policy: trainingPolicySchema, checkpoint: checkpointSchema,
  entries: z.array(z.strictObject({ admission: trainingAdmissionSchema, progress: trainingProgressSchema })).min(2).max(LIMITS.roster) });
export type TrainingCompletion = z.infer<typeof trainingCompletionSchema>;
export type TrainingProgress = z.infer<typeof trainingProgressSchema>;
export type TrainingAdmissionBundle = z.infer<typeof trainingAdmissionBundleSchema>;

/** Accounting/result consistency only. A3/A5 authenticate completion time, approved game and actual play first. */
export function trainingCompletionFromResult(input: { manifest: unknown; registry: unknown; qualification: unknown;
  result: unknown; championId: string; completedAt: string; verificationEvidenceHash: string }) {
  const registry = parseDocument(registrySchema, input.registry), m = validateManifest(input.manifest, registry);
  invariant(m.sources.length === 0 && m.format.kind === "none" && m.doorFeeWei === "0" && m.tierId === null,
    "training requires free unfunded play");
  const q = validateQualification(m, input.qualification);
  const result = validateResult(m, registry.version, q, input.result);
  invariant(result.kind === "played" && result.placements.includes(input.championId) &&
    q.entrants.some(e => e.championId === input.championId && e.status === "qualified"), "training requires actual qualified play");
  const time = BigInt(timeSchema.parse(input.completedAt));
  invariant(time >= BigInt(m.schedule.startAt) && (!q.checkpoint || time >= BigInt(q.checkpoint.timestamp)), "training completion order");
  return trainingCompletionSchema.parse({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_completion",
    championId: input.championId, gameId: m.identity.gameId, gameVersionHash: m.identity.gameVersionHash,
    matchId: m.matchId, manifestHash: hashDocument(m), qualificationHash: hashDocument(q), resultHash: hashResult(result),
    completedAt: input.completedAt, verificationEvidenceHash: input.verificationEvidenceHash });
}

/** Checks a supplied summary, not the completeness/authenticity of its referenced history. */
export function validateTrainingProgress(raw: unknown): TrainingProgress {
  const p = parseDocument(trainingProgressSchema, raw), first = p.firstCompletion;
  invariant((p.validatedMatchCount === "0") === (first === null), "training count/first completion");
  if (first) {
    invariant(first.championId === p.championId && first.gameId === p.gameId, "training progress scope");
    invariant(BigInt(first.completedAt) <= BigInt(p.checkpoint.timestamp), "future training completion");
    timeSchema.parse(String(BigInt(first.completedAt) + BigInt(TRAINING_SECONDS)));
  }
  return p;
}

/** Bounded reference reducer for a supplied complete history; persistence must also enforce unique match IDs. */
export function summarizeTrainingHistory(input: { championId: string; gameId: string; checkpoint: unknown;
  completions: unknown; historyEvidenceHash: string }): TrainingProgress {
  const records = parseDocument(z.array(trainingCompletionSchema).max(1024), input.completions);
  const unique = new Map<string, TrainingCompletion>();
  const checkpoint = parseDocument(checkpointSchema, input.checkpoint);
  for (const completion of records) {
    invariant(completion.championId === input.championId && completion.gameId === input.gameId, "training history scope");
    invariant(BigInt(completion.completedAt) <= BigInt(checkpoint.timestamp), "future training completion");
    const prior = unique.get(completion.matchId);
    invariant(!prior || canonicalJson(prior) === canonicalJson(completion), "conflicting training completion");
    unique.set(completion.matchId, completion);
  }
  const ordered = [...unique.values()].sort((a, b) => BigInt(a.completedAt) < BigInt(b.completedAt) ? -1 :
    BigInt(a.completedAt) > BigInt(b.completedAt) ? 1 : a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0);
  return validateTrainingProgress({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_progress",
    championId: input.championId, gameId: input.gameId, checkpoint, validatedMatchCount: String(unique.size),
    firstCompletion: ordered[0] ?? null, historyEvidenceHash: input.historyEvidenceHash });
}

/** Display/policy evaluation only. Callers supply trusted history and time; this never authorizes spending. */
export function evaluateTrainingEligibility(input: { policy: unknown; championId: string; gameId: string; at: string; progress: unknown | null }) {
  const policy = parseDocument(trainingPolicySchema, input.policy), at = BigInt(timeSchema.parse(input.at));
  const p = input.progress === null ? null : validateTrainingProgress(input.progress);
  if (p) {
    invariant(p.championId === input.championId && p.gameId === input.gameId, "training eligibility scope");
    invariant(BigInt(p.checkpoint.timestamp) <= at, "training snapshot after evaluation");
  }
  const started = p?.firstCompletion?.completedAt ?? null;
  const eligibleAt = started === null ? null : String(BigInt(started) + BigInt(policy.durationSeconds));
  const remaining = eligibleAt === null ? null : String(BigInt(eligibleAt) > at ? BigInt(eligibleAt) - at : BigInt(0));
  return trainingEligibilitySchema.parse({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_eligibility",
    championId: input.championId, gameId: input.gameId, policyHash: hashDocument(policy), progressHash: p ? hashDocument(p) : null,
    evaluatedAt: input.at, status: !p ? "unavailable" : started === null ? "not_started" : remaining === "0" ? "eligible" : "training",
    trainingStartedAt: started, purseEligibleAt: eligibleAt, remainingSeconds: remaining });
}

/** Zero only the per-entrant evidence slots to avoid a circular hash. Every other manifest field is bound. */
export function trainingManifestContextHash(raw: unknown) {
  const m = parseDocument(matchManifestSchema, raw);
  return hashDocument({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_manifest_context",
    manifest: { ...m, roster: m.roster.map(e => ({ ...e, admissionEvidenceHash: ZERO_HASH })) } });
}
function validateAdmissionCheckpoint(m: MatchManifest, checkpoint: z.infer<typeof checkpointSchema>) {
  invariant(checkpoint.chainId === m.chainId && checkpoint.finalityPolicyHash === m.schedule.finalityPolicyHash &&
    checkpoint.hash !== ZERO_HASH && checkpoint.finalityPolicyHash !== ZERO_HASH, "training checkpoint domain");
  invariant(BigInt(checkpoint.timestamp) < BigInt(m.schedule.enrollmentClosesAt), "training admission after enrollment");
}

/** Composes hashes for a new funded roster. Independent A2/A4 admission checks remain mandatory. */
export function bindTrainingAdmissions(input: { manifest: unknown; registry: unknown; policy: unknown; checkpoint: unknown;
  entries: Array<{ championId: string; ordinaryAdmissionEvidenceHash: string; revalidationEvidenceHash: string; progress: unknown }> }) {
  const m = validateManifest(input.manifest, input.registry), policy = parseDocument(trainingPolicySchema, input.policy);
  const checkpoint = parseDocument(checkpointSchema, input.checkpoint); validateAdmissionCheckpoint(m, checkpoint);
  invariant(m.sources.length > 0, "training admission bundle requires funded competition");
  invariant(input.entries.length === m.roster.length, "training roster coverage");
  const contextHash = trainingManifestContextHash(m), policyHash = hashDocument(policy);
  const entries = m.roster.map((entrant, i) => {
    const supplied = input.entries[i];
    invariant(supplied.championId === entrant.championId, "training roster order");
    invariant(supplied.ordinaryAdmissionEvidenceHash === entrant.admissionEvidenceHash, "training ordinary admission binding");
    const progress = validateTrainingProgress(supplied.progress);
    invariant(canonicalJson(progress.checkpoint) === canonicalJson(checkpoint), "training common checkpoint");
    const decision = evaluateTrainingEligibility({ policy, championId: entrant.championId, gameId: m.identity.gameId, at: checkpoint.timestamp, progress });
    invariant(decision.status === "eligible", "training period incomplete");
    const admission = trainingAdmissionSchema.parse({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_admission",
      championId: entrant.championId, gameId: m.identity.gameId, manifestContextHash: contextHash, policyHash, checkpoint,
      ordinaryAdmissionEvidenceHash: supplied.ordinaryAdmissionEvidenceHash, revalidationEvidenceHash: supplied.revalidationEvidenceHash,
      progressHash: hashDocument(progress) });
    return { admission, progress };
  });
  const manifest = { ...m, roster: m.roster.map((e, i) => ({ ...e, admissionEvidenceHash: hashDocument(entries[i].admission) })) };
  const bundle = trainingAdmissionBundleSchema.parse({ protocol: PROTOCOL, revision: TRAINING_REVISION, kind: "training_admission_bundle",
    manifestHash: hashDocument(manifest), policy, checkpoint, entries });
  validateTrainingAdmissionBundle({ manifest, registry: input.registry, bundle, expectedPolicyHash: policyHash, checkpoint });
  return { manifest, bundle };
}

/** Content consistency against an independently approved policy/checkpoint; does not authenticate either. */
export function validateTrainingAdmissionBundle(input: { manifest: unknown; registry: unknown; bundle: unknown;
  expectedPolicyHash: string; checkpoint: unknown }) {
  const m = validateManifest(input.manifest, input.registry), b = parseDocument(trainingAdmissionBundleSchema, input.bundle);
  const checkpoint = parseDocument(checkpointSchema, input.checkpoint); validateAdmissionCheckpoint(m, checkpoint);
  invariant(m.sources.length > 0, "training admission bundle requires funded competition");
  invariant(hashDocument(b.policy) === idSchema.parse(input.expectedPolicyHash), "training approved policy");
  invariant(b.manifestHash === hashDocument(m), "training manifest binding");
  invariant(canonicalJson(b.checkpoint) === canonicalJson(checkpoint), "training common checkpoint");
  invariant(b.entries.length === m.roster.length, "training roster coverage");
  const contextHash = trainingManifestContextHash(m);
  b.entries.forEach(({ admission: a, progress }, i) => {
    const entrant = m.roster[i];
    invariant(a.championId === entrant.championId && a.gameId === m.identity.gameId, "training roster scope/order");
    invariant(a.manifestContextHash === contextHash && a.policyHash === input.expectedPolicyHash &&
      a.progressHash === hashDocument(progress) && entrant.admissionEvidenceHash === hashDocument(a), "training evidence binding");
    invariant(canonicalJson(a.checkpoint) === canonicalJson(checkpoint) && canonicalJson(progress.checkpoint) === canonicalJson(checkpoint), "training common checkpoint");
    invariant(evaluateTrainingEligibility({ policy: b.policy, championId: entrant.championId, gameId: m.identity.gameId,
      at: checkpoint.timestamp, progress }).status === "eligible", "training period incomplete");
  });
  return b;
}

export const trainingWireSchemas = { policy: trainingPolicySchema, completion: trainingCompletionSchema,
  progress: trainingProgressSchema, eligibility: trainingEligibilitySchema, admission: trainingAdmissionSchema, bundle: trainingAdmissionBundleSchema };
