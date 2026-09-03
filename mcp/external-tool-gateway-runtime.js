import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";

import {
  EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA,
  EXTERNAL_TOOL_GATEWAY_TOOL_NAMES,
  isExternalToolGatewayToolName,
} from "./external-tool-gateway-contract.js";
import {
  EXTERNAL_MCP_APPROVAL_SECRET_ENV,
  ExternalToolApprovalError,
  authorizeExternalToolAction,
  computeExternalToolActionDigest,
  createExternalToolApprovalToken,
  verifyExternalToolApproval,
} from "./external-tool-approval.js";
import {
  ExternalToolProfileConfigError,
  computeExternalToolSchemaDigest,
  hashExternalToolValue,
  loadExternalToolProfileRegistry,
} from "./external-tool-profile-registry.js";
import { createExternalToolSession } from "./external-tool-session.js";

const MAX_TOOL_LIST_PAGES = 10;
const MAX_TOOL_LIST_COUNT = 500;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 6_000;
const MAX_APPROVAL_RESERVATIONS = 1_000;
const MAX_CONSUMED_APPROVALS = 10_000;
const canonicalArtifactValidator = new AjvJsonSchemaValidator().getValidator(EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA);
const sourceDigest = (relativePaths) => {
  const hash = createHash("sha256");
  for (const relativePath of relativePaths) hash.update(relativePath).update("\0").update(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)))).update("\0");
  return hash.digest("hex");
};
export const EXTERNAL_TOOL_GATEWAY_OWNER_EVIDENCE = Object.freeze({
  ownerId: "agentic-graph.external-tool-gateway",
  implementationRevision: "1.0.0",
  implementationDigest: sourceDigest(["./external-tool-gateway-runtime.js", "./external-tool-gateway-contract.js", "./external-tool-profile-registry.js", "./external-tool-approval.js", "./external-tool-session.js"]),
});

class ExternalToolGatewayError extends Error {
  constructor(code, message, actionDigest = "") {
    super(message);
    this.name = "ExternalToolGatewayError";
    this.code = code;
    this.actionDigest = actionDigest;
  }
}

const readLimit = (value, fallback, max) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
};
const combineAbortSignals = (...signals) => {
  const active = signals.filter((signal) => signal && typeof signal.addEventListener === "function");
  if (active.length === 1) return { signal: active[0], dispose: () => {} };
  const controller = new AbortController();
  const listeners = [];
  for (const signal of active) {
    const abort = () => { if (!controller.signal.aborted) controller.abort(signal.reason); };
    if (signal.aborted) abort();
    else { signal.addEventListener("abort", abort, { once: true }); listeners.push([signal, abort]); }
  }
  return { signal: controller.signal, dispose: () => { for (const [signal, abort] of listeners) signal.removeEventListener("abort", abort); } };
};

const assertBoundedJson = (value) => {
  let nodes = 0;
  const visit = (entry, depth) => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) throw new ExternalToolGatewayError("artifact_too_complex", "Canonical artifact exceeds the bounded JSON complexity budget.");
    if (entry === null || typeof entry !== "object") return;
    if (Array.isArray(entry)) {
      if (entry.length > 1_000) throw new ExternalToolGatewayError("artifact_too_complex", "Canonical artifact arrays may contain at most 1000 entries.");
      for (const item of entry) visit(item, depth + 1);
      return;
    }
    for (const item of Object.values(entry)) visit(item, depth + 1);
  };
  visit(value, 0);
};

