import { reset } from 'cloudflare:test'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_BUNDLE_EDGES, MAX_BUNDLE_LEGS } from '../../../../../src/bundle/bundle-runtime'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { affectedSet } from '../../../../../src/bundle/topo-order'
import { executionContext, initialize, localDemoAdapters } from './_runtime'
import { checkProperty, demoSeed, emitEvidence, percentile } from './_support'

type WalkCase = Readonly<{
  legs: readonly string[]
  edges: readonly Readonly<{ fromLegId: string; toLegId: string }>[]
  changed: string
}>

afterEach(() => reset())

describe('check:affected-set evidence', () => {
  it('proves precise single-visit BFS and one terminal row per Cascade in the append-only Session_Log', async () => {
    const precisionRun = checkProperty('check:affected-set/CP-1', 300, fc.property(
      generatedDag(),
      ({ legs, edges, changed }) => {
        const expected = referenceReachable(changed, edges)
        const result = affectedSet(changed, legs, edges)
        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(new Set(result.order)).toEqual(expected)
          expect(result.order).not.toContain(changed)
          expect(result.order).toHaveLength(expected.size)
        }
      },
    ))
    const singleVisitRun = checkProperty('check:affected-set/CP-2', 200, fc.property(
      fc.oneof(generatedDag(), fc.constant(diamondCase()), fc.constant(wideFanoutCase())),
      ({ legs, edges, changed }) => {
        const visits = new Map<string, number>()
        const result = affectedSet(changed, legs, edges, (legId) => {
          visits.set(legId, (visits.get(legId) ?? 0) + 1)
        })
        expect(result.ok).toBe(true)
        expect([...visits.values()].every((count) => count <= 1)).toBe(true)
        expect(visits.size).toBeLessThanOrEqual(legs.length)
      },
    ))
    expect(affectedSet('a', ['a', 'b'], [
      { fromLegId: 'a', toLegId: 'b' }, { fromLegId: 'b', toLegId: 'a' },
    ])).toEqual({ ok: false, reason: 'cyclic-dependency' })
    expect(affectedSet('isolated', ['isolated', 'x', 'y'], [
      { fromLegId: 'x', toLegId: 'y' }, { fromLegId: 'y', toLegId: 'x' },
    ])).toEqual({ ok: true, order: [] })

    const seed = demoSeed('affected-log-contract', 10_000)
    const { graph, localEnv } = await initialize(seed)
    expect(await graph.isPresent('flight-sin-nrt')).toBe(true)
    expect(await graph.isPresent('missing-leg')).toBe(false)
    expect(await graph.getAdjacencyDiagnostics()).toEqual({ buildsThisWake: 1, edgeCount: seed.edges.length })
    const measurements: number[] = []
    for (let sample = 0; sample < 100; sample += 1) {
      const started = performance.now()
      expect(await graph.affectedSet('flight-sin-nrt')).toEqual({
        ok: true, order: ['experience-tsukiji', 'transfer-ginza'],
      })
      measurements.push(performance.now() - started)
    }
    const walkP95Ms = percentile(measurements, 95)
    expect(walkP95Ms).toBeLessThan(50)
    expect(await graph.getAdjacencyDiagnostics()).toEqual({ buildsThisWake: 1, edgeCount: seed.edges.length })

    const committedEvent = { bundleId: seed.bundleId, legId: 'flight-sin-nrt', eventId: 'committed' }
    const harness = localDemoAdapters({ 'experience-tsukiji': 350, 'transfer-ginza': 225 })
    const committed = await new ReoptWorker(localEnv, executionContext(), harness.adapters)
      .handleMutation(committedEvent)
    expect(committed).toMatchObject({ kind: 'committed' })
    const noOpEvent = { bundleId: seed.bundleId, legId: 'hotel-shinjuku', eventId: 'no-op' }
    expect(await graph.beginCascade(noOpEvent)).toMatchObject({
      kind: 'terminal', outcome: { kind: 'no-op', affected: [] },
    })
    const rejectedEvent = { bundleId: seed.bundleId, legId: 'missing-leg', eventId: 'rejected' }
    expect(await graph.beginCascade(rejectedEvent)).toMatchObject({
      kind: 'terminal', outcome: { kind: 'rejected', reason: 'unknown-leg' },
    })
    const expectedLogs = [
      {
        event: committedEvent, outcome: 'committed', affected: ['experience-tsukiji', 'transfer-ginza'],
        requiredEventTypes: [
          'cascade-started', 'commit-prepared', 'settlement-attempted', 'settlement-verified',
          'split-committed', 'bundle-committed', 'cascade-committed',
        ],
        terminalEventType: 'cascade-committed',
      },
      {
        event: noOpEvent, outcome: 'no-op', affected: [], requiredEventTypes: ['no-op'],
        terminalEventType: 'no-op',
      },
      {
        event: rejectedEvent, outcome: 'rejected', affected: [], requiredEventTypes: ['rejected'],
        terminalEventType: 'rejected',
      },
    ]
    const logs = await graph.getSessionLog()
    for (const expected of expectedLogs) {
      const cascadeId = `${expected.event.bundleId}:${expected.event.legId}:${expected.event.eventId}`
      const matching = logs.filter((entry) => entry.cascadeId === cascadeId)
      const eventTypes = new Set(matching.map((entry) => entry.eventType))
      for (const eventType of expected.requiredEventTypes) expect(eventTypes.has(eventType)).toBe(true)
      const terminal = matching.filter((entry) => (
        entry.outcome === expected.outcome && entry.eventType === expected.terminalEventType
      ))
      expect(terminal).toHaveLength(1)
      expect(terminal[0]).toMatchObject({
        bundleId: seed.bundleId, changedLegId: expected.event.legId, outcome: expected.outcome,
      })
      expect(JSON.parse(String(terminal[0].affected))).toEqual(expected.affected)
    }
    emitEvidence('check:affected-set', ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '8.5'], {
      walkSamples: measurements.length,
      walkP95Ms,
      sessionLogRows: logs.length,
      terminalSessionLogRowsPerCascade: 1,
      appendOnlySessionLog: true,
      loggedTerminalKinds: expectedLogs.map((entry) => entry.outcome),
      separatePresenceReads: 2,
      adjacencyBuildsThisWake: 1,
      cp2Seed: singleVisitRun.seed,
      cp2NumRuns: singleVisitRun.numRuns,
      maximumObservedVisitsPerLeg: 1,
    }, ['CP-1', 'CP-2'], precisionRun)
  }, 120_000)
})

