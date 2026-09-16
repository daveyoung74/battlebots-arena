import { parseBuffer } from "music-metadata";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { config } from "./config.ts";
import { db, listMatches } from "./db.ts";
export function audioId(text: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        text,
        config.voiceId,
        config.voiceModel,
        "en",
        1,
        0.55,
        0.75,
      ]),
    )
    .digest("hex");
}
export async function voiceTick() {
  if (!config.voiceId || !config.voiceKey) return;
  const now = Date.now();
  for (const m of (await listMatches()).filter(
    (m) => m.status !== "cancelled" && (!m.endedAt || now - m.endedAt < 120000),
  )) {
    for (const cue of m.cues) {
      if (cue.kind === "reaction" && cue.expiresAt < now) continue;
      await db().execute(
        "INSERT IGNORE INTO arena_audio_assets(id,text_content,created_at) VALUES (?,?,?)",
        [audioId(cue.text), cue.text.slice(0, 1000), now],
      );
    }
  }
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT id,text_content,attempts FROM arena_audio_assets WHERE status='pending' AND next_at<=? ORDER BY created_at LIMIT 1",
    [now],
  );
  if (!rows.length) return;
  const row = rows[0];
  const [claim] = await db().execute<import("mysql2").ResultSetHeader>(
    "UPDATE arena_audio_assets SET next_at=?,attempts=attempts+1 WHERE id=? AND next_at<=?",
    [now + 60000, row.id, now],
  );
  if (!claim.affectedRows) return;
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        encodeURIComponent(config.voiceId) +
        "?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "xi-api-key": config.voiceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: row.text_content,
          model_id: config.voiceModel,
          voice_settings: { stability: 0.55, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) throw new Error("Voice provider unavailable");
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length > 2000000) throw new Error("Audio exceeds budget");
    const metadata = await parseBuffer(audio, { mimeType: "audio/mpeg" });
    const duration = Math.ceil((metadata.format.duration ?? 0) * 1000);
    await db().execute(
      "UPDATE arena_audio_assets SET status='ready',audio=?,duration_ms=? WHERE id=?",
      [audio, duration, row.id],
    );
  } catch {
    await db().execute(
      "UPDATE arena_audio_assets SET status=?,next_at=? WHERE id=?",
      [row.attempts >= 2 ? "failed" : "pending", now + 60000, row.id],
    );
  }
}
