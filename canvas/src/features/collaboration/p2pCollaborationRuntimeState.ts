import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import type {
  P2PCollaborationPeerSnapshot,
  P2PCollaborationRole,
  P2PCollaborationWirePeerRole,
} from './p2pCollaborationProtocol'
import type { P2PCollaborationRemotePeer } from './p2pCollaborationStore'

export type UseP2PCollaborationRuntimeArgs = {
  active: boolean
  activeDocumentKey: string
  activeText: string
  applyRemoteDocument: (args: { documentKey: string; text: string }) => Promise<void> | void
  revealRemoteLine: (line: number) => void
}

export type RuntimeConnectionRef = {
  inviteId: string | null
  peerId: string | null
  displayName: string
  ownership: P2PCollaborationWirePeerRole
  connection: RTCPeerConnection
  channel: RTCDataChannel | null
  connectedAt: number
  lastSeenAt: number
}

export type RuntimeSessionRefs = {
  role: P2PCollaborationRole
  sessionId: string | null
  localPeerId: string | null
  ownerPeerId: string | null
  localConnectedAt: number | null
  guestConnection: RuntimeConnectionRef | null
  pendingHostInvite: RuntimeConnectionRef | null
  hostConnectionsByPeerId: Map<string, RuntimeConnectionRef>
}

export type MutableRefValue<T> = { current: T }

type PeerRecordArgs = {
  peerId: string
  displayName: string
  documentKey?: string
  caretLine?: number | null
  connectedAt?: number
  lastSeenAt?: number
  ownership: P2PCollaborationWirePeerRole
  isLocal: boolean
  connectionState: 'invited' | 'connecting' | 'connected'
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

function createInitialRuntimeSessionRefs(): RuntimeSessionRefs {
  return {
    role: 'idle',
    sessionId: null,
    localPeerId: null,
    ownerPeerId: null,
    localConnectedAt: null,
    guestConnection: null,
    pendingHostInvite: null,
    hostConnectionsByPeerId: new Map<string, RuntimeConnectionRef>(),
  }
}

const transportTopologyListeners = new Set<() => void>()

export function subscribeP2PCollaborationTransportTopology(listener: () => void): () => void {
  transportTopologyListeners.add(listener)
  return () => transportTopologyListeners.delete(listener)
}

export function notifyP2PCollaborationTransportTopologyChanged(): void {
  for (const listener of transportTopologyListeners) {
    try {
      listener()
    } catch {
      console.error('[knowgrph] collaboration transport topology listener failed')
    }
  }
}

export function closeConnectionRef(connectionRef: RuntimeConnectionRef | null, options?: { suppressEvents?: boolean }): void {
  if (!connectionRef) return
  if (options?.suppressEvents) {
    try {
      if (connectionRef.channel) {
        connectionRef.channel.onopen = null
        connectionRef.channel.onclose = null
        connectionRef.channel.onerror = null
        connectionRef.channel.onmessage = null
      }
      connectionRef.connection.onconnectionstatechange = null
      connectionRef.connection.ondatachannel = null
    } catch {
      void 0
    }
  }
  try {
    connectionRef.channel?.close()
  } catch {
    void 0
  }
  try {
    connectionRef.connection.close()
  } catch {
    void 0
  }
}

export function resetRuntimeSessionRefs(runtime: RuntimeSessionRefs): void {
  closeConnectionRef(runtime.guestConnection, { suppressEvents: true })
  closeConnectionRef(runtime.pendingHostInvite, { suppressEvents: true })
  runtime.hostConnectionsByPeerId.forEach(connectionRef => closeConnectionRef(connectionRef, { suppressEvents: true }))
  runtime.role = 'idle'
  runtime.sessionId = null
  runtime.localPeerId = null
  runtime.ownerPeerId = null
  runtime.localConnectedAt = null
  runtime.guestConnection = null
  runtime.pendingHostInvite = null
  runtime.hostConnectionsByPeerId.clear()
  notifyP2PCollaborationTransportTopologyChanged()
}

export const sharedRuntimeRefs: MutableRefValue<RuntimeSessionRefs> = {
  current: createInitialRuntimeSessionRefs(),
}
export const sharedLastCommandIdRef: MutableRefValue<number> = { current: 0 }
export const sharedCurrentDocumentKeyRef: MutableRefValue<string> = { current: '' }
export const sharedCurrentTextRef: MutableRefValue<string> = { current: '' }
export const sharedCurrentDisplayNameRef: MutableRefValue<string> = { current: '' }
export const sharedCurrentFollowModeRef: MutableRefValue<boolean> = { current: false }
export const sharedCurrentFollowPeerIdRef: MutableRefValue<string | null> = { current: null }
export const sharedCurrentCaretLineRef: MutableRefValue<number | null> = { current: null }
export const sharedSuppressOutboundDocumentSigRef: MutableRefValue<string | null> = { current: null }
export const sharedLastOutboundDocumentSigRef: MutableRefValue<string | null> = { current: null }
export const sharedLastFollowRevealSigRef: MutableRefValue<string | null> = { current: null }

export function resetSharedRuntimeRefs(): void {
  resetRuntimeSessionRefs(sharedRuntimeRefs.current)
  sharedLastCommandIdRef.current = 0
  sharedCurrentDocumentKeyRef.current = ''
  sharedCurrentTextRef.current = ''
  sharedCurrentDisplayNameRef.current = ''
  sharedCurrentFollowModeRef.current = false
  sharedCurrentFollowPeerIdRef.current = null
  sharedCurrentCaretLineRef.current = null
  sharedSuppressOutboundDocumentSigRef.current = null
  sharedLastOutboundDocumentSigRef.current = null
  sharedLastFollowRevealSigRef.current = null
}

export function supportsWebRtc(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined'
}

export function generatePeerId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildDocumentSignature(documentKey: string, text: string): string {
  const key = String(documentKey || '').trim()
  const hash = hashStringToHexCached(`p2p-collab:${key}`, String(text || ''))
  return `${key}|${hash}`
}

export function waitForIceGatheringComplete(connection: RTCPeerConnection, timeoutMs: number = 2_500): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise(resolve => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      try {
        connection.removeEventListener('icegatheringstatechange', handleChange)
      } catch {
        void 0
      }
      resolve()
    }
    const handleChange = () => {
      if (connection.iceGatheringState === 'complete') finish()
    }
    connection.addEventListener('icegatheringstatechange', handleChange)
    window.setTimeout(finish, timeoutMs)
  })
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS })
}

