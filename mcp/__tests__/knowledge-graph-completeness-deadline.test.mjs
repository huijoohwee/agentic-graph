import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256 } from "../knowledge-graph/contract.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";
import {
  knowledgeGraphStoreRoot,
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceBundle,
  readKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

async function fixture(t, options = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-kg-completeness-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createKnowledgeGraphRuntime({
    agenticGraphRoot: base,
    allowedRoots: [corpusRoot],
    outputRoot,
    ...options,
  });
  return { base, corpusRoot, outputRoot, runtime };
}

const pointerPath = (value, graphId) => path.join(
  value.outputRoot,
  "graphs",
  `${graphId.slice("kg:graph:".length)}.json`,
);

async function storedObjects(graphPointer) {
  const objectsRoot = path.join(knowledgeGraphStoreRoot(graphPointer), "objects");
  const prefixes = await fs.readdir(objectsRoot, { withFileTypes: true });
  const values = [];
  for (const prefix of prefixes.filter((entry) => entry.isDirectory())) {
    const files = await fs.readdir(path.join(objectsRoot, prefix.name));
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      values.push(JSON.parse(await fs.readFile(path.join(objectsRoot, prefix.name, file), "utf8")));
    }
  }
  return values;
}

test("aggregate resolution limits roll back streamed shards without publishing a failed snapshot", async (t) => {
  const value = await fixture(t);
  const original = "# Original\n";
  const changed = "# Changed\n";
  await fs.writeFile(path.join(value.corpusRoot, "a.md"), original);
  await fs.writeFile(path.join(value.corpusRoot, "z.md"), "# Last\n");
  const first = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(first.ok, true, JSON.stringify(first));
  const graphPointer = pointerPath(value, first.graphId);
  const before = await fs.readFile(graphPointer, "utf8");

  await fs.writeFile(path.join(value.corpusRoot, "a.md"), changed);
  const limited = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxResolutionRecords: 1,
  });
  assert.equal(limited.ok, false);
  assert.equal(limited.error.code, "resolution_record_limit_exceeded");
  assert.equal(limited.error.details.maxRecords, 1);
  assert.equal(await fs.readFile(graphPointer, "utf8"), before);
  const objects = await storedObjects(graphPointer);
  assert.ok(!objects.some((object) => object.schema === "agentic-graph-knowledge-graph-source-shard/v1"
    && object.sourcePath === "a.md"
    && object.contentHash === sha256(changed)));

  const byteLimited = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxResolutionBytes: 1,
  });
  assert.equal(byteLimited.ok, false);
  assert.equal(byteLimited.error.code, "resolution_byte_limit_exceeded");
  assert.equal(byteLimited.error.details.maxBytes, 1);
  assert.equal(await fs.readFile(graphPointer, "utf8"), before);
});

