import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { generateKeyPairSync, verify } from "node:crypto";
import * as P from "@agentborn/protocol-v2";
import {
  applySignal,
  BUNDLE_BYTES,
  frameAt,
  parseBundle,
  policySchema,
  signalOf,
  verifyBundle,
  type ViewerBundle,
} from "./model.ts";
import { downloadMatch, refreshSignal } from "./source.ts";
import { ReplayCache } from "./cache.ts";
import { studioCredentials } from "./studio.ts";
const fixtures = JSON.parse(
  await readFile(
    new URL("../../fixtures/viewer.json", import.meta.url),
    "utf8",
  ),
);
const policy = policySchema.parse(fixtures.policy),
  played = (await verifyBundle(fixtures.played, policy)).bundle;
const id = played.manifest.matchId,
  now = Number(played.manifest.schedule.settlementNotBefore) * 1000;
function preview() {
  assert.equal(played.kind, "replay");
  return {
    ...structuredClone(played),
    opening: null,
    status: {
      ...played.status,
      outcome: "unpublished" as const,
      openingAvailable: false,
      lifecycle: "playback" as const,
    },
  };
}
function upstream(initial: ViewerBundle) {
  let bundle = initial;
  const calls: string[] = [],
    headers: Record<string, string>[] = [];
  const client = P.createProtocolClient({
    origin: "https://agentborn.example",
    studioHeaders: async () => ({ "x-test-studio": "test-only" }),
    fetch: async (url, options) => {
      assert.equal(options?.method, "GET");
      assert.equal(options?.redirect, "error");
      assert.equal(options?.credentials, "omit");
      const route = new URL(String(url)).pathname.split("/").at(-1)!;
      calls.push(route);
      headers.push(options!.headers as Record<string, string>);
      const values = {
        [bundle.manifest.matchId]: bundle.status,
        manifest: bundle.manifest,
        registry: bundle.registry,
        qualification: bundle.qualification,
        ...(bundle.kind === "replay"
          ? {
              commitment: bundle.receipt,
              sealed: bundle.envelope,
              opening: bundle.opening,
              "studio-package": bundle.replay,
            }
          : { cancellation: bundle.cancellation }),
      };
      const value = values[route as keyof typeof values];
      if (!value)
        return new Response(
          P.canonicalJson({
            protocol: P.PROTOCOL,
            revision: P.REVISION,
            code: "NOT_RELEASED",
            message: "Not yet",
            retryable: true,
          }),
          { status: 425, headers: { "content-type": "application/json" } },
        );
      return new Response(P.canonicalJson(value, BUNDLE_BYTES), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  return {
    client,
    calls,
    headers,
    set: (b: ViewerBundle) => {
      bundle = b;
    },
  };
}
test("played, walkover and cancelled packages render distinct outcomes; seeking is local and repeatable", async () => {
  const view = await verifyBundle(played, policy, now);
  assert.equal(view.assurance, "matches_supplied_receipt");
  assert.equal(view.result?.kind, "played");
  assert.equal(frameAt(view, 0), null);
  assert.equal(frameAt(view, 1000)?.seq, 0);
  assert.equal(frameAt(view, 100000)?.seq, view.events.length - 1);
  assert.equal(frameAt(view, 1000)?.seq, 0);
  assert.throws(() => frameAt(view, NaN));
  const walkover = await verifyBundle(fixtures.walkover, policy, now);
  assert.equal(walkover.result?.kind, "walkover");
  assert.equal(walkover.events.length, 0);
  const cancelled = await verifyBundle(fixtures.cancelled, policy, now);
  assert.equal(cancelled.result, null);
  assert.equal(cancelled.events.length, 0);
  assert.deepEqual(
    parseBundle(
      new TextEncoder().encode(P.canonicalJson(played, BUNDLE_BYTES)),
    ),
    played,
  );
});
test("configured version, source amount, roster, runtime and unsupported v1 fail closed", async () => {
  await assert.rejects(
    verifyBundle(played, { ...policy, gameId: P.ZERO_HASH }),
  );
  for (const change of [
    (b: any) => {
      b.manifest.protocol = "battlebots/1";
    },
    (b: any) => {
      b.manifest.doorFeeWei = "1";
    },
    (b: any) => {
      b.replay.rendererVersion = "unknown";
    },
    (b: any) => {
      b.replay.visibleRoster.reverse();
    },
    (b: any) => {
      b.replay.events[0].atMs = 0;
    },
    (b: any) => {
      b.replay.events[0].payload.fighters[0].health = 999;
    },
    (b: any) => {
      b.replay.events[0].payload.fighters[0].health--;
    },
    (b: any) => {
      b.receipt.resultCommitment = P.ZERO_HASH;
    },
    (b: any) => {
      b.opening.encryptionKey = P.ZERO_HASH;
    },
    (b: any) => {
      b.status.matchId = P.ZERO_HASH;
    },
    (b: any) => {
      b.replay.durationMs++;
    },
    (b: any) => {
      b.replay.initialState.fighters[0].health--;
    },
  ]) {
    const b = structuredClone(played);
    change(b);
    await assert.rejects(verifyBundle(b, policy, now));
  }
  const walkover = structuredClone(fixtures.walkover);
  walkover.replay.events = fixtures.played.replay.events;
  await assert.rejects(verifyBundle(walkover, policy, now));
  await assert.rejects(
    verifyBundle(
      played,
      policy,
      Number(played.manifest.schedule.revealAt) * 1000 - 1,
    ),
  );
  assert.throws(() => parseBundle(new Uint8Array(BUNDLE_BYTES + 1)));
});
test("public download waits for opening; authorized preview stays unofficial and refresh transfers no replay events", async () => {
  const fake = upstream(preview());
  await assert.rejects(
    downloadMatch(fake.client, policy, id, false, now),
    (e: any) => e.status === 425,
  );
  assert(!fake.calls.includes("studio-package"));
  const early = await downloadMatch(fake.client, policy, id, true, now);
  assert.equal((await verifyBundle(early, policy, now)).result, null);
  assert(
    fake.headers.every(
      (h, i) =>
        Boolean(h["x-test-studio"]) === (fake.calls[i] === "studio-package"),
    ),
  );
  fake.set(played);
  fake.calls.length = 0;
  const published = await refreshSignal(fake.client, early, policy, now);
  assert.deepEqual(fake.calls, [id, "opening"]);
  const small = signalOf(published);
  assert(!P.canonicalJson(small).includes('"events"'));
  assert.equal(
    (await applySignal(early, small, policy, now)).result?.kind,
    "played",
  );
  assert.deepEqual(
    published.kind === "replay" && published.replay,
    early.kind === "replay" && early.replay,
  );
  await assert.rejects(
    applySignal(published, signalOf(early), policy, now),
    /opening changed/,
  );
  fake.set(early);
  await assert.rejects(refreshSignal(fake.client, published, policy, now));
});
test("public opened download decrypts once without studio credentials or individual events", async () => {
  const fake = upstream(played);
  const result = await downloadMatch(fake.client, policy, id, false, now);
  assert.equal(result.kind, "replay");
  assert.equal(fake.calls.filter((x) => x === "sealed").length, 1);
  assert(
    !fake.calls.includes("studio-package") && !fake.calls.includes("replay"),
  );
  const cancel = (await verifyBundle(fixtures.cancelled, policy, now)).bundle,
    other = upstream(cancel);
  assert.equal(
    (
      await downloadMatch(
        other.client,
        policy,
        cancel.manifest.matchId,
        false,
        now,
      )
    ).kind,
    "cancelled",
  );
  assert(!other.calls.includes("sealed"));
  await assert.rejects(
    downloadMatch(fake.client, policy, P.ZERO_HASH, false, now),
  );
});
test("immutable cache deduplicates downloads, survives restart and rejects corrupt files without fetching replacements", async () => {
  const root = path.resolve(".local-test");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "viewer-cache-"));
  let loads = 0;
  try {
    const cache = new ReplayCache(
      directory,
      policy,
      async () => {
        loads++;
        return played;
      },
      () => now,
    );
    const all = await Promise.all(
      Array.from({ length: 8 }, () => cache.get(id)),
    );
    assert.equal(loads, 1);
    all.forEach((b) => assert.deepEqual(b, played));
    const restarted = new ReplayCache(
      directory,
      policy,
      async () => {
        throw new Error("Offline");
      },
      () => now,
    );
    assert.deepEqual(await restarted.get(id), played);
    await writeFile(path.join(directory, id + ".json"), "{corrupt");
    await assert.rejects(cache.get(id));
    assert.equal(loads, 1);
    await assert.rejects(cache.get("../elsewhere"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("independent cache writers cannot replace conflicting immutable replay bytes", async () => {
  const root = path.resolve(".local-test");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "viewer-race-"));
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  const altered = preview();
  altered.replay.visibleRoster[0].name = "Different studio preview";
  const loader = (b: ViewerBundle) => async () => {
    if (++arrived === 2) release();
    await barrier;
    return b;
  };
  try {
    const results = await Promise.allSettled([
      new ReplayCache(directory, policy, loader(preview()), () => now).get(id),
      new ReplayCache(directory, policy, loader(altered), () => now).get(id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.match(
      String(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason,
      ),
      /Conflicting replay/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("studio signatures bind exact path, game and fresh nonce; credentials cannot sign other routes", async () => {
  const keys = generateKeyPairSync("ed25519"),
    keyId = "0x" + "42".repeat(32);
  const signer = studioCredentials(
    {
      keyId,
      gameId: policy.gameId,
      privateKeyPem: keys.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
    },
    () => now,
  );
  const route = `/api/v2/matches/${id}/studio-package`,
    first = await signer("GET", route),
    second = await signer("GET", route);
  const bytes = Buffer.from(first["x-agentborn-request"], "base64url"),
    message = P.parseCanonical(P.studioRequestSchema, bytes);
  assert(
    verify(
      null,
      bytes,
      keys.publicKey,
      Buffer.from(first["x-agentborn-signature"].slice(2), "hex"),
    ),
  );
  assert.equal(message.path, route);
  assert.equal(message.gameId, policy.gameId);
  assert.notEqual(first["x-agentborn-request"], second["x-agentborn-request"]);
  await assert.rejects(signer("GET", `/api/v2/matches/${id}/settle`));
  await assert.rejects(signer("POST" as "GET", route));
});
