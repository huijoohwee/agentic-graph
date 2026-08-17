import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveXrPanelRuntimeStack, resolveXrPanelSourceProfile } from '@/features/three/xrPanelModel'
import { reconcileNextSubjectLabelAfterDrop, reconcileXrTransformNumberDraft } from '@/features/command-menu/xrMediaAuthoringDrafts'
import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
  XR_SCENE_LIBRARY_ASSETS,
  XR_SCENE_LIBRARY_DEFAULT_ASSET_ID,
  XR_SCENE_LIBRARY_FEATURED_ASSET_IDS,
} from '@/features/three/xrSceneLibrary'
import { buildXrAssetMediaDragPayload, buildXrStageMediaDragPayload } from '@/features/three/xrSceneMediaDrag'
import { buildRichMediaPanelDroppedMediaProperties } from '@/lib/render/richMediaPanelNode'
import { buildRichMediaPanelOverlayState } from '@/lib/render/richMediaPanelState'
import { normalizeMediaDragPayload, XR_SCENE_MEDIA_DRAG_SCHEMA } from '@/lib/ui/mediaDragPayload'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/storyboardWidget/richMediaPanelConfig'
import { sampleXrAnimationPose } from '@/features/three/xrAnimationCatalog'
import { resolveMotionControlSubjectPose } from '@/features/three/useMotionControlAnimationPose'
import { buildMotionControlAnimationTarget, buildMotionControlObjectIdentification } from '@/features/three/motionControlTargetRuntime'
import { assertSingaporeEnvironmentCardSemantics } from './helpers/xrEnvironmentCardSemantics'
function readSource(...parts: string[]): string { return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8') }
export function testXrModeUsesCanonicalFloatingPanel() {
  const spatialAssetTools = readSource('features', 'three', 'SpatialAssetToolsPanel.tsx')
  const mediaCatalog = readSource('features', 'command-menu', 'MediaCatalogPanelView.tsx')
  const mediaCatalogModeRuntime = readSource('features', 'command-menu', 'mediaCatalogModeRuntime.ts')
  const xrMediaLibrary = readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
  const xrSimulationOpenRequest = readSource('features', 'command-menu', 'xrSimulationWorkbenchOpenRequest.ts')
  const xrSceneMediaDrag = readSource('features', 'three', 'xrSceneMediaDrag.ts')
  const xrSceneMediaDrop = readSource('features', 'three', 'useXrSceneMediaDrop.ts')
  const xrSceneMcpRuntime = readSource('features', 'three', 'xrSceneMcpRuntime.ts')
  const threeGraph = readSource('lib', 'three', 'ThreeGraph.impl.tsx')
  const richMediaPanelNode = readSource('lib', 'render', 'richMediaPanelNode.ts')
  const richMediaPanelState = readSource('lib', 'render', 'richMediaPanelState.ts')
  const richMediaPanelDirectSurface = readSource('components', 'RichMediaPanelDirectMediaSurface.tsx')
  const xrSceneMediaSurface = readSource('features', 'three', 'XrSceneMediaSurface.tsx')
  const xrStagePresetGeometry = readSource('features', 'three', 'XrStagePresetGeometry.tsx')
  const xrMotionReferenceStage = readSource('features', 'three', 'XrMotionReferenceStage.tsx')
  const xrStageLifecycle = readSource('features', 'three', 'useXrStageMotionControlCleanup.ts')
  const xrSceneLibrarySubject = readSource('features', 'three', 'XrSceneLibrarySubject.tsx')
  const xrProceduralBall = readSource('features', 'three', 'XrProceduralBallGeometry.tsx')
  const xrProceduralVehicle = readSource('features', 'three', 'XrProceduralVehicleGeometry.tsx')
  const xrSingaporeTerrain = readSource('features', 'three', 'XrSingaporeTerrainGeometry.tsx')
  const xrTerrainPerimeter = readSource('features', 'three', 'xrTerrainPerimeter.ts')
  const xrNativeAuthoredSubjects = readSource('features', 'three', 'XrNativeControllerAuthoredSubjects.tsx')
  const mediaDragPayload = readSource('lib', 'ui', 'mediaDragPayload.ts')
  const xrCameraFramingPath = resolve(process.cwd(), 'src', 'features', 'three', 'XrCameraFramingSection.tsx')
  const xrPanelModel = readSource('features', 'three', 'xrPanelModel.ts')
  const cameraFloatingProjection = readSource('features', 'strybldr', 'StrybldrCameraFloatingPanelView.tsx')
  const sharedCameraFraming = readSource('features', 'strybldr', 'StrybldrCameraFramingSection.tsx')
  const cameraPanel = readSource('features', 'strybldr', 'StrybldrCameraPanel.tsx')
  const cameraModel = readSource('features', 'strybldr', 'strybldrCamera.ts')
  const cameraFramingRuntime = readSource('features', 'strybldr', 'cameraFramingRuntime.ts')
  const cameraFramingPose = readSource('lib', 'camera', 'cameraFramingPose.ts')
  const cameraFramingControls = readSource('features', 'three', 'cameraFramingControlsRuntime.ts')
  const cameraControlsProfile = readSource('features', 'three', 'cameraControlsProfile.ts')
  const threeControls = readSource('features', 'three', 'Controls.tsx')
  const spatialCaptureStage = readSource('features', 'three', 'SpatialCaptureManifestStage.tsx')
  const spatialCaptureTools = readSource('features', 'three', 'xrSpatialCaptureTools.ts')
  const bottomPanel = readSource('features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx')
  const timelineBottomPanel = readSource('features', 'gitgraph', 'TimelineBottomPanelView.tsx')
  const xrCameraMotion = readSource('features', 'three', 'XrCameraMotionSection.tsx')
  const xrAnimationPanel = readSource('features', 'three', 'XrAnimationFloatingPanelView.tsx')
  const motionControlPanel = readSource('features', 'three', 'MotionControlFloatingPanelView.tsx')
  const motionCaptureProjection = readSource('features', 'three', 'MotionCapturePlatformProjection.tsx')
  const motionCaptureLifecycleGuard = readSource('features', 'three', 'MotionControlXrLifecycleGuard.tsx')
  const motionControlTargetCards = readSource('features', 'three', 'MotionControlTargetCards.tsx')
  const motionControlTargetRuntime = readSource('features', 'three', 'motionControlTargetRuntime.ts')
  const motionControlAgentReadyContract = readSource('features', 'agent-ready', 'motionControlAgentReadyContract.mjs')
  const floatingPanel = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const floatingXrSceneViews = readSource('lib', 'toolbar', 'FloatingPanelXrSceneViews.tsx')
  const viewport = readSource('components', 'CanvasViewport.tsx')
  const floatingTypes = readSource('hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const bottomTypes = readSource('hooks', 'store', 'store-types', 'core.ts')
  const uiInitialState = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const canonicalFrontmatter = readSource('lib', 'markdown', 'frontmatter.ts')
  const appliedFrontmatter = readSource('features', 'parsers', 'canvasFrontmatterPreset.ts')
  const floatingBridge = readSource('features', 'canvas', 'utils.ts')
  const toolbarLauncher = readSource('features', 'toolbar', 'ToolbarMenuLauncher.tsx')
  const iconLibrary = readSource('features', 'panels', 'ui', 'mainPanelHelpIconLibrary.tsx')
  const floatingPanelPresetSource = canonicalFrontmatter.slice(
    canonicalFrontmatter.indexOf('export function readFloatingPanelViewPreset'),
    canonicalFrontmatter.indexOf('function coerceCanvasWorkspaceFrontmatterPreset'),
  )
  for (const marker of [
    'data-kg-media-3d-spatial-tools="1"',
    'data-kg-media-3d-spatial-format',
    'data-kg-media-3d-ingestion-cache',
    'data-kg-media-3d-render-cache',
    'data-kg-media-3d-runtime-stack',
    'data-kg-media-3d-capability={item.id}',
    'data-kg-media-3d-spatial-controls="1"',
    'data-kg-media-3d-center-controls="1"',
    'data-kg-media-3d-axis-widget="1"',
    'setSpatialCaptureAxis(axis)',
    'data-kg-media-3d-primary-modes="1"',
    'setSpatialCapturePrimaryMode(id)',
    'data-kg-media-3d-spatial-toolbar="1"',
    'setSpatialCaptureTool(id)',
  ]) {
    if (!spatialAssetTools.includes(marker)) throw new Error(`expected Media 3D spatial tools to expose ${marker}`)
  }
  for (const staleMarker of ['FloatingPanel XR', 'activateCanvasGraphSurfaceMode', 'data-kg-xr-panel-open-timeline', 'XrPhysicsPlayground', 'data-kg-xr-panel-physics', 'XR_PHYSICS_CONTROLLER_MODES', 'XrCameraFramingSection', 'StrybldrCameraFramingSection']) {
    if (spatialAssetTools.includes(staleMarker)) throw new Error(`expected Media 3D spatial tools to remove stale ${staleMarker}`)
  }
  for (const marker of ['XrCameraMotionSection', 'canvas3dMode']) {
    if (!timelineBottomPanel.includes(marker)) throw new Error(`expected BottomPanel Timeline to own XR motion through ${marker}`)
  }
  for (const marker of ['<StrybldrCameraFramingSection />', '<XrShootCameraSection />']) {
    if (!cameraFloatingProjection.includes(marker)) throw new Error(`expected FloatingPanel Camera to expose ${marker}`)
  }
  if (cameraFloatingProjection.includes('<XrCameraMotionSection')) {
    throw new Error('expected FloatingPanel Camera to leave XR motion and transport in BottomPanel Timeline')
  }
  for (const marker of ['data-kg-xr-timeline-player="1"', 'data-kg-xr-timeline-player-controls="1"', 'data-kg-xr-timeline-control-lane="scene-clip"', 'data-kg-xr-timeline-control-lane="shared-asset"', 'data-kg-xr-timeline-control-bar="scene-clip"', 'data-kg-xr-timeline-shot-target="scene-clip"', 'aria-label="XR timeline scene or 3D object shot target"', 'renderXrSceneStageClipOverlay', 'if (!args.selected) return null', 'data-kg-xr-motion-scene-controls="click-appear"', 'data-kg-xr-motion-scene-control-strip="click-appear"', 'className="xr-camera-motion-mark-selection-controls xr-camera-motion-mark-selection-controls--lane xr-timeline-scene-stage-control xr-timeline-scene-stage-control--selected"', 'style={sceneEditorStyle}', 'renderClipOverlay={renderXrSceneStageClipOverlay}', 'data-kg-xr-motion-stage-field="scene-clip"', '<PanelSelect', 'className="xr-timeline-scene-stage-select"', 'data-kg-xr-motion-stage-select="scene-clip"', 'data-kg-xr-motion-stage-select-lane="scene"', 'onChange={event => applyStage(event.target.value)}', '<option key={preset.id} value={preset.id}>', 'data-kg-xr-motion-stage-summary="scene-clip"', 'xr-timeline-scene-stage-summary-chip', 'XR_MOTION_REFERENCE_STAGE_PRESETS.map(preset => (', '<XrSharedAssetPresetLaneLabel count={runtime.plan.cast.length}', '<XrSharedAssetControls surface="timeline" embedded layout="timeline-lane" selectedPresetId={sharedAssetPresetId} onSelectedPresetIdChange={setSharedAssetPresetId} />', 'data-kg-xr-shot-target-lane', 'data-kg-xr-shot-target-bar', 'data-kg-xr-simulation-lane-label="1"', 'data-kg-xr-simulation-lane="1"', 'data-kg-xr-simulation-bar="full-scene"', 'openSimulationWorkbench', 'data-kg-xr-timeline-playhead-control="scene-clip"', 'data-kg-xr-timeline-playhead-input="scene-clip"', 'aria-label="XR timeline playhead seconds"', 'data-kg-xr-timeline-seconds-control="time-axis"', 'aria-label="XR timeline seconds"', 'data-kg-xr-timeline-fps-control="time-axis"', 'aria-label="XR timeline FPS"', '<TimelineTransportTimeAxisClip', '<CameraMotionMarkRetime', 'layout="lane"', '<GanttTimelineTransportPanel', 'timelineInsertedLanes={[', 'timeAxisControls={', 'data-kg-xr-choreography-shared-axis-rail="camera"', 'data-kg-xr-timeline-transport="reused-gantt-player"']) {
    if (!xrCameraMotion.includes(marker)) throw new Error(`expected BottomPanel XR Timeline to expose ${marker}`)
  }
  for (const forbidden of ['supplementalLanes={', "id: 'xr-control'", 'stage-output', 'selectedStagePreset', 'activeStagePreset', 'sceneStagePickerOpen', 'applySceneClipStage', 'SCENE · {', 'data-kg-xr-motion-stage-options="scene-clip"', 'data-kg-xr-motion-stage-option={preset.id}', 'aria-haspopup="listbox"', 'data-kg-xr-motion-scene-controls="compact"', 'data-kg-xr-motion-scene-controls="expanded"', 'data-kg-xr-motion-scene-control-row=', 'xr-timeline-scene-stage-row', 'xr-timeline-scene-stage-button', 'xr-timeline-scene-stage-options', 'xr-timeline-scene-stage-option', 'data-kg-xr-timeline-shot-target="individual-lane"', 'data-kg-xr-timeline-consolidated-lane="stage-output-ruler"', 'data-kg-xr-motion-stage-buttons="1"', 'data-kg-xr-motion-stage-button={preset.id}', 'data-kg-xr-motion-stage-select="1"', 'data-kg-xr-motion-stage-field="1"', 'data-kg-xr-timeline-playhead-control="1"', 'data-kg-xr-motion-stage-summary="1"']) {
    if (xrCameraMotion.includes(forbidden)) throw new Error(`expected BottomPanel XR Timeline to use inserted lanes without stale stage chip controls ${forbidden}`)
  }
  for (const marker of [
    'subscribeXrNativeControllerDemo',
    "nativeController.phase !== 'off'",
    'readSharedXrNativeControllerDemoFrame().bodies.length',
    "nativeControllerActive ? 'native-controller' : 'scene'",
    'data-kg-xr-simulation-runtime={simulationRuntime}',
  ]) {
    if (!xrCameraMotion.includes(marker)) throw new Error(`expected Timeline Simulation to project the active native controller runtime through ${marker}`)
  }
  if (!xrCameraMotion.includes("controlLocalXrScene({ action: 'stage'") || xrCameraMotion.includes('setXrMotionReferenceStage(')) {
    throw new Error('expected Timeline stage changes to reuse the guarded, persisted scene/physics mutation owner')
  }
  for (const duplicate of ['data-kg-animation-runtime-controls="shared-xr"', 'aria-label="Animation cast target"', 'aria-label="Animation playhead seconds"']) {
    if (xrAnimationPanel.includes(duplicate)) throw new Error(`expected FloatingPanel Animation to remove duplicate Timeline control ${duplicate}`)
  }
  if (existsSync(xrCameraFramingPath)) {
    throw new Error('expected the duplicate FloatingPanel XR Camera projection to be deleted')
  }
  for (const marker of [
    'aria-label="Camera card"',
    'buildStoryboardBoardModel',
    'StrybldrCameraPanel',
    'STRYBLDR_CAMERA_PROPERTY_KEY',
    'serializeStrybldrCameraSettings',
    'updateNode',
    'PanelSelect',
    'readCameraFramingRuntime',
    'publishCameraFramingRuntime',
    'subscribeCameraFramingRuntime',
    "SHARED_CANVAS_CAMERA_ANCHOR_ID = 'canvas-camera'",
    "selectedCard?.title || 'Canvas camera'",
    "data-kg-camera-framing-mode={selectedCard ? 'storyboard' : 'shared'}",
  ]) {
    if (!sharedCameraFraming.includes(marker)) throw new Error(`expected the canonical FloatingPanel Camera framing owner to expose ${marker}`)
  }
  if (sharedCameraFraming.includes('No storyboard card loaded.')) {
    throw new Error('expected the globe-like shared Camera utilities to remain available without a storyboard card')
  }
  if (!cameraFloatingProjection.includes('StrybldrCameraFramingSection') || !cameraFloatingProjection.includes('aria-label="Camera panel"')) {
    throw new Error('expected FloatingPanel Camera to remain a thin shell over the shared camera framing owner')
  }
  const thinCameraProjectionSources = [cameraFloatingProjection, spatialAssetTools]
  for (const forbiddenOwnerToken of ['buildStoryboardBoardModel', 'updateNode', 'STRYBLDR_CAMERA_PROPERTY_KEY', 'serializeStrybldrCameraSettings']) {
    if (thinCameraProjectionSources.some(source => source.includes(forbiddenOwnerToken))) {
      throw new Error(`expected panel projections to avoid duplicate ${forbiddenOwnerToken} ownership`)
    }
  }
  for (const marker of ['readCameraFramingRuntime', 'publishCameraFramingRuntime', 'subscribeCameraFramingRuntime']) {
    if (!cameraFramingRuntime.includes(marker)) throw new Error(`expected shared camera framing runtime to expose ${marker}`)
  }
  for (const marker of [
    'CameraFramingPose',
    'resolveCameraFramingPose',
    'resolveCameraFramingSettingsFromPose',
    'resolveCameraFramingAxisSettings',
  ]) {
    if (!cameraFramingPose.includes(marker)) throw new Error(`expected shared camera pose adapter to expose ${marker}`)
  }
  for (const marker of [
    'useCameraFramingControlsRuntime',
    'publishCameraFramingRuntime',
    'resolveCameraFramingPose',
    'resolveCameraFramingSettingsFromPose',
    "source: 'axis'",
    "source: 'canvas'",
    "setSpatialCaptureAxis('free')",
    'createCameraFramingSettledInteraction',
    'readCameraFramingControlsReapplyRevision',
    'immediateCanvasPublishRef',
    'isSharedCameraFramingSurfaceMode',
  ]) {
    if (!cameraFramingControls.includes(marker)) throw new Error(`expected the live Three camera bridge to expose ${marker}`)
  }
  if (
    !threeControls.includes('useCameraFramingControlsRuntime({')
    || !threeControls.includes('requestCameraFramingControlsReapply()')
    || !threeControls.includes('isSharedCameraFramingSurfaceMode(mode)')
    || !threeControls.includes("} else if (mode !== 'xr') {")
    || !threeControls.includes('resolveCameraControlsOrbitProfile({ mode, modelAssetMode })')
  ) {
    throw new Error('expected Controls to route 3D/XR camera pose application and reset requests through the shared owner')
  }
  if (!cameraControlsProfile.includes("if (mode === '3d' || mode === 'xr') return SHARED_CAMERA_FRAMING_ORBIT_PROFILE") || !cameraControlsProfile.includes('minPolar: 0') || !cameraControlsProfile.includes('maxPolar: Math.PI')) {
    throw new Error('expected the shared 3D/XR controls profile to preserve exact vertical framing poses')
  }
  for (const staleGate of ["mode !== 'xr' || paused", "paused || mode !== 'xr'", "mode === 'xr' && (axisRequest"]) {
    if (cameraFramingControls.includes(staleGate)) throw new Error(`expected the shared 3D/XR camera bridge to remove XR-only gate ${staleGate}`)
  }
  if (threeControls.includes('globeCameraEllipse') || threeControls.includes('cameraPathEnabled')) {
    throw new Error('expected Controls to remove the competing legacy ellipse camera writer')
  }
  if (cameraFramingControls.includes("framing.source === 'axis' || framing.source === 'canvas'")) {
    throw new Error('expected canvas-origin framing to reapply after 3D/XR mode or model context changes')
  }
  const reframeOwner = sharedCameraFraming.slice(sharedCameraFraming.indexOf('const reframeSelectedCardCamera'), sharedCameraFraming.indexOf('if (!selectedCard)', sharedCameraFraming.indexOf('const reframeSelectedCardCamera')))
  if (reframeOwner.includes("source: 'panel'") || reframeOwner.indexOf('updateNode(selectedCard.id') > reframeOwner.indexOf("source: 'document'")) {
    throw new Error('expected Reframe to accept the persisted graph value as the document-owned runtime snapshot for undo sync')
  }
  if (spatialCaptureStage.includes('camera.position.set(') || spatialCaptureStage.includes('subscribeSpatialCaptureAxis')) {
    throw new Error('expected SpatialCaptureManifestStage to stop competing with Controls for camera pose ownership')
  }
  if (!spatialCaptureTools.includes("SpatialCaptureAxisId = SpatialCaptureViewAxisId | 'free'") || spatialCaptureTools.includes('if (activeSpatialCaptureAxis === axis) return')) {
    throw new Error('expected X/Y/Z commands to support free orbit and repeated same-axis recentering')
  }
  if (!cameraPanel.includes('data-kg-strybldr-camera-panel="1"') || !cameraModel.includes("STRYBLDR_CAMERA_PROPERTY_KEY = 'strybldrCamera'")) {
    throw new Error('expected FloatingPanel Camera to preserve the storyboard metadata editor and property contract')
  }
  if (spatialAssetTools.includes('data-kg-xr-panel-open-bottom') || spatialAssetTools.includes('data-kg-xr-panel-open-floating') || spatialAssetTools.includes('XrPanelSurface')) {
    throw new Error('expected Media 3D spatial tools to have no cross-shell route')
  }
  for (const marker of [
    'resolveXrPanelSourceProfile',
    'resolveXrPanelRuntimeStack',
    'readBrowserXrGraphicsCapabilities',
    'kgSpatialCaptureFormat',
    'kgXrIngestionCacheKey',
    'kgXrRenderCacheKey',
    "id: 'threejs'",
    "id: 'webgl'",
    "id: 'webgpu'",
    "id: 'webxr'",
    "id: 'gltf'",
    "id: 'glb'",
    "id: 'ply'",
    "id: 'spz'",
  ]) {
    if (!xrPanelModel.includes(marker)) throw new Error(`expected shared XR panel model to expose ${marker}`)
  }
  if (bottomTypes.includes("| 'xr'") || bottomPanel.includes('XrPanelViewLazy') || bottomPanel.includes("view === 'xr'") || viewport.includes('xrBottomPanelVisible')) {
    throw new Error('expected legacy BottomPanel XR types, toggle, mount, and viewport routing to be removed')
  }
  if (!floatingTypes.includes("| 'camera'") || !floatingTypes.includes("| 'animation'") || !floatingTypes.includes("| 'motionControl'") || !floatingTypes.includes("| 'gameMode'") || !floatingTypes.includes("| 'flightSim'") || !floatingTypes.includes("| 'cityBuilder'") || !floatingTypes.includes("| 'media'") || floatingTypes.includes("| 'xr'") || !uiInitialState.includes("view === 'camera'") || !uiInitialState.includes("view === 'animation'") || !uiInitialState.includes("view === 'motionControl'") || !uiInitialState.includes("view === 'gameMode'") || !uiInitialState.includes("view === 'flightSim'") || !uiInitialState.includes("view === 'cityBuilder'") || !uiInitialState.includes("view === 'media'") || uiInitialState.includes("view === 'xr'")) {
    throw new Error('expected the six XR companion panels and City Builder to remain first-class FloatingPanel panels with the duplicate XR route removed')
  }
  if (
    !floatingXrSceneViews.includes('StrybldrCameraFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'camera'") ||
    !floatingPanel.includes("{ view: 'camera'") ||
    !floatingXrSceneViews.includes("view === 'animation'") ||
    !floatingPanel.includes("{ view: 'animation'") ||
    !floatingXrSceneViews.includes('XrAnimationFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'motionControl'") ||
    !floatingPanel.includes("{ view: 'motionControl'") ||
    !floatingXrSceneViews.includes('MotionControlFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'gameMode'") ||
    !floatingPanel.includes("{ view: 'gameMode'") ||
    !floatingXrSceneViews.includes('GameModeFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'flightSim'") ||
    !floatingPanel.includes("{ view: 'flightSim'") ||
    !floatingXrSceneViews.includes('FlightSimFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'cityBuilder'") || !floatingPanel.includes("{ view: 'cityBuilder'") || !floatingXrSceneViews.includes('CitySimFloatingPanelViewLazy') ||
    !floatingXrSceneViews.includes("view === 'media'") ||
    floatingPanel.includes('XrPanelViewLazy') ||
    floatingPanel.includes("{ view: 'xr'")
  ) {
    throw new Error('expected the six XR companion panels and City Builder to own canonical projections without a duplicate XR panel')
  }
  const mediaViewIndex = floatingPanel.indexOf("{ view: 'media'"), animationViewIndex = floatingPanel.indexOf("{ view: 'animation'"), motionControlViewIndex = floatingPanel.indexOf("{ view: 'motionControl'")
  const gameModeViewIndex = floatingPanel.indexOf("{ view: 'gameMode'")
  const flightSimViewIndex = floatingPanel.indexOf("{ view: 'flightSim'")
  const cityBuilderViewIndex = floatingPanel.indexOf("{ view: 'cityBuilder'"), cameraViewIndex = floatingPanel.indexOf("{ view: 'camera'")
  if (!(mediaViewIndex >= 0 && mediaViewIndex < animationViewIndex && animationViewIndex < motionControlViewIndex && motionControlViewIndex < gameModeViewIndex && gameModeViewIndex < flightSimViewIndex && flightSimViewIndex < cityBuilderViewIndex && cityBuilderViewIndex < cameraViewIndex)
    || !floatingPanel.includes("'animation', 'motionControl', 'gameMode', 'flightSim', 'cityBuilder', 'camera'")) {
    throw new Error('expected full-height Motion Control, Game Mode, Flight Sim, and City Builder between Animation and Camera')
  }
  if (
    !floatingBridge.includes("| 'camera'") ||
    !floatingBridge.includes("| 'animation'") ||
    !floatingBridge.includes("| 'motionControl'") ||
    !floatingBridge.includes("| 'gameMode'") ||
    !floatingBridge.includes("| 'flightSim'") || !floatingBridge.includes("| 'cityBuilder'") ||
    !floatingBridge.includes("| 'media'") ||
    floatingBridge.includes("| 'xr'") ||
    !toolbarLauncher.includes("tab === 'camera'") ||
    !toolbarLauncher.includes("tab === 'animation'") ||
    !toolbarLauncher.includes("tab === 'motionControl'") ||
    !toolbarLauncher.includes("tab === 'gameMode'") ||
    !toolbarLauncher.includes("tab === 'flightSim'") || !toolbarLauncher.includes("tab === 'cityBuilder'") ||
    toolbarLauncher.includes("tab === 'xr'") ||
    !iconLibrary.includes("'floatingPanel.camera'") ||
    !iconLibrary.includes("'floatingPanel.animation'") ||
    !iconLibrary.includes("'floatingPanel.motionControl'") ||
    !iconLibrary.includes("'floatingPanel.gameMode'") ||
    !iconLibrary.includes("'floatingPanel.flightSim'") ||
    iconLibrary.includes("'floatingPanel.xr'")
  ) {
    throw new Error('expected the six XR companion panels and City Builder to share the FloatingPanel bridge, launcher, and help registry without aliases')
  }
  if (!floatingPanelPresetSource.includes("raw === 'camera'") || !floatingPanelPresetSource.includes("raw === 'animation'") || !floatingPanelPresetSource.includes("raw === 'motionControl'") || !floatingPanelPresetSource.includes("raw === 'gameMode'") || !floatingPanelPresetSource.includes("raw === 'flightSim'") || !floatingPanelPresetSource.includes("raw === 'cityBuilder'") || !floatingPanelPresetSource.includes("raw === 'media'") || floatingPanelPresetSource.includes("raw === 'xr'") || !appliedFrontmatter.includes('readFloatingPanelViewPreset')) {
    throw new Error('expected FloatingPanel frontmatter routing to use the six companion panels and City Builder without the stale XR projection')
  }
  for (const marker of ['data-kg-media-mode-switcher="header-icons"', 'data-kg-media-library-toggle="1"', 'data-kg-media-3d-toggle="1"', 'title="Media"', 'title="3D for XR"', 'subscribeMediaCatalogMode', 'readMediaCatalogMode', '<XrMediaLibraryPanel']) {
    if (!mediaCatalog.includes(marker)) throw new Error(`expected Media to own the canonical 3D entry through ${marker}`)
  }
  if (!motionControlPanel.includes('<MotionCapturePlatformProjection variant="full"') || !mediaCatalog.includes('<MotionCapturePlatformProjection variant="media"') || !motionCaptureProjection.includes('data-kg-motion-capture-research-ready') || !motionCaptureProjection.includes('data-kg-motion-capture-peer-sharing') || !motionCaptureProjection.includes('disabled={!captureSurfaceActive || session.sources.length === 0') || !motionCaptureProjection.includes('disabled={!captureSurfaceActive || !peerSharing.available') || !motionCaptureLifecycleGuard.includes('stopMotionCaptureOutsideXrSurface')) {
    throw new Error('expected Motion Control and Media to share an evidence-gated, peer-ready capture platform projection')
  }
  if (!mediaCatalogModeRuntime.includes("let snapshot: MediaCatalogMode = 'media'") || !mediaCatalogModeRuntime.includes('for (const listener of listeners) listener()')) {
    throw new Error('expected Media and 3D for XR to share one observable catalog mode owner')
  }
  if (!xrMediaLibrary.includes('<SpatialAssetToolsPanel />')) throw new Error('expected Media 3D to retain spatial asset tooling')
  const featuredLabels = XR_SCENE_LIBRARY_FEATURED_ASSET_IDS.map(assetId => XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === assetId)?.label)
  if (XR_MOTION_REFERENCE_DEFAULT_STAGE_ID !== 'singapore'
    || XR_SCENE_LIBRARY_DEFAULT_ASSET_ID !== 'vehicle-helicopter'
    || featuredLabels.join('|') !== 'Helicopter|Car|Ball') {
    throw new Error(`expected Singapore and default Helicopter/Car/Ball to use explicit catalog defaults, got ${featuredLabels.join('|')}`)
  }
  const objectIdentification = buildMotionControlObjectIdentification({
    subjects: [
      { id: 'subject-ball', assetId: 'prop-ball', category: 'props', label: 'Practice Ball' },
      { id: 'subject-car', assetId: 'vehicle-sedan', category: 'vehicles', label: 'Camera Car' },
    ],
    selectedSubjectId: 'subject-car',
    physicsBodies: [{ subjectId: 'subject-ball', mode: 'dynamic' }],
  })
  const vehicleAnimationTarget = buildMotionControlAnimationTarget({
    actorId: 'subject-car',
    label: 'Camera Car',
    livePoseCompatible: false,
    assignedPresetId: '',
    recommendedPresetId: 'car-chase',
  })
  const assignedVehicleAnimationTarget = buildMotionControlAnimationTarget({
    actorId: 'subject-car',
    label: 'Camera Car',
    livePoseCompatible: false,
    assignedPresetId: 'car-chase',
    recommendedPresetId: 'car-chase',
  })
  const ballIdentification = objectIdentification.records.find(record => record.id === 'subject-ball')
  const carIdentification = objectIdentification.records.find(record => record.id === 'subject-car')
  if (!ballIdentification
    || !carIdentification
    || objectIdentification.counts.total !== 2
    || objectIdentification.counts.selected !== 1
    || objectIdentification.counts.physicsAttached !== 1
    || ballIdentification.assetLabel !== 'Ball'
    || ballIdentification.catalogDimensionsMeters.join(',') !== '1.2,1.2,1.2'
    || !ballIdentification.physicsBodyAttached
    || ballIdentification.physicsBodyMode !== 'dynamic'
    || !carIdentification.selected
    || carIdentification.physicsBodyAttached
    || carIdentification.physicsBodyMode !== 'none'
    || !vehicleAnimationTarget.compatible
    || vehicleAnimationTarget.livePoseCompatible
    || vehicleAnimationTarget.assignedPresetId
    || !assignedVehicleAnimationTarget.compatible
    || assignedVehicleAnimationTarget.assignedPresetId !== 'car-chase') {
    throw new Error(`expected Motion Control identification to join canonical authored subjects, assets, selection, and physics bodies: ${JSON.stringify(objectIdentification)}`)
  }
  for (const marker of ['runtime.plan.subjects', 'runtime.selectedShotTargetId', 'physics.world.bodies', 'resolveXrSceneLibraryAsset', 'objectIdentification']) {
    if (!motionControlTargetRuntime.includes(marker)) throw new Error(`expected Motion Control object identification to reuse canonical scene/physics owner ${marker}`)
  }
  for (const marker of ['data-kg-motion-control-object-selector="1"', 'selectBoundXrShotTarget', 'requestXrSimulationWorkbenchOpen()', "onOpenTarget('xr-3d')", 'data-kg-motion-control-fine-tune-physics="canonical-workbench"', 'animation compatible · assign', 'authored animation ready · live pose unavailable']) {
    if (!motionControlTargetCards.includes(marker)) throw new Error(`expected Motion Control object selection and physics tuning to route through canonical owner ${marker}`)
  }
  for (const duplicateOwner of ['configureXrPhysicsBody(', 'attachXrPhysicsBody(', 'controlLocalXrScene(']) {
    if (motionControlTargetCards.includes(duplicateOwner)) throw new Error(`expected Motion Control to avoid duplicate physics mutation owner ${duplicateOwner}`)
  }
  if (!motionControlAgentReadyContract.includes('objectIdentification: buildMotionControlObjectIdentificationOutputSchema()')
    || !motionControlAgentReadyContract.includes("additionalProperties: false")) {
    throw new Error('expected strict agent-ready output schema for scene-derived Motion Control object identification')
  }
  if (
    (xrMediaLibrary.match(/<XrLibraryCard/g) || []).length < 2
    || !xrMediaLibrary.includes('data-kg-media-xr-card-layout="media-3-rows"')
    || !xrMediaLibrary.includes('mediaListItemClassName()')
    || !xrMediaLibrary.includes('mediaListThumbnailFrameClassName(')
  ) {
    throw new Error('expected Environment Kits and Subjects & Props to reuse the Media three-row card layout owner')
  }
  assertSingaporeEnvironmentCardSemantics(xrMediaLibrary)
  if (xrMediaLibrary.includes('sm:grid-cols-2')) throw new Error('expected Environment Kits to remove the stale two-column tile layout')
  for (const marker of [
    "runControl({ action: 'transform'",
    'return runControl({ action: \'transform\'',
    'input.value = reconcileXrTransformNumberDraft({',
    'buildXrMediaInvocationControlInput(invocation)',
    'const result = runInvocation(invocation)',
    'onInvoke={placeAsset}',
    'data-kg-media-xr-subject-transform={subject.id}',
    'data-kg-media-xr-subject-position={subject.id}',
    'data-kg-media-xr-subject-rotation={subject.id}',
    'data-kg-media-xr-subject-scale={subject.id}',
    'data-kg-media-xr-subject-color={subject.id}',
    'data-kg-media-xr-terrain-selector="1"',
    'data-kg-media-xr-featured-asset-selector="1"',
    'data-kg-media-xr-subject-asset={subject.id}',
    "setSubjectTransform(subject.id, { assetId: event.target.value })",
    'buildXrTransformInvocation(subject.id, subject)',
    'readMotionControlSnapshot',
    'motionControlPoseToAnimationPose(motionControl.pose)',
    'resolveMotionControlSubjectPose(subject, runtime.selectedShotTargetId, motionControlPose)',
    'data-kg-media-xr-motion-control-target-button={subject.id}',
    'data-kg-media-xr-motion-control-gesture={motionGestureStatus}',
    "openMotionControlSurface('motion-control')",
    'selectBoundXrShotTarget(subjectId)',
  ]) {
    if (!xrMediaLibrary.includes(marker)) throw new Error(`expected Media 3D subject create/update/delete to expose native strict-runtime CRUD through ${marker}`)
  }
  if (!xrSceneLibrarySubject.includes("asset.shape === 'ball'")
    || !xrSceneLibrarySubject.includes('<XrProceduralBallGeometry')
    || !xrSceneLibrarySubject.includes('accentColor={effectiveColor}')
    || !xrProceduralBall.includes('kg_xr_procedural_ball_geometry')) {
    throw new Error('expected the asset-library Ball and native controller Ball to reuse one procedural geometry owner')
  }
  for (const marker of ['requestXrSimulationWorkbenchOpen()', "activateXrSceneSurface({ panelView: 'media', openPanel: true, timeline: true })"]) {
    if (!xrCameraMotion.includes(marker)) throw new Error(`expected the XR Simulation Timeline lane to route through the canonical Media workbench owner via ${marker}`)
  }
  for (const marker of ['subscribeXrSimulationWorkbenchOpenRequest', 'readXrSimulationWorkbenchOpenRevision']) {
    if (!mediaCatalog.includes(marker) || !xrMediaLibrary.includes(marker)) throw new Error(`expected Media catalog and its XR library to consume the shared Simulation workbench intent via ${marker}`)
  }
  for (const marker of ['xrSimulationWorkbenchOpenRevision += 1', 'window.dispatchEvent', 'window.addEventListener']) {
    if (!xrSimulationOpenRequest.includes(marker)) throw new Error(`expected the shared Simulation workbench request owner to expose ${marker}`)
  }
  for (const marker of [
    'draggable={true}',
    'data-kg-media-xr-draggable="1"',
    'startMediaDrag(event, dragPayload)',
    'primeMediaPointerDrag(event, dragPayload)',
    'primeMediaMouseDrag(event, dragPayload)',
    'continueMediaPointerDrag(event, dragPayload)',
    'continueMediaMouseDrag(event, dragPayload)',
    'buildXrStageMediaDragPayload(stage)',
    'buildXrAssetMediaDragPayload(asset, transition, subjectLabel)',
    'setNextLabel(current => reconcileNextSubjectLabelAfterDrop(current, detail.subjectLabel))',
  ]) {
    if (!xrMediaLibrary.includes(marker)) throw new Error(`expected Media 3D cards to reuse shared Media drag behavior through ${marker}`)
  }
  for (const marker of ['buildXrStageMediaDragPayload', 'buildXrAssetMediaDragPayload', 'controlXrSceneMediaDrop', 'XR_SCENE_MEDIA_DRAG_SCHEMA', 'XR_SCENE_MEDIA_DROP_COMMITTED_EVENT', 'label: projection.subjectLabel']) {
    if (!xrSceneMediaDrag.includes(marker)) throw new Error(`expected typed XR Media projection to expose ${marker}`)
  }
  for (const marker of ['selectXrMotionReferenceActor(subjectId)', 'selectXrMotionReferenceShotTarget(subjectId)']) {
    if (!xrSceneMcpRuntime.includes(marker)) throw new Error(`expected Media 3D placement to select the new Motion Control shot target through ${marker}`)
  }
  for (const marker of ['MEDIA_POINTER_DRAG_DROP_EVENT', 'readMediaDragPayload', 'claimMediaPointerDragDrop', 'isMediaPointerDragDistanceAccepted', 'controlXrSceneMediaDrop']) {
    if (!xrSceneMediaDrop.includes(marker)) throw new Error(`expected native XR surface drop to reuse shared Media behavior through ${marker}`)
  }
  if (!threeGraph.includes('useXrSceneMediaDrop') || !threeGraph.includes('data-kg-xr-scene-media-drop=')) {
    throw new Error('expected the Three.js XR surface to own native XR scene Media drops')
  }
  if (!richMediaPanelNode.includes('kgXrSceneMedia: payload.xrScene') || !mediaDragPayload.includes("XR_SCENE_MEDIA_DRAG_SCHEMA = 'knowgrph-xr-scene-media/v1'")) {
    throw new Error('expected 2D Rich Media Panels to persist the canonical typed XR Media projection')
  }
  for (const marker of [
    'normalizeXrSceneMediaDragProjection(unwrapGraphCellValue(props.kgXrSceneMedia))',
    '...(xrScene ? { xrScene } : {})',
  ]) {
    if (!richMediaPanelState.includes(marker)) throw new Error(`expected Rich Media Panel state to preserve live XR media through ${marker}`)
  }
  if (!richMediaPanelDirectSurface.includes('if (props.panel?.xrScene)') || !richMediaPanelDirectSurface.includes('<XrSceneMediaSurface')) {
    throw new Error('expected Rich Media Panel direct media to route XR projections to the native Three.js surface before the image fallback')
  }
  for (const marker of [
    '<Canvas',
    'new OrbitControls',
    'data-kg-rich-media-xr-scene="native-three"',
    'data-kg-card-media-interactive="1"',
    '<XrStagePresetGeometry',
    '<XrSceneLibraryAssetGeometry',
    'Native Three.js · XR',
  ]) {
    if (!xrSceneMediaSurface.includes(marker)) throw new Error(`expected live Rich Media XR renderer to expose ${marker}`)
  }
  if (xrSceneMediaSurface.includes('<img') || xrSceneMediaSurface.includes('buildXrMediaPreviewDataUrl')) {
    throw new Error('expected the live Rich Media XR renderer to avoid the static SVG/image placeholder path')
  }
  if (!xrMotionReferenceStage.includes('<XrStagePresetGeometry') || !xrStagePresetGeometry.includes('stage.structures.map')) {
    throw new Error('expected XR Mode and Rich Media previews to share the canonical procedural stage geometry')
  }
  for (const marker of ['<XrSingaporeTerrainGeometry', 'stage={stage}', "stage.id === 'singapore'"]) {
    if (!xrStagePresetGeometry.includes(marker)) throw new Error(`expected canonical stage geometry to project Singapore through ${marker}`)
  }
  for (const marker of ['XR_SINGAPORE_POI_SURFACE_RENDER_PLAN.map', '<XrRegionalPoiSurfaceGeometry', 'resolveXrTerrainPerimeter', 'selectable: false']) {
    if (!xrSingaporeTerrain.includes(marker)) throw new Error(`expected native Singapore presentation to expose ${marker}`)
  }
  if (xrSingaporeTerrain.includes('XrSceneLibraryAssetGeometry') || xrSingaporeTerrain.includes('showcaseSubjects')) {
    throw new Error('expected fixed Singapore terrain to leave mobile Helicopter/Car assets to canonical Media CRUD')
  }
  for (const marker of ['XR_TERRAIN_BOUNDARY_THICKNESS_METERS', "edge('west'", "edge('east'", "edge('north'", "edge('south'"]) {
    if (!xrTerrainPerimeter.includes(marker)) throw new Error(`expected canonical terrain perimeter to expose ${marker}`)
  }
  if (!xrSceneLibrarySubject.includes('export function XrSceneLibraryAssetGeometry') || !xrSceneLibrarySubject.includes('<XrSceneLibraryAssetGeometry')) {
    throw new Error('expected XR Mode and Rich Media previews to share the canonical procedural subject/prop geometry')
  }
  for (const marker of ['kg_xr_procedural_car', 'kg_xr_procedural_helicopter', 'kg_xr_car_wheel', 'kg_xr_helicopter_main_rotor']) {
    if (!xrProceduralVehicle.includes(marker)) throw new Error(`expected one shared procedural vehicle owner to expose ${marker}`)
  }
  if (!xrNativeAuthoredSubjects.includes('runtime.plan.subjects.map') || !xrNativeAuthoredSubjects.includes('<XrSceneLibrarySubject')) {
    throw new Error('expected active controller mode to retain persisted authored XR subjects')
  }
  const pose = sampleXrAnimationPose(null, 0)
  if (resolveMotionControlSubjectPose({ id: 'actor', assetId: 'person-adult' }, 'actor', pose) !== pose
    || resolveMotionControlSubjectPose({ id: 'actor', assetId: 'vehicle-sedan' }, 'actor', pose) !== pose
    || resolveMotionControlSubjectPose({ id: 'other', assetId: 'person-adult' }, 'actor', pose) !== null) {
    throw new Error('expected live Motion Control pose to target selected 3D XR subjects, objects, and props only')
  }
  if (!xrSceneLibrarySubject.includes('rotation={[degrees(pitch), degrees(roll), 0]}')) {
    throw new Error('expected humanoid local-Z arms to project elevation through the visible local-Y rotation axis')
  }
  for (const marker of ['livePose={!subjectIds.has(track.actorId) && track.actorId === motionActorId ? livePose : null}', 'const pose = livePose || sampleXrAnimationPose', 'resolveMotionControlSubjectPose(subject, motionActorId, livePose)']) {
    if (!`${xrMotionReferenceStage}\n${xrNativeAuthoredSubjects}`.includes(marker)) throw new Error(`expected selected XR subjects to receive live gesture pose through ${marker}`)
  }
  for (const marker of ['queueMicrotask(', 'useGraphStore.getState()', "state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr'", 'stopMotionControlAfterXrUnmount']) {
    if (!xrStageLifecycle.includes(marker)) throw new Error(`expected XR cleanup to survive StrictMode remounts through ${marker}`)
  }
  for (const marker of ['CollapsibleSection', 'ExpandCollapseAllButton', 'useCollapsibleSectionGroup', 'defaultCollapsed={false}', 'headerClassName="px-0"']) {
    if (!xrMediaLibrary.includes(marker)) throw new Error(`expected Media 3D sections to reuse shared disclosure behavior through ${marker}`)
  }
  if (existsSync(resolve(process.cwd(), 'src', 'components', 'toolbar', 'Canvas3dModeSelect.tsx'))) {
    throw new Error('expected Canvas View Surface Mode to remain the only mounted 3D/XR selector')
  }
  const plyProfile = resolveXrPanelSourceProfile('---\nkgSpatialCaptureFormat: "ply"\nkgAssetFormat: "ply"\nkgXrIngestionCacheKey: "abc123"\nkgXrRenderCacheKey: "abc123"\n---')
  if (plyProfile.kind !== 'spatial-capture' || plyProfile.format !== 'ply' || !plyProfile.isSpatialCapture || plyProfile.renderCacheKey !== 'abc123') {
    throw new Error(`expected PLY spatial capture profile, got ${JSON.stringify(plyProfile)}`)
  }
  const stack = resolveXrPanelRuntimeStack({
    capabilities: { webgl: true, webgl2: true, webgpu: true, webxr: true },
    profile: plyProfile,
    xrActive: true,
  })
  const stackStates = Object.fromEntries(stack.map(item => [item.id, item.state]))
  if (stackStates.threejs !== 'active' || stackStates.webgl !== 'active' || stackStates.webgpu !== 'available' || stackStates.webxr !== 'available' || stackStates.ply !== 'active' || stackStates.spz !== 'unsupported') {
    throw new Error(`expected native graphics stack to reflect active PLY XR state, got ${JSON.stringify(stackStates)}`)
  }
  const webgpuItem = stack.find(item => item.id === 'webgpu')
  if (!webgpuItem?.value.includes('not active') || webgpuItem.state === 'active') {
    throw new Error(`expected WebGPU to be reported as experimental browser availability, never the active renderer: ${JSON.stringify(webgpuItem)}`)
  }
  const gltfProfile = resolveXrPanelSourceProfile('---\nkgAssetFormat: "gltf"\n---')
  const gltfStack = Object.fromEntries(resolveXrPanelRuntimeStack({ capabilities: { webgl: true, webgl2: false, webgpu: false, webxr: false }, profile: gltfProfile, xrActive: false }).map(item => [item.id, item.state]))
  if (gltfStack.gltf !== 'source-ready' || gltfStack.glb !== 'available' || gltfStack.webgl !== 'active' || gltfStack.webgpu !== 'unavailable') {
    throw new Error(`expected distinct glTF/GLB and truthful WebGL/WebGPU states, got ${JSON.stringify(gltfStack)}`)
  }
  const glbProfile = resolveXrPanelSourceProfile('---\nkgAssetFormat: "glb"\n---')
  const glbStack = Object.fromEntries(resolveXrPanelRuntimeStack({ capabilities: { webgl: true, webgl2: true, webgpu: false, webxr: false }, profile: glbProfile, xrActive: false }).map(item => [item.id, item.state]))
  if (glbStack.glb !== 'source-ready' || glbStack.gltf !== 'available') {
    throw new Error(`expected GLB to remain distinct from glTF, got ${JSON.stringify(glbStack)}`)
  }
  const spzProfile = resolveXrPanelSourceProfile('---\nkgSpatialCaptureFormat: "spz"\n---')
  const spzItem = resolveXrPanelRuntimeStack({ capabilities: { webgl: true, webgl2: true, webgpu: true, webxr: true }, profile: spzProfile, xrActive: false }).find(item => item.id === 'spz')
  if (spzProfile.format !== 'spz' || spzItem?.state !== 'unsupported' || !spzItem.value.includes('Recognized source')) {
    throw new Error(`expected SPZ to be recognized without claiming runtime support, got ${JSON.stringify({ spzProfile, spzItem })}`)
  }
  const stagePayload = normalizeMediaDragPayload(buildXrStageMediaDragPayload(XR_MOTION_REFERENCE_STAGE_PRESETS[0]!))
  if (
    stagePayload?.label !== '3D for XR'
    || !stagePayload.url.startsWith('data:image/svg+xml')
    || stagePayload.xrScene?.schema !== XR_SCENE_MEDIA_DRAG_SCHEMA
    || stagePayload.xrScene.entityKind !== 'environment'
  ) {
    throw new Error(`expected environment drag payload to project into canonical Media, got ${JSON.stringify(stagePayload)}`)
  }
  let transformCommitCount = 0
  const invalidEmptyDraft = reconcileXrTransformNumberDraft({ draftValue: '', persistedValue: 1.25, minimum: 0.25, maximum: 4, commit: () => { transformCommitCount += 1; return true } })
  const invalidRangeDraft = reconcileXrTransformNumberDraft({ draftValue: '5', persistedValue: 1.25, minimum: 0.25, maximum: 4, commit: () => { transformCommitCount += 1; return true } })
  const rejectedDraft = reconcileXrTransformNumberDraft({ draftValue: '2', persistedValue: 1.25, minimum: 0.25, maximum: 4, commit: () => { transformCommitCount += 1; return false } })
  const committedDraft = reconcileXrTransformNumberDraft({ draftValue: '2', persistedValue: 1.25, minimum: 0.25, maximum: 4, commit: () => { transformCommitCount += 1; return true } })
  if (invalidEmptyDraft !== '1.25' || invalidRangeDraft !== '1.25' || rejectedDraft !== '1.25' || committedDraft !== '2' || transformCommitCount !== 2) {
    throw new Error(`expected XR transform drafts to roll back invalid and rejected edits, got ${JSON.stringify({ invalidEmptyDraft, invalidRangeDraft, rejectedDraft, committedDraft, transformCommitCount })}`)
  }
  if (reconcileNextSubjectLabelAfterDrop('  THIEF  ', 'THIEF') !== '' || reconcileNextSubjectLabelAfterDrop('PILOT', 'THIEF') !== 'PILOT') {
    throw new Error('expected a committed drag to clear only the matching next-subject label draft')
  }
  const assetPayload = normalizeMediaDragPayload(buildXrAssetMediaDragPayload(XR_SCENE_LIBRARY_ASSETS[0]!, 'linear', '  THIEF  '))
  if (assetPayload?.xrScene?.entityKind !== 'asset' || assetPayload.xrScene.entityId !== XR_SCENE_LIBRARY_ASSETS[0]!.id || assetPayload.xrScene.transition !== 'linear' || assetPayload.xrScene.subjectLabel !== 'THIEF') {
    throw new Error(`expected asset drag payload to retain typed XR placement metadata, got ${JSON.stringify(assetPayload)}`)
  }
  const richMediaProperties = buildRichMediaPanelDroppedMediaProperties(assetPayload!)
  if (richMediaProperties.kgXrSceneMedia !== assetPayload?.xrScene || richMediaProperties.media_kind !== 'image') {
    throw new Error(`expected 2D Rich Media Panel projection to persist XR metadata, got ${JSON.stringify(richMediaProperties)}`)
  }
  const richMediaState = buildRichMediaPanelOverlayState({
    node: {
      id: 'xr-rich-media-panel',
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: '3D for XR',
      properties: richMediaProperties as never,
    },
  })
  if (
    richMediaState?.xrScene?.schema !== XR_SCENE_MEDIA_DRAG_SCHEMA
    || richMediaState.xrScene.entityKind !== 'asset'
    || richMediaState.xrScene.entityId !== XR_SCENE_LIBRARY_ASSETS[0]!.id
  ) {
    throw new Error(`expected persisted XR metadata to hydrate the live Rich Media renderer, got ${JSON.stringify(richMediaState?.xrScene)}`)
  }
  const implementationText = [spatialAssetTools, mediaCatalog, xrMediaLibrary, xrSceneMediaDrag, xrSceneMediaDrop, sharedCameraFraming, cameraFramingRuntime, cameraFramingPose, cameraFramingControls, xrPanelModel, cameraPanel, cameraModel, floatingPanel, xrProceduralBall, xrProceduralVehicle, xrSingaporeTerrain, xrNativeAuthoredSubjects].join('\n')
  for (const token of [['super', 'splat'].join(''), ['play', 'canvas'].join(''), ['pc', 'ui'].join(''), ['splat', 'Data'].join('')]) {
    if (implementationText.toLowerCase().includes(token.toLowerCase())) {
      throw new Error(`expected XR panel implementation to avoid copied external runtime token ${token}`)
    }
  }
}
