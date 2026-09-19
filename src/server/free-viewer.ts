import { open, realpath } from "node:fs/promises";
import path from "node:path";
import express from "express";
import * as P from "@agentborn/protocol-v2";
import {
  freeConfigSchema,
  PACKAGE_BYTES,
  verifyFreePacket,
} from "../free/model.ts";

async function boundedJson(file: string, limit: number): Promise<unknown> {
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error("Archive size");
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    for (;;) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      length += bytesRead;
      if (length > limit) throw new Error("Archive size");
      if (!bytesRead) break;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length),
      ),
    );
  } finally {
    await handle.close();
  }
}

/** A reviewed local archive, never an upstream authenticated proxy or a directory browser. */
export async function freeArchive(configFile: string) {
  const config = freeConfigSchema.parse(await boundedJson(configFile, 65536));
  const root = await realpath(path.dirname(configFile));
  return {
    config,
    async bundle(id: string) {
      const pin = config.matches.find((m) => m.id === id);
      if (!pin) throw new Error("Unlisted archive");
      // Filenames are fixed from validated IDs. Resolve symlinks before checking containment.
      const file = await realpath(path.join(root, `${pin.id}.json`));
      const relative = path.relative(root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Archive outside root");
      return verifyFreePacket(await boundedJson(file, PACKAGE_BYTES), pin);
    },
  };
}

export function createFreeViewer(
  service: Awaited<ReturnType<typeof freeArchive>>,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    const host = req.headers.host?.split(":")[0];
    if (
      !["127.0.0.1", "localhost"].includes(host ?? "") ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res.sendStatus(403);
    next();
  });
  app.use("/api", (req, res, next) => {
    if (req.method !== "GET")
      return res
        .status(405)
        .set("Allow", "GET")
        .json({ error: "Read-only archive" });
    next();
  });
  const send = (res: express.Response, value: unknown, limit = 65536) =>
    res.type("application/json").send(P.canonicalJson(value, limit));
  app.get("/api/health", (_req, res) =>
    send(res, { ok: true, mode: "free", authority: "archive-viewer" }),
  );
  app.get("/api/viewer/config", (_req, res) => send(res, service.config));
  app.get("/api/viewer/matches/:id/bundle", async (req, res) => {
    if (!service.config.matches.some((m) => m.id === req.params.id))
      return res.status(404).json({ error: "Unlisted match" });
    return send(res, await service.bundle(req.params.id), PACKAGE_BYTES);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res.status(503).json({
        error: "Archive unavailable or does not match its reviewed pin",
      }),
  );
  return app;
}
