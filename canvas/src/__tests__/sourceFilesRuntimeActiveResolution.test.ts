import assert from 'node:assert/strict'
import { withFetchAndEnv, withStoreMirrorState } from './helpers/workspaceSeedMirrorHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { readWorkspaceActiveDocumentResolvedText, readWorkspaceActiveEntrySnapshot } from '@/features/source-files/sourceFilesRuntimeActive'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { frontmatterFlowTextHasRepeatedCanonicalStringResidue } from '@/features/parsers/markdownFrontmatterFlowRepair'
import { buildLocalFsFetchPath } from '@/lib/url'
import { LS_KEYS } from '@/lib/config'
import { getLocalStorage } from '@/lib/persistence'

const docsRoot = '/tmp/agentic-active-resolution-fixture/docs'
const basename = 'runtime-active-resolution.md'
const activePath = `/docs/${basename}`
const activeUrl = buildLocalFsFetchPath(`${docsRoot}/${basename}`)
const entry = (text = ''): WorkspaceEntry => ({ path: activePath, parentPath: '/docs', kind: 'file', name: basename, text, updatedAtMs: 1 })
const memoryFs = (text?: string) => createMemoryWorkspaceFs({ initialEntries: [
  { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
  { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
  ...(typeof text === 'string' ? [entry(text)] : []),
] })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}
type Timer = ReturnType<typeof globalThis.setTimeout>
type Control = {
  own<T>(operation: Promise<T>): Promise<T>
  release(callback: () => void): void
  fireDeadline(): void
}

// Drive the real owner's scheduled deadline, with a separate wall-clock rescue;
// no polling, elapsed-time sleeps, replacement transport, or fake fetch success.
const withOwnedDeadlines = async (run: (control: Control) => Promise<void>): Promise<void> => {
  const descriptors = ['setTimeout', 'clearTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const schedule = globalThis.setTimeout.bind(globalThis), clear = globalThis.clearTimeout.bind(globalThis)
  const timers = new Map<Timer, () => void>(), owned: Promise<unknown>[] = [], releases: Array<() => void> = [], errors: unknown[] = []
  const own = <T>(operation: Promise<T>) => { void operation.catch(() => undefined); owned.push(operation); return operation }
  const bounded = async (operation: Promise<unknown>, label: string, delay: number) => {
    let timer: Timer | undefined
    try { await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = schedule(() => reject(new Error(`Active resolution fixture ${label} did not settle`)), delay)
    })]) } finally { if (timer !== undefined) clear(timer) }
  }
  const wrappedSet = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const timer = schedule(callback, delay, ...args)
    if (Number(delay) > 4000 && Number(delay) <= 8000) timers.set(timer, () => callback(...args))
    return timer
  }) as typeof globalThis.setTimeout
  const wrappedClear = ((timer?: Timer) => { if (timer !== undefined) timers.delete(timer); clear(timer) }) as typeof globalThis.clearTimeout
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, writable: true, value: wrappedSet })
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, writable: true, value: wrappedClear })
  const operation = own(Promise.resolve().then(() => run({
    own, release: callback => releases.push(callback),
    fireDeadline() {
      assert.equal(timers.size, 1, 'The pending active-file read must own exactly one bounded mirror deadline')
      const [timer, callback] = timers.entries().next().value!
      timers.delete(timer); clear(timer); callback()
    },
  })))
  try { await bounded(operation, 'body', 3000) } catch (error) { errors.push(error) }
  finally {
    for (const release of releases.reverse()) { try { release() } catch (error) { errors.push(error) } }
    try { await bounded(Promise.allSettled(owned), 'owned request drain', 1000) } catch (error) { errors.push(error) }
    if (timers.size) errors.push(new Error('Active resolution retained deadline timers after owned requests drained'))
    for (const timer of timers.keys()) clear(timer)
    for (const [key, descriptor] of descriptors) {
      try {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else assert.equal(Reflect.deleteProperty(globalThis, key), true)
      } catch (error) { errors.push(error) }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'Active resolution and owned fixture cleanup failed')
}

