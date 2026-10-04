import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphState, SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { GitGraphFloatingPanelView } from '@/features/gitgraph/GitGraphFloatingPanelView'
import { GitGraphBottomPanelView } from '@/features/gitgraph/GitGraphBottomPanelView'
import { selectDocumentVersionHistory } from '@/features/gitgraph/versionHistoryGitGraph'
import { useMermaidGitGraphDocument } from '@/features/gitgraph/useMermaidGitGraphDocument'
import { useMermaidGanttDocument } from '@/features/gitgraph/useMermaidGanttDocument'
import { cancelScheduledHistoryCommit } from '@/hooks/store/historySlice'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useMarkdownWorkspaceSelection, type MarkdownWorkspaceSelectionArgs } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceSelection'
import { registerActiveMarkdownBlockEditor } from '@/lib/markdown-core/ui/markdownBlockContainerCore.activeEditor'

type Entry = GraphState['history'][number]
const baseGraph: GraphData = { type: 'Graph', nodes: [], edges: [], metadata: {} }
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message) }
const sourceFile = (id: string, path: string, text: string): SourceFile => ({
  id, name: path.split('/').pop() || path, text, enabled: true, status: 'idle',
  source: { kind: 'local', path },
})
const entry = (id: string, path: string, text: string, snapshot: SourceFile): Entry => ({
  id, parentId: null, label: id, timestamp: 1000, source: 'manual', contentSignature: id,
  graphData: baseGraph, graphFieldSettingsById: {}, markdownDocumentName: path,
  markdownDocumentText: text, activeSourceFileSnapshot: { ...snapshot, text },
})
const documentText = (label: string): string => [
  '---', 'flow_diagrams:', '  key: flow_diagrams', '  type: object', '  value:',
  '    history:', '      key: history', '      type: mermaid_gitgraph', '      value: |-',
  '        gitGraph', `          commit id:"shared" tag:"${label}"`,
  '    schedule:', '      key: schedule', '      type: mermaid_gantt', '      value: |-',
  '        gantt', `          title ${label} schedule`, '          section Work',
  `          ${label} task :shared, 2026-10-03, 1d`, '---', '', `# ${label}`, '',
].join('\n')
const setDocument = (path: string | null, text: string | null) => useGraphStore.getState()
  .setMarkdownDocument(path, text, { autoEnableFrontmatter: false, applyViewPreset: false })

async function withView(run: (args: {
  document: Document; render: (view: React.ReactNode) => Promise<void>
}) => Promise<void>) {
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null
  try {
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(null)
    const container = dom.window.document.getElementById('root')!
    root = createRoot(container)
    await run({
      document: dom.window.document,
      render: async view => { await act(async () => { root!.render(view); await tick() }) },
    })
  } finally {
    cancelScheduledHistoryCommit()
    try { await act(async () => { root?.unmount(); await tick() }) } finally {
      restore()
      restoreWindow()
    }
  }
}

export async function testWorkspaceCrossViewHistoryKeepsGlobalRestoreIndexes() {
  await withView(async ({ document, render }) => {
    const a = sourceFile('a', '/library/a.md', '# A current')
    const b = sourceFile('b', '/library/b.md', '# B current')
    const history = [
      entry('B before', '/library/b.md', '# B before', b),
      entry('A before', 'workspace:/library/a.md', '# A before', a),
      entry('B current', '/library/b.md', b.text, b),
      entry('A current', 'library/a.md', a.text, a),
    ]
    const store = useGraphStore.getState()
    store.setSourceFiles([a, b])
    setDocument('/library/a.md', a.text)
    store.replaceHistoryState(history, 3)
    const indexes = selectDocumentVersionHistory(history, '/library/a.md').map(row => row.index)
    assert(indexes.join(',') === '1,3', 'normalized document history must preserve global restore indexes')
    assert(selectDocumentVersionHistory(history, null).length === 4, 'graph-only history must retain all entries')
    await render(<GitGraphFloatingPanelView />)
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-kg-version-history-index]'))
    assert(rows.map(row => row.dataset.kgVersionHistoryIndex).join(',') === '1,3', 'FloatingPanel must expose only active source versions with owner indexes')
    assert(!document.body.textContent?.includes('B before'), 'unrelated history must stay outside the active source list')
    await act(async () => { rows[0]!.click(); await tick() })
    const restored = useGraphStore.getState()
    assert(restored.historyIndex === 1, 'filtered first version must restore original history index 1')
    assert(restored.markdownDocumentText === '# A before', 'restore must select the active source version bytes')
    assert(useMarkdownExplorerStore.getState().activePath === '/library/a.md', 'restore must sync Source Files active path')
    assert(restored.sourceFiles.find(file => file.id === 'a')?.text === '# A before', 'restore must sync active Source Files bytes')
    assert(restored.sourceFiles.find(file => file.id === 'b')?.text === b.text, 'restore must preserve other source bytes')
  })
}