test("skipped sources remain incomplete while verified inventory fallback stays queryable", async (t) => {
  const value = await fixture(t);
  await fs.writeFile(path.join(value.corpusRoot, "ok.md"), "# OK\n");
  await fs.writeFile(path.join(value.corpusRoot, "large.md"), `# Large\n${"x".repeat(64)}\n`);
  await fs.writeFile(path.join(value.corpusRoot, "unknown.zzz"), "opaque but admitted\n");

  const ingest = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: false,
    maxFileBytes: 24,
  });
  assert.equal(ingest.ok, true, JSON.stringify(ingest));
  assert.equal(ingest.complete, false);
  assert.equal(ingest.completeness.complete, false);
  assert.equal(ingest.counts.skipped, 1);
  assert.equal(ingest.counts.unsupported, 0);
  assert.deepEqual(ingest.completeness.incompleteSources, ["large.md"]);
  assert.equal(ingest.projection.complete, false);
  assert.equal(ingest.projection.truncated, false);
  assert.equal(ingest.projection.reason, "ingest_incomplete");

  const snapshot = await readKnowledgeGraphSnapshot(pointerPath(value, ingest.graphId), {
    allowedRoot: value.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  assert.equal(snapshot.manifest.completeness.complete, false);
  assert.deepEqual(snapshot.manifest.completeness.incompleteSources, ["large.md"]);

  const summary = await value.runtime.query({
    graphId: ingest.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    mode: "summary",
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.completeness.complete, false);
  assert.equal(summary.completeness.corpusComplete, false);
  assert.equal(summary.completeness.resultComplete, true);
  assert.equal(summary.completeness.truncated, false);
  assert.equal(summary.completeness.reason, "ingest_incomplete");

  for (const query of [
    { mode: "search", query: "ok" },
    { mode: "neighbors", nodeId: "ok.md" },
    { mode: "impact", nodeId: "ok.md" },
    { mode: "path", from: "ok.md", to: "large.md" },
  ]) {
    const result = await value.runtime.query({
      graphId: ingest.graphId,
      expectedSnapshotDigest: ingest.snapshotDigest,
      ...query,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.completeness.complete, false);
    assert.equal(result.completeness.corpusComplete, false);
    assert.equal(result.completeness.resultComplete, true);
    assert.equal(result.completeness.truncated, false);
    assert.equal(result.completeness.reason, "ingest_incomplete");
  }
  const limitedQuery = await value.runtime.query({
    graphId: ingest.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    mode: "search",
    query: "sourcefile",
    limit: 1,
  });
  assert.equal(limitedQuery.completeness.corpusComplete, false);
  assert.equal(limitedQuery.completeness.resultComplete, false);
  assert.equal(limitedQuery.completeness.resultTruncated, true);
  assert.equal(limitedQuery.completeness.truncated, true);
  assert.equal(limitedQuery.completeness.reason, "ingest_incomplete");

  const before = await fs.readFile(pointerPath(value, ingest.graphId), "utf8");
  const strict = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxFileBytes: 24,
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.error.code, "strict_ingest_incomplete");
  assert.deepEqual(strict.error.details.sources, ["large.md"]);
  assert.equal(await fs.readFile(pointerPath(value, ingest.graphId), "utf8"), before);
});

test("the operation deadline spans PDF conversion and preserves the previous pointer", async (t) => {
  let clock = 0;
  let expireDuringConversion = false;
  const value = await fixture(t, {
    now: () => clock,
    pdfConverterVersion: "deadline-fixture",
    pdfConverter: async () => {
      if (expireDuringConversion) clock = 1000;
      return "# Report\n## Page 1\nLocal text\n";
    },
  });
  const pdfPath = path.join(value.corpusRoot, "report.pdf");
  await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\nfirst\n%%EOF\n"));
  const first = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxDurationMs: 1000,
  });
  assert.equal(first.ok, true, JSON.stringify(first));
  const graphPointer = pointerPath(value, first.graphId);
  const before = await fs.readFile(graphPointer, "utf8");

  await fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\nsecond\n%%EOF\n"));
  clock = 0;
  expireDuringConversion = true;
  const expired = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxDurationMs: 1000,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.error.code, "max_duration_exceeded");
  assert.equal(expired.error.details.complete, false);
  assert.equal(await fs.readFile(graphPointer, "utf8"), before);
});

test("parser record caps stop graph construction before an oversized fragment is stored", async (t) => {
  const value = await fixture(t);
  await fs.writeFile(
    path.join(value.corpusRoot, "many.md"),
    Array.from({ length: 20 }, (_, index) => `paragraph ${index}`).join("\n"),
  );
  const limited = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: false,
    maxParserRecords: 4,
  });
  assert.equal(limited.ok, true, JSON.stringify(limited));
  assert.equal(limited.complete, false);
  assert.deepEqual(limited.completeness.incompleteSources, ["many.md"]);
  assert.ok(limited.completeness.reasons.includes("parser_limited"));
  const graphPointer = pointerPath(value, limited.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: limited.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const shard = await readKnowledgeGraphSourceShard(snapshot, index.sources[0]);
  assert.equal(shard.status, "limited");
  assert.equal(shard.nodes.length, 1);
  assert.equal(shard.nodes[0].type, "SourceFile");
  assert.equal(shard.edges.length, 0);
  const before = await fs.readFile(graphPointer, "utf8");
  const objectsBeforeStrict = (await storedObjects(graphPointer))
    .map((object) => JSON.stringify(object))
    .sort();

  const strict = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxParserRecords: 4,
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.error.code, "parser_record_limit_exceeded");
  assert.equal(strict.error.details.attemptedRecords, 5);
  assert.equal(strict.error.details.maxRecords, 4);
  assert.equal(strict.error.details.stage, "markdown.text-edges");
  assert.equal(await fs.readFile(graphPointer, "utf8"), before);
  const objectsAfterStrict = (await storedObjects(graphPointer))
    .map((object) => JSON.stringify(object))
    .sort();
  assert.deepEqual(objectsAfterStrict, objectsBeforeStrict);

  const reparsed = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    maxParserRecords: 1000,
  });
  assert.equal(reparsed.ok, true, JSON.stringify(reparsed));
  assert.equal(reparsed.complete, true);
  assert.equal(reparsed.counts.parsed, 1);
  assert.equal(reparsed.counts.reused, 0);
});

