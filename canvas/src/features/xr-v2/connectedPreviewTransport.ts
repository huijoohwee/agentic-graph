import {
  inspectP2PCollaborationExtensionTransport,
  P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS,
  publishP2PCollaborationExtension,
  registerP2PCollaborationExtension,
  type P2PCollaborationExtensionEvent,
  type P2PCollaborationExtensionPublishResult,
} from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import type { P2PCollaborationExtensionPayload } from '@/features/collaboration/p2pCollaborationProtocol'

export const XR_V2_CONNECTED_PREVIEW_SCHEMA = 'knowgrph-xr-connected-preview/v1' as const
export const XR_V2_CONNECTED_PREVIEW_NAMESPACE = 'knowgrph.xr.preview/v1'
export const XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS = 250
export const XR_V2_CONNECTED_PREVIEW_MAX_PAYLOAD_BYTES = 16 * 1024
export const XR_V2_CONNECTED_PREVIEW_MAX_QUEUED_EDITS = 32

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type XrV2ConnectedPreviewEdit = Readonly<{ [key: string]: JsonValue }>

type EditPayload = P2PCollaborationExtensionPayload & {
  schema: typeof XR_V2_CONNECTED_PREVIEW_SCHEMA
  kind: 'edit'
  streamId: string
  messageId: string
  baseRevision: number
  revision: number
  authorSentAtMs: number
  edit: XrV2ConnectedPreviewEdit
}

type AckPayload = P2PCollaborationExtensionPayload & {
  schema: typeof XR_V2_CONNECTED_PREVIEW_SCHEMA
  kind: 'applied-ack'
  streamId: string
  messageId: string
  revision: number
  authorSentAtMs: number
}

type PreviewPayload = EditPayload | AckPayload

export type XrV2PreviewExtensionPort = Readonly<{
  register: (handler: (event: P2PCollaborationExtensionEvent<P2PCollaborationExtensionPayload>) => void) => () => void
  publish: (payload: P2PCollaborationExtensionPayload) => P2PCollaborationExtensionPublishResult
  connectedPeerCount: () => number
}>

export type XrV2ConnectedPreviewTransport = Readonly<{
  submitEdit(edit: XrV2ConnectedPreviewEdit): Promise<Readonly<{
    status: 'acknowledged' | 'not-connected' | 'rejected' | 'timeout'
    revision: number
    latencyMs: number | null
    withinCeiling: boolean
  }>>
  snapshot(): Readonly<{ revision: number; connectedPeerCount: number }>
  dispose(): void
}>

const STREAM_ID = /^[a-z][a-z0-9.-]{0,63}$/
const MESSAGE_ID = /^[a-z0-9_-]{8,96}$/

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort().join(',')
  return actual === [...expected].sort().join(',')
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value || typeof value !== 'object' || depth > 8) return false
  if (Array.isArray(value)) return value.length <= 512 && value.every(item => isJsonValue(item, depth + 1))
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.entries(value as Record<string, unknown>).length <= 256
    && Object.entries(value as Record<string, unknown>).every(([key, entry]) => (
      key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
      && key.length > 0 && key.length <= 128 && isJsonValue(entry, depth + 1)
    ))
}

