import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
import {
  manifestSchema,
  profileSchema,
  packetSchema,
  observationSchema,
  hash,
  packageHash,
  verifyPacket,
  matchPinSchema,
} from "./model.ts";
import { verifyLiveProgress } from "./progress.ts";

export const OUTCOME_REVISION = "free.match.public-outcome.1";
export const outcomePinSchema = matchPinSchema
  .omit({ packageHash: true })
  .extend({
    manifestHash: P.idSchema,
    commitment: P.idSchema.refine((v) => v !== P.ZERO_HASH).nullable(),
  });
export type OutcomePin = z.infer<typeof outcomePinSchema>;
const headSchema = observationSchema.shape.head;
const terminalRecordSchema = z.strictObject({
  revision: z.literal("free.match.completion.1"),
  matchId: P.idSchema,
  profileHash: P.idSchema,
  gameId: P.idSchema,
  gameVersionHash: P.idSchema,
  manifestHash: P.idSchema,
  policyHash: z.literal(P.hashDocument(P.INITIAL_TRAINING_POLICY)),
  mode: z.enum(["casual", "ranked"]),
  disposition: z.enum(["cancelled", "unsubmitted"]),
  champions: z.tuple([P.idSchema, P.idSchema]),
  ranks: z.array(P.idSchema).length(0),
  completedAt: z.null(),
  sourceHash: P.idSchema,
});
const terminalCompletionSchema = z.strictObject({
  revision: z.literal("free.match.completion-status.1"),
  matchId: P.idSchema,
  gameId: P.idSchema,
  state: z.enum(["complete", "awaiting_record"]),
  disposition: z.enum(["cancelled", "unsubmitted"]),
  completionHash: P.idSchema.nullable(),
  trainingCredited: z.literal(false),
  completedAt: z.null(),
  participants: z.tuple([P.idSchema, P.idSchema]),
});
export const outcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    revision: z.literal(OUTCOME_REVISION),
    kind: z.literal("replay"),
    packet: packetSchema,
    observation: observationSchema,
  }),
  z.strictObject({
    revision: z.literal(OUTCOME_REVISION),
    kind: z.literal("terminal"),
    manifest: manifestSchema,
    profile: profileSchema,
    record: terminalRecordSchema,
    completion: terminalCompletionSchema,
    head: headSchema,
  }),
]);
export type PublicOutcome = z.infer<typeof outcomeSchema>;
export const outcomeHead = (v: PublicOutcome) =>
  v.kind === "replay" ? v.observation.head : v.head;

/** Source-verified observations, with independent identity/commitment consistency checks. */
export function verifyOutcome(
  raw: unknown,
  pin: OutcomePin,
  previous?: PublicOutcome,
): PublicOutcome {
  const value = outcomeSchema.parse(raw);
  if (packageHash(value) !== packageHash(raw))
    throw new Error("Outcome fields");
  const m = value.kind === "replay" ? value.packet.manifest : value.manifest;
  if (
    m.matchId !== pin.id ||
    m.profileHash !== pin.profileHash ||
    hash(m) !== pin.manifestHash
  )
    throw new Error("Outcome identity");
  if (value.kind === "replay") {
    if (!pin.commitment || value.packet.commitment !== pin.commitment)
      throw new Error("Outcome commitment");
    verifyPacket(value.packet, pin, value.observation);
    if (
      value.packet.completion === undefined ||
      (value.packet.state === "released" && value.packet.completion === null)
    )
      throw new Error("Missing outcome completion");
    if (previous?.kind === "replay")
      verifyLiveProgress(value.packet, previous.packet);
    if (previous?.kind === "terminal")
      throw new Error("Terminal outcome changed");
  } else {
    const p = value.profile,
      t = m.terms,
      r = value.record,
      c = value.completion;
    if (
      hash(p) !== pin.profileHash ||
      t.gameId !== p.setup.game.gameId ||
      t.gameVersionHash !== hash(p.setup.game) ||
      p.setup.game.rulesArtifactHash !== hash(p.setup.rules) ||
      m.roster[0].championId === m.roster[1].championId ||
      m.roster[0].handlerId === m.roster[1].handlerId
    )
      throw new Error("Terminal profile or roster");
    if (
      BigInt(t.commitDeadline) !==
        BigInt(t.startAt) + BigInt(p.commitWindowSeconds) ||
      BigInt(t.revealAt) !==
        BigInt(t.commitDeadline) + BigInt(p.playbackSeconds) ||
      BigInt(t.releaseAt) !== BigInt(t.revealAt) + BigInt(p.finalitySeconds) ||
      BigInt(t.recoveryAt) !==
        BigInt(t.releaseAt) + BigInt(p.recoveryDelaySeconds) ||
      t.playbackSeconds !== p.playbackSeconds ||
      m.roster.some(
        (s) =>
          s.dailyMatches > p.dailyLimit ||
          s.intervalSeconds < p.minimumInterval ||
          BigInt(s.validUntil) <= BigInt(t.startAt),
      )
    )
      throw new Error("Terminal terms");
    if (
      r.matchId !== m.matchId ||
      r.profileHash !== m.profileHash ||
      r.manifestHash !== hash(m) ||
      r.gameId !== t.gameId ||
      r.gameVersionHash !== t.gameVersionHash ||
      r.mode !== (t.mode === 0 ? "casual" : "ranked") ||
      hash(r.champions) !== hash(m.roster.map((s) => s.championId)) ||
      c.matchId !== m.matchId ||
      c.gameId !== t.gameId ||
      c.disposition !== r.disposition ||
      hash(c.participants) !== hash(r.champions) ||
      c.completionHash !== (c.state === "complete" ? hash(r) : null) ||
      BigInt(value.head.timestamp) < BigInt(t.startAt) ||
      BigInt(value.head.number) < BigInt(p.anchor.number)
    )
      throw new Error("Terminal record binding");
    if (
      previous?.kind === "replay" &&
      (previous.packet.state !== "committed" || r.disposition !== "cancelled")
    )
      throw new Error("Finalized outcome cannot cancel");
    if (
      previous?.kind === "terminal" &&
      (hash(previous.record) !== hash(r) ||
        (previous.completion.state === "complete" && c.state !== "complete"))
    )
      throw new Error("Terminal record regression");
  }
  if (previous) {
    const old = outcomeHead(previous),
      head = outcomeHead(value);
    if (
      BigInt(head.number) < BigInt(old.number) ||
      BigInt(head.timestamp) < BigInt(old.timestamp) ||
      (head.number === old.number &&
        (head.hash !== old.hash || head.timestamp !== old.timestamp))
    )
      throw new Error("Publication checkpoint regression");
    if (
      head.number === old.number &&
      previous.kind === "replay" &&
      (value.kind === "terminal" ||
        value.observation.phase !== previous.observation.phase)
    )
      throw new Error("Checkpoint state changed");
  }
  return value;
}
