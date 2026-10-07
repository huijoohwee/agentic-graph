import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeActiveWorkspaceEntryIntoSourceFiles, isMaterializedWorkspaceSourceProofCurrent } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import type { SourceFile } from '@/hooks/store/types'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import { composeGraphFromSourceLayers } from '@/lib/graph/sourceLayers'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'
import { listParsers, registerParser } from '@/features/parsers/registry'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { parseAndApplySourceFile, refreshPersistedSourceFilesForCurrentParseIdentity } from '@/features/source-files/sourceFilesParseRuntime'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'

const path = '/notes/new-local-document.md'
const name = 'notes/new-local-document.md'
const text = '# Newly imported local document\n\nExact authored bytes 保留.\n'
const stale = (error: unknown) => (error as { code?: string })?.code === 'SOURCE_FILES_MATERIALIZATION_STALE'
type Request = NonNullable<Parameters<typeof materializeActiveWorkspaceEntryIntoSourceFiles>[0]>
type Document = { markdownDocumentName: string | null; markdownDocumentText: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function fixture(run: (f: {
  initial: SourceFile[]; request: Request; applications: Document[]; reads: string[]; writes: string[]
  read: (operation: (number: number) => Promise<string | null>) => void
  start: (publish?: () => void) => ReturnType<typeof materializeActiveWorkspaceEntryIntoSourceFiles>
}) => Promise<void>) {
  const graph = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const { restore } = initJsdomHarness()
  const initial: SourceFile[] = [
    { id: 'retained-inactive', name: 'retained.md', text: '# Retained authored text\n', enabled: false,
      status: 'idle', source: { kind: 'local', path: 'workspace:/notes/retained.md' } },
    { id: 'empty-inactive', name: 'empty.md', text: '', enabled: false, status: 'idle',
      source: { kind: 'local', path: 'workspace:/notes/empty.md' } },
  ]
  const entry: WorkspaceEntry = { path, parentPath: '/notes', name: 'new-local-document.md', kind: 'file', text, updatedAtMs: 1 }
  const applications: Document[] = [], reads: string[] = [], writes: string[] = []
  let read = async (_number: number): Promise<string | null> => text
  const fs: WorkspaceFs = {
    ensureSeed: async () => false, listEntries: async () => [entry],
    readFileText: async requested => { reads.push(requested); return read(reads.length) },
    writeFileText: async requested => { writes.push(requested) },
    createFile: async () => '/unused.md', createFolder: async () => '/unused', deleteEntry: async () => undefined,
  }
  const request: Request = { fs, activePathOverride: path, sourceFilesSnapshot: initial }
  useGraphStore.setState({ sourceFiles: initial, markdownDocumentName: 'previous.md', markdownDocumentText: '# Previous document\n',
    markdownDocumentApplyViewPreset: true, setActiveMarkdownDocument: async payload => {
      const document = { markdownDocumentName: payload.name, markdownDocumentText: payload.text }
      applications.push(document)
      useGraphStore.setState({ ...document, markdownDocumentApplyViewPreset: true })
      return true
    } })
  useMarkdownExplorerStore.getState().setActivePath(path)
  try {
    await run({ initial, request, applications, reads, writes, read: operation => { read = operation },
      start: (publish = () => useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text })) => {
        const pending = materializeActiveWorkspaceEntryIntoSourceFiles(request)
        // The passive resolver has yielded without finding this newly imported source.
        publish()
        return pending
      } })
  } finally {
    invalidateCachedWorkspaceActiveEntrySnapshot(path)
    useGraphStore.setState(graph, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

for (const prior of ['absent', 'different'] as const) test(`passive source read joins the requested document published over ${prior} prior document`, async () => fixture(async f => {
  if (prior === 'absent') useGraphStore.setState({ markdownDocumentName: null, markdownDocumentText: '' })
  const proof = await f.start()
  assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
  const current = useGraphStore.getState()
  assert.equal(current.markdownDocumentName, name)
  assert.equal(current.markdownDocumentText, text)
  assert.equal(current.sourceFiles.length, 3)
  for (const retained of f.initial) assert.equal(current.sourceFiles.find(file => file.id === retained.id), retained)
  assert.equal(current.sourceFiles.find(file => file.source?.path === `workspace:${path}`)?.text, text)
  assert.deepEqual(f.applications, [], 'the already-published native document does not need another application')
  assert.ok(f.reads.length >= 3 && f.reads.length <= 5, 'admission and publication independently verify local bytes')
  assert.ok(f.reads.every(requested => requested === path))
  assert.deepEqual(f.writes, [])
}))

const graphImportChanges = ['absent', 'different', 'exact', 'same-path draft', 'unnamed draft', 'unnamed whitespace', 'edited document',
  'selection', 'source edit', 'source addition', 'source lifecycle', 'duplicate ID', 'duplicate path',
  'persisted mismatch', 'persisted deletion', 'persisted read error', 'verification edit', 'verification selection',
  'verification inventory', 'verification preset', 'second exact publication'] as const
for (const change of graphImportChanges) test(`non-Markdown graph import retains exact document authority: ${change}`, async () => {
  const graph = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState(), env = initJsdomHarness()
  const activePath = '/notes/learning.py', activeName = 'notes/learning.py', body = 'print(42)\n'
  const file: SourceFile = { id: 'python-convergence', name: activeName, text: body, enabled: true, status: 'idle',
    source: { kind: 'local', path: `workspace:${activePath}` } }
  const sources = [file], entered = deferred<void>(), release = deferred<void>(), failure = new Error('Persisted Python read failed')
  const accept = ['absent', 'different', 'exact'].includes(change)
  let reads = 0, parses = 0, idleCalls = 0, authoritative = useGraphStore.getState()
  const idle = Object.getOwnPropertyDescriptor(globalThis, 'requestIdleCallback')
  Object.defineProperty(globalThis, 'requestIdleCallback', { configurable: true, value: (callback: () => void) => {
    idleCalls++
    queueMicrotask(() => {
      if (idleCalls === 2 && change === 'second exact publication') {
        useGraphStore.setState({ markdownDocumentName: activePath }); authoritative = useGraphStore.getState()
      }
      callback()
    })
    return idleCalls
  } })
  ensureBuiltInParsersRegistered()
  const parsers = listParsers(), parser = parsers.find(value => String(value.id) === 'python')!
  for (const spec of parsers) registerParser(spec === parser ? { ...parser,
    parseAsync: async (name, text) => { parses++; entered.resolve(); await release.promise; return parser.parse(name, text) } } : spec)
  const entry: WorkspaceEntry = { path: activePath, parentPath: '/notes', name: 'learning.py', kind: 'file', text: body, updatedAtMs: 1 }
  const fs: WorkspaceFs = { ensureSeed: async () => false, listEntries: async () => [entry], readFileText: async () => {
    reads++
    if (change === 'persisted read error') throw failure
    if (change === 'verification edit') useGraphStore.setState({ markdownDocumentText: 'newer editor bytes\n' })
    if (change === 'verification selection') useMarkdownExplorerStore.getState().setActivePath('/notes/other.py')
    if (change === 'verification inventory') useGraphStore.setState({ sourceFiles: sources.slice() })
    if (change === 'verification preset') useGraphStore.setState({ markdownDocumentApplyViewPreset: true })
    authoritative = useGraphStore.getState()
    return change === 'persisted mismatch' ? 'print(43)\n' : change === 'persisted deletion' ? null : body
  }, writeFileText: async () => assert.fail('materialization cannot write source'), createFile: async () => '/unused',
    createFolder: async () => '/unused', deleteEntry: async () => assert.fail('materialization cannot delete source') }
  useGraphStore.setState({ sourceFiles: sources, markdownDocumentName: ['absent', 'unnamed draft', 'unnamed whitespace'].includes(change) ? null
    : change === 'same-path draft' || change === 'exact' ? activeName : 'previous.md',
    markdownDocumentText: change === 'absent' ? '' : change === 'unnamed whitespace' ? ' \n' : change === 'exact' ? body : '# Prior document or draft\n',
    markdownDocumentApplyViewPreset: false })
  useMarkdownExplorerStore.getState().setActivePath(activePath)
  const operation = materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: activePath, fs, applyToGraph: true,
    premergedSourceFiles: sources, activeWorkspaceEntriesSnapshot: [entry], sourcesByPath: {} })
  const settled = operation.then(proof => ({ proof, error: null }), error => ({ proof: null, error }))
  try {
    const boundary = await Promise.race([entered.promise.then(() => 'parser'), settled.then(() => 'settled')])
    if (boundary === 'parser') {
      useGraphStore.setState({ markdownDocumentName: activeName, markdownDocumentText: change === 'edited document' ? 'print(99)\n' : body })
      if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/notes/other.py')
      if (change === 'source edit' || change === 'source lifecycle') useGraphStore.setState({ sourceFiles: [{ ...file,
        ...(change === 'source edit' ? { text: 'print(99)\n' } : { status: 'loading' as const }) }] })
      if (change === 'source addition' || change === 'duplicate ID' || change === 'duplicate path') useGraphStore.setState({ sourceFiles: [file,
        { ...file, id: change === 'duplicate ID' ? file.id : 'another', source: change === 'duplicate path' ? file.source : { kind: 'local', path: 'workspace:/notes/another.py' } }] })
    }
    authoritative = useGraphStore.getState()
    release.resolve()
    const result = await settled, current = useGraphStore.getState()
    if (accept) {
      assert.equal(result.error, null)
      assert.ok(result.proof && isMaterializedWorkspaceSourceProofCurrent(result.proof))
      assert.equal(current.markdownDocumentName, activeName); assert.equal(current.markdownDocumentText, body)
      assert.equal(current.sourceFiles[0].text, body); assert.equal(current.sourceFiles[0].status, 'parsed')
      assert.equal(parses, 1); assert.equal(reads, change === 'exact' ? 0 : 1)
      assert.equal(idleCalls, change === 'exact' ? 1 : 2, 'only an admitted convergence restarts import, reusing its completed parser result')
    } else {
      assert.ok(change === 'persisted read error' ? result.error === failure : stale(result.error), String(result.error))
      assert.equal(current.sourceFiles, authoritative.sourceFiles)
      assert.equal(current.markdownDocumentName, authoritative.markdownDocumentName)
      assert.equal(current.markdownDocumentText, authoritative.markdownDocumentText)
      assert.equal(current.markdownDocumentApplyViewPreset, authoritative.markdownDocumentApplyViewPreset)
      assert.equal(current.graphData, authoritative.graphData); assert.equal(current.canvas2dRenderer, authoritative.canvas2dRenderer)
      assert.equal(useMarkdownExplorerStore.getState().activePath, change === 'selection' || change === 'verification selection' ? '/notes/other.py' : activePath)
      assert.ok(parses <= 1 && reads <= 1 && idleCalls <= 2, 'a second drift cannot retry or reparse')
      if (change === 'second exact publication') { assert.equal(reads, 1); assert.equal(idleCalls, 2) }
    }
  } finally { release.resolve(); await settled; for (const spec of parsers) registerParser(spec)
    if (idle) Object.defineProperty(globalThis, 'requestIdleCallback', idle); else Reflect.deleteProperty(globalThis, 'requestIdleCallback')
    useGraphStore.setState(graph, true); useMarkdownExplorerStore.setState(explorer, true); env.restore() }
})

