import {
  inspectP2PCollaborationExtensionTransport,
  publishP2PCollaborationExtension,
  registerP2PCollaborationExtension,
  type P2PCollaborationExtensionEvent,
} from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import type { P2PCollaborationExtensionPayload } from '@/features/collaboration/p2pCollaborationProtocol'
import { subscribeP2PCollaborationTransportTopology } from '@/features/collaboration/p2pCollaborationRuntimeState'
import { MOTION_CAPTURE_MAX_TIME_MS, type MotionCaptureDerivedLandmark } from './motionCapturePlatformContract'
import { motionCaptureSessionRuntime } from './motionCaptureSessionRuntime'
import { motionCapturePlatformTeardownActive } from './motionCaptureLifecycleGate'

const MOTION_CAPTURE_PEER_SCHEMA = 'knowgrph.motion-capture-peer/v1' as const
const MOTION_CAPTURE_PEER_NAMESPACE = 'knowgrph.motion-capture/v1'
const MOTION_CAPTURE_PEER_LANDMARK_LIMIT = 33

export type MotionCapturePeerDeliveryStatus =
  | 'idle'
  | 'sent'
  | 'not-connected'
  | 'invalid-payload'
  | 'payload-too-large'
  | 'throttled'
  | 'backpressure'
  | 'error'

export type MotionCapturePeerSharingSnapshot = Readonly<{
  schema: typeof MOTION_CAPTURE_PEER_SCHEMA
  available: boolean
  enabled: boolean
  connectedPeerCount: number
  lastDeliveryStatus: MotionCapturePeerDeliveryStatus
  lastError: string
  revision: number
}>

export type MotionCapturePeerObservation = Readonly<{
  captureTimestampMs: number
  sequence: number
  confidence: number
  landmarks: readonly MotionCaptureDerivedLandmark[]
  missing: boolean
}>

type ValidPeerPayload = Readonly<{
  schema: typeof MOTION_CAPTURE_PEER_SCHEMA
  captureTimestampMs: number
  sequence: number
  coordinateSpace: 'model-relative'
  confidence: number
  missing: boolean
  landmarks: readonly MotionCaptureDerivedLandmark[]
}>

const listeners = new Set<() => void>()
const remoteSourceIds = new Map<string, string>()
let unregisterExtension: (() => void) | null = null
let snapshot: MotionCapturePeerSharingSnapshot = Object.freeze({
  schema: MOTION_CAPTURE_PEER_SCHEMA,
  available: peerTransportAvailable(),
  enabled: false,
  connectedPeerCount: 0,
  lastDeliveryStatus: 'idle',
  lastError: '',
  revision: 0,
})

function peerTransportAvailable(): boolean {
  return typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined'
}

function publishState(patch: Partial<Omit<MotionCapturePeerSharingSnapshot, 'schema' | 'revision'>>): MotionCapturePeerSharingSnapshot {
  const next = { ...snapshot, ...patch }
  if (Object.entries(next).every(([key, value]) => key === 'revision' || value === snapshot[key as keyof MotionCapturePeerSharingSnapshot])) return snapshot
  snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 })
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[knowgrph] motion capture peer listener failed', error)
    }
  }
  return snapshot
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const probability = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1

function isDerivedLandmark(value: unknown): value is MotionCaptureDerivedLandmark {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).length === 5
    && finite(record.x)
    && finite(record.y)
    && finite(record.z)
    && probability(record.visibility)
    && probability(record.presence)
}

function isMotionCapturePeerPayload(payload: P2PCollaborationExtensionPayload): payload is P2PCollaborationExtensionPayload & ValidPeerPayload {
  const keys = Object.keys(payload).sort()
  if (keys.join(',') !== 'captureTimestampMs,confidence,coordinateSpace,landmarks,missing,schema,sequence') return false
  const landmarks = payload.landmarks
  return payload.schema === MOTION_CAPTURE_PEER_SCHEMA
    && payload.coordinateSpace === 'model-relative'
    && finite(payload.captureTimestampMs)
    && payload.captureTimestampMs >= 0
    && payload.captureTimestampMs <= MOTION_CAPTURE_MAX_TIME_MS
    && Number.isSafeInteger(payload.sequence)
    && Number(payload.sequence) >= 1
    && probability(payload.confidence)
    && typeof payload.missing === 'boolean'
    && Array.isArray(landmarks)
    && landmarks.length <= MOTION_CAPTURE_PEER_LANDMARK_LIMIT
    && payload.missing === (landmarks.length === 0)
    && Array.from(landmarks).every(isDerivedLandmark)
}

function removeRemoteSource(extensionSourceId: string): void {
  const sourceId = remoteSourceIds.get(extensionSourceId)
  remoteSourceIds.delete(extensionSourceId)
  if (!sourceId) return
  if (motionCaptureSessionRuntime.getSnapshot().sources.some(source => source.sourceId === sourceId)) {
    motionCaptureSessionRuntime.removeSource(sourceId)
  }
}

function clearRemoteSources(): void {
  for (const extensionSourceId of [...remoteSourceIds.keys()]) removeRemoteSource(extensionSourceId)
}

function peerSourceId(extensionSourceId: string): string {
  const existing = remoteSourceIds.get(extensionSourceId)
  if (existing) return existing
  const source = motionCaptureSessionRuntime.registerSource({
    captureKind: 'peer-derived',
    coordinateSpace: 'model-relative',
    clockDomain: 'source-local',
  })
  remoteSourceIds.set(extensionSourceId, source.sourceId)
  return source.sourceId
}

