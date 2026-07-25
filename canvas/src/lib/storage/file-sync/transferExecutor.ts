import {
  FILE_SYNC_LIMITS,
  isUnsupportedFileSyncEntry,
  normalizeFileSyncKey,
  toFileSyncLedgerSide,
  type FileSyncDirection,
  type FileSyncEntry,
  type FileSyncLedgerRecord,
  type FileSyncLedgerStore,
  type FileSyncProvider,
  type FileSyncTransferResult,
} from "./contract";
import {
  FileSyncOperationError,
  getFileSyncFailureReason,
  sanitizeFileSyncError,
} from "./errors";
import {
  compareFileSyncContent,
  hasFileSyncSideChanged,
} from "./hashes";
import {
  raceWithFileSyncSignal,
  validateFileSyncEntry,
  type FileSyncDeadlineFactory,
} from "./operationSupport";

export interface FileSyncTransferExecutorOptions {
  workspaceId: string;
  cacheProvider: FileSyncProvider;
  ledger: FileSyncLedgerStore;
  now: () => number;
  createDeadline: FileSyncDeadlineFactory;
}

export class FileSyncTransferExecutor {
  constructor(private readonly options: FileSyncTransferExecutorOptions) {}

  async transfer(
    direction: FileSyncDirection,
    remote: FileSyncProvider,
    fileKey: string,
  ): Promise<FileSyncTransferResult> {
    const key = normalizeFileSyncKey(fileKey);
    const deadline = this.options.createDeadline(FILE_SYNC_LIMITS.timeoutMs);
    const local = this.options.cacheProvider;
    const source = direction === "pull" ? remote : local;
    const destination = direction === "pull" ? local : remote;
    try {
      const [sourceEntry, destinationEntry, baseline] = await Promise.all([
        raceWithFileSyncSignal(
          source.stat(key, deadline.signal),
          deadline.signal,
        ),
        raceWithFileSyncSignal(
          destination.stat(key, deadline.signal),
          deadline.signal,
        ),
        raceWithFileSyncSignal(
          this.options.ledger.get(
            this.options.workspaceId,
            remote.providerId,
            key,
            deadline.signal,
          ),
          deadline.signal,
        ),
      ]);
      if (!sourceEntry) {
        throw new Error("File-sync source entry no longer exists");
      }
      const validatedSource = validateFileSyncEntry(sourceEntry);
      const validatedDestination = destinationEntry
        ? validateFileSyncEntry(destinationEntry)
        : null;
      const currentLocal =
        direction === "pull" ? validatedDestination : validatedSource;
      const currentRemote =
        direction === "pull" ? validatedSource : validatedDestination;
      if (
        isUnsupportedFileSyncEntry(validatedSource) ||
        (validatedDestination &&
          isUnsupportedFileSyncEntry(validatedDestination))
      ) {
        return this.recordTerminal(
          remote,
          key,
          currentLocal,
          currentRemote,
          deadline.signal,
          {
            fileKey: key,
            status: "unsupported",
            bytesTransferred: 0,
            reason: "unsupported-entry",
          },
        );
      }
      const contentComparison = compareFileSyncContent(
        validatedSource,
        validatedDestination,
      );
      if (contentComparison.status === "equal") {
        return this.recordTerminal(
          remote,
          key,
          currentLocal,
          currentRemote,
          deadline.signal,
          {
            fileKey: key,
            status: "already-synced",
            bytesTransferred: 0,
            matchedHash: contentComparison.hash,
          },
        );
      }
      if (
        baseline &&
        hasFileSyncSideChanged(currentLocal, baseline.local) &&
        hasFileSyncSideChanged(currentRemote, baseline.remote)
      ) {
        return this.recordTerminal(
          remote,
          key,
          currentLocal,
          currentRemote,
          deadline.signal,
          {
            fileKey: key,
            status: "conflict",
            bytesTransferred: 0,
            reason: "conflict",
          },
        );
      }
      const bytes = await this.readBoundedBody(
        source,
        validatedSource,
        deadline.signal,
      );
      const written = validateFileSyncEntry(
        await raceWithFileSyncSignal(
          destination.write(
            {
              entry: validatedSource,
              bytes,
              expectedRevision: validatedDestination?.revision ?? null,
              trustedSourceHashes: validatedSource.hashes,
            },
            deadline.signal,
          ),
          deadline.signal,
        ),
      );
      const writtenComparison = compareFileSyncContent(
        validatedSource,
        written,
      );
      if (writtenComparison.status === "different") {
        throw new Error("Destination did not persist the transferred content");
      }
      return this.recordTerminal(
        remote,
        key,
        direction === "pull" ? written : validatedSource,
        direction === "pull" ? validatedSource : written,
        deadline.signal,
        {
          fileKey: key,
          status: "transferred",
          bytesTransferred: bytes?.byteLength ?? 0,
          matchedHash:
            writtenComparison.status === "equal"
              ? writtenComparison.hash
              : undefined,
        },
      );
    } catch (error) {
      return toTransferError(
        key,
        deadline.signal.aborted
          ? new FileSyncOperationError(
              "timeout",
              "File-sync deadline exceeded",
            )
          : error,
      );
    } finally {
      releaseProviderOperations(deadline.signal, source, destination);
      deadline.dispose();
    }
  }

