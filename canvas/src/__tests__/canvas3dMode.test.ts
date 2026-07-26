import { getVoxelModeInapplicableReason, isVoxelModeApplicable, resolveCanvas3dMode } from '@/lib/canvas/canvas3dMode'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import { buildCanvasViewOptions, getCanvasViewRendererOptions } from '@/components/toolbar/canvasViewMenu'
import type { CanvasViewModelState, CanvasViewOptionId } from '@/components/toolbar/canvasViewTypes'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage } from '@/lib/persistence'
import { readGeospatialOverlayEnabledPreference, writeGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import { parseGlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { loadModelAssetRenderPayload } from '@/lib/assets/modelAssetPayload'
import { buildGltfAssetMarkdown } from '@/features/markdown-workspace/workspaceImport/glbAsset'
import { resolveCameraControlsOrbitProfile } from '@/features/three/cameraControlsProfile'
import type { GraphSchema } from '@/lib/graph/schema'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const BLOCK_SCHEMA = {
  layout: { mode: 'block' },
  behavior: {
    allowEdgeCreation: true,
    allowNodeDrag: true,
  },
  nodeStyles: {},
  edgeStyles: {},
  rules: [],
} as unknown as GraphSchema

const NOOP_BOTTOM_SURFACE_ACTIONS = {
  bottomSurfaceCollapsed: true,
  bottomSurfaceTab: 'stats' as const,
  setBottomSurfaceCollapsed: () => {},
  setBottomSurfaceTab: () => {},
}

function assertNoStaleModelStageToken(source: string, context: string) {
  for (const token of ['ModelAssetXrStage', 'kg_model_xr_stage', 'kg_model_xr_city', 'kg_model_xr_traffic', 'kg_model_xr_horizon']) if (source.includes(token)) throw new Error(`${context} must remove stale synthetic XR stage token ${token}`)
}

export function testVoxelModeRejectsGeospatialMode() {
  const args = {
    canvas2dRenderer: 'flowchart' as const,
    documentSemanticMode: 'document' as const,
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    geospatialEnabled: true,
    schema: BLOCK_SCHEMA,
  }
  const reason = getVoxelModeInapplicableReason(args)
  if (reason !== 'geospatial') {
    throw new Error(`Expected Voxel Mode to report geospatial inapplicable reason, got ${String(reason)}`)
  }
  if (isVoxelModeApplicable(args)) {
    throw new Error('Expected Voxel Mode to be inapplicable while Geospatial Mode is enabled')
  }
  const resolved = resolveCanvas3dMode({ ...args, requested: 'voxel' })
  if (resolved !== '3d') {
    throw new Error(`Expected Voxel Mode request to fall back to 3D in Geospatial Mode, got ${resolved}`)
  }
}

export function testStoryboardWidgetLayoutMenuRequestsBalancedRebalance() {
  const storyboardState = {
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: false,
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'stats',
    geospatialEnabled: false,
    layoutMode: 'block',
    schema: BLOCK_SCHEMA,
    frontmatterOnlyAllowed: false,
    isD3Like2dLayoutToggle: false,
  } satisfies CanvasViewModelState
  const storyboardOptions = buildCanvasViewOptions(storyboardState, getCanvasViewRendererOptions())
  const storyboardLayout = storyboardOptions.find(option => option.id === 'layout:menu')
  const storyboardLayoutIds = (storyboardLayout?.children || []).map(option => option.id)
  if (!storyboardLayoutIds.includes('layout:storyboardWidgetRebalance')) {
    throw new Error(`Expected Storyboard Layout menu to expose a Widget rebalance action, got ${storyboardLayoutIds.join(',')}`)
  }
  if (storyboardLayoutIds.includes('layout:block') || storyboardLayoutIds.includes('layout:radial')) {
    throw new Error('Expected Storyboard Layout menu to avoid D3/Flowchart layout mode mutations')
  }

  const d3Options = buildCanvasViewOptions(
    {
      ...storyboardState,
      canvas2dRenderer: 'd3',
      isD3Like2dLayoutToggle: true,
    },
    getCanvasViewRendererOptions(),
  )
  const d3LayoutIds = (d3Options.find(option => option.id === 'layout:menu')?.children || []).map(option => option.id)
  if (d3LayoutIds.includes('layout:storyboardWidgetRebalance')) {
    throw new Error('Expected the Storyboard Widget rebalance action to stay out of other renderer menus')
  }

  let rebalanceRequests = 0
  let schemaWrites = 0
  applyCanvasViewSelection({
    id: 'layout:storyboardWidgetRebalance',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {},
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: false,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: () => {},
    setCanvasRenderMode: () => {},
    setCanvas3dMode: () => {},
    setSchema: () => { schemaWrites += 1 },
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: () => {},
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
    requestStoryboardWidgetLayoutRebalance: () => { rebalanceRequests += 1 },
  })
  if (rebalanceRequests !== 1 || schemaWrites !== 0) {
    throw new Error(`Expected Storyboard Widget layout action to request one rebalance and avoid schema writes, got ${JSON.stringify({ rebalanceRequests, schemaWrites })}`)
  }

  applyCanvasViewSelection({
    id: 'layout:storyboardWidgetRebalance',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {},
    canvas2dRenderer: 'flow',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: false,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: () => {},
    setCanvasRenderMode: () => {},
    setCanvas3dMode: () => {},
    setSchema: () => { schemaWrites += 1 },
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: () => {},
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
    requestStoryboardWidgetLayoutRebalance: () => { rebalanceRequests += 1 },
  })
  if (rebalanceRequests !== 1) {
    throw new Error('Expected Storyboard Widget rebalance action to be ignored outside the Storyboard renderer')
  }
}

export function testRenderSettings3dModeSelectPreservesXrMode() {
  const text = readFileSync(resolve(process.cwd(), 'src/lib/panels/views/RenderSettingsSection.impl.tsx'), 'utf8')
  if (!text.includes('<option value="xr">xr</option>')) {
    throw new Error('Expected Render Settings 3D Mode select to expose XR as a selectable value')
  }
  if (!text.includes(`raw === 'xr' ? 'xr' : '3d'`)) {
    throw new Error('Expected Render Settings 3D Mode onChange to preserve XR instead of coercing it to 3D')
  }
}

export function testXrModeRendersGlbAssetDocumentsWithoutWebxrSessionGate() {
  const threeGraph = readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'), 'utf8')
  if (!threeGraph.includes('parseGlbAssetDocument(canvasMarkdownDocument.text)')) {
    throw new Error('Expected ThreeGraph to detect model asset documents from the Canvas-applied markdown render context')
  }
  if (!threeGraph.includes('const hasRenderableScene = gameplayOverlayActive || hasGraph || hasGlbAsset || hasSpatialCaptureManifest || hasXrEmptyWorld')) {
    throw new Error('Expected ThreeGraph to keep the canvas mounted for model asset documents without graph nodes')
  }
  if (!threeGraph.includes('const sceneGraphForRender = useMemo<GraphData | null>(() => {') || !threeGraph.includes(': { ...sceneGraph, edges: [] }')) {
    throw new Error('Expected ThreeGraph to mount node-only media graphs in 3D/XR/Voxel mode by normalizing missing edges')
  }
  if (!threeGraph.includes('<GlbAssetModel')) {
    throw new Error('Expected XR/3D canvas to render active model asset documents with the shared model component')
  }
  const unavailableLabel = ['XR', 'unavailable'].join(' ')
  if (threeGraph.includes(unavailableLabel)) {
    throw new Error('Expected XR Mode to avoid surfacing the unavailable XR label as the model-rendering state')
  }
  const glbModel = readFileSync(resolve(process.cwd(), 'src/lib/three/GlbAssetModel.tsx'), 'utf8')
  const payloadHelper = readFileSync(resolve(process.cwd(), 'src/lib/assets/modelAssetPayload.ts'), 'utf8')
  if (!payloadHelper.includes('asset.validMagic === false')) {
    throw new Error('Expected GLB rendering to honor ingest-time GLB magic validation through the shared payload helper')
  }
  assertNoStaleModelStageToken(glbModel, 'Expected GLB/GLTF model rendering')
}

export function testXrModeGraphSceneUsesDistinctSpatialStageInsteadOfPlain3dGlobe() {
  const scene = readFileSync(resolve(process.cwd(), 'src/lib/three/Scene.impl.tsx'), 'utf8')
  const stage = readFileSync(resolve(process.cwd(), 'src/features/three/XrMotionReferenceGraphStage.tsx'), 'utf8') + readFileSync(resolve(process.cwd(), 'src/features/three/XrSceneStage.tsx'), 'utf8')
  if (!scene.includes('<XrSceneStage authority={xrGraphStageAuthority} data={data} paused={Boolean(paused)} />') || !stage.includes('<XrMotionReferenceGraphStageLazy data={data} paused={paused} />')) {
    throw new Error('Expected XR Mode graph scenes to mount the native motion-reference stage')
  }
  if (!scene.includes("mode === '3d' ? (\n          <GlobeEffects")) {
    throw new Error('Expected plain 3D globe effects to stay out of XR Mode')
  }
  for (const marker of [
    'kg_graph_xr_stage',
    'XrMotionReferenceStage',
    'XR_MOTION_STAGE_SPAN',
    'XR_MOTION_STAGE_GROUND_Y',
  ]) {
    if (!stage.includes(marker)) {
      throw new Error(`Expected XR graph stage to expose ${marker}`)
    }
  }
  for (const staleMarker of ['physics_playground', 'orientation_ring', 'controller_rays', 'depth_grid']) {
    if (stage.includes(staleMarker)) throw new Error(`Expected XR graph stage to remove stale ${staleMarker} rendering`)
  }
}

export function testXrModeRendersGltfAssetDocumentsWithoutWebxrSessionGate() {
  const glbModel = readFileSync(resolve(process.cwd(), 'src/lib/three/GlbAssetModel.tsx'), 'utf8')
  const payloadHelper = readFileSync(resolve(process.cwd(), 'src/lib/assets/modelAssetPayload.ts'), 'utf8')
  if (!payloadHelper.includes(`asset.format === 'gltf' && asset.validJson === false`)) {
    throw new Error('Expected GLTF rendering to honor ingest-time JSON validation')
  }
  if (!payloadHelper.includes(`asset.format === 'gltf'`) || !payloadHelper.includes('new TextDecoder().decode(bytes)')) {
    throw new Error('Expected GLTF rendering to parse JSON text payloads through the shared model payload helper')
  }
  if (!payloadHelper.includes('deriveModelAssetResourceBasePath(asset.sourceUrl)')) {
    throw new Error('Expected GLTF rendering to preserve a source-relative base path for external GLTF resources')
  }
  if (!glbModel.includes('loader.parse(') || !glbModel.includes('gltf.scene || gltf.scenes?.[0]')) {
    throw new Error('Expected GLTF rendering to add the loaded GLTF scene object')
  }
  if (!glbModel.includes('new THREE.AnimationMixer(scene)') || !glbModel.includes('mixerRef.current?.update(delta)')) {
    throw new Error('Expected GLTF rendering to play and advance embedded model animations')
  }
  assertNoStaleModelStageToken(glbModel, 'Expected GLTF rendering to keep the authored scene free of stale synthetic XR stage')
  if (glbModel.includes('group.rotation.y +=')) {
    throw new Error('Expected GLTF rendering to preserve authored XYZ coordinates instead of mutating model rotation')
  }
}

export async function testXrModePreservesFlatModelFacingInsteadOfAutoRotatingAway() {
  const THREE = await import('three')
  const { computeGlbFit } = await import('@/lib/three/GlbAssetModel')
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial())
  const planeFit = computeGlbFit(plane)
  if (planeFit.preserveFlatFacing !== true) {
    throw new Error('Expected flat GLB/GLTF image-plane assets to keep a stable front-facing pose in XR mode')
  }
  if (planeFit.flatAxis !== 'z') {
    throw new Error(`Expected default Three.js XY planes to report z as the flat axis, got ${String(planeFit.flatAxis)}`)
  }
  if (Math.abs((planeFit.scale * 2) - 92) > 1e-6) {
    throw new Error(`Expected flat GLB/GLTF image-plane assets to use a compact 92-unit fit, got ${planeFit.scale * 2}`)
  }
  const horizontalPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial())
  horizontalPlane.rotation.x = -Math.PI / 2
  horizontalPlane.updateWorldMatrix(true, true)
  const horizontalPlaneFit = computeGlbFit(horizontalPlane)
  if (horizontalPlaneFit.preserveFlatFacing !== true || horizontalPlaneFit.flatAxis !== 'y') {
    throw new Error(`Expected horizontal XZ GLB/GLTF planes to report y as the flat axis, got ${String(horizontalPlaneFit.flatAxis)}`)
  }

  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  const cubeFit = computeGlbFit(cube)
  if (cubeFit.preserveFlatFacing !== false) {
    throw new Error('Expected volumetric GLB/GLTF assets to be detected separately from flat image-plane assets')
  }
  if (cubeFit.scaledSize.some(value => Math.abs(value - 118) > 1e-6)) {
    throw new Error(`Expected volumetric GLB/GLTF assets to expose bounds-aware scaled XYZ dimensions, got ${cubeFit.scaledSize.join(',')}`)
  }

  const glbModel = readFileSync(resolve(process.cwd(), 'src/lib/three/GlbAssetModel.tsx'), 'utf8')
  if (glbModel.includes('group.rotation.y +=')) {
    throw new Error('Expected XR model rendering to avoid mutating authored model rotation for any GLB/GLTF asset')
  }
  if (!glbModel.includes('onFitChange?.(object ? fit : null)')) {
    throw new Error('Expected loaded GLB/GLTF model bounds to be reported for camera XYZ framing')
  }
}

