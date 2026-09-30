import React from 'react'
import { extractDocumentKeywordCandidates } from '@/lib/semantic-mode/keywordExtraction'
import { boundedKeywordText, collectKeywordEvidence } from '@/lib/semantic-mode/keywordEvidence'
import { normalizeEntityKey } from '@/lib/graph/textAnalysis/utils'
import { hashText } from '@/features/parsers/hash'
import { useGraphStore } from '@/hooks/useGraphStore'
import { jumpToDocumentInsight, type DocumentInsightsSource } from '@/features/markdown-workspace/documentInsightsRuntime'

/** Local text inspection. Source identity and navigation belong to the caller. */
export default function DocumentKeywordInsights({ source }: { source: DocumentInsightsSource }) {
  const [phrases, setPhrases] = React.useState('')
  const [locale, setLocale] = React.useState('und')
  const [selected, setSelected] = React.useState('')
  const [status, setStatus] = React.useState('')
  const selectedNodeId = useGraphStore(state => state.selectedNodeId)
  const selectedNodeIds = useGraphStore(state => state.selectedNodeIds)
  const deferredPhrases = React.useDeferredValue(phrases)
  const analysis = React.useMemo(() => {
    try {
      const candidates = extractDocumentKeywordCandidates(boundedKeywordText(source.text), { maxCandidates: 240, locale })
      const rules = deferredPhrases.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 24)
      const selectedIds = new Set([selectedNodeId, ...selectedNodeIds])
      const selectedCandidate = candidates.find(candidate => selectedIds.has(`kw:entity:${hashText(candidate.key)}`))
      const labels = rules.length ? rules : [...(selectedCandidate ? [selectedCandidate.label] : []), ...candidates.map(candidate => candidate.label)].slice(0, 24)
      const evidence = collectKeywordEvidence(source.text, labels, locale)
      return { evidence, candidates, labels: [...new Map(labels.map(label => [normalizeEntityKey(label), label])).entries()], custom: rules.length > 0, error: '' }
    } catch {
      return { error: 'Enter a valid language tag, or use und for the runtime default.' }
    }
  }, [source.text, deferredPhrases, locale, selectedNodeId, selectedNodeIds])
  React.useEffect(() => { setSelected(''); setStatus('') }, [source.key, source.text])
  React.useEffect(() => {
    const ids = new Set([selectedNodeId, ...selectedNodeIds])
    const match = analysis.labels?.find(([key]) => ids.has(`kw:entity:${hashText(key)}`))
    if (match) setSelected(match[0])
  }, [selectedNodeId, selectedNodeIds, analysis])
  const chosenKey = analysis.labels?.some(([key]) => key === selected) ? selected : analysis.labels?.[0]?.[0]
  const chosen = chosenKey ? analysis.evidence?.byKey.get(chosenKey) : null
  const candidate = analysis.candidates?.find(item => item.key === chosenKey)
  return <section aria-label="Keyword context" className="grid min-w-0 gap-2 border-t pt-2">
    <strong>Keywords in context</strong>
    <label className="grid gap-1">Language tag
      <input aria-label="Analysis language tag" className="min-w-0 rounded border bg-transparent p-1" value={locale} maxLength={64} onChange={event => setLocale(event.target.value || 'und')} />
    </label>
    <label className="grid gap-1">Your phrases · one per line
      <textarea aria-label="Phrases to inspect" className="min-w-0 rounded border bg-transparent p-1" rows={2} maxLength={2000} value={phrases} onChange={event => setPhrases(event.target.value)} placeholder="Leave empty to discover phrases" />
    </label>
    <p>{analysis.custom ? 'Your phrases use case-insensitive, complete-token matching.' : 'Suggested phrases use frequency, sentence spread and phrase ranking.'} Counts cover this source text, including any source markup; graph counts cover the graph’s analysis text.</p>
    {analysis.error ? <p role="alert">{analysis.error}</p> : <>
      <p>{analysis.evidence?.policy} · {analysis.evidence?.scannedCharacters} characters scanned. Up to 24 phrases and 3 contexts per phrase.{analysis.evidence?.truncated ? ' Partial scan: character or token limit reached.' : ''}</p>
      <nav aria-label="Keyword phrases" className="flex max-h-32 flex-wrap gap-1 overflow-auto">
        {analysis.labels?.map(([key, label]) => <button type="button" className="rounded border px-2 py-1" key={key} aria-pressed={chosenKey === key} onClick={() => setSelected(key)}>{label} · {analysis.evidence?.byKey.get(key)?.frequency ?? 0}</button>)}
      </nav>
      {chosen ? <>
        <p>{chosen.frequency} occurrences · {chosen.spread} sentences{!analysis.custom && candidate ? ` · rank score ${candidate.score.toFixed(2)}` : ''}</p>
        <p>Distribution, start → end: {chosen.distribution.join(' · ')} (six equal text spans)</p>
        <ol aria-label="Keyword source contexts" className="max-h-56 space-y-2 overflow-auto">
          {chosen.contexts.map(context => <li key={context.start} className="rounded border p-2">
            <p className="break-words whitespace-pre-wrap">{context.text}</p>
            <button type="button" className="underline" onClick={() => setStatus(jumpToDocumentInsight(source, context.line) ? `Source line ${context.line} selected.` : 'Source changed. Choose a current match.')}>Jump to source · line {context.line}</button>
          </li>)}
        </ol>
        {!chosen.frequency ? <p>No complete-token matches in the scanned source.</p> : null}
      </> : <p>No phrases in the scanned source.</p>}
    </>}
    <output role="status">{status}</output>
  </section>
}
