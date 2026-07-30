import type {
  PaymentIntentRecord,
  PaymentProviderCostEntry,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import type { D1DatabaseLike } from '../shared/d1'
import { execute, queryAll, queryFirst } from '../shared/d1'

type PaymentIntentRow = {
  id: string
  client_intent_key: string
  parameter_fingerprint: string
  amount_minor: number
  currency: string
  settlement_asset: PaymentIntentRecord['settlementAsset']
  origin: PaymentIntentRecord['origin']
  rail: PaymentIntentRecord['rail']
  selection_reason: PaymentIntentRecord['selectionReason']
  state: PaymentIntentRecord['state']
  provider_object_id: string | null
  provider_request_id: string | null
  provider_instruction_json: string | null
  provider_error_json: string | null
  refund_reference: string | null
  reconciliation_attempts: number
  revision: number
  created_at: string
  updated_at: string
  terminal_at: string | null
}

type PaymentCostRow = {
  id: string
  intent_id: string
  rail: PaymentProviderCostEntry['rail']
  operation: string
  provider_request_id: string | null
  outcome: string
  elapsed_ms: number
  model_call_count: 0
  model_cost_usd: 0
  created_at: string
}

type ProviderEventRow = {
  provider: 'stripe' | 'straitsx'
  event_id: string
  semantic_key: string
  raw_body_hash: string
  processing_status: 'processing' | 'processed' | 'failed'
  processing_error: string | null
  claim_token: string | null
  claim_expires_at: string | null
  received_at: string
}

export const PAYMENT_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000

export type PersistedPaymentIntentRecord = PaymentIntentRecord & Readonly<{
  revision: number
}>

export type PaymentIntentUpdateResult = Readonly<
  | { ok: true; record: PersistedPaymentIntentRecord }
  | {
      ok: false
      code: 'intent_revision_conflict'
      current: PersistedPaymentIntentRecord | null
    }
>

export type PaymentEventClaim = Readonly<
  | {
      ok: true
      shouldProcess: true
      duplicate: false
      claimEventId: string
      claimToken: string
    }
  | { ok: true; shouldProcess: false; duplicate: true }
  | { ok: false; code: 'event_identity_conflict' }
>

export type PaymentRuntimeStore = Readonly<{
  findIntentByClientKey(
    clientIntentKey: string,
  ): Promise<PersistedPaymentIntentRecord | null>
  findIntentById(intentId: string): Promise<PersistedPaymentIntentRecord | null>
  findIntentByProviderObject(
    rail: PaymentIntentRecord['rail'],
    providerObjectId: string,
  ): Promise<PersistedPaymentIntentRecord | null>
  findPaidSettlementEvidence(
    rail: PaymentIntentRecord['rail'],
  ): Promise<PersistedPaymentIntentRecord | null>
  insertIntent(
    record: PaymentIntentRecord,
  ): Promise<PersistedPaymentIntentRecord>
  updateIntent(
    record: PersistedPaymentIntentRecord,
  ): Promise<PaymentIntentUpdateResult>
  claimProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    semanticKey: string
    rawBodyHash: string
    receivedAt: string
  }): Promise<PaymentEventClaim>
  completeProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    claimToken: string
    processedAt: string
  }): Promise<boolean>
  failProviderEvent(args: {
    provider: 'stripe' | 'straitsx'
    eventId: string
    claimToken: string
    error: string
  }): Promise<boolean>
  appendCostEntry(entry: PaymentProviderCostEntry): Promise<void>
  listCostEntries(): Promise<readonly PaymentProviderCostEntry[]>
}>

const parseStoredJson = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const stringifyStoredJson = (value: unknown): string | null => {
  if (value == null) return null
  return JSON.stringify(value)
}

const mapIntentRow = (
  row: PaymentIntentRow,
): PersistedPaymentIntentRecord => Object.freeze({
  id: row.id,
  clientIntentKey: row.client_intent_key,
  parameterFingerprint: row.parameter_fingerprint,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  settlementAsset: row.settlement_asset,
  origin: row.origin,
  rail: row.rail,
  selectionReason: row.selection_reason,
  state: row.state,
  providerObjectId: row.provider_object_id,
  providerRequestId: row.provider_request_id,
  providerInstruction: parseStoredJson<PaymentIntentRecord['providerInstruction']>(
    row.provider_instruction_json,
  ),
  providerError: parseStoredJson<PaymentIntentRecord['providerError']>(
    row.provider_error_json,
  ),
  refundReference: row.refund_reference,
  reconciliationAttempts: Number(row.reconciliation_attempts),
  revision: Number(row.revision),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  terminalAt: row.terminal_at,
})

const intentValues = (record: PaymentIntentRecord): unknown[] => [
  record.id,
  record.clientIntentKey,
  record.parameterFingerprint,
  record.amountMinor,
  record.currency,
  record.settlementAsset,
  record.origin,
  record.rail,
  record.selectionReason,
  record.state,
  record.providerObjectId,
  record.providerRequestId,
  stringifyStoredJson(record.providerInstruction),
  stringifyStoredJson(record.providerError),
  record.refundReference,
  record.reconciliationAttempts,
  record.createdAt,
  record.updatedAt,
  record.terminalAt,
]