export async function testXrModeModelAssetSwitchUsesDocumentScopedRenderIdentity() {
  const {
    GLTF_ASSET_DATA_URL_PREFIX,
    GLTF_ASSET_MIME_TYPE,
  } = await import('@/lib/assets/glbAssetDocument')
  const { buildGlbAssetRenderKey } = await import('@/lib/three/GlbAssetModel')
  const asset = {
    name: 'same-name.gltf',
    format: 'gltf',
    mimeType: GLTF_ASSET_MIME_TYPE,
    dataUrl: `${GLTF_ASSET_DATA_URL_PREFIX}eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn19`,
    byteLength: 27,
    validJson: true,
    validGltfAsset: true,
  } as const

  const firstDocumentKey = buildGlbAssetRenderKey(asset, 'canvas-applied-markdown-document:first')
  const secondDocumentKey = buildGlbAssetRenderKey(asset, 'canvas-applied-markdown-document:second')
  if (firstDocumentKey === secondDocumentKey) {
    throw new Error('Expected GLB/GLTF render identity to change when Source Files switches the canvas-applied document')
  }

  const mutatedAssetKey = buildGlbAssetRenderKey({
    ...asset,
    dataUrl: `${GLTF_ASSET_DATA_URL_PREFIX}eyJhc3NldCI6eyJ2ZXJzaW9uIjoiMi4wIn0sIm5vZGUiOjF9`,
    byteLength: 37,
  }, 'canvas-applied-markdown-document:first')
  if (firstDocumentKey === mutatedAssetKey) {
    throw new Error('Expected GLB/GLTF render identity to change when the model payload changes')
  }

  const threeGraph = readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'), 'utf8')
  if (!threeGraph.includes('buildGlbAssetRenderKey(glbAsset, canvasMarkdownDocument.semanticKey)')) {
    throw new Error('Expected ThreeGraph to scope model component identity to the canvas-applied Source Files document')
  }
  if (!threeGraph.includes('key={glbAssetRenderKey}')) {
    throw new Error('Expected GLB/GLTF model component to remount on asset identity changes')
  }

  const glbModel = readFileSync(resolve(process.cwd(), 'src/lib/three/GlbAssetModel.tsx'), 'utf8')
  if (!glbModel.includes('loadIdRef') || !glbModel.includes('isStaleLoad()')) {
    throw new Error('Expected GLB/GLTF loader callbacks to reject stale async parse completions')
  }
  assertNoStaleModelStageToken(glbModel, 'Expected GLB/GLTF rendering')
  if (glbModel.includes('kg_model_asset_loading')) {
    throw new Error('Expected GLB/GLTF render path to avoid a visible placeholder object before the selected model loads')
  }
}

