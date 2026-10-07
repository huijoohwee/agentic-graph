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
import { renderImportInventory } from '@/features/workspace-fs/importInventory'
import { readWorkspaceSeedSyncRuntimeSnapshot } from '@/lib/workspace/workspaceSeedSyncRuntime'

export async function testMarkdownWorkspaceReadOnlyInventorySettles() {
  await testReadOnlyInventorySettles()
  await testMutationRefreshPreservesExplicitReconciliation()
  await testDamagedImportIndexKeepsFilesReachable()
}

async function testDamagedImportIndexKeepsFilesReachable() {
  const { dom, restore } = initJsdomHarness()
  resetWorkspaceFsForTests()
  writeWorkspaceSeedSyncEnabledSetting(false)
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container), fs = await getWorkspaceFs()
  const originals = { listEntries: fs.listEntries, ensureSeed: fs.ensureSeed, readFileText: fs.readFileText, writeFileText: fs.writeFileText }
  const originalSources = useGraphStore.getState().sourceFiles
  useGraphStore.getState().setSourceFiles([])
  const canonical = renderImportInventory([{ source: 'local:/next.txt', status: 'not imported' }])
  const damaged = canonical.replace('| not imported |', '| My status |')
  let index = damaged, writes = 0
  fs.ensureSeed = async () => false
  fs.listEntries = async () => [
    { path: '/', parentPath: null, name: '', kind: 'folder', updatedAtMs: 1 },
    { path: '/note.md', parentPath: '/', name: 'note.md', kind: 'file', text: '# Saved note', updatedAtMs: 1 },
    { path: '/_import-index.md', parentPath: '/', name: '_import-index.md', kind: 'file', text: index, updatedAtMs: 1 },
  ]
  fs.readFileText = async path => path === '/_import-index.md' ? index : path === '/note.md' ? '# Saved note' : null
  fs.writeFileText = async () => { writes++; throw Error('An edited index must not be overwritten') }
  let refresh: ReturnType<typeof useMarkdownWorkspaceExplorerState>['refresh'] | undefined
  const errors: string[] = [], infos: string[] = []
  function Harness() {
    const state = useMarkdownWorkspaceBootstrapState({ activePath: null, effectiveBottomSurfaceCollapsed: false })
    const explorer = useMarkdownWorkspaceExplorerState({ ...state, active: false,
      setStatusInfo: value => { infos.push(String(value)) }, setStatusError: value => { errors.push(String(value)) }, setStatusProgress: () => {} })
    refresh = explorer.refresh
    return <output>{state.loading ? 'Loading' : state.loadError || state.entries.map(entry => entry.path).join(',')}</output>
  }
  try {
    await act(async () => { root.render(<Harness />) })
    await act(async () => { await refresh!() })
    assert.equal(container.textContent, '/,/note.md,/_import-index.md', 'One invalid catalog must not hide any files')
    assert.equal(index, damaged); assert.equal(writes, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0], /Files refreshed; import index preserved.*\/_import-index.md:.*edited/)
    assert.equal(infos.length, 0, 'A preserved index problem is not falsely reported Ready')
    await act(async () => { await refresh!({ silent: true }) })
    assert.equal(errors.length, 1, 'Background refresh does not repeat the same warning')
    index = canonical
    await act(async () => { await refresh!() })
    assert.equal(container.textContent, '/,/note.md,/_import-index.md')
    assert.equal(infos.at(-1), 'Ready', 'Explicit Refresh settles after the index is repaired')
    assert.equal(errors.length, 1); assert.equal(writes, 0)
  } finally {
    await act(async () => { root.unmount() })
    Object.assign(fs, originals)
    useGraphStore.getState().setSourceFiles(originalSources)
    resetWorkspaceFsForTests(); restore()
  }
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
    // Commit each React turn before checking DOM. listEntries counts read starts,
    // while refresh still awaits inventory persistence and text hydration.
    for (let i = 0; i < 100 && !ready(); i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
    assert.ok(ready(), 'Scheduled workspace refresh must settle')
  }
  const isIdle = () => readWorkspaceSeedSyncRuntimeSnapshot().activeTaskCount === 0
  try {
    await act(async () => { root.render(<Harness />) })
    await act(async () => { await refresh!() })
    assert.equal(seeds, 1, 'Explicit Refresh must reconcile seeds')
    assert.match(container.textContent || '', /# First/)
    const sourceFiles = useGraphStore.getState().sourceFiles
    const beforeArtifactReads = reads
    await act(async () => {
      notifyWorkspaceFsChanged({ op: 'batch', path: '/xr-assets/capture.md' })
    })
    await waitFor(() => reads > beforeArtifactReads && isIdle())
    assert.equal(seeds, 1, 'Artifact mutation must not reconcile unchanged seeds')
    assert.equal(useGraphStore.getState().sourceFiles, sourceFiles, 'No-op refresh preserves source identities')

    entries = entries.map(entry => entry.path === '/docs/test.md' ? { ...entry, text: '# Changed', updatedAtMs: 2 } : entry)
    heldRead = new Promise(resolve => { releaseRead = resolve })
    const beforeMixedReads = reads
    await act(async () => {
      await runWorkspaceFsChangedBatch(() => {
        notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/docs/test.md' })
        notifyWorkspaceFsChanged({ op: 'writeFileText', path: '/xr-assets/second.md' })
      })
    })
    await waitFor(() => reads > beforeMixedReads && heldRead === null)
    assert.match(container.textContent || '', /# First/, 'A started read is not a committed refresh')
    await act(async () => { releaseRead!() })
    await waitFor(() => isIdle() && (container.textContent || '').includes('# Changed'))
    assert.equal(seeds, 1)
    assert.match(container.textContent || '', /# Changed/, 'Mixed batches must retain earlier document changes')

    heldRead = new Promise(resolve => { releaseRead = resolve })
    const beforeQueuedReads = reads
    await act(async () => {
      notifyWorkspaceFsChanged({ op: 'createFile', path: '/docs/queued.md' })
    })
    await waitFor(() => reads > beforeQueuedReads && heldRead === null)
    await act(async () => {
      await refresh!()
      await refresh!({ silent: true, reconcileSeed: false })
      releaseRead!()
    })
    await waitFor(() => isIdle() && seeds === 2 && statuses.length === 2)
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
    try {
      await waitFor(isIdle)
    } finally {
      fs.listEntries = originalList; fs.ensureSeed = originalSeed
      useGraphStore.getState().setSourceFiles(originalSources)
      resetWorkspaceFsForTests(); restore()
    }
  }
}
