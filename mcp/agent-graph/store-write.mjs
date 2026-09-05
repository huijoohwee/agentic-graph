import path from "node:path";
import {
  AgentGraphError, AGENT_GRAPH_CONTRACT_VERSION, AGENT_GRAPH_SCHEMA_VERSION,
  compareStableStrings, stableStringify,
} from "./contract.mjs";
import { MAX_RESOLUTION_SHARD_BYTES, partitionResolutionEdges } from "./resolution-sharding.mjs";
import {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA, AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
} from "./resolution-store-validation.mjs";
import {
  AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA, AGENT_GRAPH_SOURCE_PART_SCHEMA,
  MAX_SOURCE_BUNDLE_BYTES, partitionSourceRecords,
  snapshotArtifactByteLimit, snapshotArtifactRecordLimit, snapshotSourcePartCountLimit,
  sourceArtifactByteLimit, sourceArtifactRecordLimit,
  sourcePartByteLimit, sourcePartCountLimit, sourcePartTargetBytes,
} from "./source-sharding.mjs";
import { assertExplainedEdges, countBy, sortedDiagnostics } from "./store-records.mjs";
import {
  AGENT_GRAPH_MANIFEST_SCHEMA, AGENT_GRAPH_POINTER_SCHEMA, MAX_MANIFEST_BYTES,
} from "./store-schema.mjs";
import {
  SOURCE_ENTRY_FAMILY, assertSourcePartEdgeEvidence, invalidSourceEntry,
  markSourceEntry, validateSourceEntryStorage,
} from "./store-validation.mjs";
import {
  agentGraphStoreRoot, attachReadBudget, checkStoreBudget,
  writeAtomicText, writeContentAddressed,
} from "./store-io.mjs";

