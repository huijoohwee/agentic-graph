import {
  freezeCityGrid,
  isCanonicalRegionalPoiIdentityId,
  isCityZoningType,
  validateCityGrid,
  type CityGrid,
  type CityZoningType,
} from './citySimModel'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
  zoneCityParcel,
} from './citySimRuntime'
import { publishCitySimSnapshot } from './citySimRuntimeState'
import {
  inspectP2PCollaborationExtensionTransport,
  publishP2PCollaborationExtension,
  registerP2PCollaborationExtension,
  type P2PCollaborationExtensionEvent,
} from '@/features/collaboration/p2pCollaborationExtensionRuntime'
import type { P2PCollaborationExtensionJsonValue } from '@/features/collaboration/p2pCollaborationProtocol'
import {
  sharedRuntimeRefs,
  subscribeP2PCollaborationTransportTopology,
} from '@/features/collaboration/p2pCollaborationRuntimeState'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'
import {
  isCityCoopGuestReadOnly,
  publishCityCoopSnapshot,
  readCityCoopSnapshot,
  type CityCoopProposal,
} from './cityCoopState'

const CITY_COOP_NAMESPACE = 'agentic-graph.city-coop/v1'
const CITY_COOP_MAX_PAYLOAD_BYTES = 20 * 1024
const HASH_PATTERN = /^[a-f0-9]{8,64}$/
const PROPOSAL_ID_PATTERN = /^[a-z0-9-]{8,80}$/

type CityCoopPayload = { [key: string]: P2PCollaborationExtensionJsonValue }
type CityCoopDocumentContext = Readonly<{ documentHash: string | null; capable: boolean }>

let documentContext: CityCoopDocumentContext = Object.freeze({
  documentHash: null,
  capable: false,
})
let registrationCleanup: (() => void) | null = null
let topologyCleanup: (() => void) | null = null
let runtimeUsers = 0
let scheduledSnapshot: ReturnType<typeof setTimeout> | null = null
let hostSequence = 0
let lastBroadcastRuntimeRevision = -1
let lastBoundSessionId: string | null = null
let guestSourceLeft = false
const seenProposalIds = new Set<string>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function cityFromUnknown(value: unknown): CityGrid | null {
  if (!isRecord(value) || !Array.isArray(value.parcels)) return null
  if (!hasExactKeys(value, [
    'schemaId', 'cityName', 'regionalPoiProfileId', 'rows', 'columns',
    'tick', 'treasuryCents', 'taxRateBasisPoints', 'population', 'parcels',
  ])) return null
  if (!value.parcels.every(parcel => (
    isRecord(parcel)
    && hasExactKeys(parcel, ['id', 'row', 'column', 'zone', 'landValueCents', 'population', 'pollution'])
  ))) return null
  const city = value as unknown as CityGrid
  return validateCityGrid(city).length === 0 ? freezeCityGrid(city) : null
}

function isCityCoopPayload(value: Record<string, unknown>): value is CityCoopPayload {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > CITY_COOP_MAX_PAYLOAD_BYTES) return false
  } catch {
    return false
  }
  if (value.kind === 'proposal') {
    return hasExactKeys(value, [
      'kind', 'sessionId', 'documentHash', 'proposalId', 'baseRevision', 'parcelId', 'zone',
    ])
      && typeof value.sessionId === 'string'
      && value.sessionId.length > 0 && value.sessionId.length <= 256
      && typeof value.documentHash === 'string' && HASH_PATTERN.test(value.documentHash)
      && typeof value.proposalId === 'string' && PROPOSAL_ID_PATTERN.test(value.proposalId)
      && typeof value.baseRevision === 'number' && Number.isSafeInteger(value.baseRevision) && value.baseRevision >= 0
      && isCanonicalRegionalPoiIdentityId(value.parcelId)
      && isCityZoningType(value.zone)
  }
  if (value.kind === 'snapshot') {
    return hasExactKeys(value, [
      'kind', 'sessionId', 'documentHash', 'sequence', 'city', 'phase', 'selectedParcelId', 'decision',
    ])
      && typeof value.sessionId === 'string'
      && value.sessionId.length > 0 && value.sessionId.length <= 256
      && typeof value.documentHash === 'string' && HASH_PATTERN.test(value.documentHash)
      && typeof value.sequence === 'number' && Number.isSafeInteger(value.sequence) && value.sequence > 0
      && Boolean(cityFromUnknown(value.city))
      && (value.phase === 'idle' || value.phase === 'running' || value.phase === 'stopped' || value.phase === 'error')
      && (value.selectedParcelId === null || isCanonicalRegionalPoiIdentityId(value.selectedParcelId))
      && (value.decision === null || (
        isRecord(value.decision)
        && hasExactKeys(value.decision, ['proposalId', 'accepted'])
        && typeof value.decision.proposalId === 'string'
        && PROPOSAL_ID_PATTERN.test(value.decision.proposalId)
        && typeof value.decision.accepted === 'boolean'
      ))
  }
  return false
}