const validateCanonicalArtifact = (artifact) => {
  assertBoundedJson(artifact);
  const validation = canonicalArtifactValidator(artifact);
  if (!validation.valid) throw new ExternalToolGatewayError("invalid_artifact", `Canonical artifact is invalid: ${validation.errorMessage}`);
  if (!artifact.title.trim() || !artifact.content.trim()) throw new ExternalToolGatewayError("invalid_artifact", "Canonical artifact title and content must be non-empty.");
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ A-Za-z0-9!#$&^_.+=-]+)?$/.test(artifact.contentType)) {
    throw new ExternalToolGatewayError("invalid_artifact", "Canonical artifact contentType must be a valid bounded MIME type.");
  }
  if (artifact.fileName === "." || artifact.fileName === "..") throw new ExternalToolGatewayError("invalid_artifact", "Canonical artifact fileName is invalid.");
  const workspacePath = typeof artifact.workspacePath === "string" ? artifact.workspacePath : "";
  if (workspacePath) {
    const pathOnly = workspacePath.slice("workspace:/".length);
    let decoded = pathOnly;
    try {
      decoded = decodeURIComponent(pathOnly);
    } catch {
      throw new ExternalToolGatewayError("invalid_workspace_path", "workspacePath contains invalid encoding.");
    }
    const segments = decoded.split("/");
    if (!pathOnly || decoded.includes("\\") || decoded.includes("\u0000") || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      throw new ExternalToolGatewayError("invalid_workspace_path", "workspacePath must be a canonical workspace:/ reference without traversal.");
    }
  }
  if (artifact.sourceUrl) {
    let sourceUrl;
    try {
      sourceUrl = new URL(artifact.sourceUrl);
    } catch {
      throw new ExternalToolGatewayError("invalid_source_url", "sourceUrl must be an absolute HTTPS URL.");
    }
    if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password) {
      throw new ExternalToolGatewayError("invalid_source_url", "sourceUrl must be HTTPS and may not contain credentials.");
    }
  }
  return Object.freeze({ ...artifact });
};

const createArtifactSchemaForCapability = (capability) => {
  const mappedFields = new Set(Object.keys(capability.tool.argumentMapping));
  const properties = Object.fromEntries(
    Object.entries(EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA.properties).filter(([key]) => mappedFields.has(key) || ["title", "content", "contentType"].includes(key)),
  );
  return Object.freeze({ ...EXTERNAL_TOOL_CANONICAL_ARTIFACT_SCHEMA, properties });
};

const validateAgainstSchema = (schema, value, code, label) => {
  let validator;
  try {
    validator = new AjvJsonSchemaValidator().getValidator(schema);
  } catch {
    throw new ExternalToolGatewayError("upstream_schema_invalid", "Approved upstream tool exposed an unsupported input schema.");
  }
  const validation = validator(value);
  if (!validation.valid) throw new ExternalToolGatewayError(code, `${label}.`);
};

const mapArtifactToUpstreamArguments = (capability, artifact, idempotencyKey) => {
  const upstreamArguments = structuredClone(capability.tool.constantArguments);
  for (const [canonicalField, upstreamName] of Object.entries(capability.tool.argumentMapping)) {
    if (typeof artifact[canonicalField] !== "undefined") upstreamArguments[upstreamName] = artifact[canonicalField];
  }
  if (capability.tool.idempotencyArgumentName) upstreamArguments[capability.tool.idempotencyArgumentName] = idempotencyKey;
  return upstreamArguments;
};

const readJsonPointer = (value, pointer) => {
  if (!pointer) return undefined;
  let current = value;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || typeof current !== "object" || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
};

const readBoundedResultString = (value, maxLength) => {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
};

const sanitizeExternalWebUrl = (rawValue, allowedOrigins) => {
  const rawUrl = readBoundedResultString(rawValue, 4096);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ExternalToolGatewayError("invalid_upstream_receipt", "External MCP result did not contain a valid artifact URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowedOrigins.includes(url.origin)) {
    throw new ExternalToolGatewayError("invalid_upstream_receipt", "External MCP artifact URL is outside the approved HTTPS origins.");
  }
  return `${url.origin}${url.pathname}`;
};