export async function writeAgentGraphSourceShard(pointerPath, source, fragment, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "source-shard-write");
  checkpoint();
  const storeRoot = agentGraphStoreRoot(pointerPath);
  const nodes = [...fragment.nodes]
    .sort((left, right) => compareStableStrings(left.id, right.id));
  const edges = [...fragment.edges]
    .sort((left, right) => compareStableStrings(left.id, right.id));
  const diagnostics = sortedDiagnostics(fragment.diagnostics, checkpoint);
  const nodeIds = new Set(nodes.map((node) => (checkpoint(), node.id)));
  if (nodeIds.size !== nodes.length) {
    throw new AgentGraphError("source_shard_invalid", `Source shard has duplicate node ids: ${source.relativePath}`);
  }
  assertExplainedEdges(edges, nodeIds, checkpoint);
  const recordCount = nodes.length + edges.length + diagnostics.length;
  const maxRecords = sourceArtifactRecordLimit(options.maxSourceArtifactRecords);
  if (recordCount > maxRecords) {
    throw new AgentGraphError(
      "source_artifact_record_limit_exceeded",
      `Source graph exceeds ${maxRecords} stored records.`,
      {
        sourcePath: source.relativePath,
        repositoryId: source.repositoryId,
        actualRecords: recordCount,
        maxRecords,
        previousSnapshotPreserved: true,
      },
    );
  }
  const identity = {
    repositoryId: source.repositoryId,
    repositoryPath: source.repositoryPath,
    sourcePath: source.relativePath,
    contentHash: source.contentHash,
    parserId: fragment.parserId,
    parserVersion: fragment.parserVersion,
    status: fragment.status,
  };
  for (const edge of edges) {
    checkpoint();
    assertSourcePartEdgeEvidence(edge, identity);
  }
  const maxPartBytes = sourcePartByteLimit(options.maxSourceShardBytes);
  const targetPartBytes = sourcePartTargetBytes(options.maxSourcePartTargetBytes, maxPartBytes);
  const maxParts = sourcePartCountLimit(options.maxSourceParts);
  const makePart = (kind) => (records, ordinal, totalParts) => ({
    schema: AGENT_GRAPH_SOURCE_PART_SCHEMA,
    kind,
    ...identity,
    ordinal,
    totalParts,
    records,
  });
  const nodePartValues = partitionSourceRecords(nodes, {
    sourcePath: source.relativePath,
    repositoryId: source.repositoryId,
    kind: "nodes",
    makePart: makePart("nodes"),
    maxBytes: maxPartBytes,
    targetBytes: targetPartBytes,
    maxParts,
    checkpoint,
  });
  const edgePartValues = partitionSourceRecords(edges, {
    sourcePath: source.relativePath,
    repositoryId: source.repositoryId,
    kind: "edges",
    makePart: makePart("edges"),
    maxBytes: maxPartBytes,
    targetBytes: targetPartBytes,
    maxParts,
    checkpoint,
  });
  if (nodePartValues.length + edgePartValues.length > maxParts) {
    throw new AgentGraphError(
      "source_part_limit_exceeded",
      `Source graph requires more than ${maxParts} bounded parts.`,
      {
        sourcePath: source.relativePath,
        repositoryId: source.repositoryId,
        actualParts: nodePartValues.length + edgePartValues.length,
        maxParts,
        previousSnapshotPreserved: true,
      },
    );
  }
  const writeParts = async (values) => {
    const descriptors = [];
    for (const value of values) {
      checkpoint();
      const stored = await writeContentAddressed(storeRoot, value, maxPartBytes, options);
      descriptors.push({
        digest: stored.digest,
        bytes: stored.bytes,
        count: value.records.length,
        ordinal: value.ordinal,
      });
    }
    return descriptors;
  };
  const nodeParts = await writeParts(nodePartValues);
  const edgeParts = await writeParts(edgePartValues);
  const partsBytes = [...nodeParts, ...edgeParts]
    .reduce((total, part) => total + part.bytes, 0);
  const maxSourceBytes = sourceArtifactByteLimit(options.maxSourceArtifactBytes);
  if (partsBytes > maxSourceBytes) {
    throw new AgentGraphError(
      "source_artifact_byte_limit_exceeded",
      `Source graph parts exceed ${maxSourceBytes} bytes.`,
      {
        sourcePath: source.relativePath,
        repositoryId: source.repositoryId,
        actualBytes: partsBytes,
        maxBytes: maxSourceBytes,
        previousSnapshotPreserved: true,
      },
    );
  }
  const nodeTypes = countBy(nodes.map((node) => node.type || "Entity"), checkpoint);
  const edgeLabels = countBy(edges.map((edge) => edge.label || "relatedTo"), checkpoint);
  const bundle = {
    schema: AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA,
    ...identity,
    diagnostics,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
    edgeLabels,
    nodeParts,
    edgeParts,
    partsBytes,
  };
  let storedBundle;
  try {
    storedBundle = await writeContentAddressed(
      storeRoot,
      bundle,
      MAX_SOURCE_BUNDLE_BYTES,
      options,
    );
  } catch (error) {
    if (error?.code !== "artifact_too_large") throw error;
    throw new AgentGraphError(
      "source_bundle_too_large",
      `Source graph bundle exceeds ${MAX_SOURCE_BUNDLE_BYTES} bytes.`,
      {
        sourcePath: source.relativePath,
        repositoryId: source.repositoryId,
        actualBytes: error.details?.actualBytes,
        maxBytes: MAX_SOURCE_BUNDLE_BYTES,
        previousSnapshotPreserved: true,
      },
    );
  }
  const sourceArtifactBytes = partsBytes + storedBundle.bytes;
  if (sourceArtifactBytes > maxSourceBytes) {
    throw new AgentGraphError(
      "source_artifact_byte_limit_exceeded",
      `Source graph exceeds ${maxSourceBytes} stored bytes.`,
      {
        sourcePath: source.relativePath,
        repositoryId: source.repositoryId,
        actualBytes: sourceArtifactBytes,
        maxBytes: maxSourceBytes,
        previousSnapshotPreserved: true,
      },
    );
  }
  return markSourceEntry({
    sourcePath: source.relativePath,
    contentHash: source.contentHash,
    byteSize: source.byteSize,
    kind: source.kind,
    status: fragment.status,
    parserId: fragment.parserId,
    parserVersion: fragment.parserVersion,
    repositoryId: source.repositoryId,
    repositoryPath: source.repositoryPath,
    bundleDigest: storedBundle.digest,
    bundleBytes: storedBundle.bytes,
    sourceArtifactBytes,
    sourceArtifactRecords: recordCount,
    nodePartCount: nodeParts.length,
    edgePartCount: edgeParts.length,
    maxPartBytes: Math.max(0, ...nodeParts.map((part) => part.bytes), ...edgeParts.map((part) => part.bytes)),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
    edgeLabels,
    diagnostics,
  }, "canonical");
}
function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source || {})) target[key] = (target[key] || 0) + Number(count || 0);
}
async function writeResolutionChunk(storeRoot, repositoryId, edges, options) {
  try {
    const stored = await writeContentAddressed(storeRoot, {
      schema: AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
      repositoryId,
      nodes: [],
      edges,
    }, MAX_RESOLUTION_SHARD_BYTES, options);
    return [stored];
  } catch (error) {
    if (error?.code !== "artifact_too_large" || edges.length < 2) throw error;
    const midpoint = Math.floor(edges.length / 2);
    return [
      ...await writeResolutionChunk(storeRoot, repositoryId, edges.slice(0, midpoint), options),
      ...await writeResolutionChunk(storeRoot, repositoryId, edges.slice(midpoint), options),
    ];
  }
}
async function writeResolutionShards(storeRoot, repositoryId, edges, options) {
  const chunks = partitionResolutionEdges(edges, {
    checkpoint: () => checkStoreBudget(options, "resolution-shard-partition"),
    targetBytes: options.resolutionShardTargetBytes,
  });
  const stored = [];
  for (const chunk of chunks) {
    stored.push(...await writeResolutionChunk(storeRoot, repositoryId, chunk, options));
  }
  return stored;
}
function sourceEntryArtifactMetrics(entry) {
  const bundled = typeof entry?.bundleDigest === "string";
  const bytes = bundled ? entry.sourceArtifactBytes : entry.shardBytes;
  const records = bundled
    ? entry.sourceArtifactRecords
    : Number(entry?.nodeCount || 0) + Number(entry?.edgeCount || 0)
      + (Array.isArray(entry?.diagnostics) ? entry.diagnostics.length : 0);
  const parts = bundled
    ? Number(entry?.nodePartCount || 0) + Number(entry?.edgePartCount || 0)
    : 1;
  if (![bytes, records, parts].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new AgentGraphError(
      "source_entry_invalid",
      `Source artifact metrics are invalid: ${String(entry?.sourcePath || "")}`,
    );
  }
  return { bytes, records, parts };
}
function createSnapshotArtifactBudget(sourceEntries, options) {
  const budget = {
    bytes: 0,
    records: 0,
    sourceParts: 0,
    maxBytes: snapshotArtifactByteLimit(options.maxSnapshotArtifactBytes),
    maxRecords: snapshotArtifactRecordLimit(options.maxSnapshotArtifactRecords),
    maxSourceParts: snapshotSourcePartCountLimit(options.maxSnapshotSourceParts),
  };
  for (const entry of sourceEntries) {
    const metrics = sourceEntryArtifactMetrics(entry);
    budget.bytes += metrics.bytes;
    budget.records += metrics.records;
    budget.sourceParts += metrics.parts;
  }
  assertSnapshotArtifactBudget(budget, "source-artifacts");
  return budget;
}
function assertSnapshotArtifactBudget(budget, stage) {
  if (budget.bytes > budget.maxBytes) {
    throw new AgentGraphError(
      "snapshot_artifact_byte_limit_exceeded",
      `Snapshot artifacts exceed ${budget.maxBytes} bytes.`,
      {
        stage,
        actualBytes: budget.bytes,
        maxBytes: budget.maxBytes,
        previousSnapshotPreserved: true,
      },
    );
  }
  if (budget.records > budget.maxRecords) {
    throw new AgentGraphError(
      "snapshot_artifact_record_limit_exceeded",
      `Snapshot artifacts exceed ${budget.maxRecords} records.`,
      {
        stage,
        actualRecords: budget.records,
        maxRecords: budget.maxRecords,
        previousSnapshotPreserved: true,
      },
    );
  }
  if (budget.sourceParts > budget.maxSourceParts) {
    throw new AgentGraphError(
      "snapshot_source_part_limit_exceeded",
      `Snapshot artifacts exceed ${budget.maxSourceParts} source parts.`,
      {
        stage,
        actualParts: budget.sourceParts,
        maxParts: budget.maxSourceParts,
        previousSnapshotPreserved: true,
      },
    );
  }
}
function retainSnapshotArtifact(budget, { bytes = 0, records = 0 }, stage) {
  budget.bytes += bytes;
  budget.records += records;
  assertSnapshotArtifactBudget(budget, stage);
}
export async function writeAgentGraphSnapshotAtomic(pointerPath, {
  graphId,
  sourceEntries,
  derivedEdgesByRepository,
  diagnostics,
  rootContentHash,
  admission,
  completeness,
  parserRegistryDigest,
}, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "snapshot-write");
  checkpoint();
  const storeRoot = agentGraphStoreRoot(pointerPath);
  for (const entry of sourceEntries) {
    if (entry?.[SOURCE_ENTRY_FAMILY] !== "canonical") invalidSourceEntry(entry, "Snapshot writer requires a canonical source entry");
    validateSourceEntryStorage(entry, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA);
  }
  const artifactBudget = createSnapshotArtifactBudget(sourceEntries, options);
  const repositories = [];
  const parserCoverage = {};
  const nodeTypes = {};
  const edgeLabels = {};
  let nodeCount = 0;
  let edgeCount = 0;
  for (const repositoryId of [...new Set(sourceEntries.map((entry) => entry.repositoryId))].sort(compareStableStrings)) {
    checkpoint();
    const entries = sourceEntries
      .filter((entry) => entry.repositoryId === repositoryId)
      .sort((left, right) => compareStableStrings(left.sourcePath, right.sourcePath));
    const derivedEdges = derivedEdgesByRepository.get(repositoryId) || [];
    derivedEdges.sort((left, right) => compareStableStrings(left.id, right.id));
    assertExplainedEdges(derivedEdges, null, checkpoint);
    const resolutionShards = await writeResolutionShards(
      storeRoot,
      repositoryId,
      derivedEdges,
      options,
    );
    for (const stored of resolutionShards) {
      retainSnapshotArtifact(artifactBudget, {
        bytes: stored.bytes,
      }, "resolution-artifacts");
    }
    retainSnapshotArtifact(artifactBudget, {
      records: derivedEdges.length,
    }, "resolution-records");
    const resolutionShardDigests = resolutionShards.map((stored) => stored.digest);
    const repositoryPath = entries[0]?.repositoryPath || ".";
    const repositoryNodeTypes = {};
    const repositoryEdgeLabels = {};
    let repositoryNodeCount = 0;
    let repositoryEdgeCount = derivedEdges.length;
    for (const entry of entries) {
      checkpoint();
      parserCoverage[entry.parserId] = (parserCoverage[entry.parserId] || 0) + 1;
      repositoryNodeCount += entry.nodeCount;
      repositoryEdgeCount += entry.edgeCount;
      mergeCounts(repositoryNodeTypes, entry.nodeTypes);
      mergeCounts(repositoryEdgeLabels, entry.edgeLabels);
    }
    mergeCounts(repositoryEdgeLabels, countBy(derivedEdges.map((edge) => edge.label), checkpoint));
    mergeCounts(nodeTypes, repositoryNodeTypes);
    mergeCounts(edgeLabels, repositoryEdgeLabels);
    nodeCount += repositoryNodeCount;
    edgeCount += repositoryEdgeCount;
    const index = await writeContentAddressed(storeRoot, {
      schema: AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
      repositoryId,
      repositoryPath,
      sources: entries,
      resolutionShardDigests,
      graph: {
        nodes: repositoryNodeCount,
        edges: repositoryEdgeCount,
        nodeTypes: repositoryNodeTypes,
        edgeLabels: repositoryEdgeLabels,
      },
    }, MAX_MANIFEST_BYTES, options);
    retainSnapshotArtifact(artifactBudget, { bytes: index.bytes }, "repository-index");
    repositories.push({
      repositoryId,
      repositoryPath,
      indexDigest: index.digest,
      sourceCount: entries.length,
      graph: { nodes: repositoryNodeCount, edges: repositoryEdgeCount },
    });
  }
  const manifest = {
    schema: AGENT_GRAPH_MANIFEST_SCHEMA,
    schemaVersion: AGENT_GRAPH_SCHEMA_VERSION,
    contractVersion: AGENT_GRAPH_CONTRACT_VERSION,
    graphId,
    rootContentHash,
    parserRegistryDigest,
    repositories,
    graph: { nodes: nodeCount, edges: edgeCount, nodeTypes, edgeLabels },
    sourceCount: sourceEntries.length,
    parserCoverage: Object.fromEntries(Object.entries(parserCoverage).sort(([left], [right]) => compareStableStrings(left, right))),
    admission,
    completeness,
    diagnostics: sortedDiagnostics([
      ...(diagnostics || []),
      ...sourceEntries.flatMap((entry) => entry.diagnostics || []),
    ], checkpoint).slice(0, 10_000),
    retrieval: { mode: "lexical-graph", vectorStore: false },
    cost: { modelCalls: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
    artifacts: {
      contentObjectBytesExcludingManifest: artifactBudget.bytes,
      records: artifactBudget.records,
      sourceParts: artifactBudget.sourceParts,
      bounded: true,
    },
  };
  const storedManifest = await writeContentAddressed(storeRoot, manifest, MAX_MANIFEST_BYTES, options);
  retainSnapshotArtifact(artifactBudget, { bytes: storedManifest.bytes }, "snapshot-manifest");
  const pointer = {
    schema: AGENT_GRAPH_POINTER_SCHEMA,
    graphId,
    snapshotDigest: storedManifest.digest,
    manifestDigest: storedManifest.digest,
  };
  checkpoint();
  await writeAtomicText(pointerPath, stableStringify(pointer, 2, { checkpoint }), options);
  if (options.objectTransaction) options.objectTransaction.committed = true;
  return attachReadBudget({
    pointerPath,
    pointer,
    manifest,
    schemaFamily: "canonical",
    storeRoot,
    allowedRoot: path.resolve(allowedRoot),
  }, options);
}
