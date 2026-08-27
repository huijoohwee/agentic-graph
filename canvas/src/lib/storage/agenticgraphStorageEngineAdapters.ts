import type {
  FileSyncHashComputer,
  FileSyncLedgerRecord,
  FileSyncLedgerStore,
  FileSyncOutboxRecord,
  FileSyncOutboxStore,
  PersistedFileSyncBinaryStore,
  PersistedFileSyncCollection,
  PersistedFileSyncRecord,
} from './file-sync'
import type {
  KnowgrphGitObjectRecord,
  KnowgrphGitOperationOutboxRecord,
  KnowgrphGitPersistedCache,
  KnowgrphGitRefRecord,
  KnowgrphGitRepositoryRecord,
} from './git'
import type {
  KnowgrphStorageEngineOutboxRecord,
  KnowgrphStorageEnginePersistence,
} from './knowgrphStorageEnginePersistence'

const FILE_SYNC_OUTBOX_CAPACITY = 10_000
const FILE_SYNC_BINARY_NAMESPACE = 'file-sync:binary'

const toJsonRecord = <Value extends object>(value: Value): Record<string, unknown> =>
  value as unknown as Record<string, unknown>

const fromJsonRecord = <Value>(value: Record<string, unknown> | null): Value | null =>
  value as unknown as Value | null

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new Error('Storage engine operation was aborted.')
}

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  )
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

const buildGitNamespace = (
  kind: 'repository' | 'object' | 'ref',
  workspaceId: string,
  repositoryId = '',
): string => ['git', kind, workspaceId, repositoryId].filter(Boolean).join(':')

const readGitOutboxRecord = (
  envelope: KnowgrphStorageEngineOutboxRecord | null,
): KnowgrphGitOperationOutboxRecord | null => {
  const record = envelope?.payload.record
  return record && typeof record === 'object' && !Array.isArray(record)
    ? record as unknown as KnowgrphGitOperationOutboxRecord
    : null
}

export const createKnowgrphGitPersistedCache = (
  persistence: KnowgrphStorageEnginePersistence,
): KnowgrphGitPersistedCache => ({
    async getRepository(workspaceId, repositoryId) {
      return fromJsonRecord<KnowgrphGitRepositoryRecord>(
        await persistence.records.get(buildGitNamespace('repository', workspaceId), repositoryId),
      )
    },
    async putRepository(record) {
      await persistence.records.put(
        buildGitNamespace('repository', record.workspaceId),
        record.repositoryId,
        toJsonRecord(record),
      )
    },
    async getObject(workspaceId, repositoryId, objectId) {
      return fromJsonRecord<KnowgrphGitObjectRecord>(
        await persistence.records.get(buildGitNamespace('object', workspaceId, repositoryId), objectId),
      )
    },
    async listObjects(workspaceId, repositoryId) {
      return await persistence.records.list(
        buildGitNamespace('object', workspaceId, repositoryId),
      ) as unknown as KnowgrphGitObjectRecord[]
    },
    async putObjects(records) {
      await persistence.records.putMany(records.map(record => ({
        namespace: buildGitNamespace('object', record.workspaceId, record.repositoryId),
        id: record.objectId,
        value: toJsonRecord(record),
      })))
    },
    async getRef(workspaceId, repositoryId, refName) {
      return fromJsonRecord<KnowgrphGitRefRecord>(
        await persistence.records.get(buildGitNamespace('ref', workspaceId, repositoryId), refName),
      )
    },
    async listRefs(workspaceId, repositoryId) {
      return await persistence.records.list(
        buildGitNamespace('ref', workspaceId, repositoryId),
      ) as unknown as KnowgrphGitRefRecord[]
    },
    async putRefs(records) {
      await persistence.records.putMany(records.map(record => ({
        namespace: buildGitNamespace('ref', record.workspaceId, record.repositoryId),
        id: record.refName,
        value: toJsonRecord(record),
      })))
    },
    async appendOutbox(record) {
        const stored = await persistence.outbox.enqueue({
          id: record.id,
          kind: 'git-operation',
          workspaceId: record.workspaceId,
          partitionKey: record.deviceId,
          payload: { record: toJsonRecord({ ...record, enqueuedSequence: 0 }) },
          attemptCount: record.attemptCount,
          lastErrorCode: record.lastStatus === 'queued' ? null : record.lastStatus,
          createdAtMs: record.createdAtMs,
          updatedAtMs: record.updatedAtMs,
        })
        const complete = readGitOutboxRecord(stored)
        if (!complete) throw new Error('Git operation outbox enqueue failed.')
        return complete
    },
    async listOutbox(workspaceId, deviceId) {
      return (await persistence.outbox.list('git-operation', workspaceId))
        .map(readGitOutboxRecord)
        .filter((record): record is KnowgrphGitOperationOutboxRecord =>
          Boolean(record) && record.deviceId === deviceId)
    },
    async requeueFailedOutbox(workspaceId, deviceId, updatedAtMs) {
      const envelopes = await persistence.outbox.list('git-operation', workspaceId)
      let requeued = 0
      for (const envelope of envelopes) {
        const current = readGitOutboxRecord(envelope)
        if (!current || current.deviceId !== deviceId || current.lastStatus === 'queued') continue
        const record = {
          ...current,
          attemptCount: 0,
          lastStatus: 'queued' as const,
          lastMessage: null,
          updatedAtMs,
        }
        await persistence.outbox.update({
          ...envelope,
          claimToken: null,
          claimOwner: null,
          claimExpiresAtMs: null,
          payload: { record: toJsonRecord(record) },
          attemptCount: 0,
          lastErrorCode: null,
          updatedAtMs,
        })
        requeued += 1
      }
      return requeued
    },
    async claimNextOutbox(args) {
      const claim = await persistence.outbox.claimNext({
        kind: 'git-operation',
        workspaceId: args.workspaceId,
        partitionKey: args.deviceId,
        claimOwner: args.claimOwner,
        claimToken: args.claimToken,
        nowMs: args.nowMs,
        leaseMs: args.leaseMs,
      })
      const record = claim ? readGitOutboxRecord(claim.record) : null
      return claim && record ? { record, claimToken: claim.claimToken } : null
    },
    async patchClaimedOutbox(id, claimToken, patch, releaseClaim) {
      const envelope = await persistence.outbox.get(id)
      const current = readGitOutboxRecord(envelope)
      if (!envelope || !current) return false
      const updated = { ...current, ...patch }
      return persistence.outbox.updateClaimed({
        record: {
          ...envelope,
          payload: { record: toJsonRecord(updated) },
          attemptCount: updated.attemptCount,
          lastErrorCode: updated.lastStatus === 'queued' ? null : updated.lastStatus,
          updatedAtMs: updated.updatedAtMs,
        },
        claimToken,
        releaseClaim,
      })
    },
    acknowledgeClaimedOutbox(id, claimToken, refWrites = []) {
      return persistence.outbox.acknowledgeClaimed({
        id,
        claimToken,
        recordWrites: refWrites.map(record => ({
          namespace: buildGitNamespace('ref', record.workspaceId, record.repositoryId),
          id: record.refName,
          value: toJsonRecord(record),
        })),
      })
    },
  })

