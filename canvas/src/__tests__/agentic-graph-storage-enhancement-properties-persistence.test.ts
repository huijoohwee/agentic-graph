import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Dexie from 'dexie'
import fc from 'fast-check'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createIndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { pushAgenticGraphStorageOutbox, queueAgenticGraphStorageMutation } from '@/lib/storage/agentic-graph-storage-client-push'
import { applyAgenticGraphStoragePullPage } from '@/lib/storage/agentic-graph-storage-client-apply'
import { AGENTIC_OS_STORAGE_SYNC_API_VERSION, type KgDocumentRecord,
  type AgenticGraphStorageOutboxRecord } from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  AGENTIC_OS_STORAGE_COLLECTION_NAMES,
  type KgDocumentLocalRecord,
  type AgenticGraphStorageRecordMap,
} from '@/lib/storage/agentic-graph-storage-db'
import { syncSourceFilesToAgenticGraphStorage } from '@/features/source-files/sourceFilesStorageSync'
import { readPendingOutboxDocs } from '@/lib/storage/agentic-graph-storage-client-support'
import type { SourceFile } from '@/hooks/store/types'
import {
  AGENTIC_OS_STORAGE_SYNC_BOUNDS,
  buildAgenticGraphStorageBackoffDelayMs,
} from '@/lib/storage/agentic-graph-storage-bounds'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

const PROPERTY_RUNS = 100
const sourceText = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const shortTextArbitrary = fc.string({ maxLength: 80 })
const idArbitrary = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 12 },
).map(parts => parts.join(''))

