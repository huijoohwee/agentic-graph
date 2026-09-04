import crypto from "node:crypto";

// Persisted artifact identity is immutable so pre-rename snapshots retain their digest.
export const AGENT_GRAPH_SCHEMA_VERSION = "agentic-graph-knowledge-graph/v1";
export const AGENT_GRAPH_CONTRACT_VERSION = "1.0.0";
export const AGENT_GRAPH_CANONICAL_NODE_OUTPUT_REVISION = "canonical-node-output-v1";
export const MAX_AGENT_GRAPH_LABEL_LENGTH = 16_384;
export const EVIDENCE_FIELDS = Object.freeze([
  "evidence:kind",
  "evidence:ruleId",
  "evidence:explanation",
  "evidence:parserId",
  "evidence:parserVersion",
  "evidence:parserDigest",
  "evidence:sourcePath",
  "evidence:sourceDigest",
  "evidence:lineStart",
  "evidence:lineEnd",
  "evidence:columnStart",
  "evidence:columnEnd",
  "evidence:excerpt",
  "evidence:excerptHash",
  "evidence:confidence",
  "evidence:certainty",
]);

export class AgentGraphError extends Error {
  constructor(code, message, details = undefined) {
    super(String(message || code || "Knowledge graph error"));
    this.name = "AgentGraphError";
    this.code = String(code || "agent_graph_error");
    if (details !== undefined) this.details = details;
  }
}

export const agentGraphFailure = (error) => {
  const normalized = error instanceof AgentGraphError
    ? error
    : new AgentGraphError("agent_graph_error", error instanceof Error ? error.message : String(error));
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    },
  };
};

export function throwIfAborted(abortSignal) {
  if (abortSignal?.aborted) {
    throw new AgentGraphError("aborted", "Knowledge graph operation was aborted.");
  }
}

export const DEFAULT_AGENT_GRAPH_MAX_DURATION_MS = 300_000;

export function normalizeAgentGraphMaxDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.max(100, Math.min(3_600_000, Math.floor(number)))
    : DEFAULT_AGENT_GRAPH_MAX_DURATION_MS;
}

export function createAgentGraphDeadline(maxDurationRaw, { now = Date.now } = {}) {
  const maxDurationMs = normalizeAgentGraphMaxDuration(maxDurationRaw);
  const clock = typeof now === "function" ? now : Date.now;
  const startedAt = Number(clock());
  return Object.freeze({
    maxDurationMs,
    startedAt,
    deadlineAt: startedAt + maxDurationMs,
    now: clock,
  });
}

export function remainingAgentGraphDuration(deadline) {
  if (!deadline) return DEFAULT_AGENT_GRAPH_MAX_DURATION_MS;
  return Math.max(0, Math.ceil(deadline.deadlineAt - Number(deadline.now())));
}

export function checkAgentGraphBudget({
  abortSignal,
  deadline,
  stage = "operation",
  details = undefined,
} = {}) {
  if (deadline && Number(deadline.now()) >= deadline.deadlineAt) {
    throw new AgentGraphError(
      "max_duration_exceeded",
      `Knowledge graph operation exceeded ${deadline.maxDurationMs}ms during ${stage}.`,
      {
        maxDurationMs: deadline.maxDurationMs,
        stage,
        complete: false,
        ...(details && typeof details === "object" ? details : {}),
      },
    );
  }
  throwIfAborted(abortSignal);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function compareStableStrings(leftRaw, rightRaw) {
  const left = String(leftRaw);
  const right = String(rightRaw);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeRelativePath(value) {
  const normalized = String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new AgentGraphError("invalid_relative_path", `Invalid repository-relative path: ${String(value || "")}`);
  }
  return normalized;
}

const scalarLabelText = (value) => (
  ["string", "number", "boolean", "bigint"].includes(typeof value)
    ? String(value)
    : ""
);

/** Converts display text to the bounded, transport-safe graph-label contract. */
export function canonicalGraphLabel(value, fallback = "") {
  const normalize = (candidate) => scalarLabelText(candidate)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, MAX_AGENT_GRAPH_LABEL_LENGTH)
    .trimEnd();
  return normalize(value) || normalize(fallback) || "node";
}

/** Changes source-cache identity when the canonical node-output contract changes. */
export function versionAgentGraphParserOutput(version) {
  const base = String(version ?? "").trim();
  if (!base) throw new AgentGraphError("parser_version_invalid", "Parser versions must be nonempty.");
  return `${base}+${AGENT_GRAPH_CANONICAL_NODE_OUTPUT_REVISION}`;
}

export function stableEntityId(type, sourcePath, localKey) {
  const path = normalizeRelativePath(sourcePath);
  const digest = sha256(`${String(type)}\0${path}\0${String(localKey)}`).slice(0, 24);
  return `kg:${String(type).replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase()}:${digest}`;
}

