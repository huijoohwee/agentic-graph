import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import type { MarkdownPresentationApi } from '@/features/markdown-workspace/markdownWorkspaceTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { traceGraph, spanNodeId, spanLabel, numberLabel, sourceLink } from './missionControlProjection'
import { useAgentRunInspection, closeAgentRunInspection, selectAgentRunInspection, filterAgentRunInspection } from './agentRunInspectionStore'

const FlowCanvas = React.lazy(() => import('@/components/FlowCanvas'))
const noop = () => {}
const cell = (value: unknown) => String(value ?? 'Unknown').replace(/[\\`*_{}[\]()#+.!|<>~-]/g, char => `&#${char.charCodeAt(0)};`).replace(/[\r\n]/g, ' ')
const button = `rounded border px-2 py-1 text-xs ${UI_THEME_TOKENS.button.neutralMuted}`

/** Presentation adapter only: existing workspace panes and Canvas own all rendering. */
export default function AgentRunWorkspaceInspection({ surface }: { surface: 'editor' | 'canvas' }) {
  const inspection = useAgentRunInspection()
  const themeMode = useGraphStore(s => s.resolvedThemeMode || 'light')
  const [layout, setLayout] = React.useState<MarkdownWorkspaceLayoutMode>('editor')
  const [wrap, setWrap] = React.useState(true), [highlight, setHighlight] = React.useState(false)
  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null)
  const presentationRef = React.useRef<MarkdownPresentationApi | null>(null)
  const graph = React.useMemo(() => inspection ? traceGraph(inspection.trace, inspection.search) : null, [inspection])
  const json = React.useMemo(() => inspection ? JSON.stringify({ schema: 'agent-run-inspection/v1', authority: false,
    expiresAt: inspection.expiresAt, selectedSpanId: inspection.spanId, trace: inspection.trace }, null, 2) : '', [inspection])
  const markdown = React.useMemo(() => {
    if (!inspection) return ''
    const { trace, spanId } = inspection, plan = trace.context?.plan, url = sourceLink(trace.context)
    return [`# Agent run ${cell(trace.runId)}`, '', 'Read-only observation. This snapshot grants no execution, release or payment authority.', '',
      `State: ${cell(trace.status)} · Selected span: ${cell(spanId || 'Whole run')}`, '',
      `Observed ${new Date(trace.observedAt).toISOString()} · Expires ${new Date(inspection.expiresAt).toISOString()}`, '',
      `Coverage: ${trace.spans.length}/${trace.total} retained spans on this page; expected ${numberLabel(trace.expected)}; dropped ${numberLabel(trace.dropped)}${trace.partial ? '; partial trace' : ''}.`, '',
      '## Source ownership', '', `${cell(trace.context?.taskId)} → ${cell(trace.context?.projectId)} → ${cell(trace.context?.goalId)}`, '',
      url ? `[Source plan at ${cell(plan?.revision)}](${url})` : 'Source plan unavailable.', '',
      `Continuity: ${cell(plan?.continuityId)} · Digest: ${cell(plan?.digest)}`, '',
      '## Observed spans', '', '| Span | Operation | State | Inclusive ms | Exclusive observed ms | Evaluation |', '| --- | --- | --- | --- | --- | --- |',
      ...trace.spans.map(s => `| ${cell(s.spanId)} | ${cell(spanLabel(s))} | ${cell(s.status)} | ${numberLabel(s.timing.inclusive)} | ${numberLabel(s.timing.exclusive)} | ${cell(s.evaluation.status)} |`), '',
      'Full context, allocation, usage, immutable evaluation evidence and causal links are available in the JSON pane. Unknown values remain unknown.'].join('\n')
  }, [inspection])
  if (!inspection || !graph) return null
  const { trace, spanId } = inspection
  return <section aria-label={`Agent run ${surface === 'editor' ? 'Editor Workspace' : 'Canvas'} inspection`}
    className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${UI_THEME_TOKENS.panel.bg}`}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs" style={{ overflowWrap: 'anywhere' }}>
      <strong>Run {trace.runId}</strong><span>Read-only · {trace.spans.length}/{trace.total} spans · expires {new Date(inspection.expiresAt).toLocaleTimeString()}</span>
      <button className={button} onClick={closeAgentRunInspection}>Close run inspection</button>
      <button className={button} onClick={() => useGraphStore.getState().setWorkspaceViewState({
        mode: surface === 'editor' ? 'canvas' : 'editor', paneOpen: surface !== 'editor',
      })}>{surface === 'editor' ? 'Show Canvas' : 'Show Editor Workspace'}</button>
    </header>
    {surface === 'editor' ? <div className="flex min-h-0 min-w-0 flex-1">
      <MarkdownWorkspaceMain themeMode={themeMode} uiPanelTextFontClass="font-sans" uiPanelMonospaceTextClass="font-mono text-xs"
        explorerOpen={false} setExplorerOpen={noop} layoutMode={layout} setLayoutMode={setLayout}
        markdownWordWrap={wrap} setMarkdownWordWrap={setWrap} markdownTextHighlight={highlight} setMarkdownTextHighlight={setHighlight}
        onToggleFullscreen={noop} presentationApiRef={presentationRef} isMarkdown activeText={markdown} setActiveText={noop}
        jsonSourceText={json} passive disableEditorMutations disableViewerMutations activeDocumentKey={`agent-run-${trace.runId}.md`}
        highlightedLineRange={null} revealLineInEditor={noop} showInViewer={noop} showInPresentation={noop} showInGallery={noop}
        editorUri={`inmemory://agent-run/${encodeURIComponent(trace.runId)}/${trace.subjectDigest || trace.observedAt}.md`}
        editorLanguage="markdown" editorRef={editorRef} />
    </div> : <div className="min-w-0 flex-1 overflow-auto p-3">
      <label className="flex flex-wrap gap-2 text-sm">Search span metadata<input className="min-w-0 max-w-full rounded border px-2"
        maxLength={256} value={inspection.search} onChange={event => filterAgentRunInspection(event.target.value)} /></label>
      <p className="py-2 text-xs">Selected span: {spanId || 'Whole run'} · observed causal links on this page only</p>
      <React.Suspense fallback={<p>Loading topology…</p>}><FlowCanvas inspection={{ graph,
        selectedNodeId: spanId ? spanNodeId(trace.runId, spanId) : null,
        onSelect: id => { const span = trace.spans.find(s => spanNodeId(trace.runId, s.spanId) === id); if (span) selectAgentRunInspection(span.spanId) },
      }} /></React.Suspense>
    </div>}
  </section>
}
