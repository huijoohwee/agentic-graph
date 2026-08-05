import {
  XR_V2_CAPABILITY_TIERS,
  type XrV2CapabilityDecision,
  type XrV2CapabilityTier,
} from './capabilityContract'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export const XR_V2_PROGRESSIVE_VIEWER_PLAN_SCHEMA =
  'knowgrph-xr-progressive-viewer-plan/v2' as const
export const XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS = 3

export type XrV2ProgressiveViewerAttemptReason =
  | 'selected-capability-tier'
  | 'depth-parallax-degradation'
  | 'mandatory-flat-degradation'

export type XrV2ProgressiveViewerAttempt = Readonly<{
  order: number
  tier: XrV2CapabilityTier
  reason: XrV2ProgressiveViewerAttemptReason
  runtimeEvidence: 'not-observed'
  requiresRuntimeAdmission: true
}>

export type XrV2ProgressiveViewerPlan = Readonly<{
  schema: typeof XR_V2_PROGRESSIVE_VIEWER_PLAN_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  selectedTier: XrV2CapabilityTier
  attempts: readonly XrV2ProgressiveViewerAttempt[]
  flatFallbackIncluded: true
  runtimeReadiness: 'not-observed'
}>

function assertCapabilityDecision(decision: XrV2CapabilityDecision): void {
  if (!XR_V2_CAPABILITY_TIERS.includes(decision.tier)) {
    throw new Error('progressive viewer received an unknown capability tier')
  }
  if (decision.schema !== 'knowgrph-xr-capability-decision/v2') {
    throw new Error('progressive viewer received an unsupported capability decision')
  }
  if (
    decision.negativePlatformConstraint === 'ios-webxr-unavailable'
    && (decision.tier === 'webxr-ar' || decision.tier === 'webxr-vr')
  ) {
    throw new Error('negative platform constraint cannot admit an immersive viewer tier')
  }
  if (decision.tier === 'pseudo-ar-depth-parallax' && !decision.depthParallaxAssetAdmitted) {
    throw new Error('depth-parallax tier requires an admitted depth-parallax asset')
  }
}

/**
 * Produces a small degradation chain without claiming that any renderer has
 * mounted or played an asset. Immersive tiers may degrade through an admitted
 * depth-parallax asset, and every chain terminates at the flat renderer.
 */
export function planXrV2ProgressiveViewer(
  decision: XrV2CapabilityDecision,
): XrV2ProgressiveViewerPlan {
  assertCapabilityDecision(decision)
  const tiers: XrV2CapabilityTier[] = [decision.tier]
  if (
    (decision.tier === 'webxr-ar' || decision.tier === 'webxr-vr')
    && decision.depthParallaxAssetAdmitted
  ) {
    tiers.push('pseudo-ar-depth-parallax')
  }
  if (!tiers.includes('flat-fallback')) tiers.push('flat-fallback')
  if (tiers.length > XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS) {
    throw new Error('progressive viewer plan exceeded its attempt bound')
  }

  const attempts = tiers.map((tier, order): XrV2ProgressiveViewerAttempt => {
    const reason: XrV2ProgressiveViewerAttemptReason = order === 0
      ? 'selected-capability-tier'
      : tier === 'pseudo-ar-depth-parallax'
        ? 'depth-parallax-degradation'
        : 'mandatory-flat-degradation'
    return Object.freeze({
      order,
      tier,
      reason,
      runtimeEvidence: 'not-observed',
      requiresRuntimeAdmission: true,
    })
  })

  return Object.freeze({
    schema: XR_V2_PROGRESSIVE_VIEWER_PLAN_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    selectedTier: decision.tier,
    attempts: Object.freeze(attempts),
    flatFallbackIncluded: true,
    runtimeReadiness: 'not-observed',
  })
}
