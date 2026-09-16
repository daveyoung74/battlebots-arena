import express from "express";
import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
import {
  BUNDLE_BYTES,
  signalOf,
  type ViewerBundle,
  type ViewerConfig,
  type ViewerSignal,
} from "../protocol/model.ts";

export type ViewerService = {
  config: ViewerConfig;
  bundle(id: string): Promise<ViewerBundle>;
  signal(id: string): Promise<ViewerSignal>;
};
export function createViewer(service: ViewerService) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "frame-ancestors 'none'",
    });
    if (service.config.studioPreview) {
      // Studio preview is a local developer surface, never a public replay endpoint.
      const host = req.headers.host?.split(":")[0];
      if (
        !["localhost", "127.0.0.1"].includes(host ?? "") ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res.sendStatus(403);
    }
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET")
      return res
        .status(405)
        .set("Allow", "GET")
        .json({ error: "This viewer only reads published matches" });
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, mode: service.config.mode, authority: "viewer" }),
  );
  const send = (
    res: express.Response,
    data: unknown,
    max: number = P.LIMITS.documentBytes,
  ) => res.type("application/json").send(P.canonicalJson(data, max));
  app.get("/api/viewer/config", (_req, res) => send(res, service.config));
  for (const operation of ["bundle", "signal"] as const) {
    app.get(`/api/viewer/matches/:id/${operation}`, async (req, res) => {
      const id = req.params.id;
      if (!service.config.matches.some((match) => match.id === id))
        return res
          .status(404)
          .json({ error: "Match is not in this viewer's program" });
      const value = await service[operation](id);
      return send(
        res,
        value,
        operation === "bundle" ? BUNDLE_BYTES : P.LIMITS.documentBytes,
      );
    });
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof P.ProtocolResponseError && error.status === 425)
        return res.status(425).json({
          error:
            "The official replay is not released yet. Retry after publication.",
        });
      const status = error instanceof z.ZodError ? 502 : 503;
      // Upstream documents, key paths and credentials must not appear in browser errors.
      return res.status(status).json({
        error:
          "Replay or official signal unavailable. Retry when the source is available.",
      });
    },
  );
  return app;
}

/** A short shared refresh window prevents every browser from polling the upstream source. */
export function signals(
  load: (id: string) => Promise<ViewerBundle>,
  refresh: (b: ViewerBundle) => Promise<ViewerBundle>,
  clock = () => Date.now(),
) {
  const latest = new Map<string, { bundle: ViewerBundle; at: number }>();
  const pending = new Map<string, Promise<ViewerSignal>>();
  return async (id: string) => {
    const found = latest.get(id);
    if (found && clock() - found.at < 3000) return signalOf(found.bundle);
    const existing = pending.get(id);
    if (existing) return existing;
    const work = (async () => {
      const bundle = await refresh(found?.bundle ?? (await load(id)));
      latest.set(id, { bundle, at: clock() });
      return signalOf(bundle);
    })();
    pending.set(id, work);
    try {
      return await work;
    } finally {
      pending.delete(id);
    }
  };
}