const buildFileEntryNamespace = (workspaceId: string): string =>
  `file-sync:entry:${workspaceId}`

const readCursorOffset = (cursor: string | null): number => {
  if (cursor == null) return 0
  const offset = Number(cursor)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid file-sync cache cursor.')
  return offset
}

const buildListingVersion = async (records: PersistedFileSyncRecord[]): Promise<string> => {
  const signature = records
    .map(record => `${record.key}\0${record.revision ?? ''}\0${record.sizeBytes}`)
    .join('\n')
  return `sha256:${await sha256Hex(new TextEncoder().encode(signature))}`
}

export const createKnowgrphFileSyncCollection = (
  persistence: KnowgrphStorageEnginePersistence,
): PersistedFileSyncCollection => ({
  async listPage({ workspaceId, prefix, cursor, pageSize, signal }) {
    throwIfAborted(signal)
    const records = (await persistence.records.list(buildFileEntryNamespace(workspaceId)))
      .map(value => value as unknown as PersistedFileSyncRecord)
      .filter(record => !prefix || record.key === prefix || record.key.startsWith(`${prefix}/`))
      .sort((left, right) => left.key.localeCompare(right.key))
    const offset = readCursorOffset(cursor)
    const limit = Math.max(1, Math.min(1_000, Math.floor(pageSize)))
    const page = records.slice(offset, offset + limit)
    const nextOffset = offset + page.length
    throwIfAborted(signal)
    return {
      records: page,
      nextCursor: nextOffset < records.length ? String(nextOffset) : null,
      snapshotVersion: await buildListingVersion(records),
      complete: nextOffset >= records.length,
    }
  },
  async get(workspaceId, key, signal) {
    throwIfAborted(signal)
    return fromJsonRecord<PersistedFileSyncRecord>(
      await persistence.records.get(buildFileEntryNamespace(workspaceId), key),
    )
  },
  async put(record, expectedRevision, signal) {
    throwIfAborted(signal)
    const applied = await persistence.records.compareAndPut(
      buildFileEntryNamespace(record.workspaceId),
      record.key,
      toJsonRecord(record),
      expectedRevision,
    )
    if (!applied) throw new Error('Persisted file-sync revision changed.')
    throwIfAborted(signal)
  },
  async delete(workspaceId, key, expectedRevision, signal) {
    throwIfAborted(signal)
    const applied = await persistence.records.compareAndRemove(
      buildFileEntryNamespace(workspaceId),
      key,
      expectedRevision,
    )
    if (!applied) throw new Error('Persisted file-sync revision changed.')
  },
})

