import assert from "node:assert/strict";
import fc from "fast-check";
import {
  FILE_SYNC_LIMITS,
  FileSyncEngine,
  FileSyncOperationError,
  FileSyncOutbox,
  FileSyncProviderRegistry,
  createInMemoryFileSyncOutboxStore,
  createPersistedCacheProvider,
  type FileSyncEntry,
  type FileSyncEntryType,
  type FileSyncHash,
  type FileSyncLedgerRecord,
  type FileSyncLedgerStore,
  type FileSyncProvider,
  type FileSyncProviderTarget,
  type FileSyncRuntime,
  type PersistedFileSyncBinaryStore,
  type PersistedFileSyncCollection,
  type PersistedFileSyncRecord,
} from "../lib/storage/file-sync";

const PROPERTY_RUNS = 100;
const WORKSPACE_ID = "property-workspace";
const activeSignal = new AbortController().signal;

export class MemoryFileSyncProvider implements FileSyncProvider {
  readonly entries = new Map<string, FileSyncEntry>();
  readonly bodies = new Map<string, Uint8Array>();
  readonly writeFailures = new Map<string, number>();
  readonly attemptedWrites: string[] = [];
  providerId: string;
  target: FileSyncProviderTarget;
  completeListing = true;
  listCalls = 0;
  statCalls = 0;
  readCalls = 0;
  writeCalls = 0;
  deleteCalls = 0;
  statError: Error | null = null;
  private revision = 0;

  constructor(
    providerId = "memory-remote",
    target: FileSyncProviderTarget = "external-file-storage",
  ) {
    this.providerId = providerId;
    this.target = target;
  }

  seedFile(
    key: string,
    bytes: Uint8Array,
    entryType: FileSyncEntryType = "standard",
    sizeBytes = bytes.byteLength,
  ): void {
    this.revision += 1;
    this.entries.set(key, {
      key,
      kind: "file",
      entryType,
      sizeBytes,
      hashes: testHashes(bytes),
      revision: `remote:${this.revision}`,
      modifiedAtMs: this.revision,
    });
    this.bodies.set(key, new Uint8Array(bytes));
  }

  seedDirectory(
    key: string,
    entryType: FileSyncEntryType = "standard",
  ): void {
    this.revision += 1;
    this.entries.set(key, {
      key,
      kind: "directory",
      entryType,
      sizeBytes: 0,
      hashes: [],
      revision: `remote:${this.revision}`,
      modifiedAtMs: this.revision,
    });
  }

  async list(
    prefix: string,
    cursor: string | null,
    _signal: AbortSignal,
  ) {
    this.listCalls += 1;
    const matching = [...this.entries.values()]
      .filter(
        (entry) =>
          !prefix ||
          entry.key === prefix ||
          entry.key.startsWith(`${prefix}/`),
      )
      .sort((left, right) => left.key.localeCompare(right.key));
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + 2, matching.length);
    const nextCursor = end < matching.length ? String(end) : null;
    return {
      entries: matching.slice(start, end).map(cloneEntry),
      nextCursor,
      snapshotVersion: "memory:v1",
      complete: nextCursor === null && this.completeListing,
    };
  }

  async stat(key: string, _signal: AbortSignal) {
    this.statCalls += 1;
    if (this.statError) {
      throw this.statError;
    }
    const entry = this.entries.get(key);
    return entry ? cloneEntry(entry) : null;
  }

  async read(key: string, _signal: AbortSignal) {
    this.readCalls += 1;
    const entry = this.entries.get(key);
    const bytes = this.bodies.get(key);
    if (!entry || !bytes) {
      throw new Error("Memory provider body missing");
    }
    return { entry: cloneEntry(entry), bytes: new Uint8Array(bytes) };
  }

  async write(
    request: {
      entry: FileSyncEntry;
      bytes: Uint8Array | null;
      expectedRevision?: string | null;
      trustedSourceHashes?: readonly FileSyncHash[];
    },
    _signal: AbortSignal,
  ) {
    this.writeCalls += 1;
    this.attemptedWrites.push(request.entry.key);
    const failures = this.writeFailures.get(request.entry.key) ?? 0;
    if (failures > 0) {
      this.writeFailures.set(request.entry.key, failures - 1);
      throw new Error("Injected memory-provider write failure");
    }
    const current = this.entries.get(request.entry.key) ?? null;
    if (
      request.expectedRevision !== undefined &&
      (current?.revision ?? null) !== request.expectedRevision
    ) {
      throw new FileSyncOperationError(
        "conflict",
        "Memory provider revision conflict",
      );
    }
    this.revision += 1;
    const bytes = request.bytes ? new Uint8Array(request.bytes) : null;
    const written: FileSyncEntry = {
      ...request.entry,
      sizeBytes: bytes?.byteLength ?? 0,
      hashes: bytes ? testHashes(bytes) : [],
      revision: `remote:${this.revision}`,
      modifiedAtMs: this.revision,
    };
    this.entries.set(written.key, written);
    if (bytes) {
      this.bodies.set(written.key, bytes);
    }
    return cloneEntry(written);
  }

  async delete(key: string, _signal: AbortSignal): Promise<void> {
    this.deleteCalls += 1;
    this.entries.delete(key);
    this.bodies.delete(key);
  }
}

