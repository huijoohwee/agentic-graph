import { json, type HeadersRecord } from '../agenticCommerceHttp'
import { readBoundedJson } from './boundedJson'

export const NET_SETTLEMENT_PATH = '/v1/net-settlements'
export const PAYMENT_LIVE_PATH = '/livez'
export const PAYMENT_READY_PATH = '/readyz'

const MAX_REQUEST_BYTES = 16 * 1024
const MAX_READINESS_RESPONSE_BYTES = 16 * 1024
const READINESS_TIMEOUT_MS = 9_000
const COMPONENT = 'Issuance_Service'
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
// Keep the settlement boundary aligned with the graph's collision-free encoded
// cascade identifier. Encoded tuples begin with `~` and can exceed the legacy
// three-identifier concatenation length.
const CASCADE_ID_PATTERN = /^(?:[A-Za-z0-9]|~)[A-Za-z0-9._:~-]{0,510}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/

export type NetSettlementRequest = Readonly<{
  operation: 'settleNet'
  cascadeId: string
  bundleId: string
  principalId: string
  amountMinor: number
  currency: string
  caller: 'Issuance_Service'
}>

export type NetSettlementStoreResult =
  | Readonly<{
      ok: true
      idempotencyKey: string
      settlementId: string
      idempotentReplay: boolean
      amountMinor: number
      currency: string
      recordedAt: string
      effect: 'charged' | 'refunded'
      providerReference: string
    }>
  | Readonly<{
      ok: false
      code: 'idempotency-conflict' | 'settlement-effect-rejected' | 'settlement-effect-unavailable'
      idempotencyKey: string
      providerStatus?: number
      definitive?: true
      effectApplied?: false
    }>

type SettlementRow = {
  request_digest: string
  settlement_id: string | null
  amount_minor: number
  currency: string
  recorded_at: string | null
  effect: string | null
  provider_reference: string | null
  state: 'pending' | 'succeeded' | 'rejected'
  provider_status: number | null
}

type NetSettlementStoreStub = {
  fetch(request: Request): Promise<Response>
}

type NetSettlementSqlCursor<T> = {
  toArray(): T[]
}

type NetSettlementDurableObjectState = {
  storage: {
    sql: {
      exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): NetSettlementSqlCursor<T>
    }
    transactionSync<T>(callback: () => T): T
  }
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
}

