import { resolveAgenticGraphStorageParentChildConflict } from '@/lib/storage/agentic-graph-storage-parent-child-conflict'
import { buildAgenticGraphStorageTargetKeys } from '@/lib/storage/agentic-graph-storage-conflict-store'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
import { createIndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import { __resetAgenticGraphStorageDbForTests, getAgenticGraphStorageDb, AGENTIC_OS_STORAGE_COLLECTION_NAMES, type AgenticGraphStorageRecordMap } from '@/lib/storage/agentic-graph-storage-db'
import { applyAgenticGraphStoragePullPage } from '@/lib/storage/agentic-graph-storage-client-apply'
import { queueAgenticGraphStorageMutation } from '@/lib/storage/agentic-graph-storage-client-push'
import { withNativeDeletionCase } from '@/__tests__/agentic-graph-storage-sync-boundary.test'
import { runAgenticGraphStorageConflictAction, buildAgenticGraphStorageConflictAcceptRemoteActionId,
  buildAgenticGraphStorageConflictFamilyActionId, buildAgenticGraphStorageConflictKeepLocalActionId, __setAgenticGraphStorageConflictProjectionForTests } from '@/lib/storage/agentic-graph-storage-conflict-actions'
import { cancelAgenticGraphStorageSync } from '@/lib/storage/agentic-graph-storage-client-sync'
import { toAgenticGraphLocalDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import { useGraphStore } from '@/hooks/useGraphStore'
import { hashAgenticGraphStorageContent, type AgenticGraphStoragePullChanges,
  type AgenticGraphStorageDeletedChildState, type KgDocumentChunkRecord, type KgDocumentRecord, type KgGraphSnapshotRecord, type AgenticGraphStorageMutation } from '@/lib/storage/agentic-graph-storage-sync-contract'

const empty = (): AgenticGraphStoragePullChanges => ({ documents: [], documentChunks: [], graphSnapshots: [], deletions: [] })
const chunk = (id: string, order = 0): KgDocumentChunkRecord => ({ id, workspaceId: 'workspace:pull-atomic',
  documentId: 'document', chunkKey: id, chunkOrder: order, heading: null, markdown: id,
  contentHash: hashAgenticGraphStorageContent(id), tokenEstimate: 1, updatedAtMs: 1, syncRevision: 1 })
const deletion = (record: KgDocumentChunkRecord): AgenticGraphStorageDeletedChildState => ({
  workspaceId: record.workspaceId, documentId: record.documentId, recordId: record.id,
  entity: 'documentChunk', chunkKey: record.chunkKey, deleted: true, syncRevision: 3, updatedAtMs: 3,
})
type Storage = Awaited<ReturnType<typeof createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>>>
const withDatabases = async (name: string, run: (first: Storage, second: Storage, databaseName: string) => Promise<void>) => {
  Dexie.dependencies.indexedDB = indexedDB; Dexie.dependencies.IDBKeyRange = IDBKeyRange
  const databaseName = `pull-atomic:${name}:${Date.now()}`
  const first = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  const second = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  const errors: unknown[] = []
  try { await run(first, second, databaseName) } catch (error) { errors.push(error) }
  for (const close of [() => second.db.close(), () => first.db.remove()]) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, 'Pull regression and cleanup failures')
}

export const testStoragePullRetainsRejectedOfflineBytes = async () => withDatabases('rejected', async (first, second) => {
  const record = chunk('retained'), draft = { ...record, markdown: 'offline authored bytes' }
  await first.collections.documentChunks.incrementalUpsert(record)
  const id = await queueAgenticGraphStorageMutation({ workspaceId: record.workspaceId, deviceId: 'offline',
    entity: 'documentChunk', op: 'upsert', record: draft, dbState: first })
  const queued = (await first.collections.syncOutbox.findOne(id).exec())!
  await queued.incrementalPatch({ attemptCount: 999, lastAckStatus: 'rejected' })
  const before = queued.toJSON()
  const applied = await applyAgenticGraphStoragePullPage({ dbState: first, workspaceId: record.workspaceId,
    changes: { ...empty(), deletions: [deletion(record)] } })
  await applied.finishProjection()
  assert.deepEqual((await second.collections.documentChunks.findOne(record.id).exec())?.toJSON(), record)
  const after = (await second.collections.syncOutbox.findOne(id).exec())!.toJSON()
  assert.deepEqual(after.payload, before.payload)
  assert.equal(after.payloadHash, before.payloadHash)
  assert.equal(after.attemptCount, 999)
  assert.equal(after.lastAckStatus, 'conflict')
  assert.equal((await second.collections.syncConflicts.findOne(id).exec())?.get('childState')?.deleted, true)
  assert.equal((await second.collections.syncDeferred.find().exec()).length, 1)
  assert.equal((await second.collections.syncChildState.find().exec()).length, 2)
  assert.equal(applied.changes.deletions.length, 0, 'unreviewed remote deletion cannot reach source projection')
})

export const testStoragePullProjectionSurvivesReopen = async () => withDatabases('reopen', async (first, second, databaseName) => {
  const removed = chunk('removed'), retained = chunk('retained', 1)
  await first.collections.documentChunks.incrementalUpsert(removed)
  await first.collections.documentChunks.incrementalUpsert(retained)
  const applied = await applyAgenticGraphStoragePullPage({ dbState: first, workspaceId: removed.workspaceId,
    changes: { ...empty(), deletions: [deletion(removed)] } })
  assert.equal(await second.collections.documentChunks.findOne(removed.id).exec(), null)
  assert.equal(applied.projection.documentTexts[0]?.text, 'retained')
  assert.equal(applied.projection.documentTexts[0]?.previousText, 'removed\n\nretained')
  // No projection completion: model a reload after the durable cache transaction.
  await first.db.close()
  const reopened = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  try {
    const replay = await applyAgenticGraphStoragePullPage({ dbState: reopened, workspaceId: removed.workspaceId, changes: empty() })
    assert.equal(replay.cacheWriteCount, 0)
    assert.deepEqual(replay.projection.documentTexts, applied.projection.documentTexts,
      'recovery must retain the original source observation, not the already-updated cache')
    assert.deepEqual(replay.changes.deletions, applied.changes.deletions)
    await replay.finishProjection()
    assert.equal((await second.collections.syncDeferred.find().exec()).length, 0)
  } finally { await reopened.db.close() }
})

export const testStoragePullRejectsConcurrentQueueInsertion = async () => withDatabases('concurrent', async (first, second) => {
  const record = chunk('contended')
  await first.collections.documentChunks.incrementalUpsert(record)
  const compare = first.compareAndWriteWithRevisions.bind(first)
  let injected = false
  first.compareAndWriteWithRevisions = async (...args) => {
    if (!injected) {
      injected = true
      await queueAgenticGraphStorageMutation({ workspaceId: record.workspaceId, deviceId: 'other-tab',
        entity: 'documentChunk', op: 'upsert', record: { ...record, markdown: 'new local content' }, dbState: second })
    }
    return compare(...args)
  }
  await assert.rejects(() => applyAgenticGraphStoragePullPage({ dbState: first, workspaceId: record.workspaceId,
    changes: { ...empty(), deletions: [deletion(record)] } }), /changed during pull/)
  assert.equal(injected, true)
  assert.deepEqual((await first.collections.documentChunks.findOne(record.id).exec())?.toJSON(), record)
  assert.equal((await first.collections.syncDeferred.find().exec()).length, 0)
  assert.equal((await first.collections.syncChildState.find().exec()).length, 0)
  assert.equal(first.persistence.getState().status, 'active')
  assert.equal((await second.collections.syncOutbox.find().exec()).length, 1)
})

export const testStoragePullCanonicalAliasAndOlderDeletion = async () => withDatabases('alias', async (first) => {
  const alias = chunk('local-alias')
  await first.collections.documentChunks.incrementalUpsert(alias)
  const canonical = { ...alias, id: 'server-canonical', markdown: 'published content',
    contentHash: hashAgenticGraphStorageContent('published content'), syncRevision: 4 }
  const applied = await applyAgenticGraphStoragePullPage({ dbState: first, workspaceId: alias.workspaceId,
    changes: { ...empty(), documentChunks: [canonical] } })
  await applied.finishProjection()
  assert.deepEqual((await first.collections.documentChunks.find().exec()).map(row => row.get('id')), [canonical.id])
  assert.equal(applied.projection.documentTexts[0]?.text, canonical.markdown, 'canonicalization must not duplicate the old chunk text')
  const older = await applyAgenticGraphStoragePullPage({ dbState: first, workspaceId: alias.workspaceId,
    changes: { ...empty(), deletions: [deletion(alias)] } })
  await older.finishProjection()
  assert.deepEqual((await first.collections.documentChunks.findOne(canonical.id).exec())?.toJSON(), canonical)
  assert.equal(older.projection.documentTexts[0]?.text, canonical.markdown, 'an older alias tombstone cannot remove a restored natural identity')
})

export const testStorageNativeConflictAcceptsFinalChunkDeletion = async () => withNativeDeletionCase('accept', async c => {
  const doc = c.document(), original = c.chunk(doc, 0, '# Shared')
  await c.seed([['document', doc], ['documentChunk', original]])
  const observed = (await c.receiver.collections.documentChunks.findOne(original.id).exec())!.toJSON()
  const draft = { ...observed, markdown: '# Offline authored edit' }
  await c.receiver.collections.documentChunks.incrementalUpsert(draft)
  useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.map(file => file.id === c.source(doc)?.id
    ? { ...file, text: draft.markdown } : file) })
  const id = await c.queue(c.receiver, 'documentChunk', draft, 'upsert', observed.syncRevision!)
  await c.queue(c.sender, 'documentChunk', original, 'delete', observed.syncRevision!)
  assert.equal((await c.sync(c.sender)).appliedCount, 1)
  assert.equal((await c.sync(c.receiver)).conflictCount, 1)
  assert.equal(c.source(doc)?.text, draft.markdown)
  assert.equal((await c.receiver.collections.syncConflicts.findOne(id).exec())?.get('childState')?.deleted, true)
  await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(c.workspaceId, id))
  assert.equal(await c.receiver.collections.syncOutbox.findOne(id).exec(), null)
  assert.equal(await c.receiver.collections.documentChunks.findOne(original.id).exec(), null)
  assert.equal(c.source(doc)?.text, '', 'explicit remote acceptance must clear the final authored draft chunk')
  await c.sync(c.receiver, c.reviewed)
  assert.equal(c.source(doc)?.text, '')
  assert.equal((await c.receiver.collections.syncDeferred.find().exec()).length, 0)
})