  async deleteDestination(
    direction: FileSyncDirection,
    remote: FileSyncProvider,
    destinationEntry: FileSyncEntry,
  ): Promise<FileSyncTransferResult> {
    const entry = validateFileSyncEntry(destinationEntry);
    if (isUnsupportedFileSyncEntry(entry)) {
      return {
        fileKey: entry.key,
        status: "unsupported",
        bytesTransferred: 0,
        reason: "unsupported-entry",
      };
    }
    const destination =
      direction === "pull" ? this.options.cacheProvider : remote;
    const deadline = this.options.createDeadline(FILE_SYNC_LIMITS.timeoutMs);
    try {
      const baseline = await raceWithFileSyncSignal(
        this.options.ledger.get(
          this.options.workspaceId,
          remote.providerId,
          entry.key,
          deadline.signal,
        ),
        deadline.signal,
      );
      const currentLocal = direction === "pull" ? entry : null;
      const currentRemote = direction === "pull" ? null : entry;
      if (
        baseline &&
        hasFileSyncSideChanged(currentLocal, baseline.local) &&
        hasFileSyncSideChanged(currentRemote, baseline.remote)
      ) {
        await this.putLedger(
          remote,
          entry.key,
          currentLocal,
          currentRemote,
          "conflict",
          deadline.signal,
        );
        return {
          fileKey: entry.key,
          status: "conflict",
          bytesTransferred: 0,
          reason: "conflict",
        };
      }
      await raceWithFileSyncSignal(
        destination.delete(entry.key, deadline.signal, entry.revision),
        deadline.signal,
      );
      await this.putLedger(
        remote,
        entry.key,
        null,
        null,
        "transferred",
        deadline.signal,
      );
      return {
        fileKey: entry.key,
        status: "transferred",
        bytesTransferred: 0,
      };
    } catch (error) {
      return toTransferError(
        entry.key,
        deadline.signal.aborted
          ? new FileSyncOperationError(
              "timeout",
              "File-sync deadline exceeded",
            )
          : error,
      );
    } finally {
      releaseProviderOperations(deadline.signal, destination);
      deadline.dispose();
    }
  }

  private async readBoundedBody(
    source: FileSyncProvider,
    sourceEntry: FileSyncEntry,
    signal: AbortSignal,
  ): Promise<Uint8Array | null> {
    if (sourceEntry.kind === "directory") {
      return null;
    }
    if (sourceEntry.sizeBytes > FILE_SYNC_LIMITS.maxTransferBytes) {
      throw new FileSyncOperationError(
        "limit-exceeded",
        "File exceeds the transfer size bound",
      );
    }
    const body = await raceWithFileSyncSignal(
      source.read(sourceEntry.key, signal),
      signal,
    );
    const bodyEntry = validateFileSyncEntry(body.entry);
    const bytes = new Uint8Array(body.bytes);
    if (
      bodyEntry.key !== sourceEntry.key ||
      bodyEntry.kind !== "file" ||
      bytes.byteLength !== bodyEntry.sizeBytes ||
      bytes.byteLength > FILE_SYNC_LIMITS.maxTransferBytes ||
      compareFileSyncContent(sourceEntry, bodyEntry).status !== "equal"
    ) {
      throw new FileSyncOperationError(
        "limit-exceeded",
        "File body changed or violates the cumulative transfer bound",
      );
    }
    return bytes;
  }

  private async recordTerminal(
    remote: FileSyncProvider,
    key: string,
    local: FileSyncEntry | null,
    remoteEntry: FileSyncEntry | null,
    signal: AbortSignal,
    result: FileSyncTransferResult,
  ): Promise<FileSyncTransferResult> {
    await this.putLedger(
      remote,
      key,
      local,
      remoteEntry,
      result.status,
      signal,
      result.message,
    );
    return result;
  }

  private putLedger(
    remote: FileSyncProvider,
    key: string,
    local: FileSyncEntry | null,
    remoteEntry: FileSyncEntry | null,
    status: FileSyncTransferResult["status"],
    signal: AbortSignal,
    message?: string,
  ): Promise<void> {
    const record: FileSyncLedgerRecord = {
      workspaceId: this.options.workspaceId,
      providerId: remote.providerId,
      fileKey: key,
      local: toFileSyncLedgerSide(local),
      remote: toFileSyncLedgerSide(remoteEntry),
      status,
      updatedAtMs: this.options.now(),
      message: message ? sanitizeFileSyncError(message) : undefined,
    };
    return raceWithFileSyncSignal(
      this.options.ledger.put(record, signal),
      signal,
    );
  }
}

function releaseProviderOperations(
  signal: AbortSignal,
  ...providers: FileSyncProvider[]
): void {
  const released = new Set<FileSyncProvider>();
  for (const provider of providers) {
    if (released.has(provider)) continue;
    released.add(provider);
    provider.releaseOperation?.(signal);
  }
}

function toTransferError(
  fileKey: string,
  error: unknown,
): FileSyncTransferResult {
  return {
    fileKey,
    status: "error",
    bytesTransferred: 0,
    reason: getFileSyncFailureReason(error),
    message: sanitizeFileSyncError(error),
  };
}
