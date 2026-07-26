import {
  FILE_SYNC_LIMITS,
  normalizeFileSyncKey,
  normalizeFileSyncProviderId,
  type FileSyncFailureReason,
  type FileSyncOutboxClaim,
  type FileSyncOutboxIntent,
  type FileSyncOutboxRecord,
  type FileSyncOutboxState,
  type FileSyncOutboxStore,
} from "./contract";

export type FileSyncOutboxEnqueueResult =
  | { status: "queued"; record: FileSyncOutboxRecord }
  | { status: "capacity"; capacity: number };

const DEFAULT_CLAIM_LEASE_MS = 5 * 60_000;

export class FileSyncOutbox {
  private readonly capacity: number;
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly claimOwner: string;
  private readonly claimLeaseMs: number;

  constructor(
    private readonly store: FileSyncOutboxStore,
    options: {
      capacity?: number;
      createId?: () => string;
      now?: () => number;
      claimOwner?: string;
      claimLeaseMs?: number;
    } = {},
  ) {
    this.capacity = options.capacity ?? FILE_SYNC_LIMITS.outboxCapacity;
    this.createId = options.createId ?? defaultOutboxId;
    this.now = options.now ?? Date.now;
    this.claimOwner = options.claimOwner ?? `file-sync-engine:${defaultOutboxId()}`;
    this.claimLeaseMs = options.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1) {
      throw new Error("Invalid file-sync outbox capacity");
    }
    if (!Number.isSafeInteger(this.claimLeaseMs) || this.claimLeaseMs < 1) {
      throw new Error("Invalid file-sync outbox claim lease");
    }
  }

  async enqueue(intent: FileSyncOutboxIntent): Promise<FileSyncOutboxEnqueueResult> {
    const normalizedIntent = normalizeIntent(intent);
    const timestamp = this.now();
    const id = this.createId();
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
      throw new Error("Invalid file-sync outbox id");
    }
    const record = await this.store.enqueue({
      ...normalizedIntent,
      id,
      attempts: 0,
      state: "queued",
      createdAtMs: timestamp,
      updatedAtMs: timestamp,
    }, this.capacity);
    return record
      ? { status: "queued", record: cloneRecord(record) }
      : { status: "capacity", capacity: this.capacity };
  }

  async list(): Promise<FileSyncOutboxRecord[]> {
    return (await this.store.list())
      .map(cloneRecord)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async update(
    id: string,
    patch: FileSyncOutboxPatch,
  ): Promise<FileSyncOutboxRecord | null> {
    const record = (await this.store.list()).find(candidate => candidate.id === id);
    if (!record) return null;
    const updated = { ...record, ...patch, updatedAtMs: this.now() };
    await this.store.update(updated);
    return cloneRecord(updated);
  }

  async requeueFailed(): Promise<number> {
    const failed = (await this.store.list()).filter(record => record.state === "failed");
    for (const record of failed) {
      await this.store.update({
        ...record,
        attempts: 0,
        state: "queued",
        lastReason: undefined,
        lastMessage: undefined,
        updatedAtMs: this.now(),
      });
    }
    return failed.length;
  }

  remove(id: string): Promise<void> {
    return this.store.remove(id);
  }

  claimNext(workspaceId: string): Promise<FileSyncOutboxClaim | null> {
    return this.store.claimNext({
      workspaceId,
      claimOwner: this.claimOwner,
      claimToken: `claim:${defaultOutboxId()}`,
      nowMs: this.now(),
      leaseMs: this.claimLeaseMs,
    });
  }

  async updateClaimed(
    claim: FileSyncOutboxClaim,
    patch: FileSyncOutboxPatch,
    releaseClaim = false,
  ): Promise<FileSyncOutboxRecord | null> {
    const updated = { ...claim.record, ...patch, updatedAtMs: this.now() };
    if (!await this.store.updateClaimed(updated, claim.claimToken, releaseClaim)) return null;
    claim.record = cloneRecord(updated);
    return cloneRecord(updated);
  }

  removeClaimed(claim: FileSyncOutboxClaim): Promise<boolean> {
    return this.store.removeClaimed(claim.record.id, claim.claimToken);
  }
}

type FileSyncOutboxPatch = {
  attempts: number;
  state: FileSyncOutboxState;
  lastReason?: FileSyncFailureReason;
  lastMessage?: string;
};

type MemoryClaim = {
  token: string;
  owner: string;
  expiresAtMs: number;
};

export function createInMemoryFileSyncOutboxStore(): FileSyncOutboxStore {
  const records = new Map<string, FileSyncOutboxRecord>();
  const claims = new Map<string, MemoryClaim>();
  let tail = Promise.resolve();
  let sequence = 0;

  const mutate = async <Value>(operation: () => Value | Promise<Value>): Promise<Value> => {
    const previous = tail;
    let release = () => undefined;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  return {
    enqueue(record, capacity) {
      return mutate(() => {
        if (records.has(record.id)) return cloneRecord(records.get(record.id)!);
        if (records.size >= capacity) return null;
        const stored = { ...record, sequence: ++sequence };
        records.set(stored.id, cloneRecord(stored));
        return cloneRecord(stored);
      });
    },
    list: () => mutate(() => [...records.values()].map(cloneRecord)),
    update: record => mutate(() => { records.set(record.id, cloneRecord(record)); }),
    remove: id => mutate(() => { records.delete(id); claims.delete(id); }),
    claimNext(args) {
      return mutate(() => {
        const record = [...records.values()]
          .filter(candidate =>
            candidate.workspaceId === args.workspaceId
            && candidate.state !== "failed")
          .sort((left, right) => left.sequence - right.sequence)[0];
        if (!record) return null;
        const liveClaim = claims.get(record.id);
        if (liveClaim && liveClaim.expiresAtMs > args.nowMs) return null;
        claims.set(record.id, {
          token: args.claimToken,
          owner: args.claimOwner,
          expiresAtMs: args.nowMs + args.leaseMs,
        });
        return { record: cloneRecord(record), claimToken: args.claimToken };
      });
    },
    updateClaimed(record, claimToken, releaseClaim = false) {
      return mutate(() => {
        if (claims.get(record.id)?.token !== claimToken) return false;
        records.set(record.id, cloneRecord(record));
        if (releaseClaim) claims.delete(record.id);
        return true;
      });
    },
    removeClaimed(id, claimToken) {
      return mutate(() => {
        if (claims.get(id)?.token !== claimToken) return false;
        records.delete(id);
        claims.delete(id);
        return true;
      });
    },
  };
}

let fallbackIdSequence = 0;

function defaultOutboxId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackIdSequence += 1;
  return `file-sync-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
}

function normalizeIntent(intent: FileSyncOutboxIntent): FileSyncOutboxIntent {
  if (!intent.workspaceId || intent.workspaceId.length > 256) {
    throw new Error("Invalid file-sync workspace id");
  }
  return {
    workspaceId: intent.workspaceId,
    providerId: normalizeFileSyncProviderId(intent.providerId),
    direction: intent.direction,
    fileKey: normalizeFileSyncKey(intent.fileKey),
  };
}

function cloneRecord(record: FileSyncOutboxRecord): FileSyncOutboxRecord {
  return { ...record };
}
