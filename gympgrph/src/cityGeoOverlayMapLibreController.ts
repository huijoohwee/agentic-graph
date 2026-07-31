import type {
  FitBoundsOptions,
  LngLatBoundsLike,
} from 'maplibre-gl'
import {
  readCityGeoOverlay,
  subscribeCityGeoOverlay,
  type CityGeoOverlayListener,
  type CityGeoOverlaySnapshot,
  type CityGeoViewMode,
} from './cityGeoOverlay.js'
import {
  cityGeoOverlayFramingKey,
  cityGeoPresentationBounds,
} from './cityGeoOverlayProjection.js'
import {
  applyCityGeoOverlayToMap,
  clearCityGeoOverlayFromMap,
  CITY_GEO_OVERLAY_LAYER_IDS,
  CITY_GEO_OVERLAY_SOURCE_ID,
  mapHasExactCityGeoOverlay,
  mapHasExactCityGeoOverlaySource,
} from './cityGeoOverlayMapLibre.js'
import {
  applyRegionalPoiProfileToMap,
  clearRegionalPoiProfileFromMap,
  mapHasExactRegionalPoiProfile,
  mapHasExactRegionalPoiSource,
  regionalPoiFeatureCollection,
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
  subscribe?: (
    listener: CityGeoOverlayListener,
  ) => () => void
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
  const framingClearance =
    snapshot.profile?.framing[viewMode].paddingPixels ?? 0
  return Object.freeze({
    bottom: viewport.bottom + framingClearance,
    left: viewport.left + framingClearance,
    right: viewport.right + framingClearance,
    top: viewport.top + framingClearance,
  })
}

function cityViewportSizeKey(map: any): string {
  const viewport = map?.getContainer?.()
  const width = Math.max(
    0,
    Number(viewport?.clientWidth) || Number(map?.transform?.width) || 0,
  )
  const height = Math.max(
    0,
    Number(viewport?.clientHeight) || Number(map?.transform?.height) || 0,
  )
  return `${width}x${height}`
}

export function fitMapToCityGeoOverlay(
  map: any,
  snapshot: CityGeoOverlaySnapshot,
  viewMode: CityGeoViewMode,
  padding: CityMapPadding = cityViewportPadding(map, snapshot, viewMode),
): boolean {
  let previousPadding: CityMapPadding | null = null
  try {
    if (!snapshot.active || !snapshot.profile) return false
    if (typeof map?.fitBounds !== 'function') return false
    const bounds = cityGeoPresentationBounds(snapshot)
    if (!bounds) return false
    const framing = snapshot.profile.framing[viewMode]
    const mapBounds: LngLatBoundsLike = [
      [...bounds[0]],
      [...bounds[1]],
    ]
    const options: FitBoundsOptions = {
      bearing: framing.bearingDegrees,
      duration: 0,
      maxZoom: framing.maxZoom,
      padding,
      pitch: framing.pitchDegrees,
    }
    // MapLibre combines the transform's current padding with fit options.
    // City owns one absolute viewport aperture, so clear its previous fit
    // before calculating the next one instead of accumulating panel insets.
    previousPadding = readMapPadding(map)
    map.setPadding?.(ZERO_PADDING)
    map.fitBounds(mapBounds, options)
    return true
  } catch (error) {
    if (previousPadding) {
      try {
        map?.setPadding?.(previousPadding)
      } catch {
        void 0
      }
    }
    console.error('[kg-city] MapLibre City Geo framing failed.', error)
    return false
  }
}

function requireViewMode(viewMode: CityGeoViewMode): CityGeoViewMode {
  if (viewMode !== '2d' && viewMode !== '3d') {
    throw new Error(`Unsupported City Geo view mode ${String(viewMode)}.`)
  }
  return viewMode
}

