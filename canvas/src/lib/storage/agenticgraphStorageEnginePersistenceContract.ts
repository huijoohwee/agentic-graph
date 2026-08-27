export type KnowgrphStorageEnginePersistenceState = {
  mode: 'indexeddb' | 'memory'
  status: 'active' | 'degraded'
  error: string | null
}

export type KnowgrphStorageEngineOutboxKind = 'git-operation' | 'file-transfer'

export type KnowgrphStorageEngineOutboxRecord = {
  id: string
  kind: KnowgrphStorageEngineOutboxKind
  workspaceId: string
  partitionKey?: string
  sequence?: number
  claimToken?: string | null
  claimOwner?: string | null
  claimExpiresAtMs?: number | null
  payload: Record<string, unknown>
  attemptCount: number
  lastErrorCode: string | null
  createdAtMs: number
  updatedAtMs: number
}

export type KnowgrphStorageEngineOutboxClaim = {
  record: KnowgrphStorageEngineOutboxRecord
  claimToken: string
}

export type KnowgrphStorageEngineRecordWrite = {
  namespace: string
  id: string
  value: Record<string, unknown>
}

export type KnowgrphStorageEngineBinaryRecord = {
  namespace: string
  objectKey: string
  contentHash: string
  byteLength: number
  bytes: Uint8Array
}

export type KnowgrphStorageEnginePersistence = {
  records: {
    put(namespace: string, id: string, value: Record<string, unknown>): Promise<void>
    putMany(entries: KnowgrphStorageEngineRecordWrite[]): Promise<void>
    compareAndPut(
      namespace: string,
      id: string,
      value: Record<string, unknown>,
      expectedRevision: string | null | undefined,
    ): Promise<boolean>
    get(namespace: string, id: string): Promise<Record<string, unknown> | null>
    list(namespace: string, idPrefix?: string): Promise<Array<Record<string, unknown>>>
    remove(namespace: string, id: string): Promise<void>
    compareAndRemove(
      namespace: string,
      id: string,
      expectedRevision: string | null | undefined,
    ): Promise<boolean>
  }
  binary: {
    put(record: KnowgrphStorageEngineBinaryRecord): Promise<void>
    get(namespace: string, objectKey: string): Promise<KnowgrphStorageEngineBinaryRecord | null>
    findByContentHash(
      namespace: string,
      contentHash: string,
    ): Promise<KnowgrphStorageEngineBinaryRecord | null>
    remove(namespace: string, objectKey: string): Promise<void>
  }
  outbox: {
    enqueue(
      record: KnowgrphStorageEngineOutboxRecord,
      capacity?: number,
    ): Promise<KnowgrphStorageEngineOutboxRecord | null>
    get(id: string): Promise<KnowgrphStorageEngineOutboxRecord | null>
    list(
      kind: KnowgrphStorageEngineOutboxKind,
      workspaceId: string,
    ): Promise<KnowgrphStorageEngineOutboxRecord[]>
    update(record: KnowgrphStorageEngineOutboxRecord): Promise<void>
    remove(id: string): Promise<void>
    count(kind: KnowgrphStorageEngineOutboxKind, workspaceId: string): Promise<number>
    claimNext(args: {
      kind: KnowgrphStorageEngineOutboxKind
      workspaceId: string
      partitionKey?: string
      claimOwner: string
      claimToken: string
      nowMs: number
      leaseMs: number
    }): Promise<KnowgrphStorageEngineOutboxClaim | null>
    updateClaimed(args: {
      record: KnowgrphStorageEngineOutboxRecord
      claimToken: string
      releaseClaim?: boolean
    }): Promise<boolean>
    acknowledgeClaimed(args: {
      id: string
      claimToken: string
      recordWrites?: KnowgrphStorageEngineRecordWrite[]
    }): Promise<boolean>
  }
  persistence: {
    getState(): KnowgrphStorageEnginePersistenceState
  }
  close(): Promise<void>
  remove(): Promise<void>
}

export type StoredEngineRecord = {
  key: string
  namespace: string
  id: string
  value: Record<string, unknown>
  updatedAtMs: number
}
