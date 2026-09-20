import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'

const BLOCK_SCHEMA = {
  layout: { mode: 'block' },
  behavior: { allowEdgeCreation: true, allowNodeDrag: true },
  nodeStyles: {},
  edgeStyles: {},
  rules: [],
} as unknown as GraphSchema

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function testTropicalPlaygroundNativeSurfaceOwners() {
  const xrSceneLibrarySubject = readSource('features', 'three', 'XrSceneLibrarySubject.tsx')
  const xrProceduralHouse = readSource('features', 'three', 'XrProceduralHouseGeometry.tsx')
  const xrSceneSkyAtmosphere = readSource('features', 'three', 'XrSceneSkyAtmosphere.tsx')
  const xrStagePresetGeometry = readSource('features', 'three', 'XrStagePresetGeometry.tsx')
  const xrTropicalPlaygroundTerrain = readSource('features', 'three', 'XrTropicalPlaygroundTerrain.tsx')
  const xrTropicalPlaygroundLandmarks = readSource('features', 'three', 'XrTropicalPlaygroundLandmarks.tsx')
  const xrMediaLibrary = readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
  const xrMediaLibraryCards = readSource('features', 'command-menu', 'XrMediaLibraryCards.tsx')
  if (!xrSceneLibrarySubject.includes('<XrProceduralHouseGeometry')
    || !xrSceneLibrarySubject.includes('label={subject.label}')
    || !xrSceneLibrarySubject.includes("silhouette={resolveCharacterSilhouette(label)}")) {
    throw new Error('expected crate and character subjects to keep native silhouettes through the shared library geometry')
  }
  for (const marker of [
    'agentic_os_xr_procedural_straw_house',
    'agentic_os_xr_procedural_stick_house',
    'agentic_os_xr_procedural_brick_house',
    'agentic_os_xr_procedural_soup_pot',
  ]) {
    if (!xrProceduralHouse.includes(marker)) throw new Error(`expected native house geometry to expose ${marker}`)
  }
  if (!xrSceneLibrarySubject.includes('agentic_os_xr_procedural_tree')
    || !xrSceneLibrarySubject.includes('rotation={[Math.PI / 2, 0, 0]}')
    || !xrSceneLibrarySubject.includes('scale={[1.08, 1.08, 0.78]}')) {
    throw new Error('expected tree props to stand upright in crate Z-up space with a broad canopy')
  }
  if (!xrSceneSkyAtmosphere.includes('agentic_os_xr_scene_sky_dome')
    || !xrSceneSkyAtmosphere.includes('agentic_os_xr_scene_sky_horizon')
    || !xrSceneSkyAtmosphere.includes('xrSceneSunPosition')) {
    throw new Error('expected the shared XR sky owner to keep a native dome and sun disc')
  }
  for (const marker of ['<XrTropicalPlaygroundTerrain', "stage.id === 'tropical-playground'", '<XrTropicalPlaygroundLandmarks', '<XrNativeControllerDemoAerialSetpieces']) {
    if (!xrStagePresetGeometry.includes(marker)) throw new Error(`expected canonical stage geometry to project Tropical Playground through ${marker}`)
  }
  for (const marker of ['agentic_os_xr_tropical_playground_landmarks', 'agentic_os_xr_playground_skull_grotto', 'agentic_os_xr_playground_fence', 'agentic_os_xr_playground_wood_ramp']) {
    if (!xrTropicalPlaygroundLandmarks.includes(marker)) throw new Error(`expected Tropical Playground landmarks to expose ${marker}`)
  }
  for (const marker of ['agentic_os_xr_tropical_playground_terrain', 'agentic_os_xr_tropical_playground_island', 'agentic_os_xr_tropical_playground_ocean', 'selectable: false']) {
    if (!xrTropicalPlaygroundTerrain.includes(marker)) throw new Error(`expected native Tropical Playground presentation to expose ${marker}`)
  }
  if (xrTropicalPlaygroundTerrain.includes('XrSceneLibraryAssetGeometry') || xrTropicalPlaygroundTerrain.includes('showcaseSubjects')) {
    throw new Error('expected fixed Tropical Playground terrain to leave mobile assets to canonical Media CRUD')
  }
  const mediaLibrary = `${xrMediaLibrary}\n${xrMediaLibraryCards}`
  for (const marker of [
    'XR_SCENE_LIBRARY_ASSETS.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)',
    'data-kg-media-xr-swap-asset={asset.id}',
    'buildXrTransformInvocation(selectedSubjectId, { assetId: asset.id })',
  ]) {
    if (!mediaLibrary.includes(marker)) throw new Error(`expected Media subject swap to expose ${marker}`)
  }
}

