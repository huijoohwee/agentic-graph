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

export const XR_V2_PUBLISHED_SPATIAL_ASSET_SCHEMA =
  'agentic-graph-xr-v2-published-spatial-asset/v1' as const

export type XrV2SynthesisMode = (typeof XR_V2_SYNTHESIS_MODES)[number]

/** Exact additive asset-contract extension defined by the pinned v2 document. */
export type XrV2SpatialAssetMetadata = Readonly<{
  xr_capability_tier: XrV2CapabilityTier
  synthesis_mode: XrV2SynthesisMode
  depth_metadata_ref: string | null
  fallback_triggered: boolean
}>

const MAX_DEPTH_METADATA_REFERENCE_LENGTH = 2_048
const MAX_SPATIAL_ASSET_ID_LENGTH = 160

function normalizeDepthMetadataReference(value: string | null): string | null {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new Error('depth_metadata_ref must be null or a string')
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_DEPTH_METADATA_REFERENCE_LENGTH) {
    throw new Error('depth_metadata_ref must be null or a bounded non-empty reference')
  }
  return normalized
}

export type XrV2PublishedSpatialAsset = Readonly<{
  schema: typeof XR_V2_PUBLISHED_SPATIAL_ASSET_SCHEMA
  asset_id: string
  session_id: string
  raw_clip_ref: string
  metadata: XrV2SpatialAssetMetadata
  created_at_ms: number
}>

function boundedValue(label: string, value: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} must be a bounded non-empty value`)
  }
  return normalized
}

export function createXrV2PublishedSpatialAsset(input: Readonly<{
  assetId: string
  sessionId: string
  rawClipRef: string
  metadata: XrV2SpatialAssetMetadata
  createdAtMs: number
}>): XrV2PublishedSpatialAsset {
  if (!Number.isSafeInteger(input.createdAtMs) || input.createdAtMs < 0) {
    throw new Error('created_at_ms must be a non-negative safe integer')
  }
  if (!isXrV2SpatialAssetMetadata(input.metadata)) {
    throw new Error('published spatial asset metadata is malformed')
  }
  const metadata = createXrV2SpatialAssetMetadata({
    tier: input.metadata.xr_capability_tier,
    synthesisMode: input.metadata.synthesis_mode,
    depthMetadataRef: input.metadata.depth_metadata_ref,
    fallbackTriggered: input.metadata.fallback_triggered,
  })
  return Object.freeze({
    schema: XR_V2_PUBLISHED_SPATIAL_ASSET_SCHEMA,
    asset_id: boundedValue('asset_id', input.assetId, MAX_SPATIAL_ASSET_ID_LENGTH),
    session_id: boundedValue('session_id', input.sessionId, MAX_SPATIAL_ASSET_ID_LENGTH),
    raw_clip_ref: boundedValue('raw_clip_ref', input.rawClipRef, MAX_DEPTH_METADATA_REFERENCE_LENGTH),
    metadata,
    created_at_ms: input.createdAtMs,
  })
}

export function isXrV2PublishedSpatialAsset(
  candidate: unknown,
): candidate is XrV2PublishedSpatialAsset {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
  const value = candidate as Record<string, unknown>
  if (Object.keys(value).sort().join(',') !== [
    'asset_id', 'created_at_ms', 'metadata', 'raw_clip_ref', 'schema', 'session_id',
  ].sort().join(',')) return false
  try {
    createXrV2PublishedSpatialAsset({
      assetId: value.asset_id as string,
      sessionId: value.session_id as string,
      rawClipRef: value.raw_clip_ref as string,
      metadata: value.metadata as XrV2SpatialAssetMetadata,
      createdAtMs: value.created_at_ms as number,
    })
    return value.schema === XR_V2_PUBLISHED_SPATIAL_ASSET_SCHEMA
  } catch {
    return false
  }
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