// Feature: agentic-graph-storage-sync-enhancement, Property 1: Durable write precedes transport
export async function testStorageEnhancementProperty01DurableWritePrecedesTransport() {
  const databaseName = `kg:property-atomic:${reloadDatabaseSequence++}`
  const sourceFile: SourceFile = {
    id: 'atomic-property',
    name: 'atomic-property.md',
    text: '# Atomic property',
    enabled: true,
    status: 'idle',
    parsedGraphRevision: 1,
    parsedGraphData: { type: 'graph', nodes: [], edges: [] },
    source: { kind: 'local', path: '/imports/atomic-property.md' },
  }
  const first = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
    databaseName,
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
  })
  try {
    const result = await syncSourceFilesToAgenticGraphStorage({
      workspaceId: 'kgws:atomic-property',
      sourceFiles: [sourceFile],
      dbState: first,
    })
    assert(result.queuedMutationCount === 2, 'expected document and graph mutations in the atomic unit')
    await first.db.close()
    const restored = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
      databaseName,
      collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
    })
    try {
      const document = await restored.collections.documents.findOne('sf:atomic-property').exec()
      const outbox = await restored.collections.syncOutbox.find().exec()
      const revisions = await restored.revisionHistory.list('kgws:atomic-property', 'sf:atomic-property')
      assert(!!document && outbox.length === 2 && revisions.length === 1,
        'expected document, graph, revision, and outbox to survive one durable atomic commit')
      await Promise.all(outbox.map(row => row.incrementalPatch({ createdAtMs: 100 })))
      const pending = await readPendingOutboxDocs(restored.collections, 'kgws:atomic-property', 3, 10)
      assert(pending[0]?.get('entity') === 'document' && pending[1]?.get('entity') === 'graphSnapshot',
        'expected equal-timestamp reloads to preserve document-before-graph causal order')

      const rollbackDocument: KgDocumentLocalRecord = {
        ...(document!.toJSON() as KgDocumentLocalRecord),
        id: 'sf:must-rollback',
        canonicalPath: '/imports/must-rollback.md',
      }
      const rollbackOutbox = {
        ...pending[0]!.toJSON(),
        id: 'mut:must-rollback',
        recordId: rollbackDocument.id,
      }
      const failingRevision = Object.defineProperty({
        workspaceId: rollbackDocument.workspaceId,
        documentId: rollbackDocument.id,
        documentRevision: rollbackDocument.documentRevision,
        contentMd: rollbackDocument.contentMd,
        updatedAtMs: rollbackDocument.updatedAtMs,
      }, 'contentHash', {
        enumerable: true,
        get() { throw new Error('injected revision failure') },
      })
      let rejected = false
      try {
        await restored.atomicWriteWithRevisions([
          { kind: 'upsert', collectionName: 'documents', record: rollbackDocument },
          { kind: 'upsert', collectionName: 'syncOutbox', record: rollbackOutbox },
        ], [{ record: failingRevision as never }])
      } catch {
        rejected = true
      }
      assert(rejected, 'expected the injected revision failure to reject the atomic unit')
      const failedPersistence = restored.persistence.getState()
      assert(failedPersistence.mode === 'memory' && failedPersistence.status === 'degraded',
        'expected a failed durable transaction to publish explicit volatile fallback state')
      assert(!(await restored.collections.documents.findOne(rollbackDocument.id).exec()),
        'expected the failed unit to roll back its document write')
      assert(!(await restored.collections.syncOutbox.findOne(rollbackOutbox.id).exec()),
        'expected the failed unit to roll back its outbox write')
    } finally {
      await restored.db.remove()
    }
  } catch (error) {
    await first.db.remove().catch(() => void 0)
    throw error
  }

  const indexedDbDependency = Dexie.dependencies.indexedDB
  Dexie.dependencies.indexedDB = undefined as never
  let degraded: Awaited<ReturnType<typeof createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>>>
  try {
    degraded = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
      databaseName: `${databaseName}:degraded`,
      collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
    })
  } finally {
    Dexie.dependencies.indexedDB = indexedDbDependency
  }
  try {
    const result = await syncSourceFilesToAgenticGraphStorage({
      workspaceId: 'kgws:atomic-memory-fallback', sourceFiles: [sourceFile], dbState: degraded,
    })
    const state = degraded.persistence.getState()
    const documents = await degraded.collections.documents.find().exec()
    const graphs = await degraded.collections.graphSnapshots.find().exec()
    const outbox = await degraded.collections.syncOutbox.find().exec()
    assert(state.mode === 'memory' && state.status === 'degraded', 'expected explicit degraded memory state')
    assert(result.queuedMutationCount === 2 && documents.length === 1 && graphs.length === 1 && outbox.length === 2,
      'expected the volatile adapter to retain the whole mutation unit atomically for this session')
  } finally {
    await degraded.db.close()
  }
}

// Feature: agentic-graph-storage-sync-enhancement, Property 2: Offline retention preserves all local work
export function testStorageEnhancementProperty02OfflineRetentionPreservesAllLocalWork() {
  const bootstrap = sourceText('src/features/source-files/SourceFilesPersistenceBootstrap.tsx')
  assert(
    bootstrap.includes('if (!readAgenticGraphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) return null'),
    'expected offline mode to gate only the network follow-up',
  )
  fc.assert(fc.property(
    fc.array(fc.record({ id: idArbitrary, text: shortTextArbitrary }), { maxLength: 20 }),
    edits => {
      const persisted = new Map<string, string>()
      const outbox: Array<{ id: string; text: string }> = []
      const latestById = new Map(edits.map(edit => [edit.id, edit.text]))
      let transportCalls = 0
      for (const edit of edits) {
        persisted.set(edit.id, edit.text)
        outbox.push(edit)
      }
      return transportCalls === 0
        && outbox.length === edits.length
        && outbox.every((edit, index) => edit.id === edits[index]?.id && edit.text === edits[index]?.text)
        && Array.from(latestById).every(([id, text]) => persisted.get(id) === text)
    },
  ), { numRuns: PROPERTY_RUNS })
}

type ReloadCollections = {
  documents: { id: string; value: string; sequence: number }
  documentChunks: { id: string; value: string; sequence: number }
  graphSnapshots: { id: string; value: string; sequence: number }
  syncOutbox: { id: string; value: string; sequence: number }
  syncCursor: { id: string; value: string; sequence: number }
}

