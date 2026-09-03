// =============================================================================
// Media persist SSOT — persist-on-generate to durable Cloudflare R2
// agentic-graph-widget-canvas-media spec · Task 3.1
// Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8, R3.9
// design.md › Component 2: Media persistence (SSOT) — mcp/video-remix/media-persist.js
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The single owner of persist-on-generate for the widget-canvas-media feature.
// Every generated image/video artifact byte-stream is persisted to the durable
// `agentic-graph-media` R2 bucket before a generation step is marked complete.
//
// Key guarantees:
//   - Returns ONLY { durableR2Url, objectKey, contentHash, deduped } (R3.4/R3.5)
//   - NEVER emits an ephemeralUrl field (R3.5)
//   - Deduplicates by content hash: if an object with that hash already exists,
//     returns the existing reference without re-uploading (R3.9)
//   - Verifies retrievability within verifyTimeoutMs after a successful put (R3.7/R3.8)
//   - Retries put up to maxWriteAttempts on failure (R3.6)
//   - On write failure after maxWriteAttempts, throws MediaPersistWriteError
//     identifying runId/stageId/shotId with no partial state written (R3.6)
//   - On verify failure within verifyTimeoutMs, throws MediaPersistVerifyError
//     and the artifact is NOT marked persisted (R3.8)
//
// Pure core with injected r2Client and clock — runs offline under node --test
// using the in-memory mock R2 client. Platform target: Cloudflare only.
// =============================================================================

import {
  mediaObjectKey,
  buildDurableR2Url,
  sha256Hex,
  FORBIDDEN_EPHEMERAL_FIELDS,
} from "../../contracts/media-artifact.schema.js";

// -----------------------------------------------------------------------------
// Exported constants
// -----------------------------------------------------------------------------

/** Default maximum number of R2 put attempts before throwing MediaPersistWriteError (R3.6). */
export const DEFAULT_MAX_WRITE_ATTEMPTS = 3;

/** Default millisecond window to verify R2 retrievability after a successful put (R3.7/R3.8). */
export const DEFAULT_VERIFY_TIMEOUT_MS = 10_000;

// -----------------------------------------------------------------------------
// Error classes
// -----------------------------------------------------------------------------

/**
 * Thrown when R2 put fails after all configured write attempts (R3.6).
 * Identifies the artifact by runId/stageId/shotId so the caller can record
 * the failure without any partial state.
 */
export class MediaPersistWriteError extends Error {
  /**
   * @param {string} runId
   * @param {string} stageId
   * @param {string} shotId
   * @param {Error|string} cause
   */
  constructor(runId, stageId, shotId, cause) {
    const msg = `MediaPersistWriteError: failed to persist artifact ${runId}/${stageId}/${shotId}`;
    super(msg);
    this.name = "MediaPersistWriteError";
    this.runId = runId;
    this.stageId = stageId;
    this.shotId = shotId;
    this.cause = cause;
  }
}

/**
 * Thrown when the persisted object is not retrievable within verifyTimeoutMs (R3.8).
 * The artifact is treated as NOT persisted; the generation step is marked failed.
 */
