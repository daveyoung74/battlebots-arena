import { z } from "zod";
import * as P from "@agentborn/protocol-v2";

export const BUNDLE_BYTES = 8 * 1024 * 1024;
export const RENDERER = "agentborn/duel-replay/1";
export const policySchema = z.strictObject({
  gameId: P.idSchema,
  gameVersionHash: P.idSchema,
  registryHash: P.idSchema,
  chainId: P.chainSchema,
  board: P.recipientSchema,
  rules: P.duelRulesSchema,
});
export type ViewerPolicy = z.infer<typeof policySchema>;
const base = {
  version: z.literal(1),
  manifest: P.matchManifestSchema,
  registry: P.registrySchema,
  status: P.matchStatusSchema,
};
export const bundleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("replay"),
    qualification: P.qualificationSchema,
    receipt: P.commitmentReceiptSchema,
    envelope: P.sealedEnvelopeSchema,
    replay: P.replaySchema,
    opening: P.openingSchema.nullable(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("cancelled"),
    qualification: P.qualificationSchema.nullable(),
    cancellation: P.cancellationSchema,
  }),
]);
export type ViewerBundle = z.infer<typeof bundleSchema>;
export const signalSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("replay"),
    status: P.matchStatusSchema,
    opening: P.openingSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("cancelled"),
    status: P.matchStatusSchema,
    qualification: P.qualificationSchema.nullable(),
    cancellation: P.cancellationSchema,
  }),
]);
export type ViewerSignal = z.infer<typeof signalSchema>;
export function signalOf(b: ViewerBundle): ViewerSignal {
  return b.kind === "replay"
    ? { kind: b.kind, status: b.status, opening: b.opening }
    : {
        kind: b.kind,
        status: b.status,
        qualification: b.qualification,
        cancellation: b.cancellation,
      };
}
export async function applySignal(
  previous: ViewerBundle,
  raw: unknown,
  policy: ViewerPolicy,
  now = Date.now(),
) {
  const signal = P.parseDocument(signalSchema, raw);
  requireValue(
    signal.status.matchId === previous.manifest.matchId,
    "Signal match mismatch",
  );
  if (signal.kind === "cancelled") {
    requireValue(
      previous.kind !== "replay" || !previous.opening,
      "Published result cannot become cancelled",
    );
    if (previous.kind === "cancelled")
      requireValue(
        P.hashDocument(previous.cancellation) ===
          P.hashDocument(signal.cancellation),
        "Cancellation changed",
      );
    return verifyBundle(
      {
        version: 1,
        manifest: previous.manifest,
        registry: previous.registry,
        ...signal,
      },
      policy,
      now,
    );
  }
  requireValue(
    previous.kind === "replay",
    "Cancelled history cannot become active",
  );
  requireValue(
    !previous.opening ||
      (signal.opening &&
        P.hashDocument(previous.opening) === P.hashDocument(signal.opening)),
    "Published opening changed",
  );
  return verifyBundle({ ...previous, ...signal }, policy, now);
}
export const viewerConfigSchema = z.strictObject({
  mode: z.enum(["fixture", "protocol"]),
  policy: policySchema,
  matches: z
    .array(z.strictObject({ id: P.idSchema, label: z.string().min(1).max(80) }))
    .min(1)
    .max(32),
  agentbornOrigin: z.string().url().nullable(),
  studioPreview: z.boolean(),
});
export type ViewerConfig = z.infer<typeof viewerConfigSchema>;
export function requireValue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}
export function parseBundle(bytes: Uint8Array) {
  return P.parseCanonical(bundleSchema, bytes, BUNDLE_BYTES);
}

