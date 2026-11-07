import { tokenizeForStats } from '@/lib/graph/statsUtils'
import { KEYWORD_FUNCTION_WORDS } from '@/features/semantic-mode/keywordStopwords'
import type { TextEntity, TextTriple } from './types'
import { listEntitiesInSentence } from './entities'
import { escapeRe, inferEntityLabel, isVerbLike, normalizeEntityKey, normalizeNounPhrase, normalizeWhitespace, splitCommaAndAndList, splitSentencesWithOffsets } from './utils'

const extractRichProperties = (text: string): Record<string, unknown> => {
  const props: Record<string, unknown> = {}
  const raw = String(text || '')
  if (!raw.trim()) return props

  const modal = raw.match(/\b(must|should|may|might|could)\b/i)
  if (modal) {
    const token = String(modal[1] || '').toLowerCase()
    props.modality = token
    const strength =
      token === 'must'
        ? 0.95
        : token === 'should'
          ? 0.75
          : token === 'may' || token === 'might'
            ? 0.45
            : token === 'could'
              ? 0.55
              : 0.5
    props.modalityStrength = strength
    props.certainty = strength
  }

  if (/\b(not|never|no)\b/i.test(raw)) props.negation = true
  const causalSignal = (() => {
    const patterns: Array<{ re: RegExp; signal: string; strength: number }> = [
      { re: /\b(because)\b/i, signal: 'because', strength: 0.9 },
      { re: /\b(due to)\b/i, signal: 'due-to', strength: 0.85 },
      { re: /\b(therefore)\b/i, signal: 'therefore', strength: 0.8 },
      { re: /\b(results in)\b/i, signal: 'results-in', strength: 0.95 },
      { re: /\b(leads to)\b/i, signal: 'leads-to', strength: 0.95 },
      { re: /\b(causes)\b/i, signal: 'causes', strength: 0.95 },
    ]
    for (let i = 0; i < patterns.length; i += 1) {
      const p = patterns[i]!
      if (p.re.test(raw)) return { signal: p.signal, strength: p.strength }
    }
    return null
  })()
  if (causalSignal) {
    props.causalitySignal = causalSignal.signal
    props.causalityStrength = causalSignal.strength
  }

  return props
}

export const extractCooccurrencePairs = (text: string, entities: TextEntity[]): TextTriple[] => {
  const triples: TextTriple[] = []
  const sentenceRanges = splitSentencesWithOffsets(text)
  const mentionsBySentence: TextEntity[][] = []

  if (sentenceRanges.length > 0 && entities.length > 0) {
    let mIdx = 0
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start)
    for (let sIdx = 0; sIdx < sentenceRanges.length; sIdx += 1) {
      const r = sentenceRanges[sIdx]!
      const bucket: TextEntity[] = []
      while (mIdx < sortedEntities.length) {
        const m = sortedEntities[mIdx]!
        const mid = (m.start + m.end) / 2
        if (mid < r.start) {
          mIdx += 1
          continue
        }
        if (mid > r.end) break
        bucket.push(m)
        mIdx += 1
      }
      mentionsBySentence.push(bucket)
    }
  }

  for (let sIdx = 0; sIdx < mentionsBySentence.length; sIdx += 1) {
    const list = mentionsBySentence[sIdx] || []
    if (list.length < 2) continue

    const uniqueMap = new Map<string, TextEntity>()
    for (const e of list) {
      const key = normalizeEntityKey(e.text)
      if (!key) continue
      if (!uniqueMap.has(key)) uniqueMap.set(key, e)
    }
    const uniqueEntities = Array.from(uniqueMap.values())
    if (uniqueEntities.length < 2) continue

    const sentence = text.slice(sentenceRanges[sIdx]!.start, sentenceRanges[sIdx]!.end)
    const base = sentenceRanges[sIdx]!.start

    for (let i = 0; i < uniqueEntities.length; i += 1) {
      for (let j = i + 1; j < uniqueEntities.length; j += 1) {
        const a = uniqueEntities[i]!
        const b = uniqueEntities[j]!

        const left = Math.min(a.end, b.end) - base
        const right = Math.max(a.start, b.start) - base
        const between = left < right ? sentence.slice(left, right) : ''

        const tokens = between.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []
        const cleaned = tokens.map(t => t.toLowerCase()).filter(t => !KEYWORD_FUNCTION_WORDS.has(t))

        const verb = cleaned.find(t => isVerbLike(t)) || (cleaned.length > 0 ? cleaned[0] : 'relates_to')

        triples.push({
          subject: a.text,
          predicate: verb || 'relates_to',
          object: b.text,
          confidence: 0.4,
          properties: extractRichProperties(between),
        })
      }
    }
  }
  return triples
}

