import path from "node:path";
import {
  AgentGraphError, AGENT_GRAPH_SCHEMA_VERSION, LEGACY_AGENT_GRAPH_SCHEMA_VERSION,
  compareStableStrings,
} from "./contract.mjs";
import { MAX_RESOLUTION_SHARD_BYTES } from "./resolution-sharding.mjs";
import {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2, LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3,
  expectedResolutionEdgeCount, resolutionShardDigestsForIndex, validatedResolutionShards,
} from "./resolution-store-validation.mjs";
import {
  AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA, AGENT_GRAPH_SOURCE_PART_SCHEMA,
  LEGACY_AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA, LEGACY_AGENT_GRAPH_SOURCE_PART_SCHEMA,
  MAX_SOURCE_BUNDLE_BYTES, MAX_SOURCE_PART_BYTES,
  sourceArtifactByteLimit, sourceArtifactRecordLimit,
  sourcePartByteLimit, sourcePartCountLimit,
} from "./source-sharding.mjs";
import { assertExplainedEdges } from "./store-records.mjs";
import {
  AGENT_GRAPH_MANIFEST_SCHEMA, AGENT_GRAPH_POINTER_SCHEMA, AGENT_GRAPH_SOURCE_SHARD_SCHEMA,
  LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA, LEGACY_AGENT_GRAPH_POINTER_SCHEMA,
  LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA, MAX_MANIFEST_BYTES, MAX_OBJECT_BYTES,
  MAX_POINTER_BYTES,
} from "./store-schema.mjs";
import {
  assertExactPartKeys, assertSourcePartEdgeEvidence, hasOwn, invalidSourceEntry,
  invalidSourcePart, markSourceEntry, repositoryIndexFamily,
  requireSnapshotFamily, requireSourceEntryFamily, sameCanonicalValue,
  validateLegacySourceShard, validatePartDescriptors, validateSourceEntryStorage,
  validateRepositorySourceEntries,
} from "./store-validation.mjs";
import {
  agentGraphStoreRoot, attachReadBudget, checkStoreBudget,
  parseStoredJson, readContentAddressed, readStableText,
} from "./store-io.mjs";

