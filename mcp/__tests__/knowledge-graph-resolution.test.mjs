import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256, stableStringify } from "../knowledge-graph/contract.mjs";
import { materializeKnowledgeGraphRepository } from "../knowledge-graph/materialize.mjs";
import {
  explainKnowledgeGraphSnapshotEdge,
  projectKnowledgeGraphSnapshot,
  queryKnowledgeGraphSnapshot,
} from "../knowledge-graph/query.mjs";
import { runKnowledgeGraphObjectTransaction } from "../knowledge-graph/object-transaction.mjs";
import { buildRepositoryScopedResolutionEdges } from "../knowledge-graph/resolution.mjs";
import {
  MAX_RESOLUTION_SHARD_BYTES,
  partitionResolutionEdges,
} from "../knowledge-graph/resolution-sharding.mjs";
import {
  MAX_RESOLUTION_SHARD_DIGESTS,
  resolutionShardDigestsForIndex,
} from "../knowledge-graph/resolution-store-validation.mjs";
import {
  KNOWLEDGE_GRAPH_MANIFEST_SCHEMA,
  KNOWLEDGE_GRAPH_POINTER_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
  KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
  knowledgeGraphStoreRoot,
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphResolutionShards,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
  writeKnowledgeGraphSnapshotAtomic,
  writeKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

const repositoryId = "repository:fixture";
const repositoryPath = ".";

function source(relativePath) {
  return {
    relativePath,
    contentHash: sha256(relativePath),
    repositoryId,
    repositoryPath,
  };
}

function sourceNode(relativePath) {
  return {
    id: `source:${relativePath}`,
    type: "SourceFile",
    label: relativePath,
    properties: { "corpus:sourcePath": relativePath },
  };
}

function premiseEdge(id, dependencyId, lineStart, targetReads) {
  return {
    id,
    source: "source:premise",
    get target() {
      targetReads.count += 1;
      return dependencyId;
    },
    label: "imports",
    properties: {
      "evidence:lineStart": lineStart,
      "evidence:lineEnd": lineStart,
      "evidence:columnStart": 1,
      "evidence:columnEnd": 2,
      "evidence:excerpt": `line ${lineStart}`,
    },
  };
}

function resolutionFixture(importCount = 32) {
  const targetReads = { count: 0 };
  const sources = [source("src/target.ts")];
  const fragments = new Map([
    ["src/target.ts", { nodes: [sourceNode("src/target.ts")], edges: [] }],
  ]);
  for (let index = 0; index < importCount; index += 1) {
    const relativePath = `src/importer-${String(index).padStart(2, "0")}.ts`;
    const dependencyId = `dependency:${index}`;
    sources.push(source(relativePath));
    const edges = [premiseEdge(`premise:${index}:z`, dependencyId, 9, targetReads)];
    if (index === 0) edges.push(premiseEdge("premise:0:a", dependencyId, 2, targetReads));
    fragments.set(relativePath, {
      nodes: [
        sourceNode(relativePath),
        {
          id: dependencyId,
          type: "CodeDependency",
          label: "./target",
          properties: {
            "code:module": "./target",
            "corpus:sourcePath": relativePath,
          },
        },
      ],
      edges,
    });
  }
  return { fragments, sources, targetReads };
}

async function writeStoredObject(pointerPath, value) {
  const serialized = stableStringify(value, 2);
  const digest = sha256(serialized);
  const target = path.join(
    knowledgeGraphStoreRoot(pointerPath),
    "objects",
    digest.slice(0, 2),
    `${digest}.json`,
  );
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, serialized, { flag: "wx" }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  return digest;
}

async function storedObjectDigests(pointerPath) {
  const objectsRoot = path.join(knowledgeGraphStoreRoot(pointerPath), "objects");
  const prefixes = await fs.readdir(objectsRoot, { withFileTypes: true });
  const digests = [];
  for (const prefix of prefixes.filter((entry) => entry.isDirectory())) {
    const files = await fs.readdir(path.join(objectsRoot, prefix.name));
    digests.push(...files.filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length)));
  }
  return digests.sort();
}