function resetSessionProtocol(sessionId: string | null): void {
  if (lastBoundSessionId === sessionId) return
  lastBoundSessionId = sessionId
  hostSequence = 0
  lastBroadcastRuntimeRevision = -1
  guestSourceLeft = false
  seenProposalIds.clear()
  if (scheduledSnapshot) clearTimeout(scheduledSnapshot)
  scheduledSnapshot = null
}

function publishDisconnectedGuest(message: string): void {
  publishCityCoopSnapshot({
    role: 'guest',
    connected: false,
    connectedPeerCount: 0,
    pendingProposal: null,
    message,
  })
}

function syncTransportState(): void {
  const runtime = sharedRuntimeRefs.current
  if (!documentContext.capable || !documentContext.documentHash) {
    resetSessionProtocol(null)
    publishCityCoopSnapshot({
      role: 'solo',
      connected: false,
      connectedPeerCount: 0,
      sessionId: null,
      documentHash: null,
      hostSequence: 0,
      pendingProposal: null,
      lastDecision: null,
      message: 'Open a City-capable document to use cooperative planning.',
    })
    return
  }

  if (runtime.sessionId && runtime.role !== 'idle') {
    resetSessionProtocol(runtime.sessionId)
    const transport = inspectP2PCollaborationExtensionTransport()
    const peerCount = transport.connectedPeerCount
    const connected = transport.active && peerCount === 1
    const role = runtime.role
    publishCityCoopSnapshot({
      role,
      connected,
      connectedPeerCount: peerCount,
      sessionId: runtime.sessionId,
      documentHash: documentContext.documentHash,
      hostSequence,
      pendingProposal: null,
      lastDecision: null,
      message: role === 'host'
        ? peerCount > 1
          ? 'City cooperation supports one connected guest; additional peers remain outside this simulation.'
          : connected ? 'Host controls the shared City state.' : 'Host is ready; invite one co-planner through the shared collaboration controls.'
        : connected
          ? 'Connected as a read-only guest; suggest zones for host review.'
          : 'Guest projection is read-only while the host reconnects.',
    })
    if (role === 'guest') guestSourceLeft = false
    if (role === 'host' && connected) scheduleHostSnapshot(true)
    return
  }

  resetSessionProtocol(null)
  const previous = readCityCoopSnapshot()
  if (previous.role === 'guest') {
    publishDisconnectedGuest(guestSourceLeft
      ? 'Host collaboration ended; this City projection is read-only.'
      : 'Connection ended; this City projection is read-only.')
  } else {
    publishCityCoopSnapshot({
      role: 'solo',
      connected: false,
      connectedPeerCount: 0,
      sessionId: null,
      documentHash: documentContext.documentHash,
      hostSequence: 0,
      pendingProposal: null,
      lastDecision: null,
      message: 'Solo City planning is available.',
    })
  }
}

function cityPayloadState(): P2PCollaborationExtensionJsonValue {
  return JSON.parse(JSON.stringify(readCitySimSnapshot().city)) as P2PCollaborationExtensionJsonValue
}

function sendHostSnapshot(force = false): boolean {
  const runtime = sharedRuntimeRefs.current
  const coop = readCityCoopSnapshot()
  const citySnapshot = readCitySimSnapshot()
  if (runtime.role !== 'host'
    || !runtime.sessionId
    || !documentContext.documentHash
    || !citySnapshot.active
    || !coop.connected
    || coop.connectedPeerCount !== 1) return false
  if (!force && citySnapshot.revision === lastBroadcastRuntimeRevision) return true
  const nextSequence = hostSequence + 1
  const decision = coop.lastDecision
  const payload: CityCoopPayload = {
    kind: 'snapshot',
    sessionId: runtime.sessionId,
    documentHash: documentContext.documentHash,
    sequence: nextSequence,
    city: cityPayloadState(),
    phase: citySnapshot.phase,
    selectedParcelId: citySnapshot.selectedParcelId,
    decision: decision ? { ...decision } : null,
  }
  const result = publishP2PCollaborationExtension(CITY_COOP_NAMESPACE, payload)
  if (result.status !== 'sent') {
    publishCityCoopSnapshot({ message: `City snapshot is waiting for transport (${result.status}).` })
    return false
  }
  hostSequence = nextSequence
  lastBroadcastRuntimeRevision = citySnapshot.revision
  publishCityCoopSnapshot({
    hostSequence,
    message: 'Host controls the shared City state; latest snapshot sent.',
  })
  return true
}

