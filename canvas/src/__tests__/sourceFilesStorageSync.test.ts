import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import { createStorageWorkerFetch, readStorageWorker } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import type { SourceFile } from '@/hooks/store/types'
import {
  __resetAgenticGraphStorageDbForTests,
  getAgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  buildAgenticGraphStorageDocPath,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  buildPublishedDocCanvasEmbedUrl,
  buildPublishedDocCanvasEmbedUrlFromSource,
} from '@/features/canvas/canvasDocDeepLink'
import {
  buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState,
  buildSourceFilesStorageSyncSignature,
  syncSourceFilesToAgenticGraphStorage,
} from '@/features/source-files/sourceFilesStorageSync'
import {
  publishWorkspaceEntriesToAgenticGraphStorage,
  publishWorkspaceEntryShareUrl,
} from '@/features/source-files/sourceFileShareUrl'
import { getSourceFileTextHash } from '@/features/source-files/sourceFilesSignatures'

const sourceFileFixture: SourceFile = {
  id: 'file_a',
  name: 'demo.md',
  text: '# Demo',
  enabled: true,
  status: 'parsed',
  parsedParserId: 'markdown',
  parsedTextHash: 'sha256:text',
  parsedGraphRevision: 3,
  parsedGraphData: {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'Demo', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  },
  source: {
    kind: 'local',
    path: '/imports/demo.md',
  },
}

export function testAgenticGraphWorkspaceIdUsesCanonicalDefaultAcrossDeviceLocalWorkspaceState() {
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  const a = buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
    folderName: 'notes',
    accessMode: 'opfs',
    folderCacheId: 'cache_a',
    selectedFolderPath: 'notes/demo',
  })
  const b = buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
    folderName: 'notes',
    accessMode: 'opfs',
    folderCacheId: 'cache_a',
    selectedFolderPath: 'notes/demo',
  })
  const c = buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
    folderName: 'notes',
    accessMode: 'opfs',
    folderCacheId: 'cache_b',
    selectedFolderPath: 'notes/demo',
  })
  if (a !== 'kgws:canonical-docs' || b !== a || c !== a) {
    throw new Error('expected browser-local workspace metadata to resolve to one canonical cross-device storage workspace')
  }
  if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
}

export function testAgenticGraphWorkspaceIdUsesStorageWorkspaceIdOverrideWhenConfigured() {
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = 'kgws:canonical-docs'
  try {
    const workspaceId = buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
      folderName: 'notes',
      accessMode: 'opfs',
      folderCacheId: 'cache_a',
      selectedFolderPath: 'notes/demo',
    })
    if (workspaceId !== 'kgws:canonical-docs') {
      throw new Error(`expected storage workspace id override to win, got ${workspaceId}`)
    }
  } finally {
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  }
}

export async function testSourceFilesStorageSyncQueuesDocumentAndGraphMutationsFromRealSourceFiles() {
  await __resetAgenticGraphStorageDbForTests()
  const dbState = await getAgenticGraphStorageDb()
  const result = await syncSourceFilesToAgenticGraphStorage({
    workspaceId: 'kgws:test-source-files',
    sourceFiles: [sourceFileFixture],
    previousSourceFiles: [],
    dbState,
  })
  if (result.queuedMutationCount !== 2) {
    throw new Error(`expected document and graph snapshot mutations to be queued, received ${result.queuedMutationCount}`)
  }
  const documentRow = await dbState.collections.documents.findOne('sf:file_a').exec()
  if (!documentRow) throw new Error('expected source-file sync to create a local document mirror row')
  if (Number(documentRow.get('documentRevision') || 0) !== 1) {
    throw new Error('expected first mirrored document revision to start at 1')
  }
  const graphRow = await dbState.collections.graphSnapshots.findOne('sf-graph:file_a').exec()
  if (!graphRow) throw new Error('expected source-file sync to create a graph snapshot mirror row')
  const outboxRows = await dbState.collections.syncOutbox.find().exec()
  if (outboxRows.length !== 2) throw new Error('expected queued storage mutations to be written into the outbox')

  const repeat = await syncSourceFilesToAgenticGraphStorage({
    workspaceId: 'kgws:test-source-files',
    sourceFiles: [sourceFileFixture],
    previousSourceFiles: [sourceFileFixture],
    dbState,
  })
  if (repeat.queuedMutationCount !== 0) {
    throw new Error('expected unchanged source files to avoid queuing duplicate storage mutations')
  }
  await __resetAgenticGraphStorageDbForTests()
}