async function collectResolutionEdges(snapshot, index) {
  const edges = [];
  for await (const shard of readKnowledgeGraphResolutionShards(snapshot, index)) {
    edges.push(...shard.edges);
  }
  return edges;
}

async function publishLegacyV1Snapshot(pointerPath, snapshot, index, edges) {
  const resolutionShardDigest = await writeStoredObject(pointerPath, {
    schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
    repositoryId,
    nodes: [],
    edges,
  });
  const legacySources = [];
  for (const entry of index.sources) {
    const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
    const shardDigest = await writeStoredObject(pointerPath, shard);
    const {
      bundleDigest: _bundleDigest,
      bundleBytes: _bundleBytes,
      sourceArtifactBytes: _sourceArtifactBytes,
      sourceArtifactRecords: _sourceArtifactRecords,
      nodePartCount: _nodePartCount,
      edgePartCount: _edgePartCount,
      maxPartBytes: _maxPartBytes,
      ...legacyEntry
    } = entry;
    legacySources.push({
      ...legacyEntry,
      shardDigest,
      shardBytes: Buffer.byteLength(stableStringify(shard, 2)),
    });
  }
  const { resolutionShardDigests: _digests, ...indexWithoutDigests } = index;
  const legacyIndexDigest = await writeStoredObject(pointerPath, {
    ...indexWithoutDigests,
    schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
    sources: legacySources,
    resolutionShardDigest,
  });
  const manifest = {
    ...snapshot.manifest,
    schema: KNOWLEDGE_GRAPH_MANIFEST_SCHEMA,
    repositories: snapshot.manifest.repositories.map((repository) => (
      repository.repositoryId === repositoryId
        ? { ...repository, indexDigest: legacyIndexDigest }
        : repository
    )),
  };
  const manifestDigest = await writeStoredObject(pointerPath, manifest);
  await fs.writeFile(pointerPath, stableStringify({
    schema: KNOWLEDGE_GRAPH_POINTER_SCHEMA,
    graphId: snapshot.pointer.graphId,
    snapshotDigest: manifestDigest,
    manifestDigest,
  }, 2));
}

test("repository resolution indexes premise targets once and preserves stable premise evidence", () => {
  const fixture = resolutionFixture();
  const resolved = buildRepositoryScopedResolutionEdges(fixture.sources, fixture.fragments);
  const edges = resolved.get(repositoryId);
  assert.equal(edges.length, 32);
  assert.ok(fixture.targetReads.count <= 32 * 4, `target read ${fixture.targetReads.count} times`);
  const first = edges.find((edge) => edge.source === "dependency:0");
  assert.equal(first.properties["evidence:lineStart"], 2);
  assert.deepEqual(first.properties["evidence:premiseEdgeIds"], ["premise:0:a", "premise:0:z"]);
});

test("repository resolution applies one shared derived-edge cap", () => {
  const fixture = resolutionFixture(2);
  assert.throws(
    () => buildRepositoryScopedResolutionEdges(fixture.sources, fixture.fragments, { maxEdges: 1 }),
    (error) => error?.code === "resolution_edge_limit_exceeded"
      && error?.details?.maxEdges === 1,
  );
});

test("repository index resolution fields are exact, unique, and bounded by schema", () => {
  const digest = "a".repeat(64);
  const common = {
    repositoryId,
    sources: [],
    graph: { nodes: 0, edges: 0 },
  };
  assert.deepEqual(resolutionShardDigestsForIndex({
    ...common,
    schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
    resolutionShardDigest: digest,
  }), [digest]);
  assert.deepEqual(resolutionShardDigestsForIndex({
    ...common,
    schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
    resolutionShardDigests: [digest],
  }), [digest]);
  assert.deepEqual(resolutionShardDigestsForIndex({
    ...common,
    schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
    resolutionShardDigests: [digest],
  }), [digest]);
  for (const index of [
    {
      ...common,
      schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
      resolutionShardDigest: digest,
      resolutionShardDigests: [digest],
    },
    {
      ...common,
      schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
      resolutionShardDigest: digest,
      resolutionShardDigests: [digest],
    },
    {
      ...common,
      schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
      resolutionShardDigests: [digest, digest],
    },
    {
      ...common,
      schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
      resolutionShardDigests: Array(MAX_RESOLUTION_SHARD_DIGESTS + 1).fill(digest),
    },
  ]) {
    assert.throws(
      () => resolutionShardDigestsForIndex(index),
      (error) => error?.code === "repository_index_invalid",
    );
  }
});

