import {
  isP2PCollaborationExtensionNamespace,
  isP2PCollaborationExtensionPayload,
  P2P_COLLAB_EXTENSION_MAX_PAYLOAD_BYTES,
  P2P_COLLAB_PROTOCOL_VERSION,
  type P2PCollaborationExtensionPayload,
  type P2PCollaborationExtensionWireMessage,
  type P2PCollaborationRole,
  type P2PCollaborationWireMessage,
} from './p2pCollaborationProtocol'
import {
  sharedRuntimeRefs,
  type RuntimeConnectionRef,
  type RuntimeSessionRefs,
} from './p2pCollaborationRuntimeState'

const MAX_EXTENSION_SOURCES_PER_CONNECTION = 64
export const P2P_COLLAB_EXTENSION_MAX_PUBLISH_RATE_HZ = 30
export const P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS = 1000 / P2P_COLLAB_EXTENSION_MAX_PUBLISH_RATE_HZ
export const P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024

export type P2PCollaborationExtensionEvent<TPayload extends P2PCollaborationExtensionPayload> =
  | {
      kind: 'message'
      namespace: string
      sourceId: string
      payload: TPayload
      receivedAt: number
    }
  | {
      kind: 'source-left'
      namespace: string
      sourceId: string
      receivedAt: number
    }
  | {
      kind: 'session-reset'
      namespace: string
      receivedAt: number
    }

export type P2PCollaborationExtensionRegistration<TPayload extends P2PCollaborationExtensionPayload> = {
  validatePayload: (payload: P2PCollaborationExtensionPayload) => boolean
  onEvent: (event: P2PCollaborationExtensionEvent<TPayload>) => void
}

export type P2PCollaborationExtensionPublishResult = {
  status:
    | 'sent'
    | 'not-connected'
    | 'unregistered'
    | 'invalid-namespace'
    | 'invalid-payload'
    | 'payload-too-large'
    | 'throttled'
    | 'backpressure'
  deliveredPeerCount: number
}

export type P2PCollaborationExtensionDeliveryResult = {
  deliveredPeerCount: number
  backpressuredPeerCount: number
}

type StoredRegistration = P2PCollaborationExtensionRegistration<P2PCollaborationExtensionPayload> & {
  token: symbol
}

type ExtensionSourceRecord = {
  localSourceId: string
  wireSourceId: string
  relaySourceId: string
  namespaces: Set<string>
}

const registrations = new Map<string, StoredRegistration>()
const sourcesByConnection = new Map<RuntimeConnectionRef, Map<string, ExtensionSourceRecord>>()
const lastInboundAcceptedAtByConnection = new Map<RuntimeConnectionRef, Map<string, number>>()
const reservedOutboundSourceIds = new Set<string>()
const lastPublishAttemptAtByNamespace = new Map<string, number>()
let localWireSourceId: string | null = null
let opaqueIdSequence = 0

