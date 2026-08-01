import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  readXrMotionReferencePlan,
  serializeXrMotionReferencePlan,
  type XrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import {
  addXrMotionReferenceSubject,
  hydrateXrMotionReferenceRuntime,
  readXrMotionReferenceRuntime,
  removeXrMotionReferenceCastMark,
  retimeXrMotionReferenceCastMark,
  setXrMotionReferenceCastMarkChoreography,
  setXrMotionReferenceCastTransition,
  setXrMotionReferenceDuration,
  setXrMotionReferenceStage,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import { controlLocalXrScene } from '@/features/three/xrSceneMcpRuntime'
import {
  attachXrPhysicsBody,
  hydrateXrPhysicsRuntime,
  playXrPhysicsRuntime,
  stopXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'
import { resolveXrSubjectFootprint } from '@/features/three/xrMotionReferenceSubjectPlacement'
import {
  isXrConstrainedMotionPlanSafe,
} from '@/features/three/xrConstrainedMotionEdits'
import { XR_SUBJECT_MOTION_COLLISION_GAP_METERS } from '@/features/three/xrSubjectMotionConstraints'
import {
  hydrateCanonicalXrMotionReferenceRuntime,
  hydrateCanonicalXrPhysicsRuntime,
} from '@/features/three/XrMotionReferenceRuntimeBridge'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function serializedPlan(plan = readXrMotionReferenceRuntime().plan): string {
  return JSON.stringify(serializeXrMotionReferencePlan(plan))
}

function hydrateRuntimeFixture(sceneKey: string, value: unknown): XrMotionReferencePlan {
  const plan = readXrMotionReferencePlan(value)
  hydrateXrMotionReferenceRuntime({
    sceneKey,
    nodes: [],
    persistedValue: serializeXrMotionReferencePlan(plan),
  })
  hydrateXrPhysicsRuntime({
    sceneKey,
    persistedValue: null,
    subjects: plan.subjects.map(subject => ({
      subjectId: subject.id,
      position: subject.position,
      sizeMeters: resolveXrSubjectFootprint(subject).sizeMeters,
    })),
  })
  return readXrMotionReferenceRuntime().plan
}

function assertRuntimeMutationRejected(label: string, mutate: () => unknown): void {
  const before = readXrMotionReferenceRuntime()
  const beforePlan = serializedPlan(before.plan)
  let publishes = 0
  const unsubscribe = subscribeXrMotionReferenceRuntime(() => { publishes += 1 })
  try {
    mutate()
  } finally {
    unsubscribe()
  }
  const after = readXrMotionReferenceRuntime()
  assert(publishes === 0, `${label}: expected no rejected-plan publish, got ${publishes}`)
  assert(after.revision === before.revision, `${label}: expected the runtime revision to remain ${before.revision}, got ${after.revision}`)
  assert(serializedPlan(after.plan) === beforePlan, `${label}: expected the complete previous plan to remain byte-stable`)
}

function assertRuntimeMutationSafeOrRejected(
  label: string,
  sceneKey: string,
  mutate: () => unknown,
): void {
  const before = readXrMotionReferenceRuntime()
  const beforePlan = serializedPlan(before.plan)
  let publishes = 0
  let unsafePublishes = 0
  const unsubscribe = subscribeXrMotionReferenceRuntime(() => {
    publishes += 1
    if (!isXrConstrainedMotionPlanSafe({ plan: readXrMotionReferenceRuntime().plan, sceneKey })) {
      unsafePublishes += 1
    }
  })
  try {
    mutate()
  } finally {
    unsubscribe()
  }
  const after = readXrMotionReferenceRuntime()
  assert(unsafePublishes === 0, `${label}: an unsafe rebuilt action path was published`)
  if (publishes === 0) {
    assert(after.revision === before.revision, `${label}: a rejected rebuild must retain its revision`)
    assert(serializedPlan(after.plan) === beforePlan, `${label}: a rejected rebuild must retain its complete plan`)
    return
  }
  assert(publishes === 1, `${label}: expected at most one atomic safe publish, got ${publishes}`)
  assert(isXrConstrainedMotionPlanSafe({ plan: after.plan, sceneKey }), `${label}: applied rebuild must satisfy the shared motion owner`)
}

function installSceneControlFixture(documentName: string, value: unknown): XrMotionReferencePlan {
  const plan = readXrMotionReferencePlan(value)
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: { [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan) },
  }
  useGraphStore.setState({
    markdownDocumentName: documentName,
    markdownDocumentText: `# ${documentName}`,
    graphData,
    selectedNodeId: null,
  } as never)
  hydrateCanonicalXrMotionReferenceRuntime()
  hydrateCanonicalXrPhysicsRuntime()
  return readXrMotionReferenceRuntime().plan
}

function assertSceneControlRejectedAtomically(
  label: string,
  value: unknown,
  input: Parameters<typeof controlLocalXrScene>[0],
): void {
  installSceneControlFixture(`${label}.md`, value)
  const beforeRuntime = readXrMotionReferenceRuntime()
  const beforePlan = serializedPlan(beforeRuntime.plan)
  const beforePersisted = JSON.stringify(
    useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY],
  )
  const result = controlLocalXrScene(input)
  const afterRuntime = readXrMotionReferenceRuntime()
  const afterPersisted = JSON.stringify(
    useGraphStore.getState().graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY],
  )
  assert(!result.ok, `${label}: expected constrained XR scene control to reject, got ${JSON.stringify(result)}`)
  assert(afterRuntime.revision === beforeRuntime.revision, `${label}: expected no rejected runtime revision`)
  assert(serializedPlan(afterRuntime.plan) === beforePlan, `${label}: expected no partial authored-plan mutation`)
  assert(afterPersisted === beforePersisted, `${label}: expected no partial graph-metadata persistence`)
}