test('non-Markdown graph import never retries after equivalent source publication retains its array', async () => {
  const graph = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState(), env = initJsdomHarness()
  const activePath = '/notes/published.py', activeName = 'notes/published.py', body = 'print(1)\n'
  const file: SourceFile = { id: 'published-python', name: activeName, text: body, enabled: true, status: 'parsed',
    source: { kind: 'local', path: `workspace:${activePath}` }, parsedParserId: 'python', parsedGraphRevision: 0,
    parsedTextHash: buildSourceFileParseIdentityHash({ cacheNamespace: `workspace-import:${activePath}`, name: activeName, text: body }),
    parsedGraphData: { type: 'Graph', nodes: [{ id: 'python-module', label: 'published', type: 'module', properties: {} }], edges: [] } }
  const sources = [file], entry: WorkspaceEntry = { path: activePath, parentPath: '/notes', name: 'published.py', kind: 'file', text: body, updatedAtMs: 1 }
  let reads = 0, publications = 0
  const fs: WorkspaceFs = { ensureSeed: async () => false, listEntries: async () => [entry], readFileText: async () => { reads++; return body },
    writeFileText: async () => assert.fail('no source writes'), createFile: async () => '/unused', createFolder: async () => '/unused', deleteEntry: async () => undefined }
  useGraphStore.setState({ sourceFiles: sources, markdownDocumentName: 'previous.md', markdownDocumentText: '# Previous',
    markdownDocumentApplyViewPreset: false, setSourceFiles: next => {
      graph.setSourceFiles(next); publications++
      assert.equal(useGraphStore.getState().sourceFiles, sources, 'equivalent native publication retains the original array')
      useGraphStore.setState({ markdownDocumentName: activeName, markdownDocumentText: body })
    } })
  useMarkdownExplorerStore.getState().setActivePath(activePath)
  try {
    await assert.rejects(materializeActiveWorkspaceEntryIntoSourceFiles({ activePathOverride: activePath, fs, applyToGraph: true,
      premergedSourceFiles: sources, activeWorkspaceEntriesSnapshot: [entry], sourcesByPath: {} }), stale)
    assert.equal(publications, 1); assert.equal(reads, 0, 'publication is not read-only merely because its source array is unchanged')
    assert.equal(useGraphStore.getState().markdownDocumentText, body)
    assert.equal(useGraphStore.getState().graphData, graph.graphData)
    assert.equal(useGraphStore.getState().canvas2dRenderer, graph.canvas2dRenderer)
  } finally { useGraphStore.setState(graph, true); useMarkdownExplorerStore.setState(explorer, true); env.restore() }
})

