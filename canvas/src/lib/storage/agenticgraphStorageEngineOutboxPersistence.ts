import Dexie, { type Table } from 'dexie'
import type {
  AgenticGraphStorageEngineOutboxClaim,
  AgenticGraphStorageEngineOutboxKind,
  AgenticGraphStorageEngineOutboxRecord,
  AgenticGraphStorageEnginePersistence,
  AgenticGraphStorageEnginePersistenceState,
  StoredEngineRecord,
} from './agenticgraphStorageEnginePersistenceContract'
import {
  assertStorageCredentialFree,
  assertStorageNamespaceAndId,
  assertStorageOutboxRecord,
  cloneStorageValue,
  normalizeStorageValue,
  storageRecordKey,
} from './agenticgraphStorageEnginePersistenceSupport'

type OutboxApi = AgenticGraphStorageEnginePersistence['outbox']

const sequenceNamespace = 'system:outbox-sequence'
const unavailable = (): Error => new Error('persistence-unavailable')

const compareQueueRecords = (
  left: AgenticGraphStorageEngineOutboxRecord,
  right: AgenticGraphStorageEngineOutboxRecord,
): number => Number(left.sequence || 0) - Number(right.sequence || 0)
  || left.createdAtMs - right.createdAtMs
  || left.id.localeCompare(right.id)

const withAssignedSequence = (
  record: AgenticGraphStorageEngineOutboxRecord,
  sequence: number,
): AgenticGraphStorageEngineOutboxRecord => {
  const nested = record.payload.record
  const payload = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? {
        ...record.payload,
        record: {
          ...nested,
          [record.kind === 'git-operation' ? 'enqueuedSequence' : 'sequence']: sequence,
        },
      }
    : record.payload
  return { ...record, sequence, payload }
}

const validateClaimArgs = (args: Parameters<OutboxApi['claimNext']>[0]) => {
  const workspaceId = normalizeStorageValue(args.workspaceId)
  const partitionKey = normalizeStorageValue(args.partitionKey)
  const claimOwner = normalizeStorageValue(args.claimOwner)
  const claimToken = normalizeStorageValue(args.claimToken)
  const nowMs = Math.max(0, Math.floor(Number(args.nowMs)))
  const leaseMs = Math.max(1, Math.floor(Number(args.leaseMs)))
  if (!workspaceId || !claimOwner || !claimToken || !Number.isSafeInteger(nowMs)
    || !Number.isSafeInteger(leaseMs)) {
    throw new Error('Storage engine outbox claim is invalid.')
  }
  return { ...args, workspaceId, partitionKey, claimOwner, claimToken, nowMs, leaseMs }
}

