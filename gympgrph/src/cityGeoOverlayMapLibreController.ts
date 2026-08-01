import type { FitBoundsOptions, LngLatBoundsLike } from 'maplibre-gl'
import {
  readCityGeoOverlay,
  subscribeCityGeoOverlay,
  type CityGeoOverlayListener,
  type CityGeoOverlaySnapshot,
  type CityGeoViewMode,
} from './cityGeoOverlay.js'
import {
  applyCityGeoPresentationToMap,
  cityGeoPresentationStateEntries,
  clearCityGeoPresentationFromMap,
  mapHasExactCityGeoPresentation,
} from './cityGeoPresentationMapLibre.js'
import {
  applyRegionalPoiProfileToMap,
  clearRegionalPoiProfileFromMap,
  mapHasExactRegionalPoiProfile,
  mapHasExactRegionalPoiSource,
  regionalPoiFeatureCollection,
  regionalPoiProfileBounds,
  REGIONAL_POI_LAYER_IDS,
  REGIONAL_POI_SOURCE_ID,
} from './regionalPoiMapLibre.js'
import {
  geoMapViewportPaddingKey,
  observeGeoMapOcclusionChanges,
  readGeoMapViewportPadding,
} from './geoMapViewport.js'

export type CityGeoOverlayMapLibreControllerOptions = Readonly<{
  beforeLayerId?: string | null
  clearOnDispose?: boolean
  frameCity?: boolean
  map: any
  onParcelSelect?: (parcelId: string) => void
  readSnapshot?: () => CityGeoOverlaySnapshot
  subscribe?: (listener: CityGeoOverlayListener) => () => void
  viewMode: CityGeoViewMode
}>

export type CityGeoOverlayMapLibreController = Readonly<{
  apply: () => boolean
  dispose: () => void
  setBeforeLayerId: (layerId: string | null) => boolean
  setViewMode: (viewMode: CityGeoViewMode) => boolean
}>

type CityMapPadding = Readonly<{
  bottom: number
  left: number
  right: number
  top: number
}>

const ZERO_PADDING: CityMapPadding = Object.freeze({
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
})
const CITY_FRAMING_CLEARANCE_APERTURE_FRACTION = 0.1

function readMapPadding(map: any): CityMapPadding {
  const padding = map?.getPadding?.()
  return Object.freeze({
    bottom: Number(padding?.bottom) || 0,
    left: Number(padding?.left) || 0,
    right: Number(padding?.right) || 0,
    top: Number(padding?.top) || 0,
  })
}

function cityViewportPadding(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
  viewMode: CityGeoViewMode,
): CityMapPadding {
  const viewport = readGeoMapViewportPadding(map)
  const requestedClearance = snapshot.profile?.framing[viewMode].paddingPixels ?? 0
  const mapViewport = map?.getContainer?.() as HTMLElement | null | undefined
  const width = Math.max(
    0,
    Number(mapViewport?.clientWidth) || Number(map?.transform?.width) || 0,
  )
  const height = Math.max(
    0,
    Number(mapViewport?.clientHeight) || Number(map?.transform?.height) || 0,
  )
  const horizontalAperture = Math.max(
    0,
    width - viewport.left - viewport.right,
  )
  const verticalAperture = Math.max(
    0,
    height - viewport.top - viewport.bottom,
  )
  const horizontalClearance = horizontalAperture > 0
    ? Math.min(
        requestedClearance,
        horizontalAperture * CITY_FRAMING_CLEARANCE_APERTURE_FRACTION,
      )
    : requestedClearance
  const verticalClearance = verticalAperture > 0
    ? Math.min(
        requestedClearance,
        verticalAperture * CITY_FRAMING_CLEARANCE_APERTURE_FRACTION,
      )
    : requestedClearance
  return Object.freeze({
    bottom: viewport.bottom + verticalClearance,
    left: viewport.left + horizontalClearance,
    right: viewport.right + horizontalClearance,
    top: viewport.top + verticalClearance,
  })
}

