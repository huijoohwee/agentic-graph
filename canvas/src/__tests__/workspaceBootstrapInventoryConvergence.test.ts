import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { materializeActiveWorkspaceEntryIntoSourceFiles, isMaterializedWorkspaceSourceProofCurrent } from '@/features/source-files/sourceFilesRuntimeMaterialization'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { ensureBuiltInParsersRegistered } from '@/features/parsers/ensure'
import { listParsers, registerParser } from '@/features/parsers/registry'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'

const activePath = '/drafts/convergence.md'
const documentName = 'drafts/convergence.md'
const text = '# Authored workspace\n\nRetain exact local text 保留.\n'
const sourcePath = `workspace:${activePath}`
const stale = (error: unknown) => (error as { code?: string })?.code === 'SOURCE_FILES_MATERIALIZATION_STALE'
type Request = NonNullable<Parameters<typeof materializeActiveWorkspaceEntryIntoSourceFiles>[0]>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function fixture(run: (f: {
  active: SourceFile; inactive: SourceFile; imported: SourceFile; prepared: SourceFile[]; current: SourceFile[]
  request: Request; reads: string[]; applications: { name: string; text: string }[]
  read: (operation: () => Promise<string | null>) => void
  start: (publish?: () => void) => ReturnType<typeof materializeActiveWorkspaceEntryIntoSourceFiles>
}) => Promise<void>) {
  const previous = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState()
  const { restore } = initJsdomHarness()
  const active: SourceFile = { id: 'active-authored-source', name: 'convergence.md', text, enabled: true,
    geoLayerEnabled: true, status: 'idle', source: { kind: 'local', path: sourcePath } }
  const inactive: SourceFile = { id: 'inactive-placeholder', name: 'retained.md', text: '', enabled: false,
    status: 'idle', source: { kind: 'local', path: 'workspace:/drafts/retained.md' } }
  const imported: SourceFile = { id: 'concurrent-import', name: 'concurrent.md', text: '# Concurrent authored import\n',
    enabled: false, geoLayerEnabled: false, status: 'idle',
    source: { kind: 'url', path: 'workspace:/drafts/concurrent.md', url: 'https://example.test/authored.md' } }
  const prepared = [active, { ...inactive, text: '# Previously hydrated inactive seed\n' }]
  const current = [{ ...active, status: 'loading' as const }, inactive, imported]
  const entry: WorkspaceEntry = { path: activePath, parentPath: '/drafts', kind: 'file', name: active.name, text, updatedAtMs: 1 }
  const reads: string[] = [], applications: { name: string; text: string }[] = []
  let read = async (): Promise<string | null> => text
  const fs: WorkspaceFs = {
    ensureSeed: async () => false, listEntries: async () => [],
    readFileText: async path => { reads.push(path); return read() }, writeFileText: async () => undefined,
    createFile: async () => '/drafts/new.md', createFolder: async () => '/drafts', deleteEntry: async () => undefined,
  }
  const initial: SourceFile[] = []
  const request: Request = { fs, activePathOverride: activePath, applyToGraph: true, sourceFilesSnapshot: initial,
    premergedSourceFiles: prepared, activeWorkspaceEntriesSnapshot: [entry], sourcesByPath: {} }
  useGraphStore.setState({ sourceFiles: initial, markdownDocumentName: documentName, markdownDocumentText: text,
    markdownDocumentApplyViewPreset: true, setActiveMarkdownDocument: async payload => {
      applications.push({ name: payload.name, text: payload.text })
      useGraphStore.setState({ markdownDocumentName: payload.name, markdownDocumentText: payload.text, markdownDocumentApplyViewPreset: true })
      return true
    } })
  useMarkdownExplorerStore.getState().setActivePath(activePath)
  try {
    await run({ active, inactive, imported, prepared, current, request, reads, applications,
      read: operation => { read = operation },
      start: (publish = () => useGraphStore.setState({ sourceFiles: current })) => {
        const pending = materializeActiveWorkspaceEntryIntoSourceFiles(request)
        // The public async resolver has yielded; simulate the editor's independent publication.
        publish()
        return pending
      } })
  } finally {
    invalidateCachedWorkspaceActiveEntrySnapshot(activePath)
    useGraphStore.setState(previous, true)
    useMarkdownExplorerStore.setState(explorer, true)
    restore()
  }
}

