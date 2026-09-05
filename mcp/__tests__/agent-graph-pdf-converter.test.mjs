import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLocalAgentGraphPdfConverter } from "../agent-graph-pdf-converter.js";
import { sha256 } from "../agent-graph/contract.mjs";
import { parseKnowledgeSource } from "../agent-graph/parsers.mjs";
import {
  minimalAnnotatedBlankPdf,
  minimalBlankPdf,
  minimalMalformedContentsPdf,
  minimalTextAndBlankPdf,
  minimalTextAndMalformedContentsPdf,
  minimalTextAndUnsupportedFilterPdf,
  minimalTextAndVectorPdf,
  minimalTextPdf,
  minimalVectorPdf,
} from "./fixtures/minimal-text-pdf.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("host PDF adapter invokes only the native local converter over discovered bytes", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const result = await convert({
    sourcePath: "docs/evidence.pdf",
    bytes: minimalTextPdf("Deterministic PDF evidence"),
  });
  assert.match(result.markdown, /^# evidence\.pdf/m);
  assert.match(result.markdown, /^## Page 1/m);
  assert.match(result.markdown, /Deterministic PDF evidence/);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.extraction, {
    pageCount: 1,
    textLineCount: 1,
    blankPageCount: 0,
    nonTextPageCount: 0,
    blankPages: [],
    nonTextPages: [],
    contentClass: "text",
  });
});

test("source text shaped like a page marker cannot alter structured PDF metadata", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const bytes = minimalTextPdf("## Page 2");
  const result = await convert({
    sourcePath: "docs/reserved-marker.pdf",
    bytes,
  });
  assert.deepEqual(result.extraction, {
    pageCount: 1,
    textLineCount: 1,
    blankPageCount: 0,
    nonTextPageCount: 0,
    blankPages: [],
    nonTextPages: [],
    contentClass: "text",
  });
  assert.match(result.markdown, /^## Page 1$/m);
  assert.match(result.markdown, /^\\## Page 2$/m);

  const fragment = await parseKnowledgeSource({
    relativePath: "docs/reserved-marker.pdf",
    bytes,
    contentHash: sha256(bytes),
    byteSize: bytes.length,
    kind: "pdf",
    status: "ready",
    diagnostics: [],
  }, {
    pdfConverter: convert,
    pdfConverterVersion: "reserved-marker-fixture-v1",
  });
  assert.equal(fragment.status, "parsed");
  assert.equal(
    fragment.nodes.filter((node) => (
      node.type === "DocumentSection" && Number.isInteger(node.properties["pdf:page"])
    )).length,
    1,
  );
});

test("host PDF adapter rejects zero-page and no-text results instead of publishing title-only evidence", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  await assert.rejects(
    convert({ sourcePath: "docs/invalid.pdf", bytes: Buffer.from("%PDF-1.4\n%%EOF\n") }),
    /no readable pages/i,
  );
  await assert.rejects(
    convert({ sourcePath: "docs/image-only.pdf", bytes: minimalTextPdf("") }),
    /no extractable text/i,
  );
  await assert.rejects(
    convert({ sourcePath: "docs/vector-only.pdf", bytes: minimalVectorPdf() }),
    /no extractable text/i,
  );
  await assert.rejects(
    convert({ sourcePath: "docs/annotated.pdf", bytes: minimalAnnotatedBlankPdf() }),
    /nonblank pages with no extractable text/i,
  );
  await assert.rejects(
    convert({ sourcePath: "docs/malformed-contents.pdf", bytes: minimalMalformedContentsPdf() }),
    /could not safely decode every page content stream/i,
  );
  await assert.rejects(
    convert({
      sourcePath: "docs/text-and-malformed.pdf",
      bytes: minimalTextAndMalformedContentsPdf("Valid text must not hide an unsafe page"),
    }),
    /could not safely decode every page content stream/i,
  );
  for (const filter of ["/BogusDecode", "[/FlateDecode /BogusDecode]"]) {
    await assert.rejects(
      convert({
        sourcePath: "docs/text-and-unsupported-filter.pdf",
        bytes: minimalTextAndUnsupportedFilterPdf("Valid text must not hide encoded content", filter),
      }),
      /could not safely decode every page content stream/i,
    );
  }
});