export const extractTriplesHeuristic = (text: string, entities: TextEntity[]): TextTriple[] => {
  const sentenceRanges = splitSentencesWithOffsets(text)
  const triples: TextTriple[] = []
  const seen = new Set<string>()
  const isDateLike = (value: string): boolean => /^\d{4}(?:-\d{2}-\d{2})?$/.test(String(value || '').trim())
  const normalizeLocation = (value: string): string => {
    const t = normalizeNounPhrase(value)
    if (!t) return ''
    const head = t.split(/\b(?:and|which|that|who|where)\b/i)[0] || ''
    return normalizeWhitespace(head)
  }

  const push = (
    s: string,
    p: string,
    o: string,
    confidence: number,
    evidence: { context?: string; sentenceIndex: number; sentenceStart: number; sentenceEnd: number; evidenceText: string },
  ) => {
    const subject = normalizeWhitespace(s)
    const predicate = normalizeWhitespace(p).replace(/\s+/g, '-').toLowerCase()
    const object = normalizeWhitespace(o)
    if (!subject || !predicate || !object) return
    const key = `${subject.toLowerCase()}|${predicate}|${object.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    const properties = extractRichProperties(evidence.context || '')
    triples.push({
      subject,
      predicate,
      object,
      confidence,
      properties: {
        ...(properties || {}),
        evidenceText: evidence.evidenceText,
        sentenceIndex: evidence.sentenceIndex,
        sentenceStart: evidence.sentenceStart,
        sentenceEnd: evidence.sentenceEnd,
      },
    })
  }

  const stableSubject = (() => {
    const ordered = [...entities].sort((a, b) => a.start - b.start)
    const preferredLabels = new Set<string>(['PERSON', 'ORG', 'PRODUCT', 'GPE', 'LOC', 'FAC', 'ENTITY'])
    const preferred = ordered.find(e => preferredLabels.has(String(e.label || '')) && e.label !== 'DATE' && e.label !== 'QUANTITY')
    return preferred?.text || ordered.find(e => e.label !== 'DATE' && e.label !== 'QUANTITY')?.text || ordered[0]?.text || ''
  })()

  let lastSubject = stableSubject

  for (let sentIndex = 0; sentIndex < sentenceRanges.length; sentIndex += 1) {
    const range = sentenceRanges[sentIndex]!
    const sent = text.slice(range.start, range.end)
    const evidenceBase = {
      sentenceIndex: sentIndex,
      sentenceStart: range.start,
      sentenceEnd: range.end,
      evidenceText: normalizeWhitespace(sent),
    }
    const ents = listEntitiesInSentence(sent, entities)
    const lower = sent.trim().toLowerCase()
    const startsWithPronoun = /^(it|this|that|they|he|she|these|those)\b/.test(lower)
    const firstNonQuantity =
      ents.find(e => e.label !== 'QUANTITY' && e.label !== 'DATE')?.text ||
      ents[0]?.text ||
      ''
    const subj = startsWithPronoun ? (lastSubject || stableSubject) : (firstNonQuantity || lastSubject)
    if (!subj) continue
    if (!startsWithPronoun && firstNonQuantity) lastSubject = firstNonQuantity

    const subjInSentence = sent.toLowerCase().includes(subj.toLowerCase())
    const localSubjectMatch = sent.match(/^([A-Z][a-z]+(?:\s+[a-z]+){1,4})\s+(?:is|are|can|must|should|may|will|has|have)\b/)
    const localSubject = normalizeWhitespace(localSubjectMatch?.[1] || '')
    const subjForSentence = startsWithPronoun ? subj : localSubject || subj
    const subjRe = escapeRe(subjForSentence)
    const before = triples.length

    const applyVerbObject = (verb: string, object: string, confidence: number, context: string = '') => {
      const v = normalizeWhitespace(verb)
      const o = normalizeNounPhrase(object)
      if (!v || !o) return
      push(subjForSentence, v, o, confidence, { ...evidenceBase, context })
    }

    const applyVerbObjectFromSentence = (pattern: RegExp, predicate: string, confidence: number) => {
      const m = sent.match(pattern)
      if (!m || !m[1]) return
      applyVerbObject(predicate, m[1], confidence, m[0])
    }

    const mIsCalled = sent.match(/(.+?)\s+is\s+called\s+([^,.]+)[,.]?/i)
    if (mIsCalled && mIsCalled[1] && mIsCalled[2]) {
      push(normalizeNounPhrase(mIsCalled[1]), 'is-called', normalizeNounPhrase(mIsCalled[2]), 0.75, { ...evidenceBase, context: mIsCalled[0] })
    }

    const mYield = sent.match(/\byield(?:s)?\b\s+([^,.]+)[,.]?/i)
    if (mYield && mYield[1] && subjForSentence) {
      applyVerbObject('yields', mYield[1], 0.6, mYield[0])
    }

    const mEasyTo = sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,80}\\bis\\s+easy\\s+to\\s+([^,.]+)`, 'i'))
    if (mEasyTo && mEasyTo[1] && subjForSentence) {
      applyVerbObject('is-easy-to', mEasyTo[1], 0.6, mEasyTo[0])
    }

    const leadingIsAIn = sent.match(/^([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,5})\s+is\s+(?:a|an|the)\s+([^,.]+?)\s+in\s+([^,.]+)[,.]?/i)
    if (leadingIsAIn && leadingIsAIn[1] && leadingIsAIn[2] && leadingIsAIn[3]) {
      push(leadingIsAIn[1], 'is-a', normalizeNounPhrase(leadingIsAIn[2]), 0.92, { ...evidenceBase, context: leadingIsAIn[0] })
      const loc = normalizeLocation(leadingIsAIn[3])
      if (loc && !isDateLike(loc)) push(leadingIsAIn[1], 'located-in', loc, 0.92, { ...evidenceBase, context: leadingIsAIn[0] })
    } else {
      const leadingIsA = sent.match(/^([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,5})\s+is\s+(?:a|an|the)\s+([^,.]+)[,.]?/i)
      if (leadingIsA && leadingIsA[1] && leadingIsA[2]) {
        push(leadingIsA[1], 'is-a', normalizeNounPhrase(leadingIsA[2]), 0.9, { ...evidenceBase, context: leadingIsA[0] })
      }
    }

    if (subjInSentence || (subjForSentence && sent.toLowerCase().includes(subjForSentence.toLowerCase()))) {
      const mIsAIn = sent.match(new RegExp(`\\b${subjRe}\\b\\s+is\\s+(?:a|an|the)\\s+([^,.]+?)\\s+in\\s+([^,.]+)`, 'i'))
      if (mIsAIn && mIsAIn[1] && mIsAIn[2]) {
        push(subjForSentence, 'is-a', normalizeNounPhrase(mIsAIn[1]), 0.9, { ...evidenceBase, context: mIsAIn[0] })
        push(subjForSentence, 'located-in', normalizeNounPhrase(mIsAIn[2]), 0.9, { ...evidenceBase, context: mIsAIn[0] })
      } else {
        const mIsA = sent.match(new RegExp(`\\b${subjRe}\\b\\s+is\\s+(?:a|an|the)\\s+([^,.]+)`, 'i'))
        if (mIsA && mIsA[1]) push(subjForSentence, 'is-a', normalizeNounPhrase(mIsA[1]), 0.85, { ...evidenceBase, context: mIsA[0] })
        const mIn = sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,80}\\s+in\\s+([^,.]+)`, 'i'))
        if (mIn && mIn[1]) {
          const loc = normalizeLocation(mIn[1])
          if (loc && !isDateLike(loc)) push(subjForSentence, 'located-in', loc, 0.8, { ...evidenceBase, context: mIn[0] })
        }
      }

      const mLocated = sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,120}\\blocated\\s+in\\s+([^,.]+)`, 'i'))
      if (mLocated && mLocated[1]) {
        const loc = normalizeLocation(mLocated[1])
        if (loc && !isDateLike(loc)) push(subjForSentence, 'located-in', loc, 0.85, { ...evidenceBase, context: mLocated[0] })
      }

      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,80}\\bemploys\\b\\s+(?:a|an|the)?\\s*([^,.]+)`, 'i'), 'employs', 0.75)
      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,120}\\bretrieves\\b\\s+([^,.]+?)(?:\\s+from\\s+[^,.]+)?[,.]`, 'i'), 'retrieves', 0.7)
      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,120}\\buses\\b\\s+([^,.]+?)(?:\\s+to\\s+(?:generate|produce)\\s+[^,.]+)?[,.]`, 'i'), 'uses', 0.7)
      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,200}\\bgenerate(?:s)?\\b\\s+([^,.]+)`, 'i'), 'generates', 0.65)
      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,200}\\bdepends\\s+on\\s+(?:the\\s+)?([^,.]+)`, 'i'), 'depends-on', 0.7)
      applyVerbObjectFromSentence(new RegExp(`\\b${subjRe}\\b[^.]{0,240}\\breduces\\b\\s+([^,.]+)`, 'i'), 'reduces', 0.7)
    }

    if (startsWithPronoun) {
      const mPronIsA = sent.match(/^\s*(?:it|this|that|they|he|she|these|those)\s+is\s+(?:a|an|the)\s+([^,.]+)[,.]?/i)
      if (mPronIsA && mPronIsA[1]) {
        push(subjForSentence, 'is-a', normalizeNounPhrase(mPronIsA[1]), 0.82, { ...evidenceBase, context: mPronIsA[0] })
      }
      const mPronLocated = sent.match(/^\s*(?:it|this|that|they|he|she|these|those)\b[^.]{0,160}\blocated\s+in\s+([^,.]+)[,.]?/i)
      if (mPronLocated && mPronLocated[1]) {
        const loc = normalizeLocation(mPronLocated[1])
        if (loc && !isDateLike(loc)) push(subjForSentence, 'located-in', loc, 0.82, { ...evidenceBase, context: mPronLocated[0] })
      }
      const shouldSkipPronounVerbs = /\bpopulation\s+of\b/i.test(sent) || /\bknown\s+for\b/i.test(sent)
      if (!shouldSkipPronounVerbs) {
        applyVerbObjectFromSentence(/\bemploys\b\s+(?:a|an|the)?\s*([^,.]+)[,.]/i, 'employs', 0.65)
        applyVerbObjectFromSentence(/\bretrieves\b\s+([^,.]+?)(?:\s+from\s+[^,.]+)?[,.]/i, 'retrieves', 0.65)
        applyVerbObjectFromSentence(/\buses\b\s+([^,.]+?)(?:\s+to\s+(?:generate|produce)\s+[^,.]+)?[,.]/i, 'uses', 0.65)
        applyVerbObjectFromSentence(/\bgenerate(?:s)?\b\s+([^,.]+)[,.]/i, 'generates', 0.6)
        applyVerbObjectFromSentence(/\bdepends\s+on\s+(?:the\s+)?([^,.]+)[,.]/i, 'depends-on', 0.6)
        applyVerbObjectFromSentence(/\breduces\b\s+([^,.]+)[,.]/i, 'reduces', 0.6)
      }
    }

    if (/\boutperform\b/i.test(sent)) {
      const mOut = sent.match(/\boutperform\b\s+([^,.]+?)[,.]/i)
      if (mOut && mOut[1]) applyVerbObject('outperforms', mOut[1], 0.6, mOut[0])
    }

    const quantityUnit = '(?:million|billion|thousand|%|percent|km|kg|m|cm|mm)(?:\\s+people)?'
    const mPopulation = subjInSentence
      ? sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,240}\\bpopulation\\s+of\\s+(?:about\\s+)?(\\d+(?:\\.\\d+)?\\s*${quantityUnit})`, 'i'))
      : sent.match(new RegExp(`\\bpopulation\\s+of\\s+(?:about\\s+)?(\\d+(?:\\.\\d+)?\\s*${quantityUnit})`, 'i'))
    if (mPopulation && mPopulation[1]) push(subjForSentence, 'has-population', normalizeNounPhrase(mPopulation[1]), 0.85, { ...evidenceBase, context: mPopulation[0] })

    const mKnown = subjInSentence
      ? sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,200}\\bknown\\s+for\\s+([^.]*)`, 'i'))
      : sent.match(/\bknown\s+for\s+([^.]*)/i)
    if (mKnown && mKnown[1]) {
      const list = splitCommaAndAndList(mKnown[1])
      list.forEach(item => {
        if (/\bproject\b|\bprojects\b/i.test(item)) push(subjForSentence, 'has', item, 0.75, { ...evidenceBase, context: mKnown[0] })
        else push(subjForSentence, 'known-for', item, 0.75, { ...evidenceBase, context: mKnown[0] })
      })
    }

    const shouldSkipHas = /\bpopulation\s+of\b/i.test(sent) && !subjInSentence
    const mHas = shouldSkipHas
      ? null
      : subjInSentence
        ? sent.match(new RegExp(`\\b${subjRe}\\b[^.]{0,160}\\bhas\\s+([^.]*)`, 'i'))
        : sent.match(/\bhas\s+([^.]*)/i)
    if (mHas && mHas[1]) {
      const rhs = normalizeWhitespace(mHas[1]).replace(/\b(?:a|an|the)\b/gi, ' ').trim()
      const list = splitCommaAndAndList(rhs)
      list.forEach(item => push(subjForSentence, 'has', item, 0.7, { ...evidenceBase, context: mHas[0] }))
    }

    if (triples.length === before && ents.length >= 2 && (subjInSentence || (subjForSentence && sent.toLowerCase().includes(subjForSentence.toLowerCase())))) {
      const obj = ents[1]!.text
      const between = (() => {
        const lowerSent = sent.toLowerCase()
        const a = lowerSent.indexOf(subjForSentence.toLowerCase())
        const b = lowerSent.indexOf(obj.toLowerCase())
        if (a < 0 || b < 0) return ''
        const start = Math.min(a + subjForSentence.length, b + obj.length)
        const end = Math.max(a, b)
        if (start >= end) return ''
        return sent.slice(start, end)
      })()
      const verbTokens = tokenizeForStats(between, 2, new Set())
      const verb = verbTokens.find(t => t.length >= 2) || 'relates_to'
      push(subjForSentence, verb, obj, 0.55, { ...evidenceBase, context: between })
    }
  }

  return triples
}

