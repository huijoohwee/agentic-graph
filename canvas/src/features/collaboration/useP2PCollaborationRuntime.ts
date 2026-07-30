import React from 'react'
import {
  parseP2PCollaborationWireMessage,
  readP2PInviteTokenFromLocation,
  P2P_COLLAB_PROTOCOL_VERSION,
  type P2PCollaborationWireMessage,
  type P2PCollaborationWirePeerRole,
} from './p2pCollaborationProtocol'
import {
  broadcastP2PCollaborationExtensionWireMessageToGuests,
  broadcastP2PCollaborationWireMessageToGuests,
  releaseP2PCollaborationExtensionConnection,
  resetP2PCollaborationExtensionSession,
  routeP2PCollaborationExtensionWireMessage,
  sendP2PCollaborationWireMessage,
} from './p2pCollaborationExtensionRuntime'
import { useP2PCollaborationStore } from './p2pCollaborationStore'
import { useP2PCollaborationBroadcastEffects } from './useP2PCollaborationBroadcastEffects'
import { useP2PCollaborationCommandEffect } from './useP2PCollaborationCommandEffect'
import {
  buildDocumentSignature,
  buildP2PCollaborationPeerRecord,
  buildPeerSummary,
  closeConnectionRef,
  countConnectedRemotePeers,
  notifyP2PCollaborationTransportTopologyChanged,
  resetRuntimeSessionRefs,
  resetSharedRuntimeRefs,
  sharedCurrentCaretLineRef,
  sharedCurrentDisplayNameRef,
  sharedCurrentDocumentKeyRef,
  sharedCurrentFollowModeRef,
  sharedCurrentFollowPeerIdRef,
  sharedCurrentTextRef,
  sharedLastCommandIdRef,
  sharedLastFollowRevealSigRef,
  sharedLastOutboundDocumentSigRef,
  sharedRuntimeRefs,
  sharedSuppressOutboundDocumentSigRef,
  snapshotP2PCollaborationPeer,
  type RuntimeConnectionRef,
  type UseP2PCollaborationRuntimeArgs,
} from './p2pCollaborationRuntimeState'

export function __resetP2PCollaborationRuntimeForTests(): void {
  resetP2PCollaborationExtensionSession()
  resetSharedRuntimeRefs()
}

