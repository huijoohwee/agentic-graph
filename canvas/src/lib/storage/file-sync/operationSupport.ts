import {
  hasFileSyncControlCharacters,
  normalizeFileSyncKey,
  type FileSyncEntry,
} from "./contract";
import { FileSyncOperationError } from "./errors";
import { normalizeFileSyncHashes } from "./hashes";

const FILE_SYNC_ENTRY_TYPES = new Set([
  "standard",
  "google-native",
  "shortcut",
  "graph-remote",
]);

export type FileSyncDeadlineFactory = (timeoutMs: number) => {
  signal: AbortSignal;
  dispose: () => void;
};

export function validateFileSyncEntry(entry: FileSyncEntry): FileSyncEntry {
  const key = normalizeFileSyncKey(entry.key);
  if (
    (entry.kind !== "file" && entry.kind !== "directory") ||
    !FILE_SYNC_ENTRY_TYPES.has(entry.entryType) ||
    !Number.isSafeInteger(entry.sizeBytes) ||
    entry.sizeBytes < 0 ||
    (entry.kind === "directory" && entry.sizeBytes !== 0) ||
    (entry.revision !== null &&
      (typeof entry.revision !== "string" ||
        entry.revision.length === 0 ||
        entry.revision.length > 256 ||
        hasFileSyncControlCharacters(entry.revision))) ||
    (entry.modifiedAtMs !== null &&
      (!Number.isFinite(entry.modifiedAtMs) || entry.modifiedAtMs < 0))
  ) {
    throw new FileSyncOperationError(
      "limit-exceeded",
      "Invalid file-sync entry metadata",
    );
  }
  const hashes = normalizeFileSyncHashes(entry.hashes);
  if (
    (entry.kind === "directory" && hashes.length !== 0) ||
    (entry.kind === "file" &&
      entry.entryType === "standard" &&
      hashes.length === 0)
  ) {
    throw new FileSyncOperationError(
      "failed",
      "Invalid file-sync entry hashes",
    );
  }
  return {
    ...entry,
    key,
    hashes,
  };
}

export function compareFileSyncDeletionOrder(
  left: FileSyncEntry,
  right: FileSyncEntry,
): number {
  return (
    right.key.split("/").length - left.key.split("/").length ||
    Number(left.kind === "directory") - Number(right.kind === "directory") ||
    left.key.localeCompare(right.key)
  );
}

export function raceWithFileSyncSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      new FileSyncOperationError("timeout", "File-sync deadline exceeded"),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(
        new FileSyncOperationError("timeout", "File-sync deadline exceeded"),
      );
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
