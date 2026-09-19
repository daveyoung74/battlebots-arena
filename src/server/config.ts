import { config as dotenv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
dotenv({ path: process.env.ARENA_ENV_FILE || ".env", quiet: true });
const mode = process.env.ARENA_MODE || "fixture";
if (
  mode !== "fixture" &&
  mode !== "protocol" &&
  mode !== "legacy" &&
  mode !== "free-live" &&
  mode !== "free"
)
  throw new Error(
    "ARENA_MODE must be fixture, protocol, free, free-live or legacy",
  );
function number(name: string, fallback: number, min = 1) {
  const n = Number(process.env[name] || fallback);
  if (!Number.isFinite(n) || n < min) throw new Error("Invalid " + name);
  return n;
}
const url = (process.env.ARENA_PUBLIC_URL || "http://localhost:3100").replace(
  /\/$/,
  "",
);
export const config = {
  mode: mode as "fixture" | "protocol" | "free" | "free-live" | "legacy",
  port: number("PORT", 3100),
  url,
  platform: (process.env.BATTLEBOTS_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  ),
  database: process.env.DATABASE_URL || "",
  gameId: process.env.ARENA_GAME_ID || "",
  privateKey: process.env.ARENA_PRIVATE_KEY || "",
  internalKey: process.env.ARENA_INTERNAL_KEY || "",
  manifestVersion: number("ARENA_MANIFEST_VERSION", 1),
  demo: process.env.ARENA_DEMO === "true",
  worker: process.env.ARENA_WORKER !== "false",
  slotSeconds: number("ARENA_SLOT_SECONDS", 300, 60),
  noticeSeconds: number("ARENA_NOTICE_SECONDS", 900, 60),
  prematchSeconds: number("ARENA_PREMATCH_SECONDS", 120, 10),
  wrapupSeconds: number("ARENA_WRAPUP_SECONDS", 60, 5),
  replayDays: number("ARENA_REPLAY_DAYS", 30),
  practiceDays: number("ARENA_PRACTICE_DAYS", 7),
  voiceKey: process.env.ELEVENLABS_API_KEY || "",
  voiceId: process.env.ELEVENLABS_VOICE_ID || "",
  voiceModel: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
};
export function databaseOptions() {
  if (!config.database)
    throw new Error("DATABASE_URL is required; see .env.example");
  const u = new URL(config.database);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  const caPath = process.env.DATABASE_CA_PATH;
  return {
    uri: config.database,
    connectionLimit: 8,
    timezone: "Z",
    ...(local
      ? {}
      : {
          ssl: {
            rejectUnauthorized: true,
            ...(caPath
              ? { ca: readFileSync(path.resolve(caPath), "utf8") }
              : {}),
          },
        }),
  };
}
export function integrated() {
  return Boolean(config.gameId && config.privateKey && config.internalKey);
}
export function requireLegacy() {
  if (config.mode !== "legacy")
    throw new Error("Legacy authority requires explicit ARENA_MODE=legacy");
}