test("dense generated JavaScript retains its complete AST graph within separate operation and record bounds", async (t) => {
  const value = await fixture(t, { maxParserOperations: 60_000 });
  const baselinePath = path.join(value.corpusRoot, "a.md");
  const bundleDirectory = path.join(value.corpusRoot, "z-dist");
  const bundlePath = path.join(bundleDirectory, "dense-runtime.bundle.js");
  const denseValues = Array.from({ length: 40_000 }, (_, index) => String(index)).join(",");
  const denseSource = [
    "export class DenseRenderer {",
    " render() { return runtimeCall(",
    "   payload); }",
    "}",
    `const payload = [${denseValues}];`,
    "export { payload };",
  ].join("\n");
  assert.equal(denseSource.split("\n").length, 6);
  assert.ok(Buffer.byteLength(denseSource) > 200_000);
  await fs.mkdir(bundleDirectory, { recursive: true });
  await fs.writeFile(baselinePath, "# Baseline\n");
  await fs.writeFile(bundlePath, denseSource);

  const complete = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    projectionLimit: 100,
  });
  assert.equal(complete.ok, true, JSON.stringify(complete));
  assert.equal(complete.complete, true);
  assert.equal(complete.projection.complete, true);
  const graphPointer = pointerPath(value, complete.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: complete.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const entry = index.sources.find((source) => source.sourcePath === "z-dist/dense-runtime.bundle.js");
  assert.ok(entry);
  assert.match(entry.parserVersion, /^1\.1\.0\+typescript-/);
  const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
  assert.equal(shard.status, "parsed");
  const classNode = shard.nodes.find((node) => node.type === "CodeClass" && node.label === "DenseRenderer");
  const methodNode = shard.nodes.find((node) => node.type === "CodeMethod" && node.label === "render");
  const callNode = shard.nodes.find((node) => node.type === "CodeCallReference" && node.label === "runtimeCall");
  assert.ok(classNode && methodNode && callNode);
  const methodEdge = shard.edges.find((edge) => (
    edge.source === classNode.id
    && edge.target === methodNode.id
    && edge.label === "containsDeclaration"
  ));
  const callEdge = shard.edges.find((edge) => (
    edge.source === methodNode.id
    && edge.target === callNode.id
    && edge.label === "calls"
  ));
  assert.ok(methodEdge && callEdge);
  assert.equal(methodEdge.properties["evidence:lineStart"], 2);
  assert.equal(methodEdge.properties["evidence:lineEnd"], 3);
  assert.equal(methodEdge.properties["evidence:columnStart"], 2);
  assert.equal(methodEdge.properties["evidence:columnEnd"], 15);
  assert.equal(
    methodEdge.properties["evidence:excerpt"],
    "render() { return runtimeCall(\n   payload); }",
  );
  assert.equal(callEdge.properties["evidence:lineStart"], 2);
  assert.equal(callEdge.properties["evidence:lineEnd"], 2);
  assert.equal(callEdge.properties["evidence:columnStart"], 20);
  assert.equal(callEdge.properties["evidence:columnEnd"], 31);
  assert.equal(callEdge.properties["evidence:excerpt"], "runtimeCall");
  assert.equal(callEdge.properties["evidence:excerptHash"], sha256("runtimeCall"));
  assert.equal(callEdge.properties["evidence:sourceDigest"], sha256(denseSource));
  assert.equal(callEdge.properties["evidence:parserVersion"], entry.parserVersion);
  assert.equal(
    callEdge.properties["evidence:parserDigest"],
    sha256(`local-typescript-ast\0${entry.parserVersion}`),
  );

  const search = await value.runtime.query({
    graphId: complete.graphId,
    expectedSnapshotDigest: complete.snapshotDigest,
    mode: "search",
    query: "DenseRenderer",
  });
  assert.equal(search.ok, true, JSON.stringify(search));
  assert.ok(search.results.nodes.some((result) => result.node.id === classNode.id));
  const explanation = await value.runtime.explainEdge({
    graphId: complete.graphId,
    expectedSnapshotDigest: complete.snapshotDigest,
    edgeId: callEdge.id,
  });
  assert.equal(explanation.ok, true, JSON.stringify(explanation));
  assert.equal(explanation.edge.source, methodNode.id);
  assert.equal(explanation.edge.target, callNode.id);
  assert.equal(explanation.evidence.excerpt, "runtimeCall");
  assert.equal(explanation.evidence.excerptHash, sha256("runtimeCall"));

  const pointerBeforeFailure = await fs.readFile(graphPointer, "utf8");
  const objectsBeforeFailure = (await storedObjects(graphPointer))
    .map((object) => JSON.stringify(object))
    .sort();
  await fs.writeFile(baselinePath, "# Changed before rollback\n");
  await fs.writeFile(bundlePath, `${denseSource}\nvoid 0;\n`);
  const operationLimitedRuntime = createKnowledgeGraphRuntime({
    agenticGraphRoot: value.base,
    allowedRoots: [value.corpusRoot],
    outputRoot: value.outputRoot,
    maxParserOperations: 1_000,
  });
  const failed = await operationLimitedRuntime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "parser_operation_limit_exceeded");
  assert.equal(failed.error.details.sourcePath, "z-dist/dense-runtime.bundle.js");
  assert.equal(failed.error.details.attemptedOperations, 1_001);
  assert.equal(failed.error.details.maxOperations, 1_000);
  assert.equal(await fs.readFile(graphPointer, "utf8"), pointerBeforeFailure);
  const objectsAfterFailure = (await storedObjects(graphPointer))
    .map((object) => JSON.stringify(object))
    .sort();
  assert.deepEqual(objectsAfterFailure, objectsBeforeFailure);

  const limited = await operationLimitedRuntime.ingest({
    rootPath: value.corpusRoot,
    strict: false,
  });
  assert.equal(limited.ok, true, JSON.stringify(limited));
  assert.equal(limited.complete, false);
  assert.deepEqual(
    limited.completeness.incompleteSources,
    ["z-dist/dense-runtime.bundle.js"],
  );
  const limitedSnapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: limited.graphId,
  });
  const limitedIndex = await readKnowledgeGraphRepositoryIndex(
    limitedSnapshot,
    limitedSnapshot.manifest.repositories[0],
  );
  const limitedEntry = limitedIndex.sources.find(
    (source) => source.sourcePath === "z-dist/dense-runtime.bundle.js",
  );
  const limitedShard = await readKnowledgeGraphSourceShard(limitedSnapshot, limitedEntry);
  assert.equal(limitedShard.status, "limited");
  assert.deepEqual(
    limitedShard.diagnostics.map((diagnostic) => diagnostic.code),
    ["parser_operation_limit_exceeded"],
  );
  assert.equal(limitedShard.nodes.length, 1);
  assert.equal(limitedShard.nodes[0].type, "SourceFile");
  assert.equal(limitedShard.edges.length, 0);
});

