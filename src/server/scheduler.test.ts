import test from "node:test";
import assert from "node:assert/strict";
import { nextSlot } from "./scheduler.ts";
test("ranked slots allow a full notice period after the entry window", () => {
  for (const now of [0, 999, 300000, 299999, 1700000000123]) {
    const at = nextSlot(now, 300, 900);
    assert.equal(at % 300000, 0);
    assert.ok(at - now >= 1200000);
    assert.ok(at - now < 1500000);
  }
});