export type NetSettlementWorkerEnv = Record<string, unknown> & {
  NET_SETTLEMENT_STORE?: {
    getByName(name: string): NetSettlementStoreStub
  }
  /**
   * Provider-backed Issuance Service adapter. It must apply the signed value
   * effect idempotently under the caller-supplied key and return a definitive
   * charged/refunded receipt. A journal is never accepted as proof of effect.
   */
  NET_SETTLEMENT_EXECUTOR?: NetSettlementStoreStub
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

const parseRequest = (value: unknown): NetSettlementRequest | null => {
  if (!isRecord(value)) return null
  const allowed = new Set([
    'operation', 'cascadeId', 'bundleId', 'principalId', 'amountMinor', 'currency', 'caller',
  ])
  if (Object.keys(value).some((key) => !allowed.has(key))) return null
  if (
    value.operation !== 'settleNet'
    || typeof value.cascadeId !== 'string'
    || !CASCADE_ID_PATTERN.test(value.cascadeId)
    || !isIdentifier(value.bundleId)
    || !isIdentifier(value.principalId)
    || typeof value.amountMinor !== 'number'
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor === 0
    || typeof value.currency !== 'string'
    || !CURRENCY_PATTERN.test(value.currency)
    || value.caller !== COMPONENT
  ) return null
  return Object.freeze({
    operation: 'settleNet',
    cascadeId: value.cascadeId,
    bundleId: value.bundleId,
    principalId: value.principalId,
    amountMinor: value.amountMinor,
    currency: value.currency,
    caller: COMPONENT,
  })
}

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const semanticPayload = (request: NetSettlementRequest): string => JSON.stringify({
  amountMinor: request.amountMinor,
  bundleId: request.bundleId,
  caller: request.caller,
  cascadeId: request.cascadeId,
  currency: request.currency,
  operation: request.operation,
  principalId: request.principalId,
})

export class NetSettlementStore {
  private readonly ctx: NetSettlementDurableObjectState
  private readonly executor: NetSettlementStoreStub | undefined
  private readonly inFlight = new Map<string, Promise<NetSettlementStoreResult>>()

  constructor(ctx: NetSettlementDurableObjectState, env: NetSettlementWorkerEnv) {
    this.ctx = ctx
    this.executor = env.NET_SETTLEMENT_EXECUTOR
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS net_settlement_effects (
          idempotency_key TEXT PRIMARY KEY,
          request_digest TEXT NOT NULL,
          settlement_id TEXT UNIQUE,
          cascade_id TEXT NOT NULL,
          bundle_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          amount_minor INTEGER NOT NULL CHECK (amount_minor != 0),
          currency TEXT NOT NULL,
          caller TEXT NOT NULL CHECK (caller = 'Issuance_Service'),
          state TEXT NOT NULL CHECK (state IN ('pending', 'succeeded', 'rejected')),
          effect TEXT CHECK (effect IN ('charged', 'refunded')),
          provider_reference TEXT,
          provider_status INTEGER,
          recorded_at TEXT,
          updated_at TEXT NOT NULL
        );
      `)
    })
  }

  private ready(): Readonly<{ ok: true; storage: 'sqlite'; contract: 'agenticgraph.net-settlement/v1' }> {
    this.ctx.storage.sql.exec('SELECT idempotency_key FROM net_settlement_effects LIMIT 1').toArray()
    return Object.freeze({ ok: true, storage: 'sqlite', contract: 'agenticgraph.net-settlement/v1' })
  }

  private readRow(idempotencyKey: string): SettlementRow | undefined {
    return this.ctx.storage.sql.exec<SettlementRow>(
      `SELECT request_digest, settlement_id, amount_minor, currency, recorded_at,
              effect, provider_reference, state, provider_status
       FROM net_settlement_effects WHERE idempotency_key = ?`,
      idempotencyKey,
    ).toArray()[0]
  }

  private succeededResult(request: NetSettlementRequest, row: SettlementRow, replay: boolean): NetSettlementStoreResult {
    if (
      row.state !== 'succeeded'
      || !row.settlement_id
      || !row.recorded_at
      || !row.provider_reference
      || (row.effect !== 'charged' && row.effect !== 'refunded')
    ) return Object.freeze({
      ok: false as const,
      code: 'settlement-effect-unavailable' as const,
      idempotencyKey: request.cascadeId,
    })
    return Object.freeze({
      ok: true as const,
      idempotencyKey: request.cascadeId,
      settlementId: row.settlement_id,
      idempotentReplay: replay,
      amountMinor: row.amount_minor,
      currency: row.currency,
      recordedAt: row.recorded_at,
      effect: row.effect,
      providerReference: row.provider_reference,
    })
  }

  private async executeEffect(
    request: NetSettlementRequest,
    requestDigest: string,
  ): Promise<NetSettlementStoreResult> {
    if (!this.executor) return Object.freeze({
      ok: false as const,
      code: 'settlement-effect-unavailable' as const,
      idempotencyKey: request.cascadeId,
    })
    let response: Response
    try {
      response = await this.executor.fetch(new Request('https://net-settlement-executor.internal/v1/net-settlements', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': request.cascadeId,
          'x-agenticgraph-component': COMPONENT,
        },
        body: JSON.stringify(request),
      }))
    } catch {
      return Object.freeze({
        ok: false as const,
        code: 'settlement-effect-unavailable' as const,
        idempotencyKey: request.cascadeId,
      })
    }
    let value: unknown
    try {
      value = await readBoundedJson(response, MAX_REQUEST_BYTES)
    } catch {
      value = null
    }
    if (!response.ok) {
      const semanticConflict = response.status === 409
        && isRecord(value)
        && value.ok === false
        && value.code === 'idempotency-conflict'
        && value.idempotencyKey === request.cascadeId
      if (semanticConflict) return Object.freeze({
        ok: false as const,
        code: 'idempotency-conflict' as const,
        idempotencyKey: request.cascadeId,
        providerStatus: response.status,
      })
      const retryable = response.status === 408 || response.status === 409
        || response.status === 429 || response.status >= 500
      const definitivePreEffect = !retryable
        && isRecord(value)
        && value.ok === false
        && value.definitive === true
        && value.effectApplied === false
        && value.idempotencyKey === request.cascadeId
      if (definitivePreEffect) {
        this.ctx.storage.sql.exec(
          `UPDATE net_settlement_effects
           SET state = 'rejected', provider_status = ?, updated_at = ?
           WHERE idempotency_key = ? AND request_digest = ? AND state = 'pending'`,
          response.status, new Date().toISOString(), request.cascadeId, requestDigest,
        )
      }
      return Object.freeze({
        ok: false as const,
        code: definitivePreEffect
          ? 'settlement-effect-rejected' as const
          : 'settlement-effect-unavailable' as const,
        idempotencyKey: request.cascadeId,
        providerStatus: response.status,
        ...(definitivePreEffect ? { definitive: true as const, effectApplied: false as const } : {}),
      })
    }
    if (!isRecord(value)) return Object.freeze({
      ok: false as const,
      code: 'settlement-effect-unavailable' as const,
      idempotencyKey: request.cascadeId,
    })
    const expectedEffect = request.amountMinor > 0 ? 'charged' : 'refunded'
    if (
      value.ok !== true
      || value.idempotencyKey !== request.cascadeId
      || value.amountMinor !== request.amountMinor
      || value.currency !== request.currency
      || value.effect !== expectedEffect
      || typeof value.settlementId !== 'string'
      || !isIdentifier(value.settlementId)
      || typeof value.providerReference !== 'string'
      || !isIdentifier(value.providerReference)
    ) return Object.freeze({
      ok: false as const,
      code: 'settlement-effect-unavailable' as const,
      idempotencyKey: request.cascadeId,
    })
    const recordedAt = new Date().toISOString()
    this.ctx.storage.sql.exec(
      `UPDATE net_settlement_effects
       SET state = 'succeeded', settlement_id = ?, effect = ?, provider_reference = ?,
           provider_status = ?, recorded_at = ?, updated_at = ?
       WHERE idempotency_key = ? AND request_digest = ? AND state = 'pending'`,
      value.settlementId, value.effect, value.providerReference, response.status,
      recordedAt, recordedAt, request.cascadeId, requestDigest,
    )
    const persisted = this.readRow(request.cascadeId)
    return persisted
      ? this.succeededResult(request, persisted, false)
      : Object.freeze({
          ok: false as const,
          code: 'settlement-effect-unavailable' as const,
          idempotencyKey: request.cascadeId,
        })
  }

  private async settle(value: unknown): Promise<NetSettlementStoreResult> {
    const request = parseRequest(value)
    if (!request) throw new TypeError('invalid net settlement request')
    const requestDigest = await sha256(semanticPayload(request))
    const prepared = this.ctx.storage.transactionSync(() => {
      const existing = this.readRow(request.cascadeId)
      if (existing) {
        if (existing.request_digest !== requestDigest) {
          return Object.freeze({
            ok: false as const,
            code: 'idempotency-conflict' as const,
            idempotencyKey: request.cascadeId,
          })
        }
        if (existing.state === 'succeeded') return this.succeededResult(request, existing, true)
        if (existing.state === 'rejected') return Object.freeze({
          ok: false as const,
          code: 'settlement-effect-rejected' as const,
          idempotencyKey: request.cascadeId,
          definitive: true as const,
          effectApplied: false as const,
          ...(existing.provider_status == null ? {} : { providerStatus: existing.provider_status }),
        })
        return null
      }
      const now = new Date().toISOString()
      this.ctx.storage.sql.exec(
        `INSERT INTO net_settlement_effects (
          idempotency_key, request_digest, cascade_id, bundle_id, principal_id,
          amount_minor, currency, caller, state, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        request.cascadeId, requestDigest, request.cascadeId, request.bundleId,
        request.principalId, request.amountMinor, request.currency, request.caller, now,
      )
      return null
    })
    if (prepared) return prepared
    const existingFlight = this.inFlight.get(request.cascadeId)
    if (existingFlight) {
      const result = await existingFlight
      return result.ok ? Object.freeze({ ...result, idempotentReplay: true }) : result
    }
    const flight = this.executeEffect(request, requestDigest)
    this.inFlight.set(request.cascadeId, flight)
    try {
      return await flight
    } finally {
      if (this.inFlight.get(request.cascadeId) === flight) this.inFlight.delete(request.cascadeId)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (request.method === 'GET' && pathname === '/readyz') return json(200, this.ready(), {})
    if (request.method !== 'POST' || pathname !== '/settle') {
      return json(404, { ok: false, code: 'net-settlement-store-route-not-found' }, {})
    }
    const value = await readBoundedJson(request, MAX_REQUEST_BYTES)
    const settlement = parseRequest(value)
    if (!settlement) return json(400, { ok: false, code: 'net-settlement-invalid' }, {})
    const result = await this.settle(settlement)
    const status = result.ok === true
      ? 200
      : result.code === 'idempotency-conflict'
        ? 409
        : result.code === 'settlement-effect-rejected'
          ? 422
          : 503
    return json(status, result, {})
  }
}