export async function testLiveXrSurfaceSurvivesTropicalStageAnd3dHostReplay() {
  const { completeSourceFilesBootstrap } = await import('@/features/source-files/sourceFilesBootstrapReadiness')
  const { controlLocalXrScene } = await import('@/features/three/xrSceneMcpRuntime')
  completeSourceFilesBootstrap()
  useGraphStore.getState().resetAll()
  completeSourceFilesBootstrap()
  const threeDHostText = [
    '---',
    'kgCanvasSurfaceMode: "3d"',
    'kgCanvasRenderMode: "3d"',
    'kgCanvas3dMode: "3d"',
    '---',
    '',
    '# XR scene',
  ].join('\n')
  try {
    useGraphStore.setState({
      markdownDocumentName: 'XR scene.md',
      markdownDocumentText: threeDHostText,
      graphData: {
        type: 'Graph',
        nodes: [{ id: 'scene', label: 'Scene', type: 'Note', properties: {} }],
        edges: [],
        metadata: {},
      },
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      floatingPanelOpen: true,
      floatingPanelView: 'media',
      schema: BLOCK_SCHEMA,
    } as never)
    const staged = controlLocalXrScene({ action: 'stage', stageId: 'tropical-playground' })
    const afterStage = useGraphStore.getState()
    if (afterStage.canvasRenderMode !== '3d' || afterStage.canvas3dMode !== 'xr') {
      throw new Error(`expected Tropical Playground restaging to keep Surface Mode on XR, got ${JSON.stringify({
        ok: staged.ok,
        message: staged.message,
        canvasRenderMode: afterStage.canvasRenderMode,
        canvas3dMode: afterStage.canvas3dMode,
      })}`)
    }
    if (!staged.ok || staged.scene?.runtime?.stageId !== 'tropical-playground') {
      throw new Error(`expected Tropical Playground to stage in XR Mode, got ${JSON.stringify({
        ok: staged.ok,
        message: staged.message,
        stageId: staged.scene?.runtime?.stageId,
      })}`)
    }
    applyCanvasFrontmatterPreset({ rawText: threeDHostText })
    const preserved = useGraphStore.getState()
    if (preserved.canvasRenderMode !== '3d' || preserved.canvas3dMode !== 'xr') {
      throw new Error(`expected a 3d-host frontmatter replay not to steal a live XR surface, got ${JSON.stringify({
        canvasRenderMode: preserved.canvasRenderMode,
        canvas3dMode: preserved.canvas3dMode,
      })}`)
    }
    await useGraphStore.getState().setActiveMarkdownDocument({
      name: 'XR scene.md',
      text: threeDHostText,
      applyViewPreset: true,
    })
    const afterSameDocumentApply = useGraphStore.getState()
    if (afterSameDocumentApply.canvasRenderMode !== '3d' || afterSameDocumentApply.canvas3dMode !== 'xr') {
      throw new Error(`expected same-document 3d-host apply not to steal a live XR surface, got ${JSON.stringify({
        canvasRenderMode: afterSameDocumentApply.canvasRenderMode,
        canvas3dMode: afterSameDocumentApply.canvas3dMode,
      })}`)
    }
    applyCanvasFrontmatterPreset({
      rawText: [
        '---',
        'kgCanvasSurfaceMode: "2d"',
        'kgCanvasRenderMode: "2d"',
        'kgCanvas2dRenderer: "flow"',
        '---',
        '',
        '# Design surface',
      ].join('\n'),
    })
    const demoted = useGraphStore.getState()
    if (demoted.canvasRenderMode !== '2d' || demoted.canvas3dMode === 'xr') {
      throw new Error(`expected an explicit 2d landing to leave XR, got ${JSON.stringify({
        canvasRenderMode: demoted.canvasRenderMode,
        canvas3dMode: demoted.canvas3dMode,
      })}`)
    }
    const frontmatter = readSource('features', 'parsers', 'canvasFrontmatterPreset.ts')
    const composedImport = readSource('features', 'source-files', 'applyComposedGraphFromSourceFiles.ts')
    const documentActions = readSource('hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts')
    const surfaceRuntime = readSource('features', 'three', 'xrSceneSurfaceRuntime.ts')
    if (!surfaceRuntime.includes('if (!alreadyXr) {')
      || !frontmatter.includes('preserveLiveSharedXrSurface')
      || !frontmatter.includes('retainLiveSharedXrSurface')
      || !frontmatter.includes('incomingLeavesSharedXrSurface')
      || !frontmatter.includes('if (!(retainLiveSharedXrSurface && !sharedXrSurfaceRouted))')
      || !composedImport.includes('preserveLiveSharedXrSurface')
      || !documentActions.includes('preserveLiveSharedXrSurface')
      || !documentActions.includes('readPreserveLiveSharedXrSurface')) {
      throw new Error('expected live XR retention to stay in the shared frontmatter and compose owners')
    }
  } finally {
    useGraphStore.getState().resetAll()
  }
}