export function testXrModeModelAssetSwitchResetsCameraXyzCoordinates() {
  const threeGraph = readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'), 'utf8')
  if (
    !threeGraph.includes('modelAssetRenderKey={glbAssetRenderKey}')
    && !threeGraph.includes('modelAssetRenderKey={spatialCaptureRenderKey || glbAssetRenderKey}')
  ) {
    throw new Error('Expected ThreeGraph to pass the selected model asset identity into 3D controls')
  }
  if (
    !threeGraph.includes('onFitChange={handleGlbAssetFitChange}')
    || (!threeGraph.includes('modelAssetFit={glbAssetFit}') && !threeGraph.includes('modelAssetFit={spatialCaptureRenderKey ? spatialCaptureFit : glbAssetFit}'))
  ) {
    throw new Error('Expected ThreeGraph to route loaded GLB/GLTF bounds into 3D controls for XYZ camera framing')
  }

  const [controls, cameraFramingControlsRuntime, modelAssetCameraPose] = ['Controls.tsx', 'cameraFramingControlsRuntime.ts', 'modelAssetCameraPose.ts'].map(file => readFileSync(resolve(process.cwd(), 'src/features/three', file), 'utf8'))
  if (!controls.includes('modelAssetRenderKey?: string')) {
    throw new Error('Expected 3D Controls to accept model asset render identity')
  }
  if (!controls.includes('modelAssetFit?: ModelAssetCameraFit | null')) {
    throw new Error('Expected 3D Controls to accept loaded model fit dimensions')
  }
  if (!modelAssetCameraPose.includes("'cameraProfile' | 'cameraTarget' | 'floorY' | 'preserveFlatFacing' | 'flatAxis' | 'stageSpan' | 'scaledSize'")) {
    throw new Error('Expected model-asset camera fit metadata to retain flat-axis orientation for pose derivation')
  }
  if (!controls.includes("const modelAssetMode = !!String(modelAssetRenderKey || '').trim()")) {
    throw new Error('Expected 3D Controls to identify model-asset render sessions')
  }
  if (!controls.includes('resolveCameraControlsOrbitProfile({ mode, modelAssetMode })') || (['3d', 'xr'] as const).some(mode => resolveCameraControlsOrbitProfile({ mode, modelAssetMode: true }).topBiased)) {
    throw new Error('Expected model-asset sessions to avoid graph-biased orbit clamping')
  }
  if (!controls.includes('applyModelAssetCameraPose({ camera: perspectiveCamera, controls, fit: modelAssetFit, perspectiveCamera })') || !cameraFramingControlsRuntime.includes('camera.position.set(pose.position[0], pose.position[1], pose.position[2])')) {
    throw new Error('Expected GLB/GLTF model switches to reset camera XYZ from loaded model bounds')
  }
  if (controls.includes('if (paused || viewPinned || !key) return')) {
    throw new Error('Expected GLB/GLTF model camera reset to reframe selected model assets even when the graph view was pinned')
  }
  if (!modelAssetCameraPose.includes("if (fit.flatAxis === 'y')") || !modelAssetCameraPose.includes('position: [0, span * 2.65, span * 0.02]') || !modelAssetCameraPose.includes('up: [0, 0, -1]')) {
    throw new Error('Expected horizontal XZ GLB/GLTF planes to use a top-down camera instead of a vertical front camera')
  }
  if (!modelAssetCameraPose.includes('verticalSpan <= lateralSpan * 0.22') || !modelAssetCameraPose.includes('position: [0, span * 2.65, span * 0.02]')) {
    throw new Error('Expected low-height horizontal GLB/GLTF scenes to use a top-down camera instead of a side-on camera')
  }
  if (!controls.includes("const voxelIdleAutoRotate = mode === 'voxel'") || !controls.includes('controls.autoRotate = voxelIdleAutoRotate')) {
    throw new Error('Expected live 3D/XR and GLB/GLTF model sessions to disable camera auto-rotation mutations')
  }
  if (!cameraFramingControlsRuntime.includes('camera.up.set(pose.up[0], pose.up[1], pose.up[2])')) {
    throw new Error('Expected model-asset camera reset to apply pose-specific camera up vectors for horizontal planes')
  }
  if (!cameraFramingControlsRuntime.includes('perspectiveCamera.near = pose.near') || !cameraFramingControlsRuntime.includes('perspectiveCamera.far = pose.far')) {
    throw new Error('Expected model-asset camera reset to set a safe clipping range for generated planes and imported models')
  }
}

