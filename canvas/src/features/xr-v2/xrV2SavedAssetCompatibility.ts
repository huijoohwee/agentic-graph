import type { XrV2CapabilityTier } from './capabilityContract'

export const XR_V2_SAVED_ASSET_COMPATIBILITY_SCHEMA =
  'knowgrph-xr-v2-saved-asset-compatibility/v1' as const

export type XrV2SavedAssetCompatibility = Readonly<{
  schema: typeof XR_V2_SAVED_ASSET_COMPATIBILITY_SCHEMA
  status: 'no-saved-asset' | 'not-rendered' | 'compatible' | 'degraded'
  deviceTier: XrV2CapabilityTier | null
  savedAssetRef: string | null
  authoredTier: XrV2CapabilityTier | null
  presentationTier: XrV2CapabilityTier | null
}>

export function resolveXrV2SavedAssetCompatibility(input: Readonly<{
  deviceTier: XrV2CapabilityTier | null
  savedAssetRef: string | null
  authoredTier: XrV2CapabilityTier | null
  presentationTier: XrV2CapabilityTier | null
}>): XrV2SavedAssetCompatibility {
  const hasAsset = Boolean(input.savedAssetRef && input.authoredTier)
  const status: XrV2SavedAssetCompatibility['status'] = !hasAsset
    ? 'no-saved-asset'
    : input.presentationTier === null
      ? 'not-rendered'
      : input.authoredTier !== 'flat-fallback'
        && input.presentationTier === 'flat-fallback'
        ? 'degraded'
        : 'compatible'
  return Object.freeze({
    schema: XR_V2_SAVED_ASSET_COMPATIBILITY_SCHEMA,
    status,
    deviceTier: input.deviceTier,
    savedAssetRef: hasAsset ? input.savedAssetRef : null,
    authoredTier: hasAsset ? input.authoredTier : null,
    presentationTier: hasAsset ? input.presentationTier : null,
  })
}
