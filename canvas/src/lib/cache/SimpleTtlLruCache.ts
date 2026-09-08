type CacheEntry<Value> = {
  value: Value
  expiresAt: number
}

export class SimpleTtlLruCache<Key, Value> {
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly entries = new Map<Key, CacheEntry<Value>>()

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 1
    this.ttlMs = Number.isFinite(ttlMs) ? Math.max(1, Math.floor(ttlMs)) : 1
  }

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: Key, value: Value): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    this.evictExpired()
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  delete(key: Key): boolean {
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) continue
      this.entries.delete(key)
    }
  }
}
