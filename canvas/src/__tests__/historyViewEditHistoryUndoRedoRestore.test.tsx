import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'
import HistoryView from '@/features/panels/views/HistoryView'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolveMermaidGitGraphCode } from '@/lib/mermaid/mermaidGitGraph'
import { readYamlFrontmatterMermaidDiagramCodes } from '@/lib/mermaid/mermaidDiagramCode'
import { VERSION_HISTORY_MAX_ENTRIES } from '@/features/history/versionHistoryTypes'
import {
  commitRichMediaInlineEditVersion,
  RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL,
} from '@/features/history/richMediaInlineEditHistory'
import { commitRichMediaPanelChange } from '@/lib/render/richMediaSsot'
import { buildVersionHistoryGitGraphCode } from '@/features/gitgraph/versionHistoryGitGraph'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testHistoryViewEditHistoryUndoRedoRestoreWiring() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    store.resetAll()

    const baseGraph: GraphData = { type: 'Graph', nodes: [], edges: [], metadata: {} }
    store.replaceHistoryState(
      [
        { id: 'h-0', parentId: null, label: 'A', timestamp: Date.now() - 2000, source: 'graph', contentSignature: 'a', graphData: baseGraph, graphFieldSettingsById: {}, markdownDocumentName: null, markdownDocumentText: null, activeSourceFileSnapshot: null },
        { id: 'h-1', parentId: 'h-0', label: 'B', timestamp: Date.now() - 1000, source: 'graph', contentSignature: 'b', graphData: baseGraph, graphFieldSettingsById: {}, markdownDocumentName: null, markdownDocumentText: null, activeSourceFileSnapshot: null },
      ],
      0,
    )

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)

    await act(async () => {
      root!.render(<HistoryView searchQuery="" />)
    })
    await tick()

    const historyTab = dom.window.document.querySelector(
      'button[data-kg-history-section-tab="history"]',
    ) as HTMLButtonElement | null
    if (!historyTab) throw new Error('expected History option')
    await act(async () => {
      historyTab.click()
      await tick()
    })

    const undoBtn = dom.window.document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement | null
    const redoBtn = dom.window.document.querySelector('button[aria-label="Redo"]') as HTMLButtonElement | null
    if (!undoBtn) throw new Error('expected shared Undo control')
    if (!redoBtn) throw new Error('expected Redo button')

    if (!undoBtn.disabled) throw new Error('expected Undo to be disabled at historyIndex=0')
    if (redoBtn.disabled) throw new Error('expected Redo to be enabled at historyIndex=0 with 2 entries')

    const versionRows = Array.from(dom.window.document.querySelectorAll('button[data-kg-version-history-index]')) as HTMLButtonElement[]
    if (versionRows.length < 2) throw new Error('expected directly restorable version rows')

    await act(async () => {
      versionRows[1]!.click()
      await tick()
    })
    if (useGraphStore.getState().historyIndex !== 1) throw new Error('expected version row click to restore historyIndex=1')

    const undoBtn2 = dom.window.document.querySelector('button[aria-label="Undo"]') as HTMLButtonElement | null
    const redoBtn2 = dom.window.document.querySelector('button[aria-label="Redo"]') as HTMLButtonElement | null
    if (!undoBtn2) throw new Error('expected Undo button after restore')
    if (!redoBtn2) throw new Error('expected shared Redo control after restore')
    if (undoBtn2.disabled) throw new Error('expected Undo to be enabled at historyIndex=1')
    if (!redoBtn2.disabled) throw new Error('expected Redo to be disabled at the last history entry')
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    restore()
    restoreWindow()
  }
}