function createOpaqueId(prefix: 'src' | 'remote'): string {
  opaqueIdSequence += 1
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}_${cryptoApi.randomUUID().replace(/-/g, '')}_${opaqueIdSequence.toString(36)}`
  }
  const random = Math.random().toString(36).slice(2, 14)
  return `${prefix}_${Date.now().toString(36)}_${random.padEnd(12, '0')}_${opaqueIdSequence.toString(36)}`
}

function createUniqueOutboundSourceId(): string {
  let sourceId = createOpaqueId('src')
  while (reservedOutboundSourceIds.has(sourceId)) sourceId = createOpaqueId('src')
  reservedOutboundSourceIds.add(sourceId)
  return sourceId
}

function getLocalWireSourceId(): string {
  if (!localWireSourceId) localWireSourceId = createUniqueOutboundSourceId()
  return localWireSourceId
}

function createRelaySourceId(): string {
  return createUniqueOutboundSourceId()
}

function emitExtensionEvent(
  registration: StoredRegistration,
  event: P2PCollaborationExtensionEvent<P2PCollaborationExtensionPayload>,
): boolean {
  try {
    registration.onEvent(event)
    return true
  } catch {
    console.error(`[knowgrph] collaboration extension handler failed: ${event.namespace}`)
    return false
  }
}

function safelyValidatePayload(
  registration: StoredRegistration,
  payload: P2PCollaborationExtensionPayload,
): boolean {
  try {
    return registration.validatePayload(payload) === true
  } catch {
    return false
  }
}

function measurePayloadBytes(payload: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).byteLength
  } catch {
    return null
  }
}

function getOrCreateRemoteSource(
  connectionRef: RuntimeConnectionRef,
  wireSourceId: string,
  allowRelayedSources: boolean,
): ExtensionSourceRecord | null {
  const connectionSources = sourcesByConnection.get(connectionRef) || new Map<string, ExtensionSourceRecord>()
  const existing = connectionSources.get(wireSourceId)
  if (existing) return existing
  if (connectionSources.size >= MAX_EXTENSION_SOURCES_PER_CONNECTION) return null
  if (!allowRelayedSources && connectionSources.size > 0) return null
  const sourceRecord: ExtensionSourceRecord = {
    localSourceId: createOpaqueId('remote'),
    wireSourceId,
    relaySourceId: allowRelayedSources ? wireSourceId : createRelaySourceId(),
    namespaces: new Set<string>(),
  }
  connectionSources.set(wireSourceId, sourceRecord)
  sourcesByConnection.set(connectionRef, connectionSources)
  return sourceRecord
}

function deleteRemoteSource(connectionRef: RuntimeConnectionRef, wireSourceId: string): void {
  const connectionSources = sourcesByConnection.get(connectionRef)
  if (!connectionSources) return
  const sourceRecord = connectionSources.get(wireSourceId)
  connectionSources.delete(wireSourceId)
  if (sourceRecord && sourceRecord.relaySourceId !== sourceRecord.wireSourceId) {
    reservedOutboundSourceIds.delete(sourceRecord.relaySourceId)
  }
  if (connectionSources.size === 0) sourcesByConnection.delete(connectionRef)
}

function acceptInboundNamespaceRate(
  connectionRef: RuntimeConnectionRef,
  namespace: string,
  receivedAt: number,
): boolean {
  const rates = lastInboundAcceptedAtByConnection.get(connectionRef) || new Map<string, number>()
  const lastAcceptedAt = rates.get(namespace)
  if (typeof lastAcceptedAt === 'number'
    && receivedAt - lastAcceptedAt < P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS) return false
  rates.set(namespace, receivedAt)
  lastInboundAcceptedAtByConnection.set(connectionRef, rates)
  return true
}

export function sendP2PCollaborationWireMessage(
  connectionRef: RuntimeConnectionRef | null,
  message: P2PCollaborationWireMessage,
): boolean {
  const channel = connectionRef?.channel
  if (!channel || channel.readyState !== 'open') return false
  try {
    channel.send(JSON.stringify(message))
    return true
  } catch {
    return false
  }
}

export function broadcastP2PCollaborationWireMessageToGuests(
  runtime: RuntimeSessionRefs,
  message: P2PCollaborationWireMessage,
  excludedPeerId?: string | null,
): number {
  let deliveredPeerCount = 0
  for (const [peerId, connectionRef] of runtime.hostConnectionsByPeerId.entries()) {
    if (excludedPeerId && peerId === excludedPeerId) continue
    if (sendP2PCollaborationWireMessage(connectionRef, message)) deliveredPeerCount += 1
  }
  return deliveredPeerCount
}

function sendP2PCollaborationExtensionWireMessage(
  connectionRef: RuntimeConnectionRef | null,
  message: P2PCollaborationExtensionWireMessage,
): 'sent' | 'not-connected' | 'backpressure' {
  const channel = connectionRef?.channel
  if (!channel || channel.readyState !== 'open') return 'not-connected'
  try {
    const serialized = JSON.stringify(message)
    const serializedBytes = new TextEncoder().encode(serialized).byteLength
    const rawBufferedAmount = (channel as RTCDataChannel & { bufferedAmount?: number }).bufferedAmount
    const bufferedAmount = typeof rawBufferedAmount === 'undefined'
      ? 0
      : Number.isFinite(rawBufferedAmount) && rawBufferedAmount >= 0
        ? rawBufferedAmount
        : Number.POSITIVE_INFINITY
    if (message.event === 'message'
      && bufferedAmount + serializedBytes > P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES) {
      return 'backpressure'
    }
    channel.send(serialized)
    return 'sent'
  } catch {
    return 'not-connected'
  }
}

export function broadcastP2PCollaborationExtensionWireMessageToGuests(
  runtime: RuntimeSessionRefs,
  message: P2PCollaborationExtensionWireMessage,
  excludedPeerId?: string | null,
): P2PCollaborationExtensionDeliveryResult {
  let deliveredPeerCount = 0
  let backpressuredPeerCount = 0
  for (const [peerId, connectionRef] of runtime.hostConnectionsByPeerId.entries()) {
    if (excludedPeerId && peerId === excludedPeerId) continue
    const status = sendP2PCollaborationExtensionWireMessage(connectionRef, message)
    if (status === 'sent') deliveredPeerCount += 1
    if (status === 'backpressure') backpressuredPeerCount += 1
  }
  return { deliveredPeerCount, backpressuredPeerCount }
}

export function inspectP2PCollaborationExtensionTransport(): Readonly<{
  active: boolean
  connectedPeerCount: number
}> {
  const runtime = sharedRuntimeRefs.current
  if (!runtime.sessionId || runtime.role === 'idle') return { active: false, connectedPeerCount: 0 }
  if (runtime.role === 'guest') {
    return { active: runtime.guestConnection?.channel?.readyState === 'open', connectedPeerCount: runtime.guestConnection?.channel?.readyState === 'open' ? 1 : 0 }
  }
  const connectedPeerCount = [...runtime.hostConnectionsByPeerId.values()]
    .filter(connectionRef => connectionRef.channel?.readyState === 'open').length
  return { active: connectedPeerCount > 0, connectedPeerCount }
}

function announceLocalExtensionSourceLeft(namespace: string): void {
  const runtime = sharedRuntimeRefs.current
  if (!localWireSourceId || !runtime.sessionId || runtime.role === 'idle') return
  const message: P2PCollaborationExtensionWireMessage = {
    v: P2P_COLLAB_PROTOCOL_VERSION,
    kind: 'extension',
    event: 'source-left',
    sessionId: runtime.sessionId,
    namespace,
    sourceId: localWireSourceId,
    sentAt: Date.now(),
  }
  if (runtime.role === 'guest') sendP2PCollaborationExtensionWireMessage(runtime.guestConnection, message)
  else broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, message)
}

export function registerP2PCollaborationExtension<TPayload extends P2PCollaborationExtensionPayload>(
  namespace: string,
  registration: P2PCollaborationExtensionRegistration<TPayload>,
): () => void {
  if (!isP2PCollaborationExtensionNamespace(namespace)) {
    throw new Error('Invalid collaboration extension namespace')
  }
  if (typeof registration?.validatePayload !== 'function' || typeof registration?.onEvent !== 'function') {
    throw new Error('Incomplete collaboration extension registration')
  }
  if (registrations.has(namespace)) {
    throw new Error(`Collaboration extension already registered: ${namespace}`)
  }
  const token = Symbol(namespace)
  registrations.set(namespace, {
    token,
    validatePayload: registration.validatePayload,
    onEvent: registration.onEvent as StoredRegistration['onEvent'],
  })
  return () => {
    if (registrations.get(namespace)?.token !== token) return
    announceLocalExtensionSourceLeft(namespace)
    registrations.delete(namespace)
    const runtime = sharedRuntimeRefs.current
    for (const [connectionRef, connectionSources] of sourcesByConnection.entries()) {
      for (const [wireSourceId, sourceRecord] of connectionSources.entries()) {
        if (runtime.role === 'host'
          && runtime.sessionId
          && sourceRecord.namespaces.has(namespace)) {
          broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, {
            v: P2P_COLLAB_PROTOCOL_VERSION,
            kind: 'extension',
            event: 'source-left',
            sessionId: runtime.sessionId,
            namespace,
            sourceId: sourceRecord.relaySourceId,
            sentAt: Date.now(),
          }, connectionRef.peerId)
        }
        sourceRecord.namespaces.delete(namespace)
        if (sourceRecord.namespaces.size === 0) deleteRemoteSource(connectionRef, wireSourceId)
      }
    }
  }
}

export function publishP2PCollaborationExtension(
  namespace: string,
  payload: P2PCollaborationExtensionPayload,
): P2PCollaborationExtensionPublishResult {
  if (!isP2PCollaborationExtensionNamespace(namespace)) {
    return { status: 'invalid-namespace', deliveredPeerCount: 0 }
  }
  const registration = registrations.get(namespace)
  if (!registration) return { status: 'unregistered', deliveredPeerCount: 0 }
  const payloadBytes = measurePayloadBytes(payload)
  if (payloadBytes != null && payloadBytes > P2P_COLLAB_EXTENSION_MAX_PAYLOAD_BYTES) {
    return { status: 'payload-too-large', deliveredPeerCount: 0 }
  }
  if (!isP2PCollaborationExtensionPayload(payload) || !safelyValidatePayload(registration, payload)) {
    return { status: 'invalid-payload', deliveredPeerCount: 0 }
  }
  const runtime = sharedRuntimeRefs.current
  if (!runtime.sessionId || runtime.role === 'idle') {
    return { status: 'not-connected', deliveredPeerCount: 0 }
  }
  if (!inspectP2PCollaborationExtensionTransport().active) {
    return { status: 'not-connected', deliveredPeerCount: 0 }
  }
  const publishedAt = Date.now()
  const lastPublishAttemptAt = lastPublishAttemptAtByNamespace.get(namespace)
  if (typeof lastPublishAttemptAt === 'number'
    && publishedAt - lastPublishAttemptAt < P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS) {
    return { status: 'throttled', deliveredPeerCount: 0 }
  }
  lastPublishAttemptAtByNamespace.set(namespace, publishedAt)
  const message: P2PCollaborationExtensionWireMessage = {
    v: P2P_COLLAB_PROTOCOL_VERSION,
    kind: 'extension',
    event: 'message',
    sessionId: runtime.sessionId,
    namespace,
    sourceId: getLocalWireSourceId(),
    payload,
    sentAt: publishedAt,
  }
  const delivery = runtime.role === 'guest'
    ? (() => {
        const status = sendP2PCollaborationExtensionWireMessage(runtime.guestConnection, message)
        return {
          deliveredPeerCount: Number(status === 'sent'),
          backpressuredPeerCount: Number(status === 'backpressure'),
        }
      })()
    : broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, message)
  return {
    status: delivery.backpressuredPeerCount > 0
      ? 'backpressure'
      : delivery.deliveredPeerCount > 0 ? 'sent' : 'not-connected',
    deliveredPeerCount: delivery.deliveredPeerCount,
  }
}

export function handleP2PCollaborationExtensionWireMessage(
  message: P2PCollaborationExtensionWireMessage,
  connectionRef: RuntimeConnectionRef,
  role: P2PCollaborationRole,
): boolean {
  const registration = registrations.get(message.namespace)
  if (!registration) return false
  const allowRelayedSources = role === 'guest' && connectionRef.ownership === 'owner'
  const connectionSources = sourcesByConnection.get(connectionRef)
  const existingSource = connectionSources?.get(message.sourceId) || null
  if (message.event === 'source-left') {
    if (!existingSource?.namespaces.has(message.namespace)) return false
    const accepted = emitExtensionEvent(registration, {
      kind: 'source-left',
      namespace: message.namespace,
      sourceId: existingSource.localSourceId,
      receivedAt: Date.now(),
    })
    existingSource.namespaces.delete(message.namespace)
    if (existingSource.namespaces.size === 0) deleteRemoteSource(connectionRef, message.sourceId)
    return accepted
  }
  if (!message.payload || !safelyValidatePayload(registration, message.payload)) return false
  const receivedAt = Date.now()
  if (!acceptInboundNamespaceRate(connectionRef, message.namespace, receivedAt)) return false
  const sourceRecord = getOrCreateRemoteSource(connectionRef, message.sourceId, allowRelayedSources)
  if (!sourceRecord) return false
  const accepted = emitExtensionEvent(registration, {
    kind: 'message',
    namespace: message.namespace,
    sourceId: sourceRecord.localSourceId,
    payload: message.payload,
    receivedAt,
  })
  const registrationRemainsActive = registrations.get(message.namespace) === registration
  if (accepted && registrationRemainsActive) {
    sourceRecord.namespaces.add(message.namespace)
  } else if (sourceRecord.namespaces.size === 0) {
    deleteRemoteSource(connectionRef, message.sourceId)
  }
  return accepted && registrationRemainsActive
}

function buildP2PCollaborationExtensionRelayMessage(
  message: P2PCollaborationExtensionWireMessage,
  connectionRef: RuntimeConnectionRef,
): P2PCollaborationExtensionWireMessage | null {
  const sourceRecord = sourcesByConnection.get(connectionRef)?.get(message.sourceId)
  if (!sourceRecord?.namespaces.has(message.namespace)) return null
  return { ...message, sourceId: sourceRecord.relaySourceId }
}

export function routeP2PCollaborationExtensionWireMessage(
  message: P2PCollaborationExtensionWireMessage,
  connectionRef: RuntimeConnectionRef,
  role: P2PCollaborationRole,
): Readonly<{ accepted: boolean; relayMessage: P2PCollaborationExtensionWireMessage | null }> {
  const cleanupRelayMessage = role === 'host' && message.event === 'source-left'
    ? buildP2PCollaborationExtensionRelayMessage(message, connectionRef)
    : null
  const accepted = handleP2PCollaborationExtensionWireMessage(message, connectionRef, role)
  if (!accepted || role !== 'host') return { accepted, relayMessage: null }
  return {
    accepted: true,
    relayMessage: cleanupRelayMessage || buildP2PCollaborationExtensionRelayMessage(message, connectionRef),
  }
}

export function releaseP2PCollaborationExtensionConnection(
  connectionRef: RuntimeConnectionRef | null,
  sessionId: string | null,
): P2PCollaborationExtensionWireMessage[] {
  if (!connectionRef) return []
  lastInboundAcceptedAtByConnection.delete(connectionRef)
  const connectionSources = sourcesByConnection.get(connectionRef)
  if (!connectionSources) return []
  const cleanupMessages: P2PCollaborationExtensionWireMessage[] = []
  for (const sourceRecord of connectionSources.values()) {
    for (const namespace of sourceRecord.namespaces) {
      const registration = registrations.get(namespace)
      if (registration) {
        emitExtensionEvent(registration, {
          kind: 'source-left',
          namespace,
          sourceId: sourceRecord.localSourceId,
          receivedAt: Date.now(),
        })
      }
      if (sessionId) {
        cleanupMessages.push({
          v: P2P_COLLAB_PROTOCOL_VERSION,
          kind: 'extension',
          event: 'source-left',
          sessionId,
          namespace,
          sourceId: sourceRecord.relaySourceId,
          sentAt: Date.now(),
        })
      }
    }
    if (sourceRecord.relaySourceId !== sourceRecord.wireSourceId) {
      reservedOutboundSourceIds.delete(sourceRecord.relaySourceId)
    }
  }
  sourcesByConnection.delete(connectionRef)
  return cleanupMessages
}

export function resetP2PCollaborationExtensionSession(): void {
  const receivedAt = Date.now()
  for (const [namespace, registration] of registrations.entries()) {
    emitExtensionEvent(registration, { kind: 'session-reset', namespace, receivedAt })
  }
  sourcesByConnection.clear()
  lastInboundAcceptedAtByConnection.clear()
  reservedOutboundSourceIds.clear()
  lastPublishAttemptAtByNamespace.clear()
  localWireSourceId = null
  opaqueIdSequence = 0
}

export function resetP2PCollaborationExtensionRuntimeForTests(): void {
  resetP2PCollaborationExtensionSession()
  registrations.clear()
}
