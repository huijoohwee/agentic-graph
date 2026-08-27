const nonEmptyText = (value) => typeof value === "string" && value.trim().length > 0;
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const EXPORT_PUBLISH_TOOL_NAME = "export.publish";
export const EXPORT_PUBLISH_CONTRACT_VERSION = "agenticgraph-export-publish/v1";
export const EXPORT_KINDS = Object.freeze(["spreadsheet", "slides"]);
export const EXPORT_PROVIDERS = Object.freeze(["google", "microsoft"]);
export const EXPORT_ERROR_CODES = Object.freeze([
  "INVALID_EXPORT_REQUEST",
  "INVALID_EXPORT_RESULT",
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_INVALID",
  "PROVIDER_NOT_CONFIGURED",
  "EXPORT_FAILED",
  "LEDGER_CORRUPT",
  "LEDGER_LOCK_TIMEOUT",
  "LEDGER_WRITE_FAILED",
]);

export const EXPORT_PUBLISH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["artifact_id", "kind"],
  properties: Object.freeze({
    artifact_id: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
    kind: Object.freeze({ type: "string", enum: EXPORT_KINDS }),
    target_provider: Object.freeze({ type: "string", enum: EXPORT_PROVIDERS, default: "google" }),
  }),
});

export const EXPORT_PUBLISH_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "artifact_id",
    "kind",
    "provider",
    "doc_id",
    "url",
    "url_or_file_id",
    "fallback_used",
    "source_sha256",
  ],
  properties: Object.freeze({
    schema: Object.freeze({ const: EXPORT_PUBLISH_CONTRACT_VERSION }),
    artifact_id: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
    kind: Object.freeze({ type: "string", enum: EXPORT_KINDS }),
    provider: Object.freeze({ type: "string", enum: EXPORT_PROVIDERS }),
    doc_id: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
    url: Object.freeze({ type: "string", format: "uri", maxLength: 2048 }),
    url_or_file_id: Object.freeze({ type: "string", minLength: 1, maxLength: 2048 }),
    fallback_used: Object.freeze({ type: "boolean" }),
    source_sha256: Object.freeze({ type: "string", pattern: "^[0-9a-f]{64}$" }),
  }),
});

export const EXPORT_PUBLISH_ERROR_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "error"],
  properties: Object.freeze({
    schema: Object.freeze({ const: EXPORT_PUBLISH_CONTRACT_VERSION }),
    error: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: Object.freeze({
        code: Object.freeze({ type: "string", minLength: 1, maxLength: 128 }),
        message: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 }),
        provider: Object.freeze({ type: "string", enum: EXPORT_PROVIDERS }),
        details: Object.freeze({ type: "object", additionalProperties: true }),
      }),
    }),
  }),
});

export const EXPORT_PUBLISH_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  oneOf: Object.freeze([
    EXPORT_PUBLISH_RESULT_SCHEMA,
    EXPORT_PUBLISH_ERROR_OUTPUT_SCHEMA,
  ]),
});

export class ExportPublishError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ExportPublishError";
    this.code = code;
    this.provider = options.provider ?? null;
    this.retryable = options.retryable === true;
    this.details = isRecord(options.details) ? Object.freeze({ ...options.details }) : null;
  }
}

export function createExportPublishError(code, message, options = {}) {
  if (!EXPORT_ERROR_CODES.includes(code)) {
    throw new TypeError(`Unsupported export error code: ${String(code)}`);
  }
  return new ExportPublishError(code, String(message || code), options);
}

function invalidRequest(message) {
  throw createExportPublishError("INVALID_EXPORT_REQUEST", message);
}

function invalidResult(message) {
  throw createExportPublishError("INVALID_EXPORT_RESULT", message);
}

function normalizedArtifactId(value, fail) {
  if (!nonEmptyText(value)) fail("artifact_id must be a non-empty string.");
  const artifactId = value.trim();
  if (artifactId.length > 512 || /[\u0000-\u001f\u007f]/.test(artifactId)) {
    fail("artifact_id must be at most 512 characters and contain no control characters.");
  }
  return artifactId;
}

