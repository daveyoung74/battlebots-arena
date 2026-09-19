import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { freeArchive, createFreeViewer } from "./free-viewer.ts";
test("free archive is allowlisted, read-only, credential-free and pinned across service restarts", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "arena-free-"));
  const config = JSON.parse(
    await readFile("fixtures/free/viewer.json", "utf8"),
  );
  const pin = config.matches[0];
  const file = path.join(directory, `${pin.id}.json`),
    configFile = path.join(directory, "viewer.json");
  await copyFile(`fixtures/free/${pin.id}.json`, file);
  await writeFile(configFile, JSON.stringify(config));
  try {
    for (const restart of [false, true]) {
      const server = createFreeViewer(await freeArchive(configFile)).listen(
        0,
        "127.0.0.1",
      );
      await once(server, "listening");
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      try {
        assert.equal((await fetch(`${base}/api/viewer/config`)).status, 200);
        assert.equal(
          (await fetch(`${base}/api/viewer/matches/${pin.id}/bundle`)).status,
          restart ? 503 : 200,
        );
        assert.equal(
          (
            await fetch(`${base}/api/viewer/matches/${pin.id}/bundle`, {
              method: "POST",
            })
          ).status,
          405,
        );
        assert.equal(
          (
            await fetch(`${base}/api/viewer/config`, {
              headers: { "Sec-Fetch-Site": "cross-site" },
            })
          ).status,
          403,
        );
        assert.equal(
          (await fetch(`${base}/api/viewer/matches/unknown/bundle`)).status,
          404,
        );
        assert.equal(
          (await fetch(`${base}/api/viewer/matches/${pin.id}/signal`)).status,
          404,
        );
        const raw = JSON.parse(await readFile(file, "utf8"));
        raw.trainingCredited = !raw.trainingCredited;
        await writeFile(file, JSON.stringify(raw));
        if (!restart)
          assert.equal(
            (await fetch(`${base}/api/viewer/matches/${pin.id}/bundle`)).status,
            503,
          );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((e) => (e ? reject(e) : resolve())),
        );
      }
    }
    await writeFile(file, " ".repeat(2097153));
    await assert.rejects(
      (await freeArchive(configFile)).bundle(pin.id),
      /size/,
    );
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert(path.basename(directory).startsWith("arena-free-"));
    await rm(directory, { recursive: true, force: true });
  }
});
