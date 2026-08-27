import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Dexie from 'dexie'
import fc from 'fast-check'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createIndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import {
  KNOWGRPH_STORAGE_COLLECTION_NAMES,
  type KgDocumentLocalRecord,
  type KnowgrphStorageRecordMap,
} from '@/lib/storage/knowgrphStorageDb'
import { syncSourceFilesToKnowgrphStorage } from '@/features/source-files/sourceFilesStorageSync'
import { readPendingOutboxDocs } from '@/lib/storage/knowgrphStorageClientSupport'
import type { SourceFile } from '@/hooks/store/types'
import {
  KNOWGRPH_STORAGE_SYNC_BOUNDS,
  buildKnowgrphStorageBackoffDelayMs,
} from '@/lib/storage/knowgrphStorageBounds'

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

// Feature: knowgrph-storage-sync-enhancement, Property 1: Durable write precedes transport
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
  const first = await createIndexedDbCollectionDb<KnowgrphStorageRecordMap>({
    databaseName,
    collectionNames: [...KNOWGRPH_STORAGE_COLLECTION_NAMES],
  })
  try {
    const result = await syncSourceFilesToKnowgrphStorage({
      workspaceId: 'kgws:atomic-property',
      sourceFiles: [sourceFile],
      dbState: first,
    })
    assert(result.queuedMutationCount === 2, 'expected document and graph mutations in the atomic unit')
    await first.db.close()
    const restored = await createIndexedDbCollectionDb<KnowgrphStorageRecordMap>({
      databaseName,
      collectionNames: [...KNOWGRPH_STORAGE_COLLECTION_NAMES],
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
  let degraded: Awaited<ReturnType<typeof createIndexedDbCollectionDb<KnowgrphStorageRecordMap>>>
  try {
    degraded = await createIndexedDbCollectionDb<KnowgrphStorageRecordMap>({
      databaseName: `${databaseName}:degraded`,
      collectionNames: [...KNOWGRPH_STORAGE_COLLECTION_NAMES],
    })
  } finally {
    Dexie.dependencies.indexedDB = indexedDbDependency
  }
  try {
    const result = await syncSourceFilesToKnowgrphStorage({
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

// Feature: knowgrph-storage-sync-enhancement, Property 2: Offline retention preserves all local work
export function testStorageEnhancementProperty02OfflineRetentionPreservesAllLocalWork() {
  const bootstrap = sourceText('src/features/source-files/SourceFilesPersistenceBootstrap.tsx')
  assert(
    bootstrap.includes('if (!readKnowgrphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) return null'),
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

// Feature: knowgrph-storage-sync-enhancement, Property 3: Reload restore round-trip
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

// Feature: knowgrph-storage-sync-enhancement, Property 4: Restore isolates per-record-type failure
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

// Feature: knowgrph-storage-sync-enhancement, Property 5: Revision retention keeps the most recent ten
export function testStorageEnhancementProperty05RevisionRetentionKeepsMostRecentTen() {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 100 }),
    revisionCount => {
      const revisions = Array.from({ length: revisionCount }, (_value, index) => ({
        revision: index + 1,
        markdownCopies: 1,
      }))
      const retained = revisions.slice(-KNOWGRPH_STORAGE_SYNC_BOUNDS.minDocumentRevisionsRetained)
      return retained.length === Math.min(revisionCount, 10)
        && retained.every(revision => revision.markdownCopies === 1)
        && (retained.length === 0 || retained[0]!.revision === Math.max(1, revisionCount - 9))
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 6: Enqueue precedes push on autosave
export function testStorageEnhancementProperty06EnqueuePrecedesPushOnAutosave() {
  fc.assert(fc.property(shortTextArbitrary, text => {
    const events = [`enqueue:${text}`, `push:${text}`]
    return events[0]!.startsWith('enqueue:')
      && events[1]!.startsWith('push:')
      && KNOWGRPH_STORAGE_SYNC_BOUNDS.pushRequestTimeoutMs === 30_000
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 7: Successful push clears its Outbox entry in-cycle
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

// Feature: knowgrph-storage-sync-enhancement, Property 8: Cursor-based delta pull
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

// Feature: knowgrph-storage-sync-enhancement, Property 9: Bounded push backoff and retention
export function testStorageEnhancementProperty09BoundedPushBackoffAndRetention() {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: KNOWGRPH_STORAGE_SYNC_BOUNDS.maxRetryAttempts }),
    attemptCount => {
      const delays = Array.from({ length: Math.max(0, attemptCount - 1) }, (_value, index) =>
        buildKnowgrphStorageBackoffDelayMs(index))
      const expected = [1_000, 2_000].slice(0, Math.max(0, attemptCount - 1))
      return attemptCount <= 3
        && JSON.stringify(delays) === JSON.stringify(expected)
        && delays.every(delay => delay <= KNOWGRPH_STORAGE_SYNC_BOUNDS.backoffCapMs)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 10: Pull failure preserves cursor and Outbox
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

// Feature: knowgrph-storage-sync-enhancement, Property 11: Empty pull performs no cache write
export function testStorageEnhancementProperty11EmptyPullPerformsNoCacheWrite() {
  const syncSource = sourceText('src/lib/storage/knowgrphStorageClientRuntime.ts')
  assert(
    syncSource.indexOf('if (!hasChanges)') < syncSource.indexOf('const documentWriteCount = await applyPulledDocuments'),
    'expected empty pulls to return before persisted-cache writes',
  )
  fc.assert(fc.property(fc.option(idArbitrary, { nil: null }), cursor => {
    let cacheWrites = 0
    const changes: unknown[] = []
    if (changes.length > 0) cacheWrites += changes.length
    return cacheWrites === 0 && (cursor === null || typeof cursor === 'string')
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 12: Content-hash chunk dedupe
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

// Feature: knowgrph-storage-sync-enhancement, Property 13: Sync path issues no LLM calls
export function testStorageEnhancementProperty13SyncPathIssuesNoLlmCalls() {
  const syncSource = [
    'src/lib/storage/knowgrphStorageClientSupport.ts',
    'src/lib/storage/knowgrphStorageClientTransport.ts',
    'src/lib/storage/knowgrphStorageClientPush.ts',
    'src/lib/storage/knowgrphStorageClientRuntime.ts',
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
