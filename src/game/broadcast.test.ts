import test from "node:test";
import assert from "node:assert/strict";
import { entranceCues, replayBounds } from "./broadcast.ts";
import { HOUSE } from "./fixtures.ts";
test("venue entrance envelopes are stable, ordered and bounded", () => {
  const cues = entranceCues(
    "match",
    HOUSE.slice(0, 2).map((e) => e.identity),
    100000,
  );
  assert.equal(cues.length, 8);
  assert.equal(new Set(cues.map((c) => c.id)).size, 8);
  assert.equal(cues[0].at, 88000);
  assert.equal(cues[4].at, 94000);
  assert.ok(cues.every((c) => c.at < c.expiresAt));
  assert.deepEqual(
    cues,
    entranceCues(
      "match",
      HOUSE.slice(0, 2).map((e) => e.identity),
      100000,
    ),
  );
  assert.equal(cues[0].profile.championId, HOUSE[0].identity.id);
});
test("full replay retains entrances, recorded pauses, and finish commentary", () => {
  assert.deepEqual(
    replayBounds(12000, 40000, [
      { id: "a", kind: "entrance", text: "Intro", at: 0, expiresAt: 5750 },
      { id: "b", kind: "finish", text: "Finish", at: 40000, expiresAt: 44000 },
    ]),
    { start: 0, duration: 44 },
  );
});
