import type { RowDataPacket } from "mysql2/promise";
import { db, transaction, decode } from "./db.ts";
import { config } from "./config.ts";
import { exhibition } from "./service.ts";

/** Claim and publish the next house show in one transaction. */
export async function advanceExhibitionProgram(now: number, name = "house") {
  // Autocommit initialization avoids concurrent INSERT IGNORE shared locks
  // upgrading to FOR UPDATE locks in the same transaction.
  await db().execute(
    "INSERT IGNORE INTO arena_programs(name,match_id) VALUES (?,NULL)",
    [name],
  );
  return transaction(async (connection) => {
    const [programs] = await connection.execute<RowDataPacket[]>(
      "SELECT match_id FROM arena_programs WHERE name=? FOR UPDATE",
      [name],
    );
    const [rows] = programs[0].match_id
      ? await connection.execute<RowDataPacket[]>(
          "SELECT payload FROM arena_matches WHERE id=?",
          [programs[0].match_id],
        )
      : [[]];
    const recent = rows[0] ? decode(rows[0]) : null;
    if (
      recent &&
      recent.status !== "cancelled" &&
      (!recent.endedAt || now - recent.endedAt <= config.wrapupSeconds * 1000)
    )
      return recent.id;
    const next = await exhibition(undefined, 1, false, connection);
    await connection.execute(
      "UPDATE arena_programs SET match_id=? WHERE name=?",
      [next.id, name],
    );
    return next.id;
  });
}
