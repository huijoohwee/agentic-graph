import React from 'react'
import {
  buildKnowgrphStorageCanvasRoomWebSocketUrl,
  readKnowgrphStorageCanvasRoomConfig,
} from '@/lib/storage/knowgrphStorageCanvasRoomClient'
import {
  createKnowgrphRuntimeIdentityAttestation,
  createKnowgrphRuntimeInstanceId,
  KNOWGRPH_RUNTIME_IDENTITY_REQUIRED_DEVICE_COUNT,
  KNOWGRPH_RUNTIME_IDENTITY_ROOM_ID,
  verifyKnowgrphRuntimeIdentityAttestations,
  type AuthenticatedKnowgrphRuntimeIdentityAttestation,
} from './runtimeIdentityAttestation'
import {
  publishKnowgrphRuntimeIdentityGateSnapshot,
  type KnowgrphRuntimeIdentityGateSnapshot,
} from './runtimeIdentityAttestationStore'
import { serializeKnowgrphRuntimeIdentity, type KnowgrphRuntimeIdentity } from './knowgrphRuntimeIdentity'
import { consumeKnowgrphRuntimeIdentityReconnectAttempt } from './runtimeIdentityReconnectPolicy'

const RECONNECT_DELAYS_MS = [1_000, 3_000] as const
const CHALLENGE_RENEWAL_LEAD_MS = 5_000
const STABLE_CONNECTION_WINDOW_MS = 10_000

type RuntimeIdentityRoomMessage = Record<string, unknown> & {
  type?: string
}

type RuntimeIdentityChallenge = {
  sessionId: string
  challenge: string
  issuedAtMs: number
  expiresAtMs: number
}

const normalizeString = (value: unknown): string => String(value || '').trim()

const parseRoomMessage = (value: unknown): RuntimeIdentityRoomMessage | null => {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RuntimeIdentityRoomMessage
      : null
  } catch {
    return null
  }
}

const readChallenge = (message: RuntimeIdentityRoomMessage): RuntimeIdentityChallenge | null => {
  const sessionId = normalizeString(message.sessionId)
  const challenge = normalizeString(message.challenge)
  const issuedAtMs = Number(message.issuedAtMs)
  const expiresAtMs = Number(message.expiresAtMs)
  if (
    sessionId !== KNOWGRPH_RUNTIME_IDENTITY_ROOM_ID
    || !challenge
    || !Number.isInteger(issuedAtMs)
    || !Number.isInteger(expiresAtMs)
    || expiresAtMs <= issuedAtMs
  ) return null
  return { sessionId, challenge, issuedAtMs, expiresAtMs }
}

const publishGateState = (overrides: Partial<KnowgrphRuntimeIdentityGateSnapshot>): void => {
  publishKnowgrphRuntimeIdentityGateSnapshot({
    schema: 'knowgrph-runtime-identity-gate/v1',
    status: 'collecting',
    transportStatus: 'connected',
    requiredDeviceCount: KNOWGRPH_RUNTIME_IDENTITY_REQUIRED_DEVICE_COUNT,
    observedDeviceCount: 0,
    expiresAtMs: null,
    verificationDigest: null,
    message: 'Collecting automatic runtime identity attestations.',
    differences: [],
    ...overrides,
  })
}