export const testStorageNativeConflictRestoresReviewedGraph = async () => withNativeDeletionCase('restore', async c => {
  const doc = c.document('target', '# Authored text'), original = c.graph(doc)
  await c.seed([['document', doc], ['graphSnapshot', original]])
  const observed = (await c.receiver.collections.graphSnapshots.findOne(original.id).exec())!.toJSON()
  const draft = { ...observed, graphRevision: 7, graphHash: 'offline-graph', graphJson: { ...observed.graphJson, offline: true } }
  const id = await c.queue(c.receiver, 'graphSnapshot', draft, 'upsert', observed.syncRevision!)
  await c.queue(c.sender, 'graphSnapshot', original, 'delete', observed.syncRevision!)
  assert.equal((await c.sync(c.sender)).appliedCount, 1)
  assert.equal((await c.sync(c.receiver)).conflictCount, 1)
  const state = (await c.receiver.collections.syncConflicts.findOne(id).exec())?.get('childState')
  assert.equal(state?.deleted, true)
  try {
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictKeepLocalActionId(c.workspaceId, id))
    cancelAgenticGraphStorageSync(c.workspaceId)
    const queued = (await c.receiver.collections.syncOutbox.findOne(id).exec())!.toJSON()
    assert.equal(queued.lastAckStatus, '')
    assert.equal(queued.baseRevision, state?.syncRevision)
    assert.equal((queued.payload.record as typeof draft).graphRevision, 7, 'sync rebase must preserve the authored graph revision')
    assert.equal((queued.payload.record as typeof draft).graphJson.offline, true)
    assert.equal((await c.sync(c.receiver, c.reviewed)).appliedCount, 1)
    assert.equal(await c.receiver.collections.syncOutbox.findOne(id).exec(), null)
    const stored = c.fixture.sql.prepare('select graph_revision, graph_json from graph_snapshots where id = ?').get(original.id)
    assert.equal(stored?.graph_revision, 7)
    assert.equal(JSON.parse(String(stored?.graph_json)).offline, true)
    assert.equal(c.source(doc)?.parsedGraphRevision, 7)
  } finally { cancelAgenticGraphStorageSync(c.workspaceId) }
})


