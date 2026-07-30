import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  parseP2PCollaborationWireMessage,
  P2P_COLLAB_EXTENSION_MAX_PAYLOAD_BYTES,
  P2P_COLLAB_PROTOCOL_VERSION,
  type P2PCollaborationExtensionPayload,
  type P2PCollaborationExtensionWireMessage,
} from '@/features/collaboration/p2pCollaborationProtocol'
import {
  handleP2PCollaborationExtensionWireMessage,
  P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES,
  P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS,
  publishP2PCollaborationExtension,
  registerP2PCollaborationExtension,
  resetP2PCollaborationExtensionRuntimeForTests,
  resetP2PCollaborationExtensionSession,
  type P2PCollaborationExtensionEvent,
} from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import {
  resetSharedRuntimeRefs,
  sharedRuntimeRefs,
  type RuntimeConnectionRef,
} from '@/features/collaboration/p2pCollaborationRuntimeState'
import { useP2PCollaborationStore } from '@/features/collaboration/p2pCollaborationStore'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import {
  CollaborationRuntimeHarness,
  FakeGuestPeer,
  MockRTCPeerConnection,
  resetCollaborationStore,
  waitForCondition,
} from './mainPanelCollaboration.testkit'

const TEST_NAMESPACE = 'knowgrph.test-extension/v1'

type TestExtensionPayload = P2PCollaborationExtensionPayload & {
  frame: number
  label: string
}

function isTestPayload(payload: P2PCollaborationExtensionPayload): boolean {
  return typeof payload.frame === 'number'
    && Number.isFinite(payload.frame)
    && typeof payload.label === 'string'
    && payload.label.length <= 64
}

function buildExtensionMessage(
  overrides?: Partial<P2PCollaborationExtensionWireMessage>,
): P2PCollaborationExtensionWireMessage {
  return {
    v: P2P_COLLAB_PROTOCOL_VERSION,
    kind: 'extension',
    event: 'message',
    sessionId: 'session-extension',
    namespace: TEST_NAMESPACE,
    sourceId: 'src_extensiontest0001',
    payload: { frame: 1, label: 'derived-pose' },
    sentAt: 1,
    ...overrides,
  }
}

function buildRuntimeConnection(sent: string[], peerId = 'private-peer-id'): RuntimeConnectionRef {
  const channel = {
    readyState: 'open',
    bufferedAmount: 0,
    send: (raw: string) => sent.push(raw),
    close: () => undefined,
  } as unknown as RTCDataChannel
  return {
    inviteId: null,
    peerId,
    displayName: 'Private Peer',
    ownership: 'guest',
    connection: { close: () => undefined } as unknown as RTCPeerConnection,
    channel,
    connectedAt: 1,
    lastSeenAt: 1,
  }
}

export async function testP2PCollaborationExtensionProtocolFailsClosedOnUnsafeEnvelopes() {
  const valid = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage()))
  if (!valid || valid.kind !== 'extension' || valid.payload?.frame !== 1) {
    throw new Error('expected a bounded extension envelope to parse')
  }

  const invalidNamespace = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage({
    namespace: 'Knowgrph Extension',
  })))
  if (invalidNamespace) throw new Error('expected an invalid extension namespace to fail closed')

  const endpointPayload = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage({
    payload: { frame: 1, label: 'derived-pose', endpoint: 'https://example.invalid/pose' },
  })))
  if (endpointPayload) throw new Error('expected arbitrary endpoint payloads to fail closed')

  const networkValuePayload = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage({
    payload: { frame: 1, label: 'https://example.invalid/pose' },
  })))
  if (networkValuePayload) throw new Error('expected network-address payload values to fail closed')

  const oversizedPayload = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage({
    payload: { frame: 1, label: 'x'.repeat(P2P_COLLAB_EXTENSION_MAX_PAYLOAD_BYTES + 1) },
  })))
  if (oversizedPayload) throw new Error('expected an oversized extension payload to fail closed')

  const invalidCleanup = parseP2PCollaborationWireMessage(JSON.stringify(buildExtensionMessage({
    event: 'source-left',
    payload: { frame: 1, label: 'must-not-be-present' },
  })))
  if (invalidCleanup) throw new Error('expected source cleanup envelopes with payload data to fail closed')
}