test('passive convergence discards stale prepared active and inactive entries', async () => fixture(async f => {
  f.request.workspaceEntries = f.initial.map(file => ({ path: file.source!.path!.slice('workspace:'.length), parentPath: '/notes',
    name: file.name, kind: 'file' as const, text: '# Stale persisted-looking inactive bytes\n', updatedAtMs: 1 }))
  f.request.premergedSourceFiles = [...f.initial, { ...f.initial[0], id: 'stale-active', name,
    text: '# Stale prepared active bytes\n', source: { kind: 'local', path: `workspace:${path}` } }]
  const proof = await f.start()
  assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
  const sources = useGraphStore.getState().sourceFiles
  for (const retained of f.initial) assert.equal(sources.find(file => file.id === retained.id), retained)
  assert.equal(sources.find(file => file.source?.path === `workspace:${path}`)?.text, text)
  assert.equal(sources.some(file => file.id === 'stale-active'), false)
  assert.deepEqual(f.writes, [])
}))

test('passive convergence rejects an unnamed unsaved draft', async () => fixture(async f => {
  useGraphStore.setState({ markdownDocumentName: '  ', markdownDocumentText: '# Unnamed unsaved draft\n' })
  await assert.rejects(f.start(), stale)
  assert.deepEqual(f.reads, [])
  assert.deepEqual(f.applications, [])
}))

