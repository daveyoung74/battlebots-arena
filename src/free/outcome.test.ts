import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "@agentborn/protocol-v2";
import {
  freeConfigSchema,
  packetSchema,
  hash,
  verifyFreePacket,
} from "./model.ts";
import {
  OUTCOME_REVISION,
  verifyOutcome,
  type PublicOutcome,
} from "./outcome.ts";
import { freeLiveConfigSchema } from "./live.ts";
const archive = freeConfigSchema.parse(
  JSON.parse(readFileSync("fixtures/free/viewer.json", "utf8")),
);
const full = packetSchema.parse(
  JSON.parse(
    readFileSync(`fixtures/free/${archive.matches[0].id}.json`, "utf8"),
  ),
);
const { packageHash: _hash, ...base } = archive.matches[0];
const pin = {
  ...base,
  manifestHash: hash(full.manifest),
  commitment: full.commitment,
};
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
function replay(stage: 0 | 1 | 2): PublicOutcome {
  const packet = structuredClone(full);
  packet.state = (["committed", "finalized", "released"] as const)[stage];
  packet.receipts = packet.receipts.slice(0, stage + 1);
  if (stage !== 2) {
    packet.completion = null;
    packet.trainingCredited = false;
  }
  return {
    revision: OUTCOME_REVISION,
    kind: "replay",
    packet,
    observation: {
      revision: "free.match.publication-observation.1",
      matchId: pin.id,
      profileHash: pin.profileHash,
      manifestHash: pin.manifestHash,
      openingHash: hash(packet.opening),
      commitment: packet.commitment,
      chainId: packet.receipts[0].profile.setup.identity.chainId,
      board: packet.receipts[0].profile.board,
      phase: (stage + 3) as 3 | 4 | 5,
      head: {
        number: String(
          BigInt(full.receipts[2].head.number) + 10n + BigInt(stage),
        ),
        hash: id(800 + stage),
        timestamp: String(
          BigInt(full.receipts[2].head.timestamp) + 10n + BigInt(stage),
        ),
      },
    },
  };
}
function terminal(
  disposition: "cancelled" | "unsubmitted",
  complete = false,
): PublicOutcome {
  const m = full.manifest;
  const record = {
    revision: "free.match.completion.1" as const,
    matchId: pin.id,
    profileHash: pin.profileHash,
    manifestHash: pin.manifestHash,
    gameId: m.terms.gameId,
    gameVersionHash: m.terms.gameVersionHash,
    policyHash: P.hashDocument(P.INITIAL_TRAINING_POLICY),
    mode: (m.terms.mode === 0 ? "casual" : "ranked") as "casual" | "ranked",
    disposition,
    champions: m.roster.map((s) => s.championId) as [string, string],
    ranks: [],
    completedAt: null,
    sourceHash: id(999),
  };
  return {
    revision: OUTCOME_REVISION,
    kind: "terminal",
    manifest: m,
    profile: full.receipts[0].profile,
    record,
    completion: {
      revision: "free.match.completion-status.1",
      matchId: pin.id,
      gameId: m.terms.gameId,
      state: complete ? "complete" : "awaiting_record",
      disposition,
      completionHash: complete ? hash(record) : null,
      trainingCredited: false,
      completedAt: null,
      participants: record.champions,
    },
    head: {
      number: String(BigInt(full.receipts[2].head.number) + 15n),
      hash: id(810),
      timestamp: String(BigInt(full.receipts[2].head.timestamp) + 15n),
    },
  };
}
test("early opening needs the exact observation and remains separate from archive approval", () => {
  const early = replay(0);
  assert.equal(verifyOutcome(early, pin).kind, "replay");
  assert.throws(
    () => verifyOutcome(early, { ...pin, commitment: null }),
    /commitment/,
  );
  assert.throws(
    () => verifyOutcome(early, { ...pin, manifestHash: id(1) }),
    /identity/,
  );
  if (early.kind !== "replay") throw Error();
  assert.throws(
    () =>
      verifyFreePacket(early.packet, {
        ...archive.matches[0],
        packageHash: P.hashDocument(early.packet, 2097152),
      }),
    /finalized/,
  );
  for (const patch of [
    { head: { ...early.observation.head, timestamp: "1" } },
    { phase: 4 },
    { commitment: id(1) },
    { openingHash: id(2) },
    { chainId: 1 },
    { board: `0x${"ff".repeat(20)}` },
  ])
    assert.throws(() =>
      verifyOutcome(
        { ...early, observation: { ...early.observation, ...patch } },
        pin,
      ),
    );
  assert.throws(() => verifyOutcome({ ...early, observation: undefined }, pin));
});
test("publication progression rejects chain regression and same-checkpoint state replacement", () => {
  const early = verifyOutcome(replay(0), pin),
    final = verifyOutcome(replay(1), pin, early),
    released = verifyOutcome(replay(2), pin, final);
  assert.throws(() => verifyOutcome(early, pin, final), /regression/);
  assert.throws(
    () => verifyOutcome(terminal("cancelled"), pin, released),
    /cannot cancel/,
  );
  if (final.kind !== "replay" || early.kind !== "replay") throw Error();
  assert.throws(
    () =>
      verifyOutcome(
        {
          ...final,
          observation: { ...final.observation, head: early.observation.head },
        },
        pin,
        early,
      ),
    /Checkpoint/,
  );
  const replacement = structuredClone(early);
  replacement.observation.head.hash = id(1234);
  assert.throws(() => verifyOutcome(replacement, pin, early), /checkpoint/);
});
test("terminal records are manifest-bound, uncredited and stable through recording", () => {
  for (const disposition of ["cancelled", "unsubmitted"] as const) {
    const pending = verifyOutcome(terminal(disposition), {
      ...pin,
      commitment: null,
    });
    const recorded = verifyOutcome(
      terminal(disposition, true),
      { ...pin, commitment: null },
      pending,
    );
    assert.throws(() => verifyOutcome(pending, pin, recorded), /regression/);
    assert.throws(() => verifyOutcome(replay(0), pin, recorded), /Terminal/);
    if (recorded.kind !== "terminal") throw Error();
    for (const mutate of [
      (v: typeof recorded) => {
        v.record.ranks = [pin.id];
      },
      (v: typeof recorded) => {
        v.record.sourceHash = id(1);
      },
      (v: typeof recorded) => {
        v.completion.participants.reverse();
      },
      (v: typeof recorded) => {
        v.manifest.terms.mode = 0;
      },
    ]) {
      const bad = structuredClone(recorded);
      mutate(bad);
      assert.throws(() => verifyOutcome(bad, pin, recorded));
    }
    assert.throws(() =>
      verifyOutcome(
        {
          ...recorded,
          completion: { ...recorded.completion, trainingCredited: true },
        },
        pin,
      ),
    );
  }
  const cancelled = verifyOutcome(terminal("cancelled"), pin, replay(0));
  assert.equal(cancelled.kind, "terminal");
  assert.throws(
    () => verifyOutcome(terminal("unsubmitted"), pin, replay(0)),
    /cannot cancel/,
  );
});
test("outcome delivery requires an explicit configuration upgrade", () => {
  const value = {
    mode: "free-live",
    delivery: "outcome",
    provenance: "disposable-test",
    matches: [pin],
  };
  assert(freeLiveConfigSchema.safeParse(value).success);
  assert(
    !freeLiveConfigSchema.safeParse({ ...value, delivery: undefined }).success,
  );
  assert(
    !freeLiveConfigSchema.safeParse({
      ...value,
      matches: [{ ...base, commitment: full.commitment }],
    }).success,
  );
});