export function useP2PCollaborationRuntime(args: UseP2PCollaborationRuntimeArgs): {
  onEditorCaretLine: (line: number) => void
} {
  const displayName = useP2PCollaborationStore(s => s.displayName)
  const inviteInput = useP2PCollaborationStore(s => s.inviteInput)
  const answerInput = useP2PCollaborationStore(s => s.answerInput)
  const followModeEnabled = useP2PCollaborationStore(s => s.followModeEnabled)
  const followPeerId = useP2PCollaborationStore(s => s.followPeerId)
  const localCaretLine = useP2PCollaborationStore(s => s.localCaretLine)
  const pendingCommand = useP2PCollaborationStore(s => s.pendingCommand)
  const seedInviteInputFromLocation = useP2PCollaborationStore(s => s.seedInviteInputFromLocation)
  const setLocalCaretLine = useP2PCollaborationStore(s => s.setLocalCaretLine)
  const setSessionState = useP2PCollaborationStore(s => s.setSessionState)
  const upsertPeer = useP2PCollaborationStore(s => s.upsertPeer)
  const replacePeers = useP2PCollaborationStore(s => s.replacePeers)
  const removePeer = useP2PCollaborationStore(s => s.removePeer)
  const setRuntimeStatus = useP2PCollaborationStore(s => s.setRuntimeStatus)
  const setRuntimeError = useP2PCollaborationStore(s => s.setRuntimeError)
  const resetSession = useP2PCollaborationStore(s => s.resetSession)

  const runtimeRefs = sharedRuntimeRefs
  const lastCommandIdRef = sharedLastCommandIdRef
  const currentDocumentKeyRef = sharedCurrentDocumentKeyRef
  const currentTextRef = sharedCurrentTextRef
  const currentDisplayNameRef = sharedCurrentDisplayNameRef
  const currentFollowModeRef = sharedCurrentFollowModeRef
  const currentFollowPeerIdRef = sharedCurrentFollowPeerIdRef
  const currentCaretLineRef = sharedCurrentCaretLineRef
  const suppressOutboundDocumentSigRef = sharedSuppressOutboundDocumentSigRef
  const lastOutboundDocumentSigRef = sharedLastOutboundDocumentSigRef
  const lastFollowRevealSigRef = sharedLastFollowRevealSigRef

  React.useEffect(() => {
    currentDocumentKeyRef.current = String(args.activeDocumentKey || '').trim()
    currentTextRef.current = String(args.activeText || '')
    currentDisplayNameRef.current = String(displayName || '').trim() || 'Peer'
    currentFollowModeRef.current = followModeEnabled
    currentFollowPeerIdRef.current = String(followPeerId || '').trim() || null
    currentCaretLineRef.current = typeof localCaretLine === 'number' && Number.isFinite(localCaretLine)
      ? Math.max(1, Math.floor(localCaretLine))
      : null
  }, [args.activeDocumentKey, args.activeText, currentCaretLineRef, currentDisplayNameRef, currentDocumentKeyRef, currentFollowModeRef, currentFollowPeerIdRef, currentTextRef, displayName, followModeEnabled, followPeerId, localCaretLine])

  const buildLocalOwnership = React.useCallback((): P2PCollaborationWirePeerRole => {
    const runtime = runtimeRefs.current
    return runtime.localPeerId && runtime.localPeerId === runtime.ownerPeerId ? 'owner' : 'guest'
  }, [runtimeRefs])

  const ensureLocalPeer = React.useCallback((connectionState: 'connecting' | 'connected') => {
    const runtime = runtimeRefs.current
    if (!runtime.localPeerId) return
    upsertPeer(buildP2PCollaborationPeerRecord({
      peerId: runtime.localPeerId,
      displayName: currentDisplayNameRef.current || 'Peer',
      documentKey: currentDocumentKeyRef.current,
      caretLine: currentCaretLineRef.current,
      connectedAt: runtime.localConnectedAt || Date.now(),
      lastSeenAt: Date.now(),
      ownership: buildLocalOwnership(),
      isLocal: true,
      connectionState,
    }))
  }, [buildLocalOwnership, currentCaretLineRef, currentDisplayNameRef, currentDocumentKeyRef, runtimeRefs, upsertPeer])

  const broadcastToGuests = React.useCallback((message: P2PCollaborationWireMessage, excludedPeerId?: string | null) => {
    broadcastP2PCollaborationWireMessageToGuests(runtimeRefs.current, message, excludedPeerId)
  }, [runtimeRefs])

  const broadcastRosterToGuests = React.useCallback(() => {
    const runtime = runtimeRefs.current
    if (runtime.role !== 'host' || !runtime.sessionId || !runtime.ownerPeerId) return
    const peers = useP2PCollaborationStore.getState().peers
      .filter(peer => peer.connectionState === 'connected' || peer.isLocal)
      .map(snapshotP2PCollaborationPeer)
    broadcastToGuests({
      v: P2P_COLLAB_PROTOCOL_VERSION,
      kind: 'session-roster',
      sessionId: runtime.sessionId,
      ownerPeerId: runtime.ownerPeerId,
      peers,
      sentAt: Date.now(),
    })
  }, [broadcastToGuests, runtimeRefs])

  const updateHostStatus = React.useCallback((fallback: string = 'Host ready. Generate an invite.', options?: { forceStatusText?: string }) => {
    const peers = useP2PCollaborationStore.getState().peers
    const connectedCount = countConnectedRemotePeers(peers)
    const forcedStatusText = String(options?.forceStatusText || '').trim()
    setSessionState({
      role: 'host',
      phase: connectedCount > 0 ? 'connected' : 'connected',
      statusText: forcedStatusText || (connectedCount > 0 ? buildPeerSummary(peers) : fallback),
      errorText: '',
    })
  }, [setSessionState])

  const disconnectRuntime = React.useCallback((statusText: string = 'Disconnected') => {
    const runtime = runtimeRefs.current
    resetP2PCollaborationExtensionSession()
    resetRuntimeSessionRefs(runtime)
    suppressOutboundDocumentSigRef.current = null
    lastOutboundDocumentSigRef.current = null
    lastFollowRevealSigRef.current = null
    resetSession(statusText)
  }, [lastFollowRevealSigRef, lastOutboundDocumentSigRef, resetSession, runtimeRefs, suppressOutboundDocumentSigRef])

  const handleHostPeerDisconnect = React.useCallback((peerId: string, statusText: string) => {
    const runtime = runtimeRefs.current
    const connectionRef = runtime.hostConnectionsByPeerId.get(peerId) || null
    const extensionCleanupMessages = releaseP2PCollaborationExtensionConnection(connectionRef, runtime.sessionId)
    if (connectionRef) {
      closeConnectionRef(connectionRef, { suppressEvents: true })
      runtime.hostConnectionsByPeerId.delete(peerId)
      notifyP2PCollaborationTransportTopologyChanged()
    }
    extensionCleanupMessages.forEach(message => broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, message))
    removePeer(peerId)
    broadcastRosterToGuests()
    updateHostStatus(statusText)
  }, [broadcastRosterToGuests, removePeer, runtimeRefs, updateHostStatus])

  const handleGuestOwnerDisconnect = React.useCallback((statusText: string = 'Session owner disconnected') => {
    disconnectRuntime(statusText)
  }, [disconnectRuntime])

  const removeHostPeerByOwner = React.useCallback((peerId: string) => {
    const normalizedPeerId = String(peerId || '').trim()
    if (!normalizedPeerId) return
    const runtime = runtimeRefs.current
    if (runtime.role !== 'host') return
    const connectionRef = runtime.hostConnectionsByPeerId.get(normalizedPeerId) || null
    if (!connectionRef) {
      removePeer(normalizedPeerId)
      broadcastRosterToGuests()
      updateHostStatus(buildPeerSummary(useP2PCollaborationStore.getState().peers))
      return
    }
    const extensionCleanupMessages = releaseP2PCollaborationExtensionConnection(connectionRef, runtime.sessionId)
    runtime.hostConnectionsByPeerId.delete(normalizedPeerId)
    notifyP2PCollaborationTransportTopologyChanged()
    closeConnectionRef(connectionRef, { suppressEvents: true })
    extensionCleanupMessages.forEach(message => broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, message))
    removePeer(normalizedPeerId)
    broadcastRosterToGuests()
    updateHostStatus('Host ready. Generate an invite.', { forceStatusText: `Removed ${connectionRef.displayName || 'guest'}` })
  }, [broadcastRosterToGuests, removePeer, runtimeRefs, updateHostStatus])

  const sendHelloToConnection = React.useCallback((connectionRef: RuntimeConnectionRef | null) => {
    const runtime = runtimeRefs.current
    if (!runtime.sessionId || !runtime.localPeerId) return
    sendP2PCollaborationWireMessage(connectionRef, {
      v: P2P_COLLAB_PROTOCOL_VERSION,
      kind: 'hello',
      sessionId: runtime.sessionId,
      peerId: runtime.localPeerId,
      displayName: currentDisplayNameRef.current || 'Peer',
      documentKey: currentDocumentKeyRef.current,
      caretLine: currentCaretLineRef.current,
      ownership: buildLocalOwnership(),
      sentAt: Date.now(),
    })
  }, [
    buildLocalOwnership,
    currentCaretLineRef,
    currentDisplayNameRef,
    currentDocumentKeyRef,
    runtimeRefs,
  ])

  const sendPresenceToConnection = React.useCallback((connectionRef: RuntimeConnectionRef | null) => {
    const runtime = runtimeRefs.current
    if (!runtime.sessionId || !runtime.localPeerId) return
    sendP2PCollaborationWireMessage(connectionRef, {
      v: P2P_COLLAB_PROTOCOL_VERSION,
      kind: 'presence',
      sessionId: runtime.sessionId,
      peerId: runtime.localPeerId,
      displayName: currentDisplayNameRef.current || 'Peer',
      documentKey: currentDocumentKeyRef.current,
      caretLine: currentCaretLineRef.current,
      ownership: buildLocalOwnership(),
      sentAt: Date.now(),
    })
  }, [
    buildLocalOwnership,
    currentCaretLineRef,
    currentDisplayNameRef,
    currentDocumentKeyRef,
    runtimeRefs,
  ])

  const sendDocumentToConnection = React.useCallback((connectionRef: RuntimeConnectionRef | null) => {
    const runtime = runtimeRefs.current
    if (!runtime.sessionId || !runtime.localPeerId) return
    const documentKey = currentDocumentKeyRef.current
    if (!documentKey) return
    const text = currentTextRef.current
    const documentSignature = buildDocumentSignature(documentKey, text)
    lastOutboundDocumentSigRef.current = documentSignature
    sendP2PCollaborationWireMessage(connectionRef, {
      v: P2P_COLLAB_PROTOCOL_VERSION,
      kind: 'document-sync',
      sessionId: runtime.sessionId,
      peerId: runtime.localPeerId,
      documentKey,
      text,
      textHash: documentSignature.split('|').slice(1).join('|'),
      sentAt: Date.now(),
    })
  }, [
    currentDocumentKeyRef,
    currentTextRef,
    lastOutboundDocumentSigRef,
    runtimeRefs,
  ])

  const broadcastLocalHello = React.useCallback(() => {
    const runtime = runtimeRefs.current
    if (runtime.role === 'guest') {
      sendHelloToConnection(runtime.guestConnection)
      return
    }
    if (runtime.role === 'host') {
      for (const connectionRef of runtime.hostConnectionsByPeerId.values()) {
        sendHelloToConnection(connectionRef)
      }
    }
  }, [runtimeRefs, sendHelloToConnection])

  const broadcastLocalPresence = React.useCallback(() => {
    const runtime = runtimeRefs.current
    if (runtime.role === 'guest') {
      sendPresenceToConnection(runtime.guestConnection)
      return
    }
    if (runtime.role === 'host') {
      for (const connectionRef of runtime.hostConnectionsByPeerId.values()) {
        sendPresenceToConnection(connectionRef)
      }
    }
  }, [runtimeRefs, sendPresenceToConnection])

  const broadcastLocalDocument = React.useCallback(() => {
    const runtime = runtimeRefs.current
    if (runtime.role === 'guest') {
      sendDocumentToConnection(runtime.guestConnection)
      return
    }
    if (runtime.role === 'host') {
      for (const connectionRef of runtime.hostConnectionsByPeerId.values()) {
        sendDocumentToConnection(connectionRef)
      }
    }
  }, [runtimeRefs, sendDocumentToConnection])

  const applyRemoteRoster = React.useCallback((message: Extract<P2PCollaborationWireMessage, { kind: 'session-roster' }>) => {
    const runtime = runtimeRefs.current
    runtime.ownerPeerId = message.ownerPeerId
    const peers = message.peers.map(peer => buildP2PCollaborationPeerRecord({
      peerId: peer.peerId,
      displayName: peer.displayName,
      documentKey: peer.documentKey,
      caretLine: peer.caretLine,
      connectedAt: peer.connectedAt,
      lastSeenAt: peer.lastSeenAt,
      ownership: peer.ownership,
      isLocal: peer.peerId === runtime.localPeerId,
      connectionState: 'connected',
    }))
    replacePeers(peers)
    setSessionState({
      ownerPeerId: message.ownerPeerId,
      role: runtime.role === 'idle' ? 'guest' : runtime.role,
      phase: 'connected',
      statusText: `Peers in session: ${message.peers.length}`,
      errorText: '',
    })
  }, [replacePeers, runtimeRefs, setSessionState])

  const maybeRevealFollowPeer = React.useCallback((message: Extract<P2PCollaborationWireMessage, { kind: 'hello' | 'presence' }>) => {
    if (!currentFollowModeRef.current || message.caretLine == null) return
    const selectedPeerId = currentFollowPeerIdRef.current
    if (!selectedPeerId || selectedPeerId !== message.peerId) return
    if (message.documentKey !== currentDocumentKeyRef.current) return
    const revealSig = `${message.peerId}|${message.documentKey}|${message.caretLine}`
    if (lastFollowRevealSigRef.current === revealSig) return
    lastFollowRevealSigRef.current = revealSig
    args.revealRemoteLine(message.caretLine)
  }, [args, currentDocumentKeyRef, currentFollowModeRef, currentFollowPeerIdRef, lastFollowRevealSigRef])

  const applyRemotePresence = React.useCallback((message: Extract<P2PCollaborationWireMessage, { kind: 'hello' | 'presence' }>) => {
    const runtime = runtimeRefs.current
    const existingPeer = useP2PCollaborationStore.getState().peers.find(peer => peer.peerId === message.peerId)
    upsertPeer(buildP2PCollaborationPeerRecord({
      peerId: message.peerId,
      displayName: message.displayName,
      documentKey: message.documentKey,
      caretLine: message.caretLine,
      connectedAt: existingPeer?.connectedAt || Date.now(),
      lastSeenAt: Date.now(),
      ownership: message.ownership,
      isLocal: message.peerId === runtime.localPeerId,
      connectionState: 'connected',
    }))
    maybeRevealFollowPeer(message)
  }, [maybeRevealFollowPeer, runtimeRefs, upsertPeer])

  const applyRemoteDocument = React.useCallback(async (message: Extract<P2PCollaborationWireMessage, { kind: 'document-sync' }>) => {
    const runtime = runtimeRefs.current
    const documentSignature = buildDocumentSignature(message.documentKey, message.text)
    const currentSignature = buildDocumentSignature(currentDocumentKeyRef.current, currentTextRef.current)
    const existingPeer = useP2PCollaborationStore.getState().peers.find(peer => peer.peerId === message.peerId)
    if (existingPeer) {
      upsertPeer({
        ...existingPeer,
        documentKey: message.documentKey,
        lastSeenAt: Date.now(),
        connectionState: 'connected',
      })
    }
    if (runtime.role === 'host') {
      broadcastToGuests(message, message.peerId)
    }
    if (documentSignature === currentSignature) return
    suppressOutboundDocumentSigRef.current = documentSignature
    await args.applyRemoteDocument({ documentKey: message.documentKey, text: message.text })
  }, [
    args,
    broadcastToGuests,
    currentDocumentKeyRef,
    currentTextRef,
    runtimeRefs,
    suppressOutboundDocumentSigRef,
    upsertPeer,
  ])

  const attachChannel = React.useCallback((connectionRef: RuntimeConnectionRef, channel: RTCDataChannel) => {
    connectionRef.channel = channel
    channel.onopen = () => {
      const runtime = runtimeRefs.current
      connectionRef.connectedAt = connectionRef.connectedAt || Date.now()
      connectionRef.lastSeenAt = Date.now()
      ensureLocalPeer('connected')
      if (runtime.role === 'host' && connectionRef.peerId) {
        upsertPeer(buildP2PCollaborationPeerRecord({
          peerId: connectionRef.peerId,
          displayName: connectionRef.displayName,
          documentKey: currentDocumentKeyRef.current,
          caretLine: null,
          connectedAt: connectionRef.connectedAt,
          lastSeenAt: Date.now(),
          ownership: connectionRef.ownership,
          isLocal: false,
          connectionState: 'connected',
        }))
        updateHostStatus(buildPeerSummary(useP2PCollaborationStore.getState().peers))
        broadcastRosterToGuests()
      } else if (runtime.role === 'guest' && connectionRef.peerId) {
        upsertPeer(buildP2PCollaborationPeerRecord({
          peerId: connectionRef.peerId,
          displayName: connectionRef.displayName,
          documentKey: currentDocumentKeyRef.current,
          caretLine: null,
          connectedAt: connectionRef.connectedAt,
          lastSeenAt: Date.now(),
          ownership: connectionRef.ownership,
          isLocal: false,
          connectionState: 'connected',
        }))
        setSessionState({
          role: 'guest',
          phase: 'connected',
          statusText: 'Connected to session owner',
          errorText: '',
        })
      }
      notifyP2PCollaborationTransportTopologyChanged()
      sendHelloToConnection(connectionRef)
      sendDocumentToConnection(connectionRef)
      sendPresenceToConnection(connectionRef)
      if (runtime.role === 'host') broadcastRosterToGuests()
    }
    channel.onclose = () => {
      const runtime = runtimeRefs.current
      if (runtime.role === 'host' && connectionRef.peerId) {
        handleHostPeerDisconnect(connectionRef.peerId, `${connectionRef.displayName} disconnected`)
        return
      }
      handleGuestOwnerDisconnect(connectionRef.ownership === 'owner' ? 'Session owner disconnected' : 'Peer disconnected')
    }
    channel.onerror = () => {
      const runtime = runtimeRefs.current
      if (runtime.role === 'host') {
        setRuntimeStatus(`Peer channel error: ${connectionRef.displayName || 'guest'}`)
        return
      }
      setRuntimeError('Peer channel error')
    }
    channel.onmessage = event => {
      const runtime = runtimeRefs.current
      const message = parseP2PCollaborationWireMessage(String(event.data || ''))
      if (!message || message.sessionId !== runtime.sessionId) return
      if (message.kind === 'extension') {
        const routed = routeP2PCollaborationExtensionWireMessage(message, connectionRef, runtime.role)
        if (routed.relayMessage) broadcastP2PCollaborationExtensionWireMessageToGuests(runtime, routed.relayMessage, connectionRef.peerId)
        return
      }
      if (message.kind === 'session-roster') {
        if (runtime.role === 'guest') applyRemoteRoster(message)
        return
      }
      if (message.kind === 'hello' || message.kind === 'presence') {
        applyRemotePresence(message)
        if (runtime.role === 'host' && message.peerId !== runtime.localPeerId) {
          broadcastToGuests(message, message.peerId)
          if (message.kind === 'hello') broadcastRosterToGuests()
        }
        return
      }
      if (message.kind === 'document-sync') void applyRemoteDocument(message)
    }
  }, [
    applyRemoteDocument,
    applyRemotePresence,
    applyRemoteRoster,
    broadcastToGuests,
    broadcastRosterToGuests,
    currentDocumentKeyRef,
    ensureLocalPeer,
    handleGuestOwnerDisconnect,
    handleHostPeerDisconnect,
    runtimeRefs,
    sendDocumentToConnection,
    sendHelloToConnection,
    sendPresenceToConnection,
    setRuntimeError,
    setRuntimeStatus,
    setSessionState,
    updateHostStatus,
    upsertPeer,
  ])

  const bindConnectionLifecycle = React.useCallback((connectionRef: RuntimeConnectionRef) => {
    connectionRef.connection.onconnectionstatechange = () => {
      const state = connectionRef.connection.connectionState
      if (state === 'failed') {
        if (runtimeRefs.current.role === 'host' && connectionRef.peerId) {
          handleHostPeerDisconnect(connectionRef.peerId, `${connectionRef.displayName} failed`)
          return
        }
        if (runtimeRefs.current.role === 'guest' && connectionRef.ownership === 'owner') {
          handleGuestOwnerDisconnect('Session owner transport failed')
          return
        }
        setRuntimeError('Peer transport failed')
        return
      }
      if (state === 'disconnected' || state === 'closed') {
        if (runtimeRefs.current.role === 'host' && connectionRef.peerId) {
          handleHostPeerDisconnect(connectionRef.peerId, `${connectionRef.displayName} disconnected`)
          return
        }
        handleGuestOwnerDisconnect(connectionRef.ownership === 'owner' ? 'Session owner disconnected' : 'Peer disconnected')
      }
    }
    connectionRef.connection.ondatachannel = event => {
      attachChannel(connectionRef, event.channel)
    }
  }, [attachChannel, handleGuestOwnerDisconnect, handleHostPeerDisconnect, runtimeRefs, setRuntimeError])

  const closePendingHostInvite = React.useCallback(() => {
    const runtime = runtimeRefs.current
    if (!runtime.pendingHostInvite) return
    closeConnectionRef(runtime.pendingHostInvite, { suppressEvents: true })
    runtime.pendingHostInvite = null
  }, [runtimeRefs])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const inviteToken = readP2PInviteTokenFromLocation(window.location.href)
      if (inviteToken) seedInviteInputFromLocation(inviteToken)
    } catch {
      void 0
    }
  }, [seedInviteInputFromLocation])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handlePageHide = () => {
      disconnectRuntime('Idle')
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [disconnectRuntime])

  useP2PCollaborationCommandEffect({
    active: args.active,
    answerInput,
    inviteInput,
    pendingCommand,
    runtimeRefs,
    lastCommandIdRef,
    currentDocumentKeyRef,
    currentDisplayNameRef,
    attachChannel,
    bindConnectionLifecycle,
    closePendingHostInvite,
    disconnectRuntime,
    ensureLocalPeer,
    removeHostPeerByOwner,
    replacePeers,
    setRuntimeError,
    setRuntimeStatus,
    setSessionState,
    upsertPeer,
  })

  useP2PCollaborationBroadcastEffects({
    active: args.active,
    activeDocumentKey: args.activeDocumentKey,
    activeText: args.activeText,
    displayName,
    followPeerId,
    localCaretLine,
    runtimeRefs,
    suppressOutboundDocumentSigRef,
    lastOutboundDocumentSigRef,
    broadcastLocalDocument,
    broadcastLocalHello,
    broadcastLocalPresence,
    broadcastRosterToGuests,
    ensureLocalPeer,
  })

  const onEditorCaretLine = React.useCallback((line: number) => {
    setLocalCaretLine(line)
  }, [setLocalCaretLine])

  return { onEditorCaretLine }
}
