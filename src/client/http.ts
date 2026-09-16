import { z } from "zod";
import * as P from "@agentborn/protocol-v2";
export async function read<S extends z.ZodType>(
  url: string,
  schema: S,
  max: number,
  signal?: AbortSignal,
): Promise<z.infer<S>> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok)
    throw new Error(
      response.status === 425
        ? "The official replay is not released yet. Retry after publication."
        : "The replay source is unavailable. Please retry.",
    );
  if (
    !response.headers.get("content-type")?.startsWith("application/json") ||
    !response.body
  )
    throw new Error("Invalid replay response");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) throw new Error("Replay response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return P.parseCanonical(schema, bytes, max);
}
