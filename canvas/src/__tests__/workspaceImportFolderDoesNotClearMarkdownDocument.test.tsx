import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MarkdownWorkspace } from '@/lib/markdown-workspace-runtime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { File } from 'node:buffer'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useWorkspaceImportActions } from '@/features/markdown-workspace/useWorkspaceFileActions/importActions'
import { useWorkspaceFileActionsCore } from '@/features/markdown-workspace/useWorkspaceFileActions/core'
import type { UseWorkspaceFileActionsArgs } from '@/features/markdown-workspace/useWorkspaceFileActions/types'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { loadWorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { runLaunchImportLocalFiles } from '@/lib/toolbar/launchImportDispatch'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'

export async function testWorkspaceFolderSelectionDoesNotClearMarkdownDocument() {
  await testImportActivatesOnlyAfterRefreshAndSynchronization()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  dom.window.matchMedia = query => ({
    matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  })
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const doc = dom.window.document
    const container = doc.createElement('section')
    container.id = 'root'
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)

    const store = useGraphStore.getState()
    store.setMarkdownDocument('seed.md', '# Seed\n\nHello')

    await act(async () => root!.render(React.createElement(MarkdownWorkspace)))

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for initial render')), 750) as unknown as number
      const raf = (dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame
      if (typeof raf === 'function') {
        raf(() => {
          clearTimeout(timer)
          resolve()
        })
        return
      }
      setTimeout(() => {
        clearTimeout(timer)
        resolve()
      }, 0)
    })

    const before = useGraphStore.getState().markdownDocumentText || ''
    if (!before.includes('Hello')) {
      throw new Error(`expected seeded markdown before, got ${JSON.stringify(before)}`)
    }

    const after = useGraphStore.getState().markdownDocumentText || ''
    if (!after.includes('Hello')) {
      throw new Error(`expected markdown not to be cleared by workspace mount, got ${JSON.stringify(after)}`)
    }
  } finally {
    try {
      await act(async () => root?.unmount())
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

async function testImportActivatesOnlyAfterRefreshAndSynchronization() {
  completeSourceFilesBootstrap()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { restore: restoreDom } = initJsdomHarness()
  const previousGraph = useGraphStore.getState(), previousExplorer = useMarkdownExplorerStore.getState()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), fs = createMemoryWorkspaceFs()
  let releaseRefresh!: () => void, enteredRefresh!: () => void
  let refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
  let refreshEntered = new Promise<void>(resolve => { enteredRefresh = resolve })
  let refreshed = false, applied = 0, focused = 0, entryUpdates = 0, activeText = ''
  let failRefresh = false
  let failGraphApply = false, fallbackCalls = 0
  const selections: boolean[] = []
  const statuses: string[] = []
  let importJobRef!: React.MutableRefObject<number>
  let coreActions!: ReturnType<typeof useWorkspaceFileActionsCore>
  let graphApplyGate: Promise<void> | null = null, enteredGraphApply: (() => void) | null = null
  let unsubscribeSelection: (() => void) | undefined
  let actions!: ReturnType<typeof useWorkspaceImportActions>, job: Promise<unknown> | undefined
  const marker = 'import-final-focus-marker'
  const bounded = async <T,>(pending: Promise<T>, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), 5000)
    })]) } finally { clearTimeout(timer) }
  }
  const ctx: UseWorkspaceFileActionsArgs = {
    getFs: async () => fs,
    refresh: async () => {
      enteredRefresh(); await refreshGate
      if (failRefresh) throw new Error('refresh unavailable')
      const entries = await fs.listEntries(); refreshed = true
      return { entries, sourcesByPath: loadWorkspaceSourceIndex() }
    },
    openedPath: null, selectionPath: null, selectionEntryKind: null,
    activeDocumentKey: '', activeDocumentSourceUrl: null,
    setActiveText: text => { activeText = text }, setEntries: () => { entryUpdates++ }, lastLoadedRef: { current: null },
    setExpandedPaths: () => {}, setSelectionPathSafe: () => {},
    setActivePathSafe: path => {
      if (!refreshed || !applied || !activeText.includes(marker)) throw new Error('activation preceded document synchronization')
      focused++; useMarkdownExplorerStore.getState().setActivePath(path)
    },
    setActiveMarkdownDocument: async () => true,
    applyMarkdownDocumentToGraph: async () => {
      applied++; enteredGraphApply?.(); if (graphApplyGate) await graphApplyGate
      if (failGraphApply) throw new Error('graph unavailable')
      return true
    },
  }
  function Harness() {
    const core = useWorkspaceFileActionsCore(ctx)
    coreActions = core
    importJobRef = core.importJobRef
    actions = useWorkspaceImportActions({ core: {
      ...core,
      status: {
        ...core.status,
        setStatusProgress: (...args) => { statuses.push(args[0]); core.status.setStatusProgress(...args) },
        setStatusInfo: (...args) => { statuses.push(args[0]); core.status.setStatusInfo(...args) },
        setStatusError: (...args) => { statuses.push(args[0]); core.status.setStatusError(...args) },
      },
    }, ctx })
    return null
  }
  try {
    useMarkdownExplorerStore.getState().setActivePath(null)
    unsubscribeSelection = useMarkdownExplorerStore.subscribe((state, previous) => {
      if (state.activePath !== previous.activePath) selections.push(refreshed && applied > 0 && focused === 1 && activeText.includes(marker))
    })
    await act(async () => root.render(<Harness />))
    const file = new File([`---
kgCanvasRenderMode: 2d
flow:
  nodes: []
  edges: []
---
# ${marker}
`], 'import-final-focus.md', { type: 'text/markdown', lastModified: 1 })
    await act(async () => {
      job = actions.handleImportLocalFiles([file as unknown as globalThis.File])
      await bounded(Promise.race([refreshEntered, job.then(() => { throw new Error('import ended before refresh barrier') })]), 'refresh barrier')
    })
    const imported = (await fs.listEntries()).find(entry => entry.kind === 'file' && entry.name === file.name)
    if (!imported) throw new Error('real importer must write the selected file before refresh')
    if (!(await fs.readFileText(imported.path)).includes(marker)) throw new Error('imported file lost fixture content')
    if (useMarkdownExplorerStore.getState().activePath !== null || focused !== 0) {
      throw new Error('import exposed activePath before refresh and final focus')
    }
    if (statuses.at(-1) !== 'Refreshing imported files') {
      throw new Error('pending import must identify its refresh barrier instead of retaining completed byte progress')
    }
    await act(async () => { releaseRefresh(); await bounded(job!, 'import completion') })
    if (useMarkdownExplorerStore.getState().activePath !== imported.path || Number(focused) !== 1 || !applied
      || selections.length !== 1 || !selections[0]) {
      throw new Error('completed import must synchronize and activate its file once through core focus')
    }
    if (!statuses.includes('Applying imported canvas') || !statuses.includes('Synchronizing imported file')
      || !statuses.includes('Opening imported file') || !statuses.at(-1)?.startsWith('Imported 1')) {
      throw new Error('import must report pending stages before its completion receipt')
    }
    refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
    refreshEntered = new Promise<void>(resolve => { enteredRefresh = resolve })
    const nextFile = new File(['# Superseded import'], 'superseded-import.md', { type: 'text/markdown', lastModified: 2 })
    const importThroughLaunch = (file: File) => runLaunchImportLocalFiles({
      files: [file as unknown as globalThis.File], bridge: { importLocalFiles: actions.handleImportLocalFiles },
      fallback: async () => { fallbackCalls++; return { handled: true } },
    })
    await act(async () => {
      job = importThroughLaunch(nextFile)
      await bounded(Promise.race([refreshEntered, job.then(() => { throw new Error('import ended before stale-job barrier') })]), 'stale-job barrier')
    })
    importJobRef.current += 1
    const statusCount = statuses.length
    const sourceFiles = useGraphStore.getState().sourceFiles, graphData = useGraphStore.getState().graphData
    const entriesBefore = entryUpdates
    let supersededResult: unknown
    await act(async () => { releaseRefresh(); supersededResult = await bounded(job!, 'superseded import completion') })
    if (statuses.length !== statusCount || Number(focused) !== 1 || entryUpdates !== entriesBefore
      || useGraphStore.getState().sourceFiles !== sourceFiles || useGraphStore.getState().graphData !== graphData) {
      throw new Error(`superseded import changed current state: ${JSON.stringify({ statusChanged: statuses.length !== statusCount, focused, entryUpdates, entriesBefore, sourcesChanged: useGraphStore.getState().sourceFiles !== sourceFiles, graphChanged: useGraphStore.getState().graphData !== graphData })}`)
    }
    if (!(supersededResult as { handled?: boolean })?.handled || fallbackCalls !== 0) {
      throw new Error('superseded import must remain handled so Launch does not import it again through fallback')
    }
    failRefresh = true
    const failedFile = new File(['# Failed refresh'], 'failed-refresh.md', { type: 'text/markdown', lastModified: 3 })
    await act(async () => { job = importThroughLaunch(failedFile); await bounded(job, 'failed refresh') })
    if (statuses.at(-1) !== 'Import failed: refresh unavailable' || Number(focused) !== 1 || entryUpdates !== entriesBefore
      || fallbackCalls !== 0 || useGraphStore.getState().sourceFiles !== sourceFiles || useGraphStore.getState().graphData !== graphData) {
      throw new Error(`refresh failure must report its error without applying or focusing the partially imported file: ${JSON.stringify({ status: statuses.at(-1), focused, entryUpdates, entriesBefore, sourcesChanged: useGraphStore.getState().sourceFiles !== sourceFiles, graphChanged: useGraphStore.getState().graphData !== graphData })}`)
    }
    let releaseGraphApply!: () => void
    graphApplyGate = new Promise<void>(resolve => { releaseGraphApply = resolve })
    const graphApplyEntered = new Promise<void>(resolve => { enteredGraphApply = resolve })
    try {
      await act(async () => {
        job = coreActions.focusAfterImport(imported.path, { applyToGraph: true, jobId: importJobRef.current })
        await bounded(graphApplyEntered, 'focus graph application')
      })
      importJobRef.current += 1
      const newerPath = '/docs/notes/newer-selection.md'
      useMarkdownExplorerStore.getState().setActivePath(newerPath)
      activeText = '# Newer selection'
      await act(async () => { releaseGraphApply(); await bounded(job!, 'superseded focus completion') })
      if (useMarkdownExplorerStore.getState().activePath !== newerPath || Number(focused) !== 1 || activeText !== '# Newer selection') {
        throw new Error('superseded graph application must not restore an older imported file selection')
      }
    } finally { releaseGraphApply() }
    failRefresh = false; failGraphApply = true; graphApplyGate = null; enteredGraphApply = null
    const failedFocusFile = new File(['# Failed focus'], 'failed-focus.md', { type: 'text/markdown', lastModified: 4 })
    await act(async () => { job = importThroughLaunch(failedFocusFile); await bounded(job, 'failed focus') })
    if (statuses.at(-1) !== 'Import failed: graph unavailable' || Number(focused) !== 1 || fallbackCalls !== 0) {
      throw new Error('failed focus must report an error without a completion receipt or duplicate fallback import')
    }
  } finally {
    releaseRefresh()
    try { if (job) await act(async () => { await bounded(job!, 'import cleanup') }) }
    finally {
      await act(async () => root.unmount())
      unsubscribeSelection?.()
      useGraphStore.setState(previousGraph); useMarkdownExplorerStore.setState(previousExplorer)
      host.remove(); restoreDom(); restoreWindow()
    }
  }
}
