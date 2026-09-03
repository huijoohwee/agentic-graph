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
    const beats: Array<Readonly<Record<string, unknown>>> = []

    const commitSeed = demoSeed('demo-runner-commit')
    const commitRuntime = await initialize(commitSeed)
    const initialSnapshot = await commitRuntime.graph.getSnapshot()
    expect(canonicalEdges(initialSnapshot?.edges ?? [])).toEqual(canonicalEdges(commitSeed.edges))
    expect(initialSnapshot?.legs).toHaveLength(4)
    if (!initialSnapshot) throw new Error('expected seeded bundle snapshot')
    beats.push({
      beat: 1,
      status: 'passed',
      title: 'Dependency structure',
      outcome: 'observed',
      summary: 'The executable bundle snapshot stores four legs and two directed dependency edges in flat tables.',
      legs: presentLegs(initialSnapshot.legs),
      edges: canonicalEdges(initialSnapshot.edges),
      graphEngines: 0,
    })

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
    if (!committedSnapshot || !('bundleId' in committed) || committed.kind !== 'committed') {
      throw new Error('expected committed demo outcome and snapshot')
    }
    const hotelBefore = initialSnapshot.legs.find((leg) => leg.legId === 'hotel-shinjuku')
    const hotelAfter = committedSnapshot.legs.find((leg) => leg.legId === 'hotel-shinjuku')
    expect(hotelAfter).toEqual(hotelBefore)
    beats.push({
      beat: 2,
      status: 'passed',
      title: 'Downstream-only re-plan',
      outcome: 'observed',
      summary: 'The mutation excludes the changed flight, re-quotes exactly its two reachable descendants, and preserves the unrelated hotel.',
      changedLegId: committed.changedLegId,
      affectedLegIds: [...committed.affected],
      changes: committed.changes.map((change) => ({ ...change })),
      unaffectedSibling: {
        legId: hotelAfter?.legId,
        offerIdBefore: hotelBefore?.committedOfferId,
        offerIdAfter: hotelAfter?.committedOfferId,
        amountMinorBefore: hotelBefore?.committedAmountMinor,
        amountMinorAfter: hotelAfter?.committedAmountMinor,
      },
      unaffectedSiblingsTouched: 0,
    })

    const rollbackSeed = demoSeed('demo-runner-rollback')
    const rollbackRuntime = await initialize(rollbackSeed)
    const beforeRollbackSnapshot = await rollbackRuntime.graph.getSnapshot()
    const beforeRollback = JSON.stringify(beforeRollbackSnapshot)
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
    const afterRollbackSnapshot = await rollbackRuntime.graph.getSnapshot()
    expect(JSON.stringify(afterRollbackSnapshot)).toBe(beforeRollback)
    if (!beforeRollbackSnapshot || !afterRollbackSnapshot) throw new Error('expected rollback snapshots')
    beats.push({
      beat: 3,
      status: 'passed',
      title: 'All or none',
      outcome: 'rolled-back',
      summary: 'The same affected set has two executed outcomes: one atomic commit and one rejected re-quote that restores the prior snapshot exactly.',
      outcomes: [
        {
          kind: 'committed',
          cascadeId: committed.cascadeId,
          affectedLegIds: [...committed.affected],
          reason: null,
          mixedStates: 0,
          beforeLegs: presentLegs(initialSnapshot.legs),
          afterLegs: presentLegs(committedSnapshot.legs),
        },
        {
          kind: 'rolled-back',
          cascadeId: rolledBack.cascadeId,
          affectedLegIds: [...rolledBack.affected],
          reason: rolledBack.reason,
          mixedStates: 0,
          snapshotRestored: true,
          beforeLegs: presentLegs(beforeRollbackSnapshot.legs),
          afterLegs: presentLegs(afterRollbackSnapshot.legs),
        },
      ],
    })

    expect(commitHarness.metrics.settlementCalls).toBe(1)
    const replayed = await new ReoptWorker(
      commitRuntime.localEnv,
      executionContext(),
      commitHarness.adapters,
    ).handleMutation({ bundleId: commitSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'demo-commit' })
    expect(replayed).toMatchObject({ kind: 'committed', cascadeId: committed.cascadeId, settlementCalls: 1 })
    expect(commitHarness.metrics.settlementCalls).toBe(1)
    const zeroSeed = demoSeed('demo-runner-zero')
    const zeroRuntime = await initialize(zeroSeed)
    const zeroHarness = localDemoAdapters({ 'experience-tsukiji': 325, 'transfer-ginza': 175 })
    const zero = await new ReoptWorker(zeroRuntime.localEnv, executionContext(), zeroHarness.adapters).handleMutation({
      bundleId: zeroSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'demo-zero',
    })
    expect(zero).toMatchObject({ kind: 'committed', netAmountMinor: 0, settlementCalls: 0 })
    if (!('bundleId' in zero) || zero.kind !== 'committed') throw new Error('expected zero-net committed outcome')
    beats.push({
      beat: 4,
      status: 'passed',
      title: 'One net settlement',
      outcome: 'committed',
      summary: 'The non-zero cascade settles once under its cascade idempotency key; its exact replay adds no call, while the zero-net companion settles zero times.',
      currency: 'SGD',
      nonZero: {
        cascadeId: committed.cascadeId,
        idempotencyKey: committed.cascadeId,
        affectedLegIds: [...committed.affected],
        netAmountMinor: committed.netAmountMinor,
        settlementCallsOnFirstExecution: 1,
        settlementCallsAfterExactReplay: commitHarness.metrics.settlementCalls,
        exactReplayOutcome: replayed.kind,
      },
      zeroNet: {
        cascadeId: zero.cascadeId,
        idempotencyKey: zero.cascadeId,
        affectedLegIds: [...zero.affected],
        netAmountMinor: zero.netAmountMinor,
        settlementCalls: zero.settlementCalls,
        recordedAs: 'zero-net',
      },
    })

    const envelopeSeed = emptyDemoSeed('demo-runner-envelope', 1_000)
    const envelopeRuntime = await initialize(envelopeSeed)
    const competingOffers = [quote('demo-agent-a-leg', 600), quote('demo-agent-b-leg', 600)] as const
    const concurrent = await Promise.all([
      envelopeRuntime.ledger.checkAndReserveCascade('demo-agent-a', envelopeSeed.bundleId, [competingOffers[0]]),
      envelopeRuntime.ledger.checkAndReserveCascade('demo-agent-b', envelopeSeed.bundleId, [competingOffers[1]]),
    ])
    const reserved = concurrent.find((result) => result.kind === 'reserved')
    const rejected = concurrent.find((result) => result.kind === 'rejected')
    expect(reserved?.kind).toBe('reserved')
    expect(rejected).toMatchObject({ kind: 'rejected', reason: 'insufficient-envelope' })
    if (!reserved || reserved.kind !== 'reserved') throw new Error('expected one local reservation')
    const acceptedCascade = reserved.holds[0].cascadeId
    const acceptedIndex = concurrent.findIndex((result) => result.kind === 'reserved')
    const rejectedIndex = concurrent.findIndex((result) => result.kind === 'rejected')
    if (acceptedIndex < 0 || rejectedIndex < 0) throw new Error('expected one accepted and one rejected offer')
    const release = await envelopeRuntime.ledger.releaseCascade(acceptedCascade)
    expect(release).toMatchObject({ kind: 'released', count: 1 })
    if (release.kind !== 'released') throw new Error('expected accepted hold release')
    const retryAgentId = rejectedIndex === 0 ? 'demo-agent-a' : 'demo-agent-b'
    const retryOffer = competingOffers[rejectedIndex]
    const retried = await envelopeRuntime.ledger.checkAndReserveCascade(retryAgentId, envelopeSeed.bundleId, [retryOffer])
    expect(retried).toMatchObject({ kind: 'reserved' })
    if (retried.kind !== 'reserved') throw new Error('expected immediate post-release reservation')
    beats.push({
      beat: 5,
      status: 'passed',
      title: 'Concurrent budget',
      outcome: 'rejected',
      summary: 'Two simultaneous 600-minor-unit offers compete for a 1,000-minor-unit envelope; one reserves, one fails, then release makes an immediate resubmission succeed.',
      envelopeAmountMinor: 1_000,
      currency: 'SGD',
      initialRace: {
        offers: competingOffers.map((offer, index) => {
          const result = concurrent[index]
          return {
            agentId: index === 0 ? 'demo-agent-a' : 'demo-agent-b',
            offerId: offer.offerId,
            amountMinor: offer.amountMinor,
            result: result.kind,
            reason: result.kind === 'rejected' ? result.reason : null,
          }
        }),
        acceptedOfferId: competingOffers[acceptedIndex].offerId,
        rejectedOfferId: competingOffers[rejectedIndex].offerId,
        rejectedReason: 'insufficient-envelope',
      },
      release: {
        cascadeId: acceptedCascade,
        result: release.kind,
        releasedHolds: release.count,
      },
      resubmission: {
        agentId: retryAgentId,
        offerId: retryOffer.offerId,
        amountMinor: retryOffer.amountMinor,
        result: retried.kind,
        availableWithoutDelay: true,
      },
    })

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
      title: 'Explicit scale boundary',
      outcome: 'rejected',
      summary: 'The real runtime rejects both a 21st leg and a cycle-forming edge, leaving the bundle snapshots unchanged.',
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
    const orchestrationCost = costEntries.find((entry) => entry.component === 'Reopt_Worker')
    expect(costEntries.filter((entry) => entry.component === 'Reopt_Worker')).toHaveLength(1)
    expect(orchestrationCost).toMatchObject({ promptTokens: 0, completionTokens: 0, dollarCost: 0 })
    const permitted = permittedModelSet(JSON.stringify([{
      id: 'demo-model', provider_id: 'demo-provider', license: 'Apache-2.0', path: 'workers-ai-free',
      free_daily_neuron_limit: 10_000,
    }]), '["Apache-2.0","MIT"]')
    expect(permitted).toMatchObject([{ id: 'demo-model', license: 'Apache-2.0', metered: true }])
    if ('kind' in permitted) throw new Error('expected permitted model set')
    const eligibleModel = permitted[0]
    if (!orchestrationCost || !eligibleModel) throw new Error('expected cost and model evidence')
    beats.push({
      beat: 7,
      status: 'passed',
      title: 'Cost and cache',
      outcome: 'observed',
      summary: 'Deterministic orchestration records zero tokens and zero dollars; two identical quote requests dispatch once, and the eligible Workers AI Free model remains quota-metered and licensed.',
      orchestrationCost: {
        component: orchestrationCost.component,
        promptTokens: orchestrationCost.promptTokens,
        completionTokens: orchestrationCost.completionTokens,
        dollarCost: orchestrationCost.dollarCost,
      },
      cache: {
        requests: 2,
        dispatchesWithoutCache: 2,
        dispatchesWithCache: discoveryCalls,
        dispatchesSaved: 2 - discoveryCalls,
        offerId: 'demo-cache-offer',
        priceVerification: 'deterministic-demo',
      },
      model: {
        id: eligibleModel.id,
        providerId: eligibleModel.providerId,
        path: eligibleModel.path,
        license: eligibleModel.license,
        metered: eligibleModel.metered,
        freeDailyNeuronLimit: eligibleModel.freeDailyNeuronLimit,
        execution: 'eligible-not-invoked-by-orchestration',
      },
    })

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
    const convergedSnapshot = surface.snapshot(committed.bundleId)
    expect(convergedSnapshot?.observations).toHaveLength(2)
    expect(surface.render(committed.bundleId)).toContain('Rolled back')
    beats.push({
      beat: 8,
      status: 'passed',
      title: 'Offline and reconnect',
      outcome: 'observed',
      summary: 'The local projection renders offline as not current, retains its observation, and converges to the rolled-back edge observation without loss.',
      offline: {
        rendered: true,
        current: false,
        outcome: committed.kind,
        observationsRetained: 1,
      },
      reconnect: {
        converged: true,
        outcome: convergedSnapshot?.observations.at(-1)?.kind,
        observationsAfterReconnect: convergedSnapshot?.observations.length,
        lostObservations: 0,
      },
      browserSessionRequiredForNetworkProof: true,
    })

    expect(beats).toHaveLength(8)
    expect(beats.every((beat) => beat.status === 'passed')).toBe(true)
    const report = {
      schema: 'agentic-graph-travel-commerce-demo-evidence/v1',
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

function presentLegs(legs: readonly Readonly<{
  legId: string
  category: string
  committedOfferId: string | null
  committedAmountMinor: number | null
}>[]) {
  return legs.map((leg) => ({
    legId: leg.legId,
    category: leg.category,
    relation: leg.legId === 'flight-sin-nrt'
      ? 'changed'
      : leg.legId === 'hotel-shinjuku' ? 'unaffected sibling' : 'affected',
    committedOfferId: leg.committedOfferId,
    committedAmountMinor: leg.committedAmountMinor,
  }))
}
