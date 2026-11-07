import type { TextEntity } from '@/lib/graph/textAnalysis'
import { inferEntityLabel, isVerbLike, normalizeEntityKey, normalizeWhitespace, splitSentencesWithOffsets, segmentWordsWithOffsets } from '@/lib/graph/textAnalysis'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'

export type DocumentKeywordCandidate = {
  key: string
  label: string
  tokens: string[]
  frequency: number
  spread: number
  score: number
  rank: number
  phraseLength: number
  firstIndex: number
  occurrences: Array<{ start: number; end: number; label: string }>
}

type Token = {
  raw: string
  key: string
  start: number
  end: number
  sentence: number
}

type CandidateWork = {
  key: string
  label: string
  tokens: string[]
  frequency: number
  sentences: Set<number>
  firstIndex: number
  occurrences: Array<{ start: number; end: number; label: string }>
  score: number
}

const isUsefulToken = (key: string): boolean => {
  if (!key) return false
  if (KEYWORD_FUNCTION_WORDS.has(key)) return false
  if (key.length < 3 && /^[a-z]+$/.test(key)) return false
  if (/^\d+$/.test(key)) return false
  return true
}

const tokenizeForKeyphrases = (text: string, locale?: string): Token[] => {
  const ranges = splitSentencesWithOffsets(text, locale)
  let sentence = 0
  return segmentWordsWithOffsets(text, locale).map(word => {
    while (sentence + 1 < ranges.length && word.start >= ranges[sentence]!.end) sentence++
    return { ...word, key: normalizeEntityKey(word.raw), sentence }
  }).filter(word => !!word.key)
}

const scoreCandidate = (candidate: CandidateWork, tokenFrequency: Map<string, number>, docMagnitude: number): number => {
  const uniqueTokens = Array.from(new Set(candidate.tokens))
  const dot = uniqueTokens.reduce((sum, key) => sum + Math.sqrt(tokenFrequency.get(key) || 0), 0)
  const candidateMagnitude = Math.sqrt(Math.max(1, uniqueTokens.length))
  const documentSimilarity = docMagnitude > 0 ? dot / (docMagnitude * candidateMagnitude) : 0
  const frequencyScore = Math.log1p(candidate.frequency)
  const spreadScore = Math.log1p(candidate.sentences.size)
  const phraseQuality = candidate.tokens.length === 1 ? 0.56 : candidate.tokens.length === 2 ? 1 : 0.9
  const earlyBonus = candidate.firstIndex <= 400 ? 0.16 : candidate.firstIndex <= 2000 ? 0.08 : 0
  const verbPenalty = candidate.tokens.length === 1 && isVerbLike(candidate.tokens[0] || '') ? 0.35 : 0
  return Math.max(0, frequencyScore * 0.42 + documentSimilarity * 0.34 + spreadScore * 0.14 + phraseQuality * 0.1 + earlyBonus - verbPenalty)
}

const tokenOverlap = (a: DocumentKeywordCandidate, b: DocumentKeywordCandidate): number => {
  const aSet = new Set(a.tokens)
  const bSet = new Set(b.tokens)
  let intersect = 0
  aSet.forEach(token => {
    if (bSet.has(token)) intersect += 1
  })
  const union = aSet.size + bSet.size - intersect
  return union > 0 ? intersect / union : 0
}

