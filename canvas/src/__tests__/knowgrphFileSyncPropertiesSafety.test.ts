import assert from "node:assert/strict";
import fc from "fast-check";
import {
  FILE_SYNC_LIMITS,
  FileSyncOutbox,
  createInMemoryFileSyncOutboxStore,
} from "../lib/storage/file-sync";
import {
  MemoryFileSyncProvider,
  createFileSyncPropertyHarness,
} from "./knowgrphFileSyncPropertiesCore.test";

const PROPERTY_RUNS = 100;

// Feature: knowgrph-storage-sync-enhancement, Property 53: Outbox capacity is atomic.
export async function testKnowgrphFileSyncProperty53AtomicOutboxCapacity() {
  assert.equal(FILE_SYNC_LIMITS.outboxCapacity, 10_000);
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 20 }),
      async (capacity, overflow) => {
        let id = 0;
        const outbox = new FileSyncOutbox(
          createInMemoryFileSyncOutboxStore(),
          {
            capacity,
            createId: () => `atomic-${++id}`,
            now: () => id,
          },
        );
        const results = await Promise.all(
          Array.from({ length: capacity + overflow }, (_, index) =>
            outbox.enqueue({
              workspaceId: "atomic-workspace",
              providerId: "memory-remote",
              direction: "push",
              fileKey: `file-${index}.bin`,
            }),
          ),
        );
        const records = await outbox.list();
        assert.equal(
          results.filter((result) => result.status === "queued").length,
          capacity,
        );
        assert.equal(
          results.filter((result) => result.status === "capacity").length,
          overflow,
        );
        assert.deepEqual(
          records.map((record) => record.sequence),
          Array.from({ length: capacity }, (_, index) => index + 1),
        );
        assert.equal(new Set(records.map((record) => record.id)).size, capacity);
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

// Feature: knowgrph-storage-sync-enhancement, Property 54: Offline replay is FIFO with 1s/2s, max-three retry ownership.
export async function testKnowgrphFileSyncProperty54FifoRetryOwnership() {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
      ),
      async (failureCounts) => {
        const sleeps: number[] = [];
        const harness = createFileSyncPropertyHarness({
          sleep: async (delayMs) => {
            sleeps.push(delayMs);
          },
        });
        const keys = ["a.bin", "b.bin", "c.bin"];
        for (const [index, key] of keys.entries()) {
          const bytes = new Uint8Array([index + 1]);
          await harness.cacheProvider.write(
            {
              entry: {
                key,
                kind: "file",
                entryType: "standard",
                sizeBytes: bytes.byteLength,
                hashes: [{ algorithm: "test-hash", value: `0${index + 1}` }],
                revision: null,
                modifiedAtMs: null,
              },
              bytes,
              expectedRevision: null,
            },
            new AbortController().signal,
          );
          harness.remote.writeFailures.set(key, failureCounts[index]);
          assert.equal(
            (await harness.engine.queueTransfer(
              harness.remote.providerId,
              "push",
              key,
            )).status,
            "queued",
          );
        }
        const outcomes = await harness.engine.drainOutbox();
        assert.deepEqual(
          outcomes.map((outcome) => outcome.fileKey),
          keys,
        );
        assert.ok(
          outcomes.every((outcome) => outcome.status === "transferred"),
        );
        assert.deepEqual(
          harness.remote.attemptedWrites,
          keys.flatMap((key, index) =>
            Array.from({ length: failureCounts[index] + 1 }, () => key),
          ),
        );
        assert.deepEqual(
          sleeps,
          failureCounts.flatMap((failureCount) =>
            FILE_SYNC_LIMITS.retryDelaysMs.slice(0, failureCount),
          ),
        );
        assert.deepEqual(await harness.outbox.list(), []);
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );

  const terminalSleeps: number[] = [];
  const terminalHarness = createFileSyncPropertyHarness({
    sleep: async (delayMs) => {
      terminalSleeps.push(delayMs);
    },
  });
  const terminalBytes = new Uint8Array([7]);
  await terminalHarness.cacheProvider.write(
    {
      entry: {
        key: "terminal.bin",
        kind: "file",
        entryType: "standard",
        sizeBytes: 1,
        hashes: [{ algorithm: "test-hash", value: "07" }],
        revision: null,
        modifiedAtMs: null,
      },
      bytes: terminalBytes,
      expectedRevision: null,
    },
    new AbortController().signal,
  );
  terminalHarness.remote.writeFailures.set("terminal.bin", 3);
  await terminalHarness.engine.queueTransfer(
    terminalHarness.remote.providerId,
    "push",
    "terminal.bin",
  );
  const terminalResult = await terminalHarness.engine.drainOutbox();
  assert.equal(terminalResult[0]?.status, "error");
  const retained = await terminalHarness.outbox.list();
  assert.equal(retained[0]?.state, "failed");
  assert.equal(retained[0]?.attempts, 3);
  assert.deepEqual(terminalSleeps, [1_000, 2_000]);
}

