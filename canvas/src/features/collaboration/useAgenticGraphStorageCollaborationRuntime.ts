import React from 'react'
import { readKnowgrphStorageCanvasRoomConfig, buildKnowgrphStorageCanvasRoomWebSocketUrl } from '@/lib/storage/knowgrphStorageCanvasRoomClient'
import { useP2PCollaborationStore } from './p2pCollaborationStore'
import { buildDocumentSignature, buildP2PCollaborationPeerRecord, type UseP2PCollaborationRuntimeArgs } from './p2pCollaborationRuntimeState'

type RoomPeerPayload = {
  userId?: string
  displayName?: string
  role?: string
  joinedAt?: number
  caretLine?: number | null
}

type RoomMessage = Record<string, unknown> & {
  type?: string
}

const normalizeString = (value: unknown): string => String(value || '').trim()

const toOwnership = (role: unknown): 'owner' | 'guest' => {
  const normalized = normalizeString(role)
  return normalized === 'owner' || normalized === 'provider-admin' ? 'owner' : 'guest'
}

const toPeerRecord = (peer: RoomPeerPayload, localPeerId: string | null) => {
  const peerId = normalizeString(peer.userId)
  return buildP2PCollaborationPeerRecord({
    peerId,
    displayName: normalizeString(peer.displayName) || 'Collaborator',
    documentKey: '',
    caretLine: typeof peer.caretLine === 'number' && Number.isFinite(peer.caretLine) ? peer.caretLine : null,
    connectedAt: typeof peer.joinedAt === 'number' && Number.isFinite(peer.joinedAt) ? peer.joinedAt : Date.now(),
    lastSeenAt: Date.now(),
    ownership: toOwnership(peer.role),
    isLocal: !!localPeerId && peerId === localPeerId,
    connectionState: 'connected',
  })
}

const parseRoomMessage = (value: unknown): RoomMessage | null => {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RoomMessage
      : null
  } catch {
    return null
  }
}