function scheduleHostSnapshot(force = false): void {
  if (scheduledSnapshot) return
  scheduledSnapshot = setTimeout(() => {
    scheduledSnapshot = null
    sendHostSnapshot(force)
  }, 40)
}

function applyGuestSnapshot(payload: Record<string, unknown>): void {
  const coop = readCityCoopSnapshot()
  const runtime = sharedRuntimeRefs.current
  if (runtime.role !== 'guest'
    || !runtime.sessionId
    || payload.sessionId !== runtime.sessionId
    || payload.documentHash !== documentContext.documentHash
    || !documentContext.capable) return
  const sequence = Number(payload.sequence)
  if (!Number.isSafeInteger(sequence) || sequence <= coop.hostSequence) return
  const city = cityFromUnknown(payload.city)
  if (!city) return
  const selectedParcelId = payload.selectedParcelId === null ? null : String(payload.selectedParcelId)
  publishCitySimSnapshot({
    city,
    active: true,
    phase: 'stopped',
    selectedParcelId,
    advisor: null,
    saveStatus: 'not-loaded',
    error: null,
    message: `Host snapshot ${sequence} received; guest actions are read-only.`,
  })
  const rawDecision = payload.decision
  const decision = isRecord(rawDecision)
    && typeof rawDecision.proposalId === 'string'
    && typeof rawDecision.accepted === 'boolean'
    ? { proposalId: rawDecision.proposalId, accepted: rawDecision.accepted }
    : null
  publishCityCoopSnapshot({
    role: 'guest',
    connected: true,
    sessionId: runtime.sessionId,
    documentHash: documentContext.documentHash,
    hostSequence: sequence,
    pendingProposal: decision?.proposalId === readCityCoopSnapshot().pendingProposal?.proposalId
      ? null
      : readCityCoopSnapshot().pendingProposal,
    lastDecision: decision,
    message: decision
      ? decision.accepted ? 'Host accepted the zoning proposal.' : 'Host declined the zoning proposal.'
      : `Connected as a read-only guest; host snapshot ${sequence} is current.`,
  })
}

function handleExtensionEvent(event: P2PCollaborationExtensionEvent<CityCoopPayload>): void {
  if (event.kind === 'session-reset') {
    guestSourceLeft = true
    syncTransportState()
    return
  }
  if (event.kind === 'source-left') {
    if (readCityCoopSnapshot().role === 'guest') {
      guestSourceLeft = true
      publishDisconnectedGuest('Host City session ended; this projection is read-only.')
    }
    return
  }
  const payload = event.payload as Record<string, unknown>
  if (payload.kind === 'snapshot') {
    applyGuestSnapshot(payload)
    return
  }
  if (payload.kind !== 'proposal') return
  const runtime = sharedRuntimeRefs.current
  const coop = readCityCoopSnapshot()
  if (runtime.role !== 'host'
    || !runtime.sessionId
    || payload.sessionId !== runtime.sessionId
    || payload.documentHash !== documentContext.documentHash
    || !coop.connected
    || coop.connectedPeerCount !== 1) return
  const currentCity = readCitySimSnapshot()
  const proposal: CityCoopProposal = Object.freeze({
    proposalId: String(payload.proposalId),
    parcelId: String(payload.parcelId),
    zone: payload.zone as CityZoningType,
    baseRevision: Number(payload.baseRevision),
  })
  if (seenProposalIds.has(proposal.proposalId)
    || proposal.proposalId === coop.lastDecision?.proposalId
    || proposal.proposalId === coop.pendingProposal?.proposalId) return
  seenProposalIds.add(proposal.proposalId)
  if (seenProposalIds.size > 256) {
    const oldest = seenProposalIds.values().next().value
    if (oldest) seenProposalIds.delete(oldest)
  }
  const parcelExists = currentCity.city.parcels.some(parcel => parcel.id === proposal.parcelId)
  if (!parcelExists || proposal.baseRevision !== hostSequence) {
    publishCityCoopSnapshot({
      lastDecision: { proposalId: proposal.proposalId, accepted: false },
      message: 'A stale or unknown zoning proposal was declined.',
    })
    scheduleHostSnapshot(true)
    return
  }
  if (coop.pendingProposal) {
    publishCityCoopSnapshot({
      lastDecision: { proposalId: proposal.proposalId, accepted: false },
      message: 'Another zoning proposal is awaiting the host; this proposal was declined.',
    })
    scheduleHostSnapshot(true)
    return
  }
  publishCityCoopSnapshot({
    pendingProposal: proposal,
    message: 'A co-planner suggested a zone; host decision is required.',
  })
}

function ensureRegistration(): void {
  if (registrationCleanup) return
  registrationCleanup = registerP2PCollaborationExtension<CityCoopPayload>(CITY_COOP_NAMESPACE, {
    validatePayload: isCityCoopPayload,
    onEvent: handleExtensionEvent,
  })
  topologyCleanup = subscribeP2PCollaborationTransportTopology(syncTransportState)
  syncTransportState()
}

