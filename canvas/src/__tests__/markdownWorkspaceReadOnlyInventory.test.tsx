import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { useMarkdownWorkspaceExplorerState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceExplorerState'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { notifyWorkspaceFsChanged, runWorkspaceFsChangedBatch } from '@/features/workspace-fs/workspaceFsEvents'
import { writeWorkspaceAutoRefreshEnabledSetting, writeWorkspaceSeedSyncEnabledSetting } from '@/lib/workspace/workspaceStoreSyncSettings'

export async function testMarkdownWorkspaceReadOnlyInventorySettles() {
  await testReadOnlyInventorySettles()
  await testMutationRefreshPreservesExplicitReconciliation()
}

async function testReadOnlyInventorySettles() {
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

async function testMutationRefreshPreservesExplicitReconciliation() {
  const { dom, restore } = initJsdomHarness()
  resetWorkspaceFsForTests()
  writeWorkspaceSeedSyncEnabledSetting(false)
  writeWorkspaceAutoRefreshEnabledSetting(true)
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container), fs = await getWorkspaceFs()
  const originalList = fs.listEntries, originalSeed = fs.ensureSeed
  const originalSources = useGraphStore.getState().sourceFiles
  useGraphStore.getState().setSourceFiles([])
  let reads = 0, seeds = 0, fail = false
  let heldRead: Promise<void> | null = null, releaseRead: (() => void) | undefined
  let entries: WorkspaceEntry[] = [
    { path: '/', parentPath: null, name: '', kind: 'folder', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', name: 'docs', kind: 'folder', updatedAtMs: 1 },
    { path: '/docs/test.md', parentPath: '/docs', name: 'test.md', kind: 'file', text: '# First', updatedAtMs: 1 },
  ]
  fs.ensureSeed = async () => { seeds++; return false }
  fs.listEntries = async () => {
    reads++
    const held = heldRead; heldRead = null
    if (held) await held
    if (fail) throw Error('Inventory unavailable')
    return entries
  }
  let refresh: ReturnType<typeof useMarkdownWorkspaceExplorerState>['refresh'] | undefined
  const statuses: string[] = []
  function Harness() {
    const state = useMarkdownWorkspaceBootstrapState({ activePath: null, effectiveBottomSurfaceCollapsed: false })
    const explorer = useMarkdownWorkspaceExplorerState({ ...state, active: true,
      setStatusInfo: () => {}, setStatusError: () => {}, setStatusProgress: value => { statuses.push(String(value)) } })
    refresh = explorer.refresh
    return <output>{state.loadError || state.entries.map(entry => entry.text || entry.path).join(',')}</output>
  }
  const waitFor = async (ready: () => boolean) => {
    for (let i = 0; i < 100 && !ready(); i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(ready(), 'Scheduled workspace refresh must settle')
  }
  try {
    await act(async () => { root.render(<Harness />) })
    await act(async () => { await refresh!() })
    assert.equal(seeds, 1, 'Explicit Refresh must reconcile seeds')
    assert.match(container.textContent || '', /# First/)
    const sourceFiles = useGraphStore.getState().sourceFiles
    await act(async () => {
      notifyWorkspaceFsChanged({ op: 'batch', path: '/xr-assets/capture.md' })
      await waitFor(() => reads === 2)
    })
    assert.equal(seeds, 1, 'Artifact mutation must not reconcile unchanged seeds')
    assert.equal(useGraphStore.getState().sourceFiles, sourceFiles, 'No-op refresh preserves source identities')

    entries = entries.map(entry => entry.path === '/docs/test.md' ? { ...entry, text: '# Changed', updatedAtMs: 2 } : entry)
    await act(async () => {
      await runWorkspaceFsChangedBatch(() => {
        notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/docs/test.md' })
        notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/xr-assets/second.md' })
      })
      await waitFor(() => reads === 3)
    })
    assert.equal(seeds, 1)
    assert.match(container.textContent || '', /# Changed/, 'Mixed batches must retain earlier document changes')

    heldRead = new Promise(resolve => { releaseRead = resolve })
    await act(async () => {
      notifyWorkspaceFsChanged({ op: 'createFile', path: '/docs/queued.md' })
      await waitFor(() => reads === 4)
      await refresh!()
      await refresh!({ silent: true, reconcileSeed: false })
      releaseRead!()
      await waitFor(() => reads === 5)
    })
    assert.equal(seeds, 2, 'Queued full refresh survives a subsequent local refresh')
    assert.equal(statuses.length, 2, 'Queued explicit refresh retains its visible progress')
    fail = true
    await act(async () => { await refresh!() })
    assert.equal(container.textContent, 'Inventory unavailable', 'Explicit refresh failures stay observable')
    fail = false
    await act(async () => { await refresh!() })
    assert.match(container.textContent || '', /# Changed/)
  } finally {
    releaseRead?.()
    await act(async () => { root.unmount() })
    fs.listEntries = originalList; fs.ensureSeed = originalSeed
    useGraphStore.getState().setSourceFiles(originalSources)
    resetWorkspaceFsForTests(); restore()
  }
}
