import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildMarkdownTokensKey, lexMarkdown, type TokenWithLines } from '@/features/markdown/ui/markdownPreviewLex'
import { parseMarkdownFrontmatter, splitMarkdownLines, type MarkdownFrontmatter } from '@/lib/markdown'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'

type LexedMarkdownResult = {
  tokens: TokenWithLines[]
  meta: MarkdownFrontmatter
  startLineOffset: number
}

type CachedFrontmatterResult = {
  meta: MarkdownFrontmatter
  startLineOffset: number
}

type CacheEntry<T> = {
  sourceChars: number
  value: T
}

const FRONTMATTER_CACHE_LIMIT = 8
const FRONTMATTER_CACHE_MAX_TOTAL_CHARS = 1_500_000
const FRONTMATTER_CACHE_MAX_ENTRY_CHARS = 500_000
const LEXED_CACHE_LIMIT = 6
const LEXED_CACHE_MAX_TOTAL_CHARS = 720_000
const LEXED_CACHE_MAX_ENTRY_CHARS = 240_000

const frontmatterCache = new Map<string, CacheEntry<CachedFrontmatterResult>>()
const lexedMarkdownCache = new Map<string, CacheEntry<LexedMarkdownResult>>()

const sumCachedSourceChars = <T,>(cache: Map<string, CacheEntry<T>>): number => {
  let total = 0
  for (const entry of cache.values()) total += entry.sourceChars
  return total
}

const readCachedValue = <T,>(cache: Map<string, CacheEntry<T>>, key: string): T | null => {
  const cached = cache.get(key)
  if (cached == null) return null
  cache.delete(key)
  cache.set(key, cached)
  return cached.value
}

const pruneCachedValues = <T,>(
  cache: Map<string, CacheEntry<T>>,
  limits: { maxEntries: number; maxTotalChars: number },
): void => {
  while (cache.size > limits.maxEntries || sumCachedSourceChars(cache) > limits.maxTotalChars) {
    const oldest = cache.keys().next().value
    if (typeof oldest !== 'string') return
    cache.delete(oldest)
  }
}

const writeCachedValue = <T,>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  limits: { maxEntries: number; maxTotalChars: number; maxEntryChars: number },
  sourceChars: number,
): T => {
  if (sourceChars > limits.maxEntryChars) return value
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { sourceChars, value })
  pruneCachedValues(cache, limits)
  return value
}

const getParsedFrontmatterCached = (text: string, cacheKey: string): CachedFrontmatterResult => {
  const cached = readCachedValue(frontmatterCache, cacheKey)
  if (cached) return cached
  if (!text.startsWith('---')) {
    return writeCachedValue(
      frontmatterCache,
      cacheKey,
      { meta: {}, startLineOffset: 0 },
      {
        maxEntries: FRONTMATTER_CACHE_LIMIT,
        maxTotalChars: FRONTMATTER_CACHE_MAX_TOTAL_CHARS,
        maxEntryChars: FRONTMATTER_CACHE_MAX_ENTRY_CHARS,
      },
      text.length,
    )
  }
  const lines = splitMarkdownLines(text)
  const { meta, startIndex } = parseMarkdownFrontmatter(lines)
  return writeCachedValue(
    frontmatterCache,
    cacheKey,
    { meta, startLineOffset: startIndex },
    {
      maxEntries: FRONTMATTER_CACHE_LIMIT,
      maxTotalChars: FRONTMATTER_CACHE_MAX_TOTAL_CHARS,
      maxEntryChars: FRONTMATTER_CACHE_MAX_ENTRY_CHARS,
    },
    text.length,
  )
}

const getLexedMarkdownCached = (text: string, cacheKey: string): LexedMarkdownResult => {
  const cached = readCachedValue(lexedMarkdownCache, cacheKey)
  if (cached) return cached
  return writeCachedValue(
    lexedMarkdownCache,
    cacheKey,
    lexMarkdown(text),
    {
      maxEntries: LEXED_CACHE_LIMIT,
      maxTotalChars: LEXED_CACHE_MAX_TOTAL_CHARS,
      maxEntryChars: LEXED_CACHE_MAX_ENTRY_CHARS,
    },
    text.length,
  )
}

export function sanitizeProvidedMarkdownPreviewTokensForFrontmatter(
  tokens: TokenWithLines[],
  startLineOffset: number,
): TokenWithLines[] {
  const offset = Math.max(0, Math.floor(Number(startLineOffset) || 0))
  if (!offset || !tokens.length) return tokens
  let changed = false
  const filtered = tokens.filter(token => {
    const startLine = Math.floor(Number(token.startLine) || 0)
    const keep = !startLine || startLine > offset
    if (!keep) changed = true
    return keep
  })
  return changed ? filtered : tokens
}

