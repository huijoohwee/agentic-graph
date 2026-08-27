import { createHash } from "node:crypto";
import net from "node:net";
import path from "node:path";

import { EXTERNAL_TOOL_ARTIFACT_KINDS } from "./external-tool-gateway-contract.js";

export const EXTERNAL_MCP_PROFILES_ENV = "AGENTICGRAPH_EXTERNAL_MCP_PROFILES_JSON";
export const EXTERNAL_MCP_MAX_PROFILES = 20;
export const EXTERNAL_MCP_MAX_TOOLS_PER_PROFILE = 50;

const CANONICAL_ARTIFACT_FIELDS = Object.freeze([
  "title",
  "content",
  "contentType",
  "fileName",
  "workspacePath",
  "sourceUrl",
]);
const CANONICAL_ARTIFACT_FIELD_SET = new Set(CANONICAL_ARTIFACT_FIELDS);
const FORBIDDEN_ARGUMENT_KEYS = /(?:^|[_-])(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|cookie|command|cwd|endpoint|server[_-]?url|headers?|env)(?:$|[_-])/i;
const FORBIDDEN_HTTP_HEADERS = new Set(["connection", "content-length", "cookie", "host", "mcp-session-id", "proxy-authorization", "transfer-encoding"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const ARGUMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;
const SCHEMA_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export class ExternalToolProfileConfigError extends Error {
  constructor(message, code = "invalid_profile_config") {
    super(message);
    this.name = "ExternalToolProfileConfigError";
    this.code = code;
  }
}

const fail = (message) => {
  throw new ExternalToolProfileConfigError(message);
};

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function stableExternalToolJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableExternalToolJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, entryValue]) => typeof entryValue !== "undefined")
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableExternalToolJson(entryValue)}`).join(",")}}`;
}

export const hashExternalToolValue = (value) => createHash("sha256").update(stableExternalToolJson(value)).digest("hex");

export const computeExternalToolSchemaDigest = (schema) => hashExternalToolValue(schema);

export const buildExternalToolCapabilityId = (profileId, toolName) =>
  `kgcap_${createHash("sha256").update(`${profileId}\u0000${toolName}`).digest("hex").slice(0, 32)}`;

export const buildExternalToolCapabilityRevision = (profile, tool) => hashExternalToolValue({
  profileId: profile.id,
  transport: profile.transport,
  tool,
});

const readBoundedString = (value, label, { min = 1, max = 300 } = {}) => {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const text = value.trim();
  if (text.length < min || text.length > max) fail(`${label} must be ${min}-${max} characters.`);
  return text;
};

const assertOnlyKeys = (record, allowedKeys, label) => {
  const unknown = Object.keys(record).filter((key) => !allowedKeys.includes(key));
  if (unknown.length) fail(`${label} contains unsupported keys: ${unknown.join(", ")}.`);
};

const normalizeEnvMapping = (value, label) => {
  if (typeof value === "undefined") return Object.freeze({});
  if (!isRecord(value)) fail(`${label} must be an object mapping target names to host environment variable names.`);
  const entries = Object.entries(value);
  if (entries.length > 32) fail(`${label} may contain at most 32 entries.`);
  const normalized = {};
  for (const [targetName, sourceNameValue] of entries) {
    const sourceName = String(sourceNameValue || "").trim();
    if (!ENV_NAME_PATTERN.test(targetName) || !ENV_NAME_PATTERN.test(sourceName)) {
      fail(`${label} names must use uppercase environment variable syntax.`);
    }
    normalized[targetName] = sourceName;
  }
  return Object.freeze(normalized);
};

const normalizeHeaderMapping = (value) => {
  if (typeof value === "undefined") return Object.freeze({});
  if (!isRecord(value)) fail("transport.headersFromEnv must be an object.");
  const entries = Object.entries(value);
  if (entries.length > 20) fail("transport.headersFromEnv may contain at most 20 entries.");
  const normalized = {};
  for (const [headerNameValue, sourceNameValue] of entries) {
    const headerName = String(headerNameValue || "").trim();
    const lowerName = headerName.toLowerCase();
    const sourceName = String(sourceNameValue || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(headerName) || FORBIDDEN_HTTP_HEADERS.has(lowerName)) {
      fail(`transport.headersFromEnv contains forbidden header ${JSON.stringify(headerName)}.`);
    }
    if (!ENV_NAME_PATTERN.test(sourceName)) fail(`transport.headersFromEnv must reference a valid host environment variable for ${headerName}.`);
    normalized[headerName] = sourceName;
  }
  return Object.freeze(normalized);
};