const buildSanitizedReceipt = ({ capability, artifact, idempotencyKey, result }) => {
  const mapping = capability.tool.result;
  const webUrl = sanitizeExternalWebUrl(readJsonPointer(result, mapping.urlPointer), mapping.allowedOrigins);
  const rawExternalId = readBoundedResultString(readJsonPointer(result, mapping.idPointer), 512);
  const externalId = /^[A-Za-z0-9._:-]{1,512}$/.test(rawExternalId) ? rawExternalId : null;
  const title = readBoundedResultString(readJsonPointer(result, mapping.titlePointer), 300) || artifact.title;
  const mappedMimeType = readBoundedResultString(readJsonPointer(result, mapping.mimeTypePointer), 160)
    || mapping.mimeType
    || artifact.contentType;
  const mimeType = /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ A-Za-z0-9!#$&^_.+=-]+)?$/.test(mappedMimeType)
    ? mappedMimeType
    : artifact.contentType;
  const receiptBase = {
    externalId,
    webUrl,
    title,
    mimeType,
    artifactKind: capability.artifactKind,
    capabilityId: capability.capabilityId,
    capabilityRevision: capability.capabilityRevision,
    idempotencyKey,
  };
  return Object.freeze({ ...receiptBase, digest: hashExternalToolValue(receiptBase) });
};

const listAllTools = async (session) => {
  const tools = [];
  let cursor;
  for (let page = 0; page < MAX_TOOL_LIST_PAGES; page += 1) {
    const response = await session.listTools(cursor);
    const pageTools = Array.isArray(response?.tools) ? response.tools : [];
    tools.push(...pageTools);
    if (tools.length > MAX_TOOL_LIST_COUNT) throw new ExternalToolGatewayError("upstream_catalog_too_large", "External MCP tool catalog exceeds the bounded tool limit.");
    cursor = typeof response?.nextCursor === "string" && response.nextCursor ? response.nextCursor : undefined;
    if (!cursor) return tools;
  }
  throw new ExternalToolGatewayError("upstream_catalog_too_large", "External MCP tool catalog exceeds the bounded page limit.");
};

const toFailure = (error, fallbackDigest = "") => {
  const known = error instanceof ExternalToolGatewayError || error instanceof ExternalToolApprovalError || error instanceof ExternalToolProfileConfigError;
  const code = known && typeof error.code === "string" ? error.code : "external_mcp_call_failed";
  const safeMessages = new Set([
    "approval_required",
    "approval_gate_mismatch",
    "approval_digest_mismatch",
    "approval_malformed",
    "approval_expired",
    "approval_invalid_signature",
    "approval_consumed",
    "approval_reserved",
    "approval_reservations_full",
    "approval_ledger_full",
    "approval_not_configured",
    "dispatch_marker_required",
    "capability_not_found",
    "capability_revision_mismatch",
    "integration_profile_drift",
    "integration_not_replay_safe",
    "idempotency_conflict",
    "invalid_artifact",
    "invalid_workspace_path",
    "invalid_source_url",
    "artifact_too_complex",
    "upstream_tool_unavailable",
    "upstream_schema_changed",
    "upstream_arguments_invalid",
    "upstream_schema_invalid",
    "upstream_catalog_too_large",
    "upstream_tool_error",
    "invalid_upstream_receipt",
  ]);
  const message = safeMessages.has(code) && error instanceof Error ? error.message : "External MCP invocation failed without exposing upstream details.";
  const actionDigest = known && typeof error.actionDigest === "string" && error.actionDigest ? error.actionDigest : fallbackDigest;
  return { ok: false, ...(actionDigest ? { actionDigest } : {}), error: { code, message: message.slice(0, 640) } };
};

