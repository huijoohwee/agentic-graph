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
import { parseAndApplySourceFile } from '@/features/source-files/sourceFilesParseRuntime'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
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
  nativeDocumentApply: ReturnType<typeof useGraphStore.getState>['setActiveMarkdownDocument']
  request: Request; reads: string[]; writes: string[]; applications: { name: string; text: string }[]
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
  const reads: string[] = [], writes: string[] = [], applications: { name: string; text: string }[] = []
  let read = async (): Promise<string | null> => text
  const fs: WorkspaceFs = {
    ensureSeed: async () => false, listEntries: async () => [],
    readFileText: async path => { reads.push(path); return read() }, writeFileText: async path => { writes.push(path) },
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
    await run({ active, inactive, imported, prepared, current, request, reads, writes, applications, nativeDocumentApply: previous.setActiveMarkdownDocument,
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

type ConvergenceFixture = Parameters<Parameters<typeof fixture>[0]>[0]
function startEditorConvergence(f: ConvergenceFixture, name: string | null, previousText: string, afterPublication?: () => void) {
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: previousText })
  return f.start(() => {
    useGraphStore.setState({ sourceFiles: f.current, markdownDocumentName: documentName,
      markdownDocumentText: text, markdownDocumentApplyViewPreset: false })
    afterPublication?.()
  })
}

for (const [label, name, previousText] of [
  ['absent document', null, ''], ['prior document', 'README.md', '# Previous workspace document\n'],
] as const) test(`cold editor convergence accepts ${label} becoming the requested persisted document`, async () => fixture(async f => {
  const proof = await startEditorConvergence(f, name, previousText)
  assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
  const state = useGraphStore.getState()
  assert.deepEqual(f.applications, [{ name: documentName, text }], 'only the retried current document is applied')
  assert.ok(f.reads.length >= 2 && f.reads.length <= 3, 'admission and publication both observe persisted bytes')
  assert.ok(f.reads.every(path => path === activePath))
  assert.deepEqual(f.writes, [], 'editor convergence never rewrites persisted contents')
  assert.equal(state.sourceFiles.length, 3)
  assert.equal(state.sourceFiles.find(file => file.id === f.inactive.id), f.inactive)
  assert.equal(state.sourceFiles.find(file => file.id === f.imported.id), f.imported)
  assert.equal(state.sourceFiles.find(file => file.id === f.active.id)?.text, text)
  assert.equal(state.markdownDocumentName, documentName)
  assert.equal(state.markdownDocumentText, text)
  assert.equal(state.markdownDocumentApplyViewPreset, true)
  assert.equal(useMarkdownExplorerStore.getState().activePath, activePath)
}))

for (const previousText of ['', '# Unsaved requested document\n']) test(`cold editor convergence rejects overwritten same-path ${previousText ? 'unsaved bytes' : 'empty edit'}`, async () => fixture(async f => {
  await assert.rejects(startEditorConvergence(f, documentName, previousText), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.deepEqual(f.reads, [], 'a later persisted-looking publication cannot authorize discarding an earlier active edit')
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
}))

const editorAuthorityChanges: [string, (f: ConvergenceFixture) => void][] = [
  ['active ID mismatch', f => { f.current[0] = { ...f.current[0], id: 'replacement-active' } }],
  ['active source path mismatch', f => { f.current[0] = { ...f.current[0], source: { kind: 'local', path: 'workspace:/other/convergence.md' } } }],
  ['prepared byte mismatch', f => { f.prepared[0] = { ...f.prepared[0], text: '# Stale prepared bytes\n' } }],
  ['duplicate prepared identity', f => { f.prepared.push({ ...f.active }) }],
  ['current document path mismatch', () => { useGraphStore.setState({ markdownDocumentName: 'other/convergence.md' }) }],
  ['current document edit', () => { useGraphStore.setState({ markdownDocumentText: '# New unsaved editor bytes\n' }) }],
  ['Explorer selection drift', () => { useMarkdownExplorerStore.getState().setActivePath('/drafts/newer.md') }],
]
for (const [label, change] of editorAuthorityChanges) test(`cold editor convergence rejects ${label}`, async () => fixture(async f => {
  const pending = startEditorConvergence(f, null, '', () => change(f))
  const current = useGraphStore.getState(), selectedPath = useMarkdownExplorerStore.getState().activePath
  await assert.rejects(pending, stale)
  assert.equal(useGraphStore.getState().sourceFiles, current.sourceFiles)
  assert.equal(useGraphStore.getState().markdownDocumentName, current.markdownDocumentName)
  assert.equal(useGraphStore.getState().markdownDocumentText, current.markdownDocumentText)
  assert.equal(useMarkdownExplorerStore.getState().activePath, selectedPath)
  assert.deepEqual(f.reads, [])
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
}))

test('cold editor convergence rejects a nonempty initial inventory', async () => fixture(async f => {
  const initial = [f.active]
  f.request.sourceFilesSnapshot = initial
  useGraphStore.setState({ sourceFiles: initial })
  await assert.rejects(startEditorConvergence(f, 'README.md', '# Prior document\n'), stale)
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.deepEqual(f.reads, [])
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
}))

for (const phase of [1, 2]) test(`cold editor convergence rejects changed persisted bytes at fresh read ${phase}`, async () => fixture(async f => {
  f.read(async () => f.reads.length === phase ? '# Changed persisted source\n' : text)
  await assert.rejects(startEditorConvergence(f, 'README.md', '# Prior document\n'), stale)
  assert.deepEqual(f.reads, Array(phase).fill(activePath), 'the admitted editor transition must reach its targeted persisted-byte fence')
  assert.equal(useGraphStore.getState().sourceFiles, f.current)
  assert.equal(useGraphStore.getState().markdownDocumentName, documentName)
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.deepEqual(f.applications, [])
  assert.deepEqual(f.writes, [])
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

for (const drift of ['ordinary status', 'frontmatter inactive', 'frontmatter graph'] as const) test(`materialization rejects nonretryable ${drift} drift after document publication`, async () => fixture(async f => {
  const body = drift === 'ordinary status' ? text : '---\nkgCanvas2dRenderer: sequence\n---\n'
  f.prepared[0] = { ...f.active, text: body, ...(drift !== 'ordinary status' ? { status: 'error' as const, error: 'Expected preset-only parse' } : {}) }
  f.request.activeWorkspaceEntriesSnapshot = f.request.activeWorkspaceEntriesSnapshot!.map(entry => ({ ...entry, text: body }))
  useGraphStore.setState({ markdownDocumentText: body }); f.read(async () => body)
  let applications = 0, latest: SourceFile[] = []
  useGraphStore.setState({ setActiveMarkdownDocument: async payload => {
    applications += 1
    latest = useGraphStore.getState().sourceFiles.map((file, index) => drift === 'ordinary status' ? { ...file, status: 'loading' as const }
      : index === 0 ? { ...file, status: 'idle' as const, error: undefined, ...(drift === 'frontmatter graph' ? { parsedGraphData: { type: 'Graph', nodes: [], edges: [] } } : {}) }
        : drift === 'frontmatter inactive' ? { ...file, text: '# Later inactive edit\n' } : file)
    useGraphStore.setState({ sourceFiles: latest, markdownDocumentName: payload.name, markdownDocumentText: payload.text })
    return true
  } })
  await assert.rejects(f.start(() => undefined), stale)
  assert.equal(applications, 1)
  assert.equal(f.reads.length, 0)
  assert.equal(useGraphStore.getState().sourceFiles, latest)
}))

const pendingImportText = '---\nkgCanvasSurfaceMode: "2d"\nkgCanvas2dRenderer: "sequence"\n---\n# Deferred authored source\n'
function deferMarkdownParser(names = [documentName], bodies = [pendingImportText], outcome: 'native' | 'error' | 'empty' = 'native') {
  ensureBuiltInParsersRegistered()
  const original = listParsers().find(parser => String(parser.id) === 'markdown')!
  assert.ok(original, 'the native Markdown parser must be registered')
  const started = deferred<void>(), complete = deferred<void>()
  let calls = 0
  registerParser({ ...original, parseAsync: async (name, body) => {
    assert.ok(names.includes(name), `unexpected parser name: ${name}`); assert.ok(bodies.includes(body))
    calls += 1; started.resolve(); await complete.promise
    if (outcome === 'error') throw new Error('Native authored parser failed')
    if (outcome === 'empty') return { graphData: { type: 'Graph', nodes: [], edges: [] }, warnings: [] }
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
    const parser = deferMarkdownParser([f.active.name])
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
      assert.equal(f.applications.length, 0, 'native source parsing precedes every document application')
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
      assert.match((outcome.error as Error).message, /active source parse/, 'the materializer fences native parsing before document or graph publication')
      assert.equal(outcome.proof, undefined)
      assert.equal(parser.calls(), 1)
      assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === f.active.id)?.text, pendingImportText)
      assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === f.inactive.id), f.inactive)
      assert.equal(useGraphStore.getState().markdownDocumentText, documentText)
      assert.equal(useMarkdownExplorerStore.getState().activePath, selectedPath)
      assert.equal(f.applications.length, 0, 'the stale operation never applies its old document')
      assert.equal(publications, 0, 'authority loss prevents every subsequent preset, schema and graph publication')
    } finally { parser.release(); await settled; stop(); parser.restore() }
  }))
}

