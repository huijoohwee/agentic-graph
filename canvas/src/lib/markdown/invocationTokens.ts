export type InvocationTokenKind = 'slash' | 'keyword' | 'binding'

export type InvocationTokenSegment =
  | { kind: 'text'; value: string }
  | { kind: 'token'; value: string; tokenKind: InvocationTokenKind }

export const INVOCATION_TOKEN_RE = /(?:#[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}|\/\p{L}[\p{L}\p{N}._-]{0,63}|@\p{L}[\p{L}\p{N}._-]{0,255})/gu
const INVOCATION_TOKEN_PREVIOUS_BOUNDARY_RE = /[\p{L}\p{N}_/-]/u
const INVOCATION_TOKEN_NEXT_BOUNDARY_RE = /[\p{L}\p{N}_-]/u
const INVOCATION_TOKEN_COMPACT_KEYWORD_PREVIOUS_RE = /[\p{L}\p{N}_.-]/u

export const readInvocationTokenKind = (value: string): InvocationTokenKind | null => {
  const token = String(value || '').trim()
  if (token.startsWith('/')) return 'slash'
  if (token.startsWith('#')) return 'keyword'
  if (token.startsWith('@')) return 'binding'
  return null
}

export const splitInvocationTokenSegments = (text: string): InvocationTokenSegment[] => {
  const raw = String(text ?? '')
  if (!raw) return [{ kind: 'text', value: '' }]
  const out: InvocationTokenSegment[] = []
  let last = 0
  let lastAcceptedTokenEnd = -1
  INVOCATION_TOKEN_RE.lastIndex = 0
  for (;;) {
    const match = INVOCATION_TOKEN_RE.exec(raw)
    if (!match) break
    const token = String(match[0] || '')
    const tokenKind = readInvocationTokenKind(token)
    if (!tokenKind) continue
    const start = match.index
    const end = start + token.length
    const previous = start > 0 ? raw[start - 1] || '' : ''
    const next = end < raw.length ? raw[end] || '' : ''
    const startsAfterAcceptedToken = start === lastAcceptedTokenEnd
    const startsCompactKeyword = tokenKind === 'keyword' && previous && INVOCATION_TOKEN_COMPACT_KEYWORD_PREVIOUS_RE.test(previous)
    const startsInsideSchemePath = tokenKind === 'slash' && previous === ':'
    if (startsInsideSchemePath || (previous && INVOCATION_TOKEN_PREVIOUS_BOUNDARY_RE.test(previous) && !startsAfterAcceptedToken && !startsCompactKeyword) || (next && INVOCATION_TOKEN_NEXT_BOUNDARY_RE.test(next))) continue
    if (start > last) out.push({ kind: 'text', value: raw.slice(last, start) })
    out.push({ kind: 'token', value: token, tokenKind })
    last = end
    lastAcceptedTokenEnd = end
  }
  if (last < raw.length) out.push({ kind: 'text', value: raw.slice(last) })
  return out.length ? out : [{ kind: 'text', value: raw }]
}

const normalizeInvocationTokenSpacingChunk = (raw: string): string => {
  const segments = splitInvocationTokenSegments(raw)
  if (!segments.some(segment => segment.kind === 'token')) return raw
  let out = ''
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const next = segments[index + 1]
    if (segment.kind === 'token') {
      if (out && !/[ \n]$/.test(out) && !/[([{<]$/.test(out)) out += ' '
      out += segment.value
      return
    }
    if (previous?.kind === 'token' && next?.kind === 'token' && /^[ \t]*$/.test(segment.value)) {
      out += ' '
      return
    }
    out += segment.value
  })
  return out
}

export const normalizeInvocationTokenSpacing = (text: string): string => {
  const raw = String(text ?? '')
  if (!raw) return ''
  const markdownCodePattern = /```[\s\S]*?```|`[^`\n]*`/g
  let out = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = markdownCodePattern.exec(raw))) {
    out += normalizeInvocationTokenSpacingChunk(raw.slice(lastIndex, match.index))
    out += match[0]
    lastIndex = match.index + match[0].length
  }
  out += normalizeInvocationTokenSpacingChunk(raw.slice(lastIndex))
  return out
}

const isSingleInvocationToken = (value: string): boolean => {
  const segments = splitInvocationTokenSegments(value)
  return segments.length === 1 && segments[0]?.kind === 'token' && segments[0].value === value
}

export const replaceTextRangeWithInvocationBoundary = (args: {
  text: string
  start: number
  end: number
  replacement: string
}): { text: string; cursor: number } => {
  const text = String(args.text ?? '')
  const start = Math.max(0, Math.min(text.length, args.start))
  const end = Math.max(start, Math.min(text.length, args.end))
  const replacement = String(args.replacement ?? '')
  const before = text.slice(0, start)
  const after = text.slice(end)
  if (!isSingleInvocationToken(replacement)) {
    return { text: `${before}${replacement}${after}`, cursor: start + replacement.length }
  }
  const prefix = before && INVOCATION_TOKEN_PREVIOUS_BOUNDARY_RE.test(before.at(-1) || '') ? ' ' : ''
  const suffix = after && INVOCATION_TOKEN_NEXT_BOUNDARY_RE.test(after[0] || '') ? ' ' : ''
  return {
    text: `${before}${prefix}${replacement}${suffix}${after}`,
    cursor: start + prefix.length + replacement.length + suffix.length,
  }
}