const withDocumentConflict = async (name: string, run: (args: {
  storage: Awaited<ReturnType<typeof getAgenticGraphStorageDb>>; local: KgDocumentRecord; mutationId: string;
}) => Promise<void>) => {
  await __resetAgenticGraphStorageDbForTests()
  const storage = await getAgenticGraphStorageDb()
  const local: KgDocumentRecord = { id: `document:${name}`, workspaceId: `workspace:${name}`, canonicalPath: 'draft.md',
    title: null, docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: 'my draft',
    contentHash: hashAgenticGraphStorageContent('my draft'), parserVersion: 'test', revision: 2, updatedAtMs: 1, deleted: false }
  const mutationId = await queueAgenticGraphStorageMutation({ dbState: storage, workspaceId: local.workspaceId,
    entity: 'document', op: 'upsert', baseRevision: 1, record: local })
  await (await storage.collections.syncOutbox.findOne(mutationId).exec())!.incrementalPatch({ lastAckStatus: 'conflict' })
  await storage.collections.documents.incrementalUpsert(toAgenticGraphLocalDocumentRecord(local))
  const remote = { ...local, revision: 3, contentMd: 'remote', contentHash: hashAgenticGraphStorageContent('remote') }
  await storage.collections.syncConflicts.incrementalUpsert({ id: mutationId, mutationId, workspaceId: local.workspaceId,
    entity: 'document', recordId: local.id, serverRevision: 3, remoteRecord: remote, receivedAtMs: 2 })
  try { await run({ storage, local, mutationId }) }
  finally { cancelAgenticGraphStorageSync(local.workspaceId); await __resetAgenticGraphStorageDbForTests() }
}

