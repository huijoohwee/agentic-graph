import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import yaml from 'js-yaml'
import { readXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import type { XrMotionReferenceRuntimeSnapshot } from '@/features/three/xrMotionReferenceRuntimeSnapshot'
import { evaluateXrStudioExercises } from '@/features/three/xrSceneExercises'
import { projectXrStudioScene, queryXrStudioScene } from '@/features/three/xrSceneSemantic'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { inspectLocalXrSceneAssets } from '@/features/three/xrSceneMcpRuntime'
import { XrChoreographyInspector } from '@/features/three/XrChoreographyInspector'
import { persistXrScene, persistXrSceneToAuthoredSource } from '@/features/three/xrScenePersistence'
import { buildXrMotionReferencePackage } from '@/features/three/xrMotionReferencePackage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { XR_PHYSICS_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import { createWorkspacePersistedFs } from '@/features/workspace-fs/workspaceFsPersisted'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { buildAuthoredMarkdownNoteInitialText, resolveAuthoredMarkdownNoteDocumentNodeId } from '@/features/workspace-fs/workspaceAuthoredNoteDocument'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { attachXrPhysicsBody, hydrateXrPhysicsRuntime, playXrPhysicsRuntime, readXrPhysicsRuntime, restoreXrPhysicsRuntimeSnapshot } from '@/features/three/xrPhysicsRuntime'
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
  assert.deepEqual(queryXrStudioScene(scene, { kind: 'within', center: [2, 9, 0], radiusMeters: 0 }).matches.map(entity => entity.id), ['actor'])
  assert.ok(queryXrStudioScene(scene, { kind: 'within', center: [2, 0, 0], radiusMeters: 50 }).matches.some(entity => entity.id === 'obstacle'))
  assert.equal(queryXrStudioScene(scene, { kind: 'within', center: [2, 0, 0], radiusMeters: 50.01 }).reason, 'invalid-query')
  const tiedScene = { ...scene, entities: [
    { ...scene.entities.find(entity => entity.id === 'actor')!, position: [0, 0, 0] as const },
    { ...scene.entities.find(entity => entity.id === 'obstacle')!, id: 'z-obstacle', position: [1, 20, 0] as const },
    { ...scene.entities.find(entity => entity.id === 'obstacle')!, id: 'a-obstacle', position: [-1, -20, 0] as const },
  ] }
  assert.deepEqual(queryXrStudioScene(tiedScene, { kind: 'nearest', subjectId: 'actor' }).matches.map(entity => entity.id), ['a-obstacle'])

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
  assert.equal(evaluateXrStudioExercises({ ...runtime, selectedActorId: 'obstacle' }).subjectId, 'actor', 'ineligible selection reports the evaluated fallback')

  const stageScene = projectXrStudioScene({ ...runtime, plan: readXrMotionReferencePlan({ stageId: 'neutral-volume' }) })
  assert.ok(stageScene.entities.some(entity => entity.kind === 'structure' && entity.id.startsWith('stage:')))
}

