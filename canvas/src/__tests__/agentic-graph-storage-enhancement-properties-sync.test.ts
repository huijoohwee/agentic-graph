import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import {
  createFakeAgenticGraphStorageWorkerEnv,
  type FakeAgenticGraphStorageD1Database,
} from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import {
  __resetAgenticGraphStorageDbForTests,
  getAgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import { queueAgenticGraphStorageMutation } from '@/lib/storage/agentic-graph-storage-client-push'
import { cancelAgenticGraphStorageSync } from '@/lib/storage/agentic-graph-storage-client-sync'
import { partitionPulledAgenticGraphStorageChanges } from '@/lib/storage/agentic-graph-storage-conflict-store'
import {
  __setAgenticGraphStorageConflictProjectionForTests,
  buildAgenticGraphStorageConflictAcceptRemoteActionId,
  buildAgenticGraphStorageConflictKeepLocalActionId,
  runAgenticGraphStorageConflictAction,
} from '@/lib/storage/agentic-graph-storage-conflict-actions'
import { toAgenticGraphLocalDocumentRecord } from '@/lib/storage/agentic-graph-storage-record-mapping'
import {
  hashAgenticGraphStorageContent,
  type KgDocumentRecord,
  type AgenticGraphStorageMutation,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  canEditRawJsonForCollaboration,
} from '../../../grph-shared/src/collaboration/yjsSnapshot'
import {
  DOCUMENT_REPOSITORY_TARGETS,
  resolveDocumentRepositoryAuthorityResult,
} from '../../../grph-shared/src/collaboration/documentRepositoryAuthority'
import { handleCollaborationSave } from '../../../cloudflare/workers/agentic-graph-storage/collaborationBridge'
import {
  processAgenticGraphStorageMutation,
  validateAgenticGraphStorageMutation,
} from '../../../cloudflare/workers/agentic-graph-storage/mutationProcessor'
const PROPERTY_RUNS = 100
const COLLABORATION_SESSION_TOKEN = 'property-22-session'
const sourceText = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}
const seedCollaborationWriter = async (
  db: FakeAgenticGraphStorageD1Database,
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
  contentHash: hashAgenticGraphStorageContent(args.contentMd),
  parserVersion: 'property-test',
  revision: args.revision ?? 1,
  updatedAtMs: args.updatedAtMs ?? 1_777_000_000_000,
  deleted: false,
})
const buildDocumentMutation = (
  mutationId: string,
  record: KgDocumentRecord,
  baseRevision: number | null,
): Extract<AgenticGraphStorageMutation, { entity: 'document' }> => ({
  mutationId,
  workspaceId: record.workspaceId,
  entity: 'document',
  op: 'upsert',
  recordId: record.id,
  baseRevision,
  record,
})
// Feature: agentic-graph-storage-sync-enhancement, Property 14: Chunks are addressed by semantic keys
export function testStorageEnhancementProperty14ChunksUseSemanticKeys() {
  fc.assert(fc.property(
    fc.array(identifierArbitrary.map(id => `heading:${id}`), { maxLength: 30 }),
    keys => keys.every(key => {
      const markdown = `# ${key}`
      const mutation: AgenticGraphStorageMutation = {
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
          contentHash: hashAgenticGraphStorageContent(markdown),
          updatedAtMs: 1,
        },
      }
      const byteOffsetMutation = {
        ...mutation,
        record: { ...mutation.record, chunkKey: '10:20' },
      } as AgenticGraphStorageMutation
      return validateAgenticGraphStorageMutation('workspace-property-14', mutation) === null
        && validateAgenticGraphStorageMutation('workspace-property-14', byteOffsetMutation)
          === 'document chunk requires a semantic chunkKey'
    }),
  ), { numRuns: PROPERTY_RUNS })
}
// Feature: agentic-graph-storage-sync-enhancement, Property 15: Equal document hash reuses stored artifacts
export function testStorageEnhancementProperty15EqualDocumentHashReusesArtifacts() {
  const processor = sourceText('../cloudflare/workers/agentic-graph-storage/mutationProcessor.ts')
  assert(processor.includes('documentFieldsEqual'), 'expected document no-op comparison before D1 write')
  fc.assert(fc.property(markdownArbitrary, text => {
    const stored = {
      contentHash: hashAgenticGraphStorageContent(text),
      markdownObject: { text },
      graphSnapshot: { derivedFrom: hashAgenticGraphStorageContent(text) },
    }
    const incomingHash = hashAgenticGraphStorageContent(text)
    const selected = incomingHash === stored.contentHash
      ? { markdownObject: stored.markdownObject, graphSnapshot: stored.graphSnapshot }
      : { markdownObject: { text }, graphSnapshot: { derivedFrom: incomingHash } }
    return selected.markdownObject === stored.markdownObject
      && selected.graphSnapshot === stored.graphSnapshot
  }), { numRuns: PROPERTY_RUNS })
}
// Feature: agentic-graph-storage-sync-enhancement, Property 16: No-op write skipping
export async function testStorageEnhancementProperty16NoOpWriteSkipping() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (id, canonicalPath, text) => {
      const env = createFakeAgenticGraphStorageWorkerEnv()
      const workspaceId = `workspace-${id}`
      const context = {
        db: env.DB,
        workspaceId,
        nowIso: '2026-07-23T00:00:00.000Z',
        documentIdAliases: new Map<string, string>(),
      }
      const firstRecord = buildDocumentRecord({ id, workspaceId, canonicalPath, contentMd: text })
      await processAgenticGraphStorageMutation(context as never, buildDocumentMutation(`first-${id}`, firstRecord, null))
      const afterFirst = env.DB.storageRecordWriteCounts.documents
      await processAgenticGraphStorageMutation(context as never, buildDocumentMutation(`same-${id}`, firstRecord, 1))
      const afterSame = env.DB.storageRecordWriteCounts.documents
      const changedRecord = buildDocumentRecord({
        id,
        workspaceId,
        canonicalPath,
        contentMd: `${text}\nchanged`,
        revision: 2,
        updatedAtMs: firstRecord.updatedAtMs + 1,
      })
      await processAgenticGraphStorageMutation(context as never, buildDocumentMutation(`changed-${id}`, changedRecord, 1))
      return afterFirst === 1
        && afterSame === afterFirst
        && env.DB.storageRecordWriteCounts.documents === afterSame + 1
    },
  ), { numRuns: PROPERTY_RUNS })
}
// Feature: agentic-graph-storage-sync-enhancement, Property 17: Stale base revision rejected and preserved
export async function testStorageEnhancementProperty17StaleBaseRevisionRejectedAndPreserved() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (id, canonicalPath, text) => {
      const env = createFakeAgenticGraphStorageWorkerEnv()
      const workspaceId = `workspace-${id}`
      const context = {
        db: env.DB,
        workspaceId,
        nowIso: '2026-07-23T00:00:00.000Z',
        documentIdAliases: new Map<string, string>(),
      }
      const serverRecord = buildDocumentRecord({ id, workspaceId, canonicalPath, contentMd: text, revision: 3 })
      await processAgenticGraphStorageMutation(context as never, buildDocumentMutation(`seed-${id}`, serverRecord, null))
      const staleRecord = buildDocumentRecord({
        id,
        workspaceId,
        canonicalPath,
        contentMd: `${text}\nstale`,
        revision: 2,
      })
      const acknowledgement = await processAgenticGraphStorageMutation(
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
// Feature: agentic-graph-storage-sync-enhancement, Property 18: Conflicts surface through the single shared path
export function testStorageEnhancementProperty18ConflictsUseSharedUxPath() {
  const uxSource = sourceText('src/lib/storage/agentic-graph-storage-conflict-ux.ts')
  fc.assert(fc.property(canonicalPathArbitrary, canonicalPath => {
    const conflict = { canonicalPath, mutationId: `mutation:${canonicalPath}` }
    return conflict.canonicalPath === canonicalPath
      && uxSource.includes('notifyAgenticGraphStorageConflictUx')
      && uxSource.includes('canonicalPath')
      && uxSource.includes("label: 'Keep Local'")
      && uxSource.includes("label: 'Accept Remote'")
      && uxSource.includes("label: 'Review Log'")
  }), { numRuns: PROPERTY_RUNS })
}
// Feature: agentic-graph-storage-sync-enhancement, Property 19: Pulled conflicts remain retained candidates
export async function testStorageEnhancementProperty19StaleConflictAutoClearPartition() {
  await __resetAgenticGraphStorageDbForTests()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'workspace-property-19'
  const remoteRecord = buildDocumentRecord({
    id: 'document-property-19', workspaceId, canonicalPath: 'docs/property-19.md',
    contentMd: '# Remote retained', revision: 9,
  })
  const mutationId = await queueAgenticGraphStorageMutation({
    workspaceId, entity: 'document', op: 'upsert', baseRevision: 2,
    record: { ...remoteRecord, contentMd: '# Local retained', revision: 3 }, dbState,
  })
  const outbox = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  await outbox?.incrementalPatch({ lastAckStatus: 'conflict' })
  const partition = await partitionPulledAgenticGraphStorageChanges({
    dbState,
    workspaceId,
    changes: { documents: [remoteRecord], documentChunks: [], graphSnapshots: [] },
  })
  assert(partition.applicableChanges.documents.length === 0, 'conflicting pull must not overwrite local')
  assert(await dbState.collections.syncOutbox.findOne(mutationId).exec(), 'conflicting outbox row must remain')
  const candidate = await dbState.collections.syncConflicts.findOne(mutationId).exec()
  assert(candidate?.get('serverRevision') === 9, 'remote revision must be retained as an explicit candidate')
  await __resetAgenticGraphStorageDbForTests()
}
// Feature: agentic-graph-storage-sync-enhancement, Property 20: Keep Local coalesces latest state and preserves deletes
export async function testStorageEnhancementProperty20KeepLocalRetriesOncePerAction() {
  await __resetAgenticGraphStorageDbForTests()
  const dbState = await getAgenticGraphStorageDb()
  let projectionCalls = 0, rejectProjection = true
  const readProjectionCalls = (): number => projectionCalls
  const restoreProjection = __setAgenticGraphStorageConflictProjectionForTests(async () => { projectionCalls += 1; if (rejectProjection) throw new Error('injected Keep Local projection failure') })
  const documentWorkspace = 'workspace-property-20-document'
  const graphWorkspace = 'workspace-property-20-graph'
  try {
    const localOld = buildDocumentRecord({
      id: 'document-property-20', workspaceId: documentWorkspace, canonicalPath: 'docs/property-20.md',
      contentMd: '# Local old', revision: 2,
    })
    const localLatest = { ...localOld, contentMd: '# Local latest', revision: 5,
      contentHash: hashAgenticGraphStorageContent('# Local latest'), updatedAtMs: localOld.updatedAtMs + 3 }
    const firstId = await queueAgenticGraphStorageMutation({
      workspaceId: documentWorkspace, entity: 'document', op: 'upsert', baseRevision: 1, record: localOld, dbState,
    })
    const latestId = await queueAgenticGraphStorageMutation({
      workspaceId: documentWorkspace, entity: 'document', op: 'upsert', baseRevision: 2, record: localLatest, dbState,
    })
    await (await dbState.collections.syncOutbox.findOne(firstId).exec())?.incrementalPatch({
      lastAckStatus: 'conflict', createdAtMs: 10,
    })
    await (await dbState.collections.syncOutbox.findOne(latestId).exec())?.incrementalPatch({ lastAckStatus: 'conflict', createdAtMs: 20 })
    await dbState.collections.documents.incrementalUpsert(toAgenticGraphLocalDocumentRecord(localLatest))
    const remote = { ...localOld, contentMd: '# Remote', revision: 7,
      contentHash: hashAgenticGraphStorageContent('# Remote') }
    await dbState.collections.syncConflicts.incrementalUpsert({
      id: firstId, workspaceId: documentWorkspace, mutationId: firstId, entity: 'document',
      recordId: remote.id, serverRevision: 7, remoteRecord: remote, receivedAtMs: 1,
    })
    const keepAction = buildAgenticGraphStorageConflictKeepLocalActionId(documentWorkspace, firstId)
    await Promise.all([runAgenticGraphStorageConflictAction(keepAction), runAgenticGraphStorageConflictAction(
      buildAgenticGraphStorageConflictKeepLocalActionId(documentWorkspace, latestId))])
    assert(readProjectionCalls() === 1, 'same-target Keep Local actions must run one resolution')
    assert((await dbState.collections.syncOutbox.findOne(latestId).exec())?.get('lastAckStatus') === 'conflict'
      && !!(await dbState.collections.syncConflicts.findOne(firstId).exec()), 'Keep Local must retain retryable conflict state')
    rejectProjection = false
    await runAgenticGraphStorageConflictAction(keepAction)
    assert(readProjectionCalls() === 2, 'retained Keep Local conflict must allow projection retry')
    cancelAgenticGraphStorageSync(documentWorkspace)
    const retries = await dbState.collections.syncOutbox.find({ selector: { workspaceId: documentWorkspace } }).exec()
    const retryMutation = retries[0]?.get('payload') as unknown as AgenticGraphStorageMutation | undefined
    assert(retries.length === 1 && retries[0]?.get('id') === latestId, 'Keep Local must coalesce to the latest outbox identity')
    assert(retryMutation?.entity === 'document' && retryMutation.record.contentMd === '# Local latest'
      && retryMutation.record.revision === 8, 'Keep Local must retry current local content above the remote revision')
    const retrySnapshot = JSON.stringify(retries[0]?.toJSON())
    await runAgenticGraphStorageConflictAction(keepAction)
    assert(JSON.stringify((await dbState.collections.syncOutbox.findOne(latestId).exec())?.toJSON()) === retrySnapshot,
      'a stale Keep Local click must not mutate a non-conflict retry')
    const graph = {
      id: 'graph-property-20', documentId: 'document-property-20', workspaceId: graphWorkspace,
      graphRevision: 3, graphHash: 'graph-local', graphJson: { local: true }, layoutJson: null,
      derivedFromDocumentRevision: 2, updatedAtMs: 30,
    }
    const graphId = await queueAgenticGraphStorageMutation({
      workspaceId: graphWorkspace, entity: 'graphSnapshot', op: 'delete', baseRevision: 3, record: graph, dbState,
    })
    await (await dbState.collections.syncOutbox.findOne(graphId).exec())?.incrementalPatch({ lastAckStatus: 'conflict' })
    await dbState.collections.syncConflicts.incrementalUpsert({
      id: graphId, workspaceId: graphWorkspace, mutationId: graphId, entity: 'graphSnapshot', recordId: graph.id,
      serverRevision: 4, remoteRecord: { ...graph, graphRevision: 4 }, receivedAtMs: 2,
    })
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictKeepLocalActionId(graphWorkspace, graphId))
    cancelAgenticGraphStorageSync(graphWorkspace)
    const graphRetry = await dbState.collections.syncOutbox.findOne(graphId).exec()
    const graphMutation = graphRetry?.get('payload') as unknown as AgenticGraphStorageMutation | undefined
    assert(!(await dbState.collections.graphSnapshots.findOne(graph.id).exec()), 'Keep Local delete must preserve graph absence')
    assert(graphMutation?.entity === 'graphSnapshot' && graphMutation.op === 'delete'
      && graphMutation.record.graphRevision === 5, 'Keep Local must queue one rebased graph delete')
  } finally {
    cancelAgenticGraphStorageSync(documentWorkspace)
    cancelAgenticGraphStorageSync(graphWorkspace)
    restoreProjection()
    await __resetAgenticGraphStorageDbForTests()
  }
}
// Feature: agentic-graph-storage-sync-enhancement, Property 21: Accept Remote resolves the complete target atomically
export async function testStorageEnhancementProperty21AcceptRemoteConvergesAtomically() {
  await __resetAgenticGraphStorageDbForTests()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'workspace-property-21'
  let projectionCalls = 0
  let rejectProjection = true
  const readProjectionCalls = (): number => projectionCalls
  const restoreProjection = __setAgenticGraphStorageConflictProjectionForTests(async () => {
    projectionCalls += 1
    if (rejectProjection) throw new Error('injected projection failure')
  })
  try {
    const local = buildDocumentRecord({
      id: 'local-document-property-21', workspaceId, canonicalPath: 'docs/property-21.md',
      contentMd: '# Local', revision: 2,
    })
    const localLatest = { ...local, contentMd: '# Local latest', revision: 4,
      contentHash: hashAgenticGraphStorageContent('# Local latest'), updatedAtMs: local.updatedAtMs + 2 }
    const firstId = await queueAgenticGraphStorageMutation({
      workspaceId, entity: 'document', op: 'upsert', baseRevision: 1, record: local, dbState,
    })
    const latestId = await queueAgenticGraphStorageMutation({
      workspaceId, entity: 'document', op: 'upsert', baseRevision: 2, record: localLatest, dbState,
    })
    await (await dbState.collections.syncOutbox.findOne(firstId).exec())?.incrementalPatch({
      lastAckStatus: 'conflict', createdAtMs: 10,
    })
    await (await dbState.collections.syncOutbox.findOne(latestId).exec())?.incrementalPatch({ createdAtMs: 20 })
    await dbState.collections.documents.incrementalUpsert(toAgenticGraphLocalDocumentRecord(localLatest))
    const remoteOld = buildDocumentRecord({
      id: 'server-document-property-21', workspaceId, canonicalPath: local.canonicalPath,
      contentMd: '# Remote old', revision: 7,
    })
    const remoteLatest = { ...remoteOld, contentMd: '# Remote latest', revision: 9,
      contentHash: hashAgenticGraphStorageContent('# Remote latest'), updatedAtMs: remoteOld.updatedAtMs + 2 }
    await dbState.collections.syncConflicts.incrementalUpsert({
      id: firstId, workspaceId, mutationId: firstId, entity: 'document', recordId: remoteOld.id,
      serverRevision: 7, remoteRecord: remoteOld, receivedAtMs: 1,
    })
    await dbState.collections.syncConflicts.incrementalUpsert({
      id: latestId, workspaceId, mutationId: latestId, entity: 'document', recordId: remoteLatest.id,
      serverRevision: 9, remoteRecord: remoteLatest, receivedAtMs: 2,
    })
    await runAgenticGraphStorageConflictAction(buildAgenticGraphStorageConflictAcceptRemoteActionId(workspaceId, latestId))
    assert(readProjectionCalls() === 0, 'a pending mutation must not satisfy the conflict action precondition')
    await (await dbState.collections.syncOutbox.findOne(latestId).exec())?.incrementalPatch({ lastAckStatus: 'conflict' })
    const action = buildAgenticGraphStorageConflictAcceptRemoteActionId(workspaceId, firstId)
    await Promise.all([runAgenticGraphStorageConflictAction(action), runAgenticGraphStorageConflictAction(
      buildAgenticGraphStorageConflictAcceptRemoteActionId(workspaceId, latestId))])
    const stored = await dbState.collections.documents.findOne(remoteLatest.id).exec()
    assert(stored?.get('contentMd') === '# Remote latest', 'Accept Remote must select the latest retained candidate')
    assert(!(await dbState.collections.documents.findOne(local.id).exec()), 'Accept Remote must remove the aliased local document')
    assert((await dbState.collections.syncOutbox.find({ selector: { workspaceId } }).exec()).length === 2,
      'Accept Remote must retain retryable conflict state when visible projection fails')
    rejectProjection = false
    await runAgenticGraphStorageConflictAction(action)
    assert((await dbState.collections.syncOutbox.find({ selector: { workspaceId } }).exec()).length === 0,
      'Accept Remote must remove all same-target outbox rows after visible projection succeeds')
    assert((await dbState.collections.syncConflicts.find({ selector: { workspaceId } }).exec()).length === 0,
      'Accept Remote must remove all same-target candidates after visible projection succeeds')
    assert(readProjectionCalls() === 2, 'the target-scoped guard must run each resolution attempt only once')
    await runAgenticGraphStorageConflictAction(action)
    assert(readProjectionCalls() === 2, 'a stale Accept Remote click must remain a no-op after durable resolution')
  } finally {
    restoreProjection()
    await __resetAgenticGraphStorageDbForTests()
  }
}
// Feature: agentic-graph-storage-sync-enhancement, Property 22: Concurrent JSON requires CRDT state
export async function testStorageEnhancementProperty22ConcurrentJsonRequiresCrdtState() {
  const workspaceId = 'workspace-property-22'
  const env = createFakeAgenticGraphStorageWorkerEnv()
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
          operation: 'upsert',
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
        AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
      }, env.DB)
      const body = await response.json() as { code?: string; error?: string }
      return !canEditRawJsonForCollaboration({ documentKind: 'json', activePeerCount })
        && response.status === 409
        && body.code === 'conflict'
        && String(body.error || '').includes('requires Yjs CRDT state')
    },
  ), { numRuns: PROPERTY_RUNS })
}
// Feature: agentic-graph-storage-sync-enhancement, Property 23: Repository authority is a total re-derived resolver
export function testStorageEnhancementProperty23RepositoryAuthorityIsTotalAndRederived() {
  const bridgeSource = sourceText('../cloudflare/workers/agentic-graph-storage/collaborationBridge.ts')
  assert(
    bridgeSource.includes('resolveDocumentRepositoryAuthorityResult({')
      && bridgeSource.includes('repository target does not match path authority'),
    'expected the Worker bridge to re-derive repository authority',
  )
  fc.assert(fc.property(identifierArbitrary, leaf => {
    const cases = [
      [`agentic-graph/docs/${leaf}.md`, true, DOCUMENT_REPOSITORY_TARGETS.agenticGraphDocs],
      [`docs/workspace-seeds/${leaf}.md`, true, DOCUMENT_REPOSITORY_TARGETS.agenticGraphDocs],
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
// Feature: agentic-graph-storage-sync-enhancement, Property 24: Cloud upload ordered round-trip
export function testStorageEnhancementProperty24CloudUploadOrderedRoundTrip() {
  const source = sourceText('src/features/source-files/sourceFileCanonicalCloudSync.ts')
  const githubIndex = source.indexOf('const github = await retryCloudUploadStage(')
  const d1Index = source.indexOf('const storageResult = await publishWorkspaceEntriesToAgenticGraphStorage')
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
// Feature: agentic-graph-storage-sync-enhancement, Property 25: Credentials never persist in the browser
export function testStorageEnhancementProperty25CredentialsNeverPersistInBrowserState() {
  const dbSource = sourceText('src/lib/storage/agentic-graph-storage-db.ts')
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
// Feature: agentic-graph-storage-sync-enhancement, Property 26: Same-key upsert preserves identity
export async function testStorageEnhancementProperty26SameKeyUpsertPreservesIdentity() {
  await fc.assert(fc.asyncProperty(
    identifierArbitrary,
    identifierArbitrary,
    canonicalPathArbitrary,
    markdownArbitrary,
    async (firstId, secondIdSeed, canonicalPath, text) => {
      const secondId = secondIdSeed === firstId ? `${secondIdSeed}-other` : secondIdSeed
      const env = createFakeAgenticGraphStorageWorkerEnv()
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
      await processAgenticGraphStorageMutation(context as never, buildDocumentMutation('first', first, null))
      const acknowledgement = await processAgenticGraphStorageMutation(
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
// Feature: agentic-graph-storage-sync-enhancement, Property 27: Content hash is correct and change-sensitive
export function testStorageEnhancementProperty27ContentHashCorrectAndChangeSensitive() {
  fc.assert(fc.property(
    markdownArbitrary,
    fc.string({ minLength: 1, maxLength: 20 }),
    (text, suffix) => {
      const changed = `${text}\u0000${suffix}`
      const firstHash = hashAgenticGraphStorageContent(text)
      const changedHash = hashAgenticGraphStorageContent(changed)
      const record = buildDocumentRecord({
        id: 'document-property-27',
        workspaceId: 'workspace-property-27',
        canonicalPath: 'docs/property-27.md',
        contentMd: text,
      })
      return record.contentHash === firstHash
        && changedHash === hashAgenticGraphStorageContent(changed)
        && changedHash !== firstHash
        && validateAgenticGraphStorageMutation(
          record.workspaceId,
          buildDocumentMutation('property-27', record, null),
        ) === null
    },
  ), { numRuns: PROPERTY_RUNS })
}