const isLoopbackHostname = (hostname) => {
  const normalized = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  return net.isIP(normalized) === 4 && normalized.startsWith("127.");
};

const normalizeTransport = (value, env) => {
  if (!isRecord(value)) fail("profile.transport must be an object.");
  const type = String(value.type || "").trim();
  const timeoutMs = Number(value.timeoutMs ?? 30_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    fail("profile.transport.timeoutMs must be an integer between 1000 and 30000.");
  }
  if (type === "stdio") {
    assertOnlyKeys(value, ["type", "command", "args", "cwd", "envFrom", "timeoutMs"], "stdio transport");
    const command = readBoundedString(value.command, "stdio transport.command", { max: 2048 });
    if (!path.isAbsolute(command)) fail("stdio transport.command must be an absolute host-approved path.");
    const cwd = typeof value.cwd === "undefined" ? undefined : readBoundedString(value.cwd, "stdio transport.cwd", { max: 2048 });
    if (cwd && !path.isAbsolute(cwd)) fail("stdio transport.cwd must be an absolute host-approved path.");
    const args = typeof value.args === "undefined" ? [] : value.args;
    if (!Array.isArray(args) || args.length > 64 || args.some((entry) => typeof entry !== "string" || entry.length > 2048 || entry.includes("\u0000"))) {
      fail("stdio transport.args must contain at most 64 bounded strings.");
    }
    return Object.freeze({ type, command, args: Object.freeze([...args]), ...(cwd ? { cwd } : {}), envFrom: normalizeEnvMapping(value.envFrom, "transport.envFrom"), timeoutMs });
  }
  if (type === "streamable-http" || type === "sse") {
    const label = `${type} transport`;
    assertOnlyKeys(value, ["type", "url", "headersFromEnv", "timeoutMs", "developmentLoopback"], label);
    const rawUrl = readBoundedString(value.url, `${label}.url`, { max: 2048 });
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      fail(`${label}.url must be an absolute URL.`);
    }
    if (url.username || url.password || url.search || url.hash) fail(`${label}.url may not contain credentials, query, or fragment.`);
    const developmentLoopback = value.developmentLoopback === true;
    const loopbackAllowed = developmentLoopback && String(env.NODE_ENV || "").toLowerCase() !== "production";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHostname(url.hostname) && loopbackAllowed)) {
      fail(`${label}.url must use HTTPS; loopback HTTP requires developmentLoopback outside production.`);
    }
    return Object.freeze({ type, url: url.href, headersFromEnv: normalizeHeaderMapping(value.headersFromEnv), timeoutMs, developmentLoopback });
  }
  fail("profile.transport.type must be stdio, streamable-http, or sse.");
};

const normalizeAllowedOrigins = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail("tool.result.allowedOrigins must contain 1-20 HTTPS origins.");
  return Object.freeze(Array.from(new Set(value.map((entry) => {
    let url;
    try {
      url = new URL(String(entry || ""));
    } catch {
      fail("tool.result.allowedOrigins entries must be absolute HTTPS origins.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      fail("tool.result.allowedOrigins entries must be exact HTTPS origins without path, credentials, query, or fragment.");
    }
    return url.origin;
  }))));
};

const normalizeJsonPointer = (value, label, { required = false } = {}) => {
  if (typeof value === "undefined" && !required) return undefined;
  const pointer = readBoundedString(value, label, { max: 512 });
  if (!pointer.startsWith("/") || pointer.includes("\u0000")) fail(`${label} must be a bounded JSON pointer.`);
  return pointer;
};

