import { emitGeospatialModeChanged } from 'grph-shared/geospatial/events'
import { DEFAULT_GEOSPATIAL_OVERLAY_ENABLED, GEOSPATIAL_OVERLAY_PREFERENCE_VERSION } from 'grph-shared/geospatial/constants'
import { LS_KEYS } from '../../lib/config.js'
import { DEFAULT_GEOSPATIAL_VIEW_MODE, normalizeGeospatialViewMode } from '../../features/geospatial/basemapStyle.js'
import type { GeospatialFitRequest, GeospatialInteractionMode, GeospatialViewMode } from './types.js'

const readBool = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    if (v == null) return fallback
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
    return fallback
  } catch {
    return fallback
  }
}

const writeBool = (key: string, value: boolean): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    void 0
  }
}

const readString = (key: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    const s = typeof v === 'string' ? v.trim() : ''
    return s || fallback
  } catch {
    return fallback
  }
}

const writeString = (key: string, value: string): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    void 0
  }
}

const readGeospatialModeEnabledPreference = (): boolean => {
  const enabled = readBool(LS_KEYS.geospatialOverlayEnabled, DEFAULT_GEOSPATIAL_OVERLAY_ENABLED)
  if (!enabled) return false
  return readString(LS_KEYS.geospatialOverlayPreferenceVersion, '') === GEOSPATIAL_OVERLAY_PREFERENCE_VERSION
}

const readNumber = (key: string, fallback: number): number => {
  if (typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(key)
    if (v == null) return fallback
    const n = Number(String(v).trim())
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

const writeNumber = (key: string, value: number): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    void 0
  }
}

export type GympgrphGeospatialState = {
  geospatialModeEnabled: boolean
  geospatialViewMode: GeospatialViewMode
  geospatialInteractionMode: GeospatialInteractionMode
  geospatialAutoFitEnabled: boolean
  geospatialCursorLngLat: { lng: number; lat: number } | null
  geospatialFitRequest: GeospatialFitRequest | null
  geospatialDatasetTimeoutMs: number
  geospatialDatasetMaxBytes: number
  setGeospatialModeEnabled: (enabled: boolean) => void
  setGeospatialViewMode: (mode: GeospatialViewMode) => void
  setGeospatialInteractionMode: (mode: GeospatialInteractionMode) => void
  setGeospatialAutoFitEnabled: (enabled: boolean) => void
  setGeospatialCursorLngLat: (coords: { lng: number; lat: number } | null) => void
  setGeospatialDatasetTimeoutMs: (timeoutMs: number) => void
  setGeospatialDatasetMaxBytes: (maxBytes: number) => void
  requestGeospatialFitToData: () => void
  requestGeospatialFitToSelection: () => void
  requestGeospatialCurrentLocation: (coords: { lat: number; lng: number; zoom?: number }) => void
  requestGeospatialFitToBounds: (bounds: readonly [number, number, number, number]) => void
  clearGeospatialFitRequest: () => void
}

export const createDefaultGympgrphGeospatialState = (): Pick<
  GympgrphGeospatialState,
  | 'geospatialModeEnabled'
  | 'geospatialViewMode'
  | 'geospatialInteractionMode'
  | 'geospatialAutoFitEnabled'
  | 'geospatialCursorLngLat'
  | 'geospatialFitRequest'
  | 'geospatialDatasetTimeoutMs'
  | 'geospatialDatasetMaxBytes'
> => {
  const geospatialModeEnabled = readGeospatialModeEnabledPreference()
  const readPersistedViewMode = (): GeospatialViewMode => {
    return normalizeGeospatialViewMode(readString(LS_KEYS.geospatialViewMode, DEFAULT_GEOSPATIAL_VIEW_MODE))
  }
  const geospatialViewMode = readPersistedViewMode()
  const geospatialInteractionMode = (readString(LS_KEYS.geospatialInteractionMode, 'always') as GeospatialInteractionMode) || 'always'
  const geospatialAutoFitEnabled = readBool(LS_KEYS.geospatialAutoFitEnabled, false)
  const geospatialDatasetTimeoutMs = (() => {
    const raw = readNumber(LS_KEYS.geospatialDatasetTimeoutMs, 20_000)
    const ms = Math.floor(raw)
    if (!Number.isFinite(ms)) return 20_000
    return Math.max(1_000, Math.min(120_000, ms))
  })()
  const geospatialDatasetMaxBytes = (() => {
    const raw = readNumber(LS_KEYS.geospatialDatasetMaxBytes, 25 * 1024 * 1024)
    const b = Math.floor(raw)
    if (!Number.isFinite(b)) return 25 * 1024 * 1024
    return Math.max(64 * 1024, Math.min(100 * 1024 * 1024, b))
  })()
  return {
    geospatialModeEnabled,
    geospatialViewMode,
    geospatialInteractionMode,
    geospatialAutoFitEnabled,
    geospatialCursorLngLat: null,
    geospatialFitRequest: null,
    geospatialDatasetTimeoutMs,
    geospatialDatasetMaxBytes,
  }
}

