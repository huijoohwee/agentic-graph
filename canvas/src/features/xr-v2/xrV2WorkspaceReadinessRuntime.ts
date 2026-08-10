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
  readMountedAuthoringEvidence,
  subscribeMountedAuthoringEvidence,
  type MountedAuthoringEvidenceSnapshot,
} from './mountedAuthoringEvidence'
import {
  probeXrV2BrowserCapability,
  type XrV2BrowserCapabilityObservation,
} from './xrV2CapabilityRuntime'
import {
  isXrV2SpatialAssetMetadata,
  type XrV2SpatialAssetMetadata,
} from './xrV2SpatialAssetMetadata'
import { preflightXrV2IndexedDbArtifactStore } from './xrV2CaptureArtifactStore'
import { detectBrowserCameraCaptureAvailable } from '@/lib/three/ThreeGraphXrSessionPolicy'
import {
  matchesXrV2ConnectedPreviewObservation, matchesXrV2PackagingObservation,
  readXrV2DeliveryObservation, resetXrV2DeliveryObservation, subscribeXrV2DeliveryObservation,
  ZERO_XR_V2_DELIVERY_OBSERVATION,
  type XrV2DeliveryObservation,
} from './xrV2DeliveryObservationRuntime'
import {
  resolveXrV2SavedAssetCompatibility,
  type XrV2SavedAssetCompatibility,
} from './xrV2SavedAssetCompatibility'

export {
  beginXrV2DeliveryCriterionObservation, reportXrV2DeliveryCriterionObservation,
  type XrV2DeliveryObservation,
} from './xrV2DeliveryObservationRuntime'

export const XR_V2_WORKSPACE_READINESS_SCHEMA =
  'knowgrph-xr-v2-workspace-readiness/v1' as const

export type XrV2WorkspaceLocalEvidence =
  | 'probing'
  | 'browser-observed'
  | 'deterministic-proven'
  | 'adapter-available'
  | 'not-observed'

export type XrV2ExternalCertificationEvidence = XrV2PinnedRuntimeObservation
  | 'sharedStorageWorkspaceAuthAndServerDigest' | 'physicalCrossDeviceReopen'

export type XrV2WorkspaceCriterion = Readonly<{
  id: XrV2PinnedCriterionId
  title: string
  localEvidence: XrV2WorkspaceLocalEvidence
  detail: string
  externalEvidenceRequired: readonly XrV2ExternalCertificationEvidence[]
}>

export type XrV2BrowserRuntimeApis = Readonly<{
  indexedDb: boolean
  mediaCapture: boolean
  mediaRecorder: boolean
  webCodecs: boolean
  browserVideoPlayback: boolean
  connectedPreviewTransport: boolean
}>

export type XrV2ViewerObservation = Readonly<{
  webXrArSavedAssetRendered: boolean
  webXrVrSavedAssetRendered: boolean
  depthParallaxAssetMounted: boolean
  flatFallbackMounted: boolean
  savedAssetRef: string | null
  savedAssetMetadata: XrV2SpatialAssetMetadata | null
  revision: number
}>

export type XrV2WorkspaceReadinessSnapshot = Readonly<{
  schema: typeof XR_V2_WORKSPACE_READINESS_SCHEMA
  status: 'idle' | 'probing' | 'ready' | 'error'
  capabilityTier: XrV2CapabilityTier | null
  capabilityProbe: XrV2BrowserCapabilityObservation | null
  progressiveViewer: XrV2ProgressiveViewerRuntime | null
  assetCompatibility: XrV2SavedAssetCompatibility
  assetMetadata: XrV2SpatialAssetMetadata | null
  browserApis: XrV2BrowserRuntimeApis
  viewerObservation: XrV2ViewerObservation
  deliveryObservation: XrV2DeliveryObservation
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
  authoringSnapshot?: XrAuthoringEcsRuntimeSnapshot
  mountedAuthoringEvidence?: MountedAuthoringEvidenceSnapshot
  viewerObservation?: XrV2ViewerObservation
  deliveryObservation?: XrV2DeliveryObservation
}>

