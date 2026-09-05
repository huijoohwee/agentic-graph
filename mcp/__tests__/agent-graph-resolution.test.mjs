import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { computeAgentGraphArtifactDigest, sha256, validateAgentGraphArtifact } from "../agent-graph/contract.mjs";
import { materializeAgentGraphRepository } from "../agent-graph/materialize.mjs";
import {
  explainAgentGraphSnapshotEdge,
  projectAgentGraphSnapshot,
  queryAgentGraphSnapshot,
} from "../agent-graph/query.mjs";
import { runAgentGraphObjectTransaction } from "../agent-graph/object-transaction.mjs";
import { buildRepositoryScopedResolutionEdges } from "../agent-graph/resolution.mjs";
import {
  MAX_RESOLUTION_SHARD_BYTES,
  partitionResolutionEdges,
} from "../agent-graph/resolution-sharding.mjs";
import {
  MAX_RESOLUTION_SHARD_DIGESTS,
  resolutionShardDigestsForIndex,
} from "../agent-graph/resolution-store-validation.mjs";
import {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
  AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
  readAgentGraphRepositoryIndex,
  readAgentGraphSnapshot,
  writeAgentGraphSnapshotAtomic,
  writeAgentGraphSourceShard,
} from "../agent-graph/store.mjs";
import {
  collectResolutionEdges,
  publishLegacyV1Snapshot,
  repositoryId,
  resolutionFixture,
  source,
  sourceNode,
  storedObjectDigests,
  writeStoredObject,
} from "./agent-graph-resolution-test-support.mjs";
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
    schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
    resolutionShardDigest: digest,
  }), [digest]);
  assert.deepEqual(resolutionShardDigestsForIndex({
    ...common,
    schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
    resolutionShardDigests: [digest],
  }), [digest]);
  assert.deepEqual(resolutionShardDigestsForIndex({
    ...common,
    schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
    resolutionShardDigests: [digest],
  }), [digest]);
  for (const index of [
    {
      ...common,
      schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
      resolutionShardDigest: digest,
      resolutionShardDigests: [digest],
    },
    {
      ...common,
      schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
      resolutionShardDigest: digest,
      resolutionShardDigests: [digest],
    },
    {
      ...common,
      schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
      resolutionShardDigests: [digest, digest],
    },
    {
      ...common,
      schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
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

  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-resolution-shards-"));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const pointerPath = path.join(outputRoot, "graphs", "fixture.json");
  const graphId = `kg:graph:${"a".repeat(32)}`;
  const sourceEntries = [];
  for (const sourceValue of fixture.sources) {
    sourceEntries.push(await writeAgentGraphSourceShard(
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
  const snapshot = await writeAgentGraphSnapshotAtomic(
    pointerPath,
    snapshotInput,
    writeOptions,
  );
  const index = await readAgentGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  assert.ok(index.resolutionShardDigests.length > 1);
  const storedEdges = await collectResolutionEdges(snapshot, index);
  assert.deepEqual(storedEdges.map((edge) => edge.id), edges.map((edge) => edge.id));
  const materialized = await materializeAgentGraphRepository(snapshot, repositoryId);
  assert.deepEqual(materialized.edges.map((edge) => edge.id), edges.map((edge) => edge.id));
  assert.equal(materialized.metadata.agentGraph.snapshotDigest, snapshot.pointer.snapshotDigest);
  assert.equal(materialized.metadata.agentGraph.digest, computeAgentGraphArtifactDigest(materialized));
  assert.notEqual(materialized.metadata.agentGraph.digest, materialized.metadata.agentGraph.snapshotDigest);
  assert.deepEqual(Object.keys(materialized.metadata), ["agentGraph"]);
  assert.equal(validateAgentGraphArtifact(materialized).ok, true);
  const lastEdgeId = edges.at(-1).id;
  const projection = await projectAgentGraphSnapshot(snapshot, 200);
  assert.ok(projection.graphData.edges.some((edge) => edge.id === lastEdgeId));
  const search = await queryAgentGraphSnapshot(snapshot, {
    mode: "search",
    query: lastEdgeId,
    limit: 200,
  });
  assert.ok(search.results.edges.some((entry) => entry.edge.id === lastEdgeId));
  const explanation = await explainAgentGraphSnapshotEdge(snapshot, lastEdgeId);
  assert.equal(explanation.edge.id, lastEdgeId);

  const canonicalShardDigests = [...index.resolutionShardDigests];
  const repeated = await writeAgentGraphSnapshotAtomic(pointerPath, {
    ...snapshotInput,
    derivedEdgesByRepository: new Map([[repositoryId, [...edges].reverse()]]),
  }, writeOptions);
  assert.equal(repeated.pointer.snapshotDigest, snapshot.pointer.snapshotDigest);
  const repeatedIndex = await readAgentGraphRepositoryIndex(
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
    schema: AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
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
    schema: AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
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
      schema: AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
      repositoryId,
      nodes: [],
      edges: [edges[0]],
    }),
    writeStoredObject(pointerPath, {
      schema: AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
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
    runAgentGraphObjectTransaction(
      pointerPath,
      { allowedRoot: outputRoot },
      async (objectTransaction) => {
        transaction = objectTransaction;
        await writeAgentGraphSnapshotAtomic(
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
  const legacySnapshot = await readAgentGraphSnapshot(pointerPath, {
    allowedRoot: outputRoot,
    expectedGraphId: graphId,
  });
  const legacyIndex = await readAgentGraphRepositoryIndex(
    legacySnapshot,
    legacySnapshot.manifest.repositories[0],
  );
  assert.equal(legacyIndex.schema, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1);
  await assert.rejects(
    collectResolutionEdges(snapshot, legacyIndex),
    (error) => error?.code === "resolution_shard_invalid",
  );
  assert.deepEqual(
    (await collectResolutionEdges(legacySnapshot, legacyIndex)).map((edge) => edge.id),
    edges.map((edge) => edge.id),
  );
  const legacyMaterialized = await materializeAgentGraphRepository(
    legacySnapshot,
    repositoryId,
  );
  assert.deepEqual(legacyMaterialized.edges.map((edge) => edge.id), edges.map((edge) => edge.id));
  const legacySearch = await queryAgentGraphSnapshot(legacySnapshot, {
    mode: "search",
    query: lastEdgeId,
    limit: 200,
  });
  assert.ok(legacySearch.results.edges.some((entry) => entry.edge.id === lastEdgeId));
  const legacyExplanation = await explainAgentGraphSnapshotEdge(
    legacySnapshot,
    lastEdgeId,
  );
  assert.equal(legacyExplanation.edge.id, lastEdgeId);
  const legacyObjectsBeforeRollback = await storedObjectDigests(pointerPath);
  await assert.rejects(
    runAgentGraphObjectTransaction(
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
        await writeAgentGraphSourceShard(
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