test("strict ingest persists an oversized source graph as bounded complete parts", async (t) => {
  const maxSourceShardBytes = 32_768;
  const value = await fixture(t, {
    maxSourceShardBytes,
    maxSourcePartTargetBytes: 16_384,
  });
  await fs.writeFile(
    path.join(value.corpusRoot, "large.md"),
    Array.from({ length: 200 }, (_, index) => `## Section ${index}\nparagraph ${index}`).join("\n"),
  );
  const first = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    projectionLimit: 1_000,
  });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.complete, true);
  assert.equal(first.counts.parsed, 1);

  const graphPointer = pointerPath(value, first.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: first.graphId,
  });
  const index = await readKnowledgeGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  const entry = index.sources[0];
  const bundle = await readKnowledgeGraphSourceBundle(snapshot, entry);
  assert.ok(bundle.nodeParts.length + bundle.edgeParts.length > 1);
  for (const part of [...bundle.nodeParts, ...bundle.edgeParts]) {
    assert.ok(part.bytes <= maxSourceShardBytes);
    const stored = await fs.stat(path.join(
      knowledgeGraphStoreRoot(graphPointer),
      "objects",
      part.digest.slice(0, 2),
      `${part.digest}.json`,
    ));
    assert.equal(stored.size, part.bytes);
    assert.ok(stored.size <= maxSourceShardBytes);
  }
  const shard = await readKnowledgeGraphSourceShard(snapshot, index.sources[0]);
  assert.equal(shard.status, "parsed");
  assert.equal(shard.nodes.length, entry.nodeCount);
  assert.equal(shard.edges.length, entry.edgeCount);
  assert.equal(first.projection.complete, true);
  assert.equal(first.projection.graphData.nodes.length, entry.nodeCount);
  const search = await value.runtime.query({
    graphId: first.graphId,
    expectedSnapshotDigest: first.snapshotDigest,
    mode: "search",
    query: "Section 199",
  });
  assert.equal(search.ok, true, JSON.stringify(search));
  assert.ok(search.results.nodes.length > 0);
  const explanation = await value.runtime.explainEdge({
    graphId: first.graphId,
    expectedSnapshotDigest: first.snapshotDigest,
    edgeId: shard.edges.at(-1).id,
  });
  assert.equal(explanation.ok, true, JSON.stringify(explanation));
  assert.equal(explanation.edge.id, shard.edges.at(-1).id);
  const second = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
    projectionLimit: 1_000,
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.snapshotDigest, first.snapshotDigest);
  assert.equal(second.counts.parsed, 0);
  assert.equal(second.counts.reused, 1);
});

