import { z } from "zod";

export const REVISION = "2.0.0-alpha.1" as const;
export const PROTOCOL = "agentborn/2" as const;
export const ZERO_HASH = `0x${"0".repeat(64)}`;
export const ZERO_ADDRESS = `0x${"0".repeat(40)}`;
export const LIMITS = Object.freeze({ documentBytes: 1048576, replayBytes: 16777216,
  depth: 32, nodes: 1000000, roster: 64, sources: 192, events: 100000 });
const base = { protocol: z.literal(PROTOCOL), revision: z.literal(REVISION) };
export const hashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);
export const idSchema = hashSchema.refine(value => value !== ZERO_HASH, "zero ID");
export const addressSchema = z.string().regex(/^0x[0-9a-f]{40}$/);
export const recipientSchema = addressSchema.refine(value => value !== ZERO_ADDRESS, "zero recipient");
export const uintSchema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine(value => BigInt(value) < BigInt(2) ** BigInt(256), "uint256 overflow");
export const positiveUintSchema = uintSchema.refine(value => value !== "0", "positive amount required");
export const timeSchema = z.string().regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine(value => BigInt(value) < BigInt(2) ** BigInt(64), "uint64 overflow");
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const bps = z.number().int().min(0).max(10000);
export const chainSchema = z.literal("4663");
export const assetSchema = z.strictObject({ chainId: chainSchema, token: addressSchema });
export const winningsSchema = z.strictObject({ splitter: recipientSchema, vaultBps: bps.min(5000) });
export const assetPermissionSchema = z.strictObject({ asset: assetSchema, maxContributionBaseUnits: uintSchema,
  minimumRemainingBaseUnits: uintSchema, grossDailyBudgetBaseUnits: uintSchema });
export const checkpointSchema = z.strictObject({ chainId: chainSchema, number: uintSchema,
  hash: hashSchema, timestamp: timeSchema, finalityPolicyHash: hashSchema });
export const identitySchema = z.strictObject({ gameId: idSchema, gameVersionHash: hashSchema,
  leagueId: idSchema, seasonId: idSchema, tierConfigHash: hashSchema, matchmakingPolicyHash: hashSchema });
export const scheduleSchema = z.strictObject({ enrollmentClosesAt: timeSchema, startAt: timeSchema,
  resultCommitDeadline: timeSchema, revealAt: timeSchema, settlementNotBefore: timeSchema,
  playbackSeconds: count, finalityPolicyHash: hashSchema });
export const limitsSchema = z.strictObject({ maxEntrants: count.min(2).max(LIMITS.roster),
  maxTicks: count.min(1), maxFuel: positiveUintSchema, maxMemoryBytes: count.min(1),
  maxEvents: count.min(1).max(LIMITS.events), maxEventBytes: count.min(1),
  maxReplayBytes: count.min(1).max(LIMITS.replayBytes), maxSheetBytes: count.min(1),
  maxRendererAssetBytes: count.min(1) });
export const placementRuleSchema = z.strictObject({ qualifiedCount: count.min(2).max(LIMITS.roster),
  sharesBps: z.array(bps.min(1)).min(1).max(LIMITS.roster) });
export const gameVersionSchema = z.strictObject({ ...base, gameId: idSchema,
  rulesArtifactHash: hashSchema, strategySchemaHash: hashSchema, eventSchemaHash: hashSchema,
  scoringPolicyHash: hashSchema, runtimeId: z.string().min(1).max(128), runtimeHash: hashSchema,
  rngId: z.string().min(1).max(128), rngHash: hashSchema, numericSemantics: z.string().min(1).max(256),
  supportedRosters: z.array(count.min(2).max(LIMITS.roster)).min(1).max(LIMITS.roster),
  reducedRosterPolicyHash: hashSchema, placementRules: z.array(placementRuleSchema).min(1).max(LIMITS.roster),
  limits: limitsSchema });
