import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  checkKnowledgeGraphBudget,
  KnowledgeGraphError,
  KNOWLEDGE_GRAPH_CONTRACT_VERSION,
  KNOWLEDGE_GRAPH_SCHEMA_VERSION,
  compareStableStrings,
  sha256,
  stableStringify,
} from "./contract.mjs";
import { MAX_RESOLUTION_SHARD_BYTES, partitionResolutionEdges } from "./resolution-sharding.mjs";
import {
  expectedResolutionEdgeCount,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
  resolutionShardDigestsForIndex,
  validatedResolutionShards,
} from "./resolution-store-validation.mjs";
import {
  assertExplainedEdges,
  countBy,
  sortedDiagnostics,
} from "./store-records.mjs";
export const KNOWLEDGE_GRAPH_POINTER_SCHEMA = "knowgrph-knowledge-graph-pointer/v1";
export const KNOWLEDGE_GRAPH_MANIFEST_SCHEMA = "knowgrph-knowledge-graph-sharded-manifest/v1";
export const KNOWLEDGE_GRAPH_SOURCE_SHARD_SCHEMA = "knowgrph-knowledge-graph-source-shard/v1";
export {
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
  KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
};
export const DEFAULT_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_POINTER_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_OBJECT_BYTES = 128 * 1024 * 1024;
const checkStoreBudget = (options, stage) => checkKnowledgeGraphBudget({
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
    throw new KnowledgeGraphError("artifact_path_symlink", "Knowledge graph storage paths must not contain symbolic links.");
  }
  if (!observed.isDirectory()) {
    throw new KnowledgeGraphError("artifact_path_not_directory", "Knowledge graph storage parent is not a directory.");
  }
  const real = await fs.realpath(directoryPath);
  const resolved = await fs.stat(real);
  if (!sameFileIdentity(observed, resolved) || (containmentRoot && !pathIsInside(real, containmentRoot))) {
    throw new KnowledgeGraphError("artifact_path_unstable", "Knowledge graph storage directory changed or escaped containment.");
  }
  return real;
}

