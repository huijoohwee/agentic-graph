import assert from 'node:assert/strict'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { withDurableBrowserStorage } from './helpers/durable-browser-storage'
import { createFakeAgenticGraphStorageBrowserSession } from './helpers/fake-agentic-graph-storage-browser-session'
import { createStorageWorkerRequest } from './helpers/fake-agentic-graph-storage-worker-fetch'
import { getAgenticGraphStorageDb, __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agentic-graph-storage-db'
import { syncAgenticGraphStorageNow } from '@/lib/storage/agentic-graph-storage-client-sync'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS, buildAgenticGraphStorageDocPath } from '@/lib/storage/agentic-graph-storage-route-paths'
import { hashAgenticGraphStorageContent } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { resolvePublishedDocIdentity } from '@/features/canvas/canvasDocShareToken.mjs'
import { publishWorkspaceEntriesToAgenticGraphStorage, publishWorkspaceEntryShareUrl } from '@/features/source-files/sourceFileShareUrl'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const entry: WorkspaceEntry = {
  path: '/workspace/chat/share.md', parentPath: '/workspace/chat', name: 'share.md',
  kind: 'file', text: '# Paid deliverable\n\nExact Unicode bytes: café 🌿\n', updatedAtMs: 1,
}
const canonicalPath = 'workspace/chat/share.md'
type Session = Awaited<ReturnType<typeof createFakeAgenticGraphStorageBrowserSession>>
const withBrowser = async (name: string, callback: (session: Session, workspaceId: string) => Promise<void>) => {
  const dom = initJsdomHarness()
  dom.dom.reconfigure({ url: 'https://share.example/' })
  try {
    await withDurableBrowserStorage(async () => {
      const workspaceId = `kgws:share-publication:${name}`
      const session = await createFakeAgenticGraphStorageBrowserSession(workspaceId, { origin: window.location.origin })
      await callback(session, workspaceId)
    })
  } finally { dom.restore() }
}
const argsFor = (session: Session, workspaceId: string) => ({ entry, workspaceId, baseUrl: session.origin, fetchImpl: session.fetch })
const readPublic = (session: Session, workspaceId: string) => session.fetch(
  `${session.origin}${buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)}`, { credentials: 'omit' },
)