const withRevision = (
  record: PaymentIntentRecord,
  revision: number,
): PersistedPaymentIntentRecord => Object.freeze({
  ...record,
  revision,
})

const readChangedRows = (meta: unknown): number => {
  if (!meta || typeof meta !== 'object') return 0
  const changes = (meta as { changes?: unknown }).changes
  return typeof changes === 'number' && Number.isFinite(changes)
    ? Math.max(0, Math.floor(changes))
    : 0
}

const executeChangedRows = async (
  db: D1DatabaseLike,
  sql: string,
  values: unknown[],
): Promise<number> => {
  const result = await db.prepare(sql).bind(...values).run()
  return readChangedRows(result.meta)
}

const claimExpiry = (receivedAt: string): string => {
  const receivedAtMs = Date.parse(receivedAt)
  if (!Number.isFinite(receivedAtMs)) {
    throw new Error('Provider event receivedAt must be a valid ISO timestamp.')
  }
  return new Date(receivedAtMs + PAYMENT_EVENT_CLAIM_STALE_MS).toISOString()
}

const findEvent = async (
  db: D1DatabaseLike,
  provider: 'stripe' | 'straitsx',
  eventId: string,
  semanticKey: string,
): Promise<ProviderEventRow | null> => queryFirst<ProviderEventRow>(
  db,
  `SELECT provider, event_id, semantic_key, raw_body_hash, processing_status,
          processing_error, claim_token, claim_expires_at, received_at
     FROM payment_provider_events
    WHERE provider = ? AND (event_id = ? OR semantic_key = ?)
    ORDER BY CASE WHEN event_id = ? THEN 0 ELSE 1 END
    LIMIT 1`,
  [provider, eventId, semanticKey, eventId],
)

