import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256, stableStringify } from "../knowledge-graph/contract.mjs";
import { runKnowledgeGraphObjectTransaction } from "../knowledge-graph/object-transaction.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";
import {
  KNOWLEDGE_GRAPH_POINTER_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
  knowledgeGraphStoreRoot,
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceBundle,
  readKnowledgeGraphSourceParts,
  readKnowledgeGraphSourceShard,
  writeKnowledgeGraphSnapshotAtomic,
  writeKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

async function fixture(t, options = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-kg-source-sharding-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createKnowledgeGraphRuntime({
    agenticgraphRoot: base,
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

function objectPath(graphPointer, digest) {
  return path.join(
    knowledgeGraphStoreRoot(graphPointer),
    "objects",
    digest.slice(0, 2),
    `${digest}.json`,
  );
}

async function writeStoredObject(graphPointer, value) {
  const serialized = stableStringify(value, 2);
  const digest = sha256(serialized);
  const target = objectPath(graphPointer, digest);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, serialized, { flag: "wx" }).catch((error) => {
    if (error?.code !== "EEXIST") throw error;
  });
  return { digest, bytes: Buffer.byteLength(serialized) };
}

async function storedObjectDigests(graphPointer) {
  const objectsRoot = path.join(knowledgeGraphStoreRoot(graphPointer), "objects");
  const prefixes = await fs.readdir(objectsRoot, { withFileTypes: true });
  const digests = [];
  for (const prefix of prefixes.filter((entry) => entry.isDirectory())) {
    const names = await fs.readdir(path.join(objectsRoot, prefix.name));
    digests.push(...names.filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length)));
  }
  return digests.sort();
}

async function publishChangedBundle(graphPointer, snapshot, index, changedBundle) {
  const storedBundle = await writeStoredObject(graphPointer, changedBundle);
  const changedSource = {
    ...index.sources[0],
    bundleDigest: storedBundle.digest,
    bundleBytes: storedBundle.bytes,
    sourceArtifactBytes: changedBundle.partsBytes + storedBundle.bytes,
    maxPartBytes: Math.max(
      0,
      ...changedBundle.nodeParts.map((part) => part.bytes),
      ...changedBundle.edgeParts.map((part) => part.bytes),
    ),
  };
  const storedIndex = await writeStoredObject(graphPointer, {
    ...index,
    sources: [changedSource, ...index.sources.slice(1)],
  });
  const changedManifest = {
    ...snapshot.manifest,
    repositories: snapshot.manifest.repositories.map((repository) => (
      repository.repositoryId === index.repositoryId
        ? { ...repository, indexDigest: storedIndex.digest }
        : repository
    )),
  };
  const storedManifest = await writeStoredObject(graphPointer, changedManifest);
  await fs.writeFile(graphPointer, stableStringify({
    schema: KNOWLEDGE_GRAPH_POINTER_SCHEMA,
    graphId: snapshot.pointer.graphId,
    snapshotDigest: storedManifest.digest,
    manifestDigest: storedManifest.digest,
  }, 2));
}

async function publishLegacyV2Snapshot(graphPointer, snapshot, index) {
  const legacySources = [];
  for (const entry of index.sources) {
    const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
    const storedShard = await writeStoredObject(graphPointer, shard);
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
      shardDigest: storedShard.digest,
      shardBytes: storedShard.bytes,
    });
  }
  const storedIndex = await writeStoredObject(graphPointer, {
    ...index,
    schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
    sources: legacySources,
  });
  const legacyManifest = {
    ...snapshot.manifest,
    repositories: snapshot.manifest.repositories.map((repository) => (
      repository.repositoryId === index.repositoryId
        ? { ...repository, indexDigest: storedIndex.digest }
        : repository
    )),
  };
  const storedManifest = await writeStoredObject(graphPointer, legacyManifest);
  await fs.writeFile(graphPointer, stableStringify({
    schema: KNOWLEDGE_GRAPH_POINTER_SCHEMA,
    graphId: snapshot.pointer.graphId,
    snapshotDigest: storedManifest.digest,
    manifestDigest: storedManifest.digest,
  }, 2));
  return storedManifest.digest;
}

