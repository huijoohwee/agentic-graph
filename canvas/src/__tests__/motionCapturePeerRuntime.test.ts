import {
  handleP2PCollaborationExtensionWireMessage,
  P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES,
  releaseP2PCollaborationExtensionConnection,
  resetP2PCollaborationExtensionRuntimeForTests,
  resetP2PCollaborationExtensionSession,
} from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import {
  parseP2PCollaborationWireMessage,
  type P2PCollaborationExtensionWireMessage,
} from '@/features/collaboration/p2pCollaborationProtocol'
import {
  notifyP2PCollaborationTransportTopologyChanged,
  resetSharedRuntimeRefs,
  sharedRuntimeRefs,
  type RuntimeConnectionRef,
} from '@/features/collaboration/p2pCollaborationRuntimeState'
import {
  publishMotionCapturePeerObservation,
  readMotionCapturePeerSharingSnapshot,
  setMotionCapturePeerSharingEnabled,
} from '@/features/three/motionCapturePeerRuntime'
import { motionCaptureSessionRuntime } from '@/features/three/motionCaptureSessionRuntime'

const landmark = Object.freeze({ x: 0.1, y: 0.2, z: -0.3, visibility: 0.95, presence: 0.96 })

function connection(sent: string[], peerId: string): RuntimeConnectionRef {
  return {
    inviteId: null,
    peerId,
    displayName: 'Private peer label',
    ownership: 'guest',
    connection: { close: () => undefined } as unknown as RTCPeerConnection,
    channel: {
      readyState: 'open',
      bufferedAmount: 0,
      send: (value: string) => sent.push(value),
      close: () => undefined,
    } as unknown as RTCDataChannel,
    connectedAt: 1,
    lastSeenAt: 1,
  }
}

function clearCaptureSources(): void {
  for (const source of motionCaptureSessionRuntime.getSnapshot().sources) {
    motionCaptureSessionRuntime.removeSource(source.sourceId)
  }
  motionCaptureSessionRuntime.clearRecording()
}

