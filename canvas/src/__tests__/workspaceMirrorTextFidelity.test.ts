import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { initNodeWindowHarness } from '@/tests/lib/windowHarness'
import { readExistingMirrorText } from '@/features/workspace-fs/workspaceSeedProviderLocalIo'
import { withFetchAndEnv, withStoreMirrorState } from './helpers/workspaceSeedMirrorHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildLocalFsFetchPath } from '@/lib/url'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDocsBySourceFiles as readDocProjection } from '@/features/workspace-fs/workspaceSeedProviderStorage'
import { readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated as readHydrated } from '@/features/workspace-fs/workspaceSeedProviderSourceReaders'
import {
  readFirstAgenticGraphStorageDocText as readFirst,
  readWorkspaceDocsMirrorTextViaFetch as readText,
  resetWorkspaceSeedProviderStorageCacheForTests as resetCache,
} from '@/features/workspace-fs/workspaceSeedProviderStorageCache'

const workspaceId = 'kgws:mirror-text-fidelity'
const baseUrl = 'http://localhost'
const docsRoot = '/tmp/agentic-mirror-text-fidelity/docs'
const docPrefix = `/api/storage/doc/${encodeURIComponent(workspaceId)}/`
const docPath = (canonicalPath: string): string => `${docPrefix}${encodeURIComponent(canonicalPath)}`
const rootPaths = new Set([docsRoot, '/tmp/agentic-mirror-text-fidelity/docs_',
  '/tmp/agentic-mirror-text-fidelity/canvas-docs', '/tmp/agentic-mirror-text-fidelity/workspace-seeds'])
type Reply = string | number | Error
type Fixture = { calls: string[]; replies: Map<string, Reply> }

const sourceFile = (path: string, text: string) => ({
  id: `mirror-fidelity:${path}`, name: path.split('/').at(-1)!, text, enabled: true,
  status: 'idle' as const, updatedAtMs: 71, source: { kind: 'local' as const, path },
})
const project = (path: string, text = '# local fallback') => readDocProjection({
  baseUrl, workspaceId, selectedFolderPath: '', sourceFiles: [sourceFile(path, text)],
})

// This fixture models responses only; the real readers, coordinator, cache and
// browser same-origin checks remain active. Unknown calls fail even if caught by a reader.
const withMirrorFixture = async (run: (fixture: Fixture) => Promise<void>): Promise<void> => {
  await withStoreMirrorState(async () => {
    const calls: string[] = [], unexpected: string[] = [], errors: unknown[] = []
    const replies = new Map<string, Reply>(), browserOrigin = window.location.origin
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), browserOrigin)
      calls.push(url.pathname)
      if (url.origin !== browserOrigin || url.search) {
        unexpected.push(url.href)
        throw new Error(`Unexpected mirror fixture origin or query: ${url.href}`)
      }
      if (url.pathname === '/__agentic_os_fs_list') {
        const payload = typeof init?.body === 'string' ? JSON.parse(init.body) as { path?: string } : {}
        if (init?.method === 'POST' && rootPaths.has(String(payload.path))) return new Response(null, { status: 404 })
      } else if (replies.has(url.pathname) && (!init?.method || init.method === 'GET')) {
        const reply = replies.get(url.pathname)!
        if (reply instanceof Error) throw reply
        return typeof reply === 'number'
          ? new Response(null, { status: reply })
          : new Response(reply, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
      unexpected.push(`${init?.method || 'GET'} ${url.pathname}`)
      throw new Error(`Unexpected mirror fixture request: ${unexpected.at(-1)}`)
    }
    resetCache()
    try {
      await withFetchAndEnv({
        VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: 'false',
        VITE_AGENTIC_OS_RUN_READY_DEMO: undefined,
        VITE_AGENTIC_OS_STORAGE_BASE_URL: baseUrl,
        VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: workspaceId,
        VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: 'true',
        VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: docsRoot,
        VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: '/tmp/agentic-mirror-text-fidelity/canvas-docs',
        VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: '/tmp/agentic-mirror-text-fidelity/workspace-seeds',
      }, fetchImpl, async () => {
        useGraphStore.setState({ sourceFiles: [], localMarkdownFolderHandle: null,
          localMarkdownFolderName: null, localMarkdownFolderAccessMode: null,
          localMarkdownFolderCacheId: null, localMarkdownSelectedFolderPath: 'notes' })
        await run({ calls, replies })
      })
    } catch (error) { errors.push(error) }
    finally {
      resetCache()
      try { assert.deepEqual(unexpected, [], 'The fixture must own every observed request') }
      catch (error) { errors.push(error) }
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, errors.map(error => String(error)).join('; '))
  })
}