export function useKnowgrphRuntimeIdentityAttestationRuntime(identity: KnowgrphRuntimeIdentity): void {
  const config = React.useMemo(() => readKnowgrphStorageCanvasRoomConfig(), [])
  const runtimeInstanceId = React.useMemo(() => createKnowgrphRuntimeInstanceId(), [])
  const identityRef = React.useRef(identity)
  const socketRef = React.useRef<WebSocket | null>(null)
  const requestChallengeRef = React.useRef<(() => void) | null>(null)
  const serializedIdentity = serializeKnowgrphRuntimeIdentity(identity)

  React.useEffect(() => {
    identityRef.current = identity
    requestChallengeRef.current?.()
  }, [identity, serializedIdentity])

  React.useEffect(() => {
    if (!config) {
      publishGateState({
        status: 'unavailable',
        transportStatus: 'unavailable',
        message: 'Configure the authenticated storage room to enable automatic cross-device attestation.',
      })
      return
    }

    const socketUrl = buildKnowgrphStorageCanvasRoomWebSocketUrl(config, KNOWGRPH_RUNTIME_IDENTITY_ROOM_ID)
    if (!socketUrl) {
      publishGateState({
        status: 'blocked',
        transportStatus: 'error',
        message: 'Automatic identity attestation room URL is invalid.',
      })
      return
    }

    let disposed = false
    let reconnectFailureCount = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null
    let renewalTimer: ReturnType<typeof setTimeout> | null = null
    let expiryTimer: ReturnType<typeof setTimeout> | null = null
    let verificationSequence = 0
    let activeChallenge: RuntimeIdentityChallenge | null = null
    const attestations = new Map<string, AuthenticatedKnowgrphRuntimeIdentityAttestation>()

    const clearChallengeTimers = () => {
      if (renewalTimer) clearTimeout(renewalTimer)
      if (expiryTimer) clearTimeout(expiryTimer)
      renewalTimer = null
      expiryTimer = null
    }

    const clearStableConnectionTimer = () => {
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer)
      stableConnectionTimer = null
    }

    const sendJson = (body: Record<string, unknown>): boolean => {
      const socket = socketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) return false
      try {
        socket.send(JSON.stringify(body))
        return true
      } catch {
        return false
      }
    }

    const requestChallenge = () => {
      sendJson({ type: 'runtime.identity.challenge.request' })
    }
    requestChallengeRef.current = requestChallenge

    const verifyCurrentAttestations = () => {
      if (!activeChallenge) return
      const sequence = ++verificationSequence
      const challenge = activeChallenge
      void verifyKnowgrphRuntimeIdentityAttestations({
        sessionId: challenge.sessionId,
        challenge: challenge.challenge,
        attestations: Array.from(attestations.values()),
      }).then(result => {
        if (disposed || sequence !== verificationSequence || activeChallenge?.challenge !== challenge.challenge) return
        publishGateState({
          status: result.status,
          transportStatus: 'connected',
          requiredDeviceCount: result.requiredDeviceCount,
          observedDeviceCount: result.observedDeviceCount,
          expiresAtMs: result.expiresAtMs,
          verificationDigest: result.verificationDigest,
          message: result.message,
          differences: result.differences,
        })
      }).catch(error => {
        if (disposed || sequence !== verificationSequence) return
        publishGateState({
          status: 'blocked',
          transportStatus: 'error',
          message: error instanceof Error ? error.message : 'Automatic identity verification failed.',
        })
      })
    }

    const respondToChallenge = (challenge: RuntimeIdentityChallenge) => {
      void createKnowgrphRuntimeIdentityAttestation({
        identity: identityRef.current,
        sessionId: challenge.sessionId,
        challenge: challenge.challenge,
        runtimeInstanceId,
      }).then(attestation => {
        if (disposed || activeChallenge?.challenge !== challenge.challenge) return
        sendJson({ type: 'runtime.identity.attestation', attestation })
      }).catch(error => {
        if (disposed) return
        publishGateState({
          status: 'blocked',
          transportStatus: 'error',
          message: error instanceof Error ? error.message : 'Runtime identity attestation failed.',
        })
      })
    }

    const activateChallenge = (challenge: RuntimeIdentityChallenge) => {
      const changed = activeChallenge?.challenge !== challenge.challenge
      activeChallenge = challenge
      if (changed) attestations.clear()
      clearChallengeTimers()
      publishGateState({
        status: 'collecting',
        transportStatus: 'connected',
        expiresAtMs: challenge.expiresAtMs,
        message: 'Collecting challenge-bound identity attestations from active devices.',
      })
      const renewalDelay = Math.max(0, challenge.expiresAtMs - Date.now() - CHALLENGE_RENEWAL_LEAD_MS)
      renewalTimer = setTimeout(requestChallenge, renewalDelay)
      expiryTimer = setTimeout(verifyCurrentAttestations, Math.max(0, challenge.expiresAtMs - Date.now() + 1))
      respondToChallenge(challenge)
    }

    const handleAttestation = (message: RuntimeIdentityRoomMessage) => {
      const attestation = message.attestation
      if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) return
      const runtimeInstanceIdValue = normalizeString((attestation as { runtimeInstanceId?: unknown }).runtimeInstanceId)
      if (!runtimeInstanceIdValue) return
      const authenticatedSessionId = normalizeString(message.authenticatedSessionId)
      attestations.set(authenticatedSessionId || runtimeInstanceIdValue, {
        authenticatedPeerId: normalizeString(message.authenticatedPeerId),
        authenticatedSessionId,
        authenticatedDevicePrincipalId: normalizeString(message.authenticatedDevicePrincipalId),
        attestation: attestation as AuthenticatedKnowgrphRuntimeIdentityAttestation['attestation'],
      })
      verifyCurrentAttestations()
    }

    const connect = () => {
      if (disposed) return
      publishGateState({
        status: 'connecting',
        transportStatus: 'connecting',
        message: 'Connecting to the authenticated automatic identity room.',
      })
      const socket = new WebSocket(socketUrl)
      socketRef.current = socket
      socket.onopen = () => {
        clearStableConnectionTimer()
        stableConnectionTimer = setTimeout(() => {
          reconnectFailureCount = 0
          stableConnectionTimer = null
        }, STABLE_CONNECTION_WINDOW_MS)
        requestChallenge()
      }
      socket.onmessage = event => {
        const message = parseRoomMessage(event.data)
        if (!message) return
        if (message.type === 'runtime.identity.challenge') {
          const challenge = readChallenge(message)
          if (challenge) activateChallenge(challenge)
          return
        }
        if (message.type === 'runtime.identity.attested') {
          handleAttestation(message)
          return
        }
        if (message.type === 'peer.joined') {
          requestChallenge()
          return
        }
        if (message.type === 'peer.left') {
          const departedSessionId = normalizeString(message.authenticatedSessionId)
          const departedRuntimeInstanceId = normalizeString(message.runtimeInstanceId)
          if (departedSessionId) attestations.delete(departedSessionId)
          else if (departedRuntimeInstanceId) {
            for (const [key, entry] of attestations) {
              if (entry.attestation.runtimeInstanceId === departedRuntimeInstanceId) attestations.delete(key)
            }
          }
          verifyCurrentAttestations()
          return
        }
        if (message.type === 'error') {
          publishGateState({
            status: 'blocked',
            transportStatus: 'error',
            message: normalizeString(message.error) || 'Automatic identity room rejected a message.',
          })
        }
      }
      socket.onerror = () => {
        publishGateState({
          status: 'blocked',
          transportStatus: 'error',
          message: 'Automatic identity room connection failed.',
        })
      }
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null
        if (disposed) return
        verificationSequence += 1
        activeChallenge = null
        attestations.clear()
        clearChallengeTimers()
        clearStableConnectionTimer()
        const reconnectAttempt = consumeKnowgrphRuntimeIdentityReconnectAttempt(reconnectFailureCount)
        if (!reconnectAttempt) {
          publishGateState({
            status: 'blocked',
            transportStatus: 'error',
            message: 'Automatic identity room reconnect bound was exhausted.',
          })
          return
        }
        publishGateState({
          status: 'connecting',
          transportStatus: 'connecting',
          message: 'Automatic identity room disconnected; bounded reconnect is pending.',
        })
        const delay = RECONNECT_DELAYS_MS[reconnectAttempt.attemptIndex] || RECONNECT_DELAYS_MS.at(-1) || 3_000
        reconnectFailureCount = reconnectAttempt.nextFailureCount
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      disposed = true
      verificationSequence += 1
      requestChallengeRef.current = null
      clearChallengeTimers()
      clearStableConnectionTimer()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const socket = socketRef.current
      socketRef.current = null
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
    }
  }, [config, runtimeInstanceId])
}