test("one oversized resolution edge fails with a typed per-object error", () => {
  assert.throws(
    () => partitionResolutionEdges([{
      id: "edge:oversized",
      payload: "x".repeat(MAX_RESOLUTION_SHARD_BYTES),
    }]),
    (error) => error?.code === "artifact_too_large"
      && error?.details?.edgeId === "edge:oversized"
      && error?.details?.maxBytes === MAX_RESOLUTION_SHARD_BYTES,
  );
});

test("ambiguous SQL resolution bounds candidate evidence and derived bytes", () => {
  const candidateCount = 1_000;
  const relativePath = "schema.sql";
  const referenceId = "sql-reference:shared";
  const tables = Array.from({ length: candidateCount }, (_, index) => ({
    id: `sql-table:${String(index).padStart(4, "0")}`,
    type: "SqlTable",
    label: `schema_${index}.shared`,
    properties: {
      "corpus:sourcePath": relativePath,
      "sql:qualifiedName": `schema_${index}.shared`,
    },
  }));
  const sources = [source(relativePath)];
  const fragments = new Map([[
    relativePath,
    {
      nodes: [
        sourceNode(relativePath),
        ...tables,
        {
          id: referenceId,
          type: "SqlTableReference",
          label: "shared",
          properties: {
            "corpus:sourcePath": relativePath,
            "sql:qualifiedName": "shared",
          },
        },
      ],
      edges: [],
    },
  ]]);
  const resolved = buildRepositoryScopedResolutionEdges(sources, fragments, {
    maxResolutionBytes: 32_000_000,
    maxResolutionRecords: 2_000,
  });
  const edges = resolved.get(repositoryId);
  assert.equal(edges.length, candidateCount);
  for (const edge of edges) {
    assert.equal(edge.properties["evidence:candidateCount"], candidateCount);
    assert.ok(edge.properties["evidence:candidateIds"].length <= 64);
    assert.ok(edge.properties["evidence:candidateIds"].includes(edge.target));
  }

  assert.throws(
    () => buildRepositoryScopedResolutionEdges(sources, fragments, {
      maxResolutionBytes: 1_000,
      maxResolutionRecords: 2_000,
    }),
    (error) => error?.code === "resolution_byte_limit_exceeded"
      && error?.details?.recordKind === "derived-edge",
  );
});

