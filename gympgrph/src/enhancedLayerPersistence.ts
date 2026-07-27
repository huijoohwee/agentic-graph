import { LS_KEYS } from './lib/config.js'
import { normalizeEnhancedConfig } from './enhancedLayerConfig.js'
import {
  emitGeospatialEnhancedLayersChanged,
  emitGeospatialModeChanged,
} from 'grph-shared/geospatial/events'
import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'

const readJson = (key: string, fallback: unknown): unknown => {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown): boolean => {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const readVisibility = (): Record<string, boolean> => {
  const value = readJson(LS_KEYS.geospatialEnhancedLayerVisibility, {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, visible]) => typeof visible === 'boolean'),
  ) as Record<string, boolean>
}

export const readEnhancedLayerConfig = (): NormalizedEnhancedConfig => {
  const normalized = normalizeEnhancedConfig(readJson(LS_KEYS.geospatialEnhancedLayers, []))
  const visibility = readVisibility()
  return {
    ...normalized,
    extrusions: normalized.extrusions.map(layer => ({
      ...layer,
      visible: visibility[layer.id] ?? layer.visible,
    })),
    assets: normalized.assets.map(asset => ({
      ...asset,
      visible: visibility[asset.id] ?? asset.visible,
    })),
  }
}

export const writeEnhancedLayerConfig = (raw: unknown): boolean => {
  const normalized = normalizeEnhancedConfig(raw)
  if (
    normalized.diagnostics.some(diagnostic => diagnostic.code === 'missing-fetch-bound' || diagnostic.code === 'invalid-config')
  ) return false
  if (!writeJson(LS_KEYS.geospatialEnhancedLayers, raw)) return false
  const ids = [...normalized.extrusions, ...normalized.assets].map(entry => entry.id)
  emitGeospatialEnhancedLayersChanged(ids)
  return true
}

export const setEnhancedLayerVisibility = (
  kind: 'extrusion' | 'asset',
  id: string,
  visible: boolean,
): boolean => {
  const config = readEnhancedLayerConfig()
  const entries = kind === 'extrusion' ? config.extrusions : config.assets
  if (!entries.some(entry => entry.id === id)) return false
  const next = { ...readVisibility(), [id]: visible === true }
  if (!writeJson(LS_KEYS.geospatialEnhancedLayerVisibility, next)) return false
  emitGeospatialEnhancedLayersChanged([id])
  emitGeospatialModeChanged({})
  return true
}

export const setEnhancedTagVisibility = (tag: string, visible: boolean): readonly string[] => {
  const normalizedTag = String(tag || '').trim().toLowerCase()
  const targetTag = normalizedTag.startsWith('#') ? normalizedTag : `#${normalizedTag}`
  const config = readEnhancedLayerConfig()
  const ids = [...config.extrusions, ...config.assets]
    .filter(entry => entry.tags.includes(targetTag))
    .map(entry => entry.id)
  if (ids.length === 0) return []
  const next = { ...readVisibility() }
  ids.forEach(id => {
    next[id] = visible === true
  })
  if (!writeJson(LS_KEYS.geospatialEnhancedLayerVisibility, next)) return []
  emitGeospatialEnhancedLayersChanged(ids)
  emitGeospatialModeChanged({})
  return ids
}