export function testMotionCapturePeerRuntimeSharesOnlyBoundedDerivedObservations(): void {
  const previousRtc = Object.getOwnPropertyDescriptor(globalThis, 'RTCPeerConnection')
  Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, writable: true, value: class TestRtc {} })
  setMotionCapturePeerSharingEnabled(false)
  resetP2PCollaborationExtensionRuntimeForTests()
  resetSharedRuntimeRefs()
  clearCaptureSources()
  const outbound: string[] = []
  const hostConnection = connection(outbound, 'stable-private-host-peer')
  const remoteConnection = connection([], 'stable-private-remote-peer')

  try {
    const runtime = sharedRuntimeRefs.current
    runtime.role = 'host'
    runtime.sessionId = 'motion-capture-peer-test-session'
    runtime.localPeerId = 'stable-private-local-peer'
    runtime.hostConnectionsByPeerId.set(hostConnection.peerId, hostConnection)
    const enabled = setMotionCapturePeerSharingEnabled(true)
    if (!enabled.enabled || !enabled.available) throw new Error('expected explicit peer sharing to enable with WebRTC capability')

    const sent = publishMotionCapturePeerObservation({
      captureTimestampMs: 10,
      sequence: 1,
      confidence: 0.9,
      landmarks: [landmark],
      missing: false,
    })
    const wire = parseP2PCollaborationWireMessage(outbound[0] || '')
    if (sent.lastDeliveryStatus !== 'sent' || sent.connectedPeerCount !== 1 || !wire || wire.kind !== 'extension') {
      throw new Error('expected one bounded derived-observation delivery')
    }
    const serialized = outbound[0] || ''
    if (/stable-private|deviceId|endpoint|frame|tensor/u.test(serialized)) {
      throw new Error('expected peer capture envelope to omit stable identities, endpoints, frames, and tensors')
    }

    const throttled = publishMotionCapturePeerObservation({
      captureTimestampMs: 11,
      sequence: 2,
      confidence: 0.9,
      landmarks: [landmark],
      missing: false,
    })
    if (throttled.lastDeliveryStatus !== 'throttled' || !throttled.lastError.includes('30 Hz') || outbound.length !== 1) {
      throw new Error('expected Motion Capture to expose a bounded-rate dropped frame')
    }

    resetP2PCollaborationExtensionSession()
    const resetSnapshot = readMotionCapturePeerSharingSnapshot()
    if (resetSnapshot.enabled || resetSnapshot.lastDeliveryStatus !== 'not-connected') {
      throw new Error('expected collaboration session reset to require fresh explicit sharing consent')
    }
    const reenabled = setMotionCapturePeerSharingEnabled(true)
    if (!reenabled.enabled) throw new Error('expected sharing to re-register only after explicit consent in the active session')
    const outboundBeforeBackpressure = outbound.length
    ;(hostConnection.channel as unknown as { bufferedAmount: number }).bufferedAmount = P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES
    const backpressured = publishMotionCapturePeerObservation({
      captureTimestampMs: 12,
      sequence: 3,
      confidence: 0.9,
      landmarks: [landmark],
      missing: false,
    })
    if (backpressured.lastDeliveryStatus !== 'backpressure'
      || !backpressured.lastError.includes('backpressured')
      || backpressured.connectedPeerCount !== 1
      || outbound.length !== outboundBeforeBackpressure) {
      throw new Error('expected Motion Capture to expose backpressure without losing connected-peer truth')
    }
    ;(hostConnection.channel as unknown as { bufferedAmount: number }).bufferedAmount = 0
    runtime.hostConnectionsByPeerId.delete(hostConnection.peerId)
    notifyP2PCollaborationTransportTopologyChanged()
    const disconnected = readMotionCapturePeerSharingSnapshot()
    if (!disconnected.enabled || disconnected.connectedPeerCount !== 0 || disconnected.lastDeliveryStatus !== 'not-connected') {
      throw new Error('expected host peer removal to reconcile sharing without another observation')
    }
    runtime.hostConnectionsByPeerId.set(hostConnection.peerId, hostConnection)
    notifyP2PCollaborationTransportTopologyChanged()
    const reconnected = readMotionCapturePeerSharingSnapshot()
    if (!reconnected.enabled || reconnected.connectedPeerCount !== 1 || reconnected.lastDeliveryStatus !== 'idle') {
      throw new Error('expected same-session peer restoration to reconcile without implicit publication')
    }

    const remoteMessage: P2PCollaborationExtensionWireMessage = {
      ...wire,
      sourceId: 'src_remotemotion0001',
      payload: {
        ...wire.payload!,
        captureTimestampMs: 11,
        sequence: 1,
      },
    }
    const sourceCountBeforeOverBound = motionCaptureSessionRuntime.getSnapshot().sources.length
    if (handleP2PCollaborationExtensionWireMessage({
      ...remoteMessage,
      sourceId: 'src_remoteoverbound001',
      payload: { ...remoteMessage.payload!, captureTimestampMs: 1e20 },
    }, remoteConnection, 'host')
      || motionCaptureSessionRuntime.getSnapshot().sources.length !== sourceCountBeforeOverBound) {
      throw new Error('expected over-bound peer time to fail before relay or source registration')
    }
    if (!handleP2PCollaborationExtensionWireMessage(remoteMessage, remoteConnection, 'host')) {
      throw new Error('expected validated remote derived observation to reach the capture runtime')
    }
    const peerSource = motionCaptureSessionRuntime.getSnapshot().sources.find(source => source.captureKind === 'peer-derived')
    if (!peerSource || peerSource.latestObservation?.landmarkCount !== 1 || motionCaptureSessionRuntime.getSnapshot().evidence.researchReady) {
      throw new Error('expected an opaque unaligned peer source to remain below research-ready')
    }

    publishMotionCapturePeerObservation({
      captureTimestampMs: 12,
      sequence: 2,
      confidence: 0.9,
      landmarks: Array.from({ length: 34 }, () => landmark),
      missing: false,
    })
    if (readMotionCapturePeerSharingSnapshot().lastDeliveryStatus !== 'invalid-payload') {
      throw new Error('expected oversized landmark observations to fail closed before transport')
    }
    publishMotionCapturePeerObservation({
      captureTimestampMs: 12, sequence: 2, confidence: 0.9,
      landmarks: new Array(1) as typeof landmark[], missing: false,
    })
    if (readMotionCapturePeerSharingSnapshot().lastDeliveryStatus !== 'invalid-payload') {
      throw new Error('expected sparse peer landmark arrays to fail closed before transport')
    }
    const outboundBeforeOverBound = outbound.length
    publishMotionCapturePeerObservation({
      captureTimestampMs: 1e20, sequence: 2, confidence: 0.9, landmarks: [landmark], missing: false,
    })
    if (readMotionCapturePeerSharingSnapshot().lastDeliveryStatus !== 'invalid-payload'
      || outbound.length !== outboundBeforeOverBound) {
      throw new Error('expected over-bound peer time to fail before transport')
    }
    publishMotionCapturePeerObservation({
      captureTimestampMs: 13,
      sequence: Number.MAX_SAFE_INTEGER + 1,
      confidence: 0.9,
      landmarks: [landmark],
      missing: false,
    })
    if (readMotionCapturePeerSharingSnapshot().lastDeliveryStatus !== 'invalid-payload') {
      throw new Error('expected unsafe peer sequences to fail before relay or capture ingestion')
    }
    releaseP2PCollaborationExtensionConnection(remoteConnection, runtime.sessionId)
    if (motionCaptureSessionRuntime.getSnapshot().sources.some(source => source.captureKind === 'peer-derived')) {
      throw new Error('expected peer source state to clear with its collaboration connection')
    }
    setMotionCapturePeerSharingEnabled(false)
    const sourceLeft = parseP2PCollaborationWireMessage(outbound.at(-1) || '')
    if (!sourceLeft || sourceLeft.kind !== 'extension' || sourceLeft.event !== 'source-left' || sourceLeft.payload !== undefined) {
      throw new Error('expected explicit sharing disable to announce source cleanup without payload data')
    }
  } finally {
    setMotionCapturePeerSharingEnabled(false)
    resetP2PCollaborationExtensionRuntimeForTests()
    resetSharedRuntimeRefs()
    clearCaptureSources()
    if (previousRtc) Object.defineProperty(globalThis, 'RTCPeerConnection', previousRtc)
    else delete (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection
  }
}
