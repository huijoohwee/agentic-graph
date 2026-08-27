import { toCloneSafeValue } from '@/lib/storage/cloneSafe'
import type {
  KnowgrphStorageEngineOutboxRecord,
  StoredEngineRecord,
} from './knowgrphStorageEnginePersistenceContract'

const CREDENTIAL_FIELD_PATTERN =
  /^(?:authorization|password|credentials?|.*bearer.*|.*token.*|.*secret.*|privateKey|apiKey)$/i

export type StoredBinaryManifest = {
  key: string
  namespace: string
  objectKey: string
  contentHash: string
  byteLength: number
  chunkCount: number
  updatedAtMs: number
}

export type StoredBinaryChunk = {
  key: string
  manifestKey: string
  chunkIndex: number
  bytes: ArrayBuffer
}

export const cloneStorageValue = <Value>(value: Value): Value =>
  (toCloneSafeValue(value) ?? null) as Value

export const normalizeStorageValue = (value: unknown): string =>
  String(value || '').trim()

export const normalizeStorageError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error || 'IndexedDB operation failed')

export const assertStorageCredentialFree = (value: unknown, depth = 0): void => {
  if (depth > 20 || value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach(entry => assertStorageCredentialFree(entry, depth + 1))
    return
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_FIELD_PATTERN.test(key)) {
      throw new Error(`Storage engine persistence rejects credential field: ${key}.`)
    }
    assertStorageCredentialFree(child, depth + 1)
  }
}

export const assertStorageNamespaceAndId = (
  namespaceValue: unknown,
  idValue: unknown,
): [string, string] => {
  const namespace = normalizeStorageValue(namespaceValue)
  const id = normalizeStorageValue(idValue)
  if (!namespace || !id) throw new Error('Storage engine namespace and id are required.')
  return [namespace, id]
}

export const assertStorageOutboxRecord = (
  record: KnowgrphStorageEngineOutboxRecord,
): KnowgrphStorageEngineOutboxRecord => {
  const id = normalizeStorageValue(record.id)
  const workspaceId = normalizeStorageValue(record.workspaceId)
  if (!id || !workspaceId) throw new Error('Storage engine outbox id and workspaceId are required.')
  if (record.kind !== 'git-operation' && record.kind !== 'file-transfer') {
    throw new Error('Storage engine outbox kind is unsupported.')
  }
  assertStorageCredentialFree(record.payload)
  return cloneStorageValue({
    ...record,
    id,
    workspaceId,
    partitionKey: normalizeStorageValue(record.partitionKey),
    sequence: Math.max(0, Math.floor(Number(record.sequence || 0))),
    claimToken: normalizeStorageValue(record.claimToken) || null,
    claimOwner: normalizeStorageValue(record.claimOwner) || null,
    claimExpiresAtMs: record.claimExpiresAtMs == null
      ? null
      : Math.max(0, Math.floor(Number(record.claimExpiresAtMs))),
    attemptCount: Math.max(0, Math.floor(Number(record.attemptCount || 0))),
    createdAtMs: Math.max(0, Math.floor(Number(record.createdAtMs || 0))),
    updatedAtMs: Math.max(0, Math.floor(Number(record.updatedAtMs || 0))),
  })
}

export const storageRecordKey = (namespace: string, id: string): string =>
  `${namespace}\u0000${id}`

export const storageBinaryKey = (namespace: string, objectKey: string): string =>
  `${namespace}\u0000${objectKey}`

export const storageBinaryChunkKey = (manifestKey: string, chunkIndex: number): string =>
  `${manifestKey}\u0000${String(chunkIndex).padStart(8, '0')}`

export const matchesStorageExpectedRevision = (
  record: StoredEngineRecord | undefined,
  expectedRevision: string | null | undefined,
): boolean => expectedRevision === undefined
  || (expectedRevision === null
    ? !record
    : String(record?.value.revision || '') === expectedRevision)