function prepareNativeSource(f: ConvergenceFixture, path = activePath, name = documentName, body = pendingImportText) {
  const files = [{ ...f.active, name, text: body, source: { kind: 'local' as const, path: `workspace:${path}` } }, f.inactive, f.imported]
  f.request.activePathOverride = path; f.request.sourceFilesSnapshot = files; f.request.premergedSourceFiles = files
  f.request.activeWorkspaceEntriesSnapshot = [{ path, parentPath: path.slice(0, path.lastIndexOf('/')) || '/', kind: 'file', name, text: body, updatedAtMs: 1 }]
  f.read(async () => body)
  useGraphStore.setState({ sourceFiles: files, markdownDocumentName: path.slice(1), markdownDocumentText: body,
    canvasRenderMode: '2d', canvas2dRenderer: 'd3', frontmatterModeEnabled: false })
  useMarkdownExplorerStore.getState().setActivePath(path)
  return files
}
const nativeHash = (file: SourceFile) => buildSourceFileParseIdentityHash({ cacheNamespace: `source-file:${file.id}`, name: file.name, text: file.text })
const settledProof = (pending: ReturnType<ConvergenceFixture['start']>) => pending.then(proof => ({ proof, error: undefined as unknown }), error => ({ proof: undefined, error: error as unknown }))

