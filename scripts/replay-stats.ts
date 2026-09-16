import { db, closeDb } from "../src/server/db.ts";
import type { RowDataPacket } from "mysql2/promise";
try {
  const [rows] = await db().query<RowDataPacket[]>(
    "SELECT OCTET_LENGTH(JSON_EXTRACT(payload,'$.events')) AS bytes FROM arena_matches WHERE status='complete' ORDER BY created_at DESC LIMIT 1000",
  );
  const sizes = rows.map((r) => Number(r.bytes)).sort((a, b) => a - b);
  const [audio] = await db().query<RowDataPacket[]>(
    "SELECT status,COUNT(*) AS clips,COALESCE(SUM(OCTET_LENGTH(audio)),0) AS bytes FROM arena_audio_assets GROUP BY status",
  );
  console.log(
    JSON.stringify(
      {
        samples: sizes.length,
        medianEventBytes: sizes[Math.floor(sizes.length * 0.5)] ?? 0,
        p95EventBytes:
          sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * 0.95))] ??
          0,
        audio,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb();
}
