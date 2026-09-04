import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  checkAgentGraphBudget,
  AgentGraphError,
  AGENT_GRAPH_CONTRACT_VERSION,
  AGENT_GRAPH_SCHEMA_VERSION,
  compareStableStrings,
  sha256,
  stableStringify,
} from "./contract.mjs";
import { MAX_RESOLUTION_SHARD_BYTES, partitionResolutionEdges } from "./resolution-sharding.mjs";
import {
  expectedResolutionEdgeCount,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
  AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
  resolutionShardDigestsForIndex,
  validatedResolutionShards,
} from "./resolution-store-validation.mjs";
import {
  AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA,
  AGENT_GRAPH_SOURCE_PART_SCHEMA,
  MAX_SOURCE_BUNDLE_BYTES,
  MAX_SOURCE_PART_BYTES,
  partitionSourceRecords,
  snapshotArtifactByteLimit,
  snapshotArtifactRecordLimit,
  snapshotSourcePartCountLimit,
  sourceArtifactByteLimit,
  sourceArtifactRecordLimit,
  sourcePartByteLimit,
  sourcePartCountLimit,
  sourcePartTargetBytes,
} from "./source-sharding.mjs";
import {
  assertExplainedEdges,
  countBy,
  sortedDiagnostics,
} from "./store-records.mjs";
// These durable schema values are content-addressed and cannot be renamed in place.
export const AGENT_GRAPH_POINTER_SCHEMA = "agentic-graph-knowledge-graph-pointer/v1";
export const AGENT_GRAPH_MANIFEST_SCHEMA = "agentic-graph-knowledge-graph-sharded-manifest/v1";
export const AGENT_GRAPH_SOURCE_SHARD_SCHEMA = "agentic-graph-knowledge-graph-source-shard/v1";
export {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
  AGENT_GRAPH_RESOLUTION_SHARD_SCHEMA,
  AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA,
  AGENT_GRAPH_SOURCE_PART_SCHEMA,
};
export const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_POINTER_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_OBJECT_BYTES = 128 * 1024 * 1024;
export const agentGraphSourceShardByteLimit = value => sourcePartByteLimit(value);
const checkStoreBudget = (options, stage) => checkAgentGraphBudget({
  abortSignal: options?.abortSignal,
  deadline: options?.deadline,
  stage,
});
const attachReadBudget = (snapshot, options) => Object.defineProperty(snapshot, "readBudget", {
  value: { abortSignal: options?.abortSignal, deadline: options?.deadline },
  enumerable: false,
});
function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;