function cityViewportSizeKey(map: any): string {
  const viewport = map?.getContainer?.()
  const width = Number(viewport?.clientWidth) || Number(map?.transform?.width) || 0
  const height = Number(viewport?.clientHeight) || Number(map?.transform?.height) || 0
  return `${Math.max(0, width)}x${Math.max(0, height)}`
}

export function fitMapToCityPresentation(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
  viewMode: CityGeoViewMode,
  padding: CityMapPadding = cityViewportPadding(map, snapshot, viewMode),
): boolean {
  let previousPadding: CityMapPadding | null = null
  try {
    if (!snapshot.active || !snapshot.profile) return false
    if (typeof map?.fitBounds !== 'function') return false
    const bounds = regionalPoiProfileBounds(snapshot.profile.regionalPoiProfile)
    const framing = snapshot.profile.framing[viewMode]
    const mapBounds: LngLatBoundsLike = [[...bounds[0]], [...bounds[1]]]
    const options: FitBoundsOptions = {
      bearing: framing.bearingDegrees,
      duration: 0,
      maxZoom: framing.maxZoom,
      padding,
      pitch: framing.pitchDegrees,
    }
    previousPadding = readMapPadding(map)
    map.setPadding?.(ZERO_PADDING)
    map.fitBounds(mapBounds, options)
    return true
  } catch (error) {
    if (previousPadding) {
      try { map?.setPadding?.(previousPadding) } catch { void 0 }
    }
    console.error('[kg-city] MapLibre City Geo framing failed.', error)
    return false
  }
}

function framingKey(
  snapshot: CityGeoOverlaySnapshot,
  viewMode: CityGeoViewMode,
): string | null {
  if (!snapshot.active || !snapshot.profile) return null
  const regionalProfile = snapshot.profile.regionalPoiProfile
  const bounds = regionalPoiProfileBounds(regionalProfile)
  const framing = snapshot.profile.framing[viewMode]
  return [
    snapshot.profile.revision,
    regionalProfile.id,
    regionalProfile.revision,
    viewMode,
    ...bounds[0],
    ...bounds[1],
    framing.bearingDegrees,
    framing.pitchDegrees,
    framing.maxZoom,
    framing.paddingPixels,
  ].join(':')
}

function requireViewMode(viewMode: CityGeoViewMode): CityGeoViewMode {
  if (viewMode !== '2d' && viewMode !== '3d') {
    throw new Error(`Unsupported City Geo view mode ${String(viewMode)}.`)
  }
  return viewMode
}

