import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildXrAnimationActionPath } from '@/features/three/xrAnimationCatalog'
import { controlLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  readXrMotionReferencePlan,
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceFacingY,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import { readXrPhysicsWorld } from '@/features/three/xrPhysicsModel'
import {
  attachXrPhysicsBody,
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsBodyState,
  readXrPhysicsRuntime,
  stepXrPhysicsRuntimeTicks,
  stopXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'
import { XR_SUBJECT_STAGE_EDGE_GAP_METERS, resolveXrSubjectFootprint } from '@/features/three/xrMotionReferenceSubjectPlacement'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { XR_SUBJECT_MOTION_COLLISION_GAP_METERS, resolveXrSubjectMotion } from '@/features/three/xrSubjectMotionConstraints'
import { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'

function installAnimationControlFixture(documentName: string, plan: ReturnType<typeof readXrMotionReferencePlan>): string {
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
  return readXrMotionReferenceRuntime().plan.cast[0]!.marks[0]!.id
}

function controlledMarkPosition(actorId: string, markId: string): readonly [number, number, number] {
  return readXrMotionReferenceRuntime().plan.cast
    .find(track => track.actorId === actorId)!
    .marks.find(mark => mark.id === markId)!
    .position
}
export function testXrSubjectMotionIsFootprintCollisionAndPhysicsAware(): void {
  const plan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'moving-crate', assetId: 'prop-crate', position: [-3, 0, 0] },
      { id: 'blocking-crate', assetId: 'prop-crate', position: [0, 0, 0] },
      { id: 'rotated-car', assetId: 'vehicle-sedan', rotationYDegrees: 90, position: [0, 0, 4] },
    ],
    cast: [{ actorId: 'moving-crate', marks: [{ timeSeconds: 0, position: [-3, 0, 0] }] }],
  })
  const stoppedPhysics = {
    sceneKey: 'movement-constraints', ownerSourceSignature: '', sourceSignature: '', phase: 'stopped' as const,
    world: readXrPhysicsWorld(null), staticColliderCount: 0, dirty: false, revision: 0,
  }
  const collisionLimited = resolveXrSubjectMotion({
    actorId: 'moving-crate', desiredPosition: [7, 0, 0], physics: stoppedPhysics,
    plan, position: [-3, 0, 0], timeSeconds: 0,
  })
  const edgeLimited = resolveXrSubjectMotion({
    actorId: 'rotated-car', desiredPosition: [20, 0, 20], physics: stoppedPhysics,
    plan, position: [0, 0, 4], timeSeconds: 0,
  })
  const physicsOwned = resolveXrSubjectMotion({
    actorId: 'moving-crate', desiredPosition: [-2, 0, 0],
    physics: {
      ...stoppedPhysics,
      phase: 'playing',
      world: readXrPhysicsWorld({ bodies: { 'moving-crate': { mode: 'dynamic' } } }),
    },
    plan, position: [-3, 0, 0], timeSeconds: 0,
  })
  const pathFacingPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'path-facing-car', assetId: 'vehicle-sedan', position: [0, 0, 0] }],
    cast: [{ actorId: 'path-facing-car', marks: [
      { timeSeconds: 0, position: [0, 0, 0] },
      { timeSeconds: 1, position: [1, 0, 0] },
    ] }],
  })
  const pathFacingLimited = resolveXrSubjectMotion({
    actorId: 'path-facing-car', desiredPosition: [20, 0, 0], physics: stoppedPhysics,
    plan: pathFacingPlan, position: [0, 0, 0], timeSeconds: 0,
  })
  const proposedFacingPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'proposed-facing-car', assetId: 'vehicle-sedan', position: [0, 0, 0] }],
    cast: [{ actorId: 'proposed-facing-car', marks: [
      { timeSeconds: 0, position: [0, 0, 0] },
      { timeSeconds: 1, position: [0, 0, 1] },
    ] }],
  })
  const proposedFacingMark = proposedFacingPlan.cast[0]!.marks[1]!
  const proposedFacingLimited = resolveXrSubjectMotion({
    actorId: 'proposed-facing-car', desiredPosition: [20, 0, 0], markId: proposedFacingMark.id,
    physics: stoppedPhysics, plan: proposedFacingPlan, position: proposedFacingMark.position, timeSeconds: 1,
  })
  const challengingFacingLimited = resolveXrSubjectMotion({
    actorId: 'proposed-facing-car', desiredPosition: [6.4, 0, 100], markId: proposedFacingMark.id,
    physics: stoppedPhysics, plan: proposedFacingPlan, position: proposedFacingMark.position, timeSeconds: 1,
  })
  const challengingMarks = proposedFacingPlan.cast[0]!.marks.map(mark => mark.id === proposedFacingMark.id
    ? { ...mark, position: challengingFacingLimited.position }
    : mark)
  const challengingFootprint = resolveXrSubjectFootprint(
    proposedFacingPlan.subjects[0]!,
    sampleXrMotionReferenceFacingY(challengingMarks, 1),
  )
  const challengingStage = resolveXrMotionReferenceStage(proposedFacingPlan.stageId)
  const slideFacingPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'slide-facing-sedan', assetId: 'vehicle-sedan', position: [-3.3129, 0, -3.2919] },
      { id: 'slide-facing-peer', assetId: 'prop-crate', position: [2.6184, 0, -0.0307] },
    ],
    cast: [{ actorId: 'slide-facing-sedan', marks: [
      { timeSeconds: 0, position: [-2.9722, 0, -1.8146] },
      { timeSeconds: 1, position: [-3.3129, 0, -3.2919] },
    ] }],
  })
  const slideFacingMark = slideFacingPlan.cast[0]!.marks[1]!
  const slideFacingLimited = resolveXrSubjectMotion({
    actorId: 'slide-facing-sedan', desiredPosition: [14.8322, 0, -8.2504], markId: slideFacingMark.id,
    physics: stoppedPhysics, plan: slideFacingPlan, position: slideFacingMark.position, timeSeconds: 1,
  })
  const slideFacingMarks = slideFacingPlan.cast[0]!.marks.map(mark => mark.id === slideFacingMark.id
    ? { ...mark, position: slideFacingLimited.position }
    : mark)
  const slideFacingFootprint = resolveXrSubjectFootprint(
    slideFacingPlan.subjects[0]!,
    sampleXrMotionReferenceFacingY(slideFacingMarks, 1),
  )
  const slideFacingStage = resolveXrMotionReferenceStage(slideFacingPlan.stageId)
  const slideFacingPeerFootprint = resolveXrSubjectFootprint(slideFacingPlan.subjects[1]!)
  const slideFacingPeerPosition = slideFacingPlan.subjects[1]!.position
  const slideFacingOverlap = Math.abs(slideFacingLimited.position[0] - slideFacingPeerPosition[0])
      < slideFacingFootprint.halfX + slideFacingPeerFootprint.halfX + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
    && Math.abs(slideFacingLimited.position[2] - slideFacingPeerPosition[2])
      < slideFacingFootprint.halfZ + slideFacingPeerFootprint.halfZ + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
    && Math.abs((slideFacingLimited.position[1] + slideFacingFootprint.halfY)
      - (slideFacingPeerPosition[1] + slideFacingPeerFootprint.halfY))
      < slideFacingFootprint.halfY + slideFacingPeerFootprint.halfY + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
  const slideFacingInsideStage = Math.abs(slideFacingLimited.position[0]) + slideFacingFootprint.halfX
      + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= slideFacingStage.sizeMeters[0] / 2
    && Math.abs(slideFacingLimited.position[2]) + slideFacingFootprint.halfZ
      + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= slideFacingStage.sizeMeters[1] / 2
  const slideSweepPlan = readXrMotionReferencePlan({
    stageId: 'aerial-sky',
    subjects: [{ id: 'slide-sweep-helicopter', assetId: 'vehicle-helicopter', position: [9, 0, 4] }, { id: 'slide-sweep-peer', assetId: 'prop-crate', position: [0, 0, -4.1] }],
    cast: [{ actorId: 'slide-sweep-helicopter', marks: [{ timeSeconds: 0, position: [9, 0, -5] }, { timeSeconds: 1, position: [9, 0, 4] }] }],
  })
  const slideSweepMark = slideSweepPlan.cast[0]!.marks[1]!
  const slideSweepLimited = resolveXrSubjectMotion({ actorId: 'slide-sweep-helicopter', desiredPosition: [-9, 0, -5], markId: slideSweepMark.id,
    physics: stoppedPhysics, plan: slideSweepPlan, position: slideSweepMark.position, startTimeSeconds: 0, timeSeconds: 1 })
  const relativeSweepPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'crossing-mover', assetId: 'prop-crate', position: [-3, 0, 0] }, { id: 'crossing-peer', assetId: 'prop-crate', position: [0, 0, -3] }],
    cast: [
      { actorId: 'crossing-mover', marks: [{ timeSeconds: 0, position: [-3, 0, 0] }, { timeSeconds: 1, position: [3, 0, 0] }] },
      { actorId: 'crossing-peer', marks: [{ timeSeconds: 0, position: [0, 0, -3] }, { timeSeconds: 1, position: [0, 0, 3] }] },
    ],
  })
  const relativeSweepLimited = resolveXrSubjectMotion({ actorId: 'crossing-mover', desiredPosition: [3, 0, 0], physics: stoppedPhysics,
    plan: relativeSweepPlan, position: [-3, 0, 0], startTimeSeconds: 0, timeSeconds: 1 })
  const overlapPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'overlapping-crate', assetId: 'prop-crate', position: [1.4, 0, 0] },
      { id: 'overlapping-car', assetId: 'vehicle-sedan', position: [0, 0, 0] },
    ],
  })
  const overlapLimited = resolveXrSubjectMotion({
    actorId: 'overlapping-crate', desiredPosition: [0, 0, 2.8], physics: stoppedPhysics,
    plan: overlapPlan, position: [1.4, 0, 0], timeSeconds: 0,
  })
  const overlapTunnelLimited = resolveXrSubjectMotion({
    actorId: 'overlapping-crate', desiredPosition: [-3, 0, 0], physics: stoppedPhysics,
    plan: overlapPlan, position: [1.4, 0, 0], timeSeconds: 0,
  })
  const elevatedPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'elevated-crate', assetId: 'prop-crate', position: [-2, 10, 0] },
      { id: 'ground-crate', assetId: 'prop-crate', position: [0, 0, 0] },
    ],
  })
  const elevatedCrossing = resolveXrSubjectMotion({
    actorId: 'elevated-crate', desiredPosition: [2, 10, 0], physics: stoppedPhysics,
    plan: elevatedPlan, position: [-2, 10, 0], timeSeconds: 0,
  })
  const crateHalfX = resolveXrSubjectFootprint(elevatedPlan.subjects[0]!).halfX
  const exactClearance = crateHalfX * 2 + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
  const exactClearancePlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'clearance-moving-crate', assetId: 'prop-crate', position: [-exactClearance, 0, 0] },
      { id: 'clearance-peer-crate', assetId: 'prop-crate', position: [0, 0, 0] },
    ],
  })
  const separatingFromClearance = resolveXrSubjectMotion({
    actorId: 'clearance-moving-crate', desiredPosition: [-2, 0, 0], physics: stoppedPhysics,
    plan: exactClearancePlan, position: [-exactClearance, 0, 0], timeSeconds: 0,
  })
  const enteringFromClearance = resolveXrSubjectMotion({
    actorId: 'clearance-moving-crate', desiredPosition: [-0.5, 0, 0], physics: stoppedPhysics,
    plan: exactClearancePlan, position: [-exactClearance, 0, 0], timeSeconds: 0,
  })
  const unobstructedVerticalPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'vertical-moving-crate', assetId: 'prop-crate', position: [0, 0, 0] }],
  })
  const unobstructedVerticalMove = resolveXrSubjectMotion({
    actorId: 'vertical-moving-crate', desiredPosition: [0, 2, 0], physics: stoppedPhysics,
    plan: unobstructedVerticalPlan, position: [0, 0, 0], timeSeconds: 0,
  })
  const stageFloorLimited = resolveXrSubjectMotion({
    actorId: 'vertical-moving-crate', desiredPosition: [0, -2, 0], physics: stoppedPhysics,
    plan: unobstructedVerticalPlan, position: [0, 2, 0], timeSeconds: 0,
  })
  const coordinateCeilingLimited = resolveXrSubjectMotion({
    actorId: 'vertical-moving-crate', desiredPosition: [0, 100, 0], physics: stoppedPhysics,
    plan: unobstructedVerticalPlan, position: [0, 2, 0], timeSeconds: 0,
  })
  const correctedMarkPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'corrected-mark-crate', assetId: 'prop-crate', position: [0, 0, 0] }],
    cast: [{ actorId: 'corrected-mark-crate', marks: [{ timeSeconds: 0, position: [100, 0, 0] }] }],
  })
  const correctedMarkPosition = correctedMarkPlan.cast[0]!.marks[0]!.position
  const correctedMark = resolveXrSubjectMotion({
    actorId: 'corrected-mark-crate', desiredPosition: correctedMarkPosition, physics: stoppedPhysics,
    plan: correctedMarkPlan, position: correctedMarkPosition, timeSeconds: 0,
  })
  const verticalCollisionPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'vertical-tunneling-crate', assetId: 'prop-crate', position: [0, 0, 0] },
      { id: 'vertical-peer-crate', assetId: 'prop-crate', position: [0, 2, 0] },
    ],
  })
  const verticalTunnelLimited = resolveXrSubjectMotion({
    actorId: 'vertical-tunneling-crate', desiredPosition: [0, 4, 0], physics: stoppedPhysics,
    plan: verticalCollisionPlan, position: [0, 0, 0], timeSeconds: 0,
  })
  const crateHeight = resolveXrSubjectFootprint(verticalCollisionPlan.subjects[0]!).halfY * 2
  const verticalClearance = 2 - crateHeight - XR_SUBJECT_MOTION_COLLISION_GAP_METERS
  const verticalClearancePlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'vertical-clearance-crate', assetId: 'prop-crate', position: [0, verticalClearance, 0] },
      { id: 'vertical-clearance-peer', assetId: 'prop-crate', position: [0, 2, 0] },
    ],
  })
  const separatingVerticallyFromClearance = resolveXrSubjectMotion({
    actorId: 'vertical-clearance-crate', desiredPosition: [0, 0, 0], physics: stoppedPhysics,
    plan: verticalClearancePlan, position: [0, verticalClearance, 0], timeSeconds: 0,
  })
  const enteringVerticallyFromClearance = resolveXrSubjectMotion({
    actorId: 'vertical-clearance-crate', desiredPosition: [0, 1.5, 0], physics: stoppedPhysics,
    plan: verticalClearancePlan, position: [0, verticalClearance, 0], timeSeconds: 0,
  })
  const livePeerPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'live-moving-crate', assetId: 'prop-crate', position: [2, 0, 0] },
      { id: 'live-peer-crate', assetId: 'prop-crate', position: [0, 0, 0] },
    ],
  })
  const livePeerPhysics = {
    ...stoppedPhysics,
    phase: 'playing' as const,
    world: readXrPhysicsWorld({ bodies: { 'live-peer-crate': { mode: 'dynamic' } } }),
  }
  const livePeerLimited = resolveXrSubjectMotion({
    actorId: 'live-moving-crate', desiredPosition: [5, 0, 0], physics: livePeerPhysics,
    physicsFrame: {
      elapsedSeconds: 1,
      stepCount: 60,
      bodies: [{ subjectId: 'live-peer-crate', position: [5, 0, 0], velocity: [5, 0, 0], grounded: false, contacts: [] }],
    },
    plan: livePeerPlan, position: [2, 0, 0], timeSeconds: 0,
  })
  if (collisionLimited.position[0] >= -1.07
    || Math.abs(edgeLimited.position[0] - 5.125) > 1e-9
    || Math.abs(edgeLimited.position[2] - 4.49) > 1e-9
    || Math.abs(pathFacingLimited.position[0] - 5.125) > 1e-9
    || Math.abs(proposedFacingLimited.position[0] - 5.125) > 1e-9
    || Math.abs(challengingFacingLimited.position[0]) + challengingFootprint.halfX + XR_SUBJECT_STAGE_EDGE_GAP_METERS > challengingStage.sizeMeters[0] / 2 + 1e-12
    || Math.abs(challengingFacingLimited.position[2]) + challengingFootprint.halfZ + XR_SUBJECT_STAGE_EDGE_GAP_METERS > challengingStage.sizeMeters[1] / 2 + 1e-12
    || slideFacingLimited.status !== 'partial'
    || slideFacingOverlap
    || !slideFacingInsideStage
    || slideSweepLimited.status !== 'partial'
    || slideSweepLimited.position.join(',') !== '9,0,-5'
    || relativeSweepLimited.status !== 'partial'
    || Math.abs(relativeSweepLimited.position[0] + 1.081) > 1e-12
    || overlapLimited.status !== 'obstructed'
    || overlapLimited.position[0] !== 1.4
    || overlapLimited.position[2] !== 0
    || overlapTunnelLimited.status !== 'obstructed'
    || overlapTunnelLimited.position[0] !== 1.4
    || elevatedCrossing.position[0] !== 2
    || separatingFromClearance.status !== 'moved'
    || separatingFromClearance.position[0] !== -2
    || enteringFromClearance.status !== 'obstructed'
    || enteringFromClearance.position[0] !== -exactClearance
    || unobstructedVerticalMove.status !== 'moved'
    || unobstructedVerticalMove.position[1] !== 2
    || stageFloorLimited.status !== 'partial'
    || stageFloorLimited.position[1] !== 0
    || coordinateCeilingLimited.status !== 'partial'
    || coordinateCeilingLimited.position[1] !== 50
    || correctedMarkPosition[0] !== 50
    || correctedMark.status !== 'partial'
    || Math.abs(correctedMark.position[0] - 6.9) > 1e-9
    || verticalTunnelLimited.status !== 'partial'
    || verticalTunnelLimited.position[1] >= verticalClearance
    || separatingVerticallyFromClearance.status !== 'moved'
    || separatingVerticallyFromClearance.position[1] !== 0
    || enteringVerticallyFromClearance.status !== 'obstructed'
    || enteringVerticallyFromClearance.position[1] !== verticalClearance
    || livePeerLimited.position[0] >= 4.13
    || physicsOwned.status !== 'physics-owned'
    || physicsOwned.position[0] !== -3) {
    throw new Error(`expected one footprint-, candidate-facing-, relative-trajectory-, path-facing-, slide-safe-, live-physics-peer-, overlap-, three-dimensional-, coordinate-bounded-, separating-clearance-, collision-, and physics-aware authored motion resolver, got ${JSON.stringify({ challengingFacingLimited, collisionLimited, coordinateCeilingLimited, correctedMark, edgeLimited, elevatedCrossing, enteringFromClearance, enteringVerticallyFromClearance, livePeerLimited, overlapLimited, overlapTunnelLimited, pathFacingLimited, physicsOwned, proposedFacingLimited, relativeSweepLimited, separatingFromClearance, separatingVerticallyFromClearance, slideFacingInsideStage, slideFacingLimited, slideFacingOverlap, slideSweepLimited, stageFloorLimited, unobstructedVerticalMove, verticalTunnelLimited })}`)
  }
}
export function testXrPhysicsHydrationUsesFullSourceIdentity(): void {
  const previous = useGraphStore.getState()
  const previousSurface = {
    markdownDocumentName: previous.markdownDocumentName,
    markdownDocumentText: previous.markdownDocumentText,
    graphData: previous.graphData,
    selectedNodeId: previous.selectedNodeId,
  }
  const plan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [{ id: 'hydration-body', assetId: 'prop-crate', position: [0, 1, 0] }],
  })
  const metadata = {
    [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan),
  }
  const graph = (nodeId: string): GraphData => ({
    type: 'Graph',
    nodes: [{ id: nodeId, label: 'Source identity', type: 'Concept', properties: {} }],
    edges: [],
    metadata,
  })
  const hydrate = (graphData: GraphData) => {
    useGraphStore.setState({
      markdownDocumentName: 'Shared hydration identity.md',
      markdownDocumentText: '# Shared hydration identity',
      graphData,
      selectedNodeId: null,
    } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
  try {
    hydrate(graph('source-graph-a'))
    const first = readXrPhysicsRuntime()
    attachXrPhysicsBody({
      subjectId: 'hydration-body',
      patch: { mode: 'dynamic', initialVelocity: [1, 0, 0] },
    })
    playXrPhysicsRuntime()
    stepXrPhysicsRuntimeTicks(1)
    const activeBody = readXrPhysicsBodyState('hydration-body')
    hydrate(graph('source-graph-a'))
    const reused = readXrPhysicsRuntime()
    if (reused.phase !== 'playing'
      || reused.ownerSourceSignature !== first.ownerSourceSignature
      || reused.sourceSignature !== first.sourceSignature
      || !activeBody
      || activeBody.position[0] <= 0) {
      throw new Error(`expected an unchanged source identity to preserve active physics transport, got ${JSON.stringify({ activeBody, first, reused })}`)
    }
    hydrate(graph('source-graph-b'))
    const replaced = readXrPhysicsRuntime()
    const resetBody = readXrPhysicsBodyState('hydration-body')
    if (replaced.sceneKey !== first.sceneKey
      || replaced.phase !== 'stopped'
      || replaced.ownerSourceSignature === first.ownerSourceSignature
      || replaced.sourceSignature === first.sourceSignature
      || resetBody !== null
      || replaced.world.bodies.length !== 0) {
      throw new Error(`expected a distinct source graph sharing document name/type to replace stale active physics, got ${JSON.stringify({ first, replaced, resetBody })}`)
    }
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
export function testXrAnimationMcpReportsConstrainedMoveObjectResolution(): void {
  const previous = useGraphStore.getState()
  const previousSurface = {
    markdownDocumentName: previous.markdownDocumentName,
    markdownDocumentText: previous.markdownDocumentText,
    graphData: previous.graphData,
    selectedNodeId: previous.selectedNodeId,
    canvasRenderMode: previous.canvasRenderMode,
    canvas3dMode: previous.canvas3dMode,
    floatingPanelOpen: previous.floatingPanelOpen,
    floatingPanelView: previous.floatingPanelView,
    bottomSurfaceTab: previous.bottomSurfaceTab,
    bottomSurfaceCollapsed: previous.bottomSurfaceCollapsed,
  }
  try {
    const movedPlan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [{ id: 'mcp-mover', assetId: 'prop-crate', position: [0, 0, 0] }],
      cast: [{ actorId: 'mcp-mover', label: 'MCP Mover', marks: [{ timeSeconds: 0, position: [0, 0, 0] }] }],
    })
    const movedMarkId = installAnimationControlFixture('MCP constrained moved.md', movedPlan)
    const moved = controlLocalAnimation({
      operation: 'move-object', targetId: 'mcp-mover', markId: movedMarkId, keys: ['d'], distanceMeters: 1,
    })
    const movedPosition = controlledMarkPosition('mcp-mover', movedMarkId)
    if (!moved.ok
      || moved.motion?.status !== 'moved'
      || moved.motion.requestedDistanceMeters !== 1
      || Math.abs(moved.motion.appliedDistanceMeters - 1) > 1e-12
      || Math.abs(moved.motion.position[0] - 1) > 1e-12
      || moved.motion.position.join(',') !== movedPosition.join(',')) {
      throw new Error(`expected move-object to report and persist its actual unconstrained displacement, got ${JSON.stringify({ moved, movedPosition })}`)
    }
    const boundarySubject = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [{ id: 'boundary-mover', assetId: 'prop-crate', position: [0, 0, 0] }],
    }).subjects[0]!
    const boundaryStage = resolveXrMotionReferenceStage('neutral-volume')
    const boundaryFootprint = resolveXrSubjectFootprint(boundarySubject)
    const boundaryX = boundaryStage.sizeMeters[0] / 2 - boundaryFootprint.halfX - XR_SUBJECT_STAGE_EDGE_GAP_METERS
    const boundaryStartX = boundaryX - 0.25
    const boundaryPlan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [{ id: 'boundary-mover', assetId: 'prop-crate', position: [boundaryStartX, 0, 0] }],
      cast: [{ actorId: 'boundary-mover', label: 'Boundary Mover', marks: [{ timeSeconds: 0, position: [boundaryStartX, 0, 0] }] }],
    })
    const boundaryMarkId = installAnimationControlFixture('MCP constrained boundary.md', boundaryPlan)
    const boundary = controlLocalAnimation({
      operation: 'move-object', targetId: 'boundary-mover', markId: boundaryMarkId, keys: ['d'], distanceMeters: 1,
    })
    const boundaryPosition = controlledMarkPosition('boundary-mover', boundaryMarkId)
    if (!boundary.ok
      || boundary.motion?.status !== 'partial'
      || boundary.motion.requestedDistanceMeters !== 1
      || Math.abs(boundary.motion.appliedDistanceMeters - 0.25) > 1e-9
      || Math.abs(boundary.motion.position[0] - boundaryX) > 1e-9
      || boundary.motion.position.join(',') !== boundaryPosition.join(',')
      || !boundary.message.includes('0.250 m of 1.000 m requested')) {
      throw new Error(`expected move-object to report its stage-limited actual displacement and partial status, got ${JSON.stringify({ boundary, boundaryPosition })}`)
    }
    const obstructedPlan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [
        { id: 'obstructed-mover', assetId: 'prop-crate', position: [0, 0, 0] },
        { id: 'blocking-peer', assetId: 'prop-crate', position: [0, 0, 0] },
      ],
      cast: [{ actorId: 'obstructed-mover', label: 'Obstructed Mover', marks: [{ timeSeconds: 0, position: [0, 0, 0] }] }],
    })
    const obstructedMarkId = installAnimationControlFixture('MCP constrained obstructed.md', obstructedPlan)
    const obstructed = controlLocalAnimation({
      operation: 'move-object', targetId: 'obstructed-mover', markId: obstructedMarkId, keys: ['d'], distanceMeters: 0.25,
    })
    const obstructedPosition = controlledMarkPosition('obstructed-mover', obstructedMarkId)
    if (obstructed.ok
      || obstructed.motion?.status !== 'obstructed'
      || obstructed.motion.requestedDistanceMeters !== 0.25
      || obstructed.motion.appliedDistanceMeters !== 0
      || obstructed.motion.position.join(',') !== '0,0,0'
      || obstructedPosition.join(',') !== '0,0,0'
      || !obstructed.message.includes('obstructed by the authored XR scene')) {
      throw new Error(`expected move-object to report a peer-obstructed zero-displacement resolution without persistence, got ${JSON.stringify({ obstructed, obstructedPosition })}`)
    }
    const physicsOwnedPlan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [{ id: 'physics-owned-mover', assetId: 'prop-crate', position: [0, 0, 0] }],
      cast: [{ actorId: 'physics-owned-mover', label: 'Physics-owned Mover', marks: [{ timeSeconds: 0, position: [0, 0, 0] }] }],
    })
    const physicsOwnedMarkId = installAnimationControlFixture('MCP physics ownership.md', physicsOwnedPlan)
    attachXrPhysicsBody({ subjectId: 'physics-owned-mover', patch: { mode: 'dynamic' } })
    playXrPhysicsRuntime()
    const physicsOwnedMove = controlLocalAnimation({
      operation: 'move-object', targetId: 'physics-owned-mover', markId: physicsOwnedMarkId, keys: ['d'], distanceMeters: 1,
    })
    if (physicsOwnedMove.ok
      || physicsOwnedMove.motion?.status !== 'physics-owned'
      || physicsOwnedMove.motion.appliedDistanceMeters !== 0
      || readXrPhysicsRuntime().phase !== 'playing') {
      throw new Error(`expected same-scene Animation hydration to preserve live physics ownership, got ${JSON.stringify({ physicsOwnedMove, phase: readXrPhysicsRuntime().phase })}`)
    }
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
export function testXrAnimationActionPathsRespectPhysicsAndSceneGeometry(): void {
  const previous = useGraphStore.getState()
  const previousSurface = {
    markdownDocumentName: previous.markdownDocumentName,
    markdownDocumentText: previous.markdownDocumentText,
    graphData: previous.graphData,
    selectedNodeId: previous.selectedNodeId,
  }
  try {
    const plan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      durationSeconds: 8,
      subjects: [
        { id: 'action-sedan', assetId: 'vehicle-sedan', position: [-5, 0, 3] },
        { id: 'action-peer', assetId: 'vehicle-sedan', position: [0, 0, 0] },
        { id: 'action-performer', assetId: 'person-adult', position: [0, 0, -4] },
      ],
      cast: [
        { actorId: 'action-sedan', label: 'Action Sedan', marks: [{ timeSeconds: 0, position: [-5, 0, 3] }] },
        { actorId: 'action-peer', label: 'Action Peer', marks: [{ timeSeconds: 0, position: [0, 0, 0] }] },
        { actorId: 'action-performer', label: 'Action Performer', marks: [{ timeSeconds: 0, position: [0, 0, -4] }] },
      ],
    })
    installAnimationControlFixture('MCP action-path safety.md', plan)
    const applied = controlLocalAnimation({
      operation: 'apply', trackKind: 'action-path', presetId: 'car-chase', targetId: 'action-sedan',
    })
    const runtime = readXrMotionReferenceRuntime()
    const track = runtime.plan.cast.find(candidate => candidate.actorId === 'action-sedan')!
    const subject = runtime.plan.subjects.find(candidate => candidate.id === 'action-sedan')!
    const peer = runtime.plan.subjects.find(candidate => candidate.id === 'action-peer')!
    const peerFootprint = resolveXrSubjectFootprint(peer)
    const stage = resolveXrMotionReferenceStage(runtime.plan.stageId)
    const catalog = buildXrAnimationActionPath({
      presetId: 'car-chase', durationSeconds: 8, origin: [-5, 0, 3], stageSizeMeters: stage.sizeMeters,
    })
    const marksSafe = track.marks.every(mark => {
      const footprint = resolveXrSubjectFootprint(subject, sampleXrMotionReferenceFacingY(track.marks, mark.timeSeconds))
      const insideStage = Math.abs(mark.position[0]) + footprint.halfX + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= stage.sizeMeters[0] / 2
        && Math.abs(mark.position[2]) + footprint.halfZ + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= stage.sizeMeters[1] / 2
      const overlapsPeer = Math.abs(mark.position[0] - peer.position[0]) < footprint.halfX + peerFootprint.halfX + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
        && Math.abs(mark.position[2] - peer.position[2]) < footprint.halfZ + peerFootprint.halfZ + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
      return insideStage && !overlapsPeer
    })
    const safePositions = JSON.stringify(track.marks.map(mark => mark.position))
    hydrateCanonicalXrMotionReferenceRuntime()
    const roundTrippedPositions = JSON.stringify(readXrMotionReferenceRuntime().plan.cast
      .find(candidate => candidate.actorId === 'action-sedan')?.marks.map(mark => mark.position))
    if (!applied.ok
      || track.animation?.presetId !== 'car-chase'
      || track.marks.length !== catalog.length
      || track.marks.some((mark, index) => mark.timeSeconds !== catalog[index]?.timeSeconds)
      || !marksSafe
      || safePositions !== roundTrippedPositions) {
      throw new Error(`expected neutral-volume sedan action-path marks to preserve catalog timing and round-trip constrained footprint/peer-safe positions, got ${JSON.stringify({ applied, marksSafe, roundTrippedPositions, safePositions, track })}`)
    }
    attachXrPhysicsBody({ subjectId: 'action-sedan', patch: { mode: 'dynamic' } })
    attachXrPhysicsBody({ subjectId: 'action-performer', patch: { mode: 'dynamic' } })
    const playing = playXrPhysicsRuntime()
    if (playing.phase !== 'playing'
      || !playing.world.bodies.some(body => body.subjectId === 'action-sedan')
      || !playing.world.bodies.some(body => body.subjectId === 'action-performer')) {
      throw new Error(`expected the action-path ownership fixture to start both target bodies, got ${JSON.stringify(playing)}`)
    }
    const blockedApplyPlaying = controlLocalAnimation({ operation: 'apply', presetId: 'car-chase', targetId: 'action-sedan' })
    const blockedClearPlaying = controlLocalAnimation({ operation: 'clear', trackKind: 'action-path', targetId: 'action-sedan' })
    pauseXrPhysicsRuntime()
    const blockedApplyPaused = controlLocalAnimation({ operation: 'apply', presetId: 'car-chase', targetId: 'action-sedan' })
    const blockedClearPaused = controlLocalAnimation({ operation: 'clear', trackKind: 'action-path', targetId: 'action-sedan' })
    const performerMarks = JSON.stringify(readXrMotionReferenceRuntime().plan.cast.find(trackValue => trackValue.actorId === 'action-performer')?.marks)
    const characterMotion = controlLocalAnimation({ operation: 'apply', presetId: 'dance', targetId: 'action-performer' })
    const finalRuntime = readXrMotionReferenceRuntime()
    const finalSedan = finalRuntime.plan.cast.find(candidate => candidate.actorId === 'action-sedan')!
    const finalPerformer = finalRuntime.plan.cast.find(candidate => candidate.actorId === 'action-performer')!
    if (blockedApplyPlaying.ok || blockedClearPlaying.ok || blockedApplyPaused.ok || blockedClearPaused.ok
      || ![blockedApplyPlaying, blockedClearPlaying, blockedApplyPaused, blockedClearPaused].every(result => result.message.includes('Stop XR physics'))
      || JSON.stringify(finalSedan.marks.map(mark => mark.position)) !== safePositions
      || finalSedan.animation?.presetId !== 'car-chase'
      || !characterMotion.ok
      || finalPerformer.animation?.presetId !== 'dance'
      || JSON.stringify(finalPerformer.marks) !== performerMarks
      || readXrPhysicsRuntime().phase !== 'paused') {
      throw new Error(`expected playing/paused physics to block action-path position rewrites while character-motion-only assignment remains mark-preserving, got ${JSON.stringify({ blockedApplyPaused, blockedApplyPlaying, blockedClearPaused, blockedClearPlaying, characterMotion, phase: readXrPhysicsRuntime().phase })}`)
    }
  } finally {
    stopXrPhysicsRuntime()
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
