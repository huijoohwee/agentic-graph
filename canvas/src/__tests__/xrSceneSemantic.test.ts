import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import type { XrMotionReferenceRuntimeSnapshot } from '@/features/three/xrMotionReferenceRuntimeSnapshot'
import { evaluateXrStudioExercises } from '@/features/three/xrSceneExercises'
import { projectXrStudioScene, queryXrStudioScene } from '@/features/three/xrSceneSemantic'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { inspectLocalXrSceneAssets } from '@/features/three/xrSceneMcpRuntime'
import { XrChoreographyInspector } from '@/features/three/XrChoreographyInspector'
import { persistXrScene } from '@/features/three/xrScenePersistence'
import {
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
  setXrMotionReferenceSubjectLabel,
} from '@/features/three/xrMotionReferenceRuntime'
import { serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

function snapshot(input: Record<string, unknown> = {}): XrMotionReferenceRuntimeSnapshot {
  const plan = readXrMotionReferencePlan({
    stageId: 'tropical-playground',
    castSource: 'subjects-only',
    durationSeconds: 4,
    subjects: [
      { id: 'actor', assetId: 'character-pig', label: 'Actor', position: [0, 0, 0] },
      { id: 'obstacle', assetId: 'furniture-table', label: 'Table', position: [4, 0, 0] },
    ],
    cast: [{ actorId: 'actor', marks: [
      { timeSeconds: 0, position: [0, 0, 0] },
      { timeSeconds: 2, position: [2, 0, 0] },
    ] }],
    camera: [{ timeSeconds: 2, anchorId: 'actor' }],
    ...input,
  })
  return {
    sceneKey: 'studio-test', sourceSignature: 'studio-test', plan,
    selectedActorId: 'actor', selectedShotTargetId: 'actor', selectedCameraRig: 'dolly',
    selectedMark: null, castMarkArmed: false, playheadSeconds: 2, dirty: false, revision: 42,
  }
}

export function testXrStudioSceneProjectionAndExercises(): void {
  const runtime = snapshot()
  const scene = projectXrStudioScene(runtime)
  assert.equal(scene.source, 'authored-plan')
  assert.equal(scene.revision, 42)
  assert.equal(scene.timeSeconds, 2)
  assert.deepEqual(scene.entities.find(entity => entity.id === 'actor')?.position, [2, 0, 0])
  assert.deepEqual(queryXrStudioScene(scene, { kind: 'category', category: 'furniture' }).matches.map(entity => entity.id), ['obstacle'])
  assert.deepEqual(queryXrStudioScene(scene, { kind: 'nearest', subjectId: 'actor' }).matches.map(entity => entity.id), ['obstacle'])
  assert.deepEqual(queryXrStudioScene(scene, { kind: 'within', center: [2, 0, 0], radiusMeters: 0.1 }).matches.map(entity => entity.id), ['actor'])
  assert.equal(queryXrStudioScene(scene, { kind: 'nearest', subjectId: 'missing' }).reason, 'missing-subject')
  assert.equal(queryXrStudioScene(scene, { kind: 'within', center: [0, 0, 0], radiusMeters: Number.NaN }).reason, 'invalid-query')
  assert.equal(queryXrStudioScene({ ...scene, complete: false }, { kind: 'category', category: 'people' }).reason, 'partial-scene')

  const exercises = evaluateXrStudioExercises(runtime)
  assert.equal(exercises.sceneRevision, scene.revision)
  assert.deepEqual(exercises.exercises.map(item => item.state), ['passed', 'passed', 'passed'])

  const missingCamera = evaluateXrStudioExercises(snapshot({ camera: [] }))
  assert.equal(missingCamera.exercises[2]?.state, 'needs-work')
  const missingMotion = evaluateXrStudioExercises(snapshot({ cast: [{ actorId: 'actor', marks: [{ timeSeconds: 0, position: [0, 0, 0] }] }] }))
  assert.deepEqual(missingMotion.exercises.map(item => item.state), ['needs-work', 'needs-work', 'needs-work'])
  const distantObstacle = evaluateXrStudioExercises(snapshot({ subjects: [
    { id: 'actor', assetId: 'character-pig', label: 'Actor', position: [0, 0, 0] },
    { id: 'obstacle', assetId: 'furniture-table', label: 'Far table', position: [12, 0, 0] },
  ] }))
  assert.equal(distantObstacle.exercises[1]?.state, 'needs-work')

  const stageScene = projectXrStudioScene({ ...runtime, plan: readXrMotionReferencePlan({ stageId: 'neutral-volume' }) })
  assert.ok(stageScene.entities.some(entity => entity.kind === 'structure' && entity.id.startsWith('stage:')))
}

export async function testXrStudioInspectorProjectsSceneAndExercises(): Promise<void> {
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    await mountReactRoot(root, React.createElement(XrChoreographyInspector, {
      runtime: snapshot(), selectedActorId: 'actor', cameraInvocation: '/animation.configure',
      castInvocation: '/animation.configure', controlTool: 'animation', invocationReady: true,
    }))
    const studio = container.querySelector('[data-kg-xr-studio="authored-scene"]')!
    assert.ok(studio)
    assert.match(studio.textContent || '', /Nearest to Actor: Table/)
    assert.equal(studio.querySelectorAll('[data-kg-xr-studio-exercise][data-state="passed"]').length, 3)
    await act(async () => {
      const selector = studio.querySelector<HTMLSelectElement>('[aria-label="Find scene objects"]')!
      selector.value = 'furniture'
      selector.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    assert.match(studio.querySelector('[data-kg-xr-studio-results]')?.textContent || '', /1 result · Table/)
  } finally {
    await unmountReactRoot(root)
    env.restore()
  }
}

export function testXrStudioAgentReadAndSaveReopen(): void {
  const previousStore = useGraphStore.getState()
  const previousRuntime = readXrMotionReferenceRuntime()
  const persisted = serializeXrMotionReferencePlan(snapshot().plan)
  try {
    completeSourceFilesBootstrap()
    useGraphStore.setState({
      markdownDocumentName: 'studio.md', markdownDocumentText: '# Studio',
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: { kgXrMotionReference: persisted } },
      canvasRenderMode: '3d', canvas3dMode: 'xr',
    } as never)
    assert.ok(hydrateCanonicalXrMotionReferenceRuntime())
    const initial = inspectLocalXrSceneAssets().studio
    assert.ok(initial)
    assert.equal(initial.scene.revision, readXrMotionReferenceRuntime().revision)
    assert.ok(initial.scene.entities.some(entity => entity.id === 'actor' && entity.label === 'Actor'))
    setXrMotionReferenceSubjectLabel('actor', 'Lead')
    assert.ok(persistXrScene())
    const saved = useGraphStore.getState().graphData?.metadata?.kgXrMotionReference
    assert.ok(saved)
    useGraphStore.setState({
      markdownDocumentName: 'reopened.md', markdownDocumentText: '# Studio',
      graphData: { type: 'Graph', nodes: [], edges: [], metadata: { kgXrMotionReference: saved } },
    } as never)
    assert.ok(hydrateCanonicalXrMotionReferenceRuntime())
    const reopened = inspectLocalXrSceneAssets().studio
    assert.ok(reopened)
    assert.ok(reopened.scene.entities.some(entity => entity.id === 'actor' && entity.label === 'Lead'))
    assert.equal(reopened.scene.revision, readXrMotionReferenceRuntime().revision)
  } finally {
    useGraphStore.setState(previousStore)
    restoreXrMotionReferenceRuntimeSnapshot(previousRuntime)
  }
}