export async function testSourceShareExplicitActionPublishesExactBrowserRevision() {
  await withBrowser('roundtrip', async (session, workspaceId) => {
    const args = argsFor(session, workspaceId)
    const local = await publishWorkspaceEntriesToAgenticGraphStorage({ ...args, entries: [entry], syncNow: true })
    assert.equal(local.syncResult?.transportStatus, 'synced')
    assert.equal(session.env.DB.documentPublications.size, 0, 'ordinary sync must remain private')
    assert.equal((await readPublic(session, workspaceId)).status, 404)
    const requests: Request[] = []
    const shareUrl = await publishWorkspaceEntryShareUrl({ ...args, fetchImpl: async (input, init) => {
      requests.push(createStorageWorkerRequest(input, init).clone())
      return session.fetch(input, init)
    } })
    assert.ok(shareUrl)
    const url = new URL(shareUrl)
    assert.equal(url.origin, session.origin)
    assert.deepEqual(resolvePublishedDocIdentity({ shareUrl, baseUrl: session.origin }), { workspaceId, canonicalPath })
    const publications = requests.filter(request => new URL(request.url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications)
    assert.equal(publications.length, 1)
    assert.equal(publications[0]!.headers.has('authorization'), false)
    const body = await publications[0]!.json() as { expectedRevision: number; expectedContentHash: string; documentId: string }
    const document = session.env.DB.documents.get(body.documentId)!
    assert.equal(body.expectedRevision, document.revision)
    assert.equal(body.expectedContentHash, hashAgenticGraphStorageContent(entry.text))
    const reads = requests.filter(request => new URL(request.url).pathname.startsWith(AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix))
    assert.equal(reads.length, 1)
    assert.equal(reads[0]!.credentials, 'omit')
    assert.equal(reads[0]!.headers.has('authorization'), false)
    assert.equal(await (await readPublic(session, workspaceId)).text(), entry.text)
    document.revision = Number(document.revision) + 1
    assert.equal((await readPublic(session, workspaceId)).status, 404, 'later revisions must not inherit publication')
  })
}

export async function testSourceShareExistingPublicSourceReusesAnonymousExactBytes() {
  await withBrowser('reuse', async (session, workspaceId) => {
    const args = argsFor(session, workspaceId)
    const first = await publishWorkspaceEntryShareUrl(args)
    const calls: string[] = []
    const second = await publishWorkspaceEntryShareUrl({ ...args,
      sourcesByPath: { [entry.path]: { kind: 'url', url: `${session.origin}${buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)}` } },
      fetchImpl: async (input, init) => {
        const request = createStorageWorkerRequest(input, init)
        calls.push(`${request.method}:${request.credentials}`)
        return session.fetch(input, init)
      },
    })
    assert.equal(second, first)
    assert.deepEqual(calls, ['GET:omit'], 'already-public exact bytes need no upload or ACL rewrite')
  })
}

export async function testSourceSharePrivateSourceRequiresActualPublication() {
  await withBrowser('private-source', async (session, workspaceId) => {
    const args = argsFor(session, workspaceId)
    await publishWorkspaceEntriesToAgenticGraphStorage({ ...args, entries: [entry], syncNow: true })
    let anonymousMissing = 0
    let publications = 0
    const shareUrl = await publishWorkspaceEntryShareUrl({ ...args,
      sourcesByPath: { [entry.path]: { kind: 'url', url: `${session.origin}${buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)}` } },
      fetchImpl: async (input, init) => {
        const request = createStorageWorkerRequest(input, init)
        const response = await session.fetch(input, init)
        if (request.credentials === 'omit' && response.status === 404) anonymousMissing += 1
        if (new URL(request.url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications) publications += 1
        return response
      },
    })
    assert.ok(shareUrl)
    assert.equal(anonymousMissing, 1)
    assert.equal(publications, 1)
    assert.equal(await (await readPublic(session, workspaceId)).text(), entry.text)
  })
}

export async function testSourceShareForeignSourceNeverReceivesWorkspaceRequests() {
  await withBrowser('foreign-source', async (session, workspaceId) => {
    const origins = new Set<string>()
    const shareUrl = await publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId),
      sourcesByPath: { [entry.path]: { kind: 'url', url: 'https://foreign.example/api/storage/doc/other/private.md' } },
      fetchImpl: async (input, init) => {
        origins.add(new URL(createStorageWorkerRequest(input, init).url).origin)
        return session.fetch(input, init)
      },
    })
    assert.ok(shareUrl)
    assert.deepEqual([...origins], [session.origin])
    assert.equal(await (await readPublic(session, workspaceId)).text(), entry.text)
  })
}

export async function testSourceSharePublicationFailureDoesNotReturnUrl() {
  await withBrowser('publication-failure', async (session, workspaceId) => {
    let failedPublications = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl: async (input, init) => {
      if (new URL(createStorageWorkerRequest(input, init).url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications) {
        failedPublications += 1
        return Response.json({ ok: false, error: 'D1 publication unavailable' }, { status: 500 })
      }
      return session.fetch(input, init)
    } }), /publication/)
    assert.equal(failedPublications, 1)
    assert.equal(session.env.DB.documents.size, 1, 'the durable document must survive failed publication')
    assert.equal(session.env.DB.documentPublications.size, 0)
    assert.equal((await readPublic(session, workspaceId)).status, 404)
  })
}

export async function testSourceShareRejectsMismatchedPublicationReceipt() {
  await withBrowser('wrong-receipt', async (session, workspaceId) => {
    let publicReads = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl: async (input, init) => {
      const request = createStorageWorkerRequest(input, init)
      if (request.credentials === 'omit') publicReads += 1
      const response = await session.fetch(input, init)
      if (new URL(request.url).pathname !== AGENTIC_OS_STORAGE_ROUTE_PATHS.publications) return response
      assert.equal(response.status, 200)
      const receipt = await response.json() as Record<string, unknown>
      return Response.json({ ...receipt, revision: Number(receipt.revision) + 1 })
    } }), /selected revision and content/)
    assert.equal(publicReads, 0, 'an unbound receipt must fail before public URL verification')
  })
}