export async function testXrModeGltfIngestParseRenderPipelineUsesNeutralPayload() {
  const sourceUrl = 'https://assets.example.invalid/scene-pack/neutral-city.gltf?rev=7#model'
  const gltfJson = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'neutral_city_probe' }],
  })
  const text = buildGltfAssetMarkdown({
    name: 'neutral-city.gltf',
    sourceKind: 'url',
    sourceUrl,
    text: gltfJson,
  })
  const asset = parseGlbAssetDocument(text)
  if (!asset) throw new Error('Expected imported GLTF manifest to parse as a model asset')
  const payload = await loadModelAssetRenderPayload(asset)
  if (payload.format !== 'gltf') throw new Error(`Expected render payload format gltf, got ${payload.format}`)
  if (payload.basePath !== 'https://assets.example.invalid/scene-pack/') {
    throw new Error(`Expected GLTF base path to preserve the source directory, got ${payload.basePath}`)
  }
  if (typeof payload.loaderInput !== 'string' || !payload.loaderInput.includes('neutral_city_probe')) {
    throw new Error('Expected GLTF payload helper to expose parseable JSON text for GLTFLoader')
  }
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const loaded = await new Promise<{ scene?: unknown; scenes?: unknown[] }>((resolveLoaded, rejectLoaded) => {
    new GLTFLoader().parse(
      payload.loaderInput,
      payload.basePath,
      gltf => resolveLoaded(gltf),
      err => rejectLoaded(err instanceof Error ? err : new Error(String(err || 'GLTF parse failed'))),
    )
  })
  const scene = loaded.scene || loaded.scenes?.[0]
  if (!scene) throw new Error('Expected GLTFLoader to parse the neutral GLTF payload into a renderable scene')
}

