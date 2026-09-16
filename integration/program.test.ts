import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { advanceExhibitionProgram } from "../src/server/program.ts";
import { config } from "../src/server/config.ts";
import { db, closeDb, lockedMatch } from "../src/server/db.ts";
test("concurrent program sweeps publish one show and recover after cancellation", async () => {
  const name = "test-" + randomUUID(),
    demo = config.demo,
    ids = new Set<string>();
  config.demo = true;
  try {
    const first = await Promise.all([
      advanceExhibitionProgram(Date.now(), name),
      advanceExhibitionProgram(Date.now(), name),
      advanceExhibitionProgram(Date.now(), name),
    ]);
    first.forEach((id) => ids.add(id));
    assert.equal(ids.size, 1);
    await lockedMatch(first[0], async (m) => {
      m.status = "cancelled";
    });
    const next = await advanceExhibitionProgram(Date.now(), name);
    ids.add(next);
    assert.notEqual(next, first[0]);
    assert.equal(await advanceExhibitionProgram(Date.now(), name), next);
  } finally {
    config.demo = demo;
    await db().execute("DELETE FROM arena_programs WHERE name=?", [name]);
    for (const id of ids)
      await db().execute("DELETE FROM arena_matches WHERE id=?", [id]);
  }
});
test.after(closeDb);