export function testP2PCollaborationExtensionInboundRateSurvivesSourceChurn(): void {
  resetP2PCollaborationExtensionRuntimeForTests()
  const sent: string[] = []
  const connectionRef = buildRuntimeConnection(sent)
  const events: Array<P2PCollaborationExtensionEvent<TestExtensionPayload>> = []
  const previousDateNow = Object.getOwnPropertyDescriptor(Date, 'now')
  let nowMs = 1_000
  Object.defineProperty(Date, 'now', { configurable: true, value: () => nowMs })
  const unregister = registerP2PCollaborationExtension<TestExtensionPayload>(TEST_NAMESPACE, {
    validatePayload: isTestPayload,
    onEvent: event => events.push(event),
  })

  try {
    const first = buildExtensionMessage({ sourceId: 'src_rate_source_one', payload: { frame: 1, label: 'first' } })
    if (!handleP2PCollaborationExtensionWireMessage(first, connectionRef, 'host')) {
      throw new Error('expected the first inbound extension frame to be accepted')
    }
    const cleanup = buildExtensionMessage({
      event: 'source-left',
      sourceId: first.sourceId,
      payload: undefined,
    })
    if (!handleP2PCollaborationExtensionWireMessage(cleanup, connectionRef, 'host')) {
      throw new Error('expected source cleanup to be accepted')
    }
    nowMs += 1
    const churned = buildExtensionMessage({
      sourceId: 'src_rate_source_two',
      payload: { frame: 2, label: 'churned' },
    })
    if (handleP2PCollaborationExtensionWireMessage(churned, connectionRef, 'host')
      || events.some(event => event.kind === 'message' && event.payload.frame === 2)) {
      throw new Error('expected source churn to preserve the connection-scoped inbound rate clock')
    }
    nowMs += Math.ceil(P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS)
    const bounded = buildExtensionMessage({
      sourceId: 'src_rate_source_three',
      payload: { frame: 3, label: 'bounded' },
    })
    if (!handleP2PCollaborationExtensionWireMessage(bounded, connectionRef, 'host')
      || !events.some(event => event.kind === 'message' && event.payload.frame === 3)) {
      throw new Error('expected a new source only after the inbound namespace interval elapsed')
    }
  } finally {
    unregister()
    resetP2PCollaborationExtensionRuntimeForTests()
    if (previousDateNow) Object.defineProperty(Date, 'now', previousDateNow)
  }
}

export function testP2PCollaborationExtensionOutboundRateSurvivesRegistrationChurn(): void {
  resetP2PCollaborationExtensionRuntimeForTests()
  resetSharedRuntimeRefs()
  const sent: string[] = []
  const connectionRef = buildRuntimeConnection(sent)
  const previousDateNow = Object.getOwnPropertyDescriptor(Date, 'now')
  let nowMs = 1_000
  let unregister = () => undefined
  Object.defineProperty(Date, 'now', { configurable: true, value: () => nowMs })
  const register = () => registerP2PCollaborationExtension<TestExtensionPayload>(TEST_NAMESPACE, {
    validatePayload: isTestPayload,
    onEvent: () => undefined,
  })

  try {
    const runtime = sharedRuntimeRefs.current
    runtime.role = 'host'
    runtime.sessionId = 'session-extension-churn'
    runtime.hostConnectionsByPeerId.set(connectionRef.peerId, connectionRef)
    unregister = register()
    const first = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 1, label: 'first' })
    if (first.status !== 'sent') throw new Error('expected the first outbound extension frame to send')
    unregister()
    unregister = register()
    const churned = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 2, label: 'churned' })
    if (churned.status !== 'throttled' || sent.length !== 2) {
      throw new Error('expected registration churn to preserve the session-scoped outbound rate clock')
    }
    nowMs += Math.ceil(P2P_COLLAB_EXTENSION_MIN_PUBLISH_INTERVAL_MS)
    const bounded = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 3, label: 'bounded' })
    if (bounded.status !== 'sent' || Array.from(sent).length !== 3) {
      throw new Error('expected outbound publication after the namespace interval elapsed')
    }
  } finally {
    unregister()
    resetP2PCollaborationExtensionRuntimeForTests()
    resetSharedRuntimeRefs()
    if (previousDateNow) Object.defineProperty(Date, 'now', previousDateNow)
  }
}

