import {
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  isIdentifier,
  isMinorUnits,
} from './bundle-runtime'
import type {
  BundleSeed,
  CommittedPosition,
  Edge,
  Leg,
  Rejection,
} from './bundle-types'

export function validateSeed(seed: BundleSeed): Rejection | null {
  if (!seed || !isIdentifier(seed.bundleId) || !isIdentifier(seed.principalId) || !isMinorUnits(seed.totalBudgetMinor)) {
    return { kind: 'rejected', reason: 'bundle-malformed' }
  }
  if (!Array.isArray(seed.legs) || seed.legs.length === 0 || seed.legs.length > MAX_BUNDLE_LEGS) {
    return scaleRejection('legs', seed.legs?.length ?? -1)
  }
  if (!Array.isArray(seed.edges) || seed.edges.length > MAX_BUNDLE_EDGES) {
    return scaleRejection('edges', seed.edges?.length ?? -1)
  }
  if (new Set(seed.legs.map((leg) => leg.legId)).size !== seed.legs.length) {
    return { kind: 'rejected', reason: 'duplicate-leg' }
  }
  if (seed.legs.some((leg) => validateLeg(leg, seed.principalId) != null)) {
    return { kind: 'rejected', reason: 'cross-principal-bundle' }
  }
  const edgeKeys = seed.edges.map(edgeKey)
  if (new Set(edgeKeys).size !== edgeKeys.length) return { kind: 'rejected', reason: 'duplicate-edge' }
  if (seed.edges.some((edge) => !isIdentifier(edge.fromLegId) || !isIdentifier(edge.toLegId))) {
    return { kind: 'rejected', reason: 'bundle-malformed' }
  }
  return null
}

export function validateLeg(leg: Leg, principalId: string): Rejection | null {
  if (!isIdentifier(leg.legId) || leg.principalId !== principalId || !isIdentifier(leg.category)) {
    return { kind: 'rejected', reason: 'cross-principal-bundle' }
  }
  const offerPresent = leg.committedOfferId != null
  const amountPresent = leg.committedAmountMinor != null
  if (offerPresent !== amountPresent) return { kind: 'rejected', reason: 'bundle-malformed' }
  if (offerPresent && (!isIdentifier(leg.committedOfferId) || !isMinorUnits(leg.committedAmountMinor))) {
    return { kind: 'rejected', reason: 'bundle-malformed' }
  }
  return null
}

export function committedPositions(seed: BundleSeed): readonly CommittedPosition[] {
  return Object.freeze(seed.legs.flatMap((leg) => (
    leg.committedOfferId != null && leg.committedAmountMinor != null
      ? [Object.freeze({
        bundleId: seed.bundleId,
        legId: leg.legId,
        offerId: leg.committedOfferId,
        amountMinor: leg.committedAmountMinor,
      })]
      : []
  )))
}

export function scaleRejection(kind: 'legs' | 'edges', observed: number): Rejection {
  const limit = kind === 'legs' ? MAX_BUNDLE_LEGS : MAX_BUNDLE_EDGES
  return { kind: 'rejected', reason: `scale-boundary-${kind}`, details: { limit, observed } }
}

export function edgeKey(edge: Edge): string {
  return JSON.stringify([edge.fromLegId, edge.toLegId])
}
