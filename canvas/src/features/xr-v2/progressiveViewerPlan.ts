import {
  XR_V2_CAPABILITY_TIERS,
  type XrV2CapabilityDecision,
  type XrV2CapabilityTier,
} from './capabilityContract'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export const XR_V2_PROGRESSIVE_VIEWER_PLAN_SCHEMA =
  'agentic-graph-xr-progressive-viewer-plan/v2' as const
export const XR_V2_MAX_PROGRESSIVE_VIEWER_ATTEMPTS = 3

export type XrV2ProgressiveViewerAttemptReason =
  | 'selected-capability-tier'
  | 'saved-asset-compatibility'
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

export const XR_V2_PROGRESSIVE_VIEWER_RUNTIME_SCHEMA =
  'agentic-graph-xr-progressive-viewer-runtime/v1' as const

export type XrV2ProgressiveViewerRuntimeAdmission = Readonly<{
  webXrArSessionEntered: boolean
  webXrVrSessionEntered: boolean
  depthParallaxAssetMounted: boolean
  flatFallbackMounted: boolean
}>

export type XrV2ProgressiveViewerRuntimeAttempt = Readonly<{
  order: number
  tier: XrV2CapabilityTier
  status: 'rendered' | 'not-admitted' | 'not-attempted'
}>

export type XrV2ProgressiveViewerRuntime = Readonly<{
  schema: typeof XR_V2_PROGRESSIVE_VIEWER_RUNTIME_SCHEMA
  status: 'rendered' | 'unavailable'
  plannedTier: XrV2CapabilityTier
  renderedTier: XrV2CapabilityTier | null
  attempts: readonly XrV2ProgressiveViewerRuntimeAttempt[]
  flatFallbackRendered: boolean
  permissionRequested: false
}>

function assertCapabilityDecision(decision: XrV2CapabilityDecision): void {
  if (!XR_V2_CAPABILITY_TIERS.includes(decision.tier)) {
    throw new Error('progressive viewer received an unknown capability tier')
  }
  if (decision.schema !== 'agentic-graph-xr-capability-decision/v2') {
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
  options: Readonly<{
    savedAssetTier?: XrV2CapabilityTier | null
  }> = {},
): XrV2ProgressiveViewerPlan {
  assertCapabilityDecision(decision)
  const savedAssetTier = options.savedAssetTier || null
  const immersive = decision.tier === 'webxr-ar' || decision.tier === 'webxr-vr'
  const tiers: XrV2CapabilityTier[] = savedAssetTier === 'pseudo-ar-depth-parallax'
    ? (immersive ? [decision.tier, savedAssetTier] : [savedAssetTier])
    : savedAssetTier === 'flat-fallback'
      ? (immersive ? [decision.tier] : [savedAssetTier])
      : [decision.tier]
  if (
    savedAssetTier === null && immersive
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
      ? (tier === decision.tier ? 'selected-capability-tier' : 'saved-asset-compatibility')
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

function tierAdmitted(
  tier: XrV2CapabilityTier,
  admission: XrV2ProgressiveViewerRuntimeAdmission,
): boolean {
  if (tier === 'webxr-ar') return admission.webXrArSessionEntered
  if (tier === 'webxr-vr') return admission.webXrVrSessionEntered
  if (tier === 'pseudo-ar-depth-parallax') return admission.depthParallaxAssetMounted
  return admission.flatFallbackMounted
}

/**
 * Resolves only already-observed renderer admissions. It never requests an XR
 * session and therefore safely demonstrates the mounted flat fallback before
 * any optional immersive-session action.
 */
export function resolveXrV2ProgressiveViewerRuntime(
  plan: XrV2ProgressiveViewerPlan,
  admission: XrV2ProgressiveViewerRuntimeAdmission,
): XrV2ProgressiveViewerRuntime {
  if (plan.schema !== XR_V2_PROGRESSIVE_VIEWER_PLAN_SCHEMA) {
    throw new Error('progressive viewer runtime received an unsupported plan')
  }
  let renderedTier: XrV2CapabilityTier | null = null
  const attempts = plan.attempts.map(attempt => {
    let status: XrV2ProgressiveViewerRuntimeAttempt['status'] = 'not-attempted'
    if (renderedTier === null) {
      if (tierAdmitted(attempt.tier, admission)) {
        renderedTier = attempt.tier
        status = 'rendered'
      } else {
        status = 'not-admitted'
      }
    }
    return Object.freeze({ order: attempt.order, tier: attempt.tier, status })
  })
  return Object.freeze({
    schema: XR_V2_PROGRESSIVE_VIEWER_RUNTIME_SCHEMA,
    status: renderedTier === null ? 'unavailable' : 'rendered',
    plannedTier: plan.selectedTier,
    renderedTier,
    attempts: Object.freeze(attempts),
    flatFallbackRendered: renderedTier === 'flat-fallback',
    permissionRequested: false,
  })
}
