import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import type { TextEntity } from './types'
import { inferEntityLabel, isVerbLike, normalizeEntityKey, normalizeWhitespace, segmentWordsWithOffsets } from './utils'

export const extractMentionsRobust = (text: string): TextEntity[] => {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const out: TextEntity[] = []
  const seen = new Set<string>()

  const push = (label: string, start: number, end: number) => {
    const key = normalizeEntityKey(label)
    if (!key) return
    if (seen.has(`${key}@${start}`)) return
    if (KEYWORD_FUNCTION_WORDS.has(key)) return
    if (key.length < 3 && /^[a-z]+$/.test(key)) return
    if (/^\d+$/.test(key)) return

    out.push({ text: label.trim(), label: inferEntityLabel(label), start, end })
    seen.add(`${key}@${start}`)
  }

  const codeRe = /`([^`\n]+)`/g
  for (const m of raw.matchAll(codeRe)) {
    const v = String(m[1] || '').trim()
    if (!v) continue
    const idx = m.index ?? -1
    if (idx < 0) continue
    push(v, idx, idx + m[0].length)
  }

  const capPhrase = /\b(?:[A-Z][a-z0-9]+)(?:\s+[A-Z][a-z0-9]+){0,5}\b/g
  for (const m of raw.matchAll(capPhrase)) {
    const v = String(m[0] || '').trim()
    const idx = m.index ?? -1
    if (!v || idx < 0) continue
    push(v, idx, idx + v.length)
  }

  const identifier = /\b[a-zA-Z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*\b/g
  for (const m of raw.matchAll(identifier)) {
    const v = String(m[0] || '').trim()
    const idx = m.index ?? -1
    if (!v || idx < 0) continue
    push(v, idx, idx + v.length)
  }

  const snakeOrKebab = /\b[a-zA-Z][a-zA-Z0-9_]*_[a-zA-Z0-9_]+\b/g
  for (const m of raw.matchAll(snakeOrKebab)) {
    const v = String(m[0] || '').trim()
    const idx = m.index ?? -1
    if (!v || idx < 0) continue
    push(v, idx, idx + v.length)
  }

  for (const word of segmentWordsWithOffsets(raw)) {
    const key = normalizeEntityKey(word.raw)
    if (isVerbLike(key)) continue
    push(word.raw, word.start, word.end)
  }

  return out
}

export const listEntitiesInSentence = (sentence: string, entities: TextEntity[]): TextEntity[] => {
  const lower = normalizeWhitespace(sentence).toLowerCase()
  const matches = entities
    .filter(e => {
      const t = String(e.text || '').toLowerCase()
      return t && lower.includes(t)
    })
    .slice()
    .sort((a, b) => a.start - b.start)
  const uniq: TextEntity[] = []
  const seen = new Set<string>()
  for (const e of matches) {
    const k = e.text.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(e)
  }
  return uniq
}

export const findFirstEntityMention = (sentence: string, entities: TextEntity[]): TextEntity | null => {
  const list = listEntitiesInSentence(sentence, entities)
  return list[0] || null
}

// Both names are established public entry points to the same extraction contract.
export { extractMentionsRobust as extractEntitiesHeuristic }
