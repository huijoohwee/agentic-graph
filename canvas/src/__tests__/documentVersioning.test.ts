import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDocumentVersionDiff,
  buildDocumentVersionGitGraphRows,
  buildDocumentVersionReviewModel,
  buildDocumentVersionsGitGraphCode,
  readDocumentVersionCountsByPath,
  readDocumentVersions,
  recordDocumentVersionReviewDecision,
  recordDocumentVersionSnapshot,
} from '@/features/document-versioning/documentVersioning'

export function testDocumentVersioningBuildsGitDiffAndGitGraph() {
  const path = `docs/document-versioning-${Date.now()}.md`
  recordDocumentVersionSnapshot({
    path,
    text: '# Demo\n\nold line\n',
    label: 'Save',
    source: 'editorWorkspace',
    authorLabel: 'Reviewer A',
    collaborationPeerId: 'peer:a',
    timestamp: 1,
  })
  recordDocumentVersionSnapshot({
    path,
    text: '# Demo\n\nnew line\nextra line\n',
    label: 'GitGraph Update',
    source: 'gitGraph',
    authorLabel: 'Reviewer B',
    collaborationPeerId: 'peer:b',
    timestamp: 2,
  })
  const versions = readDocumentVersions(path)
  if (versions.length !== 2) throw new Error(`expected two document versions, got ${versions.length}`)
  const counts = readDocumentVersionCountsByPath()
  if (counts[path] !== 2) throw new Error('expected document version counts to be keyed by normalized path')
  const diff = buildDocumentVersionDiff(versions[0], versions[1])
  if (!diff.changed || diff.additions !== 2 || diff.deletions !== 1) {
    throw new Error(`expected line diff +2 -1, got +${diff.additions} -${diff.deletions}`)
  }
  if (!diff.patch.includes(`diff --git a/${path} b/${path}`) || !diff.patch.includes('-old line') || !diff.patch.includes('+new line')) {
    throw new Error('expected unified git diff patch for document versions')
  }
  const gitGraph = buildDocumentVersionsGitGraphCode(versions)
  if (!gitGraph.startsWith('gitGraph') || !gitGraph.includes('commit id:') || !gitGraph.includes('GitGraph Update')) {
    throw new Error('expected document versions to produce reusable Mermaid GitGraph code')
  }
  const gitGraphRows = buildDocumentVersionGitGraphRows(versions)
  if (
    gitGraphRows.length !== versions.length ||
    gitGraphRows[1]?.entry.id !== versions[1]?.id ||
    !gitGraph.includes(gitGraphRows[1]?.graphId || '')
  ) {
    throw new Error('expected document version GitGraph rows to map rendered commits back to version entries')
  }
  const review = buildDocumentVersionReviewModel(versions[0], versions[1])
  if (!review || review.language !== 'markdown' || !review.originalUri.includes('document-version') || !review.modifiedUri.includes('document-version')) {
    throw new Error('expected document versions to produce a Monaco-ready review model')
  }
  if (review.lineChanges.length !== 1 || review.lineChanges[0]?.kind !== 'changed') {
    throw new Error('expected document review model to include changed-line ranges for Monaco decorations')
  }
  if (review.participants.length !== 2 || !review.participants.some(participant => participant.label === 'Reviewer B')) {
    throw new Error('expected document review model to preserve collaborator labels')
  }
  const kept = recordDocumentVersionReviewDecision({
    path,
    versionId: versions[1]!.id,
    decision: 'keep',
    label: 'Yes: Keep',
    timestamp: 3,
  })
  if (!kept || kept.reviewDecision !== 'keep' || kept.reviewLabel !== 'Yes: Keep') {
    throw new Error('expected document version review decisions to persist through the shared version owner')
  }
  const reviewedVersions = readDocumentVersions(path)
  if (reviewedVersions[1]?.reviewDecision !== 'keep') {
    throw new Error('expected document version review decisions to be readable from the shared version state')
  }
}

