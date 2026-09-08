import assert from 'node:assert/strict'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import { createStorageWorkerFetch } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { __resetAgenticGraphStorageDbForTests, getAgenticGraphStorageDb, AGENTIC_OS_STORAGE_COLLECTION_NAMES, type AgenticGraphStorageRecordMap, type AgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import { syncAgenticGraphStorageNow, queueAgenticGraphStorageMutation } from '@/lib/storage/agentic-graph-storage-client-sync'
import { AGENTIC_OS_STORAGE_API_VERSION, hashAgenticGraphStorageContent } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { applyPulledAgenticGraphStorageChangesToSourceFiles, applyReviewedAgenticGraphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'
import { createFixture, syncMigrations } from '@/__tests__/helpers/native-agentic-graph-storage-fixture'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createIndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import { compareAndCommitAgenticGraphStorageMutationUnit } from '@/lib/storage/agentic-graph-storage-db'
import { agenticGraphStorageChildStateKeys, planAgenticGraphStorageChildState } from '@/lib/storage/agentic-graph-storage-child-state'
import { pushAgenticGraphStorageOutbox } from '@/lib/storage/agentic-graph-storage-client-push'
import { AGENTIC_OS_STORAGE_SYNC_API_VERSION, type AgenticGraphStorageChildState, type AgenticGraphStorageOutboxRecord } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { initNodeWindowHarness } from '@/tests/lib/windowHarness'
import type { AgenticGraphStorageMutation, KgDocumentRecord, KgDocumentChunkRecord, KgGraphSnapshotRecord } from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { QueueAgenticGraphStorageMutationArgs, AgenticGraphStoragePulledChangesApplyArgs } from '@/lib/storage/agentic-graph-storage-client-types'
import { normalizeSourceFileRecord } from '@/features/source-files/sourceFileParsedState'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readAgenticGraphStorageSyncPageRows } from '../../../cloudflare/workers/agentic-graph-storage/storageSyncPageRows'
import { readBoundedPullChangeRows } from '../../../cloudflare/workers/agentic-graph-storage/storageSyncReadRows'
import { AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA, type AgenticGraphStorageSyncCursor } from '../../../cloudflare/workers/agentic-graph-storage/storageSyncCursor'

export async function testStorageChildStateMonotonicDurability() {
  Dexie.dependencies.indexedDB = indexedDB
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  const databaseName = `child-state:${Date.now()}`
  const first = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  const second = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  const state: AgenticGraphStorageChildState = { workspaceId: 'wk:state', documentId: 'doc', recordId: 'child',
    entity: 'documentChunk', chunkKey: 'one', deleted: false, syncRevision: 1, updatedAtMs: 1 }
  const commit = async (next: AgenticGraphStorageChildState) =>
    compareAndCommitAgenticGraphStorageMutationUnit(first, await planAgenticGraphStorageChildState(first, next))
  try {
    const plans = await Promise.all([first, second].map((db, index) =>
      planAgenticGraphStorageChildState(db, { ...state, syncRevision: index + 1, updatedAtMs: index + 1 })))
    const committed = await Promise.all([first, second].map((db, index) =>
      compareAndCommitAgenticGraphStorageMutationUnit(db, plans[index]!)))
    assert.equal(committed.filter(Boolean).length, 1, 'only one tab may consume the observed marker state')
    const moved = { ...state, chunkKey: 'two', syncRevision: 3, updatedAtMs: 3 }
    assert.ok(await commit(moved))
    assert.ok(await commit({ ...state, deleted: true, syncRevision: 2, updatedAtMs: 2 }))
    const physical = agenticGraphStorageChildStateKeys(state)[0]
    assert.equal((await first.collections.syncChildState.findOne(physical).exec())?.get('syncRevision'), 3,
      'an older identity tombstone cannot erase a later physical move')
    const restored = { ...moved, recordId: 'restored', syncRevision: 4, updatedAtMs: 4 }
    assert.ok(await commit(restored))
    const stale = await planAgenticGraphStorageChildState(first, moved)
    assert.equal(stale.newestRevision, 4, 'changed-ID restoration must fence stale physical aliases')
    assert.equal(stale.mutations.length, 0)
    await assert.rejects(() => planAgenticGraphStorageChildState(first, { ...restored, deleted: true }), /reused/)
    assert.notEqual(agenticGraphStorageChildStateKeys({ ...state, documentId: 'a:b', chunkKey: 'c' })[1],
      agenticGraphStorageChildStateKeys({ ...state, documentId: 'a', chunkKey: 'b:c' })[1])
    const reopened = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
      collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
    try {
      const keys = agenticGraphStorageChildStateKeys(restored)
      for (const id of keys) assert.equal((await reopened.collections.syncChildState.findOne(id).exec())?.get('syncRevision'), 4)
    } finally { await reopened.db.close() }
  } finally { await second.db.close(); await first.db.remove() }
}

export async function testStorageChildAcknowledgementNativeLifecycle() {
  const origin = (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://native-ack.example'
  const fixture = await createFixture(syncMigrations, { workspaceId: 'wk:native-ack', origin })
  const dbState = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({ storageKey: 'native-child-ack',
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES], persistent: false })
  const workspaceId = fixture.workspaceId
  const original: KgGraphSnapshotRecord = { id: 'graph', workspaceId, documentId: 'doc', graphRevision: 19,
    graphHash: 'initial', graphJson: { nodes: [], edges: [] }, layoutJson: null,
    derivedFromDocumentRevision: 1, updatedAtMs: 1 }
  const queue = (record: KgGraphSnapshotRecord, op: 'upsert' | 'delete' = 'upsert', base?: number | null) =>
    queueAgenticGraphStorageMutation({ workspaceId, deviceId: 'sender', dbState, entity: 'graphSnapshot',
      record, op, ...(base === undefined ? {} : { baseRevision: base }) })
  const push = (fetchImpl = fixture.fetch) => pushAgenticGraphStorageOutbox({ workspaceId, deviceId: 'sender',
    dbState, baseUrl: fixture.auth.origin, fetchImpl, maxRetryCount: 1, pushBatchSize: 10 })
  try {
    fixture.document('doc')
    await dbState.collections.graphSnapshots.incrementalUpsert(original)
    const firstId = await queue(original)
    assert.equal((await dbState.collections.syncOutbox.findOne(firstId).exec())?.get('baseRevision'), null,
      'graph payload revision is never an observed sync revision')
    assert.equal((await push()).appliedCount, 1)
    const initial = (await dbState.collections.graphSnapshots.findOne(original.id).exec())!.toJSON()
    assert.ok(Number.isSafeInteger(initial.syncRevision) && initial.syncRevision! > 0)
    assert.equal(initial.graphRevision, 19)
    assert.equal(await dbState.collections.syncOutbox.findOne(firstId).exec(), null)
    assert.equal((await dbState.collections.syncChildState.find().exec()).length, 2)
    const changed = { ...initial, graphHash: 'changed', graphJson: { edges: [], nodes: [{ id: 'new' }] } }
    await dbState.collections.graphSnapshots.incrementalUpsert(changed)
    const nextId = await queue(changed)
    assert.equal((await dbState.collections.syncOutbox.findOne(nextId).exec())?.get('baseRevision'), initial.syncRevision)
    assert.equal((await push()).appliedCount, 1)
    const updated = (await dbState.collections.graphSnapshots.findOne(original.id).exec())!.toJSON()
    assert.ok(updated.syncRevision! > initial.syncRevision!)
    assert.equal(updated.graphRevision, 19)
    const nullId = await queue(updated, 'upsert', null)
    const nullRow = (await dbState.collections.syncOutbox.findOne(nullId).exec())!
    assert.equal(nullRow.get('baseRevision'), null, 'explicit new-record intent must stay explicit')
    await nullRow.remove()
    await assert.rejects(() => queue({ ...updated, syncRevision: 1.5 }), /observed/)
    await queue(updated, 'delete')
    assert.equal((await push()).appliedCount, 1)
    assert.equal(await dbState.collections.graphSnapshots.findOne(original.id).exec(), null)
    for (const row of await dbState.collections.syncChildState.find().exec()) assert.equal(row.get('deleted'), true)
    assert.equal(fixture.sql.prepare('select count(*) n from graph_snapshots').get()?.n, 0)
    const absent = { ...original, id: 'never-published', graphRevision: 20 }
    await dbState.collections.graphSnapshots.incrementalUpsert(absent)
    await queue(absent, 'delete')
    assert.equal((await push()).appliedCount, 1, 'deleting a never-published draft needs no invented server revision')
    assert.equal(await dbState.collections.graphSnapshots.findOne(absent.id).exec(), null)
    assert.equal((await dbState.collections.syncChildState.find().exec()).length, 2, 'absent deletion creates no fake tombstone')
    const legacyId = await queue(updated)
    const legacyRow = (await dbState.collections.syncOutbox.findOne(legacyId).exec())!
    const { syncApiVersion: _version, ...legacy } = legacyRow.toJSON()
    await dbState.collections.syncOutbox.incrementalUpsert(legacy)
    const result = await push(async () => { throw new Error('legacy child must not reach transport') })
    const retained = (await dbState.collections.syncOutbox.findOne(legacyId).exec())!.toJSON()
    assert.equal(result.pushedCount, 0)
    assert.equal(result.conflictCount, 1)
    assert.deepEqual(retained.payload, legacy.payload)
    assert.equal(retained.payloadHash, legacy.payloadHash)
    assert.equal(retained.baseRevision, legacy.baseRevision)
    assert.equal(retained.syncApiVersion, undefined)
  } finally { await dbState.db.remove(); fixture.close() }
}

export async function testStorageChildAcknowledgementValidationAndReplacement() {
  const origin = (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://validation.example'
  const dbState = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({ storageKey: 'child-ack-validation',
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES], persistent: false })
  const workspaceId = 'wk:child-ack-validation', ids: string[] = []
  const chunks: KgDocumentChunkRecord[] = ['one', 'two'].map(id => ({ id, workspaceId, documentId: 'doc',
    chunkKey: id, chunkOrder: 0, heading: null, markdown: id, tokenEstimate: 1,
    contentHash: hashAgenticGraphStorageContent(id), updatedAtMs: 1 }))
  const state = (record: KgDocumentChunkRecord): AgenticGraphStorageChildState => ({ workspaceId,
    entity: 'documentChunk', documentId: record.documentId, recordId: record.id, chunkKey: record.chunkKey,
    syncRevision: 7, updatedAtMs: 7, deleted: false })
  try {
    for (const record of chunks) {
      await dbState.collections.documentChunks.incrementalUpsert(record)
      ids.push(await queueAgenticGraphStorageMutation({ workspaceId, dbState, deviceId: 'sender',
        entity: 'documentChunk', op: 'upsert', record }))
    }
    const snapshot = async () => JSON.stringify((await dbState.collections.syncOutbox.find().exec()).map(row => row.toJSON()))
    const before = await snapshot()
    for (const invalid of ['version', 'missing', 'revision', 'deleted', 'workspace', 'entity', 'key']) {
      let responseCount = 0
      await assert.rejects(() => pushAgenticGraphStorageOutbox({ workspaceId, dbState, deviceId: 'sender',
        baseUrl: origin, maxRetryCount: 1, pushBatchSize: 10,
        fetchImpl: async () => { responseCount += 1; return Response.json({ ok: true,
          apiVersion: invalid === 'version' ? AGENTIC_OS_STORAGE_API_VERSION : AGENTIC_OS_STORAGE_SYNC_API_VERSION,
          workspaceId, ackCursor: null, serverTimeMs: 1,
          acknowledgements: chunks.map((record, index) => ({ mutationId: ids[index], entity: 'documentChunk',
            recordId: record.id, status: 'applied', serverRevision: 7, message: null,
            childState: index === 1 && invalid === 'missing' ? null : { ...state(record),
              ...(index !== 1 ? {} : invalid === 'revision' ? { syncRevision: 8 }
                : invalid === 'deleted' ? { deleted: true } : invalid === 'workspace' ? { workspaceId: 'foreign' }
                  : invalid === 'entity' ? { entity: 'graphSnapshot', graphRevision: 0 }
                    : invalid === 'key' ? { chunkKey: 'foreign' } : {}) },
          })) }) },
      }))
      assert.equal(responseCount, 1, `${invalid}: exercise the acknowledgement validator after transport`)
      assert.equal(await snapshot(), before, `${invalid}: validate every acknowledgement before the first effect`)
      assert.equal((await dbState.collections.syncChildState.find().exec()).length, 0)
    }
    const fixture = await createFixture(syncMigrations, { workspaceId, origin })
    try {
      fixture.document('doc')
      let newer: KgDocumentChunkRecord | undefined
      let replacedId = ''
      let replacement: AgenticGraphStorageOutboxRecord | undefined
      const result = await pushAgenticGraphStorageOutbox({ workspaceId, dbState, deviceId: 'sender',
        baseUrl: fixture.auth.origin, maxRetryCount: 1, pushBatchSize: 1, fetchImpl: async (input, init) => {
          const response = await fixture.fetch(input, init)
          const request = JSON.parse(String(init?.body)) as { mutations: AgenticGraphStorageMutation[] }
          replacedId = request.mutations[0]!.mutationId
          const sent = (await dbState.collections.syncOutbox.findOne(replacedId).exec())!.toJSON()
          newer = { ...(request.mutations[0]!.record as KgDocumentChunkRecord), markdown: 'new local bytes' }
          replacement = { ...sent, payload: { ...sent.payload, record: newer } }
          await dbState.collections.syncOutbox.incrementalUpsert(replacement)
          await dbState.collections.documentChunks.incrementalUpsert(newer)
          return response
        } })
      assert.equal(result.appliedCount, 0)
      assert.ok(replacedId && newer, 'the replacement must target the mutation actually selected for transmission')
      assert.deepEqual((await dbState.collections.syncOutbox.findOne(replacedId).exec())?.toJSON(), replacement)
      assert.deepEqual((await dbState.collections.documentChunks.findOne(newer.id).exec())?.toJSON(), newer)
      assert.equal((await dbState.collections.syncChildState.find().exec()).length, 0,
        'a replaced sent row must prevent the entire acknowledgement transaction')
    } finally { fixture.close() }
  } finally { await dbState.db.remove() }
}

export async function testAgenticGraphStorageSameTimestampPullAndUnchangedReplay() {
  await __resetAgenticGraphStorageDbForTests()
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const fetchImpl = createStorageWorkerFetch(env)
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_same_timestamp'
  const deviceId = 'dev_same_timestamp_reader'
  const documentId = 'sf:same-timestamp'
  const canonicalPath = 'workspace:/scratch/same-timestamp.md'
  const baseUrl = (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com'
  const syncArgs = { workspaceId, deviceId, baseUrl, fetchImpl, dbState }
  const originalSourceFiles = useGraphStore.getState().sourceFiles
  let documentWrites = 0
  const subscription = dbState.collections.documents.$.subscribe(() => { documentWrites += 1 })
  const failures: unknown[] = []
  try {
    const push = async (revision: number, contentMd: string, updatedAtMs: number) => {
      const response = await fetchImpl(new URL('/api/storage/push', baseUrl), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId, deviceId: 'dev_same_timestamp_writer',
          mutations: [{
            mutationId: `boundary-${revision}`, workspaceId, entity: 'document', op: 'upsert',
            recordId: documentId, baseRevision: revision === 1 ? null : revision - 1,
            record: {
              id: documentId, workspaceId, canonicalPath, title: 'Same timestamp', docType: 'note', lang: 'en-US',
              graphId: null, sourceKind: 'markdown', contentMd, contentHash: hashAgenticGraphStorageContent(contentMd),
              parserVersion: '1.0.0', revision, updatedAtMs, deleted: false,
            },
          }],
        }),
      })
      const body = await response.json() as { acknowledgements?: Array<{ status: string }> }
      assert.equal(response.status, 200, JSON.stringify(body))
      assert.deepEqual(body.acknowledgements?.map(ack => ack.status), ['applied'])
    }
    await push(1, '# Before', Date.now() - 1_000)
    const initial = await syncAgenticGraphStorageNow(syncArgs)
    assert.equal(initial.pulledDocumentCount, 1)
    assert.equal(documentWrites, 1)
    const boundary = initial.lastPullCursor
    assert.ok(boundary)
    const cursor = await dbState.collections.syncCursor.findOne(`${workspaceId}:${deviceId}`).exec()
    assert.ok(cursor)
    const replayBoundary = () => cursor.incrementalPatch({ lastPullCursor: boundary })
    // Own the emulated database clock; client timestamps no longer set SQL time.
    env.DB.statementTime = () => boundary
    await push(2, '# After', Date.parse(boundary))
    assert.equal(env.DB.documents.get(documentId)?.updated_at, boundary)
    const changed = await syncAgenticGraphStorageNow(syncArgs)
    assert.equal(changed.pulledDocumentCount, 1, 'a write at the exact previous cursor must be pulled')
    let cached = await dbState.collections.documents.findOne(documentId).exec()
    assert.equal(cached?.get('contentMd'), '# After')
    assert.equal(cached?.get('documentRevision'), 2)
    assert.equal(documentWrites, 2)

    // A chunk-trigger parent bump can change revision without changing its stored content hash.
    await push(3, '# After', Date.parse(boundary))
    await replayBoundary()
    await syncAgenticGraphStorageNow(syncArgs)
    cached = await dbState.collections.documents.findOne(documentId).exec()
    assert.equal(cached?.get('documentRevision'), 3)
    assert.equal(cached?.get('contentHash'), hashAgenticGraphStorageContent('# After'))
    assert.equal(documentWrites, 3, 'revision-only changes must reach the durable cache')

    // Replaying the last saved boundary models the same overlap after a resumed pull.
    await replayBoundary()
    const expectedSource = normalizeSourceFileRecord({
      id: 'same-timestamp', name: 'same-timestamp.md', text: '# After', enabled: true,
      status: 'idle', source: { kind: 'local', path: canonicalPath },
    })
    useGraphStore.setState({ sourceFiles: [expectedSource] })
    const projection = useGraphStore.getState()
    let callbackCount = 0
    const overlap = await syncAgenticGraphStorageNow({
      ...syncArgs,
      onPulledChangesApplied: async args => {
        callbackCount += 1
        const applied = applyPulledAgenticGraphStorageChangesToSourceFiles(args)
        await applied.completion
        assert.equal(applied.applied, false, 'an unchanged overlap must not rewrite the source projection')
      },
    })
    assert.equal(overlap.pulledDocumentCount, 1)
    assert.equal(callbackCount, 1, 'exercise the real inbound projection even when cache writes are skipped')
    assert.equal(documentWrites, 3, 'identical overlaps must not enqueue another document/history write')
    const current = useGraphStore.getState()
    assert.equal(current.sourceFiles, projection.sourceFiles)
    assert.equal(current.graphData, projection.graphData)
    assert.equal(current.history, projection.history)
    assert.equal(current.historyIndex, projection.historyIndex)
  } catch (error) { failures.push(error) }
  for (const cleanup of [
    () => subscription.unsubscribe(),
    () => useGraphStore.setState({ sourceFiles: originalSourceFiles }),
    () => __resetAgenticGraphStorageDbForTests(),
  ]) {
    try { await cleanup() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'storage boundary regression and cleanup failed')
}

