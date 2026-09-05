import {
  AgentGraphError, AGENT_GRAPH_SCHEMA_VERSION, LEGACY_AGENT_GRAPH_SCHEMA_VERSION,
  compareStableStrings, sha256, stableStringify,
} from "./contract.mjs";
import {
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA, AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1,
  AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2, LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3,
} from "./resolution-store-validation.mjs";
import {
  MAX_SOURCE_BUNDLE_BYTES, MAX_SOURCE_PART_BYTES,
  sourceArtifactByteLimit, sourceArtifactRecordLimit,
  sourcePartByteLimit, sourcePartCountLimit,
} from "./source-sharding.mjs";
import { assertExplainedEdges } from "./store-records.mjs";
import {
  AGENT_GRAPH_MANIFEST_SCHEMA, AGENT_GRAPH_POINTER_SCHEMA,
  LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA, LEGACY_AGENT_GRAPH_POINTER_SCHEMA,
  LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA,
} from "./store-schema.mjs";

export const SOURCE_ENTRY_FAMILY = Symbol("agent-graph-source-entry-family");
export const markSourceEntry = (entry, family) => Object.defineProperty(entry, SOURCE_ENTRY_FAMILY, { value: family });
export const repositoryIndexFamily = (index) => index?.schema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA
  ? "canonical"
  : [LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3,
      AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V2,
      AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V1].includes(index?.schema) ? "legacy" : "";
export function requireSnapshotFamily(snapshot, code) {
  const family = snapshot?.schemaFamily;
  const exact = family === "canonical"
    ? snapshot?.pointer?.schema === AGENT_GRAPH_POINTER_SCHEMA
      && snapshot?.manifest?.schema === AGENT_GRAPH_MANIFEST_SCHEMA
      && snapshot.manifest.schemaVersion === AGENT_GRAPH_SCHEMA_VERSION
    : family === "legacy"
      && snapshot?.pointer?.schema === LEGACY_AGENT_GRAPH_POINTER_SCHEMA
      && snapshot?.manifest?.schema === LEGACY_AGENT_GRAPH_MANIFEST_SCHEMA
      && snapshot.manifest.schemaVersion === LEGACY_AGENT_GRAPH_SCHEMA_VERSION;
  if (!exact) throw new AgentGraphError(code, "Agent graph snapshot schema family is invalid.");
  return family;
}
export function requireSourceEntryFamily(snapshot, entry) {
  const family = requireSnapshotFamily(snapshot, "source_entry_invalid");
  if (entry?.[SOURCE_ENTRY_FAMILY] !== family) invalidSourceEntry(entry, "Source entry schema family does not match its snapshot");
  return family;
}
export const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validDigest = (value) => /^[a-f0-9]{64}$/.test(String(value || ""));
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
export function invalidSourceEntry(entry, reason) {
  throw new AgentGraphError(
    "source_entry_invalid",
    `${reason}: ${String(entry?.sourcePath || "")}`,
    {
      sourcePath: String(entry?.sourcePath || ""),
      repositoryId: String(entry?.repositoryId || ""),
    },
  );
}
export function validateSourceEntryStorage(entry, repositoryIndexSchema) {
  const bundled = repositoryIndexSchema === AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA
    || repositoryIndexSchema === LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3;
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
export function validateRepositorySourceEntries(index) {
  if (![
    AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA,
    LEGACY_AGENT_GRAPH_REPOSITORY_INDEX_SCHEMA_V3,
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
export function invalidSourcePart(entry, reason, details = {}) {
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
export function validatePartDescriptors(parts, kind, entry) {
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
export function sameCanonicalValue(left, right, checkpoint = () => {}) {
  return stableStringify(left, 0, { checkpoint }) === stableStringify(right, 0, { checkpoint });
}
export function assertExactPartKeys(part, entry) {
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
export function validateLegacySourceShard(shard, entry) {
  if (shard.schema !== LEGACY_AGENT_GRAPH_SOURCE_SHARD_SCHEMA
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
export function assertSourcePartEdgeEvidence(edge, bundle) {
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
