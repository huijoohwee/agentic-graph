import fc from 'fast-check'
import { createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { archiveCascade } from '../../../../../src/archive/provenance-archive'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { OfferCache, type RequoteInput } from '../../../../../src/cache/offer-cache'
import { checkAsyncProperty, demoSeed, emitEvidence, outcome, quote, readIntentLegId } from './_support'
import { executionContext, initialize, localDemoAdapters, runtimeEnv } from './_runtime'

afterEach(() => reset())

describe('check:edge-cache evidence', () => {
  it('keys on the full request and records dispatch reduction inside the TTL', async () => {
    let propertySequence = 0
    const staleRun = await checkAsyncProperty('check:edge-cache/CP-12', 200, fc.asyncProperty(
      fc.integer({ min: 30_000, max: 120_000 }),
      async (ageMs) => {
        propertySequence += 1
        let now = 1_000
        let calls = 0
        const release: { response: ((value: Response) => void) | null } = { response: null }
        let markSecondStarted: (() => void) | null = null
        const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve })
        const discovery: Fetcher = {
          async fetch(request: Request): Promise<Response> {
            calls += 1
            const legId = await readIntentLegId(request)
            if (calls === 1) return Response.json(quote(legId, 100, 'stale'))
            markSecondStarted?.()
            return new Promise<Response>((resolve) => { release.response = resolve })
          },
          connect() { throw new Error('not-supported-by-local-demo-double') },
        }
        const cache = new OfferCache(`cp12-${propertySequence}`, 30_000, 60_000, () => now)
        const input = requoteInput('hotel', 300)
        const primeContext = createExecutionContext()
        expect(await cache.requote(input, discovery, primeContext)).toMatchObject({ offerId: 'hotel-stale' })
        await waitOnExecutionContext(primeContext)
        now += ageMs
        const commitContext = createExecutionContext()
        const pendingFresh = cache.requote(input, discovery, commitContext)
        await secondStarted
        expect(await Promise.race([
          pendingFresh.then(() => 'settled' as const),
          Promise.resolve('awaiting-revalidation' as const),
        ])).toBe('awaiting-revalidation')
        if (!release.response) throw new Error('revalidation release unavailable')
        release.response(Response.json(quote('hotel', 101, 'fresh')))
        expect(await pendingFresh).toMatchObject({ offerId: 'hotel-fresh' })
        await waitOnExecutionContext(commitContext)
        expect(calls).toBe(2)
      },
    ))

    let archiveSequence = 0
    const archiveRun = await checkAsyncProperty('check:edge-cache/CP-16', 200, fc.asyncProperty(
      fc.integer({ min: 1, max: 5 }),
      fc.string(),
      async (repeatCount, value) => {
        archiveSequence += 1
        const cascadeOutcome = outcome({
          bundleId: `archive-bundle-${archiveSequence}`,
          cascadeId: `archive-bundle-${archiveSequence}:flight:event`,
        })
        const bucket = runtimeEnv().PROVENANCE_ARCHIVE
        const first = await archiveCascade(bucket, { value }, cascadeOutcome)
        expect(first.kind).toBe('written')
        for (let repeat = 1; repeat < repeatCount; repeat += 1) {
          expect(await archiveCascade(bucket, { value }, cascadeOutcome)).toEqual({ ...first, kind: 'idempotent' })
        }
        await expect(archiveCascade(bucket, { value: `${value}-different` }, cascadeOutcome))
          .rejects.toThrow('archive-immutable')
      },
    ))

    let discoveryDispatches = 0
    const discovery: Fetcher = {
      async fetch(request: Request) {
        discoveryDispatches += 1
        const legId = await readIntentLegId(request)
        return Response.json({
          kind: 'offer', legId, offerId: `${legId}-cache-${discoveryDispatches}`, amountMinor: 321,
          currency: 'SGD',
          priceVerification: 'deterministic-demo',
          agentId: 'local-cache-double', promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { mode: 'deterministic-local-demo-double', currency: 'SGD' },
        })
      },
      connect() { throw new Error('not-supported-by-local-demo-double') },
    }
    const cache = new OfferCache('evidence-edge-cache')
    const input = requoteInput('hotel', 300)
    const firstContext = createExecutionContext()
    const first = await cache.requote(input, discovery, firstContext)
    await waitOnExecutionContext(firstContext)
    const secondContext = createExecutionContext()
    const second = await cache.requote(input, discovery, secondContext)
    await waitOnExecutionContext(secondContext)
    expect(second).toEqual(first)
    expect(discoveryDispatches).toBe(1)

    const distinctContext = createExecutionContext()
    await cache.requote(requoteInput('hotel', 301), discovery, distinctContext)
    await waitOnExecutionContext(distinctContext)
    expect(discoveryDispatches).toBe(2)

    let isolatedDispatches = 0
    const releases: Array<(response: Response) => void> = []
    const isolatedDiscovery: Fetcher = {
      async fetch() {
        isolatedDispatches += 1
        return new Promise<Response>((resolve) => { releases.push(resolve) })
      },
      connect() { throw new Error('not-supported-by-local-demo-double') },
    }
    const isolatedInput = requoteInput('experience', 444)
    const isolatedContexts = [createExecutionContext(), createExecutionContext()]
    const isolatedRequests = [
      new OfferCache('evidence-request-isolation').requote(
        isolatedInput, isolatedDiscovery, isolatedContexts[0],
      ),
      new OfferCache('evidence-request-isolation').requote(
        isolatedInput, isolatedDiscovery, isolatedContexts[1],
      ),
    ]
    for (let attempt = 0; attempt < 100 && isolatedDispatches < 2; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    const observedIsolatedDispatches = isolatedDispatches
    for (const release of releases) release(Response.json(quote('hotel', 444, 'request-isolated')))
    await Promise.all(isolatedRequests)
    await Promise.all(isolatedContexts.map(waitOnExecutionContext))
    expect(observedIsolatedDispatches).toBe(2)

    const archiveSeed = demoSeed('archive-deferred-integration')
    const archiveRuntime = await initialize(archiveSeed)
    const archiveHarness = localDemoAdapters({ 'experience-tsukiji': 350, 'transfer-ginza': 225 })
    let archiveAttempts = 0
    const faultAdapters = Object.freeze({
      ...archiveHarness.adapters,
      archive: async (...args: Parameters<typeof archiveHarness.adapters.archive>) => {
        archiveAttempts += 1
        if (archiveAttempts === 1) throw new Error('r2-fault-injected')
        return archiveHarness.adapters.archive(...args)
      },
    })
    const archiveEvent = Object.freeze({
      bundleId: archiveSeed.bundleId,
      legId: 'flight-sin-nrt',
      eventId: 'archive-deferred-integration',
    })
    const deferred = await new ReoptWorker(
      archiveRuntime.localEnv,
      executionContext(),
      faultAdapters,
    ).handleMutation(archiveEvent)
    expect(deferred).toMatchObject({ kind: 'committed', archiveDeferred: true })
    if (!('cascadeId' in deferred)) throw new Error('archive cascade id unavailable')
    expect((await archiveRuntime.graph.getSnapshot())?.legs.find(
      (leg) => leg.legId === 'experience-tsukiji',
    )).toMatchObject({ committedOfferId: 'experience-tsukiji-archive-deferred-integration' })
    expect((await archiveRuntime.graph.getSessionLog()).filter(
      (entry) => entry.cascadeId === deferred.cascadeId && entry.eventType === 'archive-deferred',
    )).toHaveLength(1)
    const recovered = await new ReoptWorker(
      archiveRuntime.localEnv,
      executionContext(),
      faultAdapters,
    ).handleMutation(archiveEvent)
    expect(recovered).toMatchObject({ kind: 'committed', archiveDeferred: false })
    expect(archiveAttempts).toBe(2)
    expect(archiveHarness.metrics.settlementCalls).toBe(1)
    expect(await archiveRuntime.graph.getArchiveSnapshot(deferred.cascadeId)).toBeNull()

    // @ts-expect-error Production MCP JavaScript is intentionally consumed without a duplicate test-only declaration.
    const cacheModule = await import('../../../agentic-graph-mcp/agent-definition-cache.mjs')
    const AgentDefinitionCache = cacheModule.AgentDefinitionCache as new () => DefinitionCache
    const kvValues = new Map<string, string>()
    const kvWrites: { key: string; options: unknown }[] = []
    const definitionKv = {
      async get(key: string) { return kvValues.get(key) ?? null },
      async put(key: string, value: string, options?: unknown) {
        kvWrites.push({ key, options })
        kvValues.set(key, value)
      },
    }
    const initialDefinitions = [agentDefinition('agent-flight', 'flight')]
    const registeredDefinitions = [...initialDefinitions, agentDefinition('agent-hotel', 'hotel')]
    const warmDefinitions = new AgentDefinitionCache()
    expect(await warmDefinitions.resolve(initialDefinitions, definitionKv)).toMatchObject({
      ok: true, source: 'configuration', invalidation: 'initial-registration',
    })
    expect(await warmDefinitions.resolve(initialDefinitions, definitionKv)).toMatchObject({
      ok: true, source: 'memory', invalidation: 'none',
    })
    const coldDefinitions = new AgentDefinitionCache()
    expect(await coldDefinitions.resolve(initialDefinitions, definitionKv)).toMatchObject({
      ok: true, source: 'kv', invalidation: 'none',
    })
    expect(await coldDefinitions.resolve(registeredDefinitions, definitionKv)).toMatchObject({
      ok: true, source: 'configuration', invalidation: 'registration',
    })
    expect(await coldDefinitions.resolve(initialDefinitions, definitionKv)).toMatchObject({
      ok: true, source: 'configuration', invalidation: 'deregistration',
    })
    expect(kvWrites).toHaveLength(3)
    expect(kvWrites.every((write) => write.options === undefined)).toBe(true)
    emitEvidence('check:edge-cache', ['2.8', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8', '9.9', '9.10', '9.11'], {
      repeatedRequests: 2,
      dispatchesWithoutCacheEquivalent: 2,
      dispatchesWithCache: 1,
      dispatchReduction: 1,
      distinctFullIdentityDispatches: 1,
      independentRequestInstanceDispatches: observedIsolatedDispatches,
      softTtlSeconds: 30,
      hardTtlSeconds: 60,
      staleRefusalSeed: staleRun.seed,
      staleRefusalNumRuns: staleRun.numRuns,
      archiveSeed: archiveRun.seed,
      archiveNumRuns: archiveRun.numRuns,
      archiveFaultsInjected: 1,
      committedStateRetainedAfterArchiveFault: true,
      archiveDeferredEntries: 1,
      archiveRecoveryAttempts: archiveAttempts,
      settlementCallsAcrossArchiveRecovery: archiveHarness.metrics.settlementCalls,
      archivedOnlySnapshotsAfterRecovery: 0,
      agentDefinitionMemoryHits: 1,
      agentDefinitionKvHitsAfterColdWake: 1,
      registrationInvalidations: 1,
      deregistrationInvalidations: 1,
      timerInvalidations: 0,
    }, ['CP-12', 'CP-16'], staleRun)
  }, 120_000)
})

function requoteInput(category: string, priorAmountMinor: number): RequoteInput {
  return Object.freeze({
    event: Object.freeze({ bundleId: 'cache-bundle', legId: 'flight', eventId: 'cache-event' }),
    legId: 'hotel',
    category,
    priorOfferId: 'hotel-prior',
    priorAmountMinor,
  })
}

type DefinitionCache = Readonly<{
  resolve: (
    definitions: readonly Readonly<Record<string, unknown>>[],
    kv: Readonly<{ get: (key: string) => Promise<string | null>; put: (key: string, value: string) => Promise<void> }>,
  ) => Promise<Readonly<Record<string, unknown>>>
}>

function agentDefinition(agentId: string, declaredCategory: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    agentId,
    declaredCategory,
    declaredToolAllowlist: Object.freeze(['discoverOffers']),
    trustStatus: 'declared-and-present',
    schemaRevision: 'agentic-graph.travel-discovery/v1',
    contentHash: `runtime:${agentId}`,
  })
}
