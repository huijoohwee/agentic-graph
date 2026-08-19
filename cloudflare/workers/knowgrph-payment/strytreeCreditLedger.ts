import {
  execute,
  queryAll,
  queryFirst,
  readDb,
  type D1DatabaseLike,
} from '../shared/d1'

const MAX_BODY_BYTES = 32 * 1024
const MAX_TEXT_LENGTH = 512

type SqlCursor<T> = { toArray(): T[] }
type LedgerActorState = {
  storage: {
    sql: { exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlCursor<T> }
    transactionSync<T>(callback: () => T): T
  }
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
}

export type StrytreeLedgerEnv = Record<string, unknown> & {
  DB?: unknown
  STRYTREE_CHECKOUT_MODE?: unknown
}

type MutationPayload = {
  id?: unknown
  user_id?: unknown
  event_type?: unknown
  amount_credits?: unknown
  related_object_type?: unknown
  related_object_id?: unknown
  provider_event_id?: unknown
  idempotency_key?: unknown
  metadata_json?: unknown
  created_at?: unknown
}

type Mutation = Readonly<{
  id: string
  userId: string
  eventType: string
  amountCredits: number
  relatedObjectType: string
  relatedObjectId: string
  providerEventId: string | null
  idempotencyKey: string
  metadataJson: string
  createdAt: string
}>

type LedgerEvent = Mutation & Readonly<{
  semanticDigest: string
  balanceAfterCredits: number
  authorityVersion: number
}>

type D1LedgerRow = {
  id: string
  user_id: string
  event_type: string
  amount_credits: number
  balance_after_credits: number
  related_object_type: string | null
  related_object_id: string | null
  provider_event_id: string | null
  idempotency_key: string
  metadata_json: string | null
  created_at: string
  semantic_digest?: string | null
  authority_version?: number | null
}

type LocalEventRow = {
  id: string
  user_id: string
  event_type: string
  amount_credits: number
  balance_after_credits: number
  related_object_type: string
  related_object_id: string
  provider_event_id: string | null
  idempotency_key: string
  metadata_json: string
  created_at: string
  semantic_digest: string
  authority_version: number
}

class MutationFailure extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

const json = (status: number, body: unknown): Response => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' },
})

const asString = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const validText = (value: string): boolean => value.length > 0
  && value.length <= MAX_TEXT_LENGTH
  && !/[\u0000-\u001f\u007f]/u.test(value)

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MutationFailure(400, 'invalid-metadata-json')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  throw new MutationFailure(400, 'invalid-metadata-json')
}

const normalizeMetadata = (value: unknown): string => {
  const encoded = typeof value === 'string' ? value : '{}'
  if (new TextEncoder().encode(encoded).byteLength > MAX_BODY_BYTES) {
    throw new MutationFailure(413, 'metadata-too-large')
  }
  try {
    return canonicalJson(JSON.parse(encoded))
  } catch (error) {
    if (error instanceof MutationFailure) throw error
    throw new MutationFailure(400, 'invalid-metadata-json')
  }
}

const parseMutation = (payload: MutationPayload, allowLegacyProoflessPurchase = false): Mutation => {
  const id = asString(payload.id)
  const userId = asString(payload.user_id)
  const eventType = asString(payload.event_type)
  const relatedObjectType = asString(payload.related_object_type)
  const relatedObjectId = asString(payload.related_object_id)
  const providerEventId = asString(payload.provider_event_id) || null
  const idempotencyKey = asString(payload.idempotency_key)
  const amountCredits = payload.amount_credits
  const createdAt = asString(payload.created_at)
  if (![id, userId, eventType, relatedObjectType, relatedObjectId, idempotencyKey].every(validText)
    || typeof amountCredits !== 'number' || !Number.isSafeInteger(amountCredits) || amountCredits === 0
    || !createdAt || !Number.isFinite(Date.parse(createdAt))
    || (providerEventId !== null && !validText(providerEventId))) {
    throw new MutationFailure(400, 'invalid-strytree-ledger-mutation')
  }
  if (eventType === 'purchase_credit') {
    if (amountCredits <= 0 || relatedObjectType !== 'strytree_payment_session') {
      throw new MutationFailure(400, 'invalid-purchase-credit')
    }
    if (!allowLegacyProoflessPurchase && !providerEventId) {
      throw new MutationFailure(403, 'provider-proof-required')
    }
  }
  return Object.freeze({
    id, userId, eventType, amountCredits, relatedObjectType, relatedObjectId,
    providerEventId, idempotencyKey, metadataJson: normalizeMetadata(payload.metadata_json), createdAt,
  })
}