export const extractDocumentKeywordCandidates = (
  text: string,
  opts?: { maxCandidates?: number; maxNgram?: number; locale?: string },
): DocumentKeywordCandidate[] => {
  const tokens = tokenizeForKeyphrases(text, opts?.locale)
  if (tokens.length === 0) return []
  const maxNgram = Math.max(1, Math.min(4, Math.floor(opts?.maxNgram ?? 3)))
  const maxCandidates = Math.max(12, Math.min(240, Math.floor(opts?.maxCandidates ?? 96)))
  const tokenFrequency = new Map<string, number>()
  for (let i = 0; i < tokens.length; i += 1) {
    const key = tokens[i]!.key
    if (!isUsefulToken(key)) continue
    tokenFrequency.set(key, (tokenFrequency.get(key) || 0) + 1)
  }
  const docMagnitude = Math.sqrt(Array.from(tokenFrequency.values()).reduce((sum, freq) => sum + freq, 0))
  const byKey = new Map<string, CandidateWork>()

  for (let i = 0; i < tokens.length; i += 1) {
    for (let n = 1; n <= maxNgram && i + n <= tokens.length; n += 1) {
      const slice = tokens.slice(i, i + n)
      if (slice.length !== n) continue
      if (slice.some(t => t.sentence !== slice[0]!.sentence)) break
      if (slice.some((t, index) => index > 0 && !/^[ \t]*$/.test(text.slice(slice[index - 1]!.end, t.start)))) break
      const keys = slice.map(t => t.key)
      if (!keys.every(isUsefulToken)) continue
      if (n === 1 && isVerbLike(keys[0] || '')) continue
      if (new Set(keys).size !== keys.length && n > 1) continue
      const key = keys.join(' ')
      if (!key || key.length > 96) continue
      const label = normalizeWhitespace(slice.map(t => t.raw).join(' '))
      const existing = byKey.get(key)
      const occurrence = { start: slice[0]!.start, end: slice[slice.length - 1]!.end, label }
      if (existing) {
        existing.frequency += 1
        existing.sentences.add(slice[0]!.sentence)
        if (occurrence.start < existing.firstIndex) {
          existing.firstIndex = occurrence.start
          existing.label = label
        }
        if (existing.occurrences.length < 24) existing.occurrences.push(occurrence)
        continue
      }
      byKey.set(key, {
        key,
        label,
        tokens: keys,
        frequency: 1,
        sentences: new Set([slice[0]!.sentence]),
        firstIndex: occurrence.start,
        occurrences: [occurrence],
        score: 0,
      })
    }
  }

  const scored = Array.from(byKey.values()).map(c => {
    c.score = scoreCandidate(c, tokenFrequency, docMagnitude)
    return c
  })
  scored.sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.key.localeCompare(b.key))

  const selected: DocumentKeywordCandidate[] = []
  const selectedKeys = new Set<string>()
  const addCandidate = (c: CandidateWork, opts: { minScore: number; overlapPenalty: number }): boolean => {
    if (selectedKeys.has(c.key)) return false
    const candidate: DocumentKeywordCandidate = {
      key: c.key,
      label: c.label,
      tokens: c.tokens,
      frequency: c.frequency,
      spread: c.sentences.size,
      score: c.score,
      rank: selected.length + 1,
      phraseLength: c.tokens.length,
      firstIndex: c.firstIndex,
      occurrences: c.occurrences,
    }
    let overlap = 0
    for (let j = 0; j < selected.length; j += 1) overlap = Math.max(overlap, tokenOverlap(candidate, selected[j]!))
    const diverseScore = c.score * (1 - overlap * opts.overlapPenalty)
    if (selected.length >= 24 && diverseScore < opts.minScore) return false
    selected.push({ ...candidate, score: diverseScore, rank: selected.length + 1 })
    selectedKeys.add(c.key)
    return true
  }
  const phraseQuota = Math.max(0, Math.min(36, Math.floor(maxCandidates * 0.32)))
  const baseLimit = Math.max(12, maxCandidates - phraseQuota)
  for (let i = 0; i < scored.length && selected.length < baseLimit; i += 1) {
    addCandidate(scored[i]!, { minScore: 0.3, overlapPenalty: 0.58 })
  }

  let phraseCount = selected.filter(c => c.phraseLength > 1).length
  for (let i = 0; i < scored.length && selected.length < maxCandidates && phraseCount < phraseQuota; i += 1) {
    const c = scored[i]!
    if (c.tokens.length <= 1) continue
    if (addCandidate(c, { minScore: 0.18, overlapPenalty: 0.42 })) phraseCount += 1
  }
  for (let i = 0; i < scored.length && selected.length < maxCandidates; i += 1) {
    addCandidate(scored[i]!, { minScore: 0.3, overlapPenalty: 0.58 })
  }

  selected.sort((a, b) => b.score - a.score || b.frequency - a.frequency || a.key.localeCompare(b.key))
  return selected.map((c, index) => ({ ...c, rank: index + 1 }))
}

export const buildKeywordCandidateMentions = (
  candidates: DocumentKeywordCandidate[],
  opts?: { maxCandidates?: number; maxOccurrencesPerCandidate?: number },
): TextEntity[] => {
  const maxCandidates = Math.max(0, Math.min(120, Math.floor(opts?.maxCandidates ?? 72)))
  const maxOccurrences = Math.max(1, Math.min(16, Math.floor(opts?.maxOccurrencesPerCandidate ?? 8)))
  const out: TextEntity[] = []
  for (let i = 0; i < candidates.length && i < maxCandidates; i += 1) {
    const c = candidates[i]!
    for (let j = 0; j < c.occurrences.length && j < maxOccurrences; j += 1) {
      const o = c.occurrences[j]!
      out.push({ text: o.label, label: inferEntityLabel(o.label), start: o.start, end: o.end })
    }
  }
  return out
}