export function useKnowgrphStorageCollaborationRuntime(args: UseP2PCollaborationRuntimeArgs): {
  onEditorCaretLine: (line: number) => void
} {
  const config = React.useMemo(() => readKnowgrphStorageCanvasRoomConfig(), [])
  const displayName = useP2PCollaborationStore(s => s.displayName)
  const followModeEnabled = useP2PCollaborationStore(s => s.followModeEnabled)
  const followPeerId = useP2PCollaborationStore(s => s.followPeerId)
  const localCaretLine = useP2PCollaborationStore(s => s.localCaretLine)
  const pendingCommand = useP2PCollaborationStore(s => s.pendingCommand)
  const setLocalCaretLine = useP2PCollaborationStore(s => s.setLocalCaretLine)
  const setSessionState = useP2PCollaborationStore(s => s.setSessionState)
  const upsertPeer = useP2PCollaborationStore(s => s.upsertPeer)
  const replacePeers = useP2PCollaborationStore(s => s.replacePeers)
  const removePeer = useP2PCollaborationStore(s => s.removePeer)
  const setRuntimeStatus = useP2PCollaborationStore(s => s.setRuntimeStatus)
  const setRuntimeError = useP2PCollaborationStore(s => s.setRuntimeError)
  const resetSession = useP2PCollaborationStore(s => s.resetSession)

  const activeDocumentKey = normalizeString(args.activeDocumentKey)
  const socketRef = React.useRef<WebSocket | null>(null)
  const lastHandledCommandIdRef = React.useRef(0)
  const localPeerIdRef = React.useRef<string | null>(null)
  const roomIdRef = React.useRef<string>('')
  const displayNameRef = React.useRef<string>('')
  const activeTextRef = React.useRef<string>('')
  const caretLineRef = React.useRef<number | null>(null)
  const followModeRef = React.useRef(false)
  const followPeerIdRef = React.useRef<string | null>(null)
  const lastInboundDocumentSigRef = React.useRef<string | null>(null)
  const lastOutboundDocumentSigRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    roomIdRef.current = activeDocumentKey
    displayNameRef.current = normalizeString(displayName) || 'Collaborator'
    activeTextRef.current = String(args.activeText || '')
    caretLineRef.current = typeof localCaretLine === 'number' && Number.isFinite(localCaretLine)
      ? Math.max(1, Math.floor(localCaretLine))
      : null
    followModeRef.current = followModeEnabled
    followPeerIdRef.current = normalizeString(followPeerId) || null
  }, [activeDocumentKey, args.activeText, displayName, followModeEnabled, followPeerId, localCaretLine])

  const disconnectRoom = React.useCallback((statusText: string = 'Disconnected') => {
    const socket = socketRef.current
    socketRef.current = null
    localPeerIdRef.current = null
    lastInboundDocumentSigRef.current = null
    lastOutboundDocumentSigRef.current = null
    if (socket) {
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      try {
        socket.close()
      } catch {
        void 0
      }
    }
    resetSession(statusText)
  }, [resetSession])

  const sendJson = React.useCallback((body: Record<string, unknown>): boolean => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    try {
      socket.send(JSON.stringify(body))
      return true
    } catch {
      return false
    }
  }, [])

  const sendPresence = React.useCallback(() => {
    return sendJson({
      type: 'presence.update',
      displayName: displayNameRef.current || 'Collaborator',
      caretLine: caretLineRef.current,
    })
  }, [sendJson])

  const sendDocument = React.useCallback(() => {
    const documentKey = roomIdRef.current
    if (!documentKey) return false
    const text = activeTextRef.current
    const nextSig = buildDocumentSignature(documentKey, text)
    if (lastInboundDocumentSigRef.current === nextSig || lastOutboundDocumentSigRef.current === nextSig) return false
    lastOutboundDocumentSigRef.current = nextSig
    return sendJson({
      type: 'document.sync',
      documentKey,
      text,
      sentAt: Date.now(),
    })
  }, [sendJson])

  const connectRoom = React.useCallback(() => {
    if (!config) {
      setRuntimeError('Authenticated collaboration room is not configured')
      return
    }
    if (!args.active) return
    const roomId = roomIdRef.current
    if (!roomId) {
      setRuntimeError('Open a document before connecting collaboration room')
      return
    }
    disconnectRoom('Idle')
    const socketUrl = buildKnowgrphStorageCanvasRoomWebSocketUrl(config, roomId)
    if (!socketUrl) {
      setRuntimeError('Invalid collaboration room URL')
      return
    }
    setSessionState({
      role: 'host',
      phase: 'connecting',
      statusText: 'Connecting workspace room...',
      errorText: '',
      sessionId: roomId,
      localPeerId: null,
      ownerPeerId: null,
      inviteInput: '',
      inviteToken: '',
      inviteUrl: '',
      answerInput: '',
      answerToken: '',
    })
    replacePeers([])
    const socket = new WebSocket(socketUrl)
    socketRef.current = socket
    socket.onopen = () => {
      setRuntimeStatus('Workspace room connected')
    }
    socket.onmessage = event => {
      const message = parseRoomMessage(event.data)
      if (!message) return
      if (message.type === 'room.connected') {
        const localPeer = (message.peer || null) as RoomPeerPayload | null
        const localPeerId = normalizeString(localPeer?.userId)
        localPeerIdRef.current = localPeerId || null
        setSessionState({
          role: 'host',
          phase: 'connected',
          statusText: 'Workspace room connected',
          errorText: '',
          sessionId: roomIdRef.current || null,
          localPeerId: localPeerId || null,
          ownerPeerId: toOwnership(localPeer?.role) === 'owner' ? localPeerId || null : null,
        })
        if (localPeerId) {
          upsertPeer({
            ...toPeerRecord(localPeer || {}, localPeerId),
            documentKey: roomIdRef.current,
          })
        }
        sendPresence()
        sendDocument()
        return
      }
      if (message.type === 'room.roster') {
        const peers = Array.isArray(message.peers) ? message.peers : []
        replacePeers(
          peers
            .map(peer => ({
              ...toPeerRecord((peer || {}) as RoomPeerPayload, localPeerIdRef.current),
              documentKey: roomIdRef.current,
            }))
            .filter(peer => !!peer.peerId),
        )
        return
      }
      if (message.type === 'peer.joined' || message.type === 'presence.updated') {
        const peer = {
          ...toPeerRecord((message.peer || {}) as RoomPeerPayload, localPeerIdRef.current),
          documentKey: roomIdRef.current,
        }
        if (!peer.peerId) return
        upsertPeer(peer)
        if (followModeRef.current && followPeerIdRef.current === peer.peerId && peer.caretLine != null) {
          args.revealRemoteLine(peer.caretLine)
        }
        return
      }
      if (message.type === 'peer.left') {
        const peer = (message.peer || {}) as RoomPeerPayload
        removePeer(normalizeString(peer.userId))
        return
      }
      if (message.type === 'document.synced') {
        const peerId = normalizeString(message.peerId)
        const documentKey = normalizeString(message.documentKey)
        const text = String(message.text || '')
        if (!peerId || !documentKey || peerId === localPeerIdRef.current) return
        const nextSig = buildDocumentSignature(documentKey, text)
        if (nextSig === buildDocumentSignature(roomIdRef.current, activeTextRef.current)) return
        lastInboundDocumentSigRef.current = nextSig
        lastOutboundDocumentSigRef.current = null
        void Promise.resolve(args.applyRemoteDocument({ documentKey, text })).catch(() => {
          setRuntimeError('Failed to apply remote collaboration document')
        })
        return
      }
      if (message.type === 'error') {
        const detail = normalizeString(message.error) || 'Collaboration room error'
        setRuntimeError(detail)
      }
    }
    socket.onerror = () => {
      setRuntimeError('Collaboration room connection failed')
    }
    socket.onclose = () => {
      if (socketRef.current !== socket) return
      disconnectRoom('Room disconnected')
    }
  }, [args, config, disconnectRoom, removePeer, replacePeers, sendDocument, sendPresence, setRuntimeError, setRuntimeStatus, setSessionState, upsertPeer])

  React.useEffect(() => {
    if (!args.active) {
      disconnectRoom('Idle')
      return
    }
    const command = pendingCommand
    if (!command || command.id <= lastHandledCommandIdRef.current) return
    lastHandledCommandIdRef.current = command.id
    if (command.kind === 'disconnect') {
      disconnectRoom('Disconnected')
      return
    }
    if (command.kind === 'start-host') {
      connectRoom()
      return
    }
    if (command.kind === 'join-invite' || command.kind === 'apply-answer' || command.kind === 'remove-peer') {
      setRuntimeError('Invite-token collaboration is retired when authenticated room transport is enabled')
    }
  }, [args.active, connectRoom, disconnectRoom, pendingCommand, setRuntimeError])

  React.useEffect(() => {
    const socket = socketRef.current
    if (!args.active || !socket || socket.readyState !== WebSocket.OPEN) return
    sendPresence()
  }, [args.active, followModeEnabled, localCaretLine, displayName, sendPresence])

  React.useEffect(() => {
    const socket = socketRef.current
    if (!args.active || !socket || socket.readyState !== WebSocket.OPEN) return
    sendDocument()
  }, [args.active, args.activeText, activeDocumentKey, sendDocument])

  React.useEffect(() => {
    if (!args.active) return
    const socket = socketRef.current
    const activeRoomId = roomIdRef.current
    const connectedRoomId = normalizeString(useP2PCollaborationStore.getState().sessionId)
    if (!socket || !activeRoomId || !connectedRoomId || activeRoomId === connectedRoomId) return
    connectRoom()
  }, [activeDocumentKey, args.active, connectRoom])

  React.useEffect(() => {
    return () => {
      disconnectRoom('Idle')
    }
  }, [disconnectRoom])

  return {
    onEditorCaretLine: (line: number) => {
      const nextLine = Number.isFinite(line) ? Math.max(1, Math.floor(line)) : null
      setLocalCaretLine(nextLine)
    },
  }
}
