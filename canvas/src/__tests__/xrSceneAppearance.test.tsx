import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import yaml from 'js-yaml'
import { XrSceneAppearanceControls } from '@/features/three/XrSceneAppearanceControls'
import { XrPlaygroundHorizon } from '@/features/three/XrPlaygroundHorizon'
import { buildXrMotionReferencePackage } from '@/features/three/xrMotionReferencePackage'
import { readXrSceneAppearance, XR_SCENE_APPEARANCE_PRESETS, xrSceneSunPosition } from '@/features/three/xrSceneAppearance'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { configureXrSceneAppearance } from '@/features/three/xrSceneAppearanceAuthoring'
import { readXrMotionReferencePlan, serializeXrMotionReferencePlan } from '@/features/three/xrMotionReferenceModel'
import { XR_MOTION_REFERENCE_STAGE_PRESETS, XR_SCENE_LIBRARY_ASSETS } from '@/features/three/xrSceneLibrary'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export function testXrSceneAppearanceNormalizesAndPreservesEveryCatalogAsset() {
  const invalid = readXrSceneAppearance({ skyColor: 'url(https://invalid.test/asset)', waterColor: '#ABCDEF', shadows: 'false', lightIntensity: Infinity, fogDistanceMeters: -20, sunAzimuthDegrees: 999 })
  assert.equal(invalid.skyColor, XR_SCENE_APPEARANCE_PRESETS[0].skyColor)
  assert.equal(invalid.waterColor, '#abcdef')
  assert.equal(invalid.shadows, true)
  assert.equal(invalid.fogDistanceMeters, 40)
  assert.equal(invalid.sunAzimuthDegrees, 180)
  assert.ok(Number.isFinite(invalid.lightIntensity))
  assert.deepEqual(xrSceneSunPosition(readXrSceneAppearance({ sunAzimuthDegrees: 0 }), 2), [0, 38, 32])
  const planForExport = readXrMotionReferencePlan({ appearance: XR_SCENE_APPEARANCE_PRESETS[1] })
  const bundle = buildXrMotionReferencePackage({ plan: planForExport, graphData: { type: 'Graph', nodes: [], edges: [] }, documentName: 'Scene.md' })
  assert.deepEqual(JSON.parse(bundle.files.find(file => file.path === 'reference/manifest.json')!.text).stage.appearance, planForExport.appearance)
  for (const stage of XR_MOTION_REFERENCE_STAGE_PRESETS) {
    for (const asset of XR_SCENE_LIBRARY_ASSETS) {
      const plan = readXrMotionReferencePlan({ stageId: stage.id, appearance: XR_SCENE_APPEARANCE_PRESETS[1], subjects: [{ id: 'authored', assetId: asset.id, color: '#123456', position: [1, 1, 1], rotationYDegrees: 25, scale: 0.75 }] })
      const restored = readXrMotionReferencePlan(serializeXrMotionReferencePlan(plan))
      assert.deepEqual(restored, plan, `${stage.id} / ${asset.id} round trip`)
      assert.equal(restored.subjects[0]?.assetId, asset.id)
      assert.equal(restored.subjects[0]?.color, '#123456')
      assert.equal(restored.appearance.skyColor, '#edc4a9')
    }
    assert.equal(XrPlaygroundHorizon({ appearance: readXrSceneAppearance({ detail: 'low' }), stage }), null)
  }
}

