import type { DocumentRepositoryTarget } from 'grph-shared/collaboration/documentRepositoryAuthority'
import {
  FileSyncEngine,
  FileSyncOutbox,
  FileSyncProviderRegistry,
  createPersistedCacheProvider,
  type FileSyncBatchResult,
  type FileSyncEntry,
  type FileSyncProvider,
} from './file-sync'
import {
  KNOWGRPH_GIT_OPERATION_BOUNDS,
  buildKnowgrphGitRemoteTrackingRefName,
  createKnowgrphGitEngine,
  normalizeKnowgrphGitPath,
  type KnowgrphGitIdentity,
  type KnowgrphGitOperationResult,
} from './git'
import {
  buildKnowgrphStorageAbsoluteUrl,
  buildKnowgrphStorageChatAuthHeaders,
  readKnowgrphStorageChatRelayConfig,
  type KnowgrphStorageChatRelayConfig,
} from './knowgrphStorageChatClient'
import { notifyKnowgrphStorageEngineIssue } from './knowgrphStorageConflictUx'
import { getKnowgrphStorageDeviceId } from './knowgrphStorageDeviceIdentity'
import {
  createKnowgrphFileSyncBinaryStore,
  createKnowgrphFileSyncCollection,
  createKnowgrphFileSyncHashComputer,
  createKnowgrphFileSyncLedgerStore,
  createKnowgrphFileSyncOutboxStore,
  createKnowgrphGitPersistedCache,
} from './knowgrphStorageEngineAdapters'
import {
  KNOWGRPH_FILE_SYNC_INVOCATION_PREFIX,
  KNOWGRPH_STORAGE_GIT_INVOCATION_PREFIX,
  normalizeKnowgrphFileSyncControlInput,
  normalizeKnowgrphGitControlInput,
} from './knowgrphStorageEngineMcpContract.mjs'
import {
  getKnowgrphStorageEnginePersistence,
  type KnowgrphStorageEnginePersistence,
} from './knowgrphStorageEnginePersistence'
import { createKnowgrphStorageFileSyncRelayProvider } from './knowgrphStorageFileSyncRelay'
import {
  collectScopedDocuments,
  createSaveBridgeDocumentAuthority,
  repositoryIdForScope,
} from './knowgrphStorageGitDocumentAuthority'
import { createKnowgrphStorageGitRelay } from './knowgrphStorageGitRelay'
import { getKnowgrphStoragePersistenceState } from './knowgrphStorageDb'
import {
  buildKnowgrphStorageFileSyncRelayPath,
  buildKnowgrphStorageRelayCapabilitiesPath,
} from './knowgrphStorageRoutePaths'
import { readWorkspaceCloudSyncEnabledSetting } from '@/lib/workspace/workspaceStoreSyncSettings'

const REPOSITORY_TARGETS: readonly DocumentRepositoryTarget[] = [
  'knowgrph-docs',
  'workspace-docs',
]
const registeredFileSyncProviderIds = new Set<string>()

type RelayCapabilityState = {
  status: 'unconfigured' | 'ready' | 'unavailable'
  relayEnabled: boolean
  gitRemotes: Array<{ remoteId: string; branch: string; fetchPolicy: string }>
  fileProviders: Array<{
    providerId: string
    label: string
    providerType: string
    credentialMode: string
  }>
  fileSigningReady: boolean
}

type GitControl = {
  operation: 'clone' | 'fetch' | 'commit' | 'push'
  remoteId: string
  canonicalPathScope: string
  baseRef: string
  message?: string
}

type FileSyncControl = {
  direction: 'pull' | 'push'
  providerId: string
  prefix: string
}

type RuntimeContext = {
  persistence: KnowgrphStorageEnginePersistence
  workspaceId: string
  baseUrl: string
  sessionToken: string
}

