import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, verify } from "node:crypto";
import { config } from "../src/server/config.ts";
import { hash } from "../src/battlebots/crypto.ts";
import {
  createReady,
  acceptEntry,
  confirmEntries,
  tickMatch,
  settle,
} from "../src/server/service.ts";
import { getMatch, lockedMatch, db, closeDb } from "../src/server/db.ts";
test("signed HTTP lifecycle waits for final receipt, freezes tactics and retries settlement without rerolling", async () => {
  const saved = {
    gameId: config.gameId,
    privateKey: config.privateKey,
    internalKey: config.internalKey,
    platform: config.platform,
  };
  const keys = generateKeyPairSync("ed25519");
  let finalized = false,
    openedId = "",
    settlements = 0;
  const nonceSet = new Set<string>();
  const results: unknown[] = [];
  const platform = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const nonce = String(req.headers["x-champions-nonce"]),
      stamp = String(req.headers["x-champions-timestamp"]);
    const signature = String(req.headers["x-champions-signature"]);
    const message = stamp + "." + nonce + "." + hash(raw);
    assert.ok(
      verify(
        null,
        Buffer.from(message),
        keys.publicKey,
        Buffer.from(signature, "base64"),
      ),
    );
    assert.ok(!nonceSet.has(nonce));
    nonceSet.add(nonce);
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/matches")) {
      openedId = JSON.parse(raw).external_match_id;
      res.end(JSON.stringify({ match: { id: "fixture-platform-id" } }));
    } else if (req.url?.endsWith("/receipt"))
      res.end(
        JSON.stringify({
          status: "live",
          entries: [
            {
              champion_id: "fixture-owner-champion",
              confirmed: finalized,
              owner_ref: "a".repeat(64),
              identity: {
                id: "fixture-owner-champion",
                name: "Fixture champion",
                portrait: "/portraits/rook.svg",
              },
            },
          ],
        }),
      );
    else if (req.url?.endsWith("/settle")) {
      results.push(JSON.parse(raw));
      settlements++;
      if (settlements === 1) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Retry fixture" }));
      } else res.end(JSON.stringify({ settle_seq: 1 }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) =>
    platform.listen(0, "127.0.0.1", resolve),
  );
  const port = (platform.address() as { port: number }).port;
  Object.assign(config, {
    gameId: "fixture",
    privateKey: keys.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    internalKey: "fixture-secret",
    platform: "http://127.0.0.1:" + port,
  });
  try {
    const m = await createReady("practice", true);
    assert.equal(m.rewardPolicy, "none");
    const profile = { aggression: 80, feint_rate: 10, recover_below: 2 };
    await acceptEntry(m.id, {
      champion_id: "fixture-owner-champion",
      owner_ref: "a".repeat(64),
      manifest_version: 1,
      profile: { agent_config: profile },
      proof: { kind: "xp" },
    });
    profile.aggression = 0;
    await confirmEntries((await getMatch(m.id))!);
    assert.equal((await getMatch(m.id))!.status, "waiting");
    await tickMatch(m.id);
    assert.equal((await getMatch(m.id))!.events.length, 0);
    finalized = true;
    await confirmEntries((await getMatch(m.id))!);
    assert.equal((await getMatch(m.id))!.entrants[1].strategy.aggression, 80);
    await tickMatch(m.id, Date.now() + 100);
    const computed = (await getMatch(m.id))!;
    assert.equal(computed.status, "settling");
    await assert.rejects(settle(computed));
    await settle((await getMatch(m.id))!);
    const final = (await getMatch(m.id))!;
    assert.equal(final.status, "complete");
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(final.events, computed.events);
  } finally {
    Object.assign(config, saved);
    if (openedId)
      await db().execute("DELETE FROM arena_matches WHERE id=?", [openedId]);
    await new Promise<void>((resolve, reject) =>
      platform.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test.after(closeDb);
