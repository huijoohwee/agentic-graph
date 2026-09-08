import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createFakeAgenticGraphStorageBrowserSession } from './helpers/fake-agentic-graph-storage-browser-session'
import { createStorageWorkerRequest } from './helpers/fake-agentic-graph-storage-worker-fetch'
import { AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID, AGENTIC_OS_STORAGE_API_VERSION } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { readPaginatedWorkspaceStorageMirror, readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport } from '@/features/workspace-fs/workspaceSeedProviderStorage'
import { readPublishedAgenticDocsMirrorEntries } from '@/features/workspace-fs/workspacePublishedAgenticDocsSource'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES, WORKSPACE_DOCS_MIRROR_MAX_FILES } from '@/features/workspace-fs/workspaceDocsMirrorNodeReader'

type Session = Awaited<ReturnType<typeof createFakeAgenticGraphStorageBrowserSession>>
const updatedAt = '2020-01-02T00:00:00.000Z'
const putDocument = (session: Session, workspaceId: string, id: string, text: string, path = `docs/${id}.md`) => {
  session.env.DB.documents.set(id, {
    id, workspace_id: workspaceId, canonical_path: path, title: id, doc_type: 'markdown', lang: null,
    graph_id: null, source_kind: 'markdown', content_md: text, content_hash: `hash:${id}`,
    parser_version: 'test', revision: 1, deleted: 0, created_at: updatedAt, updated_at: updatedAt,
  })
}
const putChunk = (session: Session, workspaceId: string, documentId: string, id: string, markdown: string, order = 0) => {
  session.env.DB.documentChunks.set(id, {
    id, workspace_id: workspaceId, document_id: documentId, chunk_key: id, chunk_order: order,
    heading: null, markdown, token_estimate: 0, content_hash: `hash:${id}`,
    updated_at: '2020-01-01T00:00:00.000Z',
  })
}

const withMirrorSession = async (workspaceId: string, run: (session: Session) => Promise<void>): Promise<void> => {
  const { dom, restore } = initJsdomHarness()
  dom.reconfigure({ url: 'http://localhost:5173/workspace/mirror' })
  const previousFetch = globalThis.fetch
  const keys = ['VITE_AGENTIC_OS_STORAGE_BASE_URL', 'VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT']
  const previousEnv = keys.map(key => process.env[key])
  resetWorkspaceSeedProviderStorageCacheForTests()
  let failure: unknown, failed = false
  const cleanupErrors: unknown[] = []
  try {
    const session = await createFakeAgenticGraphStorageBrowserSession(workspaceId, { origin: dom.window.location.origin })
    process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = session.origin
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = ''
    globalThis.fetch = session.fetch
    await run(session)
  } catch (error) { failed = true; failure = error }
  finally {
    try { globalThis.fetch = previousFetch } catch (error) { cleanupErrors.push(error) }
    try {
      keys.forEach((key, i) => {
        if (previousEnv[i] === undefined) delete process.env[key]
        else process.env[key] = previousEnv[i]
      })
    } catch (error) { cleanupErrors.push(error) }
    try { resetWorkspaceSeedProviderStorageCacheForTests() } catch (error) { cleanupErrors.push(error) }
    try { restore() } catch (error) { cleanupErrors.push(error) }
  }
  const errors = [...(failed ? [failure] : []), ...cleanupErrors]
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'Mirror fixture body and cleanup failed')
}

const readSelected = (session: Session, workspaceId: string) => readPaginatedWorkspaceStorageMirror({
  baseUrl: session.origin, workspaceId,
  selectDocument: document => document.canonicalPath.endsWith('.md')
    ? { relPath: document.canonicalPath, updatedAtMs: document.updatedAtMs } : null,
})

