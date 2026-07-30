import {
  FILE_SYNC_LIMITS,
  isUnsupportedFileSyncEntry,
  normalizeFileSyncKey,
  type FileSyncBatchResult,
  type FileSyncDirection,
  type FileSyncEntry,
  type FileSyncLedgerStore,
  type FileSyncListPage,
  type FileSyncProvider,
  type FileSyncRuntime,
  type FileSyncTransferResult,
} from "./contract";
import {
  createFileSyncDeadline,
  FileSyncOperationError,
  getFileSyncFailureReason,
  sanitizeFileSyncError,
} from "./errors";
import {
  compareFileSyncDeletionOrder,
  raceWithFileSyncSignal,
  validateFileSyncEntry,
  type FileSyncDeadlineFactory,
} from "./operationSupport";
import { FileSyncOutbox } from "./outbox";
import { FileSyncProviderRegistry } from "./providerRegistry";
import { FileSyncTransferExecutor } from "./transferExecutor";

export interface FileSyncEngineOptions {
  workspaceId: string;
  cacheProvider: FileSyncProvider;
  providers: FileSyncProviderRegistry;
  ledger: FileSyncLedgerStore;
  outbox: FileSyncOutbox;
  runtime: () => FileSyncRuntime;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  createDeadline?: FileSyncDeadlineFactory;
}

export interface FileSyncBatchOptions {
  prefix?: string;
  deleteExtraneous?: boolean;
  mode?: "online" | "offline";
  plannedEntries?: FileSyncEntry[];
}

interface FileSyncListing {
  entries: FileSyncEntry[];
  complete: boolean;
  snapshotVersion: string | null;
  message?: string;
}

export class FileSyncEngine {
  private readonly workspaceId: string;
  private readonly cacheProvider: FileSyncProvider;
  private readonly providers: FileSyncProviderRegistry;
  private readonly ledger: FileSyncLedgerStore;
  private readonly outbox: FileSyncOutbox;
  private readonly runtime: () => FileSyncRuntime;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly createDeadline: FileSyncDeadlineFactory;
  private readonly transfers: FileSyncTransferExecutor;

