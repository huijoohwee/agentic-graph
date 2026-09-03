// =============================================================================
// Auth_Token + Caller_Identity — canonical schemas + pure validators (SSOT)
// agentic-graph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.3 · Requirements R15.2, R15.4, R15.7, R15.8 · design.md › Data Models
//          (Auth_Token, Caller_Identity)
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The Auth_Token and Caller_Identity shapes were previously defined ad-hoc in
// the AWS Agent-API tier:
//   - mint:     aws/agent-api/src/lib/auth-token.js  (mintAuthToken / claims:
//               { sub, entitledRunIds, iat, exp } + the [300,86400]/default-3600
//               expiry-window policy)
//   - identity: aws/agent-api/src/lib/caller-identity.js (buildCallerIdentity ->
//               { subject, principalId, entitledRunIds, issuedAt,
//               expiryWindowSeconds })
//
// This module is the SINGLE SOURCE OF TRUTH for both shapes. It MIRRORS EXACTLY
// the AWS tier so the contracts package becomes the canonical definition every
// tier (AWS / web / control plane) can re-point to later, rather than a fork.
// It does NOT import from aws/: the contracts package is framework-agnostic and
// dependency-free.
//
// It is:
//   - dependency-free (no JSON-schema lib), plain ESM, reachable by every tier,
//   - PURE: `validateAuthToken` / `validateCallerIdentity` return
//     `{ valid, errors:[{path,reason}] }`, NEVER throw, make ZERO network
//     calls, and are fully deterministic.
//
// IMPLEMENTATION-AGNOSTIC BY DESIGN (R15.7): beyond the HS256 (HMAC-SHA256)
// signature note, the Auth_Token data model carries NO issuer-specific shape.
// The `signature` is validated only as a verifiable marker so the issuer can
// later swap HS256 for OIDC / Cloudflare Access / mTLS WITHOUT changing this
// schema. The HS256 signature is produced and verified by the Agent_Api with a
// server-side secret — this contract never holds, transports, or inspects that
// secret (consistent with R15.7's "server-side only" rule).
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical expiry-window policy (R15.8). Mirrors EXACTLY the constants in
// aws/agent-api/src/lib/auth-token.js so the SSOT and the minter share one
// window: an Auth_Token lifetime ∈ [5 minutes, 24 hours], default 60 minutes.
// -----------------------------------------------------------------------------

/** Default Auth_Token lifetime when unset: 60 minutes. */
export const DEFAULT_EXPIRY_WINDOW_SECONDS = 3600;
/** Minimum configurable lifetime: 5 minutes. */
export const MIN_EXPIRY_WINDOW_SECONDS = 300;
/** Maximum configurable lifetime: 24 hours. */
export const MAX_EXPIRY_WINDOW_SECONDS = 86400;

/**
 * JWT signing algorithm for the reference issuer — symmetric HMAC-SHA256.
 * Published for cross-tier agreement; the schema itself does NOT require this
 * value (implementation-agnostic note only, R15.7).
 */
export const AUTH_TOKEN_SIGNATURE_ALG = "HS256";

/** Canonical Auth_Token field names (stable for cross-tier use). */
export const AUTH_TOKEN_FIELDS = Object.freeze({
  SUBJECT: "subject",
  ENTITLED_RUN_IDS: "entitledRunIds",
  ISSUED_AT: "issuedAt",
  EXPIRY_WINDOW_SECONDS: "expiryWindowSeconds",
  SIGNATURE: "signature",
  VERIFIED: "verified",
});

/** Canonical Caller_Identity field names (stable for cross-tier use). */
export const CALLER_IDENTITY_FIELDS = Object.freeze({
  SUBJECT: "subject",
  PRINCIPAL_ID: "principalId",
  ENTITLED_RUN_IDS: "entitledRunIds",
  ISSUED_AT: "issuedAt",
  EXPIRY_WINDOW_SECONDS: "expiryWindowSeconds",
});

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value) {
  return isFiniteNumber(value) && Number.isInteger(value);
}

/**
 * Coerce an `issuedAt` value (epoch ms number or ISO-8601 string) into epoch
 * milliseconds. Returns `null` when it cannot be parsed. Mirrors the issuedAt
 * domain accepted by the sibling approval SSOT so every contract agrees.
 *
 * @param {unknown} issuedAt
 * @returns {number|null}
 */
