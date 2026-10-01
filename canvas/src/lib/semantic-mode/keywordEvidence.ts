import { normalizeEntityKey, segmentWordsWithOffsets, splitSentencesWithOffsets, textSegmentationPolicy } from '@/lib/graph/textAnalysis/utils'

export const KEYWORD_TEXT_LIMIT = 60_000
export function boundedKeywordText(input: string): string {
  const text = input.slice(0, KEYWORD_TEXT_LIMIT)
  return input.length > text.length && /[\p{L}\p{M}\p{N}]/u.test(input[text.length]!)
    ? text.replace(/[\p{L}\p{M}\p{N}'_’-]+$/u, '') : text
}
export type KeywordContext = { start: number; end: number; line: number; text: string; match: string }
export type KeywordEvidence = { frequency: number; spread: number; distribution: number[]; contexts: KeywordContext[] }

/** Plain-text input; offsets use UTF-16 code units of the supplied text. */
export function collectKeywordEvidence(input: string, labels: Iterable<string>, locale = 'und') {
  const text = boundedKeywordText(input)
  const words = segmentWordsWithOffsets(text, locale)
  const sentences = splitSentencesWithOffsets(text, locale)
  const byKey = new Map<string, KeywordEvidence>()
  const sequences = new Map<string, string>()
  let longest = 1
  for (const label of labels) {
    if (byKey.size >= 800) break
    const key = normalizeEntityKey(label)
    const parts = segmentWordsWithOffsets(label, locale).map(word => normalizeEntityKey(word.raw))
    if (!key || !parts.length || parts.length > 12) continue
    sequences.set(parts.join('\u0000'), key)
    longest = Math.max(longest, parts.length)
    byKey.set(key, { frequency: 0, spread: 0, distribution: [0, 0, 0, 0, 0, 0], contexts: [] })
  }
  const lastSentence = new Map<string, number>()
  let sentenceIndex = 0, line = 1, lineOffset = 0
  for (let index = 0; index < words.length; index++) {
    const first = words[index]!
    while (sentenceIndex + 1 < sentences.length && first.start >= sentences[sentenceIndex]!.end) sentenceIndex++
    const sentence = sentences[sentenceIndex] ?? { start: 0, end: text.length }
    for (; lineOffset < first.start; lineOffset++) {
      if (text[lineOffset] === '\n' || (text[lineOffset] === '\r' && text[lineOffset + 1] !== '\n')) line++
    }
    let sequence = ''
    for (let length = 1; length <= longest && index + length <= words.length; length++) {
      const word = words[index + length - 1]!
      if (word.end > sentence.end) break
      if (length > 1 && !/^[ \t]*$/.test(text.slice(words[index + length - 2]!.end, word.start))) break
      sequence += `${length > 1 ? '\u0000' : ''}${normalizeEntityKey(word.raw)}`
      const key = sequences.get(sequence)
      if (!key) continue
      const evidence = byKey.get(key)!
      evidence.frequency++
      if (lastSentence.get(key) !== sentenceIndex) { evidence.spread++; lastSentence.set(key, sentenceIndex) }
      evidence.distribution[Math.min(5, Math.floor(first.start / Math.max(1, text.length) * 6))]!++
      if (evidence.contexts.length < 3) {
        const start = Math.max(sentence.start, first.start - 72)
        const end = Math.min(sentence.end, Math.max(word.end, start + 240))
        evidence.contexts.push({ start: first.start, end: word.end, line, text: text.slice(start, end), match: text.slice(first.start, word.end) })
      }
    }
  }
  const tokenLimited = words.length >= 12_000 && (words.at(-1)?.end ?? 0) < text.length
  return { byKey, truncated: input.length > text.length || tokenLimited, scannedCharacters: tokenLimited ? words.at(-1)!.end : text.length, policy: textSegmentationPolicy(locale) }
}

/** Bounded display context for an existing source-line match; no file/path interpretation. */
export function sourceLineContexts(text: string): string[] {
  return text.slice(0, 2_000_000).split(/\r\n|\n|\r/, 8000).map(line => line.slice(0, 240))
}
