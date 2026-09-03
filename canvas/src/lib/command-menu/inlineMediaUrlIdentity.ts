const INLINE_MEDIA_URL_PATTERN = /(?:https?:\/\/|\/)[^\s<>"')\]]+/giu

export function normalizeInlineMediaUrl(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/[.,;:]+$/g, '')
}

export function buildInlineMediaUrlIdentityKey(raw: unknown): string {
  const normalized = normalizeInlineMediaUrl(raw)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized, 'http://agentic-graph.local')
    parsed.searchParams.delete('kg_media_token')
    parsed.searchParams.sort()
    const query = parsed.searchParams.toString()
    const path = `${parsed.pathname}${query ? `?${query}` : ''}`
    if (parsed.pathname.startsWith('/api/storage/media/')) return path.toLowerCase()
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)
      ? `${parsed.protocol}//${parsed.host}${path}`.toLowerCase()
      : path.toLowerCase()
  } catch {
    return normalized
      .replace(/([?&])kg_media_token=[^&]+&?/gi, '$1')
      .replace(/[?&]$/g, '')
      .toLowerCase()
  }
}

export function sourceContainsInlineMediaUrl(source: unknown, candidateUrl: unknown): boolean {
  const text = String(source || '')
  const normalizedCandidate = normalizeInlineMediaUrl(candidateUrl)
  if (!text || !normalizedCandidate) return false
  if (text.includes(normalizedCandidate)) return true
  const candidateKey = buildInlineMediaUrlIdentityKey(normalizedCandidate)
  if (!candidateKey) return false
  INLINE_MEDIA_URL_PATTERN.lastIndex = 0
  for (;;) {
    const match = INLINE_MEDIA_URL_PATTERN.exec(text)
    if (!match) return false
    if (buildInlineMediaUrlIdentityKey(match[0]) === candidateKey) return true
  }
}
