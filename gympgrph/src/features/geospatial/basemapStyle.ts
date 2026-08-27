import type { GeospatialViewMode } from '../../hooks/store/types.js'

import { GRABMAPS_DEFAULT_STYLE_URL } from 'grph-shared/geospatial/grabMapsSsot'
import { readGrabMapsAuthModeFromBrowser, readGrabMapsByokApiKeyFromBrowser } from 'grph-shared/geospatial/grabMapsAuth'

export const SAFE_SVG_FALLBACK_STYLE_SENTINEL = 'kg:style:svg-fallback'
export const MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/style.json'
export const MAPLIBRE_MODERN_DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const MAPLIBRE_GLOBE_DEFAULT_STYLE_URL = 'https://demotiles.maplibre.org/globe.json'
export const MAPLIBRE_DEFAULT_STYLE_URL = MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
export const DEFAULT_GEOSPATIAL_VIEW_MODE: GeospatialViewMode = '2d-modern'
export const FLIGHT_GEO_BOOTSTRAP_STYLE = Object.freeze({
  version: 8 as const,
  name: 'AgenticGraph Flight Geo+XR bootstrap',
  sources: Object.freeze({}),
  layers: Object.freeze([
    Object.freeze({
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background' as const,
      paint: Object.freeze({
        'background-color': '#7dd3fc',
      }),
    }),
  ]),
})
export { GRABMAPS_DEFAULT_STYLE_URL }

export const normalizeGeospatialViewMode = (mode: unknown): GeospatialViewMode => {
  return mode === '3d-modern'
    ? '3d-modern'
    : mode === '3d'
      ? '3d'
      : mode === '2d-modern'
        ? '2d-modern'
        : mode === '2d'
          ? '2d'
          : mode === '2d-svg'
            ? '2d-svg'
            : DEFAULT_GEOSPATIAL_VIEW_MODE
}

export const getBuiltInDefaultStyleUrl = (mode: GeospatialViewMode): string => {
  return mode === '3d'
    ? MAPLIBRE_GLOBE_DEFAULT_STYLE_URL
    : mode === '2d-modern'
      ? MAPLIBRE_MODERN_DEFAULT_STYLE_URL
      : mode === '3d-modern'
        ? MAPLIBRE_MODERN_DEFAULT_STYLE_URL
        : MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
}

export const resolveCanonicalPersistedGeospatialStyleUrl = (
  viewMode: GeospatialViewMode,
  rawStyleUrl: string | null | undefined,
): string => {
  return normalizePersistedGeospatialStyleUrl(rawStyleUrl)
    || getBuiltInDefaultStyleUrl(normalizeGeospatialViewMode(viewMode))
}

export const isGrabMapsStyleUrl = (rawUrl: string): boolean => {
  try {
    return new URL(String(rawUrl || '').trim()).hostname.toLowerCase() === 'maps.grab.com'
  } catch {
    return false
  }
}

export const isGrabMapsPresetActive = (styleUrl: string, viewMode: GeospatialViewMode): boolean => {
  return viewMode === '2d-modern' && isGrabMapsStyleUrl(styleUrl)
}

export const resolveStandardViewModeStyleUrl = (
  viewMode: GeospatialViewMode,
  rawStyleUrl: string | null | undefined,
): string => {
  const normalizedViewMode = normalizeGeospatialViewMode(viewMode)
  const normalizedStyleUrl = normalizePersistedGeospatialStyleUrl(rawStyleUrl)
  if (
    !normalizedStyleUrl
    || normalizedStyleUrl === SAFE_SVG_FALLBACK_STYLE_SENTINEL
    || normalizedStyleUrl === MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
    || normalizedStyleUrl === MAPLIBRE_MODERN_DEFAULT_STYLE_URL
    || normalizedStyleUrl === MAPLIBRE_GLOBE_DEFAULT_STYLE_URL
    || isGrabMapsStyleUrl(normalizedStyleUrl)
  ) {
    return getBuiltInDefaultStyleUrl(normalizedViewMode)
  }
  return normalizedStyleUrl
}

export const resolveEffectiveGeospatialStyleUrl = (
  viewMode: GeospatialViewMode,
  rawStyleUrl: string | null | undefined,
): string => {
  const normalizedViewMode = normalizeGeospatialViewMode(viewMode)
  if (normalizedViewMode === '2d-svg') return SAFE_SVG_FALLBACK_STYLE_SENTINEL
  const normalizedStyleUrl = normalizePersistedGeospatialStyleUrl(rawStyleUrl)
  if (!normalizedStyleUrl || normalizedStyleUrl === SAFE_SVG_FALLBACK_STYLE_SENTINEL) {
    return getBuiltInDefaultStyleUrl(normalizedViewMode)
  }
  if (isGrabMapsStyleUrl(normalizedStyleUrl)) {
    if (!canAttemptGrabMapsStyle()) {
      return getBuiltInDefaultStyleUrl(normalizedViewMode)
    }
    return isGrabMapsPresetActive(normalizedStyleUrl, normalizedViewMode)
      ? normalizedStyleUrl
      : getBuiltInDefaultStyleUrl(normalizedViewMode)
  }
  if (
    normalizedStyleUrl === MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL
    || normalizedStyleUrl === MAPLIBRE_MODERN_DEFAULT_STYLE_URL
    || normalizedStyleUrl === MAPLIBRE_GLOBE_DEFAULT_STYLE_URL
  ) {
    return getBuiltInDefaultStyleUrl(normalizedViewMode)
  }
  return normalizedStyleUrl
}

export const normalizePersistedGeospatialStyleUrl = (raw: string | null | undefined): string => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  if (trimmed === SAFE_SVG_FALLBACK_STYLE_SENTINEL) return SAFE_SVG_FALLBACK_STYLE_SENTINEL

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('kg:style:')) return ''

  // Allow explicit remote style URLs for MapLibre runtime paths.
  if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed
  return trimmed
}

export const canAttemptGrabMapsStyle = (): boolean => {
  if (typeof window === 'undefined') return true
  const mode = readGrabMapsAuthModeFromBrowser()
  if (mode === 'serverManaged') return true
  return !!readGrabMapsByokApiKeyFromBrowser()
}
