export const isVerbLike = (token: string): boolean => {
  const t = String(token || '').toLowerCase()
  if (!t) return false
  if (t === 'is' || t === 'are' || t === 'was' || t === 'were' || t === 'be') return true
  if (t === 'has' || t === 'have' || t === 'had') return true
  if (t === 'uses' || t === 'use' || t === 'using') return true
  if (t === 'make' || t === 'makes' || t === 'made') return true
  if (t === 'build' || t === 'builds' || t === 'built') return true
  if (t.endsWith('ed') || t.endsWith('ing')) return true
  return false
}

export const normalizeWhitespace = (value: string): string => String(value || '').replace(/\s+/g, ' ').trim()

export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const normalizeNounPhrase = (s: string): string => {
  const raw = normalizeWhitespace(s)
  if (!raw) return ''
  const cleaned = raw.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{M}\p{N}]+$/u, '').trim()
  return cleaned
}

export const splitSentences = (text: string): string[] =>
  splitSentencesWithOffsets(text).map(range => text.slice(range.start, range.end).trim())

type NativeSegment = { segment: string; index: number; isWordLike?: boolean }
type Segmenter = { segment: (text: string) => Iterable<NativeSegment>; resolvedOptions: () => { locale: string } }
const createSegmenter = (granularity: 'word' | 'sentence', locale = 'und'): Segmenter | null => {
  const Constructor = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: string }) => Segmenter }).Segmenter
  return Constructor ? new Constructor(locale, { granularity }) : null
}
export const textSegmentationPolicy = (locale = 'und'): string => {
  const segmenter = createSegmenter('word', locale)
  return segmenter ? `native-v1:${segmenter.resolvedOptions().locale}` : 'unicode-fallback-v1'
}
export const segmentWordsWithOffsets = (text: string, locale = 'und'): Array<{ raw: string; start: number; end: number }> => {
  const segmenter = createSegmenter('word', locale)
  const segments = segmenter ? segmenter.segment(text) : Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['_’-][\p{L}\p{M}\p{N}]+)*/gu), match => ({ segment: match[0], index: match.index!, isWordLike: true }))
  const words: Array<{ raw: string; start: number; end: number }> = []
  for (const part of segments) {
    if (part.isWordLike) words.push({ raw: part.segment, start: part.index, end: part.index + part.segment.length })
    if (words.length >= 12_000) break
  }
  return words
}

export const splitSentencesWithOffsets = (text: string, locale = 'und'): Array<{ start: number; end: number }> => {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const ranges: Array<{ start: number; end: number }> = []
  const segmenter = createSegmenter('sentence', locale)
  if (segmenter) return Array.from(segmenter.segment(raw), part => ({ start: part.index, end: part.index + part.segment.length })).filter(range => raw.slice(range.start, range.end).trim())
  const re = /[^.!?。！？\r\n]+(?:[.!?。！？]+|[\r\n]+|$)/gu
  for (const m of raw.matchAll(re)) {
    const s = m.index ?? -1
    if (s < 0) continue
    const e = s + m[0].length
    const chunk = raw.slice(s, e)
    if (!chunk.trim()) continue
    ranges.push({ start: s, end: e })
  }
  return ranges
}

export const inferEntityLabel = (phrase: string): 'PERSON' | 'ORG' | 'GPE' | 'LOC' | 'FAC' | 'PRODUCT' | 'DATE' | 'QUANTITY' | 'ENTITY' => {
  const t = normalizeWhitespace(phrase)
  if (!t) return 'ENTITY'
  if (/^\d{4}(?:-\d{2}-\d{2})?$/.test(t)) return 'DATE'
  if (/^(?:\d+(?:\.\d+)?)(?:\s*(?:%|percent|kg|km|m|cm|mm|billion|million|thousand))\b/i.test(t)) return 'QUANTITY'
  if (/\b(inc|corp|ltd|llc|company|university|institute|agency)\b/i.test(t)) return 'ORG'
  if (/\b(city|country|state|province|region)\b/i.test(t)) return 'GPE'
  if (/\b(street|avenue|road|airport|station|bridge|tower)\b/i.test(t)) return 'FAC'
  if (/\b(product|model|device|tool|framework|library|api)\b/i.test(t)) return 'PRODUCT'
  return 'ENTITY'
}

export const normalizeEntityKey = (raw: string): string => {
  const t = normalizeWhitespace(raw)
  if (!t) return ''
  return t
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
}

export const splitCommaAndAndList = (value: string): string[] => {
  const cleaned = normalizeWhitespace(value)
  if (!cleaned) return []
  const parts = cleaned
    .split(/\s*,\s*|\s+(?:and|or)\s+/i)
    .map(x => normalizeNounPhrase(x))
    .filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const k = p.toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}
