import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeBootstrapWorkspaceSourceFiles } from '@/features/source-files/sourceFilesBootstrapStartup'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { resolveInitialWorkspaceStartupState } from '@/features/source-files/sourceFilesRuntimeStartup'
import assert from 'node:assert/strict'
import type { SourceFile } from '@/hooks/store/types'

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
  // A previously materialized source may intentionally return an empty startup snapshot.
  const files = (await fs.listEntries()).filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/python-lessons/'))
  if (files.length !== 4 || startup.activePath !== activePath || await fs.readFileText(activePath) !== text
    || JSON.stringify(useGraphStore.getState().sourceFiles) !== before) {
    throw new Error(`Source startup must await lesson installation while preserving the authored document and Graph: ${JSON.stringify({ lessonCount: files.length, selectedPath: startup.activePath, authoredText: await fs.readFileText(activePath), sourceFilesUnchanged: JSON.stringify(useGraphStore.getState().sourceFiles) === before, sourcePaths: useGraphStore.getState().sourceFiles.map(file => file.source?.path) })}`)
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
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
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
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

type SupersessionCase = 'selection' | 'unsaved' | 'stale-fs' | 'failure' | 'churn'
async function verifyMaterializationSupersession(mode: SupersessionCase, emptyDocument = false): Promise<void> {
  const { restore } = initJsdomHarness()
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const pathA = '/docs/first.md', pathB = '/docs/second.md'
  const preset = '---\nkgCanvasRenderMode: "2d"\nkgCanvas2dRenderer: "sequence"\n---\n'
  const textA = `${preset}# First source`, textB = `${preset}# Second source`, unsaved = '# Unsaved source'
  const entries = [
    { path: pathA, parentPath: '/docs', kind: 'file' as const, name: 'first.md', text: textA, updatedAtMs: 1 },
    { path: pathB, parentPath: '/docs', kind: 'file' as const, name: 'second.md', text: textB, updatedAtMs: 1 },
  ]
  const baseFs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 }, ...entries,
  ] })
  const fs: WorkspaceFs = { ...baseFs, ensureSeed: async () => false }
  const imported: SourceFile = { id: 'imported-companion', name: 'companion.md', text: '# Imported companion', enabled: false, status: 'idle',
    source: { kind: 'local', path: 'workspace:/docs/companion.md' } }
  const failure = new Error('Document application failed')
  let applications = 0
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ markdownDocumentName: emptyDocument ? null : 'before.md', markdownDocumentText: emptyDocument ? '' : '# Before',
      setActiveMarkdownDocument: async payload => {
        applications += 1
        if (mode === 'failure') throw failure
        if (applications === 1 || mode === 'churn') {
          const nextPath = mode === 'unsaved' ? pathA : useMarkdownExplorerStore.getState().activePath === pathA ? pathB : pathA
          useMarkdownExplorerStore.getState().setActivePath(nextPath)
          useGraphStore.setState({ sourceFiles: [...useGraphStore.getState().sourceFiles.filter(file => file.id !== imported.id), imported] })
          if (mode === 'unsaved' || mode === 'stale-fs') {
            useGraphStore.setState({ markdownDocumentName: nextPath.slice(1), markdownDocumentText: unsaved })
          }
          return false
        }
        useGraphStore.setState({ markdownDocumentName: payload.name, markdownDocumentText: payload.text, markdownDocumentApplyViewPreset: true })
        return true
      } })
    useMarkdownExplorerStore.getState().setActivePath(pathA)
    const operation = materializeBootstrapWorkspaceSourceFiles({ fs, existingSourceFiles: [], sourcesByPath: {},
      startupState: { activePath: pathA, workspaceEntries: entries } })
    if (mode === 'selection') {
      const result = await operation
      assert.ok(result.activePathKey)
      assert.equal(useGraphStore.getState().markdownDocumentName, pathB.slice(1))
      assert.equal(useGraphStore.getState().markdownDocumentText, textB)
      assert.ok(result.sourceFiles.some(file => file.id === imported.id), 'retry must retain the concurrent import')
      assert.equal(applications, 2)
    } else if (mode === 'failure') {
      await assert.rejects(operation, error => error === failure)
      assert.equal(applications, 1, 'genuine failures are never retried')
    } else if (mode === 'churn') {
      await assert.rejects(operation, /changed repeatedly during startup/)
      assert.equal(applications, 3, 'selection churn must stop at the existing three-attempt bound')
    } else {
      await assert.rejects(operation, error => (error as { code?: string }).code === 'SOURCE_FILES_MATERIALIZATION_STALE')
      assert.equal(useGraphStore.getState().markdownDocumentText, unsaved)
      assert.equal(applications, 1, 'newer document bytes must never be reapplied from stale filesystem text')
    }
  } finally {
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

export async function testWorkspaceBootstrapRetriesInFlightSelectionSupersession() {
  await verifyMaterializationSupersession('selection')
  await verifyMaterializationSupersession('selection', true)
}
export async function testWorkspaceBootstrapPreservesUnsavedDocumentsAcrossSupersession() {
  await verifyMaterializationSupersession('unsaved')
  await verifyMaterializationSupersession('stale-fs')
}
export async function testWorkspaceBootstrapKeepsGenuineMaterializationFailuresLoud() { await verifyMaterializationSupersession('failure') }
export async function testWorkspaceBootstrapBoundsInFlightSelectionChurn() { await verifyMaterializationSupersession('churn') }

async function verifyBootstrapCancellation(phase: 'read' | 'document') {
  const { restore } = initJsdomHarness()
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const pathA = '/docs/first.md', pathB = '/docs/second.md'
  const textA = '# First source', textB = '# Second source'
  const baseFs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    { path: pathA, parentPath: '/docs', kind: 'file', name: 'first.md', text: textA, updatedAtMs: 1 },
    { path: pathB, parentPath: '/docs', kind: 'file', name: 'second.md', text: textB, updatedAtMs: 1 },
  ] })
  let releaseRead!: () => void, markReadStarted!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  const readStarted = new Promise<void>(resolve => { markReadStarted = resolve })
  let seedCalls = 0, applications = 0, deferred = false
  const fs: WorkspaceFs = { ...baseFs,
    ensureSeed: async () => { seedCalls += 1; return false },
    readFileText: async path => {
      if (phase === 'read' && path === pathA && !deferred) { deferred = true; markReadStarted(); await pendingRead }
      return baseFs.readFileText(path)
    },
  }
  const controller = new AbortController(), reason = new Error('Source bootstrap owner disposed')
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ setActiveMarkdownDocument: async payload => {
      applications += 1
      if (phase === 'document') { markReadStarted(); await pendingRead; return false }
      useGraphStore.setState({ markdownDocumentName: payload.name, markdownDocumentText: payload.text, markdownDocumentApplyViewPreset: true })
      return true
    } })
    useMarkdownExplorerStore.getState().setActivePath(pathA)
    const operation = materializeBootstrapWorkspaceSourceFiles({ fs, existingSourceFiles: [], sourcesByPath: {}, signal: controller.signal,
      startupState: { activePath: pathA, workspaceEntries: [
        { path: pathA, parentPath: '/docs', kind: 'file', name: 'first.md', updatedAtMs: 1, ...(phase === 'document' ? { text: textA } : {}) },
      ] } })
    await readStarted
    controller.abort(reason)
    useMarkdownExplorerStore.getState().setActivePath(pathB)
    releaseRead()
    await assert.rejects(operation, error => error === reason, 'disposal must retain its original abort reason')
    assert.equal(seedCalls, 0, 'a disposed owner must not prepare another selection')
    assert.equal(applications, phase === 'read' ? 0 : 1, 'a disposed owner must not start a retry application')
    assert.equal(useMarkdownExplorerStore.getState().activePath, pathB)
  } finally {
    releaseRead()
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

export async function testWorkspaceBootstrapCancellationStopsSupersessionRetry() {
  await verifyBootstrapCancellation('read')
  await verifyBootstrapCancellation('document')
}
