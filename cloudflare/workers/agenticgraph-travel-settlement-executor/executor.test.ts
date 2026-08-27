import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { EFFECT_CONTRACT, ISSUANCE_COMPONENT, type NetSettlementRequest } from './contract'
import { createSettlementExecutor } from './index'
import type { SettlementExecutorRuntimeEnv, UpstreamFetch } from './upstream'

const AUTH_TOKEN = 'operator-secret-token-for-tests'
const BASE_URL = 'https://issuance.provider.test'

const env = Object.freeze({
  ISSUANCE_SERVICE_BASE_URL: BASE_URL,
  ISSUANCE_SERVICE_TIMEOUT_MS: '250',
  ISSUANCE_SERVICE_AUTH_TOKEN: AUTH_TOKEN,
}) as SettlementExecutorRuntimeEnv

const charge = Object.freeze({
  operation: 'settleNet',
  cascadeId: 'bundle-1:flight:event-1',
  bundleId: 'bundle-1',
  principalId: 'principal-1',
  amountMinor: 125,
  currency: 'SGD',
  caller: ISSUANCE_COMPONENT,
}) satisfies NetSettlementRequest

const effectReceipt = (request: NetSettlementRequest) => ({
  ok: true,
  contract: EFFECT_CONTRACT,
  providerBacked: true,
  idempotencyKey: request.cascadeId,
  cascadeId: request.cascadeId,
  bundleId: request.bundleId,
  principalId: request.principalId,
  amountMinor: request.amountMinor,
  currency: request.currency,
  effect: request.amountMinor > 0 ? 'charged' : 'refunded',
  settlementId: `settlement_${request.bundleId}`,
  providerReference: `effect_${request.bundleId}`,
})

const readinessReceipt = () => ({
  ok: true,
  contract: EFFECT_CONTRACT,
  providerBacked: true,
  capability: 'settleNet',
  authenticated: true,
  providerId: 'operator-issuance-provider',
})

const settlementRequest = (payload: NetSettlementRequest = charge): Request => new Request(
  'https://net-settlement-executor.internal/v1/net-settlements',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': payload.cascadeId,
      'x-agenticgraph-component': ISSUANCE_COMPONENT,
    },
    body: JSON.stringify(payload),
  },
)

