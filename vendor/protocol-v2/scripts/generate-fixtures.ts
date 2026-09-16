import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { wireSchemas, REVISION } from "../src/schemas.js";
import { canonicalJson, hashDocument } from "../src/canonical.js";
import { makeAuthorization, makeCancellation, makeOutcome, makeCasual, makeStudioRequest } from "./fixture-data.js";

const root = new URL("../", import.meta.url);
async function save(path: string, value: unknown) {
  const url = new URL(path, root);
  await mkdir(fileURLToPath(new URL("./", url)), { recursive: true });
  await writeFile(url, JSON.stringify(value, null, 2) + "\n");
}
for (const kind of ["played", "walkover"] as const) await save(`fixtures/${kind}.json`, await makeOutcome(kind));
await save("fixtures/cancellation.json", makeCancellation());
await save("fixtures/handler-authorization.json", makeAuthorization());
await save("fixtures/casual.json", await makeCasual());
await save("fixtures/studio-request.json", await makeStudioRequest());
const canonical = [null, { z: 2, a: "é 雪 😀\n", nested: { count: "9007199254740993" } },
  [false, true, 0, -1, 9007199254740991, "123456789012345678901234567890"]];
await save("fixtures/canonical.json", canonical.map(value => ({ value, canonical: canonicalJson(value), keccak256: hashDocument(value) })));
await save("fixtures/invalid.json", [
  { name: "duplicate-key", layer: "canonical", json: '{"a":1,"a":2}' },
  { name: "fractional-number", layer: "canonical", json: '{"a":0.5}' },
  { name: "unsafe-number", layer: "canonical", json: '{"a":9007199254740992}' },
  { name: "negative-zero", layer: "canonical", json: '{"a":-0}' },
  { name: "lone-surrogate", layer: "canonical", json: '{"a":"\\ud800"}' },
  { name: "wrong-protocol", layer: "manifest", path: ["protocol"], value: "agentborn/1" },
  { name: "underfilled", layer: "manifest", path: ["capacity"], value: 8 },
  { name: "fee-change", layer: "manifest", path: ["settlementFeeBps"], value: 200 },
  { name: "uncommitted-recipient", layer: "result", path: ["payments", 0, "beneficiary"], value: `0x${"f".repeat(40)}` },
  { name: "changed-replay", layer: "opening", path: ["replayHash"], value: `0x${"f".repeat(64)}` },
]);
const defs = Object.fromEntries(Object.entries(wireSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })]));
await save("schemas/protocol-v2.schema.json", { $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://agentborn.example/schemas/${REVISION}/protocol-v2.schema.json`,
  description: "Structural schemas. SPEC.md canonical rules and cross-document validators are additionally normative; example domain is not a deployed endpoint.",
  $defs: defs });
console.log("Generated public synthetic fixtures and structural schemas.");
