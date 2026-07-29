export const ENHANCED_LAYER_ENV_KEY = 'VITE_GEOSPATIAL_DATASETS_JSON'

declare global {
  interface ImportMeta {
    readonly env?: {
      readonly VITE_GEOSPATIAL_DATASETS_JSON?: string
    }
  }
}

export type EnhancedLayerConfigSource = {
  raw: unknown
  source: 'local-storage' | 'environment' | 'default'
  invalidEnvironmentValue?: string
}

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function resolveEnhancedLayerConfigSource(
  storedValue: string | null,
  environmentValue: string | undefined,
): EnhancedLayerConfigSource {
  if (storedValue != null) {
    return {
      raw: parseJson(storedValue) ?? [],
      source: 'local-storage',
    }
  }
  const normalizedEnvironmentValue = String(environmentValue || '').trim()
  if (!normalizedEnvironmentValue) return { raw: [], source: 'default' }
  const parsed = parseJson(normalizedEnvironmentValue)
  if (parsed == null) {
    return {
      raw: [],
      source: 'environment',
      invalidEnvironmentValue: normalizedEnvironmentValue,
    }
  }
  return { raw: parsed, source: 'environment' }
}

export function readBundledEnhancedLayerEnvironmentValue(): string | undefined {
  return import.meta.env?.VITE_GEOSPATIAL_DATASETS_JSON
}