export async function testWorkspaceStorageMirrorConsumesNativePagesAndExactChunkBytes() {
  const workspaceId = 'mirror:native-pages'
  await withMirrorSession(workspaceId, async session => {
    for (let index = 0; index < 101; index += 1) {
      putDocument(session, workspaceId, `document-${String(index).padStart(3, '0')}`, `# ${index}`)
    }
    putDocument(session, workspaceId, 'zz-chunked', '')
    putDocument(session, workspaceId, 'whitespace-inline', ' \n')
    putDocument(session, workspaceId, 'excluded', 'x'.repeat(WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES + 1), 'files/raw.bin')
    putChunk(session, workspaceId, 'zz-chunked', 'z', '')
    putChunk(session, workspaceId, 'zz-chunked', 'a', '  \n')
    putChunk(session, workspaceId, 'zz-chunked', 'B', '')
    putChunk(session, workspaceId, 'zz-chunked', 'b', 'Buyer 🧭 paid artefact')
    putChunk(session, workspaceId, 'whitespace-inline', 'ignore-derived', 'derived must not replace inline whitespace')
    const requests: Request[] = []
    let parentPage = -1, firstChunkPage = -1
    globalThis.fetch = async (input, init) => {
      requests.push(createStorageWorkerRequest(input, init))
      const response = await session.fetch(input, init)
      const page = await response.clone().json() as { documents: Array<{ id: string }>; documentChunks: Array<{ documentId: string }> }
      if (page.documents.some(document => document.id === 'zz-chunked')) parentPage = requests.length
      if (firstChunkPage < 0 && page.documentChunks.some(chunk => chunk.documentId === 'zz-chunked')) firstChunkPage = requests.length
      return response
    }
    const entries = await readSelected(session, workspaceId)
    assert.equal(entries.length, 103)
    assert.ok(firstChunkPage > 0 && parentPage > firstChunkPage, 'native pages must place the parent after its chunks')
    assert.equal(entries.find(entry => entry.relPath === 'docs/document-100.md')?.text, '# 100')
    assert.equal(entries.find(entry => entry.relPath === 'docs/zz-chunked.md')?.text,
      ['', '  \n', 'Buyer 🧭 paid artefact', ''].join('\n\n'))
    assert.equal(entries.find(entry => entry.relPath === 'docs/whitespace-inline.md')?.text, ' \n')
    assert.equal(entries.some(entry => entry.relPath === 'files/raw.bin'), false)
    assert.ok(requests.length >= 2, 'the real Worker must require more than one bounded page')
    assert.equal(new URL(requests[0]!.url).searchParams.has('cursor'), false)
    assert.ok(requests.slice(1).every(request => new URL(request.url).searchParams.has('cursor')))
    assert.ok(requests.every(request => request.credentials === 'same-origin' && !request.headers.has('authorization')))
  })
}

export async function testPublishedStorageMirrorFailureDoesNotCachePartialPages() {
  const workspaceId = AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID
  await withMirrorSession(workspaceId, async session => {
    for (let index = 0; index < 101; index += 1) {
      putDocument(session, workspaceId, `canonical-${index}`, `# Canonical ${index}`,
        `agentic-canvas-os/docs/canonical-${index}.md`)
    }
    let failLaterPage = true, requests = 0
    globalThis.fetch = async (input, init) => {
      requests += 1
      const request = createStorageWorkerRequest(input, init)
      if (failLaterPage && new URL(request.url).searchParams.has('cursor')) {
        return Response.json({ ok: false, error: 'fixture unavailable' }, { status: 503 })
      }
      return session.fetch(input, init)
    }
    assert.deepEqual(await readPublishedAgenticDocsMirrorEntries(), [])
    const failedRequests = requests
    assert.equal(failedRequests, 2)
    failLaterPage = false
    const complete = await readPublishedAgenticDocsMirrorEntries()
    assert.equal(complete.length, 101, 'a failed partial load must retry instead of caching absence')
    assert.ok(complete.every(entry => entry.authority === 'agentic-canvas-os-storage'))
    assert.ok(complete.some(entry => entry.text === '# Canonical 100'))
    assert.ok(requests > failedRequests)
    const completedRequests = requests
    complete[0]!.text = 'caller mutation'
    const reused = await readPublishedAgenticDocsMirrorEntries()
    assert.equal(requests, completedRequests, 'the explicit canonical settled-cache policy must remain intact')
    assert.notEqual(reused[0]!.text, 'caller mutation')
  })
}

export async function testWorkspaceStorageMirrorAuthFailureRetriesWithoutCachingAbsence() {
  const workspaceId = 'mirror:auth-retry'
  await withMirrorSession(workspaceId, async session => {
    putDocument(session, workspaceId, 'invoice', '# Paid invoice')
    const membership = session.env.DB.workspaceMemberships.get(session.membershipId)!
    session.env.DB.workspaceMemberships.delete(session.membershipId)
    await assert.rejects(readSelected(session, workspaceId), /storage export failed/)
    assert.deepEqual(await readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport({
      workspaceId, baseUrl: session.origin, selectedFolderPath: '',
    }), [], 'optional storage failure must leave other bootstrap sources usable')
    session.env.DB.workspaceMemberships.set(session.membershipId, membership)
    const entries = await readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport({
      workspaceId, baseUrl: session.origin, selectedFolderPath: '',
    })
    assert.equal(entries.find(entry => entry.relPath === 'invoice.md')?.text, '# Paid invoice')
  })
}

