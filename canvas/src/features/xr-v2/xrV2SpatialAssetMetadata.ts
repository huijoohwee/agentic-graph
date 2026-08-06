import {
  XR_V2_CAPABILITY_TIERS,
  type XrV2CapabilityTier,
} from './capabilityContract'

export const XR_V2_SPATIAL_ASSET_METADATA_FIELDS = Object.freeze([
  'xr_capability_tier',
  'synthesis_mode',
  'depth_metadata_ref',
  'fallback_triggered',
] as const)

export const XR_V2_SYNTHESIS_MODES = Object.freeze([
  'live',
  'post-process',
  'none',
] as const)

export type XrV2SynthesisMode = (typeof XR_V2_SYNTHESIS_MODES)[number]

/** Exact additive asset-contract extension defined by the pinned v2 document. */
export type XrV2SpatialAssetMetadata = Readonly<{
  xr_capability_tier: XrV2CapabilityTier
  synthesis_mode: XrV2SynthesisMode
  depth_metadata_ref: string | null
  fallback_triggered: boolean
}>

const MAX_DEPTH_METADATA_REFERENCE_LENGTH = 2_048

function normalizeDepthMetadataReference(value: string | null): string | null {
  if (value === null) return null
  const normalized = String(value).trim()
  if (!normalized || normalized.length > MAX_DEPTH_METADATA_REFERENCE_LENGTH) {
    throw new Error('depth_metadata_ref must be null or a bounded non-empty reference')
  }
  return normalized
}

export function createXrV2SpatialAssetMetadata(input: Readonly<{
  tier: XrV2CapabilityTier
  synthesisMode: XrV2SynthesisMode
  depthMetadataRef: string | null
  fallbackTriggered: boolean
}>): XrV2SpatialAssetMetadata {
  if (!XR_V2_CAPABILITY_TIERS.includes(input.tier)) {
    throw new Error('xr_capability_tier is outside the pinned closed enum')
  }
  if (!XR_V2_SYNTHESIS_MODES.includes(input.synthesisMode)) {
    throw new Error('synthesis_mode is outside the pinned closed enum')
  }
  if (typeof input.fallbackTriggered !== 'boolean') {
    throw new Error('fallback_triggered must be a boolean')
  }
  const depthMetadataRef = normalizeDepthMetadataReference(input.depthMetadataRef)
  if (input.synthesisMode === 'post-process' && !input.fallbackTriggered) {
    throw new Error('post-process synthesis requires fallback_triggered=true')
  }
  if (input.synthesisMode === 'post-process' && depthMetadataRef === null) {
    throw new Error('post-process synthesis requires a depth_metadata_ref')
  }
  if (input.synthesisMode === 'live' && input.fallbackTriggered) {
    throw new Error('live synthesis cannot claim that fallback was triggered')
  }
  return Object.freeze({
    xr_capability_tier: input.tier,
    synthesis_mode: input.synthesisMode,
    depth_metadata_ref: depthMetadataRef,
    fallback_triggered: input.fallbackTriggered,
  })
}

export function isXrV2SpatialAssetMetadata(
  candidate: unknown,
): candidate is XrV2SpatialAssetMetadata {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
  const value = candidate as Record<string, unknown>
  const keys = Object.keys(value).sort()
  const expected = [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return false
  }
  try {
    createXrV2SpatialAssetMetadata({
      tier: value.xr_capability_tier as XrV2CapabilityTier,
      synthesisMode: value.synthesis_mode as XrV2SynthesisMode,
      depthMetadataRef: value.depth_metadata_ref as string | null,
      fallbackTriggered: value.fallback_triggered as boolean,
    })
    return typeof value.fallback_triggered === 'boolean'
      && (value.depth_metadata_ref === null || typeof value.depth_metadata_ref === 'string')
  } catch {
    return false
  }
}