for (const [label, path, name, calls] of [
  ['root name', '/convergence.md', 'convergence.md', 1], ['canonical nested name', activePath, documentName, 1],
  ['nested basename fallback', activePath, 'convergence.md', 2],
] as const) test(`graph materialization parses before document application and preserves ${label}`, async () => fixture(async f => {
  const parser = deferMarkdownParser([name, path.slice(1)]), files = prepareNativeSource(f, path, name)
  let nativeParsed: SourceFile | undefined
  const stop = useGraphStore.subscribe(state => { const file = state.sourceFiles.find(value => value.id === f.active.id)
    if (!nativeParsed && file?.status === 'parsed') nativeParsed = file })
  const pending = settledProof(f.start(() => undefined))
  try {
    await Promise.race([parser.started, pending.then(() => assert.fail('graph materialization skipped native parsing'))])
    assert.equal(f.applications.length, 0)
    assert.equal(useGraphStore.getState().sourceFiles[0].status, 'loading')
    parser.release(); const result = await pending
    assert.equal(result.error, undefined); assert.ok(result.proof && isMaterializedWorkspaceSourceProofCurrent(result.proof))
    assert.equal(parser.calls(), calls)
    assert.deepEqual(f.applications, [{ name: path.slice(1), text: pendingImportText }])
    const final = useGraphStore.getState().sourceFiles.find(file => file.id === f.active.id)!
    assert.ok(nativeParsed?.parsedGraphData?.nodes.length)
    if (calls === 1) { assert.equal(final.parsedTextHash, nativeHash(files[0])); assert.equal(final.parsedGraphRevision, nativeParsed.parsedGraphRevision); assert.equal(final.parsedGraphData, nativeParsed.parsedGraphData) }
    else assert.notEqual(final.parsedTextHash, nativeHash(files[0]), 'different parser names cannot share the native cache')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'sequence', 'the authored preset still applies on native reuse')
    assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === f.inactive.id), f.inactive)
  } finally { parser.release(); await pending; stop(); parser.restore(); invalidateCachedWorkspaceActiveEntrySnapshot(path) }
}))