export class MediaPersistVerifyError extends Error {
  /**
   * @param {string} objectKey
   * @param {number} verifyTimeoutMs
   * @param {Error|string} [cause]
   */
  constructor(objectKey, verifyTimeoutMs, cause) {
    const msg = `MediaPersistVerifyError: object not retrievable within ${verifyTimeoutMs}ms: ${objectKey}`;
    super(msg);
    this.name = "MediaPersistVerifyError";
    this.objectKey = objectKey;
    this.verifyTimeoutMs = verifyTimeoutMs;
    this.cause = cause;
  }
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/**
 * Assert that a result object carries no forbidden ephemeral URL fields (R3.5).
 * Called immediately before returning from persist() as a final safety check.
 *
 * @param {object} result
 * @throws {Error} if any forbidden field is present — this is a programming error.
 */
function assertNoEphemeralFields(result) {
  for (const field of FORBIDDEN_EPHEMERAL_FIELDS) {
    if (field in result) {
      throw new Error(
        `MediaPersist internal error: ephemeral field '${field}' must never appear in persist() return value (R3.5)`,
      );
    }
  }
}

/**
 * Verify that the object at `objectKey` is retrievable by calling
 * `r2Client.head(objectKey)` (preferred) or `r2Client.get(objectKey)`.
 * Polls once immediately; if the first call returns null/undefined and we still
 * have time left, waits briefly and retries until `verifyTimeoutMs` elapses.
 *
 * @param {object} r2Client
 * @param {string} objectKey
 * @param {number} verifyTimeoutMs
 * @param {() => number} now - injectable clock (returns ms timestamp)
 * @returns {Promise<boolean>} true when the object is retrievable
 */
async function verifyRetrievable(r2Client, objectKey, verifyTimeoutMs, now) {
  const deadline = now() + verifyTimeoutMs;
  const pollIntervalMs = 200; // short poll — keeps verify fast in tests

  const check = async () => {
    try {
      let result;
      if (typeof r2Client.head === "function") {
        result = await r2Client.head(objectKey);
      } else {
        result = await r2Client.get(objectKey);
      }
      return result != null;
    } catch {
      return false;
    }
  };

  // First attempt immediately.
  if (await check()) return true;

  // Retry until deadline.
  while (now() < deadline) {
    // Wait a short interval before polling again.
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    if (now() >= deadline) break;
    if (await check()) return true;
  }

  return false;
}

/**
 * Attempt to find an existing R2 object whose customMetadata.contentHash
 * matches the given hash. Uses head() to retrieve metadata cheaply.
 *
 * @param {object} r2Client
 * @param {string} objectKey - the canonical key to check
 * @param {string} contentHash
 * @returns {Promise<boolean>} true if the object exists with that content hash
 */
async function checkExistingByHash(r2Client, objectKey, contentHash) {
  try {
    let existing;
    if (typeof r2Client.head === "function") {
      existing = await r2Client.head(objectKey);
    } else {
      existing = await r2Client.get(objectKey);
    }
    if (!existing) return false;
    // Check customMetadata.contentHash if present.
    const storedHash =
      existing?.customMetadata?.contentHash ??
      existing?.customMetadata?.["contentHash"] ??
      null;
    if (storedHash === contentHash) return true;
    // If the object exists at that key but hash differs, do NOT dedupe (different content at same key).
    return false;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create a media persister bound to the given R2 client and configuration.
 *
 * @param {object} options
 * @param {object} options.r2Client               - R2 bucket binding interface: `{ put, get, head }`
 * @param {string} [options.bucket]               - bucket name (informational; key scheme is authoritative)
 * @param {() => number} [options.now]            - injectable clock; defaults to `Date.now`
 * @param {number} [options.verifyTimeoutMs]      - ms to wait for post-put verify (default 10000)
 * @param {number} [options.maxWriteAttempts]     - max put attempts before throwing (default 3)
 * @returns {{ persist: function }}
 */
export function createMediaPersister({
  r2Client,
  bucket,
  now = Date.now,
  verifyTimeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  maxWriteAttempts = DEFAULT_MAX_WRITE_ATTEMPTS,
} = {}) {
  if (!r2Client || typeof r2Client.put !== "function") {
    throw new TypeError("createMediaPersister: r2Client must implement { put, get, head }");
  }

  const resolvedVerifyTimeoutMs =
    Number.isFinite(Number(verifyTimeoutMs)) && Number(verifyTimeoutMs) > 0
      ? Number(verifyTimeoutMs)
      : DEFAULT_VERIFY_TIMEOUT_MS;

  const resolvedMaxWriteAttempts =
    Number.isFinite(Number(maxWriteAttempts)) && Number(maxWriteAttempts) >= 1
      ? Math.floor(Number(maxWriteAttempts))
      : DEFAULT_MAX_WRITE_ATTEMPTS;

  /**
   * Persist a media artifact to R2.
   *
   * @param {object} args
   * @param {string} args.runId
   * @param {string} args.stageId
   * @param {string} args.shotId
   * @param {string} args.ext              - file extension (e.g. "png", "mp4")
   * @param {ArrayBuffer|Uint8Array} args.bytes
   * @param {string} [args.contentType]   - MIME type stored as httpMetadata
   * @returns {Promise<{ durableR2Url: string, objectKey: string, contentHash: string, deduped: boolean }>}
   * @throws {MediaPersistWriteError} after maxWriteAttempts failed put attempts (R3.6)
   * @throws {MediaPersistVerifyError} when the object is not retrievable within verifyTimeoutMs (R3.8)
   */
  async function persist({ runId, stageId, shotId, ext, bytes, contentType = "application/octet-stream" }) {
    // Build the canonical key and durable URL (R3.3, R3.4).
    const objectKey = mediaObjectKey({ runId, stageId, shotId, ext });
    const durableR2Url = buildDurableR2Url({ runId, stageId, shotId, ext });

    // Compute content hash for dedupe (R3.9).
    const contentHash = await sha256Hex(bytes);

    // --- Dedupe check (R3.9) -----------------------------------------------
    // If an object already exists at the canonical key with this content hash,
    // return the existing reference without re-uploading.
    const alreadyExists = await checkExistingByHash(r2Client, objectKey, contentHash);
    if (alreadyExists) {
      const deduped = true;
      const result = { durableR2Url, objectKey, contentHash, deduped };
      assertNoEphemeralFields(result);
      return result;
    }

    // --- Put with retry (R3.6) -----------------------------------------------
    // Attempt put up to maxWriteAttempts. Any failure is retried; on exhaustion
    // throw MediaPersistWriteError identifying runId/stageId/shotId. No partial
    // state is written on failure (R3.6).
    let lastError;
    let putSucceeded = false;

    for (let attempt = 1; attempt <= resolvedMaxWriteAttempts; attempt++) {
      try {
        await r2Client.put(objectKey, bytes, {
          httpMetadata: { contentType },
          customMetadata: {
            runId,
            stageId,
            shotId,
            contentHash,
          },
        });
        putSucceeded = true;
        break;
      } catch (err) {
        lastError = err;
        // On the last attempt do not retry further.
        if (attempt === resolvedMaxWriteAttempts) break;
        // Brief back-off between attempts (doubles each retry, capped at 1s).
        const delayMs = Math.min(1000, 100 * 2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (!putSucceeded) {
      // R3.6: throw, identifying artifact; record no partial state.
      throw new MediaPersistWriteError(runId, stageId, shotId, lastError);
    }

    // --- Verify retrievability (R3.7, R3.8) ----------------------------------
    // After successful put, verify the object is retrievable within
    // verifyTimeoutMs. If not, the artifact is NOT marked persisted (R3.8).
    const retrievable = await verifyRetrievable(r2Client, objectKey, resolvedVerifyTimeoutMs, now);
    if (!retrievable) {
      throw new MediaPersistVerifyError(objectKey, resolvedVerifyTimeoutMs);
    }

    // --- Return durable-only result (R3.4, R3.5) ----------------------------
    // NEVER include ephemeralUrl or any forbidden field.
    const result = { durableR2Url, objectKey, contentHash, deduped: false };
    assertNoEphemeralFields(result);
    return result;
  }

  return { persist };
}