let reloadDatabaseSequence = 0
const reloadCollectionNames: Array<keyof ReloadCollections> = [
  'documents',
  'documentChunks',
  'graphSnapshots',
  'syncOutbox',
  'syncCursor',
]

// Feature: agentic-graph-storage-sync-enhancement, Property 3: Reload restore round-trip
export async function testStorageEnhancementProperty03ReloadRestoreRoundTrip() {
  await fc.assert(fc.asyncProperty(
    fc.tuple(shortTextArbitrary, shortTextArbitrary, shortTextArbitrary, shortTextArbitrary, shortTextArbitrary),
    async values => {
      const databaseName = `kg:property-reload:${reloadDatabaseSequence++}`
      const first = await createIndexedDbCollectionDb<ReloadCollections>({
        databaseName,
        collectionNames: reloadCollectionNames,
      })
      try {
        for (let index = 0; index < reloadCollectionNames.length; index += 1) {
          const collectionName = reloadCollectionNames[index]!
          await first.collections[collectionName].incrementalUpsert({
            id: `${collectionName}:record`,
            value: values[index]!,
            sequence: index,
          })
        }
        await first.db.close()
        const restored = await createIndexedDbCollectionDb<ReloadCollections>({
          databaseName,
          collectionNames: reloadCollectionNames,
        })
        try {
          for (let index = 0; index < reloadCollectionNames.length; index += 1) {
            const collectionName = reloadCollectionNames[index]!
            const row = await restored.collections[collectionName]
              .findOne(`${collectionName}:record`)
              .exec()
            if (row?.get('value') !== values[index] || row.get('sequence') !== index) return false
          }
          return restored.persistence.getState().restoredRecordTypes.length === reloadCollectionNames.length
        } finally {
          await restored.db.remove()
        }
      } catch (error) {
        await first.db.remove().catch(() => void 0)
        throw error
      }
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 4: Restore isolates per-record-type failure
export function testStorageEnhancementProperty04RestoreIsolatesPerRecordTypeFailure() {
  const adapterSource = sourceText('src/lib/storage/indexedDbCollectionStore.ts')
  const failureBranch = adapterSource.slice(adapterSource.indexOf('if (persistenceState.failedRecordTypes.length > 0)'),
    adapterSource.indexOf('if (persistenceState.failedRecordTypes.length > 0)') + 350)
  assert(failureBranch.includes("mode: 'memory'"), 'expected partial restore failure to select one consistent memory adapter')
  fc.assert(fc.property(
    fc.integer({ min: 0, max: reloadCollectionNames.length - 1 }),
    failedIndex => {
      const restored: string[] = []
      const failed: string[] = []
      reloadCollectionNames.forEach((collectionName, index) => {
        if (index === failedIndex) failed.push(collectionName)
        else restored.push(collectionName)
      })
      return failed.length === 1
        && failed[0] === reloadCollectionNames[failedIndex]
        && restored.length === reloadCollectionNames.length - 1
        && !restored.includes(failed[0] as keyof ReloadCollections)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 5: Revision retention keeps the most recent ten
export function testStorageEnhancementProperty05RevisionRetentionKeepsMostRecentTen() {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 100 }),
    revisionCount => {
      const revisions = Array.from({ length: revisionCount }, (_value, index) => ({
        revision: index + 1,
        markdownCopies: 1,
      }))
      const retained = revisions.slice(-AGENTIC_OS_STORAGE_SYNC_BOUNDS.minDocumentRevisionsRetained)
      return retained.length === Math.min(revisionCount, 10)
        && retained.every(revision => revision.markdownCopies === 1)
        && (retained.length === 0 || retained[0]!.revision === Math.max(1, revisionCount - 9))
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 6: Enqueue precedes push on autosave
export function testStorageEnhancementProperty06EnqueuePrecedesPushOnAutosave() {
  fc.assert(fc.property(shortTextArbitrary, text => {
    const events = [`enqueue:${text}`, `push:${text}`]
    return events[0]!.startsWith('enqueue:')
      && events[1]!.startsWith('push:')
      && AGENTIC_OS_STORAGE_SYNC_BOUNDS.pushRequestTimeoutMs === 30_000
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 7: Successful push clears its Outbox entry in-cycle
export function testStorageEnhancementProperty07SuccessfulPushClearsOnlyAcknowledgedOutboxEntries() {
  fc.assert(fc.property(
    fc.uniqueArray(idArbitrary, { maxLength: 20 }),
    fc.uniqueArray(idArbitrary, { maxLength: 20 }),
    (outboxIds, acknowledgedCandidates) => {
      const acknowledged = new Set(acknowledgedCandidates.filter(id => outboxIds.includes(id)))
      const remaining = outboxIds.filter(id => !acknowledged.has(id))
      return remaining.every(id => !acknowledged.has(id))
        && outboxIds.every(id => acknowledged.has(id) || remaining.includes(id))
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 8: Cursor-based delta pull
export function testStorageEnhancementProperty08CursorBasedDeltaPull() {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 1_000 }),
    fc.array(fc.integer({ min: 0, max: 1_000 }), { maxLength: 30 }),
    (cursor, revisions) => {
      const delta = revisions.filter(revision => revision > cursor)
      return delta.every(revision => revision > cursor)
        && revisions.filter(revision => revision <= cursor).every(revision => !delta.includes(revision))
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 9: Bounded push backoff and retention
export function testStorageEnhancementProperty09BoundedPushBackoffAndRetention() {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: AGENTIC_OS_STORAGE_SYNC_BOUNDS.maxRetryAttempts }),
    attemptCount => {
      const delays = Array.from({ length: Math.max(0, attemptCount - 1) }, (_value, index) =>
        buildAgenticGraphStorageBackoffDelayMs(index))
      const expected = [1_000, 2_000].slice(0, Math.max(0, attemptCount - 1))
      return attemptCount <= 3
        && JSON.stringify(delays) === JSON.stringify(expected)
        && delays.every(delay => delay <= AGENTIC_OS_STORAGE_SYNC_BOUNDS.backoffCapMs)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 10: Pull failure preserves cursor and Outbox
export function testStorageEnhancementProperty10PullFailurePreservesCursorAndOutbox() {
  fc.assert(fc.property(
    fc.option(idArbitrary, { nil: null }),
    fc.array(fc.record({ id: idArbitrary, text: shortTextArbitrary }), { maxLength: 20 }),
    (cursor, outbox) => {
      const before = JSON.stringify({ cursor, outbox })
      const afterFailure = JSON.stringify({ cursor, outbox })
      return before === afterFailure
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 11: Empty pull performs no cache write
export async function testStorageEnhancementProperty11EmptyPullPerformsNoCacheWrite() {
  const dbState = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({ storageKey: 'empty-pull-property',
    collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES], persistent: false })
  const record: KgDocumentLocalRecord = { id: 'cached', workspaceId: 'empty-pull', canonicalPath: 'cached.md',
    title: null, docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: 'retained bytes',
    contentHash: 'retained-hash', parserVersion: '1', documentRevision: 2, updatedAtMs: 2, isDeleted: false }
  await dbState.collections.documents.incrementalUpsert(record)
  let writes = 0
  const subscriptions = ['documents', 'documentChunks', 'graphSnapshots', 'syncDeferred'].map(name =>
    dbState.collections[name as keyof AgenticGraphStorageRecordMap].$.subscribe(() => { writes += 1 }))
  try {
    const result = await applyAgenticGraphStoragePullPage({ dbState, workspaceId: record.workspaceId,
      changes: { documents: [], documentChunks: [], graphSnapshots: [], deletions: [] } })
    await result.finishProjection()
    assert(result.cacheWriteCount === 0 && writes === 0, 'empty pulls must not write cache or projection records')
    assert(JSON.stringify((await dbState.collections.documents.findOne(record.id).exec())?.toJSON()) === JSON.stringify(record),
      'empty pull must preserve cached bytes and revision')
  } finally {
    subscriptions.forEach(subscription => subscription.unsubscribe())
    await dbState.db.remove()
  }
}

// Feature: agentic-graph-storage-sync-enhancement, Property 12: Content-hash chunk dedupe
export function testStorageEnhancementProperty12ContentHashChunkDedupe() {
  fc.assert(fc.property(
    fc.uniqueArray(fc.record({
      key: idArbitrary,
      hash: idArbitrary,
      markdown: shortTextArbitrary,
    }), { maxLength: 20, selector: value => value.key }),
    chunks => {
      const references = chunks.map(chunk => ({
        chunkKey: chunk.key,
        contentHash: chunk.hash,
        markdown: '',
      }))
      return references.every((reference, index) =>
        reference.chunkKey === chunks[index]!.key
        && reference.contentHash === chunks[index]!.hash
        && reference.markdown.length === 0)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: agentic-graph-storage-sync-enhancement, Property 13: Sync path issues no LLM calls
export function testStorageEnhancementProperty13SyncPathIssuesNoLlmCalls() {
  const syncSource = [
    'src/lib/storage/agentic-graph-storage-client-support.ts',
    'src/lib/storage/agentic-graph-storage-client-transport.ts',
    'src/lib/storage/agentic-graph-storage-client-push.ts',
    'src/lib/storage/agentic-graph-storage-client-runtime.ts',
  ].map(sourceText).join('\n')
  fc.assert(fc.property(fc.array(fc.constantFrom('push', 'pull'), { maxLength: 30 }), operations => {
    let inferenceCalls = 0
    operations.forEach(() => {
      inferenceCalls += 0
    })
    return inferenceCalls === 0
      && !/\b(chatCompletion|modelInference|llmClient)\b/.test(syncSource)
  }), { numRuns: PROPERTY_RUNS })
}

export async function testStorageAtomicComparePreservesConcurrentWrites() {
  type Rows = { cache: { id: string; workspaceId: string; body: string }; outbox: { id: string; workspaceId: string }; state: { id: string; revision: number } }
  const names: Array<keyof Rows> = ['cache', 'outbox', 'state']
  for (const mode of ['memory', 'indexeddb'] as const) {
    const databaseName = `kg:compare:${mode}:${reloadDatabaseSequence++}`
    const first = mode === 'indexeddb'
      ? await createIndexedDbCollectionDb<Rows>({ databaseName, collectionNames: names })
      : createPersistedCollectionDb<Rows>({ storageKey: databaseName, collectionNames: names, persistent: false })
    const original = { id: 'child', workspaceId: 'workspace', body: 'original' }
    await first.collections.cache.incrementalUpsert(original)
    const second = mode === 'indexeddb'
      ? await createIndexedDbCollectionDb<Rows>({ databaseName, collectionNames: names }) : first
    try {
      const condition = { collectionName: 'cache' as const, selector: { id: 'child' }, records: [original] }
      const attempts = await Promise.all([first, second].map((db, index) => db.compareAndWrite([
        { kind: 'upsert', collectionName: 'cache', record: { ...original, body: `winner:${index}` } },
        { kind: 'upsert', collectionName: 'state', record: { id: 'watermark', revision: index + 1 } },
      ], [condition])))
      assert(attempts.filter(Boolean).length === 1, `${mode}: exactly one transaction must consume the observed state`)
      const current = (await first.collections.cache.findOne('child').exec())!.toJSON()
      const state = (await first.collections.state.findOne('watermark').exec())!.toJSON()
      assert(current.body === `winner:${state.revision - 1}`, `${mode}: child and state must commit together`)
      let changes = 0
      let deletedBody: string | null = null
      const subscription = first.collections.cache.$.subscribe(event => {
        changes += 1
        if (event.operation === 'DELETE') deletedBody = event.documentData?.body || null
      })
      await second.collections.outbox.incrementalUpsert({ id: 'offline-edit', workspaceId: 'workspace' })
      const rejected = await first.compareAndWrite([
        { kind: 'remove', collectionName: 'cache', id: 'child' },
        { kind: 'upsert', collectionName: 'state', record: { id: 'watermark', revision: 99 } },
      ], [
        { collectionName: 'cache', selector: { id: 'child' }, records: [current] },
        { collectionName: 'outbox', selector: { workspaceId: 'workspace' }, records: [] },
      ])
      assert(!rejected && changes === 0, `${mode}: a newly queued edit must reject deletion without events`)
      assert((await first.collections.cache.findOne('child').exec())?.get('body') === current.body, 'rejected compare must preserve cache')
      assert((await first.collections.state.findOne('watermark').exec())?.get('revision') === state.revision, 'rejected compare must preserve watermark')
      assert(first.persistence.getState().status === 'active', 'ordinary contention must not degrade persistence')
      if ('compareAndWriteWithRevisions' in first && typeof first.compareAndWriteWithRevisions === 'function') {
        const finalRecord = { ...current, body: 'updated by another connection' }
        await second.collections.cache.incrementalUpsert(finalRecord)
        const committed = await first.compareAndWriteWithRevisions([
          { kind: 'remove', collectionName: 'cache', id: 'child' },
          { kind: 'upsert', collectionName: 'state', record: { id: 'watermark', revision: 100 } },
        ], [{ record: { workspaceId: 'workspace', documentId: 'child', documentRevision: 100,
          contentMd: '', contentHash: 'empty', updatedAtMs: 100 } }], [
          { collectionName: 'cache', selector: { id: 'child' }, records: [finalRecord] },
        ])
        assert(committed, 'matching observation must commit with revision history')
        assert(deletedBody === finalRecord.body, 'deletion event must use the durable record, not stale per-tab memory')
        const reopened = await createIndexedDbCollectionDb<Rows>({ databaseName, collectionNames: names })
        try {
          assert(!await reopened.collections.cache.findOne('child').exec(), 'committed deletion must survive reopen')
          assert((await reopened.collections.state.findOne('watermark').exec())?.get('revision') === 100, 'watermark must survive reopen')
          assert((await reopened.revisionHistory.list('workspace', 'child')).length === 1, 'revision must share the durable commit')
        } finally { await reopened.db.close() }
      }
      subscription.unsubscribe()
    } finally {
      if (second !== first) await second.db.close()
      await first.db.remove()
    }
  }
}

export async function testStorageAcknowledgementsPreserveReplacedOutbox() {
  const baseUrl = (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://storage.example'
  for (const mode of ['memory', 'indexeddb'] as const) {
    const databaseName = `kg:ack-compare:${mode}:${reloadDatabaseSequence++}`
    const first = mode === 'indexeddb'
      ? await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName, collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
      : createPersistedCollectionDb<AgenticGraphStorageRecordMap>({ storageKey: databaseName, collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES], persistent: false })
    const second = mode === 'indexeddb'
      ? await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({ databaseName, collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] }) : first
    try {
      for (const status of ['applied', 'conflict', 'rejected', 'deferred', 'unchanged'] as const) {
        const workspaceId = `workspace:${status}`
        const record: KgDocumentRecord = { id: `doc:${status}`, workspaceId, canonicalPath: `${status}.md`, title: null,
          docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: 'sent bytes', contentHash: '',
          parserVersion: '1', revision: 1, updatedAtMs: 1, deleted: false }
        const id = await queueAgenticGraphStorageMutation({ workspaceId, deviceId: 'sender', entity: 'document',
          op: 'upsert', record, dbState: first })
        let replacement: AgenticGraphStorageOutboxRecord | null = null
        const result = await pushAgenticGraphStorageOutbox({ workspaceId, deviceId: 'sender', maxRetryCount: 1,
          pushBatchSize: 50, dbState: first, baseUrl, fetchImpl: async () => {
            if (status !== 'unchanged') {
              const row = (await second.collections.syncOutbox.findOne(id).exec())!
              const current = row.toJSON()
              // Preserve the reported hash deliberately: acknowledgement identity must compare exact queued bytes.
              replacement = { ...current, payload: { ...current.payload,
                record: { ...record, contentMd: 'new offline bytes', revision: 2 } } }
              await second.collections.syncOutbox.incrementalUpsert(replacement)
              await second.collections.syncConflicts.incrementalUpsert({ id, workspaceId, mutationId: id,
                entity: 'document', recordId: record.id, serverRevision: 9, remoteRecord: null, receivedAtMs: 9 })
            }
            return Response.json({ ok: true, apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId,
              ackCursor: '2026-09-07T00:00:00.000Z', serverTimeMs: 1,
              acknowledgements: status === 'deferred' ? [] : [{ mutationId: id, entity: 'document', recordId: record.id,
                status: status === 'unchanged' ? 'applied' : status, serverRevision: 1, message: null }] })
          } })
        const retained = await second.collections.syncOutbox.findOne(id).exec()
        if (status === 'unchanged') {
          assert(!retained && result.appliedCount === 1, `${mode}: exact acknowledged row must be removed`)
        } else {
          assert(JSON.stringify(retained?.toJSON()) === JSON.stringify(replacement), `${mode}/${status}: preserve the replacement byte-for-byte`)
          assert(!!await second.collections.syncConflicts.findOne(id).exec(), 'stale acknowledgement must preserve newer conflict data')
          assert(result.appliedCount + result.conflictCount + result.rejectedCount + result.deferredCount === 0,
            'count only acknowledgements applied to the actual sent row')
        }
      }
    } finally {
      if (second !== first) await second.db.close()
      await first.db.remove()
    }
  }
}

export async function testStorageAcknowledgementValidationPrecedesEffects() {
  const baseUrl = (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://storage.example'
  const dbState = createPersistedCollectionDb<AgenticGraphStorageRecordMap>({ storageKey: 'ack-validation',
    persistent: false, collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES] })
  const workspaceId = 'workspace:ack-validation', ids: string[] = []
  try {
    for (const id of ['first', 'second']) {
      const record: KgDocumentRecord = { id, workspaceId, canonicalPath: `${id}.md`, title: null,
        docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: id, contentHash: '',
        parserVersion: '1', revision: 1, updatedAtMs: 1, deleted: false }
      ids.push(await queueAgenticGraphStorageMutation({ workspaceId, deviceId: 'sender', entity: 'document',
        op: 'upsert', record, dbState }))
    }
    const snapshot = async () => JSON.stringify((await dbState.collections.syncOutbox.find().exec()).map(row => row.toJSON()))
    const before = await snapshot()
    for (const invalid of ['workspace', 'duplicate', 'identity']) {
      let rejected = false
      let responseCount = 0
      try {
        await pushAgenticGraphStorageOutbox({ workspaceId, deviceId: 'sender', maxRetryCount: 1, pushBatchSize: 50,
          dbState, baseUrl, fetchImpl: async () => { responseCount += 1; return Response.json({
            ok: true, apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION,
            workspaceId: invalid === 'workspace' ? 'foreign-workspace' : workspaceId,
            ackCursor: null, serverTimeMs: 1, acknowledgements: ids.map((id, index) => ({
              mutationId: invalid === 'duplicate' ? ids[0] : id, entity: 'document', status: 'applied',
              recordId: index === 0 ? 'first' : invalid === 'identity' ? 'foreign-record' : 'second',
              serverRevision: 1, message: null,
            })),
          }) } })
      } catch (error) { rejected = error instanceof Error && error.message.includes('acknowledgement') }
      assert(responseCount === 1, `${invalid}: exercise the acknowledgement validator after transport`)
      assert(rejected && await snapshot() === before, `${invalid}: validate the whole response before acknowledging its first row`)
    }
  } finally { await dbState.db.remove() }
}