test('passive convergence rejects a competing generated active ID before publication', async () => fixture(async f => {
  f.initial[0] = { ...f.initial[0], id: `ws:${hashStringToHex(`workspace:${path}`)}` }
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.initial)
  assert.equal(useGraphStore.getState().sourceFiles[0].text, '# Retained authored text\n')
  assert.deepEqual(f.applications, [])
}))

for (const previousText of ['', '# Unsaved requested draft\n']) test(`passive convergence rejects replacement of a same-path ${previousText ? 'unsaved' : 'empty'} draft`, async () => fixture(async f => {
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: previousText })
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.initial)
  assert.deepEqual(f.reads, [])
  assert.deepEqual(f.applications, [])
}))

for (const change of ['source addition', 'source text', 'source lifecycle', 'duplicate ID', 'existing active', 'wrong document', 'selection', 'graph owner'] as const) {
  test(`passive convergence rejects ${change} authority`, async () => fixture(async f => {
    if (change === 'graph owner') f.request.applyToGraph = true
    if (change === 'duplicate ID') f.initial.push({ ...f.initial[0], source: { kind: 'local', path: 'workspace:/notes/duplicate.md' } })
    if (change === 'existing active') f.initial.push({ ...f.initial[0], id: 'existing-active', name, source: { kind: 'local', path: `workspace:${path}` } })
    await assert.rejects(f.start(() => {
      useGraphStore.setState({ markdownDocumentName: change === 'wrong document' ? 'other/new-local-document.md' : name, markdownDocumentText: text })
      if (change === 'source addition') useGraphStore.setState({ sourceFiles: [...f.initial, { ...f.initial[0], id: 'concurrent', name: 'concurrent.md' }] })
      if (change === 'source text' || change === 'source lifecycle') useGraphStore.setState({ sourceFiles: f.initial.map((file, index) => index ? file
        : { ...file, ...(change === 'source text' ? { text: '# Later edit\n' } : { status: 'loading' as const }) }) })
      if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/other.md')
    }), stale)
    assert.deepEqual(f.applications, [])
    assert.deepEqual(f.writes, [])
  }))
}

for (const persisted of [null, '# Different persisted bytes\n', 'error'] as const) test(`passive convergence rejects persisted ${persisted === null ? 'deletion' : persisted === 'error' ? 'read error' : 'byte mismatch'}`, async () => fixture(async f => {
  const failure = new Error('Local read failed')
  f.read(async () => { if (persisted === 'error') throw failure; return persisted })
  await assert.rejects(f.start(), error => persisted === 'error' ? error === failure : stale(error))
  assert.equal(useGraphStore.getState().sourceFiles, f.initial)
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
}))

for (const change of ['inventory', 'document name', 'document text', 'preset', 'selection'] as const) test(`passive convergence rejects ${change} changes during fresh persisted verification`, async () => fixture(async f => {
  const entered = deferred<void>(), release = deferred<string | null>()
  f.read(async () => { entered.resolve(); return release.promise })
  const pending = f.start()
  const settled = pending.then(() => null, error => error)
  await Promise.race([entered.promise, settled.then(error => { assert.fail(`expected a bounded verification read, received ${String(error)}`) })])
  if (change === 'inventory') useGraphStore.setState({ sourceFiles: f.initial.slice() })
  if (change === 'document name') useGraphStore.setState({ markdownDocumentName: 'other.md' })
  if (change === 'document text') useGraphStore.setState({ markdownDocumentText: '# New unsaved edit\n' })
  if (change === 'preset') useGraphStore.setState({ markdownDocumentApplyViewPreset: false })
  if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/other.md')
  const current = useGraphStore.getState()
  release.resolve(text)
  assert.ok(stale(await settled))
  assert.equal(useGraphStore.getState().sourceFiles, current.sourceFiles)
  assert.equal(useGraphStore.getState().markdownDocumentText, current.markdownDocumentText)
  assert.equal(f.reads.length, 1)
  assert.deepEqual(f.applications, [])
}))

