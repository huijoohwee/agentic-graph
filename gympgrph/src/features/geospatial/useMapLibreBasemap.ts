import React from 'react'
import { tryCreateGrabMapsLibraryMap } from 'grph-shared/geospatial/grabMapsLibrary'
import { GEOSPATIAL_STYLE_URL_CHANGED_EVENT } from 'grph-shared/geospatial/constants'
import {
  normalizeGeoPoiRichMediaProperties,
  type GeoPoiRichMediaProperties,
} from 'grph-shared/geospatial/poiRichMedia'
import { LS_KEYS } from '../../lib/config.js'
import {
  createFlightGeoOverlayMapLibreCamera,
  mapHasExactFlightGeoOverlay,
  mapHasExactFlightGeoOverlayCamera,
  mapHasExactFlightGeoStyleSources,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../flightGeoOverlayMapLibre.js'
import {
  mapHasExactFlightGeoEnvironment,
} from '../../flightGeoEnvironmentMapLibre.js'
import { readFlightGeoOverlay } from '../../flightGeoOverlay.js'
import { readFlightGeoMapViewportPadding } from '../../flightGeoMapViewport.js'
import {
  MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  MAPLIBRE_DEFAULT_STYLE_URL,
  SAFE_SVG_FALLBACK_STYLE_SENTINEL,
} from './basemapStyle.js'
import {
  beginMapLibreFlightBootstrap,
  disposeMapLibreFlightBootstrap,
  reconcileMapLibreFlightBootstrap,
} from './mapLibreFlightBootstrap.js'
import {
  acquireMapLibreMapDisposalPreparation,
  claimMapLibreMapLease,
  readActiveNativeGeospatialMapLibreMap,
  type MapLibreMapOwnerScope,
} from './mapLibreHostLease.js'
import {
  createSingaporeMapInitialCameraOptions,
  readSingaporeCanvasCameraPolicy,
} from './singaporeMapPolicy.js'
import {
  createMapLibreInitialCameraAlignment,
} from './mapLibreInitialCameraAlignment.js'
import {
  mapHasExactFlightLayerState,
} from './flightGeoOverlayPresentationContracts.js'
import {
  isFlightGeoMapLibreDisposalPrepared,
  prepareFlightGeoMapLibreForDisposal,
} from './flightGeoMapLibreDisposal.js'
import {
  isGrabMapsUrl,
  loadMapLibreProviderStyleDocument,
  preflightMapLibreStyle,
  resolveGrabMapsRequestTarget,
  resolveInitialMapLibreStyle,
  shouldPreflightInitialMapLibreStyle,
} from './mapLibreProviderStyle.js'

export {
  loadMapLibreProviderStyleDocument,
  shouldPreflightInitialMapLibreStyle,
}

type BasemapProbe = {
  tileSourceId: string
  tilesLoaded: boolean
  canvasW: number
  canvasH: number
  zoom: number
  lng: number
  lat: number
}

type BasemapResult = {
  map: any | null
  probe: BasemapProbe
  basemapUnavailable: boolean
  mapError: string | null
  styleRevision: number
}

type BasemapPoiClickDetail = {
  label: string
  lng: number
  lat: number
  address?: string
  category?: string
  properties?: GeoPoiRichMediaProperties
}

const EMPTY_PROBE: BasemapProbe = { tileSourceId: '', tilesLoaded: false, canvasW: 0, canvasH: 0, zoom: 0, lng: 0, lat: 0 }
const RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL = MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
const GRABMAPS_RUNTIME_NAVIGATION_GRACE_MS = 1200
const GRABMAPS_IDLE_SERVICE_ERROR_FALLBACK_THRESHOLD = 3
const BASEMAP_SOURCE_ACTIVITY_GRACE_MS = 12_000
const HOST_GRAPH_SOURCE_PREFIX = 'kg-host-graph:nodes'
let mapLibreRuntimePromise: Promise<any> | null = null

const loadMapLibreRuntime = (): Promise<any> => {
  if (!mapLibreRuntimePromise) {
    mapLibreRuntimePromise = (async () =>
      await import('maplibre-gl/dist/maplibre-gl.js'))()
      .catch(error => {
        mapLibreRuntimePromise = null
        throw error
      })
  }
  return mapLibreRuntimePromise
}

export async function preloadMapLibreBasemapRuntime(): Promise<void> {
  await loadMapLibreRuntime()
}

export function readActiveMapLibreMap(): any | null {
  return readActiveNativeGeospatialMapLibreMap()
}

const resolveBasemapStyle = (rawStyleUrl: string | null | undefined) => {
  const trimmed = String(rawStyleUrl || '').trim()
  const lower = trimmed.toLowerCase()
  if (!trimmed) return MAPLIBRE_DEFAULT_STYLE_URL
  if (trimmed === SAFE_SVG_FALLBACK_STYLE_SENTINEL) return null
  if (lower.startsWith('kg:style:')) return MAPLIBRE_DEFAULT_STYLE_URL
  return trimmed
}

const applyGrabMapsAutomaticFallback = (): void => {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(LS_KEYS.geospatialStyleUrl) !== RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL) {
      window.localStorage.setItem(LS_KEYS.geospatialStyleUrl, RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)
    }
    window.dispatchEvent(new Event(GEOSPATIAL_STYLE_URL_CHANGED_EVENT))
  } catch {
    void 0
  }
}

const isAbortLike = (err: unknown): boolean => {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '') : String(err || '')
  const lower = msg.toLowerCase()
  return lower.includes('err_aborted') || lower.includes('aborterror')
}

