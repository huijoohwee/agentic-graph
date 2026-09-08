import type { WebpageLayoutSnapshot } from './webpageLayoutExport'

const CACHE_MAX = 8
const CACHE = new Map<string, WebpageLayoutSnapshot>()

const buildKey = (url: string, optionsKey?: string | null): string => {
  const base = String(url || '').trim()
  if (!base) return ''
  const opt = String(optionsKey || '').trim()
  return JSON.stringify([base, opt])
}

export function getCachedWebpageLayoutSnapshot(url: string, optionsKey?: string | null): WebpageLayoutSnapshot | null {
  const key = buildKey(url, optionsKey)
  if (!key) return null
  return CACHE.get(key) || null
}

export function setCachedWebpageLayoutSnapshot(url: string, snap: WebpageLayoutSnapshot, optionsKey?: string | null): void {
  const key = buildKey(url, optionsKey)
  if (!key) return
  CACHE.set(key, snap)
  if (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value as string | undefined
    if (oldest) CACHE.delete(oldest)
  }
}

export function clearCachedWebpageLayoutSnapshots(): void {
  CACHE.clear()
}