const normalizeResultMapping = (value) => {
  if (!isRecord(value)) fail("tool.result must be an object.");
  assertOnlyKeys(value, ["idPointer", "urlPointer", "titlePointer", "mimeTypePointer", "mimeType", "allowedOrigins"], "tool.result");
  const mimeType = typeof value.mimeType === "undefined" ? undefined : readBoundedString(value.mimeType, "tool.result.mimeType", { max: 160 });
  return Object.freeze({
    idPointer: normalizeJsonPointer(value.idPointer, "tool.result.idPointer"),
    urlPointer: normalizeJsonPointer(value.urlPointer, "tool.result.urlPointer", { required: true }),
    titlePointer: normalizeJsonPointer(value.titlePointer, "tool.result.titlePointer"),
    mimeTypePointer: normalizeJsonPointer(value.mimeTypePointer, "tool.result.mimeTypePointer"),
    ...(mimeType ? { mimeType } : {}),
    allowedOrigins: normalizeAllowedOrigins(value.allowedOrigins),
  });
};

const assertSafeArgumentName = (name, label) => {
  if (!ARGUMENT_NAME_PATTERN.test(name) || FORBIDDEN_ARGUMENT_KEYS.test(name)) fail(`${label} contains forbidden upstream argument name ${JSON.stringify(name)}.`);
};

const normalizeArgumentMapping = (value) => {
  if (!isRecord(value)) fail("tool.argumentMapping must be an object.");
  const entries = Object.entries(value);
  if (!entries.length) fail("tool.argumentMapping must map at least one canonical artifact field.");
  const normalized = {};
  const upstreamNames = new Set();
  for (const [canonicalField, upstreamNameValue] of entries) {
    if (!CANONICAL_ARTIFACT_FIELD_SET.has(canonicalField)) fail(`tool.argumentMapping contains unknown canonical field ${canonicalField}.`);
    const upstreamName = String(upstreamNameValue || "").trim();
    assertSafeArgumentName(upstreamName, "tool.argumentMapping");
    if (upstreamNames.has(upstreamName)) fail(`tool.argumentMapping maps multiple fields to ${upstreamName}.`);
    upstreamNames.add(upstreamName);
    normalized[canonicalField] = upstreamName;
  }
  if (!normalized.content) fail("tool.argumentMapping must map canonical content.");
  return Object.freeze(normalized);
};

const normalizeConstantArguments = (value, reservedNames) => {
  if (typeof value === "undefined") return Object.freeze({});
  if (!isRecord(value)) fail("tool.constantArguments must be an object.");
  if (Object.keys(value).length > 32 || Buffer.byteLength(stableExternalToolJson(value), "utf8") > 32_768) {
    fail("tool.constantArguments exceeds the bounded argument budget.");
  }
  for (const name of Object.keys(value)) {
    assertSafeArgumentName(name, "tool.constantArguments");
    if (reservedNames.has(name)) fail(`tool.constantArguments collides with mapped argument ${name}.`);
  }
  return Object.freeze(structuredClone(value));
};

const normalizeTool = (value, profileId) => {
  if (!isRecord(value)) fail(`Profile ${profileId} tools must be objects.`);
  assertOnlyKeys(value, ["name", "label", "description", "artifactKind", "enabled", "upstreamInputSchemaDigest", "argumentMapping", "constantArguments", "idempotencyArgumentName", "result"], `Profile ${profileId} tool`);
  const name = readBoundedString(value.name, `Profile ${profileId} tool.name`, { max: 128 });
  if (!ARGUMENT_NAME_PATTERN.test(name)) fail(`Profile ${profileId} tool.name is invalid.`);
  const label = readBoundedString(value.label, `Profile ${profileId} tool.label`, { max: 160 });
  const description = typeof value.description === "undefined" ? "" : readBoundedString(value.description, `Profile ${profileId} tool.description`, { max: 500 });
  const artifactKind = String(value.artifactKind || "").trim();
  if (!EXTERNAL_TOOL_ARTIFACT_KINDS.includes(artifactKind)) fail(`Profile ${profileId} tool.artifactKind must be slides or spreadsheet.`);
  const upstreamInputSchemaDigest = String(value.upstreamInputSchemaDigest || "").trim().toLowerCase();
  if (!SCHEMA_DIGEST_PATTERN.test(upstreamInputSchemaDigest)) fail(`Profile ${profileId} tool.upstreamInputSchemaDigest must be a SHA-256 digest.`);
  const argumentMapping = normalizeArgumentMapping(value.argumentMapping);
  const reservedNames = new Set(Object.values(argumentMapping));
  const idempotencyArgumentName = typeof value.idempotencyArgumentName === "undefined" ? undefined : String(value.idempotencyArgumentName || "").trim();
  if (idempotencyArgumentName) {
    assertSafeArgumentName(idempotencyArgumentName, "tool.idempotencyArgumentName");
    if (reservedNames.has(idempotencyArgumentName)) fail("tool.idempotencyArgumentName collides with tool.argumentMapping.");
    reservedNames.add(idempotencyArgumentName);
  }
  return Object.freeze({
    name,
    label,
    description,
    artifactKind,
    enabled: value.enabled !== false,
    upstreamInputSchemaDigest,
    argumentMapping,
    constantArguments: normalizeConstantArguments(value.constantArguments, reservedNames),
    ...(idempotencyArgumentName ? { idempotencyArgumentName } : {}),
    result: normalizeResultMapping(value.result),
  });
};

