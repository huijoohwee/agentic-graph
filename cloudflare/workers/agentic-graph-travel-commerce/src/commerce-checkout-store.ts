import { DurableObject } from 'cloudflare:workers'

type StoredPreparation = Readonly<{
  checkoutId: string
  requestDigest: string
  requestJson: string
  receiptJson: string
}>

type StoredConfirmation = Readonly<{
  idempotencyKey: string
  requestDigest: string
  state: 'pending' | 'settled'
  receiptJson: string | null
}>

type StoredObservation = Readonly<{
  offerId: string
  agentId: string
  priceMinor: number
  available: boolean
  requestDigest: string
}>

type SqlRow = Record<string, string | number | null>

export class CommerceCheckoutStore extends DurableObject<TravelCommerceEnv> {
  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS checkout_preparation (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          checkout_id TEXT NOT NULL,
          request_digest TEXT NOT NULL,
          request_json TEXT NOT NULL,
          receipt_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS checkout_confirmation (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          idempotency_key TEXT NOT NULL,
          request_digest TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'settled')),
          receipt_json TEXT
        );
        CREATE TABLE IF NOT EXISTS offer_observation (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          offer_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          price_minor INTEGER NOT NULL CHECK (price_minor > 0),
          available INTEGER NOT NULL CHECK (available IN (0, 1)),
          request_digest TEXT NOT NULL
        );
      `)
    })
  }

  prepare(value: StoredPreparation): Readonly<{ kind: 'stored' | 'idempotent' | 'conflict' }> {
    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<SqlRow>(
        'SELECT request_digest FROM checkout_preparation WHERE singleton = 1',
      ).toArray()[0]
      if (row) return Object.freeze({
        kind: row.request_digest === value.requestDigest ? 'idempotent' as const : 'conflict' as const,
      })
      this.ctx.storage.sql.exec(
        `INSERT INTO checkout_preparation
         (singleton, checkout_id, request_digest, request_json, receipt_json)
         VALUES (1, ?, ?, ?, ?)`,
        value.checkoutId, value.requestDigest, value.requestJson, value.receiptJson,
      )
      return Object.freeze({ kind: 'stored' as const })
    })
  }

  readPreparation(): StoredPreparation | null {
    const row = this.ctx.storage.sql.exec<SqlRow>(
      `SELECT checkout_id, request_digest, request_json, receipt_json
       FROM checkout_preparation WHERE singleton = 1`,
    ).toArray()[0]
    return row ? Object.freeze({
      checkoutId: String(row.checkout_id),
      requestDigest: String(row.request_digest),
      requestJson: String(row.request_json),
      receiptJson: String(row.receipt_json),
    }) : null
  }

  beginConfirmation(value: Readonly<{
    idempotencyKey: string
    requestDigest: string
  }>): Readonly<{ kind: 'pending' | 'settled' | 'conflict'; receiptJson?: string }> {
    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<SqlRow>(
        `SELECT idempotency_key, request_digest, state, receipt_json
         FROM checkout_confirmation WHERE singleton = 1`,
      ).toArray()[0]
      if (row) {
        if (row.idempotency_key !== value.idempotencyKey || row.request_digest !== value.requestDigest) {
          return Object.freeze({ kind: 'conflict' as const })
        }
        return row.state === 'settled' && typeof row.receipt_json === 'string'
          ? Object.freeze({ kind: 'settled' as const, receiptJson: row.receipt_json })
          : Object.freeze({ kind: 'pending' as const })
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO checkout_confirmation
         (singleton, idempotency_key, request_digest, state, receipt_json)
         VALUES (1, ?, ?, 'pending', NULL)`,
        value.idempotencyKey, value.requestDigest,
      )
      return Object.freeze({ kind: 'pending' as const })
    })
  }

  completeConfirmation(value: Readonly<{
    idempotencyKey: string
    requestDigest: string
    receiptJson: string
  }>): Readonly<{ kind: 'settled' | 'conflict' }> {
    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<SqlRow>(
        `SELECT idempotency_key, request_digest, state, receipt_json
         FROM checkout_confirmation WHERE singleton = 1`,
      ).toArray()[0]
      if (!row || row.idempotency_key !== value.idempotencyKey
        || row.request_digest !== value.requestDigest) return Object.freeze({ kind: 'conflict' as const })
      if (row.state === 'settled') {
        return Object.freeze({
          kind: row.receipt_json === value.receiptJson ? 'settled' as const : 'conflict' as const,
        })
      }
      this.ctx.storage.sql.exec(
        `UPDATE checkout_confirmation SET state = 'settled', receipt_json = ?
         WHERE singleton = 1 AND state = 'pending'`,
        value.receiptJson,
      )
      return Object.freeze({ kind: 'settled' as const })
    })
  }

  readConfirmation(): StoredConfirmation | null {
    const row = this.ctx.storage.sql.exec<SqlRow>(
      `SELECT idempotency_key, request_digest, state, receipt_json
       FROM checkout_confirmation WHERE singleton = 1`,
    ).toArray()[0]
    return row ? Object.freeze({
      idempotencyKey: String(row.idempotency_key),
      requestDigest: String(row.request_digest),
      state: row.state === 'settled' ? 'settled' : 'pending',
      receiptJson: typeof row.receipt_json === 'string' ? row.receipt_json : null,
    }) : null
  }

  recordObservation(value: StoredObservation): Readonly<{ kind: 'stored' | 'idempotent' | 'conflict' }> {
    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<SqlRow>(
        'SELECT request_digest FROM offer_observation WHERE singleton = 1',
      ).toArray()[0]
      if (row) return Object.freeze({
        kind: row.request_digest === value.requestDigest ? 'idempotent' as const : 'conflict' as const,
      })
      this.ctx.storage.sql.exec(
        `INSERT INTO offer_observation
         (singleton, offer_id, agent_id, price_minor, available, request_digest)
         VALUES (1, ?, ?, ?, ?, ?)`,
        value.offerId, value.agentId, value.priceMinor, value.available ? 1 : 0, value.requestDigest,
      )
      return Object.freeze({ kind: 'stored' as const })
    })
  }

  readObservation(): StoredObservation | null {
    const row = this.ctx.storage.sql.exec<SqlRow>(
      `SELECT offer_id, agent_id, price_minor, available, request_digest
       FROM offer_observation WHERE singleton = 1`,
    ).toArray()[0]
    return row ? Object.freeze({
      offerId: String(row.offer_id),
      agentId: String(row.agent_id),
      priceMinor: Number(row.price_minor),
      available: row.available === 1,
      requestDigest: String(row.request_digest),
    }) : null
  }
}