export async function readAgentGraphSnapshot(pointerPath, options = {}) {
  const { allowedRoot, expectedGraphId } = options;
  if (!String(allowedRoot || "").trim()) {
    throw new AgentGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  const raw = await readStableText(pointerPath, {
    ...options,
    allowedRoot,
    maxBytes: MAX_POINTER_BYTES,
    missingCode: "graph_not_found",
  });
  const pointer = parseStoredJson(raw, "graph_pointer_invalid");
  const schemaFamily = pointer.schema === AGENT_GRAPH_POINTER_SCHEMA
    ? "canonical"
    : pointer.schema === LEGACY_AGENT_GRAPH_POINTER_SCHEMA ? "legacy" : "";
  if (!schemaFamily
    || !/^[a-f0-9]{64}$/.test(String(pointer.snapshotDigest || ""))
    || pointer.snapshotDigest !== pointer.manifestDigest) {
    throw new AgentGraphError("graph_pointer_invalid", "Knowledge graph current pointer is invalid.");
  }
  if (expectedGraphId && pointer.graphId !== expectedGraphId) {
    throw new AgentGraphError("graph_identity_mismatch", "Knowledge graph pointer does not match the requested graph identity.");
  }
  const storeRoot = agentGraphStoreRoot(pointerPath);
  const provisional = attachReadBudget({
    pointerPath,
    pointer,
    storeRoot,
    schemaFamily,
    allowedRoot: path.resolve(allowedRoot),
  }, options);
  const manifest = await readContentAddressed(provisional, pointer.manifestDigest, MAX_MANIFEST_BYTES);
  const manifestSchema = schemaFamily === "canonical"
    ? AGENT_GRAPH_MANIFEST_SCHEMA : LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA;
  const schemaVersion = schemaFamily === "canonical"
    ? AGENT_GRAPH_SCHEMA_VERSION : LEGACY_AGENT_GRAPH_SCHEMA_VERSION;
  if (manifest.schema !== manifestSchema || manifest.schemaVersion !== schemaVersion
    || manifest.graphId !== pointer.graphId) {
    throw new AgentGraphError("snapshot_manifest_invalid", "Knowledge graph snapshot manifest is invalid.");
  }
  return attachReadBudget({ ...provisional, manifest }, options);
}
export async function readAgentGraphSnapshotIfPresent(pointerPath, options = {}) {
  try {
    return await readAgentGraphSnapshot(pointerPath, options);
  } catch (error) {
    if (error instanceof AgentGraphError && error.code === "graph_not_found") return null;
    throw error;
  }
}
export async function readAgentGraphRepositoryIndex(snapshot, repository) {
  const snapshotFamily = requireSnapshotFamily(snapshot, "repository_index_invalid");
  const index = await readContentAddressed(snapshot, repository.indexDigest, MAX_MANIFEST_BYTES);
  const acceptedSchemas = snapshotFamily === "canonical"
    ? [AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA]
    : [LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3,
      AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1];
  if (!acceptedSchemas.includes(index.schema) || index.repositoryId !== repository.repositoryId) {
    throw new AgentGraphError("repository_index_invalid", `Repository index is invalid: ${repository.repositoryId}`);
  }
  validateRepositorySourceEntries(index);
  const family = index.schema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA ? "canonical" : "legacy";
  for (const entry of index.sources) markSourceEntry(entry, family);
  resolutionShardDigestsForIndex(index);
  expectedResolutionEdgeCount(index, repository);
  return index;
}
export async function readAgentGraphSourceBundle(snapshot, sourceEntry) {
  const sourceFamily = requireSourceEntryFamily(snapshot, sourceEntry);
  validateSourceEntryStorage(sourceEntry, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA);
  const bundle = await readContentAddressed(
    snapshot,
    sourceEntry.bundleDigest,
    MAX_SOURCE_BUNDLE_BYTES,
    {
      expectedBytes: sourceEntry.bundleBytes,
      sizeCode: "source_bundle_invalid",
      details: {
        sourcePath: sourceEntry.sourcePath,
        repositoryId: sourceEntry.repositoryId,
      },
    },
  );
  const bundleSchema = sourceFamily === "legacy"
    ? LEGACY_AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA : AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA;
  const identityMatches = bundle.schema === bundleSchema
    && bundle.repositoryId === sourceEntry.repositoryId
    && bundle.repositoryPath === sourceEntry.repositoryPath
    && bundle.sourcePath === sourceEntry.sourcePath
    && bundle.contentHash === sourceEntry.contentHash
    && bundle.parserId === sourceEntry.parserId
    && bundle.parserVersion === sourceEntry.parserVersion
    && bundle.status === sourceEntry.status;
  if (!identityMatches
    || bundle.nodeCount !== sourceEntry.nodeCount
    || bundle.edgeCount !== sourceEntry.edgeCount
    || !sameCanonicalValue(bundle.nodeTypes, sourceEntry.nodeTypes)
    || !sameCanonicalValue(bundle.edgeLabels, sourceEntry.edgeLabels)
    || !sameCanonicalValue(bundle.diagnostics, sourceEntry.diagnostics)) {
    throw invalidSourcePart(sourceEntry, "Source bundle identity or graph metadata is invalid");
  }
  const nodeCount = validatePartDescriptors(bundle.nodeParts, "nodes", sourceEntry);
  const edgeCount = validatePartDescriptors(bundle.edgeParts, "edges", sourceEntry);
  const allParts = [...bundle.nodeParts, ...bundle.edgeParts];
  const digests = allParts.map((part) => part.digest);
  const partsBytes = allParts.reduce((total, part) => total + part.bytes, 0);
  const maxPartBytes = Math.max(0, ...allParts.map((part) => part.bytes));
  const sourceArtifactRecords = nodeCount + edgeCount + bundle.diagnostics.length;
  if (nodeCount !== bundle.nodeCount
    || edgeCount !== bundle.edgeCount
    || bundle.nodeParts.length !== sourceEntry.nodePartCount
    || bundle.edgeParts.length !== sourceEntry.edgePartCount
    || digests.length > sourcePartCountLimit()
    || new Set(digests).size !== digests.length
    || bundle.partsBytes !== partsBytes
    || sourceEntry.sourceArtifactBytes !== sourceEntry.bundleBytes + partsBytes
    || sourceEntry.sourceArtifactRecords !== sourceArtifactRecords
    || sourceEntry.maxPartBytes !== maxPartBytes
    || sourceEntry.sourceArtifactBytes > sourceArtifactByteLimit()
    || sourceEntry.sourceArtifactRecords > sourceArtifactRecordLimit()
    || maxPartBytes > sourcePartByteLimit()) {
    throw invalidSourcePart(sourceEntry, "Source bundle counts, bytes, or digest order are invalid");
  }
  return bundle;
}
export async function* readAgentGraphSourceParts(snapshot, sourceEntry) {
  const sourceFamily = requireSourceEntryFamily(snapshot, sourceEntry);
  if (hasOwn(sourceEntry, "shardDigest")) {
    if (sourceFamily !== "legacy") invalidSourceEntry(sourceEntry, "Legacy source shards require a legacy snapshot");
    validateSourceEntryStorage(sourceEntry, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2);
    const shard = await readContentAddressed(snapshot, sourceEntry.shardDigest, MAX_OBJECT_BYTES, {
      expectedBytes: sourceEntry.shardBytes,
      sizeCode: "source_shard_invalid",
      details: {
        sourcePath: sourceEntry.sourcePath,
        repositoryId: sourceEntry.repositoryId,
      },
    });
    validateLegacySourceShard(shard, sourceEntry);
    yield shard;
    return;
  }
  const bundle = await readAgentGraphSourceBundle(snapshot, sourceEntry);
  const sequence = [
    ...bundle.nodeParts.map((descriptor) => ({ descriptor, kind: "nodes" })),
    ...bundle.edgeParts.map((descriptor) => ({ descriptor, kind: "edges" })),
  ];
  const nodeIds = new Set();
  let nodeCount = 0;
  let edgeCount = 0;
  let lastNodeId = "";
  let lastEdgeId = "";
  const actualNodeTypes = {};
  const actualEdgeLabels = {};
  let position = 0;
  let complete = false;
  let failed = false;
  const checkpoint = () => checkStoreBudget(snapshot.readBudget, "source-part-validation");
  const readNext = async () => {
    const current = sequence[position];
    const { descriptor, kind } = current;
    const part = await readContentAddressed(snapshot, descriptor.digest, MAX_SOURCE_PART_BYTES, {
      expectedBytes: descriptor.bytes,
      sizeCode: "source_part_invalid",
      details: {
        sourcePath: sourceEntry.sourcePath,
        repositoryId: sourceEntry.repositoryId,
        kind,
        ordinal: descriptor.ordinal,
      },
    });
    assertExactPartKeys(part, sourceEntry);
    const partSchema = sourceFamily === "legacy"
      ? LEGACY_AGENT_GRAPH_SOURCE_PART_SCHEMA : AGENT_GRAPH_SOURCE_PART_SCHEMA;
    if (part.schema !== partSchema
      || part.kind !== kind
      || part.repositoryId !== bundle.repositoryId
      || part.repositoryPath !== bundle.repositoryPath
      || part.sourcePath !== bundle.sourcePath
      || part.contentHash !== bundle.contentHash
      || part.parserId !== bundle.parserId
      || part.parserVersion !== bundle.parserVersion
      || part.status !== bundle.status
      || part.ordinal !== descriptor.ordinal
      || part.totalParts !== (kind === "nodes" ? bundle.nodeParts.length : bundle.edgeParts.length)
      || !Array.isArray(part.records)
      || part.records.length !== descriptor.count) {
      throw invalidSourcePart(sourceEntry, "Source part identity or count is invalid", {
        kind,
        ordinal: descriptor.ordinal,
      });
    }
    if (kind === "nodes") {
      for (const node of part.records) {
        checkpoint();
        const nodeId = String(node?.id || "");
        if (!nodeId || (lastNodeId && compareStableStrings(lastNodeId, nodeId) >= 0)) {
          throw invalidSourcePart(sourceEntry, "Source node part order or uniqueness is invalid", {
            kind,
            ordinal: descriptor.ordinal,
          });
        }
        lastNodeId = nodeId;
        nodeIds.add(nodeId);
        const nodeType = String(node?.type || "Entity");
        actualNodeTypes[nodeType] = (actualNodeTypes[nodeType] || 0) + 1;
        nodeCount += 1;
      }
    } else {
      assertExplainedEdges(part.records, nodeIds, checkpoint, {
        duplicateCode: "source_part_invalid",
      });
      for (const edge of part.records) {
        checkpoint();
        assertSourcePartEdgeEvidence(edge, bundle);
        if (lastEdgeId && compareStableStrings(lastEdgeId, edge.id) >= 0) {
          throw invalidSourcePart(sourceEntry, "Source edge part order or uniqueness is invalid", {
            kind,
            ordinal: descriptor.ordinal,
          });
        }
        lastEdgeId = edge.id;
        const edgeLabel = String(edge?.label || "relatedTo");
        actualEdgeLabels[edgeLabel] = (actualEdgeLabels[edgeLabel] || 0) + 1;
        edgeCount += 1;
      }
    }
    position += 1;
    return {
      repositoryId: bundle.repositoryId,
      repositoryPath: bundle.repositoryPath,
      sourcePath: bundle.sourcePath,
      contentHash: bundle.contentHash,
      parserId: bundle.parserId,
      parserVersion: bundle.parserVersion,
      status: bundle.status,
      schema: partSchema,
      nodes: kind === "nodes" ? part.records : [],
      edges: kind === "edges" ? part.records : [],
      diagnostics: [],
      kind,
      ordinal: descriptor.ordinal,
    };
  };
  const finish = () => {
    if (nodeCount !== bundle.nodeCount
      || edgeCount !== bundle.edgeCount
      || !sameCanonicalValue(actualNodeTypes, bundle.nodeTypes, checkpoint)
      || !sameCanonicalValue(actualEdgeLabels, bundle.edgeLabels, checkpoint)) {
      throw invalidSourcePart(sourceEntry, "Source part aggregate counts or labels are invalid");
    }
  };
  try {
    while (position < sequence.length) yield await readNext();
    finish();
    complete = true;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!complete && !failed) {
      while (position < sequence.length) await readNext();
      finish();
    }
  }
}
export async function readAgentGraphSourceShard(snapshot, sourceEntry) {
  const sourceFamily = requireSourceEntryFamily(snapshot, sourceEntry);
  if (hasOwn(sourceEntry, "shardDigest")) {
    const iterator = readAgentGraphSourceParts(snapshot, sourceEntry);
    const first = await iterator.next();
    return first.value;
  }
  const bundle = await readAgentGraphSourceBundle(snapshot, sourceEntry);
  const nodes = [];
  const edges = [];
  for await (const part of readAgentGraphSourceParts(snapshot, sourceEntry)) {
    nodes.push(...part.nodes);
    edges.push(...part.edges);
  }
  return {
    schema: sourceFamily === "legacy"
      ? LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA : AGENT_GRAPH_SOURCE_SHARD_SCHEMA,
    repositoryId: bundle.repositoryId,
    repositoryPath: bundle.repositoryPath,
    sourcePath: bundle.sourcePath,
    contentHash: bundle.contentHash,
    parserId: bundle.parserId,
    parserVersion: bundle.parserVersion,
    status: bundle.status,
    nodes,
    edges,
    diagnostics: bundle.diagnostics,
  };
}
export async function sourceObjectDigestsForEntry(snapshot, sourceEntry) {
  requireSourceEntryFamily(snapshot, sourceEntry);
  if (hasOwn(sourceEntry, "shardDigest")) return [sourceEntry.shardDigest];
  const bundle = await readAgentGraphSourceBundle(snapshot, sourceEntry);
  return [
    sourceEntry.bundleDigest,
    ...bundle.nodeParts.map((part) => part.digest),
    ...bundle.edgeParts.map((part) => part.digest),
  ];
}
export async function* readAgentGraphResolutionShards(snapshot, repositoryIndex) {
  const snapshotFamily = requireSnapshotFamily(snapshot, "resolution_shard_invalid");
  if (repositoryIndexFamily(repositoryIndex) !== snapshotFamily) {
    throw new AgentGraphError("resolution_shard_invalid", "Resolution index schema family does not match its snapshot.");
  }
  const sharded = repositoryIndex.schema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA
    || repositoryIndex.schema === LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3
    || repositoryIndex.schema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2;
  yield* validatedResolutionShards(
    repositoryIndex,
    null,
    (digest) => readContentAddressed(
      snapshot, digest, sharded ? MAX_RESOLUTION_SHARD_BYTES : MAX_OBJECT_BYTES,
    ),
    () => checkStoreBudget(snapshot.readBudget, "resolution-shard-validation"),
  );
}
export async function listAgentGraphSourceEntries(snapshot) {
  const entries = [];
  for (const repository of snapshot.manifest.repositories || []) {
    checkStoreBudget(snapshot.readBudget, "snapshot-source-list");
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    entries.push(...index.sources);
  }
  checkStoreBudget(snapshot.readBudget, "snapshot-source-list");
  return entries.sort((left, right) => compareStableStrings(left.sourcePath, right.sourcePath));
}
