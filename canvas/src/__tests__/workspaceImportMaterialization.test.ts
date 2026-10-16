import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeActiveWorkspaceEntryIntoSourceFiles, isMaterializedWorkspaceSourceProofCurrent } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'

const fileEntry = (path: string, text: string, updatedAtMs = 1): WorkspaceEntry => ({
  path, text, updatedAtMs, kind: 'file', name: path.split('/').pop()!, parentPath: '/docs',
})

async function assertActiveSourceLifecyclePublicationRetriesOnce() {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const { restore } = initJsdomHarness()
  const path = '/docs/lifecycle-retry.md', text = '# Lifecycle retry\n', name = 'lifecycle-retry.md'
  const entry = fileEntry(path, text)
  const fs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    entry,
  ] })
  const prepared: SourceFile = {
    id: 'active-source-lifecycle-retry', name, text, enabled: true, geoLayerEnabled: true, status: 'idle',
    source: { kind: 'local', path: `workspace:${path}` },
  }
  try {
    ensureBuiltInParsersRegistered()
    let applications = 0
    useGraphStore.setState({
      sourceFiles: [], markdownDocumentName: `docs/${name}`, markdownDocumentText: text,
      markdownDocumentApplyViewPreset: true,
      setActiveMarkdownDocument: async payload => {
        applications += 1
        const sourceFiles = applications === 1
          ? useGraphStore.getState().sourceFiles.map((file, index) => index === 0 ? { ...file, status: 'loading' as const } : file)
          : useGraphStore.getState().sourceFiles
        useGraphStore.setState({ sourceFiles, markdownDocumentName: payload.name, markdownDocumentText: payload.text,
          markdownDocumentApplyViewPreset: true })
        return true
      },
    })
    useMarkdownExplorerStore.getState().setActivePath(path)
    const proof = await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: path, fs, applyToGraph: true, sourceFilesSnapshot: [], premergedSourceFiles: [prepared],
      activeWorkspaceEntriesSnapshot: [entry], sourcesByPath: {},
    })
    const active = useGraphStore.getState().sourceFiles[0]
    if (!proof || !isMaterializedWorkspaceSourceProofCurrent(proof) || applications !== 2 || active?.status !== 'parsed') {
      throw new Error('active source lifecycle publication must receive one bounded materialization retry')
    }
  } finally {
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

export async function testApplyWorkspaceImportToCanvasForceIncludeOnlySkipsInactiveWorkspaceRecords() {
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      fileEntry('/docs/active.md', '# active'),
      fileEntry('/docs/inactive.md', '# inactive', 2),
    ],
  })
  try {
    store.setSourceFiles([])
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: ['/docs/active.md'],
      opts: {
        applyToGraph: false,
        workspaceEntries: await fs.listEntries(),
        sourcesByPath: {
          '/docs/active.md': { kind: 'local', originalName: 'active.md' },
          '/docs/inactive.md': { kind: 'local', originalName: 'inactive.md' },
        },
      },
    })
    const sourceFiles = useGraphStore.getState().sourceFiles || []
    if (sourceFiles.length !== 1 || String(sourceFiles[0]?.source?.path || '') !== 'workspace:/docs/active.md') {
      throw new Error(`expected workspace import apply to skip inactive records, got ${JSON.stringify(sourceFiles)}`)
    }
    // Existing authored empty documents must survive a targeted import.
    store.setSourceFiles([...sourceFiles, {
      id: 'existing-empty', name: 'existing.md', text: '', enabled: false, status: 'idle',
      source: { kind: 'local', path: 'workspace:/docs/existing.md' },
    }])
    const entries = [...await fs.listEntries(), fileEntry('/docs/existing.md', '')]
    const inactive = entries.find(entry => entry.path === '/docs/inactive.md')!
    Object.defineProperty(inactive, 'text', { get() {
      throw new Error('targeted import must not read unrelated document text')
    } })
    const opts = {
      applyToGraph: false,
      workspaceEntries: entries,
      sourcesByPath: {
        '/docs/active.md': { kind: 'url' as const, url: 'https://import.example.test/document' },
        '/docs/inactive.md': { kind: 'url' as const, url: 'https://unrelated.example.test/document' },
        '/docs/existing.md': { kind: 'local' as const, originalName: 'existing.md' },
      },
    }
    await applyWorkspaceImportToCanvas({ fs, createdPaths: ['/docs/active.md'], opts })
    const retained = useGraphStore.getState().sourceFiles || []
    const empty = retained.find(file => file.source?.path === 'workspace:/docs/existing.md')
    if (retained.length !== 2 || !empty || empty.text !== '' || empty.enabled !== false) {
      throw new Error('targeted import must preserve existing empty disabled documents')
    }
    await applyWorkspaceImportToCanvas({
      fs, createdPaths: ['/docs/active.md'], opts: { ...opts, removedPaths: ['/docs/existing.md'] },
    })
    const remaining = useGraphStore.getState().sourceFiles || []
    if (remaining.length !== 1 || remaining[0]?.source?.path !== 'workspace:/docs/active.md') {
      throw new Error('targeted import must not reintroduce removed documents from the workspace snapshot')
    }

    let republishedSameRecords = false
    const unsubscribe = useGraphStore.subscribe((next, previous) => {
      const nextFiles = next.sourceFiles || []
      if (republishedSameRecords || next.sourceFiles === previous.sourceFiles
        || !nextFiles.some(file => file.source?.path === 'workspace:/docs/active.md')) return
      republishedSameRecords = true
      store.setSourceFiles(nextFiles.slice())
    })
    try {
      store.setSourceFiles([])
      const result = await applyWorkspaceImportToCanvas({
        fs,
        createdPaths: ['/docs/active.md'],
        opts: { applyToGraph: false, workspaceEntries: await fs.listEntries() },
      })
      if (!republishedSameRecords || !result.sourceFilesUpdated) {
        throw new Error('workspace import must tolerate a synchronous equivalent source-files publication')
      }
    } finally {
      unsubscribe()
    }

    let republishedLifecycleState = false
    const unsubscribeLifecycle = useGraphStore.subscribe((next, previous) => {
      const nextFiles = next.sourceFiles || []
      if (republishedLifecycleState || next.sourceFiles === previous.sourceFiles
        || !nextFiles.some(file => file.source?.path === 'workspace:/docs/active.md')) return
      republishedLifecycleState = true
      store.setSourceFiles(nextFiles.map(file => file.source?.path === 'workspace:/docs/active.md'
        ? { ...file, status: 'loading' }
        : file))
    })
    try {
      store.setSourceFiles([])
      const result = await applyWorkspaceImportToCanvas({
        fs,
        createdPaths: ['/docs/active.md'],
        opts: { applyToGraph: false, workspaceEntries: await fs.listEntries() },
      })
      const active = useGraphStore.getState().sourceFiles?.find(file => file.source?.path === 'workspace:/docs/active.md')
      if (!republishedLifecycleState || !result.sourceFilesUpdated || active?.text !== '# active' || active.status !== 'loading') {
        throw new Error('workspace import must retain its source through a concurrent lifecycle publication')
      }
    } finally {
      unsubscribeLifecycle()
    }

    let publishedBackgroundSource = false
    let backgroundError: unknown
    store.setSourceFiles([])
    try {
      await applyWorkspaceImportToCanvas({
        fs,
        createdPaths: ['/docs/active.md'],
        opts: {
          applyToGraph: false,
          workspaceEntries: await fs.listEntries(),
          assertCurrent: () => {
            if (publishedBackgroundSource) return
            publishedBackgroundSource = true
            store.setSourceFiles([{
              id: 'background-source', name: 'background.md', text: '# background', enabled: false, status: 'idle',
              source: { kind: 'local', path: 'workspace:/docs/background.md' },
            }])
          },
        },
      })
    } catch (error) {
      backgroundError = error
    }
    const retainedFiles = useGraphStore.getState().sourceFiles || []
    if (!publishedBackgroundSource || (backgroundError as { code?: string; retryable?: boolean } | undefined)?.code !== 'SOURCE_FILES_MATERIALIZATION_STALE'
      || (backgroundError as { retryable?: boolean } | undefined)?.retryable !== false
      || retainedFiles.length !== 1 || retainedFiles[0]?.source?.path !== 'workspace:/docs/background.md') {
      throw new Error('workspace import must reject a concurrent source inventory update')
    }

    let retriedBackgroundSource = false
    let retryableError: unknown
    store.setSourceFiles([])
    try {
      await applyWorkspaceImportToCanvas({
        fs,
        createdPaths: ['/docs/active.md'],
        opts: {
          applyToGraph: false,
          retryOnInventoryDrift: true,
          workspaceEntries: await fs.listEntries(),
          assertCurrent: () => {
            if (retriedBackgroundSource) return
            retriedBackgroundSource = true
            store.setSourceFiles([{
              id: 'retryable-background-source', name: 'background.md', text: '# background', enabled: false, status: 'idle',
              source: { kind: 'local', path: 'workspace:/docs/background.md' },
            }])
          },
        },
      })
    } catch (error) {
      retryableError = error
    }
    const retainedRetryableFiles = useGraphStore.getState().sourceFiles || []
    if (!retriedBackgroundSource || (retryableError as { code?: string; retryable?: boolean } | undefined)?.code !== 'SOURCE_FILES_MATERIALIZATION_STALE'
      || (retryableError as { retryable?: boolean } | undefined)?.retryable !== true
      || retainedRetryableFiles.length !== 1 || retainedRetryableFiles[0]?.source?.path !== 'workspace:/docs/background.md') {
      throw new Error('graph-owned materialization must receive a bounded retry signal without overwriting the newer inventory')
    }

    await assertActiveSourceLifecyclePublicationRetriesOnce()
  } finally {
    store.setSourceFiles(previousSourceFiles)
  }
}
