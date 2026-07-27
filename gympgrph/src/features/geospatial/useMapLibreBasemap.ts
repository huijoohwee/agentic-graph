import React from 'react'
import {
  buildGrabMapsProxyRequestHeaders,
  readGrabMapsAuthModeFromBrowser,
  readGrabMapsByokApiKeyFromBrowser,
} from 'grph-shared/geospatial/grabMapsAuth'
import { toGrabMapsProxyUrl } from 'grph-shared/geospatial/grabMapsProxy'
import { tryCreateGrabMapsLibraryMap } from 'grph-shared/geospatial/grabMapsLibrary'
import { GEOSPATIAL_STYLE_URL_CHANGED_EVENT } from 'grph-shared/geospatial/constants'
import {
  normalizeGeoPoiRichMediaProperties,
  type GeoPoiRichMediaProperties,
} from 'grph-shared/geospatial/poiRichMedia'
import { LS_KEYS } from '../../lib/config.js'
import {
  MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  MAPLIBRE_DEFAULT_STYLE_URL,
  SAFE_SVG_FALLBACK_STYLE_SENTINEL,
} from './basemapStyle.js'

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
const SINGAPORE_CENTER_LNG = 103.8198
const SINGAPORE_CENTER_LAT = 1.3521
const INITIAL_3D_ZOOM = 2.8
const INITIAL_3D_PITCH = 0
const INITIAL_3D_BEARING = 0
const RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL = MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
const GRABMAPS_RUNTIME_NAVIGATION_GRACE_MS = 1200
const GRABMAPS_IDLE_SERVICE_ERROR_FALLBACK_THRESHOLD = 3
const BASEMAP_SOURCE_ACTIVITY_GRACE_MS = 12_000
const HOST_GRAPH_SOURCE_PREFIX = 'kg-host-graph:nodes'
let activeMapLibreMap: any | null = null

export function readActiveMapLibreMap(): any | null {
  return activeMapLibreMap
}

function registerActiveMapLibreMap(map: any): void {
  activeMapLibreMap = map
}

function unregisterActiveMapLibreMap(map: any): void {
  if (activeMapLibreMap === map) activeMapLibreMap = null
}

const resolveBasemapStyle = (rawStyleUrl: string | null | undefined) => {
  const trimmed = String(rawStyleUrl || '').trim()
  const lower = trimmed.toLowerCase()
  if (!trimmed) return MAPLIBRE_DEFAULT_STYLE_URL
  if (trimmed === SAFE_SVG_FALLBACK_STYLE_SENTINEL) return null
  if (lower.startsWith('kg:style:')) return MAPLIBRE_DEFAULT_STYLE_URL
  return trimmed
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const isGrabMapsUrl = (rawUrl: string): boolean => {
  try {
    return new URL(String(rawUrl || '').trim()).hostname.toLowerCase() === 'maps.grab.com'
  } catch {
    return false
  }
}

const canUseDirectGrabMapsBrowserRequests = (): boolean => {
  if (typeof window === 'undefined') return false
  return readGrabMapsAuthModeFromBrowser() === 'byok' && !!readGrabMapsByokApiKeyFromBrowser()
}

const buildGrabMapsDirectRequestHeaders = (): Record<string, string> => {
  const apiKey = readGrabMapsByokApiKeyFromBrowser()
  if (!apiKey) return {}
  return { Authorization: `Bearer ${apiKey}` }
}

const resolveGrabMapsRequestTarget = (
  rawUrl: string,
): { url: string | null; headers: Record<string, string>; proxied: boolean } => {
  const normalizedUrl = normalizeGrabMapsVectorTileUrl(rawUrl)
  if (canUseDirectGrabMapsBrowserRequests()) {
    return {
      url: normalizedUrl,
      headers: buildGrabMapsDirectRequestHeaders(),
      proxied: false,
    }
  }
  const proxyUrl = toGrabMapsProxyUrl(normalizedUrl)
  if (!proxyUrl) {
    return { url: null, headers: {}, proxied: true }
  }
  return {
    url: proxyUrl,
    headers: buildGrabMapsProxyRequestHeaders(),
    proxied: true,
  }
}

const resolveGrabMapsStyleAssetUrl = (rawValue: unknown, styleUrl: string): string => {
  const trimmed = String(rawValue || '').trim()
  if (!trimmed) return ''
  try {
    if (trimmed.startsWith('//')) {
      const base = new URL(styleUrl)
      return new URL(`${base.protocol}${trimmed}`).toString()
    }
    if (trimmed.includes('://')) {
      return new URL(trimmed).toString()
    }
    const styleBase = new URL(styleUrl)
    return new URL(trimmed, styleBase).toString()
  } catch {
    return trimmed
  }
}

const decodeGrabMapsTileTemplatePlaceholders = (url: string): string => {
  return String(url || '')
    .replace(/%257B/gi, '{')
    .replace(/%257D/gi, '}')
    .replace(/%7B/gi, '{')
    .replace(/%7D/gi, '}')
}

const normalizeGrabMapsVectorTileUrl = (rawUrl: string): string => {
  const trimmed = decodeGrabMapsTileTemplatePlaceholders(String(rawUrl || '').trim())
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.hostname.toLowerCase() !== 'maps.grab.com') return trimmed
    if (parsed.pathname.startsWith('/api/maps/tiles/v2/vector/')) {
      return decodeGrabMapsTileTemplatePlaceholders(parsed.toString())
    }
    if (parsed.pathname.startsWith('/maps/tiles/v2/vector/')) {
      parsed.pathname = `/api${parsed.pathname}`
      return decodeGrabMapsTileTemplatePlaceholders(parsed.toString())
    }
    return decodeGrabMapsTileTemplatePlaceholders(parsed.toString())
  } catch {
    return trimmed
  }
}