test('passive convergence preserves a preset change during the second persisted read', async () => fixture(async f => {
  f.read(async number => {
    if (number === 2) useGraphStore.setState({ markdownDocumentApplyViewPreset: false })
    return text
  })
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.initial)
  assert.equal(useGraphStore.getState().markdownDocumentApplyViewPreset, false)
  assert.equal(f.reads.length, 2)
  assert.deepEqual(f.applications, [])
}))

test('passive convergence does not retry a second source-read drift', async () => fixture(async f => {
  f.read(async number => {
    if (number === 2) useGraphStore.setState({ markdownDocumentText: '# Newer requested edit\n' })
    return text
  })
  await assert.rejects(f.start(), stale)
  assert.equal(f.reads.length, 2)
  assert.equal(useGraphStore.getState().markdownDocumentText, '# Newer requested edit\n')
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
}))

const bootstrapChanges = ['disabled append', 'edited existing', 'removed existing', 'reordered existing', 'parsed graph replacement',
  'duplicate ID', 'duplicate path', 'enabled append', 'document draft', 'preset', 'selection', 'second append',
  'selection during retry', 'preset during retry', 'second append during retry',
  'changed persisted bytes', 'deleted persisted bytes', 'persisted read error'] as const

for (const change of bootstrapChanges) test(`unapplied graph bootstrap settles only a bounded disabled append: ${change}`, async () => fixture(async f => {
  const previousSource = loadWorkspaceSourceIndex()[path] || null
  setWorkspaceEntrySource(path, { kind: 'local', originalName: 'new-local-document.md' })
  f.initial.push({ id: 'bootstrap-active', name, text, enabled: true, status: 'idle',
    source: { kind: 'local', path: `workspace:${path}` } })
  Object.assign(f.request, { applyToGraph: true, premergedSourceFiles: f.initial, sourcesByPath: {} })
  useGraphStore.setState({ markdownDocumentName: null, markdownDocumentText: '', markdownDocumentApplyViewPreset: true })
  const entered = deferred<void>(), release = deferred<void>()
  const persistedReadError = new Error('Persisted bootstrap read failed')
  let publicationReads = 0, before: SourceFile[] = [], concurrent: SourceFile[] = []
  const appended: SourceFile = { id: 'later-disabled-import', name: 'later.md', text: '# Later local import\n',
    enabled: false, status: 'idle', source: { kind: 'local', path: 'workspace:/notes/later.md' } }
  f.read(async () => {
    const state = useGraphStore.getState()
    if (state.sourceFiles.find(file => file.id === 'bootstrap-active')?.status !== 'parsed') return text
    publicationReads++
    if (publicationReads === 1) {
      assert.equal(state.markdownDocumentName, null, 'the parser must finish before any document is published')
      assert.equal(state.markdownDocumentText, '')
      assert.deepEqual(f.applications, [])
      before = state.sourceFiles
      entered.resolve()
      await release.promise
    }
    if ((publicationReads === 2 && change === 'second append') || (publicationReads === 3 && change === 'second append during retry')) {
      concurrent = [...concurrent, { ...appended, id: 'second-import', name: 'second.md',
        source: { kind: 'local', path: 'workspace:/notes/second.md' } }]
      useGraphStore.setState({ sourceFiles: concurrent })
    }
    if (publicationReads === 2) {
      if (change === 'changed persisted bytes') return '# Newer saved document\n'
      if (change === 'deleted persisted bytes') return null
      if (change === 'persisted read error') throw persistedReadError
    }
    if (publicationReads === 3 && change === 'selection during retry') useMarkdownExplorerStore.getState().setActivePath('/notes/new-selection.md')
    if (publicationReads === 3 && change === 'preset during retry') useGraphStore.setState({ markdownDocumentApplyViewPreset: false })
    return text
  })
  const settled = f.start(() => {}).then(proof => ({ proof, error: null }), error => ({ proof: null, error }))
  try {
    await Promise.race([entered.promise, settled.then(result => assert.fail(`expected post-parser read, received ${String(result.error)}`))])
    concurrent = [...before, appended]
    if (change === 'edited existing') concurrent[0] = { ...before[0], text: '# New unsaved source bytes\n' }
    if (change === 'removed existing') concurrent.splice(0, 1)
    if (change === 'reordered existing') [concurrent[0], concurrent[1]] = [concurrent[1], concurrent[0]]
    if (change === 'parsed graph replacement') concurrent[0] = { ...before[0], parsedGraphData: { type: 'Graph', nodes: [], edges: [] } }
    if (change === 'duplicate ID') concurrent[concurrent.length - 1] = { ...appended, id: before[0].id }
    if (change === 'duplicate path') concurrent[concurrent.length - 1] = { ...appended, source: before[0].source }
    if (change === 'enabled append') concurrent[concurrent.length - 1] = { ...appended, enabled: true }
    useGraphStore.setState({ sourceFiles: concurrent })
    if (change === 'document draft') useGraphStore.setState({ markdownDocumentText: '# Unsaved document draft\n' })
    if (change === 'preset') useGraphStore.setState({ markdownDocumentApplyViewPreset: false })
    if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/notes/new-selection.md')
    const document = useGraphStore.getState()
    release.resolve()
    const result = await settled, current = useGraphStore.getState()
    if (change === 'disabled append') {
      assert.equal(result.error, null)
      assert.ok(result.proof && isMaterializedWorkspaceSourceProofCurrent(result.proof))
      assert.deepEqual(f.applications, [{ markdownDocumentName: name, markdownDocumentText: text }])
      assert.equal(current.markdownDocumentText, text)
      assert.equal(current.sourceFiles.length, concurrent.length)
      assert.equal(current.sourceFiles.find(file => file.id === appended.id), appended)
      for (const file of before.filter(file => !file.enabled)) assert.equal(current.sourceFiles.find(value => value.id === file.id), file)
      assert.equal(publicationReads, 3, 'one interrupted read, one fresh-byte fence and exactly one retry')
    } else {
      if (change === 'persisted read error') assert.equal(result.error, persistedReadError)
      else assert.ok(stale(result.error), String(result.error))
      assert.equal(current.sourceFiles, concurrent, 'new inventory remains authoritative on rejection')
      assert.equal(current.markdownDocumentName, document.markdownDocumentName)
      assert.equal(current.markdownDocumentText, document.markdownDocumentText)
      assert.equal(current.markdownDocumentApplyViewPreset, change === 'preset during retry' ? false : document.markdownDocumentApplyViewPreset)
      assert.deepEqual(f.applications, [], 'a rejected attempt must not publish a document')
      assert.equal(publicationReads, change.includes('during retry') ? 3
        : ['second append', 'changed persisted bytes', 'deleted persisted bytes', 'persisted read error'].includes(change) ? 2 : 1,
      'the exact targeted read must reject without another retry')
    }
    assert.deepEqual(f.writes, [])
  } finally {
    release.resolve(); await settled
    setWorkspaceEntrySource(path, previousSource)
  }
}))