export function stableEdgeId({ label, source, target, ruleId, sourcePath, anchor = "" }) {
  const path = normalizeRelativePath(sourcePath);
  return `kg:edge:${sha256([label, source, target, ruleId, path, anchor].join("\0")).slice(0, 28)}`;
}

const positiveInteger = (value, fallback = 1) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

export function spanFromOffsets(textRaw, startRaw, endRaw) {
  const text = String(textRaw || "");
  const start = Math.max(0, Math.min(text.length, Number.isFinite(Number(startRaw)) ? Number(startRaw) : 0));
  const end = Math.max(start, Math.min(text.length, Number.isFinite(Number(endRaw)) ? Number(endRaw) : start));
  const before = text.slice(0, start);
  const through = text.slice(0, end);
  const lineStart = before.split("\n").length;
  const lineEnd = through.split("\n").length;
  const lastStartBreak = before.lastIndexOf("\n");
  const lastEndBreak = through.lastIndexOf("\n");
  return {
    lineStart,
    lineEnd,
    columnStart: start - lastStartBreak,
    columnEnd: end - lastEndBreak,
    excerpt: text.slice(start, Math.min(end, start + 320)),
  };
}

export function excerptForLineSpan(textRaw, lineStartRaw, lineEndRaw) {
  const lines = String(textRaw || "").split("\n");
  const lineStart = positiveInteger(lineStartRaw);
  const lineEnd = Math.max(lineStart, positiveInteger(lineEndRaw, lineStart));
  return lines.slice(lineStart - 1, lineEnd).join("\n").slice(0, 320);
}

export function buildEvidence(args) {
  const sourcePath = normalizeRelativePath(args.sourcePath);
  const offsetSpan = Number.isFinite(Number(args.startOffset))
    ? spanFromOffsets(args.text, args.startOffset, args.endOffset)
    : null;
  const lineStart = positiveInteger(args.lineStart ?? offsetSpan?.lineStart);
  const lineEnd = Math.max(lineStart, positiveInteger(args.lineEnd ?? offsetSpan?.lineEnd, lineStart));
  const columnStart = positiveInteger(args.columnStart ?? offsetSpan?.columnStart);
  const columnEnd = positiveInteger(args.columnEnd ?? offsetSpan?.columnEnd, columnStart);
  const excerpt = String(
    args.excerpt ?? offsetSpan?.excerpt ?? excerptForLineSpan(args.text, lineStart, lineEnd),
  ).slice(0, 320);
  const confidence = ["low", "medium", "high"].includes(args.confidence) ? args.confidence : "high";
  const kind = ["extracted", "inferred", "ambiguous"].includes(args.kind) ? args.kind : "extracted";
  const parserId = String(args.parserId || "").trim();
  const parserVersion = String(args.parserVersion || "").trim();
  const sourceDigest = String(args.sourceDigest || sha256(String(args.text || ""))).trim();
  const parserDigest = String(args.parserDigest || sha256(`${parserId}\0${parserVersion}`)).trim();
  const certainty = ["exact", "inferred", "ambiguous"].includes(args.certainty)
    ? args.certainty
    : kind === "ambiguous" ? "ambiguous" : kind === "inferred" ? "inferred" : "exact";
  return {
    kind,
    ruleId: String(args.ruleId || "").trim(),
    explanation: String(args.explanation || "").trim(),
    parserId,
    parserVersion,
    parserDigest,
    sourcePath,
    sourceDigest,
    lineStart,
    lineEnd,
    columnStart,
    columnEnd,
    excerpt,
    excerptHash: String(args.excerptHash || sha256(excerpt)),
    confidence,
    certainty,
    ...(Array.isArray(args.premiseEdgeIds) ? { premiseEdgeIds: [...args.premiseEdgeIds].sort() } : {}),
    ...(Number.isInteger(args.candidateCount) ? { candidateCount: args.candidateCount } : {}),
    ...(Array.isArray(args.candidateIds) ? { candidateIds: [...new Set(args.candidateIds.map(String))].sort() } : {}),
  };
}

export function makeNode({ id, label, type, sourcePath, properties = {}, metadata = undefined }) {
  const path = normalizeRelativePath(sourcePath);
  const canonicalId = String(id ?? "").trim();
  return {
    id: canonicalId,
    label: canonicalGraphLabel(label, canonicalId),
    type: String(type ?? "Entity").trim() || "Entity",
    properties: {
      "corpus:sourcePath": path,
      ...properties,
    },
    ...(metadata ? { metadata } : {}),
  };
}