function toIssuedAtMs(issuedAt) {
  if (typeof issuedAt === "number") {
    return Number.isFinite(issuedAt) ? issuedAt : null;
  }
  if (typeof issuedAt === "string" && issuedAt.trim()) {
    const ms = Date.parse(issuedAt);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Does the token carry a verifiable signature marker? Mirrors the
 * `hasVerifiableMarker` check in the sibling approval SSOT: a truthy `verified`
 * flag OR a non-empty `signature` string stands in for signature verification
 * at this layer. The real cryptographic HS256 check is performed by the
 * Agent_Api with its server-side secret (R15.7) — this contract NEVER inspects
 * the secret and stays implementation-agnostic.
 *
 * @param {object} token
 * @returns {boolean}
 */
function hasVerifiableMarker(token) {
  return (
    token.verified === true ||
    (typeof token.signature === "string" && token.signature.trim().length > 0)
  );
}

/**
 * Normalize an `entitledRunIds` value to a de-duplicated array of non-empty
 * strings. Mirrors the mint-time normalization in auth-token.js and the
 * identity-time normalization in caller-identity.js so the minted token, the
 * established identity, and this contract all agree on entitlement shape
 * (R15.4). A missing / non-array value yields an empty set — a fresh session is
 * entitled to nothing until runs are created within it.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeEntitledRunIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && id.length > 0))];
}

/**
 * Resolve a requested expiry window to the effective window, clamped to
 * [MIN, MAX] and defaulting to DEFAULT when unset/invalid (R15.8). Mirrors
 * EXACTLY `resolveExpiryWindowSeconds` in aws/agent-api/src/lib/auth-token.js:
 * out-of-range values are CLAMPED to the nearest bound (not rejected), and a
 * non-numeric / non-finite request falls back to the default. Whole seconds
 * only; fractional requests are truncated toward zero.
 *
 * @param {unknown} requested
 * @returns {{ seconds: number, clamped: boolean, defaulted: boolean }}
 */
export function resolveExpiryWindowSeconds(requested) {
  if (requested === undefined || requested === null) {
    return { seconds: DEFAULT_EXPIRY_WINDOW_SECONDS, clamped: false, defaulted: true };
  }

  const numeric = typeof requested === "number" ? requested : Number(requested);
  if (!Number.isFinite(numeric)) {
    return { seconds: DEFAULT_EXPIRY_WINDOW_SECONDS, clamped: false, defaulted: true };
  }

  const whole = Math.trunc(numeric);

  if (whole < MIN_EXPIRY_WINDOW_SECONDS) {
    return { seconds: MIN_EXPIRY_WINDOW_SECONDS, clamped: true, defaulted: false };
  }
  if (whole > MAX_EXPIRY_WINDOW_SECONDS) {
    return { seconds: MAX_EXPIRY_WINDOW_SECONDS, clamped: true, defaulted: false };
  }
  return { seconds: whole, clamped: false, defaulted: false };
}

/**
 * Is a value a valid configured expiry window — an integer within
 * [MIN, MAX] (R15.8)? Used by the validators (where the field is PRESENT it
 * must already be in-domain; the clamp helper above is for the minter's
 * forgiving `POST /auth/session` path).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isExpiryWindowInDomain(value) {
  return (
    isInteger(value) &&
    value >= MIN_EXPIRY_WINDOW_SECONDS &&
    value <= MAX_EXPIRY_WINDOW_SECONDS
  );
}

// -----------------------------------------------------------------------------
// Auth_Token validator — pure, never throws, structured {path, reason}.
// -----------------------------------------------------------------------------

/**
 * Validate an Auth_Token against the canonical SSOT schema (design Data Models
 * › Auth_Token; R15.2, R15.4, R15.7, R15.8).
 *
 * Required fields (mirror the claims minted by auth-token.js):
 *   * `subject`   — non-empty string; the session id used as Caller_Identity
 *                   (R15.2). REQUIRED.
 *   * `issuedAt`  — epoch ms (finite number) or ISO-8601 string; the JWT `iat`
 *                   and basis for the expiry window (R15.8).
 *   * signature   — a verifiable marker: a non-empty `signature` string OR a
 *                   truthy `verified` flag. The HS256 cryptographic check runs
 *                   server-side in the Agent_Api (R15.7); this stays
 *                   implementation-agnostic so the issuer can later swap to
 *                   OIDC / Cloudflare Access / mTLS without a schema change.
 *
 * Optional fields validated when present:
 *   * `expiryWindowSeconds` — integer in [300, 86400] (R15.8). When ABSENT the
 *                   token is valid and the effective window defaults to 3600
 *                   (see `resolveExpiryWindowSeconds`).
 *   * `entitledRunIds`      — array of strings (set; dedup-friendly via
 *                   `normalizeEntitledRunIds`). Empty/absent at mint time
 *                   (R15.4).
 *
 * Pure and total: any input (including `undefined`, `null`, primitives) yields
 * a result object and never throws.
 *
 * @param {unknown} token
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateAuthToken(token) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(token)) {
    add("", "Auth_Token must be a non-null object");
    return { valid: false, errors };
  }

  // subject — REQUIRED, non-empty string (session id / Caller_Identity, R15.2).
  if (!("subject" in token)) add("subject", "required field is missing");
  else if (!isNonEmptyString(token.subject)) {
    add("subject", "must be a non-empty string (session id)");
  }

  // issuedAt — REQUIRED, epoch ms or ISO string (JWT iat; expiry basis R15.8).
  if (!("issuedAt" in token)) add("issuedAt", "required field is missing");
  else if (toIssuedAtMs(token.issuedAt) === null) {
    add("issuedAt", "must be epoch milliseconds or an ISO-8601 timestamp string");
  }

  // signature / verified — at least one verifiable marker required (R15.7).
  if (!hasVerifiableMarker(token)) {
    add(
      "signature",
      "must carry a verifiable marker: a non-empty signature string or verified:true",
    );
  }

  // expiryWindowSeconds — OPTIONAL; when present must be an integer in
  // [300, 86400] (R15.8). Absent => defaults to 3600 downstream.
  if ("expiryWindowSeconds" in token && !isExpiryWindowInDomain(token.expiryWindowSeconds)) {
    add(
      "expiryWindowSeconds",
      `when present must be an integer in [${MIN_EXPIRY_WINDOW_SECONDS}, ${MAX_EXPIRY_WINDOW_SECONDS}]`,
    );
  }

  // entitledRunIds — OPTIONAL; when present must be an array of strings
  // (set; dedup-friendly). Absent/empty at mint time (R15.4).
  if ("entitledRunIds" in token) {
    validateEntitledRunIdsInto(token.entitledRunIds, "entitledRunIds", add);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Shared `entitledRunIds` validation: must be an array, and every element must
 * be a non-empty string (a "set of strings"). Duplicates are NOT an error here
 * — callers de-duplicate with `normalizeEntitledRunIds` (dedup-friendly). Pure.
 *
 * @param {unknown} value
 * @param {string} path
 * @param {(path: string, reason: string) => void} add
 */
function validateEntitledRunIdsInto(value, path, add) {
  if (!Array.isArray(value)) {
    add(path, "must be an array of run-id strings (set)");
    return;
  }
  value.forEach((id, index) => {
    if (!isNonEmptyString(id)) {
      add(`${path}[${index}]`, "every entitled run id must be a non-empty string");
    }
  });
}

// -----------------------------------------------------------------------------
// Caller_Identity validator — pure, never throws, structured {path, reason}.
// -----------------------------------------------------------------------------

/**
 * Validate a Caller_Identity against the canonical SSOT schema (design Data
 * Models › Caller_Identity; R15.2, R15.4, R15.5). Mirrors EXACTLY the object
 * returned by `buildCallerIdentity` in caller-identity.js:
 *   `{ subject, principalId, entitledRunIds, issuedAt, expiryWindowSeconds }`.
 *
 * Required:
 *   * a principal — at least one of `subject` / `principalId` must be a
 *     non-empty string (R15.2). The reference issuer sets BOTH (principalId is
 *     an alias of subject); accepting either keeps the schema swap-friendly.
 *   * `entitledRunIds` — array of strings (set; basis for GET /runs/{id}
 *     authorization, R15.4/R15.5). When ABSENT it is treated as the empty set.
 *
 * Optional (present on the reference identity, may be null):
 *   * `issuedAt` — epoch ms / ISO string, or `null` when not derivable.
 *   * `expiryWindowSeconds` — the ACTUAL derived lifetime (`exp - iat`), a
 *     positive number, or `null` when not derivable. NOTE: this is the derived
 *     window, NOT the configured mint window, so it is NOT clamped to
 *     [300, 86400] here (the clamp invariant lives on the Auth_Token).
 *
 * Pure and total: any input yields a result object and never throws.
 *
 * @param {unknown} identity
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateCallerIdentity(identity) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(identity)) {
    add("", "Caller_Identity must be a non-null object");
    return { valid: false, errors };
  }

  // principal — at least one of subject / principalId must be a non-empty
  // string (R15.2). When a field is present it must itself be a non-empty
  // string; the cross-field rule then guarantees at least one principal.
  const hasSubject = "subject" in identity;
  const hasPrincipalId = "principalId" in identity;

  if (hasSubject && !isNonEmptyString(identity.subject)) {
    add("subject", "when present must be a non-empty string");
  }
  if (hasPrincipalId && !isNonEmptyString(identity.principalId)) {
    add("principalId", "when present must be a non-empty string");
  }
  if (!isNonEmptyString(identity.subject) && !isNonEmptyString(identity.principalId)) {
    add("principalId", "a principal is required: subject or principalId must be a non-empty string");
  }

  // entitledRunIds — set of strings; basis for run authorization (R15.4/R15.5).
  // Absent => empty set (valid). Present => must be an array of strings.
  if ("entitledRunIds" in identity) {
    validateEntitledRunIdsInto(identity.entitledRunIds, "entitledRunIds", add);
  }

  // issuedAt — optional; null OR epoch ms / ISO string.
  if ("issuedAt" in identity && identity.issuedAt !== null && toIssuedAtMs(identity.issuedAt) === null) {
    add("issuedAt", "when present must be null, epoch milliseconds, or an ISO-8601 timestamp string");
  }

  // expiryWindowSeconds — optional; null OR a positive number (derived
  // lifetime exp - iat). Not clamped to [300,86400]: that invariant lives on
  // the Auth_Token's configured window, not the derived identity window.
  if ("expiryWindowSeconds" in identity && identity.expiryWindowSeconds !== null) {
    if (!isFiniteNumber(identity.expiryWindowSeconds) || identity.expiryWindowSeconds <= 0) {
      add("expiryWindowSeconds", "when present must be null or a positive number of seconds");
    }
  }

  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// Convenience factory — derive a canonical, schema-valid Caller_Identity from
// an Auth_Token-shaped object. Mirrors buildCallerIdentity but stays pure and
// dependency-free (no claim re-verification; the Agent_Api has already verified
// the HS256 signature + expiry by the time this is used).
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid Caller_Identity from an Auth_Token-shaped
 * object (or verified claims). Returns a frozen object mirroring the design
 * Caller_Identity schema. Uses the configured `expiryWindowSeconds` when in
 * domain, otherwise resolves it via the canonical clamp/default policy (R15.8).
 *
 * @param {{ subject?: string, sub?: string, entitledRunIds?: string[], issuedAt?: number|string, iat?: number, expiryWindowSeconds?: unknown }} source
 * @returns {Readonly<{ subject: string, principalId: string, entitledRunIds: string[], issuedAt: number|null, expiryWindowSeconds: number }>}
 */
export function createCallerIdentity(source = {}) {
  const subject = isNonEmptyString(source.subject)
    ? source.subject
    : isNonEmptyString(source.sub)
      ? source.sub
      : "";

  const issuedAtRaw = source.issuedAt !== undefined ? source.issuedAt : source.iat;
  const issuedAt = toIssuedAtMs(issuedAtRaw);

  const expiryWindowSeconds = isExpiryWindowInDomain(source.expiryWindowSeconds)
    ? source.expiryWindowSeconds
    : resolveExpiryWindowSeconds(source.expiryWindowSeconds).seconds;

  return Object.freeze({
    subject,
    principalId: subject,
    entitledRunIds: normalizeEntitledRunIds(source.entitledRunIds),
    issuedAt,
    expiryWindowSeconds,
  });
}

/**
 * Convenience predicate used by the run-manifest authorization seam: is the
 * established identity entitled to read a given run id (R15.4/R15.5)? Mirrors
 * `isEntitledToRun` in caller-identity.js. Pure, never throws.
 *
 * @param {{ entitledRunIds?: string[] }} callerIdentity
 * @param {string} runId
 * @returns {boolean}
 */
export function isEntitledToRun(callerIdentity, runId) {
  if (!callerIdentity || !Array.isArray(callerIdentity.entitledRunIds)) return false;
  if (typeof runId !== "string" || runId.length === 0) return false;
  return callerIdentity.entitledRunIds.includes(runId);
}

// =============================================================================
// RECONCILIATION NOTES (kept consistent with the AWS Agent-API tier)
// =============================================================================
// 1. Expiry window: MIN/MAX/DEFAULT (300 / 86400 / 3600) and
//    `resolveExpiryWindowSeconds` mirror aws/agent-api/src/lib/auth-token.js
//    VERBATIM by value + behavior (clamp out-of-range, default on
//    unset/non-finite, whole-seconds truncation), so the SSOT and the minter
//    share one window policy (R15.8).
// 2. entitledRunIds: normalized to a de-duplicated array of non-empty strings,
//    matching BOTH the mint-time normalization in auth-token.js and the
//    identity-time normalization in caller-identity.js (R15.4). The validators
//    accept duplicates (dedup-friendly) and only reject non-array / non-string
//    elements.
// 3. signature: a non-empty `signature` string OR `verified: true` satisfies
//    the verifiable-marker check. The schema is implementation-agnostic beyond
//    the HS256 note (R15.7): the Agent_Api produces/verifies the HMAC-SHA256
//    signature with a server-side secret this contract never holds, so the
//    issuer can later swap to OIDC / Cloudflare Access / mTLS without changing
//    this shape.
// 4. Caller_Identity: mirrors `buildCallerIdentity`'s output
//    `{ subject, principalId, entitledRunIds, issuedAt, expiryWindowSeconds }`.
//    `expiryWindowSeconds` here is the DERIVED lifetime (exp - iat) and is
//    therefore validated as a positive number / null, NOT clamped — the
//    [300,86400] domain invariant belongs to the Auth_Token's configured
//    window.
// =============================================================================