function testAssetOnlyLargeVehicleSwapRejectsOverlap(): void {
  assertSceneControlRejectedAtomically('asset-only-large-vehicle-overlap', {
    stageId: 'tropical-playground',
    subjects: [
      { id: 'swap-target', assetId: 'prop-crate', label: 'Swap target', position: [-2, 0, 0] },
      { id: 'swap-peer', assetId: 'prop-crate', label: 'Swap peer', position: [2, 0, 0] },
    ],
  }, {
    action: 'transform',
    subjectId: 'swap-target',
    assetId: 'vehicle-helicopter',
  })
}

function testCombinedAssetTransformRejectsAtomically(): void {
  const sedan = readXrMotionReferencePlan({
    subjects: [{ id: 'sedan', assetId: 'vehicle-sedan', position: [0, 0, 0] }],
  }).subjects[0]!
  const crate = readXrMotionReferencePlan({
    subjects: [{ id: 'crate', assetId: 'prop-crate', position: [0, 0, 0] }],
  }).subjects[0]!
  const contactX = -(resolveXrSubjectFootprint(sedan).halfX
    + resolveXrSubjectFootprint(crate).halfX
    + XR_SUBJECT_MOTION_COLLISION_GAP_METERS)
  assertSceneControlRejectedAtomically('combined-asset-transform-obstruction', {
    stageId: 'tropical-playground',
    subjects: [
      { id: 'combined-target', assetId: 'prop-crate', label: 'Combined target', position: [contactX, 0, 0] },
      { id: 'combined-peer', assetId: 'prop-crate', label: 'Combined peer', position: [0, 0, 0] },
    ],
  }, {
    action: 'transform',
    subjectId: 'combined-target',
    assetId: 'vehicle-sedan',
    position: [contactX + 0.05, 0, 0],
  })
}

function testStageRebuildFailsClosed(): void {
  const sceneKey = 'acceptance:stage-rebuild'
  hydrateRuntimeFixture('acceptance:stage-rebuild', {
    stageId: 'neutral-volume',
    durationSeconds: 8,
    subjects: [{ id: 'stage-sedan', assetId: 'vehicle-sedan', position: [0, 0, 0] }],
    cast: [{
      actorId: 'stage-sedan',
      animation: { kind: 'action-path', presetId: 'car-chase', startTimeSeconds: 0, loop: false },
      marks: [{ timeSeconds: 0, position: [0, 0, 0], transition: 'hold', gait: 'wheeled' }],
    }],
  })
  assertRuntimeMutationSafeOrRejected('stage action-path rebuild', sceneKey, () => setXrMotionReferenceStage('street-grid'))
}

function testDurationRebuildFailsClosed(): void {
  const sceneKey = 'acceptance:duration-rebuild'
  const preservedTimes = [0, 1.44, 3.04, 4.64, 6.24, 8]
  hydrateRuntimeFixture(sceneKey, {
    stageId: 'neutral-volume',
    durationSeconds: 8,
    subjects: [
      { id: 'duration-sedan', assetId: 'vehicle-sedan', position: [0, 0, 0] },
      { id: 'duration-peer', assetId: 'prop-crate', position: [-6.72, 0, 2.4] },
    ],
    cast: [{
      actorId: 'duration-sedan',
      animation: { kind: 'action-path', presetId: 'car-chase', startTimeSeconds: 0, loop: false },
      marks: preservedTimes.map(timeSeconds => ({
        timeSeconds,
        position: [0, 0, 0],
        transition: 'hold',
        gait: 'wheeled',
      })),
    }],
  })
  assertRuntimeMutationSafeOrRejected('duration action-path rebuild', sceneKey, () => setXrMotionReferenceDuration(9))
}

