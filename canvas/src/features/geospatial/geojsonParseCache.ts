import type { FeatureCollection } from 'geojson'
import { SimpleTtlLruCache } from '@/lib/cache/SimpleTtlLruCache'
import { hashText } from '@/features/parsers/hash'
import { coerceGeoJsonToFeatureCollection, parseGeoJsonFromText } from 'gympgrph/geojson'
import { cloneMarkdownGeoFeatureCollection } from './markdownGeoClone'

type CacheValue =
  | { ok: true; featureCollection: FeatureCollection }
  | { ok: false }

const parseCache = new SimpleTtlLruCache<string, CacheValue>(500, 20 * 60 * 1000)

export function parseGeoJsonFeatureCollectionFromText(text: string): FeatureCollection | null {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null
  const key = hashText(trimmed)
  const cached = parseCache.get(key)
  if (cached) return cached.ok ? cloneMarkdownGeoFeatureCollection(cached.featureCollection) : null
  try {
    const parsed = parseGeoJsonFromText(trimmed)
    const normalized = cloneMarkdownGeoFeatureCollection(coerceGeoJsonToFeatureCollection(parsed))
    parseCache.set(key, { ok: true, featureCollection: normalized })
    return cloneMarkdownGeoFeatureCollection(normalized)
  } catch {
    parseCache.set(key, { ok: false })
    return null
  }
}