test("host PDF adapter admits verified blank pages without fabricating document text", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const bytes = minimalBlankPdf();
  const result = await convert({
    sourcePath: "docs/blank.pdf",
    bytes,
  });
  assert.deepEqual(result.extraction, {
    pageCount: 1,
    textLineCount: 0,
    blankPageCount: 1,
    nonTextPageCount: 0,
    blankPages: [1],
    nonTextPages: [],
    contentClass: "blank",
  });
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "pdf_blank_document",
  ]);
  assert.doesNotMatch(result.markdown, /invented|fabricated/iu);

  const fragment = await parseKnowledgeSource({
    relativePath: "docs/blank.pdf",
    bytes,
    contentHash: sha256(bytes),
    byteSize: bytes.length,
    kind: "pdf",
    status: "ready",
    diagnostics: [],
  }, {
    pdfConverter: convert,
    pdfConverterVersion: "blank-page-fixture-v1",
  });
  assert.equal(fragment.status, "parsed");
  assert.ok(fragment.nodes.some((node) => (
    node.type === "SourceFile"
    && node.properties["pdf:contentClass"] === "blank"
    && node.properties["pdf:blankPageCount"] === 1
  )));
  assert.ok(fragment.nodes.some((node) => (
    node.type === "DocumentSection"
    && node.properties["pdf:page"] === 1
    && node.properties["pdf:pageContentClass"] === "blank"
  )));
  assert.equal(
    fragment.nodes.some((node) => node.type === "DocumentText"),
    false,
  );
  assert.deepEqual(fragment.diagnostics.map((diagnostic) => diagnostic.code), [
    "pdf_blank_document",
  ]);
});

test("mixed text and verified blank PDF pages preserve honest blank-page metadata", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const bytes = minimalTextAndBlankPdf("Source-backed page text");
  const result = await convert({
    sourcePath: "docs/mixed.pdf",
    bytes,
  });
  assert.deepEqual(result.extraction, {
    pageCount: 2,
    textLineCount: 1,
    blankPageCount: 1,
    nonTextPageCount: 0,
    blankPages: [2],
    nonTextPages: [],
    contentClass: "text-with-blank-pages",
  });
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "pdf_blank_pages",
  ]);

  const fragment = await parseKnowledgeSource({
    relativePath: "docs/mixed.pdf",
    bytes,
    contentHash: sha256(bytes),
    byteSize: bytes.length,
    kind: "pdf",
    status: "ready",
    diagnostics: [],
  }, {
    pdfConverter: convert,
    pdfConverterVersion: "mixed-page-fixture-v1",
  });
  const sourceNode = fragment.nodes.find((node) => node.type === "SourceFile");
  assert.equal(fragment.status, "parsed");
  assert.equal(sourceNode.properties["pdf:contentClass"], "text-with-blank-pages");
  assert.equal(sourceNode.properties["pdf:blankPageCount"], 1);
  assert.equal(sourceNode.properties["pdf:textLineCount"], 1);
  assert.equal(
    fragment.nodes.filter((node) => (
      node.type === "DocumentSection" && Number.isInteger(node.properties["pdf:page"])
    )).length,
    2,
  );
  assert.equal(
    fragment.nodes.filter((node) => node.type === "DocumentText").length,
    1,
  );
});

test("mixed text and nontext visual PDF pages stay queryable without fabricated OCR text", async () => {
  const convert = createLocalAgentGraphPdfConverter({ rootDir: repoRoot, timeoutMs: 30_000 });
  const bytes = minimalTextAndVectorPdf("Source-backed page text");
  const result = await convert({
    sourcePath: "docs/mixed-visual.pdf",
    bytes,
  });
  assert.deepEqual(result.extraction, {
    pageCount: 2,
    textLineCount: 1,
    blankPageCount: 0,
    nonTextPageCount: 1,
    blankPages: [],
    nonTextPages: [2],
    contentClass: "text-with-nontext-pages",
  });
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "pdf_nontext_pages",
  ]);
  assert.deepEqual(result.diagnostics[0].pages, [2]);

  const fragment = await parseKnowledgeSource({
    relativePath: "docs/mixed-visual.pdf",
    bytes,
    contentHash: sha256(bytes),
    byteSize: bytes.length,
    kind: "pdf",
    status: "ready",
    diagnostics: [],
  }, {
    pdfConverter: convert,
    pdfConverterVersion: "mixed-visual-fixture-v1",
  });
  const sourceNode = fragment.nodes.find((node) => node.type === "SourceFile");
  assert.equal(fragment.status, "parsed");
  assert.equal(sourceNode.properties["pdf:contentClass"], "text-with-nontext-pages");
  assert.equal(sourceNode.properties["pdf:nonTextPageCount"], 1);
  const nonTextPageNode = fragment.nodes.find((node) => (
    node.type === "DocumentSection"
    && node.properties["pdf:page"] === 2
  ));
  assert.equal(nonTextPageNode.properties["pdf:pageContentClass"], "nontext");
  const nonTextPageEdge = fragment.edges.find((edge) => edge.target === nonTextPageNode.id);
  assert.ok(nonTextPageEdge);
  assert.equal(typeof nonTextPageEdge.properties["evidence:explanation"], "string");
  assert.ok(nonTextPageEdge.properties["evidence:explanation"].length > 0);
  assert.equal(
    fragment.nodes.filter((node) => (
      node.type === "DocumentSection" && Number.isInteger(node.properties["pdf:page"])
    )).length,
    2,
  );
  assert.equal(
    fragment.nodes.filter((node) => node.type === "DocumentText").length,
    1,
  );
  assert.deepEqual(fragment.diagnostics.map((diagnostic) => diagnostic.code), [
    "pdf_nontext_pages",
  ]);
});