export const buildGympgrphGeospatialActions = (set: (updater: (prev: GympgrphGeospatialState) => GympgrphGeospatialState) => void) => {
  const setGeospatialModeEnabled = (enabled: boolean) => {
    const next = enabled === true
    set(prev => {
      if (prev.geospatialModeEnabled === next) return prev
      writeBool(LS_KEYS.geospatialOverlayEnabled, next)
      writeString(LS_KEYS.geospatialOverlayPreferenceVersion, GEOSPATIAL_OVERLAY_PREFERENCE_VERSION)
      emitGeospatialModeChanged({ enabled: next, viewMode: prev.geospatialViewMode })
      return { ...prev, geospatialModeEnabled: next }
    })
  }

  const setGeospatialViewMode = (mode: GeospatialViewMode) => {
    const next = normalizeGeospatialViewMode(mode)
    set(prev => {
      if (prev.geospatialViewMode === next) return prev
      writeString(LS_KEYS.geospatialViewMode, next)
      emitGeospatialModeChanged({ enabled: prev.geospatialModeEnabled, viewMode: next })
      return { ...prev, geospatialViewMode: next }
    })
  }

  const setGeospatialInteractionMode = (mode: GeospatialInteractionMode) => {
    const next = mode === 'holdSpace' ? 'holdSpace' : 'always'
    set(prev => {
      if (prev.geospatialInteractionMode === next) return prev
      writeString(LS_KEYS.geospatialInteractionMode, next)
      return { ...prev, geospatialInteractionMode: next }
    })
  }

  const setGeospatialAutoFitEnabled = (enabled: boolean) => {
    const next = enabled === true
    set(prev => {
      if (prev.geospatialAutoFitEnabled === next) return prev
      writeBool(LS_KEYS.geospatialAutoFitEnabled, next)
      return { ...prev, geospatialAutoFitEnabled: next }
    })
  }

  const setGeospatialCursorLngLat = (coords: { lng: number; lat: number } | null) => {
    if (!coords) {
      set(prev => {
        if (!prev.geospatialCursorLngLat) return prev
        return { ...prev, geospatialCursorLngLat: null }
      })
      return
    }
    const lng = Number(coords.lng)
    const lat = Number(coords.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    set(prev => {
      const prevCoords = prev.geospatialCursorLngLat
      if (prevCoords && prevCoords.lng === lng && prevCoords.lat === lat) return prev
      return { ...prev, geospatialCursorLngLat: { lng, lat } }
    })
  }

  const setGeospatialDatasetTimeoutMs = (timeoutMs: number) => {
    const raw = Math.floor(Number(timeoutMs))
    const next = Number.isFinite(raw) ? Math.max(1_000, Math.min(120_000, raw)) : 20_000
    set(prev => {
      if (prev.geospatialDatasetTimeoutMs === next) return prev
      writeNumber(LS_KEYS.geospatialDatasetTimeoutMs, next)
      return { ...prev, geospatialDatasetTimeoutMs: next }
    })
  }

  const setGeospatialDatasetMaxBytes = (maxBytes: number) => {
    const raw = Math.floor(Number(maxBytes))
    const next = Number.isFinite(raw) ? Math.max(64 * 1024, Math.min(100 * 1024 * 1024, raw)) : 25 * 1024 * 1024
    set(prev => {
      if (prev.geospatialDatasetMaxBytes === next) return prev
      writeNumber(LS_KEYS.geospatialDatasetMaxBytes, next)
      return { ...prev, geospatialDatasetMaxBytes: next }
    })
  }

  const requestGeospatialFitToSelection = () => {
    set(prev => ({
      ...prev,
      geospatialFitRequest: { mode: 'selection' },
    }))
  }

  const requestGeospatialFitToData = () => {
    set(prev => ({
      ...prev,
      geospatialFitRequest: { mode: 'data' },
    }))
  }

  const requestGeospatialCurrentLocation = (coords: { lat: number; lng: number; zoom?: number }) => {
    const lat = Number(coords?.lat)
    const lng = Number(coords?.lng)
    const zoomRaw = Number(coords?.zoom)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const zoom = Number.isFinite(zoomRaw) ? Math.max(0, Math.min(22, zoomRaw)) : undefined
    set(prev => ({
      ...prev,
      geospatialFitRequest: { mode: 'currentLocation', lat, lng, ...(typeof zoom === 'number' ? { zoom } : {}) },
    }))
  }

  const requestGeospatialFitToBounds = (bounds: readonly [number, number, number, number]) => {
    const values = bounds.map(Number)
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return
    const [west, south, east, north] = values
    if (west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) return
    set(prev => ({
      ...prev,
      geospatialFitRequest: { mode: 'bounds', bounds: [west, south, east, north] },
    }))
  }

  const clearGeospatialFitRequest = () => {
    set(prev => {
      if (!prev.geospatialFitRequest) return prev
      return { ...prev, geospatialFitRequest: null }
    })
  }

  return {
    setGeospatialModeEnabled,
    setGeospatialViewMode,
    setGeospatialInteractionMode,
    setGeospatialAutoFitEnabled,
    setGeospatialCursorLngLat,
    setGeospatialDatasetTimeoutMs,
    setGeospatialDatasetMaxBytes,
    requestGeospatialFitToData,
    requestGeospatialFitToSelection,
    requestGeospatialCurrentLocation,
    requestGeospatialFitToBounds,
    clearGeospatialFitRequest,
  }
}