test("a tighter source part ceiling reparses once and then reuses the bounded bundle", async (t) => {
  const value = await fixture(t);
  await fs.writeFile(
    path.join(value.corpusRoot, "large.md"),
    Array.from({ length: 200 }, (_, index) => `## Section ${index}\nparagraph ${index}`).join("\n"),
  );
  const first = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.counts.parsed, 1);

  const limitedRuntime = createKnowledgeGraphRuntime({
    agenticGraphRoot: value.base,
    allowedRoots: [value.corpusRoot],
    outputRoot: value.outputRoot,
    maxSourceShardBytes: 32_768,
    maxSourcePartTargetBytes: 16_384,
  });
  const strict = await limitedRuntime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(strict.ok, true, JSON.stringify(strict));
  assert.equal(strict.complete, true);
  assert.equal(strict.counts.parsed, 1);
  assert.equal(strict.counts.reused, 0);
  const reused = await limitedRuntime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(reused.ok, true, JSON.stringify(reused));
  assert.equal(reused.snapshotDigest, strict.snapshotDigest);
  assert.equal(reused.counts.parsed, 0);
  assert.equal(reused.counts.reused, 1);
});

test("non-strict ingest fails closed when an existing source object is oversized", async (t) => {
  const maxSourceShardBytes = 16_384;
  const value = await fixture(t, { maxSourceShardBytes });
  await fs.writeFile(path.join(value.corpusRoot, "small.md"), "# Small\n");
  const first = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(first.ok, true, JSON.stringify(first));
  const graphPointer = pointerPath(value, first.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: first.graphId,
  });
  const index = await readKnowledgeGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  const bundle = await readKnowledgeGraphSourceBundle(snapshot, index.sources[0]);
  const digest = [...bundle.nodeParts, ...bundle.edgeParts][0].digest;
  const objectPath = path.join(
    knowledgeGraphStoreRoot(graphPointer),
    "objects",
    digest.slice(0, 2),
    `${digest}.json`,
  );
  await fs.writeFile(objectPath, "x".repeat(maxSourceShardBytes + 1));
  const before = await fs.readFile(graphPointer, "utf8");

  const result = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: false,
    useCache: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "artifact_too_large");
  assert.equal(await fs.readFile(graphPointer, "utf8"), before);
});

test("query and explain deadlines remain active after snapshot acquisition", async (t) => {
  let enforceDeadline = false;
  let clockCalls = 0;
  const value = await fixture(t, {
    now: () => {
      if (!enforceDeadline) return 0;
      clockCalls += 1;
      return clockCalls > 26 ? 20000 : 0;
    },
  });
  await fs.writeFile(path.join(value.corpusRoot, "doc.md"), "# Runtime\nBody\n");
  const ingest = await value.runtime.ingest({
    rootPath: value.corpusRoot,
    strict: true,
  });
  assert.equal(ingest.ok, true, JSON.stringify(ingest));
  const snapshot = await readKnowledgeGraphSnapshot(pointerPath(value, ingest.graphId), {
    allowedRoot: value.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const shard = await readKnowledgeGraphSourceShard(snapshot, index.sources[0]);
  const edgeId = shard.edges[0].id;
  const common = {
    graphId: ingest.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    maxDurationMs: 10000,
  };

  enforceDeadline = true;
  clockCalls = 0;
  const query = await value.runtime.query({ ...common, mode: "search", query: "runtime" });
  assert.equal(query.ok, false);
  assert.equal(query.error.code, "max_duration_exceeded");
  assert.ok(clockCalls > 20);

  clockCalls = 0;
  const explain = await value.runtime.explainEdge({ ...common, edgeId });
  assert.equal(explain.ok, false);
  assert.equal(explain.error.code, "max_duration_exceeded");
  assert.ok(clockCalls > 20);
});
