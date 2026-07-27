import { LS_KEYS } from './lib/config.js'
import { normalizeEnhancedConfig } from './enhancedLayerConfig.js'
import {
  emitGeospatialEnhancedLayersChanged,
  emitGeospatialModeChanged,
} from 'grph-shared/geospatial/events'
import type { NormalizedEnhancedConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import {
  ENHANCED_LAYER_ENV_KEY,
  readBundledEnhancedLayerEnvironmentValue,
  resolveEnhancedLayerConfigSource,
  type EnhancedLayerConfigSource,
} from './enhancedLayerConfigSource.js'

export type EnhancedLayerEditorState = {
  source: EnhancedLayerConfigSource['source']
  raw: unknown
  normalized: NormalizedEnhancedConfig
  invalidEnvironmentValue?: string
}

export type EnhancedLayerPersistenceChange = {
  kind: 'catalog' | 'visibility'
  ids: readonly string[]
}

const persistenceListeners = new Set<(change: EnhancedLayerPersistenceChange) => void>()

const readRaw = (key: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const parseJson = (raw: string | null, fallback: unknown): unknown => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const restoreRaw = (key: string, raw: string | null): void => {
  if (typeof window === 'undefined') return
  if (raw == null) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, raw)
}

const applyStorageMutation = (mutate: () => void): boolean => {
  if (typeof window === 'undefined') return false
  const previousCatalog = readRaw(LS_KEYS.geospatialEnhancedLayers)
  const previousVisibility = readRaw(LS_KEYS.geospatialEnhancedLayerVisibility)
  try {
    mutate()
    return true
  } catch {
    try {
      restoreRaw(LS_KEYS.geospatialEnhancedLayers, previousCatalog)
      restoreRaw(LS_KEYS.geospatialEnhancedLayerVisibility, previousVisibility)
    } catch {
      void 0
    }
    return false
  }
}

const readVisibility = (): Record<string, boolean> => {
  const value = parseJson(readRaw(LS_KEYS.geospatialEnhancedLayerVisibility), {})
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, visible]) => typeof visible === 'boolean'),
  ) as Record<string, boolean>
}

const configIds = (config: NormalizedEnhancedConfig): readonly string[] => {
  return [...config.extrusions, ...config.assets].map(entry => entry.id)
}

const unionIds = (
  previous: NormalizedEnhancedConfig,
  next: NormalizedEnhancedConfig,
): readonly string[] => {
  return [...new Set([...configIds(previous), ...configIds(next)])]
}

const withVisibility = (
  normalized: NormalizedEnhancedConfig,
  visibility: Readonly<Record<string, boolean>>,
): NormalizedEnhancedConfig => ({
  ...normalized,
  extrusions: normalized.extrusions.map(layer => ({
    ...layer,
    visible: visibility[layer.id] ?? layer.visible,
  })),
  assets: normalized.assets.map(asset => ({
    ...asset,
    visible: visibility[asset.id] ?? asset.visible,
  })),
})

const publishPersistenceChange = (change: EnhancedLayerPersistenceChange): void => {
  emitGeospatialEnhancedLayersChanged(change.ids)
  persistenceListeners.forEach(listener => {
    try {
      listener(change)
    } catch {
      void 0
    }
  })
}

export const onEnhancedLayerPersistenceChanged = (
  listener: (change: EnhancedLayerPersistenceChange) => void,
): (() => void) => {
  persistenceListeners.add(listener)
  return () => persistenceListeners.delete(listener)
}

export const readEnhancedLayerEditorState = (): EnhancedLayerEditorState => {
  const source = resolveEnhancedLayerConfigSource(
    readRaw(LS_KEYS.geospatialEnhancedLayers),
    readBundledEnhancedLayerEnvironmentValue(),
  )
  const normalized = normalizeEnhancedConfig(source.raw)
  const diagnostics: NormalizedEnhancedConfig['diagnostics'] = source.invalidEnvironmentValue
    ? [
        ...normalized.diagnostics,
        {
          code: 'invalid-config',
          target: 'environment',
          field: ENHANCED_LAYER_ENV_KEY,
          value: source.invalidEnvironmentValue,
        },
      ]
    : normalized.diagnostics
  return {
    source: source.source,
    raw: source.raw,
    normalized: withVisibility({ ...normalized, diagnostics }, readVisibility()),
    ...(source.invalidEnvironmentValue
      ? { invalidEnvironmentValue: source.invalidEnvironmentValue }
      : {}),
  }
}

export const readEnhancedLayerConfig = (): NormalizedEnhancedConfig => {
  return readEnhancedLayerEditorState().normalized
}

const isCompleteCatalog = (raw: unknown, normalized: NormalizedEnhancedConfig): raw is readonly unknown[] => {
  if (!Array.isArray(raw) || normalized.diagnostics.length > 0) return false
  const entries = [...normalized.extrusions, ...normalized.assets]
  if (entries.length !== raw.length) return false
  return new Set(entries.map(entry => entry.id)).size === entries.length
}

export const writeEnhancedLayerConfig = (raw: unknown): boolean => {
  const normalized = normalizeEnhancedConfig(raw)
  if (!isCompleteCatalog(raw, normalized)) return false
  const previous = readEnhancedLayerConfig()
  const retainedIds = new Set(configIds(normalized))
  const nextVisibility = Object.fromEntries(
    Object.entries(readVisibility()).filter(([id]) => retainedIds.has(id)),
  )
  const written = applyStorageMutation(() => {
    window.localStorage.setItem(LS_KEYS.geospatialEnhancedLayers, JSON.stringify(raw))
    if (Object.keys(nextVisibility).length === 0) {
      window.localStorage.removeItem(LS_KEYS.geospatialEnhancedLayerVisibility)
    } else {
      window.localStorage.setItem(
        LS_KEYS.geospatialEnhancedLayerVisibility,
        JSON.stringify(nextVisibility),
      )
    }
  })
  if (!written) return false
  publishPersistenceChange({ kind: 'catalog', ids: unionIds(previous, normalized) })
  return true
}

export const clearEnhancedLayerConfigOverride = (): boolean => {
  if (typeof window === 'undefined') return false
  const previous = readEnhancedLayerConfig()
  const cleared = applyStorageMutation(() => {
    window.localStorage.removeItem(LS_KEYS.geospatialEnhancedLayers)
    window.localStorage.removeItem(LS_KEYS.geospatialEnhancedLayerVisibility)
  })
  if (!cleared) return false
  const next = readEnhancedLayerConfig()
  publishPersistenceChange({ kind: 'catalog', ids: unionIds(previous, next) })
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
  const written = applyStorageMutation(() => {
    window.localStorage.setItem(LS_KEYS.geospatialEnhancedLayerVisibility, JSON.stringify(next))
  })
  if (!written) return false
  publishPersistenceChange({ kind: 'visibility', ids: [id] })
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
  const written = applyStorageMutation(() => {
    window.localStorage.setItem(LS_KEYS.geospatialEnhancedLayerVisibility, JSON.stringify(next))
  })
  if (!written) return []
  publishPersistenceChange({ kind: 'visibility', ids })
  emitGeospatialModeChanged({})
  return ids
}
