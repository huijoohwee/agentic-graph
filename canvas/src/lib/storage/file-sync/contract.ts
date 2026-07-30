export const FILE_SYNC_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  maxTransferBytes: 10 * 1024 * 1024,
  outboxCapacity: 10_000,
  maxAttempts: 3,
  retryDelaysMs: [1_000, 2_000] as const,
  defaultPageSize: 200,
  maxListPages: 10_000,
});

export type FileSyncEntryKind = "file" | "directory";

export type FileSyncEntryType =
  | "standard"
  | "google-native"
  | "shortcut"
  | "graph-remote";

export interface FileSyncHash {
  algorithm: string;
  value: string;
}

export interface FileSyncEntry {
  key: string;
  kind: FileSyncEntryKind;
  entryType: FileSyncEntryType;
  sizeBytes: number;
  hashes: FileSyncHash[];
  revision: string | null;
  modifiedAtMs: number | null;
}

export interface FileSyncListPage {
  entries: FileSyncEntry[];
  nextCursor: string | null;
  snapshotVersion: string;
  complete: boolean;
}

export type FileSyncProviderTarget =
  | "local-cache"
  | "external-file-storage"
  | "cloudflare-resource"
  | "production-mirror";

export interface FileSyncProvider {
  readonly providerId: string;
  readonly target: FileSyncProviderTarget;
  list(
    prefix: string,
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<FileSyncListPage>;
  stat(key: string, signal: AbortSignal): Promise<FileSyncEntry | null>;
  read(
    key: string,
    signal: AbortSignal,
  ): Promise<{ entry: FileSyncEntry; bytes: Uint8Array }>;
  write(
    request: {
      entry: FileSyncEntry;
      bytes: Uint8Array | null;
      expectedRevision?: string | null;
      trustedSourceHashes?: readonly FileSyncHash[];
    },
    signal: AbortSignal,
  ): Promise<FileSyncEntry>;
  delete(
    key: string,
    signal: AbortSignal,
    expectedRevision?: string | null,
  ): Promise<void>;
  /** Releases resources retained across one completed outer operation. */
  releaseOperation?(signal: AbortSignal): void;
}

export type FileSyncDirection = "pull" | "push";
export type FileSyncRuntime = "local" | "dev" | "production";

export type FileSyncTransferStatus =
  | "transferred"
  | "already-synced"
  | "queued"
  | "conflict"
  | "unsupported"
  | "error";

export type FileSyncFailureReason =
  | "failed"
  | "timeout"
  | "limit-exceeded"
  | "conflict"
  | "unsupported-entry"
  | "incomplete-list"
  | "queue-capacity"
  | "runtime-forbidden";

export interface FileSyncTransferResult {
  fileKey: string;
  status: FileSyncTransferStatus;
  bytesTransferred: number;
  reason?: FileSyncFailureReason;
  message?: string;
  matchedHash?: FileSyncHash;
}

export interface FileSyncBatchResult {
  providerId: string;
  direction: FileSyncDirection;
  outcomes: FileSyncTransferResult[];
  deletionFenced: boolean;
  snapshotVersion: string | null;
}

export interface FileSyncLedgerSide {
  kind: FileSyncEntryKind;
  sizeBytes: number;
  hashes: FileSyncHash[];
  revision: string | null;
}

export interface FileSyncLedgerRecord {
  workspaceId: string;
  providerId: string;
  fileKey: string;
  local: FileSyncLedgerSide | null;
  remote: FileSyncLedgerSide | null;
  status: FileSyncTransferStatus;
  updatedAtMs: number;
  message?: string;
}

export interface FileSyncLedgerStore {
  get(
    workspaceId: string,
    providerId: string,
    fileKey: string,
    signal: AbortSignal,
  ): Promise<FileSyncLedgerRecord | null>;
  put(record: FileSyncLedgerRecord, signal: AbortSignal): Promise<void>;
}

export type FileSyncOutboxState = "queued" | "retrying" | "failed";

export interface FileSyncOutboxIntent {
  workspaceId: string;
  providerId: string;
  direction: FileSyncDirection;
  fileKey: string;
}

export interface FileSyncOutboxRecord extends FileSyncOutboxIntent {
  id: string;
  sequence: number;
  attempts: number;
  state: FileSyncOutboxState;
  createdAtMs: number;
  updatedAtMs: number;
  lastReason?: FileSyncFailureReason;
  lastMessage?: string;
}

export interface FileSyncOutboxClaim {
  record: FileSyncOutboxRecord;
  claimToken: string;
}

export interface FileSyncOutboxStore {
  enqueue(
    record: Omit<FileSyncOutboxRecord, "sequence">,
    capacity: number,
  ): Promise<FileSyncOutboxRecord | null>;
  list(): Promise<FileSyncOutboxRecord[]>;
  update(record: FileSyncOutboxRecord): Promise<void>;
  remove(id: string): Promise<void>;
  claimNext(args: {
    workspaceId: string;
    claimOwner: string;
    claimToken: string;
    nowMs: number;
    leaseMs: number;
  }): Promise<FileSyncOutboxClaim | null>;
  updateClaimed(
    record: FileSyncOutboxRecord,
    claimToken: string,
    releaseClaim?: boolean,
  ): Promise<boolean>;
  removeClaimed(id: string, claimToken: string): Promise<boolean>;
}

export interface PersistedFileSyncRecord extends FileSyncEntry {
  workspaceId: string;
  binaryKey: string | null;
}

export interface PersistedFileSyncCollection {
  listPage(request: {
    workspaceId: string;
    prefix: string;
    cursor: string | null;
    pageSize: number;
    signal?: AbortSignal;
  }): Promise<{
    records: PersistedFileSyncRecord[];
    nextCursor: string | null;
    snapshotVersion: string;
    complete: boolean;
  }>;
  get(
    workspaceId: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<PersistedFileSyncRecord | null>;
  /**
   * The binding must compare and commit atomically. `null` requires absence;
   * `undefined` is unconditional.
   */
  put(
    record: PersistedFileSyncRecord,
    expectedRevision: string | null | undefined,
    signal?: AbortSignal,
  ): Promise<void>;
  delete(
    workspaceId: string,
    key: string,
    expectedRevision: string | null | undefined,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface PersistedFileSyncBinaryStore {
  read(binaryKey: string, signal?: AbortSignal): Promise<Uint8Array | null>;
  write(
    binaryKey: string,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<void>;
  delete(binaryKey: string, signal?: AbortSignal): Promise<void>;
}

export interface FileSyncHashComputer {
  compute(bytes: Uint8Array, signal?: AbortSignal): Promise<FileSyncHash[]>;
}

const isFileSyncControlCharacter = (value: string): boolean => {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127;
};

export const hasFileSyncControlCharacters = (value: string): boolean =>
  Array.from(value).some(isFileSyncControlCharacter);

export const replaceFileSyncControlCharacters = (
  value: string,
  replacement = " ",
): string =>
  Array.from(value, (character) =>
    isFileSyncControlCharacter(character) ? replacement : character,
  ).join("");

export function normalizeFileSyncProviderId(value: string): string {
  const normalized = value.normalize("NFC");
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(normalized)) {
    throw new Error("Invalid file-sync provider id");
  }
  return normalized;
}

export function normalizeFileSyncKey(
  value: string,
  options: { allowRoot?: boolean } = {},
): string {
  const normalized = value.normalize("NFC");
  if (normalized === "" && options.allowRoot) {
    return normalized;
  }
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    normalized.includes("\\") ||
    hasFileSyncControlCharacters(normalized)
  ) {
    throw new Error("Invalid file-sync key");
  }
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error("Invalid file-sync key");
  }
  return normalized;
}

export function isUnsupportedFileSyncEntry(entry: FileSyncEntry): boolean {
  return entry.entryType !== "standard";
}

export function toFileSyncLedgerSide(
  entry: FileSyncEntry | null,
): FileSyncLedgerSide | null {
  if (!entry) {
    return null;
  }
  return {
    kind: entry.kind,
    sizeBytes: entry.sizeBytes,
    hashes: entry.hashes.map((hash) => ({ ...hash })),
    revision: entry.revision,
  };
}
