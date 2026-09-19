import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodeEventTopics,
  keccak256,
  parseAbi,
  parseAbiParameters,
  stringToHex,
} from "viem";

// Public wire reader, independent of AgentBorn's private application and financial authority.
export const PACKAGE_BYTES = 2 * 1024 * 1024;
export const hash = (value: unknown) => P.hashDocument(value, 524288);
export const packageHash = (value: unknown) =>
  P.hashDocument(value, PACKAGE_BYTES);
const same = (a: unknown, b: unknown) => hash(a) === hash(b);
const check = (ok: unknown, label: string): void => {
  if (!ok) throw new Error(`Invalid free replay: ${label}`);
};
const count = z.number().int().positive().max(0xffffffff);
const seat = z.strictObject({
  championId: P.idSchema,
  handlerId: P.idSchema,
  requestHash: P.idSchema,
  settingsHash: P.idSchema,
  strategyHash: P.idSchema,
  dailyMatches: count,
  intervalSeconds: count,
  validUntil: P.timeSchema,
});
export const manifestSchema = z.strictObject({
  revision: z.literal("free.match.1"),
  profileHash: P.idSchema,
  matchId: P.idSchema,
  terms: z.strictObject({
    gameId: P.idSchema,
    gameVersionHash: P.idSchema,
    mode: z.union([z.literal(0), z.literal(1)]),
    startAt: P.timeSchema,
    commitDeadline: P.timeSchema,
    revealAt: P.timeSchema,
    releaseAt: P.timeSchema,
    recoveryAt: P.timeSchema,
    playbackSeconds: count,
  }),
  roster: z.tuple([seat, seat]),
});
const replaySchema = z.strictObject({
  revision: z.literal("free.match.replay.1"),
  matchId: P.idSchema,
  manifestHash: P.idSchema,
  gameVersionHash: P.idSchema,
  rulesHash: P.idSchema,
  rendererVersion: z.literal("agentborn/free-duel-replay/1"),
  roster: z.tuple([P.idSchema, P.idSchema]),
  initialState: z.tuple([P.duelFighterSchema, P.duelFighterSchema]),
  durationMs: z.number().int().min(1).max(61440000),
  events: z.array(P.duelEventSchema).min(1).max(1024),
});
export const openingSchema = z.strictObject({
  revision: z.literal("free.match.opening.1"),
  matchId: P.idSchema,
  manifestHash: P.idSchema,
  qualificationHash: P.idSchema,
  mask: z.number().int().min(1).max(3),
  kind: z.enum(["played", "walkover"]),
  seed: P.hashSchema,
  ranks: z.array(P.idSchema).min(1).max(2),
  replay: replaySchema.nullable(),
  completion: z
    .strictObject({
      executionId: P.idSchema,
      outputHash: P.idSchema,
      certificationHash: P.idSchema,
      completedAt: P.timeSchema,
    })
    .nullable(),
});
const blockSchema = z
  .object({ hash: P.idSchema, number: P.timeSchema, timestamp: P.timeSchema })
  .passthrough();
const location = { blockHash: P.idSchema, blockNumber: P.timeSchema };
const hex = z.string().regex(/^0x(?:[0-9a-f]{2})*$/);
export const profileSchema = z
  .object({
    revision: z.literal("free.match.1"),
    board: P.recipientSchema,
    referee: P.recipientSchema,
    runtimeHash: P.idSchema,
    anchor: z.object({ hash: P.idSchema, number: P.timeSchema }).passthrough(),
    finalityBlocks: count,
    finalitySeconds: count,
    commitWindowSeconds: count,
    playbackSeconds: count,
    recoveryDelaySeconds: count,
    dailyLimit: count,
    minimumInterval: count,
    setup: z
      .object({
        identity: z
          .object({ chainId: z.number().int().positive().safe() })
          .passthrough(),
        game: P.gameVersionSchema,
        rules: P.duelRulesSchema,
      })
      .passthrough(),
  })
  .passthrough();