function testRemovingDetourRejectsUnsafeCrossing(): void {
  const plan = hydrateRuntimeFixture('acceptance:remove-detour', {
    stageId: 'neutral-volume',
    durationSeconds: 2,
    subjects: [
      { id: 'detour-mover', assetId: 'prop-crate', position: [-3, 0, 0] },
      { id: 'detour-peer', assetId: 'prop-crate', position: [0, 0, 0] },
    ],
    cast: [{ actorId: 'detour-mover', marks: [
      { timeSeconds: 0, position: [-3, 0, 0], transition: 'linear', gait: 'walk' },
      { timeSeconds: 1, position: [-3, 0, 3], transition: 'linear', gait: 'walk' },
      { timeSeconds: 2, position: [3, 0, 0], transition: 'linear', gait: 'walk' },
    ] }],
  })
  const detourMarkId = plan.cast.find(track => track.actorId === 'detour-mover')!.marks[1]!.id
  assertRuntimeMutationRejected('remove detour topology edit', () => (
    removeXrMotionReferenceCastMark('detour-mover', detourMarkId)
  ))
}

function testRetimingMarksRejectsRelativeCrossing(): void {
  const plan = hydrateRuntimeFixture('acceptance:retime-crossing', {
    stageId: 'neutral-volume',
    durationSeconds: 2,
    subjects: [
      { id: 'retime-mover', assetId: 'prop-crate', position: [-3, 0, 0] },
      { id: 'retime-peer', assetId: 'prop-crate', position: [0, 0, -3] },
    ],
    cast: [
      { actorId: 'retime-mover', marks: [
        { timeSeconds: 0, position: [-3, 0, 0], transition: 'linear', gait: 'walk' },
        { timeSeconds: 1, position: [3, 0, 0], transition: 'linear', gait: 'walk' },
      ] },
      { actorId: 'retime-peer', marks: [
        { timeSeconds: 0, position: [0, 0, -3], transition: 'hold', gait: 'hold' },
        { timeSeconds: 1, position: [0, 0, -3], transition: 'linear', gait: 'walk' },
        { timeSeconds: 2, position: [0, 0, 3], transition: 'linear', gait: 'walk' },
      ] },
    ],
  })
  const moverEndMarkId = plan.cast.find(track => track.actorId === 'retime-mover')!.marks[1]!.id
  assertRuntimeMutationRejected('retime relative-crossing topology edit', () => (
    retimeXrMotionReferenceCastMark('retime-mover', moverEndMarkId, 2)
  ))
}

function testPlacementDoesNotInvalidateFuturePath(): void {
  hydrateRuntimeFixture('acceptance:future-path-placement', {
    stageId: 'neutral-volume',
    durationSeconds: 2,
    subjects: [{ id: 'future-mover', assetId: 'prop-crate', position: [4, 0, 4] }],
    cast: [{ actorId: 'future-mover', marks: [
      { timeSeconds: 0, position: [4, 0, 4], transition: 'linear', gait: 'walk' },
      { timeSeconds: 2, position: [-4.48, 0, -1.8], transition: 'linear', gait: 'walk' },
    ] }],
  })
  assertRuntimeMutationRejected('new subject future-path invalidation', () => (
    addXrMotionReferenceSubject({ assetId: 'prop-crate', label: 'Future blocker' })
  ))
}

const EASED_COLLISION_DISTANCE_METERS = 7.5
const EASED_COLLISION_PROGRESS = Math.sqrt(0.1)
const EASED_PEER_ZERO_PROGRESS = 2 * EASED_COLLISION_PROGRESS - EASED_COLLISION_PROGRESS ** 2

function easedPeerCollisionFixture(
  sceneKey: string,
  moverStartX = -EASED_COLLISION_DISTANCE_METERS * 0.1,
  moverTravelMeters = EASED_COLLISION_DISTANCE_METERS,
): XrMotionReferencePlan {
  const distance = EASED_COLLISION_DISTANCE_METERS
  const peerProgress = EASED_PEER_ZERO_PROGRESS
  return hydrateRuntimeFixture(sceneKey, {
    stageId: 'neutral-volume',
    durationSeconds: 1,
    subjects: [
      { id: 'eased-mover', assetId: 'animal-cat', position: [moverStartX, 0, 0] },
      { id: 'eased-peer', assetId: 'animal-cat', position: [0, 0, distance * peerProgress] },
    ],
    cast: [
      { actorId: 'eased-mover', marks: [
        { timeSeconds: 0, position: [moverStartX, 0, 0], transition: 'linear', gait: 'walk' },
        { timeSeconds: 1, position: [moverStartX + moverTravelMeters, 0, 0], transition: 'linear', gait: 'walk' },
      ] },
      { actorId: 'eased-peer', marks: [
        { timeSeconds: 0, position: [0, 0, distance * peerProgress], transition: 'ease-out', gait: 'walk' },
        { timeSeconds: 1, position: [0, 0, -distance * (1 - peerProgress)], transition: 'ease-out', gait: 'walk' },
      ] },
    ],
  })
}