export function acquireCityCoopRuntime(): () => void {
  runtimeUsers += 1
  ensureRegistration()
  return () => {
    runtimeUsers = Math.max(0, runtimeUsers - 1)
    if (runtimeUsers > 0) return
    topologyCleanup?.()
    topologyCleanup = null
    registrationCleanup?.()
    registrationCleanup = null
    if (scheduledSnapshot) clearTimeout(scheduledSnapshot)
    scheduledSnapshot = null
  }
}

export function setCityCoopDocumentContext(
  documentText: string,
  capable: boolean,
): void {
  const documentHash = capable
    ? hashStringToHexCached('city-coop-document-v1', documentText)
    : null
  if (documentContext.documentHash === documentHash && documentContext.capable === capable) return
  documentContext = Object.freeze({ documentHash, capable })
  resetSessionProtocol(null)
  publishCityCoopSnapshot({
    role: 'solo',
    connected: false,
    connectedPeerCount: 0,
    sessionId: null,
    documentHash,
    hostSequence: 0,
    pendingProposal: null,
    lastDecision: null,
    message: capable
      ? 'City source is ready; cooperative state follows the active peer session.'
      : 'Open a City-capable document to use cooperative planning.',
  })
  syncTransportState()
}

export function subscribeCityRuntimeForCoop(): () => void {
  return subscribeCitySimSnapshot(() => {
    if (sharedRuntimeRefs.current.role === 'host') scheduleHostSnapshot()
  })
}

export function proposeCityZone(
  parcelId: string,
  zone: CityZoningType,
): Readonly<{ ok: boolean; message: string }> {
  const runtime = sharedRuntimeRefs.current
  const coop = readCityCoopSnapshot()
  const parcel = readCitySimSnapshot().city.parcels.find(item => item.id === parcelId)
  if (!parcel || !isCanonicalRegionalPoiIdentityId(parcelId) || !isCityZoningType(zone)) {
    return { ok: false, message: 'Choose a known POI and valid zone before suggesting it.' }
  }
  if (runtime.role !== 'guest' || !runtime.sessionId || !coop.connected || !documentContext.documentHash) {
    return { ok: false, message: 'A connected host is required before a guest can suggest a zone.' }
  }
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const proposalId = `city-${random}`.toLowerCase()
  const result = publishP2PCollaborationExtension(CITY_COOP_NAMESPACE, {
    kind: 'proposal',
    sessionId: runtime.sessionId,
    documentHash: documentContext.documentHash,
    proposalId,
    baseRevision: coop.hostSequence,
    parcelId,
    zone,
  })
  if (result.status !== 'sent') {
    return { ok: false, message: `Proposal was not sent (${result.status}).` }
  }
  publishCityCoopSnapshot({
    pendingProposal: Object.freeze({ proposalId, parcelId, zone, baseRevision: coop.hostSequence }),
    message: `Suggested ${zone} zoning for ${parcelId}; waiting for host review.`,
  })
  return { ok: true, message: `Suggested ${zone} zoning for ${parcelId}.` }
}

export function decideCityCoopProposal(
  proposalId: string,
  accepted: boolean,
): Readonly<{ ok: boolean; message: string }> {
  const runtime = sharedRuntimeRefs.current
  const coop = readCityCoopSnapshot()
  const proposal = coop.pendingProposal
  if (runtime.role !== 'host' || !runtime.sessionId || !coop.connected || !proposal || proposal.proposalId !== proposalId) {
    return { ok: false, message: 'Only the connected host can decide the pending proposal.' }
  }
  if (proposal.baseRevision !== hostSequence
    || readCitySimSnapshot().revision !== lastBroadcastRuntimeRevision) {
    publishCityCoopSnapshot({
      pendingProposal: null,
      lastDecision: { proposalId, accepted: false },
      message: 'The proposal became stale after the City changed; it was declined.',
    })
    scheduleHostSnapshot(true)
    return { ok: false, message: 'The proposal became stale after the City changed.' }
  }
  let message = 'Proposal declined by the host.'
  let decisionAccepted = false
  if (accepted) {
    const result = zoneCityParcel(proposal.parcelId, proposal.zone)
    if (result.lastResult?.ok === false) {
      message = result.message
    } else {
      message = `Host accepted ${proposal.zone} zoning for ${proposal.parcelId}.`
      decisionAccepted = true
    }
  }
  publishCityCoopSnapshot({
    pendingProposal: null,
    lastDecision: { proposalId, accepted: decisionAccepted },
    message,
  })
  scheduleHostSnapshot(true)
  return { ok: true, message }
}

export function canMutateCityAsLocalOwner(): boolean {
  return !isCityCoopGuestReadOnly()
}
