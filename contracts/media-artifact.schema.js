// =============================================================================
// Media artifact contract — canonical schema + pure helpers (SSOT)
// agentic-graph-widget-canvas-media spec · Task 1 · Requirements R3.3, R3.4, R3.5, R6.1
// design.md › Data Models (ArtifactRecord, ProvenanceChain, ResponsiveLayoutMetadata)
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The widget-canvas-media feature persists every generated image/video to a
// durable Cloudflare R2 surface and records only the DURABLE url — never the
// ephemeral provider url (R3.4/R3.5). This module is the SINGLE SOURCE OF TRUTH
// for:
//   - the canonical R2 bucket name + Cloudflare account id (R3.3),
//   - the R2 object key scheme `runs/{runId}/{stageId}/{shotId}.{ext}` (R3.3),
//   - the durable replay url builder (served by the agentic-graph-storage worker),
//   - the cross-tier shapes ArtifactRecord / ProvenanceChain /
//     ResponsiveLayoutMetadata,
//   - a dependency-free `sha256Hex` content-hash helper used for R2 dedupe.
//
// It is framework-agnostic and dependency-free: plain ESM reachable by the Node
// tests, the Cloudflare Worker bundle, and the canvas SPA. Validators are PURE
// and TOTAL — they never throw and make zero network calls. Platform target is
// Cloudflare only: no Vercel/AWS identifiers appear here.
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical Cloudflare storage constants (R3.3)
// -----------------------------------------------------------------------------

/** Cloudflare account that owns the media R2 bucket. */
export const AGENTIC_OS_CLOUDFLARE_ACCOUNT_ID = "170e89fdb8679ff2fcc2900e25ed04f4";

/** Durable R2 bucket that holds persisted media artifacts. */
export const AGENTIC_OS_MEDIA_BUCKET = "agentic-graph-media";

/** Public host that serves replayable media through the agentic-graph-storage worker. */
export const AGENTIC_OS_MEDIA_HOST = "airvio.co";

/** Path prefix of the storage-worker media route. */
export const AGENTIC_OS_MEDIA_ROUTE_PREFIX = "/api/storage/media/";

/** Canonical R2 key prefix; full key is `runs/{runId}/{stageId}/{shotId}.{ext}`. */
export const AGENTIC_OS_MEDIA_KEY_PREFIX = "runs";

/** Artifact kinds the canvas renders as widgets/panels. */
export const MEDIA_ARTIFACT_KINDS = Object.freeze(["text", "image", "audio", "video"]);

/** The five required responsive proof classes (R1.2). `[width, height]`. */
export const RESPONSIVE_PROOF_CLASSES = Object.freeze([
  Object.freeze([320, 640]),
  Object.freeze([390, 844]),
  Object.freeze([768, 1024]),
  Object.freeze([1366, 768]),
  Object.freeze([1920, 1080]),
]);

/** Canonical logical presentation frame (R1.1). */
export const MEDIA_LOGICAL_FRAME = Object.freeze({ w: 1920, h: 1080 });

/**
 * Field names that MUST NEVER appear on a persisted artifact record. The
 * contract stores only the durable R2 url; any ephemeral provider url is a
 * leak of an expiring reference (R3.5).
 */
