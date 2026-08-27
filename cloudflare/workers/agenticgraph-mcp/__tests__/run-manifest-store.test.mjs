// Unit tests for the durable Run_Manifest persistence layer
// (knowgrph-acos-mcp-connector spec, task 1.2).
//
// Validates the persistence contract that R14.2 / Property 25 depends on:
//
//   - For any Director run state change, after the Mcp_Agent persists the
//     updated Run_Manifest a subsequent `GET /runs/{id}` for that run
//     returns the latest persisted state (read-after-write consistency).
//
// The Durable Object class itself runs under workerd (covered by spec
// task 9.2 integration tests against the deployed Worker). These tests
// drive the pure persistence helper `RunManifestPersistence` and the
// shared serialization helpers against an in-memory storage shim, plus
// the namespace shims used by `persistRunManifestThroughNamespace` and
// `readRunManifestThroughNamespace`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPersistenceFailureDiagnostic,
  buildPersistenceFailureResponse,
  buildPersistenceRecord,
  executeAndPersistDirector,
  extractRunId,
  persistRunManifestThroughNamespace,
  readRunManifestThroughNamespace,
  RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
  RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  RUN_MANIFEST_STORAGE_KEYS,
  RunManifestPersistence,
  RunManifestStore,
  serializeManifestForStorage,
} from "../run-manifest-store.mjs";

// ---------------------------------------------------------------------------
// In-memory storage / namespace shims that mirror the Cloudflare Durable
// Object surface area used by the persistence helpers.
// ---------------------------------------------------------------------------

function createInMemoryStorage() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    // Mirrors DurableObjectStorage.put: accepts either (key, value) or a
    // single object of { key: value } entries committed atomically.
    async put(keyOrEntries, value) {
      if (keyOrEntries && typeof keyOrEntries === "object") {
        for (const [k, v] of Object.entries(keyOrEntries)) {
          map.set(k, v);
        }
        return;
      }
      map.set(keyOrEntries, value);
    },
  };
}

/**
 * Storage shim whose batch `put` throws to simulate a durable-write failure.
 * Because `RunManifestPersistence.put` issues a single atomic batch write, a
 * throwing batch leaves the underlying map untouched - exactly the
 * retain-most-recently-persisted-state guarantee R14.3 requires.
 */
function createFailingStorage({ failAfter = 0 } = {}) {
  const map = new Map();
  let writes = 0;
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    async put(keyOrEntries, value) {
      writes += 1;
      if (writes > failAfter) {
        throw new Error("simulated durable storage write failure");
      }
      if (keyOrEntries && typeof keyOrEntries === "object") {
        for (const [k, v] of Object.entries(keyOrEntries)) {
          map.set(k, v);
        }
        return;
      }
      map.set(keyOrEntries, value);
    },
  };
}

/**
 * Minimal `DurableObjectNamespace` shim that creates an in-process
 * `RunManifestStore` instance per id-from-name and dispatches `fetch`
 * directly. This mirrors the Cloudflare runtime contract well enough for
 * the persistence helpers under test.
 */
function createInMemoryNamespace(options = {}) {
  const { storageFactory = createInMemoryStorage, env = {} } = options;
  const stubsByName = new Map();
  const namespace = {
    idFromName(name) {
      return { name: String(name) };
    },
    get(id) {
      const key = id?.name ?? String(id);
      let stub = stubsByName.get(key);
      if (!stub) {
        const storage = storageFactory();
        const state = { storage };
        const instance = new RunManifestStore(state, env);
        stub = {
          fetch: (request) => instance.fetch(request),
          _instance: instance,
          _storage: storage,
        };
        stubsByName.set(key, stub);
      }
      return stub;
    },
    _stubsByName: stubsByName,
  };
  return namespace;
}