export const testStorageDocumentConflictRetainsConcurrentEdit = async () => {
  for (const choice of ['keep', 'accept'] as const) await withDocumentConflict(`review-race-${choice}`, async ({ storage, local, mutationId }) => {
    let authoredPayload: unknown
    const restore = __setAgenticGraphStorageConflictProjectionForTests(async () => {
      const row = (await storage.collections.syncOutbox.findOne(mutationId).exec())!
      const payload = row.get('payload') as unknown as AgenticGraphStorageMutation
      authoredPayload = { ...payload, record: { ...local, revision: 20, contentMd: 'concurrent authored edit',
        contentHash: hashAgenticGraphStorageContent('concurrent authored edit') } }
      await row.incrementalPatch({ payload: authoredPayload as never })
    })
    try {
      await runAgenticGraphStorageConflictAction((choice === 'keep' ? buildAgenticGraphStorageConflictKeepLocalActionId
        : buildAgenticGraphStorageConflictAcceptRemoteActionId)(local.workspaceId, mutationId))
      assert.deepEqual((await storage.collections.syncOutbox.findOne(mutationId).exec())?.get('payload'), authoredPayload,
        'review completion must retain a concurrent replacement of the reviewed queue identity')
      assert.ok(await storage.collections.syncConflicts.findOne(mutationId).exec(), 'a raced review remains available')
    } finally { restore() }
  })
}

export const testStorageDocumentConflictPreservesConcurrentChild = async () => withDocumentConflict('parent-child-review', async ({ storage, local, mutationId }) => {
  let childId = ''
  const restore = __setAgenticGraphStorageConflictProjectionForTests(async () => {
    const child = { ...chunk('pending-child'), workspaceId: local.workspaceId, documentId: local.id }
    childId = await queueAgenticGraphStorageMutation({ dbState: storage, workspaceId: local.workspaceId,
      entity: 'documentChunk', op: 'upsert', baseRevision: 1, record: child })
  })
  try {
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(local.workspaceId, mutationId))
    assert.ok(childId, 'the competing child must be inserted during projection')
    assert.ok(await storage.collections.syncOutbox.findOne(childId).exec(), 'concurrent child edit remains durable')
    assert.ok(await storage.collections.syncOutbox.findOne(mutationId).exec(), 'raced parent review remains available')
    assert.ok(await storage.collections.syncConflicts.findOne(mutationId).exec())
  } finally { restore() }
})

export const testStorageDocumentConflictRejectsNewerCandidate = async () => withDocumentConflict('candidate-review-race', async ({ storage, local, mutationId }) => {
  const find = storage.collections.syncConflicts.find.bind(storage.collections.syncConflicts)
  let reads = 0, projected = false
  storage.collections.syncConflicts.find = ((options: Parameters<typeof find>[0]) => {
    const query = find(options), exec = query.exec.bind(query)
    return { ...query, exec: async () => {
      const rows = await exec()
      if (++reads === 1) await storage.collections.syncConflicts.incrementalUpsert({
        id: 'new-candidate', mutationId: 'new-candidate', workspaceId: local.workspaceId, entity: 'document',
        recordId: local.id, serverRevision: 30, remoteRecord: { ...local, revision: 30, contentMd: 'newer remote' }, receivedAtMs: 30,
      })
      return rows
    } }
  }) as typeof storage.collections.syncConflicts.find
  const restore = __setAgenticGraphStorageConflictProjectionForTests(async () => { projected = true })
  try {
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(local.workspaceId, mutationId))
    assert.equal(projected, false, 'a later remote candidate must invalidate the older reviewed choice')
    assert.ok(await storage.collections.syncOutbox.findOne(mutationId).exec())
    assert.ok(await storage.collections.syncConflicts.findOne('new-candidate').exec())
    assert.equal((await storage.collections.documents.findOne(local.id).exec())?.get('contentMd'), local.contentMd)
  } finally { restore(); storage.collections.syncConflicts.find = find }
})


export const testStorageDocumentConflictPreservesAliasedVisibleEdit = async () => withDocumentConflict('visible-alias', async ({ storage, local, mutationId }) => {
  const original = useGraphStore.getState().sourceFiles
  useGraphStore.setState({ sourceFiles: [{ id: 'local-other-id', name: 'draft.md', text: local.contentMd,
    enabled: true, status: 'idle', source: { kind: 'local', path: local.canonicalPath } }] })
  let blocked = false
  const restore = __setAgenticGraphStorageConflictProjectionForTests(async ({ assertSourceCurrent }) => {
    useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.map(file => ({ ...file, text: 'new visible draft' })) })
    try { assertSourceCurrent?.() } catch (error) { blocked = true; throw error }
  })
  try {
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(local.workspaceId, mutationId))
    assert.equal(blocked, true, 'canonical-path aliases must use the same source identity as actual projection')
    assert.equal(useGraphStore.getState().sourceFiles[0]?.text, 'new visible draft')
    assert.ok(await storage.collections.syncOutbox.findOne(mutationId).exec())
    assert.ok(await storage.collections.syncConflicts.findOne(mutationId).exec())
  } finally { restore(); useGraphStore.setState({ sourceFiles: original }) }
})

