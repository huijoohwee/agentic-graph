import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeBootstrapWorkspaceSourceFiles } from '@/features/source-files/sourceFilesBootstrapStartup'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

export async function testWorkspaceBootstrapRetriesGraphOwningMaterializationAfterActivePathDrift() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const pathA = '/docs/first.md'
    const pathB = '/docs/canonical.md'
    const textA = '# First source'
    const textB = [
      '---',
      'title: Canonical source',
      'kgCanvasRenderMode: "3d"',
      'kgCanvas3dMode: "xr"',
      '---',
      '',
      '# Canonical source',
    ].join('\n')
    const baseFs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
        { path: pathA, parentPath: '/docs', kind: 'file', name: 'first.md', text: textA, updatedAtMs: 1 },
        { path: pathB, parentPath: '/docs', kind: 'file', name: 'canonical.md', text: textB, updatedAtMs: 1 },
      ],
    })
    let firstRead = true
    const fs: WorkspaceFs = {
      ...baseFs,
      // This workspace is already seeded; retry must read these owned files,
      // without discovering unrelated local or remote seed repositories.
      ensureSeed: async () => false,
      readFileText: async path => {
        if (firstRead && path === pathA) {
          firstRead = false
          useMarkdownExplorerStore.getState().setActivePath(pathB as never)
        }
        return baseFs.readFileText(path)
      },
    }
    useMarkdownExplorerStore.getState().setActivePath(pathA as never)
    const bootstrap = await materializeBootstrapWorkspaceSourceFiles({
      fs,
      existingSourceFiles: [],
      sourcesByPath: {},
      startupState: {
        activePath: pathA as never,
        workspaceEntries: [
          { path: pathA, parentPath: '/docs', kind: 'file', name: 'first.md', updatedAtMs: 1 },
          { path: pathB, parentPath: '/docs', kind: 'file', name: 'canonical.md', text: textB, updatedAtMs: 1 },
        ],
      },
    })
    const state = useGraphStore.getState()
    if (!bootstrap.activePathKey || state.markdownDocumentName !== 'docs/canonical.md' || state.markdownDocumentText !== textB) {
      throw new Error(`expected drift retry to publish only the latest graph-owning source, got ${JSON.stringify({
        activePathKey: bootstrap.activePathKey,
        markdownDocumentName: state.markdownDocumentName,
        markdownDocumentText: state.markdownDocumentText,
      })}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(null)
    restore()
  }
}
