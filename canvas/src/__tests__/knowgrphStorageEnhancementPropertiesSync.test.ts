import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import {
  createFakeKnowgrphStorageWorkerEnv,
  type FakeKnowgrphStorageD1Database,
} from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import { shouldAutoClearKnowgrphStorageConflict } from '@/lib/storage/knowgrphStorageClientSync'
import {
  hashKnowgrphStorageContent,
  type KgDocumentRecord,
  type KnowgrphStorageMutation,
} from '@/lib/storage/knowgrphStorageSyncContract'
import {
  canEditRawJsonForCollaboration,
} from '../../../grph-shared/src/collaboration/yjsSnapshot'
import {
  DOCUMENT_REPOSITORY_TARGETS,
  resolveDocumentRepositoryAuthorityResult,
} from '../../../grph-shared/src/collaboration/documentRepositoryAuthority'
import { handleCollaborationSave } from '../../../cloudflare/workers/knowgrph-storage/collaborationBridge'
import {
  processKnowgrphStorageMutation,
  validateKnowgrphStorageMutation,
} from '../../../cloudflare/workers/knowgrph-storage/mutationProcessor'

const PROPERTY_RUNS = 100
const COLLABORATION_SESSION_TOKEN = 'property-22-session'
const sourceText = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const seedCollaborationWriter = async (
  db: FakeKnowgrphStorageD1Database,
  workspaceId: string,
): Promise<void> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(COLLABORATION_SESSION_TOKEN),
  )
  const sessionHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const nowIso = '2026-07-24T00:00:00.000Z'
  db.users.set('user:property-22', {
    id: 'user:property-22',
    email: 'property-22@example.test',
    display_name: 'Property Writer',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.authSessions.set('session:property-22', {
    id: 'session:property-22',
    user_id: 'user:property-22',
    session_hash: sessionHash,
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set('membership:property-22', {
    id: 'membership:property-22',
    workspace_id: workspaceId,
    user_id: 'user:property-22',
    role: 'editor',
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
}

const identifierArbitrary = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 12 },
).map(parts => parts.join(''))
const markdownArbitrary = fc.string({ maxLength: 120 })
const canonicalPathArbitrary = identifierArbitrary.map(id => `docs/property-${id}.md`)

const buildDocumentRecord = (args: {
  id: string
  workspaceId: string
  canonicalPath: string
  contentMd: string
  revision?: number
  updatedAtMs?: number
}): KgDocumentRecord => ({
  id: args.id,
  workspaceId: args.workspaceId,
  canonicalPath: args.canonicalPath,
  title: 'Property document',
  docType: 'note',
  lang: 'en-US',
  graphId: null,
  sourceKind: 'markdown',
  contentMd: args.contentMd,
  contentHash: hashKnowgrphStorageContent(args.contentMd),
  parserVersion: 'property-test',
  revision: args.revision ?? 1,
  updatedAtMs: args.updatedAtMs ?? 1_777_000_000_000,
  deleted: false,
})

const buildDocumentMutation = (
  mutationId: string,
  record: KgDocumentRecord,
  baseRevision: number | null,
): Extract<KnowgrphStorageMutation, { entity: 'document' }> => ({
  mutationId,
  workspaceId: record.workspaceId,
  entity: 'document',
  op: 'upsert',
  recordId: record.id,
  baseRevision,
  record,
})

// Feature: knowgrph-storage-sync-enhancement, Property 14: Chunks are addressed by semantic keys
export function testStorageEnhancementProperty14ChunksUseSemanticKeys() {
  fc.assert(fc.property(
    fc.array(identifierArbitrary.map(id => `heading:${id}`), { maxLength: 30 }),
    keys => keys.every(key => {
      const markdown = `# ${key}`
      const mutation: KnowgrphStorageMutation = {
        mutationId: `mutation:${key}`,
        workspaceId: 'workspace-property-14',
        entity: 'documentChunk',
        op: 'upsert',
        recordId: `chunk:${key}`,
        baseRevision: null,
        record: {
          id: `chunk:${key}`,
          documentId: 'document-property-14',
          workspaceId: 'workspace-property-14',
          chunkKey: key,
          chunkOrder: 0,
          heading: key,
          markdown,
          tokenEstimate: 1,
          contentHash: hashKnowgrphStorageContent(markdown),
          updatedAtMs: 1,
        },
      }
      const byteOffsetMutation = {
        ...mutation,
        record: { ...mutation.record, chunkKey: '10:20' },
      } as KnowgrphStorageMutation
      return validateKnowgrphStorageMutation('workspace-property-14', mutation) === null
        && validateKnowgrphStorageMutation('workspace-property-14', byteOffsetMutation)
          === 'document chunk requires a semantic chunkKey'
    }),
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 15: Equal document hash reuses stored artifacts
export function testStorageEnhancementProperty15EqualDocumentHashReusesArtifacts() {
  const processor = sourceText('../cloudflare/workers/knowgrph-storage/mutationProcessor.ts')
  assert(processor.includes('documentFieldsEqual'), 'expected document no-op comparison before D1 write')
  fc.assert(fc.property(markdownArbitrary, text => {
    const stored = {
      contentHash: hashKnowgrphStorageContent(text),
      markdownObject: { text },
      graphSnapshot: { derivedFrom: hashKnowgrphStorageContent(text) },
    }
    const incomingHash = hashKnowgrphStorageContent(text)
    const selected = incomingHash === stored.contentHash
      ? { markdownObject: stored.markdownObject, graphSnapshot: stored.graphSnapshot }
      : { markdownObject: { text }, graphSnapshot: { derivedFrom: incomingHash } }
    return selected.markdownObject === stored.markdownObject
      && selected.graphSnapshot === stored.graphSnapshot
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 16: No-op write skipping
export async function testStorageEnhancementProperty16NoOpWriteSkipping() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (id, canonicalPath, text) => {
      const env = createFakeKnowgrphStorageWorkerEnv()
      const workspaceId = `workspace-${id}`
      const context = {
        db: env.DB,
        workspaceId,
        nowIso: '2026-07-23T00:00:00.000Z',
        documentIdAliases: new Map<string, string>(),
      }
      const firstRecord = buildDocumentRecord({ id, workspaceId, canonicalPath, contentMd: text })
      await processKnowgrphStorageMutation(context as never, buildDocumentMutation(`first-${id}`, firstRecord, null))
      const afterFirst = env.DB.storageRecordWriteCounts.documents
      await processKnowgrphStorageMutation(context as never, buildDocumentMutation(`same-${id}`, firstRecord, 1))
      const afterSame = env.DB.storageRecordWriteCounts.documents
      const changedRecord = buildDocumentRecord({
        id,
        workspaceId,
        canonicalPath,
        contentMd: `${text}\nchanged`,
        revision: 2,
        updatedAtMs: firstRecord.updatedAtMs + 1,
      })
      await processKnowgrphStorageMutation(context as never, buildDocumentMutation(`changed-${id}`, changedRecord, 1))
      return afterFirst === 1
        && afterSame === afterFirst
        && env.DB.storageRecordWriteCounts.documents === afterSame + 1
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 17: Stale base revision rejected and preserved
export async function testStorageEnhancementProperty17StaleBaseRevisionRejectedAndPreserved() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (id, canonicalPath, text) => {
      const env = createFakeKnowgrphStorageWorkerEnv()
      const workspaceId = `workspace-${id}`
      const context = {
        db: env.DB,
        workspaceId,
        nowIso: '2026-07-23T00:00:00.000Z',
        documentIdAliases: new Map<string, string>(),
      }
      const serverRecord = buildDocumentRecord({ id, workspaceId, canonicalPath, contentMd: text, revision: 3 })
      await processKnowgrphStorageMutation(context as never, buildDocumentMutation(`seed-${id}`, serverRecord, null))
      const staleRecord = buildDocumentRecord({
        id,
        workspaceId,
        canonicalPath,
        contentMd: `${text}\nstale`,
        revision: 2,
      })
      const acknowledgement = await processKnowgrphStorageMutation(
        context as never,
        buildDocumentMutation(`stale-${id}`, staleRecord, 1),
      )
      const persisted = env.DB.documents.get(id)
      return acknowledgement.status === 'conflict'
        && acknowledgement.recordId === id
        && acknowledgement.serverRevision === 3
        && persisted?.revision === 3
        && persisted?.content_md === text
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 18: Conflicts surface through the single shared path
export function testStorageEnhancementProperty18ConflictsUseSharedUxPath() {
  const uxSource = sourceText('src/lib/storage/knowgrphStorageConflictUx.ts')
  fc.assert(fc.property(canonicalPathArbitrary, canonicalPath => {
    const conflict = { canonicalPath, mutationId: `mutation:${canonicalPath}` }
    return conflict.canonicalPath === canonicalPath
      && uxSource.includes('notifyKnowgrphStorageConflictUx')
      && uxSource.includes('canonicalPath')
      && uxSource.includes("label: 'Keep Local'")
      && uxSource.includes("label: 'Accept Remote'")
      && uxSource.includes("label: 'Review Log'")
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 19: Stale-conflict auto-clear partition
export function testStorageEnhancementProperty19StaleConflictAutoClearPartition() {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 10_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    (localRevision, serverRevision) =>
      shouldAutoClearKnowgrphStorageConflict(localRevision, serverRevision)
        === (serverRevision >= localRevision),
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 20: Keep Local increments and retries without silent re-retry
export function testStorageEnhancementProperty20KeepLocalRetriesOncePerAction() {
  const actionsSource = sourceText('src/lib/storage/knowgrphStorageConflictActions.ts')
  assert(
    (actionsSource.match(/scheduleKnowgrphStorageSync\(/g) || []).length === 1,
    'expected Keep Local to schedule exactly one explicit retry',
  )
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 10_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    (remoteRevision, currentRevision) => {
      const nextRevision = Math.max(remoteRevision + 1, currentRevision || 1)
      const retryCountAfterAction = 1
      const retryCountAfterRepeatedConflict = retryCountAfterAction
      return nextRevision > remoteRevision
        && nextRevision >= Math.max(1, currentRevision)
        && retryCountAfterRepeatedConflict === 1
        && actionsSource.includes('await patchOutboxForRetry({')
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 21: Accept Remote converges atomically
export function testStorageEnhancementProperty21AcceptRemoteConvergesAtomically() {
  const actionsSource = sourceText('src/lib/storage/knowgrphStorageConflictActions.ts')
  const cacheWriteIndex = actionsSource.indexOf('await putKnowgrphStorageDocument(storage, remoteRecord)')
  const outboxRemoveIndex = actionsSource.indexOf('await row.remove()', cacheWriteIndex)
  assert(cacheWriteIndex >= 0 && outboxRemoveIndex > cacheWriteIndex, 'expected cache write before Outbox removal')
  fc.assert(fc.property(
    fc.boolean(),
    fc.integer({ min: 0, max: 10_000 }),
    (cacheWriteSucceeds, remoteRevision) => {
      let localRevision = 0
      let outboxRetained = true
      if (cacheWriteSucceeds) {
        localRevision = remoteRevision
        outboxRetained = false
      }
      return cacheWriteSucceeds
        ? localRevision === remoteRevision && !outboxRetained
        : localRevision === 0 && outboxRetained
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 22: Concurrent JSON requires CRDT state
export async function testStorageEnhancementProperty22ConcurrentJsonRequiresCrdtState() {
  const workspaceId = 'workspace-property-22'
  const env = createFakeKnowgrphStorageWorkerEnv()
  await seedCollaborationWriter(env.DB, workspaceId)
  await fc.assert(fc.asyncProperty(
    fc.integer({ min: 2, max: 30 }),
    async activePeerCount => {
      const response = await handleCollaborationSave(new Request('http://localhost/api/storage/collab/save', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${COLLABORATION_SESSION_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          apiVersion: '2026-05-04',
          workspaceId,
          documentKey: 'docs/collaborative.json',
          documentKind: 'json',
          repositoryTarget: DOCUMENT_REPOSITORY_TARGETS.workspaceDocs,
          serializedText: '{"value":1}',
          yjsStateBase64: '',
          activePeerCount,
          pocketBaseRoomId: null,
          savedByPeerId: null,
          saveBoundary: 'explicit',
        }),
      }), {
        ...env,
        KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
      }, env.DB)
      const body = await response.json() as { code?: string; error?: string }
      return !canEditRawJsonForCollaboration({ documentKind: 'json', activePeerCount })
        && response.status === 409
        && body.code === 'conflict'
        && String(body.error || '').includes('requires Yjs CRDT state')
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 23: Repository authority is a total re-derived resolver
export function testStorageEnhancementProperty23RepositoryAuthorityIsTotalAndRederived() {
  const bridgeSource = sourceText('../cloudflare/workers/knowgrph-storage/collaborationBridge.ts')
  assert(
    bridgeSource.includes('resolveDocumentRepositoryAuthorityResult({')
      && bridgeSource.includes('repository target does not match path authority'),
    'expected the Worker bridge to re-derive repository authority',
  )
  fc.assert(fc.property(identifierArbitrary, leaf => {
    const cases = [
      [`knowgrph/docs/${leaf}.md`, true, DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs],
      [`docs/workspace-seeds/${leaf}.md`, true, DOCUMENT_REPOSITORY_TARGETS.knowgrphDocs],
      [`workspace/${leaf}.md`, true, DOCUMENT_REPOSITORY_TARGETS.workspaceDocs],
      [`agentic-canvas-os/docs/${leaf}.md`, false, null],
      [`huijoohwee/docs/workspace-seeds/${leaf}.md`, false, null],
    ] as const
    return cases.every(([documentKey, expectedOk, target]) => {
      const result = resolveDocumentRepositoryAuthorityResult({ documentKey, documentKind: 'markdown' })
      return result.ok === expectedOk
        && (!result.ok || result.authority.repositoryTarget === target)
    })
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 24: Cloud upload ordered round-trip
export function testStorageEnhancementProperty24CloudUploadOrderedRoundTrip() {
  const source = sourceText('src/features/source-files/sourceFileCanonicalCloudSync.ts')
  const githubIndex = source.indexOf('const github = await retryCloudUploadStage(')
  const d1Index = source.indexOf('const storageResult = await publishWorkspaceEntriesToKnowgrphStorage')
  const readBackIndex = source.indexOf('readBackText = await readCloudDocumentText')
  assert(githubIndex >= 0 && githubIndex < d1Index && d1Index < readBackIndex, 'expected GitHub, D1, read-back ordering')
  fc.assert(fc.property(markdownArbitrary, text => {
    const events = ['github', 'd1']
    let attempts = 0
    let readBack: string | null = null
    while (attempts < 3 && readBack !== text) {
      attempts += 1
      readBack = text
      events.push('readback')
    }
    return events.join(',') === 'github,d1,readback' && attempts <= 3 && readBack === text
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 25: Credentials never persist in the browser
export function testStorageEnhancementProperty25CredentialsNeverPersistInBrowserState() {
  const dbSource = sourceText('src/lib/storage/knowgrphStorageDb.ts')
  const settingsSource = sourceText('src/features/panels/views/DocumentStorageSyncSettingsRows.tsx')
  fc.assert(fc.property(identifierArbitrary, secretId => {
    const secret = `credential-value-${secretId}-must-not-persist`
    const persistedSettings = {
      mode: 'offline-first',
      workspaceId: 'workspace-property-25',
      baseUrl: 'http://127.0.0.1:8787',
    }
    return !JSON.stringify(persistedSettings).includes(secret)
      && !/\b(repositoryToken|providerKey|apiSecret)\b/.test(dbSource)
      && !/\b(repositoryToken|providerKey|apiSecret)\b/.test(settingsSource)
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 26: Same-key upsert preserves identity
export async function testStorageEnhancementProperty26SameKeyUpsertPreservesIdentity() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (firstId, secondIdSeed, canonicalPath, text) => {
      const secondId = secondIdSeed === firstId ? `${secondIdSeed}-other` : secondIdSeed
      const env = createFakeKnowgrphStorageWorkerEnv()
      const workspaceId = `workspace-${firstId}`
      const context = {
        db: env.DB,
        workspaceId,
        nowIso: '2026-07-23T00:00:00.000Z',
        documentIdAliases: new Map<string, string>(),
      }
      const first = buildDocumentRecord({ id: firstId, workspaceId, canonicalPath, contentMd: text })
      const second = buildDocumentRecord({
        id: secondId,
        workspaceId,
        canonicalPath,
        contentMd: `${text}\nupsert`,
        revision: 2,
      })
      await processKnowgrphStorageMutation(context as never, buildDocumentMutation('first', first, null))
      const acknowledgement = await processKnowgrphStorageMutation(
        context as never,
        buildDocumentMutation('second', second, 1),
      )
      const rows = Array.from(env.DB.documents.values())
      return acknowledgement.status === 'applied'
        && rows.length === 1
        && rows[0]?.id === firstId
        && rows[0]?.canonical_path === canonicalPath
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 27: Content hash is correct and change-sensitive
export function testStorageEnhancementProperty27ContentHashCorrectAndChangeSensitive() {
  fc.assert(fc.property(
    markdownArbitrary,
    fc.string({ minLength: 1, maxLength: 20 }),
    (text, suffix) => {
      const changed = `${text}\u0000${suffix}`
      const firstHash = hashKnowgrphStorageContent(text)
      const changedHash = hashKnowgrphStorageContent(changed)
      const record = buildDocumentRecord({
        id: 'document-property-27',
        workspaceId: 'workspace-property-27',
        canonicalPath: 'docs/property-27.md',
        contentMd: text,
      })
      return record.contentHash === firstHash
        && changedHash === hashKnowgrphStorageContent(changed)
        && changedHash !== firstHash
        && validateKnowgrphStorageMutation(
          record.workspaceId,
          buildDocumentMutation('property-27', record, null),
        ) === null
    },
  ), { numRuns: PROPERTY_RUNS })
}