export function testCanvasViewSelectionBlocksVoxelDuringGeospatialMode() {
  let openedGeospatialMode = 0
  let setCanvas2dRendererCalls = 0
  let setCanvas3dModeCalls = 0
  let setCanvasRenderModeCalls = 0
  let setSchemaCalls = 0

  applyCanvasViewSelection({
    id: 'surface:voxel',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: true,
    onOpenGeospatialMode: () => { openedGeospatialMode += 1 },
    canvas2dRenderer: 'd3',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: true,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: () => { setCanvas2dRendererCalls += 1 },
    setCanvasRenderMode: () => { setCanvasRenderModeCalls += 1 },
    setCanvas3dMode: () => { setCanvas3dModeCalls += 1 },
    setSchema: () => { setSchemaCalls += 1 },
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: () => {},
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
  })

  if (openedGeospatialMode !== 1) {
    throw new Error(`Expected Geospatial Mode opener to run once, got ${openedGeospatialMode}`)
  }
  if (setCanvas2dRendererCalls !== 0 || setCanvas3dModeCalls !== 0 || setCanvasRenderModeCalls !== 0 || setSchemaCalls !== 0) {
    throw new Error('Expected Voxel selection to avoid renderer or schema mutations while Geospatial Mode is enabled')
  }
}

export function testCanvasViewRendererOptionsStaySelectableAcrossInactiveVoxelState() {
  const options = buildCanvasViewOptions(
    {
      canvas2dRenderer: 'd3',
      canvas3dMode: 'voxel',
      canvasRenderMode: '2d',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      renderMediaAsNodes: false,
      timelineEnabled: true,
      bottomSurfaceCollapsed: true,
      bottomSurfaceTab: 'stats',
      geospatialEnabled: false,
      layoutMode: 'block',
      schema: BLOCK_SCHEMA,
      frontmatterOnlyAllowed: false,
      isD3Like2dLayoutToggle: true,
    },
    getCanvasViewRendererOptions(),
  )
  const rendererMenu = options.find(option => option.id === 'renderer:menu')
  if (!rendererMenu?.children?.length) throw new Error('Expected renderer menu children')
  const disabled = new Map(rendererMenu.children.map(option => [option.id, option.disabled === true]))
  const requiredSelectable: CanvasViewOptionId[] = ['renderer:flowchart', 'renderer:flow', 'renderer:gantt', 'renderer:storyboard', 'renderer:storyboard', 'renderer:d3', 'renderer:dashboard', 'renderer:gallery', 'renderer:design']
  for (const id of requiredSelectable) {
    if (disabled.get(id)) {
      throw new Error(`Expected ${id} to stay selectable for a 2D renderer choice even when inactive canvas3dMode is voxel`)
    }
  }
  const documentMenu = options.find(option => option.id === 'document:menu')
  if (!documentMenu?.children?.length) throw new Error('Expected document mode menu children')
  const documentDisabled = new Map(documentMenu.children.map(option => [option.id, option.disabled === true]))
  for (const id of ['document:documentStructure', 'document:keyword'] as CanvasViewOptionId[]) {
    if (documentDisabled.get(id)) throw new Error(`Expected ${id} to stay selectable for canvas document mode selection`)
  }
}

