type CacheEntry<Value> = {
  value: Value
  expiresAt: number
  bytes: number
}

type CacheOptions<Value> = { maxBytes?: number; sizeOf?: (value: Value) => number }
const DEFAULT_MAX_CACHE_BYTES = 2 * 1024 * 1024

function estimateCacheValueBytes(value: unknown, depth = 0): number {
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

export class SimpleTtlLruCache<Key, Value> {
  private readonly maxEntries: number
  private readonly maxBytes: number
  private readonly ttlMs: number
  private readonly entries = new Map<Key, CacheEntry<Value>>()
  private readonly sizeOf: (value: Value) => number
  private estimatedBytes = 0

  constructor(maxEntries: number, ttlMs: number, options: CacheOptions<Value> = {}) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 1
    this.ttlMs = Number.isFinite(ttlMs) ? Math.max(1, Math.floor(ttlMs)) : 1
    const requestedMaxBytes = options.maxBytes
    this.maxBytes = requestedMaxBytes === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : typeof requestedMaxBytes === 'number' && Number.isFinite(requestedMaxBytes)
        ? Math.max(0, Math.floor(requestedMaxBytes)) : DEFAULT_MAX_CACHE_BYTES
    this.sizeOf = options.sizeOf ?? estimateCacheValueBytes
  }

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.remove(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: Key, value: Value): void {
    this.remove(key)
    const measured = Number(this.sizeOf(value))
    if (!Number.isFinite(measured) || measured < 0) throw new Error('LRU cache value size must be a finite non-negative byte estimate.')
    const bytes = 64 + estimateCacheValueBytes(key) + Math.ceil(measured)
    if (bytes > this.maxBytes) return
    this.entries.set(key, { value, bytes, expiresAt: Date.now() + this.ttlMs })
    this.estimatedBytes += bytes
    this.evictExpired()
    while (this.entries.size > this.maxEntries || this.estimatedBytes > this.maxBytes) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.remove(oldest.value)
    }
  }

  delete(key: Key): boolean {
    return this.remove(key)
  }

  clear(): void {
    this.entries.clear()
    this.estimatedBytes = 0
  }

  getUsage(): { entries: number; estimatedBytes: number; maxEntries: number; maxBytes: number } {
    this.evictExpired()
    return { entries: this.entries.size, estimatedBytes: this.estimatedBytes, maxEntries: this.maxEntries, maxBytes: this.maxBytes }
  }

  private remove(key: Key): boolean {
    const entry = this.entries.get(key)
    if (!entry) return false
    this.entries.delete(key)
    this.estimatedBytes = Math.max(0, this.estimatedBytes - entry.bytes)
    return true
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) continue
      this.remove(key)
    }
  }
}
