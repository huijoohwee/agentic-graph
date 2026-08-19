import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  readMutationEvent,
  readQuote,
  stableJson,
  cascadeIdFor,
  MAX_BUNDLE_LEGS,
  minorUnits,
} from '../../../../src/bundle/bundle-runtime'
import { affectedSet, topologicalOrder } from '../../../../src/bundle/topo-order'
import { availableBalance, conservesBudget, transitionHold } from '../../../../src/ledger/hold-lifecycle'
import { permittedModelSet } from '../../../../src/runtime/model-license-filter'
import { authorizeD1Access } from '../../../../src/runtime/storage-placement-guard'
import { zeroOrchestrationCost } from '../../../../src/runtime/cost-log'
import { deployBoundaryReport } from '../../../../src/runtime/deploy-boundary.ts'
import { ReplanSurface } from '../../../../src/ui/replan-surface'

describe('travel commerce properties', () => {
  it('CP-01 affected-set contains every reachable downstream leg exactly once', () => fc.assert(fc.property(
    fc.integer({ min: 2, max: MAX_BUNDLE_LEGS }), (size) => {
      const legs = Array.from({ length: size }, (_, index) => `l${index}`)
      const edges = legs.slice(1).map((leg, index) => ({ fromLegId: legs[index], toLegId: leg }))
      const result = affectedSet(legs[0], legs, edges)
      expect(result).toEqual({ ok: true, order: legs.slice(1) })
    },
  )))

  it('CP-02 topological ordering is deterministic under input permutations', () => fc.assert(fc.property(
    fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), { minLength: 1, maxLength: MAX_BUNDLE_LEGS }), (legs) => {
      const first = topologicalOrder(legs, [])
      const second = topologicalOrder([...legs].reverse(), [])
      expect(first).toEqual(second)
    },
  )))

  it('CP-03 cycle detection rejects every non-empty directed cycle', () => fc.assert(fc.property(
    fc.integer({ min: 2, max: MAX_BUNDLE_LEGS }), (size) => {
      const legs = Array.from({ length: size }, (_, index) => `l${index}`)
      const edges = legs.map((leg, index) => ({ fromLegId: leg, toLegId: legs[(index + 1) % size] }))
      expect(topologicalOrder(legs, edges)).toEqual({ ok: false, reason: 'cyclic-dependency' })
    },
  )))

  it('CP-04 reserved holds have exactly two legal terminal transitions', () => fc.assert(fc.property(
    fc.constantFrom('committed' as const, 'released' as const), (target) => {
      const hold = reservation('reserved', 10)
      const result = transitionHold(hold, target)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.hold.state).toBe(target)
    },
  )))

  it('CP-05 terminal hold transitions cannot cross terminal states', () => fc.assert(fc.property(
    fc.constantFrom('committed' as const, 'released' as const), (state) => {
      const target = state === 'committed' ? 'released' : 'committed'
      expect(transitionHold(reservation(state, 10), target)).toEqual({ ok: false, reason: 'illegal-transition' })
    },
  )))

  it('CP-06 envelope accounting conserves budget', () => fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000_000 }), fc.array(fc.integer({ min: 0, max: 1_000 }), { maxLength: 20 }),
    (budget, amounts) => { expect(conservesBudget(budget, amounts.map((amount) => reservation('reserved', amount)))).toBe(true) },
  )))

  it('CP-07 released holds restore their entire balance contribution', () => fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 0, max: 1_000_000 }),
    (budget, amount) => { expect(availableBalance(budget, [reservation('released', amount)])).toBe(budget) },
  )))

  it('CP-08 stable JSON is independent of object insertion order', () => fc.assert(fc.property(
    fc.string(), fc.string(), (left, right) => { expect(stableJson({ a: left, b: right })).toBe(stableJson({ b: right, a: left })) },
  )))

  it('CP-09 cascade identifiers are deterministic and event-scoped', () => fc.assert(fc.property(
    identifier(), identifier(), identifier(), (bundleId, legId, eventId) => {
      const event = { bundleId, legId, eventId }
      expect(cascadeIdFor(event)).toBe(cascadeIdFor({ ...event }))
      expect(cascadeIdFor({ ...event, eventId: `${eventId}x` })).not.toBe(cascadeIdFor(event))
    },
  )))

  it('CP-10 malformed mutation events fail closed', () => fc.assert(fc.property(
    fc.anything(), (body) => {
      if (!body || typeof body !== 'object' || Array.isArray(body)) expect(readMutationEvent(body, 'bundle')).toMatchObject({ kind: 'rejected' })
    },
  )))

  it('CP-11 malformed requotes fail closed', () => fc.assert(fc.property(
    fc.anything(), (body) => {
      const result = readQuote(body, 'leg')
      if (!body || typeof body !== 'object' || Array.isArray(body)) expect(result).toMatchObject({ kind: 'rejected' })
    },
  )))

  it('CP-12 only configured FOSS licenses enter the permitted set', () => fc.assert(fc.property(
    identifier(), fc.constantFrom('Apache-2.0', 'MIT'), (id, license) => {
      expect(permittedModelSet(JSON.stringify([{
        id, license, path: 'workers-ai', input_usd_per_million: 0.2, output_usd_per_million: 0.3,
      }]), '["Apache-2.0","MIT"]')).toEqual([{
        id, license, path: 'workers-ai', metered: true, inputUsdPerMillion: 0.2, outputUsdPerMillion: 0.3,
      }])
    },
  )))

  it('CP-13 disallowed model licenses never enter the permitted set', () => fc.assert(fc.property(
    identifier(), fc.string({ minLength: 1 }).filter(
      (value) => value.trim().length > 0 && value !== 'Apache-2.0' && value !== 'MIT',
    ), (id, license) => {
      expect(permittedModelSet(JSON.stringify([{
        id, license, path: 'workers-ai', input_usd_per_million: 0.2, output_usd_per_million: 0.3,
      }]), '["Apache-2.0","MIT"]')).toEqual([])
    },
  )))

  it('CP-14 hot-path D1 access always fails closed', () => fc.assert(fc.property(
    fc.constantFrom('Bundle_Graph_Store', 'Envelope_Ledger', 'Reopt_Worker'), fc.string(),
    (component, purpose) => { expect(authorizeD1Access(component, purpose)).toMatchObject({ kind: 'rejected', reason: 'storage-placement' }) },
  )))

  it('CP-15 orchestration cost entries remain zero and attributable', () => fc.assert(fc.property(
    identifier(), (cascadeId) => { expect(zeroOrchestrationCost(cascadeId)).toMatchObject({ cascadeId, promptTokens: 0, completionTokens: 0, dollarCost: 0 }) },
  )))

  it('CP-16 replan output escapes untrusted identifiers and preserves closed deploy boundaries', () => fc.assert(fc.property(
    fc.string({ minLength: 1 }), (reason) => {
      const storage = new MapStorage()
      const surface = new ReplanSurface(storage)
      surface.project({ kind: 'rolled-back', cascadeId: 'c', bundleId: 'b', changedLegId: '<script>', affected: [], changes: [], netAmountMinor: minorUnits(0), settlementCalls: 0, reason, archiveDeferred: false, elapsedMs: 1 })
      expect(surface.render('b')).not.toContain('<script>')
      expect(deployBoundaryReport({ DEPLOY_LANE: 'Dev_Lane' } as TravelCommerceEnv).boundaries.every((item) => item.state === 'closed')).toBe(true)
    },
  )))
})

function identifier() {
  return fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,20}$/)
}

function reservation(state: 'reserved' | 'committed' | 'released', amountMinor: number) {
  return { holdId: 'h', cascadeId: 'c', legId: 'l', offerId: 'o', amountMinor: minorUnits(amountMinor), state, expiresAt: 1 }
}

class MapStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}