const heldBody = (control: Control, status = 200) => {
  const pulled = deferred<void>(), canceled = deferred<void>(), cancelFinished = deferred<void>()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancellations = 0, released = false
  control.own(cancelFinished.promise)
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    pull() { pulled.resolve() },
    cancel() { cancellations += 1; canceled.resolve(); return cancelFinished.promise },
  }, { highWaterMark: 0 })
  control.release(() => {
    released = true; cancelFinished.resolve(); pulled.resolve(); canceled.resolve()
    if (!cancellations) controller.close()
  })
  return { body, response: new Response(body, { status }), pulled: pulled.promise, canceled: canceled.promise,
    get cancellations() { return cancellations }, get released() { return released } }
}

type ActiveFixture = Control & {
  setDirect(handler: (init?: RequestInit) => Promise<Response>): void
  resolve(): Promise<string>
  readonly calls: number
}
const withActiveFixture = (run: (fixture: ActiveFixture) => Promise<void>) => withStoreMirrorState(async () => {
  assert.ok(activeUrl, 'Fixture root must pass the native absolute-filesystem URL guard')
  const store = useGraphStore.getState()
  store.setSourceFiles([])
  store.setLocalMarkdownFolderHandle(null)
  store.setLocalMarkdownFolderCacheId(null, null)
  store.setLocalMarkdownSelectedFolderPath(docsRoot)
  const storage = getLocalStorage()
  assert.ok(storage, 'The actual browser storage owner must be available')
  const oldRoot = storage.getItem(LS_KEYS.workspaceDocsMirrorRootPath)
  storage.setItem(LS_KEYS.workspaceDocsMirrorRootPath, docsRoot)
  let handler: (init?: RequestInit) => Promise<Response> = async () => new Response('', { status: 404 })
  let calls = 0
  const unexpected: string[] = []
  const fetcher = (async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === '/__agentic_os_fs_list') {
      const requestedRoot = JSON.parse(String(init?.body || '{}')).path
      return Response.json({ ok: true, files: requestedRoot === docsRoot ? [
        { relPath: 'unrelated-owner-fixture.md', text: '# Available local root', updatedAtMs: 1 },
      ] : [] })
    }
    if (url === activeUrl) { calls += 1; return handler(init) }
    unexpected.push(url)
    return new Response('', { status: 404 })
  }) as typeof fetch
  resetWorkspaceSeedProviderStorageCacheForTests(); invalidateCachedWorkspaceActiveEntrySnapshot()
  try {
    await withFetchAndEnv({
      VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: docsRoot,
      VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: 'false',
      VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: 'false', VITE_AGENTIC_OS_RUN_READY_DEMO: '',
    }, fetcher, () => withOwnedDeadlines(async control => {
      await run({ ...control, setDirect: next => { handler = next }, get calls() { return calls },
        resolve: () => control.own(readWorkspaceActiveDocumentResolvedText({ activePath, fs: memoryFs() })),
      })
      assert.deepEqual(unexpected, [], 'The public active resolver must stay on the provided local fixture routes')
    }))
  } finally {
    resetWorkspaceSeedProviderStorageCacheForTests(); invalidateCachedWorkspaceActiveEntrySnapshot()
    if (oldRoot === null) storage.removeItem(LS_KEYS.workspaceDocsMirrorRootPath)
    else storage.setItem(LS_KEYS.workspaceDocsMirrorRootPath, oldRoot)
  }
})

export async function testActiveDocsRootPendingHeadersDeadline() {
  await withActiveFixture(async fixture => {
    const entered = deferred<void>(), headers = deferred<Response>(), late = heldBody(fixture)
    fixture.own(headers.promise); fixture.release(() => headers.resolve(late.response))
    let signal: AbortSignal | null | undefined
    fixture.setDirect(init => { signal = init?.signal; entered.resolve(); return headers.promise })
    const operation = fixture.resolve()
    await Promise.race([entered.promise, operation.then(() => { throw new Error('Active resolver finished before direct fetch') })])
    fixture.fireDeadline()
    assert.equal(await operation, '', 'Unresponsive local headers cannot hold active document hydration indefinitely')
    assert.equal(signal?.aborted, true)
    headers.resolve(late.response)
    await late.canceled
    assert.equal(late.cancellations, 1)
    assert.equal(late.released, false, 'Late-body disposal cannot wait for a nonsettling producer cancel')
    assert.equal(fixture.calls, 1)
  })
}