export async function testWorkspaceCrossViewEmptySourceDoesNotBorrowOtherDiagrams() {
  await withView(async ({ document, render }) => {
    const foreignGit = 'gitGraph\n  commit id:"shared" tag:"Foreign"'
    const foreignGantt = 'gantt\n  title Foreign schedule\n  section Work\n  Foreign task :shared, 2026-10-03, 1d'
    const foreignGraph: GraphData = { ...baseGraph, nodes: [
      { id: 'git', label: 'Foreign', type: 'MermaidDiagram', properties: { isMermaidFrontmatter: true, code: foreignGit } },
      { id: 'gantt', label: 'Foreign', type: 'MermaidDiagram', properties: { isMermaidFrontmatter: true, code: foreignGantt } },
    ] }
    const foreign = sourceFile('foreign', '/library/foreign.md', '# Foreign')
    const store = useGraphStore.getState()
    store.replaceHistoryState([entry('Foreign version', '/library/foreign.md', foreign.text, foreign)], 0)
    setDocument('/library/empty.md', '# Empty source')
    useGraphStore.setState({ graphData: foreignGraph })
    function Probe() {
      const git = useMermaidGitGraphDocument()
      const gantt = useMermaidGanttDocument()
      return <><pre data-view="git">{git.code}</pre><pre data-view="gantt">{gantt.code}</pre></>
    }
    await render(<><GitGraphFloatingPanelView /><GitGraphBottomPanelView /><Probe /></>)
    assert(document.querySelectorAll('[data-kg-version-history-index]').length === 0, 'an unversioned source must not borrow foreign history')
    assert(!document.body.textContent?.includes('Foreign'), 'both GitGraph panels must keep foreign history and diagram bytes out')
    assert(document.querySelector('[data-view="git"]')?.textContent === '', 'named source must not fall back to graph GitGraph metadata')
    assert(document.querySelector('[data-view="gantt"]')?.textContent === '', 'named source must not fall back to graph Gantt metadata')
    await render(<Probe />)
    await act(async () => { setDocument(null, null); await tick() })
    assert(document.querySelector('[data-view="git"]')?.textContent?.includes('Foreign'), 'graph-only mode must retain existing GitGraph fallback')
    assert(document.querySelector('[data-view="gantt"]')?.textContent?.includes('Foreign'), 'graph-only mode must retain existing Gantt fallback')
  })
}