export function testHistoryViewUsesScopedStoreSelectionAndSemanticSignatures() {
  const p = resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'HistoryView.tsx')
  const text = readFileSync(p, 'utf8')
  if (text.includes('} = useGraphStore()')) {
    throw new Error('expected HistoryView to avoid subscribing to the entire graph store')
  }
  if (!text.includes('useGraphStore(\n    useShallow(')) {
    throw new Error('expected HistoryView to use a shallow scoped store selector')
  }
  if (!text.includes('buildHistoryEntriesSignature') || !text.includes('buildUiLogEntriesSignature') || !text.includes('buildChatExchangeLogsSignature')) {
    throw new Error('expected HistoryView to derive semantic signatures for chat, history, and log rows')
  }
  if (!text.includes('useSemanticSnapshot(historyRaw, historySignature)')) {
    throw new Error('expected HistoryView to stabilize history rows by semantic signature instead of raw array identity')
  }
  if (!text.includes('const historyIndexById = React.useMemo(() => {')) {
    throw new Error('expected HistoryView to precompute a history index lookup instead of rescanning history rows per render')
  }
  if (text.includes('<ToolbarDropdownSelect') || text.includes('kg-toolbar-dropdown-menu')) {
    throw new Error('expected HistoryView section switching to avoid the legacy dropdown menu')
  }
  if (!text.includes('data-kg-history-section-tabs="1"') || !text.includes('data-kg-history-section-tab={item.id}')) {
    throw new Error('expected HistoryView section switching to use the compact icon-only header tablist')
  }
  if (!text.includes('role="tablist"') || !text.includes('role="tab"') || !text.includes('showTooltip')) {
    throw new Error('expected HistoryView icon-only tabs to preserve tab semantics and tooltips')
  }
}

export function testToolbarAndHistoryViewShareVersionUndoRedoControls() {
  const toolbarText = readFileSync(resolve(process.cwd(), 'src', 'components', 'Toolbar.tsx'), 'utf8')
  const historyViewText = readFileSync(resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'HistoryView.tsx'), 'utf8')
  const bottomGitGraphText = readFileSync(resolve(process.cwd(), 'src', 'features', 'gitgraph', 'GitGraphBottomPanelView.tsx'), 'utf8')
  const floatingGitGraphText = readFileSync(resolve(process.cwd(), 'src', 'features', 'gitgraph', 'GitGraphFloatingPanelView.tsx'), 'utf8')
  const controlsText = readFileSync(resolve(process.cwd(), 'src', 'features', 'history', 'HistoryUndoRedoControls.tsx'), 'utf8')

  if (
    !toolbarText.includes('<HistoryUndoRedoControls') ||
    !historyViewText.includes('<HistoryUndoRedoControls') ||
    !bottomGitGraphText.includes('headerActions={<HistoryUndoRedoControls') ||
    !floatingGitGraphText.includes('<HistoryUndoRedoControls')
  ) {
    throw new Error('expected Toolbar, MainPanel History, BottomPanel GitGraph, and FloatingPanel GitGraph to reuse visible shared version controls')
  }
  if (bottomGitGraphText.includes('showLabels') || floatingGitGraphText.includes('showLabels') || historyViewText.includes('showLabels')) {
    throw new Error('expected panel Undo/Redo controls to retain the icon-only shared presentation')
  }
  const zoomIndex = toolbarText.indexOf('<ZoomModeSelect')
  const historyControlsIndex = toolbarText.indexOf('<HistoryUndoRedoControls')
  if (zoomIndex < 0 || historyControlsIndex < zoomIndex) {
    throw new Error('expected Undo/Redo on the right side of Zoom')
  }
  for (const required of ['state.historyIndex', 'state.history.length', 'state.undoHistory', 'state.redoHistory']) {
    if (!controlsText.includes(required)) throw new Error(`expected shared version controls to derive ${required}`)
  }
  if (!controlsText.includes('data-kg-history-action="undo"') || !controlsText.includes('data-kg-history-action="redo"')) {
    throw new Error('expected selectable semantic Undo/Redo control markers')
  }
  if (controlsText.includes('showLabels')) {
    throw new Error('expected shared Undo/Redo controls to remain icon-only')
  }
  if (!bottomGitGraphText.includes('buildVersionHistoryGitGraphCode(history)')) {
    throw new Error('expected BottomPanel GitGraph chart to fall back to shared version history')
  }
  if (!bottomGitGraphText.includes('readVersionHistoryIndexFromCommitId') || !bottomGitGraphText.includes('restoreHistory(versionIndex)')) {
    throw new Error('expected BottomPanel GitGraph selection to restore the shared runtime version')
  }
  if (!bottomGitGraphText.includes('runtimeHistorySelectedRowKey') || !bottomGitGraphText.includes('controlledSelectedRowKey={usesRuntimeHistory ? runtimeHistorySelectedRowKey : undefined}')) {
    throw new Error('expected BottomPanel GitGraph selection to follow historyIndex through controlled selection')
  }
  if (!bottomGitGraphText.includes('shareSelection={!usesRuntimeHistory}')) {
    throw new Error('expected runtime Version History not to write into authored-Mermaid selection state')
  }
  if (!floatingGitGraphText.includes('aria-label="Version history list"') || !floatingGitGraphText.includes('restoreHistory(index)')) {
    throw new Error('expected FloatingPanel GitGraph list to expose restorable shared version history')
  }
  if (!floatingGitGraphText.includes('const usesRuntimeHistory = !code && history.length > 0')) {
    throw new Error('expected FloatingPanel GitGraph to distinguish runtime history from authored Mermaid commands')
  }
  const runtimeHistoryGuards = floatingGitGraphText.match(/if \(usesRuntimeHistory\) return/g) || []
  if (runtimeHistoryGuards.length < 3) {
    throw new Error('expected runtime-history selection not to be cleared or scrolled by authored-command effects')
  }
}