function generatedDag(): fc.Arbitrary<WalkCase> {
  return fc.record({
    size: fc.integer({ min: 1, max: MAX_BUNDLE_LEGS }),
    changedIndex: fc.integer({ min: 0, max: MAX_BUNDLE_LEGS - 1 }),
    candidates: fc.array(fc.tuple(
      fc.integer({ min: 0, max: MAX_BUNDLE_LEGS - 1 }),
      fc.integer({ min: 0, max: MAX_BUNDLE_LEGS - 1 }),
    ), { maxLength: MAX_BUNDLE_EDGES }),
  }).map(({ size, changedIndex, candidates }) => {
    const legs = Array.from({ length: size }, (_, index) => `leg-${index}`)
    const keys = new Set<string>()
    const edges = candidates.flatMap(([left, right]) => {
      const from = Math.min(left, right)
      const to = Math.max(left, right)
      const key = `${from}:${to}`
      if (from === to || to >= size || keys.has(key)) return []
      keys.add(key)
      return [{ fromLegId: legs[from], toLegId: legs[to] }]
    })
    return Object.freeze({ legs, edges, changed: legs[changedIndex % size] })
  })
}

function diamondCase(): WalkCase {
  return Object.freeze({
    legs: ['root', 'left', 'right', 'join'], changed: 'root',
    edges: [
      { fromLegId: 'root', toLegId: 'left' }, { fromLegId: 'root', toLegId: 'right' },
      { fromLegId: 'left', toLegId: 'join' }, { fromLegId: 'right', toLegId: 'join' },
    ],
  })
}

function wideFanoutCase(): WalkCase {
  const legs = Array.from({ length: MAX_BUNDLE_LEGS }, (_, index) => `wide-${index}`)
  return Object.freeze({
    legs, changed: legs[0],
    edges: legs.slice(1).map((legId) => ({ fromLegId: legs[0], toLegId: legId })),
  })
}

function referenceReachable(changed: string, edges: WalkCase['edges']): Set<string> {
  const result = new Set<string>()
  const queue = [changed]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const edge of edges) {
      if (edge.fromLegId !== queue[cursor] || edge.toLegId === changed || result.has(edge.toLegId)) continue
      result.add(edge.toLegId)
      queue.push(edge.toLegId)
    }
  }
  return result
}
