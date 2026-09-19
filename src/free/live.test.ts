import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import * as P from "@agentborn/protocol-v2";
import { freeConfigSchema, packetSchema } from "./model.ts";
import {
  freeLiveConfigSchema,
  verifyLivePacket,
  PUBLIC_REVISION,
} from "./live.ts";
import { liveService, liveSourceSchema } from "../server/free-live.ts";
import { createFreeViewer } from "../server/free-viewer.ts";

const archive = freeConfigSchema.parse(
  JSON.parse(readFileSync("fixtures/free/viewer.json", "utf8")),
);
const packet = packetSchema.parse(
  JSON.parse(
    readFileSync(`fixtures/free/${archive.matches[0].id}.json`, "utf8"),
  ),
);
const { packageHash: _packageHash, ...identity } = archive.matches[0];
const pin = { ...identity, commitment: packet.commitment };
const viewer = freeLiveConfigSchema.parse({
  mode: "free-live",
  provenance: "disposable-test",
  matches: [pin],
});
const pending = () => {
  const p = structuredClone(packet);
  p.trainingCredited = false;
  p.completion = {
    ...p.completion!,
    state: "awaiting_record",
    trainingCredited: false,
    completionHash: null,
  };
  return p;
};
const finalized = () => {
  const p = pending();
  p.state = "finalized";
  p.receipts = p.receipts.slice(0, 2);
  p.completion = null;
  return p;
};
test("live evidence is bound to reviewed commitments across refresh and restart", () => {
  const first = verifyLivePacket(finalized(), pin);
  const second = verifyLivePacket(pending(), pin, first);
  const complete = verifyLivePacket(packet, pin, second);
  assert.deepEqual(verifyLivePacket(packet, pin, complete), complete);
  assert.deepEqual(verifyLivePacket(packet, pin), complete);
  assert.throws(
    () => verifyLivePacket(packet, { ...pin, commitment: P.ZERO_HASH }),
    /commitment/,
  );
  assert.throws(
    () => verifyLivePacket(finalized(), pin, complete),
    /regression/,
  );
  assert.throws(() => verifyLivePacket(pending(), pin, complete), /regression/);
  const changed = structuredClone(packet);
  changed.receipts[0].head.hash = P.ZERO_HASH;
  assert.throws(() => verifyLivePacket(changed, pin, complete));
});
test("live configuration is bounded, credential-free and cannot pick arbitrary upstream paths", () => {
  assert.throws(() =>
    freeLiveConfigSchema.parse({ ...viewer, matches: [pin, pin] }),
  );
  assert.throws(() =>
    freeLiveConfigSchema.parse({
      ...viewer,
      matches: [{ ...pin, commitment: P.ZERO_HASH }],
    }),
  );
  for (const origin of [
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/elsewhere",
    "https://example.test?next=x",
    "https://example.test#fragment",
  ])
    assert.throws(() => liveSourceSchema.parse({ viewer, origin }));
  assert(
    liveSourceSchema.safeParse({ viewer, origin: "https://agentborn.gg" })
      .success,
  );
});
test("live HTTP strips credentials, coalesces reads, rejects stale fallback and checks through viewer restarts", async () => {
  let response = finalized(),
    status = 200,
    calls = 0,
    now = 10000;
  let redirect = false;
  const upstream = createServer((req, res) => {
    calls++;
    assert.equal(req.url, `/api/free-matches/${pin.id}/replay`);
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers["x-agentborn-revision"], PUBLIC_REVISION);
    if (redirect) {
      res.writeHead(302, { Location: "http://127.0.0.1:1/private" });
      res.end();
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(
      P.canonicalJson(
        status === 200 ? response : { error: "Unavailable" },
        2097152,
      ),
    );
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const origin = `http://127.0.0.1:${(upstream.address() as { port: number }).port}`;
  const config = { viewer, origin };
  const service = liveService(config, () => now);
  const frontend = createFreeViewer(service).listen(0, "127.0.0.1");
  await once(frontend, "listening");
  const local = `http://127.0.0.1:${(frontend.address() as { port: number }).port}`;
  const get = () =>
    fetch(`${local}/api/viewer/matches/${pin.id}/bundle`, {
      headers: {
        cookie: "handler=never-forward",
        authorization: "Bearer never-forward",
      },
    });
  try {
    const [a, b] = await Promise.all([
      service.bundle(pin.id),
      service.bundle(pin.id),
    ]);
    assert.deepEqual(a, response);
    assert.deepEqual(b, response);
    assert.equal(calls, 1);
    await assert.rejects(service.bundle(pin.id), /budget/);
    await assert.rejects(service.bundle(P.ZERO_HASH), /Unlisted/);
    assert.equal(calls, 1);
    now += 5000;
    response = pending();
    assert.equal((await get()).status, 200);
    now += 5000;
    response = packet;
    assert.equal((await get()).status, 200);
    now += 5000;
    status = 503;
    assert.equal((await get()).status, 503);
    now += 5000;
    status = 200;
    response = pending();
    assert.equal((await get()).status, 503);
    now += 5000;
    response = packet;
    redirect = true;
    assert.equal((await get()).status, 503);
    now += 5000;
    redirect = false;
    assert.equal((await get()).status, 200);
    assert.deepEqual(await liveService(config).bundle(pin.id), packet);
    assert.equal((await fetch(`${local}/api/viewer/config`)).status, 200);
    assert.equal(
      (await fetch(`${local}/api/viewer/matches/${pin.id}/signal`)).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${local}/api/viewer/matches/${pin.id}/bundle`, {
          method: "POST",
        })
      ).status,
      405,
    );
  } finally {
    await Promise.all(
      [upstream, frontend].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  }
});
