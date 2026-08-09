import type { XrCapabilityEntryMode } from '../../lib/three/ThreeGraphXrSessionPolicy'
import { projectAuthoringEcsRows } from './authoringEcsProjection'
import {
  BEHAVIOR_GRAPH_SCHEMA,
  createExactOnceBehaviorDispatcher,
} from './behaviorDispatcher'
import { XR_V2_CONTRACT_VERSION, XR_V2_STEREO_PAIR_SCHEMA } from './captureContracts'
import { createXrV2CaptureSession } from './captureSession'
import { compileMeshStandardMaterialGraph, MATERIAL_GRAPH_SCHEMA } from './materialGraph'
import { advanceParticleEmitter, createParticleEmitter } from './particleEmitter'
import { XR_V2_PINNED_SOURCE_REVISION } from './pinnedSourceAuthority'
import { createPreviewDeltaChannel, PREVIEW_DELTA_SCHEMA } from './previewDeltaChannel'
import { interpolateBoneTimeline, interpolateNumericTimeline } from './timelineInterpolation'

export { XR_V2_PINNED_SOURCE_REVISION } from './pinnedSourceAuthority'
export const XR_V2_PINNED_CONFORMANCE_SCHEMA =
  'knowgrph-xr-v2-pinned-contract-conformance/v1' as const

export const XR_V2_PINNED_CAPABILITY_TIERS = Object.freeze([
  'webxr-ar',
  'webxr-vr',
  'pseudo-ar-depth-parallax',
  'flat-fallback',
] as const)

export type XrV2PinnedCapabilityTier = (typeof XR_V2_PINNED_CAPABILITY_TIERS)[number]
export type XrV2PinnedRuntimeObservation =
  | 'liveDepthModel'
  | 'referenceFrameBudget'
  | 'physicalDeviceMatrix'
  | 'progressiveViewerMatrix'
  | 'mountedEcsRendering'
  | 'compiledShaderMeshRender'
  | 'trackPreservingContainerMux'
  | 'connectedPreviewTransport'

export type XrV2PinnedCriterionId =
  | 'AC-1' | 'AC-2' | 'AC-3' | 'AC-4' | 'AC-5' | 'AC-6'
  | 'AC-7' | 'AC-8' | 'AC-9' | 'AC-10' | 'AC-11' | 'AC-12'

export type XrV2PinnedCriterionEvidence = Readonly<{
  criterion: XrV2PinnedCriterionId
  status: 'deterministic-proven' | 'partial'
  deterministicEvidence: readonly string[]
  blockedBy: readonly XrV2PinnedRuntimeObservation[]
}>

export type XrV2PinnedDeterministicEvidence = Readonly<{
  capabilityMatrixComplete: boolean
  captureFrameCount: number
  stereoFrameCount: number
  stereoCoverage: number
  rawFramesUnique: boolean
  fallbackWithinConfiguredBreaches: boolean
  postProcessJobQueued: boolean
  ecsQueryCorrect: boolean
  materialGraphCompiled: boolean
  behaviorExactOnce: boolean
  behaviorUnwiredNoop: boolean
  particleCeilingRespected: boolean
  timelineInterpolationMatched: boolean
  processLocalPreviewPropagated: boolean
}>

export type XrV2PinnedContractConformanceEvidence = Readonly<{
  schema: typeof XR_V2_PINNED_CONFORMANCE_SCHEMA
  pinnedSourceRevision: typeof XR_V2_PINNED_SOURCE_REVISION
  contractVersion: typeof XR_V2_CONTRACT_VERSION
  overall: 'partial'
  deterministic: XrV2PinnedDeterministicEvidence
  runtimeObservations: Readonly<Record<XrV2PinnedRuntimeObservation, 'not-observed'>>
  acceptanceCriteria: readonly XrV2PinnedCriterionEvidence[]
}>

export type XrV2PinnedConformanceValidationResult =
  | Readonly<{ status: 'valid'; evidence: XrV2PinnedContractConformanceEvidence }>
  | Readonly<{
      status: 'invalid'
      reason:
        | 'invalid-envelope'
        | 'invalid-authority'
        | 'deterministic-proof-incomplete'
        | 'runtime-observation-overreach'
        | 'invalid-acceptance-ledger'
    }>

/**
 * Compatibility projection for the pinned four-tier vocabulary. The canonical
 * five-mode policy remains the owner; platform constraints are admitted facts,
 * not browser-identity inference.
 */