export function useMarkdownPreviewLexedMarkdown(
  markdownText: string,
  providedTokens: TokenWithLines[] | undefined,
  activeDocumentPath: string,
  shouldUpdateStore: boolean = true
) {
  const text = String(markdownText || '')
  const canCacheInStore = text.length <= 120_000

  const storedTokens = useGraphStore(s => s.markdownTokens)
  const storedTokensPath = useGraphStore(s => s.markdownTokensPath)
  const storedTokensKey = useGraphStore(s => s.markdownTokensKey)
  const storedTokensMeta = useGraphStore(s => s.markdownTokensMeta)
  const storedTokensStartLineOffset = useGraphStore(s => s.markdownTokensStartLineOffset)
  const setMarkdownTokens = useGraphStore(s => s.setMarkdownTokens)

  const currentTokensKey = React.useMemo(() => buildMarkdownTokensKey(text), [text])
  const storedTokensPathMatches = React.useMemo(() => {
    const activePath = String(activeDocumentPath || '').trim()
    if (!activePath) return true
    const storedPath = String(storedTokensPath || '').trim()
    if (!storedPath) return false
    return matchesMarkdownDocumentPath(storedPath, activePath)
  }, [activeDocumentPath, storedTokensPath])

  const providedTokensFrontmatter = React.useMemo(() => {
    if (!providedTokens || providedTokens.length === 0) return null
    if (!shouldUpdateStore) {
      const { meta, startIndex } = parseMarkdownFrontmatter(splitMarkdownLines(text))
      return { meta, startLineOffset: startIndex }
    }
    return getParsedFrontmatterCached(text, currentTokensKey)
  }, [currentTokensKey, providedTokens, shouldUpdateStore, text])

  const lexedLarge = React.useMemo((): LexedMarkdownResult => {
    if (providedTokens && providedTokens.length > 0 && providedTokensFrontmatter) {
      return {
        tokens: sanitizeProvidedMarkdownPreviewTokensForFrontmatter(
          providedTokens,
          providedTokensFrontmatter.startLineOffset,
        ),
        meta: providedTokensFrontmatter.meta,
        startLineOffset: providedTokensFrontmatter.startLineOffset,
      }
    }
    return shouldUpdateStore ? getLexedMarkdownCached(text, currentTokensKey) : lexMarkdown(text)
  }, [currentTokensKey, providedTokens, providedTokensFrontmatter, shouldUpdateStore, text])

  const lexedSmall = React.useMemo((): LexedMarkdownResult => {
    if (!shouldUpdateStore) return lexedLarge
    if (providedTokens && providedTokens.length > 0 && providedTokensFrontmatter) {
      return {
        tokens: sanitizeProvidedMarkdownPreviewTokensForFrontmatter(
          providedTokens,
          providedTokensFrontmatter.startLineOffset,
        ),
        meta: providedTokensFrontmatter.meta,
        startLineOffset: providedTokensFrontmatter.startLineOffset,
      }
    }

    if (
      storedTokens &&
      storedTokensKey === currentTokensKey &&
      storedTokensPathMatches &&
      storedTokensMeta != null &&
      storedTokensStartLineOffset != null
    ) {
      return {
        tokens: storedTokens,
        meta: storedTokensMeta,
        startLineOffset: storedTokensStartLineOffset,
      }
    }

    return getLexedMarkdownCached(text, currentTokensKey)
  }, [
    shouldUpdateStore,
    lexedLarge,
    currentTokensKey,
    providedTokens,
    providedTokensFrontmatter,
    storedTokens,
    storedTokensKey,
    storedTokensPathMatches,
    storedTokensMeta,
    storedTokensStartLineOffset,
    text,
  ])

  const lexed = canCacheInStore ? lexedSmall : lexedLarge

  React.useEffect(() => {
    if (!shouldUpdateStore) return
    if (providedTokens && providedTokens.length > 0) return
    if (!canCacheInStore) return

    const keysMatch = storedTokensKey === currentTokensKey
    const pathMatches = storedTokensPathMatches
    const metaMatches = storedTokensMeta != null && storedTokensMeta === lexed.meta
    const offsetMatches =
      storedTokensStartLineOffset != null && storedTokensStartLineOffset === lexed.startLineOffset

    if (keysMatch && pathMatches && metaMatches && offsetMatches) return

    if (
      lexed.tokens &&
      (!keysMatch ||
        !pathMatches ||
        storedTokensMeta !== lexed.meta ||
        storedTokensStartLineOffset !== lexed.startLineOffset)
    ) {
      setMarkdownTokens({
        tokens: lexed.tokens,
        path: activeDocumentPath,
        key: currentTokensKey,
        meta: lexed.meta,
        startLineOffset: lexed.startLineOffset,
      })
    }
  }, [
    activeDocumentPath,
    lexed.tokens,
    lexed.meta,
    lexed.startLineOffset,
    storedTokensKey,
    storedTokensPathMatches,
    currentTokensKey,
    providedTokens,
    setMarkdownTokens,
    shouldUpdateStore,
    canCacheInStore,
    storedTokensMeta,
    storedTokensStartLineOffset,
  ])

  return lexed
}

export function useMarkdownPreviewTokens(
  markdownText: string,
  providedTokens: TokenWithLines[] | undefined,
  activeDocumentPath: string,
  shouldUpdateStore: boolean = true
) {
  return useMarkdownPreviewLexedMarkdown(
    markdownText,
    providedTokens,
    activeDocumentPath,
    shouldUpdateStore,
  ).tokens
}