export async function testSourceFilesStorageSyncQueuesDeletesFromPreviousLocalSnapshotOnly() {
  await __resetAgenticGraphStorageDbForTests()
  const dbState = await getAgenticGraphStorageDb()
  await syncSourceFilesToAgenticGraphStorage({
    workspaceId: 'kgws:test-source-files-delete',
    sourceFiles: [sourceFileFixture],
    previousSourceFiles: [],
    dbState,
  })
  const result = await syncSourceFilesToAgenticGraphStorage({
    workspaceId: 'kgws:test-source-files-delete',
    sourceFiles: [],
    previousSourceFiles: [sourceFileFixture],
    dbState,
  })
  if (result.queuedMutationCount !== 2) {
    throw new Error(`expected delete document and graph snapshot mutations, received ${result.queuedMutationCount}`)
  }
  const documentRow = await dbState.collections.documents.findOne('sf:file_a').exec()
  if (!documentRow || documentRow.get('isDeleted') !== true) {
    throw new Error('expected deleted source-file document mirror row to remain as a tombstone')
  }
  await __resetAgenticGraphStorageDbForTests()
}

export function testSourceFilesStorageSyncSignatureIgnoresUiOnlySelectionState() {
  const base: SourceFile = {
    ...sourceFileFixture,
    parsedGraphData: {
      type: 'Graph',
      nodes: [{ id: 'n1', label: 'Demo', type: 'Thing', properties: {} }],
      edges: [],
      metadata: {},
    },
  }
  const signatureA = buildSourceFilesStorageSyncSignature([base])
  const signatureB = buildSourceFilesStorageSyncSignature([{
    ...base,
    enabled: !base.enabled,
    status: 'loading',
    parsedTextHash: 'different-ui-owned-hash',
  }])
  if (signatureA !== signatureB) {
    throw new Error('expected storage sync signature to ignore UI-only source-file selection/churn fields')
  }
}

export function testSourceFilesStorageSyncTextHashCacheTracksMutableText() {
  const mutable: SourceFile = {
    ...sourceFileFixture,
    id: 'mutable-text',
    text: '# Mutable A',
  }
  const firstTextHash = getSourceFileTextHash(mutable)
  const firstSignature = buildSourceFilesStorageSyncSignature([mutable])
  mutable.text = '# Mutable B'
  const secondTextHash = getSourceFileTextHash(mutable)
  const secondSignature = buildSourceFilesStorageSyncSignature([mutable])
  if (secondTextHash === firstTextHash) {
    throw new Error('expected shared source-file text hash cache to invalidate when text changes in place')
  }
  if (secondSignature === firstSignature) {
    throw new Error('expected storage sync signature to track changed markdown text through the shared text hash helper')
  }
}

export function testSourceFilesStorageSyncSkipsWorkspaceBackedSourceFiles() {
  const workspaceOnly: SourceFile = {
    ...sourceFileFixture,
    id: 'workspace-only',
    source: {
      kind: 'local',
      path: 'workspace:/docs/agentic-graph-video-demo.md',
    },
  }
  const signature = buildSourceFilesStorageSyncSignature([workspaceOnly])
  if (signature !== '[]') {
    throw new Error('expected storage sync signature to skip workspace-backed source files and avoid switch-time churn')
  }
}

export async function testSelectedWorkspaceEntriesPublishAsExplicitStorageRecords() {
  await __resetAgenticGraphStorageDbForTests()
  const result = await publishWorkspaceEntriesToAgenticGraphStorage({
    workspaceId: 'kgws:test-settings-import-selection',
    syncNow: false,
    entries: [
      {
        path: '/workspace/chat/a.md',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'a.md',
        text: '# A',
        updatedAtMs: 1,
      },
      {
        path: '/workspace/chat/data.txt',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'data.txt',
        text: 'alpha,beta',
        updatedAtMs: 2,
      },
      {
        path: '/workspace/chat',
        parentPath: '/workspace',
        kind: 'folder',
        name: 'chat',
        updatedAtMs: 3,
      },
    ],
  })
  if (result.storedCount !== 2) {
    throw new Error(`expected selected file records to publish without folder rows, got ${result.storedCount}`)
  }
  if (result.queuedMutationCount !== 2) {
    throw new Error(`expected one storage document mutation per selected file, got ${result.queuedMutationCount}`)
  }
  if (!result.canonicalPaths.includes('workspace/chat/a.md') || !result.canonicalPaths.includes('workspace/chat/data.txt')) {
    throw new Error(`expected selected workspace paths to map to neutral canonical storage paths, got ${JSON.stringify(result.canonicalPaths)}`)
  }
  const dbState = await getAgenticGraphStorageDb()
  const rows = await dbState.collections.documents.find({ selector: { workspaceId: 'kgws:test-settings-import-selection' } }).exec()
  if (rows.length !== 2) {
    throw new Error(`expected storage DB to contain two selected import documents, got ${rows.length}`)
  }
  await __resetAgenticGraphStorageDbForTests()
}

