import React from 'react'
import { analyzePassagesInWorker, type PassageAnalyzer } from '@/lib/parsers/documentPassageGraphWorker'
import type { PassageGraphResult } from '@/lib/parsers/documentPassageGraph'
import { applyDocumentPassageLayer, isCurrentDocumentInsightsSource, jumpToDocumentInsight, type DocumentInsightsSource } from '@/features/markdown-workspace/documentInsightsRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

/** Inspection uses the existing source owner; explicit graph layers preserve authored nodes and source text. */
export default function DocumentPassageInsights({ source, analyze = analyzePassagesInWorker }: { source: DocumentInsightsSource; analyze?: PassageAnalyzer }) {
  const [open, setOpen] = React.useState(false)
  const [locale, setLocale] = React.useState('und')
  const [excludeLinkOnly, setExcludeLinkOnly] = React.useState(false)
  const [run, setRun] = React.useState(0)
  const [result, setResult] = React.useState<{ source: DocumentInsightsSource; value: PassageGraphResult } | null>(null)
  const [selected, setSelected] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const controller = React.useRef<AbortController | null>(null)
  React.useEffect(() => {
    setResult(null); setSelected(''); setStatus('')
    if (!open) { setBusy(false); return }
    const aborter = new AbortController()
    controller.current = aborter
    setBusy(true)
    void analyze({ documentId: source.key, text: source.text, locale, excludeLinkOnly }, aborter.signal).then(value => {
      if (aborter.signal.aborted || !isCurrentDocumentInsightsSource(source)) return
      setResult({ source, value }); setSelected(value.passages[0]?.id || '')
      setStatus(value.partial ? `Partial analysis: ${value.reasons.join(', ')}.` : 'Passage analysis complete.')
    }).catch(error => { if (!aborter.signal.aborted) setStatus(error instanceof Error ? error.message : 'Passage analysis failed.') })
      .finally(() => { if (!aborter.signal.aborted) setBusy(false) })
    return () => { aborter.abort(); if (controller.current === aborter) controller.current = null }
  }, [open, source, locale, excludeLinkOnly, run, analyze])
  const current = result?.source === source && isCurrentDocumentInsightsSource(source) ? result.value : null
  const passage = current?.passages.find(p => p.id === selected)
  const group = passage ? current?.groups.find(g => g.members.includes(passage.id)) : null
  const edges = passage ? current?.graph.edges.filter(edge => edge.source === passage.id || edge.target === passage.id) ?? [] : []
  const jump = () => {
    if (!passage || !jumpToDocumentInsight(source, passage.line)) setStatus('Source changed. Analyze the current document again.')
    else setStatus(`Source line ${passage.line} selected.`)
  }
  return <details className="min-w-0 border-t pt-2" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-medium">Passages and relationships</summary>
    {open ? <section aria-label="Passage insights" className="grid min-w-0 gap-2 pt-2 text-xs">
      <p>Inspect authored passages and lexical overlap. Groups describe shared words, not facts or causality. Analysis stays on this device; media and linked pages are not fetched.</p>
      <label className="grid gap-1">Passage language tag
        <input aria-label="Passage language tag" className="min-w-0 rounded border bg-transparent p-1" maxLength={64} value={locale} onChange={event => setLocale(event.target.value || 'und')} />
      </label>
      <label className="flex gap-2"><input type="checkbox" checked={excludeLinkOnly} onChange={event => setExcludeLinkOnly(event.target.checked)} />Exclude link-only blocks from lexical analysis</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-2 py-1" onClick={() => setRun(value => value + 1)}>Analyze again</button>
        {busy ? <button type="button" className="rounded border px-2 py-1" onClick={() => { controller.current?.abort(); setBusy(false); setStatus('Passage analysis cancelled. Source unchanged.') }}>Cancel analysis</button> : null}
      </div>
      <output role="status" aria-live="polite">{busy ? 'Analyzing passages…' : status}</output>
      {current ? <>
        <p>{current.passages.length} passages · {current.graph.edges.length} relationships · {current.groups.length} lexical groups · {current.policy}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded border px-2 py-1" onClick={() => setStatus(applyDocumentPassageLayer(source, current.graph, useGraphStore.getState()) ? 'Passage layer added. Source text and authored nodes are preserved.' : 'Open this source’s document graph before adding its passage layer.')}>Add passage layer to graph</button>
          <button type="button" className="rounded border px-2 py-1" onClick={() => setStatus(applyDocumentPassageLayer(source, null, useGraphStore.getState()) ? 'Passage layer removed. Source text is unchanged.' : 'Source or graph changed. No layer was removed.')}>Remove passage layer</button>
        </div>
        <p>Limits: 60,000 characters, 200 passages and 12,000 analyzed words. Similarity keeps at most 4 mutual neighbors per passage.</p>
        {current.partial ? <p role="note">Some source or analysis is omitted: {current.reasons.join(', ')}. The original document is unchanged.</p> : null}
        <label className="grid gap-1">Passage
          <select aria-label="Passage" className="w-full min-w-0 rounded border bg-transparent p-1" value={selected} onChange={event => setSelected(event.target.value)}>
            {current.passages.map(p => <option key={p.id} value={p.id}>Line {p.line} · {p.kind} · {p.text.replace(/\s+/g, ' ').slice(0, 60)}</option>)}
          </select>
        </label>
        {passage ? <>
          <p className="break-words whitespace-pre-wrap">{passage.text.slice(0, 1200)}{passage.text.length > 1200 ? '…' : ''}</p>
          <p>Source lines {passage.line}–{passage.endLine} · {passage.excluded ? 'Excluded from lexical analysis' : 'Retained'}{passage.notice ? ` · ${passage.notice}` : ''}</p>
          <button type="button" className="justify-self-start underline" onClick={jump}>Jump to passage source · line {passage.line}</button>
          <p>Authored section: {current.passages.find(p => p.id === passage.section)?.text || 'No heading parent'}.</p>
          <p>{group ? `Lexical group: ${group.terms.join(', ')} · ${group.members.length} passages` : 'No supported lexical group.'}</p>
          {group ? <nav aria-label="Lexical group members" className="flex flex-wrap gap-2">{group.members.map(id => <button type="button" key={id} className="underline" aria-pressed={selected === id} onClick={() => setSelected(id)}>Line {current.passages.find(p => p.id === id)?.line}</button>)}</nav> : null}
          <ol aria-label="Passage relationships" className="max-h-56 space-y-2 overflow-auto">
            {edges.map(edge => {
              const other = current.passages.find(p => p.id === (edge.source === passage.id ? edge.target : edge.source))!
              const terms = edge.properties['passage:terms']
              return <li key={edge.id} className="rounded border p-2">
                <button type="button" className="underline" onClick={() => setSelected(other.id)}>{edge.label} · line {other.line}</button>
                <p>{edge.label === 'similar_to' ? `Lexical cosine ${Number(edge.properties['passage:score']).toFixed(3)} · ${Array.isArray(terms) ? terms.join(', ') : ''}` : `${edge.source === passage.id ? 'Outgoing' : 'Incoming'} authored relationship`}</p>
              </li>
            })}
          </ol>
          {passage.references.length ? <ul aria-label="Passage references" className="space-y-1">{passage.references.map((ref, i) => <li key={i} className="break-all">{ref.status} · {ref.target}</li>)}</ul> : null}
        </> : <p>No passages found in the document body.</p>}
      </> : null}
    </section> : null}
  </details>
}