const resolveGrabMapsGlyphsUrl = (rawValue: unknown, styleUrl: string): string => {
  const normalized = decodeGrabMapsTileTemplatePlaceholders(resolveGrabMapsStyleAssetUrl(rawValue, styleUrl))
  if (!normalized) return ''
  if (normalized.includes('{fontstack}') && normalized.includes('{range}')) {
    return normalized
  }
  const base = normalized.replace(/\/+$/, '')
  return `${base}/{fontstack}/{range}.pbf`
}

const normalizeGrabMapsSourceDefinition = (rawSource: Record<string, unknown>, styleUrl: string): Record<string, unknown> => {
  const nextSource: Record<string, unknown> = { ...rawSource }
  if (typeof rawSource.url === 'string') {
    nextSource.url = normalizeGrabMapsVectorTileUrl(resolveGrabMapsStyleAssetUrl(rawSource.url, styleUrl))
  }
  if (typeof rawSource.data === 'string') {
    nextSource.data = resolveGrabMapsStyleAssetUrl(rawSource.data, styleUrl)
  }
  if (Array.isArray(rawSource.tiles)) {
    nextSource.tiles = rawSource.tiles.map(tile =>
      typeof tile === 'string'
        ? normalizeGrabMapsVectorTileUrl(
            decodeGrabMapsTileTemplatePlaceholders(resolveGrabMapsStyleAssetUrl(tile, styleUrl)),
          )
        : tile,
    )
  }
  return nextSource
}

const normalizeGrabMapsStyleDocument = (rawStyle: unknown, styleUrl: string): Record<string, unknown> | null => {
  if (!isRecord(rawStyle)) return null
  const nextStyle: Record<string, unknown> = { ...rawStyle }
  if (typeof rawStyle.sprite === 'string') {
    nextStyle.sprite = resolveGrabMapsStyleAssetUrl(rawStyle.sprite, styleUrl)
  }
  if (typeof rawStyle.glyphs === 'string') {
    nextStyle.glyphs = resolveGrabMapsGlyphsUrl(rawStyle.glyphs, styleUrl)
  }
  if (isRecord(rawStyle.sources)) {
    const nextSources: Record<string, unknown> = {}
    for (const [sourceId, sourceValue] of Object.entries(rawStyle.sources)) {
      if (!isRecord(sourceValue)) {
        nextSources[sourceId] = sourceValue
        continue
      }
      nextSources[sourceId] = normalizeGrabMapsSourceDefinition(sourceValue, styleUrl)
    }
    nextStyle.sources = nextSources
  }
  return nextStyle
}

