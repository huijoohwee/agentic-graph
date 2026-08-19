import { createExecutionContext, evictDurableObject, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../src/bundle/reopt-worker'

afterEach(() => reset())

describe('durable travel-commerce runtime', () => {
  it('persists state across object eviction and settles a replayed event exactly once', async () => {
    const runtimeEnv = env as unknown as TravelCommerceEnv
    const bundleId = 'bundle-replay'
    const principalId = 'principal-replay'
    const graph = runtimeEnv.BUNDLE_GRAPH.getByName(bundleId)
    const ledger = runtimeEnv.ENVELOPE_LEDGER.getByName(principalId)
    expect(await graph.initBundle({
      bundleId, principalId, totalBudgetMinor: 1_000,
      legs: [
        { legId: 'flight', principalId, category: 'flight', committedOfferId: 'old-flight', committedAmountMinor: 100, lastCascadeId: null },
        { legId: 'hotel', principalId, category: 'hotel', committedOfferId: 'old-hotel', committedAmountMinor: 100, lastCascadeId: null },
      ],
      edges: [{ fromLegId: 'flight', toLegId: 'hotel' }],
    })).toMatchObject({ kind: 'initialized' })
    expect(await ledger.init(principalId, 1_000)).toMatchObject({ kind: 'initialized' })
    let settlements = 0
    const adapters = {
      dispatch: async (record: { affected: readonly string[] }) => ({
        kind: 'quoted' as const,
        quotes: record.affected.map((legId) => ({
          kind: 'offer' as const, legId, offerId: 'new-hotel', amountMinor: 125,
          agentId: 'discovery', promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: {},
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
    expect((await ledger.getHolds()).filter((hold) => hold.state === 'committed')).toHaveLength(1)
  })

  it('health is public but mutation endpoints require bearer authentication', async () => {
    const handler = (await import('../src/index')).default
    expect((await handler.fetch(new Request('https://test/healthz'), env as unknown as TravelCommerceEnv, createExecutionContext())).status).toBe(200)
    expect((await handler.fetch(new Request('https://test/v1/bundles/b'), env as unknown as TravelCommerceEnv, createExecutionContext())).status).toBe(401)
  })
})
