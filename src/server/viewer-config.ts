import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
import {
  BUNDLE_BYTES,
  policySchema,
  signalOf,
  verifyBundle,
  viewerConfigSchema,
  type ViewerBundle,
} from "../protocol/model.ts";
import { downloadMatch, refreshSignal } from "../protocol/source.ts";
import { ReplayCache } from "../protocol/cache.ts";
import { studioCredentials } from "../protocol/studio.ts";
import { signals, type ViewerService } from "./viewer.ts";
async function jsonFile(file: string, max = BUNDLE_BYTES * 3) {
  if ((await stat(file)).size > max)
    throw new Error("Viewer config or fixture too large");
  return JSON.parse(await readFile(file, "utf8"));
}
export async function viewerService(
  mode: "fixture" | "protocol",
  env: NodeJS.ProcessEnv = process.env,
): Promise<ViewerService> {
  if (mode === "fixture") {
    const fixture = await jsonFile(path.resolve("fixtures/viewer.json"));
    const policy = policySchema.parse(fixture.policy);
    const list = await Promise.all(
      [fixture.played, fixture.walkover, fixture.cancelled].map(
        async (value) => (await verifyBundle(value, policy)).bundle,
      ),
    );
    const bundles = new Map(list.map((b) => [b.manifest.matchId, b]));
    const config = viewerConfigSchema.parse({
      mode,
      policy,
      studioPreview: false,
      agentbornOrigin: null,
      matches: list.map((b, i) => ({
        id: b.manifest.matchId,
        label: [
          "Rook vs Nyx · played",
          "Walkover · one qualifier",
          "Cancelled · missed deadline",
        ][i],
      })),
    });
    const bundle = async (id: string): Promise<ViewerBundle> => {
      const b = bundles.get(id);
      if (!b) throw new Error("Unknown fixture");
      return b;
    };
    return { config, bundle, signal: async (id) => signalOf(await bundle(id)) };
  }
  if (!env.ARENA_PROTOCOL_CONFIG)
    throw new Error("Protocol mode requires ARENA_PROTOCOL_CONFIG");
  const input = z
    .strictObject({
      origin: z.string().url(),
      policy: policySchema,
      matches: viewerConfigSchema.shape.matches,
    })
    .parse(await jsonFile(env.ARENA_PROTOCOL_CONFIG, P.LIMITS.documentBytes));
  if (new Set(input.matches.map((m) => m.id)).size !== input.matches.length)
    throw new Error("Duplicate configured match");
  let studioHeaders: ReturnType<typeof studioCredentials> | undefined;
  if (env.ARENA_STUDIO_KEY_FILE) {
    const key = z
      .strictObject({
        keyId: P.idSchema,
        gameId: P.idSchema,
        privateKeyPem: z.string().max(4096),
      })
      .parse(await jsonFile(env.ARENA_STUDIO_KEY_FILE, 8192));
    if (key.gameId !== input.policy.gameId)
      throw new Error("Studio credential game mismatch");
    studioHeaders = studioCredentials(key);
  }
  const client = P.createProtocolClient({
    origin: input.origin,
    studioHeaders,
  });
  const config = viewerConfigSchema.parse({
    mode,
    policy: input.policy,
    matches: input.matches,
    agentbornOrigin: new URL(input.origin).origin,
    studioPreview: !!studioHeaders,
  });
  const cache = new ReplayCache(
    path.resolve(env.ARENA_CACHE_DIR || ".arena-cache"),
    config.policy,
    (id) => downloadMatch(client, config.policy, id, !!studioHeaders),
  );
  const allowed = (id: string) => {
    if (!config.matches.some((m) => m.id === id))
      throw new Error("Unknown configured match");
  };
  const bundle = async (id: string) => {
    allowed(id);
    const saved = await cache.get(id);
    // Reusing a former studio cache must never expose an unreleased replay on a public server.
    if (saved.kind === "replay" && !saved.opening && !studioHeaders) {
      const current = await refreshSignal(client, saved, config.policy);
      if (current.kind === "replay" && !current.opening)
        throw new P.ProtocolResponseError(
          425,
          "NOT_RELEASED",
          "Official replay not released",
          true,
        );
      return current;
    }
    return saved;
  };
  const signal = signals(bundle, (b) =>
    refreshSignal(client, b, config.policy),
  );
  return {
    config,
    bundle,
    signal: (id) => {
      allowed(id);
      return signal(id);
    },
  };
}