export async function testXrStudioInspectorProjectsSceneAndExercises(): Promise<void> {
  const previousPhysics = readXrPhysicsRuntime()
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
    assert.match(studio.textContent || '', /Evaluating Actor \(actor\)/)
    assert.match(studio.textContent || '', /Offline Studio/)
    assert.ok(studio.querySelector('[aria-label="Rehearsal exercises"]'))
    await act(async () => {
      hydrateXrPhysicsRuntime({ sceneKey: 'studio-test', persistedValue: null,
        subjects: [{ subjectId: 'actor', position: [0, 0, 0], sizeMeters: [1, 1, 1] }] })
      attachXrPhysicsBody({ subjectId: 'actor', patch: { mode: 'dynamic' } })
      playXrPhysicsRuntime()
    })
    assert.equal(studio.querySelectorAll('[data-kg-xr-studio-exercise][data-state="blocked"]').length, 3,
      'physics-only ownership changes refresh the visible exercise result')
    await act(async () => {
      const selector = studio.querySelector<HTMLSelectElement>('[aria-label="Find scene objects"]')!
      selector.value = 'furniture'
      selector.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    assert.match(studio.querySelector('[data-kg-xr-studio-results]')?.textContent || '', /1 result · Table/)
  } finally {
    await unmountReactRoot(root)
    restoreXrPhysicsRuntimeSnapshot(previousPhysics)
    env.restore()
  }
}

export async function testXrStudioAgentReadAndSaveReopen(): Promise<void> {
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

  await withDurableBrowserStorage(async () => {
    const { restore } = initWindowHarness({ storage: new MemoryStorage() })
    const path = `/notes/studio-${randomUUID()}.md`
    const text = buildAuthoredMarkdownNoteInitialText(path)
    const previousState = useGraphStore.getState()
    const previousScene = readXrMotionReferenceRuntime()
    try {
      resetWorkspaceFsForTests()
      const fs = await getWorkspaceFs()
      await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: '/notes' })
      await fs.createFile({ parentPath: '/notes', name: path.split('/').at(-1)!, text, mirrorToHost: false })
      const initialPlan = serializeXrMotionReferencePlan(snapshot().plan)
      const nodes = [{ id: resolveAuthoredMarkdownNoteDocumentNodeId(path), type: 'Document', label: 'Studio', properties: {} }]
      useGraphStore.setState({
        sourceFiles: [], markdownDocumentName: path, markdownDocumentText: text,
        graphData: { type: 'Graph', context: 'frontmatter-flow', nodes, edges: [], metadata: { kgXrMotionReference: initialPlan } },
        canvasRenderMode: '3d', canvas3dMode: 'xr',
      } as never)
      assert.ok(hydrateCanonicalXrMotionReferenceRuntime())
      setXrMotionReferenceSubjectLabel('actor', 'Durable lead')
      const saved = await persistXrSceneToAuthoredSource()
      assert.equal(saved.ok, true, `${saved.message}; text=${String(useGraphStore.getState().markdownDocumentText).slice(0, 500)}`)
      assert.equal(readXrMotionReferenceRuntime().dirty, false)
      const stored = await createWorkspacePersistedFs().readFileText(path)
      assert.equal(stored, useGraphStore.getState().markdownDocumentText)
      assert.match(stored || '', /Durable lead/)
      const packageBeforeReload = buildXrMotionReferencePackage({
        plan: readXrMotionReferenceRuntime().plan, graphData: useGraphStore.getState().graphData!, documentName: path,
      })
      resetWorkspaceFsForTests()
      const reopenedText = await (await getWorkspaceFs()).readFileText(path)
      assert.equal(reopenedText, stored, 'new workspace instance reads the committed source')
      const frontmatter = yaml.load(extractYamlFrontmatterBlock(reopenedText || '')?.yamlText || '') as Record<string, unknown>
      assert.ok(frontmatter.kgXrMotionReference)
      useGraphStore.setState({
        sourceFiles: [], markdownDocumentName: path, markdownDocumentText: reopenedText,
        graphData: { type: 'Graph', context: 'frontmatter-flow', nodes, edges: [], metadata: { kgXrMotionReference: frontmatter.kgXrMotionReference } },
      } as never)
      assert.ok(hydrateCanonicalXrMotionReferenceRuntime())
      assert.ok(inspectLocalXrSceneAssets().studio?.scene.entities.some(entity => entity.label === 'Durable lead'))
      const packageAfterReload = buildXrMotionReferencePackage({
        plan: readXrMotionReferenceRuntime().plan, graphData: useGraphStore.getState().graphData!, documentName: path,
      })
      assert.deepEqual(packageAfterReload.files, packageBeforeReload.files, 'reopened scene exports identical reference bytes')

      setXrMotionReferenceSubjectLabel('actor', 'Unsaved lead')
      useGraphStore.setState({ markdownDocumentName: XR_PHYSICS_WORKSPACE_SEED_PATH } as never)
      const seed = await persistXrSceneToAuthoredSource()
      assert.equal(seed.ok, false, 'bundled seed is reconciled on reload and cannot claim an authored save')
      assert.match(seed.message, /local scene copy/)
      useGraphStore.setState({ markdownDocumentName: '/notes/missing-studio.md' } as never)
      const missing = await persistXrSceneToAuthoredSource()
      assert.equal(missing.ok, false, 'missing file cannot yield durable success')
      assert.equal(readXrMotionReferenceRuntime().dirty, true)
    } finally {
      useGraphStore.setState(previousState)
      restoreXrMotionReferenceRuntimeSnapshot(previousScene)
      resetWorkspaceFsForTests()
      restore()
    }
  })
}