  constructor(options: FileSyncEngineOptions) {
    if (!options.workspaceId || options.workspaceId.length > 256) {
      throw new Error("Invalid file-sync workspace id");
    }
    if (options.cacheProvider.target !== "local-cache") {
      throw new Error("File-sync cache provider must target local cache");
    }
    const now = options.now ?? Date.now;
    this.workspaceId = options.workspaceId;
    this.cacheProvider = options.cacheProvider;
    this.providers = options.providers;
    this.ledger = options.ledger;
    this.outbox = options.outbox;
    this.runtime = options.runtime;
    this.sleep =
      options.sleep ??
      ((delayMs) =>
        new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs)));
    this.createDeadline = options.createDeadline ?? createFileSyncDeadline;
    this.transfers = new FileSyncTransferExecutor({
      workspaceId: this.workspaceId,
      cacheProvider: this.cacheProvider,
      ledger: this.ledger,
      now,
      createDeadline: this.createDeadline,
    });
  }

  pull(
    providerId: string,
    options: FileSyncBatchOptions = {},
  ): Promise<FileSyncBatchResult> {
    return this.sync("pull", providerId, options);
  }

  push(
    providerId: string,
    options: FileSyncBatchOptions = {},
  ): Promise<FileSyncBatchResult> {
    return this.sync("push", providerId, options);
  }

  async queueTransfer(
    providerId: string,
    direction: FileSyncDirection,
    fileKey: string,
  ): Promise<FileSyncTransferResult> {
    let remote: FileSyncProvider;
    try {
      remote = this.providers.require(providerId);
      this.assertRuntimeAllowed(remote);
    } catch (error) {
      return toErrorResult(fileKey, error);
    }
    let result: Awaited<ReturnType<FileSyncOutbox["enqueue"]>>;
    try {
      result = await this.outbox.enqueue({
        workspaceId: this.workspaceId,
        providerId: remote.providerId,
        direction,
        fileKey,
      });
    } catch (error) {
      return toErrorResult(fileKey, error);
    }
    if (result.status === "capacity") {
      return {
        fileKey,
        status: "error",
        bytesTransferred: 0,
        reason: "queue-capacity",
        message: "File-sync outbox is at capacity",
      };
    }
    return { fileKey, status: "queued", bytesTransferred: 0 };
  }

  async drainOutbox(): Promise<FileSyncTransferResult[]> {
    await this.outbox.requeueFailed();
    const outcomes: FileSyncTransferResult[] = [];
    for (;;) {
      const claim = await this.outbox.claimNext(this.workspaceId);
      if (!claim) break;
      const record = claim.record;
      let finalResult: FileSyncTransferResult | null = null;
      let attempts = record.attempts;
      if (attempts >= FILE_SYNC_LIMITS.maxAttempts) {
        finalResult = {
          fileKey: record.fileKey,
          status: "error",
          bytesTransferred: 0,
          reason: record.lastReason ?? "failed",
          message: record.lastMessage ?? "File-sync retry budget exhausted",
        };
        await this.outbox.updateClaimed(claim, {
          attempts,
          state: "failed",
          lastReason: finalResult.reason,
          lastMessage: finalResult.message,
        }, true);
        outcomes.push(finalResult);
        continue;
      }
      while (attempts < FILE_SYNC_LIMITS.maxAttempts) {
        attempts += 1;
        if (!await this.outbox.updateClaimed(claim, {
          attempts,
          state: "retrying",
        })) throw new Error("File-sync outbox claim was lost");
        const remote = this.providers.get(record.providerId);
        if (!remote) {
          finalResult = toErrorResult(
            record.fileKey,
            new Error("Unknown file-sync provider"),
          );
        } else {
          try {
            this.assertRuntimeAllowed(remote);
            finalResult = await this.transfers.transfer(
              record.direction,
              remote,
              record.fileKey,
            );
          } catch (error) {
            finalResult = toErrorResult(record.fileKey, error);
          }
        }
        if (
          finalResult.status === "transferred" ||
          finalResult.status === "already-synced"
        ) {
          if (!await this.outbox.removeClaimed(claim)) {
            throw new Error("File-sync outbox acknowledgement was rejected");
          }
          break;
        }
        if (
          !isRetryable(finalResult) ||
          attempts >= FILE_SYNC_LIMITS.maxAttempts
        ) {
          if (!await this.outbox.updateClaimed(claim, {
            attempts,
            state: "failed",
            lastReason: finalResult.reason,
            lastMessage: finalResult.message,
          }, true)) throw new Error("File-sync outbox claim was lost");
          break;
        }
        if (!await this.outbox.updateClaimed(claim, {
          attempts,
          state: "retrying",
          lastReason: finalResult.reason,
          lastMessage: finalResult.message,
        })) throw new Error("File-sync outbox claim was lost");
        await this.sleep(FILE_SYNC_LIMITS.retryDelaysMs[attempts - 1]);
      }
      if (finalResult) {
        outcomes.push(finalResult);
      }
    }
    return outcomes;
  }

  private async sync(
    direction: FileSyncDirection,
    providerId: string,
    options: FileSyncBatchOptions,
  ): Promise<FileSyncBatchResult> {
    let remote: FileSyncProvider;
    let prefix: string;
    try {
      remote = this.providers.require(providerId);
      this.assertRuntimeAllowed(remote);
      prefix = normalizeFileSyncKey(options.prefix ?? "", { allowRoot: true });
    } catch (error) {
      return {
        providerId,
        direction,
        outcomes: [toErrorResult(options.prefix ?? "<policy>", error)],
        deletionFenced: Boolean(options.deleteExtraneous),
        snapshotVersion: null,
      };
    }
    if (options.mode === "offline") {
      return this.queueOffline(direction, remote, prefix, options);
    }
    const source = direction === "pull" ? remote : this.cacheProvider;
    const destination = direction === "pull" ? this.cacheProvider : remote;
    const sourceListing = await this.collectListing(source, prefix);
    const outcomes = listingErrorOutcome(prefix, sourceListing);
    for (const entry of sourceListing.entries) {
      outcomes.push(
        await this.transfers.transfer(direction, remote, entry.key),
      );
    }

    let deletionFenced =
      Boolean(options.deleteExtraneous) && !sourceListing.complete;
    if (options.deleteExtraneous && sourceListing.complete) {
      const destinationListing = await this.collectListing(destination, prefix);
      if (!destinationListing.complete) {
        deletionFenced = true;
        outcomes.push(
          ...listingErrorOutcome(prefix, {
            ...destinationListing,
            message:
              destinationListing.message ??
              "Destination listing is incomplete; deletion is fenced",
          }),
        );
      } else {
        const sourceKeys = new Set(
          sourceListing.entries.map((entry) => entry.key),
        );
        const extras = destinationListing.entries
          .filter((entry) => !sourceKeys.has(entry.key))
          .sort(compareFileSyncDeletionOrder);
        for (const extra of extras) {
          outcomes.push(
            await this.transfers.deleteDestination(direction, remote, extra),
          );
        }
      }
    }
    return {
      providerId: remote.providerId,
      direction,
      outcomes,
      deletionFenced,
      snapshotVersion: sourceListing.snapshotVersion,
    };
  }

  private async queueOffline(
    direction: FileSyncDirection,
    remote: FileSyncProvider,
    prefix: string,
    options: FileSyncBatchOptions,
  ): Promise<FileSyncBatchResult> {
    let entries = options.plannedEntries ?? null;
    let snapshotVersion: string | null = null;
    let deletionFenced = Boolean(options.deleteExtraneous);
    const outcomes: FileSyncTransferResult[] = [];
    if (!entries && direction === "push") {
      const listing = await this.collectListing(this.cacheProvider, prefix);
      entries = listing.entries;
      snapshotVersion = listing.snapshotVersion;
      deletionFenced ||= !listing.complete;
      outcomes.push(...listingErrorOutcome(prefix, listing));
    }
    if (!entries) {
      return {
        providerId: remote.providerId,
        direction,
        outcomes: [
          {
            fileKey: prefix || "<offline>",
            status: "error",
            bytesTransferred: 0,
            reason: "failed",
            message: "Offline pull requires a previously persisted manifest",
          },
        ],
        deletionFenced,
        snapshotVersion,
      };
    }
    for (const rawEntry of entries) {
      let entry: FileSyncEntry;
      try {
        entry = validateFileSyncEntry(rawEntry);
      } catch (error) {
        outcomes.push(toErrorResult(rawEntry.key || "<entry>", error));
        continue;
      }
      if (isUnsupportedFileSyncEntry(entry)) {
        outcomes.push({
          fileKey: entry.key,
          status: "unsupported",
          bytesTransferred: 0,
          reason: "unsupported-entry",
        });
      } else {
        outcomes.push(
          await this.queueTransfer(remote.providerId, direction, entry.key),
        );
      }
    }
    return {
      providerId: remote.providerId,
      direction,
      outcomes,
      deletionFenced,
      snapshotVersion,
    };
  }

  private async collectListing(
    provider: FileSyncProvider,
    prefix: string,
  ): Promise<FileSyncListing> {
    const deadline = this.createDeadline(FILE_SYNC_LIMITS.timeoutMs);
    const entries = new Map<string, FileSyncEntry>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let snapshotVersion: string | null = null;
    try {
      for (
        let pageIndex = 0;
        pageIndex < FILE_SYNC_LIMITS.maxListPages;
        pageIndex += 1
      ) {
        const page: FileSyncListPage = await raceWithFileSyncSignal(
          provider.list(prefix, cursor, deadline.signal),
          deadline.signal,
        );
        if (
          !page.snapshotVersion ||
          page.snapshotVersion.length > 256 ||
          (snapshotVersion && page.snapshotVersion !== snapshotVersion)
        ) {
          throw new Error("File-sync listing version changed");
        }
        snapshotVersion = page.snapshotVersion;
        for (const rawEntry of page.entries) {
          const entry = validateFileSyncEntry(rawEntry);
          if (
            (prefix &&
              entry.key !== prefix &&
              !entry.key.startsWith(`${prefix}/`)) ||
            entries.has(entry.key)
          ) {
            entries.delete(entry.key);
            throw new Error("File-sync listing contains ambiguous keys");
          }
          entries.set(entry.key, entry);
        }
        if (page.complete && page.nextCursor === null) {
          return {
            entries: [...entries.values()],
            complete: true,
            snapshotVersion,
          };
        }
        if (page.complete || page.nextCursor === null) {
          return {
            entries: [...entries.values()],
            complete: false,
            snapshotVersion,
            message: "File-sync listing ended without a complete snapshot",
          };
        }
        if (seenCursors.has(page.nextCursor)) {
          throw new Error("File-sync listing cursor repeated");
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new Error("File-sync listing page bound exceeded");
    } catch (error) {
      return {
        entries: [...entries.values()],
        complete: false,
        snapshotVersion,
        message: sanitizeFileSyncError(error),
      };
    } finally {
      provider.releaseOperation?.(deadline.signal);
      deadline.dispose();
    }
  }

  private assertRuntimeAllowed(remote: FileSyncProvider): void {
    if (
      this.runtime() === "production" ||
      remote.target !== "external-file-storage"
    ) {
      throw new FileSyncOperationError(
        "runtime-forbidden",
        "File sync is limited to local or Dev external storage",
      );
    }
  }
}

function listingErrorOutcome(
  prefix: string,
  listing: FileSyncListing,
): FileSyncTransferResult[] {
  return listing.message
    ? [
        {
          fileKey: prefix || "<list>",
          status: "error",
          bytesTransferred: 0,
          reason: "incomplete-list",
          message: listing.message,
        },
      ]
    : [];
}

function isRetryable(result: FileSyncTransferResult): boolean {
  return (
    result.status === "error" &&
    (result.reason === "failed" || result.reason === "timeout")
  );
}

function toErrorResult(
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