export const createD1PaymentRuntimeStore = (
  db: D1DatabaseLike,
): PaymentRuntimeStore => ({
  async findIntentByClientKey(clientIntentKey) {
    const row = await queryFirst<PaymentIntentRow>(
      db,
      'SELECT * FROM payment_intents WHERE client_intent_key = ? LIMIT 1',
      [clientIntentKey],
    )
    return row ? mapIntentRow(row) : null
  },

  async findIntentById(intentId) {
    const row = await queryFirst<PaymentIntentRow>(
      db,
      'SELECT * FROM payment_intents WHERE id = ? LIMIT 1',
      [intentId],
    )
    return row ? mapIntentRow(row) : null
  },

  async findIntentByProviderObject(rail, providerObjectId) {
    const row = await queryFirst<PaymentIntentRow>(
      db,
      `SELECT * FROM payment_intents
        WHERE rail = ? AND provider_object_id = ?
        LIMIT 1`,
      [rail, providerObjectId],
    )
    return row ? mapIntentRow(row) : null
  },

  async findPaidSettlementEvidence(rail) {
    const row = await queryFirst<PaymentIntentRow>(
      db,
      `SELECT i.*
         FROM payment_intents i
        WHERE i.rail = ?
          AND i.state = 'paid'
          AND i.provider_object_id IS NOT NULL
          AND i.terminal_at IS NOT NULL
          AND EXISTS (
            SELECT 1
              FROM payment_provider_events e
             WHERE e.provider = i.rail
               AND e.processing_status = 'processed'
               AND substr(e.semantic_key, -(length(i.provider_object_id) + 1))
                   = ':' || i.provider_object_id
          )
          AND EXISTS (
            SELECT 1
              FROM payment_cost_entries c
             WHERE c.intent_id = i.id
               AND c.outcome = 'success'
               AND (c.operation = 'payment.read' OR c.operation LIKE '%.read')
          )
        ORDER BY i.terminal_at DESC, i.id DESC
        LIMIT 1`,
      [rail],
    )
    return row ? mapIntentRow(row) : null
  },

  async insertIntent(record) {
    await execute(
      db,
      `INSERT INTO payment_intents (
         id, client_intent_key, parameter_fingerprint, amount_minor, currency,
         settlement_asset, origin, rail, selection_reason, state,
         provider_object_id, provider_request_id, provider_instruction_json,
         provider_error_json, refund_reference, reconciliation_attempts,
         revision, created_at, updated_at, terminal_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      intentValues(record),
    )
    return withRevision(record, 0)
  },

  async updateIntent(record) {
    const values = intentValues(record)
    const changedRows = await executeChangedRows(
      db,
      `UPDATE payment_intents SET
         client_intent_key = ?,
         parameter_fingerprint = ?,
         amount_minor = ?,
         currency = ?,
         settlement_asset = ?,
         origin = ?,
         rail = ?,
         selection_reason = ?,
         state = ?,
         provider_object_id = ?,
         provider_request_id = ?,
         provider_instruction_json = ?,
         provider_error_json = ?,
         refund_reference = ?,
         reconciliation_attempts = ?,
         created_at = ?,
         updated_at = ?,
         terminal_at = ?,
         revision = revision + 1
       WHERE id = ? AND revision = ?`,
      [...values.slice(1), values[0], record.revision],
    )
    if (changedRows === 1) {
      return Object.freeze({
        ok: true,
        record: withRevision(record, record.revision + 1),
      })
    }
    const current = await this.findIntentById(record.id)
    return Object.freeze({
      ok: false,
      code: 'intent_revision_conflict',
      current,
    })
  },

  async claimProviderEvent(args) {
    const claimToken = crypto.randomUUID()
    const expiresAt = claimExpiry(args.receivedAt)
    const insertedRows = await executeChangedRows(
      db,
      `INSERT INTO payment_provider_events (
         provider, event_id, semantic_key, raw_body_hash, processing_status,
         processing_error, claim_token, claim_expires_at, received_at, processed_at
       ) VALUES (?, ?, ?, ?, 'processing', NULL, ?, ?, ?, NULL)
       ON CONFLICT DO NOTHING`,
      [
        args.provider,
        args.eventId,
        args.semanticKey,
        args.rawBodyHash,
        claimToken,
        expiresAt,
        args.receivedAt,
      ],
    )
    if (insertedRows === 1) {
      return Object.freeze({
        ok: true,
        shouldProcess: true,
        duplicate: false,
        claimEventId: args.eventId,
        claimToken,
      })
    }
    const existing = await findEvent(
      db,
      args.provider,
      args.eventId,
      args.semanticKey,
    )
    if (existing) {
      const sameIdentity = existing.event_id === args.eventId
      if (sameIdentity && (
        existing.raw_body_hash !== args.rawBodyHash
        || existing.semantic_key !== args.semanticKey
      )) {
        return Object.freeze({ ok: false, code: 'event_identity_conflict' })
      }
      const reclaimedRows = await executeChangedRows(
        db,
        `UPDATE payment_provider_events
            SET processing_status = 'processing',
                processing_error = NULL,
                claim_token = ?,
                claim_expires_at = ?,
                received_at = ?,
                processed_at = NULL
          WHERE provider = ?
            AND event_id = ?
            AND (
              processing_status = 'failed'
              OR (
                processing_status = 'processing'
                AND claim_expires_at <= ?
              )
            )`,
        [
          claimToken,
          expiresAt,
          args.receivedAt,
          args.provider,
          existing.event_id,
          args.receivedAt,
        ],
      )
      if (reclaimedRows === 1) {
        return Object.freeze({
          ok: true,
          shouldProcess: true,
          duplicate: false,
          claimEventId: existing.event_id,
          claimToken,
        })
      }
      const current = await findEvent(
        db,
        args.provider,
        args.eventId,
        args.semanticKey,
      )
      if (
        current?.event_id === args.eventId
        && (
          current.raw_body_hash !== args.rawBodyHash
          || current.semantic_key !== args.semanticKey
        )
      ) {
        return Object.freeze({ ok: false, code: 'event_identity_conflict' })
      }
      return Object.freeze({ ok: true, shouldProcess: false, duplicate: true })
    }
    throw new Error('Provider event claim conflict could not be resolved.')
  },

  async completeProviderEvent(args) {
    const changedRows = await executeChangedRows(
      db,
      `UPDATE payment_provider_events
          SET processing_status = 'processed',
              processing_error = NULL,
              claim_token = NULL,
              claim_expires_at = NULL,
              processed_at = ?
        WHERE provider = ?
          AND event_id = ?
          AND processing_status = 'processing'
          AND claim_token = ?`,
      [args.processedAt, args.provider, args.eventId, args.claimToken],
    )
    return changedRows === 1
  },

  async failProviderEvent(args) {
    const changedRows = await executeChangedRows(
      db,
      `UPDATE payment_provider_events
          SET processing_status = 'failed',
              processing_error = ?,
              claim_token = NULL,
              claim_expires_at = NULL
        WHERE provider = ?
          AND event_id = ?
          AND processing_status = 'processing'
          AND claim_token = ?`,
      [
        args.error.slice(0, 500),
        args.provider,
        args.eventId,
        args.claimToken,
      ],
    )
    return changedRows === 1
  },

  async appendCostEntry(entry) {
    await execute(
      db,
      `INSERT INTO payment_cost_entries (
         id, intent_id, rail, operation, provider_request_id, outcome,
         elapsed_ms, model_call_count, model_cost_usd, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.intentId,
        entry.rail,
        entry.operation,
        entry.providerRequestId,
        entry.outcome,
        entry.elapsedMs,
        entry.modelCallCount,
        entry.modelCostUsd,
        entry.createdAt,
      ],
    )
  },

  async listCostEntries() {
    const rows = await queryAll<PaymentCostRow>(
      db,
      'SELECT * FROM payment_cost_entries ORDER BY created_at, id',
    )
    return rows.map(row => Object.freeze({
      id: row.id,
      intentId: row.intent_id,
      rail: row.rail,
      operation: row.operation,
      providerRequestId: row.provider_request_id,
      outcome: row.outcome,
      elapsedMs: Number(row.elapsed_ms),
      modelCallCount: 0,
      modelCostUsd: 0,
      createdAt: row.created_at,
    }))
  },
})
