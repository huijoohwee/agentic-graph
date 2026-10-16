import type { CityZoningType } from './citySimModel'

export type CityCoopRole = 'solo' | 'host' | 'guest'

export type CityCoopProposal = Readonly<{
  proposalId: string
  parcelId: string
  zone: CityZoningType
  baseRevision: number
}>

export type CityCoopSnapshot = Readonly<{
  role: CityCoopRole
  connected: boolean
  connectedPeerCount: number
  sessionId: string | null
  documentHash: string | null
  hostSequence: number
  pendingProposal: CityCoopProposal | null
  lastDecision: Readonly<{ proposalId: string; accepted: boolean }> | null
  message: string
  revision: number
}>

type Listener = () => void
const listeners = new Set<Listener>()

let snapshot: CityCoopSnapshot = Object.freeze({
  role: 'solo',
  connected: false,
  connectedPeerCount: 0,
  sessionId: null,
  documentHash: null,
  hostSequence: 0,
  pendingProposal: null,
  lastDecision: null,
  message: 'Solo City planning is available.',
  revision: 0,
})

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function readCityCoopSnapshot(): CityCoopSnapshot {
  return snapshot
}

export function subscribeCityCoopSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishCityCoopSnapshot(
  update: Partial<Omit<CityCoopSnapshot, 'revision'>>,
): CityCoopSnapshot {
  snapshot = Object.freeze({
    ...snapshot,
    ...update,
    revision: snapshot.revision + 1,
  })
  notify()
  return snapshot
}

/** A disconnected guest remains a read-only projection until the document changes. */
export function isCityCoopGuestReadOnly(): boolean {
  return snapshot.role === 'guest'
}

export function resetCityCoopSnapshotForTests(): void {
  snapshot = Object.freeze({
    role: 'solo',
    connected: false,
    connectedPeerCount: 0,
    sessionId: null,
    documentHash: null,
    hostSequence: 0,
    pendingProposal: null,
    lastDecision: null,
    message: 'Solo City planning is available.',
    revision: snapshot.revision + 1,
  })
  notify()
}