export function resolveXrV2PinnedCapabilityTier(input: Readonly<{
  entryMode: XrCapabilityEntryMode
  immersiveMode?: 'immersive-ar' | 'immersive-vr' | null
  platformWebXrAllowed: boolean
  depthParallaxAvailable: boolean
}>): XrV2PinnedCapabilityTier {
  if (input.platformWebXrAllowed && input.entryMode === 'immersive-session') {
    if (input.immersiveMode === 'immersive-ar') return 'webxr-ar'
    if (input.immersiveMode === 'immersive-vr') return 'webxr-vr'
  }
  return input.depthParallaxAvailable ? 'pseudo-ar-depth-parallax' : 'flat-fallback'
}

const RUNTIME_OBSERVATION_KEYS = Object.freeze([
  'liveDepthModel',
  'referenceFrameBudget',
  'physicalDeviceMatrix',
  'progressiveViewerMatrix',
  'mountedEcsRendering',
  'compiledShaderMeshRender',
  'trackPreservingContainerMux',
  'connectedPreviewTransport',
] as const satisfies readonly XrV2PinnedRuntimeObservation[])

const DETERMINISTIC_KEYS = Object.freeze([
  'behaviorExactOnce',
  'behaviorUnwiredNoop',
  'capabilityMatrixComplete',
  'captureFrameCount',
  'ecsQueryCorrect',
  'fallbackWithinConfiguredBreaches',
  'materialGraphCompiled',
  'particleCeilingRespected',
  'postProcessJobQueued',
  'processLocalPreviewPropagated',
  'rawFramesUnique',
  'stereoCoverage',
  'stereoFrameCount',
  'timelineInterpolationMatched',
] as const satisfies readonly (keyof XrV2PinnedDeterministicEvidence)[])

const CRITERION_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `AC-${index + 1}` as XrV2PinnedCriterionId),
)

function freezeCriterion(
  criterion: XrV2PinnedCriterionId,
  deterministicEvidence: readonly string[],
  blockedBy: readonly XrV2PinnedRuntimeObservation[] = [],
): XrV2PinnedCriterionEvidence {
  return Object.freeze({
    criterion,
    status: blockedBy.length === 0 ? 'deterministic-proven' : 'partial',
    deterministicEvidence: Object.freeze([...deterministicEvidence]),
    blockedBy: Object.freeze([...blockedBy]),
  })
}

function acceptanceLedger(): readonly XrV2PinnedCriterionEvidence[] {
  return Object.freeze([
    freezeCriterion('AC-1', ['capabilityMatrixComplete'], ['physicalDeviceMatrix']),
    freezeCriterion(
      'AC-2',
      ['stereoCoverage', 'rawFramesUnique'],
      ['liveDepthModel', 'referenceFrameBudget'],
    ),
    freezeCriterion('AC-3', ['fallbackWithinConfiguredBreaches', 'postProcessJobQueued']),
    freezeCriterion('AC-4', ['capabilityMatrixComplete'], ['progressiveViewerMatrix']),
    freezeCriterion('AC-5', ['capabilityMatrixComplete'], ['physicalDeviceMatrix']),
    freezeCriterion('AC-6', ['ecsQueryCorrect'], ['mountedEcsRendering']),
    freezeCriterion('AC-7', ['materialGraphCompiled'], ['compiledShaderMeshRender']),
    freezeCriterion('AC-8', ['behaviorExactOnce', 'behaviorUnwiredNoop']),
    freezeCriterion('AC-9', ['particleCeilingRespected']),
    freezeCriterion('AC-10', ['timelineInterpolationMatched']),
    freezeCriterion('AC-11', [], ['trackPreservingContainerMux']),
    freezeCriterion('AC-12', ['processLocalPreviewPropagated'], ['connectedPreviewTransport']),
  ])
}

function capabilityMatrixComplete(): boolean {
  const matrix = [
    resolveXrV2PinnedCapabilityTier({
      entryMode: 'immersive-session', immersiveMode: 'immersive-ar',
      platformWebXrAllowed: true, depthParallaxAvailable: true,
    }),
    resolveXrV2PinnedCapabilityTier({
      entryMode: 'immersive-session', immersiveMode: 'immersive-vr',
      platformWebXrAllowed: true, depthParallaxAvailable: false,
    }),
    resolveXrV2PinnedCapabilityTier({
      entryMode: 'monocular-capture', platformWebXrAllowed: false,
      depthParallaxAvailable: true,
    }),
    resolveXrV2PinnedCapabilityTier({
      entryMode: 'inline-viewer', platformWebXrAllowed: false,
      depthParallaxAvailable: false,
    }),
  ]
  const iOSConstrained = matrix.slice(2).every(
    tier => tier === 'pseudo-ar-depth-parallax' || tier === 'flat-fallback',
  )
  return iOSConstrained
    && matrix.every(tier => XR_V2_PINNED_CAPABILITY_TIERS.includes(tier))
    && new Set(matrix).size === XR_V2_PINNED_CAPABILITY_TIERS.length
}