export async function ensureKnowledgeGraphStorageRoot(rootPathRaw) {
  const requested = path.resolve(String(rootPathRaw || ""));
  if (!String(rootPathRaw || "").trim()) {
    throw new KnowledgeGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
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
    throw new KnowledgeGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  const requestedRoot = path.resolve(String(allowedRoot || ""));
  const requestedFile = path.resolve(filePath);
  const relative = path.relative(requestedRoot, requestedFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new KnowledgeGraphError("artifact_path_escape", "Knowledge graph storage path is outside its host-owned output root.");
  }
  const canonicalRoot = await ensureKnowledgeGraphStorageRoot(requestedRoot);
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
    throw new KnowledgeGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
  }
  if (existing && !existing.isFile()) {
    throw new KnowledgeGraphError("artifact_path_not_file", "Knowledge graph storage target is not a regular file.");
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
    if (!opened.isFile()) throw new KnowledgeGraphError("artifact_not_file", `Stored graph value is not a regular file: ${filePath}`);
    if (opened.size > maxBytes) throw new KnowledgeGraphError("artifact_too_large", `Stored graph value exceeds ${maxBytes} bytes.`);
    const real = await fs.realpath(filePath);
    const pathStat = await fs.stat(real);
    const realAllowedRoot = allowedRoot
      ? await fs.realpath(allowedRoot).catch(() => path.resolve(allowedRoot))
      : "";
    if ((realAllowedRoot && !pathIsInside(real, realAllowedRoot)) || !sameFileIdentity(opened, pathStat)) {
      throw new KnowledgeGraphError("artifact_path_unstable", "Stored graph value changed or escaped while it was opened.");
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
      throw new KnowledgeGraphError("artifact_changed_during_read", "Stored graph value changed while it was being read.");
    }
    checkStoreBudget(options, "snapshot-read-complete");
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    if (error?.code === "ENOENT") throw new KnowledgeGraphError(missingCode, `Stored graph value was not found: ${filePath}`);
    if (error?.code === "ELOOP") {
      throw new KnowledgeGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
    }
    throw new KnowledgeGraphError("artifact_read_failed", "Stored graph value could not be read safely.", {
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
    throw new KnowledgeGraphError(code, "Stored graph JSON is invalid.");
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
      throw new KnowledgeGraphError("artifact_publish_mismatch", "Knowledge graph pointer publication could not be verified.");
    }
    checkStoreBudget(options, "snapshot-pointer-commit");
    await fs.rename(temporary, resolved.target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

export const knowledgeGraphStoreRoot = (pointerPath) => `${pointerPath}.store`;

function objectPath(storeRoot, digest) {
  if (!/^[a-f0-9]{64}$/.test(String(digest || ""))) {
    throw new KnowledgeGraphError("object_digest_invalid", "Stored graph object digest is invalid.");
  }
  return path.join(storeRoot, "objects", digest.slice(0, 2), `${digest}.json`);
}

async function writeContentAddressed(storeRoot, value, maxBytes = MAX_OBJECT_BYTES, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "snapshot-object-serialization");
  const serialized = stableStringify(value, 2, { checkpoint });
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxBytes) {
    throw new KnowledgeGraphError("artifact_too_large", `Stored graph object exceeds ${maxBytes} bytes.`, {
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
    if (existing !== serialized) throw new KnowledgeGraphError("object_digest_collision", `Stored graph object digest collision: ${digest}`);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return { digest, bytes };
}

export async function removeKnowledgeGraphObject(pointerPath, digest, options = {}) {
  const resolved = await resolveContainedFileForWrite(
    objectPath(knowledgeGraphStoreRoot(pointerPath), digest),
    options.allowedRoot,
  );
  await fs.unlink(resolved.target).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

async function readContentAddressed(snapshot, digest, maxBytes = MAX_OBJECT_BYTES) {
  const options = snapshot.readBudget || {};
  const raw = await readStableText(objectPath(snapshot.storeRoot, digest), {
    ...options,
    allowedRoot: snapshot.allowedRoot,
    maxBytes,
    missingCode: "snapshot_object_missing",
  });
  checkStoreBudget(options, "snapshot-object-hash");
  if (sha256(raw) !== digest) throw new KnowledgeGraphError("snapshot_object_tampered", `Stored graph object digest mismatch: ${digest}`);
  const parsed = parseStoredJson(raw, "snapshot_object_invalid");
  checkStoreBudget(options, "snapshot-object-parse");
  return parsed;
}

export async function writeKnowledgeGraphSourceShard(pointerPath, source, fragment, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "source-shard-write");
  checkpoint();
  const storeRoot = knowledgeGraphStoreRoot(pointerPath);
  const nodeIds = new Set(fragment.nodes.map((node) => (checkpoint(), node.id)));
  if (nodeIds.size !== fragment.nodes.length) {
    throw new KnowledgeGraphError("source_shard_invalid", `Source shard has duplicate node ids: ${source.relativePath}`);
  }
  assertExplainedEdges(fragment.edges, nodeIds, checkpoint);
  const shard = {
    schema: KNOWLEDGE_GRAPH_SOURCE_SHARD_SCHEMA,
    repositoryId: source.repositoryId,
    repositoryPath: source.repositoryPath,
    sourcePath: source.relativePath,
    contentHash: source.contentHash,
    parserId: fragment.parserId,
    parserVersion: fragment.parserVersion,
    status: fragment.status,
    nodes: fragment.nodes,
    edges: fragment.edges,
    diagnostics: sortedDiagnostics(fragment.diagnostics, checkpoint),
  };
  const stored = await writeContentAddressed(storeRoot, shard, MAX_OBJECT_BYTES, options);
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
    shardDigest: stored.digest,
    shardBytes: stored.bytes,
    nodeCount: fragment.nodes.length,
    edgeCount: fragment.edges.length,
    nodeTypes: countBy(fragment.nodes.map((node) => node.type || "Entity"), checkpoint),
    edgeLabels: countBy(fragment.edges.map((edge) => edge.label || "relatedTo"), checkpoint),
    diagnostics: shard.diagnostics,
  };
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source || {})) target[key] = (target[key] || 0) + Number(count || 0);
}

async function writeResolutionChunk(storeRoot, repositoryId, edges, options) {
  try {
    const stored = await writeContentAddressed(storeRoot, {
      schema: KNOWLEDGE_GRAPH_RESOLUTION_SHARD_SCHEMA,
      repositoryId,
      nodes: [],
      edges,
    }, MAX_RESOLUTION_SHARD_BYTES, options);
    return [stored.digest];
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
  const digests = [];
  for (const chunk of chunks) {
    digests.push(...await writeResolutionChunk(storeRoot, repositoryId, chunk, options));
  }
  return digests;
}

export async function writeKnowledgeGraphSnapshotAtomic(pointerPath, {
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
  const storeRoot = knowledgeGraphStoreRoot(pointerPath);
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
    const resolutionShardDigests = await writeResolutionShards(
      storeRoot,
      repositoryId,
      derivedEdges,
      options,
    );
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
      schema: KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA,
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
    repositories.push({
      repositoryId,
      repositoryPath,
      indexDigest: index.digest,
      sourceCount: entries.length,
      graph: { nodes: repositoryNodeCount, edges: repositoryEdgeCount },
    });
  }
  const manifest = {
    schema: KNOWLEDGE_GRAPH_MANIFEST_SCHEMA,
    schemaVersion: KNOWLEDGE_GRAPH_SCHEMA_VERSION,
    contractVersion: KNOWLEDGE_GRAPH_CONTRACT_VERSION,
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
  };
  const storedManifest = await writeContentAddressed(storeRoot, manifest, MAX_MANIFEST_BYTES, options);
  const pointer = {
    schema: KNOWLEDGE_GRAPH_POINTER_SCHEMA,
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

export async function readKnowledgeGraphSnapshot(pointerPath, options = {}) {
  const { allowedRoot, expectedGraphId } = options;
  if (!String(allowedRoot || "").trim()) {
    throw new KnowledgeGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  const raw = await readStableText(pointerPath, {
    ...options,
    allowedRoot,
    maxBytes: MAX_POINTER_BYTES,
    missingCode: "graph_not_found",
  });
  const pointer = parseStoredJson(raw, "graph_pointer_invalid");
  if (pointer.schema !== KNOWLEDGE_GRAPH_POINTER_SCHEMA
    || !/^[a-f0-9]{64}$/.test(String(pointer.snapshotDigest || ""))
    || pointer.snapshotDigest !== pointer.manifestDigest) {
    throw new KnowledgeGraphError("graph_pointer_invalid", "Knowledge graph current pointer is invalid.");
  }
  if (expectedGraphId && pointer.graphId !== expectedGraphId) {
    throw new KnowledgeGraphError("graph_identity_mismatch", "Knowledge graph pointer does not match the requested graph identity.");
  }
  const storeRoot = knowledgeGraphStoreRoot(pointerPath);
  const provisional = attachReadBudget({
    pointerPath,
    pointer,
    storeRoot,
    allowedRoot: path.resolve(allowedRoot),
  }, options);
  const manifest = await readContentAddressed(provisional, pointer.manifestDigest, MAX_MANIFEST_BYTES);
  if (manifest.schema !== KNOWLEDGE_GRAPH_MANIFEST_SCHEMA || manifest.graphId !== pointer.graphId) {
    throw new KnowledgeGraphError("snapshot_manifest_invalid", "Knowledge graph snapshot manifest is invalid.");
  }
  return attachReadBudget({ ...provisional, manifest }, options);
}

export async function readKnowledgeGraphSnapshotIfPresent(pointerPath, options = {}) {
  try {
    return await readKnowledgeGraphSnapshot(pointerPath, options);
  } catch (error) {
    if (error instanceof KnowledgeGraphError && error.code === "graph_not_found") return null;
    throw error;
  }
}

export async function readKnowledgeGraphRepositoryIndex(snapshot, repository) {
  const index = await readContentAddressed(snapshot, repository.indexDigest, MAX_MANIFEST_BYTES);
  if (index.repositoryId !== repository.repositoryId) {
    throw new KnowledgeGraphError("repository_index_invalid", `Repository index is invalid: ${repository.repositoryId}`);
  }
  resolutionShardDigestsForIndex(index);
  expectedResolutionEdgeCount(index, repository);
  return index;
}

export async function readKnowledgeGraphSourceShard(snapshot, sourceEntry) {
  const shard = await readContentAddressed(snapshot, sourceEntry.shardDigest);
  if (shard.schema !== KNOWLEDGE_GRAPH_SOURCE_SHARD_SCHEMA
    || shard.sourcePath !== sourceEntry.sourcePath
    || shard.contentHash !== sourceEntry.contentHash) {
    throw new KnowledgeGraphError("source_shard_invalid", `Source shard is invalid: ${sourceEntry.sourcePath}`);
  }
  return shard;
}

export async function* readKnowledgeGraphResolutionShards(snapshot, repositoryIndex) {
  const sharded = repositoryIndex.schema === KNOWLEDGE_GRAPH_REPOSITORY_INDEX_SCHEMA;
  yield* validatedResolutionShards(
    repositoryIndex,
    null,
    (digest) => readContentAddressed(
      snapshot, digest, sharded ? MAX_RESOLUTION_SHARD_BYTES : MAX_OBJECT_BYTES,
    ),
    () => checkStoreBudget(snapshot.readBudget, "resolution-shard-validation"),
  );
}

export async function listKnowledgeGraphSourceEntries(snapshot) {
  const entries = [];
  for (const repository of snapshot.manifest.repositories || []) {
    checkStoreBudget(snapshot.readBudget, "snapshot-source-list");
    const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
    entries.push(...index.sources);
  }
  checkStoreBudget(snapshot.readBudget, "snapshot-source-list");
  return entries.sort((left, right) => compareStableStrings(left.sourcePath, right.sourcePath));
}