const parse = async (response: Response): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json()
  assert(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

describe('provider-backed net settlement executor', () => {
  it('forwards the exact positive charge envelope, idempotency key, caller, and secret auth', async () => {
    const calls: Array<{ url: string; headers: Headers; body: string }> = []
    const fetchUpstream: UpstreamFetch = async (request) => {
      const body = await request.text()
      calls.push({ url: request.url, headers: new Headers(request.headers), body })
      return Response.json(effectReceipt(JSON.parse(body) as NetSettlementRequest))
    }
    const response = await createSettlementExecutor(fetchUpstream).fetch(settlementRequest(), env)
    assert.equal(response.status, 200)
    assert.deepEqual(await parse(response), effectReceipt(charge))
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, `${BASE_URL}/v1/net-settlements`)
    assert.equal(calls[0]?.headers.get('authorization'), `Bearer ${AUTH_TOKEN}`)
    assert.equal(calls[0]?.headers.get('idempotency-key'), charge.cascadeId)
    assert.equal(calls[0]?.headers.get('x-agenticgraph-component'), ISSUANCE_COMPONENT)
    assert.equal(calls[0]?.body, JSON.stringify(charge))
    assert.equal(JSON.stringify(await parse(Response.json(effectReceipt(charge)))).includes(AUTH_TOKEN), false)
  })

  it('requires a matching refunded receipt for a negative signed amount', async () => {
    const refund = Object.freeze({ ...charge, cascadeId: `${charge.cascadeId}:refund`, amountMinor: -25 })
    const fetchUpstream: UpstreamFetch = async () => Response.json(effectReceipt(refund))
    const response = await createSettlementExecutor(fetchUpstream).fetch(settlementRequest(refund), env)
    assert.equal(response.status, 200)
    assert.deepEqual(await parse(response), effectReceipt(refund))

    const wrongSign: UpstreamFetch = async () => Response.json({ ...effectReceipt(refund), effect: 'charged' })
    const rejected = await createSettlementExecutor(wrongSign).fetch(settlementRequest(refund), env)
    assert.equal(rejected.status, 503)
    assert.deepEqual(await parse(rejected), {
      ok: false,
      code: 'settlement-effect-unavailable',
      idempotencyKey: refund.cascadeId,
    })
  })

  it('preserves replay identity and returns the same provider effect receipt', async () => {
    const bodies: string[] = []
    const keys: string[] = []
    const fetchUpstream: UpstreamFetch = async (request) => {
      bodies.push(await request.text())
      keys.push(request.headers.get('idempotency-key') ?? '')
      return Response.json(effectReceipt(charge))
    }
    const worker = createSettlementExecutor(fetchUpstream)
    const first = await worker.fetch(settlementRequest(), env)
    const replay = await worker.fetch(settlementRequest(), env)
    assert.equal(first.status, 200)
    assert.equal(replay.status, 200)
    assert.deepEqual(await parse(first), await parse(replay))
    assert.deepEqual(keys, [charge.cascadeId, charge.cascadeId])
    assert.deepEqual(bodies, [JSON.stringify(charge), JSON.stringify(charge)])
  })

  it('maps journal-only, malformed, and mismatched-ID success responses to retryable 503', async () => {
    const responses = [
      { ok: true, idempotencyKey: charge.cascadeId, settlementId: 'journal-only' },
      { ...effectReceipt(charge), providerBacked: false },
      { ...effectReceipt(charge), principalId: 'different-principal' },
      { ...effectReceipt(charge), amountMinor: -charge.amountMinor },
    ]
    for (const providerBody of responses) {
      const fetchUpstream: UpstreamFetch = async () => Response.json(providerBody)
      const response = await createSettlementExecutor(fetchUpstream).fetch(settlementRequest(), env)
      assert.equal(response.status, 503)
      assert.deepEqual(await parse(response), {
        ok: false,
        code: 'settlement-effect-unavailable',
        idempotencyKey: charge.cascadeId,
      })
    }
  })

  it('rejects non-canonical or duplicate-key envelopes before they reach the provider', async () => {
    let calls = 0
    const fetchUpstream: UpstreamFetch = async () => {
      calls += 1
      return Response.json(effectReceipt(charge))
    }
    const duplicateAmount = JSON.stringify(charge).replace('"amountMinor":125', '"amountMinor":1,"amountMinor":125')
    const response = await createSettlementExecutor(fetchUpstream).fetch(new Request(
      'https://net-settlement-executor.internal/v1/net-settlements',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': charge.cascadeId,
          'x-agenticgraph-component': ISSUANCE_COMPONENT,
        },
        body: duplicateAmount,
      },
    ), env)
    assert.equal(response.status, 400)
    assert.equal(calls, 0)
  })

  it('passes through only the exact typed semantic 409 conflict', async () => {
    const exactConflict = {
      ok: false,
      contract: EFFECT_CONTRACT,
      code: 'idempotency-conflict',
      idempotencyKey: charge.cascadeId,
      definitive: true,
      effectApplied: false,
    }
    const typed: UpstreamFetch = async () => Response.json(exactConflict, { status: 409 })
    const response = await createSettlementExecutor(typed).fetch(settlementRequest(), env)
    assert.equal(response.status, 409)
    assert.deepEqual(await parse(response), {
      ok: false,
      code: 'idempotency-conflict',
      idempotencyKey: charge.cascadeId,
    })

    const malformed: UpstreamFetch = async () => Response.json({ ...exactConflict, definitive: false }, { status: 409 })
    const ambiguous = await createSettlementExecutor(malformed).fetch(settlementRequest(), env)
    assert.equal(ambiguous.status, 503)
    assert.deepEqual(await parse(ambiguous), {
      ok: false,
      code: 'settlement-effect-unavailable',
      idempotencyKey: charge.cascadeId,
    })
  })

  it('passes through only a strict definitive pre-effect 422 rejection', async () => {
    const exactRejection = {
      ok: false,
      contract: EFFECT_CONTRACT,
      code: 'settlement-effect-rejected',
      idempotencyKey: charge.cascadeId,
      definitive: true,
      effectApplied: false,
    }
    const typed: UpstreamFetch = async () => Response.json(exactRejection, { status: 422 })
    const response = await createSettlementExecutor(typed).fetch(settlementRequest(), env)
    assert.equal(response.status, 422)
    assert.deepEqual(await parse(response), {
      ok: false,
      code: 'settlement-effect-rejected',
      idempotencyKey: charge.cascadeId,
      definitive: true,
      effectApplied: false,
    })

    for (const providerResponse of [
      Response.json({ ...exactRejection, effectApplied: true }, { status: 422 }),
      Response.json(exactRejection, { status: 400 }),
    ]) {
      const ambiguous = await createSettlementExecutor(async () => providerResponse.clone())
        .fetch(settlementRequest(), env)
      assert.equal(ambiguous.status, 503)
    }
  })

  it('keeps liveness non-secret and gates readiness on exact authenticated provider capability', async () => {
    let calls = 0
    const readyFetch: UpstreamFetch = async (request) => {
      calls += 1
      assert.equal(request.url, `${BASE_URL}/readyz`)
      assert.equal(request.headers.get('authorization'), `Bearer ${AUTH_TOKEN}`)
      return Response.json(readinessReceipt())
    }
    const worker = createSettlementExecutor(readyFetch)
    const live = await worker.fetch(new Request('https://internal/livez'), env)
    assert.equal(live.status, 200)
    assert.equal(calls, 0)
    assert.equal(JSON.stringify(await parse(live)).includes(AUTH_TOKEN), false)

    const ready = await worker.fetch(new Request('https://internal/readyz'), env)
    assert.equal(ready.status, 200)
    assert.deepEqual(await parse(ready), {
      ok: true,
      service: 'agenticgraph-travel-settlement-executor',
      contract: EFFECT_CONTRACT,
      providerBacked: true,
      capability: 'settleNet',
    })

    const malformed: UpstreamFetch = async () => Response.json({ ...readinessReceipt(), authenticated: false })
    assert.equal((await createSettlementExecutor(malformed).fetch(new Request('https://internal/readyz'), env)).status, 503)
  })

  it('returns 503 for bad credentials, unavailable providers, malformed bodies, and deadlines', async () => {
    const badCredentials: UpstreamFetch = async (request) => request.headers.get('authorization') === `Bearer ${AUTH_TOKEN}`
      ? Response.json({ ok: false, code: 'bad-credentials' }, { status: 401 })
      : Response.json(readinessReceipt())
    assert.equal((await createSettlementExecutor(badCredentials)
      .fetch(new Request('https://internal/readyz'), env)).status, 503)

    const unavailable: UpstreamFetch = async () => { throw new Error('provider unavailable') }
    assert.equal((await createSettlementExecutor(unavailable)
      .fetch(new Request('https://internal/readyz'), env)).status, 503)
    assert.equal((await createSettlementExecutor(unavailable)
      .fetch(settlementRequest(), env)).status, 503)

    const malformed: UpstreamFetch = async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
    assert.equal((await createSettlementExecutor(malformed).fetch(settlementRequest(), env)).status, 503)

    const deadlineEnv = { ...env, ISSUANCE_SERVICE_TIMEOUT_MS: '100' } as SettlementExecutorRuntimeEnv
    const deadline: UpstreamFetch = () => new Promise<Response>(() => undefined)
    const deadlineStartedAt = Date.now()
    assert.equal((await createSettlementExecutor(deadline).fetch(settlementRequest(), deadlineEnv)).status, 503)
    assert.ok(Date.now() - deadlineStartedAt < 1_000, 'deadline must not depend on upstream abort cooperation')

    const slowBody: UpstreamFetch = async (request) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        request.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), {
          once: true,
        })
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
    assert.equal((await createSettlementExecutor(slowBody).fetch(settlementRequest(), deadlineEnv)).status, 503)
  })
})
