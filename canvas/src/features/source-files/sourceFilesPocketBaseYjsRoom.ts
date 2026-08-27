import { readEnvString } from '@/lib/config.env'
import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  buildAgenticGraphCollaborationSavePath,
  type AgenticGraphCollaborationSaveRequest,
  type AgenticGraphCollaborationSaveResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  applySourceTextToCollaborationYDoc,
  applyYjsUpdateBase64,
  canEditRawJsonForCollaboration,
  createCollaborationYDoc,
  encodeCollaborationYDocStateBase64,
  encodeYjsUpdateBase64,
  resolveCollaborationDocumentKind,
  serializeCollaborationYDoc,
  type CollaborationDocumentKind,
} from 'grph-shared/collaboration/yjsSnapshot'
import { resolveDocumentRepositoryAuthority } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  acknowledgeAgenticGraphCollaborationUpdate,
  enqueueAgenticGraphCollaborationUpdate,
  listAgenticGraphCollaborationUpdates,
  markAgenticGraphCollaborationUpdateAttempt,
} from '@/lib/storage/agenticgraphStorageDb'
import type { IndexedCollaborationUpdateRecord } from '@/lib/storage/indexedDbCollectionStore'
import {
  requireAgenticGraphCollaborationSaveSessionToken,
} from '@/lib/storage/agenticgraphStorageChatClient'

type PocketBaseRecord = Record<string, unknown> & { id?: string }

type PocketBaseRealtimeEvent = {
  action?: string
  record?: PocketBaseRecord
}

type PocketBaseListResult = {
  items?: PocketBaseRecord[]
}

