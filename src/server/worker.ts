import { advanceExhibitionProgram } from "./program.ts";
import { pathToFileURL } from "node:url";
import type { RowDataPacket } from "mysql2/promise";
import { db, closeDb, lockedMatch, decode, getMatch } from "./db.ts";
import { config, integrated, requireLegacy } from "./config.ts";
import { confirmEntries, tickMatch, settle } from "./service.ts";
import { platformPost } from "../battlebots/client.ts";
import { voiceTick } from "./voice.ts";
let stopping = false;
let lastSweepAt = 0,
  lastFinishedAt = 0,
  stage = "idle";
export function workerStatus() {
  return { busy, lastSweepAt, lastFinishedAt, stage };
}
let busy = false,
  voiceBusy = false,
  lastCleanup = 0;
async function outbox(
  id: string,
  matchId: string,
  kind: string,
  payload: unknown,
) {
  await db().execute(
    "INSERT IGNORE INTO arena_outbox(id,match_id,kind,payload) VALUES (?,?,?,?)",
    [id, matchId, kind, JSON.stringify(payload)],
  );
}
export async function work() {
  requireLegacy();
  if (busy || stopping) return;
  busy = true;
  lastSweepAt = Date.now();
  stage = "matches";
  try {
    const now = Date.now();
    const [rows] = await db().query<RowDataPacket[]>(
      "SELECT payload FROM arena_matches WHERE status NOT IN ('complete','cancelled') OR (status='cancelled' AND JSON_EXTRACT(payload,'$.platformCancellationConfirmed') IS NULL) ORDER BY next_at LIMIT 100",
    );
    for (const m of rows.map(decode)) {
      if (stopping) break;
      if (
        m.id.startsWith("test-") ||
        (m.mode !== "exhibition" && !integrated())
      )
        continue;
      if (m.nextTickAt > now && m.status !== "ready") continue;
      try {
        if (m.status === "cancelled") {
          if (m.mode !== "exhibition" && config.gameId) {
            try {
              await platformPost("/matches/" + m.id + "/cancel", {});
            } catch (e) {
              if ((e as { status?: number }).status !== 404) throw e;
            }
            if (m.mode === "ranked" && m.schedulePublished)
              await outbox(m.id + ":cancel", m.id, "schedule", {
                kind: "schedule_cancelled",
                starts_at: m.startsAt,
                revision: 2,
                watch_url: config.url + "/matches/" + m.id,
              });
          }
          await lockedMatch(m.id, async (row) => {
            row.platformCancellationConfirmed = true;
          });
          await db().execute(
            "DELETE FROM arena_champion_bookings WHERE match_id=?",
            [m.id],
          );
          continue;
        }
        if (m.status === "waiting" && m.platformId) await confirmEntries(m);
        if (
          m.status === "ready" &&
          m.mode === "ranked" &&
          now >= m.startsAt - config.prematchSeconds * 1000
        )
          await outbox(m.id + ":reminder", m.id, "schedule", {
            kind: "reminder",
            starts_at: m.startsAt,
            revision: 1,
            watch_url: config.url + "/matches/" + m.id,
          });
        if (
          m.platformId &&
          ["ready", "running"].includes(m.status) &&
          now >= m.nextTickAt
        ) {
          const receipt = await platformPost(
            "/matches/" + m.id + "/receipt",
            {},
          );
          if (
            receipt.status === "cancelled" ||
            m.accepted.some(
              (id) =>
                !receipt.entries.some(
                  (e: { champion_id: string; confirmed: boolean }) =>
                    e.champion_id === id && e.confirmed,
                ),
            )
          ) {
            await lockedMatch(m.id, async (row) => {
              row.status = "cancelled";
              row.lastError = "Entry is no longer authorized";
            });
            continue;
          }
        }
        await tickMatch(m.id, now);
        if (m.status === "settling") {
          await settle(m);
          await db().execute(
            "DELETE FROM arena_champion_bookings WHERE match_id=?",
            [m.id],
          );
          if (m.mode !== "practice")
            await outbox(m.id + ":hud", m.id, "hud", {});
        }
      } catch (e) {
        await lockedMatch(m.id, async (row) => {
          row.lastError =
            e instanceof Error
              ? e.message.slice(0, 180)
              : "Worker retry pending";
          row.nextTickAt = Date.now() + 10000;
        }).catch(() => {});
      }
    }
    stage = "program";
    if (config.demo && !stopping) await advanceExhibitionProgram(now);
    stage = "outbox";
    const [messages] = await db().query<RowDataPacket[]>(
      "SELECT * FROM arena_outbox WHERE status='pending' AND next_at<=? ORDER BY id LIMIT 5",
      [now],
    );
    for (const msg of messages) {
      if (stopping) break;
      if (!integrated()) continue;
      try {
        const payload =
          typeof msg.payload === "string"
            ? JSON.parse(msg.payload)
            : msg.payload;
        const match = await getMatch(msg.match_id);
        if (msg.kind === "schedule" && match) {
          if (
            payload.kind === "schedule_cancelled" ||
            (match.status !== "cancelled" && now < payload.starts_at)
          )
            await platformPost(
              "/matches/" + msg.match_id + "/schedule",
              payload,
            );
        } else if (msg.kind === "hud" && match) {
          const connection = await db().getConnection();
          try {
            for (const entrant of match.entrants.filter(
              (e) => !e.identity.id.startsWith("house-"),
            )) {
              const key = "arena_hud_" + entrant.identity.id;
              const [lock] = await connection.query<RowDataPacket[]>(
                "SELECT GET_LOCK(?,1) AS acquired",
                [key],
              );
              if (lock[0].acquired !== 1) throw new Error("HUD busy");
              try {
                const [recent] = await connection.query<RowDataPacket[]>(
                  "SELECT payload FROM arena_matches WHERE status='complete' AND mode IN ('casual','ranked') AND JSON_SEARCH(payload,'one',?,NULL,'$.entrants[*].identity.id') IS NOT NULL ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.endedAt')) AS UNSIGNED) DESC LIMIT 1",
                  [entrant.identity.id],
                );
                const latest = recent[0] ? decode(recent[0]) : null;
                if (latest?.result) {
                  const index = latest.entrants.findIndex(
                    (e) => e.identity.id === entrant.identity.id,
                  );
                  await platformPost(
                    "/champions/" +
                      encodeURIComponent(entrant.identity.id) +
                      "/state",
                    {
                      last_outcome:
                        index === latest.result.winner ? "win" : "loss",
                      last_opponent: latest.entrants[
                        1 - index
                      ].identity.name.slice(0, 64),
                    },
                  );
                }
              } finally {
                await connection.query("SELECT RELEASE_LOCK(?)", [key]);
              }
            }
          } finally {
            connection.release();
          }
        }
        await db().execute("UPDATE arena_outbox SET status='sent' WHERE id=?", [
          msg.id,
        ]);
      } catch (e) {
        const terminal =
          (e as { status?: number }).status === 404 ||
          ((e as { status?: number }).status === 409 &&
            now >
              (typeof msg.payload === "string"
                ? JSON.parse(msg.payload)
                : msg.payload
              ).starts_at);
        await db().execute(
          "UPDATE arena_outbox SET status=?,attempts=attempts+1,next_at=? WHERE id=?",
          [terminal ? "expired" : "pending", now + 30000, msg.id],
        );
      }
    }
    if (now - lastCleanup > 60000) {
      lastCleanup = now;
      await db().execute(
        "DELETE FROM arena_adapter_nonces WHERE expires_at<?",
        [now],
      );
      const [expired] = await db().query<RowDataPacket[]>(
        "SELECT payload FROM arena_matches WHERE status='complete' AND JSON_EXTRACT(payload,'$.replayExpiresAt')<? AND JSON_LENGTH(JSON_EXTRACT(payload,'$.events'))>0 LIMIT 50",
        [now],
      );
      for (const m of expired.map(decode))
        await lockedMatch(m.id, async (row) => {
          row.events = [];
          row.cues = [];
        });
      await db().execute("DELETE FROM arena_audio_assets WHERE created_at<?", [
        now - (config.replayDays + 1) * 86400000,
      ]);
    }
    if (!voiceBusy) {
      voiceBusy = true;
      void voiceTick()
        .catch(() => {})
        .finally(() => {
          voiceBusy = false;
        });
    }
  } finally {
    busy = false;
    lastFinishedAt = Date.now();
    stage = "idle";
  }
}
export function startWorker() {
  requireLegacy();
  const timer = setInterval(
    () =>
      void work().catch(() =>
        console.error("Arena worker will retry; check database connectivity."),
      ),
    500,
  );
  void work().catch(() => console.error("Arena initial sweep will retry."));
  return async () => {
    stopping = true;
    clearInterval(timer);
    while (busy || voiceBusy)
      await new Promise((resolve) => setTimeout(resolve, 50));
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const stop = startWorker();
  const shutdown = async () => {
    const timeout = setTimeout(() => process.exit(1), 20000);
    timeout.unref();
    await stop();
    await closeDb();
    clearTimeout(timeout);
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => void shutdown());
  console.log("Arena worker started");
}
