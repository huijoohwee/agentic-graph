import assert from 'node:assert/strict'
import { SimpleTtlLruCache } from '@/lib/cache/SimpleTtlLruCache'
import {
  STABLE_OVERLAY_SURFACE_CACHE_LIMIT,
  STABLE_OVERLAY_SURFACE_CACHE_TTL_MS,
  clearStableFrontmatterOverlaySurfaceCache as clear,
  readStableFrontmatterOverlaySurfaceCache as read,
  writeStableFrontmatterOverlaySurfaceCache as write,
} from '@/components/StoryboardWidgetCanvas/runtime/stableOverlaySurfaceCache'

export function testTtlLruCacheEnforcesCapacityForUndefinedKeys() {
  const cache = new SimpleTtlLruCache<string | undefined, string>(2, 60_000)
  cache.set(undefined, 'first')
  cache.set('a', 'second')
  cache.set('b', 'third')
  assert.equal(cache.get(undefined), undefined, 'undefined is a valid evictable key')
  assert.equal(cache.get('a'), 'second')
  cache.set('c', 'fourth')
  assert.equal(cache.get('b'), undefined, 'read access must retain the more recently used entry')
  assert.equal(cache.delete('a'), true)
  assert.equal(cache.get('a'), undefined)
  assert.equal(cache.delete('a'), false)
  cache.clear()
  assert.equal(cache.get('c'), undefined)
}

export function testStableOverlaySurfaceCacheBoundsAndExpiresFallbacks() {
  const now = Date.now
  let time = now()
  const keys = Array.from({ length: STABLE_OVERLAY_SURFACE_CACHE_LIMIT + 1 }, (_, i) => `test:bounded-overlay:${i}`)
  const graphData = { type: 'Graph', nodes: [], edges: [] }
  const value = { sourceKey: 'source', graphKey: 'revision', ids: ['n1', 'n1', 'n2'], graphData }
  try {
    Date.now = () => time
    for (const key of keys.slice(0, -1)) write(key, value)
    const reused = read(keys[0])
    assert.equal(reused?.graphData, graphData, 'reuse the existing graph rather than clone it')
    assert.deepEqual(reused?.ids, ['n1', 'n2'])
    write(keys.at(-1), value)
    assert.equal(read(keys[1]), null, 'surface churn must evict the least recently used fallback')
    assert.equal(read(keys[0])?.sourceKey, 'source')
    clear(keys[0])
    assert.equal(read(keys[0]), null, 'source invalidation must remove exactly its fallback')
    assert.equal(read(keys[2])?.graphKey, 'revision')
    time += STABLE_OVERLAY_SURFACE_CACHE_TTL_MS
    assert.equal(read(keys[2]), null, 'reading a fallback must not extend its expiry')
  } finally {
    Date.now = now
    for (const key of keys) clear(key)
  }
}
