import type { Feature, FeatureCollection, Geometry } from 'geojson'
import {
  EXTRUSION_MAX_HEIGHT_METERS,
  type ExtrusionLayerConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'

export type HeightDiagnostic = {
  code: 'missing-height' | 'non-numeric-height' | 'negative-height' | 'height-above-max'
  featureId: string
  value: unknown
}

const readFeatureId = (feature: Feature, index: number): string => {
  return String(feature.id ?? feature.properties?.id ?? `feature-${index + 1}`)
}

export function resolveExtrusionHeight(
  properties: unknown,
  config: Pick<ExtrusionLayerConfig, 'heightProperty' | 'defaultHeightMeters'>,
): { heightMeters: number; diagnostic: Omit<HeightDiagnostic, 'featureId'> | null } {
  const record = properties && typeof properties === 'object'
    ? properties as Record<string, unknown>
    : {}
  const value = record[config.heightProperty]
  const fallback = Math.max(0, Math.min(EXTRUSION_MAX_HEIGHT_METERS, config.defaultHeightMeters))
  if (value == null || value === '') return { heightMeters: fallback, diagnostic: { code: 'missing-height', value } }
  const height = Number(value)
  if (!Number.isFinite(height)) return { heightMeters: fallback, diagnostic: { code: 'non-numeric-height', value } }
  if (height < 0) return { heightMeters: fallback, diagnostic: { code: 'negative-height', value } }
  if (height > EXTRUSION_MAX_HEIGHT_METERS) {
    return { heightMeters: fallback, diagnostic: { code: 'height-above-max', value } }
  }
  return { heightMeters: height, diagnostic: null }
}

export function normalizeExtrusionFeatures(
  featureCollection: FeatureCollection,
  config: ExtrusionLayerConfig,
): { featureCollection: FeatureCollection; diagnostics: readonly HeightDiagnostic[] } {
  const diagnostics: HeightDiagnostic[] = []
  const features = featureCollection.features.map((feature, index): Feature<Geometry> => {
    const resolved = resolveExtrusionHeight(feature.properties, config)
    if (resolved.diagnostic) {
      diagnostics.push({
        ...resolved.diagnostic,
        featureId: readFeatureId(feature, index),
      })
    }
    return {
      ...feature,
      properties: {
        ...(feature.properties || {}),
        kgExtrusionHeightM: resolved.heightMeters,
      },
    }
  })
  return {
    featureCollection: { ...featureCollection, features },
    diagnostics,
  }
}