export async function testXrSceneAppearancePanelsAndEditorShareSavedSource() {
  const prior = useGraphStore.getState()
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  resetWorkspaceFsForTests()
  let editorPath = "/scene-appearance.md"
  let editor!: ReturnType<typeof useMarkdownWorkspaceBootstrapState>
  function Editor() {
    editor = useMarkdownWorkspaceBootstrapState({ activePath: editorPath, effectiveBottomSurfaceCollapsed: false })
    const text = useGraphStore(state => state.markdownDocumentText) || ''
    React.useEffect(() => {
      editor.lastLoadedRef.current ??= { path: editorPath, text }
      editor.setActiveTextProgrammatic(text)
    }, [text])
    return null
  }
  try {
    completeSourceFilesBootstrap()
    const original = '---\ntitle: Scene\nkgXrMotionReference: {stageId: singapore, fps: 12, durationSeconds: 6}\n---\n\n# Keep this authored body\n'
    useGraphStore.setState({ markdownDocumentName: '/scene-appearance.md', markdownDocumentText: original,
      sourceFiles: [{ id: 'appearance', name: '/scene-appearance.md', text: original, enabled: true, status: 'parsed', source: { kind: 'local', path: 'workspace:/scene-appearance.md' } }],
      graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [], edges: [], metadata: { kgXrMotionReference: { stageId: 'singapore', fps: 12, durationSeconds: 6 } } } })
    useGraphStore.setState({ workspaceViewMode: 'editor', workspaceCanvasPaneOpen: true, markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false })
    hydrateCanonicalXrMotionReferenceRuntime()
    const panels = () => <><Editor /><XrSceneAppearanceControls compact /><XrSceneAppearanceControls /></>
    await mountReactRoot(root, panels())
    const selects = () => [...container.querySelectorAll<HTMLSelectElement>('[aria-label="Scene appearance"]')]
    await act(async () => {
      selects()[0]!.value = 'golden'
      selects()[0]!.dispatchEvent(new env.dom.window.Event('change', { bubbles: true }))
    })
    assert.deepEqual(selects().map(select => select.value), ['golden', 'golden'])
    const text = useGraphStore.getState().markdownDocumentText!
    assert.equal(useGraphStore.getState().sourceFiles[0]!.text, text)
    assert.ok(text.endsWith('# Keep this authored body\n'))
    await settleWorkspaceSourceTextWrites()
    assert.equal(await (await getWorkspaceFs()).readFileText('/scene-appearance.md'), text)
    const frontmatter = yaml.load(extractYamlFrontmatterBlock(text)!.yamlText) as Record<string, unknown>
    const plan = readXrMotionReferencePlan(frontmatter.kgXrMotionReference)
    assert.equal(plan.appearance.skyColor, '#edc4a9')
    assert.equal(readXrMotionReferenceRuntime().dirty, false)
    // A second panel edit works before the editor refreshes its disk baseline.
    assert.notEqual(editor.lastLoadedRef.current?.text, editor.activeTextRef.current)
    await act(async () => { assert.equal(configureXrSceneAppearance({ waterColor: '#123abc' }), true) })
    assert.equal(readXrMotionReferenceRuntime().plan.appearance.waterColor, '#123abc')
    // Editor reparse replaces saved appearance and both surfaces project that source.
    await act(async () => {
      useGraphStore.setState({ graphData: { type: 'Graph', context: 'frontmatter-flow', nodes: [], edges: [], metadata: { frontmatterMeta: { kgXrMotionReference: serializeXrMotionReferencePlan({ ...plan, appearance: readXrSceneAppearance({ ...plan.appearance, groundColor: '#123456' }) }) } } } })
      hydrateCanonicalXrMotionReferenceRuntime()
    })
    assert.deepEqual(selects().map(select => select.value), ['custom', 'custom'])
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Scene ground color"]')!.value, '#123456')
    const saved = readXrMotionReferenceRuntime().plan
    for (const blockedState of [
      { markdownWorkspaceIndexingInFlight: true },
      { workspaceGraphMutationLayoutLockActive: true },
      { workspaceGraphMutationBlockUntilMs: Date.now() + 60_000 },
    ]) {
      useGraphStore.setState(blockedState)
      await act(async () => { assert.equal(configureXrSceneAppearance({ waterColor: '#ffffff' }), false) })
      assert.deepEqual(readXrMotionReferenceRuntime().plan, saved)
      useGraphStore.setState({ markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationLayoutLockActive: false, workspaceGraphMutationBlockUntilMs: 0 })
    }
    editor.userEditedActiveTextRef.current = true
    await act(async () => { assert.equal(configureXrSceneAppearance({ waterColor: '#ffffff' }), false) })
    editor.userEditedActiveTextRef.current = false
    editorPath = '/different-scene.md'
    await act(async () => { root.render(panels()) })
    await act(async () => { assert.equal(configureXrSceneAppearance({ waterColor: '#ffffff' }), false) })
    editorPath = '/scene-appearance.md'
    await act(async () => { root.render(panels()) })
    const graphBefore = useGraphStore.getState().graphData
    useGraphStore.getState().updateGraphMetadata({ unrelated: true })
    assert.equal(useGraphStore.getState().graphData, graphBefore, 'editor authoring must not widen unrelated graph mutations')
    useGraphStore.setState({ updateGraphMetadata: () => undefined })
    await act(async () => { assert.equal(configureXrSceneAppearance({ waterColor: '#ffffff' }), false) })
    assert.deepEqual(readXrMotionReferenceRuntime().plan, saved, 'a rejected source write rolls back the runtime')
  } finally {
    await unmountReactRoot(root)
    await settleWorkspaceSourceTextWrites()
    useGraphStore.setState(prior)
    resetWorkspaceFsForTests()
    env.restore()
  }
}