export const leagueSchema = z.strictObject({ ...base, gameId: idSchema, leagueId: idSchema,
  authorship: z.enum(["operator", "grokbot"]), provenancePolicyHash: hashSchema });
export const seasonSchema = z.strictObject({ ...base, gameId: idSchema, leagueId: idSchema,
  seasonId: idSchema, gameVersionHash: hashSchema, startsAt: timeSchema, endsAt: timeSchema });
export const formatSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("equal"), amountWei: positiveUintSchema, minimumWei: uintSchema }),
  z.strictObject({ kind: z.literal("percentage"), entryBps: bps.min(1).max(2000), minimumWei: uintSchema }),
  z.strictObject({ kind: z.literal("bounty"), championId: idSchema,
    contribution: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("fixed"), amountWei: positiveUintSchema }),
      z.strictObject({ kind: z.literal("percentage"), entryBps: bps.min(1).max(2000) }),
    ]), minimumWei: uintSchema }),
]);
const benefitSchema = z.strictObject({ formats: z.array(z.enum(["none", "equal", "percentage", "bounty"])).min(1).max(4),
  contributionAsset: assetSchema.optional(),
  rosterSizes: z.array(count.min(2).max(LIMITS.roster)).min(1).max(LIMITS.roster),
  minAvailablePurseWei: uintSchema, maxAvailablePurseWei: uintSchema.nullable(),
  minNetEthPrizeWei: uintSchema, maxNetEthPrizeWei: uintSchema.nullable() });
export const tierConfigSchema = z.strictObject({ ...base, gameId: idSchema, leagueId: idSchema,
  version: positiveUintSchema, inheritance: z.enum(["explicit_only", "cumulative"]),
  token: assetSchema, tokenDecimals: count.max(255),
  tiers: z.array(z.strictObject({ tierId: idSchema, quantityBaseUnits: uintSchema,
    benefits: z.array(benefitSchema).min(1).max(16) })).min(1).max(32) });
export const finalityPolicySchema = z.strictObject({ ...base, chainId: chainSchema,
  startCheckpoint: z.literal("first_finalized_block_at_or_after_start"),
  commitmentFinality: z.literal("finalized"), finalizationFinality: z.literal("finalized"),
  extraSettlementDelaySeconds: count, recoveryDeadlineSeconds: count.min(1) });
export const cancellationPolicySchema = z.strictObject({ ...base,
  disposition: z.enum(["refund_all", "unresolved"]),
  enrollmentDeadlineSeconds: count.min(1), recoveryDeadlineSeconds: count.min(1) });
export const assetPolicySchema = z.strictObject({ ...base, standardTransfersOnly: z.literal(true),
  assets: z.array(assetSchema).min(1).max(64) });
export const selectionPolicySchema = z.strictObject({ ...base, version: positiveUintSchema,
  kind: z.enum(["audited_draw", "queue_order", "unresolved"]),
  provisionalLeaseSeconds: count.min(1), candidateLimit: count.min(2), evidencePolicyHash: hashSchema });
export const permissionSchema = z.strictObject({ ...base, handlerId: idSchema, championId: idSchema,
  version: positiveUintSchema, validAfter: timeSchema, validUntil: timeSchema, paused: z.boolean(),
  allowedGames: z.array(idSchema).min(1).max(128), allowedLeagues: z.array(idSchema).min(1).max(128),
  allowedFormats: z.array(z.enum(["none", "equal", "percentage", "bounty"])).min(1).max(4),
  allowOpen: z.boolean(), maxSliceBps: bps.max(2000), maxContributionWei: uintSchema,
  minimumRemainingWei: uintSchema, grossDailyBudgetWei: uintSchema,
  assetPermissions: z.array(assetPermissionSchema).max(64).optional(),
  maxMatchesPerDay: count, minimumMatchIntervalSeconds: count });
