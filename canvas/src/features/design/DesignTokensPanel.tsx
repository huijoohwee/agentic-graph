import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useThemeDetector } from '@/hooks/useThemeDetector'
import { AG_TOKEN_DEFS, getKgThemeFromDom, serializeKgTokens } from '@/lib/ui/tokens-ssot'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_FOCUS_RING } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { downloadBlob } from '@/lib/graph/save'
import { UI_RESPONSIVE_DESIGN_PANEL_TOKEN_LIST_CLASSNAME, UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { cn } from '@/lib/utils'
import type { DesignTokenSummaryEntry } from './designTokenSummary'
import { buildDesignContext, DESIGN_INTENT_FIELDS, serializeDesignContext } from './designContext'

const actionClass = cn('min-h-11 rounded border px-3 py-2 text-xs', UI_THEME_TOKENS.panel.border,
  UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.primary, UI_FOCUS_RING)
type ExportFormat = 'context-markdown' | 'context-json' | 'tokens-css' | 'tokens-json' | 'tokens-typescript'
function TokenSection({ title, entries, inspect }: { title: string; entries: DesignTokenSummaryEntry[]; inspect: (id: string) => void }) {
  return <section className={cn('min-w-0 rounded border', UI_THEME_TOKENS.panel.border)} aria-label={title}>
    <h3 className="m-0 px-2 py-2 text-xs font-semibold">{title}</h3>
    <ul className={UI_RESPONSIVE_DESIGN_PANEL_TOKEN_LIST_CLASSNAME}>
      {entries.map(entry => <li key={entry.value} className="min-w-0 border-t px-2 py-2 text-xs">
        <span className="break-all font-mono">{entry.value}</span> <span>({entry.count})</span>
        <span className="flex flex-wrap gap-1">{entry.sampleNodeIds.map(id => <button type="button" className={actionClass}
          key={id} onClick={() => inspect(id)} aria-label={`Inspect ${id}`}>Inspect source</button>)}</span>
      </li>)}
      {!entries.length && <li className="px-2 py-2 text-xs">No observed values</li>}
    </ul>
  </section>
}

export default function DesignTokensPanel({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography(), theme = useThemeDetector()
  const state = useGraphStore(useShallow(s => ({ graphData: s.graphData, graphDataRevision: s.graphDataRevision,
    markdownDocumentName: s.markdownDocumentName, markdownDocumentText: s.markdownDocumentText,
    canvasRenderMode: s.canvasRenderMode, canvas2dRenderer: s.canvas2dRenderer })))
  const context = React.useMemo(() => buildDesignContext({ active: active && state.canvasRenderMode === '2d' && state.canvas2dRenderer === 'design',
    graphData: state.graphData, graphRevision: state.graphDataRevision, documentName: state.markdownDocumentName ?? '',
    markdown: state.markdownDocumentText ?? '', theme }), [active, state, theme])
  const [format, setFormat] = React.useState<ExportFormat>('context-markdown')
  const [message, setMessage] = React.useState('')
  React.useEffect(() => { setMessage('') }, [context])
  const freshContext = () => {
    const current = useGraphStore.getState()
    return buildDesignContext({ active: active && current.canvasRenderMode === '2d' && current.canvas2dRenderer === 'design',
      graphData: current.graphData, graphRevision: current.graphDataRevision, documentName: current.markdownDocumentName ?? '',
      markdown: current.markdownDocumentText ?? '', theme: getKgThemeFromDom() })
  }
  const inspect = (id: string) => {
    const current = freshContext()
    if (!context.available || !current.available || current.semanticKey !== context.semanticKey) {
      setMessage('The document changed. Inspect the current review before selecting a source.'); return
    }
    const store = useGraphStore.getState()
    if (!store.graphData?.nodes.some(node => node.id === id)) { setMessage('The source node is no longer available.'); return }
    store.setSelectionSource('canvas'); store.selectNode(id)
    setMessage(`Selected ${id}`)
  }
  const exportReview = () => {
    try {
      const current = freshContext()
      if (!context.available || !current.available) throw new Error(current.available ? 'Design context is unavailable.' : current.message)
      if (current.semanticKey !== context.semanticKey) throw new Error('The document changed. Inspect the current review before export.')
      const isContext = format.startsWith('context-')
      const target = format.split('-')[1] as 'markdown' | 'json' | 'css' | 'typescript'
      const output = isContext ? serializeDesignContext(current, target as 'markdown' | 'json', context.semanticKey)
        : serializeKgTokens(AG_TOKEN_DEFS, target as 'css' | 'json' | 'typescript')
      const extension = target === 'markdown' ? 'md' : target === 'typescript' ? 'ts' : target
      downloadBlob(new Blob([output], { type: target === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }), `design-${isContext ? 'context' : 'tokens'}.${extension}`)
      setMessage('Exported locally.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed.') }
  }
  if (!context.available) return <section aria-label="Design Tokens" className={cn('px-3 py-2 text-xs', UI_THEME_TOKENS.text.secondary)}>
    <p role={context.status === 'invalid' ? 'alert' : 'status'}>{context.message}</p>
  </section>
  return <section className={cn(UI_RESPONSIVE_FLOATING_PANEL_SUBPANEL_CLASSNAME, 'min-w-0 space-y-3 px-3 py-2', panelTypography.panelTextClass)}
    aria-label="Design Tokens" data-main-panel-no-drag="true" data-design-context-key={context.semanticKey}>
    <h2 className="m-0 text-sm font-semibold">Design token review</h2>
    <p className="m-0 text-xs">{context.theme} · {context.observed.scannedNodes}/{context.observed.totalNodes} nodes · {context.audit.checked} declared checks</p>
    <p className="m-0 text-xs">{context.audit.status === 'unassessed' ? 'No assessable checks yet.' : 'Review applies to declared properties.'}
      {context.audit.truncated ? ' Scan is incomplete; limits were reached.' : ''} Browser layout and accessibility still need review.</p>
    <section className="flex min-w-0 flex-wrap items-end gap-2" aria-label="Design export">
      <label className="flex min-w-0 flex-col gap-1 text-xs">Export format
        <select aria-label="Export format" className={actionClass} value={format} onChange={e => setFormat(e.target.value as ExportFormat)}>
          <option value="context-markdown">Context Markdown</option><option value="context-json">Context JSON</option>
          <option value="tokens-css">Tokens CSS</option><option value="tokens-json">Tokens JSON</option><option value="tokens-typescript">Tokens TypeScript</option>
        </select>
      </label>
      <button type="button" className={actionClass} onClick={exportReview}>Export locally</button>
    </section>
    <p role="status" className="m-0 break-words text-xs">{message}</p>
    <details className="min-w-0 text-xs"><summary className={actionClass}>Authored tokens ({context.tokens.length})</summary>
      <p>Application theme tokens; document colors remain separate.</p>
      <ul className={UI_RESPONSIVE_DESIGN_PANEL_TOKEN_LIST_CLASSNAME}>{context.tokens.map(token => <li key={token.name} className="min-w-0 border-b py-2">
        <strong className="break-all">{token.cssVar}</strong><p className="m-0 break-all">{token.value} · {token.type}</p><p className="m-0">{token.purpose}</p>
      </li>)}</ul>
    </details>
    <details className="min-w-0 text-xs"><summary className={actionClass}>Document design context</summary>
      <p>Optional document frontmatter: a <code>design</code> mapping with the text fields below. Missing fields stay unresolved.</p>
      <dl>{DESIGN_INTENT_FIELDS.map(key => <React.Fragment key={key}><dt className="font-semibold">{key}</dt>
        <dd className="m-0 mb-2 break-words">{context.intent[key] ?? 'Unresolved'}</dd></React.Fragment>)}</dl>
      <ul className="pl-4">{context.guidance.map(line => <li key={line}>{line}</li>)}</ul>
    </details>
    <section aria-label="Design findings" className="min-w-0 space-y-2 text-xs">
      <h3 className="m-0 font-semibold">Findings ({context.audit.findingCount})</h3>
      {context.audit.findings.map((finding, i) => <article key={`${finding.nodeId}:${finding.path}:${i}`} className="min-w-0 rounded border p-2">
        <strong>{finding.severity} · {finding.rule}</strong><p className="my-1 break-words">{finding.evidence}</p>
        <p className="my-1">{finding.action}</p><p className="my-1 break-all">{finding.nodeId} / {finding.path}</p>
        <button type="button" className={actionClass} onClick={() => inspect(finding.nodeId)}>Inspect finding source</button>
      </article>)}
      {!context.audit.findingCount && <p>No findings in the checked subset; this is not a complete accessibility assessment.</p>}
    </section>
    <details className="min-w-0 text-xs"><summary className={actionClass}>Resolved value matches ({context.audit.matches.length})</summary>
      <p>Equal values are possible matches, not an authored binding.</p>
      <ul className="m-0 list-none p-0">{context.audit.matches.map((match, i) => <li key={i} className="break-all py-2">
        {match.nodeId} / {match.path}: {match.value} → {match.tokens.join(', ')}
      </li>)}</ul>
    </details>
    <TokenSection title="Observed colors" entries={context.observed.colors} inspect={inspect} />
    <TokenSection title="Observed typography" entries={context.observed.typography} inspect={inspect} />
    <TokenSection title="Observed spacing" entries={context.observed.spacing} inspect={inspect} />
    <details className="text-xs"><summary className={actionClass}>Source provenance</summary>
      <p className="break-all">{context.tokenSource} · {context.tokenRevision}</p><p className="break-all">{context.intentSource}</p>
      <p className="break-all">{context.observationSource}</p><p>Graph revision: {context.graphRevision}</p>
    </details>
  </section>
}
