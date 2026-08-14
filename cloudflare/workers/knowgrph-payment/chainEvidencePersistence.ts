import {
  buildAgenticCommerceSemanticKey,
} from '../../../grph-shared/src/payments/agenticCommerceSemanticKey'
import type {
  ChainCostEntry,
  ChainEvidenceRecord,
  DisagreementClass,
  MatchedTransfer,
} from '../../../grph-shared/src/payments/chainEvidenceContract'
import { queryFirst, readDb, type D1DatabaseLike } from '../shared/d1'

export type ChainStorageFailure = Readonly<{
  ok: false
  error: Readonly<{
    failure: 'chain_storage_unavailable'
    attemptIndex: number
    offendingInputs: readonly ['DB']
    retryNotBeforeMs: null
  }>
}>

export type ChainStorageSuccess<T extends object = Record<never, never>> = Readonly<{
  ok: true
}> & Readonly<T>

export type ChainStorageResult<T extends object = Record<never, never>> =
  | ChainStorageSuccess<T>
  | ChainStorageFailure

export type ChainEvidenceObservationInput = Readonly<{
  lifecycleId: string
  record: ChainEvidenceRecord
  matchedTransfer: MatchedTransfer | null
}>

export type ConfirmedChainFundingInput = Readonly<{
  lifecycleId: string
  chainId: number
  tokenContract: string
  transactionHash: string
  transferBlockNumber: number
  observationBlockHeight: number
  highestIndexedHeight: number
  valueBaseUnits: string
  confirmedAt: string
  attemptIndex: number
}>

export type ChainDisagreementInput = Readonly<{
  lifecycleId: string
  disagreementClass: DisagreementClass
  observationBlockHeight: number
  chainValueBaseUnits: string | null
  providerCreditBaseUnits: string | null
  transactionHash: string | null
  providerCreditRef: string | null
  createdAt: string
  attemptIndex: number
}>

export type CompleteChainCostEntryInput = Readonly<{
  id: string
  statusClass: NonNullable<ChainCostEntry['statusClass']>
  elapsedMs: number | null
  responseBytes: number | null
  attemptIndex: number
}>

type HighestIndexedHeightRow = Readonly<{
  highest_indexed_height: number | string | null
}>

const storageFailure = (attemptIndex: number): ChainStorageFailure => Object.freeze({
  ok: false,
  error: Object.freeze({
    failure: 'chain_storage_unavailable',
    attemptIndex,
    offendingInputs: Object.freeze(['DB']) as readonly ['DB'],
    retryNotBeforeMs: null,
  }),
})

const changedRows = (meta: unknown): number => {
  if (!meta || typeof meta !== 'object') return 0
  const changes = (meta as { changes?: unknown }).changes
  return typeof changes === 'number' && Number.isFinite(changes)
    ? Math.max(0, Math.floor(changes))
    : 0
}