export const FORBIDDEN_EPHEMERAL_FIELDS = Object.freeze([
  "ephemeralUrl",
  "ephemeralProviderUrl",
  "providerUrl",
  "tempUrl",
  "temporaryUrl",
  "signedUrl",
]);

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafePathSegment(value) {
  // A single non-empty path segment with no separators or traversal.
  if (!isNonEmptyString(value)) return false;
  if (/[\\/]/.test(value)) return false;
  if (value === "." || value === "..") return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

function normalizeExt(ext) {
  return String(ext || "").trim().replace(/^\.+/, "").toLowerCase();
}

// -----------------------------------------------------------------------------
// R2 key + durable url helpers (R3.3, R3.4)
// -----------------------------------------------------------------------------

/**
 * Build the canonical R2 object key for a media artifact.
 * `runs/{runId}/{stageId}/{shotId}.{ext}` (R3.3).
 *
 * @param {{ runId: string, stageId: string, shotId: string, ext: string }} args
 * @returns {string}
 * @throws {TypeError} when any segment is missing/unsafe or ext is empty.
 */
export function mediaObjectKey({ runId, stageId, shotId, ext } = {}) {
  for (const [name, value] of [["runId", runId], ["stageId", stageId], ["shotId", shotId]]) {
    if (!isSafePathSegment(value)) {
      throw new TypeError(`mediaObjectKey: ${name} must be a safe non-empty path segment`);
    }
  }
  const normalizedExt = normalizeExt(ext);
  if (!normalizedExt || !/^[a-z0-9]+$/.test(normalizedExt)) {
    throw new TypeError("mediaObjectKey: ext must be a non-empty alphanumeric extension");
  }
  return `${AGENTIC_OS_MEDIA_KEY_PREFIX}/${runId}/${stageId}/${shotId}.${normalizedExt}`;
}

/**
 * Build the durable, replayable R2 url served by the agentic-graph-storage worker.
 * `https://airvio.co/api/storage/media/runs/{runId}/{stageId}/{shotId}.{ext}` (R3.4).
 *
 * @param {{ runId: string, stageId: string, shotId: string, ext: string }} args
 * @returns {string}
 */
export function buildDurableR2Url(args) {
  const key = mediaObjectKey(args);
  return `https://${AGENTIC_OS_MEDIA_HOST}${AGENTIC_OS_MEDIA_ROUTE_PREFIX}${key}`;
}

/** True when `url` is a durable agentic-graph-media replay url (and not ephemeral). */
export function isDurableR2Url(url) {
  if (!isNonEmptyString(url)) return false;
  const prefix = `https://${AGENTIC_OS_MEDIA_HOST}${AGENTIC_OS_MEDIA_ROUTE_PREFIX}${AGENTIC_OS_MEDIA_KEY_PREFIX}/`;
  return url.startsWith(prefix);
}

// -----------------------------------------------------------------------------
// Content-hash helper (R3.9 dedupe key) — dependency-free, env-neutral
// -----------------------------------------------------------------------------

/**
 * Compute the lowercase hex SHA-256 of the given bytes. Uses the platform
 * WebCrypto `crypto.subtle` available in Node 18+ and Cloudflare Workers, so
 * the helper carries no dependency and behaves identically across tiers.
 *
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} bytes
 * @returns {Promise<string>} 64-char lowercase hex digest.
 */
export async function sha256Hex(bytes) {
  const subtle = globalThis?.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("sha256Hex: WebCrypto crypto.subtle is unavailable in this runtime");
  }
  const view = toUint8Array(bytes);
  const digest = await subtle.digest("SHA-256", view);
  return bufferToHex(digest);
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  throw new TypeError("sha256Hex: bytes must be an ArrayBuffer or ArrayBufferView");
}