function isPayload(value: P2PCollaborationExtensionPayload): value is PreviewPayload {
  if (value.schema !== XR_V2_CONNECTED_PREVIEW_SCHEMA
    || (value.kind !== 'edit' && value.kind !== 'applied-ack')
    || typeof value.streamId !== 'string' || !STREAM_ID.test(value.streamId)
    || typeof value.messageId !== 'string' || !MESSAGE_ID.test(value.messageId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || !Number.isFinite(value.authorSentAtMs) || Number(value.authorSentAtMs) < 0) return false
  if (value.kind === 'applied-ack') {
    return exactKeys(value, ['schema', 'kind', 'streamId', 'messageId', 'revision', 'authorSentAtMs'])
  }
  return exactKeys(value, [
    'schema', 'kind', 'streamId', 'messageId', 'baseRevision', 'revision', 'authorSentAtMs', 'edit',
  ]) && Number.isSafeInteger(value.baseRevision) && Number(value.baseRevision) >= 0
    && Number(value.revision) === Number(value.baseRevision) + 1
    && isJsonValue(value.edit)
}

function defaultPort(): XrV2PreviewExtensionPort {
  return Object.freeze({
    register: handler => registerP2PCollaborationExtension(XR_V2_CONNECTED_PREVIEW_NAMESPACE, {
      validatePayload: isPayload,
      onEvent: handler,
    }),
    publish: payload => publishP2PCollaborationExtension(XR_V2_CONNECTED_PREVIEW_NAMESPACE, payload),
    connectedPeerCount: () => inspectP2PCollaborationExtensionTransport().connectedPeerCount,
  })
}

function payloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function messageId(): string {
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
  if (uuid) return `xr_${uuid}`
  return `xr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
}

function cloneEdit(edit: XrV2ConnectedPreviewEdit): XrV2ConnectedPreviewEdit {
  return JSON.parse(JSON.stringify(edit)) as XrV2ConnectedPreviewEdit
}

export function createXrV2ConnectedPreviewTransport(options: Readonly<{
  role: 'author' | 'viewer'
  streamId: string
  onViewerEdit?: (edit: XrV2ConnectedPreviewEdit, revision: number) => void | Promise<void>
  latencyCeilingMs?: number
  now?: () => number
  port?: XrV2PreviewExtensionPort
}>): XrV2ConnectedPreviewTransport {
  if (!STREAM_ID.test(options.streamId)) throw new Error('Invalid XR preview stream id')
  if (options.role === 'viewer' && typeof options.onViewerEdit !== 'function') {
    throw new Error('Connected XR viewer requires an edit application callback')
  }
  const ceiling = options.latencyCeilingMs ?? XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS
  if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 5_000) throw new Error('Invalid XR preview latency ceiling')
  const now = options.now ?? (() => performance.now())
  const port = options.port ?? defaultPort()
  let revision = 0
  let disposed = false
  let desynchronized = false
  type PublishResult = Awaited<ReturnType<XrV2ConnectedPreviewTransport['submitEdit']>>
  type QueuedEdit = Readonly<{
    edit: XrV2ConnectedPreviewEdit
    queuedAtMs: number
    resolve: (result: PublishResult) => void
  }>
  let inFlight: null | {
    id: string
    expectedRevision: number
    authorSentAtMs: number
    resolve: (result: PublishResult) => void
    timeout: ReturnType<typeof setTimeout>
  } = null
  const queue: QueuedEdit[] = []
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const viewerAckTimers = new Set<ReturnType<typeof setTimeout>>()

  const clearRetryTimer = () => {
    if (retryTimer === null) return
    clearTimeout(retryTimer)
    retryTimer = null
  }

  const clearViewerAckTimers = () => {
    for (const timer of viewerAckTimers) clearTimeout(timer)
    viewerAckTimers.clear()
  }

  const rejectQueue = (status: 'not-connected' | 'rejected') => {
    for (const queued of queue.splice(0)) {
      queued.resolve({ status, revision, latencyMs: null, withinCeiling: false })
    }
  }

  const pumpAuthorQueue = () => {
    if (disposed || desynchronized || options.role !== 'author' || inFlight
      || retryTimer !== null || queue.length === 0) return
    const connectedPeerCount = port.connectedPeerCount()
    if (connectedPeerCount !== 1) {
      rejectQueue(connectedPeerCount < 1 ? 'not-connected' : 'rejected')
      return
    }
    const queued = queue.shift()!
    const remainingMs = ceiling - Math.max(0, now() - queued.queuedAtMs)
    if (remainingMs <= 0) {
      queued.resolve({ status: 'timeout', revision, latencyMs: null, withinCeiling: false })
      queueMicrotask(pumpAuthorQueue)
      return
    }
    const nextRevision = revision + 1
    const id = messageId()
    const sentAt = queued.queuedAtMs
    const payload: EditPayload = {
      schema: XR_V2_CONNECTED_PREVIEW_SCHEMA,
      kind: 'edit',
      streamId: options.streamId,
      messageId: id,
      baseRevision: revision,
      revision: nextRevision,
      authorSentAtMs: sentAt,
      edit: queued.edit,
    }
    if (payloadBytes(payload) > XR_V2_CONNECTED_PREVIEW_MAX_PAYLOAD_BYTES) {
      queued.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
      queueMicrotask(pumpAuthorQueue)
      return
    }
    const published = port.publish(payload)
    if (published.status !== 'sent' || published.deliveredPeerCount < 1) {
      if ((published.status === 'throttled' || published.status === 'backpressure')
        && remainingMs > 1) {
        queue.unshift(queued)
        retryTimer = setTimeout(() => {
          retryTimer = null
          pumpAuthorQueue()
        }, Math.min(Math.ceil(remainingMs), Math.ceil(P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS)))
        return
      }
      queued.resolve({
        status: published.status === 'not-connected' ? 'not-connected' : 'rejected',
        revision,
        latencyMs: null,
        withinCeiling: false,
      })
      rejectQueue(published.status === 'not-connected' ? 'not-connected' : 'rejected')
      return
    }
    const timeout = setTimeout(() => {
      if (!inFlight || inFlight.id !== id) return
      const timedOut = inFlight
      inFlight = null
      desynchronized = true
      timedOut.resolve({ status: 'timeout', revision, latencyMs: null, withinCeiling: false })
      // The peer may have applied the timed-out revision. Stop the queue until
      // an explicit transport recreation re-establishes a shared base.
      rejectQueue('rejected')
    }, remainingMs)
    inFlight = { id, expectedRevision: nextRevision, authorSentAtMs: sentAt, resolve: queued.resolve, timeout }
  }

  const unregister = port.register(event => {
    if (disposed) return
    if (event.kind !== 'message') {
      revision = 0
      desynchronized = true
      clearRetryTimer()
      clearViewerAckTimers()
      if (inFlight) {
        clearTimeout(inFlight.timeout)
        inFlight.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
        inFlight = null
      }
      rejectQueue('rejected')
      return
    }
    if (!isPayload(event.payload) || event.payload.streamId !== options.streamId) return
    if (event.payload.kind === 'applied-ack' && options.role === 'author') {
      const wait = inFlight
      if (!wait || event.payload.messageId !== wait.id
        || event.payload.revision !== wait.expectedRevision
        || event.payload.authorSentAtMs !== wait.authorSentAtMs) return
      inFlight = null
      clearTimeout(wait.timeout)
      revision = wait.expectedRevision
      const latencyMs = Math.max(0, now() - wait.authorSentAtMs)
      wait.resolve({ status: 'acknowledged', revision, latencyMs, withinCeiling: latencyMs <= ceiling })
      queueMicrotask(pumpAuthorQueue)
      return
    }
    if (event.payload.kind !== 'edit' || options.role !== 'viewer'
      || event.payload.baseRevision !== revision) return
    const payload = event.payload
    void Promise.resolve(options.onViewerEdit?.(payload.edit, payload.revision)).then(() => {
      if (disposed) return
      revision = payload.revision
      const ack: AckPayload = {
        schema: XR_V2_CONNECTED_PREVIEW_SCHEMA,
        kind: 'applied-ack',
        streamId: options.streamId,
        messageId: payload.messageId,
        revision,
        authorSentAtMs: payload.authorSentAtMs,
      }
      const publishAck = () => {
        if (disposed) return
        const result = port.publish(ack)
        if ((result.status !== 'throttled' && result.status !== 'backpressure')
          || now() - ack.authorSentAtMs >= ceiling || port.connectedPeerCount() !== 1) return
        const timer = setTimeout(() => {
          viewerAckTimers.delete(timer)
          publishAck()
        }, Math.ceil(P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS))
        viewerAckTimers.add(timer)
      }
      publishAck()
    }).catch(() => undefined)
  })

  return Object.freeze({
    submitEdit: edit => {
      if (disposed || desynchronized || options.role !== 'author' || !isJsonValue(edit)) {
        return Promise.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
      }
      const connectedPeerCount = port.connectedPeerCount()
      if (connectedPeerCount !== 1) {
        return Promise.resolve({
          status: connectedPeerCount < 1 ? 'not-connected' : 'rejected',
          revision, latencyMs: null, withinCeiling: false,
        })
      }
      if (payloadBytes(edit) > XR_V2_CONNECTED_PREVIEW_MAX_PAYLOAD_BYTES) {
        return Promise.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
      }
      if (queue.length + (inFlight ? 1 : 0) >= XR_V2_CONNECTED_PREVIEW_MAX_QUEUED_EDITS) {
        return Promise.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
      }
      return new Promise(resolve => {
        queue.push({ edit: cloneEdit(edit), queuedAtMs: now(), resolve })
        pumpAuthorQueue()
      })
    },
    snapshot: () => Object.freeze({ revision, connectedPeerCount: port.connectedPeerCount() }),
    dispose: () => {
      if (disposed) return
      disposed = true
      unregister()
      clearRetryTimer()
      clearViewerAckTimers()
      if (inFlight) {
        clearTimeout(inFlight.timeout)
        inFlight.resolve({ status: 'rejected', revision, latencyMs: null, withinCeiling: false })
        inFlight = null
      }
      rejectQueue('rejected')
    },
  })
}