export function createExternalToolGatewayRuntime(options = {}) {
  const env = options.env || process.env;
  const registry = options.registry || loadExternalToolProfileRegistry({ env });
  const approvalSecret = options.approvalSecret ?? env[EXTERNAL_MCP_APPROVAL_SECRET_ENV];
  const consumedTokenIds = typeof options.consumedTokenIds === "undefined" ? new Set() : options.consumedTokenIds;
  const consumedTokenExpiries = typeof options.consumedTokenExpiries === "undefined" ? new Map() : options.consumedTokenExpiries;
  const maxConsumedTokenIds = options.maxConsumedTokenIds ?? MAX_CONSUMED_APPROVALS;
  const approvalReservations = typeof options.approvalReservations === "undefined" ? new Set() : options.approvalReservations;
  const maxApprovalReservations = options.maxApprovalReservations ?? MAX_APPROVAL_RESERVATIONS;
  if (!(consumedTokenIds instanceof Set) || !(consumedTokenExpiries instanceof Map) || !Number.isInteger(maxConsumedTokenIds) || maxConsumedTokenIds < 1 || maxConsumedTokenIds > 100_000 || consumedTokenIds.size > maxConsumedTokenIds || consumedTokenExpiries.size > maxConsumedTokenIds || [...consumedTokenExpiries].some(([tokenId, expiresAt]) => !consumedTokenIds.has(tokenId) || typeof tokenId !== "string" || tokenId.length < 16 || tokenId.length > 128 || !Number.isInteger(expiresAt))) throw new TypeError("External consumed approval ledger bounds are invalid.");
  if (!(approvalReservations instanceof Set) || approvalReservations.size > maxApprovalReservations || !Number.isInteger(maxApprovalReservations) || maxApprovalReservations < 1 || maxApprovalReservations > 10_000) throw new TypeError("External approval reservation bounds are invalid.");
  const receiptCache = typeof options.receiptCache === "undefined" ? new Map() : options.receiptCache;
  const createSession = options.createSession || ((profile, sessionOptions) => createExternalToolSession(profile, sessionOptions));
  if (!(receiptCache instanceof Map) || typeof createSession !== "function") throw new TypeError("External gateway host ledgers and session owner are invalid.");
  const now = options.now;
  const readNow = () => { const value = typeof now === "function" ? now() : typeof now === "undefined" ? Date.now() : now; if (!Number.isFinite(value)) throw new TypeError("External gateway clock must return epoch milliseconds."); return Math.floor(value); };
  const pruneConsumedApprovals = () => {
    const nowMs = readNow();
    for (const [tokenId, expiresAt] of consumedTokenExpiries) if (expiresAt <= nowMs) { consumedTokenExpiries.delete(tokenId); consumedTokenIds.delete(tokenId); }
  };

  const listCapabilities = (args = {}, query = "") => {
    const artifactKinds = new Set(Array.isArray(args.artifactKinds) ? args.artifactKinds : []);
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const limit = readLimit(args.limit, normalizedQuery ? 20 : 50, normalizedQuery ? 50 : 100);
    const capabilities = registry.capabilities
      .filter((capability) => artifactKinds.size === 0 || artifactKinds.has(capability.artifactKind))
      .filter((capability) => !normalizedQuery || `${capability.label} ${capability.profileLabel} ${capability.description} ${capability.artifactKind}`.toLowerCase().includes(normalizedQuery))
      .slice(0, limit)
      .map((capability) => capability.public);
    return { ok: true, capabilities, count: capabilities.length };
  };

  const resolveCapability = (capabilityId, capabilityRevision) => {
    const capability = registry.getCapability(capabilityId);
    if (!capability) throw new ExternalToolGatewayError("capability_not_found", "External MCP capability is unavailable or not approved.");
    if (typeof capabilityRevision === "string" && capability.capabilityRevision !== capabilityRevision) {
      throw new ExternalToolGatewayError("capability_revision_mismatch", "External MCP capability revision changed; describe and approve it again.");
    }
    return capability;
  };
  const projectApplicationIntegration = (capability) => Object.freeze({
    integrationProfileId: `kgip_${hashExternalToolValue({ id: capability.profile.id }).slice(0, 32)}`,
    integrationProfileRevision: hashExternalToolValue(capability.profile),
    capabilityId: capability.capabilityId,
    capabilityRevision: capability.capabilityRevision,
    schemaDigest: capability.tool.upstreamInputSchemaDigest,
    artifactKind: capability.artifactKind,
    approvalRequired: true,
    replay: capability.tool.idempotencyArgumentName ? "idempotency-key" : "unsupported",
  });
  const listApplicationIntegrations = () => Object.freeze(registry.capabilities.map(projectApplicationIntegration).sort((left, right) => left.capabilityId < right.capabilityId ? -1 : left.capabilityId > right.capabilityId ? 1 : 0));
  const resolveApplicationIntegration = (config = {}) => {
    try {
      const capability = resolveCapability(config.capabilityId, config.capabilityRevision);
      const evidence = projectApplicationIntegration(capability);
      if (evidence.integrationProfileId !== config.integrationProfileId || evidence.integrationProfileRevision !== config.integrationProfileRevision) throw new ExternalToolGatewayError("integration_profile_drift", "The opaque integration profile changed; replan explicitly.");
      if (evidence.replay !== "idempotency-key") throw new ExternalToolGatewayError("integration_not_replay_safe", "External application execution requires an upstream idempotency binding.");
      return { ok: true, evidence };
    } catch (error) { return toFailure(error); }
  };
  const validateApplicationArtifact = (artifact) => {
    try { const normalized = validateCanonicalArtifact(artifact); return { ok: true, artifactDigest: hashExternalToolValue(normalized) }; }
    catch (error) { return toFailure(error); }
  };

  const prepareCall = (args) => {
    const capability = resolveCapability(args.capabilityId, args.capabilityRevision);
    const artifact = validateCanonicalArtifact(args.artifact);
    const idempotencyKey = String(args.idempotencyKey || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new ExternalToolGatewayError("invalid_artifact", "idempotencyKey is invalid.");
    const actionDigest = computeExternalToolActionDigest({
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.capabilityRevision,
      artifact,
      idempotencyKey,
    });
    return { capability, artifact, idempotencyKey, actionDigest };
  };

  const call = async (args = {}, internalContext = {}) => {
    let actionDigest = "";
    let session = null;
    let reservedTokenId = "";
    let detachSignals = () => {};
    try {
      const prepared = prepareCall(args);
      ({ actionDigest } = prepared);
      const cacheKey = `${prepared.capability.capabilityId}\u0000${prepared.idempotencyKey}`;
      const cached = receiptCache.get(cacheKey);
      if (cached) {
        if (cached.actionDigest !== actionDigest) throw new ExternalToolGatewayError("idempotency_conflict", "idempotencyKey is already bound to a different external artifact action.", actionDigest);
        return { ok: true, cached: true, actionDigest, receipt: cached.receipt };
      }
      if (typeof internalContext.markSideEffectDispatched !== "function") throw new ExternalToolGatewayError("dispatch_marker_required", "External mutation requires a host dispatch marker.", actionDigest);
      pruneConsumedApprovals();
      const verifiedApproval = verifyExternalToolApproval({ token: args.approvalToken, secret: approvalSecret, actionDigest, consumedTokenIds, now });
      if (consumedTokenIds.size >= maxConsumedTokenIds) throw new ExternalToolGatewayError("approval_ledger_full", "The bounded consumed-approval ledger is full.", actionDigest);
      if (approvalReservations.has(verifiedApproval.tokenId)) throw new ExternalToolGatewayError("approval_reserved", "Approval token is already reserved by an in-flight external action.", actionDigest);
      if (approvalReservations.size >= maxApprovalReservations) throw new ExternalToolGatewayError("approval_reservations_full", "The bounded approval reservation ledger is full.", actionDigest);
      approvalReservations.add(verifiedApproval.tokenId);
      reservedTokenId = verifiedApproval.tokenId;
      const combined = combineAbortSignals(AbortSignal.timeout(prepared.capability.profile.transport.timeoutMs), args.signal);
      const deadlineSignal = combined.signal;
      detachSignals = combined.dispose;
      deadlineSignal.throwIfAborted();
      session = await createSession(prepared.capability.profile, { env, signal: deadlineSignal });
      const liveTools = await listAllTools(session);
      const liveTool = liveTools.find((tool) => tool?.name === prepared.capability.tool.name);
      if (!liveTool) throw new ExternalToolGatewayError("upstream_tool_unavailable", "Approved external MCP tool is unavailable.", actionDigest);
      if (computeExternalToolSchemaDigest(liveTool.inputSchema) !== prepared.capability.tool.upstreamInputSchemaDigest) {
        throw new ExternalToolGatewayError("upstream_schema_changed", "Approved external MCP tool schema changed; the host profile must be reviewed.", actionDigest);
      }
      const upstreamArguments = mapArtifactToUpstreamArguments(prepared.capability, prepared.artifact, prepared.idempotencyKey);
      validateAgainstSchema(liveTool.inputSchema, upstreamArguments, "upstream_arguments_invalid", "Mapped external MCP arguments are invalid");
      deadlineSignal.throwIfAborted();
      pruneConsumedApprovals();
      if (consumedTokenIds.size >= maxConsumedTokenIds) throw new ExternalToolGatewayError("approval_ledger_full", "The bounded consumed-approval ledger is full.", actionDigest);
      const authorization = authorizeExternalToolAction({
        token: args.approvalToken,
        secret: approvalSecret,
        actionDigest,
        consumedTokenIds,
        now,
      });
      consumedTokenExpiries.set(authorization.tokenId, Number(args.approvalToken.expiresAt));
      if (typeof internalContext.markSideEffectDispatched === "function") internalContext.markSideEffectDispatched(actionDigest);
      const result = await session.callTool(prepared.capability.tool.name, upstreamArguments);
      if (result?.isError === true) throw new ExternalToolGatewayError("upstream_tool_error", "External MCP tool returned an error without exposing raw provider output.", actionDigest);
      const receipt = buildSanitizedReceipt({ ...prepared, result });
      receiptCache.set(cacheKey, Object.freeze({ actionDigest, receipt }));
      return { ok: true, cached: false, actionDigest, receipt };
    } catch (error) {
      return toFailure(error, actionDigest);
    } finally {
      detachSignals();
      if (reservedTokenId) approvalReservations.delete(reservedTokenId);
      try { Promise.resolve(session?.close?.()).catch(() => undefined); } catch { /* Cleanup cannot delay or replace the authoritative mutation result. */ }
    }
  };

  const createApprovalToken = (callArgs, approvalOptions = {}) => {
    const prepared = prepareCall(callArgs);
    return createExternalToolApprovalToken({
      actionDigest: prepared.actionDigest,
      secret: approvalOptions.secret ?? approvalSecret,
      now: approvalOptions.now ?? now,
      ttlMs: approvalOptions.ttlMs,
      tokenId: approvalOptions.tokenId,
    });
  };

  const run = async (toolName, args = {}) => {
    if (toolName === EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.catalog) return listCapabilities(args);
    if (toolName === EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.search) return listCapabilities(args, args.query);
    if (toolName === EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.describe) {
      try {
        const capability = resolveCapability(args.capabilityId);
        return { ok: true, capability: capability.public, artifactSchema: createArtifactSchemaForCapability(capability) };
      } catch (error) {
        return toFailure(error);
      }
    }
    if (toolName === EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.call) return call(args, { markSideEffectDispatched: () => {} });
    throw new ExternalToolGatewayError("unknown_gateway_tool", "Unknown external MCP gateway tool.");
  };

  return Object.freeze({
    ownerEvidence: EXTERNAL_TOOL_GATEWAY_OWNER_EVIDENCE,
    listApplicationIntegrations,
    resolveApplicationIntegration,
    validateApplicationArtifact,
    catalog: (args) => listCapabilities(args),
    search: (args) => listCapabilities(args, args?.query),
    describe: (args) => run(EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.describe, args),
    call,
    createApprovalToken,
    run,
  });
}

let defaultRuntime;

export function getExternalToolGatewayRuntime() {
  defaultRuntime ||= createExternalToolGatewayRuntime();
  return defaultRuntime;
}

export async function runExternalToolGatewayTool(toolName, args = {}) {
  if (!isExternalToolGatewayToolName(toolName)) throw new ExternalToolGatewayError("unknown_gateway_tool", "Unknown external MCP gateway tool.");
  return getExternalToolGatewayRuntime().run(toolName, args);
}