export async function testSelectedWorkspaceEntriesFlushToPublicStorageWorker() {
  await __resetAgenticGraphStorageDbForTests()
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const fetchImpl = createStorageWorkerFetch(env)
  const workspaceId = 'kgws:test-settings-share-url-worker'
  const dbState = await getAgenticGraphStorageDb()
  const result = await publishWorkspaceEntriesToAgenticGraphStorage({
    workspaceId,
    syncNow: true,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
    entries: [
      {
        path: '/workspace/chat/shared.md',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'shared.md',
        text: '# Shared through storage',
        updatedAtMs: 1,
      },
    ],
  })
  if (result.storedCount !== 1) {
    throw new Error(`expected one selected file to be stored, got ${result.storedCount}`)
  }
  if (!result.syncResult || result.syncResult.pushedCount !== 1 || result.syncResult.appliedCount !== 1) {
    throw new Error(`expected storage publish to flush one public worker mutation, got ${JSON.stringify(result.syncResult)}`)
  }
  const docResponse = await readStorageWorker().fetch(
    new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'workspace/chat/shared.md')}`),
    env as never,
  )
  if (!docResponse.ok) {
    throw new Error(`expected published storage document to be readable from the local storage worker, got ${docResponse.status}`)
  }
  const text = await docResponse.text()
  if (text !== '# Shared through storage') {
    throw new Error(`expected public document content to match selected file, got ${text}`)
  }
  await __resetAgenticGraphStorageDbForTests()
}

export async function testSourceFileShareUrlFailsClosedWhenStoragePublishFails() {
  await __resetAgenticGraphStorageDbForTests()
  let rejected = false
  try {
    await publishWorkspaceEntryShareUrl({
      workspaceId: 'kgws:test-share-url-fail-closed',
      baseUrl: 'https://example.com',
      fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'push failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
      entry: {
        path: '/workspace/chat/fail.md',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'fail.md',
        text: '# Fail closed',
        updatedAtMs: 1,
      },
    })
  } catch {
    rejected = true
  }
  if (!rejected) {
    throw new Error('expected Share URL generation to fail closed instead of copying an unpublished public URL')
  }
  await __resetAgenticGraphStorageDbForTests()
}

export async function testSourceFileShareUrlReturnsAirvioOpaquePublicRouteAfterPublish() {
  await __resetAgenticGraphStorageDbForTests()
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  try {
    const env = createFakeAgenticGraphStorageWorkerEnv()
    const fetchImpl = createStorageWorkerFetch(env)
    const shareUrl = await publishWorkspaceEntryShareUrl({
      workspaceId: 'kgws:test-share-url-public-route',
      baseUrl: 'https://example.com',
      fetchImpl,
      entry: {
        path: '/workspace/chat/public.md',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'public.md',
        text: '# Public Share URL',
        updatedAtMs: 1,
      },
    })
    if (!shareUrl || !shareUrl.startsWith('https://airvio.co/agentic-graph/share/')) {
      throw new Error(`expected Share URL to use the public airvio.co opaque share route, got ${String(shareUrl || '')}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    await __resetAgenticGraphStorageDbForTests()
  }
}