async function canonicalWorkspaceParseFixture(label: string, paused: boolean, run: (f: {
  file: SourceFile; fs: WorkspaceFs; entry: WorkspaceEntry; calls: { name: string; text: string }[]; statuses: string[]
  entered: Promise<void>; secondEntered: Promise<void>; release: () => void; source: () => SourceFile; import: () => Promise<unknown>
}) => Promise<void>) {
  const graph = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState(), env = initJsdomHarness()
  ensureBuiltInParsersRegistered()
  const parser = listParsers().find(value => String(value.id) === 'markdown')!
  const activePath = `/notes/nested/${label}/same.md`, body = `---\nkgCanvas2dRenderer: "sequence"\n---\n# Canonical ${label}\n\nPreserve graph source paths.\n`
  const file: SourceFile = { id: `canonical-${label}`, name: 'same.md', text: body, enabled: true, status: 'idle',
    source: { kind: 'local', path: `workspace:${activePath}` } }
  const entry: WorkspaceEntry = { path: activePath, parentPath: activePath.slice(0, activePath.lastIndexOf('/')), name: file.name, kind: 'file', text: body, updatedAtMs: 1 }
  const fs: WorkspaceFs = { ensureSeed: async () => false, listEntries: async () => [entry], readFileText: async () => body,
    writeFileText: async () => assert.fail('no source writes'), createFile: async () => '/unused', createFolder: async () => '/unused', deleteEntry: async () => undefined }
  const entered = deferred<void>(), secondEntered = deferred<void>(), gate = deferred<void>(), calls: { name: string; text: string }[] = [], statuses: string[] = []
  registerParser({ ...parser, parseAsync: async (name, text) => { calls.push({ name, text }); entered.resolve(); if (calls.length === 2) secondEntered.resolve(); if (paused) await gate.promise
    return parser.parseAsync ? parser.parseAsync(name, text) : parser.parse(name, text) } })
  useGraphStore.setState({ sourceFiles: [file], markdownDocumentName: activePath.slice(1), markdownDocumentText: body,
    workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: false, canvasRenderMode: '2d', canvas2dRenderer: 'd3' })
  useMarkdownExplorerStore.getState().setActivePath(activePath)
  const source = () => useGraphStore.getState().sourceFiles.find(value => value.id === file.id)!
  const stop = useGraphStore.subscribe(() => { const current = source(); if (current && statuses.at(-1) !== current.status) statuses.push(current.status) })
  try { await run({ file, fs, entry, calls, statuses, entered: entered.promise, secondEntered: secondEntered.promise, release: () => gate.resolve(), source,
    import: () => applyWorkspaceImportToCanvas({ fs, createdPaths: [activePath], opts: { applyToGraph: true, skipComposedGraphApply: true,
      premergedSourceFiles: useGraphStore.getState().sourceFiles, workspaceEntries: [entry], sourcesByPath: {} } }) }) }
  finally { gate.resolve(); stop(); registerParser(parser); useGraphStore.setState(graph, true); useMarkdownExplorerStore.setState(explorer, true); env.restore() }
}
const canonicalWorkspaceHash = (file: SourceFile) => {
  const path = file.source!.path!.slice('workspace:'.length)
  return buildSourceFileParseIdentityHash({ cacheNamespace: `workspace-import:${path}`, name: path.slice(1), text: file.text })
}