export function countConnectedRemotePeers(peers: P2PCollaborationRemotePeer[]): number {
  return peers.filter(peer => !peer.isLocal && peer.connectionState === 'connected').length
}

export function buildPeerSummary(peers: P2PCollaborationRemotePeer[]): string {
  const count = countConnectedRemotePeers(peers)
  return count > 0 ? `Connected peers: ${count}` : 'Host ready. Generate an invite.'
}

export function buildP2PCollaborationPeerRecord(args: PeerRecordArgs): P2PCollaborationRemotePeer {
  return {
    peerId: args.peerId,
    displayName: args.displayName || 'Peer',
    documentKey: String(args.documentKey || ''),
    caretLine: args.caretLine ?? null,
    connectedAt: Number(args.connectedAt || Date.now()),
    lastSeenAt: Number(args.lastSeenAt || Date.now()),
    ownership: args.ownership,
    isLocal: args.isLocal,
    connectionState: args.connectionState,
  }
}

export function snapshotP2PCollaborationPeer(peer: P2PCollaborationRemotePeer): P2PCollaborationPeerSnapshot {
  return {
    peerId: peer.peerId,
    displayName: peer.displayName,
    documentKey: peer.documentKey,
    caretLine: peer.caretLine,
    connectedAt: peer.connectedAt,
    lastSeenAt: peer.lastSeenAt,
    ownership: peer.ownership,
  }
}