const withDeletedParentAndEdits = async (name: string, run: (args: {
  c: Parameters<Parameters<typeof withNativeDeletionCase>[1]>[0]; doc: KgDocumentRecord;
  child: KgDocumentChunkRecord; parentId: string; childId: string;
}) => Promise<void>, includeGraph = false) => withNativeDeletionCase(name, async c => {
  const doc = c.document('target', '# Parent'), original = c.chunk(doc, 0, '# Original child')
  const initial: Array<[AgenticGraphStorageMutation['entity'], AgenticGraphStorageMutation['record']]> = [['document', doc], ['documentChunk', original]]
  if (includeGraph) initial.push(['graphSnapshot', c.graph(doc)])
  await c.seed(initial)
  const observed = (await c.receiver.collections.documentChunks.findOne(original.id).exec())!.toJSON()
  const child = { ...observed, markdown: '# Retained child', contentHash: hashAgenticGraphStorageContent('# Retained child') }
  await c.receiver.collections.documentChunks.incrementalUpsert(child)
  const parent = { ...doc, contentMd: '# Local parent', contentHash: hashAgenticGraphStorageContent('# Local parent'), revision: 10 }
  const parentId = await c.queue(c.receiver, 'document', parent, 'upsert', 1)
  const childId = await c.queue(c.receiver, 'documentChunk', child, 'upsert', observed.syncRevision!)
  useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.map(file => file.id === c.source(doc)?.id
    ? { ...file, text: child.markdown } : file) })
  const remoteRevision = Number(c.fixture.sql.prepare('select revision from documents where id = ?').get(doc.id)!.revision)
  await c.queue(c.sender, 'document', { ...doc, deleted: true, revision: remoteRevision + 1 }, 'delete', remoteRevision)
  assert.equal((await c.sync(c.sender)).appliedCount, 1)
  assert.equal((await c.sync(c.receiver)).conflictCount, 2)
  try { await run({ c, doc, child, parentId, childId }) }
  finally { cancelAgenticGraphStorageSync(c.workspaceId) }
})

export const testStorageDeletedParentRequiresExplicitFamilyReview = async () =>
  withDeletedParentAndEdits('family-review', async ({ c, doc, child, parentId, childId }) => {
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(c.workspaceId, parentId))
    assert.ok(await c.receiver.collections.syncOutbox.findOne(parentId).exec(), 'a generic parent action must offer explicit dependent-edit choices')
    assert.ok(await c.receiver.collections.syncOutbox.findOne(childId).exec())
    assert.equal(c.source(doc)?.text, child.markdown, 'unreviewed dependent authored text stays visible')
    const labels = useGraphStore.getState().uiLogEntries.flatMap(entry => (entry.actions ?? []).map(action => action.label))
    assert.ok(labels.includes('Restore document and edits') && labels.includes('Discard retained edits'), 'the shared UI exposes both explicit recovery choices')
    const entry = useGraphStore.getState().uiLogEntries.find(entry => entry.actions?.some(action =>
      action.id === buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'discard-family')))
    assert.ok(entry?.message.includes(doc.canonicalPath) && entry.message.includes('1 retained child edit')
      && entry.message.includes('all retained local changes for this document'), 'the destructive choice names its complete document and child scope')
  })

