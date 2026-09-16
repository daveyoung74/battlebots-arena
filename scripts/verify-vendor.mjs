import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  vendor = path.join(root, "vendor/protocol-v2");
const provenance = JSON.parse(
  await readFile(path.join(root, "docs/vendor-provenance.json"), "utf8"),
);
const actual = [];
async function walk(relative = "") {
  for (const entry of await readdir(path.join(vendor, relative), {
    withFileTypes: true,
  })) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(file);
    else {
      assert(entry.isFile(), "Vendored symlinks are not source files");
      actual.push(file);
    }
  }
}
await walk();
assert.deepEqual(
  actual.sort(),
  provenance.files.map((file) => file.path).sort(),
  "Vendored source inventory changed",
);
for (const file of provenance.files) {
  const bytes = await readFile(path.join(vendor, file.path));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    file.sha256,
    file.path,
  );
}
console.log(
  `Verified ${actual.length} MIT public-package source files against recorded provenance`,
);