const executeChangedRows = async (
  db: D1DatabaseLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> => {
  const result = await db.prepare(sql).bind(...values).run()
  if (result.success === false) throw new Error('D1 statement failed.')
  return changedRows(result.meta)
}

/* The semantic helper returns a digest; the clear watched address never enters D1. */
const watchedAddressDigest = (watchedAddress: string): string =>
  buildAgenticCommerceSemanticKey('chain-evidence-watched-address', [
    watchedAddress.trim().toLowerCase(),
  ])

const observationSemanticKey = (
  input: ChainEvidenceObservationInput,
  addressDigest: string,
): string => buildAgenticCommerceSemanticKey('chain-evidence-observation', [
  input.lifecycleId,
  input.record.chainId,
  input.record.tokenContract.toLowerCase(),
  addressDigest,
  input.matchedTransfer?.transactionHash?.toLowerCase() ?? null,
  input.matchedTransfer?.transferBlockNumber ?? null,
  input.record.observationBlockHeight,
  input.record.balanceBaseUnits,
  input.record.evidenceState,
  input.record.attemptCount,
  input.record.observationTime,
])

const disagreementSemanticKey = (input: ChainDisagreementInput): string =>
  buildAgenticCommerceSemanticKey('chain-evidence-disagreement', [
    input.lifecycleId,
    input.disagreementClass,
    input.observationBlockHeight,
    input.chainValueBaseUnits,
    input.providerCreditBaseUnits,
    input.transactionHash?.toLowerCase() ?? null,
    input.providerCreditRef,
  ])

export const appendChainEvidenceObservation = async (
  env: { DB?: unknown },
  input: ChainEvidenceObservationInput,
): Promise<ChainStorageResult<Readonly<{ inserted: boolean }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(input.record.attemptCount)

  const addressDigest = watchedAddressDigest(input.record.watchedAddress)
  const semanticKey = observationSemanticKey(input, addressDigest)
  try {
    const insertedRows = await executeChangedRows(
      db,
      `INSERT INTO payment_chain_evidence_observations (
         id, lifecycle_id, semantic_key, chain_id, token_contract,
         watched_address_digest, transaction_hash, transfer_block_number,
         observation_block_height, balance_base_units, evidence_state,
         attempt_count, observed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [
        `chain_evidence_observation_${semanticKey}`,
        input.lifecycleId,
        semanticKey,
        input.record.chainId,
        input.record.tokenContract,
        addressDigest,
        input.matchedTransfer?.transactionHash ?? null,
        input.matchedTransfer?.transferBlockNumber ?? null,
        input.record.observationBlockHeight,
        input.record.balanceBaseUnits,
        input.record.evidenceState,
        input.record.attemptCount,
        input.record.observationTime,
      ],
    )
    return Object.freeze({ ok: true, inserted: insertedRows === 1 })
  } catch {
    return storageFailure(input.record.attemptCount)
  }
}

/**
 * Stores the only confirmed state for a lifecycle. The guarded conflict clause
 * leaves all confirmed fields untouched unless the observation height advances.
 */
export const upsertConfirmedChainFunding = async (
  env: { DB?: unknown },
  input: ConfirmedChainFundingInput,
): Promise<ChainStorageResult<Readonly<{ advanced: boolean }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(input.attemptIndex)

  try {
    const changed = await executeChangedRows(
      db,
      `INSERT INTO payment_chain_confirmed_funding (
         lifecycle_id, chain_id, token_contract, transaction_hash,
         transfer_block_number, observation_block_height, highest_indexed_height,
         value_base_units, confirmed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lifecycle_id) DO UPDATE SET
         observation_block_height = MAX(
           excluded.observation_block_height,
           payment_chain_confirmed_funding.observation_block_height
         ),
         highest_indexed_height = MAX(
           excluded.highest_indexed_height,
           payment_chain_confirmed_funding.highest_indexed_height
         )
       WHERE excluded.observation_block_height
         > payment_chain_confirmed_funding.observation_block_height`,
      [
        input.lifecycleId,
        input.chainId,
        input.tokenContract,
        input.transactionHash,
        input.transferBlockNumber,
        input.observationBlockHeight,
        input.highestIndexedHeight,
        input.valueBaseUnits,
        input.confirmedAt,
      ],
    )
    return Object.freeze({ ok: true, advanced: changed === 1 })
  } catch {
    return storageFailure(input.attemptIndex)
  }
}

export const readHighestIndexedHeight = async (
  env: { DB?: unknown },
  args: Readonly<{ chainId: number; attemptIndex: number }>,
): Promise<ChainStorageResult<Readonly<{ highestIndexedHeight: number }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(args.attemptIndex)

  try {
    const row = await queryFirst<HighestIndexedHeightRow>(
      db,
      `SELECT MAX(highest_indexed_height) AS highest_indexed_height
         FROM payment_chain_confirmed_funding
        WHERE chain_id = ?`,
      [args.chainId],
    )
    const value = Number(row?.highest_indexed_height)
    return Object.freeze({
      ok: true,
      highestIndexedHeight: Number.isInteger(value) && value >= 0 ? value : 0,
    })
  } catch {
    return storageFailure(args.attemptIndex)
  }
}

export const appendChainDisagreement = async (
  env: { DB?: unknown },
  input: ChainDisagreementInput,
): Promise<ChainStorageResult<Readonly<{ inserted: boolean }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(input.attemptIndex)

  const semanticKey = disagreementSemanticKey(input)
  try {
    const insertedRows = await executeChangedRows(
      db,
      `INSERT INTO payment_chain_disagreements (
         id, lifecycle_id, semantic_key, disagreement_class,
         observation_block_height, chain_value_base_units,
         provider_credit_base_units, transaction_hash, provider_credit_ref,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [
        `chain_evidence_disagreement_${semanticKey}`,
        input.lifecycleId,
        semanticKey,
        input.disagreementClass,
        input.observationBlockHeight,
        input.chainValueBaseUnits,
        input.providerCreditBaseUnits,
        input.transactionHash,
        input.providerCreditRef,
        input.createdAt,
      ],
    )
    return Object.freeze({ ok: true, inserted: insertedRows === 1 })
  } catch {
    return storageFailure(input.attemptIndex)
  }
}

/** Writes the sole pre-dispatch ledger entry for an adapter request. */
export const appendChainCostEntry = async (
  env: { DB?: unknown },
  entry: ChainCostEntry,
): Promise<ChainStorageResult<Readonly<{ inserted: boolean }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(entry.attemptIndex)

  try {
    const insertedRows = await executeChangedRows(
      db,
      `INSERT INTO payment_chain_cost_entries (
         id, lifecycle_id, adapter_id, operation, attempt_index, chain_id,
         status_class, elapsed_ms, response_bytes, model_call_count, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [
        entry.id,
        entry.lifecycleId,
        entry.adapterId,
        entry.operation,
        entry.attemptIndex,
        entry.chainId,
        entry.statusClass,
        entry.elapsedMs,
        entry.responseBytes,
        entry.modelCallCount,
        entry.createdAt,
      ],
    )
    return Object.freeze({ ok: true, inserted: insertedRows === 1 })
  } catch {
    return storageFailure(entry.attemptIndex)
  }
}

/** Completes the pre-dispatch entry without creating another cost row. */
export const completeChainCostEntry = async (
  env: { DB?: unknown },
  input: CompleteChainCostEntryInput,
): Promise<ChainStorageResult<Readonly<{ completed: boolean }>>> => {
  const db = readDb(env)
  if (!db) return storageFailure(input.attemptIndex)

  try {
    const completedRows = await executeChangedRows(
      db,
      `UPDATE payment_chain_cost_entries
          SET status_class = ?, elapsed_ms = ?, response_bytes = ?
        WHERE id = ? AND status_class IS NULL`,
      [input.statusClass, input.elapsedMs, input.responseBytes, input.id],
    )
    return Object.freeze({ ok: true, completed: completedRows === 1 })
  } catch {
    return storageFailure(input.attemptIndex)
  }
}