/**
 * Owns the City parcels, their regional POI band, and authored framing.
 * It never replaces the basemap style or imports/claims the Flight camera.
 */
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
  let settledCitySource: unknown = null
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
  }

  const publishPresentationEvidence = (
    snapshot: CityGeoOverlaySnapshot,
  ): void => {
    if (!viewport || !snapshot.active || !snapshot.profile) return
    viewport.dataset.kgCityGeospatialFeatureCount = String(
      snapshot.parcels.length,
    )
    viewport.dataset.kgCityGeospatialOverlay = 'active'
    viewport.dataset.kgCityGeospatialPoiFeatureCount = String(
      regionalPoiFeatureCollection(
        snapshot.profile.regionalPoiProfile,
      ).features.length,
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
    if (
      !snapshot.active
      || !mapHasExactCityGeoOverlaySource(map, snapshot)
    ) {
      settledCitySource = null
    }
    if (
      !snapshot.active
      || !snapshot.profile
      || !mapHasExactRegionalPoiSource(
        map,
        snapshot.profile.regionalPoiProfile,
      )
    ) {
      settledRegionalPoiSource = null
    }
    const cityApplied = applyCityGeoOverlayToMap(map, snapshot, {
      beforeLayerId,
      viewMode,
    })
    const regionalPoiApplied = snapshot.active && snapshot.profile
      ? applyRegionalPoiProfileToMap(
          map,
          snapshot.profile.regionalPoiProfile,
          {
            beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill,
            viewMode,
          },
        )
      : clearRegionalPoiProfileFromMap(map)
    const applied = cityApplied && regionalPoiApplied
    if (!snapshot.active || !snapshot.profile) {
      lastFramingKey = null
      settledCitySource = null
      settledRegionalPoiSource = null
      clearPresentationEvidence()
      restoreOriginalPadding()
      return applied
    }
    const exactPresentation = applied
      && settledCitySource === map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID)
      && settledRegionalPoiSource === map?.getSource?.(
        REGIONAL_POI_SOURCE_ID,
      )
      && mapHasExactCityGeoOverlay(map, snapshot, {
        beforeLayerId,
        viewMode,
      })
      && mapHasExactRegionalPoiProfile(
        map,
        snapshot.profile.regionalPoiProfile,
        {
          beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill,
          viewMode,
        },
      )
    if (exactPresentation) publishPresentationEvidence(snapshot)
    else clearPresentationEvidence()
    if (!applied || options.frameCity === false) return applied
    const padding = cityViewportPadding(map, snapshot, viewMode)
    const sourceFramingKey = cityGeoOverlayFramingKey(snapshot, viewMode)
    const framingKey = sourceFramingKey
      ? [
          sourceFramingKey,
          geoMapViewportPaddingKey(padding),
          cityViewportSizeKey(map),
        ].join(':')
      : null
    if (!framingKey || framingKey === lastFramingKey) return applied
    if (!originalPadding) originalPadding = readMapPadding(map)
    if (fitMapToCityGeoOverlay(map, snapshot, viewMode, padding)) {
      lastFramingKey = framingKey
    }
    return applied
  }

  const handleMapStyleReady = (): void => {
    apply()
  }
  const unsubscribe = subscribe(handleMapStyleReady)
  const handleMapResize = (): void => {
    apply()
  }
  const handleMapClick = (event: unknown): void => {
    if (!options.onParcelSelect) return
    const snapshot = readSnapshot()
    if (!snapshot.active) return
    const point = (event as { point?: unknown } | null)?.point
    if (!point || typeof map?.queryRenderedFeatures !== 'function') return
    const layers = [
      CITY_GEO_OVERLAY_LAYER_IDS.selectedParcel,
      CITY_GEO_OVERLAY_LAYER_IDS.outline,
      CITY_GEO_OVERLAY_LAYER_IDS.extrusion,
      CITY_GEO_OVERLAY_LAYER_IDS.fill,
    ].filter(layerId => map.getLayer?.(layerId))
    if (layers.length === 0) return
    const features = map.queryRenderedFeatures(point, { layers })
    const liveParcelIds = new Set(snapshot.parcels.map(parcel => parcel.id))
    const parcelId = Array.isArray(features)
      ? features.map(feature => {
          if (feature?.properties?.kgCityOverlayKind !== 'parcel') return ''
          const candidate = String(feature?.properties?.parcelId || '').trim()
          return liveParcelIds.has(candidate) ? candidate : ''
        }).find(Boolean)
      : null
    if (parcelId) options.onParcelSelect(parcelId)
  }
  const readOwnedSourcePayloadEvent = (event: unknown): Readonly<{
    sourceDataType?: unknown
    sourceId: typeof CITY_GEO_OVERLAY_SOURCE_ID
      | typeof REGIONAL_POI_SOURCE_ID
  }> | null => {
    if (!event || typeof event !== 'object') return null
    const sourceEvent = event as Readonly<{
      coord?: unknown
      sourceDataType?: unknown
      sourceId?: unknown
      tile?: unknown
    }>
    if (
      sourceEvent.sourceId !== CITY_GEO_OVERLAY_SOURCE_ID
      && sourceEvent.sourceId !== REGIONAL_POI_SOURCE_ID
    ) return null
    // Tile events share the GeoJSON source ID but describe painter work, not a
    // new worker payload. They cannot invalidate or settle City evidence.
    if (sourceEvent.coord !== undefined || sourceEvent.tile !== undefined) {
      return null
    }
    return sourceEvent as Readonly<{
      sourceDataType?: unknown
      sourceId: typeof CITY_GEO_OVERLAY_SOURCE_ID
        | typeof REGIONAL_POI_SOURCE_ID
    }>
  }
  const handleCitySourceLoading = (event: unknown): void => {
    const sourceEvent = readOwnedSourcePayloadEvent(event)
    if (!sourceEvent) return
    if (sourceEvent.sourceId === CITY_GEO_OVERLAY_SOURCE_ID) {
      settledCitySource = null
    } else {
      settledRegionalPoiSource = null
    }
    clearPresentationEvidence()
  }
  const handleCitySourceData = (event: unknown): void => {
    const sourceEvent = readOwnedSourcePayloadEvent(event)
    if (!sourceEvent) return
    if (
      sourceEvent.sourceDataType !== 'metadata'
      && sourceEvent.sourceDataType !== 'content'
    ) return
    if (!apply()) return
    const snapshot = readSnapshot()
    if (!snapshot.active || !snapshot.profile) return
    if (sourceEvent.sourceId === CITY_GEO_OVERLAY_SOURCE_ID) {
      if (!mapHasExactCityGeoOverlay(map, snapshot, {
        beforeLayerId,
        viewMode,
      })) return
      settledCitySource =
        map?.getSource?.(CITY_GEO_OVERLAY_SOURCE_ID) || null
    } else {
      if (!mapHasExactRegionalPoiProfile(
        map,
        snapshot.profile.regionalPoiProfile,
        {
          beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill,
          viewMode,
        },
      )) return
      settledRegionalPoiSource =
        map?.getSource?.(REGIONAL_POI_SOURCE_ID) || null
    }
    apply()
  }
  if (typeof map?.on === 'function') {
    map.on('load', handleMapStyleReady)
    map.on('style.load', handleMapStyleReady)
    map.on('resize', handleMapResize)
    map.on('click', handleMapClick)
    map.on('sourcedataloading', handleCitySourceLoading)
    map.on('sourcedata', handleCitySourceData)
  }
  const stopObservingOcclusion = observeGeoMapOcclusionChanges(
    viewport || null,
    handleMapResize,
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
        map.off('resize', handleMapResize)
        map.off('click', handleMapClick)
        map.off('sourcedataloading', handleCitySourceLoading)
        map.off('sourcedata', handleCitySourceData)
      }
      stopObservingOcclusion()
      if (options.clearOnDispose !== false) {
        clearCityGeoOverlayFromMap(map)
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