for (const order of ['import-first', 'native-first'] as const) test(`nested basename ${order} keeps one canonical parse through both owners`, async () => canonicalWorkspaceParseFixture(order, false, async f => {
  if (order === 'import-first') await f.import()
  else await parseAndApplySourceFile(f.file.id, { applyComposedGraph: false })
  const parsed = f.source()
  assert.equal(parsed.status, 'parsed'); assert.equal(parsed.name, 'same.md')
  assert.deepEqual(f.calls, [{ name: f.entry.path.slice(1), text: f.file.text }], 'actual parser receives canonical source path, not display basename')
  assert.equal(parsed.parsedTextHash, canonicalWorkspaceHash(f.file))
  assert.ok(parsed.parsedGraphData?.nodes.length)
  f.statuses.length = 0
  if (order === 'native-first') await f.import()
  await refreshPersistedSourceFilesForCurrentParseIdentity()
  await parseAndApplySourceFile(f.file.id, { applyComposedGraph: false })
  assert.equal(f.calls.length, 1, 'import, persisted refresh and demand parsing reuse one real parser result')
  assert.ok(!f.statuses.includes('loading'), `unchanged source must not lose readiness: ${f.statuses}`)
  assert.equal(f.source().parsedGraphData, parsed.parsedGraphData, 'cached graph IDs and metadata are retained exactly')
  assert.equal(f.source().parsedGraphRevision, parsed.parsedGraphRevision)
  assert.equal(f.source().parsedTextHash, parsed.parsedTextHash); assert.equal(f.source().name, 'same.md')
  assert.equal(useGraphStore.getState().canvas2dRenderer, 'sequence', 'reuse still applies authored import policy')
}))

for (const change of ['display name', 'source path', 'source URL', 'text'] as const) test(`canonical pending parse rejects ${change} drift before graph publication`, async () => canonicalWorkspaceParseFixture(`drift-${change.replaceAll(' ', '-')}`, true, async f => {
  const pending = parseAndApplySourceFile(f.file.id, { applyComposedGraph: false })
  try {
    await Promise.race([f.entered, pending.then(() => assert.fail('expected a deferred real parser'))])
    const current = f.source(), changed: SourceFile = { ...current,
      ...(change === 'display name' ? { name: 'renamed.md' } : {}),
      ...(change === 'source path' ? { source: { kind: 'local', path: 'workspace:/other/same.md' } } : {}),
      ...(change === 'source URL' ? { source: { kind: 'url', path: current.source!.path, url: 'https://example.test/new-provenance.md' } } : {}),
      ...(change === 'text' ? { text: '# New authored text\n' } : {}) }
    useGraphStore.setState({ sourceFiles: [changed] }); f.release(); await pending
    assert.equal(f.source(), changed, 'stale completion cannot replace the current source object')
    assert.equal(f.source().parsedGraphData, undefined); assert.equal(f.source().parsedGraphRevision, undefined)
    assert.equal(f.calls.length, 1)
  } finally { f.release(); await pending }
}))


test('canonical pending parse does not join a renamed source solely because its canonical hash matches', async () => canonicalWorkspaceParseFixture('pending-name-join', true, async f => {
  const first = parseAndApplySourceFile(f.file.id, { applyComposedGraph: false })
  let second: Promise<void> = Promise.resolve()
  try {
    await Promise.race([f.entered, first.then(() => assert.fail('first native parse did not enter'))])
    useGraphStore.setState({ sourceFiles: [{ ...f.source(), name: 'renamed.md' }] })
    second = parseAndApplySourceFile(f.file.id, { applyComposedGraph: false })
    await Promise.race([f.secondEntered, second.then(() => assert.fail('renamed request incorrectly joined stale work'))])
    f.release(); await Promise.all([first, second])
    assert.equal(f.calls.length, 2)
    assert.ok(f.calls.every(call => call.name === f.entry.path.slice(1)))
    assert.equal(f.source().name, 'renamed.md'); assert.equal(f.source().status, 'parsed')
    assert.equal(f.source().parsedTextHash, canonicalWorkspaceHash(f.file))
  } finally { f.release(); await Promise.all([first, second]) }
}))


