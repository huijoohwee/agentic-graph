import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function assertXrMotionReferenceStageSurfaceContracts(): void {
  const emptyWorldSource = readSource('features', 'three', 'XrEmptyWorldStage.tsx')
  const emptyWorldHudSource = readSource('features', 'three', 'XrEmptyWorldHud.tsx')
  const spatialAssetToolsSource = readSource('features', 'three', 'SpatialAssetToolsPanel.tsx')
  const xrMotionReferenceGraphStageSource = readSource('features', 'three', 'XrMotionReferenceGraphStage.tsx')
  const xrCanonicalPhysicsStageSource = readSource('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const xrEntrySource = readSource('lib', 'three', 'ThreeGraphXr.tsx')
  const threeGraphSource = readSource('lib', 'three', 'ThreeGraph.impl.tsx')
  const controlsSource = readSource('features', 'three', 'Controls.tsx')

  if (existsSync(resolve(process.cwd(), 'src', 'features', 'three', 'XrMotionReferenceSection.tsx'))) {
    throw new Error('expected the standalone XR motion-reference form component to be removed')
  }
  if (spatialAssetToolsSource.includes('<XrMotionReferenceSection')
    || spatialAssetToolsSource.includes('data-kg-xr-panel-scene="1"')
    || spatialAssetToolsSource.includes('data-kg-xr-panel-runtime="1"')) {
    throw new Error('expected Media 3D spatial tools to delegate motion, Scene, and Runtime projections to BottomPanel Timeline')
  }
  const staleCanvasMarkers = [
    'physics_playground',
    'physics control mode',
    'data-kg-canvas-xr-physics-mode-option',
    'data-kg-xr-panel-physics',
    'XR unavailable',
  ]
  const cleanedXrSurfaces = `${xrMotionReferenceGraphStageSource}\n${xrCanonicalPhysicsStageSource}\n${xrEntrySource}\n${spatialAssetToolsSource}`
  for (const marker of staleCanvasMarkers) {
    if (cleanedXrSurfaces.includes(marker)) throw new Error(`expected XR canvas cleanup to remove stale ${marker}`)
  }
  if (!xrEntrySource.includes("if (status === 'checking' || status === 'unsupported') return spatialChrome")) {
    throw new Error('expected unsupported WebXR entry actions to stay absent while preserving spatial-capture orientation chrome')
  }
  if (!controlsSource.includes("const voxelIdleAutoRotate = mode === 'voxel'")
    || !controlsSource.includes('controls.autoRotate = voxelIdleAutoRotate')
    || !controlsSource.includes('xrChoreographyCanDriveCamera')
    || !controlsSource.includes('xrChoreographyOwnsCamera')
    || !controlsSource.includes('camera.position.set(...XR_MOTION_STAGE_CAMERA_POSITION)')
    || !controlsSource.includes('controls.target.set(...XR_MOTION_STAGE_CAMERA_TARGET)')
    || !controlsSource.includes('xrEmptyWorld,')) {
    throw new Error('expected 3D/XR canvas camera ownership to stop stale auto-rotation and preserve deterministic XR entry framing')
  }
  if (!controlsSource.includes('enteredEmptyXrWorld')
    || !controlsSource.includes('camera.position.set(360, -460, 520)')
    || !controlsSource.includes('controls.target.set(0, 0, -72)')
    || !threeGraphSource.includes('xrEmptyWorld={hasXrEmptyWorld}')) {
    throw new Error('expected no-file XR world entry to reset a deterministic oblique world camera')
  }
  if (!threeGraphSource.includes("const xrDocumentLoaded = mode !== 'xr' || Boolean(")
    || !threeGraphSource.includes('if (!xrDocumentLoaded) {')
    || !threeGraphSource.includes('data-kg-xr-document-loaded=')) {
    throw new Error('expected XR stage rendering to reject retained graph data when no document is loaded')
  }
  if (!threeGraphSource.includes("const hasXrEmptyWorld = mode === 'xr' && !xrDocumentLoaded")
    || !threeGraphSource.includes('data-kg-xr-empty-world=')
    || !threeGraphSource.includes('<XrEmptyWorldStage')) {
    throw new Error('expected no-file XR Mode to initialize a neutral world, grid, origin, and camera without retained graph data')
  }
  for (const marker of [
    'kg_xr_empty_world_stage',
    'kg_xr_empty_world_floor',
    'kg_xr_empty_world_grid',
    'kg_xr_empty_world_center_target',
    'kg_xr_empty_world_vertical_axis',
    'kg_xr_empty_world_axes',
    "schema: 'knowgrph-xr-empty-world/v1'",
  ]) {
    if (!emptyWorldSource.includes(marker)) throw new Error(`expected source-free XR world to expose ${marker}`)
  }
  if (emptyWorldSource.includes('kg_xr_empty_world_camera') || emptyWorldSource.includes('EmptyWorldCamera')) {
    throw new Error('expected the source-free XR stage to avoid a fake Camera prop')
  }
  const rendererClearOwnership = threeGraphSource.match(
    /const rendererClearColor[\s\S]*?const rendererLifecycleKey/,
  )?.[0] || ''
  if (!threeGraphSource.includes('const rendererLifecycleKey = resolveThreeRendererLifecycleKey(mode)')
    || !rendererClearOwnership
    || rendererClearOwnership.includes('gameFpsActive')
    || !threeGraphSource.includes("? '#0b2f4a'")
    || !threeGraphSource.includes('<XrRendererClearController')
    || !threeGraphSource.includes("gl.xr.enabled = mode === 'xr'")) {
    throw new Error('expected every XR projection to reuse the shared renderer environment without a Game-conditioned clear variant')
  }
  for (const marker of ['data-kg-xr-empty-world-hud="1"', 'Centers Mode', 'XR world axes X Y Z']) {
    if (!emptyWorldHudSource.includes(marker)) throw new Error(`expected source-free XR orientation HUD to expose ${marker}`)
  }
  if (!threeGraphSource.includes('<XrEmptyWorldHud')) {
    throw new Error('expected the empty XR world to mount its center and XYZ orientation projection')
  }
}
