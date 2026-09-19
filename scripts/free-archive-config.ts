import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  freeConfigSchema,
  packageHash,
  verifyFreePacket,
} from "../src/free/model.ts";

// Explicit packaging helper. Review the source and profile independently before accepting this pin.
const [folder, provenance, label, first, second, ...files] =
  process.argv.slice(2);
if (
  !folder ||
  !label ||
  !first ||
  !second ||
  !files.length ||
  files.length > 32
)
  throw new Error(
    "Usage: tsx scripts/free-archive-config.ts OUTPUT_DIR disposable-test|published-export LABEL FIRST SECOND PACKAGE.json [...]",
  );
const packets = await Promise.all(
  files.map(async (file) => {
    const bytes = await readFile(file);
    if (bytes.byteLength > 2097152) throw new Error("Package too large");
    return JSON.parse(bytes.toString("utf8"));
  }),
);
const config = freeConfigSchema.parse({
  mode: "free",
  provenance,
  matches: packets.map((p, i) => ({
    id: p.manifest.matchId,
    profileHash: p.manifest.profileHash,
    packageHash: packageHash(p),
    label: packets.length === 1 ? label : `${label} ${i + 1}`,
    champions: [first, second],
  })),
});
for (const [i, packet] of packets.entries())
  verifyFreePacket(packet, config.matches[i]);
// Never overwrite an existing pin or archive. Updating a reviewed program is a deliberate operation.
for (const packet of packets)
  await writeFile(
    path.join(folder, `${packet.manifest.matchId}.json`),
    JSON.stringify(packet),
    { flag: "wx" },
  );
await writeFile(
  path.join(folder, "viewer.json"),
  JSON.stringify(config, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Archive written. Verify its provenance and profile before sharing.",
);
