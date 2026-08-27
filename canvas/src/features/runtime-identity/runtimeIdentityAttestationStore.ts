import { useSyncExternalStore } from 'react'
import type { AgenticGraphRuntimeIdentityVerificationStatus } from './runtimeIdentityAttestation'

export type AgenticGraphRuntimeIdentityAttestationTransportStatus =
  | 'unavailable'
  | 'connecting'
  | 'connected'
  | 'error'

export type AgenticGraphRuntimeIdentityGateStatus =
  | 'unavailable'
  | 'connecting'
  | AgenticGraphRuntimeIdentityVerificationStatus

export type AgenticGraphRuntimeIdentityGateSnapshot = {
  schema: 'agenticgraph-runtime-identity-gate/v1'
  status: AgenticGraphRuntimeIdentityGateStatus
  transportStatus: AgenticGraphRuntimeIdentityAttestationTransportStatus
  requiredDeviceCount: number
  observedDeviceCount: number
  expiresAtMs: number | null
  verificationDigest: string | null
  message: string
  differences: string[]
}

const initialSnapshot: AgenticGraphRuntimeIdentityGateSnapshot = {
  schema: 'agenticgraph-runtime-identity-gate/v1',
  status: 'unavailable',
  transportStatus: 'unavailable',
  requiredDeviceCount: 2,
  observedDeviceCount: 0,
  expiresAtMs: null,
  verificationDigest: null,
  message: 'Authenticated automatic attestation transport is not configured.',
  differences: [],
}

let gateSnapshot = initialSnapshot
const gateListeners = new Set<() => void>()

export const getAgenticGraphRuntimeIdentityGateSnapshot = (): AgenticGraphRuntimeIdentityGateSnapshot => gateSnapshot

export function publishAgenticGraphRuntimeIdentityGateSnapshot(next: AgenticGraphRuntimeIdentityGateSnapshot): void {
  gateSnapshot = next
  gateListeners.forEach(listener => listener())
}

const subscribeAgenticGraphRuntimeIdentityGate = (listener: () => void): (() => void) => {
  gateListeners.add(listener)
  return () => gateListeners.delete(listener)
}

export function useAgenticGraphRuntimeIdentityGate(): AgenticGraphRuntimeIdentityGateSnapshot {
  return useSyncExternalStore(
    subscribeAgenticGraphRuntimeIdentityGate,
    getAgenticGraphRuntimeIdentityGateSnapshot,
    getAgenticGraphRuntimeIdentityGateSnapshot,
  )
}

export function resetAgenticGraphRuntimeIdentityGateForTests(): void {
  publishAgenticGraphRuntimeIdentityGateSnapshot(initialSnapshot)
}