const isKnownUnsafeMapLibreRuntimeError = (err: unknown): boolean => {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message || '') : String(err || '')
  const lower = msg.toLowerCase()
  return (
    lower.includes("cannot set properties of undefined (setting '0')") ||
    lower.includes("cannot access '_' before initialization") ||
    lower.includes('undefined is not an object') ||
    lower.includes('this.int16[')
  )
}

const isGrabMapsServiceUnavailable = (message: string): boolean => {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  return (
    /\b(500|502|503|504)\b/.test(text) ||
    text.includes('service unavailable') ||
    text.includes('no healthy upstream')
  )
}

const isGrabMapsUnauthorized = (message: string): boolean => {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  if (!(text.includes('maps.grab.com') || text.includes('/__grabmaps_proxy'))) return false
  return text.includes('unauthorized') || /\b401\b/.test(text) || /\b403\b/.test(text)
}

const isGrabMapsProxyMissing = (message: string): boolean => {
  const text = String(message || '').trim().toLowerCase()
  if (!text) return false
  if (!text.includes('/__grabmaps_proxy')) return false
  return text.includes('not found') || /\b404\b/.test(text)
}

const isOpenFreeMapLibertyUrl = (rawUrl: unknown): boolean => {
  const text = String(rawUrl || '').trim().toLowerCase()
  if (!text) return false
  return text.includes('tiles.openfreemap.org/styles/liberty')
}

const isMapActivelyNavigating = (map: any, lastNavigationAtMs: number): boolean => {
  const now = Date.now()
  if (now - lastNavigationAtMs <= GRABMAPS_RUNTIME_NAVIGATION_GRACE_MS) return true
  try {
    if (typeof map?.isMoving === 'function' && map.isMoving() === true) return true
  } catch {
    void 0
  }
  try {
    if (typeof map?.isZooming === 'function' && map.isZooming() === true) return true
  } catch {
    void 0
  }
  return false
}

const POI_NAME_KEYS = ['name', 'name_en', 'poi_name', 'label', 'title', 'display_name'] as const

