import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import * as P from "@agentborn/protocol-v2";
import { ReplayCache } from "../protocol/cache.ts";
import { createViewer, signals } from "./viewer.ts";
import { viewerService } from "./viewer-config.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";
import { work, startWorker } from "./worker.ts";
import { platformPost } from "../battlebots/client.ts";
import { signalOf } from "../protocol/model.ts";
test("fixture server needs no database or keys, exposes only configured read routes and small signals", async () => {
  const service = await viewerService("fixture", {}),
    app = createViewer(service),
    server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const boot = await (await fetch(origin + "/api/viewer/config")).json();
    assert.equal(boot.mode, "fixture");
    assert.equal(boot.matches.length, 3);
    assert(!JSON.stringify(boot).includes("privateKey"));
    for (const match of boot.matches) {
      const response = await fetch(
        `${origin}/api/viewer/matches/${match.id}/bundle`,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const signal = await (
        await fetch(`${origin}/api/viewer/matches/${match.id}/signal`)
      ).json();
      assert(!("replay" in signal));
    }
    assert.equal(
      (await fetch(origin + "/api/viewer/matches/unknown/bundle")).status,
      404,
    );
    assert.equal((await fetch(origin + "/api/matches/legacy")).status, 404);
    for (const route of [
      "/api/matches",
      "/api/prepare",
      "/api/exhibition",
      "/internal/matches/x/entry",
    ]) {
      const response = await fetch(origin + route, { method: "POST" });
      assert([404, 405].includes(response.status));
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("a local studio viewer rejects cross-site and foreign-host requests; errors do not disclose upstream details", async () => {
  const fixture = await viewerService("fixture", {}),
    service = {
      ...fixture,
      config: { ...fixture.config, studioPreview: true },
      bundle: async () => {
        throw new Error("secret-key-path / credentials");
      },
    };
  const server = createViewer(service).listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal(
      (
        await fetch(origin + "/api/viewer/config", {
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).status,
      403,
    );
    const foreignStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(
          origin + "/api/viewer/config",
          { headers: { host: "foreign.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).once("error", reject);
      },
    );
    assert.equal(foreignStatus, 403);
    const response = await fetch(
      `${origin}/api/viewer/matches/${fixture.config.matches[0].id}/bundle`,
    );
    assert.equal(response.status, 503);
    assert(!(await response.text()).includes("secret-key"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("refresh deduplicates concurrent browsers without turning into a polling loop", async () => {
  const service = await viewerService("fixture", {}),
    id = service.config.matches[0].id;
  let count = 0,
    time = 0;
  const refresh = signals(
    service.bundle,
    async (b) => {
      count++;
      return b;
    },
    () => time,
  );
  const all = await Promise.all(Array.from({ length: 10 }, () => refresh(id)));
  assert.equal(count, 1);
  assert.deepEqual(all[0], signalOf(await service.bundle(id)));
  await refresh(id);
  assert.equal(count, 1);
  time = 3001;
  await refresh(id);
  assert.equal(count, 2);
});
test("fixture/protocol modes cannot open legacy database, run its worker or post a result", async () => {
  const previous = config.mode;
  try {
    for (const mode of ["fixture", "protocol"] as const) {
      config.mode = mode;
      assert.throws(db, /explicit ARENA_MODE/);
      assert.throws(startWorker, /explicit ARENA_MODE/);
      await assert.rejects(work(), /explicit ARENA_MODE/);
      await assert.rejects(
        platformPost("/matches/x/settle", {}),
        /explicit ARENA_MODE/,
      );
    }
  } finally {
    config.mode = previous;
  }
  await assert.rejects(
    viewerService("protocol", {}),
    /requires ARENA_PROTOCOL_CONFIG/,
  );
});
test("public mode cannot expose unreleased studio cache after a configuration change", async (t) => {
  const fixture = await viewerService("fixture", {}),
    id = fixture.config.matches[0].id,
    original = await fixture.bundle(id);
  assert.equal(original.kind, "replay");
  const early = {
    ...original,
    opening: null,
    status: {
      ...original.status,
      outcome: "unpublished" as const,
      openingAvailable: false,
      lifecycle: "playback" as const,
    },
  };
  const root = path.resolve(".local-test");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "public-cache-"));
  let published = false;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    const value = url.pathname.endsWith("/opening")
      ? original.opening
      : published
        ? original.status
        : early.status;
    return new Response(P.canonicalJson(value), {
      headers: { "content-type": "application/json" },
    });
  });
  try {
    await new ReplayCache(
      directory,
      fixture.config.policy,
      async () => early,
    ).get(id);
    const file = path.join(directory, "source.json");
    await writeFile(
      file,
      JSON.stringify({
        origin: "https://agentborn.example",
        policy: fixture.config.policy,
        matches: [fixture.config.matches[0]],
      }),
    );
    const service = await viewerService("protocol", {
      ARENA_PROTOCOL_CONFIG: file,
      ARENA_CACHE_DIR: directory,
    });
    assert.equal(service.config.studioPreview, false);
    await assert.rejects(service.bundle(id), (e: any) => e.status === 425);
    published = true;
    const released = await service.bundle(id);
    assert.equal(released.kind, "replay");
    assert.deepEqual(released.opening, original.opening);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