export function makeEdge({ source, target, label, type = undefined, evidence, properties = {}, metadata = undefined, anchor = "" }) {
  const normalized = buildEvidence(evidence);
  const canonicalSource = String(source ?? "").trim();
  const canonicalTarget = String(target ?? "").trim();
  const canonicalLabel = canonicalGraphLabel(label, "related");
  const canonicalType = type === undefined ? "" : String(type).trim();
  if (!normalized.ruleId || !normalized.explanation || !normalized.parserId || !normalized.parserVersion) {
    throw new AgentGraphError("invalid_edge_evidence", `Edge ${canonicalLabel} is missing required explanation provenance.`);
  }
  const edge = {
    id: stableEdgeId({
      label: canonicalLabel,
      source: canonicalSource,
      target: canonicalTarget,
      ruleId: normalized.ruleId,
      sourcePath: normalized.sourcePath,
      anchor: anchor || `${normalized.lineStart}:${normalized.columnStart}`,
    }),
    source: canonicalSource,
    target: canonicalTarget,
    label: canonicalLabel,
    properties: {
      ...properties,
      "evidence:kind": normalized.kind,
      "evidence:ruleId": normalized.ruleId,
      "evidence:explanation": normalized.explanation,
      "evidence:parserId": normalized.parserId,
      "evidence:parserVersion": normalized.parserVersion,
      "evidence:parserDigest": normalized.parserDigest,
      "evidence:sourcePath": normalized.sourcePath,
      "evidence:sourceDigest": normalized.sourceDigest,
      "evidence:lineStart": normalized.lineStart,
      "evidence:lineEnd": normalized.lineEnd,
      "evidence:columnStart": normalized.columnStart,
      "evidence:columnEnd": normalized.columnEnd,
      "evidence:excerpt": normalized.excerpt,
      "evidence:excerptHash": normalized.excerptHash,
      "evidence:confidence": normalized.confidence,
      "evidence:certainty": normalized.certainty,
      ...(normalized.premiseEdgeIds ? { "evidence:premiseEdgeIds": normalized.premiseEdgeIds } : {}),
      ...(normalized.candidateCount === undefined ? {} : { "evidence:candidateCount": normalized.candidateCount }),
      ...(normalized.candidateIds ? { "evidence:candidateIds": normalized.candidateIds } : {}),
    },
    ...(canonicalType ? { type: canonicalType } : {}),
    ...(metadata ? { metadata } : {}),
  };
  return edge;
}

export function sortGraphData(graphData) {
  const nodesById = new Map();
  for (const node of graphData?.nodes || []) if (node?.id && !nodesById.has(node.id)) nodesById.set(node.id, node);
  const edgesById = new Map();
  for (const edge of graphData?.edges || []) if (edge?.id && !edgesById.has(edge.id)) edgesById.set(edge.id, edge);
  return {
    ...graphData,
    nodes: [...nodesById.values()].sort((left, right) => compareStableStrings(left.id, right.id)),
    edges: [...edgesById.values()].sort((left, right) => compareStableStrings(left.id, right.id)),
  };
}

function stableValue(value, checkpoint, state) {
  state.visited += 1;
  if (checkpoint && state.visited % 256 === 0) checkpoint();
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry, checkpoint, state));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareStableStrings)
      .map((key) => [key, stableValue(value[key], checkpoint, state)]),
  );
}

export function stableStringify(value, space = 2, options = {}) {
  const checkpoint = typeof options === "function" ? options : options?.checkpoint;
  checkpoint?.();
  const serialized = `${JSON.stringify(stableValue(value, checkpoint, { visited: 0 }), null, space)}\n`;
  checkpoint?.();
  return serialized;
}

export function agentGraphArtifactWithoutDigest(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return artifact;
  const metadata = artifact.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return artifact;
  const knowledgeGraph = metadata.knowledgeGraph;
  if (!knowledgeGraph || typeof knowledgeGraph !== "object" || Array.isArray(knowledgeGraph)) return artifact;
  const { digest: _digest, ...knowledgeGraphWithoutDigest } = knowledgeGraph;
  return {
    ...artifact,
    metadata: {
      ...metadata,
      knowledgeGraph: knowledgeGraphWithoutDigest,
    },
  };
}

export function computeAgentGraphArtifactDigest(artifact) {
  return sha256(stableStringify(agentGraphArtifactWithoutDigest(artifact), 0));
}

function emitCanonicalJson(value, emit, arrayEntry = false) {
  if (value === null) {
    emit("null");
    return;
  }
  if (Array.isArray(value)) {
    emit("[");
    value.forEach((entry, index) => {
      if (index) emit(",");
      emitCanonicalJson(entry, emit, true);
    });
    emit("]");
    return;
  }
  if (typeof value === "object") {
    emit("{");
    let emitted = 0;
    for (const key of Object.keys(value).sort(compareStableStrings)) {
      const child = value[key];
      if (["undefined", "function", "symbol"].includes(typeof child)) continue;
      if (emitted) emit(",");
      emit(JSON.stringify(key));
      emit(":");
      emitCanonicalJson(child, emit);
      emitted += 1;
    }
    emit("}");
    return;
  }
  if (["undefined", "function", "symbol"].includes(typeof value)) {
    if (arrayEntry) emit("null");
    return;
  }
  let encoded;
  try { encoded = JSON.stringify(value); } catch {
    throw new AgentGraphError("artifact_not_json", "Knowledge graph artifact contains a non-JSON value.");
  }
  if (encoded === undefined) {
    if (arrayEntry) emit("null");
    return;
  }
  emit(encoded);
}

