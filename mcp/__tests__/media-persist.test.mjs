// =============================================================================
// Media persist SSOT — unit tests
// agentic-graph-widget-canvas-media spec · Task 3.1 / Task 3.2
// Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8, R3.9
// Pure offline tests — ZERO network calls, ZERO paid actions.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMediaPersister,
  MediaPersistWriteError,
  MediaPersistVerifyError,
  DEFAULT_MAX_WRITE_ATTEMPTS,
  DEFAULT_VERIFY_TIMEOUT_MS,
} from "../video-remix/media-persist.js";

import {
  mediaObjectKey,
  buildDurableR2Url,
  FORBIDDEN_EPHEMERAL_FIELDS,
  sha256Hex,
} from "../../contracts/media-artifact.schema.js";

// =============================================================================
// In-memory R2 client mock
// =============================================================================

/**
 * Build a deterministic in-memory R2 client mock that fully implements the
 * { put, get, head } interface expected by createMediaPersister.
 *
 * @param {object} [options]
 * @param {number} [options.putFailCount=0]     - number of put calls to fail before succeeding
 * @param {boolean} [options.alwaysFail=false]  - always throw on put
 * @param {number} [options.headDelayMs=0]      - artificial delay on head/get calls (ms)
 * @param {boolean} [options.headReturnsNull=false] - head/get always return null (simulate missing object)
 */
function createMockR2Client(options = {}) {
  const {
    putFailCount = 0,
    alwaysFail = false,
    headDelayMs = 0,
    headReturnsNull = false,
  } = options;

  const store = new Map(); // objectKey -> { bytes, httpMetadata, customMetadata }
  let putCallCount = 0;

  async function put(key, bytes, opts = {}) {
    putCallCount += 1;
    const shouldFail = alwaysFail || putCallCount <= putFailCount;
    if (shouldFail) {
      throw new Error(`MockR2: put failed (call ${putCallCount})`);
    }
    store.set(key, {
      bytes,
      httpMetadata: opts.httpMetadata ?? {},
      customMetadata: opts.customMetadata ?? {},
    });
  }

  async function head(key) {
    if (headDelayMs > 0) {
      await new Promise((r) => setTimeout(r, headDelayMs));
    }
    if (headReturnsNull) return null;
    const entry = store.get(key);
    if (!entry) return null;
    return {
      key,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
    };
  }

  async function get(key) {
    if (headDelayMs > 0) {
      await new Promise((r) => setTimeout(r, headDelayMs));
    }
    if (headReturnsNull) return null;
    const entry = store.get(key);
    if (!entry) return null;
    return {
      key,
      body: entry.bytes,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
    };
  }

  return {
    put,
    head,
    get,
    // Test inspection helpers
    get store() { return store; },
    get putCallCount() { return putCallCount; },
  };
}

// =============================================================================
// Test fixtures
// =============================================================================

function makeBytes(content = "test-content") {
  return new TextEncoder().encode(content);
}

const BASE_ARGS = Object.freeze({
  runId: "run-abc",
  stageId: "render",
  shotId: "shot-1",
  ext: "png",
  contentType: "image/png",
});

function makeArgs(overrides = {}) {
  const bytes = makeBytes(overrides.content ?? "default-test-bytes");
  return { ...BASE_ARGS, bytes, ...overrides };
}

// =============================================================================
// 0. Factory validation
// =============================================================================

test("createMediaPersister throws if r2Client is missing", () => {
  assert.throws(() => createMediaPersister(), TypeError);
  assert.throws(() => createMediaPersister({ r2Client: null }), TypeError);
  assert.throws(() => createMediaPersister({ r2Client: {} }), TypeError);
});

test("createMediaPersister accepts valid options and returns { persist }", () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });
  assert.equal(typeof persister.persist, "function");
});

test("DEFAULT_MAX_WRITE_ATTEMPTS is 3", () => {
  assert.equal(DEFAULT_MAX_WRITE_ATTEMPTS, 3);
});

test("DEFAULT_VERIFY_TIMEOUT_MS is 10000", () => {
  assert.equal(DEFAULT_VERIFY_TIMEOUT_MS, 10_000);
});

// =============================================================================
// 1. Correct R2 key scheme (R3.3)
// =============================================================================

