import type {
  XrCapabilityEntryMode,
  XrCapabilitySnapshot,
} from '../../lib/three/ThreeGraphXrSessionPolicy'
import { XR_V2_CONTRACT_VERSION } from './captureContracts'

export const XR_V2_CAPABILITY_PROJECTION_SCHEMA = 'agentic-graph-xr-capability-projection/v2' as const
export const XR_V2_CAPABILITY_DECISION_SCHEMA = 'agentic-graph-xr-capability-decision/v2' as const

export const XR_V2_ENTRY_MODES = [
  'immersive-session',
  'inline-viewer',
  'monocular-capture',
  'native-handoff',
  'unsupported',
] as const satisfies readonly XrCapabilityEntryMode[]

export const XR_V2_CAPABILITY_TIERS = Object.freeze([
  'webxr-ar',
  'webxr-vr',
  'pseudo-ar-depth-parallax',
  'flat-fallback',
] as const)

export type XrV2CapabilityTier = (typeof XR_V2_CAPABILITY_TIERS)[number]
export type XrV2ImmersiveMode = 'immersive-ar' | 'immersive-vr'
export type XrV2NegativePlatformConstraint = 'none' | 'ios-webxr-unavailable'

export type XrV2CapabilityDecisionReason =
  | 'immersive-ar-feature-admitted'
  | 'immersive-vr-feature-admitted'
  | 'ios-webxr-negative-constraint'
  | 'depth-parallax-asset-admitted'
  | 'flat-fallback-only'

export type XrV2CapabilityDecision = Readonly<{
  schema: typeof XR_V2_CAPABILITY_DECISION_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  tier: XrV2CapabilityTier
  immersiveMode: XrV2ImmersiveMode | null
  negativePlatformConstraint: XrV2NegativePlatformConstraint
  depthParallaxAssetAdmitted: boolean
  demotedByPlatformConstraint: boolean
  reasons: readonly XrV2CapabilityDecisionReason[]
}>

export type XrV2CapturePipelineAvailability =
  | 'live-depth-preview'
  | 'raw-capture'
  | 'unavailable'

export type XrV2CapabilityProjection = Readonly<{
  schema: typeof XR_V2_CAPABILITY_PROJECTION_SCHEMA
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  entryMode: XrCapabilityEntryMode
  capturePipeline: XrV2CapturePipelineAvailability
  cameraPermission: 'explicit-user-action-required' | 'unavailable'
  canStartMonocularCapture: boolean
}>

/**
 * Resolves the pinned four-tier viewer/capture vocabulary from admitted facts.
 * The optional iOS-class fact is negative-only: it may suppress an otherwise
 * admitted immersive tier, but can never create a capability. Browser identity
 * and user-agent strings are intentionally absent from this contract.
 */
export function resolveXrV2CapabilityDecision(input: Readonly<{
  capability: XrCapabilitySnapshot
  immersiveMode: XrV2ImmersiveMode | null
  negativePlatformConstraint?: XrV2NegativePlatformConstraint
  depthParallaxAssetAdmitted: boolean
}>): XrV2CapabilityDecision {
  if (
    input.negativePlatformConstraint !== undefined
    && input.negativePlatformConstraint !== 'none'
    && input.negativePlatformConstraint !== 'ios-webxr-unavailable'
  ) {
    throw new Error('negativePlatformConstraint is not supported')
  }
  const negativePlatformConstraint = input.negativePlatformConstraint || 'none'
  const immersiveFeatureAdmitted = input.capability.immersive_viewer
    && input.capability.recommended_entry_mode === 'immersive-session'
    && input.immersiveMode !== null
  const immersiveSuppressed = immersiveFeatureAdmitted
    && negativePlatformConstraint === 'ios-webxr-unavailable'

  let tier: XrV2CapabilityTier
  let reasons: readonly XrV2CapabilityDecisionReason[]
  if (immersiveFeatureAdmitted && !immersiveSuppressed) {
    tier = input.immersiveMode === 'immersive-ar' ? 'webxr-ar' : 'webxr-vr'
    reasons = Object.freeze([
      input.immersiveMode === 'immersive-ar'
        ? 'immersive-ar-feature-admitted'
        : 'immersive-vr-feature-admitted',
    ])
  } else if (input.depthParallaxAssetAdmitted) {
    tier = 'pseudo-ar-depth-parallax'
    reasons = Object.freeze(immersiveSuppressed
      ? ['ios-webxr-negative-constraint', 'depth-parallax-asset-admitted']
      : ['depth-parallax-asset-admitted'])
  } else {
    tier = 'flat-fallback'
    reasons = Object.freeze(immersiveSuppressed
      ? ['ios-webxr-negative-constraint', 'flat-fallback-only']
      : ['flat-fallback-only'])
  }

  return Object.freeze({
    schema: XR_V2_CAPABILITY_DECISION_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    tier,
    immersiveMode: immersiveFeatureAdmitted ? input.immersiveMode : null,
    negativePlatformConstraint,
    depthParallaxAssetAdmitted: input.depthParallaxAssetAdmitted,
    demotedByPlatformConstraint: immersiveSuppressed,
    reasons,
  })
}

/**
 * Projects the v2 capture contract without replacing the canonical five-mode
 * entry decision. Model readiness is deliberately injected and never inferred
 * from a device, browser name, or user-agent string.
 */
export function resolveXrV2CapabilityProjection(input: Readonly<{
  capability: XrCapabilitySnapshot
  depthEstimatorAvailable: boolean
}>): XrV2CapabilityProjection {
  const canStartMonocularCapture = input.capability.monocular_capture
  const capturePipeline: XrV2CapturePipelineAvailability = !canStartMonocularCapture
    ? 'unavailable'
    : input.depthEstimatorAvailable ? 'live-depth-preview' : 'raw-capture'

  return Object.freeze({
    schema: XR_V2_CAPABILITY_PROJECTION_SCHEMA,
    contractVersion: XR_V2_CONTRACT_VERSION,
    entryMode: input.capability.recommended_entry_mode,
    capturePipeline,
    cameraPermission: canStartMonocularCapture
      ? 'explicit-user-action-required'
      : 'unavailable',
    canStartMonocularCapture,
  })
}