export const entryAuthorizationSchema = z.strictObject({ ...base, handlerId: idSchema,
  championId: idSchema, signer: recipientSchema, board: recipientSchema, chainId: chainSchema,
  permissionsHash: hashSchema, version: positiveUintSchema, nonce: uintSchema,
  validAfter: timeSchema, validUntil: timeSchema, signature: z.string().regex(/^0x(?:[0-9a-f]{2})+$/).max(8194) });
export const rosterEntrySchema = z.strictObject({ championId: idSchema, handlerId: idSchema,
  ownershipSnapshotHash: hashSchema, payout: recipientSchema, qualifyingWallet: recipientSchema, winnings: winningsSchema.optional(),
  vault: recipientSchema.nullable(), strategyCommitment: hashSchema, permissionsHash: hashSchema,
  authorizationVersion: positiveUintSchema, admissionEvidenceHash: hashSchema,
  grossDailyUsedWei: uintSchema, dayBucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const commonSource = { sourceId: idSchema, contract: recipientSchema, asset: assetSchema,
  grossAmount: positiveUintSchema, feeAmount: uintSchema, netAmount: uintSchema };
export const sourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...commonSource, kind: z.literal("vault"), championId: idSchema,
    stage: z.enum(["proposal", "roster"]), reservationRef: hashSchema,
    availableAtReservationWei: positiveUintSchema, maxSliceBps: bps.min(1).max(2000) }),
  z.strictObject({ ...commonSource, kind: z.literal("entry_pot"),
    deposits: z.array(z.strictObject({ championId: idSchema, funder: recipientSchema, amount: positiveUintSchema })).min(1).max(LIMITS.roster) }),
  z.strictObject({ ...commonSource, kind: z.literal("sponsor"), award: z.literal("placement"),
    deposits: z.array(z.strictObject({ depositId: idSchema, funder: recipientSchema, amount: positiveUintSchema })).min(1).max(128) }),
]);
export const matchManifestSchema = z.strictObject({ ...base, chainId: chainSchema, board: recipientSchema,
  eventId: idSchema, matchId: idSchema, identity: identitySchema, schedule: scheduleSchema,
  contributionAsset: assetSchema.optional(),
  format: formatSchema, exposure: z.enum(["open", "bracketed"]),
  capacity: count.min(2).max(LIMITS.roster), doorFeeWei: uintSchema, tierId: idSchema.nullable(),
  cancellationPolicyHash: hashSchema, assetPolicyHash: hashSchema, quoteRecordHash: hashSchema.nullable(),
  settlementFeeBps: z.literal(100), treasury: recipientSchema,
  roster: z.array(rosterEntrySchema).min(2).max(LIMITS.roster),
  sources: z.array(sourceSchema).max(LIMITS.sources) });
export const qualificationSchema = z.strictObject({ ...base, matchId: idSchema,
  manifestHash: hashSchema, checkpoint: checkpointSchema.nullable(),
  entrants: z.array(z.strictObject({ championId: idSchema,
    status: z.enum(["qualified", "no_show", "unknown"]),
    reason: z.enum(["qualified", "token_shortfall", "explicit_abandonment", "infrastructure_unavailable"]),
    evidenceHash: hashSchema })).min(2).max(LIMITS.roster) });
export const paymentSchema = z.strictObject({ sourceId: idSchema, asset: assetSchema,
  kind: z.enum(["treasury", "prize", "return", "reservation_release"]), beneficiary: recipientSchema,
  championId: idSchema.nullable(), amount: positiveUintSchema });
export const resultSchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  kind: z.enum(["played", "walkover"]), qualificationHash: hashSchema,
  placements: z.array(idSchema).min(1).max(LIMITS.roster),
  sharesBps: z.array(bps.min(1)).min(1).max(LIMITS.roster),
  payments: z.array(paymentSchema).max(LIMITS.sources * (LIMITS.roster + 1)) });