const hydrateGrabMapsSourceUrls = async (
  style: Record<string, unknown>,
  headers: Record<string, string>,
  styleUrl: string,
): Promise<{ style: Record<string, unknown>; hadGrabMapsSourceFailure: boolean }> => {
  if (!isRecord(style.sources)) return { style, hadGrabMapsSourceFailure: false }
  const nextSources: Record<string, unknown> = {}
  let hadGrabMapsSourceFailure = false
  await Promise.all(Object.entries(style.sources).map(async ([sourceId, sourceValue]) => {
    if (!isRecord(sourceValue)) {
      nextSources[sourceId] = sourceValue
      return
    }
    const normalizedSource = normalizeGrabMapsSourceDefinition(sourceValue, styleUrl)
    const sourceUrl = typeof normalizedSource.url === 'string' ? normalizedSource.url : ''
    if (!sourceUrl || !isGrabMapsUrl(sourceUrl)) {
      nextSources[sourceId] = normalizedSource
      return
    }
    const requestTarget = resolveGrabMapsRequestTarget(sourceUrl)
    if (!requestTarget.url) {
      hadGrabMapsSourceFailure = true
      nextSources[sourceId] = normalizedSource
      return
    }
    try {
      const sourceRes = await fetch(requestTarget.url, { method: 'GET', headers: requestTarget.headers })
      if (!sourceRes.ok) {
        hadGrabMapsSourceFailure = true
        nextSources[sourceId] = normalizedSource
        return
      }
      const sourceJson = await sourceRes.json()
      if (!isRecord(sourceJson)) {
        hadGrabMapsSourceFailure = true
        nextSources[sourceId] = normalizedSource
        return
      }
      const hydrated = normalizeGrabMapsSourceDefinition(sourceJson, sourceUrl)
      nextSources[sourceId] = { ...normalizedSource, ...hydrated }
      delete (nextSources[sourceId] as Record<string, unknown>).url
    } catch {
      hadGrabMapsSourceFailure = true
      nextSources[sourceId] = normalizedSource
    }
  }))
  return { style: { ...style, sources: nextSources }, hadGrabMapsSourceFailure }
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

type GrabMapsPreflightResult = {
  style: string | Record<string, unknown>
  shouldFallback: boolean
}

const preflightGrabMapsStyle = async (styleUrl: string): Promise<GrabMapsPreflightResult> => {
  if (!isGrabMapsUrl(styleUrl)) return { style: styleUrl, shouldFallback: false }
  const requestTarget = resolveGrabMapsRequestTarget(styleUrl)
  if (!requestTarget.url) return { style: styleUrl, shouldFallback: false }
  try {
    const styleRes = await fetch(requestTarget.url, { method: 'GET', headers: requestTarget.headers })
    if (styleRes.ok) {
      const rawStyle = await styleRes.json()
      const normalizedStyle = normalizeGrabMapsStyleDocument(rawStyle, styleUrl)
      if (!normalizedStyle) return { style: styleUrl, shouldFallback: false }
      const hydrated = await hydrateGrabMapsSourceUrls(normalizedStyle, requestTarget.headers, styleUrl)
      if (hydrated.hadGrabMapsSourceFailure) {
        return { style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL, shouldFallback: true }
      }
      return { style: hydrated.style, shouldFallback: false }
    }
    if (styleRes.status === 404 && requestTarget.proxied) {
      return { style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL, shouldFallback: true }
    }
    if (styleRes.status === 401 || styleRes.status === 403) {
      return { style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL, shouldFallback: true }
    }
    if (styleRes.status >= 500) {
      return { style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL, shouldFallback: true }
    }
    return { style: styleUrl, shouldFallback: false }
  } catch {
    return { style: styleUrl, shouldFallback: false }
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
  canvasRenderMode: '2d' | '3d'
  projectionMode: 'mercator' | 'globe'
  viewportSizingMode: 'none' | 'fit'
  vectorFallbackMs: number
  onGrabMapsFallback?: () => void
  onPoiClick?: (detail: BasemapPoiClickDetail) => void
}): BasemapResult {
  const { enabled, containerRef, targetStyleUrl, canvasRenderMode, projectionMode, viewportSizingMode, vectorFallbackMs, onGrabMapsFallback, onPoiClick } = args
  const [runtimeProjectionMode, setRuntimeProjectionMode] = React.useState<'mercator' | 'globe'>(projectionMode)
  const [state, setState] = React.useState<BasemapResult>({
    map: null,
    probe: EMPTY_PROBE,
    basemapUnavailable: false,
    mapError: null,
    styleRevision: 0,
  })

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
    let grabMapsBootstrapPending = false
    let unsafeRuntimeFallbackApplied = false
    let blankBasemapStyleFallbackApplied = false
    let basemapRenderableConfirmationCount = 0
    let requestedOpenFreeMapLiberty = false
    let lastNavigationAtMs = 0
    let lastBasemapSourceActivityAtMs = 0
    let basemapSourceRenderable = false
    let consecutiveIdleGrabMapsServiceErrors = 0
    let removePoiClickBinding: (() => void) | null = null
    const requestedGrabMapsStyle = isGrabMapsUrl(resolveBasemapStyle(targetStyleUrl) || '')
    const notifyGrabMapsFallback = () => {
      if (grabMapsFallbackApplied) return
      grabMapsFallbackApplied = true
      grabMapsBootstrapPending = false
      try {
        onGrabMapsFallback?.()
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
      blankBasemapStyleFallbackApplied = true
      basemapRenderableConfirmationCount = 0
      basemapSourceRenderable = false
      lastBasemapSourceActivityAtMs = 0
      notifyGrabMapsFallback()
      applyGrabMapsAutomaticFallback()
      try {
        map.setStyle?.(RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)
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
        const mlRaw = await import('maplibre-gl/dist/maplibre-gl.js')
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

        const style = resolveBasemapStyle(targetStyleUrl)
        requestedOpenFreeMapLiberty = isOpenFreeMapLibertyUrl(style)

        if (style == null) {
          setState((prev: BasemapResult) =>
            prev.map || prev.mapError || prev.styleRevision !== 0 || prev.probe !== EMPTY_PROBE
              ? { ...prev, map: null, probe: EMPTY_PROBE, basemapUnavailable: false, mapError: null, styleRevision: 0 }
              : prev,
          )
          return
        }

        const preflight = await preflightGrabMapsStyle(style)
        if (cancelled) return
        const styleForMap = preflight.style
        grabMapsBootstrapPending = requestedGrabMapsStyle && !preflight.shouldFallback
        if (preflight.shouldFallback && requestedGrabMapsStyle) {
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
            center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
            pitch: canvasRenderMode === '3d' ? INITIAL_3D_PITCH : 0,
            bearing: canvasRenderMode === '3d' ? INITIAL_3D_BEARING : 0,
            maxPitch: canvasRenderMode === '3d' ? 85 : 60,
            zoom: canvasRenderMode === '3d' ? INITIAL_3D_ZOOM : 12,
          })
        } catch (err) {
          if (requestedOpenFreeMapLiberty) {
            try {
              map = new MapConstructor({
                container: el,
                style: RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL,
                interactive: true,
                attributionControl: false,
                preserveDrawingBuffer: false,
                transformRequest,
                center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
                pitch: canvasRenderMode === '3d' ? INITIAL_3D_PITCH : 0,
                bearing: canvasRenderMode === '3d' ? INITIAL_3D_BEARING : 0,
                maxPitch: canvasRenderMode === '3d' ? 85 : 60,
                zoom: canvasRenderMode === '3d' ? INITIAL_3D_ZOOM : 12,
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
            center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
            zoom: 12,
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
        registerActiveMapLibreMap(map)

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
            requestedOpenFreeMapLiberty
            && isAbortLike(err)
            && isOpenFreeMapLibertyUrl(trimmed)
          if (openFreeMapAbort && typeof map?.setStyle === 'function') {
            try {
              map.setStyle?.(RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)
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
            notifyGrabMapsFallback()
            try {
              applyGrabMapsAutomaticFallback()
              map.setStyle?.(RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)
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
            if (runtimeProjectionMode === 'globe' && !requestedOpenFreeMapLiberty) {
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
              setRuntimeProjectionMode('mercator')
              map.setStyle?.(RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL)
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
          if (requestedGrabMapsStyle) {
            grabMapsBootstrapPending = false
          }
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

        let initial3dCameraAligned = false
        const align3dViewportCenter = () => {
          if (cancelled || !map) return
          if (canvasRenderMode !== '3d') return
          if (initial3dCameraAligned) return
          initial3dCameraAligned = true
          try {
            map.jumpTo?.({
              center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
              zoom: INITIAL_3D_ZOOM,
              pitch: INITIAL_3D_PITCH,
              bearing: INITIAL_3D_BEARING,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            })
          } catch {
            void 0
          }
          const w = typeof window !== 'undefined' ? window : null
          if (!w || typeof w.requestAnimationFrame !== 'function') return
          w.requestAnimationFrame(() => {
            if (cancelled || !map) return
            try {
              map.jumpTo?.({
                center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
                zoom: INITIAL_3D_ZOOM,
                pitch: INITIAL_3D_PITCH,
                bearing: INITIAL_3D_BEARING,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
              })
            } catch {
              void 0
            }
          })
        }

        map.once?.('load', () => {
          if (cancelled) return
          map.resize?.()
          align3dViewportCenter()
          setState((prev: BasemapResult) => (prev.styleRevision > 0 ? prev : { ...prev, styleRevision: 1 }))
          scheduleBasemapVisibilityProbe()
          if (canvasRenderMode === '3d') {
            try {
              map.jumpTo?.({
                center: [SINGAPORE_CENTER_LNG, SINGAPORE_CENTER_LAT],
                zoom: INITIAL_3D_ZOOM,
                pitch: INITIAL_3D_PITCH,
                bearing: INITIAL_3D_BEARING,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
              })
            } catch {
              void 0
            }
          }
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
        unregisterActiveMapLibreMap(map)
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
      unregisterActiveMapLibreMap(map)
      try {
        map?.remove?.()
      } catch {
        void 0
      }
      map = null
    }
  }, [enabled, containerRef, targetStyleUrl, canvasRenderMode, runtimeProjectionMode, viewportSizingMode, vectorFallbackMs, computeProbe, debug, setProbe, onGrabMapsFallback])

  return state
}