test('cold bootstrap retries the current inventory and preserves concurrent imports and empty inactive records', async () => fixture(async f => {
  const proof = await f.start()
  assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
  const result = useGraphStore.getState()
  assert.ok(f.reads.length >= 2 && f.reads.length <= 3, 'bounded fresh observations guard admission and publication')
  assert.ok(f.reads.every(path => path === activePath), 'the retry only reads the active source')
  assert.deepEqual(f.applications, [{ name: documentName, text }], 'the stale attempt never applies a document')
  assert.equal(result.sourceFiles.length, 3)
  assert.equal(result.sourceFiles.find(file => file.id === f.inactive.id), f.inactive)
  assert.equal(result.sourceFiles.find(file => file.id === f.imported.id), f.imported)
  assert.equal(result.sourceFiles.find(file => file.id === f.active.id)?.text, text)
  assert.equal(result.markdownDocumentName, documentName)
  assert.equal(result.markdownDocumentText, text)
  assert.equal(useMarkdownExplorerStore.getState().activePath, activePath)
  assert.equal(result.sourceFiles.some(file => file.text === f.prepared[1].text), false)
  useGraphStore.setState({ sourceFiles: result.sourceFiles.slice() })
  assert.equal(isMaterializedWorkspaceSourceProofCurrent(proof), false, 'proof is bound to the exact settled inventory')
}))

const ineligible: [string, (f: Parameters<Parameters<typeof fixture>[0]>[0]) => void][] = [
  ['nonempty initial inventory', f => { const initial = [f.active]; f.request.sourceFilesSnapshot = initial; useGraphStore.setState({ sourceFiles: initial }) }],
  ['non-graph materialization', f => { f.request.applyToGraph = false }],
  ['disabled active source', f => { f.prepared[0] = { ...f.prepared[0], enabled: false }; f.current[0] = { ...f.current[0], enabled: false } }],
  ['missing prepared active source', f => { f.prepared.splice(0, 1) }],
  ['duplicate prepared active path', f => { f.prepared.push({ ...f.active, id: 'prepared-duplicate' }) }],
  ['duplicate prepared active ID on another path', f => { f.prepared.push({ ...f.inactive, id: f.active.id }) }],
  ['missing current active source', f => { f.current.splice(0, 1) }],
  ['duplicate current active path', f => { f.current.push({ ...f.active, id: 'current-duplicate' }) }],
  ['duplicate current active ID on another path', f => { f.current.push({ ...f.inactive, id: f.active.id }) }],
  ['unsaved active document', () => { useGraphStore.setState({ markdownDocumentText: `${text}Unsaved change\n` }) }],
  ['document selection mismatches active source', () => { useGraphStore.setState({ markdownDocumentName: 'drafts/other.md' }) }],
]
for (const [name, mutate] of ineligible) test(`bootstrap convergence rejects ${name}`, async () => fixture(async f => {
  mutate(f)
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(f.reads.length, 0, 'ineligible convergence cannot authorize a persisted-byte read or retry')
  assert.equal(f.applications.length, 0)
}))

const sourceChanges: [string, Partial<SourceFile>][] = [
  ['id', { id: 'new-active-id' }], ['name', { name: 'renamed.md' }], ['text', { text: '# New authored text\n' }],
  ['enabled', { enabled: false }], ['geographic participation', { geoLayerEnabled: false }],
  ['source kind', { source: { kind: 'url', path: sourcePath, url: 'https://example.test/changed.md' } }],
  ['source path', { source: { kind: 'local', path: 'workspace:/drafts/other.md' } }],
  ['source provenance', { source: { kind: 'local', path: sourcePath, url: 'https://example.test/changed.md' } }],
]
for (const [name, change] of sourceChanges) test(`bootstrap convergence rejects changed active ${name}`, async () => fixture(async f => {
  f.current[0] = { ...f.current[0], ...change }
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(f.reads.length, 0)
  assert.equal(f.applications.length, 0)
}))