async function captureEvidence(): Promise<Readonly<{
  captureFrameCount: number
  stereoFrameCount: number
  stereoCoverage: number
  rawFramesUnique: boolean
  fallbackWithinConfiguredBreaches: boolean
  postProcessJobQueued: boolean
}>> {
  let liveClockMs = 0
  const liveRawFrames: number[] = []
  const liveStereoFrames: number[] = []
  const liveSession = createXrV2CaptureSession<number, number, string>({
    sessionId: 'pinned-conformance-live',
    configuration: { frameBudgetMs: 50, consecutiveBudgetBreaches: 2, maxFrames: 10 },
    clock: { now: () => liveClockMs },
    artifactSink: {
      writeRawFrame: frame => { liveRawFrames.push(frame.frameIndex) },
      writeDepthEstimate: () => undefined,
      finalize: () => ({ rawClipRef: 'memory://live/raw', depthMetadataRef: 'memory://live/depth' }),
    },
    depthEstimator: {
      estimate: frame => {
        liveClockMs += 10
        return { depth: frame.frame, confidence: 1 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame }) => {
        if (frame.frameIndex === 9) throw new Error('bounded synthetic preview omission')
        return {
          schema: XR_V2_STEREO_PAIR_SCHEMA,
          frameIndex: frame.frameIndex,
          capturedAtMs: frame.capturedAtMs,
          left: `left-${frame.frameIndex}`,
          right: `right-${frame.frameIndex}`,
        }
      },
    },
    onStereoPair: pair => { liveStereoFrames.push(pair.frameIndex) },
  })
  liveSession.start()
  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    await liveSession.processFrame({ frameIndex, capturedAtMs: frameIndex * 33, frame: frameIndex })
  }
  await liveSession.complete()

  let fallbackClockMs = 0
  const timedFallbackSession = createXrV2CaptureSession<number, number, number>({
    sessionId: 'pinned-conformance-fallback',
    configuration: { frameBudgetMs: 20, consecutiveBudgetBreaches: 2, maxFrames: 3 },
    clock: { now: () => fallbackClockMs },
    artifactSink: {
      writeRawFrame: () => undefined,
      writeDepthEstimate: () => undefined,
      finalize: () => ({ rawClipRef: 'memory://fallback/raw', depthMetadataRef: 'memory://fallback/depth' }),
    },
    depthEstimator: {
      estimate: frame => {
        fallbackClockMs += 25
        return { depth: frame.frame, confidence: 1 }
      },
    },
    stereoSynthesizer: {
      synthesize: ({ frame }) => ({
        schema: XR_V2_STEREO_PAIR_SCHEMA,
        frameIndex: frame.frameIndex,
        capturedAtMs: frame.capturedAtMs,
        left: frame.frame,
        right: frame.frame,
      }),
    },
  })
  timedFallbackSession.start()
  await timedFallbackSession.processFrame({ frameIndex: 0, capturedAtMs: 0, frame: 0 })
  const fallbackSnapshot = await timedFallbackSession.processFrame({ frameIndex: 1, capturedAtMs: 33, frame: 1 })
  await timedFallbackSession.processFrame({ frameIndex: 2, capturedAtMs: 66, frame: 2 })
  const fallbackResult = await timedFallbackSession.complete()

  return Object.freeze({
    captureFrameCount: liveRawFrames.length,
    stereoFrameCount: liveStereoFrames.length,
    stereoCoverage: liveStereoFrames.length / liveRawFrames.length,
    rawFramesUnique: new Set(liveRawFrames).size === liveRawFrames.length,
    fallbackWithinConfiguredBreaches: fallbackSnapshot.phase === 'capturing-raw'
      && fallbackSnapshot.fallback?.triggeredAtFrameIndex === 1,
    postProcessJobQueued: fallbackResult.postProcessJob?.status === 'queued'
      && fallbackResult.postProcessJob.rawClipRef === 'memory://fallback/raw'
      && fallbackResult.postProcessJob.depthMetadataRef === 'memory://fallback/depth',
  })
}

