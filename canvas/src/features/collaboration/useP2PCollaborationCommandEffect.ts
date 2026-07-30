import React from 'react'
import {
  buildP2PInviteUrl,
  encodeP2PAnswerPayload,
  encodeP2PInvitePayload,
  parseP2PAnswerInput,
  parseP2PInviteInput,
  P2P_COLLAB_PROTOCOL_VERSION,
} from './p2pCollaborationProtocol'
import { useP2PCollaborationStore, type P2PCollaborationCommand } from './p2pCollaborationStore'
import {
  buildP2PCollaborationPeerRecord,
  createPeerConnection,
  generatePeerId,
  notifyP2PCollaborationTransportTopologyChanged,
  supportsWebRtc,
  waitForIceGatheringComplete,
  type MutableRefValue,
  type RuntimeConnectionRef,
  type RuntimeSessionRefs,
} from './p2pCollaborationRuntimeState'

type StoreState = ReturnType<typeof useP2PCollaborationStore.getState>

type UseP2PCollaborationCommandEffectArgs = {
  active: boolean
  answerInput: string
  inviteInput: string
  pendingCommand: P2PCollaborationCommand | null
  runtimeRefs: MutableRefValue<RuntimeSessionRefs>
  lastCommandIdRef: MutableRefValue<number>
  currentDocumentKeyRef: MutableRefValue<string>
  currentDisplayNameRef: MutableRefValue<string>
  attachChannel: (connectionRef: RuntimeConnectionRef, channel: RTCDataChannel) => void
  bindConnectionLifecycle: (connectionRef: RuntimeConnectionRef) => void
  closePendingHostInvite: () => void
  disconnectRuntime: (statusText?: string) => void
  ensureLocalPeer: (connectionState: 'connecting' | 'connected') => void
  removeHostPeerByOwner: (peerId: string) => void
  replacePeers: StoreState['replacePeers']
  setRuntimeError: StoreState['setRuntimeError']
  setRuntimeStatus: StoreState['setRuntimeStatus']
  setSessionState: StoreState['setSessionState']
  upsertPeer: StoreState['upsertPeer']
}

export function useP2PCollaborationCommandEffect(args: UseP2PCollaborationCommandEffectArgs): void {
  React.useEffect(() => {
    if (!args.active) return
    const pendingCommand = args.pendingCommand
    if (!pendingCommand || pendingCommand.id <= args.lastCommandIdRef.current) return
    args.lastCommandIdRef.current = pendingCommand.id
    if (!supportsWebRtc()) {
      args.setRuntimeError('WebRTC is not available in this browser')
      return
    }

    if (pendingCommand.kind === 'disconnect') {
      args.disconnectRuntime('Disconnected')
      return
    }

    if (pendingCommand.kind === 'remove-peer') {
      args.removeHostPeerByOwner(pendingCommand.peerId || '')
      return
    }

    if (pendingCommand.kind === 'start-host') {
      void startHostSession(args).catch(err => {
        const message = err instanceof Error ? err.message : 'Failed to prepare collaboration invite'
        args.setRuntimeError(message)
      })
      return
    }

    if (pendingCommand.kind === 'join-invite') {
      void joinInvite(args).catch(err => {
        const message = err instanceof Error ? err.message : 'Failed to join collaboration invite'
        args.setRuntimeError(message)
      })
      return
    }

    if (pendingCommand.kind === 'apply-answer') {
      void applyGuestAnswer(args).catch(err => {
        const message = err instanceof Error ? err.message : 'Failed to apply collaboration answer'
        args.setRuntimeError(message)
      })
    }
  }, [
    args,
    args.active,
    args.answerInput,
    args.inviteInput,
    args.pendingCommand,
  ])
}