for (const change of ['none', 'active input', 'inactive addition'] as const) test(`async source retry joins native loading and ${change === 'none' ? 'finishes once' : `rejects ${change} drift`}`, async () => fixture(async f => {
  const parser = deferMarkdownParser(), files = prepareNativeSource(f)
  const native = parseAndApplySourceFile(f.active.id, { applyComposedGraph: false })
  const pending = settledProof(f.start(() => undefined))
  let latest = files
  try {
    await Promise.race([parser.started, pending.then(() => assert.fail('retry failed before observing its native parser'))])
    assert.equal(useGraphStore.getState().sourceFiles[0].status, 'loading')
    assert.equal(f.applications.length, 0)
    await new Promise<void>(resolve => setImmediate(resolve))
    if (change !== 'none') {
      latest = change === 'active input' ? useGraphStore.getState().sourceFiles.map(file => file.id === f.active.id ? { ...file, text: '# Later active bytes\n' } : file)
        : [...useGraphStore.getState().sourceFiles, { ...f.imported, id: 'later-inactive-import', text: '# Later inactive bytes\n' }]
      useGraphStore.setState({ sourceFiles: latest })
    }
    const presentation = importPresentation()
    parser.release(); await native; const result = await pending
    assert.equal(parser.calls(), 1, 'loading retry joins the registered native job rather than launching another parse')
    if (change === 'none') {
      assert.equal(result.error, undefined); assert.ok(result.proof && isMaterializedWorkspaceSourceProofCurrent(result.proof))
      assert.equal(f.applications.length, 1)
      assert.equal(useGraphStore.getState().sourceFiles[0].parsedTextHash, nativeHash(files[0]))
    } else {
      assert.ok(stale(result.error)); assert.equal(result.proof, undefined); assert.equal(f.applications.length, 0)
      assert.deepEqual(importPresentation(), presentation, 'failed retry cannot change graph, schema or presets')
      const state = useGraphStore.getState()
      for (const file of latest) assert.equal(state.sourceFiles.find(current => current.id === file.id)?.text, file.text)
      assert.equal(state.sourceFiles.find(file => file.id === f.inactive.id), f.inactive)
    }
  } finally { parser.release(); await Promise.all([native, pending]); parser.restore() }
}))

for (const outcome of ['error', 'empty'] as const) test(`graph materialization rejects native ${outcome} before document application`, async () => fixture(async f => {
  const parser = deferMarkdownParser([documentName], [pendingImportText], outcome)
  prepareNativeSource(f); const presentation = importPresentation(), pending = settledProof(f.start(() => undefined))
  try {
    await Promise.race([parser.started, pending.then(() => assert.fail('native parser was skipped'))])
    assert.equal(f.applications.length, 0); parser.release(); const result = await pending
    assert.ok(result.error instanceof Error); assert.match(result.error.message, /pars/i)
    assert.equal(result.proof, undefined); assert.equal(f.applications.length, 0); assert.equal(parser.calls(), 1)
    assert.equal(useGraphStore.getState().sourceFiles[0].status, 'error')
    assert.ok(useGraphStore.getState().sourceFiles[0].error)
    assert.deepEqual(importPresentation(), presentation, 'failed/empty parsing cannot publish a graph or display preset')
  } finally { parser.release(); await pending; parser.restore() }
}))

for (const field of ['name', 'text', 'hash', 'status', 'parser', 'empty graph'] as const) test(`workspace native-cache reuse rejects mismatched ${field}`, async () => fixture(async f => {
  const parser = deferMarkdownParser()
  prepareNativeSource(f); parser.release()
  try {
    await parseAndApplySourceFile(f.active.id, { applyComposedGraph: false })
    const parsed = useGraphStore.getState().sourceFiles[0]
    const altered: SourceFile = { ...parsed,
      ...(field === 'name' ? { name: 'other/convergence.md' } : {}), ...(field === 'text' ? { text: '' } : {}),
      ...(field === 'hash' ? { parsedTextHash: 'stale-native-hash' } : {}), ...(field === 'status' ? { status: 'loading' as const } : {}),
      ...(field === 'parser' ? { parsedParserId: '' } : {}), ...(field === 'empty graph' ? { parsedGraphData: { type: 'Graph', nodes: [], edges: [] } } : {}) }
    if (field === 'name') altered.parsedTextHash = nativeHash(altered) // Coherent native identity with the wrong canonical path.
    const files = [altered, f.inactive]; useGraphStore.setState({ sourceFiles: files })
    const result = await applyWorkspaceImportToCanvas({ fs: f.request.fs!, createdPaths: [activePath], opts: { premergedSourceFiles: files, applyToGraph: true, skipComposedGraphApply: true } })
    assert.ok(parser.calls() >= 1, 'the downstream loader may reuse its independent parser-result cache')
    assert.equal(result.parsedCount, 1)
    const final = useGraphStore.getState().sourceFiles[0]
    assert.equal(final.text, pendingImportText); assert.equal(final.status, 'parsed')
    assert.equal(final.parsedTextHash, buildSourceFileParseIdentityHash({ cacheNamespace: `workspace-import:${activePath}`, name: documentName, text: pendingImportText }), 'misses must publish the canonical workspace parse identity')
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'sequence')
  } finally { parser.restore() }
}))

