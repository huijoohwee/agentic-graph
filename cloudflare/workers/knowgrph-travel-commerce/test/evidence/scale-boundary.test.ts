import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  stableJson,
} from '../../../../../src/bundle/bundle-runtime'
import type { BundleSeed, Leg } from '../../../../../src/bundle/bundle-types'
import { topologicalOrder } from '../../../../../src/bundle/topo-order'
import { checkAsyncProperty, checkProperty, demoSeed, emitEvidence } from './_support'
import { runtimeEnv } from './_runtime'
import { sourceFor, walkSourceGraph } from './_static-source-graph'

afterEach(() => reset())

type StructuralArm = 'legs' | 'edges' | 'cycle' | 'cross-principal'

describe('check:scale-boundary evidence', () => {
  it('rejects runtime insertions past the declared boundaries, cycles, and cross-principal legs without mutation', async () => {
    let sequence = 0
    const rejectionCounts: Record<StructuralArm, number> = {
      legs: 0,
      edges: 0,
      cycle: 0,
      'cross-principal': 0,
    }
    const cp13Run = await checkAsyncProperty('check:scale-boundary/CP-13', 400, fc.asyncProperty(
      fc.constantFrom<StructuralArm>('legs', 'edges', 'cycle', 'cross-principal'),
      async (arm) => {
        sequence += 1
        rejectionCounts[arm] += 1
        const label = `cp13-${arm}-${sequence}`
        const seed = arm === 'edges' ? boundarySeed(label, true) : arm === 'legs' ? boundarySeed(label, false) : demoSeed(label)
        const graph = runtimeEnv().BUNDLE_GRAPH.getByName(seed.bundleId)
        expect(await graph.initBundle(seed)).toMatchObject({ kind: 'initialized' })
        const before = stableJson(await graph.getSnapshot())

        if (arm === 'legs') {
          expect(await graph.insertLeg(emptyLeg(`node-${MAX_BUNDLE_LEGS}`, seed.principalId))).toEqual({
            kind: 'rejected',
            reason: 'scale-boundary-legs',
            details: { limit: MAX_BUNDLE_LEGS, observed: MAX_BUNDLE_LEGS + 1 },
          })
        } else if (arm === 'edges') {
          expect(await graph.insertEdge({ fromLegId: 'node-01', toLegId: 'node-03' })).toEqual({
            kind: 'rejected',
            reason: 'scale-boundary-edges',
            details: { limit: MAX_BUNDLE_EDGES, observed: MAX_BUNDLE_EDGES + 1 },
          })
        } else if (arm === 'cycle') {
          expect(await graph.insertEdge({ fromLegId: 'transfer-ginza', toLegId: 'flight-sin-nrt' })).toEqual({
            kind: 'rejected', reason: 'cyclic-dependency',
          })
        } else {
          expect(await graph.insertLeg(emptyLeg(`foreign-${sequence}`, `${seed.principalId}-other`))).toEqual({
            kind: 'rejected', reason: 'cross-principal-bundle',
          })
        }
        expect(stableJson(await graph.getSnapshot())).toBe(before)
      },
    ))

    const cp15Run = checkProperty('check:scale-boundary/CP-15', 300, fc.property(
      edgeInsertionCase(),
      ({ legs, edges, insertionOrder }) => {
        const fullRecompute = topologicalOrder(legs, edges)
        expect(fullRecompute.ok).toBe(true)
        expect(edges.length).toBeGreaterThan(0)
        expect(incrementalTopology(legs, insertionOrder)).toEqual(fullRecompute)
        expect(incrementalTopology(legs, [...insertionOrder].reverse())).toEqual(fullRecompute)
      },
    ))
    const graph = walkSourceGraph(['src/bundle/bundle-graph-store.ts'])
    expect(graph.missingRelativeModules).toEqual([])
    expect(graph.imports.filter(({ specifier }) => GRAPH_ENGINE_IMPORT.test(specifier))).toEqual([])
    expect(sourceFor(graph)).not.toMatch(GRAPH_QUERY_LANGUAGE)
    emitEvidence('check:scale-boundary', ['7.1', '7.2', '7.3', '7.4', '7.5', '7.7', '7.8', '7.9', '7.10'], {
      maxLegs: MAX_BUNDLE_LEGS,
      maxEdges: MAX_BUNDLE_EDGES,
      oversizeObserved: MAX_BUNDLE_LEGS + 1,
      edgeOversizeObserved: MAX_BUNDLE_EDGES + 1,
      oversizeReason: 'scale-boundary-legs',
      edgeOversizeReason: 'scale-boundary-edges',
      cycleReason: 'cyclic-dependency',
      crossPrincipalReason: 'cross-principal-bundle',
      legRejections: rejectionCounts.legs,
      edgeRejections: rejectionCounts.edges,
      cycleRejections: rejectionCounts.cycle,
      crossPrincipalRejections: rejectionCounts['cross-principal'],
      cp15Seed: cp15Run.seed,
      cp15NumRuns: cp15Run.numRuns,
      cp15MinimumEdges: 1,
      cp15InsertionOrdersPerCase: 2,
      reachableGraphModulesScanned: graph.modules.length,
      reachableGraphEngineImports: 0,
      structuralMutationApi: 'insertLeg+insertEdge-runtime',
    }, ['CP-13', 'CP-15'], cp13Run)
  }, 180_000)
})