function testTransitionRejectsEasedMidSegmentCollision(): void {
  const sceneKey = 'acceptance:eased-transition-collision'
  const plan = easedPeerCollisionFixture(sceneKey, -0.3, 7)
  assert(isXrConstrainedMotionPlanSafe({ plan, sceneKey }), 'linear baseline must remain collision-free before the easing edit')
  assertRuntimeMutationRejected('transition eased mid-segment collision', () => (
    setXrMotionReferenceCastTransition('eased-mover', 'hold')
  ))
}

function testConfigureMarkRejectsEasedMidSegmentCollision(): void {
  const sceneKey = 'acceptance:eased-mark-collision'
  const plan = easedPeerCollisionFixture(sceneKey)
  const markId = plan.cast.find(track => track.actorId === 'eased-mover')!.marks[0]!.id
  assertRuntimeMutationRejected('configure-mark eased mid-segment collision', () => (
    setXrMotionReferenceCastMarkChoreography({ actorId: 'eased-mover', markId, easing: 'ease-in' })
  ))
}

function testPhysicsOwnershipRejectsTemporalEdits(): void {
  const plan = hydrateRuntimeFixture('acceptance:physics-owned-easing', {
    durationSeconds: 1,
    subjects: [{ id: 'owned-mover', assetId: 'animal-cat', position: [-1, 0, 0] }],
    cast: [{ actorId: 'owned-mover', marks: [
      { timeSeconds: 0, position: [-1, 0, 0], transition: 'linear', gait: 'walk' },
      { timeSeconds: 1, position: [1, 0, 0], transition: 'linear', gait: 'walk' },
    ] }],
  })
  const markId = plan.cast[0]!.marks[0]!.id
  attachXrPhysicsBody({ subjectId: 'owned-mover' })
  playXrPhysicsRuntime()
  try {
    assertRuntimeMutationRejected('physics-owned transition', () => (
      setXrMotionReferenceCastTransition('owned-mover', 'hold')
    ))
    assertRuntimeMutationRejected('physics-owned configure-mark easing', () => (
      setXrMotionReferenceCastMarkChoreography({ actorId: 'owned-mover', markId, easing: 'ease-in' })
    ))
  } finally {
    stopXrPhysicsRuntime()
  }
}

function testLivePoseStatusDependsOnPoseAvailability(): void {
  const panelSource = readFileSync(
    resolve(process.cwd(), 'src/features/three/MotionControlFloatingPanelView.tsx'),
    'utf8',
  )
  const targetSource = readFileSync(
    resolve(process.cwd(), 'src/features/three/MotionControlTargetCards.tsx'),
    'utf8',
  )
  assert(panelSource.includes('livePoseActive={Boolean(state.pose)}'), 'Motion Control must derive live-pose status from an accepted pose frame')
  assert(!panelSource.includes("running={state.phase === 'running'}"), 'runtime phase alone must not claim a live pose override')
  assert(targetSource.includes('livePoseActive: boolean')
    && targetSource.includes("livePoseActive ? 'live pose override'"), 'target status must consume actual live-pose availability')
  assert(!targetSource.includes("running ? 'live pose override'"), 'target status must not infer live pose from a running phase')
}

export function testXrMotionControlAcceptanceConstraints(): void {
  const previous = useGraphStore.getState()
  const previousSurface = {
    markdownDocumentName: previous.markdownDocumentName,
    markdownDocumentText: previous.markdownDocumentText,
    graphData: previous.graphData,
    selectedNodeId: previous.selectedNodeId,
  }
  const cases: readonly [string, () => void][] = [
    ['asset-only large vehicle swap', testAssetOnlyLargeVehicleSwapRejectsOverlap],
    ['combined asset and transform', testCombinedAssetTransformRejectsAtomically],
    ['stage rebuild', testStageRebuildFailsClosed],
    ['duration rebuild', testDurationRebuildFailsClosed],
    ['remove topology edit', testRemovingDetourRejectsUnsafeCrossing],
    ['retime topology edit', testRetimingMarksRejectsRelativeCrossing],
    ['future-path placement', testPlacementDoesNotInvalidateFuturePath],
    ['transition eased collision', testTransitionRejectsEasedMidSegmentCollision],
    ['configure-mark eased collision', testConfigureMarkRejectsEasedMidSegmentCollision],
    ['physics-owned temporal edits', testPhysicsOwnershipRejectsTemporalEdits],
    ['live-pose status', testLivePoseStatusDependsOnPoseAvailability],
  ]
  const failures: string[] = []
  try {
    for (const [label, run] of cases) {
      try {
        run()
      } catch (error) {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
  assert(failures.length === 0, `XR Motion Control acceptance regressions:\n- ${failures.join('\n- ')}`)
}