export const createKnowgrphFileSyncBinaryStore = (
  persistence: KnowgrphStorageEnginePersistence,
): PersistedFileSyncBinaryStore => ({
  async read(binaryKey, signal) {
    throwIfAborted(signal)
    const record = await persistence.binary.get(FILE_SYNC_BINARY_NAMESPACE, binaryKey)
    throwIfAborted(signal)
    return record ? new Uint8Array(record.bytes) : null
  },
  async write(binaryKey, bytes, signal) {
    throwIfAborted(signal)
    const safeBytes = new Uint8Array(bytes)
    await persistence.binary.put({
      namespace: FILE_SYNC_BINARY_NAMESPACE,
      objectKey: binaryKey,
      contentHash: `sha256:${await sha256Hex(safeBytes)}`,
      byteLength: safeBytes.byteLength,
      bytes: safeBytes,
    })
    throwIfAborted(signal)
  },
  async delete(binaryKey, signal) {
    throwIfAborted(signal)
    await persistence.binary.remove(FILE_SYNC_BINARY_NAMESPACE, binaryKey)
  },
})

const buildLedgerId = (workspaceId: string, providerId: string, fileKey: string): string =>
  [workspaceId, providerId, fileKey].map(encodeURIComponent).join('|')

export const createKnowgrphFileSyncLedgerStore = (
  persistence: KnowgrphStorageEnginePersistence,
): FileSyncLedgerStore => ({
  async get(workspaceId, providerId, fileKey, signal) {
    throwIfAborted(signal)
    return fromJsonRecord<FileSyncLedgerRecord>(
      await persistence.records.get(
        'file-sync:ledger',
        buildLedgerId(workspaceId, providerId, fileKey),
      ),
    )
  },
  async put(record, signal) {
    throwIfAborted(signal)
    await persistence.records.put(
      'file-sync:ledger',
      buildLedgerId(record.workspaceId, record.providerId, record.fileKey),
      toJsonRecord(record),
    )
  },
})

const readFileOutboxRecord = (
  envelope: KnowgrphStorageEngineOutboxRecord,
): FileSyncOutboxRecord | null => {
  const record = envelope.payload.record
  return record && typeof record === 'object' && !Array.isArray(record)
    ? record as unknown as FileSyncOutboxRecord
    : null
}

export const createKnowgrphFileSyncOutboxStore = (
  persistence: KnowgrphStorageEnginePersistence,
  workspaceId: string,
): FileSyncOutboxStore => ({
  async enqueue(record, capacity) {
    if (record.workspaceId !== workspaceId) throw new Error('File-sync outbox workspace mismatch.')
    const stored = await persistence.outbox.enqueue(toFileOutboxEnvelope(record), Math.min(
      capacity,
      FILE_SYNC_OUTBOX_CAPACITY,
    ))
    return stored ? readFileOutboxRecord(stored) : null
  },
  async list() {
    return (await persistence.outbox.list('file-transfer', workspaceId))
      .map(readFileOutboxRecord)
      .filter((record): record is FileSyncOutboxRecord => Boolean(record))
  },
  async update(record) {
    const current = await persistence.outbox.get(record.id)
    if (!current) return
    await persistence.outbox.update(toFileOutboxEnvelope(record, current))
  },
  remove: id => persistence.outbox.remove(id),
  async claimNext(args) {
    if (args.workspaceId !== workspaceId) throw new Error('File-sync outbox workspace mismatch.')
    const claim = await persistence.outbox.claimNext({
      kind: 'file-transfer',
      workspaceId,
      partitionKey: '',
      claimOwner: args.claimOwner,
      claimToken: args.claimToken,
      nowMs: args.nowMs,
      leaseMs: args.leaseMs,
    })
    const record = claim ? readFileOutboxRecord(claim.record) : null
    return claim && record ? { record, claimToken: claim.claimToken } : null
  },
  async updateClaimed(record, claimToken, releaseClaim) {
    const current = await persistence.outbox.get(record.id)
    if (!current) return false
    return persistence.outbox.updateClaimed({
      record: toFileOutboxEnvelope(record, current),
      claimToken,
      releaseClaim,
    })
  },
  removeClaimed: (id, claimToken) => persistence.outbox.acknowledgeClaimed({
    id,
    claimToken,
  }),
})

const toFileOutboxEnvelope = (
  record: Omit<FileSyncOutboxRecord, 'sequence'> | FileSyncOutboxRecord,
  current: KnowgrphStorageEngineOutboxRecord | null = null,
): KnowgrphStorageEngineOutboxRecord => ({
  id: record.id,
  kind: 'file-transfer',
  workspaceId: record.workspaceId,
  partitionKey: '',
  sequence: 'sequence' in record ? record.sequence : current?.sequence,
  claimToken: current?.claimToken,
  claimOwner: current?.claimOwner,
  claimExpiresAtMs: current?.claimExpiresAtMs,
  payload: { record: toJsonRecord(record) },
  attemptCount: record.attempts,
  lastErrorCode: record.state === 'failed' ? record.lastReason ?? 'failed' : null,
  createdAtMs: record.createdAtMs,
  updatedAtMs: record.updatedAtMs,
})

export const createKnowgrphFileSyncHashComputer = (): FileSyncHashComputer => ({
  async compute(bytes, signal) {
    throwIfAborted(signal)
    return [{ algorithm: 'sha256', value: await sha256Hex(new Uint8Array(bytes)) }]
  },
})
