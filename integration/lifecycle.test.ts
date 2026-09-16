import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, insertMatch, getMatch, closeDb } from "../src/server/db.ts";
import { newMatch, tickMatch, acceptEntry } from "../src/server/service.ts";
import { HOUSE } from "../src/game/fixtures.ts";
import { simulate } from "../src/game/engine.ts";
test("SQL persistence, concurrent ticks and restart preserve one result", async () => {
  const m = newMatch("exhibition", true);
  m.id = "test-" + randomUUID();
  m.entrants = structuredClone(HOUSE.slice(0, 2));
  m.status = "ready";
  m.nextTickAt = 0;
  await insertMatch(m);
  try {
    const expected = simulate(m.seed, m.entrants, 1000);
    await Promise.all([
      tickMatch(m.id, 1000),
      tickMatch(m.id, 1000),
      tickMatch(m.id, 1000),
    ]);
    const r = (await getMatch(m.id))!;
    assert.equal(r.status, "complete");
    assert.deepEqual(
      r.events,
      expected.events.map((e) => ({ ...e, at: 1000 })),
    );
    const before = JSON.stringify(r.events);
    await tickMatch(m.id, 5000);
    assert.equal(JSON.stringify((await getMatch(m.id))!.events), before);
    assert.equal(r.rewardPolicy, "none");
  } finally {
    await db().execute("DELETE FROM arena_matches WHERE id=?", [m.id]);
  }
});
test("cancelled matches cannot advance or accept entries", async () => {
  const m = newMatch("practice");
  m.id = "test-" + randomUUID();
  m.status = "cancelled";
  await insertMatch(m);
  try {
    await tickMatch(m.id);
    assert.equal((await getMatch(m.id))!.events.length, 0);
    await assert.rejects(
      acceptEntry(m.id, {
        champion_id: "test",
        manifest_version: 1,
        profile: { agent_config: {} },
        proof: { kind: "xp" },
      }),
      /closed/,
    );
  } finally {
    await db().execute("DELETE FROM arena_matches WHERE id=?", [m.id]);
  }
});
test.after(closeDb);
