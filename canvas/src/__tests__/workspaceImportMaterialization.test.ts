import { useGraphStore } from '@/hooks/useGraphStore'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const fileEntry = (path: string, text: string, updatedAtMs = 1): WorkspaceEntry => ({
  path, text, updatedAtMs, kind: 'file', name: path.split('/').pop()!, parentPath: '/docs',
})

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
  } finally {
    store.setSourceFiles(previousSourceFiles)
  }
}

