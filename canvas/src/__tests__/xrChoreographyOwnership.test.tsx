import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Box3, Box3Helper, BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime, selectXrMotionReferenceCameraMark, subscribeXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { controlXrSharedAssetControls, inspectXrSharedAssetControls } from '@/features/three/xrSharedAssetControlRuntime'
import { XrChoreographyInspector } from '@/features/three/XrChoreographyInspector'
import { XrSharedAssetControls } from '@/features/three/XrSharedAssetControls'
import { CameraMotionMarkRetime } from '@/features/three/CameraMotionMarkRetime'
import { updateXrSelectionBounds } from '@/features/three/XrSelectionBounds'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testXrChoreographyOwnership() {
  const previous = useGraphStore.getState()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const plan = readXrMotionReferencePlan({ stageId: 'neutral-volume', subjects: [
    { id: 'pig', assetId: 'character-pig', label: 'Renamed pig' },
    { id: 'boat', assetId: 'vehicle-sailboat', label: 'Sea Journey' },
  ], cast: [
    { actorId: 'pig', label: 'Stale name', marks: [{ timeSeconds: 0, position: [0, 0, 0] }, { timeSeconds: 2, position: [1, 0, 0], cue: 'huff' }] },
    { actorId: 'boat', label: 'Stale boat', marks: [{ timeSeconds: 0, position: [0, 0, 5] }] },
  ], camera: [{ timeSeconds: 0, anchorId: 'boat', easing: 'hold', label: 'Arrival', caption: 'The crew arrives.' }] })
  function Panels() {
    const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
    return <><XrChoreographyInspector runtime={runtime} selectedActorId={runtime.selectedActorId} cameraInvocation="/animation.configure" castInvocation="/animation.configure" controlTool="animation" invocationReady />
      <section data-test-timeline><CameraMotionMarkRetime layout="lane" laneTarget={{ kind: 'cast', actorId: 'pig' }} /><CameraMotionMarkRetime layout="lane" laneTarget={{ kind: 'camera' }} /></section>
      <XrSharedAssetControls surface="motion-control" /></>
  }
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({ markdownDocumentName: 'choreography.md', markdownDocumentText: '# Choreography', selectedNodeId: null,
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: { kgXrMotionReference: serializeXrMotionReferencePlan(plan) } },
      canvasRenderMode: '3d', canvas3dMode: 'xr' } as never)
    hydrateCanonicalXrMotionReferenceRuntime()
    controlXrSharedAssetControls({ operation: 'select-target', targetId: 'pig' })
    await mountReactRoot(root, <Panels />)
    const change = async (label: string, value: string) => act(async () => {
      const element = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!
      assert.ok(element, label)
      element.value = value
      element.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    const second = readXrMotionReferenceRuntime().plan.cast[0]!.marks[1]!
    await change('Cast choreography mark', second.id)
    await change('Cast mark gait', 'run')
    await change('Cast mark easing', 'hold')
    assert.equal(inspectXrSharedAssetControls().selectedMarkId, second.id)
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.label, 'Renamed pig')
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks[1]!.gait, 'run')
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks[1]!.transition, 'hold')
    assert.equal(readXrMotionReferenceRuntime().plan.cast[0]!.marks[1]!.cue, 'huff')
    assert.ok(container.querySelector('[aria-label="Renamed pig mark 2 time"]'), 'Animation selection reaches Timeline')
    assert.ok(container.querySelector('[data-test-timeline] [data-kg-xr-mark-gait]'), 'Timeline owns motion parameters')
    assert.equal(container.querySelector('[data-kg-xr-choreography-inspector] [data-kg-xr-choreography-mark-controls]'), null, 'FloatingPanel does not duplicate Timeline parameters')
    const motion = container.querySelector('[data-kg-xr-shared-asset-controls="motion-control"]')!
    assert.equal(motion.getAttribute('data-kg-xr-shared-asset-target'), 'pig')
    assert.equal(motion.querySelector('[data-kg-xr-shared-asset-preset-selector]'), null)
    await act(async () => { selectXrMotionReferenceCameraMark(readXrMotionReferenceRuntime().plan.camera[0]!.id) })
    await change('Camera mark easing', 'linear')
    assert.equal(readXrMotionReferenceRuntime().plan.camera[0]!.caption, 'The crew arrives.')
    assert.equal(readXrMotionReferenceRuntime().plan.camera[0]!.label, 'Arrival')
    assert.equal(inspectXrSharedAssetControls().selectedTargetId, 'boat', 'camera mark updates the shared target')
    assert.equal(motion.getAttribute('data-kg-xr-shared-asset-target'), 'boat')
    assert.match(container.querySelector('[data-kg-xr-choreography-card="cast"]')!.textContent!, /Sea Journey/)
    await change('Shared 3D for XR object, prop, subject, or NPC target', 'pig')
    assert.equal(readXrMotionReferenceRuntime().selectedActorId, 'pig')
    assert.match(container.querySelector('[data-kg-xr-choreography-card="cast"]')!.textContent!, /Renamed pig/)
  } finally {
    await unmountReactRoot(root)
    useGraphStore.setState(previous, true)
    hydrateCanonicalXrMotionReferenceRuntime()
    env.restore()
  }
}

export function testXrSelectionBoundsFollowGeometry() {
  const scene = new Group(), parent = new Group(), root = new Group()
  scene.add(parent); parent.add(root)
  parent.position.set(3, 2, -5); parent.rotation.y = 0.7; parent.scale.setScalar(2)
  const geometry = new BoxGeometry(1, 2, 3), mesh = new Mesh(geometry)
  root.add(mesh)
  const helper = new Box3Helper(new Box3(), 0xfacc15)
  parent.add(helper)
  for (const x of [0, 4, -2]) {
    mesh.position.x = x
    updateXrSelectionBounds(root, helper, new Matrix4())
    assert.ok(helper.box.equals(new Box3().setFromObject(root)))
    helper.updateMatrixWorld(true)
    assert.ok(new Vector3().setFromMatrixPosition(helper.matrixWorld).distanceTo(helper.box.getCenter(new Vector3())) < 0.000001)
  }
  root.remove(mesh)
  updateXrSelectionBounds(root, helper, new Matrix4())
  assert.equal(helper.visible, false, 'hidden story geometry has no selection outline')
  geometry.dispose(); helper.geometry.dispose()
  for (const material of Array.isArray(helper.material) ? helper.material : [helper.material]) material.dispose()
}
