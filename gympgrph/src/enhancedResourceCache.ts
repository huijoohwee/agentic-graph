export const ENHANCED_RESOURCE_CACHE_BYTE_BUDGET = 32 * 1024 * 1024
export const ENHANCED_RESOURCE_CACHE_ENTRY_LIMIT = 32

type CacheEntry = {
  bytes: Uint8Array
  byteLength: number
}

export type EnhancedResourceCacheRead =
  | { kind: 'miss' }
  | { kind: 'max-bytes-exceeded'; byteLength: number }
  | { kind: 'hit'; bytes: Uint8Array }

export type EnhancedResourceCacheStats = {
  entryCount: number
  totalBytes: number
  byteBudget: number
}

export class ByteBoundedResourceCache {
  private readonly entries = new Map<string, CacheEntry>()
  private totalBytes = 0

  constructor(
    private readonly byteBudget = ENHANCED_RESOURCE_CACHE_BYTE_BUDGET,
    private readonly entryLimit = ENHANCED_RESOURCE_CACHE_ENTRY_LIMIT,
  ) {
    if (!Number.isSafeInteger(byteBudget) || byteBudget <= 0) {
      throw new TypeError('byteBudget must be a positive safe integer')
    }
    if (!Number.isSafeInteger(entryLimit) || entryLimit <= 0) {
      throw new TypeError('entryLimit must be a positive safe integer')
    }
  }

  read(key: string, maxBytes: number): EnhancedResourceCacheRead {
    const entry = this.entries.get(key)
    if (!entry) return { kind: 'miss' }
    if (entry.byteLength > maxBytes) {
      return { kind: 'max-bytes-exceeded', byteLength: entry.byteLength }
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return { kind: 'hit', bytes: entry.bytes.slice() }
  }

  write(key: string, bytes: Uint8Array): boolean {
    const byteLength = bytes.byteLength
    if (byteLength > this.byteBudget) {
      this.delete(key)
      return false
    }
    this.delete(key)
    while (
      this.entries.size >= this.entryLimit
      || this.totalBytes + byteLength > this.byteBudget
    ) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      this.delete(oldestKey)
    }
    this.entries.set(key, { bytes: bytes.slice(), byteLength })
    this.totalBytes += byteLength
    return true
  }

  clear(): void {
    this.entries.clear()
    this.totalBytes = 0
  }

  stats(): EnhancedResourceCacheStats {
    return {
      entryCount: this.entries.size,
      totalBytes: this.totalBytes,
      byteBudget: this.byteBudget,
    }
  }

  private delete(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.totalBytes -= entry.byteLength
  }
}

const enhancedResourceCache = new ByteBoundedResourceCache()

export const readEnhancedResourceCache = (
  key: string,
  maxBytes: number,
): EnhancedResourceCacheRead => enhancedResourceCache.read(key, maxBytes)

export const writeEnhancedResourceCache = (
  key: string,
  bytes: Uint8Array,
): boolean => enhancedResourceCache.write(key, bytes)

export const clearEnhancedResourceCache = (): void => enhancedResourceCache.clear()

export const readEnhancedResourceCacheStats = (): EnhancedResourceCacheStats => (
  enhancedResourceCache.stats()
)