export async function testP2PCollaborationExtensionPublishIsRegisteredBoundedAndPeerOpaque() {
  resetP2PCollaborationExtensionRuntimeForTests()
  resetSharedRuntimeRefs()
  const sentA: string[] = []
  const sentB: string[] = []
  const connectionA = buildRuntimeConnection(sentA, 'private-peer-a')
  const connectionB = buildRuntimeConnection(sentB, 'private-peer-b')
  const unregister = registerP2PCollaborationExtension<TestExtensionPayload>(TEST_NAMESPACE, {
    validatePayload: isTestPayload,
    onEvent: () => undefined,
  })

  try {
    const runtime = sharedRuntimeRefs.current
    runtime.role = 'host'
    runtime.sessionId = 'session-extension'
    runtime.localPeerId = 'private-local-peer-id'
    runtime.hostConnectionsByPeerId.set('private-peer-a', connectionA)
    runtime.hostConnectionsByPeerId.set('private-peer-b', connectionB)

    const result = publishP2PCollaborationExtension(TEST_NAMESPACE, {
      frame: 2,
      label: 'derived-pose',
    })
    if (result.status !== 'sent' || result.deliveredPeerCount !== 2) {
      throw new Error(`expected two peer deliveries, got ${result.status}:${result.deliveredPeerCount}`)
    }
    const outbound = parseP2PCollaborationWireMessage(sentA[0] || '')
    if (!outbound || outbound.kind !== 'extension' || !outbound.sourceId.startsWith('src_')) {
      throw new Error('expected a session-scoped extension source token')
    }
    const outboundJson = sentA[0] || ''
    if (outboundJson.includes('private-peer') || outboundJson.includes('Private Peer')) {
      throw new Error('expected extension envelopes to omit stable peer metadata')
    }
    if (sentA[0] !== sentB[0]) throw new Error('expected deterministic fan-out of the same envelope')

    const throttled = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 3, label: 'derived-pose' })
    if (throttled.status !== 'throttled' || sentA.length !== 1 || sentB.length !== 1) {
      throw new Error('expected an over-rate derived frame to be dropped without queue growth')
    }

    resetP2PCollaborationExtensionSession()
    ;(connectionA.channel as unknown as { bufferedAmount: number }).bufferedAmount = P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES
    ;(connectionB.channel as unknown as { bufferedAmount: number }).bufferedAmount = P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES
    const backpressured = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 4, label: 'derived-pose' })
    if (backpressured.status !== 'backpressure' || backpressured.deliveredPeerCount !== 0 || sentA.length !== 1 || sentB.length !== 1) {
      throw new Error('expected buffered channels to drop extension frames before head-of-line queue growth')
    }
    ;(connectionA.channel as unknown as { bufferedAmount: number }).bufferedAmount = 0
    ;(connectionB.channel as unknown as { bufferedAmount: number }).bufferedAmount = 0

    const unsafe = publishP2PCollaborationExtension(TEST_NAMESPACE, {
      frame: 5,
      label: 'derived-pose',
      endpoint: 'https://example.invalid/pose',
    })
    if (unsafe.status !== 'invalid-payload') throw new Error('expected endpoint injection to be rejected')
    const sparse = publishP2PCollaborationExtension(TEST_NAMESPACE, {
      frame: 5,
      label: 'derived-pose',
      samples: new Array(1),
    })
    if (sparse.status !== 'invalid-payload') throw new Error('expected sparse extension arrays to fail closed before serialization')

    const oversized = publishP2PCollaborationExtension(TEST_NAMESPACE, {
      frame: 6,
      label: 'x'.repeat(P2P_COLLAB_EXTENSION_MAX_PAYLOAD_BYTES + 1),
    })
    if (oversized.status !== 'payload-too-large') throw new Error('expected bounded publication')
    const remoteMessage = buildExtensionMessage({
      sessionId: runtime.sessionId,
      sourceId: 'src_remote_unregister_test',
      payload: { frame: 8, label: 'remote-before-unregister' },
    })
    if (!handleP2PCollaborationExtensionWireMessage(remoteMessage, connectionA, 'host')) {
      throw new Error('expected a remote relay mapping before host-side unregister')
    }

    const beforeCleanupA = sentA.length
    const beforeCleanupB = sentB.length
    ;(connectionA.channel as unknown as { bufferedAmount: number }).bufferedAmount = P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES
    ;(connectionB.channel as unknown as { bufferedAmount: number }).bufferedAmount = P2P_COLLAB_EXTENSION_MAX_BUFFERED_AMOUNT_BYTES
    unregister()
    const cleanupA = sentA.slice(beforeCleanupA).map(raw => parseP2PCollaborationWireMessage(raw))
    const cleanupB = sentB.slice(beforeCleanupB).map(raw => parseP2PCollaborationWireMessage(raw))
    if (sentA.length !== beforeCleanupA + 1
      || sentB.length !== beforeCleanupB + 2
      || cleanupA.some(message => message?.kind !== 'extension' || message.event !== 'source-left')
      || cleanupB.some(message => message?.kind !== 'extension' || message.event !== 'source-left')
      || new Set(cleanupB.map(message => message?.kind === 'extension' ? message.sourceId : '')).size !== 2) {
      throw new Error('expected priority cleanup for local and host-relayed sources under observation backpressure')
    }
    const unregistered = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 7, label: 'derived-pose' })
    if (unregistered.status !== 'unregistered') throw new Error('expected unregistered publication to fail closed')
  } finally {
    unregister()
    resetP2PCollaborationExtensionRuntimeForTests()
    resetSharedRuntimeRefs()
  }
}

