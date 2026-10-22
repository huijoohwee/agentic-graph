const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 * 1024

export function estimateCacheValueBytes(value: unknown, depth = 0): number {
  if (value == null) return 8
  if (typeof value === 'string') return value.length * 2
  if (typeof value === 'number' || typeof value === 'boolean') return 8
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.byteLength
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size
  if (depth >= 2 || typeof value !== 'object') return 64
  if (Array.isArray(value)) {
    const sample = value.slice(0, 16)
    const average = sample.length ? sample.reduce((sum, item) => sum + estimateCacheValueBytes(item, depth + 1), 0) / sample.length : 0
    return 24 + Math.ceil(average * value.length)
  }
  const keys = Object.keys(value)
  const sample = keys.slice(0, 16)
  const childBytes = sample.reduce((sum, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return sum + key.length * 2 + 32 + (descriptor && 'value' in descriptor
      ? estimateCacheValueBytes(descriptor.value, depth + 1) : 0)
  }, 0)
  return 64 + Math.ceil(childBytes * Math.max(1, keys.length / Math.max(1, sample.length)))
}

type CacheEntry<Value> = { value: Value; expiresAt?: number; bytes: number }
type CacheOptions<Value> = { maxBytes?: number; sizeOf?: (value: Value) => number }

export class LRUCache<K, V> {
  private readonly maxSize: number
  private readonly maxBytes: number
  private readonly ttlMs?: number
  private readonly sizeOf: (value: V) => number
  private readonly map = new Map<K, CacheEntry<V>>()
  private estimatedBytes = 0

  constructor(maxSize = 200, ttlMs?: number, options: CacheOptions<V> = {}) {
    this.maxSize = Number.isFinite(maxSize) ? Math.max(1, Math.floor(maxSize)) : 1
    this.ttlMs = ttlMs
    const requestedMaxBytes = options.maxBytes
    this.maxBytes = requestedMaxBytes === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : typeof requestedMaxBytes === 'number' && Number.isFinite(requestedMaxBytes)
        ? Math.max(0, Math.floor(requestedMaxBytes)) : DEFAULT_MAX_CACHE_BYTES
    this.sizeOf = options.sizeOf ?? estimateCacheValueBytes
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expiresAt != null && Date.now() > entry.expiresAt) {
      this.remove(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    this.remove(key)
    const measured = Number(this.sizeOf(value))
    if (!Number.isFinite(measured) || measured < 0) throw new Error('LRU cache value size must be a finite non-negative byte estimate.')
    const bytes = 64 + estimateCacheValueBytes(key) + Math.ceil(measured)
    if (bytes > this.maxBytes) return
    this.map.set(key, { value, bytes, expiresAt: this.ttlMs != null ? Date.now() + this.ttlMs : undefined })
    this.estimatedBytes += bytes
    while (this.map.size > this.maxSize || this.estimatedBytes > this.maxBytes) {
      const oldest = this.map.keys().next()
      if (oldest.done) break
      this.remove(oldest.value)
    }
  }

  delete(key: K): void { this.remove(key) }
  clear(): void { this.map.clear(); this.estimatedBytes = 0 }

  deleteWhere(predicate: (args: { key: K; value: V }) => boolean): void {
    for (const [key, entry] of this.map) if (predicate({ key, value: entry.value })) this.remove(key)
  }

  getUsage(): { entries: number; estimatedBytes: number; maxEntries: number; maxBytes: number } {
    this.evictExpired()
    return { entries: this.map.size, estimatedBytes: this.estimatedBytes, maxEntries: this.maxSize, maxBytes: this.maxBytes }
  }

  private remove(key: K): void {
    const entry = this.map.get(key)
    if (!entry) return
    this.map.delete(key)
    this.estimatedBytes = Math.max(0, this.estimatedBytes - entry.bytes)
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.map) if (entry.expiresAt != null && entry.expiresAt <= now) this.remove(key)
  }
}