async function startHostSession(args: UseP2PCollaborationCommandEffectArgs): Promise<void> {
  const runtime = args.runtimeRefs.current
  if (runtime.role !== 'host' || !runtime.sessionId || !runtime.localPeerId || !runtime.ownerPeerId) {
    args.disconnectRuntime('Idle')
    runtime.role = 'host'
    runtime.sessionId = generatePeerId()
    runtime.localPeerId = generatePeerId()
    runtime.ownerPeerId = runtime.localPeerId
    runtime.localConnectedAt = Date.now()
    runtime.guestConnection = null
    runtime.pendingHostInvite = null
    runtime.hostConnectionsByPeerId.clear()
    args.replacePeers([])
  } else {
    args.closePendingHostInvite()
  }
  args.ensureLocalPeer('connected')
  args.setSessionState({
    role: 'host',
    phase: 'preparing-invite',
    statusText: 'Preparing invite...',
    errorText: '',
    sessionId: runtime.sessionId,
    localPeerId: runtime.localPeerId,
    ownerPeerId: runtime.ownerPeerId,
    inviteToken: '',
    inviteUrl: '',
    answerToken: '',
    answerInput: '',
  })
  const inviteId = generatePeerId()
  const connectionRef: RuntimeConnectionRef = {
    inviteId,
    peerId: null,
    displayName: '',
    ownership: 'guest',
    connection: createPeerConnection(),
    channel: null,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
  }
  args.bindConnectionLifecycle(connectionRef)
  const channel = connectionRef.connection.createDataChannel('kg-collab', { ordered: true })
  args.attachChannel(connectionRef, channel)
  runtime.pendingHostInvite = connectionRef
  const offer = await connectionRef.connection.createOffer()
  await connectionRef.connection.setLocalDescription(offer)
  await waitForIceGatheringComplete(connectionRef.connection)
  const localDescription = connectionRef.connection.localDescription
  if (!localDescription || !runtime.sessionId || !runtime.localPeerId || !runtime.ownerPeerId) {
    args.setRuntimeError('Failed to generate collaboration invite')
    return
  }
  const inviteToken = encodeP2PInvitePayload({
    v: P2P_COLLAB_PROTOCOL_VERSION,
    kind: 'invite',
    inviteId,
    sessionId: runtime.sessionId,
    ownerPeerId: runtime.ownerPeerId,
    hostPeerId: runtime.localPeerId,
    hostDisplayName: args.currentDisplayNameRef.current || 'Peer',
    documentKey: args.currentDocumentKeyRef.current,
    offer: { type: localDescription.type, sdp: localDescription.sdp || '' },
    createdAt: Date.now(),
  })
  const inviteUrl = typeof window !== 'undefined'
    ? buildP2PInviteUrl(inviteToken, window.location.href)
    : inviteToken
  args.setSessionState({
    role: 'host',
    phase: 'awaiting-answer',
    statusText: 'Invite ready. Waiting for guest answer...',
    errorText: '',
    sessionId: runtime.sessionId,
    localPeerId: runtime.localPeerId,
    ownerPeerId: runtime.ownerPeerId,
    inviteToken,
    inviteUrl,
  })
}

