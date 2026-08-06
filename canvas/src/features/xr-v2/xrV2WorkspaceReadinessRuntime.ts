import {
  readXrAuthoringEcsRuntime,
  subscribeXrAuthoringEcsRuntime,
  type XrAuthoringEcsRuntimeSnapshot,
} from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import type { XrV2CapabilityTier } from './capabilityContract'
import {
  runXrV2PinnedContractConformanceProbe,
  type XrV2PinnedContractConformanceEvidence,
  type XrV2PinnedCriterionId,
  type XrV2PinnedRuntimeObservation,
} from './pinnedContractConformance'
import {
  planXrV2ProgressiveViewer,
  resolveXrV2ProgressiveViewerRuntime,
  type XrV2ProgressiveViewerRuntime,
} from './progressiveViewerPlan'
import {
  probeXrV2BrowserCapability,
  type XrV2BrowserCapabilityObservation,
} from './xrV2CapabilityRuntime'
import {
  createXrV2SpatialAssetMetadata,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import { detectBrowserCameraCaptureAvailable } from '@/lib/three/ThreeGraphXrSessionPolicy'

export const XR_V2_WORKSPACE_READINESS_SCHEMA =
  'knowgrph-xr-v2-workspace-readiness/v1' as const

export type XrV2WorkspaceLocalEvidence =
  | 'probing'
  | 'browser-observed'
  | 'deterministic-proven'
  | 'adapter-available'
  | 'not-observed'

export type XrV2WorkspaceCriterion = Readonly<{
  id: XrV2PinnedCriterionId
  title: string
  localEvidence: XrV2WorkspaceLocalEvidence
  detail: string
  externalEvidenceRequired: readonly XrV2PinnedRuntimeObservation[]
}>

export type XrV2BrowserRuntimeApis = Readonly<{
  indexedDb: boolean
  mediaCapture: boolean
  mediaRecorder: boolean
  webCodecs: boolean
  browserVideoPlayback: boolean
  connectedPreviewTransport: boolean
}>

export type XrV2WorkspaceReadinessSnapshot = Readonly<{
  schema: typeof XR_V2_WORKSPACE_READINESS_SCHEMA
  status: 'idle' | 'probing' | 'ready' | 'error'
  capabilityTier: XrV2CapabilityTier | null
  capabilityProbe: XrV2BrowserCapabilityObservation | null
  progressiveViewer: XrV2ProgressiveViewerRuntime | null
  assetMetadata: XrV2SpatialAssetMetadata | null
  browserApis: XrV2BrowserRuntimeApis
  authoring: Readonly<{
    status: XrAuthoringEcsRuntimeSnapshot['status']
    entities: number
    materials: number
    behaviors: number
    particles: number
    timelines: number
  }>
  criteria: readonly XrV2WorkspaceCriterion[]
  permissionRequests: Readonly<{
    camera: false
    sensors: false
    immersiveSession: false
  }>
  canOfferUserActions: boolean
  physicalCertification: 'external-required'
  error: string | null
}>

type ProbeOptions = Readonly<{
  navigator?: Navigator | null
  depthParallaxAssetAdmitted?: boolean
  flatFallbackMounted: boolean
  authoringSnapshot?: XrAuthoringEcsRuntimeSnapshot
}>

type ProbeDependencies = Readonly<{
  probeCapability?: typeof probeXrV2BrowserCapability
  runConformance?: typeof runXrV2PinnedContractConformanceProbe
  detectBrowserApis?: () => XrV2BrowserRuntimeApis
}>

const CRITERION_TITLES = Object.freeze({
  'AC-1': 'Capability detection',
  'AC-2': 'Live capture default',
  'AC-3': 'Automatic post-process fallback',
  'AC-4': 'Progressive-enhancement viewing',
  'AC-5': 'iOS engine reality',
  'AC-6': 'ECS scene composition',
  'AC-7': 'Node-based material authoring',
  'AC-8': 'Visual behavior/script graph',
  'AC-9': 'Particle authoring',
  'AC-10': 'Animation timeline/sequencing',
  'AC-11': 'In-browser packaging',
  'AC-12': 'Live edit-to-device preview',
} satisfies Record<XrV2PinnedCriterionId, string>)

const ZERO_BROWSER_APIS: XrV2BrowserRuntimeApis = Object.freeze({
  indexedDb: false,
  mediaCapture: false,
  mediaRecorder: false,
  webCodecs: false,
  browserVideoPlayback: false,
  connectedPreviewTransport: false,
})

function authoringProjection(runtime: XrAuthoringEcsRuntimeSnapshot) {
  return Object.freeze({ status: runtime.status, ...runtime.counts })
}

function probingCriteria(): readonly XrV2WorkspaceCriterion[] {
  return Object.freeze(Object.entries(CRITERION_TITLES).map(([id, title]) => Object.freeze({
    id: id as XrV2PinnedCriterionId,
    title,
    localEvidence: 'probing' as const,
    detail: 'Local browser evidence probe is running.',
    externalEvidenceRequired: Object.freeze([]),
  })))
}

function detectBrowserApis(): XrV2BrowserRuntimeApis {
  const root = globalThis as typeof globalThis & Record<string, unknown>
  let browserVideoPlayback = false
  if (typeof document !== 'undefined') {
    const video = document.createElement('video')
    browserVideoPlayback = typeof video.canPlayType === 'function'
      && video.canPlayType('video/webm') !== ''
  }
  return Object.freeze({
    indexedDb: typeof root.indexedDB === 'object',
    mediaCapture: detectBrowserCameraCaptureAvailable(),
    mediaRecorder: typeof root.MediaRecorder === 'function',
    webCodecs: typeof root.VideoEncoder === 'function'
      && typeof root.VideoDecoder === 'function',
    browserVideoPlayback,
    connectedPreviewTransport: typeof root.RTCPeerConnection === 'function'
      || typeof root.BroadcastChannel === 'function',
  })
}

function resolvedExternalEvidence(
  blockedBy: readonly XrV2PinnedRuntimeObservation[],
  authoring: XrAuthoringEcsRuntimeSnapshot,
): readonly XrV2PinnedRuntimeObservation[] {
  const mountedEcs = authoring.status === 'ready' && authoring.counts.entities > 0
  const mountedMaterial = mountedEcs && authoring.counts.materials > 0
  return Object.freeze(blockedBy.filter(blocker => {
    if (blocker === 'mountedEcsRendering') return !mountedEcs
    if (blocker === 'compiledShaderMeshRender') return !mountedMaterial
    return true
  }))
}

function criterionDetail(
  id: XrV2PinnedCriterionId,
  conformance: XrV2PinnedContractConformanceEvidence,
  viewer: XrV2ProgressiveViewerRuntime,
  browserApis: XrV2BrowserRuntimeApis,
  authoring: XrAuthoringEcsRuntimeSnapshot,
): string {
  if (id === 'AC-1') return 'Closed-tier feature probe completed before user actions were enabled.'
  if (id === 'AC-2') {
    return `${conformance.deterministic.stereoFrameCount}/${conformance.deterministic.captureFrameCount} deterministic frames synthesized; live camera/model proof is user-triggered.`
  }
  if (id === 'AC-3') return 'Bounded frame-budget breach preserved raw frames and queued one post-process job.'
  if (id === 'AC-4') return `Mounted viewer resolved ${viewer.renderedTier || 'no tier'} without requesting an immersive session.`
  if (id === 'AC-5') return 'Negative-only iOS constraint matrix excludes both webxr-* tiers.'
  if (id === 'AC-6') return `Mounted ECS: ${authoring.counts.entities} entities; canonical component query is deterministic.`
  if (id === 'AC-7') return `Mounted material bindings: ${authoring.counts.materials}; reference graph compiled deterministically.`
  if (id === 'AC-8') return `Mounted behavior bindings: ${authoring.counts.behaviors}; exact-once and unwired no-op paths passed.`
  if (id === 'AC-9') return `Mounted emitters: ${authoring.counts.particles}; deterministic ceiling remained bounded.`
  if (id === 'AC-10') return `Mounted timelines: ${authoring.counts.timelines}; sampled interpolation matched tolerance.`
  if (id === 'AC-11') return `Mux adapter is source-backed; WebCodecs ${browserApis.webCodecs ? 'available' : 'unavailable'} and browser WebM playback ${browserApis.browserVideoPlayback ? 'available' : 'unavailable'}.`
  return `Preview adapter is source-backed; local transport ${browserApis.connectedPreviewTransport ? 'available' : 'unavailable'}, connected peer proof remains explicit.`
}

function readinessCriteria(input: Readonly<{
  conformance: XrV2PinnedContractConformanceEvidence
  viewer: XrV2ProgressiveViewerRuntime
  browserApis: XrV2BrowserRuntimeApis
  authoring: XrAuthoringEcsRuntimeSnapshot
}>): readonly XrV2WorkspaceCriterion[] {
  return Object.freeze(input.conformance.acceptanceCriteria.map(criterion => {
    const mountedEcs = input.authoring.status === 'ready'
      && input.authoring.counts.entities > 0
    const mountedMaterial = mountedEcs && input.authoring.counts.materials > 0
    let localEvidence: XrV2WorkspaceLocalEvidence = criterion.deterministicEvidence.length > 0
      ? 'deterministic-proven'
      : 'not-observed'
    if (criterion.criterion === 'AC-1'
      || (criterion.criterion === 'AC-4' && input.viewer.status === 'rendered')
      || (criterion.criterion === 'AC-6' && mountedEcs)
      || (criterion.criterion === 'AC-7' && mountedMaterial)) {
      localEvidence = 'browser-observed'
    } else if (criterion.criterion === 'AC-11' || criterion.criterion === 'AC-12') {
      localEvidence = 'adapter-available'
    }
    return Object.freeze({
      id: criterion.criterion,
      title: CRITERION_TITLES[criterion.criterion],
      localEvidence,
      detail: criterionDetail(
        criterion.criterion,
        input.conformance,
        input.viewer,
        input.browserApis,
        input.authoring,
      ),
      externalEvidenceRequired: resolvedExternalEvidence(
        criterion.blockedBy,
        input.authoring,
      ),
    })
  }))
}

function idleSnapshot(): XrV2WorkspaceReadinessSnapshot {
  const authoring = readXrAuthoringEcsRuntime()
  return Object.freeze({
    schema: XR_V2_WORKSPACE_READINESS_SCHEMA,
    status: 'idle',
    capabilityTier: null,
    capabilityProbe: null,
    progressiveViewer: null,
    assetMetadata: null,
    browserApis: ZERO_BROWSER_APIS,
    authoring: authoringProjection(authoring),
    criteria: probingCriteria(),
    permissionRequests: Object.freeze({ camera: false, sensors: false, immersiveSession: false }),
    canOfferUserActions: false,
    physicalCertification: 'external-required',
    error: null,
  })
}

export async function probeXrV2WorkspaceReadiness(
  options: ProbeOptions,
  dependencies: ProbeDependencies = {},
): Promise<XrV2WorkspaceReadinessSnapshot> {
  const capabilityProbe = dependencies.probeCapability || probeXrV2BrowserCapability
  const conformanceProbe = dependencies.runConformance || runXrV2PinnedContractConformanceProbe
  const [capability, conformance] = await Promise.all([
    capabilityProbe({
      navigator: options.navigator,
      depthParallaxAssetAdmitted: options.depthParallaxAssetAdmitted === true,
    }),
    conformanceProbe(),
  ])
  const plan = planXrV2ProgressiveViewer(capability.decision)
  const viewer = resolveXrV2ProgressiveViewerRuntime(plan, {
    webXrArSessionEntered: false,
    webXrVrSessionEntered: false,
    depthParallaxAssetMounted: options.depthParallaxAssetAdmitted === true,
    flatFallbackMounted: options.flatFallbackMounted,
  })
  const achievedTier = viewer.renderedTier || 'flat-fallback'
  const assetMetadata = createXrV2SpatialAssetMetadata({
    tier: achievedTier,
    synthesisMode: 'none',
    depthMetadataRef: null,
    fallbackTriggered: false,
  })
  const browserApis = (dependencies.detectBrowserApis || detectBrowserApis)()
  const authoring = options.authoringSnapshot || readXrAuthoringEcsRuntime()
  return Object.freeze({
    schema: XR_V2_WORKSPACE_READINESS_SCHEMA,
    status: 'ready',
    capabilityTier: capability.decision.tier,
    capabilityProbe: capability,
    progressiveViewer: viewer,
    assetMetadata,
    browserApis,
    authoring: authoringProjection(authoring),
    criteria: readinessCriteria({ conformance, viewer, browserApis, authoring }),
    permissionRequests: Object.freeze({ camera: false, sensors: false, immersiveSession: false }),
    canOfferUserActions: true,
    physicalCertification: 'external-required',
    error: null,
  })
}

const listeners = new Set<() => void>()
let snapshot = idleSnapshot()
let generation = 0
let running = false
let authoringUnsubscribe: (() => void) | null = null

function publish(next: XrV2WorkspaceReadinessSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function message(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || 'XR v2 readiness probe failed')
}

export function startXrV2WorkspaceReadinessRuntime(): void {
  if (running) return
  running = true
  const currentGeneration = ++generation
  publish(Object.freeze({ ...idleSnapshot(), status: 'probing' }))
  authoringUnsubscribe = subscribeXrAuthoringEcsRuntime(() => {
    if (!running || snapshot.status !== 'ready') return
    const authoring = readXrAuthoringEcsRuntime()
    const criteria = snapshot.criteria.map(criterion => {
      if (criterion.id !== 'AC-6' && criterion.id !== 'AC-7') return criterion
      const mounted = authoring.status === 'ready'
        && (criterion.id === 'AC-6'
          ? authoring.counts.entities > 0
          : authoring.counts.materials > 0)
      return Object.freeze({
        ...criterion,
        localEvidence: mounted ? 'browser-observed' as const : criterion.localEvidence,
        externalEvidenceRequired: mounted ? Object.freeze([]) : criterion.externalEvidenceRequired,
        detail: criterion.id === 'AC-6'
          ? `Mounted ECS: ${authoring.counts.entities} entities; canonical component query is deterministic.`
          : `Mounted material bindings: ${authoring.counts.materials}; reference graph compiled deterministically.`,
      })
    })
    publish(Object.freeze({
      ...snapshot,
      authoring: authoringProjection(authoring),
      criteria: Object.freeze(criteria),
    }))
  })
  void probeXrV2WorkspaceReadiness({ flatFallbackMounted: true })
    .then(result => {
      if (running && generation === currentGeneration) publish(result)
    })
    .catch(error => {
      if (!running || generation !== currentGeneration) return
      publish(Object.freeze({ ...idleSnapshot(), status: 'error', error: message(error) }))
    })
}

export function stopXrV2WorkspaceReadinessRuntime(): void {
  if (!running) return
  running = false
  generation += 1
  authoringUnsubscribe?.()
  authoringUnsubscribe = null
  publish(idleSnapshot())
}

export function readXrV2WorkspaceReadiness(): XrV2WorkspaceReadinessSnapshot {
  return snapshot
}

export function subscribeXrV2WorkspaceReadiness(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