export async function testP2PCollaborationExtensionRelaysOnlyRegisteredPayloadsAndCleansUpSources() {
  resetCollaborationStore()
  MockRTCPeerConnection.reset()
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let unregister = () => undefined
  const previousWindowRtc = (dom.window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection
  const previousGlobalRtc = (globalThis as typeof globalThis & { RTCPeerConnection?: unknown }).RTCPeerConnection
  const events: Array<P2PCollaborationExtensionEvent<TestExtensionPayload>> = []

  try {
    unregister = registerP2PCollaborationExtension<TestExtensionPayload>(TEST_NAMESPACE, {
      validatePayload: isTestPayload,
      onEvent: event => events.push(event),
    })
    const anyWindow = dom.window as unknown as {
      requestAnimationFrame?: (callback: (timestamp: number) => void) => number
      RTCPeerConnection?: unknown
    }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    anyWindow.RTCPeerConnection = MockRTCPeerConnection
    ;(globalThis as typeof globalThis & { RTCPeerConnection?: unknown }).RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection

    useGraphStore.getState().resetAll()
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(CollaborationRuntimeHarness, {
        activeText: '# Extension host\n',
        applyRemoteDocumentCalls: [],
        revealRemoteLines: [],
      }),
      { window: dom.window, frames: 4 },
    )

    const store = useP2PCollaborationStore.getState()
    store.queueStartHost()
    await waitForCondition(() => Boolean(useP2PCollaborationStore.getState().inviteToken))
    const guestA = new FakeGuestPeer({ peerId: 'guest-extension-a', displayName: 'Guest Extension A' })
    const inviteTokenA = String(useP2PCollaborationStore.getState().inviteToken || '')
    store.setAnswerInput(await guestA.buildAnswerFromInvite(inviteTokenA))
    store.queueApplyAnswer()
    await waitForCondition(() => Boolean(guestA.channel?.readyState === 'open'))

    store.queueStartHost()
    await waitForCondition(() => {
      const inviteToken = String(useP2PCollaborationStore.getState().inviteToken || '')
      return Boolean(inviteToken && inviteToken !== inviteTokenA)
    })
    const guestB = new FakeGuestPeer({ peerId: 'guest-extension-b', displayName: 'Guest Extension B' })
    const inviteTokenB = String(useP2PCollaborationStore.getState().inviteToken || '')
    store.setAnswerInput(await guestB.buildAnswerFromInvite(inviteTokenB))
    store.queueApplyAnswer()
    await waitForCondition(() => Boolean(guestB.channel?.readyState === 'open'))

    const sessionId = String(useP2PCollaborationStore.getState().sessionId || '')
    const hostDelivery = publishP2PCollaborationExtension(TEST_NAMESPACE, { frame: 9, label: 'host-derived-pose' })
    if (hostDelivery.status !== 'sent') throw new Error('expected a host source token before collision testing')
    await waitForCondition(() => guestB.receivedMessages.some(message => (
      message.kind === 'extension' && message.event === 'message' && message.payload?.frame === 9
    )))
    const hostMessage = guestB.receivedMessages.find(message => (
      message.kind === 'extension' && message.event === 'message' && message.payload?.frame === 9
    ))
    if (!hostMessage || hostMessage.kind !== 'extension') throw new Error('expected host extension source')
    const collidingGuestSourceId = hostMessage.sourceId
    guestA.sendMessage(buildExtensionMessage({ sessionId, sourceId: collidingGuestSourceId }))
    guestA.sendMessage(buildExtensionMessage({
      sessionId,
      sourceId: collidingGuestSourceId,
      payload: { frame: 2, label: 'over-rate-derived-pose' },
    }))
    await waitForCondition(() => (
      events.some(event => event.kind === 'message' && event.payload.frame === 1)
      && guestB.receivedMessages.some(message => (
        message.kind === 'extension'
        && message.event === 'message'
        && message.payload?.frame === 1
        && message.sourceId !== collidingGuestSourceId
      ))
    ))

    const messageEvent = events.find(event => event.kind === 'message')
    const relayedGuestMessage = guestB.receivedMessages.find(message => (
      message.kind === 'extension' && message.event === 'message' && message.payload?.frame === 1
    ))
    if (!messageEvent || !relayedGuestMessage || relayedGuestMessage.kind !== 'extension'
      || messageEvent.sourceId === collidingGuestSourceId || messageEvent.sourceId.includes('guest-extension')
      || relayedGuestMessage.sourceId === collidingGuestSourceId) {
      throw new Error('expected consumers to receive a local opaque source alias')
    }
    await new Promise(resolve => setTimeout(resolve, 20))
    if (events.some(event => event.kind === 'message' && event.payload.frame === 2)
      || guestB.receivedMessages.some(message => message.kind === 'extension' && message.payload?.frame === 2)) {
      throw new Error('expected inbound over-rate extension frames to be dropped before handler and relay')
    }

    guestB.sendMessage(buildExtensionMessage({
      sessionId,
      sourceId: collidingGuestSourceId,
      payload: { frame: 3, label: 'second-guest-derived-pose' },
    }))
    await waitForCondition(() => guestA.receivedMessages.some(message => (
      message.kind === 'extension' && message.event === 'message' && message.payload?.frame === 3
    )))
    const secondGuestRelay = guestA.receivedMessages.find(message => (
      message.kind === 'extension' && message.event === 'message' && message.payload?.frame === 3
    ))
    if (!secondGuestRelay || secondGuestRelay.kind !== 'extension'
      || secondGuestRelay.sourceId === collidingGuestSourceId
      || secondGuestRelay.sourceId === relayedGuestMessage.sourceId) {
      throw new Error('expected the host to assign distinct connection-scoped relay identities')
    }

    guestA.sendMessage(buildExtensionMessage({
      sessionId,
      namespace: 'knowgrph.unregistered/v1',
      sourceId: collidingGuestSourceId,
    }))
    await new Promise(resolve => setTimeout(resolve, 40))
    if (guestB.receivedMessages.some(message => message.kind === 'extension' && message.namespace === 'knowgrph.unregistered/v1')) {
      throw new Error('expected an unregistered namespace to be dropped before relay')
    }

    guestA.disconnect()
    await waitForCondition(() => (
      events.some(event => event.kind === 'source-left' && event.sourceId === messageEvent.sourceId)
      && guestB.receivedMessages.some(message => (
        message.kind === 'extension'
        && message.event === 'source-left'
        && message.sourceId === relayedGuestMessage.sourceId
      ))
    ))
  } finally {
    unregister()
    await unmountReactRoot(root, { window: dom.window })
    resetCollaborationStore()
    MockRTCPeerConnection.reset()
    ;(dom.window as unknown as { RTCPeerConnection?: unknown }).RTCPeerConnection = previousWindowRtc
    ;(globalThis as typeof globalThis & { RTCPeerConnection?: unknown }).RTCPeerConnection = previousGlobalRtc
    restoreDom()
    restoreWindow()
  }
}
