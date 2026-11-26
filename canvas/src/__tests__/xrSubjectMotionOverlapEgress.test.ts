import assert from 'node:assert/strict'
import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlLocalAnimation } from '@/features/three/xrAnimationMcpRuntime'
import { XR_MOTION_REFERENCE_GRAPH_METADATA_KEY, readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { readXrPhysicsWorld } from '@/features/three/xrPhysicsModel'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { resolveXrSubjectMotion } from '@/features/three/xrSubjectMotionConstraints'
import { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'

function installFixture(documentName: string, plan: ReturnType<typeof readXrMotionReferencePlan>): string {
  const graphData: GraphData = {
    type: 'Graph', nodes: [], edges: [],
    metadata: { [XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]: serializeXrMotionReferencePlan(plan) },
  }
  useGraphStore.setState({ markdownDocumentName: documentName, markdownDocumentText: `# ${documentName}`, graphData, selectedNodeId: null } as never)
  hydrateCanonicalXrMotionReferenceRuntime()
  hydrateCanonicalXrPhysicsRuntime()
  return readXrMotionReferenceRuntime().plan.cast[0]!.marks[0]!.id
}

export function testXrSubjectMotionAllowsIncrementalOverlapEgress(): void {
  const overlapPlan = readXrMotionReferencePlan({
    stageId: 'neutral-volume',
    subjects: [
      { id: 'overlapping-crate', assetId: 'prop-crate', position: [1.4, 0, 0] },
      { id: 'overlapping-car', assetId: 'vehicle-sedan', position: [0, 0, 0] },
    ],
  })
  const stoppedPhysics = {
    sceneKey: 'movement-constraints', ownerSourceSignature: '', sourceSignature: '', phase: 'stopped' as const,
    world: readXrPhysicsWorld(null), staticColliderCount: 0, dirty: false, revision: 0,
  }
  const egress = resolveXrSubjectMotion({
    actorId: 'overlapping-crate', desiredPosition: [1.5, 0, 0], physics: stoppedPhysics,
    plan: overlapPlan, position: [1.4, 0, 0], timeSeconds: 0,
  })
  const deeper = resolveXrSubjectMotion({
    actorId: 'overlapping-crate', desiredPosition: [1.3, 0, 0], physics: stoppedPhysics,
    plan: overlapPlan, position: [1.4, 0, 0], timeSeconds: 0,
  })
  assert.equal(egress.status, 'moved', 'a short selected-object move can make progress out of an authored overlap')
  assert.equal(egress.position[0], 1.5)
  assert.equal(deeper.status, 'obstructed', 'a move deeper into the overlap stays blocked')
  assert.equal(deeper.position[0], 1.4)

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
    const plan = readXrMotionReferencePlan({
      stageId: 'neutral-volume',
      subjects: [
        { id: 'preexisting-collision-mover', assetId: 'prop-crate', position: [-3, 0, 0] },
        { id: 'preexisting-collision-peer', assetId: 'prop-crate', position: [0, 0, 0] },
      ],
      cast: [{ actorId: 'preexisting-collision-mover', marks: [
        { timeSeconds: 0, position: [-3, 0, 0], transition: 'linear' },
        { timeSeconds: 2, position: [3, 0, 0], transition: 'hold' },
      ] }],
    })
    const markId = installFixture('MCP constrained preexisting collision.md', plan)
    const moved = controlLocalAnimation({
      operation: 'move-object', targetId: 'preexisting-collision-mover', markId, keys: ['d'], distanceMeters: 0.1,
    })
    const position = readXrMotionReferenceRuntime().plan.cast[0]!.marks[0]!.position
    assert.equal(moved.motion?.status, 'moved', 'a safe local move works when another segment of the track already collides')
    assert.ok(Math.abs(position[0] - -2.9) <= 1e-9)
  } finally {
    useGraphStore.setState(previousSurface as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    hydrateCanonicalXrPhysicsRuntime()
  }
}