export const cancellationSchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  phase: z.enum(["entry_committed", "start_checked", "seeded", "simulated", "result_committed"]),
  reason: z.enum(["zero_qualified", "simulation_unrecoverable", "opening_unrecoverable", "commitment_deadline_missed"]),
  evidenceHash: hashSchema, qualificationHash: hashSchema.nullable(),
  cancelledAt: timeSchema, returns: z.array(paymentSchema).max(LIMITS.sources * 128) });
// Generic game payloads still need the admitted game's event-schema validator and disclosure review.
const jsonValue: z.ZodType<unknown> = z.json();
export const replaySchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  gameVersionHash: hashSchema, eventSchemaHash: hashSchema, rendererVersion: z.string().min(1).max(128),
  kind: z.enum(["played", "walkover"]), resultHash: hashSchema,
  visibleRoster: z.array(z.strictObject({ championId: idSchema, name: z.string().min(1).max(96),
    cosmeticRef: z.string().max(512) })).min(1).max(LIMITS.roster),
  initialState: jsonValue, durationMs: count,
  events: z.array(z.strictObject({ seq: count, atMs: count, type: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    payload: jsonValue })).max(LIMITS.events) });
export const sealedEnvelopeSchema = z.strictObject({ ...base, matchId: idSchema,
  manifestHash: hashSchema, algorithm: z.literal("AES-256-GCM"),
  iv: z.string().regex(/^0x[0-9a-f]{24}$/), aadHash: hashSchema,
  ciphertext: z.string().regex(/^0x(?:[0-9a-f]{2}){16,}$/).max(LIMITS.replayBytes * 2 + 2097152) });
export const openingSchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  result: resultSchema, replayHash: hashSchema, seed: hashSchema.nullable(),
  seedCommitment: hashSchema, nonce: idSchema, encryptionKey: idSchema,
  sealedEnvelopeHash: hashSchema });
export const commitmentReceiptSchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  chainId: chainSchema, board: recipientSchema, seedCommitment: hashSchema,
  resultCommitment: hashSchema, sealedEnvelopeHash: hashSchema,
  transactionHash: hashSchema, block: checkpointSchema });
export const paymentStatusSchema = z.strictObject({ ...base, matchId: idSchema,
  allocation: z.enum(["not_ready", "pending", "allocated"]),
  delivery: z.enum(["not_ready", "pending", "partial", "paid"]),
  liabilities: z.array(z.strictObject({ paymentId: idSchema, payment: paymentSchema,
    state: z.enum(["pending", "sent", "confirmed"]), transactionHash: hashSchema.nullable() })).max(12480) });
export const matchStatusSchema = z.strictObject({ ...base, matchId: idSchema, manifestHash: hashSchema,
  lifecycle: z.enum(["event_funded", "seats_filling", "entry_committed", "start_checked", "seeded",
    "simulated", "result_committed", "playback", "revealed", "finalized", "settling", "complete", "cancelled"]),
  outcome: z.enum(["unpublished", "played", "walkover", "cancelled"]),
  revealAt: timeSchema, openingAvailable: z.boolean(), payment: paymentStatusSchema });
export const opportunitySchema = z.strictObject({ ...base, eventId: idSchema, identity: identitySchema,
  contributionAsset: assetSchema.optional(),
  plannedSchedule: scheduleSchema, format: formatSchema, exposure: z.enum(["open", "bracketed"]),
  capacity: count.min(2).max(LIMITS.roster), doorFeeWei: uintSchema, tierId: idSchema.nullable(),
  cancellationPolicyHash: hashSchema, fundingCommitments: z.array(hashSchema).max(LIMITS.sources),
  status: z.enum(["proposed", "funded", "seats_filling", "scheduled", "cancelled"]) });
export const registrationSchema = z.strictObject({ ...base, gameId: idSchema, studioId: idSchema,
  manifest: gameVersionSchema, rendererVersion: z.string().min(1).max(128),
  rendererArtifactHash: hashSchema, requestedLeagues: z.array(idSchema).min(1).max(16),
  verificationEvidenceHash: hashSchema });