export async function testWorkspaceMirrorTextMissingRemoteHasNoProjection() {
  await withMirrorFixture(async ({ calls, replies }) => {
    for (const [basename, reply] of [['missing.md', 404], ['offline.md', new TypeError('fixture offline')]] as const) {
      const canonical = `agentic-canvas-os/docs/${basename}`, alias = `docs/${basename}`
      replies.set(docPath(canonical), reply)
      replies.set(docPath(alias), reply)
      assert.deepEqual(await project(alias), [], 'A missing remote document must not manufacture a blank projection')
      assert.equal(await readFirst({ baseUrl, workspaceId, canonicalPathCandidates: [canonical, alias] }), null,
        'Unresolved remote text must remain distinct from an authoritative empty document')
      assert.equal(calls.filter(path => path === docPath(canonical)).length, 1, 'Projection reuses the settled miss')
      assert.equal(calls.filter(path => path === docPath(alias)).length, 1)
    }
  })
}

export async function testWorkspaceMirrorTextCoordinatorPreservesAuthoredFallback() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const text = '\r\n  # Offline café 漢字 🧭\u0000  \n'
    const file = sourceFile('notes/offline-draft.md', text)
    replies.set(docPath(file.source.path), 404)
    useGraphStore.setState({ sourceFiles: [file] })
    const entries = await readWorkspaceInitializationDocsMirrorEntries()
    assert.deepEqual(entries, [{ relPath: 'offline-draft.md', text, updatedAtMs: 71 }],
      'An unavailable remote mirror must leave the selected authored document intact')
    assert.equal(calls.filter(path => path === docPath(file.source.path)).length, 1)
    assert.equal(useGraphStore.getState().sourceFiles[0]?.text, text, 'Reading a mirror must not rewrite source bytes')
  })
}

export async function testWorkspaceMirrorTextEmptySuccessStopsAliases() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const canonical = 'agentic-canvas-os/docs/empty.md', alias = 'docs/empty.md'
    replies.set(docPath(canonical), '')
    replies.set(docPath(alias), '# stale alias content')
    assert.equal(await readFirst({ baseUrl, workspaceId, canonicalPathCandidates: [canonical, alias] }), '')
    assert.deepEqual(await project(alias), [{ relPath: 'empty.md', text: '', updatedAtMs: 71 }],
      'A successful empty response is an authoritative blank projection')
    assert.deepEqual(calls, [docPath(canonical)], 'Successful empty content must stop alias lookup and remain cacheable')
  })
}

export async function testWorkspaceMirrorTextExactBytesSurviveCache() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const canonical = 'agentic-canvas-os/docs/exact.md', alias = 'docs/exact.md'
    const text = '\r\n \t# Café 漢字 🧭\u0000 \r\n'
    replies.set(docPath(canonical), text)
    replies.set(docPath(alias), '# stale alias content')
    assert.equal(await readText(docPath(canonical)), text, 'Successful transport preserves exact authored bytes')
    assert.equal(await readFirst({ baseUrl, workspaceId, canonicalPathCandidates: [canonical, alias] }), text)
    assert.deepEqual(await project(alias), [{ relPath: 'exact.md', text, updatedAtMs: 71 }])
    assert.equal(await readText(docPath(canonical)), text)
    assert.deepEqual(calls, [docPath(canonical)], 'Cache hits must preserve text without another request')
  })
}