export const testStorageDeletedParentRestoresAndSynchronizesEdits = async () => {
  for (const state of ['parent-conflict', 'accepted-parent', 'child-only'] as const) {
    await withDeletedParentAndEdits(`family-restore-${state}`, async ({ c, doc, child, parentId, childId }) => {
      if (state !== 'parent-conflict') {
        const remote = (await c.receiver.collections.syncConflicts.findOne(parentId).exec())!.get('remoteRecord') as KgDocumentRecord
        if (state === 'accepted-parent') {
          await c.receiver.collections.documents.incrementalUpsert(toAgenticGraphLocalDocumentRecord(remote))
          useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.filter(file => file.id !== c.source(doc)?.id) })
        }
        await (await c.receiver.collections.syncOutbox.findOne(parentId).exec())!.remove()
        await (await c.receiver.collections.syncConflicts.findOne(parentId).exec())!.remove()
      }
      await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'restore-family'))
      cancelAgenticGraphStorageSync(c.workspaceId)
      const rows = (await c.receiver.collections.syncOutbox.find().exec()).map(row => row.toJSON())
      assert.equal(rows.length, 2, `${state}: restoration retains exactly one parent and one child retry`)
      assert.ok(rows.every(row => row.lastAckStatus === ''), `${state}: both reviewed retries become eligible together`)
      const parent = rows.find(row => row.entity === 'document')!
      assert.equal((parent.payload.record as KgDocumentRecord).deleted, false)
      assert.ok(parent.createdAtMs <= rows.find(row => row.entity === 'documentChunk')!.createdAtMs)
      assert.equal(c.source(doc)?.text, child.markdown, `${state}: the reviewed authored child is visible`)
      assert.equal((await c.sync(c.receiver, c.reviewed)).appliedCount, 2, `${state}: native worker accepts parent before child`)
      assert.equal((await c.receiver.collections.syncOutbox.find().exec()).length, 0)
      assert.equal(c.fixture.sql.prepare('select deleted from documents where id = ?').get(doc.id)!.deleted, 0)
      assert.equal(c.fixture.sql.prepare('select markdown from document_chunks where id = ?').get(child.id)!.markdown, child.markdown)
      assert.equal(c.source(doc)?.text, child.markdown)
      assert.equal((await c.receiver.collections.syncDeferred.find().exec()).length, 0)
    })
  }
}

export const testStorageDeletedParentDiscardsOnlyReviewedEdits = async () =>
  withDeletedParentAndEdits('family-discard', async ({ c, doc, child, childId }) => {
    const remoteBefore = c.fixture.sql.prepare('select markdown from document_chunks where id = ?').get(child.id)!.markdown
    const unrelated = { ...child, id: 'unrelated-cache', chunkKey: 'unrelated-cache', markdown: '# Other cached bytes' }
    await c.receiver.collections.documentChunks.incrementalUpsert(unrelated)
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'discard-family'))
    assert.equal((await c.receiver.collections.syncOutbox.find().exec()).length, 0)
    assert.equal((await c.receiver.collections.syncConflicts.find().exec()).length, 0)
    assert.equal((await c.receiver.collections.syncDeferred.find().exec()).length, 0)
    assert.equal(c.source(doc), undefined)
    assert.equal((await c.receiver.collections.documents.findOne(doc.id).exec())!.get('isDeleted'), true)
    assert.equal(await c.receiver.collections.documentChunks.findOne(child.id).exec(), null)
    assert.deepEqual((await c.receiver.collections.documentChunks.findOne(unrelated.id).exec())!.toJSON(), unrelated, 'discard touches only the reviewed child identities')
    assert.equal(c.fixture.sql.prepare('select markdown from document_chunks where id = ?').get(child.id)!.markdown, remoteBefore,
      'discarding the local retained draft must not mutate the remote child')
    assert.equal((await c.sync(c.receiver, c.reviewed)).pushedCount, 0)
    assert.equal(c.source(doc), undefined)
  })

export const testStorageDeletedParentRecoveryRetainsConcurrentEdits = async () => {
  for (const choice of ['restore-family', 'discard-family'] as const) {
    await withDeletedParentAndEdits(`family-race-${choice}`, async ({ c, doc, child, parentId, childId }) => {
      let authored: AgenticGraphStorageMutation | undefined, insertedId = ''
      const inserted = { ...child, id: 'concurrent-child', chunkKey: 'concurrent-child', chunkOrder: 1,
        markdown: '# Added during review', contentHash: hashAgenticGraphStorageContent('# Added during review'), syncRevision: undefined }
      const restore = __setAgenticGraphStorageConflictProjectionForTests(async () => {
        const row = (await c.receiver.collections.syncOutbox.findOne(childId).exec())!
        const before = row.get('payload') as unknown as AgenticGraphStorageMutation
        authored = { ...before, record: { ...child, markdown: '# Concurrent exact bytes',
          contentHash: hashAgenticGraphStorageContent('# Concurrent exact bytes') } } as AgenticGraphStorageMutation
        await row.incrementalPatch({ payload: authored as unknown as Record<string, unknown> })
        insertedId = await c.queue(c.receiver, 'documentChunk', inserted, 'upsert', null)
      })
      try {
        await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, parentId, choice))
        cancelAgenticGraphStorageSync(c.workspaceId)
        assert.deepEqual((await c.receiver.collections.syncOutbox.findOne(childId).exec())!.get('payload'), authored)
        assert.ok(await c.receiver.collections.syncOutbox.findOne(parentId).exec())
        assert.ok(await c.receiver.collections.syncOutbox.findOne(insertedId).exec(), 'a child inserted during review remains retained')
        assert.ok(await c.receiver.collections.syncConflicts.findOne(parentId).exec())
      } finally { restore() }
      await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'restore-family'))
      cancelAgenticGraphStorageSync(c.workspaceId)
      assert.equal((await c.sync(c.receiver, c.reviewed)).appliedCount, 3, 'a raced review remains recoverable without reciprocal refusal')
      assert.equal(c.fixture.sql.prepare('select markdown from document_chunks where id = ?').get(child.id)!.markdown, '# Concurrent exact bytes')
      assert.equal(c.source(doc)?.text, '# Concurrent exact bytes\n\n# Added during review')
    })
  }
}