export async function testWorkspaceCrossViewGitGraphEditRestoreSyncsSourceAndGantt() {
  await withView(async ({ document, render }) => {
    const aText = documentText('Alpha')
    const bText = documentText('Beta')
    const a = sourceFile('a', '/library/a.md', aText)
    const b = sourceFile('b', '/library/b.md', bText)
    useGraphStore.getState().setSourceFiles([a, b])
    setDocument('/library/a.md', aText)
    useMarkdownExplorerStore.getState().setActivePath('/library/a.md')
    let commit: ReturnType<typeof useMermaidGitGraphDocument>['commitGitGraphCode'] | null = null
    function Probe() {
      const git = useMermaidGitGraphDocument()
      const gantt = useMermaidGanttDocument()
      commit = git.commitGitGraphCode
      return <><pre data-view="git">{git.code}</pre><pre data-view="gantt">{gantt.code}</pre></>
    }
    await render(<Probe />)
    assert(document.querySelector('[data-view="gantt"]')?.textContent?.includes('Alpha task'), 'initial Gantt must derive from Alpha source')
    await act(async () => {
      assert(commit?.('gitGraph\n  commit id:"shared" tag:"Alpha edited"\n  commit id:"second"', 'test edit'), 'actual GitGraph hook must commit an edit')
      await tick()
    })
    const edited = useGraphStore.getState()
    assert(edited.sourceFiles.find(file => file.id === 'a')?.text.includes('Alpha edited'), 'GitGraph edit must update active Source Files bytes')
    assert(edited.sourceFiles.find(file => file.id === 'b')?.text === bText, 'GitGraph edit must preserve other source bytes')
    const beforeIndex = edited.history.findIndex(version => version.markdownDocumentText === aText)
    assert(beforeIndex >= 0, 'actual edit owner must snapshot pre-edit Alpha source')
    await act(async () => {
      setDocument('/library/b.md', bText)
      useMarkdownExplorerStore.getState().setActivePath('/library/b.md')
      await tick()
    })
    assert(document.querySelector('[data-view="gantt"]')?.textContent?.includes('Beta task'), 'Gantt must switch to Beta even when task ID is shared')
    await act(async () => { useGraphStore.getState().restoreHistory(beforeIndex); await tick() })
    const restored = useGraphStore.getState()
    assert(restored.markdownDocumentText === aText, 'restore must recover exact selected Alpha version')
    assert(restored.sourceFiles.find(file => file.id === 'a')?.text === aText, 'restore must recover Source Files Alpha bytes')
    assert(restored.sourceFiles.find(file => file.id === 'b')?.text === bText, 'restore must leave Beta bytes untouched')
    assert(useMarkdownExplorerStore.getState().activePath === '/library/a.md', 'restore must reveal Alpha in Source Files')
    assert(document.querySelector('[data-view="git"]')?.textContent?.includes('tag:"Alpha"'), 'GitGraph must rederive selected version code')
    assert(document.querySelector('[data-view="gantt"]')?.textContent?.includes('Alpha task'), 'Gantt must rederive selected version despite shared task ID')
    assert(!document.querySelector('[data-view="gantt"]')?.textContent?.includes('Beta'), 'Gantt must not retain previous source content')
  })
}

export async function testWorkspaceCrossViewDocumentIdentityOwnsSelection() {
  await withView(async () => {
    const store = useGraphStore.getState()
    setDocument('/library/a.md', documentText('Alpha'))
    store.setMermaidDiagramSelectedRowKey('gitgraph', 'shared-row')
    store.setMermaidDiagramSelectedRowKey('gantt', 'shared-row')
    store.setGitGraphSelectedCommandLineIndex(1)
    store.setTimelineTransportState({ documentKey: '/library/a.md', position: 42, playing: true })
    setDocument('workspace:/library/a.md', documentText('Alpha edited'))
    const edited = useGraphStore.getState()
    assert(edited.mermaidDiagramSelectedRowKeyByKind.gitgraph === 'shared-row', 'same normalized source edit must retain GitGraph selection')
    assert(edited.mermaidDiagramSelectedRowKeyByKind.gantt === 'shared-row', 'same normalized source edit must retain Gantt selection')
    assert(edited.gitGraphSelectedCommandLineIndex === 1, 'same source edit must retain selected command line')
    assert(edited.timelineTransportPosition === 42, 'same source edit must retain timeline position')
    setDocument('/library/b.md', documentText('Beta'))
    const switched = useGraphStore.getState()
    assert(!switched.mermaidDiagramSelectedRowKeyByKind.gitgraph && !switched.mermaidDiagramSelectedRowKeyByKind.gantt, 'source identity switch must clear diagram selections even when IDs match')
    assert(switched.gitGraphSelectedCommandLineIndex === null, 'source identity switch must clear selected GitGraph command')
    assert(switched.timelineTransportPosition === 0 && !switched.timelineTransportPlaying, 'source identity switch must reset old source transport')
  })
}

