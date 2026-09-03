import type {
  MotionCaptureObservationInput,
  MotionCaptureSessionSnapshot,
  MotionCaptureSourceRegistration,
  MotionCaptureSourceState,
} from './motionCapturePlatformContract'
import { motionCaptureSessionRuntime } from './motionCaptureSessionRuntime'

export const MOTION_CAPTURE_PROVIDER_API_SCHEMA = 'agentic-graph.motion-capture-provider-api/v1' as const

export type MotionCaptureProviderDescriptor = Readonly<{
  providerId: string
  label: string
  transport: 'browser-local' | 'host-bridge' | 'network-peer'
}>

export type MotionCaptureProviderHandle = Readonly<{
  schema: typeof MOTION_CAPTURE_PROVIDER_API_SCHEMA
  descriptor: MotionCaptureProviderDescriptor
  registerSource: (input: MotionCaptureSourceRegistration) => MotionCaptureSourceState
  ingestObservation: (sourceId: string, input: MotionCaptureObservationInput) => MotionCaptureSessionSnapshot
  removeSource: (sourceId: string) => MotionCaptureSessionSnapshot
  readSourceIds: () => readonly string[]
  disconnect: () => MotionCaptureSessionSnapshot
}>

export type MotionCaptureProviderApi = Readonly<{
  schema: typeof MOTION_CAPTURE_PROVIDER_API_SCHEMA
  connect: (descriptor: MotionCaptureProviderDescriptor) => MotionCaptureProviderHandle
  applyResearchEvidenceManifest: (input: unknown) => Promise<MotionCaptureSessionSnapshot>
  readSession: () => MotionCaptureSessionSnapshot
  inspect: () => Readonly<{
    schema: typeof MOTION_CAPTURE_PROVIDER_API_SCHEMA
    connectedProviderCount: number
    providers: readonly MotionCaptureProviderDescriptor[]
  }>
}>

type ProviderRegistration = {
  descriptor: MotionCaptureProviderDescriptor
  sourceIds: Set<string>
}

const providerRegistrations = new Map<string, ProviderRegistration>()

function strictDescriptor(input: MotionCaptureProviderDescriptor): MotionCaptureProviderDescriptor {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Reflect.ownKeys(input).some(key => !['providerId', 'label', 'transport'].includes(String(key)))) {
    throw new Error('motion-capture-invalid-provider-descriptor')
  }
  const providerId = typeof input.providerId === 'string' ? input.providerId.trim() : ''
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u.test(providerId)
    || !label || label.length > 120
    || !['browser-local', 'host-bridge', 'network-peer'].includes(input.transport)) {
    throw new Error('motion-capture-invalid-provider-descriptor')
  }
  return Object.freeze({ providerId, label, transport: input.transport })
}

function removeOwnedSource(registration: ProviderRegistration, sourceId: string): MotionCaptureSessionSnapshot {
  if (!registration.sourceIds.has(sourceId)) throw new Error('motion-capture-provider-source-not-owned')
  registration.sourceIds.delete(sourceId)
  return motionCaptureSessionRuntime.removeSource(sourceId)
}

function connect(descriptorInput: MotionCaptureProviderDescriptor): MotionCaptureProviderHandle {
  const descriptor = strictDescriptor(descriptorInput)
  if (providerRegistrations.has(descriptor.providerId)) throw new Error('motion-capture-provider-already-connected')
  const registration: ProviderRegistration = { descriptor, sourceIds: new Set() }
  providerRegistrations.set(descriptor.providerId, registration)
  let connected = true
  const requireConnected = (): void => {
    if (!connected) throw new Error('motion-capture-provider-disconnected')
  }
  return Object.freeze({
    schema: MOTION_CAPTURE_PROVIDER_API_SCHEMA,
    descriptor,
    registerSource: (input) => {
      requireConnected()
      const source = motionCaptureSessionRuntime.registerSource(input)
      registration.sourceIds.add(source.sourceId)
      return source
    },
    ingestObservation: (sourceId, input) => {
      requireConnected()
      if (!registration.sourceIds.has(sourceId)) throw new Error('motion-capture-provider-source-not-owned')
      return motionCaptureSessionRuntime.ingestObservation(sourceId, input)
    },
    removeSource: (sourceId) => {
      requireConnected()
      return removeOwnedSource(registration, sourceId)
    },
    readSourceIds: () => Object.freeze([...registration.sourceIds].sort()),
    disconnect: () => {
      requireConnected()
      connected = false
      providerRegistrations.delete(descriptor.providerId)
      let snapshot = motionCaptureSessionRuntime.getSnapshot()
      for (const sourceId of [...registration.sourceIds]) {
        if (snapshot.sources.some(source => source.sourceId === sourceId)) {
          snapshot = removeOwnedSource(registration, sourceId)
        } else registration.sourceIds.delete(sourceId)
      }
      return snapshot
    },
  })
}

function inspectProviders() {
  return Object.freeze({
    schema: MOTION_CAPTURE_PROVIDER_API_SCHEMA,
    connectedProviderCount: providerRegistrations.size,
    providers: Object.freeze([...providerRegistrations.values()]
      .map(registration => registration.descriptor)
      .sort((left, right) => left.providerId.localeCompare(right.providerId))),
  })
}

export const motionCaptureProviderApi: MotionCaptureProviderApi = Object.freeze({
  schema: MOTION_CAPTURE_PROVIDER_API_SCHEMA,
  connect,
  applyResearchEvidenceManifest: motionCaptureSessionRuntime.applyResearchEvidenceManifest,
  readSession: motionCaptureSessionRuntime.getSnapshot,
  inspect: inspectProviders,
})

declare global {
  interface Window {
    __agenticGraphMotionCaptureProvider?: MotionCaptureProviderApi
  }
}

if (typeof window !== 'undefined') window.__agenticGraphMotionCaptureProvider = motionCaptureProviderApi
