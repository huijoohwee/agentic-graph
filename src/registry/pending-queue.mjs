import { registryPendingKey } from "./scope-keys.mjs";

export const MAX_RETRY_ATTEMPTS = 5;
export const MAX_RETRY_INTERVAL_MS = 30_000;
export const MIN_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MIN_RETAINED_CHANGES = 100;

export class PendingQueue {
  constructor(clientId) {
    this.key = registryPendingKey(clientId);
    this.entries = [];
    this.nextSeq = 1;
  }

  append(change, recordedAt = Date.now()) {
    const entry = { seq: this.nextSeq, change, recordedAt, attempts: 0, acknowledged: false };
    this.nextSeq += 1;
    this.entries.push(entry);
    return { ...entry };
  }

  pendingEntries() {
    return this.entries.filter((entry) => !entry.acknowledged).map(cloneEntry);
  }

  submitHead(submit) {
    const entry = this.entries.find((candidate) => !candidate.acknowledged);
    if (!entry) {
      return { status: "empty" };
    }
    if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
      return { status: "unavailable", retained: this.pendingEntries() };
    }
    entry.attempts += 1;
    const result = submit(cloneEntry(entry));
    if (result?.acknowledged === true) {
      entry.acknowledged = true;
      this.entries = this.entries.filter((candidate) => !candidate.acknowledged);
      return { status: "acknowledged", entry: cloneEntry(entry) };
    }
    return { status: "retry", nextRetryMs: MAX_RETRY_INTERVAL_MS, entry: cloneEntry(entry) };
  }

  retentionPolicy() {
    return { minimumMilliseconds: MIN_RETENTION_MS, minimumChanges: MIN_RETAINED_CHANGES };
  }
}

export function createPendingQueue(clientId) {
  return new PendingQueue(clientId);
}

function cloneEntry(entry) {
  return { ...entry };
}