const readPoiLabelFromFeature = (feature: unknown): string => {
  if (!feature || typeof feature !== 'object') return ''
  const props = (feature as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return ''
  for (const key of POI_NAME_KEYS) {
    const value = (props as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const POI_ADDRESS_KEYS = ['formatted_address', 'address', 'vicinity', 'display_address'] as const

const readPoiAddressFromFeature = (feature: unknown): string => {
  if (!feature || typeof feature !== 'object') return ''
  const props = (feature as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return ''
  for (const key of POI_ADDRESS_KEYS) {
    const value = (props as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const readPoiCategoryFromFeature = (feature: unknown): string => {
  if (!feature || typeof feature !== 'object') return ''
  const props = (feature as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return ''
  const raw = (props as Record<string, unknown>).kgCategory ?? (props as Record<string, unknown>).category
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

const readPoiPropertiesFromFeature = (feature: unknown): GeoPoiRichMediaProperties => {
  if (!feature || typeof feature !== 'object') return {}
  const props = (feature as { properties?: unknown }).properties
  return normalizeGeoPoiRichMediaProperties(props)
}

const isGraphOverlayFeature = (feature: unknown): boolean => {
  if (!feature || typeof feature !== 'object') return false
  const props = (feature as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return false
  const record = props as Record<string, unknown>
  return typeof record.kgCategory === 'string' && String(record.id || '').trim() !== ''
}

const readFeaturePointCoordinates = (feature: unknown): [number, number] | null => {
  if (!feature || typeof feature !== 'object') return null
  const geometry = (feature as { geometry?: unknown }).geometry
  if (!geometry || typeof geometry !== 'object') return null
  const type = String((geometry as { type?: unknown }).type || '')
  const coordinates = (geometry as { coordinates?: unknown }).coordinates
  if (type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2) return null
  const lng = Number(coordinates[0])
  const lat = Number(coordinates[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return [lng, lat]
}

export function useMapLibreBasemap(args: {
  enabled: boolean
  rootRef: React.RefObject<HTMLElement | null>
  containerRef: React.RefObject<HTMLElement | null>
  targetStyleUrl?: string | null
  initialStyleOverride?: Readonly<Record<string, unknown>> | null
  ownerScope?: MapLibreMapOwnerScope
  canvasRenderMode: '2d' | '3d'
  projectionMode: 'mercator' | 'globe'
  viewportSizingMode: 'none' | 'fit'
  vectorFallbackMs: number
  onGrabMapsFallback?: () => void
  onPoiClick?: (detail: BasemapPoiClickDetail) => void
}): BasemapResult {
  const {
    enabled,
    rootRef,
    containerRef,
    targetStyleUrl,
    initialStyleOverride,
    ownerScope = 'embedded-preview',
    canvasRenderMode,
    projectionMode,
    viewportSizingMode,
    vectorFallbackMs,
    onGrabMapsFallback,
    onPoiClick,
  } = args
  const singaporeCamera = readSingaporeCanvasCameraPolicy(canvasRenderMode)
  const singaporeInitialCamera =
    createSingaporeMapInitialCameraOptions(singaporeCamera)
  const mountedMapRef = React.useRef<any | null>(null)
  // The mount effect intentionally does not depend on the bootstrap override:
  // Flight takes over the retained map in place. Load and resize callbacks
  // therefore need the latest ownership rather than their mount-time value.
  const initialStyleOverrideRef = React.useRef(initialStyleOverride)
  initialStyleOverrideRef.current = initialStyleOverride
  const initialStylePreflightAbortRef =
    React.useRef<AbortController | null>(null)
  // Toast handlers close over the live Canvas snapshot. Their identity can
  // change without changing map ownership, so it must not fence a promotion.
  const onGrabMapsFallbackRef = React.useRef(onGrabMapsFallback)
  onGrabMapsFallbackRef.current = onGrabMapsFallback
  const requestedOpenFreeMapLibertyRef = React.useRef(false)
  const [runtimeProjectionMode, setRuntimeProjectionMode] = React.useState<'mercator' | 'globe'>(projectionMode)
  const [state, setState] = React.useState<BasemapResult>({
    map: null,
    probe: EMPTY_PROBE,
    basemapUnavailable: false,
    mapError: null,
    styleRevision: 0,
  })

  React.useEffect(() => {
    if (initialStyleOverride) {
      initialStylePreflightAbortRef.current?.abort()
    }
  }, [initialStyleOverride])

  React.useEffect(() => {
    if (!enabled) {
      setRuntimeProjectionMode(projectionMode)
      return
    }
    if (projectionMode === 'mercator') {
      setRuntimeProjectionMode('mercator')
      return
    }
    setRuntimeProjectionMode(prev => (prev === 'mercator' ? prev : projectionMode))
  }, [enabled, projectionMode])

  const setProbe = React.useCallback((next: BasemapProbe) => {
    setState((prev: BasemapResult) => {
      const p = prev.probe
      if (
        p.tileSourceId === next.tileSourceId &&
        p.tilesLoaded === next.tilesLoaded &&
        p.canvasW === next.canvasW &&
        p.canvasH === next.canvasH &&
        p.zoom === next.zoom &&
        p.lng === next.lng &&
        p.lat === next.lat
      ) {
        return prev
      }
      return { ...prev, probe: next }
    })
  }, [])

  const computeProbe = React.useCallback((map: any, options?: { basemapRenderable?: boolean }): BasemapProbe => {
    if (!map) return EMPTY_PROBE
    const canvas = map.getCanvas?.()
    const canvasW = canvas && typeof canvas.width === 'number' ? canvas.width : 0
    const canvasH = canvas && typeof canvas.height === 'number' ? canvas.height : 0
    const zoom = typeof map.getZoom === 'function' ? Number(map.getZoom() || 0) : 0
    const center = typeof map.getCenter === 'function' ? map.getCenter() : null
    const lng = center && typeof center.lng === 'number' ? center.lng : 0
    const lat = center && typeof center.lat === 'number' ? center.lat : 0

    const tilesLoaded = (typeof map.areTilesLoaded === 'function' && map.areTilesLoaded() === true) || options?.basemapRenderable === true
    const tileSourceId = ''
    return { tileSourceId, tilesLoaded, canvasW, canvasH, zoom, lng, lat }
  }, [])

  const debug = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    try {
      return new URLSearchParams(String(window.location.search || '')).get('kgGeoDebug') === '1'
    } catch {
      return false
    }
  }, [])

  React.useEffect(() => {
    if (!enabled) {
      setState((prev: BasemapResult) =>
        prev.map || prev.basemapUnavailable || prev.mapError || prev.styleRevision !== 0 || prev.probe !== EMPTY_PROBE
          ? { ...prev, map: null, probe: EMPTY_PROBE, basemapUnavailable: false, mapError: null, styleRevision: 0 }
          : prev,
      )
      return
    }
    // Reset style revision before mounting/re-mounting so host-side layer writes wait for the next style.load.
    setState((prev: BasemapResult) =>
      prev.map || prev.basemapUnavailable || prev.mapError || prev.styleRevision !== 0 || prev.probe !== EMPTY_PROBE
        ? { ...prev, map: null, probe: EMPTY_PROBE, basemapUnavailable: false, mapError: null, styleRevision: 0 }
        : prev,
    )

    let cancelled = false
    let map: any | null = null
    let resizeObserver: ResizeObserver | null = null
    let probeInterval: ReturnType<typeof setInterval> | null = null
    let mountRetryTimer: ReturnType<typeof setTimeout> | null = null
    let basemapVisibilityTimer: ReturnType<typeof setTimeout> | null = null
    let abortNoiseCleanup: (() => void) | null = null
    let grabMapsFallbackApplied = false
    let unsafeRuntimeFallbackApplied = false
    let blankBasemapStyleFallbackApplied = false
    let basemapRenderableConfirmationCount = 0
    requestedOpenFreeMapLibertyRef.current = false
    let lastNavigationAtMs = 0
    let lastBasemapSourceActivityAtMs = 0
    let basemapSourceRenderable = false
    let consecutiveIdleGrabMapsServiceErrors = 0
    let removePoiClickBinding: (() => void) | null = null
    let releaseMapLease: (() => void) | null = null
    let releaseMapDisposalPreparation: (() => void) | null = null
    const cancelMapDisposalPreparation = () => {
      releaseMapDisposalPreparation?.()
      releaseMapDisposalPreparation = null
    }
    const prepareMapForDisposal = (): boolean => {
      if (!map) return true
      releaseMapDisposalPreparation ??=
        acquireMapLibreMapDisposalPreparation(map)
      return prepareFlightGeoMapLibreForDisposal(map)
    }
    const isMapPreparedForDisposal = (): boolean => (
      !map || isFlightGeoMapLibreDisposalPrepared(map)
    )
    const applyBasemapStyleWithoutDroppingFlight = (
      style: string | Readonly<Record<string, unknown>>,
    ): boolean => {
      if (!map || typeof map.setStyle !== 'function') return false
      if (!initialStyleOverrideRef.current) {
        map.setStyle(style)
        return true
      }
      const overlay = readFlightGeoOverlay()
      const expectedCamera = createFlightGeoOverlayMapLibreCamera(
        overlay,
        canvasRenderMode,
        readFlightGeoMapViewportPadding(map),
      )
      if (
        !overlay.active
        || !mapHasExactFlightGeoOverlay(map, overlay)
        || !mapHasExactFlightGeoEnvironment(map, overlay)
        || !mapHasExactFlightGeoStyleSources(map, overlay)
        || !mapHasExactFlightLayerState(map, overlay, canvasRenderMode)
        || (
          expectedCamera !== null
          && !mapHasExactFlightGeoOverlayCamera(map, expectedCamera)
        )
      ) return false
      map.setStyle(style, {
        diff: true,
        transformStyle: (
          previousStyle: Readonly<Record<string, any>> | undefined,
          nextStyle: Readonly<Record<string, any>>,
        ) => retainFlightGeoOverlayDuringStyleSwap(
          previousStyle,
          nextStyle,
          overlay,
          canvasRenderMode,
        ),
      })
      return true
    }
    const selectedStyle = resolveBasemapStyle(targetStyleUrl)
    const requestedGrabMapsStyle = isGrabMapsUrl(selectedStyle || '')
    const notifyGrabMapsFallback = () => {
      if (grabMapsFallbackApplied) return
      grabMapsFallbackApplied = true
      try {
        onGrabMapsFallbackRef.current?.()
      } catch {
        void 0
      }
    }

    const clearBasemapVisibilityTimer = () => {
      if (!basemapVisibilityTimer) return
      clearTimeout(basemapVisibilityTimer)
      basemapVisibilityTimer = null
    }

    const markBasemapRenderable = () => {
      clearBasemapVisibilityTimer()
      setState((prev: BasemapResult) => (
        prev.basemapUnavailable || prev.mapError
          ? { ...prev, basemapUnavailable: false, mapError: null }
          : prev
      ))
    }

    const hasRecentBasemapSourceActivity = (): boolean => {
      return lastBasemapSourceActivityAtMs > 0 && Date.now() - lastBasemapSourceActivityAtMs <= BASEMAP_SOURCE_ACTIVITY_GRACE_MS
    }

    const computeEffectiveProbe = (): BasemapProbe => {
      return computeProbe(map, { basemapRenderable: basemapSourceRenderable })
    }

    const markBasemapSourceActivity = (renderable: boolean) => {
      lastBasemapSourceActivityAtMs = Date.now()
      if (!renderable || !map) return
      basemapSourceRenderable = true
      basemapRenderableConfirmationCount = Math.max(basemapRenderableConfirmationCount, 2)
      setProbe(computeEffectiveProbe())
      markBasemapRenderable()
    }

    const markBasemapUnavailable = () => {
      if (cancelled) return
      setState((prev: BasemapResult) => {
        if (prev.basemapUnavailable) return prev
        return { ...prev, basemapUnavailable: true, mapError: null }
      })
    }

    const switchBlankBasemapToSafeStyle = (): boolean => {
      if (!map || typeof map.setStyle !== 'function') return false
      if (blankBasemapStyleFallbackApplied) return false
      if (!requestedGrabMapsStyle) return false
      try {
        if (!applyBasemapStyleWithoutDroppingFlight(
          RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
        )) return false
        blankBasemapStyleFallbackApplied = true
        basemapRenderableConfirmationCount = 0
        basemapSourceRenderable = false
        lastBasemapSourceActivityAtMs = 0
        notifyGrabMapsFallback()
        applyGrabMapsAutomaticFallback()
        setState((prev: BasemapResult) => ({ ...prev, basemapUnavailable: false, mapError: null, styleRevision: 0 }))
        return true
      } catch {
        return false
      }
    }

    const scheduleBasemapVisibilityProbe = (delayOverrideMs?: number) => {
      clearBasemapVisibilityTimer()
      const delayMs = delayOverrideMs ?? Math.max(800, Number.isFinite(vectorFallbackMs) ? Math.floor(vectorFallbackMs) : 2_000)
      basemapVisibilityTimer = setTimeout(() => {
        basemapVisibilityTimer = null
        if (cancelled || !map) return
        const probe = computeEffectiveProbe()
        if (probe.tilesLoaded) {
          basemapRenderableConfirmationCount += 1
          setState((prev: BasemapResult) => (
            prev.basemapUnavailable || prev.mapError
              ? { ...prev, basemapUnavailable: false, mapError: null }
              : prev
          ))
          if (basemapRenderableConfirmationCount >= 2) {
            markBasemapRenderable()
            return
          }
          scheduleBasemapVisibilityProbe(3_000)
          return
        }
        if (hasRecentBasemapSourceActivity()) {
          scheduleBasemapVisibilityProbe(4_000)
          return
        }
        basemapRenderableConfirmationCount = 0
        if (switchBlankBasemapToSafeStyle()) {
          scheduleBasemapVisibilityProbe()
          return
        }
        markBasemapUnavailable()
      }, delayMs)
    }

    const mount = async () => {
      const el = containerRef.current
      if (!el) {
        if (cancelled) return
        // Container refs can be null during lazy/suspense transitions; retry instead of silently bailing.
        if (mountRetryTimer) return
        mountRetryTimer = setTimeout(() => {
          mountRetryTimer = null
          void mount()
        }, 16)
        return
      }

      try {
        const rect = el.getBoundingClientRect()
        const w = rect && typeof rect.width === 'number' ? rect.width : 0
        const h = rect && typeof rect.height === 'number' ? rect.height : 0
        if (!(w > 1 && h > 1)) {
          if (cancelled) return
          if (mountRetryTimer) return
          mountRetryTimer = setTimeout(() => {
            mountRetryTimer = null
            void mount()
          }, 32)
          return
        }
      } catch {
        if (cancelled) return
        if (mountRetryTimer) return
        mountRetryTimer = setTimeout(() => {
          mountRetryTimer = null
          void mount()
        }, 32)
        return
      }

      try {
        const mlRaw = await loadMapLibreRuntime()
        if (cancelled) return
        const mlAny = mlRaw as unknown as any
        const MapConstructor = mlAny?.Map || mlAny?.default?.Map

        if (!MapConstructor) {
          throw new Error('MapLibre Map constructor not found')
        }

        if (typeof mlAny?.setLogger === 'function') {
          mlAny.setLogger({
            error: (...args: unknown[]) => {
              const text = args.map(v => String(v)).join(' ')
              const lower = text.toLowerCase()
              if (lower.includes('/__fetch_remote') && lower.includes('abort')) return
              if (lower.includes('/__grabmaps_proxy') && lower.includes('abort')) return
              if (lower.includes('net::err_aborted')) return
              if (lower.includes('aborterror')) return
              if (lower.includes('tiles.openfreemap.org/styles/liberty')) return
              console.error(...args)
            },
            warn: (...args: unknown[]) => console.warn(...args),
            info: (...args: unknown[]) => console.info(...args),
            debug: () => void 0,
          })
        }

        if (typeof window !== 'undefined' && !abortNoiseCleanup) {
          const shouldSuppress = (raw: unknown): boolean => {
            const msg =
              raw && typeof raw === 'object' && 'message' in raw
                ? String((raw as { message?: unknown }).message || '')
                : String(raw || '')
            const lower = msg.toLowerCase()
            return lower.includes('net::err_aborted') && lower.includes('tiles.openfreemap.org/styles/liberty')
          }
          const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
            if (!shouldSuppress(ev.reason)) return
            ev.preventDefault()
          }
          const onError = (ev: Event) => {
            const e = ev as ErrorEvent
            if (!shouldSuppress(e?.error ?? e?.message)) return
            e.preventDefault()
          }
          window.addEventListener('unhandledrejection', onUnhandledRejection)
          window.addEventListener('error', onError)
          abortNoiseCleanup = () => {
            window.removeEventListener('unhandledrejection', onUnhandledRejection)
            window.removeEventListener('error', onError)
          }
        }

        const style = initialStyleOverrideRef.current || selectedStyle

        if (style == null) {
          setState((prev: BasemapResult) =>
            prev.map || prev.mapError || prev.styleRevision !== 0 || prev.probe !== EMPTY_PROBE
              ? { ...prev, map: null, probe: EMPTY_PROBE, basemapUnavailable: false, mapError: null, styleRevision: 0 }
              : prev,
          )
          return
        }

        const preflightAbort = new AbortController()
        initialStylePreflightAbortRef.current = preflightAbort
        const preflight = await resolveInitialMapLibreStyle({
          readActivationStyleOverride: () =>
            initialStyleOverrideRef.current,
          selectedStyle: style,
          signal: preflightAbort.signal,
        }).finally(() => {
          if (initialStylePreflightAbortRef.current === preflightAbort) {
            initialStylePreflightAbortRef.current = null
          }
        })
        if (cancelled) return
        const styleForMap = preflight.style
        const activationStyleOverride = preflight.activationStyleOverride
        requestedOpenFreeMapLibertyRef.current = !activationStyleOverride
          && isOpenFreeMapLibertyUrl(selectedStyle)
        if (
          !activationStyleOverride
          && preflight.shouldFallback
          && requestedGrabMapsStyle
        ) {
          notifyGrabMapsFallback()
          applyGrabMapsAutomaticFallback()
        }

        if (debug) {
          try {
            console.info('[kg-geo] maplibre init', {
              style: typeof styleForMap === 'string' ? styleForMap : style,
              normalizedGrabMapsStyle: typeof styleForMap === 'string' ? null : styleForMap,
            })
          } catch {
            void 0
          }
        }
        
        const transformRequest = (rawUrl: string) => {
          const urlText = String(rawUrl || '').trim()
          if (!urlText) return { url: rawUrl }
          try {
            const parsed = new URL(urlText, typeof window !== 'undefined' ? window.location.href : undefined)
            const host = parsed.hostname.toLowerCase()
            if (host !== 'maps.grab.com') return { url: urlText }
            const requestTarget = resolveGrabMapsRequestTarget(parsed.toString())
            if (!requestTarget.url) return { url: urlText }
            return { url: requestTarget.url, headers: requestTarget.headers }
          } catch {
            return { url: urlText }
          }
        }

        try {
          map = new MapConstructor({
            container: el,
            style: styleForMap,
            interactive: true,
            attributionControl: false,
            preserveDrawingBuffer: false,
            transformRequest,
            ...singaporeInitialCamera,
          })
        } catch (err) {
          if (requestedOpenFreeMapLibertyRef.current) {
            try {
              map = new MapConstructor({
                container: el,
                style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
                interactive: true,
                attributionControl: false,
                preserveDrawingBuffer: false,
                transformRequest,
                ...singaporeInitialCamera,
              })
            } catch {
              void 0
            }
          }
          if (map) {
            setState((prev: BasemapResult) => ({ ...prev, mapError: null }))
            notifyGrabMapsFallback()
          }
          else {
          if (canvasRenderMode !== '2d') throw err
          try {
            el.replaceChildren()
          } catch {
            void 0
          }
          const fallbackMap = await tryCreateGrabMapsLibraryMap({
            containerEl: el,
            center: [...singaporeCamera.center],
            zoom: singaporeCamera.zoom,
            enableNavigation: true,
            enableLabels: true,
            enableBuildings: true,
            enableAttribution: true,
          })
          if (!fallbackMap) throw err
          map = fallbackMap
          }
        }

        if (debug && typeof window !== 'undefined') {
          try {
            ;(window as unknown as { __kgGeoMapLibre?: unknown }).__kgGeoMapLibre = map
          } catch {
            void 0
          }
        }
        mountedMapRef.current = map
        if (activationStyleOverride) {
          beginMapLibreFlightBootstrap(map, activationStyleOverride)
        }
        releaseMapLease = claimMapLibreMapLease({
          cancelDisposalPreparation: cancelMapDisposalPreparation,
          isPreparedForDisposal: isMapPreparedForDisposal,
          map,
          ownerScope,
          prepareForDisposal: prepareMapForDisposal,
          root: rootRef.current,
        })

        if (typeof map?.on === 'function' && typeof map?.queryRenderedFeatures === 'function') {
          const onMapClick = (ev: any) => {
            try {
              const clickPoint = ev && typeof ev === 'object' && 'point' in ev ? (ev as { point?: unknown }).point : null
              const candidates = clickPoint ? map.queryRenderedFeatures(clickPoint) : []
              const features = Array.isArray(candidates) ? candidates : []
              const picked = features.find((f: unknown) => !isGraphOverlayFeature(f) && readPoiLabelFromFeature(f))
              const label = readPoiLabelFromFeature(picked)
              if (!picked || !label) return
              const poiCoords = readFeaturePointCoordinates(picked)
              const lng = poiCoords ? poiCoords[0] : Number(ev?.lngLat?.lng)
              const lat = poiCoords ? poiCoords[1] : Number(ev?.lngLat?.lat)
              if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
              try {
                onPoiClick?.({
                  label,
                  lng,
                  lat,
                  address: readPoiAddressFromFeature(picked),
                  category: readPoiCategoryFromFeature(picked),
                  properties: readPoiPropertiesFromFeature(picked),
                })
              } catch {
                void 0
              }
            } catch {
              void 0
            }
          }
          map.on('click', onMapClick)
          removePoiClickBinding = () => {
            try {
              map.off?.('click', onMapClick)
            } catch {
              void 0
            }
          }
        }

        map.on?.('error', (e: any) => {
          if (cancelled) return
          const err = e && typeof e === 'object' && 'error' in e ? (e as { error?: unknown }).error : e
          const msg = err instanceof Error ? err.message : String(err || '')
          const trimmed = msg.trim()
          if (!trimmed) return
          const openFreeMapAbort =
            requestedOpenFreeMapLibertyRef.current
            && isAbortLike(err)
            && isOpenFreeMapLibertyUrl(trimmed)
          if (openFreeMapAbort && typeof map?.setStyle === 'function') {
            try {
              if (!applyBasemapStyleWithoutDroppingFlight(
                RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
              )) return
              basemapRenderableConfirmationCount = 0
              basemapSourceRenderable = false
              lastBasemapSourceActivityAtMs = 0
              setState((prev: BasemapResult) => ({ ...prev, basemapUnavailable: false, mapError: null, styleRevision: 0 }))
              scheduleBasemapVisibilityProbe()
            } catch {
              setState((prev: BasemapResult) => ({ ...prev, mapError: trimmed }))
            }
            return
          }
          if (isAbortLike(err)) return
          const canFallbackGrabMapsRuntime =
            !grabMapsFallbackApplied
            && requestedGrabMapsStyle
            && typeof map?.setStyle === 'function'
          const fallbackGrabMapsRuntime = () => {
            if (!canFallbackGrabMapsRuntime) return false
            try {
              if (!applyBasemapStyleWithoutDroppingFlight(
                RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
              )) return false
              notifyGrabMapsFallback()
              applyGrabMapsAutomaticFallback()
              basemapRenderableConfirmationCount = 0
              basemapSourceRenderable = false
              lastBasemapSourceActivityAtMs = 0
              setState((prev: BasemapResult) => ({ ...prev, basemapUnavailable: false, mapError: null, styleRevision: 0 }))
              scheduleBasemapVisibilityProbe()
              return true
            } catch {
              return false
            }
          }
          const fallbackUnsafeMapLibreRuntime = () => {
            if (unsafeRuntimeFallbackApplied) return false
            unsafeRuntimeFallbackApplied = true
            if (
              runtimeProjectionMode === 'globe'
              && !requestedOpenFreeMapLibertyRef.current
            ) {
              setRuntimeProjectionMode('mercator')
              setState((prev: BasemapResult) => ({ ...prev, mapError: null }))
              return true
            }
            if (typeof map?.setStyle !== 'function') {
              setRuntimeProjectionMode('mercator')
              setState((prev: BasemapResult) => ({ ...prev, mapError: null }))
              return true
            }
            try {
              if (!applyBasemapStyleWithoutDroppingFlight(
                RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
              )) return false
              setRuntimeProjectionMode('mercator')
              basemapRenderableConfirmationCount = 0
              basemapSourceRenderable = false
              lastBasemapSourceActivityAtMs = 0
              setState((prev: BasemapResult) => ({ ...prev, basemapUnavailable: false, mapError: null, styleRevision: 0 }))
              scheduleBasemapVisibilityProbe()
              return true
            } catch {
              return false
            }
          }
          if (isGrabMapsServiceUnavailable(trimmed)) {
            if (requestedGrabMapsStyle) {
              const navigating = isMapActivelyNavigating(map, lastNavigationAtMs)
              const hasRenderedTiles = typeof map?.areTilesLoaded === 'function' && map.areTilesLoaded() === true
              if (navigating || hasRenderedTiles) {
                consecutiveIdleGrabMapsServiceErrors = 0
                setState((prev: BasemapResult) => (prev.mapError ? { ...prev, mapError: null } : prev))
                return
              }
              consecutiveIdleGrabMapsServiceErrors += 1
              if (consecutiveIdleGrabMapsServiceErrors < GRABMAPS_IDLE_SERVICE_ERROR_FALLBACK_THRESHOLD) {
                setState((prev: BasemapResult) => (prev.mapError === trimmed ? prev : { ...prev, mapError: trimmed }))
                return
              }
            }
            consecutiveIdleGrabMapsServiceErrors = 0
            if (fallbackGrabMapsRuntime()) return
          }
          if (isGrabMapsUnauthorized(trimmed) && fallbackGrabMapsRuntime()) {
            return
          }
          if (isGrabMapsProxyMissing(trimmed) && fallbackGrabMapsRuntime()) {
            return
          }
          if (isKnownUnsafeMapLibreRuntimeError(trimmed) && fallbackUnsafeMapLibreRuntime()) {
            return
          }
          setState((prev: BasemapResult) => ({ ...prev, mapError: trimmed }))
        })

        map.on?.('style.load', () => {
          if (cancelled) return
          consecutiveIdleGrabMapsServiceErrors = 0
          basemapSourceRenderable = false
          lastBasemapSourceActivityAtMs = 0
          try {
            if (runtimeProjectionMode === 'globe') {
              map.setProjection?.({ type: 'globe' })
            } else {
              map.setProjection?.({ type: 'mercator' })
            }
          } catch {
            void 0
          }
          if (viewportSizingMode === 'fit') {
            map.resize?.()
          }
          scheduleBasemapVisibilityProbe()
          setState((prev: BasemapResult) => ({ ...prev, styleRevision: prev.styleRevision + 1 }))
        })

        queueMicrotask(() => {
          if (cancelled || !map) return
          try {
            const loaded =
              (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded() === true)
              || (typeof map.loaded === 'function' && map.loaded() === true)
            if (!loaded) return
            setState((prev: BasemapResult) => (prev.styleRevision > 0 ? prev : { ...prev, styleRevision: 1 }))
            scheduleBasemapVisibilityProbe()
          } catch {
            void 0
          }
        })

        map.on?.('sourcedata', (e: any) => {
          if (cancelled) return
          const sourceId = String(e && typeof e === 'object' && 'sourceId' in e ? e.sourceId || '' : '').trim()
          if (!sourceId || sourceId.startsWith(HOST_GRAPH_SOURCE_PREFIX)) return
          const hasTilePayload = !!(e && typeof e === 'object' && ('coord' in e || 'tile' in e))
          markBasemapSourceActivity(hasTilePayload)
        })

        const updateProbe = () => {
          if (cancelled || !map) return
          const probe = computeEffectiveProbe()
          if (probe.tilesLoaded) {
            consecutiveIdleGrabMapsServiceErrors = 0
            setState((prev: BasemapResult) => (
              prev.basemapUnavailable || prev.mapError
                ? { ...prev, basemapUnavailable: false, mapError: null }
                : prev
            ))
          }
          setProbe(probe)
        }

        const markNavigationActivity = () => {
          lastNavigationAtMs = Date.now()
        }

        const align3dViewportCenter = createMapLibreInitialCameraAlignment({
          canvasRenderMode,
          // Flight's local bootstrap has camera ownership before the first
          // native MapLibre frame. A late generic Singapore fit would overwrite
          // its stopped fixed-follow camera and strand the presentation gate.
          flightBootstrapActive: () => Boolean(initialStyleOverrideRef.current),
          isCurrent: () => !cancelled,
          map: () => map,
          requestFrame: typeof window === 'undefined'
            ? undefined
            : callback => window.requestAnimationFrame(callback),
          singaporeCamera,
        })

        map.once?.('load', () => {
          if (cancelled) return
          map.resize?.()
          align3dViewportCenter()
          setState((prev: BasemapResult) => (prev.styleRevision > 0 ? prev : { ...prev, styleRevision: 1 }))
          scheduleBasemapVisibilityProbe()
          updateProbe()
          if (debug) {
            try {
              console.info('[kg-geo] maplibre load')
            } catch {
              void 0
            }
          }
        })
        map.on?.('movestart', markNavigationActivity)
        map.on?.('zoomstart', markNavigationActivity)
        map.on?.('moveend', updateProbe)
        map.on?.('zoomend', updateProbe)
        map.on?.('idle', updateProbe)
        map.on?.('resize', updateProbe)

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            if (cancelled || !map) return
            map.resize?.()
            align3dViewportCenter()
            updateProbe()
          })
          resizeObserver.observe(el)
        }

        let loggedCanvasReady = false
        let loggedTilesLoaded = false
        probeInterval = setInterval(() => {
          if (cancelled || !map) return
          const probe = computeEffectiveProbe()
          setProbe(probe)
          if (debug) {
            if (!loggedCanvasReady && probe.canvasW > 0 && probe.canvasH > 0) {
              loggedCanvasReady = true
              try {
                console.info('[kg-geo] maplibre canvas ready', { canvasW: probe.canvasW, canvasH: probe.canvasH })
              } catch {
                void 0
              }
            }
            if (!loggedTilesLoaded && probe.tilesLoaded) {
              loggedTilesLoaded = true
              try {
                console.info('[kg-geo] maplibre tiles loaded')
              } catch {
                void 0
              }
            }
          }
          if (probe.tilesLoaded) {
            setState((prev: BasemapResult) => (
              prev.basemapUnavailable || prev.mapError
                ? { ...prev, basemapUnavailable: false, mapError: null }
                : prev
            ))
          }
        }, debug ? 1_000 : Math.max(1_500, Math.floor(vectorFallbackMs)))

        scheduleBasemapVisibilityProbe()
        setState((prev: BasemapResult) => ({ ...prev, map, basemapUnavailable: false, mapError: null }))
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err || '')
        releaseMapLease?.()
        releaseMapLease = null
        if (mountedMapRef.current === map) mountedMapRef.current = null
        disposeMapLibreFlightBootstrap(map)
        try {
          map?.remove?.()
        } catch {
          void 0
        }
        map = null
        if (isKnownUnsafeMapLibreRuntimeError(msg)) {
          setRuntimeProjectionMode('mercator')
          setState((prev: BasemapResult) => ({ ...prev, map: null, basemapUnavailable: false, mapError: null, styleRevision: 0 }))
          return
        }
        setState((prev: BasemapResult) => ({ ...prev, map: null, basemapUnavailable: true, mapError: msg || 'Map init failed' }))
      }
    }

    void mount()

    return () => {
      cancelled = true
      initialStylePreflightAbortRef.current?.abort()
      initialStylePreflightAbortRef.current = null
      if (mountRetryTimer) {
        clearTimeout(mountRetryTimer)
        mountRetryTimer = null
      }
      clearBasemapVisibilityTimer()
      if (probeInterval) {
        clearInterval(probeInterval)
        probeInterval = null
      }
      if (resizeObserver) {
        try {
          resizeObserver.disconnect()
        } catch {
          void 0
        }
        resizeObserver = null
      }
      if (abortNoiseCleanup) {
        try {
          abortNoiseCleanup()
        } catch {
          void 0
        }
        abortNoiseCleanup = null
      }
      if (removePoiClickBinding) {
        try {
          removePoiClickBinding()
        } catch {
          void 0
        }
        removePoiClickBinding = null
      }
      // Flight owns two GeoJSON sources on this native map. Clear them while
      // MapLibre is still live so a City-exclusive XR handoff cannot retain
      // prior Flight geometry beneath the replacement canvas.
      prepareMapForDisposal()
      releaseMapLease?.()
      releaseMapLease = null
      if (mountedMapRef.current === map) mountedMapRef.current = null
      disposeMapLibreFlightBootstrap(map)
      try {
        map?.remove?.()
      } catch {
        void 0
      }
      cancelMapDisposalPreparation()
      map = null
    }
    // The override is an activation bootstrap, not live map state. Flight may
    // clear it while handing the same Geo surface back; remounting here would
    // destroy the provider map instead of retaining its owner and camera.
  }, [enabled, rootRef, containerRef, targetStyleUrl, ownerScope, canvasRenderMode, runtimeProjectionMode, viewportSizingMode, vectorFallbackMs, computeProbe, debug, setProbe])

  React.useEffect(() => {
    const map = state.map
    if (!enabled || !map || mountedMapRef.current !== map) return
    const selectedStyle = resolveBasemapStyle(targetStyleUrl)
    if (selectedStyle == null) return
    const requestedGrabMapsStyle = isGrabMapsUrl(
      typeof selectedStyle === 'string' ? selectedStyle : '',
    )
    requestedOpenFreeMapLibertyRef.current = (
      typeof selectedStyle === 'string'
      && isOpenFreeMapLibertyUrl(selectedStyle)
    )
    reconcileMapLibreFlightBootstrap({
      bootstrapStyle: initialStyleOverride || null,
      hasExactFlightOverlay: candidate => {
        const overlay = readFlightGeoOverlay()
        const expectedCamera = createFlightGeoOverlayMapLibreCamera(
          overlay,
          canvasRenderMode,
          readFlightGeoMapViewportPadding(candidate),
        )
        return overlay.active
          && mapHasExactFlightGeoOverlay(candidate, overlay)
          && mapHasExactFlightGeoEnvironment(candidate, overlay)
          && mapHasExactFlightGeoStyleSources(candidate, overlay)
          && mapHasExactFlightLayerState(
            candidate,
            overlay,
            canvasRenderMode,
          )
          && (
            expectedCamera === null
            || mapHasExactFlightGeoOverlayCamera(candidate, expectedCamera)
          )
      },
      loadProviderStyle: async signal => {
        if (typeof selectedStyle !== 'string') return selectedStyle
        let preflight
        try {
          preflight = await preflightMapLibreStyle(
            selectedStyle,
            { signal },
          )
        } catch (error) {
          if (signal.aborted) throw error
          return selectedStyle
        }
        if (preflight.shouldFallback && requestedGrabMapsStyle) {
          applyGrabMapsAutomaticFallback()
          try {
            onGrabMapsFallbackRef.current?.()
          } catch {
            void 0
          }
        }
        return preflight.style
      },
      map,
      onError: error => {
        const message = error instanceof Error
          ? error.message
          : String(error || '')
        setState((prev: BasemapResult) => ({
          ...prev,
          mapError: message || 'Map style promotion failed',
        }))
      },
      retainFlightOverlay: (previousStyle, nextStyle) =>
        retainFlightGeoOverlayDuringStyleSwap(
          previousStyle,
          nextStyle,
          readFlightGeoOverlay(),
          canvasRenderMode,
        ),
    })
  }, [
    enabled,
    initialStyleOverride,
    state.map,
    targetStyleUrl,
  ])

  return state
}