export function testCanvasViewMenuKeepsMobileFirstGroupedOrder() {
  const options = buildCanvasViewOptions(
    {
      canvas2dRenderer: 'd3',
      canvas3dMode: '3d',
      canvasRenderMode: '2d',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      renderMediaAsNodes: false,
      timelineEnabled: true,
      bottomSurfaceCollapsed: true,
      bottomSurfaceTab: 'stats',
      geospatialEnabled: false,
      layoutMode: 'block',
      schema: BLOCK_SCHEMA,
      frontmatterOnlyAllowed: false,
      isD3Like2dLayoutToggle: true,
    },
    getCanvasViewRendererOptions(),
  )
  const titles = options.map(option => option.title)
  const expected = ['2D Renderer', 'Layout Mode', 'Document Modes', 'Surface Mode', 'Animation Mode', 'Display Controls']
  if (titles.join('|') !== expected.join('|')) {
    throw new Error(`Expected Canvas View Mode grouped order ${expected.join(' > ')}, got ${titles.join(' > ')}`)
  }
  for (const option of options) {
    if (!option.children?.length) throw new Error(`Expected ${option.title} to expand into child controls`)
  }
  const surfaceMode = options.find(option => option.id === 'surface:menu')
  const surfaceChildIds = surfaceMode?.children?.map(child => child.id).join('|')
  const expectedSurfaceChildIds = 'surface:2d|surface:3d|surface:xr|surface:voxel|surface:geospatial'
  if (surfaceChildIds !== expectedSurfaceChildIds) {
    throw new Error(`Expected Surface Mode to own ${expectedSurfaceChildIds}, got ${String(surfaceChildIds)}`)
  }
}