export function testHistoryUndoRedoRestoresCanonicalGitGraphDocumentAcrossViews() {
  const store = useGraphStore.getState()
  store.resetAll()
  store.setHistoryDebounceMs(0)
  const beforeText = ['---', 'mermaid: |', '  gitGraph', '    commit id:"before"', '---'].join('\n')
  const afterText = ['---', 'mermaid: |', '  gitGraph', '    commit id:"after"', '---'].join('\n')
  const sourceFile = {
    id: 'gitgraph-source',
    name: 'versions.md',
    text: beforeText,
    enabled: true,
    status: 'parsed' as const,
  }
  useGraphStore.setState({
    graphData: { type: 'Graph', nodes: [], edges: [], metadata: {} },
    markdownDocumentName: 'versions.md',
    markdownDocumentText: beforeText,
    sourceFiles: [sourceFile],
  })
  useGraphStore.getState().addHistory('Before GitGraph edit')
  useGraphStore.setState({
    markdownDocumentText: afterText,
    sourceFiles: [{ ...sourceFile, text: afterText }],
  })
  useGraphStore.getState().addHistory('GitGraph edit')

  useGraphStore.getState().undoHistory()
  const undone = useGraphStore.getState()
  const undoneCode = resolveMermaidGitGraphCode(readYamlFrontmatterMermaidDiagramCodes(undone.markdownDocumentText || '', 'gitgraph'))
  if (!undoneCode.includes('commit id:"before"') || undoneCode.includes('commit id:"after"')) {
    throw new Error(`expected chart/list canonical GitGraph document to undo, got ${undoneCode}`)
  }
  if (undone.sourceFiles[0]?.text !== beforeText) throw new Error('expected GitGraph source-file text to undo atomically')

  undone.redoHistory()
  const redone = useGraphStore.getState()
  const redoneCode = resolveMermaidGitGraphCode(readYamlFrontmatterMermaidDiagramCodes(redone.markdownDocumentText || '', 'gitgraph'))
  if (!redoneCode.includes('commit id:"after"') || redoneCode.includes('commit id:"before"')) {
    throw new Error(`expected chart/list canonical GitGraph document to redo, got ${redoneCode}`)
  }
  if (redone.sourceFiles[0]?.text !== afterText) throw new Error('expected GitGraph source-file text to redo atomically')

  redone.undoHistory()
  const undoneAgain = useGraphStore.getState()
  if (undoneAgain.markdownDocumentText !== beforeText || undoneAgain.sourceFiles[0]?.text !== beforeText) {
    throw new Error('expected Undo to remain repeatable after a completed Undo/Redo cycle')
  }
  undoneAgain.redoHistory()
  const redoneAgain = useGraphStore.getState()
  if (redoneAgain.markdownDocumentText !== afterText || redoneAgain.sourceFiles[0]?.text !== afterText) {
    throw new Error('expected Redo to remain repeatable after a completed Undo/Redo cycle')
  }

  const bottomPanelText = readFileSync(resolve(process.cwd(), 'src', 'features', 'gitgraph', 'GitGraphBottomPanelView.tsx'), 'utf8')
  const floatingPanelText = readFileSync(resolve(process.cwd(), 'src', 'features', 'gitgraph', 'GitGraphFloatingPanelView.tsx'), 'utf8')
  const documentHookText = readFileSync(resolve(process.cwd(), 'src', 'features', 'gitgraph', 'useMermaidGitGraphDocument.ts'), 'utf8')
  if (!bottomPanelText.includes('useMermaidGitGraphDocument()') || !floatingPanelText.includes('useMermaidGitGraphDocument()')) {
    throw new Error('expected GitGraph chart and list to consume the same restored canonical document')
  }
  const baselineIndex = documentHookText.indexOf('store.addHistory(`Before GitGraph ${actionLabel}`)')
  const mutationIndex = documentHookText.indexOf('store.setMarkdownDocument(documentName, nextText')
  if (baselineIndex < 0 || mutationIndex < 0 || baselineIndex > mutationIndex) {
    throw new Error('expected GitGraph edits to capture the pre-mutation history baseline')
  }
}

