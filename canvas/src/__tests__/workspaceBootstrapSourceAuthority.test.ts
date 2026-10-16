import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeBootstrapWorkspaceSourceFiles } from '@/features/source-files/sourceFilesBootstrapStartup'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { resolveInitialWorkspaceStartupState } from '@/features/source-files/sourceFilesRuntimeStartup'
import assert from 'node:assert/strict'
import type { SourceFile } from '@/hooks/store/types'
import { XR_PHYSICS_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'

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

type LateStartupSelectionCase = 'created' | 'canonical' | 'switch-list' | 'switch-read' | 'reselect-read' | 'churn-list' | 'churn-read' | 'missing' | 'deleted' | 'read-error' | 'clear-read' | 'starter'
async function verifyLateStartupSelection(mode: LateStartupSelectionCase): Promise<void> {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const { restore } = initJsdomHarness()
  const pathA = XR_PHYSICS_WORKSPACE_SEED_PATH, pathB = mode === 'canonical' ? '/docs/late-import.md' : '/notes/late-import.md', pathC = '/notes/newer-import.md'
  const textA = '# Initial startup source\n', textB = '# Late authored source\n', textC = '# Newer authored source\n'
  const paths = [pathA, pathB, pathC], sourceIndex = loadWorkspaceSourceIndex()
  const previousSources = paths.map(path => sourceIndex[path])
  const baseFs = createMemoryWorkspaceFs({ initialEntries: [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    { path: '/docs/python-lessons', parentPath: '/docs', kind: 'folder', name: 'python-lessons', updatedAtMs: 1 },
    { path: '/notes', parentPath: '/', kind: 'folder', name: 'notes', updatedAtMs: 1 },
    { path: pathA, parentPath: pathA.slice(0, pathA.lastIndexOf('/')) || '/', kind: 'file', name: pathA.split('/').at(-1)!, text: textA, updatedAtMs: 1 },
  ] })
  let releaseRead!: () => void, markReadStarted!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  const readStarted = new Promise<void>(resolve => { markReadStarted = resolve })
  const failure = new Error('Latest selected source read failed')
  let deferred = false, latePublished = false, switched = false, freshLists = 0, latestReads = 0, ownerWrites = 0, seedCalls = 0
  let latestSources: SourceFile[] = []
  const publish = (path: string, text: string) => {
    latestSources = [{ id: `local:${path}`, name: path.split('/').at(-1)!, text, enabled: true, status: 'idle',
      source: { kind: 'local', path: `workspace:${path}` } }]
    useGraphStore.setState({ sourceFiles: latestSources, markdownDocumentName: path.slice(1), markdownDocumentText: text })
    useMarkdownExplorerStore.getState().setActivePath(path)
  }
  const publishNewer = async () => {
    switched = true
    await baseFs.createFile({ parentPath: '/notes', name: 'newer-import.md', text: textC })
    publish(pathC, textC)
  }
  const changeSelection = () => {
    const next = useMarkdownExplorerStore.getState().activePath === pathB ? pathC : pathB
    publish(next, next === pathC ? textC : textB)
  }
  const fs: WorkspaceFs = { ...baseFs, ensureSeed: async () => { seedCalls += 1; return false },
    listEntries: async () => {
      const rows = await baseFs.listEntries()
      if (latePublished) {
        freshLists += 1
        if (!switched && mode === 'switch-list') await publishNewer()
        if (!switched && mode === 'deleted') { switched = true; await baseFs.deleteEntry(pathB) }
        if (mode === 'churn-list') changeSelection()
      }
      return rows
    },
    readFileText: async path => {
      if (mode !== 'starter' && path === pathA && !deferred) { deferred = true; markReadStarted(); await pendingRead }
      if (latePublished && (path === pathB || path === pathC)) {
        latestReads += 1
        if (mode === 'read-error') throw failure
        const observed = await baseFs.readFileText(path)
        if (mode === 'churn-read') changeSelection()
        if (!switched && mode === 'switch-read') await publishNewer()
        if (!switched && mode === 'reselect-read') {
          switched = true
          await baseFs.writeFileText(pathB, textC)
          useMarkdownExplorerStore.getState().setActivePath(pathA)
          publish(pathB, textC)
        }
        if (!switched && mode === 'clear-read') { switched = true; useMarkdownExplorerStore.getState().setActivePath(null) }
        return observed
      }
      return baseFs.readFileText(path)
    },
    writeFileText: async (...args) => { ownerWrites += 1; return baseFs.writeFileText(...args) },
    createFile: async args => { ownerWrites += 1; return baseFs.createFile(args) },
    createFolder: async args => { ownerWrites += 1; return baseFs.createFolder(args) },
    deleteEntry: async path => { ownerWrites += 1; return baseFs.deleteEntry(path) },
  }
  let settled: Promise<{ result?: Awaited<ReturnType<typeof resolveInitialWorkspaceStartupState>>; error?: unknown }> | undefined
  try {
    useGraphStore.getState().resetAll()
    for (const path of paths) setWorkspaceEntrySource(path, { kind: 'local' }, { persist: 'sync' })
    useMarkdownExplorerStore.getState().setActivePath(mode === 'starter' ? null : pathA)
    settled = resolveInitialWorkspaceStartupState({ fs }).then(result => ({ result }), error => ({ error }))
    if (mode !== 'starter') {
      await Promise.race([readStarted, settled.then(() => assert.fail('startup did not yield after capturing its old file list'))])
      ownerWrites = 0
      if (mode !== 'missing') await baseFs.createFile({ parentPath: pathB.slice(0, pathB.lastIndexOf('/')), name: 'late-import.md', text: textB })
      if (mode.startsWith('churn-')) await baseFs.createFile({ parentPath: '/notes', name: 'newer-import.md', text: textC })
      publish(pathB, textB)
      if (mode === 'canonical') useMarkdownExplorerStore.getState().setActivePath('/late-import.md')
      latePublished = true
      releaseRead()
    }
    const outcome = await settled
    if (mode === 'read-error') assert.equal(outcome.error, failure, 'the original filesystem error must escape')
    else if (mode === 'missing' || mode === 'deleted') assert.ok(outcome.error instanceof Error, 'a stable missing selected file must fail loudly')
    else if (mode.startsWith('churn-')) {
      assert.ok(outcome.error instanceof Error && /changed repeatedly/.test(outcome.error.message), 'selection churn must terminate loudly')
      assert.equal(outcome.result, undefined)
      assert.equal(freshLists, 3, 'only three fresh selection attempts are allowed')
      assert.equal(latestReads, mode === 'churn-read' ? 3 : 0, 'each changed observation is discarded without an extra read')
    }
    else {
      assert.equal(outcome.error, undefined)
      const expected = mode === 'starter' ? pathA : mode === 'clear-read' ? null : mode.startsWith('switch-') ? pathC : pathB
      assert.equal(outcome.result?.activePath, expected, 'startup must return the latest explicit selection instead of the old starter')
      assert.equal(useMarkdownExplorerStore.getState().activePath, expected, 'startup must not republish an older selection')
      if (mode === 'clear-read') assert.deepEqual(outcome.result?.workspaceEntries, [])
      if (mode === 'created' || mode === 'canonical' || mode.startsWith('switch-') || mode === 'reselect-read') {
        assert.ok(freshLists >= 1 && freshLists <= 3, 'late selection uses bounded fresh file observations')
        assert.ok(latestReads >= 1 && latestReads <= 3, 'selected bytes must come from direct bounded reads')
        if (mode === 'reselect-read') assert.ok(latestReads >= 2, 'same-path reselection must invalidate the earlier read')
        const returned = outcome.result?.workspaceEntries || []
        if (returned.length) assert.equal(returned.find(value => value.path === expected)?.text,
          expected === pathC || mode === 'reselect-read' ? textC : textB)
      }
    }
    if (mode !== 'starter') {
      const expectedPath = mode === 'clear-read' ? null : mode.startsWith('switch-') || mode.startsWith('churn-') ? pathC : pathB
      assert.equal(useMarkdownExplorerStore.getState().activePath, expectedPath)
      assert.equal(useGraphStore.getState().sourceFiles, latestSources, 'startup selection cannot overwrite imported source ownership')
      assert.equal(useGraphStore.getState().markdownDocumentText, latestSources[0].text)
    }
    if (mode === 'deleted') assert.equal(latestReads, 1, 'stale inline text cannot bypass direct deletion observation')
    assert.equal(ownerWrites, 0, 'selection recovery must not rewrite or create workspace files')
    if (mode === 'canonical') {
      const initialSeedCalls = seedCalls
      const result = await materializeBootstrapWorkspaceSourceFiles({ fs, startupState: outcome.result,
        existingSourceFiles: latestSources, sourcesByPath: {} })
      assert.ok(result.activePathKey)
      assert.equal(seedCalls, initialSeedCalls, 'canonical selection must materialize without restarting startup preparation')
      assert.equal(useMarkdownExplorerStore.getState().activePath, pathB)
      assert.equal(useGraphStore.getState().markdownDocumentName, pathB.slice(1))
      assert.equal(useGraphStore.getState().markdownDocumentText, textB)
    }
  } finally {
    releaseRead()
    await settled
    for (const [index, path] of paths.entries()) {
      invalidateCachedWorkspaceActiveEntrySnapshot(path)
      setWorkspaceEntrySource(path, previousSources[index] ?? null, { persist: 'sync' })
    }
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

async function verifyLateStartupSelections(): Promise<void> {
  const failures: string[] = []
  for (const mode of ['created', 'canonical', 'switch-list', 'switch-read', 'reselect-read', 'churn-list', 'churn-read', 'missing', 'deleted', 'read-error', 'clear-read', 'starter'] as const) {
    try { await verifyLateStartupSelection(mode); console.log(`Late startup selection ${mode}: PASS`) }
    catch (error) { failures.push(`${mode}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  assert.equal(failures.length, 0, `Late startup selection scenarios failed:\n${failures.join('\n')}`)
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
  await verifyLateStartupSelections()
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
