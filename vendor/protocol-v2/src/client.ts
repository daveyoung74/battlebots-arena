import type { z } from "zod";
import { parseCanonical } from "./canonical.js";
import { REVISION, LIMITS, discoverySchema, gameVersionSchema, matchStatusSchema, commitmentReceiptSchema,
  openingSchema, replaySchema, sealedEnvelopeSchema, opportunitySchema, errorSchema, idSchema } from "./schemas.js";
import { matchManifestSchema, qualificationSchema, resultSchema, cancellationSchema, casualSignalSchema } from "./schemas.js";
import { registrySchema } from "./validation.js";
import { ENVELOPE_BYTES } from "./sealing.js";

export class ProtocolResponseError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryable: boolean) {
    super(message); this.name = "ProtocolResponseError";
  }
}
async function readBounded(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("INVALID_DOCUMENT: missing response body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) { await reader.cancel(); throw new Error("LIMIT_EXCEEDED: response bytes"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Read-only client. No polling loops, wallet access, private-app imports or v1 fallback. */
export function createProtocolClient(options: { origin: string; fetch?: typeof globalThis.fetch;
  studioHeaders?: (method: "GET", path: string) => Promise<Record<string, string>>; timeoutMs?: number }) {
  const origin = new URL(options.origin);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
    !(origin.protocol === "https:" || (origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)))) {
    throw new Error("INVALID_DOCUMENT: HTTPS origin or loopback HTTP required");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  async function get<T extends z.ZodType>(path: string, schema: T, maxBytes: number = LIMITS.documentBytes, studio = false): Promise<z.output<T>> {
    if (studio && !options.studioHeaders) throw new Error("UNAUTHORIZED: studio credential provider required");
    const auth = studio ? await options.studioHeaders!("GET", path) : {};
    const response = await fetcher(new URL(path, origin), { method: "GET", redirect: "error", credentials: "omit",
      headers: { ...auth, accept: "application/json", "x-agentborn-revision": REVISION },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15000), cache: "no-store" });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new Error("INVALID_DOCUMENT: response content type");
    const bytes = await readBounded(response, response.ok ? maxBytes : LIMITS.documentBytes);
    if (!response.ok) {
      const error = parseCanonical(errorSchema, bytes);
      throw new ProtocolResponseError(response.status, error.code, error.message, error.retryable);
    }
    return parseCanonical(schema, bytes, maxBytes);
  }
  const match = (id: string) => `/api/v2/matches/${idSchema.parse(id)}`;
  return {
    discover: () => get("/api/v2/discovery", discoverySchema),
    gameVersion: (gameId: string, versionHash: string) => get(`/api/v2/games/${idSchema.parse(gameId)}/versions/${idSchema.parse(versionHash)}`, gameVersionSchema),
    opportunity: (eventId: string) => get(`/api/v2/events/${idSchema.parse(eventId)}`, opportunitySchema),
    status: (matchId: string) => get(match(matchId), matchStatusSchema),
    manifest: (matchId: string) => get(`${match(matchId)}/manifest`, matchManifestSchema),
    registry: (matchId: string) => get(`${match(matchId)}/registry`, registrySchema),
    qualification: (matchId: string) => get(`${match(matchId)}/qualification`, qualificationSchema),
    result: (matchId: string) => get(`${match(matchId)}/result`, resultSchema),
    cancellation: (matchId: string) => get(`${match(matchId)}/cancellation`, cancellationSchema),
    casualSignal: (matchId: string) => get(`${match(matchId)}/casual-signal`, casualSignalSchema),
    commitment: (matchId: string) => get(`${match(matchId)}/commitment`, commitmentReceiptSchema),
    sealed: (matchId: string) => get(`${match(matchId)}/sealed`, sealedEnvelopeSchema, ENVELOPE_BYTES),
    opening: (matchId: string) => get(`${match(matchId)}/opening`, openingSchema),
    replay: (matchId: string) => get(`${match(matchId)}/replay`, replaySchema, LIMITS.replayBytes),
    studioPackage: (matchId: string) => get(`${match(matchId)}/studio-package`, replaySchema, LIMITS.replayBytes, true),
  };
}