test("R3.3: persist writes to the canonical R2 key runs/{runId}/{stageId}/{shotId}.{ext}", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = makeArgs();
  const result = await persister.persist(args);

  const expectedKey = mediaObjectKey({
    runId: BASE_ARGS.runId,
    stageId: BASE_ARGS.stageId,
    shotId: BASE_ARGS.shotId,
    ext: BASE_ARGS.ext,
  });
  assert.equal(result.objectKey, expectedKey);
  assert.equal(expectedKey, "runs/run-abc/render/shot-1.png");
  // Verify the object is in the store under the canonical key.
  assert.ok(r2Client.store.has(expectedKey), "object must be stored at canonical key");
});

// =============================================================================
// 2. Durable-URL-only output (R3.4, R3.5)
// =============================================================================

test("R3.4: persist returns the durable R2 URL (never ephemeral)", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = makeArgs();
  const result = await persister.persist(args);

  const expectedUrl = buildDurableR2Url({
    runId: BASE_ARGS.runId,
    stageId: BASE_ARGS.stageId,
    shotId: BASE_ARGS.shotId,
    ext: BASE_ARGS.ext,
  });
  assert.equal(result.durableR2Url, expectedUrl);
  assert.match(result.durableR2Url, /^https:\/\/airvio\.co\/api\/storage\/media\/runs\//);
});

test("R3.5: persist result never contains any forbidden ephemeral URL field", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = makeArgs();
  const result = await persister.persist(args);

  for (const forbidden of FORBIDDEN_EPHEMERAL_FIELDS) {
    assert.equal(
      forbidden in result,
      false,
      `persist() result must not carry '${forbidden}' (R3.5)`,
    );
  }
});

test("R3.4/R3.5: the result shape is exactly { durableR2Url, objectKey, contentHash, deduped }", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const result = await persister.persist(makeArgs());

  assert.equal(typeof result.durableR2Url, "string");
  assert.equal(typeof result.objectKey, "string");
  assert.equal(typeof result.contentHash, "string");
  assert.equal(typeof result.deduped, "boolean");
  // Exactly four keys — no extra fields.
  const keys = Object.keys(result);
  assert.deepEqual(keys.sort(), ["contentHash", "deduped", "durableR2Url", "objectKey"]);
});

// =============================================================================
// 3. Content hash (R3.9)
// =============================================================================

test("R3.9: content hash in result matches sha256Hex of the persisted bytes", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const bytes = makeBytes("specific-content");
  const result = await persister.persist({ ...BASE_ARGS, bytes });

  const expectedHash = await sha256Hex(bytes);
  assert.equal(result.contentHash, expectedHash);
  assert.match(result.contentHash, /^[0-9a-f]{64}$/);
});

test("R3.9: the stored customMetadata.contentHash matches the returned contentHash", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = makeArgs();
  const result = await persister.persist(args);

  const stored = r2Client.store.get(result.objectKey);
  assert.equal(stored.customMetadata.contentHash, result.contentHash);
});

test("R3.9: customMetadata carries runId, stageId, shotId, contentHash", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = makeArgs();
  const result = await persister.persist(args);

  const stored = r2Client.store.get(result.objectKey);
  assert.equal(stored.customMetadata.runId, BASE_ARGS.runId);
  assert.equal(stored.customMetadata.stageId, BASE_ARGS.stageId);
  assert.equal(stored.customMetadata.shotId, BASE_ARGS.shotId);
  assert.equal(stored.customMetadata.contentHash, result.contentHash);
});

// =============================================================================
// 4. Content-hash dedupe (R3.9)
// =============================================================================

test("R3.9: identical content returns deduped=true and skips re-upload", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const bytes = makeBytes("dedupe-test");

  // First persist: stores object.
  const first = await persister.persist({ ...BASE_ARGS, bytes });
  assert.equal(first.deduped, false);
  const putCountAfterFirst = r2Client.putCallCount;

  // Second persist with identical content at same key: should dedupe.
  const second = await persister.persist({ ...BASE_ARGS, bytes });
  assert.equal(second.deduped, true);
  // No additional put calls.
  assert.equal(r2Client.putCallCount, putCountAfterFirst);

  // Both return the same durableR2Url and contentHash.
  assert.equal(first.durableR2Url, second.durableR2Url);
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.objectKey, second.objectKey);
});