const readiness = async (
  env: NetSettlementWorkerEnv,
  headers: HeadersRecord,
): Promise<Response> => {
  const missing = [
    ...(!env.NET_SETTLEMENT_STORE ? ['NET_SETTLEMENT_STORE'] : []),
    ...(!env.NET_SETTLEMENT_EXECUTOR ? ['NET_SETTLEMENT_EXECUTOR'] : []),
  ]
  if (missing.length > 0) {
    return json(503, {
      ok: false,
      service: 'agenticgraph-payment',
      code: 'configuration-missing',
      fields: missing,
      dependencies: {
        netSettlementStore: env.NET_SETTLEMENT_STORE ? 'configured' : 'missing',
        netSettlementExecutor: env.NET_SETTLEMENT_EXECUTOR ? 'configured' : 'missing',
      },
    }, headers)
  }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const dependencies = Promise.all([
      env.NET_SETTLEMENT_STORE!.getByName('readiness').fetch(new Request(
        'https://net-settlement-store.internal/readyz', { signal: controller.signal },
      )),
      env.NET_SETTLEMENT_EXECUTOR!.fetch(new Request(
        'https://net-settlement-executor.internal/readyz', { signal: controller.signal },
      )),
    ]).then(async ([storeResponse, executorResponse]) => {
      const [storeResult, executorResult] = await Promise.all([
        readBoundedJson(storeResponse, MAX_READINESS_RESPONSE_BYTES),
        readBoundedJson(executorResponse, MAX_READINESS_RESPONSE_BYTES),
      ])
      return { storeResponse, executorResponse, storeResult, executorResult }
    })
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort('payment-readiness-deadline')
        reject(new Error('payment readiness deadline exceeded'))
      }, READINESS_TIMEOUT_MS)
    })
    const { storeResponse, executorResponse, storeResult, executorResult } = await Promise.race([
      dependencies,
      timeout,
    ])
    if (!storeResponse.ok || !executorResponse.ok || !isRecord(storeResult) || !isRecord(executorResult)) {
      throw new Error('net settlement dependency is not ready')
    }
    if (storeResult.storage !== 'sqlite' || storeResult.contract !== 'agenticgraph.net-settlement/v1') {
      throw new Error('net settlement store readiness response is malformed')
    }
    if (
      executorResult.contract !== 'agenticgraph.net-settlement-effect/v1'
      || executorResult.providerBacked !== true
      || executorResult.capability !== 'settleNet'
    ) throw new Error('net settlement executor readiness response is malformed')
    return json(200, {
      ok: true,
      service: 'agenticgraph-payment',
      dependencies: { netSettlementStore: storeResult.storage, netSettlementExecutor: 'provider-backed' },
      contracts: [storeResult.contract, executorResult.contract],
    }, headers)
  } catch {
    return json(503, {
      ok: false,
      service: 'agenticgraph-payment',
      code: 'dependency-unavailable',
      dependencies: { netSettlementStore: 'unavailable', netSettlementExecutor: 'unavailable' },
    }, headers)
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export const handleNetSettlementRoute = async (
  request: Request,
  env: NetSettlementWorkerEnv,
  headers: HeadersRecord,
): Promise<Response | null> => {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
  if (pathname === PAYMENT_LIVE_PATH) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(405, { ok: false, code: 'method-not-allowed' }, { ...headers, allow: 'GET, HEAD' })
    }
    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers: { ...headers, 'cache-control': 'no-store' } })
      : json(200, { ok: true, service: 'agenticgraph-payment', status: 'live' }, headers)
  }
  if (pathname === PAYMENT_READY_PATH) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(405, { ok: false, code: 'method-not-allowed' }, { ...headers, allow: 'GET, HEAD' })
    }
    const response = await readiness(env, headers)
    return request.method === 'HEAD'
      ? new Response(null, { status: response.status, headers: response.headers })
      : response
  }
  if (pathname !== NET_SETTLEMENT_PATH) return null
  if (request.method !== 'POST') {
    return json(405, { ok: false, code: 'method-not-allowed' }, { ...headers, allow: 'POST' })
  }
  if (request.headers.get('x-agenticgraph-component') !== COMPONENT) {
    return json(403, { ok: false, code: 'unauthorized-payment-caller' }, headers)
  }
  const value = await readBoundedJson(request, MAX_REQUEST_BYTES)
  const settlement = parseRequest(value)
  if (!settlement) {
    return json(400, { ok: false, code: 'net-settlement-invalid' }, headers)
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (idempotencyKey !== settlement.cascadeId) {
    return json(400, { ok: false, code: 'idempotency-key-mismatch' }, headers)
  }
  const settlementStore = env.NET_SETTLEMENT_STORE
  const missing = [
    ...(!settlementStore ? ['NET_SETTLEMENT_STORE'] : []),
    ...(!env.NET_SETTLEMENT_EXECUTOR ? ['NET_SETTLEMENT_EXECUTOR'] : []),
  ]
  if (!settlementStore || !env.NET_SETTLEMENT_EXECUTOR) {
    return json(503, { ok: false, code: 'configuration-missing', fields: missing }, headers)
  }
  try {
    const response = await settlementStore.getByName(settlement.cascadeId).fetch(new Request(
      'https://net-settlement-store.internal/settle',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settlement),
      },
    ))
    const result = await readBoundedJson(response, MAX_REQUEST_BYTES) as NetSettlementStoreResult | null
    if (!result || typeof result !== 'object') throw new Error('net settlement store response is malformed')
    if (response.status === 200 && result.ok) return json(200, result, headers)
    if (result.ok === false) {
      if (response.status === 409 && result.code === 'idempotency-conflict') return json(409, result, headers)
      if (response.status === 422 && result.code === 'settlement-effect-rejected') return json(422, result, headers)
      if (response.status === 503 && result.code === 'settlement-effect-unavailable') return json(503, result, headers)
    }
    throw new Error('net settlement store response is malformed')
  } catch {
    return json(503, { ok: false, code: 'net-settlement-store-unavailable' }, headers)
  }
}