export async function testAgenticGraphStorageInclusiveSinceKeepsStrictPagePosition() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'wk_boundary_pages'
  const boundary = '2026-09-06T00:00:00.000Z'
  const row = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, workspace_id: workspaceId, canonical_path: `${id}.md`, content_md: id, content_hash: id,
    parser_version: 'test', revision: 1, deleted: 0, created_at: boundary, updated_at: boundary, ...overrides,
  })
  for (const id of ['a', 'b']) env.DB.documents.set(id, row(id))
  env.DB.documentChunks.set('a', { id: 'a', workspace_id: workspaceId, document_id: 'a', chunk_key: 'body',
    chunk_order: 0, markdown: 'a', content_hash: 'a', token_estimate: 1, updated_at: boundary })
  env.DB.graphSnapshots.set('a', { id: 'a', workspace_id: workspaceId, document_id: 'a', graph_revision: 1,
    graph_hash: 'a', graph_json: '{}', derived_from_document_revision: 1, updated_at: boundary })
  env.DB.documents.set('old', row('old', { updated_at: '2026-09-05T23:59:59.999Z' }))
  env.DB.documents.set('future', row('future', { updated_at: '2026-09-06T00:00:00.001Z' }))
  env.DB.documents.set('foreign', row('foreign', { workspace_id: 'another-workspace' }))
  let cursor: AgenticGraphStorageSyncCursor | null = null
  const positions: string[] = []
  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    const page = await readAgenticGraphStorageSyncPageRows({
      db: env.DB, workspaceId, since: boundary, snapshotAt: boundary, cursor,
      maxRows: 1, maxStoredResultBytes: 10_000,
    })
    assert.equal(page.documents.length + page.documentChunks.length + page.graphSnapshots.length, 1)
    assert.ok(page.lastKey)
    assert.equal(page.lastKey.updated_at, boundary)
    positions.push(`${page.lastKey.entity_rank}:${page.lastKey.id}`)
    assert.equal(page.hasMore, pageIndex < 3)
    cursor = {
      schema: AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA, workspaceId, mode: 'sync', since: boundary, snapshotAt: boundary,
      lastUpdatedAt: page.lastKey.updated_at, lastEntityRank: page.lastKey.entity_rank, lastId: page.lastKey.id,
    }
  }
  // Child page positions use monotonic sync-state row identity, not reusable child IDs.
  assert.deepEqual(positions, ['1:a', '1:b', '2:1', '3:2'])
  const exhausted = await readAgenticGraphStorageSyncPageRows({
    db: env.DB, workspaceId, since: boundary, snapshotAt: boundary, cursor,
    maxRows: 1, maxStoredResultBytes: 10_000,
  })
  assert.equal(exhausted.lastKey, null)
  assert.equal(exhausted.hasMore, false)
  // The legacy bounded reader shares the lower boundary, but has no snapshot upper bound.
  const legacy = await readBoundedPullChangeRows(env.DB, workspaceId, boundary)
  assert.equal(legacy.limitExceeded, null)
  assert.deepEqual(legacy.documents.map(document => document.id), ['a', 'b', 'future'])
  assert.deepEqual(legacy.documentChunks.map(chunk => chunk.id), ['a'])
  assert.deepEqual(legacy.graphSnapshots.map(graph => graph.id), ['a'])
}