export function createCityGeoOverlayMapLibreController(
  options: CityGeoOverlayMapLibreControllerOptions,
): CityGeoOverlayMapLibreController {
  const map = options.map
  const viewport = map?.getContainer?.() as HTMLElement | null | undefined
  const readSnapshot = options.readSnapshot || readCityGeoOverlay
  const subscribe = options.subscribe || subscribeCityGeoOverlay
  let beforeLayerId = options.beforeLayerId || null
  let viewMode = requireViewMode(options.viewMode)
  let lastFramingKey: string | null = null
  let disposed = false
  let originalPadding: CityMapPadding | null = null
  let settledRegionalPoiSource: unknown = null

  const clearPresentationEvidence = (): void => {
    if (!viewport) return
    delete viewport.dataset.kgCityGeospatialFeatureCount
    delete viewport.dataset.kgCityGeospatialOverlay
    delete viewport.dataset.kgCityGeospatialPoiFeatureCount
    delete viewport.dataset.kgCityGeospatialPoiProfileId
    delete viewport.dataset.kgCityGeospatialPoiRevision
    delete viewport.dataset.kgCityGeospatialProfileId
    delete viewport.dataset.kgCityGeospatialRevision
    delete viewport.dataset.kgCityGeospatialStateFeatureCount
  }

  const publishPresentationEvidence = (snapshot: CityGeoOverlaySnapshot): void => {
    if (!viewport || !snapshot.active || !snapshot.profile) return
    viewport.dataset.kgCityGeospatialFeatureCount = '0'
    viewport.dataset.kgCityGeospatialOverlay = 'active'
    viewport.dataset.kgCityGeospatialStateFeatureCount = String(
      cityGeoPresentationStateEntries(snapshot).length,
    )
    viewport.dataset.kgCityGeospatialPoiFeatureCount = String(
      regionalPoiFeatureCollection(snapshot.profile.regionalPoiProfile).features.length,
    )
    viewport.dataset.kgCityGeospatialPoiProfileId =
      snapshot.profile.regionalPoiProfile.id
    viewport.dataset.kgCityGeospatialPoiRevision =
      snapshot.profile.regionalPoiProfile.revision
    viewport.dataset.kgCityGeospatialProfileId = snapshot.profile.id
    viewport.dataset.kgCityGeospatialRevision = snapshot.revision
  }

  const restoreOriginalPadding = (): void => {
    if (!originalPadding) return
    map?.setPadding?.(originalPadding)
    originalPadding = null
  }

  const apply = (): boolean => {
    if (disposed) return false
    const snapshot = readSnapshot()
    if (!snapshot.active || !snapshot.profile) {
      const stateCleared = clearCityGeoPresentationFromMap(map)
      const profileCleared = clearRegionalPoiProfileFromMap(map)
      lastFramingKey = null
      settledRegionalPoiSource = null
      clearPresentationEvidence()
      restoreOriginalPadding()
      return stateCleared && profileCleared
    }
    if (!mapHasExactRegionalPoiSource(
      map,
      snapshot.profile.regionalPoiProfile,
    )) settledRegionalPoiSource = null
    const regionalPoiApplied = applyRegionalPoiProfileToMap(
      map,
      snapshot.profile.regionalPoiProfile,
      { beforeLayerId, viewMode },
    )
    const stateApplied = regionalPoiApplied
      && applyCityGeoPresentationToMap(map, snapshot)
    const applied = regionalPoiApplied && stateApplied
    const exactPresentation = applied
      && settledRegionalPoiSource === map?.getSource?.(REGIONAL_POI_SOURCE_ID)
      && mapHasExactRegionalPoiProfile(
        map,
        snapshot.profile.regionalPoiProfile,
        { beforeLayerId, viewMode },
      )
      && mapHasExactCityGeoPresentation(map, snapshot)
    if (exactPresentation) publishPresentationEvidence(snapshot)
    else clearPresentationEvidence()
    if (!applied || options.frameCity === false) return applied
    const padding = cityViewportPadding(map, snapshot, viewMode)
    const sourceKey = framingKey(snapshot, viewMode)
    const nextFramingKey = sourceKey
      ? [sourceKey, geoMapViewportPaddingKey(padding), cityViewportSizeKey(map)].join(':')
      : null
    if (!nextFramingKey || nextFramingKey === lastFramingKey) return applied
    if (!originalPadding) originalPadding = readMapPadding(map)
    if (fitMapToCityPresentation(map, snapshot, viewMode, padding)) {
      lastFramingKey = nextFramingKey
    }
    return applied
  }

  const handleMapStyleReady = (): void => {
    settledRegionalPoiSource = null
    clearCityGeoPresentationFromMap(map)
    apply()
  }
  const handleMapClick = (event: unknown): void => {
    if (!options.onParcelSelect) return
    const snapshot = readSnapshot()
    if (!snapshot.active) return
    const point = (event as { point?: unknown } | null)?.point
    if (!point || typeof map?.queryRenderedFeatures !== 'function') return
    const layers = [
      REGIONAL_POI_LAYER_IDS.outline,
      REGIONAL_POI_LAYER_IDS.extrusion,
      REGIONAL_POI_LAYER_IDS.fill,
    ].filter(layerId => map.getLayer?.(layerId))
    const liveParcelIds = new Set(snapshot.parcels.map(parcel => parcel.id))
    const features = map.queryRenderedFeatures(point, { layers })
    const parcelId = Array.isArray(features)
      ? features.map(feature => {
          if (feature?.properties?.kgRegionalPoiFeatureKind !== 'surface') return ''
          const candidate = String(feature.properties.kgRegionalPoiId || '').trim()
          return liveParcelIds.has(candidate) ? candidate : ''
        }).find(Boolean)
      : null
    if (parcelId) options.onParcelSelect(parcelId)
  }
  const readRegionalPoiPayloadEvent = (event: unknown): Readonly<{
    sourceDataType?: unknown
    sourceId: typeof REGIONAL_POI_SOURCE_ID
  }> | null => {
    if (!event || typeof event !== 'object') return null
    const sourceEvent = event as Readonly<{
      coord?: unknown
      sourceDataType?: unknown
      sourceId?: unknown
      tile?: unknown
    }>
    if (
      sourceEvent.sourceId !== REGIONAL_POI_SOURCE_ID
      || sourceEvent.coord !== undefined
      || sourceEvent.tile !== undefined
    ) return null
    return sourceEvent as Readonly<{
      sourceDataType?: unknown
      sourceId: typeof REGIONAL_POI_SOURCE_ID
    }>
  }
  const handleRegionalPoiSourceLoading = (event: unknown): void => {
    if (!readRegionalPoiPayloadEvent(event)) return
    settledRegionalPoiSource = null
    clearCityGeoPresentationFromMap(map)
    clearPresentationEvidence()
  }
  const handleRegionalPoiSourceData = (event: unknown): void => {
    const sourceEvent = readRegionalPoiPayloadEvent(event)
    if (
      !sourceEvent
      || (sourceEvent.sourceDataType !== 'metadata'
        && sourceEvent.sourceDataType !== 'content')
    ) return
    if (!apply()) return
    const snapshot = readSnapshot()
    if (
      !snapshot.active
      || !snapshot.profile
      || !mapHasExactRegionalPoiProfile(
        map,
        snapshot.profile.regionalPoiProfile,
        { beforeLayerId, viewMode },
      )
    ) return
    settledRegionalPoiSource = map?.getSource?.(REGIONAL_POI_SOURCE_ID) || null
    apply()
  }
  const unsubscribe = subscribe(apply)
  if (typeof map?.on === 'function') {
    map.on('load', handleMapStyleReady)
    map.on('style.load', handleMapStyleReady)
    map.on('resize', apply)
    map.on('click', handleMapClick)
    map.on('sourcedataloading', handleRegionalPoiSourceLoading)
    map.on('sourcedata', handleRegionalPoiSourceData)
  }
  const stopObservingOcclusion = observeGeoMapOcclusionChanges(
    viewport || null,
    apply,
  )
  apply()

  return Object.freeze({
    apply,
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribe()
      if (typeof map?.off === 'function') {
        map.off('load', handleMapStyleReady)
        map.off('style.load', handleMapStyleReady)
        map.off('resize', apply)
        map.off('click', handleMapClick)
        map.off('sourcedataloading', handleRegionalPoiSourceLoading)
        map.off('sourcedata', handleRegionalPoiSourceData)
      }
      stopObservingOcclusion()
      if (options.clearOnDispose !== false) {
        clearCityGeoPresentationFromMap(map)
        clearRegionalPoiProfileFromMap(map)
      }
      clearPresentationEvidence()
      restoreOriginalPadding()
    },
    setBeforeLayerId: (layerId: string | null): boolean => {
      if (disposed) return false
      beforeLayerId = layerId || null
      return apply()
    },
    setViewMode: (nextViewMode: CityGeoViewMode): boolean => {
      if (disposed) return false
      viewMode = requireViewMode(nextViewMode)
      return apply()
    },
  })
}