export async function testActiveDocsRootPendingBodyDeadline() {
  await withActiveFixture(async fixture => {
    const pending = heldBody(fixture)
    let signal: AbortSignal | null | undefined
    fixture.setDirect(async init => { signal = init?.signal; return pending.response })
    const operation = fixture.resolve()
    await Promise.race([pending.pulled, operation.then(() => { throw new Error('Active resolver finished before reading the body') })])
    fixture.fireDeadline()
    assert.equal(await operation, '')
    assert.equal(signal?.aborted, true)
    assert.equal(pending.cancellations, 1)
    assert.equal(pending.released, false)
    assert.equal(pending.body.locked, false, 'Timeout releases the reader lock without awaiting producer cancellation')
    assert.equal(fixture.calls, 1)
  })
}

export async function testActiveDocsRootRejectedBodyDisposed() {
  await withActiveFixture(async fixture => {
    for (const status of [401, 503]) {
      const rejected = heldBody(fixture, status)
      fixture.setDirect(async () => rejected.response)
      assert.equal(await fixture.resolve(), '')
      assert.equal(rejected.cancellations, 1, `Unread HTTP ${status} body must be disposed`)
      assert.equal(rejected.released, false)
      assert.equal(rejected.body.locked, false)
    }
    assert.equal(fixture.calls, 2, 'Rejected reads do not install a reusable empty active-file result')
  })
}

export async function testActiveDocsRootRetainsExactWhitespace() {
  await withActiveFixture(async fixture => {
    const text = '\n \t# Buyer receipt 🧾\r\n\n  authored spacing  \n\t'
    fixture.setDirect(async () => new Response(text))
    assert.equal(await fixture.resolve(), text, 'Deadline reuse must retain authored leading/trailing whitespace')
    assert.equal(fixture.calls, 1)
  })
}

const canonical = ['---', 'flow:', '  nodes:', '    - id: buyer_summary', '      type: ComputeWidget',
  '      label: {key: label, type: string, value: "Buyer Summary"}', '---', '', '# Authored workflow', '', ''].join('\n')
const corrupt = canonical.replace('value: "Buyer Summary"', 'value: "Buyer SummaryBuyer Summary residue Buyer Summary"')

export async function testActiveSnapshotRetainsItsSingleCanonicalRepair() {
  await withActiveFixture(async fixture => {
    assert.equal(frontmatterFlowTextHasRepeatedCanonicalStringResidue({ documentName: basename,
      currentText: corrupt, canonicalText: canonical }), true, 'Fixture must trigger the actual parser-backed repair guard')
    fixture.setDirect(async () => fixture.calls === 1 ? new Response(canonical) : new Response('', { status: 503 }))
    const fs = memoryFs(corrupt), writes: Array<{ path: string; text: string }> = []
    const read = fs.readFileText.bind(fs)
    let reads = 0
    fs.readFileText = async path => { reads += 1; return read(path) }
    const write = fs.writeFileText.bind(fs)
    fs.writeFileText = async (path, text) => { writes.push({ path, text }); await write(path, text) }
    const provided = [entry(corrupt)]
    const snapshot = await fixture.own(readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: provided }))
    assert.equal(snapshot[0]?.text, canonical, 'Return the canonical bytes chosen by this snapshot, even if another lookup would fail')
    assert.equal(reads, 1, 'A confirmed repair candidate rechecks the original raw text once before returning its projection')
    assert.equal(await read(activePath), corrupt, 'Reading a canonical projection does not authorize replacing persisted bytes')
    assert.deepEqual(writes, [], 'A repair projection has no authority to write local or host source bytes')
    assert.equal(fixture.calls, 1, 'One snapshot cannot resolve canonical authority twice from the original corrupt text')
    assert.equal(provided[0].text, corrupt, 'The caller-owned input snapshot is not mutated')
  })
}

