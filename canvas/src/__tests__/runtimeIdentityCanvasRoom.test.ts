import { AgenticGraphCanvasSyncRoom } from '../../../cloudflare/workers/agenticgraph-storage/canvasSyncRoom'
import { AGENTICGRAPH_RUNTIME_IDENTITY_ROOM_ID } from '@/lib/storage/agenticgraphRuntimeIdentityRoomContract'
import {
  deriveAuthenticatedDevicePrincipalId,
  normalizeAgenticGraphClientDeviceId,
} from '../../../cloudflare/workers/agenticgraph-storage/devicePrincipal'

type SentMessage = Record<string, unknown> & { type?: string }

export async function testRuntimeIdentityCanvasRoomEnforcesAuthenticatedSessionBoundary(): Promise<void> {
  let attachment: Record<string, unknown> = {
    workspaceId: 'kgws:canonical-docs',
    roomId: AGENTICGRAPH_RUNTIME_IDENTITY_ROOM_ID,
    userId: 'user-a',
    sessionId: 'session-a',
    devicePrincipalId: '1'.repeat(64),
    displayName: 'Device A',
    role: 'editor',
    joinedAt: Date.now(),
    caretLine: null,
    runtimeDevice: null,
    runtimeInstanceId: null,
  }
  const sent: SentMessage[] = []
  const socket = {
    readyState: 1,
    send: (text: string) => sent.push(JSON.parse(text) as SentMessage),
    deserializeAttachment: () => attachment,
    serializeAttachment: (next: unknown) => { attachment = next as Record<string, unknown> },
  } as unknown as WebSocket
  const room = new AgenticGraphCanvasSyncRoom({
    storage: { put: async () => undefined },
    getWebSockets: () => [socket],
  })

  await room.webSocketMessage(socket, JSON.stringify({ type: 'runtime.identity.challenge.request' }))
  const challenge = sent.find(message => message.type === 'runtime.identity.challenge')
  if (!challenge || typeof challenge.challenge !== 'string') {
    throw new Error(`Expected dedicated identity room to issue a challenge, got ${JSON.stringify(sent)}`)
  }

  const attestation = {
    schema: 'agenticgraph-runtime-identity-attestation/v1',
    sessionId: AGENTICGRAPH_RUNTIME_IDENTITY_ROOM_ID,
    challenge: challenge.challenge,
    runtimeInstanceId: 'runtime-a',
    identityDigest: 'a'.repeat(64),
    identity: { device: 'device-a' },
  }
  await room.webSocketMessage(socket, JSON.stringify({ type: 'runtime.identity.attestation', attestation }))
  const authenticatedRelay = sent.find(message => message.type === 'runtime.identity.attested')
  if (
    authenticatedRelay?.authenticatedPeerId !== 'user-a'
    || authenticatedRelay.authenticatedSessionId !== 'session-a'
    || authenticatedRelay.authenticatedDevicePrincipalId !== '1'.repeat(64)
    || attachment.runtimeDevice !== 'device-a'
    || attachment.runtimeInstanceId !== 'runtime-a'
  ) {
    throw new Error(`Expected authenticated attestation relay and immutable socket binding, got ${JSON.stringify(sent)}`)
  }

  await room.webSocketMessage(socket, JSON.stringify({
    type: 'runtime.identity.attestation',
    attestation: {
      ...attestation,
      runtimeInstanceId: 'runtime-b',
      identity: { device: 'device-b' },
    },
  }))
  await room.webSocketMessage(socket, JSON.stringify({ type: 'document.sync', documentKey: 'forbidden', text: 'forbidden' }))
  const errors = sent.filter(message => message.type === 'error').map(message => message.error)
  if (
    !errors.includes('runtime identity cannot change within an authenticated room session')
    || !errors.includes('identity room accepts attestation messages only')
  ) {
    throw new Error(`Expected identity room to reject socket identity mutation and document traffic, got ${JSON.stringify(errors)}`)
  }
}

export async function testRuntimeIdentityDevicePrincipalIsOpaqueAndStable(): Promise<void> {
  const identityScope = {
    workspaceId: 'kgws:canonical-docs',
    userId: 'user-a',
  }
  const deviceId = 'dev:device-a-1234567890'
  const first = await deriveAuthenticatedDevicePrincipalId({ ...identityScope, deviceId })
  const second = await deriveAuthenticatedDevicePrincipalId({ ...identityScope, deviceId })
  const different = await deriveAuthenticatedDevicePrincipalId({
    ...identityScope,
    deviceId: 'dev:device-b-1234567890',
  })
  const differentUser = await deriveAuthenticatedDevicePrincipalId({
    ...identityScope,
    userId: 'user-b',
    deviceId,
  })
  if (
    !/^[0-9a-f]{64}$/.test(first)
    || first !== second
    || first === different
    || first === differentUser
    || normalizeAgenticGraphClientDeviceId('short') !== ''
  ) {
    throw new Error('Expected stable opaque principals only for valid persistent client device ids')
  }
}

export async function testRuntimeIdentityCanvasRoomCloseReliesOnAutomaticCloseReply(): Promise<void> {
  const peerMessages: SentMessage[] = []
  let closeCallCount = 0
  const closingAttachment = {
    workspaceId: 'kgws:canonical-docs',
    roomId: AGENTICGRAPH_RUNTIME_IDENTITY_ROOM_ID,
    userId: 'user-a',
    sessionId: 'session-a',
    devicePrincipalId: '1'.repeat(64),
    displayName: 'Device A',
    role: 'editor',
    joinedAt: Date.now(),
    caretLine: null,
    runtimeDevice: 'device-a',
    runtimeInstanceId: 'runtime-a',
  }
  const closingSocket = {
    deserializeAttachment: () => closingAttachment,
    close: () => {
      closeCallCount += 1
      throw new Error('webSocketClose must not close an already-closed hibernation socket')
    },
  } as unknown as WebSocket
  const peerSocket = {
    deserializeAttachment: () => ({
      ...closingAttachment,
      userId: 'user-b',
      sessionId: 'session-b',
      devicePrincipalId: '2'.repeat(64),
      displayName: 'Device B',
      runtimeDevice: 'device-b',
      runtimeInstanceId: 'runtime-b',
    }),
    send: (text: string) => peerMessages.push(JSON.parse(text) as SentMessage),
  } as unknown as WebSocket
  const room = new AgenticGraphCanvasSyncRoom({
    storage: { put: async () => undefined },
    getWebSockets: () => [closingSocket, peerSocket],
  })

  room.webSocketClose(closingSocket, 1000, 'client disconnected', true)
  const departure = peerMessages.find(message => message.type === 'peer.left')
  if (
    closeCallCount !== 0
    || departure?.authenticatedSessionId !== 'session-a'
    || departure.authenticatedDevicePrincipalId !== '1'.repeat(64)
    || departure.runtimeInstanceId !== 'runtime-a'
  ) {
    throw new Error(`Expected automatic close handling and one authenticated peer departure, got ${JSON.stringify({ closeCallCount, peerMessages })}`)
  }
}