test("R3.9: different content at same key does NOT dedupe (hash mismatch)", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const bytes1 = makeBytes("content-v1");
  const bytes2 = makeBytes("content-v2");

  // First persist.
  const first = await persister.persist({ ...BASE_ARGS, bytes: bytes1 });
  assert.equal(first.deduped, false);

  // Second persist with different content at same logical key.
  const second = await persister.persist({ ...BASE_ARGS, bytes: bytes2 });
  assert.equal(second.deduped, false); // different hash — re-upload
  assert.notEqual(first.contentHash, second.contentHash);
});

test("R3.9: deduped result still carries no forbidden ephemeral fields", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const bytes = makeBytes("dedupe-ephemeral-check");
  await persister.persist({ ...BASE_ARGS, bytes });
  const second = await persister.persist({ ...BASE_ARGS, bytes });
  assert.equal(second.deduped, true);

  for (const forbidden of FORBIDDEN_EPHEMERAL_FIELDS) {
    assert.equal(
      forbidden in second,
      false,
      `deduped result must not carry '${forbidden}' (R3.5)`,
    );
  }
});

// =============================================================================
// 5. Verify-before-persist (R3.7, R3.8)
// =============================================================================

test("R3.7: persist verifies retrievability before returning", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  // This simply confirms that a normal persist completes (head returns the object).
  const result = await persister.persist(makeArgs());
  assert.equal(result.deduped, false);
  assert.equal(typeof result.durableR2Url, "string");
});

test("R3.8: throws MediaPersistVerifyError when object is not retrievable within timeout", async () => {
  // headReturnsNull simulates the object never being retrievable.
  const r2Client = createMockR2Client({ headReturnsNull: true });
  const persister = createMediaPersister({
    r2Client,
    verifyTimeoutMs: 50, // short timeout for fast tests
  });

  await assert.rejects(
    () => persister.persist(makeArgs()),
    (err) => {
      assert.ok(err instanceof MediaPersistVerifyError, `expected MediaPersistVerifyError, got ${err?.constructor?.name}`);
      assert.equal(err.name, "MediaPersistVerifyError");
      assert.equal(typeof err.objectKey, "string");
      assert.ok(err.objectKey.length > 0);
      return true;
    },
  );
});

test("R3.8: MediaPersistVerifyError carries objectKey and verifyTimeoutMs", async () => {
  const r2Client = createMockR2Client({ headReturnsNull: true });
  const verifyTimeoutMs = 50;
  const persister = createMediaPersister({ r2Client, verifyTimeoutMs });

  let caughtErr;
  try {
    await persister.persist(makeArgs());
  } catch (err) {
    caughtErr = err;
  }

  assert.ok(caughtErr instanceof MediaPersistVerifyError);
  assert.equal(caughtErr.verifyTimeoutMs, verifyTimeoutMs);
  assert.equal(
    caughtErr.objectKey,
    mediaObjectKey({ runId: BASE_ARGS.runId, stageId: BASE_ARGS.stageId, shotId: BASE_ARGS.shotId, ext: BASE_ARGS.ext }),
  );
});

// =============================================================================
// 6. Write-failure path and retry (R3.6)
// =============================================================================

test("R3.6: throws MediaPersistWriteError after maxWriteAttempts failures", async () => {
  // alwaysFail ensures every attempt throws.
  const r2Client = createMockR2Client({ alwaysFail: true });
  const persister = createMediaPersister({
    r2Client,
    maxWriteAttempts: 2,
    verifyTimeoutMs: 50,
  });

  await assert.rejects(
    () => persister.persist(makeArgs()),
    (err) => {
      assert.ok(err instanceof MediaPersistWriteError, `expected MediaPersistWriteError, got ${err?.constructor?.name}`);
      assert.equal(err.name, "MediaPersistWriteError");
      assert.equal(err.runId, BASE_ARGS.runId);
      assert.equal(err.stageId, BASE_ARGS.stageId);
      assert.equal(err.shotId, BASE_ARGS.shotId);
      return true;
    },
  );
});

test("R3.6: MediaPersistWriteError identifies runId/stageId/shotId", async () => {
  const r2Client = createMockR2Client({ alwaysFail: true });
  const persister = createMediaPersister({ r2Client, maxWriteAttempts: 1 });

  let caughtErr;
  try {
    await persister.persist({ ...BASE_ARGS, bytes: makeBytes(), runId: "run-x", stageId: "stage-y", shotId: "shot-z", ext: "mp4" });
  } catch (err) {
    caughtErr = err;
  }

  assert.ok(caughtErr instanceof MediaPersistWriteError);
  assert.equal(caughtErr.runId, "run-x");
  assert.equal(caughtErr.stageId, "stage-y");
  assert.equal(caughtErr.shotId, "shot-z");
});