const SAMPLE_MANIFEST = Object.freeze({
  contractVersion: "knowgrph.video_remix/v0.1",
  runId: "demo-run-001",
  state: "approval_required",
  mode: "live",
  approvalGates: [
    { id: "paid-model-call", approvalState: "required" },
    { id: "render-action", approvalState: "required" },
    { id: "payment-action", approvalState: "required" },
    { id: "cloud-deploy", approvalState: "required" },
    { id: "consumer-repo-write", approvalState: "required" },
  ],
  budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0 },
  stages: [{ id: "research", status: "approval_required" }],
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("extractRunId trims and rejects empty/missing values", () => {
  assert.equal(extractRunId({ runId: "abc-123" }), "abc-123");
  assert.equal(extractRunId({ runId: "  spaced  " }), "spaced");
  assert.equal(extractRunId({}), null);
  assert.equal(extractRunId({ runId: "" }), null);
  assert.equal(extractRunId({ runId: "   " }), null);
  assert.equal(extractRunId(null), null);
  assert.equal(extractRunId("not-an-object"), null);
});

test("serializeManifestForStorage round-trips JSON-clean payloads", () => {
  const result = serializeManifestForStorage(SAMPLE_MANIFEST);
  assert.deepEqual(result, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
  // The serialized copy must not be the same reference (defensive copy).
  assert.notEqual(result, SAMPLE_MANIFEST);
});

test("buildPersistenceRecord encodes runId, persistedAt, and contractVersion", () => {
  const record = buildPersistenceRecord(SAMPLE_MANIFEST, 1_700_000_000_000);
  assert.equal(record.runId, "demo-run-001");
  assert.equal(record.contractVersion, "knowgrph.video_remix/v0.1");
  assert.equal(record.persistedAt, "2023-11-14T22:13:20.000Z");
  assert.deepEqual(record.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("buildPersistenceRecord refuses to persist a manifest without a runId", () => {
  assert.throws(
    () => buildPersistenceRecord({ state: "running" }, Date.now()),
    /requires a non-empty `runId`/,
  );
});

test("RUN_MANIFEST_PERSISTENCE_DEADLINE_MS matches R14.2 (2s)", () => {
  assert.equal(RUN_MANIFEST_PERSISTENCE_DEADLINE_MS, 2000);
});

// ---------------------------------------------------------------------------
// RunManifestPersistence (in-memory storage shim)
// ---------------------------------------------------------------------------

test("RunManifestPersistence put then get returns the latest persisted state", async () => {
  const storage = createInMemoryStorage();
  const persistence = new RunManifestPersistence({ storage, now: () => 1_700_000_000_000 });

  const initial = await persistence.get();
  assert.equal(initial, null, "no record before any put");

  const record = await persistence.put(SAMPLE_MANIFEST);
  assert.equal(record.runId, "demo-run-001");
  assert.equal(record.persistedAt, "2023-11-14T22:13:20.000Z");

  const readBack = await persistence.get();
  assert.ok(readBack, "record present after put");
  assert.equal(readBack.runId, "demo-run-001");
  assert.equal(readBack.persistedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(readBack.contractVersion, "knowgrph.video_remix/v0.1");
  assert.deepEqual(readBack.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("RunManifestPersistence put overwrites and exposes the latest state on read-back (Property 25)", async () => {
  const storage = createInMemoryStorage();
  let clock = 1_700_000_000_000;
  const persistence = new RunManifestPersistence({ storage, now: () => clock });

  await persistence.put({ ...SAMPLE_MANIFEST, state: "approval_required" });
  clock += 500;
  await persistence.put({ ...SAMPLE_MANIFEST, state: "complete" });

  const readBack = await persistence.get();
  assert.equal(readBack.manifest.state, "complete");
  assert.equal(readBack.persistedAt, "2023-11-14T22:13:20.500Z");
});

test("RunManifestPersistence stores under documented keys", async () => {
  const storage = createInMemoryStorage();
  const persistence = new RunManifestPersistence({ storage, now: () => 1_700_000_000_000 });
  await persistence.put(SAMPLE_MANIFEST);

  assert.equal(storage.map.get(RUN_MANIFEST_STORAGE_KEYS.runId), "demo-run-001");
  assert.equal(
    storage.map.get(RUN_MANIFEST_STORAGE_KEYS.persistedAt),
    "2023-11-14T22:13:20.000Z",
  );
  assert.equal(
    storage.map.get(RUN_MANIFEST_STORAGE_KEYS.contractVersion),
    "knowgrph.video_remix/v0.1",
  );
  const persistedManifest = storage.map.get(RUN_MANIFEST_STORAGE_KEYS.manifest);
  assert.deepEqual(persistedManifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("RunManifestPersistence rejects manifests without a runId", async () => {
  const storage = createInMemoryStorage();
  const persistence = new RunManifestPersistence({ storage });
  await assert.rejects(
    () => persistence.put({ state: "running" }),
    /requires a non-empty `runId`/,
  );
});

test("RunManifestPersistence requires a real storage object", () => {
  assert.throws(() => new RunManifestPersistence({}), /requires a storage object/);
});

// ---------------------------------------------------------------------------
// Namespace-level helpers (used by the Worker entry)
// ---------------------------------------------------------------------------

test("persistRunManifestThroughNamespace + readRunManifestThroughNamespace round-trip", async () => {
  const namespace = createInMemoryNamespace();

  const record = await persistRunManifestThroughNamespace(namespace, SAMPLE_MANIFEST);
  assert.equal(record.runId, "demo-run-001");
  assert.equal(typeof record.persistedAt, "string");
  assert.deepEqual(record.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));

  const readBack = await readRunManifestThroughNamespace(namespace, "demo-run-001");
  assert.ok(readBack);
  assert.equal(readBack.runId, "demo-run-001");
  assert.deepEqual(readBack.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("readRunManifestThroughNamespace returns null for an unknown runId", async () => {
  const namespace = createInMemoryNamespace();
  const readBack = await readRunManifestThroughNamespace(namespace, "never-persisted");
  assert.equal(readBack, null);
});

test("readRunManifestThroughNamespace returns null for empty runIds", async () => {
  const namespace = createInMemoryNamespace();
  assert.equal(await readRunManifestThroughNamespace(namespace, ""), null);
  assert.equal(await readRunManifestThroughNamespace(namespace, "   "), null);
});

test("namespace helpers refuse to operate without a real namespace", async () => {
  await assert.rejects(
    () => persistRunManifestThroughNamespace(null, SAMPLE_MANIFEST),
    /DurableObjectNamespace/,
  );
  await assert.rejects(
    () => readRunManifestThroughNamespace(undefined, "abc"),
    /DurableObjectNamespace/,
  );
});

test("RunManifestStore PUT then GET returns the latest persisted record (read-after-write)", async () => {
  const storage = createInMemoryStorage();
  const store = new RunManifestStore({ storage }, {});

  const putResponse = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SAMPLE_MANIFEST),
    }),
  );
  assert.equal(putResponse.status, 200);
  const putBody = await putResponse.json();
  assert.equal(putBody.runId, "demo-run-001");

  const getResponse = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", { method: "GET" }),
  );
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.runId, "demo-run-001");
  assert.deepEqual(getBody.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("RunManifestStore GET before any PUT returns 404 not_found", async () => {
  const storage = createInMemoryStorage();
  const store = new RunManifestStore({ storage }, {});
  const response = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", { method: "GET" }),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error, "not_found");
});

test("RunManifestStore PUT with malformed JSON returns 400 invalid_json", async () => {
  const storage = createInMemoryStorage();
  const store = new RunManifestStore({ storage }, {});
  const response = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    }),
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_json");
});

test("RunManifestStore PUT without runId returns 500 persistence_failed", async () => {
  const storage = createInMemoryStorage();
  const store = new RunManifestStore({ storage }, {});
  const response = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "running" }),
    }),
  );
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.status, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(body.error.code, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.match(body.error.message, /requires a non-empty `runId`/);
  // Nothing was previously persisted, so no retained state is reported.
  assert.equal(body.retained.present, false);
});

test("RunManifestStore unknown route returns 404", async () => {
  const storage = createInMemoryStorage();
  const store = new RunManifestStore({ storage }, {});
  const response = await store.fetch(
    new Request("https://run-manifest-store.internal/elsewhere", { method: "GET" }),
  );
  assert.equal(response.status, 404);
});

// ---------------------------------------------------------------------------
// End-to-end Director persistence smoke test - exercises the full path the
// Worker entry takes after a Director run: runVideoRemix -> persist record
// -> read-back returns the latest persisted state (R14.2 / Property 25).
// ---------------------------------------------------------------------------

test("executeAndPersistDirector persists a Director run and the read-back returns the same state", async () => {
  const namespace = createInMemoryNamespace();
  const result = await executeAndPersistDirector({
    namespace,
    args: {
      referenceUrl: "https://example.com/reference.mp4",
      brief: "Persistence smoke test for the Run_Manifest store.",
      mode: "dry-run",
      shotCount: 2,
      runId: "persistence-smoke-001",
    },
  });

  assert.equal(result.persistenceError, null);
  assert.ok(result.persistenceRecord);
  assert.equal(result.persistenceRecord.runId, "persistence-smoke-001");
  assert.equal(result.payload.runId, "persistence-smoke-001");

  const readBack = await readRunManifestThroughNamespace(
    namespace,
    "persistence-smoke-001",
  );
  assert.ok(readBack);
  assert.equal(readBack.runId, "persistence-smoke-001");
  assert.equal(readBack.manifest.runId, "persistence-smoke-001");
  assert.equal(readBack.manifest.state, result.payload.state);
  assert.equal(readBack.manifest.mode, "dry-run");
});

test("executeAndPersistDirector persists the latest state on a second call with the same runId", async () => {
  const namespace = createInMemoryNamespace();
  const baseArgs = {
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Read-back consistency: persist once, then again, then read.",
    runId: "persistence-rerun-001",
    shotCount: 2,
  };

  const first = await executeAndPersistDirector({
    namespace,
    args: { ...baseArgs, mode: "dry-run" },
  });
  assert.equal(first.persistenceError, null);

  const second = await executeAndPersistDirector({
    namespace,
    args: {
      ...baseArgs,
      mode: "live",
      approvals: [
        "paid-model-call",
        "render-action",
        "payment-action",
        "cloud-deploy",
      ],
      sourceCards: [
        { sourceId: "s1", url: "https://example.com/a" },
        { sourceId: "s2", url: "https://example.com/b" },
        { sourceId: "s3", url: "https://example.com/c" },
      ],
    },
  });
  assert.equal(second.persistenceError, null);
  assert.notEqual(first.payload.state, second.payload.state ?? first.payload.state);

  const readBack = await readRunManifestThroughNamespace(
    namespace,
    "persistence-rerun-001",
  );
  assert.ok(readBack);
  assert.equal(readBack.manifest.state, second.payload.state);
  assert.equal(readBack.manifest.mode, "live");
});

// ---------------------------------------------------------------------------
// Persistence-failure handling (R14.3 / task 1.3)
//
//   IF writing the updated Run_Manifest state to durable storage fails, THEN
//   THE Mcp_Agent SHALL (a) retain the most-recently-persisted state,
//   (b) return a response indicating the persistence failure, and (c) emit an
//   observability diagnostic indicating the persistence failure.
// ---------------------------------------------------------------------------

const SECOND_MANIFEST = Object.freeze({
  ...SAMPLE_MANIFEST,
  state: "running",
  stages: [{ id: "research", status: "running" }],
});

test("buildPersistenceFailureResponse reports failure status, retained state, and a diagnostic", () => {
  const failure = buildPersistenceFailureResponse({
    runId: "demo-run-001",
    error: new Error("disk on fire"),
    retained: { runId: "demo-run-001", persistedAt: "2023-11-14T22:13:20.000Z" },
    nowMs: 1_700_000_000_000,
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.persisted, false);
  assert.equal(failure.status, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(failure.error.code, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.match(failure.error.message, /disk on fire/);
  assert.equal(failure.retained.present, true);
  assert.equal(failure.retained.persistedAt, "2023-11-14T22:13:20.000Z");
  assert.equal(failure.diagnostic.type, "run_manifest_persistence_failure");
  assert.equal(failure.diagnostic.runId, "demo-run-001");
  assert.equal(failure.diagnostic.outcomeStatus, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(failure.diagnostic.retainedPersistedAt, "2023-11-14T22:13:20.000Z");
});

test("buildPersistenceFailureDiagnostic carries runId, UTC timestamp, and outcome status", () => {
  const diagnostic = buildPersistenceFailureDiagnostic({
    runId: "abc-123",
    error: "boom",
    retainedPersistedAt: "2023-11-14T22:13:20.000Z",
    retainedStatePresent: true,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(diagnostic.type, "run_manifest_persistence_failure");
  assert.equal(diagnostic.runId, "abc-123");
  assert.equal(diagnostic.utcTimestamp, "2023-11-14T22:13:20.000Z");
  assert.equal(diagnostic.outcomeStatus, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(diagnostic.retainedStatePresent, true);
  assert.equal(diagnostic.error.message, "boom");
});

test("RunManifestPersistence.put leaves the prior record intact when the durable write fails (R14.3a)", async () => {
  // First persist a good record through a normal storage shim, then copy its
  // contents into a failing storage so the prior state is present but the next
  // write throws. The atomic batch write must not mutate the retained record.
  const failing = createFailingStorage({ failAfter: 1 });
  const seed = new RunManifestPersistence({
    storage: failing,
    now: () => 1_700_000_000_000,
  });
  // failAfter:1 -> the seed write (write #1) succeeds.
  const seededRecord = await seed.put(SAMPLE_MANIFEST);
  assert.equal(seededRecord.runId, "demo-run-001");

  // The next write (#2) throws, simulating a durable-storage failure.
  await assert.rejects(
    () => seed.put(SECOND_MANIFEST),
    /simulated durable storage write failure/,
  );

  // Read-back returns the most-recently-persisted (prior) state, unchanged.
  const readBack = await seed.get();
  assert.ok(readBack, "prior record retained after a failed write");
  assert.equal(readBack.runId, "demo-run-001");
  assert.equal(readBack.manifest.state, "approval_required");
  assert.deepEqual(readBack.manifest, JSON.parse(JSON.stringify(SAMPLE_MANIFEST)));
});

test("RunManifestStore PUT failure: prior state retained, structured failure returned, diagnostic emitted (R14.3 a/b/c)", async () => {
  const storage = createFailingStorage({ failAfter: 1 });
  const emitted = [];
  const store = new RunManifestStore(
    { storage },
    { emitPersistenceDiagnostic: (d) => emitted.push(d) },
  );

  // Seed a good record (write #1 succeeds).
  const seedResponse = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SAMPLE_MANIFEST),
    }),
  );
  assert.equal(seedResponse.status, 200);

  // Next PUT triggers the simulated write failure (write #2 throws).
  const failResponse = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SECOND_MANIFEST),
    }),
  );

  // (b) a structured persistence-failure response is returned.
  assert.equal(failResponse.status, 500);
  const failBody = await failResponse.json();
  assert.equal(failBody.status, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(failBody.error.code, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(failBody.retained.present, true);
  assert.equal(failBody.retained.runId, "demo-run-001");

  // (c) an observability diagnostic was emitted.
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "run_manifest_persistence_failure");
  assert.equal(emitted[0].outcomeStatus, RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS);
  assert.equal(emitted[0].retainedStatePresent, true);

  // (a) the prior record is still readable via GET (read-back).
  const getResponse = await store.fetch(
    new Request("https://run-manifest-store.internal/manifest", { method: "GET" }),
  );
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.runId, "demo-run-001");
  assert.equal(getBody.manifest.state, "approval_required");
});

test("persistRunManifestThroughNamespace attaches the structured failure to the thrown error (R14.3b)", async () => {
  const namespace = createInMemoryNamespace({
    storageFactory: () => createFailingStorage({ failAfter: 0 }),
    env: { emitPersistenceDiagnostic: () => {} },
  });
  await assert.rejects(
    async () => {
      try {
        await persistRunManifestThroughNamespace(namespace, SAMPLE_MANIFEST);
      } catch (err) {
        assert.ok(err.persistenceFailure, "structured failure attached to error");
        assert.equal(
          err.persistenceFailure.status,
          RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
        );
        assert.equal(err.httpStatus, 500);
        throw err;
      }
    },
    /persistence failed with status 500/,
  );
});

test("executeAndPersistDirector surfaces a persistence-failure response and emits a diagnostic (R14.3 b/c)", async () => {
  // failAfter:0 -> every durable write throws, so the Director's persistence
  // fails on the first attempt with no prior state retained.
  const namespace = createInMemoryNamespace({
    storageFactory: () => createFailingStorage({ failAfter: 0 }),
    env: { emitPersistenceDiagnostic: () => {} },
  });
  const emitted = [];
  const result = await executeAndPersistDirector({
    namespace,
    args: {
      referenceUrl: "https://example.com/reference.mp4",
      brief: "Persistence-failure path for the Run_Manifest store.",
      mode: "dry-run",
      shotCount: 2,
      runId: "persistence-failure-001",
    },
    emitDiagnostic: (d) => emitted.push(d),
  });

  // The Director itself still produced a payload.
  assert.equal(result.payload.runId, "persistence-failure-001");
  // (b) a structured persistence-failure response is returned.
  assert.ok(result.persistenceError, "persistence error captured");
  assert.ok(result.persistenceFailure, "structured persistence failure returned");
  assert.equal(
    result.persistenceFailure.status,
    RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  );
  assert.equal(result.persistenceRecord, null);
  // (c) an observability diagnostic was emitted exactly once.
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].type, "run_manifest_persistence_failure");
  assert.equal(emitted[0].runId, "persistence-failure-001");
});

test("executeAndPersistDirector retains the prior persisted state when a later write fails (R14.3a)", async () => {
  // failAfter:1 -> the first Director run persists (write #1), the second
  // Director run's write (#2) fails, and a read-back must still return the
  // first run's persisted state.
  const namespace = createInMemoryNamespace({
    storageFactory: () => createFailingStorage({ failAfter: 1 }),
    env: { emitPersistenceDiagnostic: () => {} },
  });
  const baseArgs = {
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Retain-prior-state on a later persistence failure.",
    runId: "persistence-retain-001",
    shotCount: 2,
  };

  const first = await executeAndPersistDirector({
    namespace,
    args: { ...baseArgs, mode: "dry-run" },
    emitDiagnostic: () => {},
  });
  assert.equal(first.persistenceError, null);
  assert.ok(first.persistenceRecord);
  const firstState = first.payload.state;

  const second = await executeAndPersistDirector({
    namespace,
    args: {
      ...baseArgs,
      mode: "live",
      approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
      sourceCards: [
        { sourceId: "s1", url: "https://example.com/a" },
        { sourceId: "s2", url: "https://example.com/b" },
        { sourceId: "s3", url: "https://example.com/c" },
      ],
    },
    emitDiagnostic: () => {},
  });
  assert.ok(second.persistenceError, "second persist failed");
  assert.ok(second.persistenceFailure);

  // Read-back returns the first (most-recently-persisted) state, unchanged.
  const readBack = await readRunManifestThroughNamespace(
    namespace,
    "persistence-retain-001",
  );
  assert.ok(readBack);
  assert.equal(readBack.manifest.state, firstState);
  assert.equal(readBack.manifest.mode, "dry-run");
});
