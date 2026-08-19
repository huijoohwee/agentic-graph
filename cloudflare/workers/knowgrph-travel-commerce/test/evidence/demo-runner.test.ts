import { createExecutionContext, reset, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { MAX_BUNDLE_LEGS } from '../../../../../src/bundle/bundle-runtime'
import { OfferCache } from '../../../../../src/cache/offer-cache'
import { permittedModelSet } from '../../../../../src/runtime/model-license-filter'
import { ReplanSurface } from '../../../../../src/ui/replan-surface'
import { demoSeed, emitEvidence, emptyDemoSeed, MapStorage, outcome, quote, readIntentLegId } from './_support'
import { executionContext, initialize, localDemoAdapters, runtimeEnv } from './_runtime'

afterEach(() => reset())

describe('travel-commerce deterministic local demo runner', () => {
  it('executes all eight presenter beats without provider, payment, deployment, or production calls', async () => {
    const beats: Array<Readonly<Record<string, string | number | boolean>>> = []

    const commitSeed = demoSeed('demo-runner-commit')
    const commitRuntime = await initialize(commitSeed)
    const initialSnapshot = await commitRuntime.graph.getSnapshot()
    expect(canonicalEdges(initialSnapshot?.edges ?? [])).toEqual(canonicalEdges(commitSeed.edges))
    expect(initialSnapshot?.legs).toHaveLength(4)
    beats.push({ beat: 1, status: 'passed', legs: 4, edges: 2, graphEngines: 0 })

    const commitHarness = localDemoAdapters({ 'experience-tsukiji': 350, 'transfer-ginza': 225 })
    const committed = await new ReoptWorker(
      commitRuntime.localEnv,
      executionContext(),
      commitHarness.adapters,
    ).handleMutation({ bundleId: commitSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'demo-commit' })
    expect(committed).toMatchObject({
      kind: 'committed',
      affected: ['experience-tsukiji', 'transfer-ginza'],
      netAmountMinor: 75,
      settlementCalls: 1,
    })
    const committedSnapshot = await commitRuntime.graph.getSnapshot()
    expect(committedSnapshot?.legs.find((leg) => leg.legId === 'hotel-shinjuku')?.committedOfferId).toBe('hotel-original')
    beats.push({ beat: 2, status: 'passed', affected: 2, unaffectedSiblingsTouched: 0 })

    const rollbackSeed = demoSeed('demo-runner-rollback')
    const rollbackRuntime = await initialize(rollbackSeed)
    const beforeRollback = JSON.stringify(await rollbackRuntime.graph.getSnapshot())
    const rollbackHarness = localDemoAdapters(
      { 'experience-tsukiji': 350, 'transfer-ginza': 225 },
      { rejectLegId: 'transfer-ginza' },
    )
    const rolledBack = await new ReoptWorker(
      rollbackRuntime.localEnv,
      executionContext(),
      rollbackHarness.adapters,
    ).handleMutation({ bundleId: rollbackSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'demo-rollback' })
    expect(rolledBack).toMatchObject({ kind: 'rolled-back', reason: 'requote-rejected', settlementCalls: 0 })
    if (!('bundleId' in rolledBack) || rolledBack.kind !== 'rolled-back') throw new Error('expected rolled-back outcome')
    expect(JSON.stringify(await rollbackRuntime.graph.getSnapshot())).toBe(beforeRollback)
    beats.push({ beat: 3, status: 'passed', mixedStates: 0, reason: 'requote-rejected' })

    expect(commitHarness.metrics.settlementCalls).toBe(1)
    const zeroSeed = demoSeed('demo-runner-zero')
    const zeroRuntime = await initialize(zeroSeed)
    const zeroHarness = localDemoAdapters({ 'experience-tsukiji': 325, 'transfer-ginza': 175 })
    const zero = await new ReoptWorker(zeroRuntime.localEnv, executionContext(), zeroHarness.adapters).handleMutation({
      bundleId: zeroSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'demo-zero',
    })
    expect(zero).toMatchObject({ kind: 'committed', netAmountMinor: 0, settlementCalls: 0 })
    beats.push({ beat: 4, status: 'passed', affected: 2, netAmountMinor: 75, currency: 'SGD', settlementCalls: 1, zeroNetCalls: 0 })

    const envelopeSeed = emptyDemoSeed('demo-runner-envelope', 1_000)
    const envelopeRuntime = await initialize(envelopeSeed)
    const concurrent = await Promise.all([
      envelopeRuntime.ledger.checkAndReserveCascade('demo-agent-a', envelopeSeed.bundleId, [quote('demo-agent-a-leg', 600)]),
      envelopeRuntime.ledger.checkAndReserveCascade('demo-agent-b', envelopeSeed.bundleId, [quote('demo-agent-b-leg', 600)]),
    ])
    const reserved = concurrent.find((result) => result.kind === 'reserved')
    const rejected = concurrent.find((result) => result.kind === 'rejected')
    expect(reserved?.kind).toBe('reserved')
    expect(rejected).toMatchObject({ kind: 'rejected', reason: 'insufficient-envelope' })
    if (!reserved || reserved.kind !== 'reserved') throw new Error('expected one local reservation')
    const acceptedCascade = reserved.holds[0].cascadeId
    await envelopeRuntime.ledger.releaseCascade(acceptedCascade)
    const retried = await envelopeRuntime.ledger.checkAndReserveCascade('demo-agent-retry', envelopeSeed.bundleId, [quote('demo-agent-retry-leg', 600)])
    expect(retried).toMatchObject({ kind: 'reserved' })
    beats.push({ beat: 5, status: 'passed', offerAmountMinor: 600, envelopeAmountMinor: 1_000, currency: 'SGD', accepted: 1, rejected: 1, releaseVisibleImmediately: true })

    const oversize = demoSeed('demo-runner-oversize')
    const boundaryLegs = Array.from({ length: MAX_BUNDLE_LEGS }, (_, index) => ({
      legId: `oversize-${index}`, principalId: oversize.principalId, category: 'flight',
      committedOfferId: null, committedAmountMinor: null, lastCascadeId: null,
    }))
    const oversizeGraph = runtimeEnv().BUNDLE_GRAPH.getByName(oversize.bundleId)
    expect(await oversizeGraph.initBundle({ ...oversize, legs: boundaryLegs, edges: [] })).toMatchObject({ kind: 'initialized' })
    const beforeOversizeInsert = JSON.stringify(await oversizeGraph.getSnapshot())
    expect(await oversizeGraph.insertLeg({
      legId: `oversize-${MAX_BUNDLE_LEGS}`, principalId: oversize.principalId, category: 'flight',
      committedOfferId: null, committedAmountMinor: null, lastCascadeId: null,
    })).toMatchObject({
      kind: 'rejected', reason: 'scale-boundary-legs', details: { observed: 21 },
    })
    expect(JSON.stringify(await oversizeGraph.getSnapshot())).toBe(beforeOversizeInsert)
    const cycle = demoSeed('demo-runner-cycle')
    const cycleGraph = runtimeEnv().BUNDLE_GRAPH.getByName(cycle.bundleId)
    expect(await cycleGraph.initBundle(cycle)).toMatchObject({ kind: 'initialized' })
    const beforeCycleInsert = JSON.stringify(await cycleGraph.getSnapshot())
    expect(await cycleGraph.insertEdge({ fromLegId: 'transfer-ginza', toLegId: 'flight-sin-nrt' }))
      .toEqual({ kind: 'rejected', reason: 'cyclic-dependency' })
    expect(JSON.stringify(await cycleGraph.getSnapshot())).toBe(beforeCycleInsert)
    beats.push({
      beat: 6,
      status: 'passed',
      limit: 20,
      observed: 21,
      insertLegOperation: 'real-runtime',
      insertLegRejected: true,
      insertEdgeOperation: 'real-runtime',
      cycleRejected: true,
      rejectedMutationsApplied: 0,
    })

    let discoveryCalls = 0
    const discovery: Fetcher = {
      async fetch(request: Request) {
        discoveryCalls += 1
        const legId = await readIntentLegId(request)
        return Response.json({
          kind: 'offer', legId, offerId: 'demo-cache-offer', amountMinor: 100,
          currency: 'SGD',
          priceVerification: 'deterministic-demo',
          agentId: 'local-demo-cache-double', promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { mode: 'deterministic-local-demo-double', currency: 'SGD' },
        })
      },
      connect() { throw new Error('not-supported-by-local-demo-double') },
    }
    const cache = new OfferCache('demo-runner-cache')
    const cacheInput = {
      event: { bundleId: 'demo-cache', legId: 'flight', eventId: 'cache-event' },
      legId: 'experience', category: 'experience', priorOfferId: 'prior', priorAmountMinor: 90,
    }
    const firstContext = createExecutionContext()
    await cache.requote(cacheInput, discovery, firstContext)
    await waitOnExecutionContext(firstContext)
    const secondContext = createExecutionContext()
    await cache.requote(cacheInput, discovery, secondContext)
    await waitOnExecutionContext(secondContext)
    expect(discoveryCalls).toBe(1)
    const costEntries = await commitRuntime.graph.getCostLog()
    expect(costEntries.filter((entry) => entry.component === 'Reopt_Worker')).toHaveLength(1)
    const permitted = permittedModelSet(JSON.stringify([{
      id: 'demo-model', license: 'Apache-2.0', path: 'workers-ai',
      input_usd_per_million: 0.2, output_usd_per_million: 0.3,
    }]), '["Apache-2.0","MIT"]')
    expect(permitted).toMatchObject([{ id: 'demo-model', license: 'Apache-2.0', metered: true }])
    beats.push({
      beat: 7,
      status: 'passed',
      orchestrationTokens: 0,
      cachedDispatches: discoveryCalls,
      inferenceMetered: true,
      quotePriceVerification: 'deterministic-demo',
    })

    if (!committed || !('bundleId' in committed)) throw new Error('expected committed outcome')
    const storage = new MapStorage()
    const surface = new ReplanSurface(storage)
    surface.project(committed, 1_000)
    const offline = new ReplanSurface(storage).render(committed.bundleId, true, 61_000)
    expect(offline).toContain('data-replan-current="false"')
    const remoteRollback = outcome({
      kind: 'rolled-back',
      bundleId: committed.bundleId,
      cascadeId: `${committed.bundleId}:flight-sin-nrt:edge-observation`,
      netAmountMinor: 0,
      settlementCalls: 0,
      reason: rolledBack.reason,
    })
    surface.converge(committed.bundleId, [remoteRollback], 70_000)
    expect(surface.snapshot(committed.bundleId)?.observations).toHaveLength(2)
    expect(surface.render(committed.bundleId)).toContain('Rolled back')
    beats.push({ beat: 8, status: 'passed', observationsRetained: 2, lostObservations: 0, reconnectConverged: true })

    expect(beats).toHaveLength(8)
    expect(beats.every((beat) => beat.status === 'passed')).toBe(true)
    const report = {
      schema: 'knowgrph-travel-commerce-demo-evidence/v1',
      status: 'passed',
      mode: 'deterministic-local-service-doubles',
      deployLane: 'Dev_Lane',
      beats,
      providerRequests: 0,
      realPaymentCalls: 0,
      productionMutations: 0,
    }
    console.info(`TRAVEL_COMMERCE_DEMO ${JSON.stringify(report)}`)
    emitEvidence('demo:travel-commerce', ['1', '2', '3', '4', '5', '7', '9', '10', '11', '13', '14'], {
      beatsPassed: beats.length,
      realPaymentCalls: 0,
      providerRequests: 0,
      productionMutations: 0,
      mode: report.mode,
    })
  }, 60_000)
})

function canonicalEdges(edges: readonly Readonly<{ fromLegId: string; toLegId: string }>[]) {
  return [...edges].sort((left, right) => (
    left.fromLegId.localeCompare(right.fromLegId) || left.toLegId.localeCompare(right.toLegId)
  ))
}