for (const field of ['name', 'text', 'path'] as const) test(`bootstrap convergence rejects concurrent document ${field} drift`, async () => fixture(async f => {
  await assert.rejects(f.start(() => {
    useGraphStore.setState({ sourceFiles: f.current,
      ...(field === 'name' ? { markdownDocumentName: 'drafts/other.md' } : {}),
      ...(field === 'text' ? { markdownDocumentText: `${text}Concurrent editor change\n` } : {}) })
    if (field === 'path') useMarkdownExplorerStore.getState().setActivePath('/drafts/other.md')
  }), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(f.reads.length, 0)
  assert.equal(f.applications.length, 0)
}))

for (const phase of [1, 2]) for (const value of [null, '# Different persisted bytes\n', 'error'] as const) test(`bootstrap convergence rejects persisted active ${value === null ? 'deletion' : value === 'error' ? 'read error' : 'byte mismatch'} at read ${phase}`, async () => fixture(async f => {
  const failure = new Error('Filesystem observation unavailable')
  f.read(async () => {
    if (f.reads.length !== phase) return text
    if (value === 'error') throw failure
    return value
  })
  await assert.rejects(f.start(), value === 'error' ? error => error === failure : stale)
  assert.deepEqual(f.reads, Array(phase).fill(activePath))
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(f.applications.length, 0)
}))

for (const phase of [1, 2]) for (const field of ['inventory', 'name', 'text', 'path'] as const) test(`bootstrap convergence rejects ${field} drift during fresh filesystem read ${phase}`, async () => fixture(async f => {
  const started = deferred<void>(), complete = deferred<string | null>()
  f.read(async () => { if (f.reads.length !== phase) return text; started.resolve(); return complete.promise })
  const pending = f.start()
  await Promise.race([started.promise, pending.then(() => assert.fail('materialization skipped the fresh read'))])
  const latest = field === 'inventory' ? [...f.current, { ...f.imported, id: 'newer-import' }] : f.current
  useGraphStore.setState({ sourceFiles: latest,
    ...(field === 'name' ? { markdownDocumentName: 'drafts/newer.md' } : {}),
    ...(field === 'text' ? { markdownDocumentText: `${text}Newer unsaved edit\n` } : {}) })
  if (field === 'path') useMarkdownExplorerStore.getState().setActivePath('/drafts/newer.md')
  complete.resolve(text)
  await assert.rejects(pending, stale)
  assert.equal(useGraphStore.getState().sourceFiles, latest)
  assert.deepEqual(f.reads, Array(phase).fill(activePath))
  assert.equal(f.applications.length, 0)
}))

test('bootstrap convergence rejects a stale active entry cache before publishing any inventory or document', async () => fixture(async f => {
  f.request.activeWorkspaceEntriesSnapshot = f.request.activeWorkspaceEntriesSnapshot!.map(entry => ({ ...entry, text: '# Stale cached source\n' }))
  await assert.rejects(f.start(), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.ok(f.reads.length > 0, 'fresh persisted bytes do not authorize a different cached display projection')
  assert.equal(f.applications.length, 0)
}))

test('bootstrap convergence stops after a second stale async source snapshot', async () => fixture(async f => {
  let latest = f.current
  f.read(async () => {
    if (f.reads.length === 1) invalidateCachedWorkspaceActiveEntrySnapshot(activePath)
    else { latest = f.current.slice(); useGraphStore.setState({ sourceFiles: latest }) }
    return text
  })
  await assert.rejects(f.start(), stale)
  assert.deepEqual(f.reads, [activePath, activePath], 'one convergence read and one retry; a third attempt is forbidden')
  assert.equal(useGraphStore.getState().sourceFiles, latest)
  assert.equal(f.applications.length, 0)
}))

test('materialization propagates genuine document publication errors without retry', async () => fixture(async f => {
  const failure = new Error('Document publication unavailable')
  let applications = 0
  useGraphStore.setState({ setActiveMarkdownDocument: async () => { applications += 1; throw failure } })
  await assert.rejects(f.start(() => undefined), error => error === failure)
  assert.equal(applications, 1)
  assert.equal(f.reads.length, 0)
}))

test('materialization does not retry a nonretryable drift after document publication', async () => fixture(async f => {
  let applications = 0, latest: SourceFile[] = []
  useGraphStore.setState({ setActiveMarkdownDocument: async payload => {
    applications += 1
    latest = useGraphStore.getState().sourceFiles.map(file => ({ ...file, status: 'loading' as const }))
    useGraphStore.setState({ sourceFiles: latest, markdownDocumentName: payload.name, markdownDocumentText: payload.text })
    return true
  } })
  await assert.rejects(f.start(() => undefined), stale)
  assert.equal(applications, 1)
  assert.equal(f.reads.length, 0)
  assert.equal(useGraphStore.getState().sourceFiles, latest)
}))

const pendingImportText = '---\nkgCanvasSurfaceMode: "2d"\nkgCanvas2dRenderer: "sequence"\n---\n# Deferred authored source\n'
function deferMarkdownParser() {
  ensureBuiltInParsersRegistered()
  const original = listParsers().find(parser => String(parser.id) === 'markdown')!
  assert.ok(original, 'the native Markdown parser must be registered')
  const started = deferred<void>(), complete = deferred<void>()
  let calls = 0
  registerParser({ ...original, parseAsync: async (name, body) => {
    assert.equal(name, documentName); assert.equal(body, pendingImportText)
    calls += 1; started.resolve(); await complete.promise
    return original.parseAsync ? original.parseAsync(name, body) : original.parse(name, body)
  } })
  return { started: started.promise, release: () => complete.resolve(), calls: () => calls,
    restore: () => { complete.resolve(); registerParser(original) } }
}
function importPresentation() {
  const state = useGraphStore.getState()
  return [state.canvasRenderMode, state.canvas2dRenderer, state.canvas3dMode,
    state.frontmatterModeEnabled, state.multiDimTableModeEnabled, state.schema, state.graphData] as const
}

for (const change of ['none', 'inactive import', 'active edit', 'caller authority'] as const) {
  test(`deferred workspace parser ${change === 'none' ? 'publishes one current import' : `rejects a late ${change} without stale publication`}`, async () => fixture(async f => {
    const parser = deferMarkdownParser()
    let authorityChanged = false, publications = 0
    const authorityFailure = new Error('The active document owner changed')
    const captured = [{ ...f.active, text: pendingImportText }, f.inactive]
    useGraphStore.setState({ sourceFiles: captured, markdownDocumentText: pendingImportText,
      canvasRenderMode: '2d', canvas2dRenderer: 'd3', frontmatterModeEnabled: false })
    let latest = captured
    let stop: () => void = () => undefined
    const pending = applyWorkspaceImportToCanvas({ fs: f.request.fs!, createdPaths: [activePath], opts: {
      applyToGraph: true, skipComposedGraphApply: true, premergedSourceFiles: captured,
      assertCurrent: () => { if (authorityChanged) throw authorityFailure },
    } })
    const settled = pending.then(result => ({ result, error: undefined as unknown }), error => ({ result: undefined, error: error as unknown }))
    try {
      await Promise.race([parser.started, settled.then(() => assert.fail('native import did not enter its deferred parser'))])
      if (change === 'inactive import') latest = [...captured, f.imported]
      if (change === 'active edit') latest = [{ ...captured[0], text: '# Newer local active edit\n' }, f.inactive]
      useGraphStore.setState({ sourceFiles: latest,
        ...(change === 'active edit' ? { markdownDocumentText: latest[0].text } : {}) })
      authorityChanged = change === 'caller authority'
      const presentation = importPresentation()
      stop = useGraphStore.subscribe(() => {
        if (importPresentation().some((value, index) => value !== presentation[index])) publications += 1
      })
      parser.release()
      const outcome = await settled
      assert.equal(parser.calls(), 1, 'the public owner performs one real deferred parse')
      const state = useGraphStore.getState()
      if (change === 'none') {
        assert.equal(outcome.error, undefined)
        assert.equal(outcome.result?.parsedCount, 1)
        assert.equal(state.canvas2dRenderer, 'sequence', 'the authored preset really publishes when its source remains current')
        assert.ok(publications > 0)
      } else {
        assert.deepEqual({
          rejectedCurrentOwner: change === 'caller authority' ? outcome.error === authorityFailure : stale(outcome.error),
          exactCurrentInventory: state.sourceFiles === latest,
          activeText: state.sourceFiles.find(file => file.id === f.active.id)?.text,
          retainedInactive: state.sourceFiles.find(file => file.id === f.inactive.id) === f.inactive,
          retainedImport: change !== 'inactive import' || state.sourceFiles.find(file => file.id === f.imported.id) === f.imported,
          staleModeOrGraphPublications: publications,
          renderer: state.canvas2dRenderer,
        }, { rejectedCurrentOwner: true, exactCurrentInventory: true, activeText: latest[0].text,
          retainedInactive: true, retainedImport: true, staleModeOrGraphPublications: 0, renderer: 'd3' })
      }
    } finally { parser.release(); await settled; stop(); parser.restore() }
  }))
}

for (const change of ['unsaved document', 'Explorer selection'] as const) {
  test(`materialization fences a late ${change} inside the deferred graph importer`, async () => fixture(async f => {
    const parser = deferMarkdownParser()
    const captured = [{ ...f.active, text: pendingImportText }, f.inactive, f.imported]
    f.request.sourceFilesSnapshot = captured; f.request.premergedSourceFiles = captured
    f.request.activeWorkspaceEntriesSnapshot = f.request.activeWorkspaceEntriesSnapshot!.map(entry => ({ ...entry, text: pendingImportText }))
    f.read(async () => pendingImportText)
    useGraphStore.setState({ sourceFiles: captured, markdownDocumentText: pendingImportText,
      canvasRenderMode: '2d', canvas2dRenderer: 'd3', frontmatterModeEnabled: false })
    const pending = f.start(() => undefined)
    const settled = pending.then(proof => ({ proof, error: undefined as unknown }), error => ({ proof: undefined, error: error as unknown }))
    let publications = 0, stop: () => void = () => undefined
    try {
      await Promise.race([parser.started, settled.then(() => assert.fail('materialization did not reach the native deferred graph parser'))])
      assert.equal(f.applications.length, 1, 'the public materializer settled the initial document before importing its graph')
      const documentText = change === 'unsaved document' ? '# Newer unsaved authored text\n' : pendingImportText
      const selectedPath = change === 'Explorer selection' ? '/drafts/another-selection.md' : activePath
      useGraphStore.setState({ markdownDocumentText: documentText })
      useMarkdownExplorerStore.getState().setActivePath(selectedPath)
      const presentation = importPresentation()
      stop = useGraphStore.subscribe(() => {
        if (importPresentation().some((value, index) => value !== presentation[index])) publications += 1
      })
      parser.release()
      const outcome = await settled
      assert.ok(stale(outcome.error))
      assert.match((outcome.error as Error).message, /graph import authority/, 'the importer invokes the materializer authority guard before publishing')
      assert.equal(outcome.proof, undefined)
      assert.equal(parser.calls(), 1)
      assert.equal(useGraphStore.getState().sourceFiles, captured)
      assert.equal(useGraphStore.getState().markdownDocumentText, documentText)
      assert.equal(useMarkdownExplorerStore.getState().activePath, selectedPath)
      assert.equal(f.applications.length, 1, 'the stale operation does not reapply its old document')
      assert.equal(publications, 0, 'authority loss prevents every subsequent preset, schema and graph publication')
    } finally { parser.release(); await settled; stop(); parser.restore() }
  }))
}
