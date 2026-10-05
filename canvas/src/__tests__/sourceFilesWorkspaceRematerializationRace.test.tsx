import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import test from 'node:test'
import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useSourceFilesWorkspaceRuntime } from '@/features/source-files/useSourceFilesWorkspaceRuntime'
import { createActivePathSourceAuthorityCoordinator } from '@/features/source-files/sourceFilesActivePathAuthority'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { resetWorkspaceSeedSyncRuntimeForTests } from '@/lib/workspace/workspaceSeedSyncRuntime'
import type { SourceFile } from '@/hooks/store/types'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const path = '/notes/rematerialized.md', name = 'notes/rematerialized.md', text = '# Persisted workspace document\n'
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
type Runtime = ReturnType<typeof useSourceFilesWorkspaceRuntime>
type Inputs = Parameters<typeof useSourceFilesWorkspaceRuntime>[0]
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000
  while (!check()) { assert.ok(Date.now() < deadline, 'bounded workspace scheduler must settle'); await new Promise(resolve => setTimeout(resolve, 0)) }
}

async function fixture(run: (value: {
  initial: SourceFile[]; input: Inputs; runtime: Runtime; published: SourceFile[][]; applications: string[]
  entered: Promise<void>; release(): void; schedule(snapshot?: SourceFile[]): Promise<void>; drain(): Promise<void>
}) => Promise<void>, pauseAt: 'fs' | 'entry' = 'entry') {
  const original = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState(), env = initJsdomHarness()
  resetWorkspaceSeedSyncRuntimeForTests(); invalidateCachedWorkspaceActiveEntrySnapshot(path)
  const initial: SourceFile[] = [
    { id: 'active', name, text: '# Earlier workspace text\n', enabled: true, status: 'idle', source: { kind: 'local', path: `workspace:${path}` } },
    { id: 'retained', name: 'retained.md', text: '# Retained authored text\n', enabled: false, status: 'parsed',
      parsedTextHash: 'retained-old', parsedParserId: 'markdown', parsedGraphData: { nodes: [], edges: [] },
      source: { kind: 'local', path: 'workspace:/notes/retained.md' } },
  ]
  const blocked = deferred<void>(), entered = deferred<void>(), published: SourceFile[][] = [], applications: string[] = []
  let pause = true
  const wait = async () => { if (pause) { pause = false; entered.resolve(); await blocked.promise } }
  const fs: WorkspaceFs = {
    ensureSeed: async () => false,
    listEntries: async () => [{ path, name: 'rematerialized.md', parentPath: '/notes', kind: 'file', text, updatedAtMs: 1 }],
    readFileText: async () => { if (pauseAt === 'entry') await wait(); return text },
    writeFileText: async () => { assert.fail('rematerialization must not persist source bytes') },
    createFile: async () => '/unused.md', createFolder: async () => '/unused', deleteEntry: async () => undefined,
  }
  useGraphStore.setState({ sourceFiles: initial, markdownDocumentName: name, markdownDocumentText: '# Earlier workspace text\n', markdownDocumentApplyViewPreset: true,
    setSourceFiles: files => { published.push(files); useGraphStore.setState({ sourceFiles: files }) },
    setActiveMarkdownDocument: async payload => { applications.push(payload.text); useGraphStore.setState({ markdownDocumentName: payload.name, markdownDocumentText: payload.text, markdownDocumentApplyViewPreset: true }); return true },
  })
  useMarkdownExplorerStore.getState().setActivePath(path)
  const input: Inputs = {
    workspaceHydratedRef: { current: true }, workspaceSourceFilesDocsOnly: false, workspaceSourceFilesSyncDebounceMs: 0,
    readCallerOwnedSourceFilesSnapshot: snapshot => snapshot || useGraphStore.getState().sourceFiles,
    readReusableWorkspaceFs: async () => { if (pauseAt === 'fs') await wait(); return fs },
    readReusableWorkspaceSourceIndexSnapshot: () => ({}), reusableWorkspaceFsRef: { current: fs },
    reusableWorkspaceEntriesRef: { current: undefined }, reusableWorkspaceSourcesByPathRef: { current: null },
    latestSourceFilesSnapshotRef: { current: initial }, lastMaterializedActivePathRef: { current: '' }, suppressComposeUntilMsRef: { current: 0 },
    activePathSourceAuthorityRef: { current: createActivePathSourceAuthorityCoordinator() },
    workspaceSeedSyncLifecycleAbortControllerRef: { current: new AbortController() }, markWorkspaceSeedSyncDebug: () => undefined,
  }
  let runtime!: Runtime
  function Harness() { runtime = useSourceFilesWorkspaceRuntime(input); return null }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(<Harness />))
    const drain = () => until(() => !runtime.workspaceRematerializeSeedSyncScheduler.readSnapshot().inFlight)
    await run({ initial, input, runtime, published, applications, entered: entered.promise, release: () => blocked.resolve(), drain,
      schedule: async snapshot => { await act(async () => { runtime.workspaceRematerializeSeedSyncScheduler.schedule(runtime.resolveWorkspaceRematerializeRequest({ sourceFilesSnapshot: snapshot })) }) },
    })
  } finally {
    blocked.resolve(); await until(() => !runtime.workspaceRematerializeSeedSyncScheduler.readSnapshot().inFlight)
    input.workspaceSeedSyncLifecycleAbortControllerRef.current.abort()
    runtime.workspaceRematerializeSeedSyncScheduler.cleanup(); await act(async () => root.unmount())
    invalidateCachedWorkspaceActiveEntrySnapshot(path); resetWorkspaceSeedSyncRuntimeForTests()
    useGraphStore.setState(original, true); useMarkdownExplorerStore.setState(explorer, true); env.restore()
  }
}

