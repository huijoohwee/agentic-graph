import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLocalKnowledgeGraphPdfConverter } from "../knowledge-graph-pdf-converter.js";
import { minimalTextPdf } from "./fixtures/minimal-text-pdf.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("host PDF adapter invokes only the native local converter over discovered bytes", async () => {
  const convert = createLocalKnowledgeGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const result = await convert({
    sourcePath: "docs/evidence.pdf",
    bytes: minimalTextPdf("Deterministic PDF evidence"),
  });
  assert.match(result.markdown, /^# evidence\.pdf/m);
  assert.match(result.markdown, /^## Page 1/m);
  assert.match(result.markdown, /Deterministic PDF evidence/);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.extraction, { pageCount: 1, textLineCount: 1 });
});

test("host PDF adapter rejects zero-page and no-text results instead of publishing title-only evidence", async () => {
  const convert = createLocalKnowledgeGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  await assert.rejects(
    convert({ sourcePath: "docs/invalid.pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") }),
    /no readable pages/i,
  );
  await assert.rejects(
    convert({ sourcePath: "docs/image-only.pdf", bytes: minimalTextPdf("") }),
    /no extractable text/i,
  );
});
