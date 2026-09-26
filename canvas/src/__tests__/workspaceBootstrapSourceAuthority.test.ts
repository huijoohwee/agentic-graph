import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeBootstrapWorkspaceSourceFiles } from '@/features/source-files/sourceFilesBootstrapStartup'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { resolveInitialWorkspaceStartupState } from '@/features/source-files/sourceFilesRuntimeStartup'

async function verifyLessonFilesAreReadyBeforeSourceBootstrapReturns() {
  useGraphStore.getState().resetAll()
  const activePath = '/docs/current.md'
  const text = '# Current authored source'
  const baseFs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    { path: activePath, parentPath: '/docs', kind: 'file', name: 'current.md', text, updatedAtMs: 1 },
  ] })
  const fs: WorkspaceFs = { ...baseFs, ensureSeed: async () => false }
  useMarkdownExplorerStore.getState().setActivePath(activePath)
  const before = JSON.stringify(useGraphStore.getState().sourceFiles)
  const startup = await resolveInitialWorkspaceStartupState({ fs })
  const files = startup.workspaceEntries.filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/python-lessons/'))
  if (files.length !== 4 || startup.activePath !== activePath || await fs.readFileText(activePath) !== text
    || JSON.stringify(useGraphStore.getState().sourceFiles) !== before) {
    throw new Error('Source startup must await lesson installation while preserving the authored document and Graph.')
  }
  const editedPath = '/docs/python-lessons/04-drone-flight-and-landing.py'
  const deletedPath = '/docs/python-lessons/01-variables-in-motion.py'
  await fs.writeFileText(editedPath, '# learner edit\nprint("飞行")\n')
  await fs.deleteEntry(deletedPath)
  await resolveInitialWorkspaceStartupState({ fs })
  if (await fs.readFileText(editedPath) !== '# learner edit\nprint("飞行")\n' || await fs.readFileText(deletedPath) !== null) {
    throw new Error('Source startup must retain edited and deleted learner files.')
  }
  const blockedFs: WorkspaceFs = {
    ...createMemoryWorkspaceFs({ initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'file', name: 'docs', text: 'retain me', updatedAtMs: 1 },
    ] }), ensureSeed: async () => false,
  }
  let rejected = false
  try { await resolveInitialWorkspaceStartupState({ fs: blockedFs }) } catch { rejected = true }
  if (!rejected || await blockedFs.readFileText('/docs') !== 'retain me') {
    throw new Error('A lesson-folder collision must reject startup without replacing existing bytes.')
  }
}

export async function testWorkspaceBootstrapRetriesGraphOwningMaterializationAfterActivePathDrift() {
  const { restore } = initJsdomHarness()
  try {
    await verifyLessonFilesAreReadyBeforeSourceBootstrapReturns()
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