export const testStorageDeletedParentRecoveryProtectsVisibleSource = async () =>
  withDeletedParentAndEdits('family-visible-race', async ({ c, doc, childId }) => {
    let blocked = false
    const restore = __setAgenticGraphStorageConflictProjectionForTests(async ({ assertSourceCurrent }) => {
      useGraphStore.setState({ sourceFiles: useGraphStore.getState().sourceFiles.map(file => file.id === c.source(doc)?.id
        ? { ...file, text: '# Concurrent visible text' } : file) })
      try { assertSourceCurrent?.() } catch (error) { blocked = true; throw error }
    })
    try {
      await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'discard-family'))
      assert.equal(blocked, true)
      assert.equal(c.source(doc)?.text, '# Concurrent visible text')
      assert.ok(await c.receiver.collections.syncOutbox.findOne(childId).exec())
    } finally { restore() }
  })

export const testStorageDeletedParentRecoveryRejectsNewCandidate = async () =>
  withDeletedParentAndEdits('family-candidate-race', async ({ c, doc, parentId, childId }) => {
    const find = c.receiver.collections.syncConflicts.find.bind(c.receiver.collections.syncConflicts)
    let reads = 0, projected = false
    c.receiver.collections.syncConflicts.find = ((options: Parameters<typeof find>[0]) => {
      const query = find(options), exec = query.exec.bind(query)
      return { ...query, exec: async () => {
        const rows = await exec()
        if (++reads === 1) await c.receiver.collections.syncConflicts.incrementalUpsert({ id: 'new-family-candidate',
          mutationId: 'new-family-candidate', workspaceId: c.workspaceId, entity: 'document', recordId: doc.id,
          remoteRecord: { ...doc, deleted: true, revision: 99 }, serverRevision: 99, receivedAtMs: 99 })
        return rows
      } }
    }) as typeof c.receiver.collections.syncConflicts.find
    const restore = __setAgenticGraphStorageConflictProjectionForTests(async () => { projected = true })
    try {
      await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'restore-family'))
      cancelAgenticGraphStorageSync(c.workspaceId)
      assert.equal(projected, false)
      assert.ok(await c.receiver.collections.syncOutbox.findOne(parentId).exec())
      assert.ok(await c.receiver.collections.syncOutbox.findOne(childId).exec())
      assert.ok(await c.receiver.collections.syncConflicts.findOne('new-family-candidate').exec())
    } finally { restore(); c.receiver.collections.syncConflicts.find = find }
  })

export const testStorageDeletedParentRestoresGraphPayload = async () =>
  withDeletedParentAndEdits('family-graph', async ({ c, doc, childId }) => {
    const observed = (await c.receiver.collections.graphSnapshots.findOne(doc.graphId!).exec())!.toJSON()
    const graph: KgGraphSnapshotRecord = { ...observed, graphRevision: 7, graphHash: 'authored-graph',
      graphJson: { ...observed.graphJson, offline: true } }
    await c.receiver.collections.graphSnapshots.incrementalUpsert(graph)
    const graphId = await c.queue(c.receiver, 'graphSnapshot', graph, 'upsert', observed.syncRevision!)
    assert.equal((await c.sync(c.receiver)).conflictCount, 1)
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, childId, 'restore-family'))
    cancelAgenticGraphStorageSync(c.workspaceId)
    const queued = (await c.receiver.collections.syncOutbox.findOne(graphId).exec())!.toJSON()
    assert.equal((queued.payload.record as KgGraphSnapshotRecord).graphRevision, 7)
    assert.equal((queued.payload.record as KgGraphSnapshotRecord).graphJson.offline, true)
    assert.equal((await c.sync(c.receiver, c.reviewed)).appliedCount, 3)
    assert.equal((await c.receiver.collections.syncOutbox.find().exec()).length, 0)
    const stored = c.fixture.sql.prepare('select graph_revision, graph_json from graph_snapshots where id = ?').get(graph.id)!
    assert.equal(stored.graph_revision, 7)
    assert.equal(JSON.parse(String(stored.graph_json)).offline, true)
    assert.equal(c.source(doc)?.parsedGraphRevision, 7)
  }, true)