for (const body of ['', '---\nkgCanvasSurfaceMode: "2d"\nkgCanvas2dRenderer: "sequence"\n---\n']) test(`graph materialization retains legacy ${body ? 'frontmatter-only preset' : 'empty document'} application`, async () => fixture(async f => {
  const parser = deferMarkdownParser([documentName], [body])
  prepareNativeSource(f, activePath, documentName, body); parser.release()
  try {
    const proof = await f.start(() => undefined)
    assert.ok(proof && isMaterializedWorkspaceSourceProofCurrent(proof))
    assert.deepEqual(f.applications, [{ name: documentName, text: body }])
    assert.equal(useGraphStore.getState().markdownDocumentText, body)
    if (body) assert.equal(useGraphStore.getState().canvas2dRenderer, 'sequence')
    else assert.equal(parser.calls(), 0, 'empty authored bytes do not invent a parse job')
  } finally { parser.restore() }
}))

test('native cached plain import still composes both enabled source layers', async () => fixture(async f => {
  const body = '# Active plain source\n\nFirst local paragraph.\n', otherText = '# Second plain source\n\nAnother local paragraph.\n'
  const parser = deferMarkdownParser([documentName, f.inactive.name], [body, otherText])
  const files = prepareNativeSource(f, activePath, documentName, body)
  useGraphStore.setState({ sourceFiles: [files[0], { ...f.inactive, text: otherText, enabled: true }],
    workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: false, workspaceGraphMutationBlockUntilMs: 0,
    workspaceGraphMutationLayoutLockActive: false, markdownWorkspaceIndexingInFlight: false })
  parser.release()
  try {
    await parseAndApplySourceFile(f.active.id, { applyComposedGraph: false })
    await parseAndApplySourceFile(f.inactive.id, { applyComposedGraph: false })
    const parsed = useGraphStore.getState().sourceFiles
    assert.ok(parsed.every(file => file.status === 'parsed' && file.parsedGraphData?.nodes.length))
    const result = await applyWorkspaceImportToCanvas({ fs: f.request.fs!, createdPaths: [activePath], opts: { premergedSourceFiles: parsed, applyToGraph: true } })
    await new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
    assert.equal(result.parsedCount, 1); assert.equal(parser.calls(), 2, 'import reuses the active native parse')
    const graph = useGraphStore.getState().graphData
    assert.equal(graph?.metadata?.sourceLayerComposition, 'compose')
    assert.deepEqual(new Set(graph?.nodes.map(node => String(node.metadata?.sourceLayerId))), new Set([f.active.id, f.inactive.id]))
    assert.equal(useGraphStore.getState().sourceFiles[0].parsedGraphRevision, parsed[0].parsedGraphRevision)
  } finally { parser.restore() }
}))

test('native loading frontmatter-only source still settles through the real document owner', async () => fixture(async f => {
  const body = '---\nkgCanvasSurfaceMode: "2d"\nkgCanvas2dRenderer: "sequence"\n---\n'
  const parser = deferMarkdownParser([documentName], [body], 'empty')
  prepareNativeSource(f, activePath, documentName, body)
  useGraphStore.setState({ setActiveMarkdownDocument: async payload => {
    f.applications.push({ name: payload.name, text: payload.text }); return f.nativeDocumentApply(payload)
  } })
  const native = parseAndApplySourceFile(f.active.id, { applyComposedGraph: false }), pending = settledProof(f.start(() => undefined))
  try {
    await Promise.race([parser.started, pending.then(() => assert.fail('frontmatter-only native job did not start'))])
    assert.equal(f.applications.length, 0); parser.release(); await native
    const outcome = await pending
    assert.equal(outcome.error, undefined, 'an expected zero-content preset must remain a supported document')
    assert.ok(outcome.proof && isMaterializedWorkspaceSourceProofCurrent(outcome.proof))
    assert.equal(f.applications.length, 1); assert.equal(useGraphStore.getState().markdownDocumentText, body)
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'sequence')
  } finally { parser.release(); await Promise.all([native, pending]); parser.restore() }
}))

test('graph materialization rejects an active ID duplicated on another path before native parsing', async () => fixture(async f => {
  const parser = deferMarkdownParser(), files = prepareNativeSource(f)
  files.push({ ...f.inactive, id: f.active.id })
  const presentation = importPresentation()
  try {
    const pending = f.start(() => undefined); parser.release()
    await assert.rejects(pending, stale)
    assert.equal(parser.calls(), 0); assert.equal(f.applications.length, 0)
    assert.equal(useGraphStore.getState().sourceFiles, files); assert.deepEqual(importPresentation(), presentation)
  } finally { parser.restore() }
}))
