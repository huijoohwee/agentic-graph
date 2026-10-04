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

export async function testWorkspaceFolderSelectionDoesNotClearMarkdownDocument() {
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

    root.render(React.createElement(MarkdownWorkspace))

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
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
  await testImportActivatesOnlyAfterRefreshAndSynchronization()
}

async function testImportActivatesOnlyAfterRefreshAndSynchronization() {
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const { restore: restoreDom } = initJsdomHarness()
  const previousGraph = useGraphStore.getState(), previousExplorer = useMarkdownExplorerStore.getState()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), fs = createMemoryWorkspaceFs()
  let releaseRefresh!: () => void, enteredRefresh!: () => void
  const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve })
  const refreshEntered = new Promise<void>(resolve => { enteredRefresh = resolve })
  let refreshed = false, applied = 0, focused = 0, activeText = ''
  const selections: boolean[] = []
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
      const entries = await fs.listEntries(); refreshed = true
      return { entries, sourcesByPath: loadWorkspaceSourceIndex() }
    },
    openedPath: null, selectionPath: null, selectionEntryKind: null,
    activeDocumentKey: '', activeDocumentSourceUrl: null,
    setActiveText: text => { activeText = text }, setEntries: () => {}, lastLoadedRef: { current: null },
    setExpandedPaths: () => {}, setSelectionPathSafe: () => {},
    setActivePathSafe: path => {
      if (!refreshed || !applied || !activeText.includes(marker)) throw new Error('activation preceded document synchronization')
      focused++; useMarkdownExplorerStore.getState().setActivePath(path)
    },
    setActiveMarkdownDocument: async () => true,
    applyMarkdownDocumentToGraph: async () => { applied++; return true },
  }
  function Harness() {
    const core = useWorkspaceFileActionsCore(ctx)
    actions = useWorkspaceImportActions({ core, ctx })
    return null
  }
  try {
    useMarkdownExplorerStore.getState().setActivePath(null)
    unsubscribeSelection = useMarkdownExplorerStore.subscribe((state, previous) => {
      if (state.activePath !== previous.activePath) selections.push(refreshed && applied > 0 && focused === 1 && activeText.includes(marker))
    })
    await act(async () => root.render(<Harness />))
    const file = new File([`---
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
    await act(async () => { releaseRefresh(); await bounded(job!, 'import completion') })
    if (useMarkdownExplorerStore.getState().activePath !== imported.path || Number(focused) !== 1 || !applied
      || selections.length !== 1 || !selections[0]) {
      throw new Error('completed import must synchronize and activate its file once through core focus')
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
