import { reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'

// This contract suite requires the Cloudflare Workers Vitest pool.

import { createNetSettlementWorker } from '../netSettlementWorker'
import type { NetSettlementWorkerEnv } from '../travelAgency/netSettlement'

const runtimeEnv = env as unknown as NetSettlementWorkerEnv
const worker = createNetSettlementWorker()
const payload = Object.freeze({
  operation: 'settleNet',
  cascadeId: 'bundle-1:flight:event-1',
  bundleId: 'bundle-1',
  principalId: 'principal-1',
  amountMinor: 125,
  currency: 'SGD',
  caller: 'Issuance_Service',
})

afterEach(() => reset())

const settle = (body: unknown = payload, headers: Record<string, string> = {}) => worker.fetch(new Request(
  'https://issuance-service.internal/v1/net-settlements',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': payload.cascadeId,
      'x-knowgrph-component': 'Issuance_Service',
      ...headers,
    },
    body: JSON.stringify(body),
  },
), runtimeEnv)

const storeReadiness = Object.freeze({
  ok: true,
  storage: 'sqlite',
  contract: 'knowgrph.net-settlement/v1',
})

const executorReadiness = Object.freeze({
  ok: true,
  contract: 'knowgrph.net-settlement-effect/v1',
  providerBacked: true,
  capability: 'settleNet',
})

const readinessEnv = (
  storeFetch: (request: Request) => Promise<Response>,
  executorFetch: (request: Request) => Promise<Response>,
): NetSettlementWorkerEnv => ({
  ...runtimeEnv,
  NET_SETTLEMENT_STORE: { getByName: () => ({ fetch: storeFetch }) },
  NET_SETTLEMENT_EXECUTOR: { fetch: executorFetch },
})

const chunkedJson = (value: unknown, chunkBytes = 7): Response => {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let offset = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(offset + chunkBytes, bytes.byteLength)
      controller.enqueue(bytes.slice(offset, end))
      offset = end
    },
  }), { headers: { 'content-type': 'application/json; charset=utf-8' } })
}