async function lstatIfPresent(targetPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function verifiedDirectory(directoryPath, containmentRoot) {
  const observed = await fs.lstat(directoryPath);
  if (observed.isSymbolicLink()) {
    throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage paths must not contain symbolic links.");
  }
  if (!observed.isDirectory()) {
    throw new AgentGraphError("artifact_path_not_directory", "Knowledge graph storage parent is not a directory.");
  }
  const real = await fs.realpath(directoryPath);
  const resolved = await fs.stat(real);
  if (!sameFileIdentity(observed, resolved) || (containmentRoot && !pathIsInside(real, containmentRoot))) {
    throw new AgentGraphError("artifact_path_unstable", "Knowledge graph storage directory changed or escaped containment.");
  }
  return real;
}

export async function ensureAgentGraphStorageRoot(rootPathRaw) {
  const requested = path.resolve(String(rootPathRaw || ""));
  if (!String(rootPathRaw || "").trim()) {
    throw new AgentGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  let ancestor = requested;
  const missing = [];
  while (!(await lstatIfPresent(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  let current = await verifiedDirectory(ancestor);
  const containmentRoot = current;
  for (const segment of missing) {
    const next = path.join(current, segment);
    try {
      await fs.mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    current = await verifiedDirectory(next, containmentRoot);
  }
  return current;
}

async function resolveContainedFileForWrite(filePath, allowedRoot) {
  if (!String(allowedRoot || "").trim()) {
    throw new AgentGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  const requestedRoot = path.resolve(String(allowedRoot || ""));
  const requestedFile = path.resolve(filePath);
  const relative = path.relative(requestedRoot, requestedFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AgentGraphError("artifact_path_escape", "Knowledge graph storage path is outside its host-owned output root.");
  }
  const canonicalRoot = await ensureAgentGraphStorageRoot(requestedRoot);
  let current = canonicalRoot;
  for (const segment of path.dirname(relative).split(path.sep).filter((part) => part && part !== ".")) {
    const next = path.join(current, segment);
    try {
      await fs.mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    current = await verifiedDirectory(next, canonicalRoot);
  }
  const target = path.join(current, path.basename(requestedFile));
  const existing = await lstatIfPresent(target);
  if (existing?.isSymbolicLink()) {
    throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
  }
  if (existing && !existing.isFile()) {
    throw new AgentGraphError("artifact_path_not_file", "Knowledge graph storage target is not a regular file.");
  }
  return { canonicalRoot, target };
}

async function writeExclusiveText(filePath, serialized) {
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | Number(fsConstants.O_NOFOLLOW || 0);
  const handle = await fs.open(filePath, flags, 0o600);
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readStableText(filePath, options = {}) {
  const {
    allowedRoot,
    maxBytes = MAX_OBJECT_BYTES,
    missingCode = "artifact_not_found",
  } = options;
  let handle;
  try {
    checkStoreBudget(options, "snapshot-read-open");
    handle = await fs.open(filePath, fsConstants.O_RDONLY | Number(fsConstants.O_NOFOLLOW || 0));
    checkStoreBudget(options, "snapshot-read-stat");
    const opened = await handle.stat();
    if (!opened.isFile()) throw new AgentGraphError("artifact_not_file", `Stored graph value is not a regular file: ${filePath}`);
    if (opened.size > maxBytes) throw new AgentGraphError("artifact_too_large", `Stored graph value exceeds ${maxBytes} bytes.`);
    const real = await fs.realpath(filePath);
    const pathStat = await fs.stat(real);
    const realAllowedRoot = allowedRoot
      ? await fs.realpath(allowedRoot).catch(() => path.resolve(allowedRoot))
      : "";
    if ((realAllowedRoot && !pathIsInside(real, realAllowedRoot)) || !sameFileIdentity(opened, pathStat)) {
      throw new AgentGraphError("artifact_path_unstable", "Stored graph value changed or escaped while it was opened.");
    }
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      checkStoreBudget(options, "snapshot-read-content");
      const chunk = await handle.read(bytes, offset, Math.min(1024 * 1024, bytes.length - offset), offset);
      if (!chunk.bytesRead) break;
      offset += chunk.bytesRead;
    }
    checkStoreBudget(options, "snapshot-read-verify");
    const extra = Buffer.alloc(1);
    const extraRead = await handle.read(extra, 0, 1, opened.size);
    const closed = await handle.stat();
    if (offset !== bytes.length || extraRead.bytesRead || !sameFileIdentity(opened, closed)
      || opened.size !== closed.size || opened.mtimeMs !== closed.mtimeMs) {
      throw new AgentGraphError("artifact_changed_during_read", "Stored graph value changed while it was being read.");
    }
    checkStoreBudget(options, "snapshot-read-complete");
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof AgentGraphError) throw error;
    if (error?.code === "ENOENT") throw new AgentGraphError(missingCode, `Stored graph value was not found: ${filePath}`);
    if (error?.code === "ELOOP") {
      throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
    }
    throw new AgentGraphError("artifact_read_failed", "Stored graph value could not be read safely.", {
      causeCode: String(error?.code || "read_failed"),
    });
  } finally {
    await handle?.close().catch(() => {});
  }
}

function parseStoredJson(raw, code) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new AgentGraphError(code, "Stored graph JSON is invalid.");
  }
}

async function writeAtomicText(filePath, serialized, options = {}) {
  const { allowedRoot } = options;
  checkStoreBudget(options, "snapshot-pointer-stage");
  const resolved = await resolveContainedFileForWrite(filePath, allowedRoot);
  const directory = path.dirname(resolved.target);
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${sha256(`${filePath}:${process.hrtime.bigint()}`).slice(0, 12)}.tmp`,
  );
  try {
    await writeExclusiveText(temporary, serialized);
    checkStoreBudget(options, "snapshot-pointer-verify");
    const staged = await readStableText(temporary, {
      ...options,
      allowedRoot: resolved.canonicalRoot,
      maxBytes: MAX_POINTER_BYTES,
    });
    if (staged !== serialized) {
      throw new AgentGraphError("artifact_publish_mismatch", "Knowledge graph pointer publication could not be verified.");
    }
    checkStoreBudget(options, "snapshot-pointer-commit");
    await fs.rename(temporary, resolved.target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

export const agentGraphStoreRoot = (pointerPath) => `${pointerPath}.store`;

function objectPath(storeRoot, digest) {
  if (!/^[a-f0-9]{64}$/.test(String(digest || ""))) {
    throw new AgentGraphError("object_digest_invalid", "Stored graph object digest is invalid.");
  }
  return path.join(storeRoot, "objects", digest.slice(0, 2), `${digest}.json`);
}

async function writeContentAddressed(storeRoot, value, maxBytes = MAX_OBJECT_BYTES, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "snapshot-object-serialization");
  const serialized = stableStringify(value, 2, { checkpoint });
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxBytes) {
    throw new AgentGraphError("artifact_too_large", `Stored graph object exceeds ${maxBytes} bytes.`, {
      actualBytes: bytes,
      maxBytes,
      previousSnapshotPreserved: true,
    });
  }
  checkpoint();
  const digest = sha256(serialized);
  const resolved = await resolveContainedFileForWrite(objectPath(storeRoot, digest), allowedRoot);
  const target = resolved.target;
  const temporary = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  try {
    await writeExclusiveText(temporary, serialized);
    checkpoint();
    try {
      await fs.link(temporary, target);
      options.objectTransaction?.createdDigests?.add(digest);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const existing = await readStableText(target, {
      ...options,
      allowedRoot: resolved.canonicalRoot,
      maxBytes,
    });
    checkpoint();
    if (existing !== serialized) throw new AgentGraphError("object_digest_collision", `Stored graph object digest collision: ${digest}`);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return { digest, bytes };
}

export async function removeAgentGraphObject(pointerPath, digest, options = {}) {
  const resolved = await resolveContainedFileForWrite(
    objectPath(agentGraphStoreRoot(pointerPath), digest),
    options.allowedRoot,
  );
  await fs.unlink(resolved.target).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

async function readContentAddressed(
  snapshot,
  digest,
  maxBytes = MAX_OBJECT_BYTES,
  validation = {},
) {
  const options = snapshot.readBudget || {};
  const raw = await readStableText(objectPath(snapshot.storeRoot, digest), {
    ...options,
    allowedRoot: snapshot.allowedRoot,
    maxBytes,
    missingCode: "snapshot_object_missing",
  });
  const actualBytes = Buffer.byteLength(raw);
  if (validation.expectedBytes !== undefined && actualBytes !== validation.expectedBytes) {
    throw new AgentGraphError(
      validation.sizeCode || "snapshot_object_invalid",
      validation.sizeMessage || `Stored graph object byte count is invalid: ${digest}`,
      {
        ...(validation.details || {}),
        actualBytes,
        expectedBytes: validation.expectedBytes,
      },
    );
  }
  checkStoreBudget(options, "snapshot-object-hash");
  if (sha256(raw) !== digest) throw new AgentGraphError("snapshot_object_tampered", `Stored graph object digest mismatch: ${digest}`);
  const parsed = parseStoredJson(raw, "snapshot_object_invalid");
  checkStoreBudget(options, "snapshot-object-parse");
  return parsed;
}

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
  return {
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
  };
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
    storeRoot,
    allowedRoot: path.resolve(allowedRoot),
  }, options);
}

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
  if (pointer.schema !== AGENT_GRAPH_POINTER_SCHEMA
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
    allowedRoot: path.resolve(allowedRoot),
  }, options);
  const manifest = await readContentAddressed(provisional, pointer.manifestDigest, MAX_MANIFEST_BYTES);
  if (manifest.schema !== AGENT_GRAPH_MANIFEST_SCHEMA || manifest.graphId !== pointer.graphId) {
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

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validDigest = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

function invalidSourceEntry(entry, reason) {
  throw new AgentGraphError(
    "source_entry_invalid",
    `${reason}: ${String(entry?.sourcePath || "")}`,
    {
      sourcePath: String(entry?.sourcePath || ""),
      repositoryId: String(entry?.repositoryId || ""),
    },
  );
}

function validateSourceEntryStorage(entry, repositoryIndexSchema) {
  const bundled = repositoryIndexSchema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA;
  if (bundled) {
    if (!validDigest(entry?.bundleDigest)
      || !validCount(entry?.bundleBytes) || entry.bundleBytes < 1
      || !validCount(entry?.sourceArtifactBytes) || entry.sourceArtifactBytes < entry.bundleBytes
      || !validCount(entry?.sourceArtifactRecords)
      || !validCount(entry?.nodePartCount)
      || !validCount(entry?.edgePartCount)
      || !validCount(entry?.maxPartBytes)
      || entry.bundleBytes > MAX_SOURCE_BUNDLE_BYTES
      || entry.sourceArtifactBytes > sourceArtifactByteLimit()
      || entry.sourceArtifactRecords > sourceArtifactRecordLimit()
      || entry.nodePartCount + entry.edgePartCount > sourcePartCountLimit()
      || entry.maxPartBytes > sourcePartByteLimit()
      || hasOwn(entry, "shardDigest")
      || hasOwn(entry, "shardBytes")) {
      invalidSourceEntry(entry, "Repository v3 source entry has an invalid bundle shape");
    }
  } else if (!validDigest(entry?.shardDigest)
    || !validCount(entry?.shardBytes) || entry.shardBytes < 1
    || hasOwn(entry, "bundleDigest")
    || hasOwn(entry, "bundleBytes")
    || hasOwn(entry, "sourceArtifactBytes")) {
    invalidSourceEntry(entry, "Legacy repository source entry has an invalid shard shape");
  }
  if (!validCount(entry?.nodeCount)
    || !validCount(entry?.edgeCount)
    || !Array.isArray(entry?.diagnostics)) {
    invalidSourceEntry(entry, "Repository source graph metadata is invalid");
  }
}

function validateRepositorySourceEntries(index) {
  if (![
    AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
    AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
    AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  ].includes(index?.schema) || !Array.isArray(index?.sources)) {
    throw new AgentGraphError(
      "repository_index_invalid",
      `Repository index schema is invalid: ${String(index?.repositoryId || "")}`,
    );
  }
  for (const entry of index.sources) validateSourceEntryStorage(entry, index.schema);
}

export async function readAgentGraphRepositoryIndex(snapshot, repository) {
  const index = await readContentAddressed(snapshot, repository.indexDigest, MAX_MANIFEST_BYTES);
  if (index.repositoryId !== repository.repositoryId) {
    throw new AgentGraphError("repository_index_invalid", `Repository index is invalid: ${repository.repositoryId}`);
  }
  validateRepositorySourceEntries(index);
  resolutionShardDigestsForIndex(index);
  expectedResolutionEdgeCount(index, repository);
  return index;
}

function invalidSourcePart(entry, reason, details = {}) {
  return new AgentGraphError(
    "source_part_invalid",
    `${reason}: ${String(entry?.sourcePath || "")}`,
    {
      sourcePath: String(entry?.sourcePath || ""),
      repositoryId: String(entry?.repositoryId || ""),
      ...details,
    },
  );
}

function validatePartDescriptors(parts, kind, entry) {
  if (!Array.isArray(parts)) throw invalidSourcePart(entry, `Source ${kind} part descriptors are invalid`);
  let count = 0;
  for (let ordinal = 0; ordinal < parts.length; ordinal += 1) {
    const descriptor = parts[ordinal];
    if (!validDigest(descriptor?.digest)
      || !validCount(descriptor?.bytes) || descriptor.bytes < 1
      || descriptor.bytes > MAX_SOURCE_PART_BYTES
      || !validCount(descriptor?.count) || descriptor.count < 1
      || descriptor.ordinal !== ordinal) {
      throw invalidSourcePart(entry, `Source ${kind} part descriptor is invalid`, { ordinal });
    }
    count += descriptor.count;
  }
  return count;
}

function sameCanonicalValue(left, right, checkpoint = () => {}) {
  return stableStringify(left, 0, { checkpoint }) === stableStringify(right, 0, { checkpoint });
}

export async function readAgentGraphSourceBundle(snapshot, sourceEntry) {
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
  const identityMatches = bundle.schema === AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA
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

function assertExactPartKeys(part, entry) {
  const expected = [
    "contentHash",
    "kind",
    "ordinal",
    "parserId",
    "parserVersion",
    "records",
    "repositoryId",
    "repositoryPath",
    "schema",
    "sourcePath",
    "status",
    "totalParts",
  ];
  const actual = Object.keys(part || {}).sort(compareStableStrings);
  if (!sameCanonicalValue(actual, expected)) {
    throw invalidSourcePart(entry, "Source part fields are invalid", {
      kind: String(part?.kind || ""),
      ordinal: part?.ordinal,
    });
  }
}

function validateLegacySourceShard(shard, entry) {
  if (shard.schema !== AGENT_GRAPH_SOURCE_SHARD_SCHEMA
    || shard.repositoryId !== entry.repositoryId
    || shard.repositoryPath !== entry.repositoryPath
    || shard.sourcePath !== entry.sourcePath
    || shard.contentHash !== entry.contentHash
    || shard.parserId !== entry.parserId
    || shard.parserVersion !== entry.parserVersion
    || shard.status !== entry.status
    || !Array.isArray(shard.nodes)
    || !Array.isArray(shard.edges)
    || !Array.isArray(shard.diagnostics)
    || shard.nodes.length !== entry.nodeCount
    || shard.edges.length !== entry.edgeCount) {
    throw new AgentGraphError("source_shard_invalid", `Source shard is invalid: ${entry.sourcePath}`);
  }
  const nodeIds = new Set(shard.nodes.map((node) => node?.id));
  if (nodeIds.size !== shard.nodes.length) {
    throw new AgentGraphError("source_shard_invalid", `Source shard has duplicate node ids: ${entry.sourcePath}`);
  }
  assertExplainedEdges(shard.edges, nodeIds);
}

function assertSourcePartEdgeEvidence(edge, bundle) {
  const properties = edge?.properties || {};
  const lineStart = properties["evidence:lineStart"];
  const lineEnd = properties["evidence:lineEnd"];
  const columnStart = properties["evidence:columnStart"];
  const columnEnd = properties["evidence:columnEnd"];
  const validSpan = [lineStart, lineEnd, columnStart, columnEnd]
    .every((value) => Number.isSafeInteger(value) && value > 0)
    && lineEnd >= lineStart
    && (lineEnd > lineStart || columnEnd >= columnStart);
  if (properties["evidence:sourcePath"] !== bundle.sourcePath
    || properties["evidence:sourceDigest"] !== bundle.contentHash
    || properties["evidence:parserId"] !== bundle.parserId
    || properties["evidence:parserVersion"] !== bundle.parserVersion
    || properties["evidence:parserDigest"] !== sha256(`${bundle.parserId}\0${bundle.parserVersion}`)
    || !/^[a-f0-9]{64}$/.test(String(properties["evidence:sourceDigest"] || ""))
    || !/^[a-f0-9]{64}$/.test(String(properties["evidence:parserDigest"] || ""))
    || !validSpan) {
    throw new AgentGraphError(
      "edge_evidence_invalid",
      `Stored source edge evidence does not match its source bundle: ${String(edge?.id || "")}`,
      {
        sourcePath: bundle.sourcePath,
        repositoryId: bundle.repositoryId,
        edgeId: String(edge?.id || ""),
      },
    );
  }
}

export async function* readAgentGraphSourceParts(snapshot, sourceEntry) {
  if (hasOwn(sourceEntry, "shardDigest")) {
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
    if (part.schema !== AGENT_GRAPH_SOURCE_PART_SCHEMA
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
      schema: AGENT_GRAPH_SOURCE_PART_SCHEMA,
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
    schema: AGENT_GRAPH_SOURCE_SHARD_SCHEMA,
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
  if (hasOwn(sourceEntry, "shardDigest")) return [sourceEntry.shardDigest];
  const bundle = await readAgentGraphSourceBundle(snapshot, sourceEntry);
  return [
    sourceEntry.bundleDigest,
    ...bundle.nodeParts.map((part) => part.digest),
    ...bundle.edgeParts.map((part) => part.digest),
  ];
}

export async function* readAgentGraphResolutionShards(snapshot, repositoryIndex) {
  const sharded = repositoryIndex.schema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA
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