const GRAPH_ENGINE_IMPORT = /(?:neo4j|gremlin|tinkerpop|janusgraph|dgraph|arangodb|graphology)/i
const GRAPH_QUERY_LANGUAGE = /\b(?:MATCH|MERGE)\s*\([^\n]*\)\s*(?:-|<)/

function edgeInsertionCase() {
  return fc.integer({ min: 3, max: MAX_BUNDLE_LEGS }).chain((size) => {
    const legs = Array.from({ length: size }, (_, index) => `leg-${String(index).padStart(2, '0')}`)
    const possible = Array.from({ length: size }, (_, from) => (
      Array.from({ length: size - from - 1 }, (_, offset) => ({
        fromLegId: legs[from],
        toLegId: legs[from + offset + 1],
      }))
    )).flat()
    return fc.shuffledSubarray(possible, {
      minLength: 1,
      maxLength: Math.min(MAX_BUNDLE_EDGES, possible.length),
    }).chain((edges) => fc.shuffledSubarray(edges, {
      minLength: edges.length,
      maxLength: edges.length,
    }).map((insertionOrder) => Object.freeze({
      legs: Object.freeze(legs),
      edges: Object.freeze(edges),
      insertionOrder: Object.freeze(insertionOrder),
    })))
  })
}

function incrementalTopology(
  legs: readonly string[],
  insertionOrder: readonly Readonly<{ fromLegId: string; toLegId: string }>[],
) {
  const inserted: { fromLegId: string; toLegId: string }[] = []
  let result = topologicalOrder(legs, inserted)
  for (const edge of insertionOrder) {
    inserted.push(edge)
    result = topologicalOrder(legs, inserted)
    expect(result.ok).toBe(true)
  }
  return result
}

function boundarySeed(label: string, withMaxEdges: boolean): BundleSeed {
  const template = demoSeed(label, 10_000)
  const legs = Object.freeze(Array.from({ length: MAX_BUNDLE_LEGS }, (_, index) => (
    emptyLeg(`node-${String(index).padStart(2, '0')}`, template.principalId)
  )))
  const chain = legs.slice(1).map((leg, index) => Object.freeze({
    fromLegId: legs[index].legId,
    toLegId: leg.legId,
  }))
  return Object.freeze({
    ...template,
    legs,
    edges: Object.freeze(withMaxEdges
      ? [...chain, Object.freeze({ fromLegId: 'node-00', toLegId: 'node-02' })]
      : []),
  })
}

function emptyLeg(legId: string, principalId: string): Leg {
  return Object.freeze({
    legId,
    principalId,
    category: 'flight',
    committedOfferId: null,
    committedAmountMinor: null,
    lastCascadeId: null,
  })
}