test("resolution edges persist and read in deterministic bounded shards", async (t) => {
  const fixture = resolutionFixture(40);
  const edges = buildRepositoryScopedResolutionEdges(fixture.sources, fixture.fragments)
    .get(repositoryId);
  const chunks = partitionResolutionEdges(edges, { targetBytes: 4_000 });
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.flat().map((edge) => edge.id), edges.map((edge) => edge.id));

  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-resolution-shards-"));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const pointerPath = path.join(outputRoot, "graphs", "fixture.json");
  const graphId = `kg:graph:${"a".repeat(32)}`;
  const sourceEntries = [];
  for (const sourceValue of fixture.sources) {
    sourceEntries.push(await writeKnowledgeGraphSourceShard(
      pointerPath,
      { ...sourceValue, byteSize: 1, kind: "code", status: "ready" },
      {
        ...fixture.fragments.get(sourceValue.relativePath),
        diagnostics: [],
        parserId: "fixture",
        parserVersion: "1",
        status: "parsed",
        edges: [],
      },
      { allowedRoot: outputRoot },
    ));
  }
  const snapshotInput = {
    graphId,
    sourceEntries,
    derivedEdgesByRepository: new Map([[repositoryId, edges]]),
    diagnostics: [],
    rootContentHash: sha256("root"),
    admission: { complete: true, counts: {} },
    completeness: { complete: true, incompleteSources: [], reasons: [] },
    parserRegistryDigest: sha256("registry"),
  };
  const writeOptions = {
    allowedRoot: outputRoot,
    resolutionShardTargetBytes: 4_000,
  };
  const snapshot = await writeKnowledgeGraphSnapshotAtomic(
    pointerPath,
    snapshotInput,
    writeOptions,
  );
  const index = await readKnowledgeGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  assert.ok(index.resolutionShardDigests.length > 1);
  const storedEdges = await collectResolutionEdges(snapshot, index);
  assert.deepEqual(storedEdges.map((edge) => edge.id), edges.map((edge) => edge.id));
  const materialized = await materializeKnowledgeGraphRepository(snapshot, repositoryId);
  assert.deepEqual(materialized.edges.map((edge) => edge.id), edges.map((edge) => edge.id));
  const lastEdgeId = edges.at(-1).id;
  const projection = await projectKnowledgeGraphSnapshot(snapshot, 200);
  assert.ok(projection.graphData.edges.some((edge) => edge.id === lastEdgeId));
  const search = await queryKnowledgeGraphSnapshot(snapshot, {
    mode: "search",
    query: lastEdgeId,
    limit: 200,
  });
  assert.ok(search.results.edges.some((entry) => entry.edge.id === lastEdgeId));
  const explanation = await explainKnowledgeGraphSnapshotEdge(snapshot, lastEdgeId);
  assert.equal(explanation.edge.id, lastEdgeId);

  const canonicalShardDigests = [...index.resolutionShardDigests];
  const repeated = await writeKnowledgeGraphSnapshotAtomic(pointerPath, {
    ...snapshotInput,
    derivedEdgesByRepository: new Map([[repositoryId, [...edges].reverse()]]),
  }, writeOptions);
  assert.equal(repeated.pointer.snapshotDigest, snapshot.pointer.snapshotDigest);
  const repeatedIndex = await readKnowledgeGraphRepositoryIndex(
    repeated,
    repeated.manifest.repositories[0],
  );
  assert.deepEqual(repeatedIndex.resolutionShardDigests, canonicalShardDigests);

  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      resolutionShardDigests: [
        index.resolutionShardDigests[0],
        index.resolutionShardDigests[0],
      ],
    }),
    (error) => error?.code === "resolution_shard_invalid",
  );
  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      resolutionShardDigests: [...index.resolutionShardDigests].reverse(),
    }),
    (error) => error?.code === "resolution_shard_invalid",
  );
  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      graph: { ...index.graph, edges: index.graph.edges + 1 },
    }),
    (error) => error?.code === "resolution_shard_invalid",
  );

  const invalidNodeDigest = await writeStoredObject(pointerPath, {
    schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
    repositoryId,
    nodes: [sourceNode("invalid.ts")],
    edges: [],
  });
  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      graph: { ...index.graph, edges: 0 },
      resolutionShardDigests: [invalidNodeDigest],
    }),
    (error) => error?.code === "resolution_shard_invalid",
  );
  const invalidEvidenceEdge = {
    ...edges[0],
    properties: { ...edges[0].properties },
  };
  delete invalidEvidenceEdge.properties["evidence:excerptHash"];
  const invalidEvidenceDigest = await writeStoredObject(pointerPath, {
    schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
    repositoryId,
    nodes: [],
    edges: [invalidEvidenceEdge],
  });
  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      graph: { ...index.graph, edges: 1 },
      resolutionShardDigests: [invalidEvidenceDigest],
    }),
    (error) => error?.code === "edge_evidence_invalid",
  );
  const duplicateEdgeDigests = await Promise.all([
    writeStoredObject(pointerPath, {
      schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
      repositoryId,
      nodes: [],
      edges: [edges[0]],
    }),
    writeStoredObject(pointerPath, {
      schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
      repositoryId,
      nodes: [],
      edges: [{
        ...edges[0],
        properties: { ...edges[0].properties, "fixture:copy": true },
      }],
    }),
  ]);
  await assert.rejects(
    collectResolutionEdges(snapshot, {
      ...index,
      graph: { ...index.graph, edges: 2 },
      resolutionShardDigests: duplicateEdgeDigests,
    }),
    (error) => error?.code === "resolution_shard_invalid",
  );

  const pointerBeforeRollback = await fs.readFile(pointerPath, "utf8");
  const objectsBeforeRollback = await storedObjectDigests(pointerPath);
  const changedEdges = edges.map((edge) => ({
    ...edge,
    properties: { ...edge.properties, "fixture:rollback": true },
  }));
  let transaction;
  let maximumCreated = 0;
  const abortAfterMultipleShards = {
    get aborted() {
      maximumCreated = Math.max(
        maximumCreated,
        transaction?.createdDigests?.size || 0,
      );
      return maximumCreated >= 2;
    },
  };
  await assert.rejects(
    runKnowledgeGraphObjectTransaction(
      pointerPath,
      { allowedRoot: outputRoot },
      async (objectTransaction) => {
        transaction = objectTransaction;
        await writeKnowledgeGraphSnapshotAtomic(
          pointerPath,
          {
            ...snapshotInput,
            derivedEdgesByRepository: new Map([[repositoryId, changedEdges]]),
          },
          {
            ...writeOptions,
            abortSignal: abortAfterMultipleShards,
            objectTransaction,
          },
        );
      },
    ),
    (error) => error?.code === "aborted",
  );
  assert.ok(maximumCreated >= 2);
  assert.equal(await fs.readFile(pointerPath, "utf8"), pointerBeforeRollback);
  assert.deepEqual(await storedObjectDigests(pointerPath), objectsBeforeRollback);
  const afterRollback = await collectResolutionEdges(snapshot, index);
  assert.deepEqual(afterRollback.map((edge) => edge.id), edges.map((edge) => edge.id));

  await publishLegacyV1Snapshot(pointerPath, snapshot, index, edges);
  const legacySnapshot = await readKnowledgeGraphSnapshot(pointerPath, {
    allowedRoot: outputRoot,
    expectedGraphId: graphId,
  });
  const legacyIndex = await readKnowledgeGraphRepositoryIndex(
    legacySnapshot,
    legacySnapshot.manifest.repositories[0],
  );
  assert.equal(legacyIndex.schema, KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1);
  assert.deepEqual(
    (await collectResolutionEdges(legacySnapshot, legacyIndex)).map((edge) => edge.id),
    edges.map((edge) => edge.id),
  );
  const legacyMaterialized = await materializeKnowledgeGraphRepository(
    legacySnapshot,
    repositoryId,
  );
  assert.deepEqual(legacyMaterialized.edges.map((edge) => edge.id), edges.map((edge) => edge.id));
  const legacySearch = await queryKnowledgeGraphSnapshot(legacySnapshot, {
    mode: "search",
    query: lastEdgeId,
    limit: 200,
  });
  assert.ok(legacySearch.results.edges.some((entry) => entry.edge.id === lastEdgeId));
  const legacyExplanation = await explainKnowledgeGraphSnapshotEdge(
    legacySnapshot,
    lastEdgeId,
  );
  assert.equal(legacyExplanation.edge.id, lastEdgeId);
  const legacyObjectsBeforeRollback = await storedObjectDigests(pointerPath);
  await assert.rejects(
    runKnowledgeGraphObjectTransaction(
      pointerPath,
      { allowedRoot: outputRoot },
      async (objectTransaction) => {
        const changedSource = {
          ...fixture.sources[0],
          byteSize: 3,
          contentHash: sha256("legacy-rollback"),
          kind: "code",
          status: "ready",
        };
        await writeKnowledgeGraphSourceShard(
          pointerPath,
          changedSource,
          {
            ...fixture.fragments.get(changedSource.relativePath),
            diagnostics: [],
            parserId: "fixture",
            parserVersion: "1",
            status: "parsed",
            edges: [],
          },
          { allowedRoot: outputRoot, objectTransaction },
        );
        throw new Error("legacy fixture rollback");
      },
    ),
    /legacy fixture rollback/,
  );
  assert.deepEqual(await storedObjectDigests(pointerPath), legacyObjectsBeforeRollback);
  assert.deepEqual(
    (await collectResolutionEdges(legacySnapshot, legacyIndex)).map((edge) => edge.id),
    edges.map((edge) => edge.id),
  );
});
