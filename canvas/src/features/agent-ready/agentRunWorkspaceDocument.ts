import React from 'react'
import { agentRunInspectionJson } from './agentRunImport'
import { useAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'
import { AGENT_MISSION_MANIFEST_PATH, AGENT_MISSION_SOURCE_ROOT } from './agentMissionSourceFiles'
import { spanRows, numberLabel, sourceLink, traceResources, resourceLabels, workflowSourceLink } from './missionControlProjection'
import { jsonToMarkdownPreferTable } from '@/features/markdown/jsonToMarkdown'
import { useMarkdownPreviewTokens } from '@/features/markdown/ui/useMarkdownPreviewTokens'
import type { MarkdownWorkspaceMainProps } from '@/features/markdown-workspace/main/types'
const noop = () => {}
const cell = (value: unknown) => String(value ?? 'Unknown').replace(/&/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}[\]()|]/g, char => `\\${char}`).replace(/[\r\n]/g, ' ')

/** Read-only document projection for the existing Editor Workspace. No alternate shell. */
export function useAgentRunWorkspaceDocument() {
  const inspection = useAgentRunInspection(), workspace = useAgentRunWorkspace()
  const sourcePath = workspace?.source === null ? null : workspace?.source
    ?? (workspace && inspection ? `${AGENT_MISSION_SOURCE_ROOT}/agent-mission.md` : null)
  const json = React.useMemo(() => inspection ? agentRunInspectionJson(inspection.trace, inspection.spanId, inspection.expiresAt)
    : JSON.stringify({ schema: 'agent-run-inspection/v1', authority: false, expiresAt: null, selectedSpanId: null, trace: null }, null, 2), [inspection])
  const markdown = React.useMemo(() => {
    if (!inspection) return '# Agent Mission\n\nNo observation loaded. Open Dashboard to import a run or connect the runtime.\n'
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
      ...(workflowSourceLink(trace) ? [`[Workflow source revision](${workflowSourceLink(trace)}) · phase receipts and advisory feedback are retained in JSON.`, ''] : []),
      '## Observed spans', '', jsonToMarkdownPreferTable(spanRows(trace.spans).map(({ id, __order, ...row }) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value).replace(/[&<>`*_{}[\]()]/g,
          char => `&#${char.charCodeAt(0)};`)]))), { tableMaxRows: 32, tableMaxColumns: 10, sortKeys: false }), '',
      'Full context, allocation, usage, immutable evaluation evidence and causal links are available in the JSON pane. Unknown values remain unknown.'].join('\n')
  }, [inspection])

  const jsonSelected = sourcePath === AGENT_MISSION_MANIFEST_PATH
  const tocTokens = useMarkdownPreviewTokens(sourcePath && !jsonSelected ? markdown : '', undefined, sourcePath ?? '', false)
  const mainProps: Partial<MarkdownWorkspaceMainProps> = sourcePath ? {
    passive: true, activeText: jsonSelected ? json : markdown, jsonSourceText: json,
    isMarkdown: !jsonSelected, activeDocumentKey: sourcePath, setActiveText: noop,
    editorTextOverride: null, viewerTextOverride: null, webpageWorkspaceMeta: null, webpageHtmlOverride: null,
    disableEditorMutations: true, disableViewerMutations: true, widgetModeActive: false,
    geoDatasetIntegration: undefined, highlightedLineRange: null, liveTextTailFollowKey: null,
    onSaveAs: undefined, onWebpageChangeView: undefined, onWebpageUpdateMeta: undefined,
    onEditorCaretLine: noop, onViewerInlineEditStateChange: noop,
    editorUri: `inmemory://agent-run/${encodeURIComponent(inspection?.trace.runId ?? 'unobserved')}/${inspection?.trace.subjectDigest || inspection?.trace.observedAt || 'empty'}${sourcePath}`,
    editorLanguage: jsonSelected ? 'json' : 'markdown',
  } : {}
  return { sourcePath, mainProps, tocTokens }
}