export async function testActiveSnapshotPreservesOrdinaryUserEdits() {
  await withActiveFixture(async fixture => {
    const edited = canonical.replace('value: "Buyer Summary"', 'value: "Buyer authored title"') + '\n  Buyer notes remain.\n'
    assert.equal(frontmatterFlowTextHasRepeatedCanonicalStringResidue({ documentName: basename,
      currentText: edited, canonicalText: canonical }), false)
    fixture.setDirect(async () => new Response(canonical))
    const fs = memoryFs(edited), writes: string[] = []
    const write = fs.writeFileText.bind(fs)
    fs.writeFileText = async (path, text) => { writes.push(text); await write(path, text) }
    const snapshot = await fixture.own(readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: [entry(edited)] }))
    assert.equal(snapshot[0]?.text, edited)
    assert.equal(await fs.readFileText(activePath), edited)
    assert.deepEqual(writes, [], 'Canonical authority cannot replace ordinary user edits')
    assert.equal(fixture.calls, 1, 'Preserved user text still requires only one canonical comparison')
  })
}

const assertAuthoredChangeDuringCanonicalRepair = (authoredText: string) => withActiveFixture(async fixture => {
  assert.equal(frontmatterFlowTextHasRepeatedCanonicalStringResidue({ documentName: basename,
    currentText: corrupt, canonicalText: canonical }), true, 'The retained snapshot must trigger the native repair guard')
  const entered = deferred<void>(), headers = deferred<Response>()
  fixture.own(headers.promise)
  fixture.release(() => headers.resolve(new Response(canonical)))
  fixture.setDirect(() => { entered.resolve(); return headers.promise })
  const fs = memoryFs(corrupt), writes: string[] = []
  const write = fs.writeFileText.bind(fs)
  fs.writeFileText = async (path, text) => { writes.push(text); await write(path, text) }
  const provided = [entry(corrupt)]
  const operation = fixture.own(readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: provided }))
  await Promise.race([entered.promise, operation.then(() => { throw new Error('Snapshot completed before canonical lookup was held') })])
  await fs.writeFileText(activePath, authoredText)
  headers.resolve(new Response(canonical))
  const snapshot = await operation
  assert.deepEqual({ persisted: await fs.readFileText(activePath), returned: snapshot[0]?.text, writes },
    { persisted: authoredText, returned: authoredText, writes: [authoredText] },
    'Delayed canonical repair must preserve newer authored bytes and return their current snapshot without a stale write')
  assert.equal(provided[0].text, corrupt, 'The caller-owned earlier snapshot must remain unchanged')
  assert.equal(fixture.calls, 1, 'A rejected stale repair does not repeat remote resolution')
})

export async function testActiveSnapshotPreservesEditDuringCanonicalRepair() {
  await assertAuthoredChangeDuringCanonicalRepair(canonical.replace('Buyer Summary', 'Buyer revised heading') + '\nNew buyer-authored notes 🧾\0\n')
}

export async function testActiveSnapshotPreservesClearDuringCanonicalRepair() {
  await assertAuthoredChangeDuringCanonicalRepair('')
}

export async function testActiveSnapshotPreservesDeletionDuringCanonicalRepair() {
  await withActiveFixture(async fixture => {
    const entered = deferred<void>(), headers = deferred<Response>()
    fixture.own(headers.promise)
    fixture.release(() => headers.resolve(new Response(canonical)))
    fixture.setDirect(() => { entered.resolve(); return headers.promise })
    const fs = memoryFs(corrupt), writes: string[] = []
    const write = fs.writeFileText.bind(fs)
    fs.writeFileText = async (path, text) => { writes.push(text); await write(path, text) }
    const provided = [entry(corrupt)]
    const operation = fixture.own(readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: provided }))
    await Promise.race([entered.promise, operation.then(() => { throw new Error('Snapshot completed before canonical lookup was held') })])
    await fs.deleteEntry(activePath)
    headers.resolve(new Response(canonical))
    const snapshot = await operation
    assert.equal(snapshot[0]?.text, undefined, 'A file deleted during repair remains unavailable in the returned snapshot')
    assert.equal(await fs.readFileText(activePath), null, 'Delayed canonical repair must not resurrect a deleted file')
    assert.deepEqual(writes, [])
    assert.equal(provided[0].text, corrupt)
    assert.equal(fixture.calls, 1, 'A deleted candidate does not repeat remote resolution')
  })
}

