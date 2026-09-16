import type { Identity, Cue } from "./types.ts";

/** Presentation revisions are independent from combat rules and frozen at entry. */
export function entranceProfile(identity: Identity) {
  return {
    revision: 1 as const,
    championId: identity.id,
    portrait: identity.portrait,
    palette: identity.color,
    animation: "spotlight" as const,
    accent: "arena-chime" as const,
    introduction: identity.name + ". " + identity.fact,
    evidence: identity.rivalry?.evidence ?? [],
  };
}

/** A proposed venue seam, consumed by the browser only. No device delivery. */
export function entranceCues(
  matchId: string,
  identities: Identity[],
  startsAt: number,
) {
  return identities.flatMap((identity, side) => {
    const profile = entranceProfile(identity);
    const at = startsAt - 12000 + side * 6000;
    return (["begin", "voice", "accent", "end"] as const).map(
      (kind, order) => ({
        version: 1 as const,
        id: matchId + ":entrance:" + side + ":" + kind,
        matchId,
        championId: identity.id,
        profileRevision: profile.revision,
        sequence: side * 4 + order,
        kind: "entrance." + kind,
        at: at + (kind === "end" ? 5750 : 0),
        expiresAt: at + 6000,
        profile,
        caption: profile.introduction,
        evidence: profile.evidence,
      }),
    );
  });
}

export function replayBounds(
  startsAt: number,
  endedAt: number | null,
  cues: Cue[],
) {
  const start = Math.min(startsAt, ...cues.map((c) => c.at));
  const end = Math.max(endedAt ?? startsAt, ...cues.map((c) => c.expiresAt));
  return { start, duration: Math.max(1, (end - start) / 1000) };
}
