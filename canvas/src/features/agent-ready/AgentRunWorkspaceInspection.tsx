import React from 'react'
import { agentRunInspectionJson } from './agentRunImport'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MarkdownWorkspaceMain } from '@/features/markdown-workspace/main/MarkdownWorkspaceMain'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import type { MonacoTextEditorHandle } from '@/features/monaco/MonacoTextEditor'
import type { MarkdownPresentationApi } from '@/features/markdown-workspace/markdownWorkspaceTypes'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { spanRows, numberLabel, sourceLink, traceResources, resourceLabels } from './missionControlProjection'
import { useAgentRunInspection, useAgentRunWorkspace, closeAgentRunInspection } from './agentRunInspectionStore'

import { jsonToMarkdownPreferTable } from '@/features/markdown/jsonToMarkdown'

const MissionControl = React.lazy(() => import('./AgenticOsMissionControl'))
const noop = () => {}
const cell = (value: unknown) => String(value ?? 'Unknown').replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}[\]()|]/g, char => `\\${char}`).replace(/[\r\n]/g, ' ')
const button = `rounded border px-2 py-1 text-xs ${UI_THEME_TOKENS.button.neutralMuted}`

/** Presentation adapter only: existing workspace panes and Canvas own all rendering. */
export default function AgentRunWorkspaceInspection({ surface }: { surface: 'editor' | 'canvas' }) {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const themeMode = useGraphStore(s => s.resolvedThemeMode || 'light')
  const [layout, setLayout] = React.useState<MarkdownWorkspaceLayoutMode>('editor')
  const [wrap, setWrap] = React.useState(true), [highlight, setHighlight] = React.useState(false)
  const editorRef = React.useRef<MonacoTextEditorHandle | null>(null)
  const presentationRef = React.useRef<MarkdownPresentationApi | null>(null)
  const json = React.useMemo(() => inspection ? agentRunInspectionJson(inspection.trace, inspection.spanId, inspection.expiresAt) : '', [inspection])
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
      '## Observed resources', '', jsonToMarkdownPreferTable([resourceLabels(traceResources(trace))], { tableMaxRows: 1, tableMaxColumns: 4, sortKeys: false }), '',
      'Peak process RSS is a maximum. Model cost is estimated; actual cash and machine charges are unknown. Reused stages are excluded from current consumption.', '',
      ...(trace.localObservation?.ci ? [`Initial CI wait: ${numberLabel(trace.localObservation.ci.queueWaitMs, ' ms')} · [CI run](${trace.localObservation.ci.url})`, ''] : []),
      ...(trace.localObservation?.feedback ? ['## Optimization feedback', '', ...trace.localObservation.feedback.ranking.map(row =>
        `- ${cell(row.id)}: ${numberLabel(row.meanMs, ' ms')} mean · ${row.samples} samples · ${row.samples < 3 ? 'cold baseline' : 'repeated observations'}${row.sourceRevision ? ` · [Source](https://${trace.localObservation!.source.repository}/tree/${row.sourceRevision})` : ''}`), ''] : []),
      '## Observed spans', '', jsonToMarkdownPreferTable(spanRows(trace.spans).map(({ id, __order, ...row }) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value).replace(/[&<>`*_{}[\]()]/g,
          char => `&#${char.charCodeAt(0)};`)]))), { tableMaxRows: 32, tableMaxColumns: 10, sortKeys: false }), '',
      'Full context, allocation, usage, immutable evaluation evidence and causal links are available in the JSON pane. Unknown values remain unknown.'].join('\n')
  }, [inspection])
  if (!workspace) return null
  const trace = inspection?.trace
  return <section aria-label={`Agent run ${surface === 'editor' ? 'Editor Workspace' : 'Canvas'} inspection`}
    className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${surface === 'canvas' ? 'kg-workspace-data-view-root' : ''} ${UI_THEME_TOKENS.panel.bg}`}>
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs" style={{ overflowWrap: 'anywhere' }}>
      <strong>{trace ? `Run ${trace.runId}` : 'Agent observability'}</strong>
      {trace && inspection && <span>Read-only · {trace.spans.length}/{trace.total} spans · expires {new Date(inspection.expiresAt).toLocaleTimeString()}</span>}
      <button className={button} onClick={closeAgentRunInspection}>Close run inspection</button>
      <button className={button} disabled={!trace} onClick={() => useGraphStore.getState().setWorkspaceViewState({
        mode: surface === 'editor' ? 'canvas' : 'editor', paneOpen: surface !== 'editor' && !window.matchMedia('(max-width: 768px), (pointer: coarse)').matches,
      })}>{surface === 'editor' ? 'Show Canvas' : 'Show Editor Workspace'}</button>
    </header>
    {surface === 'editor' && trace ? <div className="flex min-h-0 min-w-0 flex-1">
      <MarkdownWorkspaceMain themeMode={themeMode} uiPanelTextFontClass="font-sans" uiPanelMonospaceTextClass="font-mono text-xs"
        explorerOpen={false} setExplorerOpen={noop} layoutMode={layout} setLayoutMode={setLayout}
        markdownWordWrap={wrap} setMarkdownWordWrap={setWrap} markdownTextHighlight={highlight} setMarkdownTextHighlight={setHighlight}
        onToggleFullscreen={noop} presentationApiRef={presentationRef} isMarkdown activeText={markdown} setActiveText={noop}
        jsonSourceText={json} passive disableEditorMutations disableViewerMutations activeDocumentKey={`agent-run-${trace.runId}.md`}
        highlightedLineRange={null} revealLineInEditor={noop} showInViewer={noop} showInPresentation={noop} showInGallery={noop}
        editorUri={`inmemory://agent-run/${encodeURIComponent(trace.runId)}/${trace.subjectDigest || trace.observedAt}.md`}
        editorLanguage="markdown" editorRef={editorRef} />
    </div> : <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <React.Suspense fallback={<p>Loading run evidence…</p>}><MissionControl workspace /></React.Suspense>
    </div>}
  </section>
}