export const withNativeDeletionCase = async (
  name: string,
  run: (context: Awaited<ReturnType<typeof createNativeDeletionCase>>) => Promise<void>,
) => {
  const windowOwner = initNodeWindowHarness()
  const originalState = useGraphStore.getState()
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const failures: unknown[] = []
  let context: Awaited<ReturnType<typeof createNativeDeletionCase>> | undefined
  try {
    await __resetAgenticGraphStorageDbForTests()
    context = await createNativeDeletionCase(name)
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: context.fetchImpl })
    useGraphStore.setState({ sourceFiles: [] })
    await run(context)
  } catch (error) { failures.push(error) }
  for (const cleanup of [
    () => context?.fixture.close(),
    () => context?.sender.db.remove(),
    () => context?.sender.db.close(),
    () => __resetAgenticGraphStorageDbForTests(),
    () => useGraphStore.setState(originalState, true),
    () => originalFetch ? Object.defineProperty(globalThis, 'fetch', originalFetch) : Reflect.deleteProperty(globalThis, 'fetch'),
    () => windowOwner.restore(),
  ]) {
    try { await cleanup() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length) throw new AggregateError(failures, failures.map(error => String(error)).join('; '))
}

const createNativeDeletionCase = async (name: string) => {
  const workspaceId = `wk_native_delete_${name}`
  const fixture = await createFixture(syncMigrations, { workspaceId, origin: `https://storage-${name}.example` })
  try {
    const receiver = await getAgenticGraphStorageDb()
    const sender = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
      storageKey: workspaceId, collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES], persistent: false,
    })
    const pullRequests: Array<{ knownChunks: Array<{ id: string }> }> = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/api/storage/pull') pullRequests.push(await request.clone().json())
      return fixture.fetch(request)
    }) as typeof fetch
    const sync = (dbState: AgenticGraphStorageDb, onPulledChangesApplied?: (args: AgenticGraphStoragePulledChangesApplyArgs) => Promise<void>) =>
      syncAgenticGraphStorageNow({ workspaceId, deviceId: dbState === receiver ? 'receiver' : 'sender',
        dbState, baseUrl: fixture.auth.origin, fetchImpl, onPulledChangesApplied })
    const queue = (dbState: AgenticGraphStorageDb, entity: AgenticGraphStorageMutation['entity'],
      record: AgenticGraphStorageMutation['record'], op: 'upsert' | 'delete' = 'upsert', baseRevision: number | null = null) =>
      queueAgenticGraphStorageMutation({ workspaceId, deviceId: dbState === receiver ? 'receiver' : 'sender',
        dbState, entity, record, op, baseRevision } as QueueAgenticGraphStorageMutationArgs)
    const document = (suffix = 'target', contentMd = ''): KgDocumentRecord => ({
      id: `sf:${name}_${suffix}`, workspaceId, canonicalPath: `workspace:/docs/${name}-${suffix}.md`,
      title: suffix, docType: 'markdown', lang: null, graphId: `sf-graph:${name}_${suffix}`, sourceKind: 'markdown',
      contentMd, contentHash: hashAgenticGraphStorageContent(contentMd), parserVersion: 'fixture-v1', revision: 1,
      updatedAtMs: Date.now(), deleted: false,
    })
    const chunk = (parent: KgDocumentRecord, order: number, markdown: string): KgDocumentChunkRecord => ({
      id: `chunk:${parent.id}:${order}`, documentId: parent.id, workspaceId, chunkKey: `part-${order}`,
      chunkOrder: order, heading: null, markdown, tokenEstimate: 1,
      contentHash: hashAgenticGraphStorageContent(markdown), updatedAtMs: Date.now(),
    })
    const graph = (parent: KgDocumentRecord): KgGraphSnapshotRecord => ({
      id: parent.graphId!, documentId: parent.id, workspaceId, graphRevision: 1,
      graphHash: `hash:${parent.id}`, graphJson: { type: 'Graph', nodes: [{ id: `node:${parent.id}`, label: parent.title }], edges: [], metadata: {} },
      layoutJson: null, derivedFromDocumentRevision: 1, updatedAtMs: Date.now(),
    })
    const source = (parent: KgDocumentRecord) => useGraphStore.getState().sourceFiles.find(file => file.id === parent.id.slice(3))
    const reviewed = async (args: AgenticGraphStoragePulledChangesApplyArgs) => {
      const before = useGraphStore.getState().sourceFiles
      const unreviewed = applyPulledAgenticGraphStorageChangesToSourceFiles(args)
      await unreviewed.completion
      assert.equal(unreviewed.applied, false, 'repository projection requires explicit acceptance')
      assert.equal(useGraphStore.getState().sourceFiles, before)
      const accepted = applyReviewedAgenticGraphStorageChangesToSourceFiles(args)
      await accepted.completion
    }
    const seed = async (records: Array<[AgenticGraphStorageMutation['entity'], AgenticGraphStorageMutation['record']]>) => {
      for (const [entity, record] of records) await queue(sender, entity, record)
      const sent = await sync(sender)
      assert.equal(sent.appliedCount, records.length)
      await sync(receiver, reviewed)
    }
    const checks: unknown[] = []
    const check = (assertion: () => void) => { try { assertion() } catch (error) { checks.push(error) } }
    const finish = () => { if (checks.length) throw new AggregateError(checks, checks.map(error => String(error)).join('; ')) }
    return { fixture, sender, receiver, workspaceId, fetchImpl, pullRequests, sync, queue, document, chunk, graph, source, reviewed, seed, check, finish }
  } catch (error) { await fixture.close(); throw error }
}