export function testCanvasViewTimelineToggleUsesSharedViewModeOption() {
  const options = buildCanvasViewOptions(
    {
      canvas2dRenderer: 'storyboard',
      canvas3dMode: '3d',
      canvasRenderMode: '2d',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: false,
      multiDimTableModeEnabled: false,
      renderMediaAsNodes: false,
      timelineEnabled: true,
      bottomSurfaceCollapsed: false,
      bottomSurfaceTab: 'gitGraph',
      geospatialEnabled: false,
      layoutMode: 'block',
      schema: BLOCK_SCHEMA,
      frontmatterOnlyAllowed: false,
      isD3Like2dLayoutToggle: true,
    },
    getCanvasViewRendererOptions(),
  )
  const retiredTimelineMenuId = ['timeline', 'menu'].join(':')
  if (options.some(option => String(option.id) === retiredTimelineMenuId)) {
    throw new Error('Expected Canvas View Mode to avoid a standalone Timeline menu')
  }
  const displayControls = options.find(option => option.id === 'control:menu')
  const timelineToggle = displayControls?.children?.find(child => child.id === 'control:timeline')
  const gridToggle = displayControls?.children?.find(child => child.id === 'control:grid')
  const snapGridToggle = displayControls?.children?.find(child => child.id === 'control:snapGrid')
  const gitGraphToggle = displayControls?.children?.find(child => child.id === 'control:gitGraph')
  const ganttToggle = displayControls?.children?.find(child => child.id === 'control:gantt')
  if (!displayControls || !timelineToggle || !gridToggle || !snapGridToggle || !gitGraphToggle || !ganttToggle) {
    throw new Error(
      'Expected Display Controls to own Grid, Snap to Grid, Timeline, Flowchart, GitGraph, Gantt, Architecture, and Event Model toggles',
    )
  }
  const childIds = displayControls.children?.map(child => child.id).join('|')
  if (
    childIds !==
      'control:richMedia|control:nodeShape|control:clusterShape|control:portHandles|control:minimap|control:grid|control:snapGrid|control:aspectRatio|control:boardLayout|control:card|control:widget|control:timeline|control:flowchart|control:gitGraph|control:gantt|control:architecture|control:eventModeling'
  ) {
    throw new Error(
      `Expected Minimap, Grid, Snap to Grid, Card, Widget, Timeline, Flowchart, GitGraph, Gantt, Architecture, and Event Model to sit beside each other in Display Controls, got ${childIds}`,
    )
  }
  if (timelineToggle.children?.length) {
    throw new Error('Expected Timeline to reuse Grid-style single toggle semantics, not On/Off submenu children')
  }
  if (gitGraphToggle.children?.length || ganttToggle.children?.length) {
    throw new Error('Expected GitGraph and Gantt to reuse Timeline-style single-action bottom-panel semantics')
  }
  if (
    timelineToggle.isActive === true ||
    gitGraphToggle.isActive !== true ||
    ganttToggle.isActive === true ||
    gridToggle.isActive === true ||
    snapGridToggle.isActive === true
  ) {
    throw new Error(
      'Expected GitGraph to be the active bottom-surface toggle while Timeline, Gantt, Grid, and Snap to Grid remain inactive under Display Controls',
    )
  }
  const calls: string[] = []
  const timelineBottomCalls: string[] = []
  const unexpectedViewMutations: string[] = []
  const markUnexpected = (name: string) => () => {
    unexpectedViewMutations.push(name)
  }
  applyCanvasViewSelection({
    id: 'control:timeline',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Expected Timeline toggle to avoid opening Geospatial Mode')
    },
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: true,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: markUnexpected('setCanvas2dRenderer') as any,
    setCanvasRenderMode: markUnexpected('setCanvasRenderMode') as any,
    setCanvas3dMode: markUnexpected('setCanvas3dMode'),
    setSchema: markUnexpected('setSchema') as any,
    setBehavior: markUnexpected('setBehavior') as any,
    setRenderMediaAsNodes: markUnexpected('setRenderMediaAsNodes'),
    setTimelineEnabled: enabled => calls.push(String(enabled)),
    setBottomSurfaceCollapsed: collapsed => timelineBottomCalls.push(`collapsed:${String(collapsed)}`),
    setBottomSurfaceTab: tab => timelineBottomCalls.push(`tab:${tab}`),
    setDocumentSemanticMode: markUnexpected('setDocumentSemanticMode') as any,
    setFrontmatterModeEnabled: markUnexpected('setFrontmatterModeEnabled'),
    setMultiDimTableModeEnabled: markUnexpected('setMultiDimTableModeEnabled'),
  })
  if (calls.length > 0) {
    throw new Error(`Expected Timeline toggle to avoid mutating the legacy timelineEnabled flag, got ${calls.join('|')}`)
  }
  if (timelineBottomCalls.join('|') !== 'tab:timeline|collapsed:false') {
    throw new Error(`Expected Timeline Display Control to open the shared BottomPanel Timeline tab, got ${timelineBottomCalls.join('|')}`)
  }
  if (unexpectedViewMutations.length > 0) {
    throw new Error(`Expected Timeline toggle not to mutate Canvas View Mode setters, got ${unexpectedViewMutations.join(', ')}`)
  }
  calls.length = 0
  timelineBottomCalls.length = 0
  applyCanvasViewSelection({
    id: 'control:timeline',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Expected Timeline toggle to avoid opening Geospatial Mode')
    },
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: false,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: () => {},
    setCanvasRenderMode: () => {},
    setCanvas3dMode: () => {},
    setSchema: () => {},
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: enabled => calls.push(String(enabled)),
    setBottomSurfaceCollapsed: collapsed => timelineBottomCalls.push(`collapsed:${String(collapsed)}`),
    setBottomSurfaceTab: tab => timelineBottomCalls.push(`tab:${tab}`),
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
  })
  if (calls.length > 0) {
    throw new Error(`Expected Timeline toggle to keep the legacy timelineEnabled flag untouched, got ${calls.join('|')}`)
  }
  if (timelineBottomCalls.join('|') !== 'tab:timeline|collapsed:false') {
    throw new Error(`Expected inactive Timeline Display Control to open the shared BottomPanel Timeline tab, got ${timelineBottomCalls.join('|')}`)
  }
  const bottomCalls: string[] = []
  applyCanvasViewSelection({
    id: 'control:gantt',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Expected Gantt toggle to avoid opening Geospatial Mode')
    },
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: true,
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'stats',
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: markUnexpected('setCanvas2dRenderer') as any,
    setCanvasRenderMode: markUnexpected('setCanvasRenderMode') as any,
    setCanvas3dMode: markUnexpected('setCanvas3dMode'),
    setSchema: markUnexpected('setSchema') as any,
    setBehavior: markUnexpected('setBehavior') as any,
    setRenderMediaAsNodes: markUnexpected('setRenderMediaAsNodes'),
    setTimelineEnabled: markUnexpected('setTimelineEnabled'),
    setBottomSurfaceCollapsed: collapsed => bottomCalls.push(`collapsed:${String(collapsed)}`),
    setBottomSurfaceTab: tab => bottomCalls.push(`tab:${tab}`),
    setDocumentSemanticMode: markUnexpected('setDocumentSemanticMode') as any,
    setFrontmatterModeEnabled: markUnexpected('setFrontmatterModeEnabled'),
    setMultiDimTableModeEnabled: markUnexpected('setMultiDimTableModeEnabled'),
  })
  if (bottomCalls.join('|') !== 'tab:gantt|collapsed:false') {
    throw new Error(`Expected Gantt Display Control to open the shared BottomPanel Gantt tab, got ${bottomCalls.join('|')}`)
  }
  bottomCalls.length = 0
  applyCanvasViewSelection({
    id: 'control:gitGraph',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Expected GitGraph toggle to avoid opening Geospatial Mode')
    },
    canvas2dRenderer: 'storyboard',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: false,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: true,
    bottomSurfaceCollapsed: false,
    bottomSurfaceTab: 'gitGraph',
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: markUnexpected('setCanvas2dRenderer') as any,
    setCanvasRenderMode: markUnexpected('setCanvasRenderMode') as any,
    setCanvas3dMode: markUnexpected('setCanvas3dMode'),
    setSchema: markUnexpected('setSchema') as any,
    setBehavior: markUnexpected('setBehavior') as any,
    setRenderMediaAsNodes: markUnexpected('setRenderMediaAsNodes'),
    setTimelineEnabled: markUnexpected('setTimelineEnabled'),
    setBottomSurfaceCollapsed: collapsed => bottomCalls.push(`collapsed:${String(collapsed)}`),
    setBottomSurfaceTab: tab => bottomCalls.push(`tab:${tab}`),
    setDocumentSemanticMode: markUnexpected('setDocumentSemanticMode') as any,
    setFrontmatterModeEnabled: markUnexpected('setFrontmatterModeEnabled'),
    setMultiDimTableModeEnabled: markUnexpected('setMultiDimTableModeEnabled'),
  })
  if (bottomCalls.join('|') !== 'collapsed:true') {
    throw new Error(`Expected active GitGraph Display Control to collapse the shared BottomPanel, got ${bottomCalls.join('|')}`)
  }
  if (unexpectedViewMutations.length > 0) {
    throw new Error(`Expected GitGraph/Gantt bottom controls not to mutate Canvas View Mode setters, got ${unexpectedViewMutations.join(', ')}`)
  }
}