export async function testSourceShareRejectsChangedDocumentBeforeAclWrite() {
  await withBrowser('stale-revision', async (session, workspaceId) => {
    let publicationStatus = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl: async (input, init) => {
      const request = createStorageWorkerRequest(input, init)
      const isPublication = new URL(request.url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications
      if (isPublication) {
        const document = [...session.env.DB.documents.values()][0]!
        document.revision = Number(document.revision) + 1
        document.content_md = '# Concurrent edit'
        document.content_hash = hashAgenticGraphStorageContent(document.content_md)
      }
      const response = await session.fetch(input, init)
      if (isPublication) publicationStatus = response.status
      return response
    } }), /publication/)
    assert.equal(publicationStatus, 409)
    assert.equal(session.env.DB.documentPublications.size, 0)
  })
}

export async function testSourceShareRejectsOversizedAnonymousReadback() {
  await withBrowser('oversized-readback', async (session, workspaceId) => {
    let cancellations = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl: async (input, init) => {
      const request = createStorageWorkerRequest(input, init)
      const response = await session.fetch(input, init)
      if (request.credentials !== 'omit') return response
      assert.equal(response.status, 200, 'the native ACL must permit the actual anonymous read')
      await response.body?.cancel()
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode(`${entry.text}unexpected`)) },
        cancel() { cancellations += 1 },
      }))
    } }), /not anonymously readable/)
    assert.equal(cancellations, 1, 'readback must cancel after exceeding selected byte length')
  })
}

export async function testSourceShareMemoryOnlyQueueCannotMintUrl() {
  const dom = initJsdomHarness()
  try {
    await __resetAgenticGraphStorageDbForTests()
    assert.equal((await getAgenticGraphStorageDb()).persistence.getState().mode, 'memory')
    let calls = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ entry, workspaceId: 'kgws:share-memory', fetchImpl: async () => {
      calls += 1
      throw new Error('Memory-only browser sync must not reach a remote transport')
    } }), /durable|sync|storage/i)
    assert.equal(calls, 0)
    assert.equal((await (await getAgenticGraphStorageDb()).collections.documents.find().exec()).length, 1, 'failed sharing keeps the local document')
  } finally {
    try { await __resetAgenticGraphStorageDbForTests() } finally { dom.restore() }
  }
}

export async function testSourceShareWaitsForInFlightSyncThenPushesSelectedEntry() {
  await withBrowser('in-flight', async (session, workspaceId) => {
    const deviceId = 'share-owner-device'
    await publishWorkspaceEntriesToAgenticGraphStorage({ ...argsFor(session, workspaceId), entries: [{ ...entry, path: '/workspace/chat/earlier.md', name: 'earlier.md' }], syncNow: false })
    let resolvePull!: () => void
    let enteredPull!: () => void
    const heldPull = new Promise<void>(resolve => { resolvePull = resolve })
    const pullEntered = new Promise<void>(resolve => { enteredPull = resolve })
    let firstPull = true
    let pushes = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = createStorageWorkerRequest(input, init)
      const path = new URL(request.url).pathname
      if (path === AGENTIC_OS_STORAGE_ROUTE_PATHS.push) pushes += 1
      const response = await session.fetch(input, init)
      if (path === AGENTIC_OS_STORAGE_ROUTE_PATHS.pull && firstPull) {
        firstPull = false
        enteredPull()
        await heldPull
      }
      return response
    }
    const first = syncAgenticGraphStorageNow({ workspaceId, baseUrl: session.origin, fetchImpl, deviceId })
    let second: ReturnType<typeof publishWorkspaceEntryShareUrl> | undefined
    try {
      await pullEntered
      second = publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), deviceId, fetchImpl })
      const db = await getAgenticGraphStorageDb()
      let selectedQueued = false
      for (let turn = 0; turn < 100; turn += 1) {
        const pending = await db.collections.syncOutbox.find({ selector: { workspaceId } }).exec()
        selectedQueued = pending.some(row => (row.get('payload') as { record?: { canonicalPath?: string } }).record?.canonicalPath === canonicalPath)
        if (selectedQueued) break
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))
      }
      assert.equal(selectedQueued, true, 'the selected write must exist while the earlier pull is held')
      await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0))
      assert.equal(pushes, 1, 'the second sync must wait for the first owned operation')
      resolvePull()
      assert.ok(await second)
      assert.equal((await first).transportStatus, 'synced')
      assert.equal(pushes, 2, 'the explicit action must flush work added after the first push')
      assert.equal(await (await readPublic(session, workspaceId)).text(), entry.text)
      assert.equal([...session.env.DB.documents.values()].filter(row => !row.deleted).length, 2, 'targeted share cannot tombstone unrelated source documents')
    } finally {
      resolvePull()
      await Promise.allSettled([first, ...(second ? [second] : [])])
    }
  })
}