export function computeAgentGraphArtifactDigestBounded(artifact, maxBytesRaw) {
  const maxBytes = Number(maxBytesRaw);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new AgentGraphError("artifact_size_limit_invalid", "Knowledge graph artifact size limit must be a positive safe integer.");
  }
  const hasher = crypto.createHash("sha256");
  let byteLength = 0;
  const emit = (chunkRaw) => {
    const chunk = String(chunkRaw);
    byteLength += Buffer.byteLength(chunk, "utf8");
    if (byteLength > maxBytes) {
      throw new AgentGraphError("artifact_too_large", `Knowledge graph artifact exceeds ${maxBytes} bytes.`, {
        actualBytesAtLeast: byteLength,
        maxBytes,
        previousArtifactPreserved: true,
      });
    }
    hasher.update(chunk);
  };
  emitCanonicalJson(agentGraphArtifactWithoutDigest(artifact), emit);
  emit("\n");
  return { digest: hasher.digest("hex"), byteLength };
}

function findForbiddenEmbedding(value, trail = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenEmbedding(value[index], `${trail}[${index}]`);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value)) {
    if (/^embeddings?$/i.test(key)) return `${trail}.${key}`;
    const found = findForbiddenEmbedding(child, `${trail}.${key}`);
    if (found) return found;
  }
  return "";
}

export function validateAgentGraphArtifact(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) errors.push("artifact must be an object");
  if (artifact?.metadata?.knowledgeGraph?.schemaVersion !== AGENT_GRAPH_SCHEMA_VERSION) errors.push("schemaVersion is invalid");
  if (artifact?.metadata?.knowledgeGraph?.vectorStore !== false) errors.push("vectorStore must be false");
  if (artifact?.metadata?.knowledgeGraph?.modelCalls !== 0) errors.push("modelCalls must be zero");
  if (!Array.isArray(artifact?.nodes) || !Array.isArray(artifact?.edges)) errors.push("nodes and edges must be arrays");
  const storedDigest = artifact?.metadata?.knowledgeGraph?.digest;
  if (typeof storedDigest !== "string" || !/^[a-f0-9]{64}$/.test(storedDigest)) {
    errors.push("digest is invalid");
  } else {
    const computedDigest = computeAgentGraphArtifactDigest(artifact);
    if (storedDigest !== computedDigest) errors.push("digest does not match artifact content");
  }
  const nodeIds = new Set();
  for (const node of artifact?.nodes || []) {
    if (!node?.id) errors.push("node id is required");
    else if (nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    else nodeIds.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of artifact?.edges || []) {
    if (!edge?.id) errors.push("edge id is required");
    else if (edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    else edgeIds.add(edge.id);
    if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) errors.push(`dangling edge: ${edge?.id || "unknown"}`);
    for (const field of EVIDENCE_FIELDS) {
      const value = edge?.properties?.[field];
      if (value === undefined || value === null || value === "") errors.push(`edge ${edge?.id || "unknown"} missing ${field}`);
    }
    const excerpt = edge?.properties?.["evidence:excerpt"];
    const excerptHash = edge?.properties?.["evidence:excerptHash"];
    const sourceDigest = edge?.properties?.["evidence:sourceDigest"];
    const parserDigest = edge?.properties?.["evidence:parserDigest"];
    if (typeof excerpt === "string" && excerpt.length > 320) errors.push(`edge ${edge?.id || "unknown"} evidence excerpt exceeds 320 characters`);
    if (typeof excerpt === "string" && excerpt && typeof excerptHash === "string" && excerptHash !== sha256(excerpt)) {
      errors.push(`edge ${edge?.id || "unknown"} evidence excerpt hash does not match`);
    }
    if (typeof sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(sourceDigest)) {
      errors.push(`edge ${edge?.id || "unknown"} evidence source digest is invalid`);
    }
    if (typeof parserDigest !== "string" || !/^[a-f0-9]{64}$/.test(parserDigest)) {
      errors.push(`edge ${edge?.id || "unknown"} evidence parser digest is invalid`);
    }
  }
  const forbiddenEmbeddingPath = findForbiddenEmbedding(artifact);
  if (forbiddenEmbeddingPath) errors.push(`embedding field is forbidden at ${forbiddenEmbeddingPath}`);
  return { ok: errors.length === 0, errors };
}
