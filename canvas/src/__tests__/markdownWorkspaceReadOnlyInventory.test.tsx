import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { useMarkdownWorkspaceExplorerState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceExplorerState'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testMarkdownWorkspaceReadOnlyInventorySettles() {
  const { dom, restore } = initJsdomHarness()
  resetWorkspaceFsForTests()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const fs = await getWorkspaceFs()
  const originalList = fs.listEntries, originalSeed = fs.ensureSeed
  let reads = 0, seeds = 0, fail = false
  fs.ensureSeed = async () => { seeds++; throw Error('Read-only inspection must not refresh seeds') }
  fs.listEntries = async () => {
    reads++
    if (fail) throw Error('Inventory unavailable')
    return [{ path: '/', parentPath: null, name: '', kind: 'folder', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', name: 'docs', kind: 'folder', updatedAtMs: 1 }]
  }
  const authored = useGraphStore.getState().sourceFiles
  let refresh: ReturnType<typeof useMarkdownWorkspaceExplorerState>['refresh'] | undefined
  function Harness() {
    const state = useMarkdownWorkspaceBootstrapState({ activePath: null, effectiveBottomSurfaceCollapsed: false })
    const explorer = useMarkdownWorkspaceExplorerState({ ...state, active: false, readOnly: true,
      setStatusInfo: () => {}, setStatusError: () => {}, setStatusProgress: () => {} })
    refresh = explorer.refresh
    React.useEffect(() => { void explorer.refresh() }, [explorer.refresh])
    return <output>{state.loading ? 'Loading…' : state.loadError || state.entries.map(entry => entry.path).join(',')}</output>
  }
  try {
    await act(async () => { root.render(<Harness />) })
    assert.equal(container.textContent, '/,/docs', 'Cold mission inspection must settle its inventory')
    await act(async () => { root.render(<Harness />) })
    assert.equal(reads, 1, 'Ordinary rerenders must reuse the settled read')
    fail = true
    await act(async () => { await refresh!({ silent: true }) })
    assert.equal(container.textContent, 'Inventory unavailable', 'A failed read must settle into an error')
    fail = false
    await act(async () => { await refresh!() })
    assert.equal(container.textContent, '/,/docs', 'The existing Refresh action must recover')
    assert.equal(seeds, 0)
    assert.equal(useGraphStore.getState().sourceFiles, authored, 'Inspection must not recompose authored source files')
  } finally {
    await act(async () => { root.unmount() })
    fs.listEntries = originalList; fs.ensureSeed = originalSeed
    resetWorkspaceFsForTests(); restore()
  }
}
