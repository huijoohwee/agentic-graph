import { GRAPH_POINT_PICK_RADIUS_PX } from './pickNearestPointFeature.js'

const POI_NAME_KEYS = ['name', 'name_en', 'poi_name', 'label', 'title', 'display_name'] as const

export const readPoiLabelFromFeature = (feature: unknown): string => {
  if (!feature || typeof feature !== 'object') return ''
  const properties = (feature as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object') return ''
  for (const key of POI_NAME_KEYS) {
    const value = (properties as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export const isGraphOverlayFeature = (feature: unknown): boolean => {
  if (!feature || typeof feature !== 'object') return false
  const properties = (feature as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object') return false
  const record = properties as Record<string, unknown>
  return typeof record.kgCategory === 'string' && String(record.id || '').trim() !== ''
}

export const isCoarseRegionFeature = (feature: unknown): boolean => {
  if (!feature || typeof feature !== 'object') return false
  const properties = (feature as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object') return false
  const record = properties as Record<string, unknown>
  return String(record.role || '').trim().toLowerCase() === 'region'
    && String(record.precision || '').trim().toLowerCase() === 'coarse'
}

export function buildGraphFeatureSearchBounds(point: unknown): [[number, number], [number, number]] | null {
  if (!point || typeof point !== 'object') return null
  const { x, y } = point as { x?: unknown; y?: unknown }
  const clickX = Number(x)
  const clickY = Number(y)
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) return null
  const radius = GRAPH_POINT_PICK_RADIUS_PX
  return [[clickX - radius, clickY - radius], [clickX + radius, clickY + radius]]
}
