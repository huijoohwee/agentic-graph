import {
  computeAgentGraphArtifactDigestBounded,
  AgentGraphError,
} from "./contract.mjs";

export const MAX_RESOLUTION_RECORDS = 1_000_000;
export const MAX_RESOLUTION_BYTES = 256_000_000;

function normalizedLimit(value, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.min(maximum, Math.floor(numeric))
    : maximum;
}

export function createResolutionRetentionBudget(options = {}) {
  return {
    bytes: 0,
    maxBytes: normalizedLimit(options.maxBytes, MAX_RESOLUTION_BYTES),
    maxRecords: normalizedLimit(options.maxRecords, MAX_RESOLUTION_RECORDS),
    records: 0,
  };
}

export function fragmentForResolution(fragment, checkpoint = () => {}) {
  const relevantTypes = new Set([
    "CodeDependency",
    "DocumentLinkReference",
    "SourceFile",
    "SqlTable",
    "SqlTableReference",
  ]);
  const nodes = fragment.nodes.filter((node) => {
    checkpoint();
    return relevantTypes.has(node.type);
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    status: fragment.status,
    nodes,
    edges: fragment.edges.filter((edge) => {
      checkpoint();
      return nodeIds.has(edge.target);
    }),
  };
}

function retentionError(code, message, sourcePath, budget, details = {}) {
  return new AgentGraphError(code, message, {
    sourcePath,
    retainedRecords: budget.records,
    retainedBytes: budget.bytes,
    maxRecords: budget.maxRecords,
    maxBytes: budget.maxBytes,
    ...details,
  });
}

export function retainResolutionFragment(budget, sourcePath, fragment) {
  const sourceRecords = fragment.nodes.length + fragment.edges.length;
  if (budget.records + sourceRecords > budget.maxRecords) {
    throw retentionError(
      "resolution_record_limit_exceeded",
      "Repository resolution input exceeded its aggregate record limit.",
      sourcePath,
      budget,
      { sourceRecords },
    );
  }
  const remainingBytes = budget.maxBytes - budget.bytes;
  if (remainingBytes < 1) {
    throw retentionError(
      "resolution_byte_limit_exceeded",
      "Repository resolution input exceeded its aggregate byte limit.",
      sourcePath,
      budget,
    );
  }
  let sourceBytes;
  try {
    sourceBytes = computeAgentGraphArtifactDigestBounded(fragment, remainingBytes).byteLength;
  } catch (error) {
    if (error?.code !== "artifact_too_large") throw error;
    throw retentionError(
      "resolution_byte_limit_exceeded",
      "Repository resolution input exceeded its aggregate byte limit.",
      sourcePath,
      budget,
      { sourceBytesAtLeast: error.details?.actualBytesAtLeast },
    );
  }
  budget.records += sourceRecords;
  budget.bytes += sourceBytes;
}

export function retainResolutionRecord(budget, sourcePath, record, details = {}) {
  if (budget.records + 1 > budget.maxRecords) {
    throw retentionError(
      "resolution_record_limit_exceeded",
      "Repository resolution working data exceeded its aggregate record limit.",
      sourcePath,
      budget,
      { sourceRecords: 1, ...details },
    );
  }
  const remainingBytes = budget.maxBytes - budget.bytes;
  if (remainingBytes < 1) {
    throw retentionError(
      "resolution_byte_limit_exceeded",
      "Repository resolution working data exceeded its aggregate byte limit.",
      sourcePath,
      budget,
      details,
    );
  }
  let recordBytes;
  try {
    recordBytes = computeAgentGraphArtifactDigestBounded(record, remainingBytes).byteLength;
  } catch (error) {
    if (error?.code !== "artifact_too_large") throw error;
    throw retentionError(
      "resolution_byte_limit_exceeded",
      "Repository resolution working data exceeded its aggregate byte limit.",
      sourcePath,
      budget,
      { recordBytesAtLeast: error.details?.actualBytesAtLeast, ...details },
    );
  }
  budget.records += 1;
  budget.bytes += recordBytes;
}
