import type { RowDataPacket } from "mysql2/promise";
import { db, closeDb } from "./db.ts";
import { pathToFileURL } from "node:url";
export const schema = [
  "CREATE TABLE IF NOT EXISTS arena_programs (name VARCHAR(64) PRIMARY KEY,match_id VARCHAR(64) NULL)",
  "CREATE TABLE IF NOT EXISTS arena_show_slots (starts_at BIGINT PRIMARY KEY,match_id VARCHAR(64) NOT NULL UNIQUE)",
  "CREATE TABLE IF NOT EXISTS arena_champion_bookings (champion_id VARCHAR(64) PRIMARY KEY,match_id VARCHAR(64) NOT NULL,INDEX arena_bookings_match (match_id))",
  "CREATE TABLE IF NOT EXISTS arena_matches (id VARCHAR(64) PRIMARY KEY,mode VARCHAR(20) NOT NULL,status VARCHAR(20) NOT NULL,next_at BIGINT NOT NULL,created_at BIGINT NOT NULL,payload JSON NOT NULL,INDEX arena_matches_due (status,next_at),INDEX arena_matches_created (created_at))",
  "CREATE TABLE IF NOT EXISTS arena_adapter_nonces (nonce VARCHAR(80) PRIMARY KEY,expires_at BIGINT NOT NULL,INDEX arena_nonce_expiry (expires_at))",
  "CREATE TABLE IF NOT EXISTS arena_rate_limits (id VARCHAR(128) PRIMARY KEY,bucket BIGINT NOT NULL,hits INT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS arena_audio_assets (id VARCHAR(64) PRIMARY KEY,text_content VARCHAR(1000) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_at BIGINT NOT NULL DEFAULT 0,audio LONGBLOB NULL,duration_ms INT NULL,created_at BIGINT NOT NULL,INDEX arena_audio_pending (status,next_at))",
  "CREATE TABLE IF NOT EXISTS arena_outbox (id VARCHAR(128) PRIMARY KEY,match_id VARCHAR(64) NOT NULL,kind VARCHAR(32) NOT NULL,payload JSON NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_at BIGINT NOT NULL DEFAULT 0,INDEX arena_outbox_pending(status,next_at))",
  "CREATE TABLE IF NOT EXISTS arena_schema_migrations (version INT PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
];
export async function migrate() {
  for (const sql of schema) await db().query(sql);
  const [columns] = await db().query<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='arena_audio_assets' AND COLUMN_NAME='duration_ms'",
  );
  if (!columns.length)
    await db().query(
      "ALTER TABLE arena_audio_assets ADD COLUMN duration_ms INT NULL",
    );
  await db().execute(
    "INSERT IGNORE INTO arena_schema_migrations(version) VALUES (1),(2),(3)",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  migrate()
    .then(() => console.log("Arena schema ready (arena_ tables only)."))
    .catch(() => {
      console.error(
        "Arena migration failed. Check database connectivity and TLS configuration.",
      );
      process.exitCode = 1;
    })
    .finally(closeDb);
}