const normalizeProfile = (value, env) => {
  if (!isRecord(value)) fail("External MCP profiles must be objects.");
  assertOnlyKeys(value, ["id", "label", "enabled", "transport", "tools"], "External MCP profile");
  const id = readBoundedString(value.id, "profile.id", { min: 2, max: 64 }).toLowerCase();
  if (!ID_PATTERN.test(id)) fail("profile.id must use lowercase letters, digits, dot, underscore, or dash.");
  const label = readBoundedString(value.label, `Profile ${id} label`, { max: 160 });
  if (!Array.isArray(value.tools) || value.tools.length < 1 || value.tools.length > EXTERNAL_MCP_MAX_TOOLS_PER_PROFILE) {
    fail(`Profile ${id} must declare 1-${EXTERNAL_MCP_MAX_TOOLS_PER_PROFILE} tools.`);
  }
  const tools = value.tools.map((tool) => normalizeTool(tool, id));
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) fail(`Profile ${id} contains duplicate tool names.`);
  return Object.freeze({ id, label, enabled: value.enabled !== false, transport: normalizeTransport(value.transport, env), tools: Object.freeze(tools) });
};

const toPublicCapability = (profile, tool) => Object.freeze({
  capabilityId: buildExternalToolCapabilityId(profile.id, tool.name),
  capabilityRevision: buildExternalToolCapabilityRevision(profile, tool),
  label: tool.label,
  profileLabel: profile.label,
  description: tool.description,
  artifactKind: tool.artifactKind,
  transportType: profile.transport.type,
  approvalRequired: true,
});

export function loadExternalToolProfileRegistry(options = {}) {
  const env = options.env || process.env;
  const raw = options.rawProfilesJson ?? env[EXTERNAL_MCP_PROFILES_ENV];
  if (typeof raw !== "string" || !raw.trim()) {
    return Object.freeze({ profiles: Object.freeze([]), capabilities: Object.freeze([]), getCapability: () => null });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${EXTERNAL_MCP_PROFILES_ENV} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const rawProfiles = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.profiles : null;
  if (!Array.isArray(rawProfiles) || rawProfiles.length > EXTERNAL_MCP_MAX_PROFILES) {
    fail(`${EXTERNAL_MCP_PROFILES_ENV} must contain a profiles array with at most ${EXTERNAL_MCP_MAX_PROFILES} entries.`);
  }
  const profiles = rawProfiles.map((profile) => normalizeProfile(profile, env));
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) fail("External MCP profile ids must be unique.");
  const capabilities = [];
  for (const profile of profiles.filter((entry) => entry.enabled)) {
    for (const tool of profile.tools.filter((entry) => entry.enabled)) {
      const publicCapability = toPublicCapability(profile, tool);
      capabilities.push(Object.freeze({ ...publicCapability, profile, tool, public: publicCapability }));
    }
  }
  const byId = new Map(capabilities.map((capability) => [capability.capabilityId, capability]));
  return Object.freeze({
    profiles: Object.freeze(profiles),
    capabilities: Object.freeze(capabilities),
    getCapability: (capabilityId) => byId.get(String(capabilityId || "").trim()) || null,
  });
}

export const EXTERNAL_TOOL_CANONICAL_ARTIFACT_FIELDS = CANONICAL_ARTIFACT_FIELDS;