async function joinInvite(args: UseP2PCollaborationCommandEffectArgs): Promise<void> {
  args.disconnectRuntime('Idle')
  const invitePayload = parseP2PInviteInput(args.inviteInput)
  const runtime = args.runtimeRefs.current
  runtime.role = 'guest'
  runtime.sessionId = invitePayload.sessionId
  runtime.localPeerId = generatePeerId()
  runtime.ownerPeerId = invitePayload.ownerPeerId
  runtime.localConnectedAt = Date.now()
  args.replacePeers([])
  args.ensureLocalPeer('connecting')
  args.upsertPeer(buildP2PCollaborationPeerRecord({
    peerId: invitePayload.hostPeerId,
    displayName: invitePayload.hostDisplayName,
    documentKey: invitePayload.documentKey,
    caretLine: null,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    ownership: 'owner',
    isLocal: false,
    connectionState: 'connecting',
  }))
  args.setSessionState({
    role: 'guest',
    phase: 'preparing-answer',
    statusText: 'Preparing guest answer...',
    errorText: '',
    sessionId: invitePayload.sessionId,
    localPeerId: runtime.localPeerId,
    ownerPeerId: invitePayload.ownerPeerId,
    answerToken: '',
    inviteToken: '',
    inviteUrl: '',
  })
  const connectionRef: RuntimeConnectionRef = {
    inviteId: invitePayload.inviteId,
    peerId: invitePayload.hostPeerId,
    displayName: invitePayload.hostDisplayName,
    ownership: 'owner',
    connection: createPeerConnection(),
    channel: null,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
  }
  args.bindConnectionLifecycle(connectionRef)
  runtime.guestConnection = connectionRef
  notifyP2PCollaborationTransportTopologyChanged()
  await connectionRef.connection.setRemoteDescription(invitePayload.offer)
  const answer = await connectionRef.connection.createAnswer()
  await connectionRef.connection.setLocalDescription(answer)
  await waitForIceGatheringComplete(connectionRef.connection)
  const localDescription = connectionRef.connection.localDescription
  if (!localDescription || !runtime.localPeerId) {
    args.setRuntimeError('Failed to generate collaboration answer')
    return
  }
  const answerToken = encodeP2PAnswerPayload({
    v: P2P_COLLAB_PROTOCOL_VERSION,
    kind: 'answer',
    inviteId: invitePayload.inviteId,
    sessionId: invitePayload.sessionId,
    ownerPeerId: invitePayload.ownerPeerId,
    guestPeerId: runtime.localPeerId,
    guestDisplayName: args.currentDisplayNameRef.current || 'Peer',
    answer: { type: localDescription.type, sdp: localDescription.sdp || '' },
    createdAt: Date.now(),
  })
  args.setSessionState({
    role: 'guest',
    phase: 'awaiting-host',
    statusText: 'Answer ready. Send it back to the host.',
    errorText: '',
    sessionId: invitePayload.sessionId,
    localPeerId: runtime.localPeerId,
    ownerPeerId: invitePayload.ownerPeerId,
    answerToken,
  })
}

async function applyGuestAnswer(args: UseP2PCollaborationCommandEffectArgs): Promise<void> {
  const runtime = args.runtimeRefs.current
  const pendingInvite = runtime.pendingHostInvite
  if (!pendingInvite || runtime.role !== 'host' || !runtime.sessionId || !runtime.ownerPeerId) {
    args.setRuntimeError('Generate a host invite before applying a guest answer')
    return
  }
  const answerPayload = parseP2PAnswerInput(args.answerInput)
  if (
    answerPayload.sessionId !== runtime.sessionId
    || answerPayload.ownerPeerId !== runtime.ownerPeerId
    || answerPayload.inviteId !== pendingInvite.inviteId
  ) {
    args.setRuntimeError('Guest answer does not match the current invite')
    return
  }
  pendingInvite.peerId = answerPayload.guestPeerId
  pendingInvite.displayName = answerPayload.guestDisplayName
  runtime.hostConnectionsByPeerId.set(answerPayload.guestPeerId, pendingInvite)
  notifyP2PCollaborationTransportTopologyChanged()
  runtime.pendingHostInvite = null
  args.upsertPeer(buildP2PCollaborationPeerRecord({
    peerId: answerPayload.guestPeerId,
    displayName: answerPayload.guestDisplayName,
    documentKey: args.currentDocumentKeyRef.current,
    caretLine: null,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    ownership: 'guest',
    isLocal: false,
    connectionState: 'connecting',
  }))
  args.setSessionState({
    role: 'host',
    phase: 'connecting',
    statusText: 'Applying guest answer...',
    errorText: '',
    inviteToken: '',
    inviteUrl: '',
    answerInput: '',
  })
  await pendingInvite.connection.setRemoteDescription(answerPayload.answer)
  args.setRuntimeStatus('Guest answer applied. Waiting for peer channel...')
}