test("source and snapshot artifact budgets fail closed and roll back every child object", async (t) => {
  const value = await fixture(t);
  const sourcePath = path.join(value.corpusRoot, "doc.md");
  await fs.writeFile(sourcePath, "# Baseline\n");
  const baseline = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(baseline.ok, true, JSON.stringify(baseline));
  const graphPointer = pointerPath(value, baseline.graphId);
  const pointerBefore = await fs.readFile(graphPointer, "utf8");
  const objectsBefore = await storedObjectDigests(graphPointer);
  const cases = [
    {
      code: "source_artifact_record_limit_exceeded",
      options: { maxSourceArtifactRecords: 1 },
    },
    {
      code: "source_artifact_byte_limit_exceeded",
      options: { maxSourceArtifactBytes: 1_000 },
    },
    {
      code: "snapshot_artifact_record_limit_exceeded",
      options: { maxSnapshotArtifactRecords: 1 },
    },
    {
      code: "snapshot_artifact_byte_limit_exceeded",
      options: { maxSnapshotArtifactBytes: 1_000 },
    },
    {
      code: "snapshot_source_part_limit_exceeded",
      options: { maxSnapshotSourceParts: 1 },
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    await fs.writeFile(
      sourcePath,
      `# Changed ${index}\n${Array.from({ length: 8 }, (_, line) => `line ${line}`).join("\n")}\n`,
    );
    const runtime = createKnowledgeGraphRuntime({
      agenticgraphRoot: value.base,
      allowedRoots: [value.corpusRoot],
      outputRoot: value.outputRoot,
      maxSourceShardBytes: 8_192,
      maxSourcePartTargetBytes: 4_096,
      ...cases[index].options,
    });
    const result = await runtime.ingest({ rootPath: value.corpusRoot, strict: true });
    assert.equal(result.ok, false, `${cases[index].code}: ${JSON.stringify(result)}`);
    assert.equal(result.error.code, cases[index].code);
    assert.equal(await fs.readFile(graphPointer, "utf8"), pointerBefore);
    assert.deepEqual(await storedObjectDigests(graphPointer), objectsBefore);
  }
});

test("invalid source-bound evidence is rejected before any object or pointer publication", async (t) => {
  const value = await fixture(t);
  await fs.writeFile(path.join(value.corpusRoot, "evidence.md"), "# Evidence\nBody\n");
  const baseline = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(baseline.ok, true, JSON.stringify(baseline));
  const graphPointer = pointerPath(value, baseline.graphId);
  const pointerBefore = await fs.readFile(graphPointer, "utf8");
  const objectsBefore = await storedObjectDigests(graphPointer);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: baseline.graphId,
  });
  const index = await readKnowledgeGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  const entry = index.sources[0];
  const shard = await readKnowledgeGraphSourceShard(snapshot, entry);
  const invalidFragment = structuredClone(shard);
  invalidFragment.edges[0].properties["evidence:sourcePath"] = "forged.md";
  await assert.rejects(
    runKnowledgeGraphObjectTransaction(
      graphPointer,
      { allowedRoot: value.outputRoot },
      (objectTransaction) => writeKnowledgeGraphSourceShard(
        graphPointer,
        {
          relativePath: entry.sourcePath,
          contentHash: entry.contentHash,
          byteSize: entry.byteSize,
          kind: entry.kind,
          repositoryId: entry.repositoryId,
          repositoryPath: entry.repositoryPath,
        },
        invalidFragment,
        {
          allowedRoot: value.outputRoot,
          objectTransaction,
        },
      ),
    ),
    (error) => error?.code === "edge_evidence_invalid",
  );
  await assert.rejects(
    runKnowledgeGraphObjectTransaction(
      graphPointer,
      { allowedRoot: value.outputRoot },
      (objectTransaction) => writeKnowledgeGraphSourceShard(
        graphPointer,
        {
          relativePath: entry.sourcePath,
          contentHash: entry.contentHash,
          byteSize: entry.byteSize,
          kind: entry.kind,
          repositoryId: entry.repositoryId,
          repositoryPath: entry.repositoryPath,
        },
        {
          parserId: entry.parserId,
          parserVersion: entry.parserVersion,
          status: "parsed",
          diagnostics: [],
          nodes: [{
            id: "oversized-node",
            type: "SourceFile",
            label: "oversized",
            properties: { content: "x".repeat(10_000) },
          }],
          edges: [],
        },
        {
          allowedRoot: value.outputRoot,
          objectTransaction,
          maxSourceShardBytes: 4_096,
        },
      ),
    ),
    (error) => error?.code === "source_record_too_large",
  );
  assert.equal(await fs.readFile(graphPointer, "utf8"), pointerBefore);
  assert.deepEqual(await storedObjectDigests(graphPointer), objectsBefore);
});