const receiptSchema = z
  .object({
    revision: z.literal("free.match.receipt.1"),
    profile: profileSchema,
    manifestHash: P.idSchema,
    action: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("result"), commitment: P.idSchema }),
      z.strictObject({
        kind: z.literal("finalize"),
        ranks: z.array(P.idSchema).min(1).max(2),
        seed: P.hashSchema,
        replayHash: P.hashSchema,
        openingHash: P.idSchema,
        nonce: P.idSchema,
        qualificationHash: P.idSchema,
        mask: z.number().int().min(1).max(3),
      }),
      z.strictObject({
        kind: z.literal("release"),
        cancelled: z.literal(false),
      }),
    ]),
    transaction: z
      .object({
        ...location,
        hash: P.idSchema,
        from: P.recipientSchema,
        to: P.recipientSchema,
        chainId: z.number().int().positive().safe(),
        value: z.literal("0"),
        input: hex,
      })
      .passthrough(),
    receipt: z
      .object({
        ...location,
        transactionHash: P.idSchema,
        from: P.recipientSchema,
        to: P.recipientSchema,
        status: z.literal("success"),
        logs: z
          .array(
            z
              .object({
                ...location,
                transactionHash: P.idSchema,
                address: P.recipientSchema,
                removed: z.literal(false),
                topics: z.array(P.hashSchema).max(4),
                data: hex,
              })
              .passthrough(),
          )
          .max(64),
      })
      .passthrough(),
    block: blockSchema.extend({ transactions: z.array(P.idSchema).max(10000) }),
    head: blockSchema,
    anchor: blockSchema,
    state: z.tuple([
      z.number().int(),
      z.number().int(),
      P.hashSchema,
      P.hashSchema,
      P.hashSchema,
      P.hashSchema,
      P.timeSchema,
      P.timeSchema,
    ]),
  })
  .passthrough();
const completionSchema = z.strictObject({
  revision: z.literal("free.match.completion-status.1"),
  matchId: P.idSchema,
  gameId: P.idSchema,
  state: z.enum(["complete", "awaiting_record"]),
  disposition: z.enum(["played", "walkover"]),
  completionHash: P.idSchema.nullable(),
  trainingCredited: z.boolean(),
  completedAt: P.timeSchema.nullable(),
  participants: z.tuple([P.idSchema, P.idSchema]),
});
export const packetSchema = z.strictObject({
  revision: z.literal("free.match.public-package.1"),
  manifest: manifestSchema,
  game: P.gameVersionSchema,
  rules: P.duelRulesSchema,
  opening: openingSchema,
  nonce: P.idSchema,
  commitment: P.idSchema,
  resultHash: P.idSchema,
  state: z.enum(["committed", "finalized", "released"]),
  receipts: z.array(receiptSchema).min(1).max(3),
  completion: completionSchema.nullable().optional(),
  trainingCredited: z.boolean(),
});
export type FreePacket = z.infer<typeof packetSchema>;
export const observationSchema = z.strictObject({
  revision: z.literal("free.match.publication-observation.1"),
  matchId: P.idSchema,
  profileHash: P.idSchema,
  manifestHash: P.idSchema,
  openingHash: P.idSchema,
  commitment: P.idSchema,
  chainId: z.number().int().positive().safe(),
  board: P.recipientSchema,
  phase: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  head: z.strictObject({
    number: P.timeSchema,
    hash: P.idSchema,
    timestamp: P.timeSchema,
  }),
});
export const matchPinSchema = z.strictObject({
  id: P.idSchema,
  profileHash: P.idSchema,
  packageHash: P.idSchema,
  label: z.string().min(1).max(100),
  champions: z.tuple([z.string().min(1).max(80), z.string().min(1).max(80)]),
});
export const freeConfigSchema = z
  .strictObject({
    mode: z.literal("free"),
    provenance: z.enum(["disposable-test", "published-export"]),
    matches: z.array(matchPinSchema).min(1).max(32),
  })
  .refine((v) => new Set(v.matches.map((m) => m.id)).size === v.matches.length);
export type FreeConfig = z.infer<typeof freeConfigSchema>;
export type MatchPin = z.infer<typeof matchPinSchema>;
export const boardAbi = parseAbi([
  "function commitResult(bytes32 id, bytes32 commitment)",
  "function finalize(bytes32 id, bytes32[] ranks, bytes32 seed, bytes32 replayHash, bytes32 openingHash, bytes32 nonce)",
  "function release(bytes32 id)",
  "event ResultCommitted(bytes32 indexed matchId, bytes32 commitment)",
  "event Finalized(bytes32 indexed matchId, bytes32 resultHash, bytes32 replayHash, bytes32 openingHash, bytes32 seed, bytes32[] ranks, bytes32 nonce)",
  "event Released(bytes32 indexed matchId, bool cancelled)",
]);
const abiHash = (types: string, values: unknown[]) =>
  keccak256(encodeAbiParameters(parseAbiParameters(types), values as never));
const domain = (name: string) =>
  keccak256(stringToHex(`AgentBorn.free.match.${name}.1`));
