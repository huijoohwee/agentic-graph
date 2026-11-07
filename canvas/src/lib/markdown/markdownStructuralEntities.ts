const ENCODED_BLOCKQUOTE_MARKER = '&(?:amp;)*(?:gt|#0*62|#x0*3e);'
const ENCODED_BLOCKQUOTE_PREFIX = new RegExp(`^([\\t ]*)((?:${ENCODED_BLOCKQUOTE_MARKER}[\\t ]*)+)`, 'i')
const ENCODED_BLOCKQUOTE_MARKERS = new RegExp(ENCODED_BLOCKQUOTE_MARKER, 'gi')

/** Remove exact, delimiter-free duplicate payloads emitted on quoted lines by some HTML converters. */
export function collapseRepeatedBlockquotePayload(line: string): string {
  const source = String(line || '')
  const quote = source.match(/^([\t ]*>+[\t ]+)(.*)$/u)
  if (!quote) return source
  const payload = quote[2] || ''
  const characters = Array.from(payload)
  const midpoint = characters.length / 2
  if (!Number.isInteger(midpoint)) return source
  const repeatedPayload = characters.slice(0, midpoint).join('')
  if (!/\s/u.test(repeatedPayload) || repeatedPayload !== characters.slice(midpoint).join('')) return source
  return `${quote[1]}${repeatedPayload}`
}

/** Restore HTML-escaped quote markers only when they lead a Markdown line. */
export function restoreEncodedBlockquotePrefix(line: string): string {
  const source = String(line || '')
  const prefix = ENCODED_BLOCKQUOTE_PREFIX.exec(source)
  if (!prefix) return source

  const indent = prefix[1] || ''
  const encodedMarkers = prefix[2] || ''
  const markerCount = Array.from(encodedMarkers.matchAll(ENCODED_BLOCKQUOTE_MARKERS)).length
  if (markerCount === 0) return source

  const remainder = source.slice(prefix[0].length).trimStart()
  return `${indent}${'>'.repeat(markerCount)}${remainder ? ` ${remainder}` : ''}`
}