function authoringEvidence(): Omit<XrV2PinnedDeterministicEvidence,
  'capabilityMatrixComplete' | 'captureFrameCount' | 'stereoFrameCount' | 'stereoCoverage'
  | 'rawFramesUnique' | 'fallbackWithinConfiguredBreaches' | 'postProcessJobQueued'> {
  const ecs = projectAuthoringEcsRows([
    { entityId: 0, componentName: 'Transform', fields: { x: 4, y: 8 } },
    { entityId: 1, componentName: 'Transform', fields: { x: 16, y: 32 } },
    { entityId: 1, componentName: 'Visible', fields: { value: true } },
  ], ['Transform'])
  const ecsQueryCorrect = ecs.status === 'ready'
    && ecs.projection.entities.map(entity => entity.entityId).join(',') === '0,1'

  const material = compileMeshStandardMaterialGraph({
    schema: MATERIAL_GRAPH_SCHEMA,
    nodes: [
      { id: 'base', type: 'number', value: 0.5 },
      { id: 'gain', type: 'number', value: 0.5 },
      { id: 'roughness', type: 'multiply', left: 'base', right: 'gain' },
      { id: 'albedo', type: 'color', value: '#336699' },
      { id: 'output', type: 'mesh-standard-output', bindings: { color: 'albedo', roughness: 'roughness' } },
    ],
  })
  const materialGraphCompiled = material.status === 'ready'
    && material.descriptor.parameters.roughness === 0.25

  let behaviorInvocations = 0
  const dispatcher = createExactOnceBehaviorDispatcher({
    schema: BEHAVIOR_GRAPH_SCHEMA,
    actions: [{ id: 'show', kind: 'show-panel', targetEntityId: 1 }],
    behaviors: [{ id: 'on-select', trigger: 'select', sourceEntityId: 1, actionIds: ['show'] }],
  }, () => { behaviorInvocations += 1 })
  const wired = dispatcher.dispatch({ id: 'wired', revision: 1, trigger: 'select', sourceEntityId: 1 })
  const replay = dispatcher.dispatch({ id: 'wired', revision: 1, trigger: 'select', sourceEntityId: 1 })
  const unwired = dispatcher.dispatch({ id: 'unwired', revision: 2, trigger: 'hover-enter', sourceEntityId: 1 })

  let particles = createParticleEmitter({ ratePerSecond: 20, lifetimeSeconds: 0.5, ceiling: 5 })
  let maximumParticleCount = 0
  for (let step = 0; step < 20; step += 1) {
    particles = advanceParticleEmitter(particles, 0.1).state
    maximumParticleCount = Math.max(maximumParticleCount, particles.particles.length)
  }

  const numericValue = interpolateNumericTimeline([
    { timeSeconds: 0, value: 0 },
    { timeSeconds: 2, value: 10 },
  ], 1)
  const bonePose = interpolateBoneTimeline([
    { timeSeconds: 0, value: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
    { timeSeconds: 2, value: { translation: [2, 4, 6], rotation: [0, 1, 0, 0], scale: [3, 3, 3] } },
  ], 1)

  const preview = createPreviewDeltaChannel({ streamId: 'pinned.preview', maxBufferedDeltas: 2 })
  let previewRevision = 0
  preview.subscribe(delta => { previewRevision = delta.revision })
  const previewResult = preview.publish({
    schema: PREVIEW_DELTA_SCHEMA,
    streamId: 'pinned.preview',
    baseRevision: 0,
    revision: 1,
    payload: { transform: { x: 1 } },
  })
  const processLocalPreviewPropagated = previewResult.status === 'accepted'
    && previewRevision === 1
    && preview.snapshot().revision === 1
  preview.close()

  return Object.freeze({
    ecsQueryCorrect,
    materialGraphCompiled,
    behaviorExactOnce: wired.status === 'dispatched'
      && replay.status === 'stale'
      && behaviorInvocations === 1,
    behaviorUnwiredNoop: unwired.status === 'dispatched'
      && unwired.invokedActionIds.length === 0
      && behaviorInvocations === 1,
    particleCeilingRespected: maximumParticleCount <= 5,
    timelineInterpolationMatched: Math.abs(numericValue - 5) < 1e-12
      && Math.abs(bonePose.translation[0] - 1) < 1e-12
      && Math.abs(bonePose.rotation[1] - Math.SQRT1_2) < 1e-12,
    processLocalPreviewPropagated,
  })
}

export async function runXrV2PinnedContractConformanceProbe():
Promise<XrV2PinnedContractConformanceEvidence> {
  const capture = await captureEvidence()
  const deterministic = Object.freeze({
    capabilityMatrixComplete: capabilityMatrixComplete(),
    ...capture,
    ...authoringEvidence(),
  })
  const runtimeObservations = Object.freeze(Object.fromEntries(
    RUNTIME_OBSERVATION_KEYS.map(key => [key, 'not-observed'] as const),
  )) as Readonly<Record<XrV2PinnedRuntimeObservation, 'not-observed'>>
  return Object.freeze({
    schema: XR_V2_PINNED_CONFORMANCE_SCHEMA,
    pinnedSourceRevision: XR_V2_PINNED_SOURCE_REVISION,
    contractVersion: XR_V2_CONTRACT_VERSION,
    overall: 'partial',
    deterministic,
    runtimeObservations,
    acceptanceCriteria: acceptanceLedger(),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function hasExactStringValues(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index])
}

export function validateXrV2PinnedContractConformanceEvidence(
  candidate: unknown,
): XrV2PinnedConformanceValidationResult {
  if (!isRecord(candidate) || !hasExactKeys(candidate, [
    'acceptanceCriteria', 'contractVersion', 'deterministic', 'overall',
    'pinnedSourceRevision', 'runtimeObservations', 'schema',
  ])) return { status: 'invalid', reason: 'invalid-envelope' }
  if (candidate.schema !== XR_V2_PINNED_CONFORMANCE_SCHEMA
    || candidate.pinnedSourceRevision !== XR_V2_PINNED_SOURCE_REVISION
    || candidate.contractVersion !== XR_V2_CONTRACT_VERSION
    || candidate.overall !== 'partial') {
    return { status: 'invalid', reason: 'invalid-authority' }
  }
  if (!isRecord(candidate.deterministic)
    || !hasExactKeys(candidate.deterministic, DETERMINISTIC_KEYS)) {
    return { status: 'invalid', reason: 'deterministic-proof-incomplete' }
  }
  const deterministic = candidate.deterministic as Record<string, unknown>
  for (const key of DETERMINISTIC_KEYS) {
    if (key === 'captureFrameCount' || key === 'stereoFrameCount' || key === 'stereoCoverage') continue
    if (deterministic[key] !== true) {
      return { status: 'invalid', reason: 'deterministic-proof-incomplete' }
    }
  }
  if (!Number.isSafeInteger(deterministic.captureFrameCount)
    || !Number.isSafeInteger(deterministic.stereoFrameCount)
    || (deterministic.captureFrameCount as number) <= 0
    || (deterministic.stereoFrameCount as number) <= 0
    || typeof deterministic.stereoCoverage !== 'number'
    || !Number.isFinite(deterministic.stereoCoverage)
    || deterministic.stereoCoverage < 0.9
    || deterministic.stereoCoverage > 1) {
    return { status: 'invalid', reason: 'deterministic-proof-incomplete' }
  }
  if (!isRecord(candidate.runtimeObservations)
    || !hasExactKeys(candidate.runtimeObservations, RUNTIME_OBSERVATION_KEYS)
    || Object.values(candidate.runtimeObservations).some(value => value !== 'not-observed')) {
    return { status: 'invalid', reason: 'runtime-observation-overreach' }
  }
  if (!Array.isArray(candidate.acceptanceCriteria)
    || candidate.acceptanceCriteria.length !== CRITERION_IDS.length) {
    return { status: 'invalid', reason: 'invalid-acceptance-ledger' }
  }
  const expectedLedger = acceptanceLedger()
  for (const [index, entry] of candidate.acceptanceCriteria.entries()) {
    const expected = expectedLedger[index]
    if (!isRecord(entry)
      || !hasExactKeys(entry, ['blockedBy', 'criterion', 'deterministicEvidence', 'status'])
      || entry.criterion !== expected.criterion
      || entry.status !== expected.status
      || !hasExactStringValues(entry.deterministicEvidence, expected.deterministicEvidence)
      || !hasExactStringValues(entry.blockedBy, expected.blockedBy)) {
      return { status: 'invalid', reason: 'invalid-acceptance-ledger' }
    }
  }
  return { status: 'valid', evidence: candidate as XrV2PinnedContractConformanceEvidence }
}
