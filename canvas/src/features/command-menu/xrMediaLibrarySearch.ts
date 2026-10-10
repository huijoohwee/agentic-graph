import { XR_MOTION_REFERENCE_STAGE_PRESETS } from '@/features/three/xrMotionReferenceModel'
import {
  XR_SCENE_LIBRARY_ASSETS,
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_FEATURED_ASSET_IDS,
  type XrSceneLibraryAsset,
  type XrSceneLibraryCategory,
} from '@/features/three/xrSceneLibrary'

export function matchesXrMediaLibrarySearch(searchText: string, values: readonly string[]): boolean {
  const tokens = String(searchText || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = values.join(' ').toLowerCase()
  return tokens.every(token => haystack.includes(token))
}

export function buildXrMediaLibraryProjection(args: {
  categoryFilter: 'all' | XrSceneLibraryCategory
  searchText: string
  selectedAssetId: string
}) {
  const featuredAssets = XR_SCENE_LIBRARY_FEATURED_ASSET_IDS.map(assetId => (
    XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === assetId)
  )).filter((asset): asset is XrSceneLibraryAsset => Boolean(asset))
  const selectedAsset = featuredAssets.find(asset => asset.id === args.selectedAssetId)
    || featuredAssets.find(asset => asset.id === XR_SCENE_LIBRARY_DEFAULT_ASSET_ID)
    || featuredAssets[0]
  const visibleEnvironments = XR_MOTION_REFERENCE_STAGE_PRESETS.filter(stage => (
    matchesXrMediaLibrarySearch(args.searchText, [stage.label, stage.description, 'environment kit xr 3d'])
  ))
  const visiblePoiDetailAssets = XR_SCENE_LIBRARY_ASSETS.filter(asset => (
    Boolean(asset.poiDetailKitId)
    && matchesXrMediaLibrarySearch(args.searchText, [asset.label, asset.description, ...asset.keywords])
  ))
  const visibleAssets = XR_SCENE_LIBRARY_ASSETS.filter(asset => (
    (args.categoryFilter === 'all' || asset.category === args.categoryFilter)
    && matchesXrMediaLibrarySearch(args.searchText, [asset.label, asset.category, asset.description, ...asset.keywords, asset.mobile ? 'cast marks motion' : 'static'])
  ))
  return { featuredAssets, selectedAsset, visibleAssets, visibleEnvironments, visiblePoiDetailAssets }
}