export async function testSourceShareReadOnlyMemberCannotPublishOrWrite() {
  await withBrowser('viewer', async (session, workspaceId) => {
    session.env.DB.workspaceMemberships.get(session.membershipId)!.role = 'viewer'
    let publications = 0
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl: async (input, init) => {
      if (new URL(createStorageWorkerRequest(input, init).url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications) publications += 1
      return session.fetch(input, init)
    } }))
    assert.equal(session.env.DB.documents.size, 0)
    assert.equal(session.env.DB.documentPublications.size, 0)
    assert.equal(publications, 0, 'failed sync authorization stops before publication')
    assert.equal((await (await getAgenticGraphStorageDb()).collections.documents.find().exec()).length, 1, 'the local document survives denied remote write')
  })
}

export async function testSourceShareBomAndUnicodePreserveExactReadbackBytes() {
  await withBrowser('exact-bytes', async (session, workspaceId) => {
    const selected = { ...entry, text: '\uFEFF# Exact source\n\nPrice €; astral 🌿; café; NUL \u0000 tail.\n' }
    const expected = new TextEncoder().encode(selected.text)
    assert.deepEqual([...expected.slice(0, 3)], [0xef, 0xbb, 0xbf])
    assert.equal(expected.includes(0), true)
    const shareUrl = await publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), entry: selected })
    assert.ok(shareUrl, 'BOM-prefixed exact bytes must finish the same verified share loop')
    const response = await readPublic(session, workspaceId)
    assert.equal(response.status, 200)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected)
  })
}

export async function testSourceShareBacklogStopsBeforeUnsentDocumentPublication() {
  await withBrowser('backlog', async (session, workspaceId) => {
    const earlier = Array.from({ length: 50 }, (_value, index) => ({
      ...entry, path: `/workspace/chat/earlier-${index}.md`, name: `earlier-${index}.md`,
    }))
    await publishWorkspaceEntriesToAgenticGraphStorage({ ...argsFor(session, workspaceId), entries: earlier, syncNow: false })
    const db = await getAgenticGraphStorageDb()
    const queued = await db.collections.syncOutbox.find({ selector: { workspaceId } }).exec()
    assert.equal(queued.length, 50)
    // These writes model an earlier offline backlog; wall-clock ties must not
    // accidentally move the new selection ahead of an old write in this fixture.
    for (const row of queued) await row.incrementalPatch({ createdAtMs: 1 })
    let publications = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (new URL(createStorageWorkerRequest(input, init).url).pathname === AGENTIC_OS_STORAGE_ROUTE_PATHS.publications) publications += 1
      return session.fetch(input, init)
    }
    await assert.rejects(publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl }), /selected document is still queued/)
    assert.equal(publications, 0, 'an unsent selection must not probe publication or poison route availability')
    assert.equal(session.env.DB.documents.size, 50)
    assert.equal(session.env.DB.documentPublications.size, 0)
    const pending = await db.collections.syncOutbox.find({ selector: { workspaceId } }).exec()
    assert.equal(pending.length, 1, 'one bounded sync leaves only the new selection queued')
    assert.equal((pending[0]!.get('payload') as { record: { canonicalPath: string } }).record.canonicalPath, canonicalPath)
    const retryUrl = await publishWorkspaceEntryShareUrl({ ...argsFor(session, workspaceId), fetchImpl })
    assert.ok(retryUrl, 'a later explicit retry must complete without a recursive queue drain')
    assert.equal(publications, 1)
    assert.equal([...session.env.DB.documents.values()].filter(row => !row.deleted).length, 51)
    assert.equal(await (await readPublic(session, workspaceId)).text(), entry.text)
  })
}
