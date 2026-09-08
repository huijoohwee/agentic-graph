import type { GraphData } from '@/lib/graph/types'
import { normalizeStringArrayForSignature } from '@/lib/hash/signature'
import { SimpleTtlLruCache } from '@/lib/cache/SimpleTtlLruCache'

type StableFrontmatterOverlaySurfaceCache = {
  sourceKey: string
  graphKey: string
  ids: string[]
  graphData: GraphData | null
}

export const STABLE_OVERLAY_SURFACE_CACHE_LIMIT = 32
export const STABLE_OVERLAY_SURFACE_CACHE_TTL_MS = 60_000
const stableFrontmatterOverlaySurfaceCacheById = new SimpleTtlLruCache<string, StableFrontmatterOverlaySurfaceCache>(
  STABLE_OVERLAY_SURFACE_CACHE_LIMIT, STABLE_OVERLAY_SURFACE_CACHE_TTL_MS,
)

export function normalizeOverlaySurfaceCacheKey(surfaceId: unknown): string {
  return String(surfaceId || '').trim() || 'surface'
}

export function readStableFrontmatterOverlaySurfaceCache(surfaceId: unknown): StableFrontmatterOverlaySurfaceCache | null {
  return stableFrontmatterOverlaySurfaceCacheById.get(normalizeOverlaySurfaceCacheKey(surfaceId)) || null
}

export function writeStableFrontmatterOverlaySurfaceCache(surfaceId: unknown, cache: StableFrontmatterOverlaySurfaceCache): void {
  const ids = normalizeStringArrayForSignature(cache.ids, { unique: true })
  if (ids.length === 0) return
  stableFrontmatterOverlaySurfaceCacheById.set(normalizeOverlaySurfaceCacheKey(surfaceId), {
    sourceKey: String(cache.sourceKey || '').trim(),
    graphKey: String(cache.graphKey || '').trim(),
    ids,
    graphData: cache.graphData,
  })
}

export function clearStableFrontmatterOverlaySurfaceCache(surfaceId: unknown): void {
  stableFrontmatterOverlaySurfaceCacheById.delete(normalizeOverlaySurfaceCacheKey(surfaceId))
}

