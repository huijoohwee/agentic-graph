import { buildAgenticCommerceSemanticKey } from 'grph-shared/payments/agenticCommerceSemanticKey'
import type {
  ChainEvidenceRecord,
  EvidenceCache,
  EvidenceCacheKey,
  TypedVerificationFailure,
} from '../../../../grph-shared/src/payments/chainEvidenceContract'
import {
  getAgenticGraphStorageDb,
  type KgChainEvidenceRecord,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agenticgraphStorageDb'

const CACHE_SCOPE = 'chainEvidence'
const EVIDENCE_STATES = new Set([
  'chain_unobserved',
  'chain_pending',
  'chain_confirmed',
  'chain_disagreement',
  'chain_verification_unresolved',
])
const BASE_UNIT_PATTERN = /^(?:0|[1-9][0-9]*)$/

type CachePolicy = Readonly<{ maxCacheEntries: number }>
type ParsedCacheEntry = Readonly<{ id: string; record: ChainEvidenceRecord; updatedAtMs: number }>

export type ChainEvidenceCacheOptions = Readonly<{
  policy: CachePolicy
  dbState?: AgenticGraphStorageDb | null
  now?: () => number
}>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isBlockHeight = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isBaseUnitValue = (value: unknown): value is string =>
  typeof value === 'string' && BASE_UNIT_PATTERN.test(value)

const buildCacheId = (key: EvidenceCacheKey): string =>
  buildAgenticCommerceSemanticKey(CACHE_SCOPE, [
    key.chainId,
    key.tokenContract,
    key.watchedAddress,
    key.observationBlockHeight,
  ])

const keyForRecord = (record: ChainEvidenceRecord): EvidenceCacheKey => ({
  chainId: record.chainId,
  tokenContract: record.tokenContract,
  watchedAddress: record.watchedAddress,
  observationBlockHeight: record.observationBlockHeight,
})

const isCanonicalObservationTime = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

const isValidTransfer = (value: unknown): boolean =>
  isRecord(value)
  && typeof value.transactionHash === 'string'
  && value.transactionHash.length > 0
  && isBlockHeight(value.transferBlockNumber)
  && isBaseUnitValue(value.valueBaseUnits)

const isValidEvidenceRecord = (value: unknown): value is ChainEvidenceRecord =>
  isRecord(value)
  && isBlockHeight(value.chainId)
  && typeof value.tokenContract === 'string'
  && value.tokenContract.length > 0
  && typeof value.watchedAddress === 'string'
  && value.watchedAddress.length > 0
  && isBaseUnitValue(value.balanceBaseUnits)
  && isBlockHeight(value.balanceBlockHeight)
  && isBlockHeight(value.tokenDecimals)
  && Array.isArray(value.matchedTransfers)
  && value.matchedTransfers.every(isValidTransfer)
  && isBlockHeight(value.observationBlockHeight)
  && isCanonicalObservationTime(value.observationTime)
  && typeof value.evidenceState === 'string'
  && EVIDENCE_STATES.has(value.evidenceState)
  && isBlockHeight(value.attemptCount)

const parseCacheEntry = (value: unknown): ParsedCacheEntry | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || !isBlockHeight(value.updatedAtMs)) return null
  if (!isValidEvidenceRecord(value.record)) return null
  const record = value.record
  return value.id === buildCacheId(keyForRecord(record))
    ? { id: value.id, record, updatedAtMs: value.updatedAtMs }
    : null
}

