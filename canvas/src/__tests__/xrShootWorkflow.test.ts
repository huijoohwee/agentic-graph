import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertPinnedCameraDictionaryForTest } from '@/__tests__/helpers/pinnedAgenticOsDictionary'
import type { GraphData } from '@/lib/graph/types'
import {
  XR_MOTION_REFERENCE_GRAPH_METADATA_KEY,
  XR_MOTION_REFERENCE_MAX_CAMERA_MARKS,
  readXrMotionReferencePlan,
  sampleXrMotionReferenceCameraRig,
  sampleXrMotionReferenceCameraSettings,
  serializeXrMotionReferencePlan,
} from '@/features/three/xrMotionReferenceModel'
import { buildXrMotionReferencePackage } from '@/features/three/xrMotionReferencePackage'
import { xrChoreographyCanDriveCamera, xrChoreographyOwnsCamera } from '@/features/three/xrCameraControlOwnership'
import { controlLocalCamera, inspectLocalCamera } from '@/features/strybldr/cameraMcpRuntime'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  readCameraFramingRuntimeDocumentKey,
} from '@/features/strybldr/cameraFramingRuntime'
import { shouldApplySharedCameraFramingRevision } from '@/features/three/cameraFramingControlsRuntime'
import { hydrateCanonicalXrMotionReferenceRuntime } from '@/features/three/XrMotionReferenceRuntimeBridge'
import { registerAgenticOsRemoteGrammarCatalogEntries, resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  dropXrMotionReferenceCastMark,
  hydrateXrMotionReferenceRuntime,
  readXrMotionReferenceRuntime,
  retimeXrMotionReferenceCameraMark,
  retimeXrMotionReferenceCastMark,
  selectXrMotionReferenceActor,
  selectXrMotionReferenceCameraMark,
  selectXrMotionReferenceCastMark,
  selectXrMotionReferenceShotTarget,
  setXrMotionReferenceCameraMark,
  setXrMotionReferenceCameraRig,
  setXrMotionReferenceCastMarkArmed,
  setXrMotionReferenceDuration,
  setXrMotionReferencePlayhead,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  buildXrShotTargets,
  XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID,
} from '@/features/three/xrShotTargets'
import { selectBoundXrShotTarget } from '@/features/three/xrSelectedActorBinding'
function readSource(...parts: string[]): string { return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8') }
function buildShootGraph(): GraphData {
  return {
    type: 'Graph',
    nodes: [{ id: 'actor-a', label: 'Lead', type: 'Person', properties: {} }],
    edges: [],
    metadata: {},
  }
}
function resetToNativeCameraGrammar() { resetAgenticOsRemoteGrammarCatalogForTests() }
export function testXrShootWorkflowMarksRigsRetimeAndExports() {
  resetToNativeCameraGrammar()
  const ownershipArgs = { mode: 'xr', xrEmptyWorld: false, cameraMarkCount: 1 } as const
  if (!xrChoreographyCanDriveCamera(ownershipArgs)
    || xrChoreographyOwnsCamera({ ...ownershipArgs, timelinePlaying: false })
    || !xrChoreographyOwnsCamera({ ...ownershipArgs, timelinePlaying: true })) {
    throw new Error('expected Camera choreography to drive scrub previews while reserving exclusive ownership for active playback')
  }
  if (shouldApplySharedCameraFramingRevision({ appliedRevision: 4, appliedContextKey: 'xr:graph', revision: 4, contextKey: 'xr:graph', forcedReapply: false })
    || !shouldApplySharedCameraFramingRevision({ appliedRevision: 4, appliedContextKey: 'xr:graph', revision: 5, contextKey: 'xr:graph', forcedReapply: false })
    || !shouldApplySharedCameraFramingRevision({ appliedRevision: 4, appliedContextKey: 'xr:graph', revision: 4, contextKey: 'xr:graph', forcedReapply: true })) {
    throw new Error('expected pausing at the same playhead to preserve its track pose until a new frame or forced reapply arrives')
  }
  const shootCameraSource = readSource('features', 'strybldr', 'XrShootCameraSection.tsx')
  const cameraPanelSource = readSource('features', 'strybldr', 'StrybldrCameraFloatingPanelView.tsx')
  const sharedCameraSource = readSource('features', 'strybldr', 'StrybldrCameraFramingSection.tsx')
  const cameraControlSource = readSource('features', 'strybldr', 'StrybldrCameraPanel.tsx')
  const cameraOpticsSource = readSource('features', 'strybldr', 'StrybldrCameraOpticsSection.tsx')
  const cameraOpticsModelSource = readSource('features', 'strybldr', 'cameraOptics.ts')
  const retimeSource = readSource('features', 'three', 'CameraMotionMarkRetime.tsx')
  const timelineSource = readSource('features', 'three', 'XrCameraMotionSection.tsx')
  const timelineChromeSource = readSource('components', 'timeline', 'TimelineTransportControls.tsx')
  const timelineChromeGanttCssSource = readSource('components', 'timeline', 'TimelineTransportControlsMermaidGantt.css')
  const timelineRulerSource = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const timelineRulerCssSource = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.css')
  const timelineTimeAxisControlsSource = readSource('components', 'timeline', 'VideoSequenceTimeAxisControls.tsx')
  const ganttTransportSource = readSource('features', 'gitgraph', 'GanttTimelineTransportPanel.tsx')
  const bottomTimelineSource = readSource('features', 'gitgraph', 'TimelineBottomPanelView.tsx')
  const cameraMcpContractSource = readSource('features', 'strybldr', 'cameraMcpContract.mjs')
  const cameraMcpRuntimeSource = readSource('features', 'strybldr', 'cameraMcpRuntime.ts')
  const cameraSourceMcpSource = readSource('features', 'strybldr', 'cameraSourceMcpRuntime.ts')
  const cameraSourceCatalog = readSource('features', 'three', 'xrNativeControllerCameraCatalog.ts')
  const cameraSourceRuntime = readSource('features', 'three', 'xrNativeControllerCameraRuntime.ts')
  const cameraMcpInvocationSource = readSource('features', 'strybldr', 'CameraMcpInvocationSection.tsx')
  const cameraWebMcpSource = readSource('features', 'agent-ready', 'cameraWebMcpTools.ts')
  const floatingPanelCatalogLayoutSource = readSource('lib', 'ui', 'floatingPanelCatalogLayout.tsx')
  const mediaCatalogSharedSource = readSource('features', 'command-menu', 'mediaCatalogShared.tsx')
  const stageSource = readSource('features', 'three', 'XrMotionReferenceStage.tsx')
  const subjectSource = readSource('features', 'three', 'XrSceneLibrarySubject.tsx')
  const retimeCssSource = readSource('features', 'three', 'CameraMotionMarkRetime.css')
  const choreographyControlsSource = readSource('features', 'three', 'XrChoreographyMarkControls.tsx')
  const runtimeSource = readSource('features', 'three', 'xrMotionReferenceRuntime.ts')
  const shotTargetSource = readSource('features', 'three', 'xrShotTargets.ts')
  const objectInputOwnershipSource = readSource('features', 'three', 'threeObjectInputOwnership.ts')
  const stageGeometrySource = readSource('features', 'three', 'XrStagePresetGeometry.tsx')
  const controlsSource = readSource('features', 'three', 'Controls.tsx')
  const playbackSource = readSource('features', 'three', 'xrCameraPlaybackControlsRuntime.ts')
  const samplingSource = readSource('features', 'three', 'xrMotionReferenceSampling.ts')
  const aspectMaskSource = readSource('features', 'three', 'XrCameraAspectMask.tsx')
  const threeGraphSource = readSource('lib', 'three', 'ThreeGraph.impl.tsx')
  const packageSource = readSource('features', 'three', 'xrMotionReferencePackage.ts')
  const agentReadyToolContractSource = readSource('features', 'agent-ready', 'knowgrphAgentReadyToolContract.mjs')
  for (const marker of [
    'data-kg-xr-shoot-panel="1"',
    'data-kg-xr-shoot-cast-mark="1"',
    'data-kg-xr-shoot-medium-shot="1"',
    'data-kg-xr-shoot-camera-mark="1"',
    'XR_MOTION_REFERENCE_CAMERA_RIGS',
    "event.key.toLowerCase() === 'm'",
    'data-kg-xr-shoot-target="scene-or-object"',
    'data-kg-xr-camera-source="1"',
    'aria-label="XR camera source"',
    'selectBoundXrShotTarget',
    'selectedShotTarget.id',
    'data-kg-camera-optics-projection="xr-shoot"',
    'Optics · edit in Camera',
  ]) {
    if (!shootCameraSource.includes(marker)) throw new Error(`expected FloatingPanel Camera SHOOT to expose ${marker}`)
  }
  for (const marker of ['fixed-follow', 'free-orbit', 'selectXrNativeControllerCameraMode', 'subscribeXrNativeControllerCamera']) {
    if (!shootCameraSource.includes(marker) && !cameraSourceCatalog.includes(marker) && !cameraSourceRuntime.includes(marker)) {
      throw new Error(`expected Camera source selection to expose ${marker}`)
    }
  }
  if (shootCameraSource.includes('data-kg-xr-shoot-lens') || shootCameraSource.includes('aria-label="Camera focal length in millimeters"')) {
    throw new Error('expected XR SHOOT to project shared Camera optics without duplicating an editable lens owner')
  }
  for (const marker of ['<StrybldrCameraOpticsSection', 'data-kg-strybldr-camera-panel="1"']) {
    if (!cameraControlSource.includes(marker)) throw new Error(`expected FloatingPanel Camera to remain the sole real-optics editor through ${marker}`)
  }
  for (const marker of ['data-kg-camera-optics-owner="floating-panel-camera"', 'data-kg-camera-sensor="1"', 'data-kg-strybldr-camera-lens="1"', 'data-kg-camera-focus-distance="1"', 'data-kg-camera-aspect-mask-control="1"', 'Lens zoom and rack focus interpolate between Camera marks']) {
    if (!cameraOpticsSource.includes(marker)) throw new Error(`expected real Camera optics UI to expose ${marker}`)
  }
  for (const marker of ["id: 'super-16'", "id: 'super-35'", "id: 'full-frame'", "id: '65mm'", 'resolveCameraVerticalFovDegreesForOptics', 'resolveFullFrameEquivalentFocalLengthMm']) {
    if (!cameraOpticsModelSource.includes(marker)) throw new Error(`expected the native sensor-aware optics model to expose ${marker}`)
  }
  for (const marker of ['<StrybldrCameraFramingSection', '<XrShootCameraSection']) {
    if (!cameraPanelSource.includes(marker)) throw new Error(`expected canonical FloatingPanel Camera ownership through ${marker}`)
  }
  for (const marker of ['<CollapsibleSection', '<ExpandCollapseAllButton', '<CameraMcpInvocationSection', 'useCollapsibleSectionGroup', 'Expand All Camera sections', 'Collapse All Camera sections', 'renderMarkdownSigilInlineText', 'renderAgenticOsInvocationKeywordChip', 'sourceLink: false', 'UI_INLINE_CHIP_GROUP_CLASSNAME', 'data-kg-camera-runtime-invocation-chip-renderer="shared-markdown-sigil"', '/camera.frame #camera-shot @camera']) {
    if (!cameraPanelSource.includes(marker)) throw new Error(`expected Camera to reuse the 3D-for-XR disclosure owner through ${marker}`)
  }
  for (const marker of ['getAgenticOsDictionaryInvocations', 'inspectLocalCamera', 'data-kg-camera-grammar-status={nativeInvocationReady', 'data-kg-camera-webmcp-tool', 'data-kg-camera-invocation-token', 'floatingPanelCatalogThreeRowClassName', 'floatingPanelCatalogThreeRowThumbnailFrameClassName', 'renderMarkdownSigilInlineText(title,', 'renderAgenticOsInvocationKeywordChip', 'sourceLink: false', 'UI_INLINE_CHIP_GROUP_CLASSNAME', 'data-kg-camera-invocation-chip-renderer=', "const invocationTitle = /^[#/@]/.test(title)"]) {
    if (!cameraMcpInvocationSource.includes(marker)) throw new Error(`expected Camera MCP cards to project the shared catalog through ${marker}`)
  }
  if (!floatingPanelCatalogLayoutSource.includes('FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT')) {
    throw new Error('expected the shared floating-panel catalog owner to name the three-row layout')
  }
  for (const marker of ['floatingPanelCatalogThreeRowClassName', 'floatingPanelCatalogThreeRowThumbnailFrameClassName']) {
    if (!floatingPanelCatalogLayoutSource.includes(marker) || !mediaCatalogSharedSource.includes(marker)) {
      throw new Error(`expected Camera and Media 3D to share the three-row catalog layout through ${marker}`)
    }
  }
  if (cameraPanelSource.includes('<XrCameraMotionSection')) throw new Error('expected FloatingPanel Camera to leave motion transport in BottomPanel Timeline')
  if (cameraPanelSource.indexOf('<StrybldrCameraFramingSection') > cameraPanelSource.indexOf('<XrShootCameraSection')) {
    throw new Error('expected the shared globe Camera utilities to remain first in every surface mode')
  }
  for (const marker of ['data-kg-xr-timeline-retime="1"', 'retimeXrMotionReferenceCastMark', 'retimeXrMotionReferenceCameraMark', '<TimelineTransportTimeAxisMark', 'laneStyle="video"', 'laneStyle="audio"', 'data-kg-xr-lane-cast-mark', 'data-kg-xr-lane-camera-mark', 'selectXrMotionReferenceCastMark', 'aria-pressed={selected}', 'data-kg-xr-stage-highlight-target']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected Camera choreography retiming to expose ${marker}`)
  }
  for (const marker of ["laneTarget?.kind === 'cast'", "laneTarget?.kind === 'camera'", 'data-kg-xr-choreography-cast-lane', 'data-kg-xr-choreography-camera-lane', 'data-kg-xr-choreography-lane-axis', 'beginRulerMarkDrag', 'resolveVideoSequenceRulerInsetPixelMetrics', 'XrChoreographyMarkControls', 'compact showPosition', 'applyXrConstrainedCastMarkChoreography', 'setXrMotionReferenceCameraMarkChoreography', 'data-kg-xr-ruler-mark-editor', 'data-kg-xr-speed-warning-count']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected each cast and Camera track to expose the shared per-mark choreography model through ${marker}`)
  }
  for (const marker of ['data-kg-camera-optics-projection="timeline-mark"', 'data-kg-camera-sensor=', 'data-kg-camera-focal-length-mm=', 'data-kg-camera-focus-distance-m=', 'data-kg-camera-aspect-ratio=']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to project Camera-owned optics keyframes through ${marker}`)
  }
  for (const marker of ['XR_CHOREOGRAPHY_EASINGS', 'XR_CHOREOGRAPHY_GAITS', 'data-kg-xr-mark-easing', 'data-kg-xr-mark-gait', 'data-kg-xr-speed-warning', 'showPosition', 'data-kg-xr-mark-position-layout="compact-timeline"', 'XYZ m']) {
    if (!choreographyControlsSource.includes(marker)) throw new Error(`expected shared choreography controls to expose ${marker}`)
  }
  for (const marker of ['xr-camera-motion-retime-lane-label', 'xr-camera-motion-retime-lane-mark', 'position: absolute', 'inset: 0', 'top: 50%', 'transform: translate(-50%, -50%)', 'cursor: ew-resize', 'xr-camera-motion-mark-selection-controls--lane', '--kg-xr-mark-editor-translate-x', '[aria-pressed="true"]', 'xr-shot-target-timeline-bar', 'data-kg-xr-shot-target-selected']) {
    if (!retimeCssSource.includes(marker)) throw new Error(`expected cast and Camera marks to use dedicated shared-scale lanes through ${marker}`)
  }
  for (const marker of ['<CameraMotionMarkRetime', 'layout="lane"', 'laneTarget={{ kind:', 'timelineInsertedLanes={[', "insertAfterLaneId: 'scene'", 'includeChoreographyCues: false', '<TimelineTransportInlineClip', '<TimelineTransportTimeAxisClip', 'data-kg-xr-choreography-shared-axis-rail', 'data-kg-xr-timeline-consolidated-lane="stage-output-ruler"', 'data-kg-xr-choreography-cast-lane-label', 'data-kg-xr-choreography-camera-lane-label', 'data-kg-xr-timeline-control-bar="stage-output"', 'data-kg-xr-timeline-shot-target="1"', 'aria-label="XR timeline scene or 3D object shot target"', 'data-kg-xr-shot-target-lane', 'data-kg-xr-shot-target-bar', 'onSelectedRowKeyChange', 'onClickCapture', '[data-kg-gantt-timeline-track-row-key*="xr_stage_scene"]', 'XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID', 'data-kg-xr-timeline-playhead-control="1"', 'aria-label="XR timeline playhead seconds"', 'data-kg-xr-timeline-seconds-control="time-axis"', 'aria-label="XR timeline seconds"', 'data-kg-xr-timeline-fps-control="time-axis"', 'aria-label="XR timeline FPS"', 'runtimeDurationSeconds={runtime.plan.durationSeconds}', 'runtimeFrameRate={runtime.plan.fps}', 'data-kg-xr-timeline-transport="reused-gantt-player"', '<GanttTimelineTransportPanel', 'supplementalLanes={', 'timeAxisControls={']) {
    if (!timelineSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to own consolidated XR motion through ${marker}`)
  }
  for (const forbidden of ['layout="controls"', 'layout="ruler"', 'layout="time-axis"', 'data-kg-xr-timeline-control-bar="marks"', 'timeRulerOverlay={<CameraMotionMarkRetime', '--kg-xr-timeline-marks-height', '>Marks</span>']) {
    if (timelineSource.includes(forbidden)) throw new Error(`expected BottomPanel Timeline to remove the duplicate marks lane, found ${forbidden}`)
  }
  if (timelineSource.indexOf('<CameraMotionMarkRetime') < timelineSource.indexOf('<GanttTimelineTransportPanel')) {
    throw new Error('expected XR Stage/Output and mark retiming to live inside the Gantt transport lane')
  }
  for (const marker of ['timeline-transport-supplemental-lanes', 'TimelineTransportInlineClip', 'TimelineTransportTimeAxisClip', 'TimelineTransportTimeAxisMark', 'timeline-transport-track-clip--lane-${laneStyle}', 'timeline-transport-track-clip-label', 'timeline-transport-time-axis-clip', 'timeline-transport-time-axis-mark']) {
    if (!timelineChromeSource.includes(marker)) throw new Error(`expected shared Gantt clip UI reuse through ${marker}`)
  }
  if (!ganttTransportSource.includes('supplementalLanes') || !ganttTransportSource.includes('timeAxisControls') || !ganttTransportSource.includes('timeRulerOverlay') || !ganttTransportSource.includes('timelineInsertedLanes')) {
    throw new Error('expected the shared Gantt transport to own supplemental-lane, time-axis, ruler-overlay, and inserted-lane slots')
  }
  for (const marker of ['timeAxisControls?: React.ReactNode', 'timeRulerOverlay?: React.ReactNode', 'timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]', '<VideoSequenceTimeAxisControls>{timeAxisControls}</VideoSequenceTimeAxisControls>', '{timeRulerOverlay}', 'visibleLanes.flatMap(lane', 'data-kg-video-sequence-inserted-lane-content']) {
    if (!timelineRulerSource.includes(marker)) throw new Error(`expected the shared time ruler to expose ${marker}`)
  }
  for (const marker of [':not(.timeline-transport-time-axis-clip)', ':not(.timeline-transport-time-axis-mark)']) {
    if (!timelineRulerCssSource.includes(marker)) throw new Error(`expected nested shared time-axis primitives to opt out of full clip chrome through ${marker}`)
  }
  for (const marker of ['aria-label="Timeline time-axis controls"', 'data-kg-video-sequence-time-axis-controls="1"']) {
    if (!timelineTimeAxisControlsSource.includes(marker)) throw new Error(`expected the shared time-axis control owner to expose ${marker}`)
  }
  if (!timelineChromeGanttCssSource.includes(':has(.timeline-video-sequence-time-axis-controls)') || !timelineChromeGanttCssSource.includes('--kg-video-sequence-lane-sidebar-width: 184px')) {
    throw new Error('expected time-axis controls and supplemental lanes to share one widened sidebar column')
  }
  for (const marker of ['resolveVideoSequenceRulerInsetLeft', 'resolveVideoSequenceRulerInsetPixelMetrics', 'resolveVideoSequenceTimelineScaleDurationSeconds', 'data-kg-xr-timeline-retime-scale-seconds']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected mark retiming to share ruler geometry through ${marker}`)
  }
  const stageOutputBarStart = timelineSource.indexOf('data-kg-xr-timeline-control-bar="stage-output"')
  const stageOutputBarSource = timelineSource.slice(stageOutputBarStart, timelineSource.indexOf('</TimelineTransportInlineClip>', stageOutputBarStart))
  if (stageOutputBarSource.includes('>FPS</span>') || stageOutputBarSource.includes('>Seconds</span>')) {
    throw new Error('expected Seconds and FPS to leave the Stage/Output bar and align with the shared time axis')
  }
  if (!bottomTimelineSource.includes('XrCameraMotionSection') || !bottomTimelineSource.includes('canvas3dMode')) {
    throw new Error('expected BottomPanel Timeline to restore its XR motion owner')
  }
  if (sharedCameraSource.includes('No storyboard card loaded.') || !sharedCameraSource.includes("data-kg-camera-framing-mode={selectedCard ? 'storyboard' : 'shared'}")) {
    throw new Error('expected globe-like shared Camera utilities to remain available without a storyboard card')
  }
  for (const marker of ['onFloorPoint={!paused && runtime.castMarkArmed ? placeCastMark : undefined}', 'dropXrMotionReferenceCastMark', 'MarkNumberSprite', 'markNumber: index + 1', 'kg_xr_motion_cast_mark_highlight_', 'runtime.selectedMark?.kind === \'cast\'', 'XR_MOTION_REFERENCE_SELECTION_COLOR', 'CastMarkControl', 'resolveCastControlMark', 'controlSurface="actor"', 'kgXrAnimationControl: true', 'rayInCoordinateRoot(event.ray, coordinateRootRef).intersectPlane', 'applyXrConstrainedCastMarkChoreography', 'claimThreeObjectInputOwnership(inputOwnerId, event.pointerId)', 'releaseThreeObjectInputOwnership(inputOwnerId', 'captureThreeObjectPointer(event)', 'hasThreeObjectDragMoved', 'dragOffsetRef.current.set(...markWorldPosition).sub(grabPoint)', 'point.add(dragOffsetRef.current)', 'activePointerIdRef.current = event.pointerId', "window.addEventListener('lostpointercapture', finishWindowDrag, true)", "window.addEventListener('blur', finishWindowDrag)", "document.addEventListener('visibilitychange', finishWindowDrag)", "draggableAxes: 'xz'", 'onClick={!paused ? event => {', 'selectXrMotionReferenceCameraMark(mark.id)', "window.addEventListener('pointercancel', finishWindowDrag)"]) {
    if (!stageSource.includes(marker)) throw new Error(`expected direct numbered XR floor marking to expose ${marker}`)
  }
  for (const marker of ['<XrSceneLibrarySubject', 'selected={runtime.selectedShotTargetId === subject.id}', 'selectBoundXrShotTarget(subject.id)']) {
    if (!stageSource.includes(marker)) throw new Error(`expected timeline, SHOOT, and stage asset selection to share shot-target state through ${marker}`)
  }
  for (const marker of ['kg_xr_scene_subject_selected_', 'onClick={onSelect ? event => {', 'onSelect()', 'event.stopPropagation()', 'XR_MOTION_REFERENCE_SELECTION_COLOR']) {
    if (!subjectSource.includes(marker)) throw new Error(`expected selectable XR assets to expose a visible stage highlight through ${marker}`)
  }
  for (const marker of ['selectedMark: XrMotionReferenceMarkSelection', 'selectedShotTargetId: string', 'selectXrMotionReferenceShotTarget', 'selectXrMotionReferenceCastMark', 'selectXrMotionReferenceCameraMark', 'resolveExistingXrMotionReferenceMarkSelection']) {
    if (!runtimeSource.includes(marker)) throw new Error(`expected XR mark highlight selection runtime to expose ${marker}`)
  }
  for (const marker of ['XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID', 'buildXrShotTargets', 'resolveDefaultXrShotTargetId', 'resolveXrShotTargetPosition']) {
    if (!shotTargetSource.includes(marker)) throw new Error(`expected one shared Scene/3D Object SHOOT target owner through ${marker}`)
  }
  if (runtimeSource.includes('viewportControlActive') || runtimeSource.includes('setXrMotionReferenceViewportControlActive')) {
    throw new Error('expected XR object gestures to use the neutral three-object input owner instead of a runtime-local camera flag')
  }
  const xrClaimIndex = stageSource.indexOf('claimThreeObjectInputOwnership(inputOwnerId, event.pointerId)')
  const xrSelectionIndex = stageSource.indexOf('selectBoundXrActor(actorId)', xrClaimIndex)
  if (xrClaimIndex < 0 || xrSelectionIndex < 0 || xrClaimIndex > xrSelectionIndex) {
    throw new Error('expected XR object input to suspend camera framing before actor selection can publish')
  }
  if (!stageGeometrySource.includes('const point = event.point.clone()')
    || !stageGeometrySource.includes('coordinateRoot.worldToLocal(point)')
    || !stageGeometrySource.includes('onFloorPoint([point.x, groundY, point.z])')) {
    throw new Error('expected the native stage floor to own the bounded placed-stage pointer projection')
  }
  if (!controlsSource.includes('useXrMotionReferenceCameraPlayback({')
    || !playbackSource.includes('sampleXrMotionReferenceCameraPose')
    || !playbackSource.includes('resolveCameraVerticalFovDegrees')
    || !playbackSource.includes('camera.focus = settings.focusDistanceMeters')
    || !samplingSource.includes('focusDistanceMeters: left.settings.focusDistanceMeters')
    || !playbackSource.includes('requestXrMotionReferenceCameraPlaybackReapply')
    || !['prePlaybackPoseRef', "mode !== 'free-orbit'", 'camera.position.copy(snapshot.position)', 'controls.target.copy(snapshot.target)'].every(marker => playbackSource.includes(marker))
    || !controlsSource.includes('pendingCameraSceneResetRef')
    || !controlsSource.includes("if (mode === 'xr')")) {
    throw new Error('expected scrub/play camera choreography to use the XR camera playback owner')
  }
  if (!controlsSource.includes('useThreeObjectInputOwnership')
    || !objectInputOwnershipSource.includes('bindThreeViewportControlsOwnership')
    || !objectInputOwnershipSource.includes('subscribeThreeObjectInputOwnership(sync)')
    || objectInputOwnershipSource.includes('readXrMotionReferenceRuntime')) {
    throw new Error('expected every 3D and XR object gesture to synchronously suspend camera controls through one neutral owner')
  }
  if (!packageSource.includes('cameraRig:') || !packageSource.includes('cameraLensMm:') || !packageSource.includes('cameraOptics:') || !packageSource.includes('focusDistanceMeters:')) {
    throw new Error('expected deterministic frame samples to carry rig, lens, sensor, focus, and aspect data')
  }
  for (const marker of ['data-kg-xr-camera-aspect-mask="1"', 'data-kg-camera-optics-projection="xr-viewport"', 'framing.claimed', "'selected-timeline-mark'", "'timeline-playback'", "'floating-panel-camera'"]) if (!aspectMaskSource.includes(marker)) throw new Error(`expected the XR viewport aspect-mask projection to expose ${marker}`)
  if (aspectMaskSource.includes('isXrPhysicsRunReadyDemoActive')) throw new Error('expected explicit Camera ownership to replace document-specific aspect-mask suppression')
  if (!threeGraphSource.includes('<XrCameraAspectMask />')) throw new Error('expected XR Mode to render its shared Camera aspect mask over the Three viewport')
  for (const marker of ['/camera.select', '/camera.frame', '/camera.animate', '/camera.play', '/camera.scrub']) {
    if (!cameraMcpContractSource.includes(marker)) throw new Error(`expected Camera / @ # invocation contract to expose ${marker}`)
  }
  if (cameraMcpContractSource.includes('CAMERA_INVOCATION_CATALOG')) {
    throw new Error('expected Camera invocation metadata to remain contract-owned without a duplicate catalog')
  }
  for (const marker of ['inspectLocalCamera', 'controlLocalCamera', 'publishCameraFramingRuntime', 'setXrMotionReferenceCameraMark', 'setTimelineTransportState']) {
    if (!cameraMcpRuntimeSource.includes(marker) && !cameraWebMcpSource.includes(marker)) throw new Error(`expected Camera MCP runtime to expose ${marker}`)
  }
  for (const marker of ['normalizeCameraSourceSelection', 'inspectLocalCameraSource', 'timeline-playback', 'inputSuspended']) {
    if (!cameraSourceMcpSource.includes(marker)) throw new Error(`expected Camera MCP source selection to expose ${marker}`)
  }
  for (const marker of ['sensor=full-frame', 'focus=5', 'aspect=2.39:1', 'CameraSensorFormatId', 'focusDistanceMeters', 'aspectRatio']) {
    if (!cameraMcpRuntimeSource.includes(marker)) throw new Error(`expected / @ # Camera control to expose optics parameter ${marker}`)
  }
  for (const marker of ['sensorId:', 'focusDistanceMeters:', 'aspectRatio:', "'super-16'", "'super-35'", "'full-frame'", "'65mm'"]) {
    if (!agentReadyToolContractSource.includes(marker)) throw new Error(`expected Camera WebMCP structured optics control to expose ${marker}`)
  }
  const implementation = [shootCameraSource, cameraPanelSource, sharedCameraSource, cameraControlSource, cameraOpticsSource, cameraOpticsModelSource, retimeSource, timelineSource, stageSource, stageGeometrySource, playbackSource, samplingSource, aspectMaskSource, packageSource, cameraMcpContractSource, cameraMcpRuntimeSource, cameraSourceMcpSource, cameraSourceCatalog, cameraSourceRuntime, cameraMcpInvocationSource].join('\n').toLowerCase()
  for (const forbidden of ['wassermanproductions', 'blockout', 'ffmpeg', 'electron-vite']) {
    if (implementation.includes(forbidden)) throw new Error(`expected the native SHOOT implementation to avoid external runtime token ${forbidden}`)
  }
  const staticObjectPlan = readXrMotionReferencePlan({
    durationSeconds: 6,
    subjects: [{
      id: 'chair-a',
      assetId: 'furniture-chair',
      label: 'Hero chair',
      color: '#c084fc',
      position: [3, 0, 2],
      rotationYDegrees: 0,
      scale: 1,
    }],
    camera: [{
      timeSeconds: 0,
      anchorId: 'chair-a',
      settings: { angle: 'front', level: 'eye-level', shot: 'medium', note: '', orbitX: 0, orbitY: 0, focalLengthMm: 50 },
    }],
  })
  const staticTargets = buildXrShotTargets(staticObjectPlan)
  if (staticTargets[0]?.id !== XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID
    || !staticTargets.some(target => target.id === 'chair-a' && target.kind === 'object' && target.castActorId === null)
    || staticObjectPlan.camera[0]?.pose.target.join('|') !== '3|0|2') {
    throw new Error('expected SCENE and non-cast 3D Objects to remain first-class SHOOT targets with anchored camera poses')
  }
  const graphData = buildShootGraph()
  hydrateXrMotionReferenceRuntime({ sceneKey: 'shoot-scene', nodes: graphData.nodes, persistedValue: null })
  selectXrMotionReferenceActor('actor-a')
  if (readXrMotionReferenceRuntime().selectedShotTargetId !== 'actor-a') {
    throw new Error('expected cast selection to bind the matching SHOOT object target')
  }
  selectXrMotionReferenceShotTarget(XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID)
  if (readXrMotionReferenceRuntime().selectedShotTargetId !== XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID) {
    throw new Error('expected the Timeline SCENE bar to bind the shared SHOOT target')
  }
  selectXrMotionReferenceActor('actor-a')
  setXrMotionReferenceDuration(6)
  setXrMotionReferencePlayhead(1)
  setXrMotionReferenceCastMarkArmed(true)
  dropXrMotionReferenceCastMark([2, 0, -1])
  const droppedMark = readXrMotionReferenceRuntime().plan.cast[0]?.marks.find(mark => mark.timeSeconds === 1)
  if (!droppedMark || !readXrMotionReferenceRuntime().castMarkArmed) {
    throw new Error('expected M-armed floor placement to create a cast mark at the shared playhead')
  }
  selectXrMotionReferenceCastMark('actor-a', droppedMark.id)
  const selectedCastMark = readXrMotionReferenceRuntime().selectedMark
  if (selectedCastMark?.kind !== 'cast' || selectedCastMark.actorId !== 'actor-a' || selectedCastMark.markId !== droppedMark.id) {
    throw new Error('expected a timeline cast mark selection to target its matching XR stage mark')
  }
  retimeXrMotionReferenceCastMark('actor-a', droppedMark.id, 2.25)
  const retimedCastRuntime = readXrMotionReferenceRuntime()
  const retimedCastMark = retimedCastRuntime.plan.cast[0]?.marks.find(mark => mark.timeSeconds === 2.25)
  if (!retimedCastMark) {
    throw new Error('expected cast mark retiming to update the native plan')
  }
  if (retimedCastRuntime.selectedMark?.kind !== 'cast' || retimedCastRuntime.selectedMark.markId !== retimedCastMark.id) {
    throw new Error('expected retiming to preserve the selected mark across deterministic ID regeneration')
  }
  setXrMotionReferenceCameraRig('handheld')
  setXrMotionReferenceCameraMark({
    timeSeconds: 0,
    anchorId: 'actor-a',
    settings: { angle: 'front', level: 'eye-level', shot: 'medium', note: '', orbitX: 0, orbitY: 0, sensorId: 'super-35', focalLengthMm: 35, focusDistanceMeters: 6, aspectRatio: '16:9' },
  })
  setXrMotionReferenceCameraMark({
    timeSeconds: 6,
    anchorId: 'actor-a',
    rig: 'drone',
    settings: { angle: 'right-side', level: 'high-angle', shot: 'medium', note: '', orbitX: 0.3, orbitY: -0.25, sensorId: 'full-frame', focalLengthMm: 85, focusDistanceMeters: 2, aspectRatio: '2.39:1' },
  })
  const finalCameraMark = readXrMotionReferenceRuntime().plan.camera.find(mark => mark.timeSeconds === 6)
  if (!finalCameraMark) throw new Error('expected SHOOT to drop a second camera mark')
  selectXrMotionReferenceCameraMark(finalCameraMark.id)
  if (readXrMotionReferenceRuntime().selectedShotTargetId !== 'actor-a') {
    throw new Error('expected camera mark selection to restore its linked 3D Object SHOOT target')
  }
  retimeXrMotionReferenceCameraMark(finalCameraMark.id, 5.5)
  const shootPlan = readXrMotionReferenceRuntime().plan
  const retimedCameraMark = shootPlan.camera.find(mark => mark.timeSeconds === 5.5)
  if (!retimedCameraMark) throw new Error('expected a retimed camera mark for stage selection')
  const selectedCameraMark = readXrMotionReferenceRuntime().selectedMark
  if (selectedCameraMark?.kind !== 'camera' || selectedCameraMark.markId !== retimedCameraMark.id) {
    throw new Error('expected a timeline camera mark selection to target its matching XR stage camera')
  }
  const sampledLens = sampleXrMotionReferenceCameraSettings(shootPlan.camera, 2.75)?.focalLengthMm
  const sampledFocus = sampleXrMotionReferenceCameraSettings(shootPlan.camera, 2.75)?.focusDistanceMeters
  if (shootPlan.camera[0]?.rig !== 'handheld'
    || shootPlan.camera[1]?.rig !== 'drone'
    || shootPlan.camera[1]?.timeSeconds !== 5.5
    || sampleXrMotionReferenceCameraRig(shootPlan.camera, 2.75) !== 'handheld'
    || sampledLens !== 60
    || sampledFocus !== 4) {
    throw new Error(`expected rig-aware camera retiming, zoom, and rack-focus interpolation, got ${JSON.stringify(shootPlan.camera)}`)
  }
  const bundle = buildXrMotionReferencePackage({ plan: shootPlan, graphData, documentName: 'Shoot scene.md' })
  const brief = bundle.files.find(file => file.path === 'handoff/video-generator-brief.txt')?.text || ''
  if (!brief.includes('handheld rig, linear easing, Super 35 27.99x19.22mm, 35mm, focus 6m, 16:9 delivery mask')
    || !brief.includes('drone rig, ease-in-out easing, Full Frame 36x24mm, 85mm, focus 2m, 2.39:1 delivery mask')) {
    throw new Error('expected the exported package to preserve camera rig, easing, sensor, zoom, focus, and aspect choreography')
  }
  const priorCamera = readCameraFramingRuntime()
  const priorGraphState = useGraphStore.getState()
  useGraphStore.setState({ floatingPanelOpen: false, floatingPanelView: 'animation' } as never)
  const freeOrbitResult = controlLocalCamera({ invocation: '/camera.select @camera #camera camera=free-orbit' })
  selectBoundXrShotTarget('actor-a')
  const targetSelectionState = { panel: useGraphStore.getState().floatingPanelView, camera: inspectLocalCamera().source.selected }
  const freeOrbitInspection = inspectLocalCamera()
  const fixedFollowResult = controlLocalCamera({ action: 'select', cameraId: 'fixed-follow' })
  const invalidCameraResult = controlLocalCamera({ action: 'select', cameraId: 'authored-shot' as never })
  const invalidCameraSemantic = controlLocalCamera({ invocation: '/camera.select @camera #camera-shot camera=free-orbit' })
  if (!freeOrbitResult.ok
    || freeOrbitInspection.source.selected !== 'free-orbit'
    || freeOrbitInspection.source.effectiveOwner !== 'free-orbit'
    || targetSelectionState.panel !== 'camera'
    || targetSelectionState.camera !== 'free-orbit'
    || !fixedFollowResult.ok
    || inspectLocalCamera().source.selected !== 'fixed-follow'
    || invalidCameraResult.ok
    || invalidCameraSemantic.ok) {
    throw new Error(`expected Camera source selection to switch fixed follow/free orbit and fail closed, got ${JSON.stringify({ freeOrbitResult, fixedFollowResult, invalidCameraResult, invalidCameraSemantic })}`)
  }
  const cameraResult = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot angle=right-side level=high-angle shot=close-up sensor=65mm lens=85 focus=3.5 aspect=2.39:1' })
  const controlledCamera = readCameraFramingRuntime()
  if (!cameraResult.ok
    || controlledCamera.settings.angle !== 'right-side'
    || controlledCamera.settings.level !== 'high-angle'
    || controlledCamera.settings.shot !== 'close-up'
    || controlledCamera.settings.sensorId !== '65mm'
    || controlledCamera.settings.focalLengthMm !== 85
    || controlledCamera.settings.focusDistanceMeters !== 3.5
    || controlledCamera.settings.aspectRatio !== '2.39:1'
    || useGraphStore.getState().floatingPanelView !== 'camera') {
    throw new Error(`expected Camera MCP invocation to control the shared runtime, got ${JSON.stringify(cameraResult)}`)
  }
  useGraphStore.setState({
    markdownDocumentName: 'Shoot scene.md',
    markdownDocumentText: '# Shoot scene',
    graphData,
    selectedNodeId: 'actor-a',
    canvasRenderMode: '2d',
    canvas3dMode: '3d',
    bottomSurfaceTab: 'gitGraph',
    bottomSurfaceCollapsed: true,
  } as never)
  const animateResult = controlLocalCamera({ invocation: '/camera.animate @selected-actor #camera-motion rig=crane time=3.25 shot=medium sensor=super-16 lens=16 focus=1.8 aspect=4:3' })
  const animatedState = useGraphStore.getState()
  const animatedRuntime = readXrMotionReferenceRuntime()
  if (!animateResult.ok
    || animateResult.action !== 'animate'
    || animatedRuntime.plan.camera.at(-1)?.timeSeconds !== 3.25
    || animatedRuntime.plan.camera.at(-1)?.anchorId !== 'actor-a'
    || animatedRuntime.plan.camera.at(-1)?.rig !== 'crane'
    || animatedRuntime.plan.camera.at(-1)?.settings.sensorId !== 'super-16'
    || animatedRuntime.plan.camera.at(-1)?.settings.focalLengthMm !== 16
    || animatedRuntime.plan.camera.at(-1)?.settings.focusDistanceMeters !== 1.8
    || animatedRuntime.plan.camera.at(-1)?.settings.aspectRatio !== '4:3'
    || animatedState.canvasRenderMode !== '3d'
    || animatedState.canvas3dMode !== 'xr'
    || animatedState.bottomSurfaceTab !== 'timeline'
    || animatedState.bottomSurfaceCollapsed !== false
    || !animatedState.graphData?.metadata?.[XR_MOTION_REFERENCE_GRAPH_METADATA_KEY]) {
    throw new Error(`expected /camera.animate to persist and reveal BottomPanel XR choreography, got ${JSON.stringify(animateResult)}`)
  }
  const moveResult = controlLocalCamera({ invocation: '/camera.animate @selected-actor #camera-motion move=orbit-clockwise time=0.5 duration=2' })
  const moveMarks = readXrMotionReferenceRuntime().plan.camera.filter(mark => mark.moveId === 'orbit-clockwise')
  if (!moveResult.ok
    || moveResult.action !== 'animate'
    || moveMarks.length !== 2
    || moveMarks.some(mark => mark.anchorId !== 'actor-a' || mark.rig !== 'dolly')
    || moveMarks[0]?.timeSeconds !== 0.5
    || moveMarks[1]?.timeSeconds !== 2.5
    || useGraphStore.getState().bottomSurfaceTab !== 'timeline') {
    throw new Error(`expected /camera.animate move= to author a subject-bound preset in the canonical Timeline, got ${JSON.stringify(moveResult)}`)
  }
  const scrubResult = controlLocalCamera({ invocation: '/camera.scrub @camera #camera-motion time=1.5' })
  const playResult = controlLocalCamera({ invocation: '/camera.play @camera #camera-motion state=play' })
  const playbackCameraInspection = inspectLocalCamera()
  const playbackFramingRevision = readCameraFramingRuntime().revision
  const frameDuringPlaybackResult = controlLocalCamera({ action: 'frame', targetId: 'actor-a', shot: 'wide' })
  const pauseResult = controlLocalCamera({ invocation: '/camera.play @camera #camera-motion state=pause' })
  const legacyCameraResult = controlLocalCamera({ invocation: '/camera.frame @camera #right-side #high-angle #close-up #85mm' })
  const wrongSemanticResult = controlLocalCamera({ invocation: '/camera.animate @selected-actor #camera-shot rig=crane time=1' })
  const unknownPairResult = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot angle=front foo=bar' })
  const invalidAngleResult = controlLocalCamera({ invocation: '/camera.frame @camera #camera-shot angle=garbage' })
  const invalidPlaybackResult = controlLocalCamera({ invocation: '/camera.play @camera #camera-motion state=banana' })
  const invalidScrubResult = controlLocalCamera({ invocation: '/camera.scrub @camera #camera-motion time=banana' })
  const invalidMoveResult = controlLocalCamera({ invocation: '/camera.animate @selected-actor #camera-motion move=teleport time=1 duration=2' })
  const invalidStructuredAngle = controlLocalCamera({ action: 'frame', targetId: 'camera', angle: 'garbage' as never })
  const invalidStructuredLens = controlLocalCamera({ action: 'frame', targetId: 'camera', focalLengthMm: 999 })
  const invalidStructuredSensor = controlLocalCamera({ action: 'frame', targetId: 'camera', sensorId: 'imax' as never })
  const invalidStructuredFocus = controlLocalCamera({ action: 'frame', targetId: 'camera', focusDistanceMeters: 0 })
  const invalidStructuredAspect = controlLocalCamera({ action: 'frame', targetId: 'camera', aspectRatio: 'cinemascope' as never })
  const missingStructuredTarget = controlLocalCamera({ action: 'frame', targetId: 'missing-cast' })
  const missingStructuredScrubTime = controlLocalCamera({ action: 'scrub', targetId: 'camera' })
  if (!scrubResult.ok
    || !playResult.ok
    || playbackCameraInspection.source.effectiveOwner !== 'timeline-playback'
    || !pauseResult.ok
    || frameDuringPlaybackResult.ok
    || readCameraFramingRuntime().revision !== playbackFramingRevision
    || legacyCameraResult.ok
    || wrongSemanticResult.ok
    || unknownPairResult.ok
    || invalidAngleResult.ok
    || invalidPlaybackResult.ok
    || invalidScrubResult.ok
    || invalidMoveResult.ok
    || invalidStructuredAngle.ok
    || invalidStructuredLens.ok
    || invalidStructuredSensor.ok
    || invalidStructuredFocus.ok
    || invalidStructuredAspect.ok
    || missingStructuredTarget.ok
    || missingStructuredScrubTime.ok
    || readXrMotionReferenceRuntime().playheadSeconds !== 1.5
    || useGraphStore.getState().timelineTransportPosition !== 1.5 / 60
    || useGraphStore.getState().timelineTransportPlaying !== false) {
    throw new Error(`expected Camera scrub/play/pause invocations to control the shared Timeline runtime, got ${JSON.stringify({ scrubResult, playResult, pauseResult })}`)
  }
  const cameraInspection = inspectLocalCamera()
  if (!cameraInspection.invocationGrammar
    || cameraInspection.invocationGrammar.select !== '/camera.select @camera #camera camera=fixed-follow|free-orbit'
    || cameraInspection.source.selected !== 'fixed-follow'
    || cameraInspection.source.effectiveOwner !== 'fixed-follow'
    || cameraInspection.optics.stateOwner !== 'FloatingPanel.Camera'
    || cameraInspection.optics.timelineRole !== 'keyframe-projection'
    || cameraInspection.optics.sensors.length !== 4) {
    throw new Error('expected Camera inspection to expose grammar plus one Camera-owned optics model while the upstream catalog is hydrated')
  }
  const originalUpdateGraphMetadata = useGraphStore.getState().updateGraphMetadata
  const planBeforeFailedWrite = JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan))
  const framingBeforeFailedWrite = readCameraFramingRuntime()
  let failedWriteResult: ReturnType<typeof controlLocalCamera>
  useGraphStore.setState({ updateGraphMetadata: () => undefined } as never)
  try {
    failedWriteResult = controlLocalCamera({ action: 'animate', targetId: 'actor-a', rig: 'dolly', timeSeconds: 4.75, shot: 'wide' })
  } finally {
    useGraphStore.setState({ updateGraphMetadata: originalUpdateGraphMetadata } as never)
  }
  if (failedWriteResult!.ok
    || JSON.stringify(serializeXrMotionReferencePlan(readXrMotionReferenceRuntime().plan)) !== planBeforeFailedWrite
    || readCameraFramingRuntime().revision !== framingBeforeFailedWrite.revision) {
    throw new Error('expected a failed Camera metadata write to roll back choreography without publishing framing')
  }
  let fillIndex = 0
  while (readXrMotionReferenceRuntime().plan.camera.length < XR_MOTION_REFERENCE_MAX_CAMERA_MARKS && fillIndex < 100) {
    setXrMotionReferenceCameraMark({
      timeSeconds: Number((0.017 + fillIndex * 0.173).toFixed(3)),
      anchorId: 'actor-a',
      rig: 'dolly',
      settings: readCameraFramingRuntime().settings,
    })
    fillIndex += 1
  }
  const capacityPlan = readXrMotionReferenceRuntime().plan
  const capacityFraming = readCameraFramingRuntime()
  const capacityResult = controlLocalCamera({ invocation: '/camera.animate @selected-actor #camera-motion rig=crane time=5.99 shot=wide lens=24' })
  if (capacityResult.ok
    || capacityPlan.camera.length !== XR_MOTION_REFERENCE_MAX_CAMERA_MARKS
    || readXrMotionReferenceRuntime().plan.camera.length !== XR_MOTION_REFERENCE_MAX_CAMERA_MARKS
    || readXrMotionReferenceRuntime().plan.camera.some(mark => Math.abs(mark.timeSeconds - 5.99) < 0.0005)
    || readCameraFramingRuntime().revision !== capacityFraming.revision) {
    throw new Error('expected a full Camera track to fail closed without a false-success mark or framing mutation')
  }
  publishCameraFramingRuntime({ anchorId: 'actor-a', settings: { ...readCameraFramingRuntime().settings, shot: 'wide' }, source: 'panel' })
  const previousFramingDocumentKey = readCameraFramingRuntimeDocumentKey()
  useGraphStore.setState({
    markdownDocumentName: 'Second scene.md',
    markdownDocumentText: '# Second scene',
    graphData: { type: 'Graph', nodes: [{ id: 'actor-b', label: 'Second lead', type: 'Person', properties: {} }], edges: [], metadata: {} },
    selectedNodeId: 'actor-b',
  } as never)
  hydrateCanonicalXrMotionReferenceRuntime()
  if (readCameraFramingRuntimeDocumentKey() === previousFramingDocumentKey
    || readCameraFramingRuntime().anchorId !== 'canvas-camera'
    || readCameraFramingRuntime().source !== 'document'
    || readXrMotionReferenceRuntime().plan.camera.length !== 0) {
    throw new Error('expected an app-root document switch to clear stale Camera framing and choreography before a closed panel can reapply it')
  }
  try {
    assertPinnedCameraDictionaryForTest()
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
  registerAgenticOsRemoteGrammarCatalogEntries([{ token: '/camera.select', kind: 'semantic', sourcePath: 'conflicting-remote-grammar' }])
  if (!controlLocalCamera({ invocation: '/camera.select @camera #camera camera=free-orbit' }).ok) throw new Error('native Camera selection must ignore conflicting remote grammar tokens')
  resetAgenticOsRemoteGrammarCatalogForTests()
  const nativeCameraInspection = inspectLocalCamera()
  if (!nativeCameraInspection.invocationGrammar
    || nativeCameraInspection.invocationGrammar.source !== 'native-knowgrph-invocation-catalog') {
    throw new Error('expected Camera inspection to remain / @ # ready without remote grammar hydration')
  }
  useGraphStore.setState({
    markdownDocumentName: priorGraphState.markdownDocumentName,
    markdownDocumentText: priorGraphState.markdownDocumentText,
    graphData: priorGraphState.graphData,
    canvasRenderMode: priorGraphState.canvasRenderMode,
    canvas3dMode: priorGraphState.canvas3dMode,
    floatingPanelOpen: priorGraphState.floatingPanelOpen,
    floatingPanelView: priorGraphState.floatingPanelView,
    bottomSurfaceTab: priorGraphState.bottomSurfaceTab,
    bottomSurfaceCollapsed: priorGraphState.bottomSurfaceCollapsed,
    timelineTransportDocumentKey: priorGraphState.timelineTransportDocumentKey,
    timelineTransportPosition: priorGraphState.timelineTransportPosition,
    timelineTransportPlaying: priorGraphState.timelineTransportPlaying,
  } as never)
  hydrateCanonicalXrMotionReferenceRuntime()
  publishCameraFramingRuntime({ anchorId: priorCamera.anchorId, settings: priorCamera.settings, source: priorCamera.source })
}