export async function testWorkspaceStorageMirrorPreservesFilePolicyAndRejectsOverflow() {
  const workspaceId = 'mirror:capacity'
  await withMirrorSession(workspaceId, async session => {
    putDocument(session, workspaceId, 'exact-limit', '🧭'.repeat(WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES / 4))
    assert.equal(new TextEncoder().encode((await readSelected(session, workspaceId))[0]!.text).byteLength,
      WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES)
    putDocument(session, workspaceId, 'exact-limit', '🧭'.repeat(WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES / 4) + 'x')
    await assert.rejects(readSelected(session, workspaceId), /file byte capacity exceeded/)
    session.env.DB.documents.clear()
    for (let index = 0; index < WORKSPACE_DOCS_MIRROR_MAX_FILES; index += 1) {
      putDocument(session, workspaceId, `limit-${index}`, '')
    }
    assert.equal((await readSelected(session, workspaceId)).length, WORKSPACE_DOCS_MIRROR_MAX_FILES)
    putDocument(session, workspaceId, 'over-file-count', '')
    await assert.rejects(readSelected(session, workspaceId), /file count capacity exceeded/)
  })
}

export async function testWorkspaceStorageMirrorRejectsForeignAndOrphanedChunkOwners() {
  const workspaceId = 'mirror:ownership'
  await withMirrorSession(workspaceId, async session => {
    putDocument(session, workspaceId, 'chunked', '')
    putChunk(session, workspaceId, 'chunked', 'chunk', 'private source')
    globalThis.fetch = async (input, init) => {
      const response = await session.fetch(input, init)
      const page = await response.json() as { documentChunks: Array<{ workspaceId: string }> }
      page.documentChunks[0]!.workspaceId = 'foreign-workspace'
      return Response.json(page)
    }
    await assert.rejects(readSelected(session, workspaceId), /workspace|owner/)
    for (const mutate of [
      (page: any) => { page.documentChunks[0].documentId = 123 },
      (page: any) => { page.documents[0].deleted = 'false' },
    ]) {
      globalThis.fetch = async (input, init) => {
        const page = await (await session.fetch(input, init)).json()
        mutate(page)
        return Response.json(page)
      }
      await assert.rejects(readSelected(session, workspaceId), /invalid.*owner or content/)
    }
    globalThis.fetch = async (input, init) => {
      const page = await (await session.fetch(input, init)).json() as any
      page.documents[0].id = ' chunked '
      page.documentChunks[0].documentId = ' chunked '
      page.documentChunks[0].id = 'a '
      page.documentChunks.push({ ...page.documentChunks[0], id: 'a', markdown: 'prefix first' })
      return Response.json(page)
    }
    assert.equal((await readSelected(session, workspaceId))[0]!.text, 'prefix first\n\nprivate source',
      'raw padded IDs must remain distinct and retain their bytewise ordering')
    globalThis.fetch = session.fetch
    session.env.DB.documents.delete('chunked')
    await assert.rejects(readSelected(session, workspaceId), /chunks without their document/)
  })
}

export async function testWorkspaceStorageMirrorBoundsPendingParentIdentityBytes() {
  const workspaceId = 'mirror:pending-identity'
  await withMirrorSession(workspaceId, async session => {
    let requests = 0
    globalThis.fetch = async () => {
      requests += 1
      return Response.json({
        ok: true, apiVersion: AGENTIC_OS_STORAGE_API_VERSION, workspaceId, exportedAtMs: Date.now(),
        documents: [], graphSnapshots: [], pageComplete: requests === 21,
        nextPageCursor: requests === 21 ? null : `next-${requests}`,
        documentChunks: [{ id: `chunk-${requests}`, documentId: `${requests}-` + 'p'.repeat(400 * 1024),
          workspaceId, chunkKey: `key-${requests}`, chunkOrder: 0, heading: null, markdown: '',
          tokenEstimate: 0, contentHash: 'empty', updatedAtMs: 1 }],
      })
    }
    await assert.rejects(readSelected(session, workspaceId), /identity capacity exceeded/)
    assert.equal(requests, 21, 'empty bodies must not evade retained parent-key capacity accounting')
  })
}