describe('Issuance Service net-settlement provider contract', () => {
  it('exposes only the service-bound net-settlement contract', async () => {
    const response = await worker.fetch(new Request('https://internal/api/strytree/checkout/sessions', {
      method: 'POST',
    }), runtimeEnv)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'net-settlement-route-not-found' })
  })

  it('exposes non-secret liveness and verifies its SQLite dependency for readiness', async () => {
    expect((await worker.fetch(new Request('https://internal/livez'), runtimeEnv)).status).toBe(200)
    const ready = await worker.fetch(new Request('https://internal/readyz'), runtimeEnv)
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toMatchObject({
      ok: true,
      dependencies: {
        netSettlementStore: 'sqlite',
        netSettlementExecutor: 'provider-backed',
      },
    })
  })

  it('fails closed when no provider-backed settlement executor is configured', async () => {
    const unconfigured = { ...runtimeEnv, NET_SETTLEMENT_EXECUTOR: undefined }
    const ready = await worker.fetch(new Request('https://internal/readyz'), unconfigured)
    expect(ready.status).toBe(503)
    await expect(ready.json()).resolves.toMatchObject({
      ok: false,
      code: 'configuration-missing',
      fields: ['NET_SETTLEMENT_EXECUTOR'],
    })
    const response = await worker.fetch(new Request(
      'https://issuance-service.internal/v1/net-settlements',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': payload.cascadeId,
          'x-knowgrph-component': 'Issuance_Service',
        },
        body: JSON.stringify(payload),
      },
    ), unconfigured)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'configuration-missing',
      fields: ['NET_SETTLEMENT_EXECUTOR'],
    })
  })

  it('fails readiness when the executor does not prove the exact settleNet capability', async () => {
    const malformedExecutor = {
      ...runtimeEnv,
      NET_SETTLEMENT_EXECUTOR: {
        fetch: async () => Response.json({
          ok: true,
          contract: 'knowgrph.net-settlement-effect/v1',
          providerBacked: true,
        }),
      },
    }
    const ready = await worker.fetch(new Request('https://internal/readyz'), malformedExecutor)
    expect(ready.status).toBe(503)
    await expect(ready.json()).resolves.toMatchObject({
      ok: false,
      code: 'dependency-unavailable',
    })
  })

  it('accepts bounded readiness JSON split across response stream chunks', async () => {
    const ready = await worker.fetch(new Request('https://internal/readyz'), readinessEnv(
      async () => chunkedJson(storeReadiness, 3),
      async () => chunkedJson(executorReadiness, 5),
    ))
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toMatchObject({
      ok: true,
      dependencies: { netSettlementStore: 'sqlite', netSettlementExecutor: 'provider-backed' },
    })
  })

  it('cancels an oversized chunked readiness response without Content-Length', async () => {
    let emitted = 0
    let cancelled = false
    const totalChunks = 128
    const ready = await worker.fetch(new Request('https://internal/readyz'), readinessEnv(
      async () => new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted >= totalChunks) {
            controller.close()
            return
          }
          controller.enqueue(new Uint8Array(1_024).fill(0x20))
          emitted += 1
        },
        cancel() { cancelled = true },
      }), { headers: { 'content-type': 'application/json' } }),
      async () => chunkedJson(executorReadiness),
    ))
    expect(ready.status).toBe(503)
    await expect(ready.json()).resolves.toMatchObject({ ok: false, code: 'dependency-unavailable' })
    expect(cancelled).toBe(true)
    expect(emitted).toBeLessThan(totalChunks)
  })

  it('cancels malformed readiness length and media declarations before buffering', async () => {
    for (const headers of [
      { 'content-type': 'application/json', 'content-length': 'not-a-number' },
      { 'content-type': 'application/json-evil' },
    ]) {
      let cancelled = false
      const ready = await worker.fetch(new Request('https://internal/readyz'), readinessEnv(
        async () => new Response(new ReadableStream<Uint8Array>({
          pull(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(storeReadiness))) },
          cancel() { cancelled = true },
        }), { headers }),
        async () => chunkedJson(executorReadiness),
      ))
      expect(ready.status).toBe(503)
      await expect(ready.json()).resolves.toMatchObject({ ok: false, code: 'dependency-unavailable' })
      expect(cancelled).toBe(true)
    }
  })

  it('rejects malformed readiness JSON and invalid UTF-8', async () => {
    const malformedBodies = [
      new TextEncoder().encode('{"storage":'),
      new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]),
    ]
    for (const bytes of malformedBodies) {
      const ready = await worker.fetch(new Request('https://internal/readyz'), readinessEnv(
        async () => new Response(bytes, { headers: { 'content-type': 'application/json' } }),
        async () => chunkedJson(executorReadiness),
      ))
      expect(ready.status).toBe(503)
      await expect(ready.json()).resolves.toMatchObject({ ok: false, code: 'dependency-unavailable' })
    }
  })

  it('records one signed net delta and returns the consumer response shape', async () => {
    const response = await settle()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotencyKey: payload.cascadeId,
      amountMinor: 125,
      currency: 'SGD',
      idempotentReplay: false,
      effect: 'charged',
      providerReference: expect.any(String),
    })
  })

  it('requires a definitive provider-backed refund receipt for a negative delta', async () => {
    const negative = { ...payload, cascadeId: `${payload.cascadeId}:refund`, amountMinor: -25 }
    const response = await settle(negative, { 'idempotency-key': negative.cascadeId })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      idempotencyKey: negative.cascadeId,
      amountMinor: -25,
      effect: 'refunded',
      providerReference: expect.any(String),
    })
  })

  it('never promotes a journal-only or malformed success body to settled', async () => {
    const ambiguous = { ...payload, cascadeId: `${payload.cascadeId}:ambiguous` }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await settle(ambiguous, { 'idempotency-key': ambiguous.cascadeId })
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        code: 'settlement-effect-unavailable',
        idempotencyKey: ambiguous.cascadeId,
      })
    }
  })

  it('surfaces only an explicit definitive pre-effect provider rejection as terminal', async () => {
    const rejected = { ...payload, cascadeId: `${payload.cascadeId}:rejected` }
    const response = await settle(rejected, { 'idempotency-key': rejected.cascadeId })
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'settlement-effect-rejected',
      idempotencyKey: rejected.cascadeId,
      definitive: true,
      effectApplied: false,
      providerStatus: 422,
    })
  })

  it('accepts the graph contract collision-free encoded cascade identity', async () => {
    const component = 'a'.repeat(128)
    const encodedPart = `${component.length.toString(36)}:${component}`
    const cascadeId = `~${encodedPart}${encodedPart}${encodedPart}`
    expect(cascadeId.length).toBeGreaterThan(386)
    const response = await settle({
      ...payload,
      cascadeId,
      bundleId: component,
      principalId: component,
    }, { 'idempotency-key': cascadeId })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, idempotencyKey: cascadeId })
  })

  it('coalesces concurrent retries into one durable settlement identity', async () => {
    const responses = await Promise.all(Array.from({ length: 24 }, () => settle(payload)))
    expect(responses.every((response) => response.status === 200)).toBe(true)
    const bodies = await Promise.all(responses.map((response) => response.json())) as Array<{
      settlementId: string
      idempotentReplay: boolean
    }>
    expect(new Set(bodies.map((body) => body.settlementId))).toHaveLength(1)
    expect(bodies.filter((body) => body.idempotentReplay === false)).toHaveLength(1)
  })

  it('rejects semantic payload drift under an owned idempotency key', async () => {
    expect((await settle()).status).toBe(200)
    const conflict = await settle({ ...payload, amountMinor: -25 })
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({
      ok: false,
      code: 'idempotency-conflict',
      idempotencyKey: payload.cascadeId,
    })
  })

  it('rejects malformed amounts, caller spoofing, and mismatched keys before storage', async () => {
    expect((await settle({ ...payload, amountMinor: 0 })).status).toBe(400)
    expect((await settle(payload, { 'x-knowgrph-component': 'Reopt_Worker' })).status).toBe(403)
    expect((await settle(payload, { 'idempotency-key': 'different-key' })).status).toBe(400)
    expect((await settle({ ...payload, claimOwner: 'must-remain-graph-local' })).status).toBe(400)
    expect((await settle({ ...payload, apiKey: 'must-not-cross-boundary' })).status).toBe(400)
  })

  it('cancels an oversized request stream without relying on Content-Length', async () => {
    let pulls = 0
    let emitted = 0
    const totalChunks = 64
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (emitted >= totalChunks) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(1_024).fill(120))
        emitted += 1
      },
    })
    const request = new Request('https://issuance-service.internal/v1/net-settlements', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': payload.cascadeId,
        'x-knowgrph-component': 'Issuance_Service',
      },
      body,
    })
    expect(request.headers.get('content-length')).toBeNull()

    const response = await worker.fetch(request, runtimeEnv)
    expect(response.status).toBe(400)
    expect(pulls).toBeLessThan(totalChunks)
  })
})