export async function testWorkspaceCrossViewPendingSelectionCannotOvertakeRestore() {
  await withView(async ({ document, render }) => {
    const a = sourceFile('a', '/library/a.md', '# A restored')
    const b = sourceFile('b', '/library/b.md', '# B current')
    const store = useGraphStore.getState()
    store.setSourceFiles([a, b])
    store.replaceHistoryState([
      entry('A restored', '/library/a.md', a.text, a),
      entry('B current', '/library/b.md', b.text, b),
    ], 1)
    const activeWrites: string[] = []
    const selectionOwner: { current: ReturnType<typeof useMarkdownWorkspaceSelection> | null } = { current: null }
    const saveRef: MarkdownWorkspaceSelectionArgs['commitActiveTextBeforeSelectionRef'] = { current: null }
    const args: MarkdownWorkspaceSelectionArgs = {
      activePath: null, setActivePath: path => { activeWrites.push(path) }, entries: [], loading: false,
      activeText: '', setActiveText: () => {}, setActiveTextProgrammatic: () => {},
      markdownDocumentName: '', markdownDocumentText: '', setActiveMarkdownDocument: async () => true,
      getFs: async () => { throw new Error('empty selection fixture must not read workspace files') },
      sourcesByPath: {}, viewerInlineEditActive: false, activeRef: { current: false },
      activeTextRef: { current: '' }, lastLoadedRef: { current: null }, userEditedActiveTextRef: { current: false },
      collapsedSnapshotRef: { current: null }, prevCollapsedRef: { current: false },
      effectiveBottomSurfaceCollapsed: false, canvas2dRenderer: 'svg', lastSetActivePath: null,
      lastRequestedActivePathRef: { current: null }, commitActiveTextBeforeSelectionRef: saveRef,
      patchWorkspaceEntryInlineText: () => {}, clearStatus: () => {}, setHighlightedLineRange: () => {},
    }
    function Probe() {
      const selection = useMarkdownWorkspaceSelection(args)
      selectionOwner.current = selection
      return <output data-view="selection">{selection.selectionPath || ''}</output>
    }
    await render(<Probe />)
    for (const phase of ['editor', 'save'] as const) {
      let resolveBoundary!: () => void
      let boundaryEntered = false
      const boundary = new Promise<void>(resolve => { resolveBoundary = resolve })
      const unregister = phase === 'editor' ? registerActiveMarkdownBlockEditor(async () => {
        boundaryEntered = true
        await boundary
      }) : () => {}
      saveRef.current = async () => {
        if (phase === 'save') { boundaryEntered = true; await boundary }
        return true
      }
      let pending: Promise<boolean> | undefined
      let result: boolean | undefined
      try {
        await act(async () => {
          pending = selectionOwner.current!.setSelectionPathSafe('/library/b.md')
          await tick()
        })
        assert(boundaryEntered && pending, `actual selection must wait at the ${phase} owner boundary`)
        assert(document.querySelector('[data-view="selection"]')?.textContent === '', 'pending source must not activate before its commit boundary')
        const revision = useGraphStore.getState().historyRestoreRevision
        await act(async () => { useGraphStore.getState().restoreHistory(0); await tick() })
        assert(useGraphStore.getState().historyRestoreRevision > revision, 'actual history restore must advance selection admission generation')
        await act(async () => { resolveBoundary(); result = await pending; await tick() })
        assert(result === false, `a ${phase}-pending source request must reject after history restore`)
        assert(document.querySelector('[data-view="selection"]')?.textContent === '', 'restored history must prevent pending B selection from publishing')
        assert(selectionOwner.current!.selectionPathRef.current === null, 'rejected B request must not alter internal selection authority')
        assert(activeWrites.length === 0, 'rejected B request must not reactivate Source Files active path')
        assert(useGraphStore.getState().markdownDocumentText === a.text, 'pending B completion must preserve restored A bytes')
        assert(useMarkdownExplorerStore.getState().activePath === '/library/a.md', 'pending B completion must preserve restored Explorer path')
      } finally {
        resolveBoundary()
        unregister()
        saveRef.current = null
      }
    }
  })
}
