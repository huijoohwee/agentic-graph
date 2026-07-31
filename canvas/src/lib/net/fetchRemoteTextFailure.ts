import type { FetchRemoteTextFailure } from 'grph-shared/net/fetchRemoteText'

export function isRemoteRateLimitFailureMessage(value: unknown): boolean {
  const message = String(value || '').trim()
  return /\b(?:rate[\s-]*limit(?:ed|ing)?|too[\s-]*many[\s-]*requests)\b/i.test(message)
}

export function describeFetchRemoteTextFailure(res: FetchRemoteTextFailure): string {
  if (res.kind === 'timeout') return 'Timeout'
  if (res.kind === 'too_large') {
    const cl = typeof res.contentLength === 'number' && Number.isFinite(res.contentLength) ? res.contentLength : null
    if (cl != null) {
      const mb = (cl / (1024 * 1024)).toFixed(1)
      return `Too large (${mb} MB)`
    }
    return 'Too large'
  }
  if (res.kind === 'http') {
    const base = `HTTP ${res.status || 400}`
    const extra = String((res as unknown as { errorText?: unknown }).errorText || '').trim()
    if (!extra) return base
    const oneLine = extra.replace(/\s+/g, ' ').trim()
    const clipped = oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine
    return `${base}: ${clipped}`
  }
  return 'Request failed'
}