export function commitments(
  v: Pick<FreePacket, "manifest" | "opening" | "nonce">,
  p: z.infer<typeof profileSchema>,
) {
  const m = v.manifest,
    o = v.opening,
    base = [BigInt(p.setup.identity.chainId), p.board, m.matchId, hash(m)];
  const seed =
    o.mask === 3
      ? abiHash("bytes32,uint256,address,bytes32,bytes32,bytes32", [
          domain("seed"),
          ...base,
          o.seed,
        ])
      : P.ZERO_HASH;
  const outcome = abiHash(
    "bytes32,uint256,address,bytes32,bytes32,bytes32,uint8,bytes32[]",
    [domain("outcome"), ...base, o.qualificationHash, o.mask, o.ranks],
  );
  const replay = o.replay ? hash(o.replay) : P.ZERO_HASH;
  const commitment = abiHash(
    "bytes32,uint256,address,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,uint64,uint64",
    [
      domain("result"),
      ...base,
      o.qualificationHash,
      seed,
      outcome,
      replay,
      hash(o),
      v.nonce,
      BigInt(m.terms.revealAt),
      BigInt(m.terms.releaseAt),
    ],
  );
  return { seed, outcome, replay, commitment };
}

/** Verifies an immutable archive against independently configured pins and supplied evidence.
 * This is not an RPC verifier, a certification signature verifier or authority to award credit. */
export function verifyFreePacket(raw: unknown, expected: MatchPin): FreePacket {
  check(packageHash(raw) === expected.packageHash, "package pin");
  return verifyPacket(raw, expected);
}