test("missing, reordered, and duplicated source parts fail closed", async (t) => {
  async function multipart() {
    const value = await fixture(t, {
      maxSourceShardBytes: 32_768,
      maxSourcePartTargetBytes: 16_384,
    });
    await fs.writeFile(
      path.join(value.corpusRoot, "large.md"),
      Array.from({ length: 160 }, (_, index) => `## Section ${index}\nparagraph ${index}`).join("\n"),
    );
    const ingest = await value.runtime.ingest({
      rootPath: value.corpusRoot,
      strict: true,
      projectionLimit: 1_000,
    });
    assert.equal(ingest.ok, true, JSON.stringify(ingest));
    const graphPointer = pointerPath(value, ingest.graphId);
    const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
      allowedRoot: value.outputRoot,
      expectedGraphId: ingest.graphId,
    });
    const index = await readKnowledgeGraphRepositoryIndex(
      snapshot,
      snapshot.manifest.repositories[0],
    );
    const bundle = await readKnowledgeGraphSourceBundle(snapshot, index.sources[0]);
    assert.ok(bundle.nodeParts.length >= 2);
    return { value, ingest, graphPointer, snapshot, index, bundle };
  }

  {
    const current = await multipart();
    await fs.unlink(objectPath(current.graphPointer, current.bundle.nodeParts[0].digest));
    const result = await current.value.runtime.query({
      graphId: current.ingest.graphId,
      expectedSnapshotDigest: current.ingest.snapshotDigest,
      mode: "search",
      query: "Section",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "snapshot_object_missing");
  }

  {
    const current = await multipart();
    const changed = structuredClone(current.bundle);
    [changed.nodeParts[0], changed.nodeParts[1]] = [
      { ...changed.nodeParts[1], ordinal: 0 },
      { ...changed.nodeParts[0], ordinal: 1 },
    ];
    await publishChangedBundle(current.graphPointer, current.snapshot, current.index, changed);
    const nextSnapshot = await readKnowledgeGraphSnapshot(current.graphPointer, {
      allowedRoot: current.value.outputRoot,
      expectedGraphId: current.ingest.graphId,
    });
    const nextIndex = await readKnowledgeGraphRepositoryIndex(
      nextSnapshot,
      nextSnapshot.manifest.repositories[0],
    );
    await assert.rejects(
      async () => {
        for await (const _part of readKnowledgeGraphSourceParts(
          nextSnapshot,
          nextIndex.sources[0],
        )) {
          assert.ok(_part);
        }
      },
      (error) => error?.code === "source_part_invalid",
    );
  }

  {
    const current = await multipart();
    const changed = structuredClone(current.bundle);
    changed.nodeParts[1].digest = changed.nodeParts[0].digest;
    await publishChangedBundle(current.graphPointer, current.snapshot, current.index, changed);
    const nextSnapshot = await readKnowledgeGraphSnapshot(current.graphPointer, {
      allowedRoot: current.value.outputRoot,
      expectedGraphId: current.ingest.graphId,
    });
    const nextIndex = await readKnowledgeGraphRepositoryIndex(
      nextSnapshot,
      nextSnapshot.manifest.repositories[0],
    );
    await assert.rejects(
      readKnowledgeGraphSourceBundle(nextSnapshot, nextIndex.sources[0]),
      (error) => error?.code === "source_part_invalid",
    );
  }

  {
    const current = await multipart();
    const descriptor = current.bundle.edgeParts[0];
    const edgePart = JSON.parse(await fs.readFile(
      objectPath(current.graphPointer, descriptor.digest),
      "utf8",
    ));
    edgePart.records[0].properties["evidence:sourcePath"] = "false-source.md";
    const storedPart = await writeStoredObject(current.graphPointer, edgePart);
    const changed = structuredClone(current.bundle);
    changed.edgeParts[0] = {
      ...changed.edgeParts[0],
      digest: storedPart.digest,
      bytes: storedPart.bytes,
    };
    changed.partsBytes = [...changed.nodeParts, ...changed.edgeParts]
      .reduce((total, part) => total + part.bytes, 0);
    await publishChangedBundle(current.graphPointer, current.snapshot, current.index, changed);
    const nextSnapshot = await readKnowledgeGraphSnapshot(current.graphPointer, {
      allowedRoot: current.value.outputRoot,
      expectedGraphId: current.ingest.graphId,
    });
    const nextIndex = await readKnowledgeGraphRepositoryIndex(
      nextSnapshot,
      nextSnapshot.manifest.repositories[0],
    );
    await assert.rejects(
      async () => {
        for await (const part of readKnowledgeGraphSourceParts(
          nextSnapshot,
          nextIndex.sources[0],
        )) {
          assert.ok(part);
        }
      },
      (error) => error?.code === "edge_evidence_invalid",
    );
  }
});

