import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
import { matchPinSchema, verifyPacket, type FreePacket } from "./model.ts";
import { verifyLiveProgress } from "./progress.ts";
import { outcomePinSchema } from "./outcome.ts";

export const PUBLIC_REVISION = "free.match.public-read.1";
export const livePinSchema = matchPinSchema
  .omit({ packageHash: true })
  .extend({ commitment: P.idSchema.refine((v) => v !== P.ZERO_HASH) });
const replayConfigSchema = z.strictObject({
  mode: z.literal("free-live"),
  provenance: z.enum(["disposable-test", "approved-source"]),
  matches: z.array(livePinSchema).min(1).max(32),
});
export const freeLiveConfigSchema = z
  .union([
    replayConfigSchema,
    replayConfigSchema.extend({
      delivery: z.literal("outcome"),
      matches: z.array(outcomePinSchema).min(1).max(32),
    }),
  ])
  .refine((v) => new Set(v.matches.map((m) => m.id)).size === v.matches.length);
export type FreeLiveConfig = z.infer<typeof freeLiveConfigSchema>;
export type LivePin = z.infer<typeof livePinSchema>;

/** The approved HTTPS service verifies the live chain. This reader checks supplied evidence. */
export function verifyLivePacket(
  raw: unknown,
  pin: LivePin,
  previous?: FreePacket,
) {
  const value = verifyPacket(raw, pin);
  if (value.commitment !== pin.commitment)
    throw new Error("Live commitment pin");
  verifyLiveProgress(value, previous);
  return value;
}
