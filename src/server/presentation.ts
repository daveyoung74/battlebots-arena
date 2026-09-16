import { entranceCues } from "../game/broadcast.ts";
import { turningPoint } from "../game/engine.ts";
import type { ArenaMatch, Phase, PublicMatch } from "../game/types.ts";
import { config } from "./config.ts";
export function phase(m: ArenaMatch, now = Date.now()): Phase {
  if (m.status === "cancelled") return "cancelled";
  if (m.status === "waiting") return "waiting";
  if (m.status === "ready")
    return now >=
      m.startsAt -
        (m.mode === "exhibition" ? 12000 : config.prematchSeconds * 1000)
      ? "entrance"
      : "waiting";
  if (m.status === "running")
    return now - m.nextTickAt > 5000 ? "interrupted" : "live";
  if (m.status === "settling") return "settling";
  return m.endedAt && now < m.endedAt + config.wrapupSeconds * 1000
    ? "wrapup"
    : "complete";
}
export function publicMatch(m: ArenaMatch, now = Date.now()): PublicMatch {
  const expired = Boolean(m.replayExpiresAt && now > m.replayExpiresAt);
  const events = expired ? [] : m.events.filter((e) => e.at <= now);
  return {
    id: m.id,
    platformId: m.platformId,
    mode: m.mode,
    phase: phase(m, now),
    entranceCues:
      expired || !m.visual
        ? []
        : entranceCues(
            m.id,
            m.entrants.map((e) => e.identity),
            m.startsAt,
          ).filter((c) => c.at <= now),
    entrants: m.entrants.map((e) => e.identity),
    events,
    cues: expired ? [] : m.cues.filter((c) => c.at <= now),
    startsAt: m.startsAt,
    endedAt: m.endedAt,
    serverTime: now,
    result: m.endedAt ? m.result : null,
    official: m.status === "complete",
    replayState: !m.visual
      ? "unsupported"
      : expired
        ? "expired"
        : m.endedAt
          ? "available"
          : "pending",
    replayExpiresAt: m.replayExpiresAt,
    revision: m.revision,
    turningPoint: m.endedAt && !expired ? turningPoint(events) : null,
    watchUrl: config.url + "/matches/" + m.id,
  };
}
