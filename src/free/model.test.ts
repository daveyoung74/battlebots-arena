import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as P from "@agentborn/protocol-v2";
import {
  commitments,
  frameAt,
  freeConfigSchema,
  packageHash,
  verifyFreePacket,
} from "./model.ts";
const config = freeConfigSchema.parse(
  JSON.parse(readFileSync("fixtures/free/viewer.json", "utf8")),
);
const pin = config.matches[0];
const packet = JSON.parse(readFileSync(`fixtures/free/${pin.id}.json`, "utf8"));
const verifyChanged = (change: (value: typeof packet) => void) => {
  const value = structuredClone(packet);
  change(value);
  return verifyFreePacket(value, { ...pin, packageHash: packageHash(value) });
};
test("independent free archive reader opens the application-produced disposable played match", () => {
  const v = verifyFreePacket(packet, pin);
  assert.equal(v.state, "released");
  assert.equal(v.opening.kind, "played");
  assert.equal(frameAt(v, 0)?.event, null);
  assert.equal(frameAt(v, v.rules.roundMs)?.event?.seq, 0);
  assert.deepEqual(
    frameAt(v, 999999999)?.fighters,
    v.opening.replay!.events.at(-1)!.fighters,
  );
  assert.equal(packageHash(v), pin.packageHash);
});
test("pins survive restarts and reject revisions, wrong profiles and changed packages", () => {
  assert.throws(() =>
    verifyFreePacket(packet, { ...pin, profileHash: P.ZERO_HASH }),
  );
  assert.throws(() => verifyFreePacket(packet, { ...pin, id: P.ZERO_HASH }));
  const changed = structuredClone(packet);
  changed.trainingCredited = false;
  assert.throws(() => verifyFreePacket(changed, pin), /package pin/);
  assert.throws(() =>
    verifyChanged((v) => {
      v.revision = "2.0.0-alpha.1";
    }),
  );
  assert.throws(
    () =>
      verifyChanged((v) => {
        v.state = "committed";
        v.receipts = [v.receipts[0]];
      }),
    /finalized outcome/,
  );
  assert.throws(() =>
    freeConfigSchema.parse({ ...config, matches: [pin, pin] }),
  );
});
test("re-pinned bad evidence still fails exact caller, event, finality and board-state checks", () => {
  for (const change of [
    (v: typeof packet) => {
      v.receipts[0].transaction.input = "0x";
    },
    (v: typeof packet) => {
      v.receipts[0].transaction.from = v.receipts[0].profile.board;
    },
    (v: typeof packet) => {
      v.receipts[0].receipt.logs[0].removed = true;
    },
    (v: typeof packet) => {
      v.receipts[0].receipt.logs.push(v.receipts[0].receipt.logs[0]);
    },
    (v: typeof packet) => {
      v.receipts[0].receipt.logs[0].data = "0x";
    },
    (v: typeof packet) => {
      v.receipts[0].block.transactions = [];
    },
    (v: typeof packet) => {
      v.receipts[0].head.number = v.receipts[0].block.number;
    },
    (v: typeof packet) => {
      v.receipts[1].block.timestamp = "1";
    },
    (v: typeof packet) => {
      v.receipts[2].state[0] = 4;
    },
    (v: typeof packet) => {
      v.completion.participants.reverse();
    },
    (v: typeof packet) => {
      v.completion.state = "awaiting_record";
    },
    (v: typeof packet) => {
      v.receipts.reverse();
    },
  ])
    assert.throws(() => verifyChanged(change));
});
test("a re-sealed malformed replay cannot hide invalid progress behind new hashes", () => {
  for (const change of [
    (v: typeof packet) => {
      v.opening.replay.events[0].seq = 1;
    },
    (v: typeof packet) => {
      v.opening.replay.events[0].fighters[0].health = 999;
    },
    (v: typeof packet) => {
      v.opening.replay.events[0].fighters[0].damage += 1;
    },
    (v: typeof packet) => {
      v.opening.replay.events[0].fighters[0].stamina = 999;
    },
    (v: typeof packet) => {
      v.opening.replay.events.pop();
      v.opening.replay.durationMs -= v.rules.roundMs;
    },
  ])
    assert.throws(
      () =>
        verifyChanged((v) => {
          change(v);
          const c = commitments(v, v.receipts[0].profile);
          v.commitment = c.commitment;
          v.resultHash = c.outcome;
        }),
      /event order|fighter progression|truncated combat/,
    );
});
test("walkover imports have no combat or invented credit", () => {
  assert.equal(config.matches.length, 2);
  for (const entry of config.matches.slice(1)) {
    const raw = JSON.parse(
      readFileSync(`fixtures/free/${entry.id}.json`, "utf8"),
    );
    const v = verifyFreePacket(raw, entry);
    assert.equal(v.opening.kind, "walkover");
    assert.equal(frameAt(v, 1000), null);
    assert.equal(v.trainingCredited, false);
    raw.trainingCredited = true;
    assert.throws(() =>
      verifyFreePacket(raw, { ...entry, packageHash: packageHash(raw) }),
    );
  }
});
test("released awaiting-record snapshot preserves certified time without reporting credit", () => {
  const v = verifyChanged((value) => {
    value.completion.state = "awaiting_record";
    value.completion.completionHash = null;
    value.completion.trainingCredited = false;
    value.trainingCredited = false;
  });
  assert.equal(v.completion?.completedAt, v.opening.completion?.completedAt);
  assert.equal(v.trainingCredited, false);
});