const sameTuple = (left: ChainEvidenceRecord, right: ChainEvidenceRecord): boolean =>
  left.chainId === right.chainId
  && left.tokenContract === right.tokenContract
  && left.watchedAddress === right.watchedAddress

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (!isRecord(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}

const recordsEqual = (left: ChainEvidenceRecord, right: ChainEvidenceRecord): boolean =>
  canonicalize(left) === canonicalize(right)

const storageUnavailable = (record: ChainEvidenceRecord): Readonly<{
  ok: false
  error: TypedVerificationFailure
}> => ({
  ok: false,
  error: {
    failure: 'chain_storage_unavailable',
    attemptIndex: record.attemptCount,
    offendingInputs: ['chainId', 'tokenContract', 'watchedAddress', 'observationBlockHeight'],
    retryNotBeforeMs: null,
  },
})

const assertCachePolicy = (policy: CachePolicy): void => {
  if (!Number.isSafeInteger(policy.maxCacheEntries) || policy.maxCacheEntries < 1) {
    throw new TypeError('maxCacheEntries must be a positive safe integer')
  }
}

/**
 * Creates the browser-local, origin- and profile-scoped evidence cache. The
 * caller supplies only the resolved source-owned limit; this owner never
 * reads an environment value or issues a network request.
 */
export const createChainEvidenceCache = (options: ChainEvidenceCacheOptions): EvidenceCache => {
  assertCachePolicy(options.policy)
  const now = options.now || Date.now
  const storage = async (): Promise<AgenticGraphStorageDb> =>
    options.dbState || await getAgenticGraphStorageDb()

  const evictUnparseable = async (id: string): Promise<void> => {
    const safeId = String(id || '').trim()
    if (!safeId) return
    try {
      const dbState = await storage()
      const row = await dbState.collections.paymentChainEvidence.findOne(safeId).exec()
      if (!row || parseCacheEntry(row.toJSON())) return
      await dbState.atomicWrite([{
        kind: 'remove',
        collectionName: 'paymentChainEvidence',
        id: safeId,
      }])
    } catch {
      // A malformed entry is never returned, even if local eviction cannot persist.
    }
  }

  const read = async (key: EvidenceCacheKey): Promise<ChainEvidenceRecord | null> => {
    const id = buildCacheId(key)
    try {
      const dbState = await storage()
      const row = await dbState.collections.paymentChainEvidence.findOne(id).exec()
      if (!row) return null
      const entry = parseCacheEntry(row.toJSON())
      if (!entry) {
        await evictUnparseable(id)
        return null
      }
      return entry.record
    } catch {
      return null
    }
  }

  const write = async (record: ChainEvidenceRecord) => {
    if (!isValidEvidenceRecord(record)) {
      throw new TypeError('ChainEvidenceRecord must contain a complete cache key and observation')
    }

    const incomingId = buildCacheId(keyForRecord(record))
    const incoming: ParsedCacheEntry = {
      id: incomingId,
      record,
      updatedAtMs: now(),
    }

    try {
      const dbState = await storage()
      const rows = await dbState.collections.paymentChainEvidence.find().exec()
      const invalidIds: string[] = []
      const entries: ParsedCacheEntry[] = []
      for (const row of rows) {
        const raw = row.toJSON() as KgChainEvidenceRecord
        const entry = parseCacheEntry(raw)
        if (entry) entries.push(entry)
        else invalidIds.push(String(raw.id || '').trim())
      }

      const sameTupleEntries = entries.filter(entry => sameTuple(entry.record, record))
      const highest = sameTupleEntries.reduce<ParsedCacheEntry | null>((current, entry) =>
        !current || entry.record.observationBlockHeight > current.record.observationBlockHeight
          ? entry
          : current, null)
      if (highest && record.observationBlockHeight < highest.record.observationBlockHeight) {
        return Object.freeze({ ok: true as const, replaced: false })
      }
      if (highest && record.observationBlockHeight === highest.record.observationBlockHeight) {
        return Object.freeze({ ok: true as const, replaced: false })
      }

      const entriesAfterReplacement = entries.filter(entry => !sameTuple(entry.record, record))
      const excess = entriesAfterReplacement.length + 1 - options.policy.maxCacheEntries
      const evictionIds = entriesAfterReplacement
        .sort((left, right) => {
          const stateOrder = Number(left.record.evidenceState === 'chain_confirmed')
            - Number(right.record.evidenceState === 'chain_confirmed')
          return stateOrder || left.updatedAtMs - right.updatedAtMs || left.id.localeCompare(right.id)
        })
        .slice(0, Math.max(0, excess))
        .map(entry => entry.id)
      const removeIds = new Set([
        ...invalidIds,
        ...sameTupleEntries.map(entry => entry.id),
        ...evictionIds,
      ])
      removeIds.delete(incomingId)
      await dbState.atomicWrite([
        ...[...removeIds].filter(Boolean).map(id => ({
          kind: 'remove' as const,
          collectionName: 'paymentChainEvidence' as const,
          id,
        })),
        { kind: 'upsert' as const, collectionName: 'paymentChainEvidence' as const, record: incoming },
      ])
      return Object.freeze({ ok: true as const, replaced: sameTupleEntries.length > 0 })
    } catch {
      return storageUnavailable(record)
    }
  }

  return Object.freeze({ read, write, evictUnparseable })
}

export { buildCacheId as buildChainEvidenceCacheEntryId }