const formatGitTimezone = (date = new Date()): string => {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`
}

const buildGitIdentity = (): KnowgrphGitIdentity => ({
  name: 'Knowgrph Browser',
  email: 'browser@knowgrph.local',
  timestampSeconds: Math.floor(Date.now() / 1_000),
  timezone: formatGitTimezone(),
})

const readRuntime = (): 'local' | 'dev' | 'production' => {
  if (typeof window === 'undefined') return 'local'
  const hostname = String(window.location?.hostname || '').toLowerCase()
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return 'local'
  try {
    if (import.meta.env.DEV) return 'dev'
  } catch {
    void 0
  }
  return 'production'
}

const safePersistenceState = (state: { mode: string; status: string }) => ({
  mode: state.mode,
  status: state.status,
})

const readCapabilityText = (value: unknown): string =>
  typeof value === 'string' && value.length <= 256 ? value : ''

const readRelayCapabilities = async (
  relay: KnowgrphStorageChatRelayConfig | null,
): Promise<RelayCapabilityState> => {
  const empty = {
    relayEnabled: false,
    gitRemotes: [],
    fileProviders: [],
    fileSigningReady: false,
  }
  if (!relay) return { status: 'unconfigured', ...empty }
  const url = buildKnowgrphStorageAbsoluteUrl(
    relay.baseUrl,
    buildKnowgrphStorageRelayCapabilitiesPath(),
  )
  if (!url) return { status: 'unavailable', ...empty }
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildKnowgrphStorageChatAuthHeaders(relay.sessionToken),
    })
    if (!response.ok) return { status: 'unavailable', ...empty }
    const body = await response.json() as Record<string, unknown>
    if (body.schema !== 'knowgrph-storage-relay-capabilities/v1') {
      return { status: 'unavailable', ...empty }
    }
    const gitRemotes = Array.isArray(body.gitRemotes)
      ? body.gitRemotes.flatMap(value => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return []
          const record = value as Record<string, unknown>
          const remoteId = readCapabilityText(record.remoteId)
          const branch = readCapabilityText(record.branch)
          const fetchPolicy = readCapabilityText(record.fetchPolicy)
          return remoteId && branch && fetchPolicy ? [{ remoteId, branch, fetchPolicy }] : []
        })
      : []
    const fileProviders = Array.isArray(body.fileProviders)
      ? body.fileProviders.flatMap(value => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return []
          const record = value as Record<string, unknown>
          const providerId = readCapabilityText(record.providerId)
          const label = readCapabilityText(record.label)
          const providerType = readCapabilityText(record.providerType)
          const credentialMode = readCapabilityText(record.credentialMode)
          return providerId && providerType && credentialMode
            ? [{ providerId, label, providerType, credentialMode }]
            : []
        })
      : []
    return {
      status: 'ready',
      relayEnabled: body.relayEnabled === true,
      gitRemotes,
      fileProviders,
      fileSigningReady: body.fileSigningReady === true,
    }
  } catch {
    return { status: 'unavailable', ...empty }
  }
}

const assertRuntimePersistenceActive = async (
  context: Pick<RuntimeContext, 'persistence'>,
): Promise<void> => {
  const before = context.persistence.persistence.getState()
  if (before.mode !== 'indexeddb' || before.status !== 'active') {
    throw new Error('persistence-unavailable')
  }
  const primary = await getKnowgrphStoragePersistenceState()
  const after = context.persistence.persistence.getState()
  if (
    primary.mode !== 'indexeddb'
    || primary.status !== 'active'
    || after.mode !== 'indexeddb'
    || after.status !== 'active'
  ) {
    throw new Error('persistence-unavailable')
  }
}

const createPersistenceGuardedFetch = (
  context: RuntimeContext,
): typeof fetch => async (input, init) => {
  await assertRuntimePersistenceActive(context)
  return globalThis.fetch(input, init)
}

const readRuntimeContext = async (): Promise<RuntimeContext> => {
  const relay = readKnowgrphStorageChatRelayConfig()
  if (!relay) throw new Error('relay-unconfigured')
  const url = new URL(relay.baseUrl)
  const hostname = url.hostname.toLowerCase()
  const loopbackHostnames = ['localhost', '127.0.0.1', '0.0.0.0']
  const browserHostname = typeof window === 'undefined'
    ? 'localhost'
    : String(window.location?.hostname || '').toLowerCase()
  if (
    !['http:', 'https:'].includes(url.protocol)
    || Boolean(url.username || url.password)
    || !loopbackHostnames.includes(hostname)
    || !loopbackHostnames.includes(browserHostname)
    || readRuntime() === 'production'
  ) {
    throw new Error('runtime-forbidden')
  }
  const persistence = await getKnowgrphStorageEnginePersistence()
  const context = {
    persistence,
    workspaceId: relay.workspaceId,
    baseUrl: relay.baseUrl,
    sessionToken: relay.sessionToken,
  }
  await assertRuntimePersistenceActive(context)
  return context
}

const controlFailure = (
  schema: string,
  status: 'invalid-input' | 'relay-unconfigured' | 'runtime-forbidden' | 'persistence-unavailable' | 'failed',
) => ({ schema, ok: false, status })

const normalizeFailure = (error: unknown): ReturnType<typeof controlFailure>['status'] => {
  const message = error instanceof Error ? error.message : ''
  if (message === 'relay-unconfigured') return 'relay-unconfigured'
  if (message === 'runtime-forbidden') return 'runtime-forbidden'
  if (message === 'persistence-unavailable') return 'persistence-unavailable'
  return 'failed'
}

export const inspectLocalGitRepository = async (): Promise<Record<string, unknown>> => {
  const persistence = await getKnowgrphStorageEnginePersistence()
  const relay = readKnowgrphStorageChatRelayConfig()
  const workspaceId = relay?.workspaceId || null
  const repositories = []
  if (workspaceId) {
    const cache = createKnowgrphGitPersistedCache(persistence)
    for (const repositoryId of REPOSITORY_TARGETS) {
      const repository = await cache.getRepository(workspaceId, repositoryId)
      if (!repository) continue
      const [objects, refs] = await Promise.all([
        cache.listObjects(workspaceId, repositoryId),
        cache.listRefs(workspaceId, repositoryId),
      ])
      repositories.push({
        repositoryId,
        remoteId: repository.remoteId,
        canonicalPathScope: repository.canonicalPathScope,
        headRefName: repository.headRefName,
        objectCount: objects.length,
        refs: refs.map(ref => ({
          refName: ref.refName,
          targetKind: ref.targetKind,
          target: ref.target,
        })),
      })
    }
  }
  const [primaryState, queuedOperations, relayCapabilities] = await Promise.all([
    getKnowgrphStoragePersistenceState(),
    workspaceId ? persistence.outbox.count('git-operation', workspaceId) : Promise.resolve(0),
    readRelayCapabilities(relay),
  ])
  const engineState = persistence.persistence.getState()
  return {
    schema: 'knowgrph-storage-git-inspection/v1',
    ok: true,
    workspaceId,
    relayConfigured: relayCapabilities.status === 'ready'
      && relayCapabilities.relayEnabled
      && relayCapabilities.gitRemotes.length > 0,
    relayCapabilities,
    runtime: readRuntime(),
    persistence: {
      primary: safePersistenceState(primaryState),
      engine: safePersistenceState(engineState),
      mutationsReady: primaryState.mode === 'indexeddb' && primaryState.status === 'active'
        && engineState.mode === 'indexeddb' && engineState.status === 'active',
    },
    repositories,
    queuedOperations,
    bounds: KNOWGRPH_GIT_OPERATION_BOUNDS,
    invocation: KNOWGRPH_STORAGE_GIT_INVOCATION_PREFIX.join(' '),
  }
}

export const controlLocalGitRepository = async (
  rawInput: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const schema = 'knowgrph-storage-git-control/v1'
  let input: GitControl
  try {
    input = normalizeKnowgrphGitControlInput(rawInput) as GitControl
  } catch {
    return controlFailure(schema, 'invalid-input')
  }
  try {
    const context = await readRuntimeContext()
    const canonicalPathScope = normalizeKnowgrphGitPath(input.canonicalPathScope)
    const repositoryId = repositoryIdForScope(canonicalPathScope)
    const cache = createKnowgrphGitPersistedCache(context.persistence)
    const fetcher = createPersistenceGuardedFetch(context)
    const engine = createKnowgrphGitEngine({
      cache,
      authority: createSaveBridgeDocumentAuthority({
        scope: canonicalPathScope,
        repositoryId,
        workspaceId: context.workspaceId,
        remoteId: input.remoteId,
        baseRequestUrl: context.baseUrl,
        sessionToken: context.sessionToken,
        fetcher,
      }),
      relay: createKnowgrphStorageGitRelay({
        baseRequestUrl: context.baseUrl,
        sessionToken: context.sessionToken,
        fetcher,
      }),
      deviceId: getKnowgrphStorageDeviceId(),
      reportIssue: issue => notifyKnowgrphStorageEngineIssue({
        workspaceId: issue.workspaceId,
        operationId: issue.operationId,
        engine: 'git',
        message: issue.message,
      }),
    })
    const request = {
      workspaceId: context.workspaceId,
      repositoryId,
      remoteId: input.remoteId,
      canonicalPathScope,
      refName: input.baseRef,
    }
    const online = readWorkspaceCloudSyncEnabledSetting()
    let queued: KnowgrphGitOperationResult
    if (input.operation === 'clone') queued = await engine.clone(request, 'offline-only')
    else if (input.operation === 'fetch') queued = await engine.fetch(request, 'offline-only')
    else if (input.operation === 'commit') {
      queued = await engine.commit({
        ...request,
        documents: collectScopedDocuments(canonicalPathScope),
        message: String(input.message || ''),
        author: buildGitIdentity(),
      }, 'offline-only')
    } else {
      const trackingRef = await engine.readRef(
        context.workspaceId,
        repositoryId,
        buildKnowgrphGitRemoteTrackingRefName(input.remoteId, input.baseRef),
      )
      queued = await engine.push({
        ...request,
        expectedRemoteObjectId: trackingRef?.targetKind === 'direct' ? trackingRef.target : null,
      }, 'offline-only')
    }
    await assertRuntimePersistenceActive(context)
    const drained = online ? await engine.drain(context.workspaceId) : []
    await assertRuntimePersistenceActive(context)
    const result = drained.find(entry => entry.operationId === queued.operationId) || queued
    return {
      schema,
      ok: result.status === 'complete' || result.status === 'queued',
      status: result.status,
      mode: online ? 'online' : 'offline-only',
      result,
    }
  } catch (error) {
    return controlFailure(schema, normalizeFailure(error))
  }
}

const createRelayProvider = (
  context: RuntimeContext,
  providerId: string,
): FileSyncProvider => {
  const relayUrl = buildKnowgrphStorageAbsoluteUrl(
    context.baseUrl,
    buildKnowgrphStorageFileSyncRelayPath(),
  )
  if (!relayUrl) throw new Error('relay-unconfigured')
  registeredFileSyncProviderIds.add(providerId)
  return createKnowgrphStorageFileSyncRelayProvider({
    workspaceId: context.workspaceId,
    providerId,
    buildRequestUrl: () => relayUrl,
    fetcher: createPersistenceGuardedFetch(context),
    readSessionBearer: () => context.sessionToken,
  })
}

const reportFileSyncIssues = (
  workspaceId: string,
  result: FileSyncBatchResult,
): void => {
  for (const outcome of result.outcomes) {
    if (outcome.status !== 'conflict' && outcome.status !== 'error') continue
    notifyKnowgrphStorageEngineIssue({
      workspaceId,
      operationId: `${result.providerId}:${result.direction}:${outcome.fileKey}:${outcome.status}`,
      engine: 'file-sync',
      message: `File sync retained ${outcome.fileKey}: ${outcome.message || outcome.reason || outcome.status}.`,
    })
  }
}

const readOfflinePullManifest = async (
  persistence: KnowgrphStorageEnginePersistence,
  workspaceId: string,
  providerId: string,
  prefix: string,
): Promise<FileSyncEntry[]> => {
  const records = await persistence.records.list('file-sync:ledger')
  return records
    .filter(record =>
      record.workspaceId === workspaceId
      && record.providerId === providerId
      && record.remote
      && (!prefix || record.fileKey === prefix || String(record.fileKey).startsWith(`${prefix}/`)))
    .map(record => {
      const remote = record.remote as {
        kind: 'file' | 'directory'
        sizeBytes: number
        hashes: Array<{ algorithm: string; value: string }>
        revision: string | null
      }
      return {
        key: String(record.fileKey),
        kind: remote.kind,
        entryType: 'standard' as const,
        sizeBytes: remote.sizeBytes,
        hashes: remote.hashes,
        revision: remote.revision,
        modifiedAtMs: null,
      }
    })
}

export const inspectLocalFileSync = async (): Promise<Record<string, unknown>> => {
  const persistence = await getKnowgrphStorageEnginePersistence()
  const relay = readKnowgrphStorageChatRelayConfig()
  const workspaceId = relay?.workspaceId || null
  const [primaryState, cacheEntries, ledgerEntries, queuedTransfers, relayCapabilities] = await Promise.all([
    getKnowgrphStoragePersistenceState(),
    workspaceId ? persistence.records.list(`file-sync:entry:${workspaceId}`) : Promise.resolve([]),
    workspaceId ? persistence.records.list('file-sync:ledger') : Promise.resolve([]),
    workspaceId ? persistence.outbox.count('file-transfer', workspaceId) : Promise.resolve(0),
    readRelayCapabilities(relay),
  ])
  const engineState = persistence.persistence.getState()
  return {
    schema: 'knowgrph-storage-file-sync-inspection/v1',
    ok: true,
    workspaceId,
    relayConfigured: relayCapabilities.status === 'ready'
      && relayCapabilities.relayEnabled
      && relayCapabilities.fileSigningReady
      && relayCapabilities.fileProviders.length > 0,
    relayCapabilities,
    runtime: readRuntime(),
    persistence: {
      primary: safePersistenceState(primaryState),
      engine: safePersistenceState(engineState),
      mutationsReady: primaryState.mode === 'indexeddb' && primaryState.status === 'active'
        && engineState.mode === 'indexeddb' && engineState.status === 'active',
    },
    providerIds: Array.from(new Set([
      ...registeredFileSyncProviderIds,
      ...relayCapabilities.fileProviders.map(provider => provider.providerId),
    ])).sort(),
    cacheEntryCount: cacheEntries.length,
    ledgerEntryCount: ledgerEntries.filter(entry => entry.workspaceId === workspaceId).length,
    queuedTransfers,
    invocation: KNOWGRPH_FILE_SYNC_INVOCATION_PREFIX.join(' '),
  }
}

export const controlLocalFileSync = async (
  rawInput: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const schema = 'knowgrph-storage-file-sync-control/v1'
  let input: FileSyncControl
  try {
    input = normalizeKnowgrphFileSyncControlInput(rawInput) as FileSyncControl
  } catch {
    return controlFailure(schema, 'invalid-input')
  }
  try {
    const context = await readRuntimeContext()
    const registry = new FileSyncProviderRegistry()
    const outbox = new FileSyncOutbox(
      createKnowgrphFileSyncOutboxStore(context.persistence, context.workspaceId),
    )
    const retainedProviderIds = new Set(
      (await outbox.list()).map(record => record.providerId),
    )
    retainedProviderIds.add(input.providerId)
    for (const providerId of retainedProviderIds) registry.register(createRelayProvider(context, providerId))
    const cacheProvider = createPersistedCacheProvider({
      workspaceId: context.workspaceId,
      collection: createKnowgrphFileSyncCollection(context.persistence),
      binaries: createKnowgrphFileSyncBinaryStore(context.persistence),
      hashComputer: createKnowgrphFileSyncHashComputer(),
    })
    const engine = new FileSyncEngine({
      workspaceId: context.workspaceId,
      cacheProvider,
      providers: registry,
      ledger: createKnowgrphFileSyncLedgerStore(context.persistence),
      outbox,
      runtime: readRuntime,
    })
    const online = readWorkspaceCloudSyncEnabledSetting()
    await assertRuntimePersistenceActive(context)
    const drained = online ? await engine.drainOutbox() : []
    await assertRuntimePersistenceActive(context)
    const offlineManifest = !online && input.direction === 'pull'
      ? await readOfflinePullManifest(
        context.persistence,
        context.workspaceId,
        input.providerId,
        input.prefix,
      )
      : undefined
    const plannedEntries = offlineManifest?.length ? offlineManifest : undefined
    const result = input.direction === 'pull'
      ? await engine.pull(input.providerId, {
          prefix: input.prefix,
          mode: online ? 'online' : 'offline',
          plannedEntries,
        })
      : await engine.push(input.providerId, { prefix: input.prefix, mode: online ? 'online' : 'offline' })
    await assertRuntimePersistenceActive(context)
    reportFileSyncIssues(context.workspaceId, result)
    const hasFailure = result.outcomes.some(outcome =>
      outcome.status === 'error' || outcome.status === 'conflict')
    const queued = result.outcomes.length > 0
      && result.outcomes.every(outcome => outcome.status === 'queued')
    return {
      schema,
      ok: !hasFailure,
      status: hasFailure ? 'partial' : queued ? 'queued' : 'complete',
      mode: online ? 'online' : 'offline-only',
      drained,
      result,
    }
  } catch (error) {
    return controlFailure(schema, normalizeFailure(error))
  }
}