export async function testActiveSnapshotRejectsFailedFreshReadDuringCanonicalRepair() {
  await withActiveFixture(async fixture => {
    const entered = deferred<void>(), headers = deferred<Response>()
    fixture.own(headers.promise)
    fixture.release(() => headers.resolve(new Response(canonical)))
    fixture.setDirect(() => { entered.resolve(); return headers.promise })
    const fs = memoryFs(corrupt), writes: string[] = []
    const read = fs.readFileText.bind(fs), write = fs.writeFileText.bind(fs)
    fs.writeFileText = async (path, text) => { writes.push(text); await write(path, text) }
    const provided = [entry(corrupt)], readError = new Error('Owned filesystem read failed while checking the canonical projection')
    const operation = fixture.own(readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: provided }))
    await Promise.race([entered.promise, operation.then(() => { throw new Error('Snapshot completed before canonical lookup was held') })])
    let reads = 0
    fs.readFileText = async () => { reads += 1; throw readError }
    headers.resolve(new Response(canonical))
    await assert.rejects(operation, error => error === readError, 'A failed fresh read must not return a stale canonical success')
    assert.equal(reads, 1)
    assert.equal(await read(activePath), corrupt)
    assert.deepEqual(writes, [])
    assert.equal(provided[0].text, corrupt)
    assert.equal(fixture.calls, 1, 'A failed fresh read does not repeat remote resolution')
  })
}


export async function testWorkspaceMirrorHarnessRestoresOwnedFolderState() {
  const previousStore = useGraphStore.getState()
  const failures: Error[] = []
  const handle = Object.freeze({ kind: 'directory', name: 'owner-directory' }) as unknown as FileSystemDirectoryHandle
  try {
    for (const folderKind of ['directory', 'cached'] as const) {
      for (const throws of [false, true]) {
        const label = `${folderKind}/${throws ? 'throws' : 'success'}`
        const store = useGraphStore.getState()
        store.setSourceFiles([{
          id: 'mirror-harness-owner', name: 'owner.md', text: '\n  Owner-authored bytes 🧾\n',
          enabled: true, status: 'idle', source: { kind: 'local', path: 'workspace:/notes/owner.md' },
        }])
        if (folderKind === 'directory') {
          store.setLocalMarkdownFolderHandle(handle, { accessMode: 'opfs', name: 'Owner display name' })
        } else {
          store.setLocalMarkdownFolderCacheId('owner-durable-folder-cache', 'Cached owner display name')
        }
        store.setLocalMarkdownSelectedFolderPath('/docs/owner-selected-folder')
        const expected = useGraphStore.getState()
        const bodyError = new Error(`Expected mirror harness body failure: ${label}`)
        const bodyMarker = `body-owned value: ${label}`
        let caught: unknown
        try {
          await withStoreMirrorState(async () => {
            const current = useGraphStore.getState()
            current.setSourceFiles([])
            current.setLocalMarkdownFolderCacheId('temporary-fixture-cache', 'Temporary fixture folder')
            current.setLocalMarkdownSelectedFolderPath('/docs/temporary-fixture')
            useGraphStore.setState({ renderOpMsg: bodyMarker })
            if (throws) throw bodyError
          })
        } catch (error) { caught = error }
        try {
          assert.strictEqual(caught, throws ? bodyError : undefined, `${label}: preserve the body outcome`)
          const actual = useGraphStore.getState()
          assert.strictEqual(actual.localMarkdownFolderHandle, expected.localMarkdownFolderHandle, `${label}: restore the exact directory handle`)
          assert.equal(actual.localMarkdownFolderName, expected.localMarkdownFolderName, `${label}: restore folder display name`)
          assert.equal(actual.localMarkdownFolderAccessMode, expected.localMarkdownFolderAccessMode, `${label}: restore access ownership`)
          assert.equal(actual.localMarkdownFolderCacheId, expected.localMarkdownFolderCacheId, `${label}: restore durable cache identity`)
          assert.equal(actual.localMarkdownSelectedFolderPath, expected.localMarkdownSelectedFolderPath, `${label}: restore selected path`)
          assert.strictEqual(actual.sourceFiles, expected.sourceFiles, `${label}: restore the exact source-file snapshot`)
          assert.equal(actual.sourceFiles[0]?.text, '\n  Owner-authored bytes 🧾\n')
          assert.equal(actual.renderOpMsg, bodyMarker, `${label}: do not overwrite unrelated body-owned state`)
        } catch (error) {
          failures.push(new Error(`${label}: ${String((error as Error)?.message ?? error)}`, { cause: error }))
        }
      }
    }
  } finally { useGraphStore.setState(previousStore, true) }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('; '))
}