export async function testAgenticGraphStorageRemoteChunkRemoval() {
  await withNativeDeletionCase('chunk', async c => {
    const doc = c.document(), first = c.chunk(doc, 0, '# Removed'), second = c.chunk(doc, 1, '# Retained')
    await c.seed([['document', doc], ['documentChunk', first], ['documentChunk', second]])
    assert.equal(c.source(doc)?.text, '# Removed\n\n# Retained')
    const observed = (await c.sender.collections.documentChunks.findOne(first.id).exec())!.toJSON()
    await c.queue(c.sender, 'documentChunk', first, 'delete', observed.syncRevision!)
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    assert.equal(c.fixture.sql.prepare('SELECT count(*) AS n FROM document_chunks WHERE id = ?').get(first.id)?.n, 0)
    await c.sync(c.receiver, c.reviewed)
    const removed = await c.receiver.collections.documentChunks.findOne(first.id).exec()
    const retained = await c.receiver.collections.documentChunks.findOne(second.id).exec()
    c.check(() => assert.equal(removed, null, 'remote deletion must remove the cached first chunk'))
    c.check(() => assert.equal(retained?.get('markdown'), '# Retained'))
    c.check(() => assert.equal(c.source(doc)?.text, '# Retained', 'projection must reconstruct the remaining cached chunks'))
    let writes = 0
    const subscription = c.receiver.collections.documentChunks.$.subscribe(() => { writes += 1 })
    try {
      await c.sync(c.receiver, c.reviewed)
      c.check(() => assert.ok(!c.pullRequests.at(-1)?.knownChunks.some(row => row.id === first.id), 'knownChunks must retire deleted IDs'))
      c.check(() => assert.equal(writes, 0, 'unchanged reconnect must not rewrite cached chunks'))
    } finally { subscription.unsubscribe() }
    c.finish()
  })
}

