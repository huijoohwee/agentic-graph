import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AGENT_GRAPH_SCHEMA_VERSION,
  agentGraphArtifactSnapshotDigest,
  computeAgentGraphArtifactDigest,
  makeEdge,
  makeNode,
  sha256,
  validateAgentGraphArtifact,
} from "../agent-graph/contract.mjs";
import { queryAgentGraph } from "../agent-graph/query-core.mjs";
import { queryAgentGraphSnapshot } from "../agent-graph/query.mjs";
import {
  writeAgentGraphSnapshotAtomic,
  writeAgentGraphSourceShard,
} from "../agent-graph/store.mjs";

const SOURCE_PATH = "fixtures/query.json";
const SOURCE_TEXT = '{"common":true}\n';
const SOURCE_DIGEST = sha256(SOURCE_TEXT);
const PARSER_ID = "fixture.json-query-pairing";
const PARSER_VERSION = "1";
const REPOSITORY_ID = "repo:query-pairing";

function evidence(excerpt) {
  return {
    kind: "extracted",
    ruleId: "fixture.query-pairing",
    explanation: "Fixture edge deterministically records source-backed query evidence.",
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    sourcePath: SOURCE_PATH,
    sourceDigest: SOURCE_DIGEST,
    lineStart: 1,
    lineEnd: 1,
    columnStart: 1,
    columnEnd: Math.max(1, excerpt.length),
    excerpt,
    confidence: "high",
    certainty: "exact",
    premiseEdgeIds: ["edge:premise:beta", "edge:premise:alpha"],
    candidateCount: 3,
    candidateIds: ["node:candidate:beta", "node:candidate:alpha"],
  };
}

function pairingFragment() {
  const source = makeNode({
    id: "node:source",
    label: SOURCE_PATH,
    type: "SourceFile",
    sourcePath: SOURCE_PATH,
  });
  const normal = makeNode({
    id: "node:normal",
    label: "common",
    type: "ConfigKey",
    sourcePath: SOURCE_PATH,
  });
  const chunks = ["a", "b", "c"].map((suffix) => makeNode({
    id: `node:chunk:${suffix}`,
    label: `search:${suffix}`,
    type: "ConfigSearchChunk",
    sourcePath: SOURCE_PATH,
    properties: {
      "config:searchText": `common token ${suffix}`,
    },
  }));
  const supportEdges = chunks.map((chunk) => makeEdge({
    source: source.id,
    target: chunk.id,
    label: "indexesConfigTokens",
    evidence: evidence(`common token ${chunk.id.at(-1)}`),
  }));
  const distractorEdges = [
    makeEdge({
      source: source.id,
      target: normal.id,
      label: "common",
      evidence: evidence("common"),
      anchor: "distractor:1",
    }),
    makeEdge({
      source: normal.id,
      target: source.id,
      label: "common",
      evidence: evidence("common"),
      anchor: "distractor:2",
    }),
  ];
  return {
    nodes: [source, normal, ...chunks],
    edges: [...supportEdges, ...distractorEdges],
    diagnostics: [],
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    status: "parsed",
  };
}

function assertPairedCommonResult(result, expectedDigest) {
  assert.equal(result.snapshotDigest, expectedDigest);
  assert.equal(result.results.nodes.length, 2);
  assert.equal(result.results.edges.length, 2);
  const configResults = result.results.nodes.filter(
    ({ node }) => node.type === "ConfigSearchChunk",
  );
  assert.equal(configResults.length, 1);
  const support = result.results.edges.find(
    ({ edge }) => edge.label === "indexesConfigTokens"
      && edge.target === configResults[0].node.id,
  );
  assert.ok(support, "the ranked ConfigSearchChunk must retain its support edge");
  assert.ok(
    result.results.edges.some(({ edge }) => edge.label === "common"),
    "the remaining edge slot must be filled from lexical rank order",
  );
  assert.deepEqual(
    result.citations.map(({ edgeId }) => edgeId),
    result.results.edges.map(({ edge }) => edge.id),
  );
  for (const citation of result.citations) {
    assert.deepEqual(citation.premiseEdgeIds, ["edge:premise:alpha", "edge:premise:beta"]);
    assert.equal(citation.candidateCount, 3);
    assert.deepEqual(citation.candidateIds, ["node:candidate:alpha", "node:candidate:beta"]);
  }
  assert.equal(result.completeness.truncated, true);
  assert.equal(result.completeness.reason, "result_limit");
  assert.equal(result.completeness.nodesTruncated, true);
  assert.equal(result.completeness.edgesTruncated, true);
}

