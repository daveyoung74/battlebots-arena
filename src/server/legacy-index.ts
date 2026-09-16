import express from "express";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { config, integrated, requireLegacy } from "./config.ts";
import { db, closeDb, getMatch, listMatches, limit } from "./db.ts";
import { exhibition, createReady, acceptEntry } from "./service.ts";
import { publicMatch, phase } from "./presentation.ts";
import { validateHmac } from "../battlebots/crypto.ts";
import { manifest } from "../game/manifest.ts";
import { startWorker, workerStatus } from "./worker.ts";
requireLegacy();
const app = express();
app.get("/api/viewer/config", (_req, res) => res.json({ mode: "legacy" }));
app.disable("x-powered-by");
if (process.env.ARENA_TRUST_PROXY)
  app.set(
    "trust proxy",
    process.env.ARENA_TRUST_PROXY.split(",").map((s) => s.trim()),
  );
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' " + new URL(config.platform).origin,
  );
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});
app.use("/api", express.text({ type: "application/json", limit: "32kb" }));
function json(req: express.Request) {
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
const endpoint =
  (
    handler: (req: express.Request, res: express.Response) => Promise<unknown>,
  ) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
async function publicLimit(req: express.Request) {
  await limit("public:" + req.ip, 600, 60);
}
app.get(
  "/api/health",
  endpoint(async (_req, res) => {
    await db().query("SELECT 1");
    res.json({
      ok: true,
      game: "arena",
      contract: 1,
      integrated: integrated(),
      worker: { enabled: config.worker, ...workerStatus() },
    });
  }),
);
app.get("/api/manifest", (_req, res) => res.json(manifest(config.url)));
app.get(
  "/api/show",
  endpoint(async (req, res) => {
    await publicLimit(req);
    const all = await listMatches();
    const now = Date.now();
    const shown = all.filter(
      (m) => m.visual && m.mode !== "practice" && m.status !== "cancelled",
    );
    const current = shown
      .filter((m) =>
        ["entrance", "live", "interrupted", "settling", "wrapup"].includes(
          phase(m, now),
        ),
      )
      .sort(
        (a, b) =>
          Number(a.mode === "exhibition") - Number(b.mode === "exhibition") ||
          b.createdAt - a.createdAt,
      )[0];
    const upcoming = shown
      .filter(
        (m) => m.status === "ready" && m.startsAt > now && m.id !== current?.id,
      )
      .sort((a, b) => a.startsAt - b.startsAt);
    const recent = shown.filter((m) => m.status === "complete").slice(0, 6);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      serverTime: now,
      integrated: integrated(),
      demo: config.demo,
      platformUrl: config.platform,
      gameSlug: "gladiators",
      voice: config.voiceId ? "configured" : "captions",
      current: current ? publicMatch(current, now) : null,
      upcoming: upcoming.slice(0, 8).map((m) => publicMatch(m, now)),
      recent: recent.map((m) => publicMatch(m, now)),
    });
  }),
);
app.get(
  "/api/matches/:id",
  endpoint(async (req, res) => {
    await publicLimit(req);
    const m = await getMatch(String(req.params.id));
    if (!m) return res.status(404).json({ error: "Match not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(publicMatch(m));
  }),
);
app.get(
  "/api/matches/:id/presentation",
  endpoint(async (req, res) => {
    const m = await getMatch(String(req.params.id));
    if (!m) return res.status(404).json({ error: "Match not found" });
    const p = publicMatch(m);
    return res.json({
      version: 1,
      match_id: m.platformId,
      external_match_id: m.id,
      mode: m.visual ? "visual" : "outcome",
      live_state: p.phase,
      watch_url: m.visual ? p.watchUrl : null,
      embed_url: m.visual ? p.watchUrl + "?embed=1" : null,
      starts_at: m.startsAt,
      ended_at: m.endedAt,
      replay_state: p.replayState,
      replay_url:
        p.replayState === "available" ? p.watchUrl + "?replay=1" : null,
      replay_expires_at: p.replayExpiresAt,
      revision: m.revision,
    });
  }),
);
app.post(
  "/api/exhibitions",
  endpoint(async (req, res) => {
    if (req.headers.origin && req.headers.origin !== new URL(config.url).origin)
      throw Object.assign(new Error("Origin not allowed"), { status: 403 });
    await limit("exhibition:" + req.ip, 10, 60);
    const body = z
      .object({
        strategy: z.unknown().optional(),
        opponent: z.number().int().min(0).max(2).default(1),
        headless: z.boolean().default(false),
      })
      .parse(json(req));
    const m = await exhibition(body.strategy, body.opponent, body.headless);
    return res.status(201).json({ id: m.id, watchUrl: "/matches/" + m.id });
  }),
);
app.post(
  "/api/matches/ready",
  endpoint(async (req, res) => {
    await limit("ready:" + req.ip, 10, 60);
    const body = z
      .object({
        mode: z.enum(["practice", "casual", "ranked"]).default("casual"),
        headless: z.boolean().default(false),
      })
      .parse(json(req));
    if (body.headless && body.mode !== "practice")
      throw Object.assign(
        new Error("Only Practice supports headless execution"),
        { status: 400 },
      );
    const m = await createReady(body.mode, body.headless);
    res.status(201).json({
      match_id: m.platformId,
      external_match_id: m.id,
      mode: m.mode,
      starts_at: m.startsAt,
      watch_url: config.url + "/matches/" + m.id,
      enter_url: config.platform + "/g/gladiators?match=" + m.platformId,
    });
  }),
);
app.post(
  "/api/matches/:id/enter",
  endpoint(async (req, res) => {
    const raw = typeof req.body === "string" ? req.body : "";
    const headers = Object.fromEntries(
      ["x-champions-timestamp", "x-champions-nonce", "x-champions-hmac"].map(
        (k) => [k, req.get(k)],
      ),
    );
    const nonce = validateHmac(config.internalKey, raw, headers);
    try {
      await db().execute(
        "INSERT INTO arena_adapter_nonces(nonce,expires_at) VALUES (?,?)",
        [nonce, Date.now() + 600000],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw Object.assign(new Error("Nonce already used"), { status: 409 });
      throw e;
    }
    const body = z
      .object({
        champion_id: z.string().min(1).max(64),
        owner_ref: z.string().length(64).optional(),
        manifest_version: z.number().int(),
        profile: z.object({
          agent_config: z.record(z.string(), z.unknown()),
          owner_config: z.unknown().optional(),
        }),
        proof: z.object({ kind: z.literal("xp") }),
      })
      .parse(json(req));
    await acceptEntry(String(req.params.id), body);
    res.json({
      ok: true,
      champion_id: body.champion_id,
      external_id: req.params.id,
    });
  }),
);
app.get(
  "/api/audio/:id",
  endpoint(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(String(req.params.id)))
      return res.sendStatus(404);
    const [rows] = await db().execute<RowDataPacket[]>(
      "SELECT audio,duration_ms FROM arena_audio_assets WHERE id=? AND status='ready'",
      [req.params.id],
    );
    if (!rows.length) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public,max-age=86400,immutable");
    res.setHeader("X-Audio-Duration-Ms", rows[0].duration_ms ?? 0);
    res.type("audio/mpeg").send(rows[0].audio);
  }),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const e = err as { status?: number; message?: string };
    const status = err instanceof z.ZodError ? 400 : e.status || 500;
    if (status >= 500)
      console.error("Arena request failed; request id", randomUUID());
    res.status(status).json({
      error:
        status >= 500
          ? "Arena is temporarily unavailable. Please try again."
          : e.message || "Invalid request",
    });
  },
);
const server = app.listen(config.port, () =>
  console.log("Arena listening on " + config.url),
);
const stop = config.worker ? startWorker() : async () => {};
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 20000);
  timeout.unref();
  server.close();
  await stop();
  await closeDb();
  clearTimeout(timeout);
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void shutdown());
