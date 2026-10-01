import React from 'react'
import { useDocumentInsights, jumpToDocumentInsight } from '@/features/markdown-workspace/documentInsightsRuntime'
import type { DocumentSignalKind } from '@/lib/websites/signalTokens'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { sourceLineContexts } from '@/lib/semantic-mode/keywordEvidence'

const DocumentKeywordInsights = React.lazy(() => import('./DocumentKeywordInsights'))
const DocumentPassageInsights = React.lazy(() => import('./DocumentPassageInsights'))
const explanations = { nav: 'Navigation label rule', cta: 'Action label rule', price: 'Currency or recurring amount pattern', time: 'Clock or duration pattern' }

const kinds = ['nav', 'cta', 'price', 'time'] as const
export function DocumentInsights() {
  const { source, kind: requestedKind, request } = useDocumentInsights()
  const [kind, setKind] = React.useState<DocumentSignalKind>(requestedKind || 'price')
  const [open, setOpen] = React.useState(request > 0)
  const [status, setStatus] = React.useState('')
  const detailsRef = React.useRef<HTMLDetailsElement>(null)
  React.useEffect(() => {
    if (!request || !requestedKind) return
    setKind(requestedKind)
    setOpen(true)
    detailsRef.current?.scrollIntoView({ block: 'nearest' })
  }, [requestedKind, request])
  React.useEffect(() => setStatus(''), [source?.key, source?.text])
  const signals = source?.signals
  const matches = signals?.[kind] || []
  const contexts = React.useMemo(() => open && source ? sourceLineContexts(source.text) : [], [open, source?.text])
  return (
    <details ref={detailsRef} open={open} onToggle={event => setOpen(event.currentTarget.open)} className={`shrink-0 rounded border p-2 ${UI_THEME_TOKENS.panel.border}`}>
      <summary className="cursor-pointer font-medium">Document insights</summary>
      <section aria-label="Document insights" className="grid min-w-0 gap-2 pt-2 text-xs">
        <p className="break-all">{source?.key || 'Open a text document to inspect its source.'}</p>
        <p>Heuristic matches: NAV and CTA classify link labels; PRICE finds currency mentions; TIME finds clock or duration text.</p>
        <nav className="flex flex-wrap gap-1" aria-label="Document insight categories">
          {kinds.map(value => <button key={value} type="button" aria-pressed={kind === value} className={`rounded border px-2 py-1 ${UI_THEME_TOKENS.panel.border} ${kind === value ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg}`} onClick={() => setKind(value)}>{value.toUpperCase()} {signals?.[value].length ?? 0}</button>)}
        </nav>
        {source && !signals ? <p role="status">Updating document matches…</p> : null}
        {signals?.truncated ? <p>Bounded results: up to 24 distinct labels per category, 10 source lines per label, 8,000 lines and 2 million characters. Lines over 4,096 characters are skipped. Some matches or locations are omitted.</p> : null}
        {signals && !matches.length ? <p>No {kind.toUpperCase()} matches in the scanned source.</p> : null}
        <ol className="max-h-56 space-y-2 overflow-auto" aria-label={`${kind.toUpperCase()} source matches`}>
          {matches.map(match => <li key={match.label} className={`rounded border p-2 ${UI_THEME_TOKENS.panel.border}`}>
            <p className="break-words font-medium">{match.label} · {match.count} {match.count === 1 ? 'occurrence' : 'occurrences'}</p>
            <p>{explanations[kind]} · heuristic match</p>
            <p className="break-words">{contexts[(match.lines[0] ?? 1) - 1]}</p>
            <nav className="flex flex-wrap gap-2 pt-1" aria-label={`${match.label} source locations`}>
              {match.lines.map(line => <button key={line} type="button" className="underline" onClick={() => {
                if (!source || !jumpToDocumentInsight(source, line)) setStatus('Source changed. Choose a current match.')
                else setStatus(`Source line ${line} selected.`)
              }}>Jump to source · line {line}</button>)}
            </nav>
          </li>)}
        </ol>
        <output role="status">{status}</output>
        {open && source ? <React.Suspense fallback={<p role="status">Loading keyword context…</p>}><DocumentKeywordInsights source={source} /></React.Suspense> : null}
        {open && source ? <React.Suspense fallback={<p role="status">Loading passage insights…</p>}><DocumentPassageInsights source={source} /></React.Suspense> : null}
      </section>
    </details>
  )
}
