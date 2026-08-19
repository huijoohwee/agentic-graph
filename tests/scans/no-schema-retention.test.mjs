import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sourcePath = new URL("../../src/registry/definition-validator.mjs", import.meta.url);

test("definition validator keeps no module-level schema cache", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.equal(/schemaCache|cachedSchema|let schema|const schema\s*=/.test(source), false);
});
