import { z } from "zod";
import {
  freeLiveConfigSchema,
  verifyLivePacket,
  PUBLIC_REVISION,
} from "../free/live.ts";
import { packetSchema, PACKAGE_BYTES, type FreePacket } from "../free/model.ts";
import { boundedJson } from "./free-viewer.ts";
import { read } from "../client/http.ts";
import {
  outcomeSchema,
  verifyOutcome,
  OUTCOME_REVISION,
  type PublicOutcome,
} from "../free/outcome.ts";

const originSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === "/" &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname)))
    );
  });
export const liveSourceSchema = z.strictObject({
  viewer: freeLiveConfigSchema,
  origin: originSchema,
});

export async function freeLive(configFile: string) {
  return liveService(
    liveSourceSchema.parse(await boundedJson(configFile, 65536)),
  );
}

/** Fixed origin, paths and match allowlist. Never forwards browser cookies, grants or URLs. */
export function liveService(
  input: z.infer<typeof liveSourceSchema>,
  clock = () => Date.now(),
) {
  const { viewer: config, origin } = liveSourceSchema.parse(input);
  const outcomes = "delivery" in config;
  const previous = new Map<string, FreePacket | PublicOutcome>();
  const pending = new Map<string, Promise<FreePacket | PublicOutcome>>();
  const attempted = new Map<string, number>();
  return {
    config,
    async bundle(id: string): Promise<FreePacket | PublicOutcome> {
      const pin = config.matches.find((m) => m.id === id);
      if (!pin) throw new Error("Unlisted live match");
      const inFlight = pending.get(id);
      if (inFlight) return inFlight;
      if (
        pending.size >= 2 ||
        (attempted.has(id) && clock() - attempted.get(id)! < 5000)
      )
        throw new Error("Replay read budget");
      attempted.set(id, clock());
      const task = read(
        `${new URL(origin).origin}/api/free-matches/${id}/${outcomes ? "outcome" : "replay"}`,
        z.union([packetSchema, outcomeSchema]),
        PACKAGE_BYTES,
        undefined,
        {
          revision: outcomes ? OUTCOME_REVISION : PUBLIC_REVISION,
          timeoutMs: 35000,
        },
      )
        .then((raw) => {
          const old = previous.get(id);
          const value =
            "manifestHash" in pin
              ? verifyOutcome(raw, pin, old && "kind" in old ? old : undefined)
              : verifyLivePacket(
                  raw,
                  pin,
                  old && !("kind" in old) ? old : undefined,
                );
          previous.set(id, value);
          return value;
        })
        .finally(() => pending.delete(id));
      pending.set(id, task);
      // Old data is retained only to reject regressions, never as a failure fallback.
      return task;
    },
  };
}
