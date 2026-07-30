import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EVIDENCE_FIELDS, sha256 } from "../knowledge-graph/contract.mjs";
import { createKnowledgeGraphRuntime, KNOWLEDGE_GRAPH_TOOL_NAMES } from "../knowledge-graph/runtime.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShard,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";
import { parseSqlSource } from "../knowledge-graph/sql-parser.mjs";

async function writeFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  return target;
}

async function createFixture(t, { withPdfConverter = true } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-kg-runtime-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const knowgrphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(knowgrphRoot, "outputs");
  await fs.mkdir(knowgrphRoot, { recursive: true });
  await fs.mkdir(path.join(corpusRoot, ".git"), { recursive: true });
  await writeFile(corpusRoot, "src/db.ts", "export function load() { return 1; }\n");
  await writeFile(corpusRoot, "src/db/index.ts", "export function alternate() { return 2; }\n");
  await writeFile(corpusRoot, "src/app.ts", [
    'import { load } from "./db";',
    "export const multiline =",
    "  async () => load();",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "src/Service.java", [
    "public class Service",
    "{",
    "  public void run()",
    "  {",
    "  }",
    "}",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "lib.py", "class Service:\n    def run(self):\n        return 1\n");
  await writeFile(corpusRoot, "sql/accounts.sql", [
    "/* schema preface */",
    "CREATE TABLE IF NOT EXISTS accounts (",
    "  tenant_id INTEGER,",
    "  id INTEGER,",
    "  CONSTRAINT accounts_pk PRIMARY KEY (tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "sql/users.sql", [
    "CREATE TABLE IF NOT EXISTS users (",
    "  tenant_id INTEGER,",
    "  account_id INTEGER,",
    "  CONSTRAINT users_fk FOREIGN KEY (tenant_id, account_id)",
    "    REFERENCES accounts(tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "README.md", "# Corpus\n## Schema\n[Accounts](sql/accounts.sql)\n");
  await writeFile(corpusRoot, "config.json", '{"constructor":{"toString":"kept"},"credentials":{"value":"secret"}}\n');
  await writeFile(corpusRoot, "wrangler.toml", 'name = "fixture"\n[credentials]\nvalue = "secret"\n');
  await writeFile(corpusRoot, "paper.pdf", Buffer.from("%PDF-1.4\nlocal fixture\n%%EOF\n"));
  await writeFile(corpusRoot, "nested/.git/HEAD", "ref: refs/heads/main\n");
  await writeFile(corpusRoot, "nested/schema.sql", "CREATE TABLE accounts (id INTEGER PRIMARY KEY);\n");
  let pdfCalls = 0;
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
    pdfConverter: withPdfConverter
      ? async () => {
        pdfCalls += 1;
        return "# Research\n## Page 1\nDeterministic PDF evidence\n";
      }
      : null,
    pdfConverterVersion: withPdfConverter ? "fixture-v1" : "pending",
  });
  return { base, knowgrphRoot, corpusRoot, outputRoot, runtime, pdfCalls: () => pdfCalls };
}

async function ingestFixture(fixture, extra = {}) {
  const result = await fixture.runtime.run(KNOWLEDGE_GRAPH_TOOL_NAMES.ingest, {
    rootPath: fixture.corpusRoot,
    strict: true,
    ...extra,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

function pointerPathFor(fixture, graphId) {
  return path.join(fixture.outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);
}

async function materializeFixture(fixture, ingest) {
  const snapshot = await readKnowledgeGraphSnapshot(pointerPathFor(fixture, ingest.graphId), {
    allowedRoot: fixture.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const nodes = [];
  const edges = [];
  const sources = [];
  for (const repository of snapshot.manifest.repositories) {
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    sources.push(...index.sources);
    for (const entry of index.sources) {
      const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
      nodes.push(...shard.nodes);
      edges.push(...shard.edges);
    }
    edges.push(...(await readKnowledgeGraphResolutionShard(snapshot, index)).edges);
  }
  return { snapshot, nodes, edges, sources };
}

test("ingest writes content-addressed shards and returns only opaque graph identity", async (t) => {
  const fixture = await createFixture(t);
  const first = await ingestFixture(fixture, { projectionLimit: 5 });
  assert.match(first.graphId, /^kg:graph:[a-f0-9]{32}$/);
  assert.match(first.snapshotDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.complete, true);
  assert.equal(first.acquisition.networkRequests, 0);
  assert.equal(first.retrieval.vectorStore, false);
  assert.equal(first.cost.modelCalls, 0);
  assert.equal(first.projection.limit, 5);
  assert.equal(first.projection.truncated, true);
  assert.equal(first.projection.readOnly, true);
  assert.equal(first.projection.graphData.type, "Graph");
  assert.match(first.projection.token, /^kg:projection:[a-f0-9]{24}$/);
  const projectedNodeIds = new Set(first.projection.graphData.nodes.map((node) => node.id));
  assert.ok(first.projection.graphData.edges.every((edge) => (
    projectedNodeIds.has(edge.source) && projectedNodeIds.has(edge.target)
  )));
  assert.equal(JSON.stringify(first).includes("artifactPath"), false);
  assert.equal(JSON.stringify(first).includes("outputPath"), false);

  const pointerRaw = await fs.readFile(pointerPathFor(fixture, first.graphId), "utf8");
  const pointer = JSON.parse(pointerRaw);
  assert.deepEqual(Object.keys(pointer).sort(), ["graphId", "manifestDigest", "schema", "snapshotDigest"]);
  assert.equal(pointerRaw.includes('"nodes"'), false);
  const graph = await materializeFixture(fixture, first);
  assert.equal(graph.snapshot.manifest.schema, "knowgrph-knowledge-graph-sharded-manifest/v1");
  assert.ok(graph.snapshot.manifest.repositories.length >= 2);
  assert.ok(graph.nodes.some((node) => node.type === "CodeFunction" && node.label === "multiline"));
  assert.ok(!graph.nodes.some((node) => node.type === "CodeCallReference" && node.label === "async"));
  assert.ok(graph.nodes.some((node) => node.type === "CodeClass" && node.label === "Service"
    && node.properties["corpus:sourcePath"] === "src/Service.java"));
  assert.ok(graph.nodes.some((node) => node.type === "ConfigKey" && node.label === "constructor.toString"));
  assert.ok(graph.nodes.some((node) => node.type === "SqlTable" && node.label === "accounts"));
  assert.ok(graph.nodes.some((node) => node.type === "DocumentText" && node.label.includes("PDF evidence")));
  const importResolutions = graph.edges.filter((edge) => edge.label === "resolvesToSource"
    && edge.properties["evidence:ruleId"] === "resolve.relative-code-import.repository");
  assert.equal(importResolutions.length, 2);
  assert.ok(importResolutions.every((edge) => edge.properties["evidence:certainty"] === "ambiguous"));
  assert.ok(importResolutions.every((edge) => edge.properties["evidence:candidateCount"] === 2));
  const rootAccounts = graph.nodes.find((node) => node.type === "SqlTable" && node.label === "accounts"
    && node.properties["corpus:repositoryPath"] === ".");
  const nestedAccounts = graph.nodes.find((node) => node.type === "SqlTable" && node.label === "accounts"
    && node.properties["corpus:repositoryPath"] === "nested");
  assert.ok(rootAccounts && nestedAccounts);
  const sqlResolutions = graph.edges.filter((edge) => edge.label === "resolvesTo");
  assert.ok(sqlResolutions.some((edge) => edge.target === rootAccounts.id));
  assert.ok(!sqlResolutions.some((edge) => edge.target === nestedAccounts.id));
  for (const edge of graph.edges) {
    for (const field of EVIDENCE_FIELDS) assert.notEqual(edge.properties[field], undefined, `${edge.id} ${field}`);
    assert.equal(edge.properties["evidence:excerptHash"], sha256(edge.properties["evidence:excerpt"]));
    assert.match(edge.properties["evidence:sourceDigest"], /^[a-f0-9]{64}$/);
    assert.match(edge.properties["evidence:parserDigest"], /^[a-f0-9]{64}$/);
  }

  const second = await ingestFixture(fixture);
  assert.equal(second.graphId, first.graphId);
  assert.equal(second.snapshotDigest, first.snapshotDigest);
  assert.equal(second.counts.parsed, 1);
  assert.equal(second.counts.reused, second.counts.sources - 1);
  assert.equal(fixture.pdfCalls(), 1);
});

test("query, traversal, summaries, and explanations are digest-fenced and bounded", async (t) => {
  const fixture = await createFixture(t);
  const ingest = await ingestFixture(fixture);
  const common = { graphId: ingest.graphId, expectedSnapshotDigest: ingest.snapshotDigest };
  const search = await fixture.runtime.query({ ...common, mode: "search", query: "accounts", limit: 10 });
  assert.equal(search.ok, true);
  assert.equal(search.graphId, ingest.graphId);
  assert.equal(search.snapshotDigest, ingest.snapshotDigest);
  assert.ok(search.results.nodes.length > 0);
  const limited = await fixture.runtime.query({ ...common, mode: "search", query: "sourcefile", limit: 1 });
  assert.equal(limited.completeness.reason, "result_limit");
  const pathResult = await fixture.runtime.query({
    ...common,
    mode: "path",
    from: "src/app.ts",
    to: "src/db.ts",
    direction: "outgoing",
    edgeLabels: ["imports", "resolvesToSource"],
    maxDepth: 3,
  });
  assert.equal(pathResult.found, true, JSON.stringify(pathResult));
  const summary = await fixture.runtime.query({ ...common, mode: "summary" });
  assert.equal(summary.ok, true);
  assert.equal(summary.completeness.complete, true);
  const graph = await materializeFixture(fixture, ingest);
  const edge = graph.edges.find((candidate) => candidate.label === "referencesTable");
  const explanation = await fixture.runtime.explainEdge({ ...common, edgeId: edge.id });
  assert.equal(explanation.ok, true);
  assert.equal(explanation.graphId, ingest.graphId);
  assert.equal(explanation.snapshotDigest, ingest.snapshotDigest);
  assert.match(explanation.evidence.explanation, /references table/i);
  assert.match(explanation.evidence.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(explanation.evidence.parserDigest, /^[a-f0-9]{64}$/);
  const stale = await fixture.runtime.query({ ...common, expectedSnapshotDigest: "0".repeat(64), mode: "summary" });
  assert.equal(stale.error.code, "stale_snapshot_digest");
  const missing = await fixture.runtime.query({ graphId: ingest.graphId, mode: "summary" });
  assert.equal(missing.error.code, "expected_snapshot_digest_required");
});

test("strict failure and admission limits preserve the previous ready pointer", async (t) => {
  const fixture = await createFixture(t);
  const ingest = await ingestFixture(fixture);
  const pointerPath = pointerPathFor(fixture, ingest.graphId);
  const before = await fs.readFile(pointerPath, "utf8");
  await writeFile(fixture.corpusRoot, "lib.py", "def changed(:\n");
  const failed = await fixture.runtime.ingest({ rootPath: fixture.corpusRoot, strict: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "strict_ingest_incomplete");
  assert.equal(failed.error.details.previousReadySnapshotPreserved, true);
  assert.equal(await fs.readFile(pointerPath, "utf8"), before);
  const limited = await fixture.runtime.ingest({ rootPath: fixture.corpusRoot, maxFiles: 1, strict: true });
  assert.equal(limited.ok, false);
  assert.equal(limited.error.code, "max_files_exceeded");
  assert.equal(limited.error.details.complete, false);
  assert.equal(await fs.readFile(pointerPath, "utf8"), before);
});

test("pointer tampering, root escape, symlinks, and incomplete PDFs fail closed", async (t) => {
  const fixture = await createFixture(t);
  const otherRoot = path.join(fixture.base, "other");
  await fs.mkdir(otherRoot);
  const outside = await writeFile(otherRoot, "outside.ts", "export const leaked = true;\n");
  await fs.symlink(outside, path.join(fixture.corpusRoot, "linked.ts"));
  const ingest = await ingestFixture(fixture);
  assert.ok(ingest.diagnostics.some((item) => item.code === "symlink_skipped"));
  const escaped = await fixture.runtime.ingest({ rootPath: otherRoot, strict: true });
  assert.equal(escaped.error.code, "root_outside_allowed_roots");
  const pointerPath = pointerPathFor(fixture, ingest.graphId);
  const pointer = JSON.parse(await fs.readFile(pointerPath, "utf8"));
  pointer.manifestDigest = "0".repeat(64);
  await fs.writeFile(pointerPath, `${JSON.stringify(pointer)}\n`);
  const tampered = await fixture.runtime.query({
    graphId: ingest.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    mode: "summary",
  });
  assert.equal(tampered.error.code, "graph_pointer_invalid");

  const pendingFixture = await createFixture(t, { withPdfConverter: false });
  const pending = await pendingFixture.runtime.ingest({ rootPath: pendingFixture.corpusRoot, strict: true });
  assert.equal(pending.error.code, "strict_ingest_incomplete");
});

test("repository URL acquisition rejects non-canonical or credential-bearing identities before network access", async (t) => {
  const fixture = await createFixture(t);
  for (const repositoryUrl of [
    "http://github.com/example/project",
    "https://user:secret@github.com/example/project",
    "https://example.com/example/project",
    "https://github.com/example/project?token=secret",
  ]) {
    const result = await fixture.runtime.ingest({ repositoryUrl, strict: true });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "repository_url_invalid");
  }
});

test("SQL parser handles comment prefixes, IF NOT EXISTS, and named composite constraints", () => {
  const text = [
    "/* preface */",
    "CREATE TABLE IF NOT EXISTS parent (a INT, b INT, CONSTRAINT parent_pk PRIMARY KEY (a, b));",
    "CREATE TABLE IF NOT EXISTS child (x INT, y INT, CONSTRAINT child_fk FOREIGN KEY (x, y) REFERENCES parent(a, b));",
  ].join("\n");
  const fragment = parseSqlSource({ sourcePath: "schema.sql", text, contentHash: sha256(text), byteSize: Buffer.byteLength(text) });
  assert.equal(fragment.status, "parsed");
  assert.deepEqual(fragment.nodes.filter((node) => node.type === "SqlTable").map((node) => node.label), ["parent", "child"]);
  assert.equal(fragment.edges.filter((edge) => edge.label === "hasPrimaryKey").length, 2);
  assert.equal(fragment.edges.filter((edge) => edge.label === "referencesColumn").length, 2);
});
