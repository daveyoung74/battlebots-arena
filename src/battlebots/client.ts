import { config, integrated, requireLegacy } from "../server/config.ts";
import { outbound } from "./crypto.ts";
export async function platformPost(path: string, body: unknown) {
  requireLegacy();
  if (!integrated())
    throw Object.assign(new Error("BattleBots adapter is not configured"), {
      status: 503,
    });
  const raw = JSON.stringify(body);
  const res = await fetch(
    config.platform +
      "/api/v1/games/" +
      encodeURIComponent(config.gameId) +
      path,
    {
      method: "POST",
      headers: outbound(config.privateKey, raw),
      body: raw,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    },
  );
  const json = await res
    .json()
    .catch(() => ({ error: "Invalid platform response" }));
  if (!res.ok)
    throw Object.assign(new Error(json.error || "BattleBots request failed"), {
      status: res.status,
    });
  return json;
}
