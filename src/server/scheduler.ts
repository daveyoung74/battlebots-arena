import type { RowDataPacket } from "mysql2/promise";
import { db, decode } from "./db.ts";
import { config } from "./config.ts";
import type { ArenaMatch } from "../game/types.ts";
export function nextSlot(
  now: number,
  slotSeconds: number,
  noticeSeconds: number,
) {
  return (
    Math.ceil(
      (now + (noticeSeconds + slotSeconds) * 1000) / (slotSeconds * 1000),
    ) *
    slotSeconds *
    1000
  );
}
export async function withScheduleLock<T>(fn: () => Promise<T>) {
  const c = await db().getConnection();
  try {
    const [r] = await c.query<RowDataPacket[]>(
      "SELECT GET_LOCK('arena_ranked_schedule',5) AS acquired",
    );
    if (r[0].acquired !== 1)
      throw Object.assign(new Error("Schedule busy; retry shortly"), {
        status: 503,
      });
    try {
      return await fn();
    } finally {
      await c.query("SELECT RELEASE_LOCK('arena_ranked_schedule')");
    }
  } finally {
    c.release();
  }
}
export async function availableRanked() {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT payload FROM arena_matches WHERE mode='ranked' AND status='waiting' ORDER BY created_at LIMIT 50",
  );
  return rows
    .map(decode)
    .find(
      (m) =>
        m.startsAt - Date.now() > config.noticeSeconds * 1000 &&
        m.entrants.length < 2,
    );
}
export async function reserveSlot(m: ArenaMatch) {
  let slot = nextSlot(Date.now(), config.slotSeconds, config.noticeSeconds);
  for (let i = 0; i < 100; i++, slot += config.slotSeconds * 1000) {
    try {
      await db().execute(
        "INSERT INTO arena_show_slots(starts_at,match_id) VALUES (?,?)",
        [slot, m.id],
      );
      m.startsAt = slot;
      m.expiresAt = slot + 300000;
      return;
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
    }
  }
  throw Object.assign(new Error("Today's lineup is full"), { status: 409 });
}

export async function availableCasual() {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT payload FROM arena_matches WHERE mode='casual' AND status='waiting' ORDER BY created_at LIMIT 50",
  );
  return rows
    .map(decode)
    .find(
      (m) =>
        m.platformId &&
        m.expiresAt > Date.now() + 30000 &&
        m.entrants.length < 2,
    );
}
