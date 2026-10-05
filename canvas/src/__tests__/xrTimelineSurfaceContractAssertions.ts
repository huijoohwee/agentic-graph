import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Shared XR timeline source contracts; registered callers retain their original entrypoints.

export function assertXrShootTimelineSurfaceContracts({ retimeSource, choreographyControlsSource, retimeCssSource, timelineSource, timelineChromeSource, ganttTransportSource, timelineRulerSource, timelineRulerCssSource, timelineTimeAxisControlsSource, timelineChromeGanttCssSource }: Record<'retimeSource' | 'choreographyControlsSource' | 'retimeCssSource' | 'timelineSource' | 'timelineChromeSource' | 'ganttTransportSource' | 'timelineRulerSource' | 'timelineRulerCssSource' | 'timelineTimeAxisControlsSource' | 'timelineChromeGanttCssSource', string>) {
  assertSharedScrubProjection(timelineSource)
  for (const marker of ['data-kg-camera-optics-projection="timeline-mark"', 'data-kg-camera-sensor=', 'data-kg-camera-focal-length-mm=', 'data-kg-camera-focus-distance-m=', 'data-kg-camera-aspect-ratio=']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to project Camera-owned optics keyframes through ${marker}`)
  }
  for (const marker of ['XR_CHOREOGRAPHY_EASINGS', 'XR_CHOREOGRAPHY_GAITS', 'data-kg-xr-mark-easing', 'data-kg-xr-mark-gait', 'data-kg-xr-speed-warning', 'showPosition', 'data-kg-xr-mark-position-layout="compact-timeline"', 'XYZ m']) {
    if (!choreographyControlsSource.includes(marker)) throw new Error(`expected shared choreography controls to expose ${marker}`)
  }
  for (const marker of ['xr-camera-motion-retime-lane-label', 'xr-camera-motion-retime-lane-mark', 'position: absolute', 'inset: 0', 'pointer-events: auto', 'top: 50%', 'transform: translate(-50%, -50%)', 'cursor: ew-resize', '.timeline-transport-time-axis-mark', 'height: 44px', 'min-height: 44px', 'width: 24px; height: 24px', 'xr-camera-motion-mark-selection-controls--lane', '--kg-xr-mark-editor-translate-x', '[aria-pressed="true"]', 'xr-shot-target-timeline-bar', 'cursor: grab', 'touch-action: none', 'user-select: none', '[data-kg-timeline-ruler-scrubbing="1"]', 'cursor: grabbing', 'timeline-transport-time-axis-bar', 'xr-camera-motion-mark-animation-presets', '[data-kg-xr-ruler-mark-editor="cast"]', 'flex-wrap: nowrap', 'timeline-transport-clip-controls', 'xr-timeline-scene-stage-select', 'xr-timeline-scene-selection-label', '[data-kg-gantt-timeline-track-row-key*="xr_stage_scene"].timeline-transport-track-clip--selected .timeline-transport-track-clip-label', 'visibility: hidden']) {
    if (!retimeCssSource.includes(marker)) throw new Error(`expected cast and Camera marks to use dedicated shared-scale lanes through ${marker}`)
  }
  if (retimeCssSource.includes('data-kg-xr-shot-target-selected')) {
    throw new Error('expected XR timeline selection to avoid the stale parent selected-lane variant')
  }
  for (const marker of ['<CameraMotionMarkRetime', 'layout="lane"', 'laneTarget={{ kind:', 'timelineInsertedLanes={buildXrTimelineInsertedLanes(', "insertAfterLaneId: 'scene'", 'includeChoreographyCues: false', '<TimelineTransportTimeAxisClip', 'data-kg-xr-choreography-shared-axis-rail', 'data-kg-xr-timeline-control-lane="scene-clip"', 'data-kg-xr-choreography-cast-lane-label', 'data-kg-xr-choreography-camera-lane-label', 'data-kg-xr-timeline-control-bar="scene-clip"', 'data-kg-xr-timeline-shot-target="scene-clip"', 'aria-label="XR timeline scene or 3D object shot target"', 'renderXrSceneStageClipOverlay', "args.span.rowKey.includes('xr_stage_scene')", "selectedTimelineLaneId !== 'scene'", 'data-kg-xr-motion-scene-controls="click-appear"', 'data-kg-xr-motion-scene-control-strip="click-appear"', 'className="timeline-transport-clip-controls xr-timeline-scene-stage-control"', 'style={sceneEditorStyle}', 'renderClipOverlay={renderXrSceneStageClipOverlay}', 'data-kg-xr-motion-stage-field="scene-clip"', '<PanelSelect', 'className="xr-timeline-scene-stage-select"', 'data-kg-xr-motion-stage-select="scene-clip"', 'data-kg-xr-motion-stage-select-lane="scene"', 'onValueChange={selectedValueInput => applyStage(selectedValueInput)}', '<option key={preset.id} value={preset.id}>', 'data-kg-xr-motion-stage-summary="scene-clip"', 'xr-timeline-scene-stage-summary-chip', 'XR_MOTION_REFERENCE_STAGE_PRESETS.map(preset => (', "state.setBottomSurfaceTab('timeline')", 'window.requestAnimationFrame(keepTimelineOpen)', 'type XrTimelineLaneSelection', 'data-kg-xr-timeline-lane-drag="scrub"', 'data-kg-video-sequence-ruler-scrub-intent="drag"', 'Drag to scrub XR timeline', 'useXrTimelineLaneSelection', 'selectedTimelineLaneId', 'setSelectedTimelineLaneId', 'selectSceneTimelineLane', 'selectObjectTimelineLane', 'selectSimulationTimelineLane', 'selectCameraTimelineLane', 'selected: simulationTimelineLaneSelected', 'selected: cameraTimelineLaneSelected', "selectRowKey: 'xr-lane:simulation'", 'selectRowKey: `xr-lane:object:${target.id}`', "selectRowKey: 'xr-lane:camera'", "simulationTimelineLaneSelected && 'timeline-transport-track-clip--selected'", "selected && 'timeline-transport-track-clip--selected'", "cameraTimelineLaneSelected && 'timeline-transport-track-clip--selected'", 'data-kg-xr-timeline-lane-affordance="simulation"', 'data-kg-xr-timeline-lane-affordance="camera"', 'data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ?', 'data-kg-xr-timeline-lane-hit-target="simulation"', 'data-kg-xr-timeline-lane-hit-target="camera"', 'data-kg-xr-shot-target-lane', 'data-kg-xr-shot-target-bar', 'data-kg-xr-camera-lane-bar="1"', 'onSelectedRowKeyChange', 'onClickCapture', '[data-kg-gantt-timeline-track-row-key*="xr_stage_scene"]', 'XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID', 'data-kg-xr-timeline-playhead-control="scene-clip"', 'data-kg-xr-timeline-playhead-input="scene-clip"', 'aria-label="XR timeline playhead seconds"', 'data-kg-xr-timeline-seconds-control="time-axis"', 'aria-label="XR timeline seconds"', 'data-kg-xr-timeline-fps-control="time-axis"', 'aria-label="XR timeline FPS"', 'resolveVideoSequenceRulerInsetLeft', 'resolveVideoSequenceTimelineScaleDurationSeconds', 'runtimeDurationSeconds={runtime.plan.durationSeconds}', 'runtimeFrameRate={runtime.plan.fps}', 'data-kg-xr-timeline-transport="reused-gantt-player"', '<GanttTimelineTransportPanel', 'timeAxisControls={']) {
    if (!timelineSource.includes(marker)) throw new Error(`expected BottomPanel Timeline to own consolidated XR motion through ${marker}`)
  }
  for (const forbiddenPresetLane of ['compatibleSharedAssetPresets.map(preset => {', 'data-kg-xr-shared-asset-preset-lane={preset.id}', 'data-kg-xr-shared-asset-preset-lane-label={preset.id}', "id: `xr-preset:${preset.id}`"]) {
    if (timelineSource.includes(forbiddenPresetLane)) throw new Error(`expected XR animation presets to stay tied to individual XR asset lanes, found ${forbiddenPresetLane}`)
  }
  for (const forbidden of ['layout="controls"', 'layout="ruler"', 'layout="time-axis"', 'supplementalLanes={', "id: 'xr-control'", "id: 'xr-asset-control'", 'stage-output', 'selectedStagePreset', 'activeStagePreset', 'sceneStagePickerOpen', 'applySceneClipStage', 'SCENE · {', 'data-kg-xr-motion-stage-options="scene-clip"', 'data-kg-xr-motion-stage-option={preset.id}', 'aria-haspopup="listbox"', 'data-kg-xr-motion-scene-controls="compact"', 'data-kg-xr-motion-scene-controls="expanded"', 'data-kg-xr-motion-scene-control-row=', 'xr-timeline-scene-stage-row', 'xr-timeline-scene-stage-button', 'xr-timeline-scene-stage-options', 'xr-timeline-scene-stage-option', 'data-kg-xr-timeline-shot-target="individual-lane"', 'data-kg-xr-timeline-consolidated-lane="stage-output-ruler"', 'data-kg-xr-motion-stage-buttons="1"', 'data-kg-xr-motion-stage-button={preset.id}', 'data-kg-xr-motion-stage-select="1"', 'data-kg-xr-motion-stage-field="1"', 'data-kg-xr-timeline-playhead-control="1"', 'data-kg-xr-motion-stage-summary="1"', 'data-kg-xr-timeline-control-bar="marks"', 'timeRulerOverlay={<CameraMotionMarkRetime', '--kg-xr-timeline-marks-height', '>Marks</span>', 'data-kg-xr-timeline-control-lane="shared-asset"', 'data-kg-xr-timeline-control-lane-label="shared-asset"', '<XrSharedAssetControls surface="timeline"', 'data-kg-xr-shared-asset-layout="timeline-lane"', 'aria-label="Shared XR asset lane actions"']) {
    if (timelineSource.includes(forbidden)) throw new Error(`expected BottomPanel Timeline to remove the duplicate marks lane, found ${forbidden}`)
  }
  if (timelineSource.indexOf('<CameraMotionMarkRetime') < timelineSource.indexOf('<GanttTimelineTransportPanel')) {
    throw new Error('expected XR Stage/Output and mark retiming to live inside the Gantt transport lane')
  }
  for (const marker of ['timeline-transport-supplemental-lanes', 'TimelineTransportInlineClip', 'TimelineTransportTimeAxisClip', 'TimelineTransportTimeAxisMark', 'timeline-transport-track-clip--lane-${laneStyle}', 'timeline-transport-track-clip-label', 'timeline-transport-time-axis-clip', 'timeline-transport-time-axis-mark']) {
    if (!timelineChromeSource.includes(marker)) throw new Error(`expected shared Gantt clip UI reuse through ${marker}`)
  }
  if (!ganttTransportSource.includes('supplementalLanes') || !ganttTransportSource.includes('timeAxisControls') || !ganttTransportSource.includes('timeRulerOverlay') || !ganttTransportSource.includes('timelineInsertedLanes') || !ganttTransportSource.includes('renderClipOverlay')) {
    throw new Error('expected the shared Gantt transport to own supplemental-lane, time-axis, ruler-overlay, inserted-lane, and clip-overlay slots')
  }
  for (const marker of ['selected?: boolean', 'renderClipOverlay?: VideoSequenceTimelineClipOverlayRenderer', 'const clipOverlay = renderClipOverlay?.({', '{clipOverlay}', 'timeAxisControls?: React.ReactNode', 'timeRulerOverlay?: React.ReactNode', 'timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]', '<VideoSequenceTimeAxisControls>{timeAxisControls}</VideoSequenceTimeAxisControls>', '{timeRulerOverlay}', 'buildVideoSequenceTimelineLaneOrder(visibleLanes, timelineInsertedLanes)', 'data-kg-video-sequence-inserted-lane-content', 'data-kg-video-sequence-lane-selected={insertedSelected ?', 'data-kg-video-sequence-inserted-lane-row-selection={inserted && insertedSelected ?', 'timeline-video-sequence-lane-label--selected', 'timeline-video-sequence-lane-row--selected', 'aria-current={insertedSelected ?']) {
    if (!timelineRulerSource.includes(marker)) throw new Error(`expected the shared time ruler to expose ${marker}`)
  }
  for (const marker of ['.timeline-video-sequence-lane-label[data-kg-video-sequence-lane-selected="1"]', '.timeline-video-sequence-lane-row[data-kg-video-sequence-lane-selected="1"]', 'inset 2px 0 0 var(--kg-canvas-accent, #2563eb)', 'inset -2px 0 0 var(--kg-canvas-accent, #2563eb)', 'inset 0 2px 0 var(--kg-canvas-accent, #2563eb)', 'inset 0 -2px 0 var(--kg-canvas-accent, #2563eb)']) {
    if (!timelineRulerCssSource.includes(marker)) throw new Error(`expected selected timeline lanes to draw a row-wide border through ${marker}`)
  }
  for (const forbiddenSelectedBorder of ['border-left: 2px solid var(--kg-canvas-accent, #2563eb)', 'border-right: 2px solid var(--kg-canvas-accent, #2563eb)', 'border-top: 2px solid var(--kg-canvas-accent, #2563eb)', 'border-bottom: 2px solid var(--kg-canvas-accent, #2563eb)']) {
    if (timelineRulerCssSource.includes(forbiddenSelectedBorder)) throw new Error(`expected selected timeline lanes to avoid size-changing physical borders, found ${forbiddenSelectedBorder}`)
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
  for (const marker of ['resolveVideoSequenceRulerInsetLeft', 'resolveVideoSequenceRulerPosition', 'resolveVideoSequenceTimelineScaleDurationSeconds', 'data-kg-xr-timeline-retime-scale-seconds']) {
    if (!retimeSource.includes(marker)) throw new Error(`expected mark retiming to share ruler geometry through ${marker}`)
  }
}

export function assertXrPanelTimelineSurfaceContracts({ timelineBottomPanel, cameraFloatingProjection, xrCameraMotion }: Record<'timelineBottomPanel' | 'cameraFloatingProjection' | 'xrCameraMotion', string>) {
  assertSharedScrubProjection(xrCameraMotion)
  for (const marker of ['XrCameraMotionSection', 'canvas3dMode']) {
    if (!timelineBottomPanel.includes(marker)) throw new Error(`expected BottomPanel Timeline to own XR motion through ${marker}`)
  }
  for (const marker of ['<StrybldrCameraFramingSection />', '<XrShootCameraSection />']) {
    if (!cameraFloatingProjection.includes(marker)) throw new Error(`expected FloatingPanel Camera to expose ${marker}`)
  }
  if (cameraFloatingProjection.includes('<XrCameraMotionSection')) {
    throw new Error('expected FloatingPanel Camera to leave XR motion and transport in BottomPanel Timeline')
  }
  for (const marker of ['data-kg-xr-timeline-player="1"', 'data-kg-xr-timeline-player-controls="1"', 'data-kg-xr-timeline-control-lane="scene-clip"', 'data-kg-xr-timeline-control-bar="scene-clip"', 'data-kg-xr-timeline-shot-target="scene-clip"', 'aria-label="XR timeline scene or 3D object shot target"', 'renderXrSceneStageClipOverlay', "selectedTimelineLaneId !== 'scene'", 'data-kg-xr-motion-scene-controls="click-appear"', 'data-kg-xr-motion-scene-control-strip="click-appear"', 'className="timeline-transport-clip-controls xr-timeline-scene-stage-control"', 'style={sceneEditorStyle}', 'renderClipOverlay={renderXrSceneStageClipOverlay}', 'data-kg-xr-motion-stage-field="scene-clip"', '<PanelSelect', 'className="xr-timeline-scene-stage-select"', 'data-kg-xr-motion-stage-select="scene-clip"', 'data-kg-xr-motion-stage-select-lane="scene"', 'onValueChange={selectedValueInput => applyStage(selectedValueInput)}', '<option key={preset.id} value={preset.id}>', 'data-kg-xr-motion-stage-summary="scene-clip"', 'xr-timeline-scene-stage-summary-chip', 'XR_MOTION_REFERENCE_STAGE_PRESETS.map(preset => (', 'type XrTimelineLaneSelection', 'data-kg-xr-timeline-lane-drag="scrub"', 'data-kg-video-sequence-ruler-scrub-intent="drag"', 'useXrTimelineLaneSelection', 'selectedTimelineLaneId', 'setSelectedTimelineLaneId', 'selectSceneTimelineLane', 'selectObjectTimelineLane', 'selectSimulationTimelineLane', 'selectCameraTimelineLane', 'selected: simulationTimelineLaneSelected', 'selected: cameraTimelineLaneSelected', "selectRowKey: 'xr-lane:simulation'", 'selectRowKey: `xr-lane:object:${target.id}`', "selectRowKey: 'xr-lane:camera'", "simulationTimelineLaneSelected && 'timeline-transport-track-clip--selected'", "selected && 'timeline-transport-track-clip--selected'", "cameraTimelineLaneSelected && 'timeline-transport-track-clip--selected'", 'data-kg-xr-timeline-lane-affordance="simulation"', 'data-kg-xr-timeline-lane-affordance="camera"', 'data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ?', 'data-kg-xr-timeline-lane-hit-target="simulation"', 'data-kg-xr-timeline-lane-hit-target="camera"', 'data-kg-xr-shot-target-lane', 'data-kg-xr-shot-target-bar', 'data-kg-xr-simulation-lane-label="1"', 'data-kg-xr-simulation-lane="1"', 'data-kg-xr-simulation-bar="full-scene"', 'openSimulationWorkbench', 'data-kg-xr-camera-lane-bar="1"', 'data-kg-xr-timeline-playhead-control="scene-clip"', 'data-kg-xr-timeline-playhead-input="scene-clip"', 'aria-label="XR timeline playhead seconds"', 'data-kg-xr-timeline-seconds-control="time-axis"', 'aria-label="XR timeline seconds"', 'data-kg-xr-timeline-fps-control="time-axis"', 'aria-label="XR timeline FPS"', '<TimelineTransportTimeAxisClip', '<CameraMotionMarkRetime', 'layout="lane"', '<GanttTimelineTransportPanel', 'timelineInsertedLanes={buildXrTimelineInsertedLanes(', 'timeAxisControls={', 'data-kg-xr-choreography-shared-axis-rail="camera"', 'data-kg-xr-timeline-transport="reused-gantt-player"']) {
    if (!xrCameraMotion.includes(marker)) throw new Error(`expected BottomPanel XR Timeline to expose ${marker}`)
  }
  for (const forbiddenPresetLane of ['compatibleSharedAssetPresets.map(preset => {', 'data-kg-xr-shared-asset-preset-lane={preset.id}', 'data-kg-xr-shared-asset-preset-lane-label={preset.id}', "id: `xr-preset:${preset.id}`"]) {
    if (xrCameraMotion.includes(forbiddenPresetLane)) throw new Error(`expected XR animation presets to stay tied to individual XR asset lanes, found ${forbiddenPresetLane}`)
  }
  for (const forbidden of ['supplementalLanes={', "id: 'xr-control'", "id: 'xr-asset-control'", 'stage-output', 'selectedStagePreset', 'activeStagePreset', 'sceneStagePickerOpen', 'applySceneClipStage', 'SCENE · {', 'data-kg-xr-motion-stage-options="scene-clip"', 'data-kg-xr-motion-stage-option={preset.id}', 'aria-haspopup="listbox"', 'data-kg-xr-motion-scene-controls="compact"', 'data-kg-xr-motion-scene-controls="expanded"', 'data-kg-xr-motion-scene-control-row=', 'xr-timeline-scene-stage-row', 'xr-timeline-scene-stage-button', 'xr-timeline-scene-stage-options', 'xr-timeline-scene-stage-option', 'data-kg-xr-timeline-shot-target="individual-lane"', 'data-kg-xr-timeline-consolidated-lane="stage-output-ruler"', 'data-kg-xr-motion-stage-buttons="1"', 'data-kg-xr-motion-stage-button={preset.id}', 'data-kg-xr-motion-stage-select="1"', 'data-kg-xr-motion-stage-field="1"', 'data-kg-xr-timeline-playhead-control="1"', 'data-kg-xr-motion-stage-summary="1"', 'data-kg-xr-timeline-control-lane="shared-asset"', 'data-kg-xr-timeline-control-lane-label="shared-asset"', '<XrSharedAssetControls surface="timeline"', 'data-kg-xr-shared-asset-layout="timeline-lane"']) {
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
}

function assertSharedScrubProjection(projection: string) {
  const shared = readFileSync(resolve(process.cwd(), 'src/features/gitgraph/useGanttTimelineInteractions.ts'), 'utf8')
  for (const marker of ['data-kg-video-sequence-ruler-scrub-target="1"', 'data-kg-video-sequence-ruler-scrub-intent="drag"', 'data-kg-video-sequence-ruler-scrub-row-key={selectRowKey}']) {
    if (!projection.includes(marker)) throw new Error(`expected XR lanes to project the shared ruler gesture through ${marker}`)
  }
  for (const removed of ['XrTimelineLaneBarDragState', 'XR_TIMELINE_LANE_DRAG_THRESHOLD_PX', 'beginTimelineLaneBarDrag', 'beginTimelineLaneBarMouseDrag', 'activateTimelineLaneBarClick', 'onLaneSurfacePointerDown', 'onLaneSurfaceMouseDown']) {
    if (projection.includes(removed)) throw new Error(`expected XR projection to remove the competing drag owner ${removed}`)
  }
  for (const marker of ['resolveMermaidGanttBarDragCommitted', 'resolveVideoSequenceRulerPosition', 'scrubAuthorityCurrent', 'rulerScrubRef']) {
    if (!shared.includes(marker)) throw new Error(`expected one source-fenced ruler scrub owner through ${marker}`)
  }
}