export class MemoryPersistedCollection
  implements PersistedFileSyncCollection
{
  readonly records = new Map<string, PersistedFileSyncRecord>();
  putCalls = 0;
  private version = 0;

  async listPage(request: {
    workspaceId: string;
    prefix: string;
    cursor: string | null;
    pageSize: number;
  }) {
    const matching = [...this.records.values()]
      .filter(
        (record) =>
          record.workspaceId === request.workspaceId &&
          (!request.prefix ||
            record.key === request.prefix ||
            record.key.startsWith(`${request.prefix}/`)),
      )
      .sort((left, right) => left.key.localeCompare(right.key));
    const start = request.cursor ? Number(request.cursor) : 0;
    const end = Math.min(start + request.pageSize, matching.length);
    return {
      records: matching.slice(start, end).map(cloneRecord),
      nextCursor: end < matching.length ? String(end) : null,
      snapshotVersion: `cache:${this.version}`,
      complete: end >= matching.length,
    };
  }

  async get(workspaceId: string, key: string) {
    const record = this.records.get(key);
    return record?.workspaceId === workspaceId ? cloneRecord(record) : null;
  }

  async put(
    record: PersistedFileSyncRecord,
    expectedRevision: string | null | undefined,
  ): Promise<void> {
    const current = this.records.get(record.key) ?? null;
    if (
      expectedRevision !== undefined &&
      (current?.revision ?? null) !== expectedRevision
    ) {
      throw new FileSyncOperationError(
        "conflict",
        "Memory collection revision conflict",
      );
    }
    this.putCalls += 1;
    this.version += 1;
    this.records.set(record.key, cloneRecord(record));
  }

  async delete(
    workspaceId: string,
    key: string,
    expectedRevision: string | null | undefined,
  ): Promise<void> {
    const record = this.records.get(key);
    if (
      expectedRevision !== undefined &&
      (record?.revision ?? null) !== expectedRevision
    ) {
      throw new FileSyncOperationError(
        "conflict",
        "Memory collection revision conflict",
      );
    }
    if (record?.workspaceId === workspaceId) {
      this.version += 1;
      this.records.delete(key);
    }
  }
}

export class MemoryBinaryStore implements PersistedFileSyncBinaryStore {
  readonly bodies = new Map<string, Uint8Array>();

  async read(binaryKey: string) {
    const bytes = this.bodies.get(binaryKey);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async write(binaryKey: string, bytes: Uint8Array): Promise<void> {
    this.bodies.set(binaryKey, new Uint8Array(bytes));
  }

  async delete(binaryKey: string): Promise<void> {
    this.bodies.delete(binaryKey);
  }
}

export class MemoryLedger implements FileSyncLedgerStore {
  readonly records = new Map<string, FileSyncLedgerRecord>();

  async get(workspaceId: string, providerId: string, fileKey: string) {
    return this.records.get(`${workspaceId}:${providerId}:${fileKey}`) ?? null;
  }