export function testDocumentVersioningSurfacesUseSharedOwners() {
  const root = resolve(process.cwd(), 'src')
  const runtimeIoText = readFileSync(resolve(root, 'lib', 'markdown-workspace-runtime', 'markdownWorkspaceRuntime.io.ts'), 'utf8')
  const frontmatterSyncText = readFileSync(resolve(root, 'hooks', 'store', 'graph-data-slice', 'graphDataFrontmatterFlowSync.ts'), 'utf8')
  const gitGraphDocumentText = readFileSync(resolve(root, 'features', 'gitgraph', 'useMermaidGitGraphDocument.ts'), 'utf8')
  const markdownPanelLayoutText = readFileSync(resolve(root, 'features', 'markdown', 'ui', 'MarkdownPanelLayout.tsx'), 'utf8')
  const sourceFilesRowText = readFileSync(resolve(root, 'features', 'markdown', 'ui', 'MarkdownSourceFilesTreeRow.tsx'), 'utf8')
  const markdownWorkspaceMainText = readFileSync(resolve(root, 'features', 'markdown-workspace', 'main', 'MarkdownWorkspaceMain.tsx'), 'utf8')
  const documentVersionsHookText = readFileSync(resolve(root, 'features', 'document-versioning', 'useDocumentVersions.ts'), 'utf8')
  const documentVersionGitGraphPanelText = readFileSync(resolve(root, 'features', 'document-versioning', 'DocumentVersionGitGraphPanel.tsx'), 'utf8')
  const markdownWorkspaceToolbarText = readFileSync(resolve(root, 'features', 'markdown-workspace', 'MarkdownWorkspaceToolbar.tsx'), 'utf8')
  const canvasViewportText = readFileSync(resolve(root, 'components', 'CanvasViewport.tsx'), 'utf8')
  const timelineBottomPanelText = readFileSync(resolve(root, 'features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx'), 'utf8')
  const historyViewText = readFileSync(resolve(root, 'features', 'panels', 'views', 'HistoryView.tsx'), 'utf8')
  const documentVersioningText = readFileSync(resolve(root, 'features', 'document-versioning', 'documentVersioning.ts'), 'utf8')
  const monacoTextEditorText = readFileSync(resolve(root, 'lib', 'monaco', 'MonacoTextEditor.impl.tsx'), 'utf8')
  const interactiveMermaidDiagramText = readFileSync(resolve(root, 'lib', 'diagram', 'InteractiveMermaidDiagram.tsx'), 'utf8')

  if (!runtimeIoText.includes('recordDocumentVersionSnapshot({') || !runtimeIoText.includes("source: 'editorWorkspace'")) {
    throw new Error('expected Editor Workspace writeback to capture document versions through the shared version owner')
  }
  if (!frontmatterSyncText.includes('recordDocumentVersionSnapshot({') || !frontmatterSyncText.includes("source: args.source || 'sourceFiles'")) {
    throw new Error('expected Source Files writeback to capture document versions through the shared version owner')
  }
  if (!gitGraphDocumentText.includes("'gitGraph'")) {
    throw new Error('expected GitGraph command edits to mark document versions with the GitGraph source')
  }
  if (!markdownPanelLayoutText.includes('useDocumentVersionRecords()') || !sourceFilesRowText.includes('data-kg-source-file-version-count')) {
    throw new Error('expected Source Files rows to surface shared document version counts')
  }
  if (markdownWorkspaceMainText.includes('DocumentVersionSummaryNotice') || markdownWorkspaceMainText.includes('useDocumentVersions(activeDocumentKey)')) {
    throw new Error('expected Editor Workspace to avoid duplicate document diff review surfaces')
  }
  if (documentVersionsHookText.includes('buildDocumentVersionDiff') || documentVersionsHookText.includes('buildDocumentVersionsGitGraphCode')) {
    throw new Error('expected document version hooks to expose records only and keep rendering composition out of hooks')
  }
  if (
    !documentVersioningText.includes('buildDocumentVersionPathSummaries') ||
    !documentVersioningText.includes('buildDocumentVersionGitGraphRows') ||
    !documentVersionGitGraphPanelText.includes('InteractiveMermaidDiagram') ||
    !documentVersionGitGraphPanelText.includes('selectedDiagramLabels') ||
    !documentVersionGitGraphPanelText.includes('selectionRows={selectionRows}') ||
    !documentVersionGitGraphPanelText.includes("selectedRowKey={selectedVersion?.id || ''}") ||
    !documentVersionGitGraphPanelText.includes('onSelectedRowKeyChange={handleSelectedVersionRowKeyChange}') ||
    !documentVersionGitGraphPanelText.includes('handleSvgSelectedLabelChange') ||
    !documentVersionGitGraphPanelText.includes('svgSurfaceKey="document-version-graph"') ||
    !documentVersionGitGraphPanelText.includes('data-kg-document-version-gitgraph-direct-selection="1"') ||
    !interactiveMermaidDiagramText.includes('useSvgSurfaceZoomRuntime({') ||
    !interactiveMermaidDiagramText.includes('data-kg-interactive-svg-diagram-surface') ||
    !interactiveMermaidDiagramText.includes('data-kg-interactive-svg-diagram-key') ||
    !interactiveMermaidDiagramText.includes('data-kg-mermaid-row-target') ||
    !documentVersionGitGraphPanelText.includes('buildDocumentVersionGitGraphRows') ||
    !documentVersionGitGraphPanelText.includes('buildDocumentVersionReviewModel') ||
    !documentVersionGitGraphPanelText.includes('buildDocumentVersionsGitGraphCode') ||
    !documentVersionGitGraphPanelText.includes('>Version Graph<') ||
    !documentVersionGitGraphPanelText.includes('aria-label="Document version graph"') ||
    !documentVersionGitGraphPanelText.includes('data-kg-document-version-gitgraph-panel') ||
    !documentVersionGitGraphPanelText.includes('selectedVersionId') ||
    !documentVersionGitGraphPanelText.includes('data-kg-document-version-gitgraph-selected-review') ||
    !documentVersionGitGraphPanelText.includes('useDocumentVersionRecords()') ||
    documentVersionGitGraphPanelText.includes('>GitGraph<') ||
    documentVersionGitGraphPanelText.includes('aria-label="Document version GitGraph"')
  ) {
    throw new Error('expected document-version Version Graph rendering and selected-version review to live in a shared panel owner')
  }
  if (
    documentVersionGitGraphPanelText.includes('resolveDiagramPointerRowIndex') ||
    documentVersionGitGraphPanelText.includes('resolveDiagramRowPositionPercent') ||
    documentVersionGitGraphPanelText.includes('data-kg-document-version-gitgraph-version-node') ||
    documentVersionGitGraphPanelText.includes('data-kg-document-version-gitgraph-version-selected') ||
    documentVersionGitGraphPanelText.includes('aria-pressed={selected}')
  ) {
    throw new Error('expected document-version Version Graph to select from rendered SVG elements instead of proxy version-node controls')
  }
  if (
    !markdownWorkspaceMainText.includes('documentVersionGraphOpen') ||
    !markdownWorkspaceMainText.includes('setDocumentVersionGraphOpen') ||
    !markdownWorkspaceMainText.includes("setBottomSurfaceTab('documentVersionGraph')") ||
    markdownWorkspaceMainText.includes('documentVersionGitGraphOpen') ||
    markdownWorkspaceMainText.includes('setDocumentVersionGitGraphOpen') ||
    !markdownWorkspaceMainText.includes('setBottomSurfaceCollapsed(false)') ||
    markdownWorkspaceMainText.includes('DocumentVersionGitGraphPanel') ||
    markdownWorkspaceMainText.includes('documentVersionGitGraphNotice') ||
    !markdownWorkspaceToolbarText.includes('data-kg-markdown-workspace-document-version-graph-toggle="1"') ||
    !markdownWorkspaceToolbarText.includes('Show document version graph') ||
    !markdownWorkspaceToolbarText.includes('<FileDiff') ||
    markdownWorkspaceToolbarText.includes('data-kg-markdown-workspace-diff-gitgraph-toggle="1"') ||
    markdownWorkspaceToolbarText.includes('Show document version diff GitGraph') ||
    markdownWorkspaceToolbarText.includes('onPointerDown={event => event.stopPropagation()}') ||
    markdownWorkspaceToolbarText.includes('onClick={event => event.stopPropagation()}')
  ) {
    throw new Error('expected Editor Workspace diff toggle to open BottomPanel Version Graph without rendering an inline document notice')
  }
  if (
    existsSync(resolve(root, 'features', 'document-versioning', 'DocumentVersionGitGraphBottomPanel.tsx')) ||
    canvasViewportText.includes('DocumentVersionGitGraphBottomPanelLazy') ||
    canvasViewportText.includes('data-kg-document-version-gitgraph-bottom-panel') ||
    !canvasViewportText.includes("bottomSurfaceTab === 'documentVersionGraph'") ||
    !canvasViewportText.includes("bottomSurfaceTab === 'gitGraph'") ||
    !canvasViewportText.includes("bottomSurfaceTab === 'gantt'") ||
    !canvasViewportText.includes("bottomSurfaceTab === 'timeline'") ||
    !canvasViewportText.includes('documentVersionGraphBottomPanelVisible') ||
    !canvasViewportText.includes('mermaidGitGraphBottomPanelVisible') ||
    !canvasViewportText.includes('mermaidGanttBottomPanelVisible') ||
    !canvasViewportText.includes('mermaidTimelineBottomPanelVisible') ||
    !canvasViewportText.includes("initialView={mermaidTimelineBottomPanelVisible ? 'timeline' : mermaidGanttBottomPanelVisible ? 'gantt' : mermaidGitGraphBottomPanelVisible ? 'gitGraph' : documentVersionGraphBottomPanelVisible ? 'documentVersionGraph' : 'strybldrTimeline'}") ||
    !canvasViewportText.includes('workspaceEditorOverlayOpen={workspaceEditorOverlayOpen}') ||
    !canvasViewportText.includes('strybldrTimelineBottomPanelVisible')
  ) {
    throw new Error('expected BottomPanel Version Graph and Mermaid diagram tabs to reuse the shared Timeline bottom panel across canvas renderers')
  }
  if (
    !timelineBottomPanelText.includes('DocumentVersionGitGraphPanel') ||
    !timelineBottomPanelText.includes('TimelineBottomPanelViewLazy') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-timeline-toggle="1"') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-strybldr-toggle="1"') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-document-version-graph-toggle="1"') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-gitgraph-toggle="1"') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-gantt-toggle="1"') ||
    !timelineBottomPanelText.includes('title="Timeline"') ||
    !timelineBottomPanelText.includes('title="Storyboard"') ||
    !timelineBottomPanelText.includes('title="Version Graph"') ||
    !timelineBottomPanelText.includes('title="GitGraph"') ||
    !timelineBottomPanelText.includes('title="Gantt-Timeline"') ||
    !timelineBottomPanelText.includes('<History') ||
    !timelineBottomPanelText.includes('<FileDiff') ||
    !timelineBottomPanelText.includes('<GitGraph') ||
    !timelineBottomPanelText.includes('<ChartGantt') ||
    !timelineBottomPanelText.includes('<MonitorPlay') ||
    !timelineBottomPanelText.includes("view === 'documentVersionGraph'") ||
    !timelineBottomPanelText.includes("view === 'gitGraph'") ||
    !timelineBottomPanelText.includes("view === 'gantt'") ||
    !timelineBottomPanelText.includes("view === 'timeline'") ||
    !timelineBottomPanelText.includes("initialView = 'strybldrTimeline'") ||
    !timelineBottomPanelText.includes('showDocumentVersionGraphView') ||
    !timelineBottomPanelText.includes('showGitGraphView') ||
    !timelineBottomPanelText.includes('showGanttView') ||
    !timelineBottomPanelText.includes('showTimelineView') ||
    !timelineBottomPanelText.includes('setBottomSurfaceTab') ||
    !timelineBottomPanelText.includes("setBottomSurfaceTab('timeline')") ||
    !timelineBottomPanelText.includes("setBottomSurfaceTab('documentVersionGraph')") ||
    !timelineBottomPanelText.includes("setBottomSurfaceTab('gitGraph')") ||
    !timelineBottomPanelText.includes("setBottomSurfaceTab('gantt')") ||
    !timelineBottomPanelText.includes("import { WORKSPACE_LEFT_PANE_SELECTOR } from '@/lib/canvas/viewportMeasureElement'") ||
    !timelineBottomPanelText.includes('resolveWorkspaceCanvasLayerInsetLeft') ||
    !timelineBottomPanelText.includes('workspaceEditorOverlayOpen = false') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-root="canvas-viewport"') ||
    !timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-layer="canvas-viewport"') ||
    !timelineBottomPanelText.includes("className=\"absolute inset-0 z-[230] pointer-events-none\"") ||
    !timelineBottomPanelText.includes("className=\"absolute inset-y-0 right-0 pointer-events-none\"") ||
    !timelineBottomPanelText.includes("view === 'gitGraph'") ||
    !timelineBottomPanelText.includes("maxHeight: 'min(44vh, 24rem)'") ||
    !timelineBottomPanelText.includes('style={layerStyle}') ||
    timelineBottomPanelText.includes('className="fixed inset-0 z-[230] pointer-events-none"') ||
    !timelineBottomPanelText.includes("position: 'absolute' as const")
  ) {
    throw new Error('expected bottom Timeline panel to expose separate Version Graph, GitGraph, and Gantt views')
  }
  if (
    historyViewText.includes("id: 'docs'") ||
    historyViewText.includes('DocumentVersionDiffReview') ||
    historyViewText.includes('useDocumentVersionRecords') ||
    historyViewText.includes('buildDocumentVersionPathSummaries') ||
    historyViewText.includes('buildDocumentVersionDiff') ||
    historyViewText.includes('buildDocumentVersionReviewModel') ||
    historyViewText.includes('recordDocumentVersionReviewDecision') ||
    historyViewText.includes('PlainMermaidDiagram') ||
    historyViewText.includes('data-kg-history-doc-versions') ||
    historyViewText.includes('data-kg-history-doc-version-row') ||
    historyViewText.includes('data-kg-history-doc-version-selected') ||
    historyViewText.includes('data-kg-history-doc-version-gitgraph') ||
    historyViewText.includes('buildDocumentVersionsGitGraphCode')
  ) {
    throw new Error('expected MainPanel History to remove legacy/stale document-version Docs surfaces')
  }
  if (!documentVersioningText.includes('buildDocumentVersionReviewModel') || !documentVersioningText.includes('DocumentVersionReviewParticipant')) {
    throw new Error('expected document versioning utilities to expose a shared collaborative review model')
  }
  if (!documentVersioningText.includes('recordDocumentVersionReviewDecision')) {
    throw new Error('expected document versioning utilities to own keep/discard review decisions')
  }
  if (
    monacoTextEditorText.includes('MonacoDiffEditor') ||
    monacoTextEditorText.includes('MONACO_DIFF_REVIEW_RGB')
  ) {
    throw new Error('expected Monaco text editor owner to stay free of stale document-version diff review code')
  }
  if (!monacoTextEditorText.includes('useMonacoCapabilitySettings()')) {
    throw new Error('expected Monaco text editor to keep shared Monaco capability settings')
  }
}
