import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { TRAINING_REVISION, trainingWireSchemas } from "../src/training.js";
import { makeTrainingFixture } from "./training-fixture-data.js";

await writeFile(new URL("../fixtures/training.json", import.meta.url), JSON.stringify(await makeTrainingFixture(), null, 2) + "\n");
await writeFile(new URL("../schemas/training.schema.json", import.meta.url), JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://agentborn.example/schemas/${TRAINING_REVISION}/training.schema.json`,
  description: "Structural evidence extension. TRAINING.md validation and independent authority checks are additionally required; no deployed endpoint.",
  $defs: Object.fromEntries(Object.entries(trainingWireSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })])),
}, null, 2) + "\n");
console.log("Generated separate synthetic training vectors; legacy vectors unchanged.");
