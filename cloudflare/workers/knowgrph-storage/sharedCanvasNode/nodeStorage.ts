import {
  type NodeDeltaEnvelope,
  type NodeDeltaValidationFailure,
  type SharedCanvasNode,
  type SharedCanvasNodeSide,
  type SharedNodeConfig,
  SHARED_CANVAS_NODE_SCHEMA,
  validateNodeDeltaEnvelope,
} from './nodeDeltaContract'
import {
  SharedNodeCrdtMergeCache,
  serializeSharedNodeDocumentPayload,
  serializeSharedNodeDocumentState,
} from './nodeCrdtMerge'
import { computeSharedCanvasNodeChecksum } from './nodeChecksum'

export type SharedNodeStorageLike = {
  put: (key: string, value: unknown) => Promise<void>
  get?: (key: string) => Promise<unknown>
  delete?: (key: string) => Promise<void | boolean>
  transaction?: <T>(closure: (transaction: SharedNodeStorageLike) => Promise<T>) => Promise<T>
}

export type SharedNodeApplyResult =
  | { ok: true; node: SharedCanvasNode; payload: unknown; seq: number }
  | { ok: false; rejection: NodeDeltaValidationFailure | { code: string; reason: string; fieldPath: string } }

export type SharedNodeStoreOptions = {
  storage: SharedNodeStorageLike
  config: SharedNodeConfig
  nowMs?: () => number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const nodeKey = (workspaceId: string, roomId: string, nodeId: string): string =>
  `txnode:${workspaceId}:${roomId}:${nodeId}`

const deltaKey = (workspaceId: string, roomId: string, nodeId: string, seq: number): string =>
  `txnode-delta:${workspaceId}:${roomId}:${nodeId}#${seq}`

const indexKey = (workspaceId: string, roomId: string, nodeId: string): string =>
  `txnode-index:${workspaceId}:${roomId}:${nodeId}`

const parsePayload = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

const readStoredNode = async (
  storage: SharedNodeStorageLike,
  workspaceId: string,
  roomId: string,
  nodeId: string,
): Promise<SharedCanvasNode | null> => {
  if (typeof storage.get !== 'function') return null
  const value = await storage.get(nodeKey(workspaceId, roomId, nodeId))
  if (!isRecord(value) || value.schema !== SHARED_CANVAS_NODE_SCHEMA) return null
  return value as SharedCanvasNode
}

export class SharedCanvasNodeStore {
  private readonly storage: SharedNodeStorageLike
  private readonly config: SharedNodeConfig
  private readonly documents = new SharedNodeCrdtMergeCache()
  private readonly nowMs: () => number
  private readonly readOnlyNodes = new Set<string>()

  constructor(options: SharedNodeStoreOptions) {
    this.storage = options.storage
    this.config = options.config
    this.nowMs = options.nowMs || (() => Date.now())
  }

  async applyDelta(args: {
    workspaceId: string
    roomId: string
    value: unknown
    resolvedWriterSide: SharedCanvasNodeSide
    onPersist?: (accepted: Extract<SharedNodeApplyResult, { ok: true }>, storage: SharedNodeStorageLike) => Promise<void>
  }): Promise<SharedNodeApplyResult> {
    const validation = validateNodeDeltaEnvelope({
      value: args.value,
      resolvedWriterSide: args.resolvedWriterSide,
      config: this.config,
    })
    if (!validation.ok) {
      return { ok: false, rejection: validation as NodeDeltaValidationFailure }
    }

    const identity = {
      workspaceId: args.workspaceId,
      roomId: args.roomId,
      nodeId: validation.envelope.nodeId,
    }
    const stored = await readStoredNode(this.storage, args.workspaceId, args.roomId, validation.envelope.nodeId)
    const readonlyKey = nodeKey(args.workspaceId, args.roomId, validation.envelope.nodeId)
    if (this.readOnlyNodes.has(readonlyKey)) {
      return { ok: false, rejection: { code: 'node-read-only', reason: 'node failed rehydration checksum verification', fieldPath: 'nodeId' } }
    }
    if (stored?.yjsStateBase64) {
      const entry = this.documents.replace(identity, stored.yjsStateBase64)
      const checksum = await computeSharedCanvasNodeChecksum(entry.doc)
      if (checksum !== stored.nodePayloadChecksum) {
        this.readOnlyNodes.add(readonlyKey)
        return { ok: false, rejection: { code: 'node-rehydration-checksum-mismatch', reason: 'persisted checksum does not match rehydrated payload', fieldPath: 'nodePayloadChecksum' } }
      }
    }

    const beforeEntry = this.documents.get(identity)
    const beforeStateBase64 = serializeSharedNodeDocumentState(beforeEntry.doc)
    const entry = this.documents.applyDelta(identity, validation.envelope.updateBase64)
    if (!entry) {
      this.documents.replace(identity, beforeStateBase64)
      return { ok: false, rejection: { code: 'node-delta-schema-invalid', reason: 'empty Yjs update is not accepted', fieldPath: 'updateBase64' } }
    }
    const payloadText = serializeSharedNodeDocumentPayload(entry.doc)
    if (new TextEncoder().encode(payloadText).byteLength > this.config.maxPayloadBytes) {
      this.documents.replace(identity, beforeStateBase64)
      return {
        ok: false,
        rejection: {
          ok: false,
          code: 'delta-limit-exceeded',
          fieldPath: 'payload',
          reason: 'payload exceeds maxPayloadBytes',
          limitName: 'maxPayloadBytes',
          configuredValue: this.config.maxPayloadBytes,
        },
      }
    }

    const yjsStateBase64 = serializeSharedNodeDocumentState(entry.doc)
    try {
      const payload = parsePayload(payloadText)
      const node = await this.persistNode({
        workspaceId: args.workspaceId,
        roomId: args.roomId,
        envelope: validation.envelope,
        stored,
        yjsStateBase64,
        checksum: await computeSharedCanvasNodeChecksum(entry.doc),
        payload,
        onPersist: args.onPersist,
      })
      return { ok: true, node, payload, seq: node.acceptedSeq }
    } catch (error) {
      this.documents.replace(identity, beforeStateBase64)
      throw error
    }
  }

  async readNode(workspaceId: string, roomId: string, nodeId: string): Promise<SharedCanvasNode | null> {
    return readStoredNode(this.storage, workspaceId, roomId, nodeId)
  }

  private async persistNode(args: {
    workspaceId: string
    roomId: string
    envelope: NodeDeltaEnvelope
    stored: SharedCanvasNode | null
    yjsStateBase64: string
    checksum: string
    payload: unknown
    onPersist?: (accepted: Extract<SharedNodeApplyResult, { ok: true }>, storage: SharedNodeStorageLike) => Promise<void>
  }): Promise<SharedCanvasNode> {
    const acceptedSeq = (args.stored?.acceptedSeq || 0) + 1
    const nowMs = this.nowMs()
    const node: SharedCanvasNode = {
      schema: SHARED_CANVAS_NODE_SCHEMA,
      workspaceId: args.workspaceId,
      roomId: args.roomId,
      nodeId: args.envelope.nodeId,
      transactionId: args.envelope.transactionId,
      scope: args.envelope.expectedScope || args.stored?.scope || 'personal',
      shopperPartyId: args.envelope.writerSide === 'shopper' ? args.envelope.writerSide : args.stored?.shopperPartyId || null,
      merchantPartyId: args.envelope.writerSide === 'merchant' ? args.envelope.writerSide : args.stored?.merchantPartyId || null,
      acceptedSeq,
      yjsStateBase64: args.yjsStateBase64,
      nodePayloadChecksum: args.checksum,
      updatedAtMs: nowMs,
    }
    const persist = async (storage: SharedNodeStorageLike): Promise<void> => {
      await storage.put(deltaKey(args.workspaceId, args.roomId, args.envelope.nodeId, acceptedSeq), {
        ...args.envelope,
        acceptedSeq,
        acceptedAtMs: nowMs,
      })
      await storage.put(nodeKey(args.workspaceId, args.roomId, args.envelope.nodeId), node)
      await storage.put(indexKey(args.workspaceId, args.roomId, args.envelope.nodeId), {
        workspaceId: args.workspaceId,
        roomId: args.roomId,
        nodeId: args.envelope.nodeId,
        transactionId: args.envelope.transactionId,
        scope: node.scope,
        shopperPartyId: node.shopperPartyId,
        merchantPartyId: node.merchantPartyId,
        updatedAtMs: nowMs,
      })
      await this.pruneReplay(storage, args.workspaceId, args.roomId, args.envelope.nodeId, acceptedSeq)
      if (args.onPersist) {
        await args.onPersist({ ok: true, node, payload: args.payload, seq: acceptedSeq }, storage)
      }
    }
    if (args.onPersist && typeof this.storage.transaction !== 'function') {
      throw new Error('shared-node-atomic-persistence-unavailable')
    }
    if (typeof this.storage.transaction === 'function') await this.storage.transaction(persist)
    else await persist(this.storage)
    return node
  }

  private async pruneReplay(storage: SharedNodeStorageLike, workspaceId: string, roomId: string, nodeId: string, acceptedSeq: number): Promise<void> {
    if (typeof storage.delete !== 'function' || this.config.replayLogMaxEntries <= 0) return
    const oldestRetainedSeq = acceptedSeq - this.config.replayLogMaxEntries
    if (oldestRetainedSeq > 0) await storage.delete(deltaKey(workspaceId, roomId, nodeId, oldestRetainedSeq))
  }
}