test("the exact historical artifact family reads its digest as the snapshot identity", () => {
  const legacyKey = "knowledgeGraph";
  const snapshotDigest = sha256("historical-materialized-snapshot");
  const legacyMetadata = {
    digest: snapshotDigest,
    parserCoverage: { markdown: 1 },
    vectorStore: false,
    modelCalls: 0,
  };
  const artifact = { type: "Graph", nodes: [], edges: [], metadata: { [legacyKey]: legacyMetadata } };
  assert.equal(agentGraphArtifactSnapshotDigest(artifact), snapshotDigest);
  assert.equal(validateAgentGraphArtifact(artifact).ok, true);
  assert.equal(queryAgentGraph(artifact, { mode: "summary" }).snapshotDigest, snapshotDigest);
  assert.notEqual(computeAgentGraphArtifactDigest(artifact), snapshotDigest);

  const hybrid = structuredClone(artifact);
  hybrid.metadata[legacyKey].snapshotDigest = "a".repeat(64);
  assert.throws(
    () => agentGraphArtifactSnapshotDigest(hybrid),
    (error) => error?.code === "artifact_metadata_invalid",
  );
  assert.ok(validateAgentGraphArtifact(hybrid).errors.includes("legacy snapshotDigest is invalid"));
});

test("common-token limits keep config-search nodes paired with supporting edges and citations", async (t) => {
  const fragment = pairingFragment();
  const materializedDigest = sha256("materialized-query-pairing");
  const materialized = queryAgentGraph({
    ...fragment,
    metadata: { agentGraph: { schemaVersion: AGENT_GRAPH_SCHEMA_VERSION, snapshotDigest: materializedDigest } },
  }, {
    mode: "search",
    query: "common",
    limit: 2,
  });
  assertPairedCommonResult(materialized, materializedDigest);

  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-query-pairing-"));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const pointerPath = path.join(outputRoot, "graphs", "fixture.json");
  const sourceEntry = await writeAgentGraphSourceShard(pointerPath, {
    repositoryId: REPOSITORY_ID,
    repositoryPath: ".",
    relativePath: SOURCE_PATH,
    contentHash: SOURCE_DIGEST,
    byteSize: Buffer.byteLength(SOURCE_TEXT),
    kind: "json-config",
    status: "ready",
  }, fragment, {
    allowedRoot: outputRoot,
  });
  const snapshot = await writeAgentGraphSnapshotAtomic(pointerPath, {
    graphId: `kg:graph:${sha256("query-pairing").slice(0, 32)}`,
    sourceEntries: [sourceEntry],
    derivedEdgesByRepository: new Map(),
    diagnostics: [],
    rootContentHash: SOURCE_DIGEST,
    admission: { complete: true, counts: {} },
    completeness: { complete: true, incompleteSources: [], reasons: [] },
    parserRegistryDigest: sha256("query-pairing-registry"),
  }, {
    allowedRoot: outputRoot,
  });
  const snapshotResult = await queryAgentGraphSnapshot(snapshot, {
    mode: "search",
    query: "common",
    limit: 2,
  });
  assertPairedCommonResult(snapshotResult, snapshot.pointer.snapshotDigest);
});
