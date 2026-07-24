import {
  FILE_SYNC_LIMITS,
  hasFileSyncControlCharacters,
  normalizeFileSyncKey,
  normalizeFileSyncProviderId,
  type FileSyncEntry,
  type FileSyncHashComputer,
  type FileSyncProvider,
  type PersistedFileSyncBinaryStore,
  type PersistedFileSyncCollection,
  type PersistedFileSyncRecord,
} from "./contract";
import { FileSyncOperationError } from "./errors";
import { normalizeFileSyncHashes } from "./hashes";
import { validateFileSyncEntry } from "./operationSupport";

export interface PersistedCacheProviderOptions {
  providerId?: string;
  workspaceId: string;
  collection: PersistedFileSyncCollection;
  binaries: PersistedFileSyncBinaryStore;
  hashComputer: FileSyncHashComputer;
  binaryKeyFor?: (
    workspaceId: string,
    fileKey: string,
    revision: string,
  ) => string;
  nextRevision?: () => string;
}

export function createPersistedCacheProvider(
  options: PersistedCacheProviderOptions,
): FileSyncProvider {
  const providerId = normalizeFileSyncProviderId(
    options.providerId ?? "browser-cache",
  );
  const workspaceId = validateWorkspaceId(options.workspaceId);
  const binaryKeyFor =
    options.binaryKeyFor ??
    ((targetWorkspaceId, fileKey, revision) =>
      `${encodeURIComponent(targetWorkspaceId)}/${encodeURIComponent(fileKey)}/${encodeURIComponent(revision)}`);
  let revisionSequence = 0;
  const nextRevision =
    options.nextRevision ??
    (() => {
      revisionSequence += 1;
      return `cache:${Date.now().toString(36)}:${revisionSequence.toString(36)}`;
    });

  return {
    providerId,
    target: "local-cache",

    async list(prefix, cursor, signal) {
      throwIfAborted(signal);
      const normalizedPrefix = normalizeFileSyncKey(prefix, {
        allowRoot: true,
      });
      const page = await options.collection.listPage({
        workspaceId,
        prefix: normalizedPrefix,
        cursor,
        pageSize: FILE_SYNC_LIMITS.defaultPageSize,
        signal,
      });
      throwIfAborted(signal);
      if (!page.snapshotVersion || page.snapshotVersion.length > 256) {
        throw new Error("Invalid persisted cache snapshot");
      }
      return {
        entries: page.records.map((record) =>
          recordToEntry(assertPersistedRecord(record, workspaceId)),
        ),
        nextCursor: page.nextCursor,
        snapshotVersion: page.snapshotVersion,
        complete: page.complete,
      };
    },

    async stat(key, signal) {
      throwIfAborted(signal);
      const normalizedKey = normalizeFileSyncKey(key);
      const record = await options.collection.get(
        workspaceId,
        normalizedKey,
        signal,
      );
      throwIfAborted(signal);
      return record
        ? recordToEntry(assertPersistedRecord(record, workspaceId))
        : null;
    },

    async read(key, signal) {
      throwIfAborted(signal);
      const normalizedKey = normalizeFileSyncKey(key);
      const record = await options.collection.get(
        workspaceId,
        normalizedKey,
        signal,
      );
      if (!record) {
        throw new Error("Persisted cache entry not found");
      }
      const validated = assertPersistedRecord(record, workspaceId);
      if (validated.kind !== "file" || !validated.binaryKey) {
        throw new Error("Persisted cache entry has no file body");
      }
      const bytes = await options.binaries.read(validated.binaryKey, signal);
      throwIfAborted(signal);
      if (!bytes) {
        throw new Error("Persisted cache file body not found");
      }
      if (
        bytes.byteLength !== validated.sizeBytes ||
        bytes.byteLength > FILE_SYNC_LIMITS.maxTransferBytes
      ) {
        throw new FileSyncOperationError(
          "limit-exceeded",
          "Persisted cache file body violates transfer bounds",
        );
      }
      return {
        entry: recordToEntry(validated),
        bytes: new Uint8Array(bytes),
      };
    },

    async write(request, signal) {
      throwIfAborted(signal);
      const entry = validateEntry(request.entry);
      const previous = await options.collection.get(
        workspaceId,
        entry.key,
        signal,
      );
      assertExpectedRevision(previous, request.expectedRevision);
      if (entry.entryType !== "standard") {
        throw new FileSyncOperationError(
          "unsupported-entry",
          "Unsupported file-sync entry",
        );
      }
      if (entry.kind === "directory") {
        const revision = validateGeneratedRevision(nextRevision());
        const record: PersistedFileSyncRecord = {
          ...entry,
          hashes: [],
          sizeBytes: 0,
          workspaceId,
          binaryKey: null,
          revision,
        };
        await options.collection.put(
          record,
          request.expectedRevision,
          signal,
        );
        if (previous?.binaryKey) {
          await options.binaries.delete(previous.binaryKey, signal);
        }
        throwIfAborted(signal);
        return recordToEntry(record);
      }
      if (!request.bytes) {
        throw new Error("File body is required");
      }
      const bytes = new Uint8Array(request.bytes);
      if (bytes.byteLength > FILE_SYNC_LIMITS.maxTransferBytes) {
        throw new FileSyncOperationError(
          "limit-exceeded",
          "File exceeds the transfer size bound",
        );
      }
      const computedHashes = await options.hashComputer.compute(bytes, signal);
      const hashes = normalizeFileSyncHashes([
        ...computedHashes,
        ...(request.trustedSourceHashes ?? []),
      ]);
      if (hashes.length === 0) {
        throw new Error("Persisted cache hash computation returned no hashes");
      }
      throwIfAborted(signal);
      const revision = validateGeneratedRevision(nextRevision());
      const binaryKey = binaryKeyFor(workspaceId, entry.key, revision);
      if (!binaryKey || binaryKey.length > 2_048) {
        throw new Error("Invalid persisted cache binary key");
      }
      if (previous?.binaryKey === binaryKey) {
        throw new Error("Persisted cache binary keys must be revision-scoped");
      }
      const record: PersistedFileSyncRecord = {
        ...entry,
        sizeBytes: bytes.byteLength,
        hashes,
        workspaceId,
        binaryKey,
        revision,
      };
      await replaceFileAtomically(
        options.collection,
        options.binaries,
        previous,
        record,
        bytes,
        request.expectedRevision,
        signal,
      );
      throwIfAborted(signal);
      return recordToEntry(record);
    },

    async delete(key, signal, expectedRevision) {
      throwIfAborted(signal);
      const normalizedKey = normalizeFileSyncKey(key);
      const previous = await options.collection.get(
        workspaceId,
        normalizedKey,
        signal,
      );
      assertExpectedRevision(previous, expectedRevision);
      if (!previous) {
        return;
      }
      const validated = assertPersistedRecord(previous, workspaceId);
      await options.collection.delete(
        workspaceId,
        normalizedKey,
        expectedRevision,
        signal,
      );
      if (validated.binaryKey) {
        await options.binaries.delete(validated.binaryKey, signal);
      }
      throwIfAborted(signal);
    },
  };
}