/** Shared evidence checks; live delivery adds an independently approved commitment pin. */
export function verifyPacket(
  raw: unknown,
  expected: Pick<MatchPin, "id" | "profileHash">,
  publication?: unknown,
): FreePacket {
  const v = packetSchema.parse(raw),
    m = v.manifest,
    o = v.opening,
    t = m.terms,
    p = v.receipts[0].profile;
  check(packageHash(v) === packageHash(raw), "unrecognized fields");
  check(
    v.state !== "committed" || publication !== undefined,
    "archive requires finalized outcome",
  );
  check(
    m.matchId === expected.id &&
      m.profileHash === expected.profileHash &&
      hash(p) === expected.profileHash,
    "identity/profile",
  );
  check(
    same(v.game, p.setup.game) &&
      same(v.rules, p.setup.rules) &&
      t.gameId === v.game.gameId &&
      t.gameVersionHash === hash(v.game) &&
      v.game.rulesArtifactHash === hash(v.rules),
    "game/rules",
  );
  P.validateDuelRules(v.rules);
  check(
    BigInt(t.commitDeadline) ===
      BigInt(t.startAt) + BigInt(p.commitWindowSeconds) &&
      BigInt(t.revealAt) ===
        BigInt(t.commitDeadline) + BigInt(p.playbackSeconds) &&
      BigInt(t.releaseAt) === BigInt(t.revealAt) + BigInt(p.finalitySeconds) &&
      BigInt(t.recoveryAt) ===
        BigInt(t.releaseAt) + BigInt(p.recoveryDelaySeconds) &&
      t.playbackSeconds === p.playbackSeconds,
    "timing",
  );
  check(
    m.roster[0].handlerId !== m.roster[1].handlerId &&
      m.roster[0].championId !== m.roster[1].championId,
    "distinct entrants",
  );
  check(
    m.roster.every(
      (s) =>
        s.dailyMatches <= p.dailyLimit &&
        s.intervalSeconds >= p.minimumInterval &&
        BigInt(s.validUntil) > BigInt(t.startAt),
    ),
    "consent bounds",
  );
  check(
    o.matchId === m.matchId && o.manifestHash === hash(m),
    "opening identity",
  );
  const qualified = m.roster
    .filter((_, i) => (o.mask & (1 << i)) !== 0)
    .map((s) => s.championId);
  check(
    o.ranks.length === qualified.length &&
      new Set(o.ranks).size === qualified.length &&
      o.ranks.every((id) => qualified.includes(id)),
    "ranks",
  );
  const c = commitments(v, p);
  check(
    v.commitment === c.commitment && v.resultHash === c.outcome,
    "commitment/outcome",
  );
  check(
    o.kind === "played"
      ? o.mask === 3 && o.seed !== P.ZERO_HASH && o.replay && o.completion
      : o.mask !== 3 && o.seed === P.ZERO_HASH && !o.replay && !o.completion,
    "disposition",
  );
  const roster = m.roster.map((s) => s.championId),
    r = o.replay;
  if (r) {
    check(
      r.matchId === m.matchId &&
        r.manifestHash === hash(m) &&
        r.gameVersionHash === t.gameVersionHash &&
        r.rulesHash === hash(v.rules) &&
        same(r.roster, roster),
      "replay identity",
    );
    check(
      r.events.length <= v.rules.maxRounds &&
        r.durationMs === r.events.length * v.rules.roundMs &&
        r.durationMs <= t.playbackSeconds * 1000,
      "duration",
    );
    check(
      r.initialState.every(
        (f) =>
          f.health === v.rules.health &&
          f.stamina === v.rules.stamina.max &&
          f.damage === 0,
      ),
      "initial state",
    );
    for (const [n, e] of r.events.entries()) {
      const previous = n ? r.events[n - 1].fighters : r.initialState,
        s = v.rules.stamina;
      check(
        e.seq === n &&
          e.atMs === (n + 1) * v.rules.roundMs &&
          previous.every((f) => f.health > 0),
        "event order",
      );
      e.fighters.forEach((f, i) => {
        const delta = {
          strike: -s.strikeCost,
          feint: -s.feintCost,
          guard: s.guardGain,
          recover: s.recoverGain,
        }[e.actions[i]];
        check(
          previous[i].stamina + delta >= 0 &&
            f.stamina === Math.min(s.max, previous[i].stamina + delta) &&
            e.damageReceived[i] <= previous[i].health &&
            f.health === previous[i].health - e.damageReceived[i] &&
            f.damage === previous[i].damage + e.damageReceived[1 - i],
          "fighter progression",
        );
      });
    }
    const last = r.events.at(-1)!.fighters;
    check(
      last.some((f) => f.health === 0) || r.events.length === v.rules.maxRounds,
      "truncated combat",
    );
    const advantage =
      last[0].health - last[1].health || last[0].damage - last[1].damage;
    if (advantage)
      check(o.ranks[0] === roster[advantage > 0 ? 0 : 1], "winner");
    check(
      BigInt(o.completion!.completedAt) >= BigInt(t.startAt) &&
        BigInt(o.completion!.completedAt) < BigInt(t.commitDeadline),
      "execution time",
    );
  }
  const stages =
    v.state === "released"
      ? ["result", "finalize", "release"]
      : v.state === "finalized"
        ? ["result", "finalize"]
        : ["result"];
  check(v.receipts.length === stages.length, "receipt count");
  for (const [i, proof] of v.receipts.entries()) {
    const a = proof.action,
      tx = proof.transaction,
      receipt = proof.receipt,
      block = proof.block,
      head = proof.head;
    check(
      a.kind === stages[i] &&
        same(proof.profile, p) &&
        proof.manifestHash === hash(m),
      "receipt lineage",
    );
    let input: string,
      eventName: "ResultCommitted" | "Finalized" | "Released",
      data: string;
    if (a.kind === "result") {
      check(a.commitment === c.commitment, "result action");
      input = encodeFunctionData({
        abi: boardAbi,
        functionName: "commitResult",
        args: [m.matchId, v.commitment] as never,
      });
      eventName = "ResultCommitted";
      data = encodeAbiParameters(parseAbiParameters("bytes32"), [
        v.commitment,
      ] as never);
      check(
        BigInt(block.timestamp) >= BigInt(t.startAt) &&
          BigInt(block.timestamp) <= BigInt(t.commitDeadline),
        "commit deadline",
      );
    } else if (a.kind === "finalize") {
      check(
        same(a.ranks, o.ranks) &&
          a.seed === o.seed &&
          a.replayHash === c.replay &&
          a.openingHash === hash(o) &&
          a.nonce === v.nonce &&
          a.mask === o.mask &&
          a.qualificationHash === o.qualificationHash,
        "finalize action",
      );
      input = encodeFunctionData({
        abi: boardAbi,
        functionName: "finalize",
        args: [m.matchId, o.ranks, o.seed, c.replay, hash(o), v.nonce] as never,
      });
      eventName = "Finalized";
      data = encodeAbiParameters(
        parseAbiParameters("bytes32,bytes32,bytes32,bytes32,bytes32[],bytes32"),
        [c.outcome, c.replay, hash(o), o.seed, o.ranks, v.nonce] as never,
      );
      check(BigInt(block.timestamp) >= BigInt(t.revealAt), "early finalize");
    } else {
      input = encodeFunctionData({
        abi: boardAbi,
        functionName: "release",
        args: [m.matchId] as never,
      });
      eventName = "Released";
      data = encodeAbiParameters(parseAbiParameters("bool"), [false]);
      check(BigInt(block.timestamp) >= BigInt(t.releaseAt), "early release");
    }
    check(
      tx.from === p.referee &&
        tx.to === p.board &&
        tx.chainId === p.setup.identity.chainId &&
        tx.input === input &&
        receipt.from === p.referee &&
        receipt.to === p.board,
      "exact transaction",
    );
    check(
      tx.hash === receipt.transactionHash &&
        tx.blockHash === block.hash &&
        receipt.blockHash === block.hash &&
        tx.blockNumber === block.number &&
        receipt.blockNumber === block.number,
      "transaction block",
    );
    check(
      block.transactions.filter((h) => h === tx.hash).length === 1,
      "transaction membership",
    );
    check(
      proof.anchor.hash === p.anchor.hash &&
        proof.anchor.number === p.anchor.number &&
        BigInt(block.number) >= BigInt(p.anchor.number),
      "anchor",
    );
    check(
      BigInt(head.number) >= BigInt(block.number) + BigInt(p.finalityBlocks) &&
        BigInt(head.timestamp) >=
          BigInt(block.timestamp) + BigInt(p.finalitySeconds),
      "publication/finality",
    );
    const topics = encodeEventTopics({
      abi: boardAbi,
      eventName,
      args: { matchId: m.matchId } as never,
    });
    const logs = receipt.logs.filter(
      (l) => l.address === p.board && same(l.topics, topics),
    );
    check(
      logs.length === 1 &&
        logs[0].data === data &&
        logs[0].transactionHash === tx.hash &&
        logs[0].blockHash === block.hash &&
        logs[0].blockNumber === block.number,
      "exact event",
    );
    const state = proof.state;
    check(
      state[0] === i + 3 &&
        state[1] === o.mask &&
        state[2] === o.qualificationHash &&
        state[3] === c.seed &&
        state[4] === c.commitment &&
        state[5] === (i ? c.outcome : P.ZERO_HASH),
      "board state",
    );
    check(
      i
        ? state[6] === v.receipts[1].block.timestamp &&
            state[7] === v.receipts[1].block.number
        : state[6] === "0" && state[7] === "0",
      "terminal state",
    );
    if (i)
      check(
        BigInt(block.number) > BigInt(v.receipts[i - 1].block.number) &&
          BigInt(block.timestamp) >= BigInt(v.receipts[i - 1].block.timestamp),
        "receipt order",
      );
    if (i === 2)
      check(
        BigInt(block.number) >=
          BigInt(v.receipts[1].block.number) + BigInt(p.finalityBlocks) &&
          BigInt(block.timestamp) >=
            BigInt(v.receipts[1].block.timestamp) + BigInt(p.finalitySeconds),
        "terminal finality",
      );
  }
  if (publication !== undefined) {
    const observed = observationSchema.parse(publication);
    check(
      observed.matchId === m.matchId &&
        observed.profileHash === m.profileHash &&
        observed.manifestHash === hash(m) &&
        observed.openingHash === hash(o) &&
        observed.commitment === v.commitment &&
        observed.chainId === p.setup.identity.chainId &&
        observed.board === p.board &&
        observed.phase === stages.length + 2,
      "publication binding",
    );
    check(
      BigInt(observed.head.timestamp) >= BigInt(t.revealAt) &&
        v.receipts.every(
          (proof) =>
            BigInt(observed.head.number) >= BigInt(proof.head.number) &&
            BigInt(observed.head.timestamp) >= BigInt(proof.head.timestamp) &&
            (observed.head.number !== proof.head.number ||
              observed.head.hash === proof.head.hash),
        ),
      "publication checkpoint",
    );
  }
  const completion = v.completion;
  check(
    !completion ||
      (v.state === "released" &&
        completion.matchId === m.matchId &&
        completion.gameId === t.gameId &&
        same(completion.participants, roster) &&
        completion.disposition === o.kind),
    "completion identity",
  );
  check(
    v.trainingCredited === Boolean(completion?.trainingCredited),
    "credit source",
  );
  if (completion) {
    check(
      completion.state === "complete"
        ? completion.completionHash
        : !completion.completionHash && !completion.trainingCredited,
      "completion state",
    );
    check(
      o.kind === "played"
        ? completion.completedAt === o.completion?.completedAt
        : completion.completedAt === null,
      "completion timestamp",
    );
    check(
      !completion.trainingCredited ||
        (completion.state === "complete" &&
          o.kind === "played" &&
          completion.completedAt === o.completion?.completedAt),
      "credit disposition",
    );
  }
  return v;
}

export function frameAt(v: FreePacket, ms: number) {
  const r = v.opening.replay;
  if (!r) return null;
  const index = Math.min(
    r.events.length - 1,
    Math.floor(Math.max(0, ms) / v.rules.roundMs) - 1,
  );
  return index < 0
    ? { fighters: r.initialState, event: null }
    : { fighters: r.events[index].fighters, event: r.events[index] };
}
