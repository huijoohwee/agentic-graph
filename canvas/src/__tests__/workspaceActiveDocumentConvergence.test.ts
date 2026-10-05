import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeActiveWorkspaceEntryIntoSourceFiles, isMaterializedWorkspaceSourceProofCurrent } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import type { SourceFile } from '@/hooks/store/types'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import { hashStringToHex } from '@/lib/hash/stringHash'

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
