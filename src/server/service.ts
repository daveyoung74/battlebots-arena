import type { PoolConnection } from "mysql2/promise";
import { entranceProfile } from "../game/broadcast.ts";
import { randomBytes, randomUUID } from "node:crypto";
import {
  initialState,
  step,
  validateStrategy,
  RULES_VERSION,
} from "../game/engine.ts";
import { HOUSE } from "../game/fixtures.ts";
import type { ArenaMatch, Mode } from "../game/types.ts";
import { config, integrated } from "./config.ts";
import { getMatch, insertMatch, lockedMatch } from "./db.ts";
import { platformPost } from "../battlebots/client.ts";
import {
  withScheduleLock,
  availableRanked,
  availableCasual,
  reserveSlot,
} from "./scheduler.ts";
import { audioId } from "./voice.ts";
export function newMatch(mode: Mode, headless = false): ArenaMatch {
  const now = Date.now();
  const startsAt =
    mode === "ranked"
      ? Math.ceil(
          (now + config.noticeSeconds * 1000) / (config.slotSeconds * 1000),
        ) *
        config.slotSeconds *
        1000
      : now + 12000;
  return {
    rulesVersion: RULES_VERSION,
    id: randomUUID(),
    platformId: null,
    mode,
    visual: !headless,
    status: "waiting",
    entrants: [],
    accepted: [],
    seed: randomBytes(4).readUInt32LE(),
    combat: null,
    events: [],
    cues: [],
    createdAt: now,
    startsAt,
    nextTickAt: now,
    endedAt: null,
    settledAt: null,
    expiresAt: Math.max(now + 900000, startsAt + 300000),
    replayExpiresAt: null,
    revision: 1,
    manifestVersion: config.manifestVersion,
    result: null,
    lastError: null,
    headless,
    schedulePublished: false,
    rewardPolicy: mode === "casual" || mode === "ranked" ? "platform" : "none",
  };
}
async function createReadyUnlocked(
  mode: "practice" | "casual" | "ranked",
  headless = false,
) {
  if (!integrated())
    throw Object.assign(
      new Error(
        "Champion entry opens when BattleBots is connected. Try an exhibition in the meantime.",
      ),
      { status: 503 },
    );
  // Ranked callers join an already advertised, unfilled slot before its explicit entry cutoff.
  if (mode === "ranked") {
    const existing = await availableRanked();
    if (existing) return existing;
  }
  if (mode === "casual") {
    const existing = await availableCasual();
    if (existing) return existing;
  }
  const m = newMatch(mode, headless);
  if (mode === "ranked") await reserveSlot(m);
  if (mode === "practice") m.entrants = [structuredClone(HOUSE[1])];
  await insertMatch(m);
  try {
    const opened = await platformPost("/matches", {
      external_match_id: m.id,
      queue: mode === "ranked" ? "ranked" : "normal",
      fee_mint: "xp",
      fee_amount: 0,
      prize_rule: {
        kind: mode === "practice" ? "practice" : "xp",
        presentation: {
          version: 1,
          watch_url: config.url + "/matches/" + m.id,
          starts_at: m.startsAt,
          ...(mode === "ranked"
            ? { entry_deadline: m.startsAt - config.noticeSeconds * 1000 }
            : {}),
        },
      },
      timeout_sec: Math.min(
        86400,
        Math.ceil((m.expiresAt - Date.now()) / 1000),
      ),
      manifest_version: m.manifestVersion,
    });
    await lockedMatch(m.id, async (row) => {
      row.platformId = opened.match.id;
    });
    return (await getMatch(m.id))!;
  } catch (e) {
    await lockedMatch(m.id, async (row) => {
      row.status = "cancelled";
    });
    throw e;
  }
}
export async function createReady(
  mode: "practice" | "casual" | "ranked",
  headless = false,
) {
  return mode !== "practice"
    ? withScheduleLock(() => createReadyUnlocked(mode, headless))
    : createReadyUnlocked(mode, headless);
}
export async function acceptEntry(
  id: string,
  body: {
    champion_id: string;
    manifest_version: number;
    profile: { agent_config: unknown; owner_config?: unknown };
    proof: { kind: string };
    owner_ref?: string;
  },
) {
  const strategy = validateStrategy(body.profile.agent_config);
  return lockedMatch(id, async (m, c) => {
    if (["complete", "cancelled", "settling", "running"].includes(m.status))
      throw Object.assign(new Error("Match is closed"), { status: 409 });
    if (body.manifest_version !== m.manifestVersion || body.proof.kind !== "xp")
      throw Object.assign(new Error("Version or proof mismatch"), {
        status: 400,
      });
    if (
      m.mode === "ranked" &&
      Date.now() >= m.startsAt - config.noticeSeconds * 1000
    )
      throw Object.assign(new Error("Entry deadline passed"), { status: 409 });
    const existing = m.entrants.find((e) => e.identity.id === body.champion_id);
    if (existing) {
      if (JSON.stringify(existing.strategy) !== JSON.stringify(strategy))
        throw Object.assign(new Error("Frozen entry conflict"), {
          status: 409,
        });
      return;
    }
    if (body.owner_ref && m.entrants.some((e) => e.ownerRef === body.owner_ref))
      throw Object.assign(new Error("A duel requires different owners"), {
        status: 409,
      });
    if (m.mode === "ranked") {
      try {
        await c.execute(
          "INSERT INTO arena_champion_bookings(champion_id,match_id) VALUES (?,?)",
          [body.champion_id, m.id],
        );
      } catch (e) {
        if ((e as { code?: string }).code === "ER_DUP_ENTRY")
          throw Object.assign(
            new Error("Champion already has a scheduled match"),
            { status: 409 },
          );
        throw e;
      }
    }
    if (m.entrants.length >= 2)
      throw Object.assign(new Error("Match is full"), { status: 409 });
    m.entrants.push({
      identity: {
        id: body.champion_id,
        name: "Champion",
        portrait: "/portraits/rook.svg",
        color: "#e8b96b",
        title: "BATTLEBOTS CHAMPION",
        fact: "The next chapter starts here.",
      },
      strategy,
      acceptedAt: Date.now(),
      ownerRef: body.owner_ref,
    });
  });
}
export function addCue(
  m: ArenaMatch,
  text: string,
  at: number,
  kind: "entrance" | "reaction" | "finish",
  championId?: string,
) {
  const id = m.id + ":" + kind + ":" + m.cues.length;
  m.cues.push({
    id,
    text,
    at,
    expiresAt: at + (kind === "entrance" ? 5750 : 4000),
    kind,
    championId,
    ...(config.voiceKey && config.voiceId
      ? { audio: "/api/audio/" + audioId(text) }
      : {}),
  });
}
function prepare(m: ArenaMatch, now: number) {
  for (const e of m.entrants) {
    e.identity.entrance = entranceProfile(e.identity);
  }
  m.status = "ready";
  if (m.mode !== "ranked") {
    m.startsAt = now + (m.headless ? 0 : 12000);
    m.nextTickAt = m.startsAt;
  } else m.nextTickAt = m.startsAt;
  if (!m.headless) {
    addCue(
      m,
      "Entering the Arena. " +
        m.entrants[0].identity.name +
        ". " +
        m.entrants[0].identity.fact,
      m.startsAt - 12000,
      "entrance",
      m.entrants[0].identity.id,
    );
    addCue(
      m,
      "Across the arena. " +
        m.entrants[1].identity.name +
        ". " +
        m.entrants[1].identity.fact,
      m.startsAt - 6000,
      "entrance",
      m.entrants[1].identity.id,
    );
  }
}
export async function exhibition(
  strategy?: unknown,
  opponent = 1,
  headless = false,
  connection?: PoolConnection,
) {
  if (!config.demo)
    throw Object.assign(new Error("Exhibitions are disabled"), { status: 404 });
  const m = newMatch("exhibition", headless);
  m.entrants = [
    structuredClone(HOUSE[0]),
    structuredClone(HOUSE[opponent % HOUSE.length]),
  ];
  if (strategy) m.entrants[0].strategy = validateStrategy(strategy);
  if (m.entrants[1].identity.id === m.entrants[0].identity.id)
    m.entrants[1] = structuredClone(HOUSE[1]);
  prepare(m, Date.now());
  await insertMatch(m, connection);
  return m;
}
export async function confirmEntries(m: ArenaMatch) {
  if (!m.platformId) return;
  const receipt = await platformPost("/matches/" + m.id + "/receipt", {});
  if (receipt.status === "cancelled") {
    await lockedMatch(m.id, async (row) => {
      row.status = "cancelled";
      row.lastError = "Cancelled by BattleBots";
    });
    return;
  }
  await lockedMatch(m.id, async (row, c) => {
    if (row.status !== "waiting") return;
    const confirmed = receipt.entries.filter(
      (e: { confirmed: boolean }) => e.confirmed,
    );
    const known = new Set(
      receipt.entries.map((e: { champion_id: string }) => e.champion_id),
    );
    // Accepted responses can be lost. Only finalized platform entries may start a fight.
    const removed = row.entrants.filter(
      (e) =>
        !e.identity.id.startsWith("house-") &&
        !known.has(e.identity.id) &&
        Date.now() - (e.acceptedAt ?? row.createdAt) >= 30000,
    );
    row.entrants = row.entrants.filter((e) => !removed.includes(e));
    for (const e of removed)
      await c.execute(
        "DELETE FROM arena_champion_bookings WHERE champion_id=? AND match_id=?",
        [e.identity.id, row.id],
      );
    for (const entry of confirmed) {
      const local = row.entrants.find(
        (e) => e.identity.id === entry.champion_id,
      );
      if (!local) continue;
      local.identity = { ...local.identity, ...entry.identity };
      local.ownerRef = entry.owner_ref;
    }
    row.accepted = confirmed.map((e: { champion_id: string }) => e.champion_id);
    const humans = row.entrants.filter(
      (e) => !e.identity.id.startsWith("house-"),
    );
    if (humans.length > 1 && humans[0].ownerRef === humans[1].ownerRef) {
      row.status = "cancelled";
      row.lastError = "Ranked and Casual duels require different owners";
      return;
    }
    if (
      row.entrants.length === 2 &&
      humans.every((e) => row.accepted.includes(e.identity.id))
    ) {
      prepare(row, Date.now());
      if (row.mode === "ranked") row.schedulePublished = true;
      if (row.mode === "ranked")
        await c.execute(
          "INSERT IGNORE INTO arena_outbox(id,match_id,kind,payload) VALUES (?,?,?,?)",
          [
            row.id + ":scheduled",
            row.id,
            "schedule",
            JSON.stringify({
              kind: "scheduled",
              starts_at: row.startsAt,
              revision: 1,
              watch_url: config.url + "/matches/" + row.id,
            }),
          ],
        );
    }
  });
}
export async function tickMatch(id: string, now = Date.now()) {
  await lockedMatch(id, async (m) => {
    if (
      m.status === "waiting" &&
      (now > m.expiresAt ||
        (m.mode === "ranked" &&
          now >= m.startsAt - config.noticeSeconds * 1000))
    ) {
      m.status = "cancelled";
      m.lastError = "Entry window expired";
      return;
    }
    if (!["ready", "running"].includes(m.status) || now < m.nextTickAt) return;
    if (m.entrants.length !== 2)
      throw new Error("Ready match has incomplete roster");
    if (!m.combat) m.combat = initialState(m.seed, m.rulesVersion ?? 1);
    m.status = "running";
    // At most one visible exchange per tick. A restarted worker never releases a burst of future events.
    do {
      const next = step(m.combat, m.entrants, now);
      m.combat = next.state;
      m.events.push(next.event);
      if (next.event.seq % 5 === 0 && !m.headless)
        addCue(m, next.event.caption, now, "reaction");
      m.nextTickAt = now + 1000;
      if (next.state.winner !== null) {
        m.result = { winner: next.state.winner, reason: next.state.reason! };
        m.endedAt = now;
        m.status = m.platformId ? "settling" : "complete";
        if (!m.platformId) m.settledAt = now;
        m.replayExpiresAt =
          now +
          (m.mode === "practice" ? config.practiceDays : config.replayDays) *
            86400000;
        if (!m.headless)
          addCue(
            m,
            m.entrants[next.state.winner].identity.name +
              " takes the duel. " +
              next.state.reason +
              ".",
            now,
            "finish",
          );
        break;
      }
    } while (m.headless && m.combat.winner === null);
    if (Buffer.byteLength(JSON.stringify(m.events)) > 65536) {
      m.events = [];
      m.replayExpiresAt = now;
    }
  });
}
export async function settle(m: ArenaMatch) {
  if (!m.platformId || !m.result) return;
  const results = m.entrants.flatMap((e, i) =>
    e.identity.id.startsWith("house-")
      ? []
      : [
          {
            champion_id: e.identity.id,
            outcome: i === m.result!.winner ? "win" : "loss",
          },
        ],
  );
  await platformPost("/matches/" + m.id + "/settle", {
    settle_seq: 1,
    manifest_version: m.manifestVersion,
    results,
  });
  await lockedMatch(m.id, async (row) => {
    if (row.status !== "settling") return;
    row.status = "complete";
    row.settledAt = Date.now();
    row.lastError = null;
  });
}
