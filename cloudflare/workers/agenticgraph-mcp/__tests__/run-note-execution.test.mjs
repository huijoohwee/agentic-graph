import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeRunNoteThroughNamespace,
  persistRunManifestThroughNamespace,
  readRunManifestThroughNamespace,
  RUN_NOTE_TOOL_NAME,
  RunManifestStore,
} from "../run-manifest-store.mjs";
import { buildKnowgrphMcpToolDefinitions } from "../tool-registry.mjs";

function createTransactionalStorage() {
  const map = new Map();
  let transactionTail = Promise.resolve();
  async function put(target, keyOrEntries, value) {
    if (keyOrEntries && typeof keyOrEntries === "object") {
      for (const [key, entry] of Object.entries(keyOrEntries)) target.set(key, entry);
      return;
    }
    target.set(keyOrEntries, value);
  }
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : undefined;
    },
    async put(keyOrEntries, value) {
      await put(map, keyOrEntries, value);
    },
    transaction(callback) {
      const run = transactionTail.then(async () => {
        const snapshot = new Map(map);
        const result = await callback({
          get: async (key) => snapshot.has(key) ? snapshot.get(key) : undefined,
          put: (keyOrEntries, value) => put(snapshot, keyOrEntries, value),
        });
        map.clear();
        for (const [key, value] of snapshot) map.set(key, value);
        return result;
      });
      transactionTail = run.catch(() => undefined);
      return run;
    },
  };
}

function createNamespace() {
  const stubs = new Map();
  return {
    idFromName(name) {
      return { name: String(name) };
    },
    get(id) {
      if (!stubs.has(id.name)) {
        const storage = createTransactionalStorage();
        const instance = new RunManifestStore({ storage }, {});
        stubs.set(id.name, { fetch: (request) => instance.fetch(request), storage });
      }
      return stubs.get(id.name);
    },
  };
}

const execution = Object.freeze({
  schema: "function-execution-receipt/v1",
  receiptId: "receipt-run-note-001",
  idempotencyKey: "a".repeat(64),
  requestDigest: "b".repeat(64),
});

async function seed(namespace) {
  await persistRunManifestThroughNamespace(namespace, {
    contractVersion: "run-manifest/v1",
    runId: "run-note-001",
    state: "completed",
  });
}

test("run-note tool is a bounded idempotent mutation in the MCP catalog", () => {
  const definition = buildKnowgrphMcpToolDefinitions().find(
    (entry) => entry.name === RUN_NOTE_TOOL_NAME,
  );
  assert.ok(definition);
  assert.equal(definition.inputSchema.additionalProperties, false);
  assert.equal(definition.outputSchema.additionalProperties, false);
  assert.deepEqual(definition.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  });
});

test("missing execution metadata fails without mutating the Run_Manifest", async () => {
  const namespace = createNamespace();
  await seed(namespace);

  const result = await executeRunNoteThroughNamespace(namespace, {
    args: { run_id: "run-note-001", note: "reviewed" },
    idempotencyHeader: execution.idempotencyKey,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "execution_metadata_required");
  const missingHeader = await executeRunNoteThroughNamespace(namespace, {
    args: { run_id: "run-note-001", note: "reviewed" },
    execution,
  });
  assert.equal(missingHeader.ok, false);
  assert.equal(missingHeader.error.code, "idempotency_header_mismatch");
  const stored = await readRunManifestThroughNamespace(namespace, "run-note-001");
  assert.equal(stored.manifest.operatorNote, undefined);
});

test("retry after an uncertain result replays one durable run-note mutation", async () => {
  const namespace = createNamespace();
  await seed(namespace);
  const request = {
    args: { run_id: "run-note-001", note: "Operator reviewed this run." },
    execution,
    idempotencyHeader: execution.idempotencyKey,
  };

  const droppedResponse = await executeRunNoteThroughNamespace(namespace, request);
  assert.equal(droppedResponse.execution_receipt.status, "applied");
  const recovered = await executeRunNoteThroughNamespace(namespace, request);

  assert.deepEqual(recovered, {
    ok: true,
    run_id: "run-note-001",
    note: "Operator reviewed this run.",
    revision: 1,
    execution_receipt: {
      schema: "knowgrph-tool-execution-receipt/v1",
      idempotencyKey: execution.idempotencyKey,
      requestDigest: execution.requestDigest,
      status: "replayed",
    },
  });
  const stored = await readRunManifestThroughNamespace(namespace, "run-note-001");
  assert.deepEqual(stored.manifest.operatorNote, {
    text: "Operator reviewed this run.",
    revision: 1,
    updatedAt: stored.persistedAt,
  });
});

test("one idempotency key cannot authorize changed arguments", async () => {
  const namespace = createNamespace();
  await seed(namespace);
  await executeRunNoteThroughNamespace(namespace, {
    args: { run_id: "run-note-001", note: "first note" },
    execution,
    idempotencyHeader: execution.idempotencyKey,
  });

  const conflict = await executeRunNoteThroughNamespace(namespace, {
    args: { run_id: "run-note-001", note: "changed note" },
    execution: { ...execution, requestDigest: "c".repeat(64) },
    idempotencyHeader: execution.idempotencyKey,
  });

  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "idempotency_conflict");
  const stored = await readRunManifestThroughNamespace(namespace, "run-note-001");
  assert.equal(stored.manifest.operatorNote.text, "first note");
  assert.equal(stored.manifest.operatorNote.revision, 1);
});