export async function testAgenticGraphStorageRemoteFinalChunkRemoval() {
  await withNativeDeletionCase('final', async c => {
    const doc = c.document(), only = c.chunk(doc, 0, '# Previously nonblank')
    await c.seed([['document', doc], ['documentChunk', only]])
    assert.equal(c.source(doc)?.text, '# Previously nonblank')
    const observed = (await c.sender.collections.documentChunks.findOne(only.id).exec())!.toJSON()
    await c.queue(c.sender, 'documentChunk', only, 'delete', observed.syncRevision!)
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    assert.equal(c.fixture.sql.prepare('SELECT count(*) AS n FROM document_chunks WHERE document_id = ?').get(doc.id)?.n, 0)
    await c.sync(c.receiver, c.reviewed)
    const remaining = await c.receiver.collections.documentChunks.find({ selector: { documentId: doc.id } }).exec()
    c.check(() => assert.equal(remaining.length, 0, 'last remotely deleted chunk must leave an empty cache'))
    c.check(() => assert.equal(c.source(doc)?.text, '', 'explicitly accepted final-chunk deletion must clear old text'))
    c.check(() => assert.equal(c.source(doc)?.source?.path, doc.canonicalPath))
    c.finish()
  })
}

export async function testAgenticGraphStorageRemoteGraphRemoval() {
  await withNativeDeletionCase('graph', async c => {
    const doc = c.document('target', '# Stable'), other = c.document('other', '# Unrelated')
    const graph = c.graph(doc), otherGraph = c.graph(other)
    await c.seed([['document', doc], ['graphSnapshot', graph], ['document', other], ['graphSnapshot', otherGraph]])
    assert.ok(c.source(doc)?.parsedGraphData)
    const otherSource = c.source(other)
    const cached = await c.sender.collections.graphSnapshots.findOne(graph.id).exec()
    await c.queue(c.sender, 'graphSnapshot', graph, 'delete', Number(cached?.get('syncRevision')))
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    assert.equal(c.fixture.sql.prepare('SELECT count(*) AS n FROM graph_snapshots WHERE id = ?').get(graph.id)?.n, 0)
    const cursor = await c.receiver.collections.syncCursor.findOne(`${c.workspaceId}:receiver`).exec()
    const previousCursor = cursor?.get('lastPullCursor')
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    let callbacks = 0
    const pending = c.sync(c.receiver, async args => { callbacks += 1; enter(); await held; await c.reviewed(args) })
    try {
      const reached = await Promise.race([entered.then(() => true), pending.then(() => false)])
      if (reached) c.check(() => assert.equal(cursor?.get('lastPullCursor'), previousCursor, 'checkpoint must wait for projection completion'))
      c.check(() => assert.equal(reached, true, 'graph-only deletion must invoke the projection callback'))
    } finally { release() }
    const completed = await pending
    const remaining = await c.receiver.collections.graphSnapshots.findOne(graph.id).exec()
    c.check(() => assert.equal(callbacks, 1))
    c.check(() => assert.equal(remaining, null, 'deleted graph must leave the durable cache'))
    c.check(() => assert.equal(c.source(doc)?.parsedGraphData, undefined, 'accepted graph deletion must clear the matching parsed graph'))
    c.check(() => assert.equal(c.source(doc)?.text, '# Stable'))
    c.check(() => assert.equal(c.source(other), otherSource, 'unrelated graph source must remain exact'))
    c.check(() => assert.equal(cursor?.get('lastPullCursor'), completed.lastPullCursor))
    c.finish()
  })
}