function assertKnownKeys(record, allowed, fail) {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail(`Unsupported field(s): ${unknown.sort().join(", ")}.`);
}

export function validateExportPublishRequest(input) {
  if (!isRecord(input)) invalidRequest("export.publish input must be an object.");
  assertKnownKeys(input, ["artifact_id", "kind", "target_provider"], invalidRequest);
  const artifactId = normalizedArtifactId(input.artifact_id, invalidRequest);
  const kind = String(input.kind || "").trim();
  if (!EXPORT_KINDS.includes(kind)) {
    invalidRequest(`kind must be one of: ${EXPORT_KINDS.join(", ")}.`);
  }
  const targetProvider = input.target_provider === undefined
    ? "google"
    : String(input.target_provider || "").trim();
  if (!EXPORT_PROVIDERS.includes(targetProvider)) {
    invalidRequest(`target_provider must be one of: ${EXPORT_PROVIDERS.join(", ")}.`);
  }
  return Object.freeze({ artifact_id: artifactId, kind, target_provider: targetProvider });
}

function validatedHttpsUrl(value) {
  if (!nonEmptyText(value) || value.length > 2048) invalidResult("url must be a bounded HTTPS URL.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invalidResult("url must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    invalidResult("url must use HTTPS and must not contain user credentials.");
  }
  return parsed.toString();
}

export function validateExportPublishResult(input) {
  if (!isRecord(input)) invalidResult("export.publish result must be an object.");
  assertKnownKeys(input, [
    "schema",
    "artifact_id",
    "kind",
    "provider",
    "doc_id",
    "url",
    "url_or_file_id",
    "fallback_used",
    "source_sha256",
  ], invalidResult);
  if (input.schema !== EXPORT_PUBLISH_CONTRACT_VERSION) {
    invalidResult(`schema must be ${EXPORT_PUBLISH_CONTRACT_VERSION}.`);
  }
  const artifactId = normalizedArtifactId(input.artifact_id, invalidResult);
  const kind = String(input.kind || "").trim();
  if (!EXPORT_KINDS.includes(kind)) invalidResult(`Unsupported export kind: ${kind || "<empty>"}.`);
  const provider = String(input.provider || "").trim();
  if (!EXPORT_PROVIDERS.includes(provider)) invalidResult(`Unsupported export provider: ${provider || "<empty>"}.`);
  if (!nonEmptyText(input.doc_id) || input.doc_id.length > 512) {
    invalidResult("doc_id must be a non-empty string of at most 512 characters.");
  }
  if (typeof input.fallback_used !== "boolean") invalidResult("fallback_used must be a boolean.");
  if (!/^[0-9a-f]{64}$/.test(String(input.source_sha256 || ""))) {
    invalidResult("source_sha256 must be a lowercase SHA-256 digest.");
  }
  const url = validatedHttpsUrl(input.url);
  const urlOrFileId = nonEmptyText(input.url_or_file_id) ? input.url_or_file_id.trim() : "";
  if (!urlOrFileId || urlOrFileId.length > 2048) {
    invalidResult("url_or_file_id must be a non-empty string of at most 2048 characters.");
  }
  return Object.freeze({
    schema: EXPORT_PUBLISH_CONTRACT_VERSION,
    artifact_id: artifactId,
    kind,
    provider,
    doc_id: input.doc_id.trim(),
    url,
    url_or_file_id: urlOrFileId,
    fallback_used: input.fallback_used,
    source_sha256: input.source_sha256,
  });
}

export function createExportIdentity(input) {
  if (!isRecord(input)) throw new TypeError("Export identity must be an object.");
  const artifactId = normalizedArtifactId(input.artifact_id, (message) => { throw new TypeError(message); });
  const provider = String(input.provider || "").trim();
  const kind = String(input.kind || "").trim();
  if (!EXPORT_PROVIDERS.includes(provider)) throw new TypeError(`Unsupported export provider: ${provider}.`);
  if (!EXPORT_KINDS.includes(kind)) throw new TypeError(`Unsupported export kind: ${kind}.`);
  return Object.freeze({
    artifact_id: artifactId,
    provider,
    kind,
    key: JSON.stringify([artifactId, provider, kind]),
  });
}