function bufferToHex(buffer) {
  const view = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// -----------------------------------------------------------------------------
// ProvenanceChain validator (R6.1)
// -----------------------------------------------------------------------------

/** Required scalar reference components of a complete Provenance_Chain (R6.1). */
export const PROVENANCE_REQUIRED_REFS = Object.freeze(["goalRef", "briefRef", "planRef"]);

/**
 * Validate a Provenance_Chain. A COMPLETE chain links the artifact to its goal,
 * source brief, plan, tool calls, and verification checks (R6.1).
 *
 * @param {unknown} chain
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateProvenanceChain(chain) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(chain)) {
    add("", "Provenance_Chain must be a non-null object");
    return { valid: false, errors };
  }

  for (const ref of PROVENANCE_REQUIRED_REFS) {
    if (!isNonEmptyString(chain[ref])) {
      add(ref, "must be a non-empty string reference (R6.1)");
    }
  }

  validateProvenanceList(chain.toolCalls, "toolCalls", add, (entry, base) => {
    if (!isNonEmptyString(entry.tool)) add(`${base}.tool`, "must be a non-empty string");
    if (!isNonEmptyString(entry.inputHash)) add(`${base}.inputHash`, "must be a non-empty string");
  });

  validateProvenanceList(chain.verificationChecks, "verificationChecks", add, (entry, base) => {
    if (!isNonEmptyString(entry.checkId)) add(`${base}.checkId`, "must be a non-empty string");
    if (!isNonEmptyString(entry.status)) add(`${base}.status`, "must be a non-empty string");
  });

  return { valid: errors.length === 0, errors };
}

function validateProvenanceList(list, field, add, validateEntry) {
  if (!Array.isArray(list)) {
    add(field, "must be an array (R6.1)");
    return;
  }
  list.forEach((entry, i) => {
    const base = `${field}[${i}]`;
    if (!isPlainObject(entry)) {
      add(base, "must be an object");
      return;
    }
    validateEntry(entry, base);
  });
}

// -----------------------------------------------------------------------------
// ResponsiveLayoutMetadata validator (R1.1, R1.9)
// -----------------------------------------------------------------------------

/**
 * Validate ResponsiveLayoutMetadata: a 1920x1080 logical frame plus widget and
 * edge placement derived from shared metadata (R1.1, R1.9).
 *
 * @param {unknown} layout
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateResponsiveLayoutMetadata(layout) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(layout)) {
    add("", "ResponsiveLayoutMetadata must be a non-null object");
    return { valid: false, errors };
  }

  if (!isPlainObject(layout.frame) || layout.frame.w !== MEDIA_LOGICAL_FRAME.w || layout.frame.h !== MEDIA_LOGICAL_FRAME.h) {
    add("frame", `must be the logical frame { w: ${MEDIA_LOGICAL_FRAME.w}, h: ${MEDIA_LOGICAL_FRAME.h} } (R1.1)`);
  }

  if (!Array.isArray(layout.widgets)) {
    add("widgets", "must be an array");
  } else {
    layout.widgets.forEach((widget, i) => validateLayoutWidget(widget, `widgets[${i}]`, add));
  }

  if (layout.edges !== undefined && !Array.isArray(layout.edges)) {
    add("edges", "must be an array when present");
  }

  return { valid: errors.length === 0, errors };
}

function validateLayoutWidget(widget, base, add) {
  if (!isPlainObject(widget)) {
    add(base, "must be an object of shape { id, kind, x, y, z, wPct, hPct }");
    return;
  }
  if (!isNonEmptyString(widget.id)) add(`${base}.id`, "must be a non-empty string");
  if (!MEDIA_ARTIFACT_KINDS.includes(widget.kind)) {
    add(`${base}.kind`, `must be one of ${MEDIA_ARTIFACT_KINDS.join(", ")}`);
  }
  for (const axis of ["x", "y", "z", "wPct", "hPct"]) {
    if (!isFiniteNumber(widget[axis])) add(`${base}.${axis}`, "must be a finite number");
  }
}

// -----------------------------------------------------------------------------
// ArtifactRecord validator (R3.4, R3.5, R6.1) — durable-url-only, no ephemeral
// -----------------------------------------------------------------------------

/**
 * Validate a persisted ArtifactRecord. The record stores ONLY the durable R2
 * url and MUST NOT carry any ephemeral provider url (R3.4/R3.5), and it MUST
 * carry a complete Provenance_Chain (R6.1).
 *
 * Pure and total: any input yields a result object and never throws.
 *
 * @param {unknown} record
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateArtifactRecord(record) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(record)) {
    add("", "ArtifactRecord must be a non-null object");
    return { valid: false, errors };
  }

  for (const seg of ["runId", "stageId", "shotId"]) {
    if (!isSafePathSegment(record[seg])) add(seg, "must be a safe non-empty path segment");
  }

  if (!MEDIA_ARTIFACT_KINDS.includes(record.kind)) {
    add("kind", `must be one of ${MEDIA_ARTIFACT_KINDS.join(", ")}`);
  }

  if (!isNonEmptyString(record.durableR2Url)) {
    add("durableR2Url", "must be a non-empty string (R3.4)");
  } else if (!isDurableR2Url(record.durableR2Url)) {
    add("durableR2Url", "must be a durable agentic-graph-media url, never an ephemeral provider url (R3.4/R3.5)");
  }

  if (!isNonEmptyString(record.contentHash)) {
    add("contentHash", "must be a non-empty content hash string (R3.9)");
  }

  if (!isFiniteNumber(record.version)) {
    add("version", "must be a finite monotonic version number (R5.7)");
  }

  // R3.5 — forbid any ephemeral provider url field from ever being persisted.
  for (const forbidden of FORBIDDEN_EPHEMERAL_FIELDS) {
    if (forbidden in record) {
      add(forbidden, "ephemeral provider url fields must never be persisted (R3.5)");
    }
  }

  const provenance = validateProvenanceChain(record.provenance);
  if (!provenance.valid) {
    for (const err of provenance.errors) {
      add(`provenance${err.path ? `.${err.path}` : ""}`, err.reason);
    }
  }

  if (record.layout !== undefined) {
    const layout = validateResponsiveLayoutMetadata(record.layout);
    if (!layout.valid) {
      for (const err of layout.errors) {
        add(`layout${err.path ? `.${err.path}` : ""}`, err.reason);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// Convenience factories — minimal, schema-valid shapes
// -----------------------------------------------------------------------------

/**
 * Build a complete Provenance_Chain from its components. Missing list inputs
 * default to empty arrays; callers wanting strict completeness should pass real
 * tool-call and verification entries and validate with `validateProvenanceChain`.
 *
 * @param {{ goalRef:string, briefRef:string, planRef:string,
 *           toolCalls?:Array, verificationChecks?:Array }} init
 */
export function buildProvenanceChain(init = {}) {
  const source = isPlainObject(init) ? init : {};
  return {
    goalRef: String(source.goalRef || ""),
    briefRef: String(source.briefRef || ""),
    planRef: String(source.planRef || ""),
    toolCalls: Array.isArray(source.toolCalls) ? source.toolCalls : [],
    verificationChecks: Array.isArray(source.verificationChecks) ? source.verificationChecks : [],
  };
}

/**
 * Build a canonical, schema-valid ArtifactRecord. The durable url is derived
 * from the run/stage/shot/ext (R3.4); no ephemeral url field is ever set (R3.5).
 *
 * @param {{ runId:string, stageId:string, shotId:string, ext:string,
 *           kind:string, contentHash:string, version?:number,
 *           mediaType?:string, provenance:object, layout?:object,
 *           createdAtMs?:number }} init
 */
export function createArtifactRecord(init = {}) {
  const source = isPlainObject(init) ? init : {};
  const { runId, stageId, shotId, ext } = source;
  const record = {
    runId,
    stageId,
    shotId,
    kind: source.kind,
    durableR2Url: buildDurableR2Url({ runId, stageId, shotId, ext }),
    contentHash: String(source.contentHash || ""),
    mediaType: isNonEmptyString(source.mediaType) ? source.mediaType : undefined,
    provenance: source.provenance,
    version: isFiniteNumber(source.version) ? source.version : 1,
    createdAtMs: isFiniteNumber(source.createdAtMs) ? source.createdAtMs : 0,
  };
  if (source.layout !== undefined) record.layout = source.layout;
  if (record.mediaType === undefined) delete record.mediaType;
  return record;
}
