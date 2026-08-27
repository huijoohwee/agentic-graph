import { createExecutionContext, evictDurableObject, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../src/bundle/reopt-worker'
import { minorUnits } from '../../../../src/bundle/bundle-runtime'

afterEach(() => reset())

describe('durable travel-commerce runtime', () => {
  it('persists state across object eviction and settles a replayed event exactly once', async () => {
    const runtimeEnv = env as unknown as TravelCommerceEnv
    const bundleId = 'bundle-replay'
    const principalId = 'principal-replay'
    const graph = runtimeEnv.BUNDLE_GRAPH.getByName(bundleId)
    const ledger = runtimeEnv.ENVELOPE_LEDGER.getByName(principalId)
    expect(await graph.initBundle({
      bundleId, principalId, totalBudgetMinor: minorUnits(1_000),
      legs: [
        { legId: 'flight', principalId, category: 'flight', committedOfferId: 'old-flight', committedAmountMinor: minorUnits(100), lastCascadeId: null },
        { legId: 'hotel', principalId, category: 'hotel', committedOfferId: 'old-hotel', committedAmountMinor: minorUnits(100), lastCascadeId: null },
      ],
      edges: [{ fromLegId: 'flight', toLegId: 'hotel' }],
    })).toMatchObject({ kind: 'initialized' })
    expect(await ledger.init(principalId, 1_000)).toMatchObject({ kind: 'idempotent' })
    let settlements = 0
    const adapters = {
      dispatch: async (record: { affected: readonly string[] }) => ({
        kind: 'quoted' as const,
        quotes: record.affected.map((legId) => ({
          kind: 'offer' as const, legId, offerId: 'new-hotel', amountMinor: minorUnits(125),
          currency: 'SGD', priceVerification: 'deterministic-demo' as const, agentId: 'discovery',
          promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { currency: 'SGD' },
        })),
        quoteCount: record.affected.length, rejectCount: 0 as const,
      }),
      settle: async (record: { cascadeId: string }) => {
        settlements += 1
        return { kind: 'settled' as const, settlementId: 'settlement-1', idempotencyKey: record.cascadeId }
      },
      archive: async (_bucket: R2Bucket, _snapshot: unknown, outcome: { bundleId: string; cascadeId: string }) => ({
        kind: 'written' as const, key: `provenance/${outcome.bundleId}/${outcome.cascadeId}.json`, digest: 'test',
      }),
    }
    const event = { bundleId, legId: 'flight', eventId: 'event-1' }
    const first = await new ReoptWorker(runtimeEnv, createExecutionContext(), adapters).handleMutation(event)
    expect(first).toMatchObject({ kind: 'committed', settlementCalls: 1 })
    await evictDurableObject(graph)
    await evictDurableObject(ledger)
    const replay = await new ReoptWorker(runtimeEnv, createExecutionContext(), adapters).handleMutation(event)
    expect(replay).toEqual(first)
    expect(settlements).toBe(1)
    const committed = (await ledger.getHolds()).filter((hold) => hold.state === 'committed')
    expect(committed).toHaveLength(2)
    expect(committed.reduce((sum, hold) => sum + hold.amountMinor, 0)).toBe(225)
  })

  it('liveness is public, readiness fails closed, and mutations require bearer authentication', async () => {
    const handler = (await import('../src/index')).default
    expect((await handler.fetch(new Request('https://test/livez'), env as unknown as TravelCommerceEnv, createExecutionContext())).status).toBe(200)
    expect((await handler.fetch(new Request('https://test/readyz'), env as unknown as TravelCommerceEnv, createExecutionContext())).status).toBe(503)
    expect((await handler.fetch(new Request('https://test/v1/bundles/b'), env as unknown as TravelCommerceEnv, createExecutionContext())).status).toBe(401)
  })

  it('returns retryable conflict for bundle contention and 422 only for terminal rejection', async () => {
    const handler = (await import('../src/index')).default
    const runtime = env as unknown as TravelCommerceEnv
    const graph = runtime.BUNDLE_GRAPH.getByName('bundle-http-pending')
    await graph.initBundle({
      bundleId: 'bundle-http-pending', principalId: 'principal-http-pending', totalBudgetMinor: minorUnits(1_000),
      legs: [
        {
          legId: 'flight', principalId: 'principal-http-pending', category: 'flight',
          committedOfferId: null, committedAmountMinor: null, lastCascadeId: null,
        },
        {
          legId: 'hotel', principalId: 'principal-http-pending', category: 'hotel',
          committedOfferId: null, committedAmountMinor: null, lastCascadeId: null,
        },
      ],
      edges: [{ fromLegId: 'flight', toLegId: 'hotel' }],
    })
    expect(await graph.beginCascade({
      bundleId: 'bundle-http-pending', legId: 'flight', eventId: 'active',
    })).toMatchObject({ kind: 'plan' })
    const pendingRequest = () => handler.fetch(new Request(
      'https://test/v1/bundles/bundle-http-pending/mutations', {
        method: 'POST',
        headers: { authorization: 'Bearer test-travel-token', 'content-type': 'application/json' },
        body: JSON.stringify({ leg_id: 'flight', event_id: 'waiting' }),
      },
    ), runtime, createExecutionContext())
    const pending = await pendingRequest()
    expect(pending.status).toBe(409)
    expect(pending.headers.get('retry-after')).toBe('1')
    await expect(pending.json()).resolves.toMatchObject({ kind: 'pending', reason: 'bundle-busy' })
    expect((await pendingRequest()).status).toBe(409)

    const terminal = await handler.fetch(new Request(
      'https://test/v1/bundles/bundle-http-missing/mutations', {
        method: 'POST',
        headers: { authorization: 'Bearer test-travel-token', 'content-type': 'application/json' },
        body: JSON.stringify({ leg_id: 'flight', event_id: 'terminal' }),
      },
    ), runtime, createExecutionContext())
    expect(terminal.status).toBe(422)
    await expect(terminal.json()).resolves.toMatchObject({ kind: 'rejected', reason: 'bundle-unavailable' })

    const unavailableEnv = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property !== 'BUNDLE_GRAPH') return Reflect.get(target, property, receiver)
        return { getByName: () => ({ beginCascade: async () => { throw new Error('store-down') } }) }
      },
    }) as TravelCommerceEnv
    const unavailable = await handler.fetch(new Request(
      'https://test/v1/bundles/bundle-http-unavailable/mutations', {
        method: 'POST',
        headers: { authorization: 'Bearer test-travel-token', 'content-type': 'application/json' },
        body: JSON.stringify({ leg_id: 'flight', event_id: 'retry-store' }),
      },
    ), unavailableEnv, createExecutionContext())
    expect(unavailable.status).toBe(409)
    await expect(unavailable.json()).resolves.toMatchObject({ kind: 'pending', reason: 'store-unavailable' })
  })

  it('reports ready only when configuration and every runtime dependency are ready', async () => {
    const handler = (await import('../src/index')).default
    const runtime = env as unknown as TravelCommerceEnv
    const readyService = {
      fetch: async () => Response.json({ ok: true }),
      connect: () => { throw new Error('not-used') },
    } satisfies Fetcher
    const healthy = {
      BUNDLE_GRAPH: runtime.BUNDLE_GRAPH,
      ENVELOPE_LEDGER: runtime.ENVELOPE_LEDGER,
      BALANCE_CACHE: { get: async () => null },
      PROVENANCE_ARCHIVE: { head: async () => null },
      AI: { run: async () => ({ response: 'test', usage: { prompt_tokens: 1, completion_tokens: 1 } }) },
      DISCOVERY_SERVICE: readyService,
      ISSUANCE_SERVICE: readyService,
      INFERENCE_OVERFLOW: readyService,
      DEPLOY_LANE: 'Staging_Lane',
      CASCADE_WALL_MS: '10000',
      SETTLEMENT_CURRENCY: 'SGD',
      MODEL_CATALOG_JSON: runtime.MODEL_CATALOG_JSON,
      PERMITTED_MODEL_LICENSES_JSON: runtime.PERMITTED_MODEL_LICENSES_JSON,
      TRAVEL_COMMERCE_API_TOKEN: 'a'.repeat(16),
      INFERENCE_OVERFLOW_TOKEN: 'b'.repeat(16),
    } as unknown as TravelCommerceEnv
    const response = await handler.fetch(new Request('https://test/readyz'), healthy, createExecutionContext())
    expect(response.status).toBe(200)
    const readyBody = await response.json() as { ok: boolean; lane: string; checks: unknown[] }
    expect(readyBody).toMatchObject({ ok: true, lane: 'Staging_Lane' })
    expect(readyBody.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'bundle-graph', ok: true }),
      expect.objectContaining({ name: 'envelope-ledger', ok: true }),
      expect.objectContaining({ name: 'balance-cache', ok: true }),
      expect.objectContaining({ name: 'provenance-archive', ok: true }),
    ]))

    const missingSecrets = {
      ...healthy,
      TRAVEL_COMMERCE_API_TOKEN: undefined,
      INFERENCE_OVERFLOW_TOKEN: undefined,
    } as unknown as TravelCommerceEnv
    expect((await handler.fetch(new Request('https://test/readyz'), missingSecrets, createExecutionContext())).status).toBe(503)

    const brokenCache = {
      ...healthy,
      BALANCE_CACHE: { get: async () => { throw new Error('cache-unavailable') } },
    } as unknown as TravelCommerceEnv
    const failedProbe = await handler.fetch(
      new Request('https://test/readyz'), brokenCache, createExecutionContext(),
    )
    expect(failedProbe.status).toBe(503)
    const failedBody = await failedProbe.json() as { ok: boolean; checks: unknown[] }
    expect(failedBody.ok).toBe(false)
    expect(failedBody.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'balance-cache', ok: false, reason: 'probe-failed' }),
    ]))
  })

  it('serves authenticated bundle structure, observability, and hibernatable event routes', async () => {
    const handler = (await import('../src/index')).default
    const runtime = env as unknown as TravelCommerceEnv
    const bundleId = 'bundle-http-contract'
    const principalId = 'principal-http-contract'
    const authorization = { authorization: 'Bearer test-travel-token' }
    const initialized = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}`, {
      method: 'PUT',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        principal_id: principalId,
        total_budget_minor: 1_000,
        legs: [{ leg_id: 'flight', category: 'flight', committed_offer_id: null, committed_amount_minor: null }],
        edges: [],
      }),
    }), runtime, createExecutionContext())
    expect(initialized.status).toBe(200)

    const insertedLeg = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}/legs`, {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        principal_id: principalId,
        leg_id: 'hotel',
        category: 'hotel',
        committed_offer_id: null,
        committed_amount_minor: null,
      }),
    }), runtime, createExecutionContext())
    expect(insertedLeg.status).toBe(200)

    const insertedEdge = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}/edges`, {
      method: 'POST',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ from_leg_id: 'flight', to_leg_id: 'hotel' }),
    }), runtime, createExecutionContext())
    expect(insertedEdge.status).toBe(200)

    const snapshot = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}`, {
      headers: authorization,
    }), runtime, createExecutionContext())
    await expect(snapshot.json()).resolves.toMatchObject({ bundleId, principalId, legs: [{ legId: 'flight' }, { legId: 'hotel' }] })

    for (const path of ['session-log', 'cost-log']) {
      const response = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}/${path}`, {
        headers: authorization,
      }), runtime, createExecutionContext())
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ entries: [] })
    }

    const protocolToken = btoa('test-travel-token').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const events = await handler.fetch(new Request(`https://test/v1/bundles/${bundleId}/events`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-protocol': `agenticgraph.v1, agenticgraph.auth.${protocolToken}`,
      },
    }), runtime, createExecutionContext())
    expect(events.status).toBe(101)
    expect(events.headers.get('sec-websocket-protocol')).toBe('agenticgraph.v1')
    events.webSocket?.accept()
    events.webSocket?.close(1000, 'test-complete')
  })
})