/** Content verification against the configured AgentBorn response; not independent chain/finality verification. */
export async function verifyBundle(
  raw: unknown,
  rawPolicy: unknown,
  now = Date.now(),
) {
  const policy = P.parseDocument(policySchema, rawPolicy),
    bundle = P.parseDocument(bundleSchema, raw, BUNDLE_BYTES);
  const r = bundle.registry,
    m = P.validateManifest(bundle.manifest, r),
    s = bundle.status;
  const rules = P.validateDuelRules(policy.rules),
    manifestHash = P.hashDocument(m);
  requireValue(Number.isSafeInteger(now) && now >= 0, "Invalid viewer clock");
  requireValue(
    m.identity.gameId === policy.gameId &&
      m.identity.gameVersionHash === policy.gameVersionHash &&
      P.hashDocument(r) === policy.registryHash &&
      m.chainId === policy.chainId &&
      m.board === policy.board &&
      r.version.runtimeId === P.DUEL_RUNTIME_ID &&
      r.version.rngHash === P.DUEL_RNG_HASH &&
      r.version.rulesArtifactHash === P.hashDocument(rules),
    "Unapproved game version",
  );
  requireValue(
    m.capacity === 2 &&
      m.sources.length === 0 &&
      m.format.kind === "none" &&
      m.doorFeeWei === "0" &&
      m.tierId === null,
    "Only free two-player duels are supported",
  );
  requireValue(
    s.matchId === m.matchId &&
      s.manifestHash === manifestHash &&
      s.payment.matchId === m.matchId &&
      s.revealAt === m.schedule.revealAt &&
      s.payment.liabilities.length === 0,
    "Status identity mismatch",
  );
  if (bundle.kind === "cancelled") {
    requireValue(
      s.lifecycle === "cancelled" &&
        s.outcome === "cancelled" &&
        !s.openingAvailable,
      "Cancellation status mismatch",
    );
    P.validateCancellation(
      m,
      r.cancellation,
      bundle.cancellation,
      bundle.qualification ?? undefined,
    );
    return {
      bundle,
      rules,
      events: [] as P.DuelEvent[],
      result: null,
      assurance: "cancellation_from_configured_source" as const,
    };
  }
  requireValue(
    s.lifecycle !== "cancelled" && s.outcome !== "cancelled",
    "Cancelled match cannot be replayed as active",
  );
  const q = P.validateQualification(m, bundle.qualification),
    replay = bundle.replay,
    receipt = bundle.receipt;
  const eligible = q.entrants
    .filter((e) => e.status === "qualified")
    .map((e) => e.championId);
  requireValue(
    q.checkpoint &&
      receipt.matchId === m.matchId &&
      receipt.manifestHash === manifestHash &&
      receipt.chainId === m.chainId &&
      receipt.board === m.board &&
      receipt.block.chainId === m.chainId &&
      receipt.block.finalityPolicyHash === m.schedule.finalityPolicyHash &&
      BigInt(receipt.block.timestamp) >= BigInt(q.checkpoint.timestamp) &&
      BigInt(receipt.block.timestamp) <=
        BigInt(m.schedule.resultCommitDeadline),
    "Receipt identity or time mismatch",
  );
  requireValue(
    bundle.envelope.matchId === m.matchId &&
      bundle.envelope.manifestHash === manifestHash &&
      P.hashDocument(bundle.envelope, P.ENVELOPE_BYTES) ===
        receipt.sealedEnvelopeHash,
    "Envelope mismatch",
  );
  requireValue(
    replay.matchId === m.matchId &&
      replay.manifestHash === manifestHash &&
      replay.gameVersionHash === policy.gameVersionHash &&
      replay.eventSchemaHash === r.version.eventSchemaHash &&
      replay.rendererVersion === RENDERER &&
      P.canonicalJson(replay.visibleRoster.map((e) => e.championId).sort()) ===
        P.canonicalJson([...eligible].sort()),
    "Replay identity or renderer mismatch",
  );
  requireValue(
    replay.events.length <=
      Math.min(r.version.limits.maxEvents, rules.maxRounds) &&
      replay.durationMs <= m.schedule.playbackSeconds * 1000 &&
      P.canonicalJson(replay, r.version.limits.maxReplayBytes),
    "Replay limit",
  );
  let events: P.DuelEvent[] = [];
  if (replay.kind === "walkover") {
    requireValue(
      eligible.length === 1 &&
        replay.events.length === 0 &&
        replay.durationMs === 0,
      "Walkover cannot contain combat",
    );
    P.parseDocument(
      z.strictObject({ kind: z.literal("a3.duel_walkover.1") }),
      replay.initialState,
    );
  } else {
    requireValue(
      eligible.length === 2 &&
        replay.events.length > 0 &&
        P.canonicalJson(replay.visibleRoster.map((e) => e.championId)) ===
          P.canonicalJson(m.roster.map((e) => e.championId)),
      "Duel roster order",
    );
    const initial = {
      kind: "a3.duel_initial_state.1",
      fighters: m.roster.map((e) => ({
        championId: e.championId,
        health: rules.health,
        stamina: rules.stamina.max,
        damage: 0,
      })),
    };
    requireValue(
      P.canonicalJson(replay.initialState) === P.canonicalJson(initial),
      "Unsupported initial state",
    );
    events = replay.events.map((event, i) => {
      const payload = P.parseDocument(P.duelEventSchema, event.payload);
      requireValue(
        event.type === "duel_exchange" &&
          event.seq === i &&
          payload.seq === i &&
          event.atMs === payload.atMs &&
          event.atMs === (i + 1) * rules.roundMs &&
          event.atMs <= replay.durationMs &&
          payload.fighters.every(
            (f) => f.health <= rules.health && f.stamina <= rules.stamina.max,
          ),
        "Invalid duel event",
      );
      P.canonicalJson(event, r.version.limits.maxEventBytes);
      return payload;
    });
    requireValue(
      events.at(-1)!.atMs === replay.durationMs,
      "Incomplete replay duration",
    );
  }
  requireValue(
    !!bundle.opening === s.openingAvailable,
    "Opening status mismatch",
  );
  if (!bundle.opening) {
    requireValue(
      s.outcome === "unpublished",
      "Unopened result must remain unpublished",
    );
    return {
      bundle,
      rules,
      events,
      result: null,
      assurance: "studio_preview_unverified_outcome" as const,
    };
  }
  const verified = await P.verifyPublishedPackage({
    ...bundle,
    now: String(Math.floor(now / 1000)),
  });
  requireValue(
    P.hashDocument(verified.replay, P.LIMITS.replayBytes) ===
      P.hashDocument(replay, P.LIMITS.replayBytes) &&
      s.outcome === verified.result.kind,
    "Opening differs from the downloaded replay",
  );
  return {
    bundle,
    rules,
    events,
    result: verified.result,
    assurance: verified.assurance,
  };
}
export type VerifiedView = Awaited<ReturnType<typeof verifyBundle>>;
export function frameAt(view: VerifiedView, milliseconds: number) {
  requireValue(Number.isFinite(milliseconds), "Invalid playback position");
  return view.events.findLast((event) => event.atMs <= milliseconds) ?? null;
}