for (const kind of ['local', 'url'] as const) test(`non-workspace ${kind} source retains its native parser name and ID hash`, async () => canonicalWorkspaceParseFixture(`native-${kind}`, false, async f => {
  const file: SourceFile = { ...f.file, source: kind === 'url' ? { kind, url: 'https://example.test/authored.md' } : { kind, path: 'same.md' } }
  useGraphStore.setState({ sourceFiles: [file] })
  await parseAndApplySourceFile(file.id, { applyComposedGraph: false })
  const parsed = f.source(), expected = buildSourceFileParseIdentityHash({ cacheNamespace: `source-file:${file.id}`, name: file.name, text: file.text })
  assert.equal(parsed.status, 'parsed'); assert.equal(parsed.parsedTextHash, expected)
  assert.deepEqual(f.calls, [{ name: file.name, text: file.text }])
  f.statuses.length = 0; await refreshPersistedSourceFilesForCurrentParseIdentity()
  assert.equal(f.calls.length, 1); assert.ok(!f.statuses.includes('loading')); assert.equal(f.source().parsedGraphData, parsed.parsedGraphData)
}))

test('same-basename sibling sources retain distinct canonical inputs and composed graph IDs', async () => canonicalWorkspaceParseFixture('siblings', false, async f => {
  const sibling: SourceFile = { ...f.file, id: 'canonical-sibling', source: { kind: 'local', path: 'workspace:/other/nested/same.md' } }
  useGraphStore.setState({ sourceFiles: [f.file, sibling] })
  await parseAndApplySourceFile(f.file.id, { applyComposedGraph: false }); await parseAndApplySourceFile(sibling.id, { applyComposedGraph: false })
  const files = useGraphStore.getState().sourceFiles
  assert.deepEqual(f.calls.map(call => call.name), [f.entry.path.slice(1), 'other/nested/same.md'])
  assert.notEqual(files[0].parsedTextHash, files[1].parsedTextHash)
  assert.ok(files.every(file => file.status === 'parsed' && file.name === 'same.md'))
  const composed = composeGraphFromSourceLayers({ layers: files }).graphData
  assert.equal(new Set(composed.nodes.map(node => node.id)).size, composed.nodes.length)
  assert.deepEqual(new Set(composed.nodes.map(node => node.metadata?.sourceLayerId)), new Set([f.file.id, sibling.id]))
  assert.deepEqual(new Set(composed.nodes.map(node => node.metadata?.documentPath)), new Set([f.entry.path.slice(1), 'other/nested/same.md']))
}))

test('cached workspace batch does not consume the fresh parser byte allowance', async () => canonicalWorkspaceParseFixture('cached-budget', false, async f => {
  const body = '# Cached source\n' + 'x'.repeat(45000)
  const cached: SourceFile[] = Array.from({ length: 12 }, (_, index) => {
    const file: SourceFile = { id: `cached-budget-${index}`, name: `cached-${index}.md`, text: body, enabled: true, status: 'parsed',
      source: { kind: 'local', path: `workspace:/notes/cache/cached-${index}.md` }, parsedParserId: 'markdown', parsedGraphRevision: 4,
      parsedGraphData: { type: 'Graph', nodes: [{ id: `cached-${index}`, label: 'Cached', type: 'Thing', properties: {} }], edges: [] } }
    file.parsedTextHash = canonicalWorkspaceHash(file); return file
  })
  useGraphStore.setState({ sourceFiles: [...cached, f.file] })
  await applyWorkspaceImportToCanvas({ fs: f.fs, createdPaths: [...cached.map(file => file.source!.path!.slice('workspace:'.length)), f.entry.path],
    opts: { applyToGraph: true, skipComposedGraphApply: true, premergedSourceFiles: useGraphStore.getState().sourceFiles, sourcesByPath: {} } })
  assert.equal(f.source().status, 'parsed', 'the fresh file after more than 500 kB of cache hits still reaches its real parser')
  assert.deepEqual(f.calls, [{ name: f.entry.path.slice(1), text: f.file.text }])
  for (const file of cached) {
    const current = useGraphStore.getState().sourceFiles.find(value => value.id === file.id)!
    assert.equal(current.parsedGraphData, file.parsedGraphData); assert.equal(current.parsedGraphRevision, file.parsedGraphRevision)
  }
}))