export function testVersionHistoryIsSemanticBoundedAndParentLinked() {
  const store = useGraphStore.getState()
  store.resetAll()
  for (let index = 0; index <= VERSION_HISTORY_MAX_ENTRIES; index += 1) {
    useGraphStore.setState({
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: { version: index } },
      markdownDocumentName: 'versions.md',
      markdownDocumentText: `# Version ${index}`,
    })
    useGraphStore.getState().addHistory(`Version ${index}`)
  }
  const bounded = useGraphStore.getState().history
  if (bounded.length !== VERSION_HISTORY_MAX_ENTRIES) {
    throw new Error(`expected bounded version history length ${VERSION_HISTORY_MAX_ENTRIES}, got ${bounded.length}`)
  }
  if (bounded[0]?.parentId !== null) throw new Error('expected bounded history root to clear its removed parent')
  if (bounded[bounded.length - 1]?.parentId !== bounded[bounded.length - 2]?.id) {
    throw new Error('expected adjacent semantic versions to retain a linear parent link')
  }
  const lengthBeforeNoop = bounded.length
  useGraphStore.getState().addHistory('No-op duplicate')
  if (useGraphStore.getState().history.length !== lengthBeforeNoop) {
    throw new Error('expected identical semantic content not to create a version')
  }
}