function handlePeerEvent(event: P2PCollaborationExtensionEvent<P2PCollaborationExtensionPayload>): void {
  try {
    if (event.kind === 'session-reset') {
      const unregister = unregisterExtension
      unregisterExtension = null
      unregister?.()
      clearRemoteSources()
      publishState({ enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'not-connected', lastError: 'Collaboration session ended; peer sharing is off.' })
      return
    }
    if (event.kind === 'source-left') {
      removeRemoteSource(event.sourceId)
      publishState({ connectedPeerCount: inspectP2PCollaborationExtensionTransport().connectedPeerCount, lastError: '' })
      return
    }
    if (!isMotionCapturePeerPayload(event.payload)) return
    const existingSourceId = remoteSourceIds.get(event.sourceId)
    try {
      motionCaptureSessionRuntime.ingestObservation(peerSourceId(event.sourceId), {
        captureTimestampMs: event.payload.captureTimestampMs,
        sequence: event.payload.sequence,
        coordinateSpace: 'model-relative',
        confidence: event.payload.confidence,
        landmarks: event.payload.landmarks,
        missing: event.payload.missing,
      })
    } catch (error) {
      if (!existingSourceId) removeRemoteSource(event.sourceId)
      throw error
    }
    publishState({ connectedPeerCount: inspectP2PCollaborationExtensionTransport().connectedPeerCount, lastError: '' })
  } catch (error) {
    publishState({ lastDeliveryStatus: 'error', lastError: error instanceof Error ? error.message : String(error) })
  }
}

function registerExtension(): void {
  unregisterExtension = registerP2PCollaborationExtension(MOTION_CAPTURE_PEER_NAMESPACE, {
    validatePayload: isMotionCapturePeerPayload,
    onEvent: handlePeerEvent,
  })
}

function reconcilePeerTransportTopology(): void {
  if (!snapshot.enabled) return
  const transport = inspectP2PCollaborationExtensionTransport()
  const restored = transport.active && snapshot.lastDeliveryStatus === 'not-connected'
  publishState({
    connectedPeerCount: transport.connectedPeerCount,
    lastDeliveryStatus: transport.active ? (restored ? 'idle' : snapshot.lastDeliveryStatus) : 'not-connected',
    lastError: transport.active
      ? (restored ? '' : snapshot.lastError)
      : 'No connected collaboration peers remain; peer sharing is still armed for this session.',
  })
}

subscribeP2PCollaborationTransportTopology(reconcilePeerTransportTopology)

export function readMotionCapturePeerSharingSnapshot(): MotionCapturePeerSharingSnapshot {
  return snapshot
}

export function subscribeMotionCapturePeerSharing(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setMotionCapturePeerSharingEnabled(enabled: boolean): MotionCapturePeerSharingSnapshot {
  const available = peerTransportAvailable()
  if (enabled && motionCapturePlatformTeardownActive()) {
    return publishState({ available, enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'error', lastError: 'Motion Capture teardown is in progress.' })
  }
  if (enabled === snapshot.enabled && available === snapshot.available) return snapshot
  if (!enabled) {
    unregisterExtension?.()
    unregisterExtension = null
    clearRemoteSources()
    return publishState({ available, enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'idle', lastError: '' })
  }
  if (!available) {
    return publishState({ available: false, enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'error', lastError: 'Peer collaboration transport is unavailable in this browser.' })
  }
  const transport = inspectP2PCollaborationExtensionTransport()
  if (!transport.active) {
    return publishState({ available: true, enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'not-connected', lastError: 'Start or join a connected collaboration session before enabling peer sharing.' })
  }
  try {
    registerExtension()
    return publishState({ available: true, enabled: true, connectedPeerCount: transport.connectedPeerCount, lastDeliveryStatus: 'idle', lastError: '' })
  } catch (error) {
    unregisterExtension = null
    return publishState({ available: true, enabled: false, connectedPeerCount: 0, lastDeliveryStatus: 'error', lastError: error instanceof Error ? error.message : String(error) })
  }
}

export function publishMotionCapturePeerObservation(observation: MotionCapturePeerObservation): MotionCapturePeerSharingSnapshot {
  if (!snapshot.enabled) return snapshot
  const payload: P2PCollaborationExtensionPayload = {
    schema: MOTION_CAPTURE_PEER_SCHEMA,
    captureTimestampMs: observation.captureTimestampMs,
    sequence: observation.sequence,
    coordinateSpace: 'model-relative',
    confidence: observation.confidence,
    missing: observation.missing,
    landmarks: observation.landmarks.map(landmark => ({ ...landmark })),
  }
  const result = publishP2PCollaborationExtension(MOTION_CAPTURE_PEER_NAMESPACE, payload)
  const transport = inspectP2PCollaborationExtensionTransport()
  const status: MotionCapturePeerDeliveryStatus = result.status === 'unregistered' || result.status === 'invalid-namespace'
    ? 'error'
    : result.status
  const lastError = status === 'error'
    ? `Motion capture peer transport failed: ${result.status}.`
    : status === 'throttled'
      ? 'Derived-pose peer frame dropped at the bounded 30 Hz transport limit.'
      : status === 'backpressure'
        ? 'Derived-pose peer frame dropped because the collaboration channel is backpressured.'
        : ''
  return publishState({
    connectedPeerCount: transport.connectedPeerCount,
    lastDeliveryStatus: status,
    lastError,
  })
}