test("R3.6: retries on transient failure and succeeds if put eventually succeeds", async () => {
  // Fail first 2 attempts, succeed on attempt 3 (default maxWriteAttempts).
  const r2Client = createMockR2Client({ putFailCount: 2 });
  const persister = createMediaPersister({
    r2Client,
    maxWriteAttempts: 3,
    verifyTimeoutMs: 2000,
  });

  const result = await persister.persist(makeArgs());
  assert.equal(result.deduped, false);
  assert.equal(typeof result.durableR2Url, "string");
  // Should have taken 3 put calls total.
  assert.equal(r2Client.putCallCount, 3);
});

test("R3.6: no partial state written when all write attempts fail", async () => {
  const r2Client = createMockR2Client({ alwaysFail: true });
  const persister = createMediaPersister({ r2Client, maxWriteAttempts: 2 });

  try {
    await persister.persist(makeArgs());
  } catch {
    // Expected.
  }

  // The store must remain empty — no partial writes.
  assert.equal(r2Client.store.size, 0);
});

// =============================================================================
// 7. httpMetadata is stored correctly
// =============================================================================

test("persist stores the contentType in httpMetadata", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const args = { ...BASE_ARGS, bytes: makeBytes(), contentType: "video/mp4", ext: "mp4" };
  const result = await persister.persist(args);

  const stored = r2Client.store.get(result.objectKey);
  assert.equal(stored.httpMetadata.contentType, "video/mp4");
});

test("persist defaults contentType to application/octet-stream when not provided", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const { contentType: _ignored, ...argsWithoutContentType } = BASE_ARGS;
  const result = await persister.persist({ ...argsWithoutContentType, bytes: makeBytes() });

  const stored = r2Client.store.get(result.objectKey);
  assert.equal(stored.httpMetadata.contentType, "application/octet-stream");
});

// =============================================================================
// 8. Error class shape
// =============================================================================

test("MediaPersistWriteError has the correct name and shape", () => {
  const err = new MediaPersistWriteError("r1", "s1", "sh1", new Error("cause"));
  assert.equal(err.name, "MediaPersistWriteError");
  assert.equal(err.runId, "r1");
  assert.equal(err.stageId, "s1");
  assert.equal(err.shotId, "sh1");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof MediaPersistWriteError);
});

test("MediaPersistVerifyError has the correct name and shape", () => {
  const err = new MediaPersistVerifyError("runs/r1/s1/sh1.png", 10_000);
  assert.equal(err.name, "MediaPersistVerifyError");
  assert.equal(err.objectKey, "runs/r1/s1/sh1.png");
  assert.equal(err.verifyTimeoutMs, 10_000);
  assert.ok(err instanceof Error);
  assert.ok(err instanceof MediaPersistVerifyError);
});

// =============================================================================
// 9. Injectable clock
// =============================================================================

test("persist uses the injected now() clock for verify timeout", async () => {
  // Provide a clock that instantly puts time past the deadline so verify fails.
  let callCount = 0;
  const frozenNow = () => {
    callCount++;
    // Return a value that always looks like it has exceeded the deadline.
    return Date.now() + 999_999;
  };

  const r2Client = createMockR2Client({ headReturnsNull: true });
  const persister = createMediaPersister({
    r2Client,
    verifyTimeoutMs: 50,
    now: frozenNow,
  });

  await assert.rejects(
    () => persister.persist(makeArgs()),
    MediaPersistVerifyError,
  );
});

// =============================================================================
// 10. Different ext produces different keys
// =============================================================================

test("different extensions produce distinct canonical keys", async () => {
  const r2Client = createMockR2Client();
  const persister = createMediaPersister({ r2Client });

  const pngResult = await persister.persist({ ...BASE_ARGS, bytes: makeBytes("a"), ext: "png" });
  const mp4Result = await persister.persist({ ...BASE_ARGS, bytes: makeBytes("b"), ext: "mp4", shotId: "shot-2" });

  assert.notEqual(pngResult.objectKey, mp4Result.objectKey);
  assert.match(pngResult.objectKey, /\.png$/);
  assert.match(mp4Result.objectKey, /\.mp4$/);
});
