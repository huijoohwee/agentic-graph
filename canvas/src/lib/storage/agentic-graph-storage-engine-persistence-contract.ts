export type AgenticGraphStorageEnginePersistenceState = {
  mode: 'indexeddb' | 'memory'
  status: 'active' | 'degraded'
  error: string | null
}

export type AgenticGraphStorageEngineOutboxKind = 'git-operation' | 'file-transfer'

export type AgenticGraphStorageEngineOutboxRecord = {
  id: string
  kind: AgenticGraphStorageEngineOutboxKind
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

export type AgenticGraphStorageEngineOutboxClaim = {
  record: AgenticGraphStorageEngineOutboxRecord
  claimToken: string
}

export type AgenticGraphStorageEngineRecordWrite = {
  namespace: string
  id: string
  value: Record<string, unknown>
}

export type AgenticGraphStorageEngineBinaryRecord = {
  namespace: string
  objectKey: string
  contentHash: string
  byteLength: number
  bytes: Uint8Array
}

export type AgenticGraphStorageEnginePersistence = {
  records: {
    put(namespace: string, id: string, value: Record<string, unknown>): Promise<void>
    putMany(entries: AgenticGraphStorageEngineRecordWrite[]): Promise<void>
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
    put(record: AgenticGraphStorageEngineBinaryRecord): Promise<void>
    get(namespace: string, objectKey: string): Promise<AgenticGraphStorageEngineBinaryRecord | null>
    findByContentHash(
      namespace: string,
      contentHash: string,
    ): Promise<AgenticGraphStorageEngineBinaryRecord | null>
    remove(namespace: string, objectKey: string): Promise<void>
  }
  outbox: {
    enqueue(
      record: AgenticGraphStorageEngineOutboxRecord,
      capacity?: number,
    ): Promise<AgenticGraphStorageEngineOutboxRecord | null>
    get(id: string): Promise<AgenticGraphStorageEngineOutboxRecord | null>
    list(
      kind: AgenticGraphStorageEngineOutboxKind,
      workspaceId: string,
    ): Promise<AgenticGraphStorageEngineOutboxRecord[]>
    update(record: AgenticGraphStorageEngineOutboxRecord): Promise<void>
    remove(id: string): Promise<void>
    count(kind: AgenticGraphStorageEngineOutboxKind, workspaceId: string): Promise<number>
    claimNext(args: {
      kind: AgenticGraphStorageEngineOutboxKind
      workspaceId: string
      partitionKey?: string
      claimOwner: string
      claimToken: string
      nowMs: number
      leaseMs: number
    }): Promise<AgenticGraphStorageEngineOutboxClaim | null>
    updateClaimed(args: {
      record: AgenticGraphStorageEngineOutboxRecord
      claimToken: string
      releaseClaim?: boolean
    }): Promise<boolean>
    acknowledgeClaimed(args: {
      id: string
      claimToken: string
      recordWrites?: AgenticGraphStorageEngineRecordWrite[]
    }): Promise<boolean>
  }
  persistence: {
    getState(): AgenticGraphStorageEnginePersistenceState
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