export function testCanvasViewRendererSelectionActivates2dSurface() {
  const renderModes: Array<'2d' | '3d'> = []
  let rendererCalls = 0

  applyCanvasViewSelection({
    id: 'renderer:storyboard',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Expected 2D renderer selection to avoid opening Geospatial Mode')
    },
    canvas2dRenderer: 'storyboard',
    canvas3dMode: 'voxel',
    canvasRenderMode: '3d',
    documentSemanticMode: 'document',
    frontmatterModeEnabled: true,
    multiDimTableModeEnabled: false,
    renderMediaAsNodes: false,
    timelineEnabled: true,
    ...NOOP_BOTTOM_SURFACE_ACTIONS,
    schema: BLOCK_SCHEMA,
    setCanvas2dRenderer: () => { rendererCalls += 1 },
    setCanvasRenderMode: mode => { renderModes.push(mode) },
    setCanvas3dMode: () => {},
    setSchema: () => {},
    setRenderMediaAsNodes: () => {},
    setTimelineEnabled: () => {},
    setDocumentSemanticMode: () => {},
    setFrontmatterModeEnabled: () => {},
    setMultiDimTableModeEnabled: () => {},
  })

  if (renderModes.length !== 1 || renderModes[0] !== '2d') {
    throw new Error(`Expected renderer selection to activate 2D render mode once, got ${renderModes.join(',') || 'none'}`)
  }
  if (rendererCalls !== 0) {
    throw new Error(`Expected same renderer selection to avoid duplicate renderer writes, got ${rendererCalls}`)
  }
}

export function testCanvas3dModeSetterRejectsVoxelWhileGeospatialModeIsPersisted() {
  const storage = getLocalStorage()
  const prev = storage?.getItem(LS_KEYS.geospatialOverlayEnabled) ?? null
  const prevVersion = storage?.getItem(LS_KEYS.geospatialOverlayPreferenceVersion) ?? null
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.getState().setDocumentStructureBaselineLock(false)
    writeGeospatialOverlayEnabledPreference(true)
    useGraphStore.getState().setSchema(BLOCK_SCHEMA)
    useGraphStore.getState().setCanvas2dRenderer('flowchart')
    useGraphStore.getState().setDocumentSemanticMode('document')
    useGraphStore.getState().setCanvas3dMode('voxel')
    const next = useGraphStore.getState().canvas3dMode
    if (next !== '3d') {
      throw new Error(`Expected persisted geospatial guard to demote voxel request to 3d, got ${String(next)}`)
    }
  } finally {
    if (storage) {
      if (prev == null) {
        storage.removeItem(LS_KEYS.geospatialOverlayEnabled)
      } else {
        storage.setItem(LS_KEYS.geospatialOverlayEnabled, prev)
      }
      if (prevVersion == null) {
        storage.removeItem(LS_KEYS.geospatialOverlayPreferenceVersion)
      } else {
        storage.setItem(LS_KEYS.geospatialOverlayPreferenceVersion, prevVersion)
      }
    }
    useGraphStore.getState().resetAll()
  }
}

export function testGeospatialOverlayPreferenceIgnoresLegacyUnversionedTrue() {
  const storage = getLocalStorage()
  if (!storage) return
  const prev = storage.getItem(LS_KEYS.geospatialOverlayEnabled)
  const prevVersion = storage.getItem(LS_KEYS.geospatialOverlayPreferenceVersion)
  try {
    storage.setItem(LS_KEYS.geospatialOverlayEnabled, 'true')
    storage.removeItem(LS_KEYS.geospatialOverlayPreferenceVersion)
    if (readGeospatialOverlayEnabledPreference()) {
      throw new Error('Expected legacy unversioned geospatial=true storage to stay neutral on startup')
    }
    writeGeospatialOverlayEnabledPreference(true)
    if (!readGeospatialOverlayEnabledPreference()) {
      throw new Error('Expected current shared geospatial preference writer to persist intentional enabled state')
    }
  } finally {
    if (prev == null) storage.removeItem(LS_KEYS.geospatialOverlayEnabled)
    else storage.setItem(LS_KEYS.geospatialOverlayEnabled, prev)
    if (prevVersion == null) storage.removeItem(LS_KEYS.geospatialOverlayPreferenceVersion)
    else storage.setItem(LS_KEYS.geospatialOverlayPreferenceVersion, prevVersion)
  }
}