export async function testWorkspaceMirrorTextWhitespaceSuccessStopsAliases() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const canonical = 'agentic-canvas-os/docs/whitespace.md', alias = 'docs/whitespace.md'
    const text = ' \t\r\n \n'
    replies.set(docPath(canonical), text)
    replies.set(docPath(alias), '# stale alias content')
    assert.equal(await readFirst({ baseUrl, workspaceId, canonicalPathCandidates: [canonical, alias] }), text)
    assert.deepEqual(await project(alias), [{ relPath: 'whitespace.md', text, updatedAtMs: 71 }])
    assert.deepEqual(calls, [docPath(canonical)], 'Whitespace is successful content, not a reason to load an alias')
  })
}

export async function testWorkspaceMirrorTextSuccessfulRemoteKeepsPriority() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const localText = '# saved local revision', remoteText = '\n  # current remote revision 🧭\u0000\n'
    const file = sourceFile('notes/remote-priority.md', localText)
    replies.set(docPath(file.source.path), remoteText)
    useGraphStore.setState({ sourceFiles: [file] })
    const entries = await readWorkspaceInitializationDocsMirrorEntries()
    assert.deepEqual(entries, [{ relPath: 'remote-priority.md', text: remoteText, updatedAtMs: 71 }],
      'Successful doc-view content retains priority over the selected local snapshot')
    assert.equal(calls.filter(path => path === docPath(file.source.path)).length, 1)
    assert.equal(useGraphStore.getState().sourceFiles[0]?.text, localText, 'Projection leaves the source snapshot unchanged')
  })
}

export async function testWorkspaceMirrorTextHydrationMissPreservesWhitespace() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const text = ' \t\r\n \n', absolutePath = `${docsRoot}/notes/blank.md`
    const localPath = buildLocalFsFetchPath(absolutePath)
    assert.ok(localPath)
    replies.set(new URL(localPath, baseUrl).pathname, 404)
    const canonical = 'agentic-canvas-os/docs/notes/blank.md', alias = 'docs/notes/blank.md'
    replies.set(docPath(canonical), 404)
    replies.set(docPath(alias), new TypeError('fixture offline'))
    const entries = await readHydrated({ sourceFiles: [sourceFile(absolutePath, text)], selectedFolderPath: 'notes',
      storageDocFallback: { baseUrl, workspaceId } })
    assert.deepEqual(entries, [{ relPath: 'blank.md', text, updatedAtMs: 71 }],
      'Failed local and remote hydration must preserve the original whitespace document')
    assert.ok(calls.includes(new URL(localPath, baseUrl).pathname), 'The local fallback was attempted')
    assert.ok(calls.includes(docPath(canonical)) && calls.includes(docPath(alias)), 'Both remote aliases were attempted')
  })
}

export async function testWorkspaceMirrorTextMixedSelectionKeepsEveryDocument() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const remoteText = '\r\n# Published revision 🧭\u0000 \n', authoredText = '\n  # Offline draft 漢字\u0000\r\n'
    const remote = sourceFile('notes/published.md', '# older saved revision')
    const missing = sourceFile('notes/private-draft.md', authoredText)
    replies.set(docPath(remote.source.path), remoteText)
    replies.set(docPath(missing.source.path), 404)
    useGraphStore.setState({ sourceFiles: [remote, missing] })
    const entries = await readWorkspaceInitializationDocsMirrorEntries()
    assert.deepEqual([...entries].sort((left, right) => left.relPath.localeCompare(right.relPath)), [
      { relPath: 'private-draft.md', text: authoredText, updatedAtMs: 71 },
      { relPath: 'published.md', text: remoteText, updatedAtMs: 71 },
    ], 'A partial remote snapshot must retain unresolved selected documents without replacing successful remote text')
    assert.equal(calls.filter(path => path === docPath(remote.source.path)).length, 1)
    assert.equal(calls.filter(path => path === docPath(missing.source.path)).length, 1)
    assert.deepEqual(useGraphStore.getState().sourceFiles.map(file => file.text), [remote.text, authoredText])
  })
}

