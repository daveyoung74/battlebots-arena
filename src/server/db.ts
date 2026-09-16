import mysql, { type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { databaseOptions, requireLegacy } from "./config.ts";
import type { ArenaMatch } from "../game/types.ts";
let pool: mysql.Pool;
export function db() {
  requireLegacy();
  if (!pool) {
    pool = mysql.createPool(databaseOptions());
    pool.pool.on("connection", (connection) => {
      connection.query("SET SESSION innodb_lock_wait_timeout=5", (error) => {
        if (error) connection.destroy();
      });
    });
  }
  return pool;
}
export async function closeDb() {
  if (pool) await pool.end();
}
export async function transaction<T>(fn: (c: PoolConnection) => Promise<T>) {
  const c = await db().getConnection();
  try {
    await c.beginTransaction();
    const v = await fn(c);
    await c.commit();
    return v;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export function decode(row: RowDataPacket): ArenaMatch {
  return typeof row.payload === "string"
    ? JSON.parse(row.payload)
    : row.payload;
}
export async function getMatch(id: string) {
  const [rows] = await db().execute<RowDataPacket[]>(
    "SELECT payload FROM arena_matches WHERE id=?",
    [id],
  );
  return rows[0] ? decode(rows[0]) : null;
}
export async function listMatches(limit = 80) {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT payload FROM arena_matches ORDER BY (status NOT IN ('complete','cancelled')) DESC,created_at DESC LIMIT ?",
    [limit],
  );
  return rows.map(decode);
}
export async function insertMatch(m: ArenaMatch, connection?: PoolConnection) {
  await (connection ?? db()).execute(
    "INSERT INTO arena_matches (id,mode,status,next_at,created_at,payload) VALUES (?,?,?,?,?,?)",
    [m.id, m.mode, m.status, m.nextTickAt, m.createdAt, JSON.stringify(m)],
  );
}
export async function saveMatch(c: PoolConnection, m: ArenaMatch) {
  m.revision++;
  await c.execute(
    "UPDATE arena_matches SET status=?,next_at=?,payload=? WHERE id=?",
    [m.status, m.nextTickAt, JSON.stringify(m), m.id],
  );
}
export async function lockedMatch<T>(
  id: string,
  fn: (m: ArenaMatch, c: PoolConnection) => Promise<T>,
) {
  return transaction(async (c) => {
    const [rows] = await c.execute<RowDataPacket[]>(
      "SELECT payload FROM arena_matches WHERE id=? FOR UPDATE",
      [id],
    );
    if (!rows[0])
      throw Object.assign(new Error("Match not found"), { status: 404 });
    const m = decode(rows[0]);
    const before = JSON.stringify(m);
    const result = await fn(m, c);
    if (JSON.stringify(m) !== before) await saveMatch(c, m);
    return result;
  });
}
export async function limit(key: string, max: number, seconds: number) {
  return transaction(async (c) => {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    await c.execute(
      "INSERT INTO arena_rate_limits (id,bucket,hits) VALUES (?,?,1) ON DUPLICATE KEY UPDATE hits=IF(bucket=VALUES(bucket),hits+1,1),bucket=VALUES(bucket)",
      [key.slice(0, 128), bucket],
    );
    const [rows] = await c.execute<RowDataPacket[]>(
      "SELECT hits FROM arena_rate_limits WHERE id=?",
      [key.slice(0, 128)],
    );
    if (rows[0].hits > max)
      throw Object.assign(new Error("Please wait before trying again"), {
        status: 429,
      });
  });
}
