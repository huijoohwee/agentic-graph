import {
  GEOSPATIAL_ENHANCED_LAYERS_CHANGED_EVENT,
  GEOSPATIAL_MODE_CHANGED_EVENT,
} from './constants.js'

export type GeospatialViewMode = '2d-svg' | '2d' | '2d-modern' | '3d' | '3d-modern'

export type GeospatialModeChangedDetail = {
  enabled?: boolean
  viewMode?: GeospatialViewMode
}

export function emitGeospatialModeChanged(detail: GeospatialModeChangedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<GeospatialModeChangedDetail>(GEOSPATIAL_MODE_CHANGED_EVENT, { detail }))
}

export function onGeospatialModeChanged(handler: (detail: GeospatialModeChangedDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const wrapped = (ev: Event) => {
    const e = ev as CustomEvent<GeospatialModeChangedDetail | undefined>
    if (!e.detail) return
    handler(e.detail)
  }
  window.addEventListener(GEOSPATIAL_MODE_CHANGED_EVENT, wrapped as EventListener)
  return () => window.removeEventListener(GEOSPATIAL_MODE_CHANGED_EVENT, wrapped as EventListener)
}

export type GeospatialEnhancedLayersChangedDetail = {
  ids: readonly string[]
}

export function emitGeospatialEnhancedLayersChanged(ids: readonly string[]): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<GeospatialEnhancedLayersChangedDetail>(
    GEOSPATIAL_ENHANCED_LAYERS_CHANGED_EVENT,
    { detail: { ids: [...ids] } },
  ))
}

export function onGeospatialEnhancedLayersChanged(
  handler: (detail: GeospatialEnhancedLayersChangedDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const wrapped = (event: Event) => {
    const detail = (event as CustomEvent<GeospatialEnhancedLayersChangedDetail>).detail
    if (detail) handler(detail)
  }
  window.addEventListener(GEOSPATIAL_ENHANCED_LAYERS_CHANGED_EVENT, wrapped as EventListener)
  return () => window.removeEventListener(GEOSPATIAL_ENHANCED_LAYERS_CHANGED_EVENT, wrapped as EventListener)
}