export async function testWorkspaceMirrorTextLocalEmptySuccessStopsRemoteHydration() {
  await withMirrorFixture(async ({ calls, replies }) => {
    for (const [basename, text] of [['local-empty.md', ''], ['local-whitespace.md', ' \t\r\n ']] as const) {
      const absolutePath = `${docsRoot}/notes/${basename}`
      const localUrl = buildLocalFsFetchPath(absolutePath)
      assert.ok(localUrl)
      const localPath = new URL(localUrl, baseUrl).pathname
      const canonical = `agentic-canvas-os/docs/notes/${basename}`, alias = `docs/notes/${basename}`
      replies.set(localPath, text)
      replies.set(docPath(canonical), '# stale remote content')
      replies.set(docPath(alias), '# stale alias content')
      const before = calls.length
      const entries = await readHydrated({ sourceFiles: [sourceFile(absolutePath, '')], selectedFolderPath: 'notes',
        storageDocFallback: { baseUrl, workspaceId } })
      assert.deepEqual(entries, [{ relPath: basename, text, updatedAtMs: 71 }],
        'A successful local empty or whitespace document is authoritative during hydration')
      assert.deepEqual(calls.slice(before), [localPath], 'Successful local hydration must stop before remote lookup')
    }
  })
}

export async function testWorkspaceMirrorTextExistingEmptySkipsStaleDiskFallback() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mirror-existing-empty-'))
    const absolutePath = path.join(temporaryRoot, 'empty.md'), diskText = '# stale on-disk revision'
    let scope: ReturnType<typeof initNodeWindowHarness> | undefined
    const errors: unknown[] = []
    try {
      await fs.writeFile(absolutePath, diskText, 'utf8')
      const localUrl = buildLocalFsFetchPath(absolutePath)
      assert.ok(localUrl)
      const localPath = new URL(localUrl, baseUrl).pathname
      replies.set(localPath, '')
      scope = initNodeWindowHarness()
      assert.equal(await readExistingMirrorText(absolutePath), '',
        'Successful empty mirror content must stop before the available stale Node filesystem fallback')
      assert.deepEqual(calls, [localPath])
      assert.equal(await fs.readFile(absolutePath, 'utf8'), diskText, 'The read must not rewrite the local file')
    } catch (error) { errors.push(error) }
    finally {
      try { scope?.restore() } catch (error) { errors.push(error) }
      try { await fs.rm(temporaryRoot, { recursive: true, force: true }) } catch (error) { errors.push(error) }
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, errors.map(error => String(error)).join('; '))
  })
}

export async function testWorkspaceMirrorTextCapacityRetainsResolvedRemote() {
  await withMirrorFixture(async ({ calls, replies }) => {
    const { WORKSPACE_DOCS_MIRROR_MAX_FILES: limit } = await import('@/features/workspace-fs/workspaceDocsMirrorNodeReader')
    const remoteText = '\r\n# Remote authority 🧭\u0000\n'
    const remote = sourceFile('notes/zz-resolved.md', '# stale local remote copy')
    const missing = Array.from({ length: limit }, (_, index) => sourceFile(`notes/a-${String(index).padStart(4, '0')}.md`, `# Authored ${index}`))
    replies.set(docPath(remote.source.path), remoteText)
    for (const file of missing) replies.set(docPath(file.source.path), 404)
    useGraphStore.setState({ sourceFiles: [remote, ...missing] })
    const entries = await readWorkspaceInitializationDocsMirrorEntries()
    assert.equal(entries.length, limit, 'The merged view must respect the existing file capacity')
    assert.equal(entries.find(entry => entry.relPath === 'zz-resolved.md')?.text, remoteText,
      'Capacity must reserve successful remote content before filling missing selected-source rows')
    assert.equal(entries.find(entry => entry.relPath === 'a-0000.md')?.text, '# Authored 0')
    assert.equal(calls.filter(value => value.startsWith(docPrefix)).length, Math.min(limit, 16),
      'Fallback merge must not expand the bounded per-document remote probe count')
    assert.equal(useGraphStore.getState().sourceFiles.length, limit + 1, 'Read capacity must never trim the source selection')
  })
}