// Feature: knowgrph-storage-sync-enhancement, Property 55: Errors and durable state exclude credentials.
export async function testKnowgrphFileSyncProperty55SanitizedCredentialState() {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[A-Za-z0-9]{8,20}$/),
      fc.stringMatching(/^[A-Za-z0-9]{8,20}$/),
      fc.stringMatching(/^[a-z][a-z0-9]{7,15}$/),
      async (secretSuffix, tokenSuffix, hostLabel) => {
        const secret = `secret.${secretSuffix}`;
        const token = `token-${tokenSuffix}`;
        const remoteHost = `${hostLabel}.storage.example`;
        const harness = createFileSyncPropertyHarness({
          sleep: async () => undefined,
        });
        harness.remote.seedFile("secret.bin", new Uint8Array([1]));
        harness.remote.statError = new Error(
          `Bearer ${secret} token=${token} https://${remoteHost}/path?sig=${secret}`,
        );
        const direct = await harness.engine.pull(harness.remote.providerId);
        assert.equal(direct.outcomes[0]?.status, "error");
        await harness.engine.queueTransfer(
          harness.remote.providerId,
          "pull",
          "secret.bin",
        );
        const drained = await harness.engine.drainOutbox();
        const durableState = JSON.stringify({
          direct,
          drained,
          outbox: await harness.outbox.list(),
          ledger: [...harness.ledger.records.values()],
        });
        assert.equal(durableState.includes(secret), false);
        assert.equal(durableState.includes(token), false);
        assert.equal(durableState.includes(remoteHost), false);
        assert.equal(durableState.includes("[redacted]"), true);
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

// Feature: knowgrph-storage-sync-enhancement, Property 56: Runtime and entry-type boundaries fail closed.
export async function testKnowgrphFileSyncProperty56RuntimeAndUnsupportedBoundaries() {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[a-z][a-z0-9]{7,15}$/),
      fc.uint8Array({ minLength: 1, maxLength: 32 }),
      async (caseId, bytes) => {
        const blockedKey = `${caseId}/blocked.bin`;
        const productionRemote = new MemoryFileSyncProvider("production-remote");
        productionRemote.seedFile(blockedKey, bytes);
        const production = createFileSyncPropertyHarness({
          remote: productionRemote,
          runtime: "production",
        });
        const productionResult = await production.engine.pull(
          productionRemote.providerId,
        );
        assert.equal(productionResult.outcomes[0]?.reason, "runtime-forbidden");
        assert.equal(productionRemote.listCalls, 0);
        assert.equal(productionRemote.statCalls, 0);

        const cloudflareRemote = new MemoryFileSyncProvider(
          "cloudflare-remote",
          "cloudflare-resource",
        );
        cloudflareRemote.seedFile(blockedKey, bytes);
        const cloudflare = createFileSyncPropertyHarness({
          remote: cloudflareRemote,
        });
        const cloudflareResult = await cloudflare.engine.pull(
          cloudflareRemote.providerId,
        );
        assert.equal(cloudflareResult.outcomes[0]?.reason, "runtime-forbidden");
        assert.equal(cloudflareRemote.listCalls, 0);

        const unsupportedRemote = new MemoryFileSyncProvider("unsupported-remote");
        unsupportedRemote.seedFile(
          `${caseId}/google-native`,
          bytes,
          "google-native",
        );
        unsupportedRemote.seedFile(`${caseId}/shortcut`, bytes, "shortcut");
        unsupportedRemote.seedDirectory(
          `${caseId}/graph-remote`,
          "graph-remote",
        );
        const unsupported = createFileSyncPropertyHarness({
          remote: unsupportedRemote,
        });
        const unsupportedResult = await unsupported.engine.pull(
          unsupportedRemote.providerId,
        );
        assert.deepEqual(
          unsupportedResult.outcomes.map((outcome) => outcome.status),
          ["unsupported", "unsupported", "unsupported"],
        );
        assert.equal(unsupportedRemote.readCalls, 0);
        assert.equal(unsupported.collection.putCalls, 0);
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}