export const createAgenticGraphStorageEngineOutboxPersistence = (args: {
  database: Dexie
  outboxTable: Table<AgenticGraphStorageEngineOutboxRecord, string>
  recordsTable: Table<StoredEngineRecord, string>
  memoryOutbox: Map<string, AgenticGraphStorageEngineOutboxRecord>
  memoryRecords: Map<string, StoredEngineRecord>
  getState: () => AgenticGraphStorageEnginePersistenceState
  degrade: (error: unknown) => void
  withMemoryMutation: <Value>(operation: () => Promise<Value> | Value) => Promise<Value>
  readOrFallback: <Value>(
    indexedRead: () => Promise<Value>,
    memoryRead: () => Promise<Value> | Value,
  ) => Promise<Value>
}): OutboxApi => {
  const queryIndexed = async (
    kind: AgenticGraphStorageEngineOutboxKind,
    workspaceId: string,
  ): Promise<AgenticGraphStorageEngineOutboxRecord[]> => args.outboxTable
    .where('[kind+workspaceId+createdAtMs]')
    .between([kind, workspaceId, Dexie.minKey], [kind, workspaceId, Dexie.maxKey])
    .toArray()

  const queryMemory = (
    kind: AgenticGraphStorageEngineOutboxKind,
    workspaceId: string,
  ): AgenticGraphStorageEngineOutboxRecord[] => Array.from(args.memoryOutbox.values())
    .filter(record => record.kind === kind && record.workspaceId === workspaceId)

  const mutate = async <Value>(
    indexedMutation: () => Promise<Value>,
    memoryMutation: () => Promise<Value> | Value,
  ): Promise<Value> => {
    if (args.getState().mode === 'indexeddb') {
      try {
        return await indexedMutation()
      } catch (error) {
        args.degrade(error)
        throw unavailable()
      }
    }
    return args.withMemoryMutation(memoryMutation)
  }

  const nextSequenceIndexed = async (
    kind: AgenticGraphStorageEngineOutboxKind,
    workspaceId: string,
  ): Promise<number> => {
    const id = `${kind}\u0000${workspaceId}`
    const key = storageRecordKey(sequenceNamespace, id)
    const current = await args.recordsTable.get(key)
    const sequence = Math.max(0, Math.floor(Number(current?.value.sequence || 0))) + 1
    await args.recordsTable.put({
      key,
      namespace: sequenceNamespace,
      id,
      value: { sequence },
      updatedAtMs: Date.now(),
    })
    return sequence
  }

  const nextSequenceMemory = (
    kind: AgenticGraphStorageEngineOutboxKind,
    workspaceId: string,
  ): number => {
    const id = `${kind}\u0000${workspaceId}`
    const key = storageRecordKey(sequenceNamespace, id)
    const sequence = Math.max(
      0,
      Math.floor(Number(args.memoryRecords.get(key)?.value.sequence || 0)),
    ) + 1
    args.memoryRecords.set(key, {
      key,
      namespace: sequenceNamespace,
      id,
      value: { sequence },
      updatedAtMs: Date.now(),
    })
    return sequence
  }

  return {
    async enqueue(rawRecord, capacity = Number.POSITIVE_INFINITY) {
      const record = assertStorageOutboxRecord(rawRecord)
      const safeCapacity = Number.isFinite(capacity)
        ? Math.max(0, Math.floor(capacity))
        : Number.POSITIVE_INFINITY
      return mutate(
        () => args.database.transaction(
          'rw',
          args.outboxTable,
          args.recordsTable,
          async () => {
            const existing = await args.outboxTable.get(record.id)
            if (existing) return cloneStorageValue(existing)
            if (
              Number.isFinite(safeCapacity)
              && (await queryIndexed(record.kind, record.workspaceId)).length >= safeCapacity
            ) {
              return null
            }
            const stored = withAssignedSequence(
              record,
              await nextSequenceIndexed(record.kind, record.workspaceId),
            )
            await args.outboxTable.add(stored)
            return cloneStorageValue(stored)
          },
        ),
        () => {
          const existing = args.memoryOutbox.get(record.id)
          if (existing) return cloneStorageValue(existing)
          if (
            Number.isFinite(safeCapacity)
            && queryMemory(record.kind, record.workspaceId).length >= safeCapacity
          ) return null
          const stored = withAssignedSequence(
            record,
            nextSequenceMemory(record.kind, record.workspaceId),
          )
          args.memoryOutbox.set(stored.id, stored)
          return cloneStorageValue(stored)
        },
      )
    },
    async get(idValue) {
      const id = normalizeStorageValue(idValue)
      if (!id) return null
      return args.readOrFallback(
        async () => cloneStorageValue(await args.outboxTable.get(id) ?? null),
        () => cloneStorageValue(args.memoryOutbox.get(id) ?? null),
      )
    },
    async list(kind, workspaceIdValue) {
      const workspaceId = normalizeStorageValue(workspaceIdValue)
      if (!workspaceId) throw new Error('Storage engine outbox workspaceId is required.')
      return args.readOrFallback(
        async () => (await queryIndexed(kind, workspaceId)).sort(compareQueueRecords).map(cloneStorageValue),
        () => queryMemory(kind, workspaceId).sort(compareQueueRecords).map(cloneStorageValue),
      )
    },
    async update(rawRecord) {
      const record = assertStorageOutboxRecord(rawRecord)
      await mutate(
        () => args.outboxTable.put(record).then(() => undefined),
        () => { args.memoryOutbox.set(record.id, record) },
      )
    },
    async remove(idValue) {
      const id = normalizeStorageValue(idValue)
      if (!id) return
      await mutate(
        () => args.outboxTable.delete(id),
        () => { args.memoryOutbox.delete(id) },
      )
    },
    async count(kind, workspaceIdValue) {
      const workspaceId = normalizeStorageValue(workspaceIdValue)
      if (!workspaceId) throw new Error('Storage engine outbox workspaceId is required.')
      return args.readOrFallback(
        async () => (await queryIndexed(kind, workspaceId)).length,
        () => queryMemory(kind, workspaceId).length,
      )
    },
    async claimNext(rawClaimArgs) {
      const claimArgs = validateClaimArgs(rawClaimArgs)
      const select = (
        records: AgenticGraphStorageEngineOutboxRecord[],
      ): AgenticGraphStorageEngineOutboxRecord | null => records
        .filter(record =>
          normalizeStorageValue(record.partitionKey) === claimArgs.partitionKey
          && record.lastErrorCode === null)
        .sort(compareQueueRecords)[0] ?? null
      const claim = (record: AgenticGraphStorageEngineOutboxRecord): AgenticGraphStorageEngineOutboxClaim | null => {
        if (record.claimToken && Number(record.claimExpiresAtMs || 0) > claimArgs.nowMs) return null
        const claimed = assertStorageOutboxRecord({
          ...record,
          claimToken: claimArgs.claimToken,
          claimOwner: claimArgs.claimOwner,
          claimExpiresAtMs: claimArgs.nowMs + claimArgs.leaseMs,
          updatedAtMs: claimArgs.nowMs,
        })
        return { record: claimed, claimToken: claimArgs.claimToken }
      }
      return mutate(
        () => args.database.transaction('rw', args.outboxTable, async () => {
          const selected = select(await queryIndexed(claimArgs.kind, claimArgs.workspaceId))
          if (!selected) return null
          const claimed = claim(selected)
          if (!claimed) return null
          await args.outboxTable.put(claimed.record)
          return cloneStorageValue(claimed)
        }),
        () => {
          const selected = select(queryMemory(claimArgs.kind, claimArgs.workspaceId))
          if (!selected) return null
          const claimed = claim(selected)
          if (!claimed) return null
          args.memoryOutbox.set(claimed.record.id, claimed.record)
          return cloneStorageValue(claimed)
        },
      )
    },
    async updateClaimed({ record: rawRecord, claimToken: tokenValue, releaseClaim = false }) {
      const record = assertStorageOutboxRecord(rawRecord)
      const claimToken = normalizeStorageValue(tokenValue)
      if (!claimToken) throw new Error('Storage engine outbox claim token is required.')
      const updated = releaseClaim
        ? { ...record, claimToken: null, claimOwner: null, claimExpiresAtMs: null }
        : record
      return mutate(
        () => args.database.transaction('rw', args.outboxTable, async () => {
          const current = await args.outboxTable.get(record.id)
          if (!current || current.claimToken !== claimToken) return false
          await args.outboxTable.put(updated)
          return true
        }),
        () => {
          const current = args.memoryOutbox.get(record.id)
          if (!current || current.claimToken !== claimToken) return false
          args.memoryOutbox.set(record.id, updated)
          return true
        },
      )
    },
    async acknowledgeClaimed({ id: idValue, claimToken: tokenValue, recordWrites = [] }) {
      const id = normalizeStorageValue(idValue)
      const claimToken = normalizeStorageValue(tokenValue)
      if (!id || !claimToken) throw new Error('Storage engine outbox acknowledgement is invalid.')
      const writes = recordWrites.map(entry => {
        const [namespace, recordId] = assertStorageNamespaceAndId(entry.namespace, entry.id)
        assertStorageCredentialFree(entry.value)
        return {
          key: storageRecordKey(namespace, recordId),
          namespace,
          id: recordId,
          value: cloneStorageValue(entry.value),
          updatedAtMs: Date.now(),
        } satisfies StoredEngineRecord
      })
      return mutate(
        () => args.database.transaction(
          'rw',
          args.outboxTable,
          args.recordsTable,
          async () => {
            const current = await args.outboxTable.get(id)
            if (!current || current.claimToken !== claimToken) return false
            if (writes.length > 0) await args.recordsTable.bulkPut(writes)
            await args.outboxTable.delete(id)
            return true
          },
        ),
        () => {
          const current = args.memoryOutbox.get(id)
          if (!current || current.claimToken !== claimToken) return false
          writes.forEach(write => args.memoryRecords.set(write.key, write))
          args.memoryOutbox.delete(id)
          return true
        },
      )
    },
  }
}