type PocketBaseRecordServiceLike = {
  getList: (page: number, perPage: number, options?: Record<string, unknown>) => Promise<PocketBaseListResult>
  create: (body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<PocketBaseRecord>
  update: (id: string, body: Record<string, unknown>, options?: Record<string, unknown>) => Promise<PocketBaseRecord>
  delete?: (id: string, options?: Record<string, unknown>) => Promise<boolean> | Promise<void> | boolean | void
  subscribe: (
    topic: string,
    callback: (event: PocketBaseRealtimeEvent) => void,
    options?: Record<string, unknown>
  ) => Promise<() => void> | (() => void)
  unsubscribe?: (topic?: string) => Promise<void> | void
}

export type PocketBaseLike = {
  authStore?: {
    isValid?: boolean
    token?: string
    model?: unknown
  }
  collection: (name: string) => PocketBaseRecordServiceLike
}

export type AgenticGraphPocketBaseYjsRoomPeer = {
  peerId: string
  displayName: string
  caretLine: number | null
  lastSeenAtMs: number
}

export type AgenticGraphPocketBaseYjsRoomSnapshot = {
  workspaceId: string
  documentKey: string
  documentKind: CollaborationDocumentKind
  activePeerCount: number
  serializedText: string
  yjsStateBase64: string
  rawJsonEditable: boolean
  roomId: string
}

export type AgenticGraphPocketBaseYjsRoomHandle = {
  applyLocalText: (text: string) => boolean
  updateLocalAwareness: (patch: { caretLine?: number | null }) => Promise<void>
  saveSnapshot: (args?: { saveBoundary?: 'explicit' | 'autosave'; text?: string | null }) => Promise<AgenticGraphCollaborationSaveResponse | null>
  readSnapshot: () => AgenticGraphPocketBaseYjsRoomSnapshot
  disconnect: () => Promise<void>
}

export type AgenticGraphPocketBaseYjsRoomOptions = {
  workspaceId: string
  documentKey: string
  documentKind?: CollaborationDocumentKind | null
  initialText: string
  peerId: string
  displayName: string
  pocketBaseUrl?: string | null
  saveBridgeUrl?: string | null
  storageBaseUrl?: string | null
  sessionToken?: string | null
  client?: PocketBaseLike | null
  fetchImpl?: typeof fetch
  onRemoteText?: (text: string) => void
  onPresenceChange?: (peers: AgenticGraphPocketBaseYjsRoomPeer[]) => void
}

export type AgenticGraphCollaborationConfig = {
  enabled: boolean
  pocketBaseUrl: string
  saveBridgeUrl: string
}

const COLLECTIONS = {
  rooms: 'collab_rooms',
  updates: 'collab_updates',
  awareness: 'collab_awareness',
} as const

const LOCAL_ORIGIN = 'agenticgraph:pocketbase-yjs:local'
const REMOTE_ORIGIN = 'agenticgraph:pocketbase-yjs:remote'
const SNAPSHOT_ORIGIN = 'agenticgraph:pocketbase-yjs:snapshot'
const AWARENESS_HEARTBEAT_MS = 30_000
export const AGENTICGRAPH_COLLABORATION_AWARENESS_STALE_MS = 2 * 60_000

const normalizeString = (value: unknown): string => String(value || '').trim()

const readEnvBoolean = (name: string, fallback: boolean): boolean => {
  const raw = normalizeString(readEnvString(name, fallback ? 'true' : 'false')).toLowerCase()
  if (!raw) return fallback
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

export const readAgenticGraphCollaborationConfig = (): AgenticGraphCollaborationConfig => {
  const pocketBaseUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_COLLAB_POCKETBASE_URL', ''))
  const storageBaseUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', ''))
  const explicitSaveBridgeUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_COLLAB_SAVE_BRIDGE_URL', ''))
  const saveBridgeUrl = explicitSaveBridgeUrl || buildAbsoluteSaveBridgeUrl({
    storageBaseUrl,
    explicitUrl: '',
  })
  return {
    enabled: readEnvBoolean('VITE_AGENTICGRAPH_COLLAB_ENABLED', !!pocketBaseUrl),
    pocketBaseUrl,
    saveBridgeUrl,
  }
}

const quotePocketBaseFilterValue = (value: string): string => JSON.stringify(String(value || ''))

const roomFilter = (workspaceId: string, documentKey: string): string =>
  `workspaceId = ${quotePocketBaseFilterValue(workspaceId)} && documentKey = ${quotePocketBaseFilterValue(documentKey)}`

const roomScopedFilter = (roomId: string): string =>
  `roomId = ${quotePocketBaseFilterValue(roomId)}`

const readRecordString = (record: PocketBaseRecord | null | undefined, key: string): string =>
  normalizeString(record?.[key])

const readRecordNumber = (record: PocketBaseRecord | null | undefined, key: string): number => {
  const value = Number(record?.[key])
  return Number.isFinite(value) ? value : 0
}

const nowMs = (): number => Date.now()

const isFreshAwarenessPeer = (lastSeenAtMs: number, currentMs: number): boolean =>
  lastSeenAtMs > 0 && currentMs - lastSeenAtMs <= AGENTICGRAPH_COLLABORATION_AWARENESS_STALE_MS

const loadPocketBaseClient = async (url: string): Promise<PocketBaseLike> => {
  const mod = await import('pocketbase')
  const PocketBase = mod.default
  return new PocketBase(url) as PocketBaseLike
}

export const buildAbsoluteSaveBridgeUrl = (args: {
  storageBaseUrl?: string | null
  explicitUrl?: string | null
}): string => {
  const explicitUrl = normalizeString(args.explicitUrl)
  if (explicitUrl) return explicitUrl
  const path = buildAgenticGraphCollaborationSavePath()
  const storageBaseUrl = normalizeString(args.storageBaseUrl)
  if (!storageBaseUrl) return path
  return new URL(path, storageBaseUrl.endsWith('/') ? storageBaseUrl : `${storageBaseUrl}/`).toString()
}

const ensureCollaborationRoom = async (args: {
  client: PocketBaseLike
  workspaceId: string
  documentKey: string
  documentKind: CollaborationDocumentKind
  peerId: string
}): Promise<PocketBaseRecord> => {
  const service = args.client.collection(COLLECTIONS.rooms)
  const filter = roomFilter(args.workspaceId, args.documentKey)
  const existing = await service.getList(1, 1, { filter })
  const found = Array.isArray(existing.items) ? existing.items[0] : null
  if (found?.id) return found
  return service.create({
    workspaceId: args.workspaceId,
    documentKey: args.documentKey,
    documentKind: args.documentKind,
    createdByPeerId: args.peerId,
    yjsStateBase64: '',
    savedAtMs: null,
    updatedAtMs: nowMs(),
  })
}

const readAwarenessPeerRecords = async (args: {
  client: PocketBaseLike
  roomId: string
}): Promise<Array<AgenticGraphPocketBaseYjsRoomPeer & { recordId: string }>> => {
  const service = args.client.collection(COLLECTIONS.awareness)
  const result = await service.getList(1, 100, { filter: roomScopedFilter(args.roomId), sort: 'displayName' })
  const currentMs = nowMs()
  return (Array.isArray(result.items) ? result.items : [])
    .map(record => ({
      recordId: readRecordString(record, 'id'),
      peerId: readRecordString(record, 'peerId'),
      displayName: readRecordString(record, 'displayName') || 'Collaborator',
      caretLine: readRecordNumber(record, 'caretLine') > 0 ? readRecordNumber(record, 'caretLine') : null,
      lastSeenAtMs: readRecordNumber(record, 'lastSeenAtMs'),
    }))
    .filter(peer => !!peer.peerId && isFreshAwarenessPeer(peer.lastSeenAtMs, currentMs))
}

export const createPocketBaseYjsSourceFileRoom = async (
  options: AgenticGraphPocketBaseYjsRoomOptions,
): Promise<AgenticGraphPocketBaseYjsRoomHandle> => {
  const workspaceId = normalizeString(options.workspaceId)
  const documentKey = normalizeString(options.documentKey)
  const peerId = normalizeString(options.peerId)
  if (!workspaceId) throw new Error('workspaceId is required for PocketBase/Yjs collaboration')
  if (!documentKey) throw new Error('documentKey is required for PocketBase/Yjs collaboration')
  if (!peerId) throw new Error('peerId is required for PocketBase/Yjs collaboration')
  const documentKind = options.documentKind || resolveCollaborationDocumentKind(documentKey)
  if (!documentKind) throw new Error('PocketBase/Yjs collaboration only supports Markdown and JSON source files')
  const pocketBaseUrl = normalizeString(options.pocketBaseUrl)
  const client = options.client || await loadPocketBaseClient(pocketBaseUrl)
  const room = await ensureCollaborationRoom({
    client,
    workspaceId,
    documentKey,
    documentKind,
    peerId,
  })
  const roomId = normalizeString(room.id)
  if (!roomId) throw new Error('PocketBase collaboration room did not return an id')

  const doc = createCollaborationYDoc({
    documentKey,
    documentKind,
    initialText: options.initialText,
  })
  const snapshotBase64 = readRecordString(room, 'yjsStateBase64')
  if (snapshotBase64) {
    applyYjsUpdateBase64({ doc, updateBase64: snapshotBase64, origin: SNAPSHOT_ORIGIN })
  }

  const roomService = client.collection(COLLECTIONS.rooms)
  const updateService = client.collection(COLLECTIONS.updates)
  const awarenessService = client.collection(COLLECTIONS.awareness)
  const peersById = new Map<string, AgenticGraphPocketBaseYjsRoomPeer>()
  let localAwarenessRecordId = ''
  let activePeerCount = 1
  let disconnected = false
  let localCaretLine: number | null = null
  let snapshotPersistQueued = false
  let clientSeq = nowMs() * 1_000

  const sendQueuedCollaborationUpdate = async (
    queued: IndexedCollaborationUpdateRecord,
  ): Promise<void> => {
    try {
      await updateService.create({
        updateId: queued.updateId,
        roomId,
        workspaceId,
        documentKey,
        documentKind,
        senderPeerId: peerId,
        clientSeq: queued.clientSeq,
        updateBase64: queued.updateBase64,
        sentAtMs: queued.createdAtMs,
      })
      await acknowledgeAgenticGraphCollaborationUpdate(queued.updateId)
    } catch (error) {
      await markAgenticGraphCollaborationUpdateAttempt(queued.updateId)
      throw error
    }
  }

  const emitPresence = () => {
    const peers = Array.from(peersById.values()).sort((left, right) => left.displayName.localeCompare(right.displayName))
    activePeerCount = Math.max(1, peers.length)
    options.onPresenceChange?.(peers)
  }

  const upsertLocalAwareness = async (patch?: { caretLine?: number | null }) => {
    if (patch && 'caretLine' in patch) localCaretLine = patch.caretLine ?? null
    const body = {
      roomId,
      workspaceId,
      documentKey,
      peerId,
      displayName: normalizeString(options.displayName) || 'Collaborator',
      caretLine: localCaretLine,
      lastSeenAtMs: nowMs(),
    }
    if (localAwarenessRecordId) {
      await awarenessService.update(localAwarenessRecordId, body)
    } else {
      const created = await awarenessService.create(body)
      localAwarenessRecordId = normalizeString(created.id)
    }
    peersById.set(peerId, {
      peerId,
      displayName: body.displayName,
      caretLine: body.caretLine,
      lastSeenAtMs: body.lastSeenAtMs,
    })
    emitPresence()
  }

  const initialPeers = await readAwarenessPeerRecords({ client, roomId })
  for (let i = 0; i < initialPeers.length; i += 1) {
    const peer = initialPeers[i]!
    peersById.set(peer.peerId, peer)
    if (peer.peerId === peerId) localAwarenessRecordId = peer.recordId
  }
  await upsertLocalAwareness()
  const retainedUpdates = await listAgenticGraphCollaborationUpdates(workspaceId, documentKey)
  for (const retainedUpdate of retainedUpdates) {
    if (retainedUpdate.provider !== 'pocketbase') continue
    await sendQueuedCollaborationUpdate(retainedUpdate).catch(() => void 0)
  }
  const awarenessHeartbeat = setInterval(() => {
    if (!disconnected) void upsertLocalAwareness().catch(() => void 0)
  }, AWARENESS_HEARTBEAT_MS)

  const persistRoomSnapshot = async () => {
    if (disconnected) return
    await roomService.update(roomId, {
      yjsStateBase64: encodeCollaborationYDocStateBase64(doc),
      updatedAtMs: nowMs(),
    })
  }

  const queueRoomSnapshotPersist = () => {
    if (snapshotPersistQueued || disconnected) return
    snapshotPersistQueued = true
    const flush = () => {
      snapshotPersistQueued = false
      void persistRoomSnapshot().catch(() => void 0)
    }
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(flush)
      return
    }
    globalThis.setTimeout(flush, 0)
  }

  const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
    if (disconnected || origin === SNAPSHOT_ORIGIN) return
    if (origin === REMOTE_ORIGIN) return
    const updateBase64 = encodeYjsUpdateBase64(update)
    clientSeq += 1
    const createdAtMs = nowMs()
    const queued: IndexedCollaborationUpdateRecord = {
      updateId: `collab:${hashStringToHex([
        workspaceId,
        documentKey,
        peerId,
        clientSeq,
        updateBase64,
      ].join('\u0000'))}`,
      roomId,
      workspaceId,
      documentKey,
      provider: 'pocketbase',
      clientSeq,
      updateBase64,
      attemptCount: 0,
      acknowledgedAtMs: null,
      createdAtMs,
      updatedAtMs: createdAtMs,
    }
    void enqueueAgenticGraphCollaborationUpdate(queued)
      .then(() => {
        queueRoomSnapshotPersist()
        return sendQueuedCollaborationUpdate(queued)
      })
      .catch(() => void 0)
  }
  doc.on('update', docUpdateHandler)

  const unsubscribeUpdates = await updateService.subscribe('*', event => {
    const record = event.record || {}
    if (event.action !== 'create') return
    if (readRecordString(record, 'roomId') !== roomId) return
    if (readRecordString(record, 'senderPeerId') === peerId) return
    const updateBase64 = readRecordString(record, 'updateBase64')
    if (!updateBase64) return
    applyYjsUpdateBase64({ doc, updateBase64, origin: REMOTE_ORIGIN })
    options.onRemoteText?.(serializeCollaborationYDoc({ doc, documentKind }))
  })

  const unsubscribeAwareness = await awarenessService.subscribe('*', event => {
    const record = event.record || {}
    if (readRecordString(record, 'roomId') !== roomId) return
    const eventPeerId = readRecordString(record, 'peerId')
    if (!eventPeerId) return
    if (event.action === 'delete') {
      peersById.delete(eventPeerId)
      emitPresence()
      return
    }
    const lastSeenAtMs = readRecordNumber(record, 'lastSeenAtMs')
    if (!isFreshAwarenessPeer(lastSeenAtMs, nowMs())) {
      peersById.delete(eventPeerId)
      emitPresence()
      return
    }
    peersById.set(eventPeerId, {
      peerId: eventPeerId,
      displayName: readRecordString(record, 'displayName') || 'Collaborator',
      caretLine: readRecordNumber(record, 'caretLine') > 0 ? readRecordNumber(record, 'caretLine') : null,
      lastSeenAtMs,
    })
    emitPresence()
  })

  const readSnapshot = (): AgenticGraphPocketBaseYjsRoomSnapshot => {
    const serializedText = serializeCollaborationYDoc({ doc, documentKind })
    return {
      workspaceId,
      documentKey,
      documentKind,
      activePeerCount,
      serializedText,
      yjsStateBase64: encodeCollaborationYDocStateBase64(doc),
      rawJsonEditable: canEditRawJsonForCollaboration({ documentKind, activePeerCount }),
      roomId,
    }
  }

  return {
    applyLocalText: text => applySourceTextToCollaborationYDoc({
      doc,
      documentKind,
      text,
      origin: LOCAL_ORIGIN,
    }),
    updateLocalAwareness: patch => upsertLocalAwareness(patch),
    saveSnapshot: async args => {
      const canFlushEditorText = documentKind !== 'json' || canEditRawJsonForCollaboration({ documentKind, activePeerCount })
      if (typeof args?.text === 'string' && canFlushEditorText) {
        applySourceTextToCollaborationYDoc({
          doc,
          documentKind,
          text: args.text,
          origin: LOCAL_ORIGIN,
        })
      }
      const snapshot = readSnapshot()
      const authority = resolveDocumentRepositoryAuthority({ documentKey, documentKind })
      if (!authority) throw new Error('Collaboration save is read-only for this document source.')
      const serializedText = snapshot.serializedText
      const yjsStateBase64 = snapshot.yjsStateBase64
      const sessionToken = requireAgenticGraphCollaborationSaveSessionToken(
        options.sessionToken,
      )
      await roomService.update(roomId, {
        yjsStateBase64,
        savedAtMs: nowMs(),
        updatedAtMs: nowMs(),
      })
      const request: AgenticGraphCollaborationSaveRequest = {
        apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
        operation: 'upsert',
        workspaceId,
        documentKey,
        documentKind,
        repositoryTarget: authority.repositoryTarget,
        serializedText,
        yjsStateBase64,
        activePeerCount,
        pocketBaseRoomId: roomId,
        savedByPeerId: peerId,
        saveBoundary: args?.saveBoundary || 'explicit',
      }
      const fetchImpl = options.fetchImpl || fetch
      if (typeof fetchImpl !== 'function') return null
      const saveUrl = buildAbsoluteSaveBridgeUrl({
        explicitUrl: options.saveBridgeUrl,
        storageBaseUrl: options.storageBaseUrl,
      })
      const response = await fetchImpl(saveUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      const body = await response.json().catch(() => null) as AgenticGraphCollaborationSaveResponse | null
      if (!response.ok || !body || body.ok !== true) {
        const message = body && 'error' in body ? String(body.error || '') : `save bridge failed (${response.status})`
        throw new Error(message)
      }
      return body
    },
    readSnapshot,
    disconnect: async () => {
      disconnected = true
      clearInterval(awarenessHeartbeat)
      doc.off('update', docUpdateHandler)
      doc.destroy()
      try {
        await unsubscribeUpdates()
      } catch {
        void 0
      }
      try {
        await unsubscribeAwareness()
      } catch {
        void 0
      }
      if (localAwarenessRecordId && typeof awarenessService.delete === 'function') {
        try {
          await awarenessService.delete(localAwarenessRecordId)
        } catch {
          void 0
        }
      }
    },
  }
}