async function replaceFileAtomically(
  collection: PersistedFileSyncCollection,
  binaries: PersistedFileSyncBinaryStore,
  previous: PersistedFileSyncRecord | null,
  next: PersistedFileSyncRecord,
  bytes: Uint8Array,
  expectedRevision: string | null | undefined,
  signal: AbortSignal,
): Promise<void> {
  const previousBytes = previous?.binaryKey
    ? await binaries.read(previous.binaryKey, signal)
    : null;
  const nextBinaryKey = next.binaryKey!;
  const previousBinaryKey = previous?.binaryKey ?? null;
  await binaries.write(nextBinaryKey, bytes, signal);
  try {
    await collection.put(next, expectedRevision, signal);
  } catch (error) {
    if (previousBinaryKey === nextBinaryKey && previousBytes) {
      await binaries.write(previousBinaryKey, previousBytes);
    } else {
      await binaries.delete(nextBinaryKey);
    }
    throw error;
  }
  if (previousBinaryKey && previousBinaryKey !== nextBinaryKey) {
    await binaries.delete(previousBinaryKey, signal);
  }
}

function assertExpectedRevision(
  current: PersistedFileSyncRecord | null,
  expectedRevision: string | null | undefined,
): void {
  if (expectedRevision === undefined) {
    return;
  }
  if (
    (expectedRevision === null && current) ||
    (expectedRevision !== null && current?.revision !== expectedRevision)
  ) {
    throw new FileSyncOperationError(
      "conflict",
      "Persisted cache revision conflict",
    );
  }
}

function validateEntry(entry: FileSyncEntry): FileSyncEntry {
  const validated = validateFileSyncEntry(entry);
  if (validated.sizeBytes > FILE_SYNC_LIMITS.maxTransferBytes) {
    throw new FileSyncOperationError(
      "limit-exceeded",
      "Invalid file-sync entry size",
    );
  }
  return validated;
}

function assertPersistedRecord(
  record: PersistedFileSyncRecord,
  workspaceId: string,
): PersistedFileSyncRecord {
  if (record.workspaceId !== workspaceId) {
    throw new Error("Persisted cache workspace mismatch");
  }
  if (
    (record.kind === "file" && !record.binaryKey) ||
    (record.kind === "directory" && record.binaryKey !== null)
  ) {
    throw new Error("Persisted cache binary metadata mismatch");
  }
  return {
    ...record,
    ...validateEntry(record),
  };
}

function recordToEntry(record: PersistedFileSyncRecord): FileSyncEntry {
  return {
    key: record.key,
    kind: record.kind,
    entryType: record.entryType,
    sizeBytes: record.sizeBytes,
    hashes: record.hashes.map((hash) => ({ ...hash })),
    revision: record.revision,
    modifiedAtMs: record.modifiedAtMs,
  };
}

function validateWorkspaceId(workspaceId: string): string {
  if (!workspaceId || workspaceId.length > 256) {
    throw new Error("Invalid persisted cache workspace id");
  }
  return workspaceId;
}

function validateGeneratedRevision(revision: string): string {
  if (
    !revision ||
    revision.length > 256 ||
    hasFileSyncControlCharacters(revision)
  ) {
    throw new Error("Invalid persisted cache revision");
  }
  return revision;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new FileSyncOperationError("timeout", "File-sync deadline exceeded");
  }
}
