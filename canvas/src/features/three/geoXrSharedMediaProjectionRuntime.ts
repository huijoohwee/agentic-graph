/**
 * Geographic positions for the shared Media catalog while Geo+XR is active.
 *
 * The map and the WebGL overlay consume the same coordinates. Keeping this
 * small runtime separate from MapLibre means a media mesh does not disappear
 * during a style reload or while vector source tiles are being refreshed.
 */
export type GeoXrSharedMediaProjectionAsset = Readonly<{
  id: string
  coordinate: readonly [number, number]
}>

export type GeoXrSharedMediaProjectionSnapshot = Readonly<{
  revision: number
  origin: readonly [number, number] | null
  assets: readonly GeoXrSharedMediaProjectionAsset[]
}>

type ProjectionListener = () => void
type AssetFocusListener = (targetId: string) => boolean

const listeners = new Set<ProjectionListener>()
const assetFocusListeners = new Set<AssetFocusListener>()

let snapshot: GeoXrSharedMediaProjectionSnapshot = Object.freeze({
  revision: 0,
  origin: null,
  assets: Object.freeze([]),
})
let pendingFocusTargetId = ''

function notifyPendingAssetFocus(): void {
  if (!pendingFocusTargetId) return
  for (const listener of [...assetFocusListeners]) {
    if (!listener(pendingFocusTargetId)) continue
    pendingFocusTargetId = ''
    break
  }
}

function sameAssets(
  left: readonly GeoXrSharedMediaProjectionAsset[],
  right: readonly GeoXrSharedMediaProjectionAsset[],
): boolean {
  return left.length === right.length && left.every((asset, index) => {
    const candidate = right[index]
    return asset.id === candidate?.id
      && asset.coordinate[0] === candidate.coordinate[0]
      && asset.coordinate[1] === candidate.coordinate[1]
  })
}

export function readGeoXrSharedMediaProjection(): GeoXrSharedMediaProjectionSnapshot {
  return snapshot
}

export function subscribeGeoXrSharedMediaProjection(listener: ProjectionListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Register the active Geo+XR map camera as the focus owner for shared Media
 * assets. The pending request is retried as the map becomes available.
 */
export function subscribeGeoXrSharedMediaAssetFocus(listener: AssetFocusListener): () => void {
  assetFocusListeners.add(listener)
  notifyPendingAssetFocus()
  return () => assetFocusListeners.delete(listener)
}

export function requestGeoXrSharedMediaAssetFocus(targetIdValue: string): boolean {
  const targetId = String(targetIdValue || '').trim()
  if (!targetId || assetFocusListeners.size === 0 || !snapshot.assets.some(asset => asset.id === targetId)) return false
  pendingFocusTargetId = targetId
  notifyPendingAssetFocus()
  return pendingFocusTargetId === ''
}

export function retryGeoXrSharedMediaAssetFocus(): void {
  notifyPendingAssetFocus()
}

export function publishGeoXrSharedMediaProjection(
  values: readonly GeoXrSharedMediaProjectionAsset[],
  origin?: readonly [number, number] | null,
): GeoXrSharedMediaProjectionSnapshot {
  const unique = new Set<string>()
  const assets = Object.freeze(values.flatMap(value => {
    const id = String(value?.id || '').trim()
    const coordinate = value?.coordinate
    const lng = Number(coordinate?.[0])
    const lat = Number(coordinate?.[1])
    if (!id || unique.has(id) || !Number.isFinite(lng) || !Number.isFinite(lat)) return []
    unique.add(id)
    return [Object.freeze({ id, coordinate: Object.freeze([lng, lat] as const) })]
  }))
  const lng = Number(origin?.[0])
  const lat = Number(origin?.[1])
  const nextOrigin = Number.isFinite(lng) && Number.isFinite(lat)
    ? Object.freeze([lng, lat] as const)
    : null
  if (
    sameAssets(snapshot.assets, assets)
    && snapshot.origin?.[0] === nextOrigin?.[0]
    && snapshot.origin?.[1] === nextOrigin?.[1]
  ) return snapshot
  snapshot = Object.freeze({ revision: snapshot.revision + 1, origin: nextOrigin, assets })
  for (const listener of [...listeners]) listener()
  notifyPendingAssetFocus()
  return snapshot
}