type ProbeDependencies = Readonly<{
  probeCapability?: typeof probeXrV2BrowserCapability
  runConformance?: typeof runXrV2PinnedContractConformanceProbe
  detectBrowserApis?: () => XrV2BrowserRuntimeApis | Promise<XrV2BrowserRuntimeApis>
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

const ZERO_VIEWER_OBSERVATION: XrV2ViewerObservation = Object.freeze({
  webXrArSavedAssetRendered: false,
  webXrVrSavedAssetRendered: false,
  depthParallaxAssetMounted: false,
  flatFallbackMounted: false,
  savedAssetRef: null,
  savedAssetMetadata: null,
  revision: 0,
})

const XR_V2_AC4_STORAGE_PROMOTION_EVIDENCE = Object.freeze([
  'sharedStorageWorkspaceAuthAndServerDigest', 'physicalCrossDeviceReopen',
] as const satisfies readonly XrV2ExternalCertificationEvidence[])

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

async function detectBrowserApis(): Promise<XrV2BrowserRuntimeApis> {
  const root = globalThis as typeof globalThis & Record<string, unknown>
  let indexedDb = false
  if (typeof root.indexedDB === 'object') {
    try {
      await preflightXrV2IndexedDbArtifactStore()
      indexedDb = true
    } catch {
      indexedDb = false
    }
  }
  let browserVideoPlayback = false
  if (typeof document !== 'undefined') {
    const video = document.createElement('video')
    browserVideoPlayback = typeof video.canPlayType === 'function'
      && video.canPlayType('video/webm') !== ''
  }
  return Object.freeze({
    indexedDb,
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
  mounted: MountedAuthoringEvidenceSnapshot,
): readonly XrV2PinnedRuntimeObservation[] {
  const mountedEcs = (mounted.status === 'mounting' || mounted.status === 'ready')
    && Boolean(mounted.observation?.canvas.connected)
    && (mounted.observation?.entityIds.length ?? 0) > 0
    && (mounted.observation?.renderer.observedFrameCount ?? 0) > 0
  const mountedMaterial = mountedEcs
    && (mounted.observation?.meshes.length ?? 0) > 0
    && mounted.observation?.renderer.compileStatus === 'ready'
    && mounted.observation.meshes.every(mesh => (
      mesh.bindingStatus === 'ready' || mesh.bindingStatus === 'not-requested'
    ))
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
  mounted: MountedAuthoringEvidenceSnapshot,
  delivery: XrV2DeliveryObservation,
): string {
  if (id === 'AC-1') return 'Closed-tier feature probe completed before user actions were enabled.'
  if (id === 'AC-2') {
    return `${conformance.deterministic.stereoFrameCount}/${conformance.deterministic.captureFrameCount} deterministic frames synthesized; live camera/model proof is user-triggered.`
  }
  if (id === 'AC-3') return 'Bounded frame-budget breach preserved raw frames and queued one post-process job.'
  if (id === 'AC-4') return viewer.status === 'rendered'
    ? `Saved-asset viewer observed ${viewer.renderedTier || 'no tier'} after a real mount/playback event.`
    : 'Progressive viewer plan is ready; no selected saved-asset render has been observed.'
  if (id === 'AC-5') return 'Negative-only iOS constraint matrix excludes both webxr-* tiers.'
  if (id === 'AC-6') return Boolean(mounted.observation?.canvas.connected)
    && (mounted.observation?.renderer.observedFrameCount ?? 0) > 0
    ? `Mounted renderer observed ${mounted.observation?.entityIds.length ?? 0} ECS entities on a connected canvas.`
    : `ECS projection contains ${authoring.counts.entities} entities; mounted renderer proof is ${mounted.status}.`
  if (id === 'AC-7') return mounted.observation?.renderer.compileStatus === 'ready'
    && (mounted.observation?.meshes.length ?? 0) > 0
    && (mounted.observation?.meshes.every(mesh => (
      mesh.bindingStatus === 'ready' || mesh.bindingStatus === 'not-requested'
    )) ?? false)
    ? `Mounted renderer observed ${mounted.observation?.meshes.length ?? 0} compiled material bindings.`
    : `Material projection contains ${authoring.counts.materials} bindings; mounted compiler proof is ${mounted.status}.`
  if (id === 'AC-8') return `Behavior projection count: ${authoring.counts.behaviors}; exact-once and unwired no-op paths passed deterministically.`
  if (id === 'AC-9') return `Particle projection count: ${authoring.counts.particles}; deterministic ceiling remained bounded.`
  if (id === 'AC-10') return `Timeline projection count: ${authoring.counts.timelines}; sampled interpolation matched tolerance.`
  if (id === 'AC-11') return delivery.packagingObserved
    ? 'Explicit package/play action preserved the encoded track inventory and observed playback in the mounted browser video element.'
    : `Package/play action is waiting for explicit execution; WebCodecs ${browserApis.webCodecs ? 'available' : 'unavailable'} and browser WebM playback ${browserApis.browserVideoPlayback ? 'available' : 'unavailable'}.`
  return delivery.connectedPreviewObserved
    ? 'Explicit connected-preview action applied and acknowledged one bounded local WebRTC edit without navigation.'
    : `Connected-preview action is waiting for explicit execution; local transport ${browserApis.connectedPreviewTransport ? 'available' : 'unavailable'}.`
}

function readinessCriteria(input: Readonly<{
  conformance: XrV2PinnedContractConformanceEvidence
  viewer: XrV2ProgressiveViewerRuntime
  browserApis: XrV2BrowserRuntimeApis
  authoring: XrAuthoringEcsRuntimeSnapshot
  mounted: MountedAuthoringEvidenceSnapshot
  delivery: XrV2DeliveryObservation
  activeSavedAssetRef: string | null
}>): readonly XrV2WorkspaceCriterion[] {
  return Object.freeze(input.conformance.acceptanceCriteria.map(criterion => {
    const mountedEcs = (input.mounted.status === 'mounting' || input.mounted.status === 'ready')
      && Boolean(input.mounted.observation?.canvas.connected)
      && (input.mounted.observation?.entityIds.length ?? 0) > 0
      && (input.mounted.observation?.renderer.observedFrameCount ?? 0) > 0
    const mountedMaterial = mountedEcs
      && (input.mounted.observation?.meshes.length ?? 0) > 0
      && input.mounted.observation?.renderer.compileStatus === 'ready'
      && (input.mounted.observation?.meshes.every(mesh => (
        mesh.bindingStatus === 'ready' || mesh.bindingStatus === 'not-requested'
      )) ?? false)
    let localEvidence: XrV2WorkspaceLocalEvidence = criterion.deterministicEvidence.length > 0
      ? 'deterministic-proven'
      : 'not-observed'
    if (criterion.criterion === 'AC-4' && input.viewer.status !== 'rendered') {
      localEvidence = 'not-observed'
    }
    if (criterion.criterion === 'AC-1'
      || (criterion.criterion === 'AC-4' && input.viewer.status === 'rendered')
      || (criterion.criterion === 'AC-6' && mountedEcs)
      || (criterion.criterion === 'AC-7' && mountedMaterial)) {
      localEvidence = 'browser-observed'
    } else if (criterion.criterion === 'AC-11') {
      localEvidence = matchesXrV2PackagingObservation(input.delivery, input.activeSavedAssetRef)
        ? 'browser-observed' : 'not-observed'
    } else if (criterion.criterion === 'AC-12') {
      localEvidence = matchesXrV2ConnectedPreviewObservation(input.delivery, input.authoring.plan)
        ? 'browser-observed' : 'not-observed'
    }
    const pinnedExternalEvidence = resolvedExternalEvidence(
      criterion.blockedBy,
      input.mounted,
    )
    const externalEvidenceRequired = criterion.criterion === 'AC-4'
      ? Object.freeze([...pinnedExternalEvidence, ...XR_V2_AC4_STORAGE_PROMOTION_EVIDENCE])
      : pinnedExternalEvidence
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
        input.mounted,
        input.delivery,
      ),
      externalEvidenceRequired,
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
    assetCompatibility: resolveXrV2SavedAssetCompatibility({
      deviceTier: null, savedAssetRef: null, authoredTier: null, presentationTier: null,
    }),
    assetMetadata: null,
    browserApis: ZERO_BROWSER_APIS,
    viewerObservation: ZERO_VIEWER_OBSERVATION,
    deliveryObservation: ZERO_XR_V2_DELIVERY_OBSERVATION,
    authoring: authoringProjection(authoring),
    criteria: probingCriteria(),
    permissionRequests: Object.freeze({ camera: false, sensors: false, immersiveSession: false }),
    canOfferUserActions: false,
    physicalCertification: 'external-required',
    error: null,
  })
}

type ReadinessBasis = Readonly<{
  capability: XrV2BrowserCapabilityObservation
  conformance: XrV2PinnedContractConformanceEvidence
  plan: ReturnType<typeof planXrV2ProgressiveViewer>
  browserApis: XrV2BrowserRuntimeApis
}>

async function collectReadinessBasis(
  options: ProbeOptions,
  dependencies: ProbeDependencies,
): Promise<ReadinessBasis> {
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
  const browserApis = await (dependencies.detectBrowserApis || detectBrowserApis)()
  return Object.freeze({ capability, conformance, plan, browserApis })
}

function buildReadySnapshot(
  basis: ReadinessBasis,
  options: ProbeOptions,
): XrV2WorkspaceReadinessSnapshot {
  const viewerObservation = options.viewerObservation || ZERO_VIEWER_OBSERVATION
  const deliveryObservation = options.deliveryObservation || ZERO_XR_V2_DELIVERY_OBSERVATION
  const observedMetadata = viewerObservation.savedAssetMetadata
  const exactSavedAssetObserved = Boolean(viewerObservation.savedAssetRef)
    && isXrV2SpatialAssetMetadata(observedMetadata)
  const savedAssetTier = exactSavedAssetObserved
    ? observedMetadata!.xr_capability_tier
    : null
  const plan = savedAssetTier
    ? planXrV2ProgressiveViewer(basis.capability.decision, { savedAssetTier })
    : basis.plan
  const depthParallaxObserved = exactSavedAssetObserved && viewerObservation.depthParallaxAssetMounted
    && observedMetadata?.xr_capability_tier === 'pseudo-ar-depth-parallax'
  const flatFallbackObserved = exactSavedAssetObserved && viewerObservation.flatFallbackMounted
  const viewer = resolveXrV2ProgressiveViewerRuntime(plan, {
    webXrArSessionEntered: exactSavedAssetObserved && viewerObservation.webXrArSavedAssetRendered,
    webXrVrSessionEntered: exactSavedAssetObserved && viewerObservation.webXrVrSavedAssetRendered,
    depthParallaxAssetMounted: depthParallaxObserved,
    flatFallbackMounted: flatFallbackObserved,
  })
  const assetMetadata = viewer.renderedTier === null || !exactSavedAssetObserved ? null : observedMetadata
  const assetCompatibility = resolveXrV2SavedAssetCompatibility({
    deviceTier: basis.capability.decision.tier,
    savedAssetRef: exactSavedAssetObserved ? viewerObservation.savedAssetRef : null,
    authoredTier: savedAssetTier,
    presentationTier: viewer.renderedTier,
  })
  const authoring = options.authoringSnapshot || readXrAuthoringEcsRuntime()
  const mounted = options.mountedAuthoringEvidence || readMountedAuthoringEvidence()
  return Object.freeze({
    schema: XR_V2_WORKSPACE_READINESS_SCHEMA,
    status: 'ready',
    capabilityTier: basis.capability.decision.tier,
    capabilityProbe: basis.capability,
    progressiveViewer: viewer,
    assetCompatibility,
    assetMetadata,
    browserApis: basis.browserApis,
    viewerObservation,
    deliveryObservation,
    authoring: authoringProjection(authoring),
    criteria: readinessCriteria({
      conformance: basis.conformance,
      viewer,
      browserApis: basis.browserApis,
      authoring,
      mounted,
      delivery: deliveryObservation,
      activeSavedAssetRef: viewerObservation.savedAssetRef,
    }),
    permissionRequests: Object.freeze({ camera: false, sensors: false, immersiveSession: false }),
    canOfferUserActions: true,
    physicalCertification: 'external-required',
    error: null,
  })
}

export async function probeXrV2WorkspaceReadiness(
  options: ProbeOptions,
  dependencies: ProbeDependencies = {},
): Promise<XrV2WorkspaceReadinessSnapshot> {
  const basis = await collectReadinessBasis(options, dependencies)
  return buildReadySnapshot(basis, options)
}

const listeners = new Set<() => void>()
let snapshot = idleSnapshot()
let generation = 0
let running = false
let authoringUnsubscribe: (() => void) | null = null
let mountedUnsubscribe: (() => void) | null = null
let deliveryUnsubscribe: (() => void) | null = null
let runtimeBasis: ReadinessBasis | null = null
let viewerObservation = ZERO_VIEWER_OBSERVATION

function publish(next: XrV2WorkspaceReadinessSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function message(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : String(error || 'XR v2 readiness probe failed')
}

function refreshRuntimeSnapshot(): void {
  if (!running || !runtimeBasis) return
  publish(buildReadySnapshot(runtimeBasis, {
    authoringSnapshot: readXrAuthoringEcsRuntime(),
    mountedAuthoringEvidence: readMountedAuthoringEvidence(),
    viewerObservation,
    deliveryObservation: readXrV2DeliveryObservation(),
  }))
}

export function reportXrV2SavedAssetViewerObservation(input: Readonly<{
  assetRef: string
  tier: 'pseudo-ar-depth-parallax' | 'flat-fallback'
  metadata: XrV2SpatialAssetMetadata
  mounted: boolean
}>): XrV2ViewerObservation {
  const assetRef = String(input.assetRef || '').trim()
  if (!assetRef) throw new TypeError('saved viewer observation requires an asset reference')
  if (!input.mounted && viewerObservation.savedAssetRef !== assetRef) return viewerObservation
  if (!isXrV2SpatialAssetMetadata(input.metadata)) {
    throw new TypeError('saved viewer observation requires exact persisted metadata')
  }
  const sameAsset = viewerObservation.savedAssetRef === assetRef
  const previous = sameAsset ? viewerObservation : ZERO_VIEWER_OBSERVATION
  const depthParallaxAssetMounted = input.mounted && input.tier === 'pseudo-ar-depth-parallax'
  const flatFallbackMounted = input.mounted && input.tier === 'flat-fallback'
  const anyMounted = depthParallaxAssetMounted || flatFallbackMounted
    || previous.webXrArSavedAssetRendered || previous.webXrVrSavedAssetRendered
  viewerObservation = Object.freeze({
    ...previous,
    depthParallaxAssetMounted,
    flatFallbackMounted,
    savedAssetRef: anyMounted ? assetRef : null,
    savedAssetMetadata: anyMounted ? Object.freeze({ ...input.metadata }) : null,
    revision: viewerObservation.revision + 1,
  })
  refreshRuntimeSnapshot()
  return viewerObservation
}

export function reportXrV2SavedAssetImmersiveRenderObservation(input: Readonly<{
  assetRef: string
  mode: 'immersive-ar' | 'immersive-vr'
  metadata: XrV2SpatialAssetMetadata
  mounted: boolean
}>): XrV2ViewerObservation {
  const assetRef = String(input.assetRef || '').trim()
  if (!assetRef) throw new TypeError('saved immersive render requires an asset reference')
  if (!input.mounted && viewerObservation.savedAssetRef !== assetRef) return viewerObservation
  if (!isXrV2SpatialAssetMetadata(input.metadata)) {
    throw new TypeError('saved immersive render requires exact persisted metadata')
  }
  const sameAsset = viewerObservation.savedAssetRef === assetRef
  const previous = sameAsset ? viewerObservation : ZERO_VIEWER_OBSERVATION
  const webXrArSavedAssetRendered = input.mode === 'immersive-ar'
    ? input.mounted
    : previous.webXrArSavedAssetRendered
  const webXrVrSavedAssetRendered = input.mode === 'immersive-vr'
    ? input.mounted
    : previous.webXrVrSavedAssetRendered
  const anyMounted = webXrArSavedAssetRendered || webXrVrSavedAssetRendered
    || previous.depthParallaxAssetMounted || previous.flatFallbackMounted
  viewerObservation = Object.freeze({
    ...previous,
    webXrArSavedAssetRendered,
    webXrVrSavedAssetRendered,
    savedAssetRef: anyMounted ? assetRef : null,
    savedAssetMetadata: anyMounted ? Object.freeze({ ...input.metadata }) : null,
    revision: viewerObservation.revision + 1,
  })
  refreshRuntimeSnapshot()
  return viewerObservation
}

export function startXrV2WorkspaceReadinessRuntime(): void {
  if (running) return
  running = true
  const currentGeneration = ++generation
  runtimeBasis = null
  viewerObservation = ZERO_VIEWER_OBSERVATION
  resetXrV2DeliveryObservation()
  publish(Object.freeze({ ...idleSnapshot(), status: 'probing' }))
  authoringUnsubscribe = subscribeXrAuthoringEcsRuntime(refreshRuntimeSnapshot)
  mountedUnsubscribe = subscribeMountedAuthoringEvidence(refreshRuntimeSnapshot)
  deliveryUnsubscribe = subscribeXrV2DeliveryObservation(refreshRuntimeSnapshot)
  void collectReadinessBasis({}, {})
    .then(basis => {
      if (running && generation === currentGeneration) {
        runtimeBasis = basis
        refreshRuntimeSnapshot()
      }
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
  mountedUnsubscribe?.()
  mountedUnsubscribe = null
  deliveryUnsubscribe?.()
  deliveryUnsubscribe = null
  runtimeBasis = null
  viewerObservation = ZERO_VIEWER_OBSERVATION
  resetXrV2DeliveryObservation()
  publish(idleSnapshot())
}

export function readXrV2WorkspaceReadiness(): XrV2WorkspaceReadinessSnapshot {
  return snapshot
}

export function subscribeXrV2WorkspaceReadiness(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