export function testRichMediaInlineEditVersionsAndRestoresThroughSharedHistory() {
  const richMediaInlineEditSurfaces = [
    readFileSync(resolve(process.cwd(), 'src', 'components', 'RichMediaPanelTextSurface.tsx'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src', 'components', 'RichMediaPanelWorkspaceViewerSurface.tsx'), 'utf8'),
  ]
  if (richMediaInlineEditSurfaces.some(source => !source.includes('commitRichMediaInlineEditVersion({'))) {
    throw new Error('expected Rich Media Card and Editor Workspace Viewer inline edits to reuse one shared version commit boundary')
  }

  const store = useGraphStore.getState()
  store.resetAll()
  useGraphStore.setState({
    graphData: {
      type: 'Graph',
      nodes: [{
        id: 'rich-media-history-node',
        type: 'RichMediaPanel',
        label: 'Rich Media history node',
        properties: { output: 'Before inline edit', keep: 'yes' },
      }],
      edges: [],
      metadata: {},
    },
  })

  const committed = commitRichMediaInlineEditVersion({
    currentText: 'Before inline edit',
    nextText: 'After inline edit',
    commit: () => {
      commitRichMediaPanelChange({
        nodeId: 'rich-media-history-node',
        next: {
          activeTab: 'text',
          freezeConnectedOutput: true,
          text: 'After inline edit',
        },
        updateNode: (id, patch) => useGraphStore.getState().updateNode(id, patch as Partial<GraphNode>),
      })
    },
  })

  const versioned = useGraphStore.getState()
  if (!committed || versioned.history.length !== 2 || versioned.historyIndex !== 1) {
    throw new Error(`expected one Rich Media inline edit to create before/after shared versions, got ${versioned.history.length}@${versioned.historyIndex}`)
  }
  const expectedLabels = [
    `Before ${RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL}`,
    RICH_MEDIA_INLINE_EDIT_HISTORY_LABEL,
  ]
  if (versioned.history.map(entry => entry.label).join('|') !== expectedLabels.join('|')) {
    throw new Error(`expected canonical Rich Media version labels, got ${versioned.history.map(entry => entry.label).join('|')}`)
  }
  const gitGraphCode = buildVersionHistoryGitGraphCode(versioned.history)
  if (!expectedLabels.every(label => gitGraphCode.includes(`tag:"${label}"`))) {
    throw new Error(`expected BottomPanel/FloatingPanel GitGraph projection to consume Rich Media versions, got ${gitGraphCode}`)
  }

  versioned.restoreHistory(0)
  const restoredBefore = useGraphStore.getState()
  const restoredBeforeNode = restoredBefore.graphData?.nodes?.[0]
  if (restoredBeforeNode?.properties?.output !== 'Before inline edit' || restoredBeforeNode?.properties?.keep !== 'yes') {
    throw new Error(`expected MainPanel History restore to recover the pre-edit Rich Media node, got ${JSON.stringify(restoredBeforeNode?.properties)}`)
  }
  if (restoredBefore.historyIndex !== 0 || restoredBefore.history.length !== 2) {
    throw new Error(`expected Rich Media version navigation to select the restored entry without truncating shared history, got ${restoredBefore.history.length}@${restoredBefore.historyIndex}`)
  }

  useGraphStore.getState().restoreHistory(1)
  const restoredAfterNode = useGraphStore.getState().graphData?.nodes?.[0]
  if (restoredAfterNode?.properties?.output !== 'After inline edit') {
    throw new Error(`expected shared GitGraph/History restore to recover the edited Rich Media node, got ${JSON.stringify(restoredAfterNode?.properties)}`)
  }
  useGraphStore.getState().undoHistory()
  if (useGraphStore.getState().graphData?.nodes?.[0]?.properties?.output !== 'Before inline edit') {
    throw new Error('expected shared Undo to restore the Rich Media text before the inline edit')
  }
  useGraphStore.getState().redoHistory()
  if (useGraphStore.getState().graphData?.nodes?.[0]?.properties?.output !== 'After inline edit') {
    throw new Error('expected shared Redo to restore the versioned Rich Media inline edit')
  }

  const historyLengthBeforeNoop = useGraphStore.getState().history.length
  const noopCommitted = commitRichMediaInlineEditVersion({
    currentText: 'After inline edit',
    nextText: 'After inline edit',
    commit: () => {
      throw new Error('expected identical Rich Media text not to execute a commit')
    },
  })
  if (noopCommitted || useGraphStore.getState().history.length !== historyLengthBeforeNoop) {
    throw new Error('expected identical Rich Media inline text not to create duplicate versions')
  }
}

export async function testHistoryViewRelayQuickFilterScopesLogRows() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    store.resetAll()
    store.pushUiLog({
      kind: 'neutral',
      source: 'chat:relay',
      message: 'Agnes AI workspace relay is ready. (workspace=kgws:test-chat, role=editor, auth=server-managed)',
    })
    store.pushUiLog({
      kind: 'warning',
      source: 'storage:sync',
      message: 'Workspace sync retried after stale revision.',
    })

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')
    root = createRoot(container)

    await act(async () => {
      root!.render(<HistoryView searchQuery="" />)
    })
    await tick()

    const logTab = dom.window.document.querySelector(
      'button[data-kg-history-section-tab="log"]',
    ) as HTMLButtonElement | null
    if (!logTab) throw new Error('expected Log tab')
    await act(async () => {
      logTab.click()
      await tick()
    })

    const allFilter = dom.window.document.querySelector(
      'button[data-kg-history-log-filter="all"]',
    ) as HTMLButtonElement | null
    const relayFilter = dom.window.document.querySelector(
      'button[data-kg-history-log-filter="relay"]',
    ) as HTMLButtonElement | null
    if (!allFilter || !relayFilter) {
      throw new Error('expected HistoryView log filter buttons when relay diagnostics exist')
    }

    const readVisibleRows = () =>
      Array.from(dom.window.document.querySelectorAll('tbody tr')).map(row => String((row as HTMLTableRowElement).textContent || ''))

    const allRows = readVisibleRows()
    if (!allRows.some(text => text.includes('chat:relay'))) {
      throw new Error(`expected all log rows to include the relay diagnostic entry, got ${JSON.stringify(allRows)}`)
    }
    if (!allRows.some(text => text.includes('storage:sync'))) {
      throw new Error(`expected all log rows to include the non-relay diagnostic entry, got ${JSON.stringify(allRows)}`)
    }

    await act(async () => {
      relayFilter.click()
      await tick()
    })

    const relayRows = readVisibleRows()
    if (relayRows.length !== 1) {
      throw new Error(`expected Relay filter to narrow the log table to one row, got ${relayRows.length}`)
    }
    if (!relayRows[0]?.includes('chat:relay')) {
      throw new Error(`expected Relay filter to keep only relay diagnostics, got ${JSON.stringify(relayRows)}`)
    }
    if (relayRows[0]?.includes('storage:sync')) {
      throw new Error(`expected Relay filter to exclude non-relay diagnostics, got ${JSON.stringify(relayRows)}`)
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
      })
      await tick()
    } catch {
      void 0
    }
    restore()
    restoreWindow()
  }
}