const semanticDigest = async (mutation: Mutation): Promise<string> => {
  const canonical = canonicalJson({
    amountCredits: mutation.amountCredits,
    eventType: mutation.eventType,
    metadata: JSON.parse(mutation.metadataJson),
    providerEventId: mutation.providerEventId,
    relatedObjectId: mutation.relatedObjectId,
    relatedObjectType: mutation.relatedObjectType,
    userId: mutation.userId,
    version: 1,
  })
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const localRowToEvent = (row: LocalEventRow): LedgerEvent => Object.freeze({
  id: row.id,
  userId: row.user_id,
  eventType: row.event_type,
  amountCredits: row.amount_credits,
  relatedObjectType: row.related_object_type,
  relatedObjectId: row.related_object_id,
  providerEventId: row.provider_event_id,
  idempotencyKey: row.idempotency_key,
  metadataJson: row.metadata_json,
  createdAt: row.created_at,
  semanticDigest: row.semantic_digest,
  balanceAfterCredits: row.balance_after_credits,
  authorityVersion: row.authority_version,
})

export class StrytreeCreditLedgerActor {
  private readonly schemaReady: Promise<void>
  private bootstrapPromise: Promise<void> | null = null

  constructor(
    private readonly ctx: LedgerActorState,
    private readonly env: StrytreeLedgerEnv,
  ) {
    this.schemaReady = ctx.blockConcurrencyWhile(async () => this.migrate())
  }

  async fetch(request: Request): Promise<Response> {
    await this.schemaReady
    const url = new URL(request.url)
    if (request.method === 'GET' && (url.pathname.endsWith('/health') || url.pathname.endsWith('/readyz'))) {
      try {
        this.ctx.storage.sql.exec('SELECT singleton FROM account_state LIMIT 1').toArray()
        return json(200, { ok: true, service: 'strytree-credit-ledger', authority: 'durable-object-sqlite' })
      } catch {
        return json(503, { ok: false, code: 'ledger-schema-unavailable' })
      }
    }
    if (request.method === 'GET' && url.pathname.endsWith('/balance')) {
      const userId = asString(url.searchParams.get('user_id'))
      if (!validText(userId)) return json(400, { ok: false, code: 'invalid-user-id' })
      try {
        await this.ensureBootstrapped(userId)
        const state = this.account(userId)
        return json(200, {
          ok: true,
          user_id: userId,
          balance_credits: state.balance_credits,
          authority_version: state.authority_version,
          authority: 'durable-object-sqlite',
        })
      } catch (error) {
        if (error instanceof MutationFailure) {
          return json(error.status, { ok: false, code: error.code, error: error.code })
        }
        return json(503, { ok: false, code: 'ledger-authority-unavailable' })
      }
    }
    if (request.method !== 'POST' || (!url.pathname.endsWith('/mutations') && !url.pathname.endsWith('/debit'))) {
      return json(404, { ok: false, code: 'strytree-credit-ledger-route-not-found' })
    }
    try {
      const payload = await this.readPayload(request)
      const allowProofless = asString(this.env.STRYTREE_CHECKOUT_MODE).toLowerCase() === 'local-development'
      const mutation = parseMutation(payload, allowProofless)
      await this.ensureBootstrapped(mutation.userId)
      const digest = await semanticDigest(mutation)
      await this.claimProviderEffect(mutation, digest)
      const { event, replay } = this.mutate(mutation, digest)
      await this.project(event)
      return json(200, {
        ok: true,
        ledger_event_id: event.id,
        balance_after_credits: event.balanceAfterCredits,
        authority_version: event.authorityVersion,
        idempotent_replay: replay,
        semantic_digest: event.semanticDigest,
        authority: 'durable-object-sqlite',
      })
    } catch (error) {
      if (error instanceof MutationFailure) return json(error.status, { ok: false, error: error.code, code: error.code })
      return json(503, { ok: false, error: 'ledger-authority-unavailable', code: 'ledger-authority-unavailable' })
    }
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS account_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), user_id TEXT NOT NULL UNIQUE,
        balance_credits INTEGER NOT NULL CHECK (balance_credits >= 0),
        authority_version INTEGER NOT NULL CHECK (authority_version >= 0), bootstrapped_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL,
        amount_credits INTEGER NOT NULL CHECK (amount_credits != 0),
        balance_after_credits INTEGER NOT NULL CHECK (balance_after_credits >= 0),
        related_object_type TEXT NOT NULL, related_object_id TEXT NOT NULL,
        provider_event_id TEXT, idempotency_key TEXT NOT NULL UNIQUE,
        semantic_digest TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
        authority_version INTEGER NOT NULL UNIQUE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_effect
        ON ledger_events(user_id, event_type, related_object_type, related_object_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_provider_event
        ON ledger_events(provider_event_id) WHERE provider_event_id IS NOT NULL;
    `)
  }

  private async readPayload(request: Request): Promise<MutationPayload> {
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new MutationFailure(413, 'request-too-large')
    try {
      const value = JSON.parse(text)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not-object')
      return value as MutationPayload
    } catch {
      throw new MutationFailure(400, 'invalid-json-body')
    }
  }

  private account(userId: string): { user_id: string; balance_credits: number; authority_version: number } {
    const row = this.ctx.storage.sql.exec<{
      user_id: string
      balance_credits: number
      authority_version: number
    }>('SELECT user_id, balance_credits, authority_version FROM account_state WHERE singleton = 1').toArray()[0]
    if (!row || row.user_id !== userId) throw new MutationFailure(409, 'ledger-actor-user-conflict')
    return row
  }

  private async ensureBootstrapped(userId: string): Promise<void> {
    const current = this.ctx.storage.sql.exec<{ user_id: string }>(
      'SELECT user_id FROM account_state WHERE singleton = 1',
    ).toArray()[0]
    if (current) {
      if (current.user_id !== userId) throw new MutationFailure(409, 'ledger-actor-user-conflict')
      return
    }
    if (!this.bootstrapPromise) this.bootstrapPromise = this.bootstrap(userId)
    await this.bootstrapPromise
    this.account(userId)
  }

  private async bootstrap(userId: string): Promise<void> {
    const db = this.db()
    const rows = await queryAll<D1LedgerRow>(db, `
      SELECT id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        metadata_json, created_at, semantic_digest, authority_version
      FROM strytree_token_ledger WHERE user_id = ? ORDER BY created_at, id
    `, [userId])
    const events: LedgerEvent[] = []
    let balance = 0
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const mutation = parseMutation({
        id: row.id, user_id: row.user_id, event_type: row.event_type,
        amount_credits: row.amount_credits, related_object_type: row.related_object_type,
        related_object_id: row.related_object_id, provider_event_id: row.provider_event_id,
        idempotency_key: row.idempotency_key, metadata_json: row.metadata_json || '{}', created_at: row.created_at,
      }, true)
      balance += mutation.amountCredits
      if (!Number.isSafeInteger(balance) || balance < 0 || balance !== Number(row.balance_after_credits)) {
        throw new MutationFailure(503, 'legacy-ledger-reconciliation-required')
      }
      const digest = await semanticDigest(mutation)
      if (row.semantic_digest && row.semantic_digest !== digest) {
        throw new MutationFailure(503, 'legacy-ledger-reconciliation-required')
      }
      events.push(Object.freeze({
        ...mutation, semanticDigest: digest, balanceAfterCredits: balance, authorityVersion: index + 1,
      }))
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO account_state (singleton, user_id, balance_credits, authority_version, bootstrapped_at) VALUES (1, ?, ?, ?, ?)',
        userId, balance, events.length, new Date().toISOString(),
      )
      for (const event of events) this.insertLocal(event)
    })
  }

  private mutate(mutation: Mutation, digest: string): { event: LedgerEvent; replay: boolean } {
    return this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql.exec<LocalEventRow>(
        'SELECT * FROM ledger_events WHERE idempotency_key = ?', mutation.idempotencyKey,
      ).toArray()[0]
      if (existing) {
        if (existing.semantic_digest !== digest) throw new MutationFailure(409, 'idempotency-conflict')
        return { event: localRowToEvent(existing), replay: true }
      }
      const reusedEffect = this.ctx.storage.sql.exec<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM ledger_events
         WHERE id = ? OR (user_id = ? AND event_type = ? AND related_object_type = ? AND related_object_id = ?)
           OR (? IS NOT NULL AND provider_event_id = ?)
         LIMIT 1`,
        mutation.id, mutation.userId, mutation.eventType, mutation.relatedObjectType,
        mutation.relatedObjectId, mutation.providerEventId, mutation.providerEventId,
      ).toArray()[0]
      if (reusedEffect) throw new MutationFailure(409, 'ledger-effect-conflict')
      const account = this.account(mutation.userId)
      const balance = account.balance_credits + mutation.amountCredits
      const version = account.authority_version + 1
      if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(version)) {
        throw new MutationFailure(balance < 0 ? 402 : 409, balance < 0 ? 'insufficient-balance' : 'ledger-range-conflict')
      }
      const event = Object.freeze({
        ...mutation, semanticDigest: digest, balanceAfterCredits: balance, authorityVersion: version,
      })
      this.insertLocal(event)
      this.ctx.storage.sql.exec(
        'UPDATE account_state SET balance_credits = ?, authority_version = ? WHERE singleton = 1', balance, version,
      )
      return { event, replay: false }
    })
  }

  private insertLocal(event: LedgerEvent): void {
    this.ctx.storage.sql.exec(`
      INSERT INTO ledger_events (
        id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        semantic_digest, metadata_json, created_at, authority_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, event.id, event.userId, event.eventType, event.amountCredits, event.balanceAfterCredits,
    event.relatedObjectType, event.relatedObjectId, event.providerEventId, event.idempotencyKey,
    event.semanticDigest, event.metadataJson, event.createdAt, event.authorityVersion)
  }

  private async claimProviderEffect(mutation: Mutation, digest: string): Promise<void> {
    if (mutation.eventType !== 'purchase_credit' || !mutation.providerEventId) return
    const db = this.db()
    await execute(db, `
      INSERT OR IGNORE INTO strytree_provider_effect_claims (
        provider_event_id, payment_session_id, user_id, idempotency_key,
        semantic_digest, state, claimed_at, applied_event_id
      ) VALUES (?, ?, ?, ?, ?, 'claimed', ?, NULL)
    `, [mutation.providerEventId, mutation.relatedObjectId, mutation.userId,
      mutation.idempotencyKey, digest, new Date().toISOString()])
    const claims = await queryAll<{
      provider_event_id: string
      payment_session_id: string
      user_id: string
      idempotency_key: string
      semantic_digest: string
    }>(db, `
      SELECT provider_event_id, payment_session_id, user_id, idempotency_key, semantic_digest
      FROM strytree_provider_effect_claims
      WHERE provider_event_id = ? OR payment_session_id = ?
    `, [mutation.providerEventId, mutation.relatedObjectId])
    if (claims.length === 1 && claims[0].idempotency_key === mutation.idempotencyKey
      && claims[0].semantic_digest !== digest) {
      throw new MutationFailure(409, 'idempotency-conflict')
    }
    if (claims.length !== 1 || claims[0].provider_event_id !== mutation.providerEventId
      || claims[0].payment_session_id !== mutation.relatedObjectId || claims[0].user_id !== mutation.userId
      || claims[0].idempotency_key !== mutation.idempotencyKey || claims[0].semantic_digest !== digest) {
      throw new MutationFailure(409, 'provider-effect-conflict')
    }
  }

  private async project(event: LedgerEvent): Promise<void> {
    const db = this.db()
    await execute(db, `
      INSERT OR IGNORE INTO strytree_token_ledger (
        id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        metadata_json, created_at, semantic_digest, authority_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [event.id, event.userId, event.eventType, event.amountCredits, event.balanceAfterCredits,
      event.relatedObjectType, event.relatedObjectId, event.providerEventId, event.idempotencyKey,
      event.metadataJson, event.createdAt, event.semanticDigest, event.authorityVersion])
    let projected = await queryFirst<D1LedgerRow>(db, `
      SELECT id, user_id, event_type, amount_credits, balance_after_credits,
        related_object_type, related_object_id, provider_event_id, idempotency_key,
        metadata_json, created_at, semantic_digest, authority_version
      FROM strytree_token_ledger WHERE user_id = ? AND idempotency_key = ? LIMIT 1
    `, [event.userId, event.idempotencyKey])
    if (projected && projected.semantic_digest == null && projected.authority_version == null
      && this.sameProjection(projected, event)) {
      await execute(db, `
        UPDATE strytree_token_ledger
        SET semantic_digest = ?, authority_version = ?, metadata_json = ?
        WHERE id = ? AND user_id = ? AND idempotency_key = ?
          AND semantic_digest IS NULL AND authority_version IS NULL
      `, [event.semanticDigest, event.authorityVersion, event.metadataJson,
        event.id, event.userId, event.idempotencyKey])
      projected = await queryFirst<D1LedgerRow>(db, `
        SELECT id, user_id, event_type, amount_credits, balance_after_credits,
          related_object_type, related_object_id, provider_event_id, idempotency_key,
          metadata_json, created_at, semantic_digest, authority_version
        FROM strytree_token_ledger WHERE user_id = ? AND idempotency_key = ? LIMIT 1
      `, [event.userId, event.idempotencyKey])
    }
    if (!projected || projected.id !== event.id || projected.semantic_digest !== event.semanticDigest
      || Number(projected.balance_after_credits) !== event.balanceAfterCredits
      || Number(projected.authority_version) !== event.authorityVersion) {
      throw new MutationFailure(503, 'ledger-projection-unavailable')
    }
    if (event.eventType === 'purchase_credit' && event.providerEventId) {
      await execute(db, `
        UPDATE strytree_provider_effect_claims SET state = 'applied', applied_event_id = ?
        WHERE provider_event_id = ? AND semantic_digest = ?
      `, [event.id, event.providerEventId, event.semanticDigest])
    }
  }

  private sameProjection(row: D1LedgerRow, event: LedgerEvent): boolean {
    try {
      return row.id === event.id && row.user_id === event.userId && row.event_type === event.eventType
        && Number(row.amount_credits) === event.amountCredits
        && Number(row.balance_after_credits) === event.balanceAfterCredits
        && row.related_object_type === event.relatedObjectType && row.related_object_id === event.relatedObjectId
        && row.provider_event_id === event.providerEventId && row.idempotency_key === event.idempotencyKey
        && normalizeMetadata(row.metadata_json || '{}') === event.metadataJson && row.created_at === event.createdAt
    } catch {
      return false
    }
  }

  private db(): D1DatabaseLike {
    const db = readDb(this.env)
    if (!db) throw new MutationFailure(503, 'ledger-projection-unavailable')
    return db
  }
}
