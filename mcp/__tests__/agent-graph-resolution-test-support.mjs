import fs from "node:fs/promises";
import path from "node:path";

import {
  LEGACY_AGENT_GRAPH_SCHEMA_VERSION,
  sha256,
  stableStringify,
} from "../agent-graph/contract.mjs";
import {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA,
  LEGACY_AGENT_GRAPH_POINTER_SCHEMA,
  LEGACY_AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
  LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA,
  agentGraphStoreRoot,
  readAgentGraphResolutionShards,
  readAgentGraphSourceShard,
} from "../agent-graph/store.mjs";

export const repositoryId = "repository:fixture";
const repositoryPath = ".";

export function source(relativePath) {
  return {
    relativePath,
    contentHash: sha256(relativePath),
    repositoryId,
    repositoryPath,
  };
}

export function sourceNode(relativePath) {
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

export function resolutionFixture(importCount = 32) {
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

export async function writeStoredObject(pointerPath, value) {
  const serialized = stableStringify(value, 2);
  const digest = sha256(serialized);
  const target = path.join(
    agentGraphStoreRoot(pointerPath),
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

export async function storedObjectDigests(pointerPath) {
  const objectsRoot = path.join(agentGraphStoreRoot(pointerPath), "objects");
  const prefixes = await fs.readdir(objectsRoot, { withFileTypes: true });
  const digests = [];
  for (const prefix of prefixes.filter((entry) => entry.isDirectory())) {
    const files = await fs.readdir(path.join(objectsRoot, prefix.name));
    digests.push(...files.filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length)));
  }
  return digests.sort();
}

export async function collectResolutionEdges(snapshot, index) {
  const edges = [];
  for await (const shard of readAgentGraphResolutionShards(snapshot, index)) {
    edges.push(...shard.edges);
  }
  return edges;
}

export async function publishLegacyV1Snapshot(pointerPath, snapshot, index, edges) {
  const resolutionShardDigest = await writeStoredObject(pointerPath, {
    schema: LEGACY_AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
    repositoryId,
    nodes: [],
    edges,
  });
  const legacySources = [];
  for (const entry of index.sources) {
    const shard = await readAgentGraphSourceShard(snapshot, entry);
    const legacyShard = { ...shard, schema: LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA };
    const shardDigest = await writeStoredObject(pointerPath, legacyShard);
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
      shardBytes: Buffer.byteLength(stableStringify(legacyShard, 2)),
    });
  }
  const { resolutionShardDigests: _digests, ...indexWithoutDigests } = index;
  const legacyIndexDigest = await writeStoredObject(pointerPath, {
    ...indexWithoutDigests,
    schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
    sources: legacySources,
    resolutionShardDigest,
  });
  const manifest = {
    ...snapshot.manifest,
    schema: LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA,
    schemaVersion: LEGACY_AGENT_GRAPH_SCHEMA_VERSION,
    repositories: snapshot.manifest.repositories.map((repository) => (
      repository.repositoryId === repositoryId
        ? { ...repository, indexDigest: legacyIndexDigest }
        : repository
    )),
  };
  const manifestDigest = await writeStoredObject(pointerPath, manifest);
  await fs.writeFile(pointerPath, stableStringify({
    schema: LEGACY_AGENT_GRAPH_POINTER_SCHEMA,
    graphId: snapshot.pointer.graphId,
    snapshotDigest: manifestDigest,
    manifestDigest,
  }, 2));
}