export async function testAgenticGraphStorageRemoteDeleteRetainsOfflineEdit() {
  await withNativeDeletionCase('offline', async c => {
    const doc = c.document('target', '# Authored text'), graph = c.graph(doc)
    await c.seed([['document', doc], ['graphSnapshot', graph]])
    const cached = await c.receiver.collections.graphSnapshots.findOne(graph.id).exec()
    const baseRevision = Number(cached?.get('syncRevision'))
    const draft = { ...graph, graphRevision: 2, graphHash: 'authored-draft', graphJson: { ...graph.graphJson, draft: 'preserve me' } }
    const mutationId = await c.queue(c.receiver, 'graphSnapshot', draft, 'upsert', baseRevision)
    const queued = await c.receiver.collections.syncOutbox.findOne(mutationId).exec()
    assert.ok(queued)
    const payload = JSON.stringify(queued.get('payload')), payloadHash = queued.get('payloadHash')
    const sourceBefore = c.source(doc)
    await c.queue(c.sender, 'graphSnapshot', graph, 'delete', baseRevision)
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    const result = await c.sync(c.receiver)
    const retained = await c.receiver.collections.syncOutbox.findOne(mutationId).exec()
    c.check(() => assert.equal(c.fixture.sql.prepare('SELECT count(*) AS n FROM graph_snapshots WHERE id = ?').get(graph.id)?.n, 0, 'stale offline edit must not resurrect a remotely deleted graph'))
    c.check(() => assert.equal(result.conflictCount, 1, 'the real acknowledgement must report a conflict'))
    c.check(() => assert.ok(retained, 'conflicting outbox must remain available for review'))
    c.check(() => assert.equal(retained?.get('lastAckStatus'), 'conflict'))
    c.check(() => assert.equal(JSON.stringify(retained?.get('payload')), payload))
    c.check(() => assert.equal(retained?.get('payloadHash'), payloadHash))
    c.check(() => assert.equal(c.source(doc), sourceBefore, 'unreviewed authored source must remain unchanged'))
    c.finish()
  })
}