  async put(record: FileSyncLedgerRecord): Promise<void> {
    this.records.set(
      `${record.workspaceId}:${record.providerId}:${record.fileKey}`,
      structuredClone(record),
    );
  }
}

export function createFileSyncPropertyHarness(options: {
  remote?: MemoryFileSyncProvider;
  runtime?: FileSyncRuntime;
  outboxCapacity?: number;
  sleep?: (delayMs: number) => Promise<void>;
} = {}) {
  const remote = options.remote ?? new MemoryFileSyncProvider();
  const collection = new MemoryPersistedCollection();
  const binaries = new MemoryBinaryStore();
  const cacheProvider = createPersistedCacheProvider({
    workspaceId: WORKSPACE_ID,
    collection,
    binaries,
    hashComputer: { compute: async (bytes) => testHashes(bytes) },
  });
  const ledger = new MemoryLedger();
  let id = 0;
  const outbox = new FileSyncOutbox(createInMemoryFileSyncOutboxStore(), {
    capacity: options.outboxCapacity,
    createId: () => `outbox-${++id}`,
    now: () => 1_777_000_000_000 + id,
  });
  const providers = new FileSyncProviderRegistry();
  assert.deepEqual(providers.register(remote).status, "registered");
  const engine = new FileSyncEngine({
    workspaceId: WORKSPACE_ID,
    cacheProvider,
    providers,
    ledger,
    outbox,
    runtime: () => options.runtime ?? "dev",
    sleep: options.sleep,
  });
  return {
    remote,
    collection,
    binaries,
    cacheProvider,
    ledger,
    outbox,
    providers,
    engine,
  };
}

// Feature: knowgrph-storage-sync-enhancement, Property 49: Provider IDs are unique.
export function testKnowgrphFileSyncProperty49UniqueProviderRegistry() {
  fc.assert(
    fc.property(
      fc.array(fc.stringMatching(/^[a-z][a-z0-9.-]{0,12}$/), {
        minLength: 1,
        maxLength: 30,
      }),
      (providerIds) => {
        const registry = new FileSyncProviderRegistry();
        const accepted = providerIds.filter(
          (providerId, index) => providerIds.indexOf(providerId) === index,
        );
        const statuses = providerIds.map((providerId) =>
          registry.register(new MemoryFileSyncProvider(providerId)).status,
        );
        assert.deepEqual(registry.listProviderIds(), [...accepted].sort());
        statuses.forEach((status, index) => {
          assert.equal(
            status,
            providerIds.indexOf(providerIds[index]) === index
              ? "registered"
              : "duplicate-id",
          );
        });
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

// Feature: knowgrph-storage-sync-enhancement, Property 50: Files and directories round-trip both ways.
export async function testKnowgrphFileSyncProperty50BidirectionalRoundTrip() {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 96 }),
      fc.uint8Array({ minLength: 1, maxLength: 96 }),
      async (remoteBytes, localBytes) => {
        const harness = createFileSyncPropertyHarness();
        harness.remote.seedDirectory("remote-dir");
        harness.remote.seedFile("remote-dir/source.bin", remoteBytes);
        const remoteEntry = harness.remote.entries.get("remote-dir/source.bin");
        assert.ok(remoteEntry);
        remoteEntry.hashes = [
          { algorithm: "remote-hash", value: hashValue(remoteBytes) },
        ];
        const pulled = await harness.engine.pull(harness.remote.providerId);
        assert.ok(pulled.outcomes.every((outcome) => outcome.status === "transferred"));
        const cached = await harness.cacheProvider.read(
          "remote-dir/source.bin",
          activeSignal,
        );
        assert.deepEqual(cached.bytes, remoteBytes);
        assert.deepEqual(
          cached.entry.hashes.map((hash) => hash.algorithm).sort(),
          ["remote-hash", "test-hash"],
        );
        const cachedEntry = await harness.cacheProvider.stat(
          "remote-dir/source.bin",
          activeSignal,
        );
        assert.ok(cachedEntry);
        await harness.cacheProvider.write(
          { entry: cachedEntry, bytes: localBytes, expectedRevision: cachedEntry.revision },
          activeSignal,
        );
        await harness.cacheProvider.write(
          {
            entry: directoryEntry("local-dir"),
            bytes: null,
            expectedRevision: null,
          },
          activeSignal,
        );
        const pushed = await harness.engine.push(harness.remote.providerId);
        assert.ok(
          pushed.outcomes.every(
            (outcome) =>
              outcome.status === "transferred" ||
              outcome.status === "already-synced",
          ),
        );
        assert.deepEqual(
          (await harness.remote.read("remote-dir/source.bin", activeSignal)).bytes,
          localBytes,
        );
        assert.equal(
          (await harness.remote.stat("local-dir", activeSignal))?.kind,
          "directory",
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

// Feature: knowgrph-storage-sync-enhancement, Property 51: Tagged hashes skip equal content and fence conflicts.
export async function testKnowgrphFileSyncProperty51HashSkipAndConflict() {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 64 }),
      fc.uint8Array({ minLength: 1, maxLength: 64 }),
      fc.uint8Array({ minLength: 1, maxLength: 64 }),
      async (initialBytes, localBytes, remoteBytes) => {
        fc.pre(
          hashValue(localBytes) !== hashValue(remoteBytes) &&
            hashValue(initialBytes) !== hashValue(localBytes) &&
            hashValue(initialBytes) !== hashValue(remoteBytes),
        );
        const harness = createFileSyncPropertyHarness();
        harness.remote.seedFile("conflict.bin", initialBytes);
        await harness.engine.pull(harness.remote.providerId);
        const readCount = harness.remote.readCalls;
        const cacheWriteCount = harness.collection.putCalls;
        const skipped = await harness.engine.pull(harness.remote.providerId);
        assert.equal(skipped.outcomes[0]?.status, "already-synced");
        assert.equal(harness.remote.readCalls, readCount);
        assert.equal(harness.collection.putCalls, cacheWriteCount);
        const localEntry = await harness.cacheProvider.stat(
          "conflict.bin",
          activeSignal,
        );
        assert.ok(localEntry);
        await harness.cacheProvider.write(
          {
            entry: localEntry,
            bytes: localBytes,
            expectedRevision: localEntry.revision,
          },
          activeSignal,
        );
        harness.remote.seedFile("conflict.bin", remoteBytes);
        const remoteRevision = harness.remote.entries.get("conflict.bin")?.revision;
        const conflicted = await harness.engine.push(harness.remote.providerId);
        assert.equal(conflicted.outcomes[0]?.status, "conflict");
        assert.equal(
          harness.remote.entries.get("conflict.bin")?.revision,
          remoteRevision,
        );
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

// Feature: knowgrph-storage-sync-enhancement, Property 52: Failures continue per file and incomplete lists fence deletes.
export async function testKnowgrphFileSyncProperty52BoundedContinuationAndDeletionFence() {
  assert.equal(FILE_SYNC_LIMITS.timeoutMs, 30_000);
  assert.equal(FILE_SYNC_LIMITS.maxTransferBytes, 10 * 1024 * 1024);
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 64 }),
      async (validBytes) => {
        const harness = createFileSyncPropertyHarness();
        harness.remote.completeListing = false;
        harness.remote.seedFile(
          "a-oversized.bin",
          new Uint8Array([1]),
          "standard",
          FILE_SYNC_LIMITS.maxTransferBytes + 1,
        );
        harness.remote.seedFile("b-valid.bin", validBytes);
        await harness.cacheProvider.write(
          {
            entry: fileEntry("local-extra.bin", new Uint8Array([9])),
            bytes: new Uint8Array([9]),
            expectedRevision: null,
          },
          activeSignal,
        );
        const result = await harness.engine.pull(harness.remote.providerId, {
          deleteExtraneous: true,
        });
        assert.equal(result.deletionFenced, true);
        assert.equal(
          result.outcomes.find((outcome) => outcome.fileKey === "a-oversized.bin")
            ?.reason,
          "limit-exceeded",
        );
        assert.equal(
          result.outcomes.find((outcome) => outcome.fileKey === "b-valid.bin")
            ?.status,
          "transferred",
        );
        assert.ok(
          await harness.cacheProvider.stat("local-extra.bin", activeSignal),
        );
        assert.equal(harness.cacheProvider.target, "local-cache");
      },
    ),
    { numRuns: PROPERTY_RUNS },
  );
}

export function testHashes(bytes: Uint8Array): FileSyncHash[] {
  return [{ algorithm: "test-hash", value: hashValue(bytes) }];
}

function hashValue(bytes: Uint8Array): string {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("") || "00";
}

function fileEntry(key: string, bytes: Uint8Array): FileSyncEntry {
  return {
    key,
    kind: "file",
    entryType: "standard",
    sizeBytes: bytes.byteLength,
    hashes: testHashes(bytes),
    revision: null,
    modifiedAtMs: null,
  };
}

function directoryEntry(key: string): FileSyncEntry {
  return {
    key,
    kind: "directory",
    entryType: "standard",
    sizeBytes: 0,
    hashes: [],
    revision: null,
    modifiedAtMs: null,
  };
}

function cloneEntry(entry: FileSyncEntry): FileSyncEntry {
  return {
    ...entry,
    hashes: entry.hashes.map((hash) => ({ ...hash })),
  };
}

function cloneRecord(
  record: PersistedFileSyncRecord,
): PersistedFileSyncRecord {
  return { ...record, hashes: record.hashes.map((hash) => ({ ...hash })) };
}
