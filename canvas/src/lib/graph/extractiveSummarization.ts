import { tokenizeForStats } from '@/lib/graph/statsUtils'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import { normalizeWhitespace, splitSentencesWithOffsets, type TextEntity } from '@/lib/graph/textAnalysis'

export type ParagraphRange = { index: number; start: number; end: number; text: string }

export type SentenceRange = {
  index: number
  paragraphIndex: number
  start: number
  end: number
  text: string
  tokenCount: number
  entityMentions: number
  score: number
}

export type ExtractiveSummaryResult = {
  summaryText: string
  selectedSentenceIndices: number[]
  sentences: SentenceRange[]
  paragraphs: ParagraphRange[]
  metrics: {
    paragraphCount: number
    sentenceCount: number
    selectedCount: number
    summaryChars: number
    maxSentences: number
    maxSummaryChars: number
  }
}

export type ExtractiveSummaryOptions = {
  maxSentences?: number
  maxSummaryChars?: number
  maxSentenceChars?: number
  maxParagraphs?: number
  maxSentencesScored?: number
}

export const splitParagraphsWithOffsets = (text: string, maxParagraphs: number): ParagraphRange[] => {
  const raw = String(text || '')
  const out: ParagraphRange[] = []
  if (!raw.trim()) return out

  const maxP = Math.max(1, Math.min(1000, Math.floor(maxParagraphs)))
  const re = /\n\s*\n+/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null
  let pIdx = 0
  while ((match = re.exec(raw)) !== null && out.length < maxP) {
    const end = match.index
    const slice = raw.slice(lastIndex, end)
    const trimmed = normalizeWhitespace(slice)
    if (trimmed) {
      out.push({ index: pIdx, start: lastIndex, end, text: slice.trim() })
      pIdx += 1
    }
    lastIndex = match.index + match[0].length
  }
  if (out.length < maxP && lastIndex < raw.length) {
    const slice = raw.slice(lastIndex)
    const trimmed = normalizeWhitespace(slice)
    if (trimmed) {
      out.push({ index: pIdx, start: lastIndex, end: raw.length, text: slice.trim() })
    }
  }
  return out
}

const countEntitiesInRange = (entities: TextEntity[], start: number, end: number): number => {
  if (!entities.length) return 0
  let count = 0
  for (let i = 0; i < entities.length; i += 1) {
    const e = entities[i]!
    const mid = (e.start + e.end) / 2
    if (mid < start) continue
    if (mid > end) break
    count += 1
  }
  return count
}

export function buildExtractiveSummary(args: {
  text: string
  entities: TextEntity[]
  options?: ExtractiveSummaryOptions
}): ExtractiveSummaryResult {
  const raw = String(args.text || '')
  const maxSentences = Math.max(1, Math.min(10, Math.floor(args.options?.maxSentences ?? 4)))
  const maxSummaryChars = Math.max(120, Math.min(4000, Math.floor(args.options?.maxSummaryChars ?? 900)))
  const maxSentenceChars = Math.max(60, Math.min(1000, Math.floor(args.options?.maxSentenceChars ?? 280)))
  const maxParagraphs = Math.max(1, Math.min(1000, Math.floor(args.options?.maxParagraphs ?? 200)))
  const maxSentencesScored = Math.max(10, Math.min(400, Math.floor(args.options?.maxSentencesScored ?? 160)))

  const paragraphs = splitParagraphsWithOffsets(raw, maxParagraphs)
  const sortedEntities = [...(args.entities || [])].sort((a, b) => a.start - b.start)

  const sentences: SentenceRange[] = []
  let sentenceIndex = 0
  for (let p = 0; p < paragraphs.length && sentences.length < maxSentencesScored; p += 1) {
    const para = paragraphs[p]!
    const local = splitSentencesWithOffsets(para.text)
    for (let s = 0; s < local.length && sentences.length < maxSentencesScored; s += 1) {
      const r = local[s]!
      const text = normalizeWhitespace(para.text.slice(r.start, r.end))
      if (!text) continue
      const clipped = text.length > maxSentenceChars ? `${text.slice(0, maxSentenceChars).trim()}…` : text
      const absStart = para.start + r.start
      const absEnd = para.start + r.end
      const entityMentions = countEntitiesInRange(sortedEntities, absStart, absEnd)
      const toks = tokenizeForStats(clipped, 3, KEYWORD_FUNCTION_WORDS)
      sentences.push({
        index: sentenceIndex,
        paragraphIndex: para.index,
        start: absStart,
        end: absEnd,
        text: clipped,
        tokenCount: toks.length,
        entityMentions,
        score: 0,
      })
      sentenceIndex += 1
    }
  }

  const tokenCounts = new Map<string, number>()
  for (let i = 0; i < sentences.length; i += 1) {
    const toks = tokenizeForStats(sentences[i]!.text, 3, KEYWORD_FUNCTION_WORDS)
    for (let k = 0; k < toks.length; k += 1) {
      const tok = toks[k]!
      tokenCounts.set(tok, (tokenCounts.get(tok) || 0) + 1)
    }
  }

  const tokenWeight = (token: string): number => {
    const c = tokenCounts.get(token) || 0
    if (c <= 0) return 0
    return Math.log(1 + c)
  }

  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i]!
    const toks = tokenizeForStats(s.text, 3, KEYWORD_FUNCTION_WORDS)
    let sum = 0
    for (let k = 0; k < toks.length; k += 1) sum += tokenWeight(toks[k]!)
    const lengthPenalty = Math.sqrt(Math.max(1, toks.length))
    const entityBoost = Math.min(3, s.entityMentions) * 0.35
    const causalBoost = /\b(because|due to|therefore|results in|leads to|causes)\b/i.test(s.text) ? 0.35 : 0
    s.score = sum / lengthPenalty + entityBoost + causalBoost
  }

  const byScore = [...sentences].sort((a, b) => (b.score - a.score) || (a.index - b.index))
  const selected = new Set<number>()
  for (let i = 0; i < byScore.length && selected.size < maxSentences; i += 1) {
    const s = byScore[i]!
    if (!s.text.trim()) continue
    selected.add(s.index)
  }

  const selectedIndices = Array.from(selected.values()).sort((a, b) => a - b)
  let summary = ''
  const chosenText: string[] = []
  for (let i = 0; i < selectedIndices.length; i += 1) {
    const idx = selectedIndices[i]!
    const s = sentences.find(x => x.index === idx)
    if (!s) continue
    const next = s.text.trim()
    if (!next) continue
    const candidate = chosenText.length ? `${summary} ${next}`.trim() : next
    if (candidate.length > maxSummaryChars) break
    chosenText.push(next)
    summary = candidate
  }

  return {
    summaryText: summary,
    selectedSentenceIndices: selectedIndices,
    sentences,
    paragraphs,
    metrics: {
      paragraphCount: paragraphs.length,
      sentenceCount: sentences.length,
      selectedCount: selectedIndices.length,
      summaryChars: summary.length,
      maxSentences,
      maxSummaryChars,
    },
  }
}