export function testPublishedDocCanvasEmbedUrlAppendsPreviewParamToOpaqueShareRoute() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  try {
    const embedUrl = buildPublishedDocCanvasEmbedUrl({
      workspaceId: 'kgws:test-share-url-public-route',
      canonicalPath: 'workspace/chat/public.md',
    })
    if (!embedUrl || !embedUrl.startsWith('https://airvio.co/agentic-graph/share/')) {
      throw new Error(`expected canvas embed URL to keep the public opaque share route, got ${String(embedUrl || '')}`)
    }
    if (!embedUrl.includes('kgPreview=1')) {
      throw new Error(`expected canvas embed URL to append the embedded preview param, got ${String(embedUrl || '')}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  }
}

export function testPublishedDocCanvasEmbedUrlFromSourceParsesDocRoute() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  try {
    const embedUrl = buildPublishedDocCanvasEmbedUrlFromSource({
      sourceUrl: '/api/storage/doc/kgws:test-share-url-public-route/workspace%2Fchat%2Fpublic.md',
    })
    if (!embedUrl || !embedUrl.startsWith('https://airvio.co/agentic-graph/share/')) {
      throw new Error(`expected canvas embed source URL helper to resolve the public opaque share route, got ${String(embedUrl || '')}`)
    }
    if (!embedUrl.includes('kgPreview=1')) {
      throw new Error(`expected canvas embed source URL helper to append the embedded preview param, got ${String(embedUrl || '')}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  }
}

export async function testSourceFileShareUrlHydratesMetadataOnlyWorkspaceEntryBeforePublish() {
  await __resetAgenticGraphStorageDbForTests()
  try {
    const env = createFakeAgenticGraphStorageWorkerEnv()
    const fetchImpl = createStorageWorkerFetch(env)
    const workspaceId = 'kgws:test-share-url-hydrates-entry'
    const shareUrl = await publishWorkspaceEntryShareUrl({
      workspaceId,
      baseUrl: 'https://example.com',
      fetchImpl,
      readEntryText: entry => entry.path === '/workspace/chat/public.md' ? '# Hydrated Public Share URL' : '',
      entry: {
        path: '/workspace/chat/public.md',
        parentPath: '/workspace/chat',
        kind: 'file',
        name: 'public.md',
        updatedAtMs: 1,
      },
    })
    if (!shareUrl) {
      throw new Error('expected metadata-only workspace entry to resolve text before Share URL publication')
    }
    const docResponse = await readStorageWorker().fetch(
      new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'workspace/chat/public.md')}`),
      env as never,
    )
    if (!docResponse.ok) {
      throw new Error(`expected hydrated Share URL document to be publicly readable, got ${docResponse.status}`)
    }
    const text = await docResponse.text()
    if (text !== '# Hydrated Public Share URL') {
      throw new Error(`expected Share URL publication to store hydrated workspace text, got ${text}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
  }
}

export function testSourceFilesPersistenceBootstrapOwnsAgenticGraphStorageLoopAndQueueIntegration() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(bootstrapPath, 'utf8')
  const settingsText = readFileSync(
    resolve(process.cwd(), 'src', 'features', 'source-files', 'source-files-agentic-graph-storage-settings.ts'),
    'utf8',
  )
  if (!text.includes('createAgenticGraphStorageWorkspaceLifecycle')) {
    throw new Error('expected source-files bootstrap to delegate lazy storage dependency loading to the workspace lifecycle owner')
  }
  if (
    !text.includes('ensureAgenticGraphStorageRuntimeDependencies(capturedOwnership)')
    || !text.includes('runWorkspaceSeedSyncTask(capturedOwnership.signal, () => (')
    || !text.includes('deps.syncSourceFilesToAgenticGraphStorage({')
  ) {
    throw new Error('expected source-files bootstrap to integrate source-file edits with storage outbox enqueueing through the deferred runtime loader and Flight suspension barrier')
  }
  if (!text.includes("const request = resolveSourceFilesPersistenceEffectRequest(next as never)") || !text.includes("applySourceFilesPersistenceEffectRequest(request)")) {
    throw new Error('expected source-files persistence subscription to enqueue storage sync from live source-file edits through the dedicated persistence effect request path')
  }
  if (!text.includes("onPulledChangesApplied")) {
    throw new Error('expected source-files bootstrap to register an inbound pulled-changes apply hook for visible sourceFiles updates')
  }
  if (!text.includes("deps.applyPulledAgenticGraphStorageChangesToSourceFiles")) {
    throw new Error('expected source-files bootstrap to materialize pulled remote storage records into the visible sourceFiles workspace through the deferred storage runtime dependencies')
  }
  if (!text.includes("deps.startAgenticGraphStorageSyncLoop")) {
    throw new Error('expected source-files bootstrap to keep ownership of the agentic-graph storage sync loop for the active workspace through the deferred runtime loader')
  }
  if (
    !text.includes("readAgenticGraphStorageRuntimeSyncEnabled")
    || !settingsText.includes("VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED")
  ) {
    throw new Error('expected agentic-graph storage runtime sync to stay explicitly opt-in instead of running from the toolbar Storage Sync path by default')
  }
  if (!text.includes('if (!readAgenticGraphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) return null')) {
    throw new Error('expected outbound Source Files storage queue requests to require explicit cloud sync opt-in')
  }
  if (!text.includes('if (!readAgenticGraphStorageRuntimeSyncEnabled() || !workspaceCloudSyncEnabled) {') || !text.includes('stopAgenticGraphStorageWorkspaceRuntime()')) {
    throw new Error('expected agentic-graph storage push/pull runtime to stop unless runtime and user cloud sync opt-ins are active')
  }
  if (!text.includes('if (!readAgenticGraphStorageRuntimeSyncEnabled()) return')) {
    throw new Error('expected delayed storage sync callbacks to re-check cloud runtime opt-in before running')
  }
  if (!text.includes("notifyAgenticGraphStorageConflictUx")) {
    throw new Error('expected source-files bootstrap to route storage conflicts through the shared conflict UX notifier')
  }
}