export const testStorageDeletedParentPreservesDeferredSiblingRemoval = async () =>
  withNativeDeletionCase('family-sibling', async c => {
    const doc = c.document(), original = c.chunk(doc, 0, '# A'), sibling = c.chunk(doc, 1, '# B')
    await c.seed([['document', doc], ['documentChunk', original], ['documentChunk', sibling]])
    const a = (await c.receiver.collections.documentChunks.findOne(original.id).exec())!.toJSON()
    const b = (await c.sender.collections.documentChunks.findOne(sibling.id).exec())!.toJSON()
    const draft = { ...a, markdown: '# Reviewed A', contentHash: hashAgenticGraphStorageContent('# Reviewed A') }
    await c.receiver.collections.documentChunks.incrementalUpsert(draft)
    const parentId = await c.queue(c.receiver, 'document', doc, 'upsert', 1)
    await c.queue(c.receiver, 'documentChunk', draft, 'upsert', a.syncRevision!)
    await c.queue(c.sender, 'documentChunk', b, 'delete', b.syncRevision!)
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    const revision = c.fixture.identity(doc.id).revision
    await c.queue(c.sender, 'document', { ...doc, revision: revision + 1, deleted: true }, 'delete', revision)
    assert.equal((await c.sync(c.sender)).appliedCount, 1)
    assert.equal((await c.sync(c.receiver)).conflictCount, 2)
    const siblingDeferred = () => c.receiver.collections.syncDeferred.find().exec().then(rows =>
      rows.find(row => row.get('recordId') === sibling.id && row.get('childState')?.deleted))
    assert.ok(await siblingDeferred(), 'pending parent keeps the authoritative sibling tombstone deferred')
    try {
      await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictFamilyActionId(c.workspaceId, parentId, 'restore-family'))
      cancelAgenticGraphStorageSync(c.workspaceId)
      assert.ok(await siblingDeferred(), 'family recovery must retain unmatched deferred sibling state for replay')
      assert.equal((await c.sync(c.receiver, c.reviewed)).appliedCount, 2)
      assert.equal(await c.receiver.collections.documentChunks.findOne(sibling.id).exec(), null)
      assert.equal(c.source(doc)?.text, draft.markdown)
      assert.equal((await c.receiver.collections.syncDeferred.find().exec()).length, 0)
      assert.equal(c.fixture.sql.prepare('select count(*) n from document_chunks where id = ?').get(sibling.id)!.n, 0)
    } finally { cancelAgenticGraphStorageSync(c.workspaceId) }
  })

export const testStorageDeletedParentRetainsDurableRevisionHistory = async () => {
  for (const choice of ['restore-family', 'discard-family'] as const) await withDatabases(`family-history-${choice}`, async (first, second, databaseName) => {
    const parent: KgDocumentRecord = { id: 'history-parent', workspaceId: 'workspace:family-history', canonicalPath: 'history.md',
      title: null, docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: '# Retained parent',
      contentHash: hashAgenticGraphStorageContent('# Retained parent'), parserVersion: 'test', revision: 7, updatedAtMs: 7, deleted: true }
    await first.collections.documents.incrementalUpsert(toAgenticGraphLocalDocumentRecord(parent))
    const child = { ...chunk('history-child'), workspaceId: parent.workspaceId, documentId: parent.id, syncRevision: undefined }
    await first.collections.documentChunks.incrementalUpsert(child)
    const id = await queueAgenticGraphStorageMutation({ dbState: first, workspaceId: parent.workspaceId,
      deviceId: 'offline', entity: 'documentChunk', op: 'upsert', record: child, baseRevision: null })
    const row = (await first.collections.syncOutbox.findOne(id).exec())!
    await row.incrementalPatch({ lastAckStatus: 'conflict' })
    const record = row.toJSON(), mutation = record.payload as unknown as AgenticGraphStorageMutation
    assert.equal((await second.revisionHistory.list(parent.workspaceId, parent.id)).length, 0)
    const handled = await resolveAgenticGraphStorageParentChildConflict({ choice,
      target: { storage: first, workspaceId: parent.workspaceId, entity: 'documentChunk',
        targetKeys: buildAgenticGraphStorageTargetKeys('documentChunk', child.id, child),
        outboxEntries: [{ record, mutation }], candidates: [], sourceSnapshot: useGraphStore.getState().sourceFiles,
        workspaceOutboxSnapshot: [record], workspaceCandidateSnapshot: [] },
      project: async () => true, onRestored: () => undefined, offer: () => { throw new Error('explicit choice must execute') },
    })
    assert.equal(handled, true)
    await first.db.close()
    const reopened = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName,
      collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
    try {
      const history = await reopened.revisionHistory.list(parent.workspaceId, parent.id)
      assert.equal(history.length, 1, 'reviewed parent revision must survive offline closure without a later pull')
      assert.equal(history[0]!.documentRevision, choice === 'restore-family' ? 8 : 7)
      assert.equal(history[0]!.contentMd, parent.contentMd)
      assert.equal(history[0]!.contentHash, parent.contentHash)
    } finally { await reopened.db.close() }
  })
}