for (const change of ['import', 'authored edit', 'parsed graph'] as const) test(`deferred workspace rematerialization preserves a newer ${change} without publication`, async () => fixture(async f => {
  await f.schedule(f.initial); await f.entered
  const later = change === 'import' ? [...f.initial, { ...f.initial[1]!, id: 'new-import', name: 'import.md', source: { kind: 'local' as const, path: 'local:import.md' } }]
    : f.initial.map(file => file.id !== 'retained' ? file : { ...file, ...(change === 'authored edit'
      ? { text: '# Newer unsaved source bytes\n' } : { parsedGraphData: { nodes: [], edges: [] } }) })
  useGraphStore.setState({ sourceFiles: later })
  const document = useGraphStore.getState().markdownDocumentText
  f.release(); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles, later)
  assert.equal(useGraphStore.getState().markdownDocumentText, document)
  assert.deepEqual(f.published, []); assert.deepEqual(f.applications, [])
  assert.equal(f.input.reusableWorkspaceEntriesRef.current, undefined)
  assert.equal(f.input.reusableWorkspaceSourcesByPathRef.current, null)
  await f.schedule(later); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'retained'), later.find(file => file.id === 'retained'))
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'active')?.text, text)
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.ok(f.published.length > 0, 'a rejected snapshot must not consume the successful future signature')
  if (change === 'import') assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'new-import'), later.at(-1))
}))

for (const change of ['document', 'preset', 'selection', 'abort'] as const) test(`deferred rematerialization stops when ${change} changes during FS acquisition`, async () => fixture(async f => {
  await f.schedule(); await f.entered
  if (change === 'document') useGraphStore.setState({ markdownDocumentText: '# User draft while loading\n' })
  if (change === 'preset') useGraphStore.setState({ markdownDocumentApplyViewPreset: false })
  if (change === 'selection') useMarkdownExplorerStore.getState().setActivePath('/notes/other.md')
  if (change === 'abort') f.input.workspaceSeedSyncLifecycleAbortControllerRef.current.abort()
  const current = useGraphStore.getState()
  f.release(); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles, current.sourceFiles)
  assert.equal(useGraphStore.getState().markdownDocumentText, current.markdownDocumentText)
  assert.equal(useGraphStore.getState().markdownDocumentApplyViewPreset, current.markdownDocumentApplyViewPreset)
  assert.deepEqual(f.published, []); assert.deepEqual(f.applications, [])
  assert.equal(f.input.reusableWorkspaceEntriesRef.current, undefined)
}, 'fs'))

test('equivalent caller snapshot remains admissible and uses the current inventory', async () => fixture(async f => {
  const equivalent = f.initial.map(file => ({ ...file }))
  f.release(); await f.schedule(equivalent); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'active')?.text, text)
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'retained'), f.initial[1])
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.equal(f.input.reusableWorkspaceEntriesRef.current?.find(entry => entry.path === path)?.text, text)
  assert.ok(f.published.length > 0)
}))


test('unchanged workspace bytes do not reuse a proof after the active source is disabled', async () => fixture(async f => {
  f.release(); await f.schedule(); await f.drain()
  const before = f.published.length
  const disabled = useGraphStore.getState().sourceFiles.map(file => file.id === 'active' ? { ...file, enabled: false } : file)
  useGraphStore.setState({ sourceFiles: disabled })
  await f.schedule(disabled); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'active')?.enabled, true)
  assert.ok(f.published.length > before, 'unchanged entry signature needs a current source proof before skipping')
}))


test('already-stale caller parsed graph cannot pass a same-hash source admission', async () => fixture(async f => {
  const stale = f.initial.map(file => file.id === 'retained' ? { ...file, parsedGraphData: { nodes: [], edges: [] } } : file)
  f.release(); await f.schedule(stale); await f.drain()
  assert.equal(useGraphStore.getState().sourceFiles, f.initial)
  assert.deepEqual(f.published, []); assert.deepEqual(f.applications, [])
}))

test('a missing active source retains cached URL provenance through guarded materialization', async () => fixture(async f => {
  const current = [f.initial[1]!], url = 'https://example.invalid/source.md'
  useGraphStore.setState({ sourceFiles: current })
  f.input.reusableWorkspaceSourcesByPathRef.current = { [path]: { kind: 'url', url } }
  f.release(); await f.schedule(current); await f.drain()
  const source = useGraphStore.getState().sourceFiles.find(file => file.source?.path === `workspace:${path}`)
  assert.ok(source)
  assert.equal(source.source?.kind, 'url'); assert.equal(source.source?.url, url)
  assert.equal(useGraphStore.getState().sourceFiles.find(file => file.id === 'retained'), current[0])
}))

for (const change of ['replacement', 'invalidation', 'initial null invalidation']) test(`late cache ${change} survives materialization`, async () => fixture(async f => {
  f.input.reusableWorkspaceEntriesRef.current = []
  if (change !== 'initial null invalidation') f.input.reusableWorkspaceSourcesByPathRef.current = {}
  const entries = change === 'replacement' ? [] : undefined, sources = change === 'replacement' ? {} : null
  const apply = useGraphStore.getState().setActiveMarkdownDocument
  useGraphStore.setState({ setActiveMarkdownDocument: async payload => {
    const result = await apply(payload)
    f.input.reusableWorkspaceEntriesRef.current = entries; f.input.reusableWorkspaceSourcesByPathRef.current = sources
    return result
  } })
  f.release(); await f.schedule(); await f.drain()
  assert.equal(useGraphStore.getState().markdownDocumentText, text)
  assert.equal(f.input.reusableWorkspaceEntriesRef.current, entries)
  assert.equal(f.input.reusableWorkspaceSourcesByPathRef.current, sources)
}))