export const discoverySchema = z.strictObject({ ...base, versions: z.array(z.strictObject({
  gameId: idSchema, gameVersionHash: hashSchema, leagueId: idSchema, seasonId: idSchema,
  state: z.enum(["pending_review", "approved", "quarantined"]),
  moneyEnabled: z.boolean(), manifestPath: z.string().regex(/^\/api\/v2\//).max(512) })).max(256),
  nextCursor: z.string().max(256).nullable() });
export const scoutOrderSchema = z.strictObject({ ...base, orderId: idSchema, reportId: idSchema,
  championId: idSchema, buyerId: idSchema, scopeHash: hashSchema, snapshotHash: hashSchema.nullable(),
  authorization: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("included"), planId: idSchema, periodId: idSchema, allowanceUnitId: idSchema }),
    z.strictObject({ kind: z.literal("manual_payment"), priceWei: positiveUintSchema,
      surchargeWei: uintSchema, approvalHash: hashSchema, paymentTransaction: hashSchema.nullable() }),
  ]), state: z.enum(["awaiting_approval", "awaiting_payment", "entitled", "snapshot_pending", "delivered"]),
  snapshotAt: timeSchema.nullable() });
export const errorSchema = z.strictObject({ ...base, requestId: idSchema,
  code: z.enum(["INVALID_DOCUMENT", "UNSUPPORTED_REVISION", "UNAUTHORIZED", "FORBIDDEN",
    "NOT_FOUND", "NOT_RELEASED", "CONFLICT", "IDEMPOTENCY_CONFLICT", "INELIGIBLE",
    "ROSTER_INCOMPLETE", "UNRESOLVED_POLICY", "CHAIN_UNAVAILABLE", "RECONCILING", "LIMIT_EXCEEDED"]),
  message: z.string().max(512), retryable: z.boolean() });
export const studioRequestSchema = z.strictObject({ ...base, kind: z.literal("studio_request"),
  keyId: idSchema, gameId: idSchema, method: z.enum(["GET", "POST"]),
  path: z.string().regex(/^\/api\/v2\/[a-z0-9/-]+$/).max(512), bodySha256: hashSchema,
  issuedAt: timeSchema, nonce: idSchema });
export const casualSignalSchema = z.strictObject({ ...base, kind: z.literal("casual_result"),
  keyId: idSchema, matchId: idSchema, manifestHash: hashSchema, resultHash: hashSchema,
  replayHash: hashSchema, seedCommitment: hashSchema, publishedAt: timeSchema,
  signature: z.string().regex(/^0x[0-9a-f]{128}$/) });

export const wireSchemas = { gameVersion: gameVersionSchema, league: leagueSchema, season: seasonSchema,
  tierConfig: tierConfigSchema, finalityPolicy: finalityPolicySchema, cancellationPolicy: cancellationPolicySchema, assetPolicy: assetPolicySchema,
  selectionPolicy: selectionPolicySchema, permission: permissionSchema, entryAuthorization: entryAuthorizationSchema,
  matchManifest: matchManifestSchema, qualification: qualificationSchema, result: resultSchema,
  cancellation: cancellationSchema, replay: replaySchema, sealedEnvelope: sealedEnvelopeSchema,
  opening: openingSchema, commitmentReceipt: commitmentReceiptSchema, paymentStatus: paymentStatusSchema,
  matchStatus: matchStatusSchema, opportunity: opportunitySchema, registration: registrationSchema,
  discovery: discoverySchema, scoutOrder: scoutOrderSchema, studioRequest: studioRequestSchema,
  casualSignal: casualSignalSchema, error: errorSchema };
export type MatchManifest = z.infer<typeof matchManifestSchema>;
export type GameVersion = z.infer<typeof gameVersionSchema>;
export type Qualification = z.infer<typeof qualificationSchema>;
export type ResultRecord = z.infer<typeof resultSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Cancellation = z.infer<typeof cancellationSchema>;