test("unchanged legacy source shards reparse once into a readable v3 bundle", async (t) => {
  const value = await fixture(t);
  await fs.writeFile(path.join(value.corpusRoot, "legacy.md"), "# Legacy\nBody\n");
  const initial = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(initial.ok, true, JSON.stringify(initial));
  const graphPointer = pointerPath(value, initial.graphId);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: initial.graphId,
  });
  const index = await readKnowledgeGraphRepositoryIndex(
    snapshot,
    snapshot.manifest.repositories[0],
  );
  const legacyDigest = await publishLegacyV2Snapshot(graphPointer, snapshot, index);
  const legacySnapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: initial.graphId,
  });
  const legacyIndex = await readKnowledgeGraphRepositoryIndex(
    legacySnapshot,
    legacySnapshot.manifest.repositories[0],
  );
  const pointerBeforeRejectedWrite = await fs.readFile(graphPointer, "utf8");
  await assert.rejects(
    writeKnowledgeGraphSnapshotAtomic(graphPointer, {
      graphId: initial.graphId,
      sourceEntries: legacyIndex.sources,
      derivedEdgesByRepository: new Map(),
      diagnostics: legacySnapshot.manifest.diagnostics,
      rootContentHash: legacySnapshot.manifest.rootContentHash,
      admission: legacySnapshot.manifest.admission,
      completeness: legacySnapshot.manifest.completeness,
      parserRegistryDigest: legacySnapshot.manifest.parserRegistryDigest,
    }, {
      allowedRoot: value.outputRoot,
    }),
    (error) => error?.code === "source_entry_invalid",
  );
  assert.equal(await fs.readFile(graphPointer, "utf8"), pointerBeforeRejectedWrite);

  const migrated = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(migrated.counts.parsed, 1);
  assert.equal(migrated.counts.reused, 0);
  assert.notEqual(migrated.snapshotDigest, legacyDigest);
  const migratedSnapshot = await readKnowledgeGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: migrated.graphId,
  });
  const migratedIndex = await readKnowledgeGraphRepositoryIndex(
    migratedSnapshot,
    migratedSnapshot.manifest.repositories[0],
  );
  assert.equal(migratedIndex.schema, KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA);
  await readKnowledgeGraphSourceBundle(migratedSnapshot, migratedIndex.sources[0]);

  const reused = await value.runtime.ingest({ rootPath: value.corpusRoot, strict: true });
  assert.equal(reused.ok, true, JSON.stringify(reused));
  assert.equal(reused.snapshotDigest, migrated.snapshotDigest);
  assert.equal(reused.counts.parsed, 0);
  assert.equal(reused.counts.reused, 1);
});
